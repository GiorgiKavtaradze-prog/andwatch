import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseVector } from "@/lib/embeddings";
import { computeTasteProfile, MIN_RATINGS_FOR_PROFILE } from "./index";

type Genre = { id: number; name: string };
type RatingRow = {
  normalized_value: number;
  movie: { embedding: number[] | null; genres: Genre[] };
};

function makeSupabase(ratings: {
  data: RatingRow[] | null;
  error: { message: string } | null;
}) {
  const upserts: Array<{ payload: Record<string, unknown>; opts: unknown }> =
    [];
  const client = {
    from(table: string) {
      if (table === "ratings") {
        return { select: () => ({ eq: () => Promise.resolve(ratings) }) };
      }
      if (table === "taste_profiles") {
        return {
          upsert: (payload: Record<string, unknown>, opts: unknown) => {
            upserts.push({ payload, opts });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase: client as unknown as SupabaseClient, upserts };
}

function rating(
  normalized: number,
  embedding: number[] | null,
  genres: Genre[] = [],
): RatingRow {
  return { normalized_value: normalized, movie: { embedding, genres } };
}

function norm(vec: number[]): number {
  return Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
}

const USER = "user-123";

describe("computeTasteProfile — below the floor (AC-7)", () => {
  it("writes no vector and reports below-floor when fewer than 20 movies match", async () => {
    const rows = Array.from({ length: 10 }, () => rating(80, [1, 0, 0, 0]));
    const { supabase, upserts } = makeSupabase({ data: rows, error: null });

    const result = await computeTasteProfile(supabase, USER);

    expect(result).toEqual({
      status: "below-floor",
      matched: 10,
      floor: MIN_RATINGS_FOR_PROFILE,
    });
    expect(upserts).toHaveLength(0); // nothing persisted
  });

  it("excludes movies with no embedding from the count (AC-5, AC-6)", async () => {
    // 15 embedded + 15 unembedded = 15 usable, still below the floor of 20.
    const embedded = Array.from({ length: 15 }, () => rating(80, [1, 0, 0, 0]));
    const unembedded = Array.from({ length: 15 }, () => rating(80, null));
    const { supabase, upserts } = makeSupabase({
      data: [...embedded, ...unembedded],
      error: null,
    });

    const result = await computeTasteProfile(supabase, USER);

    expect(result).toEqual({
      status: "below-floor",
      matched: 15,
      floor: MIN_RATINGS_FOR_PROFILE,
    });
    expect(upserts).toHaveLength(0);
  });
});

describe("computeTasteProfile — computed profile (AC-6, AC-8)", () => {
  it("writes a unit-length rating-weighted centroid with the counts and genre cache", async () => {
    // 13 liked (90) tagged Drama, 12 disliked (40) tagged Action. Mean is 66, so only the
    // liked films shape the genre affinities.
    const rows = [
      ...Array.from({ length: 13 }, () =>
        rating(90, [1, 0, 0, 0], [{ id: 1, name: "Drama" }]),
      ),
      ...Array.from({ length: 12 }, () =>
        rating(40, [0, 1, 0, 0], [{ id: 2, name: "Action" }]),
      ),
    ];
    const { supabase, upserts } = makeSupabase({ data: rows, error: null });

    const result = await computeTasteProfile(supabase, USER);

    expect(result).toEqual({ status: "computed", ratingCount: 25 });
    expect(upserts).toHaveLength(1);
    const { payload, opts } = upserts[0];
    expect(payload.user_id).toBe(USER);
    expect(payload.rating_count).toBe(25);
    expect(typeof payload.computed_at).toBe("string");
    expect(opts).toEqual({ onConflict: "user_id" });

    const vector = parseVector(payload.vector as string);
    expect(vector).not.toBeNull();
    if (!vector) return;
    expect(vector).toHaveLength(4); // operates in the embedding space
    expect(norm(vector)).toBeCloseTo(1, 10); // stored unit length

    // Only liked (above-mean) movies contribute; the distribution sums to 1.
    const genres = payload.genre_affinities as Record<string, number>;
    expect(Object.keys(genres)).toEqual(["Drama"]);
    expect(Object.values(genres).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });
});

describe("computeTasteProfile — zero-variance fallback (AC-6)", () => {
  it("still produces a finite unit vector when every rating is identical", async () => {
    // All rated 80: every centered weight is 0, so the weighted sum collapses and the code
    // must fall back to the plain mean direction of the movie vectors.
    const rows = [
      ...Array.from({ length: 13 }, () => rating(80, [1, 0, 0, 0])),
      ...Array.from({ length: 12 }, () => rating(80, [0, 1, 0, 0])),
    ];
    const { supabase, upserts } = makeSupabase({ data: rows, error: null });

    const result = await computeTasteProfile(supabase, USER);

    expect(result.status).toBe("computed");
    const vector = parseVector(upserts[0].payload.vector as string);
    expect(vector).not.toBeNull();
    if (!vector) return;
    expect(vector.every((v) => Number.isFinite(v))).toBe(true); // no NaN from a zero divide
    expect(norm(vector)).toBeCloseTo(1, 10);
    // No movie is above the (flat) mean, so there are no genre affinities.
    expect(upserts[0].payload.genre_affinities).toEqual({});
  });
});

describe("computeTasteProfile — read failure", () => {
  it("returns a failed result when the ratings read errors, and writes nothing", async () => {
    const { supabase, upserts } = makeSupabase({
      data: null,
      error: { message: "boom" },
    });

    const result = await computeTasteProfile(supabase, USER);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("boom");
    expect(upserts).toHaveLength(0);
  });
});
