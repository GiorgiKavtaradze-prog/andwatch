"use server";

import type { Movie } from "@/lib/catalog";
import type { FinalizeResult } from "@/lib/import/types";
import { buildOnboardingDeck } from "@/lib/onboarding";
import { ONBOARDING_MIN_DECISIONS } from "@/lib/onboarding/constants";
import { createClient } from "@/lib/supabase/server";
import { computeTasteProfile } from "@/lib/taste";

export type OnboardingDeckResult =
  | { status: "ok"; deck: Movie[] }
  | { status: "thin"; deck: Movie[] };

export interface OnboardingSwipe {
  movieId: number;
  liked: boolean;
}

export async function getOnboardingDeck(
  genres: string[],
  sessionSeen: number[] = [],
): Promise<OnboardingDeckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "thin", deck: [] };
  const { data: rated } = await supabase.from("ratings").select("movie_id").eq("user_id", user.id);
  const excludeIds = [
    ...new Set([...(rated ?? []).map((r) => r.movie_id as number), ...sessionSeen]),
  ];
  const deck = await buildOnboardingDeck(genres, excludeIds);
  return { status: deck.length < ONBOARDING_MIN_DECISIONS ? "thin" : "ok", deck };
}

export async function completeOnboarding(swipes: OnboardingSwipe[]): Promise<FinalizeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "failed", error: "You must be signed in to finish onboarding." };

  const byMovie = new Map<number, OnboardingSwipe>();
  for (const s of swipes) byMovie.set(s.movieId, s);

  const rows = [...byMovie.values()].map((s) => ({
    user_id: user.id,
    movie_id: s.movieId,
    source: "onboarding" as const,
    raw_value: s.liked ? 1 : 0,
    raw_scale: "binary",
    normalized_value: s.liked ? 100 : 0,
    rated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("ratings")
      .upsert(rows, { onConflict: "user_id,movie_id" });
    if (error) return { status: "failed", error: `Could not save your swipes: ${error.message}` };
  }

  const result = await computeTasteProfile(supabase, user.id);

  if (result.status === "computed") {
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
  }
  return result;
}
