import { BookOpen, CheckCircle2, Gift, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { MilkTeaCup } from "../../components/MilkTeaCup";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  calculateProgress,
  friendlyDate,
  pointsRemaining,
} from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type {
  Assignment,
  PointWallet,
  RewardRedemption,
  RewardTarget,
  Submission,
} from "../../types/domain";

interface DashboardData {
  wallet: PointWallet;
  target: RewardTarget | null;
  assignments: Assignment[];
  submissions: Submission[];
  latestReward: RewardRedemption | null;
}

export function StudentDashboard() {
  const { profile } = useAuth();
  const state = useAsyncData<DashboardData>(async () => {
    const db = requireSupabase();
    const [wallet, target, assignments, submissions, reward] =
      await Promise.all([
        db.from("point_wallets").select("*").single(),
        db.from("reward_targets").select("*, reward_products(*)").maybeSingle(),
        db
          .from("assignments")
          .select("*")
          .eq("status", "published")
          .eq("accepts_submissions", true)
          .order("created_at", { ascending: false })
          .limit(4),
        db
          .from("submissions")
          .select("*, assignment:assignments(*)")
          .order("submitted_at", { ascending: false }),
        db
          .from("reward_redemptions")
          .select("*")
          .order("redeemed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    for (const result of [wallet, target, assignments, submissions, reward])
      if (result.error) throw result.error;
    return {
      wallet: wallet.data as PointWallet,
      target: target.data as unknown as RewardTarget | null,
      assignments: (assignments.data ?? []) as Assignment[],
      submissions: (submissions.data ?? []) as unknown as Submission[],
      latestReward: reward.data as RewardRedemption | null,
    };
  }, []);
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return (
      <ErrorState
        message={state.error ?? "Không thể tải trang chủ."}
        action={
          <button className="btn-secondary" onClick={() => void state.reload()}>
            Thử lại
          </button>
        }
      />
    );
  const { wallet, target, assignments, submissions, latestReward } = state.data;
  const product = target?.reward_products;
  const price = product?.price_points ?? 200;
  const progress = calculateProgress(wallet.available_points, price);
  const submittedIds = new Set(submissions.map((item) => item.assignment_id));
  const todo = assignments.filter((item) => !submittedIds.has(item.id));
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Góc học tập của em</p>
        <h1 className="page-title mt-1">Chào {profile?.display_name}! 👋</h1>
        <p className="mt-2 text-tea-500">
          Mình cùng hoàn thành từng bài thật chắc nhé.
        </p>
      </header>
      <MilkTeaCup
        progress={progress}
        current={wallet.available_points}
        target={price}
        label={product?.name ?? "Một cốc trà sữa"}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<Sparkles />}
          label="Điểm hiện có"
          value={`${wallet.available_points}`}
          hint={`${wallet.earned_points} điểm đã kiếm`}
        />
        <Stat
          icon={<Gift />}
          label="Còn thiếu"
          value={`${pointsRemaining(wallet.available_points, price)}`}
          hint={`để đổi ${product?.name ?? "món quà"}`}
        />
        <Stat
          icon={<BookOpen />}
          label="Bài cần làm"
          value={`${todo.length}`}
          hint="cứ bình tĩnh làm từng bài"
        />
        <Stat
          icon={<CheckCircle2 />}
          label="Đã nộp"
          value={`${submissions.length}`}
          hint="mọi cố gắng đều đáng quý"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <section className="card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Tiếp theo</p>
              <h2 className="mt-1 text-xl font-black">Bài tập cần làm</h2>
            </div>
            <Link className="btn-ghost text-sm" to="/hoc-sinh/bai-tap">
              Xem tất cả
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {todo.length === 0 ? (
              <div className="rounded-2xl bg-mint-100 p-5 text-sm font-semibold">
                Tuyệt lắm! Hiện em không còn bài nào chờ nộp. 🌿
              </div>
            ) : (
              todo.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  to={`/hoc-sinh/bai-tap/${item.id}`}
                  className="flex items-center justify-between rounded-2xl border border-tea-100 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div>
                    <h3 className="font-extrabold">{item.title}</h3>
                    <p className="mt-1 text-xs text-tea-500">
                      Hạn nộp: {friendlyDate(item.due_at, true)}
                    </p>
                  </div>
                  <StatusPill tone="warning">Chưa nộp</StatusPill>
                </Link>
              ))
            )}
          </div>
        </section>
        <section className="card p-5 md:p-6">
          <p className="eyebrow">Phần quà gần nhất</p>
          <h2 className="mt-1 text-xl font-black">Quà của em</h2>
          {latestReward ? (
            <div className="mt-6 rounded-2xl bg-peach-100 p-5">
              <span className="text-4xl">🎁</span>
              <h3 className="mt-3 font-extrabold">
                {latestReward.product_name_snapshot}
              </h3>
              <p className="mt-1 text-sm text-tea-500">
                Đổi ngày {friendlyDate(latestReward.redeemed_at, true)}
              </p>
              <div className="mt-4">
                <StatusPill
                  tone={
                    latestReward.status === "delivered" ? "success" : "warning"
                  }
                >
                  {latestReward.status === "delivered"
                    ? "Đã trao"
                    : "Đang chờ trao"}
                </StatusPill>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-tea-300 p-6 text-center text-sm text-tea-500">
              Món quà đầu tiên đang chờ em chinh phục!
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint-100 text-mint-500">
        {icon}
      </span>
      <div>
        <p className="text-xs font-bold text-tea-500">{label}</p>
        <p className="text-2xl font-black">{value}</p>
        <p className="text-xs text-tea-500">{hint}</p>
      </div>
    </div>
  );
}
