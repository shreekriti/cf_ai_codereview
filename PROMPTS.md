# PROMPTS.md — AI prompts used during development

This file is included because the Cloudflare internship assignment explicitly asks candidates to document AI-assisted prompts used during development.

## 1. Initial scaffold prompt used in Claude

> Build a complete Cloudflare AI-powered code reviewer app. Requirements:
> - LLM: Llama 3.3 70B via Workers AI
> - State/memory: Durable Objects using the Agents SDK (`AIChatAgent`)
> - User input: WebSocket + streaming chat UI
> - Tools: `updateReviewStats` (persist review count/language) and `getSessionStats`
> - Frontend: single HTML file with a split-panel editor + chat UI
> Include wrangler.toml, tsconfig.json, package.json, src/index.ts, src/agent.ts, public/index.html

## 2. System prompt for the code review model

**Used in:** `src/agent.ts`

> You are CodeSense, an expert AI code reviewer running on Cloudflare.
> Review code for correctness, security, performance, and maintainability.
> Use these sections in order:
> # Overview
> # Issues Found
> # Fixed Code
> # Next Steps
> Use severity labels: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low.
> Be constructive and specific.
> Use prior session context for follow-up questions.

## 4. UI prompt

> Design a dark code-editor style single-page UI for an AI code reviewer.
> Left side: code editor with line numbers and example chips.
> Right side: chat / review output.
> Show session stats and keep styling clean enough for a recruiter review.
