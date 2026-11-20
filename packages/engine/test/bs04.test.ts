import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import {
  applyAction,
  baseCost,
  blockersFor,
  negatedBy,
  cardLevel,
  createGame,
  effectBlocked,
  effectsNegated,
  handCards,
  payableCost,
  type Action,
  type GameState,
  type PlayerId,
} from '../src';

const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;
const DARIU = no('มุฉะดาริว'); // สีแดง คอสต์ 1 BP 3000 ไม่มีเอฟเฟกต์

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
/** Brave ร่วมร่างกับ host */
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
const choose = (s: GameState, pick: Extract<Action, { type: 'choose' }>['pick']) => act(s, { type: 'choose', player: s.choice!.player, pick });
const passFlashes = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
function magic(s: GameState, name: string, opts: { soul?: boolean; player?: PlayerId; timing?: 'main' | 'flash' } = {}): GameState {
  const player = opts.player ?? 'p1';
  const cardNo = no(name);
  const cardId = inHand(s, player, cardNo);
  const reserve = s.players[player].reserve;
  const soulId = reserve.find((id) => s.cores[id]!.isSoul)!;
  const normal = reserve.filter((id) => !s.cores[id]!.isSoul);
  const cost = payableCost(s, db, player, db.get(cardNo));
  const payment = opts.soul ? [soulId, ...normal.slice(0, cost - 1)] : normal.slice(0, cost);
  return act(s, { type: 'useMagic', player, cardId, payment, timing: opts.timing ?? 'flash' });
}

