<script setup lang="ts">
withDefaults(defineProps<{ mobile?: boolean; eager?: boolean; alt?: string }>(), {
  mobile: false, eager: false,
  alt: 'Eotion 真实文档编辑界面，公开演示工作区与示例正文',
})
</script>

<template>
  <div class="product-shot" :class="{ 'mobile-shot': mobile }">
    <picture class="shot-light">
    <source :srcset="`/screenshots/product-${mobile ? 'mobile' : 'desktop'}.webp`" type="image/webp">
    <img :src="`/screenshots/product-${mobile ? 'mobile' : 'desktop'}.png`"
      :alt="alt" :width="mobile ? 390 : 1440" :height="mobile ? 844 : 900"
      :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" decoding="async">
    </picture>
    <picture class="shot-dark">
    <source :srcset="`/screenshots/product-${mobile ? 'mobile' : 'desktop'}-dark.webp`" type="image/webp">
    <img :src="`/screenshots/product-${mobile ? 'mobile' : 'desktop'}-dark.png`"
      :alt="alt" :width="mobile ? 390 : 1440" :height="mobile ? 844 : 900"
      :loading="eager ? 'eager' : 'lazy'" decoding="async">
    </picture>
  </div>
</template>
