/**
 * เทสต์จากการตรวจ engine เทียบกติกาใน docs/rules (อ้างเลขไฟล์ + ข้อ)
 */
import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { applyAction, createGame, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadAllCards();
const byName = (name: string) => db.all().find((c) => c.name === name)!.cardNo;

const DARIU = byName('มุฉะดาริว'); // BS01 คอสต์ 1, Lv1 1 3000 / Lv2 3 6000 / Lv3 5 8000, ไม่มีเอฟเฟกต์
const JET = byName('เจ็ทคารูร่า'); // Brave คอสต์ 5 (ลดฟ้า 4), เมื่อเบรฟนี้ถูกอัญเชิญ: จั่ว 2 แล้วทิ้ง 2, ร่วมร่างคอสต์ 1+
const HAWK = byName('เหยี่ยวชุดเกราะ ชุยรัน-ฮอว์ค'); // Brave คอสต์ 1 Flash [Quick], ร่วมร่างคอสต์ 6+
const OGUMA = byName('นักพรตชั่วร้าย โอกุมะ'); // คอสต์ 6, Lv2 (2 คอร์) BP 7000, ถูกทำลายโดยคู่แข่ง: ทิ้งเด็คเรา 4 ใบเพื่อคงอยู่
const KUROHAGANE = byName('ชิโนบิโชกุน คุโระฮางาเนะ'); // Soul Burst: หลังจากสปิริตเราถูกทำลาย/สูญสลายโดยคู่แข่ง

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
function put(s: GameState, player: PlayerId, cardNo: string, cores: number, state: 'refresh' | 'exhausted' = 'refresh'): string {
  const id = `ra-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `ra-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `ra-card-${++seq}`;
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].hand.push(id);
  return id;
}
function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}
function fails(s: GameState, action: Action): string {
  const r = applyAction(s, action, db);
  return r.ok ? 'ok' : r.error.code;
}
/** Core ธรรมดาในรีเสิร์ฟ (ไม่ใช่ Soul Core) */
const normalReserve = (s: GameState, p: PlayerId) => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
const toAttack = (s: GameState) => act(s, { type: 'endMain', player: 'p1' });

describe('กติกา 03 ข้อ 3 / 04: อัญเชิญเบรฟมาร่วมร่างทันที → "เมื่อเบรฟนี้ถูกอัญเชิญ" ทำงาน', () => {
  it('เจ็ทคารูร่าร่วมร่างทันที: จั่ว 2 แล้วทิ้ง 2', () => {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1);
    const jet = inHand(s, 'p1', JET);
    const hand = s.players.p1.hand.length; // รวมเจ็ทคารูร่า
    s = act(s, { type: 'summon', player: 'p1', cardId: jet, payment: normalReserve(s, 'p1').slice(0, 5), placement: [], braveOnto: host });
    expect(s.cards[host]!.braves).toEqual([jet]);
    // จั่ว 2 แล้ว (มือ: เสียเจ็ทคารูร่า 1 ได้ 2) → ต้องเลือกทิ้ง 2
    expect(s.players.p1.hand).toHaveLength(hand - 1 + 2);
    expect(s.choice).toMatchObject({ player: 'p1', sourceId: jet });
  });
});

describe('กติกา 04 สปิริตรวมร่าง ข้อ 1: ฝ่ายใดเสื่อมสภาพ ร่างที่รวมแล้วเสื่อมสภาพ', () => {
  it('ย้ายเบรฟที่ฟื้นสภาพ (อยู่เดี่ยวบนสนาม) ไปแปะสปิริตที่เสื่อมสภาพ: ยังเสื่อมสภาพ โจมตีซ้ำไม่ได้', () => {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1, 'exhausted');
    const jet = put(s, 'p1', JET, 1, 'refresh');
    s = act(s, { type: 'brave', player: 'p1', braveId: jet, hostId: host });
    expect(s.cards[host]!.braves).toEqual([jet]);
    expect(s.cards[host]!.state).toBe('exhausted');
    expect(s.cards[jet]!.state).toBe('exhausted');
    s = toAttack(s);
    expect(fails(s, { type: 'declareAttack', player: 'p1', attackerId: host })).toBe('EXHAUSTED');
  });

  it('เบรฟที่เสื่อมสภาพไปแปะสปิริตที่ฟื้นสภาพ: เสื่อมสภาพ', () => {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1, 'refresh');
    const jet = put(s, 'p1', JET, 1, 'exhausted');
    s = act(s, { type: 'brave', player: 'p1', braveId: jet, hostId: host });
    expect(s.cards[host]!.state).toBe('exhausted');
  });

  it('ทั้งคู่ฟื้นสภาพ: ฟื้นสภาพ', () => {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1, 'refresh');
    const jet = put(s, 'p1', JET, 1, 'refresh');
    s = act(s, { type: 'brave', player: 'p1', braveId: jet, hostId: host });
    expect(s.cards[host]!.state).toBe('refresh');
  });
});

