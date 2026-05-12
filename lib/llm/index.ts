import { Edl } from '../edl';
import { PLANNER_SYSTEM, PlanInput, buildUserMessage } from './prompts';
import { generateEdlGemini } from './gemini';
import { generateEdlAnthropic } from './anthropic';

export type LlmProvider = 'gemini' | 'anthropic' | 'manual';

export function currentProvider(): LlmProvider {
  const value = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  if (value === 'anthropic' || value === 'manual') return value;
  return 'gemini';
}

export async function generateEdl(input: PlanInput): Promise<Edl> {
  const provider = currentProvider();
  if (provider === 'gemini') return generateEdlGemini(input);
  if (provider === 'anthropic') return generateEdlAnthropic(input);
  throw new Error('Modo manual: usá GET /plan/prompt y POST /plan con el JSON pegado');
}

export function buildManualPrompt(input: PlanInput): string {
  return `${PLANNER_SYSTEM}\n\n${buildUserMessage(input)}`;
}

export type { PlanInput, ClipForPlanning } from './prompts';
