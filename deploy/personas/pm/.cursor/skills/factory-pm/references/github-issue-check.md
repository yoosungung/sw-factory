# GitHub issue check

Use when schedule `github-issue-check` runs, or admin asks to sync GitHub issues into factory tickets.

Registry: `.cursor/github-issues-registry.json` (ensure/seed writes it for **pm** from `agents.yaml` `repos[]` that have **both** `client_id` and `project_id`). Empty/`repos: []` → no-op with a short final reply. Do **not** invent extra repos (skip `nl2sql`/`org-wiki` style catalog rows).

## Per-repo steps

1. **Read registry entry:** `repo_id`, `git_repo_url`, `client_id`, `project_id`. Missing `project_id` → skip.
2. **Parse** `owner/repo` from `git_repo_url` (strip `.git`). Invalid URL → skip with reason.
3. **List open issues** (not PRs, not Actions):
   ```bash
   gh issue list -R "$owner/$repo" --state open --limit 50 \
     --json number,title,url,createdAt,labels,body
   ```
   `GH_TOKEN`/`GITHUB_TOKEN` if private. Failure → skip that repo with reason (do not invent issues).
4. **Dedup:** marker `<!-- github-issue:{repo_id}:{number} -->`. `list_tickets` on `project_id`; skip if any ticket description/comments already has that marker.
5. **New issue → ticket** on that `project_id` (`create_ticket`, `type=task`, default backlog):
   - title = GH title (trim; keep readable)
   - description = marker + GH URL + short body excerpt + intake skeleton (Goal/AC from the issue; do not invent product scope)
   - assignee = pm (intake). Do not `@mention` a storm; one intake comment is enough.
6. **Existing ticket + blocker** (issue labeled blocker/`blocked`, or body says blocked): `add_comment` on the matching ticket with the GH URL. No duplicate blocker comments in the same run.
7. **Out of scope:** GitHub Actions / CD / k8s (ta). Do not close GH issues. Do not clone the git tree unless `gh` cannot run.

## Run budget

- At most **10** new tickets this run. Remaining open issues → session reply `skipped remaining N`.
- Final reply lists `created` / `commented` / `skipped` with `repo_id#number`.
