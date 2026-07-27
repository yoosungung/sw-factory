FROM node:22-slim

ARG KUBECTL_VERSION=v1.32.2
ARG GH_VERSION=2.67.0
ARG TARGETARCH=amd64

# Dev/ops CLI: uv + Python 3.12, kubectl (in-cluster logs), gh (GHCR/GH API), git
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git \
  && curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
  && curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    -o /usr/local/bin/kubectl \
  && chmod 0755 /usr/local/bin/kubectl \
  && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.tar.gz" \
    | tar -xz -C /tmp \
  && mv "/tmp/gh_${GH_VERSION}_linux_${TARGETARCH}/bin/gh" /usr/local/bin/gh \
  && rm -rf /tmp/gh_* \
  && rm -rf /var/lib/apt/lists/*

ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN uv python install 3.12 \
  && ln -sf "$(uv python find 3.12)" /usr/local/bin/python3 \
  && ln -sf "$(uv python find 3.12)" /usr/local/bin/python

COPY leantime-mcp /opt/leantime-mcp
RUN uv venv /opt/leantime-venv --python 3.12 \
  && uv pip install --python /opt/leantime-venv /opt/leantime-mcp
ENV PATH="/opt/leantime-venv/bin:/usr/local/bin:${PATH}"

RUN python3 --version | grep -E 'Python 3\.1[2-9]' \
  && uv --version \
  && kubectl version --client=true \
  && gh --version \
  && command -v leantime-mcp

WORKDIR /app
COPY agent-runner/package.json agent-runner/package-lock.json ./
RUN npm ci

COPY agent-runner/tsconfig.json ./
COPY agent-runner/src ./src
COPY agent-runner/scripts/entrypoint.sh ./scripts/entrypoint.sh
RUN chmod +x ./scripts/entrypoint.sh \
  && npm run build && npm prune --omit=dev

ENV AGENT_RUNNER_MODEL=composer-2.5
ENV WORKSPACE=/workspace
ENV KUBERNETES_NAMESPACE=leantime
EXPOSE 8080
CMD ["./scripts/entrypoint.sh"]
