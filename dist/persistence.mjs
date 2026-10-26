// Additive IndexedDB recovery journal. The legacy correction key remains authoritative.
// Snapshots record their level; older snapshots without one belong to level −1.
import {nivel} from './level.mjs';
let database;
async function open(){if(!globalThis.indexedDB)return null;if(!database)database=new Promise((resolve,reject)=>{const q=indexedDB.open('atlas-hpc-recovery',1);q.onupgradeneeded=()=>q.result.createObjectStore('snapshots',{keyPath:'id',autoIncrement:true});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});return database;}
export async function checkpoint(corrections,reason){const db=await open();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').add({at:new Date().toISOString(),schema:1,level:nivel.id,reason,corrections:structuredClone(corrections)});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('No se pudo conservar el respaldo previo'));});}
export async function latestCheckpoint(){const db=await open();if(!db)return null;return new Promise((resolve,reject)=>{const q=db.transaction('snapshots').objectStore('snapshots').openCursor(null,'prev');q.onsuccess=()=>{const c=q.result;if(!c)return resolve(null);if((c.value.level||'N-1')===nivel.id)return resolve(c.value);c.continue();};q.onerror=()=>reject(q.error);});}
