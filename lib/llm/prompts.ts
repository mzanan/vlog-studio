import { randomUUID } from 'node:crypto';
import {
  Edl,
  EdlBrollSegment,
  EdlClipSegment,
  EdlVoiceoverCue,
  Energy,
  MusicSection,
  clampBrollSpeed,
  defaultBaseVolumeFor,
  estimateVoiceoverDurationMs,
  playbackDurationMs,
} from '../edl';
import { VisionTag } from '../chapters';

export type ClipWord = {
  wordIndex: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type ClipVisionTag = Pick<VisionTag, 'escena' | 'lugar_tipo' | 'tipo_plano' | 'movimiento' | 'fuerza_visual'>;

export type ClipBestMoment = {
  inMs: number;
  outMs: number;
  reason: string;
};

export type ClipForPlanning = {
  id: string;
  filename: string;
  kind: 'a-camara' | 'b-roll';
  durationMs: number;
  words: ClipWord[];
  visionTag?: ClipVisionTag;
  bestMoment?: ClipBestMoment;
};

export type PlanInput = {
  intent: string;
  targetDurationSec: number | null;
  clips: ClipForPlanning[];
  voiceStyleSamples: string[];
  cutPreset: CutPreset;
};

// Shape intermedio que devuelve el LLM. Usa segmentIdx en vez de tiempos absolutos
// porque sumar durations es trabajo del server, no del modelo.
//
// Clips a-cámara cortan por wordIdx (precisión word-level de Whisper).
// B-roll corta por inMs/outMs porque no tiene transcript.
export type LlmClipSegment = {
  kind: 'clip';
  clipId: string;
  keepFromWordIdx: number; // inclusivo, refiere al wordIndex de la lista del clip
  keepToWordIdx: number; // inclusivo
  cutReason: string;
};

export type LlmBrollSegment = {
  kind: 'broll';
  clipId: string;
  inMs: number;
  outMs: number;
  speed: number;
};

export type LlmSegment = LlmClipSegment | LlmBrollSegment;

export type LlmVoiceoverCue = {
  startSegmentIdx: number; // 0-based sobre segments[]
  text: string; // estimamos duración nosotros via wps
};

export type LlmMusicSection = {
  startSegmentIdx: number;
  endSegmentIdx: number;
  query: string;
  mood: string;
  energy: Energy;
  baseVolume?: number;
  reason: string;
};

export type LlmEdl = {
  segments: LlmSegment[];
  voiceover: { fullScript: string; cues: LlmVoiceoverCue[] };
  music: { sections: LlmMusicSection[] };
};

export type CutPreset = 'conservative' | 'balanced' | 'aggressive';
export const CUT_PRESETS: CutPreset[] = ['conservative', 'balanced', 'aggressive'];
export const DEFAULT_CUT_PRESET: CutPreset = 'balanced';
export function isValidCutPreset(value: unknown): value is CutPreset {
  return typeof value === 'string' && (CUT_PRESETS as string[]).includes(value);
}

const CUT_POLICY_CONSERVATIVE = `   POLÍTICA DE CORTES — CONSERVADOR (el user pidió tocar lo MÍNIMO posible):
   - Por default, mantené cada clip casi entero. Tu única tarea editorial es **limpiar bordes**.
   - Recortá silencios y pausas largas SOLO al principio y al final del clip (antes de la primera palabra útil, después de la última).
   - Si el clip arranca o termina con UNA muletilla obvia ("eh", "uhm"), recortala. Si están en el medio, **dejalas**.
   - **No partas clips.** Emití UN solo segment por clipId.
   - **No saques tangentes ni tramos del medio.** El user va a editar a mano si quiere más.
   - **Mantené pausas naturales del medio** — son parte del ritmo del user.
   - cutReason: breve, descriptivo del recorte de borde. Ejemplos: "silencio inicial", "muletilla 'eh' al final", "(sin recorte — clip entero)".`;

const CUT_POLICY_BALANCED = `   POLÍTICA DE CORTES — BALANCEADO (default — limpieza ordinaria sin tocar el contenido):
   - Recortá bordes (silencios y muletillas al inicio/final).
   - Sacá muletillas obvias del medio: "eh", "uhm", "este" — sólo cuando son claramente disfluencias, no si son parte del fraseo natural.
   - Sacá pausas > 1.5s del medio (las marcadas como "(Xs pausa)" con X ≥ 1.5).
   - Sacá repeticiones obvias y arranques fallidos ("la la la verdad…" → "la verdad").
   - **No saques tangentes** — el user decide después si quiere acortar más.
   - Si necesitás sacar un tramo del medio (ej. pausa larga + repetición), emití dos segments del mismo clipId CONSECUTIVOS. Ejemplo: clip [0] Hola [1] estoy [2] (3s pausa) [3] eh [4] estoy [5] en [6] Bariloche → dos segments: keepFromWordIdx=0 keepToWordIdx=1 (Hola estoy), keepFromWordIdx=5 keepToWordIdx=6 (en Bariloche).
   - cutReason: razón editorial breve. Ejemplos: "muletilla 'eh' inicial", "pausa muerta de 3s", "repetición de 'estoy'".`;

const CUT_POLICY_AGGRESSIVE = `   POLÍTICA DE CORTES — AGRESIVO (el user quiere un vlog rápido y dinámico):
   - Recortá bordes a tope (cualquier silencio o muletilla en el inicio/final).
   - Sacá TODAS las muletillas del medio: "eh", "uhm", "este", "tipo", "o sea", "viste", "bueno", "nada".
   - Sacá pausas > 500ms (cualquier "(Xs pausa)" con X ≥ 0.5).
   - Sacá repeticiones, arranques fallidos, frases incompletas.
   - **Sacá tangentes** que no aporten al hilo narrativo del vlog.
   - Apuntá a un vlog dinámico — densidad de información alta, sin tiempo muerto.
   - Si querés sacar tramos del medio, emití múltiples segments del mismo clipId CONSECUTIVOS (mismo formato que en balanceado).
   - cutReason: razón editorial breve. Ejemplos: "tangente sin retorno", "muletilla 'o sea'", "pausa muerta", "frase abandonada", "duplica info previa".`;

function cutPolicyFor(preset: CutPreset): string {
  if (preset === 'conservative') return CUT_POLICY_CONSERVATIVE;
  if (preset === 'aggressive') return CUT_POLICY_AGGRESSIVE;
  return CUT_POLICY_BALANCED;
}

export function buildPlannerSystem(preset: CutPreset = DEFAULT_CUT_PRESET): string {
  return `Eres un editor de video experto armando un vlog a partir de clips raw del usuario. Tu objetivo es storytelling, no solo ensamblar.

Recibís:
- Intent del usuario (tono, duración aproximada).
- Lista de clips. Cada clip a-cámara viene con su transcript palabra por palabra, donde cada palabra tiene un índice [N]. Pausas largas entre palabras (>500ms) están anotadas como "(Xs pausa)".
- Clips b-roll vienen sin transcript (van silenciados, los usás para cubrir VO).
- Muestras del estilo de habla del usuario (frases reales suyas). El voiceover que escribas tiene que sonar como esas frases: mismo vocabulario, muletillas características, ritmo. NO uses lenguaje neutro de doblaje.

Devolvés un Edit Decision List intermedio en JSON. Reglas:

1. SEGMENTS — REGLA DE ORDEN ESTRICTA Y DE COBERTURA:
   - **Respetá el orden de entrada de los clips. NO reordenes.** Si en el input vienen [clipA, clipB, clipC], en tu output todos los segments de clipA van antes que cualquier segment de clipB, y todos los de clipB antes que cualquier segment de clipC.
   - **NUNCA intercales segments de clips distintos.** Si emitís múltiples segments del mismo clipId, tienen que aparecer CONSECUTIVOS en el output.
   - **TODOS los clips del input tienen que aparecer en el output al menos una vez.** No descartes clips. El user decide después si lo deja o no. Tu rol es sugerir, no imponer.

   "clip" (clips a-cámara): cortás por índice de palabra. keepFromWordIdx y keepToWordIdx son INCLUSIVOS y refieren a la numeración [N] del transcript.

${cutPolicyFor(preset)}

   "broll" (clips b-roll): el rango temporal (inMs/outMs) YA está decidido por el sistema con un criterio de mejor-momento (ffmpeg + visión) cuando ese dato está disponible ("mejor momento" en el listado de clips). Vos NO elegís el rango: emití siempre inMs=0, outMs=durationMs para b-roll, el server lo reemplaza por el rango ya decidido. Igual aplican las reglas de orden.

   Sí decidís speed según el tag de visión (escena, tipo_plano, movimiento, fuerza_visual 1-10):
   - fuerza_visual 8-10: clip fuerte, speed=1.
   - fuerza_visual 5-7: clip correcto pero no memorable, speed=1, salvo que dure más de 4s, en cuyo caso podés acelerarlo a speed=1.5.
   - fuerza_visual 1-4: filler débil, acelerá a speed=2-3 (el user prefiere ver todo el material a que la AI descarte contenido).
   - Sin tag de visión: sin base para decidir, speed=1.
   speed siempre entre 1 y 3.

2. VOICEOVER — UN SOLO script lineal con cues, no fragmentos sueltos:
   - fullScript: el texto completo que el usuario va a grabar de UNA sola toma. Tiene que fluir, conectar ideas entre clips, sonar natural en el estilo del usuario.
   - cues: subdivisiones del fullScript con el segmentIdx donde cada una entra. startSegmentIdx es el índice (0-based) sobre tu lista de segments. Cada cue queda alineada al inicio de ese segment.
   - El VO va MAYORMENTE sobre segments tipo "broll". Si hay un clip a-cámara fuerte, dejá el VO afuera de ese tramo (no pongas cue ahí).

3. MUSIC.SECTIONS — música por arcos narrativos, no por clip:
   - Cantidad: aprox 1 sección cada 3-5 minutos. Vlog corto (<3min) → 1 sección. Vlog medio (3-8min) → 1-2. Largo (8-15min) → 2-4. Muy largo (>15min) → 3-5. Nunca 1 por segmento.
   - startSegmentIdx/endSegmentIdx (inclusivo) definen sobre qué segments suena esa pista.
   - Podés DEJAR HUECOS entre secciones para silencio intencional (ej. momento dramático sin música). Solo tenés que omitir esas posiciones — no inventes una "sección silencio".
   - query: 2-5 tags en INGLÉS estilo Pixabay separados por espacios (ej. "calm acoustic travel", "uplifting energetic adventure", "lo-fi chill hip-hop"). Pixabay busca por tags reales.
   - mood: descripción corta en español.
   - energy: low | mid | high.
   - baseVolume: opcional 0..1; si no lo ponés se infiere del energy.
   - reason: por qué cambiás de pista o por qué dejás silencio acá ("intro contemplativa", "clímax energético", "outro reflexivo", "respiro narrativo sin música").

4. Apuntá a la duración target ±20%.

5. Si solo hay clips b-roll sin transcripts, el VO carga todo el peso narrativo: escribilo más denso.`;
}

// Backwards-compat: el balanceado es el default. Usado por `buildManualPrompt`.
export const PLANNER_SYSTEM = buildPlannerSystem(DEFAULT_CUT_PRESET);

export const EDL_JSON_SHAPE = `{
  "segments": [
    { "kind": "clip",  "clipId": "string", "keepFromWordIdx": 0, "keepToWordIdx": 0, "cutReason": "string" },
    { "kind": "broll", "clipId": "string", "inMs": 0, "outMs": 0, "speed": 1 }
  ],
  "voiceover": {
    "fullScript": "texto completo en español, tono del usuario",
    "cues": [
      { "startSegmentIdx": 0, "text": "fragmento que arranca cuando empieza el segment 0" }
    ]
  },
  "music": {
    "sections": [
      {
        "startSegmentIdx": 0,
        "endSegmentIdx": 3,
        "query": "tags en ingles separados por espacio",
        "mood": "string",
        "energy": "low" | "mid" | "high",
        "baseVolume": 0.15,
        "reason": "string"
      }
    ]
  }
}`;

const PAUSE_THRESHOLD_MS = 500;

function renderWordsWithGaps(words: ClipWord[]): string {
  if (words.length === 0) return '(sin habla)';
  const parts: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i > 0) {
      const gapMs = w.startMs - words[i - 1].endMs;
      if (gapMs >= PAUSE_THRESHOLD_MS) {
        parts.push(`(${(gapMs / 1000).toFixed(1)}s pausa)`);
      }
    }
    parts.push(`[${w.wordIndex}] ${w.text}`);
  }
  return parts.join(' ');
}

