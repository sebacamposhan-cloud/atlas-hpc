# Prueba de diagnóstico de planos

## Empalme de láminas con OpenCV

Prepara un JSON con el mismo formato de pares que `scripts/calibrate-sheets.py`. Cada par compara el mismo cruce de ejes o vértice identificable en las dos fuentes. Registra la lámina y revisión en `from_source` y `to_source`, y la unidad en `units`. Para evaluar el desplazamiento directo, convierte ambos conjuntos al mismo marco, unidad y orientación de ejes antes de medir. Un ejemplo de prueba, en centímetros:

```json
{"from_source":"lámina A · prueba","to_source":"lámina B · prueba","units":"cm","control_points":[[[0,0],[12,-4]],[[100,0],[112,-4]],[[0,100],[12,96]],[[100,100],[112,96]]]}
```

```sh
python -m venv /tmp/atlas-opencv
/tmp/atlas-opencv/bin/pip install opencv-python-headless==5.1.0.95
/tmp/atlas-opencv/bin/python scripts/check-sheet-alignment.py /tmp/pares.json --tolerance 2
```

El informe muestra el desplazamiento directo y el residuo respecto de un ajuste candidato de escala uniforme, giro y traslación. El residuo bajo puede coexistir con un desfase importante. Revisa los pares rechazados y repite con puntos distribuidos a lo largo del empalme en el DWG, las coordenadas del visor y las teselas convertidas al mismo marco. El comando escribe el informe en stdout. Las tolerancias del ejemplo son de prueba.

## Selección de contornos con JSTS

```sh
npm install --prefix /tmp/atlas-jsts --ignore-scripts jsts@2.12.1
node scripts/check-contour-hit.mjs dist/n02/contornos.json 4500 7500 /tmp/atlas-jsts
```

Usa las coordenadas del plano del toque y un catálogo de contornos Atlas con `recintos[].parts[].polygon` y sus huecos. El resultado compara el índice de ATLAS construido solo con ese catálogo y la clasificación de JSTS. `i` es interior, `b` borde, `e` exterior, y `hole` interior de un hueco. `validation_error` señala una geometría inválida. Si hay más de un interior válido, se listan los identificadores en `overlapping_interiors`. La selección efectiva del navegador puede incluir otras fuentes y correcciones. Para revisar un fallo real, captura también el piso, el zoom, el punto ya transformado y el identificador devuelto por el visor.

## Quitar un tramo en Last Planner

En el selector existente, al trabajar en modo Muros, la acción «Quitar tramo» retira el último tramo seleccionado del recinto activo. El contador y el plano se actualizan, y «Confirmar ubicación» aplica el conjunto al formulario. Esto permite probar las acciones contextuales sobre la geometría que ya usa ATLAS.

## Buscar casos en los datos de un piso

Para revisar el registro de las láminas desde el DWG, ejecuta el diagnóstico sobre el catálogo de rótulos. El ejemplo usa una alerta de 2 cm para el cotejo, sin establecer una tolerancia constructiva.

```sh
/tmp/atlas-opencv/bin/python scripts/check-sheet-alignment.py data/n03/laminas.json --dwg-catalog --tolerance 2
```

El informe agrupa coincidencias por par de láminas. Usa códigos de recinto que aparecen una sola vez dentro de cada lámina. Un recinto largo puede llevar el mismo rótulo en distintos puntos, así que contrasta cualquier alerta con cruces de ejes o vértices de muros. Si hay menos de tres referencias no colineales, el informe conserva las distancias y deja vacío el ajuste candidato. El catálogo no contiene evidencia del calce de las teselas renderizadas.

Para detectar solapes en un piso completo, pasa el `runtime.json` publicado. El comando resuelve las geometrías de selección y las correcciones distribuidas de ese piso. El informe incluye pares de partes con intersección de área positiva, un punto reproducible, partes inválidas y errores de comparación. El área está en unidades cuadradas del plano. Un solape puede incluir superficies auxiliares o diferencias numéricas pequeñas y requiere revisión antes de editar.

```sh
node scripts/check-contour-hit.mjs dist/n02/runtime.json --scan /tmp/atlas-jsts
node scripts/check-contour-hit.mjs dist/n02/runtime.json 2197.15 1704.1 /tmp/atlas-jsts
```

En el punto del ejemplo coinciden los contornos de `8.2.3.2.4-1` y `CT.F.2-4`. El visor activo usa sus datos efectivos, incluidas las correcciones personales o de Nube que tenga cargadas. Cuando hay varios candidatos, muestra «Elige un recinto» y espera la elección antes de abrir, marcar o asignar. Se puede cancelar y continuar en el mismo plano.
