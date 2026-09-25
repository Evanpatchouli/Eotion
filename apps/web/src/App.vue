<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="app-viewport" :data-route="route.name">
    <RouterView />
  </div>
</template>
