import {PERMISSIONS,allowed} from './lastplanner-cycle-model.mjs';
export const SESSION_KEY='atlas-nube-sesion';
export function atlasSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
export function sessionActor(){
 const session=atlasSession();if(!session?.token||!session.user?.username)return null;
 let claims={};try{const raw=session.token.split('.')[1];if(raw)claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{}
 const permissions=claims.app_metadata?.lastplanner_permissions??session.user.lastplanner_permissions;
 return {id:claims.sub||session.user.id||session.user.username,email:claims.email||session.user.username,role:claims.app_metadata?.campo_role||session.user.role,permissions:permissions==null?null:Array.isArray(permissions)?permissions.filter(p=>PERMISSIONS.includes(p)):[]};
}
export const can=permission=>allowed(sessionActor(),permission);
export function authenticatedActor(permission){const actor=sessionActor();if(!actor||!allowed(actor,permission))throw Error('Entra en Nube con una cuenta autorizada para esta operación.');return actor;}
