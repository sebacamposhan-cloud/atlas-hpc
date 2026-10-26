import {partsToFeature,featureToParts,validateParts} from './contour-geometry.mjs';
let loading;
function loadEngine(){if(!loading)loading=(async()=>{
 for(const file of ['leaflet.css','geoman.css']){const link=document.createElement('link');link.rel='stylesheet';link.href='./vendor/contour/'+file;document.head.append(link);}
 for(const file of ['leaflet.js','geoman.js'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/contour/'+file;script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar el editor. Guarda el paquete de plano o reintenta con conexión.'));document.head.append(script);});
 return window.L;
})().catch(e=>{loading=null;throw e;});return loading;}
export async function openContourEditor(ctx){
 const L=await loadEngine(),r=ctx.room,doc=ctx.source,esc=ctx.esc;
 const initial=structuredClone(ctx.parts),dialog=document.createElement('dialog');dialog.id='contourEditor';
 dialog.innerHTML=`<div class="contourHead"><div><h2>Revisar contorno · ${esc(r.code)}</h2><small>${esc(r.name)} · ${esc(doc.code)} · ${esc(doc.revision)} · página 1</small></div><button id="contourClose" aria-label="Cerrar editor">×</button></div><p class="contourNote">Rombo y código ${esc(r.code)} vinculados a esta fuente. El contorno conserva su estado pendiente hasta revisión técnica. No se calculan m² ejecutados.</p><div id="contourMap" aria-label="Plano de revisión de contorno"></div><form id="contourForm"><label>Responsable<input name="responsible" required maxlength="160"></label><label>Motivo y referencia de revisión<input name="reason" required maxlength="1000"></label><div class="contourActions"><button id="contourUndo" type="button">Deshacer</button><button id="contourRedo" type="button">Rehacer</button><button id="contourReset" type="button">Volver al contorno inicial</button><button id="contourExport" type="button" disabled>Exportar revisión</button><button id="contourSave" disabled>Guardar corrección local</button></div><p id="contourStatus" role="status">Cargando el PDF original…</p><small>Motor: Leaflet 1.9.4 + Geoman Free 2.20.4. Validación geométrica: Turf. El guardado pertenece a este navegador. Este incremento exige que la etiqueta del recinto quede dentro del contorno y excluye etiquetas vecinas; las etiquetas desplazadas requieren revisión documental previa.</small></form>`;
 document.body.append(dialog);dialog.showModal();const $=id=>dialog.querySelector('#'+id);let map,group,record,closed=false,history=[],redo=[],restoring=false;
 const serialize=()=>{const parts=[];group.eachLayer(layer=>{const value=layer.toGeoJSON();parts.push(...featureToParts(value,{flipY:true}));});return parts;};
 const updateButtons=()=>{$('contourUndo').disabled=history.length<2;$('contourRedo').disabled=!redo.length;};
 const snapshot=()=>{if(restoring)return;const value=JSON.stringify(serialize());if(value!==history.at(-1)){history.push(value);if(history.length>100)history.shift();redo=[];record=null;$('contourExport').disabled=true;}updateButtons();};
 function addLayer(layer){if(layer instanceof L.LayerGroup){layer.eachLayer(addLayer);return;}if(!(layer instanceof L.Polygon))return;group.addLayer(layer);layer.on('pm:markerdragend pm:vertexadded pm:vertexremoved pm:edit pm:dragend',snapshot);}
 function showParts(parts){restoring=true;group.clearLayers();if(parts.length){const feature=partsToFeature(parts);L.geoJSON(feature,{coordsToLatLng:p=>L.latLng(-p[1],p[0]),style:{color:'#12658c',weight:2,fillOpacity:.12}}).eachLayer(addLayer);}restoring=false;}
 dialog.addEventListener('close',()=>{closed=true;map?.remove();dialog.remove();ctx.onClose?.();},{once:true});$('contourClose').onclick=()=>dialog.close();
 try{
  const points=initial.flatMap(p=>p.polygon),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const box=points.length?[Math.max(0,Math.min(...xs)-50),Math.max(0,Math.min(...ys)-50),Math.min(doc.width,Math.max(...xs)+50),Math.min(doc.height,Math.max(...ys)+50)]:[Math.max(0,r.position[0]-200),Math.max(0,r.position[1]-200),Math.min(doc.width,r.position[0]+200),Math.min(doc.height,r.position[1]+200)];
  if(box[2]<=box[0]||box[3]<=box[1])throw Error('El contorno requiere revisar su correspondencia con esta lámina.');
  const image=await ctx.renderSource(doc,[box[0],box[1],box[2]-box[0],box[3]-box[1]],2400);if(closed)return;
  map=L.map($('contourMap'),{crs:L.CRS.Simple,minZoom:-5,maxZoom:5,zoomSnap:0,zoomDelta:.5,preferCanvas:false});
  const bounds=[[-box[3],box[0]],[-box[1],box[2]]];L.imageOverlay(image,bounds,{pmIgnore:true,interactive:false}).addTo(map);group=L.featureGroup().addTo(map);showParts(initial);
  map.fitBounds(bounds);map.invalidateSize();map.pm.setLang('es');map.pm.addControls({position:'topleft',drawMarker:false,drawCircleMarker:false,drawPolyline:false,drawRectangle:false,drawCircle:false,drawText:false,rotateMode:false,drawPolygon:true,editMode:true,dragMode:true,cutPolygon:true,removalMode:true});map.pm.setGlobalOptions({allowSelfIntersection:false,snappable:false});
  map.on('pm:create',e=>{addLayer(e.layer);snapshot();});map.on('pm:cut',e=>{group.removeLayer(e.originalLayer);addLayer(e.layer);snapshot();});map.on('pm:remove',e=>{group.removeLayer(e.layer);snapshot();});
  history=[JSON.stringify(initial)];updateButtons();$('contourSave').disabled=false;$('contourStatus').textContent='PDF original cargado. Edita vértices o dibuja partes; usa cortar para huecos. Toda corrección queda pendiente de revisión.';
  $('contourUndo').onclick=()=>{if(history.length<2)return;redo.push(history.pop());showParts(JSON.parse(history.at(-1)));record=null;$('contourExport').disabled=true;updateButtons();};
  $('contourRedo').onclick=()=>{if(!redo.length)return;const value=redo.pop();history.push(value);showParts(JSON.parse(value));record=null;$('contourExport').disabled=true;updateButtons();};
  $('contourReset').onclick=()=>{showParts(initial);snapshot();};
 }catch(e){if(!closed)$('contourStatus').textContent=e.message+' Abre el PDF original con conexión o guarda el paquete de documentos para revisar offline.';}
 $('contourForm').onsubmit=async e=>{e.preventDefault();if(!map||closed)return;$('contourSave').disabled=true;
  try{const parts=serialize(),feature=validateParts(parts,doc.width,doc.height),fields=new FormData(e.target),responsible=fields.get('responsible').trim(),reason=fields.get('reason').trim();if(!responsible||!reason)throw Error('Indica responsable y motivo.');
   const saved=await ctx.save(parts,{responsible,reason});record={format:'atlas-geometry-review-v1',record:{id:crypto.randomUUID(),observation_id:r.id,source_id:doc.id,source_sha256:doc.sha256,page:1,coordinate_system:'rotated PDF page points',geometry:feature.geometry,status:'pending',at:new Date().toISOString(),responsible,reason,local_version:saved.version}};
   $('contourExport').disabled=false;$('contourStatus').textContent='Corrección local guardada con historial. Estado: pendiente de revisión técnica. Puedes exportarla para consolidación documental.';
  }catch(error){$('contourStatus').textContent=error.message;}finally{if(!closed)$('contourSave').disabled=false;}
 };
 $('contourExport').onclick=()=>{if(record)ctx.download(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),'Atlas_revision_'+r.code.replace(/[^\w.-]/g,'_')+'.json');};
}
