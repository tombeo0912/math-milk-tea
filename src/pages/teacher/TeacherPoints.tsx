import { Coins, Download, LoaderCircle, PlusCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate, makeIdempotencyKey } from "../../lib/domain";
import { downloadCsv } from "../../lib/csv";
import { requireSupabase } from "../../lib/supabase";
import type {
  PointLedgerEntry,
  PointWallet,
  Profile,
} from "../../types/domain";

interface ApprovedGrade {
  id: string;
  submission_id: string;
  approved_points: number;
  suggested_points: number;
  submission: {
    assignment: { title: string };
    profiles: { display_name: string };
  };
}

export function TeacherPoints() {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [w, l, p, g] = await Promise.all([
      db.from("point_wallets").select("*").limit(1).single(),
      db
        .from("point_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("profiles").select("*").eq("role", "student").limit(1).single(),
      db
        .from("grading_records")
        .select(
          "id, submission_id, approved_points, suggested_points, submission:submissions(assignment:assignments(title), profiles(display_name))",
        )
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(20),
    ]);
    if (w.error) throw w.error;
    if (l.error) throw l.error;
    if (p.error) throw p.error;
    if (g.error) throw g.error;
    return {
      wallet: w.data as PointWallet,
      ledger: (l.data ?? []) as PointLedgerEntry[],
      student: p.data as Profile,
      approvedGrades: (g.data ?? []) as unknown as ApprovedGrade[],
    };
  }, []);
  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!state.data) return;
    const value = Number(delta);
    if (!Number.isInteger(value) || value === 0)
      return toast.error("Số điểm điều chỉnh phải là số nguyên khác 0.");
    if (!reason.trim()) return toast.error("Hãy nhập lý do điều chỉnh.");
    if (
      !window.confirm(
        `Xác nhận điều chỉnh ${value > 0 ? "+" : ""}${value} điểm cho ${state.data.student.display_name}?`,
      )
    )
      return;
    setBusy(true);
    const db = requireSupabase();
    const { error } = await db.rpc("adjust_points", {
      p_student_id: state.data.student.id,
      p_delta: value,
      p_reason: reason.trim(),
      p_idempotency_key: makeIdempotencyKey("adjust"),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Đã ghi giao dịch điều chỉnh.");
    setDelta("");
    setReason("");
    void state.reload();
  }
  async function adjustApprovedGrade(grade: ApprovedGrade) {
    const value = window.prompt(
      `Điểm thưởng mới cho “${grade.submission.assignment.title}” (hiện tại ${grade.approved_points}):`,
      String(grade.approved_points),
    );
    if (value === null) return;
    const points = Number(value);
    if (!Number.isInteger(points) || points < 0)
      return toast.error("Điểm mới phải là số nguyên không âm.");
    const explanation = window.prompt(
      "Nhập lý do điều chỉnh để lưu vào lịch sử:",
    );
    if (!explanation?.trim()) return toast.error("Cần có lý do điều chỉnh.");
    setBusy(true);
    const db = requireSupabase();
    const { error } = await db.rpc("adjust_approved_grade", {
      p_submission_id: grade.submission_id,
      p_new_approved_points: points,
      p_reason: explanation.trim(),
      p_idempotency_key: makeIdempotencyKey("grade-adjustment"),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Đã tạo giao dịch chênh lệch, ledger cũ được giữ nguyên.");
    void state.reload();
  }
  async function exportLedger() {
    const db = requireSupabase();
    const { data, error } = await db
      .from("point_ledger")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return toast.error("Không thể xuất lịch sử điểm.");
    downloadCsv(
      `lich-su-diem-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Thời gian UTC", "Loại", "Nội dung", "Thay đổi", "Số dư sau"],
      (data ?? []).map((item) => [
        item.created_at,
        item.transaction_type,
        item.description,
        item.delta,
        item.balance_after,
      ]),
    );
  }
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải sổ điểm."} />;
  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Quản lý điểm thưởng</p>
          <h1 className="page-title mt-1">Sổ điểm minh bạch</h1>
          <p className="mt-2 text-tea-500">
            Không sửa số dư trực tiếp; mọi thay đổi đều tạo một dòng giao dịch
            mới.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => void exportLedger()}>
          <Download size={18} /> Xuất CSV
        </button>
      </header>
      <div className="mt-7 grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
        <div className="space-y-5">
          <section className="card p-6">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-mint-100 text-mint-500">
                <Coins />
              </span>
              <div>
                <p className="text-sm font-bold text-tea-500">
                  Điểm khả dụng của {state.data.student.display_name}
                </p>
                <p className="text-4xl font-black">
                  {state.data.wallet.available_points}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-cream-100 p-3">
                <p className="text-xs text-tea-500">Đã kiếm</p>
                <strong>{state.data.wallet.earned_points}</strong>
              </div>
              <div className="rounded-2xl bg-cream-100 p-3">
                <p className="text-xs text-tea-500">Đã đổi</p>
                <strong>{state.data.wallet.redeemed_points}</strong>
              </div>
            </div>
          </section>
          <form className="card p-6" onSubmit={adjust}>
            <h2 className="text-lg font-black">Cộng / điều chỉnh thủ công</h2>
            <p className="mt-1 text-xs text-tea-500">
              Dùng số âm để giảm điểm; hệ thống không cho số dư âm.
            </p>
            <label className="mt-5 block">
              <span className="label">Số điểm *</span>
              <input
                className="field"
                type="number"
                step="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="Ví dụ: 10 hoặc -5"
                required
              />
            </label>
            <label className="mt-4 block">
              <span className="label">Lý do *</span>
              <textarea
                className="field min-h-24"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
              />
            </label>
            <button className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PlusCircle size={18} />
              )}
              Ghi giao dịch
            </button>
          </form>
        </div>
        <section className="card overflow-hidden">
          <div className="border-b border-tea-100 p-5">
            <h2 className="text-lg font-black">Lịch sử giao dịch</h2>
          </div>
          {state.data.ledger.length === 0 ? (
            <EmptyState
              title="Chưa có giao dịch"
              description="Các khoản thưởng và đổi quà sẽ xuất hiện tại đây."
            />
          ) : (
            <div className="divide-y divide-tea-100">
              {state.data.ledger.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 md:p-5"
                >
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-full font-black ${item.delta >= 0 ? "bg-mint-100 text-mint-500" : "bg-peach-100 text-peach-500"}`}
                  >
                    {item.delta >= 0 ? "+" : "−"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {item.description}
                    </p>
                    <p className="mt-1 text-xs text-tea-500">
                      {friendlyDate(item.created_at, true)} · Số dư{" "}
                      {item.balance_after}
                    </p>
                  </div>
                  <StatusPill tone={item.delta >= 0 ? "success" : "warning"}>
                    {item.delta >= 0 ? "+" : ""}
                    {item.delta}
                  </StatusPill>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-tea-100 p-5">
          <h2 className="text-lg font-black">Điều chỉnh bài đã duyệt</h2>
          <p className="mt-1 text-xs text-tea-500">
            Hệ thống tạo giao dịch chênh lệch tham chiếu giao dịch cũ; không sửa
            ledger đã ghi.
          </p>
        </div>
        {state.data.approvedGrades.length === 0 ? (
          <p className="p-6 text-center text-sm text-tea-500">
            Chưa có bài đã duyệt.
          </p>
        ) : (
          <div className="divide-y divide-tea-100">
            {state.data.approvedGrades.map((grade) => (
              <div
                key={grade.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <p className="font-bold">
                    {grade.submission.assignment.title}
                  </p>
                  <p className="text-xs text-tea-500">
                    {grade.submission.profiles.display_name} · Đề xuất{" "}
                    {grade.suggested_points} · Đã duyệt {grade.approved_points}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void adjustApprovedGrade(grade)}
                >
                  Điều chỉnh an toàn
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
