import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS09Cards } from '@bs/cards';
import { applyAction, blockersFor, braveFits, cardFamilies, createGame, currentBp, gemColorCount, matchesFilter, payableCost, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `t9-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t9-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t9-card-${++seq}`;
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
const fails = (s: GameState, action: Action) => {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
};
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const optionIndex = (s: GameState, text: string) => (s.choice as { options: string[] }).options.findIndex((o) => o.includes(text));
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
/** p1 ใช้เมจิค [Flash] ในเมนสเต็ป (จ่ายด้วยคอร์ปกติ) */
const useMagic = (s: GameState, name: string) => {
  const m = card(s, 'p1', no(name), 'hand');
  const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
  return act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, cost), timing: 'flash' });
};
const summon = (s: GameState, cardId: string, place = 1) => {
  const cost = payableCost(s, db, 'p1', db.get(s.cards[cardId]!.cardNo));
  const res = normalCores(s);
  return act(s, { type: 'summon', player: 'p1', cardId, payment: res.slice(0, cost), placement: res.slice(cost, cost + place) });
};

describe('Booster Set 09', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์ (ยกเว้นที่ยังไม่รองรับ)', () => {
    const skip: Record<string, number[]> = {
      'เหล่าคนใกล้ชิด อุซชน': [1],
      'เหล่าคนใกล้ชิด จินเบร์': [1],
      'ขุนศึกมังกรทะเล อิกคาคุ': [2],
    };
    const cards = loadBS09Cards().all();
    expect(cards).toHaveLength(54);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => {
        if (skip[c.name]?.includes(i)) return;
        expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true);
      });
    }
  });

  it('ไดกิว-อาร์มส์: ร่วมร่างได้เฉพาะสปิริตที่ไม่มีข้อความเอฟเฟกต์', () => {
    const brave = db.get(no('ไดกิว-อาร์มส์'));
    expect(brave.braveCondition).toMatchObject({ noEffectText: true, bp: 6000 });
    expect(braveFits(brave, db.get(no('โคจิ คลื่นเล็ก')))).toBe(true);
    expect(braveFits(brave, db.get(no('อินทรีควันม่วง')))).toBe(false);
  });

  it('ฮังกรี้ทรี: ถูกทำลายโดยคู่แข่ง → ทิ้งการ์ดในมือคู่แข่งแบบสุ่ม (มือยังเหลือ 5 ใบขึ้นไป = ทิ้งเพิ่ม 2)', () => {
    let s = setup();
    const tree = put(s, 'p2', no('ฮังกรี้ทรี'), 1);
    for (let i = 0; i < 4; i++) card(s, 'p1', DARIU, 'hand');
    const before = s.players.p1.hand.length;
    s = useMagic(s, 'เฟลมมังกรคลั่ง');
    if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, tree);
    expect(s.players.p2.trashCards).toContain(tree);
    const after1 = before - 1;
    expect(s.players.p1.hand.length).toBe(after1 >= 5 ? after1 - 2 : after1);
  });

  it('โอโทโนะซามะ: มีโซลคอร์ = ได้รับเผ่า [ผู้เป็นนาย]', () => {
    const s = setup();
    const a = put(s, 'p1', no('โอโทโนะซามะ'), 2, true);
    const b = put(s, 'p1', no('โอโทโนะซามะ'), 2);
    expect(cardFamilies(s, db, a)).toContain('ผู้เป็นนาย');
    expect(matchesFilter(s, db, a, { family: 'ผู้เป็นนาย' })).toBe(true);
    expect(matchesFilter(s, db, b, { family: 'ผู้เป็นนาย' })).toBe(false);
  });

  it('โนโคกิริวูล์ฟ: ชนะและทำลายจากการเทียบ BP → ทำลายสปิริตคู่แข่งคอสต์ไม่เกินผู้โจมตี', () => {
    let s = setup();
    const wolf = put(s, 'p1', no('โนโคกิริวูล์ฟ'), 4);
    const blk = put(s, 'p2', DARIU, 1);
    const target = put(s, 'p2', DARIU, 1);
    s = passAll(attack(s, wolf));
    s = passAll(act(s, { type: 'declareBlock', player: 'p2', blockerId: blk }));
    expect(s.players.p2.trashCards).toContain(blk);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    s = choose(s, target);
    expect(s.players.p2.trashCards).toContain(target);
  });

  it('สุสานของจักรพรรดิมาร: คอร์ 1 เม็ดโจมตีไม่ได้ · Lv2 ต้องส่งคอร์ 2 เม็ดของผู้โจมตีลงแทรช', () => {
    let s = setup();
    put(s, 'p2', no('สุสานของจักรพรรดิมาร'), 0);
    const one = put(s, 'p1', DARIU, 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(fails(s, { type: 'declareAttack', player: 'p1', attackerId: one })).toBe('CANNOT_ATTACK');

    let t = setup();
    put(t, 'p2', no('สุสานของจักรพรรดิมาร'), 3);
    const atk = put(t, 'p1', DARIU, 4);
    const trash = t.players.p1.trashCores.length;
    t = attack(t, atk);
    expect(t.cards[atk]!.cores).toHaveLength(2);
    expect(t.players.p1.trashCores.length).toBe(trash + 2);
    expect(t.battle?.attackerId).toBe(atk);
  });

  it('สุสานของจักรพรรดิมาร Lv2: ผู้โจมตีมีโซลคอร์ = เลือกได้ว่าจะจ่ายโซลคอร์ด้วยหรือไม่ แล้วโจมตีต่อ', () => {
    let s = setup();
    put(s, 'p2', no('สุสานของจักรพรรดิมาร'), 3);
    const atk = put(s, 'p1', DARIU, 4, true);
    const soul = s.cards[atk]!.cores.find((c) => s.cores[c]!.isSoul)!;
    s = attack(s, atk);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    expect(s.battle).toBeFalsy();
    s = choose(s, optionIndex(s, 'ส่ง Soul Core'));
    expect(s.players.p1.trashCores).toContain(soul);
    expect(s.cards[atk]!.cores).toHaveLength(2);
    expect(s.battle?.attackerId).toBe(atk);
  });

  it('โกคิ Lv1: นับสปิริตเผ่า [อสูรราตรี]/[มารต้องสาป]/[วิญญาณสมิง] ของทั้งสองฝ่าย', () => {
    let s = setup();
    const goki = put(s, 'p1', no('โกคิ'), 1); // ข้ารับใช้/มารต้องสาป → นับตัวเอง 1
    put(s, 'p2', no('อินทรีควันม่วง'), 1); // วิญญาณสมิง (ฝั่งคู่แข่ง) → 1
    const victim = put(s, 'p2', DARIU, 5);
    s = attack(s, goki);
    // ส่งคอร์ 1 เม็ด × 2 (โกคิ + อินทรีควันม่วงของคู่แข่ง) → แบ่งคอร์ทีเดียว
    expect(s.choice).toMatchObject({ kind: 'distribute', player: 'p1' });
    expect((s.choice as { total: number }).total).toBe(2);
    s = choose(s, { alloc: { [victim]: 2 } });
    expect(s.cards[victim]!.cores.length).toBe(3);
  });

  it('เหล่าคนใกล้ชิด: อัลติเมทหกขุนศึกเซ็นโงคุอัญเชิญได้โดยไม่สนเงื่อนไข เมื่อใช้โซลคอร์ร่วมจ่าย', () => {
    const s = setup();
    put(s, 'p1', no('เหล่าคนใกล้ชิด เฮล-สคัล'), 1);
    const tidal = card(s, 'p1', no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[tidal]!.cardNo));
    const res = normalCores(s);
    const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
    // ไลฟ์ 5 (เงื่อนไข: ไลฟ์ไม่เกิน 3) ไม่ใช้โซลคอร์ = อัญเชิญไม่ได้
    expect(fails(s, { type: 'summon', player: 'p1', cardId: tidal, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) })).toBe('SUMMON_CONDITION');
    const t = act(s, { type: 'summon', player: 'p1', cardId: tidal, payment: [soul, ...res.slice(0, cost - 1)], placement: res.slice(cost - 1, cost) });
    expect(t.players.p1.field).toContain(tidal);
  });

  it('จินเบร์ Lv2 (มีไทดัล-บลู): แอทแท็คสเต็ปของเรา คู่แข่งต้องจ่ายเพิ่ม 3 เพื่อสั่งใช้เบิร์ส/ใช้เมจิค', () => {
    let s = setup();
    put(s, 'p1', no('เหล่าคนใกล้ชิด จินเบร์'), 2);
    put(s, 'p1', no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'), 3);
    const atk = put(s, 'p1', DARIU, 1);
    const decoy = put(s, 'p1', DARIU, 3); // เป้าของคำสาปบงการชีพ
    const burst = `t9-burst-${++seq}`;
    s.cards[burst] = { id: burst, cardNo: no('คำสาปบงการชีพ'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p2.burst = burst;
    const reserve = s.players.p2.reserve.length;
    s = attack(s, atk);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    expect((s.choice as { options: string[] }).options.some((o) => o.includes('จ่ายคอสต์เพิ่ม 3'))).toBe(true);
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p2', cost: 3 });
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 3) });
    expect(s.players.p2.reserve.length).toBe(reserve - 3);
    expect(s.players.p2.burst).toBeNull();
    // เมจิคในช่วงแฟลช: จ่ายแค่คอสต์ปกติไม่ได้
    // ทำเบิร์สให้จบ (เลือกเป้าตัวแรก / ไม่จ่ายแฟลชต่อ)
    for (let i = 0; i < 10 && s.choice; i++) {
      const c = s.choice as { kind: string; candidates?: string[]; options?: string[] };
      s = choose(s, c.kind === 'card' ? (c.candidates!.includes(decoy) ? decoy : c.candidates![0]!) : c.kind === 'option' ? c.options!.length - 1 : null);
    }
    const m = card(s, 'p2', no('เฟลมมังกรคลั่ง'), 'hand');
    const c = payableCost(s, db, 'p2', db.get(s.cards[m]!.cardNo));
    expect(s.battle?.flash?.priority).toBe('p2');
    {
      expect(fails(s, { type: 'useMagic', player: 'p2', cardId: m, payment: normalCores(s, 'p2').slice(0, c), timing: 'flash' })).toBe('WRONG_PAYMENT');
    }
  });

  it('เน็กซัสในแทรช (No.1 นอร์ธซีโรด) ไม่ทำงานเมื่อสปิริตของเราถูกอัญเชิญ', () => {
    let s = setup();
    card(s, 'p1', no('No.1 นอร์ธซีโรด'), 'trashCards');
    const white = db.all().find((c) => c.type === 'spirit' && c.colors.includes('white') && c.cost <= 3 && c.effects.length === 0)!;
    const id = card(s, 'p1', white.cardNo, 'hand');
    s = summon(s, id);
    expect(s.cards[id]!.cores).toHaveLength(1);
  });

  it('เมียวโอสยบมาร: การ์ดในแทรชไม่รับผลเอฟเฟกต์ (นำกลับขึ้นมือไม่ได้)', () => {
    const run = (lock: boolean) => {
      let s = setup();
      if (lock) put(s, 'p1', no('เมียวโอสยบมาร'), 1);
      card(s, 'p1', no('อินทรีควันม่วง'), 'trashCards');
      s = useMagic(s, 'จุติจอมมารสวรรค์');
      return s.choice?.kind === 'card';
    };
    expect(run(false)).toBe(true);
    expect(run(true)).toBe(false);
  });

  it('ไดบีท Lv2: ต้องป้องกันด้วยสปิริต 2 ตัว แล้วผู้โจมตีเลือกสู้ 1 ตัว', () => {
    let s = setup();
    const daibeat = put(s, 'p1', no('นินจาแห่งแผ่นดิน ไดบีท'), 3);
    const b1 = put(s, 'p2', DARIU, 1);
    s = passAll(attack(s, daibeat));
    expect(blockersFor(s, db, 'p2')).toEqual([]);

    let t = setup();
    const d2 = put(t, 'p1', no('นินจาแห่งแผ่นดิน ไดบีท'), 3);
    const x1 = put(t, 'p2', DARIU, 1);
    const x2 = put(t, 'p2', DARIU, 1);
    t = passAll(attack(t, d2));
    t = act(t, { type: 'declareBlock', player: 'p2', blockerId: x1 });
    expect(fails(t, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    t = act(t, { type: 'declareBlock', player: 'p2', blockerId: x2 });
    expect(t.choice).toMatchObject({ kind: 'card', player: 'p1' });
    void b1;
  });

  it('ก็อด-เซคส์ รูปแบบที่ศูนย์: Six Heaven Rush (เจ็ม 2 สี) ทำลายสปิริตเสื่อมสภาพของคู่แข่ง', () => {
    const run = (withRed: boolean) => {
      let s = setup();
      if (withRed) put(s, 'p1', DARIU, 1);
      put(s, 'p2', DARIU, 1, false, 'exhausted');
      const god = card(s, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบที่ศูนย์-'), 'hand');
      s = summon(s, god);
      expect(gemColorCount(s, db, 'p1')).toBe(withRed ? 2 : 1);
      return s.choice?.kind === 'card' && s.choice.player === 'p1';
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  it('ต้นไม้แห่งนักปราชญ์: เทียบ BP ได้ BP+1000 ต่อสปิริตเสื่อมสภาพของเรา', () => {
    let s = setup();
    put(s, 'p1', no('ต้นไม้แห่งนักปราชญ์ที่ถูกซ่อนไว้'), 0);
    put(s, 'p1', DARIU, 1, false, 'exhausted');
    put(s, 'p1', DARIU, 1, false, 'exhausted');
    const atk = put(s, 'p1', DARIU, 1);
    s = attack(s, atk);
    // เสื่อมสภาพ 3 ตัว (รวมผู้โจมตี) → BP 3000 + 3000
    expect(currentBp(s, db, atk)).toBe(6000);
  });

  it('โกคิ: อยู่ในแทรช อัญเชิญได้ในเอนด์สเต็ปของเรา (คอสต์ 5)', () => {
    let s = setup();
    const goki = card(s, 'p1', no('โกคิ'), 'trashCards');
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'endAttackStep', player: 'p1' });
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    expect((s.choice as { candidates: string[] }).candidates).toContain(goki);
  });

  it('เซ็นคิ: ในแทรช เมื่อ "โกคิ" ของเราถูกอัญเชิญ → อัญเชิญเซ็นคิจากแทรชได้', () => {
    let s = setup();
    const senki = card(s, 'p1', no('เซ็นคิ'), 'trashCards');
    const goki = card(s, 'p1', no('โกคิ'), 'hand');
    s = summon(s, goki);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    expect((s.choice as { candidates: string[] }).candidates).toContain(senki);
  });

  it('โทวโดว (ในมือ): โซลคอร์ของคู่แข่งถูกส่งลงแทรช → อัญเชิญไม่จ่ายคอสต์ได้', () => {
    let s = setup();
    const todo = card(s, 'p2', no('ผู้นำนินจาเขี้ยวพิศวง โทวโดว'), 'hand');
    // p1 จ่ายคอสต์ด้วยโซลคอร์ (โซลคอร์ลงแทรชของ p1)
    const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
    const m = card(s, 'p1', no('อินทรีควันม่วง'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
    const rest = normalCores(s);
    s = act(s, { type: 'summon', player: 'p1', cardId: m, payment: [soul, ...rest.slice(0, cost - 1)], placement: rest.slice(cost - 1, cost) });
    expect(s.players.p1.trashCores).toContain(soul);
    while (s.choice && s.choice.player === 'p1') s = choose(s, s.choice.kind === 'option' ? 0 : null);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'อัญเชิญ'));
    // เข้าสู่การวางคอร์เพื่ออัญเชิญโทวโดว
    expect(s.choice?.player).toBe('p2');
    expect(s.choice?.kind).not.toBe('option');
    expect(s.players.p2.hand).toContain(todo);
  });

  it('ชิโรนากัส (เบิร์ส): ทำลายสปิริตที่ไม่ใช่เผ่า [ผู้เป็นนาย]/[สมิงหัว] ทั้งหมด', () => {
    let s = setup();
    const burst = `t9-burst-${++seq}`;
    s.cards[burst] = { id: burst, cardNo: no('ไดเมียวเจ็ดดาบสมุทร ชิโรนากัส'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p2.burst = burst;
    const victim = put(s, 'p2', DARIU, 1);
    const gomafu = put(s, 'p2', no('นักรบธารน้ำแข็ง โกมาฟุ'), 1);
    const mine = put(s, 'p1', DARIU, 1);
    s = useMagic(s, 'เฟลมมังกรคลั่ง');
    if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, victim);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    expect(s.players.p1.trashCards).toContain(mine);
    expect(s.players.p2.field).toContain(gomafu);
  });
});
