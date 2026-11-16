import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, createGame, currentBp, getPlayerView, payableCost, type Action, type GameState, type PlayerId } from '../src';

// การ์ดของ SD01 ส่วนใหญ่อยู่ใน Booster Set 01: ใช้ฐานข้อมูลรวม
const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;

const HIEN = no('ฮิเอ็นดราก้อน');
const HAGANE = no('ฮากาเนะวูม');
const SOUL_DRAW = no('โซลดรอว์');
const ONIMUSHA = no('โอนิมุฉะไรซัน');
const SOL_DRAGON = no('มังกรเซ็นโงคุ โซลดราก้อน');
const SAMURAI = no('ซามูไร-ดราก้อน'); // BP 3000/6000/8000 (Core 1/2/4)
const BYOUHA = no('มังกรศรชัย เบียวฮะ');
const VALLEY = no('หุบเหวร้อยปราชญ์'); // Nexus Lv1 Core 0 / Lv2 Core 3 // BP 4000/5000 (Core 1/2)
const BURST_WALL = no('เบิร์สวอลล์');
const TOKAGE = no('อิคุสะ โทคาเงะ');
const DARIU = no('มุฉะดาริว'); // ไม่มีเอฟเฟกต์ BP 3000/6000/8000 (Core 1/3/5)
const JINRAI = no('จินไรดราก้อน');
const DRACO = no('มุฉะดราโค');
const KABURYU = no('คาบุริว ดรอว์');
const GUREN = no('เซ็นโกคุ-กุเร็นดราก้อน');

/**
 * เกมไม่สับเด็ค p1 เริ่มก่อนและโจมตีได้เทิร์นแรก: มือ p1 = top 5 ใบแรก, มือ p2 = top 4 ใบแรก
 * Reserve เยอะพอจ่ายคอสต์ ที่เหลือในเด็คเป็นมุฉะดาริว
 */
function setup(p1: string[] = [], p2: string[] = []): GameState {
  const build = (top: string[]) => [...top, ...Array<string>(40 - top.length).fill(DARIU)];
  return createGame({
    db,
    decks: { p1: build(p1), p2: build(p2) },
    seed: 1,
    firstPlayer: 'p1',
    shuffleDecks: false,
    config: { initialReserve: 12, firstPlayerSkipsAttackStep: false },
  }).state;
}

