# Brimble Take-Home — Mini Deployment Pipeline

A one-page app that deploys containerized apps end-to-end: paste a Git URL (or upload a zip) → Railpack builds an image → Docker runs it → Caddy routes to it → logs stream live to the UI. Boots with a single `docker compose up`.

## TL;DR

```bash
git clone <this repo>
cd brimble-takehome
docker compose up --build
# open http://localhost/
```

No accounts, no env files, no prereqs beyond Docker 24+ (Compose v2 built-in). On first load, click **"try sample repo"** in the form — it fills in a known-good URL so you can hit Deploy and watch the pipeline go through `pending → building → deploying → running`. When it's green, click "open" to see the live container.

### Prereqs

- **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose v2** (Linux), running.
- Ports `80` and `127.0.0.1:2019` free on the host.
- If Docker isn't running the api container will exit immediately with a loud "Docker daemon not reachable" message.

### Security — READ BEFORE EXPOSING

This stack is designed for a reviewer's laptop on **localhost only**. The api container mounts the host Docker socket, which gives it root on the host. Do **not** bind this compose stack to a public IP without putting a socket proxy (e.g. `tecnativa/docker-socket-proxy`) in front of the socket and adding auth to the api. See `docs/TRADEOFFS.md` for the prod gap.

The api refuses to clone `localhost`, `127.0.0.1`, `::1`, `file://`, `ssh://`, and URLs containing shell metacharacters, so a malicious submitter can't pivot into the host network via a bad Git URL — but that's table stakes, not sufficient.

## Architecture

```
  Browser
    │
    ▼
  Caddy (:80, admin on :2019)
   ├─► Web (Vite + TanStack, served by nginx)
   ├─► API (Hono on Node)  ◄── SSE for logs
   └─► Deployed app containers (per-deployment /apps/<id>/*)

  API ──dockerode/socket──► Docker daemon
  API ──railpack CLI──────► Image build
  API ──admin API (HTTP)──► Caddy (inject/remove routes)
  API ──better-sqlite3────► ./data/app.db
```

Three services in compose: **web**, **api**, **caddy**. The API mounts the host Docker socket and spawns deployed-app containers onto the shared `brimble-net` network so Caddy can reach them by name. Per-deployment Caddy routes are injected at runtime via the admin API — no reloads, no file writes.

## The pipeline

1. `pending` — row created, job enqueued.
2. `building` — repo cloned (or upload extracted), Railpack builds `brimble-deploy/<id>:<sha>`, stdout/stderr streamed to the log broker.
3. `deploying` — free port picked, `docker run -d` starts the container on `brimble-net`.
4. `running` — Caddy route `/apps/<id>/*` prepended to the config (prepended, so it matches before the catch-all). Live URL is `http://localhost/apps/<id>/`.
5. `failed` — any step's error unwinds partial Caddy state and records the error on the row.

Logs: broker fans out to SSE subscribers *and* persists to SQLite (+ an ndjson file per deployment for host-side debugging). On SSE connect, we replay persisted lines then live-tail.

## Walkthrough — paste this and watch it work

I skipped the Loom because copy-paste evidence travels better than my voice does. Run these against a fresh `docker compose up`.

```bash
# 1. health
curl -s http://localhost/api/health
# → {"ok":true,"ready":true}

# 2. submit a deploy
ID=$(curl -s -X POST http://localhost/api/deployments \
  -H 'content-type: application/json' \
  -d '{"sourceType":"git","gitUrl":"https://github.com/heroku/node-js-sample"}' \
  | jq -r .id)
echo "id=$ID"

# 3. watch logs LIVE during the build (this is the hard requirement —
#    note the timestamps move as bytes arrive, not in one dump at the end)
curl -sN http://localhost/api/deployments/$ID/logs --max-time 10

# 4. poll status
watch -n2 "curl -s http://localhost/api/deployments/$ID | jq '.status, .error'"

# 5. once status=running, hit the live URL
curl -s http://localhost/apps/$ID/
# → Hello World!

# 6. failure path — bad URL fails fast with a friendly message
curl -s -X POST http://localhost/api/deployments \
  -H 'content-type: application/json' \
  -d '{"sourceType":"git","gitUrl":"https://github.com/this-cannot/exist-brimble"}'
# → row created; row.error becomes "Git authentication failed. Only public repos are supported."

# 7. delete cleans container + caddy route in one call
curl -s -X DELETE http://localhost/api/deployments/$ID
curl -s -o /dev/null -w "caddy after delete: %{http_code}\n" http://127.0.0.1:2019/id/dep:$ID
# → caddy after delete: 404
```

If you'd rather click than curl, open `http://localhost/` and use the form. There's a "try sample repo" button that pre-fills the same URL.

