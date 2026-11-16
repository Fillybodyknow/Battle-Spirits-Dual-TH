import { describe, expect, it } from 'vitest';
import { loadStarterCards } from '@bs/cards';
import { applyAction, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadStarterCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;

const RIKA = no('มารสายลม ชิโนบิริกะ'); // วายุนินจา BP 2000/4000 (1/3)
const PANTHER = no('นินจาเขี้ยวพิศวง รับแพนเธอร์'); // BP 2000/3000 (1/2)
const NINKO = no('มารวายุ นินโควโชว'); // Quick, คอสต์ 3
const KABUTO = no('นินจาผีเสื้อราตรีสวมเกราะ ชูริคาบุโตะ');
const KUWAGA = no('ผู้นำแห่งผีเสื้อราตรีสวมเกราะ คุวากะสเลเยอร์'); // BP 4000/10000/32000 (1/2/12)
const TOBIKAGE = no('นินจาผีเสื้อราตรีสวมเกราะ โทบิคาเงะ'); // BP 5000/8000 (1/3)
const TEPPO = no('เท็ปโปนานะฟุชิ'); // Brave คอสต์ 4
const KURO = no('ชิโนบิโชกุน คุโระฮางาเนะ'); // Soul Burst, BP 6000/12000 (1/3)
const KOGANE = no('ชิโนบิโคงาเนะ');
const BENI = no('มารวายุ เบนิมาโทอิ');
const HIWIND = no('นินจาชั้นสูงแห่งมารวายุ ไฮวินด์'); // Soul Burst, BP 4000/6000 (1/3)
const SHURIKEN = no('ชูริเคนพันเล่ม');
const KIRIKAGE = no('นินจาสลาตัน คิริคาเงะ'); // Soul Quick, BP 6000/10000/13000 (1/3/5)
const FONG = no('ราชาผึ้ง ฟง-นี้ด'); // BP 6000/10000 (1/4)
const DARIU = no('มุฉะดาริว'); // SD01 ไม่มีเอฟเฟกต์ BP 3000/6000/8000 (1/3/5) คอสต์ 4
const BURST_WALL = no('เบิร์สวอลล์');
const KABURYU = no('คาบุริว ดรอว์'); // Magic [Main]: จั่ว 2

/** เกมไม่สับเด็ค p1 เริ่มก่อนและโจมตีได้เทิร์นแรก ที่เหลือในเด็คเป็นมุฉะดาริว */
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
/** วางการ์ดบนสนามโดยตรง พร้อม Core ใหม่ (soul = ดวงแรกเป็น Soul Core) */
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

/** นำการ์ดจากเด็ค/มือไปไว้ที่ช่อง Burst */
function setBurst(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].burst = id;
  return id;
}

function actRaw(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}
/** ตอบ "เลือกลำดับเอฟเฟกต์" ด้วยลำดับเดิมอัตโนมัติ */
function act(s: GameState, action: Action): GameState {
  let next = actRaw(s, action);
  while (next.choice?.kind === 'order') next = actRaw(next, { type: 'choose', player: next.choice.player, pick: 0 });
  return next;
}
function fails(s: GameState, action: Action): string {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
}
const choose = (s: GameState, pick: Action extends never ? never : Extract<Action, { type: 'choose' }>['pick']) =>
  act(s, { type: 'choose', player: s.choice!.player, pick });
const handId = (s: GameState, player: PlayerId, cardNo: string) => s.players[player].hand.find((id) => s.cards[id]!.cardNo === cardNo)!;
const normalReserve = (s: GameState, player: PlayerId) => s.players[player].reserve.filter((id) => !s.cores[id]!.isSoul);
const soulOf = (s: GameState, player: PlayerId) => s.players[player].reserve.find((id) => s.cores[id]!.isSoul)!;
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const attack = (s: GameState, attackerId: string) => act(s, { type: 'declareAttack', player: 'p1', attackerId });
const pass = (s: GameState) => act(s, { type: 'passFlash', player: s.battle!.flash!.priority });
const passBoth = (s: GameState) => pass(pass(s));
/** วางผู้โจมตีบนสนามแล้วโจมตี */
const atk = (s: GameState, cardNo: string, cores: number, soul = false) => {
  const id = put(s, 'p1', cardNo, cores, soul);
  return attack(toAttack(s), id);
};
/** Core ธรรมดาจากรีเสิร์ฟเท่าคอสต์ที่ต้องจ่าย (soul = ใช้ Soul Core ร่วมจ่าย 1 ดวง) */
const pay = (s: GameState, player: PlayerId, cardNo: string, soul = false) => {
  const cost = payableCost(s, db, player, db.get(cardNo));
  const normal = normalReserve(s, player).slice(0, soul ? cost - 1 : cost);
  return soul ? [...normal, soulOf(s, player)] : normal;
};
/** Core ธรรมดาในรีเสิร์ฟที่ไม่ได้ใช้จ่าย */
const spare = (s: GameState, player: PlayerId, payment: string[], n: number) =>
  normalReserve(s, player).filter((id) => !payment.includes(id)).slice(0, n);
