import { describe, expect, it } from 'vitest';
import { loadStarterCards, SD03_DECK } from '@bs/cards';
import { applyAction, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadStarterCards();
const no = (name: string, set = 'SD03') => db.all().find((c) => c.name === name && c.cardNo.startsWith(set))!.cardNo;

const WING = no('โดจิวิหคเขียว'); // คอสต์ 0 BP 1000/2000 (1/3)
const SEA = no('โดจิทะเลฟ้า'); // [Crush] BP 5000/6000/8000 (1/2/4)
const WHITE = no('โดจินกาขาว'); // เอฟเฟกต์แทนที่การถูกทำลาย คอสต์ 3
const SQUID = no('ยาริสควิด'); // ไม่มีเอฟเฟกต์ คอสต์ 3 BP 7000/14000 (1/4)
const WATER = no('เมียวโอญาณวารี'); // BP 4000/5000/6000 (1/2/4)
const HYDRA = no('เรือมังกรคู่ ไฮดร้าชิพ'); // Brave คอสต์ 4: ผู้ร่วมร่าง BP+4000
const TEMPLE = no('อารามคันนงพันรูป'); // Nexus Lv1 Core 0, Lv2 Core 1
const BLESS = no('โซเกคิ เบลส'); // Magic [Flash] ทำลาย 2 ตัว
const DEEP = no('เมียวโอทะเลคราม'); // คอสต์ 6 BP 5000/10000 (1/4)
const RED = no('เมียวโอดาบแดง'); // BP 4000/7000/9000 (1/2/4)
const MANTRA = no('มนตราดรอว์'); // Magic [Main] จั่ว 3 ทิ้ง 2
const REDEEM = no('เมียวโอแห่งการไถ่บาป'); // คอสต์ 10 BP 10000/15000/18000 (1/3/6)
const NIRVANA = no('ฮะไดเมียวโอ เนอวาน่า'); // คอสต์ 9 BP 7000/11000/13000/35000 (1/3/4/10)
const BLUE = no('เมียวโอดาบฟ้า'); // BP 4000/8000 (1/3)
const BURST_WALL = no('เบิร์สวอลล์'); // Magic คอสต์ 4 มีเอฟเฟกต์ Burst
const DARIU = no('มุฉะดาริว', 'SD01'); // คอสต์ 1 ไม่มีเอฟเฟกต์ BP 3000/6000/8000 (1/3/5)
const FONG = no('ราชาผึ้ง ฟง-นี้ด', 'SD02'); // คอสต์ 7
const PANTHER = no('นินจาเขี้ยวพิศวง รับแพนเธอร์', 'SD02'); // คอสต์ 3: Lv2 BP+4000 ถ้ารีเสิร์ฟมีโซลคอร์
const SOULDRAW = no('โซลดรอว์', 'SD01'); // Magic คอสต์ 5

/** เกมไม่สับเด็ค p1 เริ่มก่อนและโจมตีได้เทิร์นแรก ที่เหลือในเด็คเป็นมุฉะดาริว (คอสต์ 1)
 *  top = ใบบนสุดของเด็คหลังจั่วมือเริ่มต้น 4 ใบ (ใบที่จะถูกทิ้งก่อน) */
function setup(p1: string[] = [], p2: string[] = []): GameState {
  const filler = Array<string>(4).fill(DARIU);
  const build = (top: string[]) => [...filler, ...top, ...Array<string>(36 - top.length).fill(DARIU)];
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
/** การ์ดใหม่บนมือ */
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].hand.push(id);
  return id;
}

function actRaw(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}
function act(s: GameState, action: Action): GameState {
  let next = actRaw(s, action);
  while (next.choice?.kind === 'order') next = actRaw(next, { type: 'choose', player: next.choice.player, pick: 0 });
  return next;
}
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const normalReserve = (s: GameState, player: PlayerId) => s.players[player].reserve.filter((id) => !s.cores[id]!.isSoul);
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const attack = (s: GameState, attackerId: string) => act(s, { type: 'declareAttack', player: 'p1', attackerId });
const trashCount = (s: GameState, p: PlayerId) => s.players[p].trashCards.length;
const pay = (s: GameState, player: PlayerId, cardNo: string) => normalReserve(s, player).slice(0, payableCost(s, db, player, db.get(cardNo)));

