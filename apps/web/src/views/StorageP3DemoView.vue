<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { BlockRecord, PageSummary } from '@eotion/domain'
import { reconnectPending, type LocalStore, type StorageOperation } from '@eotion/storage'

import { createLocalStore } from '../storage/createLocalStore'
import { MobileBridgeLocalStore, type MobileBridgeDiagnostics } from '../storage/mobileBridgeStore'

const pageId = 'p3-demo-page'
const blockId = 'p3-demo-block'
const store = ref<LocalStore>()
const adapter = ref('loading')
const title = ref('P3 local page')
const blockText = ref('Durable block')
const offline = ref(true)
const pages = ref<PageSummary[]>([])
const blocks = ref<BlockRecord[]>([])
const pending = ref<StorageOperation[]>([])
const sent = ref<string[]>([])
const message = ref('')
const bridgeDiagnostics = ref<MobileBridgeDiagnostics>()
let bridgeStore: MobileBridgeLocalStore | undefined
let unsubscribeDiagnostics: (() => void) | undefined

function clearBridgeDiagnostics() {
  bridgeStore?.clearDiagnostics()
}

async function refresh() {
  if (!store.value) return
  pages.value = await store.value.listPages()
  blocks.value = await store.value.listBlocksByPage(pageId)
  pending.value = await store.value.getPendingOperations()
}

async function run(action: (local: LocalStore) => Promise<void | string>) {
  if (!store.value) return
  try {
    const detail = await action(store.value)
    await refresh()
    message.value = detail ?? '完成'
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  }
}

function savePage() {
  void run((local) => local.upsertPage({ id: pageId, title: title.value, updatedAt: new Date().toISOString() }))
}

function saveBlock() {
  void run((local) => local.upsertBlock({
    id: blockId, pageId, type: 'paragraph', orderKey: 'a', props: { text: blockText.value },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }))
}

function readAgain() {
  void refresh().catch((error: unknown) => {
    message.value = error instanceof Error ? error.message : String(error)
  })
}

function reconnect() {
  void run(async (local) => {
    const transport = {
      async send(operation: StorageOperation) {
        if (offline.value) throw new Error('offline')
        sent.value.push(operation.id)
      },
    }
    const [first, second] = await Promise.all([
      reconnectPending(local, transport),
      reconnectPending(local, transport),
    ])
    return `reconnect: ${first.synced} synced, ${first.failed} failed; concurrent result ${second.synced}/${second.failed}`
  })
}

function reloadPage() {
  window.location.reload()
}

onMounted(async () => {
  try {
    const selected = await createLocalStore()
    adapter.value = selected.adapter
    store.value = selected.store
    if (selected.store instanceof MobileBridgeLocalStore) {
      bridgeStore = selected.store
      unsubscribeDiagnostics = bridgeStore.subscribeDiagnostics((snapshot) => {
        bridgeDiagnostics.value = snapshot
      })
    }
  } catch (error) {
    adapter.value = 'unavailable'
    message.value = error instanceof Error ? error.message : String(error)
    return
  }
  try {
    await refresh()
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  }
})

onUnmounted(() => unsubscribeDiagnostics?.())
</script>

