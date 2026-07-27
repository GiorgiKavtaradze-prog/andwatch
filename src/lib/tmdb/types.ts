export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

export interface TmdbMovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string | null;
  release_date: string | null; // "YYYY-MM-DD"
  poster_path: string | null;
  genres: TmdbGenre[];
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  credits?: { cast: TmdbCastMember[]; crew: TmdbCrewMember[] };
  keywords?: { keywords: TmdbKeyword[] };
}

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string | null;
  popularity: number;
}

export interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

export interface TmdbFindResponse {
  movie_results: TmdbSearchResult[];
}

export interface TmdbListResult {
  id: number;
}

export interface TmdbListResponse {
  results: TmdbListResult[];
  total_pages: number;
}
