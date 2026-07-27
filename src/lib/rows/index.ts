import type { SupabaseClient } from "@supabase/supabase-js";
import type { Movie } from "@/lib/catalog/types";
import { groundedReason, readWatchlistIds } from "@/lib/feed";
import {
  type HomeRow,
  type HomeRowsResult,
  MIN_OPTIONAL_ROW,
  ROW_LENGTH,
  ROW_POOL_SIZE,
} from "./types";

type PoolRow = Movie & { distance: number };
interface RowCandidate {
  movie: Movie;
  popularity: number;
}

async function getRowPool(
  supabase: SupabaseClient,
  tasteVectorLiteral: string,
  poolSize: number,
): Promise<RowCandidate[]> {
  const { data, error } = await supabase.rpc("match_feed_candidates", {
    taste_vector: tasteVectorLiteral,
    pool_size: poolSize,
  });
  if (error) throw new Error(`Home rows retrieval failed: ${error.message}`);
  return ((data ?? []) as PoolRow[]).map(
    ({ distance: _distance, ...movie }) => ({
      movie: movie as Movie,
      popularity: (movie as Movie).popularity ?? 0,
    }),
  );
}

function topAffinityGenre(
  affinities: Record<string, number> | null,
): string | null {
  if (!affinities) return null;
  const sorted = Object.entries(affinities).sort(([, a], [, b]) => b - a);
  return sorted.length > 0 ? sorted[0][0] : null;
}

function hiddenGemReason(movie: Movie): string {
  const g = movie.genres?.[0]?.name;
  return g
    ? `A lesser-known ${g.toLowerCase()} pick that matches your taste.`
    : groundedReason(movie);
}

function crowdPleaserReason(movie: Movie): string {
  const g = movie.genres?.[0]?.name;
  return g
    ? `A well-loved ${g.toLowerCase()} film in your wheelhouse.`
    : groundedReason(movie);
}

function buildRows(
  pool: RowCandidate[],
  genreAffinities: Record<string, number> | null,
): { key: string; title: string; picks: { movie: Movie; reason: string }[] }[] {
  const rows: {
    key: string;
    title: string;
    picks: { movie: Movie; reason: string }[];
  }[] = [];
  const used = new Set<number>();
  const available = () => pool.filter((c) => !used.has(c.movie.id));
  const gems = [...available()]
    .sort((a, b) => a.popularity - b.popularity)
    .slice(0, ROW_LENGTH);
  if (gems.length > 0) {
    for (const c of gems) used.add(c.movie.id);
    rows.push({
      key: "hidden-gems",
      title: "Hidden gems for your taste",
      picks: gems.map((c) => ({
        movie: c.movie,
        reason: hiddenGemReason(c.movie),
      })),
    });
  }
  const crowd = [...available()]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, ROW_LENGTH);
  if (crowd.length > 0) {
    for (const c of crowd) used.add(c.movie.id);
    rows.push({
      key: "crowd-pleasers",
      title: "Crowd-pleasers for you",
      picks: crowd.map((c) => ({
        movie: c.movie,
        reason: crowdPleaserReason(c.movie),
      })),
    });
  }
  const topGenre = topAffinityGenre(genreAffinities);
  if (topGenre) {
    const g = topGenre.toLowerCase();
    const genreRow = available()
      .filter((c) =>
        (c.movie.genres ?? []).some((x) => x.name.toLowerCase() === g),
      )
      .slice(0, ROW_LENGTH);
    if (genreRow.length >= MIN_OPTIONAL_ROW) {
      for (const c of genreRow) used.add(c.movie.id);
      rows.push({
        key: "more-genre",
        title: `More ${topGenre}`,
        picks: genreRow.map((c) => ({
          movie: c.movie,
          reason: `More ${g}, matched to your taste.`,
        })),
      });
    }
  }

  return rows;
}
export async function getHomeRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<HomeRowsResult> {
  const { data: profile } = await supabase
    .from("taste_profiles")
    .select("vector, genre_affinities")
    .eq("user_id", userId)
    .maybeSingle();
  const vector = (profile?.vector as string | null) ?? null;
  if (!vector) return { status: "no-profile" };
  const genreAffinities =
    (profile?.genre_affinities as Record<string, number> | null) ?? null;
  const pool = await getRowPool(supabase, vector, ROW_POOL_SIZE);
  const built = buildRows(pool, genreAffinities);
  const watchlist = await readWatchlistIds(supabase, userId);
  const rows: HomeRow[] = built.map((row) => ({
    key: row.key,
    title: row.title,
    picks: row.picks.map((p) => ({
      movie: p.movie,
      reason: p.reason,
      inWatchlist: watchlist.has(p.movie.id),
    })),
  }));

  return { status: "ready", rows };
}
