"use client";

import { motion } from "motion/react";
import type { Decision, Source, Verdict } from "@/lib/schemas";

interface VerdictCardProps {
  companyName: string;
  ticker: string;
  marketCap: number | null;
  verdict: Verdict;
  confidence: number;
  reasoning: Decision["reasoning"];
  summary: string;
  sources: Source[];
}

function formatMarketCap(mc: number | null): string {
  if (!mc) return "N/A";
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`;
  return mc.toLocaleString();
}

const verdictColors: Record<Verdict, { bg: string; text: string; border: string }> = {
  INVEST: {
    bg: "bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  PASS: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  HOLD: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-200 dark:border-yellow-800",
  },
};

export function VerdictCard({ companyName, ticker, marketCap, verdict, confidence, reasoning, summary, sources }: VerdictCardProps) {
  const colors = verdictColors[verdict];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className={`w-full max-w-2xl mx-auto rounded-2xl border ${colors.border} ${colors.bg} p-6 space-y-5`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <motion.h2
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate"
          >
            {companyName}
            <span className="ml-2 text-base font-normal text-zinc-500">({ticker})</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-sm text-zinc-500 mt-0.5"
          >
            Market Cap: {formatMarketCap(marketCap)}
          </motion.p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <motion.span
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={`text-3xl font-bold tracking-tight ${colors.text}`}
          >
            {verdict}
          </motion.span>
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="text-right"
          >
            <div className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">
              {(confidence * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-zinc-500">confidence</div>
          </motion.div>
        </div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
      >
        {summary}
      </motion.p>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Key Factors</h4>
        {reasoning.map((factor, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="flex items-start gap-3 rounded-lg bg-white/60 dark:bg-black/20 p-3"
          >
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide
                ${verdictColors[factor.impact as Verdict]?.text ?? "text-zinc-500"}
                ${verdictColors[factor.impact as Verdict]?.bg ?? "bg-zinc-100"}`}
            >
              {factor.impact}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {factor.factor}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {factor.detail}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sources</h4>
          <div className="flex flex-wrap gap-2">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-white/60 dark:bg-black/20 px-3 py-1 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
              >
                {s.title.slice(0, 40)}
              </a>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
