---
name: opik-eval
description: >-
  Connect agent-app experimental datasets to Opik (Comet) evaluate/experiments
  per tenant opik: config. Use on ticket gate when configured and weekly bulk.
version: 1.0.0
author: qa persona
license: MIT
---

# Opik eval

Factory does not host Opik. Tenant `.factory/quality.yaml` `opik:` supplies `project_name`, dataset, entrypoint.

1. Run tenant eval entrypoint (dataset → experiment).
2. Pass: comment `opik: pass experiment=<name> …` (ticket) or skip ticket create (weekly success).
3. Fail/regression: Active ticket fail feedback or weekly `New` ticket on client project.
4. **Long-run** (ARCHITECTURE §2.6 #10): full EX / large Opik runs ≫ session budget — **detach** (`nohup`/Job); comment pid/log; require tenant progress file or `nf-progress:` heartbeats; session must not block on evaluate(). pm nudge = health check only (alive → progress ask; dead → restart/`Blocked`).
