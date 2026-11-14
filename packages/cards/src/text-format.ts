/**
 * ตัวแปลงไฟล์ข้อมูลการ์ดแบบข้อความภาษาไทย (เช่น assets/files/SD1.text) เป็น CardDefInput
 *
 * รูปแบบไฟล์:
 *  - การ์ดแต่ละใบเป็นบล็อกคั่นด้วยบรรทัดว่าง เริ่มด้วย "ชื่อ:"
 *  - บรรทัด "การ์ดระดับ <rarity>" ก่อน "ชื่อ:" หรือฟิลด์ "ระดับ: <rarity>" = rarity
 *  - คำอธิบายท้ายบรรทัดหัวข้อ เช่น "      (มี/ไม่มี)" จะถูกตัดทิ้ง
 *  - บล็อกที่ไม่ได้ขึ้นต้นด้วยการ์ด = รายการเด็ค บรรทัดละ "<ชื่อการ์ด> <จำนวน>"
 *  - บรรทัดที่ขึ้นต้นด้วย "(" = หมายเหตุ (บรรทัดย่อหน้าที่ตามมาเป็นหมายเหตุด้วย) ไม่นำไปใช้
 *  - "Brave: เงื่อนไขร่วมร่าง : คอสต์ตั้งแต่ N ขึ้นไป" + ย่อหน้า "เอฟเฟกต์ติดตัวที่ให้ผู้ร่วมร่าง: BP +N"
 *
 * ไฟล์นี้ import แค่ type เพื่อให้สคริปต์รันด้วย node ได้ตรง ๆ (type stripping)
 */
import type { CardDefInput, Color } from './schema';
import type { DeckEntry } from './deck';

export interface TextEffect {
  /** เลเวลที่เอฟเฟกต์ทำงาน เช่น [Lv1][Lv2] → [1, 2] */
  levels?: number[];
  /** จังหวะใช้ของ Magic ([Main]/[Flash]) หรือ Burst */
  timing?: 'main' | 'flash' | 'burst';
  /** คีย์เวิร์ด Flash ของสปิริต เช่น "Flash [Quick] : ..." → 'Quick' */
  keyword?: string;
  /** ข้อความเอฟเฟกต์ดิบ (ยังไม่แปลงเป็นข้อมูล รอขั้นที่ 3) */
  text: string;
}

export interface ParsedCardSet {
  cards: CardDefInput[];
  deck: DeckEntry[];
}

export interface ParseOptions {
  /** prefix ของ cardNo เช่น "SD01" → SD01-001, SD01-002, ... ตามลำดับในไฟล์ */
  setCode: string;
}

export class CardTextError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`แปลงไฟล์การ์ดไม่สำเร็จ:\n${errors.join('\n')}`);
    this.name = 'CardTextError';
    this.errors = errors;
  }
}

const COLOR_TH: Record<string, Color> = {
  แดง: 'red',
  ม่วง: 'purple',
  เขียว: 'green',
  ขาว: 'white',
  เหลือง: 'yellow',
  ฟ้า: 'blue',
};

const TYPE_TH: Record<string, CardDefInput['type']> = {
  spirit: 'spirit',
  ultimate: 'ultimate',
  brave: 'brave',
  nexus: 'nexus',
  magic: 'magic',
};

const NONE = 'ไม่มี';

interface Line {
  no: number;
  text: string;
}

/** ตัดคำอธิบายท้ายบรรทัดหัวข้อ: วงเล็บที่อยู่หลังช่องว่างตั้งแต่ 2 ตัวขึ้นไป */
const stripHint = (value: string) => value.replace(/\s{2,}\(.*\)\s*$/, '').trim();

const isNone = (value: string) => value === '' || value === NONE || value === '0';

function splitBlocks(text: string): Line[][] {
  const blocks: Line[][] = [];
  let current: Line[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === '') {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push({ no: i + 1, text: raw.replace(/\s+$/, '') });
    }
  });
  if (current.length > 0) blocks.push(current);
  return blocks;
}

export function parseCardText(text: string, options: ParseOptions): ParsedCardSet {
  const errors: string[] = [];
  const cards: CardDefInput[] = [];
  const deckLines: Line[] = [];

  for (const block of splitBlocks(text)) {
    const first = block[0]!.text;
    if (/^ชื่อ:/.test(first) || /^การ์ดระดับ\s/.test(first)) {
      const cardNo = `${options.setCode}-${String(cards.length + 1).padStart(3, '0')}`;
      const card = parseCardBlock(block, cardNo, errors);
      if (card) cards.push(card);
    } else {
      deckLines.push(...block);
    }
  }

  const deck = parseDeck(deckLines, cards, errors);
  if (errors.length > 0) throw new CardTextError(errors);
  return { cards, deck };
}

