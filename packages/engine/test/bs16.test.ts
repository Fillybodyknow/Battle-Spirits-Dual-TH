import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS16Cards, type Step } from '@bs/cards';
import { applyAction, cardLevel, createGame, payableCost, type Action, type GameState, type PlayerId } from '../src';
import { fieldCost } from '../src/rules';

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
  const id = `t16-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t16-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t16-card-${++seq}`;
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
const optionIndex = (s: GameState, text: string) => (s.choice?.kind === 'option' ? s.choice.options.findIndex((o) => o.includes(text)) : -1);
const queue = (s: GameState, controller: PlayerId, sourceId: string, steps: Step[]) => {
  s.queue = [...s.queue, { controller, sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
};
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};

describe('Booster Set 16 (แดง)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS16Cards().all();
    expect(cards.length).toBeGreaterThanOrEqual(14);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('ดาร์คแมทเทอร์ดราก้อน: แอทแท็คสเต็ปของเรา อัลติเมท ไก-อสุรา ถือว่าเป็น Lv6', () => {
    let s = setup();
    put(s, 'p1', no('ดาร์คแมทเทอร์ดราก้อน'), 1);
    const gai = put(s, 'p1', no('อัลติเมท ไก-อสุรา'), 1);
    expect(cardLevel(s, db, gai)).toBe(3);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.phase).toBe('attack');
    expect(cardLevel(s, db, gai)).toBe(6);
  });

  it('เรือบรรทุกไดโนเสาร์ อาพาโท: แอทแท็คสเต็ปของเรา อัลติเมทร่างคืนจุติถือว่ามีคอสต์ 6 (Lv3 = 7)', () => {
    let s = setup();
    const apato = put(s, 'p1', no('เรือบรรทุกไดโนเสาร์ อาพาโท'), 1);
    const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1); // คอสต์ 7
    expect(fieldCost(s, db, ult)).toBe(7);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(fieldCost(s, db, ult)).toBe(6);
    s.cards[apato]!.cores.push(...['x1', 'x2'].map((c) => ((s.cores[c] = { id: c, owner: 'p1', isSoul: false }), c)));
    expect(fieldCost(s, db, ult)).toBe(7);
  });

  it('แนวกางเขนแห่งดวงดาว: การ์ดสปิริตสีแดงในมือ ใช้เจ็มอัลติเมทลดคอสต์แทนเจ็มแดง 1 ช่องได้', () => {
    const s = setup();
    const max = db.get(no('ช้างเพลิงระเบิด แม็กซิมัส')); // คอสต์ 6 ลด แดง3
    put(s, 'p1', no('อัลติเมท ซีคเวิร์ม'), 1); // เจ็มอัลติเมท 1 (ไม่มีเจ็มแดง) — แต่ทำให้แม็กซิมัสคอสต์ 3 ในมือ: ทดสอบด้วยคอสต์ฐาน
    expect(payableCost(s, db, 'p1', max, 6)).toBe(6);
    put(s, 'p1', no('แนวกางเขนแห่งดวงดาว'), 0);
    // เจ็มแดงของเน็กซัสเอง 1 ช่อง + เจ็มอัลติเมทแทนเจ็มแดงอีก 1 ช่อง
    expect(payableCost(s, db, 'p1', max, 6)).toBe(4);
  });

  it('มูนโบว์ ดรากูน: ถูกทำลายโดยเอฟเฟกต์ของสปิริตคู่แข่ง → จั่ว 1 ใบ', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const moon = put(s, 'p2', no('มูนโบว์ ดรากูน'), 1);
    const hand = s.players.p2.hand.length;
    queue(s, 'p1', src, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit', 'brave'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, moon);
    expect(s.players.p2.trashCards).toContain(moon);
    expect(s.players.p2.hand.length).toBe(hand + 1);
  });

  it('เดบริ-ซาร์ด: คอร์บนสปิริตนี้ไม่กลายเป็น 0 แม้เป็นเอฟเฟกต์ของเราเอง', () => {
    let s = setup();
    const debri = put(s, 'p1', no('เดบริ-ซาร์ด'), 1);
    queue(s, 'p1', debri, [{ do: 'coresOff', cardId: debri, n: 1, to: 'reserve', byOpponent: false }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.field).toContain(debri);
    expect(s.cards[debri]!.cores).toHaveLength(1);
  });

  it('นีโอ แอกเกรสซีฟเรจ: สปิริตที่เลือกได้รับ True-Rage ในเทิร์นนี้', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    queue(s, 'p1', atk, [{ do: 'buffChosen', amount: 3000, ally: true, filter: { color: 'red' } }, { do: 'rageChosenThisTurn' }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, atk);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: atk });
    expect(s.battle?.mustBlock).toBe(true);
  });

  it('อัลติเมท ไก-อสุรา: ฮิต = คอร์บนสปิริตทั้งหมดของเรามาวางบนอัลติเมทนี้ → ไลฟ์คู่แข่ง 1 เม็ด', () => {
    let s = setup();
    const gai = put(s, 'p1', no('อัลติเมท ไก-อสุรา'), 1);
    const a = put(s, 'p1', DARIU, 2);
    s.players.p2.deck.unshift(card(s, 'p2', DARIU, 'hand'));
    s.players.p2.hand.pop();
    const life = s.players.p2.life.length;
    queue(s, 'p1', gai, [{ do: 'uTrigger', then: [{ do: 'allCoresToSelf', then: [{ do: 'opponentLifeToReserve', count: 1 }] }] }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.cards[gai]!.cores).toHaveLength(3);
    expect(s.players.p1.field).not.toContain(a);
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('ฮิสุย แคนนอน ดราก้อน: อัญเชิญมังกรติดเกราะจากมือ 1 ใบ = [เมื่อสปิริตนี้ถูกอัญเชิญ] ของการ์ดนั้นไม่ทำงาน', () => {
    let s = setup();
    const hisui = put(s, 'p1', no('ฮิสุย แคนนอน ดราก้อน'), 1);
    const shiro = card(s, 'p1', no('มังกรเครื่องกล ชิโรงาเนะดราก้อน'), 'hand'); // เมื่อถูกอัญเชิญ: นำสปิริตคู่แข่งกลับขึ้นมือ
    const target = put(s, 'p2', DARIU, 1);
    const ab = db.get(s.cards[hisui]!.cardNo).abilities.find((a) => a.kind === 'trigger' && a.on === 'summon')!;
    queue(s, 'p1', hisui, ab.kind === 'trigger' ? [...ab.steps] : []);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [shiro] });
    s = choose(s, shiro);
    if (s.choice?.kind === 'placeCores') s = choose(s, { pay: s.players.p1.reserve.slice(0, 1) });
    expect(s.players.p1.field).toContain(shiro);
    expect(s.choice).toBeNull();
    expect(s.players.p2.field).toContain(target);
  });

  it('อัลติเมท ไก-อสุรา: ย้ายคอร์มาวาง ดาร์คแมทเทอร์ดราก้อนเหลือคอร์ 1 เม็ด ไม่สูญสลาย ("ไม่กลายเป็น 0 เม็ดโดยเอฟเฟกต์ของผู้เล่นทุกคน")', () => {
    let s = setup();
    const gai = put(s, 'p1', no('อัลติเมท ไก-อสุรา'), 1);
    const dm = put(s, 'p1', no('ดาร์คแมทเทอร์ดราก้อน'), 3);
    s.players.p2.deck.unshift(card(s, 'p2', DARIU, 'hand'));
    s.players.p2.hand.pop();
    queue(s, 'p1', gai, [{ do: 'uTrigger', then: [{ do: 'allCoresToSelf', then: [] }] }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.field).toContain(dm);
    expect(s.cards[dm]!.cores).toHaveLength(1);
    expect(s.cards[gai]!.cores).toHaveLength(3);
  });

  it('อัลติเมท เอ็กซ์-คาลิบัส: Critical Hit (การ์ดที่ฮิตคอสต์ไม่เกิน 3) + ถูกสปิริต BP ไม่เกิน 6000 ป้องกัน = ไลฟ์คู่แข่ง 1 เม็ด', () => {
    let s = setup();
    const ex = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
    const blocker = put(s, 'p2', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ex });
    // U Trigger ฮิต (ดาริวคอสต์ 1 < 7): เลือกทำลาย 1 ตัว
    for (let i = 0; i < 5 && s.choice; i++) s = s.choice.kind === 'card' ? choose(s, s.choice.candidates.find((c) => c !== blocker) ?? s.choice.candidates[0]!) : choose(s, 0);
    s = passAll(s);
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('ริวแมน ไลท์นิ่ง: สปิริตร่างคืนจุติ/มนุษย์มังกรถูกทำลายโดยคู่แข่ง → สั่งใช้เบิร์สสีแดงในมือโดยไม่สนเงื่อนไข', () => {
    let s = setup();
    const src = put(s, 'p2', DARIU, 1);
    put(s, 'p1', no('ริวแมน ไลท์นิ่ง'), 1);
    const victim = put(s, 'p1', no('ริวแมน ทีเกอร์'), 1);
    const burst = card(s, 'p1', no('นีโอ คอลล์ออฟลอสต์'), 'hand');
    const atk = put(s, 'p1', DARIU, 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    const hand = s.players.p1.hand.length;
    queue(s, 'p2', src, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit', 'brave'] } }]);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: atk });
    for (let i = 0; i < 6 && s.choice; i++) {
      if (s.choice.kind === 'card' && s.choice.candidates.includes(victim)) s = choose(s, victim);
      else if (s.choice.kind === 'card' && s.choice.candidates.includes(burst)) s = choose(s, burst);
      else if (s.choice.kind === 'option') s = choose(s, Math.max(0, optionIndex(s, 'ไม่')));
      else s = choose(s, null);
    }
    // เบิร์สของ นีโอ คอลล์ออฟลอสต์: จั่ว 2 ใบ (ไม่จ่ายคอสต์ส่วนเมน) แล้วลงแทรช
    expect(s.players.p1.trashCards).toContain(burst);
    expect(s.players.p1.hand.length).toBe(hand - 1 + 2);
  });
});

describe('Booster Set 16 (ขาว)', () => {
  it('ไวท์แคร็ก: คู่แข่งไม่ได้เซ็ทเบิร์ส = ได้สัญลักษณ์ลดคอสต์ฟ้า 2 เม็ด', () => {
    const s = setup();
    const def = db.get(no('ไวท์แคร็ก')); // คอสต์ 4 ลด ขาว2
    // สปิริตเจ็มฟ้า 1 เม็ด ไม่มีเอฟเฟกต์
    const blue = db.all().find((c) => c.type === 'spirit' && c.symbols.blue === 1 && Object.keys(c.symbols).length === 1 && c.abilities.length === 0)!.cardNo;
    put(s, 'p1', blue, 1);
    put(s, 'p1', blue, 1);
    expect(payableCost(s, db, 'p1', def)).toBe(2);
    s.players.p2.burst = card(s, 'p2', DARIU, 'hand');
    s.players.p2.hand.pop();
    expect(payableCost(s, db, 'p1', def)).toBe(4);
  });

  it('เทพธิดาโชคชะตา เวลซันดี: แอทแท็คสเต็ปของคู่แข่ง การ์ดเผ่า [อาวุธ] ที่ U Trigger เปิด ถือว่าคอสต์ +1', () => {
    let s = setup();
    const gai = put(s, 'p1', no('อัลติเมท ไก-อสุรา'), 1); // คอสต์ 8
    put(s, 'p2', no('เทพธิดาโชคชะตา เวลซันดี'), 2);
    const top = card(s, 'p2', no('อัลติเมท แกรน-โวเดน'), 'hand'); // คอสต์ 8 เผ่าอาวุธ
    s.players.p2.hand.pop();
    s.players.p2.deck.unshift(top);
    s = act(s, { type: 'endMain', player: 'p1' });
    // U Trigger ของไก-อสุราตอนโจมตี (คอสต์ 8): 8 + 1 = 9 ไม่ต่ำกว่า 8 = ไม่ฮิต
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: gai });
    const ev = s.log.find((e) => e.type === 'uTrigger' && (e as { revealedId: string }).revealedId === top) as { cost: number; hit: boolean } | undefined;
    expect(ev?.cost).toBe(9);
    expect(ev?.hit).toBe(false);
  });

  it('อัลติเมท แกรน-โวเดน: คงสปิริตคู่แข่งไว้เท่าคอสต์ของการ์ดที่ U Trigger เปิด ที่เหลือกลับใต้สุดเด็ค', () => {
    let s = setup();
    const gw = put(s, 'p1', no('อัลติเมท แกรน-โวเดน'), 1);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    const c = put(s, 'p2', DARIU, 1);
    s.players.p2.deck.unshift(card(s, 'p2', DARIU, 'hand')); // คอสต์ 1 = คงไว้ 1 ตัว
    s.players.p2.hand.pop();
    queue(s, 'p1', gw, [{ do: 'uTrigger', then: [{ do: 'keepBounceRest', keep: { uTriggerCost: true } }] }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind).toBe('multiCard');
    s = choose(s, { cards: [b] });
    expect(s.players.p2.field).toContain(b);
    expect(s.players.p2.field).not.toContain(a);
    expect(s.players.p2.field).not.toContain(c);
    expect(s.players.p2.deck.slice(-2)).toEqual(expect.arrayContaining([a, c]));
  });

  it('เกรย์การ์ม: อัลติเมทสีขาวของเราถูกทำลายจากการเทียบ BP → กลับขึ้นมือ และเกรย์การ์มฟื้นสภาพ', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท โมโนเคร็อก'), 1); // BP 6000
    const gray = put(s, 'p1', no('เกรย์การ์ม'), 1);
    s.cards[gray]!.state = 'exhausted';
    const big = put(s, 'p1', no('อัลติเมท ไก-อสุรา'), 1); // BP 15000 ผู้โจมตีของ p1? ใช้ p2 โจมตีแทน
    void big;
    const atk = put(s, 'p2', no('อัลติเมท ไก-อสุรา'), 1);
    // ข้ามไปเทิร์นของ p2
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.phase === 'attack') s = act(s, { type: 'endAttackStep', player: 'p1' } as Action);
    s = act(s, { type: 'endMain', player: 'p2' });
    s.players.p2.deck.unshift(card(s, 'p2', no('อัลติเมท ไก-อสุรา'), 'hand')); // U Trigger ไม่ฮิต (คอสต์เท่ากัน)
    s.players.p2.hand.pop();
    s.cards[gray]!.state = 'exhausted';
    s = act(s, { type: 'declareAttack', player: 'p2', attackerId: atk });
    for (let i = 0; i < 6 && s.choice; i++) s = choose(s, s.choice.kind === 'option' ? 0 : null);
    s = passAll(s);
    s = act(s, { type: 'declareBlock', player: 'p1', blockerId: ult });
    s = passAll(s);
    for (let i = 0; i < 6 && s.choice; i++) s = choose(s, s.choice.kind === 'option' ? 0 : null);
    expect(s.players.p1.hand).toContain(ult);
    expect(s.cards[gray]!.state).toBe('refresh');
  });
});

