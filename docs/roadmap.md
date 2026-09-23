# Eotion Bootstrap Roadmap

## P0 - Repository smoke test

Exit criteria:

- `pnpm install` succeeds.
- `pnpm dev:web` opens the Vue UI.
- `pnpm dev:desktop` opens the exact same Web UI in Electron.
- `pnpm dev:api` serves `/api/health` with or without Mongo configured.
- `pnpm dev:mobile` produces a Vue Lynx bundle/QR and the mobile shell can be opened in Lynx Explorer.

Do not add product features until P0 is green.

## P1 - Mobile WebView PoC

Validate on HarmonyOS 6 first, then Android and iOS:

- load Eotion Web in Lynx `<webview>`;
- LAN dev URL and production URL;
- WebView resize/orientation;
- navigation/back handling;
- Lynx <-> Web message bridge;
- background/foreground restore;
- clipboard/file/share bridge feasibility.

## P2 - Editor PoC

Add Tiptap 3 + ProseMirror to `apps/web` and verify:

- Chinese IME composition;
- selection/caret;
- slash command;
- 5,000 block synthetic document;
- touch toolbar and long-press behavior;
- Web, Electron, HarmonyOS WebView parity.

## P3 - Local-first foundation

- Define storage interfaces in `packages/`.
- Web IndexedDB adapter.
- Electron SQLite adapter via main/worker + preload IPC.
- Mobile storage bridge proof on HarmonyOS.
- Operation log and reconnect semantics.

## P4 - Server domain

- MongoDB schemas for workspace/page/block/file metadata.
- Auth/session.
- Typed contracts and SDK.
- Aliyun OSS direct upload using signed credentials/URLs.

Avoid one giant Page document containing every block.

## P5 - Collaboration

- Add Yjs only after the single-user local-first path is stable.
- Decide collaboration server persistence/compaction strategy.
- Add Redis only when presence/fan-out/horizontal scale needs it.

## P6 - Asynchronous infrastructure

Introduce Kafka only when concrete consumers exist, for example:

- search indexing;
- audit pipeline;
- notifications;
- analytics;
- AI indexing.

Keep API writes synchronous to MongoDB unless there is a specific reason not to.
