<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EotionIcon from '../../components/ui/EotionIcon.vue'
import { IconName } from '../../components/ui/icons'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const displayName = ref(auth.user?.displayName ?? '')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrent = ref(false)
const showNew = ref(false)
const profileFeedback = ref('')
const passwordFeedback = ref('')
const canSaveProfile = computed(() => displayName.value.trim().length > 0 && displayName.value.trim().length <= 64 && displayName.value.trim() !== auth.user?.displayName && !auth.profilePending && !auth.offline)
const canChangePassword = computed(() => currentPassword.value.length > 0 && newPassword.value.length >= 1 && newPassword.value.length <= 1024 && confirmPassword.value.length > 0 && !auth.passwordPending && !auth.offline)

watch(() => auth.user?.displayName, (value) => { if (value) displayName.value = value })

async function saveProfile() {
  profileFeedback.value = ''
  const name = displayName.value.trim()
  if (!name || name.length > 64) { profileFeedback.value = '昵称应为 1–64 个字符。'; return }
  if (await auth.updateProfile(name)) profileFeedback.value = '昵称已保存'
  else profileFeedback.value = auth.settingsError
}

async function savePassword() {
  passwordFeedback.value = ''
  if (newPassword.value !== confirmPassword.value) { passwordFeedback.value = '两次输入的新密码不一致。'; return }
  if (!newPassword.value || newPassword.value.length > 1024) { passwordFeedback.value = '新密码应为 1–1024 个字符。'; return }
  if (!(await auth.changePassword(currentPassword.value, newPassword.value))) passwordFeedback.value = auth.settingsError
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-page-heading"><h1>账号资料</h1><p>管理你的昵称与登录密码。</p></div>
    <section class="settings-section" aria-labelledby="settings-profile-name">
      <div class="settings-section-heading"><h2 id="settings-profile-name">昵称</h2><p>这个名字会显示在你的工作区中。</p></div>
      <form class="settings-form" @submit.prevent="saveProfile">
        <label class="settings-field" for="settings-display-name">昵称</label>
        <div class="settings-inline-control"><input id="settings-display-name" v-model="displayName" maxlength="64" autocomplete="nickname" :aria-describedby="auth.offline ? 'settings-profile-offline' : undefined" /><button class="settings-primary-button" type="submit" :disabled="!canSaveProfile">{{ auth.profilePending ? '保存中…' : '保存昵称' }}</button></div>
        <p id="settings-profile-offline" class="settings-feedback" :class="{ 'settings-feedback--error': profileFeedback !== '昵称已保存' }" role="status" aria-live="polite">{{ profileFeedback || (auth.offline ? '当前离线，联网后可修改昵称。' : ' ') }}</p>
      </form>
    </section>
    <section class="settings-section" aria-labelledby="settings-profile-password">
      <div class="settings-section-heading"><h2 id="settings-profile-password">变更密码</h2><p>更改后，所有设备都需要使用新密码重新登录。</p></div>
      <form class="settings-form settings-password-form" @submit.prevent="savePassword">
        <div class="settings-password-field"><label class="settings-field" for="settings-current-password">当前密码</label><div class="settings-password-input"><input id="settings-current-password" v-model="currentPassword" :type="showCurrent ? 'text' : 'password'" autocomplete="current-password" /><button type="button" :aria-label="showCurrent ? '隐藏当前密码' : '显示当前密码'" @click="showCurrent = !showCurrent"><EotionIcon :name="showCurrent ? IconName.EyeOff : IconName.Eye" :size="18" /></button></div></div>
        <div class="settings-password-field"><label class="settings-field" for="settings-new-password">新密码</label><div class="settings-password-input"><input id="settings-new-password" v-model="newPassword" :type="showNew ? 'text' : 'password'" autocomplete="new-password" /><button type="button" :aria-label="showNew ? '隐藏新密码' : '显示新密码'" @click="showNew = !showNew"><EotionIcon :name="showNew ? IconName.EyeOff : IconName.Eye" :size="18" /></button></div></div>
        <div class="settings-password-field"><label class="settings-field" for="settings-confirm-password">确认新密码</label><input id="settings-confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" /></div>
        <div class="settings-form-actions"><button class="settings-primary-button" type="submit" :disabled="!canChangePassword">{{ auth.passwordPending ? '更新中…' : '更新密码' }}</button></div>
        <p class="settings-feedback settings-feedback--error" role="alert" aria-live="polite">{{ passwordFeedback || (auth.offline ? '当前离线，联网后可修改密码。' : ' ') }}</p>
      </form>
    </section>
  </div>
</template>
