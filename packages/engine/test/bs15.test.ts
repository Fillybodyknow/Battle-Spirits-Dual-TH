import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS15Cards } from '@bs/cards';
import { applyAction, blockersFor, canAttackWith, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;
const DARIU = no('มุฉะดาริว'); // สีแดง คอสต์ 1 BP 3000 (Core 1/3/5) ไม่มีเอฟเฟกต์

function setup(): GameState {
  const deck = Array<string>(40).fill(DARIU);
  return createGame({
    db,
    decks: { p1: deck, p2: deck },
    seed: 1,
    firstPlayer: 'p1',
    shuffleDecks: false,
    config: { initialReserve: 12, firstPlayerSkipsAttackStep: false },
  }).state;
}

let seq = 0;
function put(s: GameState, player: PlayerId, cardNo: string, cores: number): string {
  const id = `t15-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t15-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t15-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].hand.push(id);
  return id;
}
function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  let next = r.state;
  while (next.choice?.kind === 'order') next = act(next, { type: 'choose', player: next.choice.player, pick: 0 });
  return next;
}
const fails = (s: GameState, action: Action) => {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
};
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
/** อัญเชิญจากมือ: จ่ายคอสต์ตามจริง (หักลดคอสต์) + วางคอร์ 1 เม็ด */
const summon = (s: GameState, cardId: string) => {
  const cost = payableCost(s, db, 'p1', db.get(s.cards[cardId]!.cardNo));
  const res = normalCores(s);
  return act(s, { type: 'summon', player: 'p1', cardId, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) });
};
/** ตัวเลือกตามข้อความ (ไม่เจอ = ตัวแรก) */
const pickOption = (s: GameState, text: string) => {
  const c = s.choice!;
  if (c.kind !== 'option') throw new Error('ไม่ใช่ตัวเลือก: ' + c.kind);
  const i = c.options.findIndex((o) => o.includes(text));
  return choose(s, Math.max(0, i));
};

describe('Booster Set 15 (เขียว)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS15Cards().all();
    expect(cards).toHaveLength(20);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('บีฮีมอธ ซีดาร์ Lv2: ถ้าจะป้องกันด้วยสปิริต ต้องป้องกัน 2 ตัว แล้วต่อสู้ตัวเดียว', () => {
    let s = setup();
    const cedar = put(s, 'p1', no('สัตว์พันปี บีฮีมอธ ซีดาร์'), 2);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = passAll(attack(s, cedar));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: a });
    // ตัวเดียวไม่พอ: ต้องประกาศตัวที่ 2
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: b });
    expect(s.battle!.blockers).toHaveLength(2);
  });

  it('ไนท์อีเกิล Lv2: สปิริตร่างแยกของเรา BP ของ Lv1 = 11000', () => {
    const s = setup();
    const eagle = put(s, 'p1', no('ไนท์อีเกิล'), 1);
    const clone = put(s, 'p1', 'SMP-BUNSHIN', 1);
    expect(currentBp(s, db, clone)).toBe(3000);
    const c = `t15-core-${++seq}`;
    s.cores[c] = { id: c, owner: 'p1', isSoul: false };
    s.cards[eagle]!.cores.push(c, `${c}-b`);
    s.cores[`${c}-b`] = { id: `${c}-b`, owner: 'p1', isSoul: false };
    expect(currentBp(s, db, clone)).toBe(11000);
  });

  it('ดังกาโร: สร้างสปิริตร่างแยกด้วยคอร์จากวอยด์ 1 เม็ดแทนรีเสิร์ฟ', () => {
    let s = setup();
    put(s, 'p1', no('เทือกเขาดังกาโรที่หมุนวน'), 0);
    const puma = inHand(s, 'p1', no('ซอร์ดพูมา'));
    s = summon(s, puma);
    const reserve = s.players.p1.reserve.length;
    const top = s.players.p1.deck[0]!;
    s = pickOption(s, 'Bunshin');
    s = pickOption(s, 'วอยด์');
    expect(s.players.p1.field).toContain(top);
    expect(s.cards[top]!.cardNo).toBe('SMP-BUNSHIN');
    expect(s.cards[top]!.cores).toHaveLength(1);
    expect(s.players.p1.reserve.length).toBe(reserve);
  });

  it('คานาบูน Rush เหลือง: สปิริตคู่แข่งที่ถูกระบุป้องกันไม่ได้ในเทิร์นนี้ (แต่ยังโจมตีได้)', () => {
    let s = setup();
    put(s, 'p1', no('สัตว์พันปี บีฮีมอธ ซีดาร์'), 1); // เจ็มเหลือง
    const foe = put(s, 'p2', DARIU, 1);
    const k = inHand(s, 'p1', no('คานาบูน'));
    s = summon(s, k);
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(s.turnLocks?.some((l) => l.cardId === foe && l.blockOnly)).toBe(true);
    const atk = put(s, 'p1', DARIU, 1);
    s = passAll(attack(s, atk));
    expect(blockersFor(s, db, 'p2')).not.toContain(foe);
    expect(canAttackWith(s, db, foe)).toBe(true);
  });

  it('ไกเซอร์แอตลาส Lv4: ชนะการเทียบ BP ตอนโจมตี = ไลฟ์คู่แข่ง 1 เม็ดไปวอยด์', () => {
    let s = setup();
    const atlas = put(s, 'p1', no('อัลติเมท ไกเซอร์แอตลาส'), 3); // Lv4 BP 15000
    // U Trigger ไม่ฮิต: ใบบนสุดเด็คคู่แข่งคอสต์ 8 (ไม่ต่ำกว่า 6) = ไม่เสื่อมสภาพคู่แข่ง
    s.cards[s.players.p2.deck[0]!]!.cardNo = no('ริวแมน เบลด');
    const foe = put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    const reserve = s.players.p2.reserve.length;
    s = passAll(attack(s, atlas));
    s = passAll(act(s, { type: 'declareBlock', player: 'p2', blockerId: foe }));
    expect(s.players.p2.field).not.toContain(foe);
    expect(s.players.p2.life.length).toBe(life - 1);
    // รีเสิร์ฟ +1 = คอร์ของสปิริตที่ถูกทำลาย (คอร์ไลฟ์ไปวอยด์ ไม่ใช่รีเสิร์ฟ)
    expect(s.players.p2.reserve.length).toBe(reserve + 1);
  });

  it('แอกซ์มอธ: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง = กลับขึ้นมือ', () => {
    let s = setup();
    const moth = put(s, 'p2', no('แอกซ์มอธ'), 1);
    const src = put(s, 'p1', DARIU, 1);
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, moth);
    expect(s.players.p2.hand).toContain(moth);
  });

  it('แชโดว์ลีฟ (เบิร์ส): ให้ Bunshin ของสปิริตของเราทำงาน', () => {
    let s = setup();
    put(s, 'p1', no('ซอร์ดพูมา'), 1);
    const src = put(s, 'p1', DARIU, 1);
    const top = s.players.p1.deck[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'activateBunshin' }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    s = pickOption(s, 'Bunshin');
    if (s.choice?.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.cards[top]!.cardNo).toBe('SMP-BUNSHIN');
    expect(s.players.p1.field).toContain(top);
  });
});
