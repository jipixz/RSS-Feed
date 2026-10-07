# Evaluación del TL;DR

Mide una cosa concreta y verificable: **¿el resumen conserva el grado de certeza
del artículo original?**

El problema real que originó esto: el modelo convertía en hechos cosas que el
artículo atribuía a un reporte o a una investigación en curso. Ante un texto que
decía *"was the work of OpenAI agents, **according to a new report**"*, generaba
*"Agentes de OpenAI **orquestaron** un ataque"*.

## Qué mide

Cada caso del dataset está etiquetado a mano con una de dos clases:

| Etiqueta | Significado | Qué debe hacer el resumen |
|---|---|---|
| `attributed` | El hecho central **no** está confirmado: investigación en curso, sospecha, acusación sin resolver, atribución tentativa | Conservar la atribución ("según…", "se investiga si…") o marcar la duda |
| `factual` | Hecho confirmado (anuncio oficial, parche publicado, contenido técnico), aunque venga atribuido a una fuente | Afirmarlo sin rodeos |

Las dos clases existen a propósito: la primera detecta el fallo original y la
segunda detecta el efecto secundario de corregirlo en exceso (un modelo que
llena de "presuntamente" hasta lo que sí está confirmado).

### Métricas

- **`attributionRate`** — de los casos `attributed`, cuántos conservan la atribución. **Métrica principal.**
- **`falseHedgeRate`** — de los casos `factual`, cuántos meten matices que el original no tiene.
- **`lengthCompliance`** — proporción dentro del límite de 45 palabras del prompt.
- **`preambleRate`** — resúmenes que arrancan con "Aquí está el resumen:", que el prompt prohíbe.
- **`avgWords`** — longitud media, para vigilar que una corrección no infle la salida.

## Con cuántos casos

**40 casos** extraídos de artículos reales de la base de datos de la propia
aplicación (Hacker News, SecurityWeek, BleepingComputer, Lobsters y demás):
20 `attributed` y 20 `factual`.

Cada caso se ejecuta **3 veces**, porque el modelo corre con `temperature 0.3` y
no es determinista. Cada repetición cuenta como una observación independiente,
así la tasa refleja el ruido en vez de esconderlo: **120 observaciones** por
corrida.

### Split para no engañarse

| Split | Casos | Para qué |
|---|---|---|
| `iteration` | 24 (12 + 12) | Afinar el prompt mirando los fallos |
| `holdout` | 16 (8 + 8) | Reportar el número, sin haberlo mirado al iterar |

El reporte muestra ambos. Si la diferencia entre ellos es grande, es señal de
que el prompt se ajustó demasiado a los casos de iteración.

## Qué corre dónde (importante)

GitHub Actions no tiene acceso al modelo local, así que la evaluación está
partida en dos:

| Parte | Dónde | Comando |
|---|---|---|
| **Generación** | Tu máquina, con Ollama | `pnpm eval:run` |
| **Verificación** | **CI, en cada push** | `pnpm eval:check` |

`eval:run` llama al modelo usando el **prompt real del código** (lo importa de
`apps/api/src/ai/provider/prompt.ts`, no una copia) y guarda un snapshot en
`evals/runs/`. Ese snapshot se versiona en git.

`eval:check` no llama a ningún modelo: re-puntúa el snapshot con el scorer y
**falla el build** si la calidad cae por debajo de los umbrales. Eso detecta dos
regresiones distintas: que alguien empeore el prompt y suba un snapshot malo, o
que alguien afloje el scorer para que pasen cosas que no deberían.

El scorer (`apps/api/src/evals/scorer.ts`) es determinista, sin red, y tiene sus
propios tests unitarios que también corren en CI.

### Umbrales

```
attributionRate  >= 85%
falseHedgeRate   <= 15%
lengthCompliance >= 75%
```

## Cómo reproducirlo

```bash
ollama pull gemma4:latest     # o el modelo que quieras medir
pnpm eval:run                 # ~6 min: 40 casos x 3 repeticiones
pnpm eval:check               # aplica los umbrales
```

Variables: `EVAL_MODEL` (default `gemma4:latest`), `EVAL_REPEATS` (default `3`),
`OLLAMA_BASE_URL`.

Para regenerar el dataset desde la base de datos: `pnpm eval:dataset`. Las
etiquetas viven en el código (`build-dataset.ts`) porque son juicio humano, no
algo derivable automáticamente.

## Limitaciones (léelas antes de creerte los números)

1. **N pequeño.** 40 casos y 120 observaciones dan una señal, no significancia estadística.
2. **El scorer es por reglas, no semántico.** Busca marcadores lingüísticos con expresiones regulares. Puede dar falsos positivos (un "según" que aparece por otro motivo) y no entiende el contenido. Un LLM-as-judge sería más fino, pero no podría correr en CI sin una API externa.
3. **Las etiquetas son de una sola persona,** sin segundo anotador ni medida de acuerdo entre anotadores.
4. **El eval usa un extracto de 1.200 caracteres** por artículo; producción usa hasta 8.000. La señal de atribución casi siempre está en los primeros párrafos, pero no es exactamente el mismo input.
5. **Un solo modelo por corrida.** Comparar modelos requiere correr `eval:run` con cada `EVAL_MODEL` y comparar snapshots a mano.
6. **El snapshot se regenera a mano.** Si alguien cambia el prompt y no vuelve a correr `eval:run`, el CI sigue validando el snapshot viejo. El job avisa de la fecha del snapshot, pero no puede obligar a regenerarlo.

## Contenido de terceros

El dataset incluye extractos (~1.200 caracteres) de artículos publicados por
sus respectivos medios, con título, fuente y URL de origen en cada caso. Se
incluyen como cita con fines de evaluación técnica reproducible. Los derechos
son de sus autores.
