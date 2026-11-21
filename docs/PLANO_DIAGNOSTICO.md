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
