"use client";

import { SkipForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";
import type { Movie } from "@/lib/catalog/types";
import {
  GENRES,
  MAX_GENRES,
  MIN_GENRES,
  ONBOARDING_MIN_DECISIONS,
} from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";
import { completeOnboarding, getOnboardingDeck, type OnboardingSwipe } from "./actions";

type Step = "genres" | "swipe" | "finishing" | "thin";

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("genres");
  const [selected, setSelected] = useState<string[]>([]);
  const [deck, setDeck] = useState<Movie[]>([]);
  const [index, setIndex] = useState(0);
  const [swipes, setSwipes] = useState<OnboardingSwipe[]>([]);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const refilling = useRef(false);

  const decisions = swipes.length;
  const remaining = Math.max(0, ONBOARDING_MIN_DECISIONS - decisions);
  const current = deck[index];

  const toggleGenre = useCallback((genre: string) => {
    setSelected((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length >= MAX_GENRES
          ? prev
          : [...prev, genre],
    );
  }, []);

  const startSwiping = useCallback(async () => {
    setLoadingDeck(true);
    const result = await getOnboardingDeck(selected);
    setLoadingDeck(false);
    if (result.deck.length === 0) {
      setStep("thin");
      return;
    }
    setDeck(result.deck);
    setIndex(0);
    setStep("swipe");
  }, [selected]);

  useEffect(() => {
    if (step !== "swipe") return;
    if (index < deck.length) return;
    if (decisions >= ONBOARDING_MIN_DECISIONS) return;
    if (refilling.current) return;
    refilling.current = true;
    (async () => {
      const result = await getOnboardingDeck(
        selected,
        deck.map((m) => m.id),
      );
      const known = new Set(deck.map((m) => m.id));
      const fresh = result.deck.filter((m) => !known.has(m.id));
      if (fresh.length === 0) setStep("thin");
      else setDeck((prev) => [...prev, ...fresh]);
      refilling.current = false;
    })();
  }, [step, index, deck, decisions, selected]);

  const decide = useCallback((movieId: number, liked: boolean) => {
    setSwipes((prev) => [...prev, { movieId, liked }]);
    setIndex((i) => i + 1);
  }, []);

  const skip = useCallback(() => setIndex((i) => i + 1), []);

  const finish = useCallback(async () => {
    setStep("finishing");
    const result = await completeOnboarding(swipes);
    if (result.status === "computed") {
      router.push("/feed");
      return;
    }
    if (result.status === "below-floor") {
      setStep("thin");
      return;
    }
    toastError("Could not finish onboarding", result.error);
    setStep("swipe");
  }, [swipes, router]);

  if (step === "genres") {
    const ok = selected.length >= MIN_GENRES && selected.length <= MAX_GENRES;
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <Intro
          title="What do you like to watch?"
          body={`Pick ${MIN_GENRES} to ${MAX_GENRES} genres. We'll show you movies to react to, then build your feed.`}
        />
        <div className="flex flex-wrap gap-3">
          {GENRES.map((genre) => {
            const isOn = selected.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                aria-pressed={isOn}
                className={cn(
                  "rounded-full border px-4 py-2 font-sans text-sm outline-none transition-colors duration-var(--duration-fast) ease-var(--ease-standard) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                  isOn
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface-1 text-text hover:bg-surface-2 hover:border-border-strong",
                )}
              >
                {genre}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={startSwiping} disabled={!ok || loadingDeck}>
            {loadingDeck ? "Loading movies" : "Start swiping"}
          </Button>
          <span className="font-sans text-sm text-text-muted">
            {selected.length}/{MAX_GENRES} picked
          </span>
        </div>
      </div>
    );
  }

  if (step === "finishing") {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <Intro
          title="Building your feed"
          body="Reading your taste and picking movies for you. One moment."
        />
      </div>
    );
  }

  if (step === "thin") {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border bg-surface-1 p-8 text-center">
        <h2 className="font-serif text-2xl font-medium text-text">Not enough to go on yet</h2>
        <p className="font-sans text-text-secondary">
          There aren't enough movies in our catalog to build a reliable profile from these picks
          yet. Your reactions are saved. Try more genres, or import your ratings for a fuller start.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button variant="secondary" onClick={() => setStep("genres")}>
            Pick different genres
          </Button>
          <Button asChild>
            <a href="/import">Import your ratings</a>
          </Button>
        </div>
      </div>
    );
  }
  const deckExhausted = index >= deck.length;
  const canFinish = decisions >= ONBOARDING_MIN_DECISIONS;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-8">
      <div className="w-full space-y-3 text-center">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
          {canFinish ? "Ready when you are" : `${remaining} more to go`}
        </p>
        <Progress value={decisions} max={ONBOARDING_MIN_DECISIONS} />
      </div>

      {current ? (
        <>
          <SwipeCard
            key={current.id}
            movie={current}
            onLike={() => decide(current.id, true)}
            onDislike={() => decide(current.id, false)}
          />
          <Button variant="ghost" size="sm" onClick={skip}>
            <SkipForward aria-hidden="true" />
            Skip this one
          </Button>
        </>
      ) : deckExhausted && canFinish ? (
        <p className="font-sans text-text-secondary">
          That's a great start. Build your feed below.
        </p>
      ) : (
        <p className="font-sans text-text-secondary">Finding more movies for you…</p>
      )}

      <Button onClick={finish} disabled={!canFinish}>
        {canFinish ? "Build my feed" : `Rate ${remaining} more`}
      </Button>
    </div>
  );
}

function Intro({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
        Onboarding
      </p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">{title}</h1>
      <p className="mx-auto max-w-prose font-sans text-text-secondary">{body}</p>
    </div>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.min(value, max)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-var(--duration-base) ease-var(--ease-standard)"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
