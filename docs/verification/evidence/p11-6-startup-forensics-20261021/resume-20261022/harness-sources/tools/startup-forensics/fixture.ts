import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { chromium as playwrightChromium, test as base, expect, devices, firefox, request, selectors, webkit } from '../../apps/web/node_modules/@playwright/test/index.js'
import type { Browser, BrowserContext, Locator, Page, Request, Route, TestInfo } from '../../apps/web/node_modules/@playwright/test/index.js'

export type { Locator, Page, Route, TestInfo }
export { expect, devices, firefox, request, selectors, webkit }

const runDir = process.env.FORENSICS_RUN_DIR
if (!runDir) throw new Error('FORENSICS_RUN_DIR must point to the diagnostic evidence directory')
const unpatchedNewContexts = new WeakMap<object, (...args: any[]) => Promise<BrowserContext>>()

const sensitiveKey = /(authorization|cookie|password|passwd|secret|token|credential|session|code)/i
const scrubText = (value: string) => value
  .replace(/((?:password|passwd|secret|token|authorization|cookie)\s*[:=]\s*)([^\s,;]+)/gi, '$1[redacted]')
  .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[redacted]')
const safeUrl = (value: string) => {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) if (sensitiveKey.test(key)) url.searchParams.set(key, '[redacted]')
    return url.toString()
  } catch {
    return scrubText(value)
  }
}
const filePart = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100) || 'test'
const safeOptions = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(safeOptions)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sensitiveKey.test(key) ? '[redacted]' : safeOptions(child)]))
  }
  if (typeof value === 'string') return scrubText(value)
  return value
}

class JsonlRecorder {
  readonly file: string
  private readonly stream
  private bufferProbeStarted = false
  private bufferProbeTask: Promise<void> | undefined

  constructor(directory: string, name: string) {
    mkdirSync(directory, { recursive: true })
    this.file = path.join(directory, `${filePart(name)}.jsonl`)
    this.stream = createWriteStream(this.file, { flags: 'a' })
    this.stream.on('error', (error) => process.stderr.write(`[startup-forensics stream error] ${error.stack ?? error.message}\n`))
  }

  write(event: string, data: Record<string, unknown> = {}) {
    const record = {
      event,
      wallTime: new Date().toISOString(),
      monotonicMs: performance.now(),
      pid: process.pid,
      ...data,
    }
    try {
      if (!this.stream.destroyed && !this.stream.writableEnded) this.stream.write(`${JSON.stringify(record)}\n`)
    } catch (error) {
      process.stderr.write(`[startup-forensics write error] ${error.stack ?? error.message}\n`)
    }
  }

  close() {
    if (this.stream.destroyed || this.stream.writableEnded) return Promise.resolve()
    return new Promise<void>((resolve) => {
      this.stream.end(() => resolve())
      this.stream.once('error', () => resolve())
    })
  }

  triggerBufferProbe(fullUrl: string, probes: () => Promise<void>) {
    if (this.bufferProbeStarted) return
    this.bufferProbeStarted = true
    this.bufferProbeTask = Promise.resolve().then(probes).catch((error) => {
      this.write('diagnostic-actor-error', { actor: 'buffer-probe-coordinator', fullURL: safeUrl(fullUrl), error: scrubText(String(error)) })
    })
  }

  async awaitBufferProbe() {
    await this.bufferProbeTask
  }
}

function errorText(error: unknown) {
  return scrubText(error instanceof Error ? error.stack ?? error.message : String(error))
}