const soulCount = (s: GameState, id: string) => s.cards[id]!.cores.filter((c) => s.cores[c]!.isSoul).length;
/** เอา Soul Core ออกจากรีเสิร์ฟ (ไม่ให้เงื่อนไข "รีเสิร์ฟมีโซลคอร์" เป็นจริง) */
const dropReserveSoul = (s: GameState, player: PlayerId) => {
  const soul = soulOf(s, player);
  s.players[player].reserve.splice(s.players[player].reserve.indexOf(soul), 1);
  s.players[player].trashCores.push(soul);
};

describe('SD02 ข้อมูล', () => {
  it('ทุกบรรทัดเอฟเฟกต์มีสคริปต์', () => {
    for (const card of db.all().filter((c) => c.cardNo.startsWith('SD02'))) {
      expect(card.abilities.length, card.name).toBe(card.effects.length);
    }
  });
});

describe('รับแพนเธอร์', () => {
  it('โจมตี/ป้องกัน: วางคอร์วอยด์บนตัวเอง, Lv2 + รีเสิร์ฟมีโซลคอร์ BP+4000', () => {
    let s = setup();
    const p = put(s, 'p1', PANTHER, 1);
    s = attack(toAttack(s), p);
    expect(s.cards[p]!.cores).toHaveLength(2);
    expect(currentBp(s, db, p)).toBe(3000 + 4000);
    dropReserveSoul(s, 'p1');
    expect(currentBp(s, db, p)).toBe(3000);

    let t = setup();
    const blocker = put(t, 'p2', PANTHER, 1);
    t = passBoth(atk(t, DARIU, 1));
    t = act(t, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    expect(t.cards[blocker]!.cores).toHaveLength(2);
  });
});

describe('[Quick] / [Soul Quick]', () => {
  it('นินโควโชว: อัญเชิญใน Flash ด้วยคอร์จากรีเสิร์ฟเท่านั้น → เสื่อมสภาพสปิริตคู่แข่ง, จ่ายด้วยโซล = คอร์วอยด์อีก 1', () => {
    let s = setup([], [NINKO]);
    const attacker = put(s, 'p1', DARIU, 1);
    const helper = put(s, 'p2', DARIU, 2);
    s = attack(toAttack(s), attacker);
    expect(s.battle!.flash!.priority).toBe('p2');
    const ninko = handId(s, 'p2', NINKO);
    const r = normalReserve(s, 'p2');
    // คอร์บนการ์ดในสนามใช้ไม่ได้
    expect(
      fails(s, { type: 'summon', player: 'p2', cardId: ninko, payment: [...r.slice(0, 2), s.cards[helper]!.cores[0]!], placement: [r[3]!] }),
    ).toBe('RESERVE_ONLY');
    s = act(s, { type: 'summon', player: 'p2', cardId: ninko, payment: [...r.slice(0, 2), soulOf(s, 'p2')], placement: [r[3]!] });
    expect(s.players.p2.field).toContain(ninko);
    expect(s.choice).toBeNull(); // ผู้โจมตีเสื่อมสภาพอยู่แล้ว: ไม่มีเป้าหมาย
    expect(s.cards[ninko]!.cores).toHaveLength(2); // จ่ายด้วยโซล → คอร์วอยด์
  });

  it('นินโควโชว: เสื่อมสภาพเป้าหมาย + จ่ายด้วยโซล ได้คอร์วอยด์', () => {
    let s = setup([], [NINKO]);
    const attacker = put(s, 'p1', DARIU, 1);
    const other = put(s, 'p1', DARIU, 1);
    s = attack(toAttack(s), attacker);
    const r = normalReserve(s, 'p2');
    s = act(s, { type: 'summon', player: 'p2', cardId: handId(s, 'p2', NINKO), payment: [r[0]!, r[1]!, soulOf(s, 'p2')], placement: [r[2]!] });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [other] });
    s = choose(s, other);
    expect(s.cards[other]!.state).toBe('exhausted');
    const ninko = s.players.p2.field.at(-1)!;
    expect(s.cards[ninko]!.cores).toHaveLength(2);
    expect(s.battle!.flash!.priority).toBe('p1'); // อัญเชิญแล้วสลับสิทธิ์
  });

  it('[Quick] ไม่มีใน Main Step ของคู่แข่ง / การ์ดไม่มี [Quick] อัญเชิญใน Flash ไม่ได้', () => {
    let s = setup([], [RIKA]);
    s = atk(s, DARIU, 1);
    const r = normalReserve(s, 'p2');
    expect(fails(s, { type: 'summon', player: 'p2', cardId: handId(s, 'p2', RIKA), payment: [r[0]!], placement: [r[1]!] })).toBe('WRONG_PHASE');
  });

  it('คิริคาเงะ [Soul Quick]: จ่ายคอสต์ทั้งหมดด้วยโซลคอร์ในรีเสิร์ฟ 1 ดวง', () => {
    let s = setup([], [KIRIKAGE]);
    s = atk(s, DARIU, 1);
    const kiri = handId(s, 'p2', KIRIKAGE);
    const r = normalReserve(s, 'p2');
    expect(fails(s, { type: 'summon', player: 'p2', cardId: kiri, payment: [r[0]!], placement: [r[1]!] })).toBe('WRONG_PAYMENT');
    const soul = soulOf(s, 'p2');
    s = act(s, { type: 'summon', player: 'p2', cardId: kiri, payment: [soul], placement: r.slice(0, 3) });
    expect(s.players.p2.field).toContain(kiri);
    expect(s.cards[kiri]!.cores).toHaveLength(3);
    expect(s.players.p2.trashCores).toContain(soul);
  });
});

