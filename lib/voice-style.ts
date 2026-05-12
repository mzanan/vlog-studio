import { prisma } from './db';

const MIN_WORDS = 8;
const MAX_WORDS = 25;
const TARGET_SAMPLES = 7;

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|(?<=\n)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

async function collectFromClips(where: { projectId?: string }): Promise<string[]> {
  const clips = await prisma.clip.findMany({
    where: { ...where, hasVoice: true, wordsPerSec: { gte: 1.5 } },
    include: { segments: { orderBy: { startMs: 'asc' } } },
  });
  const fullTexts = clips.map((c) => c.segments.map((s) => s.text).join(' '));
  const sentences = fullTexts.flatMap(splitIntoSentences);
  return sentences.filter((s) => {
    const w = countWords(s);
    return w >= MIN_WORDS && w <= MAX_WORDS;
  });
}

export async function sampleUserVoiceStyle(projectId: string): Promise<string[]> {
  const fromProject = await collectFromClips({ projectId });
  if (fromProject.length >= 3) return pickRandom(fromProject, TARGET_SAMPLES);
  const fromAny = await collectFromClips({});
  return pickRandom(fromAny, TARGET_SAMPLES);
}
