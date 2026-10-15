# KORALLE DRZ-Baukasten
#
#   docker compose up --build            → http://localhost:8080 (with the simulation service)
#   (or) docker build -t koralle-frontend .
#        docker run --rm -p 8080:8080 koralle-frontend
#
# Works with Docker and Podman. Stage 1 builds the static app, stage 2 serves it with nginx.

FROM node:22-alpine AS build
WORKDIR /app
# Install dependencies first so this layer is cached as long as the lockfile does not change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:stable-alpine
# The config is a template: the image entrypoint fills in API_UPSTREAM and the local DNS resolver.
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
RUN rm -f /etc/nginx/conf.d/default.conf
ENV API_UPSTREAM=http://sim:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