describe('Booster Set 04', () => {
  it('Ultra Shield: ไม่รับผลเอฟเฟกต์ของการ์ดคู่แข่งสีที่ระบุ (ซันเทะสึ: แดง)', () => {
    const s = setup();
    const santetsu = put(s, 'p1', no('นักรบเครื่องกล ซันเทะสึ'), 1);
    const red = put(s, 'p2', DARIU, 1);
    const green = put(s, 'p2', no('นักบวชนินจา ฮิกุราชิ'), 1);
    expect(effectBlocked(s, db, red, santetsu)).toBe(true);
    expect(effectBlocked(s, db, green, santetsu)).toBe(false);
  });

  it('Ultra Shield ที่ Brave ให้ผู้ร่วมร่าง (ไฟเตอร์: เขียว/ฟ้า): เมจิคสีเขียวของคู่แข่งเลือกตัวนั้นไม่ได้', () => {
    const s = setup();
    const host = put(s, 'p2', no('นักบวชนินจา ฮิกุราชิ'), 1); // คอสต์ 3
    const fighter = brave(s, host, 'แขนเสื้อเกราะ ไฟเตอร์');
    const plain = put(s, 'p2', DARIU, 1);
    const x = magic(s, 'เคล็ดวิชาปลดปล่อยพสุธา');
    expect(x.choice?.kind === 'card' && x.choice.candidates).toEqual([plain]);
    // Shield กันไว้: หน้าเว็บเรืองแสงไฟเตอร์ (ที่ให้ Shield) · Dariu ไม่มี Shield ไม่เกี่ยว
    expect(x.log.filter((e) => e.type === 'staticApplied').map((e) => (e as { cardId: string }).cardId)).toEqual([fighter]);
  });

  it('ไทม์รีวินด์ (Main): นำเน็กซัสคู่แข่งกลับไปไว้ใต้สุดเด็ค', () => {
    const s = setup();
    const nexus = put(s, 'p2', no('No.3 ร็อคแฮนด์'), 0);
    const x = choose(magic(s, 'ไทม์รีวินด์', { timing: 'main' }), nexus);
    expect(x.players.p2.field).not.toContain(nexus);
    expect(x.players.p2.deck.at(-1)).toBe(nexus);
  });

  it('คองโก Lv2 (Soul Core) แอทแท็คสเต็ป: การ์ดคู่แข่งที่ถูกนำกลับขึ้นมือไปไว้ใต้สุดเด็คแทน', () => {
    let s = setup();
    const kongo = put(s, 'p1', no('มหานักรบเครื่องกล คองโก'), 3, true);
    const atk = put(s, 'p1', DARIU, 1);
    const target = put(s, 'p2', DARIU, 1);
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    const x = choose(magic(s, 'ดรีมบับเบิล'), target);
    expect(x.players.p2.hand).not.toContain(target);
    expect(x.players.p2.deck.at(-1)).toBe(target);
    // หน้าเว็บเรืองแสงคองโก (ความสามารถถาวรลงมือ)
    expect(x.log.some((e) => e.type === 'staticApplied' && e.cardId === kongo)).toBe(true);
  });

  it('ชิงุเระ Lv3 (Soul Core) โจมตี: ส่ง Soul Core ลงแทรช → ไม่ถูกป้องกันโดยสปิริต', () => {
    let s = setup();
    const shigure = put(s, 'p1', no('ขุนพลเครื่องกล ชิงุเระ'), 4, true);
    put(s, 'p2', DARIU, 1);
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: shigure });
    s = choose(s, 0);
    expect(blockersFor(s, db, 'p2')).toEqual([]);
  });

  it('ชิรานุอิ (Soul Core): ป้องกันได้แม้อยู่ในรูปแบบเสื่อมสภาพ', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1);
    const shiranui = put(s, 'p2', no('นักรบเครื่องกล ชิรานุอิ'), 1, true, 'exhausted');
    const tired = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    s = passFlashes(s);
    expect(blockersFor(s, db, 'p2')).toEqual([shiranui]);
    expect(blockersFor(s, db, 'p2')).not.toContain(tired);
  });

  it('ปราสาทเครื่องกล: เอนด์สเต็ปของคู่แข่ง ไลฟ์เราไม่เสียหาย → จั่ว 2 (2 ใบชื่อเดียวกันไม่ซ้ำซ้อน)', () => {
    const s = setup();
    put(s, 'p2', no('ปราสาทเครื่องกล'), 0);
    put(s, 'p2', no('ปราสาทเครื่องกล'), 0);
    const hand = s.players.p2.hand.length;
    const x = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'endAttackStep', player: 'p1' });
    expect(x.turnPlayer).toBe('p2');
    expect(x.players.p2.hand.length).toBe(hand + 2 + 1); // จั่ว 2 จากปราสาท + Draw Step 1
  });

  it('ปราสาทเครื่องกล: ไลฟ์เสียหายในเทิร์นนั้น = ไม่จั่ว', () => {
    let s = setup();
    put(s, 'p2', no('ปราสาทเครื่องกล'), 0);
    const atk = put(s, 'p1', DARIU, 1);
    const hand = s.players.p2.hand.length;
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    s = passFlashes(s);
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = passFlashes(s);
    const x = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(x.players.p2.hand.length).toBe(hand + 1);
  });

  it('ฟุบุกิโกะเซน: เทิร์นของคู่แข่ง มือคู่แข่งเพิ่มขึ้นโดยเอฟเฟกต์ → ต่อ 1 ใบ คู่แข่งทิ้ง 1 ใบ', () => {
    const s = setup();
    put(s, 'p2', no('ฟุบุกิโกะเซน'), 1);
    const cardNo = no('ชิคิงามิ โฮวริคิ'); // อัญเชิญ: จั่ว 1
    const card = inHand(s, 'p1', cardNo);
    const normal = s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);
    const cost = payableCost(s, db, 'p1', db.get(cardNo));
    let x = act(s, { type: 'summon', player: 'p1', cardId: card, payment: normal.slice(0, cost), placement: normal.slice(cost, cost + 1) });
    const hand = x.players.p1.hand.length;
    expect(x.choice?.player).toBe('p1');
    x = choose(x, x.choice!.kind === 'card' ? x.choice!.candidates[0]! : 0);
    expect(x.players.p1.hand.length).toBe(hand - 1);
  });

  it('เลิฟพรินเซส Lv2 (Soul Core): เน็กซัสคู่แข่งที่ไม่มีคำว่า "No." สูญเสียเอฟเฟกต์', () => {
    const s = setup();
    const love = put(s, 'p1', no('No.38 เลิฟพรินเซส'), 2, true);
    const plain = put(s, 'p2', no('ปราสาทเครื่องกล'), 0);
    const numbered = put(s, 'p2', no('No.3 ร็อคแฮนด์'), 0);
    expect(effectsNegated(s, db, plain)).toBe(true);
    expect(effectsNegated(s, db, numbered)).toBe(false);
    // ต้นเหตุที่หน้าเว็บเรืองแสงเมื่อ trigger ของเน็กซัสนั้นถูกตัด
    expect(negatedBy(s, db, plain)).toMatchObject({ cardId: love });
    expect(negatedBy(s, db, numbered)).toBeNull();
  });

  it('ทริคสเตอร์ Lv2: แอทแท็คสเต็ปของเรา เมจิคในมือคอสต์ -1', () => {
    const s = setup();
    put(s, 'p1', no('เซ็นโงคุฮิเมะ ทริคสเตอร์'), 3);
    const m = inHand(s, 'p1', no('ดรีมบับเบิล'));
    expect(baseCost(s, db, m)).toBe(4);
    s.phase = 'attack';
    expect(baseCost(s, db, m)).toBe(3);
  });

  it('ทริคสเตอร์ Lv2: ใช้เมจิคจริงในแอทแท็คสเต็ปของเรา จ่ายคอสต์ที่ลดแล้ว · การ์ดทริคสเตอร์เรืองแสง', () => {
    let s = setup();
    const trick = put(s, 'p1', no('เซ็นโงคุฮิเมะ ทริคสเตอร์'), 3);
    const atk = put(s, 'p1', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    const bubble = inHand(s, 'p1', no('ดรีมบับเบิล'));
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    const def = db.get(no('ดรีมบับเบิล'));
    const cost = payableCost(s, db, 'p1', def, baseCost(s, db, bubble));
    expect(cost).toBe(payableCost(s, db, 'p1', def) - 1);
    const normal = s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);
    s = act(s, { type: 'useMagic', player: 'p1', cardId: bubble, payment: normal.slice(0, cost), timing: 'flash' });
    expect(s.players.p1.hand).not.toContain(bubble);
    expect(s.log.some((e) => e.type === 'staticApplied' && e.cardId === trick)).toBe(true);
  });

  it('นายูทะ Lv2 (Soul Core): Flash ใช้เมจิคในมือ 1 ใบไม่จ่ายคอสต์', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1);
    const nayuta = put(s, 'p1', no('เซ็นโงคุฮิเมะ นายูทะ'), 2, true);
    const target = put(s, 'p2', DARIU, 1);
    const bubble = inHand(s, 'p1', no('ดรีมบับเบิล'));
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    const reserve = s.players.p1.reserve.length;
    s = act(s, { type: 'activate', player: 'p1', cardId: nayuta, source: 1 });
    s = choose(s, bubble);
    s = choose(s, target);
    expect(s.players.p2.hand).toContain(target);
    expect(s.players.p1.trashCards).toContain(bubble);
    expect(s.players.p1.reserve.length).toBe(reserve);
  });

  describe('อุสุงาเนะสไตรเกอร์ Lv2 (Soul Core): เก็นจิแต่ละตัว "เมื่อจบการต่อสู้ เทิร์นละ 1 ครั้ง ฟื้นสภาพได้"', () => {
    /** โจมตีโดยไม่มีใครป้องกัน จนจบการต่อสู้ (ถึงตัวเลือกฟื้นสภาพ ถ้ามี) */
    const attackThrough = (s: GameState, attacker: string) => {
      let x = act(s, { type: 'declareAttack', player: 'p1', attackerId: attacker });
      x = passFlashes(x);
      x = act(x, { type: 'noBlock', player: 'p2' });
      return passFlashes(x);
    };
    const setupGenji = () => {
      let s = setup();
      const usugane = put(s, 'p1', no('แปดอัศวินเก็นจิ อุสุงาเนะสไตรเกอร์'), 2, true);
      const hidasu = put(s, 'p1', no('แปดอัศวินเก็นจิ ฮิดาสุดีเฟนเดอร์'), 1);
      s = act(s, { type: 'endMain', player: 'p1' });
      return { s, usugane, hidasu };
    };

    it('นับแยกต่อตัว: อุสุงาเนะฟื้นได้ 1 ครั้ง ครั้งที่ 2 ไม่ได้ แต่ฮิดาสุดีเฟนเดอร์ยังฟื้นได้ของตัวเอง', () => {
      let { s, usugane, hidasu } = setupGenji();
      s = attackThrough(s, usugane);
      expect(s.choice?.kind === 'option' && s.choice.options[0]).toContain('ฟื้นสภาพ');
      s = choose(s, 0);
      expect(s.cards[usugane]!.state).toBe('refresh');
      // โจมตีอีกครั้ง: ใช้สิทธิ์ของตัวนี้ไปแล้ว ไม่ถาม
      s = attackThrough(s, usugane);
      expect(s.choice).toBeFalsy();
      expect(s.cards[usugane]!.state).toBe('exhausted');
      // เก็นจิอีกตัวยังมีสิทธิ์ของตัวเอง
      s = attackThrough(s, hidasu);
      expect(s.choice?.kind).toBe('option');
      s = choose(s, 0);
      expect(s.cards[hidasu]!.state).toBe('refresh');
    });

    it('เลือก "ไม่ใช้" = ยังไม่เสียสิทธิ์ (นับเฉพาะตอนฟื้นสภาพจริง)', () => {
      let { s, usugane } = setupGenji();
      s = attackThrough(s, usugane);
      s = choose(s, 1); // ไม่ใช้
      expect(s.cards[usugane]!.state).toBe('exhausted');
      // เทิร์นนี้ยังฟื้นสภาพได้ ถ้าโจมตีได้อีก: จำลองว่าตัวนี้ฟื้นสภาพด้วยเหตุอื่นแล้วโจมตีอีกครั้ง
      s.cards[usugane]!.state = 'refresh';
      s = attackThrough(s, usugane);
      expect(s.choice?.kind).toBe('option');
    });
  });

  describe('นอร์ธซีโรด: สปิริตสีขาวที่อัญเชิญเป็นใบแรกสุดของเทิร์น ได้คอร์วอยด์ 1 เม็ด', () => {
    const normalCores = (s: GameState) => s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);
    /** อัญเชิญจากมือ (วาง Core 1 ดวง) หรือร่วมร่างทันทีถ้าระบุ braveOnto */
    function summon(s: GameState, name: string, braveOnto?: string): { x: GameState; id: string } {
      const cardNo = no(name);
      const id = inHand(s, 'p1', cardNo);
      const normal = normalCores(s);
      const cost = payableCost(s, db, 'p1', db.get(cardNo));
      const placement = braveOnto ? [] : normal.slice(cost, cost + 1);
      const x = act(s, { type: 'summon', player: 'p1', cardId: id, payment: normal.slice(0, cost), placement, ...(braveOnto ? { braveOnto } : {}) });
      return { x, id };
    }
    const WHITE = 'สุนัขเครื่องกล เซตะด็อก';

    it('สปิริตขาวเป็นการอัญเชิญใบแรก → ได้คอร์', () => {
      const s = setup();
      put(s, 'p1', no('No.1 นอร์ธซีโรด'), 0);
      const { x, id } = summon(s, WHITE);
      expect(x.cards[id]!.cores).toHaveLength(2);
    });

    it('วางเน็กซัสก่อน (ไม่นับเป็นการอัญเชิญ) แล้วอัญเชิญสปิริตขาว → ได้คอร์', () => {
      let s = setup();
      const nexusNo = no('No.1 นอร์ธซีโรด');
      const nexus = inHand(s, 'p1', nexusNo);
      const cost = payableCost(s, db, 'p1', db.get(nexusNo));
      s = act(s, { type: 'deployNexus', player: 'p1', cardId: nexus, payment: normalCores(s).slice(0, cost), placement: [] });
      const { x, id } = summon(s, WHITE);
      expect(x.cards[id]!.cores).toHaveLength(2);
    });

    it('อัญเชิญสปิริตสีอื่นก่อน แล้วอัญเชิญสปิริตขาว → ไม่ได้', () => {
      const s = setup();
      put(s, 'p1', no('No.1 นอร์ธซีโรด'), 0);
      const first = summon(s, 'มุฉะดาริว');
      const { x, id } = summon(first.x, WHITE);
      expect(x.cards[id]!.cores).toHaveLength(1);
    });

    it('อัญเชิญ Brave ร่วมร่างทันทีเป็นใบแรก แล้วอัญเชิญสปิริตขาว → ไม่ได้ (Brave นับเป็นการอัญเชิญ)', () => {
      const s = setup();
      put(s, 'p1', no('No.1 นอร์ธซีโรด'), 0);
      const host = put(s, 'p1', no('นักบวชนินจา ฮิกุราชิ'), 1); // คอสต์ 3
      const first = summon(s, 'แขนเสื้อเกราะ ไฟเตอร์', host);
      expect(first.x.cards[host]!.braves).toContain(first.id);
      const { x, id } = summon(first.x, WHITE);
      expect(x.cards[id]!.cores).toHaveLength(1);
    });
  });

  it('โอคิดาคุ (ร่วมร่าง): ผู้ร่วมร่างโจมตีแล้วเราใช้เมจิค → ในการต่อสู้นี้เจ็มกลายเป็นเหลือง 2 เม็ด (ไลฟ์คู่แข่ง -2)', () => {
    let s = setup();
    const host = put(s, 'p1', no('นักรบเครื่องกล ชิรานุอิ'), 1); // คอสต์ 5 เจ็มขาว 1
    brave(s, host, 'โอคิดาคุ');
    const life = s.players.p2.life.length;
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: host });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    s = magic(s, 'เยลโล่รีคัฟเวอร์');
    // ร่างต้น (ขาว) ร่วมร่างโอคิดาคุ (เหลือง) = เป็นสปิริตสีเหลืองด้วย (กติกา 04: ได้รับสีจากเบรฟ) → ฟื้นสภาพตัวนี้ได้
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [host] });
    s = choose(s, host);
    expect(s.cards[host]!.state).toBe('refresh');
    expect(s.battle?.symbolOverride).toMatchObject({ cardId: host, color: 'yellow', count: 2 });
    s = passFlashes(s);
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = passFlashes(s);
    expect(s.players.p2.life.length).toBe(life - 2);
  });

  it('ไรกะ Dispersion: ระหว่างที่ไรกะโจมตี เมจิคที่เล็งเป้าคู่แข่ง 1 ตัว เล็งได้ 2 ตัว', () => {
    let s = setup();
    const raika = put(s, 'p1', no('เซ็นโงคุฮิเมะ ไรกะ'), 1);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: raika });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    s = magic(s, 'ดรีมบับเบิล');
    // Dispersion: เล็ง 2 ตัวทีเดียว
    expect(s.choice).toMatchObject({ kind: 'multiCard', count: 2, candidates: [a, b] });
    s = choose(s, { cards: [a, b] });
    expect(s.players.p2.hand).toEqual(expect.arrayContaining([a, b]));
  });

  it('ไม่มีไรกะในการต่อสู้: เมจิคเล็งเป้าได้ 1 ตัวตามปกติ', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1);
    put(s, 'p1', no('เซ็นโงคุฮิเมะ ไรกะ'), 1); // ไม่ได้ต่อสู้
    const a = put(s, 'p2', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    s = choose(magic(s, 'ดรีมบับเบิล'), a);
    expect(s.choice?.kind).not.toBe('card');
  });

  it('เทปเปคิวอลล์ในแทรช: ไม่รับผลเอฟเฟกต์ (ฟูรินดึงเมจิคกลับขึ้นมือได้เฉพาะใบอื่น)', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 5); // BP 8000
    const furin = put(s, 'p2', no('ฟูริน'), 1);
    const wall = inHand(s, 'p2', no('เทปเปคิวอลล์'));
    const other = inHand(s, 'p2', no('ดรีมบับเบิล'));
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== wall && id !== other);
    s.players.p2.trashCards.push(wall, other);
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: atk });
    s = passFlashes(s);
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: furin });
    s = passFlashes(s);
    expect(s.choice?.kind === 'card' && s.choice.candidates).toEqual([other]);
  });

  describe('ราดัน Lv2: สปิริต BP ≤ 10000 ของคู่แข่งต้องโจมตี และราดันป้องกันเอง', () => {
    it('จบแอทแท็คสเต็ปไม่ได้ถ้ายังมีตัวที่ต้องโจมตี · โจมตีแล้วราดันเข้าป้องกันอัตโนมัติ (แม้เสื่อมสภาพ)', () => {
      let s = setup();
      const radan = put(s, 'p2', no('นักรบเครื่องกลแห่งแขนยักษ์ ราดัน'), 2, false, 'exhausted'); // Lv2 BP 13000
      const atk = put(s, 'p1', DARIU, 1); // BP 3000
      s = act(s, { type: 'endMain', player: 'p1' });
      const r = applyAction(s, { type: 'endAttackStep', player: 'p1' }, db);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.code).toBe('MUST_ATTACK');
      s = act(s, { type: 'declareAttack', player: 'p1', attackerId: atk });
      s = passFlashes(s);
      expect(s.players.p1.field).not.toContain(atk); // แพ้ราดัน
      expect(s.players.p2.field).toContain(radan);
      // โจมตีครบแล้ว: จบแอทแท็คสเต็ปได้
      expect(applyAction(s, { type: 'endAttackStep', player: 'p1' }, db).ok).toBe(true);
    });

    it('สปิริต BP เกิน 10000 ไม่ถูกบังคับ', () => {
      let s = setup();
      put(s, 'p2', no('นักรบเครื่องกลแห่งแขนยักษ์ ราดัน'), 2);
      put(s, 'p1', no('มหานักรบเครื่องกล คองโก'), 3); // Lv2 BP 14000
      s = act(s, { type: 'endMain', player: 'p1' });
      expect(applyAction(s, { type: 'endAttackStep', player: 'p1' }, db).ok).toBe(true);
    });
  });

  describe('อันโกะ (Soul Core): เริ่มแอทแท็คสเต็ปของเรา วางแสดงการ์ดนอกมือ เพื่อจั่ว 1', () => {
    const setupAnko = () => {
      let s = setup();
      put(s, 'p1', no('เซ็นโงคุฮิเมะ อันโกะ'), 1, true);
      const spirit3 = inHand(s, 'p1', no('นักรบเครื่องกล ไซอุน')); // คอสต์ 3
      const hand = s.players.p1.hand.length;
      s = act(s, { type: 'endMain', player: 'p1' });
      expect(s.choice?.kind).toBe('option');
      s = choose(s, 0);
      s = choose(s, spirit3);
      return { s, spirit3, hand };
    };

    it('วางแสดงแล้วจั่ว 1 · การ์ดที่วางแสดงทั้งสองฝ่ายเห็น ยังอยู่ใช้งานได้', () => {
      const { s, spirit3, hand } = setupAnko();
      expect(s.shownCards).toContain(spirit3);
      expect(s.players.p1.hand).toContain(spirit3);
      expect(s.players.p1.hand.length).toBe(hand + 1);
    });

    it('การ์ดที่วางแสดงไม่ถูกเอฟเฟกต์ทิ้งการ์ดในมือเลือก และอัญเชิญได้ตามปกติ (แล้วเลิกแสดง)', () => {
      let { s, spirit3 } = setupAnko();
      // การ์ดในมือจริงที่เอฟเฟกต์ทิ้งการ์ดเลือกได้ ไม่รวมใบที่วางแสดง
      expect(handCards(s, 'p1')).not.toContain(spirit3);
      // ให้กลับไปเมนสเต็ปเพื่ออัญเชิญ (จำลอง)
      s.phase = 'main';
      const cardNo = no('นักรบเครื่องกล ไซอุน');
      const normal = s.players.p1.reserve.filter((id) => !s.cores[id]!.isSoul);
      const cost = payableCost(s, db, 'p1', db.get(cardNo));
      s = act(s, { type: 'summon', player: 'p1', cardId: spirit3, payment: normal.slice(0, cost), placement: normal.slice(cost, cost + 1) });
      expect(s.players.p1.field).toContain(spirit3);
      expect(s.shownCards ?? []).not.toContain(spirit3);
    });
  });

  describe('ตามเอกสารกติกา (docs/rules)', () => {
    it('Ultra Shield ไม่กันเอฟเฟกต์ของเบรฟ (กติกา 14 Shield)', () => {
      const s = setup();
      const santetsu = put(s, 'p1', no('นักรบเครื่องกล ซันเทะสึ'), 1); // Ultra Shield: แดง
      const redBrave = put(s, 'p2', no('ชุดเกราะมังกร ดรากุมารุ'), 1);
      const redSpirit = put(s, 'p2', DARIU, 1);
      expect(effectBlocked(s, db, redBrave, santetsu)).toBe(false);
      expect(effectBlocked(s, db, redSpirit, santetsu)).toBe(true);
    });

    it('True-Rage: สปิริตที่มีชีลด์สีของผู้โจมตีไม่ต้องป้องกัน (กติกา 14 Rage Q&A 1)', () => {
      let s = setup();
      const guren = put(s, 'p1', no('เซ็นโกคุ-กุเร็นดราก้อน'), 1); // True-Rage สีแดง
      put(s, 'p2', no('นักรบเครื่องกล ซันเทะสึ'), 1);
      s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: guren });
      while (s.choice) s = choose(s, s.choice.kind === 'option' ? 0 : null);
      s = passFlashes(s);
      expect(applyAction(s, { type: 'noBlock', player: 'p2' }, db).ok).toBe(true);
    });

    it('ตีระบุ (โอริงามิ เบิร์ด): ไม่มีแฟลชหลังโจมตี ตัวที่เลือกป้องกันทันที และเลือกตัวที่มีชีลด์ไม่ได้ (กติกา 14 ตีระบุ)', () => {
      let s = setup();
      const host = put(s, 'p1', no('นักบวชนินจา ฮิกุราชิ'), 1); // ชั่วคราว: เปลี่ยนเป็นสปิริตคอสต์ ≥ 4 ด้านล่าง
      s.cards[host]!.cardNo = no('นักรบเครื่องกล ชิรานุอิ'); // คอสต์ 5
      brave(s, host, 'โอริงามิ เบิร์ด');
      const tired = put(s, 'p2', DARIU, 1, false, 'exhausted');
      put(s, 'p2', no('นักรบเครื่องกล ชิรานุอิ'), 1, false, 'exhausted'); // ชีลด์ม่วง (เบิร์ดสีม่วง) เลือกไม่ได้
      s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: host });
      expect(s.choice?.kind === 'card' && s.choice.candidates).toEqual([tired]);
      s = choose(s, tired);
      expect(s.battle?.blockers).toEqual([tired]);
      expect(s.battle?.step).toBe('flashAfterBlock');
    });

    it('ชีลด์กันการเปลี่ยนเลเวลคอสต์ (กติกา 09): โอดิน Lv2 ทำให้เน็กซัสไม่รับผลราโชว', () => {
      const s = setup();
      put(s, 'p1', no('ยักษ์นักสู้สวมเกราะ ราโชว'), 3);
      const soul = s.players.p1.reserve.find((id) => s.cores[id]!.isSoul)!;
      s.players.p1.reserve = s.players.p1.reserve.filter((id) => id !== soul);
      s.players.p1.trashCores.push(soul);
      const nexus = put(s, 'p2', no('No.3 ร็อคแฮนด์'), 1);
      expect(cardLevel(s, db, nexus)).toBe(0);
      put(s, 'p2', no('ป้อมปราการไร้พ่าย โอดิน'), 3); // Lv2: เน็กซัสทุกใบไม่รับผลเอฟเฟกต์สปิริตของคู่แข่ง
      expect(cardLevel(s, db, nexus)).toBe(2);
    });

    it('การ์ดที่วางแสดงนอกมือ: เซ็ทเป็นเบิร์สไม่ได้ และไม่รับผลลดคอสต์ "การ์ดในมือ" (กติกา 06 Q&A 5, 14 นอกมือ)', () => {
      const s = setup();
      put(s, 'p1', no('เซ็นโงคุฮิเมะ ทริคสเตอร์'), 3);
      const shown = inHand(s, 'p1', no('เบิร์สวอลล์'));
      const normal = inHand(s, 'p1', no('เบิร์สวอลล์'));
      s.shownCards = [shown];
      expect(applyAction(s, { type: 'setBurst', player: 'p1', cardId: shown }, db).ok).toBe(false);
      expect(applyAction(s, { type: 'setBurst', player: 'p1', cardId: normal }, db).ok).toBe(true);
      s.phase = 'attack';
      expect(baseCost(s, db, normal)).toBe(db.get(no('เบิร์สวอลล์')).cost - 1);
      expect(baseCost(s, db, shown)).toBe(db.get(no('เบิร์สวอลล์')).cost);
    });
  });

  it('ซึกิอุซางิ Holy Life: การโจมตีทำให้ไลฟ์คู่แข่งเสียหาย → คอร์วอยด์วางไลฟ์เรา', () => {
    let s = setup();
    const usagi = put(s, 'p1', no('ซึกิอุซางิ'), 1);
    s.players.p1.life.pop();
    const life = s.players.p1.life.length;
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: usagi });
    s = passFlashes(s);
    s = act(s, { type: 'noBlock', player: 'p2' });
    s = passFlashes(s);
    expect(s.players.p1.life.length).toBe(life + 1);
  });
});

