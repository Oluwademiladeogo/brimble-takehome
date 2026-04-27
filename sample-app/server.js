import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const started = new Date().toISOString();

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html><head><title>hello from brimble sample</title>
<style>body{font-family:ui-sans-serif,system-ui;margin:4rem auto;max-width:40rem;padding:0 1rem;color:#0f172a}
h1{margin:0 0 .5rem} dl{display:grid;grid-template-columns:auto 1fr;gap:.5rem 1rem}
dt{color:#64748b} code{background:#f1f5f9;padding:.1rem .3rem;border-radius:.25rem}</style>
</head><body>
<h1>👋 hello from the sample app</h1>
<p>This was built by Railpack and is being fronted by Caddy.</p>
<dl>
  <dt>path</dt><dd><code>${req.url}</code></dd>
  <dt>host</dt><dd><code>${req.headers.host}</code></dd>
  <dt>started</dt><dd>${started}</dd>
  <dt>pid</dt><dd>${process.pid}</dd>
</dl>
</body></html>`);
}).listen(port, () => console.log(`sample-app listening on :${port}`));
