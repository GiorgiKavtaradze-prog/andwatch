"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import type { Movie } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { PosterImage } from "./poster-image";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Skeleton, SkeletonRegion } from "./ui/skeleton";

export interface RecommendationCardProps {
  movie: Movie;
  /** The "why this fits you" line, rendered as a Fraunces-italic pull quote. */
  reason: string;
  /** Detail page link. When omitted, the card is non-navigational. */
  href?: string;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  loading?: boolean;
}

function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function RecommendationCard({
  movie,
  reason,
  href,
  inWatchlist,
  onToggleWatchlist,
  loading = false,
}: RecommendationCardProps) {
  if (loading) {
    return (
      <Card className="p-4">
        <SkeletonRegion label={`Loading recommendation`} className="flex flex-col gap-4">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </SkeletonRegion>
      </Card>
    );
  }

  const runtime = formatRuntime(movie.runtime_minutes);
  const genres = movie.genres?.slice(0, 2) ?? [];
  const WatchlistIcon = inWatchlist ? BookmarkCheck : Bookmark;

  return (
    <Card
      interactive={Boolean(href)}
      className={cn(
        "group relative flex flex-col",
        href &&
          "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-canvas",
      )}
    >
      <div className="relative overflow-hidden rounded-lg">
        <PosterImage
          posterPath={movie.poster_path}
          title={movie.title}
          className="rounded-none transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] group-hover:scale-[1.04]"
        />
        <button
          type="button"
          onClick={onToggleWatchlist}
          aria-pressed={inWatchlist}
          aria-label={
            inWatchlist ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`
          }
          className="absolute right-2 top-2 z-10 inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface-1/80 text-text backdrop-blur-sm outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <WatchlistIcon
            className={cn("size-5", inWatchlist && "text-accent")}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-serif text-xl font-medium leading-tight text-text">
          {href ? (
            <a href={href} className="outline-none after:absolute after:inset-0 after:content-['']">
              {movie.title}
            </a>
          ) : (
            movie.title
          )}
        </h3>

        <div className="flex flex-wrap items-center gap-2 font-sans text-sm text-text-secondary">
          {movie.release_year != null && <span>{movie.release_year}</span>}
          {runtime && (
            <>
              <span aria-hidden="true" className="text-text-muted">
                &middot;
              </span>
              <span>{runtime}</span>
            </>
          )}
          {genres.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <Badge key={g.id} variant="outline" size="sm">
                  {g.name}
                </Badge>
              ))}
            </span>
          )}
        </div>

        {reason && (
          <p className="mt-1 font-serif text-base italic leading-relaxed text-text-secondary">
            &ldquo;{reason}&rdquo;
          </p>
        )}
      </div>
    </Card>
  );
}
