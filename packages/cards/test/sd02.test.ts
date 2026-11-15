import { describe, expect, it } from 'vitest';
import sd2Text from '../../../assets/files/SD2.text?raw';
import sd02Json from '../data/sd02.json';
import sd02DeckJson from '../data/sd02-deck.json';
import { loadAllCards, loadBS02Cards, parseCardText, SD02_DECK, validateDeck } from '../src';

describe('Starter Deck 02', () => {
  const parsed2 = () => parseCardText(sd2Text, { setCode: 'SD02', otherCards: loadBS02Cards().all() });
  // การ์ดทั้ง 14 ชนิดของ SD02 เขียนไว้ใน Booster Set 02 (assets/files/BS02) ที่เดียว
  const db = loadAllCards();

  it('JSON ใน data/ ตรงกับ assets/files/SD2.text (ถ้าไม่ตรง ให้รัน npm run cards)', () => {
    const parsed = parseCardText(sd2Text, { setCode: 'SD02', otherCards: loadBS02Cards().all() });
    expect(parsed.cards).toEqual(sd02Json);
    expect(parsed.deck).toEqual(sd02DeckJson);
  });

  it('ผ่าน schema และเด็ค 40 ใบถูกกติกา', () => {
    expect(parsed2().cards).toHaveLength(0);
    expect(new Set(SD02_DECK.map((e) => e.cardNo)).size).toBe(14);
    expect(validateDeck([...SD02_DECK], db)).toEqual({ valid: true, total: 40, errors: [] });
  });

  it('แปลง Brave, Flash [Quick] และหมายเหตุ (ปล.) ได้', () => {
    const teppo = db.all().find((c) => c.name === 'เท็ปโปนานะฟุชิ')!;
    expect(teppo).toMatchObject({ type: 'brave', braveCondition: { maxSpirits: 1, minCost: 4, bp: 2000 } });
    expect(teppo.effects).toHaveLength(1);
    const kiri = db.all().find((c) => c.name === 'นินจาสลาตัน คิริคาเงะ')!;
    expect(kiri.effects[0]).toMatchObject({ keyword: 'Soul Quick' });
    expect(kiri.rarity).toBe('X');
  });
});
