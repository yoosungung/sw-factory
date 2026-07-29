---
name: security-review
description: >-
  Ticket security gate before production deploy using tenant security criteria
  and commands. Comment aa: security pass|fail on the Active ticket.
version: 1.0.0
author: aa persona
license: MIT
---

# Security review (ticket gate)

Standards live in the **client repo** (`.factory/quality.yaml` `security:`).

1. On status **QA** (parallel with QA E2E): run tenant security command against the change/deploy candidate.
2. Pass: `aa: security pass` (+ brief evidence link).
3. Fail: `aa: security fail …` + developer assignee; block Deploying Prod.
