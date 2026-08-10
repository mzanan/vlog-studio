# vlog-studio

AI-assisted vlog editor. Ingesta clips raw → transcribe → propone un EDL con scripts de voice-over → grabás el VO → genera/elige música → exporta MP4 16:9 + Shorts 9:16 con captions quemados.

Plan completo: `~/Documents/projects/personal/personal-brain/01-Projects/01-vlog-studio/plan.md`.

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
