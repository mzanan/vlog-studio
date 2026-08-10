import { NextRequest } from 'next/server';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { ingestClipFile } from '@/lib/ingest';
import { generateChapters } from '@/lib/llm';
import { VisionTag } from '@/lib/chapters';

const VISION_TAGS_DIR = path.resolve(process.cwd(), 'data', 'vision-tags');
const SOURCE_ROOT = path.join(homedir(), 'Movies', 'phone-camera', '2026', 'horizontal-1080', '1. tokio');

async function loadVisionTags(): Promise<VisionTag[]> {
  const files = (await readdir(VISION_TAGS_DIR)).filter((f) => f.endsWith('.jsonl'));
  const all: VisionTag[] = [];
  for (const file of files) {
    const content = await readFile(path.join(VISION_TAGS_DIR, file), 'utf-8');
    for (const line of content.trim().split('\n')) {
      if (line) all.push(JSON.parse(line) as VisionTag);
    }
  }
  return all;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxChapters = typeof body?.maxChapters === 'number' ? body.maxChapters : undefined;

  const tags = await loadVisionTags();
  if (tags.length === 0) {
    return Response.json({ error: 'no vision tags found' }, { status: 404 });
  }

  const { chapters: allChapters } = await generateChapters(tags);
  const chapters = maxChapters ? allChapters.slice(0, maxChapters) : allChapters;

  const results: {
    projectId: string;
    title: string;
    reason: string;
    imported: number;
    failed: { clip: string; error: string }[];
  }[] = [];

  for (const chapter of chapters) {
    const project = await prisma.project.create({
      data: { name: chapter.title, intent: chapter.reason },
    });

    const failed: { clip: string; error: string }[] = [];
    let imported = 0;
    for (const tag of chapter.clips) {
      const sourcePath = path.join(SOURCE_ROOT, tag.dia, `${tag.clip}.mp4`);
      try {
        await ingestClipFile(project.id, sourcePath, `${tag.clip}.mp4`, req.signal, true);
        imported++;
      } catch (err) {
        failed.push({ clip: tag.clip, error: err instanceof Error ? err.message : String(err) });
      }
    }

    results.push({ projectId: project.id, title: chapter.title, reason: chapter.reason, imported, failed });
  }

  return Response.json({ chapters: results }, { status: 201 });
}
