import {markRoom,orderedMarks,removeRoomMark,clearRoomMarks} from './imp-numbering.mjs';
import {ART_STATES,ultimoArtefacto,registrarArtefactos} from './artefactos-model.mjs';
import {readMarkings,saveMarking} from './marking-store.mjs';
import {exigirFirma,firmante} from './firma.mjs';
import {loadVendor} from './web-store.mjs';
import {esImpermeabilizacion,IMP_STATES,nuevoAvanceIMP,registrarAvanceIMP,ultimoAvanceIMP,impPath} from './impermeabilizacion-model.mjs';

// Uses the specialty viewer's SVG, gestures, tiled source and selection. This controller adds progress and export only.
export async function createImpermeabilizacion({esc,toast,download,redraw,detail,isActive,clearSelection}) {
  const response=await fetch('impermeabilizacion/s01.json');
  if(!response.ok)throw Error('No se pudieron cargar los contornos de impermeabilización.');
  const catalog=await response.json();
  const ar=await fetch('impermeabilizacion/artefactos-s01.json');if(!ar.ok)throw Error('No se pudo cargar la matriz de artefactos S01.');const artifacts=await ar.json();
  const items=room=>artifacts.rooms.find(r=>r.code===room.code)?.items||[];
  const artifactName=code=>artifacts.types.find(a=>a.code===code)?.name||code;
  let documents=[],active=null,busy=false,cut='',selected=null,root=null,paintLayer='imp',roomDialog=null,openRequested=false;
  try{active=localStorage.getItem('atlas-imp-active-project');}catch{}
  const setActive=id=>{active=id;try{localStorage.setItem('atlas-imp-active-project',id||'');}catch{}};
  const doc=()=>documents.find(d=>d.id===active)||null;
  const last=id=>ultimoAvanceIMP(doc(),id,cut||undefined);
  const editable=()=>{try{return JSON.parse(localStorage.getItem('atlas-nube-sesion'))?.user?.role==='editor'&&!!firmante();}catch{return false;}};
  const dirty=()=>!!root?.isConnected&&!!root.querySelector('form[data-dirty]');
  async function reload(){documents=(await readMarkings()).filter(d=>esImpermeabilizacion(d)&&!d.eliminado&&d.source.sha256===catalog.document.sha256&&d.source.registrationVersion===catalog.registration.version);if(!documents.some(d=>d.id===active))active=documents.find(d=>d.id.startsWith('imp-s01-avance-'))?.id||documents[0]?.id||null;}
  await reload();
  const status=message=>{const el=document.getElementById('impSaveStatus');if(el)el.textContent=message;};
  const options=()=>!documents.length?'<option value="">Avance general · sin registros</option>':documents.map(d=>`<option value="${esc(d.id)}" ${d.id===active?'selected':''}>${esc(d.name)}</option>`).join('');
  let numberingQueue=Promise.resolve();
  function numberRoom(room){
    if(cut||!editable()||dirty())return Promise.resolve();
    const run=async()=>{
    busy=true;try{const current=doc(),author=exigirFirma(),base=current||nuevoAvanceIMP(catalog,author),next=markRoom(base,room,author);if(next!==base){await saveMarking({...next,version:(current?.version||0)+1},current?.version||0);setActive(next.id);await reload();}redraw();detail();}catch(e){toast('No se pudo guardar la marca: '+e.message);}finally{busy=false;}
    };const result=numberingQueue.then(run);numberingQueue=result.catch(()=>{});return result;
  }
  function numberOverlay(scale=1){const radius=Math.max(7,9/Math.max(.001,scale)),font=radius*1.15;return orderedMarks(doc(),cut||undefined).map(m=>`<g pointer-events="none" data-imp-number="${m.number}"><circle cx="${m.point[0]}" cy="${m.point[1]}" r="${radius}" fill="#0f5499" stroke="white" stroke-width="1"/><text x="${m.point[0]}" y="${m.point[1]+font*.35}" text-anchor="middle" font-size="${font}" font-weight="bold" fill="white">${m.number}</text></g>`).join('');}
  async function removeSelection(room=null){
    if(busy||dirty()||cut||!editable())return toast('Guarda o descarta los cambios antes de limpiar.');
    const current=doc();if(!current)return;
    if(!room&&orderedMarks(current).length&&!confirm('¿Limpiar todas las marcas de este proyecto? El avance y el historial se conservan. Para empezar desde 1 utiliza Nuevo proyecto.'))return;
    busy=true;try{const author=exigirFirma(),next=room?removeRoomMark(current,room.id,author):clearRoomMarks(current,author);if(next!==current)await saveMarking({...next,version:current.version+1},current.version);await reload();clearSelection();redraw();detail();status('Selección guardada. Se conserva el avance del proyecto.');}catch(e){toast('No se pudo limpiar: '+e.message);}finally{busy=false;}
  }
  function newProject(){
    if(busy||dirty()||!editable())return toast('Guarda o descarta los cambios antes de crear otro proyecto.');
    const dialog=document.createElement('dialog');dialog.className='impNewProject';dialog.innerHTML='<form><h2>Nuevo proyecto S01</h2><p>El proyecto actual se conserva. El nuevo empieza sin marcas y con numeración desde 1.</p><label>Nombre del proyecto<input name="name" required maxlength="160" autocomplete="off"></label><p role="status"></p><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary">Crear proyecto</button></form>';
    document.body.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy)return;const name=dialog.querySelector('input').value.trim();if(!name)return;busy=true;const button=dialog.querySelector('[type=submit]');button.disabled=true;try{const next={...nuevoAvanceIMP(catalog,exigirFirma()),id:crypto.randomUUID(),name};await saveMarking(next,0);setActive(next.id);cut='';await reload();clearSelection();redraw();detail();dialog.close();}catch(e){dialog.querySelector('[role=status]').textContent=e.message;}finally{busy=false;button.disabled=false;}};dialog.showModal();
  }
  let autoQueue=Promise.resolve(),autoPending=0,closeAfterSave=false,autoFailed=false;
  function autoSave(form,select){
    if(!editable()||cut||!selected)return;
    const room=selected,projectId=active||'imp-s01-avance-'+catalog.document.sha256.slice(0,16)+'-v'+catalog.registration.version,field=select.name,value=select.value,fields=Object.fromEntries(new FormData(form));
    autoPending++;if(select.tagName==='SELECT')closeAfterSave=true;autoFailed=false;status('Guardando…');form.dataset.dirty='true';
    const run=async()=>{busy=true;let saved=false;
      try{if(active&&active!==projectId)throw Error('El proyecto cambió antes de guardar.');const current=doc(),author=exigirFirma(),base=current||nuevoAvanceIMP(catalog,author),numbered=markRoom(base,room,author);let next;
        if(form.id==='impArtifactsForm'){const values={};for(const a of items(room))for(let i=1;i<=a.quantity;i++)values[a.code+':'+i]=ultimoArtefacto(base,room.id,a.code,i)?.state||'sin_registro';values[field]=value;next=registrarArtefactos(numbered,room,items(room),values,artifacts.source,{author,date:new Date().toLocaleDateString('en-CA')});}
        else next=registrarAvanceIMP(numbered,room,{...fields,state:fields.state,author,id:crypto.randomUUID()});
        if(next!==base){await saveMarking({...next,version:(current?.version||0)+1},current?.version||0);setActive(next.id);}await reload();saved=true;paintLayer=form.id==='impArtifactsForm'?'artifacts':'imp';const layer=document.getElementById('impPaintLayer');if(layer)layer.value=paintLayer;if(select.isConnected&&select.value===value){for(const option of select.options||[])option.defaultSelected=option.value===value;if(!select.options)select.defaultValue=value;}redraw();
      }catch(e){autoFailed=true;status('No se guardó: '+e.message);toast('No se guardó el cambio: '+e.message);if(select.isConnected&&select.value===value){select.value=form.id==='impArtifactsForm'?ultimoArtefacto(doc(),room.id,...field.split(':').map((v,i)=>i?Number(v):v))?.state||'sin_registro':field==='date'?last(room.id)?.date||new Date().toLocaleDateString('en-CA'):field==='note'?last(room.id)?.note||'':last(room.id)?.state||'pendiente';select.dispatchEvent(new Event('imp-sync'));}}
      finally{autoPending--;busy=autoPending>0;if(autoPending===0){root?.querySelectorAll('form').forEach(f=>delete f.dataset.dirty);if(!autoFailed)status('Guardado en este equipo · sincronización automática con tu cuenta.');if(closeAfterSave&&!autoFailed){closeAfterSave=false;roomDialog?.close();}else closeAfterSave=false;}if(saved&&selected?.id===room.id){const art=root.querySelector('.impArtifacts details tbody');if(art)art.innerHTML=[...(doc()?.artifactHistory||[])].filter(e=>e.roomId===room.id).reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.artifact)} · ${e.unit}</td><td>${ART_STATES[e.state]}<br>${esc(e.author)}</td></tr>`).join('');const history=root.querySelector('#impMoreOptions .impHistory tbody');if(history)history.innerHTML=[...(doc()?.history||[])].filter(e=>e.roomId===room.id).reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(IMP_STATES[e.state].name)}</td><td>${esc(e.author)}<small>${esc(e.note)}</small></td></tr>`).join('');const b=document.getElementById('impNumberRoom'),m=doc()?.roomMarks?.find(m=>m.roomId===room.id&&!m.removedAt);if(b&&m){b.textContent='Recinto marcado · N° '+m.number;b.disabled=true;}}}
    };autoQueue=autoQueue.then(run,run);
  }
  function closeRoom(){
    if(autoPending){closeAfterSave=true;status('Guardando… volverás al plano al terminar.');return;}

    if(busy)return toast('Espera a que termine el guardado.');
    if(dirty()&&!confirm('¿Descartar los cambios sin guardar de esta ficha?'))return;
    root?.querySelectorAll('form').forEach(f=>{f.reset();delete f.dataset.dirty;});roomDialog?.close();
  }
  function quickChoices(form){
    form.querySelectorAll('select').forEach(select=>{select.hidden=true;const group=document.createElement('div');group.className='impQuickChoices';group.setAttribute('role','radiogroup');group.setAttribute('aria-label',select.getAttribute('aria-label')||'Estado del recinto');
      const sync=()=>group.querySelectorAll('button').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.value===select.value)));
      for(const option of select.options){const b=document.createElement('button');b.type='button';b.dataset.value=option.value;b.setAttribute('role','radio');b.disabled=select.disabled;b.textContent=option.textContent;b.onclick=()=>{select.value=option.value;sync();select.dispatchEvent(new Event('change',{bubbles:true}));autoSave(form,select);};group.append(b);}select.after(group);select.addEventListener('imp-sync',sync);sync();form.addEventListener('reset',()=>setTimeout(sync,0));
    });
  }
  function mountTools(tools){
    document.body.classList.add('impFullscreen');
    tools.querySelector('#progressLayer').hidden=true;
    tools.insertAdjacentHTML('beforeend',`<select id="impProject" aria-label="Registro de avance IMP">${options()}</select><button id="impNewProject" type="button">Nuevo proyecto</button><button id="impClearSelection" type="button">Limpiar selección</button><select id="impPaintLayer" aria-label="Capa de avance"><option value="imp">Impermeabilización</option><option value="artifacts">Instalación de artefactos</option></select><button id="impExportPDF" type="button">Exportar PDF</button><button id="impExportPNG" type="button">PNG</button>`);
    tools.querySelector('#impNewProject').onclick=newProject;tools.querySelector('#impClearSelection').onclick=()=>removeSelection();for(const id of ['impNewProject','impClearSelection'])tools.querySelector('#'+id).disabled=!editable();
    tools.querySelector('#impProject').value=active||'';tools.querySelector('#impPaintLayer').value=paintLayer;tools.querySelector('#impPaintLayer').onchange=e=>{if(dirty()){e.target.value=paintLayer;toast('Guarda o descarta los cambios antes de cambiar de capa.');return;}paintLayer=e.target.value;redraw();detail();};
    tools.querySelector('#impProject').onchange=e=>{if(dirty()||busy){e.target.value=active||'';toast('Guarda o descarta los cambios antes de cambiar el registro.');return;}setActive(e.target.value||null);cut='';clearSelection();redraw();detail();};
    for(const format of ['PDF','PNG'])tools.querySelector('#impExport'+format).onclick=()=>exportPlan(format.toLowerCase());
    const extra=document.createElement('div');extra.className='impExtraTools';extra.hidden=true;for(const id of ['specialtySheet','progressLayer','impProject','impNewProject','impClearSelection','impPaintLayer','impExportPDF','impExportPNG','specialtyIn','specialtyOut'])extra.append(tools.querySelector('#'+id));tools.append(extra);
    const menu=document.createElement('button');menu.id='impToolsToggle';menu.type='button';menu.textContent='Herramientas';menu.setAttribute('aria-expanded','false');menu.onclick=()=>{extra.hidden=!extra.hidden;menu.setAttribute('aria-expanded',String(!extra.hidden));};tools.prepend(menu);
    const full=document.createElement('button');full.id='impFullscreenToggle';full.type='button';full.textContent='Volver';full.setAttribute('aria-label','Salir de pantalla completa');full.onclick=()=>{document.body.classList.toggle('impFullscreen');full.textContent=document.body.classList.contains('impFullscreen')?'Volver':'Pantalla completa';};tools.prepend(full);const caption=document.createElement('small');caption.id='impProjectCaption';caption.className='impProjectCaption';tools.append(caption);
    tools.querySelector('#specialtyFicha').onclick=()=>{if(!selected)return toast('Toca un recinto para abrir sus opciones.');detail();roomDialog?.showModal();};

  }
  function paint(zone){if(doc()?.roomMarks&&!orderedMarks(doc(),cut||undefined).some(m=>m.roomId===zone.id))return {color:'#45657b',opacity:0};if(paintLayer==='artifacts'){const states=items(zone).flatMap(a=>Array.from({length:a.quantity},(_,i)=>ultimoArtefacto(doc(),zone.id,a.code,i+1,cut||undefined)?.state||'sin_registro'));const done=states.filter(s=>s==='instalado').length;return {color:done===states.length&&done?'#198253':done?'#c58618':'#7a8793',opacity:done?.4:states.includes('no_instalado')?.2:0};}const e=last(zone.id),color=e?IMP_STATES[e.state].color:'#45657b';return {color,opacity:e?.state==='pendiente'?.12:e?.state==='terminado'?.42:e?.state==='observado'?.4:e?.state==='parcial'?.34:e?.state==='ejecucion'?.3:0};}
  const label=room=>paintLayer==='artifacts'?room.code+' · instalación de artefactos PMA S01':room.code+' · '+(last(room.id)?IMP_STATES[last(room.id).state].name:'Sin avance registrado');
  function artifactLegend(){const totals={instalado:0,no_instalado:0,sin_registro:0};for(const room of catalog.rooms.filter(r=>!doc()?.roomMarks||orderedMarks(doc(),cut||undefined).some(m=>m.roomId===r.id)))for(const a of items(room))for(let i=1;i<=a.quantity;i++)totals[ultimoArtefacto(doc(),room.id,a.code,i,cut||undefined)?.state||'sin_registro']++;return Object.entries(ART_STATES).map(([k,n])=>`<span>${n}<b>${totals[k]} unidades</b></span>`).join('');}
  function renderDetail(target,room){
    root=target;selected=room;const caption=document.getElementById('impProjectCaption');if(caption){caption.textContent='Proyecto: '+(doc()?.name||'Avance general S01');caption.title=caption.textContent;}
    if(!roomDialog||!roomDialog.isConnected){roomDialog=document.createElement('dialog');roomDialog.id='impRoomDialog';roomDialog.className='impRoomDialog';roomDialog.setAttribute('aria-label','Ficha rápida del recinto');root.before(roomDialog);roomDialog.append(root);roomDialog.addEventListener('cancel',e=>{e.preventDefault();closeRoom();});}

    const recorded=catalog.rooms.filter(r=>last(r.id)&&(!doc()?.roomMarks||orderedMarks(doc(),cut||undefined).some(m=>m.roomId===r.id))),event=room?last(room.id):null;
    const today=new Date().toLocaleDateString('en-CA');
    root.innerHTML=`<small>IMPERMEABILIZACIÓN · NIVEL −1 · REV01</small><h2>${esc(room?.code||'Plano IMP S01')}</h2>${room?`<h3>${esc(room.name)}</h3>`:''}${room?'':'<p>Toca un recinto o pasillo, o busca su código.</p>'}<p id="impSaveStatus" role="status">${doc()?'Registro guardado en este equipo.':'El avance se guardará al registrar el primer recinto.'}</p>
      ${room?`<form id="impProgressForm" data-sin-flujo><label>Estado del recinto<select name="state" ${editable()?'':'disabled'}>${Object.entries(IMP_STATES).map(([k,s])=>`<option value="${k}" ${event?.state===k?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Fecha del avance<input name="date" type="date" required value="${esc(event?.date||today)}" ${editable()?'':'disabled'}></label><label>Observación (opcional)<textarea name="note" maxlength="1000" rows="2" ${editable()?'':'disabled'}>${esc(event?.note||'')}</textarea></label><button class="primary" type="submit" ${editable()&&!cut?'':'disabled'}>Guardar avance</button><button type="reset">Descartar cambios</button>${editable()?'':'<p>Inicia sesión con permiso de edición para registrar avance.</p>'}${cut?'<p>Consultando un corte histórico. Vuelve al avance actual para registrar.</p>':''}</form><h3>Historial del recinto</h3><div class="impHistory"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Registró / observación</th></tr></thead><tbody>${[...(doc()?.history||[])].filter(e=>e.roomId===room.id).reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(IMP_STATES[e.state].name)}</td><td>${esc(e.author)}<small>${esc(e.note)}<br>${esc(e.at)}</small></td></tr>`).join('')||'<tr><td colspan="3">Sin registros de avance.</td></tr>'}</tbody></table></div>`:''}
      <div class="impLegend" aria-label="Leyenda del avance">${Object.entries(IMP_STATES).map(([k,s])=>`<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${recorded.filter(r=>last(r.id)?.state===k).length}</b></span>`).join('')}</div><details class="impHistoryCut"><summary>Consultar avance por fecha</summary><label>Avance hasta<input id="impCutDate" type="date" value="${esc(cut)}"></label><button id="impCurrent" type="button">Ver avance actual</button></details><details><summary>Fuente y contornos</summary><p>${room?'Contorno de Arquitectura alineado por los ejes del PDF IMP.':'Toca un recinto o pasillo, o busca su código.'}</p><p class="impNote">Los colores originales del PDF indican su alcance documental. El avance se registra por separado.</p>${room?`<p class="impLayers">Capas del PDF en este recinto: ${esc(room.sourceLayers.join(' · ')||'Sin relleno de impermeabilización identificado; confirma el alcance en terreno.')}</p><p class="impNote">${esc(room.geometryQuality==='validated'?'Contorno técnico validado en Arquitectura.':'Contorno de consulta; revisión técnica pendiente.')} No se calculan m².</p>`:''}<p>HPC-ARQ-DET-IMP-A-908 · Rev01 · página 1.</p><p>41 ejes comprobados. Residuo máximo: ${catalog.registration.maxErrorPoints.toFixed(3)} puntos PDF. Calibración v${catalog.registration.version}.</p><p>${catalog.rooms.length} contornos de consulta. Su selección no certifica impermeabilización ejecutada. Códigos del PDF sin contorno disponible: ${esc(catalog.uncontouredCodes.join(', '))}.</p><small>SHA256 ${esc(catalog.document.sha256)}</small></details><a href="source/imp-s01.pdf" target="_blank" rel="noopener">Abrir PDF original ↗</a><button id="impBackup" type="button">Respaldar avance JSON</button>`;
    if(room){const b=document.createElement('button');b.type='button';b.id='impNumberRoom';const mark=orderedMarks(doc(),cut||undefined).find(m=>m.roomId===room.id);b.textContent=mark?'Recinto marcado · N° '+mark.number:'Marcar recinto con número';b.disabled=!!mark||!editable()||!!cut;b.onclick=()=>numberRoom(room);root.querySelector('h2').after(b);if(mark){const remove=document.createElement('button');remove.id='impUnmarkRoom';remove.type='button';remove.textContent='Quitar selección';remove.disabled=!editable()||!!cut;remove.onclick=()=>removeSelection(room);b.after(remove);}}
    for(const id of ['impNewProject','impClearSelection']){const b=document.getElementById(id);if(b)b.disabled=!editable()||!!cut;}
    const form=root.querySelector('#impProgressForm');
    if(form)form.addEventListener('reset',()=>{delete form.dataset.dirty;});
    if(room){
      const section=document.createElement('section');section.className='impArtifacts';
      const list=items(room);section.innerHTML=`<h3>Artefactos del recinto · S01</h3><p>PMA RevB · ${list.reduce((n,a)=>n+a.quantity,0)} unidades previstas</p>${list.length?`<form id="impArtifactsForm" data-sin-flujo><div class="impHistory"><table><thead><tr><th>Artefacto</th><th>Unidad</th><th>Instalación</th></tr></thead><tbody>${list.flatMap(a=>Array.from({length:a.quantity},(_,i)=>{const unit=i+1,state=ultimoArtefacto(doc(),room.id,a.code,unit,cut||undefined)?.state||'sin_registro';return `<tr><td><b>${esc(a.code)}</b><br>${esc(artifactName(a.code))}</td><td>${unit} / ${a.quantity}</td><td><select aria-label="${esc(a.code)} unidad ${unit}" name="${esc(a.code+':'+unit)}" ${editable()&&!cut?'':'disabled'}>${Object.entries(ART_STATES).map(([k,n])=>`<option value="${k}" ${state===k?'selected':''}>${n}</option>`).join('')}</select></td></tr>`;})).join('')}</tbody></table></div><button type="submit" class="primary" ${editable()&&!cut?'':'disabled'}>Guardar y volver al plano</button><button type="reset">Descartar cambios</button></form>`:'<p>Sin artefactos indicados en la fila S01 de esta matriz; no se incorporan artefactos de otros pisos.</p>'}<details><summary>Historial de instalación</summary><div class="impHistory"><table><thead><tr><th>Fecha</th><th>Artefacto</th><th>Estado / autor</th></tr></thead><tbody>${[...(doc()?.artifactHistory||[])].filter(e=>e.roomId===room.id).reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.artifact)} · ${e.unit}</td><td>${ART_STATES[e.state]}<br>${esc(e.author)}</td></tr>`).join('')}</tbody></table></div></details><small>Fuente: HPC PMA Artefactos · nivel A-S01. Las cantidades previstas no indican instalación.</small>`;
      root.querySelector('#impProgressForm').before(section);
      const f=section.querySelector('form');if(f)f.onreset=()=>{delete f.dataset.dirty;};
    }
    root.querySelector('#impCutDate').onchange=e=>{if(dirty()){e.target.value=cut;toast('Guarda o descarta los cambios antes de consultar otra fecha.');return;}cut=e.target.value;redraw();renderDetail(root,selected);};
    root.querySelector('#impCurrent').onclick=()=>{if(dirty()){toast('Guarda o descarta los cambios antes de consultar otra fecha.');return;}cut='';redraw();renderDetail(root,selected);};
    root.querySelector('#impBackup').onclick=()=>{if(!doc())return toast('Todavía no hay avance registrado.');download(new Blob([JSON.stringify({format:'atlas-markings-v1',documents:[doc()]},null,2)],{type:'application/json'}),'Atlas_IMP_S01_avance.json');};
    // Keep only direct-choice controls in the main sheet. The former long form is an optional section.
    if(room){const more=document.createElement('details');more.id='impMoreOptions';const summary=document.createElement('summary');summary.textContent='Opciones del recinto';more.append(summary);const start=root.querySelector('#impProgressForm');let node=start;while(node){const next=node.nextSibling;more.append(node);node=next;}root.append(more);}
    root.querySelectorAll('#impProgressForm,#impArtifactsForm').forEach(f=>{f.querySelectorAll('[type=submit],[type=reset]').forEach(b=>b.remove());f.onsubmit=e=>e.preventDefault();quickChoices(f);});
    const progress=root.querySelector('#impProgressForm');if(progress)for(const input of progress.querySelectorAll('input,textarea'))input.addEventListener('change',()=>autoSave(progress,input));

    const close=document.createElement('button');close.type='button';close.id='impRoomClose';close.className='impRoomClose';close.textContent='Volver al plano';close.onclick=closeRoom;root.prepend(close);
    // Open after the pointer's compatibility click, so a map tap cannot also press a choice in the new sheet.
    if(!room)roomDialog.close();else if(openRequested&&!roomDialog.open)setTimeout(()=>{if(roomDialog?.isConnected&&selected?.id===room.id&&!roomDialog.open)roomDialog.showModal();},0);openRequested=false;
    const selector=document.getElementById('impProject');if(selector){selector.innerHTML=options();selector.value=active||'';}
  }
  async function exportPlan(format){
    if(busy)return;if(dirty())return toast('Guarda o descarta los cambios para exportar el avance confirmado.');
    busy=true;const snapshot=structuredClone(doc()),asOf=cut;const artifactLayer=paintLayer==='artifacts';
    const marks=orderedMarks(snapshot,asOf||undefined);const table=[];for(const m of marks){const room=catalog.rooms.find(r=>r.id===m.roomId);if(!room)continue;const list=items(room);if(!list.length)table.push([String(m.number),room.code,'Sin artefactos indicados en PMA S01','-','No aplica']);for(const a of list)for(let unit=1;unit<=a.quantity;unit++){const e=ultimoArtefacto(snapshot,room.id,a.code,unit,asOf||undefined);table.push([String(m.number),room.code,a.code+' · '+artifactName(a.code),unit+'/'+a.quantity,e?.state==='instalado'?'Sí':e?.state==='no_instalado'?'No':'Sin verificar']);}}
    const buttons=[...document.querySelectorAll('#impExportPDF,#impExportPNG')];buttons.forEach(b=>b.disabled=true);
    try{
      toast('Preparando plano con avance…');
      const rows=catalog.rooms.map(room=>({room,event:ultimoAvanceIMP(snapshot,room.id,asOf||undefined)})).filter(r=>r.event).map(({room,event})=>({...event,name:room.name,parts:room.parts}));
      if(artifactLayer){rows.length=0;for(const room of catalog.rooms){const states=items(room).flatMap(a=>Array.from({length:a.quantity},(_,i)=>ultimoArtefacto(snapshot,room.id,a.code,i+1,asOf||undefined)?.state||'sin_registro'));const done=states.filter(s=>s==='instalado').length;if(states.some(s=>s!=='sin_registro'))rows.push({code:room.code,name:room.name,parts:room.parts,state:done===states.length?'terminado':done?'parcial':'pendiente'});}}
      if(snapshot?.roomMarks){const selectedIds=new Set(marks.map(m=>m.roomId));for(let i=rows.length-1;i>=0;i--)if(!selectedIds.has(catalog.rooms.find(r=>r.code===rows[i].code)?.id))rows.splice(i,1);}
      if(format==='png'){
        const image=new Image();image.src='disciplines/imp-s01/export.webp';await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const g=canvas.getContext('2d');g.drawImage(image,0,0);g.scale(canvas.width/catalog.document.width,canvas.height/catalog.document.height);
        for(const e of rows){const s=IMP_STATES[e.state],path=new Path2D(impPath(e.parts));g.fillStyle=s.color;g.globalAlpha=.36;g.fill(path,'evenodd');g.globalAlpha=1;g.strokeStyle=s.color;g.lineWidth=1;g.stroke(path);}

        for(const m of marks){g.fillStyle='#0f5499';g.beginPath();g.arc(...m.point,7,0,Math.PI*2);g.fill();g.fillStyle='white';g.font='bold 8px sans-serif';g.textAlign='center';g.fillText(String(m.number),m.point[0],m.point[1]+3);}
        const legend=document.createElement('canvas');legend.width=canvas.width;legend.height=canvas.height+220+table.length*38;if(legend.width*legend.height>16000000)throw Error('La tabla supera el tamaño de imagen admitido; exporta en PDF para incluir todas las filas.');const c=legend.getContext('2d');c.fillStyle='white';c.fillRect(0,0,legend.width,legend.height);c.drawImage(canvas,0,0);c.fillStyle='#183858';c.font='bold 26px sans-serif';c.fillText('ATLAS HPC · IMP S01 · Avance '+(asOf||'actual'),25,canvas.height+35);c.font='22px sans-serif';c.fillText('Colores de avance superpuestos; el PDF original conserva su alcance documental.',25,canvas.height+70);Object.values(IMP_STATES).forEach((s,i)=>{const x=25+i*430;c.fillStyle=s.color;c.fillRect(x,canvas.height+105,22,22);c.fillStyle='#183858';c.fillText(s.name,x+30,canvas.height+125);});
        c.font='22px sans-serif';c.fillStyle='#183858';c.fillText('N° | Recinto | Artefacto | Unidad | Instalado',25,canvas.height+190);table.forEach((r,i)=>c.fillText(r.join(' | '),25,canvas.height+225+i*38));
        const blob=await new Promise((resolve,reject)=>legend.toBlob(b=>b?resolve(b):reject(Error('No se pudo generar la imagen.')),'image/png'));download(blob,'Atlas_IMP_S01_avance.png');return;
      }
      await loadVendor('pdf');const {PDFDocument,StandardFonts,rgb}=PDFLib,pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),extra=70+Math.min(24,table.length)*27,plan=pdf.addPage([1100,1640+extra]);plan.pushOperators(PDFLib.pushGraphicsState(),PDFLib.translate(0,extra));
      const response=await fetch(catalog.exportSource);if(!response.ok)throw Error('No se pudo abrir el PDF para exportar. Descarga el paquete del plano para usarlo sin conexión.');
      const source=await PDFDocument.load(await response.arrayBuffer()),sourcePage=source.getPages()[0],box=sourcePage.getCropBox();
      const embedded=await pdf.embedPage(sourcePage,{left:box.x,bottom:box.y,right:box.x+box.width,top:box.y+box.height});
      plan.drawPage(embedded,{x:0,y:60});
      for(const e of rows){const color=IMP_STATES[e.state].color.match(/\w\w/g).map(x=>parseInt(x,16)/255);plan.drawSvgPath(impPath(e.parts),{x:0,y:1620,color:rgb(...color),opacity:.36,borderColor:rgb(...color),borderWidth:1});}
      const safe=s=>String(s).replace(/[^\x20-\xFF]/g,'-');
      plan.drawText(safe('ATLAS HPC | Impermeabilización S01 | Rev01 | Avance '+(asOf||'actual')+(artifactLayer?' | Artefactos':'')),{x:20,y:1625,size:12,font:bold});
      for(const m of marks){plan.drawCircle({x:m.point[0],y:1620-m.point[1],size:7,color:rgb(.06,.33,.6),borderColor:rgb(1,1,1),borderWidth:1});const t=String(m.number);plan.drawText(t,{x:m.point[0]-bold.widthOfTextAtSize(t,8)/2,y:1617-m.point[1],size:8,font:bold,color:rgb(1,1,1)});}
      Object.values(IMP_STATES).forEach((s,i)=>{const color=s.color.match(/\w\w/g).map(x=>parseInt(x,16)/255),x=20+i*215;plan.drawRectangle({x,y:30,width:10,height:10,color:rgb(...color)});plan.drawText(safe(s.name),{x:x+15,y:30,size:11,font});});
      plan.drawText('Capa de avance registrada en Atlas. Los colores originales del PDF no representan avance.',{x:20,y:9,size:10,font});
      // First table chunk is physically below the plan on the same PDF page; overflow repeats the header.
      const chunk=table.slice(0,24);plan.pushOperators(PDFLib.popGraphicsState());
      const drawTable=(p,list,top)=>{p.drawText('RECINTOS MARCADOS - INSTALACIÓN DE ARTEFACTOS S01',{x:20,y:top,size:12,font:bold});const xs=[20,65,245,850,925],widths=[40,175,600,70,150],heads=['N°','Recinto','Artefacto','Unidad','Instalado'];let yy=top-24;const row=(values,b=false)=>{values.forEach((v,i)=>{let t=safe(v);while(font.widthOfTextAtSize(t,10)>widths[i])t=t.slice(0,-2);p.drawText(t,{x:xs[i],y:yy,size:10,font:b?bold:font});});p.drawLine({start:{x:20,y:yy-7},end:{x:1080,y:yy-7},thickness:.4,color:rgb(.7,.7,.7)});yy-=27;};row(heads,true);for(const r of list)row(r);};
      drawTable(plan,chunk,extra-20);for(let i=24;i<table.length;i+=27){const continuation=pdf.addPage([1100,900]);drawTable(continuation,table.slice(i,i+27),860);}
      download(new Blob([await pdf.save()],{type:'application/pdf'}),'Atlas_IMP_S01_avance.pdf');toast('Plano con avance exportado.');
    }catch(e){toast('No se pudo exportar: '+e.message);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
  }
  window.addEventListener('atlas-markings-changed',async e=>{if(!isActive()||busy||e.detail?.origen!=='nube')return;if(dirty())return status('Llegaron cambios de otro equipo. Conserva tus notas; vuelve a abrir el registro antes de guardar.');try{await reload();redraw();detail();}catch(e){toast(e.message);}});
  window.addEventListener('atlas-session-changed',()=>{if(isActive()&&!dirty()&&!busy)detail();});
  return {requestDetail:()=>{openRequested=true;},numberRoom,numberOverlay,layerName:()=>paintLayer==='artifacts'?'Artefactos: verde todos instalados / ámbar parcial / gris no instalados':'Impermeabilización',catalog,mountTools,renderDetail,paint,label,dirty,busy:()=>busy,cut:()=>cut,reload};
}
