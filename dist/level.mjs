// Piso activo. La lista de pisos vive en pisos.js; fuera del navegador (pruebas) se usa el nivel −1.
const porDefecto = {id: 'N-1', nombre: 'Nivel −1', corto: '−1', datos: '', especialidades: true, imp: 's01', puertasPiloto: true, pav: 's01', cielosUnificado: {mapa: 'cie-s01-map.mjs', lamina: 'CIE-A-501'}, planos: {comp: 'comp-map.mjs'}};
export const nivel = globalThis.ATLAS_PISO || porDefecto;
export const pisos = globalThis.ATLAS_PISOS || [porDefecto];
export const datos = archivo => './' + nivel.datos + archivo;
// El nivel −1 conserva las claves originales para no perder correcciones ya guardadas.
export const clave = nombre => nivel.id === porDefecto.id ? nombre : nombre + '-' + nivel.id;
export const archivo = nombre => nombre.replace(/(\.\w+)$/, '_Nivel_' + nivel.corto.replace('−', '-') + '$1');
// Marca de la plataforma y obra abierta. La plataforma es ATLAS para cualquier obra; el código y el nombre de la obra
// (hoy el Hospital Provincia Cordillera) van en los encabezados de reportes y en los nombres de archivo: ATLAS_HPC_….
export const MARCA = 'ATLAS';
export const obra = globalThis.ATLAS_OBRA || {codigo: 'HPC', nombre: 'Hospital Provincia Cordillera'};
export const prefijo = MARCA + '_' + obra.codigo + '_';
