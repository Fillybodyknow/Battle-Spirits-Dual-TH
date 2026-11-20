import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS10Cards } from '@bs/cards';
import { applyAction, braveFits, cardLevel, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `t10-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t10-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t10-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player][zone].push(id);
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
const optionIndex = (s: GameState, text: string) => (s.choice as { options: string[] }).options.findIndex((o) => o.includes(text));
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
/** p1 ใช้เมจิค [Flash] ในเมนสเต็ป (จ่ายด้วยคอร์ปกติ) */
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

/** การต่อสู้ที่ p2 ป้องกันแล้ว: ให้ p2 ผ่านแฟลชจนถึงตา p1 */
const toP1Flash = (s: GameState) => {
  let x = s;
  while (x.battle?.flash && x.battle.flash.priority === 'p2') x = act(x, { type: 'passFlash', player: 'p2' });
  return x;
};

describe('Booster Set 10', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์ (ยกเว้นที่ยังไม่รองรับ)', () => {
    const skip: Record<string, number[]> = {
    };
    const cards = loadBS10Cards().all();
    expect(cards).toHaveLength(60);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => {
        if (skip[c.name]?.includes(i)) return;
        expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true);
      });
    }
  });

  it('เจเนอรัล เซโตะไดโช (ใช้เป็นเมจิค): ในการต่อสู้นี้เทียบ Lv แทน BP', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 5); // Lv3 BP 6000
    const blk = put(s, 'p2', no('ข้ารับใช้ผู้ภักดี ฮิกุมารุ'), 1); // Lv1 BP 9000
    s = passAll(attack(s, atk));
    s = toP1Flash(act(s, { type: 'declareBlock', player: 'p2', blockerId: blk }));
    s = useMagic(s, 'เจเนอรัล เซโตะไดโช');
    s = passAll(s);
    expect(s.players.p2.trashCards).toContain(blk);
    expect(s.players.p1.field).toContain(atk);
  });

  it('ทันโปโปะ: แอทแท็คสเต็ป เบิร์สของเราถูกทิ้งไม่ได้ (อิกคาคุ Lv2)', () => {
    let s = setup();
    put(s, 'p2', no('เซ็นโงคุฮิเมะ ทันโปโปะ'), 1);
    const burst = card(s, 'p2', DARIU, 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== burst);
    s.players.p2.burst = burst;
    const ikkaku = put(s, 'p1', no('ขุนศึกมังกรทะเล อิกคาคุ'), 3);
    s = attack(s, ikkaku);
    expect(s.players.p2.burst).toBe(burst);
  });

  it('สวนลอยฟ้าของเหล่าเจ้าหญิง: เมื่อวาง → ในเทิร์นนี้สปิริตคู่แข่งถือว่าเป็น Lv1', () => {
    let s = setup();
    const foe = put(s, 'p2', DARIU, 5);
    expect(cardLevel(s, db, foe)).toBe(3);
    const nx = card(s, 'p1', no('สวนลอยฟ้าของเหล่าเจ้าหญิง'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[nx]!.cardNo));
    s = act(s, { type: 'deployNexus', player: 'p1', cardId: nx, payment: normalCores(s).slice(0, cost), placement: [] });
    expect(cardLevel(s, db, foe)).toBe(1);
    expect(currentBp(s, db, foe)).toBe(3000);
  });

  it('ผ่าวิบัติไร้ผนึก: ในเทิร์นนี้ต้องส่งคอร์ 1 เม็ดของตัวที่โจมตีไปวอยด์', () => {
    let s = setup();
    s.coreTaxTurn = [{ player: 'p1', turn: s.turn }];
    const atk = put(s, 'p1', DARIU, 3);
    s = attack(s, atk);
    expect(s.cards[atk]!.cores).toHaveLength(2);
    expect(s.battle?.attackerId).toBe(atk);
  });

  it('บลานโบอา: ตัวที่ต่อสู้ด้วยถูกทำลาย → ฟื้นสภาพ', () => {
    let s = setup();
    const boa = put(s, 'p1', no('สมิงพุ่งชน บลานโบอา'), 1); // BP 5000
    const blk = put(s, 'p2', DARIU, 1);
    s = passAll(attack(s, boa));
    s = passAll(act(s, { type: 'declareBlock', player: 'p2', blockerId: blk }));
    expect(s.players.p2.trashCards).toContain(blk);
    expect(s.cards[boa]!.state).toBe('refresh');
  });

  it('ไยบะโนะคามิ: คู่แข่งเลือกเสื่อมสภาพตัวเอง BP ไม่เกินผู้โจมตี → ส่งไลฟ์คู่แข่ง 1 เม็ด', () => {
    let s = setup();
    const yaiba = put(s, 'p1', no('สมิงไดเมียว ไยบะโนะคามิ'), 1); // ผู้เป็นนาย BP 6000
    const foe = put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    s = attack(s, yaiba);
    if (s.choice?.kind === 'card' && s.choice.player === 'p2') s = choose(s, foe);
    expect(s.cards[foe]!.state).toBe('exhausted');
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('นาเดชิโกะ (มีโซลคอร์): สปิริตเผ่า [เจ้าหญิงสงคราม] ถูกทำลายโดยเอฟเฟกต์คู่แข่ง → กลับขึ้นมือ', () => {
    let s = setup();
    const nade = put(s, 'p2', no('เซ็นโงคุฮิเมะ นาเดชิโกะ'), 2, true);
    const tan = put(s, 'p2', no('เซ็นโงคุฮิเมะ ทันโปโปะ'), 1);
    s = useMagic(s, 'เฟลมมังกรคลั่ง');
    if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, tan);
    expect(s.players.p2.hand).toContain(tan);
    expect(s.players.p2.field).toContain(nade);
  });

  it('ชาโดว์อีลิกเซอร์: โซลคอร์ไม่ถูกนำไปวางที่ไลฟ์ (กติกา 07 ข้อ 5)', () => {
    let s = setup();
    const p = s.players.p1;
    const life = p.life.length;
    const m = card(s, 'p1', no('ชาโดว์อีลิกเซอร์'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
    // จ่ายด้วยคอร์ปกติทั้งหมดในรีเสิร์ฟ ให้เหลือแต่โซลคอร์ (คอร์ที่เกินย้ายไปแทรช)
    const normals = normalCores(s);
    p.trashCores.push(...normals.slice(cost));
    p.reserve = p.reserve.filter((id) => !normals.slice(cost).includes(id));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normals.slice(0, cost), timing: 'flash' });
    expect(s.players.p1.life.length).toBe(life);
    expect(s.players.p1.reserve.some((id) => s.cores[id]!.isSoul)).toBe(true);
  });

  it('เทนเซย์ Soul Drive (มีสปิริตหลายตัว): แบ่งคอร์วอยด์ทีเดียว', () => {
    let s = setup();
    const tensei = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ เทนเซย์'), 2, true);
    const ally = put(s, 'p1', DARIU, 1);
    s = attack(s, tensei);
    s = choose(s, optionIndex(s, 'Soul Drive'));
    expect(s.choice).toMatchObject({ kind: 'distribute', player: 'p1', to: 'place' });
    const total = (s.choice as { total: number }).total;
    s = choose(s, { alloc: { [ally]: 2, [tensei]: total - 2 } });
    expect(s.cards[ally]!.cores).toHaveLength(3);
    expect(s.cards[tensei]!.cores).toHaveLength(1 + total - 2);
  });

  it('ชา-ซู: เสื่อมสภาพสปิริตได้ทั้งสองฝ่าย', () => {
    let s = setup();
    const chasu = put(s, 'p2', no('ชา-ซู'), 1);
    const mine = put(s, 'p2', DARIU, 1);
    put(s, 'p1', DARIU, 1);
    s = useMagic(s, 'เฟลมมังกรคลั่ง');
    if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, chasu);
    expect(s.players.p2.trashCards).toContain(chasu);
    const c = s.choice as { kind: string; candidates: string[] };
    expect(c.candidates).toContain(mine);
  });

  it('นาเดชิโกะ: สูญสลายโดยเอฟเฟกต์ของคู่แข่ง → กลับขึ้นมือ', () => {
    let s = setup();
    put(s, 'p2', no('เซ็นโงคุฮิเมะ นาเดชิโกะ'), 2, true);
    const tan = put(s, 'p2', no('เซ็นโงคุฮิเมะ ทันโปโปะ'), 1);
    const kukai = put(s, 'p1', no('มูฉะม้ายักษ์ คุไก'), 1);
    s = attack(s, kukai);
    if (s.choice?.kind === 'card') s = choose(s, tan);
    expect(s.players.p2.hand).toContain(tan);
    expect(s.players.p2.trashCards).not.toContain(tan);
  });

  it('มิคาเนะ: ไลฟ์เหลือ 1 ก็เลือกคงอยู่ได้ (ไลฟ์เป็น 0 = แพ้)', () => {
    let s = setup();
    const mikane = put(s, 'p2', no('เซ็นโงคุฮิเมะ มิคาเนะ'), 1);
    s.players.p2.life = s.players.p2.life.slice(0, 1);
    s = useMagic(s, 'เฟลมมังกรคลั่ง');
    if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, mikane);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'คอร์ไลฟ์'));
    expect(s.winner).toBe('p1');
  });

  it('อุซชน Lv2 (มีเทนเซย์): จบการต่อสู้ของสปิริตสีเขียว → ส่งคอร์ 3 เม็ดลงแทรช เพื่อฟื้นสภาพ', () => {
    let s = setup();
    put(s, 'p1', no('เหล่าคนใกล้ชิด อุซชน'), 2);
    put(s, 'p1', no('หกขุนศึกเซ็นโงคุ เทนเซย์'), 1);
    const atk = put(s, 'p1', no('ข้ารับใช้ผู้ภักดี ฮิกุมารุ'), 5);
    s = passAll(attack(s, atk));
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    s = choose(s, optionIndex(s, 'ส่งคอร์ 3 เม็ด'));
    expect(s.cards[atk]!.state).toBe('refresh');
    expect(s.cards[atk]!.cores).toHaveLength(2);
  });

  it('เฮล-สคัล Lv2 (มีมุโดว): เลือกส่งคอร์จากรีเสิร์ฟคู่แข่งได้', () => {
    let s = setup();
    const hell = put(s, 'p1', no('เหล่าคนใกล้ชิด เฮล-สคัล'), 3);
    put(s, 'p1', no('หกขุนศึกเซ็นโงคุ มุโดว'), 1);
    const reserve = s.players.p2.reserve.length;
    const trash = s.players.p2.trashCores.length;
    s = attack(s, hell);
    s = choose(s, optionIndex(s, 'จากรีเสิร์ฟคู่แข่ง 3 เม็ด'));
    expect(s.players.p2.reserve.length).toBe(reserve - 3);
    expect(s.players.p2.trashCores.length).toBe(trash + 3);
  });

  it('มุโดว Soul Drive: เลือกส่งคอร์ในแทรชคู่แข่งไปวอยด์ได้', () => {
    let s = setup();
    const mudo = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ มุโดว'), 2, true); // Lv3
    const moved = s.players.p2.reserve.filter((id) => !s.cores[id]!.isSoul).slice(0, 6);
    s.players.p2.reserve = s.players.p2.reserve.filter((id) => !moved.includes(id));
    s.players.p2.trashCores.push(...moved);
    s = attack(s, mudo);
    s = choose(s, optionIndex(s, 'Soul Drive'));
    // หลังส่งโซลคอร์ออก มุโดวเหลือคอร์ 1 เม็ด = Lv3 → 2×3 = 6 เม็ด
    s = choose(s, optionIndex(s, 'จากแทรชคู่แข่ง 6 เม็ด'));
    expect(s.players.p2.trashCores.length).toBe(0);
    for (const id of moved) expect(s.cores[id]).toBeUndefined();
  });

  it('ลาเทล Lv2 (มีโซลคอร์): อัลติเมทเผ่า [ศาสตราสมิง] ได้ BP+4000 ด้วย', () => {
    const s = setup();
    put(s, 'p1', no('ข้ารับใช้ผู้ภักดี ลาเทล'), 2, true);
    const tensei = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ เทนเซย์'), 1);
    expect(currentBp(s, db, tensei)).toBe(10000 + 4000);
  });

  it('Bunshin (โยโรอิสุโมะ): ใบบนสุดเด็คกลายเป็นสปิริตร่างแยก (เขียว คอสต์ 0 Lv1 BP3000)', () => {
    let s = setup();
    const top = s.players.p1.deck.slice(0, 2);
    const yoroi = card(s, 'p1', no('มารวายุชุดเกราะ โยโรอิสุโมะ'), 'hand');
    s = summon(s, yoroi);
    s = choose(s, optionIndex(s, '2 ใบ'));
    // วางคอร์จากรีเสิร์ฟ: ใบแรก 2 เม็ด ใบที่สอง 1 เม็ด
    s = choose(s, { pay: normalCores(s).slice(0, 2) });
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.cards[top[0]!]!.cores).toHaveLength(2);
    for (const id of top) {
      const c = s.cards[id]!;
      expect(s.players.p1.field).toContain(id);
      expect(c.cardNo).toBe('SMP-BUNSHIN');
      expect(c.realCardNo).toBe(DARIU);
      expect(currentBp(s, db, id)).toBe(3000);
    }
    // ร่างแยกรวมร่างไม่ได้
    expect(braveFits(db.get(no('ไดกิว-อาร์มส์')), db.get('SMP-BUNSHIN'))).toBe(false);
  });

  it('Bunshin: ร่างแยกถูกทำลาย → ลงแทรชเป็นการ์ดจริง · Lv2 (มีโซลคอร์) ขึ้นมือแทน', () => {
    const run = (withSoul: boolean) => {
      let s = setup();
      put(s, 'p2', no('มารวายุชุดเกราะ โยโรอิสุโมะ'), 3, withSoul);
      const clone = s.players.p2.deck[0]!;
      const core = s.players.p2.reserve.find((id) => !s.cores[id]!.isSoul)!;
      s.players.p2.reserve = s.players.p2.reserve.filter((id) => id !== core);
      s.players.p2.deck.shift();
      Object.assign(s.cards[clone]!, { realCardNo: s.cards[clone]!.cardNo, cardNo: 'SMP-BUNSHIN', cores: [core] });
      s.players.p2.field.push(clone);
      s = useMagic(s, 'เฟลมมังกรคลั่ง');
      if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, clone);
      expect(s.cards[clone]!.cardNo).toBe(DARIU);
      expect(s.cards[clone]!.realCardNo).toBeUndefined();
      return s.players.p2.hand.includes(clone) ? 'hand' : s.players.p2.trashCards.includes(clone) ? 'trash' : 'other';
    };
    expect(run(false)).toBe('trash');
    expect(run(true)).toBe('hand');
  });

  it('เคล็ดวิชาการอัญเชิญ: หงายร่างแยก การ์ดสปิริต → อัญเชิญ', () => {
    let s = setup();
    const clone = s.players.p1.deck[0]!;
    const core = s.players.p1.reserve.find((id) => !s.cores[id]!.isSoul)!;
    s.players.p1.reserve = s.players.p1.reserve.filter((id) => id !== core);
    s.players.p1.deck.shift();
    Object.assign(s.cards[clone]!, { realCardNo: s.cards[clone]!.cardNo, cardNo: 'SMP-BUNSHIN', cores: [core] });
    s.players.p1.field.push(clone);
    s = useMagic(s, 'เคล็ดวิชาการอัญเชิญ');
    if (s.choice?.kind === 'card') s = choose(s, clone);
    // นับเป็นการอัญเชิญ: วางคอร์ใหม่
    expect(s.choice).toMatchObject({ kind: 'placeCores', player: 'p1' });
    s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.cards[clone]!.cardNo).toBe(DARIU);
    expect(s.players.p1.field).toContain(clone);
  });

  it('สิงโตควันม่วง: ทิ้งใบบนสุดเด็ค 3 ใบ คอสต์ -3', () => {
    let s = setup();
    const lion = card(s, 'p1', no('สิงโตควันม่วง'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[lion]!.cardNo));
    const res = normalCores(s);
    const deck = s.players.p1.deck.length;
    s = act(s, { type: 'summon', player: 'p1', cardId: lion, payment: res.slice(0, cost - 3), placement: res.slice(cost - 3, cost - 2), mill: 3 });
    expect(s.players.p1.field).toContain(lion);
    expect(s.players.p1.deck.length).toBe(deck - 3);
  });

  it('สิงโตควันม่วง Lv2: อัญเชิญสปิริตที่ไม่ใช่สีม่วงโดยเอฟเฟกต์ ต้องจ่ายเพิ่ม 5', () => {
    let s = setup();
    put(s, 'p2', no('สิงโตควันม่วง'), 2);
    const tree = card(s, 'p1', no('สวนลอยฟ้าของเหล่าเจ้าหญิง'), 'hand');
    void tree;
    // คำสาปวิญญาณย้อนกลับ: อัญเชิญเผ่าอสูรราตรี (ม่วง) จากแทรช = ไม่ต้องจ่ายเพิ่ม · ใช้ DARIU (แดง) ผ่านเคล็ดวิชา: ทดสอบด้วยการหงายร่างแยก
    const clone = s.players.p1.deck[0]!;
    const core = normalCores(s)[0]!;
    s.players.p1.reserve = s.players.p1.reserve.filter((id) => id !== core);
    s.players.p1.deck.shift();
    Object.assign(s.cards[clone]!, { realCardNo: s.cards[clone]!.cardNo, cardNo: 'SMP-BUNSHIN', cores: [core] });
    s.players.p1.field.push(clone);
    s = useMagic(s, 'เคล็ดวิชาการอัญเชิญ');
    if (s.choice?.kind === 'card') s = choose(s, clone);
    expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p1', cost: 5 });
    // ไม่จ่าย = ไม่อัญเชิญ → ลงแทรช
    s = choose(s, null);
    expect(s.players.p1.trashCards).toContain(clone);
  });

  it('โฮเนะสุมิ: เอฟเฟกต์จบแอทแท็คสเต็ปของเมจิคคู่แข่ง → ไร้ผลถ้าไม่จ่ายเพิ่ม 2', () => {
    const run = (pay: boolean) => {
      let s = setup();
      const hone = put(s, 'p2', no('โฮเนะสุมิ'), 1, true);
      const atk = put(s, 'p1', DARIU, 1);
      s = attack(s, atk);
      s = act(s, { type: 'passFlash', player: 'p2' });
      s = useMagic(s, 'เบิร์สวอลล์');
      expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
      s = choose(s, optionIndex(s, 'ส่ง Soul Core'));
      expect(s.cards[hone]!.cores.some((c) => s.cores[c]!.isSoul)).toBe(false);
      expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p1', cost: 2 });
      s = choose(s, pay ? { pay: normalCores(s).slice(0, 2) } : null);
      return s.battle?.endAttackStepAfter ?? false;
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  it('บิรันบะ (ในมือ): คู่แข่งได้คอร์จากวอยด์ → อัญเชิญไม่จ่ายคอสต์ได้', () => {
    let s = setup();
    const biran = card(s, 'p2', no('ยักษ์หน้ามังกร บิรันบะ'), 'hand');
    const latel = put(s, 'p1', no('ข้ารับใช้ผู้ภักดี ลาเทล'), 1);
    s = attack(s, latel);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'อัญเชิญ บิรันบะ'));
    expect(s.choice).toMatchObject({ kind: 'placeCores', player: 'p2' });
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.players.p2.field).toContain(biran);
  });

  it('มิโคโตะ Catalyze: เบิร์สที่เลือกเป้า 1 ตัว = ทั้งหมด', () => {
    let s = setup();
    const mikoto = put(s, 'p1', no('เซ็นโงคุฮิเมะ มิโคโตะ'), 3, true);
    const burst = card(s, 'p1', no('เซ็นโงคุฮิเมะ มิโคโตะ'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = attack(s, mikoto);
    s = choose(s, optionIndex(s, 'Catalyze'));
    expect(s.players.p2.trashCards).toContain(a);
    expect(s.players.p2.trashCards).toContain(b);
  });

  it('สิงโตควันม่วง: อัญเชิญด้วยเอฟเฟกต์ (จ่ายคอสต์) ก็เลือกทิ้งเด็คลดคอสต์ได้', () => {
    let s = setup();
    const lion = card(s, 'p1', no('สิงโตควันม่วง'), 'trashCards');
    const rikudo = put(s, 'p1', no('จักรพรรดิองเมียว ริคุโดว'), 2);
    s = attack(s, rikudo);
    s = choose(s, lion);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    expect((s.choice as { options: string[] }).options.some((o) => o.includes('คอสต์ -3'))).toBe(true);
  });

  it('อิกคาคุ Lv3: สั่งใช้เอฟเฟกต์เบิร์สของเบิร์สที่ทิ้ง (ไม่จ่ายแฟลช)', () => {
    let s = setup();
    const ikkaku = put(s, 'p1', no('ขุนศึกมังกรทะเล อิกคาคุ'), 4);
    const burst = card(s, 'p2', no('คำสาปบงการชีพ'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== burst);
    s.players.p2.burst = burst;
    const goki = put(s, 'p2', no('โกคิ'), 4);
    s = attack(s, ikkaku);
    expect(s.players.p2.trashCards).toContain(burst);
    s = choose(s, optionIndex(s, 'สั่งใช้เอฟเฟกต์เบิร์ส'));
    if (s.choice?.kind === 'card') s = choose(s, goki);
    expect(s.cards[goki]!.cores).toHaveLength(2);
    expect(s.choice?.kind === 'payCost').toBe(false);
  });

  it('คำสาปบงการชีพ: ไร้สีเฉพาะเมื่อถูกสั่งใช้โดย Catalyze', () => {
    // เปิดตามเงื่อนไขปกติ (คู่แข่งโจมตี) = ไม่ไร้สี
    let s = setup();
    const b1 = card(s, 'p2', no('คำสาปบงการชีพ'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== b1);
    s.players.p2.burst = b1;
    put(s, 'p1', DARIU, 3);
    s = attack(s, put(s, 'p1', DARIU, 1));
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    expect(s.colorlessTurn ?? []).toEqual([]);

    // สั่งใช้โดย Catalyze (ชิโดะ) = ไร้สีในเทิร์นนี้
    let t = setup();
    const b2 = card(t, 'p1', no('คำสาปบงการชีพ'), 'hand');
    t.players.p1.hand = t.players.p1.hand.filter((id) => id !== b2);
    t.players.p1.burst = b2;
    put(t, 'p2', DARIU, 3);
    const shido = put(t, 'p1', no('นักบวชองเมียว ชิโดะ'), 1, true);
    t = attack(t, shido);
    t = choose(t, optionIndex(t, 'Catalyze'));
    expect((t.colorlessTurn ?? []).map((c) => c.cardId)).toContain(b2);
  });

  it('เทนเซย์ Soul Drive: วางคอร์วอยด์เท่าจำนวนคอร์ในรีเสิร์ฟและบนสปิริต/อัลติเมทของเรา', () => {
    let s = setup();
    const tensei = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ เทนเซย์'), 2, true);
    const reserve = s.players.p1.reserve.length;
    s = attack(s, tensei);
    s = choose(s, optionIndex(s, 'Soul Drive'));
    expect(s.cards[tensei]!.cores.length).toBe(1 + reserve + 1);
  });
});
