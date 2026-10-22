import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mainEvidenceRoot = path.join(repositoryRoot, 'docs/verification/evidence/p11-6-startup-forensics-20261021')
const group = process.env.FORENSICS_GROUP
if (group && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(group)) throw new Error(`Unsafe FORENSICS_GROUP: ${group}`)
const evidenceRoot = group ? path.join(mainEvidenceRoot, group) : mainEvidenceRoot
const verifyManifestOnly = process.argv.includes('--verify-manifest')
const cleanupGenerated = process.argv.includes('--cleanup-source-copies')
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const shaFile = (file) => hash(readFileSync(file))

function safeEvidencePath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error(`Unsafe evidence path: ${relative}`)
  const absolute = path.resolve(root, relative)
  const resolvedRelative = path.relative(root, absolute)
  if (!resolvedRelative || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
    throw new Error(`Evidence path escapes its root: ${relative}`)
  }
  return absolute
}

function safeRepoGeneratedPath(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error(`Unsafe generated-source path: ${relative}`)
  const absolute = path.resolve(repositoryRoot, relative)
  const testsRoot = path.resolve(repositoryRoot, 'apps/web/tests')
  const withinTests = path.relative(testsRoot, absolute)
  if (!withinTests || path.dirname(withinTests) !== '.' || !/^forensics--product-.*\.spec\.ts$/.test(path.basename(absolute))) {
    throw new Error(`Generated-source path is outside the expected tests directory: ${relative}`)
  }
  return absolute
}

