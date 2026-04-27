# syntax=docker/dockerfile:1.7
# Using debian-slim (not alpine) because Railpack ships a glibc-linked
# `mise` side-binary that fails to relocate under musl even with gcompat
# (error: __res_init not found). The size cost is worth the "it just
# works" property on a reviewer's laptop.
FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       docker.io git curl ca-certificates wget xz-utils tar \
  && rm -rf /var/lib/apt/lists/*

# Install Railpack from a pinned release asset rather than piping
# `curl | sh` — the upstream installer is bash-only and silently succeeds
# on many failure modes. We fetch the glibc tarball directly.
ARG RAILPACK_VERSION=v0.23.0
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64)  ARCH="x86_64-unknown-linux-gnu" ;; \
      aarch64) ARCH="arm64-unknown-linux-gnu" ;; \
      *) echo "unsupported arch $(uname -m)"; exit 1 ;; \
    esac; \
    # Railpack publishes -linux-musl and -apple-darwin tarballs. There
    # isn't a -linux-gnu; fall back to -linux-musl which runs fine on
    # glibc because musl binaries are statically friendlier than glibc.
    URL="https://github.com/railwayapp/railpack/releases/download/${RAILPACK_VERSION}/railpack-${RAILPACK_VERSION}-$(uname -m | sed s/aarch64/arm64/)-unknown-linux-musl.tar.gz"; \
    curl -fsSL "$URL" -o /tmp/rp.tgz; \
    tar -xzf /tmp/rp.tgz -C /usr/local/bin/; \
    rm -f /tmp/rp.tgz; \
    chmod +x /usr/local/bin/railpack; \
    /usr/local/bin/railpack --version

FROM base AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --filter @brimble/api... --prod=false --frozen-lockfile=false

FROM deps AS build
WORKDIR /app
COPY apps/api ./apps/api
RUN pnpm --filter @brimble/api build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
