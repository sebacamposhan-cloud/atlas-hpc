// Recover the exact documented PDF region when a generated image is unavailable.
// Never retry the same failed asset or substitute another room's symbol.
export function loadSourceImage(img, url, render, callbacks={}) {
 let phase='asset';
 img.onload=()=>{img.hidden=false;callbacks.ready?.(img.src);};
 img.onerror=async()=>{
  if(phase==='rendering'||phase==='failed')return;
  if(phase==='fallback'){phase='failed';img.hidden=true;callbacks.failed?.();return;}
  phase='rendering';callbacks.recovering?.();
  try{const source=await render();if(!img.isConnected)return;phase='fallback';img.src=source;}
  catch{phase='failed';img.hidden=true;callbacks.failed?.();}
 };
 if(url){img.src=url;if(img.complete){if(img.naturalWidth)img.onload();else img.onerror();}}
 else img.onerror();
}
