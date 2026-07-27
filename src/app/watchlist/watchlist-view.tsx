"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { RecommendationCard } from "@/components/recommendation-card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";
import type { Movie } from "@/lib/catalog/types";
import { setWatchlist } from "./actions";

export function WatchlistView({ initial }: { initial: Movie[] }) {
  const [items, setItems] = useState<Movie[]>(initial);
  const remove = useCallback(async (movie: Movie) => {
    setItems((prev) => prev.filter((m) => m.id !== movie.id));
    const res = await setWatchlist(movie.id, false);
    if (res.status === "error") {
      setItems((prev) => (prev.some((m) => m.id === movie.id) ? prev : [movie, ...prev]));
      toastError("Could not remove from your watchlist", res.message);
    }
  }, []);
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-surface-1 p-8 text-center">
        <h2 className="font-serif text-2xl font-medium text-text">Your watchlist is empty</h2>
        <p className="font-sans text-text-secondary">
          Save movies from your feed or a vibe search and they'll show up here.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild>
            <Link href="/feed">Go to your feed</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/search">Try vibe search</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((movie) => (
        <RecommendationCard
          key={movie.id}
          movie={movie}
          reason=""
          href={`/movie/${movie.id}`}
          inWatchlist
          onToggleWatchlist={() => remove(movie)}
        />
      ))}
    </div>
  );
}
