# Editor de contornos

Sirve para corregir a mano el contorno de los recintos, sobre las líneas reales del DWG, como se editan las polilíneas en AutoCAD. Es una herramienta de computador (mouse y teclado).

## Dónde se usa y dónde guarda

| | Publicado en Atlas | En el PC de desarrollo |
|---|---|---|
| Abrir | Plano → «Editor de contornos» (abre `/editor-contornos/editor.html?nivel=…`, detrás de la clave de Atlas) | `node scripts/editor-contornos/servidor.mjs` → http://127.0.0.1:8012/ |
| Guarda | En **Nube**, recinto por recinto, con la cuenta del equipo (rol `editor`). Requiere `supabase/contornos.sql` | En `dist/<piso>/contornos.json` (el −1 en `dist/contornos.json`), para publicarlo con commit |
| Líneas del DWG | `dist/editor-contornos/barreras/<nivel>.json` (compactas, publicadas con `publicar-lineas.mjs`) | `data/<nivel>/barreras.json` completas (no están en git) |

La app aplica las correcciones sobre los contornos originales, que no se modifican. Lo guardado en Nube manda sobre el archivo del piso para el mismo recinto y se ve en todos los equipos con sesión de Nube: al abrir el plano y al sincronizar, cada 3 minutos. Una corrección eliminada en el editor vuelve al contorno original.

Una corrección manda sobre la superficie auxiliar, el perímetro reparado y el contorno técnico, incluso si está validado. Solo una edición manual guardada en el navegador de un equipo queda por encima, y solo en ese equipo.

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

**Enganche:** igual que en AutoCAD, gana el candidato más cercano dentro de la mira, con esta prioridad: extremo (□), intersección (×), punto medio (△), perpendicular (⊥) y, si no hay otro, el punto más cercano del tramo (⧗). Con ORTO, el tramo queda horizontal o vertical y se engancha donde esa recta cruza un muro o se alinea con un extremo.

**Barra inferior:** coordenadas en metros, largo del tramo y área del recinto comparada con la superficie del PMA.

## Guardar

Ctrl+S valida antes de guardar:
- el recinto existe y su código coincide;
- el contorno no se cruza consigo mismo y no sale del plano;
- el rótulo queda dentro del contorno. Si el rótulo va afuera con línea guía, marca «El rótulo va fuera del contorno».

Si algo falla, no se guarda nada y aparece la lista de errores.

- **Publicado:** sube solo los recintos que cambiaron. Si otro equipo cambió uno de ellos entretanto, avisa y hay que volver a abrir el piso.
- **En el PC:** para que llegue a todos hay que hacer commit del `contornos.json` del piso. Después se regenera `sw.js` en una copia LF y se pasa `contornos-test.mjs`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `dist/editor-contornos/geometria.mjs` | Áreas, enganche, orto, partir y simplificar, sin interfaz |
| `dist/editor-contornos/archivo.mjs` | Formato `atlas-contornos-v1`, validación y escritura con un recinto por línea, para que los cambios se lean bien en git |
| `dist/editor-contornos/editor.html`, `editor.mjs` | Interfaz |
| `dist/contornos-nube.mjs` | Contornos en Nube: guardar, bajar y combinar con el archivo del piso |
| `scripts/editor-contornos/servidor.mjs` | Servidor local: sirve `dist/` y solo escribe los `contornos.json` |
| `scripts/editor-contornos/publicar-lineas.mjs` | Publica las líneas del DWG que usa el enganche |

Coordenadas: unidades del plano de Atlas (1 unidad = 1,7639 cm, el punto PDF de una lámina 1:50). Las líneas del DWG se pasan con el marco de cada piso, igual que los mosaicos.
