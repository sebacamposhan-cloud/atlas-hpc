# Puertas · nivel −1 (consulta documental, asociación pendiente)

Dos PDF suministrados por el usuario se unieron geométricamente usando ejes AH/AI/AJ, sin deformar las láminas. Mediana de desplazamiento en coordenadas PDF sin rotación: (1641.9593200683594, 0.1201171875). Diferencia entre controles X <0.003 unidades PDF y Y <0.007. Se corta la superposición en X=2000, con una sola fuente por lado, y se mantiene el PDF vectorial unido, overview y teselas a 1.5×. El encuadre elimina márgenes/viñetas; no modifica los originales. Huellas SHA256 de ambos originales en catálogo. Regenerar con scripts/doors/prepare.py y los dos archivos, requiere PyMuPDF/Pillow.

Datos: 473 llaves únicas S01, 271 etiquetas de recinto dentro del encuadre y 68 etiquetas de niveles diferentes separadas en reviewOtherLevels. Un tipo no se lee como código (G1_S01_01) y se muestra pendiente. Las etiquetas y los ejes son datos vectoriales extraídos; no se necesita OCR. A2_S01_48 se lee PI01c.

## Límite que impide considerarlo inventario validado

Los PDF muestran tipo/llave y códigos de recinto en etiquetas diferentes. No existe una relación tabular inequívoca en el texto. La implementación conserva candidatos por proximidad, **no asignaciones certificadas**, y los muestra explícitamente pendientes. Seleccionar una etiqueta de recinto muestra su código grande y las puertas candidatas; seleccionar una puerta muestra tipo y llave originales y códigos cercanos para revisión. No se ha delimitado cada recinto contra muros; el clic se reconoce cerca de la etiqueta, no en toda su superficie. No hay rombo en la ficha. Antes de usar para mediciones, pagos o inventario, revisar la relación recinto↔puerta y completar selección por superficie. Las 68 llaves de otros niveles y un tipo pendiente requieren cotejo con el emisor.

Por ello esta PR debe tratarse como **base de revisión**, no cumplimiento completo de la asociación de puertas solicitada. No altera ARQ/CIE ni geometrías existentes. El botón solo aparece en −1. La documentación y todos los recursos de puertas se incorporan al paquete offline de planos.

Pruebas: puertas-test valida conteos, llaves, tipo del ejemplo, transformación y archivos; browser prueba especialidad −1, búsqueda, ficha y vuelta ARQ en móvil/escritorio. Inspección visual del plano unido realizada; no certifica todas las asociaciones ni contornos.
