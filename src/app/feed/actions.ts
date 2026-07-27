"use server";

import type { Movie } from "@/lib/catalog";
import { MOVIE_COLUMNS } from "@/lib/catalog/types";
import type { FeedPick, GetFeedResult, RefreshFeedResult } from "@/lib/feed";
import { generateFeed, isFeedStale, readWatchlistIds } from "@/lib/feed";
import { createClient } from "@/lib/supabase/server";

interface RecommendationRow {
  rank: number;
  score: number;
  reason: string;
  generated_at: string;
  movie: Movie | Movie[] | null;
}

function oneMovie(movie: Movie | Movie[] | null): Movie | null {
  return Array.isArray(movie) ? (movie[0] ?? null) : movie;
}

export async function getFeed(): Promise<GetFeedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "no-profile" };

  const { data: profile } = await supabase
    .from("taste_profiles")
    .select("computed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const computedAt = (profile?.computed_at as string | null) ?? null;
  if (!computedAt) return { status: "no-profile" };

  const { data: rows } = await supabase
    .from("recommendations")
    .select(`rank, score, reason, generated_at, movie:movies(${MOVIE_COLUMNS})`)
    .eq("user_id", user.id)
    .order("rank", { ascending: true });

  const recs = (rows ?? []) as unknown as RecommendationRow[];
  if (recs.length === 0) return { status: "empty" };

  const watchlist = await readWatchlistIds(supabase, user.id);
  const maxGeneratedAt = recs.reduce<string | null>(
    (max, r) => (max && max >= r.generated_at ? max : r.generated_at),
    null,
  );

  const picks: FeedPick[] = [];
  for (const r of recs) {
    const movie = oneMovie(r.movie);
    if (!movie) continue;
    picks.push({
      movie,
      rank: r.rank,
      score: r.score,
      reason: r.reason,
      inWatchlist: watchlist.has(movie.id),
    });
  }

  return { status: "ready", picks, stale: isFeedStale(computedAt, maxGeneratedAt) };
}

export async function refreshFeed(): Promise<RefreshFeedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "You must be signed in." };

  const result = await generateFeed(supabase, user.id);
  if (result.status === "ok") return { status: "ready", picks: result.picks };
  if (result.status === "no-profile") return { status: "no-profile" };
  return { status: "error", message: result.message };
}
