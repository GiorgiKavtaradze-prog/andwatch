"use server";

import { validateMovieIds } from "@/lib/catalog";
import type { Movie } from "@/lib/catalog/types";
import { embedTexts, toVectorLiteral } from "@/lib/embeddings";
import { readWatchlistIds } from "@/lib/feed";
import { matchVibeCandidates, parseVibe, writeVibePicks } from "@/lib/search";
import type { SearchResult, VibePick } from "@/lib/search/types";
import { createClient } from "@/lib/supabase/server";

export async function searchVibe(query: string): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "error", message: "Describe a vibe to search." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "You must be signed in to search." };

  try {
    const { data: profile } = await supabase
      .from("taste_profiles")
      .select("vector")
      .eq("user_id", user.id)
      .maybeSingle();
    const tasteLiteral = (profile?.vector as string | null) ?? null;

    const intent = await parseVibe(trimmed);
    const [queryVector] = await embedTexts([intent.vibeText]);
    const queryLiteral = toVectorLiteral(queryVector);

    const shortlist = await matchVibeCandidates(supabase, queryLiteral, tasteLiteral, intent);

    const logAndReturn = async (picks: VibePick[]): Promise<SearchResult> => {
      await supabase.from("searches").insert({
        user_id: user.id,
        query_text: trimmed,
        parsed_intent: intent,
        results: picks.map((p) => ({ movie_id: p.movie.id, rank: p.rank, reason: p.reason })),
      });
      return picks.length === 0 ? { status: "empty" } : { status: "ok", picks };
    };

    if (shortlist.length === 0) return logAndReturn([]);

    const choices = await writeVibePicks(trimmed, intent, shortlist);
    if (choices.length === 0) return logAndReturn([]);
    const { existing } = await validateMovieIds(choices.map((c) => c.movieId));
    const real = new Set(existing);

    const byId = new Map<number, Movie>(shortlist.map((c) => [c.movie.id, c.movie]));
    const watchlist = await readWatchlistIds(supabase, user.id);

    const picks: VibePick[] = [];
    for (const choice of choices) {
      const movie = byId.get(choice.movieId);
      if (!movie || !real.has(choice.movieId)) continue;
      picks.push({
        movie,
        rank: picks.length + 1,
        reason: choice.reason,
        inWatchlist: watchlist.has(movie.id),
      });
    }

    return logAndReturn(picks);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed. Try again.";
    return { status: "error", message };
  }
}
