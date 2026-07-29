---
name: browser-e2e
description: >-
  Run tenant E2E scenarios in a real browser against the test environment.
  Use for ticket QA gate, GitHub issue reproduction, and scenario registration.
version: 1.0.0
author: qa persona
license: MIT
---

# Browser E2E (ticket gate)

Criteria/scenarios live in the **client repo** (`.factory/quality.yaml` `e2e:` + scenario files). Do not invent product acceptance in the factory.

1. Resolve `client_id` + test base URL from ticket / registry / quality.yaml.
2. Drive the browser through the scenario steps (tenant-authored). Capture pass/fail evidence (screenshot/log URL).
3. On **pass**: `add_comment` on Active ticket:
   `qa: e2e pass scenario=<id> evidence=<url>`
4. On **fail**: comment failure + assign developer; status `In Progress` or `Blocked`. Do not allow Deploying Prod.
5. GitHub issue: reproduce in test env → register/update scenario in tenant repo → create internal ticket on client `project_id` for PM.
