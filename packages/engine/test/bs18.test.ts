import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS18Cards } from '@bs/cards';
import { applyAction, createGame, type Action, type GameState, type PlayerId } from '../src';
import { baseCost, currentBp, matchesFilter, payableCost, summonConditionOk } from '../src/rules';

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
  const id = `t18-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t18-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t18-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
  return id;
}
/** เบรฟร่วมร่างกับ host */
function brave(s: GameState, host: string, cardNo: string): string {
  const id = `t18-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: s.cards[host]!.owner, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.cards[host]!.braves.push(id);
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
/** จ่ายคอสต์ที่ถามด้วยคอร์ในรีเสิร์ฟ */
const pay = (s: GameState) => {
  const c = s.choice!;
  const cost = c.kind === 'payCost' ? c.cost : 0;
  return choose(s, { pay: s.players[c.player].reserve.slice(0, cost) });
};
/** ตัวเลือกที่ข้อความขึ้นต้นด้วย prefix */
const option = (s: GameState, prefix: string) => {
  const c = s.choice!;
  if (c.kind !== 'option') throw new Error(`ไม่ใช่ตัวเลือก: ${c.kind} ${c.prompt}`);
  const i = c.options.findIndex((o) => o.startsWith(prefix));
  if (i < 0) throw new Error(`ไม่มีตัวเลือก "${prefix}": ${c.options.join(' | ')}`);
  return choose(s, i);
};
/** ตอบตัวเลือกที่ค้างด้วยตัวแรก (การ์ด = prefer ถ้ามี) */
function settle(s: GameState, prefer: string[] = []): GameState {
  for (let i = 0; i < 20 && s.choice; i++) {
    const c = s.choice;
    if (c.kind === 'card') s = choose(s, c.candidates.find((x) => prefer.includes(x)) ?? c.candidates[0]!);
    else if (c.kind === 'arrange') s = choose(s, { order: c.cardIds } as never);
    else if (c.kind === 'placeCores') s = choose(s, { pay: s.players[c.player].reserve.slice(0, 1) } as never);
    else if (c.kind === 'payCost') s = pay(s);
    else s = choose(s, 0);
  }
  return s;
}
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const attack = (s: GameState, attackerId: string) => act(s, { type: 'declareAttack', player: 'p1', attackerId });
/** โจมตี แล้วเลือกให้เอฟเฟกต์ที่ตรง first ทำงานก่อน (ที่เหลือตามลำดับ) */
function attackFirst(s: GameState, attackerId: string, first: (e: { sourceId: string; source: number | null }) => boolean): GameState {
  const r = applyAction(s, { type: 'declareAttack', player: 'p1', attackerId }, db);
  if (!r.ok) throw new Error(r.error.message);
  let x = r.state;
  if (x.choice?.kind === 'order') {
    const i = x.choice.effects.findIndex(first);
    x = act(x, { type: 'choose', player: x.choice.player, pick: Math.max(0, i) });
  }
  return x;
}

