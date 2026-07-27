import { serverEnv } from "../env";
import { createRateLimiter } from "./rate-limiter";
import type {
  TmdbFindResponse,
  TmdbListResponse,
  TmdbMovieDetails,
  TmdbSearchResponse,
} from "./types";

const BASE_URL = "https://api.themoviedb.org/3";

// TMDB free tier allows roughly 50 requests per 10 seconds. Stay comfortably under it.
const limiter = createRateLimiter({ capacity: 40, refillMs: 10_000 });

const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type QueryParams = Record<string, string | number | undefined>;

// Returns the parsed body, or null for a 404 (a clean "not found", never an error).
async function tmdbFetch<T>(path: string, params: QueryParams = {}): Promise<T | null> {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await limiter.acquire();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${serverEnv.tmdbReadToken}`,
        Accept: "application/json",
      },
    });

    if (res.status === 404) return null;

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "1");
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 1) * 1000 + 500);
      continue;
    }

    if (!res.ok) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`TMDB request failed: ${res.status} for ${path}`);
      }
      await sleep(attempt * 500);
      continue;
    }

    return (await res.json()) as T;
  }

  throw new Error(`TMDB request exhausted retries: ${path}`);
}

export function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, {
    append_to_response: "credits,keywords",
  });
}

export function searchMovies(title: string, year?: number): Promise<TmdbSearchResponse | null> {
  return tmdbFetch<TmdbSearchResponse>("/search/movie", {
    query: title,
    year,
    include_adult: "false",
  });
}

export function findByImdbId(imdbId: string): Promise<TmdbFindResponse | null> {
  return tmdbFetch<TmdbFindResponse>(`/find/${imdbId}`, { external_source: "imdb_id" });
}

export function listPopular(page = 1): Promise<TmdbListResponse | null> {
  return tmdbFetch<TmdbListResponse>("/movie/popular", { page });
}

export function listTopRated(page = 1): Promise<TmdbListResponse | null> {
  return tmdbFetch<TmdbListResponse>("/movie/top_rated", { page });
}

export function listTrending(page = 1): Promise<TmdbListResponse | null> {
  return tmdbFetch<TmdbListResponse>("/trending/movie/week", { page });
}
