import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import type { VibeIntent } from "./types";

const PARSE_MODEL = "claude-haiku-4-5";

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    vibeText: { type: "string" },
    yearFrom: { type: ["integer", "null"] },
    yearTo: { type: ["integer", "null"] },
    maxRuntimeMinutes: { type: ["integer", "null"] },
    audience: { type: "string", enum: ["family", "any"] },
  },
  required: ["vibeText", "yearFrom", "yearTo", "maxRuntimeMinutes", "audience"],
} as const;

const SYSTEM_PROMPT = [
  "You turn a viewer's free-text movie vibe into a search intent. Return JSON only.",
  "- vibeText: a clean, one-to-three-sentence description of the mood, themes, tone, and feel the",
  "  viewer is after, expanded enough to match against movie descriptions. Do not name specific films.",
  "- yearFrom / yearTo: a release-year range only if the viewer implies one (for example '90s' →",
  "  1990..1999, 'recent' → last ~5 years); otherwise null.",
  "- maxRuntimeMinutes: a runtime ceiling only if implied ('under two hours' → 120, 'short' → 100);",
  "  otherwise null.",
  "- audience: 'family' if the viewer signals kids or a family setting, else 'any'.",
].join("\n");

interface RawIntent {
  vibeText: string;
  yearFrom: number | null;
  yearTo: number | null;
  maxRuntimeMinutes: number | null;
  audience: "family" | "any";
}

export async function parseVibe(query: string): Promise<VibeIntent> {
  const response = await getAnthropic().messages.create({
    model: PARSE_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: INTENT_SCHEMA } },
    messages: [{ role: "user", content: query }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let raw: RawIntent;
  try {
    raw = JSON.parse(text) as RawIntent;
  } catch {
    return { vibeText: query, audience: "any" };
  }

  return {
    vibeText: raw.vibeText?.trim() || query,
    yearFrom: raw.yearFrom ?? undefined,
    yearTo: raw.yearTo ?? undefined,
    maxRuntimeMinutes: raw.maxRuntimeMinutes ?? undefined,
    audience: raw.audience === "family" ? "family" : "any",
  };
}
