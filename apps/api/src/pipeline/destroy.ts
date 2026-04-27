import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { removeRoute } from "../caddy/client.js";
import { stopAndRemove } from "../docker/runner.js";
import { logSystem } from "../logs/broker.js";
import type { Deployment } from "../db/schema.js";

// Order matters: remove the Caddy route *before* stopping the container so
// no request ever lands on a dead upstream.
export async function destroy(row: Deployment) {
  logSystem(row.id, "runtime", "[destroy] removing caddy route");
  try {
    await removeRoute(row.id);
  } catch (err) {
    logSystem(row.id, "runtime", `[destroy] caddy remove failed: ${(err as Error).message}`);
  }
  if (row.containerId) {
    logSystem(row.id, "runtime", `[destroy] stopping container ${row.containerId.slice(0, 12)}`);
    await stopAndRemove(row.containerId);
  }
  db.delete(schema.deployments).where(eq(schema.deployments.id, row.id)).run();
}
