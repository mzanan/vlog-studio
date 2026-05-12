import { GoogleGenAI } from '@google/genai';
import { Edl } from '../edl';
import { LlmEdl, PLANNER_SYSTEM, PlanInput, buildUserMessage, resolveLlmEdl } from './prompts';

export async function generateEdlGemini(input: PlanInput): Promise<Edl> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

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

  return resolveLlmEdl(parsed as LlmEdl, input);
}
