"""Seed factory staff (pm/km/ta/qa/aa) in Leantime — no My Project creation."""

from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

FACTORY_STAFF: tuple[str, ...] = ("pm", "km", "ta", "qa", "aa")
DEFAULT_ROLE = 40  # Admin — cross-client factory staff
MY_PROJECT_RE = re.compile(r"^my\s+project$", re.IGNORECASE)

_LEGACY_SECRET_RENAMES = {
    "LEANTIME_ACCESS_TOKEN_candy": "LEANTIME_ACCESS_TOKEN_pm",
    "LEANTIME_ACCESS_TOKEN_finder": "LEANTIME_ACCESS_TOKEN_km",
    "LEANTIME_ACCESS_TOKEN_infra": "LEANTIME_ACCESS_TOKEN_ta",
    "GH_TOKEN_candy": "GH_TOKEN_pm",
}


def staff_agents(data: dict) -> list[dict]:
    """Return agents that are factory staff (by name)."""
    out: list[dict] = []
    for agent in data.get("agents") or []:
        name = str(agent.get("name") or "").strip()
        if name in FACTORY_STAFF:
            out.append(agent)
    return out


def apply_user_ids(data: dict, ids_by_name: dict[str, int]) -> dict:
    """Return a shallow-copied agents.yaml dict with updated leantime_user_id."""
    agents = []
    for agent in data.get("agents") or []:
        row = dict(agent)
        name = str(row.get("name") or "").strip()
        if name in ids_by_name:
            row["leantime_user_id"] = int(ids_by_name[name])
        agents.append(row)
    out = dict(data)
    out["agents"] = agents
    return rewrite_schedule_mention_ids(out, ids_by_name)


def rewrite_schedule_mention_ids(data: dict, ids_by_name: dict[str, int]) -> dict:
    """Replace ``name=<oldId>`` tokens in schedule prompts with seeded ids."""
    settings = dict(data.get("settings") or {})
    schedules = []
    for sched in settings.get("schedules") or []:
        row = dict(sched)
        prompt = str(row.get("prompt") or "")
        for name, uid in ids_by_name.items():
            prompt = re.sub(
                rf"\b{re.escape(name)}=\d+\b",
                f"{name}={int(uid)}",
                prompt,
            )
        if "eric" not in ids_by_name:
            # keep eric=1 convention if present
            pass
        row["prompt"] = prompt
        schedules.append(row)
    if schedules:
        settings["schedules"] = schedules
        out = dict(data)
        out["settings"] = settings
        return out
    return data


def token_secret_key(agent_name: str) -> str:
    return f"LEANTIME_ACCESS_TOKEN_{agent_name}"


def is_my_project_name(name: str) -> bool:
    return bool(MY_PROJECT_RE.match((name or "").strip()))


def ensure_not_my_project(name: str) -> str:
    if is_my_project_name(name):
        raise ValueError("Refusing to create My Project")
    return name


def client_project_name(client: dict) -> str:
    raw = str(client.get("project_name") or client.get("id") or "").strip()
    return ensure_not_my_project(raw or "factory-client")


def user_insert_values(
    *,
    email: str,
    firstname: str,
    role: int = DEFAULT_ROLE,
    password_hash: str,
    lastname: str = "",
    status: str = "a",
    client_id: str | int = "",
) -> dict[str, Any]:
    return {
        "username": email,
        "firstname": firstname,
        "lastname": lastname,
        "role": int(role),
        "status": status,
        "password": password_hash,
        "clientId": client_id if client_id != "" else "",
        "phone": "",
        "notifications": 1,
    }


def legacy_secret_renames() -> dict[str, str]:
    return dict(_LEGACY_SECRET_RENAMES)


def build_secret_string_data(
    existing: dict[str, str],
    tokens_by_agent: dict[str, str],
) -> dict[str, str]:
    """Merge minted PATs + rename legacy candy/finder/infra secret keys."""
    patch = dict(existing)
    for old, new in _LEGACY_SECRET_RENAMES.items():
        if old in patch:
            if new not in patch:
                patch[new] = patch[old]
            del patch[old]
    for name, token in tokens_by_agent.items():
        patch[token_secret_key(name)] = token
    return patch


def _run(cmd: list[str], *, check: bool = True, input_text: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        check=check,
        text=True,
        input=input_text,
        capture_output=True,
    )


def _kubectl_ns(ns: str, *args: str, check: bool = True) -> str:
    proc = _run(["kubectl", "-n", ns, *args], check=check)
    return (proc.stdout or "").strip()


def leantime_pod(ns: str) -> str:
    name = _kubectl_ns(
        ns,
        "get",
        "pod",
        "-l",
        "app.kubernetes.io/name=leantime",
        "-o",
        "jsonpath={.items[0].metadata.name}",
    )
    if not name:
        raise RuntimeError(f"No leantime pod in ns={ns}")
    return name


