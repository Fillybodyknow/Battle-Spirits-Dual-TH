import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, baseCost, cardLevel, createGame, currentBp, fieldSymbols, matchesFilter, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;

const DARIU = no('มุฉะดาริว'); // คอสต์ 1 BP 3000/6000/8000 (1/3/5) ไม่มีเอฟเฟกต์

/** เกมไม่สับเด็ค p1 เริ่มก่อน เด็คที่เหลือเป็นมุฉะดาริว */
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
  const id = `t-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t-card-${++seq}`;
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
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
/** จ่ายคอสต์จากรีเสิร์ฟ (soul = ใช้ Soul Core ร่วมจ่าย) แล้ววาง Core ที่เหลือ place ดวง */
function pay(s: GameState, cardNo: string, soul: boolean, place = 0) {
  const reserve = s.players.p1.reserve;
  const soulId = reserve.find((id) => s.cores[id]!.isSoul)!;
  const normal = reserve.filter((id) => !s.cores[id]!.isSoul);
  const cost = payableCost(s, db, 'p1', db.get(cardNo));
  const payment = soul ? [soulId, ...normal.slice(0, cost - 1)] : normal.slice(0, cost);
  const rest = normal.filter((id) => !payment.includes(id));
  return { payment, placement: rest.slice(0, place) };
}
function summon(s: GameState, name: string, soul = false, place = 1): GameState {
  const cardNo = no(name);
  const cardId = inHand(s, 'p1', cardNo);
  return act(s, { type: 'summon', player: 'p1', cardId, ...pay(s, cardNo, soul, place) });
}
function magic(s: GameState, name: string, soul = false): GameState {
  const cardNo = no(name);
  const cardId = inHand(s, 'p1', cardNo);
  return act(s, { type: 'useMagic', player: 'p1', cardId, payment: pay(s, cardNo, soul).payment, timing: 'flash' });
}

