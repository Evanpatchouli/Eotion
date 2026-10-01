<script setup lang="ts">
import { createPinia, disposePinia, getActivePinia, piniaSymbol, setActivePinia } from 'pinia'
import { onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { EotionButton, EotionCommandOverlay, EotionIcon, EotionIconButton, EotionNavItem, IconName } from '../components/ui'
import SyncStatus from '../components/product/SyncStatus.vue'
import { useProductSyncStore } from '../stores/productSync'
import { useTheme } from '../theme'

const productPinia = getActivePinia()
const fixturePinia = createPinia()
provide(piniaSymbol, fixturePinia)
const sync = useProductSyncStore(fixturePinia)
setActivePinia(productPinia)
const { setThemePreference } = useTheme()
const selected = ref('工作笔记')
const navigations = ref(0)
const actions = ref(0)
const retries = ref(0)
const open = ref(false)
const mounted = ref(true)
const empty = ref(false)
const shortcut = ref(true)
const samples = ['synced', 'syncing', 'offline', 'failed', 'idle'] as const

function select(label: string) {
  selected.value = label
  navigations.value++
}

// Development-only state fixtures. No sync lifecycle is started here.
function setSync(state: typeof samples[number], pending = 0) {
  sync.$patch({ state, pending })
}
setSync('synced')
sync.retry = () => { retries.value++ }
// Child store resolution must not leave the application's active Pinia changed.
onMounted(() => setActivePinia(productPinia))
onBeforeUnmount(() => {
  disposePinia(fixturePinia)
  setActivePinia(productPinia)
})
</script>

<template>
  <main class="interaction-demo" data-testid="interaction-foundation-demo">
    <header>
      <p>P5.7.5.3 · QUIET STUDIO</p>
      <h1>共享交互基础</h1>
      <p>导航行、同步状态与命令容器。仅用于开发验证。</p>
      <div class="demo-controls">
        <EotionButton @click="setThemePreference('light')">浅色</EotionButton>
        <EotionButton @click="setThemePreference('dark')">深色</EotionButton>
      </div>
    </header>

    <section aria-labelledby="nav-heading">
      <h2 id="nav-heading">导航行</h2>
      <nav aria-label="演示导航" class="demo-nav">
        <EotionNavItem v-for="label in ['工作笔记', '阅读清单']" :key="label" :active="selected === label" @click="select(label)">
          <template #icon><EotionIcon :name="IconName.FileText" :size="16" /></template>
          {{ label }}
          <template #trailing="{ disabled }"><EotionIconButton :name="IconName.More" :label="`${label}操作`" :disabled="disabled" @click="actions++" /></template>
        </EotionNavItem>
        <EotionNavItem disabled @click="select('不可用导航')">
          不可用导航
          <template #trailing="{ disabled }"><EotionIconButton :name="IconName.More" label="不可用操作" :disabled="disabled" @click="actions++" /></template>
        </EotionNavItem>
      </nav>
      <p data-testid="navigation-count">导航 {{ navigations }} 次 · 操作 {{ actions }} 次</p>
    </section>

    <section aria-labelledby="sync-heading">
      <h2 id="sync-heading">同步状态</h2>
      <div class="demo-sync"><span>当前展示</span><SyncStatus /></div>
      <p data-testid="retry-count">重试 {{ retries }} 次</p>
      <div class="demo-controls">
        <EotionButton v-for="sample in samples" :key="sample" @click="setSync(sample)">{{ sample }}</EotionButton>
        <EotionButton @click="setSync('idle', 2)">pending</EotionButton>
        <EotionButton @click="setSync('offline', 2)">offline pending</EotionButton>
        <EotionButton @click="setSync('failed', 2)">error pending</EotionButton>
      </div>
    </section>

    <section aria-labelledby="command-heading">
      <h2 id="command-heading">Command Overlay</h2>
      <p>Mod + K 打开容器；Tab 保持焦点，Escape 关闭并恢复焦点。</p>
      <div class="demo-controls">
        <EotionButton @click="open = true">打开命令容器</EotionButton>
        <EotionButton @click="mounted = !mounted">{{ mounted ? '卸载容器' : '挂载容器' }}</EotionButton>
        <label><input v-model="empty" type="checkbox" />空容器</label>
        <label><input v-model="shortcut" type="checkbox" />启用快捷键</label>
        <EotionButton @click="open = true; mounted = true">挂载并打开</EotionButton>
      </div>
      <EotionCommandOverlay v-if="mounted" v-model:open="open" label="演示命令容器" :shortcut="shortcut">
        <template #default="{ close }">
          <template v-if="!empty">
            <h2>命令容器</h2>
            <p>此阶段只验证共享交互，搜索与命令内容留给后续阶段。</p>
            <div class="demo-controls">
              <EotionButton autofocus @click="close()">关闭容器</EotionButton>
              <EotionButton @click="mounted = false">卸载打开的容器</EotionButton>
            </div>
          </template>
        </template>
      </EotionCommandOverlay>
    </section>
  </main>
</template>

<style scoped>
.interaction-demo { width: min(100%, 880px); min-height: 100%; margin-inline: auto; padding: var(--e-space-8); background: var(--e-color-canvas); color: var(--e-color-text-primary); font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family); box-sizing: border-box; }
h1 { font-size: var(--e-type-page-title-size); line-height: var(--e-type-page-title-line); margin-block: var(--e-space-2); }
h2 { font-size: var(--e-type-heading-2-size); line-height: var(--e-type-heading-2-line); }
p { color: var(--e-color-text-secondary); }
section { margin-top: var(--e-space-8); }
.demo-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--e-space-2); }
.demo-nav { max-width: 320px; }
.demo-sync { display: flex; min-height: 44px; align-items: center; gap: var(--e-space-4); margin-bottom: var(--e-space-2); }
@media (max-width: 600px) { .interaction-demo { padding: var(--e-space-4); } h1 { font-size: var(--e-type-heading-1-size); line-height: var(--e-type-heading-1-line); } }
</style>
