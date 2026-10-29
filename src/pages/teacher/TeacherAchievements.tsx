import {
  Award,
  CheckCircle2,
  Eye,
  ExternalLink,
  FileText,
  LoaderCircle,
  Trophy,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import type {
  AchievementFile,
  AchievementSubmission,
  Profile,
} from "../../types/domain";

type AchievementReview = AchievementSubmission & {
  profiles: Pick<Profile, "display_name">;
  achievement_files: AchievementFile[];
};

type SignedAchievementFile = AchievementFile & { signedUrl: string };

function achievementTypeLabel(type: AchievementSubmission["achievement_type"]) {
  return type === "test_score" ? "Điểm bài kiểm tra" : "Điểm tốt trên lớp";
}

function statusLabel(status: AchievementSubmission["status"]) {
  if (status === "approved") return "Đã tặng điểm";
  if (status === "rejected") return "Không duyệt";
  return "Chờ xem xét";
}

function statusTone(status: AchievementSubmission["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "neutral" as const;
  return "warning" as const;
}

export function TeacherAchievements() {
  const [selected, setSelected] = useState<AchievementReview | null>(null);
  const [signedFiles, setSignedFiles] = useState<SignedAchievementFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [points, setPoints] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("achievement_submissions")
      .select("*, profiles(display_name), achievement_files(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as AchievementReview[];
  }, []);

  useEffect(() => {
    if (!selected) return;

    let active = true;
    const db = requireSupabase();

    void Promise.all(
      [...selected.achievement_files]
        .sort((a, b) => a.page_order - b.page_order)
        .map(async (file) => {
          const result = await db.storage
            .from("achievement-evidence")
            .createSignedUrl(file.storage_path, 900);
          if (result.error) throw result.error;
          return { ...file, signedUrl: result.data.signedUrl };
        }),
    )
      .then((files) => {
        if (active) setSignedFiles(files);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSignedFiles([]);
        setFileError(
          reason instanceof Error
            ? reason.message
            : "Không thể mở tệp minh chứng.",
        );
      })
      .finally(() => {
        if (active) setFilesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selected]);

  function openReview(item: AchievementReview) {
    if (busy) return;
    setPoints(item.awarded_points ? String(item.awarded_points) : "");
    setComment(item.teacher_comment ?? "");
    setSignedFiles([]);
    setFileError(null);
    setFilesLoading(true);
    setSelected(item);
  }

  function closeReview() {
    if (busy) return;
    setSelected(null);
    setSignedFiles([]);
    setFileError(null);
    setFilesLoading(false);
  }

  async function review(decision: "approved" | "rejected") {
    if (!selected || selected.status !== "pending" || busy) return;

    const awardedPoints = Number(points);
    if (
      decision === "approved" &&
      (!Number.isInteger(awardedPoints) ||
        awardedPoints < 1 ||
        awardedPoints > 10000)
    ) {
      return toast.error("Điểm thưởng phải là số nguyên từ 1 đến 10.000.");
    }
    if (decision === "rejected" && !comment.trim()) {
      return toast.error(
        "Hãy nhập lý do để học sinh hiểu vì sao minh chứng chưa được duyệt.",
      );
    }

    const actionText =
      decision === "approved"
        ? `tặng ${awardedPoints} điểm cho ${selected.profiles.display_name}`
        : `không duyệt minh chứng của ${selected.profiles.display_name}`;
    if (!window.confirm(`Xác nhận ${actionText}?`)) return;

    setBusy(true);
    try {
      const db = requireSupabase();
      const { error } = await db.rpc("review_achievement", {
        p_achievement_id: selected.id,
        p_decision: decision,
        p_awarded_points: decision === "approved" ? awardedPoints : null,
        p_teacher_comment: comment.trim() || null,
        p_idempotency_key: makeIdempotencyKey("achievement-review"),
      });
      if (error) throw error;

      toast.success(
        decision === "approved"
          ? `Đã ghi nhận và tặng ${awardedPoints} điểm!`
          : "Đã phản hồi minh chứng cho học sinh.",
      );
      setSelected(null);
      await state.reload();
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Chưa thể xử lý minh chứng lúc này.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <LoadingState />;
  if (state.error || !state.data) {
    return (
      <ErrorState
        message={state.error ?? "Không thể tải danh sách minh chứng."}
      />
    );
  }

  const pending = state.data.filter((item) => item.status === "pending");
  const reviewed = state.data.filter((item) => item.status !== "pending");

  return (
    <div>
      <header>
        <p className="eyebrow">Ghi nhận nỗ lực</p>
        <h1 className="page-title mt-1">Điểm tốt trên lớp</h1>
        <p className="mt-2 max-w-3xl text-tea-500">
          Xem ảnh hoặc PDF học sinh gửi, phản hồi rõ ràng và chỉ cộng điểm khi
          minh chứng đã được xác nhận.
        </p>
      </header>

      <section className="mt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black">Đang chờ xem xét</h2>
          <StatusPill tone={pending.length > 0 ? "warning" : "success"}>
            {pending.length} minh chứng
          </StatusPill>
        </div>
        <div className="grid gap-4">
          {pending.length === 0 ? (
            <EmptyState
              title="Không còn minh chứng chờ duyệt"
              description="Khi học sinh gửi điểm tốt mới, nội dung sẽ xuất hiện tại đây."
            />
          ) : (
            pending.map((item) => (
              <article
                key={item.id}
                className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                  <Trophy size={26} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black">{item.assessment_name}</h3>
                    <StatusPill tone="info">
                      {achievementTypeLabel(item.achievement_type)}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-tea-500">
                    {item.profiles.display_name} · {item.subject} · {item.score}
                    /{item.max_score} điểm
                  </p>
                  <p className="mt-1 text-xs text-tea-400">
                    Ngày đạt điểm: {friendlyDate(item.occurred_on)} · Gửi lúc{" "}
                    {friendlyDate(item.created_at, true)}
                  </p>
                </div>
                <button
                  className="btn-primary shrink-0"
                  disabled={busy}
                  onClick={() => openReview(item)}
                >
                  <Eye size={18} /> Xem và duyệt
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      {reviewed.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-black">Lịch sử đã xử lý</h2>
          <p className="mt-1 text-sm text-tea-500">
            Lưu lại kết quả xét duyệt và lời nhắn đã gửi cho học sinh.
          </p>
          <div className="mt-4 grid gap-3">
            {reviewed.map((item) => (
              <article
                key={item.id}
                className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold">{item.assessment_name}</h3>
                  <p className="mt-1 text-sm text-tea-500">
                    {item.profiles.display_name} · {item.subject} · {item.score}
                    /{item.max_score}
                  </p>
                  <p className="mt-1 text-xs text-tea-400">
                    Xử lý {friendlyDate(item.reviewed_at, true)}
                    {item.teacher_comment ? ` · ${item.teacher_comment}` : ""}
                  </p>
                </div>
                <StatusPill tone={statusTone(item.status)}>
                  {statusLabel(item.status)}
                  {item.status === "approved" && item.awarded_points
                    ? ` · +${item.awarded_points} điểm`
                    : ""}
                </StatusPill>
                <button
                  className="btn-secondary shrink-0"
                  disabled={busy}
                  onClick={() => openReview(item)}
                >
                  <Eye size={17} /> Xem lại
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-tea-900/75 p-3 md:p-6">
          <div className="mx-auto grid min-h-full max-w-[1500px] gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <section className="rounded-3xl bg-black/30 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
                <strong>
                  {selected.assessment_name} ·{" "}
                  {selected.achievement_files.length} tệp
                </strong>
                <span className="text-sm text-white/75">
                  Liên kết xem có hiệu lực trong 15 phút
                </span>
              </div>
              <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-auto rounded-2xl bg-white/10 p-3">
                {filesLoading ? (
                  <div className="flex min-h-52 items-center justify-center gap-2 text-white">
                    <LoaderCircle className="animate-spin" /> Đang mở minh
                    chứng…
                  </div>
                ) : fileError ? (
                  <div className="rounded-2xl bg-white p-6 text-center font-semibold text-red-600">
                    {fileError}
                  </div>
                ) : signedFiles.length === 0 ? (
                  <div className="rounded-2xl bg-white p-6 text-center text-tea-500">
                    Minh chứng này không có tệp đính kèm.
                  </div>
                ) : (
                  signedFiles.map((file, index) =>
                    file.mime_type === "application/pdf" ? (
                      <div
                        key={file.storage_path}
                        className="overflow-hidden rounded-xl bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-tea-900">
                          <span className="flex items-center gap-2 font-bold">
                            <FileText className="text-peach-500" /> PDF{" "}
                            {index + 1}
                          </span>
                          <a
                            className="btn-secondary"
                            href={file.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={17} /> Mở PDF
                          </a>
                        </div>
                        <iframe
                          className="h-[70vh] w-full border-t border-tea-100"
                          src={file.signedUrl}
                          title={`Minh chứng PDF ${index + 1}`}
                        />
                      </div>
                    ) : (
                      <img
                        key={file.storage_path}
                        src={file.signedUrl}
                        alt={`Minh chứng ${index + 1}`}
                        className="mx-auto max-h-[80vh] rounded-xl bg-white object-contain shadow-xl"
                      />
                    ),
                  )
                )}
              </div>
            </section>

            <section className="card h-fit bg-cream-50 p-5 md:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Phiếu ghi nhận</p>
                  <h2 className="mt-1 text-xl font-black">
                    {selected.profiles.display_name}
                  </h2>
                </div>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={closeReview}
                >
                  Đóng
                </button>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-3">
                  <dt className="text-xs font-bold text-tea-500">Môn học</dt>
                  <dd className="mt-1 font-black">{selected.subject}</dd>
                </div>
                <div className="rounded-2xl bg-mint-100 p-3">
                  <dt className="text-xs font-bold text-mint-600">Điểm số</dt>
                  <dd className="mt-1 text-xl font-black">
                    {selected.score}/{selected.max_score}
                  </dd>
                </div>
                <div className="col-span-2 rounded-2xl bg-white p-3">
                  <dt className="text-xs font-bold text-tea-500">Nội dung</dt>
                  <dd className="mt-1 font-bold">{selected.assessment_name}</dd>
                  <p className="mt-1 text-sm text-tea-500">
                    {achievementTypeLabel(selected.achievement_type)} ·{" "}
                    {friendlyDate(selected.occurred_on)}
                  </p>
                </div>
              </dl>

              {selected.note && (
                <div className="mt-4 rounded-2xl bg-cream-100 p-4">
                  <p className="text-xs font-extrabold text-tea-500">
                    LỜI NHẮN CỦA HỌC SINH
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {selected.note}
                  </p>
                </div>
              )}

              {selected.status === "pending" ? (
                <div className="mt-6 grid gap-5">
                  <label>
                    <span className="label">Điểm thưởng muốn tặng *</span>
                    <input
                      className="field"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="10000"
                      step="1"
                      value={points}
                      onChange={(event) => setPoints(event.target.value)}
                      placeholder="Ví dụ: 20"
                    />
                    <span className="helper">Từ 1 đến 10.000 điểm.</span>
                  </label>
                  <label>
                    <span className="label">Nhận xét cho học sinh</span>
                    <textarea
                      className="field min-h-28"
                      maxLength={1000}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Khen ngợi nỗ lực hoặc giải thích nếu chưa duyệt…"
                    />
                    <span className="helper">
                      Bắt buộc nhập khi không duyệt minh chứng.
                    </span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
                      disabled={busy}
                      onClick={() => void review("rejected")}
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <XCircle size={18} />
                      )}
                      Không duyệt
                    </button>
                    <button
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => void review("approved")}
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Award size={18} />
                      )}
                      Duyệt và tặng điểm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl bg-white p-5">
                  <div className="flex items-center gap-3">
                    {selected.status === "approved" ? (
                      <CheckCircle2 className="text-emerald-600" />
                    ) : (
                      <XCircle className="text-red-600" />
                    )}
                    <StatusPill tone={statusTone(selected.status)}>
                      {statusLabel(selected.status)}
                    </StatusPill>
                  </div>
                  {selected.status === "approved" && (
                    <p className="mt-3 text-2xl font-black">
                      +{selected.awarded_points ?? 0} điểm thưởng
                    </p>
                  )}
                  {selected.teacher_comment && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-tea-600">
                      {selected.teacher_comment}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-tea-400">
                    Xử lý {friendlyDate(selected.reviewed_at, true)}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
