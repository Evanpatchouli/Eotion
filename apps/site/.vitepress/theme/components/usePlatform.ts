import { onMounted, ref } from 'vue'

export function usePlatform() {
  const recommended = ref<'windows' | 'android' | null>(null)
  onMounted(() => {
    const agent = navigator.userAgent
    // Harmony identifiers can overlap Android. Do not claim reliable detection.
    if (/Harmony|OpenHarmony/i.test(agent)) return
    if (/Windows NT/i.test(agent)) recommended.value = 'windows'
    else if (/Android/i.test(agent)) recommended.value = 'android'
  })
  return recommended
}
