// AI suggestions como diffs aceptables sobre Project.edl.
// Cada Suggestion describe UN cambio aislado que el user puede aceptar o rechazar
// individualmente desde la timeline. `applySuggestion` es puro: toma el edl actual
// + una suggestion y devuelve el edl resultante (o tira si el target ya no existe).

import { randomUUID } from 'node:crypto';
import {
  Edl,
  EdlClipSegment,
  EdlBrollSegment,
  EdlSegment,
  EdlVoiceoverCue,
  Energy,
  MusicSection,
} from './edl';

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'stale';

export type TrimSegmentPayload = {
  segmentId: string;
  prevInMs: number;
  prevOutMs: number;
  prevCutReason: string;
  newInMs: number;
  newOutMs: number;
  newCutReason: string;
  prevSpeed?: number;
  newSpeed?: number;
};

export type SplitSegmentPayload = {
  segmentId: string;
  splits: Array<{ inMs: number; outMs: number; cutReason: string; speed?: number }>;
};

export type HideClipPayload = {
  clipId: string;
};

export type AddMusicSectionPayload = {
  section: Omit<MusicSection, 'id'>;
};

export type ReplaceMusicTrackPayload = {
  sectionId: string;
  prev: { query: string; mood: string; energy: Energy; baseVolume: number; reason: string };
  next: { query: string; mood: string; energy: Energy; baseVolume: number; reason: string };
};

export type SetVoScriptPayload = {
  prevFullScript: string;
  newFullScript: string;
};

export type AddVoCuePayload = {
  cue: EdlVoiceoverCue;
};

export type SuggestionBody =
  | { type: 'trim-segment'; data: TrimSegmentPayload }
  | { type: 'split-segment'; data: SplitSegmentPayload }
  | { type: 'hide-clip'; data: HideClipPayload }
  | { type: 'add-music-section'; data: AddMusicSectionPayload }
  | { type: 'replace-music-track'; data: ReplaceMusicTrackPayload }
  | { type: 'set-vo-script'; data: SetVoScriptPayload }
  | { type: 'add-vo-cue'; data: AddVoCuePayload };

export type SuggestionType = SuggestionBody['type'];

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type Suggestion = SuggestionBody & {
  id: string;
  status: SuggestionStatus;
  rationale: string;
  createdAt: string;
  chat?: ChatMessage[];
};

export function newSuggestion(body: SuggestionBody, rationale: string): Suggestion {
  return {
    id: randomUUID(),
    status: 'pending',
    rationale,
    createdAt: new Date().toISOString(),
    ...body,
  };
}

export function isValidSuggestionList(value: unknown): value is Suggestion[] {
  if (!Array.isArray(value)) return false;
  return value.every((s) => {
    if (!s || typeof s !== 'object') return false;
    const x = s as Partial<Suggestion>;
    return typeof x.id === 'string' && typeof x.type === 'string' && typeof x.status === 'string';
  });
}

export class SuggestionApplyError extends Error {
  constructor(
    message: string,
    public readonly reason: 'stale-target' | 'invalid-payload',
  ) {
    super(message);
  }
}

export function applyPendingSuggestions(edl: Edl, suggestions: Suggestion[]): Edl {
  let result = edl;
  for (const s of suggestions) {
    if (s.status !== 'pending') continue;
    try {
      result = applySuggestion(result, s);
    } catch (err) {
      if (!(err instanceof SuggestionApplyError)) throw err;
    }
  }
  return result;
}

export type BestMomentRange = { inMs: number; outMs: number };

export type AutoApplyResult = {
  edl: Edl;
  pending: Suggestion[];
  autoApplied: Suggestion[];
};

export function autoApplyBrollBestMoments(
  edl: Edl,
  newSuggestions: Suggestion[],
  bestMomentByClip: Map<string, BestMomentRange>,
): AutoApplyResult {
  const segmentById = new Map(edl.segments.map((s) => [s.id, s]));
  let result = edl;
  const pending: Suggestion[] = [];
  const autoApplied: Suggestion[] = [];
  for (const s of newSuggestions) {
    if (s.type !== 'trim-segment') {
      pending.push(s);
      continue;
    }
    const target = segmentById.get(s.data.segmentId);
    const best = target ? bestMomentByClip.get(target.clipId) : undefined;
    const isBrollBestMoment =
      target?.kind === 'broll' &&
      !target.userAdjusted &&
      !!best &&
      s.data.newInMs === best.inMs &&
      s.data.newOutMs === best.outMs;
    if (!isBrollBestMoment) {
      pending.push(s);
      continue;
    }
    try {
      result = applySuggestion(result, s);
      autoApplied.push({ ...s, status: 'accepted' });
    } catch (err) {
      if (err instanceof SuggestionApplyError) pending.push(s);
      else throw err;
    }
  }
  return { edl: result, pending, autoApplied };
}

function trimSuggestionsMatch(a: Suggestion, b: Suggestion): boolean {
  if (a.type !== 'trim-segment' || b.type !== 'trim-segment') return false;
  return (
    a.data.segmentId === b.data.segmentId &&
    a.data.newInMs === b.data.newInMs &&
    a.data.newOutMs === b.data.newOutMs
  );
}

