"""Build persona ConfigMap data from deploy/personas/_default/ + persona overlay."""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_DIR = "_default"
CURSOR_DIR = ".cursor"
CURSOR_MEMORY = f"{CURSOR_DIR}/MEMORY.md"
CURSOR_MCP = f"{CURSOR_DIR}/mcp.json"
CURSOR_CLI = f"{CURSOR_DIR}/cli-config.json"

# Handled outside tree merge (MEMORY append, mcp deep-merge, cli pick).
SPECIAL_PATHS = frozenset(
    {
        "MEMORY.md",
        CURSOR_MEMORY,
        "mcp.json",
        CURSOR_MCP,
        "cli-config.json",
        CURSOR_CLI,
    }
)


def encode_configmap_key(rel_path: str) -> str:
    """Encode a repo-relative path as a valid Kubernetes ConfigMap data key."""
    if "/" not in rel_path:
        return rel_path
    encoded = rel_path.replace("/", "__")
    if encoded.startswith("."):
        encoded = "_dot_" + encoded[1:]
    return encoded


def decode_configmap_key(key: str) -> str:
    """Decode a ConfigMap data key back to a repo-relative path."""
    if "__" not in key:
        return key
    decoded = key.replace("__", "/")
    if decoded.startswith("_dot_"):
        decoded = "." + decoded[5:]
    return decoded


def bundle_for_configmap(bundle: dict[str, str]) -> dict[str, str]:
    """Map bundle paths to ConfigMap-safe keys."""
    return {encode_configmap_key(path): content for path, content in bundle.items()}


def merge_memory(base: str, overlay: str | None) -> str:
    """Append persona MEMORY.md after shared defaults."""
    if not base.strip():
        return (overlay or "").strip() + ("\n" if overlay else "")
    if not overlay or not overlay.strip():
        return base.rstrip() + "\n"
    return base.rstrip() + "\n\n" + overlay.lstrip()


def _memory_text(tree: dict[str, str]) -> str:
    return tree.get("MEMORY.md") or tree.get(CURSOR_MEMORY) or ""


def _mcp_dict(tree: dict[str, str]) -> dict:
    raw = tree.get(CURSOR_MCP) or tree.get("mcp.json")
    if not raw:
        return {}
    return json.loads(raw)


def merge_mcp(base: dict, overlay: dict | None) -> dict:
    """Deep-merge mcp.json; persona mcpServers override by server name."""
    result = json.loads(json.dumps(base))
    if not overlay:
        return result
    overlay_servers = overlay.get("mcpServers", {})
    if overlay_servers:
        result.setdefault("mcpServers", {}).update(overlay_servers)
    for key, value in overlay.items():
        if key != "mcpServers":
            result[key] = value
    return result


def collect_tree(directory: Path) -> dict[str, str]:
    """Map relative posix paths to file contents under directory.

    Skip `*.sample` templates — they are repo bootstrap only, not Pod seeds.
    """
    if not directory.is_dir():
        return {}
    files: dict[str, str] = {}
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        if path.name.endswith(".sample"):
            continue
        rel = path.relative_to(directory).as_posix()
        files[rel] = path.read_text()
    return files


def overlay_files(base: dict[str, str], overlay: dict[str, str]) -> dict[str, str]:
    merged = dict(base)
    merged.update(overlay)
    return merged


def build_persona_bundle(persona: str, personas_root: Path) -> dict[str, str]:
    """Merge _default/ with deploy/personas/{persona}/ for ConfigMap data."""
    default_dir = personas_root / DEFAULT_DIR
    persona_dir = personas_root / persona

    default_tree = collect_tree(default_dir)
    persona_tree = collect_tree(persona_dir) if persona != DEFAULT_DIR and persona_dir.is_dir() else {}

    base_files = {k: v for k, v in default_tree.items() if k not in SPECIAL_PATHS}
    overlay_files_map = {k: v for k, v in persona_tree.items() if k not in SPECIAL_PATHS}
    bundle = overlay_files(base_files, overlay_files_map)

    memory = merge_memory(
        _memory_text(default_tree),
        _memory_text(persona_tree) or None,
    )
    if memory.strip():
        bundle[CURSOR_MEMORY] = memory

    base_mcp = _mcp_dict(default_tree)
    overlay_mcp = _mcp_dict(persona_tree)
    if base_mcp or overlay_mcp:
        bundle[CURSOR_MCP] = json.dumps(merge_mcp(base_mcp, overlay_mcp or None), indent=2) + "\n"

    cli = persona_tree.get(CURSOR_CLI) or persona_tree.get("cli-config.json")
    if cli is None:
        cli = default_tree.get(CURSOR_CLI) or default_tree.get("cli-config.json")
    if cli is not None:
        bundle[CURSOR_CLI] = cli

    return bundle