describe('ชิโนบิริกะ', () => {
  it('สปิริตวายุนินจาที่มีโซลคอร์โจมตี: นำสปิริตเสื่อมสภาพของคู่แข่งกลับขึ้นมือ', () => {
    let s = setup();
    put(s, 'p1', RIKA, 1);
    const attacker = put(s, 'p1', BENI, 1, true);
    const tired = put(s, 'p2', DARIU, 2);
    s.cards[tired]!.state = 'exhausted';
    s = attack(toAttack(s), attacker);
    // เบนิมาโทอิ: คอร์วอยด์ลงรีเสิร์ฟ + เสื่อมสภาพ (ไม่มีเป้าหมายที่ฟื้นสภาพ) / ริกะ: เลือกตัวที่เสื่อมสภาพ
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [tired] });
    s = choose(s, tired);
    expect(s.players.p2.hand).toContain(tired);
    expect(s.players.p2.field).not.toContain(tired);
  });

  it('ผู้โจมตีไม่มีโซลคอร์: ไม่ทำงาน', () => {
    let s = setup();
    put(s, 'p1', RIKA, 1);
    const tired = put(s, 'p2', DARIU, 2);
    s.cards[tired]!.state = 'exhausted';
    s = atk(s, BENI, 1);
    expect(s.choice).toBeNull();
    expect(s.players.p2.field).toContain(tired);
  });
});

