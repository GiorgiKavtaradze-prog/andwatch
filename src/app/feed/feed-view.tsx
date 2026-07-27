"use client";


import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { setWatchlist } from "@/app/watchlist/actions";
import { RecommendationCard } from "@/components/recommendation-card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";

import { FEED_SIZE, type FeedPick, type GetFeedResult } from "@/lib/feed/types";
import { refreshFeed } from "./actions";

type Phase =
  | { kind: "no-profile" }
  | { kind: "loading" }
  | { kind: "populated"; picks: FeedPick[]; regenerating: boolean }
  | { kind: "thin-empty" }
  | { kind: "error" };

function initialPhase(initial: GetFeedResult): Phase {
  if (initial.status === "no-profile") return { kind: "no-profile" };
  if (initial.status === "empty") return { kind: "loading" };
  return { kind: "populated", picks: initial.picks, regenerating: initial.stale };
}

function shouldAutoRefresh(initial: GetFeedResult): boolean {
  return initial.status === "empty" || (initial.status === "ready" && initial.stale);
}

export function FeedView({ initial }: { initial: GetFeedResult }) {
  const [phase, setPhase] = useState<Phase>(() => initialPhase(initial));
  const autoFired = useRef(false);
  const picksRef = useRef<FeedPick[]>(phase.kind === "populated" ? phase.picks : []);
  useEffect(() => {
    if (phase.kind === "populated") picksRef.current = phase.picks;
  }, [phase]);

  const runRefresh = useCallback(async (hadFeed: boolean) => {
    const result = await refreshFeed();
    if (result.status === "ready") {
      if (result.picks.length === 0) setPhase({ kind: "thin-empty" });
      else setPhase({ kind: "populated", picks: result.picks, regenerating: false });
      return;
    }
    if (result.status === "no-profile") {
      setPhase({ kind: "no-profile" });
      return;
    }

    toastError("Could not refresh your feed", result.message);
    if (hadFeed) {
      setPhase((prev) => (prev.kind === "populated" ? { ...prev, regenerating: false } : prev));
    } else {
      setPhase({ kind: "error" });
    }
  }, []);


  useEffect(() => {
    if (autoFired.current) return;
    if (!shouldAutoRefresh(initial)) return;
    autoFired.current = true;
    void runRefresh(initial.status === "ready");
  }, [initial, runRefresh]);

  const manualRefresh = useCallback(() => {
    setPhase((prev) =>
      prev.kind === "populated" ? { ...prev, regenerating: true } : { kind: "loading" },
    );
    void runRefresh(phase.kind === "populated");
  }, [phase.kind, runRefresh]);

  const toggleWatchlist = useCallback((movieId: number) => {
    const current = picksRef.current.find((p) => p.movie.id === movieId);
    if (!current) return;
    const nextAdded = !current.inWatchlist;
    const setInWatchlist = (added: boolean) =>
      setPhase((prev) =>
        prev.kind === "populated"
          ? {
              ...prev,
              picks: prev.picks.map((p) =>
                p.movie.id === movieId ? { ...p, inWatchlist: added } : p,
              ),
            }
          : prev,
      );

    setInWatchlist(nextAdded);
    void setWatchlist(movieId, nextAdded).then((res) => {
      if (res.status === "error") {
        toastError("Could not update your watchlist", res.message);
        setInWatchlist(current.inWatchlist);
      }
    });
  }, []);

  return (
    <div className="space-y-8">
      <FeedHeader
        onRefresh={manualRefresh}
        refreshing={phase.kind === "loading" || (phase.kind === "populated" && phase.regenerating)}
        showRefresh={phase.kind === "populated" || phase.kind === "thin-empty"}
      />

      {phase.kind === "no-profile" && <NoProfile />}
      {phase.kind === "loading" && <FeedGridSkeleton />}
      {phase.kind === "error" && <FeedError onRetry={manualRefresh} />}
      {phase.kind === "thin-empty" && <ThinEmpty />}
      {phase.kind === "populated" && (
        <FeedGrid
          picks={phase.picks}
          dimmed={phase.regenerating}
          onToggleWatchlist={toggleWatchlist}
        />
      )}
    </div>
  );
}

function FeedHeader({
  onRefresh,
  refreshing,
  showRefresh,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  showRefresh: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
          For you
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">Your feed</h1>
        <p className="max-w-prose font-sans text-text-secondary">
          Personal picks ranked to your taste, each with a reason it fits you.
        </p>
      </div>
      {showRefresh && (
        <Button variant="secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
          {refreshing ? "Refreshing" : "Refresh"}
        </Button>
      )}
    </header>
  );
}

function FeedGrid({
  picks,
  dimmed,
  onToggleWatchlist,
}: {
  picks: FeedPick[];
  dimmed: boolean;
  onToggleWatchlist: (movieId: number) => void;
}) {
  return (
    <div
      className={
        dimmed
          ? "grid grid-cols-2 gap-6 opacity-60 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "grid grid-cols-2 gap-6 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      }
      aria-busy={dimmed}
    >
      {picks.map((pick) => (
        <RecommendationCard
          key={pick.movie.id}
          movie={pick.movie}
          reason={pick.reason}
          href={`/movie/${pick.movie.id}`}
          inWatchlist={pick.inWatchlist}
          onToggleWatchlist={() => onToggleWatchlist(pick.movie.id)}
        />
      ))}
    </div>
  );
}

function FeedGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: FEED_SIZE }).map((_, i) => (
        <RecommendationCard
          key={i}
          loading
          movie={{} as FeedPick["movie"]}
          reason=""
          inWatchlist={false}
          onToggleWatchlist={() => {}}
        />
      ))}
    </div>
  );
}

function NoProfile() {
  return (
    <EmptyState
      title="Build your taste profile first"
      body="We need a taste profile before we can pick for you. Import your Letterboxd or IMDb history, or build one through a quick onboarding."
    >
      <Button asChild>
        <Link href="/import">Import your ratings</Link>
      </Button>
      <Button variant="secondary" asChild>
        <Link href="/onboarding">Build one with onboarding</Link>
      </Button>
    </EmptyState>
  );
}

function ThinEmpty() {
  return (
    <EmptyState
      title="No unseen picks right now"
      body="You have rated most of what we can match against, so there is nothing new to show yet. As the catalog grows, fresh picks will appear here."
    />
  );
}

function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="We could not build your feed"
      body="Something went wrong while generating your picks. Your existing feed, if any, is untouched. Try again."
    >
      <Button onClick={onRetry}>Try again</Button>
    </EmptyState>
  );
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-surface-1 p-8 text-center">
      <h2 className="font-serif text-2xl font-medium text-text">{title}</h2>
      <p className="font-sans text-text-secondary">{body}</p>
      {children && <div className="flex flex-wrap justify-center gap-3 pt-2">{children}</div>}
    </div>
  );
}
