import { spawn } from 'node:child_process';
import path from 'node:path';
import { Edl } from './edl';
import { MusicBlock } from './music';

function pythonBin(): string {
  if (process.env.MUSICGEN_PYTHON) return process.env.MUSICGEN_PYTHON;
  const home = process.env.HOME ?? '';
  return path.join(home, '.venvs', 'vlog-studio', 'bin', 'python');
}

function musicgenScript(): string {
  return path.join(process.cwd(), 'python', 'musicgen.py');
}

const PROMPT_PREFIX = 'instrumental background music, no vocals,';

const ENERGY_HINTS: Record<MusicBlock['energy'], string> = {
  low: 'slow tempo, calm, intimate',
  mid: 'mid tempo, relaxed, steady groove',
  high: 'upbeat tempo, energetic, driving',
};

export function buildPrompt(block: MusicBlock): string {
  return `${PROMPT_PREFIX} ${block.mood}, ${ENERGY_HINTS[block.energy]}`;
}

export function blockDurationMs(block: MusicBlock, edl: Edl): number {
  let total = 0;
  for (let i = block.startSegmentIdx; i <= block.endSegmentIdx; i++) {
    const seg = edl.segments[i];
    if (!seg) continue;
    if (seg.kind === 'clip') total += seg.outMs - seg.inMs;
    else total += seg.durationEstimateMs;
  }
  return total;
}

export async function runMusicgen(prompt: string, durationSec: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin(), [
      musicgenScript(),
      '--prompt', prompt,
      '--duration', String(durationSec),
      '--output', outputPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.stdout.on('data', (d) => { process.stdout.write(d); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`musicgen exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
