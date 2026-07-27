import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getFeed } from "./actions";
import { FeedView } from "./feed-view";

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;

  const initial = await getFeed();

  return (
    <AppShell activeHref="/feed" userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <FeedView initial={initial} />
    </AppShell>
  );
}
