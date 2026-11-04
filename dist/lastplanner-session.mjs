import {PERMISSIONS,allowed} from './lastplanner-cycle-model.mjs';
import {permisosLastPlanner,perfilActivo} from './jerarquia-model.mjs';
export const SESSION_KEY='atlas-nube-sesion';
// Perfil de la jerarquía de obra de la última sincronización (lo escribe jerarquia-store.mjs). Sin él, todo como antes.
export const PERFIL_KEY='atlas-jerarquia-perfil';
export function atlasSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
export function perfilGuardado(id){try{const v=JSON.parse(localStorage.getItem(PERFIL_KEY)||'null');return v&&v.id===id&&perfilActivo(v.perfil)&&v.perfil.id===id?v.perfil:null;}catch{return null;}}
export function sessionActor(){
 const session=atlasSession();if(!session?.token||!session.user?.username)return null;
 let claims={};try{const raw=session.token.split('.')[1];if(raw)claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{}
 const permissions=claims.app_metadata?.lastplanner_permissions??session.user.lastplanner_permissions;
 const id=claims.sub||session.user.id||session.user.username,cuenta=permissions==null?null:Array.isArray(permissions)?permissions.filter(p=>PERMISSIONS.includes(p)):[];
 // Con perfil activo, los permisos quedan topados por su nivel, igual que en el servidor y en la base.
 return {id,email:claims.email||session.user.username,role:claims.app_metadata?.campo_role||session.user.role,permissions:permisosLastPlanner(perfilGuardado(id),cuenta)};
}
export const can=permission=>allowed(sessionActor(),permission);
export function authenticatedActor(permission){const actor=sessionActor();if(!actor||!allowed(actor,permission))throw Error('Tu cuenta no tiene permiso para esta operación.');return actor;}
