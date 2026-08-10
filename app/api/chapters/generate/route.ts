import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { generateChapters } from '@/lib/llm';
import { VisionTag, saveGrouping } from '@/lib/chapters';

const VISION_TAGS_DIR = path.resolve(process.cwd(), 'data', 'vision-tags');

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

export async function POST() {
  const tags = await loadVisionTags();
  if (tags.length === 0) {
    return Response.json({ error: 'no vision tags found' }, { status: 404 });
  }

  console.log(`[chapters] grouping ${tags.length} clips...`);
  const { chapters } = await generateChapters(tags);
  const grouping = await saveGrouping(chapters);
  console.log(`[chapters] saved grouping: ${chapters.length} chapters`);

  return Response.json({
    generatedAt: grouping.generatedAt,
    chapters: chapters.map((c) => ({ title: c.title, reason: c.reason, clipCount: c.clips.length })),
  });
}
