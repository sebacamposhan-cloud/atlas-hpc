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
