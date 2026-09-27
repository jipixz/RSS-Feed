> **Nota:** este es el spec original con el que arrancó el proyecto. La implementación final se desvió en
> algunos puntos (SQLite en lugar de SQL Server, React + Vite en lugar de Next.js); el README describe el estado actual.

# SPEC — Señal · Lector de señal de industria

> **Módulo:** Señal (lector RSS personal con filtrado de ruido y resumen IA)
> **Versión:** v1.0.0
> **Estado:** Spec lista (4 niveles completos — listo para construir)
> **Metodología:** Spec Driven Development (SDD) — la spec es el contrato; el código la sigue.
> **Handoff:** este documento es la fuente de verdad para Claude Code. Ver `CLAUDE.md` para stack, comandos y reglas de código.

---

## Decisiones asumidas (confírmame o cámbialas antes de construir)

Estas las tomé yo para poder entregarte el spec completo. Ninguna es sagrada:

| # | Decisión | Default elegido | Cámbialo si… |
|---|---|---|---|
| DA-1 | **Multiusuario** | Single-user (sin login). Un único usuario implícito. Schema deja `userId` nullable para futuro. | quieres que otros del equipo lo usen → habría que meter auth. |
| DA-2 | **Modelo IA para TL;DR** | `claude-haiku-4-5` (barato, suficiente para resúmenes de 2 frases). | quieres resúmenes más ricos → subir a Sonnet (más caro). |
| DA-3 | **Presupuesto IA** | Máx. 60 resúmenes / día. Al agotarse, los nuevos quedan `pending` y se resumen al día siguiente. | quieres más volumen → subir el tope. |
| DA-4 | **Retención** | Artículos leídos y no guardados se purgan a los 30 días. Guardados nunca se purgan. | quieres archivo permanente → desactivar purga. |
| DA-5 | **Hosting** | Local / WSL2 (uso personal). API y web en la misma máquina; SQL Server local o de red. | quieres exponerlo a internet → aplica RS-2.2 (token en writes). |
| DA-6 | **Estructura repo** | Monorepo con `apps/api` (NestJS) + `apps/web` (Next.js), pnpm workspaces. | prefieres dos repos separados. |

---

# Nivel 1 — Contexto

### 1.1 Problema
Los feeds algorítmicos (X, Google Discover) optimizan por engagement, así que contaminan con política y farándula sin forma real de curarlos. RSS y newsletters resuelven eso porque las fuentes las eliges tú, pero los lectores existentes fallan en tres puntos concretos: (1) el filtrado por palabras clave y el contenido completo del artículo son features de pago (Inoreader Pro), (2) no traen resumen que permita decidir si algo vale tu tiempo, y (3) su UX no es intuitiva.

### 1.2 Usuario y situación
Usuario único: un desarrollador (rol técnico, integraciones/automatización) que quiere ponerse al día de su industria — IA, desarrollo/carrera, SQL Server y seguridad — en un skim corto, sin ruido, sin salir de la app para leer el cuerpo completo.

### 1.3 Definición de éxito (90 días)
- Abre Señal **≥ 5 días/semana** (reemplaza el hábito de X/Discover para noticias de industria).
- **< 5%** de los artículos mostrados son ruido (política/farándula/pop) — medible vs. cantidad ocultada por mutes.
- Lee el cuerpo completo **dentro de la app** en ≥ 80% de las aperturas (no rebota al navegador).
- Tiempo de "ponerse al día" **< 10 min/día**.
- Costo de IA **< $5 USD/mes**.

### 1.4 Fuera de alcance (v1)
Auth multiusuario robusta · app móvil nativa · push notifications · comentarios/social · self-hosting para equipo · UI de importación OPML (los feeds se seedean por config) · planes de pago · sincronización con lectores externos.

### 1.5 Ancla de costo/uso
El único costo variable es la **API de Claude**. Se controla con el presupuesto diario de resúmenes (DA-3) y con resumir cada artículo **una sola vez** (RN-04). Objetivo: mantener el gasto mensual acotado y predecible.

---

# Nivel 2 — Comportamiento