describe('Booster Set 16 (ม่วง)', () => {
  it('ครบชุด BS16: 46 ใบ', () => {
    expect(loadBS16Cards().all()).toHaveLength(46);
  });

  it('โบนเซเบอร์ไทเกอร์: ถูกอัญเชิญ = ในเทิร์นนี้อัลติเมทสีม่วงของเราคอสต์ +1', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท เบลิท'), 1); // คอสต์ 6
    const src = put(s, 'p1', no('โบนเซเบอร์ไทเกอร์'), 1);
    queue(s, 'p1', src, [{ do: 'costBoostThisTurn', filter: { types: ['ultimate'], color: 'purple' }, amount: 1 }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(fieldCost(s, db, ult)).toBe(7);
  });

  it('ดาร์คเวิร์ม โนวา-เรมแนนต์: ระหว่างอยู่บนสนาม สปิริตทั้งหมดร่วมร่างไม่ได้', () => {
    const s = setup();
    put(s, 'p2', no('ดาร์คเวิร์ม โนวา-เรมแนนต์'), 1);
    const host = put(s, 'p1', no('ช้างเพลิงระเบิด แม็กซิมัส'), 1);
    const braveNo = db.all().find((c) => c.type === 'brave' && !c.braveCondition?.family && (c.braveCondition?.minCost ?? 0) <= 6)!.cardNo;
    const b = put(s, 'p1', braveNo, 1);
    const r = applyAction(s, { type: 'brave', player: 'p1', braveId: b, hostId: host }, db);
    expect(r.ok).toBe(false);
  });

  it('แมวงูยมโลก ไอนี่: ดรอว์สเต็ปของเรา ทิ้งการ์ดนี้จากมือ = จั่ว +1', () => {
    let s = setup();
    const aini = card(s, 'p2', no('แมวงูยมโลก ไอนี่'), 'hand');
    const hand = s.players.p2.hand.length;
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.phase === 'attack') s = act(s, { type: 'endAttackStep', player: 'p1' } as Action);
    expect(s.turnPlayer).toBe('p2');
    expect(s.choice?.kind).toBe('option');
    s = choose(s, optionIndex(s, 'ทิ้ง'));
    if (s.choice?.kind === 'card') s = choose(s, aini);
    expect(s.players.p2.trashCards).toContain(aini);
    // ทิ้ง 1 จั่ว 2
    expect(s.players.p2.hand.length).toBe(hand - 1 + 2);
  });

  it('อัลติเมท บาคูลัส: การ์ดอัลติเมทในเด็คเราถูกทิ้งโดยเอฟเฟกต์ทิ้งเด็คของคู่แข่ง → ไลฟ์คู่แข่ง 1 เม็ด', () => {
    let s = setup();
    put(s, 'p2', no('อัลติเมท บาคูลัส'), 1);
    const src = put(s, 'p1', DARIU, 1);
    const top = card(s, 'p2', no('อัลติเมท เบลิท'), 'hand');
    s.players.p2.hand.pop();
    s.players.p2.deck.unshift(top);
    const life = s.players.p1.life.length;
    queue(s, 'p1', src, [{ do: 'mill', count: 1 }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.life.length).toBe(life - 1);
  });

  it('อัลติเมท เบลเซบีท: มีโฟคาลอร์ Lv2 = U Trigger ฮิตอัญเชิญสปิริตม่วงจากแทรชได้ 2 ใบ', () => {
    let s = setup();
    const bz = put(s, 'p1', no('อัลติเมท เบลเซบีท'), 1);
    put(s, 'p1', no('มาร์ควิสยมโลก โฟคาลอร์'), 3);
    const a = card(s, 'p1', no('โบนเซเบอร์ไทเกอร์'), 'trashCards');
    const b = card(s, 'p1', no('อัศวินสิงห์ยมโลก อาโลเคน'), 'trashCards');
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: bz });
    for (let i = 0; i < 12 && s.choice; i++) {
      const c = s.choice;
      if (c.kind === 'card') s = choose(s, c.candidates.find((x) => x === a || x === b) ?? c.candidates[0]!);
      else if (c.kind === 'placeCores') s = choose(s, { pay: s.players.p1.reserve.slice(0, 1) } as never);
      else s = choose(s, 0);
    }
    expect(s.players.p1.field).toEqual(expect.arrayContaining([a, b]));
  });
});
