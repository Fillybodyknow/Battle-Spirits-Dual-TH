import { describe, expect, it } from 'vitest';
import { actorOf, applyAction, botAction, cardLevel, createGame, type PlayerId } from '../src';
import { BOOSTER_SETS, db, play, STARTERS } from './bot-helpers';

describe('บอท (ระดับกลาง)', () => {
  it('Starter Deck ทุกคู่: เล่นกันเองจนจบเกม ไม่ค้าง ไม่ต้องใช้ทางสำรอง', () => {
    const names = Object.keys(STARTERS);
    for (const [i, a] of names.entries()) {
      for (const [j, b] of names.entries()) {
        const rec = play(a, b, i * 4 + j + 1);
        expect(rec.winner, `${a} vs ${b}`).not.toBeNull();
        expect(rec.fallbacks, `${a} vs ${b}`).toBe(0);
      }
    }
  }, 300000);

  it('เด็คจากการ์ดทุกชุด (BS01–BS13): เล่นจนจบเกมโดยเอฟเฟกต์ไม่ทำให้ค้าง', () => {
    expect(BOOSTER_SETS.length).toBeGreaterThanOrEqual(13);
    for (const [i, set] of BOOSTER_SETS.entries()) {
      for (const seed of [1, 2, 3]) {
        const rec = play(set, BOOSTER_SETS[(i + seed) % BOOSTER_SETS.length]!, 100 + i * 10 + seed);
        expect(rec.winner, `${set} seed ${seed}`).not.toBeNull();
        expect(rec.fallbacks, `${set} seed ${seed}`).toBe(0);
      }
    }
  }, 600000);

  it('ระดับความเก่ง: ★5 ชนะ ★1 อย่างน้อย 21 จาก 32 เกม', () => {
    let wins = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const strong: PlayerId = seed % 2 ? 'p1' : 'p2';
      const rec = play('sd02', 'sd03', 700 + seed, strong === 'p1' ? { p1: { level: 5 }, p2: { level: 1 } } : { p1: { level: 1 }, p2: { level: 5 } });
      if (rec.winner === strong) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(21);
  }, 300000);

  it('จัดคอร์: วางโซลคอร์บนจอมมารสวรรค์ ก็อด-เซคส์ ให้เอฟเฟกต์ Lv2 (ต้องมีโซลคอร์) ทำงาน', () => {
    const plain = db.all().find((c) => c.name === 'มุฉะดาริว')!.cardNo;
    let s = createGame({ db, decks: { p1: Array<string>(40).fill(plain), p2: Array<string>(40).fill(plain) }, seed: 1, firstPlayer: 'p1', shuffleDecks: false, config: { initialReserve: 4, firstPlayerSkipsAttackStep: false } }).state;
    expect(s.phase).toBe('main');
    // ก็อด-เซคส์ Lv1 (คอร์ธรรมดา 1 เม็ด) · รีเสิร์ฟมีโซลคอร์ · มือว่าง (ไม่มีอย่างอื่นให้ทำ)
    const p = s.players.p1;
    const core = p.reserve.find((c) => !s.cores[c]!.isSoul)!;
    p.reserve = p.reserve.filter((c) => c !== core);
    s.cards['gs'] = { id: 'gs', cardNo: 'SD32-X02', owner: 'p1', state: 'refresh', cores: [core], turnBp: 0, usedThisTurn: [], braves: [] };
    p.field.push('gs');
    p.hand = [];
    expect(p.reserve.some((c) => s.cores[c]!.isSoul)).toBe(true);
    for (let i = 0; i < 10 && s.phase === 'main' && actorOf(s) === 'p1'; i++) {
      const a = botAction(s, db, 'p1');
      if (!a || a.type === 'endMain') break;
      const r = applyAction(s, a, db);
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
    }
    expect(s.cards['gs']!.cores.some((c) => s.cores[c]!.isSoul)).toBe(true);
    expect(cardLevel(s, db, 'gs')).toBeGreaterThanOrEqual(2);
  });

  it('★6 (คิดล่วงหน้าอีกหนึ่งท่า): ชนะ ★5 อย่างน้อย 11 จาก 16 เกม', () => {
    let wins = 0;
    let n = 0;
    for (const [a, b] of [['sd02', 'sd03'], ['sd01', 'sd04'], ['sd03', 'sd01'], ['sd04', 'sd02']] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const strong: PlayerId = seed % 2 ? 'p1' : 'p2';
        const rec = play(a, b, 1300 + seed * 7 + n, strong === 'p1' ? { p1: { level: 6 }, p2: { level: 5 } } : { p1: { level: 5 }, p2: { level: 6 } });
        n++;
        expect(rec.fallbacks).toBe(0);
        if (rec.winner === strong) wins++;
      }
    }
    expect(wins).toBeGreaterThanOrEqual(11);
  }, 600000);

  it('เก่งกว่าการสุ่มท่า: ชนะอย่างน้อย 26 จาก 32 เกม', () => {
    let wins = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const botSide: PlayerId = seed % 2 ? 'p1' : 'p2';
      const rec = play('sd01', 'sd01', 500 + seed, botSide === 'p1' ? { p1: 'bot', p2: 'random' } : { p1: 'random', p2: 'bot' });
      if (rec.winner === botSide) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(26);
  }, 300000);
});
