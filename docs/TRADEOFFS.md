# Tradeoffs

The honest list. What I gave up, what I kept, and what I'd change if this were going to prod.

## The table

| Choice | What it costs me | Why I'm OK with it here |
|---|---|---|
| SQLite, not Postgres | No concurrent writers, no horizontal scale | One reviewer on one laptop. Driver swap is ~20 lines. |
| Docker socket mount (DooD) | The API container can root the host | Same model as every CI runner. Flagged loudly. Mitigations listed below. |
| SSE, not WebSocket | No bi-directional channel | Logs are one-way. EventSource reconnects for free. |
| Path routing, not subdomains | Deployed apps must handle a base path | No DNS hackery on the reviewer's laptop. |
| In-proc queue, concurrency=1 | Throughput of 1 deploy at a time | Avoids races; extraction to BullMQ is a single-file change. |
| No auth | Anyone with network access can deploy | Explicitly out of scope. |
| Polling the deployments list | ~1 req/2s per open tab | Beats building a second SSE channel for a handful of rows. |
| Logs in SQLite *and* an ndjson file | Duplication | Cheap. `tail -f` from the host is useful when I'm debugging. |
| Railpack default port assumption (3000) | Breaks apps that listen elsewhere without metadata | Fallback is documented, override via label. |
| No UI tests | No coverage number to wave around | JD specifically said coverage of trivial code isn't the goal. |

## Prod gap — what's missing before this could run a real platform

1. **Real queue + worker pool** — concurrency, retries, backoff, dead-letter.
2. **Socket-proxy in front of the Docker socket** — tecnativa/docker-socket-proxy with a strict allowlist (containers.create, containers.start, images.build, nothing else). Or move to rootless Docker entirely.
3. **Build isolation** — right now every build runs against the same daemon with the same layer cache. Fine for one user, catastrophic with untrusted input.
4. **Secrets** — Vault or SOPS, not env vars.
5. **Health checks + auto-restart on crashed containers** — `restart: unless-stopped` and HTTP health probes Caddy can use.
6. **Blue/green or rolling deploys** — right now a redeploy kills the old container before the new one is healthy.
7. **Per-deployment resource limits** — `--memory`, `--cpus`, pids limit. Otherwise one bad app eats the host.
8. **Log rotation** — the ndjson files grow forever. 7-day TTL + compress+ship to S3 or Loki.
9. **Multi-tenancy** — namespacing, per-user quotas, network isolation between deployed apps.
10. **Observability** — `/metrics` on the api, structured logs shipped to a collector, request tracing.
11. **Auth** — OIDC or at minimum API tokens. CSRF on the form.
12. **HTTPS** — Caddy can do this for free, just needs a real domain.

None of this is novel; it's just the list of things that make a platform a platform and not a demo.

## What I'd rip out with more time

- The ndjson file duplication of logs. If the DB is the source of truth, keep it that way; the file is debug-scaffolding.
- The path-rewriting in Caddy. If I had subdomains I wouldn't need it.
- The "fallback port 3000" assumption. I'd require Railpack metadata or a `PORT` env.
