<script setup lang="ts">
import { computed, ref } from 'vue'
import { EOTION_BUILD_INFO } from '../../buildInfo'
import { releaseNotesFor } from '../../releaseInfo'
import { checkForUpdate, describeUpdateCheck } from '../../updateCheck'
import { api } from '../../services/productApi'

const build = EOTION_BUILD_INFO
const release = computed(() => releaseNotesFor(build.version))
const shortGitSha = computed(() => build.gitSha === 'unknown' ? 'unknown' : build.gitSha.slice(0, 6))
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
  <div class="settings-page settings-about">
    <div class="settings-page-heading"><h1>软件说明</h1><p>查看当前版本、发行日志与更新状态。</p></div>
    <section class="settings-section" aria-labelledby="settings-about-version">
      <div class="settings-section-heading"><h2 id="settings-about-version">版本信息</h2></div>
      <dl class="settings-about-facts">
        <div class="settings-about-fact"><dt>当前版本</dt><dd class="settings-about-version" data-testid="about-version">{{ build.version }}<span class="settings-about-build">{{ shortGitSha }}</span></dd></div>
        <div class="settings-about-fact"><dt>发行时间</dt><dd class="settings-about-released" data-testid="about-released">{{ release?.releasedAt ?? '暂无记录' }}</dd></div>
        <div class="settings-about-fact">
          <dt>更新</dt>
          <dd class="settings-about-update">
            <button class="settings-primary-button" type="button" data-testid="about-check" :disabled="checking" @click="checkForUpdates">{{ checking ? '检查中…' : '检查更新' }}</button>
            <p class="settings-feedback settings-about-feedback" :class="{ 'settings-feedback--error': feedbackFailed }" role="status" aria-live="polite">{{ feedback || ' ' }}</p>
          </dd>
        </div>
      </dl>
    </section>
    <section class="settings-section" aria-labelledby="settings-about-release">
      <div class="settings-section-heading"><h2 id="settings-about-release">当前版本日志</h2><p v-if="release">v{{ release.version }} · {{ release.releasedAt }}</p><p v-else>暂无当前版本的发行说明。</p></div>
      <ul v-if="release" class="settings-about-notes">
        <li v-for="highlight in release.highlights" :key="highlight">{{ highlight }}</li>
      </ul>
    </section>
  </div>
</template>
