// Lightweight entry point. The existing viewer and its runtime load only after a floor is chosen.
import './offline.mjs';
const $=id=>document.getElementById(id),floors=window.ATLAS_TARJETAS,active=window.ATLAS_PISO;
const root=window.ATLAS_RAIZ;
let started=false,ready=false,pending;
const gallery=$('floorExplorer');
$('floorGrid').innerHTML=floors.map(({id,numero,piso})=>`<article class="floorCard ${piso?'available':'unavailable'}" data-floor="${id}">
  ${piso?`<a class="floorCardLink" href="${root}?nivel=${id}" aria-label="Abrir piso ${numero}">`:'<div class="floorCardPending" aria-disabled="true">'}
  <div class="floorPreview">${piso?`<img src="${piso.datos}map/overview.webp" alt="Vista general del plano del piso ${numero}" width="300" height="210" decoding="async">`:'<span class="floorNoPlan">Plano aún no cargado</span>'}<span class="floorPreviewNumber" aria-hidden="true">${numero}</span></div>
  <div class="floorCardInfo"><div><h2>Piso ${numero}</h2><p>${piso?'Arquitectura · Plano interactivo':'Documentación pendiente'}</p></div><span class="floorCardArrow" aria-hidden="true">${piso?'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 13 13 3M3 3h10v10"/></svg>':'—'}</span></div>
  <div class="floorCardStatus"><i></i>${piso?'Disponible para consultar':'No disponible'}</div>
  ${piso?'</a>':'</div>'}</article>`).join('');
const safeToLeave=()=>window.dispatchEvent(new Event('atlas-before-floor-change',{cancelable:true}));
function state(home){
 document.body.classList.toggle('floorHome',home);gallery.hidden=!home;$('floorHomeButton').hidden=home;
 $('globalSearch').disabled=home||!ready;$('navToggle').disabled=home||!ready;
 document.querySelectorAll('button[data-module]').forEach(b=>{b.disabled=(home||!ready)&&b.dataset.module!=='map';if(home){b.classList.toggle('active',b.dataset.module==='map');b.setAttribute('aria-current',b.dataset.module==='map'?'page':'false');}});
 document.querySelector('header .project span').textContent=home?'Explorador de planos':active.nombre+' · Arquitectura';
 document.querySelector('.sideProject small').textContent=home?'Explorador de planos':'Arquitectura · '+active.nombre;
 // Buttons added by the viewer should not appear above the entry screen.
 for(const id of ['assistantOpen','diamondCatalogOpen'])if($(id))$(id).hidden=home;
}
function home(push=true){
 if(!safeToLeave())return;
 const alreadyHome=document.body.classList.contains('floorHome');window.dispatchEvent(new Event('atlas-floor-home'));state(true);if(push&&!alreadyHome)history.pushState(null,'',root);
 $('floorExplorerTitle').tabIndex=-1;$('floorExplorerTitle').focus({preventScroll:true});
}
async function openFloor(id,push=true){
 const floor=floors.find(f=>f.id===id)?.piso;if(!floor||!safeToLeave())return;
 if(id!==active.id){location.assign(root+'?nivel='+encodeURIComponent(id));return;}
 if(push)history.pushState(null,'',root+'?nivel='+encodeURIComponent(id));
 state(false);
 if(!started){started=true;document.body.classList.add('booting');$('loading').hidden=false;pending=import('./app.js').catch(()=>{started=false;$('loading').innerHTML='<span>No se pudo abrir el visor.</span><button id="floorRetry">Reintentar</button>';$('floorRetry').onclick=()=>location.reload();});}
 await pending;
 if(ready)window.dispatchEvent(new Event('atlas-floor-resume'));
}
gallery.querySelectorAll('a').forEach(a=>a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;e.preventDefault();openFloor(a.closest('[data-floor]').dataset.floor);}));
$('floorHomeButton').onclick=()=>home();
$('sidebarCollapse').onclick=()=>document.body.classList.toggle('sidebarCompact');
// The main Explorer navigation returns to cards. Internal "Volver al plano" actions remain in the viewer.
document.addEventListener('click',e=>{if(e.target.closest('button[data-module="map"],#bottomMap')){e.preventDefault();e.stopImmediatePropagation();home();}},true);
window.addEventListener('atlas-ready',()=>{ready=true;state(document.body.classList.contains('floorHome'));});
window.addEventListener('popstate',()=>{
 const id=new URLSearchParams(location.search).get('nivel');
 if(id&&floors.some(f=>f.id===id&&f.piso))openFloor(id,false);else home(false);
});
// Preserve existing explicit floor links, QR room links, and module deep links.
const requested=new URLSearchParams(location.search).get('nivel');
if(floors.some(f=>f.id===requested&&f.piso)||(!requested&&location.hash))openFloor(active.id,false);else state(true);
window.addEventListener('hashchange',()=>{if(location.hash&&document.body.classList.contains('floorHome')){if(ready)state(false);else openFloor(active.id,false);}});
// Set up update detection even when the user stays on the cards without opening a plan.
window.dispatchEvent(new Event('atlas-shell-ready'));
