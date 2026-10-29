import {
  BadgeCheck,
  BookOpenCheck,
  ClipboardClock,
  Coins,
  Gift,
  GraduationCap,
  MessageCircleHeart,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/Feedback";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { requireSupabase } from "../../lib/supabase";
import type { PointWallet, Profile } from "../../types/domain";

export function TeacherDashboard() {
  const { profile } = useAuth();
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [a, p, g, w, r, s, achievements, wishes] = await Promise.all([
      db.from("assignments").select("*", { count: "exact", head: true }),
      db
        .from("submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", "submitted"),
      db
        .from("grading_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved"),
      db
        .from("point_wallets")
        .select("*, profiles(display_name)")
        .limit(1)
        .maybeSingle(),
      db
        .from("reward_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      db.from("point_ledger").select("delta").gt("delta", 0),
      db
        .from("achievement_submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      db
        .from("reward_wishes")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    for (const result of [a, p, g, w, r, s, achievements, wishes])
      if (result.error) throw result.error;
    return {
      assignments: a.count ?? 0,
      pending: p.count ?? 0,
      graded: g.count ?? 0,
      wallet: w.data as unknown as (PointWallet & { profiles: Profile }) | null,
      rewards: r.count ?? 0,
      total: (s.data ?? []).reduce((sum, item) => sum + Number(item.delta), 0),
      achievements: achievements.count ?? 0,
      wishes: wishes.count ?? 0,
    };
  }, []);
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải tổng quan."} />;
  const d = state.data;
  const cards = [
    {
      label: "Tổng bài đã giao",
      value: d.assignments,
      icon: <BookOpenCheck />,
      color: "bg-peach-100 text-peach-500",
    },
    {
      label: "Bài chờ chấm",
      value: d.pending,
      icon: <ClipboardClock />,
      color: "bg-amber-100 text-amber-700",
    },
    {
      label: "Bài đã duyệt",
      value: d.graded,
      icon: <Trophy />,
      color: "bg-mint-100 text-mint-500",
    },
    {
      label: "Thành tích chờ duyệt",
      value: d.achievements,
      icon: <BadgeCheck />,
      color: "bg-amber-100 text-amber-700",
    },
    {
      label: "Mong muốn phần thưởng",
      value: d.wishes,
      icon: <MessageCircleHeart />,
      color: "bg-pink-100 text-pink-700",
    },
    {
      label: "Điểm đã thưởng",
      value: d.total,
      icon: <Coins />,
      color: "bg-sky-100 text-sky-700",
    },
    {
      label: "Điểm hiện có",
      value: d.wallet?.available_points ?? 0,
      icon: <GraduationCap />,
      color: "bg-violet-100 text-violet-700",
    },
    {
      label: "Quà chờ trao",
      value: d.rewards,
      icon: <Gift />,
      color: "bg-rose-100 text-rose-700",
    },
  ];
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Bảng điều khiển giáo viên</p>
        <h1 className="page-title mt-1">Chào {profile?.display_name}!</h1>
        <p className="mt-2 text-tea-500">
          Hôm nay mình cùng theo dõi từng bước tiến của học sinh.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.label}
            className="card flex items-center gap-4 p-5"
          >
            <span
              className={`grid h-14 w-14 place-items-center rounded-2xl ${card.color}`}
            >
              {card.icon}
            </span>
            <div>
              <p className="text-sm font-bold text-tea-500">{card.label}</p>
              <p className="text-3xl font-black">{card.value}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Quick
          to="/giao-vien/bai-tap"
          icon="📝"
          title="Tạo bài tập"
          description="Soạn và đăng một bài Toán mới."
        />
        <Quick
          to="/giao-vien/cham-bai"
          icon="✅"
          title="Chấm bài"
          description={`${d.pending} bài đang chờ nhận xét.`}
        />
        <Quick
          to="/giao-vien/duyet-thanh-tich"
          icon="🏅"
          title="Duyệt thành tích"
          description={`${d.achievements} minh chứng đang chờ.`}
        />
        <Quick
          to="/giao-vien/cua-hang"
          icon="💭"
          title="Xem mong muốn"
          description={`${d.wishes} đề nghị phần thưởng mới.`}
        />
        <Quick
          to="/giao-vien/doi-qua"
          icon="🎁"
          title="Trao quà"
          description={`${d.rewards} phần quà đang chờ trao.`}
        />
      </section>
      {d.wallet && (
        <section className="card flex flex-col gap-5 overflow-hidden p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">Học sinh</p>
            <h2 className="mt-1 text-xl font-black">
              {d.wallet.profiles?.display_name}
            </h2>
            <p className="mt-2 text-sm text-tea-500">
              Tổng đã kiếm {d.wallet.earned_points} · Đã đổi{" "}
              {d.wallet.redeemed_points}
            </p>
          </div>
          <div className="rounded-2xl bg-mint-100 px-8 py-5 text-center">
            <p className="text-xs font-extrabold text-mint-500">
              SỐ DƯ KHẢ DỤNG
            </p>
            <p className="text-4xl font-black text-tea-700">
              {d.wallet.available_points}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
function Quick({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="card group p-6 transition hover:-translate-y-1 hover:shadow-lg"
    >
      <span className="text-4xl">{icon}</span>
      <h2 className="mt-4 text-lg font-black group-hover:text-mint-500">
        {title}
      </h2>
      <p className="mt-1 text-sm text-tea-500">{description}</p>
    </Link>
  );
}
