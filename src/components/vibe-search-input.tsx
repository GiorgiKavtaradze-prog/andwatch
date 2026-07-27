"use client";

import { Loader2, Sparkles } from "lucide-react";
import { type FormEvent, useId } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

export interface VibeSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Optional example prompts rendered as chips that fill the input. */
  examples?: string[];
  loading?: boolean;
  placeholder?: string;
}

export function VibeSearchInput({
  value,
  onChange,
  onSubmit,
  examples = [],
  loading = false,
  placeholder = "Describe a vibe…",
}: VibeSearchInputProps) {
  const inputId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || value.trim() === "") return;
    onSubmit();
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: design spec mandates a <form role="search"> search landmark.
    <form role="search" onSubmit={handleSubmit} aria-busy={loading || undefined} className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Describe a movie vibe to search
      </label>

      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 transition-[box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-standard)]",
          "focus-within:border-accent focus-within:shadow-glow focus-within:ring-2 focus-within:ring-ring",
        )}
      >
        <Sparkles className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent font-sans text-base text-text outline-none placeholder:text-text-muted disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={loading || value.trim() === ""}
          aria-label="Search"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-accent-hover active:bg-accent-active focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {examples.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="sr-only">Example searches</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onChange(example)}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <Badge
                variant="outline"
                className="cursor-pointer transition-colors hover:border-border-strong hover:text-text"
              >
                {example}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
