"use client";

import { useCallback, useRef, useState } from "react";
import { setWatchlist } from "@/app/watchlist/actions";
import { RecommendationCard } from "@/components/recommendation-card";
import { toastError } from "@/components/ui/toast";
import type { HomeRow } from "@/lib/rows/types";

export function HomeRows({ initial }: { initial: HomeRow[] }) {
  const [rows, setRows] = useState<HomeRow[]>(initial);
  const rowsRef = useRef<HomeRow[]>(initial);

  const setInWatchlist = useCallback((movieId: number, added: boolean) => {
    const apply = (list: HomeRow[]): HomeRow[] =>
      list.map((row) => ({
        ...row,
        picks: row.picks.map((p) => (p.movie.id === movieId ? { ...p, inWatchlist: added } : p)),
      }));
    rowsRef.current = apply(rowsRef.current);
    setRows(rowsRef.current);
  }, []);

  const toggle = useCallback(
    (movieId: number) => {
      const pick = rowsRef.current.flatMap((r) => r.picks).find((p) => p.movie.id === movieId);
      if (!pick) return;
      const next = !pick.inWatchlist;
      setInWatchlist(movieId, next);
      void setWatchlist(movieId, next).then((res) => {
        if (res.status === "error") {
          toastError("Could not update your watchlist", res.message);
          setInWatchlist(movieId, !next);
        }
      });
    },
    [setInWatchlist],
  );

  return (
    <div className="space-y-10">
      {rows.map((row) => (
        <section key={row.key} className="space-y-4">
          <h2 className="font-serif text-2xl font-medium text-text">{row.title}</h2>
          <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-2 scrollbar-thin">
            {row.picks.map((pick) => (
              <div key={pick.movie.id} className="w-44 shrink-0 sm:w-48">
                <RecommendationCard
                  movie={pick.movie}
                  reason={pick.reason}
                  href={`/movie/${pick.movie.id}`}
                  inWatchlist={pick.inWatchlist}
                  onToggleWatchlist={() => toggle(pick.movie.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
