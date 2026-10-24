import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate } from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type { RewardRedemption } from "../../types/domain";

export function StudentGifts() {
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("reward_redemptions")
      .select("*")
      .order("redeemed_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as RewardRedemption[];
  }, []);
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return (
      <ErrorState message={state.error ?? "Không thể tải danh sách quà."} />
    );
  return (
    <div>
      <header>
        <p className="eyebrow">Quà của em</p>
        <h1 className="page-title mt-1">Bộ sưu tập nỗ lực</h1>
        <p className="mt-2 text-tea-500">
          Mỗi món quà là dấu mốc cho những bài Toán em đã hoàn thành.
        </p>
      </header>
      <div className="mt-7 grid gap-4">
        {state.data.length === 0 ? (
          <EmptyState
            title="Chưa có quà được đổi"
            description="Chọn mục tiêu trong cửa hàng và tiếp tục tích điểm nhé."
          />
        ) : (
          state.data.map((item) => (
            <article
              key={item.id}
              className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
            >
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-peach-100 text-3xl">
                🎁
              </span>
              <div className="flex-1">
                <h2 className="font-black">{item.product_name_snapshot}</h2>
                <p className="mt-1 text-sm text-tea-500">
                  Đổi lúc {friendlyDate(item.redeemed_at, true)} ·{" "}
                  {item.price_points_snapshot} điểm
                </p>
              </div>
              <StatusPill
                tone={
                  item.status === "delivered"
                    ? "success"
                    : item.status === "cancelled"
                      ? "neutral"
                      : "warning"
                }
              >
                {item.status === "delivered"
                  ? "Đã trao"
                  : item.status === "cancelled"
                    ? "Đã hủy"
                    : "Chờ giáo viên trao"}
              </StatusPill>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
