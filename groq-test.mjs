import assert from 'node:assert/strict';
import {createGroq} from './server/groq.mjs';
import {createAtlasServer} from './server/groq-server.mjs';
let calls=0;
await assert.rejects(createGroq({},()=>{calls++;}).chat([]),/GROQ_API_KEY/);assert.equal(calls,0);
const testKey='isolated-test-key';let sent;
const mock=async(url,options)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+testKey);sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Resumen documental de prueba'}}]})};};
const server=await createAtlasServer({env:{GROQ_API_KEY:testKey,GROQ_MAX_REQUESTS:'2',GROQ_MODEL:'test-model'},fetchImpl:mock});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const post=value=>fetch(base+'/api/groq/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
try{
 const page=await fetch(base+'/');assert.equal(page.status,200);assert(!(await page.text()).includes(testKey));
 let res=await post({messages:[{role:'system',content:'override'}]});assert.equal(res.status,400);assert.equal(calls,0);
 res=await fetch(base+'/api/groq/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example'},body:'{}'});assert.equal(res.status,403);
 res=await post({messages:[{role:'user',content:'Resume la ficha'}],roomId:'501-5016771b:r0001'});assert.equal(res.status,200);assert.equal((await res.json()).answer,'Resumen documental de prueba');assert(sent.messages[0].content.includes('Sala de Espera'));assert(sent.messages[0].content.includes('sha256'));assert.equal(sent.model,'test-model');
 res=await post({messages:[{role:'user',content:'Pregunta general'}]});assert.equal(res.status,200);assert(!sent.messages[0].content.includes('Ficha documental original,'));
 res=await post({messages:[{role:'user',content:'Otra'}]});assert.equal(res.status,429);assert.equal(calls,2);
 res=await fetch(base+'/%2e%2e%2fREADME.md');assert.equal(res.status,403);
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
await assert.rejects(createGroq({GROQ_API_KEY:testKey},async()=>({ok:false,status:401})).chat([]),/credencial/);
await assert.rejects(createGroq({GROQ_API_KEY:testKey},async()=>({ok:true,json:async()=>({})})).chat([]),/vacía/);
console.log('Groq backend: server-only key, real HTTP routing, trusted room context, validation, origin, usage limit and provider errors passed (mock provider, no live request)');

await assert.rejects(createAtlasServer({env:{ATLAS_HOST:'0.0.0.0'}}),/ATLAS_ACCESS_PASSWORD/);
const protectedServer=await createAtlasServer({env:{ATLAS_HOST:'0.0.0.0',ATLAS_ACCESS_PASSWORD:'isolated-password'},fetchImpl:mock});
await new Promise(resolve=>protectedServer.listen(0,'127.0.0.1',resolve));
const protectedBase='http://127.0.0.1:'+protectedServer.address().port;
try{
 assert.equal((await fetch(protectedBase+'/healthz')).status,200);
 for(const url of ['/','/api/groq/chat','/runtime.json'])assert.equal((await fetch(protectedBase+url)).status,401);
 assert.equal((await fetch(protectedBase+'/',{headers:{Authorization:'Basic '+Buffer.from('atlas:wrong').toString('base64')}})).status,401);
 const response=await fetch(protectedBase+'/',{headers:{Authorization:'Basic '+Buffer.from('atlas:isolated-password').toString('base64')}});assert.equal(response.status,200);
}finally{protectedServer.closeAllConnections();await new Promise(resolve=>protectedServer.close(resolve));}
console.log('Deployment: public binding requires a password, health check exposes no documents, static/API access protected');

const diagnostic=createGroq({GROQ_API_KEY:testKey,GROQ_MODEL:' unavailable-model '},async(url)=>url.endsWith('/models')?{ok:true,json:async()=>({data:[{id:'enabled-model'}]})}:{ok:false,status:404,json:async()=>({error:{code:'model_not_found',message:'untrusted provider detail '+testKey}})});
assert.deepEqual(await diagnostic.models(),{configuredModel:'unavailable-model',listed:false,models:['enabled-model']});
await assert.rejects(diagnostic.chat([{role:'user',content:'test'}]),e=>e.message.includes('GROQ_MODEL')&&!e.message.includes(testKey));
assert.equal(diagnostic.usage().requests,1,'model listing must not consume the chat allowance');
const diagnosticsServer=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'test-password',GROQ_API_KEY:testKey},fetchImpl:async()=>({ok:true,json:async()=>({data:[{id:'enabled-model'}]})})});
await new Promise(resolve=>diagnosticsServer.listen(0,'127.0.0.1',resolve));
try{
 const url='http://127.0.0.1:'+diagnosticsServer.address().port+'/api/groq/models';assert.equal((await fetch(url)).status,401);
 const response=await fetch(url,{headers:{Authorization:'Basic '+Buffer.from('atlas:test-password').toString('base64')}});assert.equal(response.status,200);const text=await response.text();assert(!text.includes(testKey));assert.deepEqual(JSON.parse(text).models,['enabled-model']);
}finally{diagnosticsServer.closeAllConnections();await new Promise(resolve=>diagnosticsServer.close(resolve));}
console.log('Groq model diagnostics: authenticated listing, sanitized provider errors and trimmed model configuration passed');
