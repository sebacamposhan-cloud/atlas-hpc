import {calculatePayment} from '../dist/payment-calculation.mjs';
import {createSupabasePayments} from './payments-supabase.mjs';
import {paymentContractors} from './payment-contractors.mjs';
import {scryptSync,randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import path from 'node:path';
export function passwordHash(password,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(password,salt,64).toString('hex');}
export async function createPayments(env){
 if(env.SUPABASE_URL||env.SUPABASE_ANON_KEY)return createSupabasePayments(env);
 const sessions=new Map(),attempts=new Map();let db,users=[];
 if(env.PAYMENTS_DB_PATH&&env.PAYMENTS_USERS_JSON){
  users=JSON.parse(env.PAYMENTS_USERS_JSON);if(!Array.isArray(users)||!users.length||users.some(u=>!u.username||!['editor','approver'].includes(u.role)||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(u.hash))||new Set(users.map(u=>u.username)).size!==users.length)throw Error('Configuración de usuarios de pagos inválida');
  if(!path.isAbsolute(env.PAYMENTS_DB_PATH))throw Error('PAYMENTS_DB_PATH debe ser absoluto');
  if(env.RENDER&&!env.PAYMENTS_DB_PATH.startsWith('/var/data/'))throw Error('En Render los pagos requieren disco persistente montado en /var/data');
  const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(env.PAYMENTS_DB_PATH);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, payment_id TEXT, actor TEXT, at TEXT, data TEXT);');
 }
 return async(req,res,url)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(!db)return send(503,{error:'Estados de pago aún no configurados: se requieren cuentas y almacenamiento permanente.'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'Origen no autorizado'});
  const input=async()=>{if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Se requiere JSON');let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw Error('Solicitud demasiado grande');}return JSON.parse(raw);};
  try{
   const now=Date.now();for(const [k,v] of sessions)if(v.until<now)sessions.delete(k);for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
   if(url.pathname==='/api/payments/login'&&req.method==='POST'){
    const key=req.socket.remoteAddress,limit=attempts.get(key)||{n:0,until:now+900000};if(limit.n>=10)return send(429,{error:'Demasiados intentos. Reintenta en 15 minutos.'});limit.n++;attempts.set(key,limit);
    const body=await input(),user=users.find(u=>u.username===body.username);const hash=user?.hash||'0'.repeat(32)+':'+ '0'.repeat(128);const [salt,expected]=hash.split(':');const actual=scryptSync(String(body.password||'').slice(0,1024),salt,64);
    if(!user||!timingSafeEqual(actual,Buffer.from(expected,'hex')))return send(401,{error:'Usuario o contraseña incorrectos'});
    if(sessions.size>=1000)return send(503,{error:'Sesiones ocupadas. Reintenta después.'});const token=randomBytes(32).toString('hex');sessions.set(token,{username:user.username,role:user.role,until:now+3600000});return send(200,{token,user:{username:user.username,role:user.role}});
   }
   const token=(req.headers['x-payment-session']||''),user=sessions.get(token);if(!user)return send(401,{error:'Inicia sesión en Estados de pago'});
   if(url.pathname==='/api/payments/logout'&&req.method==='POST'){sessions.delete(token);return send(200,{ok:true});}
   if(url.pathname==='/api/payments'&&req.method==='GET')return send(200,{user:{username:user.username,role:user.role},contractors:paymentContractors,payments:db.prepare('SELECT data FROM payments ORDER BY rowid DESC').all().map(r=>JSON.parse(r.data))});
   if(url.pathname==='/api/payments'&&req.method==='POST'){
    const b=await input();const text=(v,max=500)=>typeof v==='string'&&v.trim()&&v.length<=max;
    if(!text(b.contractor)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.period)||!Array.isArray(b.items)||!b.items.length||b.items.length>100||b.items.some(i=>!text(i.description)||!Number.isSafeInteger(i.amount)||i.amount<0)||!Number.isSafeInteger(b.retention)||b.retention<0||!['Borrador','En revisión','Aprobado','Rechazado'].includes(b.status))return send(400,{error:'Revisa contratista, período, partidas, montos enteros CLP, retención y estado'});
    const old=b.id?db.prepare('SELECT data FROM payments WHERE id=?').get(b.id):null;if(b.id&&!old)return send(404,{error:'Estado de pago no encontrado'});const previous=old?JSON.parse(old.data):null;
    if((b.status==='Aprobado'||previous?.status==='Aprobado')&&user.role!=='approver')return send(403,{error:'Se requiere un usuario aprobador'});
    if(b.retentionPercent!=null){const calc=calculatePayment(b.items,b.retentionPercent);if(calc.retention!==b.retention||calc.items.some((i,n)=>i.amount!==b.items[n].amount))return send(400,{error:'Cálculo de pago inconsistente'});}
    const total=b.items.reduce((n,i)=>n+i.amount,0);if(!Number.isSafeInteger(total)||b.retention>total)return send(400,{error:'Retención o monto total inválido'});
    const record={id:b.id||randomUUID(),version:(previous?.version||0)+1,contractor:b.contractor.trim(),period:b.period,items:b.items.map(i=>({...i,description:i.description.trim(),amount:i.amount})),amount:total,retention:b.retention,...(b.retentionPercent!=null?{retentionPercent:b.retentionPercent}:{}),net:total-b.retention,status:b.status,by:user.username,at:new Date().toISOString()};
    db.exec('BEGIN IMMEDIATE');try{if(previous){const result=db.prepare('UPDATE payments SET version=?,data=? WHERE id=? AND version=?').run(record.version,JSON.stringify(record),record.id,b.version);if(!result.changes){db.exec('ROLLBACK');return send(409,{error:'El registro cambió; actualiza antes de guardar'});}}else db.prepare('INSERT INTO payments VALUES(?,?,?)').run(record.id,record.version,JSON.stringify(record));db.prepare('INSERT INTO audit(payment_id,actor,at,data) VALUES(?,?,?,?)').run(record.id,user.username,record.at,JSON.stringify(record));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(200,{payment:record});
   }return send(404,{error:'Ruta no disponible'});
  }catch{return send(400,{error:'No se pudo procesar el estado de pago'});}
 };
}
