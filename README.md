# cf_ai_codereview

`cf_ai_codereview` is a Cloudflare-native AI code review app built for the Cloudflare Software Engineer Internship optional assignment.

It is designed to show the four things the assignment is really asking for:

1. **LLM** — uses **Workers AI** with **Llama 3.3 70B**
2. **Workflow / coordination** — uses a **Worker + Durable Object** routing pattern
3. **User input via chat** — browser-based code editor and follow-up chat UI
4. **Memory / state** — review history and latest code context are persisted per session inside a Durable Object

## What the assignment is actually about

This is not just “build any AI app.”

Cloudflare is trying to see whether you can build something that feels native to their platform:

- AI inference on **Workers AI**
- stateful logic on **Durable Objects**
- an interactive user-facing interface
- enough engineering judgment to wire the pieces together cleanly

So the point of this repo is less about making the fanciest product and more about proving:

- you understand Cloudflare primitives
- you can ship something end-to-end
- you can combine stateless edge compute with stateful coordination
- you can document it clearly enough for someone else to run it

## Architecture

| Layer | Cloudflare feature | What it does |
|---|---|---|
| Frontend | Static Assets | Serves the single-page code review UI |
| API router | Worker | Routes browser requests to the right session-specific Durable Object |
| Stateful runtime | Durable Object | Stores per-session memory, review stats, latest code, and recent conversation |
| LLM | Workers AI | Runs `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for reviews and follow-ups |

## Features

- Paste code and request a structured review
- Follow up in chat after the review
- Persistent per-session memory
- Recent review history stored in Durable Object state
- Clean single-page UI
- No external API keys needed

## Project structure

```txt
cf_ai_codereview/
├── public/
│   └── index.html        # Single-page UI
├── src/
│   ├── agent.ts          # Durable Object state + AI logic
│   └── index.ts          # Worker entry + request routing
├── package.json
├── tsconfig.json
├── wrangler.toml
├── PROMPTS.md
└── README.md
```

## Local development

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler login

### Run locally

```bash
npm install
npx wrangler login
npm run dev
```

Then open the local Wrangler URL, usually:

```txt
http://localhost:8787
```

## Deploy

```bash
npm run deploy
```

## How session memory works

The browser stores a generated session ID in `localStorage`.

Every request goes to:

- `POST /api/session/:id/review`
- `POST /api/session/:id/chat`
- `GET /api/session/:id/stats`

The Worker routes those requests to a single Durable Object instance identified by that session ID.

That Durable Object stores:

- total review count
- last detected language
- last reviewed timestamp
- latest reviewed code snippet
- recent review summaries
- recent conversation messages

So follow-up chat can reference the latest review instead of acting like every request is brand new.
