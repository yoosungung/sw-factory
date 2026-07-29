# Incident → Leantime ticket (M9)

Factory LOOP #2 hook: cluster faults observed by infra become backlog items. Product APM UIs are out of scope.

## When to open a ticket

Create or update a Leantime ticket when discovery finds **actionable** faults, for example:

- CrashLoopBackOff / ImagePullBackOff lasting across rechecks
- Deployment rollout stuck / unavailable replicas
- Persistent Volume / DiskPressure blocking workloads
- Warning events that indicate user-visible outage

Do **not** open a ticket for every Warning event or one-off probe flake.

## Comment / ticket shape

```text
## Incident
summary: <one line>
namespace/workload: <ns>/<name>
evidence: <kubectl get/describe/logs excerpt>
impact: <unknown | user-facing | factory-only>
next: <agent-owned step or human-only>
```

- Assignee: owning product bot if known, else Eric; always `@eric` when human privilege needed.
- Status: `New` or `Blocked` (agent still owns next step) / `Waiting for Approval` (human-only).
- Prefer one ticket per incident cluster; comment updates instead of duplicates.
- Do **not** assign candy for cluster mutate/RBAC/policy just because another agent lacks verbs — candy is app PM/reviewer, not an elevated executor. Use evidence (`can-i`, Forbidden) and hand human-only gaps to Eric.

## Scheduled vs ticket-triggered

- `infra-k8s-daily`: **read-only** kubectl. If incidents found → **create/update tickets + comments only** (no mutate). Mention that daily report also lists them.
- Ticket-triggered `tenant-cd` / remediation: mutate only when the Active ticket asks for deploy/fix and policy allows.

## Feedback intake (configured channels)

- Keep `github-issue-check` schedule: tenant GH issues → Leantime tickets.
- Additional product complaint channels are install-time config (labels, extra schedules) — no product support portal in this repo.
