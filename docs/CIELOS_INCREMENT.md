# Cielos: navegación documental por recinto

## Vista unificada S01

En **Piso −1 → Filtros y capas → Cielos** se abre la vista continua sobre el plano y los contornos existentes de Arquitectura. En terreno, **Filtros y capas** se abre desde **Más**. El sombreado indica recintos con referencias de Cielos. Busca por código o nombre o toca un recinto para abrir su ficha. Cada lectura tiene el enlace a su lámina y página. Las lecturas automáticas se identifican como pendientes de revisión. Si el recorte contiene varios códigos o el código corresponde a varios recintos, la ficha presenta la fuente para revisar la atribución. Los códigos de luminaria en el recorte son referencias documentales, sin conteo de unidades.

**Simbología** abre las tablas generales de la lámina CIE-A-501, página 1. El botón **Láminas originales y registros** abre el visor anterior por hoja, incluidas sus zonas y registros guardados. En esa vista, **Volver a plano unificado** devuelve al plano continuo.

Se cotejaron los siete PDF entregados, A-502 a A-508, con las fuentes existentes. Son idénticos byte por byte. Se conserva A-501 como fuente adicional de S01. La vista cruza las observaciones por código, conserva separadas las lecturas de cada fuente y reutiliza la geometría de Arquitectura para seleccionar. Los PDF quedan disponibles para revisar los límites y la disposición original de cada cielo. El recorte de simbología usa la caja rotada de la lámina A-501 `[3678, 23, 3928, 1014]` en unidades PDF, rasterizada con PyMuPDF.

Pruebas de la vista unificada: `node discipline-model-test.mjs` y `PLAYWRIGHT_MODULE=<ruta-a-playwright-core/index.mjs> node cielos-unificados-browser-test.mjs`. El recorrido usa el visor real, selecciona un recinto cotejado y verifica la simbología separada. Las fichas usan recursos del paquete base offline y la simbología está incluida en el paquete del piso −1. Los PDF originales siguen siendo una descarga opcional.

## Visor histórico por lámina

Actualización posterior: `REENGINEERING_AUDIT.md` documenta 75 candidatos CIE recuperados y nuevas reglas de trazabilidad/autoridad geométrica. Se mantienen las 329 observaciones base descritas a continuación; el visor consulta además esos candidatos pendientes.

Sobre la implementación existente de Atlas HPC 3.0, este incremento completa la consulta entre Arquitectura, las ocho láminas ARQ-CIE y Pavimentos. No genera recintos ni atributos nuevos.

## Recorrido

1. Seleccionar un recinto en Arquitectura y cambiar la especialidad a Cielos, o buscar código/nombre directamente en Cielos.
2. Si el código tiene una observación, se localiza su etiqueta. Si tiene varias, elegir la fuente en «Correspondencia por código». Las etiquetas repetidas dentro de una misma lámina conservan su identidad.
3. Consultar la ficha y abrir su PDF original. El caso cotejado `7.1.2.1.2-1` en CIE-504 conserva 12,45 m², NCT 2,80 m, cielo 213 y luminaria L19.
4. Cambiar de lámina: solo se selecciona automáticamente una observación del mismo código cuando es única en esa lámina. Los atributos quedan pendientes cuando no hay selección.
5. Volver con «Ver en Arquitectura» o el selector de especialidad. La asociación usa códigos exactos; no transfiere coordenadas o contornos. Pavimentos conserva el código sin atribuirle una posición.

Los nombres derivados de Arquitectura se identifican como tales. Las descripciones de materiales proceden de su código en el catálogo ARQ. Los números que aparecen en texto extraído no se convierten automáticamente en códigos de material. Solo una observación CIE tiene códigos de cielo/luminaria cotejados en los datos actuales; el resto mantiene sus pendientes.

## Validación reproducible

Desde la raíz del repositorio, con Node 24:

