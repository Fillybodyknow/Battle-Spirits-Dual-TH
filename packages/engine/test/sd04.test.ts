import { describe, expect, it } from 'vitest';
import { loadStarterCards, SD04_DECK } from '@bs/cards';
import { applyAction, blockersFor, canAttackWith, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadStarterCards();
// ชื่อการ์ดไม่ซ้ำกันทั้งฐานข้อมูล (การ์ดของ Starter Deck ส่วนใหญ่เขียนไว้ใน Booster Set)
const no = (name: string, _set?: string) => db.all().find((c) => c.name === name)!.cardNo;

const HITOTSUME = no('ฮิโทสึเมะ โบส'); // คอสต์ 0 BP 1000/2000 (1/2)
const KARAKASA = no('คาระคาสะแมน'); // คอสต์ 1 ไม่มีเอฟเฟกต์ BP 3000 (Lv1)
const KAPPA = no('คัปปัปปะ'); // คอสต์ 2 BP 2000/4000 (1/3)
const WANKOMA = no('วันโคมะ'); // คอสต์ 2 BP 2000/3000 (1/2)
const ZASHIKI = no('ซาชิกิ เกิร์ล');
const NURIKABE = no('นูริคาเบะ'); // คอสต์ 4 BP 9000
const OBORO = no('โอโบโระ กิชชา'); // Brave คอสต์ 4
const MAYOI = no('บ้านมาโยอิ'); // Nexus Lv1 Core 0, Lv2 Core 2
const HINOTAMA = no('ฮิโนะทามะ แอทแท็ค'); // Magic [Flash] BP-6000
const TOSENBO = no('โทเซ็นโบ วอลล์'); // Magic คอสต์ 4 ลด เหลือง 3
const DORO = no('โดโระเทอร์โบ');
const YELLOW = no('เยลโล่รีคัฟเวอร์'); // Magic [Flash] เทิร์นละครั้ง
const FURIN = no('ฟูริน');
const INUGAMI = no('อินุงามิ'); // คอสต์ 5 BP 4000/6000/8000 (1/2/3)
const SEA = no('โดจิทะเลฟ้า', 'SD03'); // [Crush]
const DARIU = no('มุฉะดาริว', 'BS01'); // คอสต์ 1 BP 3000/6000/8000 (1/3/5)

/** เกมไม่สับเด็ค p1 เริ่มก่อน ที่เหลือเป็นมุฉะดาริว; top = ใบบนสุดหลังจั่วมือเริ่มต้น 4 ใบ */
function setup(p1: string[] = [], p2: string[] = []): GameState {
  const build = (top: string[]) => [...Array<string>(4).fill(DARIU), ...top, ...Array<string>(36 - top.length).fill(DARIU)];
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
function newCard(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
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
const fails = (s: GameState, action: Action) => {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
};
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const normalReserve = (s: GameState, player: PlayerId) => s.players[player].reserve.filter((id) => !s.cores[id]!.isSoul);
const soulOf = (s: GameState, player: PlayerId) => s.players[player].reserve.find((id) => s.cores[id]!.isSoul)!;
const pay = (s: GameState, player: PlayerId, cardNo: string, soul = false) => {
  const cost = payableCost(s, db, player, db.get(cardNo));
  const normal = normalReserve(s, player).slice(0, soul ? cost - 1 : cost);
  return soul ? [...normal, soulOf(s, player)] : normal;
};
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const attack = (s: GameState, id: string) => act(s, { type: 'declareAttack', player: 'p1', attackerId: id });
/** ใช้ฮิโนะทามะ (ไม่ใช้ Soul Core) กับการ์ดของ p2 */
const fireball = (s: GameState, target: string, soul = false) => {
  const magic = newCard(s, 'p1', HINOTAMA, 'hand');
  const x = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: pay(s, 'p1', HINOTAMA, soul), timing: 'flash' });
  return soul ? x : choose(x, target);
};

describe('SD04 ข้อมูล', () => {
  it('ทุกบรรทัดเอฟเฟกต์มีสคริปต์ และเด็คครบ 40 ใบ', () => {
    for (const card of db.all().filter((c) => c.cardNo.startsWith('SD04'))) {
      expect(new Set(card.abilities.map((a) => a.source)).size, card.name).toBe(card.effects.length);
    }
    expect(SD04_DECK.reduce((n, e) => n + e.count, 0)).toBe(40);
  });
});

describe('SD04 เมจิค', () => {
  it('ฮิโนะทามะ แอทแท็ค: BP-6000 แล้วทำลายตัวที่ BP เหลือ 0, ตัวที่เหลือ BP ลดลง', () => {
    const s = setup();
    const small = put(s, 'p2', KAPPA, 1); // BP 2000
    const big = put(s, 'p2', NURIKABE, 1); // BP 9000
    let x = fireball(s, small);
    expect(x.players.p2.field).not.toContain(small);
    x = fireball(x, big);
    expect(x.players.p2.field).toContain(big);
    expect(currentBp(x, db, big)).toBe(3000);
  });

  it('ฮิโนะทามะ แอทแท็ค (Soul Core): เลือกเป้าหมายได้เท่าจำนวนสปิริตเราเผ่าโยวไค', () => {
    const s = setup();
    put(s, 'p1', KARAKASA, 1);
    put(s, 'p1', KARAKASA, 1);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    let x = fireball(s, '', true);
    expect(x.choice).toMatchObject({ kind: 'multiCard', count: 2 });
    x = choose(x, { cards: [a, b] });
    expect(x.players.p2.field).toEqual([]);
  });

  it('โทเซ็นโบ วอลล์: มีนูริคาเบะ = ลดคอสต์ครบ, ใช้แล้วสปิริตคู่แข่งโจมตีไม่ได้ในเทิร์นนี้', () => {
    const s = setup();
    expect(payableCost(s, db, 'p1', db.get(TOSENBO))).toBe(4);
    put(s, 'p1', NURIKABE, 1);
    expect(payableCost(s, db, 'p1', db.get(TOSENBO))).toBe(1); // 4 - ลดเหลือง 3
    const opp = put(s, 'p2', DARIU, 1);
    const magic = newCard(s, 'p1', TOSENBO, 'hand');
    const x = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: pay(s, 'p1', TOSENBO), timing: 'flash' });
    expect(canAttackWith(x, db, opp)).toBe(false);
  });

  it('เยลโล่รีคัฟเวอร์: ฟื้นสภาพสปิริตเหลือง ใช้ได้เทิร์นละครั้ง', () => {
    const s = setup();
    const k = put(s, 'p1', KARAKASA, 1);
    s.cards[k]!.state = 'exhausted';
    const m1 = newCard(s, 'p1', YELLOW, 'hand');
    const m2 = newCard(s, 'p1', YELLOW, 'hand');
    let x = act(s, { type: 'useMagic', player: 'p1', cardId: m1, payment: pay(s, 'p1', YELLOW), timing: 'flash' });
    x = choose(x, k);
    expect(x.cards[k]!.state).toBe('refresh');
    expect(fails(x, { type: 'useMagic', player: 'p1', cardId: m2, payment: pay(x, 'p1', YELLOW), timing: 'flash' })).toBe('ONCE_PER_TURN');
  });
});

