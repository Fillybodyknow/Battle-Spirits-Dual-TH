import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, blockersFor, canAttackWith, cardLevel, createGame, currentBp, effectsNegated, payableCost, summonLevelCostBoost, summonMinCores, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `t5-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t5-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t5-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].hand.push(id);
  return id;
}
function inTrash(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t5-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].trashCards.push(id);
  return id;
}
function brave(s: GameState, host: string, name: string): string {
  const owner = s.cards[host]!.owner;
  const id = inHand(s, owner, no(name));
  s.players[owner].hand = s.players[owner].hand.filter((x) => x !== id);
  s.cards[host]!.braves.push(id);
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
const passFlashes = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });

describe('Booster Set 05', () => {
  it('อาเมะโอชิโนะมิโคโตะ (มี Soul Core): สปิริตคู่แข่งคอสต์ 0/2/4/7 Lv คอสต์ +3', () => {
    const s = setup();
    put(s, 'p1', no('ราชาวิญญาณเทพ อาเมะโอชิโนะมิโคโตะ'), 1, true);
    const dariu = put(s, 'p2', DARIU, 3); // คอสต์ 1: ไม่โดน
    const yakshi = put(s, 'p2', no('ยักษ์วิญญาณ'), 3); // คอสต์ 0: 3 Core - 3 = Lv0 (ต้องการ 1)
    expect(cardLevel(s, db, dariu)).toBe(2);
    expect(cardLevel(s, db, yakshi)).toBe(0);
  });

  it('อาเมะโอชิโนะมิโคโตะ: อัญเชิญการ์ดที่โดน Lv คอสต์ +3 ต้องวาง Core ให้ถึง Lv1 จริง (วางไม่พอ = อัญเชิญไม่ได้)', () => {
    let s = setup();
    put(s, 'p2', no('ราชาวิญญาณเทพ อาเมะโอชิโนะมิโคโตะ'), 1, true);
    const yakshi = inHand(s, 'p1', no('ยักษ์วิญญาณ')); // คอสต์ 0: โดน
    const dariu = inHand(s, 'p1', DARIU); // คอสต์ 1: ไม่โดน
    expect(summonLevelCostBoost(s, db, yakshi)).toBe(3);
    expect(summonMinCores(s, db, yakshi)).toBe(4);
    expect(summonMinCores(s, db, dariu)).toBe(1);
    // วาง 1 ดวงตามที่พิมพ์บนการ์ด = ไม่ยอมให้อัญเชิญ (การ์ดยังอยู่ในมือ)
    expect(fails(s, { type: 'summon', player: 'p1', cardId: yakshi, payment: [], placement: normalCores(s).slice(0, 3) })).toBe('NOT_ENOUGH_CORES');
    expect(s.players.p1.hand).toContain(yakshi);
    // วาง 4 ดวง = Lv1
    s = act(s, { type: 'summon', player: 'p1', cardId: yakshi, payment: [], placement: normalCores(s).slice(0, 4) });
    expect(cardLevel(s, db, yakshi)).toBe(1);
  });

  it('อาเมะโอชิโนะมิโคโตะ Lv2 โจมตี: นำการ์ดม่วงในแทรชขึ้นมือ · ถ้าเป็นข้ารับใช้ คู่แข่งเลือกทำลายสปิริตตนเอง', () => {
    let s = setup();
    const ame = put(s, 'p1', no('ราชาวิญญาณเทพ อาเมะโอชิโนะมิโคโตะ'), 2);
    const servant = inTrash(s, 'p1', no('หมูป่าควันม่วง')); // ข้ารับใช้
    const victim = put(s, 'p2', DARIU, 1);
    s = attack(s, ame);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    s = choose(s, servant);
    expect(s.players.p1.hand).toContain(servant);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p2' });
    s = choose(s, victim);
    expect(s.players.p2.trashCards).toContain(victim);
  });

  it('คาฉะเนโกะ-อิคุสะ: การ์ดสปิริตข้ารับใช้/โยวไคในมือใช้เป็นเมจิค [Flash] ได้ → สปิริตคู่แข่งป้องกันไม่ได้ · Lv2 + Soul Core อัญเชิญการ์ดนั้นไม่จ่ายคอสต์', () => {
    let s = setup();
    put(s, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 3, true); // Lv2
    const atk = put(s, 'p1', DARIU, 1);
    const blocker = put(s, 'p2', DARIU, 1);
    const yuki = inHand(s, 'p1', no('ยูคิเกิร์ล')); // ข้ารับใช้/โยวไค
    s = attack(s, atk);
    // ฝ่ายป้องกันได้สิทธิ์ก่อน: ผ่าน
    s = act(s, { type: 'passFlash', player: 'p2' });
    const cost = payableCost(s, db, 'p1', db.get(no('ยูคิเกิร์ล')));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: yuki, payment: normalCores(s).slice(0, cost), timing: 'flash' });
    // มี 2 ความสามารถ (Flash ของตัวเอง + ที่ได้รับ): เลือกได้อย่างเดียว (กติกา 03 ข้อ 5) → เลือกอันที่ได้รับ
    expect(s.choice).toMatchObject({ kind: 'option' });
    expect((s.choice as { options: string[] }).options).toHaveLength(2);
    s = choose(s, 1);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [blocker] });
    s = choose(s, blocker);
    // Lv2: อัญเชิญการ์ดสปิริตที่ใช้เป็นเมจิคไม่จ่ายคอสต์
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, 0);
    expect(s.choice?.kind).toBe('placeCores');
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.players.p1.field).toContain(yuki);
    expect(blockersFor(s, db, 'p2')).not.toContain(blocker);
  });

  it('ยูคิเกิร์ล ใช้เป็นเมจิค: ไลฟ์เราไม่เกิน 2 → จบแอทแท็คสเต็ปเมื่อจบการต่อสู้', () => {
    let s = setup();
    s.players.p2.life = s.players.p2.life.slice(0, 2);
    s.turnPlayer = 'p1';
    const atk = put(s, 'p1', DARIU, 1);
    const yuki = inHand(s, 'p2', no('ยูคิเกิร์ล'));
    s = attack(s, atk);
    const cost = payableCost(s, db, 'p2', db.get(no('ยูคิเกิร์ล')));
    s = act(s, { type: 'useMagic', player: 'p2', cardId: yuki, payment: normalCores(s, 'p2').slice(0, cost), timing: 'flash' });
    expect(s.players.p2.trashCards).toContain(yuki);
    s = passFlashes(s);
    s = act(s, { type: 'noBlock', player: 'p2' });
    // ตีเข้าไลฟ์ 1 ดวง เหลือ 1 → จบการต่อสู้แล้วจบแอทแท็คสเต็ป (เทิร์นเปลี่ยน)
    expect(s.turnPlayer).toBe('p2');
  });

  it('รินเนะ Lv2 + Soul Core: ข้ารับใช้ของเราโจมตี → ตัวที่ฟื้นสภาพป้องกันไม่ได้ ตัวที่เสื่อมสภาพป้องกันได้และฟื้นสภาพ', () => {
    let s = setup();
    const rinne = put(s, 'p1', no('มิโกะเบื้องหลัง รินเนะ'), 2, true); // ข้ารับใช้
    const fresh = put(s, 'p2', DARIU, 1);
    const tired = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s = attack(s, rinne);
    // เมื่อโจมตี: ส่งคอร์บนสปิริตคู่แข่ง 2 เม็ด (ทีละเม็ด)
    while (s.choice?.kind === 'card') s = choose(s, s.choice.candidates[0]!);
    s = passFlashes(s);
    const can = blockersFor(s, db, 'p2');
    expect(can).not.toContain(fresh);
    if (s.players.p2.field.includes(tired)) {
      expect(can).toContain(tired);
      s = act(s, { type: 'declareBlock', player: 'p2', blockerId: tired });
      expect(s.cards[tired]!.state).toBe('refresh');
    }
  });

  it('ฮิเมะเนโกะ: คู่แข่งต้องส่งคอร์รีเสิร์ฟ 2 เม็ดลงแทรชเพื่อป้องกัน (ไม่พอ = ป้องกันไม่ได้)', () => {
    let s = setup();
    const host = put(s, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 1); // คอสต์ 5
    brave(s, host, 'ฮิเมะเนโกะ');
    const blocker = put(s, 'p2', DARIU, 1);
    s = passFlashes(attack(s, host));
    const before = s.players.p2.reserve.length;
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    expect(s.players.p2.reserve.length).toBe(before - 2);

    let t = setup();
    const host2 = put(t, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 1);
    brave(t, host2, 'ฮิเมะเนโกะ');
    put(t, 'p2', DARIU, 1);
    t.players.p2.reserve = t.players.p2.reserve.slice(0, 1);
    t = passFlashes(attack(t, host2));
    expect(blockersFor(t, db, 'p2')).toEqual([]);
  });

  it('ทไวไลท์-แฟนตาเซีย: ไม่ถูกป้องกัน → คอร์วอยด์วางไลฟ์เรา', () => {
    let s = setup();
    const host = put(s, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 1);
    brave(s, host, 'ดาบสวรรค์แห่งจินตนาการ ทไวไลท์-แฟนตาเซีย');
    put(s, 'p2', DARIU, 1);
    const life = s.players.p1.life.length;
    s = passFlashes(attack(s, host));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p1.life.length).toBe(life + 1);
  });

  it('องเมียววาราชิ: มี Soul Core โจมตีไม่ได้ · เมนสเต็ป: คอร์วอยด์จากเอฟเฟกต์มาจากไลฟ์ของเจ้าของเอฟเฟกต์', () => {
    let s = setup();
    const om = put(s, 'p2', no('องเมียววาราชิ'), 1, true);
    s.turnPlayer = 'p2';
    expect(canAttackWith(s, db, om)).toBe(false);
    s.turnPlayer = 'p1';
    // ฮานุรุกามะ: เมื่ออัญเชิญ นำคอร์วอยด์ 1 เม็ดไปรีเสิร์ฟ → มาจากไลฟ์เราแทน
    const hanu = inHand(s, 'p1', no('ฮานุรุกามะ'));
    const cost = payableCost(s, db, 'p1', db.get(no('ฮานุรุกามะ')));
    const life = s.players.p1.life.length;
    const normal = normalCores(s);
    s = act(s, { type: 'summon', player: 'p1', cardId: hanu, payment: normal.slice(0, cost), placement: normal.slice(cost, cost + 1) });
    expect(s.players.p1.life.length).toBe(life - 1);
    expect(s.pendingBursts).toEqual([]);
  });

  it('พยัคฆ์ควันม่วง: ถูกทิ้งจากเด็คโดยเอฟเฟกต์ทิ้งเด็ค → อัญเชิญไม่จ่ายคอสต์ได้', () => {
    let s = setup();
    const tiger = `t5-card-${++seq}`;
    s.cards[tiger] = { id: tiger, cardNo: no('พยัคฆ์ควันม่วง'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p2.deck.unshift(tiger);
    // เซ็นโกคุ-มิทสึคุริ ฯลฯ: ใช้สเต็ป mill ผ่านเอฟเฟกต์ทดสอบโดยตรง
    s.queue.push({ controller: 'p1', sourceId: put(s, 'p1', DARIU, 1), steps: [{ do: 'mill', count: 1 }], paidWithSoul: false, trashWhenDone: false });
    s = act(s, { type: 'moveCores', player: 'p1', moves: [] });
    expect(s.players.p2.trashCards).toContain(tiger);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, 0);
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.players.p2.field).toContain(tiger);
  });

  it('ยาคุโมะ อัญเชิญด้วย Soul Core: อัญเชิญการ์ดสปิริตในแทรชไม่จ่ายคอสต์ คอสต์รวมไม่เกิน 6', () => {
    let s = setup();
    const a = inTrash(s, 'p1', no('ชิคิงามิ ชูวไค')); // คอสต์ในแทรช 2
    const b = inTrash(s, 'p1', no('ราชาวิญญาณเทพ อาเมะโอชิโนะมิโคโตะ')); // คอสต์ในแทรช 4
    const c = inTrash(s, 'p1', no('ชิคิงามิ การัน')); // คอสต์ 5
    const yaku = inHand(s, 'p1', no('โยวจุทสึชิ ยาคุโมะ'));
    const cost = payableCost(s, db, 'p1', db.get(no('โยวจุทสึชิ ยาคุโมะ')));
    const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
    const normal = normalCores(s);
    s = act(s, { type: 'summon', player: 'p1', cardId: yaku, payment: [soul, ...normal.slice(0, cost - 1)], placement: normal.slice(cost - 1, cost) });
    s = choose(s, 0); // ใช้
    expect(s.choice).toMatchObject({ kind: 'card', candidates: expect.arrayContaining([a, b, c]) });
    s = choose(s, b);
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    // เหลืองบ 2: เลือกได้แค่ ชูวไค
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [a] });
    s = choose(s, a);
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.players.p1.field).toEqual(expect.arrayContaining([a, b]));
    expect(s.players.p1.trashCards).toContain(c);
  });

  it('แองเจลิคฟีเธอร์ (Charge): เอฟเฟกต์ BP- ของเรา -1000 เพิ่ม · ทำให้ BP0 ตัวแรกของเทิร์น = ผู้ร่วมร่างฟื้นสภาพ', () => {
    let s = setup();
    const host = put(s, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 1);
    brave(s, host, 'ดาบเทพแห่งปีกแสง แองเจลิคฟีเธอร์');
    const target = put(s, 'p2', DARIU, 3); // BP 6000
    const small = put(s, 'p2', DARIU, 1); // BP 3000
    s = attack(s, host);
    expect(s.choice).toMatchObject({ kind: 'card' });
    s = choose(s, small); // 3000 + 1000 → BP0 (ไม่ได้สั่งทำลาย: ยังอยู่บนสนาม)
    expect(currentBp(s, db, small)).toBe(0);
    expect(s.players.p2.field).toContain(small);
    expect(s.cards[host]!.state).toBe('refresh');
    expect(currentBp(s, db, target)).toBe(6000);
  });

  it('ไลท์นิ่ง-ชิออน (Charge): เอฟเฟกต์ถอดคอร์ลงรีเสิร์ฟของเรา ถอดเพิ่ม 1 เม็ด', () => {
    let s = setup();
    const host = put(s, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 1);
    brave(s, host, 'ดาบวิญญาณประกายม่วง ไลท์นิ่ง-ชิออน');
    const target = put(s, 'p2', DARIU, 5);
    const shimon = inHand(s, 'p1', no('ผู้ใช้ศาสตร์มายา ชิมอน')); // เมื่ออัญเชิญ: ส่งคอร์ 2 เม็ดบนสปิริตคู่แข่ง 1 ตัว
    const cost = payableCost(s, db, 'p1', db.get(no('ผู้ใช้ศาสตร์มายา ชิมอน')));
    const normal = normalCores(s);
    s = act(s, { type: 'summon', player: 'p1', cardId: shimon, payment: normal.slice(0, cost), placement: normal.slice(cost, cost + 1) });
    s = choose(s, target);
    expect(s.cards[target]!.cores).toHaveLength(2);
  });

  it('คุอง (Soul Burst): หลังคู่แข่งโจมตี → คอร์วอยด์วางไลฟ์ แล้วอัญเชิญการ์ดนี้ไม่จ่ายคอสต์', () => {
    let s = setup();
    const kuon = inHand(s, 'p2', no('เซ็นโงคุฮิเมะ คุอง'));
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== kuon);
    s.players.p2.burst = kuon;
    const atk = put(s, 'p1', DARIU, 1);
    const life = s.players.p2.life.length;
    s = attack(s, atk);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, 0); // เปิด Burst
    expect(s.players.p2.life.length).toBe(life + 1);
    expect(s.choice?.kind).toBe('placeCores');
  });

  describe('คุองอัญเชิญตัวเองตอนคู่แข่งมีอาเมะโอชิโนะมิโคโตะ (คอสต์ 7 = Lv คอสต์ +3 → Lv1 ต้องวาง 4)', () => {
    const burstWithReserve = (n: number) => {
      let s = setup();
      put(s, 'p1', no('ราชาวิญญาณเทพ อาเมะโอชิโนะมิโคโตะ'), 1, true);
      const kuon = inHand(s, 'p2', no('เซ็นโงคุฮิเมะ คุอง'));
      s.players.p2.hand = s.players.p2.hand.filter((id) => id !== kuon);
      s.players.p2.burst = kuon;
      s.players.p2.reserve = s.players.p2.reserve.slice(0, n);
      const atk = put(s, 'p1', DARIU, 1);
      s = attack(s, atk);
      s = choose(s, 0); // เปิด Burst
      return { s, kuon };
    };

    it('Core ที่ใช้ได้ 3 ดวง (ไม่ถึง 4): อัญเชิญไม่ได้ การ์ดลงแทรช ไม่สูญสลาย', () => {
      const { s, kuon } = burstWithReserve(3);
      expect(s.choice?.kind).not.toBe('placeCores');
      expect(s.players.p2.field).not.toContain(kuon);
      expect(s.players.p2.trashCards).toContain(kuon);
      expect(s.log.some((e) => (e.type === 'summoned' || e.type === 'depleted') && e.cardId === kuon)).toBe(false);
      expect(s.players.p2.reserve).toHaveLength(3); // ไม่เสีย Core
    });

    it('Core ที่ใช้ได้ 4 ดวง: ให้วาง Core โดยขั้นต่ำ 4', () => {
      const { s } = burstWithReserve(4);
      expect(s.choice).toMatchObject({ kind: 'placeCores', min: 4 });
    });
  });

  it('ดาร์คอินิทิเอชัน: ทำลายสปิริตเรากี่ตัวก็ได้ → นำการ์ดสปิริตในแทรชขึ้นมือตามจำนวน', () => {
    let s = setup();
    const a = put(s, 'p1', DARIU, 1);
    const b = put(s, 'p1', DARIU, 1);
    const card = inHand(s, 'p1', no('ดาร์คอินิทิเอชัน'));
    const cost = payableCost(s, db, 'p1', db.get(no('ดาร์คอินิทิเอชัน')));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: card, payment: normalCores(s).slice(0, cost), timing: 'main' });
    s = choose(s, a);
    s = choose(s, b); // ไม่มีสปิริตเหลือให้ทำลาย → เลือกการ์ดขึ้นมือ 2 ครั้ง
    s = choose(s, s.choice?.kind === 'card' ? s.choice.candidates[0]! : null);
    s = choose(s, s.choice?.kind === 'card' ? s.choice.candidates[0]! : null);
    expect(s.players.p1.hand).toEqual(expect.arrayContaining([a, b]));
  });

  it('No.32 ไอส์แลนด์รูท: เมื่อเน็กซัสนี้ถูกวาง จั่วการ์ด 1 ใบ', () => {
    let s = setup();
    const nx = inHand(s, 'p1', no('No.32 ไอส์แลนด์รูท'));
    const cost = payableCost(s, db, 'p1', db.get(no('No.32 ไอส์แลนด์รูท')));
    const hand = s.players.p1.hand.length;
    s = act(s, { type: 'deployNexus', player: 'p1', cardId: nx, payment: normalCores(s).slice(0, cost), placement: [] });
    expect(s.players.p1.hand.length).toBe(hand); // วางไป 1 จั่วมา 1
  });

  it('ทิพบอล Lv2: เริ่มแอทแท็คสเต็ปคู่แข่ง ย้าย Soul Core → ในเทิร์นนี้การ์ดที่มีเจ็มตั้งแต่ 2 เม็ดถือว่าไม่มีเจ็ม', () => {
    let s = setup();
    put(s, 'p2', no('No.11 ทิพบอล'), 1, true); // Lv2 ใช้ Core 1
    const ally = put(s, 'p2', DARIU, 1);
    const host = put(s, 'p1', no('แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ'), 1);
    brave(s, host, 'ฮิเมะเนโกะ'); // เจ็ม 2 เม็ด
    s = act(s, { type: 'endMain', player: 'p1' });
    s = choose(s, 0);
    s = choose(s, ally);
    const life = s.players.p2.life.length;
    s = passFlashes(act(s, { type: 'declareAttack', player: 'p1', attackerId: host }));
    if (s.battle?.step === 'declareBlock') s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life.length).toBe(life);
  });

  it('ดาบชีพอัสนี มิคาซึกิ (Soul Burst): สปิริตคู่แข่งทั้งหมดสูญเสียเอฟเฟกต์ในเทิร์นนี้', () => {
    let s = setup();
    const mika = inHand(s, 'p2', no('ดาบชีพอัสนี มิคาซึกิ'));
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== mika);
    s.players.p2.burst = mika;
    const om = put(s, 'p1', no('องเมียววาราชิ'), 1, true);
    const victim = put(s, 'p2', DARIU, 1);
    // p1 ทำลายสปิริตของ p2 ด้วยเอฟเฟกต์
    s.queue.push({ controller: 'p1', sourceId: om, steps: [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false });
    s = act(s, { type: 'moveCores', player: 'p1', moves: [] });
    s = choose(s, victim);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, 0); // เปิด
    expect(s.effectsLost).toEqual([{ player: 'p1', turn: s.turn }]);
    // องเมียววาราชิเสียเอฟเฟกต์: โจมตีได้แล้ว (เอฟเฟกต์ "โจมตีไม่ได้" หายไป)
    expect(effectsNegated(s, db, om)).toBe(true);
    expect(canAttackWith(s, db, om)).toBe(true);
    // หลังเอฟเฟกต์: อัญเชิญมิคาซึกิไม่จ่ายคอสต์
    expect(s.choice?.kind).toBe('placeCores');
  });

  it('ประตูปราสาทแห่งแคว้นบุปผาเหลือง Lv2: เทิร์นคู่แข่ง สปิริตแดงที่ฟื้นสภาพโดยเอฟเฟกต์เมจิคถูกทำลาย · Lv1 ไม่มีผล', () => {
    const run = (gateCores: number) => {
      let s = setup();
      put(s, 'p2', no('ประตูปราสาทแห่งแคว้นบุปผาเหลือง'), gateCores);
      const red = put(s, 'p1', DARIU, 1, false, 'exhausted');
      const soul = 't5-soul';
      s.cores[soul] = { id: soul, owner: 'p1', isSoul: true };
      s.players.p1.reserve.push(soul);
      const magic = inHand(s, 'p1', no('ไทม์รีวินด์'));
      const cost = payableCost(s, db, 'p1', db.get(no('ไทม์รีวินด์')));
      s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: [soul, ...normalCores(s).slice(0, cost - 1)], timing: 'flash' });
      if (s.choice?.kind === 'card') s = choose(s, red);
      return { s, red };
    };
    const lv2 = run(2);
    expect(lv2.s.players.p1.field).not.toContain(lv2.red);
    expect(lv2.s.players.p1.trashCards).toContain(lv2.red);
    const lv1 = run(0);
    expect(lv1.s.players.p1.field).toContain(lv1.red);
    expect(lv1.s.cards[lv1.red]!.state).toBe('refresh');
  });

  it('ฮิเมะสึรุอิจิมอนจิ: ไม่ถูกนับในจำนวนเบรฟของชิซุรุ → ชิซุรุมีเบรฟอื่น + ฮิเมะสึรุได้ · สปิริตอื่นมีได้ 1 ใบตามปกติ', () => {
    const SHIZURU = no('เจ้าหญิงดาบศักดิ์สิทธิ์ ชิซุรุ');
    const other = db.all().find((c) => c.type === 'spirit' && c.cost >= 5 && c.name !== 'เจ้าหญิงดาบศักดิ์สิทธิ์ ชิซุรุ')!.cardNo;
    let s = setup();
    const shizuru = put(s, 'p1', SHIZURU, 3);
    brave(s, shizuru, 'ดาบภูต มุราซาเมะ');
    const plain = put(s, 'p1', other, 3);
    brave(s, plain, 'ดาบภูต มุราซาเมะ');
    const hime = put(s, 'p1', no('ฮิเมะสึรุอิจิมอนจิ'), 1);
    expect(fails(s, { type: 'brave', player: 'p1', braveId: hime, hostId: plain })).not.toBe('ok');
    const bpBefore = currentBp(s, db, shizuru);
    s = act(s, { type: 'brave', player: 'p1', braveId: hime, hostId: shizuru });
    expect(s.cards[shizuru]!.braves).toHaveLength(2);
    expect(currentBp(s, db, shizuru)).toBe(bpBefore + 3000);
    // ชิซุรุที่มีแค่ฮิเมะสึรุ: รับเบรฟอื่นเพิ่มได้อีก 1 ใบ
    let t = setup();
    const sz = put(t, 'p1', SHIZURU, 3);
    brave(t, sz, 'ฮิเมะสึรุอิจิมอนจิ');
    const mura = put(t, 'p1', no('ดาบภูต มุราซาเมะ'), 1);
    t = act(t, { type: 'brave', player: 'p1', braveId: mura, hostId: sz });
    expect(t.cards[sz]!.braves).toHaveLength(2);
  });

  it('ชาร์ล: ใช้เมจิคจากในมือ → ถามวางแสดงนอกมือ · ใช้เมจิคจากนอกมือ → ไม่ทำงาน', () => {
    let s = setup();
    put(s, 'p1', no('เซ็นโงคุฮิเมะ ชาร์ล'), 1);
    const atk = put(s, 'p1', DARIU, 1);
    const magic = inHand(s, 'p1', no('ไทม์รีวินด์'));
    s.shownCards = [magic];
    s = attack(s, atk);
    s = act(s, { type: 'passFlash', player: 'p2' });
    const cost = payableCost(s, db, 'p1', db.get(no('ไทม์รีวินด์')));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
    expect(s.choice).toBeFalsy();
    expect(s.players.p1.trashCards).toContain(magic);
    // จากในมือ: ถาม
    let t = setup();
    put(t, 'p1', no('เซ็นโงคุฮิเมะ ชาร์ล'), 1);
    const atk2 = put(t, 'p1', DARIU, 1);
    const m2 = inHand(t, 'p1', no('ไทม์รีวินด์'));
    t = attack(t, atk2);
    t = act(t, { type: 'passFlash', player: 'p2' });
    t = act(t, { type: 'useMagic', player: 'p1', cardId: m2, payment: normalCores(t).slice(0, cost), timing: 'flash' });
    expect(t.choice).toMatchObject({ kind: 'option' });
  });

  it('คุอง Lv2: ใช้เมจิคในแอทแท็คสเต็ป → สปิริตคู่แข่ง 1 ตัว BP-10000 ในเทิร์นนี้', () => {
    let s = setup();
    put(s, 'p1', no('เซ็นโงคุฮิเมะ คุอง'), 2);
    const atk = put(s, 'p1', DARIU, 1);
    const target = put(s, 'p2', DARIU, 1);
    const magic = inHand(s, 'p1', no('ไทม์รีวินด์'));
    s = attack(s, atk);
    s = act(s, { type: 'passFlash', player: 'p2' });
    const cost = payableCost(s, db, 'p1', db.get(no('ไทม์รีวินด์')));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [target] });
    s = choose(s, target);
    // BP เหลือ 0 แต่คุองไม่ได้สั่งทำลาย: ยังอยู่บนสนาม
    expect(currentBp(s, db, target)).toBe(0);
    expect(s.players.p2.field).toContain(target);
  });
});
