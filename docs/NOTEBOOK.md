# Engineer's notebook

Dated, append-only. What I tried, what broke, what I changed. Unpolished on purpose. If future-me or a reviewer wants to know how I actually thought about this, start here.

## 2026-04-23 — planning + scaffolding

Read the brief three times. The thing that jumped out: 30% of the score is three hard requirements — docker compose up, live log streaming, and Brimble feedback. Missing any one of those probably makes the rest of the score academic. So my sequencing is going to be "prove the hard reqs are met end-to-end before polishing anything."

Decisions I made without much debate:
- Hono for the API. SSE helper is first-class, TS-native, fast enough that it'll never be the bottleneck.
- SSE over WebSocket. One-way traffic, EventSource reconnects for free.
- SQLite via Drizzle. One file, synchronous driver, schema in code.
- Path routing `/apps/<id>/*`. Subdomain routing would force the reviewer to edit `/etc/hosts` or run a DNS resolver, and I can't rely on that.
- Tailwind. They said "defaults are fine," which to me means they won't dock for ugly but they'll notice polished. 20 minutes of config, and status pills look like status pills.

Decisions I went back and forth on:
- **DinD vs DooD.** Ended on DooD (socket mount) because that's what CI runners do and DinD needs `--privileged`. Real security caveat — any container that can talk to the socket can root the host. Flagging it loudly in TRADEOFFS.
- **Concurrency on the build queue.** Started thinking about a worker pool, walked it back to 1. The reviewer will run one deploy at a time. Parallel builds invite races on Docker and Railpack state that I don't want to debug tonight. I'm leaving a clean boundary so the swap-in is a single-file change.

Open question for tomorrow: can Railpack run from inside the API container, mounting only the host Docker socket? If it needs its own buildkit daemon, my architecture changes. I'm testing this first thing on day 1 before writing any pipeline code.

Wrote the companion docs before the code — REASONING, TRADEOFFS, STUDY, SLIDES, and this NOTEBOOK. The idea is to force myself to justify choices out loud before I commit to them. If I can't write a paragraph on why I chose Hono, I probably shouldn't choose Hono.

---

## 2026-04-24 — day 1: compose skeleton + Railpack feasibility (planned)

Plan for the day:
1. Scaffold the three services in compose — web (vite default), api (hello), caddy routing both.
2. Hit `http://localhost/` through Caddy, hit `http://localhost/api/health` through Caddy. Both green.
3. Build the api Dockerfile with the Railpack binary installed. From inside the container, run `railpack build` on a known-good repo and confirm it produces a usable image on the host daemon.
4. If step 3 fails, pivot: run Railpack on the host via a small helper script the API talks to over a domain socket or HTTP. Document the pivot here.

What I'll write down when it's done:
- Does Railpack need anything other than `DOCKER_HOST`? Does it assume buildkit is wired up in a particular way?
- Image tag format: am I naming with `brimble-deploy/<id>:<sha>` or something else?
- How long does a cold first build take? This matters for setting reviewer expectations.

---

## Brimble deploy — friction log (write LIVE, don't reconstruct)

Plan: deploy `sample-app/` from this repo (smallest moving part — proves the pipeline). Push it to a fresh public repo on GitHub first, then connect it on Brimble. Aim for the whole thing in 30 minutes; if anything blocks me past that, DM @pipe_dev (per the brief — they explicitly said this doesn't count against me).

### 2026-04-27 — submission day, attempt via `@brimble/cli`

Tried the CLI path first because it's the lowest-friction "is this thing even up" check.

```
$ npm install -g @brimble/cli  # 418 packages, ~1 min, no errors
$ brimble --help               # works, shows commands
$ brimble login -e bickerstethdemilade@gmail.com
? Authenticate with Github (Y/n)
```

Hard stop. The CLI hard-codes a GitHub OAuth flow as the only auth path. Tried `-a email` to see if there was a hidden alternate route:

```
$ brimble login -e ... -a email
ERROR: Only Github is supported for now
```

So the CLI cannot authenticate without a browser. There is no env-var token path, no `--token` flag, no `BRIMBLE_TOKEN` documented. Friction note (specific, not polite): a paid CLI with an exclusive GitHub-OAuth login is going to lock out CI runners, sandboxed agents, and anyone trying to script a first-time deploy. A `BRIMBLE_TOKEN` env var (read from the dashboard, like Vercel/Netlify) would be a 30-line patch and unblocks everyone.

**Status of CLI deploy attempt:** blocked at OAuth. The web-flow deploy will be done manually by me at the desk and the live URL pasted in below + in the README.

(Beats 1–8 below to be filled live during the manual web-flow attempt.)

Fill in **time + specifics** for each beat as I go. Empty answers are OK if there genuinely was no friction — but if I find myself writing "all good!" everywhere, I'm being polite, not honest.

### Pre-deploy (before I open Brimble)
- Time of starting: __:__
- What I'm deploying: sample-app/ (this repo's tiny node hello-world)

