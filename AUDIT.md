# Audit — 2026-04-24

This is internal. Read it before submitting. It exists because you asked me to be your last eyes and to be strict. I am being strict.

## Verdict

**Borderline pass → clear pass IF you do the Brimble deploy.** The engineering is genuinely strong. The submission is at risk on exactly one axis: the Brimble feedback section is a placeholder, and the brief explicitly says "Candidates who skip this or give empty feedback lose points." It's 5% of the score weight, but it also signals seriousness — they will read it carefully. Without it: probably a 3.5/5. With it (real, specific, written live): a 4.5/5 in my honest read.

The take-home is graded out of 5 weighted dimensions. On a clean reboot today I verified the hard requirements pass: `docker compose up` boots all 4 services healthy, the SSE stream delivers log events DURING the BuildKit run (not post-hoc), and a real Git URL deploys to a live `Hello World!` in ~3 min cold cache. There is enough quality and care here to score above the line — but only if you ship the Brimble deploy.

## What I changed in this audit pass

- `apps/api/src/routes/deployments.ts:28-35` — normalized zod 400 responses to a single readable string instead of a nested object. UI now shows "gitUrl: expected string, received undefined" not a JSON dump.
- `apps/web/src/lib/api.ts:31-43` — `createDeployment` now accepts an optional `idempotencyKey` and forwards it to the api.
- `apps/web/src/components/DeployForm.tsx:13-22` — generates a fresh `crypto.randomUUID()` idempotency key per submit attempt. Double-clicks no longer create two rows.
- `README.md` — replaced the Loom placeholder with a real curl-driven walkthrough since you're skipping the Loom. The README now carries the demo. Strengthened the Brimble-feedback placeholder so it's clear what to fill in.
- `docs/NOTEBOOK.md` — rewrote the Brimble-deploy friction log as 8 numbered beats with specific time/observation prompts. Filling it in honestly will produce a feedback section the reviewer can grade as 5/5.

## Hard requirement status

| Hard req | Status | Evidence |
|---|---|---|
| `docker compose up` runs end-to-end on a clean machine | ✅ verified today | clean-volume teardown, fresh data dir, all 4 services healthy in <30s |
| Live log streaming during build | ✅ verified today | SSE delivered build-phase log events 3+ times in the first 5s window of an active BuildKit run; total 359 lines replayed on terminal reconnect |
| Brimble self-deploy + honest feedback | ❌ not done | requires you. Plan + friction log ready in `docs/NOTEBOOK.md`. **This is the one thing that could sink the submission.** |

## Things you MUST do before submission (in this order)

1. **Push `sample-app/` to a fresh public GitHub repo.** That's what you'll point Brimble at. Keep the README.
2. **Deploy it on Brimble.** Fill `docs/NOTEBOOK.md` LIVE — every beat. Don't reconstruct. Aim for ~30 minutes; the brief explicitly says DM @pipe_dev if you're stuck and that doesn't count against you.
3. **After deploying, distill 4–6 specific friction points into the README's "Brimble deploy + feedback" section.** No politeness hedging. Reference the live URL. Keep them concrete (page name, action, what you expected vs got).
4. **Init this repo as a git repo, push to a public GitHub.** The submission asks for a public repo URL.
5. **Fill in `Rough time` in README** (line `_[filled in at submission]_`). Honest number.
6. **Final smoke before submission**: `docker compose down -v && rm -rf data && mkdir data && docker compose up --build`. Watch all 4 services go healthy. Submit one deployment via the UI, click into the log pane, watch it stream, click the live URL. If that all works, you're done.

## Things you can ship without addressing

- **Component tests for the React UI.** None exist; the brief explicitly says coverage of trivial code isn't graded. The 27 api unit tests cover the failure-prone seams.
- **The `LOGS_DIR` env var isn't in the README env table.** It defaults sanely. Fix if you want completeness, ignore if you don't.
- **The log pane is fixed `h-96`** (24rem). It's fine on a 1080p monitor; on a 4K monitor it looks small. Cosmetic.
- **No favicon.** The browser tab shows a default. Cosmetic.
- **Polling deployments every 2s instead of SSE-ing the list.** The brief said one SSE stream is enough; polling for the list is normal and fine.
- **No retry/backoff on the queue.** A failed deploy stays failed unless the user resubmits. Documented in TRADEOFFS as future work.

## Production-readiness scoring (1–5)

| Axis | Score | Why |
|---|---|---|
| Error handling & failure visibility | **5** | Every pipeline step writes a system log line on entry/exit, every catch surfaces to the broker, friendly-error mapper translates Railpack's "could not detect a provider" into actionable text, the frontend renders row-level error inline + log-pane stream + connection-state indicator. Nothing fails silently. |
| Edge cases | **4** | Tested + handled: bad git URL, localhost/ssh/file/shell metas, oversized URL, empty/invalid JSON, double-click, concurrent submits, mid-build cancel, api restart mid-pipeline, SSE reconnect-replay. Not handled: deployed container that crashes 2s after start (status stays `running`, surfaces 502; documented in STUDY.md as the killer interview question). |
| Cost / resource awareness | **4** | Log buffer hard-capped at 10K rows w/ overflow drop notice, per-line cap at 8KB, ndjson + DB dual-write batched on 50ms, BuildKit layer cache via dedicated volume, deployed-container Memory + PidsLimit caps. Could be 5 with cache-reuse-on-redeploy and SSE for the deployments list. |
| Unbreakable / idempotent | **5** | POST is idempotent via key (form auto-generates), DELETE is idempotent on missing rows, boot-time reconcile sweeps orphan rows + containers + Caddy routes, mid-build cancel cleans partial state. Re-running the same flow doesn't corrupt state. |
| Security | **4** | URL validator rejects ssh/file/localhost/loopback/IPv6-loopback/shell-metas before clone, Caddy admin bound to loopback only on host, container Memory + PidsLimit caps, Docker socket caveat documented prominently in README + compose. The socket mount itself is the unfixable-without-major-rework item — would be 5 with a `tecnativa/docker-socket-proxy` allowlist. |

Honest aggregate: **4.4 / 5** on production readiness. That's "Proficient → Excellent" on the rubric, exactly the bar that takes "demo" to "production-ready system."

## My honest read

The code is in genuinely good shape. There are real engineering decisions, real tests, real edge-case handling, and a lockstep pipeline state machine that survives restarts and cancels. The walkthrough in the README does the demo job a Loom would do — and any reviewer who actually runs the curl commands will be impressed within 90 seconds.

The thing that worries me is not the code. It's that the brief weights Brimble feedback at 5% but signals it weighs more than that culturally — they'll absolutely notice an empty section. Their note "candidates who skip this lose points" is a red flag, not a hint. **Don't ship without it.**

If you do the Brimble deploy honestly and the friction log is written live (not reconstructed), this submission scores in the top tier. If you skip it, you lose the bonus AND you signal you didn't take the brief seriously, which is worse than the missed 5%.

One last thing: the brief says they value "code structured like you'd want to maintain it in six months — not like a hackathon." The code passes that bar. The README does too. Don't second-guess the engineering. Ship it after the deploy.

— audit done. Good luck.
