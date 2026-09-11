# Publish cursor-agent-runner (GHCR)

Use when Deploying Test needs a fresh `ghcr.io/<owner>/cursor-agent-runner` image (e.g. leantime-mcp schema change) and you must not run `docker` in-cluster.

Packages push is done by GitHub Actions `GITHUB_TOKEN` (`packages:write`). Your `GH_TOKEN_ta` only needs **Actions write** on `sw-factory` (plus Contents/PR on `k8s-test` / tenant repos for CD).

## Dispatch

Repo: factory `sw-factory` (the repo that contains `.github/workflows/publish-runner.yml`).

```bash
REPO="<owner>/sw-factory"   # e.g. yoosungung/sw-factory
TAG=latest                  # or a version tag

gh workflow run publish-runner.yml --repo "$REPO" -f "tag=${TAG}"
gh run list --repo "$REPO" --workflow publish-runner.yml --limit 3
gh run watch <run-id> --repo "$REPO" --exit-status
```

Require `conclusion=success`. Record `test_workflow_run_url` / `test_workflow_conclusion` on the Active ticket.

## Rollout agents

After the image is on GHCR:

```bash
kubectl -n sw-factory rollout restart statefulset -l app=cursor-agent
kubectl -n sw-factory rollout status statefulset/cursor-agent-ta --timeout=180s
```

Verify the new digest if needed (`kubectl get pod … -o jsonpath='{.status.containerStatuses[0].imageID}'`).

## Do not

- `docker buildx … --push` from the agent Pod (no docker).
- Ask Eric for `write:packages` on the shared `GH_TOKEN` — use this workflow instead.
- Use shared `GH_TOKEN` for package push.
