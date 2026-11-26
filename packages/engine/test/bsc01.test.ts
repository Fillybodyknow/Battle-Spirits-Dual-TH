import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBSC01Cards, type Step } from '@bs/cards';
import { applyAction, attackLifeDamage, canAttackWith, createGame, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `tc1-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `tc1-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `tc1-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
  return id;
}
function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  let next = r.state;
  while (next.choice?.kind === 'order') next = act(next, { type: 'choose', player: next.choice.player, pick: 0 });
  return next;
}
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const optionIndex = (s: GameState, text: string) => (s.choice?.kind === 'option' ? s.choice.options.findIndex((o) => o.includes(text)) : -1);
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
/** p1 โจมตีด้วยการ์ดนี้ p2 ไม่ป้องกัน → ไลฟ์ p2 ลด → จุดเปิดเบิร์ส */
const hitP2 = (s: GameState, attackerId: string) => passAll(act(passAll(attack(s, attackerId)), { type: 'noBlock', player: 'p2' }));
/** วางเอฟเฟกต์ในคิว (ทำงานตอน action ถัดไป) */
const queue = (s: GameState, controller: PlayerId, sourceId: string, steps: Step[]) => {
  s.queue = [...s.queue, { controller, sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
};

describe('BSC01 (BSC15)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBSC01Cards().all();
    expect(cards).toHaveLength(16);
    for (const c of cards) {
      expect(c.set).toBe('BSC01');
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('ซาโตริดีมอน (เบิร์ส): คอร์บนสปิริตคู่แข่งทั้งหมดไปรีเสิร์ฟจนเหลือตัวละ 1 เม็ด', () => {
    let s = setup();
    const satori = card(s, 'p2', no('ซาโตริดีมอน'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== satori);
    s.players.p2.burst = satori;
    const attacker = put(s, 'p1', DARIU, 3);
    const big = put(s, 'p1', DARIU, 4);
    const one = put(s, 'p1', DARIU, 1);
    s = hitP2(s, attacker);
    expect(optionIndex(s, 'เปิด Burst')).toBeGreaterThanOrEqual(0);
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    while (s.choice && s.choice.player === 'p1') s = choose(s, 0);
    expect(s.cards[big]!.cores).toHaveLength(1);
    expect(s.cards[attacker]!.cores).toHaveLength(1);
    expect(s.cards[one]!.cores).toHaveLength(1);
    // ไม่มีอัลติเมท = ไม่อัญเชิญ → ลงแทรช
    expect(s.players.p2.trashCards).toContain(satori);
  });

  it('ซาโตริดีมอน: อยู่ในแทรช หลังจากเบิร์สของเราถูกสั่งใช้ → กลับขึ้นมือ', () => {
    let s = setup();
    const satori = card(s, 'p2', no('ซาโตริดีมอน'), 'trashCards');
    const death = card(s, 'p2', no('เดธเบิร์สต์'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== death);
    s.players.p2.burst = death;
    const attacker = put(s, 'p1', DARIU, 1);
    s = hitP2(s, attacker);
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    for (let i = 0; i < 10 && s.choice; i++) s = choose(s, s.choice.kind === 'option' ? Math.max(0, optionIndex(s, 'ไม่')) : s.choice.kind === 'card' ? s.choice.candidates[0]! : null);
    expect(s.players.p2.hand).toContain(satori);
    expect(s.players.p2.trashCards).not.toContain(satori);
  });

  it('ฮานะโนะแมนทิส (เบิร์ส): เสื่อมสภาพสปิริตคอสต์ไม่เกิน 3 ของผู้เล่นทุกคน', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const mine = put(s, 'p1', DARIU, 1);
    const theirs = put(s, 'p2', DARIU, 1);
    const big = put(s, 'p2', no('ซันซกคุ-แบร์'), 1); // คอสต์ 5
    queue(s, 'p1', src, [{ do: 'exhaustAllOpponent', filter: { types: ['spirit', 'brave'], maxCost: 3 }, bothSides: true }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.cards[mine]!.state).toBe('exhausted');
    expect(s.cards[theirs]!.state).toBe('exhausted');
    expect(s.cards[big]!.state).toBe('refresh');
  });

  it('ทัวร์มาลีนดรากูน: จะสูญสลายโดยคู่แข่ง → วางคอร์จากวอยด์ อยู่ต่อแบบเสื่อมสภาพ', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const tour = put(s, 'p2', no('ทัวร์มาลีนดรากูน'), 1);
    queue(s, 'p1', src, [{ do: 'removeOpponentCores', count: 1, filter: { types: ['spirit', 'brave'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, tour);
    expect(s.players.p2.field).toContain(tour);
    expect(s.cards[tour]!.cores).toHaveLength(1);
    expect(s.cards[tour]!.state).toBe('exhausted');
  });

  it('ทัวร์มาลีนดรากูน Lv2: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง → อยู่ต่อแบบเสื่อมสภาพ', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const tour = put(s, 'p2', no('ทัวร์มาลีนดรากูน'), 2);
    queue(s, 'p1', src, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit', 'brave'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, tour);
    expect(s.players.p2.field).toContain(tour);
    expect(s.cards[tour]!.state).toBe('exhausted');
  });

  it('ทัวร์มาลีนดรากูน (เบิร์ส): นำเบิร์สของคู่แข่งกลับขึ้นมือ', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const b = card(s, 'p2', no('เดธเบิร์สต์'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== b);
    s.players.p2.burst = b;
    queue(s, 'p1', src, [{ do: 'bounceOpponentBurst' }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p2.burst).toBeNull();
    expect(s.players.p2.hand).toContain(b);
  });

  it('เนเมียนไลอ้อน (เบิร์ส): ในเทิร์นนี้ สปิริตคอสต์ไม่เกิน 4 ของคู่แข่งโจมตีไม่ได้', () => {
    let s = setup();
    const src = put(s, 'p2', DARIU, 1);
    const small = put(s, 'p1', DARIU, 1);
    const big = put(s, 'p1', no('ซันซกคุ-แบร์'), 1); // คอสต์ 5
    queue(s, 'p2', src, [{ do: 'opponentCannotAttack', types: ['spirit', 'brave'], filter: { maxCost: 4 } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(canAttackWith(s, db, small)).toBe(false);
    expect(canAttackWith(s, db, big)).toBe(true);
  });

  it('เบิร์สต์แบริเออร์ (เบิร์ส): การโจมตีของสปิริตคอสต์ไม่เกิน 3 ไลฟ์เราไม่ลด', () => {
    let s = setup();
    const src = put(s, 'p2', DARIU, 1);
    const small = put(s, 'p1', DARIU, 1);
    const big = put(s, 'p1', no('ซันซกคุ-แบร์'), 1);
    queue(s, 'p2', src, [{ do: 'lifeShieldThisTurn', maxCost: 3, spiritsOnly: true }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(attackLifeDamage(s, db, small)).toBe(0);
    expect(attackLifeDamage(s, db, big)).toBeGreaterThan(0);
  });

  it('ริวแมน ก็อดเบรกเกอร์: ทิ้งสปิริตเผ่ามนุษย์มังกร 2 ใบ เพื่อฟื้นสภาพ', () => {
    let s = setup();
    const god = put(s, 'p1', no('ริวแมน ก็อดเบรกเกอร์'), 3);
    const h1 = card(s, 'p1', no('ริวแมน แฮมเมอร์'), 'hand');
    const h2 = card(s, 'p1', no('ริวแมน แฮมเมอร์'), 'hand');
    s = attack(s, god);
    expect(optionIndex(s, 'อัลติเมท')).toBe(-1); // ไม่มีการ์ดอัลติเมทในมือ
    s = choose(s, optionIndex(s, 'มนุษย์มังกร'));
    if (s.choice?.kind === 'multiCard') s = choose(s, { cards: [h1, h2] });
    while (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, s.choice.candidates[0]!);
    expect(s.players.p1.trashCards).toEqual(expect.arrayContaining([h1, h2]));
    expect(s.cards[god]!.state).toBe('refresh');
  });

  it('ริวแมน ก็อดเบรกเกอร์: มนุษย์มังกรในมือใบเดียว = ไม่มีตัวเลือก', () => {
    let s = setup();
    const god = put(s, 'p1', no('ริวแมน ก็อดเบรกเกอร์'), 3);
    card(s, 'p1', no('ริวแมน แฮมเมอร์'), 'hand');
    s = attack(s, god);
    expect(optionIndex(s, 'มนุษย์มังกร')).toBe(-1);
  });
});

describe('Draw Step แบบกดจั่วเอง: ไม่มีอะไรให้จั่ว', () => {
  it('สลากสืบทอดบัลลังก์ ทิ้งใบบนสุด "แทนการจั่ว" → การ์ดอื่นกลับขึ้นมือ และไม่ต้องกดจั่ว (ไปเมนสเต็ปเลย)', () => {
    const deck = Array<string>(40).fill(DARIU);
    let s = createGame({ db, decks: { p1: deck, p2: deck }, seed: 1, firstPlayer: 'p1', shuffleDecks: false, config: { initialReserve: 12, manualDraw: true } }).state;
    put(s, 'p2', no('สลากสืบทอดบัลลังก์'), 0);
    s = act(s, { type: 'drawStep', player: 'p1' });
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.phase === 'attack') s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.turnPlayer).toBe('p2');
    const top = s.players.p2.deck[0]!;
    const hand = s.players.p2.hand.length;
    expect(optionIndex(s, 'แทนการจั่ว')).toBe(0);
    s = choose(s, 0);
    expect(s.players.p2.hand).toContain(top);
    expect(s.players.p2.hand).toHaveLength(hand + 1);
    expect(s.awaitingDraw).toBeUndefined();
    expect(s.phase).toBe('main');
  });
});
