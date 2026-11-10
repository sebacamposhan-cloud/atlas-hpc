import './prepare-progress-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const files=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const add=(name,pack='plan',core=false)=>{const bytes=fs.readFileSync(path.join(dist,name));files.push({url:'/'+name,bytes:bytes.length,hash:hash(bytes),pack,core});};
const walk=folder=>fs.readdirSync(path.join(dist,folder),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(folder+'/'+e.name):[folder+'/'+e.name]);
for(const name of ['dispositivo.mjs','terreno.css','escritorio.css','protocolo-folio.mjs','agenda.mjs','resumen-piso.mjs','puertas-model.mjs','puertas-modelos.mjs','puertas.mjs','puertas.css','navegacion.css','jerarquia.css','selector-flujo.mjs','flujo.css','navegacion.mjs','navegacion-model.mjs','palanca.mjs','fluido.mjs','curva-avance.mjs','gerencial.css','column-filters.css','column-filters.mjs','rombo.css','rombo.mjs','ficha.css','firma.mjs','contornos-nube.mjs','photo-marks.mjs','fonts/google-sans-flex-latin-wght-normal.woff2','ejes.json','lastplanner-axes.mjs','lastplanner-wizard.mjs','lastplanner-intelligence.mjs','lastplanner-room-editor.mjs','lastplanner-resources.mjs','lastplanner-planning-model.mjs','lastplanner-planning-ui.mjs','lastplanner-productivity.mjs','apu-model.mjs','apu-picker.mjs','lastplanner-daily.mjs','lastplanner-daily-ui.mjs','lastplanner-map.mjs','lastplanner-cycle.css','lastplanner-cycle-model.mjs','lastplanner-cycle-store.mjs','lastplanner-session.mjs','jerarquia-model.mjs','jerarquia-store.mjs','jerarquia-ui.mjs','lastplanner-geometry.mjs','lastplanner-spatial.mjs','lastplanner-workflow.mjs','lastplanner-report.mjs','lastplanner-sync.mjs','lastplanner.css','lastplanner-model.mjs','lastplanner-store.mjs','lastplanner.mjs','lastplanner-ejemplo.mjs','subcontratos.mjs','protocolos-recinto.mjs','protocolos.css','protocolos-plano.mjs','protocol-ejes.mjs','nube.css','nube.mjs','nube-sync.mjs','observaciones.css','observaciones-model.mjs','observaciones-store.mjs','observaciones-query.mjs','observacion-detail.mjs','observaciones.mjs','marking.css','marking-model.mjs','marking-store.mjs','marking.mjs','marking-overlay.mjs','levantamiento.mjs','levantamiento-model.mjs','vendor/contour/validation.mjs','contour-geometry.mjs','source-image.mjs','diamonds.mjs','assistant.mjs','review-observations.mjs','cie-review-observations.json','geometry-authority.mjs','room-contour-repairs.mjs','documentary-evidence.mjs','supplemental-sources.mjs','discipline-model.mjs','work-charts.mjs','progress-room-levels.json','progress-scope.mjs','progress-analysis.mjs','room-progress-model.mjs','room-progress-store.mjs','room-progress.mjs','avance-model.mjs','avance-store.mjs','avance.mjs','pma-model.mjs','pma.mjs','protocol-scope.mjs','protocol-model.mjs','protocol-aging.mjs','protocol-values.mjs','protocol-critical.mjs','protocol-catalog.mjs','protocols/catalog.json','plan-filters.mjs','door-pilot.json','doors.mjs','doors/catalog.json','doors/overview.webp','imp-report.mjs','imp-numbering.mjs','artefactos-model.mjs','impermeabilizacion.mjs','impermeabilizacion-model.mjs','disciplines.mjs','construction-store.mjs','disciplines.json','workspace.css','workspace.mjs','layers.mjs','documented-layer-colors.mjs','assets/layer-colors/cie-214.png','persistence.mjs','index.html','sesion-guardia.js','login.html','login.css','login.mjs','style.css','app.js','engine.mjs','web-store.mjs','vendor-loader.mjs','viewer.mjs','gestures.mjs','hit-index.mjs','runtime-loader.mjs','offline.mjs','runtime.json','contornos.json','manifest.webmanifest','icons/atlas.svg','icons/atlas-192.png','icons/atlas-512.png','map/overview.webp','pisos.js','floor-explorer.mjs','level.mjs']) add(name,'plan',true);
for(const name of walk('apu')) add(name,'plan',true);
for(const name of walk('pisos3d')) add(name,'plan',true);
// Inicio de sesión: se guarda para mostrarlo también sin conexión (con el aviso de que hace falta señal para entrar).
for(const name of walk('login')) add(name,'plan',true);
add('contour-editor.mjs');
add('protocols/open-aging.json');
add('pma/catalog.json');
for(const name of walk('protocols/registers'))add(name);
// Pisos adicionales. Las páginas de redirección n0x/index.html no se guardan (solo la portada es HTML).
for(const name of [...walk('n01'),...walk('n02'),...walk('n03')]) if(!/\.(html|txt)$/.test(name)) add(name);
for(const name of walk('map')) if(name!=='map/overview.webp') add(name);
for(const name of walk('doors')) if(!['doors/catalog.json','doors/overview.webp'].includes(name)) add(name);
for(const name of walk('disciplines')) add(name);
for(const name of walk('impermeabilizacion')) add(name);
for(const name of walk('geometry')) add(name);
for(const name of walk('assets')) if(!name.endsWith('/plan.jpg')&&name!=='assets/layer-colors/cie-214.png') add(name);
for(const name of ['vendor/pdf-lib.min.js','vendor/xlsx.full.min.js']) add(name,'plan',name==='vendor/pdf-lib.min.js');
for(const name of walk('source')) add(name,'documents');
for(const name of walk('vendor/contour')) if(name!=='vendor/contour/validation.mjs') add(name);
for(const name of walk('vendor')) if(!name.startsWith('vendor/contour/')&&!['vendor/pdf-lib.min.js','vendor/xlsx.full.min.js'].includes(name)) add(name,'documents');
files.sort((a,b)=>a.url.localeCompare(b.url));
const version=hash(JSON.stringify(files)+fs.readFileSync(path.join(dist,'sw-runtime.js'),'utf8')).slice(0,16);
const manifest={version,files};
fs.writeFileSync(path.join(dist,'sw.js'),'/* Generated by scripts/prepare-offline.mjs */\nself.ATLAS_OFFLINE = '+JSON.stringify(manifest)+';\nimportScripts("./sw-runtime.js");\n');
console.log(JSON.stringify({version,coreBytes:files.filter(f=>f.core).reduce((n,f)=>n+f.bytes,0),planBytes:files.filter(f=>f.pack==='plan').reduce((n,f)=>n+f.bytes,0),documentsBytes:files.filter(f=>f.pack==='documents').reduce((n,f)=>n+f.bytes,0),files:files.length},null,2));

// Door tiles and the stitched PDF are available in the plan package.
