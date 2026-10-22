import { spawn, fork, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const repo = path.resolve(import.meta.dirname, '../..');
const web = path.join(repo, 'apps/web');
const mainRoot = path.join(repo, 'docs/verification/evidence/p11-6-startup-forensics-20261021');
const group = process.env.FORENSICS_GROUP;
const mode = process.env.FORENSICS_MODE || 'default';
if (group && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(group)) throw new Error(`Unsafe FORENSICS_GROUP: ${group}`);
if (!['default', 'prefix94', 'remaining'].includes(mode)) throw new Error(`Unsupported FORENSICS_MODE: ${mode}`);
if (mode === 'prefix94' && group !== 'prefix94') throw new Error('FORENSICS_MODE=prefix94 requires FORENSICS_GROUP=prefix94 to keep evidence isolated');
if (mode === 'remaining' && group !== 'resume-20261022') throw new Error('FORENSICS_MODE=remaining requires FORENSICS_GROUP=resume-20261022 to keep evidence isolated');
const root = group ? path.join(mainRoot, group) : mainRoot;
const raw = path.join(os.tmpdir(), `eotion-startup-forensics-${Date.now()}`);
mkdirSync(root, { recursive: true }); mkdirSync(raw, { recursive: true });
const env = { ...process.env, FORENSICS_ROOT: root, FORENSICS_BASE_URL: 'http://127.0.0.1:7179', VITE_PORT: '7179', NO_COLOR: '1' };
delete env.FORCE_COLOR;
const require = createRequire(path.join(web, 'package.json'));
const cli = require.resolve('@playwright/test/cli');
const specs = JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8')).scripts['test:product'].split(' ').filter(x => x.endsWith('.spec.ts'));
const copied = specs.map(s => s.replace('tests/', 'tests/forensics--'));
const actualOrder = [...copied].sort();
const canonicalTitlePath = (parts, file) => {
  const cleaned = (parts || []).filter(part => typeof part === 'string' && part.trim().length > 0);
  const sourceBase = path.basename(file).replace(/^forensics--/, '');
  const generatedBase = path.basename(file);
  const fileIndex = cleaned.findIndex(part => path.basename(part) === generatedBase || path.basename(part) === sourceBase);
  return [sourceBase, ...(fileIndex >= 0 ? cleaned.slice(fileIndex + 1) : cleaned)];
};
function readJsonl(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
function specIndexFromResults(results) {
  const index = [];
  const visit = (suite, parents = []) => {
    const next = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs || []) {
      const file = path.basename(spec.file || suite.file || '');
      index.push({ file, line: spec.line, titlePath: canonicalTitlePath([...next, spec.title], file), title: spec.title });
    }
    for (const child of suite.suites || []) visit(child, next);
  };
  for (const suite of results.suites || []) visit(suite);
  return index;
}
function selectPrefix94() {
  const sourceRun = 'b-actual-prefix-07';
  const sourcePlan = JSON.parse(readFileSync(path.join(mainRoot, 'experiment-plan.json'), 'utf8'));
  const sourceDir = path.join(sourcePlan.raw, sourceRun);
  const results = JSON.parse(readFileSync(path.join(sourceDir, 'results.json'), 'utf8'));
  const begins = readJsonl(path.join(sourceDir, 'test-order.jsonl')).filter(record => record.event === 'testBegin');
  if (begins.length < 94) throw new Error(`Source run ${sourceRun} has only ${begins.length} testBegin records; need 94`);
  const index = specIndexFromResults(results);
  const sourceFiles = new Set(specs.map(spec => path.basename(spec)));
  const selectedOrdinal = begins.slice(0, 94).map((record, indexInRun) => {
    const generatedFile = path.basename(record.file || '');
    const sourceFile = generatedFile.replace(/^forensics--/, '');
    if (!sourceFiles.has(sourceFile)) throw new Error(`Source event ${indexInRun + 1} references unknown spec ${generatedFile}`);
    const titlePath = canonicalTitlePath(record.title, generatedFile);
    const candidates = index.filter(candidate => candidate.file === generatedFile
      && JSON.stringify(candidate.titlePath) === JSON.stringify(titlePath));
    if (candidates.length !== 1) throw new Error(`Source titlePath is ${candidates.length === 0 ? 'unmapped' : 'ambiguous'} at ordinal ${indexInRun + 1}: ${JSON.stringify({generatedFile, titlePath, candidates})}`);
    const candidate = candidates[0];
    const filter = `tests/${generatedFile}:${candidate.line}`;
    return {
      selectedOrdinal: indexInRun + 1,
      sourceTestBegin: record.title,
      sourceFile: `tests/${sourceFile}`,
      generatedFile: `tests/${generatedFile}`,
      titlePath,
      title: titlePath.slice(1).join(' › '),
      line: candidate.line,
      filter,
    };
  });
  const seen = new Set();
  const filters = selectedOrdinal.map(item => item.filter).filter(filter => {
    const key = filter.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { sourceRun, sourceRaw: sourceDir, selectedOrdinal, filters };
}
let prefix94;
if (mode === 'prefix94') {
  try { prefix94 = selectPrefix94(); }
  catch (error) {
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'prefix94-selection-error.json'), JSON.stringify({ time:new Date().toISOString(), mode, sourceRun:'b-actual-prefix-07', error:String(error), stack:error.stack }, null, 2));
    throw error;
  }
}
const baseline = {};
for (const args of [['status','--porcelain=v1'], ['rev-parse','HEAD'], ['rev-parse','origin/master'], ['log','-5','--oneline']]) baseline[args.join(' ')] = execFileSync('git', args, {cwd:repo, encoding:'utf8'}).trim();
const experimentPlan = {
  started: new Date().toISOString(), pid: process.pid, raw, baseline, specs, group: group ?? null, mode,
  ...(prefix94 ? { sourceRun: prefix94.sourceRun, selectedOrdinal: prefix94.selectedOrdinal, filters: prefix94.filters } : {}),
  ...(mode === 'remaining' ? {
    resumeReferences: {
      evidenceRoot: path.relative(repo, mainRoot).split(path.sep).join('/'),
      interruptedRuns: ['c-03-product-editor'],
      completedPredecessors: ['c-01-product-flow', 'c-02-product-pages'],
      rerunFromSpecIndex: 2,
      rerunThroughSpecIndex: 13,
      note: 'Fresh isolated evidence root/raw directory. Earlier interrupted attempt remains preserved in the main evidence root; flow and pages are already complete and are not rerun.',
    },
  } : {}),
  environment: { baseURL:env.FORENSICS_BASE_URL, originalBaseURL:'http://127.0.0.1:7173', existingUserVitePid:58068, workers:1, retries:0, browser:'chromium / channel chrome', vite:'original config + read-only middleware/transform observer', instrumentation:'generated spec import substitution only; original assertions/actions/timeouts intact' },
  plan: mode === 'prefix94'
    ? ['prefix94: one R5-following actual collection prefix, selected from first 94 testBegin records of b-actual-prefix-07; verify diagnostic --list exactly matches before one runner']
    : mode === 'remaining'
      ? ['remaining: isolated C continuation only; run original spec indexes 2 through 13 as individual workers=1/retries=0 runners; preserve prior flow/pages evidence and interrupted editor attempt']
    : ['A R5 3 new runners, R1 1 new runner, trace on', 'B first5 script-listed subset; expand to historical actual prefix7 through R5, then actual prefix13 through R1; all target predecessors preserved; no full Product gate', 'C 14 spec files each in own runner; preserve script file list order', 'D compare same worker/browser within cumulative runners vs fresh runner; Vite reused within batch'],
  safety:{ minFreePhysicalBytes:2147483648, maxOwnedPrivateBytes:17179869184, maxRunMs:2400000, note:'stop batch on observed threshold, resource sampler error, or excessively long runner; thresholds are guardrails, not exhaustion claims' },
};
writeFileSync(path.join(root, 'experiment-plan.json'), JSON.stringify(experimentPlan, null, 2));
const monitorStop = path.join(raw, 'monitor.stop');
const monitorOut = path.join(root, 'resources.jsonl');
const monitor = spawn('pwsh', ['-NoProfile','-File',path.join(import.meta.dirname,'resource-monitor.ps1'),'-RootProcessId',String(process.pid),'-OutFile',monitorOut,'-StopFile',monitorStop,'-Port','7179'], {windowsHide:true, stdio:['ignore', 'ignore', 'pipe']});
monitor.stderr.pipe(createWriteStream(path.join(root,'resource-monitor.stderr.log')));
let systemMemoryMonitorError = null;
const systemMemoryOut = path.join(root, 'system-memory.jsonl');
const systemMemoryMonitor = spawn('pwsh', ['-NoProfile','-File',path.join(import.meta.dirname,'system-memory-monitor.ps1'),'-OutFile',systemMemoryOut,'-StopFile',monitorStop], {windowsHide:true, stdio:['ignore', 'ignore', 'pipe']});
systemMemoryMonitor.stderr.pipe(createWriteStream(path.join(root,'system-memory-monitor.stderr.log')));
systemMemoryMonitor.on('error', error => { systemMemoryMonitorError = String(error); writeFileSync(path.join(root,'system-memory-monitor.error.log'), systemMemoryMonitorError); });
const vite = fork(path.join(import.meta.dirname,'vite-service.mjs'), [], {cwd:web,env, silent:true,windowsHide:true});
vite.stdout.pipe(createWriteStream(path.join(root,'vite.stdout.log'))); vite.stderr.pipe(createWriteStream(path.join(root,'vite.stderr.log')));
let current;
let stopped = false;
const results = [];
async function run(id, files, grep, trace = 'retain-on-failure') {
  if(stopped) return;
  const out = path.join(raw,id); mkdirSync(out,{recursive:true});
  const dir = path.join(root,id); mkdirSync(dir,{recursive:true});
  const args = [cli,'test','--config','playwright.startup-forensics.config.ts', ...files,'--workers=1','--retries=0', '--output',path.join(out,'test-results')];
  if(grep) args.push('--grep',grep);
  const runEnv = {...env,FORENSICS_RUN_DIR:out,FORENSICS_TRACE:trace};
  const meta = {id,exe:process.execPath,args,cwd:web,head:baseline['rev-parse HEAD'],started:new Date().toISOString(),raw:out,observationConfig:'apps/web/playwright.startup-forensics.config.ts',trace,workers:1,retries:0};
  writeFileSync(path.join(dir,'command.json'),JSON.stringify(meta,null,2));
  console.log('START',id,meta.started);
  current=spawn(process.execPath,args,{cwd:web,env:runEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
  meta.runnerPid=current.pid;
  current.stdout.pipe(createWriteStream(path.join(dir,'stdout.log'))); current.stderr.pipe(createWriteStream(path.join(dir,'stderr.log')));
  const guard = setInterval(() => {
    if(!existsSync(monitorOut)) return;
    const lines=readFileSync(monitorOut,'utf8').trim().split('\n');
    let sample; try{sample=JSON.parse(lines.at(-1));}catch{return;}
    const privateBytes=(sample.processes||[]).reduce((s,p)=>s+p.privateBytes,0);
    const age=Date.now()-Date.parse(meta.started);
    const reason= sample.observationError ? 'resource observation failure' : sample.freePhysicalBytes < 2147483648 ? 'free physical memory guard' : privateBytes>17179869184 ? 'owned private bytes guard' : age>2400000 ? '40 minute runner duration guard' : null;
    if(reason){stopped=true;meta.guardStop={reason,sampleTime:sample.time,privateBytes,freePhysicalBytes:sample.freePhysicalBytes};console.log('GUARD_STOP',JSON.stringify(meta.guardStop)); current.kill('SIGINT');}
  },5000);
  const code=await new Promise((resolve,reject)=>{current.once('error',reject);current.once('exit',(code,signal)=>resolve({code,signal}));});
  clearInterval(guard);current=undefined;
  meta.ended=new Date().toISOString();Object.assign(meta,code);results.push(meta);
  writeFileSync(path.join(dir,'command.json'),JSON.stringify(meta,null,2));
  writeFileSync(path.join(root,'runs.json'),JSON.stringify(results,null,2));
  console.log('END',id,JSON.stringify(code),meta.ended);
}
function parseListing(listing) {
  return listing.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s+(.+?):(\d+):\d+\s+›\s+(.*)$/);
    if (!match) return [];
    return [{ file:path.basename(match[1]), line:Number(match[2]), title:match[3] }];
  });
}
function validatePrefix94List() {
  const listDir = path.join(raw, 'prefix94-preflight-list');
  const evidenceDir = path.join(root, 'prefix94-preflight');
  mkdirSync(listDir, { recursive:true }); mkdirSync(evidenceDir, { recursive:true });
  const listEnv = { ...env, FORENSICS_RUN_DIR:listDir, FORENSICS_TRACE:'on' };
  const args = [cli, 'test', '--config', 'playwright.startup-forensics.config.ts', ...prefix94.filters, '--workers=1', '--retries=0', '--output', path.join(listDir, 'test-results'), '--list'];
  const command = { exe:process.execPath, args, cwd:web, FORENSICS_RUN_DIR:listDir, started:new Date().toISOString() };
  let listing;
  try {
    listing = execFileSync(process.execPath, args, { cwd:web, encoding:'utf8', env:listEnv, maxBuffer:10 * 1024 * 1024 });
  } catch (error) {
    const record = { status:'error', command, error:String(error), stdout:error.stdout?.toString(), stderr:error.stderr?.toString(), selectedCount:prefix94.selectedOrdinal.length, filterCount:prefix94.filters.length };
    writeFileSync(path.join(evidenceDir, 'validation.json'), JSON.stringify(record, null, 2));
    throw new Error(`prefix94 diagnostic --list failed: ${String(error)}`);
  }
  writeFileSync(path.join(evidenceDir, 'list.stdout.txt'), listing);
  const listed = parseListing(listing);
  const expected = prefix94.selectedOrdinal.map(item => ({ file:path.basename(item.generatedFile), line:item.line, title:item.title }));
  const mismatches = [];
  if (listed.length !== 94) mismatches.push({ reason:'listed-case-count', expected:94, actual:listed.length });
  for (let i = 0; i < Math.max(expected.length, listed.length); i++) {
    const want = expected[i]; const got = listed[i];
    const expectedDisplays = want ? [
      want.title,
      prefix94.selectedOrdinal[i].titlePath.slice(1).join(' '),
    ] : [];
    if (!want || !got || want.file !== got.file || want.line !== got.line || !expectedDisplays.includes(got.title)) mismatches.push({ ordinal:i + 1, expected:{...want, acceptableListTitles:expectedDisplays}, actual:got });
  }
  const totalMatch = listing.match(/Total:\s*(\d+)\s+tests?\b/);
  const total = totalMatch ? Number(totalMatch[1]) : null;
  if (total !== 94) mismatches.push({ reason:'total-summary-count', expected:94, actual:total });
  const record = { status:mismatches.length ? 'error' : 'confirmed', command, ended:new Date().toISOString(), expectedCount:94, listedCount:listed.length, totalSummary:total, filters:prefix94.filters, mismatches };
  writeFileSync(path.join(evidenceDir, 'validation.json'), JSON.stringify(record, null, 2));
  experimentPlan.prefix94Preflight = { status:record.status, listDir, expectedCount:94, listedCount:listed.length, totalSummary:total };
  writeFileSync(path.join(root, 'experiment-plan.json'), JSON.stringify(experimentPlan, null, 2));
  if (mismatches.length) throw new Error(`prefix94 --list must exactly match all 94 selected testBegin entries; found ${mismatches.length} mismatch(es)`);
}
try {
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Vite readiness timeout')),30000);vite.stdout.on('data',data=>{if(data.toString().includes('FORENSICS_VITE_READY')){clearTimeout(timeout);resolve();}});vite.once('exit',code=>reject(new Error(`Vite exited ${code}`)));});
  if (mode === 'prefix94') {
    validatePrefix94List();
    await run('d-prefix-94', prefix94.filters, undefined, 'on');
  } else if (mode === 'remaining') {
    for (let i = 2; i < copied.length; i++) {
      await run(`remaining-c-${String(i + 1).padStart(2,'0')}-${path.basename(specs[i],'.spec.ts')}`,[copied[i]],undefined,[4,11].includes(i)?'on':'retain-on-failure');
    }
  } else {
    // Collection-only listing records the actual runner sequence before browser work.
    const listing=execFileSync(process.execPath,[cli,'test','--config','playwright.config.ts',...specs,'--workers=1','--retries=0','--list'],{cwd:web,encoding:'utf8',env});
    writeFileSync(path.join(root,'original-collection.txt'),listing);
    for(let i=1;i<=3;i++) await run(`a-r5-${i}`,[copied[4]],'universal coarse tablet chrome boundary','on');
    await run('a-r1-1',[copied[11]],'a second client pulls sequential changes and remote deletion removes local pages','on');
    await run('b-prefix-05',copied.slice(0,5));
    // Historical stdout and --list are alphabetical. Cover every predecessor of
    // each target without executing the trailing spec or a complete Product gate.
    await run('b-actual-prefix-07',actualOrder.slice(0,7));
    await run('b-r1-actual-prefix-13',actualOrder.slice(0,13));
    for(let i=0;i<copied.length;i++) await run(`c-${String(i+1).padStart(2,'0')}-${path.basename(specs[i],'.spec.ts')}`,[copied[i]],undefined,[4,11].includes(i)?'on':'retain-on-failure');
  }
} catch(error) {
  stopped=true;writeFileSync(path.join(root,'orchestration-error.json'),JSON.stringify({time:new Date().toISOString(),error:String(error),stack:error.stack},null,2));console.error(error);
} finally {
  if(current) current.kill('SIGINT');
  if(vite.connected) {vite.send('stop');await new Promise(resolve=>vite.once('exit',resolve));}
  writeFileSync(monitorStop,'stop');
  await new Promise(resolve=>monitor.exitCode!==null?resolve():monitor.once('exit',resolve));
  await new Promise(resolve=>systemMemoryMonitor.exitCode!==null?resolve():systemMemoryMonitor.once('exit',resolve));
  writeFileSync(path.join(root,'orchestration-end.json'),JSON.stringify({ended:new Date().toISOString(),stopped,raw,results:results.length,vitePid:vite.pid,viteExitCode:vite.exitCode,monitorPid:monitor.pid,monitorExitCode:monitor.exitCode,systemMemoryMonitorPid:systemMemoryMonitor.pid,systemMemoryMonitorExitCode:systemMemoryMonitor.exitCode,systemMemoryMonitorError},null,2));
}
