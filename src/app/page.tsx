"use client";

import { useResearchSSE } from "@/hooks/useResearchSSE";
import { ResearchInput } from "@/components/ResearchInput";
import { StepTimeline } from "@/components/StepTimeline";
import { VerdictCard } from "@/components/VerdictCard";

export default function Home() {
  const { state, research, reset } = useResearchSSE();

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Research Agent</h1>
            <p className="text-sm text-zinc-500">AI-powered investment research</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            What company should we research?
          </h2>
          <p className="text-sm text-zinc-500">
            Enter a publicly traded company name to get an AI-powered Invest / Pass / Hold decision.
          </p>
        </div>

        <ResearchInput onSubmit={research} disabled={state.loading} />

        {state.loading && (
          <StepTimeline
            currentStep={state.step}
            message={state.message}
            loading={state.loading}
          />
        )}

        {state.error && !state.loading && (
          <div className="w-full max-w-2xl mx-auto rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
            {state.error}
          </div>
        )}

        {state.done && state.data && !state.loading && (
          <div className="space-y-6">
            <VerdictCard
              companyName={state.data.companyName ?? ""}
              ticker={state.data.ticker ?? ""}
              marketCap={state.data.marketCap ?? null}
              verdict={state.data.verdict}
              confidence={state.data.confidence}
              reasoning={state.data.reasoning}
              summary={state.data.summary}
              sources={state.data.sources ?? []}
            />
            <div className="flex justify-center">
              <button
                onClick={reset}
                className="rounded-lg px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Research another company
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