function renderVisionTag(tag: ClipVisionTag | undefined): string {
  if (!tag) return '(sin datos, sin base para decidir, dejalo entero a speed=1)';
  return `escena="${tag.escena}", lugar=${tag.lugar_tipo}, plano=${tag.tipo_plano}, movimiento=${tag.movimiento}, fuerza_visual=${tag.fuerza_visual}/10`;
}

function renderBestMoment(bestMoment: ClipBestMoment | undefined): string {
  if (!bestMoment) return '(sin dato, el rango queda en manos del server, no decidas vos)';
  return `${bestMoment.inMs}-${bestMoment.outMs}ms, razón: ${bestMoment.reason}`;
}

export function buildUserMessage(input: PlanInput): string {
  const lines: string[] = [];
  lines.push(`Intent del vlog: ${input.intent || '(sin especificar)'}`);
  if (input.targetDurationSec) lines.push(`Duración objetivo: ${input.targetDurationSec}s`);

  lines.push('');
  lines.push('Estilo del usuario (frases reales suyas — escribí el voiceover en este tono):');
  if (input.voiceStyleSamples.length === 0) {
    lines.push('(sin muestras disponibles — usá un tono casual en español rioplatense)');
  } else {
    for (const sample of input.voiceStyleSamples) {
      lines.push(`- ${sample}`);
    }
  }

  lines.push('');
  lines.push('Clips disponibles:');
  for (const clip of input.clips) {
    lines.push('');
    lines.push('---');
    lines.push(`id: ${clip.id}`);
    lines.push(`kind: ${clip.kind}`);
    lines.push(`duracionMs: ${clip.durationMs}`);
    lines.push(`filename: ${clip.filename}`);
    if (clip.kind === 'a-camara') {
      lines.push(`palabras (${clip.words.length}): ${renderWordsWithGaps(clip.words)}`);
    } else {
      lines.push(`transcript: (b-roll, sin habla)`);
      lines.push(`tag de visión: ${renderVisionTag(clip.visionTag)}`);
      lines.push(`mejor momento (ya decidido por el sistema): ${renderBestMoment(clip.bestMoment)}`);
    }
  }

  lines.push('');
  lines.push('Devolvé únicamente JSON válido con este shape exacto (sin markdown, sin comentarios):');
  lines.push(EDL_JSON_SHAPE);
  return lines.join('\n');
}

