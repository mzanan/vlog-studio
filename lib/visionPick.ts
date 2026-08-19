import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateThumbnail } from './ffmpeg';
import { MomentWindow, describeMomentSignals } from './momentScore';

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = 'qwen2.5vl:7b';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';
const REQUEST_TIMEOUT_MS = 120_000;
const REMOTE_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 4_000;

const SYSTEM_PROMPT = `Sos un editor de video eligiendo el mejor momento dentro de un clip b-roll para un vlog.
Recibís varios frames candidatos, cada uno el punto medio de una ventana de 2-6s del mismo clip.
Elegí la ventana con el contenido más interesante o narrativamente fuerte, no solo la técnicamente más nítida.
Devolvé SOLO JSON con este shape exacto, sin markdown:
{ "bestIndex": 0, "reason": "razón corta en español" }`;

export type VisionPickProvider = 'ollama' | 'openrouter';
export type MomentPickResult = { windowIndex: number; reason: string };

type RawPick = { bestIndex?: number; reason?: string };

export function currentVisionPickProvider(): VisionPickProvider {
  return process.env.VISION_PICK_PROVIDER === 'openrouter' ? 'openrouter' : 'ollama';
}

export function currentVisionPickModel(): string {
  if (currentVisionPickProvider() === 'openrouter') {
    return process.env.VISION_PICK_MODEL ?? OPENROUTER_MODEL;
  }
  return process.env.VISION_PICK_MODEL ?? OLLAMA_MODEL;
}

async function extractFrameBase64(input: string, atMs: number, signal?: AbortSignal): Promise<string> {
  const framePath = path.join(tmpdir(), `momentpick-${randomUUID()}.jpg`);
  try {
    await generateThumbnail(input, framePath, atMs / 1000, signal);
    const buf = await readFile(framePath);
    return buf.toString('base64');
  } finally {
    await rm(framePath, { force: true });
  }
}

function fallbackPick(windows: MomentWindow[]): MomentPickResult {
  const best = windows.reduce((a, b) => (b.score > a.score ? b : a));
  return { windowIndex: windows.indexOf(best), reason: describeMomentSignals(best.signals) };
}

function parsePickJson(text: string): RawPick {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('response has no JSON object');
  return JSON.parse(text.slice(start, end + 1)) as RawPick;
}

function userPrompt(count: number): string {
  return `Elegí entre estos ${count} frames candidatos. bestIndex va de 0 a ${count - 1}.`;
}

async function requestOllama(images: string[], signal: AbortSignal): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: currentVisionPickModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(images.length), images },
      ],
      format: 'json',
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`ollama responded ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return body.message?.content ?? '';
}

async function requestOpenRouter(images: string[], signal: AbortSignal): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('missing OPENROUTER_API_KEY');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({
      model: currentVisionPickModel(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt(images.length) },
            ...images.map((b64) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${b64}` },
            })),
          ],
        },
      ],
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    | null;
  if (!res.ok) throw new Error(`openrouter responded ${res.status}: ${body?.error?.message ?? 'no detail'}`);
  if (body?.error) throw new Error(`openrouter: ${body.error.message ?? 'error with no message'}`);
  return body?.choices?.[0]?.message?.content ?? '';
}

async function requestPick(images: string[], signal?: AbortSignal): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const fetchSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
  return currentVisionPickProvider() === 'openrouter'
    ? requestOpenRouter(images, fetchSignal)
    : requestOllama(images, fetchSignal);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });
}

export async function pickBestWindow(
  input: string,
  windows: MomentWindow[],
  signal?: AbortSignal,
): Promise<MomentPickResult> {
  if (windows.length === 0) throw new Error('pickBestWindow: no candidate windows');
  if (windows.length === 1) return { windowIndex: 0, reason: 'single candidate window' };

  const attempts = currentVisionPickProvider() === 'openrouter' ? REMOTE_ATTEMPTS : 1;
  let lastError = 'no attempts';

  try {
    const images = await Promise.all(
      windows.map((w) => extractFrameBase64(input, Math.round((w.startMs + w.endMs) / 2), signal)),
    );

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const content = await requestPick(images, signal);
        const parsed = parsePickJson(content);
        if (typeof parsed.bestIndex !== 'number' || !windows[parsed.bestIndex]) {
          throw new Error(`bestIndex out of range: ${String(parsed.bestIndex)}`);
        }
        return {
          windowIndex: parsed.bestIndex,
          reason: parsed.reason || describeMomentSignals(windows[parsed.bestIndex].signals),
        };
      } catch (err) {
        lastError = (err as Error).message;
        if (attempt < attempts) await sleep(RETRY_BACKOFF_MS * attempt, signal);
      }
    }
    throw new Error(lastError);
  } catch (err) {
    console.error(
      `pickBestWindow: falling back to heuristic, ${currentVisionPickProvider()} failed: ${(err as Error).message}`,
    );
    return fallbackPick(windows);
  }
}
