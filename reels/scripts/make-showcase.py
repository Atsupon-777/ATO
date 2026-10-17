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

# Base templates: brand-free samples rendered per language (lang/<Template>.<lang>.mp4).
# Japanese is the default key; other languages become <key>.<lang>, which the app picks by UI language.
for f in sorted((src / 'lang').glob('*.mp4')):
    tpl, lang = f.stem.split('.')
    enc(f, tpl if lang == 'ja' else f'{tpl}.{lang}')
# Prefer the black-background renders (no person in frame) when the effects thread made them.
fx17 = src / 'effects-17-black.mp4' if (src / 'effects-17-black.mp4').exists() else src / 'effects-17-test.mp4'
enc(fx17, 'EffectsReel')
# effects-17-*.mp4 is props/effects-demo.json rendered with a person matte: segments play back to back.
segs = json.load(open(root / 'props/effects-demo.json'))['segments']
at = 0.0
for s in segs:
    d = round((s['end'] - s['start']) * 30) / 30
    enc(fx17, s['effect'], ss=round(at, 3), t=d)
    at += d
# Mix samples from the effects thread: effects-mix-<id>.mp4 → mix-<id>
mixes = {}
for f in sorted(src.glob('effects-mix-*.mp4')):
    mid = f.stem[len('effects-mix-'):].removesuffix('-black')
    if f.stem.endswith('-black') or mid not in mixes:
        mixes[mid] = f
for mid, f in mixes.items():
    enc(f, 'mix-' + mid)
if (src / 'fivepass-demo-ja.mp4').exists():
    enc(src / 'fivepass-demo-ja.mp4', 'FivePass')
# Sub-types (caption styles, camera moves, transitions, grades, textures): one long render per
# language from scripts/make-subtypes.ts plus a clip list, sliced into one sample per option.
for f in sorted(src.glob('subtypes-*.mp4')):
    lang = f.stem.split('-')[1]
    for key, c in json.load(open(f.with_suffix('.json'))).items():
        enc(f, key if lang == 'ja' else f'{key}.{lang}', ss=c['start'], t=c['dur'])
# The app hides gallery items that have no real render yet.
json.dump(sorted(p.stem for p in out.glob('*.mp4')), open(out / 'index.json', 'w'))
print('done')
