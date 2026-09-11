# Severity

| Level | Ticket? | Criteria |
|-------|---------|----------|
| **High** | Yes | Likely defect, data loss, swallowed errors at boundaries, or change that fans out / breaks distant areas (`design.fragility` / `design.rigidity` with concrete evidence). |
| **Med** | Yes | Local maintainability debt with clear impact: opaque names in hot paths, mixed abstraction in a hotspot, missing tests on critical path, leaky boundaries. |
| **Low** | No | Style preference, minor naming nit, formatting already covered by mechanical tools, speculative cleanup. Mention in run summary only. |

## Rules

- No High/Med without **path + impact sentence**.
- Mechanical lint failure → usually Med (or High if it blocks CI / hides real errors); still write structured tickets, not raw log paste alone.
- Prefer fewer accurate tickets over filling the `max_findings` quota.
