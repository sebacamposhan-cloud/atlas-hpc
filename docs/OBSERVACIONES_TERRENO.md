# Observaciones en terreno con registro fotográfico

Lista de pendientes («punch list») por recinto, pensada para registrar desde el celular con fotos tomadas en el lugar. Disponible en los cuatro pisos.

## Uso
1. **Registrar.** En el plano se toca un recinto y, en su ficha, «**+ Observación con foto**».
   - **Tomar foto** abre la cámara trasera del celular. No se cargan fotos de la galería: cada foto es lo que se ve en el recinto en ese momento. Máximo 12 por observación.
   - Se completa qué se observa, la terminación (con su código del rombo), categoría, prioridad, responsable (subcontrato o persona), plazo y quién registra. El nombre de quien registra se recuerda en el equipo.
   - Desde el **rombo** de la ficha, «+ Observación con foto» de una partida (pavimento, cielo o un muro) deja ya elegido ese elemento y su categoría.
2. **Ver.** Tocando el recinto, su ficha muestra cada observación con su estado, responsable, plazo, autor y fecha, y las miniaturas de sus fotos. Cada sección del rombo muestra además las observaciones de su elemento y un número rojo con las pendientes.
3. **Marcar la foto.** «✎ Marcar» (en el formulario) o «Dibujar marcas» (al ver la foto) abre la foto a pantalla completa para señalar dónde está lo observado:
   - figuras: círculo, rectángulo, flecha y mano alzada; colores rojo, amarillo, verde y blanco; trazo fino, medio o grueso; Deshacer (o Ctrl+Z) y Borrar todo. Máximo 30 marcas por foto.
   - Las marcas se guardan como figuras sobre la foto, no se pinta la imagen: **la original queda intacta**. Al ver una foto marcada aparecen lado a lado la **original** y la **marcada**.
   - El visor acerca con la **rueda del mouse** (o pellizcando en el celular, o con + y −), se arrastra para moverse y doble clic ajusta. La original y la marcada se mueven juntas para comparar el mismo punto.
   - Marcar una foto ya guardada crea una nueva versión de la observación y queda en su actividad («Marcó una foto (3 figuras)»). Las marcas viajan con la observación a la Nube y en el respaldo JSON.
4. **Seguimiento.** Al abrir una observación se puede editar, agregar fotos y cambiar su estado:
   - Abierta → En corrección → Corregida → Cerrada, y Descartada.
   - **Marcar corregida** exige una foto «después» o un comentario de la corrección.
   - **Descartar** y **Reabrir** exigen el motivo.
   - **Verificar y cerrar** registra la fecha de cierre.
   - Cada cambio queda en el historial con fecha, autor y comentario.
5. **Control de obra → Avance y observaciones → Observaciones en terreno.**
   - Indicadores: pendientes, vencidas, corregidas por verificar, cerradas y días promedio de cierre. Tocarlos deja solo ese estado en la tabla.
   - Pendientes por responsable.
   - **Filtros por columna, como en Excel:** se toca el encabezado de Referencia, Observación, Estado, Prioridad, Categoría, Elemento, Recinto, Responsable, Plazo o Modificada y se abre un menú para ordenar, buscar y marcar los valores (cada uno con cuántas observaciones quedan según los demás filtros). La columna filtrada se subraya en cian. «Quitar los filtros» los borra todos. En el celular la tabla pasa a fichas y los mismos botones de columna quedan sobre ellas.
   - Las pestañas de estado (Todas, Pendientes, Abierta…) son atajos del filtro de la columna Estado.
   - «Ver en el plano» pinta los recintos con vencidas, abiertas, corregidas por verificar o cerradas (también en Filtros → Colorear por).

**Vencimiento:** una observación está vencida si sigue abierta o en corrección después de su plazo. Una vez corregida, espera verificación y ya no cuenta como vencida.

## Datos y límites
- **Almacenamiento:** IndexedDB `atlas-observaciones` con tres tablas: observaciones, fotos e historial. Cada guardado es una sola transacción, con versión esperada para no pisar lo guardado en otra pestaña. El historial solo se agrega, nunca se reescribe.
- **Fotos:** se reducen en el navegador (lado mayor 1600 px, JPEG ~0,72, miniatura de 320 px) respetando la orientación de la cámara. Se guardan como bytes. Guardar espera a que terminen de procesarse, y al guardar la primera se pide almacenamiento persistente.
- **Los registros se guardan primero en el equipo.** Con la sesión de **Nube** iniciada se sincronizan, con sus fotos e historial, entre todos los equipos ([NUBE_CAMPO.md](NUBE_CAMPO.md)). Sin sesión, el **respaldo JSON** (que incluye las fotos) lleva las observaciones a otro equipo. La importación agrega lo que no existe y rechaza todo si una observación existente difiere.
- **Preparado para la base compartida:** identificador único, autor, fechas, versión e historial por observación.
- **No se modifican** terminaciones, geometrías, PMA ni otros registros.

## Implementación
- `dist/observaciones-model.mjs`: reglas (validación, transiciones, vencimientos, resúmenes).
- `dist/observaciones-store.mjs`: almacenamiento, respaldo e importación.
- `dist/observaciones.mjs`: ficha, formulario con cámara, panel y capa del plano.
- `dist/observaciones.css`: estilos.
- `dist/photo-marks.mjs`: editor de marcas y visor con la original al lado y zoom. `dist/column-filters.mjs` (+ `.css`): filtros de columna compartidos por todas las tablas.
- `observaciones-test.mjs`, `observaciones-marcas-test.mjs` y `column-filters-test.mjs`: pruebas de las reglas, incluidas en el build de Render.
