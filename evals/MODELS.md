# Comparativa de modelos

> Generado por `pnpm eval:compare` desde `evals/runs/`. No editar a mano.

Mismos 40 casos y mismo prompt para todos, cada caso 3 veces. La velocidad y la
calidad salen de la misma corrida, no de pruebas distintas.

| Modelo | Media | p90 | Palabras/s | Atribución | Matices indebidos | ≤45 palabras | Palabras |
|---|---|---|---|---|---|---|---|
| `qwen2.5-coder:7b` | 3.56 s | 4.85 s | 14.4 | 96.7% | 0.0% | 38.3% | 51.4 |
| `deepseek-r1:8b` | 3.20 s | 3.83 s | 14.1 | 81.7% | 0.0% | 53.3% | 45.0 |
| `gemma4:latest` | 3.10 s | 3.45 s | 12.9 | 73.3% | 0.0% | 90.0% | 39.8 |

**Latencia** por resumen, en la máquina con la GPU de 8 GB, en llamadas
secuenciales a Ollama con el modelo ya cargado (`keep_alive: 30m`). El p90 solo
existe en snapshots posteriores a instrumentar `run.ts`.

**Atribución** es la métrica principal: de los artículos cuyo hecho central NO
está confirmado, cuántos resúmenes conservan la marca de duda. Qué mide y qué no,
en [`README.md`](README.md).

## Reparto CPU/GPU

Medido con `ollama ps` cargando cada modelo solo, con el mismo contexto de 4096:

| Modelo | Cargado | CPU/GPU |
|---|---|---|
| `qwen2.5-coder:7b` | 5.4 GB | 8% / 92% |
| `deepseek-r1:8b` | 6.0 GB | 15% / 85% |
| `gemma4:latest` | 10 GB | 66% / 34% |

## Lectura

**La velocidad por resumen no distingue a los modelos, y encima engaña.** Los tres
caen entre 3.1 y 3.6 s, y dos corridas del mismo `gemma4` se separaron más entre
sí (2.70 s contra 3.10 s) que los modelos entre ellos. El benchmark de 3 artículos
que decía que los 7B eran el doble de rápidos era ruido.

Pero la latencia por resumen premia al que escribe corto, y eso es el prompt, no
la máquina. Normalizada, la columna **Palabras/s** ordena al revés: los modelos que
viven en la GPU generan algo más rápido, consistente con su reparto (92% y 85% en
GPU contra el 34% de `gemma4`). O sea que `gemma4` corre dos tercios en CPU y
aun así gana en tiempo por resumen, porque produce ~12 palabras menos. La ventaja
real de meter el modelo entero en VRAM existe, pero es del orden del 10%, no del
100%, y se la come la longitud de salida.

**Lo que sí separa a los modelos son dos columnas que tiran en direcciones
opuestas.** `qwen2.5-coder:7b` conserva la atribución casi siempre pero se pasa
del límite de 45 palabras en 6 de cada 10 resúmenes; `gemma4:latest` respeta la
longitud 9 de cada 10 veces y pierde la atribución en 1 de cada 4.

Y están ligadas, conviene decirlo en voz alta: condensar es justo lo que tira el
matiz del original. Un resumen de 51 palabras tiene sitio para el "según un
reporte" que uno de 40 recorta. Así que el eval no mide dos virtudes
independientes, y comparar atribución entre modelos con longitudes distintas
favorece al más verboso.

Eso deja una pregunta abierta, que es lo honesto: si se le aprieta la longitud a
`qwen2.5-coder:7b` por prompt, ¿mantiene el 96.7% de atribución o cae al nivel de
`gemma4`? Sin medirlo no se sabe. Es el siguiente experimento, no una conclusión.

## Todas las corridas

Repetir la corrida es la única forma de separar la señal del ruido de
`temperature 0.3`. Las dos de `gemma4:latest` dieron calidad idéntica y latencias
distintas (2.70 s contra 3.10 s), así que las diferencias de latencia por debajo
de medio segundo entre modelos no significan nada.

| Corrida | Modelo | Fecha | Atribución | ≤45 palabras | Media |
|---|---|---|---|---|---|
| `2026-10-07-05-33-gemma4-latest.json` | `gemma4:latest` | 2026-10-07 05:33 | 73.3% | 90.0% | 3.10 s |
| `2026-10-07-05-27-deepseek-r1-8b.json` | `deepseek-r1:8b` | 2026-10-07 05:27 | 81.7% | 53.3% | 3.20 s |
| `2026-10-07-05-21-qwen2.5-coder-7b.json` | `qwen2.5-coder:7b` | 2026-10-07 05:21 | 96.7% | 38.3% | 3.56 s |
| `2026-10-07-gemma4-latest.json` | `gemma4:latest` | 2026-10-07 04:29 | 73.3% | 90.0% | 2.70 s |