function bounded<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutLabel: string,
  onLate?: (value: T) => void | Promise<void>,
  onLateError?: (error: unknown) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    promise.then((value) => {
      if (settled) {
        if (onLate) {
          void Promise.resolve().then(() => onLate(value)).catch((error) => {
            onLateError?.(error)
          })
        }
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function boundedClose(recorder: JsonlRecorder, actor: string, kind: string, close: () => Promise<void>) {
  try {
    await bounded(Promise.resolve().then(close), 5000, `${actor} ${kind} close`)
  } catch (error) {
    recorder.write('diagnostic-actor-cleanup-error', { actor, resource: kind, error: errorText(error) })
  }
}

async function executeBufferProbe(recorder: JsonlRecorder, actor: string, fullUrl: string, probe: () => Promise<{ status?: number | null; bytes?: number; browserVersion?: string }>) {
  const startedAt = new Date().toISOString()
  recorder.write('buffer-probe-start', { actor, fullURL: safeUrl(fullUrl), startedAt })
  let result: { status?: number | null; bytes?: number; browserVersion?: string } = {}
  let failure: string | undefined
  try { result = await probe() }
  catch (error) { failure = errorText(error) }
  const endedAt = new Date().toISOString()
  recorder.write('buffer-probe-end', {
    actor,
    fullURL: safeUrl(fullUrl),
    startedAt,
    endedAt,
    status: result.status ?? null,
    bytes: result.bytes ?? null,
    browserVersion: result.browserVersion,
    error: failure,
  })
}

function startBufferProbes(context: BrowserContext, recorder: JsonlRecorder, fullUrl: string) {
  recorder.triggerBufferProbe(fullUrl, async () => {
    const nodeFetch = executeBufferProbe(recorder, 'node-fetch', fullUrl, async () => {
      const response = await fetch(fullUrl, { signal: AbortSignal.timeout(5000) })
      const body = await response.arrayBuffer()
      return { status: response.status, bytes: body.byteLength }
    })

    const existingContextPage = executeBufferProbe(recorder, 'existing-browser-new-context', fullUrl, async () => {
      const deadline = Date.now() + 5000
      const remainingMs = () => {
        const remaining = Math.floor(deadline - Date.now())
        if (remaining <= 0) throw new Error('existing-browser-new-context actor deadline exceeded')
        return remaining
      }
      let probeContext: BrowserContext | undefined
      try {
        const browser = context.browser()
        if (!browser) throw new Error('The failed request context has no associated browser')
        const originalNewContext = unpatchedNewContexts.get(browser) ?? browser.newContext.bind(browser)
        const contextTimeout = remainingMs()
        const createContext = originalNewContext()
        probeContext = await bounded(
          createContext,
          contextTimeout,
          'existing browser context creation',
          (lateContext) => boundedClose(recorder, 'existing-browser-new-context', 'late-context', () => lateContext.close()),
          (error) => recorder.write('diagnostic-actor-cleanup-error', { actor: 'existing-browser-new-context', resource: 'late-context', error: errorText(error) }),
        )
        const page = await bounded(probeContext.newPage(), remainingMs(), 'existing browser probe page creation')
        const navigationTimeout = remainingMs()
        const response = await bounded(
          page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout }),
          navigationTimeout,
          'existing browser probe navigation',
        )
        return { status: response?.status() ?? null }
      } finally {
        if (probeContext) await boundedClose(recorder, 'existing-browser-new-context', 'context', () => probeContext!.close())
      }
    })

    const independentChrome = executeBufferProbe(recorder, 'independent-chrome-launch', fullUrl, async () => {
      const deadline = Date.now() + 5000
      const remainingMs = () => {
        const remaining = Math.floor(deadline - Date.now())
        if (remaining <= 0) throw new Error('independent-chrome-launch actor deadline exceeded')
        return remaining
      }
      let browser: Browser | undefined
      let probeContext: BrowserContext | undefined
      try {
        const launchTimeout = Math.min(5000, remainingMs())
        browser = await bounded(
          playwrightChromium.launch({ channel: 'chrome', timeout: launchTimeout }),
          launchTimeout,
          'independent Chrome launch',
          (lateBrowser) => boundedClose(recorder, 'independent-chrome-launch', 'late-browser', () => lateBrowser.close()),
          (error) => recorder.write('diagnostic-actor-cleanup-error', { actor: 'independent-chrome-launch', resource: 'late-browser', error: errorText(error) }),
        )
        const browserVersion = browser.version()
        const contextTimeout = remainingMs()
        probeContext = await bounded(
          browser.newContext(),
          contextTimeout,
          'independent Chrome context creation',
          (lateContext) => boundedClose(recorder, 'independent-chrome-launch', 'late-context', () => lateContext.close()),
          (error) => recorder.write('diagnostic-actor-cleanup-error', { actor: 'independent-chrome-launch', resource: 'late-context', error: errorText(error) }),
        )
        const page = await bounded(probeContext.newPage(), remainingMs(), 'independent Chrome probe page creation')
        const navigationTimeout = remainingMs()
        const response = await bounded(
          page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout }),
          navigationTimeout,
          'independent Chrome probe navigation',
        )
        return { status: response?.status() ?? null, browserVersion }
      } finally {
        if (probeContext) await boundedClose(recorder, 'independent-chrome-launch', 'context', () => probeContext!.close())
        if (browser) await boundedClose(recorder, 'independent-chrome-launch', 'browser', () => browser!.close())
      }
    })

    await Promise.allSettled([nodeFetch, existingContextPage, independentChrome])
  })
}

