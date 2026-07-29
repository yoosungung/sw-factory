---
name: clean-code-weekly
description: >-
  Weekly clean-code checks per client using tenant clean_code criteria.
  File New tickets on the client project for findings.
version: 1.0.0
author: aa persona
license: MIT
---

# Clean code weekly (NF)

1. For each `clients[]` repo with `clean_code:` in `.factory/quality.yaml`, run tenant command.
2. Findings → `New` ticket on that client's `project_id` (not a feature Done field).
3. Do not confuse with ticket `security-review` (prod gate).
