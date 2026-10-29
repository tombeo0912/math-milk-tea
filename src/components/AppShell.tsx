import {
  BadgeCheck,
  BookOpenCheck,
  ClipboardCheck,
  Coins,
  Gift,
  Home,
  LogOut,
  Menu,
  Medal,
  Settings,
  Store,
  Trophy,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { NotificationCenter } from "./NotificationCenter";
import { BrandMark } from "./BrandMark";

const studentLinks = [
  { to: "/hoc-sinh", label: "Trang chủ", icon: Home, end: true },
  { to: "/hoc-sinh/bai-tap", label: "Bài tập của em", icon: BookOpenCheck },
  { to: "/hoc-sinh/ket-qua", label: "Kết quả học tập", icon: Trophy },
  { to: "/hoc-sinh/thanh-tich", label: "Điểm ở trường", icon: Medal },
  { to: "/hoc-sinh/cua-hang", label: "Cửa hàng", icon: Store },
  { to: "/hoc-sinh/qua-cua-em", label: "Quà của em", icon: Gift },
];
const teacherLinks = [
  { to: "/giao-vien", label: "Tổng quan", icon: Home, end: true },
  { to: "/giao-vien/bai-tap", label: "Quản lý bài tập", icon: BookOpenCheck },
  { to: "/giao-vien/cham-bai", label: "Chấm bài", icon: ClipboardCheck },
  {
    to: "/giao-vien/duyet-thanh-tich",
    label: "Duyệt thành tích",
    icon: BadgeCheck,
  },
  { to: "/giao-vien/diem-thuong", label: "Điểm thưởng", icon: Coins },
  { to: "/giao-vien/cua-hang", label: "Cửa hàng", icon: Store },
  { to: "/giao-vien/doi-qua", label: "Quà đã đổi", icon: Gift },
  { to: "/giao-vien/cai-dat", label: "Cài đặt", icon: Settings },
];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const links = profile?.role === "teacher" ? teacherLinks : studentLinks;
  const sidebar = (
    <aside className="flex h-full flex-col overflow-y-auto bg-tea-900 px-4 py-5 text-white">
      <div className="flex items-center justify-between px-2">
        <NavLink
          to={profile?.role === "teacher" ? "/giao-vien" : "/hoc-sinh"}
          className="flex items-center gap-3"
          onClick={() => setOpen(false)}
        >
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-peach-100">
            <BrandMark />
          </span>
          <div>
            <strong className="block leading-tight">Math &amp; Milk Tea</strong>
            <span className="text-xs text-tea-300">
              Học vui, tiến bộ mỗi ngày
            </span>
          </div>
        </NavLink>
        <button
          className="p-2 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Đóng menu"
        >
          <X />
        </button>
      </div>
      <nav className="mt-8 space-y-1" aria-label="Điều hướng chính">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${isActive ? "bg-white text-tea-900 shadow-lg" : "text-tea-100 hover:bg-white/10"}`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="mb-3 px-3">
          <p className="text-xs text-tea-300">Đang đăng nhập</p>
          <p className="truncate text-sm font-extrabold">
            {profile?.display_name}
          </p>
        </div>
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-tea-100 hover:bg-white/10"
          onClick={() => void signOut()}
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
  return (
    <div className="min-h-screen bg-cream-100 lg:grid lg:grid-cols-[270px_1fr]">
      <div className="hidden h-screen lg:sticky lg:top-0 lg:block">
        {sidebar}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid grid-cols-[minmax(270px,85vw)_1fr] lg:hidden">
          <div>{sidebar}</div>
          <button
            className="bg-black/35"
            aria-label="Đóng menu"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-tea-100 bg-cream-100/90 px-4 backdrop-blur md:px-7 lg:hidden">
          <button
            className="rounded-xl bg-white p-2.5 text-tea-700 shadow-sm"
            onClick={() => setOpen(true)}
            aria-label="Mở menu"
          >
            <Menu />
          </button>
          <span className="font-extrabold">Math &amp; Milk Tea</span>
          <NotificationCenter />
        </header>
        <div className="fixed right-6 top-5 z-40 hidden lg:block">
          <NotificationCenter />
        </div>
        <div className="mx-auto w-full max-w-[1500px] p-4 md:p-7 lg:p-9">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
