# PROMPTS.md — AI Prompts Used During Development

This file documents the AI prompts used during the development of `cf_ai_codereview`
---

## 1. Project Scaffolding Prompt


**Prompt:**
> Build a complete Cloudflare AI-powered code reviewer app. Requirements:
> - LLM: Llama 3.3 70B via Workers AI
> - State/memory: Durable Objects using the Agents SDK (`AIChatAgent`)
> - User input: WebSocket + streaming chat UI
> - Tools: `updateReviewStats` (persist review count/language) and `getSessionStats`
> - Frontend: single HTML file with a split-panel editor + chat UI
> Include wrangler.toml, tsconfig.json, package.json, src/index.ts, src/agent.ts, public/index.html

---

## 2. System Prompt for the Code Review Agent

**Used in:** `src/agent.ts` — `SYSTEM_PROMPT` constant

**Prompt (written manually, refined with Claude):**
> You are an expert AI code reviewer called "CodeSense". When a user shares code:
> 1. Identify the language
> 2. Review for bugs (logic errors, null issues, race conditions)
> 3. Review for security (injection, secrets, auth)
> 4. Review for performance (O(n²), memory leaks, blocking)
> 5. Review for readability (naming, structure, complexity)
> 6. Give severity scores: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
> 7. Provide a corrected version
>
> Format with: Overview, Issues Found, Fixed Code, Tips.

---

## 3. Frontend UI Design Prompt

**Prompt:**
> Design a dark terminal/code-editor aesthetic UI for the code reviewer app. Use:
> - JetBrains Mono for code areas
> - Syne for headings
> - Dark background (#0d0f14), neon green accent (#4fffb0), cyan accent (#00d4ff)
> - Split panel: left = code textarea with line numbers, right = streaming chat
> - Inline markdown rendering for AI responses (code blocks, bold, headings)
> - Session stats strip showing total reviews and last language
> - Example snippet chips on welcome screen

---

## 4. Markdown Renderer Prompt

**Prompt:**
> Write a lightweight `markdownToHTML` function in vanilla JS that handles:
> - Fenced code blocks with language hints
> - Inline code
> - Bold (`**text**`)
> - Headings (h1/h2/h3)
> - Unordered and ordered lists
> - Horizontal rules
> - Paragraph wrapping
> No external libraries — must be safe to use with `innerHTML` (escape HTML first).

---

## 5. Streaming Response Parsing Prompt

**Prompt:**
> How do I parse streaming responses from the Vercel AI SDK's `toUIMessageStreamResponse()` in a vanilla JS frontend? Specifically, how do I read the `0:` text delta lines and `d:` done signal from a `fetch()` ReadableStream?

---

## 6. Durable Object State Typing Prompt

**Prompt:**
> In the Cloudflare Agents SDK `AIChatAgent<Env, State>`, how do I type a custom state interface and use `this.setState()` to persist session stats (total reviews, last language, review history array) across messages in the same Durable Object instance?

---

## 7. Tool Definition Prompt

**Prompt:**
> Using the Vercel AI SDK `tool()` helper with Zod schemas, write two tools for a code review agent:
> 1. `updateReviewStats` — accepts `language: string` and `summary: string`, updates `this.state` on the Durable Object
> 2. `getSessionStats` — no parameters, returns JSON stringified state with totalReviews, lastLanguage, lastReviewedAt, recentHistory
