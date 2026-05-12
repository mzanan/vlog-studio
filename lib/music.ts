import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Edl } from './edl';
import { projectDir } from './paths';

export type Energy = 'low' | 'mid' | 'high';

export type MusicBlock = {
  id: string;
  startSegmentIdx: number;
  endSegmentIdx: number;
  mood: string;
  energy: Energy;
  audioExt: string | null;
};

export function musicDir(projectId: string) {
  return path.join(projectDir(projectId), 'music');
}

export function musicAudioPath(projectId: string, block: MusicBlock): string | null {
  if (!block.audioExt) return null;
  return path.join(musicDir(projectId), `${block.id}${block.audioExt}`);
}

export function initBlocksFromEdl(edl: Edl): MusicBlock[] {
  if (edl.segments.length === 0) return [];
  // Default: un solo bloque cubre todos los segmentos.
  // El usuario divide donde realmente quiere un cambio de música.
  // El mood/energy inicial es el del primer segmento (es solo un punto de partida).
  const firstHint = edl.musicHints.find((h) => h.segmentIdx === 0);
  return [
    {
      id: randomUUID(),
      startSegmentIdx: 0,
      endSegmentIdx: edl.segments.length - 1,
      mood: firstHint?.mood ?? 'sin definir',
      energy: firstHint?.energy ?? 'mid',
      audioExt: null,
    },
  ];
}

// Sugerencias de Claude por segmento. La UI las muestra para que el usuario sepa dónde Claude proponía cambios.
export function hintForSegment(edl: Edl, segmentIdx: number) {
  return edl.musicHints.find((h) => h.segmentIdx === segmentIdx) ?? null;
}

export function isValidMusicBlocks(value: unknown): value is MusicBlock[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (b) =>
      b &&
      typeof b === 'object' &&
      typeof (b as MusicBlock).id === 'string' &&
      Number.isInteger((b as MusicBlock).startSegmentIdx) &&
      Number.isInteger((b as MusicBlock).endSegmentIdx) &&
      typeof (b as MusicBlock).mood === 'string' &&
      ['low', 'mid', 'high'].includes((b as MusicBlock).energy),
  );
}

export function splitBlockAt(blocks: MusicBlock[], blockId: string, atSegmentIdx: number): MusicBlock[] {
  const idx = blocks.findIndex((b) => b.id === blockId);
  if (idx === -1) return blocks;
  const target = blocks[idx];
  if (atSegmentIdx <= target.startSegmentIdx || atSegmentIdx > target.endSegmentIdx) return blocks;

  const left: MusicBlock = { ...target, endSegmentIdx: atSegmentIdx - 1, id: target.id };
  const right: MusicBlock = {
    id: randomUUID(),
    startSegmentIdx: atSegmentIdx,
    endSegmentIdx: target.endSegmentIdx,
    mood: target.mood,
    energy: target.energy,
    audioExt: null,
  };
  return [...blocks.slice(0, idx), left, right, ...blocks.slice(idx + 1)];
}

export function mergeWithNext(blocks: MusicBlock[], blockId: string): MusicBlock[] {
  const idx = blocks.findIndex((b) => b.id === blockId);
  if (idx === -1 || idx === blocks.length - 1) return blocks;
  const current = blocks[idx];
  const next = blocks[idx + 1];
  if (next.startSegmentIdx !== current.endSegmentIdx + 1) return blocks;
  const merged: MusicBlock = {
    ...current,
    endSegmentIdx: next.endSegmentIdx,
  };
  return [...blocks.slice(0, idx), merged, ...blocks.slice(idx + 2)];
}