function verifyEvidenceManifest(root) {
  const manifestPath = path.join(root, 'sha256-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entries = manifest.files ?? []
  const results = entries.map((entry) => {
    if (entry.path === 'sha256-manifest.json') throw new Error('sha256-manifest.json must not hash itself')
    const absolute = safeEvidencePath(root, entry.path)
    if (!existsSync(absolute)) return { path:entry.path, expectedSha256:entry.sha256, status:'missing' }
    const bytes = readFileSync(absolute)
    const actualSha256 = hash(bytes)
    return {
      path:entry.path,
      expectedBytes:entry.bytes,
      actualBytes:bytes.length,
      expectedSha256:entry.sha256,
      actualSha256,
      status:bytes.length === entry.bytes && actualSha256 === entry.sha256 ? 'match' : 'mismatch',
    }
  })
  const mismatchCount = results.filter((result) => result.status !== 'match').length
  return { root, manifestPath, entryCount:entries.length, mismatchCount, status:mismatchCount === 0 ? 'verified' : 'mismatch', entries:results }
}

if (verifyManifestOnly) {
  const verification = verifyEvidenceManifest(evidenceRoot)
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`)
  if (verification.mismatchCount) process.exitCode = 1
} else {
  mkdirSync(evidenceRoot, { recursive:true })
  const baselinePath = path.join(mainEvidenceRoot, 'experiment-plan.json')
  const sourceManifestPath = path.join(mainEvidenceRoot, 'generated-sources.json')
  const plan = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'))
  const baseline = plan.baseline?.['rev-parse HEAD']
  if (!baseline || !/^[0-9a-f]{40,64}$/i.test(baseline)) throw new Error(`Invalid baseline HEAD in ${baselinePath}`)

  const runGitBuffer = (args) => execFileSync('git', args, { cwd:repositoryRoot, maxBuffer:64 * 1024 * 1024 })
  const gitShow = (relative) => {
    const args = ['show', `${baseline}:${relative}`]
    try { return { args, buffer:runGitBuffer(args), error:null } }
    catch (error) { return { args, buffer:null, error:String(error) } }
  }
  const gitText = (args, input) => {
    const result = spawnSync('git', args, { cwd:repositoryRoot, input, encoding:'utf8', maxBuffer:64 * 1024 * 1024 })
    return { args:['git', ...args], stdout:(result.stdout ?? '').trim(), stderr:result.stderr || '', exitCode:result.status, error:result.error?.message ?? null }
  }
  const byteRecord = (relative) => {
    const diskPath = path.join(repositoryRoot, relative)
    let disk = null
    let readError = null
    try { disk = readFileSync(diskPath) }
    catch (error) { readError = String(error) }
    const baselineBuffer = gitShow(relative)
    const cleanObject = disk ? gitText(['hash-object', '--path', relative, '--stdin'], disk) : null
    const baselineObject = gitText(['rev-parse', `${baseline}:${relative}`])
    const diff = gitText(['diff', '--quiet', baseline, '--', relative])
    const cleanObjectId = cleanObject?.exitCode === 0 ? cleanObject.stdout : null
    const baselineObjectId = baselineObject.exitCode === 0 ? baselineObject.stdout : null
    return {
      path:relative,
      commands:[
        `git show ${baseline}:${relative}`,
        ...(disk ? [`git hash-object --path ${relative} --stdin`] : []),
        `git rev-parse ${baseline}:${relative}`,
        `git diff --quiet ${baseline} -- ${relative}`,
      ],
      diskSha256:disk ? hash(disk) : null,
      baselineSha256:baselineBuffer.buffer ? hash(baselineBuffer.buffer) : null,
      byteEqualToBaseline:Boolean(disk && baselineBuffer.buffer && disk.equals(baselineBuffer.buffer)),
      gitCleanObjectId:cleanObjectId,
      baselineObjectId,
      normalizedEqualToBaseline:Boolean(cleanObjectId && baselineObjectId && cleanObjectId === baselineObjectId),
      gitDiffQuiet:{ exitCode:diff.exitCode, unchanged:diff.exitCode === 0, stderr:diff.stderr, error:diff.error },
      diskReadError:readError,
      gitShowError:baselineBuffer.error,
      gitCleanError:cleanObject?.error ?? (cleanObject?.exitCode === 0 ? null : cleanObject?.stderr ?? null),
      baselineObjectError:baselineObject.error ?? (baselineObject.exitCode === 0 ? null : baselineObject.stderr),
    }
  }

  const expectedSourcePaths = sourceManifest.files.map((entry) => entry.source)
  const originalSources = sourceManifest.files.map((entry) => {
    const record = byteRecord(entry.source)
    const currentMatchesManifest = record.diskSha256 === entry.sourceSha256
    return {
      ...record,
      manifestSha256:entry.sourceSha256,
      currentMatchesManifest,
      baselineAndDiskEqual:record.byteEqualToBaseline,
      normalizedEqualToBaseline:record.normalizedEqualToBaseline,
      verified:currentMatchesManifest && record.normalizedEqualToBaseline && record.gitDiffQuiet.unchanged,
    }
  })

  const generatedSources = sourceManifest.files.map((entry) => {
    const generatedPath = safeRepoGeneratedPath(entry.generated)
    let actualSha256 = null
    let missing = false
    try { actualSha256 = shaFile(generatedPath) }
    catch (error) { if (error?.code === 'ENOENT') missing = true; else throw error }
    return {
      path:entry.generated,
      manifestSha256:entry.generatedSha256,
      actualSha256,
      matchesManifest:actualSha256 === entry.generatedSha256,
      missing,
      importReplacements:entry.importReplacements,
    }
  })

  const protectedPaths = [
    'apps/web/playwright.config.ts',
    'apps/web/vite.config.ts',
    'apps/web/src/main.ts',
    'apps/web/src/webRuntimePreferences.ts',
    'apps/web/src/theme.ts',
    'apps/web/package.json',
    'package.json',
    'docs/verification/p11-6-timeline-final-acceptance.md',
  ]
  const protectedFiles = protectedPaths.map(byteRecord)

  const businessDiffArgs = ['diff', '--name-only', baseline, '--', ':(glob)apps/*/src/**', 'packages']
  const businessDiff = spawnSync('git', businessDiffArgs, { cwd:repositoryRoot, encoding:'utf8', maxBuffer:64 * 1024 * 1024 })
  const businessChangedPaths = (businessDiff.stdout ?? '').split(/\r?\n/).filter(Boolean)
  const originalSpecDiffs = sourceManifest.files.map((entry) => {
    const args = ['diff', '--quiet', baseline, '--', entry.source]
    const result = spawnSync('git', args, { cwd:repositoryRoot, encoding:'utf8' })
    return { path:entry.source, command:['git', ...args], exitCode:result.status, unchanged:result.status === 0, stderr:result.stderr || '' }
  })

  const authoredFiles = []
  const toolsDirectory = path.join(repositoryRoot, 'tools/startup-forensics')
  for (const name of readdirSync(toolsDirectory)) {
    if (/\.(?:mjs|ts|ps1)$/.test(name)) authoredFiles.push(path.join(toolsDirectory, name))
  }
  authoredFiles.push(
    path.join(repositoryRoot, 'apps/web/playwright.startup-forensics.config.ts'),
    path.join(repositoryRoot, 'docs/verification/p11-6-startup-forensics.md'),
    path.join(repositoryRoot, '.agents/current-task.md'),
    path.join(repositoryRoot, '.agents/handoff.md'),
  )
  for (const name of ['experiment-plan.json', 'generated-sources.json', 'instrumentation-change.json', 'historical-evidence.json']) {
    authoredFiles.push(path.join(mainEvidenceRoot, name))
  }
  const authoredTextEncoding = authoredFiles.filter(existsSync).map((absolute) => {
    const content = readFileSync(absolute)
    let validUtf8 = true
    try { new TextDecoder('utf-8', { fatal:true }).decode(content) }
    catch { validUtf8 = false }
    const hasBom = content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf
    return { path:path.relative(repositoryRoot, absolute).split(path.sep).join('/'), validUtf8, hasBom, compliant:validUtf8 && !hasBom }
  })

  const versionCommand = { executable:process.execPath, args:['scripts/version.mjs', 'check'], cwd:repositoryRoot }
  const versionStartedUtc = new Date().toISOString()
  const versionResult = spawnSync(versionCommand.executable, versionCommand.args, { cwd:repositoryRoot, encoding:null, maxBuffer:16 * 1024 * 1024 })
  const versionEndedUtc = new Date().toISOString()
  writeFileSync(path.join(evidenceRoot, 'version-check.stdout.log'), versionResult.stdout ?? Buffer.alloc(0))
  writeFileSync(path.join(evidenceRoot, 'version-check.stderr.log'), versionResult.stderr ?? Buffer.alloc(0))
  const rootPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  const webPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'apps/web/package.json'), 'utf8'))

  const cleanupCandidates = sourceManifest.files.map((entry) => {
    const absolute = safeRepoGeneratedPath(entry.generated)
    const testsRoot = path.resolve(repositoryRoot, 'apps/web/tests')
    const relative = path.relative(testsRoot, absolute)
    const safelyScoped = relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      && path.dirname(relative) === '.' && /^forensics--product-.*\.spec\.ts$/.test(path.basename(absolute))
    const generated = generatedSources.find((item) => item.path === entry.generated)
    return { path:entry.generated, absolute, safelyScoped:Boolean(safelyScoped), matchesManifest:Boolean(generated?.matchesManifest), exists:Boolean(generated && !generated.missing) }
  })
  const cleanupReady = sourceManifest.files.length === 14
    && new Set(cleanupCandidates.map((candidate) => candidate.absolute)).size === 14
    && cleanupCandidates.every((candidate) => candidate.safelyScoped && candidate.matchesManifest && candidate.exists)
  let cleanup = { requested:cleanupGenerated, performed:false, removed:[], reason:cleanupGenerated ? null : 'not requested' }
  if (cleanupGenerated && !cleanupReady) cleanup.reason = 'Refused: all 14 generated files must exist, be safely scoped, and match the source manifest before any unlink.'
  if (cleanupGenerated && cleanupReady) {
    for (const candidate of cleanupCandidates) {
      unlinkSync(candidate.absolute)
      cleanup.removed.push(candidate.path)
    }
    cleanup.performed = true
    cleanup.reason = null
  }

  const runtimeFilesUnchanged = protectedFiles.every((record) => record.normalizedEqualToBaseline && record.gitDiffQuiet.unchanged)
  const sourcesUnchanged = originalSources.length === 14 && originalSources.every((record) => record.verified)
  const specsUnchanged = originalSpecDiffs.length === 14 && originalSpecDiffs.every((record) => record.unchanged)
  const noProductionChange = businessDiff.status === 0 && businessChangedPaths.length === 0 && runtimeFilesUnchanged && specsUnchanged
  const versionCheck = {
    ...versionCommand,
    exactCommand:`${JSON.stringify(versionCommand.executable)} scripts/version.mjs check`,
    startedUtc:versionStartedUtc,
    endedUtc:versionEndedUtc,
    exitCode:versionResult.status,
    spawnError:versionResult.error?.message ?? null,
    stdoutFile:'version-check.stdout.log',
    stderrFile:'version-check.stderr.log',
    rootVersion:rootPackage.version,
    rootBuildNumber:rootPackage.eotion?.buildNumber,
    webVersion:webPackage.version,
    expectedVersion:'0.0.1',
    expectedBuildNumber:2,
    expectedIdentityMatches:rootPackage.version === '0.0.1' && rootPackage.eotion?.buildNumber === 2 && webPackage.version === '0.0.1',
  }
  const audit = {
    generatedAtUtc:new Date().toISOString(),
    evidenceRoot:path.relative(repositoryRoot, evidenceRoot).split(path.sep).join('/'),
    baselineHead:baseline,
    generatedSourceCount:sourceManifest.files.length,
    originalSources,
    generatedSources,
    protectedRuntimeFiles:protectedFiles,
    businessSourceDiff:{ command:['git', ...businessDiffArgs], exitCode:businessDiff.status, changedPaths:businessChangedPaths, stderr:businessDiff.stderr || '' },
    originalSpecDiffs,
    noProductionChange,
    authoredTextEncoding,
    allAuthoredTextUtf8NoBom:authoredTextEncoding.every((record) => record.compliant),
    versionCheck,
    cleanup,
    cleanupSafeToPerform:cleanupReady,
    status: sourcesUnchanged && generatedSources.every((entry) => entry.matchesManifest) && noProductionChange
      && authoredTextEncoding.every((record) => record.compliant) && versionResult.status === 0 && versionCheck.expectedIdentityMatches
      ? 'verified' : 'review-required',
    note:'Raw disk/git-show SHA and byte equality are retained as facts. Baseline comparisons use Git clean-filter object IDs (git hash-object --path without -w vs git rev-parse) plus git diff --quiet, so pre-existing CRLF/mixed EOL under autocrlf are preserved and not mistaken for edits. The audit does not rewrite EOLs. This audit writes source-audit.json and version-check logs after any previous evidence manifest; recompute the evidence-root SHA-256 manifest afterward.',
  }
  writeFileSync(path.join(evidenceRoot, 'source-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8')
  if (cleanupGenerated && !cleanupReady) throw new Error(cleanup.reason)
}
