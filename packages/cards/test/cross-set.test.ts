import { describe, expect, it } from 'vitest';
import sd3Text from '../../../assets/files/SD3.text?raw';
import sd03Json from '../data/sd03.json';
import sd03DeckJson from '../data/sd03-deck.json';
import { CardTextError, loadAllCards, loadSD01Cards, parseCardText, SD03_DECK, validateDeck } from '../src';

const card = (name: string, extra = '') => `การ์ดระดับ C
ชื่อ: ${name}
${extra}ประเภท: Spirit
สี: แดง
คอสต์: 1
ลดคอสต์: แดง 1
Gem symbol: ไม่มี
เผ่า: ไม่มี
เลเวล:
  Lv1  Core 1  BP 1000
Burst: ไม่มี
เอฟเฟกต์: ไม่มี
`;

describe('เขียนการ์ดแบบสั้น', () => {
  const effect = '[Flash] ทำลายสปิริต/อัลติเมทคอสต์ไม่เกิน 4 ของคู่แข่ง 2 ตัว.';
  const long = `การ์ดระดับ C
ชื่อ: โซเกคิ เบลส
ประเภท: Magic              (Spirit / Ultimate / Brave / Nexus / Magic)
สี: ฟ้า                    (แดง ม่วง เขียว ขาว เหลือง ฟ้า, หลายสีได้)
คอสต์: 4
ลดคอสต์: ฟ้า 2             (สีละกี่อัน)
Gem symbol: ไม่มี
เผ่า: ไม่มี       (ไม่มีก็เว้นไว้)
เลเวล: ไม่มี
Burst: ไม่มี                (มี/ไม่มี)
เอฟเฟกต์:
  ${effect}
`;
  const short = `การ์ดระดับ C
ชื่อ: โซเกคิ เบลส
ประเภท: Magic
สี: ฟ้า
คอสต์: 4
ลดคอสต์: ฟ้า2
เอฟเฟกต์: ${effect}
`;

  it('Magic: เว้นหัวข้อที่ไม่มีได้ + เอฟเฟกต์บรรทัดเดียว ได้ผลเท่าแบบเต็ม', () => {
    expect(parseCardText(short, { setCode: 'X' }).cards).toEqual(parseCardText(long, { setCode: 'X' }).cards);
  });

  it('Spirit: เลเวลแบบสั้น "Lv1 1 3000" และหลายเลเวลบรรทัดเดียว', () => {
    const base = (levels: string) => `ชื่อ: ทดสอบ\nประเภท: Spirit\nสี: แดง\nคอสต์: 3\nลดคอสต์: แดง 1\nเผ่า: มังกรยุทธ์\nGem symbol: แดง1\n${levels}`;
    const full = parseCardText(base('เลเวล:\n  Lv1  Core 1  BP 3000\n  Lv2  Core 3  BP 6000\n'), { setCode: 'X' }).cards;
    expect(parseCardText(base('เลเวล:\n  Lv1 1 3000\n  Lv2 3 6000\n'), { setCode: 'X' }).cards).toEqual(full);
    expect(parseCardText(base('เลเวล: Lv1 1 3000, Lv2 3 6000\n'), { setCode: 'X' }).cards).toEqual(full);
    expect(full[0]).toMatchObject({ symbols: { red: 1 }, family: ['มังกรยุทธ์'], burst: false, effects: [] });
  });

  it('Spirit/Nexus ที่ไม่มีเลเวล = error', () => {
    expect(() => parseCardText('ชื่อ: ทดสอบ\nประเภท: Spirit\nสี: แดง\nคอสต์: 3\n', { setCode: 'X' })).toThrow(/ต้องมีหัวข้อ "เลเวล:"/);
  });
});

