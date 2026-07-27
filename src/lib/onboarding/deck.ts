import { MOVIE_COLUMNS, type Movie } from "@/lib/catalog/types";
import { getServiceClient } from "@/lib/supabase/service";
import { ONBOARDING_DECK_SIZE } from "./constants";

export async function buildOnboardingDeck(
  genres: string[],
  excludeIds: number[] = [],
  size: number = ONBOARDING_DECK_SIZE,
): Promise<Movie[]> {
  const service = getServiceClient();

  const { data, error } = await service
    .from("movies")
    .select(MOVIE_COLUMNS)
    .not("embedding", "is", null)
    .not("synced_at", "is", null)
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(size * 10);
  if (error) throw new Error(`buildOnboardingDeck failed: ${error.message}`);

  const exclude = new Set(excludeIds);
  const pool = ((data as Movie[]) ?? []).filter(
    (movie) => !exclude.has(movie.id),
  );

  if (genres.length === 0) return pool.slice(0, size);

  const want = new Set(genres.map((g) => g.toLowerCase()));
  const matched: Movie[] = [];
  const rest: Movie[] = [];
  for (const movie of pool) {
    const isMatch = (movie.genres ?? []).some((g) =>
      want.has(g.name.toLowerCase()),
    );
    (isMatch ? matched : rest).push(movie);
  }

  return [...matched, ...rest].slice(0, size);
}
