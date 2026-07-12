import { StateGraph, Annotation } from "@langchain/langgraph";
import { GoogleGenAI } from "@google/genai";
import { retry } from "@/lib/retry";
import { prisma } from "@/lib/prisma";
import {
  searchFinnhubCompany,
  getFinnhubQuote,
  getFinnhubCompanyProfile,
  getFinnhubNews,
  getFMPFinancials,
  searchTavily,
} from "@/lib/api-client";
import {
  type CompanyInfo,
  type FinancialMetric,
  type NewsItem,
  type ResearchData,
  type Decision,
  type Source,
  type GraphStep,
  DecisionSchema,
  VerdictEnum,
  CompanyInfoSchema,
} from "@/lib/schemas";

const StateAnnotation = Annotation.Root({
  companyName: Annotation<string>,
  currentStep: Annotation<string>,
  companyId: Annotation<string | null>,
  companyInfo: Annotation<CompanyInfo | null>,
  researchData: Annotation<ResearchData | null>,
  decision: Annotation<Decision | null>,
  sources: Annotation<Source[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  error: Annotation<string | null>,
  rawData: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
});

function setStep(step: GraphStep, message: string) {
  return { currentStep: message };
}

async function identifyNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  try {
    const info = state.companyInfo?.ticker
      ? state.companyInfo
      : null;

    const company = info
      ? { ticker: info.ticker, name: info.name }
      : await searchFinnhubCompany(state.companyName);

    if (!company) {
      return {
        ...setStep("ERROR", "Could not find company on Finnhub"),
        error: `No ticker found for "${state.companyName}"`,
      };
    }

    const existing = await prisma.company.findFirst({
      where: { ticker: company.ticker },
    });

    let companyId: string;
    if (existing) {
      companyId = existing.id;
    } else {
      const created = await prisma.company.create({
        data: {
          name: company.name,
          ticker: company.ticker,
        },
      });
      companyId = created.id;
    }

    return {
      companyId,
      companyInfo: {
        name: company.name,
        ticker: company.ticker,
        industry: null,
        sector: null,
        description: null,
        marketCap: null,
        exchange: null,
      },
      ...setStep("IDENTIFY", `Resolved ${state.companyName} → ${company.ticker} (${company.name})`),
    };
  } catch (err) {
    return {
      ...setStep("ERROR", `Identification failed: ${(err as Error).message}`),
      error: (err as Error).message,
    };
  }
}

async function gatherNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  if (!state.companyInfo?.ticker) {
    return { ...setStep("ERROR", "No ticker to gather data for"), error: "No ticker" };
  }

  const ticker = state.companyInfo.ticker;

  try {
    const [profile, quote, news, financials, qualitative] = await Promise.all([
      getFinnhubCompanyProfile(ticker),
      getFinnhubQuote(ticker),
      getFinnhubNews(ticker),
      getFMPFinancials(ticker),
      searchTavily(
        `"${state.companyName}" financial performance strategy competition 2025 2026`
      ),
    ]);

    const companyInfo: CompanyInfo = CompanyInfoSchema.parse({
      ...profile,
      name: profile.name || state.companyInfo.name,
      ticker,
    });

    const hasFinancials = financials.length > 0 && financials.some((f) => f.revenue !== null || f.eps !== null);
    const hasNews = news.length > 0;
    const hasQualitative = qualitative !== "Qualitative research unavailable." && qualitative.length > 50;

    if (!hasFinancials && !hasNews && !hasQualitative) {
      return {
        ...setStep("ERROR", "All data sources returned empty — cannot make a decision"),
        error: "Insufficient data from all sources",
      };
    }

    const researchData: ResearchData = {
      company: companyInfo,
      financials,
      news,
      qualitative,
      priceQuote: quote,
    };

    const sources: Source[] = [
      ...news.map((n) => ({
        title: n.headline,
        url: n.url,
        snippet: n.summary.slice(0, 200),
      })),
      {
        title: "Tavily Research: " + state.companyName,
        url: "https://tavily.com",
        snippet: qualitative.slice(0, 200),
      },
    ];

    return {
      companyInfo,
      researchData,
      sources,
      rawData: {
        finnhubProfile: profile,
        finnhubQuote: quote,
        finnhubNews: news,
        fmpFinancials: financials,
        tavilyResearch: qualitative,
      },
      ...setStep("GATHER", `Gathered financials, news, and qualitative data for ${ticker}`),
    };
  } catch (err) {
    return {
      ...setStep("ERROR", `Data gathering failed: ${(err as Error).message}`),
      error: (err as Error).message,
    };
  }
}

