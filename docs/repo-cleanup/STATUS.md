# Repo cleanup status and deferred work

Date: 2026-10-16  
Repository: `gry17051997-commits/3gf`  
Baseline: `main` at `82ea492d949689ca4dbe4c7b27cdbcbcaff7acac`  
Working branch: `chore/repo-cleanup-audit-2026-10-15`  
Cleanup PR: [#2](https://github.com/gry17051997-commits/3gf/pull/2)

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
- Reduced duplicate automatic CI runs: `android-apk.yml`, `diagnostic-apk.yml`, `full-audit.yml`, and `gemini-audit-package.yml` are manual-trigger workflows. PR validation remains responsible for automated tests/build; production APK and web deployment remain separate.
- No production application source files were modified. GPS, map, API, runtime and build-fix scripts remain untouched.
- `main` has not been modified.
- On commit `1105d906901f3cdbb3148231a0e38fcf3d774cbd`, GitHub Actions reported **success** for PR Validation and CodeQL Advanced. PR Validation's job includes production-hardening tests, Expo public config validation, build-fix script syntax checks, web export verification, Android prebuild, release APK build, and APK ZIP integrity verification.
- The checks above validate the cleanup branch's build and static/regression suite. They do not prove GPS/map behavior on a physical phone.

## Branch audit findings

- The repository had 79 branches at audit start; a separate cleanup branch has since been added.
- GitHub's compare endpoint reports “No common ancestor” for the old branch tips. The audit therefore compared recursive trees and file blob SHAs instead of relying on merge ancestry.
- Exact same-tree groups and low-difference GPS/API branches are listed in `BRANCH_TREE_AUDIT.md`.
- Several branches contain unique GPS, API, backend or map changes and must not be deleted by name alone.
- Branch deletion could not be performed with the available GitHub operations in this session. The report lists safe candidates for a later deletion pass.

## Remaining verification and cleanup

1. Recheck the branch list and tree SHA groups immediately before any deletion.
2. Confirm the current GPS map provider requirement against `backup/2026-10-13-maptiler-working`; do not replace MapTiler with OSM/Leaflet without explicit verification.
3. Review `package.json` `postinstall` and the three build-fix scripts after reading their exact effects and testing deterministic builds. CI currently installs with `--ignore-scripts`, then runs the fixes explicitly.
4. Reconcile any remaining README/ROADMAP historical references where those files exist; the repository root currently has no `README.md` or `ROADMAP.md` at this branch.
5. Keep runtime refactoring separate: map `GrafikPracy_Final/AppRuntime.js` imports and add regression coverage before changing the monolith.
6. Keep GPS/map/runtime fixes separate from repository housekeeping and evaluate them against the MapTiler working backup.
7. Further consolidate workflows only after confirming artifact, runtime diagnostic, backend, web deployment and CodeQL coverage remains intact.

## Deferred items

- Delete redundant branch refs only after final recheck; branch deletion is unavailable through the current GitHub operations.
- Refactor `GrafikPracy_Final/AppRuntime.js` only after mapping imports and adding regression coverage.
- Further consolidate workflows only after CI proves artifact, runtime diagnostic, backend, web deployment and CodeQL coverage remains intact.
- Review `ALLOWED_ORIGINS` and schedule-write atomicity/concurrency separately as production correctness/security work.
- Confirm live GPS, background tracking, route history and map provider behavior on a physical Android device.
- Revisit `package.json` `postinstall` and build-fix scripts only after testing their deterministic effects.

## Safety status

No branches were deleted, no APK was published, and no production code was changed. All edits are isolated on the cleanup branch pending review. PR #2 remains open and unmerged.
