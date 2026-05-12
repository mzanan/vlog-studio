#!/usr/bin/env python3
"""Generate background music with MusicGen.

Usage:
    python musicgen.py --prompt "warm acoustic, low energy" \
        --duration 30 --output /path/to/out.wav

Loads facebook/musicgen-small (~2.5GB on first run, cached after).
Runs on MPS if available, else CPU. ~3-5s of compute per 1s of audio on M-series.
"""
import argparse
import sys

import scipy.io.wavfile
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration


MODEL_ID = "facebook/musicgen-small"


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def generate(prompt: str, duration_sec: int, output_path: str) -> None:
    device = pick_device()
    print(f"[musicgen] device={device} model={MODEL_ID}", flush=True)

    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID).to(device)

    # MusicGen produces 50 tokens per second of audio.
    max_new_tokens = duration_sec * 50

    print(f"[musicgen] prompt={prompt!r} duration={duration_sec}s tokens={max_new_tokens}", flush=True)

    inputs = processor(text=[prompt], padding=True, return_tensors="pt").to(device)
    with torch.no_grad():
        audio_values = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=True, guidance_scale=3.0)

    sampling_rate = model.config.audio_encoder.sampling_rate
    audio_np = audio_values[0, 0].cpu().numpy()

    scipy.io.wavfile.write(output_path, rate=sampling_rate, data=audio_np)
    print(f"[musicgen] wrote {output_path} ({len(audio_np) / sampling_rate:.1f}s @ {sampling_rate}Hz)", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--duration", type=int, required=True, help="Duration in seconds")
    parser.add_argument("--output", required=True, help="Output WAV path")
    args = parser.parse_args()

    if args.duration < 1 or args.duration > 300:
        print(f"[musicgen] duration {args.duration} out of bounds (1-300)", file=sys.stderr)
        return 2

    generate(args.prompt, args.duration, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
