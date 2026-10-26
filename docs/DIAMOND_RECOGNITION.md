# Reconocimiento y consulta de rombos — primer incremento

El objetivo es reconocer el bloque documental antes de usarlo para corregir geometría. La cobertura de Arquitectura se comprueba en las nueve láminas originales, sin modificar PDF, SQLite, etiquetas ni contornos.

## Reconocimiento de fuentes

`scripts/audit-diamonds.py` busca conjuntos de seis textos con la disposición de la leyenda: M1 arriba, M2 derecha, M3 abajo, M4 izquierda, CIE centro superior y PAV centro inferior. Normaliza /Rotate del PDF y conserva cajas por campo, página y SHA256. Los códigos se contrastan con el catálogo existente. Los símbolos completos con N/A y S/E también se reconocen; no se eliminan por no tener un código de cielo numérico.

Resultado: **443 símbolos de seis campos reconocidos**, correspondientes a las 443 observaciones ARQ existentes. Coinciden los 2.658 códigos de campo. No quedaron observaciones conocidas sin detectar ni candidatos sin asociación bajo esta plantilla. Por lámina: 501=37, 502=27, 503=49, 504=35, 505=35, 506=70, 507=75, 508=70, 509=45.

Es un reconocimiento de la plantilla textual estándar de estas fuentes, no OCR genérico ni validación arquitectónica. No demuestra cobertura universal de símbolos a otras escalas, escaneados o de otras disciplinas. No se traslada esta plantilla automáticamente a los planos CIE. Informe reproducible: `audit/diamond-recognition.json`.

La asociación con observaciones existentes se coteja por identidad de fuente y caja del campo CIE previamente registrada, no por proximidad a un contorno o por semejanza de nombres. La prueba comprueba todos los IDs y códigos, y los hashes reales de los PDF. Las asociaciones técnicas pendientes conservan su estado.

## Consulta funcional

El botón **Rombos** abre un catálogo de las 443 observaciones, con búsqueda por código, nombre y terminación, filtro por lámina y paginación. Conserva observaciones del mismo código en láminas distintas. Los 330 recintos consolidados del plano no equivalen a las 443 observaciones documentales.

Cada ficha del catálogo muestra imagen original, los seis campos ordenados, descripciones, superficie escrita, lámina, revisión, página e identificador. Los registros que quedan fuera del recorte A–W/1–12 se pueden consultar sin inventar una ubicación en el plano recortado. Se conserva el enlace al PDF original; la descarga del PDF sigue siendo parte del paquete offline opcional.

«Mostrar rombos en el plano» habilita marcas sobre sus cajas reales para los 330 recintos consolidados. Clic o Enter/Espacio abre la ficha sin depender del contorno de selección. Las marcas amarillas son zonas documentales, no perímetros de recinto. Se respeta el bloqueo durante edición de contornos. El catálogo y su módulo se incluyen en el núcleo offline.

## Verificación

```sh
/workspace/atlas-tools-venv/bin/python scripts/audit-diamonds.py
node diamonds-test.mjs
PLAYWRIGHT_MODULE=/workspace/atlas-browser-tools/node_modules/playwright-core/index.mjs CHROMIUM_PATH=/usr/bin/chromium node diamonds-browser-test.mjs
```

El recorrido Chromium cubre escritorio/móvil, catálogo completo, observación fuera del recorte, seis campos e imagen, localización en mapa, marcas directas, teclado, búsqueda vacía y dimensiones del panel. Las pruebas existentes siguen siendo necesarias para contornos, datos y offline.

## Continuidad

Con esta cobertura documental comprobada, revisar contornos por ID/rombo/fuente, comenzando por las cuatro geometrías auxiliares inválidas y circulación. Las observaciones duplicadas entre láminas siguen necesitando revisión de continuidad. Reconocer el rombo no aprueba un contorno ni convierte superficies escritas en cantidades medidas.

Resultado del incremento: 15 suites Node aprobadas y cuatro suites Chromium (rombos, calidad, Cielos y Groq) en escritorio y móvil aprobadas. Los 36 archivos originales del inventario protegido conservan sus hashes. Para ver imágenes sin conexión se necesita el paquete de plano guardado; el PDF original requiere el paquete opcional de documentos.
