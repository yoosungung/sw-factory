# syntax=docker/dockerfile:1

# --- prepare: merge persona overlays (discarded after copy) ---
FROM node:22-bookworm-slim AS prepare
WORKDIR /src
COPY deploy/docker/package.json deploy/docker/package-lock.json ./
RUN npm ci --omit=optional \
  && npm cache clean --force
COPY agent/cursor/src ./agent/cursor/src
COPY deploy/personas ./deploy/personas
RUN npx tsx agent/cursor/src/prepare-persona-seeds-cli.ts \
  --personas-root deploy/personas \
  --out /out/persona-seed

# --- runtime: slim agent deps + common code + prepared seeds ---
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app /data /config /opt/persona-seed \
  && chown node:node /app /data /config /opt/persona-seed

WORKDIR /app

# Agent-only deps (not root FE/Workers package.json)
COPY --chown=node:node deploy/docker/package.json deploy/docker/package-lock.json ./
USER node
RUN npm ci --omit=optional \
  && npm cache clean --force

USER root
COPY --chown=node:node agent/shared ./agent/shared
COPY --chown=node:node agent/gateway/src ./agent/gateway/src
COPY --chown=node:node agent/cursor/src ./agent/cursor/src
COPY --chown=node:node agent/cursor/mcp ./agent/cursor/mcp
COPY --from=prepare --chown=node:node /out/persona-seed /opt/persona-seed
COPY --chown=node:node deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node
ENV DATA_DIR=/data \
    AGENTS_YAML=/config/agents.yaml \
    FACTORY_BASE_URL=https://factory.askwho.net \
    PERSONA_SEED_DIR=/opt/persona-seed \
    AGENT_APP_ROOT=/app \
    NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
