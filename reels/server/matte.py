"""Cuts the person out of every frame of a video and writes a transparent WebM (VP9 + alpha).

Usage: python3 matte.py <input video> <output.webm> [--model u2net_human_seg] [--height 960] [--fps 30] [--feather 2.5] [--max-height 1920]
The output has the same aspect ratio and frame rate as the render, so the EffectsReel template can
stack it exactly on top of the original footage (background → graphics → person).
The mask is found at --height (speed), but the person's pixels are kept at the footage's own resolution
(up to --max-height): in scenes that put graphics behind the speaker the face comes from this file, so a
low-resolution copy would soften exactly the part of the reel people look at.
Requires: pip install "rembg[cpu]" and ffmpeg. The model downloads on first run.
"""
import argparse
import json
import subprocess
import sys

from PIL import Image, ImageFilter
from rembg import new_session, remove


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    # u2net_human_seg is ~5x faster than BiRefNet and tuned for people; birefnet-portrait is sharper but slow on CPU
    ap.add_argument("--model", default="u2net_human_seg")
    ap.add_argument("--height", type=int, default=960)
    ap.add_argument("--fps", type=int, default=30)
    # soft edge: pull the mask in a pixel, then blur it, so there is no hard cut-out line (0 = hard edge)
    ap.add_argument("--feather", type=float, default=2.5)
    ap.add_argument("--max-height", type=int, default=1920)
    a = ap.parse_args()

    session = new_session(a.model)
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", a.src],
        check=True, capture_output=True,
    ).stdout)["streams"][0]
    h = min(probe["height"], a.max_height) // 2 * 2
    w = max(2, round(probe["width"] * h / probe["height"] / 2) * 2)
    # frames go through pipes (raw RGB in, raw RGBA out): no full-size PNGs written and read back
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", a.src, "-vf", f"fps={a.fps},scale={w}:{h}:flags=lanczos", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE,
    )
    enc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-framerate", str(a.fps), "-i", "-",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "28", "-row-mt", "1",
            "-deadline", "realtime", "-cpu-used", "8", "-auto-alt-ref", "0", a.out,
        ],
        stdin=subprocess.PIPE,
    )
    size = w * h * 3
    frames = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        img = Image.frombuffer("RGB", (w, h), buf, "raw", "RGB", 0, 1)
        small = img if h <= a.height else img.resize((max(2, round(w * a.height / h)), a.height), Image.BILINEAR)
        alpha = remove(small, session=session, only_mask=True, post_process_mask=True)
        if a.feather > 0:
            alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(a.feather))
        if alpha.size != img.size:
            alpha = alpha.resize(img.size, Image.BILINEAR)
        out = img.convert("RGBA")
        out.putalpha(alpha)
        enc.stdin.write(out.tobytes())
        if frames % 30 == 0:
            print(f"matte {frames}", file=sys.stderr, flush=True)
        frames += 1
    enc.stdin.close()
    if dec.wait() != 0 or enc.wait() != 0:
        raise SystemExit("ffmpeg failed")
    print(json.dumps({"out": a.out, "frames": frames, "model": a.model}))


if __name__ == "__main__":
    main()
