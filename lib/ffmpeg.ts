import { spawn } from 'node:child_process';

const PROBE_TIMEOUT_MS = 30_000;
const THUMBNAIL_TIMEOUT_MS = 60_000;
const WAV_TIMEOUT_MS = 600_000;
const NORMALIZE_TIMEOUT_MS = 1_800_000;
const LOUDNESS_TIMEOUT_MS = 600_000;

type RunOpts = { timeoutMs: number; signal?: AbortSignal };

export type ProbeResult = {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
};

export async function ffprobe(path: string, signal?: AbortSignal): Promise<ProbeResult> {
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json',
    path,
  ];
  const json = await run('ffprobe', args, { timeoutMs: PROBE_TIMEOUT_MS, signal });
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

export async function generateThumbnail(
  input: string,
  output: string,
  atSec = 1,
  signal?: AbortSignal,
): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-ss', String(atSec),
    '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=480:-2',
    '-q:v', '4',
    output,
  ], { timeoutMs: THUMBNAIL_TIMEOUT_MS, signal });
}

export async function toWavMono48k(input: string, output: string, signal?: AbortSignal): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i', input,
    '-vn',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    output,
  ], { timeoutMs: WAV_TIMEOUT_MS, signal });
}

export async function probeVideoCodec(input: string, signal?: AbortSignal): Promise<string> {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input,
  ], { timeoutMs: PROBE_TIMEOUT_MS, signal });
  return out.trim().toLowerCase();
}

// Re-mux o transcodifica el clip a H.264 + AAC + faststart para que el browser
// pueda seekearlo sin drama. Si ya es H.264 solo hace remux (copy streams), si es
// HEVC / VP9 / lo que sea, transcodifica con h264_videotoolbox (HW accel Apple Silicon).
export async function normalizeClip(input: string, output: string, signal?: AbortSignal): Promise<void> {
  const codec = await probeVideoCodec(input, signal);
  if (codec === 'h264') {
    await run('ffmpeg', [
      '-y',
      '-i', input,
      '-c', 'copy',
      '-movflags', '+faststart',
      output,
    ], { timeoutMs: NORMALIZE_TIMEOUT_MS, signal });
    return;
  }
  await run('ffmpeg', [
    '-y',
    '-i', input,
    '-c:v', 'h264_videotoolbox',
    '-b:v', '8000k',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    output,
  ], { timeoutMs: NORMALIZE_TIMEOUT_MS, signal });
}

export async function probeDurationMs(input: string, signal?: AbortSignal): Promise<number> {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    input,
  ], { timeoutMs: PROBE_TIMEOUT_MS, signal });
  return Math.round(parseFloat(out.trim()) * 1000);
}

function combinedSignal(opts: RunOpts): { signal: AbortSignal; timeoutSignal: AbortSignal } {
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;
  return { signal, timeoutSignal };
}

function abortError(cmd: string, timeoutSignal: AbortSignal, timeoutMs: number): Error {
  return timeoutSignal.aborted
    ? new Error(`${cmd} timed out after ${timeoutMs}ms`)
    : new Error(`${cmd} aborted by request`);
}

function run(cmd: string, args: string[], opts: RunOpts): Promise<string> {
  const { signal, timeoutSignal } = combinedSignal(opts);
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { signal });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      if (signal.aborted) reject(abortError(cmd, timeoutSignal, opts.timeoutMs));
      else reject(err);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr}`));
    });
  });
}

function runCapturingStderr(cmd: string, args: string[], opts: RunOpts): Promise<string> {
  const { signal, timeoutSignal } = combinedSignal(opts);
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { signal });
    let stderr = '';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => {
      if (signal.aborted) reject(abortError(cmd, timeoutSignal, opts.timeoutMs));
      else reject(err);
    });
    proc.on('close', (code) => {
      // ffmpeg con `-f null -` siempre escribe a stderr; exit code 0 si midió OK.
      if (code === 0) resolve(stderr);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Mide la loudness integrada del clip usando el filtro loudnorm en modo análisis.
// Devuelve gainDb necesario para llevar el material a `targetLufs`.
// targetLufs default: -16 (estándar conservador para vlog hablado; YouTube target es -14).
export async function analyzeLoudness(
  input: string,
  signal?: AbortSignal,
  targetLufs: number = -16,
): Promise<{ inputI: number; gainDb: number }> {
  const stderr = await runCapturingStderr('ffmpeg', [
    '-i', input,
    '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
    '-f', 'null',
    '-',
  ], { timeoutMs: LOUDNESS_TIMEOUT_MS, signal });
  // El bloque JSON está al final del stderr. Buscamos el último objeto JSON que contenga "input_i".
  const matches = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!matches || matches.length === 0) {
    throw new Error('loudnorm: no se encontró JSON de salida');
  }
  const parsed = JSON.parse(matches[matches.length - 1]) as { input_i?: string };
  const inputI = parseFloat(parsed.input_i ?? 'NaN');
  if (!Number.isFinite(inputI)) throw new Error('loudnorm: input_i inválido');
  // Si el clip es esencialmente silencio (input_i muy negativo, ej -70 LUFS), el gain
  // sería enorme. Limitamos para no boostear ruido de fondo a niveles dolorosos.
  const rawGain = targetLufs - inputI;
  const gainDb = Math.max(-12, Math.min(12, rawGain));
  return { inputI, gainDb };
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
