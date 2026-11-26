import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBSC02Cards, type Step } from '@bs/cards';
import { applyAction, blockersFor, createGame, currentBp, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `tc2-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `tc2-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `tc2-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
  return id;
}
function brave(s: GameState, host: string, cardNo: string): string {
  const id = `tc2-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: s.cards[host]!.owner, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
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
const optionIndex = (s: GameState, text: string) => (s.choice?.kind === 'option' ? s.choice.options.findIndex((o) => o.includes(text)) : -1);
const queue = (s: GameState, controller: PlayerId, sourceId: string, steps: Step[]) => {
  s.queue = [...s.queue, { controller, sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
};

describe('BSC02 (BSC16)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBSC02Cards().all();
    expect(cards).toHaveLength(42);
    for (const c of cards) {
      expect(c.set).toBe('BSC02');
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('ดีว่าสเตจ Lv2: สตาร์ทสเต็ป มีสปิริตเผ่า [สเตจสไตล์] ชื่อต่างกัน 10 ตัว = ชนะเกม (ชื่อซ้ำไม่นับ)', () => {
    const stage = db.all().filter((c) => c.type === 'spirit' && c.family.includes('สเตจสไตล์'));
    const names = [...new Map(stage.map((c) => [c.name, c.cardNo])).values()];
    expect(names.length).toBeGreaterThanOrEqual(10);
    // ชื่อต่างกัน 9 ตัว + ชื่อซ้ำ 1 ตัว = ยังไม่ชนะ
    let s = setup();
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.phase === 'attack') s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.turnPlayer).toBe('p2');
    // เทิร์นถัดไปของ p1: วางเน็กซัส Lv2 + สปิริต
    const setTurn = (k: number) => {
      const t = setup();
      put(t, 'p1', no('ดีว่าสเตจ'), 1);
      for (let i = 0; i < k; i++) put(t, 'p1', names[i]!, 1);
      put(t, 'p1', names[0]!, 1);
      // จบเทิร์น p1 → เทิร์น p2 → จบ → p1 สตาร์ทสเต็ป
      let x = act(t, { type: 'endMain', player: 'p1' });
      if (x.phase === 'attack') x = act(x, { type: 'endAttackStep', player: 'p1' });
      x = act(x, { type: 'endMain', player: 'p2' });
      if (x.phase === 'attack' && x.turnPlayer === 'p2') x = act(x, { type: 'endAttackStep', player: 'p2' });
      return x;
    };
    expect(setTurn(9).winner ?? null).toBeNull();
    const win = setTurn(10);
    expect(win.winner).toBe('p1');
    expect(win.endReason).toBe('effectWin');
  });

  it('ชุดตุ๊กตาเพนต้น: ผู้ร่วมร่างเป็นทีม ไชนี่ฮาร์ท และ แอปโซลูท ด้วย · ราเควล Lv2 ให้ BP+3000', () => {
    const s = setup();
    const host = put(s, 'p1', DARIU, 1);
    brave(s, host, no('ชุดตุ๊กตาเพนต้น'));
    put(s, 'p1', no('ราเควลผู้รักเพนต้น'), 2);
    // ริวเนะ-มาโตะ Lv2: แอทแท็คสเต็ปของเรา สปิริตทีม แอปโซลูท ทั้งหมด BP+2000
    put(s, 'p1', no('ริวเนะ-มาโตะ'), 2);
    s.phase = 'attack';
    const base = 3000 + 5000; // BP ดาริว + ชุดตุ๊กตาเพนต้น
    expect(currentBp(s, db, host)).toBe(base + 3000 + 2000);
  });

  it('นักร้อง คัทลียา: ระบุสปิริตคู่แข่ง → "แอทแท็คสเต็ปของคู่แข่ง: ป้องกันได้แม้เสื่อมสภาพ" ไม่ทำงานในเทิร์นนี้', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const saya = put(s, 'p2', no('[หญิงสาวสีขาวบริสุทธิ์] ซายะ-ไชน์'), 2);
    put(s, 'p2', no('รัน-เบลเซีย'), 1);
    put(s, 'p2', no('ราบี้-ดาริน'), 1);
    s.cards[saya]!.state = 'exhausted';
    const before = act(s, { type: 'endMain', player: 'p1' });
    expect(before.phase).toBe('attack');
    expect(blockersFor(before, db, 'p2')).toContain(saya);
    queue(s, 'p1', src, [{ do: 'timingLockChosen' }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, saya);
    expect(s.phase).toBe('attack');
    expect(blockersFor(s, db, 'p2')).not.toContain(saya);
  });

  it('นักร้อง ทริคสเตอร์: วางแสดงการ์ดดีว่าในมือกี่ใบก็ได้ จั่วต่อใบ', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const a = card(s, 'p1', no('รัน-เบลเซีย'), 'hand');
    const b = card(s, 'p1', no('ราบี้-ดาริน'), 'hand');
    const hand = s.players.p1.hand.length;
    queue(s, 'p1', src, [{ do: 'showFromHandAny', filter: { types: ['spirit'], family: 'ดีว่า' }, then: [{ do: 'draw', count: 1, per: { shownByThis: true } }] }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind).toBe('multiCard');
    s = choose(s, { cards: [a, b] });
    expect(s.shownCards).toEqual(expect.arrayContaining([a, b]));
    expect(s.players.p1.hand.length).toBe(hand + 2);
  });

  it('ฮาร์ดบีท: สปิริตดีว่ากลับใต้สุดเด็ค → เปิดเท่าจำนวน อัญเชิญดีว่าไม่จ่ายคอสต์ ที่เหลือทิ้ง', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const diva = put(s, 'p1', no('รัน-เบลเซีย'), 1);
    const top = card(s, 'p1', no('ราบี้-ดาริน'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((x) => x !== top);
    s.players.p1.deck.unshift(top);
    queue(s, 'p1', src, [{ do: 'alliesToBottomReveal', filter: { types: ['spirit', 'brave'], family: 'ดีว่า' }, summon: { types: ['spirit'], family: 'ดีว่า' } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = choose(s, { cards: [diva] });
    expect(s.players.p1.deck.at(-1)).toBe(diva);
    expect(s.choice?.kind).toBe('multiSummon');
    s = choose(s, { summons: [{ cardId: top, cores: [s.players.p1.reserve[0]!] }] });
    expect(s.players.p1.field).toContain(top);
  });

  it('นักร้อง เอ็นจู: เปิดใบบนสุด เป็นดีว่า = วางแสดงนอกมือ', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const top = card(s, 'p1', no('รัน-เบลเซีย'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((x) => x !== top);
    s.players.p1.deck.unshift(top);
    queue(s, 'p1', src, [{ do: 'revealTopToShown', filter: { types: ['spirit'], family: 'ดีว่า' } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.hand).toContain(top);
    expect(s.shownCards).toContain(top);
  });

  it('นักร้อง เวียร์จ Lv2: สปิริตดีว่าถูกทำลายโดยคู่แข่ง → เลือกกลับขึ้นมือได้', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    put(s, 'p2', no('นักร้อง เวียร์จ'), 3);
    const ran = put(s, 'p2', no('รัน-เบลเซีย'), 1);
    queue(s, 'p1', src, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit', 'brave'], family: 'ไพรเวทแวร์' } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, ran);
    expect(s.choice?.player).toBe('p2');
    s = choose(s, optionIndex(s, 'กลับขึ้นมือ'));
    expect(s.players.p2.hand).toContain(ran);
  });

  it('มิเรีย Lv3: ตอนป้องกัน คู่แข่งเลือกเองว่าจะส่งคอร์จากการ์ดใบไหน / รีเสิร์ฟ', () => {
    for (const fromReserve of [false, true]) {
      let s = setup();
      const miria = put(s, 'p1', no('[สามผู้ยิ่งใหญ่แห่งไอดอล] มิเรีย-ซันเดย์'), 4);
      const blocker = put(s, 'p2', DARIU, 2);
      const reserve = s.players.p2.reserve.length;
      s = act(s, { type: 'endMain', player: 'p1' });
      s = act(s, { type: 'declareAttack', player: 'p1', attackerId: miria });
      for (let i = 0; i < 10 && s.battle?.flash; i++) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
      s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
      expect(s.choice?.kind === 'card' && s.choice.player === 'p2').toBe(true);
      s = choose(s, fromReserve ? null : blocker);
      if (fromReserve) {
        expect(s.players.p2.reserve.length).toBe(reserve - 1);
        expect(s.cards[blocker]!.cores).toHaveLength(2);
      } else {
        expect(s.cards[blocker]!.cores).toHaveLength(1);
        expect(s.players.p2.reserve.length).toBe(reserve);
      }
      expect(s.players.p2.trashCores.length).toBe(1);
    }
  });

  it('มิเรีย Lv3: ป้องกันต้องส่งคอร์บนฟิลด์ 1 เม็ดไปแทรช', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const blocker = put(s, 'p2', DARIU, 1);
    s.players.p2.reserve = [];
    s.phase = 'attack';
    s.battle = { attackerId: src, blockers: [], maxBlockers: 1, step: 'declareBlock', blockTax: { reserveToTrash: 0, fieldToTrash: 1 } } as unknown as GameState['battle'];
    // คอร์บนฟิลด์ = คอร์บนผู้ป้องกัน 1 เม็ด → ป้องกันได้
    expect(blockersFor(s, db, 'p2')).toContain(blocker);
    s.cards[blocker]!.cores = [];
    expect(blockersFor(s, db, 'p2')).not.toContain(blocker);
  });
});

describe('BS07 [เจ้าหญิงทองคำ] โรส-เบอร์รี่: ไม่แสดงผลซ้ำซ้อน', () => {
  /** อัญเชิญการ์ดในมือไม่จ่ายคอสต์ด้วยเอฟเฟกต์ (เลือกการ์ด + วางคอร์ 1 เม็ด) แล้วเดินคิวจนจบ */
  const summonFree = (s: GameState, src: string, id: string) => {
    queue(s, 'p1', src, [{ do: 'summonFromHandFree', filter: { names: [db.get(s.cards[id]!.cardNo).name] } }]);
    let x = act(s, { type: 'moveCores', player: 'p1', moves: [] });
    for (let i = 0; i < 10 && x.choice; i++) {
      const c = x.choice;
      if (c.kind === 'card') x = choose(x, id);
      else if (c.kind === 'placeCores') x = choose(x, { pay: x.players.p1.reserve.slice(0, 1) } as never);
      else if (c.kind === 'option') x = choose(x, 0);
      else break;
    }
    return x;
  };

  it('อัญเชิญสเตจสไตล์คอสต์ 8+ สองครั้งในเทิร์นเดียว = ได้คอร์วอยด์ 3 เม็ดทั้งสองครั้ง · มี 2 ใบ = ใบเดียวต่อครั้ง', () => {
    let s = setup();
    const src = put(s, 'p1', DARIU, 1);
    const rose1 = put(s, 'p1', no('[เจ้าหญิงทองคำ] โรส-เบอร์รี่'), 1);
    const rose2 = put(s, 'p1', no('[เจ้าหญิงทองคำ] โรส-เบอร์รี่'), 1);
    const a = card(s, 'p1', no('[ปีกสีขาว] ออลทีน่า-แคลน'), 'hand');
    const b = card(s, 'p1', no('[มิโกะแห่งเสียงเพลง] ริวเนะ-มาโตะ'), 'hand');
    const total = () => s.cards[rose1]!.cores.length + s.cards[rose2]!.cores.length;
    s = summonFree(s, src, a);
    expect(s.players.p1.field).toContain(a);
    expect(total()).toBe(2 + 3);
    s = summonFree(s, src, b);
    expect(s.players.p1.field).toContain(b);
    expect(total()).toBe(2 + 6);
  });
});
