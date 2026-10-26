import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),dest=path.resolve(here,'../../dist/vendor/contour');
fs.mkdirSync(dest,{recursive:true});
for(const [pkg,file,name] of [['leaflet','dist/leaflet.js','leaflet.js'],['leaflet','dist/leaflet.css','leaflet.css'],['@geoman-io/leaflet-geoman-free','dist/leaflet-geoman.min.js','geoman.js'],['@geoman-io/leaflet-geoman-free','dist/leaflet-geoman.css','geoman.css']])fs.copyFileSync(path.join(here,'node_modules',pkg,file),path.join(dest,name));
fs.cpSync(path.join(here,'node_modules/leaflet/dist/images'),path.join(dest,'images'),{recursive:true});
await build({entryPoints:[path.join(here,'validation-entry.mjs')],outfile:path.join(dest,'validation.mjs'),bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'linked'});
const licenses=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='.bin')continue;const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/^(LICENSE|LICENCE|COPYING)(\..*)?$/i.test(entry.name))licenses.push('\n--- '+path.relative(path.join(here,'node_modules'),p)+' ---\n'+fs.readFileSync(p,'utf8'));}}
walk(path.join(here,'node_modules'));fs.writeFileSync(path.join(dest,'THIRD_PARTY_LICENSES.txt'),licenses.join('\n'));
console.log('Vendored Leaflet + Geoman Free + Turf validators, with third-party notices');

const lock=JSON.parse(fs.readFileSync(path.join(here,'package-lock.json')));
const dependencies=['leaflet','@geoman-io/leaflet-geoman-free','@turf/boolean-valid','@turf/kinks'].map(name=>{const p=JSON.parse(fs.readFileSync(path.join(here,'node_modules',name,'package.json')));return {name,version:p.version,license:p.license,repository:p.repository,integrity:lock.packages['node_modules/'+name].integrity};});
const files=Object.fromEntries(fs.readdirSync(dest).filter(name=>fs.statSync(path.join(dest,name)).isFile()&&name!=='PROVENANCE.json').map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(dest,name))).digest('hex')]));
fs.writeFileSync(path.join(dest,'PROVENANCE.json'),JSON.stringify({dependencies,files},null,2)+'\n');
