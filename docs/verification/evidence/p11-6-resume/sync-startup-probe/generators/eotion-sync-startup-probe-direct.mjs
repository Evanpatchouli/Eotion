import fs from 'node:fs';
const root='C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/sync-startup-probe';const dir=root+'/direct';fs.mkdirSync(dir,{recursive:true});
for(const name of ['playwright.config.ts','package.json','product-sync.spec.ts','plan.json'])fs.copyFileSync(root+'/'+name,dir+'/'+name);
let runner=fs.readFileSync(root+'/run.ps1','utf8').replaceAll(root,dir).replace("@('exec','playwright','test'","@('C:/Users/31250/Work/Eotion/apps/web/node_modules/@playwright/test/cli.js','test'").replace("executable = 'pnpm.cmd'","executable = 'node'").replace('& pnpm.cmd @probeArguments','& node @probeArguments');
fs.writeFileSync(dir+'/run.ps1',runner);
