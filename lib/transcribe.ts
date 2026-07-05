import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const WHISPER_BIN = process.env.WHISPER_BIN ?? 'whisper';
const TRANSCRIBE_TIMEOUT_MS = 1_800_000;

export type WhisperWord = { word: string; start: number; end: number };
export type WhisperSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
};
export type WhisperResult = {
  text: string;
  language: string;
  segments: WhisperSegment[];
};

export async function transcribe(audioPath: string, signal?: AbortSignal): Promise<WhisperResult> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'whisper-'));
  try {
    await runWhisper(audioPath, outDir, signal);
    const stem = path.parse(audioPath).name;
    const jsonPath = path.join(outDir, `${stem}.json`);
    const raw = await readFile(jsonPath, 'utf8');
    return JSON.parse(raw) as WhisperResult;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

function runWhisper(audioPath: string, outputDir: string, externalSignal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS);
  const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal;
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(WHISPER_BIN, [
      audioPath,
      '--model', 'turbo',
      '--word_timestamps', 'True',
      '--output_format', 'json',
      '--output_dir', outputDir,
      '--verbose', 'False',
    ], { signal });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      if (signal.aborted) {
        reject(new Error(timeoutSignal.aborted
          ? `whisper timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`
          : 'whisper aborted by request'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export function computeWordsPerSec(result: WhisperResult, durationMs: number): number {
  if (!durationMs) return 0;
  const wordCount = result.segments.reduce((acc, s) => acc + (s.words?.length ?? s.text.trim().split(/\s+/).length), 0);
  return wordCount / (durationMs / 1000);
}

export const VOICE_THRESHOLD_WPS = 1.0;
