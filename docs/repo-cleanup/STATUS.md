# Repo cleanup status and deferred work

Date: 2026-10-15
Repository: `gry17051997-commits/3gf`
Baseline: `main` at `82ea492d949689ca4dbe4c7b27cdbcbcaff7acac`
Working branch: `chore/repo-cleanup-audit-2026-10-15`

## Safety rules

- Do not modify `main` directly.
- Do not delete any branch until its complete tree has been compared with the current main tree and unique changes have been classified.
- Preserve `backup/2026-10-11-current-stage` and `backup/2026-10-13-maptiler-working` until recovery and MapTiler behavior have been verified.
- Do not delete or refactor GPS, API, map, app bootstrap, build scripts, or runtime files as part of cosmetic cleanup.
- Keep deferred items here and revisit them after prerequisites become available.

## Initial findings

- The current `main` tree contains 67 entries.
- The branch list contains 79 branches at audit start, including `main`; a cleanup working branch has since been created.
- The current main commit and the listed branch tip commits appear to have no Git parents in the GitHub API. Standard ancestry-based branch comparisons therefore return “No common ancestor”. Branches must be compared by their file trees and blob SHAs, not assumed merged/unmerged from ancestry.
- `GrafikPracy_Final/AppRuntime.js` is about 191 KB. It is a refactoring candidate, not a deletion candidate.
- Root workflows include multiple APK, diagnostic, validation, web deployment, audit-package, backend and CodeQL workflows. Consolidation must preserve distinct checks and artifact behavior.
- `GrafikPracy_Final/.github/workflows/web.yml` is nested under the app directory and is not a standard GitHub Actions workflow location. However, it claims to be a regression fixture, so do not remove until its test dependency is checked.
- `GrafikPracy_Final/functions/package.json` exists without visible function source in the current tree. Verify whether this folder is obsolete before removing it.
- Root audit files can potentially be organized under `docs/audits/`, but workflows that copy them must be updated in the same change.
- README describes central API + PostgreSQL; ROADMAP contains older Firebase references. Reconcile documentation only after checking the actual implementation and current product direction.

## Work in progress

1. Compare every branch tip against `main` using recursive tree snapshots and per-file blob SHAs because ancestry comparison is unavailable.
2. Classify branches into: identical tree, same tree except documentation/workflows, unique source changes, backup/recovery, and unclear.
3. Audit workflow overlap and document exact safe consolidation candidates.
4. Inspect package scripts and build workflows for deterministic execution differences.
5. Prepare file organization as a separate, reviewable change.
6. Run available tests and build checks on the working branch before proposing a PR.

## Deferred items to revisit later

- Delete branches only after tree-diff report confirms no unique or needed recovery content.
- Remove `GrafikPracy_Final/functions/` only after confirming no deployment, import, or workflow references.
- Remove nested `GrafikPracy_Final/.github/workflows/web.yml` only after confirming tests do not rely on it.
- Move root audit files only together with updates to all workflow references.
- Consolidate workflows only after confirming the replacement retains APK artifacts, runtime diagnostics, web deployment, backend checks, and CodeQL.
- Refactor `AppRuntime.js` only after mapping imports and adding regression coverage; do not combine this with repository cleanup.
- Revisit unresolved GPS/map/runtime changes only after comparing the working MapTiler backup and the current main behavior.

## No destructive cleanup performed

This report and the working branch are preparatory. No branch has been deleted, no production source file has been changed, and `main` has not been modified.