## Escenarios (ESC) — formato Dado / Cuando / Entonces

**ESC-01 · Ingesta periódica**
Dado un conjunto de feeds activos, cuando corre el cron de ingesta (intervalo `INGEST_CRON`), entonces el sistema hace fetch **server-side** de cada feed, parsea los ítems, descarta los ya conocidos (RN-01) y persiste los nuevos con `tldrStatus = 'pending'` y `contentStatus` según ESC-02.

**ESC-02 · Extracción de contenido completo**
Dado un ítem recién ingerido, cuando el feed trae el cuerpo completo, entonces se guarda tal cual con `contentStatus = 'full'`. Cuando el feed trae solo resumen/truncado, entonces se intenta extraer el artículo completo desde `link` con un extractor de legibilidad server-side; si tiene éxito → `contentStatus = 'full'`; si falla → se guarda el resumen del feed como fallback y `contentStatus = 'partial'` (FE-02).

**ESC-03 · Resumen IA (TL;DR)**
Dado un ítem con contenido y `tldrStatus = 'pending'`, cuando hay presupuesto disponible (RN-05), entonces se llama a Claude para generar un TL;DR de 1–2 frases **en español**, se guarda en `tldr` y se marca `tldrStatus = 'done'`. Regla: el TL;DR nunca bloquea la lectura (FE-03).

**ESC-04 · Filtrado de ruido (mutes)**
Dado que el usuario tiene palabras silenciadas, cuando se listan artículos, entonces se excluyen los que hagan match de mute (RN-02, RN-03) y la respuesta reporta `hiddenByMutes` (conteo). El match es case-insensitive por substring sobre `title + excerpt + fullContent + source`.

**ESC-05 · Lectura**
Dado un artículo en la lista, cuando el usuario lo abre, entonces la vista muestra el TL;DR (si existe) + el cuerpo completo dentro de la app, y el artículo se marca como leído (ESC-06). El botón "abrir original" queda disponible siempre.

**ESC-06 · Marcar leído / no leído**
Dado un artículo, cuando el usuario lo abre o pulsa "marcar leído", entonces `isRead = true` y `readAt = now`; los contadores de no leídos por carpeta se recalculan. La acción de marcar no leído revierte ambos. Idempotente (RN-07).

**ESC-07 · Guardar / ver guardados**
Dado un artículo, cuando el usuario pulsa la estrella, entonces `isStarred = true`. La vista "Guardados" lista todos los `isStarred = true` sin importar carpeta. Los guardados nunca se purgan (RN-06).

**ESC-08 · Buscar**
Dado un término de búsqueda, cuando el usuario escribe en el buscador, entonces la lista filtra por coincidencia case-insensitive en `title + source + excerpt`.

**ESC-09 · Solo no leídos**
Dado el toggle "no leídos" activo, cuando se lista, entonces solo aparecen artículos con `isRead = false`.

**ESC-10 · Gestión de mutes**
Dado el panel de silenciar, cuando el usuario agrega o quita una palabra, entonces se persiste y el efecto sobre la lista es **inmediato** (siguiente request de lista). Al quitar una palabra, los artículos que ocultaba reaparecen y vuelven a contar como no leídos.

**ESC-11 · Gestión de feeds y carpetas**
Dado el conjunto seed de feeds (§ Anexo A), cuando el usuario agrega un feed por URL asignándole carpeta, entonces se valida que la URL sea un feed parseable y se guarda; se ingesta en el próximo ciclo. Eliminar un feed elimina en cascada sus artículos no guardados.

**ESC-12 · Marcar todo como leído**
Dado una carpeta (o "Todos"), cuando el usuario pulsa "marcar todo leído", entonces todos los artículos visibles de ese scope pasan a `isRead = true`.

**ESC-13 · Tema (claro/oscuro)**
Dado el toggle de tema, cuando el usuario cambia claro/oscuro, entonces la preferencia se persiste (`UserPref.theme`) y se aplica en toda la UI usando los design tokens de Señal.

## Flujos de error (FE) — política explícita

