import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const repo = path.resolve(import.meta.dirname, '../..');
const main = path.join(repo, 'docs/verification/evidence/p11-6-startup-forensics-20261021');
const group = process.env.FORENSICS_GROUP;
if (!group || !/^[a-zA-Z0-9_-]+$/.test(group)) throw new Error('Explicit safe FORENSICS_GROUP required');
const root = group === 'main' ? main : path.join(main, group);
const exists = async file => { try { await stat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const within = (parent, child) => { const rel = path.relative(parent, child); if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Outside intended directory: ${child}`); };
async function files(dir, rel = '') {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(rel, entry.name), absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await files(absolute, name));
    else if (entry.isFile()) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(absolute)) hash.update(chunk);
      rows.push({ path: name, bytes: (await stat(absolute)).size, sha256: hash.digest('hex') });
    } else throw new Error(`Unexpected link or special file: ${absolute}`);
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
if (!await exists(path.join(root, 'orchestration-end.json')) && !await exists(path.join(root, 'user-stop.json'))) throw new Error('Group must be stopped');
const plan = JSON.parse(await readFile(path.join(root, 'experiment-plan.json'), 'utf8'));
const runs = JSON.parse(await readFile(path.join(root, 'runs.json'), 'utf8'));
const relocations = [];
for (const run of runs) {
  if (!/^[a-zA-Z0-9_-]+$/.test(run.id)) throw new Error(`Unsafe run id ${run.id}`);
  const raw = path.resolve(run.raw), expectedRaw = path.resolve(plan.raw, run.id);
  if (raw !== expectedRaw) throw new Error(`Unexpected raw run directory: ${raw}`);
  const source = path.resolve(root, run.id, 'artifacts');
  const destination = path.resolve(raw, 'previous-archived-artifacts');
  within(root, source); within(raw, destination);
  if (!await exists(source)) continue;
  if (await exists(destination)) throw new Error(`Refusing to replace previous archive: ${destination}`);
  const before = await files(source);
  await rename(source, destination);
  const after = await files(destination);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Artifact move verification failed: ${destination}`);
  relocations.push({ runId: run.id, source, destination, verified: true, files: before });
}
await writeFile(path.join(root, 'artifact-relocations.json'), JSON.stringify({ time: new Date().toISOString(), reason: 'Preserve existing long-path archive copies before generating Git-portable short paths; raw test evidence remains untouched', relocations }, null, 2));
