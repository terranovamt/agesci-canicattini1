#!/bin/bash
set -euo pipefail
NAS_ROOT="${NAS_ROOT:-/volume1/docker/agesci-nas}"
ENV_ARGS=(--env-file "$NAS_ROOT/nas.env")
if [ -f "$NAS_ROOT/.env" ]; then
    ENV_ARGS+=(--env-file "$NAS_ROOT/.env")
fi
revision="$(cat "$NAS_ROOT/current-revision")"
docker compose --project-name agesci-nas "${ENV_ARGS[@]}" \
    -f "$NAS_ROOT/releases/$revision/deploy/synology/compose.yaml" \
    --profile maintenance run --rm --no-deps calendar-sync