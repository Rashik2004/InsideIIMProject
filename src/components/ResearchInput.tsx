"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";

interface Suggestion {
  symbol: string;
  name: string;
}

interface ResearchInputProps {
  onSubmit: (companyName: string) => void;
  disabled: boolean;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ResearchInput({ onSubmit, disabled }: ResearchInputProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, { results: Suggestion[]; time: number }>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const debouncedValue = useDebounce(value, 300);

  useEffect(() => {
    if (!debouncedValue || debouncedValue.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const cache = cacheRef.current;
    const cached = cache.get(debouncedValue);
    if (cached && Date.now() - cached.time < 60_000) {
      setSuggestions(cached.results);
      setShowDropdown(cached.results.length > 0);
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    fetch(`/api/search?q=${encodeURIComponent(debouncedValue)}`, { signal: abort.signal })
      .then((r) => r.json() as Promise<Suggestion[]>)
      .then((results) => {
        cache.set(debouncedValue, { results, time: Date.now() });
        setSuggestions(results);
        setShowDropdown(results.length > 0);
        setSelectedIndex(-1);
      })
      .catch(() => {});

    return () => abort.abort();
  }, [debouncedValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (s: Suggestion) => {
    setValue("");
    setShowDropdown(false);
    onSubmit(s.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
    setShowDropdown(false);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto relative">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
            placeholder="Enter a company name (e.g., Apple, Tesla, Microsoft)"
            disabled={disabled}
            className="w-full rounded-xl border border-zinc-300 bg-white px-5 py-3 text-base shadow-sm
                       outline-none transition-colors focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200
                       disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900
                       dark:focus:border-zinc-400 dark:focus:ring-zinc-800"
          />
          {showDropdown && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            >
              {suggestions.map((s, i) => (
                <button
                  type="button"
                  key={`${s.symbol}-${i}`}
                  onClick={() => selectSuggestion(s)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                    ${i === selectedIndex ? "bg-zinc-100 dark:bg-zinc-800" : ""}
                    hover:bg-zinc-50 dark:hover:bg-zinc-800`}
                >
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{s.name}</span>
                  <span className="ml-2 text-xs text-zinc-400">{s.symbol}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="rounded-xl bg-zinc-900 px-6 py-3 text-base font-medium text-white
                     transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40
                     dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {disabled ? "Researching…" : "Research"}
        </button>
      </div>
    </form>
  );
}
