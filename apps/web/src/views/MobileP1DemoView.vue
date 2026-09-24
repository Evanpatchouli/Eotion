<script setup lang="ts">
import { MOBILE_P1_CHANNEL, type MobileP1Ping, type MobileP1Pong } from '@eotion/contracts'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

type LogLevel = 'info' | 'success' | 'error'
type LogEntry = { id: number; time: string; level: LogLevel; text: string }
type BridgeWindow = Window & { __eotionMobileP1Receive?: (message: unknown) => void }

const logs = ref<LogEntry[]>([])
const bridgeStatus = ref('尚未测试')
const pingPending = ref(false)
const lastRoundTrip = ref<number | null>(null)
const clipboardText = ref('来自 Eotion P1 演示页的文本')
const pastedText = ref('')
const clipboardStatus = ref('尚未测试')
const fileStatus = ref('尚未选择文件')
const shareStatus = ref('尚未测试')
const sharePending = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const secureContext = window.isSecureContext

let nextLogId = 0
let nextRequestId = 0
let pendingPing: { id: string; startedAt: number; timer: number } | null = null

function addLog(level: LogLevel, text: string) {
  logs.value = [
    { id: ++nextLogId, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, text },
    ...logs.value,
  ].slice(0, 20)
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function receiveFromLynx(raw: unknown) {
  let message = raw
  if (typeof raw === 'string') {
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
  }

  if (!message || typeof message !== 'object') return
  const candidate = message as Partial<MobileP1Pong>
  const activePing = pendingPing
  if (
    candidate.channel !== MOBILE_P1_CHANNEL ||
    candidate.kind !== 'pong' ||
    !activePing ||
    candidate.id !== activePing.id ||
    typeof candidate.receivedAt !== 'number'
  ) return

  window.clearTimeout(activePing.timer)
  lastRoundTrip.value = Date.now() - activePing.startedAt
  pendingPing = null
  pingPending.value = false
  bridgeStatus.value = `已收到 Pong · ${lastRoundTrip.value} ms`
  addLog('success', `Lynx 返回 Pong，请求往返 ${lastRoundTrip.value} ms`)
}

function sendPing() {
  if (pendingPing) return

  const ping: MobileP1Ping = {
    channel: MOBILE_P1_CHANNEL,
    kind: 'ping',
    id: `${Date.now()}-${++nextRequestId}`,
    sentAt: Date.now(),
  }

  bridgeStatus.value = '等待 Lynx 回复…'
  pingPending.value = true
  addLog('info', `发送 Ping · ${ping.id}`)

  const timer = window.setTimeout(() => {
    if (pendingPing?.id !== ping.id) return
    pendingPing = null
    pingPending.value = false
    bridgeStatus.value = '未收到 Pong：请在手机 WebView 中检查消息通道'
    addLog('error', 'Ping 超时。普通浏览器没有 Lynx 壳，手机端需检查 WebView 消息转发。')
  }, 5000)

  pendingPing = { id: ping.id, startedAt: Date.now(), timer }
  window.postMessage(JSON.stringify(ping), window.location.origin)
}

function copyWithSelection(text: string) {
  const input = document.createElement('textarea')
  input.value = text
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  try {
    input.focus()
    input.select()
    return document.execCommand('copy')
  } finally {
    input.remove()
  }
}

async function copyText() {
  const text = clipboardText.value
  if (!text) {
    clipboardStatus.value = '请先输入要复制的文本'
    return
  }

  let failure: unknown = new Error('WebView 未允许写入剪贴板')
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      clipboardStatus.value = '复制成功 · Clipboard API'
      addLog('success', clipboardStatus.value)
      return
    } catch (error) {
      failure = error
    }
  }

  try {
    if (copyWithSelection(text)) {
      clipboardStatus.value = '复制成功 · 文本选择回退'
      addLog('success', clipboardStatus.value)
      return
    }
  } catch (error) {
    failure = error
  }

  clipboardStatus.value = `复制失败：${describeError(failure)}`
  addLog('error', clipboardStatus.value)
}

