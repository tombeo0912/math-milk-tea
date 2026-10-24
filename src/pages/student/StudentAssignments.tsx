import { CalendarDays, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
} from "../../components/Feedback";
import { useAsyncData } from "../../hooks/useAsyncData";
import { friendlyDate } from "../../lib/domain";
import { requireSupabase } from "../../lib/supabase";
import type { Assignment, Submission } from "../../types/domain";

export function StudentAssignments() {
  const state = useAsyncData(async () => {
    const db = requireSupabase();
    const [a, s] = await Promise.all([
      db
        .from("assignments")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false }),
      db.from("submissions").select("*").order("version", { ascending: false }),
    ]);
    if (a.error) throw a.error;
    if (s.error) throw s.error;
    return {
      assignments: (a.data ?? []) as Assignment[],
      submissions: (s.data ?? []) as Submission[],
    };
  }, []);
  if (state.loading) return <LoadingState />;
  if (state.error || !state.data)
    return <ErrorState message={state.error ?? "Không thể tải bài tập."} />;
  const latest = new Map<string, Submission>();
  state.data.submissions.forEach((item) => {
    if (!latest.has(item.assignment_id)) latest.set(item.assignment_id, item);
  });
  return (
    <div>
      <header>
        <p className="eyebrow">Bài tập của em</p>
        <h1 className="page-title mt-1">Mình làm bài nào!</h1>
        <p className="mt-2 text-tea-500">
          Xem đề, làm ra giấy rồi chụp ảnh rõ nét để nộp.
        </p>
      </header>
      <div className="mt-7 grid gap-4">
        {state.data.assignments.length === 0 ? (
          <EmptyState
            title="Chưa có bài tập mới"
            description="Khi giáo viên đăng bài, em sẽ thấy bài tại đây."
          />
        ) : (
          state.data.assignments.map((item) => {
            const submission = latest.get(item.id);
            return (
              <Link
                key={item.id}
                to={`/hoc-sinh/bai-tap/${item.id}`}
                className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-peach-100 text-2xl">
                  ✏️
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-black">
                      {item.title}
                    </h2>
                    <StatusPill
                      tone={
                        submission?.status === "approved"
                          ? "success"
                          : submission
                            ? "info"
                            : "warning"
                      }
                    >
                      {submission?.status === "approved"
                        ? "Đã chấm"
                        : submission
                          ? "Đã nộp"
                          : "Chưa nộp"}
                    </StatusPill>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-tea-500">
                    {item.content}
                  </p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-tea-500">
                    <CalendarDays size={15} />
                    Hạn nộp: {friendlyDate(item.due_at, true)}
                  </p>
                </div>
                <ChevronRight className="text-tea-300 transition group-hover:translate-x-1" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
