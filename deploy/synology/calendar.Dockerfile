FROM python:3.12-alpine
WORKDIR /app
RUN apk add --no-cache tzdata && addgroup -g 1000 app && adduser -D -u 1000 -G app app
COPY tools/calendar-requirements.txt /app/tools/calendar-requirements.txt
RUN pip install --no-cache-dir -r tools/calendar-requirements.txt
COPY tools/sync-calendars.py /app/tools/sync-calendars.py
COPY calendars/ /app/seed/
COPY deploy/synology/calendar-entry.sh /app/calendar-entry.sh
USER app
ENTRYPOINT ["sh", "/app/calendar-entry.sh"]