import { describe, expect, it } from 'vitest';
import { loadAllCards, loadBS13Cards } from '@bs/cards';
import { applyAction, baseCost, cardColors, cardGems, createGame, currentBp, fieldSymbols, payableCost, type Action, type GameState, type PlayerId } from '../src';

const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;
const DARIU = no('มุฉะดาริว'); // สีแดง คอสต์ 1 BP 3000 (Core 1/3/5) ไม่มีเอฟเฟกต์
const DOLL = no('ซอร์ดดอล'); // ม่วง (ถือว่าเป็นขาวด้วย) เจ็มม่วง 1

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
  const id = `t13-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, (_, i) => {
    const coreId = `t13-core-${++seq}`;
    s.cores[coreId] = { id: coreId, owner: player, isSoul: soul && i === 0 };
    return coreId;
  });
  s.cards[id] = { id, cardNo, owner: player, state, cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[player].field.push(id);
  return id;
}
function card(s: GameState, player: PlayerId, cardNo: string, zone: 'hand' | 'trashCards'): string {
  const id = `t13-card-${++seq}`;
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
const normalCores = (s: GameState, p: PlayerId = 'p1') => s.players[p].reserve.filter((id) => !s.cores[id]!.isSoul);
const passAll = (s: GameState) => {
  let x = s;
  while (x.battle?.flash) x = act(x, { type: 'passFlash', player: x.battle.flash.priority });
  return x;
};
const attack = (s: GameState, attackerId: string) => act(act(s, { type: 'endMain', player: 'p1' }), { type: 'declareAttack', player: 'p1', attackerId });
/** ใช้เมจิค [Flash] จากมือ (ระหว่าง Flash ของแอทแท็คสเต็ป หรือในเมนสเต็ป) */
const useMagic = (s: GameState, name: string) => {
  const m = card(s, 'p1', no(name), 'hand');
  const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
  return act(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, cost), timing: 'flash' });
};
const summon = (s: GameState, cardId: string, place = 1, extra: Partial<Extract<Action, { type: 'summon' }>> = {}) => {
  const def = db.get(s.cards[cardId]!.cardNo);
  const cost = payableCost(s, db, 'p1', def);
  const res = normalCores(s);
  return act(s, { type: 'summon', player: 'p1', cardId, payment: res.slice(0, cost), placement: res.slice(cost, cost + place), ...extra });
};

describe('Booster Set 13', () => {
  it('การ์ดทุกใบผูกสคริปต์ได้ และทุกบรรทัดมีสคริปต์', () => {
    const cards = loadBS13Cards().all();
    expect(cards).toHaveLength(22);
    for (const c of cards) {
      const covered = new Set(c.abilities.map((a) => a.source));
      c.effects.forEach((_, i) => expect(covered.has(i), `${c.name} บรรทัด ${i + 1}`).toBe(true));
    }
  });

  it('ซอร์ดดอล: สีและเจ็มถือว่าเป็นสีขาวด้วย', () => {
    const s = setup();
    const doll = put(s, 'p1', DOLL, 1);
    expect(cardColors(s, db, doll)).toEqual(expect.arrayContaining(['purple', 'white']));
    expect(fieldSymbols(s, db, 'p1')).toMatchObject({ purple: 1, white: 1 });
  });

  it('เจ็มที่ถือว่าเป็นอีกสีด้วยยังเป็นเจ็ม 1 เม็ด: ลดคอสต์ได้ช่องเดียว (จาโด ขาว=แดง 1 เม็ด → ดาบจอมมาร 5 ลดเหลือ 4)', () => {
    const s = setup();
    put(s, 'p1', no('นักรบเครื่องกล จาโด'), 1);
    // Rush / นับสี: ยังนับเป็นทั้งขาวและแดง
    expect(fieldSymbols(s, db, 'p1')).toMatchObject({ white: 1, red: 1 });
    const sword = db.get(no('ดาบจอมมาร')); // คอสต์ 5 ลด ขาว1 แดง1 ม่วง1
    expect(payableCost(s, db, 'p1', sword)).toBe(4);
    // เพิ่มสปิริตแดงอีก 1 ตัว: จาโดใช้ช่องขาว มุฉะดาริวใช้ช่องแดง = ลด 2
    put(s, 'p1', DARIU, 1);
    expect(payableCost(s, db, 'p1', sword)).toBe(3);
  });

  it('เลออนแลนเซอร์: โจมตี = ทำลายสปิริต BP ≤10000 · Soul Drive = ทำลายทั้งหมด BP ≤20000 แทน · Lv4 ทำลายตัวที่มีโซลคอร์ = คอร์ไลฟ์คู่แข่งไปรีเสิร์ฟ', () => {
    const LEON = no('หกขุนศึกเซ็นโงคุ เลออนแลนเซอร์');
    // แบบปกติ: เลือกทำลาย 1 ตัว
    {
      const s0 = setup();
      const leon = put(s0, 'p1', LEON, 1); // Lv3
      const small = put(s0, 'p2', DARIU, 1);
      let s = attack(s0, leon);
      expect(s.choice?.kind).toBe('option');
      s = choose(s, 0);
      if (s.choice) s = choose(s, small);
      expect(s.players.p2.field).not.toContain(small);
    }
    // Soul Drive ที่ Lv4: ทำลายทั้งหมด · ตัวที่มีโซลคอร์ = ไลฟ์คู่แข่ง -1 ไปรีเสิร์ฟ
    {
      const s0 = setup();
      const leon = put(s0, 'p1', LEON, 4, true); // โซล 1 + 3 = Lv4 (หลังนำโซลออก ยัง Lv4)
      const withSoul = put(s0, 'p2', DARIU, 2, true);
      const plain = put(s0, 'p2', DARIU, 1);
      const life = s0.players.p2.life.length;
      const reserve = s0.players.p2.reserve.length;
      let s = attack(s0, leon);
      s = choose(s, 1);
      expect(s.players.p2.field).not.toContain(withSoul);
      expect(s.players.p2.field).not.toContain(plain);
      expect(s.cards[leon]!.cores.some((c) => s.cores[c]?.isSoul)).toBe(false);
      expect(s.players.p2.life.length).toBe(life - 1);
      expect(s.players.p2.reserve.length).toBeGreaterThanOrEqual(reserve + 1);
    }
  });

  it('ก็อด-เซคส์ -รูปแบบทำลายล้าง-: โจมตี = ทิ้งเบิร์ส · Six Heaven Rush (เจ็ม 4 สี + โซลคอร์) = ทำลายสปิริตคู่แข่งสีละ 1 ตัว', () => {
    const s0 = setup();
    const gs = put(s0, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบทำลายล้าง-'), 2, true); // เจ็มแดง/ขาว
    put(s0, 'p1', DOLL, 1); // ม่วง (ขาวด้วย)
    put(s0, 'p1', no('มารสายลม ชิโนบิริกะ'), 1); // เขียว
    const red = put(s0, 'p2', DARIU, 1);
    const green = put(s0, 'p2', no('มารสายลม ชิโนบิริกะ'), 1);
    const burst = card(s0, 'p2', DARIU, 'hand');
    s0.players.p2.hand = s0.players.p2.hand.filter((x) => x !== burst);
    s0.players.p2.burst = burst;
    let s = attack(s0, gs);
    for (let i = 0; i < 10 && s.choice; i++) s = s.choice.kind === 'card' ? choose(s, s.choice.candidates[0]!) : choose(s, 0);
    expect(s.players.p2.burst).toBeNull();
    expect(s.players.p2.field).not.toContain(red);
    expect(s.players.p2.field).not.toContain(green);
  });

  it('ก็อด-เซคส์ -รูปแบบทำลายล้าง- ในมือ: จบการโจมตีของก็อด-เซคส์ = นำก็อด-เซคส์กลับขึ้นมือ แล้วอัญเชิญการ์ดนี้ไม่จ่ายคอสต์', () => {
    const s0 = setup();
    const base = put(s0, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์'), 1);
    const xx = card(s0, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบทำลายล้าง-'), 'hand');
    let s = attack(s0, base);
    s = passAll(s);
    if (s.battle?.step === 'declareBlock') s = act(s, { type: 'noBlock', player: 'p2' });
    s = passAll(s);
    for (let i = 0; i < 10 && s.choice; i++) {
      const c = s.choice;
      if (c.kind === 'option') s = choose(s, 0);
      else if (c.kind === 'card') s = choose(s, c.candidates[0]!);
      else if (c.kind === 'placeCores') s = choose(s, { pay: s.players.p1.reserve.slice(0, 1) });
      else break;
      s = passAll(s);
    }
    expect(s.players.p1.hand).toContain(base);
    expect(s.players.p1.field).toContain(xx);
  });

  it('cardGems (ป้ายเจ็มบนสนาม): เจ็มม่วง 1 เม็ดที่ถือว่าเป็นขาวด้วย · เจ็มของเบรฟแยกเป็นเจ็มที่ได้รับ · เจ็มเป็น 0', () => {
    const s = setup();
    const doll = put(s, 'p1', DOLL, 1);
    expect(cardGems(s, db, doll)).toEqual({ gems: [{ color: 'purple', count: 1, also: ['white'] }], zeroed: false });
    const plain = put(s, 'p1', DARIU, 1);
    const brave = db.all().find((c) => c.type === 'brave' && (c.symbols.red ?? 0) === 1)!;
    const b = card(s, 'p1', brave.cardNo, 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((x) => x !== b);
    s.cards[plain]!.braves.push(b);
    expect(cardGems(s, db, plain).gems).toEqual([
      { color: 'red', count: 1, also: [] },
      { color: 'red', count: 1, also: [], added: true },
    ]);
    s.symbolsZeroCards = [{ cardId: doll, turn: s.turn }];
    expect(cardGems(s, db, doll)).toEqual({ gems: [], zeroed: true });
  });

  it('เจ็มถือว่าเป็นสี...ด้วย: มีผลกับเจ็มจากเบรฟที่ร่วมร่างด้วย (เจ้าของโปรเจกต์กำหนด)', () => {
    const s = setup();
    const doll = put(s, 'p1', DOLL, 1);
    const brave = db.all().find((c) => c.type === 'brave' && (c.symbols.red ?? 0) === 1 && Object.keys(c.symbols).length === 1)!;
    const b = card(s, 'p1', brave.cardNo, 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((x) => x !== b);
    s.cards[doll]!.braves.push(b);
    expect(cardGems(s, db, doll).gems).toEqual([
      { color: 'purple', count: 1, also: ['white'] },
      { color: 'red', count: 1, also: ['white'], added: true },
    ]);
    // ม่วง 1 + แดง 1 (เบรฟ) · ขาว = ทั้งสองเม็ด
    expect(fieldSymbols(s, db, 'p1')).toMatchObject({ purple: 1, red: 1, white: 2 });
  });

  it('อิเทะคาชะ: เจ็มนับเป็นแดงและม่วงด้วย · Lv2 มีโซลคอร์ สปิริตที่มีตั้งแต่ 2 สี BP+3000', () => {
    const s = setup();
    put(s, 'p1', no('นักรบเครื่องกล อิเทะคาชะ'), 2, true); // Lv2 (โซล + 1)
    const doll = put(s, 'p1', DOLL, 1); // ม่วง+ขาว = 2 สี
    const plain = put(s, 'p1', DARIU, 1); // แดงสีเดียว
    // ขาว: อิเทะคาชะ 1 + ซอร์ดดอล (ถือว่าขาว) 1 · แดง: มุฉะดาริว 1 + อิเทะคาชะ 1 · ม่วง: ซอร์ดดอล 1 + อิเทะคาชะ 1
    expect(fieldSymbols(s, db, 'p1')).toMatchObject({ white: 2, red: 2, purple: 2 });
    expect(currentBp(s, db, doll)).toBe(1000 + 3000);
    expect(currentBp(s, db, plain)).toBe(3000);
  });

  it('Rush (ดรีมเนบิวล่า): ไม่มีเจ็มม่วง = กลับขึ้นมืออย่างเดียว · ม่วง 1 = + ส่งคอร์ · ม่วง 2 = + จั่ว', () => {
    const run = (dolls: number) => {
      let s = setup();
      for (let i = 0; i < dolls; i++) put(s, 'p1', DOLL, 1);
      const a = put(s, 'p2', DARIU, 1);
      const b = put(s, 'p2', DARIU, 3);
      const hand = s.players.p1.hand.length;
      s = useMagic(s, 'ดรีมเนบิวล่า');
      for (let i = 0; i < 5 && s.choice; i++) {
        const c = s.choice;
        if (c.kind === 'card' && c.candidates.includes(a)) s = choose(s, a);
        else if (c.kind === 'card' && c.candidates.includes(b)) s = choose(s, b);
        else break;
      }
      return { bounced: s.players.p2.hand.includes(a), coresOnB: s.cards[b]!.cores.length, drew: s.players.p1.hand.length - hand };
    };
    expect(run(0)).toEqual({ bounced: true, coresOnB: 3, drew: 0 });
    expect(run(1)).toEqual({ bounced: true, coresOnB: 2, drew: 0 });
    expect(run(2)).toEqual({ bounced: true, coresOnB: 2, drew: 1 });
  });

  it('อิจิบันสเปียร์: "จอมมารสวรรค์ ก็อด-เซคส์" ในมือถือว่ามีคอสต์ 6', () => {
    const s = setup();
    const god = card(s, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์'), 'hand');
    expect(baseCost(s, db, god)).toBe(8);
    put(s, 'p1', no('อิจิบันสเปียร์'), 1);
    expect(baseCost(s, db, god)).toBe(6);
    // อ้างชื่อการ์ดตรง ๆ (ไม่ได้เขียน "ในชื่อการ์ด"): ร่างที่มีชื่อต่อท้ายไม่ได้รับผล
    for (const other of ['จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบทำลายล้าง-', 'จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบที่ศูนย์-']) {
      const def = db.get(no(other));
      expect(baseCost(s, db, card(s, 'p1', def.cardNo, 'hand')), other).toBe(def.cost);
    }
  });

  it('ก็อด-เซคส์ Six Heaven\'s Rush (เจ็ม 3 สี): สปิริตคู่แข่งฟื้นสภาพไม่ได้ ทั้งรีเฟรชสเต็ปและเอฟเฟกต์', () => {
    let s = setup();
    put(s, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์'), 1); // เจ็มขาว
    put(s, 'p1', DOLL, 1); // ม่วง (+ขาว)
    put(s, 'p1', DARIU, 1); // แดง → 3 สี
    const foe = put(s, 'p2', DARIU, 1, false, 'exhausted');
    // ก็อด-เซคส์ของคู่แข่ง: ไม่รับผลเอฟเฟกต์สปิริตของคู่แข่ง = ฟื้นสภาพได้ตามปกติ
    const foeGod = put(s, 'p2', no('จอมมารสวรรค์ ก็อด-เซคส์'), 1, false, 'exhausted');
    // จบเทิร์น p1 → รีเฟรชสเต็ปของ p2
    s = act(s, { type: 'endMain', player: 'p1' });
    for (let i = 0; i < 5 && s.turnPlayer === 'p1'; i++) s = act(s, { type: s.phase === 'attack' ? 'endAttackStep' : 'endMain', player: 'p1' } as Action);
    expect(s.turnPlayer).toBe('p2');
    expect(s.cards[foe]!.state).toBe('exhausted');
    expect(s.cards[foeGod]!.state).toBe('refresh');
  });

  it('ก็อด-เซคส์ Six Heaven\'s Rush: คู่แข่งฟื้นสภาพด้วยเอฟเฟกต์ก็ไม่ได้', () => {
    let s = setup();
    put(s, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์'), 1);
    put(s, 'p1', DOLL, 1);
    put(s, 'p1', DARIU, 1);
    const foe = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s.queue = [{ controller: 'p2', sourceId: foe, steps: [{ do: 'refreshChosenAlly', filter: { types: ['spirit'], state: 'exhausted' } }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(s.cards[foe]!.state).toBe('exhausted');
  });

  it('ก็อด-เซคส์: เจ็มไม่ถึง 3 สี = คู่แข่งฟื้นสภาพได้ตามปกติ', () => {
    let s = setup();
    put(s, 'p1', no('จอมมารสวรรค์ ก็อด-เซคส์'), 1);
    const foe = put(s, 'p2', DARIU, 1, false, 'exhausted');
    s = act(s, { type: 'endMain', player: 'p1' });
    for (let i = 0; i < 5 && s.turnPlayer === 'p1'; i++) s = act(s, { type: s.phase === 'attack' ? 'endAttackStep' : 'endMain', player: 'p1' } as Action);
    expect(s.cards[foe]!.state).toBe('refresh');
  });

  it('สถานที่ศักดิ์สิทธิ์ต้องห้าม Lv2: ต่อเทิร์น เด็คถูกทิ้งโดยเอฟเฟกต์ของคู่แข่งได้มากสุด 5 ใบ', () => {
    let s = setup();
    put(s, 'p2', no('สถานที่ศักดิ์สิทธิ์ต้องห้าม'), 2); // Lv2
    const src = put(s, 'p1', DARIU, 1);
    const deck = s.players.p2.deck.length;
    s.queue = [{ controller: 'p1', sourceId: src, steps: [{ do: 'mill', count: 4 }, { do: 'mill', count: 4 }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(deck - s.players.p2.deck.length).toBe(5);
  });

  it('เดรมาซาดาร์: ใช้ในเมนสเต็ปไม่ได้', () => {
    const s = setup();
    put(s, 'p2', DARIU, 1, false, 'exhausted');
    const m = card(s, 'p1', no('เดรมาซาดาร์'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[m]!.cardNo));
    expect(fails(s, { type: 'useMagic', player: 'p1', cardId: m, payment: normalCores(s).slice(0, cost), timing: 'flash' })).toBe('WRONG_TIMING');
  });

  it('เนก้า-ไทฟอน: สปิริตคู่แข่งโจมตี → คอร์วอยด์ 1 เม็ดบนสปิริตสีม่วงของเรา แล้วฟื้นสภาพตัวนั้น', () => {
    let s = setup();
    s.turnPlayer = 'p2';
    put(s, 'p2', no('เนก้า-ไทฟอน'), 1);
    const doll = put(s, 'p2', DOLL, 1, false, 'exhausted');
    const atk = put(s, 'p1', DARIU, 1);
    s.turnPlayer = 'p1';
    s = attack(s, atk);
    if (s.choice?.kind === 'card') s = choose(s, doll);
    expect(s.cards[doll]!.cores).toHaveLength(2);
    expect(s.cards[doll]!.state).toBe('refresh');
  });

  it('ดาร์คเนส-กริฟฟอน: กลับขึ้นมือตามจำนวนสีเจ็ม · ใช้โซลคอร์จ่าย = คอร์ของตัวที่กลับลงแทรช', () => {
    let s = setup();
    put(s, 'p1', DARIU, 1); // แดง → รวมกริฟฟอน (ขาว) = 2 สี
    const a = put(s, 'p2', DARIU, 2);
    const b = put(s, 'p2', DARIU, 3);
    const c = put(s, 'p2', DARIU, 1);
    // โซลคอร์ในรีเสิร์ฟ: ใช้จ่ายคอสต์
    const soul = 't13-soul';
    s.cores[soul] = { id: soul, owner: 'p1', isSoul: true };
    s.players.p1.reserve.push(soul);
    const gr = card(s, 'p1', no('ขุนศึกจักรพรรดิดำ ดาร์คเนส-กริฟฟอน'), 'hand');
    const cost = payableCost(s, db, 'p1', db.get(s.cards[gr]!.cardNo));
    const res = normalCores(s);
    s = act(s, { type: 'summon', player: 'p1', cardId: gr, payment: [soul, ...res.slice(0, cost - 1)], placement: res.slice(cost - 1, cost) });
    const trash0 = s.players.p2.trashCores.length;
    if (s.choice?.kind === 'multiCard') s = choose(s, { cards: [a, b] });
    else {
      s = choose(s, a);
      s = choose(s, b);
    }
    expect(s.players.p2.hand).toEqual(expect.arrayContaining([a, b]));
    expect(s.players.p2.field).toContain(c);
    expect(s.players.p2.trashCores.length - trash0).toBe(5);
  });

  it('จาโด: กลับขึ้นมือ 1 ตัว · มีโซลคอร์บนสปิริตสีแดงตัวอื่นของเรา = จั่ว 1 ใบด้วย', () => {
    let s = setup();
    put(s, 'p1', DARIU, 1, true); // สีแดง มีโซลคอร์
    const foe = put(s, 'p2', DARIU, 1);
    const jado = card(s, 'p1', no('นักรบเครื่องกล จาโด'), 'hand');
    const hand = s.players.p1.hand.length;
    s = summon(s, jado);
    if (s.choice?.kind === 'card') s = choose(s, foe);
    expect(s.players.p2.hand).toContain(foe);
    expect(s.players.p1.hand.length).toBe(hand - 1 + 1);
  });

  it('มิดไนท์-ซัน [ร่วมร่าง]: Rush ของผู้ร่วมร่างไม่สนเงื่อนไข (เนก้า-ไทฟอนจั่วได้แม้ไม่มีเจ็มม่วง)', () => {
    let s = setup();
    const ms = card(s, 'p1', no('ดาบสมบัติแห่งรัตติกาลสีขาว มิดไนท์-ซัน'), 'hand');
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== ms);
    const typhon = card(s, 'p1', no('เนก้า-ไทฟอน'), 'hand');
    // ทดสอบเงื่อนไขโดยตรง: วางเนก้า-ไทฟอนบนสนามพร้อมเบรฟ
    s.players.p1.hand = s.players.p1.hand.filter((id) => id !== typhon);
    s.players.p1.field.push(typhon);
    s.cards[typhon]!.cores = [normalCores(s)[0]!];
    s.players.p1.reserve = s.players.p1.reserve.filter((c) => c !== s.cards[typhon]!.cores[0]);
    s.cards[typhon]!.braves.push(ms);
    const hand = s.players.p1.hand.length;
    s.queue = [{ controller: 'p1', sourceId: typhon, steps: [{ do: 'when', if: { rush: { color: 'purple', count: 1 } }, steps: [{ do: 'draw', count: 1 }] }], paidWithSoul: false, trashWhenDone: false }];
    s = act(s, { type: 'endMain', player: 'p1' });
    expect(s.players.p1.hand.length).toBe(hand + 1);
  });
});
