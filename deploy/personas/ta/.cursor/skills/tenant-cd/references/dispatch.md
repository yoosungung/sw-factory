# Dispatch (workflow_dispatch)

Registry: `tenant_cd.workflow`, `ref`, `inputs`, `image_input`, `git_repo_url`, `repo_id`, **`client_id`**.

Parse `owner/repo` from `git_repo_url`.

```bash
REPO="<owner>/<name>"
WORKFLOW="<workflow>"
REF="<ref>"
SHA="<merge_sha>"
IMAGE_INPUT="<image_input>"
ENV="<test|production>"   # feature loop: test first, then production

gh workflow run "$WORKFLOW" --repo "$REPO" --ref "$REF" \
  -f "environment=${ENV}" \
  -f "${IMAGE_INPUT}=${SHA}"
```

Registry `inputs.environment` may default to `test`; **always** set `-f environment=` for the phase you are running.

```bash
gh run list --repo "$REPO" --workflow "$WORKFLOW" --branch "$REF" --limit 5
gh run watch <run-id> --repo "$REPO" --exit-status
gh run view <run-id> --repo "$REPO" --json url,conclusion,status,headSha
```

Require `conclusion=success`. Record `test_workflow_*` or `prod_workflow_*` accordingly.