function installInitObserver(context: BrowserContext, recorder: JsonlRecorder) {
  return context.addInitScript(() => {
    const marker = (name: string, detail: Record<string, unknown> = {}) => {
      console.debug(`FORENSICS:${JSON.stringify({ name, wallTime: new Date().toISOString(), visibility: document.visibilityState, ...detail })}`)
    }
    const seen = new Set<string>()
    const scan = () => {
      const targets = [
        ['html', document.documentElement],
        ['#app', document.querySelector('#app')],
        ['#app-child', document.querySelector('#app')?.firstElementChild],
        ['.product-page-placeholder', document.querySelector('.product-page-placeholder')],
        ['.product-empty', document.querySelector('.product-empty')],
        ['.tiptap', document.querySelector('.tiptap')],
        ['[data-testid]', document.querySelector('[data-testid]')],
      ] as const
      for (const [selector, node] of targets) {
        if (node && !seen.has(selector)) {
          seen.add(selector)
          marker('dom-first-seen', { selector, tagName: node instanceof Element ? node.tagName : undefined })
        }
      }
      const appHasMountedChild = Boolean(document.querySelector('#app')?.firstElementChild)
      const hasPrimaryContent = Boolean(document.querySelector('.tiptap, .product-page-placeholder'))
      if (appHasMountedChild && hasPrimaryContent) {
        observer.disconnect()
        marker('mutation-observer-disconnected', { reason: 'app-child-and-primary-content-seen' })
      }
    }
    marker('document-init')
    document.addEventListener('DOMContentLoaded', () => { marker('dom-content-loaded'); scan() }, { once: true })
    window.addEventListener('load', () => { marker('load'); scan() }, { once: true })
    document.addEventListener('visibilitychange', () => marker('visibility-change'))
    const observer = new MutationObserver(scan)
    // Observe the Document immediately, including the parser creating <html>.
    // Waiting for DOMContentLoaded would miss the initial empty #app interval.
    observer.observe(document, { childList: true, subtree: true })
    scan()
  }).then(() => recorder.write('observer-installed'))
}

