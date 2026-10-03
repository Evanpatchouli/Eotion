# Current Task — Windows Desktop Packaging

Baseline: f43b762. Implementation complete; installer installation/uninstallation remains MANUAL CHECK.

## Work Units
1. S0 investigate / scout: existing build, runtime dependencies and acceptance entry points located.
2. S2 decide / main: electron-builder target-specific filenames; root/workspace version guard; distribution-only HTTPS origin default.
3. S1 execute / fast_worker: four commands, config/runner, ICO derived from repository PNG and packaging runbook.
4. S0 verify / scout + main: four actual command exits and current-version artifact assertions; packaged and regression tests.
5. Review / reviewer: empty-origin fallback and Portable CDP window readiness issues fixed; no other identified blockers.

## Final Evidence
- electron-builder 26.15.3, Electron 44.4.5, Windows x64, Eotion 0.0.1.
- All four root distribution commands executed successfully (exit 0); release builds all three targets in one builder invocation.
- Exact distribution files in apps/desktop/release/: Eotion-Setup-0.0.1.exe (112331180 bytes), Eotion-0.0.1-portable.exe (112183040 bytes), Eotion-0.0.1-win-x64.zip (154416539 bytes).
- Explicit automatic assertion: all three contain root version, exist/nonempty, and no extra top-level exe/zip. Unsigned status verified.
- Production default uses existing EOTION_DESKTOP_API_ORIGIN; nonempty process/.env overrides preserved; blank build values fall back; invalid HTTP origin rejected before build. Dev proxy unchanged.
- Shared workspace TypeScript/nanoid bundled into main; runtime imports only Electron/Node built-ins including node:sqlite. Main/preload/renderer/icon are inside app.asar; Electron runtime included.
- Real Portable self-extraction + ZIP extraction + Installer extracted payload: bundled login UI, official HTTPS origin, health200/me401, preload IPC, SQLite write/oplog and restart restore passed. No Vite/renderer URL/API override for these smoke runs.
- Installer installation/uninstallation and SmartScreen UI: MANUAL CHECK; installer payload launch passed but is not an installation claim.
- Desktop typecheck/build and protocol/SQLite unit16/16 passed; original production E2E1/1 and real ZIP packaged E2E1/1 passed (secure Cookie Session, offline kill/restart/reconnect, second client); storage/product-sync3/3 passed.
- Production E2E file-origin negative control needs plain build with empty EOTION_DESKTOP_API_ORIGIN when a local .env defines the production origin; documented. Initial configured-origin negative-control mismatch resolved by explicit fixture build config.
- One build overlapped a regression rebuild and produced a corrupt temporary archive. Rebuilt installer serially and verified latest payload; docs forbid concurrent dev/plain builds while packaging reads out/.
- Actual pnpm dev:desktop launched Electron with Vite5174 (existing5173 retained); /api/auth/me proxy401 JSON; test-owned Electron stopped afterward. Existing-profile cache warnings observed with concurrent dev instance; isolated storage tests passed.
- Independent review findings fixed; git diff check passed. Runbook: docs/runbooks/desktop-packaging.md.
- Temporary Mongo container stopped/removed. Auto-approval blocked recursive Temp fixture cleanup; installer/ZIP extracted smoke directories and test TLS directory remain for manual cleanup. No shared Mongo/service modified.
