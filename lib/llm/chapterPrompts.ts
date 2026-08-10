import { Chapter, VisionTag } from '../chapters';

export type LlmChapterGroup = {
  title: string;
  clipIds: string[];
  reason: string;
};

export type LlmChaptersResult = {
  chapters: LlmChapterGroup[];
};

export function buildChapterPlannerSystem(): string {
  return `Eres un editor de video experto organizando el material crudo de un viaje en capítulos para YouTube. Tu objetivo es storytelling, no solo ensamblar por fecha.

Recibís una lista de clips con tags de visión (escena, tipo de lugar, tipo de plano, momento del día, fuerza visual 1-10, duración, timestamp de captura). Tenés que agruparlos en capítulos, donde cada capítulo es UN VIDEO DE YOUTUBE con arco propio: un evento que empieza y se resuelve (ej. "llegada y vuelo a Tokio", "día explorando Asakusa", "excursión al monte Fuji"), no un bloque arbitrario de tiempo.

Reglas:

1. COBERTURA: cada clip del input tiene que aparecer en exactamente un capítulo. No inventes clipIds que no existan en el input. No dupliques clipIds entre capítulos.

2. EL CORTE ES POR EVENTO, NO POR DURACIÓN. Un capítulo termina cuando el evento se resuelve (cambia de lugar/actividad de forma clara), no cuando se llega a un número de minutos. Dicho esto, un video de YouTube de este estilo funciona mejor entre 5 y 15 minutos de material (sumando duracion_s de sus clips); si un evento real da menos de eso, evaluá si en realidad es parte del mismo arco que el evento vecino cronológico antes de dejarlo como capítulo separado. No estires un capítulo corto agregando clips que no pertenecen al mismo evento solo para llegar a un mínimo.

3. NO agrupes solo por coincidir el mismo tipo de lugar si el evento real es otro. Dos bloques en "transporte" separados por muchas horas (ej. cruzando una noche de sueño) casi siempre son eventos distintos (ej. "vuelo de ida" vs "traslado del día siguiente"), aunque compartan lugar_tipo.

4. ORDEN INTERNO: dentro de cada capítulo, listá los clipIds en el orden que mejor cuente la historia de ese evento. Por default eso es el orden cronológico de captura, pero podés reordenar si hay una razón narrativa clara (ej. mover un establishing shot al principio, cerrar con el clip de mayor fuerza_visual como cierre). Si reordenás, que se note por qué en el "reason".

5. TÍTULO: título corto y concreto del evento (3-6 palabras), no genérico ("Día 3" no sirve, "Templo Senso-ji y calle Nakamise" sí).

6. RAZÓN: una línea explicando por qué ese conjunto de clips es un evento resuelto (dónde empieza, dónde termina, por qué corta ahí).

Devolvé únicamente JSON válido con este shape exacto (sin markdown, sin comentarios):
{
  "chapters": [
    { "title": "string", "clipIds": ["string", "..."], "reason": "string" }
  ]
}`;
}

export function buildChapterUserMessage(tags: VisionTag[]): string {
  const sorted = [...tags].sort((a, b) => (a.clip < b.clip ? -1 : a.clip > b.clip ? 1 : 0));
  const lines: string[] = [];
  lines.push(`Clips (${sorted.length} total, orden cronológico de captura):`);
  for (const tag of sorted) {
    lines.push(
      `- id=${tag.clip} dia="${tag.dia}" lugar_tipo=${tag.lugar_tipo} tipo_plano=${tag.tipo_plano} movimiento=${tag.movimiento} momento_dia=${tag.momento_dia} fuerza_visual=${tag.fuerza_visual} duracion_s=${tag.duracion_s} escena="${tag.escena}"`
    );
  }
  return lines.join('\n');
}

export function resolveLlmChapters(llm: LlmChaptersResult, tags: VisionTag[]): Chapter[] {
  const tagsById = new Map(tags.map((t) => [t.clip, t]));
  const claimed = new Set<string>();
  const chapters: Chapter[] = [];

  for (const group of llm.chapters) {
    const clips: VisionTag[] = [];
    for (const clipId of group.clipIds) {
      if (claimed.has(clipId)) continue;
      const tag = tagsById.get(clipId);
      if (!tag) continue;
      claimed.add(clipId);
      clips.push(tag);
    }
    if (clips.length > 0) chapters.push({ title: group.title, clips, reason: group.reason });
  }

  const missing = tags
    .filter((t) => !claimed.has(t.clip))
    .sort((a, b) => (a.clip < b.clip ? -1 : a.clip > b.clip ? 1 : 0));
  if (missing.length > 0) {
    chapters.push({
      title: 'Sin agrupar',
      clips: missing,
      reason: '(clips omitidos por la AI, reinsertados acá para que decidas)',
    });
  }

  return chapters;
}
