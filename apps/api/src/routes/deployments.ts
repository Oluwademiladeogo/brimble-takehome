import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { and, desc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/index.js";
import { logBroker } from "../logs/broker.js";
import { enqueue, isActive } from "../pipeline/queue.js";
import { destroy } from "../pipeline/destroy.js";
import { validateGitUrl } from "../pipeline/validate.js";

export const deploymentsRoute = new Hono();

const createSchema = z.object({
  sourceType: z.literal("git"),
  gitUrl: z.string(),
  // Optional client-supplied key to make POST idempotent across double-clicks
  // and retries. If set within a short window, we return the existing row
  // instead of creating a new one.
  idempotencyKey: z.string().min(1).max(128).optional(),
});

const IDEMPOTENCY_WINDOW_MS = 60_000;

deploymentsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    // Flatten zod's nested error to a single string the UI can render
    // verbatim. The structured form is dev-noise; the user just needs to
    // know what to fix.
    const flat = parsed.error.flatten();
    const first =
      Object.entries(flat.fieldErrors)
        .map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)
        .join("; ") || flat.formErrors.join("; ") || "invalid request body";
    return c.json({ error: first }, 400);
  }

  // Stronger URL validation than zod's .url() — we also reject ssh/file/
  // localhost and shell metacharacters before anything is spawned.
  const urlCheck = validateGitUrl(parsed.data.gitUrl);
  if (!urlCheck.ok) return c.json({ error: urlCheck.reason }, 400);

  const now = Date.now();

  // Idempotency: resubmitting within the window returns the existing row.
  // Matches on sourceRef too, so the key can safely be reused across repos.
  if (parsed.data.idempotencyKey) {
    const since = now - IDEMPOTENCY_WINDOW_MS;
    const existing = db
      .select()
      .from(schema.deployments)
      .where(
        and(
          eq(schema.deployments.sourceRef, parsed.data.gitUrl),
          gt(schema.deployments.createdAt, since)
        )
      )
      .orderBy(desc(schema.deployments.createdAt))
      .get();
    if (existing) return c.json(existing, 200);
  }

  const id = nanoid(10);
  const row = {
    id,
    sourceType: "git",
    sourceRef: parsed.data.gitUrl,
    status: "pending",
    routePath: `/apps/${id}`,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.deployments).values(row).run();
  enqueue(id);
  return c.json(row, 201);
});

deploymentsRoute.get("/", (c) => {
  const rows = db
    .select()
    .from(schema.deployments)
    .orderBy(desc(schema.deployments.createdAt))
    .all();
  return c.json(rows);
});

deploymentsRoute.get(":id", (c) => {
  const row = db.select().from(schema.deployments).where(eq(schema.deployments.id, c.req.param("id"))).get();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

deploymentsRoute.delete(":id", async (c) => {
  const id = c.req.param("id");
  const row = db.select().from(schema.deployments).where(eq(schema.deployments.id, id)).get();
  // Already-gone is success — deletes must be idempotent. The UI should
  // never see a 404 for a row the user clicked delete on twice.
  if (!row) return c.json({ ok: true, alreadyGone: true });

  // Mid-pipeline delete: mark the row cancelled so the worker bails at the
  // next step boundary, then run the normal destroy (which is safe when
  // containers/routes don't exist yet).
  if (isActive(id)) {
    db.update(schema.deployments)
      .set({ status: "cancelled", updatedAt: Date.now() })
      .where(eq(schema.deployments.id, id))
      .run();
  }
  try {
    await destroy(row);
  } catch (err) {
    return c.json({ error: `destroy failed: ${(err as Error).message}` }, 500);
  }
  return c.json({ ok: true });
});

// SSE — replay persisted lines, then live-tail.
deploymentsRoute.get(":id/logs", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    const initial = db
      .select()
      .from(schema.deploymentLogs)
      .where(eq(schema.deploymentLogs.deploymentId, id))
      .all();
    for (const row of initial) {
      await stream.writeSSE({
        event: "log",
        data: JSON.stringify({ id: row.id, ts: row.ts, stream: row.stream, phase: row.phase, line: row.line }),
      });
    }

    const queue: any[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = logBroker.subscribe(id, (line) => {
      queue.push(line);
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    });

    c.req.raw.signal.addEventListener("abort", () => {
      unsubscribe();
      if (wake) wake();
    });

    // Heartbeat keeps intermediaries from closing the connection.
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: "ping", data: String(Date.now()) }).catch(() => {});
    }, 15000);

    try {
      while (!c.req.raw.signal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => (wake = resolve));
          continue;
        }
        const line = queue.shift()!;
        await stream.writeSSE({ event: "log", data: JSON.stringify(line) });
      }
    } finally {
      clearInterval(heartbeat);
      unsubscribe();
    }
  });
});
