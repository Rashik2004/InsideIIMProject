# InsideIIMProject

# This is an assignment based project which is related to insideiim

# This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# AI Investment Research Agent
> InsideIIM × Altuni AI Labs — AI Product Development Engineer Intern take-home.

Given a company name, the agent researches it and outputs **Invest / Pass / Hold** with structured reasoning, confidence score, real-time market cap, and cited sources — streamed live to the UI via SSE.

---

## Overview

This is a full-stack AI agent that acts as an equity research analyst. The user types a publicly traded company name, and the agent:

1. Resolves the name to a ticker symbol
2. Gathers financials, news, price data, and qualitative research
3. Analyzes everything with a Gemini 3.5 Flash LLM
4. Produces a structured **Invest / Pass / Hold** verdict with reasoning factors
5. Streams each step live to the browser via Server-Sent Events
6. Caches results for 24 hours to save API quota

The frontend shows a live step timeline as each node executes, then reveals the verdict card with a spring animation.

---

## Stack

| Layer               | Choice                                     |
| ------------------- | ------------------------------------------ |
| Framework           | Next.js 16 (App Router)                    |
| Language            | TypeScript (strict)                        |
| Styling             | Tailwind CSS v4                            |
| Animation           | Motion (motion.dev)                        |
| Agent orchestration | LangGraph.js                               |
| LLM                 | Gemini 3.5 Flash (via `@google/genai` SDK) |
| Database            | Supabase Postgres                          |
| ORM                 | Prisma 7 (with `@prisma/adapter-pg`)       |

---

## How to run

### 1. Prerequisites

- Node.js 20+
- A Supabase project (free tier)
- API keys for: Finnhub, Financial Modeling Prep, Tavily, Google AI (Gemini)

### 2. Environment

Copy `.env.example` to `.env` and fill in all values:

```env
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
FINNHUB_API_KEY=""
FMP_API_KEY=""
TAVILY_API_KEY=""
GOOGLE_API_KEY=""
```

**Supabase connection string:** Project Settings → Database → Connection string → Pooling (Session mode) → URI.

### 3. Install & migrate

```bash
npm install
npx prisma migrate dev
npm run dev
```

### 4. Run

Open `http://localhost:3000`. Type a company name (e.g. "Apple", "Tesla", "Bharti Airtel") and press **Research**. The UI streams each step live, then reveals the verdict card.

---

## How it works

### Architecture

```
User Input → POST /api/research → LangGraph State Machine → SSE Stream → React UI
```

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Agent graph (5 nodes)

```
IDENTIFY → GATHER → ANALYZE → DECIDE → PERSIST
```

| Node         | What it does                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **identify** | Resolves company name → ticker via Finnhub search (with Tavily fallback). Upserts the `Company` row in Postgres.                                 |
| **gather**   | Fires 5 API calls in parallel: Finnhub profile/quote/news, FMP income statements, Tavily web search. All calls have retry + exponential backoff. |
| **analyze**  | Feeds all gathered data into Gemini 3.5 Flash via `@google/genai`. The LLM returns a structured JSON verdict with reasoning factors.             |
| **decide**   | Surfaces the verdict and confidence score.                                                                                                       |
| **persist**  | Saves the complete `ResearchRun` to Supabase (enables 24h cache).                                                                                |

### API Routes

| Route           | Method | Description                                                                     |
| --------------- | ------ | ------------------------------------------------------------------------------- |
| `/api/research` | POST   | Accepts `{ companyName }`, returns SSE stream with step-by-step updates         |
| `/api/search`   | GET    | Accepts `?q=...`, returns autocomplete suggestions (up to 8 matching companies) |

### Data model

```prisma
model Company {
  id          String   @id @default(uuid())
  name        String
  ticker      String   @unique
  researchRuns ResearchRun[]
}

model ResearchRun {
  id         String   @id @default(uuid())
  companyId  String
  verdict    Verdict  // INVEST | PASS | HOLD
  confidence Float
  reasoning  Json
  sources    Json
  rawData    Json?
  createdAt  DateTime @default(now())
}
```

**Cache rule:** If a `ResearchRun` exists for the company from the last 24 hours, it's served immediately instead of re-running the agent.

### Frontend components