**FE-01 · Feed no responde / timeout** → registrar `lastFetchStatus = 'error'` + `lastError` en el feed; **continuar** con el resto (no romper el ciclo); reintentar el próximo ciclo.
**FE-02 · Falla extracción de contenido** → guardar `excerpt`/summary como fallback, `contentStatus = 'partial'`; el usuario puede "abrir original".
**FE-03 · Claude falla / rate limit / presupuesto agotado** → guardar el artículo sin TL;DR (`tldrStatus = 'failed'` o se queda `pending`); mostrarlo sin resumen; reintentar en ciclos futuros. **Leer artículos nunca depende de la IA.**
**FE-04 · Feed con XML malformado** → log de warning, skip de ese feed en el ciclo, sin abortar.
**FE-05 · BD no disponible** → la API responde `503`; el frontend muestra estado de error con botón de reintento.
**FE-06 · Contenido HTML malicioso en un feed** → sanitizar antes de persistir/renderizar (RS-2.3); nunca inyectar HTML crudo del feed.

## Reglas de negocio (RN) — binarias y verificables

- **RN-01** — Un artículo es único por `(feedId, guid)`. Si el ítem no trae `guid`, usar hash SHA-256 de `link` como `guid`. Nunca se insertan duplicados.
- **RN-02** — Un artículo que hace match de mute **no** aparece en ninguna lista ni cuenta en los contadores de no leídos, salvo que se quite el mute.
- **RN-03** — El match de mute es case-insensitive, por substring, sobre `title + excerpt + fullContent + source`.
- **RN-04** — El TL;DR de un artículo se genera **una sola vez**. No se re-resume salvo trigger explícito de re-generación.
- **RN-05** — En un mismo día natural no se generan más de `AI_DAILY_BUDGET` resúmenes. Al alcanzarlo, los pendientes quedan `pending`.
- **RN-06** — Purga: artículos con `isRead = true` **y** `isStarred = false` **y** `fetchedAt < now - RETENTION_DAYS` se eliminan. Los guardados y los no leídos nunca se purgan.
- **RN-07** — Marcar leído / no leído / guardar es idempotente (repetir la operación no cambia el resultado ni duplica efectos).
- **RN-08** — Todo el estado del usuario (read/star/mutes/prefs) pertenece a un único usuario en v1; el schema permite `userId` para no bloquear multiusuario futuro.

> **Test de precisión:** cada ESC/FE/RN de arriba debe poder convertirse en un test automático. Si no se puede escribir el test, la spec no es suficiente.

---

# Nivel 3 — Contratos

## 3.1 API REST (NestJS) — base `/api`

Respuestas JSON. Errores con forma `{ statusCode, message, error }`.

| Método | Path | Query / Body | Respuesta | Justificación |
|---|---|---|---|---|
| GET | `/api/articles` | `folder?`, `unreadOnly?`, `saved?`, `search?`, `cursor?`, `limit=30` | `{ items: ArticleListItem[], nextCursor: string \| null, hiddenByMutes: number }` | ESC-04/08/09, ESC-07 |
| GET | `/api/articles/:id` | — | `ArticleDetail` | ESC-05 |
| PATCH | `/api/articles/:id/read` | `{ read: boolean }` | `{ ok: true }` | ESC-06 |
| PATCH | `/api/articles/:id/star` | `{ starred: boolean }` | `{ ok: true }` | ESC-07 |
| POST | `/api/articles/mark-all-read` | `{ folder?: string }` | `{ updated: number }` | ESC-12 |
| GET | `/api/folders` | — | `Folder[]` (con `unreadCount`) | ESC-06, sidebar |
| GET | `/api/feeds` | — | `Feed[]` | ESC-11 |
| POST | `/api/feeds` | `{ url: string, folderKey: string }` | `Feed` \| `400` si no parsea | ESC-11 |
| DELETE | `/api/feeds/:id` | — | `{ ok: true }` | ESC-11 |
| GET | `/api/mutes` | — | `string[]` | ESC-04/10 |
| POST | `/api/mutes` | `{ term: string }` | `string[]` | ESC-10 |
| DELETE | `/api/mutes/:term` | — | `string[]` | ESC-10 |
| GET | `/api/prefs` | — | `{ theme: 'light' \| 'dark' }` | ESC-13 |
| PATCH | `/api/prefs` | `{ theme: 'light' \| 'dark' }` | `{ theme }` | ESC-13 |
| POST | `/api/ingest` | — (protegido con `X-API-Key` si expuesto) | `{ feedsFetched, newArticles, summarized, errors }` | ESC-01 manual |
| GET | `/api/health` | — | `{ status: 'ok' }` | Obs. |

