# Current Task — P5 Pre-Final Closeout B: Single Sync Status

## Baseline / Scope

- Start from `1142a66` on `master`; working tree clean at start.
- Page has one persistent save/sync surface: ProductShell `SyncStatus`. Remove only the Page title's local-save status; preserve `PagePersistence`, contextual local-save error/retry, and the existing offline wording.
- This is an intentional visual change to the existing P5.7 screenshot baseline. P5.7 final user sign-off remains pending.

## Work Units

1. S0 investigate: locate Page title status, persistence error recovery, affected tests, docs, and visual snapshots.
2. S1 execute: remove title status, revise tests to check durable behavior, and add synced/offline/local-save-error assertions.
3. S1 execute: reconcile the four P5.7 design documents and update only changed Page snapshots.
4. S0 verify: run related product tests, Web product suite, typecheck, build, and visual comparison; review diff.
5. Review: independent review of the nontrivial change, then commit `fix(ui): unify page sync status`.

## Evidence / Progress

- `PageView.vue` title status was the duplicate UI. `saveStatus` still controls the editor's contextual `product-editor-error` and `重试保存`.
- `SyncStatus.vue` already owns `已同步`, `离线 · 本地已保存`, pending, syncing, and failure/retry text; no change needed there.
- Initial normal-threshold visual run: Mobile Page failed, other 6 passed. Exact zero-pixel comparison then detected changes in Desktop Page Light/Dark and Tablet; Settings/Connectivity were unchanged.
- Four Page snapshots updated and visually inspected. Normal-threshold visual comparison: 7/7 PASS. Configuration restored to the original `maxDiffPixelRatio: 0.001`.
- Tests now assert one `已同步` in the full Page, no title-local status, the single offline wording, and contextual local-save failure/retry. Existing save waits use LocalStore, reload or server convergence evidence.
- Validation: `test:product` 148/148, `interaction-foundation.spec.ts` 7/7, `test:storage` 11/11, `test:real-sync` 1/1, Web typecheck/build, and final `test:visual` 7/7 PASS.
- Independent review found a real-sync test race caused by a stale `已同步` state; fixed by polling the authenticated server snapshot for the edited block before cross-client steps. Re-review found no remaining blocker.
