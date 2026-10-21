import fs from 'node:fs';
const root='C:/Users/31250/Work/Eotion';
const dir='C:/Users/31250/AppData/Local/Temp/eotion-p116-resume-dfbb4269eb4c4a6794279c34f3d9ba5d/sync-startup-probe';
fs.mkdirSync(dir,{recursive:true});
const pw=root+'/apps/web/node_modules/@playwright/test/index.mjs';
let source=fs.readFileSync(root+'/apps/web/tests/product-sync.spec.ts','utf8').replace(/\r\n/g,'\n').replace("from '@playwright/test'",`from '${pw}'`);
source=source.replace("async function mockApi(page: Page, server: Server = { pages: [], blocks: [] }) {","async function mockApi(page: Page, server: Server = { pages: [], blocks: [] }) {\n  await installStartupDiagnostics(page)");
source+=String.raw`
// TEMP observational instrumentation; assertions and application behavior remain unchanged.
const diagnosticPages = new Map<Page, {label:string; started:number; entries:any[]}>()
async function installStartupDiagnostics(page: Page) {
  if(diagnosticPages.has(page)) return
  const data={label:'page-'+diagnosticPages.size,started:Date.now(),entries:[] as any[]}
  diagnosticPages.set(page,data)
  const row=(kind:string,detail:any)=>data.entries.push({at:new Date().toISOString(),elapsedMs:Date.now()-data.started,kind,...detail})
  page.on('pageerror',error=>row('pageerror',{name:error.name,message:error.message,stack:error.stack}))
  page.on('console',message=>row('console',{type:message.type(),text:message.text(),location:message.location()}))
  page.on('request',request=>{if(['document','script','stylesheet','fetch','xhr'].includes(request.resourceType()))row('request',{url:request.url(),method:request.method(),resourceType:request.resourceType()})})
  page.on('response',response=>{const request=response.request();if(response.status()>=400||['document','script','stylesheet','fetch','xhr'].includes(request.resourceType()))row('response',{url:response.url(),status:response.status(),resourceType:request.resourceType()})})
  page.on('requestfinished',request=>{if(['document','script','stylesheet','fetch','xhr'].includes(request.resourceType()))row('requestfinished',{url:request.url(),resourceType:request.resourceType(),timing:request.timing()})})
  page.on('requestfailed',request=>row('requestfailed',{url:request.url(),resourceType:request.resourceType(),failure:request.failure(),timing:request.timing()}))
  page.on('domcontentloaded',()=>row('domcontentloaded',{url:page.url()}))
  page.on('load',()=>row('load',{url:page.url()}))
  page.on('crash',()=>row('crash',{url:page.url()}))
  await page.addInitScript(()=>{
    (window as any).__syncStartupProbe={initialReadyState:document.readyState,initialAt:performance.now(),errors:[] as any[]}
    window.addEventListener('error',event=>(window as any).__syncStartupProbe.errors.push({kind:'error',message:event.message,filename:event.filename,line:event.lineno,at:performance.now()}))
    window.addEventListener('unhandledrejection',event=>(window as any).__syncStartupProbe.errors.push({kind:'unhandledrejection',reason:String(event.reason?.stack??event.reason),at:performance.now()}))
  })
}
test.afterEach(async ({},info)=>{
  const fs=await import('node:fs/promises')
  for(const [page,data] of diagnosticPages){
    const prefix=info.outputPath(data.label)
    await fs.writeFile(prefix+'-events.json',JSON.stringify(data,null,2))
    if(!page.isClosed()){
      const snapshot=await page.evaluate(()=>({url:location.href,readyState:document.readyState,title:document.title,app:document.querySelector('#app')?.outerHTML,body:document.body?.innerText,theme:document.documentElement.dataset.theme,probe:(window as any).__syncStartupProbe,resources:performance.getEntriesByType('resource').map(entry=>entry.toJSON()),navigation:performance.getEntriesByType('navigation').map(entry=>entry.toJSON())})).catch(error=>({snapshotError:String(error)}))
      await fs.writeFile(prefix+'-snapshot.json',JSON.stringify(snapshot,null,2))
      if(info.status!==info.expectedStatus){await fs.writeFile(prefix+'-failure.html',await page.content().catch(error=>String(error)));await page.screenshot({path:prefix+'-failure.png',fullPage:true}).catch(()=>{})}
    }
  }
  diagnosticPages.clear()
})
`;
fs.writeFileSync(dir+'/product-sync.spec.ts',source);
fs.writeFileSync(dir+'/package.json',JSON.stringify({type:'module'}));
fs.writeFileSync(dir+'/playwright.config.ts',`import {defineConfig} from '${pw}';\nexport default defineConfig({testDir:'.',testMatch:'product-sync.spec.ts',workers:1,retries:0,timeout:30000,preserveOutput:'always',use:{baseURL:'http://127.0.0.1:7173',browserName:'chromium',channel:'chrome',trace:'on',screenshot:'only-on-failure'},reporter:[['list'],['json',{outputFile:process.env.EOTION_PROBE_RESULTS}]],outputDir:process.env.EOTION_PROBE_OUTPUT});\n`);
fs.writeFileSync(dir+'/plan.json',JSON.stringify({sourceRoot:root,sourceSpec:'apps/web/tests/product-sync.spec.ts',purpose:'First startup failure at unchanged assertion line 494; original case and complete sync file; no retries or timeout changes',steps:[{name:'current-single',grep:'^a second client pulls sequential changes and remote deletion removes local pages$'},{name:'current-full-sync'},{name:'baseline-single',condition:'Only after no current reproduction and baseline server/source identity confirmed'},{name:'baseline-full-sync',condition:'Same baseline identity and environment'}],browserExecution:'Await root authorization; not started'},null,2));
console.log(dir);
