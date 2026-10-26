const endpoint='https://api.groq.com/openai/v1/chat/completions';
export function createGroq(env,fetchImpl=fetch,{now=Date.now}={}){
 let requests=0;const attempts=[];
 const key=(env.GROQ_API_KEY||'').trim();
 const windowSeconds=Number(env.GROQ_WINDOW_SECONDS||60);
 const prune=()=>{while(attempts.length&&attempts[0]<=now()-windowSeconds*1000)attempts.shift();};
 const model=(env.GROQ_MODEL||'').trim()||'openai/gpt-oss-20b';
 const max=Number(env.GROQ_MAX_REQUESTS||60),tokens=Number(env.GROQ_MAX_TOKENS||1024);
 if(!Number.isInteger(windowSeconds)||windowSeconds<1||windowSeconds>86400)throw Error('Ventana Groq inválida');
 if(!Number.isInteger(max)||max<1||!Number.isInteger(tokens)||tokens<1||tokens>8192)throw Error('Límites Groq inválidos');
 const errorFor=async res=>{
  let code;try{const value=await res.json();code=value.error?.code;}catch{}
  const missingModel=['model_not_found','model_not_available','model_decommissioned'].includes(code);
  const message=res.status===429?'Groq alcanzó su límite de uso. Reintenta más tarde.':res.status===401?'La credencial Groq no fue aceptada. Revisa la configuración del backend.':missingModel?'El modelo configurado en GROQ_MODEL no está disponible para esta cuenta. Consulta /api/groq/models y configura un modelo de chat habilitado en Render.':res.status===404?'Groq devolvió HTTP 404. Comprueba GROQ_MODEL y los modelos accesibles en /api/groq/models.':'Groq rechazó la consulta (HTTP '+res.status+').';
  return Object.assign(Error(message),{status:res.status===429?429:502,code:res.status===429?'groq_rate_limit':res.status===401?'groq_credentials':missingModel?'groq_model_unavailable':'groq_provider_error',...(res.status===429?{retryAfterSeconds:Math.min(3600,Math.max(1,Math.ceil(Number(res.headers?.get('retry-after'))||60)))}:{})});
 };
 return {async models(){
  if(!key)throw Object.assign(Error('Configura GROQ_API_KEY en el backend.'),{status:503});
  let res;try{res=await fetchImpl('https://api.groq.com/openai/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Object.assign(Error('No se pudieron consultar los modelos de Groq.'),{status:502});}
  if(!res.ok)throw await errorFor(res);
  let value;try{value=await res.json();}catch{}
  if(!Array.isArray(value?.data))throw Object.assign(Error('Listado de modelos de Groq inválido.'),{status:502});
  const models=value.data.map(m=>m.id).filter(id=>typeof id==='string');
  return {configuredModel:model,listed:models.includes(model),models};
 },async chat(messages){
  if(!key)throw Object.assign(Error('Configura GROQ_API_KEY en el backend.'),{status:503});
  prune();if(attempts.length>=max){const retryAfterSeconds=Math.max(1,Math.ceil((attempts[0]+windowSeconds*1000-now())/1000));throw Object.assign(Error('Límite temporal de consultas. Reintenta en '+retryAfterSeconds+' segundos.'),{status:429,code:'atlas_rate_limit',retryAfterSeconds});}
  attempts.push(now());requests++;
  let res;
  try{res=await fetchImpl(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:tokens}),signal:AbortSignal.timeout(30000),redirect:'error'});}catch{throw Object.assign(Error('No se pudo conectar con Groq. Reintenta más tarde.'),{status:502});}
  if(!res.ok)throw await errorFor(res);
  let answer;try{answer=(await res.json()).choices?.[0]?.message?.content;}catch{}
  if(typeof answer!=='string'||!answer.trim())throw Object.assign(Error('Groq devolvió una respuesta vacía.'),{status:502});
  return {answer,model};
 },usage:()=>({requests,max}),status:()=>{prune();return {configured:!!key,model,windowSeconds,remaining:Math.max(0,max-attempts.length),retryAfterSeconds:attempts.length>=max?Math.max(1,Math.ceil((attempts[0]+windowSeconds*1000-now())/1000)):0};}};
}