| Component        | Role                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ResearchInput`  | Text input with debounced autocomplete (300ms), keyboard navigation (↑↓↩⎋), click-outside dismiss, 60s client-side LRU cache      |
| `StepTimeline`   | Motion-animated step indicators showing which node is executing                                                                   |
| `VerdictCard`    | Spring-reveal card showing company name/ticker, formatted market cap, verdict, confidence %, reasoning factors, and cited sources |
| `useResearchSSE` | Custom hook that consumes the SSE stream, parses `data:` lines, and drives React state                                            |

### Graceful degradation

Every external API call is wrapped with:

- **Exponential backoff with jitter** (`src/lib/retry.ts`) — retries up to 2–3 times with increasing delays
- **Graceful fallback chains** — if FMP fails, use Finnhub fundamentals; if Finnhub search fails, use Tavily; if any data source returns empty, the LLM works with what's available
- **Empty-data guard** (`gatherNode`) — if all data sources return empty, the graph errors out early rather than sending garbage to the LLM

---

## Key decisions & trade-offs

| Decision                                                              | Rationale                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini 3.5 Flash** over Pro                                         | Flash is available on the free tier (tested: `gemini-3.5-flash` works, `gemini-2.0-flash` was quota-exhausted). Flash reasoning is sufficient for equity analysis                     |
| **`@google/genai`** over `@langchain/google-genai`                    | The LangChain package wraps an older SDK. The new `@google/genai` v2.11.0 is required for compatible model access                                                                     |
| **Sequential graph** over parallel node execution                     | Simpler to debug, stream, and reason about. Parallelism lives inside `gather` via `Promise.all`                                                                                       |
| **Prisma 7** over raw SQL                                             | Type-safe queries, declarative migrations, schema-as-source-of-truth. Note: Prisma 7 removed `datasource.url` from `schema.prisma` — requires `prisma.config.ts` + driver adapter     |
| **SSE over WebSocket**                                                | Simpler server-side (no stateful connection management), sufficient for one-directional streaming. Uses standard `ReadableStream`                                                     |
| **Zod v3** over v4                                                    | LangChain/LangGraph packages require Zod 3.x as a peer dependency                                                                                                                     |
| **24h cache**                                                         | Balances freshness with API rate-limit conservation. Finnhub: 60 req/min, FMP: 250 req/day                                                                                            |
| **Finnhub over FMP for fallback**                                     | FMP's `/v3/income-statement` is a legacy endpoint (dead after Aug 31, 2025). Updated to `/stable/income-statement`. If that also fails, Finnhub fundamentals serve as a thin fallback |
| **`streamMode: "updates"` + accumulated state** instead of `"values"` | Keeps each SSE event lightweight (only new data per node) while the route accumulates full state to extract company info, decision, and sources for the final payload                 |
| **Company autocomplete with client-side cache**                       | `/api/search` routes through the server (hides API key from browser). A `useRef<Map>` with 60s TTL avoids redundant Finnhub calls on rapid typing                                     |

### What's NOT built (intentionally)

| Feature                              | Why not                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Candlestick charts**               | Finnhub free tier blocks `/stock/candle`. No free alternative found. The LLM gets price trend data from the quote endpoint instead |
| **NVIDIA NIM integration**           | Was planned as a Gemini fallback but requires a separate NVIDIA API key. Not needed since Gemini 3.5 Flash works                   |
| **Auth / user accounts**             | Out of scope for a single-page research tool                                                                                       |
| **Batch / multi-company comparison** | Would require significant UI and state changes. Left as future work                                                                |

---

## Example runs

### Apple Inc (AAPL)

```
Resolved: Apple → AAPL (Apple Inc)
Market Cap: $4.63T
Verdict: INVEST (85% confidence)

Factors:
  ✅ iPhone 17 Supercycle & Hardware Demand
  ✅ High-Margin Services Scaling ($109B FY2025)
  ✅ Strategic Chip Agreements and AI Readiness
  ✅ Unprecedented Off-Peak Financial Performance ($111B Q2)
  ⚠️ Regulatory Scrutiny and Supply Chain Constraints
```

### NVIDIA Corp (NVDA)

```
Resolved: Nvidia → NVDA (NVIDIA Corp)
Market Cap: $5.11T
Verdict: INVEST (90% confidence)

Factors:
  ✅ Exceptional Revenue and Margin Expansion ($57B Q3 FY2026, +62% YoY)
  ✅ Dominant AI Secular Tailwinds
  ✅ Robust Cash Generation and Shareholder Returns ($37B returned)
  ✅ Aggressive Capital Return Programs
