"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PosterImage } from "@/components/poster-image";
import { RecommendationCard } from "@/components/recommendation-card";
import { SwipeCard } from "@/components/swipe-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { VibeSearchInput } from "@/components/vibe-search-input";
import type { Movie } from "@/lib/catalog/types";

const MOCK_MOVIE: Movie = {
  id: 27205,
  title: "Inception",
  release_year: 2010,
  overview: "A thief who steals corporate secrets through dream-sharing technology.",
  poster_path: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
  genres: [
    { id: 28, name: "Action" },
    { id: 878, name: "Science Fiction" },
    { id: 12, name: "Adventure" },
  ],
  runtime_minutes: 148,
  imdb_id: "tt1375666",
  directors: [{ id: 525, name: "Christopher Nolan" }],
  top_cast: [{ id: 6193, name: "Leonardo DiCaprio", character: "Cobb" }],
  keywords: [{ id: 1, name: "dream" }],
  vote_average: 8.4,
  vote_count: 34000,
  popularity: 120.5,
  synced_at: "2026-07-01T00:00:00Z",
};

const MOCK_MOVIE_NO_POSTER: Movie = {
  ...MOCK_MOVIE,
  id: 99999,
  title: "The Undiscovered Country",
  release_year: 1991,
  poster_path: null,
  genres: [{ id: 18, name: "Drama" }],
  runtime_minutes: 113,
};

const EXAMPLES = [
  "A cozy rainy-day mystery",
  "Neon-soaked 80s sci-fi",
  "Slow-burn character drama",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <h2 className="font-serif text-2xl font-medium text-text">{title}</h2>
      {children}
    </section>
  );
}

export default function PreviewPage() {
  const [vibe, setVibe] = useState("");
  const [vibeLoading, setVibeLoading] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inputError, setInputError] = useState(false);

  return (
    <AppShell activeHref="/feed" userName="Jane Moviegoer">
      <div className="flex flex-col gap-12">
        <header className="flex flex-col gap-2">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
            Dev preview · not shipped
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">
            Reel design system
          </h1>
        </header>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Notify" onClick={() => toast("Icon button clicked")}>
              <span aria-hidden="true">★</span>
            </Button>
          </div>
        </Section>

        <Section title="Input & Label">
          <div className="flex max-w-sm flex-col gap-2">
            <Label htmlFor="preview-input">Email</Label>
            <Input
              id="preview-input"
              placeholder="you@example.com"
              error={inputError}
              aria-describedby={inputError ? "preview-input-error" : undefined}
            />
            {inputError && (
              <p id="preview-input-error" className="font-sans text-sm text-danger">
                Please enter a valid email.
              </p>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => setInputError((v) => !v)}
            >
              Toggle error state
            </Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section title="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>About this recommendation</DialogTitle>
                <DialogDescription>
                  A modal surface with scrim, focus trap, and Escape-to-close from Radix.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="primary">Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section title="Skeleton">
          <SkeletonRegion label="Loading preview" className="flex max-w-sm flex-col gap-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </SkeletonRegion>
        </Section>

        <Section title="Card">
          <Card interactive className="max-w-sm">
            <CardHeader>
              <h3 className="font-serif text-xl font-medium text-text">Interactive card</h3>
            </CardHeader>
            <CardContent>
              <p className="font-sans text-sm text-text-secondary">
                Surface-1, hairline border, shadow-e1, lifting to e2 on hover.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section title="PosterImage (with + without poster)">
          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <PosterImage posterPath={MOCK_MOVIE.poster_path} title={MOCK_MOVIE.title} />
            <PosterImage
              posterPath={MOCK_MOVIE_NO_POSTER.poster_path}
              title={MOCK_MOVIE_NO_POSTER.title}
            />
          </div>
        </Section>

        <Section title="RecommendationCard">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <RecommendationCard
              movie={MOCK_MOVIE}
              reason="Because you love mind-bending heists with immaculate craft."
              href="/movie/27205"
              inWatchlist={inWatchlist}
              onToggleWatchlist={() => {
                setInWatchlist((v) => !v);
                toast(inWatchlist ? "Removed from watchlist" : "Added to watchlist");
              }}
            />
            <RecommendationCard
              movie={MOCK_MOVIE_NO_POSTER}
              reason="A quiet drama for a reflective evening."
              href="/movie/99999"
              inWatchlist={false}
              onToggleWatchlist={() => toast("Toggled watchlist")}
            />
            <RecommendationCard
              movie={MOCK_MOVIE}
              reason=""
              inWatchlist={false}
              onToggleWatchlist={() => {}}
              loading
            />
          </div>
        </Section>

        <Section title="SwipeCard">
          <SwipeCard
            movie={MOCK_MOVIE}
            onLike={() => toast("Liked")}
            onDislike={() => toast("Disliked")}
          />
        </Section>

        <Section title="VibeSearchInput">
          <div className="max-w-xl">
            <VibeSearchInput
              value={vibe}
              onChange={setVibe}
              onSubmit={() => {
                setVibeLoading(true);
                toast(`Searching: ${vibe}`);
                setTimeout(() => setVibeLoading(false), 1200);
              }}
              examples={EXAMPLES}
              loading={vibeLoading}
            />
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
