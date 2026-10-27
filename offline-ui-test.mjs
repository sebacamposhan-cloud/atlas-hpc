import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync('dist/offline.mjs','utf8');
function page({saved=true,online=false,failFirst=false,secure=true,waiting=false,installing=false}={}){
  const nodes=new Map(),windowEvents={},documentEvents={},calls={get:0,register:0,update:0,status:0,activate:0};
  const get=id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
  const state={plan:{ready:saved,count:saved?800:16,total:800,bytes:23600000},documents:{ready:false,count:0,total:80,bytes:29900000},downloading:null};
  const changes=[];const worker={state:'installing',addEventListener(name,fn){changes.push(fn);}};
  const registration={waiting:waiting?{postMessage(){calls.activate++;}}:null,installing:installing?worker:null,active:{postMessage(message,ports){calls.status++;ports[0].postMessage(structuredClone(state));}},addEventListener(){},update(){calls.update++;return new Promise(()=>{});}};
  const navigator={onLine:online,serviceWorker:{
    async getRegistration(){calls.get++;return saved?registration:undefined;},
    async register(){calls.register++;if(failFirst&&calls.register===1)throw Error('Conexión interrumpida');return registration;},
    addEventListener(){},
  }};
  class Channel {constructor(){this.port1={close(){}};this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage?.({data}))};}}
  vm.runInNewContext(code,{document:{getElementById:get,hidden:false,addEventListener:(name,fn)=>documentEvents[name]=fn},window:{isSecureContext:secure,caches:{},addEventListener:(name,fn)=>windowEvents[name]=fn},navigator,MessageChannel:Channel,setTimeout,clearTimeout,setInterval,clearInterval,location:{reload(){}}});
  return {get,calls,navigator,windowEvents,documentEvents,registration,worker,changes};
}
const cached=page();await cached.windowEvents['atlas-ready']();
assert.equal(cached.calls.register,0,'reopening saved Atlas must not register through the network');
assert.equal(cached.calls.update,0,'offline opening must not attempt an update');
assert(cached.get('offlineStatus').textContent.includes('Listo'));
assert(cached.get('offlineSave').disabled);
await cached.get('offlineOpen').onclick();assert(cached.get('offlineDialog').open);assert.equal(cached.calls.get,1);
cached.get('offlineDialog').close();await cached.get('bottomOffline').onclick();assert(cached.get('offlineDialog').open,'bottom navigation opens the same offline controls');
const before=cached.calls.status;cached.documentEvents.visibilitychange();await new Promise(setImmediate);assert(cached.calls.status>before,'returning from suspension refreshes the saved status');
cached.navigator.onLine=true;cached.windowEvents.online();await new Promise(setImmediate);assert.equal(cached.calls.update,1);
const retry=page({saved:false,online:true,failFirst:true});await retry.windowEvents['atlas-ready']();assert(retry.get('offlineStatus').textContent.includes('interrumpida'));
await retry.get('offlineOpen').onclick();assert.equal(retry.calls.register,2);assert(!retry.get('offlineSave').disabled,'a failed first setup can be retried');
const blocked=page({secure:false});await blocked.windowEvents['atlas-ready']();assert.equal(blocked.calls.get,0);assert(blocked.get('offlineStatus').textContent.includes('Safari'));
console.log('Offline reopen without registration or update, app resume, online update, interrupted setup retry and unsupported preview: passed');

const pending=page({waiting:true});await pending.windowEvents['atlas-ready']();assert.equal(pending.get('offlineUpdate').hidden,false);assert.equal(pending.get('atlasUpdateNotice').hidden,false);pending.get('offlineUpdate').onclick();assert.equal(pending.calls.activate,1);
const race=page({installing:true});await race.windowEvents['atlas-ready']();assert.equal(race.get('offlineUpdate').hidden,true);race.worker.state='installed';for(const fn of race.changes)fn();race.registration.installing=null;race.registration.waiting={postMessage(){}};await new Promise(r=>setTimeout(r,5));assert.equal(race.get('offlineUpdate').hidden,false,'installed event precedes waiting assignment: update button must refresh after that assignment');
console.log('Waiting update banner, manual activation and installed/waiting timing regression passed');
