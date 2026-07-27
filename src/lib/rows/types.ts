import type { Movie } from "@/lib/catalog/types";

export const ROW_POOL_SIZE = 60;
export const ROW_LENGTH = 12;
export const MIN_OPTIONAL_ROW = 4;

export interface RowPick {
  movie: Movie;
  reason: string;
  inWatchlist: boolean;
}

export interface HomeRow {
  key: string;
  title: string;
  picks: RowPick[];
}

export type HomeRowsResult =
  | { status: "no-profile" }
  | { status: "ready"; rows: HomeRow[] };
