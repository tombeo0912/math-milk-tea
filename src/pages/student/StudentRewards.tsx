import { Check, Gift, LoaderCircle, PackageCheck, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { calculateProgress, makeIdempotencyKey } from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type {
  PointWallet,
  RewardProduct,
  RewardTarget,
} from "../../types/domain";
import { RewardWishPanel } from "./RewardWishPanel";

export function StudentRewards() {
  const [busy, setBusy] = useState<string | null>(null);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [p, t, w] = await Promise.all([
      db
        .from("reward_products")
        .select("*")
        .eq("active", true)
        .order("created_at"),
      db.from("reward_targets").select("*").maybeSingle(),
      db.from("point_wallets").select("*").single(),
    ]);
    if (p.error) throw p.error;
    if (t.error) throw t.error;
    if (w.error) throw w.error;
    const products = (p.data ?? []) as RewardProduct[];
    const productImages = Object.fromEntries(
      await Promise.all(
        products.map(async (product) => {
          if (!product.image_path) return [product.id, null] as const;
          const signed = await db.storage
            .from("reward-images")
            .createSignedUrl(product.image_path, 900);
          return [product.id, signed.data?.signedUrl ?? null] as const;
        }),
      ),
    );
    return {
      products,
      productImages,
      target: t.data as RewardTarget | null,
      wallet: w.data as PointWallet,
    };
  }, []);
  async function select(product: RewardProduct) {
    setBusy(product.id);
    const db = requireSupabase();
    const { data, error } = await db.rpc("set_reward_target", {
      p_product_id: product.id,
      p_idempotency_key: makeIdempotencyKey("target"),
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const count = Number(
      (data as { redemptions_created?: number } | null)?.redemptions_created ??
        0,
    );
    toast.success(
      count > 0
        ? `Chúc mừng! Em vừa đổi thành công ${count} phần quà! 🎁`
        : "Đã chọn mục tiêu mới!",
    );
    void state.reload();
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải cửa hàng."} />;
  const data = state.data;
  return (
    <div>
      <header>
        <p className="eyebrow">Cửa hàng phần thưởng 🎁</p>
        <h1 className="page-title mt-1">Chọn món quà em thích</h1>
        <p className="mt-2 text-tea-500">
          Em có <strong>{data.wallet.available_points} điểm</strong>. Mỗi lần
          chỉ có một mục tiêu đang hoạt động.
        </p>
      </header>
      <RewardWishPanel />
      <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.products.map((product) => {
          const selected = data.target?.product_id === product.id;
          const soldOut =
            product.inventory_mode === "limited" &&
            (product.stock_quantity ?? 0) <= 0;
          const progress = calculateProgress(
            data.wallet.available_points,
            product.price_points,
          );
          return (
            <article
              key={product.id}
              className={`card overflow-hidden p-5 transition ${selected ? "ring-2 ring-mint-500" : ""}`}
            >
              <div className="flex items-start justify-between">
                {data.productImages[product.id] ? (
                  <img
                    className="h-20 w-20 rounded-2xl bg-peach-100 object-cover"
                    src={data.productImages[product.id] ?? ""}
                    alt={`Ảnh ${product.name}`}
                  />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-peach-100 text-4xl">
                    {product.name.toLowerCase().includes("trà")
                      ? "🥤"
                      : product.name.toLowerCase().includes("bánh")
                        ? "🧁"
                        : product.name.toLowerCase().includes("học")
                          ? "✏️"
                          : "🎁"}
                  </span>
                )}
                {selected ? (
                  <StatusPill tone="success">
                    <Target size={13} className="mr-1" />
                    Mục tiêu
                  </StatusPill>
                ) : soldOut ? (
                  <StatusPill tone="neutral">Hết quà</StatusPill>
                ) : (
                  <StatusPill tone="info">
                    <PackageCheck size={13} className="mr-1" />
                    Còn quà
                  </StatusPill>
                )}
              </div>
              <h2 className="mt-5 text-lg font-black">{product.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-tea-500">
                {product.description ||
                  "Một món quà nhỏ dành cho nỗ lực thật tuyệt của em."}
              </p>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-xs font-bold text-tea-500">Cần</p>
                  <p className="text-2xl font-black text-tea-700">
                    {product.price_points} <span className="text-sm">điểm</span>
                  </p>
                </div>
                <span className="text-sm font-extrabold text-mint-500">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-tea-100">
                <div
                  className="h-full rounded-full bg-mint-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                className={
                  selected
                    ? "btn-secondary mt-5 w-full"
                    : "btn-primary mt-5 w-full"
                }
                disabled={selected || soldOut || busy !== null}
                onClick={() => void select(product)}
              >
                {busy === product.id ? (
                  <LoaderCircle className="animate-spin" />
                ) : selected ? (
                  <Check size={18} />
                ) : (
                  <Gift size={18} />
                )}{" "}
                {selected ? "Đang tích điểm" : "Chọn làm mục tiêu"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
