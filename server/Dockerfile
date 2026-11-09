FROM node:24-alpine
WORKDIR /app
COPY server/nas.cjs /app/server/nas.cjs
COPY server/people.cjs /app/server/people.cjs
COPY server/monitor.cjs /app/server/monitor.cjs
COPY assets/js/documents-model.js /app/assets/js/documents-model.js
COPY config/site.js /app/config/site.js
COPY area-riservata/assemblea/dati.js /app/area-riservata/assemblea/dati.js
COPY documents/ /app/documents/
COPY calendars/ /app/calendars/
USER node
EXPOSE 3000
CMD ["node", "server/nas.cjs"]