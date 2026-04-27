import { config } from "../config.js";

// Caddy admin API lets us mutate the running config as JSON. We inject a route
// per deployment at index 0 of the main server's routes array, so it matches
// before the catch-all `/` route that hits the web container.
//
// Route shape we inject:
//   {
//     "@id": "dep:<id>",
//     "match": [{"path": ["/apps/<id>/*"]}],
//     "handle": [{
//       "handler": "subroute",
//       "routes": [
//         { "handle": [{ "handler": "rewrite", "strip_path_prefix": "/apps/<id>" }] },
//         { "handle": [{ "handler": "reverse_proxy",
//                        "upstreams": [{"dial": "<container>:<port>"}],
//                        "flush_interval": -1 }] }
//       ]
//     }]
//   }
//
// The `@id` lets us target-delete by id later without hunting for the route.

export interface RouteSpec {
  deploymentId: string;
  upstream: string; // host:port
}

// Read env each call rather than closing over config at module-load — lets
// tests swap CADDY_ADMIN per-case without a reload dance.
const base = () => (process.env.CADDY_ADMIN ?? config.caddyAdmin).replace(/\/$/, "");
const serverRoot = () => `${base()}/config/apps/http/servers/srv0`;

export async function ensureServerExists() {
  // Caddyfile already defines `srv0` via the `:80` block. This is just a probe.
  const res = await fetch(`${serverRoot()}/routes`);
  if (!res.ok) throw new Error(`caddy admin not reachable: ${res.status}`);
}

// Startup can race with Caddy coming up in compose. Wait up to `timeoutMs`
// for the admin API to respond before we give up. Throws loud — this is a
// hard dependency and the rest of the app can't function without it.
export async function waitForCaddy(timeoutMs = 30_000, pollMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base()}/config/`);
      if (res.ok) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `caddy admin not reachable at ${base()} after ${timeoutMs}ms: ${(lastErr as Error)?.message ?? "unknown"}`
  );
}

export async function addRoute({ deploymentId, upstream }: RouteSpec) {
  const route = {
    "@id": `dep:${deploymentId}`,
    match: [{ path: [`/apps/${deploymentId}/*`] }],
    handle: [
      {
        handler: "subroute",
        routes: [
          {
            handle: [{ handler: "rewrite", strip_path_prefix: `/apps/${deploymentId}` }],
          },
          {
            handle: [
              {
                handler: "reverse_proxy",
                upstreams: [{ dial: upstream }],
                flush_interval: -1,
              },
            ],
          },
        ],
      },
    ],
  };

  // PUT to routes/0 *inserts* at index 0. POST would replace the whole array.
  const res = await fetch(`${serverRoot()}/routes/0`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(route),
  });
  if (!res.ok) throw new Error(`caddy addRoute failed: ${res.status} ${await res.text()}`);
}

export async function removeRoute(deploymentId: string) {
  // Target-delete via the @id we assigned when inserting.
  const res = await fetch(`${base()}/id/dep:${deploymentId}`, { method: "DELETE" });
  // 404 is fine — it means there was no route to remove (e.g., failure before register).
  if (!res.ok && res.status !== 404) {
    throw new Error(`caddy removeRoute failed: ${res.status} ${await res.text()}`);
  }
}
