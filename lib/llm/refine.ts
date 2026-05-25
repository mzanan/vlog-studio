// Refinement de una suggestion existente via chat con el LLM.
// El user pide cambios sobre una propuesta puntual; el modelo devuelve
// reply conversacional + opcionalmente un updatedPayload tipado.

import { GoogleGenAI } from '@google/genai';
import { Edl } from '../edl';
import { ChatMessage, Suggestion, SuggestionType } from '../suggestions';

export type ClipContext = {
  id: string;
  filename: string;
  durationMs: number;
  words: Array<{ wordIndex: number; startMs: number; endMs: number; text: string }>;
};

export type RefineInput = {
  suggestion: Suggestion;
  edl: Edl;
  // Mapeo clipId → context. Solo se popula para los clips relevantes (target del segment).
  clipContexts: Record<string, ClipContext>;
  userMessage: string;
};

export type RefineResult = {
  reply: string;
  updatedPayload: Record<string, unknown> | null;
};

const REFINE_SYSTEM = `Estás refinando una sugerencia editorial existente en un editor de vlogs. El usuario te va a pedir cambios puntuales sobre la sugerencia actual.

Devolvé únicamente JSON con esta forma:
{
  "reply": "texto conversacional corto para mostrar al usuario, en español, explicando qué hiciste o respondiendo su pregunta",
  "updatedPayload": null | { ...campos nuevos de la sugerencia... }
}

Si el usuario pide un cambio concreto, devolvé updatedPayload con los campos modificados. Si solo está preguntando algo o no querés cambiar nada, devolvé updatedPayload: null y respondé en reply.

Los campos de updatedPayload por type:
- trim-segment: { newInMs: int, newOutMs: int, newCutReason: string }
- split-segment: { splits: [{ inMs: int, outMs: int, cutReason: string }, ...] }
- hide-clip: no hay payload a refinar (si el user no quiere ocultar, mejor que rechace la sugerencia directamente — explicaselo en reply y devolvé updatedPayload: null)
- add-music-section: { section: { startMs: int, endMs: int, query: string, mood: string, energy: "low"|"mid"|"high", baseVolume: number, reason: string } }
- replace-music-track: { next: { query: string, mood: string, energy: "low"|"mid"|"high", baseVolume: number, reason: string } }
- set-vo-script: { newFullScript: string }
- add-vo-cue: { cue: { startMs: int, endMs: int, text: string } }

Si el usuario te pide algo que no podés hacer con el payload disponible (ej. "movelo a otro clip" en un trim-segment), explicale en reply qué sí podés hacer.

Los timestamps que devolvés tienen que estar dentro del rango del clip / sección / vlog. Para trim-segment / split-segment, los timestamps refieren al clip original (no al edl final).`;

function payloadSummary(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case 'trim-segment':
      return `Recortar segment ${suggestion.data.segmentId} de ${suggestion.data.newInMs}ms a ${suggestion.data.newOutMs}ms (era ${suggestion.data.prevInMs}-${suggestion.data.prevOutMs}). cutReason: "${suggestion.data.newCutReason}"`;
    case 'split-segment':
      return `Partir segment ${suggestion.data.segmentId} en ${suggestion.data.splits.length} pedazos: ${JSON.stringify(suggestion.data.splits)}`;
    case 'hide-clip':
      return `Omitir clip entero ${suggestion.data.clipId}`;
    case 'add-music-section':
      return `Agregar music section: ${JSON.stringify(suggestion.data.section)}`;
    case 'replace-music-track':
      return `Cambiar section ${suggestion.data.sectionId} de "${suggestion.data.prev.query}" a "${suggestion.data.next.query}" (${suggestion.data.next.mood}, ${suggestion.data.next.energy})`;
    case 'set-vo-script':
      return `Setear fullScript a:\n${suggestion.data.newFullScript}`;
    case 'add-vo-cue':
      return `Agregar VO cue en [${suggestion.data.cue.startMs}ms, ${suggestion.data.cue.endMs}ms]: "${suggestion.data.cue.text}"`;
  }
}

function relevantClipIds(suggestion: Suggestion, edl: Edl): string[] {
  switch (suggestion.type) {
    case 'trim-segment':
    case 'split-segment': {
      const seg = edl.segments.find((s) => s.id === suggestion.data.segmentId);
      return seg ? [seg.clipId] : [];
    }
    case 'hide-clip':
      return [suggestion.data.clipId];
    default:
      return [];
  }
}

function renderClipContext(ctx: ClipContext): string {
  const words = ctx.words
    .map((w) => `[${w.wordIndex}] (${w.startMs}-${w.endMs}ms) ${w.text}`)
    .join(' ');
  return `Clip ${ctx.filename} (id=${ctx.id}, duración=${ctx.durationMs}ms)\nPalabras: ${words || '(b-roll sin habla)'}`;
}

