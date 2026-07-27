// A cached movie row as this app reads it (the movies table, ADR 0002 + ADR 0003).

export interface Person {
  id: number;
  name: string;
}

export interface CastMember extends Person {
  character: string;
}

export interface NamedTag {
  id: number;
  name: string;
}

export interface Movie {
  id: number;
  title: string;
  release_year: number | null;
  overview: string | null;
  poster_path: string | null;
  genres: NamedTag[] | null;
  runtime_minutes: number | null;
  imdb_id: string | null;
  directors: Person[] | null;
  top_cast: CastMember[] | null;
  keywords: NamedTag[] | null;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  synced_at: string | null;
}

export const MOVIE_COLUMNS =
  "id,title,release_year,overview,poster_path,genres,runtime_minutes,imdb_id,directors,top_cast,keywords,vote_average,vote_count,popularity,synced_at";

export type ResolveResult =
  | { status: "matched"; movie: Movie }
  | { status: "no-match" };

export type MovieRef =
  | { kind: "tmdb"; tmdbId: number }
  | { kind: "imdb"; imdbId: string }
  | { kind: "title"; title: string; year?: number };
