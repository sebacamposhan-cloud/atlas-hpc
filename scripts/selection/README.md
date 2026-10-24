# Superficies auxiliares de consulta

direct-candidates.json.gz conserva las geometrías vectoriales candidatas y la evidencia de suelo de las nueve fuentes, junto con los identificadores de los 330 recintos incluidos. manual-regions.json conserva 41 trazados auxiliares en coordenadas del montaje. Estos archivos son la instantánea revisada utilizada en esta versión.

Con Python y Shapely 2 disponibles en desarrollo, ejecutar python scripts/selection/build-selection.py desde la raíz del repositorio reproduce dist/selection.json. El ensamblado recorta al área solicitada, resta evidencia de recintos vecinos, da prioridad a subrecintos menores y simplifica los vértices. Verifica que cada posición de rótulo permanezca cubierta. El resultado usa los identificadores originales, no el orden de la interfaz.

Estas superficies solo sirven para abrir fichas mediante clic. No alteran los polígonos técnicos ni sus estados en dist/data.json, no recalculan áreas y siguen pendientes de revisión técnica. Las correcciones de contorno del usuario se aplican en el navegador con prioridad sobre estas superficies. El sitio publicado no necesita Python.