## 3.2 Schemas (DTOs · TypeScript)

```ts
// Ítem de lista (liviano — no incluye fullContent)
interface ArticleListItem {
  id: string;
  source: string;        // Feed.title
  folderKey: string;     // 'ai' | 'dev' | 'sql' | 'sec'
  dotColor: string;      // color de la fuente (derivado de carpeta/feed)
  title: string;
  excerpt: string;       // resumen corto del feed (2 líneas en UI)
  tldr: string | null;   // null si aún no generado
  publishedAt: string;   // ISO 8601
  isRead: boolean;
  isStarred: boolean;
}

// Detalle (incluye cuerpo completo y estado de contenido)
interface ArticleDetail extends ArticleListItem {
  link: string;
  author: string | null;
  fullContent: string;              // HTML ya sanitizado
  contentStatus: 'full' | 'partial';
  tldrStatus: 'pending' | 'done' | 'failed' | 'skipped';
}

interface Folder {
  key: string;           // 'ai' | 'dev' | 'sql' | 'sec'
  label: string;         // 'IA' | 'Desarrollo' | 'SQL Server' | 'Seguridad'
  unreadCount: number;
}

interface Feed {
  id: string;
  url: string;
  title: string;
  siteUrl: string | null;
  folderKey: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: 'ok' | 'error' | null;
  lastError: string | null;
}
```

**Validación (class-validator):** `limit` 1–100; `folder`/`folderKey` ∈ enum de carpetas; `term` de mute 1–60 chars, trim; `theme` ∈ `{light,dark}`; `url` de feed debe ser URL válida y parseable como RSS/Atom (validación en servicio, no solo formato).

## 3.3 Modelo de datos (Prisma · SQL Server)

```prisma
// datasource: sqlserver, provider Prisma
model Folder {
  id        String    @id @default(cuid())
  key       String    @unique          // ai | dev | sql | sec
  label     String
  sortOrder Int       @default(0)
  feeds     Feed[]
}

model Feed {
  id              String    @id @default(cuid())
  url             String    @unique
  title           String
  siteUrl         String?
  folder          Folder    @relation(fields: [folderId], references: [id])
  folderId        String
  active          Boolean   @default(true)
  lastFetchedAt   DateTime?
  lastFetchStatus String?                        // ok | error
  lastError       String?   @db.NVarChar(Max)
  createdAt       DateTime  @default(now())
  articles        Article[]
}

model Article {
  id            String    @id @default(cuid())
  feed          Feed      @relation(fields: [feedId], references: [id], onDelete: Cascade)
  feedId        String
  guid          String                            // guid del feed o sha256(link)
  link          String
  title         String
  author        String?
  excerpt       String    @db.NVarChar(Max)
  fullContent   String    @db.NVarChar(Max)       // HTML sanitizado
  contentStatus String    @default("partial")     // full | partial
  imageUrl      String?
  publishedAt   DateTime?
  fetchedAt     DateTime  @default(now())
  tldr          String?   @db.NVarChar(Max)
  tldrStatus    String    @default("pending")     // pending | done | failed | skipped
  isRead        Boolean   @default(false)
  readAt        DateTime?
  isStarred     Boolean   @default(false)
  starredAt     DateTime?
  userId        String?                            // reservado para multiusuario futuro

  @@unique([feedId, guid])                         // RN-01
  @@index([isRead])
  @@index([isStarred])
  @@index([publishedAt])
}

model Mute {
  id        String   @id @default(cuid())
  term      String   @unique
  createdAt DateTime @default(now())
}

model UserPref {
  id        String   @id @default("singleton")     // fila única en v1
  theme     String   @default("light")
  updatedAt DateTime @updatedAt
}

model IngestLog {
  id            String   @id @default(cuid())
  startedAt     DateTime @default(now())
  feedsFetched  Int
  newArticles   Int
  summarized    Int
  errors        Int
  tokensUsed    Int?
}
```

