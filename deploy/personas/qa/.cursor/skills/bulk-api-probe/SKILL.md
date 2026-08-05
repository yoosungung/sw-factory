---
name: bulk-api-probe
description: >-
  Direct bulk request/response quality checks against app servers using tenant
  bulk_api specs. Use for ticket (when configured) and weekly qa-bulk-weekly.
version: 1.1.0
author: qa persona
license: MIT
---

# Bulk API probe

1. **Sync first** (weekly or when criteria may have changed) — `tenant-repo-sync` → `synced: repo_id=… sha=… path=…`. Read `.factory/quality.yaml` from that path.
2. Read tenant `bulk_api:` (endpoints, payload, success criteria).
3. Run against the configured base URL (usually test).
4. Ticket context: comment `bulk_api: pass|fail …` on Active ticket when part of the gate.
5. Weekly: for each client, run suite; failures → `New` ticket on `clients[].project_id`.
6. **Long-run** (ARCHITECTURE §2.6 #10): if suite/`long_run: true` ≫ session budget — detach, do not foreground-wait; keep `nf-progress:` heartbeats; on pm nudge verify alive vs restart.
