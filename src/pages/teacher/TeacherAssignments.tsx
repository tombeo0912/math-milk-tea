import { Archive, Edit3, LoaderCircle, Plus, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAuth } from "../../context/AuthContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate } from "../../lib/domain";
import { processSubmissionImage } from "../../lib/images";
import { requireSupabase } from "../../lib/supabase";
import type { Assignment, AssignmentStatus } from "../../types/domain";

const blank = {
  title: "",
  content: "",
  instructions: "",
  due_at: "",
  status: "draft" as AssignmentStatus,
  accepts_submissions: true,
};
export function TeacherAssignments() {
  const { user } = useAuth();
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("assignments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Assignment[];
  }, []);
  function start(item?: Assignment) {
    setImageFile(null);
    setEditing(item ?? null);
    setForm(
      item
        ? {
            title: item.title,
            content: item.content,
            instructions: item.instructions ?? "",
            due_at: item.due_at ? item.due_at.slice(0, 16) : "",
            status: item.status,
            accepts_submissions: item.accepts_submissions,
          }
        : blank,
    );
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    const db = requireSupabase();
    const recordId = editing?.id ?? crypto.randomUUID();
    let imagePath = editing?.image_path ?? null;
    if (imageFile) {
      try {
        const processed = await processSubmissionImage(imageFile, 0);
        imagePath = `${user.id}/${recordId}/statement.webp`;
        const { error } = await db.storage
          .from("assignment-images")
          .upload(imagePath, processed, {
            contentType: "image/webp",
            upsert: Boolean(editing),
          });
        if (error) throw error;
      } catch (reason) {
        setBusy(false);
        return toast.error(
          reason instanceof Error
            ? reason.message
            : "Không thể tải ảnh đề bài.",
        );
      }
    }
    const payload = {
      teacher_id: user.id,
      title: form.title.trim(),
      content: form.content.trim(),
      instructions: form.instructions.trim() || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      status: form.status,
      accepts_submissions: form.accepts_submissions,
      image_path: imagePath,
    };
    const result = editing
      ? await db.from("assignments").update(payload).eq("id", editing.id)
      : await db.from("assignments").insert({ id: recordId, ...payload });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(editing ? "Đã cập nhật bài tập." : "Đã tạo bài tập mới.");
    setOpen(false);
    void state.reload();
  }
  async function archive(item: Assignment) {
    const db = requireSupabase();
    const { error } = await db
      .from("assignments")
      .update({ status: "archived", accepts_submissions: false })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã lưu trữ bài tập.");
      void state.reload();
    }
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải bài tập."} />;
  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Quản lý bài tập</p>
          <h1 className="page-title mt-1">Bài tập Toán</h1>
          <p className="mt-2 text-tea-500">
            Độ khó được quyết định lúc chấm bài.
          </p>
        </div>
        <button className="btn-primary" onClick={() => start()}>
          <Plus size={18} />
          Tạo bài mới
        </button>
      </header>
      <div className="mt-7 space-y-4">
        {state.data.length === 0 ? (
          <EmptyState
            title="Chưa có bài tập"
            description="Tạo bài đầu tiên để học sinh bắt đầu."
            action={
              <button className="btn-primary" onClick={() => start()}>
                <Plus />
                Tạo bài
              </button>
            }
          />
        ) : (
          state.data.map((item) => (
            <article
              key={item.id}
              className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">{item.title}</h2>
                  <StatusPill
                    tone={
                      item.status === "published"
                        ? "success"
                        : item.status === "draft"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {item.status === "published"
                      ? "Đã đăng"
                      : item.status === "draft"
                        ? "Bản nháp"
                        : "Đã lưu trữ"}
                  </StatusPill>
                  {item.status === "published" && (
                    <StatusPill
                      tone={item.accepts_submissions ? "info" : "neutral"}
                    >
                      {item.accepts_submissions
                        ? "Đang nhận bài"
                        : "Đã đóng nhận bài"}
                    </StatusPill>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-tea-500">
                  {item.content}
                </p>
                <p className="mt-3 text-xs font-bold text-tea-500">
                  Hạn: {friendlyDate(item.due_at, true)}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => start(item)}>
                  <Edit3 size={17} />
                  Sửa
                </button>
                {item.status !== "archived" && (
                  <button
                    className="btn-ghost"
                    onClick={() => void archive(item)}
                  >
                    <Archive size={17} />
                    Lưu trữ
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-4">
          <form
            className="card my-6 w-full max-w-2xl bg-cream-50 p-6 md:p-8"
            onSubmit={save}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">
                {editing ? "Chỉnh sửa bài tập" : "Tạo bài tập mới"}
              </h2>
              <button
                type="button"
                className="btn-ghost min-h-10 p-2"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
              >
                <X />
              </button>
            </div>
            <div className="mt-6 grid gap-5">
              <label>
                <span className="label">Tiêu đề *</span>
                <input
                  className="field"
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                <span className="label">Nội dung *</span>
                <textarea
                  className="field min-h-36 resize-y"
                  required
                  maxLength={10000}
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                />
              </label>
              <label>
                <span className="label">Hướng dẫn (tùy chọn)</span>
                <textarea
                  className="field min-h-24 resize-y"
                  maxLength={3000}
                  value={form.instructions}
                  onChange={(e) =>
                    setForm({ ...form, instructions: e.target.value })
                  }
                />
              </label>
              <label>
                <span className="label">Ảnh đề bài (tùy chọn)</span>
                <input
                  className="field pt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setImageFile(event.target.files?.[0] ?? null)
                  }
                />
                <p className="helper">
                  Ảnh được chuyển sang WebP, bỏ EXIF và lưu trong bucket riêng
                  tư.
                  {editing?.image_path && !imageFile
                    ? " Ảnh hiện tại sẽ được giữ nguyên."
                    : ""}
                </p>
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label>
                  <span className="label">Hạn nộp</span>
                  <input
                    className="field"
                    type="datetime-local"
                    value={form.due_at}
                    onChange={(e) =>
                      setForm({ ...form, due_at: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span className="label">Trạng thái</span>
                  <select
                    className="field"
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as AssignmentStatus,
                      })
                    }
                  >
                    <option value="draft">Bản nháp</option>
                    <option value="published">Đã đăng</option>
                    <option value="archived">Đã lưu trữ</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-2xl bg-mint-100 p-4 font-bold">
                <input
                  type="checkbox"
                  checked={form.accepts_submissions}
                  onChange={(e) =>
                    setForm({ ...form, accepts_submissions: e.target.checked })
                  }
                />
                Cho phép học sinh nộp bài
              </label>
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setOpen(false)}
              >
                Hủy
              </button>
              <button className="btn-primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                Lưu bài tập
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
