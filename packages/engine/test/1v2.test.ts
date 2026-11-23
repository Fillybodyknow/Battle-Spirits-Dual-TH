import { describe, expect, it } from 'vitest';
import { loadAllCards } from '@bs/cards';
import { actorOf, applyAction, botDecide, createGame, type Action, type GameState, type PlayerId } from '../src';
import { actorSeats } from '../src/bot';
import { zonesOf } from '../src/seats';
import { BOOSTER_SETS, deckOf } from './bot-helpers';

/** โหมด 1VS2 (กติกา 15 ข้อ 10): p1 เล่นคนเดียว · p2 เป็นทีม 2 คน */
const db = loadAllCards();
const no = (name: string) => db.all().find((c) => c.name === name)!.cardNo;
const DARIU = no('มุฉะดาริว');

function setup(first: PlayerId = 'p2'): GameState {
  const deck = Array<string>(40).fill(DARIU);
  return createGame({
    db,
    decks: { p1: deck, p2: deck },
    partnerDecks: { p2: deck },
    seed: 1,
    firstPlayer: first,
    shuffleDecks: false,
    config: { firstPlayerSkipsAttackStep: false },
  }).state;
}

function act(s: GameState, action: Action): GameState {
  const r = applyAction(s, action, db);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}

describe('1VS2', () => {
  it('ฝั่งคนเดียว: ไลฟ์ 10 · ทีม: คนละ 5', () => {
    const s = setup();
    expect(s.mode).toBe('2v2');
    expect(s.solo).toBe('p1');
    expect(s.players.p1.partner).toBeUndefined();
    expect(s.players.p1.life).toHaveLength(10);
    expect(zonesOf(s, 'p2', 0).life).toHaveLength(5);
    expect(zonesOf(s, 'p2', 1).life).toHaveLength(5);
  });

  it('ฝั่งคนเดียว: คอร์สเต็ป +2 และดรอว์สเต็ปจั่ว 2 ใบ', () => {
    let s = setup('p2');
    const reserve = s.players.p1.reserve.length;
    const hand = s.players.p1.hand.length;
    s = act(s, { type: 'endMain', player: 'p2' });
    s = act(s, { type: 'endMain', player: 'p2', seat: 1 });
    while (s.turnPlayer === 'p2' && !s.winner) {
      const seat = actorSeats(s)[0] ?? 0;
      s = act(s, s.phase === 'attack' ? { type: 'endAttackStep', player: 'p2', ...(seat ? { seat } : {}) } : { type: 'endMain', player: 'p2', ...(seat ? { seat } : {}) });
    }
    expect(s.turnPlayer).toBe('p1');
    expect(s.players.p1.reserve).toHaveLength(reserve + 2);
    expect(s.players.p1.hand).toHaveLength(hand + 2);
  });

  it('ทีม 2 คน: คอร์สเต็ป/ดรอว์สเต็ปคนละ 1 ตามปกติ', () => {
    let s = setup('p1');
    const r0 = zonesOf(s, 'p2', 0).reserve.length;
    const h1 = zonesOf(s, 'p2', 1).hand.length;
    while (s.turnPlayer === 'p1' && !s.winner) s = act(s, s.phase === 'attack' ? { type: 'endAttackStep', player: 'p1' } : { type: 'endMain', player: 'p1' });
    expect(zonesOf(s, 'p2', 0).reserve).toHaveLength(r0 + 1);
    expect(zonesOf(s, 'p2', 1).hand).toHaveLength(h1 + 1);
  });
});

function play1v2(decks: [string, string, string], seed: number): GameState {
  let s: GameState = createGame({
    db,
    decks: { p1: deckOf(decks[0]), p2: deckOf(decks[1]) },
    partnerDecks: seed % 2 ? { p2: deckOf(decks[2]) } : { p1: deckOf(decks[2]) },
    seed,
    firstPlayer: seed % 4 < 2 ? 'p1' : 'p2',
  }).state;
  let actions = 0;
  while (!s.winner && actions < 6000) {
    const who = actorOf(s)!;
    const seat = actorSeats(s)[0]!;
    let a: Action | null = botDecide(s, db, who, { level: 3 })?.action ?? null;
    let r = a ? applyAction(s, a, db) : null;
    if (!r || !r.ok) {
      const base: Action = s.choice
        ? { type: 'choose', player: who, pick: null }
        : s.battle?.flash
          ? { type: 'passFlash', player: who }
          : s.battle?.step === 'declareBlock'
            ? { type: 'noBlock', player: who }
            : s.phase === 'main'
              ? { type: 'endMain', player: who }
              : { type: 'endAttackStep', player: who };
      a = seat ? { ...base, seat } : base;
      r = applyAction(s, a, db);
      if (!r.ok) throw new Error(`[${decks.join('/')} seed ${seed}] ค้าง: ${JSON.stringify(a)} → ${r.error.code} ${r.error.message}`);
    }
    s = r.state;
    actions++;
  }
  return s;
}

describe('1VS2 บอทเล่นกันเอง', () => {
  it.each([1, 2, 3, 4])('Starter seed %i: เล่นจนจบเกมได้', (seed) => {
    expect(play1v2(['sd01', 'sd02', 'sd03'], seed).winner).not.toBeNull();
  }, 120_000);

  it.each(BOOSTER_SETS.slice(0, 4).map((set, i) => [set, BOOSTER_SETS[(i + 1) % BOOSTER_SETS.length]!] as const))('%s vs %s: เล่นจนจบเกมได้', (a, b) => {
    expect(play1v2([a, b, b], 5).winner).not.toBeNull();
  }, 300_000);
});
