import { describe, expect, it } from 'vitest';
import { bpOf, createGame, getPlayerView, levelOf } from '../src';
import { act, actFails, db, endTurn, inHand, passBoth, reserve, setup, summon } from './helpers';

const PUP = 'SMP-001'; // red cost1 ลด red1, Lv1:1 1000 / Lv2:3 3000, gem red1
const LANCER = 'SMP-002'; // red cost3 ลด red2, BP 3000
const WYRM = 'SMP-004'; // red cost6 ลด red3, gem red2
const SPRITE = 'SMP-005'; // green cost1 ลด green1, BP 2000
const BEETLE = 'SMP-006'; // green cost3 ลด green2, BP 3000
const GOLEM = 'SMP-007'; // มี Burst
const STONE = 'SMP-009'; // nexus red cost2 ลด red1, gem red1
const FIRE = 'SMP-010'; // magic cost4 ลด red2, มี Burst
const TITAN = 'SMP-011'; // ultimate

describe('การเตรียมเกม (หมวด 5)', () => {
  it('Life 5, Reserve 3 + Soul Core, มือ 4 ใบ และผู้เริ่มก่อนไม่ได้ Core เทิร์นแรก', () => {
    const s = setup();
    expect(s.turn).toBe(1);
    expect(s.turnPlayer).toBe('p1');
    expect(s.phase).toBe('main');
    for (const p of ['p1', 'p2'] as const) {
      expect(s.players[p].life).toHaveLength(5);
      expect(s.players[p].reserve.filter((id) => s.cores[id]!.isSoul)).toHaveLength(1);
    }
    expect(s.players.p1.reserve).toHaveLength(4); // ไม่ได้ Core ใน Core Step
    expect(s.players.p1.hand).toHaveLength(5); // 4 + Draw Step
    expect(s.players.p2.hand).toHaveLength(4);
    expect(s.players.p1.deck).toHaveLength(35);
  });

  it('ผู้เล่นคนที่สองได้ Core และจั่วตามปกติ', () => {
    const s = endTurn(setup());
    expect(s.turn).toBe(2);
    expect(s.turnPlayer).toBe('p2');
    expect(s.players.p2.reserve).toHaveLength(5);
    expect(s.players.p2.hand).toHaveLength(5);
  });

  it('seed เดียวกันได้ผลเหมือนเดิม (deterministic)', () => {
    const decks = { p1: Array(40).fill(PUP), p2: db.all().flatMap((c) => [c.cardNo, c.cardNo, c.cardNo]) };
    decks.p2.push(PUP, PUP, PUP, PUP);
    const a = createGame({ db, decks, seed: 42 }).state;
    const b = createGame({ db, decks, seed: 42 }).state;
    const c = createGame({ db, decks, seed: 43 }).state;
    expect(a).toEqual(b);
    const order = (s: typeof a) => s.players.p2.deck.map((id) => s.cards[id]!.cardNo).join();
    expect(order(a)).not.toBe(order(c));
  });
});

