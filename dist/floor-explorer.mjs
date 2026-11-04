// Lightweight entry point. The existing viewer and its runtime load only after a floor is chosen.
import './offline.mjs';
import {iniciarNube} from './nube.mjs';
import {leerMemoria,guardarMemoria} from './navegacion-model.mjs';
import {crearFluido,arrastrar,crearOleaje} from './fluido.mjs';
iniciarNube();
const $=id=>document.getElementById(id),floors=window.ATLAS_TARJETAS,active=window.ATLAS_PISO;
const root=window.ATLAS_RAIZ;
let started=false,ready=false,pending;
const gallery=$('floorExplorer');
const almacen=()=>{try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{}};}};
// Pisos apilados con su plano real: el de más arriba es el piso más alto. Tocar el plano o su etiqueta lo marca; «Continuar» lo abre.
const pila=[...floors].reverse();let elegido=null;
$('floorGrid').innerHTML=pila.map(({id,numero,piso},i)=>`<button type="button" class="pisoCapa" data-floor="${id}" style="--i:${i}" aria-label="Piso ${numero}" aria-pressed="false" ${piso?'':'disabled'}>>${piso?`<img class="pisoBlanco" src="pisos3d/${id.toLowerCase()}-blanco.png" alt="" width="760" height="490" decoding="async"><img class="pisoAzul" src="pisos3d/${id.toLowerCase()}-azul.png" alt="" width="760" height="490" decoding="async">`:''}</button>`).join('');
$('floorLista').innerHTML=pila.map(({id,numero,piso},i)=>`<button type="button" class="pisoEtiqueta" data-floor="${id}" style="--i:${i}" aria-pressed="false" ${piso?'':'disabled'}>Piso ${numero}</button>`).join('');
// Azul: el piso bajo el cursor o, sin cursor encima, el elegido. El elegido lleva ✓ y es el que abre «Continuar».
let bajoCursor=null;
function iluminar(){const azul=bajoCursor??elegido;gallery.querySelectorAll('[data-floor]').forEach(b=>b.classList.toggle('iluminado',b.dataset.floor===azul));}
function marcar(id){elegido=floors.some(f=>f.id===id&&f.piso)?id:null;gallery.querySelectorAll('[data-floor]').forEach(b=>{const marcado=b.dataset.floor===elegido;b.setAttribute('aria-pressed',String(marcado));if(b.classList.contains('pisoEtiqueta'))b.textContent=b.textContent.replace(' ✓','')+(marcado?' ✓':'');});const piso=floors.find(f=>f.id===elegido);$('pisoContinuar').disabled=!elegido;$('pisoContinuar').textContent=elegido?`Continuar a Piso ${piso.numero} →`:'Continuar →';iluminar();}
// Al arrastrar los pisos cambia el elegido; los demás se abren a su alrededor y vuelven con un leve retraso, como agua.
const capas=[...gallery.querySelectorAll('.pisoCapa')],etiquetas=[...gallery.querySelectorAll('.pisoEtiqueta')],lugarDe=id=>pila.findIndex(f=>f.id===id);
const quietud=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// Pasar el cursor ilumina el piso y lo mueve con el mismo flujo del arrastre. Al salir, todo vuelve al piso elegido.
let elegidos=[],lado=[],fila=[],fuerza=[];
function pintarPisos(){const ancho=$('floorGrid').offsetWidth,abre=ancho*.05;capas.forEach((capa,i)=>{const d=i-(elegidos[i]??0),h=fuerza[i]||0,dh=i-(fila[i]||0),cerca=Math.exp(-dh*dh*3),y=abre*Math.tanh(d*1.6)+h*(abre*.8*Math.tanh(dh*1.5)-ancho*.03*cerca);capa.style.setProperty('--y',y.toFixed(1)+'px');capa.style.setProperty('--x',((lado[i]||0)*h*ancho*.035).toFixed(1)+'px');capa.style.setProperty('--e',(1+.04*Math.exp(-d*d*3)+.025*h*cerca).toFixed(3));etiquetas[i].style.setProperty('--y',y.toFixed(1)+'px');});}
const pisos=crearFluido({cantidad:pila.length,inicial:Math.max(0,lugarDe(leerMemoria(almacen()).piso)),quieto:quietud,alCambiar:i=>{if(!pila[i].piso)return;if(bajoCursor){bajoCursor=pila[i].id;iluminar();}else marcar(pila[i].id);},dibujar:posiciones=>{elegidos=posiciones;pintarPisos();}});
const oleaje=crearOleaje({cantidad:pila.length,quieto:quietud,dibujar:(x,f,h)=>{lado=x;fila=f;fuerza=h;pintarPisos();}});
function elegir(id){marcar(id);if(elegido)pisos.ir(lugarDe(elegido));}
marcar(leerMemoria(almacen()).piso);pisos.redibujar();
arrastrar($('floorGrid'),pisos,{eje:'y',sentido:1,paso:()=>$('floorGrid').offsetWidth*.285,alSoltar:()=>{const id=pila[pisos.indice()].id;bajoCursor=null;marcar(id);}});
function seguir(lugar,ladoCursor){const i=Math.round(Math.max(0,Math.min(pila.length-1,lugar)));if(quietud()){bajoCursor=pila[i].id;iluminar();return;}bajoCursor=pila[i].id;iluminar();pisos.tomar();pisos.llevar(Math.max(0,Math.min(pila.length-1,lugar)));oleaje.mover(ladoCursor,lugar);}
function dejar(){if(!bajoCursor)return;bajoCursor=null;iluminar();oleaje.soltar();if(elegido)pisos.ir(lugarDe(elegido));else pisos.soltar();}
$('floorGrid').addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||e.buttons)return;const r=$('floorGrid').getBoundingClientRect();seguir((e.clientY-r.top-r.width*.29)/(r.width*.285),Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)));});
$('floorGrid').addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!e.buttons)dejar();});
etiquetas.forEach((b,i)=>{b.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!e.buttons)seguir(i,.6);});b.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')dejar();});});
const safeToLeave=()=>window.dispatchEvent(new Event('atlas-before-floor-change',{cancelable:true}));
function state(home){
 document.body.classList.toggle('floorHome',home);gallery.hidden=!home;$('floorHomeButton').hidden=home;
 $('globalSearch').disabled=home||!ready;$('navToggle').disabled=home||!ready;
 $('bottomObra').disabled=home||!ready;
 $('navPiso').textContent=home?'Hospital Provincia Cordillera':'Piso '+active.corto;
 if(home)document.querySelector('header .project span').textContent='Atlas HPC';else window.dispatchEvent(new Event('atlas-piso-visible'));
 // Buttons added by the viewer should not appear above the entry screen.
 for(const id of ['assistantOpen','diamondCatalogOpen'])if($(id))$(id).hidden=home;
}
function home(push=true){
 if(!safeToLeave())return;
 const alreadyHome=document.body.classList.contains('floorHome');window.dispatchEvent(new Event('atlas-floor-home'));state(true);if(push&&!alreadyHome)history.pushState(null,'',root);if(!alreadyHome)elegir(active.id);
 $('floorExplorerTitle').tabIndex=-1;$('floorExplorerTitle').focus({preventScroll:true});
}
async function openFloor(id,push=true){
 const floor=floors.find(f=>f.id===id)?.piso;if(!floor||!safeToLeave())return;
 guardarMemoria(almacen(),{piso:id});
 if(id!==active.id){location.assign(root+'?nivel='+encodeURIComponent(id));return;}
 if(push)history.pushState(null,'',root+'?nivel='+encodeURIComponent(id));
 state(false);
 if(!started){started=true;document.body.classList.add('booting');$('loading').hidden=false;pending=import('./app.js').catch(()=>{started=false;$('loading').innerHTML='<span>No se pudo abrir el visor.</span><button id="floorRetry">Reintentar</button>';$('floorRetry').onclick=()=>location.reload();});}
 await pending;
 if(ready)window.dispatchEvent(new Event('atlas-floor-resume'));
}
gallery.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>elegir(b.dataset.floor));
$('pisoContinuar').onclick=()=>{if(elegido)openFloor(elegido);};
// En computador no hay «Continuar»: doble clic sobre un piso entra a él. Con teclado, Enter.
const conCursorFino=()=>matchMedia('(hover: hover) and (pointer: fine)').matches;
gallery.querySelectorAll('[data-floor]').forEach(b=>{b.ondblclick=()=>openFloor(b.dataset.floor);b.onkeydown=e=>{if(e.key==='Enter'&&conCursorFino()){e.preventDefault();openFloor(b.dataset.floor);}};});
$('floorHomeButton').onclick=()=>home();
// «Pisos» vuelve a la portada. Las acciones internas «Volver al plano» siguen en el visor.
document.addEventListener('click',e=>{if(e.target.closest('#bottomMap')){e.preventDefault();e.stopImmediatePropagation();home();}},true);
window.addEventListener('atlas-ready',()=>{ready=true;state(document.body.classList.contains('floorHome'));});
window.addEventListener('popstate',()=>{
 const id=new URLSearchParams(location.search).get('nivel');
 if(id&&floors.some(f=>f.id===id&&f.piso))openFloor(id,false);else home(false);
});
// Preserve existing explicit floor links, QR room links, and module deep links.
const requested=new URLSearchParams(location.search).get('nivel');
if(floors.some(f=>f.id===requested&&f.piso)||(!requested&&location.hash))openFloor(active.id,false);else state(true);
window.addEventListener('hashchange',()=>{if(location.hash&&document.body.classList.contains('floorHome')){if(ready)state(false);else openFloor(active.id,false);}});
// Jerarquía de obra: un supervisor o capataz con pisos en su perfil solo abre sus pisos. Sin perfil, todos como hoy.
async function limitarPisos(){
 try{
  const [{sessionActor,perfilGuardado},{pisoVisible}]=await Promise.all([import('./lastplanner-session.mjs'),import('./jerarquia-model.mjs')]);
  const actor=sessionActor(),perfil=actor&&perfilGuardado(actor.id);
  for(const f of floors){if(!f.original)f.original=f.piso||null;f.piso=f.original&&pisoVisible(perfil,f.id)?f.original:null;}
  gallery.querySelectorAll('[data-floor]').forEach(b=>{b.disabled=!floors.find(f=>f.id===b.dataset.floor)?.piso;});
  if(elegido&&!floors.some(f=>f.id===elegido&&f.piso))marcar(floors.find(f=>f.piso)?.id||null);
  if(!document.body.classList.contains('floorHome')&&!floors.some(f=>f.id===active.id&&f.piso))home();
 }catch{}
}
limitarPisos();window.addEventListener('atlas-jerarquia-changed',limitarPisos);window.addEventListener('atlas-session-changed',limitarPisos);
// Set up update detection even when the user stays on the cards without opening a plan.
window.dispatchEvent(new Event('atlas-shell-ready'));
