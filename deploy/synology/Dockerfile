FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY deploy/synology/nginx.conf /etc/nginx/conf.d/default.conf
COPY *.html *.webmanifest /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY config/ /usr/share/nginx/html/config/
COPY calendars/ /usr/share/nginx/html/calendars/
COPY documents/ /usr/share/nginx/html/documents/
COPY documenti/ /usr/share/nginx/html/documenti/
COPY area-riservata/ /usr/share/nginx/html/area-riservata/
COPY assemblea/ /usr/share/nginx/html/assemblea/
COPY peg/ /usr/share/nginx/html/peg/

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]