describe('กติกา 06 ข้อ 3.2: สปิริตรอด (ไม่ได้ลงแทรช) → เปิดเบิร์ส "ถูกทำลาย" ไม่ได้', () => {
  /** p1 โจมตีด้วยดาริว Lv3 (BP 8000) · p2 ป้องกันด้วยโอกุมะ Lv2 (BP 7000) ที่ทิ้งเด็คเพื่อคงอยู่ได้ · p2 เซ็ทคุโระฮางาเนะ */
  function battle(): { s: GameState; oguma: string } {
    let s = setup();
    const attacker = put(s, 'p1', DARIU, 5);
    const oguma = put(s, 'p2', OGUMA, 2);
    const burst = inHand(s, 'p2', KUROHAGANE);
    s.players.p2.hand = s.players.p2.hand.filter((id) => id !== burst);
    s.players.p2.burst = burst;
    s = act(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: attacker });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: oguma });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    return { s, oguma };
  }
  const burstOffered = (s: GameState) =>
    s.choice?.kind === 'option' && s.choice.options.some((o: string) => o.includes('เปิด Burst'));

  it('เลือกให้โอกุมะคงอยู่: ไม่ถามเปิดเบิร์ส', () => {
    let { s, oguma } = battle();
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p2' });
    s = act(s, { type: 'choose', player: 'p2', pick: 0 }); // ทิ้งเด็คเรา 4 ใบ: คงอยู่
    expect(s.players.p2.field).toContain(oguma);
    expect(burstOffered(s)).toBe(false);
    expect(s.players.p2.burst).not.toBeNull();
  });

  it('เลือกให้ถูกทำลาย: ลงแทรช แล้วถามเปิดเบิร์สตามปกติ', () => {
    let { s, oguma } = battle();
    s = act(s, { type: 'choose', player: 'p2', pick: 1 }); // ให้ถูกทำลาย
    expect(s.players.p2.trashCards).toContain(oguma);
    expect(burstOffered(s)).toBe(true);
  });
});

describe('กติกา 04: เบรฟที่มี [Quick] อัญเชิญมาร่วมร่างทันทีในแอทแท็คสเต็ปได้', () => {
  it('ชุยรัน-ฮอว์คร่วมร่างกับโอกุมะที่กำลังโจมตี ใน Flash1 (จ่ายจากรีเสิร์ฟ)', () => {
    let s = setup();
    const host = put(s, 'p1', OGUMA, 1);
    const hawk = inHand(s, 'p1', HAWK);
    s = act(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: host });
    // Flash1: ฝ่ายป้องกันได้สิทธิ์ก่อน → ผ่าน
    expect(s.battle?.flash?.priority).toBe('p2');
    s = act(s, { type: 'passFlash', player: 'p2' });
    // จ่ายด้วยคอร์บนสนามไม่ได้ ([Quick] = รีเสิร์ฟเท่านั้น)
    const onHost = s.cards[host]!.cores[0]!;
    expect(fails(s, { type: 'summon', player: 'p1', cardId: hawk, payment: [onHost], placement: [], braveOnto: host })).toBe('RESERVE_ONLY');
    s = act(s, { type: 'summon', player: 'p1', cardId: hawk, payment: normalReserve(s, 'p1').slice(0, 1), placement: [], braveOnto: host });
    expect(s.cards[host]!.braves).toEqual([hawk]);
    expect(s.cards[host]!.state).toBe('exhausted');
    // ใช้การ์ดแล้ว สิทธิ์ส่งให้อีกฝ่าย
    expect(s.battle?.flash).toMatchObject({ priority: 'p2', consecutivePasses: 0 });
  });

  it('เบรฟที่ไม่มี [Quick] ยังร่วมร่างใน Flash ไม่ได้', () => {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1);
    const jet = inHand(s, 'p1', JET);
    s = act(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: host });
    s = act(s, { type: 'passFlash', player: 'p2' });
    expect(fails(s, { type: 'summon', player: 'p1', cardId: jet, payment: normalReserve(s, 'p1').slice(0, 5), placement: [], braveOnto: host })).toBe('WRONG_PHASE');
  });
});

