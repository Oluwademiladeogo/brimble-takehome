import { useEffect, useRef, useState } from "react";
import type { LogLine } from "../lib/api";

export type SSEStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

// Thin wrapper over EventSource that accumulates log events and exposes a
// snapshot plus a connection status so the UI can show "reconnecting…"
// when the stream drops mid-build (laptop sleeps, proxy blips, etc).
//
// EventSource auto-reconnects on its own — we just listen for `open`/`error`
// to drive the status string.
export function useLogStream(deploymentId: string | null): {
  lines: LogLine[];
  status: SSEStatus;
} {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<SSEStatus>("idle");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setLines([]);
    setStatus("idle");
    if (!deploymentId) return;

    setStatus("connecting");
    const es = new EventSource(`/api/deployments/${deploymentId}/logs`);
    esRef.current = es;

    es.addEventListener("open", () => setStatus("open"));
    es.addEventListener("log", (evt) => {
      try {
        const line = JSON.parse((evt as MessageEvent).data) as LogLine;
        setLines((prev) => (prev.length > 5000 ? [...prev.slice(-4500), line] : [...prev, line]));
      } catch {
        // swallow — malformed events shouldn't kill the pane
      }
    });
    es.addEventListener("error", () => {
      // readyState CONNECTING(0) means EventSource is attempting to reconnect.
      if (es.readyState === EventSource.CONNECTING) setStatus("reconnecting");
      else setStatus("closed");
    });

    return () => {
      es.close();
      esRef.current = null;
      setStatus("closed");
    };
  }, [deploymentId]);

  return { lines, status };
}
