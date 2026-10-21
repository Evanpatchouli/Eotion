from pathlib import Path
root = Path('C:/Users/31250/Work/Eotion')
target = Path(__file__).parent
text = (root / 'apps/web/tests/product-database.spec.ts').read_text(encoding='utf-8')
for old, new in [('../src/components/editor/timeline/scale', (root / 'apps/web/src/components/editor/timeline/scale').as_posix()), ('../../../packages/domain/src/scheduling', (root / 'packages/domain/src/scheduling').as_posix()), ('./helpers/editorSelection', (root / 'apps/web/tests/helpers/editorSelection').as_posix())]:
    text = text.replace("from '" + old + "'", "from '" + new + "'")
title='P11.5 coarse touch keeps controls reachable and scrolls the native Timeline surface'
start=text.index("test('"+title)
end=text.index("test('P11.5 coarse touch previews",start)
case=text[start:end].replace('async () => {','async ({}, testInfo) => {',1)
case=case.replace('    const page = await context.newPage()', '''    await context.addInitScript(() => {
      const win = window as any
      const observations: any[] = []
      const read = () => {
        const element = document.querySelector<HTMLElement>('[data-testid="timeline-scroll"]')
        const timeline = document.querySelector('[data-testid="database-timeline"]') as any
        const state = timeline?.__vueParentComponent?.setupState?.viewport?.state?.value
        const rect = element?.getBoundingClientRect()
        const hosts = [...document.querySelectorAll<HTMLElement>('.document-wrap, [class*="pagehost"], [class*="page-host"], [class*="page-content"], [class*="record-content"], [data-testid*="page"]')].map(host => ({ tag: host.tagName, cls: host.className, testId: host.getAttribute('data-testid'), scrollTop: host.scrollTop, rect: host.getBoundingClientRect().toJSON() }))
        return { now: performance.now(), left: element?.scrollLeft, width: element?.clientWidth, scrollWidth: element?.scrollWidth,
          rect: rect?.toJSON(), hosts, activeElement: document.activeElement?.outerHTML?.slice(0, 450),
          state: state ? { left: state.scrollLeft, width: state.width, generation: state.generation, originMs: state.originMs } : null }
      }
      win.__minimalCoarse = { observations, read }
      for (const type of ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel','scroll']) {
        document.addEventListener(type, event => {
          const target = event.target as Element
          observations.push({ type, timestamp: event.timeStamp, prevented: event.defaultPrevented, cancelable: event.cancelable,
            target: target?.getAttribute?.('data-testid') ?? target?.className,
            targetTag: target?.tagName, targetHtml: target?.outerHTML?.slice(0, 650),
            targetScroller: target?.closest?.('[data-testid="timeline-scroll"]')?.getBoundingClientRect().toJSON(), ...read() })
        }, { capture: true, passive: true })
      }
    })
    const page = await context.newPage()''')
needle="const before = await scroller.evaluate(element => ({ left: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth, top: element.getBoundingClientRect().top, height: element.clientHeight, rows: element.querySelectorAll('[data-timeline-row]').length }))"
replacement='''const before = await scroller.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const width = innerWidth
        const x = width - 24
        const y = bounds.top + Math.max(130, element.clientHeight - 28)
        const hit = document.elementFromPoint(x, y)
        const ancestry: any[] = []
        for (let current = hit; current && ancestry.length < 8; current = current.parentElement) {
          const style = getComputedStyle(current)
          ancestry.push({ tag: current.tagName, cls: current.className, testId: current.getAttribute('data-testid'), touchAction: style.touchAction, pointerEvents: style.pointerEvents })
        }
        const before = { left: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth, top: bounds.top, height: element.clientHeight, rect: bounds.toJSON(), rows: element.querySelectorAll('[data-timeline-row]').length }
        ;(window as any).__minimalCoarse.observations.push({ type: 'before', ...before, hit: ancestry, x, y, state: (window as any).__minimalCoarse.read() })
        return before
      })'''
assert needle in case
case=case.replace(needle,replacement)
needle="      await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(before.left)"
case=case.replace(needle,'''      try {
''' + needle + '''
      } finally {
        const evidence = await page.evaluate(() => ({ observations: (window as any).__minimalCoarse.observations, final: (window as any).__minimalCoarse.read() }))
        await testInfo.attach(`minimal-coarse-${width}`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
        await page.screenshot({ path: testInfo.outputPath(`minimal-coarse-${width}-after.png`) })
      }''')
text=text[:start]+case+text[end:]
(target/'product-database.trial.spec.ts').write_text(text,encoding='utf-8')
(target/'playwright.trial.config.ts').write_text("import { defineConfig } from '@playwright/test';\nexport default defineConfig({testDir:'.',testMatch:'*.trial.spec.ts',timeout:30000,workers:1,retries:0,use:{baseURL:'http://127.0.0.1:7173',browserName:'chromium',channel:'chrome'}});\n",encoding='utf-8')
