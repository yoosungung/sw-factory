---
name: load-weekly
description: >-
  Weekly load test per Leantime client using tenant .factory/quality.yaml load
  commands. File New tickets on the client project for failures.
version: 1.1.0
author: ta persona (TA)
license: MIT
---

# Load weekly (NF)

1. **Sync first** — follow `tenant-repo-sync` for every `clients-repos-registry.json` entry. Record `synced: repo_id=… sha=… path=…` (or skip reason). Do not read stale `/workspace/repo` as a product tree.
2. For each synced product repo with `.factory/quality.yaml` `load:` — run the tenant command against **test** env from the synced `path`.
3. On failure/regression: `create_ticket` on that client's `project_id` (New) with summary + log link. Tag/assign PM (`pm`) or developer as appropriate.
4. Do not change feature ticket Done gates. Do not deploy prod from this skill.

## Long-run (ARCHITECTURE §2.6 #10)

If the tenant command (or `long_run: true`) is expected to exceed the schedule session/`budget.timeout_ms`:

1. **Detach** — start via `nohup`/background Job; do **not** wait in the schedule session.
2. Comment start evidence on the NF ticket (pid, log path, command).
3. Ensure **`nf-progress:`** heartbeats (worker or watcher) until done/fail; then final outcome comment.
4. On pm stall nudge: verify alive vs dead — restart only if dead.
