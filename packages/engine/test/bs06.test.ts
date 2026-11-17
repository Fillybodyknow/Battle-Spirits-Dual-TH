import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, blockersFor, createGame, currentBp, payableCost, type Action, type GameState, type PlayerId } from '../src';

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
  const id = `t6-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t6-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `t6-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].hand.push(id);
  return id;
}
function brave(s: GameState, host: string, name: string): string {
  const owner = s.cards[host]!.owner;
  const id = inHand(s, owner, no(name));
  s.players[owner].hand = s.players[owner].hand.filter((x) => x !== id);
  s.cards[host]!.braves.push(id);
  return id;
}
function soulInTrash(s: GameState, player: PlayerId): string {
  const id = `t6-core-${++seq}`;
  s.cores[id] = { id, owner: player, isSoul: true };
  s.players[player].trashCores.push(id);
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
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
/** ใช้เมจิคจากมือ (จ่ายด้วยคอร์ปกติในรีเสิร์ฟ) */
const useMagic = (s: GameState, player: PlayerId, cardId: string, timing: 'main' | 'flash' = 'flash') => {
  const cost = payableCost(s, db, player, db.get(s.cards[cardId]!.cardNo));
  return act(s, { type: 'useMagic', player, cardId, payment: normalCores(s, player).slice(0, cost), timing });
};

describe('Booster Set 06', () => {
  it('Kagemusha: สปิริตที่มี Soul Core ตกเป็นเป้า → อัญเชิญ S23 จากมือ (จ่ายคอสต์) แล้วเอฟเฟกต์ต้องเล็ง S23 แทน', () => {
    let s = setup();
    const target = put(s, 'p2', DARIU, 1, true);
    const s23 = inHand(s, 'p2', no('นักรบเครื่องกล S23'));
    const tatami = inHand(s, 'p1', no('เคล็ดวิชาพลิกเสื่อทาทามิ'));
    s = useMagic(s, 'p1', tatami);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    s = choose(s, target);
    // ฝ่ายถูกเล็งเลือกใช้ Kagemusha
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'อัญเชิญ'));
    expect(s.choice).toMatchObject({ kind: 'payCost', player: 'p2' });
    const cost = (s.choice as { cost: number }).cost;
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, cost) });
    expect(s.choice).toMatchObject({ kind: 'placeCores', player: 'p2' });
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.players.p2.field).toContain(s23);
    // เอฟเฟกต์ต้องเล็ง S23
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1', candidates: [s23] });
    s = choose(s, s23);
    expect(s.cards[s23]!.state).toBe('exhausted');
    expect(s.cards[target]!.state).toBe('refresh');
  });

  it('Kagemusha: ไม่ใช้ = เป้าเดิม · ไม่มี Soul Core = ไม่ถาม', () => {
    let s = setup();
    const target = put(s, 'p2', DARIU, 1, true);
    const plain = put(s, 'p2', DARIU, 1);
    inHand(s, 'p2', no('นักรบเครื่องกล S23'));
    const tatami = inHand(s, 'p1', no('เคล็ดวิชาพลิกเสื่อทาทามิ'));
    s = useMagic(s, 'p1', tatami);
    s = choose(s, target);
    s = choose(s, optionIndex(s, 'ไม่ใช้'));
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [target] });
    s = choose(s, target);
    expect(s.cards[target]!.state).toBe('exhausted');
    // ตัวที่ไม่มี Soul Core: ไม่เปิด Kagemusha
    let t = setup();
    const plain2 = put(t, 'p2', DARIU, 1);
    inHand(t, 'p2', no('นักรบเครื่องกล S23'));
    const tatami2 = inHand(t, 'p1', no('เคล็ดวิชาพลิกเสื่อทาทามิ'));
    t = useMagic(t, 'p1', tatami2);
    t = choose(t, plain2);
    expect(t.cards[plain2]!.state).toBe('exhausted');
    expect(plain).toBeTruthy();
  });

  it('Kagemusha ดูดเอฟเฟกต์มาหมด (กติกา 14 Kagemusha ข้อ 2): เสื่อมสภาพ 2 ตัว → เป้าที่เหลือต้องเป็น S23 ซึ่งเสื่อมสภาพไปแล้ว = จบ', () => {
    let s = setup();
    const host = put(s, 'p1', no('ผู้นำมารวายุ ชิโนบิโอว'), 1);
    brave(s, host, 'ดาบคู่แห่งวายุกรรโชก คามุย-ฮายาเตะ');
    put(s, 'p1', no('ดาบคู่แห่งวายุกรรโชก คามุย-ฮายาเตะ'), 1); // Charge +1 = เสื่อมสภาพ 2 ตัว
    const soul = put(s, 'p2', DARIU, 1, true);
    const plain = put(s, 'p2', DARIU, 1);
    const s23 = inHand(s, 'p2', no('นักรบเครื่องกล S23'));
    s = attack(s, host);
    s = choose(s, soul);
    s = choose(s, optionIndex(s, 'อัญเชิญ'));
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, (s.choice as { cost: number }).cost) });
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [s23] });
    s = choose(s, s23);
    expect(s.choice?.kind).not.toBe('card');
    expect(s.cards[s23]!.state).toBe('exhausted');
    expect(s.cards[soul]!.state).toBe('refresh');
    expect(s.cards[plain]!.state).toBe('refresh');
  });

  it('Kagemusha: โดนตีระบุ (เลือกผู้ป้องกัน) → อัญเชิญ S23 แล้ว S23 เป็นผู้ป้องกันแทน', () => {
    let s = setup();
    const shuwkai = put(s, 'p1', no('ชิคิงามิ ชูวไค'), 1); // เมื่อโจมตี: ตีระบุสปิริตคอร์ไม่เกิน 2
    const target = put(s, 'p2', DARIU, 1, true);
    const s23 = inHand(s, 'p2', no('นักรบเครื่องกล S23'));
    s = attack(s, shuwkai);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    s = choose(s, target);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, optionIndex(s, 'อัญเชิญ'));
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, (s.choice as { cost: number }).cost) });
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1', candidates: [s23] });
    s = choose(s, s23);
    expect(s.battle?.blockers ?? s.battle?.chosenBlockers).toContain(s23);
    expect(s.battle?.blockers).not.toContain(target);
  });

  it('ไทคูน: สปิริตเผ่าข้ารับใช้ไม่มี Soul Core ก็ใช้ Kagemusha ได้ · อู่พิทักษ์สวรรค์: เสื่อมสภาพเน็กซัสเพื่ออัญเชิญไม่จ่ายคอสต์', () => {
    let s = setup();
    put(s, 'p2', no('จอมทัพใหญ่จักรกล ไทคูน'), 1);
    const servant = put(s, 'p2', no('สุนัขเครื่องกล คิชูด็อก'), 1); // ข้ารับใช้ (ชีลด์แดง/ม่วง/ฟ้า ไม่กันเขียว)
    const gate = put(s, 'p2', no('อู่พิทักษ์สวรรค์'), 0);
    const lancer = inHand(s, 'p2', no('แปดอัศวินเก็นจิ ทสึคิดาสุ แลนเซอร์'));
    const tatami = inHand(s, 'p1', no('เคล็ดวิชาพลิกเสื่อทาทามิ'));
    s = useMagic(s, 'p1', tatami);
    s = choose(s, servant);
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    const reserveBefore = s.players.p2.reserve.length;
    s = choose(s, optionIndex(s, 'ไม่จ่ายคอสต์'));
    expect(s.cards[gate]!.state).toBe('exhausted');
    expect(s.choice).toMatchObject({ kind: 'placeCores', player: 'p2' });
    s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.players.p2.reserve.length).toBe(reserveBefore - 1); // ไม่ได้จ่ายคอสต์ วางแค่ Core กำหนด Lv
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [lancer] });
  });

  it('ทาเนงาชิมะ: เด็คของผู้เล่นทุกคนไม่ถูกทิ้ง', () => {
    let s = setup();
    put(s, 'p2', no('ทหารจักรกลพลปืนยาว ทาเนงาชิมะ'), 1);
    const doji = put(s, 'p1', no('โดจิทะเลฟ้า'), 1);
    const deck = s.players.p2.deck.length;
    s = attack(s, doji);
    expect(s.players.p2.deck.length).toBe(deck);
  });

  it('คิชูด็อก: จั่ว 2 ใบในครั้งเดียวโดยเอฟเฟกต์ → การ์ดบนสนามและในมือทั้งหมดของฝ่ายนั้นไปใต้สุดเด็ค', () => {
    let s = setup();
    put(s, 'p2', no('สุนัขเครื่องกล คิชูด็อก'), 1);
    const mine = put(s, 'p1', DARIU, 2);
    const draw2 = inHand(s, 'p1', no('ดับเบิ้ลดรอว์'));
    const deck = s.players.p1.deck.length;
    const hand = s.players.p1.hand.length; // รวมดับเบิ้ลดรอว์
    s = useMagic(s, 'p1', draw2, 'main');
    expect(s.players.p1.field).toHaveLength(0);
    expect(s.players.p1.hand).toHaveLength(0);
    expect(s.players.p1.deck).toContain(mine);
    // เด็ค: -2 (จั่ว) + การ์ดในมือ (ไม่รวมเมจิคที่ใช้) + 2 ใบที่จั่ว + สนาม 1
    expect(s.players.p1.deck.length).toBe(deck - 2 + (hand - 1) + 2 + 1);
  });

  it('ฮาคุโดวโทคาเงะ Lv2: คู่แข่งอัญเชิญสปิริตคอสต์ไม่เกิน 3 ใช้สัญลักษณ์ลดคอสต์ไม่ได้', () => {
    const s = setup();
    put(s, 'p1', DARIU, 1); // เจ็มแดง 1: ปกติดาริวคอสต์ 0
    expect(payableCost(s, db, 'p1', db.get(DARIU))).toBe(0);
    put(s, 'p2', no('ฮาคุโดวโทคาเงะ'), 2);
    expect(payableCost(s, db, 'p1', db.get(DARIU))).toBe(1);
  });

  it('ไคโดว ทสึโนะชิงะ: รวมร่างกับเบรฟได้ 2 ใบ · Lv2 รวมร่าง 2 ใบ: จบการต่อสู้แล้วฟื้นสภาพ', () => {
    let s = setup();
    const kaido = put(s, 'p1', no('ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ'), 3);
    const b1 = put(s, 'p1', no('โฮทารุมารุ'), 1);
    const b2 = put(s, 'p1', no('อิจิโกะฮิโทฟุริ'), 1);
    const b3 = put(s, 'p1', no('อสูรเกราะกระดอง คาบุโตะกาเมะ'), 1);
    s = act(s, { type: 'brave', player: 'p1', braveId: b1, hostId: kaido });
    s = act(s, { type: 'brave', player: 'p1', braveId: b2, hostId: kaido });
    expect(s.cards[kaido]!.braves).toHaveLength(2);
    expect(fails(s, { type: 'brave', player: 'p1', braveId: b3, hostId: kaido })).not.toBe('ok');
    s = attack(s, kaido);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.cards[kaido]!.state).toBe('refresh');
  });

  it('คราวน์-โซลาร์ (Charge): เอฟเฟกต์ฟื้นสภาพของเรา +1 ตัว → ร่วมร่างโจมตี ฟื้นสภาพสปิริตที่ไม่ได้รวมร่าง 2 ตัว', () => {
    let s = setup();
    const host = put(s, 'p1', no('แปดอัศวินเก็นจิ ฮิสะมารุ บัสเตอร์'), 1);
    brave(s, host, 'ดาบแสงแห่งนภา คราวน์-โซลาร์');
    const a = put(s, 'p1', DARIU, 1, false, 'exhausted');
    const b = put(s, 'p1', DARIU, 1, false, 'exhausted');
    s = attack(s, host);
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p1' });
    s = choose(s, a);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [b] });
    s = choose(s, b);
    expect(s.cards[a]!.state).toBe('refresh');
    expect(s.cards[b]!.state).toBe('refresh');
  });

  it('คามุย-ฮายาเตะ: Charge เสื่อมสภาพ +1 ตัว · เสื่อมสภาพได้ตั้งแต่ 3 ตัว → ผู้ร่วมร่างฟื้นสภาพ', () => {
    let s = setup();
    const host = put(s, 'p1', no('ผู้นำมารวายุ ชิโนบิโอว'), 1); // คอสต์ 6
    brave(s, host, 'ดาบคู่แห่งวายุกรรโชก คามุย-ฮายาเตะ');
    put(s, 'p1', no('ดาบคู่แห่งวายุกรรโชก คามุย-ฮายาเตะ'), 1); // อยู่เดี่ยว Lv1: Charge +1
    put(s, 'p1', no('ดาบคู่แห่งวายุกรรโชก คามุย-ฮายาเตะ'), 1);
    const t1 = put(s, 'p2', DARIU, 1);
    const t2 = put(s, 'p2', DARIU, 1);
    const t3 = put(s, 'p2', DARIU, 1);
    s = attack(s, host);
    for (const t of [t1, t2, t3]) s = choose(s, t);
    expect([t1, t2, t3].every((t) => s.cards[t]!.state === 'exhausted')).toBe(true);
    expect(s.cards[host]!.state).toBe('refresh');
  });

  it('ลองเคพ: ไลฟ์เสียหายจากสปิริตคู่แข่งได้ 1 เม็ดต่อตัวต่อเทิร์น', () => {
    let s = setup();
    put(s, 'p2', no('No.42 ลองเคพ'), 0);
    const host = put(s, 'p1', no('ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ'), 1);
    brave(s, host, 'อสูรเกราะกระดอง คาบุโตะกาเมะ'); // เจ็ม 2
    const life = s.players.p2.life.length;
    s = attack(s, host);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life.length).toBe(life - 1);
  });

  it('ลิมิเต็ดบาเรีย: ในเทิร์นนี้ไลฟ์ไม่เสียหายจากการโจมตีของสปิริตคอสต์ 4 ขึ้นไป', () => {
    let s = setup();
    const big = put(s, 'p1', no('ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ'), 1);
    const barrier = inHand(s, 'p2', no('ลิมิเต็ดบาเรีย'));
    const life = s.players.p2.life.length;
    s = attack(s, big);
    s = useMagic(s, 'p2', barrier);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.players.p2.life.length).toBe(life);
  });

  it('อิจิโกะฮิโทฟุริ: เริ่มแอทแท็คสเต็ปของคู่แข่ง เลือกสปิริตคู่แข่ง → ต้องโจมตีเป็นใบแรก และผู้ร่วมร่างเข้าป้องกันเอง', () => {
    let s = setup();
    const host = put(s, 'p2', no('ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ'), 1);
    brave(s, host, 'อิจิโกะฮิโทฟุริ');
    const a = put(s, 'p1', DARIU, 1);
    const b = put(s, 'p1', DARIU, 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.choice).toMatchObject({ kind: 'card', player: 'p2' });
    s = choose(s, b);
    expect(fails(s, { type: 'declareAttack', player: 'p1', attackerId: a })).toBe('MUST_ATTACK');
    expect(fails(s, { type: 'endAttackStep', player: 'p1' })).not.toBe('ok');
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: b });
    expect(s.battle?.blockers).toContain(host);
  });

  it('เกรย์ไนท์ (มี Soul Core): การ์ดสปิริตเผ่าวายุนินจาในมือได้รับ [Quick]', () => {
    let s = setup();
    put(s, 'p2', no('มารวายุ เกรย์ไนท์'), 1, true);
    const kanguru = inHand(s, 'p2', no('นินจาเขี้ยวพิศวง คันการุ'));
    const atk = put(s, 'p1', DARIU, 1);
    s = attack(s, atk);
    const cost = payableCost(s, db, 'p2', db.get(no('นินจาเขี้ยวพิศวง คันการุ')));
    const res = normalCores(s, 'p2');
    s = act(s, { type: 'summon', player: 'p2', cardId: kanguru, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) });
    expect(s.players.p2.field).toContain(kanguru);
  });

  it('โอโอชิโอ (Soul Burst): หลังเอฟเฟกต์เมื่ออัญเชิญของคู่แข่งทำงาน · สนามคู่แข่ง 2 สี → เสื่อมสภาพทั้งหมด', () => {
    let s = setup();
    const burst = inHand(s, 'p2', no('นินจาผีเสื้อราตรีสวมเกราะ โอโอชิโอ'));
    s.players.p2.hand = s.players.p2.hand.filter((x) => x !== burst);
    s.players.p2.burst = burst;
    const red = put(s, 'p1', DARIU, 1);
    put(s, 'p2', DARIU, 1); // เป้าของชิมอน
    const shimon = inHand(s, 'p1', no('ผู้ใช้ศาสตร์มายา ชิมอน')); // ม่วง · เมื่ออัญเชิญ: ส่งคอร์คู่แข่ง (บังคับ)
    const cost = payableCost(s, db, 'p1', db.get(no('ผู้ใช้ศาสตร์มายา ชิมอน')));
    const res = normalCores(s);
    s = act(s, { type: 'summon', player: 'p1', cardId: shimon, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) });
    while (s.choice && s.choice.player === 'p1') s = choose(s, (s.choice as { candidates: string[] }).candidates[0]!);
    // p2 ถูกถามเปิดเบิร์ส
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = choose(s, 0);
    while (s.choice?.kind === 'placeCores') s = choose(s, { pay: normalCores(s, 'p2').slice(0, 1) });
    expect(s.cards[red]!.state).toBe('exhausted');
    expect(s.cards[shimon]!.state).toBe('exhausted');
  });

  it('ฟอร์ซโคล์ท [Flash]: นำสปิริตคู่แข่งที่มีเจ็มตั้งแต่ 2 เม็ดกลับขึ้นมือทั้งหมด', () => {
    let s = setup();
    const one = put(s, 'p2', DARIU, 1);
    const two = put(s, 'p2', no('ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ'), 1);
    brave(s, two, 'อสูรเกราะกระดอง คาบุโตะกาเมะ');
    const colt = inHand(s, 'p1', no('ฟอร์ซโคล์ท'));
    s = useMagic(s, 'p1', colt, 'flash');
    expect(s.players.p2.field).toContain(one);
    expect(s.players.p2.hand).toContain(two);
  });

  it('โทคิชาเนะ [Catalyze]: หลังจากเบิร์สนั้นถูกสั่งใช้ นำสปิริตที่มีเบิร์สบนสนามไปเซ็ทเบิร์ส', () => {
    let s = setup();
    const toki = put(s, 'p1', no('นินจามารวายุชั้นสูง โทคิชาเนะ'), 2, true);
    const hakugein = inHand(s, 'p1', no('ป้อมปราการเครื่องกล ฮาคุเกอิน')); // Soul Burst: อัญเชิญตัวเอง
    s.players.p1.hand = s.players.p1.hand.filter((x) => x !== hakugein);
    s.players.p1.burst = hakugein;
    s = attack(s, toki);
    s = choose(s, 0); // Catalyze
    while (s.choice?.kind === 'placeCores') s = choose(s, { pay: normalCores(s).slice(0, 1) });
    expect(s.players.p1.field).toContain(hakugein);
    expect(s.choice).toMatchObject({ kind: 'card', candidates: [hakugein] });
    s = choose(s, hakugein);
    expect(s.players.p1.burst).toBe(hakugein);
  });

  it('อุสึบะคาเงโร่: ชนะและทำลายผู้ป้องกันจากการเทียบ BP → ส่งคอร์ไลฟ์คู่แข่ง 1 เม็ดลงแทรช', () => {
    let s = setup();
    const host = put(s, 'p1', no('แปดอัศวินเก็นจิ ฮิสะมารุ บัสเตอร์'), 1);
    brave(s, host, 'ดาบมารแมลงดำ อุสึบะคาเงโร่');
    const blocker = put(s, 'p2', DARIU, 1);
    const life = s.players.p2.life.length;
    const trash = s.players.p2.trashCores.length;
    s = attack(s, host);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: blocker });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.players.p2.field).not.toContain(blocker);
    expect(s.players.p2.life.length).toBe(life - 1);
    expect(s.players.p2.trashCores.length).toBeGreaterThan(trash);
  });

  it('โอเทนตะ [Flash เมื่อโจมตี]: นำ Soul Core ในแทรชมาวางบนผู้ร่วมร่าง แล้วนำสปิริตคู่แข่งกลับขึ้นมือ', () => {
    let s = setup();
    const host = put(s, 'p1', no('แปดอัศวินเก็นจิ ฮิสะมารุ บัสเตอร์'), 1);
    brave(s, host, 'ดาบเทพธรณี โอเทนตะ');
    const soul = soulInTrash(s, 'p1');
    const target = put(s, 'p2', DARIU, 1);
    s = attack(s, host);
    s = act(s, { type: 'passFlash', player: 'p2' });
    s = act(s, { type: 'activate', player: 'p1', cardId: host, source: 1 });
    expect(s.cards[host]!.cores).toContain(soul);
    s = choose(s, target);
    expect(s.players.p2.hand).toContain(target);
  });

  it('โควจิกิริ [Flash]: ย้ายเบรฟไปสปิริตอื่น (ผู้ร่วมร่างเดิมเสื่อมสภาพ → ตัวใหม่เสื่อมสภาพ กติกา 04 ข้อ 1)', () => {
    let s = setup();
    const host = put(s, 'p1', no('แปดอัศวินเก็นจิ ฮิสะมารุ บัสเตอร์'), 1);
    const kojiki = brave(s, host, 'ดาบปีกวายุ โควจิกิริ');
    const other = put(s, 'p1', no('ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ'), 1);
    s = attack(s, host);
    s = act(s, { type: 'passFlash', player: 'p2' });
    s = act(s, { type: 'activate', player: 'p1', cardId: host, source: 1 });
    s = choose(s, other);
    expect(s.cards[other]!.braves).toContain(kojiki);
    expect(s.cards[host]!.braves).not.toContain(kojiki);
    expect(s.cards[other]!.state).toBe('exhausted');
  });

  it('โทเงะแอนท์: ถูกทำลาย (มี Soul Core) → คอร์วอยด์ 2 เม็ดวางรีเสิร์ฟ', () => {
    let s = setup();
    const ant = put(s, 'p2', no('โทเงะแอนท์'), 1, true);
    const atk = put(s, 'p1', DARIU, 1);
    s = attack(s, atk);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: ant });
    const reserve = s.players.p2.reserve.length;
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.players.p2.trashCards).toContain(ant);
    // Core บนการ์ด 1 (Soul) กลับรีเสิร์ฟ + คอร์วอยด์ 2
    expect(s.players.p2.reserve.length).toBe(reserve + 1 + 2);
  });

  it('ฮาคุเกอิน Lv2: สปิริตเผ่าข้ารับใช้ของเราโจมตี → ไม่ถูกป้องกันโดยสปิริตที่ BP ไม่เกินผู้โจมตี', () => {
    let s = setup();
    put(s, 'p1', no('ป้อมปราการเครื่องกล ฮาคุเกอิน'), 3);
    const servant = put(s, 'p1', no('นักรบเครื่องกล S23'), 1); // BP 5000
    const small = put(s, 'p2', DARIU, 1); // 3000
    const big = put(s, 'p2', DARIU, 5); // 8000
    s = attack(s, servant);
    const blockers = blockersFor(s, db, 'p2');
    expect(blockers).not.toContain(small);
    expect(blockers).toContain(big);
    expect(currentBp(s, db, servant)).toBe(5000);
  });
});
