// Lightweight entry point. The existing viewer and its runtime load only after a floor is chosen.
// Orden de entrada: módulo → piso → módulo abierto. Los enlaces con piso, los QR y las tareas entran directo.
import './offline.mjs';
import './dispositivo.mjs';
import {iniciarNube} from './nube.mjs';
import {leerMemoria,guardarMemoria,MODULOS,moduloDe,conPortada,consultaPiso,leerConsulta,pisosEnOrden,pisoParaAbrir,pisoDeEntrada} from './navegacion-model.mjs';
import {crearFluido,arrastrar,crearOleaje} from './fluido.mjs';
import {crearPista} from './selector-flujo.mjs';
import {crearRodillo} from './rodillo-pisos.mjs';
import {MARCA} from './level.mjs';
let rodilloPiso=null;
iniciarNube();
const $=id=>document.getElementById(id),floors=window.ATLAS_TARJETAS,active=window.ATLAS_PISO;
const root=window.ATLAS_RAIZ;
let started=false,ready=false,pending;
const gallery=$('floorExplorer'),seccionModulos=$('moduloExplorer');
const almacen=()=>{try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{}};}};
// Módulo elegido. Un enlace directo a un piso abre Plano; al entrar normal queda marcado el último de este equipo.
const pedido=leerConsulta(location.search);
// Sin pantalla de módulos: Atlas siempre trabaja en Plano; Control y Protocolos están en «Más» y en la columna izquierda.
let modulo='plano',moduloAbierto=null,vista='modulos';
const lugarModulo=id=>Math.max(0,MODULOS.findIndex(m=>m.id===id));
$('moduloPista').innerHTML=MODULOS.map(m=>`<button type="button" class="ruedaTarjeta" data-modulo="${m.id}" aria-pressed="false"><svg class="panelArt" viewBox="0 0 160 100" aria-hidden="true">${m.dibujo}</svg><strong>${m.titulo}</strong><small>${m.texto}</small></button>`).join('');
function marcarModulo(id){modulo=id;seccionModulos.querySelectorAll('[data-modulo]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modulo===id)));$('moduloContinuar').textContent=`Continuar a ${moduloDe(id).titulo} →`;}
const pistaModulos=crearPista($('moduloPista'),{inicial:lugarModulo(modulo),alCambiar:i=>marcarModulo(MODULOS[i].id)});
pistaModulos.tarjetas.forEach(b=>b.onclick=()=>{marcarModulo(b.dataset.modulo);pistaModulos.ir(lugarModulo(b.dataset.modulo));});
marcarModulo(modulo);
// Pisos apilados con su plano real: el de más arriba es el piso más alto. Tocar el plano o su etiqueta lo marca; «Continuar» lo abre.
const pila=[...floors].reverse();let elegidos=[];
// Cantidad de pisos para el alto de la pila: con muchos, la portada se desplaza hasta el piso elegido (navegacion.css).
gallery.style.setProperty('--n',String(pila.length));
const orden=floors.map(f=>f.id),disponible=id=>floors.some(f=>f.id===id&&f.piso);
function mostrar(nombre){vista=nombre;seccionModulos.hidden=nombre!=='modulos';gallery.hidden=nombre!=='pisos';if(nombre==='modulos')pistaModulos.acomodar(lugarModulo(modulo));else{$('floorModulo').textContent=moduloDe(modulo).titulo;pisos.redibujar();if(pila.length>5)gallery.querySelector(`.pisoCapa[data-floor="${elegidos[0]}"]`)?.scrollIntoView?.({block:'center'});}}
$('floorGrid').innerHTML=pila.map(({id,numero,piso},i)=>`<button type="button" class="pisoCapa" data-floor="${id}" style="--i:${i}" aria-label="Piso ${numero}" aria-pressed="false" ${piso?'':'disabled'}>${piso?`<img class="pisoBlanco" src="pisos3d/${id.toLowerCase()}-blanco.png" alt="" width="760" height="490" decoding="async"><img class="pisoAzul" src="pisos3d/${id.toLowerCase()}-azul.png" alt="" width="760" height="490" decoding="async">`:''}</button>`).join('');
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
const pisos=crearFluido({cantidad:pila.length,inicial:Math.max(0,lugarDe(leerMemoria(almacen()).piso)),quieto:quietud,alCambiar:i=>{if(pila.length>5)capas[i]?.scrollIntoView?.({block:'nearest'});if(!pila[i].piso)return;if(bajoCursor){bajoCursor=pila[i].id;iluminar();}else if(!varios())marcar(pila[i].id);},dibujar:posiciones=>{colocados=posiciones;pintarPisos();}});
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
 if(home)document.querySelector('header .project > span:last-child').textContent=MARCA;else window.dispatchEvent(new Event('atlas-piso-visible'));
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
 window.ATLAS_MODULO='plano';window.ATLAS_PISOS_ELEGIDOS=abiertos;moduloAbierto=modulo;
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
// Sin pantalla de módulos, «Volver» desde la pila de pisos regresa al plano abierto.
$('pisoVolver').onclick=()=>{if(ready&&disponible(active.id))openFloor(active.id,true,[active.id]);else irAModulos();};
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
// Atlas entra directo al plano de su piso (el último abierto o el primero asignado), en el celular y en el escritorio.
// Los pisos se cambian desde tu cuenta (arriba a la izquierda); lo demás está en «Más» o en la columna izquierda.
const terrenoDirecto=!pedido.nivel&&!location.hash;
function entrarTerreno(){
 document.body.classList.remove('entrandoTerreno');
 const destino=pisoDeEntrada(leerMemoria(almacen()),floors.filter(f=>f.piso).map(f=>f.id));
 if(!destino){$('loading').hidden=true;vista='modulos';state(true);return;}
 modulo='plano';marcarModulo('plano');
 const direccion=root+consultaPiso({nivel:destino,modulo:'plano',pisos:[destino]});
 if(destino!==active.id){guardarMemoria(almacen(),{piso:destino,modulo:'plano',pisos:[destino]});location.replace(direccion);return;}
 openFloor(destino,false);history.replaceState(null,'',direccion);
}
if(disponible(pedido.nivel)||(!pedido.nivel&&location.hash))openFloor(active.id,false,pedido.pisos.length?pedido.pisos:[active.id]);
else if(terrenoDirecto){document.body.classList.add('entrandoTerreno');$('loading').hidden=false;limitarPisos().then(entrarTerreno);}
else{vista=pedido.modulo?'pisos':'modulos';if(pedido.modulo)prepararPisos();state(true);}
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
  // Un piso que la cuenta no tiene asignado: se abre su piso (el último o el primero asignado), sin pasar por la pila de pisos.
  if(!document.body.classList.contains('floorHome')&&!floors.some(f=>f.id===active.id&&f.piso)){const destino=pisoDeEntrada(leerMemoria(almacen()),floors.filter(f=>f.piso).map(f=>f.id));if(destino)location.replace(root+consultaPiso({nivel:destino,modulo:'plano',pisos:[destino]}));else home();}
 }catch{}
 pintarCuenta();
}
// Tu cuenta (arriba a la izquierda): tus iniciales y el piso. Al tocarlos sube una hoja con tu nombre, tus pisos para
// elegir (con su estado sin conexión y «Guardar»), «Sin conexión y actualizaciones» y «Cerrar sesión». Reemplaza la
// pantalla de módulos, la pila de pisos, el botón de descarga y el de cerrar sesión de la cabecera.
const cabeceraPiso=document.querySelector('header .project'),avatar=document.createElement('div');
avatar.className='cuentaAvatar';avatar.setAttribute('aria-hidden','true');cabeceraPiso?.prepend(avatar);
if(cabeceraPiso){cabeceraPiso.setAttribute('role','button');cabeceraPiso.tabIndex=0;cabeceraPiso.setAttribute('aria-haspopup','dialog');cabeceraPiso.setAttribute('aria-label','Tu cuenta y tus pisos');}
const hojaCuenta=document.createElement('dialog');hojaCuenta.id='hojaCuenta';hojaCuenta.className='hojaCuenta';hojaCuenta.setAttribute('aria-label','Tu cuenta');document.body.append(hojaCuenta);
const usuario=()=>{try{return JSON.parse(localStorage.getItem('atlas-nube-sesion')||'null')?.user||null;}catch{return null;}};
const nombreDe=u=>(u?.nombre||u?.username||'').trim();
function iniciales(u){const partes=nombreDe(u).replace(/@.*/,'').split(/[\s._-]+/).filter(Boolean);return partes.length?(partes[0][0]+(partes[1]?.[0]||'')).toUpperCase():'A';}
const escapar=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const packDe=f=>f.piso?.datos?f.piso.datos.replace(/\/$/,''):'n-1';
const mb=b=>(b/1e6).toLocaleString('es-CL',{maximumFractionDigits:0})+' MB';
function pintarCuenta(){
 const u=usuario();avatar.textContent=iniciales(u);
 if(!hojaCuenta.open)return;
 const {estadoPiso,guardarHTML}=estadosSinConexion();
 const lista=floors.filter(f=>f.piso);
 hojaCuenta.innerHTML=`<div class="hojaAsa" aria-hidden="true"></div>
  <div class="cuentaCabeza"><span class="cuentaAvatar grande" aria-hidden="true">${escapar(iniciales(u))}</span><div><b>${escapar(nombreDe(u).replace(/@.*/,'')||MARCA)}</b><small>${escapar(u?.username||'Sin sesión en este equipo')}</small></div><button type="button" class="close" data-cerrar aria-label="Cerrar">×</button></div>
  <h3 class="hojaGrupo">${lista.length>1?'Tus pisos':'Tu piso'}</h3>
  <div class="rodilloPisos" role="listbox" aria-label="Tus pisos"><div class="rodilloVentana" aria-hidden="true"></div>${[...lista].reverse().map(f=>`<div class="rodilloPiso" role="option" data-piso="${f.id}" aria-current="${f.id===active.id}"><span class="pisoLamina" data-numero="${escapar(f.numero)}" aria-hidden="true"><img class="pisoBlanco" src="pisos3d/${f.id.toLowerCase()}-blanco.png" alt="" width="760" height="490" decoding="async"><img class="pisoAzul" src="pisos3d/${f.id.toLowerCase()}-azul.png" alt="" width="760" height="490" decoding="async"></span><span><b>Piso ${escapar(f.numero)}</b>${f.id===active.id?'<small class="rodilloAbierto">Abierto ahora</small>':''}<small data-estado>${escapar(estadoPiso(f))}</small></span><span class="rodilloAccion" data-accion>${guardarHTML(f)}</span></div>`).join('')}</div>
  <div class="cuentaFilas"><button type="button" class="cuentaFila" data-offline><span aria-hidden="true">⤓</span>Sin conexión y actualizaciones</button>${$('logoutButton')?'<button type="button" class="cuentaFila salir" data-salir><span aria-hidden="true">⇥</span>Cerrar sesión</button>':''}</div>`;
 hojaCuenta.querySelector('[data-cerrar]').onclick=()=>hojaCuenta.close();
 // Los pisos van apilados en 3D, el más alto arriba, con su lámina azul al pasar el cursor o si está abierto. Tocar uno lo
 // abre directo. Si falta la imagen de un piso, se ve su número.
 hojaCuenta.querySelectorAll('.pisoLamina img').forEach(img=>img.addEventListener('error',()=>img.parentElement.classList.add('sinImagen'),{once:true}));
 // Rodillo tipo tragamonedas (rodillo-pisos.mjs): parte en el piso elegido antes o en el abierto; el de la ventana se abre al tocarlo.
 const ids=[...lista].reverse().map(f=>f.id),inicio=Math.max(0,ids.indexOf(rodilloPiso||active.id));
 crearRodillo(hojaCuenta.querySelector('.rodilloPisos'),{inicial:inicio,alCambiar:i=>{rodilloPiso=ids[i];},alElegir:i=>{hojaCuenta.close();if(ids[i]!==active.id)openFloor(ids[i],true,[ids[i]]);}});
 enlazarGuardar();
 hojaCuenta.querySelector('[data-offline]').onclick=()=>{hojaCuenta.close();$('offlineOpen')?.click();};
 hojaCuenta.querySelector('[data-salir]')?.addEventListener('click',()=>{hojaCuenta.close();$('logoutButton')?.click();});
}
// Estado sin conexión de cada piso y su ícono para guardarlo (solo se ve el del piso en la ventana del rodillo).
function estadosSinConexion(){
 const sc=window.atlasSinConexion?.estado?.()||null,online=navigator.onLine;
 const estadoPiso=f=>{const p=sc?.packs?.[packDe(f)];if(!p)return '';if(p.ready)return 'Guardado sin conexión ✓';if(sc.downloading===packDe(f))return 'Guardando…';return 'Sin guardar'+(p.count?' · '+Math.round(p.count/p.total*100)+' %':'');};
 const puedeGuardar=f=>{const p=sc?.packs?.[packDe(f)];return p&&!p.ready&&online&&sc.downloading!==packDe(f);};
 const guardarHTML=f=>puedeGuardar(f)?`<button type="button" class="rodilloGuardar" data-guardar="${packDe(f)}" aria-label="Guardar Piso ${escapar(f.numero)} sin conexión"><span aria-hidden="true">⤓</span><small>${mb(sc.packs[packDe(f)].bytes-sc.packs[packDe(f)].savedBytes)}</small></button>`:'';
 return {estadoPiso,guardarHTML};
}
function enlazarGuardar(){hojaCuenta.querySelectorAll('[data-guardar]').forEach(b=>b.onclick=e=>{e.stopPropagation();window.atlasSinConexion?.guardar?.(b.dataset.guardar);setTimeout(actualizarEstados,300);});}
// Durante una descarga el estado cambia seguido: se cambian solo los textos, sin volver a armar el rodillo (perdería su giro).
function actualizarEstados(){
 if(!hojaCuenta.open||!hojaCuenta.querySelector('.rodilloPisos'))return pintarCuenta();
 const {estadoPiso,guardarHTML}=estadosSinConexion();
 hojaCuenta.querySelectorAll('.rodilloPiso').forEach(item=>{const f=floors.find(x=>x.id===item.dataset.piso);if(!f)return;item.querySelector('[data-estado]').textContent=estadoPiso(f);const accion=item.querySelector('[data-accion]'),html=guardarHTML(f);if(accion.innerHTML!==html)accion.innerHTML=html;});
 enlazarGuardar();
}
function abrirCuenta(){if(document.body.classList.contains('floorHome'))return;hojaCuenta.showModal();pintarCuenta();}
cabeceraPiso?.addEventListener('click',abrirCuenta);
cabeceraPiso?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();abrirCuenta();}});
hojaCuenta.addEventListener('click',e=>{if(e.target===hojaCuenta)hojaCuenta.close();});
window.addEventListener('atlas-session-changed',pintarCuenta);
for(const nombre of ['atlas-offline-estado','online','offline'])window.addEventListener(nombre,actualizarEstados);
window.addEventListener('atlas-floor-home',()=>{if(hojaCuenta.open)hojaCuenta.close();});
pintarCuenta();
limitarPisos();window.addEventListener('atlas-jerarquia-changed',limitarPisos);window.addEventListener('atlas-session-changed',limitarPisos);
// Set up update detection even when the user stays on the cards without opening a plan.
window.dispatchEvent(new Event('atlas-shell-ready'));
