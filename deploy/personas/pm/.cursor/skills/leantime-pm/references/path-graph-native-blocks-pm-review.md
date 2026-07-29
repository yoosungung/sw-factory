# Path-graph native blocks parser PM review pattern

Session-specific lesson from Task #260 / subtask #273.

## Trigger

Use when a path-graph developer replies to a Leantime PM design question and/or posts a documentation/contract PR for the native blocks parser migration (`markitdown` / `md_heuristic` retirement).

## Durable PM decisions captured

- Office route: prefer `unstructured[docx,pptx,xlsx]` light extras only.
  - Do not add LibreOffice, tesseract, poppler, or `unstructured[all-docs]` for this scope.
  - `.doc/.ppt` remain rejected/dead-letter.
  - `.xls` may be attempted via xlsx/xlrd support, but failure should become dead_letter and be documented.
- PDF route: prefer a PyMuPDF single-stack decision.
  - Use PyMuPDF for router metrics and rendering, plus `pymupdf4llm` for reading-order blocks if needed.
  - Avoid adding pypdf/pdfminer just for routing unless a later implementation proves PyMuPDF insufficient.
- Office embedded image VLM caption: split to a follow-up ticket, not this initial native-blocks migration.
- Implementation order used in Leantime: docs/contract first, then parser routing, then blocks adapter/type-aware chunking, then VLM/test/deploy verification.

## Review workflow for documentation PRs

1. Read parent ticket comments as well as the subtask. Developers may post the PR URL on the parent (#260) while the review belongs to a subtask (#273).
2. Clone/fetch the PR and inspect changes to `ARCHITECTURE.md`, `pipeline/DESIGN.md`, `ROADMAP.md`, and any status files like `AGENTS.md`.
3. Verify the docs reflect the PM decision above and do not leave contradictory contract language.
4. Run:
   - `git diff --check main..pr-<n>`
   - `make test` when practical, even for docs-only contract changes; this repo’s docs/contracts can be tied to test expectations.
5. Compare GitHub checks to local results. If local tests pass but GitHub `test` is failing, do not mark the subtask Done or approve/merge. Leave a Leantime comment saying the content is approval-worthy but CI must be rerun or investigated first.
6. Keep the parent In Progress until all implementation/deploy evidence exists. Keep the subtask In Progress when CI or formal review is unresolved.

## Native PDF / VLM implementation PR slice review

For subtask #280-style PRs that implement only part of the VLM/test/deploy scope:

1. Verify canonical mapping first: parent #260 visible subtasks should still show the active #280 subtask; do not trust only a PR title mentioning `#280`.
2. Fetch the PR head locally and inspect `pipeline/src/path_graph/parsers/*`, `pipeline/src/path_graph/steps/ingest.py`, dependency files, and focused tests. Confirm the diff matches the claimed slice (e.g. PDF metrics, `pymupdf4llm → adapter → blocks`, scan OCR/dead_letter, `parse_backend` metadata) and does not silently claim the still-open crop caption / Docker smoke / Office Unstructured work.
3. If the ambient candy/agent-runner Python lacks project test dependencies, use the repo's uv workflow with dev extras, e.g. `cd pipeline && uv run --extra dev python -m pytest -q`. If that rewrites `uv.lock` or otherwise dirties the worktree during review, restore the local artifact before reporting/merging unless the lockfile change is intentionally part of the PR.
4. Require both local tests and GitHub checks. For the PR #6 pattern, acceptable evidence was local `317 passed, 4 skipped` plus GitHub Actions `test` and `k8s-manifests` success.
5. After merge, record the merge commit and evidence in Leantime, but keep #280 `In Progress` and assign/mention the developer when remaining criteria still include crop→SGLang caption→image block, Docker/dependency smoke, deployment target/image tag, or full markitdown/Office cleanup.

## Leantime comment shape

Record concise evidence:

- PR URL
- content verdict
- `git diff --check` result
- local test result
- GitHub check state
- explicit next action (rerun CI, investigate failure, or proceed to next subtask)

If GitHub write auth is invalid, separate the content verdict from the formal-review blocker. Do not call the ticket Done solely because local review passed.
