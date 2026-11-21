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
 *    บรรทัดย่อหน้าใต้ Brave ที่ขึ้นต้นด้วย "[" = เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ (เป็นบรรทัดเอฟเฟกต์ granted: true)
 *  - เอฟเฟกต์ที่ขึ้นต้นด้วย "การ์ด...นี้บนมือเรา" = ทำงานขณะการ์ดอยู่บนมือ (hand: true)
 *
 * ไฟล์นี้ import แค่ type เพื่อให้สคริปต์รันด้วย node ได้ตรง ๆ (type stripping)
 */
import type { CardDefInput, Color, SymbolColor } from './schema';
import type { DeckEntry, Foil } from './deck';

export interface TextEffect {
  /** เลเวลที่เอฟเฟกต์ทำงาน เช่น [Lv1][Lv2] → [1, 2] */
  levels?: number[];
  /** จังหวะใช้ของ Magic ([Main]/[Flash]) หรือ Burst */
  timing?: 'main' | 'flash' | 'burst';
  /** คีย์เวิร์ด Flash ของสปิริต เช่น "Flash [Quick] : ..." → 'Quick' */
  keyword?: string;
  /** ข้อความเอฟเฟกต์ดิบ (ยังไม่แปลงเป็นข้อมูล รอขั้นที่ 3) */
  text: string;
  /** Brave: เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ */
  granted?: true;
  /** ทำงานขณะการ์ดอยู่บนมือ */
  hand?: true;
  /** "[ร่วมร่าง][LvX] ..." บนสปิริต: ทำงานเฉพาะตอนสปิริตนี้ร่วมร่างกับ Brave อยู่ */
  whileBraved?: true;
  /** "Flash ..." ของสปิริต/การ์ดที่ไม่ใช่ Magic ที่ไม่มีคีย์เวิร์ด (ใช้ใน Flash Timing) */
  flash?: true;
}

export interface ParsedCardSet {
  cards: CardDefInput[];
  deck: DeckEntry[];
}

export interface ParseOptions {
  /** prefix ของ cardNo เช่น "SD01" → SD01-001, SD01-002, ... ตามลำดับในไฟล์ (การ์ดที่ไม่ได้ระบุ "รหัส:") */
  setCode: string;
  /**
   * การ์ดจากชุดอื่น: รายการเด็คอ้างชื่อการ์ดที่เขียนไว้ในไฟล์ชุดอื่นได้
   * (เช่น Starter Deck ที่มีการ์ดจาก Booster Set — ข้อมูลการ์ดเขียนไว้ที่เดียว)
   */
  otherCards?: readonly { name: string; cardNo: string }[];
  /** อ่านเฉพาะการ์ด ไม่แปลงรายการเด็ค (รอบแรกของ npm run cards ก่อนรู้การ์ดของชุดอื่น) */
  skipDeck?: boolean;
  /**
   * รหัสอัตโนมัติ (Booster Set): <ชุด>-<ประเภท>-<ระดับ><เลข> เช่น BS01-SP-R001, BS01-MG-C001
   * นับแยกตาม ประเภท + ระดับความหายาก · ส่งตัวนับเดียวกันให้ทุกไฟล์ในชุด (โฟลเดอร์ BS01/) เลขจะได้ต่อกัน
   */
  typeCounters?: Record<string, number>;
}

/** รหัสที่พิมพ์บนการ์ดจริง: <ชุด>-<ระดับ><เลข> (BS31-C003, BS19-X08, BSC23-XCP01) · ต่างอาร์ตรหัสเดียวกัน = ต่อท้าย -2 */
const PRINTED_CODE = /^[A-Z]+\d*-[A-Z]+\d+(-\d+)?$/;

/** ตัวย่อประเภทการ์ดในรหัส (Booster Set) */
export const TYPE_CODE: Record<CardDefInput['type'], string> = { spirit: 'SP', ultimate: 'UL', brave: 'BR', nexus: 'NX', magic: 'MG' };

