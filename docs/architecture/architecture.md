# Eotion Architecture Baseline

## 1. Client principle: Web First

`apps/web` is the product. It owns the routing, editor UI, workspace UI, state and responsive interaction model.

```text
                       apps/web
                 Vue 3 + Vite UI
                        |
          +-------------+-------------+
          |             |             |
       Browser       Electron       Vue Lynx
                         |             |
                    same renderer    <webview>
                                       |
                                Harmony/iOS/Android
```

The Web UI has three layout modes but one codebase:

- Desktop: multi-pane, mouse/keyboard, hover/context-menu/shortcuts.
- Tablet: collapsible/overlay side panels, touch/hybrid input.
- Mobile: single-column, drawer/bottom-sheet oriented touch interaction.

Runtime, layout and input mode are distinct concepts. A narrow Electron window is not automatically a mobile runtime.

## 2. Desktop

`apps/desktop` contains only Electron main/preload concerns. electron-vite points its renderer root directly at `apps/web`.

Platform APIs must later be exposed through narrow preload bridges. Do not enable Node.js integration in the renderer.

## 3. Mobile

`apps/mobile` uses Vue Lynx as an application shell. v0.1 loads Eotion Web in Lynx's built-in `<webview>`.

Later native-only capabilities belong behind typed bridges: notifications, deep links, files, share sheets, local database and app lifecycle.

Do not port the whole UI to Lynx by default. Native Lynx screens should be introduced only for a measured reason.

## 4. Server

Start with a modular monolith:

```text
NestJS + Fastify
  auth
  users
  workspaces
  pages
  blocks
  files
  sync
  search
  mcp (planned agent-facing adapter)
       |
     MongoDB -------- Aliyun OSS
```

The MCP adapter will be another interface to the same application capabilities, not a separate service or a path around API authorization. See [Agent Integration Baseline](agent-integration.md) for its planned scope and security boundaries.

Redis is a later cache/presence/rate-limit/distributed-state dependency. Kafka is a later event backbone for asynchronous workloads such as indexing, audit, notifications and analytics.

## 5. Persistence and sync direction

Do not mirror MongoDB collections directly into SQLite tables as a database replication scheme.

The long-term model should sync domain operations / document changes:

```text
Client edit
   -> local store
   -> oplog / CRDT update
   -> sync transport
   -> server
   -> MongoDB / collaboration persistence
```

Potential local stores:

- Web: IndexedDB
- Electron: SQLite behind Electron main/worker + typed preload IPC
- Android/iOS: SQLite adapter through native bridge
- HarmonyOS: SQLite/relationalStore adapter through ArkTS/native bridge

## 6. Editor direction

The editor should remain Web technology across all targets:

```text
Vue 3
  -> Tiptap 3
  -> ProseMirror
  -> later Yjs
```

Desktop and mobile share document schema/editor core, while interaction affordances may differ (hover handle vs long-press/touch toolbar).

## 7. Agent integration (planned)

Eotion will provide an MCP service for compatible Agents. It belongs in the API modular monolith and will call the same authenticated application services as other API clients. Initial capabilities will focus on discovering, searching, reading, and explicitly creating or updating workspace content. See [Agent Integration Baseline](agent-integration.md).
