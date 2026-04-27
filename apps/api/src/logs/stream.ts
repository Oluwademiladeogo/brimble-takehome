import { spawn, ChildProcess } from "node:child_process";
import { logBroker, LogPhase } from "./broker.js";

// Split a chunk into lines, carrying over any trailing partial line to the next
// chunk. A naive split('\n') loses the last fragment when it doesn't end in \n.
export function makeLineSplitter(onLine: (line: string) => void) {
  let carry = "";
  return {
    push(chunk: Buffer | string) {
      const text = carry + (typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      const parts = text.split(/\r?\n/);
      carry = parts.pop() ?? "";
      for (const p of parts) onLine(p);
    },
    end() {
      if (carry.length) onLine(carry);
      carry = "";
    },
  };
}

export interface RunOptions {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  deploymentId: string;
  phase: LogPhase;
}

export function runStreamed(opts: RunOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(opts.cmd, opts.args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      reject(err);
      return;
    }

    const out = makeLineSplitter((line) =>
      logBroker.append(opts.deploymentId, { ts: Date.now(), stream: "stdout", phase: opts.phase, line })
    );
    const err = makeLineSplitter((line) =>
      logBroker.append(opts.deploymentId, { ts: Date.now(), stream: "stderr", phase: opts.phase, line })
    );

    child.stdout!.on("data", (c: Buffer) => out.push(c));
    child.stderr!.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      out.end();
      err.end();
      resolve(code ?? 0);
    });
  });
}
