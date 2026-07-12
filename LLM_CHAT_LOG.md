# LLM Chat Transcript / Build Log

> This project was built interactively with an AI coding assistant (this model) over a multi-turn session. Below is a structured log of every phase: prompts, decisions, code changes, test results, and debugging sessions.

---

## Phase 1 — Scaffold & Setup

**Objective:** Initialize a Next.js 16 project with TypeScript, Tailwind v4, Prisma 7, LangGraph.js, and the Gemini SDK.

**Prompt:** *"Set up a Next.js 16 app with TypeScript, Tailwind v4, Prisma 7, LangGraph.js, and Gemini SDK for an AI investment research agent."*

### Key actions
- Created project with `npx create-next-app@latest`, opted into Turbopack, Tailwind v4
- Installed: `@langchain/core`, `@langchain/langgraph`, `@langchain/google-genai`, `@langchain/community`, `motion`, `zod@3`, `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`, `@types/uuid`
- Configured Prisma 7: created `prisma/schema.prisma` with `Company`, `ResearchRun` models and `Verdict` enum. Created `prisma.config.ts` (Prisma 7 requires this for datasource URL — `datasource.url` no longer valid in schema)
- Applied initial migration to Supabase Postgres

### Issues encountered
| Issue | Fix |
|---|---|
| Prisma 7 removed `datasource.url` from schema | Moved to `prisma.config.ts` with `@prisma/adapter-pg` |
| `new PrismaClient()` no longer accepts bare constructor | Must pass `{ adapter }` with `PrismaPg` adapter |

---

## Phase 2 — Shared Schema & API Clients

**Prompt:** *"Create Zod schemas for company info, financial metrics, news items, research data, decisions, and SSE events. Build API clients for Finnhub, FMP, and Tavily with retry logic."*

### Key actions
- Created `src/lib/schemas.ts` with 10+ Zod schemas and TypeScript types
- Created `src/lib/api-client.ts` with:
  - `searchFinnhubCompany` — ticker lookup with Tavily fallback
  - `getFinnhubQuote`, `getFinnhubCompanyProfile`, `getFinnhubNews`
  - `getFMPFinancials` — income statements
  - `searchTavily` — web search for qualitative data
- Created `src/lib/retry.ts` — exponential backoff with jitter
- Created `src/lib/rate-limiter.ts` — in-memory sliding window (10 req/IP/min)

### Decisions
- **Tavily fallback for ticker resolution:** If Finnhub search fails, ask Tavily "What is the stock ticker symbol for X?"
- **Stopword filtering:** Applied to Tavily ticker responses to filter out common words (THE, AND, INC, etc.)

---

## Phase 3 — LangGraph Agent

**Prompt:** *"Build a 5-node LangGraph state machine that resolves a company name, gathers data, analyzes with Gemini, decides verdict, and persists to DB."*

### Key actions
- Created `src/agents/research-graph.ts` with `StateGraph` using `Annotation.Root`
- 5 nodes: `identify`, `gather`, `analyze`, `decide`, `persist`
- `gather` uses `Promise.all` for parallel API calls
- `analyze` calls Gemini with a structured prompt asking for JSON output
- Used `DecisionSchema` (Zod) to validate LLM output

---

## Phase 4 — SSE API Route

**Prompt:** *"Create POST /api/research that streams the LangGraph execution as SSE events."*

### Key actions
- Created `src/app/api/research/route.ts` with `ReadableStream`
- `streamMode: "updates"` emits per-node state; route accumulates state in `accumulatedState` to extract company info + decision
- AbortController for 60s timeout and client disconnect handling
- 24h cache lookup before graph execution

### Bug discovered
- **Cached response missing company info:** Initial cache path sent `marketCap: null` hardcoded. Fixed by dynamically fetching Finnhub profile on cache hit for real-time market cap.

---

## Phase 5 — Frontend

**Prompt:** *"Build the React UI: research input, step timeline, verdict card, and SSE hook."*

### Key actions
- `ResearchInput` — form with text input and submit button
- `StepTimeline` — Motion-animated step indicators
- `VerdictCard` — spring-reveal card with verdict colors, reasoning factors, sources
- `useResearchSSE` — custom hook reading SSE stream, parsing `data:` lines

---

## Phase 6 — Debugging Sessions

### Issue 1: Gemini quota exhausted
**"Gemini daily quota exhausted: limit: 0 on gemini-2.0-flash"**
- Swapped to `gemini-2.0-flash-lite` (separate quota bucket)
- Ultimately moved to `gemini-3.5-flash` after running `list-models.mjs` to discover available models

