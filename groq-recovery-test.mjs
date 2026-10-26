import assert from 'node:assert/strict';
import {createGroq} from './server/groq.mjs';
import {createAtlasServer} from './server/groq-server.mjs';
let time=10000,calls=0;
const provider=async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer isolated-test-key');return new Response(JSON.stringify({choices:[{message:{content:'Respuesta de prueba'}}]}));};
const groq=createGroq({GROQ_API_KEY:' isolated-test-key ',GROQ_MODEL:' ',GROQ_MAX_REQUESTS:'2',GROQ_WINDOW_SECONDS:'2'},provider,{now:()=>time});
const messages=[{role:'user',content:'Consulta de prueba'}];
assert.equal((await groq.chat(messages)).model,'openai/gpt-oss-20b');await groq.chat(messages);
await assert.rejects(groq.chat(messages),e=>e.code==='atlas_rate_limit'&&e.retryAfterSeconds===2);
time+=1999;await assert.rejects(groq.chat(messages),e=>e.retryAfterSeconds===1);
time++;await groq.chat(messages);assert.equal(calls,3);assert.equal(groq.status().remaining,1);
let failed=true;
const recovery=createGroq({GROQ_API_KEY:'test',GROQ_MAX_REQUESTS:'1'},async()=>{if(failed)throw Error('private upstream detail');return new Response(JSON.stringify({choices:[{message:{content:'Recovered'}}]}));},{now:()=>time});
await assert.rejects(recovery.chat(messages),/conectar/);await assert.rejects(recovery.chat(messages),e=>e.code==='atlas_rate_limit');time+=60000;failed=false;assert.equal((await recovery.chat(messages)).answer,'Recovered');
const limited=createGroq({GROQ_API_KEY:'test'},async()=>new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429,headers:{'Retry-After':'17'}}));
await assert.rejects(limited.chat(messages),e=>e.code==='groq_rate_limit'&&e.retryAfterSeconds===17);
const server=await createAtlasServer({env:{GROQ_API_KEY:'isolated-test-key',GROQ_MAX_REQUESTS:'1',ATLAS_ACCESS_PASSWORD:'isolated-password'},fetchImpl:provider});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,authorization='Basic '+Buffer.from('atlas:isolated-password').toString('base64');
try{
 assert.equal((await fetch(base+'/api/groq/status')).status,401);
 const before=calls,status=await(await fetch(base+'/api/groq/status',{headers:{authorization}})).json();assert.equal(calls,before);assert.equal(status.configured,true);assert(!JSON.stringify(status).includes('isolated-test-key'));
 const post=()=>fetch(base+'/api/groq/chat',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify({messages})});
 assert.equal((await post()).status,200);const blocked=await post();assert.equal(blocked.status,429);assert(Number(blocked.headers.get('retry-after'))>0);assert.equal((await blocked.json()).code,'atlas_rate_limit');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
console.log('Groq recovery: rolling-window expiry without restart, failed-request recovery, usable default, trimmed key, provider Retry-After and authenticated secret-free status passed (mock provider)');
