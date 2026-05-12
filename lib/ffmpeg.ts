import { spawn } from 'node:child_process';

export type ProbeResult = {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
};

export async function ffprobe(path: string): Promise<ProbeResult> {
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json',
    path,
  ];
  const json = await run('ffprobe', args);
  const data = JSON.parse(json);
  const stream = data.streams?.[0] ?? {};
  const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    durationMs: Math.round(parseFloat(data.format?.duration ?? '0') * 1000),
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
    fps: den ? num / den : 0,
  };
}

export async function generateThumbnail(input: string, output: string, atSec = 1): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-ss', String(atSec),
    '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=480:-2',
    '-q:v', '4',
    output,
  ]);
}

export async function toWavMono48k(input: string, output: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i', input,
    '-vn',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    output,
  ]);
}

export async function probeDurationMs(input: string): Promise<number> {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input,
  ]);
  return Math.round(parseFloat(out.trim()) * 1000);
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr}`));
    });
  });
}