## 3.4 Dependencias externas + SLA esperado

| Dependencia | Uso | Timeout | Política de fallo |
|---|---|---|---|
| Anthropic Messages API | Generar TL;DR (`claude-haiku-4-5`) | 20 s | Retry con backoff (máx 2); si falla → `tldrStatus='failed'`, no bloquea (FE-03) |
| Feeds RSS/Atom (terceros) | Ingesta de contenido | 15 s | `lastFetchStatus='error'`, continuar (FE-01) |
| Extractor de legibilidad | Full content de feeds truncados | 15 s | Fallback a excerpt (FE-02) |

> **Trazabilidad:** cada campo del contrato existe porque un ESC/FE/RN lo pide. Si aparece un campo sin comportamiento que lo justifique, sobra.

---

# Nivel 4 — Restricciones

## 4.1 Performance
- **RP-1** — `GET /api/articles` p95 **< 300 ms** con paginación por cursor e índices de § 3.3.
- **RP-2** — Ingesta con concurrencia máx. **5 feeds** en paralelo; ciclo completo para ~20 feeds **< 2 min**.
- **RP-3** — Frontend: paginación por cursor (o virtualización) si la lista supera **200 ítems**; nada de traer todo de golpe.

## 4.2 Seguridad
- **RS-1** — `ANTHROPIC_API_KEY` vive **solo** en el servidor (variable de entorno). **Nunca** se expone al cliente ni se llama a Claude desde el navegador.
- **RS-2** — v1 es single-user local. Si se expone a red pública: proteger `/api/ingest` y todos los writes con header `X-API-Key`; los GET de lectura pueden quedar abiertos en red privada.
- **RS-3** — Sanitizar el HTML de `fullContent` antes de persistir **y** antes de renderizar (defensa en profundidad): `sanitize-html` en backend, escape/DOMPurify en frontend. Feeds = fuente no confiable.
- **RS-4** — `.env` fuera de git. Sin secretos en el repo. Sin datos personales en URLs/query strings.

## 4.3 Tecnología
- **RT-1 · Backend:** NestJS (TypeScript, strict), Prisma como **única** capa de acceso a datos, SQL Server, Node LTS. Librerías: `rss-parser` (feeds), `@extractus/article-extractor` o `@mozilla/readability + jsdom` (full content), `sanitize-html`, `@anthropic-ai/sdk`, `@nestjs/schedule` (cron), `@nestjs/config`, `class-validator`/`class-transformer`.
- **RT-2 · Frontend:** Next.js (App Router) + React. Componentes React que consuman la API. Estilos con los **design tokens propios de Señal** (`apps/web/src/tokens.ts`). Español en todo lo visible al usuario y en los TL;DR.
- **RT-3 · Patrones obligatorios:** controllers finos (sin lógica de negocio) → services inyectables; DTOs validados; config vía `@nestjs/config`; migraciones con Prisma Migrate.
- **RT-4 · Prohibido:** llamar a Claude desde el cliente · hardcodear la API key · hacer fetch de RSS desde el navegador (CORS) · acceder a la BD fuera de Prisma.

## 4.4 Observabilidad
- **RO-1** — Logs estructurados (JSON) con nivel. Por cada ciclo de ingesta, escribir un `IngestLog`: feeds ok/fallidos, nuevos, resumidos, tokens usados.
- **RO-2** — Métricas mínimas: artículos/día, tasa de fallo de feeds, resúmenes generados, tokens/costo estimado.
- **RO-3** — Alertas mínimas v1 (log de nivel error): un feed que falla **> 3 ciclos** seguidos; presupuesto de IA agotado en el día.

---

# Anexo A — Feeds seed (config inicial)

Seedear en la primera migración. Carpetas → `key : label`: `ai:IA`, `dev:Desarrollo`, `sql:SQL Server`, `sec:Seguridad`.

