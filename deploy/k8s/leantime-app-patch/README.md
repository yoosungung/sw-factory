# leantime-app-patch overlays

Cluster ConfigMap `leantime-app-patch` (NS `sw-factory`) mounts PHP/blade overlays into the Leantime Deployment.

## Tickets.Repositories.php (#60)

`getStateLabels` resolves `session('currentProject')` **before** the cache lookup so a sessionless seed write under `projectsettings..ticketlabels` cannot poison Kanban columns.

## showAll*.blade.php (filename cards)

Upstream hard-truncates card labels with `substr($file['realName'], 0, 10) . '(...).' . $file['extension']`. Ticket Files uses `files::submodules.showAll`; the Files page uses `files.showAll`. Both overlays show the full `realName.extension` (with wrap + `title` tooltip).

| ConfigMap key | Mount path |
|---------------|------------|
| `showAll.submodules.blade.php` | `/var/www/html/app/Domain/Files/Templates/submodules/showAll.blade.php` |
| `showAll.blade.php` | `/var/www/html/app/Domain/Files/Templates/showAll.blade.php` |

### Apply (needs ConfigMap write)

```bash
NS=sw-factory
ROOT=deploy/k8s/leantime-app-patch
# Prefer merging keys into the existing CM (do not wipe unrelated overlays).
kubectl -n "$NS" create configmap leantime-app-patch \
  --from-file=Tickets.Repositories.php="$ROOT/Tickets.Repositories.php" \
  --from-file=showAll.submodules.blade.php="$ROOT/showAll.submodules.blade.php" \
  --from-file=showAll.blade.php="$ROOT/showAll.blade.php" \
  --dry-run=client -o yaml | kubectl apply -f -   # only if CM is owned by these keys; else patch data keys

# volumeMount (ticket Files tab — required; top-level showAll may already be mounted):
# mountPath: /var/www/html/app/Domain/Files/Templates/submodules/showAll.blade.php
# subPath: showAll.submodules.blade.php
kubectl -n "$NS" rollout restart deploy/leantime
```

RBAC note: agent SA may `get/list` ConfigMaps only — CM merge is TA/platform.
