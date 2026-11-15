import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS01Cards } from '@bs/cards';
import { applyAction, cardLevel, createGame, currentBp, matchesFilter, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name && c.cardNo.startsWith('BS01'))!.cardNo;

const DARIU = no('มุฉะดาริว'); // คอสต์ 1 BP 3000/6000/8000 (1/3/5) ไม่มีเอฟเฟกต์
const TOKAGE = no('มุฉะโทคาเงะ'); // ไม่มีเอฟเฟกต์
const CHEETAH = no('โฮมุระชีตาร์'); // โจมตี: ทำลาย BP≤4000 (+ Soul Core: เน็กซัส)
const TIGER = no('เซนโกคุ-ไทเกอร์');
const EMPEROR = no('จักรพรรดิมังกร ซีคฟรีด'); // Soul Core = Lv สูงสุด, Lv3 ถูกทำลายโดยคู่แข่ง → อยู่ต่อ
const SIEG = no('เซ็นโงคุ ซีคฟรีด'); // Lv2-3 + Soul Core: เจ็มแดง +1
const LION = no('ชุดเกราะขุนพลดาบ แอช-ไลอ้อน'); // Brave: ผู้ร่วมร่างโจมตี → คู่แข่งเลือกทำลายของตัวเอง
const EAST = no('No.13 อีสท์แคพพิทัล');
const STONE = no('No.17 สโตนริเวอร์');
const DRAKNO = no('หมอผีดรัคโน่');
const RYUMAN = no('มุโซ ริวมัน');
const NEXUS_C = no('ทวีปแห่งหุบผาหินแหลมคม');
const CHIPPU = no('ชิปปูดราก้อน');

/** เกมไม่สับเด็ค p1 เริ่มก่อนและโจมตีได้เทิร์นแรก เด็คที่เหลือเป็นมุฉะดาริว */
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
function inZone(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
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
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });
const attack = (s: GameState, attackerId: string) => act(s, { type: 'declareAttack', player: 'p1', attackerId });
const onField = (s: GameState, p: PlayerId, id: string) => s.players[p].field.includes(id);
/** ผ่าน Flash Timing ที่ค้างอยู่ทั้งหมด (ทั้งสองฝ่าย Pass) */
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};