describe('กติกา 11: เอฟเฟกต์ที่เกิดพร้อมกันของทั้งสองฝ่าย เจ้าของเทิร์นเป็นผู้เรียง', () => {
  const FURIN = byName('ฟูริน'); // Lv1 BP 2000, ถูกทำลายโดยคู่แข่ง: นำเมจิคในแทรชขึ้นมือ

  it('BP เท่ากัน ถูกทำลายทั้งคู่: เจ้าของเทิร์น (p1) เลือกลำดับ รวมเอฟเฟกต์ของ p2', () => {
    let s = setup();
    const a = put(s, 'p1', FURIN, 1);
    const b = put(s, 'p2', FURIN, 1);
    s = act(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: a });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    s = act(s, { type: 'declareBlock', player: 'p2', blockerId: b });
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.players.p1.trashCards).toContain(a);
    expect(s.players.p2.trashCards).toContain(b);
    expect(s.choice).toMatchObject({ kind: 'order', player: 'p1' });
    const sources = s.choice?.kind === 'order' ? s.choice.effects.map((e) => e.sourceId) : [];
    expect(sources).toEqual(expect.arrayContaining([a, b]));
    // ให้เอฟเฟกต์ของ p2 ทำงานก่อนได้ (เจ้าของเทิร์นเลือก)
    s = act(s, { type: 'choose', player: 'p1', pick: sources.indexOf(b) });
    expect(s.log.filter((e) => e.type === 'effectResolving').map((e) => (e as { cardId: string }).cardId)[0]).toBe(b);
  });
});

describe('กติกา 04 สปิริตรวมร่าง ข้อ 3: ร่างที่โจมตีหายในแฟลชหลังโจมตี เบรฟที่อยู่ต่อโจมตีต่อ', () => {
  const PALM = byName('ฝ่ามือสังสารซ่อนสาป'); // Flash: (จ่ายด้วยโซลคอร์) ทำลายสปิริตเสื่อมสภาพคอสต์ ≤6

  function setupFusedAttack() {
    let s = setup();
    const host = put(s, 'p1', DARIU, 1);
    const jet = `ra-card-${++seq}`;
    s.cards[jet] = { id: jet, cardNo: JET, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(jet);
    const palm = inHand(s, 'p2', PALM);
    s = act(toAttack(s), { type: 'declareAttack', player: 'p1', attackerId: host });
    // Flash1: p2 ใช้ฝ่ามือฯ จ่ายด้วยโซลคอร์ ทำลายผู้โจมตี
    const soul = s.players.p2.reserve.find((id) => s.cores[id]!.isSoul)!;
    const others = normalReserve(s, 'p2').slice(0, 3);
    s = act(s, { type: 'useMagic', player: 'p2', cardId: palm, payment: [soul, ...others], timing: 'flash' });
    if (s.choice?.kind === 'card') s = act(s, { type: 'choose', player: 'p2', pick: host });
    expect(s.players.p1.trashCards).toContain(host);
    return { s, host, jet };
  }

  it('เลือกให้เบรฟอยู่ต่อ: เบรฟเป็นผู้โจมตีต่อ (เสื่อมสภาพ) แฟลชเดินต่อ แล้วเข้าไลฟ์ได้', () => {
    let { s, jet } = setupFusedAttack();
    expect(s.choice).toMatchObject({ kind: 'option', player: 'p1' });
    s = act(s, { type: 'choose', player: 'p1', pick: 0 }); // ให้เบรฟอยู่ต่อ
    s = act(s, { type: 'choose', player: 'p1', pick: { pay: normalReserve(s, 'p1').slice(0, 1) } });
    expect(s.players.p1.field).toContain(jet);
    expect(s.battle?.attackerId).toBe(jet);
    expect(s.cards[jet]!.state).toBe('exhausted');
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    // การต่อสู้ไม่จบ: เข้าสู่การประกาศป้องกันตามปกติ (เจ็ทคารูร่าไม่มีเจม ไม่ป้องกันก็เสียไลฟ์ 0)
    expect(s.battle?.step).toBe('declareBlock');
    s = act(s, { type: 'noBlock', player: 'p2' });
    expect(s.battle).toBeNull();
    expect(s.players.p1.field).toContain(jet);
  });

  it('ส่งเบรฟลงแทรช: แฟลชหลังโจมตีจบแล้วจบการต่อสู้ ไม่เข้าไลฟ์', () => {
    let { s } = setupFusedAttack();
    s = act(s, { type: 'choose', player: 'p1', pick: 1 }); // ส่งเบรฟลง Trash
    const life = s.players.p2.life.length;
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.battle).toBeNull();
    expect(s.players.p2.life).toHaveLength(life);
  });
});