describe('Booster Set 18 (แดง)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS18Cards().all();
    expect(cards.length).toBeGreaterThanOrEqual(16);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('แคนนอนบอล Trigger Counter: U Trigger ของคู่แข่งฮิต → จ่ายคอสต์ ทำลายอัลติเมท BP 20000 ขึ้นไปที่กำลังต่อสู้ ก่อนผลฮิต', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3); // Lv4 BP 20000
    put(s, 'p1', DARIU, 1);
    const blocker = put(s, 'p2', DARIU, 1);
    const ball = card(s, 'p2', no('แคนนอนบอล'), 'hand');
    top(s, 'p2', DARIU);
    s = attack(toAttack(s), nova);
    expect(s.choice?.player).toBe('p2');
    s = option(s, 'ใช้ Trigger Counter');
    expect(s.choice?.kind).toBe('payCost');
    s = pay(s);
    s = settle(s);
    expect(s.players.p1.field).not.toContain(nova);
    expect(s.players.p2.trashCards).toContain(ball);
    // ผลฮิต (บังคับป้องกัน) ไม่เกิดเพราะอัลติเมทไม่อยู่แล้ว: ไม่มีการต่อสู้ให้ป้องกัน
    expect(s.cards[blocker]!.state).toBe('refresh');
  });

  it('ไม่ใช้ Trigger Counter = ผลฮิตทำงานตามปกติ (ซีคเวิร์ม โนวา: คู่แข่งต้องป้องกัน)', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    put(s, 'p1', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    const ball = card(s, 'p2', no('แคนนอนบอล'), 'hand');
    top(s, 'p2', no('อัลติเมท ซีคเวิร์ม โนวา')); // คอสต์ 8 = ไม่ฮิต → ไม่ถาม
    s = attack(toAttack(s), nova);
    expect(s.choice?.kind === 'option' && s.choice.options.some((o) => o.startsWith('ใช้ Trigger Counter'))).toBeFalsy();
    expect(s.players.p2.hand).toContain(ball);
  });

  it('บัลด์ลิซาร์ด Trigger Counter: อัญเชิญ (จ่ายคอสต์) แล้วทำลายอัลติเมท BP ไม่เกิน 10000 ที่กำลังต่อสู้', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1); // Lv3 BP 10000 คอสต์ 7
    put(s, 'p1', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    const lizard = card(s, 'p2', no('เกราะดาวปืนใหญ่ บัลด์ลิซาร์ด'), 'hand');
    top(s, 'p2', DARIU);
    s = attack(toAttack(s), ult);
    s = option(s, 'ใช้ Trigger Counter');
    s = settle(s);
    expect(s.players.p2.field.includes(lizard) || Object.values(s.cards).some((c) => c.braves.includes(lizard))).toBe(true);
    expect(s.players.p1.field).not.toContain(ult);
  });

  it('เครื่องบินรบปเทรา: U Trigger ของเราถูก Guard → อัญเชิญจากมือโดยไม่จ่ายคอสต์', () => {
    let s = setup();
    const hinoko = put(s, 'p1', no('มังกรเพลิงชาด ฮิโนโกะ'), 2); // Lv4 คอสต์ 5
    put(s, 'p1', DARIU, 1);
    const ptera = card(s, 'p1', no('เครื่องบินรบปเทรา'), 'hand');
    top(s, 'p2', no('เซเบอร์เซเซริ')); // Guard U Trigger ของอัลติเมทคอสต์ไม่เกิน 7
    const handBefore = s.players.p1.hand.length;
    s = attack(toAttack(s), hinoko);
    s = option(s, 'อัญเชิญเครื่องบินรบปเทรา');
    s = settle(s);
    expect(s.players.p1.field).toContain(ptera);
    // ไม่ฮิต = ไม่จั่ว 2 ใบ
    expect(s.players.p1.hand.length).toBe(handBefore - 1);
  });

  it('ฮิโนโกะ: อัลติเมทคอสต์ไม่เกิน 7 ไม่สนเงื่อนไขอัญเชิญ · เจ็มอัลติเมทถือเป็นสีแดง · U Trigger ฮิต จั่ว 2', () => {
    let s = setup();
    const x = card(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 'hand');
    const nova = card(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 'hand');
    const noCond = summonConditionOk(s, db, x);
    const hinoko = put(s, 'p1', no('มังกรเพลิงชาด ฮิโนโกะ'), 2);
    if (!noCond) expect(summonConditionOk(s, db, x)).toBe(true);
    expect(summonConditionOk(s, db, nova)).toBe(false); // คอสต์ 8
    put(s, 'p1', DARIU, 1);
    top(s, 'p2', DARIU);
    const hand = s.players.p1.hand.length;
    s = settle(attack(toAttack(s), hinoko));
    expect(s.players.p1.hand.length).toBe(hand + 2);
  });

  it('ซีคเวิร์ม โนวา: U Trigger ตอนอัญเชิญ ฮิต = คอร์จากวอยด์ไปไลฟ์ต่อคอสต์ (ไลฟ์ไม่เกิน 5)', () => {
    let s = setup();
    s.players.p1.life = s.players.p1.life.slice(0, 2);
    for (let i = 0; i < 3; i++) put(s, 'p1', DARIU, 1);
    const nova = card(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 'hand');
    top(s, 'p2', no('อัลติเมท เอ็กซ์-คาลิบัส')); // คอสต์ 7 < 8 = ฮิต → +7 แต่ไลฟ์สูงสุด 5
    s.players.p1.reserve.push(...Array.from({ length: 8 }, (_, i) => {
      const id = `t18-extra-${i}`;
      s.cores[id] = { id, owner: 'p1', isSoul: false };
      return id;
    }));
    s = act(s, { type: 'summon', player: 'p1', cardId: nova, payment: s.players.p1.reserve.slice(0, 5), placement: s.players.p1.reserve.slice(5, 6) } as Action);
    s = settle(s);
    expect(s.players.p1.field).toContain(nova);
    expect(s.players.p1.life.length).toBe(5);
  });

  it('อัลโลเบลดเดอร์ [ร่วมร่าง]: ขอบเขตเอฟเฟกต์ทำลาย BP +6000 ในการต่อสู้นี้ (ทำลาย BP 10000)', () => {
    let s = setup();
    const allo = put(s, 'p1', no('อัลโลเบลดเดอร์'), 3); // Lv2
    brave(s, allo, no('เกราะดาวปืนใหญ่ บัลด์ลิซาร์ด'));
    const big = put(s, 'p2', no('อัลติเมท ซีคเวิร์ม'), 1); // อัลติเมท: ไม่ใช่เป้า
    void big;
    const target = put(s, 'p2', no('แม่ทัพมังกรเพลิง อิฟริต'), 6); // Lv3 BP 10000
    expect(currentBp(s, db, target)).toBe(10000);
    s = attackFirst(toAttack(s), allo, (e) => e.source === 1);
    s = settle(s, [target]);
    expect(s.players.p2.field).not.toContain(target);
  });

  it('ชิโซเบิร์ด [ร่วมร่าง]: เอฟเฟกต์ทำลาย BP ของผู้ร่วมร่างเลือกอัลติเมทได้ (อิฟริตทำลายอัลติเมท BP ไม่เกินตัวเอง)', () => {
    let s = setup();
    const ifrit = put(s, 'p1', no('แม่ทัพมังกรเพลิง อิฟริต'), 3); // Lv2 BP 6000 + เบรฟ 5000
    const bird = brave(s, ifrit, no('เกราะดาววิหค ชิโซเบิร์ด'));
    const ult = put(s, 'p2', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1); // BP 10000
    s = attackFirst(toAttack(s), ifrit, (e) => e.sourceId === bird);
    s = settle(s, [ult]);
    expect(s.players.p2.field).not.toContain(ult);
  });

  it('ประกายแห่งซูเปอร์โนวา: วางแล้ว อัลติเมท [สามเทพมังกร] ในมือคอสต์ = ไลฟ์ · Lv2 อัลติเมทนับเป็นสปิริตในเงื่อนไขอัญเชิญ', () => {
    let s = setup();
    const nova = card(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 'hand');
    put(s, 'p1', DARIU, 1);
    put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
    put(s, 'p1', no('มังกรเพลิงชาด ฮิโนโกะ'), 1);
    expect(summonConditionOk(s, db, nova)).toBe(false);
    const sn = put(s, 'p1', no('ประกายแห่งซูเปอร์โนวา'), 1); // Lv2
    void sn;
    expect(summonConditionOk(s, db, nova)).toBe(true);
    s.turnHandCostLife = [{ player: 'p1', turn: s.turn, filter: { types: ['ultimate'], family: 'สามเทพมังกร' } }];
    expect(baseCost(s, db, nova)).toBe(s.players.p1.life.length);
  });

  it('อิฟริต: ได้เจ็มให้ขุนพลดวงดาวต่อเมื่ออัญเชิญเบรฟ [ดาราจักร] สำเร็จ (ไม่อัญเชิญ = ไม่ได้)', () => {
    const guide = db.all().find((c) => c.type === 'brave' && c.family.includes('ดาราจักร'));
    for (const summon of [true, false]) {
      let s = setup();
      const general = put(s, 'p1', no('พลีอาดีส ร็อคดราก้อน'), 1);
      const ifrit = card(s, 'p1', no('แม่ทัพมังกรเพลิง อิฟริต'), 'hand');
      expect(guide).toBeDefined(); // เกราะดาวคนโท เบรฟอควาเรียส
      card(s, 'p1', guide!.cardNo, 'hand');
      for (let i = 0; i < 3; i++) put(s, 'p1', DARIU, 1);
      s = act(s, { type: 'summon', player: 'p1', cardId: ifrit, payment: s.players.p1.reserve.slice(0, 3), placement: s.players.p1.reserve.slice(3, 4) } as Action);
      s = option(s, summon ? 'อัญเชิญเบรฟเผ่า [ดาราจักร]' : 'ไม่ใช้');
      if (summon && s.choice?.kind === 'card') s = choose(s, s.choice.candidates[0]!);
      s = settle(s);
      expect((s.turnSymbolBuffs ?? []).length > 0).toBe(summon);
      void general;
    }
  });

  it('คริมสันแฟลร์: ทำลายสปิริตที่มีเจ็ม 2 เม็ด (เจ็ม 1 เม็ดไม่โดน)', () => {
    let s = setup();
    const one = put(s, 'p2', DARIU, 1);
    const two = put(s, 'p2', no('ริวแมน แฟนตาซิสต้า'), 1); // เจ็มแดง 2
    const flare = card(s, 'p1', no('คริมสันแฟลร์'), 'hand');
    for (let i = 0; i < 3; i++) put(s, 'p1', DARIU, 1);
    s = act(s, { type: 'useMagic', player: 'p1', cardId: flare, timing: 'flash', payment: s.players.p1.reserve.slice(0, 3) } as Action);
    s = settle(s);
    expect(s.players.p2.field).toContain(one);
    expect(s.players.p2.field).not.toContain(two);
  });
});

