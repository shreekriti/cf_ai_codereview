import { DurableObject } from "cloudflare:workers";
import type { Env, ReviewRequest } from "./index";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
};

export type ReviewHistoryEntry = {
  timestamp: string;
  language: string;
  summary: string;
};

export type ReviewSession = {
  sessionId: string;
  createdAt: string;
  totalReviews: number;
  lastLanguage: string | null;
  lastReviewedAt: string | null;
  lastCodeSnippet: string | null;
  reviewHistory: ReviewHistoryEntry[];
  messages: ChatMessage[];
};

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const STORAGE_KEY = "review-session";
const MAX_HISTORY = 20;
const MAX_MESSAGES = 12;
const MAX_CODE_CHARS = 12000;

const SYSTEM_PROMPT = `You are CodeSense, an expert AI code reviewer running on Cloudflare.

Your job is to help developers review code thoroughly but practically.

Always do the following when reviewing code:
1. Identify the language if it is not provided.
2. Explain what the code appears to do.
3. Look for bugs and correctness issues.
4. Look for security concerns such as injection, unsafe parsing, exposed secrets, auth/session mistakes, SSRF, and insecure defaults.
5. Look for performance and scalability issues.
6. Look for readability and maintainability problems.
7. Assign severity to each issue using one of: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low.
8. Provide a corrected version of the code when it is reasonably possible.
9. End with a short list of practical next steps.

Formatting rules:
- Use these sections in order:
  # Overview
  # Issues Found
  # Fixed Code
  # Next Steps
- Under Issues Found, use bullets.
- If the code is already decent, say so clearly.
- Be specific, not vague.
- Explain why an issue matters.
- Keep follow-up answers aware of the latest reviewed code and prior conversation context.
- When the user asks a follow-up question, answer directly using the stored session context.
`;

function buildFreshSession(sessionId: string): ReviewSession {
  return {
    sessionId,
    createdAt: new Date().toISOString(),
    totalReviews: 0,
    lastLanguage: null,
    lastReviewedAt: null,
    lastCodeSnippet: null,
    reviewHistory: [],
    messages: [],
  };
}

