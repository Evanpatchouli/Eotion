import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, constants } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip, gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mainEvidenceRoot = path.join(repositoryRoot, 'docs/verification/evidence/p11-6-startup-forensics-20261021')
const group = process.env.FORENSICS_GROUP
if (group && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(group)) throw new Error(`Unsafe FORENSICS_GROUP: ${group}`)
const evidenceRoot = group ? path.join(mainEvidenceRoot, group) : mainEvidenceRoot
const manifestOnly = process.argv.includes('--manifest-only')
const TARGET = /(universal.*coarse.*tablet|a second client pulls sequential changes.*remote deletion|Timeline shell keeps local zoom)/i
const RUNTIME_PATH = /(webRuntimePreferences|main\.ts|theme\.ts|router\.ts|App\.vue|(^|\/)index\.html$|^\/$|@vite\/client)/i

function effectiveTrace(run, events) {
  const observed = events.find((event) => event.event === 'test-ready' && typeof event.effectiveTrace === 'string')?.effectiveTrace
  if (observed) return observed
  if (/^b-prefix-05$/i.test(run.id)) return 'retain-on-failure'
  if (/^a-/i.test(run.id) || /^c(?:-)?(?:05|12)(?:-|$)/i.test(run.id)) return 'on'
  if (/^b-(?:actual-prefix07|r1-actual-prefix13)(?:-|$)/i.test(run.id)) return 'on'
  return 'not-recorded'
}

const slash = (value) => value.split(path.sep).join('/')
const jsonlRecords = async (file) => {
  try {
    const text = await readFile(file, 'utf8')
    return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line) }
      catch (error) { return { _parseError: String(error), _line: index + 1, _raw: line } }
    })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      try {
        const compressed = await readFile(`${file}.gz`)
        const text = gunzipSync(compressed).toString('utf8')
        return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
          try { return JSON.parse(line) }
          catch (parseError) { return { _parseError: String(parseError), _line: index + 1, _raw: line } }
        })
      } catch (compressedError) {
        if (compressedError?.code === 'ENOENT') return []
        throw compressedError
      }
    }
    throw error
  }
}

async function walk(directory, relative = '') {
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) }
  catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(directory, entry.name)
    const rel = path.join(relative, entry.name)
    if (entry.isDirectory()) files.push(...await walk(abs, rel))
    else if (entry.isFile()) files.push({ abs, relative: slash(rel) })
  }
  return files
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function inventory(directory, label) {
  const files = await walk(directory)
  const entries = []
  for (const file of files) {
    const metadata = await stat(file.abs)
    entries.push({ path: `${label}/${file.relative}`, bytes: metadata.size, sha256: await sha256(file.abs) })
  }
  return entries
}

async function copyIntoArtifacts(runRaw, runEvidence, source, reason, copied) {
  if (!source) return
  const absolute = path.resolve(source)
  if (copied.some((entry) => entry.source === absolute)) return
  let sourceStat
  try { sourceStat = await stat(absolute) }
  catch { return }
  let relative = path.relative(runRaw, absolute)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) relative = path.join('external', path.basename(absolute))
  const originalRelativePath = slash(relative)
  const sourceSha256 = await sha256(absolute)
  const digest = createHash('sha1').update(originalRelativePath).digest('hex').slice(0, 12)
  const basename = path.basename(absolute).toLowerCase()
  const shortNames = new Map([
    ['trace.zip', 'trace.zip'],
    ['dom.html', 'dom.html'],
    ['screenshot.png', 'screenshot.png'],
    ['error-context.md', 'error-context.md'],
    ['test-failed-1.png', 'test-failed-1.png'],
    ['storage-state.json', 'storage-state.json'],
  ])
  const shortName = basename.endsWith('.jsonl') ? 'events.jsonl'
    : [...shortNames].find(([suffix]) => basename.endsWith(suffix))?.[1]
      ?? `artifact${path.extname(basename).slice(0, 16)}`
  const targetRelative = path.join('artifacts', digest, shortName)
  const target = path.join(runEvidence, targetRelative)
  await mkdir(path.dirname(target), { recursive: true })
  try {
    await copyFile(absolute, target, constants.COPYFILE_EXCL)
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const existingStat = await stat(target)
    const existingSha256 = await sha256(target)
    if (existingStat.size !== sourceStat.size || existingSha256 !== sourceSha256) {
      throw new Error(`Artifact short-path hash collision at ${target}; refusing to overwrite`)
    }
  }
  copied.push({
    reason,
    source: absolute,
    originalRelativePath,
    originalSha256: sourceSha256,
    originalBytes: sourceStat.size,
    archived: slash(path.relative(runEvidence, target)),
  })
}

