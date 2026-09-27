# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[Semantic Versioning](https://semver.org/lang/es/).

## [1.0.0] - 2026-09-26

Primera versión pública. Resume el trabajo de julio a septiembre de 2026.

### Lectura
- Contenido completo de cada artículo dentro de la app (Readability + `sanitize-html`).
- Palabras silenciadas y dedupe de la misma noticia entre fuentes.
- PWA instalable con temas, color de acento, ancho de columna y tamaño de texto.
- Barra de progreso de lectura y lectura asistida (traducir o buscar el texto seleccionado).

### IA
- TL;DR de 1-2 frases con proveedor conmutable: Ollama, Anthropic Claude o ninguno, con presupuesto diario.
- "Hoy" ordenado por relevancia semántica con embeddings (`nomic-embed-text`), con respaldo por palabras clave.
- Búsqueda semántica, artículos relacionados y categorización por contenido.
- Consola de IA en vivo por SSE y minichat con el modelo.

### Audio
- Audiolibro con Piper (en la Pi) o Kokoro (GPU en la PC), cola de reproducción y controles en pantalla de bloqueo.

### Confiabilidad
- Watchdog de ingesta con timeout global y recuperación de locks viejos.
- Fix de OOM en la Raspberry Pi: embeddings recorridos por lotes con paginación por cursor y top-K acotado.
- Avisos en la app cuando una fuente falla o la ingesta se detiene.
- Suite de tests con Jest.

### Deploy
- PM2 o Docker en Raspberry Pi 4B, con guías de hosting, autenticación y proveedores de IA en `docs/`.
- CI en GitHub Actions: build y tests en cada push.

[1.0.0]: https://github.com/jipixz/RSS-Feed/releases/tag/v1.0.0
