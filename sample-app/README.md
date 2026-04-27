# brimble-sample-app

Tiny Node HTTP server Railpack can build with zero config. Deploy it by pasting the path to this directory (pushed to any Git host) into the Brimble Mini Deployer form.

- Listens on `PORT` (the deployer sets this to whatever port Caddy routes to).
- Replies with a small HTML page showing path + host + pid, so you can confirm the request really reached the container via Caddy's rewrite.
