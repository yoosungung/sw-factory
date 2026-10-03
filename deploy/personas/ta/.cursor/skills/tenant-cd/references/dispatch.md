# Dispatch (workflow_dispatch)

Identity from registry: `git_repo_url`, `repo_id`, **`client_id`**.  
Workflow from tenant git, **not** factory yaml: checkout `cd_path` (default `.factory/cd.yaml`).

```yaml
# .factory/cd.yaml (in the product repo)
workflow: deploy.yml
ref: main
image_input: image_tag
```

Missing `cd_path` file → skip CD (do not invent workflow names).  
If only `.github/workflows/*.yml` exists and `cd.yaml` is absent, still skip unless `cd.yaml` names the workflow.

Parse `owner/repo` from `git_repo_url`. Use `merge_sha` as the image/sha input.

```bash
REPO="<owner>/<name>"
WORKFLOW="<workflow from .factory/cd.yaml>"
REF="<ref from cd.yaml>"
SHA="<merge_sha>"
IMAGE_INPUT="<image_input from cd.yaml>"
ENV="<test|production>"   # feature loop: test first, then production

gh workflow run "$WORKFLOW" --repo "$REPO" --ref "$REF" \
  -f "environment=${ENV}" \
  -f "${IMAGE_INPUT}=${SHA}"
```

Always set `-f environment=` for the phase you are running.

```bash
gh run list --repo "$REPO" --workflow "$WORKFLOW" --branch "$REF" --limit 5
gh run watch <run-id> --repo "$REPO" --exit-status
gh run view <run-id> --json url,conclusion,status,headSha
```

Require `conclusion=success`. Record `test_workflow_*` or `prod_workflow_*` accordingly.

On failure: read job annotations. Platform messages (billing, spending limit, job not started) stay **TA** — escalate `@eric`; do not reassign Actions watch to QA/AA.
