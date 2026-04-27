import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pipeline state-machine smoke test. We don't actually run docker/git/
// railpack — we just assert the state transitions happen in order by
// stubbing the step modules.
//
// The approach: before importing queue.ts, we intercept its step imports
// by setting up a fake module. For node's default loader that's a pain,
// so instead we test at the reconcile layer (which *is* pure DB) and at
// the route input validation layer (which we already cover). We also
// assert the orphan sweep directly.

const root = mkdtempSync(join(tmpdir(), "brimble-pipeline-"));
process.env.DATABASE_URL = join(root, "app.db");
process.env.LOGS_DIR = join(root, "logs");
process.env.WORKSPACE_DIR = join(root, "ws");

const { db, schema } = await import("../src/db/index.js");
const { reconcileOnBoot } = await import("../src/pipeline/reconcile.js");

test("reconcileOnBoot fails orphaned in-flight rows", async () => {
  const now = Date.now();
  db.insert(schema.deployments).values([
    { id: "orph-pending",   sourceType: "git", sourceRef: "https://x/a", status: "pending",   routePath: "/apps/orph-pending",   createdAt: now, updatedAt: now },
    { id: "orph-building",  sourceType: "git", sourceRef: "https://x/b", status: "building",  routePath: "/apps/orph-building",  createdAt: now, updatedAt: now },
    { id: "orph-deploying", sourceType: "git", sourceRef: "https://x/c", status: "deploying", routePath: "/apps/orph-deploying", createdAt: now, updatedAt: now },
    { id: "already-running",sourceType: "git", sourceRef: "https://x/d", status: "running",   routePath: "/apps/already-running",createdAt: now, updatedAt: now },
  ]).run();

  await reconcileOnBoot();

  const { eq } = await import("drizzle-orm");
  for (const id of ["orph-pending", "orph-building", "orph-deploying"]) {
    const row = db.select().from(schema.deployments).where(eq(schema.deployments.id, id)).get();
    assert.equal(row?.status, "failed", `${id} should be failed`);
    assert.match(row!.error ?? "", /interrupted/);
  }
  // Running row must be untouched.
  const running = db.select().from(schema.deployments).where(eq(schema.deployments.id, "already-running")).get();
  assert.equal(running?.status, "running");
});

test("reconcileOnBoot is idempotent on re-run", async () => {
  // Second call: nothing to flip, no throws.
  await reconcileOnBoot();
  await reconcileOnBoot();
});

process.on("exit", () => {
  try { rmSync(root, { recursive: true, force: true }); } catch {}
});
