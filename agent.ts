import { AIChatAgent } from "agents/ai-chat-agent";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, tool } from "ai";
import { z } from "zod";
import type { Env } from "./index";

interface ReviewSession {
  language: string | null;
  totalReviews: number;
  lastReviewedAt: string | null;
  reviewHistory: Array<{
    timestamp: string;
    language: string;
    summary: string;
  }>;
}

const SYSTEM_PROMPT = `You are an expert AI code reviewer called "CodeSense". You help developers write better, cleaner, and more efficient code.

When a user shares code with you, you should:
1. **Identify the language** if not specified
2. **Review for bugs** — logic errors, off-by-ones, null/undefined issues, race conditions
3. **Review for security** — injection risks, insecure dependencies, exposed secrets, improper auth
4. **Review for performance** — O(n²) loops, unnecessary re-renders, memory leaks, blocking calls
5. **Review for readability** — naming, structure, comments, complexity
6. **Give a severity score** per issue: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
7. **Provide a corrected version** of the code with fixes applied

Format your reviews clearly with sections:
- 📋 **Overview** (language, what the code does)
- 🐛 **Issues Found** (bulleted, with severity)
- ✅ **Fixed Code** (full corrected snippet in a code block)
- 💡 **Tips** (best practices and suggestions)

Be constructive and educational. Explain *why* something is an issue, not just that it is.
Keep state in mind — if the user shares follow-up code, remember context from earlier in the conversation.`;

export class CodeReviewAgent extends AIChatAgent<Env, ReviewSession> {
  initialState: ReviewSession = {
    language: null,
    totalReviews: 0,
    lastReviewedAt: null,
    reviewHistory: [],
  };

  async onChatMessage(
    onFinish: (text: string) => void
  ): Promise<Response | undefined> {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    const model = workersAI("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

    const tools = {
      updateReviewStats: tool({
        description:
          "Call this after completing a code review to log stats into persistent state.",
        parameters: z.object({
          language: z.string().describe("The programming language reviewed"),
          summary: z.string().describe("One-sentence summary of the review"),
        }),
        execute: async ({ language, summary }) => {
          const now = new Date().toISOString();
          const history = this.state.reviewHistory ?? [];
          history.push({ timestamp: now, language, summary });
          // Keep only last 20 reviews in state
          if (history.length > 20) history.shift();
          this.setState({
            language,
            totalReviews: (this.state.totalReviews ?? 0) + 1,
            lastReviewedAt: now,
            reviewHistory: history,
          });
          return `Stats updated. Total reviews: ${this.state.totalReviews + 1}`;
        },
      }),

      getSessionStats: tool({
        description:
          "Returns the current session statistics — total reviews done, languages seen, history.",
        parameters: z.object({}),
        execute: async () => {
          return JSON.stringify({
            totalReviews: this.state.totalReviews ?? 0,
            lastLanguage: this.state.language ?? "none yet",
            lastReviewedAt: this.state.lastReviewedAt ?? "never",
            recentHistory: (this.state.reviewHistory ?? []).slice(-5),
          });
        },
      }),
    };

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: convertToModelMessages(this.messages),
      tools,
      maxSteps: 5,
      onFinish: async ({ text }) => {
        onFinish(text);
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
