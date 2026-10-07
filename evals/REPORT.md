# Resultado de la evaluación

> Generado por `pnpm eval:report` desde `evals/runs/latest.json`. No editar a mano.

- **Fecha:** 2026-10-07T05:33:53.173Z
- **Modelo:** `gemma4:latest`
- **Casos:** 40 · **Repeticiones:** 3 · **Observaciones:** 120
- **Duración:** 6.2 min

## Métricas

| Métrica | Global | Holdout | Iteration |
|---|---|---|---|
| Atribución conservada | **73.3%** | 83.3% | 66.7% |
| Matices indebidos | 0.0% | 0.0% | 0.0% |
| Dentro de 45 palabras | 90.0% | 79.2% | 97.2% |
| Preámbulo indebido | 0.0% | — | — |
| Palabras de media | 39.8 | 40.9 | 39.1 |

**Cómo leerlo.** *Atribución conservada* es la métrica principal: de los artículos
cuyo hecho central NO está confirmado, qué proporción de resúmenes mantiene la
marca de duda en vez de afirmarlo. *Matices indebidos* es el contrapeso: de los
hechos SÍ confirmados, cuántos recibieron matices que el original no tiene.

El `holdout` no se miró al ajustar el prompt. Con solo 48 observaciones,
una sola diferencia mueve el porcentaje varios puntos: trátalo como señal, no
como medida fina.

## Qué falla todavía

**Fable 5.1 Solves the "Cyphral Distich" (370 year old cipher)** · 3/3 fallos · `iteration`

> Fable 5.1 resolvió el Cyphral Distich, un cifrado sin resolver durante siglos. Esto es importante porque demuestra que modelos avanzados pueden resolver criptogramas complejos que 

**Hackers exploit Tencent app flaw to deploy GrayRabbit malware** · 3/3 fallos · `iteration`

> Actores vinculados a un grupo de espionaje chino están explotando una vulnerabilidad RCE en Sogou Input Method de Tencent para desplegar el malware GrayRabbit. Esto es importante p

**US Customs supervisor busted for stealing hardware from Homeland Secur** · 3/3 fallos · `iteration`

> Un supervisor de Aduanas fue arrestado por robar hardware de más de 46 PCs del Departamento de Seguridad Nacional. Esto es relevante porque el acceso de Liu, restringido a soporte 

**Slim Spider Steals Crypto Custody Secrets From Brazilian Financial Ins** · 3/3 fallos · `iteration`

> Un actor de amenaza sin documentar, llamado Slim Spider, ha atacado instituciones financieras brasileñas desde marzo de 2026, mostrando conocimiento profundo de infraestructura com

**China-Linked Hackers Deploy New StormEncryptor Ransomware, Likely via ** · 2/3 fallos · `holdout`

> Actores vinculados a China desplegaron StormEncryptor, un ransomware que usa C++ y afecta archivos con extensión .encrypted. Esto podría deberse a la explotación de CVE-2026-18577 

**1.6 Million Likely Impacted by RingCentral Data Breach** · 1/3 fallos · `holdout`

> Aproximadamente 1.6 millones de registros de RingCentral parecen haber sido robados por un grupo de extorsión tras una campaña de ingeniería social. Esto es importante porque, aunq

**OpenAI's Only Ethicist Reportedly Left Last Month** · 1/3 fallos · `holdout`

> La jefa de ética de OpenAI, Chloé Bakalar, dejó la compañía en julio, siendo la única ética dedicada. Esto implica que OpenAI podría estar sin un experto dedicado en ética de IA, l


El patrón dominante: la incertidumbre del original vive en un modificador
("*alleged* leaders", "*linked to*", "*appears to* have solved") y no en un verbo
de reporte, así que el modelo la deja caer al condensar.

## Prompt evaluado

```
Eres un asistente que resume artículos técnicos para un desarrollador.
Devuelve SOLO el resumen, sin preámbulo, en español, en 1–2 frases (máx. 45 palabras; no te pases).
Enfócate en el "qué pasó" y el "por qué importa para quien construye software".
No inventes datos que no estén en el texto.
Conserva el grado de certeza del original. Si el texto marca duda o atribución —"according to", "reportedly", "allegedly", "suspected", "alleged", "linked to", "appears to", "may have", "likely", "is investigating"— el resumen DEBE conservar esa marca: usa "según un reporte…", "se investiga si…", "presunto…", "habría…" o "estaría vinculado a…". Nunca presentes como hecho probado algo que el original no afirma, aunque te quede más corto.
```