describe('Booster Set 18 (ขาว)', () => {
  it('แอมเบอร์ เลออน: "เบรฟที่มี Trigger Counter" = มีคีย์เวิร์ด Trigger Counter (กรอบดำ) เท่านั้น ไม่นับการ์ดที่แค่พูดถึง', () => {
    let s = setup();
    const leon = put(s, 'p2', no('แอมเบอร์ เลออน'), 1);
    const sword = brave(s, leon, no('เกราะดาวดาบ ซอร์ดฟิช')); // มี Trigger Counter
    const atk = put(s, 'p1', DARIU, 1);
    const f = { textIncludes: ['Trigger Counter'] };
    expect(matchesFilter(s, db, sword, f)).toBe(true);
    expect(matchesFilter(s, db, leon, f)).toBe(false); // ข้อความแค่พูดถึง
    expect(matchesFilter(s, db, put(s, 'p2', no('เกราะดาวโล่ ชิลด์แทงก์'), 0), f)).toBe(false);
    // ป้องกัน → นำซอร์ดฟิชกลับขึ้นมือ BP+5000
    s = settle(attack(toAttack(s), atk));
    while (s.battle?.flash) s = settle(act(s, { type: 'passFlash', player: s.battle.flash.priority }));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: leon });
    s = option(s, 'นำเบรฟที่มี Trigger Counter');
    s = settle(s);
    expect(s.players.p2.hand).toContain(sword);
  });

  it('ซิกเฟซุล [ร่วมร่าง]: ตกเป็นเป้าของเอฟเฟกต์คู่แข่งในแอทแท็คสเต็ป → ทิ้งการ์ดในมือ 1 ใบเพื่อไม่รับผล (เทิร์นละครั้ง)', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1);
    const sig = put(s, 'p2', no('ขุนพลอัศวินขาว ซิกเฟซุล'), 2); // Lv2
    brave(s, sig, no('เกราะดาวโล่ ชิลด์แทงก์'));
    const fodder = card(s, 'p2', DARIU, 'hand');
    // ชิลด์แทงก์ให้ Ultra Shield เขียว/ขาว: ใช้เมจิคสีแดง (คริมสันแฟลร์: ทำลายสปิริตที่มีเจ็ม 2 เม็ด = ซิกเฟซุล + เบรฟ)
    const flare = card(s, 'p1', no('คริมสันแฟลร์'), 'hand');
    s = attack(toAttack(s), atk);
    while (s.battle?.flash && s.battle.flash.priority !== 'p1') s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    const cost = payableCost(s, db, 'p1', db.get(no('คริมสันแฟลร์')));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: flare, timing: 'flash', payment: s.players.p1.reserve.slice(0, cost) } as Action);
    if (s.choice?.kind === 'option') s = option(s, 'ทำลายสปิริตของคู่แข่งที่มีเจ็ม 2');
    if (s.choice?.kind === 'card') s = choose(s, sig);
    expect(s.choice?.player).toBe('p2');
    s = option(s, 'ทิ้งการ์ดในมือ 1 ใบ');
    s = settle(s, [fodder]);
    expect(s.players.p2.field).toContain(sig);
    expect(s.players.p2.trashCards).toContain(fodder);
  });

  it('ซอร์ดฟิช Trigger Counter: ในเทิร์นนี้สปิริตทั้งหมดของเราไม่รับผลเอฟเฟกต์ของอัลติเมทคู่แข่ง (Critical Hit ของโนวาทำลายไม่ได้)', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    put(s, 'p1', DARIU, 1);
    const host = put(s, 'p2', no('แทงก์โมบิล เลโอพาร์ด'), 1);
    const victim = put(s, 'p2', DARIU, 1);
    card(s, 'p2', no('เกราะดาวดาบ ซอร์ดฟิช'), 'hand');
    top(s, 'p2', DARIU); // คอสต์ 1 ≤ 4 = Critical Hit
    s = attack(toAttack(s), nova);
    s = option(s, 'ใช้ Trigger Counter');
    s = settle(s);
    expect(s.players.p2.field).toContain(victim);
    void host;
  });

  it('ยูนิคอร์น (ในมือ): สปิริตสีขาวคอสต์ 5 ขึ้นไปของเราถูกทำลายโดยคู่แข่ง → อัญเชิญได้โดยไม่จ่ายคอสต์', () => {
    let s = setup();
    const kill = put(s, 'p1', no('อัลโลเบลดเดอร์'), 1); // โจมตี: ทำลาย BP ไม่เกิน 4000
    const white = put(s, 'p2', no('เกราะดาวดาบ ซอร์ดฟิช'), 1); // เบรฟเดี่ยว = สปิริต ขาว คอสต์ 4 → ไม่นับ
    void white;
    const sig = put(s, 'p2', no('ขุนพลอัศวินขาว ซิกเฟซุล'), 1); // ขาว คอสต์ 6 BP 5000
    s.cards[sig]!.turnBp = -2000; // BP 3000
    const uni = card(s, 'p2', no('เครื่องจักรอสูรเขาเดียว ยูนิคอร์น'), 'hand');
    s = attack(toAttack(s), kill);
    s = settle(s, [sig]);
    expect(s.players.p2.field).not.toContain(sig);
    expect(s.players.p2.field).toContain(uni);
  });

  it('จุดเชื่อมกาลอวกาศ A-01: เมนสเต็ป สปิริตคอสต์ไม่เกิน 2 ไม่นับในเงื่อนไขอัญเชิญของอัลติเมท', () => {
    const s = setup();
    put(s, 'p1', DARIU, 1); // คอสต์ 1
    const train = card(s, 'p1', no('จักรพรรดิเทพสายฟ้า เทรน'), 'hand');
    expect(summonConditionOk(s, db, train)).toBe(true);
    put(s, 'p2', no('จุดเชื่อมกาลอวกาศ A-01'), 0);
    expect(summonConditionOk(s, db, train)).toBe(false);
    put(s, 'p1', no('แทงก์โมบิล เลโอพาร์ด'), 1); // คอสต์ 3
    expect(summonConditionOk(s, db, train)).toBe(true);
  });

  it('โอนิกซ์ดราก้อน ไรเดอร์: อัญเชิญ → สปิริตคู่แข่ง BP ไม่เกิน 5000 ทั้งหมดกลับขึ้นมือ + คอร์จากวอยด์ต่อตัว', () => {
    let s = setup();
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    const big = put(s, 'p2', no('ขุนพลอัศวินขาว ซิกเฟซุล'), 4); // BP 8000
    const onyx = card(s, 'p1', no('โอนิกซ์ดราก้อน ไรเดอร์'), 'hand');
    s = act(s, { type: 'summon', player: 'p1', cardId: onyx, payment: s.players.p1.reserve.slice(0, 8), placement: s.players.p1.reserve.slice(8, 9) } as Action);
    s = settle(s);
    expect(s.players.p2.hand).toEqual(expect.arrayContaining([a, b]));
    expect(s.players.p2.field).toContain(big);
    expect(s.cards[onyx]!.cores.length).toBe(3);
  });

  it('แอนตี้เบรฟแบริเออร์: ในเทิร์นนี้การโจมตีของสปิริตร่วมร่างไม่ลดไลฟ์เรา (สปิริตเดี่ยวยังลด)', () => {
    let s = setup();
    const braved = put(s, 'p1', no('แทงก์โมบิล เลโอพาร์ด'), 1);
    brave(s, braved, no('เกราะดาวโล่ ชิลด์แทงก์'));
    const plain = put(s, 'p1', DARIU, 1);
    s.lifeShields = [{ player: 'p2', minCost: 0, turn: s.turn, braved: true }];
    const life = s.players.p2.life.length;
    const unblocked = (x: GameState) => {
      x = settle(x);
      while (x.battle?.flash) x = settle(act(x, { type: 'passFlash', player: x.battle.flash.priority }));
      if (x.battle) x = settle(act(x, { type: 'noBlock', player: 'p2' }));
      while (x.battle?.flash) x = settle(act(x, { type: 'passFlash', player: x.battle.flash.priority }));
      return x;
    };
    s = unblocked(attack(toAttack(s), braved));
    expect(s.players.p2.life.length).toBe(life);
    s = unblocked(attack(s, plain));
    expect(s.players.p2.life.length).toBe(life - 1);
  });
});

