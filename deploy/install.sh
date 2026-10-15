#!/bin/sh
# Builds and (re)starts the DRZ Builder on the VM: sudo ./deploy/install.sh
# Served at /builder/ by the existing nginx site; nothing else is changed.
set -eu
DIR=$(cd "$(dirname "$0")/.." && pwd)
SITE=${NGINX_SITE:-/etc/nginx/sites-available/koralle}

podman build -t localhost/koralle-builder:latest --build-arg VITE_API_BASE=/builder "$DIR/frontend"
podman pull -q docker.io/library/python:3.12-alpine >/dev/null

for f in koralle-builder.network koralle-sim.container koralle-builder.container; do
  sed "s#@DIR@#$DIR#g" "$DIR/deploy/$f" > "/etc/containers/systemd/$f"
done
systemctl daemon-reload
systemctl restart koralle-sim koralle-builder

install -m 644 "$DIR/deploy/nginx-builder.conf" /etc/nginx/snippets/koralle-builder.conf
if ! grep -q 'snippets/koralle-builder.conf' "$SITE"; then
  BACKUP="$SITE.bak-$(date +%Y%m%d%H%M%S)"
  cp "$SITE" "$BACKUP"
  sed -i '0,/^\([[:space:]]*\)location \/ {/s//\1include snippets\/koralle-builder.conf;\n&/' "$SITE"
  if ! nginx -t; then cp "$BACKUP" "$SITE"; echo "nginx config restored from $BACKUP"; exit 1; fi
fi
nginx -t && systemctl reload nginx

sleep 2
curl -fsS http://127.0.0.1:8090/api/simulations/engine/ >/dev/null && echo "DRZ Builder: /builder/ (simulation ok)"
