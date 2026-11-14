/**
 * แปลงไฟล์ข้อมูลการ์ดแบบข้อความใน assets/files เป็น JSON ใน packages/cards/data
 * รัน: npm run cards
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CardTextError, parseCardText } from '../packages/cards/src/text-format.ts';

const SETS = [
  { source: 'assets/files/SD1.text', setCode: 'SD01', out: 'sd01' },
  { source: 'assets/files/SD2.text', setCode: 'SD02', out: 'sd02' },
  { source: 'assets/files/SD3.text', setCode: 'SD03', out: 'sd03' },
];

const root = fileURLToPath(new URL('..', import.meta.url));
let failed = false;

for (const { source, setCode, out } of SETS) {
  try {
    const { cards, deck } = parseCardText(readFileSync(root + source, 'utf8'), { setCode });
    writeFileSync(`${root}packages/cards/data/${out}.json`, JSON.stringify(cards, null, 2) + '\n');
    writeFileSync(`${root}packages/cards/data/${out}-deck.json`, JSON.stringify(deck, null, 2) + '\n');
    const total = deck.reduce((n, e) => n + e.count, 0);
    console.log(`${source}: การ์ด ${cards.length} ใบ, เด็ค ${total} ใบ → data/${out}.json, data/${out}-deck.json`);
  } catch (e) {
    failed = true;
    console.error(`${source}: ${e instanceof CardTextError ? e.message : String(e)}`);
  }
}

if (failed) process.exit(1);
