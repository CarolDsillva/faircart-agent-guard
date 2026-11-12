"""Narrates the explainer: one neural-voice clip per line, fitted to its scene, mixed onto the video.

Usage: python -I video/voiceover.py [voice]   (default en-US-AndrewNeural)
Reads video/voiceover.json, writes video/out/pennywise-for-paypal-voiceover.mp4.
"""
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
VO = OUT / "vo"
VO.mkdir(parents=True, exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-US-AndrewNeural"
BASE_RATE = 6  # percent faster than default: brisk, still natural


def duration(path: Path) -> float:
    err = subprocess.run([FF, "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


async def speak(text: str, rate: int, path: Path) -> float:
    """Generate one line, cached by text and rate; retries the speech service's brief network drops."""
    cached = path.with_name(f"{path.stem}-{abs(hash((VOICE, text, rate))) % 10**10}.mp3")
    if cached.exists() and cached.stat().st_size > 2000:
        path.write_bytes(cached.read_bytes())
        return duration(path)
    for attempt in range(5):
        try:
            await edge_tts.Communicate(text, VOICE, rate=f"{rate:+d}%").save(str(cached))
            break
        except Exception as e:  # network resets, empty responses
            if attempt == 4:
                raise
            print(f"  retrying ({type(e).__name__})")
            await asyncio.sleep(2 + attempt * 2)
    path.write_bytes(cached.read_bytes())
    return duration(path)


async def main() -> None:
    lines = json.loads((HERE / "voiceover.json").read_text(encoding="utf-8"))
    placed = []
    for i, line in enumerate(lines):
        path = VO / f"line{i:02d}.mp3"
        rate = BASE_RATE
        d = await speak(line["text"], rate, path)
        # Too long for its scene: speed this line up just enough (capped, so it stays natural).
        if d > line["slot"]:
            rate = min(35, BASE_RATE + int((d / line["slot"] - 1) * 100) + 3)
            d = await speak(line["text"], rate, path)
        print(f"line {i}: {d:5.2f}s of {line['slot']:5.2f}s slot at {rate:+d}%{'  (over!)' if d > line['slot'] + 0.3 else ''}")
        placed.append((path, line["at"]))

    video = OUT / "pennywise-for-paypal.mp4"
    out = OUT / "pennywise-for-paypal-voiceover.mp4"
    inputs = ["-i", str(video)]
    filters = []
    for n, (path, at) in enumerate(placed, start=1):
        inputs += ["-i", str(path)]
        ms = int(at * 1000)
        filters.append(f"[{n}:a]aresample=48000,adelay={ms}|{ms},volume=1.0[a{n}]")
    mix = "".join(f"[a{n}]" for n in range(1, len(placed) + 1))
    filters.append(f"{mix}amix=inputs={len(placed)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]")
    subprocess.run(
        [FF, "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters),
         "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(out)],
        check=True,
    )
    print("video:", out)


asyncio.run(main())
