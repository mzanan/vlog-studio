import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from '../paths';
import { Edl } from '../edl';
import { LlmEdl, PlanInput, buildUserMessage } from './prompts';
import { LlmProvider } from './index';

export const LLM_LOGS_DIR = path.join(DATA_ROOT, 'llm-logs');

export type LlmLogEntry = {
  timestamp: string;
  projectId: string;
  provider: LlmProvider;
  mode: 'auto' | 'manual';
  durationMs: number;
  inputSummary: {
    intent: string;
    targetDurationSec: number | null;
    clipCount: number;
    voiceStyleSampleCount: number;
    totalWordCount: number;
    cutPreset: string;
  };
  userMessage: string;
  llmEdl: LlmEdl | null;
  resolvedEdl: Edl | null;
  error: string | null;
};

export async function writeLlmLog(entry: LlmLogEntry): Promise<void> {
  try {
    await mkdir(LLM_LOGS_DIR, { recursive: true });
    const safeTs = entry.timestamp.replace(/[:.]/g, '-');
    const filename = `${entry.projectId}-${safeTs}.json`;
    await writeFile(path.join(LLM_LOGS_DIR, filename), JSON.stringify(entry, null, 2), 'utf8');
  } catch {
    // logging best-effort; nunca tirar abajo el request por un fallo de disco
  }
}

export function summarizeInput(input: PlanInput): LlmLogEntry['inputSummary'] {
  const totalWordCount = input.clips.reduce((acc, c) => acc + c.words.length, 0);
  return {
    intent: input.intent,
    targetDurationSec: input.targetDurationSec,
    clipCount: input.clips.length,
    voiceStyleSampleCount: input.voiceStyleSamples.length,
    totalWordCount,
    cutPreset: input.cutPreset,
  };
}

export function renderedUserMessage(input: PlanInput): string {
  return buildUserMessage(input);
}
