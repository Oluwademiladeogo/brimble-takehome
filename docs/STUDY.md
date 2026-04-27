# What I need cold before the founder call

The founder walkthrough is "live debugging, system design, and a walkthrough of your submission." If they ask "why?" about anything in this repo I need a real answer. This is my pre-interview crib.

I'm ranking these by how likely they are to come up, not by how interesting they are.

## 1. Railpack — how it actually works

- What builder does it pick for a given repo, and how does the detection work? (Look at the providers dir in the Railpack repo.)
- Where does the image manifest come from? It's BuildKit under the hood, so it's OCI.
- Layer cache keying — what invalidates a cached layer? Can I share cache across deploys?
- How do I pass build-time env vs runtime env?
- Can I point it at a subdirectory (monorepo case)?
- What does its output look like — does it expose the exposed port?

Answer I want ready: "Railpack detects the language via a provider chain, builds with BuildKit, and tags the image with whatever I pass via `--name`. Cache is per-layer, keyed on instructions, so clean deps across runs reuse layers for me."

## 2. Caddy admin API

- Config shape: `apps.http.servers.<srv>.routes[]`. Each route has `match` and `handle`.
- `match` examples: `path`, `host`, `header`. They AND by default.
- `handle` examples: `reverse_proxy`, `rewrite`, `subroute`.
- Order matters — first match wins. That's why I prepend.
- Admin API endpoints I'm using: `GET /config/...`, `PATCH /config/...`, `DELETE /config/...` with JSON bodies.
- `flush_interval -1` on `reverse_proxy` means "no buffering, flush as bytes arrive" — essential for SSE.

Drill: describe in JSON what a route that matches `/apps/abc/*`, strips `/apps/abc`, and proxies to `deploy-abc:3000` looks like. Be able to draw it on a whiteboard.

## 3. Docker socket security

- What does mounting `/var/run/docker.sock` actually grant?
- Answer: full control of the daemon → pull any image → run any image with `--privileged` → mount host root → game over.
- Mitigations I know: rootless Docker, socket-proxy with allowlist, Podman (different model), gVisor for sandboxing inside.
- Ready for: "isn't this root on host?" → "Yes. Same threat model as a CI runner with docker-in-docker. Here's what I'd do in prod."

## 4. SSE mechanics

- Content-Type `text/event-stream`. Lines of `event: X\n`, `data: Y\n`, blank line terminates a message.
- `id:` field + `Last-Event-ID` header for resume on reconnect. I'm not using this (I replay from DB on connect) but know it exists.
- `retry: <ms>` tells the client reconnect delay.
- Heartbeats (comment lines `: keepalive\n\n`) keep proxies from closing idle connections.
- Browser `EventSource` handles reconnect automatically. It doesn't support POST or custom headers — that's why some folks switch to `fetch` + manual stream.

## 5. TanStack Router + Query

- Router: file-based routes, code-split by default, type-safe route params.
- Loaders vs `useQuery`: loaders run on navigation (good for data the route *needs*), `useQuery` for anything dynamic after mount.
- Why I'm not using `useSuspenseQuery`: I want the list to render with a spinner rather than blocking the whole page on first fetch. Small UX thing, real reason.
- Invalidation: `queryClient.invalidateQueries({ queryKey: ['deployments'] })` after any mutation.

## 6. Nomad / Consul / Vault — the Brimble prod stack

The JD says hands-on with these is a "meaningful bonus." I haven't shipped on them. What I know:

- **Nomad**: HashiCorp's orchestrator. Scheduling jobs (batch, service, system types) across a cluster of agents. Config in HCL. Simpler than Kubernetes, closer to "run this container on some machine." Drivers: docker, exec, raw_exec, qemu.
- **Consul**: service discovery + KV store + service mesh. Registers services, health-checks them, lets other services find them by name.
- **Vault**: secrets engine. Dynamic credentials (it issues short-lived DB creds on demand), KV secrets, transit encryption. Auth methods (AppRole, OIDC, Kubernetes, etc).
- How they plug in: Nomad schedules a job → it registers in Consul → it pulls secrets from Vault at start → traffic finds it via Consul DNS or Connect mesh.

If asked: "I haven't shipped on Nomad but I've read the Introduction and Scheduling docs. The mental model is much closer to this project (a scheduler + a service registry + a proxy) than Kubernetes is. Happy to ramp."

## 7. My own code — re-read the morning of

Things I'll be asked to explain:

- The exact pipeline state transitions. What triggers each. What happens if step N fails — do I clean up state from step N-1?
- Why the log broker writes to DB *and* fans out simultaneously, not one-then-the-other.
- What happens if the client disconnects mid-stream (unsubscribe, don't leak).
- What happens if the API restarts mid-build. (The container keeps going; the build subprocess is dead. The DB row is stuck in `building`. I handle this by a startup sweep that marks orphan `building`/`deploying` rows as `failed` with an "interrupted" error.)
- Port collision handling.
- Why I prepend Caddy routes, not append.
- How delete unwinds: stop container → remove Caddy route → mark deleted. In that order, so traffic never hits a dead container.

## The killer question to be ready for

> "Railpack succeeds. `docker run -d` succeeds. The container crashes 2 seconds later. What happens to your deployment?"

Answer: right now, nothing. Status stays `running`, live URL 502s. Fix: a `docker events`-driven watcher that listens for container die events on the `brimble.deployment` label and flips status to `failed` with the exit code as the error. I mention this as "with another weekend" in the README. If they push, I can sketch the watcher in 10 lines of dockerode on the whiteboard.
