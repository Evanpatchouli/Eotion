import base from 'file:///C:/Users/31250/Work/Eotion/apps/web/playwright.visual.config.ts'
const webDir = 'C:/Users/31250/Work/Eotion/apps/web'
export default {
  ...base,
  testDir: `${webDir}/tests`,
  globalSetup: 'C:/Users/31250/Work/Eotion/apps/web/tests/helpers/visualEnvironment.ts',
  use: { ...base.use, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { ...base.webServer, cwd: webDir },
  reporter: [['list'], ['json', { outputFile: process.env.EOTION_PLAYWRIGHT_JSON }]],
}
