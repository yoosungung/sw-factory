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

# --- gateway native binary (bun compile; no Node at gateway runtime) ---
FROM oven/bun:1.4 AS gateway-build
ARG TARGETPLATFORM=linux/amd64
WORKDIR /src
# Minimal dep for compile (root package.json is FE/Workers-heavy).
RUN bun add yaml@2.9.0
COPY agent/shared ./agent/shared
COPY agent/gateway/src ./agent/gateway/src
COPY agent/gateway/scripts/build-native.sh ./agent/gateway/scripts/build-native.sh
RUN chmod +x agent/gateway/scripts/build-native.sh \
  && case "$TARGETPLATFORM" in \
       linux/arm64|linux/arm64/*) t=bun-linux-arm64 ;; \
       *) t=bun-linux-x64 ;; \
     esac \
  && GATEWAY_COMPILE_TARGET="$t" \
     ./agent/gateway/scripts/build-native.sh /out/sw-factory-gateway

# --- runtime: slim agent deps + common code + prepared seeds ---
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app /app/bin /data /config /opt/persona-seed \
  && chown node:node /app /app/bin /data /config /opt/persona-seed

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
COPY --from=gateway-build --chown=node:node /out/sw-factory-gateway /app/bin/sw-factory-gateway
COPY --chown=node:node deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/bin/sw-factory-gateway

USER node
ENV DATA_DIR=/data \
    AGENTS_YAML=/config/agents.yaml \
    FACTORY_BASE_URL=https://factory.askwho.net \
    PERSONA_SEED_DIR=/opt/persona-seed \
    AGENT_APP_ROOT=/app \
    GATEWAY_NATIVE_BIN=/app/bin/sw-factory-gateway \
    NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
