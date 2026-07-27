import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import type { Movie } from "@/lib/catalog/types";
import {
  VIBE_MAX_PICKS,
  VIBE_MIN_PICKS,
  type VibeCandidate,
  type VibeIntent,
} from "./types";

const SELECT_MODEL = "claude-sonnet-5";

const PICKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    picks: {
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
  required: ["picks"],
} as const;

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
  if (movie.runtime_minutes) parts.push(`runtime: ${movie.runtime_minutes}m`);
  const genres = names(movie.genres, 3);
  if (genres) parts.push(`genres: ${genres}`);
  const keywords = names(movie.keywords, 6);
  if (keywords) parts.push(`themes: ${keywords}`);
  const directors = names(movie.directors, 2);
  if (directors) parts.push(`director: ${directors}`);
  if (movie.overview) parts.push(`overview: ${movie.overview}`);
  return parts.join("\n");
}

export interface VibePickChoice {
  movieId: number;
  reason: string;
}

export async function writeVibePicks(
  query: string,
  intent: VibeIntent,
  shortlist: VibeCandidate[],
): Promise<VibePickChoice[]> {
  if (shortlist.length === 0) return [];

  const allowed = new Set(shortlist.map((c) => c.movie.id));
  const catalogBlock = shortlist
    .map((c) => movieFacts(c.movie))
    .join("\n---\n");

  const system = [
    "You are a film concierge. From the provided real movies only, pick the best fits for the",
    `viewer's vibe and return between ${VIBE_MIN_PICKS} and ${VIBE_MAX_PICKS} of them.`,
    "Rules:",
    "- Only use movie_id values from the provided list. Never invent a movie or an id.",
    "- Order the picks best fit first.",
    "- For each, write one sentence, about 15 words, on why it fits THIS vibe, grounded only in",
    "  that movie's given facts. Favor mood, tone, and theme over hard facts you might get wrong.",
    intent.audience === "family"
      ? "- The viewer is watching with family: prefer family-appropriate films and avoid mature or violent ones."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = [
    `Viewer's vibe: ${query}`,
    "",
    "Real movies to choose from:",
    catalogBlock,
  ].join("\n");

  const response = await getAnthropic().messages.create({
    model: SELECT_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system,
    output_config: { format: { type: "json_schema", schema: PICKS_SCHEMA } },
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") return [];

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { picks?: { movie_id: number; reason: string }[] };
  try {
    parsed = JSON.parse(text) as {
      picks?: { movie_id: number; reason: string }[];
    };
  } catch {
    return [];
  }

  const seen = new Set<number>();
  const choices: VibePickChoice[] = [];
  for (const p of parsed.picks ?? []) {
    if (!allowed.has(p.movie_id) || seen.has(p.movie_id)) continue;
    if (typeof p.reason !== "string" || !p.reason.trim()) continue;
    seen.add(p.movie_id);
    choices.push({ movieId: p.movie_id, reason: p.reason.trim() });
    if (choices.length >= VIBE_MAX_PICKS) break;
  }
  return choices;
}
