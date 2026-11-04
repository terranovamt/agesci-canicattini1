"""Expand public ICS feeds into a same-origin snapshot for the static site."""

import argparse
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from icalendar import Calendar
import recurring_ical_events

ROOT = Path(__file__).resolve().parent.parent
ROME = ZoneInfo("Europe/Rome")


def instant(value):
    if isinstance(value, datetime):
        return value.replace(tzinfo=ROME) if value.tzinfo is None else value
    return datetime.combine(value, time.min, ROME)


def parse_events(raw, calendar_id, start, end):
    calendar = Calendar.from_ical(raw)
    if calendar.name != "VCALENDAR":
        raise ValueError("Il feed non contiene un calendario ICS valido")
    events = []
    seen = set()
    for event in recurring_ical_events.of(calendar).between(start, end):
        if str(event.get("STATUS", "")).upper() == "CANCELLED":
            continue
        begin = event.decoded("DTSTART")
        all_day = isinstance(begin, date) and not isinstance(begin, datetime)
        finish = event.decoded("DTEND", None)
        if finish is None:
            finish = begin + event.decoded("DURATION", timedelta(days=1) if all_day else timedelta())
        begin_at, finish_at = instant(begin), instant(finish)
        if finish_at < begin_at:
            raise ValueError("Evento con fine precedente all'inizio")
        if begin_at >= end or (finish_at <= start and begin_at < start):
            continue
        uid = str(event.get("UID", ""))
        if not uid:
            raise ValueError("Evento senza identificativo UID")
        key = calendar_id + ":" + uid + ":" + begin_at.isoformat()
        if key in seen:
            continue
        seen.add(key)
        events.append({
            "id": hashlib.sha256(key.encode()).hexdigest()[:24],
            "calendar": calendar_id,
            "title": str(event.get("SUMMARY", "Evento senza titolo")),
            "location": str(event.get("LOCATION", "")),
            "start": begin.isoformat() if all_day else begin_at.astimezone(timezone.utc).isoformat(),
            "end": finish.isoformat() if all_day else finish_at.astimezone(timezone.utc).isoformat(),
            "allDay": all_day,
        })
    return sorted(events, key=lambda event: (event["start"], event["id"]))


def fetch_feed(url):
    request = Request(url, headers={"User-Agent": "Canicattini1-PublicCalendarSync/1.0"})
    with urlopen(request, timeout=40) as response:
        raw = response.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise ValueError("Feed oltre il limite di 10 MiB")
    return raw


def synchronize(sources, previous, now, fetcher=fetch_feed):
    local = now.astimezone(ROME)
    start = datetime(local.year, local.month, 1, tzinfo=ROME) - timedelta(days=366)
    end = datetime(local.year + 2, local.month, 1, tzinfo=ROME)
    output = {"generatedAt": now.isoformat(), "rangeStart": start.isoformat(),
              "rangeEnd": end.isoformat(), "calendars": [], "events": []}
    failures = []
    for source in sources:
        prior = next((item for item in previous.get("calendars", []) if item["id"] == source["id"]), {})
        status = {**source, "lastSuccess": prior.get("lastSuccess")}
        try:
            events = parse_events(fetcher(source["feed"]), source["id"], start, end)
            status.update(status="ok", error=None, lastSuccess=now.isoformat())
        except (URLError, OSError, ValueError, KeyError, TypeError, OverflowError) as error:
            # Keep the last snapshot explicitly marked stale rather than hide a failed feed.
            events = [event for event in previous.get("events", []) if event["calendar"] == source["id"]]
            status.update(status="error", error=f"Sincronizzazione non riuscita: {error}")
            failures.append(source["name"] + ": " + str(error))
        output["calendars"].append(status)
        output["events"].extend(events)
    return output, failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "calendars/events.json")
    args = parser.parse_args()
    sources = json.loads((ROOT / "calendars/sources.json").read_text())
    previous = json.loads(args.output.read_text()) if args.output.exists() else {}
    output, failures = synchronize(sources, previous, datetime.now(timezone.utc))
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(args.output)
    for failure in failures:
        print(failure, file=sys.stderr)
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