function flattenResults(results) {
  const found = []
  const visit = (suite, parents = []) => {
    const nextParents = suite.title ? [...parents, suite.title] : parents
    for (const spec of suite.specs ?? []) {
      const suiteTitles = [...nextParents, spec.title].filter(Boolean)
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          found.push({
            title: suiteTitles.join(' › '),
            titleParts: suiteTitles,
            file: spec.file ?? suite.file,
            actualStatus: result.status,
            expectedStatus: test.expectedStatus,
            resultStatus: test.status,
            workerIndex: result.workerIndex,
            parallelIndex: result.parallelIndex,
            durationMs: result.duration,
            startTime: result.startTime,
            retry: result.retry,
            errors: result.errors ?? [],
            attachments: result.attachments ?? [],
            id: spec.id,
            target: TARGET.test(suiteTitles.join(' ')),
          })
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child, nextParents)
  }
  for (const suite of results.suites ?? []) visit(suite)
  return found
}

function resolveSpecOrder(run) {
  const args = run.args ?? []
  const afterTest = args.indexOf('test')
  const candidates = args.slice(afterTest >= 0 ? afterTest + 1 : 0)
  return candidates.filter((arg) => /(?:^|[\\/])tests[\\/]forensics--[^\\/]+\.spec\.ts$/i.test(arg))
    .map((arg) => path.basename(arg).replace(/^forensics--/, ''))
}

async function appendEventsGzip(runRows) {
  const output = path.join(evidenceRoot, 'events.jsonl.gz')
  await mkdir(evidenceRoot, { recursive: true })
  const gzip = createGzip({ level: 6 })
  const outputStream = createWriteStream(output)
  const writeLine = (record) => new Promise((resolve, reject) => {
    const line = `${JSON.stringify(record)}\n`
    gzip.write(line, (error) => error ? reject(error) : resolve())
  })
  const task = pipeline(gzip, outputStream)
  for (const run of runRows) {
    const eventDir = path.join(run.raw, 'events')
    const files = (await walk(eventDir)).filter((file) => file.relative.endsWith('.jsonl'))
    for (const file of files) {
      await writeLine({ recordType: 'source-boundary', runId: run.id, sourceFile: `${run.id}/events/${file.relative}` })
      const content = await readFile(file.abs, 'utf8')
      for (const line of content.split(/\r?\n/)) if (line) await writeLine({ recordType: 'source-event', runId: run.id, sourceFile: `${run.id}/events/${file.relative}`, rawLine: line })
    }
  }
  gzip.end()
  await task
}

function summarizeStartup(run, tests, events, viteEvents) {
  const eventCounts = (name) => events.filter((event) => event.event === name).length
  const requestFailures = events.filter((event) => ['request-failed', 'cdp-loading-failed'].includes(event.event))
  const pageErrors = events.filter((event) => event.event === 'page-error')
  const consoleErrors = events.filter((event) => event.event === 'console' && ['error', 'assert'].includes(event.type))
  const diagnosticErrors = events.filter((event) => event.event === 'diagnostic-error' || event._parseError)
  const rawConsoleEvents = events.filter((event) => event.event === 'console')
  const rawNetworkErrorEvents = events.filter((event) => ['request-failed', 'cdp-loading-failed'].includes(event.event)
    || (['response', 'cdp-response'].includes(event.event) && Number(event.status) >= 400))
  const browserMarkers = events.filter((event) => event.event === 'browser-marker')
  const targetSourceFiles = new Set(events.filter((event) => {
    const title = Array.isArray(event.title) ? event.title.join(' ') : String(event.title ?? '')
    return event.event === 'test-start' && TARGET.test(title)
  }).map((event) => event._sourceFile))
  const targetEvents = events.filter((event) => targetSourceFiles.has(event._sourceFile)
    && (event.event === 'browser-marker' || event.event === 'navigation' || event.event === 'dom-content-loaded'
      || event.event === 'load' || event.event === 'request-start' || event.event === 'request-end'
      || event.event === 'response' || event.event === 'request-failed' || event.event === 'cdp-request'
      || event.event === 'cdp-response' || event.event === 'cdp-loading-failed' || event.event === 'page-error'
      || event.event === 'diagnostic-error'))
  const targetNetworkEvents = targetEvents.filter((event) => /^(request-start|request-end|response|request-failed|cdp-request|cdp-response|cdp-loading-failed)$/.test(event.event))
  const runtimeEvents = viteEvents.filter((event) => RUNTIME_PATH.test(`${event.url ?? ''} ${event.id ?? ''}`))
  const startupMarkerNames = new Set(['dom-first-seen', 'dom-content-loaded', 'load', 'document-init', 'mutation-observer-disconnected'])
  const startupDomSelectors = new Set(['html', '#app', '#app-child', '.product-page-placeholder', '.tiptap', '[data-testid]'])
  const appUrlEvents = events.filter((event) => {
    if (['navigation', 'dom-content-loaded', 'load'].includes(event.event)) return true
    if (event.event === 'browser-marker') {
      return startupMarkerNames.has(event.marker?.name)
        && (!event.marker?.selector || startupDomSelectors.has(event.marker.selector))
    }
    return typeof event.url === 'string' && RUNTIME_PATH.test(event.url)
  })
  return {
    runId: run.id,
    observedBrowserVersions: [...new Set(events.filter((event) => event.event === 'test-ready').map((event) => event.browserVersion).filter(Boolean))],
    bufferProbes: events.filter((event) => /^buffer-probe-|^diagnostic-actor-/.test(event.event ?? '')),
    traceRequested: run.trace ?? null,
    traceEffective: effectiveTrace(run, events),
    testCount: tests.length,
    targetTests: tests.filter((test) => test.target).map(({ title, file, actualStatus, workerIndex, durationMs }) => ({ title, file, actualStatus, workerIndex, durationMs })),
    counts: {
      requestFailed: requestFailures.length,
      pageError: pageErrors.length,
      consoleError: consoleErrors.length,
      diagnosticError: diagnosticErrors.length,
      navigation: eventCounts('navigation'),
      response: eventCounts('response'),
      browserMarker: browserMarkers.length,
    },
    requestFailures,
    pageErrors,
    consoleErrors,
    rawConsoleEvents,
    rawNetworkErrorEvents,
    diagnosticErrors,
    browserMarkers,
    targetNetworkEvents,
    targetEvents,
    runtimeModuleEvents: runtimeEvents,
    appUrlAndNavigationEvents: appUrlEvents,
  }
}

