import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const BIN_NAME = 'whisper';

const FALLBACK_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  path.join(homedir(), '.local', 'bin'),
];

const FALLBACK_PYTHONS = [
  '/usr/bin/python3',
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
];

export type WhisperCommand = { command: string; args: string[] };

let cached: WhisperCommand | null | undefined;

function isExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function hasWorkingShebang(candidate: string): boolean {
  let firstLine: string;
  try {
    firstLine = readFileSync(candidate, 'utf8').split('\n', 1)[0] ?? '';
  } catch {
    return true;
  }
  if (!firstLine.startsWith('#!')) return true;
  const interpreter = firstLine.slice(2).trim().split(/\s+/)[0];
  if (!interpreter) return false;
  if (interpreter.endsWith('/env')) return isExecutable(interpreter);
  return isExecutable(interpreter);
}

function isRunnableScript(candidate: string): boolean {
  return isExecutable(candidate) && hasWorkingShebang(candidate);
}

function hasWhisperModule(python: string): boolean {
  if (!isExecutable(python)) return false;
  const probe = spawnSync(
    python,
    ['-c', 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("whisper") else 1)'],
    { timeout: 15_000, stdio: 'ignore' },
  );
  return probe.status === 0;
}

function pathDirs(): string[] {
  return (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
}

function pythonUserBinDirs(): string[] {
  const base = path.join(homedir(), 'Library', 'Python');
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(base, entry.name, 'bin'));
  } catch {
    return [];
  }
}

function scriptCandidates(): string[] {
  return [...pathDirs(), ...pythonUserBinDirs(), ...FALLBACK_BIN_DIRS].map((dir) =>
    path.join(dir, BIN_NAME),
  );
}

function pythonCandidates(): string[] {
  return [...pathDirs().map((dir) => path.join(dir, 'python3')), ...FALLBACK_PYTHONS];
}

function configured(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

function detect(): WhisperCommand | null {
  const explicitPython = configured('WHISPER_PYTHON');
  if (explicitPython) {
    return hasWhisperModule(explicitPython)
      ? { command: explicitPython, args: ['-m', BIN_NAME] }
      : null;
  }

  const explicitBin = configured('WHISPER_BIN');
  if (explicitBin) {
    return isRunnableScript(explicitBin) ? { command: explicitBin, args: [] } : null;
  }

  const script = scriptCandidates().find(isRunnableScript);
  if (script) return { command: script, args: [] };

  const python = pythonCandidates().find(hasWhisperModule);
  if (python) return { command: python, args: ['-m', BIN_NAME] };

  return null;
}

export function resolveWhisperCommand(): WhisperCommand | null {
  if (cached !== undefined) return cached;
  cached = detect();
  return cached;
}

export function whisperMissingMessage(): string {
  const explicitPython = configured('WHISPER_PYTHON');
  if (explicitPython) {
    return `WHISPER_PYTHON points to "${explicitPython}" but that interpreter cannot import the whisper module. Install it with "${explicitPython} -m pip install -U openai-whisper" or unset the variable to auto-detect.`;
  }
  const explicitBin = configured('WHISPER_BIN');
  if (explicitBin) {
    return `WHISPER_BIN points to "${explicitBin}" but it is not an executable with a valid interpreter. Fix it in .env, set WHISPER_PYTHON to a python3 that has the whisper module, or unset both to auto-detect.`;
  }
  return 'Whisper was not found. No runnable "whisper" executable is on PATH and no python3 in the usual locations can import the whisper module. Install it with "python3 -m pip install -U openai-whisper", then set WHISPER_PYTHON or WHISPER_BIN in .env if it lands outside the default locations.';
}

export function requireWhisperCommand(): WhisperCommand {
  const resolved = resolveWhisperCommand();
  if (!resolved) throw new Error(whisperMissingMessage());
  return resolved;
}

export function whisperUnavailableResponse(): Response | null {
  if (resolveWhisperCommand()) return null;
  return Response.json({ error: whisperMissingMessage() }, { status: 503 });
}
