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

## Pipeline (next steps)

1. Cut-out: BiRefNet (`rembg -m birefnet-general-lite`) produced `public/samples/watch-cutout.png`.
2. Product imagery and motion: Gemini image editing and Veo / Kling image-to-video, called from the server.
   The cut-out is composited on top so logos and text stay exact.
3. Transcription: ElevenLabs Scribe v2 → `words` for `TalkCaptions`.
4. Rendering at scale: Remotion Lambda (or a render worker). Companies with 4+ people need a Remotion company license.