| Carpeta | Fuente | Feed URL |
|---|---|---|
| ai | Simon Willison | `https://simonwillison.net/atom/everything/` |
| ai | Import AI | `https://importai.substack.com/feed` |
| ai | Ahead of AI | `https://magazine.sebastianraschka.com/feed` |
| ai | Latent Space | `https://www.latent.space/feed` |
| dev | The Pragmatic Engineer | `https://newsletter.pragmaticengineer.com/feed` |
| dev | Hacker News | `https://news.ycombinator.com/rss` |
| dev | Lobsters | `https://lobste.rs/rss` |
| dev | Node.js Blog | `https://nodejs.org/en/feed/blog.xml` |
| dev | TypeScript (MS DevBlogs) | `https://devblogs.microsoft.com/typescript/feed/` |
| dev | .NET (MS DevBlogs) | `https://devblogs.microsoft.com/dotnet/feed/` |
| sql | Brent Ozar | `https://www.brentozar.com/feed/` |
| sec | The Hacker News | `https://feeds.feedburner.com/TheHackersNews` |
| sec | BleepingComputer | `https://www.bleepingcomputer.com/feed/` |
| sec | Krebs on Security | `https://krebsonsecurity.com/feed/` |
| sec | SecurityWeek | `https://www.securityweek.com/feed/` |
| sec | SANS ISC | `https://isc.sans.edu/rssfeed.xml` |

> Nota: Hacker News y Lobsters son agregadores → el ítem del feed es título + link; el cuerpo se obtiene con el extractor de legibilidad (ESC-02) desde el `link`.

---

# Anexo B — Prompt de resumen (TL;DR)

Prompt de sistema sugerido para ESC-03 (ajustable):

```
Eres un asistente que resume artículos técnicos para un desarrollador.
Devuelve SOLO el resumen, sin preámbulo, en español, en 1–2 frases (máx. 45 palabras).
Enfócate en el "qué pasó" y el "por qué importa para quien construye software".
No inventes datos que no estén en el texto.
```

Entrada: `title` + primeros ~2000 tokens de `fullContent`. Salida → `tldr`.

---

# Anexo C — Orden de implementación para Claude Code

Construir en este orden; cada milestone es entregable y verificable.

- **M1 · Cimientos + ingesta** — Monorepo, NestJS + Prisma + SQL Server, migración con seed (Anexo A), servicio de ingesta con cron (`rss-parser`), dedupe RN-01. ✅ *Verificable:* correr `POST /api/ingest` guarda artículos nuevos sin duplicados.
- **M2 · Contenido + IA** — Extracción de full content (ESC-02, FE-02) + generación de TL;DR con presupuesto (ESC-03, RN-04/05, FE-03) + sanitización (RS-3). ✅ *Verificable:* artículos truncados quedan `full`; TL;DR en español; al pasar el tope quedan `pending`.
- **M3 · API de lectura** — Endpoints de § 3.1 con DTOs validados, filtros de mute/búsqueda/no-leídos, contadores de carpeta, paginación por cursor. ✅ *Verificable:* `hiddenByMutes` correcto; contadores excluyen silenciados (RN-02).
- **M4 · Frontend Señal** — Construir el frontend consumiendo la API; design tokens propios; modo claro/oscuro persistido. ✅ *Verificable:* leer, marcar, guardar, buscar y silenciar funcionan contra datos reales.
- **M5 · Mutes, prefs y retención** — CRUD de mutes/feeds, `UserPref`, job de purga (RN-06). ✅ *Verificable:* quitar un mute reaparece artículos; la purga respeta guardados y no-leídos.
- **M6 · Observabilidad** — `IngestLog`, logs JSON, métricas y alertas mínimas (RO-1/2/3). ✅ *Verificable:* cada ciclo deja un `IngestLog` con conteos y tokens.

---

*Fin del spec. Cambios de comportamiento/alcance → MINOR (v1.1.0). Correcciones de ambigüedad → PATCH (v1.0.1). Rediseño → MAJOR (v2.0.0).*
