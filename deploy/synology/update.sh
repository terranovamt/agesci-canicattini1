#!/bin/bash
set -Eeuo pipefail
umask 077

NAS_ROOT="${NAS_ROOT:-/volume1/docker/agesci-nas}"
REPOSITORY="https://github.com/terranovamt/agesci-canicattini1.git"
BRANCH="NAS"
phase="preparazione"
trap 'echo "Aggiornamento NAS fallito durante: $phase (riga $LINENO)." >&2' ERR

prune_releases() {
    # Older installations have no record of the previous healthy release.
    [ -f "$NAS_ROOT/previous-revision" ] || return 0
    local current fallback directory name image image_id
    current="$(cat "$NAS_ROOT/current-revision")"
    fallback="$(cat "$NAS_ROOT/previous-revision")"
    if [[ ! "$current" =~ ^[0-9a-f]{40}$ ]] ||
        { [ -n "$fallback" ] && [[ ! "$fallback" =~ ^[0-9a-f]{40}$ ]]; }; then
        echo "Pulizia release interrotta: riferimenti non validi." >&2
        return 1
    fi
    for directory in "$NAS_ROOT/releases/"*; do
        [ -d "$directory" ] && [ ! -L "$directory" ] || continue
        name="${directory##*/}"
        [[ "$name" =~ ^[0-9a-f]{40}$ ]] || continue
        [ "$name" != "$current" ] && [ "$name" != "$fallback" ] || continue
        for image in "agesci-nas-app:$name" "agesci-nas-web:$name" "agesci-nas-calendar-sync:$name"; do
            image_id="$(docker image ls --quiet "$image")"
            [ -n "$image_id" ] || continue
            if ! docker image rm "$image"; then
                echo "Immagine obsoleta non rimossa (potrebbe essere in uso): $image" >&2
            fi
        done
        rm -rf -- "$directory"
        echo "Release obsoleta rimossa: $name"
    done
}

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
ENV_FILES=("$NAS_ROOT/nas.env")
ENV_ARGS=(--env-file "$NAS_ROOT/nas.env")
if [ -f "$NAS_ROOT/.env" ]; then
    ENV_FILES+=("$NAS_ROOT/.env")
    ENV_ARGS+=(--env-file "$NAS_ROOT/.env")
fi
configuration="$(sha256sum "${ENV_FILES[@]}" | sha256sum | cut -d ' ' -f 1)"
phase="scaricamento del branch $BRANCH"
if [ ! -d "$NAS_ROOT/repository.git" ]; then
    git clone --bare --single-branch --branch "$BRANCH" "$REPOSITORY" "$NAS_ROOT/repository.git"
fi
git --git-dir="$NAS_ROOT/repository.git" fetch --no-tags origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
revision="$(git --git-dir="$NAS_ROOT/repository.git" rev-parse "refs/heads/$BRANCH")"
export NAS_RELEASE_REVISION="$revision"
previous="$(cat "$NAS_ROOT/current-revision" 2>/dev/null || true)"
previous_configuration="$(cat "$NAS_ROOT/current-configuration" 2>/dev/null || true)"
if [ "$revision" = "$previous" ] && [ "$configuration" = "$previous_configuration" ]; then
    phase="pulizia delle release obsolete"
    prune_releases
    echo "NAS gia' aggiornato a $revision."
    exit 0
fi

release="$NAS_ROOT/releases/$revision"
phase="estrazione della release $revision"
if [ ! -d "$release" ]; then
    staging="$(mktemp -d "$NAS_ROOT/releases/.staging.XXXXXX")"
    git --git-dir="$NAS_ROOT/repository.git" archive "$revision" | tar -x -C "$staging"
    mv "$staging" "$release"
fi

compose() {
    docker compose --project-name agesci-nas "${ENV_ARGS[@]}" \
        -f "$1/deploy/synology/compose.yaml" "${@:2}"
}

phase="verifica della configurazione Compose"
compose "$release" config --quiet
bash -n "$release/deploy/synology/update.sh"
previous_has_gate=false
if [ -n "$previous" ] && [ -d "$NAS_ROOT/releases/$previous" ]; then
    previous_services="$(compose "$NAS_ROOT/releases/$previous" config --services)"
    if grep -qx gate <<< "$previous_services"; then
        previous_has_gate=true
    fi
fi
phase="build delle immagini app e web"
compose "$release" build
phase="build dell'immagine calendari"
compose "$release" --profile maintenance build calendar-sync

start_release() {
    if [ -n "$previous" ] && [ "$previous_has_gate" = false ]; then
        phase="trasferimento della porta 8080 da web al proxy di attesa"
        compose "$release" stop web || return $?
    fi
    phase="avvio del proxy di attesa"
    compose "$release" up -d --wait --wait-timeout 120 gate || return $?
    phase="avvio e verifica salute di app e web"
    compose "$release" up -d --wait --force-recreate --wait-timeout 120 app web
}

if start_release; then
    phase="registrazione della release funzionante"
    if [ "$revision" != "$previous" ]; then
        printf '%s\n' "$previous" > "$NAS_ROOT/previous-revision.tmp"
        mv "$NAS_ROOT/previous-revision.tmp" "$NAS_ROOT/previous-revision"
    fi
    printf '%s\n' "$revision" > "$NAS_ROOT/current-revision.tmp"
    mv "$NAS_ROOT/current-revision.tmp" "$NAS_ROOT/current-revision"
    printf '%s\n' "$configuration" > "$NAS_ROOT/current-configuration.tmp"
    mv "$NAS_ROOT/current-configuration.tmp" "$NAS_ROOT/current-configuration"
    cp "$release/deploy/synology/update.sh" "$NAS_ROOT/update.sh.tmp"
    mv "$NAS_ROOT/update.sh.tmp" "$NAS_ROOT/update.sh"
    cp "$release/deploy/synology/sync-calendars.sh" "$NAS_ROOT/sync-calendars.sh.tmp"
    mv "$NAS_ROOT/sync-calendars.sh.tmp" "$NAS_ROOT/sync-calendars.sh"
    echo "Deployment completato: $revision"
    phase="pulizia delle release obsolete"
    prune_releases
else
    echo "Deployment fallito: versione corrente non aggiornata." >&2
    if ! compose "$release" ps --all; then
        echo "Impossibile leggere lo stato dei container; tento comunque il ripristino." >&2
    fi
    if ! compose "$release" logs --no-color --tail=80 app web gate; then
        echo "Impossibile leggere i log dei container; tento comunque il ripristino." >&2
    fi
    if [ -n "$previous" ] && [ -d "$NAS_ROOT/releases/$previous" ]; then
        phase="ripristino della release $previous"
        export NAS_RELEASE_REVISION="$previous"
        if [ "$previous_has_gate" = true ]; then
            compose "$NAS_ROOT/releases/$previous" up -d --build --wait --wait-timeout 120 gate
        else
            compose "$release" stop gate
        fi
        compose "$NAS_ROOT/releases/$previous" up -d --build --wait --force-recreate --wait-timeout 120 app web
        echo "Ripristinato il codice precedente: $previous"
    fi
    exit 1
fi