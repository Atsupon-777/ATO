# Builds the gallery previews from real renders (one MP4 per template, one clip per effect).
#   python3 scripts/make-showcase.py /mnt/project-files/reels-tests
# Output: public/showcase/<key>.mp4 + <key>.jpg (720x1280, small enough for a phone grid).
import json, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1])
root = Path(__file__).resolve().parent.parent
out = root / 'public/showcase'
out.mkdir(parents=True, exist_ok=True)

def enc(inp, key, ss=None, t=None):
    cut = (['-ss', str(ss)] if ss is not None else []) + (['-t', str(t)] if t is not None else [])
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *cut, '-i', str(inp), '-vf', 'scale=720:-2,fps=30',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-an',
                    '-movflags', '+faststart', str(out / f'{key}.mp4')], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str((t or 6) * 0.5), '-i', str(out / f'{key}.mp4'),
                    '-frames:v', '1', '-q:v', '4', str(out / f'{key}.jpg')], check=True)

enc(src / 'matcha-product-dynamic.mp4', 'ProductShine')
enc(src / 'ato-saas-promo.mp4', 'SaaSPromo')
enc(src / 'talk-captions-ja.mp4', 'TalkCaptions')
enc(src / 'effects-17-test.mp4', 'EffectsReel')
# effects-17-test.mp4 is props/effects-demo.json rendered with a person matte: segments play back to back.
segs = json.load(open(root / 'props/effects-demo.json'))['segments']
at = 0.0
for s in segs:
    d = round((s['end'] - s['start']) * 30) / 30
    enc(src / 'effects-17-test.mp4', s['effect'], ss=round(at, 3), t=d)
    at += d
# Mix samples from the effects thread: effects-mix-<id>.mp4 → mix-<id>
for f in sorted(src.glob('effects-mix-*.mp4')):
    enc(f, 'mix-' + f.stem[len('effects-mix-'):])
# The app hides gallery items that have no real render yet.
json.dump(sorted(p.stem for p in out.glob('*.mp4')), open(out / 'index.json', 'w'))
print('done')