let seq = 0;
/** สร้างการ์ดใบใหม่วางบนสนามโดยตรง พร้อม Core ใหม่ (soul = ดวงแรกเป็น Soul Core) */
function put(s: GameState, player: PlayerId, cardNo: string, cores: number, soul = false): string {
  const id = `t-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}

/** ทำ action แล้วตอบ "เลือกลำดับเอฟเฟกต์" ด้วยลำดับเดิมให้อัตโนมัติ (เทสอื่นไม่ต้องสนใจลำดับ) */
function act(s: GameState, action: Action): GameState {
  let next = actRaw(s, action);
  while (next.choice?.kind === 'order') next = actRaw(next, { type: 'choose', player: next.choice.player, pick: 0 });
  return next;
}

function actRaw(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}

function fails(s: GameState, action: Action): string {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
}

const handId = (s: GameState, player: PlayerId, cardNo: string) =>
  s.players[player].hand.find((id) => s.cards[id]!.cardNo === cardNo)!;

/** จ่ายคอสต์จาก Reserve (soul: ใช้ Soul Core ร่วมจ่าย) */
function payment(s: GameState, player: PlayerId, cardNo: string, soul = false): string[] {
  const cost = payableCost(s, db, player, db.get(cardNo));
  const reserve = [...s.players[player].reserve].sort((a, b) => Number(s.cores[b]!.isSoul) - Number(s.cores[a]!.isSoul));
  return soul ? reserve.slice(0, cost) : reserve.filter((id) => !s.cores[id]!.isSoul).slice(0, cost);
}

const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const attack = (s: GameState, attackerId: string) => act(s, { type: 'declareAttack', player: 'p1', attackerId });
const passBoth = (s: GameState) => {
  for (let i = 0; i < 2; i++) s = act(s, { type: 'passFlash', player: s.battle!.flash!.priority });
  return s;
};

describe('BP+ ถาวร', () => {
  it('ฮิเอ็นดราก้อน มี Soul Core: สปิริตเผ่ามังกรยุทธ์ของเราทั้งหมด BP+4000', () => {
    const s = setup();
    const hien = put(s, 'p1', HIEN, 1, true);
    const jinrai = put(s, 'p1', JINRAI, 1);
    const dariu = put(s, 'p1', DARIU, 1); // เผ่ามังกรดิน
    const enemy = put(s, 'p2', JINRAI, 1); // ของคู่แข่งไม่ได้
    expect(currentBp(s, db, hien)).toBe(3000 + 4000);
    expect(currentBp(s, db, jinrai)).toBe(3000 + 4000);
    expect(currentBp(s, db, dariu)).toBe(3000);
    expect(currentBp(s, db, enemy)).toBe(3000);

    const noSoul = setup();
    put(noSoul, 'p1', HIEN, 1);
    expect(currentBp(noSoul, db, put(noSoul, 'p1', JINRAI, 1))).toBe(3000);
  });

  it('อิคุสะ โทคาเงะ Lv3 + Soul Core: BP+6000 (Lv2 ไม่ได้)', () => {
    const s = setup();
    expect(currentBp(s, db, put(s, 'p1', TOKAGE, 5, true))).toBe(4000 + 6000);
    expect(currentBp(s, db, put(s, 'p1', TOKAGE, 3, true))).toBe(3000);
    expect(currentBp(s, db, put(s, 'p1', TOKAGE, 5))).toBe(4000);
  });
});

describe('เมื่อสปิริตนี้โจมตี และ [True-Rage]', () => {
  it('โอนิมุฉะไรซัน: จั่ว 1 ใบ และคู่แข่งต้องป้องกันถ้าทำได้', () => {
    let s = setup();
    const oni = put(s, 'p1', ONIMUSHA, 1);
    const blocker = put(s, 'p2', DARIU, 1);
    s = toAttack(s);
    const hand = s.players.p1.hand.length;
    s = attack(s, oni);
    expect(s.players.p1.hand).toHaveLength(hand + 1);
    expect(s.battle!.mustBlock).toBe(true);
    s = passBoth(s);
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    expect(s.battle!.blockers).toEqual([blocker]);
  });

  it('[True-Rage] + ตีระบุ: ตัวที่ถูกระบุป้องกันทันที / ไม่ระบุ = True-Rage บังคับป้องกันตามปกติ', () => {
    const ORIGAMI = no('โอริงามิ เบิร์ด');
    const make = () => {
      let s = setup();
      const oni = put(s, 'p1', ONIMUSHA, 1);
      const origami = `t-card-${++seq}`;
      s.cards[origami] = { id: origami, cardNo: ORIGAMI, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
      s.cards[oni]!.braves.push(origami);
      const tired = put(s, 'p2', DARIU, 1);
      s.cards[tired]!.state = 'exhausted';
      const fresh = put(s, 'p2', DARIU, 1);
      s = attack(toAttack(s), oni);
      expect(s.choice).toMatchObject({ kind: 'card' });
      return { s, tired, fresh };
    };
    // ระบุตัวที่เสื่อมสภาพ: ป้องกันทันที ไม่มี Flash หลังโจมตี
    let { s, tired } = make();
    s = act(s, { type: 'choose', player: 'p1', pick: tired });
    while (s.battle?.step === 'flashBeforeBlock') s = act(s, { type: 'passFlash', player: s.battle.flash!.priority });
    expect(s.battle).toMatchObject({ step: 'flashAfterBlock', blockers: [tired], mustBlock: true });
    // ไม่ระบุ: True-Rage ยังบังคับให้ป้องกันด้วยตัวที่ฟื้นสภาพ
    const r = make();
    s = passBoth(act(r.s, { type: 'choose', player: 'p1', pick: null }));
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: r.fresh });
    expect(s.battle!.blockers).toEqual([r.fresh]);
  });

  it('[True-Rage] ไม่บังคับถ้าคู่แข่งไม่มีสปิริตที่ฟื้นสภาพ', () => {
    let s = setup();
    const oni = put(s, 'p1', ONIMUSHA, 1);
    s.cards[put(s, 'p2', DARIU, 1)]!.state = 'exhausted';
    s = passBoth(attack(toAttack(s), oni));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life).toHaveLength(4);
  });

  it('จินไรดราก้อน: BP+3000 ในเทิร์นนี้ และได้ [True-Rage] เมื่อมี Soul Core', () => {
    let s = setup();
    const jinrai = put(s, 'p1', JINRAI, 1);
    s = attack(toAttack(s), jinrai);
    expect(currentBp(s, db, jinrai)).toBe(6000);
    expect(s.battle!.mustBlock).toBe(false);
    s = act(passBoth(s), { type: 'noBlock', player: 'p2' });
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(currentBp(s, db, jinrai)).toBe(3000); // หมดผลเมื่อจบเทิร์น

    let t = setup();
    const soulJinrai = put(t, 'p1', JINRAI, 1, true);
    t = attack(toAttack(t), soulJinrai);
    expect(t.battle!.mustBlock).toBe(true);
  });

  it('เซ็นโกคุ-กุเร็นดราก้อน: รอผู้เล่นเลือก จั่ว หรือ BP+5000', () => {
    let s = setup();
    const guren = put(s, 'p1', GUREN, 1);
    s = attack(toAttack(s), guren);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1', options: ['จั่วการ์ด 1 ใบ', 'ในเทิร์นนี้ BP+5000'] });
    expect(fails(s, { type: 'passFlash', player: 'p2' })).toBe('CHOICE_PENDING');
    expect(fails(s, { type: 'choose', player: 'p2', pick: 0 })).toBe('NOT_YOUR_CHOICE');
    expect(fails(s, { type: 'choose', player: 'p1', pick: 5 })).toBe('INVALID_PICK');

    const hand = s.players.p1.hand.length;
    const drew = act(s, { type: 'choose', player: 'p1', pick: 0 });
    expect(drew.players.p1.hand).toHaveLength(hand + 1);
    expect(drew.choice).toBeNull();
    expect(drew.battle!.mustBlock).toBe(true);

    const buffed = act(s, { type: 'choose', player: 'p1', pick: 1 });
    expect(currentBp(buffed, db, guren)).toBe(10000);
  });

  it('เซ็นโกคุ-กุเร็นดราก้อน Lv2 + Soul Core: ทำลายผู้ป้องกันแล้วคู่แข่งเสียไลฟ์ 1', () => {
    let s = setup();
    const guren = put(s, 'p1', GUREN, 3, true);
    const blocker = put(s, 'p2', DARIU, 1);
    s = attack(toAttack(s), guren);
    s = act(s, { type: 'choose', player: 'p1', pick: 0 });
    s = act(passBoth(s), { type: 'declareBlock', player: 'p2', blockerId: blocker });
    s = passBoth(s);
    expect(s.players.p2.trashCards).toContain(blocker);
    expect(s.players.p2.life).toHaveLength(4);
  });
});

describe('Magic', () => {
  it('โซลดรอว์ [Main]: จั่ว 2 ใบ ใช้ Soul Core จ่ายด้วยจั่วเพิ่มอีก 1 แล้วลง Trash', () => {
    const s = setup([SOUL_DRAW]);
    const id = handId(s, 'p1', SOUL_DRAW);
    const hand = s.players.p1.hand.length;

    const plain = act(s, { type: 'useMagic', player: 'p1', cardId: id, payment: payment(s, 'p1', SOUL_DRAW) });
    expect(plain.players.p1.hand).toHaveLength(hand - 1 + 2);
    expect(plain.players.p1.trashCards).toEqual([id]);

    const soul = act(s, { type: 'useMagic', player: 'p1', cardId: id, payment: payment(s, 'p1', SOUL_DRAW, true) });
    expect(soul.players.p1.hand).toHaveLength(hand - 1 + 3);
  });

  it('คาบุริว ดรอว์ [Main]: จั่ว 2 แล้วเลือกสปิริตมังกรยุทธ์ในแทรชกลับขึ้นมือ', () => {
    let s = setup([KABURYU]);
    const jinrai = put(s, 'p1', JINRAI, 0);
    s.players.p1.field.splice(s.players.p1.field.indexOf(jinrai), 1);
    s.players.p1.trashCards.push(jinrai);
    const dariu = put(s, 'p1', DARIU, 0); // มังกรดิน: เลือกไม่ได้
    s.players.p1.field.splice(s.players.p1.field.indexOf(dariu), 1);
    s.players.p1.trashCards.push(dariu);

    const id = handId(s, 'p1', KABURYU);
    s = act(s, { type: 'useMagic', player: 'p1', cardId: id, payment: payment(s, 'p1', KABURYU), timing: 'main' });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [jinrai] });
    expect(s.players.p1.trashCards).not.toContain(id); // ยังประมวลผลไม่เสร็จ
    s = act(s, { type: 'choose', player: 'p1', pick: jinrai });
    expect(s.players.p1.hand).toContain(jinrai);
    expect(s.players.p1.trashCards).toEqual([dariu, id]);
  });

  it('[Flash] ใช้ระหว่างการต่อสู้: ฝ่ายป้องกันเพิ่ม BP แล้ว priority ส่งให้อีกฝ่าย', () => {
    let s = setup([], [KABURYU]);
    const attacker = put(s, 'p1', DARIU, 1);
    const blocker = put(s, 'p2', DARIU, 1);
    s = attack(toAttack(s), attacker);
    const id = handId(s, 'p2', KABURYU);
    const pay = payment(s, 'p2', KABURYU);
    expect(fails(s, { type: 'useMagic', player: 'p2', cardId: id, payment: pay, timing: 'main' })).toBe('WRONG_TIMING');
    expect(fails(s, { type: 'useMagic', player: 'p1', cardId: id, payment: pay })).toBe('NOT_YOUR_PRIORITY');

    s = act(s, { type: 'useMagic', player: 'p2', cardId: id, payment: pay });
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p2' });
    s = act(s, { type: 'choose', player: 'p2', pick: blocker });
    expect(currentBp(s, db, blocker)).toBe(5000);
    expect(s.battle!.flash).toEqual({ priority: 'p1', consecutivePasses: 0 });

    s = act(passBoth(s), { type: 'declareBlock', player: 'p2', blockerId: blocker });
    s = passBoth(s);
    expect(s.players.p1.trashCards).toContain(attacker);
    expect(s.players.p2.field).toContain(blocker);
  });

  it('เบิร์สวอลล์ [Flash]: จบ Attack Step เมื่อการต่อสู้นี้จบ', () => {
    let s = setup([], [BURST_WALL]);
    const a = put(s, 'p1', DARIU, 1);
    put(s, 'p1', DARIU, 1);
    s = attack(toAttack(s), a);
    const id = handId(s, 'p2', BURST_WALL);
    s = act(s, { type: 'useMagic', player: 'p2', cardId: id, payment: payment(s, 'p2', BURST_WALL) });
    s = act(passBoth(s), { type: 'noBlock', player: 'p2' });
    expect(s.turnPlayer).toBe('p2');
    expect(s.phase).toBe('main');
  });

  it('Magic ที่ไม่มีเอฟเฟกต์ [Main] ใช้ใน Main Step ด้วย timing main ไม่ได้', () => {
    const s = setup([BURST_WALL]);
    const id = handId(s, 'p1', BURST_WALL);
    expect(fails(s, { type: 'useMagic', player: 'p1', cardId: id, payment: payment(s, 'p1', BURST_WALL), timing: 'main' })).toBe(
      'NO_SUCH_EFFECT',
    );
  });
});

describe('เมื่อสปิริตนี้ถูกอัญเชิญ', () => {
  it('มุฉะดราโค: แสดง 4 ใบ เลือกสปิริตมังกรยุทธ์ขึ้นมือ ที่เหลือลง Trash', () => {
    // มือ p1 = 5 ใบแรก, ใบที่ 6-9 คือ 4 ใบบนสุดของเด็คตอนอัญเชิญ
    let s = setup([DRACO, DARIU, DARIU, DARIU, DARIU, DARIU, JINRAI, SOUL_DRAW, HIEN, DARIU]);
    const top4 = s.players.p1.deck.slice(0, 4);
    const [, jinrai, , hien] = top4;
    const pay = payment(s, 'p1', DRACO);
    const place = s.players.p1.reserve.filter((id) => !pay.includes(id) && !s.cores[id]!.isSoul).slice(0, 1);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', DRACO), payment: pay, placement: place });

    expect(s.choice).toMatchObject({ kind: 'card', candidates: [jinrai, hien], revealed: top4 });
    // คู่แข่งเห็นการ์ดที่แสดง
    expect(getPlayerView(s, 'p2').cards[jinrai!]!.cardNo).toBe(JINRAI);

    s = act(s, { type: 'choose', player: 'p1', pick: hien! });
    expect(s.players.p1.hand).toContain(hien);
    expect(s.players.p1.trashCards).toEqual(top4.filter((id) => id !== hien));
    expect(s.players.p1.deck).toHaveLength(40 - 5 - 4);
  });

  it('มุฉะดราโค: ไม่มีการ์ดที่เลือกได้ ทั้งหมดลง Trash ไม่ต้องรอเลือก', () => {
    let s = setup([DRACO]);
    const top4 = s.players.p1.deck.slice(0, 4);
    const pay = payment(s, 'p1', DRACO);
    const place = s.players.p1.reserve.filter((id) => !pay.includes(id) && !s.cores[id]!.isSoul).slice(0, 1);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', DRACO), payment: pay, placement: place });
    expect(s.choice).toBeNull();
    expect(s.players.p1.trashCards).toEqual(top4);
  });

  it('มังกรเซ็นโงคุ โซลดราก้อน: เอฟเฟกต์ทำงานตอนอัญเชิญ (ยังไม่มีอัลติเมทให้ทำลาย)', () => {
    let s = setup([SOL_DRAGON]);
    const id = handId(s, 'p1', SOL_DRAGON);
    const pay = payment(s, 'p1', SOL_DRAGON);
    const place = s.players.p1.reserve.filter((c) => !pay.includes(c) && !s.cores[c]!.isSoul).slice(0, 1);
    const r = applyAction(s, { type: 'summon', player: 'p1', cardId: id, payment: pay, placement: place }, db);
    expect(r.ok && r.events).toContainEqual({ type: 'abilityTriggered', cardId: id, source: 0 });
  });
});

describe('Flash [Evolution]', () => {
  it('ย้าย Core จากสปิริตอื่นของเรามาวางบนสปิริตนี้ใน Main Step', () => {
    let s = setup();
    const samurai = put(s, 'p1', SAMURAI, 1);
    const dariu = put(s, 'p1', DARIU, 2);
    const core = s.cards[dariu]!.cores[0]!;
    s = act(s, { type: 'evolve', player: 'p1', cardId: samurai, cores: [core] });
    expect(s.cards[samurai]!.cores).toHaveLength(2);
    expect(s.cards[dariu]!.cores).toHaveLength(1);
    expect(currentBp(s, db, samurai)).toBe(6000);
  });

  it('ใช้ได้เฉพาะ Core บนสปิริตอื่นของเรา และการ์ดที่มี [Evolution]', () => {
    const s = setup();
    const samurai = put(s, 'p1', SAMURAI, 1);
    const dariu = put(s, 'p1', DARIU, 2);
    const enemy = put(s, 'p2', DARIU, 2);
    const evolve = (cardId: string, cores: string[]) => fails(s, { type: 'evolve', player: 'p1', cardId, cores });
    expect(evolve(samurai, [])).toBe('NO_CORES');
    expect(evolve(samurai, [s.players.p1.reserve[0]!])).toBe('CORE_NOT_USABLE');
    expect(evolve(samurai, [s.cards[samurai]!.cores[0]!])).toBe('CORE_NOT_USABLE');
    expect(evolve(samurai, [s.cards[enemy]!.cores[0]!])).toBe('CORE_NOT_USABLE');
    expect(evolve(dariu, [s.cards[samurai]!.cores[0]!])).toBe('NO_EVOLUTION');
  });

  it('ซามูไร-ดราก้อน: Soul Core มาวางโดย [Evolution] ใน Attack Step → ฟื้นสภาพ + BP+5000 เทิร์นละครั้ง', () => {
    let s = setup();
    const samurai = put(s, 'p1', SAMURAI, 1);
    const dariu = put(s, 'p1', DARIU, 3, true);
    const soulCore = s.cards[dariu]!.cores[0]!;
    s = attack(toAttack(s), samurai);
    s = act(s, { type: 'passFlash', player: 'p2' });
    s = act(s, { type: 'evolve', player: 'p1', cardId: samurai, cores: [soulCore] });
    expect(s.cards[samurai]!.state).toBe('refresh');
    expect(currentBp(s, db, samurai)).toBe(6000 + 5000);
    expect(s.battle!.flash).toEqual({ priority: 'p2', consecutivePasses: 0 });

    // ครั้งที่สองในเทิร์นเดียวกันไม่ทำงาน
    s.cards[samurai]!.state = 'exhausted';
    s.cards[samurai]!.cores.splice(s.cards[samurai]!.cores.indexOf(soulCore), 1);
    s.cards[dariu]!.cores.push(soulCore);
    s = act(s, { type: 'passFlash', player: 'p2' });
    s = act(s, { type: 'evolve', player: 'p1', cardId: samurai, cores: [soulCore] });
    expect(s.cards[samurai]!.state).toBe('exhausted');
  });

  it('ซามูไร-ดราก้อน: นอก Attack Step ไม่ทำงาน', () => {
    let s = setup();
    const samurai = put(s, 'p1', SAMURAI, 1);
    s.cards[samurai]!.state = 'exhausted';
    const dariu = put(s, 'p1', DARIU, 3, true);
    s = act(s, { type: 'evolve', player: 'p1', cardId: samurai, cores: [s.cards[dariu]!.cores[0]!] });
    expect(s.cards[samurai]!.state).toBe('exhausted');
  });

  it('เบียวฮะ: สปิริตเราสูญสลายโดย [Evolution] → ทำลายสปิริตคู่แข่ง BP ≤ 4000 + จั่ว 2 (มี Soul Core) และการต่อสู้จบ', () => {
    let s = setup();
    const attacker = put(s, 'p1', DARIU, 1); // BP 3000
    put(s, 'p1', JINRAI, 3); // BP 4000 แต่ไม่ได้อยู่ในการต่อสู้
    const byouha = put(s, 'p2', BYOUHA, 2, true); // Lv2
    const fodder = put(s, 'p2', DARIU, 1);
    s = attack(toAttack(s), attacker);
    const hand = s.players.p2.hand.length;

    s = act(s, { type: 'evolve', player: 'p2', cardId: byouha, cores: [s.cards[fodder]!.cores[0]!] });
    expect(s.players.p2.trashCards).toContain(fodder);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p2' });
    expect((s.choice as { candidates: string[] }).candidates).toHaveLength(2);

    s = act(s, { type: 'choose', player: 'p2', pick: attacker });
    expect(s.players.p1.trashCards).toContain(attacker);
    expect(s.players.p2.hand).toHaveLength(hand + 2);
    // ผู้โจมตีออกจากสนามระหว่าง Flash1: Flash1 ยังเปิดต่อจนทั้งสองฝ่ายผ่าน แล้วจบการต่อสู้ (กติกา 02 Q&A 3)
    expect(s.battle?.step).toBe('flashBeforeBlock');
    expect(s.battle?.flash).not.toBeNull();
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.battle).toBeNull();
    expect(s.players.p2.life).toHaveLength(5);
    expect(s.phase).toBe('attack');
  });
});

describe('Nexus: หุบเหวร้อยปราชญ์ (ดรอว์สเต็ปของเรา)', () => {
  /** จบเทิร์น p1 และ p2 → เริ่มเทิร์นถัดไปของ p1 */
  const nextOwnTurn = (s: GameState) => {
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    s = act(s, { type: 'endMain', player: 'p2' });
    return act(s, { type: 'endAttackStep', player: 'p2' });
  };

  it('Lv1: จั่ว +1 ใบ แล้วเลือกทิ้งการ์ดในมือ 1 ใบ ก่อนเข้า Refresh Step', () => {
    let s = setup();
    put(s, 'p1', VALLEY, 0);
    const spirit = put(s, 'p1', DARIU, 1);
    s.cards[spirit]!.state = 'exhausted';
    const hand = s.players.p1.hand.length;

    s = nextOwnTurn(s);
    expect(s.turnPlayer).toBe('p1');
    expect(s.phase).toBe('draw');
    expect(s.players.p1.hand).toHaveLength(hand + 2);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1', candidates: s.players.p1.hand });
    expect(s.cards[spirit]!.state).toBe('exhausted'); // ยังไม่ถึง Refresh Step
    expect(fails(s, { type: 'endMain', player: 'p1' })).toBe('CHOICE_PENDING');

    const discard = s.players.p1.hand[0]!;
    s = act(s, { type: 'choose', player: 'p1', pick: discard });
    expect(s.players.p1.hand).toHaveLength(hand + 1);
    expect(s.players.p1.trashCards).toContain(discard);
    expect(s.phase).toBe('main');
    expect(s.cards[spirit]!.state).toBe('refresh');
  });

  it('Lv2: จั่ว +1 ไม่ต้องทิ้ง และไลฟ์ไม่เกิน 2 จั่วเพิ่มอีก 1', () => {
    let s = setup();
    put(s, 'p1', VALLEY, 3);
    const hand = s.players.p1.hand.length;
    const t = nextOwnTurn(s);
    expect(t.choice).toBeNull();
    expect(t.phase).toBe('main');
    expect(t.players.p1.hand).toHaveLength(hand + 2);

    s.players.p1.life.splice(0, 3); // เหลือ 2
    expect(nextOwnTurn(s).players.p1.hand).toHaveLength(hand + 3);
  });
});

describe('Burst: เบิร์สวอลล์ (หลังจากเราเสียไลฟ์)', () => {
  /** p2 เซ็ทเบิร์สวอลล์ไว้ แล้ว p1 โจมตีโดยไม่ถูกบล็อก */
  function hitWithBurstSet() {
    let s = setup([], [BURST_WALL]);
    const burst = handId(s, 'p2', BURST_WALL);
    s.players.p2.hand.splice(s.players.p2.hand.indexOf(burst), 1);
    s.players.p2.burst = burst;
    const attacker = put(s, 'p1', DARIU, 1);
    s = passBoth(attack(toAttack(s), attacker));
    s = act(s, { type: 'noBlock', player: 'p2' });
    return { s, burst };
  }

  it('ถามเปิด Burst ก่อนการต่อสู้จบ → ไลฟ์ +1 → จ่ายคอสต์ใช้ [Flash] → จบ Attack Step', () => {
    let { s, burst } = hitWithBurstSet();
    expect(s.players.p2.life).toHaveLength(4);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2', options: ['เปิด Burst', 'ไม่เปิด'] });
    expect(s.battle).not.toBeNull();

    s = act(s, { type: 'choose', player: 'p2', pick: 0 });
    expect(s.players.p2.life).toHaveLength(5);
    expect(s.players.p2.burst).toBeNull();
    expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p2', cost: 4 });
    expect(fails(s, { type: 'choose', player: 'p2', pick: { pay: [] } })).toBe('WRONG_PAYMENT');

    s = act(s, { type: 'choose', player: 'p2', pick: { pay: payment(s, 'p2', BURST_WALL) } });
    expect(s.players.p2.trashCards).toContain(burst);
    expect(s.turnPlayer).toBe('p2'); // Attack Step ของ p1 จบ
    expect(s.phase).toBe('main');
  });

  it('Chain: เปิด Burst = 1 ข้อ, จ่าย [Flash] ของการ์ดเดียวกัน = ต่ออีก 1 ข้อ', () => {
    let { s, burst } = hitWithBurstSet();
    let r = applyAction(s, { type: 'choose', player: 'p2', pick: 0 }, db);
    if (!r.ok) throw new Error('open');
    expect(r.events.filter((e) => e.type === 'effectResolving')).toEqual([{ type: 'effectResolving', player: 'p2', cardId: burst, source: null }]);
    s = r.state;
    r = applyAction(s, { type: 'choose', player: 'p2', pick: { pay: payment(s, 'p2', BURST_WALL) } }, db);
    if (!r.ok) throw new Error('pay');
    const flash = r.events.filter((e) => e.type === 'effectResolving');
    expect(flash).toHaveLength(1);
    expect(flash[0]).toMatchObject({ player: 'p2', cardId: burst });
    // ไม่จ่าย = ไม่มี Chain ข้อที่สอง
    let t = hitWithBurstSet().s;
    t = act(t, { type: 'choose', player: 'p2', pick: 0 });
    const r2 = applyAction(t, { type: 'choose', player: 'p2', pick: null }, db);
    expect(r2.ok && r2.events.filter((e) => e.type === 'effectResolving')).toHaveLength(0);
  });

  it('เปิดแต่ไม่จ่ายคอสต์: ได้ไลฟ์คืน การ์ดลง Trash และ Attack Step ดำเนินต่อ', () => {
    let { s, burst } = hitWithBurstSet();
    s = act(s, { type: 'choose', player: 'p2', pick: 0 });
    s = act(s, { type: 'choose', player: 'p2', pick: null });
    expect(s.players.p2.life).toHaveLength(5);
    expect(s.players.p2.trashCards).toContain(burst);
    expect(s.battle).toBeNull();
    expect(s.turnPlayer).toBe('p1');
    expect(s.phase).toBe('attack');
  });

  it('ไม่เปิด: Burst ยังเซ็ทอยู่', () => {
    let { s, burst } = hitWithBurstSet();
    s = act(s, { type: 'choose', player: 'p2', pick: 1 });
    expect(s.players.p2.burst).toBe(burst);
    expect(s.players.p2.life).toHaveLength(4);
    expect(s.battle).toBeNull();
  });

  it('ไลฟ์หมดแพ้ทันที Burst ไม่มีโอกาสทำงาน', () => {
    let s = setup([], [BURST_WALL]);
    const burst = handId(s, 'p2', BURST_WALL);
    s.players.p2.hand.splice(s.players.p2.hand.indexOf(burst), 1);
    s.players.p2.burst = burst;
    s.players.p2.life.splice(0, 4);
    const attacker = put(s, 'p1', DARIU, 1);
    s = passBoth(attack(toAttack(s), attacker));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.winner).toBe('p1');
    expect(s.choice).toBeNull();
  });
});

describe('[Consecutive Blade]: มังกรเซ็นโงคุ โซลดราก้อน', () => {
  /** p1 โจมตีด้วยโซลดราก้อน (Core ดวงแรกเป็น Soul Core) */
  function attackWithSolDragon(cores: number, defenders: number[]) {
    let s = setup();
    const dragon = put(s, 'p1', SOL_DRAGON, cores, true);
    const blockers = defenders.map((n) => put(s, 'p2', DARIU, n));
    s = attack(toAttack(s), dragon);
    return { s, dragon, blockers };
  }

  it('ส่ง Soul Core ลงแทรช → ต้องบล็อก 2 ตัว ต่อสู้พร้อมกัน และเสียไลฟ์ต่อผู้ป้องกันที่ถูกทำลาย', () => {
    let { s, dragon, blockers } = attackWithSolDragon(4, [1, 1, 1]);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    s = act(s, { type: 'choose', player: 'p1', pick: 0 });
    expect(s.cards[dragon]!.cores).toHaveLength(3); // Lv2 BP 10000
    expect(s.players.p1.trashCores).toHaveLength(1);
    expect(s.battle).toMatchObject({ consecutiveBlade: true, maxBlockers: 2, mustBlock: true });

    s = passBoth(s);
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blockers[0]! });
    expect(s.battle!.step).toBe('declareBlock'); // ต้องประกาศตัวที่สอง
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blockers[1]! });
    expect(s.battle!.step).toBe('flashAfterBlock');

    s = passBoth(s);
    expect(s.players.p2.trashCards).toEqual(expect.arrayContaining([blockers[0], blockers[1]]));
    expect(s.players.p1.field).toContain(dragon);
    expect(s.players.p2.life).toHaveLength(3);
    expect(s.battle).toBeNull();
  });

  it('ไม่ใช้: บล็อกได้ตัวเดียวตามปกติ และไม่เสียไลฟ์', () => {
    let { s, blockers } = attackWithSolDragon(4, [1, 1]);
    s = act(s, { type: 'choose', player: 'p1', pick: 1 });
    s = act(passBoth(s), { type: 'declareBlock', player: 'p2', blockerId: blockers[0]! });
    expect(s.battle!.step).toBe('flashAfterBlock');
    s = passBoth(s);
    expect(s.players.p2.trashCards).toContain(blockers[0]);
    expect(s.players.p2.life).toHaveLength(5);
  });

  it('ไม่มี Soul Core บนสปิริตนี้: ไม่ถาม', () => {
    let s = setup();
    const dragon = put(s, 'p1', SOL_DRAGON, 4);
    s = attack(toAttack(s), dragon);
    expect(s.choice).toBeNull();
    expect(s.battle!.consecutiveBlade).toBe(false);
  });

  it('คู่แข่งบล็อกได้ตัวเดียว: เข้า Flash timing หลังบล็อกเลย', () => {
    let { s, blockers } = attackWithSolDragon(4, [1]);
    s = act(passBoth(act(s, { type: 'choose', player: 'p1', pick: 0 })), { type: 'declareBlock', player: 'p2', blockerId: blockers[0]! });
    expect(s.battle!.step).toBe('flashAfterBlock');
  });

  it('เทียบ BP กับผู้ป้องกันทีละตัว: แพ้ตัวที่ BP สูงกว่า แต่ยังทำลายตัวที่ BP ต่ำกว่า', () => {
    // Core 2 (Lv1) → ส่ง Soul ลงแทรชเหลือ 1 Core = BP 7000; ผู้ป้องกัน 3000 และ 8000
    let { s, dragon, blockers } = attackWithSolDragon(2, [1, 5]);
    s = act(s, { type: 'choose', player: 'p1', pick: 0 });
    s = act(passBoth(s), { type: 'declareBlock', player: 'p2', blockerId: blockers[0]! });
    s = passBoth(act(s, { type: 'declareBlock', player: 'p2', blockerId: blockers[1]! }));
    expect(s.players.p1.trashCards).toContain(dragon);
    expect(s.players.p2.trashCards).toEqual([blockers[0]]);
    expect(s.players.p2.field).toContain(blockers[1]);
    expect(s.players.p2.life).toHaveLength(5); // เลเวลตอนโจมตีเป็น Lv1 เอฟเฟกต์ไลฟ์ไม่ทำงาน
  });
});

describe('[Consecutive Blade] ตามกติกา 14', () => {
  const KONGO = no('มหานักรบเครื่องกล คองโก'); // ไม่รับผลเอฟเฟกต์สปิริตคู่แข่งในเทิร์นคู่แข่ง (เหมือนมีชีลด์)
  const ORIGAMI = no('โอริงามิ เบิร์ด'); // Brave: ตีระบุสปิริตที่เสื่อมสภาพ

  function blade(defenders: string[]) {
    let s = setup();
    const dragon = put(s, 'p1', SOL_DRAGON, 4, true);
    const ids = defenders.map((c) => put(s, 'p2', c, 1));
    s = attack(toAttack(s), dragon);
    s = passBoth(act(s, { type: 'choose', player: 'p1', pick: 0 }));
    return { s, ids };
  }

  it('ยังมี Flash หลังโจมตีตามปกติ (ข้อควรรู้ 3)', () => {
    let s = setup();
    const dragon = put(s, 'p1', SOL_DRAGON, 4, true);
    put(s, 'p2', DARIU, 1);
    s = act(attack(toAttack(s), dragon), { type: 'choose', player: 'p1', pick: 0 });
    expect(s.battle!.step).toBe('flashBeforeBlock');
  });

  it('ตัวที่มีชีลด์ 1 + ไม่มีชีลด์ 2: ตัวไม่มีชีลด์ทั้งสองต้องป้องกัน ตัวมีชีลด์มาแย่งช่องไม่ได้ (Q&A 5)', () => {
    let { s, ids } = blade([KONGO, DARIU, DARIU]);
    const [kongo, a, b] = ids as [string, string, string];
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: kongo })).toBe('CANNOT_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: a });
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: kongo })).toBe('CANNOT_BLOCK');
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: b });
    expect(s.battle).toMatchObject({ step: 'flashAfterBlock', blockers: [a, b] });
  });

  it('ตัวที่มีชีลด์ 1 + ไม่มีชีลด์ 1: ตัวไม่มีชีลด์ต้องป้องกัน ตัวมีชีลด์ป้องกันด้วยก็ได้ (Q&A 5)', () => {
    let { s, ids } = blade([KONGO, DARIU]);
    const [kongo, a] = ids as [string, string];
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: kongo })).toBe('ok');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: a });
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: kongo })).toBe('ok');
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('ok');
  });

  it('มีแค่ตัวที่มีชีลด์: ไม่ต้องป้องกันก็ได้ (Q&A 4)', () => {
    const { s } = blade([KONGO]);
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('ok');
  });

  it('ใช้ร่วมกับตีระบุ: Consecutive Blade ไม่เกิดผล (ข้อควรรู้ 4)', () => {
    let s = setup();
    const dragon = put(s, 'p1', SOL_DRAGON, 4, true);
    const origami = `t-card-${++seq}`;
    s.cards[origami] = { id: origami, cardNo: ORIGAMI, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[dragon]!.braves.push(origami);
    const tired = put(s, 'p2', DARIU, 1);
    s.cards[tired]!.state = 'exhausted';
    put(s, 'p2', DARIU, 1);
    s = actRaw(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: dragon });
    // เลือกให้ Consecutive Blade ทำงานก่อน แล้วค่อยตีระบุ
    if (s.choice?.kind === 'order') {
      const i = s.choice.effects.findIndex((e) => e.sourceId === dragon);
      s = actRaw(s, { type: 'choose', player: 'p1', pick: i });
    }
    while (s.choice?.kind === 'order') s = actRaw(s, { type: 'choose', player: 'p1', pick: 0 });
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = act(s, { type: 'choose', player: 'p1', pick: 0 });
    expect(s.battle!.consecutiveBlade).toBe(true);
    expect(s.choice).toMatchObject({ kind: 'card' });
    s = act(s, { type: 'choose', player: 'p1', pick: tired });
    expect(s.battle).toMatchObject({ consecutiveBlade: false, maxBlockers: 1, mustBlock: false, direct: true });
  });
});

describe('ฮากาเนะวูม: เลือกผู้ป้องกันของคู่แข่งเมื่อ [True-Rage]/[Consecutive Blade] ทำงาน', () => {
  it('[True-Rage]: เลือกสปิริตที่เสื่อมสภาพของคู่แข่งมาป้องกันได้', () => {
    let s = setup();
    put(s, 'p1', HAGANE, 1);
    const oni = put(s, 'p1', ONIMUSHA, 1); // BP 4000, [True-Rage]
    const tired = put(s, 'p2', DARIU, 1);
    s.cards[tired]!.state = 'exhausted';
    const fresh = put(s, 'p2', DARIU, 5); // BP 8000
    s = attack(toAttack(s), oni);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1', optional: true });
    expect((s.choice as { candidates: string[] }).candidates).toEqual([tired, fresh]);

    s = act(s, { type: 'choose', player: 'p1', pick: tired });
    expect(s.choice).toBeNull(); // True-Rage เลือกได้ 1 ตัว
    s = passBoth(s);
    expect(s.battle).toMatchObject({ step: 'flashAfterBlock', blockers: [tired] });
    s = passBoth(s);
    expect(s.players.p2.trashCards).toContain(tired);
    expect(s.players.p2.field).toContain(fresh);
  });

  it('ไม่เลือก: ฝ่ายป้องกันประกาศบล็อกเองตามปกติ', () => {
    let s = setup();
    put(s, 'p1', HAGANE, 1);
    const oni = put(s, 'p1', ONIMUSHA, 1);
    put(s, 'p2', DARIU, 1);
    s = act(attack(toAttack(s), oni), { type: 'choose', player: 'p1', pick: null });
    s = passBoth(s);
    expect(s.battle).toMatchObject({ step: 'declareBlock', blockers: [] });
  });

  it('[Consecutive Blade]: เลือกได้ 2 ตัว', () => {
    let s = setup();
    put(s, 'p1', HAGANE, 1);
    const dragon = put(s, 'p1', SOL_DRAGON, 4, true);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s.cards[b]!.state = 'exhausted';
    put(s, 'p2', DARIU, 1);
    s = act(attack(toAttack(s), dragon), { type: 'choose', player: 'p1', pick: 0 });
    s = act(s, { type: 'choose', player: 'p1', pick: a });
    expect(s.choice).toMatchObject({ kind: 'card', optional: true });
    s = act(s, { type: 'choose', player: 'p1', pick: b });
    expect(s.choice).toBeNull();
    s = passBoth(s);
    expect(s.battle).toMatchObject({ step: 'flashAfterBlock', blockers: [a, b] });
  });

  it('[Consecutive Blade] เลือกตัวเดียวแล้วหยุด: ฝ่ายป้องกันต้องบล็อกตัวที่สองเอง', () => {
    let s = setup();
    put(s, 'p1', HAGANE, 1);
    const dragon = put(s, 'p1', SOL_DRAGON, 4, true);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = act(attack(toAttack(s), dragon), { type: 'choose', player: 'p1', pick: 0 });
    s = act(s, { type: 'choose', player: 'p1', pick: a });
    s = passBoth(act(s, { type: 'choose', player: 'p1', pick: null }));
    expect(s.battle).toMatchObject({ step: 'declareBlock', blockers: [a] });
    expect(fails(s, { type: 'noBlock', player: 'p2' })).toBe('MUST_BLOCK');
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: b });
    expect(s.battle).toMatchObject({ step: 'flashAfterBlock', blockers: [a, b] });
  });

  it('ไม่ทำงานในเทิร์นของคู่แข่ง', () => {
    let s = setup();
    put(s, 'p2', HAGANE, 1);
    const oni = put(s, 'p1', ONIMUSHA, 1);
    put(s, 'p2', DARIU, 1);
    s = attack(toAttack(s), oni);
    expect(s.choice).toBeNull();
  });
});

describe('เอฟเฟกต์เกิดพร้อมกัน: เจ้าของเลือกลำดับ แต่ละอันเกิดผลทันที', () => {
  it('โอนิมุฉะไรซันโจมตี (2 เอฟเฟกต์): ถามลำดับ เลือกอันที่สองก่อนได้ แล้วอันแรกตามมาเอง', () => {
    let s = setup();
    const jinrai = put(s, 'p1', ONIMUSHA, 1);
    s = toAttack(s);
    s = actRaw(s, { type: 'declareAttack', player: 'p1', attackerId: jinrai });
    expect(s.choice).toMatchObject({ kind: 'order', player: 'p1' });
    if (s.choice?.kind !== 'order') throw new Error('no order');
    expect(s.choice.effects).toHaveLength(2);
    const second = s.choice.effects[1]!;
    const r = applyAction(s, { type: 'choose', player: 'p1', pick: 1 }, db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // อันที่เลือกประกาศก่อน แล้วอันที่เหลือ (เหลืออันเดียว ไม่ต้องถามอีก)
    const resolving = r.events.filter((e) => e.type === 'effectResolving');
    expect(resolving[0]).toMatchObject({ cardId: second.sourceId, source: second.source });
    expect(resolving).toHaveLength(2);
    expect(r.state.choice?.kind).not.toBe('order');
  });

  it('ถามได้เฉพาะเจ้าของเอฟเฟกต์', () => {
    let s = setup();
    const jinrai = put(s, 'p1', ONIMUSHA, 1);
    s = toAttack(s);
    s = actRaw(s, { type: 'declareAttack', player: 'p1', attackerId: jinrai });
    expect(fails(s, { type: 'choose', player: 'p2', pick: 0 })).toBe('NOT_YOUR_CHOICE');
    expect(fails(s, { type: 'choose', player: 'p1', pick: 5 })).toBe('INVALID_PICK');
  });

  it('เอฟเฟกต์เดียว: ไม่ถาม และประกาศ effectResolving', () => {
    let s = setup();
    const draw = put(s, 'p1', SOUL_DRAW, 1);
    s = toAttack(s);
    const r = applyAction(s, { type: 'declareAttack', player: 'p1', attackerId: draw }, db);
    expect(r.ok && r.state.choice?.kind).not.toBe('order');
  });
});
