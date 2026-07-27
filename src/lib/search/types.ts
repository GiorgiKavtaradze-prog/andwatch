import type { Movie } from "@/lib/catalog/types";

export const VIBE_POOL_SIZE = 40;
export const VIBE_SHORTLIST_SIZE = 15;
export const VIBE_MIN_PICKS = 3;
export const VIBE_MAX_PICKS = 5;

export const QUERY_WEIGHT = 0.7;
export const TASTE_WEIGHT = 0.3;

export interface VibeIntent {
  vibeText: string;
  yearFrom?: number;
  yearTo?: number;
  maxRuntimeMinutes?: number;
  audience: "family" | "any";
}

export interface VibeCandidate {
  movie: Movie;
  score: number;
  queryScore: number;
  tasteScore: number | null;
}

export interface VibePick {
  movie: Movie;
  rank: number;
  reason: string;
  inWatchlist: boolean;
}

export type SearchResult =
  | { status: "ok"; picks: VibePick[] }
  | { status: "empty" }
  | { status: "error"; message: string };
