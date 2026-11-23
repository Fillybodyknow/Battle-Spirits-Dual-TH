import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, createGame, payableCost, type Action, type GameState, type PlayerId, type Seat } from '../src';
import { zonesOf } from '../src/seats';
import { conditionHolds, currentBp } from '../src/rules';

/** โหมด 2VS2 (กติกา 15): สนามร่วม แยกโซนส่วนตัว เล่นพร้อมกันในเทิร์นทีม */
const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;
const DARIU = no('มุฉะดาริว'); // สีแดง คอสต์ 1 BP 3000 (Core 1/3/5) ไม่มีเอฟเฟกต์

function setup(): GameState {
  const deck = Array<string>(40).fill(DARIU);
  return createGame({
    db,
    decks: { p1: deck, p2: deck },
    partnerDecks: { p1: deck, p2: deck },
    seed: 1,
    firstPlayer: 'p1',
    shuffleDecks: false,
    config: { firstPlayerSkipsAttackStep: false },
  }).state;
}

function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}
const fails = (s: GameState, action: Action) => {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
};
const z = (s: GameState, p: PlayerId, seat: Seat) => zonesOf(s, p, seat);

/** ที่นั่ง seat ของ p1 อัญเชิญมุฉะดาริวจากมือ (จ่าย 1 + วาง 1 จากรีเสิร์ฟของตัวเอง) */
function summon(s: GameState, seat: Seat): { s: GameState; id: string } {
  const zone = z(s, 'p1', seat);
  const id = zone.hand[0]!;
  const normals = zone.reserve.filter((c) => !s.cores[c]!.isSoul);
  // เจ็มบนสนามรวมของทีมลดคอสต์ได้ (กติกา 15 ข้อ 8)
  const cost = payableCost(s, db, 'p1', db.get(DARIU));
  const next = act(s, { type: 'summon', player: 'p1', seat, cardId: id, payment: normals.slice(0, cost), placement: [normals[cost]!] });
  return { s: next, id };
}

