# Experimento: longitud contra atribución

> Generado por `pnpm eval:experiment` desde `evals/runs/`. No editar a mano.

**La pregunta.** [`MODELS.md`](MODELS.md) dejó esto sin resolver: `qwen2.5-coder:7b`
conserva la atribución mucho mejor que `gemma4:latest`, pero también escribe más
largo, y condensar es justo lo que tira el matiz del original. ¿Es un modelo
mejor, o solo un modelo más verboso?

**Unidad de análisis.** Las 3 repeticiones del mismo artículo están
correlacionadas, así que tratarlas como 60 observaciones independientes finge
precisión. Aquí la tasa se promedia por caso y el intervalo (±, normal al 95%) se
calcula sobre los 20 casos `attributed`. Con n=20 el intervalo es orientativo:
sirve para ver si una diferencia cabe dentro del ruido, no para un contraste
formal.

La columna **Δ atribución** es **pareada**: todos los brazos corrieron los mismos
casos, así que la diferencia se calcula caso contra caso. Eso quita de encima la
variabilidad entre artículos, que es enorme —unos llevan la duda en un verbo de
reporte y otros en un adjetivo suelto— y es la razón de que el ± del delta sea
mucho más estrecho que el ± de cada brazo por separado.

## 1. Observacional: atribución según la longitud que salió

De los casos no confirmados, tasa de atribución separando los resúmenes que
entraron en las 45 palabras de los que se pasaron. Mismo modelo y mismo prompt:
lo único que cambia es la longitud que eligió el modelo.

| Modelo | Resúmenes ≤45 palabras | Resúmenes >45 palabras |
|---|---|---|
| `deepseek-r1:8b` | 82.4% (n=34) | 80.8% (n=26) |
| `gemma4:latest` | 73.6% (n=53) | 71.4% (n=7) |
| `qwen2.5-coder:7b` | 88.9% (n=18) | 100.0% (n=42) |

A igualdad de longitud —solo los resúmenes que entraron en el límite— el orden queda: `qwen2.5-coder:7b` 88.9% (n=18) · `deepseek-r1:8b` 82.4% (n=34) · `gemma4:latest` 73.6% (n=53).

**Esto no prueba causalidad.** El modelo eligió cuánto escribir, así que un
artículo que salió corto puede ser también un artículo donde la duda era fácil de
omitir. Para eso está la parte 2.

## 2. Intervención: forzar la longitud por prompt

Tres brazos, mismo dataset y mismas repeticiones (ver `apps/api/src/evals/variants.ts`):

| Variante | Qué prueba |
|---|---|
| `prod` | El prompt real, con el límite blando ("máx. 45 palabras; no te pases"). |
| `hard-length` | Mismo límite, exigido ("el límite es estricto… reescríbelo más corto"). No dice qué sacrificar. |
| `hard-length-priority` | Lo anterior más la regla de qué recortar primero: detalle secundario sí, atribución no. |

| Modelo | Variante | Atribución (por caso) | ≤45 palabras | Palabras | Δ atribución (pareado) | Δ palabras |
|---|---|---|---|---|---|---|
| `deepseek-r1:8b` | `prod` | 81.7% ± 13.0 | 53.3% | 45.0 | — | — |
| `gemma4:latest` | `prod` | 73.3% ± 18.1 | 90.0% | 39.8 | — | — |
| `gemma4:latest` | `hard-length` | 63.3% ± 21.1 | 99.2% | 35.3 | -10.0 pts ± 9.6 | -4.5 |
| `gemma4:latest` | `hard-length-priority` | 75.0% ± 17.7 | 97.5% | 35.7 | +1.7 pts ± 5.8 | -4.1 |
| `qwen2.5-coder:7b` | `prod` | 96.7% ± 4.5 | 38.3% | 51.4 | — | — |
| `qwen2.5-coder:7b` | `hard-length` | 91.7% ± 10.5 | 31.7% | 55.5 | -5.0 pts ± 10.9 | +4.1 |
| `qwen2.5-coder:7b` | `hard-length-priority` | 96.7% ± 4.5 | 31.7% | 55.8 | +0.0 pts ± 4.7 | +4.4 |

## 3. Lectura mecánica

- `gemma4:latest`, **límite duro**: -4.5 palabras de media, dentro del límite +9.2 pts, atribución -10.0 pts ± 9.6 (pareado), **fuera del ruido**.
- `gemma4:latest`, **límite duro + prioridad**: -4.1 palabras de media, dentro del límite +7.5 pts, atribución +1.7 pts ± 5.8 (pareado), **cabe dentro del ruido**.
- `qwen2.5-coder:7b`, **límite duro**: +4.1 palabras de media, dentro del límite -6.7 pts, atribución -5.0 pts ± 10.9 (pareado), **cabe dentro del ruido**. Y la manipulación falló: el modelo no acortó, así que su atribución en este brazo no dice nada sobre el efecto de condensar.
- `qwen2.5-coder:7b`, **límite duro + prioridad**: +4.4 palabras de media, dentro del límite -6.7 pts, atribución +0.0 pts ± 4.7 (pareado), **cabe dentro del ruido**. Y la manipulación falló: el modelo no acortó, así que su atribución en este brazo no dice nada sobre el efecto de condensar.

Cómo leerlo: si forzar la longitud **sin** decir qué sacrificar baja la
atribución, entonces la ventaja del modelo verboso era en parte la verbosidad. Si
la atribución aguanta, el modelo era mejor de verdad. Y si el brazo con regla de
prioridad recupera la atribución **manteniendo** la longitud, entonces esto no se
arregla cambiando de modelo sino escribiendo mejor el prompt, que es más barato y
no toca la infraestructura.

## Corridas usadas

| Modelo | Variante | Corrida | Fecha |
|---|---|---|---|
| `deepseek-r1:8b` | `prod` | `2026-10-07-05-27-deepseek-r1-8b.json` | 2026-10-07 05:27 |
| `gemma4:latest` | `hard-length` | `2026-10-07-21-56-gemma4-latest--hard-length.json` | 2026-10-07 21:56 |
| `gemma4:latest` | `hard-length-priority` | `2026-10-07-22-01-gemma4-latest--hard-length-priority.json` | 2026-10-07 22:01 |
| `gemma4:latest` | `prod` | `2026-10-07-05-33-gemma4-latest.json` | 2026-10-07 05:33 |
| `qwen2.5-coder:7b` | `hard-length` | `2026-10-07-21-45-qwen2.5-coder-7b--hard-length.json` | 2026-10-07 21:45 |
| `qwen2.5-coder:7b` | `hard-length-priority` | `2026-10-07-21-51-qwen2.5-coder-7b--hard-length-priority.json` | 2026-10-07 21:51 |
| `qwen2.5-coder:7b` | `prod` | `2026-10-07-05-21-qwen2.5-coder-7b.json` | 2026-10-07 05:21 |
