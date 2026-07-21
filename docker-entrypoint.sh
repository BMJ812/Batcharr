#!/bin/sh
set -eu

PUID="${PUID:-99}"
PGID="${PGID:-100}"

if [ "$(id -u node)" != "$PUID" ]; then
  usermod -o -u "$PUID" node
fi

if [ "$(id -g node)" != "$PGID" ]; then
  groupmod -o -g "$PGID" node
fi

mkdir -p "${BATCHARR_CONFIG_DIR:-/config}"
chown -R node:node "${BATCHARR_CONFIG_DIR:-/config}"

exec gosu node:node node server.js