function observeContext(context: BrowserContext, testInfo: TestInfo, recorder: JsonlRecorder, contextOptions?: unknown) {
  const contextId = createHash('sha1').update(`${testInfo.testId}:${Math.random()}`).digest('hex').slice(0, 10)
  recorder.write('context-created', {
    contextId,
    options: safeOptions(contextOptions ?? {}),
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
  })
  void installInitObserver(context, recorder).catch((error) => recorder.write('diagnostic-error', { phase: 'addInitScript', error: String(error) }))
  const requestStarts = new WeakMap<Request, number>()
  const pageTasks = new Set<Promise<void>>()
  const pageIndex = new WeakMap<Page, number>()
  let nextPage = 0
  let finalized = false

  const attachPage = (page: Page) => {
    if (pageIndex.has(page)) return
    const index = ++nextPage
    pageIndex.set(page, index)
    recorder.write('page-created', { contextId, pageIndex: index, url: safeUrl(page.url()) })
    page.on('request', (request) => {
      const start = performance.now()
      requestStarts.set(request, start)
      recorder.write('request-start', { contextId, pageIndex: index, url: safeUrl(request.url()), method: request.method(), resourceType: request.resourceType() })
    })
    page.on('response', (response) => {
      const request = response.request()
      recorder.write('response', {
        contextId,
        pageIndex: index,
        url: safeUrl(response.url()),
        method: request.method(),
        status: response.status(),
        startMonotonicMs: requestStarts.get(request),
        endMonotonicMs: performance.now(),
      })
    })
    page.on('requestfinished', (request) => recorder.write('request-end', {
      contextId, pageIndex: index, url: safeUrl(request.url()), method: request.method(),
      startMonotonicMs: requestStarts.get(request), endMonotonicMs: performance.now(),
    }))
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? ''
      recorder.write('request-failed', {
        contextId, pageIndex: index, url: safeUrl(request.url()), method: request.method(),
        startMonotonicMs: requestStarts.get(request), endMonotonicMs: performance.now(), failure: scrubText(failure || 'unknown'), timing: request.timing(), resourceType: request.resourceType(),
      })
      if (failure.includes('ERR_NO_BUFFER_SPACE')) startBufferProbes(context, recorder, request.url())
    })
    page.on('console', (message) => {
      const text = scrubText(message.text())
      if (text.startsWith('FORENSICS:')) {
        try { recorder.write('browser-marker', { contextId, pageIndex: index, marker: JSON.parse(text.slice('FORENSICS:'.length)) }) }
        catch (error) { recorder.write('diagnostic-error', { phase: 'parse-browser-marker', error: String(error), text }) }
      }
      recorder.write('console', { contextId, pageIndex: index, type: message.type(), text })
    })
    page.on('pageerror', (error) => recorder.write('page-error', { contextId, pageIndex: index, error: scrubText(error.stack ?? error.message) }))
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) recorder.write('navigation', { contextId, pageIndex: index, url: safeUrl(frame.url()) })
    })
    page.on('domcontentloaded', () => recorder.write('dom-content-loaded', { contextId, pageIndex: index, url: safeUrl(page.url()) }))
    page.on('load', () => recorder.write('load', { contextId, pageIndex: index, url: safeUrl(page.url()) }))

    const setup = async () => {
      const session = await context.newCDPSession(page)
      page.on('close', () => { void session.detach().catch((error) => recorder.write('diagnostic-error', { phase: 'cdp-detach', error: String(error) })) })
      session.on('Network.requestWillBeSent', (event) => recorder.write('cdp-request', {
        contextId, pageIndex: index, requestId: event.requestId, url: safeUrl(event.request.url), method: event.request.method,
        initiator: event.initiator, timestamp: event.timestamp, cdpWallTime: event.wallTime,
      }))
      session.on('Network.responseReceived', (event) => recorder.write('cdp-response', {
        contextId, pageIndex: index, requestId: event.requestId, url: safeUrl(event.response.url), status: event.response.status,
        mimeType: event.response.mimeType, fromDiskCache: event.response.fromDiskCache, fromServiceWorker: event.response.fromServiceWorker,
      }))
      session.on('Network.loadingFailed', (event) => recorder.write('cdp-loading-failed', {
        contextId, pageIndex: index, requestId: event.requestId, errorText: scrubText(event.errorText), canceled: event.canceled,
        blockedReason: event.blockedReason, corsErrorStatus: event.corsErrorStatus,
      }))
      await session.send('Network.enable')
      await session.send('Page.enable')
      recorder.write('cdp-enabled', { contextId, pageIndex: index })
    }
    const task = setup().catch((error) => recorder.write('diagnostic-error', { phase: 'cdp-setup', contextId, pageIndex: index, error: String(error) }))
    pageTasks.add(task)
  }

  context.on('page', attachPage)
  for (const page of context.pages()) attachPage(page)

  const finalize = async () => {
    if (finalized) return
    finalized = true
    const pages = context.pages()
    recorder.write('context-finalizing', { contextId, pageCount: pages.length })
    await Promise.allSettled([...pageTasks])
    await recorder.awaitBufferProbe()
    for (const page of pages) {
      const index = pageIndex.get(page) ?? -1
      const pageDir = path.join(path.dirname(recorder.file), `${filePart(path.basename(recorder.file, '.jsonl'))}-page-${contextId}-${index}`)
      try {
        mkdirSync(pageDir, { recursive: true })
        const html = await page.evaluate(() => {
          const clone = document.documentElement.cloneNode(true) as HTMLElement
          for (const input of clone.querySelectorAll('input,textarea')) {
            if (input instanceof HTMLInputElement) {
              input.setAttribute('value', input.type === 'file' ? '' : '[redacted]')
            }
            if (input instanceof HTMLTextAreaElement) input.textContent = '[redacted]'
          }
          return clone.outerHTML
        })
        writeFileSync(path.join(pageDir, 'dom.html'), html, 'utf8')
        await page.screenshot({ path: path.join(pageDir, 'screenshot.png'), fullPage: true, animations: 'disabled' })
        recorder.write('page-snapshot-saved', { contextId, pageIndex: index, url: safeUrl(page.url()), htmlPath: path.join(pageDir, 'dom.html') })
      } catch (error) {
        recorder.write('diagnostic-error', { phase: 'page-snapshot', contextId, pageIndex: index, error: String(error) })
      }
    }
    try {
      const cookies = await context.cookies()
      const storage = await context.storageState()
      const safeState = {
        cookies: cookies.map((cookie) => ({ ...cookie, value: '[redacted]' })),
        origins: storage.origins.map((origin) => ({
          origin: safeUrl(origin.origin),
          localStorage: origin.localStorage.map(({ name }) => ({ name, value: '[redacted]' })),
        })),
      }
      writeFileSync(path.join(path.dirname(recorder.file), `${filePart(path.basename(recorder.file, '.jsonl'))}-context-${contextId}-storage-state.json`), `${JSON.stringify(safeState, null, 2)}\n`, 'utf8')
      recorder.write('storage-state-saved', {
        contextId,
        pageUrls: context.pages().map((page) => safeUrl(page.url())),
        cookies: cookies.length,
        origins: storage.origins.length,
        valuesRedacted: true,
      })
    } catch (error) {
      recorder.write('diagnostic-error', { phase: 'storage-state', contextId, error: String(error) })
    }
    recorder.write('context-ended', { contextId, status: testInfo.status, durationMs: testInfo.duration })
  }
  return { finalize }
}

