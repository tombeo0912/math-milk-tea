import { Bell, CheckCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAsyncData } from "../hooks/useAsyncData";
import { friendlyDate } from "../lib/domain";
import { requireSupabase } from "../lib/supabase";
import type { AppNotification } from "../types/domain";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const { data, error } = await db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  }, []);
  const unread = state.data?.filter((item) => !item.read_at).length ?? 0;
  async function markAll() {
    const db = requireSupabase();
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) toast.error("Chưa thể đánh dấu thông báo.");
    else void state.reload();
  }
  return (
    <div className="relative">
      <button
        className="relative grid h-11 w-11 place-items-center rounded-2xl border border-tea-100 bg-white text-tea-700 shadow-sm"
        aria-label={`Thông báo, ${unread} chưa đọc`}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-peach-500 px-1 text-[10px] font-black text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-hidden rounded-3xl border border-tea-100 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-[390px]">
          <div className="flex items-center justify-between border-b border-tea-100 p-4">
            <div>
              <h2 className="font-black">Thông báo</h2>
              <p className="text-xs text-tea-500">
                {unread} thông báo chưa đọc
              </p>
            </div>
            <div className="flex">
              <button
                className="btn-ghost min-h-9 p-2"
                onClick={() => void markAll()}
                aria-label="Đánh dấu tất cả đã đọc"
              >
                <CheckCheck size={18} />
              </button>
              <button
                className="btn-ghost min-h-9 p-2"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {state.loading ? (
              <p className="p-6 text-center text-sm text-tea-500">Đang tải…</p>
            ) : state.error ? (
              <p className="p-6 text-center text-sm text-red-600">
                Không thể tải thông báo.
              </p>
            ) : state.data?.length === 0 ? (
              <p className="p-7 text-center text-sm text-tea-500">
                Chưa có thông báo mới.
              </p>
            ) : (
              state.data?.map((item) => (
                <article
                  key={item.id}
                  className={`border-b border-tea-50 p-4 ${item.read_at ? "bg-white" : "bg-mint-100/40"}`}
                >
                  <div className="flex gap-3">
                    <span className="text-xl">
                      {item.kind.includes("achievement")
                        ? "🏅"
                        : item.kind.includes("wish")
                          ? "💭"
                          : item.kind.includes("reward")
                            ? "🎁"
                            : item.kind.includes("point")
                              ? "⭐"
                              : "📝"}
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold">{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-tea-500">
                        {item.message}
                      </p>
                      <p className="mt-2 text-[11px] font-bold text-tea-300">
                        {friendlyDate(item.created_at, true)}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
