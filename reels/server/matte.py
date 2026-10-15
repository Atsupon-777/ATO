"""Cuts the person out of every frame of a video and writes a transparent WebM (VP9 + alpha).

Usage: python3 matte.py <input video> <output.webm> [--model u2net_human_seg] [--height 960] [--fps 30]
The output has the same aspect ratio and frame rate as the render, so the EffectsReel template can
stack it exactly on top of the original footage (background → graphics → person).
Requires: pip install "rembg[cpu]" and ffmpeg. The model downloads on first run.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image
from rembg import new_session, remove


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    # u2net_human_seg is ~5x faster than BiRefNet and tuned for people; birefnet-portrait is sharper but slow on CPU
    ap.add_argument("--model", default="u2net_human_seg")
    ap.add_argument("--height", type=int, default=960)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()

    session = new_session(a.model)
    with tempfile.TemporaryDirectory() as tmp:
        frames = Path(tmp) / "in"
        cut = Path(tmp) / "out"
        frames.mkdir()
        cut.mkdir()
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", a.src, "-vf", f"fps={a.fps},scale=-2:{a.height}", str(frames / "%05d.png")],
            check=True,
        )
        files = sorted(frames.glob("*.png"))
        for i, f in enumerate(files):
            img = Image.open(f).convert("RGB")
            remove(img, session=session, post_process_mask=True).save(cut / f.name)
            if i % 30 == 0:
                print(f"matte {i}/{len(files)}", file=sys.stderr, flush=True)
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", str(cut / "%05d.png"),
                "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "32", "-row-mt", "1",
                "-auto-alt-ref", "0", a.out,
            ],
            check=True,
        )
    print(json.dumps({"out": a.out, "frames": len(files), "model": a.model}))


if __name__ == "__main__":
    main()
