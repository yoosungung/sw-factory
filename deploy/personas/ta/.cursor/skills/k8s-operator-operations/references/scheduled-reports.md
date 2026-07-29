# Scheduled reports

Default cadence for DiskPressure/local-path/GPU clusters: **daily**. Prompt must be explicitly read-only unless Eric granted deployment authority.

## Repo refresh gate

Before inspection on a repo-backed worktree:

1. `git status --short --branch`
2. `git pull --ff-only origin main` only when worktree is clean
3. If local changes, pull conflicts, or non-main branch: do not auto-resolve; report the blocker

## Dynamic discovery

Do not rely only on a hard-coded workload list. Start with:

```bash
kubectl get ns
kubectl get deploy,statefulset,daemonset,svc,ingress,endpoints -A
kubectl get pv,pvc -A
```

Call out newly observed namespaces/services briefly; treat as managed from the next run.

## Report format

```text
k8s 운영 리포트 - YYYY-MM-DD
상태 요약: 정상/주의/장애/접근불가

주요 발견사항
- ...

PV/PVC 상태
- ...

조치 권장사항
- ...

Eric 확인 필요
- ...

Incident tickets
- <ticket id or "none"> — actionable CrashLoop/rollout/PV only (see incident-tickets.md)
```

Actionable faults: open/update Leantime tickets per `incident-tickets.md` (still **no** kubectl mutate on the daily schedule).

Schedule entry lives in `deploy/k8s/agents.yaml` `settings.schedules` (`infra-k8s-daily`), not Hermes cron.
