# Eotion

Eotion is a **web-first Notion-inspired workspace**. This repository is intentionally a thin v0.1 foundation: one Vue 3 product UI, reused by Electron on desktop and embedded by a Vue Lynx mobile shell, with a NestJS/Fastify backend.

## Technology baseline

- Web: Vue 3 + Vite + Vue Router + Pinia
- Editor: Tiptap 3 is the single editor framework. ProseMirror is its underlying engine and is accessed only when lower-level behavior is needed, preferably through `@tiptap/pm`.
- Desktop: Electron + electron-vite, renderer reuses `apps/web`
- Mobile: Vue Lynx + Lynx `<webview>`; target platforms are HarmonyOS, Android and iOS
- API: NestJS + Fastify
- Agent integration: MCP service planned as an API adapter after authentication and core workspace/page APIs are in place
- Server database: MongoDB
- Future infrastructure: Redis + Kafka
- Object storage: independent `ali-oss-server` service, consumed server-side through its SDK and backed by Aliyun OSS
- Local data: shared IndexedDB adapter for Web and Mobile WebView; SQLite through Electron main process
- Workspace: pnpm monorepo
- Language: TypeScript

## Requirements

- Node.js >= 22.12 (Node 24/25/26 are suitable for this starter)
- pnpm 10.x
- For native Lynx packaging later: the corresponding Android/iOS/HarmonyOS toolchains. The current starter can be developed with Lynx Explorer first.

## Install

```bash
pnpm install
```

The repository pins pnpm 10 in `package.json` and commits `pnpm-lock.yaml`. Run `pnpm install` to restore the workspace dependencies.

See [`docs/bootstrap-result.md`](docs/bootstrap-result.md) for the verified commands and native platform setup that still needs a device/toolchain.

## Run

### Web

```bash
pnpm dev:web
```

Open `http://localhost:7173/#/app`. The product entry provides email/password login, session restore, and workspace creation, switching, and renaming. Start the API with MongoDB configured; see [P5.1 setup and product routes](docs/p5-product-shell.md). The original sample workspace is available in development at `/#/__dev/workspace`.

The Web page zoom preference is listed in `apps/web/.env.example`:

```env
VITE_ALLOW_PAGE_ZOOM=true
```

Page zoom is allowed by default, including when the variable is unset. Set `VITE_ALLOW_PAGE_ZOOM=false` to prevent page-level double-tap and pinch zoom while retaining normal taps, long presses, and single-finger scrolling. This applies `touch-action: pan-x pan-y` to the Web app's scroll container and adds viewport limits. Restart the Web dev server after changing the variable. Disabling page zoom reduces accessibility; some browsers or WebViews may override viewport limits, so verify the result on the target device.

### Electron desktop

```bash
pnpm dev:desktop
```

The desktop app compiles `apps/web` as its renderer. There is intentionally no duplicate desktop Vue application.

### API

```bash
cd apps/api
cp .env.example .env
cd ../..
pnpm dev:api
```

`MONGODB_URI` may remain empty for the first smoke run. The API will boot without MongoDB and report it as disabled. When a URI is configured, Nest initializes Mongoose.

Health endpoint:

```text
GET http://localhost:7137/api/health
```

### Mobile shell

For phone testing, the mobile build detects the development machine's LAN IPv4 address and uses port `7173` by default. To override the URL, set `EOTION_WEB_URL` in `apps/mobile/.env` (see `apps/mobile/.env.example`). Start the Web dev server in one terminal; it already listens on `0.0.0.0:7173`:

```bash
pnpm dev:web
```

Then start the Lynx dev server in a second terminal and scan/open its QR code with Lynx Explorer:

```bash
pnpm dev:mobile
```

Keep both servers running while testing. Restart `pnpm dev:mobile` after changing `apps/mobile/.env` so the new URL is compiled into the bundle.

For the Mobile P1 capability demo, use the development-only sidebar item or open `http://localhost:7173/#/__dev/mobile-p1`. See [`docs/p1-mobile-demo.md`](docs/p1-mobile-demo.md).

For the Tiptap P2 editor PoC, use the development-only sidebar item or open `http://localhost:7173/#/__dev/editor-p2`. See [`docs/p2-editor-demo.md`](docs/p2-editor-demo.md) for the 5,000-block fixture and platform verification steps.

## Repository map

```text
apps/
  web/        primary Vue 3 UI (Desktop/Tablet/Mobile modes)
  desktop/    Electron main + preload; reuses apps/web renderer
  mobile/     Vue Lynx shell + Lynx webview
  api/        NestJS + Fastify modular monolith
packages/
  domain/     framework-neutral document/page/block models
  contracts/  shared API/event contracts
  sdk/        minimal typed API client foundation
docs/
  architecture/
    architecture.md
    agent-integration.md
  roadmap.md
```

## What is intentionally NOT implemented yet

P4 server domains, Cookie Session auth, typed APIs, sync transport and server-side `ali-oss-server` integration are complete. P5.1 adds the product shell and Auth / Workspace flow, and P5.2 adds the page tree with create/open/rename/move/delete. Product editor integration, product sync and attachment UI remain for P5.3–P5.5; Yjs, MCP, Redis and Kafka belong to later stages. Eotion will not reimplement OSS signing or object-storage infrastructure: `apps/api` will use the `ali-oss-server` SDK with an Eotion-specific service URL, `clientId`, and `clientSecret`. P3 local storage uses IndexedDB for Web and Mobile WebView, and SQLite through Electron's main process; the current Mobile WebView P3 device checklist has passed 15/15 on the recorded Lynx Explorer test environment. The MCP service will expose permission-scoped workspace capabilities through the API; it is not implemented yet.

The first high-risk PoC after bootstrapping is:

1. Vue Lynx on HarmonyOS 6.
2. Lynx `<webview>` loading Eotion Web.
3. Chinese IME + soft keyboard + selection in a Tiptap editor inside that WebView.
4. Background/foreground recovery and local persistence.

See `docs/roadmap.md`.
