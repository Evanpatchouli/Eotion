# Eotion Starter

Eotion is a **web-first Notion-inspired workspace**. This repository is intentionally a thin v0.1 foundation: one Vue 3 product UI, reused by Electron on desktop and embedded by a Vue Lynx mobile shell, with a NestJS/Fastify backend.

## Technology baseline

- Web: Vue 3 + Vite + Vue Router + Pinia
- Desktop: Electron + electron-vite, renderer reuses `apps/web`
- Mobile: Vue Lynx + Lynx `<webview>`; target platforms are HarmonyOS, Android and iOS
- API: NestJS + Fastify
- Agent integration: MCP service planned as an API adapter after authentication and core workspace/page APIs are in place
- Server database: MongoDB
- Future infrastructure: Redis + Kafka
- Object storage: Aliyun OSS
- Local data: IndexedDB on Web; SQLite/native adapters on desktop/mobile later
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

Open `http://localhost:5173`.

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
GET http://localhost:3000/api/health
```

### Mobile shell

```bash
pnpm dev:mobile
```

Scan/open the generated Lynx bundle with Lynx Explorer. The starter uses Vue Lynx and a `<webview>` that points at the Eotion Web dev server.

**Important:** on a real phone, `127.0.0.1:5173` points to the phone itself. Change `apps/mobile/src/config.ts` to your development machine's LAN URL, for example `http://192.168.1.10:5173`, and run the Web dev server with network access if needed.

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

This is a run-first scaffold, not the Notion clone itself. Tiptap/ProseMirror, Yjs, MongoDB schemas, auth, the MCP service, SQLite, IndexedDB, OSS upload, Redis and Kafka are left for staged implementation after all platform shells are proven. The MCP service will expose permission-scoped workspace capabilities through the API; it is not implemented yet.

The first high-risk PoC after bootstrapping is:

1. Vue Lynx on HarmonyOS 6.
2. Lynx `<webview>` loading Eotion Web.
3. Chinese IME + soft keyboard + selection in a Tiptap editor inside that WebView.
4. Background/foreground recovery and local persistence.

See `docs/roadmap.md`.