## Docs

- `docs/REASONING.md` — why I picked what I picked (Hono, SSE, SQLite, DooD, path routing, Tailwind). Each decision with the alternative I rejected.
- `docs/TRADEOFFS.md` — what I gave up and the prod gap (12 things I'd add before this could face real users).
- `docs/STUDY.md` — what I'll have cold for the founder call. Includes the "container crashes 2s after `docker run`" answer.
- `docs/SLIDES.md` — written walkthrough I'd narrate over if I were doing the Loom (kept the structure for the founder call).
- `docs/NOTEBOOK.md` — dated engineer's journal. Bugs I hit, what I tried, the Brimble-deploy friction log written live.

## Env vars (all optional — defaults work)

| Var | Default | What |
|---|---|---|
| `DATABASE_URL` | `/data/app.db` | SQLite file path inside the api container |
| `CADDY_ADMIN` | `http://caddy:2019` | Caddy admin API URL |
| `WORKSPACE_DIR` | `/data/workspaces` | Clone/upload scratch dir |
| `DEPLOY_NETWORK` | `brimble-net` | Network deployed containers join |
| `PORT` | `3000` | API listen port |

## Troubleshooting

- **"Docker daemon not reachable"** in api logs → Docker Desktop isn't running, or the socket mount failed. On macOS make sure Docker Desktop is started before `docker compose up`.
- **Caddy returns 502 when visiting `/apps/<id>/`** → the deployed container exited after start. Click the row to see the runtime logs (they stream from the broker even after the process died because we persist to SQLite).
- **Build fails with "could not detect a provider"** → the repo has no Railpack signal (no `package.json`, no `Dockerfile`, etc). The UI surfaces a friendly hint line.
- **Port 80 already in use** → another service on your host is listening. Stop it or edit the `80:80` map in `docker-compose.yml`.
- **Resetting state**: `docker compose down -v && rm -rf data/` wipes the DB, workspaces, and Caddy's stored config.

## Tests

```bash
pnpm install
pnpm test              # 27 unit tests via node --test (api only)
```

Covered: URL validator + friendly error mapper, log broker (fan-out, persistence, ndjson, truncation, overflow drop, drain), line splitter (CRLF, partial carry), Caddy client (JSON shape, 404 tolerance, startup wait), pipeline state transitions and boot-time reconcile.

## Verified end-to-end

Last run 2026-04-24 on Docker Desktop 28.5.1 (macOS):

- `docker compose up --build` brings up caddy, buildkit, api, web — all healthy
- Submitting `https://github.com/heroku/node-js-sample` goes pending → building → running in ~38s (warm cache, ~90s cold). Live URL returns `Hello World!`
- Log stream is live during the build (SSE event arrives for every BuildKit step before the build exits)
- Bad git URL fails in 5s with friendly "Git authentication failed. Only public repos are supported." No stale Caddy route left behind
- Localhost/ssh/file URLs are rejected pre-clone with 400 + reason

## With another weekend

- A container-events watcher that flips status to `failed` when a deployed container dies shortly after start.
- BullMQ + Redis as a real job queue with retries/backoff.
- Socket-proxy (tecnativa/docker-socket-proxy) in front of the Docker socket with a strict allowlist.
- Blue/green redeploys — start new container, health-check, swap Caddy upstream, then kill old.
- Build-cache reuse across deploys via Railpack's layer cache + a persistent cache volume.
- `/metrics` and a tiny Grafana service for observability.

## Would rip out

- The ndjson log files — nice for debugging but redundant with SQLite.
- The fallback-to-port-3000 assumption — I'd require Railpack metadata instead.

## Rough time

_[filled in at submission]_

## Brimble deploy + feedback

**Deployed:** _[live URL — paste after deploying `sample-app/` to Brimble]_

_Write the feedback below directly. Specific. Direct. Don't soften._

The brief said the polite version isn't what they want — they want what I'd say to a teammate. So: the deploy experience was [adjective]. Specifically:

- _[friction point 1 — what page, what action, what you expected, what happened. e.g. "On the project-create screen I clicked the GitHub button and got redirected to a blank page for ~3s before the OAuth screen showed."]_
- _[friction point 2]_
- _[friction point 3]_

What I'd change:

- _[change 1 — concrete; e.g. "the build-log pane buffered for ~6s at the start of every build before any output showed; even a 'starting builder…' system line would tell me the request landed."]_
- _[change 2]_
- _[anything else]_

What worked: _[1–2 lines on what was good — be specific. Honesty cuts both ways.]_

Full friction log written live during the deploy is in `docs/NOTEBOOK.md` under "Brimble deploy — friction log". This summary distills it.

