# Demo deck outline

Target: ~10 slides, ≤7-minute Loom + live UI over the top. Talks I'd give on a founder call. Screenshots > bullets.

## Slide 1 — Cover
"Brimble Take-Home — [name] — April 2026." Full-bleed screenshot of the UI mid-deploy, building state, logs streaming.

## Slide 2 — The shape of the problem
Three sentences:
- A user submits a repo.
- Something builds it, runs it, routes to it.
- The UI watches.

Tiny 4-box diagram.

## Slide 3 — The architecture
Full ASCII/mermaid diagram:

```
  Browser
    │
    ▼
  Caddy (:80, admin :2019)
   ├─► Web (nginx)
   ├─► API (Hono)   ← SSE for logs
   └─► Deployed app containers  (per-deployment routes)

  API ──dockerode/socket──► Docker daemon
  API ──railpack CLI──────► Builds image
  API ──admin API──────────► Caddy (inject route)
  API ──better-sqlite3────► ./data/app.db
```

Label each arrow: HTTP, SSE, dockerode, admin API, socket.

## Slide 4 — The pipeline state machine

```
pending ──► building ──► deploying ──► running
    │          │             │
    └──────────┴─────────────┴──► failed
```

One sentence per transition explaining the trigger. One sentence on how failure cleans up Caddy state.

## Slide 5 — Logs: the hard-req part
Why SSE. Why the broker fans out *and* persists simultaneously. Why `flush_interval -1` in Caddy. Screenshot of log pane with a live build scrolling.

## Slide 6 — Caddy dynamic routing
Live `curl :2019/config/apps/http/servers/srv0/routes/`. Shows the list of injected routes. Proves it's real, not faked.

## Slide 7 — Tradeoffs
Trimmed to the 5 most interesting rows from TRADEOFFS.md. Focus on the ones that will prompt a good question (DooD, concurrency=1, path routing).

## Slide 8 — With another weekend
- Container watcher (the "2-seconds-later crash" fix)
- BullMQ for a real queue
- Socket-proxy for DooD
- Blue/green redeploys
- `/metrics` + Grafana

Keep it tight. No wishlist bloat.

## Slide 9 — Brimble deploy feedback
Screenshot of what I deployed. 4–6 bullets of friction written *live* (see NOTEBOOK.md). Short, direct, no politeness hedging.

## Slide 10 — Q&A
Black slide. "Ask me anything in the code."

## Delivery notes to self

- Talk fast but not rushed. 7 minutes goes quick — don't read slides, just point at them.
- On Slide 5, actually scroll the log pane on screen. Live is more convincing than still.
- On Slide 6, run the `curl` live. Don't paste output.
- If anyone's eyes glaze on Slide 4, skip to Slide 5. The state machine is table stakes; the logs are the interesting bit.
