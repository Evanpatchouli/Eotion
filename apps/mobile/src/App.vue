<script setup lang="ts">
import { EOTION_WEB_URL } from './config.js'
</script>

<template>
  <view class="mobile-shell">
    <webview
      class="eotion-webview"
      :src="EOTION_WEB_URL"
      :enable-debug="true"
    />
  </view>
</template>
