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
};

export const PLANNER_SYSTEM = `Eres un editor de video experto planeando un vlog a partir de clips raw del usuario.

El usuario filmó clips: algunos a-cámara (hablándole a la cámara) y otros B-roll (silenciosos / ambiente). Recibís:
- Intent del usuario (tono, duración aproximada, audiencia)
- Lista de clips: id, kind, duración, transcript

Devolvés un Edit Decision List (EDL) en JSON. Cada segmento es uno de:
- "clip": usar un fragmento exacto de un clip a-cámara (inMs/outMs en milisegundos relativos al clip). Cortá silencios largos, muletillas (eh, uhm) y arranques fallidos.
- "voiceover": un hueco donde el usuario grabará VO. El script (en español) tiene que sonar natural, 1-3 oraciones, conversacional. Indicá qué clips de B-roll usar de fondo (brollClipIds).

Reglas:
- Abrí con el hook más fuerte disponible
- Apuntá a la duración target ±20%
- Usá B-roll para cubrir transiciones y dar aire visual
- Para cada segmento incluí un music hint con mood (descriptivo, ej. "cálido acústico") y energía (low/mid/high)
- El campo "reason" explica brevemente por qué (1 frase)`;

export const EDL_JSON_SHAPE = `{
  "segments": [
    // Cada elemento es UNA de estas dos formas:
    {
      "kind": "clip",
      "clipId": "string",
      "inMs": 0,
      "outMs": 0,
      "reason": "string"
    },
    {
      "kind": "voiceover",
      "script": "string en español",
      "durationEstimateMs": 0,
      "brollClipIds": ["string"],
      "reason": "string"
    }
  ],
  "musicHints": [
    {
      "segmentIdx": 0,
      "mood": "string descriptivo",
      "energy": "low" | "mid" | "high"
    }
  ]
}`;

export function buildUserMessage(input: PlanInput): string {
  const lines: string[] = [];
  lines.push(`Intent del vlog: ${input.intent || '(sin especificar)'}`);
  if (input.targetDurationSec) lines.push(`Duración objetivo: ${input.targetDurationSec}s`);
  lines.push('');
  lines.push('Clips disponibles:');

  for (const clip of input.clips) {
    lines.push('');
    lines.push(`---`);
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
