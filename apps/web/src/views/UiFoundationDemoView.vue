<script setup lang="ts">
import { ref } from 'vue'

import {
  EotionButton,
  EotionDivider,
  EotionIcon,
  EotionIconButton,
  EotionInput,
  EotionPopover,
  EotionSurface,
  EotionSwitch,
  IconName,
} from '../components/ui'
import { useTheme, type ThemePreference } from '../theme'

const { themePreference, setThemePreference } = useTheme()
const inputValue = ref('Quiet Studio')
const enabled = ref(true)
const disabledEnabled = ref(false)
const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]
</script>

<template>
  <main class="ui-foundation-demo" data-testid="ui-foundation-demo">
    <div class="ui-foundation-demo__content">
      <header class="ui-foundation-demo__header">
        <div>
          <p class="ui-foundation-demo__eyebrow">P5.7.5 · UI FOUNDATION</p>
          <h1>Quiet Studio 基础组件</h1>
          <p class="ui-foundation-demo__intro">在这里查看冻结的 Light / Dark 语义 token 与基础控件。此页只用于开发验证，不会改变正式产品页面。</p>
        </div>
        <fieldset class="ui-foundation-demo__themes" aria-label="展示主题">
          <legend>主题</legend>
          <label v-for="option in themeOptions" :key="option.value" class="ui-foundation-demo__theme-option">
            <input
              type="radio"
              name="demo-theme"
              :value="option.value"
              :checked="themePreference === option.value"
              @change="setThemePreference(option.value)"
            />
            <span>{{ option.label }}</span>
          </label>
        </fieldset>
      </header>

      <section class="ui-foundation-demo__section" aria-labelledby="ui-foundation-buttons">
        <div class="ui-foundation-demo__section-heading">
          <h2 id="ui-foundation-buttons">按钮与输入</h2>
          <p>克制的强调层级，以及原生表单行为。</p>
        </div>
        <EotionSurface variant="surface" class="ui-foundation-demo__panel">
          <div class="ui-foundation-demo__row" aria-label="按钮 variants">
            <EotionButton variant="primary">主要操作</EotionButton>
            <EotionButton>次要操作</EotionButton>
            <EotionButton variant="ghost">轻量操作</EotionButton>
            <EotionButton variant="danger">删除</EotionButton>
            <EotionButton disabled>不可用</EotionButton>
            <EotionIconButton :name="IconName.Plus" label="新增条目" />
          </div>
          <EotionDivider />
          <div class="ui-foundation-demo__field-row">
            <label class="ui-foundation-demo__field">
              <span>输入框</span>
              <EotionInput v-model="inputValue" aria-label="演示输入框" name="demo-input" placeholder="输入内容" />
            </label>
            <label class="ui-foundation-demo__field">
              <span>开关</span>
              <EotionSwitch v-model="enabled" label="演示开关" />
            </label>
            <label class="ui-foundation-demo__field">
              <span>禁用状态</span>
              <EotionSwitch v-model="disabledEnabled" label="禁用的演示开关" disabled />
            </label>
          </div>
        </EotionSurface>
      </section>

      <section class="ui-foundation-demo__section" aria-labelledby="ui-foundation-surfaces">
        <div class="ui-foundation-demo__section-heading">
          <h2 id="ui-foundation-surfaces">Surface 层级</h2>
          <p>从开放画布到浮层，仅保留有语义的承托。</p>
        </div>
        <div class="ui-foundation-demo__surface-grid">
          <EotionSurface variant="canvas" class="ui-foundation-demo__surface-sample"><span>Canvas</span><code>canvas</code></EotionSurface>
          <EotionSurface variant="sidebar" class="ui-foundation-demo__surface-sample"><span>Sidebar</span><code>sidebar</code></EotionSurface>
          <EotionSurface variant="subtle" class="ui-foundation-demo__surface-sample"><span>轻量区块</span><code>surface-subtle</code></EotionSurface>
          <EotionSurface variant="surface" class="ui-foundation-demo__surface-sample"><span>控件表面</span><code>surface</code></EotionSurface>
          <EotionSurface variant="elevated" class="ui-foundation-demo__surface-sample"><span>浮层</span><code>elevated</code></EotionSurface>
        </div>
      </section>

      <section class="ui-foundation-demo__section" aria-labelledby="ui-foundation-type">
        <div class="ui-foundation-demo__section-heading">
          <h2 id="ui-foundation-type">排版比例</h2>
          <p>有限层级，清晰阅读节奏。</p>
        </div>
        <EotionSurface variant="surface" class="ui-foundation-demo__type-samples">
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--title"><span>Page Title</span><strong>安静的工作空间</strong></div>
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--h1"><span>Heading 1</span><strong>把注意力留给内容</strong></div>
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--h2"><span>Heading 2</span><strong>温和而清楚的层级</strong></div>
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--body"><span>Body</span><strong>正文保持舒适行距，在浅色和深色主题中都易于阅读。</strong></div>
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--ui"><span>UI</span><strong>导航与按钮</strong></div>
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--metadata"><span>Metadata</span><strong>页面属性与辅助信息</strong></div>
          <div class="ui-foundation-demo__type-sample ui-foundation-demo__type-sample--caption"><span>Caption</span><strong>轻量说明和次级状态</strong></div>
        </EotionSurface>
      </section>

      <section class="ui-foundation-demo__section" aria-labelledby="ui-foundation-popover">
        <div class="ui-foundation-demo__section-heading">
          <h2 id="ui-foundation-popover">Popover</h2>
          <p>锚定触发器，支持键盘导航和关闭后焦点返回。</p>
        </div>
        <EotionPopover label="组件菜单">
          <template #trigger="{ triggerProps, open }">
            <EotionButton v-bind="triggerProps" aria-label="打开组件菜单">
              <EotionIcon :name="IconName.More" />
              {{ open ? '关闭菜单' : '打开菜单' }}
            </EotionButton>
          </template>
          <template #default="{ close }">
            <div class="ui-foundation-demo__menu">
              <button role="menuitem" type="button" @click="close()">打开页面</button>
              <button role="menuitem" type="button" @click="close()">复制链接</button>
              <button role="menuitem" type="button" data-danger="true" @click="close()">删除条目</button>
            </div>
          </template>
        </EotionPopover>
      </section>

      <footer class="ui-foundation-demo__footer">
        <span>语义颜色</span>
        <span v-for="token in ['accent', 'success', 'warning', 'danger']" :key="token" class="ui-foundation-demo__swatch">
          <i :class="`ui-foundation-demo__swatch-dot ui-foundation-demo__swatch-dot--${token}`" />
          {{ token }}
        </span>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.ui-foundation-demo {
  min-height: 100%;
  padding: var(--e-space-10) var(--e-space-8) var(--e-space-12);
  background: var(--e-color-canvas);
  color: var(--e-color-text-primary);
  font-family: var(--e-type-family);
}
.ui-foundation-demo__content { width: min(100%, 960px); margin-inline: auto; }
.ui-foundation-demo__header { display: flex; align-items: end; justify-content: space-between; gap: var(--e-space-8); padding-bottom: var(--e-space-8); }
.ui-foundation-demo__eyebrow { margin: 0 0 var(--e-space-2); color: var(--e-color-text-muted); font: var(--e-type-caption-weight) var(--e-type-caption-size) / var(--e-type-caption-line) var(--e-type-family); letter-spacing: .08em; }
.ui-foundation-demo h1 { margin: 0; font: var(--e-type-page-title-weight) var(--e-type-page-title-size) / var(--e-type-page-title-line) var(--e-type-family); letter-spacing: var(--e-type-page-title-tracking); }
.ui-foundation-demo__intro { max-width: 640px; margin: var(--e-space-2) 0 0; color: var(--e-color-text-secondary); font: var(--e-type-body-weight) var(--e-type-body-size) / var(--e-type-body-line) var(--e-type-family); }
.ui-foundation-demo__themes { display: flex; flex: none; gap: var(--e-space-3); margin: 0; padding: var(--e-space-2) var(--e-space-3); border: var(--e-border-width) solid var(--e-color-border); border-radius: var(--e-radius-control); background: var(--e-color-surface); }
.ui-foundation-demo__themes legend { padding-inline: var(--e-space-1); color: var(--e-color-text-muted); font: var(--e-type-caption-weight) var(--e-type-caption-size) / var(--e-type-caption-line) var(--e-type-family); }
.ui-foundation-demo__theme-option { display: inline-flex; align-items: center; gap: var(--e-space-1); color: var(--e-color-text-secondary); font: var(--e-type-metadata-weight) var(--e-type-metadata-size) / var(--e-type-metadata-line) var(--e-type-family); cursor: pointer; }
.ui-foundation-demo__theme-option input { accent-color: var(--e-color-accent); }
.ui-foundation-demo__section { margin-top: var(--e-space-8); }
.ui-foundation-demo__section-heading { margin-bottom: var(--e-space-3); }
.ui-foundation-demo__section-heading h2 { margin: 0; font: var(--e-type-heading-2-weight) var(--e-type-heading-2-size) / var(--e-type-heading-2-line) var(--e-type-family); letter-spacing: var(--e-type-heading-2-tracking); }
.ui-foundation-demo__section-heading p { margin: var(--e-space-1) 0 0; color: var(--e-color-text-muted); font: var(--e-type-metadata-weight) var(--e-type-metadata-size) / var(--e-type-metadata-line) var(--e-type-family); }
.ui-foundation-demo__panel { display: grid; gap: var(--e-space-4); padding: var(--e-space-4); }
.ui-foundation-demo__row, .ui-foundation-demo__field-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--e-space-3); }
.ui-foundation-demo__field-row { align-items: end; }
.ui-foundation-demo__field { display: grid; min-width: 160px; gap: var(--e-space-2); color: var(--e-color-text-secondary); font: var(--e-type-metadata-weight) var(--e-type-metadata-size) / var(--e-type-metadata-line) var(--e-type-family); }
.ui-foundation-demo__surface-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--e-space-3); }
.ui-foundation-demo__surface-sample { display: grid; min-height: 96px; align-content: space-between; padding: var(--e-space-3); border: var(--e-border-width) solid var(--e-color-border-subtle); color: var(--e-color-text-primary); font: var(--e-type-ui-weight-strong) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family); }
.ui-foundation-demo__surface-sample code { color: var(--e-color-text-muted); font: var(--e-type-caption-weight) var(--e-type-caption-size) / var(--e-type-caption-line) var(--e-type-family); }
.ui-foundation-demo__type-samples { display: grid; gap: var(--e-space-3); padding: var(--e-space-4); }
.ui-foundation-demo__type-sample { display: flex; align-items: baseline; gap: var(--e-space-4); }
.ui-foundation-demo__type-sample span { width: 112px; flex: none; color: var(--e-color-text-muted); font: var(--e-type-caption-weight) var(--e-type-caption-size) / var(--e-type-caption-line) var(--e-type-family); }
.ui-foundation-demo__type-sample strong { color: var(--e-color-text-primary); }
.ui-foundation-demo__type-sample--title strong { font: var(--e-type-page-title-weight) var(--e-type-page-title-size) / var(--e-type-page-title-line) var(--e-type-family); letter-spacing: var(--e-type-page-title-tracking); }
.ui-foundation-demo__type-sample--h1 strong { font: var(--e-type-heading-1-weight) var(--e-type-heading-1-size) / var(--e-type-heading-1-line) var(--e-type-family); letter-spacing: var(--e-type-heading-1-tracking); }
.ui-foundation-demo__type-sample--h2 strong { font: var(--e-type-heading-2-weight) var(--e-type-heading-2-size) / var(--e-type-heading-2-line) var(--e-type-family); letter-spacing: var(--e-type-heading-2-tracking); }
.ui-foundation-demo__type-sample--body strong { font: var(--e-type-body-weight) var(--e-type-body-size) / var(--e-type-body-line) var(--e-type-family); }
.ui-foundation-demo__type-sample--ui strong { font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family); }
.ui-foundation-demo__type-sample--metadata strong { font: var(--e-type-metadata-weight) var(--e-type-metadata-size) / var(--e-type-metadata-line) var(--e-type-family); }
.ui-foundation-demo__type-sample--caption strong { font: var(--e-type-caption-weight) var(--e-type-caption-size) / var(--e-type-caption-line) var(--e-type-family); }
.ui-foundation-demo__menu { display: grid; gap: var(--e-space-1); }
.ui-foundation-demo__menu button { min-height: 32px; padding-inline: var(--e-space-3); border: 0; border-radius: var(--e-radius-control); background: transparent; color: var(--e-color-text-primary); font: var(--e-type-ui-weight) var(--e-type-ui-size) / var(--e-type-ui-line) var(--e-type-family); text-align: left; cursor: pointer; }
.ui-foundation-demo__menu button:hover { background: var(--e-color-hover); }
.ui-foundation-demo__menu button:focus-visible { background: var(--e-color-hover); outline: var(--e-focus-ring-width) solid var(--e-color-focus); outline-offset: -1px; }
.ui-foundation-demo__menu button[data-danger="true"] { color: var(--e-color-danger); background: var(--e-color-surface-subtle); }
.ui-foundation-demo__menu button[data-danger="true"]:hover { text-decoration: underline; }
.ui-foundation-demo__footer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--e-space-4); margin-top: var(--e-space-8); padding-top: var(--e-space-4); border-top: var(--e-border-width) solid var(--e-color-border-subtle); color: var(--e-color-text-muted); font: var(--e-type-metadata-weight) var(--e-type-metadata-size) / var(--e-type-metadata-line) var(--e-type-family); }
.ui-foundation-demo__swatch { display: inline-flex; align-items: center; gap: var(--e-space-1); }
.ui-foundation-demo__swatch-dot { width: var(--e-space-3); height: var(--e-space-3); border-radius: 50%; }
.ui-foundation-demo__swatch-dot--accent { background: var(--e-color-accent); }
.ui-foundation-demo__swatch-dot--success { background: var(--e-color-success); }
.ui-foundation-demo__swatch-dot--warning { background: var(--e-color-warning); }
.ui-foundation-demo__swatch-dot--danger { background: var(--e-color-danger); }
@media (max-width: 760px) {
  .ui-foundation-demo { padding: var(--e-space-6) var(--e-space-4) var(--e-space-8); }
  .ui-foundation-demo__header { align-items: start; flex-direction: column; }
  .ui-foundation-demo__surface-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ui-foundation-demo h1 { font-size: var(--e-type-heading-1-size); line-height: var(--e-type-heading-1-line); }
}
</style>
