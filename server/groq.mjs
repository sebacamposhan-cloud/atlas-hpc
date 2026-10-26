const endpoint='https://api.groq.com/openai/v1/chat/completions';
export function createGroq(env,fetchImpl=fetch){
 let requests=0;
 const model=(env.GROQ_MODEL||'llama-3.3-70b-versatile').trim();
 const max=Number(env.GROQ_MAX_REQUESTS||60),tokens=Number(env.GROQ_MAX_TOKENS||1024);
 if(!Number.isInteger(max)||max<1||!Number.isInteger(tokens)||tokens<1||tokens>8192)throw Error('Límites Groq inválidos');
 const errorFor=async res=>{
  let code;try{const value=await res.json();code=value.error?.code;}catch{}
  const missingModel=['model_not_found','model_not_available','model_decommissioned'].includes(code);
  const message=res.status===429?'Groq alcanzó su límite de uso. Reintenta más tarde.':res.status===401?'La credencial Groq no fue aceptada. Revisa la configuración del backend.':missingModel?'El modelo configurado en GROQ_MODEL no está disponible para esta cuenta. Consulta /api/groq/models y configura un modelo de chat habilitado en Render.':res.status===404?'Groq devolvió HTTP 404. Comprueba GROQ_MODEL y los modelos accesibles en /api/groq/models.':'Groq rechazó la consulta (HTTP '+res.status+').';
  return Object.assign(Error(message),{status:res.status===429?429:502});
 };
 return {async models(){
  if(!env.GROQ_API_KEY)throw Object.assign(Error('Configura GROQ_API_KEY en el backend.'),{status:503});
  let res;try{res=await fetchImpl('https://api.groq.com/openai/v1/models',{headers:{Authorization:'Bearer '+env.GROQ_API_KEY},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Object.assign(Error('No se pudieron consultar los modelos de Groq.'),{status:502});}
  if(!res.ok)throw await errorFor(res);
  let value;try{value=await res.json();}catch{}
  if(!Array.isArray(value?.data))throw Object.assign(Error('Listado de modelos de Groq inválido.'),{status:502});
  const models=value.data.map(m=>m.id).filter(id=>typeof id==='string');
  return {configuredModel:model,listed:models.includes(model),models};
 },async chat(messages){
  if(!env.GROQ_API_KEY)throw Object.assign(Error('Configura GROQ_API_KEY en el backend.'),{status:503});
  if(requests>=max)throw Object.assign(Error('Se alcanzó el límite de consultas de esta instancia.'),{status:429});
  requests++;
  let res;
  try{res=await fetchImpl(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:tokens}),signal:AbortSignal.timeout(30000),redirect:'error'});}catch{throw Object.assign(Error('No se pudo conectar con Groq. Reintenta más tarde.'),{status:502});}
  if(!res.ok)throw await errorFor(res);
  let answer;try{answer=(await res.json()).choices?.[0]?.message?.content;}catch{}
  if(typeof answer!=='string'||!answer.trim())throw Object.assign(Error('Groq devolvió una respuesta vacía.'),{status:502});
  return {answer,model};
 },usage:()=>({requests,max})};
}