describe('แสดงใบบนสุดเด็คแล้วอัญเชิญไม่จ่ายคอสต์', () => {
  it('ชูริคาบุโตะ: ส่งโซลไปรีเสิร์ฟ แสดง 1 ใบ เป็นวายุนินจา → อัญเชิญ วาง Core จากรีเสิร์ฟ', () => {
    let s = setup([DARIU, DARIU, DARIU, DARIU, DARIU, BENI]);
    const kabuto = put(s, 'p1', KABUTO, 1, true);
    s = attack(toAttack(s), kabuto);
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, 0);
    expect(soulCount(s, kabuto)).toBe(0);
    expect(s.cards[kabuto]!.cores).toHaveLength(0);
    // Core หมด = สูญสลาย แต่เอฟเฟกต์ยังทำต่อ
    const beni = s.players.p1.deck[0]!;
    expect(s.choice).toMatchObject({ kind: 'multiSummon', candidates: [beni], revealed: [beni], max: 1 });
    expect(fails(s, { type: 'choose', player: 'p1', pick: { summons: [{ cardId: beni, cores: [] }] } })).toBe('NOT_ENOUGH_CORES');
    s = choose(s, { summons: [{ cardId: beni, cores: normalReserve(s, 'p1').slice(0, 3) }] });
    expect(s.players.p1.field).toContain(beni);
    expect(s.cards[beni]!.cores).toHaveLength(3);
  });

  it('ชูริคาบุโตะ: ใบที่แสดงไม่ใช่วายุนินจา → ไว้ใต้สุดเด็ค', () => {
    let s = setup();
    const kabuto = put(s, 'p1', KABUTO, 3, true);
    const top = s.players.p1.deck[0]!;
    s = choose(attack(toAttack(s), kabuto), 0);
    expect(s.choice).toBeNull();
    expect(s.players.p1.deck.at(-1)).toBe(top);
  });

  it('คุวากะสเลเยอร์ Lv2: เลือกหลายใบทีเดียว ลงพร้อมกัน (กำหนด Core แต่ละใบ) trigger ถูกอัญเชิญเกิดพร้อมกัน', () => {
    let s = setup([DARIU, DARIU, DARIU, DARIU, DARIU, KOGANE, BENI, TOBIKAGE]);
    const kuwaga = put(s, 'p1', KUWAGA, 2, true);
    s = attack(toAttack(s), kuwaga); // Lv1-3: คอร์วอยด์ 1 / Lv2-3: โซล → แสดง 3
    expect(s.cards[kuwaga]!.cores).toHaveLength(3);
    s = choose(s, 0);
    const [kogane, beni, tobi] = s.players.p1.deck.slice(0, 3) as [string, string, string];
    expect(s.choice).toMatchObject({ kind: 'multiSummon', candidates: [kogane, beni, tobi], max: null });
    const r = normalReserve(s, 'p1');
    // ใช้ Core ซ้ำไม่ได้
    expect(fails(s, { type: 'choose', player: 'p1', pick: { summons: [{ cardId: kogane, cores: [r[0]!] }, { cardId: tobi, cores: [r[0]!] }] } })).toBe(
      'DUPLICATE_CORE',
    );
    s = actRaw(s, { type: 'choose', player: 'p1', pick: { summons: [{ cardId: kogane, cores: [r[0]!] }, { cardId: tobi, cores: [r[1]!, r[2]!, r[3]!] }] } });
    expect(s.players.p1.field).toEqual(expect.arrayContaining([kogane, tobi]));
    expect(s.cards[tobi]!.cores.length).toBeGreaterThanOrEqual(3);
    // ใบที่เหลือ (เบนิมาโทอิ) ไว้ใต้สุดเด็ค แล้ว trigger ของโคงาเนะ/โทบิคาเงะเกิดพร้อมกัน → เลือกลำดับ
    expect(s.players.p1.deck.at(-1)).toBe(beni);
    expect(s.choice).toMatchObject({ kind: 'order', effects: [{ sourceId: kogane }, { sourceId: tobi }] });
  });

  it('คุวากะสเลเยอร์: ไม่อัญเชิญเลย → ที่เหลือเรียงใต้สุดเด็ค', () => {
    let s = setup([DARIU, DARIU, DARIU, DARIU, DARIU, RIKA, DARIU, TEPPO]);
    s = choose(atk(s, KUWAGA, 2, true), 0);
    const [rika, dariu, teppo] = s.players.p1.deck.slice(0, 3);
    s = choose(s, { summons: [] });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [rika, dariu, teppo] });
  });

  it('อัญเชิญด้วยเอฟเฟกต์ใช้ Core บนการ์ดในสนามได้ (การ์ดที่ Core หมดสูญสลาย)', () => {
    let s = setup([DARIU, DARIU, DARIU, DARIU, DARIU, RIKA, DARIU, DARIU]);
    const other = put(s, 'p1', BENI, 1);
    const otherCore = s.cards[other]!.cores[0]!;
    s = choose(atk(s, KUWAGA, 2, true), 0);
    const rika = s.players.p1.deck[0]!;
    s = choose(s, { summons: [{ cardId: rika, cores: [otherCore] }] });
    expect(s.cards[rika]!.cores).toEqual([otherCore]);
    expect(s.players.p1.field).not.toContain(other);
    // Core ของคู่แข่งใช้ไม่ได้
    let t = setup([DARIU, DARIU, DARIU, DARIU, DARIU, RIKA]);
    const enemy = put(t, 'p2', DARIU, 1);
    t = choose(atk(t, KUWAGA, 2, true), 0);
    expect(fails(t, { type: 'choose', player: 'p1', pick: { summons: [{ cardId: t.players.p1.deck[0]!, cores: [t.cards[enemy]!.cores[0]!] }] } })).toBe(
      'CORE_NOT_OWNED',
    );
  });
});

describe('Brave ที่อัญเชิญด้วยเอฟเฟกต์', () => {
  /** คุวากะสเลเยอร์ Lv2 แสดง 3 ใบ: ใบบนสุดเป็นเท็ปโป */
  function revealTeppo() {
    let s = setup([DARIU, DARIU, DARIU, DARIU, DARIU, TEPPO]);
    const kuwaga = put(s, 'p1', KUWAGA, 2, true);
    s = choose(attack(toAttack(s), kuwaga), 0);
    return { s, kuwaga, teppo: s.players.p1.deck[0]! };
  }

  it('เลือกร่วมร่าง: ไม่วาง Core และ "เมื่อเบรฟนี้ถูกอัญเชิญ" ไม่ทำงาน (ผู้ร่วมร่างที่เสื่อมสภาพ → เบรฟเสื่อมสภาพด้วย)', () => {
    let { s, kuwaga, teppo } = revealTeppo();
    s = choose(s, { summons: [{ cardId: teppo, braveOnto: kuwaga }] });
    expect(s.cards[kuwaga]!.braves).toEqual([teppo]);
    expect(s.cards[teppo]!.state).toBe('exhausted');
    expect(s.players.p1.deck).not.toContain(teppo);
    expect(s.choice).toBeNull(); // ไม่ถามเอฟเฟกต์ของเท็ปโป (ใบที่เหลือเป็นการ์ดเดียวกัน: วางใต้เด็คโดยไม่ถามลำดับ)
  });

  it('เลือกลงเป็นสปิริต: วาง Core แล้ว "เมื่อเบรฟนี้ถูกอัญเชิญ" ทำงาน', () => {
    let { s, teppo } = revealTeppo();
    s = choose(s, { summons: [{ cardId: teppo, cores: normalReserve(s, 'p1').slice(0, 1) }] });
    expect(s.players.p1.field).toContain(teppo);
    expect(s.choice).toMatchObject({ kind: 'option', options: ['ทิ้งการ์ดบนมือทั้งหมด แล้วจั่วเท่าการ์ดบนมือคู่แข่ง', 'ไม่ใช้'] });
  });

  it('ร่วมร่างกับสปิริตที่คอสต์ไม่ถึงไม่ได้', () => {
    let { s, teppo } = revealTeppo();
    const small = put(s, 'p1', PANTHER, 1);
    expect(fails(s, { type: 'choose', player: 'p1', pick: { summons: [{ cardId: teppo, braveOnto: small }] } })).toBe('INVALID_HOST');
  });
});

