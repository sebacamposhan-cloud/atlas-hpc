# Observaciones en terreno con registro fotográfico

Lista de pendientes («punch list») por recinto, pensada para registrar desde el celular con fotos tomadas en el lugar. Disponible en los cuatro pisos.

## Uso
1. **Registrar.** En el plano se toca un recinto y, en su ficha, «**+ Observación con foto**».
   - **Tomar foto** abre la cámara trasera del celular. No se cargan fotos de la galería: cada foto es lo que se ve en el recinto en ese momento. Máximo 12 por observación.
   - Se completa qué se observa, la terminación (con su código del rombo), categoría, prioridad, responsable (subcontrato o persona), plazo y quién registra. El nombre de quien registra se recuerda en el equipo.
2. **Ver.** Tocando el recinto, su ficha muestra cada observación con su estado, responsable, plazo, autor y fecha, y las miniaturas de sus fotos. Al abrirla, las fotos se ven en grande.
3. **Seguimiento.** Al abrir una observación se puede editar, agregar fotos y cambiar su estado:
   - Abierta → En corrección → Corregida → Cerrada, y Descartada.
   - **Marcar corregida** exige una foto «después» o un comentario de la corrección.
   - **Descartar** y **Reabrir** exigen el motivo.
   - **Verificar y cerrar** registra la fecha de cierre.
   - Cada cambio queda en el historial con fecha, autor y comentario.
4. **Control de obra → Observaciones en terreno.**
   - Indicadores: pendientes, vencidas, corregidas por verificar, cerradas y días promedio de cierre.
   - Pendientes por responsable.
   - Filtros por estado, responsable, categoría, prioridad, vencidas y texto.
   - «Ver en el plano» pinta los recintos con vencidas, abiertas, corregidas por verificar o cerradas (también en Filtros → Colorear por).

**Vencimiento:** una observación está vencida si sigue abierta o en corrección después de su plazo. Una vez corregida, espera verificación y ya no cuenta como vencida.

## Datos y límites
- **Almacenamiento:** IndexedDB `atlas-observaciones` con tres tablas: observaciones, fotos e historial. Cada guardado es una sola transacción, con versión esperada para no pisar lo guardado en otra pestaña. El historial solo se agrega, nunca se reescribe.
- **Fotos:** se reducen en el navegador (lado mayor 1600 px, JPEG ~0,72, miniatura de 320 px) respetando la orientación de la cámara. Se guardan como bytes. Guardar espera a que terminen de procesarse, y al guardar la primera se pide almacenamiento persistente.
- **Los registros son locales al equipo. No hay sincronización entre usuarios.** Mientras no exista la base compartida, el **respaldo JSON** (que incluye las fotos) lleva las observaciones a otro equipo. La importación agrega lo que no existe y rechaza todo si una observación existente difiere.
- **Preparado para la base compartida:** identificador único, autor, fechas, versión e historial por observación.
- **No se modifican** terminaciones, geometrías, PMA ni otros registros.

## Implementación
- `dist/observaciones-model.mjs`: reglas (validación, transiciones, vencimientos, resúmenes).
- `dist/observaciones-store.mjs`: almacenamiento, respaldo e importación.
- `dist/observaciones.mjs`: ficha, formulario con cámara, panel y capa del plano.
- `dist/observaciones.css`: estilos.
- `observaciones-test.mjs`: prueba de las reglas, incluida en el build de Render.
