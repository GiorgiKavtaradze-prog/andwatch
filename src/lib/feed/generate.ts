import type { SupabaseClient } from "@supabase/supabase-js";
import type { Movie } from "@/lib/catalog";
import { matchFeedCandidates } from "./candidates";
import { writeReasons } from "./reasons";
import type {
  FeedCandidate,
  FeedPick,
  GenerateFeedResult,
  TasteSummary,
} from "./types";

const SUMMARY_GENRES = 3;
const SUMMARY_TITLES = 5;

interface TasteProfileRow {
  vector: string | number[] | null;
  genre_affinities: Record<string, number> | null;
}

export async function readWatchlistIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<number>> {
  const { data } = await supabase
    .from("watchlist_items")
    .select("movie_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.movie_id as number));
}

function topGenres(affinities: Record<string, number> | null): string[] {
  if (!affinities) return [];
  return Object.entries(affinities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, SUMMARY_GENRES)
    .map(([name]) => name);
}

async function topRatedTitles(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("ratings")
    .select("normalized_value, movie:movies(title)")
    .eq("user_id", userId)
    .order("normalized_value", { ascending: false })
    .limit(SUMMARY_TITLES);
  const titles: string[] = [];
  for (const row of data ?? []) {
    const movieRaw = (
      row as { movie: { title: string } | { title: string }[] | null }
    ).movie;
    const movie = Array.isArray(movieRaw) ? movieRaw[0] : movieRaw;
    if (movie?.title) titles.push(movie.title);
  }
  return titles;
}

export function isFeedStale(
  computedAt: string | null,
  maxGeneratedAt: string | null,
): boolean {
  if (!maxGeneratedAt) return true;
  if (!computedAt) return false;
  return Date.parse(computedAt) > Date.parse(maxGeneratedAt);
}

function toPicks(
  candidates: FeedCandidate[],
  reasons: Map<number, string>,
  watchlist: Set<number>,
): FeedPick[] {
  return candidates.map((c, i) => ({
    movie: c.movie,
    rank: i + 1,
    score: c.score,
    reason: reasons.get(c.movie.id) ?? "Picked to match your taste.",
    inWatchlist: watchlist.has(c.movie.id),
  }));
}

export async function generateFeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<GenerateFeedResult> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("taste_profiles")
      .select("vector, genre_affinities")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const row = profile as TasteProfileRow | null;
    const vector = row?.vector;
    if (!row || vector == null) return { status: "no-profile" };

    const vectorLiteral =
      typeof vector === "string" ? vector : `[${vector.join(",")}]`;

    const candidates = await matchFeedCandidates(supabase, vectorLiteral);

    if (candidates.length === 0) {
      const { error } = await supabase.rpc("replace_recommendations", {
        rows: [],
      });
      if (error) throw new Error(error.message);
      return { status: "ok", picks: [] };
    }

    const taste: TasteSummary = {
      topGenres: topGenres(row.genre_affinities),
      topTitles: await topRatedTitles(supabase, userId),
    };

    const reasons = await writeReasons(candidates, taste);

    const rows = candidates.map((c, i) => ({
      movie_id: c.movie.id,
      rank: i + 1,
      score: c.score,
      reason: reasons.get(c.movie.id) ?? "Picked to match your taste.",
    }));
    const { error: replaceError } = await supabase.rpc(
      "replace_recommendations",
      { rows },
    );
    if (replaceError) throw new Error(replaceError.message);

    const watchlist = await readWatchlistIds(supabase, userId);
    return { status: "ok", picks: toPicks(candidates, reasons, watchlist) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not build your feed.";
    return { status: "error", message };
  }
}

export type { Movie };
