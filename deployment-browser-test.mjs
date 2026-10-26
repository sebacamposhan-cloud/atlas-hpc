import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-test-password'}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({httpCredentials:{username:'atlas',password:'isolated-test-password'}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#globalSearch').waitFor();await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 assert(await page.evaluate(()=>!!navigator.serviceWorker.controller));
 const inspect=async()=>{await page.locator('#globalSearch').fill('8.2.4.2.16-1');await page.waitForFunction(()=>document.querySelector('#rombo')?.complete&&document.querySelector('#rombo')?.naturalWidth>0);assert.equal(await page.locator('#rombo').getAttribute('src'),'/assets/501-5016771b/r0037.png');
 await page.evaluate(async()=>{const viewer=await import('./viewer.mjs');viewer.flushView();viewer.updateTiles();});
 const images=await page.locator('#background image,#detailImage image').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));assert(images.length);for(const url of images)await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();},url);};
 await inspect();
 await page.waitForFunction(async()=>{for(const name of await caches.keys())if((await caches.open(name)).match&&await (await caches.open(name)).match(location.origin+'/assets/501-5016771b/r0037.png'))return true;return false;});
 await context.setOffline(true);await page.reload();await page.locator('#globalSearch').waitFor();await inspect();assert.deepEqual(errors,[]);
 console.log('Actual Node server + password + controlling service worker: screenshot room PNG, overview and visible tiles decoded online and after offline reload; no page errors. Local reproduction, not a remote Render claim.');await context.close();
 const recovery=await browser.newContext({serviceWorkers:'block',httpCredentials:{username:'atlas',password:'isolated-test-password'}}),recoveryPage=await recovery.newPage();
 await recoveryPage.route('**/assets/501-5016771b/r0037.png',route=>route.fulfill({status:404,body:'isolated missing image fixture'}));
 await recoveryPage.goto(base);await recoveryPage.locator('#globalSearch').fill('8.2.4.2.16-1');
 await recoveryPage.waitForFunction(()=>document.querySelector('#rombo')?.src.startsWith('data:image/png')&&document.querySelector('#rombo').naturalWidth>0,{},{timeout:60000});
 await recoveryPage.locator('#diamondCatalogOpen').click();await recoveryPage.locator('#diamondSearch').fill('8.2.4.2.16-1');await recoveryPage.locator('[data-diamond-open="501-5016771b:r0037"]').click();
 await recoveryPage.waitForFunction(()=>document.querySelector('#diamondDetail img')?.src.startsWith('data:image/png')&&document.querySelector('#diamondDetail img').naturalWidth>0,{},{timeout:60000});
 console.log('Missing generated PNG: exact source PDF region recovered and decoded in room detail and diamond catalogue.');await recovery.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
