import { useEffect, useRef, useState } from "react";
import { useLogStream, type SSEStatus } from "../hooks/useSSE";

const STATUS_COPY: Record<SSEStatus, { label: string; color: string }> = {
  idle:         { label: "idle",          color: "text-slate-400" },
  connecting:   { label: "connecting…",   color: "text-amber-300" },
  open:         { label: "live",          color: "text-emerald-400" },
  reconnecting: { label: "reconnecting…", color: "text-amber-300" },
  closed:       { label: "disconnected",  color: "text-rose-400" },
};

export function LogPane({ deploymentId }: { deploymentId: string | null }) {
  const { lines, status } = useLogStream(deploymentId);
  const [follow, setFollow] = useState(true);
  const scrollerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!follow) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  if (!deploymentId) {
    return (
      <div className="bg-slate-950 text-slate-400 rounded-lg p-6 font-mono text-xs">
        Select a deployment to view logs.
      </div>
    );
  }

  const statusCopy = STATUS_COPY[status];

  return (
    <div className="bg-slate-950 rounded-lg border border-slate-800 flex flex-col h-96">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <span className="text-xs font-mono text-slate-400">
          logs · {deploymentId}
          <span className={`ml-2 ${statusCopy.color}`}>· {statusCopy.label}</span>
        </span>
        <label className="text-xs text-slate-300 flex items-center gap-2">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
            className="accent-emerald-500"
          />
          follow
        </label>
      </div>
      <pre ref={scrollerRef} className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed px-4 py-2">
        {lines.length === 0 ? (
          <span className="text-slate-500">waiting for output…</span>
        ) : (
          lines.map((l, i) => {
            const color =
              l.stream === "stderr" ? "text-rose-300" :
              l.stream === "system" ? "text-sky-300" : "text-slate-200";
            return (
              <div key={l.id ?? i} className={color}>
                <span className="text-slate-500">[{l.phase}]</span> {l.line}
              </div>
            );
          })
        )}
      </pre>
    </div>
  );
}
