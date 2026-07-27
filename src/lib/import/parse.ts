import Papa from "papaparse";
import type { ImportSource, ParsedRow, ParseResult } from "./types";

const IMDB_NON_MOVIE_TYPES = new Set([
  "tvSeries",
  "tvEpisode",
  "tvMiniSeries",
  "tvSpecial",
  "tvShort",
  "videoGame",
  "podcastSeries",
  "podcastEpisode",
  "musicVideo",
]);

type Row = Record<string, string>;

export function detectSource(headers: string[]): ImportSource | null {
  const set = new Set(headers.map((h) => h.trim()));
  if (set.has("Letterboxd URI") || (set.has("Name") && set.has("Rating")))
    return "letterboxd";
  if (set.has("Const") && set.has("Your Rating") && set.has("Title Type"))
    return "imdb";
  return null;
}

function toYear(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.trim().slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function mapLetterboxdRow(row: Row): ParsedRow | null {
  const title = row.Name?.trim();
  const rating = Number.parseFloat(row.Rating ?? "");
  if (!title || !Number.isFinite(rating)) return null;
  return {
    title,
    year: toYear(row.Year),
    imdbId: null,
    rawValue: rating,
    ratedAt: row.Date?.trim() || null,
  };
}

function mapImdbRow(row: Row): ParsedRow | null {
  const titleType = row["Title Type"]?.trim();
  if (titleType && IMDB_NON_MOVIE_TYPES.has(titleType)) return null;
  const title = row.Title?.trim();
  const rating = Number.parseFloat(row["Your Rating"] ?? "");
  if (!title || !Number.isFinite(rating)) return null;
  const imdbId = row.Const?.trim();
  return {
    title,
    year: toYear(row.Year),
    imdbId: imdbId?.startsWith("tt") ? imdbId : null,
    rawValue: rating,
    ratedAt: row["Date Rated"]?.trim() || null,
  };
}

export function parseRatingsCsv(
  file: File,
  forcedSource?: ImportSource,
): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const source = forcedSource ?? detectSource(headers);
        if (!source) {
          resolve({
            status: "error",
            message:
              "This does not look like a Letterboxd or IMDb ratings export. Upload the ratings.csv from your export.",
          });
          return;
        }

        const map = source === "letterboxd" ? mapLetterboxdRow : mapImdbRow;
        const rows: ParsedRow[] = [];
        let skipped = 0;
        for (const raw of results.data) {
          const mapped = map(raw);
          if (mapped) rows.push(mapped);
          else skipped += 1;
        }

        if (rows.length === 0) {
          resolve({
            status: "error",
            message:
              "No rated movies found in this file. Check that it is your ratings export.",
          });
          return;
        }

        resolve({ status: "ok", source, rows, skipped });
      },
      error: (error) => {
        resolve({
          status: "error",
          message: `Could not read the file: ${error.message}`,
        });
      },
    });
  });
}
