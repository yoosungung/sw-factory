# leantime-app-patch overlays

Cluster ConfigMap `leantime-app-patch` (NS `sw-factory`) mounts PHP/blade overlays into the Leantime Deployment.

## Tickets.Services.php (Kanban/To-Do default `not_done`)

When the board search has no `status` param, default to `not_done` (Done/Archived hidden) — same rule as milestone overview. Explicit `status=all` / Done / id list still wins. Generated from live Leantime **3.9.7** via `tickets_services_not_done.py` (do not hand-edit the overlay).

```bash
CURSORBRIDGE_NS=sw-factory ./deploy/k8s/scripts/apply-tickets-services-not-done.sh
```

| ConfigMap key | Mount path |
|---------------|------------|
| `Tickets.Services.php` | `/var/www/html/app/Domain/Tickets/Services/Tickets.php` |

## Tickets.Repositories.php (#60)

`getStateLabels` resolves `session('currentProject')` **before** the cache lookup so a sessionless seed write under `projectsettings..ticketlabels` cannot poison Kanban columns.

## showAll*.blade.php (filename cards)

Upstream hard-truncates card labels with `substr($file['realName'], 0, 10) . '(...).' . $file['extension']`. Ticket Files uses `files::submodules.showAll`; the Files page uses `files.showAll`. Both overlays show the full `realName.extension` (with wrap + `title` tooltip).

| ConfigMap key | Mount path |
|---------------|------------|
| `showAll.submodules.blade.php` | `/var/www/html/app/Domain/Files/Templates/submodules/showAll.blade.php` |
| `showAll.blade.php` | `/var/www/html/app/Domain/Files/Templates/showAll.blade.php` |

## Discussion pagination (ticketdetails / large threads)

Ticket #564-class threads (hundreds of top-level comments) stall Kanban `ticketdetails` because `ShowTicket` loads every row and `generalComment` Blade-renders them all, each with reactions `hx-trigger="load"`.

Factory overlay (Leantime **3.9.7**):

- SQL `limit`/`offset` on `Comments` repo/service (RPC/MCP unlimited when omitted).
- `ShowTicket` initial window **20** + accurate `countComments` for the tab badge.
- `generalComment` + `commentItems` / HTMX `comments/thread/more` — sentinel **Load older comments** with `hx-trigger="intersect once"` (scroll-to-end ≈ click; still 20/page).
- Reactions also use `intersect once` (no N concurrent GETs on open).

```bash
CURSORBRIDGE_NS=sw-factory ./deploy/k8s/scripts/apply-discussion-pagination.sh
```

| ConfigMap key | Mount path |
|---------------|------------|
| `Comments.Repositories.php` | `.../Comments/Repositories/Comments.php` |
| `Comments.Services.php` | `.../Comments/Services/Comments.php` |
| `ShowTicket.php` | `.../Tickets/Controllers/ShowTicket.php` |
| `generalComment.blade.php` | `.../Comments/Templates/submodules/generalComment.blade.php` |
| `commentItems.blade.php` | `.../Comments/Templates/partials/commentItems.blade.php` |
| `commentPage.blade.php` | `.../Comments/Templates/partials/commentPage.blade.php` |
| `Comments.Hxcontrollers.Thread.php` | `.../Comments/Hxcontrollers/Thread.php` |

### Apply (needs ConfigMap write)

Prefer the apply scripts above (merge keys + mount + rollout). Manual merge must not wipe unrelated CM keys; drop `kubectl.kubernetes.io/last-applied-configuration` when replacing large PHP overlays (256KiB annotation limit).

```bash
NS=sw-factory
ROOT=deploy/k8s/leantime-app-patch
kubectl -n "$NS" rollout restart deploy/leantime
```

RBAC note: agent SA may `get/list` ConfigMaps only — CM merge is TA/platform.
