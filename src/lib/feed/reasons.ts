import Anthropic from "@anthropic-ai/sdk";
import type { Movie } from "@/lib/catalog";
import { serverEnv } from "@/lib/env";
import type { FeedCandidate, TasteSummary } from "./types";

const REASON_MODEL = "claude-sonnet-5";

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic)
    anthropic = new Anthropic({ apiKey: serverEnv.anthropicApiKey });
  return anthropic;
}

const REASON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          movie_id: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["movie_id", "reason"],
      },
    },
  },
  required: ["reasons"],
} as const;

const SYSTEM_PROMPT = [
  "You write one short line explaining why a specific movie fits a specific viewer's taste.",
  "Rules for every reason:",
  "- One sentence, about 15 words, no more.",
  "- Speak to why THIS film fits THIS viewer: connect the film's themes, tone, or mood to their taste.",
  "- Use ONLY the facts given for that movie. Invent nothing.",
  "- Favor fit, tone, and theme over hard facts (awards, box office, exact plot) that are easy to get wrong.",
  "- Do not restate the title or the viewer's data verbatim; make it feel personal, not generic praise.",
].join("\n");

function names(
  items: { name: string }[] | null | undefined,
  limit: number,
): string {
  return (items ?? [])
    .map((i) => i.name)
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");
}

function movieFacts(movie: Movie): string {
  const parts = [`movie_id: ${movie.id}`, `title: ${movie.title}`];
  if (movie.release_year != null) parts.push(`year: ${movie.release_year}`);
  const genres = names(movie.genres, 3);
  if (genres) parts.push(`genres: ${genres}`);
  const keywords = names(movie.keywords, 6);
  if (keywords) parts.push(`themes: ${keywords}`);
  const directors = names(movie.directors, 2);
  if (directors) parts.push(`director: ${directors}`);
  const cast = names(movie.top_cast, 3);
  if (cast) parts.push(`cast: ${cast}`);
  if (movie.overview) parts.push(`overview: ${movie.overview}`);
  return parts.join("\n");
}

export function groundedReason(movie: Movie): string {
  const genre = movie.genres?.[0]?.name;
  const director = movie.directors?.[0]?.name;
  if (genre && director)
    return `A ${genre.toLowerCase()} film from ${director} that fits your taste.`;
  if (genre) return `A ${genre.toLowerCase()} film that fits your taste.`;
  if (director) return `A film from ${director} that fits your taste.`;
  return "Picked to match your taste.";
}

function parseReasons(text: string): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const parsed = JSON.parse(text) as {
      reasons?: { movie_id: number; reason: string }[];
    };
    for (const r of parsed.reasons ?? []) {
      if (
        typeof r.movie_id === "number" &&
        typeof r.reason === "string" &&
        r.reason.trim()
      ) {
        map.set(r.movie_id, r.reason.trim());
      }
    }
  } catch {
    // Fall through to an empty map; the caller applies grounded fallbacks.
  }
  return map;
}

export async function writeReasons(
  candidates: FeedCandidate[],
  taste: TasteSummary,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (candidates.length === 0) return result;

  const tasteLines = [
    taste.topGenres.length ? `Top genres: ${taste.topGenres.join(", ")}` : "",
    taste.topTitles.length
      ? `Loved recently: ${taste.topTitles.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const moviesBlock = candidates
    .map((c) => movieFacts(c.movie))
    .join("\n---\n");
  const userContent = [
    "Viewer taste signal:",
    tasteLines ||
      "(no strong signal; keep the reason about the film's own tone and theme)",
    "",
    `Write one reason for each of these ${candidates.length} movies. Return every movie_id.`,
    "",
    moviesBlock,
  ].join("\n");

  const response = await getClient().messages.create({
    model: REASON_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: REASON_SCHEMA } },
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason !== "refusal") {
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    for (const [id, reason] of parseReasons(text)) result.set(id, reason);
  }

  for (const c of candidates) {
    if (!result.has(c.movie.id))
      result.set(c.movie.id, groundedReason(c.movie));
  }
  return result;
}
