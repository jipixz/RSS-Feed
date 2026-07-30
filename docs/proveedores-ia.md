# Proveedores de IA — local, en la nube, o ninguno

Señal usa la IA para tres cosas: el **TL;DR** de cada artículo, la **traducción** de
texto seleccionado y el **minichat**. Todo pasa por una sola interfaz
(`AiProvider`), así que cambiar de proveedor es cuestión de variables de entorno —
no se toca código.

```
AI_PROVIDER = ollama | anthropic | none
```

El proveedor se elige al arrancar en
[`ai-provider.factory.ts`](../apps/api/src/ai/provider/ai-provider.factory.ts). Si
la IA falla o está apagada, **la app sigue funcionando**: los artículos se leen sin
TL;DR y los pendientes se reintentan al siguiente ciclo.

---

## Opción A — IA local con Ollama (default, costo cero)

Corre el modelo en **cualquier máquina de tu red** (tu PC, un servidor, la misma
Pi si tiene RAM de sobra). No sale nada a internet.

1. Instala [Ollama](https://ollama.com) en esa máquina y baja un modelo:
   ```bash
   ollama pull gemma2:9b        # buena prosa en español (~7 GB RAM)
   # o algo ligero:
   ollama pull llama3.2:3b      # ~3 GB RAM, más rápido
   ```
2. Permite conexiones desde la red (por defecto Ollama solo escucha en localhost):
   ```bash
   # Windows (PowerShell), luego reinicia la app de Ollama:
   setx OLLAMA_HOST 0.0.0.0
   # Linux (systemd): añade  Environment="OLLAMA_HOST=0.0.0.0"  al service y recarga
   ```
3. En el `.env` de Señal:
   ```
   AI_PROVIDER=ollama
   OLLAMA_BASE_URL=http://192.168.1.50:11434    # IP LAN de la máquina con Ollama
   OLLAMA_MODEL=gemma2:9b
   ```

**Modos de conexión según tu setup:**

| Dónde vive Ollama | `OLLAMA_BASE_URL` |
|---|---|
| Misma máquina que Señal | `http://localhost:11434` |
| Otra PC de la LAN | `http://192.168.x.x:11434` |
| Otra máquina por [Tailscale](https://tailscale.com)/VPN | `http://100.x.x.x:11434` (IP de la tailnet) |
| Servidor con dominio interno | `http://ollama.midominio.local:11434` |

Notas técnicas (ya resueltas en el código): se manda `think:false` porque los
modelos híbridos (gemma, qwen3) gastan los tokens en "pensar" y devuelven vacío;
`keep_alive:30m` deja el modelo caliente entre lecturas.

---

## Opción B — IA en la nube con Anthropic (Claude)

Sin máquina propia; pagas por uso (~$1–3 USD/mes con 60 TL;DR/día).

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Usa `claude-haiku-4-5`. La API key **vive solo en el servidor** (nunca llega al
navegador). Ver [`anthropic.provider.ts`](../apps/api/src/ai/provider/anthropic.provider.ts).

---

## Opción C — Otra API en la nube (OpenAI, Groq, OpenRouter, etc.)

Dos caminos:

**1. Un gateway que hable "formato Ollama"** (lo más rápido, cero código). Corre
[LiteLLM](https://github.com/BerriAI/litellm) en modo proxy apuntando a la API que
quieras, y en Señal deja `AI_PROVIDER=ollama` con `OLLAMA_BASE_URL` hacia el
gateway. Señal cree que habla con Ollama; el gateway traduce a OpenAI/Groq/lo que
sea.

**2. Un provider propio** (más limpio, ~40 líneas). La abstracción está pensada
para esto: copia `anthropic.provider.ts`, cambia el `fetch` al endpoint que uses
(casi todos son OpenAI-compatible: `POST /v1/chat/completions`), regístralo en el
`switch` de la factory con un nombre nuevo (`AI_PROVIDER=openai`), y listo. La
interfaz que debes implementar es:

```ts
interface AiProvider {
  summarize(title, text): Promise<SummaryResult>;
  chat(system, user, opts?): Promise<ChatResult>;
  isEnabled(): boolean;
}
```

---

## Opción D — Sin IA

```
AI_PROVIDER=none
```

Señal funciona completo: lees el contenido íntegro, filtras con mutes, guardas,
audiolibro con Piper/Kokoro. Solo no hay TL;DR, traducción ni minichat.

---

## Presupuesto y ajustes

| Variable | Default | Qué hace |
|---|---|---|
| `AI_DAILY_BUDGET` | `60` | Máx. de TL;DR por día — evita freír la máquina con un backlog grande |
| `OLLAMA_MODEL` | `llama3.2:3b` | Cualquier modelo de tu `ollama list` |
| `INGEST_CRON` | `0 */30 * * * *` | Cada cuánto busca artículos nuevos (y resume) |

El prompt de los TL;DR está en
[`prompt.ts`](../apps/api/src/ai/provider/prompt.ts) por si quieres ajustar el tono
o el idioma.

## Relevancia semántica de "Hoy" (embeddings)

La vista "Hoy" rankea por relevancia a tu perfil de intereses. Con `AI_PROVIDER=ollama`
usa **embeddings** (significado, no texto literal): así un artículo de política que
mencione "nestjs" queda lejos de tu perfil tech, y "coche eléctrico" se acerca a tu
interés "carros" aunque no diga la palabra.

- Modelo: `EMBED_MODEL` (default `nomic-embed-text`). Descárgalo: `ollama pull nomic-embed-text`.
- Los vectores se calculan **en segundo plano** al final de cada ciclo de ingesta
  (nunca en el request de "Hoy") y se guardan en la BD; "Hoy" solo los lee.
- **Degrada solo**: si el modelo no está, no responde, o `AI_PROVIDER` no es ollama,
  "Hoy" cae al ranking por palabras clave sin romperse.
- **VRAM protegida**: por defecto los embeddings corren en **CPU** (`EMBED_NUM_GPU=0`)
  — nomic es diminuto (~50 ms por artículo en CPU) y así **no le quita nada de VRAM
  al LLM** de los TL;DR. gemma se queda dueña de la GPU. Si te sobra GPU y quieres
  aún más velocidad, sube `EMBED_NUM_GPU`.

## Categorización por contenido (temas)

Los mismos embeddings alimentan la clasificación por **tema real** (no por fuente):
Señal calcula un *centroide* por carpeta (el promedio de los embeddings de sus
artículos) y asigna a cada artículo la carpeta cuyo centroide es más cercano
(`Article.topicKey`). Así un artículo de un feed "dev" que en realidad habla de
seguridad se etiqueta como seguridad.

- En la lista aparece un badge con el tema cuando **difiere de la fuente**.
- El toggle **"Por tema"** en una carpeta la muestra por contenido (`?byTopic=true`)
  en vez de por el feed de origen.
- Corre en segundo plano en la ingesta (reusa los embeddings, no toca el LLM).
- **Requisito de calidad**: cada carpeta necesita **≥5 artículos ya embebidos** para
  formar un centroide fiable. Con pocas carpetas pobladas la clasificación es ruidosa;
  mejora sola conforme entran más artículos.
