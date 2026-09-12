# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY agent ./agent
COPY deploy/personas ./deploy/personas
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data /config \
  && chown -R node:node /data /config /app

USER node
ENV DATA_DIR=/data \
    AGENTS_YAML=/config/agents.yaml \
    FACTORY_BASE_URL=https://factory.askwho.net \
    NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
