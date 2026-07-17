# Señal — lector RSS con contenido completo y TL;DR IA

Lector RSS personal (single-user) que **trae el cuerpo completo de los artículos dentro de la app** (no te manda al sitio web), filtra ruido por palabras silenciadas y genera un TL;DR de 1–2 frases en español con IA. Diseñado para correr en una **Raspberry Pi 4B**.

- **Backend:** NestJS + Prisma + SQLite (un solo archivo de BD en `data/senal.db`)
- **Frontend:** React + Vite (SPA estática servida por el mismo NestJS en `:3001`)
- **IA:** conmutable por env — `ollama` (otra máquina de tu red) · `anthropic` (Claude Haiku) · `none`
- **Spec:** ver `files (1)/SPEC.md` (fuente de verdad del comportamiento)

## Desarrollo (Windows/Mac/Linux)

```bash
pnpm install
cp .env.example .env             # ajusta OLLAMA_BASE_URL a la IP de tu PC con Ollama
pnpm prisma:migrate              # crea data/senal.db + seed de 16 feeds
pnpm --filter api dev            # API + frontend build en http://localhost:3001
pnpm --filter web dev            # (opcional) Vite dev server con HMR en :5173
```

Disparar ingesta manual: `POST http://localhost:3001/api/ingest` (o botón "Actualizar" en la UI).

## Deploy en la Raspberry Pi 4B (Docker)

Requisitos en la Pi: Raspberry Pi OS de 64 bits + Docker + plugin compose
(`curl -fsSL https://get.docker.com | sh`).

```bash
# 1. Copia el proyecto a la Pi (git clone o scp; no copies node_modules/ ni data/)
git clone <tu-repo> senal && cd senal

# 2. Configura el entorno
cp .env.example .env
nano .env        # OLLAMA_BASE_URL=http://<IP-de-tu-PC>:11434, modelo, etc.

# 3. Construye y levanta (el primer build tarda ~10-15 min en la Pi)
docker compose up -d --build

# 4. Listo — abre http://<IP-de-la-Pi>:3001
```

- La BD queda en `./data/senal.db` (volumen). Haz backup copiando ese archivo.
- Migraciones se aplican solas al arrancar; el seed corre solo si la BD está vacía.
- La ingesta corre cada 30 min (`INGEST_CRON`); la purga de artículos viejos, diario a las 03:30.
- Actualizar: `git pull && docker compose up -d --build`.
- Logs: `docker compose logs -f senal`.

### Ollama en tu PC (para los TL;DR)

En la máquina donde corre Ollama, permite conexiones desde la red:

```bash
# Windows (PowerShell): variable de entorno del servicio
setx OLLAMA_HOST 0.0.0.0
ollama pull llama3.2:3b
```

Si la PC con Ollama está apagada, **la app funciona igual**: los artículos se leen sin TL;DR y los resúmenes pendientes se generan cuando vuelva a estar disponible (FE-03).

### Cambiar a Claude (opcional)

En `.env`: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=sk-ant-...` y reinicia. Usa `claude-haiku-4-5` con presupuesto de `AI_DAILY_BUDGET` resúmenes/día (~$1–3 USD/mes con 60/día).

## Variables de entorno

| Variable | Default | Qué hace |
|---|---|---|
| `DATABASE_URL` | `file:../data/senal.db` | SQLite (relativa a `prisma/`) |
| `AI_PROVIDER` | `ollama` | `ollama` · `anthropic` · `none` |
| `OLLAMA_BASE_URL` | — | URL de Ollama en tu red |
| `OLLAMA_MODEL` | `llama3.2:3b` | Modelo para los TL;DR |
| `ANTHROPIC_API_KEY` | — | Solo si `AI_PROVIDER=anthropic` |
| `INGEST_CRON` | `0 */30 * * * *` | Cron de 6 campos (cada 30 min) |
| `AI_DAILY_BUDGET` | `60` | Máx. resúmenes IA por día (RN-05) |
| `RETENTION_DAYS` | `30` | Purga de leídos no guardados (RN-06) |
| `API_KEY` | vacío | Si se define, los writes exigen header `X-API-Key` (RS-2) |

## API

Base `/api` — endpoints principales: `GET /articles` (cursor, filtros `folder/unreadOnly/saved/search`), `GET /articles/:id`, `PATCH /articles/:id/read|star`, `POST /articles/mark-all-read`, `GET /folders`, `GET|POST|DELETE /feeds`, `GET|POST|DELETE /mutes`, `GET|PATCH /prefs`, `POST /ingest`, `GET /health`. Contrato completo en `files (1)/SPEC.md` § 3.
