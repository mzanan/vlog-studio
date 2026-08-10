import { generateChapters } from '@/lib/llm';
import { loadVisionTags, saveGrouping } from '@/lib/chapters';

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