/** ระดับความหายากในรหัส: C U R M X XX XV … (UC → U, X-Rare → X) · ไม่มีระดับ = null */
function rarityCode(raw: string | undefined): string | null {
  if (!raw) return null;
  let code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (code === 'UC') code = 'U';
  if (code === 'X-RARE' || code === 'XRARE') code = 'X';
  return /^[A-Z]+$/.test(code) ? code : null;
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
    // บล็อกคำอธิบาย (ทุกบรรทัดเป็นรายการลำดับเลข เช่นตารางระดับความหายาก): ข้าม
    if (block.every((l) => /^\d+\.\s/.test(l.text))) continue;
    if (/^ชื่อ:/.test(first) || /^การ์ดระดับ\s/.test(first)) {
      const cardNo = `${options.setCode}-${String(cards.length + 1).padStart(3, '0')}`;
      const card = parseCardBlock(block, options.typeCounters ? '' : cardNo, errors);
      if (card && options.typeCounters) {
        // Booster Set: รหัส <ชุด>-<ประเภท>-<ระดับ><เลข> เช่น BS01-SP-R001 (นับแยกตามประเภท + ระดับ)
        const type = TYPE_CODE[card.type];
        const rarity = rarityCode(card.rarity);
        if (!rarity) {
          errors.push(`บรรทัด ${block[0]!.no}: (${card.name}) ต้องมีระดับความหายาก "การ์ดระดับ C/U/R/M/X" (ใช้ในรหัสการ์ด)`);
        } else if (card.cardNo === '') {
          const key = `${type}-${rarity}`;
          const n = (options.typeCounters[key] ?? 0) + 1;
          options.typeCounters[key] = n;
          card.cardNo = `${options.setCode}-${type}-${rarity}${String(n).padStart(3, '0')}`;
        } else if (!PRINTED_CODE.test(card.cardNo) || !card.cardNo.split('-')[1]!.startsWith(rarity)) {
          // รหัสที่พิมพ์บนการ์ดจริง (ล่างขวา) เช่น "BS31 C 003/114" → BS31-C003, "BS19 X 08" → BS19-X08
          errors.push(
            `บรรทัด ${block[0]!.no}: (${card.name}) รหัส ${card.cardNo} ต้องเป็นรหัสที่พิมพ์บนการ์ด รูปแบบ <ชุด>-<ระดับ><เลข> เช่น BS31-${rarity}003 (ระดับต้องตรงกับ "การ์ดระดับ ${rarity}")`,
          );
        }
      }
      if (card && options.typeCounters) card.set = options.setCode;
      if (card) {
        const dup = cards.find((c) => c.cardNo === card.cardNo);
        if (dup) errors.push(`บรรทัด ${block[0]!.no}: รหัสการ์ด ${card.cardNo} ซ้ำกับ "${dup.name}"`);
        cards.push(card);
      }
    } else {
      deckLines.push(...block);
    }
  }

  const deck = options.skipDeck ? [] : parseDeck(deckLines, [...cards, ...(options.otherCards ?? []).filter((o) => !cards.some((c) => c.name === o.name))], errors);
  if (errors.length > 0) throw new CardTextError(errors);
  return { cards, deck };
}