function parseCardBlock(block: Line[], cardNo: string, errors: string[]): CardDefInput | null {
  const fields = new Map<string, { line: Line; value: string }>();
  const children = new Map<string, Line[]>();
  let rarity: string | undefined;
  let section: string | null = null;
  const before = errors.length;
  const err = (line: Line, msg: string) => errors.push(`บรรทัด ${line.no}: ${msg}`);

  for (const line of block) {
    const rarityLine = line.text.match(/^การ์ดระดับ\s+(.+)$/);
    if (rarityLine) {
      rarity = rarityLine[1]!.trim();
      continue;
    }
    if (/^\(/.test(line.text)) {
      section = '__note';
      continue;
    }
    if (/^\s/.test(line.text)) {
      if (section === '__note') continue;
      if (!section) err(line, 'บรรทัดย่อหน้าไม่อยู่ใต้หัวข้อใด');
      else children.get(section)!.push(line);
      continue;
    }
    const m = line.text.match(/^([^:]+):\s*(.*)$/);
    if (!m) {
      err(line, `อ่านบรรทัดไม่ออก: "${line.text}"`);
      continue;
    }
    const key = m[1]!.trim();
    if (fields.has(key)) err(line, `หัวข้อ "${key}" ซ้ำ`);
    fields.set(key, { line, value: stripHint(m[2]!) });
    section = key;
    children.set(key, []);
  }

  const field = (key: string) => {
    const f = fields.get(key);
    if (!f) errors.push(`บรรทัด ${block[0]!.no}: การ์ดไม่มีหัวข้อ "${key}"`);
    return f;
  };

  const name = field('ชื่อ')?.value ?? '';
  const where = `(${name || cardNo})`;
  const errIn = (line: Line, msg: string) => err(line, `${where} ${msg}`);

  const known = new Set(['ชื่อ', 'ประเภท', 'สี', 'คอสต์', 'ลดคอสต์', 'Gem symbol', 'เผ่า', 'เลเวล', 'Burst', 'เอฟเฟกต์', 'ระดับ', 'Brave']);
  for (const [key, { line }] of fields) {
    if (!known.has(key)) errIn(line, `ไม่รู้จักหัวข้อ "${key}"`);
  }
  if (fields.has('ระดับ')) rarity = fields.get('ระดับ')!.value;

  // ประเภท
  const typeField = field('ประเภท');
  const type = typeField ? TYPE_TH[typeField.value.toLowerCase()] : undefined;
  if (typeField && !type) errIn(typeField.line, `ไม่รู้จักประเภท "${typeField.value}"`);

  // สี
  const colors: Color[] = [];
  const colorField = field('สี');
  if (colorField) {
    for (const c of colorField.value.split(/[\s,/]+/).filter(Boolean)) {
      const color = COLOR_TH[c];
      if (color) colors.push(color);
      else errIn(colorField.line, `ไม่รู้จักสี "${c}"`);
    }
  }

  // คอสต์
  const costField = field('คอสต์');
  const cost = costField ? Number(costField.value) : NaN;
  if (costField && !/^\d+$/.test(costField.value)) errIn(costField.line, `คอสต์ต้องเป็นตัวเลข: "${costField.value}"`);

  // ลดคอสต์ / Gem symbol: "แดง 2, ขาว 1"
  const symbolMap = (key: string) => {
    const f = field(key);
    const map: Partial<Record<Color, number>> = {};
    if (!f || isNone(f.value)) return map;
    for (const part of f.value.split(/[,/]/).map((s) => s.trim()).filter(Boolean)) {
      const m = part.match(/^(\S+)\s+(\d+)$/);
      const color = m ? COLOR_TH[m[1]!] : undefined;
      if (!m || !color || Number(m[2]) < 1) {
        errIn(f.line, `${key} ต้องเป็นรูปแบบ "สี จำนวน": "${part}"`);
        continue;
      }
      map[color] = (map[color] ?? 0) + Number(m[2]);
    }
    return map;
  };
  const reduction = symbolMap('ลดคอสต์');
  const symbols = symbolMap('Gem symbol');

  // เผ่า: คั่นด้วย , หรือ /
  const familyField = field('เผ่า');
  const family =
    familyField && !isNone(familyField.value)
      ? familyField.value.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
      : [];

  // เลเวล: "Lv1  Core 1  BP 3000" (Nexus ไม่มี BP)
  const levels: { level: number; cores: number; bp?: number }[] = [];
  const levelField = field('เลเวล');
  if (levelField && levelField.value !== '' && !isNone(levelField.value)) {
    errIn(levelField.line, 'ให้เขียนเลเวลในบรรทัดย่อหน้าถัดไป หรือ "ไม่มี"');
  }
  for (const line of children.get('เลเวล') ?? []) {
    const m = line.text.trim().match(/^Lv(\d+)\s+Core\s+(\d+)(?:\s+BP\s+(\d+))?$/i);
    if (!m) {
      errIn(line, `เลเวลต้องเป็นรูปแบบ "Lv1  Core 1  BP 3000": "${line.text.trim()}"`);
      continue;
    }
    levels.push({ level: Number(m[1]), cores: Number(m[2]), ...(m[3] ? { bp: Number(m[3]) } : {}) });
  }

  // Burst: "ไม่มี" หรือข้อความเงื่อนไข Burst
  const effects: TextEffect[] = [];
  const burstField = field('Burst');
  const burst = !!burstField && !isNone(burstField.value);
  if (burstField && burst) {
    const text = [burstField.value, ...(children.get('Burst') ?? []).map((l) => l.text.trim())].join(' ');
    effects.push({ timing: 'burst', text });
  }

  // เอฟเฟกต์: "[Lv1][Lv2] ข้อความ" / "[Main] ข้อความ" / "[Flash] ข้อความ"
  const effectField = field('เอฟเฟกต์');
  if (effectField && !isNone(effectField.value) && effectField.value !== '') {
    errIn(effectField.line, 'ให้เขียนเอฟเฟกต์ในบรรทัดย่อหน้าถัดไป หรือ "ไม่มี"');
  }
  for (const line of children.get('เอฟเฟกต์') ?? []) {
    effects.push(parseEffectLine(line, type, (msg) => errIn(line, msg)));
  }

  // Brave: เงื่อนไขร่วมร่าง + เอฟเฟกต์ติดตัวที่ให้ผู้ร่วมร่าง
  let braveCondition: CardDefInput['braveCondition'];
  const braveField = fields.get('Brave');
  if (braveField) {
    const all = [braveField.value, ...(children.get('Brave') ?? []).map((l) => l.text.trim())].join(' ');
    const minCost = all.match(/คอสต์ตั้งแต่\s*(\d+)/);
    const bp = all.match(/BP\s*\+\s*(\d+)/);
    if (!minCost) errIn(braveField.line, 'Brave ต้องระบุ "คอสต์ตั้งแต่ N ขึ้นไป"');
    braveCondition = { maxSpirits: 1, ...(minCost ? { minCost: Number(minCost[1]) } : {}), ...(bp ? { bp: Number(bp[1]) } : {}) };
  } else if (type === 'brave') {
    errIn(block[0]!, 'การ์ด Brave ต้องมีหัวข้อ "Brave:"');
  }

  if (errors.length > before || !type) return null;
  return {
    cardNo,
    name,
    type,
    cost,
    colors,
    reduction,
    symbols,
    family,
    levels,
    burst,
    effects,
    ...(rarity ? { rarity } : {}),
    ...(braveCondition ? { braveCondition } : {}),
  };
}

function parseEffectLine(line: Line, type: CardDefInput['type'] | undefined, err: (msg: string) => void): TextEffect {
  let rest = line.text.trim();
  const levels: number[] = [];
  let m: RegExpMatchArray | null;
  while ((m = rest.match(/^\[Lv(\d+)\]\s*/i))) {
    levels.push(Number(m[1]));
    rest = rest.slice(m[0].length);
  }
  if (levels.length > 0) return { levels, text: rest };

  const keyword = rest.match(/^Flash\s*\[([^\]]+)\]\s*:?\s*/i);
  if (keyword && type !== 'magic') return { keyword: keyword[1]!.trim(), text: rest.slice(keyword[0].length) };

  const timing = rest.match(/^\[(Main|Flash)\]\s*/i);
  if (timing) {
    if (type !== 'magic') err('[Main]/[Flash] นำหน้าเอฟเฟกต์ใช้กับ Magic เท่านั้น');
    return { timing: timing[1]!.toLowerCase() as 'main' | 'flash', text: rest.slice(timing[0].length) };
  }
  if (type !== 'magic') err('เอฟเฟกต์ของการ์ดที่มีเลเวลต้องขึ้นต้นด้วย [LvX]');
  else err('เอฟเฟกต์ Magic ต้องขึ้นต้นด้วย [Main] หรือ [Flash]');
  return { text: rest };
}

function parseDeck(lines: Line[], cards: CardDefInput[], errors: string[]): DeckEntry[] {
  const byName = new Map(cards.map((c) => [c.name, c.cardNo]));
  const counts = new Map<string, number>();
  for (const line of lines) {
    const m = line.text.trim().match(/^(.+?)\s+(\d+)$/);
    if (!m) {
      errors.push(`บรรทัด ${line.no}: รายการเด็คต้องเป็นรูปแบบ "<ชื่อการ์ด> <จำนวน>": "${line.text.trim()}"`);
      continue;
    }
    const cardNo = byName.get(m[1]!);
    if (!cardNo) {
      errors.push(`บรรทัด ${line.no}: ไม่พบการ์ดชื่อ "${m[1]}" ในไฟล์`);
      continue;
    }
    counts.set(cardNo, (counts.get(cardNo) ?? 0) + Number(m[2]));
  }
  return [...counts].map(([cardNo, count]) => ({ cardNo, count }));
}