describe('2VS2', () => {
  it('เริ่มเกม: ทุกคนมีไลฟ์ 5 มือ 4 (ทีมที่เริ่มก่อนจั่วแล้ว = 5) รีเสิร์ฟ 3 + โซลคอร์ ของตัวเอง', () => {
    const s = setup();
    expect(s.mode).toBe('2v2');
    for (const p of ['p1', 'p2'] as PlayerId[]) {
      for (const seat of [0, 1] as Seat[]) {
        const zone = z(s, p, seat);
        expect(zone.life).toHaveLength(5);
        expect(zone.hand).toHaveLength(p === 'p1' ? 5 : 4);
        expect(zone.reserve).toHaveLength(4);
        expect(zone.reserve.filter((c) => s.cores[c]!.isSoul)).toHaveLength(1);
        for (const id of [...zone.hand, ...zone.deck]) expect(s.cards[id]!.seat ?? 0).toBe(seat);
        for (const c of [...zone.life, ...zone.reserve]) expect(s.cores[c]!.seat ?? 0).toBe(seat);
      }
    }
  });

  it('เทิร์นทีม: ทั้งสองคนได้คอร์และจั่ว', () => {
    let s = setup();
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'endMain', player: 'p1', seat: 1 });
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    s = act(s, { type: 'endAttackStep', player: 'p1', seat: 1 });
    expect(s.turnPlayer).toBe('p2');
    for (const seat of [0, 1] as Seat[]) {
      expect(z(s, 'p2', seat).hand).toHaveLength(5);
      expect(z(s, 'p2', seat).reserve).toHaveLength(5);
    }
  });

  it('อัญเชิญด้วยคอร์ของตัวเอง · การ์ดอยู่บนสนามรวมพร้อมที่นั่งเจ้าของ · เพื่อนจัดคอร์/โจมตีด้วยการ์ดนี้ไม่ได้', () => {
    let s = setup();
    const before0 = z(s, 'p1', 0).reserve.length;
    const r = summon(s, 1);
    s = r.s;
    expect(s.players.p1.field).toContain(r.id);
    expect(s.cards[r.id]!.seat).toBe(1);
    expect(z(s, 'p1', 1).reserve).toHaveLength(2);
    expect(z(s, 'p1', 0).reserve).toHaveLength(before0);
    // ที่นั่ง 0 ใช้คอร์ของเพื่อนไม่ได้ · วางคอร์บนการ์ดเพื่อนไม่ได้
    expect(fails(s, { type: 'moveCores', player: 'p1', moves: [{ coreId: z(s, 'p1', 1).reserve[0]!, to: { area: 'reserve' } }] })).toBe('CORE_NOT_OWNED');
    expect(fails(s, { type: 'moveCores', player: 'p1', moves: [{ coreId: z(s, 'p1', 0).reserve[0]!, to: { cardId: r.id } }] })).toBe('NOT_YOUR_CARD');
    // เจ้าของวางคอร์เพิ่มได้
    s = act(s, { type: 'moveCores', player: 'p1', seat: 1, moves: [{ coreId: z(s, 'p1', 1).reserve.find((c) => !s.cores[c]!.isSoul)!, to: { cardId: r.id } }] });
    expect(s.cards[r.id]!.cores).toHaveLength(2);
    // จบเมนสเต็ปต้องพร้อมทั้งสองคน
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.phase).toBe('main');
    s = act(s, { type: 'endMain', player: 'p1', seat: 1 });
    expect(s.phase).toBe('attack');
    expect(fails(s, { type: 'declareAttack', player: 'p1', attackerId: r.id })).toBe('NOT_YOUR_CARD');
    s = act(s, { type: 'declareAttack', player: 'p1', seat: 1, attackerId: r.id });
    expect(s.battle?.attackerId).toBe(r.id);
  });

  it('โจมตีไม่ถูกป้องกัน: ไลฟ์ของคู่แข่งลดพร้อมกันทั้งสองคน · แฟลชต้องผ่านครบทุกคน', () => {
    let s = setup();
    const r = summon(s, 1);
    s = act(act(r.s, { type: 'endMain', player: 'p1' }), { type: 'endMain', player: 'p1', seat: 1 });
    s = act(s, { type: 'declareAttack', player: 'p1', seat: 1, attackerId: r.id });
    // Flash ก่อนป้องกัน: ฝ่ายป้องกัน (p2) มีสิทธิ์ก่อน ต้องผ่านทั้งสองคน
    expect(s.battle!.flash!.priority).toBe('p2');
    s = act(s, { type: 'passFlash', player: 'p2' });
    expect(s.battle!.flash!.priority).toBe('p2');
    s = act(s, { type: 'passFlash', player: 'p2', seat: 1 });
    expect(s.battle!.flash!.priority).toBe('p1');
    s = act(s, { type: 'passFlash', player: 'p1', seat: 1 });
    s = act(s, { type: 'passFlash', player: 'p1' });
    expect(s.battle!.step).toBe('declareBlock');
    // ไม่ป้องกัน = โหวตครบทั้งสองคน
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.battle!.step).toBe('declareBlock');
    expect(z(s, 'p2', 0).life).toHaveLength(5);
    s = act(s, { type: 'noBlock', player: 'p2', seat: 1 });
    expect(z(s, 'p2', 0).life).toHaveLength(4);
    expect(z(s, 'p2', 1).life).toHaveLength(4);
    // คอร์ไลฟ์ไปรีเสิร์ฟของแต่ละคน
    for (const seat of [0, 1] as Seat[]) for (const c of z(s, 'p2', seat).reserve) expect(s.cores[c]!.seat ?? 0).toBe(seat);
  });

  it('การ์ดที่ออกจากสนามลงแทรชเจ้าของ และคอร์บนการ์ดกลับรีเสิร์ฟเจ้าของ', () => {
    let s = setup();
    const r = summon(s, 1);
    s = r.s;
    const core = s.cards[r.id]!.cores[0]!;
    // ที่นั่ง 0 ถอดคอร์สุดท้ายออกจากการ์ดเพื่อนไม่ได้ → ให้เจ้าของถอดเอง = สูญสลาย
    s = act(s, { type: 'moveCores', player: 'p1', seat: 1, moves: [{ coreId: core, to: { area: 'reserve' } }] });
    expect(s.players.p1.field).not.toContain(r.id);
    expect(z(s, 'p1', 1).trashCards).toContain(r.id);
    expect(z(s, 'p1', 0).trashCards).not.toContain(r.id);
    expect(z(s, 'p1', 1).reserve).toContain(core);
  });

  it('เอฟเฟกต์ที่ลงผลกับเด็ค/มือของคู่แข่ง = คู่แข่งทั้งสองคน (ทิ้งเด็ค 2 ใบ = คนละ 2 ใบ · ทิ้งมือ = แต่ละคนเลือกทิ้งของตัวเอง)', () => {
    let s = setup();
    const src = z(s, 'p1', 1).hand[0]!;
    const deck0 = z(s, 'p2', 0).deck.length;
    const deck1 = z(s, 'p2', 1).deck.length;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'mill', count: 2 }, { do: 'opponentDiscards', count: 1 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(z(s, 'p2', 0).deck).toHaveLength(deck0 - 2);
    expect(z(s, 'p2', 1).deck).toHaveLength(deck1 - 2);
    expect(z(s, 'p2', 0).trashCards).toHaveLength(2);
    expect(z(s, 'p2', 1).trashCards).toHaveLength(2);
    // คู่แข่งคนแรกเลือกจากมือตัวเอง แล้วคนที่สอง
    expect(s.choice?.player).toBe('p2');
    const c0 = (s.choice as { candidates: string[] }).candidates;
    expect(c0.every((id) => (s.cards[id]!.seat ?? 0) === 0)).toBe(true);
    s = act(s, { type: 'choose', player: 'p2', pick: c0[0]! });
    const c1 = (s.choice as { candidates: string[] }).candidates;
    expect(c1.every((id) => s.cards[id]!.seat === 1)).toBe(true);
    s = act(s, { type: 'choose', player: 'p2', seat: 1, pick: c1[0]! });
    expect(z(s, 'p2', 0).hand).toHaveLength(3);
    expect(z(s, 'p2', 1).hand).toHaveLength(3);
    expect(z(s, 'p2', 1).trashCards).toContain(c1[0]);
  });

  it('เอฟเฟกต์จั่วการ์ด: เจ้าของเอฟเฟกต์เลือกว่าใครในทีมจั่ว', () => {
    let s = setup();
    const src = z(s, 'p1', 1).hand[0]!; // การ์ดของที่นั่ง 1 = ที่นั่ง 1 เป็นเจ้าของเอฟเฟกต์
    const h0 = z(s, 'p1', 0).hand.length;
    const h1 = z(s, 'p1', 1).hand.length;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'draw', count: 2 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind).toBe('option');
    expect((s.choice as { options: string[] }).options).toEqual(['เราจั่ว', 'ให้เพื่อนร่วมทีมจั่ว']);
    s = act(s, { type: 'choose', player: 'p1', seat: 1, pick: 1 });
    expect(z(s, 'p1', 0).hand).toHaveLength(h0 + 2);
    expect(z(s, 'p1', 1).hand).toHaveLength(h1);
  });

  it('จั่วแล้วทิ้ง: ให้เพื่อนจั่ว = เพื่อนเป็นคนทิ้งด้วย', () => {
    let s = setup();
    const src = z(s, 'p1', 1).hand[0]!;
    const h0 = z(s, 'p1', 0).hand.length;
    const h1 = z(s, 'p1', 1).hand.length;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'draw', count: 2 }, { do: 'discard', count: 1 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect((s.choice as { options: string[] }).options).toEqual(['เราจั่ว (และทิ้ง)', 'ให้เพื่อนร่วมทีมจั่ว (และทิ้ง)']);
    s = act(s, { type: 'choose', player: 'p1', seat: 1, pick: 1 });
    // ทิ้ง: เลือกจากมือของเพื่อน (ที่นั่ง 0)
    expect(s.choice?.kind).toBe('card');
    const cands = (s.choice as { candidates: string[] }).candidates;
    expect(cands.every((id) => (s.cards[id]!.seat ?? 0) === 0)).toBe(true);
    s = act(s, { type: 'choose', player: 'p1', pick: cands[0]! });
    expect(z(s, 'p1', 0).hand).toHaveLength(h0 + 1);
    expect(z(s, 'p1', 1).hand).toHaveLength(h1);
  });

  it('แทรชเรา = แทรชทั้งทีม: นำทั้งหมดกลับใต้เด็ค (วันโคมะ) = การ์ดกลับเด็คของเจ้าของแต่ละใบ', () => {
    let s = setup();
    const a = z(s, 'p1', 0).deck.splice(0, 2);
    const b = z(s, 'p1', 1).deck.splice(0, 2);
    z(s, 'p1', 0).trashCards.push(...a);
    z(s, 'p1', 1).trashCards.push(...b);
    const src = z(s, 'p1', 0).hand[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'trashToDeckBottom' }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    // เรียงทีละกอง (ของเรา แล้วของเพื่อน) ถ้าการ์ดต่างชื่อ
    for (let i = 0; i < 4 && s.choice?.kind === 'arrange'; i++) {
      const ids = (s.choice as { cardIds: string[] }).cardIds;
      s = act(s, { type: 'choose', player: 'p1', ...(ids.some((id) => (s.cards[id]!.seat ?? 0) === 1) ? { seat: 1 as Seat } : {}), pick: { order: ids } });
    }
    expect(z(s, 'p1', 0).trashCards).toHaveLength(0);
    expect(z(s, 'p1', 1).trashCards).toHaveLength(0);
    expect(z(s, 'p1', 0).deck.slice(-2).sort()).toEqual([...a].sort());
    expect(z(s, 'p1', 1).deck.slice(-2).sort()).toEqual([...b].sort());
  });

  it('เงื่อนไขนับแทรช (trashAtLeast) นับแทรชทั้งทีม', () => {
    const s = setup();
    z(s, 'p1', 1).trashCards.push(...z(s, 'p1', 1).deck.splice(0, 3));
    const src = z(s, 'p1', 0).hand[0]!;
    expect(conditionHolds(s, src, { trashAtLeast: 3 })).toBe(true);
  });

  it('มือคู่แข่งเพิ่มขึ้นโดยเอฟเฟกต์ → ทิ้งต่อจำนวนที่เพิ่ม: เฉพาะคนที่จั่ว (ฟุบุกิโกะเซน)', () => {
    let s = setup();
    const fubuki = z(s, 'p2', 0).hand.shift()!;
    s.cards[fubuki]!.cardNo = no('ฟุบุกิโกะเซน');
    s.players.p2.field.push(fubuki);
    for (const c of z(s, 'p2', 0).reserve.filter((c) => !s.cores[c]!.isSoul).slice(0, 3)) {
      z(s, 'p2', 0).reserve.splice(z(s, 'p2', 0).reserve.indexOf(c), 1);
      s.cards[fubuki]!.cores.push(c);
    }
    const src = z(s, 'p1', 0).hand[0]!;
    const h0 = z(s, 'p1', 0).hand.length;
    const h1 = z(s, 'p1', 1).hand.length;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'draw', count: 1 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'choose', player: 'p1', pick: 1 }); // ให้เพื่อนจั่ว
    for (let i = 0; i < 3 && s.choice?.kind === 'card'; i++) {
      const cands = (s.choice as { candidates: string[] }).candidates;
      expect(cands.every((id) => (s.cards[id]!.seat ?? 0) === 1)).toBe(true);
      s = act(s, { type: 'choose', player: 'p1', seat: 1, pick: cands[0]! });
    }
    expect(z(s, 'p1', 0).hand).toHaveLength(h0);
    expect(z(s, 'p1', 1).hand).toHaveLength(h1); // จั่ว 1 ทิ้ง 1
  });

  it('Kagemusha ในมือของเพื่อนร่วมทีม: ถามคนที่มีการ์ด (เจ้าของสปิริตที่ถูกเล็งไม่มี)', () => {
    let s = setup();
    // สปิริตของ p2 ที่นั่ง 0 มีโซลคอร์ ถูกเล็ง
    const target = z(s, 'p2', 0).hand.shift()!;
    s.players.p2.field.push(target);
    const soul = z(s, 'p2', 0).reserve.find((c) => s.cores[c]!.isSoul)!;
    z(s, 'p2', 0).reserve.splice(z(s, 'p2', 0).reserve.indexOf(soul), 1);
    s.cards[target]!.cores.push(soul);
    // S23 (Kagemusha) อยู่ในมือของ p2 ที่นั่ง 1
    const s23 = z(s, 'p2', 1).hand[0]!;
    s.cards[s23]!.cardNo = no('นักรบเครื่องกล S23');
    for (let i = 0; i < 4; i++) z(s, 'p2', 1).reserve.push(...[0].map(() => { const id = `kc-${i}`; s.cores[id] = { id, owner: 'p2', isSoul: false, seat: 1 }; return id; }));
    const src = z(s, 'p1', 0).hand[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'choose', player: 'p1', pick: target });
    expect(s.choice?.kind).toBe('option');
    expect(s.choice?.player).toBe('p2');
    expect(s.queue[0]!.seat).toBe(1);
    expect((s.choice as { options: string[] }).options.some((o) => o.includes('Kagemusha: อัญเชิญ'))).toBe(true);
  });

  it('Kagemusha ทั้งสองคนมี: ถามเจ้าของสปิริตก่อน · ไม่ใช้ = ถามเพื่อนต่อ', () => {
    let s = setup();
    const target = z(s, 'p2', 0).hand.shift()!;
    s.players.p2.field.push(target);
    const soul = z(s, 'p2', 0).reserve.find((c) => s.cores[c]!.isSoul)!;
    z(s, 'p2', 0).reserve.splice(z(s, 'p2', 0).reserve.indexOf(soul), 1);
    s.cards[target]!.cores.push(soul);
    for (const seat of [0, 1] as Seat[]) {
      s.cards[z(s, 'p2', seat).hand[0]!]!.cardNo = no('นักรบเครื่องกล S23');
      for (let i = 0; i < 4; i++) {
        const id = `kc-${seat}-${i}`;
        s.cores[id] = { id, owner: 'p2', isSoul: false, ...(seat ? { seat } : {}) };
        z(s, 'p2', seat).reserve.push(id);
      }
    }
    const src = z(s, 'p1', 0).hand[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'choose', player: 'p1', pick: target });
    expect(s.queue[0]!.seat).toBe(0);
    const opts = (s.choice as { options: string[] }).options;
    s = act(s, { type: 'choose', player: 'p2', pick: opts.indexOf('ไม่ใช้ Kagemusha') });
    expect(s.choice?.kind).toBe('option');
    expect(s.choice?.player).toBe('p2');
    expect(s.queue[0]!.seat).toBe(1);
    s = act(s, { type: 'choose', player: 'p2', seat: 1, pick: (s.choice as { options: string[] }).options.indexOf('ไม่ใช้ Kagemusha') });
    // ไม่มีใครใช้: เอฟเฟกต์เลือกเป้าเดิม
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1', candidates: [target] });
    s = act(s, { type: 'choose', player: 'p1', pick: target });
    expect(s.cards[target]!.state).toBe('exhausted');
  });

  it('ทาเคะนาชิ ฟอร์เทรส: ไม่รับผลเอฟเฟกต์ของเรา/เพื่อน (ยกเว้นสปิริตชื่อ เก็นจิ)', () => {
    let s = setup();
    const take = z(s, 'p1', 0).hand.shift()!;
    s.cards[take]!.cardNo = no('แปดอัศวินเก็นจิ ทาเคะนาชิ ฟอร์เทรส');
    const dariu = z(s, 'p1', 0).hand.shift()!;
    for (const id of [take, dariu]) {
      s.players.p1.field.push(id);
      const c = z(s, 'p1', 0).reserve.find((x) => !s.cores[x]!.isSoul)!;
      z(s, 'p1', 0).reserve.splice(z(s, 'p1', 0).reserve.indexOf(c), 1);
      s.cards[id]!.cores.push(c);
      s.cards[id]!.state = 'exhausted';
    }
    const bp = currentBp(s, db, take);
    // เอฟเฟกต์ของเพื่อนร่วมทีม (ไม่ใช่เก็นจิ): ฟื้นสภาพ 1 ตัว = เลือกได้แค่มุฉะดาริว · BP+ ทั้งหมด = ไม่รับผล
    const src = z(s, 'p1', 1).hand[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'buffAllies', amount: 3000 }, { do: 'refreshChosenAlly', filter: { types: ['spirit'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(currentBp(s, db, take)).toBe(bp);
    expect(currentBp(s, db, dariu)).toBe(3000 + 3000);
    if (s.choice) {
      expect((s.choice as { candidates: string[] }).candidates).toEqual([dariu]);
      s = act(s, { type: 'choose', player: 'p1', pick: dariu });
    }
    expect(s.cards[take]!.state).toBe('exhausted');
    expect(s.cards[dariu]!.state).toBe('refresh');
  });

  it('ป้องกัน: คนใดคนหนึ่งประกาศป้องกัน = ทีมป้องกัน (โหวตไม่ป้องกันที่ค้างอยู่ถูกล้าง)', () => {
    let s = setup();
    const a = summon(s, 0);
    s = act(act(a.s, { type: 'endMain', player: 'p1' }), { type: 'endMain', player: 'p1', seat: 1 });
    // p2 ที่นั่ง 1 มีสปิริตไว้ป้องกัน
    const blocker = z(s, 'p2', 1).hand[0]!;
    z(s, 'p2', 1).hand.splice(0, 1);
    s.players.p2.field.push(blocker);
    const core = z(s, 'p2', 1).reserve.find((c) => !s.cores[c]!.isSoul)!;
    z(s, 'p2', 1).reserve.splice(z(s, 'p2', 1).reserve.indexOf(core), 1);
    s.cards[blocker]!.cores.push(core);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: a.id });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority, ...(s.battle.flash.seatsPassed?.includes(0) ? { seat: 1 as Seat } : {}) });
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.battle!.noBlockVotes).toEqual([0]);
    // ที่นั่ง 0 ป้องกันด้วยสปิริตของเพื่อนไม่ได้
    expect(fails(s, { type: 'declareBlock', player: 'p2', blockerId: blocker })).toBe('NOT_YOUR_CARD');
    s = act(s, { type: 'declareBlock', player: 'p2', seat: 1, blockerId: blocker });
    expect(s.battle!.blockers).toEqual([blocker]);
    expect(s.battle!.noBlockVotes).toBeUndefined();
  });

  it('ถอดคอร์จากรีเสิร์ฟคู่แข่ง: เลือกจากรีเสิร์ฟของคู่แข่งทั้งสองคนรวมกัน', () => {
    let s = setup();
    const src = z(s, 'p1', 0).hand[0]!;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'removeOpponentCores', count: 3, to: 'trash', withReserve: true }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind).toBe('distribute');
    const c = s.choice as { candidates: string[]; caps: Record<string, number> };
    expect(c.candidates).toEqual(['pile:reserve:p2', 'pile:reserve:p2:1']);
    expect(c.caps['pile:reserve:p2:1']).toBe(4);
    s = act(s, { type: 'choose', player: 'p1', pick: { alloc: { 'pile:reserve:p2': 1, 'pile:reserve:p2:1': 2 } } });
    expect(z(s, 'p2', 0).reserve).toHaveLength(3);
    expect(z(s, 'p2', 1).reserve).toHaveLength(2);
    expect(z(s, 'p2', 0).trashCores).toHaveLength(1);
    expect(z(s, 'p2', 1).trashCores).toHaveLength(2);
  });

  it('เบรฟของเราร่วมร่างกับสปิริตของเพื่อน · สปิริตเพื่อนออกจากสนาม = เจ้าของเบรฟเลือกให้อยู่ต่อด้วยคอร์ของตัวเอง', () => {
    const BRAVE = no('มังกรบินชุดเกราะ โอโซเดลเกอร์'); // เบรฟ คอสต์ 5 (ลดแดง 3) ร่วมร่างกับคอสต์ 1 ขึ้นไป Lv1 = 1 คอร์
    let s = setup();
    const host = summon(s, 0);
    s = host.s;
    const hostCore = s.cards[host.id]!.cores[0]!;
    // ที่นั่ง 1 มีเบรฟในมือ + คอร์พอจ่าย
    const brave = z(s, 'p1', 1).hand[0]!;
    s.cards[brave]!.cardNo = BRAVE;
    for (let i = 0; i < 6; i++) {
      const c = `bv-${i}`;
      s.cores[c] = { id: c, owner: 'p1', isSoul: false, seat: 1 };
      z(s, 'p1', 1).reserve.push(c);
    }
    const cost = payableCost(s, db, 'p1', db.get(BRAVE));
    const pay = z(s, 'p1', 1).reserve.filter((c) => !s.cores[c]!.isSoul).slice(0, cost);
    s = act(s, { type: 'summon', player: 'p1', seat: 1, cardId: brave, payment: pay, placement: [], braveOnto: host.id });
    expect(s.cards[host.id]!.braves).toEqual([brave]);
    expect(s.cards[brave]!.seat).toBe(1);
    // แยกร่าง: เจ้าของเบรฟ (ที่นั่ง 1) ดึงกลับได้ · เจ้าของสปิริต (ที่นั่ง 0) สั่งแทนไม่ได้
    const sep = z(s, 'p1', 1).reserve.filter((c) => !s.cores[c]!.isSoul).slice(0, 1);
    expect(fails(s, { type: 'brave', player: 'p1', braveId: brave, hostId: null, placement: sep })).toBe('NOT_YOUR_CARD');
    const back = act(s, { type: 'brave', player: 'p1', seat: 1, braveId: brave, hostId: null, placement: sep });
    expect(back.players.p1.field).toContain(brave);
    expect(back.cards[host.id]!.braves).toEqual([]);
    expect(back.cards[brave]!.cores).toEqual(sep);
    // เจ้าของสปิริต (ที่นั่ง 0) ถอดคอร์สุดท้าย = สปิริตสูญสลาย → เจ้าของเบรฟ (ที่นั่ง 1) เลือก
    s = act(s, { type: 'moveCores', player: 'p1', moves: [{ coreId: hostCore, to: { area: 'reserve' } }] });
    expect(z(s, 'p1', 0).trashCards).toContain(host.id);
    expect(z(s, 'p1', 0).reserve).toContain(hostCore);
    expect(s.choice?.kind).toBe('option');
    s = act(s, { type: 'choose', player: 'p1', seat: 1, pick: 0 });
    expect(s.choice?.kind).toBe('placeCores');
    const place = z(s, 'p1', 1).reserve.filter((c) => !s.cores[c]!.isSoul).slice(0, 1);
    s = act(s, { type: 'choose', player: 'p1', seat: 1, pick: { pay: place } });
    expect(s.players.p1.field).toContain(brave);
    expect(s.cards[brave]!.cores).toEqual(place);
    expect(s.cores[place[0]!]!.seat).toBe(1);
  });

  it('เบิร์ส: ต่างคนต่างเซ็ทได้คนละ 1 ครั้งต่อเทิร์น', () => {
    const WALL = no('เบิร์สวอลล์');
    let s = setup();
    const b0 = z(s, 'p1', 0).hand[0]!;
    const b1 = z(s, 'p1', 1).hand[0]!;
    const b0b = z(s, 'p1', 0).hand[1]!;
    for (const id of [b0, b1, b0b]) s.cards[id]!.cardNo = WALL;
    s = act(s, { type: 'setBurst', player: 'p1', cardId: b0 });
    s = act(s, { type: 'setBurst', player: 'p1', seat: 1, cardId: b1 });
    expect(z(s, 'p1', 0).burst).toBe(b0);
    expect(z(s, 'p1', 1).burst).toBe(b1);
    expect(fails(s, { type: 'setBurst', player: 'p1', cardId: b0b })).toBe('BURST_ALREADY_SET');
  });

  it('Catalyze สั่งใช้เบิร์สของเพื่อนร่วมทีมได้ · มีทั้งสองใบ = เลือก', () => {
    const SOUL = no('โยไร สปาร์ค'); // [Soul Burst]
    let s = setup();
    const src = z(s, 'p1', 0).hand[0]!;
    const b1 = z(s, 'p1', 1).hand[0]!;
    s.cards[b1]!.cardNo = SOUL;
    s = act(s, { type: 'setBurst', player: 'p1', seat: 1, cardId: b1 });
    expect(conditionHolds(s, src, { catalyzable: 'any' })).toBe(false); // ยังไม่มีโซลคอร์บนการ์ดต้นเหตุ (ไม่ได้อยู่บนสนาม)
    // เราไม่มีเบิร์ส: Catalyze ใช้เบิร์สของเพื่อนทันที
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'catalyze' }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(z(s, 'p1', 1).burst).toBeNull();
    // ทั้งสองคนมีโซลเบิร์ส: ถามว่าจะใช้ของใคร
    let t = setup();
    const src2 = z(t, 'p1', 0).hand[0]!;
    const m0 = z(t, 'p1', 0).hand[1]!;
    const m1 = z(t, 'p1', 1).hand[0]!;
    t.cards[m0]!.cardNo = SOUL;
    t.cards[m1]!.cardNo = SOUL;
    t = act(t, { type: 'setBurst', player: 'p1', cardId: m0 });
    t = act(t, { type: 'setBurst', player: 'p1', seat: 1, cardId: m1 });
    t.queue = [{ controller: 'p1', sourceId: src2, steps: [{ do: 'catalyze' }], paidWithSoul: false, trashWhenDone: false }];
    t = act(t, { type: 'endMain', player: 'p1' });
    expect((t.choice as { options: string[] }).options).toEqual(['Catalyze: สั่งใช้เบิร์สของเรา', 'Catalyze: สั่งใช้เบิร์สของเพื่อนร่วมทีม']);
    t = act(t, { type: 'choose', player: 'p1', pick: 1 });
    expect(z(t, 'p1', 1).burst).toBeNull();
    expect(z(t, 'p1', 0).burst).toBe(m0);
  });

  it('ทิ้งเบิร์สคู่แข่ง 1 ใบ = ทั้งทีมคู่แข่งรวม 1 ใบ · มีทั้งสองใบ = เลือกว่าของใคร', () => {
    let s = setup();
    const src = z(s, 'p1', 0).hand[0]!;
    const b0 = z(s, 'p2', 0).hand.shift()!;
    const b1 = z(s, 'p2', 1).hand.shift()!;
    z(s, 'p2', 0).burst = b0;
    z(s, 'p2', 1).burst = b1;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'discardOpponentBurst' }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect((s.choice as { options: string[] }).options).toEqual(['ทิ้งเบิร์สของคู่แข่งคนที่ 1', 'ทิ้งเบิร์สของคู่แข่งคนที่ 2']);
    s = act(s, { type: 'choose', player: 'p1', pick: 1 });
    expect(z(s, 'p2', 0).burst).toBe(b0);
    expect(z(s, 'p2', 1).burst).toBeNull();
    expect(z(s, 'p2', 1).trashCards).toContain(b1);
    // เหลือใบเดียว: ทิ้งใบนั้นเลยไม่ถาม
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'discardOpponentBurst' }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1', seat: 1 });
    expect(z(s, 'p2', 0).burst).toBeNull();
    expect(z(s, 'p2', 0).trashCards).toContain(b0);
  });

  it('เงื่อนไข "มีเบิร์สของเราเซ็ทอยู่" นับเบิร์สของเพื่อนร่วมทีมด้วย (นัมบังมุฉะฮาคุไร)', () => {
    let s = setup();
    const mine = z(s, 'p1', 0).hand[0]!;
    const b1 = z(s, 'p1', 1).hand[0]!;
    s.cards[b1]!.cardNo = no('เบิร์สวอลล์');
    expect(conditionHolds(s, mine, { ownBurstSet: true })).toBe(false);
    s = act(s, { type: 'setBurst', player: 'p1', seat: 1, cardId: b1 });
    expect(conditionHolds(s, mine, { ownBurstSet: true })).toBe(true);
  });

  it('ทีมแพ้เมื่อไลฟ์เป็น 0 ทั้งคู่', () => {
    let s = setup();
    // ไลฟ์ของ p2 ที่นั่ง 1 เหลือ 1 · ที่นั่ง 0 เหลือ 2 → โดน 1: ยังไม่แพ้ · โดนอีก 1: แพ้
    z(s, 'p2', 0).life.splice(0, 3);
    z(s, 'p2', 1).life.splice(0, 4);
    const attack = (st: GameState, id: string) => {
      let x = act(st, { type: 'declareAttack', player: 'p1', seat: 1, attackerId: id });
      while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority, ...(x.battle.flash.seatsPassed?.includes(0) ? { seat: 1 as Seat } : {}) });
      return act(act(x, { type: 'noBlock', player: 'p2' }), { type: 'noBlock', player: 'p2', seat: 1 });
    };
    const a = summon(s, 1);
    s = a.s;
    const b = summon(s, 1);
    s = act(act(b.s, { type: 'endMain', player: 'p1' }), { type: 'endMain', player: 'p1', seat: 1 });
    s = attack(s, a.id);
    expect(z(s, 'p2', 1).life).toHaveLength(0);
    expect(z(s, 'p2', 0).life).toHaveLength(1);
    expect(s.winner).toBeNull();
    s = attack(s, b.id);
    expect(s.winner).toBe('p1');
  });
});