def mariadb_password(ns: str) -> str:
    raw_json = _kubectl_ns(ns, "get", "secret", "leantime-mariadb", "-o", "json")
    data = (json.loads(raw_json).get("data") or {})
    for key in ("mariadb-password", "password", "database-password"):
        if key in data:
            import base64

            return base64.b64decode(data[key]).decode()
    raise RuntimeError("Cannot read leantime-mariadb password")


def mysql_exec(ns: str, sql: str) -> str:
    pw = mariadb_password(ns)
    proc = subprocess.run(
        [
            "kubectl",
            "-n",
            ns,
            "exec",
            "-i",
            "leantime-mariadb-0",
            "-c",
            "mariadb",
            "--",
            "mariadb",
            "-uleantime",
            f"-p{pw}",
            "leantime",
            "-N",
            "-e",
            sql,
        ],
        check=True,
        text=True,
        capture_output=True,
    )
    return (proc.stdout or "").strip()


def php_password_hash(ns: str, password: str) -> str:
    pod = leantime_pod(ns)
    proc = _run(
        [
            "kubectl",
            "-n",
            ns,
            "exec",
            pod,
            "-c",
            "leantime",
            "--",
            "php",
            "-r",
            f"echo password_hash({json.dumps(password)}, PASSWORD_DEFAULT);",
        ],
        check=True,
    )
    return proc.stdout.strip()


def find_user_id_by_email(ns: str, email: str) -> int | None:
    email_esc = email.replace("'", "''")
    out = mysql_exec(
        ns,
        f"SELECT id FROM zp_user WHERE username='{email_esc}' LIMIT 1;",
    )
    line = out.strip().splitlines()[0] if out.strip() else ""
    return int(line) if line.isdigit() else None


def create_user_if_missing(
    ns: str,
    *,
    email: str,
    firstname: str,
    password: str,
    role: int = DEFAULT_ROLE,
) -> int:
    existing = find_user_id_by_email(ns, email)
    if existing is not None:
        return existing
    pw_hash = php_password_hash(ns, password)
    vals = user_insert_values(
        email=email, firstname=firstname, role=role, password_hash=pw_hash
    )
    email_esc = vals["username"].replace("'", "''")
    fn = vals["firstname"].replace("'", "''")
    ln = str(vals["lastname"]).replace("'", "''")
    ph = vals["password"].replace("'", "''")
    sql = (
        "INSERT INTO zp_user "
        "(firstname,lastname,phone,username,role,notifications,clientId,password,"
        "status,createdOn,modified) VALUES ("
        f"'{fn}','{ln}','','{email_esc}',{int(vals['role'])},1,NULL,"
        f"'{ph}','{vals['status']}',NOW(),NOW());"
    )
    mysql_exec(ns, sql)
    uid = find_user_id_by_email(ns, email)
    if uid is None:
        raise RuntimeError(f"user insert failed for {email}")
    return uid


def mint_bearer_token(ns: str, email: str, token_name: str = "factory-seed") -> str:
    pod = leantime_pod(ns)
    proc = _run(
        [
            "kubectl",
            "-n",
            ns,
            "exec",
            pod,
            "-c",
            "leantime",
            "--",
            "php",
            "bin/leantime",
            "auth:create-bearer-token",
            f"--email={email}",
            f"--name={token_name}",
            "--quiet-output",
        ],
        check=True,
    )
    token = proc.stdout.strip()
    if not token or " " in token:
        raise RuntimeError(f"Failed to mint token for {email}: {proc.stdout!r} {proc.stderr!r}")
    return token


def delete_my_projects(ns: str) -> list[int]:
    """Delete projects named My Project (and relations). Never creates projects."""
    out = mysql_exec(ns, "SELECT id,name FROM zp_projects;")
    deleted: list[int] = []
    for line in out.splitlines():
        parts = line.strip().split("\t")
        if len(parts) < 2:
            continue
        pid_s, name = parts[0], parts[1]
        if not pid_s.isdigit() or not is_my_project_name(name):
            continue
        pid = int(pid_s)
        mysql_exec(ns, f"DELETE FROM zp_relationuserproject WHERE projectId={pid};")
        mysql_exec(ns, f"DELETE FROM zp_comment WHERE module='project' AND moduleId={pid};")
        mysql_exec(ns, f"DELETE FROM zp_tickets WHERE projectId={pid};")
        mysql_exec(ns, f"DELETE FROM zp_projects WHERE id={pid};")
        deleted.append(pid)
    return deleted


