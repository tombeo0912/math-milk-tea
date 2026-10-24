import {
  CheckCircle2,
  Eye,
  LoaderCircle,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  calculateSuggestedPoints,
  friendlyDate,
  makeIdempotencyKey,
} from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type {
  DifficultySetting,
  Submission,
  SubmissionFile,
} from "../../types/domain";

type Review = Submission & {
  assignment: { title: string };
  profiles: { display_name: string };
  submission_files: SubmissionFile[];
  grading_records: Array<{
    math_score: number;
    difficulty_code: string;
    approved_points: number;
    comment: string | null;
    adjustment_reason: string | null;
    status: string;
  }>;
};
export function TeacherGrading() {
  const [selected, setSelected] = useState<Review | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [score, setScore] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [approved, setApproved] = useState("0");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [s, d] = await Promise.all([
      db
        .from("submissions")
        .select(
          "*, assignment:assignments(title), profiles(display_name), submission_files(*), grading_records(*)",
        )
        .order("submitted_at", { ascending: true }),
      db
        .from("difficulty_settings")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
    ]);
    if (s.error) throw s.error;
    if (d.error) throw d.error;
    return {
      submissions: (s.data ?? []) as unknown as Review[],
      difficulties: (d.data ?? []) as DifficultySetting[],
    };
  }, []);
  useEffect(() => {
    if (!selected) {
      setUrls([]);
      return;
    }
    const db = requireSupabase();
    void Promise.all(
      selected.submission_files
        .sort((a, b) => a.page_order - b.page_order)
        .map((file) =>
          db.storage
            .from("submission-images")
            .createSignedUrl(file.storage_path, 900)
            .then((result) => result.data?.signedUrl ?? ""),
        ),
    ).then(setUrls);
    const draft = selected.grading_records.find(
      (value) => value.status === "draft",
    );
    setScore(draft ? String(draft.math_score) : "");
    setDifficulty(draft?.difficulty_code ?? "");
    setApproved(draft ? String(draft.approved_points) : "0");
    setComment(draft?.comment ?? "");
    setReason(draft?.adjustment_reason ?? "");
    setZoom(1);
  }, [selected]);
  const setting = state.data?.difficulties.find(
    (item) => item.code === difficulty,
  );
  const suggested = useMemo(() => {
    const value = Number(score);
    return setting && Number.isFinite(value) && value >= 0 && value <= 10
      ? calculateSuggestedPoints(value, Number(setting.multiplier))
      : 0;
  }, [score, setting]);
  useEffect(() => {
    setApproved(String(suggested));
  }, [suggested]);
  async function save(approveNow: boolean) {
    if (!selected || !setting)
      return toast.error("Hãy nhập điểm và chọn độ khó.");
    const mathScore = Number(score);
    const finalPoints = Number(approved);
    if (!Number.isFinite(mathScore) || mathScore < 0 || mathScore > 10)
      return toast.error("Điểm bài làm phải từ 0 đến 10.");
    if (!Number.isInteger(finalPoints) || finalPoints < 0)
      return toast.error("Điểm thưởng phải là số nguyên không âm.");
    if (finalPoints !== suggested && !reason.trim())
      return toast.error("Hãy nhập lý do khi điều chỉnh điểm thưởng.");
    if (
      approveNow &&
      !window.confirm(
        `Xác nhận duyệt ${finalPoints} điểm thưởng? Thao tác này sẽ ghi vào sổ điểm.`,
      )
    )
      return;
    setBusy(true);
    const db = requireSupabase();
    const params = {
      p_submission_id: selected.id,
      p_math_score: mathScore,
      p_difficulty_code: difficulty,
      p_approved_points: finalPoints,
      p_comment: comment.trim() || null,
      p_adjustment_reason: reason.trim() || null,
      ...(approveNow
        ? { p_idempotency_key: makeIdempotencyKey("approve") }
        : {}),
    };
    const { error } = await db.rpc(
      approveNow ? "approve_submission" : "save_grading_draft",
      params,
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(
      approveNow
        ? `Đã duyệt và cộng ${finalPoints} điểm!`
        : "Đã lưu bản chấm nháp.",
    );
    setSelected(null);
    void state.reload();
  }
  async function allowResubmission(item: Review) {
    if (
      !window.confirm(
        `Cho phép ${item.profiles.display_name} nộp lại bài “${item.assignment.title}”?`,
      )
    )
      return;
    const db = requireSupabase();
    const { error } = await db.rpc("allow_resubmission", {
      p_submission_id: item.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Đã cho phép nộp lại một phiên bản mới.");
      void state.reload();
    }
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải bài nộp."} />;
  const pending = state.data.submissions.filter(
    (item) => !item.grading_records.some((g) => g.status === "approved"),
  );
  const approvedRows = state.data.submissions.filter((item) =>
    item.grading_records.some((g) => g.status === "approved"),
  );
  return (
    <div>
      <header>
        <p className="eyebrow">Chấm bài</p>
        <h1 className="page-title mt-1">Bài nộp đang chờ</h1>
        <p className="mt-2 text-tea-500">
          Lưu nháp không cộng điểm; chỉ nút duyệt mới ghi giao dịch thưởng.
        </p>
      </header>
      <div className="mt-7 grid gap-4">
        {pending.length === 0 ? (
          <EmptyState
            title="Không còn bài chờ chấm"
            description="Tất cả bài nộp hiện tại đã được xử lý."
          />
        ) : (
          pending.map((item) => (
            <article
              key={item.id}
              className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-2xl">
                📐
              </span>
              <div className="flex-1">
                <h2 className="font-black">{item.assignment.title}</h2>
                <p className="mt-1 text-sm text-tea-500">
                  {item.profiles.display_name} · phiên bản {item.version} ·{" "}
                  {friendlyDate(item.submitted_at, true)}
                </p>
              </div>
              <StatusPill tone="warning">Chờ chấm</StatusPill>
              <button className="btn-primary" onClick={() => setSelected(item)}>
                <Eye size={18} />
                Mở bài
              </button>
            </article>
          ))
        )}
      </div>
      {approvedRows.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-black">Bài đã duyệt gần đây</h2>
          <p className="mt-1 text-sm text-tea-500">
            Chỉ bật nộp lại khi thực sự cần; phiên bản cũ luôn được giữ lại.
          </p>
          <div className="mt-4 grid gap-3">
            {approvedRows.slice(0, 10).map((item) => (
              <article
                key={item.id}
                className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <h3 className="font-extrabold">{item.assignment.title}</h3>
                  <p className="text-xs text-tea-500">
                    {item.profiles.display_name} · phiên bản {item.version}
                  </p>
                </div>
                <StatusPill
                  tone={item.resubmission_allowed ? "info" : "success"}
                >
                  {item.resubmission_allowed ? "Đã cho nộp lại" : "Đã duyệt"}
                </StatusPill>
                <button
                  className="btn-secondary"
                  disabled={item.resubmission_allowed}
                  onClick={() => void allowResubmission(item)}
                >
                  Cho nộp lại
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-tea-900/75 p-3 md:p-6">
          <div className="mx-auto grid min-h-full max-w-[1500px] gap-4 xl:grid-cols-[1.3fr_.7fr]">
            <section className="rounded-3xl bg-black/30 p-3">
              <div className="mb-3 flex items-center justify-between text-white">
                <strong>
                  {selected.assignment.title} ·{" "}
                  {selected.submission_files.length} trang
                </strong>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl bg-white/10 p-2"
                    onClick={() => setZoom((v) => Math.max(0.6, v - 0.2))}
                  >
                    <ZoomOut />
                  </button>
                  <button
                    className="rounded-xl bg-white/10 p-2"
                    onClick={() => setZoom((v) => Math.min(2.2, v + 0.2))}
                  >
                    <ZoomIn />
                  </button>
                </div>
              </div>
              <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-auto rounded-2xl bg-white/10 p-3">
                {urls.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt={`Trang bài làm ${index + 1}`}
                    className="mx-auto origin-top rounded-xl bg-white shadow-xl transition-transform"
                    style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
                  />
                ))}
              </div>
            </section>
            <section className="card h-fit bg-cream-50 p-5 md:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Phiếu chấm</p>
                  <h2 className="mt-1 text-xl font-black">
                    {selected.profiles.display_name}
                  </h2>
                </div>
                <button className="btn-ghost" onClick={() => setSelected(null)}>
                  Đóng
                </button>
              </div>
              <div className="mt-6 grid gap-5">
                <label>
                  <span className="label">Điểm bài làm (0–10)</span>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                  />
                </label>
                <label>
                  <span className="label">Độ khó</span>
                  <select
                    className="field"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="">Chọn độ khó…</option>
                    {state.data.difficulties.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label} × {item.multiplier}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-2xl bg-mint-100 p-4">
                  <p className="text-xs font-extrabold text-mint-500">
                    ĐIỂM ĐỀ XUẤT
                  </p>
                  <p className="mt-1 text-3xl font-black">{suggested}</p>
                </div>
                <label>
                  <span className="label">Điểm thưởng cuối cùng</span>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="1"
                    value={approved}
                    onChange={(e) => setApproved(e.target.value)}
                  />
                  <p className="helper">
                    Chênh lệch: {Number(approved) - suggested >= 0 ? "+" : ""}
                    {Number(approved) - suggested}
                  </p>
                </label>
                {Number(approved) !== suggested && (
                  <label>
                    <span className="label">Lý do điều chỉnh *</span>
                    <input
                      className="field"
                      value={reason}
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ví dụ: ghi nhận nỗ lực trình bày"
                    />
                  </label>
                )}
                <label>
                  <span className="label">Nhận xét cho học sinh</span>
                  <textarea
                    className="field min-h-28"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={2000}
                    placeholder="Lời nhận xét nhẹ nhàng, cụ thể…"
                  />
                </label>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void save(false)}
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Save size={18} />
                  )}
                  Lưu nháp
                </button>
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  Duyệt và cộng điểm
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
