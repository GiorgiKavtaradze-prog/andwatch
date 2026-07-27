export type ImportSource = "letterboxd" | "imdb";

export interface ParsedRow {
  title: string;
  year: number | null;
  imdbId: string | null;
  rawValue: number;
  ratedAt: string | null;
}

export type ParseResult =
  | { status: "ok"; source: ImportSource; rows: ParsedRow[]; skipped: number }
  | { status: "error"; message: string };

export type CreateImportResult =
  | { status: "created"; importId: string }
  | { status: "error"; message: string };

export interface ImportCounts {
  matched: number;
  unmatched: number;
}

export type ChunkResult =
  | { status: "ok"; counts: ImportCounts }
  | { status: "failed"; error: string };

export interface UnmatchedRow {
  title: string;
  year: number | null;
  raw_value: number;
  raw_scale: string;
  reason: string;
}

export type FinalizeResult =
  | { status: "computed"; ratingCount: number }
  | { status: "below-floor"; matched: number; floor: number }
  | { status: "failed"; error: string };

export interface ImportStatus {
  status: "pending" | "processing" | "completed" | "failed";
  matched: number;
  unmatched: number;
  unmatchedRows: UnmatchedRow[];
  error: string | null;
}
