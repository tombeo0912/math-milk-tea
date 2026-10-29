import {
  Award,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileImage,
  FileText,
  LoaderCircle,
  Medal,
  Send,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  ACCEPTED_SUBMISSION_TYPES,
  friendlyDate,
  makeIdempotencyKey,
  validateReportedScore,
  validateSubmissionFile,
} from "../../lib/domain";
import { processSubmissionImage } from "../../lib/images";
import { requireSupabase } from "../../lib/supabase";
import type {
  AchievementFile,
  AchievementSubmission,
} from "../../types/domain";

const MAX_EVIDENCE_FILES = 5;

interface DraftFile {
  id: string;
  file: File;
  url: string;
}

type AchievementWithFiles = AchievementSubmission & {
  achievement_files?: AchievementFile[];
};

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function StudentAchievements() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<DraftFile[]>([]);
  const [achievementType, setAchievementType] = useState("class_score");
  const [subject, setSubject] = useState("Toán");
  const [assessmentName, setAssessmentName] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [occurredOn, setOccurredOn] = useState(localDateValue);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("achievement_submissions")
      .select("*, achievement_files(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const achievements = (data ?? []) as unknown as AchievementWithFiles[];
    const fileUrls: Record<string, string | null> = {};
    await Promise.all(
      achievements.flatMap((achievement) =>
        (achievement.achievement_files ?? []).map(async (file) => {
          const signed = await db.storage
            .from("achievement-evidence")
            .createSignedUrl(file.storage_path, 900);
          fileUrls[file.id] = signed.data?.signedUrl ?? null;
        }),
      ),
    );
    return { achievements, fileUrls };
  }, []);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(
    () => () => {
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [],
  );

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_EVIDENCE_FILES) {
      toast.error(`Mỗi thành tích được gửi tối đa ${MAX_EVIDENCE_FILES} tệp.`);
      return;
    }

    const accepted: DraftFile[] = [];
    for (const file of incoming) {
      const error = validateSubmissionFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      });
    }
    setFiles((current) => [...current, ...accepted]);
  }

  function removeFile(id: string) {
    setFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  function resetForm() {
    files.forEach((item) => URL.revokeObjectURL(item.url));
    setAchievementType("class_score");
    setSubject("Toán");
    setAssessmentName("");
    setScore("");
    setMaxScore("10");
    setOccurredOn(localDateValue());
    setNote("");
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return toast.error("Phiên đăng nhập đã hết hạn.");
    if (!subject.trim() || !assessmentName.trim())
      return toast.error("Hãy nhập môn học và tên bài kiểm tra/thành tích.");
    if (!occurredOn) return toast.error("Hãy chọn ngày em đạt thành tích.");
    if (files.length === 0)
      return toast.error("Em hãy tải lên ít nhất một ảnh hoặc PDF minh chứng.");

    const numericScore = Number(score);
    const numericMaxScore = Number(maxScore);
    const scoreError = validateReportedScore(numericScore, numericMaxScore);
    if (scoreError) return toast.error(scoreError);

    setBusy(true);
    const db = requireSupabase();
    const uploadId = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      const prepared = await Promise.all(
        files.map((item) =>
          item.file.type === "application/pdf"
            ? item.file
            : processSubmissionImage(item.file, 0),
        ),
      );

      for (let index = 0; index < prepared.length; index++) {
        const file = prepared[index];
        const extension = file.type === "application/pdf" ? "pdf" : "webp";
        const path = `${user.id}/${uploadId}/${String(index + 1).padStart(2, "0")}.${extension}`;
        const result = await db.storage
          .from("achievement-evidence")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (result.error) throw result.error;
        uploaded.push(path);
      }

      const fileRecords = prepared.map((file, index) => ({
        storage_path: uploaded[index],
        page_order: index + 1,
        mime_type: file.type,
        size_bytes: file.size,
      }));
      const { error } = await db.rpc("submit_achievement", {
        p_achievement_type: achievementType,
        p_subject: subject.trim(),
        p_assessment_name: assessmentName.trim(),
        p_score: numericScore,
        p_max_score: numericMaxScore,
        p_occurred_on: occurredOn,
        p_note: note.trim() || null,
        p_files: fileRecords,
        p_idempotency_key: makeIdempotencyKey("achievement"),
      });
      if (error) throw error;

      toast.success("Đã gửi thành tích! Giáo viên sẽ xem và phản hồi sớm nhé.");
      resetForm();
      await state.reload();
    } catch (reason) {
      if (uploaded.length)
        await db.storage.from("achievement-evidence").remove(uploaded);
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Chưa thể gửi thành tích. Các tệp vừa tải đã được hoàn tác.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return (
      <ErrorState
        message={state.error ?? "Không thể tải danh sách thành tích."}
        action={
          <button className="btn-secondary" onClick={() => void state.reload()}>
            Thử lại
          </button>
        }
      />
    );

  const data = state.data;

  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Điểm tốt ở trường 🏅</p>
        <h1 className="page-title mt-1">Ghi lại từng thành tích của em</h1>
        <p className="mt-2 max-w-3xl text-tea-500">
          Khi được điểm tốt trên lớp hoặc trong bài kiểm tra, em gửi ảnh/PDF
          minh chứng tại đây. Giáo viên sẽ xem và quyết định số điểm thưởng phù
          hợp.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <form className="card p-5 md:p-7" onSubmit={submit}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mint-100 text-mint-500">
              <Award />
            </span>
            <div>
              <p className="eyebrow">Gửi minh chứng mới</p>
              <h2 className="text-xl font-black">Em vừa đạt điểm tốt?</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Loại thành tích *</span>
              <select
                className="field"
                value={achievementType}
                onChange={(event) => setAchievementType(event.target.value)}
              >
                <option value="class_score">Điểm tốt trên lớp</option>
                <option value="test_score">Điểm bài kiểm tra</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Môn học *</span>
              <input
                className="field"
                required
                maxLength={80}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ví dụ: Toán"
              />
            </label>
          </div>

          <label className="mt-5 block">
            <span className="label">Tên bài kiểm tra/thành tích *</span>
            <input
              className="field"
              required
              maxLength={160}
              value={assessmentName}
              onChange={(event) => setAssessmentName(event.target.value)}
              placeholder="Ví dụ: Kiểm tra 15 phút chương Hàm số"
            />
          </label>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="label">Điểm đạt được *</span>
              <input
                className="field"
                type="number"
                min="0"
                step="0.01"
                required
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder="9"
              />
            </label>
            <label className="block">
              <span className="label">Thang điểm *</span>
              <input
                className="field"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={maxScore}
                onChange={(event) => setMaxScore(event.target.value)}
              />
            </label>
            <label className="col-span-2 block sm:col-span-1">
              <span className="label">Ngày đạt điểm *</span>
              <input
                className="field"
                type="date"
                required
                max={localDateValue()}
                value={occurredOn}
                onChange={(event) => setOccurredOn(event.target.value)}
              />
            </label>
          </div>

          <label className="mt-5 block">
            <span className="label">Lời nhắn cho giáo viên</span>
            <textarea
              className="field min-h-24 resize-y"
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: Bài này em được cô khen vì trình bày tiến bộ ạ."
            />
          </label>

          <div
            className={`mt-5 rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-mint-500 bg-mint-100" : "border-tea-300 bg-cream-50"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <UploadCloud className="mx-auto text-mint-500" size={34} />
            <p className="mt-2 font-extrabold">Ảnh hoặc PDF minh chứng *</p>
            <p className="mt-1 text-xs text-tea-500">
              Tối đa 5 tệp JPEG, PNG, WebP hoặc PDF; mỗi tệp dưới 15 MB.
            </p>
            <button
              className="btn-secondary mt-4"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <FileImage size={18} /> Chọn tệp
            </button>
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              multiple
              accept={ACCEPTED_SUBMISSION_TYPES.join(",")}
              onChange={(event) =>
                event.target.files && addFiles(event.target.files)
              }
            />
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-tea-100 bg-white p-3"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-peach-100 text-peach-500">
                    {item.file.type === "application/pdf" ? (
                      <FileText size={19} />
                    ) : (
                      <FileImage size={19} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-tea-500">
                      {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    className="btn-danger min-h-9 p-2"
                    type="button"
                    aria-label={`Xóa ${item.file.name}`}
                    onClick={() => removeFile(item.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn-primary mt-6 w-full"
            disabled={busy || files.length === 0}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            Gửi giáo viên xét thưởng
          </button>
        </form>

        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Lịch sử của em</p>
              <h2 className="mt-1 text-xl font-black">Các thành tích đã gửi</h2>
            </div>
            <StatusPill tone="info">
              {data.achievements.length} lần gửi
            </StatusPill>
          </div>

          <div className="mt-4 space-y-4">
            {data.achievements.length === 0 ? (
              <EmptyState
                title="Chưa có thành tích nào được gửi"
                description="Khi có điểm tốt, em hãy gửi minh chứng để giáo viên cùng ghi nhận nhé."
              />
            ) : (
              data.achievements.map((achievement) => (
                <article key={achievement.id} className="card p-5 md:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="info">
                          {achievement.achievement_type === "test_score"
                            ? "Bài kiểm tra"
                            : "Điểm trên lớp"}
                        </StatusPill>
                        {achievement.status === "approved" ? (
                          <StatusPill tone="success">
                            <CheckCircle2 className="mr-1" size={13} /> Đã
                            thưởng +{achievement.awarded_points} điểm
                          </StatusPill>
                        ) : achievement.status === "rejected" ? (
                          <StatusPill tone="neutral">
                            <XCircle className="mr-1" size={13} /> Chưa được
                            duyệt
                          </StatusPill>
                        ) : (
                          <StatusPill tone="warning">
                            <CalendarDays className="mr-1" size={13} /> Chờ giáo
                            viên
                          </StatusPill>
                        )}
                      </div>
                      <h3 className="mt-3 text-lg font-black">
                        {achievement.assessment_name}
                      </h3>
                      <p className="mt-1 text-sm text-tea-500">
                        {achievement.subject} · Ngày{" "}
                        {friendlyDate(achievement.occurred_on)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-mint-100 px-5 py-3 text-center">
                      <p className="text-xs font-bold text-mint-500">ĐIỂM</p>
                      <p className="text-2xl font-black">
                        {achievement.score}/{achievement.max_score}
                      </p>
                    </div>
                  </div>

                  {achievement.note && (
                    <p className="mt-4 rounded-2xl bg-cream-100 p-4 text-sm text-tea-700">
                      {achievement.note}
                    </p>
                  )}

                  {(achievement.achievement_files?.length ?? 0) > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {achievement.achievement_files?.map((file, index) => {
                        const url = data.fileUrls[file.id];
                        return url ? (
                          <a
                            key={file.id}
                            className="btn-secondary text-sm"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {file.mime_type === "application/pdf" ? (
                              <FileText size={16} />
                            ) : (
                              <FileImage size={16} />
                            )}
                            Minh chứng {index + 1}
                            <ExternalLink size={14} />
                          </a>
                        ) : null;
                      })}
                    </div>
                  )}

                  {achievement.teacher_comment && (
                    <div className="mt-4 rounded-2xl bg-peach-100 p-4 text-sm">
                      <div className="flex gap-3">
                        <Medal className="shrink-0 text-peach-500" size={20} />
                        <div>
                          <strong>Phản hồi của giáo viên</strong>
                          <p className="mt-1 text-tea-700">
                            {achievement.teacher_comment}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="mt-4 text-xs font-bold text-tea-300">
                    Đã gửi {friendlyDate(achievement.created_at, true)}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
