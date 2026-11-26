import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBSC03Cards, type Step } from '@bs/cards';
import { applyAction, createGame, type Action, type GameState, type PlayerId } from '../src';
import { blockersFor, cardLevel, payableCost } from '../src/rules';

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
  const id = `c03-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const coreId = `c03-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: false };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
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
function settle(s: GameState, prefer: string[] = []): GameState {
  for (let i = 0; i < 20 && s.choice; i++) {
    const c = s.choice;
    if (c.kind === 'card') s = choose(s, c.candidates.find((x) => prefer.includes(x)) ?? c.candidates[0]!);
    else if (c.kind === 'multiCard') s = choose(s, { cards: c.candidates.slice(0, c.count) } as never);
    else if (c.kind === 'placeCores') s = choose(s, { pay: s.players[c.player].reserve.slice(0, 1) } as never);
    else s = choose(s, 0);
  }
  return s;
}
const queue = (s: GameState, controller: PlayerId, sourceId: string, steps: Step[]) => {
  s.queue = [...s.queue, { controller, sourceId, steps, paidWithSoul: false, trashWhenDone: false }];
};

describe('BSC03 (BSC17)', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์ · ครบ 18 ใบ', () => {
    const cards = loadBSC03Cards().all();
    expect(cards).toHaveLength(18);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('อัลติเมท โกลดิแอส Double U Trigger: ฮิต 2 ครั้ง = ทำลายคอสต์ไม่เกิน 4 สองตัว + Double Hit ทำลายอีก 1 ตัว', () => {
    let s = setup();
    const ult = put(s, 'p1', no('อัลติเมท โกลดิแอส'), 2); // Lv4 คอสต์ 7
    put(s, 'p1', no('เทพยักษ์ จูเนียส'), 1);
    const t = [put(s, 'p2', DARIU, 1), put(s, 'p2', DARIU, 1), put(s, 'p2', DARIU, 1)];
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ult });
    s = settle(s, t);
    for (const id of t) expect(s.players.p2.field).not.toContain(id);
  });

  it('อัลติเมท เบรดร้า: เมนสเต็ปของเรา เจ็มอัลติเมทถือว่าเป็นเจ็มแดงด้วย (ลดคอสต์ช่องแดงได้)', () => {
    let s = setup();
    put(s, 'p1', no('อัลติเมท เบรดร้า'), 1);
    put(s, 'p1', no('อัลติเมท เบรดร้า'), 1);
    const basel = db.get(no('เพลิงระเบิดสูงสุด อัลติเมท บาเซล')); // คอสต์ 7 ลด แดง3 เจ็มอัลติเมท1
    expect(payableCost(s, db, 'p1', basel)).toBe(5);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(payableCost(s, db, 'p1', basel)).toBe(6);
  });

  it('ราชันย์โครงกระดูก อัลติเมท กิ-กาชา: สปิริตเผ่า [ผีอมตะ] คอสต์ Lv1 เป็น 0 (ไม่มีคอร์ก็ไม่สูญสลาย)', () => {
    let s = setup();
    put(s, 'p1', no('ราชันย์โครงกระดูก อัลติเมท กิ-กาชา'), 1);
    const u = put(s, 'p1', no('ซอร์ดดอล'), 0);
    expect(cardLevel(s, db, u)).toBe(1);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.field).toContain(u);
  });

  it('อัลติเมท ดอน ดิเอกอด: เพิ่มคอร์จากวอยด์ด้วยเอฟเฟกต์ของสปิริตไม่ได้ (อัลติเมททำได้)', () => {
    let s = setup();
    put(s, 'p2', no('อัลติเมท ดอน ดิเอกอด'), 1);
    const sp = put(s, 'p1', DARIU, 1);
    const ul = put(s, 'p1', no('อัลติเมท เบรดร้า'), 1);
    const r = s.players.p1.reserve.length;
    queue(s, 'p1', sp, [{ do: 'voidCore', to: 'reserve', count: 1 }]);
    queue(s, 'p1', ul, [{ do: 'voidCore', to: 'reserve', count: 1 }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.reserve.length).toBe(r + 1);
  });

  it('อัลติเมท ทามาโมโนะอิน: ในเทิร์นนี้ สปิริตที่ตรงตัวกรองไม่ถูกป้องกันโดยอัลติเมทของคู่แข่ง', () => {
    let s = setup();
    const a = put(s, 'p1', DARIU, 1);
    const bs = put(s, 'p2', DARIU, 1);
    const bu = put(s, 'p2', no('อัลติเมท เบรดร้า'), 1);
    queue(s, 'p1', a, [{ do: 'unblockableByUltimatesThisTurn', filter: { types: ['spirit'] } }]);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: a });
    const list = blockersFor(s, db, 'p2');
    expect(list).toContain(bs);
    expect(list).not.toContain(bu);
  });

  it('เพลิงระเบิดสูงสุด อัลติเมท บาเซล: U Trigger ฮิต = สั่งใช้เบิร์สของเรา (ไม่ใช่โซลเบิร์สก็ได้) โดยไม่สนเงื่อนไข', () => {
    let s = setup();
    const ult = put(s, 'p1', no('เพลิงระเบิดสูงสุด อัลติเมท บาเซล'), 3); // Lv4
    const burst = 'c03-burst';
    s.cards[burst] = { id: burst, cardNo: no('อัลติเมท แซงค์ ไชน์'), owner: 'p1', state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
    s.players.p1.burst = burst;
    put(s, 'p1', no('อัลติเมท ทามาโมโนะอิน'), 1);
    s = act(s, { type: 'endMain', player: 'p1' });
    s = act(s, { type: 'declareAttack', player: 'p1', attackerId: ult });
    s = settle(s);
    expect(s.players.p1.burst).toBeNull();
    expect(s.players.p1.field).toContain(burst);
  });
});