function buildUserMessage(input: RefineInput): string {
  const { suggestion, edl, clipContexts, userMessage } = input;
  const lines: string[] = [];
  lines.push(`Tipo de sugerencia: ${suggestion.type}`);
  lines.push(`Rationale original: ${suggestion.rationale}`);
  lines.push(`Payload actual: ${payloadSummary(suggestion)}`);

  const clipIds = relevantClipIds(suggestion, edl);
  if (clipIds.length > 0) {
    lines.push('');
    lines.push('Clips relevantes:');
    for (const id of clipIds) {
      const ctx = clipContexts[id];
      if (ctx) lines.push(renderClipContext(ctx));
    }
  }

  if (suggestion.type === 'add-music-section' || suggestion.type === 'replace-music-track' || suggestion.type === 'add-vo-cue') {
    lines.push('');
    lines.push(`Vlog total: ${edl.segments.length} segments, duración estimada ${edl.segments.reduce((a, s) => a + (s.outMs - s.inMs), 0)}ms`);
  }

  if (suggestion.chat && suggestion.chat.length > 0) {
    lines.push('');
    lines.push('Historia del chat (incluí en tu razonamiento):');
    for (const m of suggestion.chat) {
      lines.push(`[${m.role}] ${m.content}`);
    }
  }

  lines.push('');
  lines.push(`Nuevo mensaje del usuario: ${userMessage}`);
  lines.push('');
  lines.push('Devolvé solo JSON con la forma { reply, updatedPayload }.');
  return lines.join('\n');
}

export async function refineSuggestion(input: RefineInput): Promise<RefineResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  const response = await ai.models.generateContent({
    model,
    contents: buildUserMessage(input),
    config: {
      systemInstruction: REFINE_SYSTEM,
      responseMimeType: 'application/json',
      temperature: 0.5,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini devolvió respuesta vacía');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini devolvió JSON inválido: ${text.slice(0, 300)}`);
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('JSON no es objeto');
  const obj = parsed as { reply?: unknown; updatedPayload?: unknown };
  if (typeof obj.reply !== 'string') throw new Error('reply faltante o inválido');

  const updatedPayload =
    obj.updatedPayload && typeof obj.updatedPayload === 'object'
      ? (obj.updatedPayload as Record<string, unknown>)
      : null;

  return { reply: obj.reply, updatedPayload };
}

export function mergeUpdatedPayload(
  type: SuggestionType,
  currentData: Record<string, unknown>,
  updated: Record<string, unknown>,
): Record<string, unknown> {
  switch (type) {
    case 'trim-segment': {
      const merged = { ...currentData };
      if (typeof updated.newInMs === 'number') merged.newInMs = Math.round(updated.newInMs);
      if (typeof updated.newOutMs === 'number') merged.newOutMs = Math.round(updated.newOutMs);
      if (typeof updated.newCutReason === 'string') merged.newCutReason = updated.newCutReason;
      return merged;
    }
    case 'split-segment': {
      if (!Array.isArray(updated.splits)) return currentData;
      const splits = updated.splits
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({
          inMs: typeof s.inMs === 'number' ? Math.round(s.inMs) : 0,
          outMs: typeof s.outMs === 'number' ? Math.round(s.outMs) : 0,
          cutReason: typeof s.cutReason === 'string' ? s.cutReason : '',
        }));
      return { ...currentData, splits };
    }
    case 'hide-clip':
      return currentData;
    case 'add-music-section': {
      if (!updated.section || typeof updated.section !== 'object') return currentData;
      const sec = updated.section as Record<string, unknown>;
      const prevSection = (currentData as { section: Record<string, unknown> }).section;
      const merged = { ...prevSection };
      for (const key of ['startMs', 'endMs', 'baseVolume'] as const) {
        if (typeof sec[key] === 'number') merged[key] = sec[key];
      }
      for (const key of ['query', 'mood', 'reason'] as const) {
        if (typeof sec[key] === 'string') merged[key] = sec[key];
      }
      if (sec.energy === 'low' || sec.energy === 'mid' || sec.energy === 'high') merged.energy = sec.energy;
      // Invalidar track populado — la query cambió.
      delete merged.trackId;
      delete merged.trackUrl;
      delete merged.trackTitle;
      delete merged.trackArtist;
      delete merged.trackLicenseUrl;
      return { ...currentData, section: merged };
    }
    case 'replace-music-track': {
      if (!updated.next || typeof updated.next !== 'object') return currentData;
      const nx = updated.next as Record<string, unknown>;
      const prevNext = (currentData as { next: Record<string, unknown> }).next;
      const merged = { ...prevNext };
      for (const key of ['baseVolume'] as const) {
        if (typeof nx[key] === 'number') merged[key] = nx[key];
      }
      for (const key of ['query', 'mood', 'reason'] as const) {
        if (typeof nx[key] === 'string') merged[key] = nx[key];
      }
      if (nx.energy === 'low' || nx.energy === 'mid' || nx.energy === 'high') merged.energy = nx.energy;
      return { ...currentData, next: merged };
    }
    case 'set-vo-script': {
      if (typeof updated.newFullScript !== 'string') return currentData;
      return { ...currentData, newFullScript: updated.newFullScript };
    }
    case 'add-vo-cue': {
      if (!updated.cue || typeof updated.cue !== 'object') return currentData;
      const cue = updated.cue as Record<string, unknown>;
      const prevCue = (currentData as { cue: Record<string, unknown> }).cue;
      const merged = { ...prevCue };
      if (typeof cue.startMs === 'number') merged.startMs = Math.round(cue.startMs);
      if (typeof cue.endMs === 'number') merged.endMs = Math.round(cue.endMs);
      if (typeof cue.text === 'string') merged.text = cue.text;
      return { ...currentData, cue: merged };
    }
  }
}
