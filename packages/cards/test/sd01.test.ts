import { describe, expect, it } from 'vitest';
import sd1Text from '../../../assets/files/SD1.text?raw';
import sd01Json from '../data/sd01.json';
import burstWallText from '../../../assets/files/cards/SD06/Magic.text?raw';
import sd01DeckJson from '../data/sd01-deck.json';
import { CardTextError, isXRare, loadAllCards, loadBS01Cards, loadSD01Cards, parseCardText, rarityOf, SD01_DECK, validateDeck } from '../src';

describe('Starter Deck 01', () => {
  // การ์ดเขียนไว้ใน assets/files/cards/<ต้นรหัส>/ (เบิร์สวอลล์ = SD06/ ชุด: SD01) · SD1.text เหลือแค่รายการเด็ค
  const db = loadAllCards();

  it('JSON ใน data/ ตรงกับ assets/files/SD1.text + cards/SD06 (ถ้าไม่ตรง ให้รัน npm run cards)', () => {
    const wall = parseCardText(burstWallText, { setCode: 'SD06', typeCounters: {}, skipDeck: true });
    expect(wall.cards).toEqual(sd01Json);
    const parsed = parseCardText(sd1Text, { setCode: 'SD01', otherCards: [...loadBS01Cards().all(), ...wall.cards] });
    expect(parsed.cards).toEqual([]);
    expect(parsed.deck).toEqual(sd01DeckJson);
  });

  it('ผ่าน schema และเด็ค 40 ใบถูกกติกา', () => {
    expect(loadSD01Cards().all().map((c) => c.name)).toEqual(['เบิร์สวอลล์']);
    expect(new Set(SD01_DECK.map((e) => e.cardNo)).size).toBe(15);
    expect(validateDeck([...SD01_DECK], db)).toEqual({ valid: true, total: 40, errors: [] });
  });

  it('แปลงฟิลด์ได้ถูกต้อง', () => {
    const solDragon = db.all().find((c) => c.name === 'มังกรเซ็นโงคุ โซลดราก้อน')!;
    expect(solDragon).toMatchObject({
      type: 'spirit',
      cost: 7,
      colors: ['red'],
      reduction: { red: 4 },
      symbols: { red: 1 },
      family: ['ผู้เป็นนาย', 'มังกรยุทธ์'],
      rarity: 'X',
    });
    expect(solDragon.levels.at(-1)).toEqual({ level: 4, cores: 9, bp: 30000 });

    const nexus = db.all().find((c) => c.name === 'หุบเหวร้อยปราชญ์')!;
    expect(nexus.levels).toEqual([
      { level: 1, cores: 0 },
      { level: 2, cores: 3 },
    ]);

    const burstWall = db.all().find((c) => c.name === 'เบิร์สวอลล์')!;
    expect(burstWall).toMatchObject({ type: 'magic', colors: ['white'], burst: true, levels: [] });
    expect(burstWall.effects).toEqual([
      expect.objectContaining({ timing: 'burst' }),
      { timing: 'flash', text: 'เมื่อจบการต่อสู้นี้, จบแอทแท็คสเต็ป.' },
    ]);

    const tokage = db.all().find((c) => c.name === 'อิคุสะ โทคาเงะ')!;
    expect(tokage.reduction).toEqual({});
    expect(tokage.effects).toEqual([{ levels: [3], text: expect.stringContaining('สปิริตนี้ BP+6000') }]);
  });
});

describe('parseCardText', () => {
  const card = (extra = '') => `ชื่อ: ทดสอบ
ประเภท: Spirit
สี: แดง
คอสต์: 2
ลดคอสต์: แดง 1
Gem symbol: แดง 1
เผ่า: ไม่มี
เลเวล:
  Lv1  Core 1  BP 2000
Burst: ไม่มี
เอฟเฟกต์: ไม่มี
${extra}`;

  it('รายงานบรรทัดที่ผิดพร้อมเลขบรรทัด', () => {
    const bad = card().replace('สี: แดง', 'สี: ชมพู').replace('Lv1  Core 1  BP 2000', 'Lv1 Core หนึ่ง BP 2000');
    expect(() => parseCardText(bad, { setCode: 'T' })).toThrow(CardTextError);
    try {
      parseCardText(bad, { setCode: 'T' });
    } catch (e) {
      expect((e as CardTextError).errors).toEqual([
        expect.stringMatching(/^บรรทัด 3: .*ชมพู/),
        expect.stringMatching(/^บรรทัด 9: .*เลเวล/),
      ]);
    }
  });

  it('ฟ้องชื่อในรายการเด็คที่ไม่มีในไฟล์', () => {
    expect(() => parseCardText(card('\nไม่มีใบนี้ 3\n'), { setCode: 'T' })).toThrow(/ไม่พบการ์ดชื่อ "ไม่มีใบนี้"/);
  });

  it('รองรับฟิลด์ ระดับ: และหลายสี', () => {
    const text = card().replace('สี: แดง', 'สี: แดง, ขาว').replace('ชื่อ: ทดสอบ', 'ชื่อ: ทดสอบ\nระดับ: Rare');
    const { cards } = parseCardText(text, { setCode: 'T' });
    expect(cards[0]).toMatchObject({ cardNo: 'T-001', colors: ['red', 'white'], rarity: 'Rare' });
  });

  it('ข้ามบล็อกคำอธิบายที่เป็นรายการลำดับเลข (ตารางระดับความหายาก)', () => {
    const text = '1. C (Common). ระดับธรรมดา\n2. X (X-Rare). เอ็กซ์แรร์\n\n' + card();
    expect(parseCardText(text, { setCode: 'T' }).cards).toHaveLength(1);
  });

  it('แปลงรหัสระดับความหายาก', () => {
    expect(rarityOf('C')).toMatchObject({ code: 'C', rank: 1 });
    expect(rarityOf('UC')).toMatchObject({ code: 'U', label: 'Uncommon', rank: 2 });
    expect(rarityOf('X-Rare')).toMatchObject({ code: 'X', rank: 5 });
    expect(rarityOf('XV')).toMatchObject({ code: 'XV', rank: 6 });
    expect(isXRare({ rarity: 'X' })).toBe(true);
    expect(isXRare({ rarity: 'M' })).toBe(false);
    const deckCards = SD01_DECK.map((e) => loadAllCards().get(e.cardNo));
    expect(deckCards.filter(isXRare).map((c) => c.name)).toEqual(['มังกรเซ็นโงคุ โซลดราก้อน', 'เซ็นโกคุ-กุเร็นดราก้อน']);
  });
});