describe('Core, คอสต์ และเลเวล (หมวด 3)', () => {
  it('ลดคอสต์ได้เมื่อมี gem สีเดียวกันบนสนาม', () => {
    let s = setup({ p1: [PUP, PUP, LANCER], config: { initialReserve: 4 } }); // Reserve 5
    s = summon(s, 'p1', PUP, 1, 1); // ไม่มี gem แดง → จ่ายเต็ม 1
    s = summon(s, 'p1', PUP, 0, 1); // gem แดง 1 → คอสต์ 0
    expect(s.players.p1.field).toHaveLength(2);
    expect(s.players.p1.trashCores).toHaveLength(1);
    // Lancer คอสต์ 3 ลด red2 และมี gem แดง 2 → จ่าย 1 (เหลือ Core ใน Reserve 2)
    actFails(s, { type: 'summon', player: 'p1', cardId: inHand(s, 'p1', LANCER), payment: [], placement: reserve(s, 'p1', 1) }, 'WRONG_PAYMENT');
    s = summon(s, 'p1', LANCER, 1, 1);
    expect(s.players.p1.field).toHaveLength(3);
  });

  it('ลดได้ไม่เกินจำนวนบนสัญลักษณ์ลดคอสต์ แม้มี gem มากกว่า', () => {
    let s = setup({ p1: [STONE, PUP, PUP, WYRM], config: { initialReserve: 7 } }); // Reserve 8
    // Nexus ไม่ต้องวาง Core: คอสต์ 2 ลด red1 แต่ยังไม่มี gem แดง → จ่าย 2
    s = act(s, { type: 'deployNexus', player: 'p1', cardId: inHand(s, 'p1', STONE), payment: reserve(s, 'p1', 2), placement: [] });
    s = summon(s, 'p1', PUP, 0, 1); // gem แดงจาก Nexus → คอสต์ 0
    s = summon(s, 'p1', PUP, 0, 1); // gem แดงรวม 3
    expect(s.players.p1.reserve).toHaveLength(4);
    // Wyrm คอสต์ 6 ลดได้สูงสุด red3 แม้ gem มี 3 → จ่าย 3 (ไม่ใช่ 2)
    const wyrm = inHand(s, 'p1', WYRM);
    const [a, b, c, d] = reserve(s, 'p1', 4) as [string, string, string, string];
    actFails(s, { type: 'summon', player: 'p1', cardId: wyrm, payment: [a, b], placement: [c] }, 'WRONG_PAYMENT');
    s = act(s, { type: 'summon', player: 'p1', cardId: wyrm, payment: [a, b, c], placement: [d] });
    expect(s.players.p1.field).toContain(wyrm);
  });

  it('จ่ายด้วย Core บนการ์ดในสนามได้ แต่ห้ามใช้ Core ใน Trash', () => {
    let s = setup({ p1: [PUP, SPRITE] });
    s = summon(s, 'p1', PUP, 1, 1);
    const trashCore = s.players.p1.trashCores[0]!;
    const sprite = inHand(s, 'p1', SPRITE);
    actFails(s, { type: 'summon', player: 'p1', cardId: sprite, payment: [trashCore], placement: reserve(s, 'p1', 1) }, 'CORE_NOT_USABLE');

    // ใช้ Core จาก Pup จ่าย → Pup สูญสลาย
    const pup = s.players.p1.field[0]!;
    const onPup = s.cards[pup]!.cores[0]!;
    s = act(s, { type: 'summon', player: 'p1', cardId: sprite, payment: [onPup], placement: reserve(s, 'p1', 1) });
    expect(s.players.p1.field).toEqual([sprite]);
    expect(s.players.p1.trashCards).toContain(pup);
    expect(s.log.some((e) => e.type === 'depleted' && e.cardId === pup)).toBe(true);
  });

  it('action ผิดกติกาไม่แก้ state เดิม', () => {
    const s = setup({ p1: [PUP] });
    const before = structuredClone(s);
    actFails(s, { type: 'summon', player: 'p1', cardId: inHand(s, 'p1', PUP), payment: [], placement: reserve(s, 'p1', 1) }, 'WRONG_PAYMENT');
    actFails(s, { type: 'summon', player: 'p1', cardId: inHand(s, 'p1', PUP), payment: reserve(s, 'p1', 1), placement: [] }, 'NOT_ENOUGH_CORES');
    const [a] = reserve(s, 'p1', 1);
    actFails(s, { type: 'summon', player: 'p1', cardId: inHand(s, 'p1', PUP), payment: [a!], placement: [a!] }, 'DUPLICATE_CORE');
    actFails(s, { type: 'summon', player: 'p2', cardId: inHand(s, 'p1', PUP), payment: [], placement: [] }, 'NOT_YOUR_TURN');
    expect(s).toEqual(before);
  });

  it('เลเวลและ BP ตามจำนวน Core และย้าย Core ใน Main Step', () => {
    let s = setup({ p1: [PUP] });
    s = summon(s, 'p1', PUP, 1, 1);
    const pup = s.players.p1.field[0]!;
    const def = db.get(PUP);
    expect(levelOf(def, 1)).toBe(1);

    s = act(s, { type: 'moveCores', player: 'p1', moves: reserve(s, 'p1', 2).map((coreId) => ({ coreId, to: { cardId: pup } })) });
    expect(s.cards[pup]!.cores).toHaveLength(3);
    expect(bpOf(def, 3)).toBe(3000);

    // ย้ายออกทั้งหมด → สูญสลาย Core กลับ Reserve
    s = act(s, { type: 'moveCores', player: 'p1', moves: s.cards[pup]!.cores.map((coreId) => ({ coreId, to: { area: 'reserve' } })) });
    expect(s.players.p1.field).toHaveLength(0);
    expect(s.players.p1.trashCards).toEqual([pup]);
    expect(s.players.p1.reserve).toHaveLength(3);
  });

  it('Magic จ่ายคอสต์แล้วลง Trash', () => {
    let s = setup({ p1: [FIRE, TITAN] });
    s = act(s, { type: 'useMagic', player: 'p1', cardId: inHand(s, 'p1', FIRE), payment: reserve(s, 'p1', 4) });
    expect(s.players.p1.trashCards).toHaveLength(1);
    expect(s.players.p1.trashCores).toHaveLength(4);
  });
});

