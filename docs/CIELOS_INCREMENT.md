# Cielos: navegación documental por recinto

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
