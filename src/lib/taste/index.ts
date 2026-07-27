import type { SupabaseClient } from "@supabase/supabase-js";
import type { NamedTag } from "@/lib/catalog";
import { l2normalize, parseVector, toVectorLiteral } from "@/lib/embeddings";
import type { FinalizeResult } from "@/lib/import/types";

export const MIN_RATINGS_FOR_PROFILE = 20;

const MIN_STDDEV = 1.0;
const MIN_NORM = 1e-6;

interface RatingRow {
  normalized_value: number;
  movie: {
    embedding: string | number[] | null;
    genres: NamedTag[] | null;
  } | null;
}

interface MatchedRating {
  normalized: number;
  unit: number[];
  genres: NamedTag[];
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function addScaled(acc: number[], vec: number[], scale: number): void {
  for (let i = 0; i < acc.length; i++) acc[i] += vec[i] * scale;
}

function norm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}

function computeGenreAffinities(
  ratings: MatchedRating[],
  avg: number,
): Record<string, number> {
  const weights = new Map<string, number>();
  let total = 0;
  for (const r of ratings) {
    const weight = r.normalized - avg;
    if (weight <= 0) continue; // only liked movies shape affinities
    for (const g of r.genres) {
      if (!g.name) continue;
      weights.set(g.name, (weights.get(g.name) ?? 0) + weight);
      total += weight;
    }
  }
  if (total === 0) return {};
  const out: Record<string, number> = {};
  for (const [name, w] of weights) out[name] = Number((w / total).toFixed(4));
  return out;
}

function computeCentroid(ratings: MatchedRating[], avg: number): number[] {
  const dims = ratings[0].unit.length;
  const spread = stddev(
    ratings.map((r) => r.normalized),
    avg,
  );

  const weighted = new Array<number>(dims).fill(0);
  for (const r of ratings) addScaled(weighted, r.unit, r.normalized - avg);

  if (spread >= MIN_STDDEV && norm(weighted) >= MIN_NORM) {
    return l2normalize(weighted);
  }

  // Zero-variance fallback: plain mean direction of the movie vectors.
  const plain = new Array<number>(dims).fill(0);
  for (const r of ratings) addScaled(plain, r.unit, 1);
  return l2normalize(plain);
}

// Read the user's ratings, compute the taste vector, and write it (or return below-floor).
// Recomputes from ALL of the user's ratings across every source, so a re-import enriches the
// profile rather than replacing it.
export async function computeTasteProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinalizeResult> {
  const { data, error } = await supabase
    .from("ratings")
    .select("normalized_value, movie:movies(embedding, genres)")
    .eq("user_id", userId);
  if (error)
    return {
      status: "failed",
      error: `Failed to read ratings: ${error.message}`,
    };

  const rows = (data ?? []) as unknown as RatingRow[];
  const matched: MatchedRating[] = [];
  for (const row of rows) {
    // A to-one relationship can arrive as an object or a single-element array; normalize.
    const movieRaw = Array.isArray(row.movie) ? row.movie[0] : row.movie;
    if (!movieRaw) continue;
    const unit = parseVector(movieRaw.embedding);
    if (!unit || unit.length === 0) continue; // not embedded → excluded from matching
    matched.push({
      normalized: row.normalized_value,
      unit,
      genres: movieRaw.genres ?? [],
    });
  }

  if (matched.length < MIN_RATINGS_FOR_PROFILE) {
    return {
      status: "below-floor",
      matched: matched.length,
      floor: MIN_RATINGS_FOR_PROFILE,
    };
  }

  const avg = mean(matched.map((r) => r.normalized));
  const vector = computeCentroid(matched, avg);
  const genreAffinities = computeGenreAffinities(matched, avg);

  const { error: writeError } = await supabase.from("taste_profiles").upsert(
    {
      user_id: userId,
      vector: toVectorLiteral(vector),
      genre_affinities: genreAffinities,
      rating_count: matched.length,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (writeError)
    return {
      status: "failed",
      error: `Failed to write profile: ${writeError.message}`,
    };

  return { status: "computed", ratingCount: matched.length };
}
