<script setup lang="ts">
import { release, appOrigin } from '../../../data/releases'
import { usePlatform } from './usePlatform'
const recommended = usePlatform()
const platforms = [
  { id: 'windows', title: 'Windows', subtitle: 'Windows 10 / 11 · x64', formats: [
    { text: '下载安装版', url: release.windows.installer }, { text: '便携版', url: release.windows.portable }, { text: 'ZIP', url: release.windows.zip },
  ] },
  { id: 'android', title: 'Android', subtitle: '移动客户端', formats: [{ text: '下载 APK', url: release.android.apk }] },
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
        <div>
          <h2 :id="`${platform.id}-title`">Eotion for {{ platform.title }}</h2>
          <p>{{ platform.subtitle }} <span v-if="recommended === platform.id" class="recommendation">推荐用于当前设备</span></p>
        </div>
        <div class="download-options">
          <template v-for="format in platform.formats" :key="format.text">
            <a v-if="format.url" class="site-button secondary" :href="format.url">{{ format.text }} <span aria-hidden="true">↓</span></a>
            <span v-else class="unavailable">{{ format.text }} · 暂未提供下载</span>
          </template>
        </div>
      </section>
      <section id="web" class="download-row" aria-labelledby="web-title">
        <div><h2 id="web-title">Eotion Web</h2><p>无需安装，打开浏览器即可开始。</p></div>
        <a class="site-button primary" :href="appOrigin">打开 Eotion Web <span aria-hidden="true">↗</span></a>
      </section>
    </div>
    <aside class="download-note" aria-label="下载说明">
      <p>当前未配置公开下载地址的安装包会标记为“暂未提供下载”。你可以先使用 Web 版。</p>
      <p>Android 与 HarmonyOS 客户端仍在完善，部分移动端原生文件选择能力存在限制。<a href="/guide/attachments">了解图片与文件</a>。</p>
      <p>第一次使用？从<a href="/guide/getting-started">快速开始</a>了解注册、创建工作区与第一篇文档。</p>
    </aside>
  </main>
</template>
