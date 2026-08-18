#!/usr/bin/env python3
import argparse
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5vl:7b"
FRAME_SIZE = 512

SYSTEM_PROMPT = """Sos un editor de video evaluando clips b-roll para un vlog de viaje.
Para el frame que recibís, devolvé SOLO JSON con este shape exacto, sin markdown:
{
  "escena": "descripcion corta en español de lo que se ve",
  "lugar_tipo": "categoria del lugar, ej: transporte, interior-comercio, exterior-urbano, naturaleza, interior-alojamiento",
  "tipo_plano": "general | medio | detalle | aereo",
  "movimiento": "estatico | paneo | caminando | vehiculo | dron",
  "momento_dia": "amanecer | dia | atardecer | noche",
  "fuerza_visual": numero entero 1 a 10
}

Escala de fuerza_visual (usala tal cual, no default-ees siempre al mismo numero):
- 2-5: relleno, cotidiano, sin nada memorable
- 6-7: decente, correcto pero no memorable
- 8-10: genuinamente especial, un momento fuerte visualmente

Evaluá cada clip de forma independiente, no en relacion a otros clips que ya viste."""


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def probe_duration_s(video_path: Path) -> float:
    out = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(video_path),
    ])
    return round(float(out.stdout.strip()), 1)


def extract_frame_b64(video_path: Path, at_fraction: float, tmp_path: Path) -> str:
    duration = probe_duration_s(video_path)
    ts = max(0.0, duration * at_fraction)
    run([
        "ffmpeg", "-y", "-ss", str(ts), "-i", str(video_path),
        "-frames:v", "1", "-vf", f"scale={FRAME_SIZE}:-1",
        str(tmp_path),
    ])
    return base64.b64encode(tmp_path.read_bytes()).decode("ascii")


def tag_clip(video_path: Path, tmp_dir: Path) -> dict:
    frame_path = tmp_dir / f"{video_path.stem}.jpg"
    frame_b64 = extract_frame_b64(video_path, 0.5, frame_path)
    frame_path.unlink(missing_ok=True)

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "Evaluá este frame.", "images": [frame_b64]},
        ],
        "format": "json",
        "stream": False,
    }
    import urllib.request
    req = urllib.request.Request(
        OLLAMA_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    tag = json.loads(body["message"]["content"])

    return {
        "escena": tag["escena"],
        "lugar_tipo": tag["lugar_tipo"],
        "tipo_plano": tag["tipo_plano"],
        "movimiento": tag["movimiento"],
        "momento_dia": tag["momento_dia"],
        "fuerza_visual": int(tag["fuerza_visual"]),
        "duracion_s": probe_duration_s(video_path),
        "clip": video_path.stem,
    }


def main():
    parser = argparse.ArgumentParser(description="Tag b-roll clips via a local Ollama vision model.")
    parser.add_argument("day_dir", type=Path, help="Folder with one day's raw clips, e.g. '.../dia 3'")
    parser.add_argument("--dia", required=True, help="Value for the 'dia' field, e.g. 'dia 3'")
    parser.add_argument("--out", type=Path, required=True, help="Output JSONL path, e.g. data/vision-tags/dia_3.jsonl")
    args = parser.parse_args()

    clips = sorted(args.day_dir.glob("*.mp4"))
    if not clips:
        print(f"no .mp4 files found in {args.day_dir}", file=sys.stderr)
        sys.exit(1)

    tmp_dir = Path("/tmp/vlog-studio-vision-tags")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    ok, errors = 0, 0
    with args.out.open("w") as f:
        for i, clip in enumerate(clips, 1):
            try:
                tag = tag_clip(clip, tmp_dir)
                tag["dia"] = args.dia
                f.write(json.dumps(tag, ensure_ascii=False) + "\n")
                f.flush()
                ok += 1
                print(f"[{i}/{len(clips)}] {clip.name}: fuerza_visual={tag['fuerza_visual']}")
            except Exception as e:
                errors += 1
                print(f"[{i}/{len(clips)}] {clip.name}: ERROR {e}", file=sys.stderr)
            time.sleep(0.2)

    print(f"done: {ok} ok, {errors} errors, output {args.out}")


if __name__ == "__main__":
    main()
