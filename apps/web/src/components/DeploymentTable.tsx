import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDeployment, type Deployment } from "../lib/api";
import { StatusPill } from "./StatusPill";

interface Props {
  rows: Deployment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DeploymentTable({ rows, selectedId, onSelect }: Props) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => deleteDeployment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployments"] }),
  });

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-500">
        No deployments yet. Submit a Git URL on the left.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">ID</th>
            <th className="text-left px-4 py-2.5 font-medium">Source</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
            <th className="text-left px-4 py-2.5 font-medium">Image</th>
            <th className="text-left px-4 py-2.5 font-medium">Live</th>
            <th className="text-right px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer hover:bg-slate-50 ${selectedId === r.id ? "bg-slate-50" : ""}`}
            >
              <td className="px-4 py-2.5 font-mono text-xs">{r.id}</td>
              <td className="px-4 py-2.5 text-slate-600 truncate max-w-xs" title={r.sourceRef}>
                {r.sourceRef}
              </td>
              <td className="px-4 py-2.5">
                <StatusPill status={r.status} />
                {r.status === "failed" && r.error && (
                  <div className="mt-1 text-xs text-rose-600 max-w-xs truncate" title={r.error}>
                    {r.error}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                {r.imageTag ? r.imageTag.split(":").slice(-1)[0] : "—"}
              </td>
              <td className="px-4 py-2.5">
                {r.status === "running" ? (
                  <a
                    className="text-blue-600 hover:underline"
                    href={`${r.routePath}/`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    open ↗
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                  disabled={del.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${r.id}?`)) del.mutate(r.id);
                  }}
                >
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
