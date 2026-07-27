import OpenAI from "openai";
import type { Movie } from "@/lib/catalog";
import { serverEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase/service";

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMENSIONS = 1536;

const EMBED_BATCH_SIZE = 96;

let openai: OpenAI | null = null;
function getClient(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: serverEnv.openaiApiKey });
  return openai;
}

type EmbeddableMovie = Pick<
  Movie,
  "id" | "overview" | "keywords" | "genres" | "directors" | "top_cast"
>;

const MOVIE_TEXT_COLUMNS = "id,overview,keywords,genres,directors,top_cast";

export function buildMovieDocument(movie: EmbeddableMovie): string {
  const parts: string[] = [];
  if (movie.overview) parts.push(movie.overview);
  const genres = (movie.genres ?? []).map((g) => g.name).filter(Boolean);
  if (genres.length) parts.push(`Genres: ${genres.join(", ")}`);
  const keywords = (movie.keywords ?? []).map((k) => k.name).filter(Boolean);
  if (keywords.length) parts.push(`Themes: ${keywords.join(", ")}`);
  const directors = (movie.directors ?? []).map((d) => d.name).filter(Boolean);
  if (directors.length) parts.push(`Directed by ${directors.join(", ")}`);
  const cast = (movie.top_cast ?? []).map((c) => c.name).filter(Boolean);
  if (cast.length) parts.push(`Starring ${cast.join(", ")}`);
  return parts.join("\n").trim();
}

export function l2normalize(vec: number[]): number[] {
  let sumSquares = 0;
  for (const v of vec) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export function parseVector(value: string | number[] | null): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIMENSIONS,
  });
  const ordered = [...res.data].sort((a, b) => a.index - b.index);
  return ordered.map((item) => l2normalize(item.embedding));
}

export type EmbedResult = {
  embedded: number[];
  skipped: number[];
};

export async function embedMovies(
  movies: EmbeddableMovie[],
): Promise<EmbedResult> {
  const embedded: number[] = [];
  const skipped: number[] = [];

  const withDocs = movies
    .map((m) => ({ id: m.id, doc: buildMovieDocument(m) }))
    .filter((m) => {
      if (m.doc.length === 0) {
        skipped.push(m.id);
        return false;
      }
      return true;
    });

  const service = getServiceClient();

  for (let i = 0; i < withDocs.length; i += EMBED_BATCH_SIZE) {
    const batch = withDocs.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedTexts(batch.map((b) => b.doc));
    for (let j = 0; j < batch.length; j++) {
      const { error } = await service
        .from("movies")
        .update({ embedding: toVectorLiteral(vectors[j]) })
        .eq("id", batch[j].id);
      if (error)
        throw new Error(
          `Failed to write embedding for movie ${batch[j].id}: ${error.message}`,
        );
      embedded.push(batch[j].id);
    }
  }

  return { embedded, skipped };
}

export async function embedMissingByIds(ids: number[]): Promise<EmbedResult> {
  if (ids.length === 0) return { embedded: [], skipped: [] };
  const service = getServiceClient();
  const { data, error } = await service
    .from("movies")
    .select(MOVIE_TEXT_COLUMNS)
    .in("id", ids)
    .is("embedding", null);
  if (error)
    throw new Error(`Failed to load movies for embedding: ${error.message}`);
  return embedMovies((data ?? []) as EmbeddableMovie[]);
}
