import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const oldHTML='<!doctype html><p id="oldVersion">Atlas anterior sin selector</p><script>navigator.serviceWorker.register("/sw.js")</script>';
const hash=b=>createHash('sha256').update(b).digest('hex');
const entry=(url,bytes)=>({url,bytes:Buffer.byteLength(bytes),hash:hash(bytes),pack:'plan',core:true});
const oldRuntime=execFileSync('git',['show','HEAD:dist/sw-runtime.js'],{encoding:'utf8'});
const newRuntime=fs.readFileSync('dist/sw-runtime.js','utf8');
const oldManifest={version:'upgrade-test-old',files:[entry('/index.html',oldHTML)]};
const newManifest={version:'upgrade-test-new',files:['index.html','pisos.js'].map(f=>entry('/'+f,fs.readFileSync('dist/'+f)))};
let fresh=false,browser;
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-upgrade'}}),handler=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',(req,res)=>{
 if(!req.headers.authorization)return handler(req,res);
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/sw.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end('self.ATLAS_OFFLINE='+JSON.stringify(fresh?newManifest:oldManifest)+';\n'+(fresh?newRuntime:oldRuntime));return;}
 if(!fresh&&['/','/index.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(oldHTML);return;}
 return handler(req,res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({httpCredentials:{username:'atlas',password:'isolated-upgrade'}}),page=await context.newPage();
 await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();assert(await page.locator('#oldVersion').count());
 const room=JSON.parse(fs.readFileSync('dist/data.json')).rooms[0],saved=JSON.stringify({[room.id]:{...room,version:2,notes:[...room.notes,'Local correction retained']}});
 await page.evaluate(saved=>{localStorage.setItem('atlas-hpc-web-v1',saved);},saved);
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('atlas-update-sentinel',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put('kept','sentinel');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};r.onerror=reject;}));
 fresh=true;await page.reload();assert(await page.locator('#oldVersion').count(),'normal reload must reproduce stale cached HTML');
 await page.goto(base+'/actualizar.html');await page.waitForFunction(()=>!document.querySelector('#apply').disabled);await page.locator('#apply').click();
 await page.waitForFunction(()=>document.querySelector('.selectorPiso')?.options.length===2);assert.equal(await page.evaluate(()=>localStorage.getItem('atlas-hpc-web-v1')),saved);
 const retained=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('atlas-update-sentinel');r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('sentinel');q.onsuccess=()=>{db.close();resolve(q.result);};};}));assert.equal(retained,'kept');
 await page.locator('#assistantOpen').waitFor();await page.locator('#globalSearch').fill(room.code);await page.waitForFunction(code=>document.querySelector('#detail .detailCode')?.textContent===code,room.code);await page.locator('#editInfo').click();
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('atlas-before-update',{cancelable:true}))),false,'pending correction must prevent reload for update');await page.locator('#closeModal').click();
 assert(await page.evaluate(()=>caches.has('atlas-hpc-offline-upgrade-test-old')),'old offline cache must remain intact');
 assert.equal((await page.request.get(base+'/actualizar.html')).headers()['cache-control'],'no-cache');
 await context.close();console.log('Browser upgrade: reproduced stale normal-tab HTML; recovery page activates new selector while preserving local corrections, IndexedDB and old offline cache');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
