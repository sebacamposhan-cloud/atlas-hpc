export function createAssistant(ctx){
 const open=document.createElement('button');open.id='assistantOpen';open.textContent='Asistente';open.type='button';document.querySelector('body>header').append(open);
 const dialog=document.createElement('dialog');dialog.id='assistantDialog';dialog.innerHTML='<div class="assistantHead"><h2>Asistente Atlas</h2><button id="assistantClose" aria-label="Cerrar asistente">×</button></div><p>Envía a Groq tu consulta y la ficha original del recinto seleccionado. Las respuestas de IA requieren revisión.</p><div id="assistantMessages" aria-live="polite" role="log"></div><form id="assistantForm"><label for="assistantQuestion">Tu consulta</label><textarea id="assistantQuestion" maxlength="12000" rows="3" required></textarea><div class="assistantActions"><button id="assistantClear" type="button">Nueva conversación</button><button id="assistantSend">Enviar</button></div></form>';document.body.append(dialog);
 let messages=[],busy=false,controller;
 const $=id=>dialog.querySelector('#'+id),append=(role,text)=>{const p=document.createElement('p');p.className=role;p.textContent=(role==='user'?'Tú: ':role==='assistant'?'Asistente: ':'')+text;$('assistantMessages').append(p);p.scrollIntoView({block:'nearest'});};
 open.onclick=()=>dialog.showModal();$('assistantClose').onclick=()=>dialog.close();
 $('assistantClear').onclick=()=>{messages=[];$('assistantMessages').replaceChildren();};
 $('assistantForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const text=$('assistantQuestion').value.trim();if(!text)return;
  busy=true;$('assistantSend').disabled=true;$('assistantClear').disabled=true;append('user',text);
  controller=new AbortController();const timer=setTimeout(()=>controller.abort(),40000);
  const pending=[...messages,{role:'user',content:text}].slice(-15);
  try{const res=await fetch('/api/groq/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:pending,roomId:ctx.selected()?.id||null}),signal:controller.signal});
   if(res.status===404||res.status===405)throw Error('El asistente requiere el backend Atlas con Groq. Configura e inicia server/groq-server.mjs.');
   const value=await res.json();if(!res.ok)throw Error(value.error||'No se pudo consultar al asistente.');
   if(typeof value.answer!=='string')throw Error('Respuesta no compatible.');
   messages=[...pending,{role:'assistant',content:value.answer}];append('assistant',value.answer);$('assistantQuestion').value='';
  }catch(e){append('error',e.name==='AbortError'?'La consulta tardó demasiado. Puedes reintentar.':e.message);}finally{clearTimeout(timer);busy=false;$('assistantSend').disabled=false;$('assistantClear').disabled=false;}
 };
}
