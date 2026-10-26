// Piso activo. La lista de pisos vive en pisos.js; fuera del navegador (pruebas) se usa el nivel −1.
const porDefecto = {id: 'N-1', nombre: 'Nivel −1', corto: '−1', datos: '', especialidades: true};
export const nivel = globalThis.ATLAS_PISO || porDefecto;
export const pisos = globalThis.ATLAS_PISOS || [porDefecto];
export const datos = archivo => './' + nivel.datos + archivo;
// El nivel −1 conserva las claves originales para no perder correcciones ya guardadas.
export const clave = nombre => nivel.id === porDefecto.id ? nombre : nombre + '-' + nivel.id;
export const archivo = nombre => nombre.replace(/(\.\w+)$/, '_Nivel_' + nivel.corto.replace('−', '-') + '$1');
