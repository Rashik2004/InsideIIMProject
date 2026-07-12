import { NextRequest } from "next/server";
import { ResearchRequestSchema, type SSEEvent } from "@/lib/schemas";
import { researchGraph } from "@/agents/research-graph";
import { searchFinnhubCompany } from "@/lib/api-client";
import { prisma } from "@/lib/prisma";
import { rateLimitMiddleware } from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

type CachedRun = {
  id: string;
  companyId: string;
  verdict: string;
  confidence: number;
  reasoning: unknown;
  sources: unknown;
  rawData: unknown;
  createdAt: Date;
  company?: { id: string; name: string; ticker: string | null; resolvedAt: Date };
};

async function resolveCompany(
  companyName: string
): Promise<{ run: CachedRun | null; ticker: string | null; name: string | null }> {
  const resolved = await searchFinnhubCompany(companyName).catch(() => null);
  const ticker = resolved?.ticker ?? null;
  const name = resolved?.name ?? null;

  const company = await prisma.company.findFirst({
    where: ticker
      ? { ticker }
      : { name: { equals: companyName, mode: "insensitive" } },
    include: {
      researchRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const run = company?.researchRuns[0] ?? null;
  if (run) {
    const isFresh = Date.now() - new Date(run.createdAt).getTime() < 24 * 60 * 60 * 1000;
    return { run: isFresh ? run : null, ticker, name };
  }

  return { run: null, ticker, name };
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimitMiddleware({
    maxRequests: 10,
    windowMs: 60_000,
  })(request);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => ({}));
  const parsed = ResearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { companyName } = parsed.data;
  const { run: cached, ticker, name } = await resolveCompany(companyName);

  if (cached) {
    let marketCap: number | null = null;
    try {
      const { getFinnhubCompanyProfile } = await import("@/lib/api-client");
      const profile = await getFinnhubCompanyProfile(ticker ?? "");
      marketCap = profile.marketCap;
    } catch {}

    const data: Record<string, unknown> = {
      companyName: name ?? companyName,
      ticker: ticker ?? "",
      marketCap,
      verdict: cached.verdict,
      confidence: cached.confidence,
      reasoning: cached.reasoning,
      sources: cached.sources,
    };

    const body = JSON.stringify({
      step: "COMPLETE",
      message: "Serving cached result from " + cached.createdAt.toISOString(),
      data,
      done: true,
    });

    return new Response(`data: ${body}\n\n`, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(sse(event)));
      };

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(new Error("Research timed out after 60s")), 60_000);

      request.signal.addEventListener("abort", () => {
        abortController.abort(new Error("Client disconnected"));
      });

      const cleanup = () => {
        clearTimeout(timeout);
        abortController.abort();
      };

      try {
        send({ step: "IDENTIFY", message: "Resolving company…" });

        send({ step: "IDENTIFY", message: "Resolving company…" });

        const initialInput: Record<string, unknown> = { companyName };
        if (ticker) {
          initialInput.companyInfo = { name: name ?? companyName, ticker, industry: null, sector: null, description: null, marketCap: null, exchange: null };
        }

        const graphStream = await researchGraph.stream(
          initialInput,
          { streamMode: "updates", signal: abortController.signal }
        );

        const accumulatedState: Record<string, unknown> = {};

        for await (const update of graphStream) {
          const entries = Object.entries(update) as Array<
            [string, Record<string, unknown> | undefined]
          >;
          const [nodeName, state] = entries[0] ?? [];
          if (!state) continue;

          Object.assign(accumulatedState, state);

          if (accumulatedState.error) {
            cleanup();
            send({
              step: "ERROR",
              message: (accumulatedState.currentStep as string) ?? (accumulatedState.error as string),
              error: accumulatedState.error as string,
              done: true,
            });
            controller.close();
            return;
          }

          if (state.currentStep) {
            const stepMap: Record<string, SSEEvent["step"]> = {
              identify: "IDENTIFY",
              gather: "GATHER",
              analyze: "ANALYZE",
              decide: "DECIDE",
              persist: "PERSIST",
            };

            const step =
              nodeName === "persist" &&
              (state.currentStep as string).includes("COMPLETE")
                ? "COMPLETE"
                : stepMap[nodeName] ?? "IDENTIFY";

            const info = accumulatedState.companyInfo as Record<string, unknown> | undefined;
            const decision = accumulatedState.decision as Record<string, unknown> | undefined;

            send({
              step,
              message: state.currentStep as string,
              data: decision
                ? {
                    companyName: (info?.name as string) ?? "",
                    ticker: (info?.ticker as string) ?? "",
                    marketCap: (info?.marketCap as number | null) ?? null,
                    verdict: decision.verdict as string,
                    confidence: decision.confidence as number,
                    reasoning: decision.reasoning as Array<unknown>,
                    summary: decision.summary as string,
                    sources: (accumulatedState.sources as Array<unknown>) ?? [],
                  }
                : undefined,
            });
          }
        }

        cleanup();
        send({
          step: "COMPLETE",
          message: "Research complete",
          done: true,
        });
      } catch (err) {
        const aborted = (err as Error).name === "AbortError";
        send({
          step: "ERROR",
          message: aborted ? "Request cancelled or timed out" : (err as Error).message,
          error: aborted ? "Request cancelled or timed out" : (err as Error).message,
          done: true,
        });
      } finally {
        cleanup();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