export function dropDuplicateAcceptedTrims(older: Suggestion[], autoApplied: Suggestion[]): Suggestion[] {
  return older.filter((s) => {
    if (s.status !== 'accepted' || s.type !== 'trim-segment') return true;
    return !autoApplied.some((a) => trimSuggestionsMatch(a, s));
  });
}

export function dropRejectedDuplicateTrims(older: Suggestion[], pending: Suggestion[]): Suggestion[] {
  const rejectedTrims = older.filter((s) => s.status === 'rejected' && s.type === 'trim-segment');
  return pending.filter((s) => {
    if (s.type !== 'trim-segment') return true;
    return !rejectedTrims.some((r) => trimSuggestionsMatch(r, s));
  });
}

export function applySuggestion(edl: Edl, suggestion: Suggestion): Edl {
  switch (suggestion.type) {
    case 'trim-segment':
      return applyTrimSegment(edl, suggestion.data);
    case 'split-segment':
      return applySplitSegment(edl, suggestion.data);
    case 'hide-clip':
      return applyHideClip(edl, suggestion.data);
    case 'add-music-section':
      return applyAddMusicSection(edl, suggestion.data);
    case 'replace-music-track':
      return applyReplaceMusicTrack(edl, suggestion.data);
    case 'set-vo-script':
      return applySetVoScript(edl, suggestion.data);
    case 'add-vo-cue':
      return applyAddVoCue(edl, suggestion.data);
  }
}

function applyTrimSegment(edl: Edl, p: TrimSegmentPayload): Edl {
  const idx = edl.segments.findIndex((s) => s.id === p.segmentId);
  if (idx < 0) throw new SuggestionApplyError(`segment ${p.segmentId} does not exist`, 'stale-target');
  const prev = edl.segments[idx];
  const next: EdlSegment =
    prev.kind === 'clip'
      ? { ...prev, inMs: p.newInMs, outMs: p.newOutMs, cutReason: p.newCutReason }
      : { ...prev, inMs: p.newInMs, outMs: p.newOutMs, speed: p.newSpeed ?? prev.speed };
  const segments = [...edl.segments];
  segments[idx] = next;
  return { ...edl, segments };
}

function applySplitSegment(edl: Edl, p: SplitSegmentPayload): Edl {
  const idx = edl.segments.findIndex((s) => s.id === p.segmentId);
  if (idx < 0) throw new SuggestionApplyError(`segment ${p.segmentId} does not exist`, 'stale-target');
  if (p.splits.length === 0) throw new SuggestionApplyError('empty splits', 'invalid-payload');
  const prev = edl.segments[idx];
  const newPieces: EdlSegment[] = p.splits.map((s) => {
    if (prev.kind === 'clip') {
      const out: EdlClipSegment = {
        id: randomUUID(),
        kind: 'clip',
        clipId: prev.clipId,
        inMs: s.inMs,
        outMs: s.outMs,
        cutReason: s.cutReason,
      };
      return out;
    }
    const out: EdlBrollSegment = {
      id: randomUUID(),
      kind: 'broll',
      clipId: prev.clipId,
      inMs: s.inMs,
      outMs: s.outMs,
      speed: s.speed ?? prev.speed,
      userAdjusted: prev.userAdjusted,
    };
    return out;
  });
  const segments = [...edl.segments.slice(0, idx), ...newPieces, ...edl.segments.slice(idx + 1)];
  return { ...edl, segments };
}

function applyHideClip(edl: Edl, p: HideClipPayload): Edl {
  const segments = edl.segments.filter((s) => s.clipId !== p.clipId);
  if (segments.length === edl.segments.length) {
    throw new SuggestionApplyError(`clip ${p.clipId} is no longer in the timeline`, 'stale-target');
  }
  return { ...edl, segments };
}

function applyAddMusicSection(edl: Edl, p: AddMusicSectionPayload): Edl {
  const newSection: MusicSection = { ...p.section, id: randomUUID() };
  const sections = [...edl.music.sections, newSection].sort((a, b) => a.startMs - b.startMs);
  return { ...edl, music: { sections } };
}

function applyReplaceMusicTrack(edl: Edl, p: ReplaceMusicTrackPayload): Edl {
  const idx = edl.music.sections.findIndex((s) => s.id === p.sectionId);
  if (idx < 0) throw new SuggestionApplyError(`section ${p.sectionId} does not exist`, 'stale-target');
  const prev = edl.music.sections[idx];
  const next: MusicSection = {
    ...prev,
    query: p.next.query,
    mood: p.next.mood,
    energy: p.next.energy,
    baseVolume: p.next.baseVolume,
    reason: p.next.reason,
    // invalida el track populado (hay que re-buscar en Jamendo para la query nueva).
    trackId: undefined,
    trackUrl: undefined,
    trackTitle: undefined,
    trackArtist: undefined,
    trackLicenseUrl: undefined,
  };
  const sections = [...edl.music.sections];
  sections[idx] = next;
  return { ...edl, music: { sections } };
}

function applySetVoScript(edl: Edl, p: SetVoScriptPayload): Edl {
  return { ...edl, voiceover: { ...edl.voiceover, fullScript: p.newFullScript } };
}

function applyAddVoCue(edl: Edl, p: AddVoCuePayload): Edl {
  const cues = [...edl.voiceover.cues, p.cue].sort((a, b) => a.startMs - b.startMs);
  return { ...edl, voiceover: { ...edl.voiceover, cues } };
}
