"""
Mini-servidor TTS OpenAI-compatible para Kokoro (sin Docker).

Expone POST /v1/audio/speech  { input, voice, response_format }
igual que kokoro-fastapi, para que el backend de Señal (TTS_KOKORO_URL)
le pegue sin cambios.

Uso (en la PC, donde vive el modelo):
    pip install kokoro soundfile flask
    python tools/kokoro-server.py          # escucha en 0.0.0.0:8880

La primera petición descarga los pesos del modelo (~330 MB) de Hugging Face.
Requiere ffmpeg en el PATH para devolver mp3 (si no, devuelve wav).
"""
import io
import os
import shutil
import subprocess
import numpy as np
import soundfile as sf
from flask import Flask, jsonify, request

PORT = 8880
DEFAULT_VOICE = "af_heart"  # inglés; ver https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
# KOKORO_DEVICE=cuda para usar la GPU (requiere torch con CUDA instalado);
# sin definir, torch elige solo (CPU si no hay CUDA).
DEVICE = os.environ.get("KOKORO_DEVICE") or None

app = Flask(__name__)
_pipelines = {}  # un pipeline por idioma, carga perezosa en la primera petición


def lang_for(voice: str) -> str:
    """El prefijo de la voz dicta el idioma del G2P: ef_dora → 'e' (español).
    a=inglés US, b=inglés UK, e=español, f=francés, i=italiano, p=portugués."""
    prefix = voice[:1]
    return prefix if prefix in "abefhijpz" else "a"


def get_pipeline(voice: str):
    lang = lang_for(voice)
    if lang not in _pipelines:
        import torch
        if DEVICE != "cuda":
            # en CPU, usar todos los cores físicos acelera un poco la síntesis
            torch.set_num_threads(max(1, (os.cpu_count() or 2) // 2))
        from kokoro import KPipeline
        p = KPipeline(lang_code=lang, device=DEVICE)
        if lang == "e":
            # Kokoro fonetiza 'e' como castellano (con zeta). Cambiamos el G2P a
            # español latinoamericano (seseo). Ajustable: KOKORO_ES_DIALECT=es / es-419
            dialect = os.environ.get("KOKORO_ES_DIALECT", "es-419")
            try:
                from misaki import espeak as _espeak
                p.g2p = _espeak.EspeakG2P(language=dialect)
                print(f"G2P español: {dialect}")
            except Exception as e:
                print(f"No se pudo cambiar el dialecto a {dialect}: {e}")
        _pipelines[lang] = p
    return _pipelines[lang]


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": "kokoro-82M"})


@app.post("/v1/audio/speech")
def speech():
    body = request.get_json(force=True)
    text = (body.get("input") or "").strip()
    voice = body.get("voice") or DEFAULT_VOICE
    fmt = body.get("response_format") or "mp3"
    if not text:
        return jsonify({"error": "input vacío"}), 400

    # Kokoro trocea el texto internamente; concatenamos los segmentos
    try:
        pipeline = get_pipeline(voice)
    except Exception as e:  # p. ej. falta espeak-ng para idiomas no-ingleses
        return jsonify({"error": f"no se pudo crear el pipeline para '{voice}': {e}"}), 500
    chunks = [audio for _, _, audio in pipeline(text, voice=voice)]
    if not chunks:
        return jsonify({"error": "no se generó audio"}), 500
    audio = np.concatenate(chunks)

    wav = io.BytesIO()
    sf.write(wav, audio, 24000, format="WAV", subtype="PCM_16")
    wav_bytes = wav.getvalue()

    if fmt == "mp3" and shutil.which("ffmpeg"):
        proc = subprocess.run(
            ["ffmpeg", "-f", "wav", "-i", "pipe:0", "-codec:a", "libmp3lame",
             "-b:a", "64k", "-ac", "1", "-f", "mp3", "pipe:1"],
            input=wav_bytes, capture_output=True,
        )
        if proc.returncode == 0 and len(proc.stdout) > 1000:
            return proc.stdout, 200, {"Content-Type": "audio/mpeg"}

    return wav_bytes, 200, {"Content-Type": "audio/wav"}


if __name__ == "__main__":
    print(f"Kokoro TTS server en http://0.0.0.0:{PORT}  (voz default: {DEFAULT_VOICE})")
    app.run(host="0.0.0.0", port=PORT, threaded=False)
