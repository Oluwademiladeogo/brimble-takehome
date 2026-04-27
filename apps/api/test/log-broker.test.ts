import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate test-db path so the real app.db isn't touched.
const root = mkdtempSync(join(tmpdir(), "brimble-broker-"));
process.env.DATABASE_URL = join(root, "app.db");
process.env.LOGS_DIR = join(root, "logs");
process.env.WORKSPACE_DIR = join(root, "ws");

// Dynamically import *after* env is set.
const { logBroker } = await import("../src/logs/broker.js");
const { db, schema } = await import("../src/db/index.js");

test("fan-out: both subscribers receive each line", async () => {
  const depId = "fanout-1";
  const a: string[] = [];
  const b: string[] = [];
  const unA = logBroker.subscribe(depId, (l) => a.push(l.line));
  const unB = logBroker.subscribe(depId, (l) => b.push(l.line));

  logBroker.append(depId, { ts: 1, stream: "stdout", phase: "build", line: "one" });
  logBroker.append(depId, { ts: 2, stream: "stdout", phase: "build", line: "two" });

  unA();
  unB();
  assert.deepEqual(a, ["one", "two"]);
  assert.deepEqual(b, ["one", "two"]);
});

test("unsubscribe stops delivery", () => {
  const depId = "fanout-2";
  const got: string[] = [];
  const un = logBroker.subscribe(depId, (l) => got.push(l.line));
  logBroker.append(depId, { ts: 1, stream: "stdout", phase: "build", line: "before" });
  un();
  logBroker.append(depId, { ts: 2, stream: "stdout", phase: "build", line: "after" });
  assert.deepEqual(got, ["before"]);
});

test("ndjson flush writes one line per append", async () => {
  const depId = "ndjson-1";
  logBroker.append(depId, { ts: 1, stream: "stdout", phase: "build", line: "x" });
  logBroker.append(depId, { ts: 2, stream: "stderr", phase: "build", line: "y" });
  // Let fs flush.
  await new Promise((r) => setTimeout(r, 50));
  const path = join(process.env.LOGS_DIR!, `${depId}.ndjson`);
  assert.ok(existsSync(path), "ndjson file exists");
  const contents = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(contents.length, 2);
  const row0 = JSON.parse(contents[0]);
  assert.equal(row0.line, "x");
  assert.equal(row0.stream, "stdout");
});

test("drain persists buffered rows to DB", async () => {
  const depId = "persist-1";
  logBroker.append(depId, { ts: 1, stream: "stdout", phase: "build", line: "p1" });
  logBroker.append(depId, { ts: 2, stream: "stdout", phase: "build", line: "p2" });
  logBroker.drain();
  const { eq } = await import("drizzle-orm");
  const rows = db.select().from(schema.deploymentLogs).where(eq(schema.deploymentLogs.deploymentId, depId)).all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].line, "p1");
});

test("truncates very long single lines", () => {
  const depId = "long-1";
  const got: string[] = [];
  const un = logBroker.subscribe(depId, (l) => got.push(l.line));
  const big = "a".repeat(20 * 1024);
  logBroker.append(depId, { ts: 1, stream: "stdout", phase: "build", line: big });
  un();
  assert.ok(got[0].length < big.length);
  assert.match(got[0], /truncated/);
});

process.on("exit", () => {
  try { rmSync(root, { recursive: true, force: true }); } catch {}
});
