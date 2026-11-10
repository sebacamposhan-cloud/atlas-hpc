// One in-flight load per library. A failed load must never poison future export attempts.
const definitions={pdf:{file:'pdf-lib.min.js',ready:()=>typeof globalThis.PDFLib?.PDFDocument?.create==='function'},xlsx:{file:'xlsx.full.min.js',ready:()=>typeof globalThis.XLSX?.utils?.book_new==='function'}};
const pending=new Map();
export function loadVendor(kind){
 const spec=definitions[kind];if(!spec)return Promise.reject(Error('Herramienta de exportación desconocida.'));
 if(spec.ready())return Promise.resolve();if(pending.has(kind))return pending.get(kind);
 const attempt=index=>new Promise((resolve,reject)=>{
  const script=document.createElement('script');let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
  const timer=setTimeout(()=>finish(Error('La carga de la herramienta de exportación tardó demasiado.')),15000);
  script.src='/vendor/'+spec.file+(index?'?atlas_export_retry='+index:'');script.async=true;
  script.onload=()=>finish(spec.ready()?null:Error('La herramienta de exportación no terminó de cargarse.'));
  script.onerror=()=>finish(Error('No se pudo descargar la herramienta de exportación.'));
  document.head.append(script);
 });
 const task=(async()=>{let failure;for(let i=0;i<2;i++){if(spec.ready())return;if(i)await new Promise(resolve=>setTimeout(resolve,300));try{await attempt(i);return;}catch(e){failure=e;}}throw Error(failure.message+' Revisa la conexión y vuelve a pulsar Exportar. Tus datos guardados se conservan.');})();
 pending.set(kind,task);task.then(()=>pending.delete(kind),()=>pending.delete(kind));return task;
}