describe('Booster Set 18 (ม่วง)', () => {
  /** p1 โจมตีด้วยอัลโลเบลดเดอร์ (ทำลายสปิริตคู่แข่ง BP ไม่เกิน 4000 ด้วยเอฟเฟกต์) */
  const alloKills = (s: GameState, target: string) => {
    const allo = put(s, 'p1', no('อัลโลเบลดเดอร์'), 1);
    return settle(attack(toAttack(s), allo), [target]);
  };

  it('สม็อกชีพ: สปิริตของเราถูกทำลายโดยเอฟเฟกต์คู่แข่ง → ส่งคอร์บนอัลติเมทคู่แข่งไปรีเสิร์ฟ เพื่ออยู่ต่อแบบเสื่อมสภาพ', () => {
    let s = setup();
    put(s, 'p2', no('สม็อกชีพ'), 1);
    const victim = put(s, 'p2', DARIU, 1);
    const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 2);
    s = alloKills(s, victim);
    expect(s.players.p2.field).toContain(victim);
    expect(s.cards[victim]!.state).toBe('exhausted');
    expect(s.cards[ult]!.cores.length).toBe(1);
  });

  it('โบนริตเตอร์: ถูกทำลายโดยคู่แข่ง → ทิ้งใบบนสุดเด็ค ถ้าเป็นสปิริตสีม่วง = อยู่ต่อ ไม่ใช่ = ถูกทำลาย', () => {
    for (const [topNo, stays] of [
      [no('ฮอร์นไวเปอร์'), true],
      [DARIU, false],
    ] as const) {
      let s = setup();
      const bone = put(s, 'p2', no('โบนริตเตอร์'), 1);
      s.cards[bone]!.turnBp = -1000; // BP 3000 = อัลโลเบลดเดอร์ทำลายได้
      top(s, 'p2', topNo);
      s = alloKills(s, bone);
      expect(s.players.p2.field.includes(bone)).toBe(stays);
    }
  });

  it('เดวิด Lv4: ถูกทำลาย → U Trigger ฮิต = จั่ว 1 และอยู่ต่อแบบฟื้นสภาพ', () => {
    let s = setup();
    const david = put(s, 'p2', no('จักรพรรดิปีศาจ เดวิด'), 3); // Lv4 BP 10000
    s.cards[david]!.state = 'exhausted';
    top(s, 'p1', DARIU); // คอสต์ 1 < 5 = ฮิต
    const hand = s.players.p2.hand.length;
    const flare = card(s, 'p1', no('คริมสันแฟลร์'), 'hand');
    void flare;
    // ทำลายด้วยเอฟเฟกต์โดยตรง: ซีคเวิร์ม โนวาไม่มี · ใช้ชิโซเบิร์ด (ร่วมร่าง) + อิฟริต
    const ifrit = put(s, 'p1', no('แม่ทัพมังกรเพลิง อิฟริต'), 6); // Lv3 BP 10000
    const bird = brave(s, ifrit, no('เกราะดาววิหค ชิโซเบิร์ด'));
    s = settle(attackFirst(toAttack(s), ifrit, (e) => e.sourceId === bird), [david]);
    expect(s.players.p2.field).toContain(david);
    expect(s.cards[david]!.state).toBe('refresh');
    expect(s.players.p2.hand.length).toBe(hand + 1);
  });

  it('คิลเมดีส: ส่งคอร์จนสปิริตคู่แข่งสูญสลาย → เลือกนำกลับไปไว้บนสุดเด็คแทนแทรช', () => {
    let s = setup();
    const victim = put(s, 'p2', no('ฮอร์นไวเปอร์'), 1);
    const kil = card(s, 'p1', no('อัศวินนรก คิลเมดีส'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(no('อัศวินนรก คิลเมดีส')));
    s = act(s, { type: 'summon', player: 'p1', cardId: kil, payment: s.players.p1.reserve.slice(0, cost), placement: s.players.p1.reserve.slice(cost, cost + 1) } as Action);
    if (s.choice?.kind === 'card') s = choose(s, victim);
    s = option(s, 'ฮอร์นไวเปอร์ สูญสลาย: นำกลับ');
    s = settle(s);
    expect(s.players.p2.deck[0]).toBe(victim);
    expect(s.players.p2.trashCards).not.toContain(victim);
  });

  it('ลิงซ์โมเกอร์: ถูกทำลายโดยอัลติเมทคู่แข่ง = คู่แข่งทิ้งการ์ดในมือ 2 ใบ (โดยสปิริต = 1 ใบ)', () => {
    for (const [byUlt, n] of [
      [true, 2],
      [false, 1],
    ] as const) {
      let s = setup();
      const lynx = put(s, 'p2', no('ลิงซ์โมเกอร์'), 1); // BP 3000
      const a = card(s, 'p1', DARIU, 'hand');
      const b = card(s, 'p1', DARIU, 'hand');
      void a;
      void b;
      const before = s.players.p1.hand.length;
      if (byUlt) {
        const ifrit = put(s, 'p1', no('แม่ทัพมังกรเพลิง อิฟริต'), 6);
        const bird = brave(s, ifrit, no('เกราะดาววิหค ชิโซเบิร์ด'));
        void bird;
        // อัลติเมทของ p1 ทำลายด้วยการต่อสู้: เอ็กซ์-คาลิบัส (BP 10000) ถูกป้องกันโดยลิงซ์
        s.players.p1.field = s.players.p1.field.filter((x) => x !== ifrit);
        const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
        top(s, 'p2', no('อัลติเมท ซีคเวิร์ม โนวา')); // ไม่ฮิต
        s = settle(attack(toAttack(s), ult));
        while (s.battle?.flash) s = settle(act(s, { type: 'passFlash', player: s.battle.flash.priority }));
        s = settle(act(s, { type: 'declareBlock', player: 'p2', blockerId: lynx }));
        while (s.battle?.flash) s = settle(act(s, { type: 'passFlash', player: s.battle.flash.priority }));
      } else {
        s = alloKills(s, lynx);
      }
      expect(s.players.p2.field).not.toContain(lynx);
      expect(before - s.players.p1.hand.length).toBe(n);
    }
  });

  it('เบรฟพิสเกส: ส่งคอร์ทุกตัวของคู่แข่งตัวละ 1 เม็ด · จั่วตามจำนวนอัลติเมทที่สูญสลาย', () => {
    let s = setup();
    const u1 = put(s, 'p2', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
    const sp = put(s, 'p2', DARIU, 2);
    const pis = card(s, 'p1', no('เกราะดาวมีนคู่ เบรฟพิสเกส'), 'hand');
    for (let i = 0; i < 5; i++) put(s, 'p1', no('ฮอร์นไวเปอร์'), 1);
    const hand = s.players.p1.hand.length;
    const cost = payableCost(s, db, 'p1', db.get(no('เกราะดาวมีนคู่ เบรฟพิสเกส')));
    s = act(s, { type: 'summon', player: 'p1', cardId: pis, payment: s.players.p1.reserve.slice(0, cost), placement: s.players.p1.reserve.slice(cost, cost + 1) } as Action);
    s = settle(s);
    expect(s.players.p2.field).not.toContain(u1);
    expect(s.cards[sp]!.cores.length).toBe(1);
    expect(s.players.p1.hand.length).toBe(hand - 1 + 1);
  });

  it('โทรเมอา: อัญเชิญเบรฟด้วย Trigger Counter ไม่ต้องจ่ายคอสต์', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    put(s, 'p1', DARIU, 1);
    put(s, 'p2', no('เมืองแห่งความโศก โทรเมอา'), 0);
    const host = put(s, 'p2', no('ฮอร์นไวเปอร์'), 1);
    void host;
    card(s, 'p2', no('เกราะดาวมาร ฟลายบีท'), 'hand');
    top(s, 'p2', DARIU);
    const reserve = s.players.p2.reserve.length;
    s = attack(toAttack(s), nova);
    s = option(s, 'ใช้ Trigger Counter');
    expect(s.choice?.kind).not.toBe('payCost');
    s = settle(s);
    // วางคอร์อย่างมาก 1 เม็ด (ไม่ได้จ่ายคอสต์ 4) + คอร์ที่อัลติเมทเสีย 1 เม็ดไปรีเสิร์ฟคู่แข่ง (p1) ไม่ใช่ของ p2
    expect(s.players.p2.reserve.length).toBeGreaterThanOrEqual(reserve - 1);
    expect(s.cards[nova]!.cores.length).toBe(2);
  });
});

