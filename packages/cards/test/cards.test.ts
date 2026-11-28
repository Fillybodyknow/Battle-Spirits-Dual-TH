import { describe, expect, it } from 'vitest';
import { CardDataError, createCardDatabase, expandDeck, loadSampleCards, validateDeck, type DeckEntry } from '../src';

const db = loadSampleCards();

describe('card schema / database', () => {
  it('โหลดชุดตัวอย่างได้และใส่ค่า default', () => {
    const pup = db.get('SMP-001');
    expect(pup.type).toBe('spirit');
    expect(pup.burst).toBe(false);
    expect(pup.effects).toEqual([]);
  });

  it('ปฏิเสธ Spirit ที่ไม่มี BP และ Ultimate ที่เริ่มต่ำกว่า Lv3', () => {
    const noBp = { cardNo: 'X1', name: 'A', type: 'spirit', cost: 1, colors: ['red'], levels: [{ level: 1, cores: 1 }] };
    const lowUlt = { cardNo: 'X2', name: 'B', type: 'ultimate', cost: 5, colors: ['red'], levels: [{ level: 1, cores: 1, bp: 1 }] };
    expect(() => createCardDatabase([noBp])).toThrow(CardDataError);
    expect(() => createCardDatabase([lowUlt])).toThrow(CardDataError);
  });

  it('ปฏิเสธ Magic ที่มีเลเวล และ cardNo ซ้ำ', () => {
    const magic = { cardNo: 'M', name: 'M', type: 'magic', cost: 1, colors: ['red'], levels: [{ level: 1, cores: 0 }] };
    expect(() => createCardDatabase([magic])).toThrow(CardDataError);
    const ok = { cardNo: 'D', name: 'D', type: 'magic', cost: 1, colors: ['red'] };
    expect(() => createCardDatabase([ok, ok])).toThrow(/ซ้ำ/);
  });
});

describe('validateDeck', () => {
  // ใช้ 12 ชื่อแรก × 3 = 36 ใบ บวกการ์ดอีก 2 ชื่อและฉบับพิมพ์ซ้ำของ SMP-001
  const testDb = createCardDatabase([
    ...db.all(),
    { ...db.get('SMP-001'), cardNo: 'SMP-001-R' }, // ชื่อเดียวกับ SMP-001
    { cardNo: 'EX-1', name: 'Extra One', type: 'magic', cost: 0, colors: ['blue'] },
    { cardNo: 'EX-2', name: 'Extra Two', type: 'magic', cost: 0, colors: ['blue'] },
  ]);
  const base: DeckEntry[] = db
    .all()
    .slice(0, 12)
    .map((c) => ({ cardNo: c.cardNo, count: 3 }));

  it('เด็ค 40 ใบ ชื่อละไม่เกิน 3 ใบ ผ่าน', () => {
    const deck = [...base, { cardNo: 'EX-1', count: 3 }, { cardNo: 'EX-2', count: 1 }];
    expect(validateDeck(deck, testDb)).toEqual({ valid: true, total: 40, errors: [] });
  });

  it('น้อยกว่า 40 ใบ ไม่ผ่าน', () => {
    const deck = [...base, { cardNo: 'EX-1', count: 3 }];
    expect(validateDeck(deck, testDb).errors).toEqual([{ code: 'TOO_FEW_CARDS', total: 39, min: 40 }]);
  });

  it('นับการ์ดชื่อเดียวกันต่าง cardNo รวมกัน', () => {
    const deck = [...base, { cardNo: 'SMP-001-R', count: 1 }, { cardNo: 'EX-1', count: 3 }];
    expect(validateDeck(deck, testDb).errors).toEqual([
      { code: 'TOO_MANY_COPIES', name: 'Ember Pup', count: 4, max: 3 },
    ]);
  });

  it('ตรวจ Banned/Restricted, การ์ดที่ไม่รู้จัก และจำนวนผิด', () => {
    const rules = { minCards: 1, maxCopiesPerName: 3, restricted: { 'Blaze Drake': 1, 'Fire Burst': 0 } };
    const result = validateDeck(
      [
        { cardNo: 'SMP-003', count: 2 },
        { cardNo: 'SMP-010', count: 1 },
        { cardNo: 'NOPE', count: 1 },
        { cardNo: 'SMP-001', count: 0 },
      ],
      db,
      rules,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { code: 'RESTRICTED', name: 'Blaze Drake', count: 2, max: 1 },
        { code: 'RESTRICTED', name: 'Fire Burst', count: 1, max: 0 },
        { code: 'UNKNOWN_CARD', cardNo: 'NOPE' },
        { code: 'INVALID_COUNT', cardNo: 'SMP-001', count: 0 },
      ]),
    );
  });

  it('expandDeck แตกเป็นทีละใบ', () => {
    expect(expandDeck([{ cardNo: 'A', count: 2 }, { cardNo: 'B', count: 1 }])).toEqual(['A', 'A', 'B']);
  });
});

describe('Banlist', () => {
  it('ชื่อการ์ดทุกใบใน Banlist มีอยู่จริง (พิมพ์ผิด = ไม่มีผล) และระดับเป็น 0/1/2', async () => {
    const { BANLIST, loadAllCards } = await import('../src');
    const names = new Set(loadAllCards().all().map((c) => c.name));
    for (const [name, lv] of Object.entries(BANLIST.cards)) {
      expect(names.has(name), `ไม่มีการ์ดชื่อ "${name}"`).toBe(true);
      expect([0, 1, 2]).toContain(lv);
    }
  });
});
