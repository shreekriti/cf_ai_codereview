# cf_ai_codereview

An AI-powered code reviewer built entirely on Cloudflare's developer platform.

Paste code into the editor, click **Review Code**, and get back:
- 🐛 **Bug analysis** with severity levels (Critical → Low)
- 🔒 **Security review** (SQLi, XSS, secrets, auth issues)
- ⚡ **Performance suggestions** (algorithmic complexity, memory leaks)
- 📖 **Readability & style** feedback
- ✅ **Fixed version** of your code

You can also ask follow-up questions in the chat panel to dig deeper.

---

## Architecture

| Component | Cloudflare Tech | Purpose |
|---|---|---|
| **LLM** | Workers AI — Llama 3.3 70B | Code analysis, bug detection, fix generation |
| **State / Memory** | Durable Objects (SQLite) | Persists chat history, session review stats, per-agent state |
| **Coordination** | Agents SDK (`AIChatAgent`) | Streaming chat, tool calling, WebSocket management |
| **User Input** | WebSocket + HTTP chat UI | Real-time streaming chat interface |
| **Frontend** | Cloudflare Pages (static assets) | Editor UI served from `public/` |

The agent uses two built-in tools:
- `updateReviewStats` — logs language + summary to persistent DO state after each review
- `getSessionStats` — returns cumulative session data on demand

---

## Running Locally

### Prerequisites

- Node.js ≥ 18
- A Cloudflare account (free tier works)
- Wrangler CLI (`npm i -g wrangler`)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/cf_ai_codereview.git
cd cf_ai_codereview

# 2. Install dependencies
npm install

# 3. Log in to Cloudflare
npx wrangler login

# 4. Start local dev server
npm run dev
```

Then open **http://localhost:8787** in your browser.

> Workers AI runs in the cloud even during local dev — no GPU needed locally.

---

## Deploying to Cloudflare

```bash
npm run deploy
```

Wrangler will output a live URL like `https://cf-ai-codereview.YOUR_SUBDOMAIN.workers.dev`.

---

## Project Structure

```
cf_ai_codereview/
├── src/
│   ├── index.ts        # Worker entry point & routing
│   └── agent.ts        # CodeReviewAgent (AIChatAgent + tools + system prompt)
├── public/
│   └── index.html      # Full chat UI (editor + review panel)
├── wrangler.toml       # Cloudflare config (AI binding, DO binding, assets)
├── package.json
├── tsconfig.json
├── README.md
└── PROMPTS.md          # AI prompts used during development
```

---

## Usage

1. Paste any code into the left panel
2. Optionally select the language from the dropdown
3. Click **⚡ Review Code**
4. Read the structured review in the right panel
5. Ask follow-ups in the chat input at the bottom

Try the built-in examples (SQL injection, async bugs, memory leaks, logic errors) using the chips on the welcome screen.

---

## Tech Stack

- **Cloudflare Workers** — serverless compute
- **Workers AI** — `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- **Durable Objects** — stateful agent instances with built-in SQLite
- **Agents SDK** (`agents` npm package) — `AIChatAgent` base class
- **Vercel AI SDK** (`ai` package) — `streamText`, tool calling
- **workers-ai-provider** — AI SDK adapter for Workers AI
- TypeScript throughout
