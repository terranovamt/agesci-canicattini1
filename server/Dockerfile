FROM node:24-alpine
WORKDIR /app
COPY server/nas.cjs /app/server/nas.cjs
COPY server/people.cjs /app/server/people.cjs
COPY server/members.cjs /app/server/members.cjs
COPY server/activities.cjs /app/server/activities.cjs
COPY server/canzoniere.cjs /app/server/canzoniere.cjs
COPY server/votes.cjs /app/server/votes.cjs
COPY server/member-units.cjs /app/server/member-units.cjs
COPY server/monitor.cjs /app/server/monitor.cjs
COPY assets/js/documents-model.js /app/assets/js/documents-model.js
COPY assets/js/soci-model.js /app/assets/js/soci-model.js
COPY assets/js/activities-model.js /app/assets/js/activities-model.js
COPY assets/js/tournament-model.js /app/assets/js/tournament-model.js
COPY assets/js/canzoniere-model.js /app/assets/js/canzoniere-model.js
COPY config/site.js /app/config/site.js
COPY area-riservata/assemblea/dati.js /app/area-riservata/assemblea/dati.js
COPY documents/ /app/documents/
COPY calendars/ /app/calendars/
USER node
EXPOSE 3000
CMD ["node", "server/nas.cjs"]