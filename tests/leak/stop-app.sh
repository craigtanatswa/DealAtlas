#!/usr/bin/env bash
# Stops the app started by start-app.sh and waits for the port to close.
set -uo pipefail

if [ -f .leak/app.pid ]; then
  pid="$(cat .leak/app.pid)"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  rm -f .leak/app.pid
fi
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3100/api/health 2>/dev/null || exit 0
  sleep 1
done
echo "app on :3100 did not stop" >&2
exit 1
