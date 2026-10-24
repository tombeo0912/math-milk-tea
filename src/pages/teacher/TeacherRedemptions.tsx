import { CheckCircle2, Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate, makeIdempotencyKey } from "../../lib/domain";
import { downloadCsv } from "../../lib/csv";
import { requireSupabase } from "../../lib/supabase";
import type { RewardRedemption } from "../../types/domain";

type Row = RewardRedemption & { profiles: { display_name: string } };
export function TeacherRedemptions() {
  const [busy, setBusy] = useState<string | null>(null);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("reward_redemptions")
      .select("*, profiles(display_name)")
      .order("redeemed_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  }, []);
  async function deliver(item: Row) {
    if (
      !window.confirm(
        `Xác nhận đã trao “${item.product_name_snapshot}” cho ${item.profiles.display_name}?`,
      )
    )
      return;
    setBusy(item.id);
    const db = requireSupabase();
    const { error } = await db.rpc("mark_reward_delivered", {
      p_redemption_id: item.id,
      p_idempotency_key: makeIdempotencyKey("deliver"),
    });
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã xác nhận trao quà.");
      void state.reload();
    }
  }
  async function exportRedemptions() {
    if (!state.data) return;
    downloadCsv(
      `lich-su-doi-qua-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Thời gian đổi UTC",
        "Học sinh",
        "Phần quà",
        "Điểm đã dùng",
        "Trạng thái",
        "Thời gian trao UTC",
      ],
      state.data.map((item) => [
        item.redeemed_at,
        item.profiles.display_name,
        item.product_name_snapshot,
        item.price_points_snapshot,
        item.status,
        item.delivered_at,
      ]),
    );
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return (
      <ErrorState message={state.error ?? "Không thể tải lịch sử đổi quà."} />
    );
  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Quản lý đổi quà</p>
          <h1 className="page-title mt-1">Quà đã đổi</h1>
          <p className="mt-2 text-tea-500">
            Hệ thống tự đổi quyền nhận quà; giáo viên xác nhận sau khi trao
            ngoài thực tế.
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => void exportRedemptions()}
        >
          <Download size={18} /> Xuất CSV
        </button>
      </header>
      <div className="mt-7 space-y-4">
        {state.data.length === 0 ? (
          <EmptyState
            title="Chưa có phần quà nào được đổi"
            description="Khi học sinh đủ điểm, giao dịch sẽ xuất hiện tại đây."
          />
        ) : (
          state.data.map((item) => (
            <article
              key={item.id}
              className="card flex flex-col gap-4 p-5 md:flex-row md:items-center"
            >
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-peach-100 text-3xl">
                🎁
              </span>
              <div className="flex-1">
                <h2 className="font-black">{item.product_name_snapshot}</h2>
                <p className="mt-1 text-sm text-tea-500">
                  {item.profiles.display_name} · {item.price_points_snapshot}{" "}
                  điểm · {friendlyDate(item.redeemed_at, true)}
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
                    : "Chờ trao"}
              </StatusPill>
              {item.status === "pending" && (
                <button
                  className="btn-primary"
                  disabled={busy !== null}
                  onClick={() => void deliver(item)}
                >
                  {busy === item.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  Đã trao quà
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
