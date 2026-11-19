import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, baseCost, blockersFor, createGame, currentBp, fieldSymbols, payableCost, type Action, type GameState, type PlayerId } from '../src';

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
function put(s: GameState, player: PlayerId, cardNo: string, cores: number, soul = false, state: 'refresh' | 'exhausted' = 'refresh'): string {
  const id = `t7-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t7-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t7-card-${++seq}`;
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
const optionIndex = (s: GameState, text: string) => (s.choice as { options: string[] }).options.findIndex((o) => o.includes(text));
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const useMagic = (s: GameState, player: PlayerId, cardId: string, timing: 'main' | 'flash' = 'flash', soul = false) => {
  const cost = payableCost(s, db, player, db.get(s.cards[cardId]!.cardNo));
  const pay = soul ? [s.players[player].reserve.find((id) => s.cores[id]!.isSoul)!, ...normalCores(s, player).slice(0, cost - 1)] : normalCores(s, player).slice(0, cost);
  return act(s, { type: 'useMagic', player, cardId, payment: pay, timing });
};
const onStageSource = (cardId: string, s: GameState) => db.get(s.cards[cardId]!.cardNo).abilities.find((a) => a.kind === 'onStage')!.source;

describe('Booster Set 07', () => {
  it('ไฟล์การ์ด: ทีม / ไทป์ / เบรฟเงื่อนไขเผ่า / ต่างอาร์ตชื่อเดียวกัน', () => {
    expect(db.get(no('คาซาเนะ')).teams).toEqual(['ไชนี่ฮาร์ท']);
    expect(db.get(no('เซ็นโงคุฮิเมะ โมนากะ')).teams).toEqual(['เฮียกกะเรียวรัน', 'พริตตี้เอนิมอลส์']);
    expect(db.get(no('จงคุกเข่า เอฟวรี่วัน')).magicTypes).toEqual(['เพลง']);
    expect(db.get(no('ชุดตุ๊กตาฟูริน')).braveCondition).toMatchObject({ family: 'ดีว่า', bp: 3000 });
    expect(db.all().filter((c) => c.name === 'ขุนพลน่ารักที่สุดรุ่นที่เจ็ด มาโกะอิจิ').map((c) => c.cardNo)).toEqual(['BS07-SP-X008', 'BS07-SP-X009']);
  });

  it('On Stage: กลับใต้เด็คแทนการโจมตี → อัญเชิญร่างสเตจสไตล์จากมือไม่จ่ายคอสต์ + จั่ว 1 ใบ แล้ว "เมื่อสปิริตเรา On Stage" ทำงาน', () => {
    let s = setup();
    const kasane = put(s, 'p1', no('คาซาเนะ'), 1);
    const rabi = put(s, 'p1', no('[หูกระต่ายจัมพ์] ราบี้-ดาริน'), 2, true); // Lv2 + Soul
    const stage = inHand(s, 'p1', no('[แมวน้อยจอมซน] คาซาเนะ'));
    const target = put(s, 'p2', DARIU, 1);
    // Main Step ใช้ไม่ได้
    expect(fails(s, { type: 'onStage', player: 'p1', cardId: kasane, source: onStageSource(kasane, s) })).toBe('WRONG_PHASE');
    s = toAttack(s);
    const hand = s.players.p1.hand.length;
    s = act(s, { type: 'onStage', player: 'p1', cardId: kasane, source: onStageSource(kasane, s) });
    expect(s.players.p1.deck.at(-1)).toBe(kasane);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [stage] });
    s = choose(s, stage);
    expect(s.choice).toMatchObject({ kind: 'placeCores' });
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.players.p1.field).toContain(stage);
    expect(s.players.p1.hand.length).toBe(hand); // ใช้ไป 1 จั่ว 1
    // ราบี้ Lv2: เมื่อสปิริตทีม ไชนี่ฮาร์ท ของเรา On Stage → นำสปิริตคู่แข่งกลับขึ้นมือ
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [target] });
    s = choose(s, target);
    expect(s.players.p2.hand).toContain(target);
    expect(s.cards[rabi]!.state).toBe('refresh');
  });

  it('On Stage: ไม่มีร่างในมือ / เสื่อมสภาพอยู่ = ใช้ไม่ได้', () => {
    let s = setup();
    const kasane = put(s, 'p1', no('คาซาเนะ'), 1);
    const tired = put(s, 'p1', no('คาซาเนะ'), 1, false, 'exhausted');
    s = toAttack(s);
    expect(fails(s, { type: 'onStage', player: 'p1', cardId: kasane, source: onStageSource(kasane, s) })).toBe('CANNOT_ON_STAGE');
    inHand(s, 'p1', no('[แมวน้อยจอมซน] คาซาเนะ'));
    expect(fails(s, { type: 'onStage', player: 'p1', cardId: tired, source: onStageSource(tired, s) })).toBe('CANNOT_ON_STAGE');
    expect(fails(s, { type: 'onStage', player: 'p1', cardId: kasane, source: onStageSource(kasane, s) })).toBe('ok');
  });

  it('รีเซ่-โดรมเวล: On Stage แล้วเสื่อมสภาพแทนกลับใต้เด็คได้ · ถูกอัญเชิญโดย On Stage = โมโมะทำลายแทนกลับขึ้นมือ', () => {
    let s = setup();
    put(s, 'p1', no('รีเซ่-โดรมเวล'), 1, true);
    const momo = put(s, 'p1', no('โมโมะ-กิวมอนเจ'), 1);
    const big = inHand(s, 'p1', no('[เจ้าหญิงเสียงผู้ร้อนแรง] โมโมะ-กิวมอนเจ'));
    const opp = put(s, 'p2', DARIU, 1);
    s = toAttack(s);
    s = act(s, { type: 'onStage', player: 'p1', cardId: momo, source: onStageSource(momo, s) });
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, optionIndex(s, 'เสื่อมสภาพแทน'));
    expect(s.players.p1.field).toContain(momo);
    expect(s.cards[momo]!.state).toBe('exhausted');
    s = choose(s, big);
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    // โมโมะ M003 ถูกอัญเชิญโดย On Stage: ทำลาย (ไม่ใช่กลับขึ้นมือ)
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [opp] });
    s = choose(s, opp);
    expect(s.players.p2.trashCards).toContain(opp);
  });

  it('Solo Part: มี Soul Core = "ชื่อ" เดียวกันของเราทั้งหมดไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง', () => {
    let s = setup();
    // p2 ใช้ไดอาน่าทำลาย: ใช้ เน็กซัส/เอฟเฟกต์ไม่ได้ง่าย → ใช้บทเพลง R001 (Flash BP-10000 ทำลายที่ BP0)
    const rabiSolo = put(s, 'p2', no('[หูกระต่ายจัมพ์] ราบี้-ดาริน'), 1, true);
    const rabiPlain = put(s, 'p2', no('[หูกระต่ายจัมพ์] ราบี้-ดาริน'), 1);
    const song = inHand(s, 'p1', no('บทเพลงวิญญาณสงครามอลวน'));
    s = useMagic(s, 'p1', song, 'flash');
    s = choose(s, rabiPlain);
    expect(s.players.p2.field).toContain(rabiPlain); // BP0 แต่ไม่ถูกทำลาย (Solo Part ของอีกใบ)
    expect(currentBp(s, db, rabiPlain)).toBe(0);
    s = choose(s, optionIndex(s, 'วางการ์ดเมจิคนี้'));
    expect(s.players.p1.songs).toEqual([song]);
    expect(s.players.p1.trashCards).not.toContain(song);
    // Soul Core หายไป = ถูกทำลายได้
    s.cores[s.cards[rabiSolo]!.cores[0]!]!.isSoul = false;
    const song2 = inHand(s, 'p1', no('บทเพลงวิญญาณสงครามอลวน'));
    s = useMagic(s, 'p1', song2, 'flash');
    s = choose(s, rabiSolo);
    expect(s.players.p2.trashCards).toContain(rabiSolo);
  });

  it('เมจิคไทป์เพลง + ทไวไลท์โกธิคสเตอ: สปิริตทีม ทไวไลท์โกธิค BP+2000 ต่อเพลงบนฟิลด์', () => {
    let s = setup();
    put(s, 'p1', no('ทไวไลท์โกธิคสเตอแห่งคนึงหายามราตรี'), 1);
    const reya = put(s, 'p1', no('เลยา-ควาโทร'), 1);
    const base = currentBp(s, db, reya);
    const m = inHand(s, 'p1', no('ปาฏิหาริย์ที่เอ่อล้น'));
    s = useMagic(s, 'p1', m, 'main');
    s = choose(s, optionIndex(s, 'วางการ์ดเมจิคนี้'));
    expect(s.players.p1.songs).toEqual([m]);
    expect(currentBp(s, db, reya)).toBe(base + 2000);
  });

  it('ปาฏิหาริย์ที่เอ่อล้น: ใช้ Soul Core จ่าย = การ์ดสปิริตเผ่าดีว่าในมือ คอสต์ -1 ในเทิร์นนี้', () => {
    let s = setup();
    const soul = `t7-core-${++seq}`;
    s.cores[soul] = { id: soul, owner: 'p1', isSoul: true };
    s.players.p1.reserve.push(soul);
    const diva = inHand(s, 'p1', no('ไชนิ่ง-กันทัน'));
    const before = payableCost(s, db, 'p1', db.get(s.cards[diva]!.cardNo));
    const m = inHand(s, 'p1', no('ปาฏิหาริย์ที่เอ่อล้น'));
    s = useMagic(s, 'p1', m, 'main', true);
    s = choose(s, optionIndex(s, 'ไม่วาง'));
    expect(s.players.p1.trashCards).toContain(m);
    // payableCost ใช้คอสต์พิมพ์ · baseCost ในมือลดแล้ว
    expect(baseCost(s, db, diva)).toBe(db.get(s.cards[diva]!.cardNo).cost - 1);
    expect(before).toBeGreaterThan(0);
  });

  it('My Unit: นำสปิริตเผ่าดีว่าที่ฟื้นสภาพมาวางชิด → อัน ฟื้นสภาพ (เทิร์นละ 1 ครั้ง)', () => {
    let s = setup();
    const an = put(s, 'p1', no('[ไอดอลดาวตก] อัน'), 1);
    const mate = put(s, 'p1', no('มู'), 1);
    s.players.p1.field = [mate, an];
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: an });
    s = choose(s, optionIndex(s, 'My Unit'));
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [mate] });
    s = choose(s, mate);
    expect(s.battle?.unit).toEqual([mate]);
    expect(s.players.p1.field).toEqual([an, mate]); // วางชิดด้านขวา
    expect(s.cards[an]!.state).toBe('refresh');
    expect(s.cards[mate]!.state).toBe('refresh');
  });

  it('อัน (Lv2 วางชิดโดย My Unit): สปิริตเราที่ต่อสู้อยู่ถูกทำลาย → อยู่บนฟิลด์ในสภาพเดิม', () => {
    let s = setup();
    const diya = put(s, 'p1', no('[เจ้าหญิงสีดำที่น่าหลงใหล] ไดยะ-รูน'), 2);
    const an = put(s, 'p1', no('อัน'), 2);
    const mu = put(s, 'p1', no('มู'), 1);
    const big = put(s, 'p2', DARIU, 5); // BP สูงกว่า
    s.cards[big]!.turnBp = 20000;
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: diya });
    s = choose(s, optionIndex(s, 'My Unit'));
    s = choose(s, an);
    s = choose(s, mu);
    // ส่งคอร์ 3 เม็ด: เลือกเป้า
    s = choose(s, big);
    while (s.choice) s = choose(s, 0);
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: big });
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.players.p1.field).toContain(diya);
    expect(s.cards[diya]!.state).toBe('exhausted');
  });

  it('แคนดี้-ซาร์ด M002: ป้องกันได้ด้วย Lv รวมตั้งแต่ 4 แล้วผู้โจมตีเลือกสู้ 1 ตัว', () => {
    let s = setup();
    const candy = put(s, 'p1', no('[เจ้าหญิงเสียงเพลงเต็มพิกัด] แคนดี้-ซาร์ด'), 3); // Lv2
    const a = put(s, 'p2', DARIU, 3); // Lv2
    const b = put(s, 'p2', DARIU, 3); // Lv2
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: candy });
    expect(s.battle?.levelBlock).toBe(4);
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(blockersFor(s, db, 'p2')).toEqual([a, b]);
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: a });
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: b });
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1', candidates: [a, b] });
    s = choose(s, b);
    expect(s.battle?.blockers).toEqual([b]);
    expect(s.cards[a]!.state).toBe('exhausted');
  });

  it('แคนดี้-ซาร์ด M002: Lv รวมของตัวที่ป้องกันได้ไม่ถึง 4 = ป้องกันไม่ได้', () => {
    let s = setup();
    const candy = put(s, 'p1', no('[เจ้าหญิงเสียงเพลงเต็มพิกัด] แคนดี้-ซาร์ด'), 3);
    put(s, 'p2', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: candy });
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(blockersFor(s, db, 'p2')).toEqual([]);
  });

  it('แจนนู-ดรานิเอส Lv3: จบแอทแท็คสเต็ป → เข้ารีเฟรชสเต็ปอีก 1 ครั้ง (เทิร์นละ 1 ครั้ง)', () => {
    let s = setup();
    const jannu = put(s, 'p1', no('แจนนู-ดรานิเอส'), 3, true);
    const other = put(s, 'p1', DARIU, 1, false, 'exhausted');
    s = toAttack(s);
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.log.some((e) => e.type === 'extraStep')).toBe(true);
    expect(s.cards[other]!.state).toBe('refresh');
    expect(s.cards[jannu]!.state).toBe('refresh');
    expect(s.turnPlayer).toBe('p2');
  });

  it('แจนนู M005: เพลง 5 ใบขึ้นไป = รีเฟรชสเต็ป + แอทแท็คสเต็ปอีกครั้ง (เกมละ 1 ครั้ง)', () => {
    let s = setup();
    const jannu = put(s, 'p1', no('[เจ้าหญิงเสียงเพลงแห่งการลงทัณฑ์] แจนนู-ดรานิเอส'), 3);
    for (let i = 0; i < 5; i++) {
      const id = inHand(s, 'p1', no('จงคุกเข่า เอฟวรี่วัน'));
      s.players.p1.hand = s.players.p1.hand.filter((x) => x !== id);
      s.players.p1.songs = [...(s.players.p1.songs ?? []), id];
    }
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: jannu });
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.phase).toBe('attack');
    expect(s.turnPlayer).toBe('p1');
    expect(s.cards[jannu]!.state).toBe('refresh');
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.turnPlayer).toBe('p2');
  });

  it('มาโกะอิจิ Lv3: เทิร์นของคู่แข่ง เมื่อคู่แข่งใช้เมจิค → ส่ง Soul Core ลงแทรช ทำให้เอฟเฟกต์ไร้ผล', () => {
    let s = setup();
    const mako = put(s, 'p2', no('ขุนพลน่ารักที่สุดรุ่นที่เจ็ด มาโกะอิจิ'), 3, true);
    const m = inHand(s, 'p1', no('ปาฏิหาริย์ที่เอ่อล้น'));
    const hand = s.players.p1.hand.length;
    s = useMagic(s, 'p1', m, 'main');
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'ส่ง Soul Core'));
    expect(s.cards[mako]!.cores.some((c) => s.cores[c]!.isSoul)).toBe(false);
    expect(s.players.p1.hand.length).toBe(hand - 1); // ไม่ได้จั่ว
    expect(s.players.p1.trashCards).toContain(m);
  });

  it('มาโกะอิจิ (ในมือ): สปิริตเผ่าดีว่าถูกทำลายโดยสปิริตคู่แข่ง → อัญเชิญไม่จ่ายคอสต์ แล้วทำลายตัวที่ทำลาย', () => {
    let s = setup();
    const attacker = put(s, 'p1', DARIU, 5);
    const diva = put(s, 'p2', no('มู'), 1);
    const mako = inHand(s, 'p2', no('ขุนพลน่ารักที่สุดรุ่นที่เจ็ด มาโกะอิจิ'));
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: attacker });
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: diva });
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'อัญเชิญ'));
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.players.p2.field).toContain(mako);
    expect(s.players.p1.trashCards).toContain(attacker);
  });

  it('เบรฟเงื่อนไขเผ่า: ชุดตุ๊กตาฟูรินร่วมร่างได้เฉพาะสปิริตเผ่าดีว่า', () => {
    let s = setup();
    const plain = put(s, 'p1', DARIU, 1);
    const diva = put(s, 'p1', no('มู'), 1);
    const furin = inHand(s, 'p1', no('ชุดตุ๊กตาฟูริน'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[furin]!.cardNo));
    expect(fails(s, { type: 'summon', player: 'p1', cardId: furin, payment: normalCores(s).slice(0, cost), placement: [], braveOnto: plain })).toBe('INVALID_HOST');
    s = act(s, { type: 'summon', player: 'p1', cardId: furin, payment: normalCores(s).slice(0, cost), placement: [], braveOnto: diva });
    expect(s.cards[diva]!.braves).toEqual([furin]);
  });

  it('ต่อจำนวน: อุไทจั่ว 1 ใบต่อสปิริตเผ่าเจ้าหญิงสงคราม 2 ตัว · ไชนิ่ง-กันทัน BP/เจ็มต่อทีมที่ต่างกัน', () => {
    let s = setup();
    const utai = put(s, 'p1', no('เซ็นโงคุฮิเมะ อุไท'), 1);
    put(s, 'p1', no('เซ็นโงคุฮิเมะ อุไท'), 1);
    put(s, 'p1', no('เซ็นโงคุฮิเมะ อุไท'), 1);
    const shining = put(s, 'p1', no('ไชนิ่ง-กันทัน'), 3, true);
    put(s, 'p1', no('คาซาเนะ'), 1);
    s = toAttack(s);
    const hand = s.players.p1.hand.length;
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: utai });
    expect(s.players.p1.hand.length).toBe(hand + 1); // 3 ตัว / 2 = 1
    s.battle = null;
    s.queue = [];
    s.choice = null;
    const bp = currentBp(s, db, shining);
    const sym = fieldSymbols(s, db, 'p1');
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: shining });
    // ทีม: เฮียกกะเรียวรัน + ไชนี่ฮาร์ท = 2 ทีม
    expect(currentBp(s, db, shining)).toBe(bp + 10000);
    expect(fieldSymbols(s, db, 'p1').yellow).toBe((sym.yellow ?? 0) + 2);
    // ไม่บอกระยะเวลา ([เมื่อสปิริตนี้โจมตี]) = มีผลจนจบการต่อสู้นั้น
    for (let i = 0; i < 2; i++) if (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.battle).toBeNull();
    expect(currentBp(s, db, shining)).toBe(bp);
    expect(fieldSymbols(s, db, 'p1').yellow ?? 0).toBe(sym.yellow ?? 0);
  });

  it('เลยา-ควาโทร Lv2: ทำลายสปิริตนี้ → อัญเชิญ "เลยา-ควาโทร" จากมือได้ไม่เกิน 3 ใบพร้อมกัน', () => {
    let s = setup();
    const reya = put(s, 'p1', no('เลยา-ควาโทร'), 2);
    const big = put(s, 'p1', DARIU, 1);
    const a = inHand(s, 'p1', no('[กุลสตรีแห่งสนธยา] เลยา-ควาโทร'));
    const b = inHand(s, 'p1', no('[กุลสตรีแห่งสนธยา] เลยา-ควาโทร'));
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: big });
    const lv2 = db.get(s.cards[reya]!.cardNo).abilities.find((x) => x.kind === 'activated' && x.levels.includes(2))!.source;
    s = act(s, { type: 'passFlash', player: 'p2' });
    s = act(s, { type: 'activate', player: 'p1', cardId: reya, source: lv2 });
    expect(s.choice).toMatchObject({ kind: 'multiSummon', max: 3, candidates: [a, b] });
    const cores = normalCores(s);
    s = choose(s, { summons: [{ cardId: a, cores: [cores[0]!] }, { cardId: b, cores: [cores[1]!] }] });
    expect(s.players.p1.field).toEqual(expect.arrayContaining([a, b]));
    expect(s.players.p1.trashCards).toContain(reya);
  });

  it('แอปโซลูทสเตอ: ที่เหลือนำกลับบนสุดเด็คโดยเรียงลำดับได้', () => {
    let s = setup();
    const top = [inHand(s, 'p1', no('มู')), inHand(s, 'p1', no('อัน'))];
    s.players.p1.hand = s.players.p1.hand.filter((x) => !top.includes(x));
    s.players.p1.deck.unshift(...top);
    s.queue.push({ controller: 'p1', sourceId: top[0]!, steps: [{ do: 'revealPickRestTrash', count: 2, filter: { team: 'แอปโซลูท' }, rest: 'top' }], paidWithSoul: false, trashWhenDone: false });
    s = act(s, { type: 'moveCores', player: 'p1', moves: [] });
    expect(s.choice).toMatchObject({ kind: 'arrange', where: 'top', cardIds: top });
    s = choose(s, { order: [top[1]!, top[0]!] }); // 1 = บนสุด
    expect(s.players.p1.deck.slice(0, 2)).toEqual([top[1], top[0]]);
  });

  it('ชุดตุ๊กตาฟูริน [ร่วมร่าง]: สปิริตนี้ถูกทำลายโดยคู่แข่ง → นำเมจิคในแทรชขึ้นมือ', () => {
    let s = setup();
    const diva = put(s, 'p2', no('มู'), 1);
    const furin = inHand(s, 'p2', no('ชุดตุ๊กตาฟูริน'));
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== furin);
    s.cards[diva]!.braves.push(furin);
    const magic = inHand(s, 'p2', no('จงคุกเข่า เอฟวรี่วัน'));
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== magic);
    s.players.p2.trashCards.push(magic);
    const song = inHand(s, 'p1', no('บทเพลงวิญญาณสงครามอลวน'));
    s = useMagic(s, 'p1', song, 'flash');
    s = choose(s, diva);
    s = choose(s, optionIndex(s, 'ไม่วาง'));
    // เลือกเมจิคในแทรชขึ้นมือ
    s = choose(s, magic);
    expect(s.players.p2.hand).toContain(magic);
  });

  it('ปิ่นปักผม: ในมือ เมื่อสปิริตเรา On Stage → อัญเชิญไม่จ่ายคอสต์ · [ร่วมร่าง] สปิริตนี้ + ทีมเดียวกัน BP+3000', () => {
    let s = setup();
    const kasane = put(s, 'p1', no('คาซาเนะ'), 1);
    const mate = put(s, 'p1', no('ซีคฟรีด้า'), 1); // ไชนี่ฮาร์ท
    const other = put(s, 'p1', no('มู'), 1); // พริตตี้เอนิมอลส์
    const stage = inHand(s, 'p1', no('[แมวน้อยจอมซน] คาซาเนะ'));
    const pin = inHand(s, 'p1', no('ปิ่นปักผมแห่งบุปผาดารา'));
    const bpMate = currentBp(s, db, mate);
    const bpOther = currentBp(s, db, other);
    s = toAttack(s);
    s = act(s, { type: 'onStage', player: 'p1', cardId: kasane, source: onStageSource(kasane, s) });
    s = choose(s, stage);
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, optionIndex(s, 'อัญเชิญเบรฟนี้'));
    // ร่วมร่างกับ [แมวน้อยจอมซน] คาซาเนะ (คอสต์ 5)
    expect(s.choice).toMatchObject({ kind: 'card' });
    s = choose(s, stage);
    expect(s.cards[stage]!.braves).toEqual([pin]);
    expect(currentBp(s, db, mate)).toBe(bpMate + 3000);
    expect(currentBp(s, db, other)).toBe(bpOther);
  });

  it('เรย์-โอบะ X001: อัญเชิญโดย On Stage → รวมร่างกับเบรฟบนฟิลด์ได้ 2 ใบ · โจมตีแล้วส่งสปิริตคู่แข่งใต้เด็คต่อเบรฟ 1 ใบ', () => {
    let s = setup();
    const rei = put(s, 'p1', no('เรย์-โอบะ'), 1);
    const x = inHand(s, 'p1', no('[นางฟ้าจรัสแสง] เรย์-โอบะ'));
    const b1 = put(s, 'p1', no('เซ็นโงคุโทรฟี่'), 1);
    const b2 = put(s, 'p1', no('พัดแห่งบุปผาศึกซากุระ'), 1);
    const o1 = put(s, 'p2', DARIU, 1);
    const o2 = put(s, 'p2', DARIU, 1);
    s = toAttack(s);
    s = act(s, { type: 'onStage', player: 'p1', cardId: rei, source: onStageSource(rei, s) });
    s = choose(s, x);
    s = choose(s, { pay: normalCores(s).slice(0, 3) });
    s = choose(s, b1);
    s = choose(s, b2);
    expect(s.cards[x]!.braves).toEqual([b1, b2]);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: x });
    while (s.choice && s.choice.kind === 'option') s = choose(s, s.choice.options.length - 1);
    // เบรฟ 2 ใบ = 2 ตัว เลือกทีเดียว
    expect(s.choice).toMatchObject({ kind: 'multiCard', count: 2 });
    s = choose(s, { cards: [o1, o2] });
    expect(s.players.p2.deck.slice(-2)).toEqual([o1, o2]);
  });

  it('เซ็นโงคุฮิเมะ มาคินะ (Soul Burst): หลังเอฟเฟกต์อัญเชิญของคู่แข่ง → การ์ดนั้นกลับใต้สุดเด็ค แล้วอัญเชิญมาคินะ', () => {
    let s = setup();
    const makina = inHand(s, 'p2', no('เซ็นโงคุฮิเมะ มาคินะ'));
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== makina);
    s.players.p2.burst = makina;
    const shining = inHand(s, 'p1', no('ไชนิ่ง-กันทัน'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[shining]!.cardNo));
    s = act(s, { type: 'summon', player: 'p1', cardId: shining, payment: normalCores(s).slice(0, cost), placement: normalCores(s).slice(cost, cost + 1) });
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    expect(s.players.p1.deck.at(-1)).toBe(shining);
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.players.p2.field).toContain(makina);
  });

  it('เซ็นโงคุฮิเมะ ยูสึกิ: เบิร์สที่เซ็ทอยู่ถูกคู่แข่งทิ้ง → สั่งใช้ได้โดยไม่สนเงื่อนไข', () => {
    let s = setup();
    const yuzuki = inHand(s, 'p2', no('เซ็นโงคุฮิเมะ ยูสึกิ'));
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== yuzuki);
    s.players.p2.burst = yuzuki;
    const target = put(s, 'p1', DARIU, 1);
    // ทิ้งเบิร์สด้วยเอฟเฟกต์ของ p1 (สร้างคิวตรง ๆ)
    s.queue.push({ controller: 'p1', sourceId: target, steps: [{ do: 'discardOpponentBurst' }], paidWithSoul: false, trashWhenDone: false });
    s = act(s, { type: 'moveCores', player: 'p1', moves: [] });
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'สั่งใช้ Burst'));
    s = choose(s, target);
    expect(currentBp(s, db, target)).toBe(0);
    expect(s.cards[target]!.state).toBe('exhausted');
  });
});
