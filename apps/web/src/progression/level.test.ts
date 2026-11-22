import { describe, expect, it } from 'vitest';
import { expToNext, levelOf, matchExp, MAX_LEVEL, mergeExpJson } from './level';

describe('เลเวลผู้เล่น', () => {
  it('EXP → เลเวล: Lv1→2 ใช้ 100, Lv2→3 ใช้ 125', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelOf(99)).toEqual({ level: 1, into: 99, need: 100 });
    expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 125 });
    expect(levelOf(100 + 125 + 10)).toEqual({ level: 3, into: 10, need: 150 });
    expect(expToNext(10)).toBe(325);
  });

  it('เลเวลสูงสุด 99', () => {
    expect(levelOf(10_000_000)).toEqual({ level: MAX_LEVEL, into: 0, need: 0 });
  });

  it('EXP ต่อเกม: ออนไลน์ / บอทตามดาว / Story ×1.5 / ยอมแพ้ก่อนเทิร์น 3 = 0', () => {
    expect(matchExp({ mode: 'online', won: true, turn: 8, reason: 'lifeZero' }).exp).toBe(150);
    expect(matchExp({ mode: 'online', won: false, turn: 8, reason: 'lifeZero' }).exp).toBe(60);
    expect(matchExp({ mode: 'bot', won: true, stars: 5, turn: 8, reason: 'lifeZero' }).exp).toBe(125);
    expect(matchExp({ mode: 'bot', won: false, stars: 1, turn: 8, reason: 'lifeZero' }).exp).toBe(20);
    expect(matchExp({ mode: 'bot', won: true, stars: 6, story: true, turn: 8, reason: 'lifeZero' }).exp).toBe(210);
    expect(matchExp({ mode: 'bot', won: true, stars: 5, turn: 2, reason: 'concede' }).exp).toBe(0);
    // ยอมแพ้หลังเทิร์น 3 ยังได้ EXP
    expect(matchExp({ mode: 'online', won: true, turn: 5, reason: 'concede' }).exp).toBe(150);
  });

  it('ซิงก์บัญชี: รวมสองเครื่อง = EXP ที่มากกว่า', () => {
    expect(JSON.parse(mergeExpJson('{"exp":300}', '{"exp":120}'))).toEqual({ exp: 300 });
    expect(JSON.parse(mergeExpJson('{"exp":30}', '{"exp":120}'))).toEqual({ exp: 120 });
    expect(JSON.parse(mergeExpJson(null, 'พัง'))).toEqual({ exp: 0 });
  });
});
