// Small code-drawn floor-plan icon, without image tooling dependencies.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/icons');
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),n=Buffer.alloc(4),check=Buffer.alloc(4);n.writeUInt32BE(data.length);check.writeUInt32BE(crc(body));return Buffer.concat([n,body,check]);};
for(const size of [192,512]){
 const stride=size*3+1,pixels=Buffer.alloc(stride*size),scale=size/512;
 const rect=(x,y,w,h,color)=>{for(let yy=Math.round(y*scale);yy<Math.min(size,Math.round((y+h)*scale));yy++)for(let xx=Math.round(x*scale);xx<Math.min(size,Math.round((x+w)*scale));xx++){const p=yy*stride+1+xx*3;pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];}};
 rect(0,0,512,512,[52,75,85]);
 for(const box of [[119,119,274,18],[119,375,274,18],[119,119,18,274],[375,119,18,274],[128,249,256,18],[193,128,18,130],[269,128,18,82],[269,258,18,126]])rect(...box,[255,255,255]);
 rect(266,210,24,48,[157,203,98]);rect(314,302,36,36,[157,203,98]);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;
 fs.writeFileSync(path.join(dir,'atlas-'+size+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
