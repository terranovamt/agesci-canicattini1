#!/bin/bash
set -euo pipefail
NAS_ROOT="${NAS_ROOT:-/volume1/docker/agesci-nas}"
revision="$(cat "$NAS_ROOT/current-revision")"
docker compose --project-name agesci-nas --env-file "$NAS_ROOT/nas.env" \
    -f "$NAS_ROOT/releases/$revision/deploy/synology/compose.yaml" \
    --profile maintenance run --rm --no-deps calendar-sync