describe('Booster Set 01', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดเอฟเฟกต์มีสคริปต์', () => {
    const cards = loadBS01Cards().all();
    expect(cards).toHaveLength(50);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('มุโซ ริวมัน: ถือว่ามีคำว่า "ริวแมน" ในชื่อ', () => {
    const s = setup();
    const id = put(s, 'p1', RYUMAN, 1);
    expect(matchesFilter(s, db, id, { nameIncludes: ['ริวแมน'] })).toBe(true);
  });

  it('โฮมุระชีตาร์ (Soul Core) โจมตี: ทำลายสปิริต BP ≤ 4000 แล้วทำลายเน็กซัสคู่แข่ง', () => {
    const s = setup();
    const cheetah = put(s, 'p1', CHEETAH, 1, true);
    const weak = put(s, 'p2', DARIU, 1); // BP 3000
    const nexus = put(s, 'p2', NEXUS_C, 0);
    let x = attack(toAttack(s), cheetah);
    x = choose(x, weak);
    x = choose(x, nexus);
    expect(onField(x, 'p2', weak)).toBe(false);
    expect(onField(x, 'p2', nexus)).toBe(false);
  });

  it('เซนโกคุ-ไทเกอร์ Lv2: ทำลายสปิริตที่ BP ไม่เกินตัวเอง; ทำลายตัว BP ≥ 7000 → ส่ง Soul Core เพื่อฟื้นสภาพ', () => {
    const s = setup();
    const tiger = put(s, 'p1', TIGER, db.get(TIGER).levels[2]!.cores, true);
    const big = put(s, 'p2', DARIU, 5); // BP 8000
    const tigerBp = currentBp(s, db, tiger);
    expect(tigerBp).toBeGreaterThanOrEqual(8000);
    let x = attack(toAttack(s), tiger);
    x = choose(x, big);
    expect(onField(x, 'p2', big)).toBe(false);
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 0);
    expect(x.cards[tiger]!.state).toBe('refresh');
    expect(x.cards[tiger]!.cores.some((id) => x.cores[id]!.isSoul)).toBe(false);
  });

  it('จักรพรรดิมังกร ซีคฟรีด: มี Soul Core = Lv สูงสุด; ถูกทำลายโดยคู่แข่ง (ไลฟ์ ≤ 5) → ไลฟ์ +2 และอยู่ต่อ', () => {
    const s = setup();
    const emperor = put(s, 'p2', EMPEROR, 1, true);
    const def = db.get(EMPEROR);
    expect(cardLevel(s, db, emperor)).toBe(def.levels.at(-1)!.level);
    expect(currentBp(s, db, emperor)).toBe(def.levels.at(-1)!.bp);
    const cheetah = put(s, 'p1', CHEETAH, 1);
    // ผู้โจมตีแพ้ / ทดสอบตรงด้วยเอฟเฟกต์: ใช้ไทเกอร์ที่ BP สูงกว่าไม่ได้ จึงทำลายผ่านการต่อสู้ของจักรพรรดิแทน
    const life = s.players.p2.life.length;
    s.cards[cheetah]!.turnBp = 100000;
    let x = attack(toAttack(s), cheetah);
    while (x.choice) x = choose(x, x.choice.kind === 'card' ? x.choice.candidates[0]! : 0);
    x = act(passAll(x), { type: 'declareBlock', player: 'p2', blockerId: emperor });
    x = passAll(x);
    expect(onField(x, 'p2', emperor)).toBe(true);
    expect(x.players.p2.life.length).toBe(life + 2);
  });

  it('เซ็นโงคุ ซีคฟรีด Lv2 + Soul Core: เจ็มแดง +1 (โจมตีไม่ถูกป้องกัน คู่แข่งเสียไลฟ์เพิ่ม 1)', () => {
    const s = setup();
    const def = db.get(SIEG);
    const sieg = put(s, 'p1', SIEG, def.levels[1]!.cores, true);
    const symbols = Object.values(def.symbols).reduce<number>((n, v) => n + (v ?? 0), 0);
    const life = s.players.p2.life.length;
    let x = attack(toAttack(s), sieg);
    x = act(passAll(x), { type: 'noBlock', player: 'p2' });
    x = passAll(x);
    expect(x.players.p2.life.length).toBe(life - symbols - 1);
  });

  it('แอช-ไลอ้อน: ผู้ร่วมร่างโจมตี → คู่แข่งเลือกทำลายสปิริตตัวเองที่ BP ≤ 7000 และไม่มี Soul Core', () => {
    const s = setup();
    const host = put(s, 'p1', TIGER, 1);
    const brave = `t-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: LION, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(brave);
    const victim = put(s, 'p2', DARIU, 1);
    put(s, 'p2', DARIU, 1, true); // มี Soul Core: เลือกไม่ได้
    let x = attack(toAttack(s), host);
    expect(x.choice?.player).toBe('p2');
    expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([victim]);
    x = choose(x, victim);
    expect(onField(x, 'p2', victim)).toBe(false);
  });

  it('No.13 อีสท์แคพพิทัล Lv2 (Soul Core): สปิริตแดงของเราถูกป้องกันโดย BP ≤ 3000 → ฟื้นสภาพ', () => {
    const s = setup();
    put(s, 'p1', EAST, db.get(EAST).levels[1]!.cores, true);
    const attacker = put(s, 'p1', DARIU, 1); // สีแดง ไม่มีเอฟเฟกต์
    const blocker = put(s, 'p2', TOKAGE, 1);
    let x = passAll(attack(toAttack(s), attacker));
    expect(x.cards[attacker]!.state).toBe('exhausted');
    x = act(x, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    expect(x.cards[attacker]!.state).toBe('refresh');
  });

  it('No.17 สโตนริเวอร์: สปิริตที่มี Soul Core โจมตี → ทำลายสปิริตที่ BP ไม่เกิน BP Lv1 ของผู้โจมตี', () => {
    const s = setup();
    put(s, 'p1', STONE, 0);
    const attacker = put(s, 'p1', DARIU, 5, true); // Lv1 BP 3000
    const small = put(s, 'p2', DARIU, 1); // BP 3000
    const mid = put(s, 'p2', DARIU, 3); // BP 6000
    const x = attack(toAttack(s), attacker);
    expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([small]);
    expect(onField(x, 'p2', mid)).toBe(true);
  });

  it('หมอผีดรัคโน่ (จ่ายด้วย Soul Core): อัญเชิญสปิริตเผ่ามังกรโบราณในแทรชไม่จ่ายคอสต์', () => {
    const s = setup();
    const ancient = db.all().find((c) => c.cardNo.startsWith('BS01') && c.type === 'spirit' && c.family.includes('มังกรโบราณ') && c.cost <= 3)!;
    const target = inZone(s, 'p1', ancient.cardNo, 'trashCards');
    const card = inZone(s, 'p1', DRAKNO, 'hand');
    const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
    const others = s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);
    const cost = db.get(DRAKNO).cost;
    const payment = [soul, ...others.slice(0, cost - 1)];
    const placement = others.slice(cost - 1, cost);
    let x = act(s, { type: 'summon', player: 'p1', cardId: card, payment, placement });
    expect(x.choice?.kind).toBe('option');
    x = choose(x, 1);
    x = choose(x, target);
    expect(x.choice?.kind).toBe('placeCores');
    x = choose(x, { pay: x.players.p1.reserve.slice(0, 1) });
    expect(onField(x, 'p1', target)).toBe(true);
  });

  it('บัสเตอร์สเปียร์: เลือกเน็กซัสฝ่ายไหนก็ได้ แต่จั่ว 2 เฉพาะเมื่อทำลายเน็กซัสคู่แข่ง', () => {
    const SPEAR = no('บัสเตอร์สเปียร์');
    const run = (target: 'mine' | 'theirs') => {
      const s = setup();
      const mine = put(s, 'p1', NEXUS_C, 0);
      const theirs = put(s, 'p2', NEXUS_C, 0);
      const card = inZone(s, 'p1', SPEAR, 'hand');
      const payment = s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul).slice(0, payableCost(s, db, 'p1', db.get(SPEAR)));
      let x = act(s, { type: 'useMagic', player: 'p1', cardId: card, payment, timing: 'flash' });
      expect(x.choice?.kind === 'card' && x.choice.candidates.sort()).toEqual([mine, theirs].sort());
      const hand = x.players.p1.hand.length;
      x = choose(x, target === 'mine' ? mine : theirs);
      return { gained: x.players.p1.hand.length - hand, x, mine, theirs };
    };
    const own = run('mine');
    expect(onField(own.x, 'p1', own.mine)).toBe(false);
    expect(own.gained).toBe(0);
    const opp = run('theirs');
    expect(onField(opp.x, 'p2', opp.theirs)).toBe(false);
    expect(opp.gained).toBe(2);
  });

  it('ชิปปูดราก้อน Lv2: ต่อสู้กับอัลติเมทของคู่แข่ง BP+10000 (ไม่ได้ต่อสู้ = ไม่ได้)', () => {
    const s = setup();
    const chip = put(s, 'p1', CHIPPU, db.get(CHIPPU).levels[1]!.cores);
    const base = currentBp(s, db, chip);
    s.battle = { attackerId: chip, blockers: [] } as unknown as GameState['battle'];
    expect(currentBp(s, db, chip)).toBe(base);
  });
});
