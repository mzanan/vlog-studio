import { randomUUID } from 'node:crypto';
import {
  Edl,
  EdlBrollSegment,
  EdlClipSegment,
  EdlVoiceoverCue,
  Energy,
  MusicSection,
  defaultBaseVolumeFor,
  estimateVoiceoverDurationMs,
} from '../edl';

export type ClipForPlanning = {
  id: string;
  filename: string;
  kind: 'a-camara' | 'b-roll';
  durationMs: number;
  transcript: string;
};

export type PlanInput = {
  intent: string;
  targetDurationSec: number | null;
  clips: ClipForPlanning[];
  voiceStyleSamples: string[];
};

// Shape intermedio que devuelve el LLM. Usa segmentIdx en vez de tiempos absolutos
// porque sumar durations es trabajo del server, no del modelo.
export type LlmClipSegment = {
  kind: 'clip';
  clipId: string;
  inMs: number;
  outMs: number;
  cutReason: string;
};

export type LlmBrollSegment = {
  kind: 'broll';
  clipId: string;
  inMs: number;
  outMs: number;
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

export const PLANNER_SYSTEM = `Eres un editor de video experto armando un vlog a partir de clips raw del usuario. Tu objetivo es storytelling, no solo ensamblar.

Recibís:
- Intent del usuario (tono, duración aproximada).
- Lista de clips: id, kind (a-camara | b-roll), durationMs, transcript.
- Muestras del estilo de habla del usuario (frases reales suyas). El voiceover que escribas tiene que sonar como esas frases: mismo vocabulario, muletillas características, ritmo. NO uses lenguaje neutro de doblaje.

Devolvés un Edit Decision List intermedio en JSON. Reglas:

1. SEGMENTS — orden propuesto por vos (puede diferir del orden original):
   - "clip": fragmento de un clip a-cámara donde se escucha al usuario. Cortá agresivamente con cutReason narrativo: "muletilla", "tangente irrelevante", "información duplicada", "hook débil", "tramo lento", "transición innecesaria". No expliques el código, explicá la decisión editorial.
   - "broll": fragmento de un clip b-roll silenciado, usado para cubrir un voiceover o una transición.
   - inMs/outMs son SIEMPRE relativos al clip original, no al master timeline.
   - Abrí con el hook más fuerte disponible.

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

export const EDL_JSON_SHAPE = `{
  "segments": [
    { "kind": "clip",  "clipId": "string", "inMs": 0, "outMs": 0, "cutReason": "string" },
    { "kind": "broll", "clipId": "string", "inMs": 0, "outMs": 0 }
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
    if (clip.transcript.trim()) {
      lines.push(`transcript: ${clip.transcript.trim()}`);
    } else {
      lines.push('transcript: (sin habla)');
    }
  }

  lines.push('');
  lines.push('Devolvé únicamente JSON válido con este shape exacto (sin markdown, sin comentarios):');
  lines.push(EDL_JSON_SHAPE);
  return lines.join('\n');
}

// Convierte el shape intermedio en un Edl v2 con timestamps absolutos.
// El server hace la aritmética para que el LLM no tenga que.
export function resolveLlmEdl(llm: LlmEdl, input: PlanInput): Edl {
  const segments = llm.segments.map((s): EdlClipSegment | EdlBrollSegment => {
    if (s.kind === 'clip') {
      return {
        id: randomUUID(),
        kind: 'clip',
        clipId: s.clipId,
        inMs: s.inMs,
        outMs: s.outMs,
        cutReason: s.cutReason || '(sin razón)',
      };
    }
    return { id: randomUUID(), kind: 'broll', clipId: s.clipId, inMs: s.inMs, outMs: s.outMs };
  });

  // Tiempo absoluto donde empieza cada segment.
  const segmentStartsMs: number[] = [];
  let cursor = 0;
  for (const s of segments) {
    segmentStartsMs.push(cursor);
    cursor += s.outMs - s.inMs;
  }
  const totalMs = cursor;

  // Resolver cues: cada cue arranca al inicio de su segmentIdx, dura hasta el inicio del próximo cue o final del vlog.
  const sortedCues = [...llm.voiceover.cues].sort((a, b) => a.startSegmentIdx - b.startSegmentIdx);
  const cues: EdlVoiceoverCue[] = sortedCues.map((c, i) => {
    const startMs = segmentStartsMs[c.startSegmentIdx] ?? 0;
    const nextCue = sortedCues[i + 1];
    const naturalEnd = nextCue ? segmentStartsMs[nextCue.startSegmentIdx] ?? totalMs : totalMs;
    const speechEnd = startMs + estimateVoiceoverDurationMs(c.text);
    const endMs = Math.min(naturalEnd, speechEnd);
    return { startMs, endMs, text: c.text };
  });

  // Resolver secciones musicales con startMs/endMs absolutos.
  const sections: MusicSection[] = llm.music.sections.map((sec) => {
    const startMs = segmentStartsMs[sec.startSegmentIdx] ?? 0;
    const endSegStart = segmentStartsMs[sec.endSegmentIdx] ?? 0;
    const endSeg = segments[sec.endSegmentIdx];
    const endMs = endSeg ? endSegStart + (endSeg.outMs - endSeg.inMs) : totalMs;
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
