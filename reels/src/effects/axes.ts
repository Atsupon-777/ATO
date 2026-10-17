// The effect "DNA": every beat is one scene effect plus one choice on each style axis, plus any set of
// accent overlays. Axes are independent, so they multiply: see combinationCount().
// Pure data (no React), so the server planner and the schema can import it.

export const captionStyles = [
  'pop', // bold sans, word by word with a little pop (default)
  'blur', // words sharpen out of a blur
  'spaced', // small, widely tracked capitals
  'upper', // bold capitals
  'script', // gold italic serif
  'outline', // hollow letters with a coloured stroke
  'box', // white words on black tags
  'highlighter', // a marker swipe behind each emphasised word
  'typewriter', // letters type on with a caret
  'stack', // one word per line, emphasised words much bigger
  'bounce', // words drop in and bounce
  'neon', // glowing coloured letters
] as const;

export const cameraMoves = [
  'still',
  'push', // slow push in
  'pull', // slow pull out
  'drift', // gentle sideways drift
  'punch', // punch-in on the beat
  'shake', // short impact shake at the start
  'tilt', // slight dutch tilt that settles
  'spinIn', // rotates in and settles
  'handheld', // constant subtle handheld wobble
  'rack', // starts soft and racks into focus
  'dollyIn', // the camera travels toward the speaker; the person grows faster than the wall
  'panLeft', // camera turns left: the frame slides right to left
  'panRight',
  'tiltUp', // camera tilts up from below
  'tiltDown',
  'tracking', // camera travels sideways with the speaker: the wall slides past, the person stays put
  'crane', // camera rises and looks down a little
  'orbitCam', // camera circles around the speaker in 3D
  'dollyZoom', // Hitchcock zoom: the wall stretches away while the person keeps their size
] as const;

export const transitions = [
  'cut',
  'zoomBlur',
  'whipLeft',
  'whipUp',
  'flash',
  'glitch',
  'slide',
  'dip', // dip to black
  'iris', // circle wipe
  'split', // two halves close in
  'spin',
  'blurDissolve',
] as const;

export const grades = [
  'natural',
  'warm',
  'cool',
  'mono',
  'film',
  'tealOrange',
  'pastel',
  'punchy',
  'faded',
  'neon',
  'sepia',
  'night',
] as const;

export const textures = ['none', 'grain', 'lightLeak', 'vignette', 'halftone', 'scanlines', 'dust', 'paper'] as const;

export const accents = [
  'sparkles',
  'outline', // boiling white outline around the person (needs matte)
  'arrows', // hand-drawn arrows pointing at the speaker
  'underline', // marker underline under the caption
  'emoji', // an emoji pops next to the caption
  'beatFlash', // a white flash frame on the beat
  'letterbox', // cinematic bars
  'progress', // a progress bar along the top
  'stickers', // a couple of sticker shapes
  'glow', // soft glow behind the person (needs matte)
] as const;

export const fontChoices = ['display', 'sansJP', 'serif', 'mincho'] as const;

export const accentColors = ['#E9F06B', '#FF5A36', '#3DDC97', '#5B8CFF', '#FF6FB5', '#FFC542', '#B18CFF', '#29D3F0', '#FFFFFF', '#F2E3A0'] as const;

export type CaptionStyle = (typeof captionStyles)[number];
export type CameraMove = (typeof cameraMoves)[number];
export type Transition = (typeof transitions)[number];
export type Grade = (typeof grades)[number];
export type Texture = (typeof textures)[number];
export type Accent = (typeof accents)[number];
export type FontChoice = (typeof fontChoices)[number];

/** How many different looks one beat can take: scenes × every axis × every accent subset. */
export const combinationCount = (scenes: number) =>
  scenes *
  captionStyles.length *
  cameraMoves.length *
  transitions.length *
  grades.length *
  textures.length *
  fontChoices.length *
  accentColors.length *
  2 ** accents.length;
