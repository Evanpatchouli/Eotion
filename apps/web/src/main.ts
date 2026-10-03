import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { applyWebRuntimePreferences } from './webRuntimePreferences'
import { initializeTheme } from './theme'
import './styles/tokens.css'
import './styles/base.css'

applyWebRuntimePreferences()
initializeTheme()
const pinia = createPinia()
createApp(App).use(pinia).use(router).mount('#app')

// Desktop serves bundled assets directly, including under its production HTTPS origin.
if (import.meta.env.PROD && !window.eotionDesktop && window.isSecureContext && /^https?:$/.test(window.location.protocol) && 'serviceWorker' in navigator) {
  const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(serviceWorkerUrl).catch((error: unknown) => {
      console.warn('Unable to cache the Eotion app shell for offline use', error)
    })
  })
}
