import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { applyWebRuntimePreferences } from './webRuntimePreferences'
import './styles/base.css'

applyWebRuntimePreferences()
const pinia = createPinia()
createApp(App).use(pinia).use(router).mount('#app')
