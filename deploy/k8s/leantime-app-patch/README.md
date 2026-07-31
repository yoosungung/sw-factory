# leantime-app-patch overlays

Cluster ConfigMap `leantime-app-patch` (NS `sw-factory`) mounts PHP/blade overlays into the Leantime Deployment.

## Tickets.Repositories.php (#60)

`getStateLabels` resolves `session('currentProject')` **before** the cache lookup so a sessionless seed write under `projectsettings..ticketlabels` cannot poison Kanban columns.

### Apply (needs ConfigMap write)

```bash
NS=sw-factory
kubectl -n "$NS" create configmap leantime-app-patch \
  --from-file=Tickets.Repositories.php=deploy/k8s/leantime-app-patch/Tickets.Repositories.php \
  --dry-run=client -o yaml | kubectl apply -f -   # prefer merge with existing keys
# Or patch existing CM data key, then add volumeMount:
# mountPath: /var/www/html/app/Domain/Tickets/Repositories/Tickets.php
# subPath: Tickets.Repositories.php
kubectl -n "$NS" rollout restart deploy/leantime
```

RBAC note: agent SA may `get/list` ConfigMaps only — CM merge is TA/platform.
