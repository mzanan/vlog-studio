// Diff entre el Edl actual del user y el Edl resuelto que produjo el LLM,
// devolviendo una lista de SuggestionBody. Cada body representa UN cambio
// discreto que el user puede aceptar o rechazar individualmente.
//
// Versión inicial: optimizada para el caso "user tiene default EDL (1 segment
// full-length por clip, sin VO ni música)". Si el user ya editó manualmente
// un clip, ese clip se skipea (no proponemos cambios sobre ediciones manuales).

import { Edl, EdlSegment, clampBrollSpeed } from './edl';
import { SuggestionBody, newSuggestion, Suggestion } from './suggestions';

export type DiffEntry = {
  body: SuggestionBody;
  rationale: string;
};

export function diffEdls(currentEdl: Edl, resolvedLlmEdl: Edl): DiffEntry[] {
  const entries: DiffEntry[] = [];

  const currentByClip = groupByClipId(currentEdl.segments);
  const llmByClip = groupByClipId(resolvedLlmEdl.segments);

  // Iterar en el orden de los clips del currentEdl (lo que el user ve).
  // Más + agregar clips presentes en LLM que no estén en current (edge: clip
  // nuevo que la AI inventó — improbable pero defensive).
  const seen = new Set<string>();
  for (const seg of currentEdl.segments) {
    if (seen.has(seg.clipId)) continue;
    seen.add(seg.clipId);
    diffClip(seg.clipId, currentByClip.get(seg.clipId) ?? [], llmByClip.get(seg.clipId) ?? [], entries);
  }

  // Música: solo proponemos sections si el user no tiene ninguna.
  if (currentEdl.music.sections.length === 0) {
    for (const sec of resolvedLlmEdl.music.sections) {
      const { id, ...rest } = sec;
      void id;
      entries.push({
        body: { type: 'add-music-section', data: { section: rest } },
        rationale: sec.reason || `${sec.mood} · ${sec.energy}`,
      });
    }
  }

  // Voiceover: solo proponemos si el user no tiene script.
  if (currentEdl.voiceover.fullScript === '' && resolvedLlmEdl.voiceover.fullScript !== '') {
    entries.push({
      body: {
        type: 'set-vo-script',
        data: { prevFullScript: '', newFullScript: resolvedLlmEdl.voiceover.fullScript },
      },
      rationale: 'AI propone un voiceover lineal',
    });
  }
  if (currentEdl.voiceover.cues.length === 0) {
    for (const cue of resolvedLlmEdl.voiceover.cues) {
      const preview = cue.text.slice(0, 60) + (cue.text.length > 60 ? '…' : '');
      entries.push({
        body: { type: 'add-vo-cue', data: { cue } },
        rationale: `Cue VO: ${preview}`,
      });
    }
  }

  return entries;
}

function groupByClipId(segments: EdlSegment[]): Map<string, EdlSegment[]> {
  const map = new Map<string, EdlSegment[]>();
  for (const seg of segments) {
    const arr = map.get(seg.clipId);
    if (arr) arr.push(seg);
    else map.set(seg.clipId, [seg]);
  }
  return map;
}

function diffClip(
  clipId: string,
  current: EdlSegment[],
  llm: EdlSegment[],
  out: DiffEntry[],
): void {
  // El user ya editó este clip a mano (múltiples segments) — no proponemos
  // cambios para no pisar su trabajo.
  if (current.length > 1) return;

  // Clip omitido por la AI (no debería pasar gracias al safety net en
  // resolveLlmEdl, pero defensive).
  if (current.length === 1 && llm.length === 0) {
    out.push({
      body: { type: 'hide-clip', data: { clipId } },
      rationale: 'AI sugiere omitir este clip entero',
    });
    return;
  }

  // current vacío (clip nuevo en LLM, edge case improbable) — skip por ahora.
  if (current.length === 0) return;

  const currentSeg = current[0];

  // Single segment match: posible trim sugerido.
  if (llm.length === 1) {
    const llmSeg = llm[0];
    if (sameRange(currentSeg, llmSeg)) return; // no change
    const isBroll = llmSeg.kind === 'broll';
    const cutReason = llmSeg.kind === 'clip' ? llmSeg.cutReason : '';
    const rangeChanged = currentSeg.inMs !== llmSeg.inMs || currentSeg.outMs !== llmSeg.outMs;
    const prevSpeed = isBroll ? (currentSeg.kind === 'broll' ? clampBrollSpeed(currentSeg.speed) : 1) : undefined;
    const newSpeed = isBroll ? clampBrollSpeed(llmSeg.speed) : undefined;
    const speedChanged = isBroll && prevSpeed !== newSpeed;
    let rationale = cutReason;
    if (!rationale) {
      if (rangeChanged && speedChanged) rationale = `AI propone recortar y acelerar a ${newSpeed}x`;
      else if (speedChanged) rationale = `AI propone acelerar a ${newSpeed}x, sin recortar`;
      else rationale = 'AI propone recortar este clip';
    }
    out.push({
      body: {
        type: 'trim-segment',
        data: {
          segmentId: currentSeg.id,
          prevInMs: currentSeg.inMs,
          prevOutMs: currentSeg.outMs,
          prevCutReason: currentSeg.kind === 'clip' ? currentSeg.cutReason : '',
          newInMs: llmSeg.inMs,
          newOutMs: llmSeg.outMs,
          newCutReason: cutReason,
          prevSpeed,
          newSpeed,
        },
      },
      rationale,
    });
    return;
  }

  // Multi-segment LLM: split sugerido.
  out.push({
    body: {
      type: 'split-segment',
      data: {
        segmentId: currentSeg.id,
        splits: llm.map((s) => ({
          inMs: s.inMs,
          outMs: s.outMs,
          cutReason: s.kind === 'clip' ? s.cutReason : '',
          speed: s.kind === 'broll' ? clampBrollSpeed(s.speed) : undefined,
        })),
      },
    },
    rationale: `AI propone partir este clip en ${llm.length} tramos`,
  });
}

function sameRange(a: EdlSegment, b: EdlSegment): boolean {
  if (a.inMs !== b.inMs || a.outMs !== b.outMs) return false;
  const aSpeed = a.kind === 'broll' ? clampBrollSpeed(a.speed) : 1;
  const bSpeed = b.kind === 'broll' ? clampBrollSpeed(b.speed) : 1;
  return aSpeed === bSpeed;
}

export function buildSuggestionsFromDiff(entries: DiffEntry[]): Suggestion[] {
  return entries.map((e) => newSuggestion(e.body, e.rationale));
}
