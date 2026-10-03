<script setup lang="ts">
import { release, releaseNotes } from '../../../data/releases'
</script>

<template>
  <div class="release-notes" aria-label="版本更新记录">
    <p v-if="!release.releasedAt">当前版本 v{{ release.version }} 的发布说明尚未提供。以下为已有发布记录。</p>
    <section v-for="note in releaseNotes" :key="note.version" :aria-labelledby="`v${note.version}`">
      <h2 :id="`v${note.version}`">v{{ note.version }}</h2>
      <p>{{ note.releasedAt }}<template v-if="note.version === release.version"> · Build {{ release.buildNumber }}</template></p>
      <ul><li v-for="highlight in note.highlights" :key="highlight">{{ highlight }}</li></ul>
    </section>
    <p>移动客户端包含原生宿主基础，部分平台能力仍在完善。请查阅<a href="/guide/">用户指南</a>中的使用限制。</p>
  </div>
</template>