function parseCardBlock(block: Line[], autoCardNo: string, errors: string[]): CardDefInput | null {
  let cardNo = autoCardNo;
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
  /** หัวข้อที่ไม่เขียนก็ได้ (ถือว่า "ไม่มี") */
  const optional = (key: string) => fields.get(key);

  const name = field('ชื่อ')?.value ?? '';
  // รหัสการ์ดตามที่พิมพ์บนการ์ดจริง (ไม่ใส่ = นับตามลำดับในไฟล์) ใช้เป็นชื่อไฟล์ภาพด้วย
  const codeField = fields.get('รหัส');
  if (codeField) {
    const code = codeField.value.trim().toUpperCase();
    if (/^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(code)) cardNo = code;
    else err(codeField.line, `(${name}) รหัสการ์ดต้องเป็นรูปแบบ "BS01-012": "${codeField.value}"`);
  }
  const where = `(${name || cardNo})`;
  const errIn = (line: Line, msg: string) => err(line, `${where} ${msg}`);

  const known = new Set(['ชื่อ', 'รหัส', 'ประเภท', 'สี', 'คอสต์', 'ลดคอสต์', 'Gem symbol', 'เผ่า', 'เลเวล', 'Burst', 'เอฟเฟกต์', 'ระดับ', 'Brave']);
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
    const f = optional(key);
    const map: Partial<Record<SymbolColor, number>> = {};
    if (!f || isNone(f.value)) return map;
    for (const part of f.value.split(/[,/]/).map((s) => s.trim()).filter(Boolean)) {
      const m = part.match(/^(\D+?)\s*(\d+)$/);
      // "เจ็มอัลติเมท1" = สัญลักษณ์อัลติเมท (BS08)
      const color: SymbolColor | undefined = m ? (/^(เจ็ม)?อัลติเมท$/.test(m[1]!.trim()) ? 'ultimate' : COLOR_TH[m[1]!]) : undefined;
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
  const familyField = optional('เผ่า');
  const family =
    familyField && !isNone(familyField.value)
      ? familyField.value.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
      : [];

  // เลเวล: "Lv1  Core 1  BP 3000" (Nexus ไม่มี BP)
  const levels: { level: number; cores: number; bp?: number }[] = [];
  const levelField = optional('เลเวล');
  const levelParts: { line: Line; text: string }[] = [];
  if (levelField && levelField.value !== '' && !isNone(levelField.value)) {
    for (const part of levelField.value.split(',')) levelParts.push({ line: levelField.line, text: part.trim() });
  }
  for (const line of children.get('เลเวล') ?? []) {
    for (const part of line.text.split(',')) levelParts.push({ line, text: part.trim() });
  }
  for (const { line, text } of levelParts) {
    if (!text) continue;
    // "Lv1  Core 1  BP 3000" หรือแบบสั้น "Lv1 1 3000" (Nexus ไม่มี BP)
    const m = text.match(/^Lv\s*(\d+)\s+(?:Core\s*)?(\d+)(?:\s+(?:BP\s*)?(\d+))?$/i);
    if (!m) {
      errIn(line, `เลเวลต้องเป็นรูปแบบ "Lv1 Core 1 BP 3000" หรือ "Lv1 1 3000": "${text}"`);
      continue;
    }
    levels.push({ level: Number(m[1]), cores: Number(m[2]), ...(m[3] ? { bp: Number(m[3]) } : {}) });
  }

  // Burst: "ไม่มี" หรือข้อความเงื่อนไข Burst
  const effects: TextEffect[] = [];
  const burstField = optional('Burst');
  const burst = !!burstField && !isNone(burstField.value);
  if (burstField && burst) {
    const text = [burstField.value, ...(children.get('Burst') ?? []).map((l) => l.text.trim())].join(' ');
    effects.push({ timing: 'burst', text });
  }

  // เอฟเฟกต์: "[Lv1][Lv2] ข้อความ" / "[Main] ข้อความ" / "[Flash] ข้อความ"
  // บรรทัด "ทีม: A/B" และ "ไทป์: เพลง" (BS07) = ข้อมูลของการ์ด ไม่ใช่บรรทัดเอฟเฟกต์
  const teams: string[] = [];
  const magicTypes: string[] = [];
  /** 《เงื่อนไขอัญเชิญ : ...》 (อัลติเมท) */
  let summonCondition: unknown;
  const effectLine = (line: Line) => {
    // "(…)" ในหัวข้อเอฟเฟกต์ = หมายเหตุ ไม่นำไปใช้
    if (line.text.trim().startsWith('(')) return;
    const cond = line.text.trim().match(/^《\s*เงื่อนไขอัญเชิญ\s*:\s*(.+?)\s*》$/);
    if (cond) {
      summonCondition = parseSummonCondition(cond[1]!, (msg) => errIn(line, msg));
      return;
    }
    const tag = line.text.trim().match(/^(ทีม|ไทป์)\s*:\s*(.+)$/);
    if (tag) {
      const list = tag[2]!.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
      (tag[1] === 'ทีม' ? teams : magicTypes).push(...list);
      return;
    }
    effects.push(parseEffectLine(line, type, (msg) => errIn(line, msg)));
  };
  const effectField = optional('เอฟเฟกต์');
  if (effectField && !isNone(effectField.value) && effectField.value !== '') {
    // เอฟเฟกต์เดียว: "เอฟเฟกต์: [Flash] ..." บรรทัดเดียวกับหัวข้อ
    effectLine({ ...effectField.line, text: effectField.value });
  }
  for (const line of children.get('เอฟเฟกต์') ?? []) effectLine(line);

  // Brave: เงื่อนไขร่วมร่าง + เอฟเฟกต์ติดตัวที่ให้ผู้ร่วมร่าง
  let braveCondition: CardDefInput['braveCondition'];
  const braveField = fields.get('Brave');
  if (braveField) {
    const all = [braveField.value, ...(children.get('Brave') ?? []).map((l) => l.text.trim())].join(' ');
    const minCost = all.match(/คอสต์ตั้งแต่\s*(\d+)/);
    // "ร่วมร่างกับสปิริตเผ่าดีว่า" / "เผ่า [ดีว่า]" (BS07 ชุดตุ๊กตาฟูริน)
    const family = braveField.value.match(/เผ่า\s*\[?([^\],\s]+)\]?/);
    const bp = all.match(/BP\s*\+\s*(\d+)/);
    // "ร่วมร่างกับสปิริตที่ไม่มีข้อความเอฟเฟกต์" (BS09)
    const noEffectText = /ไม่มีข้อความเอฟเฟกต์/.test(braveField.value);
    // "ร่วมร่างกับสปิริต/อัลติเมท" (BS12 โอคุริดาระ)
    const ultimate = braveField.value.includes('สปิริต/อัลติเมท');
    if (!minCost && !family && !noEffectText) errIn(braveField.line, 'Brave ต้องระบุ "คอสต์ตั้งแต่ N ขึ้นไป" หรือ "สปิริตเผ่า..." หรือ "สปิริตที่ไม่มีข้อความเอฟเฟกต์"');
    braveCondition = {
      maxSpirits: 1,
      ...(minCost ? { minCost: Number(minCost[1]) } : {}),
      ...(family ? { family: family[1]! } : {}),
      ...(noEffectText ? { noEffectText: true } : {}),
      ...(ultimate ? { ultimate: true } : {}),
      ...(bp ? { bp: Number(bp[1]) } : {}),
    };
    for (const line of children.get('Brave') ?? []) {
      const text = line.text.trim();
      if (text.startsWith('(')) continue; // หมายเหตุ
      if (text.startsWith('[')) effects.push({ text, granted: true });
      // บรรทัดต่อของเอฟเฟกต์ร่วมร่างก่อนหน้า ("เมื่อร่วมร่างกับสปิริตเผ่า [ดีว่า], นอกจากนี้...")
      else if (effects.length > 0 && effects[effects.length - 1]!.granted) effects[effects.length - 1]!.text += ' ' + text;
    }
  } else if (type === 'brave') {
    errIn(block[0]!, 'การ์ด Brave ต้องมีหัวข้อ "Brave:"');
  }

  if (type && type !== 'magic' && levelParts.length === 0) errIn(block[0]!, 'การ์ดประเภทนี้ต้องมีหัวข้อ "เลเวล:"');

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
    ...(teams.length ? { teams } : {}),
    ...(magicTypes.length ? { magicTypes } : {}),
    ...(summonCondition ? { summonCondition } : {}),
  };
}