function processIdentity(process) {
  const birth = typeof process?.creationDate === 'string' ? process.creationDate : ''
  const birthMs = Date.parse(birth)
  if (!Number.isInteger(Number(process?.pid)) || !Number.isFinite(birthMs)) return null
  return { pid:Number(process.pid), birthMs, birth, key:`${Number(process.pid)}@${birth}` }
}

function validateProcessLineage(samples, rootPid) {
  const rootRows = samples.flatMap((sample) => (sample.processes ?? [])
    .filter((process) => Number(process.pid) === Number(rootPid))
    .map((process) => ({ sampleTime:sample.time, process, identity:processIdentity(process) })))
    .filter((row) => row.identity)
    .sort((a, b) => Date.parse(a.sampleTime) - Date.parse(b.sampleTime))
  const root = rootRows[0]
  const valid = new Map()
  const excludedCounts = new Map()
  const excludedFirst = []
  const excludedLast = []
  const firstLimit = 100
  let excludedObservationCount = 0
  let validatedObservationCount = 0

  const recordExcluded = (sample, process, reason) => {
    excludedObservationCount += 1
    excludedCounts.set(reason, (excludedCounts.get(reason) ?? 0) + 1)
    const row = {
      sampleTime:sample.time,
      pid:process?.pid ?? null,
      birth:process?.creationDate ?? null,
      name:process?.name ?? null,
      parentPid:process?.parentPid ?? null,
      reason,
    }
    if (excludedFirst.length < firstLimit) excludedFirst.push(row)
    excludedLast.push(row)
    if (excludedLast.length > firstLimit) excludedLast.shift()
  }

  const recordValid = (sample, process, identity, parentIdentity, isRoot = false) => {
    const prior = valid.get(identity.key)
    if (prior) {
      prior.lastObserved = sample.time
      prior.observations += 1
    } else {
      valid.set(identity.key, {
        pid:identity.pid,
        birth:identity.birth,
        parentPid:isRoot ? null : Number(process.parentPid),
        parentBirth:isRoot ? null : parentIdentity?.birth ?? null,
        name:process.name ?? null,
        firstObserved:sample.time,
        lastObserved:sample.time,
        observations:1,
        isRoot,
      })
    }
    validatedObservationCount += 1
  }

  const validatedSamples = []
  for (const sample of samples) {
    const rows = (sample.processes ?? []).map((process) => ({ process, identity:processIdentity(process) }))
    const accepted = []
    const unresolved = []
    const rootSample = rows.find((row) => row.identity?.key === root?.identity.key)
    if (rootSample) {
      recordValid(sample, rootSample.process, rootSample.identity, null, true)
      accepted.push(rootSample.process)
    }

    for (const row of rows) {
      if (!row.identity) {
        recordExcluded(sample, row.process, 'unknown-process-birth')
        continue
      }
      if (root && row.identity.birthMs < root.identity.birthMs) {
        recordExcluded(sample, row.process, 'process-born-before-root')
        continue
      }
      if (Number(row.process.pid) === Number(rootPid) && row.identity.key !== root?.identity.key) {
        recordExcluded(sample, row.process, 'root-pid-birth-mismatch')
        continue
      }
      if (row.identity.key === root?.identity.key) continue
      if (valid.has(row.identity.key)) {
        recordValid(sample, row.process, row.identity, null, false)
        accepted.push(row.process)
        continue
      }
      unresolved.push(row)
    }

    let progress = true
    while (progress && unresolved.length) {
      progress = false
      for (let index = unresolved.length - 1; index >= 0; index -= 1) {
        const row = unresolved[index]
        const parentPid = Number(row.process.parentPid)
        const possibleParents = rows
          .filter((candidate) => candidate.identity && candidate.identity.pid === parentPid
            && candidate.identity.birthMs <= row.identity.birthMs && valid.has(candidate.identity.key))
          .sort((a, b) => b.identity.birthMs - a.identity.birthMs)
        const parent = possibleParents[0]
        if (!parent) continue
        recordValid(sample, row.process, row.identity, parent.identity)
        accepted.push(row.process)
        unresolved.splice(index, 1)
        progress = true
      }
    }

    for (const row of unresolved) {
      const parentPid = Number(row.process.parentPid)
      const samePidParent = rows.filter((candidate) => candidate.identity?.pid === parentPid)
      const reason = samePidParent.some((candidate) => candidate.identity.birthMs > row.identity.birthMs)
        ? 'parent-born-after-child'
        : 'unverified-parent-not-present-in-sample'
      recordExcluded(sample, row.process, reason)
    }

    validatedSamples.push({
      ...sample,
      lineageValidatedProcesses:accepted,
      lineageExcludedObservationCount:rows.length - accepted.length,
    })
  }

  return {
    samples:validatedSamples,
    audit:{
      algorithm:'Root and previously validated child identities persist by PID+birth. New identities are admitted only when a validated parent identity with the matching PID is present in the same sample and child birth is not earlier than parent birth.',
      rootIdentity:root ? { pid:root.identity.pid, birth:root.identity.birth, firstObserved:root.sampleTime } : null,
      validatedObservationCount,
      validatedIdentityCount:valid.size,
      validatedIdentities:[...valid.values()],
      excludedProcessObservations:{
        count:excludedObservationCount,
        byReason:Object.fromEntries(excludedCounts),
        first:excludedFirst,
        last:excludedLast,
        retainedSampleLimit:firstLimit,
      },
      rawProcessObservationsPreserved:true,
    },
  }
}

