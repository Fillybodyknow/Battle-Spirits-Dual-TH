import { z } from 'zod';
import { CardDefSchema, type CardDef } from './schema';

export interface CardDatabase {
  get(cardNo: string): CardDef;
  find(cardNo: string): CardDef | undefined;
  all(): CardDef[];
}

export class CardDataError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = 'CardDataError';
  }
}

/** ตรวจข้อมูลการ์ดดิบด้วย schema แล้วสร้างฐานข้อมูล (cardNo ห้ามซ้ำ) */
export function createCardDatabase(raw: unknown): CardDatabase {
  const parsed = z.array(CardDefSchema).safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new CardDataError('ข้อมูลการ์ดไม่ถูกต้อง', issues);
  }

  const byNo = new Map<string, CardDef>();
  const duplicates: string[] = [];
  for (const card of parsed.data) {
    if (byNo.has(card.cardNo)) duplicates.push(card.cardNo);
    byNo.set(card.cardNo, card);
  }
  if (duplicates.length > 0) {
    throw new CardDataError('cardNo ซ้ำ', duplicates);
  }

  return {
    get(cardNo) {
      const card = byNo.get(cardNo);
      if (!card) throw new Error(`ไม่พบการ์ด ${cardNo}`);
      return card;
    },
    find: (cardNo) => byNo.get(cardNo),
    all: () => [...byNo.values()],
  };
}
