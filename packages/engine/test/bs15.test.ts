import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS15Cards, type Step } from '@bs/cards';
import { applyAction, blockersFor, canAttackWith, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `t15-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `t15-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t15-card-${++seq}`;
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
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
/** อัญเชิญจากมือ: จ่ายคอสต์ตามจริง (หักลดคอสต์) + วางคอร์ 1 เม็ด */
const summon = (s: GameState, cardId: string) => {
  const cost = payableCost(s, db, 'p1', db.get(s.cards[cardId]!.cardNo));
  const res = normalCores(s);
  return act(s, { type: 'summon', player: 'p1', cardId, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) });
};
/** ตัวเลือกตามข้อความ (ไม่เจอ = ตัวแรก) */
const pickOption = (s: GameState, text: string) => {
  const c = s.choice!;
  if (c.kind !== 'option') throw new Error('ไม่ใช่ตัวเลือก: ' + c.kind);
  const i = c.options.findIndex((o) => o.includes(text));
  return choose(s, Math.max(0, i));
};

describe('Booster Set 15 (เขียว)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS15Cards().all();
    expect(cards).toHaveLength(60);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('บีฮีมอธ ซีดาร์ Lv2: ถ้าจะป้องกันด้วยสปิริต ต้องป้องกัน 2 ตัว แล้วต่อสู้ตัวเดียว', () => {
    let s = setup();
    const cedar = put(s, 'p1', no('สัตว์พันปี บีฮีมอธ ซีดาร์'), 2);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = passAll(attack(s, cedar));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: a });
    // ตัวเดียวไม่พอ: ต้องประกาศตัวที่ 2
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: b });
    expect(s.battle!.blockers).toHaveLength(2);
  });

  it('ไนท์อีเกิล Lv2: สปิริตร่างแยกของเรา BP ของ Lv1 = 11000', () => {
    const s = setup();
    const eagle = put(s, 'p1', no('ไนท์อีเกิล'), 1);
    const clone = put(s, 'p1', 'SMP-BUNSHIN', 1);
    expect(currentBp(s, db, clone)).toBe(3000);
    const c = `t15-core-${++seq}`;
    s.cores[c] = { id: c, owner: 'p1', isSoul: false };
    s.cards[eagle]!.cores.push(c, `${c}-b`);
    s.cores[`${c}-b`] = { id: `${c}-b`, owner: 'p1', isSoul: false };
    expect(currentBp(s, db, clone)).toBe(11000);
  });

  it('ดังกาโร: สร้างสปิริตร่างแยกด้วยคอร์จากวอยด์ 1 เม็ดแทนรีเสิร์ฟ', () => {
    let s = setup();
    put(s, 'p1', no('เทือกเขาดังกาโรที่หมุนวน'), 0);
    const puma = inHand(s, 'p1', no('ซอร์ดพูมา'));
    s = summon(s, puma);
    const reserve = s.players.p1.reserve.length;
    const top = s.players.p1.deck[0]!;
    s = pickOption(s, 'Bunshin');
    s = pickOption(s, 'วอยด์');
    expect(s.players.p1.field).toContain(top);
    expect(s.cards[top]!.cardNo).toBe('SMP-BUNSHIN');
    expect(s.cards[top]!.cores).toHaveLength(1);
    expect(s.players.p1.reserve.length).toBe(reserve);
  });

  it('คานาบูน Rush เหลือง: สปิริตคู่แข่งที่ถูกระบุป้องกันไม่ได้ในเทิร์นนี้ (แต่ยังโจมตีได้)', () => {
    let s = setup();
    put(s, 'p1', no('สัตว์พันปี บีฮีมอธ ซีดาร์'), 1); // เจ็มเหลือง
    const foe = put(s, 'p2', DARIU, 1);
    const k = inHand(s, 'p1', no('คานาบูน'));
    s = summon(s, k);
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(s.turnLocks?.some((l) => l.cardId === foe && l.blockOnly)).toBe(true);
    const atk = put(s, 'p1', DARIU, 1);
    s = passAll(attack(s, atk));
    expect(blockersFor(s, db, 'p2')).not.toContain(foe);
    expect(canAttackWith(s, db, foe)).toBe(true);
  });

  it('ไกเซอร์แอตลาส Lv4: ชนะการเทียบ BP ตอนโจมตี = ไลฟ์คู่แข่ง 1 เม็ดไปวอยด์', () => {
    let s = setup();
    const atlas = put(s, 'p1', no('อัลติเมท ไกเซอร์แอตลาส'), 3); // Lv4 BP 15000
    // U Trigger ไม่ฮิต: ใบบนสุดเด็คคู่แข่งคอสต์ 8 (ไม่ต่ำกว่า 6) = ไม่เสื่อมสภาพคู่แข่ง
    s.cards[s.players.p2.deck[0]!]!.cardNo = no('ริวแมน เบลด');
    const foe = put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    const reserve = s.players.p2.reserve.length;
    s = passAll(attack(s, atlas));
    s = passAll(act(s, { type: 'declareBlock', player: 'p2', blockerId: foe }));
    expect(s.players.p2.field).not.toContain(foe);
    expect(s.players.p2.life.length).toBe(life - 1);
    // รีเสิร์ฟ +1 = คอร์ของสปิริตที่ถูกทำลาย (คอร์ไลฟ์ไปวอยด์ ไม่ใช่รีเสิร์ฟ)
    expect(s.players.p2.reserve.length).toBe(reserve + 1);
  });

  it('แอกซ์มอธ: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง = กลับขึ้นมือ', () => {
    let s = setup();
    const moth = put(s, 'p2', no('แอกซ์มอธ'), 1);
    const src = put(s, 'p1', DARIU, 1);
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, moth);
    expect(s.players.p2.hand).toContain(moth);
  });

  it('แชโดว์ลีฟ (เบิร์ส): ให้ Bunshin ของสปิริตของเราทำงาน', () => {
    let s = setup();
    put(s, 'p1', no('ซอร์ดพูมา'), 1);
    const src = put(s, 'p1', DARIU, 1);
    const top = s.players.p1.deck[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'activateBunshin' }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    s = pickOption(s, 'Bunshin');
    if (s.choice?.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.cards[top]!.cardNo).toBe('SMP-BUNSHIN');
    expect(s.players.p1.field).toContain(top);
  });
});

describe('Booster Set 15 (เหลือง)', () => {
  const BLADE = no('ริวแมน เบลด'); // คอสต์ 8 (U Trigger ไม่ฮิต)
  /** ผ่านแฟลชทั้งหมด ยกเว้นตาที่กำหนดให้ทำอย่างอื่น */
  const queueItem = (s: GameState, sourceId: string, steps: Step[]) => {
    s.queue = [...s.queue, { controller: 'p1', sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
  };
  const magicCard = (s: GameState, name: string) => {
    const id = `t15-card-${++seq}`;
    s.cards[id] = { id, cardNo: no(name), owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p1.trashCards.push(id);
    return id;
  };

  it('การ์ดเหลืองผูกสคริปต์ครบ (ชุด BS15 = 40 ใบ)', () => {
    expect(loadBS15Cards().all().filter((c) => c.colors.includes('yellow') || ['BS24-C083', 'BS24-C093', 'BS24-C094'].includes(c.cardNo)).length).toBeGreaterThanOrEqual(20);
  });

  it('แบทเทิลแคนเซิล: จบการต่อสู้โดยไม่เทียบ BP (ไม่มีใครถูกทำลาย)', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1); // BP 3000
    const blocker = put(s, 'p2', no('หกเทพพิสุทธิ์ เจียส แห่งความอุดม'), 7); // BP 18000
    const m = inHand(s, 'p1', no('แบทเทิลแคนเซิล'));
    s = passAll(attack(s, atk));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    for (let i = 0; i < 6 && s.battle?.flash; i++) {
      const pr = s.battle.flash.priority;
      if (pr === 'p1' && s.players.p1.hand.includes(m)) {
        const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
        s = act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, cost), timing: 'flash' });
      } else s = act(s, { type: 'passFlash', player: pr });
    }
    expect(s.players.p1.field).toContain(atk);
    expect(s.players.p2.field).toContain(blocker);
  });

  it('หอสมุดคัมภีร์: สปิริตของผู้เล่นทุกคนไม่ฟื้นสภาพโดยเอฟเฟกต์', () => {
    let s = setup();
    put(s, 'p2', no('หอสมุดคัมภีร์เวทที่ถูกผนึก'), 0);
    const tired = put(s, 'p1', DARIU, 1);
    s.cards[tired]!.state = 'exhausted';
    queueItem(s, tired, [{ do: 'refreshAllAllies' }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.cards[tired]!.state).toBe('exhausted');
  });

  it('โคริสทัล: จบการต่อสู้ทำลายตัวเอง · U Trigger ฮิต = ในการต่อสู้นี้ไม่ถูกทำลาย', () => {
    for (const [top, survives] of [[DARIU, true], [BLADE, false]] as const) {
      let s = setup();
      const c = put(s, 'p1', no('อัลติเมท โคริสทัล'), 1);
      s.cards[s.players.p2.deck[0]!]!.cardNo = top;
      s = passAll(attack(s, c));
      for (let i = 0; i < 6 && s.choice; i++) s = choose(s, 0);
      s = passAll(s);
      if (s.battle?.step === 'declareBlock') s = passAll(act(s, { type: 'noBlock', player: 'p2' }));
      for (let i = 0; i < 6 && s.choice; i++) s = choose(s, 0);
      expect(s.players.p1.field.includes(c)).toBe(survives);
    }
  });

  it('วอตชิโน: ถูกทำลายโดยคู่แข่ง → เสื่อมสภาพสปิริต BP ไม่เกิน 5000 ของคู่แข่ง เพื่ออยู่ต่อแบบเสื่อมสภาพ', () => {
    let s = setup();
    const w = put(s, 'p2', no('วอตชิโน'), 1);
    const src = put(s, 'p1', DARIU, 1);
    queueItem(s, src, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, w);
    s = pickOption(s, 'เสื่อมสภาพ');
    if (s.choice?.kind === 'card') s = choose(s, src);
    expect(s.players.p2.field).toContain(w);
    expect(s.cards[w]!.state).toBe('exhausted');
    expect(s.cards[src]!.state).toBe('exhausted');
  });

  it('มาริกะ Lv2: มีนักร้องครบ 4 คน = อัลติเมทของเรา BP+10000', () => {
    const s = setup();
    const u = put(s, 'p1', no('อัลติเมท โคริสทัล'), 1); // Lv3 BP 7000
    put(s, 'p1', no('นักร้อง มาริกะ'), 2);
    put(s, 'p1', no('นักร้อง อาร์เชีย'), 1);
    put(s, 'p1', no('นักร้อง โคโค'), 1);
    expect(currentBp(s, db, u)).toBe(7000);
    put(s, 'p1', no('นักร้อง มิเรฟา'), 1);
    expect(currentBp(s, db, u)).toBe(17000);
  });

  it('วิงบีฮีมอธ Lv2: สปิริต "บีฮีมอธ" ของเราไม่ถูกป้องกันโดยสปิริต Lv1/Lv2', () => {
    let s = setup();
    const wing = put(s, 'p1', no('สัตว์ปีก วิงบีฮีมอธ'), 2);
    const low = put(s, 'p2', DARIU, 1);
    const high = put(s, 'p2', DARIU, 5); // Lv3
    s = passAll(attack(s, wing));
    expect(blockersFor(s, db, 'p2')).not.toContain(low);
    expect(blockersFor(s, db, 'p2')).toContain(high);
  });

  it('มิคาฟาร์ (U Trigger ฮิต): เมจิคของเรานำสปิริตคู่แข่งกลับเด็ค = ไลฟ์คู่แข่ง 1 เม็ด (เทิร์นละครั้ง)', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const magic = magicCard(s, 'อัลติเมทพลาสมา');
    put(s, 'p2', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    queueItem(s, src, [{ do: 'magicBounceLifeThisTurn' }]);
    queueItem(s, magic, [{ do: 'bounceOpponent', filter: { types: ['spirit'] }, to: 'deckBottom', count: 2 }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    for (let i = 0; i < 6 && s.choice; i++) s = s.choice.kind === 'multiCard' ? choose(s, { cards: s.choice.candidates.slice(0, 2) } as never) : s.choice.kind === 'arrange' ? choose(s, { order: s.choice.cardIds } as never) : choose(s, (s.choice as { candidates?: string[] }).candidates?.[0] ?? 0);
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('อัลติเมทพลาสมา: ใช้ได้เฉพาะระหว่างที่อัลติเมทของเรากำลังโจมตี', () => {
    const s = setup();
    const m = inHand(s, 'p1', no('อัลติเมทพลาสมา'));
    expect(fails(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, 10), timing: 'flash' })).toBe('WRONG_TIMING');
  });
});

describe('Booster Set 15 (ฟ้า)', () => {
  const BLADE = no('ริวแมน เบลด'); // คอสต์ 8
  const LIB = no('หอสมุดคัมภีร์เวทที่ถูกผนึก'); // เด็คของผู้เล่นทุกคนจะไม่ถูกทิ้ง
  const queueItem = (s: GameState, sourceId: string, steps: Step[]) => {
    s.queue = [...s.queue, { controller: 'p1', sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
  };
  const settle = (s: GameState, want?: string) => {
    let x = passAll(s);
    for (let i = 0; i < 10 && x.choice; i++) {
      const c = x.choice;
      if (c.kind === 'card') x = choose(x, want && c.candidates.includes(want) ? want : c.candidates[0]!);
      else if (c.kind === 'option') x = choose(x, 0);
      else break;
      x = passAll(x);
    }
    return x;
  };

  it('การ์ดฟ้าผูกสคริปต์ครบ (ชุด BS15 = 60 ใบ)', () => {
    expect(loadBS15Cards().all()).toHaveLength(60);
  });

  it('คาสเซิลโกเล็ม Lv4: แอทแท็คสเต็ปของเรา "เด็คจะไม่ถูกทิ้ง" ของเน็กซัสคู่แข่งไม่มีผล (Lv3 ยังโดนกัน)', () => {
    for (const [cores, milled] of [[4, true], [1, false]] as const) {
      let s = setup();
      const castle = put(s, 'p1', no('อัลติเมท คาสเซิลโกเล็ม'), cores);
      put(s, 'p2', LIB, 0);
      const trash = s.players.p2.trashCards.length;
      s = settle(attack(s, castle));
      // U Trigger เปิด 1 ใบ (ไม่ใช่การทิ้งเด็ค) + ฮิต = ทิ้งเด็ค 3 ใบ (ใบบนสุดคอสต์ 1)
      expect(s.players.p2.trashCards.length - trash).toBe(milled ? 4 : 1);
    }
  });

  it('ร็อคโกเล็ม: สปิริตคอสต์ไม่เกิน 3 โจมตีได้เทิร์นละ 1 ครั้ง', () => {
    let s = setup();
    put(s, 'p1', no('อัลติเมท ร็อคโกเล็ม'), 1);
    const d = put(s, 'p1', DARIU, 1);
    s = settle(attack(s, d));
    if (s.battle?.step === 'declareBlock') s = settle(act(s, { type: 'noBlock', player: 'p2' }));
    s.cards[d]!.state = 'refresh';
    expect(canAttackWith(s, db, d)).toBe(false);
  });

  it('แกลเลียน โกเล็ม: สปิริตที่ถูกระบุต้องป้องกันถ้าทำได้', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const forced = put(s, 'p2', DARIU, 1);
    const other = put(s, 'p2', DARIU, 1);
    queueItem(s, src, [{ do: 'forceBlockChosen', filter: { types: ['spirit'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, forced);
    s = passAll(act(s, { type: 'declareAttack', player: 'p1', attackerId: src }));
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: other })).toBe('MUST_BLOCK');
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: forced })).toBe('ok');
  });

  it('ชาร์กไฮดรา: แอทแท็คสเต็ปของเรา สปิริตคอสต์ตั้งแต่ 8 ถูกทำลาย = สปิริตนี้ฟื้นสภาพ', () => {
    let s = setup();
    const shark = put(s, 'p1', no('มังกรหัวฉลาม ชาร์กไฮดรา'), 1); // BP 10000
    const blade = put(s, 'p2', BLADE, 1);
    s = passAll(attack(s, shark));
    s = settle(act(s, { type: 'declareBlock', player: 'p2', blockerId: blade }));
    expect(s.players.p2.field).not.toContain(blade);
    expect(s.cards[shark]!.state).toBe('refresh');
  });

  it('แบร์เซนทอร์: ทำลายสปิริตคอสต์ไม่เกิน 5 · +5 ต่ออัลติเมทของเรา 1 ตัว', () => {
    let s = setup();
    put(s, 'p1', no('อัลติเมท ร็อคโกเล็ม'), 1);
    const blade = put(s, 'p2', BLADE, 1);
    const b = inHand(s, 'p1', no('แบร์เซนทอร์'));
    s = settle(summon(s, b), blade);
    expect(s.players.p2.field).not.toContain(blade);
  });

  it('ไรออต โกเล็ม Lv2: ถูกทำลายโดยคู่แข่ง → เสื่อมสภาพเน็กซัสของเรา เพื่ออยู่ต่อแบบฟื้นสภาพ', () => {
    let s = setup();
    const r = put(s, 'p2', no('ไรออต โกเล็ม'), 2);
    const nexus = put(s, 'p2', LIB, 0);
    const src = put(s, 'p1', DARIU, 1);
    queueItem(s, src, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, r);
    s = pickOption(s, 'เน็กซัส');
    if (s.choice?.kind === 'card') s = choose(s, nexus);
    expect(s.players.p2.field).toContain(r);
    expect(s.cards[r]!.state).toBe('refresh');
    expect(s.cards[nexus]!.state).toBe('exhausted');
  });

  it('ประตูชัย: คู่แข่งใช้เมจิคที่ไม่มีสีเดียวกับเจ็มบนฟิลด์ตัวเองไม่ได้', () => {
    const s = setup();
    put(s, 'p2', no('ประตูชัยที่ถูกลืม'), 0);
    put(s, 'p1', DARIU, 1); // เจ็มแดง
    const m = inHand(s, 'p1', no('ไบนดิงครีปเปอร์')); // สีเขียว
    expect(fails(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, 4), timing: 'flash' })).toBe('MAGIC_BANNED');
  });

  it('เคลียร์เอดจ์ [Main]: คู่แข่งทิ้งการ์ดในมือ/นอกมือจนเหลือรวม 3 ใบ', () => {
    let s = setup();
    s.players.p2.hand = [];
    const ids = Array.from({ length: 6 }, () => inHand(s, 'p2', DARIU));
    s.shownCards = ids.slice(0, 2);
    const m = inHand(s, 'p1', no('เคลียร์เอดจ์'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, cost), timing: 'main' });
    for (let i = 0; i < 6 && s.choice; i++) {
      const c = s.choice as { kind: string; candidates: string[]; count?: number };
      s = c.kind === 'multiCard' ? choose(s, { cards: c.candidates.slice(0, c.count ?? 3) } as never) : choose(s, c.candidates[0]!);
    }
    expect(s.players.p2.hand).toHaveLength(3);
  });

  it('ม่อนโกคู: U Trigger ฮิต = BP เป็น 2 เท่า', () => {
    let s = setup();
    const m = put(s, 'p1', no('อัลติเมท ม่อนโกคู'), 1); // Lv3 BP 5000
    s = passAll(attack(s, m));
    for (let i = 0; i < 4 && s.choice; i++) s = choose(s, 0);
    expect(currentBp(s, db, m)).toBe(10000);
  });
});

describe('BS15 คาราเวล โกเล็ม', () => {
  it('อัลติเมทขาว/ฟ้าของเราโจมตี = คอร์จากวอยด์ 1 เม็ด (ถูกป้องกันหรือไม่ก็ได้)', () => {
    for (const blocked of [false, true]) {
      let s = setup();
      const caravel = put(s, 'p1', no('คาราเวล โกเล็ม'), 1);
      const ult = put(s, 'p1', no('อัลติเมท ม่อนโกคู'), 1); // สีฟ้า
      s.cards[s.players.p2.deck[0]!]!.cardNo = no('ริวแมน เบลด'); // U Trigger ไม่ฮิต
      const foe = put(s, 'p2', DARIU, 1);
      s = passAll(attack(s, ult));
      for (let i = 0; i < 4 && s.choice; i++) s = choose(s, 0);
      s = passAll(s);
      s = passAll(blocked ? act(s, { type: 'declareBlock', player: 'p2', blockerId: foe }) : act(s, { type: 'noBlock', player: 'p2' }));
      for (let i = 0; i < 4 && s.choice; i++) s = choose(s, 0);
      expect(s.cards[caravel]!.cores.length, blocked ? 'ถูกป้องกัน' : 'ไม่ถูกป้องกัน').toBe(2);
    }
  });
});
