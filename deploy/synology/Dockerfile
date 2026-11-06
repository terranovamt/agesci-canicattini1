FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY deploy/synology/nginx.conf /etc/nginx/conf.d/default.conf
COPY *.html *.webmanifest /usr/share/nginx/html/agesci-canicattini1/
COPY assets/ /usr/share/nginx/html/agesci-canicattini1/assets/
COPY config/ /usr/share/nginx/html/agesci-canicattini1/config/
COPY calendars/ /usr/share/nginx/html/agesci-canicattini1/calendars/
COPY documents/ /usr/share/nginx/html/agesci-canicattini1/documents/
COPY documenti/ /usr/share/nginx/html/agesci-canicattini1/documenti/
COPY area-riservata/ /usr/share/nginx/html/agesci-canicattini1/area-riservata/
COPY assemblea/ /usr/share/nginx/html/agesci-canicattini1/assemblea/
COPY peg/ /usr/share/nginx/html/agesci-canicattini1/peg/

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]