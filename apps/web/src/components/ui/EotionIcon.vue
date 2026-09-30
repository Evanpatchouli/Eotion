<script setup lang="ts">
import { MorphIcon } from 'morphicons/vue'

import { iconNodes, type IconName } from './icons'

withDefaults(defineProps<{
  name: `${IconName}`
  size?: 16 | 18 | 20 | 24
  strokeWidth?: number
  label?: string
}>(), {
  size: 18,
  strokeWidth: 1.75,
})
</script>

<template>
  <MorphIcon
    :icon="iconNodes[name as IconName]"
    :size="size"
    :stroke-width="strokeWidth"
    color="currentColor"
    spring="snappy"
    reduced-motion="user"
    :label="label"
  />
</template>
