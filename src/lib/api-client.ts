import type { CompanyInfo, FinancialMetric, NewsItem } from "./schemas";
import { retry } from "./retry";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const FMP_BASE = "https://financialmodelingprep.com/stable";
const TAVILY_API = "https://api.tavily.com";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} from ${url.split("?")[0]}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function searchFinnhubCompany(
  query: string,
  signal?: AbortSignal
): Promise<{ ticker: string; name: string } | null> {
  try {
    const data = (await retry(
      () =>
        fetchJson(
          `${FINNHUB_BASE}/search?q=${encodeURIComponent(query)}&token=${requireEnv("FINNHUB_API_KEY")}`,
          signal
        ),
      { maxAttempts: 2, baseDelayMs: 500 }
    )) as { result: Array<{ symbol: string; description: string; type: string }> };

    const match = data.result?.find(
      (r) => r.type === "Common Stock"
    );
    return match ? { ticker: match.symbol, name: match.description } : null;
  } catch (err) {
    console.warn("Finnhub search failed, trying Tavily fallback:", (err as Error).message);
    return searchTavilyForTicker(query, signal);
  }
}

const TICKER_STOPWORDS = new Set([
  "THE", "FOR", "AND", "ARE", "YOU", "ITS", "HAS", "WAS", "NOT",
  "BUT", "ALL", "CAN", "HAD", "HOW", "NEW", "NOW", "ONE", "OUR",
  "OUT", "THAT", "THIS", "VERY", "WHAT", "WHEN", "WHICH", "WILL",
  "WITH", "YOUR", "FROM", "HAVE", "BEEN", "INC", "LTD", "NYSE",
  "NASDAQ", "STOCK", "SHARE", "TRADING", "MARKET", "COMPANY",
]);

