// Run only in the backend environment; prints model IDs, never credentials.
if(!process.env.GROQ_API_KEY)throw Error('Configura GROQ_API_KEY en los secretos del backend.');
const res=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY},signal:AbortSignal.timeout(15000),redirect:'error'});
if(!res.ok)throw Error('Groq HTTP '+res.status);
const value=await res.json();console.log(JSON.stringify({models:value.data.map(m=>m.id)},null,2));