let _client: GoogleGenAI | null = null;

function getClient() {
  if (!_client) {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not set");
    }
    _client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }
  return _client;
}

async function analyzeNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  if (!state.researchData) {
    return { ...setStep("ERROR", "No research data to analyze"), error: "No data" };
  }

  try {
    const rd = state.researchData;
    const finTable = rd.financials
      .map((f) => `${f.period}: Rev=${f.revenue}, NI=${f.netIncome}, EPS=${f.eps}`)
      .join("\n");
    const newsList = rd.news
      .map((n) => `- ${n.headline} (${n.source})`)
      .join("\n");
    const priceInfo = rd.priceQuote
      ? `Price: $${rd.priceQuote.price} (${rd.priceQuote.changePercent?.toFixed(2)}%)`
      : "No price data";

    const prompt = `You are a senior equity research analyst. Analyze the following data and produce a structured investment assessment.

Company: ${rd.company.name} (${rd.company.ticker})
Industry: ${rd.company.industry ?? "N/A"}
Market Cap: ${rd.company.marketCap ? `$${(rd.company.marketCap / 1e9).toFixed(2)}B` : "N/A"}

Price: ${priceInfo}

Financials (last 4 periods):
${finTable}

Recent News:
${newsList}

Qualitative Research:
${rd.qualitative}

Provide your analysis as a structured decision with:
1. A verdict: INVEST, PASS, or HOLD
2. A confidence score (0.0 to 1.0)
3. Key reasoning factors (each with factor name, impact verdict, and detail)
4. A 2-3 sentence summary

Return valid JSON matching this schema:
{
  "verdict": "INVEST" | "PASS" | "HOLD",
  "confidence": 0.75,
  "reasoning": [
    { "factor": "Strong revenue growth", "impact": "INVEST", "detail": "..." }
  ],
  "summary": "Overall assessment..."
}`;

    const response = await retry(
      async () => {
        const r = await getClient().models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
        });
        return r;
      },
      { maxAttempts: 3, baseDelayMs: 1000 }
    );
    const text = response.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in model response");
    }

    const parsed = DecisionSchema.parse(JSON.parse(jsonMatch[0]));

    return {
      decision: parsed,
      ...setStep("ANALYZE", `Analysis complete — ${parsed.reasoning.length} factors evaluated`),
    };
  } catch (err) {
    return {
      ...setStep("ERROR", `Analysis failed: ${(err as Error).message}`),
      error: (err as Error).message,
    };
  }
}

async function decideNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  if (!state.decision) {
    return { ...setStep("ERROR", "No analysis to base decision on"), error: "No decision" };
  }

  return {
    ...setStep("DECIDE", `Verdict: ${state.decision.verdict} (${(state.decision.confidence * 100).toFixed(0)}% confidence)`),
  };
}

async function persistNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  if (!state.companyId || !state.decision) {
    return { ...setStep("ERROR", "Missing data to persist"), error: "Missing data" };
  }

  try {
    const run = await prisma.researchRun.create({
      data: {
        companyId: state.companyId,
        verdict: state.decision.verdict,
        confidence: state.decision.confidence,
        reasoning: state.decision.reasoning,
        sources: state.sources,
        rawData: state.rawData as any,
      },
    });

    return {
      ...setStep("COMPLETE", "Research persisted to database"),
      companyId: run.companyId,
    };
  } catch (err) {
    return {
      ...setStep("ERROR", `Failed to persist: ${(err as Error).message}`),
      error: (err as Error).message,
    };
  }
}

const graphBuilder = new StateGraph(StateAnnotation)
  .addNode("identify", identifyNode)
  .addNode("gather", gatherNode)
  .addNode("analyze", analyzeNode)
  .addNode("decide", decideNode)
  .addNode("persist", persistNode)
  .addEdge("__start__", "identify")
  .addEdge("identify", "gather")
  .addEdge("gather", "analyze")
  .addEdge("analyze", "decide")
  .addEdge("decide", "persist")
  .addEdge("persist", "__end__");

export const researchGraph = graphBuilder.compile();

export type ResearchGraphState = typeof StateAnnotation.State;