describe('กติกา 04: สลับเบรฟบนสปิริตรวมร่างสองตัว โดยไม่ต้องแยกร่างก่อน', () => {
  const TEPPO = byName('เท็ปโปนานะฟุชิ'); // Brave ร่วมร่างคอสต์ 4+
  const KABUTO = db.all().find((c) => c.type === 'spirit' && c.cost >= 4 && c.cost <= 6)!.cardNo;

  function twoFused(opts: { exhaustedA?: boolean } = {}) {
    const s = setup();
    const a = put(s, 'p1', KABUTO, 1, opts.exhaustedA ? 'exhausted' : 'refresh');
    const b = put(s, 'p1', KABUTO, 1);
    const mk = (cardNo: string, host: string) => {
      const id = `ra-card-${++seq}`;
      s.cards[id] = { id, cardNo, owner: 'p1', state: s.cards[host]!.state, cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
      s.cards[host]!.braves.push(id);
      return id;
    };
    return { s, a, b, jet: mk(JET, a), teppo: mk(TEPPO, b) };
  }

  it('ย้ายเจ็ทคารูร่าไปร่างที่มีเท็ปโปอยู่ = สลับกัน', () => {
    let { s, a, b, jet, teppo } = twoFused();
    s = act(s, { type: 'brave', player: 'p1', braveId: jet, hostId: b });
    expect(s.cards[b]!.braves).toEqual([jet]);
    expect(s.cards[a]!.braves).toEqual([teppo]);
  });

  it('ร่างหนึ่งเสื่อมสภาพ: หลังสลับทั้งสองร่างเสื่อมสภาพ (เบรฟติดสภาพของร่างเดิมมา)', () => {
    let { s, a, b, jet } = twoFused({ exhaustedA: true });
    s = act(s, { type: 'brave', player: 'p1', braveId: jet, hostId: b });
    expect(s.cards[a]!.state).toBe('exhausted');
    expect(s.cards[b]!.state).toBe('exhausted');
  });

  it('เบรฟอีกตัวร่วมร่างกับร่างเดิมไม่ได้ (คอสต์ไม่ถึง): สลับไม่ได้', () => {
    const s = setup();
    const small = put(s, 'p1', DARIU, 1); // คอสต์ 1
    const big = put(s, 'p1', KABUTO, 1);
    const jet = `ra-card-${++seq}`;
    s.cards[jet] = { id: jet, cardNo: JET, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[small]!.braves.push(jet);
    const teppo = `ra-card-${++seq}`;
    s.cards[teppo] = { id: teppo, cardNo: TEPPO, owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[big]!.braves.push(teppo);
    // เท็ปโป (ต้องคอสต์ 4+) จะไปอยู่บนดาริว (คอสต์ 1) ไม่ได้
    expect(fails(s, { type: 'brave', player: 'p1', braveId: jet, hostId: big })).toBe('INVALID_HOST');
  });
});

describe('กติกา 02 Q&A 3: ผู้โจมตีออกจากสนามระหว่าง Flash', () => {
  it('ผู้โจมตีสูญสลายเพราะจ่ายคอร์ร่ายเมจิค แล้วถูกอัญเชิญกลับจากแทรช (ชิคิงามิออฟเดอะเดด) = การ์ดใหม่ การต่อสู้จบ ไม่มีการโจมตี', () => {
    const fam = db.all().find((c) => c.type === 'spirit' && c.family.includes('มารต้องสาป') && c.cost <= 3)!;
    let s = setup();
    const atk = put(s, 'p1', fam.cardNo, 1);
    put(s, 'p2', DARIU, 1);
    const magic = inHand(s, 'p1', byName('ชิคิงามิออฟเดอะเดด'));
    s = toAttack(s);
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: atk });
    while (s.choice) s = act(s, { type: 'choose', player: s.choice.player, pick: 0 } as Action);
    s = act(s, { type: 'passFlash', player: 'p2' });
    const cost = payableCost(s, db, 'p1', db.get(byName('ชิคิงามิออฟเดอะเดด')));
    s = act(s, { type: 'useMagic', player: 'p1', cardId: magic, payment: [s.cards[atk]!.cores[0]!, ...normalReserve(s, 'p1').slice(0, cost - 1)], timing: 'flash' });
    // เลือกอัญเชิญตัวที่เพิ่งสูญสลายกลับมา
    expect(s.choice).toMatchObject({ kind: 'card' });
    s = act(s, { type: 'choose', player: 'p1', pick: atk });
    while (s.choice) {
      const c = s.choice as { kind: string; player: PlayerId; cost?: number };
      if (c.kind === 'payCost') s = act(s, { type: 'choose', player: 'p1', pick: { pay: normalReserve(s, 'p1').slice(0, c.cost) } } as Action);
      else if (c.kind === 'placeCores') s = act(s, { type: 'choose', player: 'p1', pick: { pay: normalReserve(s, 'p1').slice(0, 1) } } as Action);
      else s = act(s, { type: 'choose', player: c.player, pick: 0 } as Action);
    }
    expect(s.players.p1.field).toContain(atk);
    while (s.battle?.flash) s = act(s, { type: 'passFlash', player: s.battle.flash.priority });
    expect(s.battle).toBeNull();
    expect(s.players.p2.life).toHaveLength(5);
  });
});
