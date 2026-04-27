# Why I picked what I picked

I try to write this down because "it felt right" isn't an answer I want to give a founder at 9pm on a call. If something here reads dogmatic, it's shorthand — I don't actually think any of these are the One True Way.

## Hono for the API

I wanted SSE without fighting the framework. Hono ships a `streamSSE` helper that handles the `Content-Type`, flushing, and abort signals in ~15 lines of usage. Fastify needs a plugin and Express wants me to write raw headers. The rest of Hono (routing, zod integration, middleware) is tiny and typed. I've also just read more of Hono's source than Fastify's, so I trust my mental model of it when things go sideways.

Rejected: Express (fine, but I'd be hand-rolling SSE), Fastify (perfectly good, just adds ceremony for this scope), Nest (way too much for a one-api service), Elysia/Bun (reviewer's laptop may not have Bun).

## SSE, not WebSocket

The traffic is one-way: build lines flow from server to browser, the browser never sends anything back on the same channel. WS gives me bidi I don't need plus framing, ping/pong, and reconnection logic I'd have to write myself. `EventSource` auto-reconnects on drop. Through Caddy, SSE is "just a long GET" — I set `flush_interval -1` and walk away. With WS I'd configure upgrade handling.

If the app grew to need an interactive shell, I'd add a WS endpoint *alongside* SSE, not instead of.

## SQLite via Drizzle

Zero setup. One file in `./data/app.db`. Migrations are code, schema is typed end to end, and the driver (`better-sqlite3`) is synchronous which is *fine* for this workload — we're not serving 10k rps. If I had another weekend I'd swap to Postgres for concurrent writes, and it would be ~20 lines of diff because Drizzle abstracts the driver.

Rejected: raw sqlite3 (types via hand), Prisma (heavy, generates a client I don't need), a JSON file (tempting but query-by-status gets ugly fast).

## Docker-out-of-Docker (socket mount)

The API runs inside a container and needs to spawn *other* containers. Two options:

1. **DinD** — run a full Docker daemon inside the API container. Needs `--privileged`. Complicated to set up, slow startup.
2. **DooD** — mount `/var/run/docker.sock` from the host. The API shells out to the host daemon. Spawned containers are siblings of the API, not children.

DooD is what every GitHub Actions runner does. It's simpler and faster. The security tradeoff is real: anything that can talk to the socket can root the host. For a take-home running on the reviewer's laptop, that's acceptable and I flag it explicitly in `TRADEOFFS.md`. In prod I'd put a socket-proxy (tecnativa/docker-socket-proxy) in front of it, or run rootless Docker, or move the build step to a privileged sidecar that doesn't face user input.

## Path routing (`/apps/<id>/*`) not subdomains

Subdomains (`<id>.localhost` or wildcard DNS) are nicer in prod — apps get the root path and assets work out of the box. But on a reviewer's laptop, I'd need them to edit `/etc/hosts` or run `dnsmasq`. That's a setup step I can't rely on.

Paths just work: `http://localhost/apps/abc123/`. The cost is that deployed apps have to use relative URLs for assets (or read a `BASE_PATH` env). My `sample-app/` does the right thing so the demo is clean. I document the constraint in the README.

## Caddy admin API, not Caddyfile regen

Static Caddyfile means: write a new file, send SIGHUP, hope. The admin API on `:2019` lets me `PATCH` a single route into the running config as JSON. Idempotent, inspectable with `curl`, no file I/O in the hot path. It also makes rollback trivial — find the route by path, replace the upstream, done.

## In-process queue, concurrency=1

The queue is an array and a `while (working)` loop. That's it. For one reviewer running one deploy at a time on their laptop, it's fine, and it avoids any chance of two builds racing on the Docker daemon or on Railpack's cache. The job-processing code doesn't know it's in-process though — it's just an async function. Swap in BullMQ + Redis and the pipeline code doesn't change.

## Tailwind (yes, even though they said they don't care)

The brief says "Tailwind defaults are fine" — that told me they won't deduct for ugly, but they *will* notice polished. The actual cost of Tailwind for a one-page app is maybe 20 minutes of config + a handful of utility classes. Not using it would leave me with plain CSS I wrote in a hurry, which looks worse and isn't faster. Status pills alone justify it.

## TanStack Router + Query (file-based routes for one page)

The JD names this stack, so I'm using it properly even though one route is all I need. File-based routing with the plugin gives me devtools, codegen, and a scaffold that looks like a real app. Query handles the deployment-list polling. Invalidating the list after a POST is `queryClient.invalidateQueries({ queryKey: ['deployments'] })` — one line, no state-management soup.

## No auth

Excluded in the JD. Adding it would eat hours and score zero.

## No tests for the UI

The JD explicitly says "a few meaningful tests beat 80% coverage of trivial code." I'll test the pipeline state machine and the log broker (the things most likely to break subtly). UI testing for a one-pager is a trap — setup cost is huge, bugs would be caught by a 30-second click-through.

## What I'd revisit

- If Railpack-from-inside-Docker is flaky, I pivot: run Railpack on the host via a small wrapper and signal the API. Documented in NOTEBOOK.
- If SSE buffering through Caddy bites me despite `flush_interval -1`, I have a backup plan of using chunked HTTP directly (not Caddy-proxied). Shouldn't come to that.
