<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { reconnectPending, type LocalBlockRecord, type LocalPageRecord, type LocalStore, type StorageOperation } from '@eotion/storage'

import { createLocalStore } from '../storage/createLocalStore'
import { useRuntimeContext } from '../composables/useRuntimeContext'

const pageId = 'p3-demo-page'
const blockId = 'p3-demo-block'
const workspaceId = 'p3-demo-workspace'
const store = ref<LocalStore>()
const adapter = ref('loading')
const title = ref('P3 local page')
const blockText = ref('Durable block')
const offline = ref(true)
const pages = ref<LocalPageRecord[]>([])
const blocks = ref<LocalBlockRecord[]>([])
const pending = ref<StorageOperation[]>([])
const sent = ref<string[]>([])
const message = ref('')
const busy = ref(false)
const { runtime } = useRuntimeContext()
const runtimeLabel = { web: 'Web', electron: 'Electron', 'mobile-webview': 'Mobile WebView' }
const currentUrl = new URL(window.location.href)

async function refresh() {
  if (!store.value) return
  pages.value = await store.value.listPages()
  blocks.value = await store.value.listBlocksByPage(pageId)
  pending.value = await store.value.getPendingOperations()
}

async function run(action: (local: LocalStore) => Promise<void | string>) {
  if (!store.value || busy.value) return
  busy.value = true
  try {
    const detail = await action(store.value)
    await refresh()
    message.value = detail ?? '完成'
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function savePage() {
  void run((local) => local.upsertPage({
    id: pageId, workspaceId, parentPageId: null, orderKey: 'a', title: title.value, updatedAt: new Date().toISOString(),
  }))
}

function saveBlock() {
  void run((local) => local.upsertBlock({
    id: blockId, workspaceId, pageId, parentBlockId: null, type: 'paragraph', orderKey: 'a', props: { text: blockText.value },
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

function reloadWithChangedQuery() {
  const url = new URL(window.location.href)
  url.searchParams.set('p3QueryTest', Date.now().toString())
  window.location.href = url.toString()
}

function clearData() {
  void run(async (local) => {
    await local.clearAllData()
    sent.value = []
    return '数据已清除'
  })
}

onMounted(async () => {
  try {
    const selected = await createLocalStore()
    adapter.value = selected.adapter
    store.value = selected.store
  } catch (error) {
    adapter.value = 'error'
    message.value = error instanceof Error ? error.message : String(error)
    return
  }
  try {
    await refresh()
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  }
})

</script>

<template>
  <div class="p3-demo">
    <RouterLink to="/">← 返回工作区</RouterLink>
    <h1>P3 本地优先存储</h1>
    <p>Runtime: <strong>{{ runtimeLabel[runtime] }}</strong> · Adapter: <strong>{{ adapter }}</strong> · Offline: <strong>{{ offline }}</strong></p>
    <p class="p3-url-info">Origin: {{ currentUrl.origin }}<br />Query: {{ currentUrl.search }}<br />Hash: {{ currentUrl.hash }}</p>
    <p>创建页面及区块后刷新页面，检查内容和 pending operations 是否仍在。断线时 reconnect 会失败；恢复后重复点击只应发送剩余操作。</p>
    <fieldset class="p3-controls" :disabled="busy || !store">
      <label>页面标题 <input v-model="title" /></label>
      <button @click="savePage">创建 / 更新页面</button>
      <button @click="run((local) => local.deletePage(workspaceId, pageId))">删除页面及区块</button>
      <label>区块文本 <input v-model="blockText" /></label>
      <button @click="saveBlock">创建 / 更新区块</button>
      <button @click="run((local) => local.deleteBlock(workspaceId, blockId))">删除区块</button>
      <label><input v-model="offline" type="checkbox" /> Offline</label>
      <button @click="reconnect">Reconnect（并发两次）</button>
      <button @click="readAgain">重新读取</button>
      <button @click="reloadPage">Reload</button>
      <button @click="reloadWithChangedQuery">修改 Query 并 Reload</button>
      <button @click="clearData">清除数据</button>
    </fieldset>
    <p role="status">{{ message }}</p>
    <section><h2>Pages</h2><pre>{{ JSON.stringify(pages, null, 2) }}</pre></section>
    <section><h2>Blocks by page</h2><pre>{{ JSON.stringify(blocks, null, 2) }}</pre></section>
    <section><h2>Pending / failed operations ({{ pending.length }})</h2><pre>{{ JSON.stringify(pending, null, 2) }}</pre></section>
    <section><h2>Fake transport sent IDs ({{ sent.length }})</h2><pre>{{ sent.join('\n') }}</pre></section>
  </div>
</template>

<style scoped>
.p3-demo { max-width: 960px; margin: 0 auto; padding: 32px; font: 15px/1.5 system-ui, sans-serif; }
.p3-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 24px 0; padding: 0; border: 0; }
.p3-controls label { display: flex; align-items: center; gap: 8px; }
.p3-url-info { overflow-wrap: anywhere; }
button, input { padding: 8px; font: inherit; }
pre { max-height: 240px; overflow: auto; padding: 12px; background: #f5f5f5; }
</style>
