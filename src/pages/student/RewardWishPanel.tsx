import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MessageCircleHeart,
  Send,
  XCircle,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate, makeIdempotencyKey } from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type { RewardWish } from "../../types/domain";

export function RewardWishPanel() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("reward_wishes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as RewardWish[];
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state.data?.some((item) => item.status === "pending"))
      return toast.error("Em đang có một mong muốn chờ giáo viên xem rồi nhé.");
    if (!name.trim()) return toast.error("Em hãy nhập món quà mình mong muốn.");
    setBusy(true);
    const db = requireSupabase();
    const { error } = await db.rpc("submit_reward_wish", {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_reference_url: referenceUrl.trim() || null,
      p_idempotency_key: makeIdempotencyKey("reward-wish"),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Đã gửi mong muốn cho giáo viên! 💭");
    setName("");
    setDescription("");
    setReferenceUrl("");
    void state.reload();
  }

  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return (
      <ErrorState
        message={state.error ?? "Không thể tải mong muốn phần thưởng."}
      />
    );
  const pending = state.data.some((item) => item.status === "pending");

  return (
    <section className="mt-7 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <form className="card overflow-hidden" onSubmit={submit}>
        <div className="bg-gradient-to-br from-mint-100 to-peach-100 p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-mint-500 shadow-sm">
            <MessageCircleHeart />
          </span>
          <h2 className="mt-4 text-xl font-black">Món quà em mong muốn</h2>
          <p className="mt-1 text-sm text-tea-500">
            Chưa thấy món em thích? Hãy gửi ý tưởng để giáo viên cân nhắc thêm
            vào cửa hàng.
          </p>
        </div>
        <div className="space-y-4 p-6">
          <label className="block">
            <span className="label">Tên món quà *</span>
            <input
              className="field"
              value={name}
              maxLength={160}
              required
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ví dụ: một quyển truyện em thích"
            />
          </label>
          <label className="block">
            <span className="label">Mô tả hoặc lý do em thích</span>
            <textarea
              className="field min-h-24"
              value={description}
              maxLength={1000}
              disabled={pending}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Màu sắc, phiên bản hoặc điều em muốn nói thêm…"
            />
          </label>
          <label className="block">
            <span className="label">Đường dẫn tham khảo</span>
            <input
              className="field"
              type="url"
              value={referenceUrl}
              maxLength={1000}
              disabled={pending}
              onChange={(event) => setReferenceUrl(event.target.value)}
              placeholder="https://… (không bắt buộc)"
            />
          </label>
          {pending && (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              Em đã có một mong muốn đang chờ. Khi giáo viên xử lý xong, em có
              thể gửi ý tưởng mới.
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy || pending}>
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            Gửi mong muốn
          </button>
        </div>
      </form>

      <div className="card p-6">
        <div>
          <p className="eyebrow">Phản hồi từ giáo viên</p>
          <h2 className="mt-1 text-xl font-black">Các mong muốn đã gửi</h2>
        </div>
        {state.data.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-tea-300 p-7 text-center text-sm text-tea-500">
            Em chưa gửi mong muốn nào. Ý tưởng đầu tiên có thể bắt đầu ngay hôm
            nay!
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {state.data.map((wish) => (
              <article
                key={wish.id}
                className="rounded-2xl border border-tea-100 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold">{wish.name}</h3>
                    <p className="mt-1 text-xs text-tea-500">
                      Gửi {friendlyDate(wish.created_at, true)}
                    </p>
                  </div>
                  {wish.status === "pending" ? (
                    <StatusPill tone="warning">
                      <Clock3 size={13} className="mr-1" />
                      Chờ xem
                    </StatusPill>
                  ) : wish.status === "created" ? (
                    <StatusPill tone="success">
                      <CheckCircle2 size={13} className="mr-1" />
                      Đã tạo quà
                    </StatusPill>
                  ) : (
                    <StatusPill tone="neutral">
                      <XCircle size={13} className="mr-1" />
                      Chưa thể tạo
                    </StatusPill>
                  )}
                </div>
                {wish.description && (
                  <p className="mt-3 text-sm text-tea-500">
                    {wish.description}
                  </p>
                )}
                {wish.reference_url && (
                  <a
                    className="mt-2 inline-block text-sm font-bold text-mint-500 hover:underline"
                    href={wish.reference_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Xem đường dẫn tham khảo
                  </a>
                )}
                {wish.teacher_comment && (
                  <p className="mt-3 rounded-xl bg-cream-100 p-3 text-sm">
                    <strong>Giáo viên:</strong> {wish.teacher_comment}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
