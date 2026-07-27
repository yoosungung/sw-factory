# Dispatch (workflow_dispatch)

Registry fields: `tenant_cd.workflow`, `ref`, `inputs`, `image_input`, plus tenant `git_repo_url`.

Parse `owner/repo` from `git_repo_url` (strip `.git`, use path after `github.com/`).

```bash
REPO="<owner>/<name>"   # from git_repo_url
WORKFLOW="<workflow>"   # e.g. deploy.yml
REF="<ref>"             # e.g. main
SHA="<merge_sha>"       # from Leantime comment
IMAGE_INPUT="<image_input>"  # default image_tag

# Build -f flags: static inputs + image tag
# Example:
gh workflow run "$WORKFLOW" --repo "$REPO" --ref "$REF" \
  -f environment=production \
  -f "${IMAGE_INPUT}=${SHA}"
```

Wait for the run that was just created (newest matching workflow on that ref):

```bash
# After dispatch, resolve run id then watch:
gh run list --repo "$REPO" --workflow "$WORKFLOW" --branch "$REF" --limit 5
gh run watch <run-id> --repo "$REPO" --exit-status
gh run view <run-id> --repo "$REPO" --json url,conclusion,status,headSha
```

Require `conclusion=success`. Record `workflow_run_url` and `workflow_conclusion=success` for the evidence comment.

If dispatch or watch fails: comment the error, stop verify, escalate `@eric` when auth/RBAC/workflow missing.
