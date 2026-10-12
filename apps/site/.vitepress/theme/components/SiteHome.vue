<script setup lang="ts">
import { computed } from 'vue'
import ProductShot from './ProductShot.vue'
import { usePlatform } from './usePlatform'
const platform = usePlatform()
const cta = computed(() => platform.value === 'windows' ? '下载 Windows 版' : platform.value === 'android' ? '下载 Android 版' : '免费下载')
const href = computed(() => `/download${platform.value ? `#${platform.value}` : ''}`)
</script>

<template>
  <main class="site-home">
    <section class="site-hero site-wrap" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="hero-brand">Eotion</p>
        <h1 id="hero-title">把想法，留在一个<br class="desktop-break">安静的地方。</h1>
        <p class="hero-intro">Local-first 的文档与知识工作空间。<br>为写作、整理与长期思考而设计。</p>
        <div class="site-actions">
          <a class="site-button primary" :href="href">{{ cta }}</a>
          <a class="site-button secondary" href="/guide/">用户指南 <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <ProductShot eager class="hero-shot" />
    </section>

    <section class="writing-section site-wrap site-section" aria-labelledby="writing-title">
      <div class="section-heading">
        <h2 id="writing-title">专注内容本身。</h2>
        <p>没有复杂的仪表盘，也没有不断争夺注意力的界面。<br>打开页面，然后开始写。</p>
      </div>
      <ProductShot class="writing-shot" alt="Eotion 文档中的标题、正文与安静的编辑画布" />
    </section>

    <section class="local-section site-section" aria-labelledby="local-title">
      <div class="site-wrap local-grid">
        <h2 id="local-title">网络不是你文档<br>存在的前提。</h2>
        <div class="local-copy">
          <p>想法来了，就写下来。已保存在这台设备的页面，离线也可以继续编辑。</p>
          <p>文字先留在本地，连接恢复后再同步。换一台设备，继续自己的思路。</p>
          <div class="save-states" aria-label="文档保存状态示例">
            <span><i aria-hidden="true"></i>离线 · 本地已保存</span>
            <span><i aria-hidden="true"></i>已同步</span>
          </div>
          <a class="text-link" href="/guide/sync-offline">了解离线使用与同步限制 <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>

    <section class="platform-section site-wrap site-section" aria-labelledby="platform-title">
      <div class="platform-copy">
        <h2 id="platform-title">同一处空间，<br>不同的屏幕。</h2>
        <p>在桌面展开思路，在小屏幕记下灵感。<br>让文档跟上你的日常。</p>
        <ul class="platform-list" aria-label="现有平台"><li>Web</li><li>Windows</li><li>Android</li><li>HarmonyOS</li></ul>
        <a class="text-link" href="/download">选择你的平台 <span aria-hidden="true">↗</span></a>
        <p class="small-note">移动客户端仍在完善。下载可用状态与使用限制见下载页和用户指南。</p>
      </div>
      <div class="platform-media"><ProductShot /><ProductShot mobile /></div>
    </section>

    <section class="rich-section site-wrap site-section" aria-labelledby="rich-title">
      <div class="section-heading">
        <h2 id="rich-title">不只是输入文字。</h2>
        <p>标题、列表、待办、引用、代码、图片和文件，<br>都自然存在于同一篇文档中。</p>
      </div>
      <div class="rich-layout">
        <ProductShot alt="Eotion 真实编辑器中的丰富文档示例" />
        <div class="rich-copy">
          <p>用页面树整理上下文，<br>用合适的格式表达想法。</p>
          <p>从一行笔记开始，<br>慢慢长成自己的知识空间。</p>
          <a class="text-link" href="/guide/editor">认识编辑器 <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>

    <section class="database-section site-wrap site-section" aria-labelledby="database-title">
      <div class="section-heading">
        <h2 id="database-title">一份数据，<br>换几种看法。</h2>
        <p>表格适合编辑，列表适合浏览，看板适合推进。<br>三种视图共享同一份记录与属性。</p>
      </div>
      <div class="database-grid">
        <div class="database-copy">
          <p>同一个 Database 可以创建 Table、List 和 Board。每个 View 保存自己的筛选、排序、属性展示与分组方式，也可以在其他页面以 Linked View 再次呈现。</p>
          <ul class="database-points" aria-label="数据库能力">
            <li>Table、List、Board 共用同一份 Records</li>
            <li>筛选、多级排序与属性展示按 View 独立保存</li>
            <li>Board 按 Select 属性分组，桌面支持拖动卡片</li>
            <li>记录仍是一篇可以继续书写的 Eotion 页面</li>
          </ul>
          <a class="text-link" href="/guide/database">了解数据库 <span aria-hidden="true">↗</span></a>
        </div>
        <div class="database-card-stack" role="img" aria-label="Eotion 同一数据库的表格、列表和看板视图">
          <div class="database-view-card database-view-card--table" aria-hidden="true">
            <picture class="shot-light"><img src="/screenshots/database-table.svg" alt="" width="900" height="500" loading="lazy" decoding="async"></picture>
            <picture class="shot-dark"><img src="/screenshots/database-table-dark.svg" alt="" width="900" height="500" loading="lazy" decoding="async"></picture>
            <span>Table</span>
          </div>
          <div class="database-view-card database-view-card--list" aria-hidden="true">
            <picture class="shot-light"><img src="/screenshots/database-list.svg" alt="" width="900" height="500" loading="lazy" decoding="async"></picture>
            <picture class="shot-dark"><img src="/screenshots/database-list-dark.svg" alt="" width="900" height="500" loading="lazy" decoding="async"></picture>
            <span>List</span>
          </div>
          <div class="database-view-card database-view-card--board" aria-hidden="true">
            <picture class="shot-light"><img src="/screenshots/database-board.svg" alt="" width="900" height="500" loading="lazy" decoding="async"></picture>
            <picture class="shot-dark"><img src="/screenshots/database-board-dark.svg" alt="" width="900" height="500" loading="lazy" decoding="async"></picture>
            <span>Board</span>
          </div>
        </div>
      </div>
      <p class="database-note">同一 Database 可以拥有多个独立 View；Table、List、Board 共享数据，不复制记录。</p>
    </section>

    <section class="mcp-section site-wrap site-section" aria-labelledby="mcp-title">
      <div class="section-heading">
        <h2 id="mcp-title">为 AI 而生的 MCP</h2>
        <p>让 AI 真正使用你的文档，<br>而不只是读一份导出的副本。</p>
      </div>
      <div class="mcp-grid">
        <div class="mcp-copy">
          <p>连接 Codex 等 MCP 客户端，让 AI 在你的授权范围内搜索、阅读、创建和更新 Eotion 文档。</p>
          <ul class="mcp-points" aria-label="MCP 能力">
            <li>原生 MCP，无需额外插件</li>
            <li>不只读取，也能安全写回</li>
            <li>独立 MCP Access Token</li>
            <li>权限由 Eotion 账号控制</li>
          </ul>
          <a class="text-link" href="/guide/mcp">连接你的 AI 客户端 <span aria-hidden="true">↗</span></a>
        </div>
        <div class="mcp-flow" role="img" aria-label="Codex 或 MCP 客户端连接 Eotion MCP，然后进行搜索、阅读、创建和更新">
          <span class="mcp-flow-node">Codex / MCP Client</span>
          <span class="mcp-flow-arrow" aria-hidden="true">↓</span>
          <span class="mcp-flow-node is-service">Eotion MCP</span>
          <span class="mcp-flow-arrow" aria-hidden="true">↓</span>
          <span class="mcp-flow-node is-actions">搜索 · 阅读 · 创建 · 更新</span>
        </div>
      </div>
    </section>

    <section class="download-section site-section" aria-labelledby="download-title">
      <div class="site-wrap">
        <h2 id="download-title">开始使用 Eotion</h2>
        <p>你的文档，随时在身边。</p>
        <p class="download-platforms">Windows <span>·</span> Android <span>·</span> HarmonyOS <span>·</span> Web</p>
        <a class="site-button primary" href="/download">下载 Eotion <span aria-hidden="true">↗</span></a>
      </div>
    </section>
    <nav class="site-footer-links site-wrap" aria-label="页脚导航">
      <a href="/">产品</a><a href="/download">下载</a><a href="/guide/">用户指南</a>
      <a href="https://github.com/Evanpatchouli/Eotion">GitHub</a>
    </nav>
  </main>
</template>