def ensure_client_project(
    ns: str,
    *,
    name: str,
    client_id: int,
    details: str = "Factory client project (seed)",
) -> int:
    ensure_not_my_project(name)
    name_esc = name.replace("'", "''")
    out = mysql_exec(
        ns,
        f"SELECT id FROM zp_projects WHERE name='{name_esc}' LIMIT 1;",
    )
    line = out.strip().splitlines()[0] if out.strip() else ""
    if line.isdigit():
        return int(line)
    details_esc = details.replace("'", "''")
    mysql_exec(
        ns,
        "INSERT INTO zp_projects (name,clientId,details,state,hourBudget,dollarBudget,"
        "menuType,psettings,type,created,modified) VALUES ("
        f"'{name_esc}',{int(client_id)},'{details_esc}',0,0,0,'','restricted',"
        f"'project',NOW(),NOW());",
    )
    out2 = mysql_exec(ns, f"SELECT id FROM zp_projects WHERE name='{name_esc}' LIMIT 1;")
    return int(out2.strip().splitlines()[0])


def assign_user_to_project(ns: str, user_id: int, project_id: int) -> None:
    out = mysql_exec(
        ns,
        f"SELECT id FROM zp_relationuserproject WHERE userId={int(user_id)} "
        f"AND projectId={int(project_id)} LIMIT 1;",
    )
    if out.strip():
        return
    mysql_exec(
        ns,
        "INSERT INTO zp_relationuserproject (userId,projectId,projectRole) VALUES "
        f"({int(user_id)},{int(project_id)},'');",
    )


def enable_cursorbridge_plugin(ns: str) -> None:
    pod = leantime_pod(ns)
    for cmd in (
        ["php", "bin/leantime", "plugin:install", "CursorBridge"],
        ["php", "bin/leantime", "plugin:enable", "CursorBridge"],
    ):
        _run(
            ["kubectl", "-n", ns, "exec", pod, "-c", "leantime", "--", *cmd],
            check=False,
        )


def read_secret_string_data(ns: str, name: str = "cursor-api-key") -> dict[str, str]:
    import base64

    raw = _kubectl_ns(ns, "get", "secret", name, "-o", "json")
    data = json.loads(raw).get("data") or {}
    return {k: base64.b64decode(v).decode() for k, v in data.items()}


def patch_secret_string_data(ns: str, string_data: dict[str, str], name: str = "cursor-api-key") -> None:
    """Replace Secret data entirely (apply merge keeps stale keys)."""
    import base64

    data_b64 = {
        k: base64.b64encode(v.encode()).decode() for k, v in string_data.items()
    }
    body = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": name, "namespace": ns},
        "type": "Opaque",
        "data": data_b64,
    }
    _run(
        ["kubectl", "replace", "-f", "-"],
        check=True,
        input_text=json.dumps(body),
    )


def seed_staff(
    ns: str,
    agents_yaml: Path,
    *,
    password: str | None = None,
    write_yaml: bool = True,
) -> dict[str, Any]:
    """Ensure staff users + PATs; update agents.yaml ids; patch Secret; drop My Project."""
    data = yaml.safe_load(agents_yaml.read_text()) or {}
    password = password or os.environ.get("FACTORY_BOT_PASSWORD") or secrets.token_urlsafe(16)
    deleted = delete_my_projects(ns)

    ids: dict[str, int] = {}
    tokens: dict[str, str] = {}
    for agent in staff_agents(data):
        name = str(agent["name"])
        email = str(agent["email"])
        uid = create_user_if_missing(
            ns, email=email, firstname=name, password=password, role=DEFAULT_ROLE
        )
        ids[name] = uid
        tokens[name] = mint_bearer_token(ns, email)

    # Client project (not My Project)
    clients = data.get("clients") or []
    project_id: int | None = None
    if clients:
        client = clients[0]
        cid = int(client.get("leantime_client_id") or 1)
        pname = client_project_name(client)
        project_id = ensure_client_project(ns, name=pname, client_id=cid)
        for uid in ids.values():
            assign_user_to_project(ns, uid, project_id)
        # also assign eric/owner id 1 if present
        assign_user_to_project(ns, 1, project_id)
        client = dict(client)
        client["project_id"] = project_id
        data_clients = [client] + list(clients[1:])
        data = dict(data)
        data["clients"] = data_clients

    data = apply_user_ids(data, ids)
    if write_yaml:
        agents_yaml.write_text(
            yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
        )

    existing = read_secret_string_data(ns)
    patch = build_secret_string_data(existing, tokens)
    patch_secret_string_data(ns, patch)

    return {
        "ids": ids,
        "tokens_minted": list(tokens.keys()),
        "deleted_my_projects": deleted,
        "project_id": project_id,
        "password": password,
    }


def main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    ns = os.environ.get("CURSORBRIDGE_NS", "sw-factory")
    root = Path(__file__).resolve().parents[3]
    agents_yaml = Path(os.environ.get("AGENTS_YAML", root / "deploy/k8s/agents.yaml"))
    result = seed_staff(ns, agents_yaml)
    # Never print raw tokens
    safe = {k: v for k, v in result.items() if k != "password"}
    safe["password_set"] = True
    print(json.dumps(safe, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
