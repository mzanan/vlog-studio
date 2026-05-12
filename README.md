# vlog-studio

AI-assisted vlog editor. Ingesta clips raw → transcribe → propone un EDL con scripts de voice-over → grabás el VO → genera/elige música → exporta MP4 16:9 + Shorts 9:16 con captions quemados.

Plan completo: `~/Documents/projects/personal/personal-brain/01-Projects/01-vlog-studio/plan.md`.

## Requisitos

- Node 22 (via nvm — hay `.nvmrc`)
- ffmpeg en PATH (`brew install ffmpeg`)
- Python 3.11+ (venv local en `python/` se crea cuando arranque Fase 1)
- `ANTHROPIC_API_KEY` en `.env.local`

## Estado

Pre-Fase 1. Bootstrap completo, pipeline aún no implementado.

## Dev

```bash
nvm use
npm run dev
```