/**
 * เงื่อนไขอัญเชิญของอัลติเมท → Condition ของ DSL (engine ตรวจตอนอัญเชิญ)
 * รูปแบบที่รองรับ: "ไลฟ์เราไม่เกิน N"
 */
function parseSummonCondition(text: string, err: (msg: string) => void): unknown {
  const life = text.match(/^ไลฟ์เราไม่เกิน\s*(\d+)$/);
  if (life) return { lifeAtMost: Number(life[1]), text };
  err(`ยังไม่รองรับเงื่อนไขอัญเชิญ "${text}"`);
  return undefined;
}

function parseEffectLine(line: Line, type: CardDefInput['type'] | undefined, err: (msg: string) => void): TextEffect {
  let rest = line.text.trim();
  // "[ร่วมร่าง][Lv2][Lv3] ..." = เอฟเฟกต์ที่ทำงานตอนสปิริตนี้ร่วมร่างอยู่
  const braved = rest.match(/^\[ร่วมร่าง\]\s*(?=\[Lv)/);
  if (braved) {
    const inner = parseEffectLine({ ...line, text: rest.slice(braved[0].length) }, type, err);
    return { ...inner, whileBraved: true };
  }
  const levels: number[] = [];
  let m: RegExpMatchArray | null;
  while ((m = rest.match(/^\[Lv(\d+)\]\s*/i))) {
    levels.push(Number(m[1]));
    rest = rest.slice(m[0].length);
  }
  if (levels.length > 0) return { levels, text: rest };

  if (/^การ์ด\S*นี้บนมือ/.test(rest)) return { hand: true, text: rest };
  // กฎของการ์ดเองที่ไม่ผูกกับเลเวล/จังหวะ เช่น "การ์ดสปิริตนี้ เมื่อถูกทิ้ง..." หรือ "ถ้าเรามี ... การลดคอสต์..."
  // หรือ "สปิริตนี้/การ์ดสปิริตนี้ถือว่ามีคำว่า ... ในชื่อการ์ดด้วย"
  // "เบรฟนี้/การ์ดเบรฟนี้ จะไม่ถูกนับ..." · "Immortality: ..." (อัญเชิญจากแทรชได้เมื่อ...) · "Kagemusha: ..." (อัญเชิญจากมือเมื่อสปิริตเราตกเป็นเป้า)
  // "เมื่อ "<ชื่อ>" ของเรา..., จะสามารถอัญเชิญการ์ดสปิริตนี้ในแทรช..." (BS09 เซ็นคิ: ทำงานขณะอยู่ในแทรช)
  if (/^(การ์ด|ถ้า|สปิริตนี้|เบรฟนี้|Immortality\b|Kagemusha\b|เมื่อ\s*"|เมื่อทำการอัญเชิญการ์ด|เมื่อโซลคอร์|เมื่อสปิริต\S*ถูกอัญเชิญ|ต่อจำนวน)/.test(rest)) return { text: rest };
  // การ์ดสปิริตที่ "ถือว่าเป็นการ์ดเมจิคด้วย": "Flash (เอฟเฟกต์นี้, ถ้าอยู่บนฟิลด์, จะใช้งานไม่ได้): ..." = ใช้จากมือแบบ Magic [Flash]
  // BS10: "[Flash] (เอฟเฟกต์นี้, ถ้าอยู่บนฟิลด์, จะใช้งานไม่ได้) ..." แบบมีวงเล็บเหลี่ยม ไม่มี ":"
  const asMagic = rest.match(/^Flash\s*\([^)]*\)\s*:\s*/) ?? (type !== 'magic' ? rest.match(/^\[Flash\]\s*\([^)]*\)\s*:?\s*/) : null);
  if (asMagic) return { timing: 'flash', text: rest.slice(asMagic[0].length) };

  // "Flash [Quick] : ..." / "Flash Quick: ..." / "Flash Soul Quick ..." (คีย์เวิร์ดภาษาอังกฤษ มีหรือไม่มีวงเล็บก็ได้)
  const keyword =
    rest.match(/^Flash\s*\[([^\]]+)\]\s*:?\s*/i) ?? rest.match(/^Flash\s+((?:Soul\s+)?Quick|[A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)?)\s*:?\s*/);
  if (keyword && type !== 'magic') return { keyword: keyword[1]!.trim(), text: rest.slice(keyword[0].length) };
  // "Flash แอทแท็คสเต็ป...: ..." เอฟเฟกต์ Flash ที่ไม่มีคีย์เวิร์ด
  const plainFlash = rest.match(/^Flash\s*:?\s*(?=[^\x00-\x7F])/);
  if (plainFlash && type !== 'magic') return { flash: true, text: rest.slice(plainFlash[0].length) };

  const timing = rest.match(/^\[(Main|Flash)\]\s*/i);
  if (timing) {
    if (type !== 'magic') err('[Main]/[Flash] นำหน้าเอฟเฟกต์ใช้กับ Magic เท่านั้น');
    return { timing: timing[1]!.toLowerCase() as 'main' | 'flash', text: rest.slice(timing[0].length) };
  }
  if (type !== 'magic') err('เอฟเฟกต์ของการ์ดที่มีเลเวลต้องขึ้นต้นด้วย [LvX]');
  else err('เอฟเฟกต์ Magic ต้องขึ้นต้นด้วย [Main] หรือ [Flash]');
  return { text: rest };
}

