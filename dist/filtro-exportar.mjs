// Exportar el plano filtrado (botón «Exportar» de la leyenda del plano): PDF del piso completo con los recintos que
// cumplen el filtro iluminados y el resto atenuado, el piso y la simbología en el rótulo, y después hojas A4 con el filtro
// aplicado y el listado de recintos (código, nombre y categoría de la capa). El dibujo lo hace app.js (exportarFiltro);
// aquí se arman los datos con el mismo formato de la exportación de proyectos (marking-overlay.mjs, paginasProyecto).
// Sin DOM: lo prueba filtro-exportar-test.mjs.
import {codigoPiso} from './marking-overlay.mjs';

// capa: nombre de la capa activa («Pinturas»). filtros: [{capa, valores: [nombres]}]. leyenda: [{nombre, color, n}].
// recintos: [{code, name, categorias: [{nombre, color}]}], ya filtrados. autor: quien exporta (sesión) o vacío.
export function datosFiltro({level, nivelNombre, capa, filtros = [], leyenda = [], recintos = [], total = 0, autor = '', at = new Date().toISOString()}) {
  const activos = filtros.filter(f => f.valores?.length);
  const texto = activos.map(f => `${f.capa}: ${f.valores.join(', ')}`).join(' · ');
  const filas = [...recintos].sort((a, b) => String(a.code).localeCompare(String(b.code), 'es', {numeric: true}))
    .map(r => {
      const c = r.categorias || [];
      return [r.code, r.name || '', c.length ? {texto: c.map(x => x.nombre).join(' / '), color: c[0].color || '#ffffff'} : {texto: 'Sin dato', color: '#ffffff'}];
    });
  return {
    piso: codigoPiso(level), titulo: `${capa} · ${nivelNombre}`, autor: autor || 'Atlas HPC',
    proposito: texto ? 'Plano filtrado: ' + texto : 'Plano coloreado por ' + capa.toLowerCase() + ', sin filtro',
    actualizado: at, tipo: 'Plano filtrado',
    detalle: `${filas.length} de ${total || filas.length} recintos cumplen el filtro`,
    leyenda: leyenda.filter(e => e.n > 0).map(e => ({nombre: e.nombre, color: e.color, n: e.n})),
    columnas: ['Código', 'Recinto', capa], anchos: [2, 4.5, 3.5], filas,
    archivo: ['Plano filtrado', capa, ...activos.flatMap(f => f.valores)].join(' - ')
  };
}
// Nombre del archivo: capa y valores filtrados, «Plano filtrado - Pinturas - Sector 3».
export function nombreArchivo(info) {
  return String(info.archivo || 'Plano filtrado').replace(/[^\p{L}\p{N} _.,-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}
