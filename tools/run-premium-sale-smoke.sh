#!/usr/bin/env bash
set -euo pipefail

test_root=/tmp/area51-premium-smoke2
rm -rf "$test_root"
mkdir -p "$test_root/backend" "$test_root/.local/media"
cp /tmp/legacy-server.mjs "$test_root/legacy-server.mjs"
cp /tmp/server-premium-sale.mjs "$test_root/backend/server.mjs"
cp /opt/area51/backend/media-store.mjs /opt/area51/backend/sqlite-d1.mjs "$test_root/backend/"
cp /opt/area51/seed-database.json "$test_root/"
ln -s /opt/area51/lib "$test_root/lib"
sudo cp /tmp/area51-premium-copy/area51-test.sqlite "$test_root/.local/area51.sqlite"
sudo chown -R opc:opc "$test_root"
node /tmp/prepare-premium-sale-smoke.mjs "$test_root/.local/area51.sqlite"

cd "$test_root"
PORT=8791 AREA51_DATA_FILE="$test_root/.local/area51.sqlite" AREA51_MEDIA_DIR="$test_root/.local/media" node backend/server.mjs >"$test_root/server.log" 2>&1 &
test_pid=$!
cleanup() { kill "$test_pid" 2>/dev/null || true; wait "$test_pid" 2>/dev/null || true; }
trap cleanup EXIT

for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:8791/healthz >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8791/healthz >/dev/null
node /tmp/run-premium-sale-smoke.mjs http://127.0.0.1:8791
