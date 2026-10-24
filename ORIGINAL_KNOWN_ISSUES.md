# Limitaciones conocidas

1. Falta el décimo PDF del prompt; no se inventó su contenido.
2. 280 de 438 etiquetas no tienen polígono. En ellas solo se puede seleccionar el marcador o resultado, no cualquier punto del interior.
3. De 158 contornos, 156 siguen pendientes. Los recortes vectoriales pueden incluir exclusiones de mobiliario, entrantes o islas que no son límites del recinto. El filtro dibuja contornos candidatos con línea discontinua, no los presenta como validados.
4. El filtro de asepsia baja encuentra 102 etiquetas, pero solo 27 disponen de contorno. La aceptación de coloreado completo de TODOS los recintos aún no está satisfecha.
5. Solo se verificaron individualmente dos recintos. El resto conserva estado pendiente, aunque las referencias a leyendas estén íntegras.
6. QA de navegador, táctil y Windows pendiente. No se han medido tiempos de DOM, selección o restablecimiento en hardware del usuario.
7. Solo se recibió nivel −1; separación entre sectores está probada. No se ha probado con archivos reales de otros pisos.
8. Importador específico para formato HPC S01 de una página con rotación 90°. Rechaza formatos distintos. Nuevas geometrías requieren `geometry.py` o editor manual.
9. No se incluye consolidación de recintos repetidos, gestión completa de proyectos/niveles, comparación automática de revisiones, edición administrativa de las leyendas ni autenticación multiusuario.
10. Consultas naturales se resuelven con reglas locales para códigos, asepsia, porcelanato, códigos de materiales y pendientes. No existe un asistente general de preguntas abiertas ni comparación narrativa de dos recintos. Una pregunta no reconocida se trata como búsqueda literal.
11. Las capas de terminaciones se ofrecen como modos de coloreado alternativos, no como varias capas simultáneas independientes. El plano PDF exportado incluye coloreado por consulta en un tono uniforme, no toda la configuración visual de capas.
12. Exportar un plano genera una copia superpuesta; las firmas originales no certifican esa copia modificada. El PDF original descargable permanece intacto.
13. Las consultas usan recorridos de registros; antes de miles de recintos conviene consulta SQL/FTS y caché incremental. El rendimiento medido solo cubre el conjunto actual.
14. La interfaz de edición permite mover/agregar/quitar el último vértice y redibujar; no tiene editor gráfico dedicado de islas ni selección gráfica del recorte de rombo (se editan sus coordenadas).
15. El paquete requiere Python y dependencias; no incluye ejecutable autónomo ni instalación de servicio Windows Server.