describe('SD04 ถูกทำลาย', () => {
  it('คัปปัปปะ (Soul Core): ถูกทำลายแต่อยู่ต่อแบบเสื่อมสภาพ แล้วเสื่อมสภาพสปิริตคอสต์ไม่เกิน 3 ของคู่แข่ง', () => {
    const s = setup();
    const kappa = put(s, 'p2', KAPPA, 1, true);
    const mine = put(s, 'p1', KARAKASA, 1);
    let x = fireball(s, kappa);
    expect(x.players.p2.field).toContain(kappa);
    expect(x.cards[kappa]!.state).toBe('exhausted');
    expect(x.choice?.player).toBe('p2');
    x = choose(x, mine);
    expect(x.cards[mine]!.state).toBe('exhausted');
  });

  it('คัปปัปปะ (ไม่มี Soul Core): ถูกทำลายจริง แต่ยังเสื่อมสภาพสปิริตคู่แข่ง', () => {
    const s = setup();
    const kappa = put(s, 'p2', KAPPA, 1);
    const mine = put(s, 'p1', KARAKASA, 1);
    let x = fireball(s, kappa);
    expect(x.players.p2.field).not.toContain(kappa);
    x = choose(x, mine);
    expect(x.cards[mine]!.state).toBe('exhausted');
  });

  it('ฮิโทสึเมะ โบส: ถูกทำลาย → ฟื้นสภาพสปิริตเผ่าโยวไค / วันโคมะ ฟื้นสภาพเมื่อสปิริตอื่นถูกทำลาย', () => {
    const s = setup();
    const hito = put(s, 'p2', HITOTSUME, 1);
    const kara = put(s, 'p2', KARAKASA, 1);
    const wan = put(s, 'p2', WANKOMA, 1);
    s.cards[kara]!.state = 'exhausted';
    s.cards[wan]!.state = 'exhausted';
    let x = fireball(s, hito);
    while (x.choice) x = choose(x, x.choice.kind === 'card' ? kara : 0);
    expect(x.cards[kara]!.state).toBe('refresh');
    expect(x.cards[wan]!.state).toBe('refresh');
  });

  it('ฟูริน: ถูกทำลายโดยคู่แข่ง → นำเมจิคในแทรชกลับขึ้นมือ', () => {
    const s = setup();
    const furin = put(s, 'p2', FURIN, 1);
    const magic = newCard(s, 'p2', YELLOW, 'trashCards');
    let x = fireball(s, furin);
    x = choose(x, magic);
    expect(x.players.p2.hand).toContain(magic);
  });

  it('โอโบโระ กิชชา (บนมือ): สปิริตเผ่าโยวไคถูกทำลาย → อัญเชิญไม่จ่ายคอสต์', () => {
    const s = setup();
    const kara = put(s, 'p2', KARAKASA, 1);
    const brave = newCard(s, 'p2', OBORO, 'hand');
    let x = fireball(s, kara);
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 0);
    x = choose(x, { pay: normalReserve(x, 'p2').slice(0, 1) });
    expect(x.players.p2.field).toContain(brave);
  });

  it('อินุงามิ Lv2: ทิ้งเมจิคบนมือ 1 ใบ → อยู่ต่อแบบฟื้นสภาพ', () => {
    const s = setup();
    const inu = put(s, 'p2', INUGAMI, 2);
    s.cards[inu]!.state = 'exhausted';
    const magic = newCard(s, 'p2', YELLOW, 'hand');
    let x = fireball(s, inu); // BP 6000 → 0
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 0);
    x = choose(x, magic);
    expect(x.players.p2.field).toContain(inu);
    expect(x.cards[inu]!.state).toBe('refresh');
    expect(x.players.p2.trashCards).toContain(magic);
  });
});