### Beat 1: Signup
- Time from landing on brimble.io to having an account: __
- Anything confusing: __
- Anything broken / 404 / blank screen: __

### Beat 2: First project / app creation
- How obvious was the create flow: __
- What I clicked, in order: __
- Any field I had to guess at: __

### Beat 3: Connecting the repo
- OAuth flow worked first try? __
- Did I have to re-auth or refresh: __
- Could I see my private repos? (I won't deploy a private one, just curious): __

### Beat 4: First build
- Time from clicking "Deploy" to first log line: __
- Were the logs LIVE (bytes arriving as the build ran) or post-hoc (one dump at the end)?: __
- Did the UI feel responsive while building, or did it freeze on a spinner: __
- Build duration: __
- Any retries needed: __

### Beat 5: Seeing the live URL
- Time from build complete to URL working: __
- Did the URL show up automatically or did I have to look for it: __
- HTTPS by default? Custom domain prompt? Region selection?: __

### Beat 6: Env vars + config
- Where do env vars live in the UI: __
- Could I find the docs for setting them: __
- Anything that surprised me: __

### Beat 7: Redeploy / iterate
- Did I push a new commit to test? Result: __
- Cache reuse felt ok or slow: __

### Beat 8: Anything else
- Things that made me go "huh?": __
- Things I wanted to do and couldn't find: __
- Things I'd change tomorrow if I owned the product: __
- Did I have to ask @pipe_dev for help? On what: __

### Final
- Total time end-to-end: __
- One-sentence summary of the experience: __

### Rules for filling this in
- No politeness hedging. "Confusing" is fine if it's true. "It was a bit unclear" is hedge-speak.
- Specificity > generality. "Logs were cool" → useless. "Logs buffered ~8s at build start, then dumped all at once" → useful.
- Note the screen / button / URL when calling something out. Reviewers can verify.
- If I get stuck and DM Twitter, note exactly what blocked me. The brief said this is signal, not a mark against me.

---

## Bugs I hit while building (filled in live)

Format: what happened → what I tried → what fixed it → lesson.

### 2026-04-24 — first E2E smoke

Three bugs hit during the first real `docker compose up` run. All fixed; all logged.

1. **Caddy admin 403'd every PATCH from the api.** The error was "origin not allowed." Caddy's admin defaults to a loopback allowlist on the `Host` header, and node's `fetch` doesn't send an `Origin` header at all — which Caddy treats as an empty origin and rejects. Fix: allow empty origin plus the compose-internal hostnames in `Caddyfile`. Lesson: admin APIs often have origin/CORS defaults that aren't obvious until you're on the wire.

2. **BuildKit sidecar over TCP stalled on `npm install` inside Docker Desktop on macOS.** Build progressed for a minute then hung. Error in buildkit logs: "No non-localhost DNS nameservers are left in resolv.conf." Root cause: nested-container networking on Docker Desktop doesn't propagate DNS into BuildKit's OCI sandbox when BuildKit listens over TCP. Switched `BUILDKIT_HOST` to `docker-container://brimble-buildkit` — Railpack then `docker exec`s into the BuildKit container via the mounted socket instead of speaking TCP. Build completed in 83s on the first real run. Lesson: on macOS, `docker-container://` is the reliable driver; TCP is a linux-bare-metal thing.

3. **Docker refused the image tag.** Final error: `invalid reference format: repository name (brimble-deploy/njaGwD3xpW) must be lowercase`. Nanoid's default alphabet is mixed-case — perfectly fine for URLs and DB keys, illegal in Docker refs. Fixed with a `.toLowerCase()` at the one point we construct the tag. Kept the row id mixed-case because it's already in the Caddy route `@id`, the file paths, and the UI. Lesson: Docker is pickier than most identifier systems; constrain at the Docker boundary, not the whole system.

### Verified working E2E after fixes

- `POST /api/deployments` with `https://github.com/heroku/node-js-sample` → pending → building → running in 38s (cache warm), ~90s first run
- Live URL `http://localhost/apps/<id>/` returns `Hello World!` (HTTP 200)
- SSE log stream shows lines *during* build, not after — the hard requirement
- Delete clears the Caddy route (verified via `curl :2019/id/dep:<id>` → 404)
- Bad git URL (`https://github.com/doesnt-exist/nope`) → status=failed in 5s with friendly message "Git authentication failed. Only public repos are supported."
- `http://localhost:8080/...` URL rejected with 400 "gitUrl may not point at localhost"
