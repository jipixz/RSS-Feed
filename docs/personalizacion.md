# Personalización

Casi todo se ajusta desde la propia app; lo demás son unos pocos archivos de
tokens/config.

## Desde la interfaz (sin tocar código)

### Lectura — botón **Aa** (dentro de un artículo, desktop)
- **Tamaño de letra**: 4 pasos (15 → 20 px).
- **Ancho del texto**: `Estrecho / Medio / Ancho / Completo` (640 / 760 / 920 px /
  todo el panel). Pensado para que en pantallas 1080p/1440p no se lea en una columna
  angosta. Se guarda por dispositivo.
- **Fuente serif**: alterna Georgia ↔ Open Sans.

### Ancho del panel lateral (desktop)
Arrastra el borde derecho del sidebar para ensancharlo (200–420 px) y ver los
títulos/resúmenes más anchos. Se recuerda.

### Tema y color de acento — botón 🎨 (arriba a la derecha)
- **5 temas**: Claro, Sepia, Café (oscuro cálido), Oscuro, Negro. Se sincroniza
  entre dispositivos (se guarda en el servidor).
- **Color de acento / resaltado**: presets (azul, cielo, violeta, verde, ámbar,
  rosa, rojo) **o color libre** con el selector. Reescribe los elementos "activos"
  (botones seleccionados, bordes, barra de progreso de lectura, caja del TL;DR). Se
  guarda por dispositivo. "Usar color del tema" lo regresa al default.

### Contenido
- **Intereses** (Ajustes) — alimentan la vista "Hoy" y la afinidad de fuentes.
- **Silenciados / mutes** — oculta artículos que contengan ciertas palabras.
- **Fuentes y carpetas** — agrégalas/quítalas desde Ajustes o importa un OPML.
- **Gestos** (Ajustes) — qué hace deslizar a izquierda/derecha en un artículo.
- **Audiolibro** — motor (Piper/Kokoro) y voz por artículo, con el 🎧.

---

## Desde el código (personalización profunda)

### Editar o crear temas — [`apps/web/src/tokens.ts`](../apps/web/src/tokens.ts)
Cada tema es un objeto con sus colores (`bg`, `surface1..3`, textos, `activeBar`,
`tldr*`, etc.). Para crear uno nuevo:
1. Agrega una entrada a `THEMES` (copia una existente y ajusta los hex).
2. Su nombre a `THEME_LABELS` y su clave al tipo `ThemeKey`.

`applyAccent()` en ese mismo archivo es lo que deriva los tonos "activos" de un
color de acento — ahí ajustas cómo se mezcla el acento con cada tema.

### Presets de acento y anchos de lectura — [`apps/web/src/local-prefs.ts`](../apps/web/src/local-prefs.ts)
- `ACCENT_PRESETS` — los colores del selector.
- `READING_WIDTHS` / `READING_WIDTH_LABELS` — los anchos de columna.
- `READING_SIZES` — los tamaños de letra.
- `SIDEBAR_MIN/MAX/DEFAULT` — límites del sidebar.

### Tipografía — [`apps/web/src/tokens.ts`](../apps/web/src/tokens.ts) → `SN.font`
Cambia las familias (`title`, `body`, `serif`, `mono`). Si usas una fuente web,
cárgala en [`apps/web/index.html`](../apps/web/index.html).

### Tono de los TL;DR y del minichat
- Prompt de resúmenes: [`apps/api/src/ai/provider/prompt.ts`](../apps/api/src/ai/provider/prompt.ts).
- Prompts de traducción y chat: [`apps/api/src/ai/ai.controller.ts`](../apps/api/src/ai/ai.controller.ts)
  (`TRANSLATE_SYSTEM`, `CHAT_SYSTEM`).

### Feeds iniciales (seed)
[`prisma/seed.ts`](../prisma/seed.ts) — las fuentes y carpetas con las que arranca
una BD nueva. Cámbialas por las tuyas antes del primer `prisma:deploy`.

Después de editar cualquier archivo del front, recompila: `pnpm --filter web build`
(o `pnpm build` para todo) y reinicia. La versión desplegada la ves en
**Ajustes → hasta abajo**.
