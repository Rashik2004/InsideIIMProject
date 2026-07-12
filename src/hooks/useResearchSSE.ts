"use client";

import { useState, useRef, useCallback } from "react";
import type { SSEEvent, GraphStep } from "@/lib/schemas";

interface ResearchState {
  step: GraphStep;
  message: string;
  data: SSEEvent["data"] | null;
  error: string | null;
  done: boolean;
  loading: boolean;
}

const initialState: ResearchState = {
  step: "IDENTIFY",
  message: "",
  data: null,
  error: null,
  done: false,
  loading: false,
};

export function useResearchSSE() {
  const [state, setState] = useState<ResearchState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => setState(initialState), []);

  const research = useCallback(async (companyName: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setState({ ...initialState, loading: true });

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err.error ?? `HTTP ${res.status}`,
          done: true,
        }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            setState((prev) => ({
              ...prev,
              step: event.step,
              message: event.message,
              data: event.data ?? prev.data,
              error: event.error ?? prev.error,
              loading: !event.done,
              done: event.done ?? false,
            }));
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message,
        done: true,
      }));
    }
  }, []);

  return { state, research, reset };
}
