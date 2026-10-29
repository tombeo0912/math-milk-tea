import {
  CheckCircle2,
  ExternalLink,
  Gift,
  LoaderCircle,
  MessageCircleHeart,
  XCircle,
} from "lucide-react";
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
import { requireSupabase } from "../../lib/supabase";
import type { RewardWish } from "../../types/domain";

export function TeacherRewardWishes({
  refreshToken,
  onCreate,
}: {
  refreshToken: number;
  onCreate: (wish: RewardWish) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("reward_wishes")
      .select("*, profiles(display_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as RewardWish[];
  }, [refreshToken]);

  async function reject(wish: RewardWish) {
    const reason = window.prompt(
      `Lý do chưa thể tạo “${wish.name}” để học sinh nhận được phản hồi:`,
    );
    if (!reason?.trim()) return;
    setBusy(wish.id);
    const db = requireSupabase();
    const { error } = await db.rpc("reject_reward_wish", {
      p_wish_id: wish.id,
      p_teacher_comment: reason.trim(),
      p_idempotency_key: makeIdempotencyKey("reject-wish"),
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Đã gửi phản hồi cho học sinh.");
    void state.reload();
  }

  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return (
      <ErrorState
        message={state.error ?? "Không thể tải mong muốn phần thưởng."}
      />
    );
  const pending = state.data.filter((item) => item.status === "pending");
  const reviewed = state.data.filter((item) => item.status !== "pending");

  return (
    <section className="card mt-7 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-tea-100 bg-gradient-to-r from-mint-100 to-peach-100 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-mint-500 shadow-sm">
            <MessageCircleHeart />
          </span>
          <div>
            <p className="eyebrow">Hộp mong muốn</p>
            <h2 className="mt-1 text-xl font-black">Ý tưởng quà từ học sinh</h2>
          </div>
        </div>
        <StatusPill tone={pending.length > 0 ? "warning" : "success"}>
          {pending.length} yêu cầu chờ xử lý
        </StatusPill>
      </div>
      {pending.length === 0 ? (
        <EmptyState
          title="Không có mong muốn đang chờ"
          description="Khi học sinh gửi ý tưởng quà mới, yêu cầu sẽ xuất hiện tại đây."
        />
      ) : (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {pending.map((wish) => (
            <article
              key={wish.id}
              className="rounded-2xl border border-tea-100 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-tea-500">
                    {wish.profiles?.display_name ?? "Học sinh"} ·{" "}
                    {friendlyDate(wish.created_at, true)}
                  </p>
                  <h3 className="mt-1 text-lg font-black">{wish.name}</h3>
                </div>
                <span className="text-3xl">💭</span>
              </div>
              {wish.description && (
                <p className="mt-3 text-sm leading-relaxed text-tea-500">
                  {wish.description}
                </p>
              )}
              {wish.reference_url && (
                <a
                  className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-mint-500 hover:underline"
                  href={wish.reference_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={15} /> Xem đường dẫn tham khảo
                </a>
              )}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  className="btn-primary"
                  disabled={busy !== null}
                  onClick={() => onCreate(wish)}
                >
                  <Gift size={17} /> Tạo phần thưởng
                </button>
                <button
                  className="btn-secondary"
                  disabled={busy !== null}
                  onClick={() => void reject(wish)}
                >
                  {busy === wish.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <XCircle size={17} />
                  )}
                  Chưa thể tạo
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {reviewed.length > 0 && (
        <details className="border-t border-tea-100 p-5">
          <summary className="cursor-pointer font-extrabold">
            Xem {reviewed.length} yêu cầu đã xử lý
          </summary>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {reviewed.slice(0, 10).map((wish) => (
              <article
                key={wish.id}
                className="flex items-start gap-3 rounded-2xl bg-cream-100 p-4"
              >
                {wish.status === "created" ? (
                  <CheckCircle2 className="mt-0.5 text-emerald-700" />
                ) : (
                  <XCircle className="mt-0.5 text-tea-500" />
                )}
                <div>
                  <h3 className="font-extrabold">{wish.name}</h3>
                  <p className="mt-1 text-xs text-tea-500">
                    {wish.status === "created"
                      ? "Đã tạo thành phần thưởng"
                      : "Chưa thể đáp ứng"}
                  </p>
                  {wish.teacher_comment && (
                    <p className="mt-2 text-sm">{wish.teacher_comment}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