### Issue 2: `@google/genai` SDK behavior
**"@google/genai v2.11.0 requires ADC, not accepting apiKey"**
- Discovered `.env` not loaded in standalone scripts — fixed by adding `import "dotenv/config"` to test script
- API key in `.env` had leading whitespace — trimmed with `.trim()`

### Issue 3: VerdictCard `colors.border` error
**"undefined is not an object (evaluating 'colors.border')"**
- Root cause: SSE sent raw graph state (`{ decision: { verdict, ... } }`) but VerdictCard expected flat structure
- Fixed: extract `decision` from graph state and flatten into `{ verdict, confidence, reasoning, ... }`

### Issue 4: FMP legacy endpoint
**"FMP failed, trying Finnhub fundamentals fallback"**
- FMP `/v3/income-statement` returns 403 — "Legacy Endpoint no longer supported after Aug 31, 2025"
- Discovered new endpoint: `https://financialmodelingprep.com/stable/income-statement?symbol={ticker}&period=annual&limit=4`
- Updated `FMP_BASE` from `/api/v3` to `/stable` and changed URL format

### Issue 5: Candle data unavailable
**"Finnhub candles failed, returning empty"**
- Finnhub free tier returns "You don't have access to this resource" for `/stock/candle`
- Removed all candle-related code (schema, API client, graph, prompt, UI)

### Issue 6: International stock search
**"No ticker found for 'Bharti Airtel Ltd'"**
- Filter `r.symbol.length <= 5` excluded Indian stocks (BHARTIARTL = 10 chars)
- Removed length filter; keep only `type === "Common Stock"` check

### Issue 7: Market cap shown as N/A
**"MarketCap shows N/A, should be T"**
- Finnhub returns `marketCapitalization` in millions (e.g. `4631217` = $4.63T)
- Code stored raw value → `formatMarketCap` read it as $4.6M
- Fixed by multiplying by `1_000_000` in `getFinnhubCompanyProfile`

---

## Phase 7 — Autocomplete

**Prompt:** *"Add real-time company suggestions in the search bar when typing."*

### Key actions
- Created `src/app/api/search/route.ts` — server-side Finnhub query (hides API key)
- Created `searchFinnhubCompanies` in api-client.ts — returns up to 8 matches
- Updated `ResearchInput` with:
  - 300ms debounce via `useDebounce` hook
  - Client-side LRU cache (`useRef<Map>`) with 60s TTL
  - Keyboard navigation (↑↓↩⎋)
  - Click-outside dismiss

---

## Phase 8 — Optimization & Polish

### Optimization: Reuse Finnhub search result
**"searchFinnhubCompany runs twice per request"**
- Original flow: `checkCache` → Finnhub lookup → if cache miss, `identifyNode` → Finnhub lookup again
- Refactored: `resolveCompany()` returns `{ run, ticker, name }`; passes pre-resolved ticker to graph initial state; `identifyNode` skips Finnhub if `companyInfo.ticker` already set

### Bug: Duplicate React keys `REL.L`
**"Encountered two children with the same key"**
- Finnhub returned two companies with same ticker `REL.L`
- Fixed: changed autocomplete key from `key={s.symbol}` to `key={\`${s.symbol}-${i}\`}`

---

## Test Results

### Apple (cached)
```
MarketCap: $4.63T
Verdict: INVEST (85% confidence)
Response time: ~2s
```

### Apple (fresh — bypassed cache)
```
MarketCap: $4.63T
Verdict: INVEST (85% confidence)
Response time: ~21s (includes 5 parallel API calls + Gemini inference)
```

### NVIDIA (fresh)
```
MarketCap: $5.11T
Verdict: INVEST (90% confidence)
Response time: ~22s
```

### Bharti Airtel (fresh — international stock)
```
MarketCap: N/A (Finnhub profile unavailable for .NS tickers on free tier)
Verdict: INVEST (85% confidence)
Response time: ~21s
```

---

## Environment & API Keys

All 5 keys stored in `.env`:

| Variable | Service | Used for |
|---|---|---|
| `DATABASE_URL` | Supabase Postgres | Prisma connection |
| `FINNHUB_API_KEY` | Finnhub | Ticker search, quote, profile, news, fundamentals fallback |
| `FMP_API_KEY` | Financial Modeling Prep | Income statements (via `/stable/income-statement`) |
| `TAVILY_API_KEY` | Tavily | Web search for qualitative research, ticker fallback |
| `GOOGLE_API_KEY` | Google AI | Gemini 3.5 Flash LLM calls |