const test = base.extend<{ startupForensics: {
  observe(context: BrowserContext, currentTestInfo: TestInfo, options?: unknown): void
  finalize(): Promise<void>
} }>({
  startupForensics: [async ({ browser }: { browser: any }, use: (value: any) => Promise<void>, testInfo: TestInfo) => {
    const testName = `${path.basename(testInfo.file)}-${testInfo.testId}-${testInfo.title}`
    const recorder = new JsonlRecorder(path.join(runDir!, 'events'), testName)
    recorder.write('test-start', {
      testId: testInfo.testId,
      file: testInfo.file,
      title: testInfo.titlePath,
      workerIndex: testInfo.workerIndex,
      parallelIndex: testInfo.parallelIndex,
      status: testInfo.status,
      startedAt: new Date().toISOString(),
    })

    const observations: Array<{ finalize: () => Promise<void> }> = []
    const seenContexts = new WeakSet<BrowserContext>()
    const api = {
      observe(context: BrowserContext, currentTestInfo: TestInfo, options?: unknown) {
        if (seenContexts.has(context)) return
        seenContexts.add(context)
        observations.push(observeContext(context, currentTestInfo, recorder, options))
      },
      async finalize() {
        await Promise.all(observations.map((observation) => observation.finalize()))
      },
    }
    const browserWithWrappedContext = browser as typeof browser & { newContext: typeof browser.newContext }
    const originalNewContext = browserWithWrappedContext.newContext.bind(browserWithWrappedContext)
    const originalNewContextDescriptor = Object.getOwnPropertyDescriptor(browserWithWrappedContext, 'newContext')
    unpatchedNewContexts.set(browser, originalNewContext)
    browserWithWrappedContext.newContext = async (options) => {
      const context = await originalNewContext(options)
      api.observe(context, testInfo, options)
      return context
    }
    recorder.write('test-ready', { browserName: testInfo.project.use.browserName, channel: testInfo.project.use.channel, browserVersion: browser.version(), workerParentPid: process.ppid, effectiveTrace: testInfo.project.use.trace, baseURL: testInfo.project.use.baseURL })
    try {
      await use(api)
    } finally {
      if (originalNewContextDescriptor) Object.defineProperty(browserWithWrappedContext, 'newContext', originalNewContextDescriptor)
      else Reflect.deleteProperty(browserWithWrappedContext, 'newContext')
      unpatchedNewContexts.delete(browser)
      await api.finalize()
      await recorder.awaitBufferProbe()
      recorder.write('test-end', { status: testInfo.status, expectedStatus: testInfo.expectedStatus, durationMs: testInfo.duration })
      await recorder.close()
    }
  }, { auto: true }],
  context: async ({ context: originalContext, startupForensics }: { context: BrowserContext; startupForensics: any }, use: (context: BrowserContext) => Promise<void>, testInfo: TestInfo) => {
    startupForensics.observe(originalContext, testInfo, testInfo.project.use)
    await use(originalContext)
    await startupForensics.finalize()
  },
  page: async ({ page, startupForensics }: { page: Page; startupForensics: any }, use: (page: Page) => Promise<void>) => {
    await use(page)
    await startupForensics.finalize()
  },
})

