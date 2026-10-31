import {diasHabiles} from './lastplanner-model.mjs';
export function plannedCapacity({people,rate,start,end,quantity}){
 if([people,rate].some(v=>v==null||v===''||!Number.isFinite(Number(v))||Number(v)<0)||!start||!end||end<start)return null;
 const days=diasHabiles(start,end);if(days==null)return null;const value=Number(people)*Number(rate)*days;
 return Number.isFinite(value)&&value>=0?{days,value,shortfall:Math.max(0,Number(quantity)-value)}:null;
}
export function mountActivityWizard(form,{revision=false}){
 const dialog=form.closest('dialog'),blocks=[...form.querySelectorAll('.lpFormBlock')],footer=form.querySelector('footer'),submit=footer.querySelector('[type=submit]');
 dialog.classList.add('lpWizard');form.noValidate=true;
 const titles=['¿Qué trabajo realizaremos?','¿Dónde trabajaremos?','¿Cuándo y cuánto ejecutaremos?','Revisemos antes de guardar'];
 const subtitles=['Identifica la actividad y quién será responsable de ejecutarla.','Selecciona el nivel y los recintos donde se ejecutará la actividad.','Define el plazo y la cantidad comprometida.','Comprueba los antecedentes de la actividad.'];
 const steps=titles.map((title,i)=>{const el=document.createElement('section');el.className='lpWizardStep';el.dataset.step=i;el.innerHTML=`<h3 tabindex="-1">${title}</h3><p>${subtitles[i]}</p>`;form.insertBefore(el,footer);return el;});
 const field=name=>form.elements[name]?.closest('label');
 const grid=document.createElement('div');grid.className='lpFields';steps[0].append(grid);
 for(const name of ['actividad','especialidad','contratista','responsable','responsableOtro']){const el=field(name);if(el)grid.append(el);}
 blocks[1].querySelector('h3').remove();steps[1].append(blocks[1]);
 const details=document.createElement('details');details.className='lpWizardSelection';details.innerHTML='<summary>Ver detalle de la selección</summary>';blocks[1].append(details);
 for(const selector of ['[data-selected-rooms]','[data-selected-scopes]'])details.append(form.querySelector(selector));
 const additional=document.createElement('details');additional.innerHTML='<summary>Ubicación adicional (opcional)</summary>';additional.append(field('sector'),field('frente'),form.querySelector('#lpFrontHelp'));blocks[1].append(additional);
 const counts=document.createElement('p');counts.setAttribute('role','status');blocks[1].insertBefore(counts,details);
 const planGrid=document.createElement('div');planGrid.className='lpFields';steps[2].append(planGrid);
 for(const name of ['inicioPlan','finPlan','cantidad','unidad'])planGrid.append(field(name));
 steps[2].append(form.querySelector('.lpFormContext'),form.querySelector('[data-segments]'),form.querySelector('[data-measurement]'),form.querySelector('[data-use-measurement]'),blocks[0].querySelector('details'));
 form.querySelector('[data-capacity]').hidden=true;
 const capacity=document.createElement('p');capacity.className='lpCycleNote';capacity.dataset.wizardCapacity='';steps[2].querySelector('details').append(capacity);
 blocks[0].remove();
 const review=document.createElement('div');steps[3].append(review);
 const restrictions=document.createElement('details');restrictions.innerHTML='<summary>Restricciones previas y observaciones</summary>';steps[3].append(restrictions);restrictions.append(blocks[2],blocks[3]);
 if(revision)restrictions.open=true;
 const progress=document.createElement('nav');progress.className='lpWizardProgress';progress.setAttribute('aria-label','Etapas de la actividad');progress.innerHTML='<strong data-step-label></strong><progress max="4"></progress><div>'+['Trabajo','Ubicación','Planificación','Revisión'].map((v,i)=>`<button type="button" data-go="${i}">${i+1}. ${v}</button>`).join('')+'</div>';form.prepend(progress);
 const previous=document.createElement('button');previous.type='button';previous.textContent='Anterior';previous.dataset.wizardPrevious='';
 const next=document.createElement('button');next.type='button';next.textContent='Continuar';next.className='primary';next.dataset.wizardNext='';footer.insertBefore(previous,submit);footer.append(next);
 let step=0,rateUnit=form.elements.unidad.value;
 const value=name=>form.elements[name]?.value||'';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function update(){
  counts.textContent=`${form.querySelectorAll('[data-room-edit]').length||form.querySelectorAll('[data-remove-room]').length} recintos seleccionados · ${form.querySelectorAll('[data-remove-scope]:not([data-location-only])').length} superficies seleccionadas`;
  const cap=rateUnit===value('unidad')?plannedCapacity({people:value('dotacion'),rate:value('rendimientoPlan'),start:value('inicioPlan'),end:value('finPlan'),quantity:value('cantidad')}):null;
  capacity.textContent=cap?`Capacidad estimada: ${cap.value.toLocaleString('es-CL')} ${value('unidad')} en ${cap.days} días. Calendario base: lunes a viernes, sin feriados configurados. ${cap.shortfall>0?`La capacidad planificada es inferior al compromiso en ${cap.shortfall.toLocaleString('es-CL')} ${value('unidad')}. Revisa la dotación, el rendimiento o el plazo.`:''}`:(rateUnit!==value('unidad')?'La unidad cambió. Confirma el rendimiento en la nueva unidad para recalcular la capacidad.':'Completa personas, rendimiento y fechas para estimar la capacidad. El rendimiento se expresa en la unidad seleccionada por persona-día.');
  const groups=[['01. Trabajo',[`Actividad: ${value('actividad')}`,`Especialidad: ${value('especialidad')}`,`Contratista: ${value('contratista')}`,`Responsable: ${value('responsable')==='__otro'?value('responsableOtro'):value('responsable')}`]],['02. Ubicación',[form.elements.level.selectedOptions[0]?.textContent,counts.textContent,form.querySelector('[data-selected-axes]').textContent,form.querySelector('[data-selected-scopes]')?.textContent.includes('Muro')?'Muros por recinto: consulta Ver detalle de la selección. Los tramos de contorno requieren verificación física.':'']],['03. Planificación',[`${value('inicioPlan')} → ${value('finPlan')}`,form.querySelector('.lpFormContext').textContent,`${value('cantidad')} ${value('unidad')}`,`Personas previstas: ${value('dotacion')||'Sin definir'}`,form.dataset.resourceAssistant?'':`Rendimiento: ${value('rendimientoPlan')?value('rendimientoPlan')+' '+value('unidad')+'/persona-día':'Sin definir'}`,form.dataset.resourceAssistant?'':capacity.textContent]]];
  review.innerHTML=groups.map(([title,lines],i)=>`<article class="lpWizardReview"><h4>${title}</h4>${lines.filter(Boolean).map(v=>`<p>${esc(v)}</p>`).join('')}<button type="button" data-edit-step="${i}">Editar</button></article>`).join('');
  review.querySelectorAll('[data-edit-step]').forEach(b=>b.onclick=()=>show(Number(b.dataset.editStep)));
 }
 function validate(index){let first;form.elements.finPlan.setCustomValidity(value('finPlan')<value('inicioPlan')?'El término debe ser igual o posterior al inicio.':'');for(const input of steps[index].querySelectorAll('input,select,textarea')){if(input.type==='hidden'||input.hidden||input.disabled)continue;let error=input.parentElement.querySelector('.lpWizardError');if(error)error.remove();input.removeAttribute('aria-invalid');if(!input.checkValidity()){error=document.createElement('span');error.className='lpWizardError';error.id='wizard-error-'+index+'-'+[...steps[index].querySelectorAll('input,select,textarea')].indexOf(input);error.textContent=input.validationMessage;input.after(error);input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);first||=input;}}if(first){show(index,false);for(let parent=first.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;first.focus();return false;}return true;}
 function show(index,focus=true){step=index;steps.forEach((el,i)=>el.hidden=i!==index);progress.querySelector('[data-step-label]').textContent=`Paso ${index+1} de 4`;progress.querySelector('progress').value=index+1;progress.querySelectorAll('[data-go]').forEach((b,i)=>b.setAttribute('aria-current',i===index?'step':'false'));previous.hidden=index===0;next.hidden=index===3;submit.textContent=revision?'Registrar revisión autorizada':'Guardar borrador';submit.hidden=revision&&index!==3;submit.classList.toggle('primary',index===3);update();if(focus){steps[index].querySelector('h3').focus({preventScroll:true});dialog.scrollTop=0;}}
 function advance(target){for(let i=step;i<target;i++)if(!validate(i))return;show(target);}
 previous.onclick=()=>show(step-1);next.onclick=()=>advance(step+1);progress.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>advance(Number(b.dataset.go)));
 form.addEventListener('submit',event=>{for(let i=0;i<4;i++)if(!validate(i)){event.preventDefault();event.stopImmediatePropagation();return;}},true);
 form.addEventListener('input',event=>{if(event.target.name==='rendimientoPlan')rateUnit=value('unidad');update();});form.addEventListener('change',update);
 const observer=new MutationObserver(update);observer.observe(form.querySelector('[data-selected-rooms]'),{childList:true});observer.observe(form.querySelector('[data-selected-scopes]'),{childList:true});observer.observe(form.querySelector('[data-selected-axes]'),{childList:true});
 const cleanup=new MutationObserver(()=>{if(!form.isConnected){observer.disconnect();cleanup.disconnect();}});cleanup.observe(dialog,{childList:true});
 form.insertBefore(form.querySelector('[role=alert]'),footer);show(0,false);
}
