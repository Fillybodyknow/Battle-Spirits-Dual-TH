import { describe, expect, it } from 'vitest';
import { actorOf, applyAction, botDecide, createGame, type Action, type GameState } from '../src';
import { actorSeats } from '../src/bot';
import { BOOSTER_SETS, db, deckOf } from './bot-helpers';

/**
 * 2VS2 (กติกา 15): บอทเล่นกันเองจนจบเกม ด้วยเด็คจากการ์ดทุกชุด
 * จับเอฟเฟกต์ที่ทำให้เกมค้าง/พังเมื่อมีผู้เล่นสองคนต่อทีม (โซนส่วนตัวแยก สนามร่วม)
 */
function play2v2(decks: [string, string, string, string], seed: number): { winner: string | null; turns: number } {
  let s: GameState = createGame({
    db,
    decks: { p1: deckOf(decks[0]), p2: deckOf(decks[1]) },
    partnerDecks: { p1: deckOf(decks[2]), p2: deckOf(decks[3]) },
    seed,
    firstPlayer: seed % 2 ? 'p1' : 'p2',
  }).state;
  let actions = 0;
  let perTurn = 0;
  let lastTurn = s.turn;
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
      if (!r.ok) {
        const c = s.choice;
        throw new Error(`[${decks.join('/')} seed ${seed}] ค้าง: ${JSON.stringify(a)} → ${r.error.code} ${r.error.message} · choice ${JSON.stringify(c && { kind: c.kind, src: db.get(s.cards[c.sourceId]!.cardNo).name })}`);
      }
    }
    s = r.state;
    actions++;
    if (s.turn !== lastTurn) {
      lastTurn = s.turn;
      perTurn = 0;
    } else if (++perTurn > 300) throw new Error(`[${decks.join('/')} seed ${seed}] วนไม่จบในเทิร์น ${s.turn}: ${JSON.stringify(a)}`);
  }
  return { winner: s.winner, turns: s.turn };
}

describe('2VS2 บอทเล่นกันเอง', () => {
  it('Starter ทุกเด็ค: เล่นจนจบเกมได้', () => {
    const r = play2v2(['sd01', 'sd02', 'sd03', 'sd04'], 1);
    expect(r.winner).not.toBeNull();
  }, 120_000);

  it.each(BOOSTER_SETS.map((set, i) => [set, BOOSTER_SETS[(i + 1) % BOOSTER_SETS.length]!] as const))('%s + %s: เล่นจนจบเกมได้', (a, b) => {
    const r = play2v2([a, b, b, a], 7);
    expect(r.winner).not.toBeNull();
  }, 300_000);
});
