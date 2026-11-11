# Levantamientos en Proyectos

Un **levantamiento** es un proyecto con una tabla de columnas propias por recinto, pensado para relevamientos como «recintos listos para instalar artefactos». Convive con el proyecto de **marcado** (un estado por recinto), que no cambia.

## Crear o importar
- **Proyectos → + Nuevo proyecto → Levantamiento**: parte con las columnas de un levantamiento de artefactos (tipo de cielo y estatus de cielo, pavimento, puerta, pintura y ventana, más observaciones) y se ajustan a gusto.
- **Proyectos → Importar planilla (Excel o CSV)**: Atlas reconoce *Nivel* y *Código de recinto* y propone el tipo de cada columna:
  - **estado**: lista con un estado final, por ejemplo Instalado, y un «no aplica» opcional; cuenta para «Listo»;
  - **lista**: valores con color, por ejemplo el tipo de cielo;
  - **texto**: libre.
- Las variantes de escritura se unen (Instalado / Instalada / instalado). Antes de importar se revisan nombres, tipos, colores y estado final.
- Se crea un levantamiento por piso, unidos por un mismo grupo. Las filas con nivel desconocido o código repetido se informan.

## Usar
- **Colorear plano por**: una columna de lista o estado, o **Listo para instalar**. Esta vista pinta verde cuando todas las columnas de estado están en su estado final o en «no aplica».
- Tocar un recinto abre su ficha en el panel, con una botonera por columna. Un recinto nuevo entra al marcar su primera columna.
- **Tabla**: todas las filas del piso con filtros como Excel. **El filtro acota también el plano y la exportación (PDF y PNG)**: así se cruzan columnas, por ejemplo «Tipo de pavimento = 103» coloreado por «Estatus», o se dejan fuera los «Sin dato». El filtro se recuerda por proyecto en el equipo y el panel lo muestra con «Quitar filtro».
- **Enlace con la planilla de avance**: una columna de lista puede tomar el estado de una partida de la planilla (Proyectos → Nuevo → Avance de una partida). Ver [PLANILLAS_AVANCE.md](PLANILLAS_AVANCE.md).
- **Columnas**: editar nombres, tipos, opciones y enlace. Los cambios se aplican a todos los pisos del levantamiento.
- **Enlace con el rombo**: una columna de estado puede tomar el avance del rombo (pavimento, cielo o muros, estos últimos juntos). Mientras el rombo tenga registro manda sobre el valor guardado, y la ficha lo muestra como «del rombo».

## Exportar
**Excel** junta los pisos del levantamiento con los mismos encabezados (Nivel, Código de recinto, cada columna y «Listo para instalar»). Los valores enlazados salen del rombo de su piso. La librería de Excel de la app no escribe colores de celda.

## Datos
- Esquema 3 de los documentos de proyecto (`dist/levantamiento-model.mjs`); se guarda y sincroniza con Nube como cualquier proyecto (tipo `proyecto`, sin cambios en Supabase).
- Interfaz: `dist/levantamiento.mjs`. Pruebas: `levantamiento-test.mjs`, en el build de Render.
