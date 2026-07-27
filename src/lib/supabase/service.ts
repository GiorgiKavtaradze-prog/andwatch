import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
