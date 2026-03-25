import { CodeReviewAgent } from "./agent";

export { CodeReviewAgent };

export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  CODE_REVIEW_AGENT: DurableObjectNamespace<CodeReviewAgent>;
}

export interface ReviewRequest {
  code: string;
  language?: string;
  userNote?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getSessionStub(env: Env, sessionId: string) {
  return env.CODE_REVIEW_AGENT.getByName(sessionId);
}

async function proxyToAgent(
  stub: DurableObjectStub<CodeReviewAgent>,
  pathname: string,
  init?: RequestInit,
  sessionId?: string,
): Promise<Response> {
  const url = new URL(`https://agent.internal${pathname}`);
  if (sessionId) url.searchParams.set("session", sessionId);
  return stub.fetch(url.toString(), init);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse({ ok: true, service: "cf_ai_codereview" });
    }

    const sessionMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/(review|chat|stats)$/);
    if (sessionMatch) {
      const [, rawSessionId, action] = sessionMatch;
      const sessionId = decodeURIComponent(rawSessionId);
      const stub = getSessionStub(env, sessionId);

      if (action === "stats" && request.method !== "GET") {
        return jsonResponse({ error: "Use GET for stats." }, 405);
      }

      if ((action === "review" || action === "chat") && request.method !== "POST") {
        return jsonResponse({ error: "Use POST for review and chat." }, 405);
      }

      const body = action === "stats" ? undefined : await request.text();

      return proxyToAgent(
        stub,
        `/${action}`,
        {
          method: request.method,
          headers: {
            "content-type": request.headers.get("content-type") ?? "application/json",
          },
          body,
        },
        sessionId,
      );
    }

    if (request.method === "GET") {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;
