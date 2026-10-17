@AGENTS.md

# vlog-studio

AI-assisted vlog editor. Pipeline: ingest clips → transcribe → planning agent → record VO → music → compose (16:9) → reframe (9:16) + captions.

Living plan in `~/Documents/projects/personal/personal-brain/01-Projects/01-vlog-studio/plan.md`.

## Stack

- Next.js 16 (App Router) + TypeScript: **read `node_modules/next/dist/docs/` before touching Next, there are breaking changes vs earlier versions**
- Mantine v9 + TanStack Query v5 (front)
- Prisma + SQLite (metadata)
- Remotion 4 (composition + render)
- ffmpeg (encoding, concat, crop, audio mix)
- Anthropic SDK (Claude Sonnet 4.6): planning agent + VO scripts + shorts highlights
- Python subprocess workers (not integrated into Next): openai-whisper (already installed), audiocraft/MusicGen, mediapipe (face tracking), installed in `python/.venv` when Phase 1 starts

## Node

Pinned to 22 via `.nvmrc`. Run `nvm use` before any command.

## Working preferences

- Git approvals and trailers: output style "Matias" rule 6.
- Local git config in this repo: `matiaszanan@gmail.com` / `Matias Zanan`.
- No delivery dates: hobby project.
- Brief prose. Templates are already in Spanish.

## Gotchas

- **Mantine compound components in RSC**: `<Table.Thead>` fails in Server Components with "Element type is invalid". Import the named exports (`TableThead`, `TableTbody`, etc.). Same for other compounds: prefer named exports.
- **Mantine `Anchor component={Link}` from RSC**: use `<Anchor href=...>` (full reload) or wrap it in a Client Component. Functions do not serialize across the RSC boundary.