export { test }

export const chromium = new Proxy(playwrightChromium, {
  get(target, property, receiver) {
    if (property === 'launchPersistentContext') {
      return async (profile: string, options: Parameters<typeof target.launchPersistentContext>[1]) => {
        const mappedOptions = process.env.FORENSICS_BASE_URL && options?.baseURL === 'http://127.0.0.1:7173'
          ? { ...options, baseURL: process.env.FORENSICS_BASE_URL }
          : options
        const context = await target.launchPersistentContext(profile, mappedOptions)
        const logger = new JsonlRecorder(path.join(runDir!, 'events'), `manual-persistent-${Date.now()}`)
        logger.write('persistent-launch', { profile, originalBaseURL: options?.baseURL, effectiveBaseURL: mappedOptions?.baseURL, options: safeOptions(mappedOptions) })
        const observation = observeContext(context, { testId: 'manual-persistent', workerIndex: -1, parallelIndex: -1 } as TestInfo, logger, mappedOptions)
        const originalClose = context.close.bind(context)
        context.close = async (...closeArgs) => {
          await observation.finalize()
          await logger.close()
          return originalClose(...closeArgs)
        }
        return context
      }
    }
    if (property === 'launch') {
      return async (...args: Parameters<typeof target.launch>) => {
        const browser = await target.launch(...args)
        const originalNewContext = browser.newContext.bind(browser)
        browser.newContext = async (options) => {
          const context = await originalNewContext(options)
          const logger = new JsonlRecorder(path.join(runDir!, 'events'), `manual-${Date.now()}`)
          const observation = observeContext(context, { testId: 'manual', workerIndex: -1, parallelIndex: -1 } as TestInfo, logger, options)
          const originalClose = context.close.bind(context)
          context.close = async (...closeArgs) => {
            await observation.finalize()
            await logger.close()
            return originalClose(...closeArgs)
          }
          return context
        }
        return browser
      }
    }
    return Reflect.get(target, property, receiver)
  },
})
