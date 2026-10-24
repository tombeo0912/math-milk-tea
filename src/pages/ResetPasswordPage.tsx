import { LoaderCircle, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export function ResetPasswordPage() {
  const { user, profile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10)
      return toast.error("Mật khẩu nên có ít nhất 10 ký tự.");
    if (password !== confirm)
      return toast.error("Hai lần nhập mật khẩu chưa khớp.");
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      setDone(true);
      toast.success("Đã cập nhật mật khẩu an toàn.");
    }
  }
  if (done && user && profile)
    return (
      <Navigate
        to={profile.role === "teacher" ? "/giao-vien" : "/hoc-sinh"}
        replace
      />
    );
  return (
    <main className="grid min-h-screen place-items-center bg-cream-100 p-4">
      <form className="card w-full max-w-md p-7" onSubmit={submit}>
        <span className="text-4xl">🔐</span>
        <h1 className="mt-4 text-2xl font-black">Đặt lại mật khẩu</h1>
        <p className="mt-2 text-sm text-tea-500">
          Chọn mật khẩu riêng, khó đoán và không dùng lại mật khẩu email.
        </p>
        <label className="mt-6 block">
          <span className="label">Mật khẩu mới</span>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="mt-4 block">
          <span className="label">Nhập lại mật khẩu</span>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button
          className="btn-primary mt-6 w-full"
          disabled={busy || !supabase}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Save size={18} />
          )}
          Lưu mật khẩu mới
        </button>
        <Link
          className="mt-4 block text-center text-sm font-bold text-mint-500"
          to="/dang-nhap"
        >
          Trở lại đăng nhập
        </Link>
      </form>
    </main>
  );
}
