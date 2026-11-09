FROM node:24-alpine AS static-site
WORKDIR /source
COPY 404.html index.html manifest.webmanifest ./
COPY assets/ assets/
COPY config/ config/
COPY calendars/ calendars/
COPY documents/ documents/
COPY documenti/ documenti/
COPY area-riservata/ area-riservata/
COPY assemblea/ assemblea/
COPY peg/ peg/
COPY tools/build-site.cjs tools/build-site.cjs
COPY tools/site-layout.cjs tools/site-layout.cjs
COPY tools/partials/ tools/partials/
RUN node tools/build-site.cjs /site

FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY deploy/synology/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=static-site /site/ /usr/share/nginx/html/agesci-canicattini1/

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]