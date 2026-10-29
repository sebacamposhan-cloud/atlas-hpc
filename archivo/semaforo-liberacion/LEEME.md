# Semáforo de liberación de frentes (archivado)

Se retiró de Atlas el 28 de octubre de 2026 y se guarda aquí por si se vuelve a implementar. Esta carpeta está fuera de `dist/`: no se publica en Render ni entra al paquete sin conexión.

## Qué hacía

Calculaba un semáforo por recinto a partir de un Excel con cuatro hojas: **Parámetros** (ciclo ITO, fecha de corte), **Recintos**, **Solicitudes** (consultas y PTO por recinto o por terminación, como «PAV 106») y **Programa**.

| Estado | Regla |
|---|---|
| Bloqueado | Consulta rechazada, o con holgura negativa (requerida − emisión − ciclo ITO) |
| Con restricción | Consulta abierta con holgura |
| Liberado | Sin consultas abiertas |
| Sin datos | Sin Excel, o recinto fuera de la hoja Recintos |

Se veía en cuatro lugares: el apartado «Liberación de frentes» del menú, una capa en Filtros, una sección en la ficha de cada recinto y un punto de color en los resultados de búsqueda. El Excel se guardaba en el navegador con la clave `atlas-liberacion-v1`. Al retirar el módulo no se borró de los equipos.

## Archivos

| Archivo | Estaba en |
|---|---|
| `liberacion.mjs` | `dist/liberacion.mjs`. Sus importaciones ahora apuntan a `../../dist/` |
| `datos-ejemplo.xlsx` | `dist/liberacion/datos-ejemplo.xlsx`. Son datos inventados del nivel 2 |
| `liberacion.css` | `dist/workspace.css`, la sección «Liberación de frentes» |
| `liberacion-test.mjs` | la parte del semáforo de `pisos-test.mjs` |

Para probar la lógica sin activarla: `node archivo/semaforo-liberacion/liberacion-test.mjs`

## Cómo volver a activarlo

1. Mover `liberacion.mjs` a `dist/` y cambiar sus importaciones a `./layers.mjs` y `./web-store.mjs`. Mover `datos-ejemplo.xlsx` a `dist/liberacion/` y pegar `liberacion.css` al final de `dist/workspace.css`.
2. En `dist/app.js`:
   - importar `createLiberacion` y declarar la variable `liberacion`;
   - crearlo junto a los demás módulos: `liberacion ||= createLiberacion({esc, rooms:()=>uniqueRooms(data.rooms), toast, changed:()=>{ui?.refresh(); runSearch(); if(selected) renderDetail();}, paint:state=>ui?.apply('liberacion',state), select:selectRoom, show:name=>ui?.show(name)})`;
   - pasar `liberacion` a `createWorkspace`;
   - agregar `${liberacion?.ficha(r)||''}` en la ficha, después de «Observaciones en terreno»;
   - agregar `liberacion?.bind($('detail'))` al enlazar la ficha;
   - agregar `${liberacion?.dot(r)||''}` en los resultados de búsqueda.
3. En `dist/workspace.mjs`:
   - quitar el alias `if(name==='liberacion')name='map';` de `show()`;
   - en `refresh()`, devolver la rama `if(module==='liberacion'){root.innerHTML=ctx.liberacion.page(heading);ctx.liberacion.bindPage(root);…}`;
   - en la nota de la leyenda, devolver «Semáforo de liberación · opacidad 50%».
4. En `dist/plan-filters.mjs`, devolver `['liberacion','Liberación de frentes']` a `families` y su nota.
5. En `dist/index.html`, devolver los botones `data-module="liberacion"` de la barra lateral y de la barra inferior del celular.
6. En `scripts/prepare-offline.mjs`, devolver `'liberacion.mjs'` al núcleo y `...walk('liberacion')`. Pasar la prueba a `pisos-test.mjs`, regenerar `sw.js` en una copia LF y correr el build de Render.

El código completo, tal como funcionaba, está en git en el commit 74d9ca5, el último de main antes de archivarlo.