async function readClipboard() {
  if (!navigator.clipboard?.readText) {
    clipboardStatus.value = '当前 WebView 不支持主动读取；可在下方输入框手动粘贴'
    addLog('info', clipboardStatus.value)
    return
  }

  clipboardStatus.value = '等待剪贴板读取结果…'
  let timer: number | undefined
  try {
    pastedText.value = await Promise.race([
      navigator.clipboard.readText(),
      new Promise<string>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('读取超时；请检查 WebView 的剪贴板权限')), 5000)
      }),
    ])
    clipboardStatus.value = '读取成功 · Clipboard API'
    addLog('success', clipboardStatus.value)
  } catch (error) {
    clipboardStatus.value = `读取失败：${describeError(error)}`
    addLog('error', clipboardStatus.value)
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

function chooseFile() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const size = file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`
  fileStatus.value = `${file.name} · ${file.type || '未知类型'} · ${size}`
  addLog('success', `WebView 文件选择器返回：${fileStatus.value}`)
  input.value = ''
}

function onFileCancel() {
  fileStatus.value = '已取消文件选择'
  addLog('info', fileStatus.value)
}

async function shareText() {
  if (!navigator.share) {
    shareStatus.value = '当前 WebView 不支持 Web Share API'
    addLog('info', shareStatus.value)
    return
  }

  sharePending.value = true
  shareStatus.value = '等待系统分享面板结果…'
  try {
    await navigator.share({ title: 'Eotion P1', text: '来自 Eotion 移动端演示页', url: window.location.href })
    shareStatus.value = '分享面板已完成 · Web Share API'
    addLog('success', shareStatus.value)
  } catch (error) {
    shareStatus.value = error instanceof DOMException && error.name === 'AbortError'
      ? '已取消分享'
      : `分享失败：${describeError(error)}`
    addLog(shareStatus.value === '已取消分享' ? 'info' : 'error', shareStatus.value)
  } finally {
    sharePending.value = false
  }
}

onMounted(() => {
  const bridgeWindow = window as BridgeWindow
  bridgeWindow.__eotionMobileP1Receive = receiveFromLynx
  addLog('info', '演示页已就绪。手机端可开始 Ping/Pong 测试。')
})

onBeforeUnmount(() => {
  const bridgeWindow = window as BridgeWindow
  if (bridgeWindow.__eotionMobileP1Receive === receiveFromLynx) {
    delete bridgeWindow.__eotionMobileP1Receive
  }
  if (pendingPing) window.clearTimeout(pendingPing.timer)
})
</script>

<template>
  <main class="p1-lab">
    <header class="lab-header">
      <div class="lab-eyebrow">EOTION / MOBILE P1</div>
      <RouterLink class="back-link" to="/">返回工作区 ↗</RouterLink>
      <h1>移动端能力实验页</h1>
      <p>在手机的 Lynx WebView 中逐项操作，并记录每项的真实结果。</p>
      <div class="lab-meta">
        <span>路由：/__dev/mobile-p1</span>
        <span>{{ secureContext ? '安全上下文' : '局域网 HTTP · 部分 Web API 可能受限' }}</span>
      </div>
    </header>

    <div class="lab-content">
      <section class="lab-section">
        <div class="section-heading"><span class="step">01</span><div><h2>Lynx ↔ Web</h2><p>网页发送 Ping；Lynx 壳收到后按相同请求 ID 返回 Pong。</p></div></div>
        <div class="action-row">
          <button type="button" :disabled="pingPending" @click="sendPing">{{ pingPending ? '等待回复…' : '发送 Ping' }}</button>
          <strong class="result" role="status">{{ bridgeStatus }}</strong>
        </div>
        <p v-if="lastRoundTrip !== null" class="detail">最近一次往返：{{ lastRoundTrip }} ms</p>
      </section>

      <section class="lab-section">
        <div class="section-heading"><span class="step">02</span><div><h2>剪贴板</h2><p>先验证 WebView 的网页剪贴板能力；结果会标明所用 API。</p></div></div>
        <label class="field-label" for="copy-text">待复制文本</label>
        <input id="copy-text" v-model="clipboardText" class="text-field" type="text" />
        <div class="action-row">
          <button type="button" @click="copyText">复制文本</button>
          <button class="secondary" type="button" @click="readClipboard">主动读取</button>
        </div>
        <label class="field-label" for="paste-text">也可以在这里手动粘贴验证</label>
        <input id="paste-text" v-model="pastedText" class="text-field" type="text" placeholder="长按并粘贴" />
        <p class="detail" role="status">{{ clipboardStatus }}</p>
      </section>

      <section class="lab-section">
        <div class="section-heading"><span class="step">03</span><div><h2>文件选择</h2><p>通过 WebView 文件选择器取回文件元数据，不上传文件内容。</p></div></div>
        <input ref="fileInput" class="visually-hidden" type="file" tabindex="-1" aria-hidden="true" @change="onFileChange" @cancel="onFileCancel" />
        <div class="action-row">
          <button type="button" @click="chooseFile">选择文件</button>
          <strong class="result" role="status">{{ fileStatus }}</strong>
        </div>
      </section>

      <section class="lab-section">
        <div class="section-heading"><span class="step">04</span><div><h2>系统分享</h2><p>尝试打开 WebView 提供的系统分享面板。</p></div></div>
        <div class="action-row">
          <button type="button" :disabled="sharePending" @click="shareText">{{ sharePending ? '等待系统返回…' : '打开分享面板' }}</button>
          <strong class="result" role="status">{{ shareStatus }}</strong>
        </div>
      </section>

      <section class="lab-section log-section">
        <div class="section-heading"><span class="step">LOG</span><div><h2>操作记录</h2><p>只保留本次页面会话的最近 20 条结果。</p></div></div>
        <ol class="log-list" aria-live="polite">
          <li v-for="entry in logs" :key="entry.id" :data-level="entry.level">
            <time>{{ entry.time }}</time><span>{{ entry.text }}</span>
          </li>
        </ol>
      </section>
    </div>
  </main>
</template>

<style scoped>
.p1-lab { min-height: 100dvh; background: #f7f7f4; color: #242522; }
.lab-header { position: relative; padding: 48px max(24px, calc((100vw - 900px) / 2)) 42px; border-bottom: 1px solid #dfdfd8; background: #e9eddf; }
.lab-eyebrow { color: #4f6855; font-size: 11px; font-weight: 700; letter-spacing: .16em; }
.back-link { position: absolute; top: 42px; right: max(24px, calc((100vw - 900px) / 2)); color: #36523e; font-size: 13px; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
h1 { margin: 26px 0 12px; font-size: clamp(34px, 5vw, 52px); line-height: 1.08; letter-spacing: -.05em; }
.lab-header p { max-width: 600px; margin: 0; color: #576052; font-size: 15px; line-height: 1.6; }
.lab-meta { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-top: 28px; color: #647060; font-size: 12px; }
.lab-content { width: min(900px, calc(100% - 48px)); margin: 0 auto; padding: 8px 0 80px; }
.lab-section { padding: 32px 0; border-bottom: 1px solid #ddded8; }
.section-heading { display: flex; align-items: start; gap: 18px; margin-bottom: 24px; }
.step { min-width: 32px; padding-top: 5px; color: #71816f; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
h2 { margin: 0 0 5px; font-size: 23px; line-height: 1.2; letter-spacing: -.03em; }
.section-heading p { margin: 0; color: #6a6c67; font-size: 13px; line-height: 1.55; }
.action-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-left: 50px; }
button { min-height: 40px; padding: 8px 17px; border: 1px solid #294f39; border-radius: 8px; background: #294f39; color: white; font-size: 13px; font-weight: 650; cursor: pointer; }
button:hover { background: #386449; }
button:disabled { opacity: .55; cursor: wait; }
button.secondary { border-color: #cbd2c9; background: transparent; color: #294f39; }
button.secondary:hover { background: #e8ede6; }
.result { min-width: 0; color: #4d5b4e; font-size: 13px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
.detail { margin: 14px 0 0 50px; color: #59655a; font-size: 12px; line-height: 1.5; }
.field-label { display: block; margin: 0 0 7px 50px; color: #59615b; font-size: 12px; }
.text-field { display: block; width: min(100% - 50px, 560px); min-height: 42px; margin: 0 0 14px 50px; padding: 8px 12px; border: 1px solid #cbd1c9; border-radius: 8px; outline: 0; background: white; }
.text-field:focus { border-color: #548368; box-shadow: 0 0 0 3px #54836822; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.log-list { display: grid; gap: 0; margin: 0 0 0 50px; padding: 0; list-style: none; border-top: 1px solid #d6d9d1; }
.log-list li { display: grid; grid-template-columns: 82px minmax(0,1fr); gap: 10px; padding: 11px 2px; border-bottom: 1px solid #e0e2dc; color: #5a6059; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.log-list li[data-level="success"] { color: #246642; }
.log-list li[data-level="error"] { color: #9a3e38; }
.log-list time { color: #8b9189; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) {
  .lab-header { padding: 28px 20px 28px; }
  .back-link { position: static; display: inline-block; margin-top: 17px; }
  h1 { margin-top: 22px; }
  .lab-content { width: calc(100% - 40px); padding-bottom: 40px; }
  .lab-section { padding: 28px 0; }
  .section-heading { gap: 10px; }
  .step { min-width: 28px; }
  .action-row, .field-label, .detail, .log-list { margin-left: 0; padding-left: 0; }
  .text-field { width: 100%; margin-left: 0; }
  .result { flex-basis: 100%; }
}
</style>