describe('โทบิคาเงะ', () => {
  it('ถูกอัญเชิญ: คอร์วอยด์บนสปิริตวายุนินจา/มนุษย์แมลงของเราทุกตัว', () => {
    let s = setup([TOBIKAGE]);
    const rika = put(s, 'p1', RIKA, 1);
    const dariu = put(s, 'p1', DARIU, 1);
    const r = pay(s, 'p1', TOBIKAGE);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', TOBIKAGE), payment: r, placement: spare(s, 'p1', r, 1) });
    const tobi = s.players.p1.field.at(-1)!;
    expect(s.cards[rika]!.cores).toHaveLength(2);
    expect(s.cards[dariu]!.cores).toHaveLength(1);
    expect(s.cards[tobi]!.cores).toHaveLength(2);
  });

  it('Lv2 + โซลคอร์: เบิร์สของคู่แข่งทำงานไม่ได้ในแอทแท็คสเต็ปของเรา', () => {
    let s = setup();
    put(s, 'p1', TOBIKAGE, 3, true);
    setBurst(s, 'p2', BURST_WALL);
    s = passBoth(atk(s, DARIU, 1));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life).toHaveLength(4);
    expect(s.choice).toBeNull();
    expect(s.battle).toBeNull();
  });
});

describe('Brave: เท็ปโปนานะฟุชิ', () => {
  it('ร่วมร่างกับสปิริตคอสต์ 4+: BP+2000, gem symbol +1, ไม่วาง Core บน Brave', () => {
    let s = setup([TEPPO]);
    const host = put(s, 'p1', KABUTO, 1);
    const small = put(s, 'p1', PANTHER, 1); // คอสต์ 3
    const teppo = handId(s, 'p1', TEPPO);
    const r = pay(s, 'p1', TEPPO);
    expect(fails(s, { type: 'summon', player: 'p1', cardId: teppo, payment: r, placement: [], braveOnto: small })).toBe('INVALID_HOST');
    s = act(s, { type: 'summon', player: 'p1', cardId: teppo, payment: r, placement: [], braveOnto: host });
    expect(s.cards[host]!.braves).toEqual([teppo]);
    expect(s.players.p1.field).not.toContain(teppo);
    expect(currentBp(s, db, host)).toBe(3000 + 2000);
    // อัญเชิญไปร่วมร่างทันที: "เมื่อเบรฟนี้ถูกอัญเชิญ" ทำงานเหมือนอัญเชิญเป็นสปิริต (กติกา 03 ข้อ 3, 04) → ไม่ใช้
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1', sourceId: teppo });
    s = choose(s, 1);
    expect(s.choice).toBeNull();
    s = passBoth(attack(toAttack(s), host));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life).toHaveLength(3);
  });

  it('ทิ้งการ์ดบนมือทั้งหมด แล้วจั่วเท่าการ์ดบนมือคู่แข่ง', () => {
    let s = setup([TEPPO]);
    const r = pay(s, 'p1', TEPPO);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', TEPPO), payment: r, placement: spare(s, 'p1', r, 1) });
    const before = [...s.players.p1.hand];
    s = choose(s, 0);
    expect(s.players.p1.trashCards).toEqual(expect.arrayContaining(before));
    expect(s.players.p1.hand).toHaveLength(s.players.p2.hand.length);
  });

  it('ผู้ร่วมร่างถูกทำลาย: เลือกให้เบรฟอยู่ต่อ (วาง Core จากรีเสิร์ฟ สภาพเดียวกับผู้ร่วมร่าง)', () => {
    let s = setup([TEPPO]);
    const host = put(s, 'p1', KABUTO, 1);
    const teppo = handId(s, 'p1', TEPPO);
    s = act(s, { type: 'summon', player: 'p1', cardId: teppo, payment: pay(s, 'p1', TEPPO), placement: [], braveOnto: host });
    s = choose(s, 1); // เอฟเฟกต์เมื่ออัญเชิญ (กติกา 03 ข้อ 3): ไม่ใช้
    const big = put(s, 'p2', FONG, 1);
    s = passBoth(attack(toAttack(s), host));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: big });
    s = passBoth(s);
    expect(s.players.p1.trashCards).toContain(host);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    s = choose(s, 0);
    expect(s.choice).toMatchObject({ kind: 'placeCores', cardId: teppo });
    s = choose(s, { pay: normalReserve(s, 'p1').slice(0, 1) });
    expect(s.players.p1.field).toContain(teppo);
    expect(s.cards[teppo]!.state).toBe('exhausted');
  });
});

