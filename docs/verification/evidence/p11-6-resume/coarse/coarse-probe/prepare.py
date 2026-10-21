from pathlib import Path
root = Path('C:/Users/31250/Work/Eotion')
target = Path(__file__).parent
text = (root / 'apps/web/tests/product-database.spec.ts').read_text(encoding='utf-8')
for old, new in [('../src/components/editor/timeline/scale', str(root / 'apps/web/src/components/editor/timeline/scale')), ('../../../packages/domain/src/scheduling', str(root / 'packages/domain/src/scheduling')), ('./helpers/editorSelection', str(root / 'apps/web/tests/helpers/editorSelection'))]:
    text = text.replace("from '" + old + "'", "from '" + new.replace('\\', '/') + "'")
title = 'P11.5 coarse touch keeps controls reachable and scrolls the native Timeline surface'
text = text.replace("test('" + title + "', async () => {", "test('" + title + "', async ({}, testInfo) => {")
start = text.index("test('" + title)
end = text.index("test('P11.5 coarse touch previews", start)
case = text[start:end]
case = case.replace("      const session = await context.newCDPSession(page)", '''      await scroller.evaluate(element => {
        const win = window as any
        const timeline = element.closest('[data-testid="database-timeline"]') as any
        const setup = timeline?.__vueParentComponent?.setupState
        const events: any[] = []
        const snapshots: any[] = []
        const read = (label: string) => {
          const rect = element.getBoundingClientRect()
          const state = setup?.viewport?.state?.value
          const visual = window.visualViewport
          const value = { label, now: performance.now(), left: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth,
            rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            state: state ? { width: state.width, scrollLeft: state.scrollLeft, generation: state.generation, originMs: state.originMs } : null,
            viewport: { width: innerWidth, height: innerHeight, visual: visual ? { width: visual.width, height: visual.height, scale: visual.scale, offsetLeft: visual.offsetLeft, offsetTop: visual.offsetTop } : null } }
          snapshots.push(value)
          return value
        }
        const listener = (event: Event) => events.push({ type: event.type, now: performance.now(), timeStamp: event.timeStamp,
          prevented: event.defaultPrevented, cancelable: event.cancelable, left: element.scrollLeft,
          target: (event.target as Element)?.outerHTML?.slice(0, 350), path: event.composedPath().slice(0, 6).map(item => (item as Element).tagName ?? String(item)) })
        const types = ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel','scroll']
        types.forEach(type => document.addEventListener(type, listener, { capture: true, passive: true }))
        let active = true
        const frame = () => { if (!active) return; read('raf'); requestAnimationFrame(frame) }
        requestAnimationFrame(frame)
        win.__coarseProbe = { events, snapshots, read, stop: () => { active = false; types.forEach(type => document.removeEventListener(type, listener, true)) } }
        read('installed')
      })
      await page.screenshot({ path: testInfo.outputPath(`coarse-${width}-before.png`) })
      const session = await context.newCDPSession(page)''')
case = case.replace("      await session.send('Input.dispatchTouchEvent', { type: 'touchStart'", '''      const hit = await page.evaluate(({ x, endX, y }) => {
        const describe = (x: number) => {
          const element = document.elementFromPoint(x, y)
          const ancestors: any[] = []
          for (let current = element; current && ancestors.length < 8; current = current.parentElement) {
            const style = getComputedStyle(current)
            ancestors.push({ tag: current.tagName, cls: current.className, testId: current.getAttribute('data-testid'), touchAction: style.touchAction, pointerEvents: style.pointerEvents, overflowX: style.overflowX, overflowY: style.overflowY })
          }
          return ancestors
        }
        return { x, endX, y, start: describe(x), end: describe(endX) }
      }, { x: startX, endX, y })
      await testInfo.attach(`coarse-${width}-hit`, { body: JSON.stringify({ before, hit }, null, 2), contentType: 'application/json' })
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart' ''')
case = case.replace("      for (let step = 1;", "      await page.evaluate(() => (window as any).__coarseProbe.read('after-touchStart'))\n      for (let step = 1;")
case = case.replace("      await session.detach()", "      await page.evaluate(() => (window as any).__coarseProbe.read('after-touchEnd'))\n      await session.detach()")
needle = "      await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(before.left)"
case = case.replace(needle, '''      try {
''' + needle + '''
      } finally {
        const observation = await page.evaluate(() => {
          const probe = (window as any).__coarseProbe
          probe.read('poll-final')
          probe.stop()
          return { events: probe.events, snapshots: probe.snapshots }
        })
        await testInfo.attach(`coarse-${width}-observations`, { body: JSON.stringify(observation, null, 2), contentType: 'application/json' })
        await page.screenshot({ path: testInfo.outputPath(`coarse-${width}-after.png`) })
      }''')
text = text[:start] + case + text[end:]
(target / 'product-database.probe.spec.ts').write_text(text, encoding='utf-8')
(target / 'playwright.config.ts').write_text("import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', testMatch: '*.probe.spec.ts', timeout: 30000, workers: 1, retries: 0, use: {baseURL:'http://127.0.0.1:7173', browserName:'chromium', channel:'chrome'}, reporter:[['line'],['json',{outputFile:'results.json'}]], outputDir:'test-results' });\n", encoding='utf-8')
print(target)
