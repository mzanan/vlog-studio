import { GoogleGenAI } from '@google/genai';
import { Edl, isValidEdl } from '../edl';
import { PLANNER_SYSTEM, PlanInput, buildUserMessage } from './prompts';

export async function generateEdlGemini(input: PlanInput): Promise<Edl> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';

  const response = await ai.models.generateContent({
    model,
    contents: buildUserMessage(input),
    config: {
      systemInstruction: PLANNER_SYSTEM,
      responseMimeType: 'application/json',
      temperature: 0.7,
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

  const edl: Edl = {
    segments: (parsed as { segments: Edl['segments'] }).segments,
    musicHints: (parsed as { musicHints: Edl['musicHints'] }).musicHints,
    intent: input.intent,
    targetDurationSec: input.targetDurationSec,
    generatedAt: new Date().toISOString(),
  };
  if (!isValidEdl(edl)) throw new Error('EDL devuelto por Gemini no es válido');
  return edl;
}
