import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createDeployment } from "../lib/api";

// A known-good tiny node repo. Clicking "try sample" fills it in so a
// first-time user has a one-click happy path and isn't stuck guessing
// what URL to paste.
const SAMPLE_URL = "https://github.com/heroku/node-js-sample";

export function DeployForm() {
  const [gitUrl, setGitUrl] = useState("");
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (url: string) => {
      // Generate an idempotency key per submit attempt. If the user
      // double-clicks Deploy or the request is retried by the browser,
      // the api dedupes on (url + key) within 60s and returns the same row.
      const key = `ui-${crypto.randomUUID()}`;
      return createDeployment(url, key);
    },
    onSuccess: () => {
      setGitUrl("");
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  });

  const errorMessage = m.error
    ? extractError((m.error as Error).message)
    : null;

  return (
    <form
      className="bg-white rounded-lg border border-slate-200 p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (gitUrl.trim()) m.mutate(gitUrl.trim());
      }}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-700">Git URL</label>
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => setGitUrl(SAMPLE_URL)}
            disabled={m.isPending}
          >
            try sample repo
          </button>
        </div>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="https://github.com/user/repo"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          disabled={m.isPending}
        />
        <p className="mt-1 text-xs text-slate-500">
          Public HTTPS Git URL. Railpack will auto-detect the runtime.
        </p>
      </div>
      <button
        type="submit"
        disabled={m.isPending || !gitUrl.trim()}
        className="w-full inline-flex justify-center rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-50"
      >
        {m.isPending ? "Submitting…" : "Deploy"}
      </button>
      {errorMessage && <p className="text-xs text-rose-600">{errorMessage}</p>}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none">Status legend</summary>
        <ul className="mt-2 space-y-0.5 pl-4 list-disc">
          <li><b>pending</b> — queued, about to start</li>
          <li><b>building</b> — cloning + Railpack building the image</li>
          <li><b>deploying</b> — starting the container, wiring Caddy</li>
          <li><b>running</b> — live, click "open" to view</li>
          <li><b>failed</b> — check the log pane for the hint line</li>
        </ul>
      </details>
    </form>
  );
}

// The fetch error text includes the HTTP status. Try to pull the body's
// error out of a 400 response so the user sees "localhost not allowed"
// instead of "create failed: 400".
function extractError(msg: string): string {
  return msg.replace(/^create failed: \d+\s*/, "") || msg;
}
