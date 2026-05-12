# vlog-studio

AI-assisted vlog editor. Ingesta clips raw → transcribe → propone un EDL con scripts de voice-over → grabás el VO → genera/elige música → exporta MP4 16:9 + Shorts 9:16 con captions quemados.

Plan completo: `~/Documents/projects/personal/personal-brain/01-Projects/01-vlog-studio/plan.md`.

## Requisitos

- Node 22 (via nvm — hay `.nvmrc`)
- ffmpeg en PATH (`brew install ffmpeg`)
- openai-whisper en PATH (`~/Library/Python/3.9/bin/whisper` con modelo `turbo` cacheado)
- API key de Gemini en `.env` (`GEMINI_API_KEY`) o Anthropic (`ANTHROPIC_API_KEY` + `LLM_PROVIDER=anthropic`)

## Dev

```bash
nvm use
npm run dev
```

## Ingest

Dos caminos:

1. **Drag & drop** en `/projects/<id>/ingest`: arrastrás clips al dropzone.
2. **Inbox**: copiás archivos (AirDrop, manual, lo que sea) a `data/inbox/`, después click **"Importar inbox"**. Los procesados se mueven a `data/inbox/imported/`.