describe('รหัส Booster Set: <ชุด>-<ประเภท>-<ระดับ><เลข>', () => {
  const spirit = (name: string, rarity: string, extra = '') =>
    `การ์ดระดับ ${rarity}\nชื่อ: ${name}\n${extra}ประเภท: Spirit\nสี: แดง\nคอสต์: 1\nเลเวล: Lv1 1 1000\n`;
  const magic = (name: string, rarity: string) => `การ์ดระดับ ${rarity}\nชื่อ: ${name}\nประเภท: Magic\nสี: แดง\nคอสต์: 1\nเอฟเฟกต์: [Main] ...\n`;

  it('นับแยกตามประเภท + ระดับ และไฟล์ในชุดเดียวกันนับต่อกัน', () => {
    const counters = {};
    const a = parseCardText([spirit('ก', 'R'), spirit('ข', 'C'), spirit('ค', 'R')].join('\n'), { setCode: 'BS01', typeCounters: counters });
    const b = parseCardText([magic('ง', 'C'), spirit('จ', 'R'), magic('ฉ', 'UC')].join('\n'), { setCode: 'BS01', typeCounters: counters });
    expect([...a.cards, ...b.cards].map((c) => c.cardNo)).toEqual(['BS01-SP-R001', 'BS01-SP-C001', 'BS01-SP-R002', 'BS01-MG-C001', 'BS01-SP-R003', 'BS01-MG-U001']);
  });

  it('ใส่รหัสเองต้องตรงประเภท/ระดับ, ไม่มีระดับความหายาก = error', () => {
    expect(parseCardText(spirit('ก', 'X', 'รหัส: BS01-SP-X010\n'), { setCode: 'BS01', typeCounters: {} }).cards[0]!.cardNo).toBe('BS01-SP-X010');
    expect(() => parseCardText(spirit('ก', 'R', 'รหัส: BS01-MG-R001\n'), { setCode: 'BS01', typeCounters: {} })).toThrow(/ไม่ตรงประเภท\/ระดับ/);
    expect(() => parseCardText(spirit('ก', 'R', 'รหัส: BS01-001\n'), { setCode: 'BS01', typeCounters: {} })).toThrow(/BS01-SP-R001/);
    expect(() => parseCardText(spirit('ก', 'R').replace('การ์ดระดับ R\n', ''), { setCode: 'BS01', typeCounters: {} })).toThrow(/ต้องมีระดับความหายาก/);
  });
});

describe('การ์ดข้ามชุด (Starter Deck ที่มีการ์ดจาก Booster Set)', () => {
  it('"รหัส:" ใช้เป็น cardNo (ไม่ใส่ = นับตามลำดับในไฟล์)', () => {
    const { cards } = parseCardText(`${card('ก', 'รหัส: bs01-012\n')}\n${card('ข')}`, { setCode: 'BS01' });
    expect(cards.map((c) => c.cardNo)).toEqual(['BS01-012', 'BS01-002']);
  });

  it('รหัสผิดรูปแบบ หรือซ้ำกันในไฟล์เดียวกัน = error', () => {
    expect(() => parseCardText(card('ก', 'รหัส: BS01 012\n'), { setCode: 'BS01' })).toThrow(CardTextError);
    expect(() => parseCardText(`${card('ก', 'รหัส: BS01-001\n')}\n${card('ข', 'รหัส: BS01-001\n')}`, { setCode: 'BS01' })).toThrow(/ซ้ำ/);
  });

  it('รายการเด็คอ้างชื่อการ์ดจากชุดอื่นได้ และไม่รู้จักชื่อ = error', () => {
    const other = [{ name: 'การ์ดบูสเตอร์', cardNo: 'BS01-050' }];
    const { deck } = parseCardText(`${card('ก')}\nก 3\nการ์ดบูสเตอร์ 2`, { setCode: 'SD09', otherCards: other });
    expect(deck).toEqual([
      { cardNo: 'SD09-001', count: 3 },
      { cardNo: 'BS01-050', count: 2 },
    ]);
    expect(() => parseCardText(`${card('ก')}\nไม่มีใบนี้ 1`, { setCode: 'SD09', otherCards: other })).toThrow(/ไม่พบการ์ดชื่อ/);
  });

  it('SD3: เบิร์สวอลล์เขียนไว้ที่ SD1 ที่เดียว เด็ค SD03 อ้างการ์ด SD01-009', () => {
    const parsed = parseCardText(sd3Text, { setCode: 'SD03', otherCards: loadSD01Cards().all() });
    expect(parsed.cards).toEqual(sd03Json);
    expect(parsed.deck).toEqual(sd03DeckJson);
    expect(SD03_DECK.find((e) => e.cardNo === 'SD01-009')?.count).toBe(3);
    expect(validateDeck([...SD03_DECK], loadAllCards())).toMatchObject({ valid: true, total: 40 });
  });

  it('ฐานข้อมูลรวมไม่มีชื่อการ์ดหรือรหัสซ้ำ', () => {
    const all = loadAllCards().all();
    expect(new Set(all.map((c) => c.name)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.cardNo)).size).toBe(all.length);
  });
});