<template>
  <main class="p3-demo">
    <RouterLink to="/">← 返回工作区</RouterLink>
    <h1>P3 本地优先存储</h1>
    <p>Adapter: <strong>{{ adapter }}</strong> · Offline: <strong>{{ offline }}</strong></p>
    <p>创建页面及区块后刷新页面，检查内容和 pending operations 是否仍在。断线时 reconnect 会失败；恢复后重复点击只应发送剩余操作。</p>
    <div class="p3-controls">
      <label>页面标题 <input v-model="title" /></label>
      <button @click="savePage">创建 / 更新页面</button>
      <button @click="run((local) => local.deletePage(pageId))">删除页面及区块</button>
      <label>区块文本 <input v-model="blockText" /></label>
      <button @click="saveBlock">创建 / 更新区块</button>
      <button @click="run((local) => local.deleteBlock(blockId))">删除区块</button>
      <label><input v-model="offline" type="checkbox" /> Offline</label>
      <button @click="reconnect">Reconnect（并发两次）</button>
      <button @click="readAgain">重新读取</button>
      <button @click="reloadPage">Reload</button>
    </div>
    <p role="status">{{ message }}</p>
    <section v-if="bridgeDiagnostics" aria-label="Bridge diagnostics">
      <h2>Bridge diagnostics</h2>
      <button :disabled="bridgeDiagnostics.pending > 0" @click="clearBridgeDiagnostics">清空 diagnostics</button>
      <dl class="bridge-counts">
        <dt>Requests sent</dt><dd>{{ bridgeDiagnostics.requestsSent }}</dd>
        <dt>Responses received</dt><dd>{{ bridgeDiagnostics.responsesReceived }}</dd>
        <dt>Pending</dt><dd>{{ bridgeDiagnostics.pending }}</dd>
        <dt>Timeouts</dt><dd>{{ bridgeDiagnostics.timeouts }}</dd>
        <dt>Unknown responses</dt><dd>{{ bridgeDiagnostics.unknownResponses }}</dd>
        <dt>Duplicate responses</dt><dd>{{ bridgeDiagnostics.duplicateResponses }}</dd>
        <dt>Method mismatches</dt><dd>{{ bridgeDiagnostics.methodMismatches }}</dd>
      </dl>
      <p>Last request: <span v-if="bridgeDiagnostics.lastRequest">id={{ bridgeDiagnostics.lastRequest.id }} · method={{ bridgeDiagnostics.lastRequest.method }} · sentAt={{ new Date(bridgeDiagnostics.lastRequest.sentAt).toLocaleString() }}</span><span v-else>—</span></p>
      <p>Last response: <span v-if="bridgeDiagnostics.lastResponse">id={{ bridgeDiagnostics.lastResponse.id }} · method={{ bridgeDiagnostics.lastResponse.method }} · status={{ bridgeDiagnostics.lastResponse.status }} · latencyMs={{ bridgeDiagnostics.lastResponse.latencyMs ?? '—' }}</span><span v-else>—</span></p>
      <h3>Recent requests</h3>
      <ol class="bridge-events">
        <li v-for="event in bridgeDiagnostics.recentEvents" :key="`${event.sequence}-${event.id}`">
          #{{ event.sequence }} {{ event.method }} → {{ event.status }} {{ event.latencyMs === undefined ? '' : `${event.latencyMs} ms` }} <small>{{ event.id }}</small>
        </li>
      </ol>
    </section>
    <section><h2>Pages</h2><pre>{{ JSON.stringify(pages, null, 2) }}</pre></section>
    <section><h2>Blocks by page</h2><pre>{{ JSON.stringify(blocks, null, 2) }}</pre></section>
    <section><h2>Pending / failed operations ({{ pending.length }})</h2><pre>{{ JSON.stringify(pending, null, 2) }}</pre></section>
    <section><h2>Fake transport sent IDs ({{ sent.length }})</h2><pre>{{ sent.join('\n') }}</pre></section>
  </main>
</template>

<style scoped>
.p3-demo { max-width: 960px; margin: 0 auto; padding: 32px; font: 15px/1.5 system-ui, sans-serif; }
.p3-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 24px 0; }
.p3-controls label { display: flex; align-items: center; gap: 8px; }
button, input { padding: 8px; font: inherit; }
pre { max-height: 240px; overflow: auto; padding: 12px; background: #f5f5f5; }
.bridge-counts { display: grid; grid-template-columns: max-content auto; gap: 4px 16px; }
.bridge-counts dd { margin: 0; font-variant-numeric: tabular-nums; }
.bridge-events { padding-left: 24px; }
.bridge-events li { overflow-wrap: anywhere; }
</style>
