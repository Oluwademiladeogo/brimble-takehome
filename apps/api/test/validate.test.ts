import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGitUrl, friendlyBuildError } from "../src/pipeline/validate.js";

test("validateGitUrl accepts https github", () => {
  assert.equal(validateGitUrl("https://github.com/user/repo").ok, true);
});

test("validateGitUrl accepts http", () => {
  assert.equal(validateGitUrl("http://gitea.example/foo.git").ok, true);
});

test("validateGitUrl rejects ssh://", () => {
  const r = validateGitUrl("ssh://git@github.com/foo");
  assert.equal(r.ok, false);
  assert.match(r.reason!, /protocol/);
});

test("validateGitUrl rejects file://", () => {
  assert.equal(validateGitUrl("file:///etc/passwd").ok, false);
});

test("validateGitUrl rejects localhost", () => {
  assert.equal(validateGitUrl("https://localhost/x").ok, false);
  assert.equal(validateGitUrl("https://127.0.0.1/x").ok, false);
});

test("validateGitUrl rejects shell metacharacters", () => {
  assert.equal(validateGitUrl("https://github.com/u/r; rm -rf /").ok, false);
  assert.equal(validateGitUrl("https://github.com/u/`whoami`").ok, false);
});

test("validateGitUrl rejects non-string and empty", () => {
  assert.equal(validateGitUrl(null).ok, false);
  assert.equal(validateGitUrl("").ok, false);
  assert.equal(validateGitUrl(123).ok, false);
});

test("validateGitUrl rejects too-long input", () => {
  assert.equal(validateGitUrl("https://github.com/" + "a".repeat(600)).ok, false);
});

test("friendlyBuildError maps no-provider", () => {
  const f = friendlyBuildError("Error: could not detect a provider for this repo");
  assert.match(f!, /Railpack could not detect/);
});

test("friendlyBuildError maps OOM", () => {
  assert.match(friendlyBuildError("process killed exit code 137")!, /out of memory/);
});

test("friendlyBuildError returns null when unknown", () => {
  assert.equal(friendlyBuildError("something weird happened"), null);
});
