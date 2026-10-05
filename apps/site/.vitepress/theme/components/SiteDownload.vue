<script setup lang="ts">
import { release, appOrigin } from '../../../data/releases'
import { usePlatform } from './usePlatform'

const recommended = usePlatform()

function versionFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const pathname = decodeURIComponent(new URL(url).pathname)
    return pathname.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?/)?.[0] ?? null
  } catch {
    return null
  }
}

const platforms = [
  { id: 'windows', title: 'Windows', subtitle: 'Windows 10 / 11 · x64', formats: [
    { text: '下载安装版', url: release.windows.installer }, { text: '便携版', url: release.windows.portable }, { text: 'ZIP', url: release.windows.zip },
  ] },
  { id: 'android', title: 'Android', subtitle: '移动客户端', formats: [{ text: '下载 APK', url: release.android.apk }] },
  { id: 'ios', title: 'iOS', subtitle: 'iPhone / iPad · 客户端尚未提供', formats: [{ text: 'iOS', url: null }] },
  { id: 'harmony', title: 'HarmonyOS', subtitle: '原生宿主基础', formats: [{ text: '下载 HAP', url: release.harmony.hap }] },
]
</script>

<template>
  <main class="site-download site-wrap">
    <header class="download-header">
      <h1>下载 Eotion</h1>
      <p class="hero-intro">你的文档，随时在身边。</p>
      <p class="release-label">Version {{ release.version }} · Build {{ release.buildNumber }}<template v-if="release.releasedAt"> · {{ release.releasedAt }}</template></p>
    </header>
    <div class="download-rows">
      <section v-for="platform in platforms" :id="platform.id" :key="platform.id" class="download-row" :aria-labelledby="`${platform.id}-title`">
        <div class="download-platform-copy">
          <span class="platform-icon" aria-hidden="true">
            <svg v-if="platform.id === 'windows'" viewBox="0 0 24 24">
              <path d="M3 4.8 10.3 3.8v7.3H3V4.8Zm8.3-1.1L21 2.4v8.7h-9.7V3.7ZM3 12.1h7.3v7.4L3 18.5v-6.4Zm8.3 0H21v8.8l-9.7-1.4v-7.4Z"/>
            </svg>
            <svg v-else-if="platform.id === 'android'" viewBox="0 0 24 24">
              <path d="M7.2 8.2h9.6c.9 0 1.7.8 1.7 1.7v6.8c0 .6-.5 1.1-1.1 1.1h-1.1V21c0 .6-.5 1-1 1s-1-.4-1-1v-3.2H9.7V21c0 .6-.5 1-1 1s-1-.4-1-1v-3.2H6.6c-.6 0-1.1-.5-1.1-1.1V9.9c0-.9.8-1.7 1.7-1.7Zm.3-1.3a4.8 4.8 0 0 1 1.3-2.3L7.6 2.8a.6.6 0 1 1 1-.7l1.2 1.8a6.9 6.9 0 0 1 4.4 0l1.2-1.8a.6.6 0 1 1 1 .7l-1.2 1.8a4.8 4.8 0 0 1 1.3 2.3h-9ZM9 5.6a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Zm6 0a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Z"/>
            </svg>
            <svg v-else-if="platform.id === 'ios'" viewBox="0 0 24 24">
              <path d="M15.8 12.7c0-2 1.7-3 1.8-3.1a4 4 0 0 0-3.2-1.7c-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.9-.8-1.5 0-3 .9-3.8 2.3-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3.1-.7 1.4 0 1.9.7 3.1.7 1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-3.1-1.2-3.1-4.3Zm-2.3-6.2c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 7.4c2-2.3 4.3-3.4 7-3.4s5 1.1 7 3.4M7.1 10.6C8.5 9 10.1 8.2 12 8.2s3.5.8 4.9 2.4M9.4 13.8c.7-.8 1.6-1.2 2.6-1.2s1.9.4 2.6 1.2"/>
              <circle cx="12" cy="17.4" r="1.4"/>
            </svg>
          </span>
          <div>
            <h2 :id="`${platform.id}-title`">Eotion for {{ platform.title }}</h2>
            <p>{{ platform.subtitle }} <span v-if="recommended === platform.id" class="recommendation">推荐用于当前设备</span></p>
          </div>
        </div>
        <div class="download-options">
          <template v-for="format in platform.formats" :key="format.text">
            <a v-if="format.url" class="site-button secondary" :href="format.url">
              <span>{{ format.text }}</span>
              <span v-if="versionFromUrl(format.url)" class="download-button-version">v{{ versionFromUrl(format.url) }}</span>
              <span aria-hidden="true">↓</span>
            </a>
            <span v-else class="unavailable">{{ format.text }} · 暂未提供下载</span>
          </template>
        </div>
      </section>
      <section id="web" class="download-row" aria-labelledby="web-title">
        <div class="download-platform-copy">
          <span class="platform-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>
              <path d="M3 8h18" fill="none" stroke="currentColor" stroke-width="1.8"/>
              <circle cx="6" cy="6" r=".7"/><circle cx="8.5" cy="6" r=".7"/><circle cx="11" cy="6" r=".7"/>
            </svg>
          </span>
          <div><h2 id="web-title">Eotion Web</h2><p>无需安装，打开浏览器即可开始。</p></div>
        </div>
        <a class="site-button primary" :href="appOrigin">打开 Eotion Web <span aria-hidden="true">↗</span></a>
      </section>
    </div>
    <aside class="download-note" aria-label="下载说明">
      <p>当前未配置公开下载地址的安装包会标记为“暂未提供下载”。你可以先使用 Web 版。</p>
      <p>iOS 客户端尚未提供；Android 与 HarmonyOS 客户端仍在完善，部分移动端原生文件选择能力存在限制。<a href="/guide/attachments">了解图片与文件</a>。</p>
      <p>第一次使用？从<a href="/guide/getting-started">快速开始</a>了解注册、创建工作区与第一篇文档。</p>
    </aside>
  </main>
</template>
