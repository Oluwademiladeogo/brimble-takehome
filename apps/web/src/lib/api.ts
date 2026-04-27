export interface Deployment {
  id: string;
  sourceType: string;
  sourceRef: string;
  commitSha: string | null;
  status: "pending" | "building" | "deploying" | "running" | "failed" | "cancelled";
  imageTag: string | null;
  containerId: string | null;
  hostPort: number | null;
  containerPort: number | null;
  routePath: string;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LogLine {
  id?: number;
  ts: number;
  stream: "stdout" | "stderr" | "system";
  phase: "clone" | "build" | "deploy" | "runtime";
  line: string;
}

export async function listDeployments(): Promise<Deployment[]> {
  const res = await fetch("/api/deployments");
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

export async function createDeployment(
  gitUrl: string,
  // Optional idempotency key. The form generates one per submit attempt so
  // a double-click on the Deploy button doesn't create two rows.
  idempotencyKey?: string
): Promise<Deployment> {
  const res = await fetch("/api/deployments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceType: "git", gitUrl, idempotencyKey }),
  });
  if (!res.ok) {
    // Best-effort: surface the server's error message so the user gets
    // "gitUrl may not point at localhost" instead of "create failed: 400".
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error ?? body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `create failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteDeployment(id: string): Promise<void> {
  const res = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}
