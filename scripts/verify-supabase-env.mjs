import { loadEnv } from "vite";

const environment = loadEnv("production", process.cwd(), "");
const url = environment.VITE_SUPABASE_URL?.trim();
const publishableKey =
  environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  environment.VITE_SUPABASE_ANON_KEY?.trim();

const errors = [];

function decodeLegacyRole(key) {
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(
      Buffer.from(normalized, "base64").toString("utf8"),
    );
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

if (!url || url.includes("your-project"))
  errors.push("VITE_SUPABASE_URL đang thiếu hoặc vẫn là giá trị mẫu.");
else {
  try {
    const parsed = new URL(url);
    const localHttp =
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp)
      errors.push("VITE_SUPABASE_URL phải dùng HTTPS (trừ Supabase local).");
  } catch {
    errors.push("VITE_SUPABASE_URL không phải URL hợp lệ.");
  }
}

if (!publishableKey)
  errors.push(
    "Thiếu VITE_SUPABASE_PUBLISHABLE_KEY (hoặc VITE_SUPABASE_ANON_KEY cũ).",
  );
else if (publishableKey.startsWith("sb_secret_"))
  errors.push("Không được dùng sb_secret_ key trong frontend.");
else if (decodeLegacyRole(publishableKey) === "service_role")
  errors.push("Không được dùng legacy service_role key trong frontend.");
else if (
  !publishableKey.startsWith("sb_publishable_") &&
  !publishableKey.startsWith("eyJ")
)
  errors.push("API key phải là publishable key hoặc legacy anon JWT.");

if (errors.length) {
  console.error("Không thể build vì cấu hình Supabase chưa an toàn:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Supabase build config: URL hợp lệ, key=${publishableKey.startsWith("sb_publishable_") ? "publishable" : "legacy-anon"}.`,
);
