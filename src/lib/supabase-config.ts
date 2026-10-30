export type SupabaseEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

export type SupabaseConfiguration = {
  url: string;
  publishableKey: string;
  keySource: "publishable" | "legacy-anon";
};

export type SupabaseConfigurationResult =
  | { configured: true; config: SupabaseConfiguration; error: null }
  | { configured: false; config: null; error: string };

function decodeLegacyJwtRole(key: string) {
  const payload = key.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

export function resolveSupabaseConfiguration(
  environment: SupabaseEnvironment,
): SupabaseConfigurationResult {
  const url = environment.VITE_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const legacyAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const key = publishableKey || legacyAnonKey;

  if (!url || !key) {
    return {
      configured: false,
      config: null,
      error:
        "Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      configured: false,
      config: null,
      error: "VITE_SUPABASE_URL không phải URL hợp lệ.",
    };
  }

  const localHttp =
    parsedUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !localHttp) {
    return {
      configured: false,
      config: null,
      error: "VITE_SUPABASE_URL phải dùng HTTPS (trừ Supabase local).",
    };
  }

  if (
    url.includes("your-project") ||
    key.includes("your-publishable") ||
    key.includes("YOUR_PUBLISHABLE")
  ) {
    return {
      configured: false,
      config: null,
      error: "Cấu hình Supabase vẫn đang dùng giá trị mẫu.",
    };
  }

  const jwtRole = decodeLegacyJwtRole(key);
  if (key.startsWith("sb_secret_") || jwtRole === "service_role") {
    return {
      configured: false,
      config: null,
      error:
        "Không được dùng secret/service_role key trong frontend. Hãy dùng publishable key.",
    };
  }

  const isPublishable = key.startsWith("sb_publishable_");
  const isLegacyAnon = jwtRole === "anon";
  if (!isPublishable && !isLegacyAnon) {
    return {
      configured: false,
      config: null,
      error:
        "API key không hợp lệ. Hãy dùng sb_publishable_... hoặc legacy anon key.",
    };
  }

  return {
    configured: true,
    config: {
      url: parsedUrl.toString().replace(/\/$/, ""),
      publishableKey: key,
      keySource: isPublishable ? "publishable" : "legacy-anon",
    },
    error: null,
  };
}
