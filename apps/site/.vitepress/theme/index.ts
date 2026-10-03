import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import SiteHome from './components/SiteHome.vue'
import SiteDownload from './components/SiteDownload.vue'
import ReleaseNotes from './components/ReleaseNotes.vue'
import AppearanceSelect from './components/AppearanceSelect.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-after': () => h(AppearanceSelect),
  }),
  enhanceApp({ app }) {
    app.component('SiteHome', SiteHome)
    app.component('SiteDownload', SiteDownload)
    app.component('ReleaseNotes', ReleaseNotes)
  },
} satisfies Theme
