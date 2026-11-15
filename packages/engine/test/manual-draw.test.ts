import { describe, expect, it } from 'vitest';
import { act, actFails, setup } from './helpers';

describe('Draw Step แบบกดจั่วเอง (config.manualDraw)', () => {
  it('เทิร์นแรกหยุดรอที่ Draw Step จนกว่าจะกดจั่ว แล้วเดินต่อถึง Main', () => {
    const s = setup({ config: { manualDraw: true } });
    expect(s.phase).toBe('draw');
    expect(s.awaitingDraw).toBe('p1');
    expect(s.players.p1.hand).toHaveLength(4);

    const after = act(s, { type: 'drawStep', player: 'p1' });
    expect(after.phase).toBe('main');
    expect(after.awaitingDraw).toBeUndefined();
    expect(after.players.p1.hand).toHaveLength(5);
  });

  it('ระหว่างรอจั่ว ทำ action อื่นไม่ได้ และผู้เล่นอีกฝั่งกดจั่วแทนไม่ได้', () => {
    const s = setup({ config: { manualDraw: true } });
    actFails(s, { type: 'endMain', player: 'p1' }, 'DRAW_PENDING');
    actFails(s, { type: 'drawStep', player: 'p2' }, 'NOT_DRAW_STEP');
  });

  it('จบเทิร์นแล้ว เทิร์นถัดไปของคู่แข่งก็หยุดรอจั่วเช่นกัน', () => {
    let s = setup({ config: { manualDraw: true } });
    s = act(s, { type: 'drawStep', player: 'p1' });
    s = act(s, { type: 'endMain', player: 'p1' }); // เทิร์นแรกข้าม Attack Step → จบเทิร์น
    expect(s.turn).toBe(2);
    expect(s.phase).toBe('draw');
    expect(s.awaitingDraw).toBe('p2');
    s = act(s, { type: 'drawStep', player: 'p2' });
    expect(s.phase).toBe('main');
    expect(s.players.p2.hand).toHaveLength(5);
  });

  it('ค่าเริ่มต้นยังจั่วอัตโนมัติ', () => {
    const s = setup();
    expect(s.phase).toBe('main');
    expect(s.awaitingDraw).toBeUndefined();
  });

  it('กดจั่วซ้ำหลังจั่วไปแล้วไม่ได้', () => {
    let s = setup({ config: { manualDraw: true } });
    s = act(s, { type: 'drawStep', player: 'p1' });
    actFails(s, { type: 'drawStep', player: 'p1' }, 'NOT_DRAW_STEP');
  });
});
