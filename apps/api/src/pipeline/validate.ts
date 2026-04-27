// Git URL validation. We only accept http(s) URLs pointing at a Git host.
// Rejects ssh://, git://, file://, javascript: and anything with shell
// metacharacters that could slip through simple-git into a spawn call.
//
// Exported so tests can hit it without reaching into the route.

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
// Characters that have no business in a URL and could indicate an attempt
// to smuggle shell tokens. simple-git doesn't go through a shell, but we
// still reject them — they're always wrong, and documenting the fail
// beats explaining the subtlety later.
const SHELL_METACHARS = /[`$\\;&|<>\n\r\t"'\s]/;

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateGitUrl(raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, reason: "gitUrl must be a string" };
  const url = raw.trim();
  if (!url) return { ok: false, reason: "gitUrl is required" };
  if (url.length > 512) return { ok: false, reason: "gitUrl too long (max 512)" };
  if (SHELL_METACHARS.test(url)) {
    return { ok: false, reason: "gitUrl contains invalid characters" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "gitUrl is not a valid URL" };
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `protocol ${parsed.protocol} not allowed — use http(s)` };
  }
  if (!parsed.hostname) return { ok: false, reason: "gitUrl missing hostname" };
  // Block obvious attempts to hit the host's own network.
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
    return { ok: false, reason: "gitUrl may not point at localhost" };
  }
  return { ok: true };
}

// Parse common Railpack / build errors into a short friendly message.
// Used so the UI can surface "no dockerfile detected" instead of the raw
// exit-code string. Returns null if no match — caller should fall through.
export function friendlyBuildError(raw: string): string | null {
  const s = raw.toLowerCase();
  if (s.includes("could not detect") || s.includes("no provider")) {
    return "Railpack could not detect a runtime for this repo. Add a Dockerfile, package.json, or a Railpack config.";
  }
  if (s.includes("authentication failed") || s.includes("could not read username")) {
    return "Git authentication failed. Only public repos are supported.";
  }
  if (s.includes("repository not found") || s.includes("not found") && s.includes("git")) {
    return "Git repo not found. Check the URL.";
  }
  if (s.includes("exit code 137") || s.includes("killed")) {
    return "Build ran out of memory. Try a smaller repo.";
  }
  return null;
}
