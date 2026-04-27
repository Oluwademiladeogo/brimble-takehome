import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { logSystem } from "../logs/broker.js";
import { listDeployContainers, stopAndRemove } from "../docker/runner.js";
import { removeRoute } from "../caddy/client.js";

// Startup reconciliation. Called once after the DB is ready and Caddy admin
// is reachable. Three jobs:
//
//   1. Mark any deployment that was mid-pipeline at shutdown as failed.
//      (The worker that was building it is dead.)
//   2. Kill containers with our `brimble.deployment` label whose row is
//      gone or whose row is in a non-running state.
//   3. Remove Caddy routes for deployments whose row is gone or failed.
//
// This is safe to run every boot — all operations are idempotent, and the
// "no-op" case is cheap (one DB query, one docker list, best-effort DELETEs).

export async function reconcileOnBoot() {
  // 1. Orphaned in-flight rows.
  const orphans = db
    .select()
    .from(schema.deployments)
    .where(inArray(schema.deployments.status, ["pending", "building", "deploying"]))
    .all();
  for (const o of orphans) {
    db.update(schema.deployments)
      .set({ status: "failed", error: "interrupted by api restart", updatedAt: Date.now() })
      .where(eq(schema.deployments.id, o.id))
      .run();
    logSystem(o.id, "runtime", "[reconcile] marked failed — api restart interrupted pipeline");
  }

  // 2. Container reconcile. Best-effort — docker might be unreachable on a
  // dev machine, in which case we swallow and move on.
  try {
    const containers = await listDeployContainers();
    for (const c of containers) {
      const depId = c.deploymentId;
      if (!depId) continue;
      const row = db.select().from(schema.deployments).where(eq(schema.deployments.id, depId)).get();
      const shouldRun = row && row.status === "running";
      if (!shouldRun) {
        await stopAndRemove(c.id).catch(() => {});
        logSystem(depId, "runtime", `[reconcile] removed orphan container ${c.name}`);
      }
    }
  } catch {
    // docker not reachable at boot — the assertDockerReachable check will
    // have already logged something; don't double-log here.
  }

  // 3. Caddy route reconcile. We don't know the full route set without
  // parsing the config; cheapest thing is to issue a DELETE for every row
  // that isn't `running`. DELETE on a nonexistent @id is 404-tolerant.
  const nonRunning = db
    .select()
    .from(schema.deployments)
    .where(inArray(schema.deployments.status, ["failed", "cancelled"]))
    .all();
  for (const r of nonRunning) {
    await removeRoute(r.id).catch(() => {});
  }
}