```

### Bharti Airtel Ltd (BHARTIARTL.NS)

```
Resolved: Bharti Airtel Ltd → BHARTIARTL.NS
Market Cap: N/A (Finnhub profile unavailable for international ticker on free tier)
Verdict: INVEST (85% confidence)

Factors:
  ✅ Operational Efficiency and Margin Expansion (EBITDAaL 51.4%)
  ✅ Aggressive Deleveraging (Net Debt/EBITDAaL 1.3)
  ✅ High Capital Returns (ROE 27.1%)
  ⚠️ Liquidity and Working Capital Deficit (current ratio 0.37)
```

---

## What I would improve with more time

### Already implemented (not future — built now)

- **Exponential backoff + jitter** (`src/lib/retry.ts`) — applied to all external API calls
- **Graceful error recovery** — Tavily fallback for Finnhub ticker search; Finnhub fundamentals fallback for FMP; empty-data guard in gatherNode
- **Rate limiter** (`src/lib/rate-limiter.ts`) — 10 req/IP/min sliding window
- **Client disconnect handling** — AbortController + `request.signal` listener cancels the graph mid-flight

### Actual future work

- **Human-in-the-loop** — LangGraph `interrupt` to let users review intermediate findings before final verdict
- **Streaming LLM output** — Show Gemini's reasoning token-by-token instead of waiting for the full response
- **Batch comparison** — Allow researching multiple companies side by side in a table
- **Unit/integration tests** — Vitest for node logic, Playwright for E2E
- **Deployment** — Vercel + Supabase IPv4 addon (required for external connections from serverless)
- **Smarter caching** — Invalidate cache on significant price moves (>5%) rather than fixed 24h window
- **Multi-LLM ensemble** — Run the same analysis through 2–3 models and aggregate their verdicts

---

## LLM chat transcript / build log

This project was built interactively with an AI coding assistant (Claude Code by Anthropic) over a multi-turn session. The full transcript is available in the accompanying `LLM_CHAT_LOG.md` file, which includes:

- Every prompt, command, and code change made during development
- Decision points (model selection, architecture choices, fallback strategies)
- Debugging sessions (Finnhub rate limits, Prisma 7 adapter issues, Gemini quota exhaustion, FMP legacy endpoint migration)
- All `curl` test commands and server output

---

## API key registration links

- [Financial Modeling Prep](https://financialmodelingprep.com/developer/docs/) — 250 requests/day free (note: `/v3` legacy endpoints deprecated Aug 2025; use `/stable/` prefix)
- [Tavily](https://tavily.com) — 1,000 credits/month free
- [Google AI Studio](https://aistudio.google.com/apikey) — 1,500 requests/day, 1M TPM free
- [Neon](https://neon.tech) — 0.5 GB Postgres free (alternative to Supabase, works with Vercel)

---

## Deployment

### Docker Compose (local or VPS)

The project includes `Dockerfile` and `docker-compose.yml` for containerized deployment. Postgres runs as a sidecar container — no external DB needed.

**1. Clone and configure**

```bash
git clone <repo-url> insideiim
cd insideiim
cp .env.example .env
# Edit .env: fill in all 4 API keys + set DB_PASSWORD
```

**2. Build and start**

```bash
docker compose up -d
```

This starts Postgres + the Next.js app on port 3000. First boot runs `prisma migrate deploy` automatically.

**3. Open**

Visit `http://localhost:3000`.

### Vercel + Neon (alternative, no Docker)

If you prefer serverless without Docker:

1. Create a [Neon](https://neon.tech) Postgres database (free)
2. Push code to GitHub
3. Import repo on [Vercel](https://vercel.com/new)
4. Add all 5 env vars (`DATABASE_URL` from Neon, plus 4 API keys)
5. Deploy

### Deployment targets for Docker

| Platform | Cost | Notes |
|---|---|---|
| **Your own VPS** | $5–10/mo | Full control. Docker + docker-compose |
| **Render** | Free (spins down) | Connect GitHub repo, select Docker runtime |
| **Fly.io** | Free (no spin-down) | Uses `fly.toml` + Dockerfile |
  > > > > > > > be70cc0 (Pushing the InsideIIM assignment to github)
