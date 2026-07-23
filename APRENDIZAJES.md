# Aprendizajes técnicos — Señal

Guía de estudio compilada de las explicaciones de este proyecto. Cubre TypeScript,
NestJS, patrones de diseño, arquitectura, seguridad y preguntas de entrevista.

> Cómo llevarlo a Notion: en Notion → **Import → Markdown & CSV** → sube este archivo.

---

## Índice

1. [TypeScript: genéricos, `this` y tipos vs runtime](#1-typescript)
2. [NestJS: decoradores, DI, IoC, inyectables](#2-nestjs-fundamentos)
3. [Módulos, contenedor y tokens (Symbol)](#3-modulos-contenedor-y-tokens)
4. [Servicios, repositorios y fábricas](#4-servicios-repositorios-y-fabricas)
5. [Patrones: Strategy, Factory, Singleton, capas](#5-patrones-de-diseno)
6. [El ciclo de vida de un request (trace completo)](#6-ciclo-de-vida-de-un-request)
7. [¿Por qué tanta arquitectura? Nest vs Express vs Next](#7-por-que-nest)
8. [Testabilidad + ejemplo de test unitario real](#8-testabilidad)
9. [Preguntas de entrevista (con trampas)](#9-preguntas-de-entrevista)
10. [Llamadas al LLM (particularidades)](#10-llamadas-al-llm)
11. [Comunicación en tiempo real: SSE](#11-sse)
12. [Frontend: cómo se sirve, PWA, barra de progreso, gestos](#12-frontend)
13. [Seguridad: secretos, defense in depth, Cloudflare Access](#13-seguridad)
14. [Arquitectura general](#14-arquitectura-general)
15. [La capa de IA completa: infraestructura, Strategy y TTS](#15-la-capa-de-ia)

---

## 1. TypeScript

### Genéricos `<T>`
Un parámetro de tipo: un hueco que rellenas con un **tipo**, igual que un parámetro
normal es un hueco para un **valor**. Permite código reutilizable sin perder tipos.

```ts
// Sin genérico: devuelve `any`, pierdes autocompletado y detección de errores
async function request(path): Promise<any> { return (await fetch(path)).json(); }

// Con genérico: quien llama dice qué tipo espera de vuelta
async function request<T>(path): Promise<T> { return (await fetch(path)).json() as T; }

const d = await request<ArticleDetail>('/api/articles/1');
// d es ArticleDetail → d.title ✓, d.tituloo ✗ (error en compilación)
```

Analogía: `Array<string>`, `Promise<ArticleDetail>`, `Repository<User>` → "caja"
parametrizada con el tipo que contiene.

**"Sin autocompletado"** = si un valor es `any`, el editor (IntelliSense) no sabe qué es,
no sugiere métodos ni marca typos. TypeScript da esa red de seguridad a partir de los tipos.

### `this`
Significa "el objeto sobre el que se llama el método", y **se decide en la llamada, no
donde escribes la función**.

```ts
const p = new OllamaProvider();
p.summarize();      // this = p (lo que está a la izquierda del punto) ✓

const fn = p.summarize;
fn();               // this = undefined → 💥 se "desprendió" del objeto
```

Se rompe al pasar un método como callback. Soluciones:
```ts
setInterval(() => this.check());        // arrow: hereda el this del scope
setInterval(this.check.bind(this));     // bind: amarra el this permanentemente
```
**Regla de oro:** las arrow functions NO tienen su propio `this`; heredan el de donde
se escribieron. Por eso en React y callbacks casi siempre usas arrow functions.

En clases de Nest no da problemas porque siempre llamas con `this.` explícito
(`this.prisma.article.findMany()`), así que `this` siempre es la instancia.

### Azúcar del constructor
```ts
constructor(private readonly prisma: PrismaService) {}
// equivale a:
constructor(prisma: PrismaService) { this.prisma = prisma; }
```
El `private`/`readonly` en el parámetro declara la propiedad Y la asigna.

---

## 2. NestJS fundamentos

### Decoradores
Una **función que "marca" o envuelve** una clase/método/parámetro. La `@` es azúcar.
```ts
@Injectable()
class ArticlesService {}
// ≈ Injectable()(ArticlesService) → le pega metadata (con reflect-metadata)
```
No cambia el código; le adjunta metadata invisible que **el framework lee** para saber
qué hacer (armar rutas, resolver DI, validar). Como etiquetar una caja.

### Inyección de Dependencias (DI)
En **Express** tú construyes y cableas todo a mano:
```js
const db = require('./db');
const service = new UserService(db);   // tú ensamblas
```
En **Nest** solo **declaras qué necesitas** y el framework lo construye y te lo entrega:
```ts
@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}  // Nest inyecta la instancia
}
```
Beneficios: **desacoplamiento** (no sabes qué implementación recibes) y **testabilidad**
(puedes meter mocks). Por defecto los providers son **singletons** (una instancia
compartida).

### Inyectable (provider)
Una clase con `@Injectable()` registrada en el `providers` de un módulo. El contenedor
sabe fabricarla y repartirla.

---

## 3. Módulos, contenedor y tokens

### El contenedor
El registro central de Nest: un mapa `token → instancia`. Al arrancar, construye cada
provider una vez (singleton) y los guarda. Una "bodega de piezas ya fabricadas".

### Los 4 campos de un módulo
```ts
@Module({
  imports:     [OtroModule],        // trae piezas exportadas de otros módulos
  controllers: [ArticlesController],// clases que manejan rutas HTTP
  providers:   [ArticlesService],   // fabrica y registra piezas (PRIVADAS por default)
  exports:     [ArticlesService],   // hace públicas algunas piezas hacia otros módulos
})
export class ArticlesModule {}
```

**Encapsulación:** un provider es **privado a su módulo** por defecto. Para usarlo desde
otro módulo, el dueño debe `exports`arlo y el consumidor `imports`arlo. Si falta →
error claro en arranque: *"Can't resolve dependency"*.

```ts
// AiModule exporta
@Module({ providers: [/*...*/, aiProviderFactory], exports: [SummarizerService, AI_PROVIDER] })
export class AiModule {}

// DiscoverModule importa para poder inyectar
@Module({ imports: [AiModule], providers: [DiscoverService] })
export class DiscoverModule {}
```

**`@Global()`** — atajo para que lo exportado esté disponible en toda la app sin importar
(úsalo con moderación; ideal para la capa de datos):
```ts
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

### Interfaz detrás de un Symbol (token de DI)
Nest inyecta **por tipo**, pero **las interfaces de TS no existen en runtime** (se borran
al compilar). Solución: una llave manual que sí exista → un `Symbol`.

```ts
export const AI_PROVIDER = Symbol('AI_PROVIDER');   // existe en runtime

{ provide: AI_PROVIDER, useFactory: () => new OllamaProvider(config) }  // registra bajo la llave

constructor(@Inject(AI_PROVIDER) private provider: AiProvider) {}       // pide "lo de esa llave"
```
La interfaz `AiProvider` es solo para TypeScript (autocompletado/errores); el `Symbol` es
lo que Nest usa de verdad para encontrar el objeto.

---

## 4. Servicios, repositorios y fábricas

- **Servicio** — provider con la **lógica de negocio**. Se inyecta; idealmente sin estado.
- **Repositorio** — encapsula el **acceso a datos** de una entidad. En Señal **Prisma ES
  el repositorio** (`this.prisma.article.findUnique(...)`); no hay clases repositorio
  explícitas. En TypeORM sería `@InjectRepository(User) repo: Repository<User>`.
- **Fábrica** — provider cuyo valor lo produce una **función** (`useFactory`), útil cuando
  construir la pieza depende de config en runtime (el `aiProviderFactory` que elige
  Ollama/Claude/None según `.env`).

---

## 5. Patrones de diseño

- **Strategy** — varias implementaciones intercambiables tras una misma interfaz; se elige
  en runtime. (`OllamaProvider`, `AnthropicProvider`, `NoneProvider` implementan
  `AiProvider`.)
- **Factory** — construir el objeto correcto según config (la fábrica del provider).
- **Singleton** — una sola instancia compartida (los providers de Nest).
- **Separación de capas** — Controller (transporte HTTP) → Service (negocio) →
  Repositorio/ORM (datos). Cada capa una responsabilidad; los cambios quedan localizados.

**Strategy + DI**: programas contra la interfaz y la fábrica decide la implementación por
env. Cambiar de motor de IA = cambiar UNA variable de entorno, sin `if` regados.

### Los 5 conceptos base
- **IoC (Inversión de Control)** — el framework controla el flujo/instanciación, no tú.
  "No nos llames, nosotros te llamamos." DI es una forma de IoC.
- **DI (Inyección de Dependencias)** — pasar dependencias desde afuera (constructor) en vez
  de crearlas adentro. Para desacoplar y testear.
- **Separación de capas** — una responsabilidad por capa.
- **Testabilidad** — consecuencia de la DI: pruebas aisladas con mocks, sin BD ni red.
- **Genéricos** — tipos parametrizados, reutilización con seguridad de tipos.

---

## 6. Ciclo de vida de un request

`GET /api/articles/:id` (abrir un artículo):

```
fetch ─► [Guard] ─► [Pipe/DTO] ─► Controller.detail() ─► Service.detail() ─► Prisma ─► SQLite
                                                                                          │
   React setDetail() ◄── JSON ◄── serialización ◄── objeto JS ◄──────────────────────────┘
```

1. **Front** — `fetch('/api/articles/1')`.
2. **Router de Nest** — mira método+path, encuentra el handler (`@Get(':id')`).
3. **Guard** — ¿puede pasar? (auth). GET siempre pasa en este proyecto.
4. **Pipe** — valida/transforma el input (los DTOs con `class-validator`).
5. **Controller** (delgado) — extrae params (`@Param('id')`) y delega al service.
6. **Service** — lógica + `this.prisma.article.findUnique(...)`. Si no existe →
   `throw new NotFoundException()` → Nest lo convierte en HTTP 404.
7. **Serialización** — **retornar el objeto es la respuesta** (no `res.json()`).
8. **Front** — la promesa resuelve, `setState` → React re-renderiza.

Cuando el endpoint usa IA (`POST /api/discover/analyze`), el service inyecta el provider
por token y llama `this.provider.chat(...)` sin saber si es Ollama o Claude.

---

## 7. Por qué Nest

Para una "app de un archivo" (un CRUD simple), Nest es sobre-ingeniería; Express te lo
resuelve en 30 líneas. La estructura de Nest **se paga a escala** (apps grandes, equipos).
Resuelve cuatro problemas que Express te deja a mano:

- **Cross-cutting concerns** — validación, auth, logging, errores: piezas declarativas
  reutilizables (Pipes/Guards/Interceptors/Filters) en vez de copiar-pegar middleware.
- **Testabilidad** — la DI permite mockear dependencias.
- **Consistencia en equipo** — impone controller→service→módulos; sabes dónde está todo.
- **Escala sin spaghetti** — módulos con fronteras claras.

La ceremonia = complejidad movida al inicio para ahorrar caos después. **Trade-off**, no
"mejor siempre".

### Nest vs Express vs Next (no son la misma categoría)
- **Express** — micro-framework de backend, minimalista, sin tipos. El más usado de Node.
  Nest lo usa por debajo.
- **Nest** — framework de backend **estructurado y tipado** (inspirado en Angular/Spring).
  Compite con Express/Fastify en **APIs de servidor**.
- **Next.js** — framework **full-stack de React** (frontend + SSR). **No compite con Nest**;
  es común Next (front) + Nest (backend).

Respuesta madura en entrevista a *"¿Nest o Express?"*: **"Depende — microservicio simple o
máxima flexibilidad → Express; API grande con equipo donde importan testabilidad,
consistencia y mantenimiento → Nest."** Reconocer trade-offs impresiona más que el fanatismo.

---

## 8. Testabilidad

El pago de la estructura: testear una regla de negocio **sin BD, sin red, en milisegundos**,
mockeando lo inyectado.

```ts
describe('SummarizerService', () => {
  const prisma = { article: { count: jest.fn(), findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
  const config = { get: (k) => (k === 'AI_DAILY_BUDGET' ? 150 : undefined) };
  const sanitizer = { toText: (s) => s };
  const events = { emit: jest.fn() };

  it('FE-03: si la IA falla, el artículo NO se rompe (queda pending)', async () => {
    const provider = {
      isEnabled: () => true, modelLabel: 'fake',
      summarize: jest.fn().mockRejectedValue(new Error('Ollama caído')),  // simulo fallo
    };
    prisma.article.count.mockResolvedValue(0);
    prisma.article.findMany.mockResolvedValue([{ id: 'a1', title: 'x', fullContent: 'texto', feed: { title: 'HN' } }]);

    const svc = new SummarizerService(prisma, config, sanitizer, events, provider);
    const result = await svc.summarizePending();

    expect(result.failed).toBe(1);
    expect(result.summarized).toBe(0);
    expect(prisma.article.update).not.toHaveBeenCalled();  // nunca se marcó 'done'
  });
});
```

Esto solo es posible porque las dependencias se **inyectan**. Si el service hiciera
`new OllamaProvider()` y `new PrismaClient()` adentro, tendrías que levantar Ollama y una BD
real por cada test. **Regla:** lo que instancias adentro es difícil de mockear; lo que
inyectas es fácil.

---

## 9. Preguntas de entrevista

- **¿Qué es la DI?** Pasar dependencias desde afuera en vez de instanciarlas adentro.
  *Trampa:* olvidar el porqué → "para desacoplar y testear".
- **¿DI e IoC son lo mismo?** No. IoC es el principio; DI una implementación. *Trampa:*
  usarlos como sinónimos.
- **¿Por qué el controller delgado?** Separación de responsabilidades; la lógica va al
  service (reutilizable y testeable). *Trampa:* queries a BD en el controller.
- **¿Por qué inyectar una interfaz y no una clase?** Depender de una abstracción (la "D" de
  SOLID). *Trampa:* en TS la interfaz no existe en runtime → necesitas un token.
- **¿Singleton por defecto?** Sí. Para estado por request → scope REQUEST (cuesta perf).
  *Trampa:* estado mutable de usuario en un singleton (se comparte → bug).
- **¿Guard vs Pipe vs Interceptor vs Middleware?** Middleware (antes de todo), Guard
  (¿puede pasar? auth), Pipe (valida/transforma input, los DTOs), Interceptor (envuelve la
  respuesta: logging). *Trampa:* confundir Guard (autoriza) con Pipe (valida).
- **¿Cómo testeas un service que usa BD sin BD?** Mock del repositorio/Prisma. *Trampa:* si
  hace `new PrismaClient()` adentro, no se puede mockear fácil → mal diseño.
- **¿Qué es un DTO y quién lo valida?** Forma del input; `class-validator` + `ValidationPipe`
  lo validan antes del controller. *Trampa:* validar a mano en el handler.

---

## 10. Llamadas al LLM

Ollama expone `POST /api/chat` (shape tipo OpenAI: mensajes con roles). Particularidades:

```ts
await fetch(`${baseUrl}/api/chat`, {
  method: 'POST',
  signal: AbortSignal.timeout(60_000),        // (1) timeout: la 1ª carga del modelo tarda ~30s
  body: JSON.stringify({
    model, stream: false,                     // (2) respuesta completa de un jalón
    think: false,                             // (3) apaga el "razonamiento" de modelos híbridos
    options: { temperature: 0.3, num_predict: 200 },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }),
});
```

1. **Timeout generoso** — la primera petición carga el modelo en RAM (~30s con gemma4).
2. **`stream: false`** — pido todo de una para el pipeline server-side. (El efecto
   "máquina de escribir" de la consola es un typewriter en el front, NO streaming real.)
3. **`think: false`** — bug traicionero: gemma4 es híbrido con razonamiento; sin esto gasta
   todo el `num_predict` "pensando" en un campo aparte y devuelve `content: ""` vacío.

Diseño clave: el estado del TL;DR es una **máquina de estados en la BD**
(`pending → done | failed | skipped`), no una llamada síncrona. Si Ollama está apagado, el
artículo se lee igual (sin caja de TL;DR) y el próximo ciclo reintenta. **La lectura nunca
depende de la IA (FE-03).**

Presupuesto diario: se cuentan los `done` de hoy; al llegar al tope, los `pending` esperan
a mañana (control de costo). Con Ollama el costo es cero → se puede subir el tope.

---

## 11. SSE

Para "empujar" eventos del server al cliente (consola de IA en vivo) uso **Server-Sent
Events**: stream HTTP unidireccional, más simple que WebSocket y pasa por Cloudflare Tunnel.

**Backend** — bus en memoria (RxJS `Subject`) + buffer para clientes que llegan tarde:
```ts
emit(event) { this.buffer.push(event); this.subject.next(event); }
stream() { return concat(from([...this.buffer]), this.subject); }  // replay + eventos vivos

@Sse('stream')
stream() {
  const events = this.events.stream().pipe(map((e) => ({ data: e })));
  const heartbeat = interval(25_000).pipe(map(() => ({ data: { type: 'ping' } })));  // evita corte de Cloudflare
  return merge(events, heartbeat);
}
```

**Frontend** — `EventSource` nativo (con reconexión automática):
```ts
const es = new EventSource('/api/ai/stream');
es.onmessage = (msg) => {
  const ev = JSON.parse(msg.data);
  if (ev.type === 'ping') return;
  // dedupe por id (por si el buffer se re-emite al reconectar) + reduce a estado
};
```
El heartbeat existe porque Cloudflare corta conexiones inactivas (~100s); sin él, el
`EventSource` reconectaba, re-emitía el buffer y salían tarjetas duplicadas.

---

## 12. Frontend

### Cómo se sirve ("todo en un puerto")
El SPA de React se compila (`vite build`) a estáticos y **NestJS los sirve**:
```ts
ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*path}'] })
```
Regla de serve-static: si la URL es un archivo real, lo sirve; si no, sirve `index.html`
(**SPA fallback**). Por eso `/api/x` lo maneja un controller, `/assets/app.js` se sirve, y
cualquier ruta "rara" (`/assets/`, `/cualquiercosa`) devuelve el `index.html` (la app).
En **dev** es distinto: Vite corre en `:5173` con hot-reload y proxea `/api` al `:3001`.

### Cliente HTTP (wrapper mínimo sobre fetch)
```ts
async function request<T>(path, init): Promise<T> {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) throw new Error((await res.json()).message);  // Nest: { statusCode, message, error }
  return res.json();
}
```
Estado todo local en `App.tsx` (`useState`/`useCallback`, sin Redux). Las "pantallas"
(artículo, ajustes, consola) son overlays condicionales, no rutas → por eso el botón atrás
se intercepta a mano con `history.pushState` + `popstate`.

### Barra de progreso de lectura
Puro cálculo de scroll:
```
progreso = scrollTop / (scrollHeight - clientHeight)   // 0 arriba, 1 al fondo
```
`scrollTop`=cuánto bajaste, `scrollHeight`=alto total, `clientHeight`=alto visible. Se pinta
el ancho de una barra `position: sticky; top: 0`. Se mide varias veces al abrir el artículo
porque las imágenes cambian la altura al cargar.

### Gestos de swipe
Tres eventos táctiles por fila:
- `onTouchStart` — guarda posición inicial (x, y).
- `onTouchMove` — calcula `dx`/`dy`; decide dirección UNA vez: si `|dx| > |dy|` es swipe
  horizontal (mueve la tarjeta con `translateX`), si no, deja el scroll vertical.
- `onTouchEnd` — si pasó el umbral (72px) ejecuta la acción; si no, la tarjeta regresa.

La acción depende de dirección + config guardada en `localStorage` (derecha=leído,
izquierda=guardar, editable).

### Render seguro
Doble sanitización (los feeds son fuente no confiable): `sanitize-html` en backend antes de
guardar, `DOMPurify` en frontend antes de renderizar con `dangerouslySetInnerHTML`.

### PWA
`manifest.webmanifest` (define `display: standalone`, íconos) + `service worker` (cachea el
shell; network-first para navegación, cache-first para assets) → se instala como app nativa.
El botón "Instalar" usa el evento `beforeinstallprompt` (la forma confiable en Android).

---

## 13. Seguridad

### "Un secreto en el frontend NO es un secreto"
El SPA corre en el navegador del usuario. Si el front mandara una API key, estaría dentro
del bundle JS descargable → cualquiera la ve en DevTools. **Las API keys viven solo en el
servidor** (como `ANTHROPIC_API_KEY`). Por eso el `API_KEY` del guard NO sirve para el
navegador; es para máquina-a-máquina (un cron externo, un script).

### Capas de protección de Señal
| Capa | Rol |
|---|---|
| **Cloudflare Access** (Zero Trust) | El auth real del navegador: login antes de entrar |
| Bypass de rutas PWA (`sw.js`, `assets/*`, `icons/*`, `manifest`) | Públicas, pero sin secretos; deben estar **acotadas a esas rutas**, no al dominio |
| `HOST=127.0.0.1` (opcional) | Cierra el acceso directo por IP de LAN; el tunnel sigue (conecta por localhost) |
| `API_KEY` del guard | Apagado; solo para máquina-a-máquina |
| Secretos en `.env` | Solo en el server, nunca en el front |

**Verificación definitiva:** en incógnito (sin sesión) entra a `dominio/api/articles`. Login
de Cloudflare = protegido; JSON = expuesto.

### Defense in depth
No depender de una sola barrera (perímetro + app + red). Es el ejercicio de revisar Access +
LAN + secretos juntos.

---

## 14. Arquitectura general

```
Pixel (PWA) ──HTTPS──► Cloudflare Tunnel + Zero Trust ──► [Pi] node (NestJS :3001) ──► SQLite (archivo)
                                                               │
                                                               └──HTTP──► [PC] Ollama :11434 (gemma4)
```

- **Monorepo pnpm**: `apps/api` (NestJS) + `apps/web` (React/Vite) + `prisma/`.
- **Un solo proceso Node** en la Pi: sirve API REST, stream SSE, el build de React y corre
  el cron de ingesta.
- **Backend por módulos de dominio**: ingest, articles, folders, feeds, mutes, prefs, ai,
  digest, discover, retention. Cada uno controller (rutas finas) + service (lógica).
- **Prisma + SQLite** como única capa de datos (un archivo, sin red).
- **Frontend** SPA servido por Nest → todo en un puerto. PWA instalable.
- **Comunicación**: REST para casi todo; SSE para la consola en vivo; HTTP saliente Pi→Ollama.
- **Deploy**: pm2 en la Pi; Cloudflare Tunnel + Zero Trust como perímetro.

**Principios de diseño transversales:**
- La IA nunca bloquea (si falla, se lee sin TL;DR y se reintenta).
- La IA es asesora, no portera (afinidad + veredictos informan; tú decides).
- Capas con contratos (interfaz `AiProvider`, DTOs validados, Prisma como única capa de datos).
- Degradación elegante (si un feed cae, si Ollama está apagado → el sistema sigue).

---

## 15. La capa de IA

### 15.1 El mapa físico (infraestructura)

Tres máquinas, cada una haciendo lo que mejor puede:

```
   TELÉFONO (PWA)
        │ https
        ▼
  Cloudflare Tunnel + Zero Trust (auth)
        │
        ▼
┌─ RASPBERRY PI 4B ──────────────────┐      ┌─ PC (RTX 4060) ────────────────┐
│  NestJS API (:3001) + SPA estática │ LAN  │  Ollama (:11434) → gemma 4B    │
│  SQLite (data/senal.db)            │─────▶│  Kokoro Flask (:8880) → GPU    │
│  Piper (subproceso, TTS ligero)    │      │  (ambos arrancan con Windows)  │
└────────────────────────────────────┘      └────────────────────────────────┘
```

Principio rector: **la Pi es el cerebro de coordinación, la PC es el músculo.**
La Pi (4 GB RAM, ARM) no puede correr un LLM ni un TTS neuronal decente, pero sí
puede orquestar: recibe el request, decide a quién llamarle, cachea resultados y
degrada con gracia si la PC está apagada (los artículos se leen sin TL;DR, el
audiolibro cae a Piper local, el chat da un error claro).

Todo lo de IA viaja **por HTTP dentro de la LAN** — la PC nunca se expone a
internet. El teléfono jamás habla con Ollama/Kokoro directo: siempre pasa por la
API de la Pi (patrón *proxy/facade*), que es la única autenticada por Cloudflare.

### 15.2 Una interfaz, tres proveedores (Strategy + Factory + DI)

Todo consumo de LLM pasa por UNA interfaz:

```ts
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiProvider {
  summarize(title, text): Promise<SummaryResult>;   // TL;DR de artículos
  chat(system, user, opts?): Promise<ChatResult>;   // genérico: traducir, chat, verdicts
  isEnabled(): boolean;
}
```

- **Strategy**: hay 3 implementaciones (`ollama`, `anthropic`, `none`) y la env
  `AI_PROVIDER` elige cuál. Cambiar de gemma local a Claude API = editar el .env.
- **Factory provider**: en `ai.module.ts` un `useFactory` lee la config y devuelve
  la instancia correcta. El resto de la app no sabe cuál le tocó.
- **Symbol token**: la interfaz TypeScript no existe en runtime (se borra al
  compilar), así que el contenedor DI no puede usarla como llave. El `Symbol`
  es la llave runtime: `@Inject(AI_PROVIDER) private provider: AiProvider`.

Con eso, cada feature de IA es solo una forma distinta de llamar `provider.chat()`:

| Feature | system prompt | user prompt | dónde |
|---|---|---|---|
| TL;DR | "resume en español 1-2 frases" | título + texto del artículo | cron de ingesta |
| Traducción | "traductor técnico en→es" | texto seleccionado | `POST /api/ai/translate` |
| Minichat | "asistente de Señal, breve" | historial serializado (≤12 turnos) | `POST /api/ai/chat` |
| Veredicto Discover | "opina si este feed le sirve" | títulos de muestra + intereses | `POST /api/discover/analyze` |

**Convención NestJS clave: controllers flacos.** El controller solo valida el DTO
(class-validator), llama al service/provider y traduce errores a HTTP
(`ServiceUnavailableException` con mensajes útiles: "¿la PC del modelo está
encendida?"). La lógica vive en services.

### 15.3 Particularidades de hablar con un LLM chico

- `think: false` — gemma es un modelo con razonamiento híbrido; si "piensa",
  quema el presupuesto de tokens en el pensamiento y devuelve respuesta vacía.
- `keep_alive: '30m'` — mantiene el modelo en VRAM entre llamadas (la carga en
  frío cuesta ~20 s).
- `AbortSignal.timeout(120_000)` — timeout amplio porque una cola de resúmenes
  puede tener ocupado a Ollama.
- Presupuesto diario (`AI_DAILY_BUDGET`) — un contador en BD evita que un
  backlog de 500 artículos fría la PC toda la noche.
- La IA **nunca bloquea**: si falla, el artículo queda `tldrStatus='pending'` y
  se reintenta al siguiente ciclo. Regla de oro: la app funciona igual sin IA.

### 15.4 El minichat: la "memoria" de un LLM es mentira

Los LLM no recuerdan nada entre llamadas. El "chat" es teatro: el front manda
los últimos 12 mensajes completos en cada request, el backend los serializa
("Usuario: ...\nAsistente: ...") en un solo prompt y gemma "continúa" la
conversación. Doble límite: `slice(-12)` en el front y `@ArrayMaxSize(12)` en el
DTO (nunca confíes solo en el cliente). ChatGPT/Claude hacen exactamente esto
pero con contextos de 200K tokens y caché de prompts.

### 15.5 TTS: el mismo patrón Strategy, otra vez

Dos motores intercambiables detrás de `TtsService`:

- **Piper** (en la Pi): `spawn()` del binario con el texto por stdin → WAV →
  ffmpeg → mp3. Sin red, sin GPU: funciona aunque la PC esté apagada.
- **Kokoro** (en la PC): un mini-servidor Flask propio (`tools/kokoro-server.py`)
  que expone la API OpenAI-compatible `/v1/audio/speech`. El backend le hace un
  fetch y guarda el mp3.

Detalles con chicha:

- **Caché por `artículo+motor+voz`** en `data/audio/` — generar cuesta, servir no.
- **Idioma por prefijo de voz**: `ef_dora` → pipeline español, `af_heart` →
  inglés. El server crea un `KPipeline` por idioma (lazy) y los reutiliza.
- **GPU**: el cuello de botella del TTS neuronal es cómputo, no RAM. En CPU ~2×
  tiempo real; con CUDA en la RTX 4060, ~40× (8 min de audio en 12 s).
- **`Range` requests**: el endpoint de audio soporta 206 Partial Content para
  que el player pueda hacer seek sin descargar todo.
- **`/api/tts/say`**: TTS al vuelo sin caché (para el chat) — el mp3 viaja como
  Blob y el front lo reproduce con `URL.createObjectURL`.

### 15.6 La consola en vivo: bus de eventos + SSE

`AiEventsService` es un Subject de RxJS con buffer (patrón *observer*): el
summarizer, el traductor y el chat emiten `start/done/error`, y el endpoint
`@Sse('stream')` los empuja al navegador. Con heartbeat cada 25 s para que
Cloudflare no mate la conexión idle, y dedupe en el cliente porque una
reconexión re-emite el buffer. Resultado: ves el prompt exacto y la respuesta
de cada llamada al modelo, en tiempo real, desde el teléfono.

### 15.7 Resumen para entrevista

> "Monté una capa de IA local-first: un LLM (gemma vía Ollama) y un TTS neuronal
> (Kokoro) corren en mi PC con GPU, expuestos solo en LAN; una Raspberry Pi
> orquesta todo con NestJS usando el patrón Strategy — una interfaz `AiProvider`
> detrás de un token DI con tres implementaciones intercambiables por variable
> de entorno. Los controllers son flacos (DTO → service → excepción HTTP), la IA
> degrada con gracia (nunca bloquea la funcionalidad core), hay presupuesto
> diario, caché de resultados costosos (TL;DR en BD, audio en disco) y
> observabilidad por SSE. Cambiar de modelo local a Claude API es editar una
> línea del .env."
