# Colores de fuente y selección visible

La paleta anterior asignaba un color mediante un hash del código. No procedía de las leyendas. Se cotejaron las ocho láminas ARQ-CIE originales: 152 muestras vectoriales (19 códigos × 8 fuentes) coinciden entre sí. El código 200 tiene una celda blanca sin relleno; 214 contiene una cuadrícula que se conserva como muestra del PDF.

| Código CIE | Color de leyenda |
|---|---|
| 200 | Blanco, `#ffffff` |
| 201 | Rosado, `#ffcccc` |
| 202 | Verde azulado, `#9ccdcd` |
| 203 | Naranja claro, `#ffd2a6` |
| 204 | Gris, `#c0c0c0` |
| 209 | Verde claro, `#c6dcaf` |
| 214 | Cuadrícula original sobre blanco |

Los 20 códigos documentados están en `dist/documented-layer-colors.mjs`. `docs/audit/layer-colors.json` registra fuente, hash, página, ruta y región de cada muestra. `scripts/audit-layer-colors.py` reproduce la extracción con PyMuPDF y rechaza conflictos entre fuentes. Las referencias del catálogo CIE se aplican a códigos de cielo de los rombos ARQ; esto no transfiere geometrías entre láminas ni aprueba asociaciones pendientes.

La leyenda ARQ de Muros y Pavimentos enumera códigos/descripciones en blanco y negro. Los colores del fondo de un plano no demuestran una correspondencia con dichos códigos. Por tanto, esas familias conservan una **paleta de consulta**, identificada en el panel y la leyenda. No se presenta como color documental. Una terminación mixta M1–M4 tampoco aporta orientación de cada muro por sí sola.

En Capas se indica si el color procede de la leyenda, de una preferencia personalizada o de la paleta de consulta. El botón **Restablecer colores de esta capa** elimina solo las preferencias de esa familia. CIE sin muestra documentada queda gris. Los colores originales se componen por multiplicación sobre la imagen para conservar trazos y texto; la paleta de consulta/personalizada mantiene 32% de opacidad. Las muestras de la leyenda usan la misma opacidad. La exportación del plano aplica el mismo color, trama, opacidad y composición.

## Selección y definición

El recinto seleccionado tiene un borde azul continuo de 3 px y halo blanco de 6 px, dibujados después de los demás contornos. Mantiene el color de la capa. Un aviso muestra el código seleccionado y sigue visible al cerrar la ficha; Limpiar retira la selección. La selección usa exactamente la misma geometría que el clic y conserva huecos/partes.

Los contornos generales pasan a 0,85 px con uniones redondeadas. El estado pendiente conserva un trazo discontinuo más fino. Esto mejora la lectura de las líneas vectoriales; no aumenta la resolución de las teselas del PDF (máximo actual: 2 píxeles por punto PDF) ni corrige por sí solo un perímetro incorrecto.

Pruebas nuevas: `layer-colors-test.mjs` verifica RGB, fuentes, hashes, trama y procedencia; `layer-selection-browser-test.mjs` comprueba selección con vecinos pintados, cierre de ficha, cambio de selección, preferencias/restauración y exportación PNG en escritorio/móvil. Una comparación de píxeles exige conservar más del 90% de la tinta oscura del fondo y que más del 80% del papel blanco coincida con el rosado documental en el recinto de prueba. Es una regresión visual de ese caso, no una certificación de todos los planos o navegadores.

## Publicación

Para evitar cambiar de rama con cada corrección, se recomienda que Render publique `main` tras revisar y fusionar la pull request en GitHub. `render.yaml` queda preparado con esa rama y despliegue automático desactivado. No se hace merge ni despliegue desde este entorno. Para probar antes de fusionar, Render puede seleccionar temporalmente `fix/layer-colors-selection` y ejecutar Manual Deploy.

Conservar las variables Groq que ya funcionan y actualizar el paquete offline después del despliegue. Estos cambios no sustituyen la revisión pendiente de los contornos adicionales señalados en las capturas de la lámina 504 y del borde sur inclinado.
