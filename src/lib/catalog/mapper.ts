import type { TmdbMovieDetails } from "../tmdb/types";
import type { Movie } from "./types";

const MAX_CAST = 10;

export function mapDetailsToMovie(details: TmdbMovieDetails): Movie {
  const directors = (details.credits?.crew ?? [])
    .filter((member) => member.job === "Director")
    .map((member) => ({ id: member.id, name: member.name }));

  const topCast = (details.credits?.cast ?? [])
    .slice(0, MAX_CAST)
    .map((member) => ({
      id: member.id,
      name: member.name,
      character: member.character,
    }));

  const keywords = (details.keywords?.keywords ?? []).map((keyword) => ({
    id: keyword.id,
    name: keyword.name,
  }));

  const releaseYear = details.release_date
    ? Number(details.release_date.slice(0, 4)) || null
    : null;

  return {
    id: details.id,
    title: details.title,
    release_year: releaseYear,
    overview: details.overview || null,
    poster_path: details.poster_path,
    genres:
      details.genres?.map((genre) => ({ id: genre.id, name: genre.name })) ??
      null,
    runtime_minutes: details.runtime ?? null,
    imdb_id: details.imdb_id || null,
    directors: directors.length > 0 ? directors : null,
    top_cast: topCast.length > 0 ? topCast : null,
    keywords: keywords.length > 0 ? keywords : null,
    vote_average: details.vote_average ?? null,
    vote_count: details.vote_count ?? null,
    popularity: details.popularity ?? null,
    synced_at: new Date().toISOString(),
  };
}