// Convierte el shape intermedio en un Edl v2 con timestamps absolutos.
// El server hace la aritmética para que el LLM no tenga que.
//
// Para clips a-cámara: resuelve keepFromWordIdx/keepToWordIdx a inMs/outMs
// usando los word-timestamps de Whisper. Para b-roll: usa inMs/outMs directo.
function brollRangeFor(clip: ClipForPlanning): { inMs: number; outMs: number } {
  const best = clip.bestMoment;
  const valid =
    best !== undefined &&
    Number.isFinite(best.inMs) &&
    Number.isFinite(best.outMs) &&
    best.inMs >= 0 &&
    best.outMs > best.inMs &&
    best.outMs <= clip.durationMs;
  return valid ? { inMs: best.inMs, outMs: best.outMs } : { inMs: 0, outMs: clip.durationMs };
}

export function resolveLlmEdl(llm: LlmEdl, input: PlanInput): Edl {
  const clipsById = new Map(input.clips.map((c) => [c.id, c]));
  const clipOrder = new Map(input.clips.map((c, i) => [c.id, i]));

  // Resolver cada LLM segment al shape persistido, manteniendo el índice original
  // para poder remapear cues/music después del reorder.
  const resolved = llm.segments
    .map((s, origIdx): { seg: EdlClipSegment | EdlBrollSegment; origIdx: number } | null => {
      if (s.kind === 'clip') {
        const clip = clipsById.get(s.clipId);
        if (!clip || clip.words.length === 0) return null;
        const fromIdx = Math.max(0, Math.min(s.keepFromWordIdx, clip.words.length - 1));
        const toIdx = Math.max(fromIdx, Math.min(s.keepToWordIdx, clip.words.length - 1));
        const fromWord = clip.words.find((w) => w.wordIndex === fromIdx) ?? clip.words[fromIdx];
        const toWord = clip.words.find((w) => w.wordIndex === toIdx) ?? clip.words[toIdx];
        if (!fromWord || !toWord) return null;
        return {
          seg: {
            id: randomUUID(),
            kind: 'clip',
            clipId: s.clipId,
            inMs: fromWord.startMs,
            outMs: toWord.endMs,
            cutReason: s.cutReason || '(sin razón)',
          },
          origIdx,
        };
      }
      const brollClip = clipsById.get(s.clipId);
      if (!brollClip) return null;
      const range = brollRangeFor(brollClip);
      return {
        seg: {
          id: randomUUID(),
          kind: 'broll',
          clipId: s.clipId,
          inMs: range.inMs,
          outMs: range.outMs,
          cutReason: brollClip.bestMoment?.reason,
          speed: clampBrollSpeed(s.speed),
        },
        origIdx,
      };
    })
    .filter((r): r is { seg: EdlClipSegment | EdlBrollSegment; origIdx: number } => r !== null);

  // Safety net 1: si el LLM intercala segments de clips distintos, los reagrupamos
  // siguiendo el orden de entrada de los clips. Array.sort es stable, así que
  // múltiples segments del mismo clip mantienen su orden relativo emitido por el LLM.
  resolved.sort((a, b) => {
    const ai = clipOrder.get(a.seg.clipId) ?? Number.MAX_SAFE_INTEGER;
    const bi = clipOrder.get(b.seg.clipId) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  // Safety net 2: si el LLM descartó un clip entero, lo agregamos full-length en su
  // posición de orden esperada. La AI sugiere; no impone. El user decide después.
  const presentClipIds = new Set(resolved.map((r) => r.seg.clipId));
  const missing = input.clips.filter((c) => !presentClipIds.has(c.id));
  for (const clip of missing) {
    const isACam = clip.words.length > 0;
    const brollRange = brollRangeFor(clip);
    const inMs = isACam ? clip.words[0].startMs : brollRange.inMs;
    const outMs = isACam ? clip.words[clip.words.length - 1].endMs : brollRange.outMs;
    const seg: EdlClipSegment | EdlBrollSegment = isACam
      ? {
          id: randomUUID(),
          kind: 'clip',
          clipId: clip.id,
          inMs,
          outMs,
          cutReason: '(clip omitted by the AI, reinserted full-length for you to decide)',
        }
      : { id: randomUUID(), kind: 'broll', clipId: clip.id, inMs, outMs, cutReason: clip.bestMoment?.reason };
    // origIdx fuera del rango original; no se referencia desde cues/music.
    resolved.push({ seg, origIdx: Number.MAX_SAFE_INTEGER });
  }
  // Re-sortear para insertar los faltantes en su posición de orden esperada.
  resolved.sort((a, b) => {
    const ai = clipOrder.get(a.seg.clipId) ?? Number.MAX_SAFE_INTEGER;
    const bi = clipOrder.get(b.seg.clipId) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  const segments = resolved.map((r) => r.seg);
  // Remap del índice original (lo que el LLM usó en cues/music.sections) al nuevo índice post-reorder.
  const origToNew = new Map(resolved.map((r, newIdx) => [r.origIdx, newIdx]));
  const remapIdx = (i: number) => origToNew.get(i) ?? i;

  // Tiempo absoluto donde empieza cada segment.
  const segmentStartsMs: number[] = [];
  let cursor = 0;
  for (const s of segments) {
    segmentStartsMs.push(cursor);
    cursor += playbackDurationMs(s);
  }
  const totalMs = cursor;

  // Resolver cues: cada cue arranca al inicio de su segmentIdx (remapeado), dura hasta el inicio del próximo cue o final del vlog.
  const sortedCues = [...llm.voiceover.cues]
    .map((c) => ({ ...c, startSegmentIdx: remapIdx(c.startSegmentIdx) }))
    .sort((a, b) => a.startSegmentIdx - b.startSegmentIdx);
  const cues: EdlVoiceoverCue[] = sortedCues.map((c, i) => {
    const startMs = segmentStartsMs[c.startSegmentIdx] ?? 0;
    const nextCue = sortedCues[i + 1];
    const naturalEnd = nextCue ? segmentStartsMs[nextCue.startSegmentIdx] ?? totalMs : totalMs;
    const speechEnd = startMs + estimateVoiceoverDurationMs(c.text);
    const endMs = Math.min(naturalEnd, speechEnd);
    return { startMs, endMs, text: c.text };
  });

  // Resolver secciones musicales con startMs/endMs absolutos (índices remapeados).
  const sections: MusicSection[] = llm.music.sections.map((sec) => {
    const startIdx = remapIdx(sec.startSegmentIdx);
    const endIdx = remapIdx(sec.endSegmentIdx);
    const startMs = segmentStartsMs[startIdx] ?? 0;
    const endSegStart = segmentStartsMs[endIdx] ?? 0;
    const endSeg = segments[endIdx];
    const endMs = endSeg ? endSegStart + playbackDurationMs(endSeg) : totalMs;
    return {
      id: randomUUID(),
      startMs,
      endMs,
      query: sec.query,
      mood: sec.mood,
      energy: sec.energy,
      baseVolume: typeof sec.baseVolume === 'number' ? sec.baseVolume : defaultBaseVolumeFor(sec.energy),
      reason: sec.reason || '',
    };
  });

  const originalOrder = input.clips.map((c) => c.id);

  return {
    version: 2,
    segments,
    originalOrder,
    voiceover: { fullScript: llm.voiceover.fullScript, cues },
    music: { sections },
    intent: input.intent,
    targetDurationSec: input.targetDurationSec,
    generatedAt: new Date().toISOString(),
  };
}
