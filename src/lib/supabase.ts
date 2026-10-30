import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfiguration } from "./supabase-config";

const resolved = resolveSupabaseConfiguration({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export const isSupabaseConfigured = resolved.configured;
export const supabaseConfigurationError = resolved.error;

export const supabase = resolved.configured
  ? createClient(resolved.config.url, resolved.config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError ??
        "Supabase chưa được cấu hình. Hãy thiết lập tệp .env.local trước.",
    );
  return supabase;
}
