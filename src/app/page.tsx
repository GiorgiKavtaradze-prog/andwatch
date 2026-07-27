import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { HomeRows } from "@/app/home-rows";
import { AppShell } from "@/components/app-shell";
import { ContinueWithGoogle } from "@/components/continue-with-google";
import { Button } from "@/components/ui/button";
import { getHomeRows } from "@/lib/rows";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-6 text-text">
        <div className="max-w-xl space-y-6 text-center">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
            Movie recommendations
          </p>
          <h1 className="font-serif text-6xl font-semibold tracking-tight text-text">Reel</h1>
          <p className="mx-auto max-w-prose font-sans text-lg text-text-secondary">
            Import your Letterboxd or IMDb history, or just describe a vibe. Get picks that actually
            fit your taste, each with a reason.
          </p>
          <div className="flex justify-center pt-2">
            <ContinueWithGoogle />
          </div>
        </div>
      </main>
    );
  }

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  const firstName = name.split(" ")[0];

  const home = await getHomeRows(supabase, user.id);
  const hasProfile = home.status === "ready";

  return (
    <AppShell userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <div className="space-y-12">
        <section className="space-y-4">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
            Signed in
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">
            Welcome back, {firstName}
          </h1>
          <p className="max-w-prose font-sans text-text-secondary">
            {hasProfile
              ? "A few more angles on your taste, beyond your main feed. Your data is private to you."
              : "Import your Letterboxd or IMDb ratings, or build a profile through onboarding, and we will turn it into a personal feed. Your data is private to you."}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link href="/feed">
                View your feed
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {hasProfile ? (
              <Button variant="secondary" asChild>
                <Link href="/search">Try vibe search</Link>
              </Button>
            ) : (
              <>
                <Button variant="secondary" asChild>
                  <Link href="/onboarding">Build a profile</Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/import">Import your ratings</Link>
                </Button>
              </>
            )}
          </div>
        </section>

        {home.status === "ready" && <HomeRows initial={home.rows} />}
      </div>
    </AppShell>
  );
}
