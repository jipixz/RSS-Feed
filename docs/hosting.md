# Dónde montar Señal

Señal es **un solo proceso Node**: sirve la API REST, el frontend (SPA compilada) y
corre el cron de ingesta, todo en el puerto `3001`. La base de datos es **un archivo
SQLite** (`data/senal.db`). Eso lo hace fácil de mover a casi cualquier lado.

Requisitos mínimos: **Node 22 LTS** y **pnpm** (`corepack enable`). Nada más es
obligatorio (Ollama, Piper, Kokoro son opcionales).

---

## Opción 1 — Raspberry Pi con pm2 (lo que usa el autor)

La guía detallada está en el [README](../README.md#deploy-en-la-raspberry-pi-4b-pm2--recomendado).
Resumen:

```bash
git clone <tu-repo> senal && cd senal
cp .env.example .env && nano .env
pnpm install && pnpm build && pnpm prisma:deploy
pm2 start ecosystem.config.js && pm2 save
```

Consumo: ~100–150 MB en reposo. Funciona en una Pi 4B de 2 GB.

---

## Opción 2 — Cualquier Linux / VPS / mini-PC

Idéntico a la Pi (Node es multiplataforma). Sirve un VPS de $5, un NUC, un
contenedor LXC, un viejo laptop con Ubuntu, etc. Mismos comandos. Si el equipo es
x86, hasta el build es más rápido que en la Pi.

Para que arranque solo al reiniciar, usa pm2 (`pm2 startup`) o un service de
systemd:

```ini
# /etc/systemd/system/senal.service
[Unit]
Description=Senal RSS
After=network.target
[Service]
WorkingDirectory=/home/tu-usuario/senal/apps/api
ExecStart=/usr/bin/node dist/main.js
Restart=always
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now senal
```

---

## Opción 3 — Docker (cualquier host con Docker)

Ya hay `Dockerfile` + `docker-compose.yml`:

```bash
cp .env.example .env && nano .env
docker compose up -d --build
```

- La BD queda en `./data/senal.db` (volumen). Backup = copiar ese archivo.
- Migraciones y seed corren solos al arrancar.
- Actualizar: `git pull && docker compose up -d --build`.

Sirve igual en la Pi (imagen arm64) que en un servidor x86.

---

## Opción 4 — Windows o Mac (escritorio)

Para uso local sin servidor dedicado:

```bash
pnpm install
cp .env.example .env
pnpm prisma:migrate
pnpm build && node apps/api/dist/main.js     # http://localhost:3001
```

En Windows puedes dejarlo headless con el mismo truco del `.vbs` que usa Kokoro
(ver [`tools/`](../tools)).

---

## Acceso desde fuera de casa

Cómo lo publicas es independiente de dónde lo montes. Opciones (de menos a más
setup) en la [guía de autenticación](./autenticacion.md):

- **Solo LAN** — no lo expones; lo usas en casa.
- **Tailscale / WireGuard** — VPN privada, lo alcanzas desde el celular sin abrir puertos.
- **Cloudflare Tunnel** — URL pública sin abrir puertos (lo que usa el autor).
- **Reverse proxy propio** (Caddy/nginx) con login local + MFA.

---

## Backup

Todo el estado está en dos lugares:

- `data/senal.db` — artículos, feeds, mutes, preferencias. **Este es el importante.**
- `data/audio/` — caché de audiolibros (regenerable, no crítico).

Un `cp data/senal.db backup/` periódico (o un cron) es todo el "disaster recovery"
que necesitas. También puedes exportar tus feeds a OPML desde **Ajustes → Exportar
OPML**.
