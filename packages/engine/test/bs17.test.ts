import { describe, expect, it } from 'vitest';
import { CLONE_CARD_NO, loadAllCards, loadBS17Cards, type Step } from '@bs/cards';
import { applyAction, createGame, type Action, type GameState, type PlayerId } from '../src';
import { cardLevel, currentBp, fieldCost, matchesFilter, millBlocked } from '../src/rules';

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
  const id = `t17-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t17-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t17-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
  return id;
}
/** การ์ดใบบนสุดเด็คของ player */
function top(s: GameState, player: PlayerId, cardNo: string): string {
  const id = card(s, player, cardNo, 'hand');
  s.players[player].hand.pop();
  s.players[player].deck.unshift(id);
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
/** ตอบตัวเลือกที่ค้างด้วยตัวแรก (การ์ด = prefer ถ้ามี) */
function settle(s: GameState, prefer: string[] = []): GameState {
  for (let i = 0; i < 20 && s.choice; i++) {
    const c = s.choice;
    if (c.kind === 'card') {
      const discard = c.prompt.includes('ทิ้ง');
      s = choose(s, (discard ? c.candidates.find((x) => !prefer.includes(x)) : c.candidates.find((x) => prefer.includes(x))) ?? c.candidates[0]!);
    }
    else if (c.kind === 'arrange') s = choose(s, { order: c.cardIds } as never);
    else if (c.kind === 'placeCores') s = choose(s, { pay: s.players[c.player].reserve.slice(0, 1) } as never);
    else s = choose(s, 0);
  }
  return s;
}

describe('Booster Set 17 (เขียว)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS17Cards().all();
    expect(cards.length).toBeGreaterThanOrEqual(14);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('เซเบอร์เซเซริ: ถูกวางที่แทรชโดย U Trigger ของอัลติเมทคอสต์ไม่เกิน 7 = Guard (ไม่ฮิต)', () => {
    for (const [topNo, hit] of [
      [no('เซเบอร์เซเซริ'), false],
      [DARIU, true],
    ] as const) {
      let s = setup();
      const ult = put(s, 'p1', no('อัลติเมท เบียคุ-กาโร'), 1);
      put(s, 'p1', no('ฮาคุบิซอร์ด'), 1);
      const target = put(s, 'p2', DARIU, 1);
      top(s, 'p2', topNo);
      s = act(s, { type: 'endMain', player: 'p1' });
      s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ult });
      s = settle(s);
      expect(s.cards[target]!.state).toBe(hit ? 'exhausted' : 'refresh');
    }
  });

  it('ไนท์ไอบิส: สปิริตร่างแยกโจมตี ซ้อนร่างแยกอีกตัว = ในการต่อสู้นี้ คอสต์ 6 / BP 20000 / เจ็มเขียว 2', () => {
    let s = setup();
    put(s, 'p1', no('ไนท์ไอบิส'), 1);
    const a = put(s, 'p1', CLONE_CARD_NO, 1);
    const b = put(s, 'p1', CLONE_CARD_NO, 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: a });
    expect(s.choice?.kind).toBe('card');
    s = choose(s, b);
    expect(s.cards[b]!.state).toBe('exhausted');
    expect(currentBp(s, db, a)).toBe(20000);
    expect(fieldCost(s, db, a)).toBe(6);
    expect(s.cards[a]!.battleSymbols).toEqual([{ color: 'green', count: 1 }]);
  });

  it('ผลของหญ้าเขี้ยวมรกต Lv2: U Trigger ของอัลติเมทเขียวฮิต → นำการ์ดที่มี Quick ในแทรชขึ้นมือ', () => {
    let s = setup();
    put(s, 'p1', no('ผลของหญ้าเขี้ยวมรกต'), 2);
    const ult = put(s, 'p1', no('อัลติเมท อาเมนบอร์ก'), 1);
    put(s, 'p1', no('ฮาคุบิซอร์ด'), 1);
    const q = card(s, 'p1', no('ไลคาออสปาดา'), 'trashCards');
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ult });
    s = settle(s, [q]);
    expect(s.players.p1.hand).toContain(q);
  });

  it('แมลงจ้าวดาบ แกรนดิควากา: Rush แดง = ทำลายเน็กซัสคู่แข่ง · BP+5000', () => {
    let s = setup();
    const g = put(s, 'p1', no('แมลงจ้าวดาบ แกรนดิควากา'), 1);
    put(s, 'p1', DARIU, 1);
    const nx = put(s, 'p2', no('ผลของหญ้าเขี้ยวมรกต'), 0);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: g });
    s = settle(s);
    expect(s.players.p2.field).not.toContain(nx);
    expect(currentBp(s, db, g)).toBe(13000);
  });

  it('อัลติเมท เบียคุ-กาโร Critical Hit: ตอนตัดสินผลการต่อสู้ (ก่อนเทียบ BP) สปิริตคู่แข่งที่เสื่อมสภาพทั้งหมดไปใต้สุดเด็ค', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท เบียคุ-กาโร'), 1);
    const blocker = put(s, 'p2', DARIU, 1);
    s.cards[blocker]!.turnBp = 50000; // BP สูงกว่าเบียคุ-กาโร
    const other = put(s, 'p2', DARIU, 1);
    top(s, 'p2', DARIU); // คอสต์ 1 = ฮิต + Critical Hit
    const life = s.players.p2.life.length;
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ult });
    s = settle(s, [other]);
    expect(s.cards[other]!.state).toBe('exhausted');
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = settle(s);
    expect(s.players.p2.field).not.toContain(blocker);
    expect(s.players.p2.field).not.toContain(other);
    expect(s.players.p2.deck.slice(-2).sort()).toEqual([blocker, other].sort());
    // ผู้ป้องกันหายก่อนเทียบ BP: เบียคุ-กาโรรอด และไลฟ์คู่แข่งไม่ลด
    expect(s.players.p1.field).toContain(ult);
    expect(s.players.p2.life.length).toBe(life);
    expect(s.battle).toBeNull();
  });
});

const queue = (s: GameState, controller: PlayerId, sourceId: string, steps: Step[]) => {
  s.queue = [...s.queue, { controller, sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
};

describe('Booster Set 17 (เหลือง)', () => {
  it('ออร์แกนปีกทองคำ: ถูกวาง = นำใบบนสุดเด็คไม่เกิน 3 ใบไปวางใต้เน็กซัส · ออกจากฟิลด์ = ลงแทรช', () => {
    let s = setup();
    const nx = put(s, 'p1', no('ออร์แกนปีกทองคำ'), 0);
    const deck = s.players.p1.deck.length;
    queue(s, 'p1', nx, [{ do: 'deckToUnder', max: 3 }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind).toBe('option');
    s = choose(s, 0); // 3 ใบ
    expect(s.cards[nx]!.under).toHaveLength(3);
    expect(s.players.p1.deck.length).toBe(deck - 3);
  });

  it('ออร์แกนปีกทองคำ Lv2: U Trigger ของคู่แข่ง เจ้าของเด็คทิ้งการ์ดใต้เน็กซัส 1 ใบ = คอสต์ +2 (ไม่ฮิต)', () => {
    for (const boost of [false, true]) {
      let s = setup();
      const ult = put(s, 'p1', no('อัลติเมท คู-ซี'), 3); // Lv4 คอสต์ 6
      put(s, 'p1', no('นางฟ้าวิสเอล'), 1);
      const nx = put(s, 'p2', no('ออร์แกนปีกทองคำ'), 1);
      const u1 = card(s, 'p2', DARIU, 'hand');
      s.players.p2.hand.pop();
      s.cards[nx]!.under = [u1];
      top(s, 'p2', no('คาลิดอน')); // คอสต์ 4
      s = act(s, { type: 'endMain', player: 'p1' });
      s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ult });
      expect(s.choice?.player).toBe('p2');
      s = choose(s, boost ? 0 : 1);
      expect(!!s.battle?.unblockLowerLevel).toBe(!boost);
      expect(s.cards[nx]!.under?.length ?? 0).toBe(boost ? 0 : 1);
      if (boost) expect(s.players.p2.trashCards).toContain(u1);
    }
  });

  it('อัศวินศักดิ์สิทธิ์ เพนต้น: ถูกทิ้งเด็คโดยคู่แข่ง = อัญเชิญไม่จ่ายคอสต์ได้ + ในเทิร์นนี้เด็คไม่ถูกทิ้ง', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const pen = top(s, 'p2', no('อัศวินศักดิ์สิทธิ์ เพนต้น'));
    queue(s, 'p1', src, [{ do: 'mill', count: 1 }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = settle(s);
    expect(s.players.p2.field).toContain(pen);
    // ในเทิร์นนี้เด็คของเราไม่ถูกทิ้ง
    expect(millBlocked(s, db, 'p1')).toBe(true);
    expect(millBlocked(s, db, 'p2')).toBe(false);
  });

  it('คุณหนูนางฟ้า อาซาเอล: แอทแท็คสเต็ปของคู่แข่ง ผู้โจมตี BP ไม่เกิน 5000 = ไลฟ์ไม่ลด', () => {
    let s = setup();
    put(s, 'p2', no('คุณหนูนางฟ้า อาซาเอล'), 1);
    const a = put(s, 'p1', DARIU, 1);
    const life = s.players.p2.life.length;
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: a });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'noBlock', player: 'p2' });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.players.p2.life.length).toBe(life);
  });

  it('โกลเด้นเคาน์เตอร์: BP-10000 จนเป็น BP0 = ในเทิร์นนี้เจ็มของตัวนั้นถือว่าไม่มี', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const t = put(s, 'p2', DARIU, 1);
    const def = db.get(no('โกลเด้นเคาน์เตอร์'));
    const magic = def.abilities.find((a) => a.kind === 'magic')!;
    queue(s, 'p1', src, [...(magic as { steps: Step[] }).steps]);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = settle(s, [t]);
    expect(s.symbolsZeroCards?.some((x) => x.cardId === t)).toBe(true);
  });
});

describe('Booster Set 17 (ฟ้า)', () => {
  it('ครบชุด BS17: 45 ใบ', () => {
    expect(loadBS17Cards().all()).toHaveLength(45);
  });

  /** โจมตีด้วย attacker แล้วคู่แข่งไม่ป้องกัน (blocker = ป้องกันด้วยตัวนี้) จนถึงจบการต่อสู้ */
  function attack(s: GameState, attacker: string, blocker?: string, prefer: string[] = []): GameState {
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: attacker });
    s = settle(s, prefer);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = blocker ? act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker }) : act(s, { type: 'noBlock', player: 'p2' });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    return s;
  }

  it('Summon Bolt (นักปืนยักษ์ คลิฟฟอร์ด → เทพยักษ์ จูเนียส): อัญเชิญโดย Summon Bolt = ทำลายสปิริตคู่แข่งได้ทุกคอสต์ · อัลติเมท เลเวนในมืออัญเชิญฟรีได้', () => {
    let s = setup();
    const cl = put(s, 'p1', no('นักปืนยักษ์ คลิฟฟอร์ด'), 1);
    const ju = card(s, 'p1', no('เทพยักษ์ จูเนียส'), 'hand');
    const lv = card(s, 'p1', no('อัลติเมท เลเวน'), 'hand');
    const big = put(s, 'p2', no('อาดามันต์ โกเล็ม'), 1); // คอสต์ 6
    s = attack(s, cl);
    expect(s.choice?.kind).toBe('option');
    s = choose(s, 0); // Summon Bolt
    s = settle(s, [ju, big]);
    expect(s.players.p1.field).toContain(ju);
    expect(s.players.p1.trashCards).toContain(cl);
    expect(s.players.p2.field).not.toContain(big);
    expect(s.players.p1.field).toContain(lv);
  });

  it('นักดาบยักษ์ อาร์ชิบอลด์ Lv2: สปิริตที่มี Summon Bolt ทำลายตัวเองด้วย Summon Bolt → ทำลายอาร์ชิบอลด์แทน สปิริตนั้นอยู่ต่อแบบเสื่อมสภาพ', () => {
    let s = setup();
    const te = put(s, 'p1', no('โจรสลัดฝึกหัด เทอร์รี่'), 1);
    const ar = put(s, 'p1', no('นักดาบยักษ์ อาร์ชิบอลด์'), 3);
    const ba = card(s, 'p1', no('เซอร์ไวเวอร์บาดี'), 'hand');
    s = attack(s, te);
    card(s, 'p1', DARIU, 'hand');
    s = choose(s, 0); // Summon Bolt
    expect(s.choice?.kind).toBe('option'); // อาร์ชิบอลด์: แทนการถูกทำลาย
    s = choose(s, 0);
    s = settle(s, [ba]);
    expect(s.players.p1.field).toContain(te);
    expect(s.cards[te]!.state).toBe('exhausted');
    expect(s.players.p1.trashCards).toContain(ar);
    expect(s.players.p1.field).toContain(ba);
  });

  it('ธงโจรสลัดมังกรสามหัว: สปิริตที่มี Summon Bolt ถูกทำลายจากการเทียบ BP ยังใช้ Summon Bolt ได้', () => {
    let s = setup();
    put(s, 'p1', no('ธงโจรสลัดมังกรสามหัว'), 0);
    const te = put(s, 'p1', no('โจรสลัดฝึกหัด เทอร์รี่'), 1);
    const ba = card(s, 'p1', no('เซอร์ไวเวอร์บาดี'), 'hand');
    const bl = put(s, 'p2', DARIU, 1);
    s.cards[bl]!.turnBp = 10000;
    s = attack(s, te, bl);
    expect(s.players.p1.trashCards).toContain(te);
    card(s, 'p1', DARIU, 'hand');
    s = settle(s, [ba]);
    expect(s.players.p1.field).toContain(ba);
  });

  it('แรนดอมบอมบ์: ดูการ์ดในมือคู่แข่ง 1 ใบ แล้วทำลายสปิริตคู่แข่งคอสต์ไม่เกินคอสต์ของการ์ดนั้น', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    s.players.p2.hand = [];
    const h = card(s, 'p2', no('อาดามันต์ โกเล็ม'), 'hand'); // คอสต์ 6
    const t6 = put(s, 'p2', no('อาดามันต์ โกเล็ม'), 1);
    const t8 = put(s, 'p2', no('เทพยักษ์ จูเนียส'), 1);
    const magic = db.get(no('แรนดอมบอมบ์')).abilities.find((a) => a.kind === 'magic')!;
    queue(s, 'p1', src, [...(magic as { steps: Step[] }).steps]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind === 'card' && s.choice.candidates).toEqual([h]);
    s = choose(s, h);
    expect(s.choice?.kind === 'card' && s.choice.candidates).toEqual([t6]);
    s = choose(s, t6);
    expect(s.players.p2.field).not.toContain(t6);
    expect(s.players.p2.field).toContain(t8);
  });

  it('อัลติเมท ออริฮาลคอน โกเล็ม: แอทแท็คสเต็ปของเรา [ทหารสังเคราะห์] ได้รับ Crush (อาดามันต์ โกเล็ม: Crush = Lv สูงสุด)', () => {
    let s = setup();
    put(s, 'p1', no('อัลติเมท ออริฮาลคอน โกเล็ม'), 1);
    const gk = put(s, 'p1', no('เก็คโค โกเล็ม'), 1);
    put(s, 'p1', no('อาดามันต์ โกเล็ม'), 1);
    expect(matchesFilter(s, db, gk, { textIncludes: ['Crush'] })).toBe(false);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(matchesFilter(s, db, gk, { textIncludes: ['Crush'] })).toBe(true);
    expect(cardLevel(s, db, gk)).toBe(2);
  });

  it('อัลติเมท ออริฮาลคอน โกเล็ม: Crush ที่ได้รับทำงานจริง (ตัวที่โจมตีทิ้งเด็คคู่แข่งเท่ากับ Lv ของตัวมันเอง · ตัวมันเองไม่ได้)', () => {
    for (const ultFirst of [true, false]) {
      let s = setup();
      if (ultFirst) put(s, 'p1', no('อัลติเมท ออริฮาลคอน โกเล็ม'), 1);
      const gk = put(s, 'p1', no('เก็คโค โกเล็ม'), 1);
      if (!ultFirst) put(s, 'p1', no('อัลติเมท ออริฮาลคอน โกเล็ม'), 1);
      const lv = cardLevel(s, db, gk);
      const deck = s.players.p2.deck.length;
      s = act(s, { type: 'endMain', player: 'p1' });
      s = settle(act(s, { type: 'declareAttack', player: 'p1', attackerId: gk }));
      expect(s.players.p2.deck.length, ultFirst ? 'อัลติเมทลงก่อน' : 'อัลติเมทลงทีหลัง').toBe(deck - lv);
    }
    // ตัวออริฮาลคอน โกเล็มเองไม่ได้รับ Crush (เจ้าของโปรเจกต์กำหนด): โจมตีเอง = ไม่ทิ้งเด็ค (Lv3 · ยังไม่ถึง U Trigger Lv4)
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท ออริฮาลคอน โกเล็ม'), 1);
    put(s, 'p1', no('เก็คโค โกเล็ม'), 1);
    const deck = s.players.p2.deck.length;
    s = act(s, { type: 'endMain', player: 'p1' });
    s = settle(act(s, { type: 'declareAttack', player: 'p1', attackerId: ult }));
    expect(s.players.p2.deck.length, 'ออริฮาลคอนโจมตีเอง').toBe(deck);
    expect(matchesFilter(s, db, ult, { textIncludes: ['Crush'] })).toBe(false);
    // อัลติเมท [ทหารสังเคราะห์] ตัวอื่น (คาสเซิลโกเล็ม Lv3) ได้ Crush: ทิ้ง 3 + U Trigger เปิด 1 + ฮิตคอสต์ 1 × 3 = 7
    let t = setup();
    put(t, 'p1', no('อัลติเมท ออริฮาลคอน โกเล็ม'), 1);
    const castle = put(t, 'p1', no('อัลติเมท คาสเซิลโกเล็ม'), 1);
    put(t, 'p1', no('เก็คโค โกเล็ม'), 1);
    const d2 = t.players.p2.deck.length;
    t = act(t, { type: 'endMain', player: 'p1' });
    t = settle(act(t, { type: 'declareAttack', player: 'p1', attackerId: castle }));
    expect(t.players.p2.deck.length, 'คาสเซิลโกเล็มโจมตี').toBe(d2 - 7);
  });
});
