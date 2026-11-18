/**
 * แปลงไฟล์ข้อมูลการ์ดแบบข้อความใน assets/files เป็น JSON ใน packages/cards/data
 * รัน: npm run cards
 *
 * หาชุดการ์ดเองทั้งหมด:
 *  - ไฟล์ <ตัวอักษร><เลข>.text เช่น SD1.text → SD01 (Starter Deck: รหัส SD01-001, 002 … ตามลำดับในไฟล์)
 *  - โฟลเดอร์ <ตัวอักษร><เลข>/ เช่น BS01/Spirits.text, BS01/Magic.text → BS01 (Booster Set: แยกไฟล์ได้ตามสะดวก)
 *    รหัสอัตโนมัติแยกตามประเภท BS01-SP001 (Spirit) UL (Ultimate) BR (Brave) NX (Nexus) MG (Magic)
 * - การ์ดที่ใส่ "รหัส:" ใช้รหัสนั้น
 * - รายการเด็คอ้างชื่อการ์ดจากชุดอื่นได้ (ข้อมูลการ์ดเขียนไว้ที่เดียว)
 * - ชื่อการ์ดหรือรหัสการ์ดซ้ำกัน = error (ยกเว้นต่างอาร์ตในชุดเดียวกัน: ข้อมูลเหมือนกันทุกช่องยกเว้นรหัส)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CardTextError, parseCardText, type ParseOptions } from '../packages/cards/src/text-format.ts';
import type { CardDefInput } from '../packages/cards/src/schema.ts';
import type { DeckEntry } from '../packages/cards/src/deck.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = root + 'assets/files/';

type SetSource = { setCode: string; out: string; files: string[]; byType: boolean };
const SETS: SetSource[] = readdirSync(dir)
  .map((name): SetSource | null => {
    const isDir = statSync(dir + name).isDirectory();
    const m = name.match(isDir ? /^([A-Za-z]+)(\d+)$/ : /^([A-Za-z]+)(\d+)\.text$/);
    if (!m) return null;
    const setCode = `${m[1]!.toUpperCase()}${m[2]!.padStart(2, '0')}`;
    const files = isDir
      ? readdirSync(dir + name)
          .filter((f) => f.endsWith('.text'))
          .sort()
          .map((f) => `assets/files/${name}/${f}`)
      : [`assets/files/${name}`];
    return { setCode, out: setCode.toLowerCase(), files, byType: isDir };
  })
  .filter((s): s is SetSource => !!s && s.files.length > 0)
  .sort((a, b) => a.setCode.localeCompare(b.setCode));

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(msg);
};

/** แปลงทุกไฟล์ของชุด (ไฟล์ในโฟลเดอร์เดียวกันใช้ตัวนับรหัสร่วมกัน) */
function parseSet(set: SetSource, extra: Partial<ParseOptions>): { cards: CardDefInput[]; deck: DeckEntry[] } | null {
  const counters = set.byType ? {} : undefined;
  const cards: CardDefInput[] = [];
  const deck: DeckEntry[] = [];
  let ok = true;
  for (const file of set.files) {
    try {
      const r = parseCardText(readFileSync(root + file, 'utf8'), {
        setCode: set.setCode,
        ...extra,
        ...(counters ? { typeCounters: counters } : {}),
        // ไฟล์อื่นในโฟลเดอร์เดียวกัน = การ์ดของชุดนี้ที่รายการเด็คอ้างได้
        otherCards: [...(extra.otherCards ?? []), ...cards],
      });
      cards.push(...r.cards);
      deck.push(...r.deck);
    } catch (e) {
      ok = false;
      fail(`${file}: ${e instanceof CardTextError ? e.message : String(e)}`);
    }
  }
  return ok ? { cards, deck } : null;
}

// รอบแรก: อ่านการ์ดทุกชุด (ยังไม่สนรายการเด็ค) เพื่อให้รายการเด็คอ้างการ์ดข้ามชุดได้
const bySet = new Map<string, CardDefInput[]>();
for (const set of SETS) {
  const r = parseSet(set, { skipDeck: true });
  if (r) bySet.set(set.setCode, r.cards);
}

// ชื่อ/รหัสซ้ำ (ทั้งข้ามชุดและข้ามไฟล์ในชุดเดียวกัน)
// ยกเว้นการ์ดต่างอาร์ต (การ์ดใบเดียวกันคนละภาพ): ชื่อซ้ำได้ในชุดเดียวกัน ถ้าข้อมูลทุกช่องตรงกันยกเว้นรหัส
// (ลิมิตในเด็คนับตามชื่อ = รวมกันไม่เกิน 3 ใบ, สคริปต์ผูกตามชื่อ = ใช้ร่วมกัน)
const seenName = new Map<string, { setCode: string; card: CardDefInput }>();
const seenNo = new Map<string, string>();
const sameExceptNo = (a: CardDefInput, b: CardDefInput) => JSON.stringify({ ...a, cardNo: '' }) === JSON.stringify({ ...b, cardNo: '' });
for (const [setCode, cards] of bySet) {
  for (const c of cards) {
    const seen = seenName.get(c.name);
    if (seen && seen.setCode !== setCode) {
      fail(`การ์ด "${c.name}" เขียนไว้ทั้งใน ${seen.setCode} และ ${setCode}: ให้เขียนข้อมูลเต็มไว้ที่เดียว อีกที่ใส่แค่ชื่อในรายการเด็ค`);
    } else if (seen && !sameExceptNo(seen.card, c)) {
      fail(`การ์ด "${c.name}" (${seen.card.cardNo} กับ ${c.cardNo}) ชื่อซ้ำแต่ข้อมูลไม่ตรงกัน: ถ้าเป็นต่างอาร์ต ข้อมูลทุกช่องต้องเหมือนกันยกเว้นรหัส`);
    }
    if (seenNo.has(c.cardNo)) fail(`รหัสการ์ด ${c.cardNo} ซ้ำกันใน ${seenNo.get(c.cardNo)} และ ${setCode}`);
    if (!seen) seenName.set(c.name, { setCode, card: c });
    seenNo.set(c.cardNo, setCode);
  }
}

// รอบสอง: แปลงจริง + รายการเด็คที่อ้างการ์ดข้ามชุด
for (const set of SETS) {
  if (!bySet.has(set.setCode)) continue;
  const otherCards = [...bySet].filter(([code]) => code !== set.setCode).flatMap(([, cards]) => cards);
  const r = parseSet(set, { otherCards });
  if (!r) continue;
  const { cards, deck } = r;
  writeFileSync(`${root}packages/cards/data/${set.out}.json`, JSON.stringify(cards, null, 2) + '\n');
  writeFileSync(`${root}packages/cards/data/${set.out}-deck.json`, JSON.stringify(deck, null, 2) + '\n');
  const total = deck.reduce((n, e) => n + e.count, 0);
  const foreign = deck.filter((e) => !cards.some((c) => c.cardNo === e.cardNo)).length;
  const where = set.byType ? `assets/files/${set.setCode}/ (${set.files.length} ไฟล์)` : set.files[0];
  console.log(
    `${where}: การ์ด ${cards.length} ใบ${total ? `, เด็ค ${total} ใบ` : ''}${foreign ? ` (การ์ดจากชุดอื่น ${foreign} ชนิด)` : ''} → data/${set.out}.json`,
  );
}

if (failed) process.exit(1);
