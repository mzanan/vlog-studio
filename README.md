# vlog-studio

AI-assisted vlog editor. Ingesta clips raw → transcribe → propone un EDL con scripts de voice-over → grabás el VO → genera/elige música → exporta MP4 16:9 + Shorts 9:16 con captions quemados.

## Requisitos

- Node 22 (via nvm — hay `.nvmrc`)
- ffmpeg en PATH (`brew install ffmpeg`)
- openai-whisper en PATH (`~/Library/Python/3.9/bin/whisper` con modelo `turbo` cacheado)
- API key de Gemini en `.env` (`GEMINI_API_KEY`) o Anthropic (`ANTHROPIC_API_KEY` + `LLM_PROVIDER=anthropic`)
- Python 3.12 venv para MusicGen (afuera del proyecto, Turbopack se enoja con los symlinks adentro):

  ```bash
  python3.12 -m venv ~/.venvs/vlog-studio
  ~/.venvs/vlog-studio/bin/pip install torch transformers scipy numpy
  ```

  Primera generación descarga `facebook/musicgen-small` (~2.5GB) a `~/.cache/huggingface/`. Después de eso es offline. ~3-5s de compute por cada 1s de audio en Apple Silicon.

## Dev

```bash
nvm use
npm run dev
```

## Ingest

Tres caminos:

1. **Drag & drop** en `/projects/<id>/ingest`: arrastrás clips al dropzone.
2. **Inbox**: copiás archivos (AirDrop, manual, lo que sea) a `data/inbox/`, después click **"Importar inbox"**. Los procesados se mueven a `data/inbox/imported/`.
3. **Capítulos**: desde el home, el LLM agrupa los clips taggeados (vision tags en `data/vision-tags/`) en capítulos y guarda el resultado en `data/chapters/grouping.json`; "Import chapters" crea un Project por capítulo y los ingesta en background (sin whisper, son b-roll en su mayoría) con progreso en vivo que sobrevive al refresh.

## Best moment por clip b-roll

El rango `inMs/outMs` de cada clip b-roll lo decide el server, nunca el LLM:

1. `npm run score-moments -- <projectId>`: ffmpeg puntúa ventanas candidatas de 2-6s por clip (exposición, nitidez, movimiento, energía de audio, penalización por cortes de escena) y guarda el top-3 en `data/moment-scores/<projectId>.jsonl`. Clips menores a 2s se omiten.
2. `npm run pick-moments -- <projectId>`: un modelo de visión elige la mejor ventana por contenido y guarda `pick` + razón en el mismo JSONL. Provider por env: `VISION_PICK_PROVIDER` (`ollama` default, `openrouter`) y `VISION_PICK_MODEL`; ante cualquier fallo cae a la ventana de mayor score heurístico.
3. `/plan` usa esa ventana como `bestMoment`: la propone como sugerencia `trim-segment` con la razón como rationale. Sin moment-scores, el clip queda entero (comportamiento previo). Si el usuario restauró ese segmento desde la timeline (`userAdjusted`), la sugerencia queda pendiente para aceptar o rechazar en vez de aplicarse sola, y un trim ya rechazado con el mismo rango no se vuelve a ofrecer.

Env vars (todas opcionales, defaults actuales):

- `OLLAMA_URL`: endpoint de Ollama para vision picks (default `http://localhost:11434/api/chat`).
- `VISION_PICK_PROVIDER`: `ollama` (default) u `openrouter`.
- `VISION_PICK_MODEL`: modelo de visión (default `qwen2.5vl:7b` en ollama, `dots-studio/dots-3-note-preview:free` en openrouter).
- `VISION_PICK_TIMEOUT_MS`: timeout por request (default `120000`).
- `VISION_PICK_ATTEMPTS`: intentos contra el provider remoto (default `3`).
- `VISION_PICK_BACKOFF_MS`: backoff base entre reintentos (default `4000`).
- `MOMENT_SCORE_TOP_K`: ventanas candidatas guardadas por clip (default `3`).
