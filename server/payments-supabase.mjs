import {paymentContractors} from './payment-contractors.mjs';
export function createSupabasePayments(env,fetchImpl=fetch){
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,''),key=env.SUPABASE_ANON_KEY;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key)throw Error('Configura SUPABASE_URL y SUPABASE_ANON_KEY del proyecto.');
 const attempts=new Map();
 return async(req,res,url)=>{
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 try{
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'Origen no autorizado'});
 const input=async()=>{if(!req.headers['content-type']?.startsWith('application/json'))throw Error();let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw Error();}return JSON.parse(raw);};
 const call=async(route,token,body,method)=>{const response=await fetchImpl(base+route,{method:method||(body?'POST':'GET'),headers:{apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const data=await response.json().catch(()=>null);return {status:response.status,ok:response.ok,data};};
 if(url.pathname==='/api/payments/login'&&req.method==='POST'){
 const now=Date.now();for(const [ip,v]of attempts)if(v.until<now)attempts.delete(ip);const ip=req.socket.remoteAddress,limit=attempts.get(ip)||{n:0,until:now+900000};if(limit.n>=10)return send(429,{error:'Demasiados intentos. Reintenta en 15 minutos.'});limit.n++;attempts.set(ip,limit);
 const body=await input();if(typeof body.username!=='string'||typeof body.password!=='string'||body.username.length>254||body.password.length>1024)return send(400,{error:'Credenciales inválidas'});
 const result=await call('/auth/v1/token?grant_type=password',null,{email:body.username,password:body.password});if(!result.ok)return send(401,{error:'Correo o contraseña incorrectos'});
 const role=result.data.user?.app_metadata?.payments_role;if(!['editor','approver'].includes(role))return send(403,{error:'Esta cuenta no tiene acceso a Estados de pago'});
 return send(200,{token:result.data.access_token,user:{username:result.data.user.email,role}});
 }
 const token=req.headers['x-payment-session'];if(typeof token!=='string'||token.length>8192)return send(401,{error:'Inicia sesión en Estados de pago'});
 const identity=await call('/auth/v1/user',token);if(!identity.ok)return send(401,{error:'Tu sesión terminó. Vuelve a entrar'});const role=identity.data.app_metadata?.payments_role;if(!['editor','approver'].includes(role))return send(403,{error:'Cuenta sin autorización para pagos'});
 if(url.pathname==='/api/payments/logout'&&req.method==='POST'){const result=await call('/auth/v1/logout',token,{},'POST');return send(result.ok?200:502,result.ok?{ok:true}:{error:'No se pudo cerrar la sesión. Reintenta.'});}
 if(url.pathname==='/api/payments/prices'&&req.method==='GET'){
 const items=[];for(let offset=0;offset<100000;offset+=1000){const result=await call('/rest/v1/atlas_price_items?select=data&order=code.asc&limit=1000&offset='+offset,token);if(!result.ok)return send(503,{error:'Falta cargar el catálogo compartido de precios en Supabase'});items.push(...result.data.map(row=>row.data));if(result.data.length<1000)break;}if(!items.length)return send(503,{error:'El catálogo compartido está vacío. Carga Rev01 en Supabase'});return send(200,{items});
 }
 if(url.pathname==='/api/payments'&&req.method==='GET'){const result=await call('/rest/v1/atlas_payments?select=data&order=updated_at.desc',token);if(!result.ok)return send(503,{error:'No se pudo consultar pagos. Revisa la configuración de Supabase.'});return send(200,{user:{username:identity.data.email,role},contractors:paymentContractors,payments:result.data.map(row=>row.data)});}
 if(url.pathname==='/api/payments'&&req.method==='POST'){const body=await input();const result=await call('/rest/v1/rpc/save_atlas_payment',token,{payload:body});if(!result.ok)return send(result.data?.code==='40001'?409:400,{error:result.data?.code==='40001'?'El registro cambió; actualiza antes de guardar':'No se pudo guardar: revisa campos, permisos y versión del registro'});return send(200,{payment:result.data});}
 return send(404,{error:'Ruta no disponible'});
 }catch{return send(503,{error:'No se pudo conectar con pagos. Reintenta con conexión.'});}
 };
}
