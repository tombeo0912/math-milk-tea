import { LoaderCircle, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { requireSupabase } from "../../lib/supabase";
import type { DifficultySetting } from "../../types/domain";

export function TeacherSettings() {
  const [items, setItems] = useState<DifficultySetting[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("200");
  const [maxFiles, setMaxFiles] = useState("10");
  const [maxSize, setMaxSize] = useState("5");
  const [busy, setBusy] = useState(false);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [d, s] = await Promise.all([
      db.from("difficulty_settings").select("*").order("sort_order"),
      db
        .from("app_settings")
        .select("*")
        .in("key", [
          "default_reward_price",
          "max_submission_files",
          "max_upload_size_mb",
        ]),
    ]);
    if (d.error) throw d.error;
    if (s.error) throw s.error;
    const settings = new Map((s.data ?? []).map((row) => [row.key, row.value]));
    return {
      difficulties: (d.data ?? []) as DifficultySetting[],
      defaultPrice: String(
        settings.get("default_reward_price") ?? 200,
      ).replaceAll('"', ""),
      maxFiles: String(settings.get("max_submission_files") ?? 10).replaceAll(
        '"',
        "",
      ),
      maxSize: String(settings.get("max_upload_size_mb") ?? 5).replaceAll(
        '"',
        "",
      ),
    };
  }, []);
  useEffect(() => {
    if (state.data) {
      setItems(state.data.difficulties);
      setDefaultPrice(state.data.defaultPrice);
      setMaxFiles(state.data.maxFiles);
      setMaxSize(state.data.maxSize);
    }
  }, [state.data]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const price = Number(defaultPrice),
      files = Number(maxFiles),
      size = Number(maxSize);
    if (
      !Number.isInteger(price) ||
      price <= 0 ||
      !Number.isInteger(files) ||
      files < 1 ||
      files > 20 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 15
    )
      return toast.error("Thông số cấu hình chưa hợp lệ.");
    if (
      items.some(
        (item) =>
          !Number.isFinite(Number(item.multiplier)) ||
          Number(item.multiplier) <= 0,
      )
    )
      return toast.error("Mọi hệ số độ khó phải lớn hơn 0.");
    setBusy(true);
    const db = requireSupabase();
    const diff = await Promise.all(
      items.map((item) =>
        db
          .from("difficulty_settings")
          .update({
            label: item.label,
            multiplier: Number(item.multiplier),
            active: item.active,
          })
          .eq("code", item.code),
      ),
    );
    const settings = await db.from("app_settings").upsert([
      { key: "default_reward_price", value: price },
      { key: "max_submission_files", value: files },
      { key: "max_upload_size_mb", value: size },
    ]);
    setBusy(false);
    const error = diff.find((item) => item.error)?.error ?? settings.error;
    if (error) return toast.error(error.message);
    toast.success("Đã lưu cài đặt hệ thống.");
    void state.reload();
  }
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  return (
    <div>
      <header>
        <p className="eyebrow">Cài đặt</p>
        <h1 className="page-title mt-1">Cấu hình hệ thống</h1>
        <p className="mt-2 text-tea-500">
          Các thay đổi hệ số chỉ áp dụng cho lần chấm mới; bản đã duyệt giữ
          snapshot cũ.
        </p>
      </header>
      <form className="mt-7 grid gap-6 xl:grid-cols-2" onSubmit={save}>
        <section className="card p-6">
          <h2 className="text-lg font-black">Hệ số độ khó</h2>
          <div className="mt-5 space-y-4">
            {items.map((item, index) => (
              <div
                key={item.code}
                className="grid grid-cols-[1fr_110px_auto] items-end gap-3"
              >
                <label>
                  <span className="label">Nhãn hiển thị</span>
                  <input
                    className="field"
                    value={item.label}
                    onChange={(e) =>
                      setItems((values) =>
                        values.map((value, i) =>
                          i === index
                            ? { ...value, label: e.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span className="label">Hệ số</span>
                  <input
                    className="field"
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={item.multiplier}
                    onChange={(e) =>
                      setItems((values) =>
                        values.map((value, i) =>
                          i === index
                            ? { ...value, multiplier: Number(e.target.value) }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
                <label className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={item.active}
                    onChange={(e) =>
                      setItems((values) =>
                        values.map((value, i) =>
                          i === index
                            ? { ...value, active: e.target.checked }
                            : value,
                        ),
                      )
                    }
                  />
                  Bật
                </label>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-6">
          <h2 className="text-lg font-black">Phần thưởng &amp; upload</h2>
          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="label">Giá mặc định cho quà mới</span>
              <input
                className="field"
                type="number"
                min="1"
                step="1"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Số ảnh tối đa mỗi bài</span>
              <input
                className="field"
                type="number"
                min="1"
                max="20"
                step="1"
                value={maxFiles}
                onChange={(e) => setMaxFiles(e.target.value)}
              />
              <p className="helper">
                Frontend hiện tối ưu cho tối đa 10 ảnh; tăng giới hạn cần kiểm
                tra trải nghiệm tải lên.
              </p>
            </label>
            <label className="block">
              <span className="label">Dung lượng tối đa sau xử lý (MB)</span>
              <input
                className="field"
                type="number"
                min="1"
                max="15"
                step="1"
                value={maxSize}
                onChange={(e) => setMaxSize(e.target.value)}
              />
            </label>
          </div>
        </section>
        <div className="xl:col-span-2 flex justify-end">
          <button className="btn-primary min-w-40" disabled={busy}>
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Lưu cài đặt
          </button>
        </div>
      </form>
    </div>
  );
}
