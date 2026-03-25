import { routeAgentRequest } from "agents";
import { CodeReviewAgent } from "./agent";

export { CodeReviewAgent };

export interface Env {
  AI: Ai;
  CODE_REVIEW_AGENT: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route WebSocket and agent API requests to the Agents SDK
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    // Serve static assets (the UI) for everything else
    return new Response("Not found", { status: 404 });
  },
};
