import { z } from "zod";

export const VerdictEnum = z.enum(["INVEST", "PASS", "HOLD"]);
export type Verdict = z.infer<typeof VerdictEnum>;

export const CompanyInfoSchema = z.object({
  name: z.string(),
  ticker: z.string().nullable(),
  industry: z.string().nullable(),
  sector: z.string().nullable(),
  description: z.string().nullable(),
  marketCap: z.number().nullable(),
  exchange: z.string().nullable(),
});
export type CompanyInfo = z.infer<typeof CompanyInfoSchema>;

export const FinancialMetricSchema = z.object({
  period: z.string(),
  revenue: z.number().nullable(),
  netIncome: z.number().nullable(),
  eps: z.number().nullable(),
  peRatio: z.number().nullable(),
  debtToEquity: z.number().nullable(),
  profitMargin: z.number().nullable(),
  revenueGrowth: z.number().nullable(),
});
export type FinancialMetric = z.infer<typeof FinancialMetricSchema>;

export const NewsItemSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  source: z.string(),
  url: z.string().url(),
  datetime: z.number(),
  sentiment: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const ResearchDataSchema = z.object({
  company: CompanyInfoSchema,
  financials: z.array(FinancialMetricSchema),
  news: z.array(NewsItemSchema),
  qualitative: z.string(),
  priceQuote: z
    .object({
      price: z.number(),
      change: z.number().nullable(),
      changePercent: z.number().nullable(),
    })
    .nullable(),
});
export type ResearchData = z.infer<typeof ResearchDataSchema>;

export const ReasoningFactorSchema = z.object({
  factor: z.string(),
  impact: VerdictEnum,
  detail: z.string(),
});
export type ReasoningFactor = z.infer<typeof ReasoningFactorSchema>;

export const DecisionSchema = z.object({
  verdict: VerdictEnum,
  confidence: z.number().min(0).max(1),
  reasoning: z.array(ReasoningFactorSchema),
  summary: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

export const GraphStep = z.enum([
  "IDENTIFY",
  "GATHER",
  "ANALYZE",
  "DECIDE",
  "PERSIST",
  "COMPLETE",
  "ERROR",
]);
export type GraphStep = z.infer<typeof GraphStep>;

export const SSEEventSchema = z.object({
  step: GraphStep,
  message: z.string(),
  data: z.any().optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});
export type SSEEvent = z.infer<typeof SSEEventSchema>;

export const ResearchRequestSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
});
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
