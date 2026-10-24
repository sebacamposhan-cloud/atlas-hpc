# Modelo y procedencia

## Inventario auditado

- SQLite original: 438 registros de recinto, preservados en tablas originales.
- Web vigente: 443 etiquetas documentales, 382 códigos distintos; 330 recintos en el ámbito A–W/1–12. No se confirmó la cifra anterior de 391.
- Arquitectura: nueve originales, 158 polígonos técnicos, dos contornos validados. Las superficies auxiliares de selección no son validación técnica.
- Cielos: ocho documentos, 329 observaciones, 277 códigos distintos. No equivalen automáticamente a 329 recintos únicos.
- Pavimentos: un original vectorial sin texto extraíble; revisión no identificada.
- Ningún registro ARQ de la base distribuida declara asepsia alta. El selector ahora se construye con las categorías presentes; no modifica correcciones locales.

## Migración

`migrations/002_construction.sql` es aditiva e idempotente. Incluye fuentes, observaciones, materiales, transformaciones, zonas, eventos, protocolos, relaciones, puertas, MEP, cerraduras, referencias autorizadas de llaves, evidencia, validaciones e historial. Claves externas e índices por código/nivel, sector/estado y especialidad/fuente. No hay códigos de corte de llaves ni secretos.

`data/atlas-v2-original.sqlite` conserva el original. `data/atlas.sqlite` integra observaciones web y CIE sin reemplazar las tablas heredadas. `atlas-before-migration.sqlite` se crea antes de migrar. Las identidades internas son distintas de los códigos oficiales.

## Verificación puntual

ARQ-CIE 504, página 1: 7.1.2.1.2-1, Box Consulta Médica, 12,45 m², NCT 2,80 m, cielo 213, L19. Cotejo visual del PDF; descripción de 213 desde catálogo ARQ: Owa Opus. No certifica contorno, número de luminarias, MEP ni avance. Otros atributos extraídos permanecen pendientes y muestran texto fuente.

Las posiciones de etiquetas y los mosaicos usan página rotada; las cajas de extracción originales conservan explícitamente coordenadas PDF sin rotar. Las zonas dibujadas pertenecen a una lámina/revisión, pueden ser parciales y tienen área m² nula hasta validación. La superficie declarada del recinto no se usa como superficie ejecutada.

Los eventos son independientes por estructura, cierre/paneles, terminaciones, MEP, inspección y pavimento. Protocolos se identifican internamente y se reúnen por número oficial/especialidad en el navegador; vincular varios códigos no multiplica conteos. La revisión técnica y el cierre administrativo son separados. No hay porcentaje sin denominador previsto.
