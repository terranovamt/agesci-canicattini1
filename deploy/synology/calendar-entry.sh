#!/bin/sh
set -eu
cp /app/seed/sources.json /app/calendars/sources.json
if [ ! -f /app/calendars/events.json ]; then
    cp /app/seed/events.json /app/calendars/events.json
fi
exec timeout 600 python tools/sync-calendars.py