describe('Brave: ร่วมร่าง / แยกร่าง / ย้ายผู้ร่วมร่าง ใน Main Step', () => {
  /** เท็ปโปลงสนามเดี่ยว ๆ (ไม่ใช้เอฟเฟกต์) */
  function teppoOnField() {
    let s = setup([TEPPO]);
    const r = pay(s, 'p1', TEPPO);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', TEPPO), payment: r, placement: spare(s, 'p1', r, 2) });
    s = choose(s, 1);
    return { s, teppo: s.players.p1.field.at(-1)! };
  }

  it('เบรฟบนสนามไปร่วมร่าง: Core บนเบรฟกลับรีเสิร์ฟ ผู้ร่วมร่างมีสภาพตามเบรฟ', () => {
    let { s, teppo } = teppoOnField();
    const host = put(s, 'p1', KABUTO, 1);
    s.cards[teppo]!.state = 'exhausted';
    const reserve = s.players.p1.reserve.length;
    s = act(s, { type: 'brave', player: 'p1', braveId: teppo, hostId: host });
    expect(s.players.p1.field).not.toContain(teppo);
    expect(s.cards[host]!.braves).toEqual([teppo]);
    expect(s.cards[host]!.state).toBe('exhausted');
    expect(s.players.p1.reserve).toHaveLength(reserve + 2);
    expect(s.choice).toBeNull(); // ไม่ใช่การอัญเชิญ
  });

  it('แยกร่าง: วาง Core ให้เบรฟ เบรฟมีสภาพตามผู้ร่วมร่าง / ย้ายไปผู้ร่วมร่างอื่น', () => {
    let { s, teppo } = teppoOnField();
    const a = put(s, 'p1', KABUTO, 1);
    const b = put(s, 'p1', BENI, 1);
    s = act(s, { type: 'brave', player: 'p1', braveId: teppo, hostId: a });
    s.cards[a]!.state = 'exhausted';
    // ย้ายไปผู้ร่วมร่างใหม่: สภาพของผู้ร่วมร่างเดิมติดไปด้วย
    s = act(s, { type: 'brave', player: 'p1', braveId: teppo, hostId: b });
    expect(s.cards[a]!.braves).toEqual([]);
    expect(s.cards[b]!.braves).toEqual([teppo]);
    expect(s.cards[b]!.state).toBe('exhausted');
    expect(fails(s, { type: 'brave', player: 'p1', braveId: teppo, hostId: null, placement: [] })).toBe('NOT_ENOUGH_CORES');
    const core = normalReserve(s, 'p1')[0]!;
    s = act(s, { type: 'brave', player: 'p1', braveId: teppo, hostId: null, placement: [core] });
    expect(s.cards[b]!.braves).toEqual([]);
    expect(s.players.p1.field).toContain(teppo);
    expect(s.cards[teppo]!.cores).toEqual([core]);
    expect(s.cards[teppo]!.state).toBe('exhausted');
  });

  it('ทำได้เฉพาะ Main Step', () => {
    let { s, teppo } = teppoOnField();
    const host = put(s, 'p1', KABUTO, 1);
    s = toAttack(s);
    expect(fails(s, { type: 'brave', player: 'p1', braveId: teppo, hostId: host })).toBe('WRONG_PHASE');
  });
});

