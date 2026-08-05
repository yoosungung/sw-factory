# Assignee runtime check (PM stall ladder)

Use when PM `@ta` with marker **`assignee-runtime-check`** on a Deploying*/QA ticket after assignee health-check silence (ARCHITECTURE §2.6 #14). Complementary to agent-runner R1–R5 — do **not** re-run EX/E2E/security/tenant_cd.

## Scope

1. Identify assignee agent Pod (e.g. `cursor-agent-qa-0` in `sw-factory`).
2. Check Pod Ready / restarts / recent Warning events.
3. Tail runner logs for that `ticket_id`: `session.prompt.skipped` (`active_run`/`mutex`), `session.recover`, `run.completed`, `run.background.failed`.
4. Classify **alive** vs **dead**; leave one outcome comment; re-mention original assignee when work should resume.

## Commands (adapt ns/name)

```bash
kubectl -n sw-factory get pod -l app=cursor-agent -o wide
kubectl -n sw-factory describe pod <assignee-pod>
kubectl -n sw-factory logs <assignee-pod> --tail=200 | grep -E 'ticket.?id|session\.(prompt\.skipped|recover)|active_run|run\.(completed|background\.failed)' || true
```

Do not print secrets/tokens.

## Outcome shape

```html
<p><b>TA Outcome → assignee-runtime-check</b> (PM …)</p>
<p><b>Pod:</b> … Ready?/restarts</p>
<p><b>Logs:</b> skipped_active_run? session.recover? last run.completed?</p>
<p><b>Verdict:</b> alive | dead</p>
<p><b>Next</b> @assignee: resume …  — or restart/Blocked/new session (skip dup restart if session.recover already succeeded).</p>
```

- **alive:** original assignee owns next step; ask for progress/`nf-progress:` only.
- **dead:** restart session or `Blocked` with evidence; if R1–R5 already recovered (`session.recover` ok), re-attach assignee instead of a second restart.
- Human-only (secrets/RBAC/policy) → `@eric` + `Waiting for Approval`.
