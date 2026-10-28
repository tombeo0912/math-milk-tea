import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  FileImage,
  FileText,
  LoaderCircle,
  RotateCw,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  ACCEPTED_SUBMISSION_TYPES,
  friendlyDate,
  makeIdempotencyKey,
  MAX_SUBMISSION_FILES,
  validateSubmissionFile,
} from "../../lib/domain";
import { processSubmissionImage } from "../../lib/images";
import { requireSupabase } from "../../lib/supabase";
import type { Assignment, Submission } from "../../types/domain";

interface DraftFile {
  file: File;
  url: string;
  rotation: number;
  id: string;
}
export function AssignmentSubmissionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<DraftFile[]>([]);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const state = useAsyncData(async () => {
    if (!id) throw new Error("Bài tập không hợp lệ.");
    const db = requireSupabase();
    const [a, s] = await Promise.all([
      db.from("assignments").select("*").eq("id", id).single(),
      db
        .from("submissions")
        .select("*")
        .eq("assignment_id", id)
        .order("version", { ascending: false }),
    ]);
    if (a.error) throw a.error;
    if (s.error) throw s.error;
    const assignment = a.data as Assignment;
    let attachmentUrl: string | null = null;
    if (assignment.image_path) {
      const signed = await db.storage
        .from("assignment-images")
        .createSignedUrl(assignment.image_path, 900);
      if (signed.error) throw signed.error;
      attachmentUrl = signed.data.signedUrl;
    }
    return {
      assignment,
      attachmentUrl,
      submissions: (s.data ?? []) as Submission[],
    };
  }, [id]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(
    () => () =>
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );
  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_SUBMISSION_FILES) {
      toast.error(`Mỗi bài tối đa ${MAX_SUBMISSION_FILES} tệp.`);
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
        file,
        url: URL.createObjectURL(file),
        rotation: 0,
        id: crypto.randomUUID(),
      });
    }
    setFiles((current) => [...current, ...accepted]);
  }
  function move(index: number, direction: -1 | 1) {
    setFiles((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function remove(index: number) {
    setFiles((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  }
  async function submit() {
    if (!id || files.length === 0)
      return toast.error("Em hãy chọn ít nhất một tệp bài làm.");
    setBusy(true);
    const db = requireSupabase();
    const draftId = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      const prepared = await Promise.all(
        files.map((item) =>
          item.file.type === "application/pdf"
            ? item.file
            : processSubmissionImage(item.file, item.rotation),
        ),
      );
      const userId = (await db.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Phiên đăng nhập đã hết hạn.");
      for (let index = 0; index < prepared.length; index++) {
        const file = prepared[index];
        const extension = file.type === "application/pdf" ? "pdf" : "webp";
        const path = `${userId}/${id}/${draftId}/${String(index + 1).padStart(2, "0")}.${extension}`;
        const { error } = await db.storage
          .from("submission-images")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        uploaded.push(path);
      }
      const fileRecords = prepared.map((file, index) => ({
        storage_path: uploaded[index],
        page_order: index + 1,
        mime_type: file.type,
        size_bytes: file.size,
      }));
      const { error } = await db.rpc("finalize_submission", {
        p_assignment_id: id,
        p_note: note.trim() || null,
        p_files: fileRecords,
        p_idempotency_key: makeIdempotencyKey("submit"),
      });
      if (error) throw error;
      toast.success("Nộp bài thành công! Giáo viên sẽ xem bài của em sớm nhé.");
      navigate("/hoc-sinh/bai-tap");
    } catch (reason) {
      if (uploaded.length)
        await db.storage.from("submission-images").remove(uploaded);
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Chưa thể nộp bài. Tệp đã tải lên được hoàn tác.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể mở bài tập."} />;
  const { assignment, submissions, attachmentUrl } = state.data;
  const attachmentIsPdf = assignment.image_path?.toLowerCase().endsWith(".pdf");
  const latest = submissions[0];
  const canSubmit =
    assignment.accepts_submissions &&
    (!latest || latest.resubmission_allowed === true);
  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-2 text-sm font-bold text-tea-500 hover:text-tea-700"
        to="/hoc-sinh/bai-tap"
      >
        <ArrowLeft size={18} />
        Trở lại danh sách
      </Link>
      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">Đề bài</p>
          {latest && (
            <StatusPill tone="info">
              Đã nộp phiên bản {latest.version}
            </StatusPill>
          )}
        </div>
        <h1 className="page-title mt-2">{assignment.title}</h1>
        <p className="mt-4 whitespace-pre-wrap leading-relaxed">
          {assignment.content}
        </p>
        {attachmentUrl &&
          (attachmentIsPdf ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-tea-100 bg-white">
              <div className="flex items-center justify-between gap-3 p-4">
                <span className="flex items-center gap-2 font-bold">
                  <FileText className="text-peach-500" /> Tệp PDF đề bài
                </span>
                <a
                  className="btn-secondary"
                  href={attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={17} /> Mở PDF
                </a>
              </div>
              <iframe
                className="hidden h-[70vh] w-full border-t border-tea-100 md:block"
                src={attachmentUrl}
                title={`PDF đề bài ${assignment.title}`}
              />
            </div>
          ) : (
            <a href={attachmentUrl} target="_blank" rel="noreferrer">
              <img
                className="mt-5 max-h-[560px] w-full rounded-2xl border border-tea-100 bg-white object-contain"
                src={attachmentUrl}
                alt={`Ảnh đề bài ${assignment.title}`}
              />
            </a>
          ))}
        {assignment.instructions && (
          <div className="mt-5 rounded-2xl bg-mint-100 p-4 text-sm">
            <strong>Gợi ý từ giáo viên:</strong> {assignment.instructions}
          </div>
        )}
        <p className="mt-5 text-sm font-bold text-tea-500">
          Hạn nộp: {friendlyDate(assignment.due_at, true)}
        </p>
      </section>
      {latest && !canSubmit ? (
        <section className="card p-6 text-center">
          <span className="text-4xl">🌿</span>
          <h2 className="mt-3 text-xl font-black">Bài của em đã được gửi</h2>
          <p className="mt-2 text-sm text-tea-500">
            Giáo viên cần cho phép nộp lại trước khi em tạo phiên bản mới.
          </p>
        </section>
      ) : (
        <section className="card p-6 md:p-8">
          <div>
            <p className="eyebrow">Tệp bài làm</p>
            <h2 className="mt-1 text-xl font-black">
              Sắp xếp ảnh và PDF theo đúng thứ tự
            </h2>
            <p className="mt-2 text-sm text-tea-500">
              Tối đa 10 tệp JPEG, PNG, WebP hoặc PDF; mỗi tệp tối đa 15 MB. Ảnh
              được nén và loại bỏ EXIF, PDF được giữ nguyên.
            </p>
          </div>
          <div
            className={`mt-6 rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-mint-500 bg-mint-100" : "border-tea-300 bg-cream-50"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDrag(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <UploadCloud className="mx-auto text-mint-500" size={38} />
            <p className="mt-3 font-extrabold">
              Kéo ảnh/PDF vào đây hoặc chọn từ máy
            </p>
            <button
              className="btn-secondary mt-4"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <FileImage size={18} />
              Chọn tệp
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_SUBMISSION_TYPES.join(",")}
              className="hidden"
              onChange={(event) =>
                event.target.files && addFiles(event.target.files)
              }
            />
          </div>
          {files.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((item, index) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-tea-100 bg-white"
                >
                  <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-tea-50">
                    {item.file.type === "application/pdf" ? (
                      <div className="p-4 text-center">
                        <FileText
                          className="mx-auto text-peach-500"
                          size={48}
                        />
                        <p className="mt-3 line-clamp-2 text-sm font-bold">
                          {item.file.name}
                        </p>
                        <p className="mt-1 text-xs text-tea-500">Tệp PDF</p>
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={`Trang ${index + 1}`}
                        className="max-h-full max-w-full object-contain transition"
                        style={{ transform: `rotate(${item.rotation}deg)` }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <strong className="text-sm">Trang {index + 1}</strong>
                    <div className="flex">
                      <button
                        className="btn-ghost min-h-9 p-2"
                        type="button"
                        aria-label="Đưa lên"
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={17} />
                      </button>
                      <button
                        className="btn-ghost min-h-9 p-2"
                        type="button"
                        aria-label="Đưa xuống"
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={17} />
                      </button>
                      {item.file.type !== "application/pdf" && (
                        <button
                          className="btn-ghost min-h-9 p-2"
                          type="button"
                          aria-label="Xoay ảnh"
                          onClick={() =>
                            setFiles((current) =>
                              current.map((value, i) =>
                                i === index
                                  ? { ...value, rotation: value.rotation + 90 }
                                  : value,
                              ),
                            )
                          }
                        >
                          <RotateCw size={17} />
                        </button>
                      )}
                      <button
                        className="btn-danger min-h-9 p-2"
                        type="button"
                        aria-label="Xóa ảnh"
                        onClick={() => remove(index)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <label className="mt-6 block">
            <span className="label">
              Lời nhắn cho giáo viên (không bắt buộc)
            </span>
            <textarea
              className="field min-h-28 resize-y"
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: Em chưa chắc câu 4 ạ…"
            />
          </label>
          <div className="mt-6 flex justify-end">
            <button
              className="btn-primary min-w-40"
              onClick={() => void submit()}
              disabled={busy || files.length === 0}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              Xác nhận nộp
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