const FOIL_NAMES: Record<string, Foil> = { ฟอยรุ้ง: 'rainbow', ฟอยขาว: 'white' };

/**
 * รายการเด็ค: "<ชื่อการ์ด> <จำนวน>" ต่อท้ายฟอยได้ เช่น "ฟูริน 3 (ฟอยรุ้ง 1)" หรือ "(ฟอยรุ้ง 1, ฟอยขาว 1)"
 * ใบที่ไม่ได้ระบุฟอยเป็นการ์ดปกติ
 */
function parseDeck(lines: Line[], cards: readonly { name: string; cardNo: string }[], errors: string[]): DeckEntry[] {
  // ชื่อซ้ำ (ต่างอาร์ต) = ใช้ใบแรก (อาร์ตปกติ)
  const byName = new Map<string, string>();
  for (const c of cards) if (!byName.has(c.name)) byName.set(c.name, c.cardNo);
  const counts = new Map<string, number>();
  const foils = new Map<string, Foil[]>();
  for (const line of lines) {
    const m = line.text.trim().match(/^(.+?)\s+(\d+)(?:\s*\(([^)]*)\))?$/);
    if (!m) {
      errors.push(`บรรทัด ${line.no}: รายการเด็คต้องเป็นรูปแบบ "<ชื่อการ์ด> <จำนวน>" หรือ "<ชื่อการ์ด> <จำนวน> (ฟอยรุ้ง 1)": "${line.text.trim()}"`);
      continue;
    }
    const cardNo = byName.get(m[1]!);
    if (!cardNo) {
      errors.push(`บรรทัด ${line.no}: ไม่พบการ์ดชื่อ "${m[1]}" ในไฟล์นี้หรือชุดอื่น`);
      continue;
    }
    counts.set(cardNo, (counts.get(cardNo) ?? 0) + Number(m[2]));
    if (m[3] === undefined) continue;
    const list = foils.get(cardNo) ?? [];
    for (const part of m[3].split(/[,，]/)) {
      const fm = part.trim().match(/^(\S+)\s+(\d+)$/);
      const foil = fm ? FOIL_NAMES[fm[1]!] : undefined;
      if (!fm || !foil) {
        errors.push(`บรรทัด ${line.no}: ฟอยต้องเป็น "ฟอยรุ้ง <จำนวน>" หรือ "ฟอยขาว <จำนวน>": "${part.trim()}"`);
        continue;
      }
      for (let i = 0; i < Number(fm[2]); i++) list.push(foil);
    }
    foils.set(cardNo, list);
  }
  return [...counts].map(([cardNo, count]) => {
    const list = foils.get(cardNo);
    if (list && list.length > count) errors.push(`การ์ด ${cardNo}: จำนวนฟอย (${list.length}) มากกว่าจำนวนในเด็ค (${count})`);
    return list && list.length > 0 ? { cardNo, count, foils: list.slice(0, count) } : { cardNo, count };
  });
}