describe('Soul Burst', () => {
  it('คุโระฮางาเนะ: สปิริตเราถูกทำลายโดยคู่แข่ง → เสื่อมสภาพสปิริตคู่แข่ง แล้วอัญเชิญตัวเองไม่จ่ายคอสต์', () => {
    let s = setup();
    const kuro = setBurst(s, 'p2', KURO);
    const blocker = put(s, 'p2', RIKA, 1);
    const other = put(s, 'p1', DARIU, 1);
    s = passBoth(atk(s, DARIU, 3));
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    s = passBoth(s);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2', options: ['เปิด Burst', 'ไม่เปิด'] });
    s = choose(s, 0);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [other] });
    s = choose(s, other);
    expect(s.cards[other]!.state).toBe('exhausted');
    expect(s.choice).toMatchObject({ kind: 'placeCores', cardId: kuro });
    s = choose(s, { pay: normalReserve(s, 'p2').slice(0, 3) });
    expect(s.players.p2.field).toContain(kuro);
    expect(s.players.p2.trashCards).not.toContain(kuro);
    expect(s.battle).toBeNull();
  });

  it('คิริคาเงะ [Catalyze]: ส่งโซลลงแทรช สั่งใช้คุโระฮางาเนะ (เสื่อมสภาพเพิ่มอีก 1 ตัว)', () => {
    let s = setup();
    const kuro = setBurst(s, 'p1', KURO);
    const kiri = put(s, 'p1', KIRIKAGE, 1, true);
    const [a, b] = [put(s, 'p2', DARIU, 1), put(s, 'p2', DARIU, 1)];
    s = attack(toAttack(s), kiri);
    s = choose(s, 0);
    expect(s.players.p1.trashCores.some((id) => s.cores[id]!.isSoul)).toBe(true);
    expect(s.players.p1.burst).toBeNull();
    s = choose(s, a);
    s = choose(s, b);
    expect([s.cards[a]!.state, s.cards[b]!.state]).toEqual(['exhausted', 'exhausted']);
    s = choose(s, { pay: normalReserve(s, 'p1').slice(0, 1) });
    expect(s.players.p1.field).toContain(kuro);
  });

  it('[Catalyze] ไม่ถามเมื่อ Burst ที่เซ็ทไม่ใช่ Soul Burst / ช่อง Burst ว่าง / ไม่มีโซลบนตัว', () => {
    const notOffered = (prep: (s: GameState) => string) => {
      const s = setup();
      const kiri = prep(s);
      put(s, 'p2', DARIU, 1);
      const after = attack(toAttack(s), kiri);
      expect(after.choice).toBeNull();
      expect(soulCount(after, kiri)).toBe(after.cards[kiri]!.cores.some((c) => after.cores[c]!.isSoul) ? 1 : 0);
    };
    notOffered((s) => (setBurst(s, 'p1', BURST_WALL), put(s, 'p1', KIRIKAGE, 2, true))); // Burst ธรรมดา สีขาว
    notOffered((s) => put(s, 'p1', KIRIKAGE, 2, true)); // ไม่ได้เซ็ท Burst
    notOffered((s) => (setBurst(s, 'p1', KURO), put(s, 'p1', KIRIKAGE, 2))); // ไม่มีโซลบนคิริคาเงะ
  });

  it('[Catalyze] สั่งใช้ชูริเคนพันเล่ม (Soul Burst): เสื่อมสภาพ 2 ตัว คอร์วอยด์ 2 แล้วถามจ่าย [Flash]', () => {
    let s = setup();
    setBurst(s, 'p1', SHURIKEN);
    const kiri = put(s, 'p1', KIRIKAGE, 2, true);
    const [a, b] = [put(s, 'p2', DARIU, 1), put(s, 'p2', DARIU, 1)];
    s = attack(toAttack(s), kiri);
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, 0);
    s = choose(s, a);
    s = choose(s, b);
    expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p1' });
    s = choose(s, null);
    expect(s.players.p1.burst).toBeNull();
    expect(s.players.p1.trashCards.some((id) => s.cards[id]!.cardNo === SHURIKEN)).toBe(true);
  });

  it('ไฮวินด์: หลังจากเราเสียไลฟ์ → ฟื้นสภาพสปิริตวายุนินจา แล้วอัญเชิญตัวเอง', () => {
    let s = setup();
    const hiwind = setBurst(s, 'p2', HIWIND);
    const rika = put(s, 'p2', RIKA, 1);
    s.cards[rika]!.state = 'exhausted';
    s = passBoth(atk(s, DARIU, 1));
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = choose(s, 0);
    s = choose(s, rika);
    expect(s.cards[rika]!.state).toBe('refresh');
    s = choose(s, { pay: normalReserve(s, 'p2').slice(0, 1) });
    expect(s.players.p2.field).toContain(hiwind);
  });

  it('คุโระฮางาเนะ Lv2: การโจมตีของวายุนินจาที่มีโซลทำให้คู่แข่งเสียไลฟ์ → ไลฟ์คู่แข่งอีก 1 ไปรีเสิร์ฟ', () => {
    let s = setup();
    put(s, 'p1', KURO, 3);
    const beni = put(s, 'p1', BENI, 1, true);
    s = passBoth(attack(toAttack(s), beni));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life).toHaveLength(3);
  });
});

