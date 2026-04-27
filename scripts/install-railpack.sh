#!/usr/bin/env sh
# Fallback installer for Railpack — the upstream install.sh works in most
# environments, but if you're behind a proxy or need a pinned version, edit
# this script to fetch a specific release asset.
set -eu
curl -fsSL https://railpack.com/install.sh | sh
