import { Edl } from '../edl';
import { Chapter, VisionTag } from '../chapters';
import { LlmEdl, PlanInput, buildPlannerSystem, buildUserMessage } from './prompts';
import { LlmChaptersResult } from './chapterPrompts';
import { generateEdlGemini, generateChaptersGemini } from './gemini';
import { generateEdlAnthropic, generateChaptersAnthropic } from './anthropic';

export type LlmProvider = 'gemini' | 'anthropic' | 'manual';

export function currentProvider(): LlmProvider {
  const value = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  if (value === 'anthropic' || value === 'manual') return value;
  return 'gemini';
}

export async function generateEdl(input: PlanInput): Promise<{ edl: Edl; llmEdl: LlmEdl }> {
  const provider = currentProvider();
  if (provider === 'gemini') return generateEdlGemini(input);
  if (provider === 'anthropic') return generateEdlAnthropic(input);
  throw new Error('Modo manual: usá GET /plan/prompt y POST /plan con el JSON pegado');
}

export function buildManualPrompt(input: PlanInput): string {
  return `${buildPlannerSystem(input.cutPreset)}\n\n${buildUserMessage(input)}`;
}

export async function generateChapters(tags: VisionTag[]): Promise<{ chapters: Chapter[]; llmResult: LlmChaptersResult }> {
  const provider = currentProvider();
  if (provider === 'gemini') return generateChaptersGemini(tags);
  if (provider === 'anthropic') return generateChaptersAnthropic(tags);
  throw new Error('Modo manual no soportado para agrupamiento de capítulos');
}

export type { PlanInput, ClipForPlanning, CutPreset } from './prompts';
