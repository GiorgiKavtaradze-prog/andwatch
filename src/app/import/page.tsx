import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { ImportFlow } from "./import-flow";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  return (
    <AppShell activeHref="/import" userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <section className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
            Import
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-text">
            Bring your ratings
          </h1>
          <p className="max-w-prose font-sans text-text-secondary">
            Upload your Letterboxd or IMDb ratings export and we will turn it into a taste profile.
            We read the file in your browser, match each film to a real movie, and never invent a
            title. Your ratings stay private to you.
          </p>
        </header>
        <ImportFlow />
      </section>
    </AppShell>
  );
}
