@AGENTS.md

# vlog-studio

Editor de vlogs asistido por AI. Pipeline: ingest clips → transcribe → planning agent → record VO → music → compose (16:9) → reframe (9:16) + captions.

Plan vivo en `~/Documents/projects/personal/personal-brain/01-Projects/01-vlog-studio/plan.md`.

## Stack

- Next.js 16 (App Router) + TypeScript — **leer `node_modules/next/dist/docs/` antes de tocar Next, hay breaking changes vs versiones anteriores**
- Mantine v7 + TanStack Query v5 (front)
- Prisma + SQLite (metadata)
- Remotion 4 (composición + render)
- ffmpeg (encoding, concat, crop, audio mix)
- Anthropic SDK (Claude Sonnet 4.6) — planning agent + VO scripts + shorts highlights
- Python subprocess workers (no integrados a Next): openai-whisper (ya instalado), audiocraft/MusicGen, mediapipe (face tracking) — se instalan en `python/.venv` cuando arranque Fase 1

## Node

Pinned a 22 via `.nvmrc`. `nvm use` antes de cualquier comando.

## Working preferences

- No crear commits ni PRs sin confirmación.
- Sin Co-Authored-By trailers.
- Git config local en este repo: `matiaszanan@gmail.com` / `Matias Zanan`.
- Sin fechas de entrega — proyecto hobby.
- Prosa breve. Templates ya están en español.

## Gotchas

- **Mantine compound components en RSC**: `<Table.Thead>` falla en Server Components con "Element type is invalid". Importar nombrados (`TableThead`, `TableTbody`, etc.). Pasa con otros compounds — preferir named exports.
- **Mantine `Anchor component={Link}` desde RSC**: tirar a `<Anchor href=...>` (full reload) o envolver en un Client Component. Funciones no se serializan a través de la frontera RSC.