describe('SD04 อื่น ๆ', () => {
  it('วันโคมะ: ถูกคู่แข่งทิ้งจากเด็ค → นำการ์ดทั้งหมดในแทรชกลับใต้สุดเด็ค', () => {
    const s = setup([], [WANKOMA]);
    newCard(s, 'p2', YELLOW, 'trashCards');
    const sea = put(s, 'p1', SEA, 1); // [Crush] Lv1: ทิ้ง 1
    let x = attack(toAttack(s), sea);
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 0);
    while (x.choice?.kind === 'card') x = choose(x, x.choice.candidates[0]!);
    expect(x.players.p2.trashCards).toEqual([]);
    expect(x.players.p2.deck.slice(-2).map((id) => x.cards[id]!.cardNo).sort()).toEqual([WANKOMA, YELLOW].sort());
  });

  it('ซาชิกิ เกิร์ล (Soul Core): สปิริตเผ่าโยวไคถูกอัญเชิญใน Main Step → จั่ว 1', () => {
    const s = setup();
    put(s, 'p1', ZASHIKI, 1, true);
    const card = newCard(s, 'p1', KARAKASA, 'hand');
    const before = s.players.p1.hand.length;
    const payment = pay(s, 'p1', KARAKASA);
    const placement = normalReserve(s, 'p1').filter((id) => !payment.includes(id)).slice(0, 1);
    const x = act(s, { type: 'summon', player: 'p1', cardId: card, payment, placement });
    expect(x.players.p1.hand.length).toBe(before - 1 + 1);
  });

  it('โดโระเทอร์โบ (Soul Core): ผู้โจมตีเผ่าโยวไค → คู่แข่งป้องกันได้เฉพาะคอสต์เท่ากัน', () => {
    const s = setup();
    put(s, 'p1', DORO, 1, true);
    const kara = put(s, 'p1', KARAKASA, 1); // คอสต์ 1
    const same = put(s, 'p2', DARIU, 1); // คอสต์ 1
    put(s, 'p2', NURIKABE, 1); // คอสต์ 4
    const x = attack(toAttack(s), kara);
    expect(blockersFor(x, db, 'p2')).toEqual([same]);
  });

  it('บ้านมาโยอิ Lv1: เสียไลฟ์ในแอทแท็คสเต็ปของคู่แข่ง → อัญเชิญโยวไคจากมือไม่จ่ายคอสต์', () => {
    const s = setup();
    put(s, 'p2', MAYOI, 0);
    const card = newCard(s, 'p2', KARAKASA, 'hand');
    const atk = put(s, 'p1', DARIU, 1);
    let x = attack(toAttack(s), atk);
    while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
    if (x.battle?.step === 'declareBlock') x = act(x, { type: 'noBlock', player: 'p2' });
    expect(x.choice?.kind).toBe('card');
    x = choose(x, card);
    x = choose(x, { pay: normalReserve(x, 'p2').slice(0, 1) });
    expect(x.players.p2.field).toContain(card);
  });

  it('บ้านมาโยอิ Lv2: สปิริตเราที่มีโซลคอร์ถูกทำลายในแอทแท็คสเต็ปของเรา → ไลฟ์ +1 (เทิร์นละครั้ง)', () => {
    const s = setup();
    put(s, 'p1', MAYOI, 2);
    const atk = put(s, 'p1', KARAKASA, 1, true); // BP 3000
    const blocker = put(s, 'p2', NURIKABE, 1); // BP 9000
    const life = s.players.p1.life.length;
    let x = attack(toAttack(s), atk);
    while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
    x = act(x, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
    expect(x.players.p1.field).not.toContain(atk);
    expect(x.players.p1.life.length).toBe(life + 1);
  });

  it('อินุงามิ (Soul Core): ใช้เมจิคในแอทแท็คสเต็ปของเรา → จั่ว 1 หลังเอฟเฟกต์นั้น', () => {
    const s = setup();
    put(s, 'p1', INUGAMI, 1, true);
    const atk = put(s, 'p1', DARIU, 1);
    const k = put(s, 'p1', KARAKASA, 1);
    s.cards[k]!.state = 'exhausted';
    const magic = newCard(s, 'p1', YELLOW, 'hand');
    let x = attack(toAttack(s), atk);
    x = act(x, { type: 'passFlash', player: 'p2' });
    const before = x.players.p1.hand.length;
    x = act(x, { type: 'useMagic', player: 'p1', cardId: magic, payment: pay(x, 'p1', YELLOW), timing: 'flash' });
    x = choose(x, k);
    expect(x.players.p1.hand.length).toBe(before - 1 + 1);
  });
});
