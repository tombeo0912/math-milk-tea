import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({
  label = "Đang tải dữ liệu…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-48 items-center justify-center gap-3 text-tea-500"
      role="status"
    >
      <LoaderCircle className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="card flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center"
      role="alert"
    >
      <span className="rounded-full bg-red-50 p-3 text-red-600">
        <AlertCircle />
      </span>
      <p className="max-w-xl font-semibold">{message}</p>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="rounded-full bg-mint-100 p-4 text-mint-500">
        <Inbox size={28} />
      </span>
      <div>
        <h3 className="font-extrabold">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-tea-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const colors = {
    neutral: "bg-tea-100 text-tea-700",
    success: "bg-mint-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-sky-100 text-sky-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold ${colors[tone]}`}
    >
      {children}
    </span>
  );
}
