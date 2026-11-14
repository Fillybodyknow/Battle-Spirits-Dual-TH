import { expect } from 'vitest';
import { loadSampleCards } from '@bs/cards';
import { applyAction, createGame, type Action, type GameConfig, type GameState, type PlayerId } from '../src';

export const db = loadSampleCards();

/**
 * สร้างเกมแบบไม่สับเด็ค: การ์ดใน top เรียงจากบนลงล่าง ที่เหลือเติมด้วย filler
 * p1 เริ่มก่อน → มือ p1 = top[0..4] (จั่ว 4 + Draw Step 1), มือ p2 = top[0..3]
 */
export function setup(opts: {
  p1?: string[];
  p2?: string[];
  deckSize?: number;
  filler?: string;
  config?: Partial<GameConfig>;
  seed?: number;
} = {}): GameState {
  const size = opts.deckSize ?? 40;
  const filler = opts.filler ?? 'SMP-005';
  const build = (top: string[] = []) => [...top, ...Array<string>(Math.max(0, size - top.length)).fill(filler)];
  return createGame({
    db,
    decks: { p1: build(opts.p1), p2: build(opts.p2) },
    seed: opts.seed ?? 1,
    firstPlayer: 'p1',
    shuffleDecks: false,
    config: opts.config,
  }).state;
}

export function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action, db);
  if (!result.ok) throw new Error(`${action.type} ล้มเหลว: ${result.error.code} ${result.error.message}`);
  return result.state;
}

export function actFails(state: GameState, action: Action, code: string): void {
  const result = applyAction(state, action, db);
  expect(result.ok ? 'ok' : result.error.code).toBe(code);
}

/** id ของการ์ดใบแรกบนมือที่ตรง cardNo */
export function inHand(state: GameState, player: PlayerId, cardNo: string): string {
  const id = state.players[player].hand.find((id) => state.cards[id]!.cardNo === cardNo);
  if (!id) throw new Error(`${player} ไม่มี ${cardNo} บนมือ`);
  return id;
}

export function reserve(state: GameState, player: PlayerId, n: number): string[] {
  const ids = state.players[player].reserve.slice(0, n);
  if (ids.length < n) throw new Error(`Reserve ของ ${player} มีไม่ถึง ${n}`);
  return ids;
}

/** อัญเชิญโดยจ่ายและวาง Core จาก Reserve */
export function summon(state: GameState, player: PlayerId, cardNo: string, pay: number, place: number): GameState {
  const cores = reserve(state, player, pay + place);
  return act(state, {
    type: 'summon',
    player,
    cardId: inHand(state, player, cardNo),
    payment: cores.slice(0, pay),
    placement: cores.slice(pay),
  });
}

/** จบเทิร์นของ turn player (ข้าม Attack Step ถ้ายังอยู่) */
export function endTurn(state: GameState): GameState {
  const player = state.turnPlayer;
  let s = state.phase === 'main' ? act(state, { type: 'endMain', player }) : state;
  if (s.turnPlayer === player && s.phase === 'attack') s = act(s, { type: 'endAttackStep', player });
  return s;
}

/** ทั้งสองฝ่าย pass Flash timing ที่เปิดอยู่ */
export function passBoth(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 2; i++) s = act(s, { type: 'passFlash', player: s.battle!.flash!.priority });
  return s;
}
