import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
let sent;
const server=await createAtlasServer({env:{GROQ_API_KEY:'test-only-key'},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);if(sent.messages.at(-1).content==='falla')return {ok:false,status:429};return {ok:true,json:async()=>({choices:[{message:{content:'Resumen: <img src=x onerror=alert(1)> dato de prueba'}}]})};}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#assistantOpen').waitFor();
  await page.locator('#globalSearch').fill('3.1.4.1.1-1');
  await page.waitForFunction(()=>document.querySelector('#detail .detailCode')?.textContent==='3.1.4.1.1-1');
  await page.locator('#assistantOpen').click();await page.locator('#assistantQuestion').fill('Resume esta ficha');await page.locator('#assistantSend').click();
  await page.locator('#assistantMessages .assistant').waitFor();assert(sent.messages[0].content.includes('Sala de Espera'));
  assert.equal(await page.locator('#assistantMessages img').count(),0);assert((await page.locator('#assistantMessages').innerText()).includes('<img'));
  await page.locator('#assistantClear').click();assert.equal(await page.locator('#assistantMessages p').count(),0);
  await page.locator('#assistantQuestion').fill('falla');await page.locator('#assistantSend').click();await page.locator('#assistantMessages .error').waitFor();assert.match(await page.locator('#assistantMessages .error').innerText(),/límite/);
  const bounds=await page.locator('#assistantDialog').boundingBox();assert(bounds.width<=viewport.width);assert(bounds.x>=0);
  await page.locator('#assistantClose').click();assert(!(await page.locator('#assistantDialog').isVisible()));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Groq chat Chromium desktop/mobile: room context, plain-text rendering, reset, provider error and dialog layout passed (mock provider)');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