describe('Booster Set 02 / 03', () => {
  it('สคริปต์ของการ์ดใหม่ผูกได้ทุกใบ (จำนวนช่องตรงกับบรรทัดเอฟเฟกต์)', () => {
    const cards = db.all().filter((c) => c.cardNo.startsWith('BS02') || c.cardNo.startsWith('BS03'));
    expect(cards.length).toBeGreaterThan(60);
    expect(cards.filter((c) => c.abilities.length > 0).length).toBeGreaterThan(40);
  });

  // กติกา 07 Q2: สปิริตที่มี Soul Core ถูกส่งคอร์ออก เจ้าของสปิริตเลือกได้ว่าจะส่งคอร์ไหน
  it('โซลชูท (จ่ายด้วย Soul Core): ส่งคอร์คู่แข่ง 2 เม็ด เจ้าของเลือกเก็บ Soul Core ไว้', () => {
    const s = setup();
    const target = put(s, 'p2', DARIU, 3, true);
    const reserve = s.players.p2.reserve.length;
    let x = magic(s, 'โซลชูท', true);
    x = choose(x, target);
    // เจ้าของสปิริต (p2) เป็นคนเลือก
    expect(x.choice?.kind).toBe('option');
    expect(x.choice?.player).toBe('p2');
    x = choose(x, 0);
    x = choose(x, target);
    x = choose(x, 0);
    const left = x.cards[target]!.cores;
    expect(left).toHaveLength(1);
    expect(x.cores[left[0]!]!.isSoul).toBe(true);
    expect(x.players.p2.reserve.length).toBe(reserve + 2);
  });

  it('โซลชูท: เจ้าของเลือกส่ง Soul Core ออกได้ · เหลือแต่คอร์ปกติ = ไม่ถามอีก', () => {
    const s = setup();
    const target = put(s, 'p2', DARIU, 3, true);
    let x = magic(s, 'โซลชูท', true);
    x = choose(x, target);
    x = choose(x, 1); // ส่ง Soul Core
    expect(x.cards[target]!.cores.some((c) => x.cores[c]!.isSoul)).toBe(false);
    x = choose(x, target);
    expect(x.choice?.kind).not.toBe('option');
    expect(x.cards[target]!.cores).toHaveLength(1);
  });

  it('ส่งคอร์ออก: Soul Core เม็ดเดียวกับคอร์ปกติไม่พอ = ไม่ถาม (ต้องออกด้วย)', () => {
    const s = setup();
    const target = put(s, 'p2', DARIU, 1, true); // มีแต่ Soul Core
    const x = choose(magic(s, 'โซลชูท'), target);
    expect(x.choice?.kind).not.toBe('option');
    expect(x.players.p2.field).not.toContain(target);
  });

  it('โซลชูท: สปิริตคู่แข่งที่คอร์หมดจากเอฟเฟกต์สูญสลาย', () => {
    const s = setup();
    const target = put(s, 'p2', DARIU, 1);
    const x = choose(magic(s, 'โซลชูท'), target);
    expect(x.players.p2.field).not.toContain(target);
    expect(x.players.p2.trashCards).toContain(target);
  });

  it('โอริงามิ ฮอร์ส (อัญเชิญเป็นสปิริต): ส่งคอร์สปิริตคู่แข่งจนเหลือ 1 เม็ด', () => {
    const s = setup();
    const target = put(s, 'p2', DARIU, 5);
    let x = summon(s, 'โอริงามิ ฮอร์ส');
    expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([target]);
    x = choose(x, target);
    expect(x.cards[target]!.cores).toHaveLength(1);
  });

  it('ราชายักษ์ นาราคุ: ต่อสปิริตเผ่าอสูรราตรีของเรา 1 ตัว ส่งคอร์คู่แข่ง 2 เม็ด', () => {
    const s = setup();
    put(s, 'p1', no('องเมียวจิดูดเลือด ฮิเร็น'), 1);
    const target = put(s, 'p2', DARIU, 5);
    let x = summon(s, 'ราชายักษ์ นาราคุ');
    for (let i = 0; i < 2; i++) x = choose(x, target);
    expect(x.choice).toBeFalsy();
    expect(x.cards[target]!.cores).toHaveLength(3);
  });

  it('ยักษ์นักสู้สวมเกราะ ราโชว: ทิ้งใบบนสุดเด็คเรา 4 ใบ เพื่อจั่ว 2 ใบ', () => {
    const s = setup();
    const deck = s.players.p1.deck.length;
    const trash = s.players.p1.trashCards.length;
    let x = summon(s, 'ยักษ์นักสู้สวมเกราะ ราโชว');
    const hand = x.players.p1.hand.length;
    x = choose(x, 0);
    expect(x.players.p1.trashCards.length).toBe(trash + 4);
    expect(x.players.p1.deck.length).toBe(deck - 6);
    expect(x.players.p1.hand.length).toBe(hand + 2);
  });

  it('"สามารถ X เพื่อ Y": ทำท่อนหลังไม่ได้ (เด็คไม่พอจั่ว) = ไม่มีตัวเลือกให้ใช้ ไม่ถาม', () => {
    const s = setup();
    s.players.p1.deck = s.players.p1.deck.slice(0, 5);
    const x = summon(s, 'ยักษ์นักสู้สวมเกราะ ราโชว');
    expect(x.choice).toBeFalsy();
    expect(x.players.p1.deck).toHaveLength(5);
  });

  it('โอริงามิ ฮอร์ส (ร่วมร่าง): คู่แข่งไม่มีสปิริตที่มีคอร์ = ไม่ถามให้ทิ้งการ์ด', () => {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1);
    const brave = inHand(s, 'p1', no('โอริงามิ ฮอร์ส'));
    s.cards[brave]!.state = 'refresh';
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== brave);
    s.cards[host]!.braves.push(brave);
    inHand(s, 'p1', DARIU);
    s = act(s, { type: 'endMain', player: 'p1' });
    const x = act(s, { type: 'declareAttack', player: 'p1', attackerId: host });
    expect(x.choice?.kind).not.toBe('option');
  });

  it('เบ็คโด Lv2 (Soul Core) โจมตี: เสื่อมสภาพสปิริต BP ≤ 10000 เพื่อส่งไลฟ์คู่แข่ง 1 เม็ด; ไม่มีเป้าหมาย = ไม่ถาม', () => {
    const BEKKO = no('นินจาชั้นสูงผีเสื้อราตรีสวมเกราะ เบ็คโด');
    const run = (withTarget: boolean) => {
      let s = setup();
      const bekko = put(s, 'p1', BEKKO, 3, true);
      const target = withTarget ? put(s, 'p2', DARIU, 1) : null;
      s = act(s, { type: 'endMain', player: 'p1' });
      return { x: act(s, { type: 'declareAttack', player: 'p1', attackerId: bekko }), target, life: s.players.p2.life.length };
    };
    const none = run(false);
    expect(none.x.choice?.kind).not.toBe('option');
    const some = run(true);
    expect(some.x.choice?.kind === 'option' && some.x.choice.options).toHaveLength(2);
    let x = choose(some.x, 0);
    x = choose(x, some.target!);
    expect(x.cards[some.target!]!.state).toBe('exhausted');
    expect(x.players.p2.life.length).toBe(some.life - 1);
  });

  it('"ในเทิร์นนี้ สปิริตเราทั้งหมด BP+" (โซลออร่า): ตัวที่ลงสนามทีหลังในเทิร์นเดียวกันก็ได้ด้วย และหายเมื่อจบเทิร์น', () => {
    let s = setup();
    const before = put(s, 'p1', DARIU, 1);
    s = magic(s, 'โซลออร่า');
    const later = put(s, 'p1', DARIU, 1);
    expect(currentBp(s, db, before)).toBe(6000);
    expect(currentBp(s, db, later)).toBe(6000);
    s.turn += 1;
    expect(currentBp(s, db, later)).toBe(3000);
  });

  it('แปลงร่างสลับกายคู่ (Flash): เสื่อมสภาพสปิริตคอสต์ไม่เกิน 4 ของคู่แข่งทั้งหมด', () => {
    const s = setup();
    const small = put(s, 'p2', DARIU, 1);
    const big = put(s, 'p2', no('นินจาเขี้ยวพิศวงชั้นสูง เฮียวโซวกะ'), 1);
    const x = magic(s, 'แปลงร่างสลับกายคู่');
    expect(x.cards[small]!.state).toBe('exhausted');
    expect(x.cards[big]!.state).toBe('refresh');
  });

  it('ดุ๊คคิงเทารอส: นำคอร์วอยด์วางบนตัวเองเท่าจำนวนสปิริตของเรา', () => {
    const s = setup();
    put(s, 'p1', DARIU, 1);
    put(s, 'p1', DARIU, 1);
    const x = summon(s, 'ดุ๊คคิงเทารอส');
    const id = x.players.p1.field.find((i) => x.cards[i]!.cardNo === no('ดุ๊คคิงเทารอส'))!;
    // วางตอนอัญเชิญ 1 + วอยด์ 3 (สปิริตเรา 3 ตัวรวมตัวนี้)
    expect(x.cards[id]!.cores).toHaveLength(4);
  });

  it('มังกรควันม่วง โจมตี: เลือกทำลายได้เฉพาะสปิริตที่เสื่อมสภาพ', () => {
    let s = setup();
    const dragon = put(s, 'p1', no('มังกรควันม่วง'), 1);
    const tired = put(s, 'p2', DARIU, 1, false, 'exhausted');
    put(s, 'p2', DARIU, 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    const x = act(s, { type: 'declareAttack', player: 'p1', attackerId: dragon });
    expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([tired]);
  });

  describe('เอฟเฟกต์ Flash ที่กดใช้เอง (activate)', () => {
    /** p1 ประกาศโจมตีด้วย attacker แล้วอยู่ใน Flash timing ที่ p1 ถือ priority */
    function attackFlash(s: GameState, attacker: string): GameState {
      let x = act(s, { type: 'endMain', player: 'p1' });
      x = act(x, { type: 'declareAttack', player: 'p1', attackerId: attacker });
      // ฝ่ายป้องกันได้ priority ก่อน: pass ให้ฝ่ายโจมตี
      if (x.battle?.flash?.priority === 'p2') x = act(x, { type: 'passFlash', player: 'p2' });
      expect(x.battle?.flash?.priority).toBe('p1');
      return x;
    }
    const activate = (s: GameState, cardId: string, source = 0) => act(s, { type: 'activate', player: 'p1', cardId, source });

    it('โซอุม: เสื่อมสภาพสปิริตเผ่าร่างประกอบของเรา เพื่อเสื่อมสภาพสปิริตคู่แข่ง 1 ตัว', () => {
      const s = setup();
      const attacker = put(s, 'p1', DARIU, 1);
      const soum = put(s, 'p1', no('พระนักรบร่างประหลาด โซอุม'), 1);
      const target = put(s, 'p2', DARIU, 1);
      let x = activate(attackFlash(s, attacker), soum);
      expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([soum]);
      x = choose(x, soum);
      x = choose(x, target);
      expect(x.cards[soum]!.state).toBe('exhausted');
      expect(x.cards[target]!.state).toBe('exhausted');
      expect(x.battle?.flash?.priority).toBe('p2');
    });

    it('โซอุม: คู่แข่งไม่มีตัวให้เสื่อมสภาพ = ใช้ไม่ได้ (ทำได้ไม่ครบสองท่อน)', () => {
      const s = setup();
      const attacker = put(s, 'p1', DARIU, 1);
      const soum = put(s, 'p1', no('พระนักรบร่างประหลาด โซอุม'), 1);
      const x = attackFlash(s, attacker);
      expect(applyAction(x, { type: 'activate', player: 'p1', cardId: soum, source: 0 }, db).ok).toBe(false);
    });

    it('มิซึมาตะโอโรจิ [Assault]: ระหว่างโจมตี เสื่อมสภาพเน็กซัสเราเพื่อฟื้นสภาพ (ฟื้นแล้วใช้ซ้ำไม่ได้)', () => {
      const s = setup();
      const orochi = put(s, 'p1', no('มิซึมาตะโอโรจิแห่งเขียวคราม'), 1);
      const nexus = put(s, 'p1', no('No.3 ร็อคแฮนด์'), 0);
      put(s, 'p1', no('No.3 ร็อคแฮนด์'), 0);
      let x = attackFlash(s, orochi);
      expect(x.cards[orochi]!.state).toBe('exhausted');
      x = activate(x, orochi, 1);
      x = choose(x, nexus);
      expect(x.cards[nexus]!.state).toBe('exhausted');
      expect(x.cards[orochi]!.state).toBe('refresh');
      x = act(x, { type: 'passFlash', player: 'p2' });
      expect(applyAction(x, { type: 'activate', player: 'p1', cardId: orochi, source: 1 }, db).ok).toBe(false);
    });

    it('มิซึมาตะโอโรจิ: เน็กซัสเราเสื่อมสภาพ → ทำลายสปิริตคู่แข่งคอสต์ไม่เกินเน็กซัสนั้น (Lv2 + Soul Core: เน็กซัสคอสต์ +2)', () => {
      const s = setup();
      const orochi = put(s, 'p1', no('มิซึมาตะโอโรจิแห่งเขียวคราม'), 2, true);
      const nexus = put(s, 'p1', no('No.3 ร็อคแฮนด์'), 0); // คอสต์ 4 → 6
      const cost6 = put(s, 'p2', no('นักพรตชั่วร้าย โอกุมะ'), 1);
      const cost8 = put(s, 'p2', no('นินจาเขี้ยวพิศวงชั้นสูง เฮียวโซวกะ'), 1);
      let x = activate(attackFlash(s, orochi), orochi, 1);
      x = choose(x, nexus);
      expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([cost6]);
      // ข้อความเลือกเป้าบอกเพดานคอสต์ + ที่มาของ +2 · เป้าคอสต์ 6 เลือกได้เพราะ +2 → มิซึมาตะเรืองแสง (บรรทัด "คอสต์ +2")
      expect(x.choice?.prompt).toContain('คอสต์ไม่เกิน 6');
      expect(x.choice?.prompt).toContain('+2 จาก มิซึมาตะโอโรจิแห่งเขียวคราม');
      expect(x.log.some((e) => e.type === 'staticApplied' && e.cardId === orochi && e.source === 2)).toBe(true);
      x = choose(x, cost6);
      expect(x.players.p2.field).not.toContain(cost6);
      expect(x.players.p2.field).toContain(cost8);
    });

    it('มิซึมาตะโอโรจิ: +2 ไม่ได้ทำให้มีเป้าเพิ่ม (เป้าคอสต์ไม่เกินคอสต์เดิมของเน็กซัส) = ไม่เรืองแสงบรรทัด "คอสต์ +2"', () => {
      const s = setup();
      const orochi = put(s, 'p1', no('มิซึมาตะโอโรจิแห่งเขียวคราม'), 2, true);
      const nexus = put(s, 'p1', no('No.3 ร็อคแฮนด์'), 0); // คอสต์ 4 → 6
      const cost1 = put(s, 'p2', DARIU, 1);
      let x = activate(attackFlash(s, orochi), orochi, 1);
      x = choose(x, nexus);
      expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([cost1]);
      expect(x.log.some((e) => e.type === 'staticApplied' && e.cardId === orochi)).toBe(false);
    });

    it('โอกุมะ: ส่ง Soul Core ลงแทรช เพื่ออัญเชิญจากแทรช (จ่ายคอสต์) กี่ใบก็ได้', () => {
      const s = setup();
      const attacker = put(s, 'p1', DARIU, 1);
      const oguma = put(s, 'p1', no('นักพรตชั่วร้าย โอกุมะ'), 2, true);
      const baku = inHand(s, 'p1', no('ยักษ์แดง บาคุโชว'));
      s.players.p1.hand = s.players.p1.hand.filter((id) => id !== baku);
      s.players.p1.trashCards.push(baku);
      let x = activate(attackFlash(s, attacker), oguma);
      expect(x.cards[oguma]!.cores.some((id) => x.cores[id]!.isSoul)).toBe(false);
      x = choose(x, baku);
      expect(x.choice?.kind).toBe('payCost');
      const cost = x.choice?.kind === 'payCost' ? x.choice.cost : 0;
      const normal = () => x.players.p1.reserve.filter((id) => !x.cores[id]!.isSoul);
      x = choose(x, { pay: normal().slice(0, cost) });
      x = choose(x, { pay: normal().slice(0, 1) });
      expect(x.players.p1.field).toContain(baku);
    });
  });

  describe('ฟื้นสภาพไม่ได้ / อยู่บนสนามต่อ', () => {
    /** จบเทิร์นของ p1 → เทิร์น p2 ผ่านรีเฟรชสเต็ป */
    const endTurn = (s: GameState) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'endAttackStep', player: 'p1' });

    it('โซอุม Lv2: รีเฟรชสเต็ปของคู่แข่ง สปิริตคอสต์ ≥ 8 ของคู่แข่งฟื้นสภาพไม่ได้', () => {
      const s = setup();
      const soum = put(s, 'p1', no('พระนักรบร่างประหลาด โซอุม'), 3);
      const big = put(s, 'p2', no('นินจาเขี้ยวพิศวงชั้นสูง เฮียวโซวกะ'), 1, false, 'exhausted');
      const small = put(s, 'p2', DARIU, 1, false, 'exhausted');
      const x = endTurn(s);
      expect(x.turnPlayer).toBe('p2');
      expect(x.cards[big]!.state).toBe('exhausted');
      expect(x.cards[small]!.state).toBe('refresh');
      // หน้าเว็บเรืองแสงโซอุมตอนรีเฟรชสเต็ปของคู่แข่ง
      expect(x.log.some((e) => e.type === 'staticApplied' && e.cardId === soum)).toBe(true);
    });

    it('เคล็ดวิชาปลดปล่อยพสุธา (Soul Core): ตัวที่เสื่อมสภาพฟื้นสภาพไม่ได้ในรีเฟรชสเต็ปครั้งถัดไปของคู่แข่ง', () => {
      const s = setup();
      const target = put(s, 'p2', DARIU, 1);
      let x = magic(s, 'เคล็ดวิชาปลดปล่อยพสุธา', true);
      x = choose(x, target);
      expect(x.cards[target]!.state).toBe('exhausted');
      x = endTurn(x);
      expect(x.turnPlayer).toBe('p2');
      expect(x.cards[target]!.state).toBe('exhausted');
      expect(x.refreshLocks ?? []).not.toContain(target);
    });

    it('โอกุมะ Lv2: ถูกทำลายจากการต่อสู้ → ทิ้งใบบนสุดเด็คเรา 4 ใบ เพื่ออยู่บนสนามต่อในสภาพเดิม', () => {
      let s = setup();
      const oguma = put(s, 'p1', no('นักพรตชั่วร้าย โอกุมะ'), 2); // Lv2 BP 7000
      const blocker = put(s, 'p2', no('นินจาเขี้ยวพิศวงชั้นสูง เฮียวโซวกะ'), 3); // Lv2 BP 14000
      const deck = s.players.p1.deck.length;
      s = act(s, { type: 'endMain', player: 'p1' });
      let x = act(s, { type: 'declareAttack', player: 'p1', attackerId: oguma });
      while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
      x = act(x, { type: 'declareBlock', player: 'p2', blockerId: blocker });
      while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
      expect(x.choice?.kind).toBe('option');
      x = choose(x, 0);
      expect(x.players.p1.field).toContain(oguma);
      expect(x.cards[oguma]!.state).toBe('exhausted');
      expect(x.players.p1.deck.length).toBe(deck - 4);
    });
  });

  describe('บรรทัดที่เหลือของ BS02/BS03', () => {
    const endMain = (s: GameState, p: PlayerId = 'p1') => act(s, { type: 'endMain', player: p });
    /** ให้เป็นเทิร์นของ p2 (Main Step) */
    const p2Turn = (s: GameState) => {
      s.turnPlayer = 'p2';
      return s;
    };
    const passFlashes = (s: GameState) => {
      let x = s;
      while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
      return x;
    };

    it('ไซเลนท์ฮิล: แอทแท็คสเต็ปของคู่แข่ง ไลฟ์ลดลง N เม็ด → จั่ว N ใบ', () => {
      const s = p2Turn(setup());
      put(s, 'p1', no('No.22 ไซเลนท์ฮิล'), 0);
      const atk = put(s, 'p2', no('ดุ๊คคิงเทารอส'), 1); // เจ็มเขียว 2 = ไลฟ์ 2
      const hand = s.players.p1.hand.length;
      let x = act(endMain(s, 'p2'), { type: 'declareAttack', player: 'p2', attackerId: atk });
      x = passFlashes(x);
      x = act(x, { type: 'noBlock', player: 'p1' });
      x = passFlashes(x);
      expect(x.players.p1.hand.length).toBe(hand + 2);
    });

    it('ลาร์คไอส์แลนด์ Lv2: เมนสเต็ปของเรา การ์ดเมียวโอในมือคอสต์ 6', () => {
      const s = setup();
      const aguni = inHand(s, 'p1', no('เมียวโอเพลิงคราม อากุนิอัส'));
      expect(baseCost(s, db, aguni)).toBe(8);
      put(s, 'p1', no('No.34 ลาร์คไอส์แลนด์'), 1);
      expect(baseCost(s, db, aguni)).toBe(6);
    });

    it('ราโชว Lv2 + Soul Core ในแทรชเรา: เน็กซัสคู่แข่ง Lv คอสต์ +2', () => {
      const s = setup();
      put(s, 'p1', no('ยักษ์นักสู้สวมเกราะ ราโชว'), 3);
      const nexus = put(s, 'p2', no('No.3 ร็อคแฮนด์'), 2);
      expect(cardLevel(s, db, nexus)).toBe(2);
      const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
      s.players.p1.reserve = s.players.p1.reserve.filter((id) => id !== soul);
      s.players.p1.trashCores.push(soul);
      expect(cardLevel(s, db, nexus)).toBe(1);
    });

    it('ราโชว Lv2 ฝั่งที่ไม่ใช่เทิร์น + เน็กซัสฝั่งเทิร์น ในแอทแท็คสเต็ป: คำนวณ BP/เลเวลได้ (ไม่วนไม่จบ)', () => {
      const s = setup();
      const rasho = put(s, 'p2', no('ยักษ์นักสู้สวมเกราะ ราโชว'), 3);
      const nexus = put(s, 'p1', no('No.3 ร็อคแฮนด์'), 1);
      s.phase = 'attack';
      expect(currentBp(s, db, rasho)).toBeGreaterThan(0);
      expect(cardLevel(s, db, nexus)).toBe(2);
      const soul = s.players.p2.reserve.find((id) => s.cores[id]!.isSoul)!;
      s.players.p2.reserve = s.players.p2.reserve.filter((id) => id !== soul);
      s.players.p2.trashCores.push(soul);
      expect(cardLevel(s, db, nexus)).toBe(0); // Lv คอสต์ +2: 1 คอร์ไม่พอ Lv1 (ต้อง 2) → สูญสลายตอนตรวจครั้งถัดไป
    });

    it('ราโชว Lv2: Soul Core ลงแทรชเรา → เน็กซัสคู่แข่งที่คอร์ไม่ถึง Lv คอสต์ใหม่สูญสลายทันที', () => {
      const s = setup();
      put(s, 'p1', no('ยักษ์นักสู้สวมเกราะ ราโชว'), 3);
      const weak = put(s, 'p2', no('No.3 ร็อคแฮนด์'), 1); // Lv1 ต้อง 0+2 = 2 คอร์
      const strong = put(s, 'p2', no('No.3 ร็อคแฮนด์'), 2);
      const target = put(s, 'p2', DARIU, 3);
      // จ่ายโซลชูทด้วย Soul Core → Soul Core อยู่ในแทรชเรา
      const x = choose(choose(magic(s, 'โซลชูท', true), target), target);
      expect(x.players.p2.field).not.toContain(weak);
      expect(x.players.p2.trashCards).toContain(weak);
      expect(x.players.p2.field).toContain(strong);
    });

    it('กาโอว Lv2 (Soul Core) โจมตี: คู่แข่งป้องกันได้เฉพาะสปิริตที่มี Soul Core', () => {
      let s = setup();
      const gaou = put(s, 'p1', no('มนุษย์สมิงนักฟันดาบ กาโอว'), 4, true);
      const plain = put(s, 'p2', DARIU, 1);
      const souled = put(s, 'p2', DARIU, 1, true);
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: gaou });
      s = passFlashes(s);
      expect(applyAction(s, { type: 'declareBlock', player: 'p2', blockerId: plain }, db).ok).toBe(false);
      expect(applyAction(s, { type: 'declareBlock', player: 'p2', blockerId: souled }, db).ok).toBe(true);
    });

    it('โบน-วีเซล Lv2 (Soul Core): เริ่มแอทแท็คสเต็ปของคู่แข่ง คู่แข่งเลือกส่งคอร์ 2 เม็ดบนสปิริตตนเอง 1 ตัว', () => {
      const s = setup();
      put(s, 'p2', no('โบน-วีเซล'), 3, true);
      const mine = put(s, 'p1', DARIU, 4);
      let x = endMain(s);
      expect(x.choice?.player).toBe('p1');
      x = choose(x, mine);
      expect(x.cards[mine]!.cores).toHaveLength(2);
    });

    it('ลมหวนกรรโชกแรง: เอนด์สเต็ปของเรา ฟื้นสภาพสปิริตวายุนินจา/มนุษย์แมลง 2 ตัว แล้วค่อยส่งเทิร์น', () => {
      const s = setup();
      put(s, 'p1', no('ลมหวนกรรโชกแรง'), 0);
      const a = put(s, 'p1', no('นินจาผีเสื้อราตรีสวมเกราะ ฮ็อปปะ'), 1, false, 'exhausted');
      const b = put(s, 'p1', no('นินจาผีเสื้อราตรีสวมเกราะ ฮ็อปปะ'), 1, false, 'exhausted');
      let x = act(endMain(s), { type: 'endAttackStep', player: 'p1' });
      expect(x.phase).toBe('end');
      x = choose(x, a);
      x = choose(x, b);
      expect(x.cards[a]!.state).toBe('refresh');
      expect(x.cards[b]!.state).toBe('refresh');
      expect(x.turnPlayer).toBe('p2');
    });

    it('กิริโชว Lv2: เมื่อคู่แข่งจั่วการ์ด สปิริตนี้ฟื้นสภาพ', () => {
      const s = setup();
      const g = put(s, 'p1', no('นินจาผีเสื้อราตรีสวมเกราะ กิริโชว'), 3, false, 'exhausted');
      const x = act(endMain(s), { type: 'endAttackStep', player: 'p1' }); // p2 จั่วใน Draw Step
      expect(x.turnPlayer).toBe('p2');
      expect(x.cards[g]!.state).toBe('refresh');
    });

    it('คานิคอง: เจ็มนับเป็นเจ็มเขียวด้วย; Lv2 + Soul Core สปิริตมนุษย์แมลงของเราไม่ถูกถอดคอร์', () => {
      const s = p2Turn(setup());
      put(s, 'p1', no('คานิคอง'), 2, true);
      const insect = put(s, 'p1', no('นักบวชนินจา ฮิกุราชิ'), 2); // วายุนินจา/มนุษย์แมลง
      const other = put(s, 'p1', DARIU, 2);
      expect(fieldSymbols(s, db, 'p1').green).toBeGreaterThanOrEqual(2);
      s.turnPlayer = 'p2';
      const shoot = inHand(s, 'p2', no('โซลชูท'));
      const normal = s.players.p2.reserve.filter((id) => !s.cores[id]!.isSoul);
      const cost = payableCost(s, db, 'p2', db.get(no('โซลชูท')));
      const x = act(s, { type: 'useMagic', player: 'p2', cardId: shoot, payment: normal.slice(0, cost), timing: 'flash' });
      expect(x.choice?.kind === 'card' && x.choice.candidates).not.toContain(insect);
      expect(x.choice?.kind === 'card' && x.choice.candidates).toContain(other);
    });

    it('ฮิเร็น Lv2 (Soul Core) โจมตี: ทิ้งเด็คเรา 4 ใบ ต่อการ์ดสปิริต 1 ใบ ส่งคอร์คู่แข่ง 1 เม็ด', () => {
      let s = setup();
      const hiren = put(s, 'p1', no('องเมียวจิดูดเลือด ฮิเร็น'), 3, true);
      const target = put(s, 'p2', DARIU, 5);
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: hiren });
      s = choose(s, 0);
      for (let i = 0; i < 4; i++) s = choose(s, target); // เด็คเป็นมุฉะดาริวทั้งหมด = สปิริต 4 ใบ
      expect(s.cards[target]!.cores).toHaveLength(1);
    });

    it('ดุ๊คคิงเทารอส Lv2: ส่ง Soul Core ไปรีเสิร์ฟ → ในการต่อสู้นี้คู่แข่งใช้แฟลชไม่ได้', () => {
      let s = setup();
      const dk = put(s, 'p1', no('ดุ๊คคิงเทารอส'), 3, true);
      const magicId = inHand(s, 'p2', no('โซลชูท'));
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: dk });
      s = choose(s, 0);
      expect(s.battle?.noFlash).toBe('p2');
      const normal = s.players.p2.reserve.filter((id) => !s.cores[id]!.isSoul);
      const r = applyAction(s, { type: 'useMagic', player: 'p2', cardId: magicId, payment: normal.slice(0, 5), timing: 'flash' }, db);
      expect(r.ok).toBe(false);
    });

    it('ดุ๊คคิงเทารอส Lv2: สปิริตคู่แข่งที่ต่อสู้อยู่ถูกทำลาย → คอร์ไลฟ์คู่แข่ง 1 เม็ดลงแทรช', () => {
      let s = setup();
      const dk = put(s, 'p1', no('ดุ๊คคิงเทารอส'), 3); // ไม่มี Soul Core: ไม่ถามเรื่องแฟลช
      const blocker = put(s, 'p2', DARIU, 1);
      const life = s.players.p2.life.length;
      const trash = s.players.p2.trashCores.length;
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: dk });
      s = passFlashes(s);
      s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
      s = passFlashes(s);
      expect(s.players.p2.field).not.toContain(blocker);
      expect(s.players.p2.life.length).toBe(life - 1);
      expect(s.players.p2.trashCores.length).toBe(trash + 1);
    });

    it('กาสุมิมิสุคุ: สูญสลายเพราะคู่แข่งถอดคอร์ → ทำงานเหมือนถูกทำลายโดยคู่แข่ง', () => {
      const s = setup();
      const kasumi = put(s, 'p2', no('กาสุมิมิสุคุ'), 1);
      const mine = put(s, 'p1', DARIU, 3);
      let x = choose(magic(s, 'โซลชูท'), kasumi);
      expect(x.players.p2.trashCards).toContain(kasumi);
      expect(x.choice?.player).toBe('p2');
      x = choose(x, mine);
      expect(x.cards[mine]!.cores).toHaveLength(2);
    });

    it('เทพยักษ์บาซาระ: ทำให้สปิริตที่มี Soul Core สูญสลาย → คอร์ในรีเสิร์ฟคู่แข่งลงแทรชทั้งหมด', () => {
      const s = setup();
      const target = put(s, 'p2', DARIU, 1, true);
      let x = summon(s, 'เทพยักษ์บาซาระ');
      x = choose(x, target);
      expect(x.players.p2.field).not.toContain(target);
      expect(x.players.p2.reserve).toHaveLength(0);
    });

    it('คาราคุริโอโอคามิ (ผู้ร่วมร่างมี Soul Core): ชนะและทำลายผู้ป้องกันจากการเทียบ BP → ฟื้นสภาพ', () => {
      let s = setup();
      const host = put(s, 'p1', no('มุฉะดาริว'), 5, true); // BP 8000 + 3000
      const brave = inHand(s, 'p1', no('คาราคุริโอโอคามิ'));
      s.players.p1.hand = s.players.p1.hand.filter((id) => id !== brave);
      s.cards[host]!.braves.push(brave);
      const blocker = put(s, 'p2', DARIU, 1);
      const other = put(s, 'p2', DARIU, 1);
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: host });
      s = choose(s, other); // เอฟเฟกต์ผู้ร่วมร่าง: เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว
      s = passFlashes(s);
      expect(s.cards[host]!.state).toBe('exhausted');
      s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
      s = passFlashes(s);
      expect(s.players.p2.field).not.toContain(blocker);
      expect(s.cards[host]!.state).toBe('refresh');
    });

    it('เคล็ดวิชาเคลื่อนย้ายในพริบตา (Soul Core): ฟื้นสภาพสปิริตชื่อเดียวกันทั้งหมดด้วย', () => {
      const s = setup();
      const a = put(s, 'p1', no('นินจาผีเสื้อราตรีสวมเกราะ ฮ็อปปะ'), 1, false, 'exhausted');
      const b = put(s, 'p1', no('นินจาผีเสื้อราตรีสวมเกราะ ฮ็อปปะ'), 1, false, 'exhausted');
      const x = choose(magic(s, 'เคล็ดวิชาเคลื่อนย้ายในพริบตา', true), a);
      expect(x.cards[a]!.state).toBe('refresh');
      expect(x.cards[b]!.state).toBe('refresh');
    });

    it('ไอโครบาคุริว: สปิริตที่ร่วมร่างคอสต์รวม Brave แต่เอฟเฟกต์นี้ถือว่า Brave คอสต์ 0', () => {
      const s = setup();
      const host = put(s, 'p2', no('นินจาผีเสื้อราตรีสวมเกราะ กิริโชว'), 1); // คอสต์ 4
      const brave = inHand(s, 'p2', no('คาราคุริโอโอคามิ')); // คอสต์ 4
      s.players.p2.hand = s.players.p2.hand.filter((id) => id !== brave);
      s.cards[host]!.braves.push(brave);
      expect(matchesFilter(s, db, host, { maxCost: 6 })).toBe(false);
      expect(matchesFilter(s, db, host, { maxCost: 6, ignoreBraveCost: true })).toBe(true);
    });

    it('เอปวิป (Soul Core): คอร์วอยด์ 1 เม็ดลงรีเสิร์ฟ + อีก 2 เม็ดลงแทรช', () => {
      const s = setup();
      const trash = s.players.p1.trashCores.length;
      const paid = payableCost(s, db, 'p1', db.get(no('เอปวิป')));
      const x = summon(s, 'เอปวิป', true);
      // คอร์ที่จ่ายคอสต์ลงแทรช + คอร์วอยด์ 2 เม็ด
      expect(x.players.p1.trashCores.length).toBe(trash + paid + 2);
    });

    it('ร็อคแฮนด์: ดรอว์สเต็ป ทิ้งสปิริตมารต้องสาปก่อน แล้ว Draw Step จั่ว 3 ใบ', () => {
      const s = setup();
      put(s, 'p2', no('No.3 ร็อคแฮนด์'), 0);
      const cursed = inHand(s, 'p2', no('ยักษ์แดง บาคุโชว'));
      const hand = s.players.p2.hand.length;
      let x = act(endMain(s), { type: 'endAttackStep', player: 'p1' });
      expect(x.phase).toBe('draw');
      expect(x.players.p2.hand.length).toBe(hand); // ยังไม่จั่ว
      x = choose(x, 0);
      x = choose(x, cursed);
      expect(x.players.p2.trashCards).toContain(cursed);
      expect(x.players.p2.hand.length).toBe(hand - 1 + 3);
      expect(x.phase).toBe('main');
    });

    it('เคล็ดวิชาสลับร่างแทนกาย (Main + Soul Core): ในเทิร์นนี้ สปิริตเราถูกทำลาย → เสื่อมสภาพคู่แข่ง + กลับขึ้นมือ', () => {
      let s = setup();
      const atk = put(s, 'p1', DARIU, 1);
      const blocker = put(s, 'p2', no('นินจาเขี้ยวพิศวงชั้นสูง เฮียวโซวกะ'), 1);
      const other = put(s, 'p2', DARIU, 1);
      const card = inHand(s, 'p1', no('เคล็ดวิชาสลับร่างแทนกาย'));
      const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
      const normal = s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);
      const cost = payableCost(s, db, 'p1', db.get(no('เคล็ดวิชาสลับร่างแทนกาย')));
      s = act(s, { type: 'useMagic', player: 'p1', cardId: card, payment: [soul, ...normal.slice(0, cost - 1)], timing: 'main' });
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: atk });
      s = passFlashes(s);
      s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
      s = passFlashes(s);
      expect(s.choice?.kind === 'card' && s.choice.candidates).toEqual([other]);
      s = choose(s, other);
      expect(s.cards[other]!.state).toBe('exhausted');
      expect(s.players.p1.hand).toContain(atk);
    });

    it('อากุนิอัสบนมือ: หลังจากเบิร์สของคู่แข่งถูกสั่งใช้ อัญเชิญไม่จ่ายคอสต์ได้', () => {
      let s = setup();
      const aguni = inHand(s, 'p1', no('เมียวโอเพลิงคราม อากุนิอัส'));
      const burst = inHand(s, 'p2', no('นินจาเขี้ยวพิศวง ทาจิคาเซะวูล์ฟ')); // หลังจากเราเสียไลฟ์
      s.players.p2.hand = s.players.p2.hand.filter((id) => id !== burst);
      s.players.p2.burst = burst;
      const atk = put(s, 'p1', DARIU, 1);
      s = act(endMain(s), { type: 'declareAttack', player: 'p1', attackerId: atk });
      s = passFlashes(s);
      s = act(s, { type: 'noBlock', player: 'p2' });
      s = passFlashes(s);
      s = choose(s, 0); // p2 เปิด Burst
      for (let i = 0; i < 5 && s.choice && s.choice.player === 'p2'; i++) {
        s = s.choice.kind === 'placeCores' ? choose(s, { pay: s.players.p2.reserve.slice(0, 1) }) : choose(s, s.choice.kind === 'option' ? 0 : null);
      }
      expect(s.choice?.player).toBe('p1');
      expect(s.choice?.kind === 'option' && s.choice.options[0]).toContain('อากุนิอัส');
      s = choose(s, 0);
      if (s.choice?.kind === 'placeCores') s = choose(s, { pay: s.players.p1.reserve.slice(0, 1) });
      expect(s.players.p1.field).toContain(aguni);
    });

    it('อากุนิอัส Lv1: เบิร์สของเราสั่งใช้ "หลังจากเราเสียไลฟ์" ได้ด้วย', () => {
      const s = p2Turn(setup());
      put(s, 'p1', no('เมียวโอเพลิงคราม อากุนิอัส'), 1);
      const burst = inHand(s, 'p1', no('ชูริเคนพันเล่ม')); // เงื่อนไขเดิม: หลังจากมือคู่แข่งเพิ่มขึ้น
      s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
      s.players.p1.burst = burst;
      const atk = put(s, 'p2', DARIU, 1);
      let x = act(endMain(s, 'p2'), { type: 'declareAttack', player: 'p2', attackerId: atk });
      x = passFlashes(x);
      x = act(x, { type: 'noBlock', player: 'p1' });
      x = passFlashes(x);
      expect(x.choice?.kind === 'option' && x.choice.options[0]).toBe('เปิด Burst');
    });
  });

  describe('กลไกแทรช (สีม่วง)', () => {
    function inTrash(s: GameState, player: PlayerId, name: string): string {
      const id = inHand(s, player, no(name));
      s.players[player].hand = s.players[player].hand.filter((x) => x !== id);
      s.players[player].trashCards.push(id);
      return id;
    }
    const reserveNormal = (s: GameState) => s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);

    it('"การ์ดนี้ในแทรชเราถือว่ามีคอสต์ N" และโคคุโกว (Attack Step): สปิริตมารต้องสาป/วิญญาณสมิงในแทรชคอสต์ 0', () => {
      const s = setup();
      const sanki = inTrash(s, 'p1', 'ชิคิงามิ ซันคิ');
      const naraku = inTrash(s, 'p1', 'ราชายักษ์ นาราคุ');
      expect(baseCost(s, db, sanki)).toBe(3);
      expect(baseCost(s, db, naraku)).toBe(4);
      put(s, 'p1', no('คาราคุโช โคคุโกว'), 1);
      expect(baseCost(s, db, sanki)).toBe(3); // Main Step: ยังไม่มีผล
      s.phase = 'attack';
      expect(baseCost(s, db, sanki)).toBe(0);
      expect(baseCost(s, db, naraku)).toBe(0);
    });

    it('ชิคิงามิออฟเดอะเดด: อัญเชิญจากแทรชโดยจ่ายคอสต์ในแทรช → ชุดะ Lv2 ส่งคอร์คู่แข่งจนเหลือ 1 เม็ด', () => {
      const s = setup();
      put(s, 'p1', no('นักพรตอสรพิษ ชุดะ'), 2);
      const target = put(s, 'p2', DARIU, 4);
      const sanki = inTrash(s, 'p1', 'ชิคิงามิ ซันคิ');
      let x = magic(s, 'ชิคิงามิออฟเดอะเดด');
      expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([sanki]);
      x = choose(x, sanki);
      expect(x.choice?.kind).toBe('payCost');
      const cost = x.choice?.kind === 'payCost' ? x.choice.cost : -1;
      expect(cost).toBe(payableCost(x, db, 'p1', db.get(no('ชิคิงามิ ซันคิ')), 3));
      x = choose(x, { pay: reserveNormal(x).slice(0, cost) });
      x = choose(x, { pay: reserveNormal(x).slice(0, 1) });
      expect(x.players.p1.field).toContain(sanki);
      expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([target]);
      x = choose(x, target);
      expect(x.cards[target]!.cores).toHaveLength(1);
    });

    it('ร็อคแฮนด์ Lv2: อัญเชิญสปิริตมารต้องสาปจากแทรชใน Main Step ได้ ต้องใช้ Soul Core ร่วมจ่าย', () => {
      const s = setup();
      put(s, 'p1', no('No.3 ร็อคแฮนด์'), 1);
      const bakusho = inTrash(s, 'p1', 'ยักษ์แดง บาคุโชว');
      const cost = payableCost(s, db, 'p1', db.get(no('ยักษ์แดง บาคุโชว')), baseCost(s, db, bakusho));
      const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
      const normal = reserveNormal(s);
      const noSoul = applyAction(s, { type: 'summon', player: 'p1', cardId: bakusho, payment: normal.slice(0, cost), placement: normal.slice(cost, cost + 1) }, db);
      expect(noSoul.ok).toBe(false);
      const x = act(s, { type: 'summon', player: 'p1', cardId: bakusho, payment: [soul, ...normal.slice(0, cost - 1)], placement: normal.slice(cost, cost + 1) });
      expect(x.players.p1.field).toContain(bakusho);
      expect(x.players.p1.trashCards).not.toContain(bakusho);
    });

    it('ไม่มีเอฟเฟกต์อนุญาต: อัญเชิญจากแทรชไม่ได้ (มุเมอิใน Main Step ก็ไม่ได้)', () => {
      const s = setup();
      const mumei = inTrash(s, 'p1', 'โยวจุทสึชิ มุเมอิ');
      const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
      const normal = reserveNormal(s);
      const r = applyAction(s, { type: 'summon', player: 'p1', cardId: mumei, payment: [soul, ...normal.slice(0, 5)], placement: normal.slice(5, 6) }, db);
      expect(r.ok).toBe(false);
    });
  });
});

