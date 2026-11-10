import {readMarkings,saveMarking} from './marking-store.mjs';
import {exigirFirma,firmante} from './firma.mjs';
import {loadVendor} from './web-store.mjs';
import {esImpermeabilizacion,IMP_STATES,nuevoAvanceIMP,registrarAvanceIMP,ultimoAvanceIMP,impPath} from './impermeabilizacion-model.mjs';

// Uses the specialty viewer's SVG, gestures, tiled source and selection. This controller adds progress and export only.
export async function createImpermeabilizacion({esc,toast,download,redraw,detail,isActive}) {
  const response=await fetch('impermeabilizacion/s01.json');
  if(!response.ok)throw Error('No se pudieron cargar los contornos de impermeabilización.');
  const catalog=await response.json();
  let documents=[],active=null,busy=false,cut='',selected=null,root=null;
  const doc=()=>documents.find(d=>d.id===active)||null;
  const last=id=>ultimoAvanceIMP(doc(),id,cut||undefined);
  const editable=()=>{try{return JSON.parse(localStorage.getItem('atlas-nube-sesion'))?.user?.role==='editor'&&!!firmante();}catch{return false;}};
  const dirty=()=>!!root?.isConnected&&!!root.querySelector('form[data-dirty]');
  async function reload(){documents=(await readMarkings()).filter(d=>esImpermeabilizacion(d)&&!d.eliminado&&d.source.sha256===catalog.document.sha256&&d.source.registrationVersion===catalog.registration.version);if(!documents.some(d=>d.id===active))active=documents.find(d=>d.id.startsWith('imp-s01-avance-'))?.id||documents[0]?.id||null;}
  await reload();
  const status=message=>{const el=document.getElementById('impSaveStatus');if(el)el.textContent=message;};
  const options=()=>!documents.length?'<option value="">Avance general · sin registros</option>':documents.map(d=>`<option value="${esc(d.id)}" ${d.id===active?'selected':''}>${esc(d.name)}</option>`).join('');
  function mountTools(tools){
    tools.querySelector('#progressLayer').hidden=true;
    tools.insertAdjacentHTML('beforeend',`<select id="impProject" aria-label="Registro de avance IMP">${options()}</select><button id="impExportPDF" type="button">Exportar PDF</button><button id="impExportPNG" type="button">PNG</button>`);
    tools.querySelector('#impProject').value=active||'';
    tools.querySelector('#impProject').onchange=e=>{if(dirty()||busy){e.target.value=active||'';toast('Guarda o descarta los cambios antes de cambiar el registro.');return;}active=e.target.value||null;cut='';redraw();detail();};
    for(const format of ['PDF','PNG'])tools.querySelector('#impExport'+format).onclick=()=>exportPlan(format.toLowerCase());
  }
  function paint(zone){const e=last(zone.id),color=e?IMP_STATES[e.state].color:'#45657b';return {color,opacity:e?.state==='pendiente'?.12:e?.state==='terminado'?.42:e?.state==='observado'?.4:e?.state==='parcial'?.34:e?.state==='ejecucion'?.3:0};}
  const label=room=>room.code+' · '+(last(room.id)?IMP_STATES[last(room.id).state].name:'Sin avance registrado');
  function renderDetail(target,room){
    root=target;selected=room;
    const recorded=catalog.rooms.filter(r=>last(r.id)),event=room?last(room.id):null;
    const today=new Date().toLocaleDateString('en-CA');
    root.innerHTML=`<small>IMPERMEABILIZACIÓN · NIVEL −1 · REV01</small><h2>${esc(room?.code||'Plano IMP S01')}</h2>${room?`<h3>${esc(room.name)}</h3>`:''}${room?'':'<p>Toca un recinto o pasillo, o busca su código.</p>'}<p id="impSaveStatus" role="status">${doc()?'Registro guardado en este equipo.':'El avance se guardará al registrar el primer recinto.'}</p>
      ${room?`<form id="impProgressForm" data-sin-flujo><label>Estado del recinto<select name="state" ${editable()?'':'disabled'}>${Object.entries(IMP_STATES).map(([k,s])=>`<option value="${k}" ${event?.state===k?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Fecha del avance<input name="date" type="date" required value="${esc(event?.date||today)}" ${editable()?'':'disabled'}></label><label>Observación (opcional)<textarea name="note" maxlength="1000" rows="2" ${editable()?'':'disabled'}>${esc(event?.note||'')}</textarea></label><button class="primary" type="submit" ${editable()&&!cut?'':'disabled'}>Guardar avance</button><button type="reset">Descartar cambios</button>${editable()?'':'<p>Inicia sesión con permiso de edición para registrar avance.</p>'}${cut?'<p>Consultando un corte histórico. Vuelve al avance actual para registrar.</p>':''}</form><h3>Historial del recinto</h3><div class="impHistory"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Registró / observación</th></tr></thead><tbody>${[...(doc()?.history||[])].filter(e=>e.roomId===room.id).reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(IMP_STATES[e.state].name)}</td><td>${esc(e.author)}<small>${esc(e.note)}<br>${esc(e.at)}</small></td></tr>`).join('')||'<tr><td colspan="3">Sin registros de avance.</td></tr>'}</tbody></table></div>`:''}
      <div class="impLegend" aria-label="Leyenda del avance">${Object.entries(IMP_STATES).map(([k,s])=>`<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${recorded.filter(r=>last(r.id)?.state===k).length}</b></span>`).join('')}</div><details class="impHistoryCut"><summary>Consultar avance por fecha</summary><label>Avance hasta<input id="impCutDate" type="date" value="${esc(cut)}"></label><button id="impCurrent" type="button">Ver avance actual</button></details><details><summary>Fuente y contornos</summary><p>${room?'Contorno de Arquitectura alineado por los ejes del PDF IMP.':'Toca un recinto o pasillo, o busca su código.'}</p><p class="impNote">Los colores originales del PDF indican su alcance documental. El avance se registra por separado.</p>${room?`<p class="impLayers">Capas del PDF en este recinto: ${esc(room.sourceLayers.join(' · ')||'Sin relleno de impermeabilización identificado; confirma el alcance en terreno.')}</p><p class="impNote">${esc(room.geometryQuality==='validated'?'Contorno técnico validado en Arquitectura.':'Contorno de consulta; revisión técnica pendiente.')} No se calculan m².</p>`:''}<p>HPC-ARQ-DET-IMP-A-908 · Rev01 · página 1.</p><p>41 ejes comprobados. Residuo máximo: ${catalog.registration.maxErrorPoints.toFixed(3)} puntos PDF. Calibración v${catalog.registration.version}.</p><p>${catalog.rooms.length} contornos de consulta. Su selección no certifica impermeabilización ejecutada. Códigos del PDF sin contorno disponible: ${esc(catalog.uncontouredCodes.join(', '))}.</p><small>SHA256 ${esc(catalog.document.sha256)}</small></details><a href="source/imp-s01.pdf" target="_blank" rel="noopener">Abrir PDF original ↗</a><button id="impBackup" type="button">Respaldar avance JSON</button>`;
    const form=root.querySelector('#impProgressForm');
    if(form){
      form.addEventListener('reset',()=>{delete form.dataset.dirty;form.querySelector('[data-discard]')?.remove();});
      form.onsubmit=async e=>{
        e.preventDefault();if(busy)return;if(!editable()){try{exigirFirma();throw Error('Tu cuenta es de solo lectura.');}catch(f){toast(f.message);}return;}
        if(cut)return;
        const fields=Object.fromEntries(new FormData(form));busy=true;form.querySelector('[type=submit]').disabled=true;status('Guardando…');
        try{
          const current=doc(),author=exigirFirma(),base=current||nuevoAvanceIMP(catalog,author),next=registrarAvanceIMP(base,room,{...fields,author,id:crypto.randomUUID()});
          if(next!==base){await saveMarking({...next,version:(current?.version||0)+1},current?.version||0);active=next.id;}
          delete form.dataset.dirty;await reload();redraw();detail();status('Avance guardado en este equipo. Se sincroniza con tu cuenta al tener conexión.');
        }catch(f){status('No se guardó: '+f.message);toast(f.message);}finally{busy=false;if(form.isConnected)form.querySelector('[type=submit]').disabled=false;}
      };
    }
    root.querySelector('#impCutDate').onchange=e=>{if(dirty()){e.target.value=cut;toast('Guarda o descarta los cambios antes de consultar otra fecha.');return;}cut=e.target.value;redraw();renderDetail(root,selected);};
    root.querySelector('#impCurrent').onclick=()=>{if(dirty()){toast('Guarda o descarta los cambios antes de consultar otra fecha.');return;}cut='';redraw();renderDetail(root,selected);};
    root.querySelector('#impBackup').onclick=()=>{if(!doc())return toast('Todavía no hay avance registrado.');download(new Blob([JSON.stringify({format:'atlas-markings-v1',documents:[doc()]},null,2)],{type:'application/json'}),'Atlas_IMP_S01_avance.json');};
    const selector=document.getElementById('impProject');if(selector){selector.innerHTML=options();selector.value=active||'';}
  }
  async function exportPlan(format){
    if(busy)return;if(dirty())return toast('Guarda o descarta los cambios para exportar el avance confirmado.');
    busy=true;const snapshot=structuredClone(doc()),asOf=cut;
    const buttons=[...document.querySelectorAll('#impExportPDF,#impExportPNG')];buttons.forEach(b=>b.disabled=true);
    try{
      toast('Preparando plano con avance…');
      const rows=catalog.rooms.map(room=>({room,event:ultimoAvanceIMP(snapshot,room.id,asOf||undefined)})).filter(r=>r.event).map(({room,event})=>({...event,name:room.name,parts:room.parts}));
      if(format==='png'){
        const image=new Image();image.src='disciplines/imp-s01/export.webp';await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const g=canvas.getContext('2d');g.drawImage(image,0,0);g.scale(canvas.width/catalog.document.width,canvas.height/catalog.document.height);
        for(const e of rows){const s=IMP_STATES[e.state],path=new Path2D(impPath(e.parts));g.fillStyle=s.color;g.globalAlpha=.36;g.fill(path,'evenodd');g.globalAlpha=1;g.strokeStyle=s.color;g.lineWidth=1;g.stroke(path);}

        const legend=document.createElement('canvas');legend.width=canvas.width;legend.height=canvas.height+180;const c=legend.getContext('2d');c.fillStyle='white';c.fillRect(0,0,legend.width,legend.height);c.drawImage(canvas,0,0);c.fillStyle='#183858';c.font='bold 26px sans-serif';c.fillText('ATLAS HPC · IMP S01 · Avance '+(asOf||'actual'),25,canvas.height+35);c.font='22px sans-serif';c.fillText('Colores de avance superpuestos; el PDF original conserva su alcance documental.',25,canvas.height+70);Object.values(IMP_STATES).forEach((s,i)=>{const x=25+i*430;c.fillStyle=s.color;c.fillRect(x,canvas.height+105,22,22);c.fillStyle='#183858';c.fillText(s.name,x+30,canvas.height+125);});
        const blob=await new Promise((resolve,reject)=>legend.toBlob(b=>b?resolve(b):reject(Error('No se pudo generar la imagen.')),'image/png'));download(blob,'Atlas_IMP_S01_avance.png');return;
      }
      await loadVendor('pdf');const {PDFDocument,StandardFonts,rgb}=PDFLib,pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),plan=pdf.addPage([1100,1640]);
      const response=await fetch(catalog.exportSource);if(!response.ok)throw Error('No se pudo abrir el PDF para exportar. Descarga el paquete del plano para usarlo sin conexión.');
      const source=await PDFDocument.load(await response.arrayBuffer()),sourcePage=source.getPages()[0],box=sourcePage.getCropBox();
      const embedded=await pdf.embedPage(sourcePage,{left:box.x,bottom:box.y,right:box.x+box.width,top:box.y+box.height});
      plan.drawPage(embedded,{x:0,y:60});
      for(const e of rows){const color=IMP_STATES[e.state].color.match(/\w\w/g).map(x=>parseInt(x,16)/255);plan.drawSvgPath(impPath(e.parts),{x:0,y:1620,color:rgb(...color),opacity:.36,borderColor:rgb(...color),borderWidth:1});}
      const safe=s=>String(s).replace(/[^\x20-\xFF]/g,'-');
      plan.drawText(safe('ATLAS HPC | Impermeabilización S01 | Rev01 | Avance '+(asOf||'actual')),{x:20,y:1625,size:12,font:bold});
      Object.values(IMP_STATES).forEach((s,i)=>{const color=s.color.match(/\w\w/g).map(x=>parseInt(x,16)/255),x=20+i*215;plan.drawRectangle({x,y:30,width:10,height:10,color:rgb(...color)});plan.drawText(safe(s.name),{x:x+15,y:30,size:11,font});});
      plan.drawText('Capa de avance registrada en Atlas. Los colores originales del PDF no representan avance.',{x:20,y:9,size:10,font});
      let page,y;
      const newPage=()=>{page=pdf.addPage([595,842]);y=802;};newPage();
      const line=(s,b=false)=>{const words=safe(s).split(/\s+/);let text='';for(const word of words){if(font.widthOfTextAtSize(text+' '+word,10)>515){write(text,b);text=word;}else text+=(text?' ':'')+word;}if(text)write(text,b);};
      const write=(s,b)=>{if(y<45)newPage();page.drawText(s,{x:40,y,size:10,font:b?bold:font});y-=16;};
      line('ATLAS HPC | Registro de avance de impermeabilización',true);line('HPC-ARQ-DET-IMP-A-908 Rev01 | Nivel -1 | Página fuente: 1');line('Exportado: '+new Date().toISOString());line('Registro: '+(snapshot?.name||'Sin registros')+' | Corte: '+(asOf||'actual'));line('Fuente SHA256: '+catalog.document.sha256);line('Contornos ARQ registrados sobre IMP mediante 41 ejes. Calibración v'+catalog.registration.version+'. Revisión técnica pendiente; sin metrado automático.');line('AVANCE AL CORTE ('+rows.length+' recintos)',true);
      for(const e of rows)line([e.code,e.name,IMP_STATES[e.state].name,e.date,e.author,e.note].filter(Boolean).join(' | '));
      line('HISTORIAL DE REGISTROS',true);for(const e of snapshot?.history||[])line([e.code,e.date,IMP_STATES[e.state].name,e.author,e.at,e.note].filter(Boolean).join(' | '));
      download(new Blob([await pdf.save()],{type:'application/pdf'}),'Atlas_IMP_S01_avance.pdf');toast('Plano con avance exportado.');
    }catch(e){toast('No se pudo exportar: '+e.message);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
  }
  window.addEventListener('atlas-markings-changed',async e=>{if(!isActive()||busy||e.detail?.origen!=='nube')return;if(dirty())return status('Llegaron cambios de otro equipo. Conserva tus notas; vuelve a abrir el registro antes de guardar.');try{await reload();redraw();detail();}catch(e){toast(e.message);}});
  window.addEventListener('atlas-session-changed',()=>{if(isActive()&&!dirty()&&!busy)detail();});
  return {catalog,mountTools,renderDetail,paint,label,dirty,busy:()=>busy,cut:()=>cut,reload};
}
