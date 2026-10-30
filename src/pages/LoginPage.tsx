import {
  BookOpenCheck,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { BrandMark } from "../components/BrandMark";

export function LoginPage() {
  const { user, profile, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  if (user && profile)
    return (
      <Navigate
        to={profile.role === "teacher" ? "/giao-vien" : "/hoc-sinh"}
        replace
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error)
      toast.error(
        error.message === "Invalid login credentials"
          ? "Email hoặc mật khẩu chưa đúng."
          : error.message,
      );
  }
  async function resetPassword() {
    if (!supabase || !email.trim())
      return toast.info("Hãy nhập email tài khoản trước nhé.");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/dat-lai-mat-khau`,
    });
    if (error) toast.error("Chưa thể gửi hướng dẫn đặt lại mật khẩu.");
    else
      toast.success(
        "Đã gửi hướng dẫn đặt lại mật khẩu đến email quản lý tài khoản.",
      );
  }
  return (
    <main className="soft-grid min-h-screen bg-cream-100 p-4 md:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_rgba(75,45,28,.14)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-tea-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-peach-500/20 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
              <BookOpenCheck size={17} />
              Góc học Toán thật vui
            </span>
            <h1 className="mt-8 max-w-lg text-5xl font-black leading-[1.08] tracking-[-.05em]">
              Mỗi bài Toán,
              <br />
              <span className="text-peach-100">một bước gần quà hơn.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-tea-100">
              Nộp bài bằng ảnh, nhận lời nhận xét và nhìn cốc trà sữa đầy dần
              theo từng nỗ lực của em.
            </p>
          </div>
          <div className="relative grid grid-cols-3 gap-3 text-center">
            {[
              ["✏️", "Làm bài"],
              ["⭐", "Nhận điểm"],
              ["🎁", "Đổi quà"],
            ].map(([icon, label]) => (
              <div key={label} className="rounded-2xl bg-white/10 p-4">
                <span className="text-3xl">{icon}</span>
                <strong className="mt-2 block text-sm">{label}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="flex items-center p-6 sm:p-10 lg:p-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3">
              <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-peach-100">
                <BrandMark />
              </span>
              <div>
                <h2 className="text-xl font-black">Math &amp; Milk Tea</h2>
                <p className="text-sm text-tea-500">
                  Học Toán · Tích điểm · Đổi quà
                </p>
              </div>
            </div>
            <p className="eyebrow">Chào mừng trở lại</p>
            <h1 className="page-title mt-2">Đăng nhập vào góc học tập</h1>
            <p className="mt-2 text-sm text-tea-500">
              Dùng tài khoản riêng do giáo viên đã cấp.
            </p>
            {!configured && (
              <div className="mt-6 break-words rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong className="block">Chưa kết nối Supabase</strong>
                <span>
                  {supabaseConfigurationError ??
                    "Thêm VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY vào .env.local, sau đó khởi động lại ứng dụng."}
                </span>
              </div>
            )}
            <form className="mt-8 space-y-5" onSubmit={submit}>
              <label className="block">
                <span className="label">Email tài khoản</span>
                <span className="relative block">
                  <Mail
                    className="absolute left-3 top-3.5 text-tea-300"
                    size={19}
                  />
                  <input
                  className="field with-icon"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="ten-tai-khoan@example.com"
                    disabled={!configured}
                  />
                </span>
              </label>
              <label className="block">
                <span className="label">Mật khẩu</span>
                <span className="relative block">
                  <LockKeyhole
                    className="absolute left-3 top-3.5 text-tea-300"
                    size={19}
                  />
                  <input
                  className="field with-icon"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nhập mật khẩu"
                    disabled={!configured}
                  />
                </span>
              </label>
              <button
                className="btn-primary w-full"
                disabled={!configured || busy}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <KeyRound size={19} />
                )}
                Đăng nhập
              </button>
            </form>
            <button
              className="mt-4 w-full text-center text-sm font-bold text-mint-500 hover:underline"
              type="button"
              onClick={() => void resetPassword()}
              disabled={!configured}
            >
              Quên mật khẩu?
            </button>
            <p className="mt-8 rounded-xl bg-mint-100/70 p-3 text-center text-xs leading-relaxed text-tea-700">
              Hệ thống không mở đăng ký công khai. Nếu chưa có tài khoản, em hãy
              nhờ giáo viên hỗ trợ nhé.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
