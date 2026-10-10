// Usage:
//   node server/cli.ts models
//   node server/cli.ts product --photo path.jpg --brand ATO --name "ÉCLAT DE TEMPS" \
//     --facts "18K rose gold case, sapphire crystal" [--style luxury|clean|cosmetic|natural] \
//     [--video] [--on-skin] [--cta "詳しくはプロフィールへ"] [--handle @ato]
import { parseArgs } from 'node:util';
import { listModels } from './gemini.ts';
import { models } from './config.ts';
import { buildProductReel, STYLES, type Style } from './product.ts';

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
} else {
  console.error('commands: models | product');
  process.exit(1);
}
