import {
  Edit3,
  Infinity as InfinityIcon,
  LoaderCircle,
  Package,
  Plus,
  Save,
  Sparkles,
  X,
} from "lucide-react";
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
import { makeIdempotencyKey } from "../../lib/domain";
import { processSubmissionImage } from "../../lib/images";
import { requireSupabase } from "../../lib/supabase";
import type { RewardProduct, RewardWish } from "../../types/domain";
import { TeacherRewardWishes } from "./TeacherRewardWishes";

const blank = {
  name: "",
  description: "",
  price_points: "200",
  active: true,
  inventory_mode: "unlimited" as "unlimited" | "limited",
  stock_quantity: "0",
};
export function TeacherRewards() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RewardProduct | null>(null);
  const [selectedWish, setSelectedWish] = useState<RewardWish | null>(null);
  const [wishRefreshToken, setWishRefreshToken] = useState(0);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("reward_products")
      .select("*")
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as RewardProduct[];
  }, []);
  function start(item?: RewardProduct, wish?: RewardWish) {
    setImageFile(null);
    setEditing(item ?? null);
    setSelectedWish(wish ?? null);
    setForm(
      item
        ? {
            name: item.name,
            description: item.description ?? "",
            price_points: String(item.price_points),
            active: item.active,
            inventory_mode: item.inventory_mode,
            stock_quantity: String(item.stock_quantity ?? 0),
          }
        : wish
          ? {
              ...blank,
              name: wish.name,
              description: wish.description ?? "",
            }
          : blank,
    );
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const price = Number(form.price_points);
    const stock =
      form.inventory_mode === "limited" ? Number(form.stock_quantity) : null;
    if (!Number.isInteger(price) || price <= 0)
      return toast.error("Giá quà phải là số nguyên lớn hơn 0.");
    if (stock !== null && (!Number.isInteger(stock) || stock < 0))
      return toast.error("Tồn kho phải là số nguyên không âm.");
    setBusy(true);
    const db = requireSupabase();
    const recordId = editing?.id ?? crypto.randomUUID();
    let imagePath = editing?.image_path ?? null;
    let uploadedImagePath: string | null = null;
    if (imageFile) {
      try {
        const processed = await processSubmissionImage(imageFile, 0);
        imagePath = `${user.id}/${recordId}/reward.webp`;
        const { error } = await db.storage
          .from("reward-images")
          .upload(imagePath, processed, {
            contentType: "image/webp",
            upsert: Boolean(editing),
          });
        if (error) throw error;
        uploadedImagePath = imagePath;
      } catch (reason) {
        setBusy(false);
        return toast.error(
          reason instanceof Error ? reason.message : "Không thể tải ảnh quà.",
        );
      }
    }
    const payload = {
      teacher_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_points: price,
      active: form.active,
      inventory_mode: form.inventory_mode,
      stock_quantity: stock,
      image_path: imagePath,
    };
    const result = editing
      ? await db.from("reward_products").update(payload).eq("id", editing.id)
      : selectedWish
        ? await db.rpc("create_reward_from_wish", {
            p_wish_id: selectedWish.id,
            p_name: payload.name,
            p_description: payload.description,
            p_price_points: payload.price_points,
            p_inventory_mode: payload.inventory_mode,
            p_stock_quantity: payload.stock_quantity,
            p_image_path: payload.image_path,
            p_teacher_comment: "Đã tạo phần thưởng theo mong muốn của em.",
            p_idempotency_key: makeIdempotencyKey("create-reward-from-wish"),
          })
        : await db.from("reward_products").insert({ id: recordId, ...payload });
    setBusy(false);
    if (result.error) {
      if (uploadedImagePath && !editing)
        await db.storage.from("reward-images").remove([uploadedImagePath]);
      return toast.error(result.error.message);
    }
    toast.success(
      editing
        ? "Đã cập nhật phần quà."
        : selectedWish
          ? "Đã tạo phần thưởng từ mong muốn của học sinh."
          : "Đã thêm phần quà.",
    );
    setOpen(false);
    setSelectedWish(null);
    if (selectedWish) setWishRefreshToken((value) => value + 1);
    void state.reload();
  }
  async function seed() {
    setBusy(true);
    const db = requireSupabase();
    const { error } = await db.rpc("seed_default_rewards");
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã thêm các phần quà mẫu.");
      void state.reload();
    }
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải cửa hàng."} />;
  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Quản lý cửa hàng</p>
          <h1 className="page-title mt-1">Phần quà</h1>
          <p className="mt-2 text-tea-500">
            Giá mới chỉ áp dụng cho lần đổi tiếp theo; giao dịch cũ giữ nguyên
            ảnh chụp giá.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.data.length === 0 && (
            <button
              className="btn-secondary"
              onClick={() => void seed()}
              disabled={busy}
            >
              <Sparkles size={18} />
              Thêm quà mẫu
            </button>
          )}
          <button className="btn-primary" onClick={() => start()}>
            <Plus size={18} />
            Thêm quà
          </button>
        </div>
      </header>
      <TeacherRewardWishes
        refreshToken={wishRefreshToken}
        onCreate={(wish) => start(undefined, wish)}
      />
      <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {state.data.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <EmptyState
              title="Cửa hàng đang trống"
              description="Thêm một phần quà mới hoặc dùng bộ dữ liệu mẫu."
            />
          </div>
        ) : (
          state.data.map((item) => (
            <article key={item.id} className="card p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-peach-100 text-3xl">
                  🎁
                </span>
                <StatusPill tone={item.active ? "success" : "neutral"}>
                  {item.active ? "Đang hiển thị" : "Đã tắt"}
                </StatusPill>
              </div>
              <h2 className="mt-4 text-lg font-black">{item.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-tea-500">
                {item.description || "Chưa có mô tả."}
              </p>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-cream-100 p-4">
                <div>
                  <p className="text-xs text-tea-500">Giá đổi</p>
                  <strong className="text-xl">{item.price_points} điểm</strong>
                </div>
                <div className="text-right">
                  <p className="text-xs text-tea-500">Tồn kho</p>
                  <strong className="inline-flex items-center gap-1">
                    {item.inventory_mode === "unlimited" ? (
                      <>
                        <InfinityIcon size={17} />
                        Không giới hạn
                      </>
                    ) : (
                      <>
                        <Package size={17} />
                        {item.stock_quantity}
                      </>
                    )}
                  </strong>
                </div>
              </div>
              <button
                className="btn-secondary mt-5 w-full"
                onClick={() => start(item)}
              >
                <Edit3 size={17} />
                Chỉnh sửa
              </button>
            </article>
          ))
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-4">
          <form
            className="card my-6 w-full max-w-lg bg-cream-50 p-6"
            onSubmit={save}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">
                {editing
                  ? "Chỉnh sửa phần quà"
                  : selectedWish
                    ? "Tạo quà từ mong muốn"
                    : "Thêm phần quà"}
              </h2>
              <button
                type="button"
                className="btn-ghost min-h-10 p-2"
                onClick={() => {
                  setOpen(false);
                  setSelectedWish(null);
                }}
              >
                <X />
              </button>
            </div>
            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="label">Tên phần quà *</span>
                <input
                  className="field"
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="label">Mô tả</span>
                <textarea
                  className="field min-h-24"
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Ảnh minh họa</span>
                <input
                  className="field pt-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setImageFile(event.target.files?.[0] ?? null)
                  }
                />
                <p className="helper">
                  Ảnh sẽ được tối ưu sang WebP.
                  {editing?.image_path && !imageFile
                    ? " Ảnh hiện tại sẽ được giữ nguyên."
                    : ""}
                </p>
              </label>
              <label className="block">
                <span className="label">Giá điểm *</span>
                <input
                  className="field"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.price_points}
                  onChange={(e) =>
                    setForm({ ...form, price_points: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Loại tồn kho</span>
                <select
                  className="field"
                  value={form.inventory_mode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      inventory_mode: e.target.value as "unlimited" | "limited",
                    })
                  }
                >
                  <option value="unlimited">Không giới hạn</option>
                  <option value="limited">Có giới hạn</option>
                </select>
              </label>
              {form.inventory_mode === "limited" && (
                <label className="block">
                  <span className="label">Số lượng còn lại</span>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_quantity}
                    onChange={(e) =>
                      setForm({ ...form, stock_quantity: e.target.value })
                    }
                  />
                </label>
              )}
              <label className="flex items-center gap-3 rounded-2xl bg-mint-100 p-4 font-bold">
                <input
                  type="checkbox"
                  checked={form.active}
                  disabled={Boolean(selectedWish)}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                Hiển thị cho học sinh
              </label>
            </div>
            <button className="btn-primary mt-6 w-full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              Lưu phần quà
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