describe('ชูริเคนพันเล่ม (Burst)', () => {
  it('หลังจากมือคู่แข่งเพิ่มขึ้นโดยเอฟเฟกต์ของคู่แข่ง: เสื่อมสภาพ 2 ตัว คอร์วอยด์ 2 ลงรีเสิร์ฟ', () => {
    let s = setup([KABURYU]);
    setBurst(s, 'p2', SHURIKEN);
    const [a, b] = [put(s, 'p1', DARIU, 1), put(s, 'p1', DARIU, 1)];
    const reserve = s.players.p2.reserve.length;
    s = act(s, { type: 'useMagic', player: 'p1', cardId: handId(s, 'p1', KABURYU), payment: pay(s, 'p1', KABURYU) });
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, 0);
    s = choose(s, a);
    s = choose(s, b);
    expect(s.players.p2.reserve).toHaveLength(reserve + 2);
    expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p2' });
    s = choose(s, null);
    expect(s.players.p2.trashCards.some((id) => s.cards[id]!.cardNo === SHURIKEN)).toBe(true);
  });
});

describe('สปิริตอื่น ๆ', () => {
  it('โคงาเนะ: คอร์วอยด์บนตัวเอง, จ่ายด้วยโซล → คอร์วอยด์บนสปิริตเราตัวอื่นอีก 1', () => {
    let s = setup([KOGANE]);
    const ally = put(s, 'p1', DARIU, 1);
    const r = pay(s, 'p1', KOGANE, true);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', KOGANE), payment: r, placement: spare(s, 'p1', r, 1) });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [ally] });
    s = choose(s, ally);
    expect(s.cards[ally]!.cores).toHaveLength(2);
    expect(s.cards[s.players.p1.field.at(-1)!]!.cores).toHaveLength(2);
  });

  it('เบนิมาโทอิ: คอร์วอยด์ลงรีเสิร์ฟ, มีโซล → เสื่อมสภาพสปิริตคู่แข่ง', () => {
    let s = setup();
    const target = put(s, 'p2', DARIU, 1);
    const reserve = s.players.p1.reserve.length;
    s = atk(s, BENI, 1, true);
    expect(s.players.p1.reserve).toHaveLength(reserve + 1);
    s = choose(s, target);
    expect(s.cards[target]!.state).toBe('exhausted');
  });

  it('ไฮวินด์ Lv2: จบการต่อสู้ นำกลับขึ้นมือ แล้วเซ็ทการ์ด Burst บนมือ', () => {
    let s = setup([SHURIKEN]);
    const hiwind = put(s, 'p1', HIWIND, 3);
    s = passBoth(attack(toAttack(s), hiwind));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    expect(s.battle).not.toBeNull();
    s = choose(s, 0);
    expect(s.players.p1.hand).toContain(hiwind);
    expect(s.choice).toMatchObject({ kind: 'card', optional: true });
    const shuriken = handId(s, 'p1', SHURIKEN);
    s = choose(s, shuriken);
    expect(s.players.p1.burst).toBe(shuriken);
    expect(s.battle).toBeNull();
  });

  it('ฟง-นี้ด: อัญเชิญ = คอร์วอยด์ 3, โจมตี = เสื่อมสภาพ BP รวมไม่เกิน 10000, Lv2 เสียไลฟ์ → ฟื้นสภาพ', () => {
    let s = setup([FONG]);
    const r = pay(s, 'p1', FONG);
    s = act(s, { type: 'summon', player: 'p1', cardId: handId(s, 'p1', FONG), payment: r, placement: spare(s, 'p1', r, 1) });
    const fong = s.players.p1.field.at(-1)!;
    expect(s.cards[fong]!.cores).toHaveLength(4);
    const [a, b, c] = [put(s, 'p2', DARIU, 3), put(s, 'p2', DARIU, 1), put(s, 'p2', DARIU, 1)]; // 6000 / 3000 / 3000
    s = attack(toAttack(s), fong);
    s = choose(s, a);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [b, c] });
    s = choose(s, b);
    expect(s.choice).toBeNull(); // เหลือ 1000
    s = passBoth(s);
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = choose(s, 0);
    expect(s.cards[fong]!.state).toBe('refresh');
    expect(s.cards[fong]!.cores).toHaveLength(1);
  });
});

describe('engine ไม่แก้ action ของผู้เรียก', () => {
  it('อัญเชิญนินโควโชวจ่ายด้วยโซล (คอร์วอยด์บนตัวเอง): placement ใน action ไม่ถูกต่อคอร์ใหม่เข้าไป', () => {
    // บั๊กเดิม: Core บนการ์ดใช้ array เดียวกับ action.placement → คอร์วอยด์ถูกต่อเข้า action
    // เล่นออนไลน์จะส่ง action ที่ถูกแก้แล้ว (มีคอร์ที่ไม่มีจริง) เข้าห้อง ทำให้สองเครื่องไม่ตรงกัน
    const s = setup([NINKO]);
    const r = pay(s, 'p1', NINKO, true);
    const action: Action = { type: 'summon', player: 'p1', cardId: handId(s, 'p1', NINKO), payment: r, placement: spare(s, 'p1', r, 1) };
    const before = JSON.stringify(action);
    const next = actRaw(s, action);
    expect(JSON.stringify(action)).toBe(before);
    expect(next.cards[action.cardId]!.cores).toHaveLength(2);
  });
});
