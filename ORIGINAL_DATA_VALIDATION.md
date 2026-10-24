# Validación documental

## Fuentes

Nueve láminas originales HPC-ARQ-PLA-S01-A-501 a 509, Rev01_V1, fecha impresa 13 agosto 2025. Cada PDF tiene una página, arquitectura, planta de nivel −1 con sector A–I y escala impresa 1:50. El décimo PDF no fue recibido. `docs/inventory.json` contiene nombres originales y hashes.

## Extracción

Se reconoce la etiqueta por nombre, superficie escrita, código y seis campos del rombo. Se comprueba alineación y distancia. No se utiliza un patrón numérico aislado como prueba de recinto: los códigos de puertas también contienen puntos. Se conservan códigos alfanuméricos como RT.(-1)-1 y CU.3.1.4-1.

Orden del bloque fuente: CIE, M1, M2, M4, M3, PAV, nombre, superficie, código. Este orden se cotejó visualmente con la simbología de la lámina 501: M1 arriba, M2 derecha, M3 abajo, M4 izquierda, CIE centro superior, PAV centro inferior. Las coordenadas se conservan por campo. No se interpreta una superficie escrita como cantidad medida.

Leyenda por documento: 11 Esmalte al Agua Asepsia Baja; 12 Esmalte al Agua hospitalario Asepsia Media; 13 Pintura en base Epóxica Asepsia alta. Se consultan exclusivamente códigos usados en M1–M4. Código 115, esmalte epóxico de piso, NO implica asepsia alta.

Las 438 etiquetas tienen seis campos vinculados a una descripción en su leyenda. Esto verifica integridad de referencias, no certifica individualmente todas las asociaciones.

## Procedimiento para validar un recinto

1. Abrir PDF original y ubicar nombre/código.
2. Comparar los seis campos de rombo con imagen y tabla.
3. Verificar cada descripción contra la leyenda de esa revisión.
4. Revisar TODO el perímetro: caras de muros, umbrales, pilares e islas; el mobiliario no debe recortar la selección del recinto.
5. Confirmar que no se incluye otro recinto y que no se superponen polígonos.
6. Registrar responsable, motivo/evidencia, confirmar revisión y cambiar a Validado.
7. Comprobar clic interior, aislamiento, retorno y filtro pertinente en navegador.

La UI exige confirmación, polígono válido y códigos documentados para guardar Validado. Es un procedimiento humano declarado, no una certificación automática. Un responsable introducido en texto no equivale a una identidad autenticada.

## Evidencia revisada en esta sesión

RT.(-1)-1, lámina 501, recinto técnico: muros 11, CIE 200, PAV 115; superficie escrita 11,21 m². Contorno respeta el entrante del pilar superior derecho y elimina exclusiones del equipamiento.

RT.(-1)-10, lámina 502, recinto técnico: muros 11, CIE 200, PAV 115; superficie escrita 8,03 m². Recinto rectangular comprobado visualmente; el contorno abarca los tableros interiores.

El estado Validado de estos dos registros documenta el cotejo fuente/geometría, no una prueba completa de interfaz ni aceptación profesional de obra.

## Incidencias

Ver `docs/incidencias.json`: todos los registros pendientes, incluidos 280 sin contorno. Diferenciar etiqueta documental de recinto físico único. Duplicados de código entre sectores requieren análisis de continuidad antes de consolidar; el identificador compuesto evita mezclarlos.
