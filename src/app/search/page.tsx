import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { SearchView } from "./search-view";

export default async function SearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;

  return (
    <AppShell activeHref="/search" userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <SearchView />
    </AppShell>
  );
}
