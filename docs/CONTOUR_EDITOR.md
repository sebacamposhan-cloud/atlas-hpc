# Revisión de contornos 2D

Incremento sobre el visor existente: abre un recinto de Arquitectura y pulsa **Editar contorno**. El editor renderiza la región del PDF original mediante PDF.js, conserva las coordenadas de la fuente y permite mover vértices, dibujar partes, cortar huecos, eliminar, deshacer y rehacer. No sustituye el plano general ni recalcula superficies de obra.

Indica responsable y motivo, guarda y exporta la revisión JSON. El contorno actualizado pasa a selección y resaltado del plano; la ficha conserva código, seis campos del rombo y referencia documental. El historial permite consultar valores anteriores y revertir mediante una nueva corrección. Guardar deja el estado **Pendiente de revisión**, incluso si el contorno anterior estaba validado.

## Alcance y límites

- Las correcciones se guardan en este navegador/origen y se incluyen en sus respaldos. Exportar las revisiones antes de cambiar de navegador o dominio. No hay edición compartida ni usuarios individuales implementados en este incremento.
- Se validan anillos, huecos, intersecciones, límites de lámina y partes múltiples con Turf. Se exige contener la etiqueta del recinto y excluir etiquetas vecinas de esa fuente. Un rótulo desplazado fuera del recinto requiere revisar su asociación antes de usar este flujo; no se detectan líneas guía automáticamente.
- El editor usa el PDF original, que requiere conexión o el paquete opcional de documentos guardado. Las teselas generales siguen limitadas por su resolución; el editor no certifica nitidez ilimitada ni rendimiento en todos los móviles físicos.
- No hay ajuste automático a muros ni contornos certificados por el hecho de guardarlos. No se modifican las geometrías originales ni los materiales/superficies documentados.
- Si falla un PNG de rombo, ficha y catálogo intentan renderizar su región exacta del PDF. Si tampoco está disponible el PDF, se informa el fallo. Esto se probó provocando un 404 local; la causa del fallo original en Render sigue sin comprobarse.
- El detector actual coteja 443 observaciones conocidas. La cobertura absoluta requiere un conteo manual independiente; no se afirma recall del 100 %.

## Código externo incorporado

Leaflet 1.9.4 (BSD-2-Clause), Geoman Free 2.20.4 (MIT), Turf boolean-valid y kinks 7.3.4 (MIT). Distribución local en `dist/vendor/contour`, sin CDN. Versiones, integridad npm y hashes en `PROVENANCE.json`, avisos en `THIRD_PARTY_LICENSES.txt`; lockfile y construcción en `tools/contour-editor`.

```sh
npm ci --prefix tools/contour-editor --cache /tmp/atlas-npm-cache --ignore-scripts
npm run --prefix tools/contour-editor build
node scripts/prepare-offline.mjs
```

## Consolidación documental sin tocar las bases originales

La migración `003_geometry_reviews.sql` agrega revisiones inmutables a una **copia derivada**. El importador verifica observación, hash de fuente, coordenadas, geometría y estado pendiente, hace respaldo previo y conserva las tablas existentes.

```sh
python scripts/import-geometry-review.py revision-exportada.json --database /tmp/atlas-revisiones.sqlite
```

Requiere Shapely. El importador rechaza las tres bases originales del repositorio. La copia derivada no se publica automáticamente ni alimenta todavía el frontend. Para colaboración falta un servicio persistente con autenticación individual, conflictos y lectura/escritura compartida; no guardar cambios de producción en el disco efímero de Render.

## Verificación

`contour-geometry-test.mjs`: geometrías inválidas, huecos y partes. `contour-store-test.mjs`: guardado, selección efectiva, historial y reversión. `contour-editor-browser-test.mjs`: PDF real, arrastre de vértice, deshacer/rehacer, exportación y recarga en 1440 y 390 px. `geometry-review-db-test.py`: copia, integridad, procedencia e inmutabilidad. `deployment-browser-test.mjs`: servidor protegido, service worker online/offline y recuperación del PNG ausente desde PDF.

Los tests de navegador usan `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` para instalaciones externas de Playwright Core y Chromium. No se necesitan en producción.

## Publicación para probar hoy

1. En Render → atlas-hpc → Settings, seleccionar la rama `fix/source-room-contours` para probar este incremento antes de fusionarlo.
2. Mantener las credenciales y el modelo Groq que ya funcionan. El Blueprint ya no impone el modelo antiguo.
3. Manual Deploy → Deploy latest commit. Esperar **Live** y abrir https://atlas-hpc.onrender.com.
4. Exportar respaldo local antes de probar correcciones. Abrir un recinto → Editar contorno → guardar y exportar; comprobar historial y recarga. Si se usa la copia offline, actualizar el paquete del plano con conexión.

El código se presenta en una nueva pull request; no se hace merge automático. Estas instrucciones no significan que la instancia Render ya haya sido actualizada.

Corrección posterior de datos iniciales: el lote de 13 perímetros y el recorte vecino se documentan en `ATLAS_PROGRESS.md` y `audit/source-contour-repairs.json`. Son correcciones derivadas contra PDF, pendientes de aprobación técnica. Se muestran directamente en el visor y en sus capas.
