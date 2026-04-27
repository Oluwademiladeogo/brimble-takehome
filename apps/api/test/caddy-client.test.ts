import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// We want to verify the JSON shape and HTTP verb/path that the caddy client
// sends. Spin up a tiny HTTP server, point CADDY_ADMIN at it, capture the
// request.

interface Captured {
  method?: string;
  path?: string;
  body?: unknown;
}

async function withMockCaddy<T>(handler: (captured: Captured, origin: string) => Promise<T>): Promise<T> {
  const captured: Captured = {};
  const server = createServer((req, res) => {
    captured.method = req.method;
    captured.path = req.url;
    let chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      captured.body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : undefined;
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    return await handler(captured, `http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test("addRoute puts at /config/apps/http/servers/srv0/routes/0 with correct JSON shape", async () => {
  await withMockCaddy(async (captured, origin) => {
    process.env.CADDY_ADMIN = origin;
    // Dynamic import AFTER env is set so config picks it up.
    const mod = await import("../src/caddy/client.js");
    await mod.addRoute({ deploymentId: "abc123", upstream: "deploy-abc123:3000" });

    assert.equal(captured.method, "PUT");
    assert.equal(captured.path, "/config/apps/http/servers/srv0/routes/0");

    const body = captured.body as any;
    assert.equal(body["@id"], "dep:abc123");
    assert.deepEqual(body.match, [{ path: ["/apps/abc123/*"] }]);
    const sub = body.handle[0];
    assert.equal(sub.handler, "subroute");
    const rewrite = sub.routes[0].handle[0];
    assert.equal(rewrite.handler, "rewrite");
    assert.equal(rewrite.strip_path_prefix, "/apps/abc123");
    const proxy = sub.routes[1].handle[0];
    assert.equal(proxy.handler, "reverse_proxy");
    assert.deepEqual(proxy.upstreams, [{ dial: "deploy-abc123:3000" }]);
    assert.equal(proxy.flush_interval, -1);
  });
});

test("removeRoute DELETEs /id/dep:<id>", async () => {
  await withMockCaddy(async (captured, origin) => {
    process.env.CADDY_ADMIN = origin;
    const mod = await import("../src/caddy/client.js");
    await mod.removeRoute("xyz789");
    assert.equal(captured.method, "DELETE");
    assert.equal(captured.path, "/id/dep:xyz789");
  });
});

test("removeRoute tolerates 404", async () => {
  const server = createServer((req, res) => {
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  process.env.CADDY_ADMIN = `http://127.0.0.1:${port}`;
  try {
    const mod = await import("../src/caddy/client.js");
    // Should not throw.
    await mod.removeRoute("missing");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("waitForCaddy resolves when /config/ returns 200", async () => {
  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    if (hits < 3) {
      res.writeHead(503); res.end();
    } else {
      res.writeHead(200, { "content-type": "application/json" }); res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  process.env.CADDY_ADMIN = `http://127.0.0.1:${port}`;
  try {
    const mod = await import("../src/caddy/client.js");
    await mod.waitForCaddy(5_000, 50);
    assert.ok(hits >= 3);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
