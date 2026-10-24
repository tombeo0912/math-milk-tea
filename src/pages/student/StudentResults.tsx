import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate } from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type { PointLedgerEntry } from "../../types/domain";

interface ResultRow {
  id: string;
  submitted_at: string;
  assignment: { title: string };
  grading_records: Array<{
    math_score: number;
    difficulty_label_snapshot: string;
    approved_points: number;
    comment: string | null;
    status: string;
    approved_at: string | null;
  }>;
}

export function StudentResults() {
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [results, ledger] = await Promise.all([
      db
        .from("submissions")
        .select(
          "id, submitted_at, assignment:assignments(title), grading_records(*)",
        )
        .order("submitted_at", { ascending: false }),
      db
        .from("point_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (results.error) throw results.error;
    if (ledger.error) throw ledger.error;
    return {
      results: (results.data ?? []) as unknown as ResultRow[],
      ledger: (ledger.data ?? []) as PointLedgerEntry[],
    };
  }, []);
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải kết quả."} />;
  const approved = state.data.results.filter((item) =>
    item.grading_records.some((grade) => grade.status === "approved"),
  );
  return (
    <div>
      <header>
        <p className="eyebrow">Kết quả học tập</p>
        <h1 className="page-title mt-1">Mỗi bài là một bước tiến</h1>
        <p className="mt-2 text-tea-500">
          Điểm số giúp mình biết chỗ cần luyện thêm, không phải để tạo áp lực.
        </p>
      </header>
      <section className="mt-7">
        <h2 className="text-xl font-black">Bài đã chấm</h2>
        <div className="mt-4 space-y-4">
          {approved.length === 0 ? (
            <EmptyState
              title="Chưa có kết quả được công bố"
              description="Khi giáo viên duyệt bài, kết quả sẽ xuất hiện tại đây."
            />
          ) : (
            approved.map((item) => {
              const grade = item.grading_records.find(
                (value) => value.status === "approved",
              )!;
              return (
                <article key={item.id} className="card p-5 md:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-tea-500">
                        Đã chấm {friendlyDate(grade.approved_at, true)}
                      </p>
                      <h3 className="mt-1 text-lg font-black">
                        {item.assignment.title}
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusPill tone="success">
                          {grade.math_score}/10
                        </StatusPill>
                        <StatusPill tone="info">
                          {grade.difficulty_label_snapshot}
                        </StatusPill>
                        <StatusPill tone="warning">
                          +{grade.approved_points} điểm thưởng
                        </StatusPill>
                      </div>
                    </div>
                    <span className="text-4xl">⭐</span>
                  </div>
                  <div className="mt-5 rounded-2xl bg-cream-100 p-4 text-sm leading-relaxed">
                    <strong>Nhận xét của giáo viên:</strong>
                    <p className="mt-1 text-tea-700">
                      {grade.comment ||
                        "Em đã hoàn thành bài. Cố gắng phát huy nhé!"}
                    </p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
      <section className="mt-9">
        <h2 className="text-xl font-black">Lịch sử điểm thưởng</h2>
        <div className="card mt-4 overflow-hidden">
          {state.data.ledger.length === 0 ? (
            <p className="p-7 text-center text-sm text-tea-500">
              Chưa có giao dịch điểm nào.
            </p>
          ) : (
            <div className="divide-y divide-tea-100">
              {state.data.ledger.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-4">
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
                  <strong
                    className={
                      item.delta >= 0 ? "text-emerald-700" : "text-peach-500"
                    }
                  >
                    {item.delta >= 0 ? "+" : ""}
                    {item.delta}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
