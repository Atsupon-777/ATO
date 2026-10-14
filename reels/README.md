# ATO Reels — Remotion templates

Reels are rendered from templates: Claude (or a person) fills a template's props as JSON, and Remotion turns them
into the same polished video every time. Each template declares its props with a zod schema, so AI output can be
validated before rendering.

## Setup

```bash
cd reels
npm install          # also downloads the fonts into public/fonts (SIL OFL, self-hosted)
npm run studio       # live preview with editable props
npm run render -- ProductShine props/product-watch.json out/watch.mp4
```

Set `REMOTION_BROWSER` to a local Chromium / headless shell if Remotion cannot download its own.

## Templates

| Id | Use | Inputs |
|---|---|---|
| `ProductShine` | Luxury product promo: cut-out hero with light sweeps, glints and floor reflection, three macro detail shots, end card. Beat-timed (default 120 BPM, 14 s). | Photo, transparent cut-out, glint points, three detail focus points with copy |
| `SaaSPromo` | Service / SaaS promo: kinetic hook, 3D browser and phone mock-ups, cursor clicks, count-up stats, CTA. Beat-timed (default 128 BPM, ~19 s). | Desktop and mobile screenshots, hook lines, three features with focus points, three stats |
| `TalkCaptions` | Talking video edit: silences and fillers cut, word-by-word captions with emphasis, title card, punch-in on alternate cuts. | Video, word-timed transcript (ElevenLabs Scribe format), caption style, per-caption overrides |

Sample props live in `props/`; sample media in `public/samples/`.

### Caption editing

`TalkCaptions` takes `overrides: [{ page, hidden?, text?, x?, y? }]`, so an editor UI can move, rewrite or delete
one caption without touching the transcript. The edit logic (`src/lib/edit.ts`) is pure and can run on the server
or in the browser to show the same cut list the render will use.

## Automatic product reels (`server/`)

One command turns a product photo into a finished reel:

```bash
pip install "rembg[cpu]"                 # local BiRefNet cut-out, no API cost
export GEMINI_API_KEY=...                # Google AI Studio key on a paid tier (needed for Veo; paid-tier data is not used for training)
node server/cli.ts models                # checks the configured model ids are available to this key
node server/cli.ts product --photo watch.jpg --brand ATO --name "ÉCLAT DE TEMPS" \
  --facts "18K rose gold case, sapphire crystal" --style luxury --video
```

Steps, each recorded with its cost in `public/jobs/<id>/usage.json`:

1. **Cut-out**: BiRefNet runs locally (`server/cutout.py`) and trims the product to its bounds.
2. **Studio shot**: Nano Banana (`gemini-nano-banana-2.1`) re-lights the original photo in one of four styles
   (`luxury`, `clean`, `cosmetic`, `natural`) with an instruction to keep the product, logo and text unchanged.
3. **Plan and copy**: Gemini reads the photo, studio shot and cut-out and returns JSON (tagline, three detail
   close-ups, glint points, a motion prompt). Copy may only use the facts passed with `--facts`.
4. **Motion clip** (`--video`): Veo 3.1 Fast animates the studio shot (8 s, 9:16, 1080p, no audio). With `--on-skin`
   it first generates a model applying the product, for cosmetics.
5. **Render**: the result is validated against `productShineSchema` and rendered with `ProductShine`.

Models are set in `server/config.ts` and can be overridden with `REELS_TEXT_MODEL`, `REELS_IMAGE_MODEL` and
`REELS_VIDEO_MODEL`. Inside a sandbox whose outbound traffic goes through a proxy, also set `NODE_USE_ENV_PROXY=1`.

## Web app (`app/`)

```bash
GEMINI_API_KEY=... npm run app        # http://127.0.0.1:3000
```

Template first: pick 商品を魅せる / サービス紹介 / トーク動画＋字幕, upload material, and the server runs the
matching pipeline (`server/product.ts`, `server/saas.ts`, `server/talk.ts`). The editor previews the template live in
the browser with `@remotion/player`, so every text, colour, caption edit (rewrite, hide, drag to move) shows at once;
「MP4を書き出す」 renders the same props on the server. Jobs are kept in `public/jobs/<id>/job.json`.

`server/talk.ts` transcribes with Gemini (phrase timings snapped to the audio with ffmpeg silencedetect) and converts
uploads to H.264 so iPhone HEVC clips play in every browser.

## Still to do

- Transcription in the server (ElevenLabs Scribe v2 → `words` for `TalkCaptions`).
- Accounts, token balance and billing (Stripe); the app has no login yet.
- Durable job queue and storage (jobs run in the web process and files sit on local disk).
- Rendering at scale: Remotion Lambda (or a render worker). Companies with 4+ people need a Remotion company license.
