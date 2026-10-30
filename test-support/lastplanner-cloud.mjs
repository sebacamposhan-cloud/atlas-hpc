// Isolated PostgreSQL/Supabase adapter for integration tests. Never loaded by Atlas.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const QA_ACTOR={id:'11111111-1111-4111-8111-111111111111',email:'inspector@example.test',role:'editor'};
export const tokenFor=(actor=QA_ACTOR)=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor.id,email:actor.email,app_metadata:{campo_role:actor.role,...(actor.permissions?{lastplanner_permissions:actor.permissions}:{})}})).toString('base64url')+'.isolated-test';
export async function cloudFixture(){
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite(),files=new Map();
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema public,auth,storage to authenticated,anon;`);
 const sql=fs.readFileSync(new URL('../supabase/lastplanner-cycle.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const claims=actor=>({sub:actor.id,email:actor.email,app_metadata:{campo_role:actor.role,...(actor.permissions?{lastplanner_permissions:actor.permissions}:{})}});
 const authenticated=async(actor,query,params=[])=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims(actor))]);await tx.exec('set local role authenticated');return tx.query(query,params);});
 const rows=async()=> (await db.query('select * from public.atlas_lp_records order by tipo,id')).rows;
 const rpc=async(body,actor=QA_ACTOR)=>(await authenticated(actor,'select public.guardar_lote_atlas_lp($1,$2,$3,$4::jsonb) as result',[body.p_id,body.p_accion,body.p_huella,JSON.stringify(body.p_ops)])).rows[0].result;
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 let queue=Promise.resolve();
 const fetchImpl=(url,options={})=>{const work=async()=>{try{
  const parsed=new URL(url),path=parsed.pathname,token=options.headers?.Authorization?.slice(7),payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url')),actor={id:payload.sub,email:payload.email,role:payload.app_metadata.campo_role,permissions:payload.app_metadata.lastplanner_permissions};
  if(path==='/auth/v1/user')return json({id:actor.id,email:actor.email,app_metadata:payload.app_metadata});
  if(path==='/rest/v1/atlas_lp_records'){const all=await authenticated(actor,'select * from public.atlas_lp_records order by tipo,id limit $1 offset $2',[Number(parsed.searchParams.get('limit')||500),Number(parsed.searchParams.get('offset')||0)]);return json(all.rows);}
  if(path==='/rest/v1/atlas_lp_operaciones')return json((await authenticated(actor,'select * from public.atlas_lp_operaciones where id=$1',[parsed.searchParams.get('id').slice(3)])).rows);
  if(path==='/rest/v1/rpc/guardar_lote_atlas_lp')return json(await rpc(JSON.parse(options.body),actor));
  if(path.startsWith('/storage/v1/object/')){const id=path.split('/').at(-1);if(options.method==='POST'){if(files.has(id))return json({statusCode:409},409);if(actor.role!=='editor'||actor.permissions&&!actor.permissions.includes('evidence'))return json({error:'Unauthorized'},403);const bytes=Buffer.from(options.body);files.set(id,bytes);await db.query("insert into storage.objects(bucket_id,name) values('atlas-lp',$1)",[id]);return json({Key:id});}if(files.has(id))return new Response(files.get(id));return json({error:'Missing file'},404);}
  if(path==='/rest/v1/atlas_registros')return json([]);
  return json({error:'Unsupported isolated provider '+path},404);
 }catch(e){return json({message:e.message,code:e.code},400);}};const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;};
 return {db,rpc,rows,authenticated,fetchImpl,files,env:{SUPABASE_URL:'https://isolated-lp.supabase.co',SUPABASE_ANON_KEY:'isolated-test-key',ATLAS_ACCESS_PASSWORD:'isolated-lp-cycle'},close:()=>db.close()};
}
export const requestFor=(action,ops)=>({p_id:crypto.randomUUID(),p_accion:action,p_huella:createHash('sha256').update(JSON.stringify(ops)).digest('hex'),p_ops:ops});
