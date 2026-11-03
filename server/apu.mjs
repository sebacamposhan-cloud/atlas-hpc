import fs from 'node:fs';
import {apuSnapshot} from '../dist/apu-model.mjs';
import {canonical} from '../dist/lastplanner-cycle-model.mjs';
const cache=new Map();
export function validateApu(reference,previous){
 if(!reference||canonical(reference)===canonical(previous))return;
 if(!/^hpc-apu-[a-f0-9-]+$/.test(reference.version||''))throw Error('Versión APU no válida.');
 let catalog=cache.get(reference.version);if(!catalog){try{catalog=JSON.parse(fs.readFileSync(new URL('../dist/apu/'+reference.version+'.json',import.meta.url)));}catch{throw Error('La versión APU no está disponible. Conserva la referencia histórica o selecciona una importación existente.');}cache.set(reference.version,catalog);}
 const expected=apuSnapshot(catalog,reference.partId,reference.operation?.id||null);
 if(canonical(expected)!==canonical(reference))throw Error('La referencia APU no coincide con el documento importado. Vuelve a seleccionar la operación.');
}
