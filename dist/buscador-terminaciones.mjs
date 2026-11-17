// Lista de terminaciones bajo la caja de búsqueda de arriba. Al escribir «cie», «pav», «muro», «pintura», «asepsia» o
// «sector 2» se despliegan los tipos de esa familia con su color, nombre y cantidad de recintos; lo que sigue a la palabra
// filtra la lista («cie 205», «pav vinilico»). Al tocar un tipo se pinta solo ese en el plano (uno a la vez) y bajo la caja
// queda su etiqueta «205 ×» para quitarlo. Filtros y capas sigue igual: es el mismo filtro visto desde otro lado.
const FAMILIAS=[
 ['CIE','Cielos',['cielo','cielos','cie']],
 ['PAV','Pavimentos',['pavimento','pavimentos','pav','piso','pisos']],
 ['walls','Muros',['muro','muros']],
 ['paint','Pinturas',['pintura','pinturas']],
 ['asepsis','Asepsia',['asepsia']],
 ['sector','Sectores',['sector','sectores']]
];
const normalizar=v=>String(v??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es').trim();

// Familia pedida por la primera palabra y el resto del texto. «piso 2» es un piso, no pavimentos.
export function leerConsulta(texto){
 const [palabra='',...resto]=normalizar(texto).split(/\s+/),demas=resto.join(' ');
 if(palabra.length<3)return null;
 const familia=FAMILIAS.find(([,,palabras])=>palabras.some(p=>p.startsWith(palabra)));
 if(!familia)return null;
 if(familia[0]==='PAV'&&palabra.startsWith('pis')&&/^-?\d+$/.test(demas))return null;
 return {tipo:familia[0],titulo:familia[1],resto:demas};
}

// Filas de la lista: [clave, recintos] de la familia que contienen el resto del texto en su código o nombre.
export function filasConsulta(consulta,distribucion,etiqueta){
 if(!consulta)return [];
 const resto=normalizar(consulta.resto);
 return distribucion.filter(([clave])=>!resto||normalizar(clave+' '+etiqueta(consulta.tipo,clave)).includes(resto));
}

export function createBuscadorTerminaciones({input,distribucion,etiqueta,muestra,elegir,quitar,activo,disponible}){
 const wrap=input.closest('.globalSearchWrap'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const lista=document.createElement('div');lista.id='listaTerminaciones';lista.className='listaTerminaciones';lista.setAttribute('role','listbox');lista.setAttribute('aria-label','Tipos de terminación');lista.hidden=true;
 const chip=document.createElement('div');chip.className='chipTerminacion';chip.hidden=true;
 wrap.append(lista,chip);
 input.setAttribute('aria-controls','listaTerminaciones');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
 function cerrar(){lista.hidden=true;input.setAttribute('aria-expanded','false');}
 const filasDe=texto=>{const consulta=disponible()?leerConsulta(texto):null;return [consulta,consulta?filasConsulta(consulta,distribucion(consulta.tipo),etiqueta):[]];};
 function pintar(){
  const [consulta,filas]=filasDe(input.value);
  if(!filas.length){cerrar();return;}
  const [tipoActivo,claveActiva]=activo()||[];
  lista.innerHTML=`<div class="listaTerminacionesCabeza"><b>${esc(consulta.titulo)}</b><small>${filas.length} ${filas.length===1?'tipo':'tipos'} · toca uno para verlo en el plano</small></div>`+
   filas.map(([clave,n])=>`<button type="button" role="option" data-tipo="${esc(consulta.tipo)}" data-clave="${esc(clave)}" aria-selected="${tipoActivo===consulta.tipo&&claveActiva===clave}"><i style="${muestra(consulta.tipo,clave)}"></i><span>${esc(etiqueta(consulta.tipo,clave))}</span><b>${n}</b></button>`).join('');
  lista.querySelectorAll('[data-clave]').forEach(b=>b.onclick=()=>{cerrar();elegir(b.dataset.tipo,b.dataset.clave);});
  lista.hidden=false;input.setAttribute('aria-expanded','true');
 }
 // Etiqueta del filtro activo bajo la caja, si hay uno solo (venga de aquí o de Filtros y capas).
 function actualizar(){
  const elegido=activo();chip.hidden=!elegido;if(!elegido)return;
  const [tipo,clave]=elegido;
  chip.innerHTML=`<i style="${muestra(tipo,clave)}"></i><span>${esc(etiqueta(tipo,clave))}</span><button type="button" aria-label="Quitar ${esc(etiqueta(tipo,clave))} del plano">×</button>`;
  chip.querySelector('button').onclick=()=>{chip.hidden=true;quitar();};
 }
 input.addEventListener('input',pintar);
 input.addEventListener('focus',pintar);
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!lista.hidden){e.preventDefault();cerrar();}
  else if(e.key==='ArrowDown'&&!lista.hidden){e.preventDefault();lista.querySelector('[data-clave]')?.focus();}
 });
 lista.addEventListener('keydown',e=>{
  const botones=[...lista.querySelectorAll('[data-clave]')],i=botones.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();botones[Math.min(i+1,botones.length-1)]?.focus();}
  else if(e.key==='ArrowUp'){e.preventDefault();if(i<=0)input.focus();else botones[i-1].focus();}
  else if(e.key==='Escape'){e.preventDefault();cerrar();input.focus();}
 });
 document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))cerrar();});
 window.addEventListener('atlas-floor-home',cerrar);
 // Si el texto abre la lista, la búsqueda de recintos espera al Enter: «sector 2» no es el nombre de un recinto.
 return {actualizar,cerrar,ofrece:texto=>filasDe(texto)[1].length>0};
}
