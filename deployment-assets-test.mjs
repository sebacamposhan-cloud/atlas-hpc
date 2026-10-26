import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createAtlasServer} from './server/groq-server.mjs';
const manifest=JSON.parse(fs.readFileSync('dist/sw.js','utf8').match(/self\.ATLAS_OFFLINE = (.*);\n/)[1]);
const images=manifest.files.filter(f=>/\.(png|webp|jpe?g|svg)$/.test(f.url));
const server=await createAtlasServer({env:{ATLAS_ACCESS_PASSWORD:'isolated-test-password'}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const headers={Authorization:'Basic '+Buffer.from('atlas:isolated-test-password').toString('base64')};let cursor=0,checked=0;
try{
 await Promise.all(Array.from({length:6},async()=>{while(cursor<images.length){const file=images[cursor++],res=await fetch(base+file.url,{headers});assert.equal(res.status,200,file.url);assert(res.headers.get('content-type').startsWith('image/'),file.url);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.length,file.bytes,file.url);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.hash,file.url);if(file.url.endsWith('.png'))assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file.url);if(file.url.endsWith('.webp'))assert.equal(bytes.subarray(8,12).toString(),'WEBP',file.url);checked++;}}));
 const data=JSON.parse(fs.readFileSync('dist/data.json'));for(const r of data.rooms)assert(images.some(f=>f.url===r.diamond_url),r.id);
 assert(images.some(f=>f.url==='/assets/501-5016771b/r0037.png'));
 console.log(JSON.stringify({checks:'passed',protectedHTTPImages:checked,documentaryDiamonds:data.rooms.length,example:'/assets/501-5016771b/r0037.png',scope:'Local actual Node server, password required, every image byte/hash and MIME checked. Does not certify Render networking or browser cache.'}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
