import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mainEvidenceRoot = path.join(repositoryRoot, 'docs/verification/evidence/p11-6-startup-forensics-20261021')
const group = process.env.FORENSICS_GROUP
if (!group || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(group)) {
  throw new Error('FORENSICS_GROUP must be explicitly set to a safe evidence group name')
}

const evidenceRoot = group === 'main' ? mainEvidenceRoot : path.resolve(mainEvidenceRoot, group)
const planPath = path.resolve(evidenceRoot, 'experiment-plan.json')
const sources = ['vite-events.jsonl', 'resources.jsonl', 'system-memory.jsonl']

function assertWithin(parent, candidate, label) {
  const relative = path.relative(parent, candidate)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes or aliases its permitted directory: ${candidate}`)
  }
}

function exactChild(parent, name, label) {
  const candidate = path.resolve(parent, name)
  assertWithin(parent, candidate, label)
  if (path.dirname(candidate) !== path.resolve(parent) || path.basename(candidate) !== name) {
    throw new Error(`${label} must be a direct child with the expected basename: ${candidate}`)
  }
  return candidate
}

async function sha256File(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function gzipShaAndBytes(file) {
  const hash = createHash('sha256')
  let bytes = 0
  const stream = createReadStream(file).pipe(createGunzip())
  for await (const chunk of stream) {
    bytes += chunk.length
    hash.update(chunk)
  }
  return { sha256:hash.digest('hex'), bytes }
}

async function fileMetadata(file) {
  return { bytes:(await stat(file)).size, sha256:await sha256File(file) }
}

async function main() {
  const finishedPath = exactChild(evidenceRoot, 'orchestration-end.json', 'completion marker')
  const stoppedPath = exactChild(evidenceRoot, 'user-stop.json', 'stop marker')
  if (!(await exists(finishedPath)) && !(await exists(stoppedPath))) {
    throw new Error(`Refusing to pack active evidence group; expected orchestration-end.json or user-stop.json in ${evidenceRoot}`)
  }

  const plan = JSON.parse(await readFile(planPath, 'utf8'))
  if (typeof plan.raw !== 'string' || !path.isAbsolute(plan.raw)) throw new Error(`experiment-plan.json has no absolute raw directory: ${planPath}`)
  const rawRoot = path.resolve(plan.raw)
  const archiveDirectory = path.resolve(rawRoot, 'preserved-service-logs')
  assertWithin(rawRoot, archiveDirectory, 'raw archive directory')
  if (path.dirname(archiveDirectory) !== rawRoot || path.basename(archiveDirectory) !== 'preserved-service-logs') {
    throw new Error(`Unsafe raw archive directory: ${archiveDirectory}`)
  }
  await mkdir(archiveDirectory, { recursive:true })

  const previousIndexPath = exactChild(evidenceRoot, 'archival-packing.json', 'packing index')
  let previousEntries = []
  try {
    const previous = JSON.parse(await readFile(previousIndexPath, 'utf8'))
    previousEntries = previous.sources ?? []
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const entriesByName = new Map(previousEntries.map((entry) => [entry.name, entry]))
  const errors = []

  for (const name of sources) {
    const source = exactChild(evidenceRoot, name, 'service log source')
    const compressed = exactChild(evidenceRoot, `${name}.gz`, 'compressed service log')
    const rawArchive = exactChild(archiveDirectory, name, 'preserved raw service log')
    const entry = { name, sourcePath:source, compressedPath:compressed, rawArchivePath:rawArchive, status:'pending' }
    try {
      const sourceExists = await exists(source)
      const compressedExists = await exists(compressed)
      const rawArchiveExists = await exists(rawArchive)

      if (!sourceExists && !compressedExists) throw new Error('Neither original source nor compressed archive exists')

      let original = null
      if (sourceExists) original = await fileMetadata(source)

      let compressedMetadata = null
      if (compressedExists) {
        compressedMetadata = await fileMetadata(compressed)
        const restored = await gzipShaAndBytes(compressed)
        entry.gunzipVerified = Boolean(original && restored.sha256 === original.sha256 && restored.bytes === original.bytes)
        entry.gunzipSha256 = restored.sha256
        entry.gunzipBytes = restored.bytes
        if (original && !entry.gunzipVerified) throw new Error('Existing .gz does not decompress to the current original bytes; refusing to overwrite')
      } else {
        const output = createWriteStream(compressed, { flags:'wx' })
        await pipeline(createReadStream(source), createGzip({ level:6 }), output)
        compressedMetadata = await fileMetadata(compressed)
        const restored = await gzipShaAndBytes(compressed)
        entry.gunzipVerified = restored.sha256 === original.sha256 && restored.bytes === original.bytes
        entry.gunzipSha256 = restored.sha256
        entry.gunzipBytes = restored.bytes
        if (!entry.gunzipVerified) throw new Error('New .gz failed SHA-256/byte-count round-trip verification; original retained')
      }

      entry.originalBytes = original?.bytes ?? entry.gunzipBytes
      entry.originalSha256 = original?.sha256 ?? entry.gunzipSha256
      entry.compressedBytes = compressedMetadata.bytes
      entry.compressedSha256 = compressedMetadata.sha256
      entry.gzipRoundTripVerified = entry.gunzipVerified

      if (sourceExists) {
        if (rawArchiveExists) {
          const preserved = await fileMetadata(rawArchive)
          if (preserved.sha256 !== original.sha256 || preserved.bytes !== original.bytes) {
            throw new Error('Existing preserved-service-logs file does not match source; refusing to replace it')
          }
          entry.originalRename = 'already-matching; both source and archive left untouched'
        } else {
          await rename(source, rawArchive)
          entry.originalRename = 'renamed-after-gzip-verification'
        }
      } else if (rawArchiveExists) {
        const preserved = await fileMetadata(rawArchive)
        if (preserved.sha256 !== entry.originalSha256 || preserved.bytes !== entry.originalBytes) {
          throw new Error('Existing preserved-service-logs file does not match compressed original')
        }
        entry.gunzipVerified = true
        entry.gzipRoundTripVerified = true
        entry.originalRename = 'already-preserved'
      } else {
        entry.originalRename = 'original-no-longer-at-source; compressed copy verified; no replacement created'
      }
      entry.status = 'packed-and-verified'
      entriesByName.set(name, entry)
    } catch (error) {
      entry.status = 'error'
      entry.error = error instanceof Error ? error.message : String(error)
      entriesByName.set(name, entry)
      errors.push({ name, error:entry.error })
    }
  }

  const index = {
    generatedAtUtc:new Date().toISOString(),
    evidenceRoot,
    rawRoot,
    completionMarker:(await exists(finishedPath)) ? 'orchestration-end.json' : 'user-stop.json',
    allowedSources:sources,
    originalsDeleted:false,
    sources:[...entriesByName.values()],
  }
  await writeFile(previousIndexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  if (errors.length) throw new Error(`Evidence packing completed with ${errors.length} error(s); see archival-packing.json`)
}

async function exists(file) {
  try { await stat(file); return true }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}

await main()