function processTree(sample) {
  return sample.lineageValidatedProcesses ?? []
}

const TCP_STATES = { 1: 'CLOSED', 2: 'LISTEN', 3: 'SYN-SENT', 4: 'SYN-RECEIVED', 5: 'ESTABLISHED', 6: 'FIN-WAIT-1', 7: 'FIN-WAIT-2', 8: 'CLOSE-WAIT', 9: 'CLOSING', 10: 'LAST-ACK', 11: 'TIME-WAIT', 12: 'DELETE-TCB' }
function tcpStateCounts(sample) {
  const counts = {}
  for (const connection of sample.tcp ?? []) {
    const state = TCP_STATES[connection.State] ?? String(connection.State ?? 'unknown')
    counts[state] = (counts[state] ?? 0) + 1
  }
  return counts
}

function isObservationError(record) {
  return Boolean(record?._parseError || record?.observationError || record?.kind === 'observationError'
    || record?.event === 'observationError' || record?.event === 'observation-error'
    || (record?.error && !Array.isArray(record?.processes)))
}

function resourceMetric(sample, rootPid) {
  const owned = processTree(sample, rootPid)
  const observedPids = new Set(owned.map((process) => Number(process.pid)))
  const orphanedKnownProcesses = owned.filter((process) => Number(process.pid) !== Number(rootPid)
    && !observedPids.has(Number(process.parentPid)))
  const sum = (predicate, key) => owned.filter(predicate).reduce((total, process) => total + Number(process[key] ?? 0), 0)
  const byName = (name) => (process) => String(process.name ?? '').toLowerCase() === name
  return {
    time: sample.time,
    freePhysicalBytes: Number(sample.freePhysicalBytes ?? 0),
    ownedProcessCount: owned.length,
    orphanCount: orphanedKnownProcesses.length,
    orphanedKnownProcesses,
    totalPrivateBytes: sum(() => true, 'privateBytes'),
    totalHandles: sum(() => true, 'handles'),
    totalThreads: sum(() => true, 'threads'),
    chromeCount: owned.filter((process) => /^(chrome|chromium)(\.exe)?$/i.test(process.name ?? '')).length,
    chromePrivateBytes: sum((process) => /^(chrome|chromium)(\.exe)?$/i.test(process.name ?? ''), 'privateBytes'),
    nodeCount: owned.filter(byName('node.exe')).length,
    nodePrivateBytes: sum(byName('node.exe'), 'privateBytes'),
    totalWorkingSetBytes: sum(() => true, 'workingSet'),
    viteCount: owned.filter((process) => /vite-service\.mjs/i.test(process.commandLine ?? '')).length,
    vitePrivateBytes: sum((process) => /vite-service\.mjs/i.test(process.commandLine ?? ''), 'privateBytes'),
    tcpStateCounts: tcpStateCounts(sample),
    ownedProcesses: owned,
  }
}

