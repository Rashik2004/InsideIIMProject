"use client";

import { motion, AnimatePresence } from "motion/react";
import type { GraphStep } from "@/lib/schemas";

interface StepTimelineProps {
  currentStep: GraphStep;
  message: string;
  loading: boolean;
}

const steps: { key: GraphStep; label: string }[] = [
  { key: "IDENTIFY", label: "Identifying company" },
  { key: "GATHER", label: "Gathering data" },
  { key: "ANALYZE", label: "Analyzing" },
  { key: "DECIDE", label: "Deciding" },
  { key: "PERSIST", label: "Saving results" },
];

function stepIndex(step: GraphStep): number {
  const idx = steps.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : steps.length;
}

export function StepTimeline({ currentStep, message, loading }: StepTimelineProps) {
  const activeIdx = stepIndex(currentStep);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-2">
      {steps.map((step, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        const isPending = i > activeIdx;

        return (
          <motion.div
            key={step.key}
            initial={{ opacity: 0, x: -16 }}
            animate={{
              opacity: isPending ? 0.4 : 1,
              x: 0,
            }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className={`flex items-center gap-4 rounded-xl px-4 py-3 transition-colors ${
              isActive && loading ? "bg-zinc-100 dark:bg-zinc-800" : ""
            }`}
          >
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
              {isPast ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white text-sm"
                >
                  ✓
                </motion.div>
              ) : isActive && loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="h-7 w-7 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100"
                />
              ) : (
                <div className="h-3 w-3 rounded-full bg-zinc-300 dark:bg-zinc-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span
                className={`text-sm font-medium ${
                  isActive && loading
                    ? "text-zinc-900 dark:text-zinc-100"
                    : isPast
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {step.label}
              </span>
              {isActive && message && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate"
                >
                  {message}
                </motion.p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
