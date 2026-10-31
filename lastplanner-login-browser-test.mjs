import assert from 'node:assert/strict';
import {createAtlasServer} from './server/groq-server.mjs';
import {cloudFixture,QA_ACTOR,tokenFor} from './test-support/lastplanner-cloud.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const cloud=await cloudFixture();
const accounts={
 'editor@example.test':{...QA_ACTOR,email:'editor@example.test',password:'isolated-editor'},
 'lector@example.test':{id:'22222222-2222-4222-8222-222222222222',email:'lector@example.test',role:'lector',password:'isolated-reader'},
 'limitado@example.test':{id:'33333333-3333-4333-8333-333333333333',email:'limitado@example.test',role:'editor',permissions:['attendance'],password:'isolated-limited'},
};
const fetchImpl=async(url,options={})=>{
 const parsed=new URL(url);
 if(parsed.pathname==='/auth/v1/token'){
  const input=JSON.parse(options.body),account=accounts[input.email];
  if(!account||input.password!==account.password)return Response.json({error:'invalid_grant'},{status:400});
  return Response.json({access_token:tokenFor(account),refresh_token:'isolated-refresh',expires_in:3600,user:{id:account.id,email:account.email,app_metadata:{campo_role:account.role,...(account.permissions?{lastplanner_permissions:account.permissions}:{})}}});
 }
 if(parsed.pathname==='/auth/v1/logout')return Response.json({ok:true});
 if(parsed.pathname==='/rest/v1/atlas_campo')return Response.json([]);
 return cloud.fetchImpl(url,options);
};
const server=await createAtlasServer({env:cloud.env,fetchImpl});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block',httpCredentials:{username:'atlas',password:cloud.env.ATLAS_ACCESS_PASSWORD}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(base+'/?nivel=N-1');await page.locator('#assistantOpen').waitFor();
  await page.locator('[data-module=work]:visible').first().click();await page.locator('[data-work-tab=lastplanner]').first().click();await page.locator('.lpCycleNav').waitFor();
  await page.locator('[data-cycle=view][data-id=planificacion]').click();
  const create=()=>page.locator('.lpCycleActions [data-cycle=new]'),account=()=>page.locator('#nubeDialog'),activity=()=>page.locator('.lpCycleDialog');
  assert.equal(await page.evaluate(()=>localStorage.getItem('atlas-nube-sesion')),null);
  assert.match(await page.locator('.lpAccessNotice').innerText(),/Inicia sesión/);
  assert.equal(await create().isDisabled(),false,'signed-out creation must explain and open login');
  await create().click();await page.locator('#nubeLogin').waitFor();assert.match(await account().locator('.nubeContexto').innerText(),/Nueva actividad/);
  assert.equal(await activity().evaluate(e=>e.open),false,'no unauthenticated activity form');
  await account().locator('[data-cerrar]').click();assert.equal(await activity().evaluate(e=>e.open),false,'cancelled login must not create anything');
  await create().click();await page.locator('#nubeLogin [name=username]').fill('editor@example.test');await page.locator('#nubeLogin [name=password]').fill('wrong-password');await page.locator('#nubeLogin .primary').click();
  await page.waitForFunction(()=>document.querySelector('#nubeError')?.textContent.includes('incorrectos'));assert.equal(await activity().evaluate(e=>e.open),false);
  await page.locator('#nubeLogin [name=password]').fill(accounts['editor@example.test'].password);await page.locator('#nubeLogin .primary').click();
  await page.locator('.lpCycleDialog[open] [name=actividad]').waitFor();assert.equal(await account().evaluate(e=>e.open),false);assert.match(await activity().locator('footer').innerText(),/editor@example.test/);
  await activity().locator('[name=actividad]').fill('Borrador tras iniciar sesión QA '+width);await activity().locator('[name=responsable]').selectOption({label:'Quijote · Pintura'});await activity().locator('[data-go="2"]').click();await activity().locator('[name=cantidad]').fill('10');await activity().locator('[type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('.lpCycleDialog').open);
  const saved=await page.evaluate(async width=>{const {readWorkflow}=await import('./lastplanner-cycle-store.mjs');return (await readWorkflow()).actividades.find(a=>a.actividad==='Borrador tras iniciar sesión QA '+width);},width);
  assert.ok(saved);assert.equal(saved.autor,'editor@example.test');assert.equal(saved.historial[0].actor,QA_ACTOR.id);
  await page.locator('#nubeOpen').click();await account().locator('[data-ahora]').click();await page.locator('#nubeOpen[data-fase=listo]').waitFor();assert.ok((await cloud.rows()).some(r=>r.id===saved.id));
  await account().locator('[data-salir]').click();await page.locator('#nubeLogin').waitFor();await account().locator('[data-cerrar]').click();
  await create().click();await page.locator('#nubeLogin [name=username]').fill('lector@example.test');await page.locator('#nubeLogin [name=password]').fill(accounts['lector@example.test'].password);await page.locator('#nubeLogin .primary').click();
  await page.locator('#nubeDialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.lpAccessNotice')?.textContent.includes('solo lectura'));
  assert.ok(await create().isDisabled());assert.equal(await activity().evaluate(e=>e.open),false);
  const forbidden=await page.evaluate(async()=>{const session=JSON.parse(localStorage.getItem('atlas-nube-sesion'));return (await fetch('/api/lastplanner/records',{method:'POST',headers:{'X-Campo-Session':session.token,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),action:'draft',ops:[]})})).status;});assert.equal(forbidden,403);
  await page.locator('.lpAccessNotice [data-cycle=login]').click();await account().locator('[data-salir]').click();await page.locator('#nubeLogin [name=username]').fill('limitado@example.test');await page.locator('#nubeLogin [name=password]').fill(accounts['limitado@example.test'].password);await page.locator('#nubeLogin .primary').click();
  await account().locator('[data-cerrar]').click();await page.waitForFunction(()=>document.querySelector('.lpAccessNotice')?.textContent.includes('no tiene permiso'));
  assert.ok(await create().isDisabled());assert.deepEqual(errors,[]);
  await context.close();console.log('✓ '+width+' px: sin sesión, cancelación, error de contraseña, login real, formulario automático, guardado y nube; lector/limitado protegidos');
 }
 console.log('Last Planner login: passed');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await cloud.close();}
