import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBSC04Cards, type Step } from '@bs/cards';
import { applyAction, createGame, type Action, type GameState, type PlayerId } from '../src';
import { blockersFor, payableCost } from '../src/rules';

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
  const id = `c04-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `c04-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function inHand(s: GameState, player: PlayerId, cardNo: string): string {
  const id = `c04-card-${++seq}`;
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
/** เลือกต่อจนไม่มีตัวเลือก (prefer = การ์ดที่อยากเลือกก่อน · option = ตัวแรก) */
function settle(s: GameState, prefer: string[] = []): GameState {
  for (let i = 0; i < 30 && s.choice; i++) {
    const c = s.choice;
    if (c.kind === 'card') s = choose(s, c.candidates.find((x) => prefer.includes(x)) ?? c.candidates[0]!);
    else if (c.kind === 'multiCard') s = choose(s, { cards: c.candidates.slice(0, c.count) } as never);
    else if (c.kind === 'placeCores') s = choose(s, { pay: s.players[c.player].reserve.slice(0, 1) } as never);
    else s = choose(s, 0);
  }
  return s;
}
const attack = (s: GameState, id: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId: id });
const queue = (s: GameState, controller: PlayerId, sourceId: string, steps: Step[]) => {
  s.queue = [...s.queue, { controller, sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
};

describe('BSC04 (BSC18)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์ · ครบ 48 ใบ', () => {
    const cards = loadBSC04Cards().all();
    expect(cards).toHaveLength(48);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('[ออเรนจ์สไมล์] รัน-เบลเซีย: My Unit ทำลาย BP ≤3000 · นำ "ราบี้-ดาริน" มาวางชิด = ไม่ถูกป้องกันโดยอัลติเมท', () => {
    let s = setup();
    const ran = put(s, 'p1', no('[ออเรนจ์สไมล์] รัน-เบลเซีย'), 3); // Lv2
    const rabi = put(s, 'p1', no('[กรีนบัมบีน่า] ราบี้-ดาริน'), 1);
    const weak = put(s, 'p2', DARIU, 1);
    const strong = put(s, 'p2', DARIU, 5);
    const ult = put(s, 'p2', no('อัลติเมท เบรดร้า'), 1);
    s = attack(s, ran);
    s = settle(s, [rabi, weak]);
    expect(s.players.p2.field).not.toContain(weak);
    expect(s.battle?.unit).toContain(rabi);
    const list = blockersFor(s, db, 'p2');
    expect(list).toContain(strong);
    expect(list).not.toContain(ult);
  });

  it('เลโอน่า-ไลค์บูม: ถูกนำไปวางชิดด้วย My Unit = จั่ว 1 ใบ · กาแล็กซี่เอ็กซ์โป: เมื่อสปิริตของเราใช้ My Unit วางคอร์วอยด์บนเน็กซัส', () => {
    let s = setup();
    const wendy = put(s, 'p1', no('[พาวเวอร์ฟูลด็อก] เวนดี้-เคท'), 1);
    const leona = put(s, 'p1', no('เลโอน่า-ไลค์บูม'), 1);
    const expo = put(s, 'p1', no('กาแล็กซี่เอ็กซ์โป'), 0);
    put(s, 'p2', DARIU, 1);
    const hand = s.players.p1.hand.length;
    s = attack(s, wendy);
    s = settle(s, [leona]);
    expect(s.players.p1.hand.length).toBe(hand + 1);
    expect(s.cards[expo]!.cores).toHaveLength(1);
  });

  it('กาแล็กซี่เอ็กซ์โป: วางคอร์ด้วยการจัดคอร์ไม่ได้', () => {
    const s = setup();
    const expo = put(s, 'p1', no('กาแล็กซี่เอ็กซ์โป'), 0);
    const core = s.players.p1.reserve[0]!;
    expect(fails(s, { type: 'moveCores', player: 'p1', moves: [{ coreId: core, to: { cardId: expo } }] })).toBe('CORE_LOCKED');
  });

  it('[สแปลชแดนเซอร์] ฟงนีน่า Lv2: ระบุสปิริตคู่แข่ง BP รวมไม่เกิน 10000 = ป้องกันไม่ได้ในการต่อสู้นี้', () => {
    let s = setup();
    const f = put(s, 'p1', no('[สแปลชแดนเซอร์] ฟงนีน่า'), 2);
    const a = put(s, 'p2', DARIU, 1);
    const b = put(s, 'p2', DARIU, 1);
    s = attack(s, f);
    s = settle(s, [a, b]);
    expect(s.battle?.noBlockIds).toEqual(expect.arrayContaining([a, b]));
    const list = blockersFor(s, db, 'p2');
    expect(list).not.toContain(a);
    expect(list).not.toContain(b);
  });

  it('เซฟี่-แอริส: เมนสเต็ป สปิริตคอสต์ตั้งแต่ 6 ที่ไม่มีเผ่า [ดีว่า] ถูกอัญเชิญในรูปแบบเสื่อมสภาพ', () => {
    let s = setup();
    put(s, 'p2', no('เซฟี่-แอริส'), 1);
    const big = db.all().find((c) => c.type === 'spirit' && c.cost === 6 && !c.family.includes('ดีว่า') && !c.summonCondition && c.levels[0]!.cores === 1)!;
    const id = inHand(s, 'p1', big.cardNo);
    const cost = payableCost(s, db, 'p1', big);
    const res = s.players.p1.reserve;
    s = act(s, { type: 'summon', player: 'p1', cardId: id, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) });
    s = settle(s);
    expect(s.players.p1.field).toContain(id);
    expect(s.cards[id]!.state).toBe('exhausted');
  });

  it('แบ็คสเตจ: On Stage เสื่อมสภาพเน็กซัสแทน = สปิริตที่ On Stage อยู่ต่อบนสนาม · โรส-เบอร์รี่ จั่ว 1+2 ใบ', () => {
    let s = setup();
    const bs = put(s, 'p1', no('แบ็คสเตจ'), 0);
    const rose = put(s, 'p1', no('โรส-เบอร์รี่'), 1);
    const queen = inHand(s, 'p1', no('[ไอดอลควีน] โรส-เบอร์รี่'));
    s = act(s, { type: 'endMain', player: 'p1' });
    const src = db.get(s.cards[rose]!.cardNo).abilities.find((a) => a.kind === 'onStage')!.source;
    const hand = s.players.p1.hand.length;
    s = act(s, { type: 'onStage', player: 'p1', cardId: rose, source: src });
    expect(s.choice?.kind).toBe('option');
    s = choose(s, 1); // เสื่อมสภาพเน็กซัสแทน
    expect(s.cards[bs]!.state).toBe('exhausted');
    s = settle(s, [queen]);
    expect(s.players.p1.field).toContain(rose);
    expect(s.players.p1.field).toContain(queen);
    expect(s.players.p1.hand.length).toBe(hand - 1 + 3);
  });

  it('คอสตูมเชนจ์ [Flash]: แยกเบรฟออกจากสปิริตร่วมร่าง แล้วอัญเชิญเบรฟสีเหลืองจากมือร่วมร่างกับสปิริตเผ่า [ดีว่า] โดยตรง', () => {
    let s = setup();
    const host = put(s, 'p1', no('[พาวเวอร์ฟูลด็อก] เวนดี้-เคท'), 3);
    const wing = `c04-card-${++seq}`;
    s.cards[wing] = { id: wing, cardNo: no('โกลเด้นวิง V'), owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(wing);
    const santa = inHand(s, 'p1', no('ชุดซานต้า'));
    queue(s, 'p1', host, [{ do: 'separateOwnBrave' }, { do: 'braveFromHandOnto', filter: { color: 'yellow' }, host: { family: 'ดีว่า' } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = settle(s, [host, santa]);
    expect(s.cards[host]!.braves).toEqual([santa]);
    expect(s.players.p1.field).toContain(wing); // เบรฟที่แยกอยู่ต่อเป็นสปิริต (วางคอร์จากรีเสิร์ฟ)
  });

  it('[พาวเวอร์ฟูลด็อก] เวนดี้-เคท Lv2: มีสปิริตทีม พริตตี้เอนิมอลส์ 5 ตัว = สปิริตทั้งหมดของเรา (รวมตัวเอง) เป็น Lv สูงสุด', async () => {
    const { cardLevel } = await import('../src/rules');
    const s = setup();
    const wendy = put(s, 'p1', no('[พาวเวอร์ฟูลด็อก] เวนดี้-เคท'), 3); // Lv2 (Lv3 ต้องใช้ 4)
    const other = put(s, 'p1', no('เลโอน่า-ไลค์บูม'), 1);
    expect(cardLevel(s, db, wendy)).toBe(2);
    for (let i = 0; i < 3; i++) put(s, 'p1', no('เลโอน่า-ไลค์บูม'), 1);
    expect(cardLevel(s, db, wendy)).toBe(3);
    expect(cardLevel(s, db, other)).toBe(3);
  });

  it('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์ Lv3: คู่แข่งอัญเชิญเบรฟในรูปแบบสปิริตไม่ได้ทุกกรณี (ร่วมร่างได้)', () => {
    let s = setup();
    put(s, 'p2', no('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์'), 3); // Lv3
    const wing = inHand(s, 'p1', no('โกลเด้นวิง V'));
    const cost = payableCost(s, db, 'p1', db.get(no('โกลเด้นวิง V')));
    const res = s.players.p1.reserve;
    // จากมือ: ลงเป็นสปิริตไม่ได้
    expect(fails(s, { type: 'summon', player: 'p1', cardId: wing, payment: res.slice(0, cost), placement: res.slice(cost, cost + 1) })).toBe('SUMMON_BANNED');
    // ด้วยเอฟเฟกต์ ไม่มีผู้ร่วมร่าง = อัญเชิญไม่ได้ การ์ดอยู่ในมือ
    queue(s, 'p1', wing, [{ do: 'placeCores', cardId: wing }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = settle(s);
    expect(s.players.p1.hand).toContain(wing);
    expect(s.players.p1.field).not.toContain(wing);
    // มีผู้ร่วมร่าง = ต้องร่วมร่าง (ไม่มีตัวเลือกลงเป็นสปิริต)
    let t = setup();
    put(t, 'p2', no('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์'), 3);
    const host = put(t, 'p1', no('[พาวเวอร์ฟูลด็อก] เวนดี้-เคท'), 1);
    const w2 = inHand(t, 'p1', no('โกลเด้นวิง V'));
    queue(t, 'p1', w2, [{ do: 'placeCores', cardId: w2 }]);
    t = act(t, { type: 'endMain', player: 'p1' });
    expect(t.choice).toMatchObject({ kind: 'card', candidates: [host] });
    expect((t.choice as { optional?: boolean }).optional).toBeFalsy();
    t = choose(t, host);
    expect(t.cards[host]!.braves).toContain(w2);
  });

  it('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์ Lv3: คู่แข่งแยกร่างไม่ได้ · ร่างต้นออกจากสนาม = เบรฟลงแทรช (อยู่ต่อเป็นสปิริตไม่ได้)', () => {
    let s = setup();
    put(s, 'p2', no('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์'), 3);
    const host = put(s, 'p1', no('[พาวเวอร์ฟูลด็อก] เวนดี้-เคท'), 1);
    const wing = `c04-card-${++seq}`;
    s.cards[wing] = { id: wing, cardNo: no('โกลเด้นวิง V'), owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(wing);
    expect(fails(s, { type: 'brave', player: 'p1', braveId: wing, hostId: null, placement: s.players.p1.reserve.slice(0, 1) })).toBe('BRAVE_SPIRIT_BANNED');
    // ร่างต้นถูกทำลาย: ไม่มีตัวเลือกให้เบรฟอยู่ต่อ
    queue(s, 'p2', host, [{ do: 'destroyChosenOpponent', filter: { types: ['spirit'] } }]);
    s.queue[0]!.controller = 'p2';
    s = act(s, { type: 'endMain', player: 'p1' });
    s = settle(s, [host]);
    expect(s.players.p1.field).not.toContain(wing);
    expect(s.players.p1.trashCards).toContain(wing);
  });

  it('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์ Lv3: เบรฟของคู่แข่งที่อยู่ในรูปแบบสปิริตอยู่ก่อน ลงแทรชเมื่อถึง Lv3 (ไม่ใช่การถูกทำลาย)', () => {
    let s = setup();
    const diana = put(s, 'p1', no('[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์'), 2); // Lv2 ยังไม่มีผล
    const wing = put(s, 'p2', no('โกลเด้นวิง V'), 1);
    const res = s.players.p1.reserve[0]!;
    s = act(s, { type: 'moveCores', player: 'p1', moves: [{ coreId: res, to: { cardId: diana } }] }); // Lv3
    expect(s.players.p2.field).not.toContain(wing);
    expect(s.players.p2.trashCards).toContain(wing);
  });

  it('ชุดซานต้า: ผู้ร่วมร่างเผ่า [ไพรเวทแวร์] ได้รับเผ่า [สเตจสไตล์] ในแอทแท็คสเต็ปของเรา', async () => {
    const { cardFamilies } = await import('../src/rules');
    let s = setup();
    const host = put(s, 'p1', no('เวนดี้-เคท'), 1);
    const santa = `c04-card-${++seq}`;
    s.cards[santa] = { id: santa, cardNo: no('ชุดซานต้า'), owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.cards[host]!.braves.push(santa);
    expect(cardFamilies(s, db, host)).not.toContain('สเตจสไตล์');
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(cardFamilies(s, db, host)).toContain('สเตจสไตล์');
  });
});
