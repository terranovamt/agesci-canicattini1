FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY deploy/synology/gate.nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/synology/maintenance.html /usr/share/nginx/waiting/index.html

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
