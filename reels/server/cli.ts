// Usage:
//   node server/cli.ts models
//   node server/cli.ts product --photo path.jpg --brand ATO --name "ÉCLAT DE TEMPS" \
//     --facts "18K rose gold case, sapphire crystal" [--style luxury|clean|cosmetic|natural] \
//     [--video] [--on-skin] [--cta "詳しくはプロフィールへ"] [--handle @ato]
//   node server/cli.ts matte --video talk.mp4 --out public/uploads/talk-matte.webm [--model u2net_human_seg]
import { parseArgs } from 'node:util';
import { listModels } from './gemini.ts';
import { models } from './config.ts';
import { buildProductReel, STYLES, type Style } from './product.ts';
import { matte } from './matte.ts';
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
    },
  });
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
  });
  console.log(JSON.stringify({ out: res.out, usage: res.usage }, null, 2));
} else if (cmd === 'matte') {
  const { values } = parseArgs({
    args: rest,
    options: { video: { type: 'string' }, out: { type: 'string' }, model: { type: 'string' }, height: { type: 'string' } },
  });
  if (!values.video || !values.out) throw new Error('--video and --out are required');
  const usage = new Usage();
  const info = await matte(values.video, values.out, usage, { model: values.model, height: values.height ? Number(values.height) : undefined });
  console.log(JSON.stringify(info));
} else {
  console.error('commands: models | product | matte');
  process.exit(1);
}