describe('Burst', () => {
  it('เซ็ทได้เทิร์นละครั้ง เฉพาะการ์ดที่มี Burst และใบเก่าลง Trash', () => {
    let s = setup({ p1: [GOLEM, FIRE, PUP], p2: [GOLEM] });
    actFails(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', PUP) }, 'NO_BURST_EFFECT');
    s = act(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', GOLEM) });
    actFails(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', FIRE) }, 'BURST_ALREADY_SET');

    s = endTurn(endTurn(s));
    const old = s.players.p1.burst!;
    s = act(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', FIRE) });
    expect(s.players.p1.trashCards).toEqual([old]);
  });

  it('ทิ้ง Burst ลง Trash ได้ใน Main Step (ไม่นับเป็นการเซ็ท และเซ็ทใหม่ได้ถ้ายังไม่ได้เซ็ทเทิร์นนี้)', () => {
    let s = setup({ p1: [GOLEM, FIRE], p2: [GOLEM] });
    actFails(s, { type: 'discardBurst', player: 'p1' }, 'NO_BURST');
    s = act(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', GOLEM) });
    const golem = s.players.p1.burst!;
    s = act(s, { type: 'discardBurst', player: 'p1' });
    expect(s.players.p1.burst).toBeNull();
    expect(s.players.p1.trashCards).toEqual([golem]);
    actFails(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', FIRE) }, 'BURST_ALREADY_SET');
    s = endTurn(endTurn(s));
    s = act(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', FIRE) });
    s = act(s, { type: 'endMain', player: 'p1' });
    actFails(s, { type: 'discardBurst', player: 'p1' }, 'WRONG_PHASE');
  });
});

describe('ลำดับเทิร์น (หมวด 6)', () => {
  it('ผู้เริ่มก่อนข้าม Attack Step เทิร์นแรกตาม config ค่าเริ่มต้น', () => {
    const s = act(setup(), { type: 'endMain', player: 'p1' });
    expect(s.turnPlayer).toBe('p2');
    expect(s.phase).toBe('main');
  });

  it('ปิด config แล้วผู้เริ่มก่อนโจมตีได้เทิร์นแรก', () => {
    const s = act(setup({ config: { firstPlayerSkipsAttackStep: false } }), { type: 'endMain', player: 'p1' });
    expect(s.turnPlayer).toBe('p1');
    expect(s.phase).toBe('attack');
  });

  it('Refresh Step ฟื้นสภาพการ์ดและคืน Core จาก Trash', () => {
    let s = setup({ p1: [PUP] });
    s = summon(s, 'p1', PUP, 1, 1);
    s = endTurn(endTurn(s));
    expect(s.players.p1.trashCores).toHaveLength(0);
    expect(s.players.p1.reserve).toHaveLength(4); // 2 + 1 จาก Trash + 1 จาก Core Step
  });

  it('เด็คเป็น 0 ใบตอน Start Step แพ้', () => {
    let s = setup({ deckSize: 6 }); // มือ 4 ใบ เด็คเหลือ 2
    s = endTurn(endTurn(s)); // เทิร์น 3: p1 จั่วใบสุดท้าย
    expect(s.players.p1.deck).toHaveLength(0);
    s = endTurn(s); // เทิร์น 4 p2 จั่วใบสุดท้าย
    s = endTurn(s); // เทิร์น 5 p1 Start Step เด็คว่าง
    expect(s.winner).toBe('p2');
    expect(s.endReason).toBe('deckOut');
  });
});

describe('การโจมตีและบล็อก (หมวด 7)', () => {
  /** p1 มี Pup และ Lancer บนสนาม, p2 มี Sprite และ Beetle — อยู่ใน Attack Step เทิร์น 3 */
  function battleReady() {
    let s = setup({ p1: [PUP, LANCER], p2: [SPRITE, BEETLE] });
    s = summon(s, 'p1', PUP, 1, 1); // reserve p1 เหลือ 2
    s = endTurn(s);
    s = summon(s, 'p2', SPRITE, 1, 1); // reserve p2 5 → 3
    s = summon(s, 'p2', BEETLE, 2, 1); // คอสต์ 3 ลด green2 แต่ gem เขียวมี 1 → จ่าย 2
    return endTurn(s); // เทิร์น 3 ของ p1 (Reserve 4)
  }

  it('ไม่บล็อก: Life ลดตาม gem symbol และ Core ไป Reserve ของฝ่ายป้องกัน', () => {
    let s = setup({ p1: [PUP] });
    s = summon(s, 'p1', PUP, 1, 1);
    s = endTurn(endTurn(s));
    s = act(s, { type: 'endMain', player: 'p1' });
    const pup = s.players.p1.field[0]!;
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: pup });
    expect(s.cards[pup]!.state).toBe('exhausted');

    // ฝ่ายป้องกันได้สิทธิ์ Flash ก่อน
    actFails(s, { type: 'passFlash', player: 'p1' }, 'NOT_YOUR_PRIORITY');
    s = passBoth(s);
    expect(s.battle!.step).toBe('declareBlock');
    actFails(s, { type: 'noBlock', player: 'p1' }, 'NOT_DEFENDER');

    const reserveBefore = s.players.p2.reserve.length;
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life).toHaveLength(4);
    expect(s.players.p2.reserve).toHaveLength(reserveBefore + 1);
    expect(s.battle).toBeNull();

    // การ์ดเสื่อมสภาพแล้วโจมตีซ้ำไม่ได้
    actFails(s, { type: 'declareAttack', player: 'p1', attackerId: pup }, 'EXHAUSTED');
  });

  it('บล็อก: BP ต่ำกว่าถูกทำลาย ฝ่ายป้องกันไม่เสียไลฟ์', () => {
    let s = battleReady();
    s = act(s, { type: 'endMain', player: 'p1' });
    const pup = s.players.p1.field[0]!;
    const sprite = s.players.p2.field[0]!;
    s = passBoth(act(s, { type: 'declareAttack', player: 'p1', attackerId: pup }));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: sprite });
    expect(s.battle!.flash!.priority).toBe('p2');
    s = passBoth(s);

    expect(s.players.p1.field).not.toContain(pup); // 1000 < 2000
    expect(s.players.p1.trashCards).toContain(pup);
    expect(s.players.p2.field).toContain(sprite);
    expect(s.cards[sprite]!.state).toBe('exhausted');
    expect(s.players.p2.life).toHaveLength(5);
  });

  it('BP เท่ากันถูกทำลายทั้งคู่', () => {
    let s = battleReady();
    s = summon(s, 'p1', LANCER, 2, 1); // คอสต์ 3 ลด red2 แต่ gem แดงมี 1 → จ่าย 2
    s = act(s, { type: 'endMain', player: 'p1' });
    const lancer = s.players.p1.field[1]!; // 3000
    const beetle = s.players.p2.field[1]!; // 3000
    // อัญเชิญเทิร์นนี้ก็โจมตีได้ทันที
    s = passBoth(act(s, { type: 'declareAttack', player: 'p1', attackerId: lancer }));
    s = passBoth(act(s, { type: 'declareBlock', player: 'p2', blockerId: beetle }));
    expect(s.players.p1.field).not.toContain(lancer);
    expect(s.players.p2.field).not.toContain(beetle);
    expect(s.log.filter((e) => e.type === 'destroyed')).toHaveLength(2);
    // Core บนการ์ดที่ถูกทำลายกลับ Reserve ของเจ้าของ
    expect(s.players.p2.reserve).toHaveLength(1);
  });

  it('Life เป็น 0 แพ้ทันที และเกมรับ action ต่อไม่ได้', () => {
    let s = setup({ p1: [PUP], config: { initialLife: 1 } });
    s = summon(s, 'p1', PUP, 1, 1);
    s = endTurn(endTurn(s));
    s = act(s, { type: 'endMain', player: 'p1' });
    s = passBoth(act(s, { type: 'declareAttack', player: 'p1', attackerId: s.players.p1.field[0]! }));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.winner).toBe('p1');
    expect(s.endReason).toBe('lifeZero');
    actFails(s, { type: 'endAttackStep', player: 'p1' }, 'GAME_OVER');
  });

  it('ยอมแพ้ได้ทุกเมื่อ', () => {
    const s = act(setup(), { type: 'concede', player: 'p2' });
    expect(s.winner).toBe('p1');
  });
});

describe('มุมมองผู้เล่น (หมวด 10)', () => {
  it('ซ่อนมือ, เด็ค และ Burst ของคู่ต่อสู้ และไม่ส่ง rng', () => {
    let s = setup({ p1: [GOLEM] });
    s = act(s, { type: 'setBurst', player: 'p1', cardId: inHand(s, 'p1', GOLEM) });
    const v = getPlayerView(s, 'p2');
    expect('rng' in v).toBe(false);
    expect(v.cards[s.players.p1.burst!]!.cardNo).toBeNull();
    expect(v.cards[s.players.p1.hand[0]!]!.cardNo).toBeNull();
    expect(v.cards[s.players.p2.hand[0]!]!.cardNo).not.toBeNull();
    expect(v.cards[s.players.p2.deck[0]!]!.cardNo).toBeNull();
    expect(getPlayerView(s, 'p1').cards[s.players.p1.burst!]!.cardNo).toBe(GOLEM);
  });
});