describe('ความปลอดภัยของการคำนวณ', () => {
  it('สุ่มการ์ดลงสนามทั้งสองฝั่ง (ฝั่งละ 12 ใบ) ทุกเฟส/ทุกฝั่งเทิร์น: คำนวณ BP / เลเวล / คอสต์ ได้โดยไม่วนไม่จบ', () => {
    const all = db.all();
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 60; round++) {
      const s = setup();
      const ids: string[] = [];
      for (const p of ['p1', 'p2'] as const) {
        for (let i = 0; i < 12; i++) {
          const def = all[rand(all.length)]!;
          ids.push(def.type === 'magic' ? inHand(s, p, def.cardNo) : put(s, p, def.cardNo, 1 + rand(5), rand(2) === 0));
        }
        for (let i = 0; i < 3; i++) {
          const id = inHand(s, p, all[rand(all.length)]!.cardNo);
          s.players[p].hand = s.players[p].hand.filter((x) => x !== id);
          s.players[p].trashCards.push(id);
          ids.push(id);
        }
      }
      for (const phase of ['main', 'attack'] as const) {
        for (const turn of ['p1', 'p2'] as const) {
          s.phase = phase;
          s.turnPlayer = turn;
          for (const id of ids) {
            currentBp(s, db, id);
            cardLevel(s, db, id);
            payableCost(s, db, s.cards[id]!.owner, db.get(s.cards[id]!.cardNo), baseCost(s, db, id));
            matchesFilter(s, db, id, { maxCost: 5, maxBp: 5000 });
          }
          fieldSymbols(s, db, 'p1');
          fieldSymbols(s, db, 'p2');
        }
      }
    }
    expect(true).toBe(true);
    // เทสต์หนัก (สุ่มหลายร้อยสนาม) ปกติ 3–5 วิ: รันพร้อมไฟล์อื่นบางครั้งเกินค่าเริ่มต้น 5 วิ · วนไม่จบจริงจะค้างเกิน 20 วิอยู่ดี
  }, 20_000);
});
