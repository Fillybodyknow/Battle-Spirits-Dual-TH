import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS19Cards } from '@bs/cards';
import { applyAction, createGame, opponentOf, type Action, type GameState, type PlayerId } from '../src';
import { attackReserveTaxFor, braveFits, canAttackWith, currentBp, fieldCost, noRefreshSource, payableCost, summonBanned } from '../src/rules';

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
  const id = `t19-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t19-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t19-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
  return id;
}
/** เบรฟร่วมร่างกับ host */
function brave(s: GameState, host: string, cardNo: string): string {
  const id = `t19-card-${++seq}`;
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
    else if (c.kind === 'multiSummon') s = choose(s, { summons: [{ cardId: c.candidates.find((x) => prefer.includes(x)) ?? c.candidates[0]!, cores: s.players[c.player].reserve.slice(0, 1) }] } as never);
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

describe('Booster Set 19 (เขียว)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS19Cards().all();
    expect(cards.length).toBeGreaterThanOrEqual(16);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('ฟ็อกซ์สตาร์ Trigger Counter: เสื่อมสภาพอัลติเมทคู่แข่ง · การ์ดที่ฮิตเป็นการ์ดสปิริต = Guard (ผลฮิตไม่ทำงาน)', () => {
    for (const [topNo, guarded] of [
      [DARIU, true],
      [no('ไฮเพรสเชอร์'), false],
    ] as const) {
      let s = setup();
      const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
      put(s, 'p1', DARIU, 1);
      const victim = put(s, 'p2', DARIU, 1);
      card(s, 'p2', no('เกราะดาวพสุธา ฟ็อกซ์สตาร์'), 'hand');
      top(s, 'p2', topNo); // คอสต์ 1 / 4 ≤ 4 = Critical Hit (ทำลาย BP ไม่เกิน 12000)
      s = attack(toAttack(s), nova);
      s = option(s, 'ใช้ Trigger Counter');
      s = settle(s, [victim]);
      expect(s.players.p2.field.includes(victim)).toBe(guarded);
    }
  });

  it('ไฮเพรสเชอร์ Trigger Counter: อัลติเมทที่ต่อสู้ฟื้นสภาพไม่ได้ (ล็อก) · ฮิตการ์ดสปิริต = Guard', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    put(s, 'p1', DARIU, 1);
    const victim = put(s, 'p2', DARIU, 1);
    card(s, 'p2', no('ไฮเพรสเชอร์'), 'hand');
    top(s, 'p2', DARIU);
    s = attack(toAttack(s), nova);
    s = option(s, 'ใช้ Trigger Counter');
    s = settle(s, [victim]);
    expect((s.refreshLocksUntilAttack ?? []).map((l) => l.cardId)).toContain(nova);
    // ฟื้นสภาพไม่ได้ทั้งในรีเฟรชสเต็ปและด้วยเอฟเฟกต์ (เช่น ในเมนสเต็ป) จนถึงแอทแท็คสเต็ปครั้งถัดไปของ p1
    expect(noRefreshSource(s, db, nova, true)).not.toBeNull();
    expect(noRefreshSource(s, db, nova, false)).not.toBeNull();
    // เดินจนถึงเทิร์นถัดไปของ p1: รีเฟรชสเต็ปยังฟื้นไม่ได้ · เริ่มแอทแท็คสเต็ปของ p1 = ล็อกหมด
    const pass = (x: GameState) => {
      for (let i = 0; i < 30 && x.battle; i++) {
        if (x.battle.flash) x = settle(act(x, { type: 'passFlash', player: x.battle.flash.priority }));
        else x = settle(act(x, { type: 'noBlock', player: opponentOf(x.turnPlayer) } as Action));
      }
      return x;
    };
    s = pass(s);
    s = settle(act(s, { type: 'endAttackStep', player: 'p1' }));
    s = settle(act(s, { type: 'endMain', player: 'p2' }));
    s = settle(act(s, { type: 'endAttackStep', player: 'p2' }));
    expect(s.turnPlayer).toBe('p1');
    expect(s.phase).toBe('main');
    expect(s.cards[nova]!.state).toBe('exhausted');
    s = settle(act(s, { type: 'endMain', player: 'p1' }));
    expect(s.refreshLocksUntilAttack ?? []).toEqual([]);
    expect(s.players.p2.field).toContain(victim);
  });

  it('ซิลบาร์ ยันมะ: มนุษย์แมลง/แมลงดาบของเราถูกทำลายโดยเอฟเฟกต์คู่แข่ง → กลับขึ้นมือ + คอร์จากวอยด์ไปรีเสิร์ฟ', () => {
    let s = setup();
    put(s, 'p2', no('ซิลบาร์ ยันมะ'), 1);
    const bug = put(s, 'p2', no('สึรุกิมุคาเดะ'), 1); // BP 1000
    const reserve = s.players.p2.reserve.length;
    const allo = put(s, 'p1', no('อัลโลเบลดเดอร์'), 1);
    s = settle(attack(toAttack(s), allo), [bug]);
    expect(s.players.p2.hand).toContain(bug);
    expect(s.players.p2.reserve.length).toBe(reserve + 2); // คอร์บนการ์ด 1 + วอยด์ 1
  });

  it('ชิโรคาบุโตะ: แอทแท็คสเต็ปของคู่แข่ง อัลติเมทของคู่แข่งคอสต์ -2 (U Trigger เทียบคอสต์ต่ำลง)', () => {
    const s = setup();
    put(s, 'p2', no('นักพรตเปลือก ชิโรคาบุโตะ'), 1);
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    expect(fieldCost(s, db, nova)).toBe(8);
    s.phase = 'attack';
    expect(fieldCost(s, db, nova)).toBe(6);
  });

  it('อัลติเมทวินด์: ในเทิร์นนี้ อัลติเมทของเราเสื่อมสภาพ (โจมตี) → เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
    put(s, 'p1', DARIU, 2);
    const victim = put(s, 'p2', DARIU, 1);
    s.turnTriggers = [{ player: 'p1', turn: s.turn, on: 'allyUltExhausted', steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: ['spirit', 'brave'] } }], sourceId: ult, paidWithSoul: false }];
    top(s, 'p2', no('อัลติเมท ซีคเวิร์ม โนวา'));
    s = settle(attack(toAttack(s), ult), [victim]);
    expect(s.cards[victim]!.state).toBe('exhausted');
  });

  it('เรกิออส [ร่วมร่าง]: ชนะการต่อสู้โดยทำลายแต่อัลติเมท = ฟื้นสภาพ (ทำลายสปิริต = ไม่ฟื้น)', () => {
    for (const [ultBlock, refreshed] of [
      [true, true],
      [false, false],
    ] as const) {
      let s = setup();
      const reg = put(s, 'p1', no('ขุนพลเปลือกดาบ เรกิออส'), 5); // Lv3 BP 10000 + เบรฟ 7000
      brave(s, reg, no('เกราะดาวคนโท เบรฟอควาเรียส'));
      const blocker = ultBlock ? put(s, 'p2', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1) : put(s, 'p2', DARIU, 1);
      s = settle(attack(toAttack(s), reg));
      while (s.battle?.flash) s = settle(act(s, { type: 'passFlash', player: s.battle.flash.priority }));
      s = settle(act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker }));
      while (s.battle?.flash) s = settle(act(s, { type: 'passFlash', player: s.battle.flash.priority }));
      expect(s.players.p2.field).not.toContain(blocker);
      expect(s.cards[reg]!.state).toBe(refreshed ? 'refresh' : 'exhausted');
    }
  });
});

describe('Booster Set 19 (เหลือง)', () => {
  const passFlashes = (x: GameState) => {
    while (x.battle?.flash) x = settle(act(x, { type: 'passFlash', player: x.battle.flash.priority }));
    return x;
  };

  it('อิลลูชันมิเรอร์ Trigger Counter: "คู่แข่ง" ในผลฮิตกลายเป็น "เรา" (Critical Hit ของโนวาทำลายสปิริตของผู้โจมตีเอง)', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    const own = put(s, 'p1', DARIU, 1);
    const theirs = put(s, 'p2', DARIU, 1);
    card(s, 'p2', no('อิลลูชันมิเรอร์'), 'hand');
    top(s, 'p2', DARIU);
    s = attack(toAttack(s), nova);
    s = option(s, 'ใช้ Trigger Counter');
    s = pay(s);
    s = settle(s, [own]);
    expect(s.players.p2.field).toContain(theirs);
    expect(s.players.p1.field).not.toContain(own);
  });

  it('เชนจ์ลิง: ฝั่งเราเทียบ BP ด้วยอัลติเมทของเราที่ระบุแทน (ผู้ป้องกัน BP 3000 ชนะผู้โจมตี BP 6000)', () => {
    let s = setup();
    const atk = put(s, 'p1', no('แทงก์โมบิล เลโอพาร์ด'), 3); // Lv2 BP 6000
    const blocker = put(s, 'p2', DARIU, 1);
    const ult = put(s, 'p2', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1); // BP 10000
    void ult;
    const ch = card(s, 'p2', no('เชนจ์ลิง'), 'hand');
    s = passFlashes(settle(attack(toAttack(s), atk)));
    s = settle(act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker }));
    while (s.battle?.flash && s.battle.flash.priority !== 'p2') s = settle(act(s, { type: 'passFlash', player: s.battle.flash.priority }));
    const cost = payableCost(s, db, 'p2', db.get(no('เชนจ์ลิง')));
    s = act(s, { type: 'useMagic', player: 'p2', cardId: ch, timing: 'flash', payment: s.players.p2.reserve.slice(0, cost) } as Action);
    s = passFlashes(settle(s, [ult]));
    expect(s.players.p2.field).toContain(blocker);
    expect(s.players.p1.field).not.toContain(atk);
  });

  it('เคทอส [ร่วมร่าง]: ถูกอัลติเมทป้องกัน → นำเบรฟกลับขึ้นมือ ถือว่าไม่ถูกป้องกัน (ไลฟ์คู่แข่งลด)', () => {
    let s = setup();
    const cetus = put(s, 'p1', no('สัตว์ทะเล เคทอส'), 2); // Lv2
    const br = brave(s, cetus, no('เกราะดาวคนโท เบรฟอควาเรียส'));
    const ult = put(s, 'p2', no('อัลติเมท ซีคเวิร์ม โนวา'), 3); // BP 20000
    const life = s.players.p2.life.length;
    s = passFlashes(settle(attack(toAttack(s), cetus)));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: ult });
    s = option(s, 'นำเบรฟของสปิริตนี้');
    s = passFlashes(settle(s));
    expect(s.players.p1.hand).toContain(br);
    expect(s.players.p1.field).toContain(cetus);
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('วาร์โกเบรฟ (ร่วมร่าง): แอทแท็คสเต็ปของคู่แข่ง อัลติเมทคอสต์ 2/3/5/7 ของคู่แข่งโจมตีไม่ได้', () => {
    const s = setup();
    const host = put(s, 'p2', DARIU, 1);
    brave(s, host, no('เกราะดาวกันย์ วาร์โกเบรฟ'));
    const c5 = put(s, 'p1', no('อาชาสวรรค์ศักดิ์สิทธิ์ สกาย'), 1); // คอสต์ 5
    const c8 = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 1); // คอสต์ 8
    s.phase = 'attack';
    expect(canAttackWith(s, db, c5)).toBe(false);
    expect(canAttackWith(s, db, c8)).toBe(true);
  });

  it('เอคิดนา: แอทแท็คสเต็ป ใช้ Trigger Counter ของเมจิคได้โดยไม่จ่ายคอสต์', () => {
    let s = setup();
    const nova = put(s, 'p1', no('อัลติเมท ซีคเวิร์ม โนวา'), 3);
    put(s, 'p1', DARIU, 1);
    put(s, 'p2', no('เทพธิดาสัตว์มายา เอคิดนา'), 1);
    const ball = card(s, 'p2', no('แคนนอนบอล'), 'hand');
    top(s, 'p2', DARIU);
    const reserve = s.players.p2.reserve.length;
    s = attack(toAttack(s), nova);
    s = option(s, 'ใช้ Trigger Counter');
    expect(s.choice?.kind).not.toBe('payCost');
    s = settle(s);
    expect(s.players.p1.field).not.toContain(nova);
    expect(s.players.p2.trashCards).toContain(ball);
    expect(s.players.p2.reserve.length).toBeGreaterThanOrEqual(reserve);
  });

  it('เนินโซลูจ Lv2: สปิริตของเราจะสูญสลายโดยคู่แข่ง → "สามารถ" นำคอร์ไลฟ์ 1 เม็ดมาวาง อยู่ต่อแบบฟื้นสภาพ (เลือกไม่ใช้ = สูญสลาย)', () => {
    for (const use of [true, false]) {
      let s = setup();
      put(s, 'p2', no('เนินโซลูจ'), 1);
      const victim = put(s, 'p2', DARIU, 1);
      const life = s.players.p2.life.length;
      const kil = card(s, 'p1', no('อัศวินนรก คิลเมดีส'), 'hand');
      const cost = payableCost(s, db, 'p1', db.get(no('อัศวินนรก คิลเมดีส')));
      s = act(s, { type: 'summon', player: 'p1', cardId: kil, payment: s.players.p1.reserve.slice(0, cost), placement: s.players.p1.reserve.slice(cost, cost + 1) } as Action);
      if (s.choice?.kind === 'card') s = choose(s, victim);
      s = option(s, 'ไม่นำกลับ');
      // ถามเจ้าของ (p2) ก่อนสูญสลาย: ระหว่างนี้ยังอยู่บนสนาม
      expect(s.choice?.player).toBe('p2');
      expect(s.players.p2.field).toContain(victim);
      s = option(s, use ? 'นำคอร์ไลฟ์ 1 เม็ด' : 'ไม่ใช้');
      s = settle(s);
      expect(s.players.p2.field.includes(victim)).toBe(use);
      expect(s.players.p2.life.length).toBe(use ? life - 1 : life);
      if (use) expect(s.cards[victim]!.state).toBe('refresh');
    }
  });

  it('มาริกะ: ถูกทำลายโดยคู่แข่ง → เปิด 5 ใบ เมจิคขึ้นมือ อัญเชิญอัลติเมท [คนธรรพ์] ได้ 1 ใบ', () => {
    let s = setup();
    const marika = put(s, 'p2', no('นักร้องนาเดชิโกะ มาริกะ'), 1);
    s.cards[marika]!.turnBp = -1000; // BP 3000
    const ult = db.all().find((c) => c.type === 'ultimate' && c.family.includes('คนธรรพ์'))!;
    const u = top(s, 'p2', ult.cardNo);
    const m = top(s, 'p2', no('แคนนอนบอล'));
    const allo = put(s, 'p1', no('อัลโลเบลดเดอร์'), 1);
    s = settle(attack(toAttack(s), allo), [marika, u]);
    expect(s.players.p2.hand).toContain(m);
    expect(s.players.p2.field).toContain(u);
  });
});

describe('Booster Set 19 (ฟ้า)', () => {
  it('เบรฟอาร์โก: ร่วมร่างได้เฉพาะสปิริตที่มี Summon Bolt · Trigger Counter ทำลายอัลติเมทคอสต์ 6/7 ที่กำลังต่อสู้', () => {
    const argo = db.get(no('เกราะดาวนาวา เบรฟอาร์โก'));
    expect(braveFits(argo, db.get(no('รองกัปตัน เชสเตอร์')))).toBe(true);
    expect(braveFits(argo, db.get(no('นักดาบแมว เบอร์แมน')))).toBe(false);
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1); // คอสต์ 7
    put(s, 'p1', DARIU, 1);
    put(s, 'p2', no('รองกัปตัน เชสเตอร์'), 1);
    card(s, 'p2', no('เกราะดาวนาวา เบรฟอาร์โก'), 'hand');
    top(s, 'p2', DARIU);
    s = attack(toAttack(s), ult);
    s = option(s, 'ใช้ Trigger Counter');
    s = settle(s);
    expect(s.players.p1.field).not.toContain(ult);
  });

  it('อิมแพคโรอาร์: ทำลายอัลติเมทที่ต่อสู้ ถ้าคอสต์ไม่เกิน คอสต์การ์ดที่ฮิต +3', () => {
    for (const [topNo, killed] of [
      [no('ซิลบาร์ ยันมะ'), true], // คอสต์ 4: 4+3 = 7 ≥ 7
      [DARIU, false], // คอสต์ 1: 1+3 = 4 < 7
    ] as const) {
      let s = setup();
      const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
      put(s, 'p1', DARIU, 1);
      put(s, 'p2', DARIU, 1);
      card(s, 'p2', no('อิมแพคโรอาร์'), 'hand');
      top(s, 'p2', topNo);
      s = attack(toAttack(s), ult);
      s = option(s, 'ใช้ Trigger Counter');
      s = settle(s);
      expect(s.players.p1.field.includes(ult)).toBe(!killed);
    }
  });

  it('เอ็ดเวิร์ด [ร่วมร่าง]: ทิ้งเด็คคู่แข่ง 1 ใบ → คู่แข่งใช้การ์ดสีเดียวกันในมือไม่ได้ (เทิร์นนี้)', () => {
    let s = setup();
    const ed = put(s, 'p1', no('ขุนพลโจรสลัด เอ็ดเวิร์ด'), 2); // Lv2
    brave(s, ed, no('เกราะดาวคนโท เบรฟอควาเรียส'));
    top(s, 'p2', DARIU); // สีแดง
    s = settle(attack(toAttack(s), ed));
    expect(summonBanned(s, db, 'p2', db.get(DARIU))).toBe(true);
    expect(summonBanned(s, db, 'p2', db.get(no('ซิลบาร์ ยันมะ')))).toBe(false);
  });

  it('ทะเลสายฟ้า Lv2: อัลติเมทของคู่แข่งโจมตีต้องส่งคอร์รีเสิร์ฟ 2 เม็ด (สปิริตไม่ต้อง)', () => {
    const s = setup();
    put(s, 'p2', no('ทะเลสายฟ้า'), 1);
    const ult = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1);
    const sp = put(s, 'p1', DARIU, 1);
    s.phase = 'attack';
    expect(attackReserveTaxFor(s, db, ult).cores).toBe(2);
    expect(attackReserveTaxFor(s, db, sp).cores).toBe(0);
  });

  it('ไลโอดราส: U Trigger ฮิต ทำลายสปิริตคอสต์สูงสุดของคู่แข่ง · คอสต์ 8 ขึ้นไป = ไลฟ์คู่แข่ง -1', () => {
    let s = setup();
    const lio = put(s, 'p1', no('ราชาสมิงรุ่นใหม่ ไลโอดราส'), 1);
    put(s, 'p1', DARIU, 1);
    const big = put(s, 'p2', no('โอนิกซ์ดราก้อน ไรเดอร์'), 1); // คอสต์ 8
    put(s, 'p2', DARIU, 1);
    top(s, 'p2', DARIU);
    const life = s.players.p2.life.length;
    s = settle(attack(toAttack(s), lio));
    expect(s.players.p2.field).not.toContain(big);
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('นายท้ายเรือ ไอแซค Lv2: ถูกทำลายโดยคู่แข่ง → Summon Bolt ทำงาน (อัญเชิญเผ่าเดียวกันคอสต์ 4/5 จากมือ)', () => {
    let s = setup();
    const isaac = put(s, 'p2', no('นายท้ายเรือ ไอแซค'), 2); // Lv2 BP 3000
    const chester = card(s, 'p2', no('รองกัปตัน เชสเตอร์'), 'hand'); // วิญญาณนักรบ คอสต์ 4
    const allo = put(s, 'p1', no('อัลโลเบลดเดอร์'), 1);
    s = settle(attack(toAttack(s), allo), [isaac, chester]);
    expect(s.players.p2.field).not.toContain(isaac);
    expect(s.players.p2.field).toContain(chester);
  });

  it('เบอร์แมน Lv2: โจมตี → BP+ เท่ากับ BP รวมของอัลติเมทของเราที่เสื่อมสภาพ', () => {
    let s = setup();
    const bm = put(s, 'p1', no('นักดาบแมว เบอร์แมน'), 3); // Lv2 BP 7000
    const u = put(s, 'p1', no('อัลติเมท เอ็กซ์-คาลิบัส'), 1); // BP 10000
    s.cards[u]!.state = 'exhausted';
    s = settle(attack(toAttack(s), bm));
    expect(currentBp(s, db, bm)).toBe(17000);
  });

  it('ธันเดอร์แทคติกส์: ในแทรช กลับขึ้นมือตอนเอนด์สเต็ปของเรา (เทิร์นละ 1 ใบ)', () => {
    let s = setup();
    const a = card(s, 'p1', no('ธันเดอร์แทคติกส์'), 'trashCards');
    const b = card(s, 'p1', no('ธันเดอร์แทคติกส์'), 'trashCards');
    s = settle(act(s, { type: 'endMain', player: 'p1' }));
    s = settle(act(s, { type: 'endAttackStep', player: 'p1' }));
    const back = [a, b].filter((x) => s.players.p1.hand.includes(x));
    expect(back.length).toBe(1);
  });
});

