import * as M from './observaciones-model.mjs';
import {estadoObservacion,referenciaObservacion} from './observaciones-query.mjs';
import {leerObservacion,leerHistorial,leerFotos,guardarObservacion} from './observaciones-store.mjs';
const colors={'Abierta':'#bd7927','En corrección':'#a78a21','Corregida':'#337ea7','Cerrada':'#38865d','Descartada':'#7c8791'};
const date=iso=>iso?new Date(iso).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}):'Sin registro';
const plazo=iso=>iso?iso.split('-').reverse().join('-'):'Sin plazo';
export function createObservationDetail(ctx){
 const esc=ctx.esc,drawer=document.createElement('dialog');drawer.className='obsDetailDrawer';drawer.id='obsDetailDrawer';drawer.setAttribute('aria-label','Ficha de observación');document.body.append(drawer);
 let serial=0,urls=[],activeId=null,dirty=false,saving=false,opener=null,onChanged=null;
 const blobUrl=(buffer,mime='image/jpeg')=>{const u=URL.createObjectURL(new Blob([buffer],{type:mime}));urls.push(u);return u;};
 const release=()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls=[];};
 function close(force=false){if(saving)return false;if(!force&&dirty&&!confirm('Hay cambios sin enviar en la observación. ¿Descartarlos?'))return false;const previous=activeId;serial++;dirty=false;activeId=null;release();drawer.close();ctx.highlight?.(null);if(opener?.isConnected)opener.focus({preventScroll:true});else ctx.focusRecord?.(previous);return true;}
 drawer.addEventListener('cancel',e=>{e.preventDefault();const viewer=drawer.querySelector('.obsReadPhoto');if(viewer&&!viewer.hidden){viewer.hidden=true;return;}close();});
 drawer.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.matches(':modal')){e.preventDefault();const viewer=drawer.querySelector('.obsReadPhoto');if(viewer&&!viewer.hidden)viewer.hidden=true;else close();}});
 window.addEventListener('beforeunload',e=>{if(drawer.open&&(dirty||saving)){e.preventDefault();e.returnValue='';}});
 for(const eventName of ['atlas-before-floor-change','atlas-before-update'])window.addEventListener(eventName,e=>{if(drawer.open&&(dirty||saving)){e.preventDefault();ctx.toast('Envía o descarta los cambios de la observación antes de continuar.');}else if(drawer.open)close(true);});
 window.addEventListener('atlas-observaciones-changed',()=>{if(drawer.open&&!saving){const note=drawer.querySelector('.obsRemoteChange');if(note)note.hidden=false;}});
 async function open(id,changed,{force=false,keepFocus=false}={}){
  if(saving)return;if(!force&&dirty&&!confirm('Hay cambios sin enviar. ¿Descartarlos y abrir esta observación?'))return;
  dirty=false;activeId=id;onChanged=changed;if(!keepFocus)opener=document.activeElement;const request=++serial;release();
  drawer.innerHTML='<header><h2>Observación</h2><button type="button" data-close-detail aria-label="Cerrar ficha">×</button></header><p role="status">Cargando ficha…</p>';drawer.querySelector('[data-close-detail]').onclick=()=>close();
  if(!drawer.open){if(matchMedia('(max-width:700px)').matches)drawer.showModal();else drawer.show();}ctx.highlight?.(id);
  let obs,fotos,historial;
  try{[obs,fotos,historial]=await Promise.all([leerObservacion(id),leerFotos(id),leerHistorial(id)]);if(request!==serial||!drawer.open)return;if(!obs||obs.level!==ctx.level)throw Error('La observación no corresponde a este piso.');}
  catch(error){if(request===serial&&drawer.open){drawer.querySelector('p').textContent='No se pudo abrir la ficha: '+error.message;}return;}
  fotos=[...fotos].sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))||String(a.id||'').localeCompare(String(b.id||'')));historial=[...historial].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))||String(b.id||'').localeCompare(String(a.id||'')));const last=historial[0];
  const photoSources=new Map(fotos.map(f=>[f.id,{thumb:blobUrl(f.mini),full:blobUrl(f.datos,f.mime)}]));
  const photo=f=>`<button type="button" class="obsReadThumbnail" data-detail-photo="${esc(f.id)}"><img src="${photoSources.get(f.id).thumb}" alt="${esc(M.TIPOS_FOTO[f.tipo])} · ${esc(date(f.at))}"><small>${esc(M.TIPOS_FOTO[f.tipo])}</small></button>`;
  const timeline=historial.map(h=>{const ids=(Array.isArray(h.fotoIds)?h.fotoIds:null)||((h.accion==='foto'||h.accion==='creada')?fotos.filter(f=>f.at===h.at).map(f=>f.id):[]),attached=ids.map(id=>fotos.find(f=>f.id===id)).filter(Boolean);return `<li><div class="obsActivityHeading"><b>${esc(h.autor)}</b><time>${esc(date(h.at))}</time></div><p>${esc(h.detalle)}</p>${h.comentario?`<p class="obsCommentText">${esc(h.comentario)}</p>`:''}${attached.length?`<div class="obsReadPhotos">${attached.map(photo).join('')}</div>`:''}</li>`;}).join('');
  const currentRoom=ctx.room?.(obs),currentPhotos=fotos.filter(f=>obs.fotos.some(ref=>ref.id===f.id));
  drawer.innerHTML=`<form class="obsDetailForm" data-observation-version="${obs.version}"><header><div><small>${esc(referenciaObservacion(obs))} · ${esc(ctx.levelName)}</small><h2>${esc(obs.descripcion)}</h2></div><button type="button" data-close-detail aria-label="Cerrar ficha">×</button></header><div class="obsDetailBody">${obs.descripcion.length>140?`<section><h3>Descripción</h3><p class="obsCommentText">${esc(obs.descripcion)}</p></section>`:''}
   <div class="obsDetailStatus"><label>Estado<select name="estado" style="--c:${colors[obs.estado]}">${[obs.estado,...M.TRANSICIONES[obs.estado]||[]].map(e=>`<option value="${esc(e)}">${esc(estadoObservacion(e))}</option>`).join('')}</select></label><button type="button" data-edit-observation ${currentRoom?'':'disabled'}>Editar datos y fotos</button></div>
   <p class="obsRemoteChange" hidden>La observación recibió una actualización. <button type="button" data-refresh-detail>Actualizar ficha</button></p>
   <section><h3>Fotos (${obs.fotos.length})</h3><div class="obsReadPhotos">${currentPhotos.map(photo).join('')||'<p class="obsNota">Sin fotos registradas.</p>'}</div>${currentPhotos.length<obs.fotos.length?'<p class="obsNota">Hay fotos pendientes de descargar desde Nube.</p>':''}</section>
   <dl class="obsDetailMetadata"><div><dt>Recinto</dt><dd><strong>${esc(obs.room.code)}</strong><br>${esc(obs.room.name)}</dd></div><div><dt>Categoría</dt><dd>${esc(obs.categoria)}</dd></div><div><dt>Terminación</dt><dd>${esc(M.TERMINACIONES[obs.terminacion])}${obs.codigo?' · '+esc(obs.codigo):''}</dd></div><div><dt>Responsable</dt><dd>${esc(obs.responsable||'Sin responsable')}</dd></div><div><dt>Prioridad / plazo</dt><dd>${esc(obs.prioridad)} · ${esc(plazo(obs.plazo))}</dd></div><div><dt>Plano</dt><dd>${esc(obs.room.source)} · ${esc(obs.room.revision)}</dd></div><div><dt>Creada</dt><dd>${esc(obs.autor)} · ${esc(date(obs.creada))}</dd></div><div><dt>Modificada</dt><dd>${esc(last?.autor||'Autor no registrado')} · ${esc(date(obs.actualizada))}</dd></div></dl>
   ${ctx.locate&&currentRoom?'<button type="button" data-detail-locate>Ver recinto en el plano ↗</button>':'<p class="obsNota">Se conserva la referencia original del recinto.</p>'}
   <section class="obsConversation"><h3>Comentario y seguimiento</h3><label>Registrado por<input name="autor" maxlength="160" required value="${esc(ctx.author?.()||'')}" autocomplete="name"></label><label>Comentario<textarea name="comentario" maxlength="2000" rows="3" placeholder="Añade un comentario o describe la corrección…"></textarea></label><div class="obsDetailAttachments"><label class="obsAttach">Adjuntar fotos<input type="file" accept="image/*" multiple></label><label class="obsAttach">Tomar foto<input type="file" accept="image/*" capture="environment"></label><label>Tipo de nuevas fotos<select name="tipoFoto"><option value="antes">Antes</option><option value="despues" ${obs.estado!=='Abierta'?'selected':''}>Después</option></select></label></div><div class="obsPendingPhotos"></div><p class="obsDetailFeedback" role="status"></p><div class="obsConversationActions"><small>⌘/Ctrl + Intro para enviar. Los cambios de estado se guardan al enviar.</small><button type="submit" class="primary">Enviar comentario</button></div></section>
   <section class="obsActivity"><h3>Actividad (${historial.length})</h3><p class="obsNota">Comentarios, fotos y cambios guardados. Compartidos cuando la sesión Nube está sincronizada.</p><ol>${timeline||'<li>Sin actividad guardada.</li>'}</ol></section></div><div class="obsReadPhoto" hidden><img alt="Foto de la observación"><button type="button" aria-label="Cerrar foto ampliada">×</button></div></form>`;
  const form=drawer.querySelector('form'),feedback=drawer.querySelector('.obsDetailFeedback'),viewer=drawer.querySelector('.obsReadPhoto'),nuevas=[];let processing=Promise.resolve();
  const input=name=>form.elements.namedItem(name);const pending=()=>{drawer.querySelector('.obsPendingPhotos').innerHTML=nuevas.map((f,i)=>`<span><img src="${f.preview}" alt="Foto pendiente"><small>${esc(M.TIPOS_FOTO[f.tipo])}</small><button type="button" data-remove-pending="${i}" aria-label="Quitar foto pendiente">×</button></span>`).join('');drawer.querySelectorAll('[data-remove-pending]').forEach(b=>b.onclick=()=>{nuevas.splice(Number(b.dataset.removePending),1);dirty=true;pending();});};
  drawer.querySelector('[data-close-detail]').onclick=()=>close();drawer.querySelector('[data-refresh-detail]').onclick=()=>open(obs.id,onChanged,{keepFocus:true});
  drawer.querySelector('[data-edit-observation]').onclick=()=>{if(!close())return;ctx.edit(obs,()=>open(obs.id,onChanged,{force:true,keepFocus:true}),onChanged);};
  drawer.querySelector('[data-detail-locate]')?.addEventListener('click',()=>{if(close())ctx.locate(currentRoom.id);});
  drawer.querySelectorAll('[data-detail-photo]').forEach(b=>b.onclick=()=>{viewer.querySelector('img').src=photoSources.get(b.dataset.detailPhoto).full;viewer.hidden=false;viewer.querySelector('button').focus();});viewer.querySelector('button').onclick=()=>{viewer.hidden=true;};
  form.oninput=()=>{dirty=true;};input('estado').onchange=()=>{dirty=true;form.querySelector('[type=submit]').textContent=input('estado').value===obs.estado?'Enviar comentario':'Guardar estado y comentario';};
  for(const fileInput of drawer.querySelectorAll('.obsAttach input'))fileInput.onchange=()=>{const files=[...fileInput.files],tipo=input('tipoFoto').value;fileInput.value='';processing=processing.then(async()=>{for(const file of files){if(nuevas.length+obs.fotos.length>=M.MAX_FOTOS){feedback.textContent=`Máximo ${M.MAX_FOTOS} fotos por observación.`;break;}try{feedback.textContent='Procesando foto…';const f=await ctx.processPhoto(file);if(request!==serial||!drawer.open)return;nuevas.push({...f,id:crypto.randomUUID(),tipo,preview:blobUrl(f.mini)});dirty=true;feedback.textContent='Foto preparada; pulsa Enviar para guardarla.';}catch(error){feedback.textContent='No se pudo procesar la foto: '+error.message;}}if(request===serial&&drawer.open)pending();});};
  form.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();form.requestSubmit();}};
  form.onsubmit=async e=>{
   e.preventDefault();if(saving)return;saving=true;
   const controls=[...form.querySelectorAll('button,input,textarea,select')],disabled=new Map(controls.map(c=>[c,c.disabled]));controls.forEach(c=>c.disabled=true);
   try{
    await processing;if(request!==serial||!drawer.open)return;
    const autor=String(input('autor').value).trim(),at=new Date().toISOString(),photos=nuevas.map(f=>({id:f.id,tipo:f.tipo,at,autor}));
    const result=M.registrarSeguimiento(obs,{autor,comentario:input('comentario').value,estado:input('estado').value,fotos:photos,at});
    await guardarObservacion(result.observacion,obs.version,{historial:result.historial,fotos:nuevas.map(({preview,...f})=>({...f,obsId:obs.id,at,autor}))});
    ctx.rememberAuthor?.(autor);dirty=false;saving=false;ctx.toast('Seguimiento guardado en este equipo.');
    try{await onChanged?.();}catch{ctx.toast('El seguimiento se guardó, pero no se pudo actualizar el listado.');}
    await open(obs.id,onChanged,{force:true,keepFocus:true});
   }catch(error){feedback.textContent='No se guardó. '+error.message;}
   finally{saving=false;if(request===serial&&drawer.open)controls.forEach(c=>c.disabled=disabled.get(c));}
  };
  drawer.querySelector('[data-close-detail]').focus({preventScroll:true});
 }
 return {open,close,active:()=>activeId};
}
