# Autenticación y acceso

Señal es **single-user**: no tiene sistema de cuentas propio a propósito (sería peso
muerto para una app de una persona). La seguridad se pone **en la capa de acceso**,
y tienes varias opciones según qué tan expuesto esté y cuánto quieras montar.

> Regla de oro: el frontend hace *writes* (marcar leído, guardar, borrar mutes) con
> peticiones normales. Quien pueda abrir la URL, puede usar la app. Por eso el
> control va **antes** de que la petición llegue a Señal.

---

## Opción 1 — Solo LAN (cero auth)

Si solo la usas en casa, no la expongas a internet. Accedes por
`http://<ip-local>:3001`. Nada que configurar. Es el punto de partida.

---

## Opción 2 — VPN privada (Tailscale / WireGuard)

La forma más simple de llegar desde el celular fuera de casa **sin exponer nada** a
internet público:

- Instala [Tailscale](https://tailscale.com) en el servidor y en tu teléfono.
- Accedes por la IP de la tailnet (`http://100.x.x.x:3001`).
- Solo tus dispositivos autenticados en tu cuenta de Tailscale entran. MFA lo pone
  Tailscale por ti (login con Google/GitHub/passkey).

Cero cambios en Señal. Es probablemente la mejor relación seguridad/esfuerzo.

---

## Opción 3 — Cloudflare Tunnel + Zero Trust (lo que usa el autor)

URL pública (`https://senal.tudominio.com`) **sin abrir puertos** en tu router, con
login delante:

1. Instala `cloudflared` en el servidor y crea un tunnel apuntando a
   `http://localhost:3001`.
2. En **Cloudflare Zero Trust → Access → Applications**, crea una aplicación sobre
   ese hostname con una policy (p. ej. "solo mi email", con OTP o Google). Cloudflare
   te pide login antes de dejar pasar cualquier request.
3. **Excepción para la PWA**: deja públicos sin Access solo los estáticos que el
   service worker necesita para instalar —`/sw.js`, `/assets/*`, `/icons/*`,
   `/manifest.webmanifest`— y mantén `/api/*` protegido. (Ver historial del proyecto;
   ya está resuelto en la configuración de rutas.)

MFA, expiración de sesión y logs de acceso los da Cloudflare.

---

## Opción 4 — Reverse proxy con login local + MFA (sin depender de nadie)

Si prefieres **no usar Cloudflare** y hostear tu propio login con MFA, pon un reverse
proxy delante de Señal. Tres combos comunes:

### a) Caddy + `caddy-security` (todo en uno, simple)
```caddyfile
senal.tudominio.com {
    # portal de login con TOTP (MFA) integrado
    authenticate with myportal
    reverse_proxy localhost:3001
}
```
El plugin [caddy-security](https://github.com/greenpau/caddy-security) trae portal de
usuarios, contraseñas y **TOTP** (Authy/Google Authenticator) sin base de datos
externa. Certificado HTTPS automático.

### b) Authelia + nginx/Traefik (el estándar self-hosted)
[Authelia](https://www.authelia.com) es un servidor de auth dedicado: login,
**MFA (TOTP, WebAuthn/passkeys, push)**, políticas por ruta, rate-limiting y
bloqueo por intentos. El proxy (nginx/Traefik/Caddy) consulta a Authelia antes de
dejar pasar. Es el setup más robusto para self-hosting.

### c) nginx + oauth2-proxy (si ya tienes un Google/GitHub/Keycloak)
[oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) delega el login a un
proveedor OIDC que ya uses. El MFA lo pone ese proveedor.

En los tres casos, Señal ni se entera: recibe la petición ya autenticada en
`localhost:3001`. No se toca código de la app.

---

## Opción 5 — La llave de API interna (`API_KEY`)

Señal trae un guard ligero
([`api-key.guard.ts`](../apps/api/src/common/api-key.guard.ts)): si defines `API_KEY`
en el `.env`, **todos los writes (POST/PATCH/DELETE) exigen el header
`X-API-Key`**; los GET quedan abiertos. Es defensa en profundidad, no un login.

```
API_KEY=una-cadena-larga-y-aleatoria
```

> Nota: el frontend actual **no** manda ese header, así que activarlo bloquea los
> writes desde la UI. Úsalo si quieres blindar la API detrás de un proxy y hablarle
> con scripts, o adáptalo (mandar el header desde el cliente) si lo necesitas. Para
> el caso normal, el login lo pone la capa de acceso (opciones 2–4), no esto.

---

## Recomendación rápida

| Escenario | Usa |
|---|---|
| Solo en casa | LAN, sin más |
| Acceso remoto sencillo | Tailscale |
| URL pública, cero mantenimiento de auth | Cloudflare Tunnel + Access |
| URL pública, todo self-hosted, con MFA | Caddy+security o Authelia |
