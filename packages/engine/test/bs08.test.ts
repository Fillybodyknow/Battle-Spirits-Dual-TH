import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS08Cards } from '@bs/cards';
import { applyAction, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';
import { textHas } from '../src/rules';

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
  const id = `t8-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t8-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t8-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].hand.push(id);
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
/** p1 จบเทิร์น → เข้าเทิร์นของ p2 (สตาร์ทสเต็ป) */
const toP2Turn = (s: GameState) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'endAttackStep', player: 'p1' });

describe('Booster Set 08', () => {
  it('กุนซือ โดรเดอร์ดราก้อน: ตัวเองโจมตีไม่จั่ว (ข้อความแค่อ้างถึงคีย์เวิร์ด) · ลีฟวูล์ฟ: นับการ์ดที่มี Quick จริง', () => {
    const def = (name: string) => db.get(no(name));
    expect(textHas(def('กุนซือ โดรเดอร์ดราก้อน'), 'Evolution')).toBe(false);
    expect(textHas(def('No.43 แบร์บุ๊ค'), 'Showdown')).toBe(false);
    expect(textHas(def('ขุนศึกผู้งามสง่า เฮียวจินดราก้อน'), 'Showdown')).toBe(true);
    expect(textHas(def('ฮากาเนะวูม'), 'True-Rage')).toBe(true);
    expect(textHas(def('ฮากาเนะวูม'), 'Consecutive Blade')).toBe(false);
    expect(textHas(def('ลีฟวูล์ฟ'), 'Quick')).toBe(true);
    let s = setup();
    const dorder = put(s, 'p1', no('กุนซือ โดรเดอร์ดราก้อน'), 1);
    const hand = s.players.p1.hand.length;
    s = passAll(attack(s, dorder));
    expect(s.players.p1.hand).toHaveLength(hand);
  });

  it('กำแพงผลึกขาว (โซลคอร์): ในเทิร์นนี้โดนสปิริต 2 เจ็มตี = ไลฟ์ลดแค่ 1', () => {
    const run = (cap: boolean) => {
      let s = setup();
      const atk = put(s, 'p1', no('มัดโควเซรัส'), 1); // เจ็ม 2 เม็ด ไม่มีเอฟเฟกต์
      if (cap) s.lifeCapOne = [{ player: 'p2', turn: s.turn }];
      const life = s.players.p2.life.length;
      s = passAll(attack(s, atk));
      s = passAll(act(s, { type: 'noBlock', player: 'p2' }));
      return life - s.players.p2.life.length;
    };
    expect(run(false)).toBe(2);
    expect(run(true)).toBe(1);
  });

  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดเอฟเฟกต์มีสคริปต์ (ยกเว้นอามิตะ Lv2: การ์ดที่อ้างถึงยังไม่มี)', () => {
    const cards = loadBS08Cards().all();
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => {
        if (c.name === 'อามิตะเนียวไรโช' && i === 2) return;
        expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true);
      });
    }
    expect(db.get(no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'))).toMatchObject({ type: 'ultimate', summonCondition: { lifeAtMost: 3 } });
  });

  it('อัลติเมท: อัญเชิญได้เมื่อครบเงื่อนไขอัญเชิญ (ไลฟ์ไม่เกิน 3)', () => {
    const s = setup();
    const tidal = inHand(s, 'p1', no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[tidal]!.cardNo));
    const res = normalCores(s);
    const summon: Action = { type: 'summon', player: 'p1', cardId: tidal, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) };
    expect(fails(s, summon)).toBe('SUMMON_CONDITION');
    s.players.p1.life = s.players.p1.life.slice(0, 3);
    const t = act(s, summon);
    expect(t.players.p1.field).toContain(tidal);
  });

  it('Spirit Soul: อัญเชิญการ์ดอัลติเมท = สปิริตนี้ได้เจ็มเพิ่ม (ลดคอสต์ได้มากขึ้น)', () => {
    const s = setup();
    const card = db.get(no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'));
    const before = payableCost(s, db, 'p1', card);
    put(s, 'p1', no('เทริโนะสุเกะแห่งคนขายยา'), 1); // Spirit Soul : ฟ้า
    expect(payableCost(s, db, 'p1', card)).toBe(before - 2); // เจ็มฟ้า 1 (การ์ด) + 1 (Spirit Soul)
    expect(payableCost(s, db, 'p1', db.get(no('ขุนพลทะเลแห่งคลื่นกระหน่ำ ชามอน')))).toBe(payableCost(setup(), db, 'p1', db.get(no('ขุนพลทะเลแห่งคลื่นกระหน่ำ ชามอน'))) - 1);
  });

  it('Showdown (เฮียวจิน): สตาร์ทสเต็ปของคู่แข่ง คู่แข่งระบุสปิริต → ชนะ = ทำลาย + เทิร์นนี้อัญเชิญคอสต์ไม่เกิน 4 ไม่ได้', () => {
    let s = setup();
    const hyo = put(s, 'p1', no('ขุนศึกผู้งามสง่า เฮียวจินดราก้อน'), 1); // BP 4000
    const weak = put(s, 'p2', DARIU, 1); // BP 3000
    const strong = put(s, 'p2', DARIU, 5); // BP สูงกว่า
    s = toP2Turn(s);
    expect(s.turnPlayer).toBe('p2');
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p2' });
    expect((s.choice as { candidates: string[] }).candidates).toEqual(expect.arrayContaining([weak, strong]));
    s = choose(s, weak);
    expect(s.players.p2.trashCards).toContain(weak);
    expect(s.players.p1.field).toContain(hyo);
    // เมนสเต็ปของ p2: อัญเชิญคอสต์ไม่เกิน 4 ไม่ได้
    const c = inHand(s, 'p2', DARIU);
    const res = normalCores(s, 'p2');
    expect(fails(s, { type: 'summon', player: 'p2', cardId: c, payment: res.slice(0, 1), placement: res.slice(1, 2) })).toBe('SUMMON_BANNED');
  });

  it('Showdown: คู่แข่งระบุตัวที่ BP สูงกว่า = สปิริตนี้ถูกทำลาย เอฟเฟกต์ถัดไปไม่ทำงาน', () => {
    let s = setup();
    const hyo = put(s, 'p1', no('ขุนศึกผู้งามสง่า เฮียวจินดราก้อน'), 1);
    const strong = put(s, 'p2', DARIU, 5);
    s = toP2Turn(s);
    s = choose(s, strong);
    expect(s.players.p1.trashCards).toContain(hyo);
    expect(s.players.p2.field).toContain(strong);
    expect(s.summonBans ?? []).toHaveLength(0);
  });

  it('ไกชูว: ขณะ Showdown BP+5000 · ชนะแล้วคู่แข่งเสียเจ็มสีที่เลือก', () => {
    let s = setup();
    const gai = put(s, 'p1', no('ขุนศึกมังกรอัศวิน ไกชูว'), 2); // Lv2 BP 8000 (+5000 ขณะ Showdown)
    const target = put(s, 'p2', DARIU, 5); // Lv3
    const other = put(s, 'p2', DARIU, 1);
    // BP เท่ากัน (8000) ถ้าไม่มี +5000 จะถูกทำลายทั้งคู่
    expect(currentBp(s, db, target)).toBe(currentBp(s, db, gai));
    s = toP2Turn(s);
    s = choose(s, target);
    expect(s.players.p2.trashCards).toContain(target);
    expect(s.players.p1.field).toContain(gai);
    s = choose(s, optionIndex(s, 'แดง'));
    expect(s.turnSymbolBuffs).toEqual([expect.objectContaining({ player: 'p2', color: 'red', count: -1 })]);
    void other;
  });

  it('Soul Drive (ไทดัล-บลู): โซลคอร์ออกจากเกม → คู่แข่งข้ามรีเฟรชสเต็ปและเมนสเต็ปในเทิร์นถัดไป', () => {
    let s = setup();
    s.players.p1.life = s.players.p1.life.slice(0, 3);
    const tidal = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'), 1, true); // Lv3 + Soul
    const tired = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s = attack(s, tidal);
    // ทำลายสปิริตคอสต์ไม่เกิน 7 (มีเป้าเดียว = เลือก)
    if (s.choice?.kind === 'card') s = choose(s, tired);
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, optionIndex(s, 'Soul Drive'));
    expect(s.cards[tidal]!.cores.some((c) => s.cores[c]!.isSoul)).toBe(false);
    expect(s.skipSteps).toEqual([expect.objectContaining({ player: 'p2', steps: ['refresh', 'main'] })]);
    // จบการต่อสู้ แล้วจบเทิร์น
    s = passAll(s);
    if (s.battle && !s.battle.flash) s = act(s, { type: 'noBlock', player: 'p2' });
    s = passAll(s);
    const p2tired = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s = act(s, { type: 'endAttackStep', player: 'p1' });
    expect(s.turnPlayer).toBe('p2');
    expect(s.phase).toBe('attack');
    expect(s.cards[p2tired]!.state).toBe('exhausted');
  });

  it('Infinite Blade (อามาสึ): เลือกโจมตีสปิริตคู่แข่ง และสปิริตนี้ไม่เสื่อมสภาพ', () => {
    let s = setup();
    const amatsu = put(s, 'p1', no('มังกรยอดนักดาบ ซามูไร-ดราก้อน-อามาสึ'), 1, true);
    const target = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s = attack(s, amatsu);
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, optionIndex(s, 'Infinite Blade'));
    // เลือกผู้ป้องกัน
    const ch = s.choice!;
    s = ch.kind === 'multiCard' ? choose(s, { cards: [target] }) : choose(s, target);
    expect(s.battle?.blockers).toEqual([target]);
    expect(s.cards[amatsu]!.state).toBe('refresh');
  });

  it('Infinite Blade: เลือกใช้แต่ไม่เลือกเป้า = เสื่อมสภาพตามปกติ', () => {
    let s = setup();
    const amatsu = put(s, 'p1', no('มังกรยอดนักดาบ ซามูไร-ดราก้อน-อามาสึ'), 1, true);
    put(s, 'p2', DARIU, 1);
    s = attack(s, amatsu);
    s = choose(s, optionIndex(s, 'Infinite Blade'));
    s = choose(s, null);
    expect(s.battle?.direct).toBeFalsy();
    expect(s.cards[amatsu]!.state).toBe('exhausted');
  });

  it('มูฉะลิซาร์ด: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (กติกา 10: คอร์บนการ์ดกลับรีเสิร์ฟ) · แพ้เทียบ BP ไม่ทำงาน', () => {
    // ถูกทำลายด้วยเอฟเฟกต์: แสดงอัลติเมท → คอร์วอยด์ 3 เม็ด
    let s = setup();
    const liz = put(s, 'p2', no('มูฉะลิซาร์ด'), 1);
    inHand(s, 'p2', no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'));
    const magic = inHand(s, 'p1', no('เฟลมมังกรคลั่ง'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[magic]!.cardNo));
    const before = s.players.p2.reserve.length;
    s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
    if (s.choice?.kind === 'card') s = choose(s, liz);
    expect(s.players.p2.trashCards).toContain(liz);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'แสดงการ์ดอัลติเมท'));
    expect(s.players.p2.reserve.length).toBe(before + 1 + 3);

    // แพ้เทียบ BP: ไม่ถาม
    let t = setup();
    const atk = put(t, 'p1', DARIU, 5);
    const blk = put(t, 'p2', no('มูฉะลิซาร์ด'), 1);
    inHand(t, 'p2', no('หกขุนศึกเซ็นโงคุ ไทดัล-บลู'));
    t = attack(t, atk);
    t = passAll(t);
    t = act(t, { type: 'declareBlock', player: 'p2', blockerId: blk });
    t = passAll(t);
    expect(t.players.p2.trashCards).toContain(blk);
    expect(t.choice).toBeFalsy();
  });

  it('Summon Bolt (คุจาคุ): จบการต่อสู้ ทำลายสปิริตนี้ เพื่ออัญเชิญสปิริตเผ่าเดียวกันคอสต์ 2-8 จากมือ', () => {
    let s = setup();
    const kujaku = put(s, 'p1', no('คุจาคุเมียวโอ'), 2); // Lv2
    const next = inHand(s, 'p1', no('มังกรผู้ลุกตื่น สุเมรากิ-ดราก้อน')); // ข้ารับใช้ คอสต์ 8
    inHand(s, 'p1', DARIU); // เผ่าไม่ตรง
    s = attack(s, kujaku);
    s = passAll(s);
    if (s.battle && !s.battle.flash) s = act(s, { type: 'noBlock', player: 'p2' });
    s = passAll(s);
    expect(s.choice).toMatchObject({ kind: 'option' });
    s = choose(s, optionIndex(s, 'Summon Bolt'));
    expect(s.players.p1.trashCards).toContain(kujaku);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [next] });
    s = choose(s, next);
    if (s.choice?.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.players.p1.field).toContain(next);
  });

  it('เซ็นริวดาคุ Soul Drive: สปิริต/อัลติเมทคู่แข่งทั้งหมดกลับไปบนสุดเด็ค เรียงลำดับได้', () => {
    let s = setup();
    s.players.p1.life = s.players.p1.life.slice(0, 3);
    const zen = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ เซ็นริวดาคุ'), 2, true); // Lv4 + Soul
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 2);
    s = attack(s, zen);
    s = choose(s, optionIndex(s, 'Soul Drive'));
    // DARIU ใบเดียวกันทั้งคู่ = ไม่ต้องเรียง
    expect(s.players.p2.field).not.toContain(a);
    expect(s.players.p2.deck.slice(0, 2).sort()).toEqual([a, b].sort()); // บนสุดเด็ค = ต้นอาร์เรย์
  });

  it('เซ็นริวดาคุ Soul Drive: การ์ดคู่แข่งต่างชื่อ = ผู้ใช้เอฟเฟกต์เรียงลำดับบนสุดเด็คคู่แข่ง', () => {
    let s = setup();
    s.players.p1.life = s.players.p1.life.slice(0, 3);
    const zen = put(s, 'p1', no('หกขุนศึกเซ็นโงคุ เซ็นริวดาคุ'), 2, true);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', no('มูฉะเคราท็อพส์'), 1);
    s = attack(s, zen);
    s = choose(s, optionIndex(s, 'Soul Drive'));
    expect(s.choice).toMatchObject({ kind: 'arrange', player: 'p1', where: 'top' });
    s = choose(s, { order: [b, a] });
    expect(s.players.p2.deck.slice(0, 2)).toEqual([b, a]);
  });

  it('กติกา 10: สูญสลายไม่ใช่การถูกทำลาย → เบิร์ส "ถูกทำลายโดยคู่แข่ง" ไม่เปิด · "ถูกทำลาย/สูญสลาย" (ฮนมารุ) เปิดได้', () => {
    const run = (burstName: string) => {
      let s = setup();
      const target = put(s, 'p2', DARIU, 1);
      const burst = `t8-burst-${++seq}`;
      s.cards[burst] = { id: burst, cardNo: no(burstName), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
      s.players.p2.burst = burst;
      const magic = inHand(s, 'p1', no('ไยมายากระชากวิญญาณ'));
      const cost = payableCost(s, db, 'p1', db.get(s.cards[magic]!.cardNo));
      s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
      if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, target);
      expect(s.players.p2.trashCards).toContain(target);
      return s.choice?.kind === 'option' && s.choice.player === 'p2' && optionIndex(s, 'เปิด Burst') >= 0;
    };
    expect(run('E-วัลเชอร์')).toBe(false);
    expect(run('ปราสาทมังกรใหญ่-ฮนมารุ')).toBe(true);
  });

  it('เบิร์ส "หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง": เน็กซัสถูกทำลายไม่นับ (ฮนมารุไม่เปิด)', () => {
    let s = setup();
    const nexusNo = db.all().find((c) => c.type === 'nexus' && c.name !== 'ปราสาทมังกรใหญ่-ฮนมารุ')!.cardNo;
    const nexus = put(s, 'p2', nexusNo, 0);
    const burst = `t8-burst-${++seq}`;
    s.cards[burst] = { id: burst, cardNo: no('ปราสาทมังกรใหญ่-ฮนมารุ'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p2.burst = burst;
    const magic = inHand(s, 'p1', no('บัสเตอร์สเปียร์'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[magic]!.cardNo));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
    while (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, nexus);
    expect(s.players.p2.trashCards).toContain(nexus);
    expect(s.choice?.kind === 'option' && s.choice.player === 'p2' && optionIndex(s, 'เปิด Burst') >= 0).toBe(false);
    expect(s.players.p2.burst).toBe(burst);
  });

  it('เบิร์ส "หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง": เบรฟที่ร่วมร่างถูกทำลายไม่นับ (เจ้าของโปรเจกต์กำหนด)', () => {
    let s = setup();
    const host = put(s, 'p2', DARIU, 1);
    const brave = `t8-card-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: no('ชุดเกราะขุนพลดาบ แอช-ไลอ้อน'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(brave);
    const burst = `t8-burst-${++seq}`;
    s.cards[burst] = { id: burst, cardNo: no('ปราสาทมังกรใหญ่-ฮนมารุ'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p2.burst = burst;
    const magic = inHand(s, 'p1', no('ผ่าสังหารทำลายล้างแห่งเปลวเพลิง'));
    const cost = payableCost(s, db, 'p1', db.get(s.cards[magic]!.cardNo));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
    while (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, brave);
    expect(s.players.p2.trashCards).toContain(brave);
    expect(s.players.p2.field).toContain(host);
    expect(s.choice?.kind === 'option' && s.choice.player === 'p2' && optionIndex(s, 'เปิด Burst') >= 0).toBe(false);
    expect(s.players.p2.burst).toBe(burst);
  });

  it('โอตโตะ: คอร์บนสปิริตเผ่า [สมิงหัว] ของเราลดเหลือ 1 เม็ดโดยคู่แข่งไม่ได้', () => {
    const run = (withOtto: boolean) => {
      let s = setup();
      if (withOtto) put(s, 'p2', no('เจ้าแห่งน้ำ โอตโตะ'), 2);
      const kiri = put(s, 'p2', no('มูฉะชายฝั่ง คิริซาเมะ'), 2);
      const magic = inHand(s, 'p1', no('ไยมายากระชากวิญญาณ'));
      const cost = payableCost(s, db, 'p1', db.get(s.cards[magic]!.cardNo));
      s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: normalCores(s).slice(0, cost), timing: 'flash' });
      while (s.choice?.kind === 'card') s = choose(s, kiri);
      return s.cards[kiri]!.cores.length;
    };
    expect(run(false)).toBe(1);
    expect(run(true)).toBe(2);
  });
});