function summarizeResourceWindow(samples, rootPid, start, end) {
  const selected = samples.filter((sample) => {
    const time = Date.parse(sample.time)
    return Number.isFinite(time) && time >= Date.parse(start) && time <= Date.parse(end)
  })
  if (selected.length === 0) return { sampleCount: 0, start, end, note: 'No resource samples fell inside this run window.' }
  const metrics = selected.map((sample) => resourceMetric(sample, rootPid))
  const first = metrics[0]
  const last = metrics.at(-1)
  const minFree = metrics.reduce((min, metric) => Math.min(min, metric.freePhysicalBytes), Number.POSITIVE_INFINITY)
  const maxTotalPrivate = metrics.reduce((max, metric) => Math.max(max, metric.totalPrivateBytes), 0)
  const firstSeen = new Map()
  const lastSeen = new Map()
  const peaks = new Map()
  for (const metric of metrics) {
    for (const process of metric.ownedProcesses) {
      const pid = Number(process.pid)
      const birth = process.creationDate ?? 'birth-unknown'
      const identity = `${pid}@${birth}`
      if (!firstSeen.has(identity)) firstSeen.set(identity, process)
      lastSeen.set(identity, process)
      const currentPeak = peaks.get(identity) ?? { privateBytes: 0, workingSet: 0, handles: 0, threads: 0 }
      currentPeak.privateBytes = Math.max(currentPeak.privateBytes, Number(process.privateBytes ?? 0))
      currentPeak.workingSet = Math.max(currentPeak.workingSet, Number(process.workingSet ?? 0))
      currentPeak.handles = Math.max(currentPeak.handles, Number(process.handles ?? 0))
      currentPeak.threads = Math.max(currentPeak.threads, Number(process.threads ?? 0))
      peaks.set(identity, currentPeak)
    }
  }
  const perPid = [...firstSeen.entries()].map(([identity, initial]) => {
    const final = lastSeen.get(identity)
    return {
      pid: Number(initial.pid),
      name: initial.name,
      parentPid: initial.parentPid,
      birth: initial.creationDate,
      firstObserved: initial,
      lastObserved: final,
      peak: peaks.get(identity),
      delta: {
        privateBytes: Number(final?.privateBytes ?? 0) - Number(initial.privateBytes ?? 0),
        workingSetBytes: Number(final?.workingSet ?? 0) - Number(initial.workingSet ?? 0),
        handles: Number(final?.handles ?? 0) - Number(initial.handles ?? 0),
        threads: Number(final?.threads ?? 0) - Number(initial.threads ?? 0),
      },
    }
  })
  const tcpStates = new Set(metrics.flatMap((metric) => Object.keys(metric.tcpStateCounts)))
  const tcpCounts = Object.fromEntries([...tcpStates].map((state) => [state, {
    first: first.tcpStateCounts[state] ?? 0,
    last: last.tcpStateCounts[state] ?? 0,
    peak: Math.max(...metrics.map((metric) => metric.tcpStateCounts[state] ?? 0)),
  }]))
  return {
    sampleCount: selected.length,
    start,
    end,
    first: { ...first, ownedProcesses: undefined },
    last: { ...last, ownedProcesses: undefined },
    delta: {
      freePhysicalBytes: last.freePhysicalBytes - first.freePhysicalBytes,
      totalPrivateBytes: last.totalPrivateBytes - first.totalPrivateBytes,
      totalWorkingSetBytes: last.totalWorkingSetBytes - first.totalWorkingSetBytes,
      totalHandles: last.totalHandles - first.totalHandles,
      totalThreads: last.totalThreads - first.totalThreads,
      orphanCount: last.orphanCount - first.orphanCount,
      chromeCount: last.chromeCount - first.chromeCount,
      chromePrivateBytes: last.chromePrivateBytes - first.chromePrivateBytes,
      nodePrivateBytes: last.nodePrivateBytes - first.nodePrivateBytes,
      vitePrivateBytes: last.vitePrivateBytes - first.vitePrivateBytes,
    },
    minFreePhysicalBytes: minFree,
    maxOwnedTotalPrivateBytes: maxTotalPrivate,
    maxOwnedWorkingSetBytes: metrics.reduce((max, metric) => Math.max(max, metric.totalWorkingSetBytes), 0),
    maxOrphanCount: metrics.reduce((max, metric) => Math.max(max, metric.orphanCount), 0),
    lastOrphanCount: last.orphanCount,
    tcpStateCounts: tcpCounts,
    processesByPid: perPid,
  }
}

