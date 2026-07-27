import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("taste_profiles")
    .select("computed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.computed_at) redirect("/feed");

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? "there";
  const avatar = meta.avatar_url ?? meta.picture ?? null;

  return (
    <AppShell userName={name} avatarUrl={avatar} onSignOut={signOut}>
      <OnboardingFlow />
    </AppShell>
  );
}
