import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getWatchlist } from "./actions";
import { WatchlistView } from "./watchlist-view";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  const movies = await getWatchlist();

  return (
    <AppShell activeHref="/watchlist" userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <section className="space-y-8">
        <header className="space-y-2">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
            Saved
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">
            Your watchlist
          </h1>
        </header>
        <WatchlistView initial={movies} />
      </section>
    </AppShell>
  );
}
