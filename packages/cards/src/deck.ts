import type { CardDatabase } from './database';

export interface DeckEntry {
  cardNo: string;
  count: number;
}

export interface DeckRules {
  minCards: number;
  maxCopiesPerName: number;
  /**
   * ประกาศ Banned/Restricted: ชื่อการ์ด → จำนวนสูงสุดที่ใส่ได้ (0 = แบน)
   * เป็นข้อมูลที่แก้ได้ ไม่ฝังในโค้ด (หมวด 5)
   */
  restricted: Record<string, number>;
}

export const DEFAULT_DECK_RULES: DeckRules = {
  minCards: 40,
  maxCopiesPerName: 3,
  restricted: {},
};

export type DeckError =
  | { code: 'UNKNOWN_CARD'; cardNo: string }
  | { code: 'INVALID_COUNT'; cardNo: string; count: number }
  | { code: 'TOO_FEW_CARDS'; total: number; min: number }
  | { code: 'TOO_MANY_COPIES'; name: string; count: number; max: number }
  | { code: 'RESTRICTED'; name: string; count: number; max: number };

export interface DeckValidation {
  valid: boolean;
  total: number;
  errors: DeckError[];
}

/** ตรวจเด็คตามหมวด 5: ขั้นต่ำ 40 ใบ, ชื่อเดียวกันไม่เกิน 3 ใบ, รายการ Banned/Restricted */
export function validateDeck(
  entries: DeckEntry[],
  db: CardDatabase,
  rules: DeckRules = DEFAULT_DECK_RULES,
): DeckValidation {
  const errors: DeckError[] = [];
  const copiesByName = new Map<string, number>();
  let total = 0;

  for (const { cardNo, count } of entries) {
    if (!Number.isInteger(count) || count < 1) {
      errors.push({ code: 'INVALID_COUNT', cardNo, count });
      continue;
    }
    const card = db.find(cardNo);
    if (!card) {
      errors.push({ code: 'UNKNOWN_CARD', cardNo });
      continue;
    }
    total += count;
    // นับตามชื่อ: การ์ดชื่อเดียวกันต่าง cardNo (เช่นพิมพ์ซ้ำ) นับรวมกัน
    copiesByName.set(card.name, (copiesByName.get(card.name) ?? 0) + count);
  }

  if (total < rules.minCards) {
    errors.push({ code: 'TOO_FEW_CARDS', total, min: rules.minCards });
  }
  for (const [name, count] of copiesByName) {
    const restrictedMax = rules.restricted[name];
    if (restrictedMax !== undefined && count > restrictedMax) {
      errors.push({ code: 'RESTRICTED', name, count, max: restrictedMax });
    } else if (count > rules.maxCopiesPerName) {
      errors.push({ code: 'TOO_MANY_COPIES', name, count, max: rules.maxCopiesPerName });
    }
  }

  return { valid: errors.length === 0, total, errors };
}

/** แปลง DeckEntry[] เป็นรายการ cardNo ทีละใบ (ใช้ส่งเข้า engine) */
export function expandDeck(entries: DeckEntry[]): string[] {
  return entries.flatMap(({ cardNo, count }) => Array<string>(count).fill(cardNo));
}
