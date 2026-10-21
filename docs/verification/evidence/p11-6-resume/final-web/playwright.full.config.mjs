import base from 'file:///C:/Users/31250/Work/Eotion/apps/web/playwright.config.ts'
const webDir = 'C:/Users/31250/Work/Eotion/apps/web'
export default {
  ...base,
  testDir: `${webDir}/tests`,
  use: { ...base.use, screenshot: 'only-on-failure' },
  webServer: { ...base.webServer, cwd: webDir },
  reporter: [['list'], ['json', { outputFile: process.env.EOTION_PLAYWRIGHT_JSON }]],
}
