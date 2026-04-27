import type { Deployment } from "../lib/api";

const PALETTE: Record<Deployment["status"], string> = {
  pending: "bg-slate-100 text-slate-700 ring-slate-200",
  building: "bg-amber-100 text-amber-800 ring-amber-200",
  deploying: "bg-blue-100 text-blue-800 ring-blue-200",
  running: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function StatusPill({ status }: { status: Deployment["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PALETTE[status]}`}>
      {status}
    </span>
  );
}
