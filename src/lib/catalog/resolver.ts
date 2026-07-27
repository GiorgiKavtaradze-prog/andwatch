import { getServiceClient } from "../supabase/service";
import { findByImdbId, getMovieDetails, searchMovies } from "../tmdb/client";
import type { TmdbSearchResult } from "../tmdb/types";
import { mapDetailsToMovie } from "./mapper";
import {
  MOVIE_COLUMNS,
  type Movie,
  type MovieRef,
  type ResolveResult,
} from "./types";

async function getCachedById(tmdbId: number): Promise<Movie | null> {
  const { data, error } = await getServiceClient()
    .from("movies")
    .select(MOVIE_COLUMNS)
    .eq("id", tmdbId)
    .maybeSingle();
  if (error)
    throw new Error(`Reading cached movie ${tmdbId} failed: ${error.message}`);
  return (data as Movie | null) ?? null;
}

async function fetchAndCache(tmdbId: number): Promise<Movie | null> {
  const details = await getMovieDetails(tmdbId);
  if (!details) return null;
  const row = mapDetailsToMovie(details);
  const { data, error } = await getServiceClient()
    .from("movies")
    .upsert(row, { onConflict: "id" })
    .select(MOVIE_COLUMNS)
    .single();
  if (error)
    throw new Error(`Caching movie ${tmdbId} failed: ${error.message}`);
  return data as Movie;
}

export async function resolveByTmdbId(tmdbId: number): Promise<ResolveResult> {
  const cached = await getCachedById(tmdbId);
  if (cached?.synced_at) return { status: "matched", movie: cached };
  const movie = await fetchAndCache(tmdbId);
  return movie ? { status: "matched", movie } : { status: "no-match" };
}

export async function resolveByImdbId(imdbId: string): Promise<ResolveResult> {
  const { data, error } = await getServiceClient()
    .from("movies")
    .select(MOVIE_COLUMNS)
    .eq("imdb_id", imdbId)
    .maybeSingle();
  if (error)
    throw new Error(
      `Reading movie by imdb_id ${imdbId} failed: ${error.message}`,
    );
  const cached = data as Movie | null;
  if (cached?.synced_at) return { status: "matched", movie: cached };

  const found = await findByImdbId(imdbId);
  const match = found?.movie_results?.[0];
  if (!match) return { status: "no-match" };
  return resolveByTmdbId(match.id);
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function yearOf(result: TmdbSearchResult): number | undefined {
  return result.release_date
    ? Number(result.release_date.slice(0, 4)) || undefined
    : undefined;
}

export async function resolveByTitleYear(
  title: string,
  year?: number,
): Promise<ResolveResult> {
  const search = await searchMovies(title, year);
  const results = search?.results ?? [];
  if (results.length === 0) return { status: "no-match" };

  const target = normalizeTitle(title);
  const exactTitle = results.filter(
    (result) => normalizeTitle(result.title) === target,
  );

  let best =
    year !== undefined
      ? exactTitle.find((result) => yearOf(result) === year)
      : undefined;

  if (!best) {
    const near = (
      year !== undefined
        ? exactTitle.filter((result) => {
            const resultYear = yearOf(result);
            return resultYear !== undefined && Math.abs(resultYear - year) <= 1;
          })
        : exactTitle
    ).sort((a, b) => b.popularity - a.popularity);
    best = near[0];
  }

  if (!best) return { status: "no-match" };
  return resolveByTmdbId(best.id);
}

export function resolveRef(ref: MovieRef): Promise<ResolveResult> {
  switch (ref.kind) {
    case "tmdb":
      return resolveByTmdbId(ref.tmdbId);
    case "imdb":
      return resolveByImdbId(ref.imdbId);
    case "title":
      return resolveByTitleYear(ref.title, ref.year);
  }
}
export async function resolveMany(
  refs: MovieRef[],
  concurrency = 5,
): Promise<Array<{ ref: MovieRef; result: ResolveResult }>> {
  const out: Array<{ ref: MovieRef; result: ResolveResult }> = new Array(
    refs.length,
  );
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < refs.length) {
      const index = cursor;
      cursor += 1;
      out[index] = { ref: refs[index], result: await resolveRef(refs[index]) };
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, refs.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}
