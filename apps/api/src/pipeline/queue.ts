import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { logSystem } from "../logs/broker.js";
import { clone, railpackBuild } from "./steps.js";
import { config } from "../config.js";
import { imageExposedPort, runContainer, stopAndRemove, removeByName } from "../docker/runner.js";
import { addRoute, removeRoute } from "../caddy/client.js";
import { friendlyBuildError } from "./validate.js";

// Single in-process queue. Concurrency = 1 on purpose — see REASONING.md.
const pending: string[] = [];
let running = false;
let currentId: string | null = null;

export function enqueue(deploymentId: string) {
  pending.push(deploymentId);
  pump();
}

export function isActive(deploymentId: string): boolean {
  return currentId === deploymentId || pending.includes(deploymentId);
}

export function startWorker() {
  // Nothing to do — we pump on every enqueue. Export exists so index.ts can
  // make the "I'm starting the worker" intent explicit.
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const id = pending.shift()!;
      currentId = id;
      await processDeployment(id).catch((err) => {
        logSystem(id, "runtime", `[pipeline] uncaught: ${(err as Error).message}`);
      });
      currentId = null;
    }
  } finally {
    running = false;
  }
}

function setStatus(id: string, patch: Partial<typeof schema.deployments.$inferInsert>) {
  db.update(schema.deployments)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.deployments.id, id))
    .run();
}

function isCancelled(id: string): boolean {
  const row = db.select().from(schema.deployments).where(eq(schema.deployments.id, id)).get();
  return !row || row.status === "cancelled";
}

async function processDeployment(id: string) {
  const row = db.select().from(schema.deployments).where(eq(schema.deployments.id, id)).get();
  if (!row) return;
  // Already cancelled before we got to it (user deleted while queued).
  if (row.status === "cancelled") {
    logSystem(id, "runtime", "[pipeline] skipped — cancelled before start");
    return;
  }

  try {
    // 1. clone
    setStatus(id, { status: "building" });
    const { dir, sha } = await clone(id, row.sourceRef);
    if (isCancelled(id)) throw new Error("cancelled");
    // Docker image refs must be lowercase. Nanoid alphabet includes
    // uppercase by default, so normalize here rather than at id-generation
    // time (the row id stays as-generated for URL/query consistency).
    const imageTag = `${config.imageNamespace}/${id.toLowerCase()}:${sha.slice(0, 12)}`;
    setStatus(id, { commitSha: sha, imageTag });

    // 2. build
    await railpackBuild(id, dir, imageTag);
    if (isCancelled(id)) throw new Error("cancelled");

    // 3. deploy
    setStatus(id, { status: "deploying" });
    const detectedPort = await imageExposedPort(imageTag);
    const containerPort = detectedPort ?? config.fallbackContainerPort;
    if (!detectedPort) {
      logSystem(id, "deploy", `[deploy] no EXPOSE in image; falling back to port ${containerPort}`);
    }
    // Container name collisions: if a previous run crashed between create
    // and DB-write, the name is orphaned. Clean best-effort before creating.
    await removeByName(`deploy-${id}`).catch(() => {});
    const { containerId, hostname } = await runContainer({ deploymentId: id, imageTag, containerPort });
    setStatus(id, { containerId, containerPort });

    // 4. register caddy route
    await addRoute({ deploymentId: id, upstream: `${hostname}:${containerPort}` });

    // 5. running
    setStatus(id, { status: "running" });
    logSystem(id, "runtime", `[pipeline] live at /apps/${id}/`);
  } catch (err) {
    const message = (err as Error).message;
    // Cancellation is an expected state, not a failure. Destroy cleans the
    // rest; don't overwrite status here.
    if (message === "cancelled") {
      logSystem(id, "runtime", "[pipeline] cancelled mid-run");
    } else {
      const friendly = friendlyBuildError(message);
      logSystem(id, "runtime", `[pipeline] failed: ${message}`);
      if (friendly) logSystem(id, "runtime", `[hint] ${friendly}`);
      setStatus(id, { status: "failed", error: friendly ?? message });
    }

    // Best-effort rollback of any partial state. Safe to call even if we
    // never got that far — removeRoute is 404-tolerant, stopAndRemove
    // swallows errors on missing containers.
    const latest = db.select().from(schema.deployments).where(eq(schema.deployments.id, id)).get();
    if (latest?.containerId) await stopAndRemove(latest.containerId).catch(() => {});
    await removeRoute(id).catch(() => {});
    await removeByName(`deploy-${id}`).catch(() => {});
  }
}