async function searchTavilyForTicker(
  query: string,
  signal?: AbortSignal
): Promise<{ ticker: string; name: string } | null> {
  try {
    const res = await fetch(`${TAVILY_API}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: requireEnv("TAVILY_API_KEY"),
        query: `What is the stock ticker symbol for ${query}? Answer with just the ticker.`,
        max_results: 3,
        include_answer: true,
      }),
      signal,
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { answer: string };
    const candidates = data.answer?.match(/\b[A-Z]{1,4}\b/g) ?? [];
    const ticker = candidates.find((c) => !TICKER_STOPWORDS.has(c));
    if (ticker) {
      return { ticker, name: query };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getFinnhubQuote(
  ticker: string,
  signal?: AbortSignal
): Promise<{ price: number; change: number; changePercent: number } | null> {
  try {
    const data = (await retry(
      () =>
        fetchJson(
          `${FINNHUB_BASE}/quote?symbol=${ticker}&token=${requireEnv("FINNHUB_API_KEY")}`,
          signal
        ),
      { maxAttempts: 2, baseDelayMs: 500 }
    )) as { c: number; d: number; dp: number };

    if (!data.c || data.c === 0) return null;
    return { price: data.c, change: data.d ?? 0, changePercent: data.dp ?? 0 };
  } catch {
    console.warn("Finnhub quote failed, returning null");
    return null;
  }
}

export async function getFinnhubCompanyProfile(
  ticker: string,
  signal?: AbortSignal
): Promise<CompanyInfo> {
  try {
    const data = (await retry(
      () =>
        fetchJson(
          `${FINNHUB_BASE}/stock/profile2?symbol=${ticker}&token=${requireEnv("FINNHUB_API_KEY")}`,
          signal
        ),
      { maxAttempts: 2, baseDelayMs: 500 }
    )) as {
      name: string;
      ticker: string;
      finnhubIndustry: string;
      marketCapitalization: number;
      exchange: string;
    };

    return {
      name: data.name ?? "",
      ticker,
      industry: data.finnhubIndustry ?? null,
      sector: null,
      description: null,
      marketCap: data.marketCapitalization ? data.marketCapitalization * 1_000_000 : null,
      exchange: data.exchange ?? null,
    };
  } catch {
    console.warn("Finnhub profile failed, returning minimal info");
    return { name: "", ticker, industry: null, sector: null, description: null, marketCap: null, exchange: null };
  }
}

export async function getFinnhubNews(
  ticker: string,
  signal?: AbortSignal
): Promise<NewsItem[]> {
  try {
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const to = new Date().toISOString().split("T")[0];
    const data = (await retry(
      () =>
        fetchJson(
          `${FINNHUB_BASE}/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${requireEnv("FINNHUB_API_KEY")}`,
          signal
        ),
      { maxAttempts: 2, baseDelayMs: 500 }
    )) as Array<{
      headline: string;
      summary: string;
      source: string;
      url: string;
      datetime: number;
    }>;

    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map((item) => ({
      headline: item.headline ?? "",
      summary: item.summary ?? "",
      source: item.source ?? "",
      url: item.url ?? "",
      datetime: item.datetime,
      sentiment: null,
    }));
  } catch {
    console.warn("Finnhub news failed, returning empty");
    return [];
  }
}

function parseFmpFinancials(
  data: Array<{
    date: string;
    revenue: number;
    netIncome: number;
    eps: number;
    epsdiluted?: number;
  }>
): FinancialMetric[] {
  return data.map((item) => ({
    period: item.date,
    revenue: item.revenue ?? null,
    netIncome: item.netIncome ?? null,
    eps: item.eps ?? null,
    peRatio: null,
    debtToEquity: null,
    profitMargin: null,
    revenueGrowth: null,
  }));
}

export async function getFMPFinancials(
  ticker: string,
  signal?: AbortSignal
): Promise<FinancialMetric[]> {
  try {
    const data = (await retry(
      () =>
        fetchJson(
          `${FMP_BASE}/income-statement?symbol=${ticker}&period=annual&limit=4&apikey=${requireEnv("FMP_API_KEY")}`,
          signal
        ),
      { maxAttempts: 2, baseDelayMs: 1000 }
    )) as Array<{
      date: string;
      revenue: number;
      netIncome: number;
      eps: number;
      epsdiluted?: number;
    }>;

    if (Array.isArray(data) && data.length > 0) {
      return parseFmpFinancials(data);
    }

    console.warn("FMP returned empty, trying Finnhub fundamentals fallback");
    return getFinnhubFinancials(ticker, signal);
  } catch {
    console.warn("FMP failed, trying Finnhub fundamentals fallback");
    return getFinnhubFinancials(ticker, signal);
  }
}

async function getFinnhubFinancials(
  ticker: string,
  signal?: AbortSignal
): Promise<FinancialMetric[]> {
  try {
    const data = (await fetchJson(
      `${FINNHUB_BASE}/stock/metric?symbol=${ticker}&metric=all&token=${requireEnv("FINNHUB_API_KEY")}`,
      signal
    )) as {
      metric?: {
        "10DayAverageTradingVolume"?: number;
        "52WeekHigh"?: number;
        "52WeekLow"?: number;
        "beta"?: number;
        "currentPrice"?: number;
        "eps"?: number;
        "marketCapitalization"?: number;
        "peRatio"?: number;
        "revenueGrowth"?: number;
        "revenuePerShare"?: number;
        "profitMargin"?: number;
        "debtToEquity"?: number;
      };
    };

    if (!data.metric) return [];

    const m = data.metric;
    return [
      {
        period: "TTM",
        revenue: m.revenuePerShare ? (m.marketCapitalization ?? 0) : null,
        netIncome: m.eps ? (m.marketCapitalization ?? 0) / (m.peRatio ?? 1) : null,
        eps: m.eps ?? null,
        peRatio: m.peRatio ?? null,
        debtToEquity: m.debtToEquity ?? null,
        profitMargin: m.profitMargin ?? null,
        revenueGrowth: m.revenueGrowth ?? null,
      },
    ];
  } catch {
    console.warn("Finnhub fundamentals also failed, returning empty");
    return [];
  }
}

export async function searchTavily(
  query: string,
  signal?: AbortSignal
): Promise<string> {
  try {
    const res = await retry(
      async () => {
        const r = await fetch(`${TAVILY_API}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: requireEnv("TAVILY_API_KEY"),
            query,
            max_results: 5,
            include_answer: true,
          }),
          signal,
        });

        if (!r.ok) {
          throw new Error(`Tavily ${r.status}: ${await r.text().catch(() => "")}`);
        }
        return r;
      },
      { maxAttempts: 2, baseDelayMs: 1000 }
    );

    const data = (await res.json()) as {
      answer: string;
      results: Array<{ title: string; url: string; content: string }>;
    };

    const results = (data.results ?? [])
      .map((r) => `- ${r.title}\n  ${r.content.slice(0, 500)}`)
      .join("\n\n");

    return data.answer
      ? `Summary: ${data.answer}\n\nSources:\n${results}`
      : results;
  } catch (err) {
    console.warn("Tavily search failed:", (err as Error).message);
    return "Qualitative research unavailable.";
  }
}

export async function searchFinnhubCompanies(
  query: string,
  signal?: AbortSignal
): Promise<Array<{ symbol: string; name: string }>> {
  try {
    const data = (await fetchJson(
      `${FINNHUB_BASE}/search?q=${encodeURIComponent(query)}&token=${requireEnv("FINNHUB_API_KEY")}`,
      signal
    )) as { result: Array<{ symbol: string; description: string; type: string }> };

    return (data.result ?? [])
      .filter((r) => r.type === "Common Stock")
      .slice(0, 8)
      .map((r) => ({ symbol: r.symbol, name: r.description }));
  } catch {
    return [];
  }
}
