import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import pino from "pino";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { deploymentsRoute } from "./routes/deployments.js";
import { logBroker } from "./logs/broker.js";
import { startWorker } from "./pipeline/queue.js";
import { reconcileOnBoot } from "./pipeline/reconcile.js";
import { waitForCaddy } from "./caddy/client.js";
import { assertDockerReachable } from "./docker/runner.js";

// pino-pretty is a dev nicety; in production it still prints JSON. We keep
// it on either way because this service mostly runs on a reviewer's laptop.
const log = pino({ transport: { target: "pino-pretty" } });

let ready = false;

const app = new Hono();
app.use("*", cors());
app.get("/api/health", (c) => {
  // `ok` is "process is responding". `ready` flips true only after the
  // boot sequence (docker/caddy probes, reconcile) succeeds. Compose /
  // curl can distinguish degraded-but-up from healthy.
  return c.json({ ok: true, ready });
});
app.route("/api/deployments", deploymentsRoute);

async function boot() {
  // 1. Prove hard deps exist before accepting work. Each check throws a
  //    human error; pino prints it and we exit non-zero so compose's
  //    `restart: unless-stopped` backs off instead of looping fast.
  try {
    await assertDockerReachable();
  } catch (err) {
    log.error({ err: (err as Error).message }, "docker unreachable — refusing to start");
    process.exit(1);
  }
  try {
    await waitForCaddy();
  } catch (err) {
    log.error({ err: (err as Error).message }, "caddy unreachable — refusing to start");
    process.exit(1);
  }

  // 2. Reconcile: fail orphan rows, kill orphan containers, drop stale
  //    caddy routes. Idempotent; safe to run on every clean boot.
  await reconcileOnBoot();

  startWorker();
  ready = true;
  log.info("boot complete — ready");
}

const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  log.info({ port }, "api listening");
});

boot().catch((err) => {
  log.error({ err }, "boot failed");
  process.exit(1);
});

const shutdown = () => {
  log.info("shutting down");
  logBroker.drain();
  server.close(() => process.exit(0));
  // Force-exit after 5s if a socket is wedged.
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
