import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import unittest
from urllib.error import URLError

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("sync", ROOT / "tools/sync-calendars.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def feed(events):
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//IT\r\n" + events
            + "END:VCALENDAR\r\n").encode()


class CalendarSyncTests(unittest.TestCase):
    def test_recurring_exclusions_overrides_dst_and_cancelled(self):
        raw = feed("""BEGIN:VEVENT
UID:weekly
DTSTART;TZID=Europe/Rome:20270321T100000
DTEND;TZID=Europe/Rome:20270321T110000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Rome:20270404T100000
SUMMARY:Riunione\\, di branca
LOCATION:Sede
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;TZID=Europe/Rome:20270328T100000
DTSTART;TZID=Europe/Rome:20270328T120000
DTEND;TZID=Europe/Rome:20270328T130000
SUMMARY:Evento spostato
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART:20270323T100000Z
STATUS:CANCELLED
SUMMARY:Non mostrare
END:VEVENT
""")
        events = sync.parse_events(raw, "eg", datetime(2027, 3, 1, tzinfo=sync.ROME),
                                   datetime(2027, 5, 1, tzinfo=sync.ROME))
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0]["start"], "2027-03-21T09:00:00+00:00")
        self.assertEqual(events[1]["start"], "2027-03-28T10:00:00+00:00")
        self.assertEqual(events[1]["title"], "Evento spostato")
        self.assertEqual(events[2]["start"], "2027-04-11T08:00:00+00:00")

    def test_all_day_exclusive_end_and_duration(self):
        raw = feed("""BEGIN:VEVENT
UID:camp
DTSTART;VALUE=DATE:20270601
DTEND;VALUE=DATE:20270604
SUMMARY:Campo
END:VEVENT
BEGIN:VEVENT
UID:day
DTSTART;VALUE=DATE:20270610
SUMMARY:Giornata
END:VEVENT
BEGIN:VEVENT
UID:duration
DTSTART:20270615T100000Z
DURATION:PT2H
SUMMARY:Riunione
END:VEVENT
""")
        events = sync.parse_events(raw, "eg", datetime(2027, 6, 1, tzinfo=sync.ROME),
                                   datetime(2027, 7, 1, tzinfo=sync.ROME))
        self.assertTrue(events[0]["allDay"])
        self.assertEqual(events[0]["end"], "2027-06-04")
        self.assertEqual(events[1]["end"], "2027-06-11")
        self.assertEqual(events[2]["end"], "2027-06-15T12:00:00+00:00")

    def test_failed_feed_preserves_old_events_and_marks_failure(self):
        sources = json.loads((ROOT / "calendars/sources.json").read_text())
        old_event = {"calendar": "eg", "title": "Ultimo evento noto"}
        previous = {"events": [old_event], "calendars": [
            {"id": "eg", "lastSuccess": "2027-01-01T00:00:00+00:00"}]}

        def offline(url):
            raise URLError("offline")

        output, failures = sync.synchronize(sources, previous, datetime(2027, 1, 2, tzinfo=timezone.utc), offline)
        self.assertEqual(len(failures), 5)
        self.assertEqual(output["events"], [old_event])
        self.assertEqual(output["calendars"][1]["status"], "error")
        self.assertEqual(output["calendars"][1]["lastSuccess"], "2027-01-01T00:00:00+00:00")

    def test_valid_empty_feed_is_different_from_invalid_feed(self):
        source = json.loads((ROOT / "calendars/sources.json").read_text())[:1]
        now = datetime(2027, 1, 2, tzinfo=timezone.utc)
        output, errors = sync.synchronize(source, {}, now, lambda url: feed(""))
        self.assertFalse(errors)
        self.assertEqual(output["calendars"][0]["status"], "ok")
        self.assertEqual(output["events"], [])
        output, errors = sync.synchronize(source, {}, now, lambda url: b"<html>Login</html>")
        self.assertTrue(errors)
        self.assertEqual(output["calendars"][0]["status"], "error")


if __name__ == "__main__":
    unittest.main()