```sh
for suite in test runtime-test atlas-test selection-test interaction-test layers-test construction-test offline-test offline-ui-test discipline-model-test; do
  node "$suite.mjs" || exit
done
```

La prueba Chromium usa Playwright Core como herramienta de desarrollo externa al sitio. Instalarlo fuera del checkout y apuntar a un Chromium existente:

```sh
npm install --prefix /workspace/atlas-browser-tools playwright-core@1.56.1
PLAYWRIGHT_MODULE=/workspace/atlas-browser-tools/node_modules/playwright-core/index.mjs \
CHROMIUM_PATH=/usr/bin/chromium node cielos-browser-test.mjs
```

El test inicia su propio servidor HTTP temporal y usa perfiles vacíos del navegador. No modifica las bases SQLite, los PDF ni el almacenamiento de usuarios. Comprueba ficha real, asociación/ambigüedades, cambios de lámina y especialidad, búsqueda y cargas tardías. Incluye escritorio y viewport móvil; no sustituye Safari/iPhone físico.

Después de cambiar archivos servidos:

```sh
node scripts/prepare-offline.mjs
node offline-test.mjs
```

El módulo nuevo se incluye en el núcleo offline. El manifiesto generado conserva hashes actuales.

## Resultado de esta revisión

Las nueve suites Node de la línea base y la nueva suite del modelo pasan. El recorrido Chromium pasa a 1440×1000 y 390×844, incluyendo reintento de carga y descarte de respuestas tardías, sin errores de página. Las tres SQLite conservan los hashes iniciales, pasan integridad y no tienen errores de claves externas. Los originales, datos y geometrías no cambian.

## Pendientes

Continúan pendientes la validación técnica de contornos CIE, alineación por puntos de control, revisión de los atributos extraídos, posiciones PAV, ensayos Safari/iPhone físicos y modo avión real. Protocolos/avances locales y el piloto de puertas conservan su alcance previo; las puertas no constituyen un inventario fiable. No hay sincronización multiusuario.

## Cielos de N01–N04 desde las láminas CIE (2026-11-16)

Los pisos 1 a 4 no tienen láminas PDF de cielos como el −1. Sus cielos salen de las láminas DWG `HPC-ARQ-CIE-N0x-A-50x` (cielo reflejado), con `scripts/cielos/extraer-cie.mjs`, y quedan en `dist/n0x/cielos.json`. La marca `cielos: true` en `pisos.js` los activa.

- **Qué se lee:** el tipo de cielo de cada recinto (etiqueta 201…219 de la capa A-AREA-IDEN) y su altura (`NCT 2,80 m`, capa A-CLNG-IDEN).
- **Cómo se ubica:** las láminas no traen muros (vienen por referencia), así que se calzan sobre el plano de Atlas con los códigos de recinto. Se usa una semejanza por mínimos cuadrados, con el eje Y invertido y descartando los que no calzan. El giro queda bajo 1° y el residuo mediano entre 0,4 y 0,8 m, que es la distancia entre rótulos. Cada etiqueta se asigna al recinto que la contiene, o al más cercano a menos de 0,6 m.
- **Resultado:**

  | Piso | Con tipo de cielo | Con NCT | Nota |
  |---|---|---|---|
  | N01 | 339 | 316 | |
  | N02 | 352 | 312 | |
  | N03 | 297 | 236 | No hay lámina A-501 |
  | N04 | 208 | 150 | La A-502 no comparte códigos con el plano |

  En todos los recintos el tipo de la lámina coincide con el del PMA. Si alguno difiere, el rombo lo avisa.
- **En la app:** en Filtros y capas → Especialidad, «Cielos» pinta la capa «Cielos según lámina CIE». También hay una capa «Altura de cielo (NCT)». En el rombo, la terminación CIE muestra «Lámina CIE A-50x: cielo 2xx · NCT x,xx m».
- **Prueba:** `node cielos-test.mjs`.
