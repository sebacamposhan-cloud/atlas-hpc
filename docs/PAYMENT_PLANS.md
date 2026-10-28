# Avance dibujado por estado de pago

El formulario de pago tiene Abrir plano y dibujar avance. Lápiz libre y Mover, zoom, colores ejecutado/pendiente/observación y deshacer. Disponible para arquitectura de −1, 1, 2 y 3. No calcula cantidades, superficies ni aprobación técnica.

Conservar dibujo mantiene un borrador en el formulario; **Guardar el estado de pago** envía plano, partidas y cantidades juntos a Supabase. Cerrar/recargar antes de guardar pierde el borrador. El pago y cada revisión del historial contienen su propia copia JSON de los trazos. El siguiente pago del mismo subcontratista copia el plano del registro más reciente por período y fecha de guardado, sin modificar ese registro; puede continuar en los cuatro pisos. No se heredan dibujos entre contratistas. Cambiar contratista exige confirmar antes de reemplazar el borrador. Solo hereda registros ya guardados en nube y cargados en la consulta actual.

## Activación

Ejecutar de nuevo `supabase/payments.sql`, que ahora conserva `plan` en cada pago e historial. No elimina pagos ni precios. Después integrar la PR y publicar main. No requiere volver a cargar la matriz. Probar guardar/reabrir desde otro equipo y crear un nuevo pago del mismo subcontratista en el proyecto real antes de trabajo productivo. Las pruebas automatizadas de Supabase usan proveedor simulado; SQLite prueba conservación real y navegador prueba trazado.

## Límites de esta versión

Se usa la imagen overview del plano actual con coordenadas normalizadas, no una lámina técnica PDF ni copia binaria inmutable de la imagen. Se preservan trazos, pero si cambia el plano base entre versiones requiere cotejar antes de reutilizarlos. No hay importación automática entre revisiones de plano ni exportación de plano PDF. Hasta 300 trazos por piso y 40 KB de dibujo total; al superar el límite pide reducir trazos, sin guardar una copia incompleta. Un único dedo dibuja en modo Lápiz; Mover y botones de zoom permiten navegar. El acceso sigue los mismos permisos de pagos. La imagen base ya existente en Atlas no contiene datos de pagos.