async function buildRun(evidence, rawRoot, rawRun, run, resourceSamples, rootPid, viteEvents) {
  const id = run.id
  const runEvidence = path.join(evidence, id)
  const runRaw = run.raw ?? path.join(rawRoot, id)
  await mkdir(runEvidence, { recursive: true })
  const resultsFile = path.join(runRaw, 'results.json')
  const orderFile = path.join(runRaw, 'test-order.jsonl')
  const results = JSON.parse(await readFile(resultsFile, 'utf8'))
  const order = await jsonlRecords(orderFile)
  await copyFile(resultsFile, path.join(runEvidence, 'results.json'))
  await copyFile(orderFile, path.join(runEvidence, 'test-order.jsonl'))

  const tests = flattenResults(results)
  const failedTests = tests.filter((test) => !['passed', 'skipped'].includes(test.actualStatus))
  const archived = []
  for (const test of tests) {
    if (!failedTests.includes(test) && !test.target) continue
    for (const attachment of test.attachments) {
      await copyIntoArtifacts(runRaw, runEvidence, attachment.path, `${failedTests.includes(test) ? 'failed-test' : 'target-test'}:${test.title}:${attachment.name}`, archived)
      if (failedTests.includes(test) && attachment.path) {
        // Playwright versions can expose error-context.md beside the trace
        // without listing it as a regular attachment in the JSON reporter.
        for (const sibling of await walk(path.dirname(attachment.path))) {
          await copyIntoArtifacts(runRaw, runEvidence, sibling.abs, `failed-test:complete-output-directory:${test.title}`, archived)
        }
      }
    }
  }

  const eventDir = path.join(runRaw, 'events')
  const eventFiles = (await walk(eventDir)).filter((file) => file.relative.endsWith('.jsonl'))
  const events = []
  const retainedEventFiles = new Map()
  const failedIds = new Set(failedTests.map((test) => test.id).filter(Boolean))
  for (const file of eventFiles) {
    const records = await jsonlRecords(file.abs)
    const startRecord = records.find((record) => record.event === 'test-start')
    const endRecord = records.findLast((record) => record.event === 'test-end')
    const title = Array.isArray(startRecord?.title) ? startRecord.title.join(' ') : String(startRecord?.title ?? '')
    const isTarget = TARGET.test(title)
    const isFailed = failedIds.has(startRecord?.testId)
      || ['failed', 'timedOut', 'interrupted'].includes(endRecord?.status)
      || failedTests.some((test) => title && (title.endsWith(test.title) || test.title.endsWith(title)))
    if (isTarget || isFailed) retainedEventFiles.set(file.abs, isTarget && isFailed ? 'target-and-failed' : isTarget ? 'target-test' : 'failed-test')
    events.push(...records.map((record) => ({ ...record, _sourceFile: file.relative })))
  }
  for (const [eventFile, reason] of retainedEventFiles) {
    const basename = path.basename(eventFile, '.jsonl')
    const eventDirectory = path.dirname(eventFile)
    await copyIntoArtifacts(runRaw, runEvidence, eventFile, `${reason}:event-jsonl`, archived)
    const pagePrefix = `${basename}-page-`
    for (const entry of await readdir(eventDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(pagePrefix)) continue
      const pageDirectory = path.join(eventDirectory, entry.name)
      for (const file of await walk(pageDirectory)) await copyIntoArtifacts(runRaw, runEvidence, file.abs, `${reason}:context-artifact`, archived)
    }
    for (const entry of await readdir(eventDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (entry.name === `${basename}-storage-state.json`
        || (entry.name.startsWith(`${basename}-context-`) && entry.name.endsWith('-storage-state.json'))) {
        await copyIntoArtifacts(runRaw, runEvidence, path.join(eventDirectory, entry.name), `${reason}:storage-state`, archived)
      }
    }
  }

  const runStart = run.started ?? results.stats?.startTime
  const runEnd = run.ended ?? new Date(Date.parse(runStart) + Number(results.stats?.duration ?? 0)).toISOString()
  const scopedVite = viteEvents.filter((event) => {
    const timestamp = Date.parse(event.time ?? event.timestamp)
    return Number.isFinite(timestamp) && timestamp >= Date.parse(runStart) && timestamp <= Date.parse(runEnd)
  })
  const orderedFiles = (results.suites ?? []).map((suite) => suite.file).filter(Boolean)
  const summary = {
    id,
    started: runStart,
    ended: runEnd,
    durationMs: Number(results.stats?.duration ?? 0),
    processExitCode: run.code,
    traceRequested: run.trace ?? null,
    traceEffective: effectiveTrace(run, events),
    specOrder: resolveSpecOrder(run),
    actualSpecOrder: orderedFiles,
    counts: {
      expected: Number(results.stats?.expected ?? tests.filter((test) => test.actualStatus === 'passed').length),
      unexpected: Number(results.stats?.unexpected ?? failedTests.length),
      skipped: Number(results.stats?.skipped ?? tests.filter((test) => test.actualStatus === 'skipped').length),
      flaky: Number(results.stats?.flaky ?? tests.filter((test) => test.resultStatus === 'flaky').length),
      total: tests.length,
    },
    workerIndexes: [...new Set(tests.map((test) => test.workerIndex).filter(Number.isInteger))].sort((a, b) => a - b),
    failedTests: failedTests.map(({ title, file, actualStatus, expectedStatus, workerIndex, parallelIndex, durationMs, retry }) => ({ title, file, actualStatus, expectedStatus, workerIndex, parallelIndex, durationMs, retry })),
    tests: tests.map(({ title, file, actualStatus, workerIndex, durationMs, target }) => ({ title, file, actualStatus, workerIndex, durationMs, target })),
    startup: summarizeStartup(run, tests, events, scopedVite),
    archivedArtifacts: archived,
    testOrderEvents: order,
  }
  await writeFile(path.join(runEvidence, 'startup-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return { id, runRaw, summary }
}

async function main() {
  if (manifestOnly) {
    const files = (await walk(evidenceRoot)).filter((file) => file.relative !== 'sha256-manifest.json')
    const entries = []
    for (const file of files) entries.push({ path: file.relative, bytes: (await stat(file.abs)).size, sha256: await sha256(file.abs) })
    await writeFile(path.join(evidenceRoot, 'sha256-manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), files: entries }, null, 2)}\n`, 'utf8')
    return
  }

  const plan = JSON.parse(await readFile(path.join(evidenceRoot, 'experiment-plan.json'), 'utf8'))
  const runs = JSON.parse(await readFile(path.join(evidenceRoot, 'runs.json'), 'utf8'))
  const rawRoot = plan.raw
  const resourceRecords = await jsonlRecords(path.join(evidenceRoot, 'resources.jsonl'))
  const observationErrors = resourceRecords.filter(isObservationError)
  const resourceSamples = resourceRecords.filter((record) => !isObservationError(record)
    && typeof record?.freePhysicalBytes === 'number' && Number.isFinite(record.freePhysicalBytes)
    && Array.isArray(record.processes))
  const viteEvents = await jsonlRecords(path.join(evidenceRoot, 'vite-events.jsonl'))
  const processLineage = validateProcessLineage(resourceSamples, plan.pid)
  const validatedResourceSamples = processLineage.samples
  const runRows = runs.map((run) => ({ ...run, raw: run.raw ?? path.join(rawRoot, run.id) }))

  const inventoryEntries = await inventory(rawRoot, 'raw')
  const inventoryByRun = {}
  for (const run of runRows) inventoryByRun[run.id] = await inventory(run.raw, `raw/${run.id}`)
  await writeFile(path.join(evidenceRoot, 'raw-inventory.json'), `${JSON.stringify({ rawRoot, files: inventoryEntries, runs: inventoryByRun }, null, 2)}\n`, 'utf8')

  const completed = []
  for (const run of runRows) completed.push(await buildRun(evidenceRoot, rawRoot, run.raw, run, resourceSamples, plan.pid, viteEvents))
  let interruptedRuns = []
  try { interruptedRuns = JSON.parse(await readFile(path.join(evidenceRoot, 'interrupted-runs.json'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await appendEventsGzip([...runRows, ...interruptedRuns])

  const resourceMetrics = validatedResourceSamples.map((sample) => resourceMetric(sample, plan.pid))
  const runnerWindows = completed.map(({ id, summary }) => ({
    id,
    ...summarizeResourceWindow(validatedResourceSamples, plan.pid, summary.started, summary.ended),
  }))
  const tcpStates = new Set(resourceMetrics.flatMap((metric) => Object.keys(metric.tcpStateCounts)))
  const firstMetric = resourceMetrics[0]
  const lastMetric = resourceMetrics.at(-1)
  const sampleTimes = resourceSamples.map((sample) => Date.parse(sample.time)).filter(Number.isFinite).sort((a, b) => a - b)
  const intervals = sampleTimes.slice(1).map((time, index) => time - sampleTimes[index])
  const minimum = (values) => values.length ? Math.min(...values) : null
  const maximum = (values) => values.length ? Math.max(...values) : null
  const resourceSummary = {
    rootPid: plan.pid,
    rawSamples: resourceSamples.length,
    observationErrors,
    samplingIntervalMs: {
      sampleCountWithTime: sampleTimes.length,
      intervalCount: intervals.length,
      min: minimum(intervals),
      max: maximum(intervals),
      average: intervals.length ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : null,
    },
    first: firstMetric && { ...firstMetric, ownedProcesses: undefined },
    last: lastMetric && { ...lastMetric, ownedProcesses: undefined },
    resourceLineageAudit:processLineage.audit,
    maxOrphanCount: maximum(resourceMetrics.map((metric) => metric.orphanCount)),
    lastOrphanCount: lastMetric?.orphanCount ?? null,
    minFreePhysicalBytes: minimum(resourceMetrics.map((metric) => metric.freePhysicalBytes)),
    maxOwnedTotalPrivateBytes: resourceMetrics.reduce((max, metric) => Math.max(max, metric.totalPrivateBytes), 0),
    maxOwnedWorkingSetBytes: resourceMetrics.reduce((max, metric) => Math.max(max, metric.totalWorkingSetBytes), 0),
    maxChromeCount: resourceMetrics.reduce((max, metric) => Math.max(max, metric.chromeCount), 0),
    maxNodeCount: resourceMetrics.reduce((max, metric) => Math.max(max, metric.nodeCount), 0),
    maxViteCount: resourceMetrics.reduce((max, metric) => Math.max(max, metric.viteCount), 0),
    maxTotalHandles: resourceMetrics.reduce((max, metric) => Math.max(max, metric.totalHandles), 0),
    maxTotalThreads: resourceMetrics.reduce((max, metric) => Math.max(max, metric.totalThreads), 0),
    maxChromePrivateBytes: resourceMetrics.reduce((max, metric) => Math.max(max, metric.chromePrivateBytes), 0),
    maxNodePrivateBytes: resourceMetrics.reduce((max, metric) => Math.max(max, metric.nodePrivateBytes), 0),
    maxVitePrivateBytes: resourceMetrics.reduce((max, metric) => Math.max(max, metric.vitePrivateBytes), 0),
    tcpStateCounts: Object.fromEntries([...tcpStates].map((state) => [state, {
      first: firstMetric?.tcpStateCounts[state] ?? 0,
      last: lastMetric?.tcpStateCounts[state] ?? 0,
      peak: Math.max(...resourceMetrics.map((metric) => metric.tcpStateCounts[state] ?? 0)),
    }])),
    runnerWindows,
    note: 'Process counts and memory totals include only the root identity and PID+birth child identities proven through a validated parent present in the same sample. Excluded observations remain in raw resources.jsonl and are listed in resourceLineageAudit. TCP counts retain the monitor original scope: owned PIDs or connections using the monitored Vite port; they are not filtered by reconstructed lineage.',
  }
  await writeFile(path.join(evidenceRoot, 'resource-summary.json'), `${JSON.stringify(resourceSummary, null, 2)}\n`, 'utf8')

  const summary = {
    generatedAt: new Date().toISOString(),
    rawRoot,
    runCount: completed.length,
    interruptedRuns,
    runs: completed.map(({ summary: runSummary }) => ({ id: runSummary.id, started: runSummary.started, ended: runSummary.ended, durationMs: runSummary.durationMs, counts: runSummary.counts, failedTests: runSummary.failedTests, workerIndexes: runSummary.workerIndexes, traceRequested: runSummary.traceRequested, traceEffective: runSummary.traceEffective, specOrder: runSummary.specOrder })),
    resourceSummary: 'resource-summary.json',
    orphanCountPeak: resourceSummary.maxOrphanCount,
    orphanCountEnd: resourceSummary.lastOrphanCount,
    rawInventory: 'raw-inventory.json',
    mergedEvents: 'events.jsonl.gz',
  }
  await writeFile(path.join(evidenceRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  const files = (await walk(evidenceRoot)).filter((file) => file.relative !== 'sha256-manifest.json')
  const manifest = []
  for (const file of files) manifest.push({ path: file.relative, bytes: (await stat(file.abs)).size, sha256: await sha256(file.abs) })
  await writeFile(path.join(evidenceRoot, 'sha256-manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2)}\n`, 'utf8')
}

await main()
