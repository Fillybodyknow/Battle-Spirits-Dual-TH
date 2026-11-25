import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS14Cards } from '@bs/cards';
import { applyAction, cardLevel, createGame, type Action, type GameState, type PlayerId } from '../src';

const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;
const DARIU = no('มุฉะดาริว'); // สีแดง คอสต์ 1 BP 3000 (Core 1/3/5) ไม่มีเอฟเฟกต์
const BLADE = no('ริวแมน เบลด'); // คอสต์ 8

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
function put(s: GameState, player: PlayerId, cardNo: string, cores: number, state: 'refresh' | 'exhausted' = 'refresh'): string {
  const id = `t14-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t14-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t14-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
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
/** จบเมนสเต็ปแล้วโจมตี (จัดจ์เมนต์ ดราโกนิส ถามตอนเริ่มแอทแท็คสเต็ป: ไม่ใช้) */
const attack = (s: GameState, attackerId: string) => {
  let x = act(s, { type: 'endMain', player: 'p1' });
  while (x.choice?.player === 'p1' && x.choice.kind === 'option') x = choose(x, x.choice.options.length - 1);
  return act(x, { type: 'declareAttack', player: 'p1', attackerId });
};
/** ใบบนสุดเด็คของ p2 เป็นการ์ดนี้ */
const topOfP2 = (s: GameState, cardNo: string) => {
  s.cards[s.players.p2.deck[0]!]!.cardNo = cardNo;
};

describe('Booster Set 14', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS14Cards().all();
    expect(cards).toHaveLength(41);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('U Trigger ฮิต (คอสต์ต่ำกว่า): อัลติเมท ดรากซอรัส ทำลายสปิริต BP ไม่เกิน 10000 ต่อคอสต์ 1 ของการ์ดที่วางที่แทรช', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท ดรากซอรัส'), 3); // Lv4
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    const top = s.players.p2.deck[0]!; // มุฉะดาริว คอสต์ 1 < 4 = ฮิต → ทำลาย 1 ตัว
    s = attack(s, ult);
    expect(s.players.p2.trashCards).toContain(top);
    expect(s.choice?.kind).toBe('card');
    s = choose(s, a);
    expect(s.players.p2.field).not.toContain(a);
    expect(s.players.p2.field).toContain(b);
  });

  it('U Trigger Guard (คอสต์ไม่ต่ำกว่า): ไม่มีเอฟเฟกต์', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท ดรากซอรัส'), 3);
    const a = put(s, 'p2', DARIU, 1);
    topOfP2(s, BLADE);
    s = attack(s, ult);
    expect(s.choice).toBeNull();
    expect(s.players.p2.field).toContain(a);
  });

  it('Rage: บังคับป้องกันเฉพาะด้วยสปิริต · มีแต่อัลติเมท = ไม่ป้องกันได้', () => {
    let s = setup();
    const judge = put(s, 'p1', no('มังกรล้างสังหารแห่งการตัดสินโทษ จัดจ์เมนต์ ดราโกนิส'), 3); // Lv2
    put(s, 'p2', no('อัลติเมท ดรากซอรัส'), 1);
    s = passAll(attack(s, judge));
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('ok');

    let t = setup();
    const judge2 = put(t, 'p1', no('มังกรล้างสังหารแห่งการตัดสินโทษ จัดจ์เมนต์ ดราโกนิส'), 3);
    put(t, 'p2', DARIU, 1);
    t = passAll(attack(t, judge2));
    expect(fails(t, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
  });

  it('จัดจ์เมนต์ ดราโกนิส Lv3: ได้เล่นเทิร์นของเราอีก 1 เทิร์น (เกมละ 1 ครั้ง)', () => {
    let s = setup();
    const judge = put(s, 'p1', no('มังกรล้างสังหารแห่งการตัดสินโทษ จัดจ์เมนต์ ดราโกนิส'), 4); // Lv3
    s = passAll(attack(s, judge));
    expect(s.extraTurn?.player).toBe('p1');
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = passAll(s);
    while (s.turnPlayer === 'p1' && s.phase === 'attack' && !s.battle && !s.choice) s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.turnPlayer).toBe('p1');
    expect(s.turn).toBe(2);
    expect(s.usedOncePerGame).toContain('p1:judgment-extra-turn');
  });

  it('ริวแมน วัลคา: แอทแท็คสเต็ปของเรา สปิริตเผ่า [มังกรล้างสังหาร] เลเวล +1 (ไม่เกินเลเวลสูงสุด)', () => {
    let s = setup();
    put(s, 'p1', no('ริวแมน วัลคา'), 1);
    const judge = put(s, 'p1', no('มังกรล้างสังหารแห่งการตัดสินโทษ จัดจ์เมนต์ ดราโกนิส'), 1); // Lv1
    expect(cardLevel(s, db, judge)).toBe(1);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(cardLevel(s, db, judge)).toBe(2);
  });

  it('เอคลิปส์ ดราก้อน: การโจมตีของสปิริตคอสต์ไม่เกิน 3 ไลฟ์ไม่ลดลง', () => {
    let s = setup();
    put(s, 'p2', no('เอคลิปส์ ดราก้อน'), 1);
    const atk = put(s, 'p1', DARIU, 1);
    const life = s.players.p2.life.length;
    s = passAll(attack(s, atk));
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = passAll(s);
    expect(s.players.p2.life).toHaveLength(life);
  });

  it('สมิงหมัด คิงรู: สปิริต BP ไม่เกิน 5000 ถูกทำลาย = คู่แข่งสั่งใช้เบิร์ส "หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง" ไม่ได้', () => {
    let s = setup();
    put(s, 'p1', no('สมิงหมัด คิงรู'), 1);
    const victim = put(s, 'p2', DARIU, 1);
    const burst = card(s, 'p2', no('ไยมายากระชากวิญญาณ'));
    s.players.p2.burst = burst;
    const src = card(s, 'p1', DARIU);
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, victim);
    expect(s.players.p2.field).not.toContain(victim);
    expect(s.choice?.player === 'p2').toBe(false);
    expect(s.players.p2.burst).toBe(burst);
  });
});

describe('Booster Set 14 (ขาว)', () => {
  it('U Trigger ขาว ฮิต: อัลติเมท ธอร์ คืนเน็กซัสคู่แข่งขึ้นมือ และไม่ถูกป้องกันโดยสปิริต', () => {
    let s = setup();
    const thor = put(s, 'p1', no('เทพยักษ์สูงสุด อัลติเมท ธอร์'), 1);
    const nexus = put(s, 'p2', no('บทโหมโรงสู่หายนะ'), 0);
    put(s, 'p2', DARIU, 1);
    s = attack(s, thor);
    if (s.choice?.kind === 'card') s = choose(s, nexus);
    expect(s.players.p2.field).not.toContain(nexus);
    expect(s.battle?.unblockable).toBe('spirits');
  });

  it('แทงก์โมบิล ไทป์ 90: ป้องกัน + มีอัลติเมท = นำเบรฟของสปิริตร่วมร่างคู่แข่งกลับขึ้นมือ', () => {
    let s = setup();
    put(s, 'p2', no('แทงก์โมบิล ไทป์ 90'), 1);
    put(s, 'p2', no('อัลติเมท เฟนริล'), 1);
    const host = put(s, 'p1', DARIU, 1);
    const brave = card(s, 'p1', no('ปเทอร์ไฟเตอร์'));
    s.cards[host]!.braves.push(brave);
    const blocker = s.players.p2.field[s.players.p2.field.length - 2]!;
    s = attack(s, host);
    if (s.choice?.player === 'p1') s = choose(s, null); // ปเทอร์ไฟเตอร์: ไม่ตีระบุ
    s = passAll(s);
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    if (s.choice?.kind === 'card') s = choose(s, brave);
    expect(s.cards[host]!.braves).toHaveLength(0);
    expect(s.players.p1.hand).toContain(brave);
  });

  it('คิงฟอร์เทรส: สปิริตเผ่า [อาวุธ] จะสูญสลายโดยเอฟเฟกต์คู่แข่ง = นำคอร์รีเสิร์ฟมาวางอยู่ต่อแบบฟื้นสภาพ', () => {
    let s = setup();
    put(s, 'p2', no('จักรพรรดิป้อมปราการแห่งนภา คิงฟอร์เทรส'), 1);
    const gunner = put(s, 'p2', no('ออโตเมติกกันเนอร์'), 1, 'exhausted');
    const src = card(s, 'p1', DARIU);
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    for (let i = 0; i < 3 && s.choice; i++) {
      if (s.choice.kind === 'card') s = choose(s, gunner);
      else if (s.choice.kind === 'distribute') s = choose(s, { alloc: { [gunner]: 1 } });
      else s = choose(s, 0);
    }
    expect(s.players.p2.field).toContain(gunner);
    expect(s.cards[gunner]!.cores).toHaveLength(1);
    expect(s.cards[gunner]!.state).toBe('refresh');
  });

  it('อัลติเมท เฟรยา: อัญเชิญแล้ว เมื่อจบเทิร์นฟื้นสภาพอัลติเมทสีขาวทั้งหมดของเรา', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท เฟนริล'), 1, 'exhausted');
    const freya = card(s, 'p1', no('อัลติเมท เฟรยา'));
    s.queue = [{ controller: 'p1', sourceId: freya, steps: [{ do: 'turnTrigger', on: 'turnEnd', steps: [{ do: 'refreshAllAllies', filter: { types: ['ultimate'], color: 'white' } }] }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    while (s.turnPlayer === 'p1' && !s.choice) s = act(s, s.phase === 'attack' ? { type: 'endAttackStep', player: 'p1' } : { type: 'endMain', player: 'p1' });
    expect(s.cards[ult]!.state).toBe('refresh');
  });
});

describe('Booster Set 14 (ไม่แสดงผลซ้ำซ้อน)', () => {
  it('สกาย ริโอ 2 ใบ: มือคู่แข่งเพิ่ม 1 ใบในแอทแท็คสเต็ป = ทิ้ง 1 ใบ (ไม่ซ้ำ)', () => {
    let s = setup();
    put(s, 'p2', no('ซากโบราณน้ำแข็งเวหา สกาย ริโอ'), 1);
    put(s, 'p2', no('ซากโบราณน้ำแข็งเวหา สกาย ริโอ'), 1);
    // ระหว่างแฟลชของการต่อสู้ (แอทแท็คสเต็ป): เอฟเฟกต์จั่วของ p1 ทำงาน
    s = attack(s, put(s, 'p1', DARIU, 1));
    expect(s.battle?.flash).toBeTruthy();
    const hand = s.players.p1.hand.length;
    const src = card(s, 'p1', DARIU);
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'draw', count: 1 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'passFlash', player: s.battle!.flash!.priority });
    let discards = 0;
    while (s.choice?.player === 'p1' && s.choice.kind === 'card') {
      discards++;
      s = choose(s, (s.choice as { candidates: string[] }).candidates[0]!);
    }
    expect(discards).toBe(1);
    expect(s.players.p1.hand.length).toBe(hand);
  });
});
