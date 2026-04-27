import { EventEmitter } from "node:events";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { db, schema } from "../db/index.js";
import { config } from "../config.js";

mkdirSync(config.logsDir, { recursive: true });

export type LogStream = "stdout" | "stderr" | "system";
export type LogPhase = "clone" | "build" | "deploy" | "runtime";

export interface LogLine {
  id?: number;
  ts: number;
  stream: LogStream;
  phase: LogPhase;
  line: string;
}

// Hard cap on the in-memory flush buffer. Keeps a noisy build (think a
// gigabyte of npm install output) from eating the api's RSS if the DB
// write falls behind. Above the cap we drop the oldest rows and log a
// system line so the truncation is visible.
const MAX_BUFFER = 10_000;

// Soft cap per-line length. Most logs are under 4k; a 1MB single line is
// nearly always a runaway tool dumping binary.
const MAX_LINE_CHARS = 8 * 1024;

// One emitter per deployment. Subscribers receive live lines as they're
// produced; writes to the DB happen in small batches on a separate cadence so
// we don't block the fan-out on disk I/O.
class LogBroker {
  private emitter = new EventEmitter();
  private buffer: Array<{ deploymentId: string } & LogLine> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private ndjsonStreams = new Map<string, ReturnType<typeof createWriteStream>>();

  constructor() {
    // Subscriber ceiling per deployment. Prevents a misbehaving client (or
    // a test leaking event listeners) from triggering Node's default
    // max-listener warning and potentially keeping the emitter alive.
    this.emitter.setMaxListeners(64);
  }

  append(deploymentId: string, line: LogLine) {
    // Defensive: truncate long lines. A build that emits a 10MB single line
    // crashes the UI's JSON.parse and balloons SQLite rows.
    if (line.line.length > MAX_LINE_CHARS) {
      line = { ...line, line: line.line.slice(0, MAX_LINE_CHARS) + " …[truncated]" };
    }

    // Fan out first — the screen should update the instant a byte arrives.
    this.emitter.emit(`log:${deploymentId}`, line);

    if (this.buffer.length >= MAX_BUFFER) {
      // Drop the oldest half to recover. Surface the drop as a system line
      // so the user sees *why* logs may have a gap.
      const dropped = this.buffer.splice(0, Math.floor(MAX_BUFFER / 2));
      const note: LogLine = {
        ts: Date.now(),
        stream: "system",
        phase: "runtime",
        line: `[broker] buffer overflow — dropped ${dropped.length} pending log rows from DB write`,
      };
      this.emitter.emit(`log:${deploymentId}`, note);
    }

    this.buffer.push({ deploymentId, ...line });
    this.appendNdjson(deploymentId, line);
    this.scheduleFlush();
  }

  subscribe(deploymentId: string, handler: (line: LogLine) => void) {
    const channel = `log:${deploymentId}`;
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  // Test-only hooks. Not exported by the module index but useful for unit
  // tests that want to assert internal state without reaching into privates.
  _bufferSize() {
    return this.buffer.length;
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), 50);
    // 50ms is short enough that a human never notices but long enough to batch
    // a dozen lines during a busy build. Trade-off: on crash we lose up to 50ms
    // of logs from the DB — but the ndjson file got them synchronously.
  }

  private flush() {
    this.flushTimer = null;
    if (!this.buffer.length) return;
    const rows = this.buffer.splice(0, this.buffer.length);
    try {
      db.insert(schema.deploymentLogs).values(rows).run();
    } catch (err) {
      // Don't crash the api if SQLite chokes — surface it and carry on.
      // ndjson file still got the lines.
      this.emitter.emit(
        `log:${rows[0].deploymentId}`,
        {
          ts: Date.now(),
          stream: "system",
          phase: "runtime",
          line: `[broker] failed to persist logs: ${(err as Error).message}`,
        } satisfies LogLine
      );
    }
  }

  private appendNdjson(deploymentId: string, line: LogLine) {
    let stream = this.ndjsonStreams.get(deploymentId);
    if (!stream) {
      stream = createWriteStream(join(config.logsDir, `${deploymentId}.ndjson`), { flags: "a" });
      this.ndjsonStreams.set(deploymentId, stream);
    }
    stream.write(JSON.stringify(line) + "\n");
  }

  // Called on graceful shutdown so nothing is lost.
  drain() {
    this.flush();
    for (const stream of this.ndjsonStreams.values()) stream.end();
  }
}

export const logBroker = new LogBroker();

// Convenience for pipeline code.
export function logSystem(deploymentId: string, phase: LogPhase, line: string) {
  logBroker.append(deploymentId, { ts: Date.now(), stream: "system", phase, line });
}
