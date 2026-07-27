import type { Movie } from "@/lib/catalog";

export const FEED_SIZE = 10;
export const FEED_POOL_SIZE = 30;

export interface FeedPick {
  movie: Movie;
  rank: number;
  score: number;
  reason: string;
  inWatchlist: boolean;
}

export interface FeedCandidate {
  movie: Movie;
  score: number;
}

export interface TasteSummary {
  topGenres: string[];
  topTitles: string[];
}

export type GetFeedResult =
  | { status: "no-profile" }
  | { status: "empty" }
  | { status: "ready"; picks: FeedPick[]; stale: boolean };

export type RefreshFeedResult =
  | { status: "ready"; picks: FeedPick[] }
  | { status: "no-profile" }
  | { status: "error"; message: string };

export type GenerateFeedResult =
  | { status: "ok"; picks: FeedPick[] }
  | { status: "no-profile" }
  | { status: "error"; message: string };