function truncateCode(code: string): string {
  return code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n\n[truncated]` : code;
}

function summariseReply(reply: string): string {
  const firstUsefulLine = reply
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  return (firstUsefulLine ?? "Review completed.").slice(0, 180);
}

function safeJson<T>(value: T, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function extractAIText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (typeof obj.response === "string") return obj.response;
    if (typeof obj.result === "string") return obj.result;
    if (Array.isArray(obj.messages)) {
      return obj.messages
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const candidate = item as Record<string, unknown>;
          return typeof candidate.content === "string" ? candidate.content : "";
        })
        .filter(Boolean)
        .join("\n");
    }
  }

  return "I could not parse the model response. Please try again.";
}

export class CodeReviewAgent extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async loadSession(sessionId: string): Promise<ReviewSession> {
    const existing = await this.ctx.storage.get<ReviewSession>(STORAGE_KEY);
    if (existing) return existing;

    const fresh = buildFreshSession(sessionId);
    await this.ctx.storage.put(STORAGE_KEY, fresh);
    return fresh;
  }

  private async saveSession(session: ReviewSession): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, session);
  }

  private buildRecentConversation(messages: ChatMessage[]) {
    return messages.slice(-MAX_MESSAGES).map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private async runModel(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await this.env.AI.run(MODEL, { messages });
    return extractAIText(response).trim();
  }

  private async handleReview(request: Request, sessionId: string): Promise<Response> {
    let body: ReviewRequest;

    try {
      body = (await request.json()) as ReviewRequest;
    } catch {
      return safeJson({ error: "Invalid JSON body." }, 400);
    }

    const rawCode = body.code?.trim();
    const requestedLanguage = body.language?.trim() || "auto-detect";

    if (!rawCode) {
      return safeJson({ error: "Please provide code to review." }, 400);
    }

    const session = await this.loadSession(sessionId);
    const now = new Date().toISOString();
    const code = truncateCode(rawCode);

    const prompt = [
      `Please review the following code.`,
      `Requested language: ${requestedLanguage}.`,
      body.userNote?.trim() ? `Additional context: ${body.userNote.trim()}` : "",
      "Return a full review using the required section headings.",
      "Code:",
      code,
    ]
      .filter(Boolean)
      .join("\n\n");

    const aiReply = await this.runModel([
      { role: "system", content: SYSTEM_PROMPT },
      ...this.buildRecentConversation(session.messages),
      { role: "user", content: prompt },
    ]);

    const detectedLanguage = requestedLanguage === "auto-detect" ? inferLanguageFromCode(rawCode) : requestedLanguage;
    const summary = summariseReply(aiReply);

    const updated: ReviewSession = {
      ...session,
      totalReviews: session.totalReviews + 1,
      lastLanguage: detectedLanguage,
      lastReviewedAt: now,
      lastCodeSnippet: rawCode,
      reviewHistory: [
        ...session.reviewHistory,
        {
          timestamp: now,
          language: detectedLanguage,
          summary,
        },
      ].slice(-MAX_HISTORY),
      messages: [
        ...session.messages,
        { role: "user", content: prompt, timestamp: now },
        { role: "assistant", content: aiReply, timestamp: now },
      ].slice(-MAX_MESSAGES),
    };

    await this.saveSession(updated);

    return safeJson({
      mode: "review",
      reply: aiReply,
      stats: {
        totalReviews: updated.totalReviews,
        lastLanguage: updated.lastLanguage,
        lastReviewedAt: updated.lastReviewedAt,
        recentHistory: updated.reviewHistory.slice(-5),
      },
    });
  }

  private async handleChat(request: Request, sessionId: string): Promise<Response> {
    let body: { message?: string };

    try {
      body = (await request.json()) as { message?: string };
    } catch {
      return safeJson({ error: "Invalid JSON body." }, 400);
    }

    const message = body.message?.trim();
    if (!message) {
      return safeJson({ error: "Please enter a follow-up message." }, 400);
    }

    const session = await this.loadSession(sessionId);
    const now = new Date().toISOString();

    const codeContext = session.lastCodeSnippet
      ? `Latest reviewed code snippet:\n\n${truncateCode(session.lastCodeSnippet)}`
      : "No code has been reviewed in this session yet.";

    const statsContext = `Session stats: totalReviews=${session.totalReviews}, lastLanguage=${session.lastLanguage ?? "unknown"}, lastReviewedAt=${session.lastReviewedAt ?? "never"}.`;

    const aiReply = await this.runModel([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: codeContext },
      { role: "system", content: statsContext },
      ...this.buildRecentConversation(session.messages),
      { role: "user", content: message },
    ]);

    const updated: ReviewSession = {
      ...session,
      messages: [
        ...session.messages,
        { role: "user", content: message, timestamp: now },
        { role: "assistant", content: aiReply, timestamp: now },
      ].slice(-MAX_MESSAGES),
    };

    await this.saveSession(updated);

    return safeJson({
      mode: "chat",
      reply: aiReply,
      stats: {
        totalReviews: updated.totalReviews,
        lastLanguage: updated.lastLanguage,
        lastReviewedAt: updated.lastReviewedAt,
        recentHistory: updated.reviewHistory.slice(-5),
      },
    });
  }

  private async handleStats(sessionId: string): Promise<Response> {
    const session = await this.loadSession(sessionId);
    return safeJson({
      sessionId: session.sessionId,
      totalReviews: session.totalReviews,
      lastLanguage: session.lastLanguage,
      lastReviewedAt: session.lastReviewedAt,
      createdAt: session.createdAt,
      recentHistory: session.reviewHistory.slice(-5),
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session") ?? "default";

    try {
      if (request.method === "POST" && url.pathname === "/review") {
        return await this.handleReview(request, sessionId);
      }

      if (request.method === "POST" && url.pathname === "/chat") {
        return await this.handleChat(request, sessionId);
      }

      if (request.method === "GET" && url.pathname === "/stats") {
        return await this.handleStats(sessionId);
      }

      return safeJson({ error: "Not found." }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      return safeJson({ error: message }, 500);
    }
  }
}

function inferLanguageFromCode(code: string): string {
  const sample = code.toLowerCase();

  if (sample.includes("function") && sample.includes("console.log")) return "JavaScript";
  if (sample.includes("interface ") || sample.includes(": string") || sample.includes("type ")) return "TypeScript";
  if (sample.includes("def ") || sample.includes("import os") || sample.includes("print(")) return "Python";
  if (sample.includes("public class") || sample.includes("system.out")) return "Java";
  if (sample.includes("select ") || sample.includes("insert into")) return "SQL";
  if (sample.includes("<div") || sample.includes("</html>")) return "HTML";
  if (sample.includes("body {") || sample.includes("display: flex")) return "CSS";

  return "Auto-detected";
}
