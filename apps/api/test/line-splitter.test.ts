import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLineSplitter } from "../src/logs/stream.js";

// These tests target the subtle case that ate an afternoon: chunked IO
// splits lines in the middle. Losing the carry-over is silent data loss.

test("line-splitter emits complete lines", () => {
  const got: string[] = [];
  const s = makeLineSplitter((l) => got.push(l));
  s.push("hello\nworld\n");
  assert.deepEqual(got, ["hello", "world"]);
});

test("line-splitter carries partial line across chunks", () => {
  const got: string[] = [];
  const s = makeLineSplitter((l) => got.push(l));
  s.push("hel");
  s.push("lo\nwor");
  s.push("ld\n");
  assert.deepEqual(got, ["hello", "world"]);
});

test("line-splitter handles \\r\\n (windows / tty)", () => {
  const got: string[] = [];
  const s = makeLineSplitter((l) => got.push(l));
  s.push("a\r\nb\r\nc");
  s.end();
  assert.deepEqual(got, ["a", "b", "c"]);
});

test("line-splitter flushes trailing partial on end()", () => {
  const got: string[] = [];
  const s = makeLineSplitter((l) => got.push(l));
  s.push("only-line-no-newline");
  s.end();
  assert.deepEqual(got, ["only-line-no-newline"]);
});

test("line-splitter emits nothing on end() with empty carry", () => {
  const got: string[] = [];
  const s = makeLineSplitter((l) => got.push(l));
  s.push("done\n");
  s.end();
  assert.deepEqual(got, ["done"]);
});