describe('Dispersion ตามกติกา 14 (แก้บั๊ก)', () => {
  /** ไรกะโจมตีอยู่ (Dispersion 2) แล้วผ่านแฟลชของคู่แข่งมาถึงคิวเรา */
  function raikaAttacking(s: GameState): GameState {
    const raika = put(s, 'p1', no('เซ็นโงคุฮิเมะ ไรกะ'), 1);
    s = act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: raika });
    if (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    return s;
  }

  it('ข้อ 11: "อย่างละ 1 ตัว" (ทลายครามกงล้อสวรรค์) เล็งพร้อมกัน = กระจายไม่ได้', () => {
    let s = setup();
    // สปิริตคอสต์ 0 ที่ความสามารถน้อยที่สุด (ไม่มีใบที่ไม่มีความสามารถเลย)
    const zero = db
      .all()
      .filter((c) => c.type === 'spirit' && c.cost === 0)
      .sort((x, y) => x.abilities.length - y.abilities.length)[0]!.cardNo;
    const a = put(s, 'p2', zero, 1);
    const b = put(s, 'p2', zero, 1);
    s = magic(raikaAttacking(s), 'ทลายครามกงล้อสวรรค์');
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [a, b] });
    s = choose(s, a);
    expect(s.players.p2.field).toContain(b);
  });

  it('ข้อ 1: เอฟเฟกต์ที่เล็งเน็กซัส (เอ็นชินสไตรค์ ส่วนโซลคอร์) กระจายไม่ได้', () => {
    let s = setup();
    const nexus = db.all().find((c) => c.type === 'nexus')!.cardNo;
    const n1 = put(s, 'p2', nexus, 0);
    const n2 = put(s, 'p2', nexus, 0);
    s = magic(raikaAttacking(s), 'เอ็นชินสไตรค์', { soul: true });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [n1, n2] });
    s = choose(s, n1);
    expect(s.players.p2.field).toContain(n2);
  });

  it('สปิริตที่ใช้เป็นเมจิค (นักดาบบิวะ โบคุโบคุ) กระจายได้ (เจ้าของโปรเจกต์กำหนด)', () => {
    let s = setup();
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = magic(raikaAttacking(s), 'นักดาบบิวะ โบคุโบคุ');
    expect(s.choice).toMatchObject({ kind: 'multiCard', count: 2, candidates: [a, b] });
  });
});
