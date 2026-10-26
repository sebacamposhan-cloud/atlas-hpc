const endpoint='https://api.groq.com/openai/v1/chat/completions';
export function createGroq(env,fetchImpl=fetch){
 let requests=0;
 const model=env.GROQ_MODEL||'llama-3.3-70b-versatile';
 const max=Number(env.GROQ_MAX_REQUESTS||60),tokens=Number(env.GROQ_MAX_TOKENS||1024);
 if(!Number.isInteger(max)||max<1||!Number.isInteger(tokens)||tokens<1||tokens>8192)throw Error('Límites Groq inválidos');
 return {async chat(messages){
  if(!env.GROQ_API_KEY)throw Object.assign(Error('Configura GROQ_API_KEY en el backend.'),{status:503});
  if(requests>=max)throw Object.assign(Error('Se alcanzó el límite de consultas de esta instancia.'),{status:429});
  requests++;
  let res;
  try{res=await fetchImpl(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:tokens}),signal:AbortSignal.timeout(30000),redirect:'error'});}catch{throw Object.assign(Error('No se pudo conectar con Groq. Reintenta más tarde.'),{status:502});}
  if(!res.ok)throw Object.assign(Error(res.status===429?'Groq alcanzó su límite de uso. Reintenta más tarde.':res.status===401?'La credencial Groq no fue aceptada. Revisa la configuración del backend.':'Groq rechazó la consulta (HTTP '+res.status+').'),{status:res.status===429?429:502});
  let answer;try{answer=(await res.json()).choices?.[0]?.message?.content;}catch{}
  if(typeof answer!=='string'||!answer.trim())throw Object.assign(Error('Groq devolvió una respuesta vacía.'),{status:502});
  return {answer,model};
 },usage:()=>({requests,max})};
}
