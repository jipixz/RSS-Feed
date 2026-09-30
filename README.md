<div align="center">

<img src="docs/logo.svg" width="96" alt="Señal logo" />

# Señal

**A self-hosted RSS reader that brings the full article into the app and writes a TL;DR with AI.**
Built to run on a Raspberry Pi 4B with a local LLM, and just as happy on a VPS, Docker or your desktop.

[![CI](https://github.com/jipixz/RSS-Feed/actions/workflows/ci.yml/badge.svg)](https://github.com/jipixz/RSS-Feed/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/jipixz/RSS-Feed?style=flat-square)](https://github.com/jipixz/RSS-Feed/releases)

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)

[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square)](https://web.dev/progressive-web-apps/)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-000000?style=flat-square)](https://ollama.com)
[![Claude API](https://img.shields.io/badge/Claude%20API-optional-D97757?style=flat-square)](https://docs.anthropic.com)
[![Jest](https://img.shields.io/badge/tests-Jest-C21325?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-4B-A22846?style=flat-square&logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com)

*[Léelo en español](README.es.md)*

</div>

---

## Screenshots

| "Today", ranked by meaning | Full article with its TL;DR | Audiobook: Kokoro or Piper |
|:---:|:---:|:---:|
| <img src="docs/screenshots/today.png" width="250" alt="Today view with AI TL;DRs" /> | <img src="docs/screenshots/article.png" width="250" alt="Full article in the app with the AI TL;DR on top" /> | <img src="docs/screenshots/audiobook.png" width="250" alt="Listen menu with Kokoro and Piper voices" /> |

| Live AI console | Folders, search and muted words |
|:---:|:---:|
| <img src="docs/screenshots/ai-console.png" width="250" alt="Live AI console streaming each summary" /> | <img src="docs/screenshots/folders.png" width="250" alt="Folders, semantic search and noise filters" /> |

<details>
<summary><b>Five themes</b> and the interest profile that ranks "Today"</summary>

<br/>

| Light | Sepia | Café | Dark | Black |
|:---:|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/theme-light.png" width="150" alt="Light theme" /> | <img src="docs/screenshots/theme-sepia.png" width="150" alt="Sepia theme" /> | <img src="docs/screenshots/theme-cafe.png" width="150" alt="Café theme" /> | <img src="docs/screenshots/theme-dark.png" width="150" alt="Dark theme" /> | <img src="docs/screenshots/theme-black.png" width="150" alt="Black theme" /> |

<img src="docs/screenshots/interests.png" width="250" alt="Interest profile settings" />

</details>

---

## Why it exists

I couldn't find an RSS reader with the configuration I needed: the full article inside the app,
muted topics, ranking by what is relevant *to me*, and a one-line summary before deciding whether
to read. So I built my own, with three constraints:

1. **Reading never waits on AI.** If the model is down, articles still show up; the TL;DR is filled in later.
2. **It has to fit on a Raspberry Pi.** One SQLite file, one Node process, a hard memory ceiling.
3. **No lock-in.** Local model, cloud model or no model at all, switched from `.env`.

## Features

- **Full article content** extracted in-app (Mozilla Readability + `sanitize-html`), no bouncing to the site.
- **TL;DR in 1-2 sentences** per article through a switchable provider: `ollama` (local) · `anthropic` (Claude) · `none`, with a daily budget.
- **"Today" digest ranked by meaning**, not keywords: embeddings (`nomic-embed-text`) compared against an interest profile, with keyword fallback.
- **Semantic search, related articles and topic classification**, all reusing the same embeddings (cosine similarity against per-folder centroids).
- **Noise control:** muted words, cross-source de-duplication of the same story.
- **Audiobook mode:** text-to-speech with Piper (on the Pi) or Kokoro (GPU on a desktop), with a play queue and lock-screen controls.
- **Live AI console** streaming each summary over SSE, plus a small chat with the model.
- **Installable PWA** with themes, accent color, column width and reading-size preferences.
- **Health alerts** in the app when feeds fail or ingestion stalls.

## Architecture

```mermaid
flowchart LR
  subgraph Pi["Raspberry Pi 4B (PM2)"]
    API["NestJS API<br/>ingestion cron · REST · SSE"]
    DB[("SQLite<br/>Prisma")]
    WEB["React + Vite PWA<br/>served by the API"]
    API --- DB
    API --- WEB
  end
  Feeds["RSS / Atom feeds"] -->|fetch + Readability| API
  API -->|TL;DR, chat, embeddings| LLM{{"AI provider<br/>Ollama · Claude · none"}}
  API -->|speech| TTS["Piper (Pi) / Kokoro (PC)"]
  User["Browser / phone"] -->|Cloudflare Tunnel or LAN| WEB
```

The AI layer is a **Strategy + Factory** behind an injection token, so the provider is chosen at
boot from configuration and every service depends only on the interface.

## Engineering notes

A few problems worth reading about in the commit history:

- **Out-of-memory crash loop on the Pi.** Ranking and centroid calculation loaded every embedding into
  a 512 MB heap on each ingestion cycle. Fixed by walking embeddings in cursor-paginated batches of 400 and
  keeping a bounded top-K, with regression tests for both.
- **Ingestion that hung forever.** A `running` flag could stay stuck after a hung model call. Fixed with a
  global watchdog (`Promise.race` timeout) plus a stale-lock guard, so the flag is always released.
- **Measured before optimizing.** `gemma4` (~10 GB) does not fit in an 8 GB GPU and runs split across CPU
  and GPU, so it looked like a speed problem. A 3-article benchmark against `qwen2.5-coder:7b` and
  `deepseek-r1:8b` (both 100% on GPU) said otherwise: 3.1 s per summary vs 1.7 s and 2.2 s, irrelevant for a
  background job. The real difference was quality: gemma kept to the length limit every time, but stated an
  ongoing investigation as established fact. So the model stayed and the prompt changed instead: it now keeps
  the source's degree of certainty, verified on 6 articles including two confirmed-fact controls so it did not
  turn timid.
- **Embeddings on CPU.** `nomic-embed-text` runs on CPU (~50 ms per article): effectively free there, and it
  leaves every MB of VRAM to the summarizer, which already does not fit.
- **Local models that "think".** Hybrid-reasoning models can spend the whole token budget thinking and return
  empty content; summaries send `think: false`, with a retry for servers that do not support it.

## Quick start

```bash
pnpm install
cp .env.example .env        # set OLLAMA_BASE_URL, or AI_PROVIDER=none to start without AI
pnpm prisma:migrate         # creates data/senal.db and seeds 16 feeds
pnpm --filter api dev       # API + built frontend on http://localhost:3001
pnpm --filter web dev       # optional: Vite dev server with HMR on :5173
```

Run the tests:

```bash
pnpm --filter api test
```

Deploying to a Raspberry Pi (PM2 or Docker), TTS setup, switching to Claude and the full list of
environment variables are documented in the [Spanish README](README.es.md) and in [`docs/`](docs):
[AI providers](docs/proveedores-ia.md) · [Hosting](docs/hosting.md) ·
[Authentication](docs/autenticacion.md) · [Customization](docs/personalizacion.md).

## Tech stack

| Layer | Tools |
|---|---|
| Backend | NestJS 11, Prisma, SQLite, `@nestjs/schedule`, `rss-parser`, Readability + jsdom, `sanitize-html` |
| Frontend | React 19, Vite, TypeScript, PWA (service worker + manifest) |
| AI | Ollama (Gemma, `nomic-embed-text`), Anthropic Claude API |
| Speech | Piper, Kokoro |
| Ops | PM2, Docker, Cloudflare Tunnel |
| Tests | Jest + ts-jest |

## How it was built

The first version was written by hand from a written spec ([`docs/SPEC.md`](docs/SPEC.md)); later
features were built with **Claude Code**, with me directing and reviewing the changes.
[`APRENDIZAJES.md`](APRENDIZAJES.md) collects the technical notes gathered along the way
(NestJS DI, design patterns, SSE, security), in Spanish.

## License

[MIT](LICENSE) © Gibrán Ramón Perera
