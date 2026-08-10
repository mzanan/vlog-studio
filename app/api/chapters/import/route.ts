import { NextRequest } from 'next/server';
import { homedir } from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { ingestClipFile } from '@/lib/ingest';
import { loadGrouping } from '@/lib/chapters';

const SOURCE_ROOT = path.join(homedir(), 'Movies', 'phone-camera', '2026', 'horizontal-1080', '1. tokio');

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxChapters = typeof body?.maxChapters === 'number' ? body.maxChapters : undefined;

  const grouping = await loadGrouping();
  if (!grouping) {
    return Response.json({ error: 'no saved grouping, generate one first' }, { status: 404 });
  }

  const chapters = maxChapters ? grouping.chapters.slice(0, maxChapters) : grouping.chapters;
  const totalClips = chapters.reduce((sum, c) => sum + c.clips.length, 0);
  console.log(`[chapters] importing ${chapters.length} chapters, ${totalClips} clips (grouping from ${grouping.generatedAt})...`);

  const results: {
    projectId: string;
    title: string;
    reason: string;
    imported: number;
    failed: { clip: string; error: string }[];
  }[] = [];

  let done = 0;
  for (const chapter of chapters) {
    const project = await prisma.project.create({
      data: { name: chapter.title, intent: chapter.reason },
    });
    console.log(`[chapters] "${chapter.title}" -> project ${project.id} (${chapter.clips.length} clips)`);

    const failed: { clip: string; error: string }[] = [];
    let imported = 0;
    for (const tag of chapter.clips) {
      const sourcePath = path.join(SOURCE_ROOT, tag.dia, `${tag.clip}.mp4`);
      try {
        await ingestClipFile(project.id, sourcePath, `${tag.clip}.mp4`, req.signal, true);
        imported++;
      } catch (err) {
        failed.push({ clip: tag.clip, error: err instanceof Error ? err.message : String(err) });
        console.error(`[chapters] FAILED ${tag.clip}: ${err instanceof Error ? err.message : err}`);
      }
      done++;
      console.log(`[chapters] ${done}/${totalClips} done (${tag.clip})`);
    }

    results.push({ projectId: project.id, title: chapter.title, reason: chapter.reason, imported, failed });
  }
  console.log(`[chapters] finished: ${results.length} projects, ${done}/${totalClips} clips processed`);

  return Response.json({ chapters: results }, { status: 201 });
}
