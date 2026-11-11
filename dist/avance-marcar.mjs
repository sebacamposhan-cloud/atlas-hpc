// Marca el estado de una partida de la planilla en el rombo de un recinto, desde un proyecto de partida (la ficha o el
// pincel de la simbología). Escribe por el mismo camino que tocar las etapas en el rombo: firma de la cuenta de Nube,
// registro de terreno que manda sobre la planilla hasta la siguiente carga y vuelve a la oficina al devolver la planilla.
import {cargarAvance} from './avance.mjs';
import {guardarAvance} from './avance-store.mjs';
import {marcarCategoria, deshacerMarca} from './avance-model.mjs';
import {exigirFirma} from './firma.mjs';
import {nivel} from './level.mjs';

const hoy = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

// Devuelve lo necesario para deshacer: {code, previo, ids}.
export async function marcarRecinto(code, familia, indice) {
  const firma = exigirFirma();
  const c = await cargarAvance(true), fila = c.porCodigo.get(String(code).trim());
  if (!fila) throw Error(`${code}: el recinto no está en el PMA de este piso.`);
  if (c.planilla?.nivel !== nivel.id) throw Error('Este piso no tiene planilla de avance cargada.');
  const {registro, ids} = marcarCategoria(fila, c.planilla, familia, indice, {level: nivel.id, responsable: firma, fecha: hoy()});
  await guardarAvance(registro, fila.registro?.version || 0);
  await cargarAvance(true);
  return {code: fila.code, previo: fila.registro || null, ids};
}

export async function deshacerRecinto({code, previo, ids}) {
  const firma = exigirFirma();
  const actual = (await cargarAvance(true)).porCodigo.get(code)?.registro;
  const registro = deshacerMarca(actual, previo, ids);
  await guardarAvance({...registro, responsable: firma, fecha: hoy()}, actual.version);
  await cargarAvance(true);
}
