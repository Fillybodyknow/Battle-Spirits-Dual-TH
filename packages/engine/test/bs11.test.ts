import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS11Cards } from '@bs/cards';
import {
  applyAction,
  baseCost,
  cardColors,
  cardLevel,
  extraSymbols,
  matchesFilter,
  createGame,
  currentBp,
  effectsNegated,
  payableCost,
  type Action,
  type GameState,
  type PlayerId,
} from '../src';
import { cardSymbolTotal, coreFloorOf } from '../src/rules';

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
  const id = `t11-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t11-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t11-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
  return id;
}
/** ย้ายโซลคอร์ในรีเสิร์ฟของผู้เล่นไปแทรช */
function soulToTrash(s: GameState, player: PlayerId): void {
  const p = s.players[player];
  const soul = p.reserve.find((c) => s.cores[c]!.isSoul)!;
  p.reserve = p.reserve.filter((c) => c !== soul);
  p.trashCores.push(soul);
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
const toP2Turn = (s: GameState) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'endAttackStep', player: 'p1' });
/** p1 ใช้เมจิค [Flash] (จ่ายด้วยคอร์ปกติ) */
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
const toP1Flash = (s: GameState) => {
  let x = s;
  while (x.battle?.flash && x.battle.flash.priority === 'p2') x = act(x, { type: 'passFlash', player: 'p2' });
  return x;
};

describe('Booster Set 11', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์ (ยกเว้นที่ยังไม่รองรับ)', () => {
    const skip: Record<string, number[]> = {};
    const cards = loadBS11Cards().all();
    expect(cards).toHaveLength(52);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => {
        if (skip[c.name]?.includes(i)) return;
        expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true);
      });
    }
  });

  it('หิมะน้ำแข็ง เซอร์เคิล: สปิริตที่ถูกระบุทำความเสียหายแก่ไลฟ์ไม่ได้ในเทิร์นนี้', () => {
    let s = setup();
    const foe = put(s, 'p2', DARIU, 1);
    s = useMagic(s, 'หิมะน้ำแข็ง เซอร์เคิล');
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(s.noLifeDamageCards).toEqual([{ cardId: foe, player: 'p1', turn: s.turn }]);
    // ผลในการโจมตี: ผู้โจมตีที่ถูกระบุไม่ทำความเสียหาย
    const atk = put(s, 'p1', DARIU, 1);
    s.noLifeDamageCards = [{ cardId: atk, player: 'p2', turn: s.turn }];
    const life = s.players.p2.life.length;
    s = passAll(attack(s, atk));
    s = passAll(act(s, { type: 'noBlock', player: 'p2' }));
    expect(s.players.p2.life.length).toBe(life);
  });

  it('เฟลมแดนซ์ (จ่ายด้วยคอร์ปกติ): ทำลายได้เฉพาะ BP ไม่เกิน 4000', () => {
    let s = setup();
    const small = put(s, 'p2', DARIU, 1); // 3000
    put(s, 'p2', DARIU, 3); // 4000? (Lv2)
    put(s, 'p2', DARIU, 5); // 6000
    s = useMagic(s, 'เฟลมแดนซ์');
    const cands = (s.choice as { candidates: string[] } | null)?.candidates ?? [];
    expect(cands).toContain(small);
    for (const id of cands) expect(currentBp(s, db, id)).toBeLessThanOrEqual(4000);
  });

  it('แรดบอร์ก: BP+2000 ต่อจำนวนสีเจ็มของเรา · สีถือว่าเป็นสีแดงด้วย', () => {
    const s = setup();
    const rhino = put(s, 'p1', no('แรดบอร์ก'), 1); // Lv1 2000 เจ็มขาว (ถือว่าแดงด้วย)
    expect(cardColors(s, db, rhino)).toEqual(expect.arrayContaining(['white', 'red']));
    expect(currentBp(s, db, rhino)).toBe(4000); // เจ็ม 1 เม็ด = 1 สี
    put(s, 'p1', no('เซ็นโงคุฮิเมะ ทามะกิ'), 1); // เจ็มเหลือง
    expect(currentBp(s, db, rhino)).toBe(6000);
  });

  it('เก็นตะ: BP+3000 ต่อสปิริต "เก็นจิ" ของเรา · ฮะจิริว: คอสต์ในมือ -1 ต่อตัว', () => {
    const s = setup();
    const genta = put(s, 'p1', no('แปดอัศวินเก็นจิ เก็นตะ'), 1); // Lv1 1000
    expect(currentBp(s, db, genta)).toBe(4000);
    put(s, 'p1', no('แปดอัศวินเก็นจิ เก็นตะ'), 1);
    expect(currentBp(s, db, genta)).toBe(7000);
    const hachi = card(s, 'p1', no('แปดอัศวินเก็นจิ ฮะจิริว'), 'hand');
    // คอสต์ 8 - 2 (เก็นจิ 2 ตัว) - ลดคอสต์ด้วยเจ็มขาว 2 = 4
    expect(baseCost(s, db, hachi)).toBe(6);
    expect(payableCost(s, db, 'p1', db.get(s.cards[hachi]!.cardNo), baseCost(s, db, hachi))).toBe(4);
  });

  it('ตราแห่งเพลิงรบ: การ์ด [ผู้เป็นนาย] ในมือคอสต์ -1 ต่อ [ข้ารับใช้] ของเรา', () => {
    const s = setup();
    put(s, 'p1', no('ตราแห่งเพลิงรบ'), 0);
    put(s, 'p1', no('เหล่าคนใกล้ชิด โฮมุระแมนดริล'), 1); // ข้ารับใช้ สีแดง
    const lord = card(s, 'p1', no('จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน'), 'hand'); // ผู้เป็นนาย คอสต์ 9
    const before = baseCost(s, db, lord);
    put(s, 'p1', no('นักบวชนักรบ สุโอว'), 1); // ข้ารับใช้อีกตัว (เจ็มแดงด้วย)
    const after = baseCost(s, db, lord);
    expect(after).toBe(before - 1);
  });

  it('ทามะกิ: คอร์บนสปิริตของเราต่ำกว่าเลเวลคอสต์ Lv1 โดยคู่แข่งไม่ได้', () => {
    const s = setup();
    put(s, 'p1', no('เซ็นโงคุฮิเมะ ทามะกิ'), 1);
    const ally = put(s, 'p1', DARIU, 3);
    expect(coreFloorOf(s, db, ally)?.min).toBe(1);
  });

  it('เมทัลดี้-บัค: เมื่ออัญเชิญ ส่งคอร์บนสปิริตของผู้เล่นทุกคนตัวละ 1 เม็ดลงแทรช', () => {
    let s = setup();
    const mine = put(s, 'p1', DARIU, 3);
    const foe = put(s, 'p2', DARIU, 2);
    const bug = card(s, 'p1', no('เมทัลดี้-บัค'), 'hand');
    s = summon(s, bug, 2);
    expect(s.cards[mine]!.cores).toHaveLength(2);
    expect(s.cards[foe]!.cores).toHaveLength(1);
    expect(s.cards[bug]!.cores).toHaveLength(1);
  });

  it('โกวจิน: Showdown ของเรา เราเป็นผู้เลือกระบุสปิริตของคู่แข่ง', () => {
    let s = setup();
    put(s, 'p2', no('ขุนศึกคลั่ง โกวจิน'), 2); // Lv2 BP 5000
    const weak = put(s, 'p1', DARIU, 1);
    put(s, 'p1', DARIU, 5);
    // ให้ p2 ถือเทิร์นก่อน แล้วกลับมาที่สตาร์ทสเต็ปของ p1 (คู่แข่งของ p2)
    s = toP2Turn(s);
    while (s.choice) s = choose(s, (s.choice as { candidates?: string[] }).candidates?.[0] ?? 0);
    s = act(act(s, { type: 'endMain', player: 'p2' }), { type: 'endAttackStep', player: 'p2' });
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p2' });
    const hand = s.players.p2.hand.length;
    s = choose(s, weak);
    expect(s.players.p1.trashCards).toContain(weak);
    expect(s.players.p2.hand.length).toBe(hand + 2);
  });

  it('อิตทัน โมเมน: ผู้โจมตี Lv ≥ ผู้ป้องกัน = ไม่เทียบ BP และถือว่าไม่ถูกป้องกัน', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 5); // Lv3 BP 6000
    const blk = put(s, 'p2', no('ไดดาระโบทชิ'), 1); // Lv1 BP 20000
    const life = s.players.p2.life.length;
    s = passAll(attack(s, atk));
    s = toP1Flash(act(s, { type: 'declareBlock', player: 'p2', blockerId: blk }));
    s = useMagic(s, 'อิตทัน โมเมน');
    s = passAll(s);
    expect(s.players.p1.field).toContain(atk);
    expect(s.players.p2.field).toContain(blk);
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('นปเปะระเกิร์ล: ในเทิร์นนี้สปิริต 1 ตัวสูญเสียเอฟเฟกต์ทั้งหมด', () => {
    let s = setup();
    const foe = put(s, 'p2', no('แรดบอร์ก'), 1);
    expect(currentBp(s, db, foe)).toBe(4000);
    s = useMagic(s, 'นปเปะระเกิร์ล');
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(effectsNegated(s, db, foe)).toBe(true);
    expect(currentBp(s, db, foe)).toBe(2000);
  });

  it('เดย์เบรค-เธิร์ด Lv2: คู่แข่งไม่มีเบิร์สเซ็ท = ไม่ถูกทำลาย', () => {
    // เฟลมเทมเพสจ่ายด้วยโซลคอร์: ทำลายสปิริต BP ไม่เกิน 7000 ทั้งหมด (เดย์เบรค Lv2 BP 6000)
    let s = setup();
    const day = put(s, 'p2', no('นักรบใต้หล้า เดย์เบรค-เธิร์ด'), 2);
    const other = put(s, 'p2', DARIU, 1);
    const m = card(s, 'p1', no('เฟลมเทมเพส'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
    const soul = s.players.p1.reserve.find((c) => s.cores[c]!.isSoul)!;
    s = act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: [soul, ...normalCores(s).slice(0, cost - 1)], timing: 'flash' });
    expect(s.players.p2.field).toContain(day);
    expect(s.players.p2.trashCards).toContain(other);
  });

  it('บุปผาร่ายรำดรอว์: ในแทรช + มีโซลคอร์ในแทรช → เอนด์สเต็ปของเรากลับขึ้นมือ', () => {
    let s = setup();
    const flower = card(s, 'p1', no('บุปผาร่ายรำดรอว์'), 'trashCards');
    soulToTrash(s, 'p1');
    s = toP2Turn(s);
    expect(s.players.p1.hand).toContain(flower);
  });

  it('ริวเซ็น: อัญเชิญ [ผู้เป็นนาย] จากมือได้สีละ 1 ใบ', () => {
    let s = setup();
    const red1 = card(s, 'p1', no('จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน'), 'hand');
    const red2 = card(s, 'p1', no('จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน'), 'hand');
    const white = card(s, 'p1', no('นักรบใต้หล้า เดย์เบรค-เธิร์ด'), 'hand');
    const ryu = card(s, 'p1', no('ผู้รับใช้ผู้ยิ่งใหญ่ ริวเซ็น'), 'hand');
    s.players.p1.reserve.push(...Array.from({ length: 10 }, (_, i) => {
      const id = `t11-extra-${i}`;
      s.cores[id] = { id, owner: 'p1', isSoul: false };
      return id;
    }));
    s = summon(s, ryu, 1);
    expect(s.choice).toMatchObject({ kind: 'multiSummon' });
    const res = normalCores(s);
    expect(fails(s, { type: 'choose', player: 'p1', pick: { summons: [{ cardId: red1, cores: [res[0]!] }, { cardId: red2, cores: [res[1]!] }] } })).toBe('INVALID_PICK');
    s = choose(s, { summons: [{ cardId: red1, cores: [res[0]!] }, { cardId: white, cores: [res[1]!] }] });
    expect(s.players.p1.field).toEqual(expect.arrayContaining([red1, white]));
  });

  it('คิระ & ซาระ: แสดง 5 ใบ นำ [เจ้าหญิงสงคราม]/[คนธรรพ์] ชื่อไม่ซ้ำกันขึ้นมือ ที่เหลือทิ้ง', () => {
    let s = setup();
    const tamaki = no('เซ็นโงคุฮิเมะ ทามะกิ');
    const kosho = no('เซ็นโงคุฮิเมะ โคโชว');
    const top = s.players.p1.deck.slice(0, 5);
    s.cards[top[0]!]!.cardNo = tamaki;
    s.cards[top[1]!]!.cardNo = tamaki;
    s.cards[top[2]!]!.cardNo = kosho;
    const kira = card(s, 'p1', no('เซ็นโงคุฮิเมะ คิระ & ซาระ'), 'hand');
    s = summon(s, kira, 1);
    s = choose(s, optionIndex(s, 'แสดง'));
    expect(s.players.p1.hand).toEqual(expect.arrayContaining([top[0], top[2]]));
    expect(s.players.p1.hand).not.toContain(top[1]);
    expect(s.players.p1.trashCards).toEqual(expect.arrayContaining([top[1], top[3], top[4]]));
  });

  it('ยาเท็นโดว: แอทแท็คสเต็ป สีของการ์ดบนสนามทั้งหมดกลายเป็นสีขาว', () => {
    let s = setup();
    const yaten = put(s, 'p1', no('นักบวชเครื่องกล ยาเท็นโดว'), 1);
    const foe = put(s, 'p2', DARIU, 1);
    expect(cardColors(s, db, foe)).toEqual(['red']);
    s = attack(s, yaten);
    expect(cardColors(s, db, foe)).toEqual(['white']);
  });

  it('อายาเมะ: เมื่ออัญเชิญ นำสปิริตคู่แข่งกลับขึ้นมือต่อ [เจ้าหญิงสงคราม] แล้วนำเมจิคในแทรชขึ้นมือต่อตัวที่กลับ', () => {
    let s = setup();
    put(s, 'p1', no('เซ็นโงคุฮิเมะ ทามะกิ'), 1);
    const f1 = put(s, 'p2', DARIU, 1);
    const f2 = put(s, 'p2', DARIU, 1);
    const m1 = card(s, 'p1', no('เฟลมแดนซ์'), 'trashCards');
    const m2 = card(s, 'p1', no('เฟลมเทมเพส'), 'trashCards');
    const aya = card(s, 'p1', no('เซ็นโงคุฮิเมะ อายาเมะ'), 'hand');
    s = summon(s, aya, 1);
    // อายาเมะ + ทามะกิ = 2 ตัว → กลับขึ้นมือ 2 ตัว (เลือกทีเดียว)
    if (s.choice?.kind === 'multiCard') s = choose(s, { cards: [f1, f2] });
    expect(s.players.p2.hand).toEqual(expect.arrayContaining([f1, f2]));
    if (s.choice?.kind === 'multiCard') s = choose(s, { cards: [m1, m2] });
    while (s.choice?.kind === 'card') s = choose(s, (s.choice as { candidates: string[] }).candidates[0]!);
    expect(s.players.p1.hand).toEqual(expect.arrayContaining([m1, m2]));
  });

  /** ตอบทุกตัวเลือกที่ค้าง: ตัวเลือกที่มีข้อความ prefer ก่อน / วางคอร์ 1 เม็ด / การ์ดใบแรก */
  const resolve = (s0: GameState, prefer: string[] = []): GameState => {
    let s = s0;
    for (let i = 0; i < 20 && s.choice; i++) {
      const c = s.choice as { kind: string; options?: string[]; candidates?: string[] };
      if (c.kind === 'option') {
        const k = c.options!.findIndex((o) => prefer.some((p) => o.includes(p)));
        s = choose(s, k >= 0 ? k : c.options!.length - 1);
      } else if (c.kind === 'placeCores') s = choose(s, { pay: normalCores(s, s.choice!.player).slice(0, 1) });
      else if (c.kind === 'card' || c.kind === 'multiCard') s = choose(s, c.kind === 'card' ? c.candidates![0]! : { cards: c.candidates!.slice(0, (s.choice as { count: number }).count) });
      else break;
    }
    return s;
  };

  it('Catalyze (ชุยอุน → โซลเบิร์สสีขาว): ชุยฮะนำโซลคอร์ในแทรชมาวาง · บอนโนจิเด้งสปิริตคู่แข่ง 2 ตัว (เบิร์สสีขาว)', () => {
    let s = setup();
    const chuiha = put(s, 'p1', no('มังกรธนูหน้าไม้ ชุยฮะ'), 1);
    put(s, 'p1', no('บอนโนจิเทมเพิลที่ลุกไหม้'), 0);
    const chuiun = put(s, 'p1', no('นักรบเครื่องกล ชุยอุน'), 3, true); // Lv2 มีโซลคอร์
    const burst = card(s, 'p1', no('นักรบใต้หล้า เดย์เบรค-เธิร์ด'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const f1 = put(s, 'p2', DARIU, 1);
    const f2 = put(s, 'p2', DARIU, 1);
    s = attack(s, chuiun);
    s = choose(s, optionIndex(s, 'Catalyze'));
    s = resolve(s, ['Soul Core ในแทรช']);
    expect(s.cards[chuiha]!.cores.some((c) => s.cores[c]!.isSoul)).toBe(true);
    expect(s.players.p1.field).toContain(burst);
    expect(s.players.p2.hand).toEqual(expect.arrayContaining([f1, f2]));
  });

  it('ดอน นุระริเฮียน (ในมือ): สปิริตของเราถูกอัญเชิญโดยเอฟเฟกต์ → อัญเชิญการ์ดนี้ไม่จ่ายคอสต์ได้', () => {
    let s = setup();
    const don = card(s, 'p1', no('ดอน นุระริเฮียน'), 'hand');
    const gyuki = card(s, 'p1', no('กิวคิ'), 'trashCards');
    soulToTrash(s, 'p1');
    s = useMagic(s, 'ขบวนร้อยอสูรท่องราตรี');
    // เลือกอัญเชิญกิวคิจากแทรช (ไม่เลือกดอน) แล้ววางคอร์ · ไม่อัญเชิญเพิ่ม
    expect(s.choice).toMatchObject({ kind: 'card' });
    s = choose(s, gyuki);
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    if (s.choice?.kind === 'card' && (s.choice as { optional?: boolean }).optional) s = choose(s, null);
    expect(s.players.p1.field).toContain(gyuki);
    s = resolve(s, ['อัญเชิญการ์ดนี้']);
    expect(s.players.p1.field).toContain(don);
  });

  it('ฮะจิริว Lv2 (มีโซลคอร์): สปิริต "เก็นจิ" ของเรามี Lv / BP / เจ็ม เหมือนฮะจิริว', () => {
    const s = setup();
    const genta = put(s, 'p1', no('แปดอัศวินเก็นจิ เก็นตะ'), 1); // Lv1 BP 1000 เจ็มขาว 1
    expect(cardLevel(s, db, genta)).toBe(1);
    put(s, 'p1', no('แปดอัศวินเก็นจิ ฮะจิริว'), 3, true); // Lv2 BP 16000 เจ็มขาว 2
    expect(cardLevel(s, db, genta)).toBe(2);
    // BP 16000 + เก็นตะ: +3000 ต่อสปิริตเก็นจิ 2 ตัว
    expect(currentBp(s, db, genta)).toBe(22000);
    expect(extraSymbols(s, db, genta).white).toBe(1); // เจ็มขาว 1 + 1 = 2
  });

  it('ฮะจิริวมีเบรฟร่วมร่าง: เจ็มของเบรฟนับในเจ็มที่เก็นจิตัวอื่นก๊อปปี้ (ขาว 2 + แดง 1 = 3 เจ็ม)', () => {
    const s = setup();
    const genta = put(s, 'p1', no('แปดอัศวินเก็นจิ เก็นตะ'), 1); // เจ็มขาว 1
    const hachi = put(s, 'p1', no('แปดอัศวินเก็นจิ ฮะจิริว'), 3, true); // Lv2 เจ็มขาว 2
    const brave = `t11-brave-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: no('ดาบมังกรเกราะ โกวเท็น'), owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] }; // เจ็มแดง 1
    s.cards[hachi]!.braves.push(brave);
    expect(cardSymbolTotal(s, db, hachi)).toBe(3);
    expect(cardSymbolTotal(s, db, genta)).toBe(3);
    expect(extraSymbols(s, db, genta)).toMatchObject({ white: 1, red: 1 });
  });

  it('กู๊ดลัคฮิล Lv2: สปิริตคู่แข่งที่กลับขึ้นมือโดยเอฟเฟกต์ของเรา → ส่งโซลคอร์ลงแทรช ไปใต้สุดเด็คแทน', () => {
    let s = setup();
    put(s, 'p1', no('No.40 กู๊ดลัคฮิล'), 3); // Lv2
    const atk = put(s, 'p1', DARIU, 5);
    const blk = put(s, 'p2', DARIU, 1);
    const target = put(s, 'p2', DARIU, 1);
    s = passAll(attack(s, atk));
    s = toP1Flash(act(s, { type: 'declareBlock', player: 'p2', blockerId: blk }));
    s = useMagic(s, 'สุดยอดกระบวนค่ายไร้เทียมทานแห่งแปดเก็นจิ');
    if (s.choice?.kind === 'card') s = choose(s, target);
    s = choose(s, optionIndex(s, 'ใต้สุดเด็ค'));
    expect(s.players.p2.hand).not.toContain(target);
    expect(s.players.p2.deck.at(-1)).toBe(target);
    expect(s.players.p1.trashCores.some((c) => s.cores[c]!.isSoul)).toBe(true);
  });

  it('ลองฟิลด์ Lv2: ส่งโซลคอร์เมื่อเริ่มแอทแท็คสเต็ป → "โซลดราก้อน" ใช้เอฟเฟกต์ส่งโซลคอร์ได้โดยไม่ต้องมีโซลคอร์', () => {
    let s = setup();
    put(s, 'p1', no('No.20 ลองฟิลด์'), 2); // Lv2
    const burning = put(s, 'p1', no('จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน'), 3); // Lv2 ไม่มีโซลคอร์
    const foe = put(s, 'p2', DARIU, 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = choose(s, optionIndex(s, 'โซลดราก้อน'));
    expect(s.players.p1.trashCores.some((c) => s.cores[c]!.isSoul)).toBe(true);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: burning });
    s = choose(s, optionIndex(s, 'ส่ง Soul Core'));
    // True-Consecutive Blade: เลือกระบุสปิริตคู่แข่ง (แบบตีระบุ) ได้ไม่เกิน 2 ตัว
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    s = choose(s, foe);
    expect(s.battle?.chosenBlockers).toContain(foe);
    expect(s.battle?.direct).toBe(true);
    expect(s.cards[burning]!.cores).toHaveLength(3);
  });

  it('เบิร์นนิ่ง-โซลดราก้อน True-Consecutive Blade: เลือกระบุ 2 ตัวต่อสู้พร้อมกัน ถูกทำลายตัวละ 1 = ไลฟ์คู่แข่ง 1 เม็ด', () => {
    let s = setup();
    const burning = put(s, 'p1', no('จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน'), 5, true); // Lv3 BP 22000
    const f1 = put(s, 'p2', DARIU, 1, false, 'exhausted');
    const f2 = put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    s = attack(s, burning);
    s = choose(s, optionIndex(s, 'ส่ง Soul Core'));
    s = choose(s, f1);
    s = choose(s, f2);
    s = passAll(s);
    expect(s.players.p2.trashCards).toEqual(expect.arrayContaining([f1, f2]));
    expect(s.players.p2.life.length).toBe(life - 2);
  });

  it('โททอลซอง: สปิริตสีเหลืองของเราสูญสลายโดยคู่แข่ง (แอทแท็คสเต็ป) → จั่ว 1 ใบ', () => {
    let s = setup();
    put(s, 'p2', no('No.30 โททอลซองเมาท์เท่น'), 0);
    const tama = put(s, 'p2', no('กิวคิ'), 1); // สีเหลือง (ทามะกิกันคอร์ต่ำกว่า Lv1 เอง จึงไม่ใช้)
    const atk = put(s, 'p1', DARIU, 1);
    s = attack(s, atk);
    while (s.battle?.flash?.priority === 'p2') s = act(s, { type: 'passFlash', player: 'p2' });
    const hand = s.players.p2.hand.length;
    // เมจิคของ p1 ที่ถอดคอร์สปิริตคู่แข่ง → ทามะกิ (คอร์ 1 เม็ด) สูญสลาย
    const remover = db.all().find((c) => c.type === 'magic' && c.abilities.some((a) => a.kind === 'magic' && a.timing === 'flash' && a.steps.some((st) => st.do === 'removeOpponentCores' && !st.if)))!;
    s = useMagic(s, remover.name);
    for (let i = 0; i < 5 && s.choice; i++) {
      const c = s.choice as { kind: string; candidates?: string[]; total?: number };
      if (c.kind === 'card') s = choose(s, c.candidates!.includes(tama) ? tama : c.candidates![0]!);
      else if (c.kind === 'distribute') s = choose(s, { alloc: { [tama]: c.total ?? 1 } });
      else break;
    }
    expect(s.players.p2.trashCards).toContain(tama);
    expect(s.players.p2.hand.length).toBe(hand + 1);
  });

  it('โอนิมารุ-ชินอุจิ (Catalyze): ทำลายสปิริตที่ได้รับ Ultra Shield จากการ์ดอื่นด้วย', () => {
    const s = setup();
    put(s, 'p2', no('นินจาเครื่องกล ชิโอมาเนกิ'), 2); // Lv2: สปิริตสีเขียวได้รับ Ultra Shield แดง/ม่วง
    const green = db.all().find((c) => c.type === 'spirit' && c.colors.length === 1 && c.colors[0] === 'green' && !c.abilities.some((a) => a.kind === 'effectImmune'))!;
    const shu = put(s, 'p2', green.cardNo, 1);
    const own = put(s, 'p2', no('นักรบเครื่องกล ชุยอุน'), 1); // Ultra Shield ของตัวเอง
    expect(matchesFilter(s, db, own, { hasUltraShield: true })).toBe(true);
    const plain = put(s, 'p2', DARIU, 1);
    expect(matchesFilter(s, db, shu, { hasUltraShield: true })).toBe(true);
    expect(matchesFilter(s, db, plain, { hasUltraShield: true })).toBe(false);
  });

  it('บุปผาร่ายรำดรอว์: กลายเป็น BP0 → ทำลายและจั่ว 1 ใบ · ทำลายไม่ได้ (เดย์เบรค-เธิร์ด) ก็ยังจั่ว', () => {
    let s = setup();
    const weak = put(s, 'p2', DARIU, 1); // BP 3000
    let hand = s.players.p1.hand.length;
    s = useMagic(s, 'บุปผาร่ายรำดรอว์');
    if (s.choice?.kind === 'card') s = choose(s, weak);
    expect(s.players.p2.trashCards).toContain(weak);
    expect(s.players.p1.hand.length).toBe(hand + 1);
    // ไม่ถูกทำลาย (คู่แข่งไม่มีเบิร์สเซ็ท) แต่ BP เป็น 0 = ยังจั่ว
    const day = put(s, 'p2', no('นักรบใต้หล้า เดย์เบรค-เธิร์ด'), 2);
    s.cards[day]!.turnBp = -3000; // BP 6000 → 3000 ก่อนใช้เมจิค
    hand = s.players.p1.hand.length;
    s = useMagic(s, 'บุปผาร่ายรำดรอว์');
    if (s.choice?.kind === 'card') s = choose(s, day);
    expect(s.players.p2.field).toContain(day);
    expect(s.players.p1.hand.length).toBe(hand + 1);
  });

  it('สุโอว: Catalyze เบิร์สที่ชื่อมี "โซลดราก้อน" ไลฟ์ถือว่าเป็น 3 (เบิร์นนิ่ง-โซลดราก้อน อัญเชิญได้)', () => {
    let s = setup();
    const suou = put(s, 'p1', no('นักบวชนักรบ สุโอว'), 1, true);
    const burning = card(s, 'p1', no('จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burning);
    s.players.p1.burst = burning;
    expect(s.players.p1.life.length).toBeGreaterThan(3);
    s = attack(s, suou);
    s = choose(s, optionIndex(s, 'Catalyze'));
    // วางคอร์จากรีเสิร์ฟแล้วอัญเชิญ
    for (let i = 0; i < 5 && s.choice && s.choice.kind !== 'placeCores'; i++) s = choose(s, 0);
    expect(s.choice).toMatchObject({ kind: 'placeCores' });
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.players.p1.field).toContain(burning);
  });
});
