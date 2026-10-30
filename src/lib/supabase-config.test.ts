import { describe, expect, it } from "vitest";
import { resolveSupabaseConfiguration } from "./supabase-config";

const url = "https://example-project.supabase.co";
const publishableKey = "sb_publishable_1234567890123456789012_12345678";

function legacyKey(role: "anon" | "service_role") {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
}

describe("resolveSupabaseConfiguration", () => {
  it("ưu tiên publishable key mới", () => {
    const result = resolveSupabaseConfiguration({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      VITE_SUPABASE_ANON_KEY: legacyKey("anon"),
    });

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.config.keySource).toBe("publishable");
      expect(result.config.publishableKey).toBe(publishableKey);
    }
  });

  it("vẫn hỗ trợ legacy anon key trong giai đoạn chuyển đổi", () => {
    const result = resolveSupabaseConfiguration({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: legacyKey("anon"),
    });

    expect(result.configured).toBe(true);
    if (result.configured)
      expect(result.config.keySource).toBe("legacy-anon");
  });

  it("từ chối sb_secret key", () => {
    const forbiddenKey = [
      "sb",
      "secret",
      "1234567890123456789012",
      "12345678",
    ].join("_");
    const result = resolveSupabaseConfiguration({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: forbiddenKey,
    });

    expect(result.configured).toBe(false);
    expect(result.error).toContain("secret/service_role");
  });

  it("từ chối legacy service_role key", () => {
    const result = resolveSupabaseConfiguration({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: legacyKey("service_role"),
    });

    expect(result.configured).toBe(false);
    expect(result.error).toContain("secret/service_role");
  });

  it("báo thiếu cấu hình thay vì tạo client lỗi", () => {
    const result = resolveSupabaseConfiguration({});

    expect(result.configured).toBe(false);
    expect(result.config).toBeNull();
  });
});