describe('SD03 ข้อมูล', () => {
  it('ทุกบรรทัดเอฟเฟกต์มีสคริปต์ และเด็คครบ 40 ใบ', () => {
    for (const card of db.all().filter((c) => c.cardNo.startsWith('SD03'))) {
      expect(card.abilities.length, card.name).toBe(card.effects.length);
    }
    expect(SD03_DECK.reduce((n, e) => n + e.count, 0)).toBe(40);
  });
});

describe('SD03 ทิ้งเด็คคู่แข่ง', () => {
  it('โดจิทะเลฟ้า [Crush]: ทิ้งเด็คคู่แข่งเท่าเลเวล', () => {
    const s = setup();
    const id = put(s, 'p1', SEA, 2); // Lv2
    const after = attack(toAttack(s), id);
    expect(trashCount(after, 'p2')).toBe(2);
  });

  it('เมียวโอทะเลคราม Lv2: ทิ้ง 7 แล้วส่ง Soul Core ลงแทรชเพื่อทิ้งอีก 7', () => {
    const s = setup();
    const id = put(s, 'p1', DEEP, 4, true);
    let x = attack(toAttack(s), id);
    expect(trashCount(x, 'p2')).toBe(7);
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 0);
    expect(trashCount(x, 'p2')).toBe(14);
    expect(x.cards[id]!.cores.some((c) => x.cores[c]!.isSoul)).toBe(false);
    expect(x.choice).toBeNull();
  });

  it('เมียวโอดาบแดง Lv2: ทิ้งเจอเมจิค → ทำลายสปิริตคอสต์ไม่เกิน 5 ของคู่แข่ง', () => {
    const s = setup([], [DARIU, SOULDRAW, DARIU]);
    const target = put(s, 'p2', SQUID, 1);
    const id = put(s, 'p1', RED, 2);
    let x = attack(toAttack(s), id);
    expect(x.choice?.kind).toBe('card');
    x = choose(x, target);
    expect(x.players.p2.field).not.toContain(target);
  });

  it('เมียวโอดาบแดง: แอทแท็คสเต็ปของเรา เอฟเฟกต์สปิริตคอสต์ไม่เกิน 4 ของคู่แข่งไม่ทำงาน', () => {
    const s = setup();
    const panther = put(s, 'p2', PANTHER, 2); // BP 3000 + 4000 (รีเสิร์ฟมีโซลคอร์)
    put(s, 'p1', RED, 1);
    expect(currentBp(s, db, panther)).toBe(7000);
    const x = toAttack(s);
    expect(currentBp(x, db, panther)).toBe(3000);
  });

  it('เรือมังกรคู่ ไฮดร้าชิพ: ผู้ร่วมร่าง BP+4000, โจมตีทิ้ง 1 ใบ เจอคอสต์ 6+ → ฟื้นสภาพ', () => {
    const s = setup([], [FONG]);
    const host = put(s, 'p1', SQUID, 1);
    const brave = `t-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: HYDRA, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(brave);
    expect(currentBp(s, db, host)).toBe(11000);
    const x = attack(toAttack(s), host);
    expect(trashCount(x, 'p2')).toBe(1);
    expect(x.cards[host]!.state).toBe('refresh');
  });

  it('ลำดับ Chain: ดาบแดงทิ้งเด็ค → อาราม → ไฮดร้าชิพ (เกิดพร้อมกันตอนโจมตี) → อาราม', () => {
    const s = setup();
    const temple = put(s, 'p1', TEMPLE, 1);
    const red = put(s, 'p1', RED, 2, true);
    const brave = `t-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: HYDRA, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[red]!.braves.push(brave);
    const x = attack(toAttack(s), red);
    const order = x.log.flatMap((e) => (e.type === 'effectResolving' ? [e.cardId] : []));
    expect(order).toEqual([red, temple, brave, temple]);
    expect(trashCount(x, 'p2')).toBe(3 + 5 + 1 + 5);
  });

  it('ลำดับ Chain: หน้าเลือกเอฟเฟกต์มีเอฟเฟกต์ของ Brave ที่ยังค้างอยู่ด้วย (ทะเลคราม Lv2 + ไฮดร้าชิพ + อาราม)', () => {
    const s = setup();
    put(s, 'p1', TEMPLE, 1);
    const deep = put(s, 'p1', DEEP, 4, true);
    const brave = `t-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: HYDRA, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[deep]!.braves.push(brave);
    let x = actRaw(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: deep });
    expect(x.choice?.kind).toBe('order');
    x = actRaw(x, { type: 'choose', player: 'p1', pick: 0 }); // ทะเลคราม ทิ้ง 7 → อาราม + ทะเลคราม Lv2 เกิด
    expect(x.choice?.kind === 'order' && x.choice.effects.map((e) => e.sourceId)).toContain(brave);
  });

  it('ทะเลคราม Lv2 เกิดสองครั้ง (ทิ้ง 7 ของตัวเอง + ทิ้ง 1 ของไฮดร้าชิพ): หน้าเลือกรวมเป็นอันเดียว และใช้ Soul Core ได้ครั้งเดียว', () => {
    const s = setup();
    put(s, 'p1', TEMPLE, 1);
    const deep = put(s, 'p1', DEEP, 4, true);
    const brave = `t-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: HYDRA, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[deep]!.braves.push(brave);
    let x = actRaw(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: deep });
    const pickSource = (st: GameState, sourceId: string) => {
      if (st.choice?.kind !== 'order') throw new Error('ไม่ใช่หน้าเลือกลำดับ');
      return actRaw(st, { type: 'choose', player: 'p1', pick: st.choice.effects.findIndex((e) => e.sourceId === sourceId) });
    };
    x = pickSource(x, deep); // ทะเลคราม ทิ้ง 7 → ทะเลคราม Lv2 + อาราม เกิด
    x = pickSource(x, brave); // ไฮดร้าชิพ (ให้ทะเลคราม) ทิ้ง 1 → ทะเลคราม Lv2 เกิดอีกครั้ง + อาราม
    expect(x.choice?.kind).toBe('order');
    if (x.choice?.kind !== 'order') return;
    // ทะเลคราม Lv2 สองอันมี key เดียวกัน (หน้าจอรวมเป็น ×2)
    const deepKeys = x.choice.effects.filter((e) => e.sourceId === deep).map((e) => e.key);
    expect(deepKeys).toHaveLength(2);
    expect(new Set(deepKeys).size).toBe(1);

    // ใช้ Soul Core ครั้งแรก → ครั้งที่สองไม่มี Soul Core แล้ว จึงไม่ถามอีก
    x = pickSource(x, deep);
    expect(x.choice?.kind).toBe('option');
    const before = trashCount(x, 'p2');
    x = choose(x, 0);
    expect(trashCount(x, 'p2')).toBeGreaterThanOrEqual(before + 7);
    expect(x.cards[deep]!.cores.some((id) => x.cores[id]!.isSoul)).toBe(false);
    while (x.choice?.kind === 'order') x = actRaw(x, { type: 'choose', player: 'p1', pick: 0 });
    expect(x.choice?.kind === 'option' && x.choice.sourceId === deep).toBe(false);
  });

  it('เอฟเฟกต์ที่เหมือนกันทุกอย่างค้างอยู่สองอัน (ไม่มีอันอื่น): ไม่ต้องถามลำดับ', () => {
    const s = setup();
    const deep = put(s, 'p1', DEEP, 4, true);
    const brave = `t-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: HYDRA, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[deep]!.braves.push(brave);
    let x = actRaw(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: deep });
    if (x.choice?.kind !== 'order') throw new Error('ต้องเลือกลำดับตอนโจมตี');
    x = actRaw(x, { type: 'choose', player: 'p1', pick: x.choice.effects.findIndex((e) => e.sourceId === deep) }); // ทิ้ง 7 → Lv2
    if (x.choice?.kind !== 'order') throw new Error('ต้องเลือกระหว่าง Lv2 กับไฮดร้าชิพ');
    x = actRaw(x, { type: 'choose', player: 'p1', pick: x.choice.effects.findIndex((e) => e.sourceId === brave) }); // ทิ้ง 1 → Lv2 อีกอัน
    // เหลือทะเลคราม Lv2 สองอันที่เหมือนกัน: ไปที่ตัวเลือกใช้ Soul Core เลย
    expect(x.choice?.kind).toBe('option');
  });

  it('เมียวโอญาณวารี Lv2: เมจิคถูกทิ้งในแอทแท็คสเต็ปของเรา → คอร์วอยด์ 1 เม็ดบนสปิริตเรา', () => {
    const s = setup([], [SOULDRAW]);
    const water = put(s, 'p1', WATER, 2);
    const sea = put(s, 'p1', SEA, 1);
    let x = attack(toAttack(s), sea);
    expect(x.choice?.kind).toBe('card');
    x = choose(x, water);
    expect(x.cards[water]!.cores).toHaveLength(3);
  });

  it('อารามคันนงพันรูป Lv2: สปิริตที่มีโซลคอร์ทิ้งเด็คด้วยเอฟเฟกต์เมื่อโจมตี → ทิ้งเพิ่ม 5', () => {
    const s = setup();
    put(s, 'p1', TEMPLE, 1);
    const sea = put(s, 'p1', SEA, 1, true);
    const x = attack(toAttack(s), sea);
    expect(trashCount(x, 'p2')).toBe(1 + 5);
  });

  it('ฮะไดเมียวโอ เนอวาน่า: ทำลายสปิริตคอสต์สูงสุด แล้วทิ้งเด็คเท่าคอสต์', () => {
    const s = setup();
    const big = put(s, 'p2', FONG, 1); // คอสต์ 7
    put(s, 'p2', SQUID, 1);
    const id = put(s, 'p1', NIRVANA, 1);
    const x = attack(toAttack(s), id);
    expect(x.players.p2.field).not.toContain(big);
    expect(trashCount(x, 'p2')).toBe(1 + 7); // ฟง-นี้ด + ทิ้งเด็ค 7
  });

  it('เนอวาน่า Lv2 (โซลคอร์): คอสต์ 3 ถูกทิ้งโดยเอฟเฟกต์ของเมียวโอ → สปิริตนั้นฟื้นสภาพ', () => {
    const s = setup([], [SQUID]);
    put(s, 'p1', NIRVANA, 3, true);
    const deep = put(s, 'p1', DEEP, 1);
    const x = attack(toAttack(s), deep);
    expect(x.cards[deep]!.state).toBe('refresh');
  });

  it('เมียวโอแห่งการไถ่บาป: การ์ดที่มีเบิร์สถูกทิ้ง → อัญเชิญจากมือไม่จ่ายคอสต์', () => {
    const s = setup([], [BURST_WALL]);
    const card = inHand(s, 'p1', REDEEM);
    const deep = put(s, 'p1', DEEP, 1);
    let x = attack(toAttack(s), deep);
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 0);
    expect(x.choice?.kind).toBe('placeCores');
    x = choose(x, { pay: normalReserve(x, 'p1').slice(0, 1) });
    expect(x.players.p1.field).toContain(card);
  });

  it('เมียวโอดาบฟ้า: ทิ้ง 3 + (โซลคอร์) นำสปิริตวิญญาณนักรบในแทรชกลับขึ้นมือ', () => {
    const s = setup();
    const old = `t-card-${++seq}`;
    s.cards[old] = { id: old, cardNo: DEEP, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p1.trashCards.push(old);
    const id = put(s, 'p1', BLUE, 1, true);
    let x = attack(toAttack(s), id);
    expect(trashCount(x, 'p2')).toBe(3);
    x = choose(x, old);
    expect(x.players.p1.hand).toContain(old);
  });
});

describe('SD03 ถูกทำลาย', () => {
  it('โซเกคิ เบลส: ทำลาย 2 ตัว แล้วทิ้งเด็คเท่าคอสต์รวม', () => {
    const s = setup();
    const a = put(s, 'p2', SQUID, 1); // คอสต์ 3
    const b = put(s, 'p2', PANTHER, 1); // คอสต์ 3
    const magic = inHand(s, 'p1', BLESS);
    let x = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: pay(s, 'p1', BLESS), timing: 'flash' });
    x = choose(x, a);
    x = choose(x, b);
    expect(x.players.p2.field).toHaveLength(0);
    expect(trashCount(x, 'p2')).toBe(2 + 6);
  });

  it('โดจินกาขาว: เมื่อถูกทำลายโดยเอฟเฟกต์คู่แข่ง ทิ้งเด็คคู่แข่ง 3 ใบแล้วอยู่ต่อแบบเสื่อมสภาพ', () => {
    const s = setup();
    const white = put(s, 'p2', WHITE, 1);
    const magic = inHand(s, 'p1', BLESS);
    let x = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: pay(s, 'p1', BLESS), timing: 'flash' });
    x = choose(x, white);
    expect(x.choice?.kind).toBe('option');
    expect(x.choice?.player).toBe('p2');
    x = choose(x, 0);
    expect(x.players.p2.field).toContain(white);
    expect(x.cards[white]!.state).toBe('exhausted');
    expect(trashCount(x, 'p1')).toBe(3 + 1); // เด็ค p1 ถูกทิ้ง 3 + โซเกคิ เบลส
    // ถือว่าถูกทำลายแล้ว: ทิ้งเด็คคู่แข่งตามคอสต์ของตัวนี้ (3)
    expect(trashCount(x, 'p2')).toBe(3);
  });

  it('โดจินกาขาว: ตัวที่รอดถือว่าถูกทำลายแล้ว → เอฟเฟกต์ "เมื่อถูกทำลายโดยคู่แข่ง" ทำงาน', () => {
    const s = setup();
    put(s, 'p2', WHITE, 1);
    const wing = put(s, 'p2', WING, 1);
    const magic = inHand(s, 'p1', BLESS);
    let x = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: pay(s, 'p1', BLESS), timing: 'flash' });
    x = choose(x, wing);
    x = choose(x, 0); // โดจินกาขาว: ทิ้งเด็ค p1 3 ใบ ให้โดจิวิหคเขียวอยู่ต่อ
    expect(x.players.p2.field).toContain(wing);
    expect(x.log.some((e) => e.type === 'abilityTriggered' && e.cardId === wing)).toBe(true);
  });

  it('โดจิวิหคเขียว: ถูกทำลายโดยคู่แข่ง → อัญเชิญเมียวโอจากมือ (มีโซลคอร์ = ลดคอสต์ครบ)', () => {
    const s = setup();
    const wing = put(s, 'p1', WING, 1, true);
    const deep = inHand(s, 'p1', DEEP); // คอสต์ 6 ลด ฟ้า 3 → จ่าย 3
    put(s, 'p2', SQUID, 1); // BP 7000 ป้องกัน
    let x = attack(toAttack(s), wing);
    while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
    x = act(x, { type: 'declareBlock', player: 'p2', blockerId: x.players.p2.field[0]! });
    while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
    expect(x.players.p1.field).not.toContain(wing);
    expect(x.choice?.kind).toBe('card');
    x = choose(x, deep);
    expect(x.choice?.kind).toBe('payCost');
    expect(x.choice?.kind === 'payCost' && x.choice.cost).toBe(3);
    x = choose(x, { pay: normalReserve(x, 'p1').slice(0, 3) });
    x = choose(x, { pay: normalReserve(x, 'p1').slice(0, 1) });
    expect(x.players.p1.field).toContain(deep);
  });

  it('มนตราดรอว์: จั่ว 3 ทิ้ง 2 (มีโซลคอร์บนเมียวโอ/โดจิ = ทิ้ง 1)', () => {
    const s = setup();
    const m1 = inHand(s, 'p1', MANTRA);
    let x = act(s, { type: 'useMagic', player: 'p1', cardId: m1, payment: pay(s, 'p1', MANTRA), timing: 'main' });
    const before = x.players.p1.hand.length;
    x = choose(x, x.players.p1.hand[0]!);
    x = choose(x, x.players.p1.hand[0]!);
    expect(x.players.p1.hand.length).toBe(before - 2);
    expect(x.choice).toBeNull();

    const t = setup();
    put(t, 'p1', SEA, 1, true);
    const m2 = inHand(t, 'p1', MANTRA);
    let y = act(t, { type: 'useMagic', player: 'p1', cardId: m2, payment: pay(t, 'p1', MANTRA), timing: 'main' });
    y = choose(y, y.players.p1.hand[0]!);
    expect(y.choice).toBeNull();
  });
});
