# Editor de contornos (herramienta interna)

Sirve para corregir a mano el contorno de los recintos, sobre las líneas reales del DWG, como se editan las polilíneas en AutoCAD. Corre solo en el PC de desarrollo y **no se publica**: el personal de terreno no la ve.

Lo corregido se guarda en `dist/<piso>/contornos.json` (el −1 en `dist/contornos.json`). La app aplica ese archivo sobre los contornos originales, que no se modifican. Una corrección manda sobre la superficie auxiliar, el perímetro reparado y el contorno técnico, incluso si está validado. Solo una edición manual guardada en el navegador de un equipo (botón «Editar contorno» de la ficha) queda por encima en ese equipo.

## Abrirlo

```
node scripts/editor-contornos/servidor.mjs
```

Luego abrir http://127.0.0.1:8012/ en Chrome. Elige el piso arriba a la izquierda.

El enganche a muros usa `data/<nivel>/barreras.json` (muros, puertas, ventanas, pilares y escaleras del DWG), que no está en git porque pesa unos 6 MB por piso. Lo genera `scripts/dwg-plano/extraer.mjs`. Si falta, el editor funciona igual, pero solo se engancha a los contornos de los recintos.

## Cómo se usa

La lista de la izquierda muestra primero los recintos **por revisar**: superficies auxiliares, contornos parciales y recintos cuya área difiere más de 15 % de la del PMA. Al elegir uno, el plano lo encuadra.

| Acción | Cómo |
|---|---|
| Mover el plano · zoom | Arrastrar en vacío, botón central o Espacio · rueda |
| Mover un vértice | Arrastrar ■ |
| Agregar un vértice | Arrastrar ▫, el punto medio de un tramo |
| Mover un tramo en paralelo | Ctrl + arrastrar ▫ (útil para llevarlo justo al muro) |
| Quitar un vértice | Clic derecho sobre ■, o Supr con el cursor encima |
| Dibujar desde cero | **D**, clic en cada vértice; Enter o clic en el primero para cerrar. Ctrl+Enter lo agrega como otra parte del recinto |
| Partir | **P**, línea de lado a lado y Enter. Queda la parte con el rótulo (✚); si la otra contiene el rótulo de un vecino, ofrece dársela |
| Simplificar | **S**: quita vértices sobrantes (desvío menor a 1,5 cm) |
| OSNAP · ORTO | **F3** · **F8** (o mantener Shift) |
| Deshacer · rehacer · guardar | Ctrl+Z · Ctrl+Y · Ctrl+S |

**Enganche:** igual que en AutoCAD, gana el candidato más cercano dentro de la mira, con prioridad para extremo (□), intersección (×), punto medio (△), perpendicular (⊥) y, si no hay otro, el punto más cercano del tramo (⧗). Con ORTO, el tramo queda horizontal o vertical y se engancha donde esa recta cruza un muro o se alinea con un extremo.

**Barra inferior:** coordenadas en metros, largo del tramo y área del recinto comparada con la superficie del PMA.

## Guardar y publicar

Ctrl+S envía todo al servidor, que valida antes de escribir:
- el recinto existe y su código coincide;
- el contorno no se cruza consigo mismo y no sale del plano;
- el rótulo queda dentro del contorno. Si el rótulo va afuera con línea guía, marca «El rótulo va fuera del contorno».

Si algo falla, no se escribe nada y aparece la lista de errores.

Para que llegue a todos hay que hacer commit del `contornos.json` del piso y publicar como siempre. Hay que regenerar `sw.js` en una copia LF y pasar `contornos-test.mjs`, que corre en el build de Render.

## Archivos

| Archivo | Qué hace |
|---|---|
| `geometria.mjs` | Áreas, enganche, orto, partir y simplificar, sin interfaz |
| `archivo.mjs` | Formato `atlas-contornos-v1`, validación y escritura con un recinto por línea, para que los cambios se lean bien en git |
| `editor.html`, `editor.mjs` | Interfaz |
| `servidor.mjs` | Servidor local: lee `dist/` y `data/`, y solo escribe los `contornos.json` |

Coordenadas: unidades del plano de Atlas (1 unidad = 1,7639 cm, el punto PDF de una lámina 1:50). Las líneas del DWG se pasan con `data/<nivel>/marco.json`, igual que los mosaicos.
