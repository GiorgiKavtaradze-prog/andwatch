import type { SupabaseClient } from "@supabase/supabase-js";
import type { Movie } from "@/lib/catalog";
import { FEED_POOL_SIZE, FEED_SIZE, type FeedCandidate } from "./types";

const TIE_EPSILON = 0.02;

type CandidateRow = Movie & { distance: number };

function popularity(movie: Movie): number {
  return movie.popularity ?? 0;
}

function byDistanceThenPopularity(a: CandidateRow, b: CandidateRow): number {
  if (Math.abs(a.distance - b.distance) <= TIE_EPSILON) {
    return popularity(b) - popularity(a);
  }
  return a.distance - b.distance;
}

export async function matchFeedCandidates(
  supabase: SupabaseClient,
  tasteVectorLiteral: string,
  poolSize: number = FEED_POOL_SIZE,
): Promise<FeedCandidate[]> {
  const { data, error } = await supabase.rpc("match_feed_candidates", {
    taste_vector: tasteVectorLiteral,
    pool_size: poolSize,
  });
  if (error) throw new Error(`Feed retrieval failed: ${error.message}`);

  const rows = (data ?? []) as CandidateRow[];
  return rows
    .slice()
    .sort(byDistanceThenPopularity)
    .slice(0, FEED_SIZE)
    .map(({ distance, ...movie }) => ({
      movie: movie as Movie,
      score: 1 - distance,
    }));
}
