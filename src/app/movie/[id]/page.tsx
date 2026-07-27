import { notFound, redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { AppShell } from "@/components/app-shell";
import { PosterImage } from "@/components/poster-image";
import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/watchlist-button";
import { MOVIE_COLUMNS, type Movie } from "@/lib/catalog/types";
import { createClient } from "@/lib/supabase/server";

function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const movieId = Number(id);
  if (!Number.isFinite(movieId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: movieRow } = await supabase
    .from("movies")
    .select(MOVIE_COLUMNS)
    .eq("id", movieId)
    .maybeSingle();
  if (!movieRow) notFound();
  const movie = movieRow as Movie;
  const { data: watch } = await supabase
    .from("watchlist_items")
    .select("movie_id")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .maybeSingle();
  const inWatchlist = Boolean(watch);
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  const runtime = formatRuntime(movie.runtime_minutes);
  const directors = (movie.directors ?? []).map((d) => d.name).filter(Boolean);
  const cast = (movie.top_cast ?? []).slice(0, 6);
  return (
    <AppShell userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <article className="grid gap-8 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="mx-auto w-full max-w-xs md:mx-0">
          <PosterImage posterPath={movie.poster_path} title={movie.title} className="rounded-lg" />
        </div>
        <div className="space-y-6">
          <header className="space-y-3">
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">
              {movie.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 font-sans text-sm text-text-secondary">
              {movie.release_year != null && <span>{movie.release_year}</span>}
              {runtime && (
                <>
                  <span aria-hidden="true" className="text-text-muted">
                    &middot;
                  </span>
                  <span>{runtime}</span>
                </>
              )}
              {movie.vote_average != null && movie.vote_average > 0 && (
                <>
                  <span aria-hidden="true" className="text-text-muted">
                    &middot;
                  </span>
                  <span>{movie.vote_average.toFixed(1)} average</span>
                </>
              )}
            </div>
            {(movie.genres?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {movie.genres?.map((g) => (
                  <Badge key={g.id} variant="outline" size="sm">
                    {g.name}
                  </Badge>
                ))}
              </div>
            )}
          </header>
          <WatchlistButton
            movieId={movie.id}
            title={movie.title}
            initialInWatchlist={inWatchlist}
          />
          {movie.overview && (
            <p className="max-w-prose font-sans text-base leading-relaxed text-text-secondary">
              {movie.overview}
            </p>
          )}
          <dl className="grid gap-4 sm:grid-cols-2">
            {directors.length > 0 && (
              <div className="space-y-1">
                <dt className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
                  {directors.length > 1 ? "Directors" : "Director"}
                </dt>
                <dd className="font-sans text-text">{directors.join(", ")}</dd>
              </div>
            )}
            {cast.length > 0 && (
              <div className="space-y-1">
                <dt className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
                  Cast
                </dt>
                <dd className="font-sans text-text">{cast.map((c) => c.name).join(", ")}</dd>
              </div>
            )}
          </dl>
        </div>
      </article>
    </AppShell>
  );
}
