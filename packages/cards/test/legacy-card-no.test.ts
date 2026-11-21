import { describe, expect, it } from 'vitest';
import { currentCardNo, LEGACY_CARD_NO, loadAllCards, SD04_DECK } from '../src';

const db = loadAllCards();

describe('รหัสการ์ดเดิม → รหัสปัจจุบัน', () => {
  it('รหัสปลายทางทุกตัวมีอยู่จริง และรหัสเดิมไม่ชนกับรหัสที่ใช้อยู่', () => {
    for (const [from, to] of Object.entries(LEGACY_CARD_NO)) {
      expect(db.find(to), `${from} → ${to}`).toBeDefined();
      expect(db.find(from), `${from} ยังเป็นรหัสที่ใช้อยู่`).toBeUndefined();
    }
  });

  it('การ์ด SD04 ย้ายไป BS04: รหัสเดิมแปลงเป็นการ์ดใบเดียวกัน', () => {
    expect(db.get(currentCardNo('SD04-001')).name).toBe('ฮิโทสึเมะ โบส');
    expect(db.get(currentCardNo('SD04-014')).name).toBe('อินุงามิ');
    expect(currentCardNo('BS04-SP-C009')).toBe('BS31-C049');
  });

  it('รายการเด็ค SD04 ใช้การ์ดจาก BS04 (40 ใบ)', () => {
    expect(SD04_DECK.reduce((n, e) => n + e.count, 0)).toBe(40);
    for (const e of SD04_DECK) expect(db.find(e.cardNo), e.cardNo).toBeDefined();
    expect(SD04_DECK.every((e) => db.get(e.cardNo).set === 'BS04')).toBe(true);
  });
});
