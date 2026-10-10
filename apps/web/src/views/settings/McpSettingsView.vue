<script setup lang="ts">
import type { McpTokenMetadataResponse } from '@eotion/contracts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import EotionIcon from '../../components/ui/EotionIcon.vue'
import { IconName } from '../../components/ui/icons'
import { api, errorMessage } from '../../services/productApi'

const tokens = ref<McpTokenMetadataResponse[]>([])
const tokenName = ref('Codex')
const createdToken = ref('')
const loading = ref(false)
const creating = ref(false)
const revokingId = ref('')
const feedback = ref('')
const copyFeedback = ref('')
const online = ref(navigator.onLine)

function resolveMcpEndpoint(): string {
  try {
    const base = api.baseUrl || window.location.origin
    const origin = new URL(base, window.location.href).origin
    return origin === 'null' ? '' : new URL('/mcp', origin).href
  } catch { return '' }
}
const endpoint = computed(resolveMcpEndpoint)
const canCreate = computed(() => online.value && tokenName.value.trim().length >= 1 && tokenName.value.trim().length <= 64 && !creating.value)

async function loadTokens(): Promise<void> {
  if (!online.value) { feedback.value = '当前离线，联网后可管理 MCP Token。'; return }
  loading.value = true; feedback.value = ''
  try { tokens.value = await api.mcpTokens.list() }
  catch (cause) { feedback.value = errorMessage(cause, '暂时无法读取 MCP Token。') }
  finally { loading.value = false }
}
async function createToken(): Promise<void> {
  if (!canCreate.value) return
  creating.value = true; feedback.value = ''; createdToken.value = ''
  try {
    const result = await api.mcpTokens.create({ name: tokenName.value.trim() })
    createdToken.value = result.token
    tokenName.value = ''
    await loadTokens()
  } catch (cause) { feedback.value = errorMessage(cause, 'MCP Token 创建失败，请重试。') }
  finally { creating.value = false }
}
async function revokeToken(token: McpTokenMetadataResponse): Promise<void> {
  if (!online.value || revokingId.value) return
  revokingId.value = token.id; feedback.value = ''
  try { await api.mcpTokens.revoke(token.id); tokens.value = tokens.value.filter((item) => item.id !== token.id) }
  catch (cause) { feedback.value = errorMessage(cause, 'MCP Token 撤销失败，请重试。') }
  finally { revokingId.value = '' }
}
async function copyText(value: string, label: string): Promise<void> {
  copyFeedback.value = ''
  try { await navigator.clipboard.writeText(value); copyFeedback.value = `${label}已复制` }
  catch { copyFeedback.value = '复制失败，请手动复制。' }
}
function formatTime(value: string | null): string {
  if (!value) return '从未使用'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
function handleOnline(): void { online.value = true; void loadTokens() }
function handleOffline(): void { online.value = false; feedback.value = '当前离线，联网后可管理 MCP Token。' }

onMounted(() => { window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline); void loadTokens() })
onBeforeUnmount(() => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) })
</script>

<template>
  <div class="settings-page settings-mcp">
    <div class="settings-page-heading"><h1>MCP</h1><p>连接 Codex 等 MCP 客户端，并管理独立 Access Token。</p></div>
    <section class="settings-section" aria-labelledby="settings-mcp-endpoint">
      <div class="settings-section-heading"><h2 id="settings-mcp-endpoint">连接地址</h2><p>此地址会自动匹配当前 Eotion 运行环境。</p></div>
      <div v-if="endpoint" class="settings-copy-row"><code data-testid="mcp-endpoint">{{ endpoint }}</code><button class="settings-secondary-button" type="button" @click="copyText(endpoint, 'MCP 地址')"><EotionIcon :name="IconName.Copy" :size="16" />复制地址</button></div>
      <p v-else class="settings-feedback settings-feedback--error">当前运行环境没有可用的 HTTP(S) MCP 地址。</p>
    </section>
    <section class="settings-section" aria-labelledby="settings-mcp-token-create">
      <div class="settings-section-heading"><h2 id="settings-mcp-token-create">Access Token</h2><p>Token 与网页登录 Session 独立。建议每个客户端创建单独的 Token。</p></div>
      <form class="settings-form" @submit.prevent="createToken">
        <label class="settings-field" for="settings-mcp-token-name">名称</label>
        <div class="settings-inline-control"><input id="settings-mcp-token-name" v-model="tokenName" maxlength="64" autocomplete="off" placeholder="例如 Codex" :disabled="!online || creating" /><button class="settings-primary-button" type="submit" :disabled="!canCreate">{{ creating ? '创建中…' : '创建 Token' }}</button></div>
      </form>
      <div v-if="createdToken" class="settings-token-secret" role="status" aria-live="polite">
        <strong>请立即保存这个 Token</strong><p>明文只显示这一次，离开页面后无法再次查看。</p>
        <div class="settings-copy-row"><code data-testid="mcp-created-token">{{ createdToken }}</code><button class="settings-secondary-button" type="button" @click="copyText(createdToken, 'Token')"><EotionIcon :name="IconName.Copy" :size="16" />复制 Token</button></div>
      </div>
      <p class="settings-feedback" :class="{ 'settings-feedback--error': feedback }" role="status" aria-live="polite">{{ feedback || copyFeedback || ' ' }}</p>
    </section>
    <section class="settings-section" aria-labelledby="settings-mcp-token-list">
      <div class="settings-section-heading"><h2 id="settings-mcp-token-list">已创建的 Token</h2><p>出于安全原因，只显示凭证信息，不会再次显示 Token 明文。</p></div>
      <p v-if="loading" class="settings-muted">正在读取…</p>
      <p v-else-if="!tokens.length" class="settings-muted">还没有可用的 MCP Token。</p>
      <ul v-else class="settings-token-list">
        <li v-for="token in tokens" :key="token.id" class="settings-token-item">
          <div class="settings-token-copy"><strong>{{ token.name }}</strong><span>创建于 {{ formatTime(token.createdAt) }} · 最近使用 {{ formatTime(token.lastUsedAt) }}</span></div>
          <button class="settings-danger-button" type="button" :disabled="!online || Boolean(revokingId)" @click="revokeToken(token)">{{ revokingId === token.id ? '撤销中…' : '撤销' }}</button>
        </li>
      </ul>
    </section>
  </div>
</template>
