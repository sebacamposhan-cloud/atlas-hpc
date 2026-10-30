import {loadSourceImage} from './source-image.mjs';
import {crearFiltrosColumna} from './column-filters.mjs';
export const diamondFields=['M1','M2','M3','M4','CIE','PAV'];
const normalize=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
export function findDiamonds(rooms,{query='',documentId=''}={}){
 const q=normalize(query).trim();
 return rooms.filter(r=>(r.diamond_bbox||r.diamond_url)&&(!documentId||r.document_id===documentId)&&(!q||normalize([r.code,r.name,...(r.finishes||[]).map(f=>f.code+' '+f.description)].join(' ')).includes(q)));
}
export function diamondBox(room,atlas){
 const box=room.diamond_bbox,tile=atlas.tiles.find(t=>t.id===room.document_id);
 if(!tile||!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1])return null;
 return [box[0]+tile.offset[0],box[1]+tile.offset[1],box[2]-box[0],box[3]-box[1]];
}
export function createDiamondCatalog(ctx){
 const esc=ctx.esc,button=document.createElement('button');button.id='diamondCatalogOpen';button.textContent='Rombos';button.type='button';document.querySelector('body>header').append(button);
 const dialog=document.createElement('dialog');dialog.id='diamondCatalog';dialog.setAttribute('aria-label','Catálogo documental de rombos');
 dialog.innerHTML='<div class="diamondHead"><h2>Rombos documentales</h2><button id="diamondClose" aria-label="Cerrar catálogo">×</button></div><section id="diamondListPanel"><p>Observaciones de las láminas de Arquitectura de este piso, incluidas las que quedan fuera del recorte del plano. No equivalen a recintos físicos únicos.</p><button id="diamondMapToggle" type="button">Mostrar rombos en el plano</button><p id="diamondCount" aria-live="polite"></p><p class="dataNote">Toca un encabezado para ordenar o filtrar, como en Excel (también por terminación).</p><div id="diamondRows"></div><div class="diamondPagination"><button id="diamondPrev">Anterior</button><span id="diamondPage"></span><button id="diamondNext">Siguiente</button></div></section><section id="diamondDetail" hidden></section>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);let page=0;
 const tabla={filtros:{},orden:null},ambito=r=>ctx.inScope(r)?'En el ámbito del plano':'Fuera del recorte del plano';
 const cf=crearFiltrosColumna({id:'rombos',estado:tabla,esc,alCambiar:()=>{page=0;list();},columnas:[{key:'codigo',titulo:'Código',valor:r=>r.code},{key:'nombre',titulo:'Nombre',valor:r=>r.name},{key:'lamina',titulo:'Lámina',valor:r=>r.document_id.split('-')[0]},{key:'terminacion',titulo:'Terminaciones',valor:r=>(r.finishes||[]).map(f=>f.field+' '+f.code+' · '+(f.description||''))},{key:'campos',titulo:'Campos',valor:r=>(r.finishes?.length||0)+'/6'},{key:'ambito',titulo:'Ámbito',valor:ambito}]});
 function list(){
  $('diamondListPanel').hidden=false;$('diamondDetail').hidden=true;
  const todos=findDiamonds(ctx.data().rooms),rows=cf.aplicar(todos),pages=Math.max(1,Math.ceil(rows.length/24));page=Math.min(page,pages-1);
  $('diamondCount').innerHTML=rows.length+' de '+todos.length+' observaciones con rombo · '+ctx.data().rooms.length+' en total '+cf.limpiar();
  $('diamondRows').innerHTML=`${cf.barra()}<div class="tableScroll"><table class="masterTable diamondTabla"><thead><tr>${cf.cabecera()}</tr></thead><tbody>${rows.slice(page*24,(page+1)*24).map(r=>`<tr><td data-label="Código"><button class="codeLink" data-diamond-open="${esc(r.id)}">${esc(r.code)}</button></td><td data-label="Nombre">${esc(r.name)}</td><td data-label="Lámina">${esc(r.document_id.split('-')[0])}</td><td data-label="Terminaciones"><small>${esc((r.finishes||[]).map(f=>f.field+' '+f.code).join(' · '))}</small></td><td data-label="Campos">${r.finishes?.length||0}/6</td><td data-label="Ámbito">${ambito(r)}</td></tr>`).join('')||'<tr><td colspan="6">No hay coincidencias. Cambia los filtros desde los encabezados.</td></tr>'}</tbody></table></div>`;
  cf.conectar(dialog,todos);
  $('diamondPrev').disabled=page===0;$('diamondNext').disabled=page+1>=pages;$('diamondPage').textContent=(page+1)+' / '+pages;
  $('diamondMapToggle').textContent=ctx.showing()?'Ocultar marcas de rombos en el plano':'Mostrar rombos en el plano';
 }
 function detail(id){
  const r=ctx.data().rooms.find(r=>r.id===id);if(!r)return;const doc=ctx.data().documents.find(d=>d.id===r.document_id);
  $('diamondListPanel').hidden=true;$('diamondDetail').hidden=false;$('diamondDetail').dataset.roomId=id;
  $('diamondDetail').innerHTML=`<button id="diamondBack">Volver al catálogo</button><h3>${esc(r.code)} · ${esc(r.name)}</h3><img class="diamondOriginal" src="${esc(r.diamond_url||'')}" alt="Rombo original ${esc(r.code)}"><p id="diamondImageStatus" role="status"></p>${r.version>1?'<p>Valores con correcciones locales vigentes; imagen procedente del PDF original.</p>':''}<table><thead><tr><th>Campo</th><th>Código</th><th>Descripción de la leyenda</th></tr></thead><tbody>${diamondFields.map(field=>{const f=r.finishes.find(f=>f.field===field);return `<tr><th>${field}</th><td>${esc(f?.code||'Pendiente de extracción')}</td><td>${esc(f?.description||'Pendiente de revisión')}</td></tr>`;}).join('')}</tbody></table><p>Fuente: ${esc(doc.code)} · ${esc(doc.revision)} · página ${esc(r.source_page||1)}<br>Superficie escrita: ${esc(r.declared_area)} · no recalculada.</p><p class="dataNote">Observación ${esc(r.id)}. La presencia de seis campos no valida automáticamente el contorno ni la asociación técnica.</p><a href="source/${esc(doc.filename)}" target="_blank" rel="noopener">Abrir PDF original ↗</a>${ctx.inScope(r)?'<button id="diamondLocate">Abrir ficha y localizar rombo</button>':'<p>Esta observación está fuera del recorte A–W / 1–12. Su rombo y PDF se pueden consultar aquí.</p>'}`;
  const status=$('diamondImageStatus');loadSourceImage($('diamondDetail').querySelector('img'),r.diamond_url,()=>ctx.loadImage({...r,diamond_url:null}),{recovering:()=>status.textContent='Recuperando rombo desde el PDF original…',ready:()=>status.textContent='',failed:()=>status.textContent='No se pudo cargar la región. Abre el PDF original con conexión o desde el paquete de documentos guardado.'});
  $('diamondBack').onclick=list;
  if($('diamondLocate'))$('diamondLocate').onclick=()=>{if(ctx.editing())return ctx.toast('Guarda o cancela el contorno antes de cambiar de recinto.');dialog.close();ctx.openRoom(r.id);};
 }
 button.onclick=()=>{dialog.showModal();list();};
 $('diamondClose').onclick=()=>dialog.close();$('diamondPrev').onclick=()=>{page--;list();};$('diamondNext').onclick=()=>{page++;list();};$('diamondRows').onclick=e=>{const b=e.target.closest('[data-diamond-open]');if(b)detail(b.dataset.diamondOpen);};
 $('diamondMapToggle').onclick=()=>{if(ctx.editing())return ctx.toast('Guarda o cancela el contorno antes de cambiar.');dialog.close();ctx.toggle();};
}
