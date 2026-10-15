# Repo cleanup status and deferred work

Date: 2026-10-15  
Repository: `gry17051997-commits/3gf`  
Baseline: `main` at `82ea492d949689ca4dbe4c7b27cdbcbcaff7acac`  
Working branch: `chore/repo-cleanup-audit-2026-10-15`

## Safety rules

- Do not modify `main` directly.
- Do not delete a branch until its complete tree has been compared with `main` and unique changes have been classified.
- Preserve `backup/2026-10-11-current-stage` and `backup/2026-10-13-maptiler-working` until recovery and MapTiler behavior have been verified.
- Do not delete or refactor GPS, API, map, app bootstrap, build scripts, or runtime files as part of cosmetic cleanup.
- Deferred work must remain documented here and in `BRANCH_TREE_AUDIT.md`.

## Completed on this working branch

- Created `docs/repo-cleanup/BRANCH_TREE_AUDIT.md` with tree/blob comparisons for all 78 existing non-main branches.
- Created `docs/audits/` and moved the current audit instructions/context/request there, updating them to the central API + PostgreSQL architecture.
- Updated `.github/workflows/gemini-audit-package.yml` to package the new documentation paths.
- Removed obsolete root copies of the audit documents after updating their workflow references.
- Removed `AUDIT_PACKAGE_TRIGGER.txt`; it was not referenced by a workflow.
- Removed `GrafikPracy_Final/.github/workflows/web.yml`; it was a nested, manually triggered workflow fixture and was not referenced by the regression test suite.
- Removed `GrafikPracy_Final/functions/package.json`; it was the only file in the functions directory, and current app config/README/tests describe central API + PostgreSQL, not Firebase Functions.
- Reduced duplicate automatic CI runs: `android-apk.yml`, `diagnostic-apk.yml`, `full-audit.yml`, and `gemini-audit-package.yml` are now manual-trigger workflows. PR validation remains responsible for its automated tests/build; production APK and web deployment remain separate.
- No production application source files were modified. GPS, map, API, runtime and build-fix scripts remain untouched.
- `main` has not been modified.

## Branch audit findings

- The repository had 79 branches at audit start; a separate cleanup branch has since been added.
- GitHub's compare endpoint reports “No common ancestor” for the old branch tips. The audit therefore compared recursive trees and file blob SHAs instead of relying on merge ancestry.
- Exact same-tree groups and low-difference GPS/API branches are listed in `BRANCH_TREE_AUDIT.md`.
- Several branches contain unique GPS, API, backend or map changes and must not be deleted by name alone.
- Branch deletion could not be performed with the available GitHub operations in this session. The report lists safe candidates for a later deletion pass.

## Verification still required

1. Run regression tests, Expo config validation, web export, Android prebuild and APK build via CI on this branch.
2. Review the PR checks before merging.
3. Confirm the audit-package workflow includes all new docs and no stale root paths.
4. Recheck the branch list and tree SHA groups immediately before any deletion.
5. Confirm the current GPS map provider requirement against `backup/2026-10-13-maptiler-working`; do not replace MapTiler with OSM/Leaflet without explicit verification.

## Deferred items

- Delete redundant branch refs only after final recheck; this action is unavailable in the current tool set.
- Refactor `GrafikPracy_Final/AppRuntime.js` only after mapping imports and adding regression coverage.
- Further consolidate workflows only after CI proves artifact, runtime diagnostic, backend, web deployment and CodeQL coverage remains intact.
- Revisit `package.json` `postinstall` and the three build-fix scripts after reading their exact effects and testing deterministic builds.
- Reconcile any remaining README/ROADMAP historical references without changing product behavior.
- GPS/map/runtime fixes are separate from this cleanup and must be evaluated against the MapTiler working backup.

## Safety status

No branches were deleted, no APK was published, and no production code was changed. All edits are isolated on the cleanup branch pending CI and review.
