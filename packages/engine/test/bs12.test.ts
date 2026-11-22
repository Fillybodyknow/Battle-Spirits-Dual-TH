import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS12Cards } from '@bs/cards';
import { applyAction, braveFits, canAttackWith, cardLevel, createGame, extraSymbols, magicBanned, payableCost, type Action, type GameState, type PlayerId } from '../src';
import { bounceImmuneSource, burstBlocked, fieldCost, nexusExhaustPayMax } from '../src/rules';

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
  const id = `t12-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t12-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t12-card-${++seq}`;
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
const useMagic = (s: GameState, name: string) => {
  const m = card(s, 'p1', no(name), 'hand');
  const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
  return act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, cost), timing: 'flash' });
};
const summon = (s: GameState, cardId: string, place = 1, extra: Partial<Extract<Action, { type: 'summon' }>> = {}) => {
  const def = db.get(s.cards[cardId]!.cardNo);
  const cost = Math.max(0, payableCost(s, db, 'p1', def) - (extra.exhaustNexus ?? 0));
  const res = normalCores(s);
  return act(s, { type: 'summon', player: 'p1', cardId, payment: res.slice(0, cost), placement: res.slice(cost, cost + place), ...extra });
};

describe('Booster Set 12', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS12Cards().all();
    expect(cards).toHaveLength(40);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('โดจิ ห้ามงคล: [เมื่อสปิริตนี้ถูกอัญเชิญ] ของสปิริตทุกฝ่ายไม่ทำงาน', () => {
    let s = setup();
    const foe = put(s, 'p2', DARIU, 1); // BP 3000
    put(s, 'p2', no('โดจิ ห้ามงคล'), 1);
    s = summon(s, card(s, 'p1', no('ซีโนะบาซุคุ'), 'hand'));
    expect(s.choice).toBeNull();
    expect(s.players.p2.field).toContain(foe);
  });

  it('ซีโนะบาซุคุ (ไม่มีห้ามงคล): ทำลาย BP ไม่เกิน 3000 แล้วจั่ว 1', () => {
    let s = setup();
    const foe = put(s, 'p2', DARIU, 1);
    const zino = card(s, 'p1', no('ซีโนะบาซุคุ'), 'hand');
    const hand = s.players.p1.hand.length;
    s = summon(s, zino);
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(s.players.p2.trashCards).toContain(foe);
    expect(s.players.p1.hand.length).toBe(hand); // ใบที่อัญเชิญออกไป 1 + จั่ว 1
  });

  it('ทรูธ-อีเด็น: ต้องจ่ายอย่างน้อย 1 คอสต์ · อัญเชิญไม่จ่ายคอสต์ด้วยเอฟเฟกต์ไม่ได้', () => {
    const s = setup();
    const truth = db.get(no('ดาบแห่งการพิพากษาที่แท้จริง ทรูธ-อีเด็น'));
    // เจ็มทั้ง 6 สีลดได้ครบ 6 ก็ยังต้องจ่าย 1
    for (const c of ['red', 'purple', 'yellow', 'white', 'blue', 'green']) put(s, 'p1', db.all().find((d) => d.type === 'nexus' && d.colors[0] === c && d.symbols[c as 'red'])!.cardNo, 0);
    expect(payableCost(s, db, 'p1', truth)).toBe(1);
  });

  it('ทรูธ-อีเด็น: อัญเชิญแล้วอัญเชิญจอมดาบ/ดาบกระบี่จากมือกี่ใบก็ได้ โดย [เมื่ออัญเชิญ] ไม่ทำงาน', () => {
    let s = setup();
    const foe = put(s, 'p2', DARIU, 1);
    const shining = card(s, 'p1', no('ดาบศักดิ์สิทธิ์แห่งแสง ไชนิ่ง-ซอร์ด'), 'hand'); // [เมื่ออัญเชิญ] ทำลาย BP≤3000 ทั้งหมด
    const truth = card(s, 'p1', no('ดาบแห่งการพิพากษาที่แท้จริง ทรูธ-อีเด็น'), 'hand');
    s = summon(s, truth);
    expect(s.choice?.kind).toBe('multiSummon');
    const res = normalCores(s);
    s = choose(s, { summons: [{ cardId: shining, cores: [res[0]!] }] });
    expect(s.players.p1.field).toContain(shining);
    expect(s.players.p2.field).toContain(foe); // ไชนิ่ง-ซอร์ดไม่ทำลาย
  });

  it('คาเมะมิสึ: อัญเชิญเซ็นจู เสื่อมสภาพเน็กซัส ใบละ = จ่ายแล้ว 1 คอสต์', () => {
    let s = setup();
    put(s, 'p1', no('ปรมาจารย์ช่างตีเหล็ก คาเมะมิสึ'), 1);
    const n1 = put(s, 'p1', no('No.26 แคพิทัลแคพิทัล'), 0);
    const n2 = put(s, 'p1', no('เจย์ดีห้าชั้นแห่งบัวบาน'), 0);
    const senju = card(s, 'p1', no('ราชันดอกบัว เซ็นจู'), 'hand');
    const full = payableCost(s, db, 'p1', db.get(s.cards[senju]!.cardNo));
    expect(nexusExhaustPayMax(s, db, 'p1', senju, 8).max).toBe(2);
    const trash = s.players.p1.trashCores.length;
    s = summon(s, senju, 1, { exhaustNexus: 2 });
    expect(s.players.p1.field).toContain(senju);
    expect(s.players.p1.trashCores.length - trash).toBe(full - 2);
    expect(s.cards[n1]!.state).toBe('exhausted');
    expect(s.cards[n2]!.state).toBe('exhausted');
  });

  it('เซ็นจู: แอทแท็คสเต็ปของเรา เจ็มฟ้า +1 ต่อเน็กซัสของเรา', () => {
    const s = setup();
    const senju = put(s, 'p1', no('ราชันดอกบัว เซ็นจู'), 2); // Lv2
    put(s, 'p1', no('No.26 แคพิทัลแคพิทัล'), 0);
    put(s, 'p1', no('เจย์ดีห้าชั้นแห่งบัวบาน'), 0);
    expect(extraSymbols(s, db, senju).blue ?? 0).toBe(0);
    s.phase = 'attack';
    expect(extraSymbols(s, db, senju).blue).toBe(2);
  });

  it('เซ็นจู Catalyze: หลังเบิร์ส ทำลายสปิริต/อัลติเมทคู่แข่งคอสต์รวมไม่เกิน 10', () => {
    let s = setup();
    const senju = put(s, 'p1', no('ราชันดอกบัว เซ็นจู'), 2, true);
    const burst = card(s, 'p1', no('No.26 แคพิทัลแคพิทัล'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const big = put(s, 'p2', no('ซันซกคุ-แบร์'), 1); // คอสต์ 5
    const mid = put(s, 'p2', no('ซีโนะบาซุคุ'), 1); // คอสต์ 3
    const small = put(s, 'p2', DARIU, 1); // คอสต์ 1
    s = attack(s, senju);
    s = choose(s, optionIndex(s, 'Catalyze'));
    // เบิร์ส (วางเน็กซัสนี้) → ผู้เล่นวางคอร์ได้
    while (s.choice?.kind === 'placeCores') s = choose(s, { pay: [] });
    expect(s.choice?.kind).toBe('multiCard');
    s = choose(s, { cards: [big, mid, small] });
    for (const id of [big, mid, small]) expect(s.players.p2.trashCards).toContain(id);
  });

  it('นัมบังมุฉะฮาคุไร: สปิริตเผ่า [ผู้เป็นนาย]/[ข้ารับใช้] ของเราไม่ถูกเอฟเฟกต์คู่แข่งนำกลับขึ้นมือ', () => {
    const s = setup();
    put(s, 'p2', no('นัมบังมุฉะฮาคุไร'), 1);
    const master = put(s, 'p2', no('จอมราชันเซ็นโงคุ กิวมอนจิ'), 1); // ผู้เป็นนาย
    const servant = put(s, 'p2', no('บุตรแห่งพยัคฆ์ ไทกะ'), 1); // ข้ารับใช้
    const other = put(s, 'p2', DARIU, 1);
    expect(bounceImmuneSource(s, db, master)).not.toBeNull();
    expect(bounceImmuneSource(s, db, servant)).not.toBeNull();
    expect(bounceImmuneSource(s, db, other)).toBeNull();
  });

  it('เมียวโอบัวม่วง: แอทแท็คสเต็ปของเรา คู่แข่งใช้เบิร์ส/เมจิคที่คอสต์เท่าเน็กซัสของเราไม่ได้', () => {
    const s = setup();
    put(s, 'p1', no('เมียวโอบัวม่วง'), 3); // Lv2
    put(s, 'p1', no('เจย์ดีห้าชั้นแห่งบัวบาน'), 0); // คอสต์ 5
    const magic5 = db.get(no('พันหัตถ์คันนนจู่โจม')); // คอสต์ 5
    const magic6 = db.get(no('ครัชแอนด์บิลด์')); // คอสต์ 6
    expect(magicBanned(s, 'p2', db, magic5)).toBe(false); // เมนสเต็ป
    s.phase = 'attack';
    expect(magicBanned(s, 'p2', db, magic5)).toBe(true);
    expect(magicBanned(s, 'p2', db, magic6)).toBe(false);
    expect(burstBlocked(s, db, 'p2', magic5)).toBe(true);
    expect(burstBlocked(s, db, 'p2', magic6)).toBe(false);
  });

  it('อาบิส-อโพคาลิพส์ [ร่วมร่าง]: คู่แข่งใช้เบิร์ส/เมจิคได้เฉพาะสีเดียวกับสีเจ็มบนฟิลด์ตนเอง', () => {
    const s = setup();
    const host = put(s, 'p1', no('ซันซกคุ-แบร์'), 1);
    const abyss = card(s, 'p1', no('ดาบยักษ์แห่งหุบเหว อาบิส-อโพคาลิพส์'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== abyss);
    s.cards[host]!.braves.push(abyss);
    put(s, 'p2', DARIU, 1); // เจ็มแดงของ p2
    expect(magicBanned(s, 'p2', db, db.get(no('การคำรามแห่งเปลวเพลิง')))).toBe(false); // แดง
    expect(magicBanned(s, 'p2', db, db.get(no('ครัชแอนด์บิลด์')))).toBe(true); // ฟ้า
  });

  it('โอคุริดาระ: ร่วมร่างกับอัลติเมทได้ และ [ร่วมร่าง] ถือว่ามีคอสต์ 2', () => {
    const s = setup();
    const okuri = db.get(no('โอคุริดาระ'));
    const ult = db.get(no('หกขุนศึกเซ็นโงคุ มุโดว'));
    expect(braveFits(okuri, ult)).toBe(true);
    expect(braveFits(db.get(no('ราชาราชสีห์')), ult)).toBe(false);
    const host = put(s, 'p1', no('ซันซกคุ-แบร์'), 1); // คอสต์ 5
    const b = card(s, 'p1', okuri.cardNo, 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== b);
    s.cards[host]!.braves.push(b);
    expect(fieldCost(s, db, host)).toBe(7);
  });

  it('แคพิทัลแคพิทัล: สปิริตคู่แข่งที่ไม่มีโซลคอร์ต้องส่งคอร์ในรีเสิร์ฟลงแทรชเพื่อโจมตี (+1 ถ้ามีโซลบนเน็กซัส)', () => {
    let s = setup();
    put(s, 'p2', no('No.26 แคพิทัลแคพิทัล'), 1, true);
    const atk = put(s, 'p1', DARIU, 1);
    const trash = s.players.p1.trashCores.length;
    s = attack(s, atk);
    expect(s.players.p1.trashCores.length - trash).toBe(2);
    expect(s.battle?.attackerId).toBe(atk);
    // รีเสิร์ฟไม่พอ = โจมตีไม่ได้
    const t = setup();
    put(t, 'p2', no('No.26 แคพิทัลแคพิทัล'), 0);
    const a2 = put(t, 'p1', DARIU, 1);
    t.players.p1.trashCores.push(...t.players.p1.reserve);
    t.players.p1.reserve = [];
    t.phase = 'attack';
    expect(canAttackWith(t, db, a2)).toBe(false);
  });

  it('มุฉะริว รินโดว: มีโซลคอร์ = [เอฟเฟกต์ทำลาย BP] ของเรา +5000 (รวม BP รวมไม่เกิน)', () => {
    let s = setup();
    put(s, 'p1', no('มุฉะริว รินโดว'), 3, true); // Lv2
    const foe = put(s, 'p2', DARIU, 5); // BP 8000? (Lv3)
    s = useMagic(s, 'การคำรามแห่งเปลวเพลิง'); // ทำลาย BP ≤3000 ทั้งหมด → +5000 = 8000
    expect(s.players.p2.trashCards).toContain(foe);
  });

  it('เมลสตอร์ม Charge: [เอฟเฟกต์ทิ้งเด็คคู่แข่ง] ของเรา +1', () => {
    let s = setup();
    const host = put(s, 'p1', no('โดจิ ห้ามงคล'), 1, true);
    const mel = card(s, 'p1', no('ดาบยักษ์ทะเลคราม เมลสตอร์ม'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== mel);
    s.cards[host]!.braves.push(mel);
    const deck = s.players.p2.deck.length;
    s.queue = [{ controller: 'p1', sourceId: host, steps: [{ do: 'mill', count: 2 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(deck - s.players.p2.deck.length).toBe(3);
  });

  it('โอโอจิโระไทเกอร์: สปิริตเราที่มีโซลคอร์ถือว่าเป็น Lv สูงสุด', () => {
    const s = setup();
    put(s, 'p1', no('โอโอจิโระไทเกอร์'), 1);
    const withSoul = put(s, 'p1', DARIU, 1, true);
    const plain = put(s, 'p1', DARIU, 1);
    expect(cardLevel(s, db, withSoul)).toBe(3);
    expect(cardLevel(s, db, plain)).toBe(1);
  });

  it('กันดาละ-ไฮดรา Assault (เมื่อโจมตี): เสื่อมสภาพเน็กซัสเพื่อฟื้นสภาพ · Lv2 นำเน็กซัสในแทรชกลับขึ้นมือแทนได้', () => {
    let s = setup();
    const hydra = put(s, 'p1', no('กันดาละ-ไฮดรา'), 2); // Lv2
    const nx = card(s, 'p1', no('No.26 แคพิทัลแคพิทัล'), 'trashCards');
    s = attack(s, hydra);
    // Assault = "เมื่อสปิริตนี้โจมตี" (ไม่ใช่ Flash): ถามทันทีตอนประกาศโจมตี
    expect(s.choice?.kind).toBe('option');
    expect(s.cards[hydra]!.state).toBe('exhausted');
    s = choose(s, optionIndex(s, 'แทรช'));
    if (s.choice?.kind === 'card') s = choose(s, nx);
    expect(s.players.p1.hand).toContain(nx);
    expect(s.cards[hydra]!.state).toBe('refresh');
  });

  it('จอมราชันกิวมอนจิ: เบิร์ส "หลังจาก [เมื่ออัญเชิญ] ของคู่แข่งทำงาน" ทำลายสปิริตคู่แข่ง BP รวมไม่เกิน 20000', () => {
    let s = setup();
    const burst = card(s, 'p2', no('จอมราชันเซ็นโงคุ กิวมอนจิ'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== burst);
    s.players.p2.burst = burst;
    const foe = put(s, 'p2', DARIU, 1);
    void foe;
    const target = put(s, 'p1', DARIU, 5);
    s = summon(s, card(s, 'p1', no('ซีโนะบาซุคุ'), 'hand'));
    if (s.choice?.kind === 'card' && s.choice.player === 'p1') s = choose(s, foe);
    expect(s.choice?.kind === 'option' && s.choice.player === 'p2' && optionIndex(s, 'เปิด Burst') >= 0).toBe(true);
    s = choose(s, optionIndex(s, 'เปิด Burst'));
    expect(s.choice?.kind).toBe('multiCard');
    s = choose(s, { cards: [target] });
    expect(s.players.p1.trashCards).toContain(target);
  });

  it('ไชนิ่ง-ซอร์ด: ทำลาย BP≤3000 ทั้งหมด แล้วจั่วต่อตัวที่ทำลาย', () => {
    let s = setup();
    put(s, 'p2', DARIU, 1);
    put(s, 'p2', DARIU, 1);
    const hand = s.players.p1.hand.length;
    s = summon(s, card(s, 'p1', no('ดาบศักดิ์สิทธิ์แห่งแสง ไชนิ่ง-ซอร์ด'), 'hand'));
    expect(s.players.p2.field.filter((id) => s.cards[id]!.cardNo === DARIU)).toHaveLength(0);
    expect(s.players.p1.hand.length).toBe(hand + 2);
  });

  it('ดาบเจ้าวารี จูซุมารุ: [ร่วมร่าง] แอทแท็คสเต็ปของเรา ผู้ร่วมร่างเป็น Lv สูงสุด', () => {
    const s = setup();
    const host = put(s, 'p1', no('ซันซกคุ-แบร์'), 1);
    const juzu = card(s, 'p1', no('ดาบเจ้าวารี จูซุมารุ'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== juzu);
    s.cards[host]!.braves.push(juzu);
    expect(cardLevel(s, db, host)).toBe(1);
    s.phase = 'attack';
    expect(cardLevel(s, db, host)).toBe(3);
  });

  it('No.6 เมาท์เทนเชพ: มีเบิร์สเซ็ทอยู่ = เจ็มแดง +1', () => {
    const s = setup();
    const nx = put(s, 'p1', no('No.6 เมาท์เทนเชพ'), 0);
    expect(extraSymbols(s, db, nx).red ?? 0).toBe(0);
    const b = card(s, 'p1', DARIU, 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== b);
    s.players.p1.burst = b;
    expect(extraSymbols(s, db, nx).red).toBe(1);
  });

  it('ทรูธ-อีเด็นอัญเชิญปกติจากมือได้ (จ่ายอย่างน้อย 1)', () => {
    const s = setup();
    const truth = card(s, 'p1', no('ดาบแห่งการพิพากษาที่แท้จริง ทรูธ-อีเด็น'), 'hand');
    expect(fails(s, { type: 'summon', player: 'p1', cardId: truth, payment: [], placement: normalCores(s).slice(0, 1) })).toBe('WRONG_PAYMENT');
  });

  it('มิสึรุกิ Catalyze: ต่อสปิริตคู่แข่งที่ถูกทำลายโดยเบิร์สนั้น ส่งไลฟ์คู่แข่ง 1 เม็ดลงรีเสิร์ฟ', () => {
    let s = setup();
    const mitsu = put(s, 'p1', no('มังกรยุทธ์ดาบศักดิ์สิทธิ์ มิสึรุกิ-ดราก้อน'), 2, true); // Lv2
    const burst = card(s, 'p1', no('ราชาราชสีห์'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 3);
    const life = s.players.p2.life.length;
    s = attack(s, mitsu);
    s = choose(s, optionIndex(s, 'Catalyze'));
    for (let i = 0; i < 10 && s.choice; i++) {
      const c = s.choice;
      if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(a)) s = choose(s, a);
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(b)) s = choose(s, b);
      else if (c.kind === 'card') s = choose(s, null);
      else if (c.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, c.min) });
      else break;
    }
    expect(s.players.p2.trashCards).toEqual(expect.arrayContaining([a, b]));
    expect(life - s.players.p2.life.length).toBe(2);
  });

  it('มิสึรุกิ Catalyze กิวมอนจิ (ทำลาย แล้วอัญเชิญตัวเอง): ส่งไลฟ์ตามจำนวนที่ทำลาย · คุจาคุเมียวโอของคู่แข่งไม่เปิด', () => {
    let s = setup();
    const mitsu = put(s, 'p1', no('มังกรยุทธ์ดาบศักดิ์สิทธิ์ มิสึรุกิ-ดราก้อน'), 2, true); // Lv2
    const burst = card(s, 'p1', no('จอมราชันเซ็นโงคุ กิวมอนจิ'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const oppBurst = card(s, 'p2', no('คุจาคุเมียวโอ'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== oppBurst);
    s.players.p2.burst = oppBurst;
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 3);
    const life = s.players.p2.life.length;
    s = attack(s, mitsu);
    s = choose(s, optionIndex(s, 'Catalyze'));
    const seen: string[] = [];
    for (let i = 0; i < 20 && s.choice; i++) {
      const c = s.choice;
      seen.push(`${c.player}:${c.kind}:${'prompt' in c ? c.prompt : ''}`);
      if (c.kind === 'multiCard') s = choose(s, { cards: (c as { candidates: string[] }).candidates.filter((x) => x === a || x === b) });
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(a)) s = choose(s, a);
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(b)) s = choose(s, b);
      else if (c.kind === 'card') s = choose(s, null);
      else if (c.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, c.min) });
      else if (c.kind === 'option' && c.player === 'p2') s = choose(s, 0);
      else break;
    }
    expect(s.players.p2.trashCards, seen.join('\n')).toEqual(expect.arrayContaining([a, b]));
    expect(life - s.players.p2.life.length, seen.join('\n')).toBe(2);
    expect(s.players.p2.burst, seen.join('\n')).toBe(oppBurst);
  });

  it('มิสึรุกิ Catalyze เจย์ดีห้าชั้นแห่งบัวบาน (เน็กซัส: ทำลายคอสต์ไม่เกิน 4): ส่งไลฟ์ตามจำนวนที่ทำลาย · คุจาคุเมียวโอของคู่แข่งไม่เปิด', () => {
    let s = setup();
    const mitsu = put(s, 'p1', no('มังกรยุทธ์ดาบศักดิ์สิทธิ์ มิสึรุกิ-ดราก้อน'), 2, true); // Lv2
    const burst = card(s, 'p1', no('เจย์ดีห้าชั้นแห่งบัวบาน'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const oppBurst = card(s, 'p2', no('คุจาคุเมียวโอ'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== oppBurst);
    s.players.p2.burst = oppBurst;
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 3);
    const life = s.players.p2.life.length;
    s = attack(s, mitsu);
    s = choose(s, optionIndex(s, 'Catalyze'));
    const seen: string[] = [];
    for (let i = 0; i < 20 && s.choice; i++) {
      const c = s.choice;
      seen.push(`${c.player}:${c.kind}:${'prompt' in c ? c.prompt : ''}`);
      if (c.kind === 'multiCard') s = choose(s, { cards: (c as { candidates: string[] }).candidates.filter((x) => x === a || x === b) });
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(a)) s = choose(s, a);
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(b)) s = choose(s, b);
      else if (c.kind === 'card') s = choose(s, null);
      else if (c.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, c.min) });
      else if (c.kind === 'option' && c.player === 'p2') s = choose(s, 0);
      else break;
    }
    expect(s.players.p2.trashCards, seen.join('\n')).toContain(a);
    expect(life - s.players.p2.life.length, seen.join('\n')).toBe(1);
    expect(s.players.p2.burst, seen.join('\n')).toBe(oppBurst);
  });

  it('มิสึรุกิ Catalyze โกวเท็น (ทำลาย แล้วอัญเชิญเบรฟร่วมร่าง): ส่งไลฟ์ 1 · คุจาคุเมียวโอของคู่แข่งไม่เปิด', () => {
    let s = setup();
    const mitsu = put(s, 'p1', no('มังกรยุทธ์ดาบศักดิ์สิทธิ์ มิสึรุกิ-ดราก้อน'), 2, true); // Lv2
    const burst = card(s, 'p1', no('ดาบมังกรเกราะ โกวเท็น'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const oppBurst = card(s, 'p2', no('คุจาคุเมียวโอ'), 'hand');
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== oppBurst);
    s.players.p2.burst = oppBurst;
    const a = put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    s = attack(s, mitsu);
    s = choose(s, optionIndex(s, 'Catalyze'));
    const seen: string[] = [];
    for (let i = 0; i < 20 && s.choice; i++) {
      const c = s.choice;
      seen.push(`${c.player}:${c.kind}:${'prompt' in c ? c.prompt : ''}:${JSON.stringify((c as { options?: unknown }).options ?? (c as { candidates?: unknown }).candidates ?? '')}`);
      if (c.kind === 'option' && c.player === 'p1') s = choose(s, optionIndex(s, 'ทำลายสปิริต') >= 0 ? optionIndex(s, 'ทำลายสปิริต') : 0);
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(a)) s = choose(s, a);
      else if (c.kind === 'card' && c.player === 'p1' && c.candidates.includes(mitsu)) s = choose(s, mitsu);
      else if (c.kind === 'card') s = choose(s, null);
      else if (c.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, c.min) });
      else if (c.kind === 'option' && c.player === 'p2') s = choose(s, 0);
      else break;
    }
    seen.push('remaining choice: ' + JSON.stringify(s.choice));
    expect(s.players.p2.trashCards, seen.join('\n')).toContain(a);
    expect(life - s.players.p2.life.length, seen.join('\n')).toBe(1);
    // ไลฟ์ที่หายจากเอฟเฟกต์ "เมื่อโจมตี" ไม่ใช่ความเสียหายจากการโจมตี (หน้าเว็บไม่เล่นท่าวิ่งชน)
    expect(s.log.filter((e) => e.type === 'lifeLost').every((e) => e.type === 'lifeLost' && !e.attack)).toBe(true);
    expect(s.battle?.step).not.toBe(undefined);
    expect(s.players.p2.burst, seen.join('\n')).toBe(oppBurst);
  });

  it('ทำลายเบรฟที่ร่วมร่างของคู่แข่ง: คู่แข่งมีการ์ดบนสนามหลายใบก็ไม่พัง (พบจากบอทเล่นกันเอง)', () => {
    let s = setup();
    put(s, 'p2', DARIU, 1); // การ์ดใบแรกที่ไม่มีเบรฟ
    const host = put(s, 'p2', no('มังกรยุทธ์ดาบศักดิ์สิทธิ์ มิสึรุกิ-ดราก้อน'), 2);
    const brave = `t12-brave-${++seq}`;
    s.cards[brave] = { id: brave, cardNo: no('ดาบมังกรเกราะ โกวเท็น'), owner: 'p2', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(brave);
    s = useMagic(s, 'ผ่าสังหารทำลายล้างแห่งเปลวเพลิง');
    if (s.choice?.kind === 'card' && (s.choice as { candidates: string[] }).candidates.includes(brave)) s = choose(s, brave);
    expect(s.cards[host]!.braves).toEqual([]);
    expect(s.players.p2.trashCards).toContain(brave);
  });

  it('โจมตีไม่ถูกป้องกันแล้วเสียไลฟ์: event lifeLost ติด attack', () => {
    let s = setup();
    const atk = put(s, 'p1', DARIU, 1);
    s = attack(s, atk);
    s = passAll(s);
    if (s.battle) s = passAll(act(s, { type: 'noBlock', player: 'p2' }));
    const lost = s.log.filter((e) => e.type === 'lifeLost');
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ player: 'p2', amount: 1, attack: true });
  });

  it('กติกา 06 ข้อ 3.3: "เมื่อเน็กซัสนี้ถูกวาง" ไม่เปิดเบิร์ส "หลังจาก [เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ] ของคู่แข่งทำงาน" · สปิริตยังเปิดได้', () => {
    const base = setup();
    const oppBurst = card(base, 'p2', no('คุจาคุเมียวโอ'), 'hand');
    base.players.p2.hand = base.players.p2.hand.filter((id) => id !== oppBurst);
    base.players.p2.burst = oppBurst;
    // วางเน็กซัส No.32 ไอส์แลนด์รูท (เมื่อเน็กซัสนี้ถูกวาง: จั่ว 1 ใบ)
    let s = structuredClone(base);
    const nx = card(s, 'p1', no('No.32 ไอส์แลนด์รูท'), 'hand');
    const hand = s.players.p1.hand.length;
    const cost = payableCost(s, db, 'p1', db.get(no('No.32 ไอส์แลนด์รูท')));
    s = act(s, { type: 'deployNexus', player: 'p1', cardId: nx, payment: normalCores(s).slice(0, cost), placement: [] });
    expect(s.players.p1.hand.length).toBe(hand); // ใช้ไป 1 จั่วมา 1
    expect(s.choice?.player).not.toBe('p2');
    expect(s.players.p2.burst).toBe(oppBurst);
    // สปิริตที่มี "เมื่อสปิริตนี้ถูกอัญเชิญ" (ชูร่า): คู่แข่งได้ตัดสินใจเปิดเบิร์ส
    s = structuredClone(base);
    s = summon(s, card(s, 'p1', no('เมียวโอดาบศักดิ์สิทธิ์ ชูร่า'), 'hand'), 1);
    expect(s.choice?.player).toBe('p2');
  });

  it('No.6 เมาท์เทนเชพ Lv2: แอทแท็คสเต็ปของคู่แข่ง ย้ายโซลคอร์ไปสปิริตเรา แล้วทำลายสปิริตคู่แข่งที่ BP ไม่เกินตัวนั้น', () => {
    let s = setup();
    const nx = put(s, 'p2', no('No.6 เมาท์เทนเชพ'), 2, true); // Lv2 มีโซลคอร์
    const ally = put(s, 'p2', DARIU, 3); // BP 6000 → +โซล = 4 คอร์
    const atk = put(s, 'p1', DARIU, 3);
    s = attack(s, atk);
    expect(s.battle?.flash?.priority).toBe('p2');
    s = act(s, { type: 'activate', player: 'p2', cardId: nx, source: 1 });
    s = choose(s, ally);
    if (s.choice?.kind === 'card') s = choose(s, atk);
    expect(s.players.p1.trashCards).toContain(atk);
    expect(s.cards[ally]!.cores.some((c) => s.cores[c]!.isSoul)).toBe(true);
  });

  it('โดจิ นาคาเหลือง: เน็กซัสของเราถูกคู่แข่งทำลาย → คอร์วอยด์ 2 เม็ดบนสปิริตนี้', () => {
    let s = setup();
    const naga = put(s, 'p2', no('โดจิ นาคาเหลือง'), 1);
    const nx = put(s, 'p2', no('No.26 แคพิทัลแคพิทัล'), 0);
    s = useMagic(s, 'ท่าฟันดาบสะบั้นเพลิงสวรรค์');
    if (s.choice?.kind === 'card') s = choose(s, nx);
    expect(s.players.p2.trashCards).toContain(nx);
    expect(s.cards[naga]!.cores).toHaveLength(3);
  });

  it('โอคุริดาระ (ในแทรช): อัลติเมทคอสต์ 8 ของเราถูกอัญเชิญ → กลับขึ้นมือ', () => {
    let s = setup();
    const okuri = card(s, 'p1', no('โอคุริดาระ'), 'trashCards');
    s.players.p1.life = s.players.p1.life.slice(0, 3); // เงื่อนไขอัญเชิญ: ไลฟ์ไม่เกิน 3
    s.players.p1.reserve.push(...Array.from({ length: 10 }, (_, i) => {
      const id = 't12-extra-' + i;
      s.cores[id] = { id, owner: 'p1', isSoul: false };
      return id;
    }));
    s = summon(s, card(s, 'p1', no('หกขุนศึกเซ็นโงคุ มุโดว'), 'hand'), 3);
    expect(s.players.p1.hand).toContain(okuri);
  });

  it('ดาบเจ้าวารี จูซุมารุ (เบิร์ส): ดูมือคู่แข่ง แล้วทิ้งการ์ดเมจิค 1 ใบ', () => {
    let s = setup();
    const burst = card(s, 'p1', no('ดาบเจ้าวารี จูซุมารุ'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== burst);
    s.players.p1.burst = burst;
    const magic = card(s, 'p2', no('ครัชแอนด์บิลด์'), 'hand');
    s.queue = [{ controller: 'p1', sourceId: burst, steps: [{ do: 'peekHandDiscard', count: 1, filter: { types: ['magic'] } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice?.kind).toBe('card');
    expect((s.choice as { candidates: string[] }).candidates).toEqual([magic]);
    s = choose(s, magic);
    expect(s.players.p2.trashCards).toContain(magic);
  });
  it('Assault: N ใช้ได้เทิร์นละไม่เกิน N ครั้ง (เมียวโอหมัดเหล็ก Assault: 3 · ครั้งที่ 4 ไม่ถาม)', () => {
    let s = setup();
    const fist = put(s, 'p1', no('เมียวโอหมัดเหล็ก'), 3); // Lv2
    for (let i = 0; i < 4; i++) put(s, 'p1', no('No.26 แคพิทัลแคพิทัล'), 0);
    s = act(s, { type: 'endMain', player: 'p1' });
    for (let i = 0; i < 4; i++) {
      s = act(s, { type: 'declareAttack', player: 'p1', attackerId: fist });
      if (i < 3) {
        expect(s.choice?.kind, `ครั้งที่ ${i + 1}`).toBe('option');
        s = choose(s, optionIndex(s, 'เสื่อมสภาพเน็กซัส'));
        if (s.choice?.kind === 'card') s = choose(s, (s.choice as { candidates: string[] }).candidates[0]!);
        expect(s.cards[fist]!.state).toBe('refresh');
      } else expect(s.choice).toBeNull();
      s = passAll(s);
      if (s.battle) s = passAll(act(s, { type: 'noBlock', player: 'p2' }));
    }
  });
});
