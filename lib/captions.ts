import { EdlSegment } from './edl';

export type TranscriptWord = {
  clipId: string;
  startMs: number;
  endMs: number;
  text: string;
  wordIndex: number;
};

export type CaptionCue = {
  startFrame: number;
  endFrame: number;
  text: string;
};

export type BuildCaptionsInput = {
  segments: EdlSegment[];
  segmentFrames: number[];
  words: TranscriptWord[];
  fps: number;
};

const MAX_WORDS_PER_CUE = 4;
const MAX_GAP_MS = 700;
const MIN_CUE_FRAMES = 3;

function wordsByClip(words: TranscriptWord[]): Map<string, TranscriptWord[]> {
  const map = new Map<string, TranscriptWord[]>();
  for (const w of words) {
    const list = map.get(w.clipId);
    if (list) list.push(w);
    else map.set(w.clipId, [w]);
  }
  for (const list of map.values()) list.sort((a, b) => a.startMs - b.startMs || a.wordIndex - b.wordIndex);
  return map;
}

function chunkWords(words: TranscriptWord[]): TranscriptWord[][] {
  const chunks: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (const word of words) {
    const previous = current[current.length - 1];
    const gapTooBig = previous ? word.startMs - previous.endMs > MAX_GAP_MS : false;
    if (current.length >= MAX_WORDS_PER_CUE || gapTooBig) {
      chunks.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function buildCaptions(input: BuildCaptionsInput): CaptionCue[] {
  const { segments, segmentFrames, words, fps } = input;
  const byClip = wordsByClip(words);
  const cues: CaptionCue[] = [];

  let frameCursor = 0;
  for (const [idx, seg] of segments.entries()) {
    const durationFrames = segmentFrames[idx] ?? 0;
    if (seg.kind !== 'clip') {
      frameCursor += durationFrames;
      continue;
    }
    const clipWords = (byClip.get(seg.clipId) ?? []).filter(
      (w) => w.endMs > seg.inMs && w.startMs < seg.outMs,
    );
    for (const chunk of chunkWords(clipWords)) {
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      const startOffset = Math.round(((Math.max(first.startMs, seg.inMs) - seg.inMs) / 1000) * fps);
      const endOffset = Math.round(((Math.min(last.endMs, seg.outMs) - seg.inMs) / 1000) * fps);
      const startFrame = frameCursor + Math.max(0, Math.min(startOffset, durationFrames));
      const rawEnd = frameCursor + Math.max(0, Math.min(endOffset, durationFrames));
      const endFrame = Math.min(frameCursor + durationFrames, Math.max(rawEnd, startFrame + MIN_CUE_FRAMES));
      if (endFrame <= startFrame) continue;
      const text = chunk.map((w) => w.text.trim()).filter(Boolean).join(' ');
      if (!text) continue;
      cues.push({ startFrame, endFrame, text });
    }
    frameCursor += durationFrames;
  }

  return cues;
}
