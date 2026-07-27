"use server";


import type { MovieRef } from "@/lib/catalog";
import { resolveMany } from "@/lib/catalog";
import { embedMissingByIds } from "@/lib/embeddings";
import type {
  ChunkResult,
  CreateImportResult,
  FinalizeResult,
  ImportSource,
  ImportStatus,
  ParsedRow,
  UnmatchedRow,
} from "@/lib/import/types";
import { createClient } from "@/lib/supabase/server";
import { computeTasteProfile } from "@/lib/taste";

const VALID_SOURCES: ImportSource[] = ["letterboxd", "imdb"];

function clamp0to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizeRating(
  source: ImportSource,
  rawValue: number,
): { normalized: number; rawScale: string } {
  if (source === "letterboxd") {
    return { normalized: clamp0to100(Math.round((rawValue / 5) * 100)), rawScale: "0.5-5" };
  }
  return { normalized: clamp0to100(Math.round((rawValue / 10) * 100)), rawScale: "1-10" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(500 * 2 ** i + Math.floor(Math.random() * 250));
    }
  }
  throw lastError;
}

export async function createImport(input: {
  source: ImportSource;
  totalRows: number;
}): Promise<CreateImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "You must be signed in to import." };
  if (!VALID_SOURCES.includes(input.source)) {
    return { status: "error", message: "Unknown import source." };
  }

  const { data, error } = await supabase
    .from("imports")
    .insert({
      user_id: user.id,
      source: input.source,
      status: "pending",
      total_rows: input.totalRows,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not start the import." };
  }
  return { status: "created", importId: data.id as string };
}

export async function processImportChunk(input: {
  importId: string;
  rows: ParsedRow[];
  chunkIndex: number;
}): Promise<ChunkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "failed", error: "You must be signed in to import." };

  const { data: imp, error: impError } = await supabase
    .from("imports")
    .select("source, matched_rows, unmatched_rows, unmatched")
    .eq("id", input.importId)
    .single();
  if (impError || !imp) return { status: "failed", error: "Import not found." };

  const source = imp.source as ImportSource;

  try {
    const refs: MovieRef[] = input.rows.map((row) =>
      row.imdbId
        ? { kind: "imdb", imdbId: row.imdbId }
        : { kind: "title", title: row.title, year: row.year ?? undefined },
    );

    const results = await withRetry(() => resolveMany(refs));

    const ratingsByMovie = new Map<number, Record<string, unknown>>();
    const newUnmatched: UnmatchedRow[] = [];
    const matchedMovieIds: number[] = [];

    results.forEach(({ result }, i) => {
      const row = input.rows[i];
      const { normalized, rawScale } = normalizeRating(source, row.rawValue);
      if (result.status === "matched") {
        matchedMovieIds.push(result.movie.id);
        ratingsByMovie.set(result.movie.id, {
          user_id: user.id,
          movie_id: result.movie.id,
          source,
          raw_value: row.rawValue,
          raw_scale: rawScale,
          normalized_value: normalized,
          rated_at: row.ratedAt,
          import_id: input.importId,
        });
      } else {
        newUnmatched.push({
          title: row.title,
          year: row.year,
          raw_value: row.rawValue,
          raw_scale: rawScale,
          reason: "no catalog match",
        });
      }
    });

    const ratingsToUpsert = Array.from(ratingsByMovie.values());
    if (ratingsToUpsert.length > 0) {
      await withRetry(async () => {
        const res = await supabase.from("ratings").upsert(ratingsToUpsert, {
          onConflict: "user_id,movie_id",
        });
        if (res.error) throw new Error(res.error.message);
        return res;
      });
    }

    await withRetry(() => embedMissingByIds(matchedMovieIds));

    const baseMatched = input.chunkIndex === 0 ? 0 : (imp.matched_rows ?? 0);
    const baseUnmatched = input.chunkIndex === 0 ? 0 : (imp.unmatched_rows ?? 0);
    const baseList: UnmatchedRow[] =
      input.chunkIndex === 0 ? [] : ((imp.unmatched as UnmatchedRow[] | null) ?? []);

    const matched = baseMatched + ratingsToUpsert.length;
    const unmatched = baseUnmatched + newUnmatched.length;

    const { error: updateError } = await supabase
      .from("imports")
      .update({
        status: "processing",
        matched_rows: matched,
        unmatched_rows: unmatched,
        unmatched: [...baseList, ...newUnmatched],
      })
      .eq("id", input.importId);
    if (updateError) throw new Error(updateError.message);

    return { status: "ok", counts: { matched, unmatched } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The import chunk failed.";
    await supabase
      .from("imports")
      .update({ status: "failed", error: message })
      .eq("id", input.importId);
    return { status: "failed", error: message };
  }
}

export async function finalizeImport(importId: string): Promise<FinalizeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "failed", error: "You must be signed in to import." };

  const { data: imp, error: impError } = await supabase
    .from("imports")
    .select("id")
    .eq("id", importId)
    .single();
  if (impError || !imp) return { status: "failed", error: "Import not found." };

  const result = await computeTasteProfile(supabase, user.id);

  if (result.status === "failed") {
    await supabase
      .from("imports")
      .update({ status: "failed", error: result.error })
      .eq("id", importId);
    return result;
  }

  await supabase.from("imports").update({ status: "completed" }).eq("id", importId);
  return result;
}

export async function getImportStatus(importId: string): Promise<ImportStatus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("imports")
    .select("status, matched_rows, unmatched_rows, unmatched, error")
    .eq("id", importId)
    .single();
  if (error || !data) return null;

  return {
    status: data.status as ImportStatus["status"],
    matched: data.matched_rows ?? 0,
    unmatched: data.unmatched_rows ?? 0,
    unmatchedRows: (data.unmatched as UnmatchedRow[] | null) ?? [],
    error: data.error ?? null,
  };
}
