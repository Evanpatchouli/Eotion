<script setup lang="ts">
import { computed, ref } from 'vue'
import { EOTION_BUILD_INFO } from '../../buildInfo'
import { releaseNotesFor } from '../../releaseInfo'
import { checkForUpdate, describeUpdateCheck } from '../../updateCheck'
import { api } from '../../services/productApi'

const build = EOTION_BUILD_INFO
const release = computed(() => releaseNotesFor(build.version))
const checking = ref(false)
const feedback = ref('')
const feedbackFailed = ref(false)

async function checkForUpdates() {
  if (checking.value) return
  checking.value = true
  feedback.value = ''
  feedbackFailed.value = false
  try {
    const remote = await api.health()
    feedback.value = describeUpdateCheck(checkForUpdate(
      { version: build.version, buildNumber: build.buildNumber },
      { version: remote.version, buildNumber: remote.buildNumber },
    ))
  } catch {
    feedbackFailed.value = true
    feedback.value = describeUpdateCheck({ kind: 'failed' })
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-page-heading"><h1>软件说明</h1><p>当前运行的版本信息与更新检查。此设备只做检查，不会自动下载或安装。</p></div>
    <section class="settings-section" aria-labelledby="settings-about-version">
      <div class="settings-section-heading"><h2 id="settings-about-version">当前版本</h2><p>此设备正在运行的 Eotion 构建。</p></div>
      <dl class="settings-about-facts">
        <div class="settings-about-fact"><dt>当前版本</dt><dd class="settings-about-version" data-testid="about-version">{{ build.version }}<span class="settings-about-build">Build {{ build.buildNumber }}</span></dd></div>
        <div class="settings-about-fact"><dt>发行时间</dt><dd class="settings-about-released" data-testid="about-released">{{ release?.releasedAt ?? '暂无记录' }}</dd></div>
      </dl>
    </section>
    <section class="settings-section" aria-labelledby="settings-about-update">
      <div class="settings-section-heading"><h2 id="settings-about-update">检查更新</h2><p>与服务器比较版本与构建号。</p></div>
      <button class="settings-primary-button" type="button" data-testid="about-check" :disabled="checking" @click="checkForUpdates">{{ checking ? '检查中…' : '检查更新' }}</button>
      <p class="settings-feedback" :class="{ 'settings-feedback--error': feedbackFailed }" role="status" aria-live="polite">{{ feedback || ' ' }}</p>
    </section>
    <section class="settings-section" aria-labelledby="settings-about-release">
      <div class="settings-section-heading"><h2 id="settings-about-release">当前版本日志</h2><p v-if="release">v{{ release.version }} · {{ release.releasedAt }}</p><p v-else>暂无当前版本的发行说明。</p></div>
      <ul v-if="release" class="settings-about-notes">
        <li v-for="highlight in release.highlights" :key="highlight">{{ highlight }}</li>
      </ul>
    </section>
  </div>
</template>
