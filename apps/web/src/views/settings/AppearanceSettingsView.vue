<script setup lang="ts">
import EotionIcon from '../../components/ui/EotionIcon.vue'
import { IconName } from '../../components/ui/icons'
import { useTheme, type ThemePreference } from '../../theme'

const { themePreference, setThemePreference } = useTheme()
const options: { value: ThemePreference, label: string, detail: string, icon: IconName }[] = [
  { value: 'system', label: '跟随系统', detail: '自动匹配当前设备的外观。', icon: IconName.Settings },
  { value: 'light', label: '浅色', detail: '明亮、轻盈的阅读环境。', icon: IconName.Sun },
  { value: 'dark', label: '深色', detail: '柔和的深色阅读环境。', icon: IconName.Moon },
]
</script>

<template>
  <div class="settings-page">
    <div class="settings-page-heading"><h1>外观</h1><p>选择适合你的界面主题。此设置只保存在当前设备。</p></div>
    <section class="settings-section" aria-labelledby="settings-theme-heading">
      <div class="settings-section-heading"><h2 id="settings-theme-heading">主题</h2><p>随时可以更改你的偏好。</p></div>
      <div class="settings-theme-options" role="radiogroup" aria-labelledby="settings-theme-heading">
        <label v-for="option in options" :key="option.value" class="settings-theme-option" :class="{ 'settings-theme-option--selected': themePreference === option.value }">
          <input type="radio" name="theme" :value="option.value" :checked="themePreference === option.value" @change="setThemePreference(option.value)" />
          <span class="settings-theme-icon"><EotionIcon :name="option.icon" :size="18" /></span>
          <span class="settings-theme-copy"><strong>{{ option.label }}</strong><small>{{ option.detail }}</small></span>
          <span class="settings-theme-check"><EotionIcon v-if="themePreference === option.value" :name="IconName.Check" :size="16" /></span>
        </label>
      </div>
    </section>
  </div>
</template>
