function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export const serverEnv = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  // The Supabase secret key bypasses row-level security. Server-only, system paths only.
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  // The TMDB v4 bearer read-access token. Sent as an Authorization header, never in a URL.
  tmdbReadToken: required("TMDB_API_READ_ACCESS_TOKEN"),
  // The OpenAI API key for embeddings (text-embedding-3-small). Server-only, never in the browser.
  openaiApiKey: required("OPENAI_API_KEY"),
  // The Anthropic key for the reason-writing Claude Sonnet call (ADR 0007). Server-only.
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
} as const;
