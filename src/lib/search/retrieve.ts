import type { SupabaseClient } from "@supabase/supabase-js";
import type { Movie } from "@/lib/catalog/types";
import {
  QUERY_WEIGHT,
  TASTE_WEIGHT,
  VIBE_POOL_SIZE,
  VIBE_SHORTLIST_SIZE,
  type VibeCandidate,
  type VibeIntent,
} from "./types";

type CandidateRow = Movie & {
  query_distance: number;
  taste_distance: number | null;
};

export async function matchVibeCandidates(
  supabase: SupabaseClient,
  queryVectorLiteral: string,
  tasteVectorLiteral: string | null,
  intent: VibeIntent,
): Promise<VibeCandidate[]> {
  const { data, error } = await supabase.rpc("match_vibe_candidates", {
    query_vector: queryVectorLiteral,
    taste_vector: tasteVectorLiteral,
    pool_size: VIBE_POOL_SIZE,
    min_year: intent.yearFrom ?? null,
    max_year: intent.yearTo ?? null,
    max_runtime: intent.maxRuntimeMinutes ?? null,
  });
  if (error) throw new Error(`Vibe retrieval failed: ${error.message}`);

  const rows = (data ?? []) as CandidateRow[];
  const candidates: VibeCandidate[] = rows.map((row) => {
    const { query_distance, taste_distance, ...movie } = row;
    const queryScore = 1 - query_distance;
    const tasteScore = taste_distance == null ? null : 1 - taste_distance;

    const score = QUERY_WEIGHT * queryScore + TASTE_WEIGHT * (tasteScore ?? 0);
    return { movie: movie as Movie, score, queryScore, tasteScore };
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, VIBE_SHORTLIST_SIZE);
}
