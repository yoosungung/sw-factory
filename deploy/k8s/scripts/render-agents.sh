#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
AGENTS_YAML="${ROOT}/deploy/k8s/agents.yaml"
OUT_DIR="${ROOT}/deploy/k8s/base/generated"
SS_TEMPLATE="${ROOT}/deploy/k8s/templates/statefulset.yaml.tpl"
SVC_TEMPLATE="${ROOT}/deploy/k8s/templates/service.yaml.tpl"
SCRIPTS_DIR="${ROOT}/deploy/k8s/scripts"

mkdir -p "${OUT_DIR}"
# Drop stale index-based manifests from previous renders.
find "${OUT_DIR}" -mindepth 1 -maxdepth 1 -type f -delete

python3 - <<'PY' "${AGENTS_YAML}" "${OUT_DIR}" "${SS_TEMPLATE}" "${SVC_TEMPLATE}" "${SCRIPTS_DIR}"
import sys
from pathlib import Path

import yaml

sys.path.insert(0, sys.argv[5])
from persona_bundle import build_persona_bundle, bundle_for_configmap
from tenant_cd import REGISTRY_CURSOR_PATH, registry_json

agents_yaml, out_dir, ss_tpl_path, svc_tpl_path, _scripts_dir = sys.argv[1:6]
data = yaml.safe_load(Path(agents_yaml).read_text())
agents = data.get("agents", [])
settings = data.get("settings", {})
max_replicas = int(settings.get("replicas_max", 10))
runner_image = settings.get("runner_image", "cursor-agent-runner:latest")
default_model = settings.get("model", "composer-2.5")
personas_root = Path(agents_yaml).parents[1] / "personas"
tenant_registry = registry_json(agents)

def agent_model(agent: dict) -> str:
    return str(agent.get("model") or default_model)

# Only type=sessions agents get StatefulSet/Service. human/openai stay identity (+ external URL).
deploy_agents = [
    a for a in agents if str(a.get("type") or "").strip().lower() == "sessions"
][:max_replicas]

out = Path(out_dir)
ss_tpl = Path(ss_tpl_path).read_text()
svc_tpl = Path(svc_tpl_path).read_text()

resources = ["namespace-service.yaml"]
persona_emails: dict[str, str] = {}

# Persona ConfigMaps for bot runners only (seed-persona init).
for agent in deploy_agents:
    persona = agent.get("persona", agent["name"])
    persona_emails[persona] = agent["email"]

for agent in deploy_agents:
    name = agent["name"]
    persona = agent.get("persona", name)
    email = agent["email"]
    # YAML `git_repo_url:` (null) must become "" for str.replace.
    git_repo = str(agent.get("git_repo_url") or "")

    # Default shared Secret key; per-agent override e.g. candy → GH_TOKEN_candy.
    gh_token_secret_key = str(agent.get("gh_token_secret_key") or "GH_TOKEN").strip() or "GH_TOKEN"

    ss = (
        ss_tpl.replace("{{NAME}}", name)
        .replace("{{PERSONA}}", str(persona))
        .replace("{{EMAIL}}", str(email))
        .replace("{{GIT_REPO}}", git_repo)
        .replace("{{RUNNER_IMAGE}}", runner_image)
        .replace("{{MODEL}}", agent_model(agent))
        .replace("{{GH_TOKEN_SECRET_KEY}}", gh_token_secret_key)
    )
    ss_path = out / f"statefulset-{name}.yaml"
    ss_path.write_text(ss)
    resources.append(ss_path.name)

    svc = svc_tpl.replace("{{NAME}}", name)
    svc_path = out / f"service-{name}.yaml"
    svc_path.write_text(svc)
    resources.append(svc_path.name)

for persona in persona_emails:
    bundle = build_persona_bundle(persona, personas_root)
    # M5: only infra gets the generated tenant CD registry (lookup by agent/repo).
    if persona == "infra":
        bundle[REGISTRY_CURSOR_PATH] = tenant_registry
    cm = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": f"persona-{persona}",
            "namespace": "leantime",
            "labels": {"app": "cursor-agent", "persona": persona},
        },
        "data": bundle_for_configmap(bundle),
    }
    cm_path = out / f"configmap-persona-{persona}.yaml"
    cm_path.write_text(yaml.safe_dump(cm, sort_keys=False))
    resources.append(cm_path.name)

kustomization = {
    "apiVersion": "kustomize.config.k8s.io/v1beta1",
    "kind": "Kustomization",
    "namespace": "leantime",
    "resources": resources,
}
(out / "kustomization.yaml").write_text(yaml.safe_dump(kustomization, sort_keys=False))

ns_src = Path(agents_yaml).parent / "base" / "namespace-service.yaml"
(out / "namespace-service.yaml").write_text(ns_src.read_text())

print(f"Rendered {len(deploy_agents)} bot agent(s) -> {out}")
PY
