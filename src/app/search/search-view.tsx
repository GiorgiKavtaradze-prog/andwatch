"use client";


import { useCallback, useRef, useState } from "react";
import { setWatchlist } from "@/app/watchlist/actions";
import { RecommendationCard } from "@/components/recommendation-card";
import { toastError } from "@/components/ui/toast";
import { VibeSearchInput } from "@/components/vibe-search-input";
import type { VibePick } from "@/lib/search/types";
import { searchVibe } from "./actions";

type Phase =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; picks: VibePick[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };
export function SearchView() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const picksRef = useRef<VibePick[]>([]);
  const submit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setPhase({ kind: "searching" });
    const result = await searchVibe(q);
    if (result.status === "ok") {
      picksRef.current = result.picks;
      setPhase({ kind: "results", picks: result.picks });
    } else if (result.status === "empty") {
      setPhase({ kind: "empty" });
    } else {
      toastError("Search failed", result.message);
      setPhase({ kind: "error", message: result.message });
    }
  }, [query]);
  const toggleWatchlist = useCallback((movieId: number) => {
    const current = picksRef.current.find((p) => p.movie.id === movieId);
    if (!current) return;
    const nextAdded = !current.inWatchlist;
    const set = (added: boolean) =>
      setPhase((prev) =>
        prev.kind === "results"
          ? {
              ...prev,
              picks: prev.picks.map((p) =>
                p.movie.id === movieId ? { ...p, inWatchlist: added } : p,
              ),
            }
          : prev,
      );
    set(nextAdded);
    picksRef.current = picksRef.current.map((p) =>
      p.movie.id === movieId ? { ...p, inWatchlist: nextAdded } : p,
    );
    void setWatchlist(movieId, nextAdded).then((res) => {
      if (res.status === "error") {
        toastError("Could not update your watchlist", res.message);
        set(current.inWatchlist);
        picksRef.current = picksRef.current.map((p) =>
          p.movie.id === movieId ? { ...p, inWatchlist: current.inWatchlist } : p,
        );
      }
    });
  }, []);
  return (
    <div className="space-y-10">
      <header className="mx-auto max-w-2xl space-y-4 text-center">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
          Vibe search
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">
          What are you in the mood for?
        </h1>
        <p className="font-sans text-text-secondary">
          Describe a feeling, a theme, a night in. We'll find real movies that fit, personalized to
          your taste.
        </p>
        <VibeSearchInput
          value={query}
          onChange={setQuery}
          onSubmit={submit}
          loading={phase.kind === "searching"}
        />
      </header>
      {phase.kind === "searching" && (
        <p className="text-center font-sans text-text-secondary">Finding your picks…</p>
      )}
      {phase.kind === "empty" && (
        <div className="mx-auto max-w-md space-y-3 rounded-lg border border-border bg-surface-1 p-8 text-center">
          <h2 className="font-serif text-2xl font-medium text-text">No real matches for that</h2>
          <p className="font-sans text-text-secondary">
            We couldn't find catalog movies that fit. Try a different or broader vibe.
          </p>
        </div>
      )}
      {phase.kind === "error" && (
        <div className="mx-auto max-w-md space-y-3 rounded-lg border border-border bg-surface-1 p-8 text-center">
          <h2 className="font-serif text-2xl font-medium text-text">Search hit a snag</h2>
          <p className="font-sans text-text-secondary">{phase.message} Try again in a moment.</p>
        </div>
      )}
      {phase.kind === "results" && (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {phase.picks.map((pick) => (
            <RecommendationCard
              key={pick.movie.id}
              movie={pick.movie}
              reason={pick.reason}
              href={`/movie/${pick.movie.id}`}
              inWatchlist={pick.inWatchlist}
              onToggleWatchlist={() => toggleWatchlist(pick.movie.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
