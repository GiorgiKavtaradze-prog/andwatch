"use server";

import { MOVIE_COLUMNS, type Movie } from "@/lib/catalog/types";
import { createClient } from "@/lib/supabase/server";

export async function setWatchlist(
  movieId: number,
  add: boolean,
): Promise<{ status: "ok" } | { status: "error"; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "You must be signed in." };

  const { error } = add
    ? await supabase
        .from("watchlist_items")
        .upsert({ user_id: user.id, movie_id: movieId }, { onConflict: "user_id,movie_id" })
    : await supabase
        .from("watchlist_items")
        .delete()
        .eq("user_id", user.id)
        .eq("movie_id", movieId);

  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}

export async function getWatchlist(): Promise<Movie[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("watchlist_items")
    .select(`added_at, movie:movies(${MOVIE_COLUMNS})`)
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  const movies: Movie[] = [];
  for (const row of data ?? []) {
    const raw = (row as { movie: Movie | Movie[] | null }).movie;
    const movie = Array.isArray(raw) ? raw[0] : raw;
    if (movie) movies.push(movie);
  }
  return movies;
}
