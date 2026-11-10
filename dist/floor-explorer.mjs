// Lightweight entry point. The existing viewer and its runtime load only after a floor is chosen.
// Orden de entrada: módulo → piso → módulo abierto. Los enlaces con piso, los QR y las tareas entran directo.
import './offline.mjs';
import './dispositivo.mjs';
import {iniciarNube} from './nube.mjs';
import {leerMemoria,guardarMemoria,MODULOS,moduloDe,conPortada,consultaPiso,leerConsulta,pisosEnOrden,pisoParaAbrir} from './navegacion-model.mjs';
import {crearFluido,arrastrar,crearOleaje} from './fluido.mjs';
import {crearPista} from './selector-flujo.mjs';
iniciarNube();
const $=id=>document.getElementById(id),floors=window.ATLAS_TARJETAS,active=window.ATLAS_PISO;
const root=window.ATLAS_RAIZ;
let started=false,ready=false,pending;
const gallery=$('floorExplorer'),seccionModulos=$('moduloExplorer');
const almacen=()=>{try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{}};}};
// Módulo elegido. Un enlace directo a un piso abre Plano; al entrar normal queda marcado el último de este equipo.
const pedido=leerConsulta(location.search);
let modulo=pedido.modulo||(pedido.nivel||location.hash?'plano':leerMemoria(almacen()).modulo)||'control',moduloAbierto=null,vista='modulos';
const lugarModulo=id=>Math.max(0,MODULOS.findIndex(m=>m.id===id));
$('moduloPista').innerHTML=MODULOS.map(m=>`<button type="button" class="ruedaTarjeta" data-modulo="${m.id}" aria-pressed="false"><svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${m.dibujo}</svg><strong>${m.titulo}</strong><small>${m.texto}</small></button>`).join('');
function marcarModulo(id){modulo=id;seccionModulos.querySelectorAll('[data-modulo]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modulo===id)));$('moduloContinuar').textContent=`Continuar a ${moduloDe(id).titulo} →`;}
const pistaModulos=crearPista($('moduloPista'),{inicial:lugarModulo(modulo),alCambiar:i=>marcarModulo(MODULOS[i].id)});
pistaModulos.tarjetas.forEach(b=>b.onclick=()=>{marcarModulo(b.dataset.modulo);pistaModulos.ir(lugarModulo(b.dataset.modulo));});
marcarModulo(modulo);
// Pisos apilados con su plano real: el de más arriba es el piso más alto. Tocar el plano o su etiqueta lo marca; «Continuar» lo abre.
const pila=[...floors].reverse();let elegidos=[];
const orden=floors.map(f=>f.id),disponible=id=>floors.some(f=>f.id===id&&f.piso);
function mostrar(nombre){vista=nombre;seccionModulos.hidden=nombre!=='modulos';gallery.hidden=nombre!=='pisos';if(nombre==='modulos')pistaModulos.acomodar(lugarModulo(modulo));else{$('floorModulo').textContent=moduloDe(modulo).titulo;pisos.redibujar();}}
$('floorGrid').innerHTML=pila.map(({id,numero,piso},i)=>`<button type="button" class="pisoCapa" data-floor="${id}" style="--i:${i}" aria-label="Piso ${numero}" aria-pressed="false" ${piso?'':'disabled'}>>${piso?`<img class="pisoBlanco" src="pisos3d/${id.toLowerCase()}-blanco.png" alt="" width="760" height="490" decoding="async"><img class="pisoAzul" src="pisos3d/${id.toLowerCase()}-azul.png" alt="" width="760" height="490" decoding="async">`:''}</button>`).join('');
$('floorLista').innerHTML=pila.map(({id,numero,piso},i)=>`<button type="button" class="pisoEtiqueta" data-floor="${id}" style="--i:${i}" aria-pressed="false" ${piso?'':'disabled'}>Piso ${numero}</button>`).join('');
// Azul: el piso bajo el cursor o, sin cursor encima, los elegidos. Cada elegido lleva ✓ y «Continuar» los abre.
let bajoCursor=null,puedeVarios=false;
// Control y Protocolos permiten varios pisos a las jefaturas. Plano muestra uno solo por pantalla.
const varios=()=>puedeVarios&&conPortada(modulo);
function iluminar(){const azules=bajoCursor?[bajoCursor]:elegidos;gallery.querySelectorAll('[data-floor]').forEach(b=>b.classList.toggle('iluminado',azules.includes(b.dataset.floor)));}
function pintarElegidos(){gallery.querySelectorAll('[data-floor]').forEach(b=>{const marcado=elegidos.includes(b.dataset.floor);b.setAttribute('aria-pressed',String(marcado));if(b.classList.contains('pisoEtiqueta'))b.textContent=b.textContent.replace(' ✓','')+(marcado?' ✓':'');});const piso=floors.find(f=>f.id===elegidos[0]);$('pisoContinuar').disabled=!elegidos.length;$('pisoContinuar').textContent=elegidos.length>1?`Continuar a ${elegidos.length} pisos →`:piso?`Continuar a Piso ${piso.numero} →`:'Continuar →';iluminar();}
function marcar(id){elegidos=disponible(id)?[id]:[];pintarElegidos();}
function alternar(id){if(!disponible(id))return;elegidos=elegidos.includes(id)?elegidos.filter(x=>x!==id):[...elegidos,id];pintarElegidos();}
// Al llegar a los pisos: con varios, los últimos elegidos; con uno solo, el último que se abrió.
function prepararPisos(){
 $('floorExplorerTitle').textContent=varios()?'Selecciona uno o más pisos':'Selecciona el piso';
 $('floorExplorerAyuda').textContent=varios()?'Puedes elegir los pisos que necesites. Se ven de a uno, y entre ellos te mueves con una franja.':'Elige el piso del hospital para trabajar.';
 if(varios()){const previos=leerMemoria(almacen()).pisos.filter(disponible);if(previos.length)elegidos=previos;else elegidos=elegidos.filter(disponible);pintarElegidos();}
 else if(elegidos.length!==1)marcar(elegidos.at(-1)??leerMemoria(almacen()).piso);
}
// Al arrastrar los pisos cambia el elegido; los demás se abren a su alrededor y vuelven con un leve retraso, como agua.
const capas=[...gallery.querySelectorAll('.pisoCapa')],etiquetas=[...gallery.querySelectorAll('.pisoEtiqueta')],lugarDe=id=>pila.findIndex(f=>f.id===id);
const quietud=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// Pasar el cursor ilumina el piso y lo mueve con el mismo flujo del arrastre. Al salir, todo vuelve al piso elegido.
let colocados=[],lado=[],fila=[],fuerza=[];
function pintarPisos(){const ancho=$('floorGrid').offsetWidth,abre=ancho*.05;capas.forEach((capa,i)=>{const d=i-(colocados[i]??0),h=fuerza[i]||0,dh=i-(fila[i]||0),cerca=Math.exp(-dh*dh*3),y=abre*Math.tanh(d*1.6)+h*(abre*.8*Math.tanh(dh*1.5)-ancho*.03*cerca);capa.style.setProperty('--y',y.toFixed(1)+'px');capa.style.setProperty('--x',((lado[i]||0)*h*ancho*.035).toFixed(1)+'px');capa.style.setProperty('--e',(1+.04*Math.exp(-d*d*3)+.025*h*cerca).toFixed(3));etiquetas[i].style.setProperty('--y',y.toFixed(1)+'px');});}
const pisos=crearFluido({cantidad:pila.length,inicial:Math.max(0,lugarDe(leerMemoria(almacen()).piso)),quieto:quietud,alCambiar:i=>{if(!pila[i].piso)return;if(bajoCursor){bajoCursor=pila[i].id;iluminar();}else if(!varios())marcar(pila[i].id);},dibujar:posiciones=>{colocados=posiciones;pintarPisos();}});
const oleaje=crearOleaje({cantidad:pila.length,quieto:quietud,dibujar:(x,f,h)=>{lado=x;fila=f;fuerza=h;pintarPisos();}});
function elegir(id){if(varios()){alternar(id);return;}marcar(id);if(elegidos[0])pisos.ir(lugarDe(elegidos[0]));}
marcar(leerMemoria(almacen()).piso);pisos.redibujar();
arrastrar($('floorGrid'),pisos,{eje:'y',sentido:1,paso:()=>$('floorGrid').offsetWidth*.285,alSoltar:()=>{const id=pila[pisos.indice()].id;bajoCursor=null;if(varios())iluminar();else marcar(id);}});
function seguir(lugar,ladoCursor){const i=Math.round(Math.max(0,Math.min(pila.length-1,lugar)));if(quietud()){bajoCursor=pila[i].id;iluminar();return;}bajoCursor=pila[i].id;iluminar();pisos.tomar();pisos.llevar(Math.max(0,Math.min(pila.length-1,lugar)));oleaje.mover(ladoCursor,lugar);}
function dejar(){if(!bajoCursor)return;bajoCursor=null;iluminar();oleaje.soltar();const ultimo=elegidos.at(-1);if(ultimo)pisos.ir(lugarDe(ultimo));else pisos.soltar();}
$('floorGrid').addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||e.buttons)return;const r=$('floorGrid').getBoundingClientRect();seguir((e.clientY-r.top-r.width*.29)/(r.width*.285),Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)));});
$('floorGrid').addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!e.buttons)dejar();});
etiquetas.forEach((b,i)=>{b.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!e.buttons)seguir(i,.6);});b.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')dejar();});});
const safeToLeave=()=>window.dispatchEvent(new Event('atlas-before-floor-change',{cancelable:true}));
function state(home){
 document.body.classList.toggle('floorHome',home);$('floorHomeButton').hidden=home;
 if(home)mostrar(vista);else{seccionModulos.hidden=true;gallery.hidden=true;}
 $('moduloVolver').hidden=!ready||!moduloAbierto;
 $('globalSearch').disabled=home||!ready;$('navToggle').disabled=home||!ready;
 $('bottomObra').disabled=home||!ready;$('bottomModulos').disabled=home||!ready;
 $('navPiso').textContent=home?'Hospital Provincia Cordillera':'Piso '+active.corto;
 if(home)document.querySelector('header .project span').textContent='Atlas HPC';else window.dispatchEvent(new Event('atlas-piso-visible'));
 // Buttons added by the viewer should not appear above the entry screen.
 for(const id of ['assistantOpen','diamondCatalogOpen'])if($(id))$(id).hidden=home;
}
function enfocar(id){$(id).tabIndex=-1;$(id).focus({preventScroll:true});}
// Vuelve a la pantalla de pisos, con el módulo que estaba abierto.
function home(push=true){
 if(!safeToLeave())return;
 const alreadyHome=document.body.classList.contains('floorHome');window.dispatchEvent(new Event('atlas-floor-home'));prepararPisos();vista='pisos';state(true);if(push&&!alreadyHome)history.pushState(null,'',root+'?modulo='+modulo);if(!alreadyHome)pisos.ir(lugarDe(active.id));
 enfocar('floorExplorerTitle');
}
function irAModulos(push=true){
 if(!safeToLeave())return;
 window.dispatchEvent(new Event('atlas-floor-home'));vista='modulos';state(true);if(push)history.pushState(null,'',root);
 enfocar('moduloTitulo');
}
// Con un solo piso disponible (un capataz en su piso) no hay nada que elegir: entra directo.
function continuarModulo(){
 guardarMemoria(almacen(),{modulo});
 const disponibles=floors.filter(f=>f.piso);
 if(disponibles.length===1){openFloor(disponibles[0].id);return;}
 prepararPisos();vista='pisos';state(true);history.pushState(null,'',root+'?modulo='+modulo);enfocar('floorExplorerTitle');
}
// lista: los pisos elegidos. El que se abre (id) es el que queda cargado y a la vista.
async function openFloor(id,push=true,lista=[id]){
 const floor=floors.find(f=>f.id===id)?.piso;if(!floor||!safeToLeave())return;
 const abiertos=conPortada(modulo)?lista:[id];
 guardarMemoria(almacen(),{piso:id,modulo,pisos:abiertos});
 window.ATLAS_MODULO=modulo;window.ATLAS_PISOS_ELEGIDOS=abiertos;moduloAbierto=modulo;
 const direccion=root+consultaPiso({nivel:id,modulo,pisos:abiertos});
 if(id!==active.id){location.assign(direccion);return;}
 if(push)history.pushState(null,'',direccion);
 state(false);
 if(!started){started=true;document.body.classList.add('booting');$('loading').hidden=false;pending=import('./app.js').catch(()=>{started=false;$('loading').innerHTML='<span>No se pudo abrir el visor.</span><button id="floorRetry">Reintentar</button>';$('floorRetry').onclick=()=>location.reload();});}
 await pending;
 if(ready)window.dispatchEvent(new Event('atlas-floor-resume'));
}
gallery.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>elegir(b.dataset.floor));
// «Continuar» se usa siempre, en celular y en computador.
$('pisoContinuar').onclick=()=>{if(!elegidos.length)return;const lista=pisosEnOrden(elegidos,orden);openFloor(pisoParaAbrir(lista,active.id),true,lista);};
$('pisoVolver').onclick=()=>irAModulos();
$('moduloContinuar').onclick=continuarModulo;
// Volver a lo que estaba abierto, sin cambiar de módulo.
$('moduloVolver').onclick=()=>{marcarModulo(moduloAbierto);openFloor(active.id,true,window.ATLAS_PISOS_ELEGIDOS);};
$('floorHomeButton').onclick=()=>home();
// «Pisos» y «Módulos» vuelven a la portada. Las acciones internas «Volver al plano» siguen en el visor.
document.addEventListener('click',e=>{if(e.target.closest('#bottomMap')){e.preventDefault();e.stopImmediatePropagation();home();}else if(e.target.closest('#bottomModulos')){e.preventDefault();e.stopImmediatePropagation();irAModulos();}},true);
window.addEventListener('atlas-ready',()=>{ready=true;state(document.body.classList.contains('floorHome'));});
window.addEventListener('popstate',()=>{
 const {nivel,modulo:enDireccion,pisos:lista}=leerConsulta(location.search);
 if(enDireccion)marcarModulo(enDireccion);
 if(nivel&&disponible(nivel)){if(!enDireccion)marcarModulo('plano');openFloor(nivel,false,lista.length?lista:[nivel]);}
 else if(enDireccion)home(false);else irAModulos(false);
});
// Preserve existing explicit floor links, QR room links, and module deep links.
if(disponible(pedido.nivel)||(!pedido.nivel&&location.hash))openFloor(active.id,false,pedido.pisos.length?pedido.pisos:[active.id]);else{vista=pedido.modulo?'pisos':'modulos';if(pedido.modulo)prepararPisos();state(true);}
window.addEventListener('hashchange',()=>{if(location.hash&&document.body.classList.contains('floorHome')){if(ready)state(false);else openFloor(active.id,false);}});
// Jerarquía de obra: un supervisor o capataz con pisos en su perfil solo abre sus pisos. Sin perfil, todos como hoy.
async function limitarPisos(){
 try{
  const [{sessionActor,perfilGuardado},{pisoVisible,puedeVariosPisos}]=await Promise.all([import('./lastplanner-session.mjs'),import('./jerarquia-model.mjs')]);
  const actor=sessionActor(),perfil=actor&&perfilGuardado(actor.id);
  for(const f of floors){if(!f.original)f.original=f.piso||null;f.piso=f.original&&pisoVisible(perfil,f.id)?f.original:null;}
  gallery.querySelectorAll('[data-floor]').forEach(b=>{b.disabled=!floors.find(f=>f.id===b.dataset.floor)?.piso;});
  puedeVarios=!!puedeVariosPisos(perfil);
  elegidos=elegidos.filter(disponible);if(!elegidos.length)marcar(floors.find(f=>f.piso)?.id||null);
  if(vista==='pisos')prepararPisos();
  if(!document.body.classList.contains('floorHome')&&!floors.some(f=>f.id===active.id&&f.piso))home();
 }catch{}
}
limitarPisos();window.addEventListener('atlas-jerarquia-changed',limitarPisos);window.addEventListener('atlas-session-changed',limitarPisos);
// Set up update detection even when the user stays on the cards without opening a plan.
window.dispatchEvent(new Event('atlas-shell-ready'));
