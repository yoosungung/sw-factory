---
name: rhwp-upstream-sync
description: >-
  edwardkim/rhwp GitHub Release가 올라가면 rhwp_batch의 rhwp/를 맞추고
  테스트한 뒤 같은 버전 태그로 GitHub Action 배포한다. 매일
  rhwp-batch-upstream-check 스케줄 시 적용.
---

# rhwp upstream sync (daily)

`rhwp-batch-upstream-check` 스케줄용. **ticketless**로 시작. 할 일이 있으면 해당 `project_id`에 티켓을 만들고 그 티켓만 쓴다.

| 항목 | 값 |
|------|-----|
| Upstream | `https://github.com/edwardkim/rhwp` |
| Downstream | `repos/rhwp_batch` (`primary_repo`) |
| Crate dest | `$ROOT/rhwp/` (무수정 복사) |
| Release Action | `.github/workflows/release.yml` on `push` tags `v*` |

`$ROOT` = persona checkout `workspaces/rhwp_batch/repos/rhwp_batch`. `client_id`/`project_id`는 `.cursor/clients-repos-registry.json`의 `rhwp_batch` 행.

## 0. Versions

```bash
cd "$ROOT"
git pull --ff-only origin main || git pull --ff-only origin master
CUR=$(sed -n 's/^version = "\([^"]*\)"/\1/p' rhwp/Cargo.toml | head -1)
LATEST=$(gh release view --repo edwardkim/rhwp --json tagName --jq .tag_name)
# LATEST is v0.8.7 → VER=0.8.7
VER=${LATEST#v}
```

Missing `gh` / 401 → 티켓(New) + blocker + `@eric`, stop.

## 1. Already current?

- `CUR == VER` **and** `git rev-parse "v$VER"` exists on origin → **no-op**. Short reply. No ticket.
- `CUR == VER` but tag `v$VER` **missing** on origin → jump to **§4 Tag**.
- Open factory ticket with marker `<!-- rhwp-upstream:v$VER -->` → resume that ticket (do not create a second).

## 2. New release → ticket

`create_ticket` on rhwp_batch `project_id`, `type=task`, assignee=self, `in_progress`:

- title: `Sync rhwp $LATEST`
- description: marker `<!-- rhwp-upstream:v$VER -->` + upstream release URL + Goal/AC (copy crate, tests green, same-version GH release)

Dedup search `list_tickets` for that marker first.

## 3. Copy crate · test · PR

Upstream root **is** the `rhwp` crate (`Cargo.toml` `name = "rhwp"`) plus Studio/wasm/… **Do not** copy the whole tree.

```bash
TMP="/tmp/rhwp-upstream-$VER"
rm -rf "$TMP"
git clone --depth 1 --branch "$LATEST" https://github.com/edwardkim/rhwp.git "$TMP"

# crate subset only — keep local rhwp/DESIGN.md (분석 문서)
rsync -a --delete "$TMP/src/" "$ROOT/rhwp/src/"
cp "$TMP/Cargo.toml" "$ROOT/rhwp/Cargo.toml"
if [ -d "$TMP/examples" ]; then rsync -a --delete "$TMP/examples/" "$ROOT/rhwp/examples/"; fi
if [ -d "$TMP/saved" ]; then rsync -a --delete "$TMP/saved/" "$ROOT/rhwp/saved/"; fi

# match package version
# rhwp-batch/Cargo.toml version = "$VER"
# README/ROADMAP 배너에 $LATEST 한 줄 (범위 밖 장문 금지)

cargo test -p rhwp-batch
# lockfile 갱신이 필요하면 cargo generate-lockfile / cargo update -p rhwp 후 재테스트
```

- `rhwp/` 안의 로직을 고치지 않는다. 테스트 실패 → 티켓 Blocked + log 증거 + `@pm` (무수정 원칙; 어댑터만 고칠지 옵션을 코멘트).
- 성공 → `git-ship` PR (`feature/rhwp-upstream-v$VER`). `@pm` + `test:` 증거. **이 턴에서 merge/tag 금지**(리뷰 전).
- Long-run: `nf-progress:` 하트비트. 포그라운드 무한 대기 금지.

## 4. Tag → GitHub Action

When `rhwp/Cargo.toml` version is `$VER` **on default branch** (PR merged) and origin has **no** `v$VER`:

```bash
git checkout main && git pull --ff-only
git tag -a "v$VER" -m "rhwp-batch $VER tracking edwardkim/rhwp $LATEST"
git push origin "v$VER"
```

`.github/workflows/release.yml` builds Linux/macOS binaries and GHCR image for that tag. Watch `gh run list --repo yoosungung/rhwp_batch --branch v$VER`. Failure → ticket comment + `@ta`. Success → `prod:` 증거, ticket `done` (or leave for pm if Review 게이트가 열려 있으면 `@pm`만).

Do **not** `git push --force`. Do not retag a moved SHA.

## Budget

- One `$VER` per run. Pre-releases (`-alpha` / `-rc`) skip unless already tracking that channel.
- Final reply: `noop` | `ticket+PR` | `tagged` | `blocked` with versions `cur`/`latest`.
