import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  FileImage,
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
  ACCEPTED_IMAGE_TYPES,
  friendlyDate,
  makeIdempotencyKey,
  MAX_SUBMISSION_FILES,
  validateSubmissionFile,
} from "../../lib/domain";
import { processSubmissionImage } from "../../lib/images";
import { requireSupabase } from "../../lib/supabase";
import type { Assignment, Submission } from "../../types/domain";

interface DraftImage {
  file: File;
  url: string;
  rotation: number;
  id: string;
}
export function AssignmentSubmissionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<DraftImage[]>([]);
  const [note, setNote] = useState("");
  const [images, setImages] = useState<DraftImage[]>([]);
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
    let imageUrl: string | null = null;
    if (assignment.image_path) {
      const signed = await db.storage
        .from("assignment-images")
        .createSignedUrl(assignment.image_path, 900);
      if (signed.error) throw signed.error;
      imageUrl = signed.data.signedUrl;
    }
    return {
      assignment,
      imageUrl,
      submissions: (s.data ?? []) as Submission[],
    };
  }, [id]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () =>
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );
  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (images.length + incoming.length > MAX_SUBMISSION_FILES) {
      toast.error(`Mỗi bài tối đa ${MAX_SUBMISSION_FILES} ảnh.`);
      return;
    }
    const accepted: DraftImage[] = [];
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
    setImages((current) => [...current, ...accepted]);
  }
  function move(index: number, direction: -1 | 1) {
    setImages((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function remove(index: number) {
    setImages((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  }
  async function submit() {
    if (!id || images.length === 0)
      return toast.error("Em hãy chọn ít nhất một ảnh bài làm.");
    setBusy(true);
    const db = requireSupabase();
    const draftId = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      const processed = await Promise.all(
        images.map((item) => processSubmissionImage(item.file, item.rotation)),
      );
      for (let index = 0; index < processed.length; index++) {
        const file = processed[index];
        const path = `${(await db.auth.getUser()).data.user?.id}/${id}/${draftId}/${String(index + 1).padStart(2, "0")}.webp`;
        const { error } = await db.storage
          .from("submission-images")
          .upload(path, file, { contentType: "image/webp", upsert: false });
        if (error) throw error;
        uploaded.push(path);
      }
      const files = processed.map((file, index) => ({
        storage_path: uploaded[index],
        page_order: index + 1,
        mime_type: file.type,
        size_bytes: file.size,
      }));
      const { error } = await db.rpc("finalize_submission", {
        p_assignment_id: id,
        p_note: note.trim() || null,
        p_files: files,
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
          : "Chưa thể nộp bài. Ảnh đã tải lên được hoàn tác.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể mở bài tập."} />;
  const { assignment, submissions, imageUrl } = state.data;
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
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer">
            <img
              className="mt-5 max-h-[560px] w-full rounded-2xl border border-tea-100 bg-white object-contain"
              src={imageUrl}
              alt={`Ảnh đề bài ${assignment.title}`}
            />
          </a>
        )}
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
            <p className="eyebrow">Ảnh bài làm</p>
            <h2 className="mt-1 text-xl font-black">
              Sắp xếp các trang theo đúng thứ tự
            </h2>
            <p className="mt-2 text-sm text-tea-500">
              Tối đa 10 ảnh JPEG, PNG hoặc WebP. Hệ thống giữ chất lượng chữ
              viết và loại bỏ dữ liệu EXIF khi xử lý ảnh.
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
              Kéo ảnh vào đây hoặc chọn từ máy
            </p>
            <button
              className="btn-secondary mt-4"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <FileImage size={18} />
              Chọn ảnh
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(event) =>
                event.target.files && addFiles(event.target.files)
              }
            />
          </div>
          {images.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {images.map((item, index) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-tea-100 bg-white"
                >
                  <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-tea-50">
                    <img
                      src={item.url}
                      alt={`Trang ${index + 1}`}
                      className="max-h-full max-w-full object-contain transition"
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
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
                      <button
                        className="btn-ghost min-h-9 p-2"
                        type="button"
                        aria-label="Xoay ảnh"
                        onClick={() =>
                          setImages((current) =>
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
              disabled={busy || images.length === 0}
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
