// Usage:
//   node server/cli.ts models
//   node server/cli.ts product --photo path.jpg --brand ATO --name "ÉCLAT DE TEMPS" \
//     --facts "18K rose gold case, sapphire crystal" [--style luxury|clean|cosmetic|natural] \
//     [--video] [--on-skin] [--cta "詳しくはプロフィールへ"] [--handle @ato] [--lang ja] [--no-render]
//   node server/cli.ts matte --video talk.mp4 --out public/uploads/talk-matte.webm [--model u2net_human_seg]
//   node server/cli.ts fivepass --pass 1 --video talk.mp4 [--lang ja]        (prints the job id)
//   node server/cli.ts fivepass --pass 2..5 --job <id> [--note "白い縁取りが偽物っぽい"]
//   node server/cli.ts fivepass --restore 3 --version 1 --job <id>
import { parseArgs } from 'node:util';
import { listModels } from './gemini.ts';
import { models } from './config.ts';
import { buildProductReel, STYLES, type Style } from './product.ts';
import { matte } from './matte.ts';
import { pass1, restoreVersion, runPass } from './fivepass.ts';
import { isLang } from '../src/lang.ts';
import { Usage } from './usage.ts';

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'models') {
  const names = await listModels();
  for (const [role, id] of Object.entries(models)) {
    console.log(`${role.padEnd(5)} ${id} ${names.includes(id) ? 'OK' : 'NOT AVAILABLE for this key'}`);
  }
} else if (cmd === 'product') {
  const { values } = parseArgs({
    args: rest,
    options: {
      photo: { type: 'string' },
      brand: { type: 'string' },
      name: { type: 'string' },
      facts: { type: 'string', default: '' },
      style: { type: 'string', default: 'luxury' },
      cta: { type: 'string', default: '詳しくはプロフィールへ' },
      handle: { type: 'string', default: '' },
      video: { type: 'boolean', default: false },
      'on-skin': { type: 'boolean', default: false },
      job: { type: 'string' },
      lang: { type: 'string', default: 'ja' },
      'no-render': { type: 'boolean', default: false },
    },
  });
  if (!isLang(values.lang)) throw new Error('--lang must be one of ja, en, fr, id, zh, es, ta');
  if (!values.photo || !values.brand || !values.name) throw new Error('--photo, --brand and --name are required');
  if (!(values.style! in STYLES)) throw new Error(`--style must be one of ${Object.keys(STYLES).join(', ')}`);
  const res = await buildProductReel({
    photo: values.photo,
    brand: values.brand,
    productName: values.name,
    facts: values.facts!,
    style: values.style as Style,
    cta: values.cta!,
    handle: values.handle!,
    video: values.video!,
    onSkin: values['on-skin']!,
    jobId: values.job,
    lang: values.lang,
    render: !values['no-render'],
  });
  console.log(JSON.stringify({ jobId: res.jobId, out: res.out, usage: res.usage }, null, 2));
} else if (cmd === 'matte') {
  const { values } = parseArgs({
    args: rest,
    options: { video: { type: 'string' }, out: { type: 'string' }, model: { type: 'string' }, height: { type: 'string' } },
  });
  if (!values.video || !values.out) throw new Error('--video and --out are required');
  const usage = new Usage();
  const info = await matte(values.video, values.out, usage, { model: values.model, height: values.height ? Number(values.height) : undefined });
  console.log(JSON.stringify(info));
} else if (cmd === 'fivepass') {
  const { values } = parseArgs({
    args: rest,
    options: { pass: { type: 'string' }, video: { type: 'string' }, job: { type: 'string' }, note: { type: 'string' }, lang: { type: 'string' }, restore: { type: 'string' }, version: { type: 'string' } },
  });
  if (values.restore) {
    if (!values.job || !values.version) throw new Error('--restore needs --job and --version');
    await restoreVersion(values.job, Number(values.restore), Number(values.version));
    console.log(JSON.stringify({ job: values.job, restored: { pass: Number(values.restore), version: Number(values.version) } }));
  } else {
    const pass = Number(values.pass ?? 1);
    if (pass === 1) {
      if (!values.video) throw new Error('--video is required for pass 1');
      const r = await pass1({ video: values.video, jobId: values.job, lang: isLang(values.lang) ? values.lang : undefined });
      console.log(JSON.stringify({ job: r.jobId, pass: 1, version: r.version, words: r.props.words.length, usage: r.usage }));
    } else {
      if (!values.job) throw new Error('--job is required for passes 2-5');
      const r = await runPass(pass, { jobId: values.job, note: values.note });
      console.log(JSON.stringify({ job: values.job, pass, version: r.version, usage: r.usage }));
    }
  }
} else {
  console.error('commands: models | product | matte | fivepass');
  process.exit(1);
}
