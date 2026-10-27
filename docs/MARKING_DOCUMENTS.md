# Documentos de marcado de Arquitectura

## Uso

1. Abrir el piso y Arquitectura; pulsar **Marcados → Nuevo documento**.
2. Completar nombre del documento, quién lo realizó y para qué es el plano. Los tres campos son obligatorios, incluso después de quitar espacios. Elegir color.
3. Tocar el interior de un recinto. Se pinta sobre el contorno existente y aparece en la lista como «1. código», con su nombre original. Otro toque sobre el mismo recinto no lo duplica ni lo borra.
4. La lista queda a la derecha en escritorio y en una franja debajo del plano en móvil. Pulsar una fila acerca ese recinto; × quita su marcado. Los números de los demás no cambian y los números retirados no se reutilizan.
5. **Datos y color** edita los datos del documento; **Documentos** permite abrir otro o crear uno nuevo. Cerrar el documento retira los colores de esa vista, pero conserva el documento guardado.
6. **Exportar plano** descarga PDF con colores, números, nombre/autor/propósito, fechas y relación numerada de recintos y láminas. **Respaldo JSON** y **Restaurar respaldo** permiten trasladar el documento a otro navegador. También se puede respaldar el conjunto del piso.

La búsqueda global acerca un resultado único, pero no lo marca: hay que tocar el plano. Los filtros de terminaciones y la navegación normal se recuperan al salir del marcado. Cambiar de especialidad o módulo cierra el documento de marcado activo.

## Persistencia y alcance

Guardado automático por transacción en IndexedDB `atlas-marking-documents`, tabla `documents`. Cada documento tiene UUID, piso, especialidad `architecture`, metadatos obligatorios, color, fechas, versión, próximo número y referencias de recintos. Cada referencia conserva id, código, nombre, lámina, revisión y número. No se modifican terminaciones, avances, SQLite, PMA, rombos ni geometrías.

Las escrituras del mismo documento se serializan y comprueban la versión guardada. Un conflicto entre pestañas no sobrescribe el otro cambio; muestra el error y requiere reabrir el documento. No se anuncia guardado hasta que la transacción se completa. La importación es atómica, idempotente para respaldos idénticos y rechaza conflictos sin sustituir documentos. Las identidades duplicadas, números repetidos, metadatos incompletos y respaldos inválidos se rechazan.

El guardado es local a este origen y navegador. **No existe sincronización multiusuario ni copia automática en el servidor**. El respaldo JSON es necesario para llevarlo a otro equipo. Los módulos forman parte del núcleo offline; se probó reapertura de documentos después de recargar sin red. La exportación necesita la imagen del plano y el generador PDF disponibles (red o paquete offline descargado).

Los colores son anotaciones del usuario, no una certificación de obra ni nuevos límites técnicos. Se usan los contornos disponibles y los códigos existentes. Si un recinto deja de estar disponible en el plano, se conserva en la lista con aviso y sin fabricar una ubicación. La exportación utiliza una instantánea del documento al iniciar la descarga.

## Verificación

- `node marking-test.mjs`: campos obligatorios, validación, referencias inmutables, repetición de clic y numeración después de eliminar/agregar.
- `PLAYWRIGHT_MODULE=/workspace/atlas-browser-tools/node_modules/playwright-core/index.mjs node marking-browser-test.mjs`: Chromium 1440×1000 y 390×844, creación, clics reales, búsqueda sin marcado automático, separación geométrica entre lista/plano, color, eliminación, numeración, documentos independientes, PDF comprobado con `pdftotext`, respaldo, recarga, conflicto entre versiones, restauración en otro navegador, separación de pisos y reapertura offline. Requiere Chromium y `pdftotext`.
- Regresión de selección/colores, navegación por pisos, gestos, recursos protegidos y manifiesto offline.

Capturas con datos de prueba, sin estados reales de obra:

![Escritorio](images/marking-desktop.png)
![Móvil](images/marking-mobile.png)

Publicación mediante PR a `main`, revisión y despliegue manual de Render. No cambiar la rama del servicio.
