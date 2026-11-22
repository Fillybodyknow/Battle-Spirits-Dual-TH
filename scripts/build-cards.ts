/**
 * แปลงไฟล์ข้อมูลการ์ดแบบข้อความใน assets/files เป็น JSON ใน packages/cards/data
 * รัน: npm run cards
 *
 * โครงไฟล์:
 *  - assets/files/cards/<ต้นรหัส>/*.text  การ์ดทั้งหมด แยกโฟลเดอร์ตามต้นรหัสที่พิมพ์บนการ์ด (BS31/, SD32/, BSC23/, PX/ …)
 *    แยกไฟล์ในโฟลเดอร์ได้ตามสะดวก (Spirits / Brave / Ultimate / Nexus / Magic)
 *    ทุกใบต้องมี "รหัส:" (รหัสที่พิมพ์บนการ์ด ต้นรหัสตรงกับโฟลเดอร์) และ "ชุด:" (ชุดในเกม BS01 … ที่การ์ดอยู่)
 *  - assets/files/<ตัวอักษร><เลข>.text เช่น SD1.text → SD01: Starter Deck (รายการเด็คท้ายไฟล์ อ้างชื่อการ์ดจาก cards/)
 * ผลลัพธ์แยกตามชุดในเกม: data/<ชุด>.json (+ <ชุด>-deck.json) · สคริปต์เอฟเฟกต์ยังแยกตามชุดในเกม (<ชุด>-scripts.ts)
 * - ชื่อการ์ดหรือรหัสการ์ดซ้ำกัน = error (ยกเว้นต่างอาร์ตในชุดเดียวกัน: ข้อมูลเหมือนกันทุกช่องยกเว้นรหัส)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CardTextError, parseCardText } from '../packages/cards/src/text-format.ts';
import type { CardDefInput } from '../packages/cards/src/schema.ts';
import type { DeckEntry } from '../packages/cards/src/deck.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = root + 'assets/files/';
const cardsDir = dir + 'cards/';

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(msg);
};

// ---------------------------------------------------------------- การ์ดทั้งหมด (โฟลเดอร์ตามต้นรหัส)
const all: CardDefInput[] = [];
const prefixes = readdirSync(cardsDir)
  .filter((p) => statSync(cardsDir + p).isDirectory())
  .sort();
for (const prefix of prefixes) {
  const counters = {};
  for (const f of readdirSync(cardsDir + prefix).filter((x) => x.endsWith('.text')).sort()) {
    const file = `assets/files/cards/${prefix}/${f}`;
    try {
      const r = parseCardText(readFileSync(root + file, 'utf8'), { setCode: prefix, typeCounters: counters, skipDeck: true });
      for (const c of r.cards) {
        if (!c.cardNo.startsWith(prefix + '-')) fail(`${file}: (${c.name}) รหัส ${c.cardNo} ไม่ได้ขึ้นต้นด้วย ${prefix}: ย้ายไปไว้ในโฟลเดอร์ cards/${c.cardNo.split('-')[0]}/`);
        if (!c.set || c.set === prefix) fail(`${file}: (${c.name}) ต้องมีหัวข้อ "ชุด:" บอกชุดในเกม เช่น "ชุด: BS01"`);
      }
      all.push(...r.cards);
    } catch (e) {
      fail(`${file}: ${e instanceof CardTextError ? e.message : String(e)}`);
    }
  }
}

// ชื่อ/รหัสซ้ำ · ต่างอาร์ต (การ์ดใบเดียวกันคนละภาพ): ชื่อซ้ำได้ในชุดเดียวกัน ถ้าข้อมูลทุกช่องตรงกันยกเว้นรหัส
const seenName = new Map<string, CardDefInput>();
const seenNo = new Set<string>();
const sameExceptNo = (a: CardDefInput, b: CardDefInput) => JSON.stringify({ ...a, cardNo: '' }) === JSON.stringify({ ...b, cardNo: '' });
for (const c of all) {
  const seen = seenName.get(c.name);
  if (seen && seen.set !== c.set) {
    fail(`การ์ด "${c.name}" เขียนไว้ทั้งใน ${seen.set} (${seen.cardNo}) และ ${c.set} (${c.cardNo}): การ์ดหนึ่งใบอยู่ได้ชุดเดียว`);
  } else if (seen && !sameExceptNo(seen, c)) {
    fail(`การ์ด "${c.name}" (${seen.cardNo} กับ ${c.cardNo}) ชื่อซ้ำแต่ข้อมูลไม่ตรงกัน: ถ้าเป็นต่างอาร์ต ข้อมูลทุกช่องต้องเหมือนกันยกเว้นรหัส`);
  }
  if (seenNo.has(c.cardNo)) fail(`รหัสการ์ด ${c.cardNo} ซ้ำกัน`);
  if (!seen) seenName.set(c.name, c);
  seenNo.add(c.cardNo);
}

// จัดกลุ่มตามชุดในเกม
const bySet = new Map<string, CardDefInput[]>();
for (const c of all) {
  if (!bySet.has(c.set!)) bySet.set(c.set!, []);
  bySet.get(c.set!)!.push(c);
}

// ---------------------------------------------------------------- Starter Deck (รายการเด็ค)
const starters = readdirSync(dir)
  .map((name) => ({ name, m: name.match(/^([A-Za-z]+)(\d+)\.text$/) }))
  .filter((x) => x.m && statSync(dir + x.name).isFile())
  .map((x) => ({ file: `assets/files/${x.name}`, setCode: `${x.m![1]!.toUpperCase()}${x.m![2]!.padStart(2, '0')}` }))
  .sort((a, b) => a.setCode.localeCompare(b.setCode));
const decks = new Map<string, { cards: CardDefInput[]; deck: DeckEntry[]; file: string }>();
for (const s of starters) {
  try {
    const r = parseCardText(readFileSync(root + s.file, 'utf8'), { setCode: s.setCode, otherCards: all });
    if (r.cards.length > 0) fail(`${s.file}: เขียนข้อมูลการ์ดไว้ในไฟล์เด็ค (${r.cards.map((c) => c.name).join(', ')}): ย้ายไปไว้ใน assets/files/cards/<ต้นรหัส>/ พร้อม "ชุด:"`);
    decks.set(s.setCode, { cards: r.cards, deck: r.deck, file: s.file });
  } catch (e) {
    fail(`${s.file}: ${e instanceof CardTextError ? e.message : String(e)}`);
  }
}

if (failed) process.exit(1);

// ---------------------------------------------------------------- เขียนผลลัพธ์
for (const [set, cards] of [...bySet].sort(([a], [b]) => a.localeCompare(b))) {
  const out = set.toLowerCase();
  writeFileSync(`${root}packages/cards/data/${out}.json`, JSON.stringify(cards, null, 2) + '\n');
  writeFileSync(`${root}packages/cards/data/${out}-deck.json`, JSON.stringify([], null, 2) + '\n');
  const from = [...new Set(cards.map((c) => c.cardNo.split('-')[0]))].join(', ');
  console.log(`${set}: การ์ด ${cards.length} ใบ (จาก ${from}) → data/${out}.json`);
}
for (const [set, { deck, file }] of decks) {
  const out = set.toLowerCase();
  // ชุด Starter ที่มีการ์ดของตัวเอง (เช่น เบิร์สวอลล์ ชุด: SD01) เขียนไฟล์การ์ดไปแล้วด้านบน
  if (!bySet.has(set)) writeFileSync(`${root}packages/cards/data/${out}.json`, JSON.stringify([], null, 2) + '\n');
  writeFileSync(`${root}packages/cards/data/${out}-deck.json`, JSON.stringify(deck, null, 2) + '\n');
  console.log(`${file}: เด็ค ${deck.reduce((n, e) => n + e.count, 0)} ใบ → data/${out}-deck.json`);
}
