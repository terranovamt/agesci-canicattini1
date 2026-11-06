#!/bin/bash
set -euo pipefail
umask 077

NAS_ROOT="${NAS_ROOT:-/volume1/docker/agesci-nas}"
REPOSITORY="https://github.com/terranovamt/agesci-canicattini1.git"
BRANCH="NAS"
mkdir -p "$NAS_ROOT/releases" "$NAS_ROOT/data" "$NAS_ROOT/data/calendars"
chown 1000:1000 "$NAS_ROOT/data" "$NAS_ROOT/data/calendars"
if ! mkdir "$NAS_ROOT/update.lock" 2>/dev/null; then
    pid="$(cat "$NAS_ROOT/update.lock/pid" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$NAS_ROOT/update.lock/pid"
        rmdir "$NAS_ROOT/update.lock" 2>/dev/null || exit 0
        mkdir "$NAS_ROOT/update.lock" 2>/dev/null || exit 0
    else
        echo "Aggiornamento gia' in corso."
        exit 0
    fi
fi
printf '%s\n' "$$" > "$NAS_ROOT/update.lock/pid"
trap 'rm -f "$NAS_ROOT/update.lock/pid"; rmdir "$NAS_ROOT/update.lock"' EXIT
trap 'exit 1' HUP INT TERM

if [ ! -f "$NAS_ROOT/nas.env" ]; then
    echo "Configurare $NAS_ROOT/nas.env prima di avviare il deployment." >&2
    exit 1
fi
if [ ! -d "$NAS_ROOT/repository.git" ]; then
    git clone --bare --single-branch --branch "$BRANCH" "$REPOSITORY" "$NAS_ROOT/repository.git"
fi
git --git-dir="$NAS_ROOT/repository.git" fetch --no-tags origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
revision="$(git --git-dir="$NAS_ROOT/repository.git" rev-parse "refs/heads/$BRANCH")"
export NAS_RELEASE_REVISION="$revision"
previous="$(cat "$NAS_ROOT/current-revision" 2>/dev/null || true)"
if [ "$revision" = "$previous" ]; then
    echo "NAS gia' aggiornato a $revision."
    exit 0
fi

release="$NAS_ROOT/releases/$revision"
if [ ! -d "$release" ]; then
    staging="$(mktemp -d "$NAS_ROOT/releases/.staging.XXXXXX")"
    git --git-dir="$NAS_ROOT/repository.git" archive "$revision" | tar -x -C "$staging"
    mv "$staging" "$release"
fi

compose() {
    docker compose --project-name agesci-nas --env-file "$NAS_ROOT/nas.env" \
        -f "$1/deploy/synology/compose.yaml" "${@:2}"
}

compose "$release" config --quiet
bash -n "$release/deploy/synology/update.sh"
compose "$release" build
compose "$release" --profile maintenance build calendar-sync
if compose "$release" up -d --wait --force-recreate --wait-timeout 120; then
    printf '%s\n' "$revision" > "$NAS_ROOT/current-revision.tmp"
    mv "$NAS_ROOT/current-revision.tmp" "$NAS_ROOT/current-revision"
    cp "$release/deploy/synology/update.sh" "$NAS_ROOT/update.sh.tmp"
    mv "$NAS_ROOT/update.sh.tmp" "$NAS_ROOT/update.sh"
    cp "$release/deploy/synology/sync-calendars.sh" "$NAS_ROOT/sync-calendars.sh.tmp"
    mv "$NAS_ROOT/sync-calendars.sh.tmp" "$NAS_ROOT/sync-calendars.sh"
    echo "Deployment completato: $revision"
else
    echo "Deployment fallito: versione corrente non aggiornata." >&2
    if [ -n "$previous" ] && [ -d "$NAS_ROOT/releases/$previous" ]; then
        export NAS_RELEASE_REVISION="$previous"
        compose "$NAS_ROOT/releases/$previous" up -d --build --wait --force-recreate --wait-timeout 120
        echo "Ripristinato il codice precedente: $previous"
    fi
    exit 1
fi