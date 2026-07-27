import { getServiceClient } from "../supabase/service";
import { MOVIE_COLUMNS, type Movie } from "./types";

export async function validateMovieIds(
  ids: number[],
): Promise<{ existing: number[]; missing: number[] }> {
  if (ids.length === 0) return { existing: [], missing: [] };
  const unique = [...new Set(ids)];
  const { data, error } = await getServiceClient()
    .from("movies")
    .select("id")
    .in("id", unique);
  if (error) throw new Error(`validateMovieIds failed: ${error.message}`);
  const present = new Set(
    (data ?? []).map((row) => (row as { id: number }).id),
  );
  return {
    existing: unique.filter((id) => present.has(id)),
    missing: unique.filter((id) => !present.has(id)),
  };
}

export interface CandidateFilter {
  genres?: string[];
  keywords?: string[];
  text?: string;
  limit?: number;
}

export async function getCandidates(filter: CandidateFilter): Promise<Movie[]> {
  const limit = filter.limit ?? 50;
  const hasTagFilter =
    (filter.genres?.length ?? 0) > 0 || (filter.keywords?.length ?? 0) > 0;
  const fetchLimit = hasTagFilter ? limit * 5 : limit;

  let query = getServiceClient()
    .from("movies")
    .select(MOVIE_COLUMNS)
    .not("synced_at", "is", null);

  if (filter.text) {
    const term = filter.text.replace(/[%,]/g, " ").trim();
    if (term)
      query = query.or(`title.ilike.%${term}%,overview.ilike.%${term}%`);
  }

  query = query
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(fetchLimit);

  const { data, error } = await query;
  if (error) throw new Error(`getCandidates failed: ${error.message}`);
  let movies = (data as Movie[]) ?? [];

  if (hasTagFilter) {
    const wantGenres = new Set(
      (filter.genres ?? []).map((genre) => genre.toLowerCase()),
    );
    const wantKeywords = new Set(
      (filter.keywords ?? []).map((keyword) => keyword.toLowerCase()),
    );
    movies = movies.filter((movie) => {
      const genreMatch =
        wantGenres.size === 0 ||
        (movie.genres ?? []).some((genre) =>
          wantGenres.has(genre.name.toLowerCase()),
        );
      const keywordMatch =
        wantKeywords.size === 0 ||
        (movie.keywords ?? []).some((keyword) =>
          wantKeywords.has(keyword.name.toLowerCase()),
        );
      return genreMatch && keywordMatch;
    });
  }

  return movies.slice(0, limit);
}
