// Synthesises the three cue sounds the 5-pass template uses (whoosh, tap, chime) with ffmpeg, so they are
// ours to use commercially and need no download. Writes public/sfx/*.wav (48 kHz stereo).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('public/sfx', { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const out = (n) => ['-ar', '48000', '-ac', '2', `public/sfx/${n}.wav`];

// whoosh: pink noise through a band that sweeps up, swelling in and falling away (0.7 s)
ff([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.7:c=pink:a=0.9:r=48000',
  '-af', [
    "volume='if(lt(t,0.42),pow(t/0.42,2),pow(max(0,(0.7-t)/0.28),1.5))':eval=frame",
    'highpass=f=250',
    'lowpass=f=6000',
    'bandpass=f=1800:width_type=o:w=2.2',
    'volume=6',
    'afade=t=out:st=0.6:d=0.1',
  ].join(','),
  ...out('whoosh'),
]);

// tap: a short soft click, a sine blip with a fast decay plus a tiny noise transient (0.12 s)
ff([
  '-f', 'lavfi', '-i', "aevalsrc='0.55*sin(2*PI*1650*t)*exp(-t*55)+0.25*sin(2*PI*3300*t)*exp(-t*90)':s=48000:d=0.12",
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.012:c=white:a=0.25:r=48000',
  '-filter_complex', '[1]highpass=f=3000[n];[0][n]amix=inputs=2:normalize=0,afade=t=out:st=0.09:d=0.03',
  ...out('tap'),
]);

// chime: three bell partials (A5, E6, A6) with long decays (1.6 s)
ff([
  '-f', 'lavfi', '-i',
  "aevalsrc='0.32*sin(2*PI*880*t)*exp(-t*2.6)+0.22*sin(2*PI*1318.5*t)*exp(-t*3.4)+0.14*sin(2*PI*1760*t)*exp(-t*4.5)+0.06*sin(2*PI*2637*t)*exp(-t*7)':s=48000:d=1.6",
  '-af', 'afade=t=in:d=0.004,afade=t=out:st=1.4:d=0.2',
  ...out('chime'),
]);
console.log('wrote public/sfx/whoosh.wav, tap.wav, chime.wav');
