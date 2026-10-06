import { defineConfig } from 'vitepress'
import { writeFile } from 'node:fs/promises'

const envKeys = [
  'EOTION_SITE_ORIGIN', 'EOTION_APP_ORIGIN',
  'EOTION_DOWNLOAD_WINDOWS_INSTALLER_URL', 'EOTION_DOWNLOAD_WINDOWS_PORTABLE_URL',
  'EOTION_DOWNLOAD_WINDOWS_ZIP_URL', 'EOTION_DOWNLOAD_ANDROID_APK_URL',
  'EOTION_DOWNLOAD_HARMONY_HAP_URL',
] as const
const publicEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]?.trim() ?? '']))
const origin = publicEnv.EOTION_SITE_ORIGIN
if (origin) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('EOTION_SITE_ORIGIN must be a public HTTPS origin without path or credentials')
  }
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'Eotion',
  titleTemplate: ':title · Eotion',
  description: 'Local-first 的文档与知识工作空间，为写作、整理与长期思考而设计。',
  cleanUrls: true,
  srcExclude: ['public/**', 'scripts/**', 'tests/**', '**/README.md'],
  appearance: true,
  lastUpdated: false,
  sitemap: origin ? { hostname: origin } : undefined,
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/eotion-icon.png' }],
    ['meta', { name: 'theme-color', content: '#FAF9F6', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#1C1B1A', media: '(prefers-color-scheme: dark)' }],
    ['meta', { property: 'og:site_name', content: 'Eotion' }],
    ['meta', { property: 'og:locale', content: 'zh_CN' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ...(!origin ? [['meta', { name: 'robots', content: 'noindex, nofollow' }] as [string, Record<string, string>]] : []),
  ],
  transformPageData(page) {
    const path = page.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const canonical = origin ? new URL(`/${path}`, origin).href : null
    const title = page.frontmatter.title ?? page.title
    const description = page.frontmatter.description ?? page.description
    page.frontmatter.head ??= []
    page.frontmatter.head.push(
      ['meta', { property: 'og:title', content: `${title} · Eotion` }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'twitter:title', content: `${title} · Eotion` }],
      ['meta', { name: 'twitter:description', content: description }],
    )
    if (canonical) page.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:image', content: new URL('/screenshots/product-desktop.png', origin).href }],
      ['meta', { name: 'twitter:image', content: new URL('/screenshots/product-desktop.png', origin).href }],
    )
    if (page.relativePath === 'index.md') page.frontmatter.head.push(
      ['link', { rel: 'preload', as: 'image', type: 'image/webp', href: '/screenshots/product-desktop.webp', media: '(prefers-color-scheme: light)' }],
      ['link', { rel: 'preload', as: 'image', type: 'image/webp', href: '/screenshots/product-desktop-dark.webp', media: '(prefers-color-scheme: dark)' }],
    )
  },
  async buildEnd(site) {
    await writeFile(`${site.outDir}/robots.txt`, origin
      ? `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`
      : 'User-agent: *\nDisallow: /\n', 'utf8')
  },
  vite: { define: { __EOTION_SITE_ENV__: JSON.stringify(publicEnv) } },
  themeConfig: {
    logo: '/eotion-icon.png',
    nav: [
      { text: '产品', link: '/', activeMatch: '^/$' },
      { text: '用户指南', link: '/guide/', activeMatch: '^/guide/' },
      { text: '更新日志', link: '/changelog' },
      { text: 'GitHub', link: 'https://github.com/Evanpatchouli/Eotion' },
      { text: '下载', link: '/download' },
    ],
    sidebar: {
      '/guide/': [
        { text: '开始使用', items: [{ text: 'Eotion 用户指南', link: '/guide/' }, { text: '快速开始', link: '/guide/getting-started' }] },
        { text: '基础', items: [{ text: '工作区', link: '/guide/workspaces' }, { text: '页面', link: '/guide/pages' }] },
        { text: '编辑', items: [{ text: '编辑器', link: '/guide/editor' }, { text: '图片与文件', link: '/guide/attachments' }] },
        { text: '数据', items: [{ text: '离线与同步', link: '/guide/sync-offline' }] },
        { text: '设置', items: [{ text: '设置与偏好', link: '/guide/settings' }] },
        { text: 'AI 与 MCP', items: [{ text: 'MCP', link: '/guide/mcp' }] },
      ],
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    sidebarMenuLabel: '目录', returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '外观', lightModeSwitchTitle: '切换浅色', darkModeSwitchTitle: '切换深色',
    skipToContentLabel: '跳到正文',
    search: {
      provider: 'local',
      options: { locales: { root: { translations: {
        button: { buttonText: '搜索', buttonAriaLabel: '搜索用户指南' },
        modal: { noResultsText: '没有找到相关内容', resetButtonTitle: '清除搜索',
          footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
      } } } },
    },
    footer: { message: '为写作、整理与长期思考而设计。', copyright: '© 2026 Eotion' },
  },
})
