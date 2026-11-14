import { create } from 'zustand';
import { cancelSfx, sfx } from './sfx';
import { primeCoreMotion, snapCores } from './motion';
import { firebaseConfigured, firebaseTransport } from './online/firebase';
import { localTransport } from './online/local';
import type { RoomInfo, RoomSetup, Transport } from './online/transport';
import { createCardDatabase, expandDeck, loadSampleCards, loadSD01Cards, loadSD02Cards, SD01_DECK, SD02_DECK, type DeckEntry } from '@bs/cards';
import type { TextEffect } from '@bs/cards';
import {
  applyAction,
  cardLevel,
  minCores,
  payableCost,
  createGame,
  isSpiritLike,
  locateCore,
  opponentOf,
  PLAYERS,
  type Action,
  type ChoicePick,
  type CoreTarget,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@bs/engine';

/** การ์ดทุกชุดที่ UI ใช้: ชุดตัวอย่าง (SMP-) + Starter Deck 01/02 (SD01-, SD02-) */
export const db = createCardDatabase([...loadSampleCards().all(), ...loadSD01Cards().all(), ...loadSD02Cards().all()]);

/** เด็คตัวอย่าง 40 ใบ (ชื่อละไม่เกิน 3 ใบ) ไม่รวม Ultimate เพราะ engine ยังไม่รองรับ */
const DECK_RED_WHITE: DeckEntry[] = [
  ...['SMP-001', 'SMP-002', 'SMP-003', 'SMP-004', 'SMP-007', 'SMP-008', 'SMP-009', 'SMP-010', 'SMP-012', 'SMP-016', 'SMP-013', 'SMP-014'].map(
    (cardNo) => ({ cardNo, count: 3 }),
  ),
  { cardNo: 'SMP-005', count: 2 },
  { cardNo: 'SMP-015', count: 2 },
];
const DECK_GREEN_BLUE: DeckEntry[] = [
  ...['SMP-005', 'SMP-006', 'SMP-015', 'SMP-013', 'SMP-014', 'SMP-016', 'SMP-007', 'SMP-008', 'SMP-001', 'SMP-002', 'SMP-003', 'SMP-010'].map(
    (cardNo) => ({ cardNo, count: 3 }),
  ),
  { cardNo: 'SMP-004', count: 2 },
  { cardNo: 'SMP-009', count: 2 },
];

export const DECKS = {
  sd01: { label: 'Starter Deck 01', entries: [...SD01_DECK] },
  sd02: { label: 'Starter Deck 02', entries: [...SD02_DECK] },
  sampleRedWhite: { label: 'ตัวอย่าง แดง/ขาว', entries: DECK_RED_WHITE },
  sampleGreenBlue: { label: 'ตัวอย่าง เขียว/ฟ้า', entries: DECK_GREEN_BLUE },
} satisfies Record<string, { label: string; entries: DeckEntry[] }>;
export type DeckId = keyof typeof DECKS;
type DeckChoice = Record<PlayerId, DeckId>;

export type PlayKind = 'summon' | 'deployNexus' | 'useMagic';
export type MagicTiming = 'main' | 'flash';

// ---------------------------------------------------------------- selectors (pure)

/** ผู้เล่นที่ต้องตัดสินใจตอนนี้ */
export function actingPlayer(s: GameState): PlayerId | null {
  if (s.winner) return null;
  if (s.choice) return s.choice.player;
  if (s.battle?.flash) return s.battle.flash.priority;
  if (s.battle?.step === 'declareBlock') return opponentOf(s.turnPlayer);
  return s.turnPlayer;
}

export const inMain = (s: GameState) => !s.winner && !s.choice && s.phase === 'main' && !s.battle;

/** ผู้เล่นที่ใช้ Magic [Flash] ได้ตอนนี้ (ถือ priority ใน Flash timing) */
export const flashPlayer = (s: GameState): PlayerId | null => (!s.winner && !s.choice && s.battle?.flash ? s.battle.flash.priority : null);

/** สปิริตบนสนามนี้ใช้ Flash [Evolution] ได้ตอนนี้หรือไม่ */
export function canEvolve(s: GameState, cardId: string): boolean {
  const card = s.cards[cardId]!;
  const timingOk = inMain(s) ? card.owner === s.turnPlayer : flashPlayer(s) === card.owner;
  if (!timingOk) return false;
  const level = cardLevel(s, db, cardId);
  return db.get(card.cardNo).abilities.some((a) => a.kind === 'evolution' && a.levels.includes(level));
}

/** จังหวะที่ Magic ใบนี้มีตามข้อความเอฟเฟกต์ */
export function magicTimings(cardNo: string): MagicTiming[] {
  return (db.get(cardNo).effects as { timing?: string }[])
    .map((e) => e.timing)
    .filter((t): t is MagicTiming => t === 'main' || t === 'flash');
}

/** Core นี้ลาก/ย้ายได้ตอนนี้หรือไม่ (Main Step ของเจ้าของ, อยู่ใน Reserve หรือบนการ์ดในสนาม) */
export function canMoveCore(s: GameState, coreId: string): boolean {
  const core = s.cores[coreId];
  if (!core || !inMain(s) || core.owner !== s.turnPlayer) return false;
  const loc = locateCore(s, coreId);
  return !!loc && loc.player === core.owner && (loc.area === 'reserve' || loc.area === 'card');
}

/** ตำแหน่งปัจจุบันของ Core เทียบกับปลายทาง */
function alreadyAt(s: GameState, coreId: string, to: CoreTarget): boolean {
  const loc = locateCore(s, coreId);
  if (!loc) return false;
  return 'cardId' in to ? loc.area === 'card' && loc.cardId === to.cardId : loc.area === 'reserve';
}

/** จำลองการย้าย Core (ไม่แก้ state จริง) คืน null ถ้าย้ายไม่ได้ */
export function simulateMove(s: GameState, cores: string[], to: CoreTarget): GameState | null {
  const moving = cores.filter((id) => !alreadyAt(s, id, to));
  if (moving.length === 0) return null;
  const r = applyAction(s, { type: 'moveCores', player: s.turnPlayer, moves: moving.map((coreId) => ({ coreId, to })) }, db);
  return r.ok ? r.state : null;
}

/** การ์ดบนมือนี้อัญเชิญด้วย [Quick]/[Soul Quick] ได้ตอนนี้หรือไม่ (ถือ priority ใน Flash timing + Core ในรีเสิร์ฟพอ) */
export function canQuickSummon(s: GameState, cardId: string): boolean {
  const card = s.cards[cardId];
  if (!card || flashPlayer(s) !== card.owner || !s.players[card.owner].hand.includes(cardId)) return false;
  const def = db.get(card.cardNo);
  const quick = def.abilities.find((a) => a.kind === 'quick');
  if (!quick || quick.kind !== 'quick') return false;
  const reserve = s.players[card.owner].reserve;
  const normal = reserve.filter((id) => !s.cores[id]!.isSoul).length;
  if (quick.soul) return normal + 0 >= minCores(def) && reserve.some((id) => s.cores[id]!.isSoul);
  return reserve.length >= payableCost(s, db, card.owner, def) + minCores(def);
}

/** ผู้ร่วมร่างปัจจุบันของ Brave (null = ไม่ได้ร่วมร่าง) */
export function braveHostOf(s: GameState, braveId: string): string | null {
  for (const p of PLAYERS) for (const id of s.players[p].field) if (s.cards[id]!.braves.includes(braveId)) return id;
  return null;
}

/** สปิริตบนสนามที่ Brave ใบนี้ (บนมือ / บนสนาม / ร่วมร่างอยู่) ร่วมร่างได้ตอนนี้ใน Main Step */
export function braveHosts(s: GameState, cardId: string): string[] {
  const card = s.cards[cardId];
  if (!card || !inMain(s) || card.owner !== s.turnPlayer) return [];
  const def = db.get(card.cardNo);
  const p = s.players[card.owner];
  const current = braveHostOf(s, cardId);
  if (def.type !== 'brave' || !def.braveCondition) return [];
  if (!p.hand.includes(cardId) && !p.field.includes(cardId) && !current) return [];
  const min = def.braveCondition.minCost ?? 0;
  return p.field.filter((id) => {
    const host = s.cards[id]!;
    const hd = db.get(host.cardNo);
    return id !== current && hd.type === 'spirit' && hd.cost >= min && host.braves.length === 0;
  });
}

/** Core ที่จะวางบน Brave ตอนแยกร่าง (จากรีเสิร์ฟ: Core ธรรมดาก่อน) null = ไม่พอ */
export function separatePlacement(s: GameState, braveId: string): string[] | null {
  const card = s.cards[braveId]!;
  const need = minCores(db.get(card.cardNo));
  const reserve = [...s.players[card.owner].reserve].sort((a, b) => Number(s.cores[a]!.isSoul) - Number(s.cores[b]!.isSoul));
  return reserve.length >= need ? reserve.slice(0, need) : null;
}

/** ตัวเลือกที่ผู้เล่นใช้ได้ใน Flash timing ตอนนี้: Magic [Flash] ที่จ่ายไหว, สปิริตที่ใช้ [Evolution] ได้ และการ์ด [Quick] */
export function responseOptions(s: GameState, player: PlayerId): { magic: string[]; evolve: string[]; quick: string[] } {
  if (flashPlayer(s) !== player) return { magic: [], evolve: [], quick: [] };
  const p = s.players[player];
  const cores = p.reserve.length + p.field.reduce((n, id) => n + s.cards[id]!.cores.length, 0);
  const magic = p.hand.filter((id) => {
    const def = db.get(s.cards[id]!.cardNo);
    return def.type === 'magic' && magicTimings(def.cardNo).includes('flash') && payableCost(s, db, player, def) <= cores;
  });
  const evolve = p.field.filter(
    (id) =>
      canEvolve(s, id) &&
      p.field.some((o) => o !== id && isSpiritLike(db.get(s.cards[o]!.cardNo)) && s.cards[o]!.cores.length > 0),
  );
  const quick = p.hand.filter((id) => canQuickSummon(s, id));
  return { magic, evolve, quick };
}

/**
 * การเลือกการ์ดที่ทำบนกระดานได้: ตัวเลือกทุกใบอยู่บนสนาม หรือบนมือของผู้เลือก
 * (การ์ดที่เปิดจากเด็ค / ใน Trash ยังใช้หน้าต่าง)
 */
export function isInlineChoice(s: GameState): boolean {
  const c = s.choice;
  if (!c || c.kind !== 'card' || c.revealed) return false;
  return c.candidates.every((id) => PLAYERS.some((p) => s.players[p].field.includes(id)) || s.players[c.player].hand.includes(id));
}

/** การ์ดนี้เป็นตัวเลือกของการเลือกบนกระดานตอนนี้หรือไม่ */
export function isChoiceCandidate(s: GameState, cardId: string): boolean {
  return isInlineChoice(s) && s.choice?.kind === 'card' && s.choice.candidates.includes(cardId);
}

/**
 * Core นี้คลิกเลือกได้ตอนนี้หรือไม่
 *  - โหมด Evolution: Core บนสปิริตอื่นของเจ้าของ
 *  - จ่ายคอสต์ระหว่างเอฟเฟกต์: Core ใน Reserve หรือบนการ์ดของผู้จ่าย
 *  - ปกติ: Core ที่ย้ายได้ใน Main Step
 */
export function canSelectCore(s: GameState, evolveCard: string | null, coreId: string): boolean {
  const core = s.cores[coreId];
  const loc = core ? locateCore(s, coreId) : null;
  if (!core || !loc) return false;
  if (evolveCard) {
    const owner = s.cards[evolveCard]!.owner;
    return loc.area === 'card' && loc.player === owner && loc.cardId !== evolveCard && isSpiritLike(db.get(s.cards[loc.cardId]!.cardNo));
  }
  if (s.choice?.kind === 'payCost') {
    return core.owner === s.choice.player && loc.player === s.choice.player && (loc.area === 'reserve' || loc.area === 'card');
  }
  // อัญเชิญด้วยเอฟเฟกต์: Core ในรีเสิร์ฟ หรือบนการ์ดในสนามของผู้เลือก
  if (s.choice?.kind === 'placeCores') return core.owner === s.choice.player && loc.player === s.choice.player && (loc.area === 'reserve' || loc.area === 'card');
  return canMoveCore(s, coreId);
}

/** จำลอง [Evolution] (ไม่แก้ state จริง) */
export function simulateEvolve(s: GameState, cardId: string, cores: string[]): GameState | null {
  if (cores.length === 0) return null;
  const r = applyAction(s, { type: 'evolve', player: s.cards[cardId]!.owner, cardId, cores }, db);
  return r.ok ? r.state : null;
}

/** สปิริตของฝ่ายป้องกันที่ประกาศป้องกันได้ตอนนี้ */
export function blockCandidates(s: GameState): string[] {
  if (!s.battle || s.battle.step !== 'declareBlock' || s.choice || s.winner) return [];
  const defender = opponentOf(s.turnPlayer);
  return s.players[defender].field.filter((id) => s.cards[id]!.state === 'refresh' && isSpiritLike(db.get(s.cards[id]!.cardNo)));
}

/**
 * Auto Pass: Pass Flash ให้ผู้เล่นที่ไม่มีอะไรใช้ได้ และไม่ป้องกันให้เมื่อไม่มีสปิริตที่ป้องกันได้
 * (หยุดเมื่อมีตัวเลือกจริง ต้องเลือกเอฟเฟกต์ หรือเกมจบ)
 */
function autoAdvance(s: GameState, events: GameEvent[]): GameState {
  for (let i = 0; i < 20; i++) {
    if (s.winner || s.choice) return s;
    const fp = flashPlayer(s);
    let action: Action | null = null;
    if (fp) {
      const o = responseOptions(s, fp);
      if (o.magic.length === 0 && o.evolve.length === 0 && o.quick.length === 0) action = { type: 'passFlash', player: fp };
    } else if (s.battle?.step === 'declareBlock' && blockCandidates(s).length === 0) {
      action = { type: 'noBlock', player: opponentOf(s.turnPlayer) };
    }
    if (!action) return s;
    const r = applyAction(s, action, db);
    if (!r.ok) return s;
    events.push(...r.events);
    s = r.state;
  }
  return s;
}

// ---------------------------------------------------------------- FX

export type Fx =
  /** delay: ป้ายผู้ชนะรอให้แอนิเมชันทั้งหมดเล่นจบก่อน (ระหว่างรอนับเป็นแอนิเมชันที่ต้องเล่นให้จบ) */
  | { id: number; kind: 'banner'; title: string; sub?: string; tone: 'turn' | 'step' | 'burst' | 'win'; delay?: number }
  /** FINAL BLOW: การโจมตีที่ทำให้ Life เป็น 0 (เวลาหยุดชั่วครู่ แสงวาบ ข้อความใหญ่ ฝั่งที่แพ้ร้าว) */
  | { id: number; kind: 'finalBlow'; loser: PlayerId; winner: PlayerId; delay: number }
  | { id: number; kind: 'summon'; cardId: string; level: number; bp: number; delay: number }
  | { id: number; kind: 'activate'; cardId: string; label: string; text: string; delay: number }
  /** การ์ดบนสนามที่เอฟเฟกต์ทำงาน: ยกขึ้น + เรืองแสง ก่อนผลของเอฟเฟกต์จะเกิด */
  | { id: number; kind: 'cardActivate'; cardId: string; delay: number; duration: number }
  /** เอฟเฟกต์หลายอันทำงานพร้อมกัน: แสดงการ์ดเรียงพร้อมเลขลำดับและโซ่ (CHAIN → RESOLVE) */
  | { id: number; kind: 'chain'; cardIds: string[]; delay: number; duration: number }
  /** การ์ดที่เอฟเฟกต์ทำงานเสร็จ บินเข้าไปต่อท้ายแถบ Chain (index = ลำดับใน Chain) */
  | { id: number; kind: 'chainAdd'; cardId: string; index: number; delay: number }
  /** การ์ดที่เปิดจากเด็คเรียงเป็นพัด (หลังเลือก: ใบที่เลือกยกขึ้นก่อนบินขึ้นมือ / ที่เหลือบินลง Trash) */
  | { id: number; kind: 'reveal'; owner: PlayerId; cardIds: string[]; chosen: string | null; delay: number; duration: number; title?: string }
  /** เส้นเล็งจากการ์ดต้นเอฟเฟกต์ไปยังเป้าหมายที่เลือก */
  | { id: number; kind: 'target'; sourceId: string; targetId: string; delay: number; duration: number }
  /** ตัวเลขดาเมจใหญ่กลางฝั่งที่เสียไลฟ์ (big = โดนโจมตีตรง มีรัศมีแตกกระจาย) */
  | { id: number; kind: 'damage'; player: PlayerId; amount: number; big: boolean; delay: number }
  | { id: number; kind: 'float'; anchor: string; text: string; tone: 'bad' | 'good'; delay?: number }
  /**
   * การ์ดบินจากจุดหนึ่งไปอีกจุด: from = ตำแหน่งที่จับไว้ก่อน action (หรือ selector), to = selector ปลายทาง หรือ 'center'
   * ระหว่างบิน การ์ดจริงที่ปลายทางถูกซ่อน (hideTarget)
   */
  | {
      id: number;
      kind: 'fly';
      cardId: string;
      from: Rect | string | null;
      to: string;
      /** move = ย้ายโซน (ลง Trash / ขึ้นมือ / เซ็ท Burst), shrink = ย่อลงกลางปลายทาง (ช่อง Trash) */
      mode: 'draw' | 'play' | 'magic' | 'burst' | 'move';
      shrink?: boolean;
      /** บินแบบคว่ำ (เซ็ท Burst) */
      faceDown?: boolean;
      /** ลงสนามแบบหนักหน่วงเป็นพิเศษ (X-Rare) */
      heavy?: boolean;
      timing?: 'main' | 'flash';
      delay: number;
      hideTarget: boolean;
    }
  /** การ์ดขยับเข้าหาเป้าหมายเล็กน้อยแล้วกลับ (ตอนประกาศโจมตี) */
  | { id: number; kind: 'lunge'; cardId: string; target: string; delay: number; max: number }
  /**
   * ตัดสินการต่อสู้: ผู้โจมตีวิ่งไปชนเป้าหมาย (ผู้ป้องกัน หรือตัวผู้เล่นเมื่อโจมตีเข้า Life) แล้ววิ่งกลับ
   * dies = ผู้โจมตีแพ้: กระเด็นกลับที่เดิม แล้วค่อยเล่นภาพถูกทำลายที่ช่องของตัวเอง
   */
  | {
      id: number;
      kind: 'charge';
      cardId: string;
      cardNo: string;
      from: Rect;
      target: Rect | string;
      /** ท่าของการ์ดก่อนวิ่ง / หลังกลับ (นอน = เสื่อมสภาพ) */
      fromExhausted: boolean;
      toExhausted: boolean;
      dies: boolean;
      delay: number;
    }
  /** ภาพการ์ดที่ออกจากสนามไปแล้ว: แตกกระจาย (ถูกทำลาย) หรือจางหาย (สูญสลาย) */
  | {
      id: number;
      kind: 'ghost';
      cardId: string;
      owner: PlayerId;
      /** ลำดับในแถว Spirit เดิม (เว้นช่องว่างไว้จนภาพแตกจบ การ์ดอื่นจะได้ไม่เลื่อนมาทับ) */
      slot: number;
      cardNo: string;
      rect: Rect;
      mode: 'destroy' | 'deplete';
      /** ไม่แสดงอะไรจนถึงเวลาเริ่ม (ผู้โจมตีที่แพ้: ระหว่างนั้นภาพวิ่งชนยังเล่นอยู่) */
      hiddenUntilStart?: boolean;
      delay: number;
    };
type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, 'id'> : never) : never;

export type Rect = { x: number; y: number; w: number; h: number };

/** จับตำแหน่งการ์ด/ช่องบนจอก่อน action เพื่อให้แอนิเมชันบินจากที่เดิมได้แม้การ์ดย้ายโซนไปแล้ว */
/**
 * ตำแหน่งบนจอของการ์ด: จุดกึ่งกลางตามที่เห็นจริง แต่ขนาดตาม layout (ไม่นับ transform)
 * การ์ดในมือแบบพัดถูกหมุน/ยก ขนาดจาก getBoundingClientRect จะเป็นกรอบรอบการ์ดที่เอียง ทำให้สัดส่วนเพี้ยน
 */
export function layoutRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0) return null;
  const w = el instanceof HTMLElement && el.offsetWidth > 0 ? el.offsetWidth : r.width;
  const h = el instanceof HTMLElement && el.offsetHeight > 0 ? el.offsetHeight : r.height;
  return { x: r.left + r.width / 2 - w / 2, y: r.top + r.height / 2 - h / 2, w, h };
}

function snapRects(): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  if (typeof document === 'undefined') return out;
  const grab = (sel: string, key: (el: HTMLElement) => string) => {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const r = layoutRect(el);
      if (r) out[key(el)] = r;
    });
  };
  grab('[data-hand-card]', (el) => `hand:${el.dataset.handCard}`);
  grab('[data-field-card] > div:first-child', (el) => `field:${el.parentElement!.dataset.fieldCard}`);
  grab('[data-burst-card]', (el) => `burst:${el.dataset.burstCard}`);
  return out;
}

let fxSeq = 0;
const who = (p: PlayerId) => (p === 'p1' ? 'ผู้เล่น 1' : 'ผู้เล่น 2');
const effectText = (cardNo: string, i: number) => (db.get(cardNo).effects as TextEffect[])[i]?.text ?? '';

/** เวลาของแต่ละช่วงในไทม์ไลน์ (ms) */
const T = {
  /** ป้ายเทิร์นใหม่ก่อนจั่ว */
  turnBanner: 900,
  /** การ์ดบินลงสนาม + กระแทก */
  land: 820,
  /** X-Rare ลอยค้างแล้วทุบลงสนาม + แรงกระแทก */
  landHeavy: 1350,
  /** การ์ดบนสนามยกขึ้นเรืองแสงก่อนเอฟเฟกต์ทำงาน */
  activate: 900,
  /** Magic / Burst ค้างกลางจอก่อนผลเกิด */
  spell: 1250,
  /** ผู้โจมตีวิ่งถึงเป้าหมาย */
  hit: 450,
  /** ผู้โจมตีวิ่งชนแล้ววิ่งกลับถึงที่เดิม */
  chargeEnd: 1000,
  /** ห่างระหว่างการ์ดที่จั่วต่อเนื่อง */
  drawGap: 160,
  /** ภาพการ์ดแตก/สูญสลาย (ก่อนขั้นถัดไปเริ่ม) */
  ghost: 950,
  /** แสดง chain: เวลาพื้นฐาน + ต่อการ์ด 1 ใบ */
  chainBase: 1100,
  /** ภาพต่อ Chain กลางจอ ก่อนผลของเอฟเฟกต์เกิด (การ์ดบินลงแถบต่อระหว่างที่ผลเกิด) */
  chainLink: 2300,
  chainPer: 350,
  /** FINAL BLOW ก่อนประกาศผู้ชนะ */
  finalBlow: 2600,
  /** X-Rare cut-in ก่อนการ์ดบินลงสนาม (การ์ดเริ่มบินตอน cut-in กำลังจาง) */
  cutIn: 1750,
} as const;

/**
 * แปลง event ของ engine เป็นเอฟเฟกต์ภาพแบบไทม์ไลน์
 * engine ประมวลผลเสร็จในครั้งเดียว แต่ภาพจะเล่นตามลำดับ event: ลงการ์ด → เอฟเฟกต์ทำงาน (ยกขึ้นเรืองแสง) → ผลของเอฟเฟกต์
 * t = เวลาที่ขั้นถัดไปจะเริ่ม
 */
function eventsToFx(events: GameEvent[], s: GameState, prev: GameState, rects: Record<string, Rect>, pick?: unknown): Fx[] {
  const out: FxInput[] = [];
  const newTurn = events.some((e) => e.type === 'turnStarted');
  let t = 0;
  // ผลของการเลือกที่รออยู่: แสดงให้เห็นก่อนว่าเลือกอะไร แล้วผลค่อยตามมา
  const pc = prev.choice;
  const revealed = new Set<string>();
  if (pc?.kind === 'card' && typeof pick === 'string') {
    if (pc.revealed) {
      pc.revealed.forEach((id) => revealed.add(id));
      out.push({ kind: 'reveal', owner: pc.player, cardIds: pc.revealed, chosen: pick, delay: 0, duration: 1250 });
      t = 900;
    } else {
      out.push({ kind: 'target', sourceId: pc.sourceId, targetId: pick, delay: 0, duration: 1000 });
      t = 900;
    }
  }
  if (pc?.kind === 'multiSummon' && typeof pick === 'object' && pick !== null && 'summons' in pick) {
    pc.revealed.forEach((id) => revealed.add(id));
    out.push({ kind: 'reveal', owner: pc.player, cardIds: pc.revealed, chosen: null, delay: 0, duration: 900, title: 'อัญเชิญการ์ดที่เลือก · ที่เหลือไว้ใต้สุดเด็ค' });
    t = 650;
  }
  const fromReveal = (id: string, fallback: string) => (revealed.has(id) ? `[data-reveal-card="${id}"]` : fallback);
  let draws = 0;
  const onAnyField = (id: string) => PLAYERS.some((p) => s.players[p].field.includes(id) || prev.players[p].field.includes(id));

  // การต่อสู้ที่ตัดสินใน action นี้ (ผู้โจมตี/ผู้ป้องกันอาจถูกประกาศใน action เดียวกัน เพราะ Auto Pass)
  const pb = prev.battle;
  const destroyedIds = new Set(events.flatMap((e) => (e.type === 'destroyed' ? [e.cardId] : [])));
  const declared = events.find((e) => e.type === 'attackDeclared');
  const attackerId = pb?.attackerId ?? (declared?.type === 'attackDeclared' ? declared.attackerId : undefined);
  const blockers = [...(pb?.blockers ?? []), ...events.flatMap((e) => (e.type === 'blockDeclared' ? [e.blockerId] : []))];
  let charge: FxInput | null = null;
  let attackerDies = false;
  let defender: PlayerId | null = null;
  if (attackerId) {
    const attacker = prev.cards[attackerId]!;
    defender = opponentOf(attacker.owner);
    const blocked = blockers.length > 0;
    const resolved = blocked
      ? destroyedIds.has(attackerId) || blockers.some((b) => destroyedIds.has(b))
      : events.some((e) => e.type === 'lifeLost' && e.player === defender);
    const from = rects[`field:${attackerId}`];
    if (resolved && from) {
      attackerDies = destroyedIds.has(attackerId);
      const after = s.cards[attackerId]!;
      charge = {
        kind: 'charge',
        cardId: attackerId,
        cardNo: attacker.cardNo,
        from,
        target: blocked ? (rects[`field:${blockers[0]}`] ?? `[data-field-card="${blockers[0]}"] > div`) : `[data-player-target="${defender}"]`,
        fromExhausted: attacker.state === 'exhausted',
        toExhausted: s.players[after.owner].field.includes(attackerId) && after.state === 'exhausted',
        dies: attackerDies,
        delay: 0,
      };
    }
  }
  /** เวลาที่ผู้โจมตีชนเป้าหมาย (เริ่มวิ่งเมื่อถึง event แรกที่เป็นผลของการต่อสู้) */
  let hitAt: number | null = null;
  const battleResult = (e: GameEvent) =>
    !!charge &&
    hitAt === null &&
    ((e.type === 'destroyed' && (e.cardId === attackerId || blockers.includes(e.cardId))) || (e.type === 'lifeLost' && e.player === defender));

  /** ภาพการ์ดแตก/สูญสลายเล่นจบเมื่อไหร่: ขั้นถัดไปต้องรอ ไม่งั้นเอฟเฟกต์ที่ตามมาจะยกเรืองแสงทับกับการ์ดที่กำลังแตก */
  let ghostsEnd = 0;

  // ลำดับใน Chain ของการโจมตีนี้ (เอฟเฟกต์ที่ทำงานตั้งแต่ประกาศโจมตีจนจบการต่อสู้)
  // เทียบด้วยตำแหน่งใน log: events คือท้าย log พอดี (Auto Pass คัดลอก state ใหม่ จึงเทียบ object ตรง ๆ ไม่ได้)
  const chainLog = chainLogIndices(s);
  const chainPos = new Map<GameEvent, number>();
  events.forEach((ev, i) => {
    const at = chainLog.indexOf(s.log.length - events.length + i);
    if (at >= 0) chainPos.set(ev, at);
  });

  for (const e of events) {
    // การ์ดที่ออกจากสนามพร้อมกันแตกพร้อมกันได้ ส่วน event อื่นรอให้ภาพแตกเล่นจบก่อน
    if (e.type !== 'destroyed' && e.type !== 'depleted') t = Math.max(t, ghostsEnd);
    if (battleResult(e)) {
      out.push({ ...charge!, delay: t } as FxInput);
      hitAt = t + T.hit;
      t = hitAt + 250;
    }
    const at = (battleEvent: boolean) => (battleEvent && hitAt !== null ? hitAt : t);

    switch (e.type) {
      case 'turnStarted':
        // รอแอนิเมชันก่อนหน้าเล่นจบก่อน (กระดานจะพลิกฝั่งพร้อมป้ายนี้)
        out.push({ kind: 'banner', tone: 'turn', title: `เทิร์นที่ ${e.turn}`, sub: `${who(e.player)}`, delay: t });
        t += T.turnBanner;
        break;
      case 'phaseChanged':
        if (e.phase === 'attack' && !newTurn) out.push({ kind: 'banner', tone: 'step', title: 'ATTACK STEP', sub: 'เลือกสปิริตที่จะโจมตี' });
        break;
      case 'cardDrawn':
        out.push({
          kind: 'fly',
          cardId: e.cardId,
          from: `[data-deck="${e.player}"]`,
          to: `[data-hand-card="${e.cardId}"]`,
          mode: 'draw',
          delay: t + draws * T.drawGap,
          hideTarget: true,
        });
        draws++;
        break;
      case 'summoned':
      case 'nexusDeployed': {
        const card = s.cards[e.cardId]!;
        const to = `[data-field-card="${e.cardId}"] > div:first-child`;
        draws = 0;
        if (db.get(card.cardNo).rarity === 'X-Rare') {
          // X-Rare: cut-in เล่นก่อน (การ์ดบนสนามซ่อนไว้) แล้วการ์ดใหญ่กลางจอค่อยบินลงสนาม
          const onField = s.players[card.owner].field.includes(e.cardId);
          out.push({
            kind: 'summon',
            cardId: e.cardId,
            level: onField ? cardLevel(s, db, e.cardId) : 0,
            bp: onField ? currentBpSafe(s, e.cardId) : 0,
            delay: t,
          });
          t += T.cutIn;
          out.push({ kind: 'fly', cardId: e.cardId, from: 'center', to, mode: 'play', heavy: true, delay: t, hideTarget: true });
          t += T.landHeavy;
        } else {
          const origin = e.type === 'summoned' ? e.from : undefined;
          const from =
            origin === 'deck'
              ? fromReveal(e.cardId, `[data-deck="${e.player}"]`)
              : origin === 'burst'
                ? (rects[`burst:${e.player}`] ?? 'center')
                : (rects[`hand:${e.cardId}`] ?? null);
          // Brave ที่ร่วมร่าง: บินไปที่ผู้ร่วมร่าง
          const host = Object.values(s.cards).find((c) => c.braves.includes(e.cardId));
          const dest = host ? `[data-brave-card="${e.cardId}"]` : to;
          out.push({ kind: 'fly', cardId: e.cardId, from, to: dest, mode: 'play', delay: t, hideTarget: true });
          t += T.land;
        }
        break;
      }
      case 'effectResolving': {
        // การ์ดบนสนามยกขึ้นเรืองแสง → ผลของเอฟเฟกต์เกิดทันที → การ์ดบินไปต่อท้าย Chain
        const field = onAnyField(e.cardId);
        if (field) out.push({ kind: 'cardActivate', cardId: e.cardId, delay: t, duration: T.activate });
        if (e.source !== null) {
          out.push({ kind: 'activate', cardId: e.cardId, label: 'เอฟเฟกต์ทำงาน', text: effectText(s.cards[e.cardId]!.cardNo, e.source), delay: t });
        }
        const index = chainPos.get(e) ?? -1;
        // ต่อ Chain: การ์ดขึ้นใหญ่กลางจอ "CHAIN n" แล้วบินลงแถบ → ผลของเอฟเฟกต์ตามมา
        if (index >= 0) out.push({ kind: 'chainAdd', cardId: e.cardId, index, delay: t + (field ? T.activate : 0) });
        t += (field ? T.activate : 250) + (index >= 0 ? T.chainLink : 0);
        draws = 0;
        break;
      }
      case 'magicUsed': {
        const cardNo = s.cards[e.cardId]!.cardNo;
        const text = (db.get(cardNo).effects as TextEffect[]).filter((x) => x.timing === e.timing).map((x) => x.text).join(' ');
        out.push({ kind: 'activate', cardId: e.cardId, label: `Magic [${e.timing === 'main' ? 'Main' : 'Flash'}]`, text, delay: t });
        out.push({ kind: 'fly', cardId: e.cardId, from: rects[`hand:${e.cardId}`] ?? null, to: `[data-trash="${e.player}"]`, mode: 'magic', timing: e.timing, delay: t, hideTarget: false });
        t += T.spell;
        draws = 0;
        break;
      }
      case 'burstActivated':
        out.push({ kind: 'banner', tone: 'burst', title: 'BURST!', sub: db.get(s.cards[e.cardId]!.cardNo).name });
        out.push({
          kind: 'fly',
          cardId: e.cardId,
          from: rects[`burst:${e.player}`] ?? `[data-burst-card="${e.player}"]`,
          to: 'center',
          mode: 'burst',
          delay: t,
          hideTarget: false,
        });
        t += T.spell;
        draws = 0;
        break;
      case 'evolved':
        // [Evolution]: สปิริตที่รับ Core ยกขึ้นเรืองแสง
        if (onAnyField(e.cardId)) out.push({ kind: 'cardActivate', cardId: e.cardId, delay: t, duration: T.activate });
        t += T.activate;
        break;
      case 'attackDeclared': {
        if (charge) break; // ตัดสินใน action เดียวกัน: แสดงแค่การวิ่งชน
        const target = opponentOf(s.cards[e.attackerId]!.owner);
        out.push({ kind: 'lunge', cardId: e.attackerId, target: `[data-player-target="${target}"]`, delay: t, max: 36 });
        break;
      }
      case 'destroyed':
      case 'depleted': {
        const rect = rects[`field:${e.cardId}`];
        const battle = e.type === 'destroyed' && (e.cardId === attackerId || blockers.includes(e.cardId));
        // ผู้โจมตีที่แพ้: วิ่งกลับถึงที่เดิมก่อน แล้วค่อยแตก
        const recoil = !!charge && attackerDies && e.cardId === attackerId && hitAt !== null;
        if (rect) {
          const delay = recoil ? hitAt! - T.hit + T.chargeEnd : at(battle);
          const owner = s.cards[e.cardId]!.owner;
          const slot = prev.players[owner].field.filter((id) => db.get(prev.cards[id]!.cardNo).type !== 'nexus').indexOf(e.cardId);
          out.push({ kind: 'ghost', cardId: e.cardId, owner, slot, cardNo: s.cards[e.cardId]!.cardNo, rect, mode: e.type === 'destroyed' ? 'destroy' : 'deplete', delay, hiddenUntilStart: recoil });
          ghostsEnd = Math.max(ghostsEnd, delay + T.ghost);
        }
        break;
      }
      case 'lifeLost':
        if (e.amount > 0) {
          const direct = !!charge && e.player === defender && blockers.length === 0;
          out.push({ kind: 'damage', player: e.player, amount: e.amount, big: direct, delay: at(e.player === defender) });
        }
        break;
      case 'exhausted':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'เสื่อมสภาพ', tone: 'bad', delay: t });
        t += 350;
        break;
      case 'bounced': {
        const rect = rects[`field:${e.cardId}`];
        if (rect) out.push({ kind: 'fly', cardId: e.cardId, from: rect, to: `[data-hand-card="${e.cardId}"]`, mode: 'move', delay: t, hideTarget: true });
        out.push({ kind: 'float', anchor: `[data-hand-card="${e.cardId}"]`, text: 'กลับขึ้นมือ', tone: 'bad', delay: t });
        t += 500;
        break;
      }
      case 'voidCore':
        out.push({
          kind: 'float',
          anchor: e.cardId ? `[data-field-card="${e.cardId}"]` : `[data-reserve="${e.player}"]`,
          text: `+${e.count} Core`,
          tone: 'good',
          delay: t,
        });
        t += 300;
        break;
      case 'soulToReserve':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'Soul Core → Reserve', tone: 'good', delay: t });
        break;
      case 'coresToTrash':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: `-${e.count} Core`, tone: 'bad', delay: t });
        break;
      case 'cardsToDeckBottom':
        e.cardIds.forEach((id, i) =>
          out.push({
            kind: 'fly',
            cardId: id,
            from: fromReveal(id, `[data-deck="${e.player}"]`),
            to: `[data-deck="${e.player}"]`,
            mode: 'move',
            shrink: true,
            faceDown: true,
            delay: t + i * 120,
            hideTarget: false,
          }),
        );
        t += 300;
        break;
      case 'braved': {
        const rect = rects[`field:${e.cardId}`];
        if (rect) {
          out.push({ kind: 'fly', cardId: e.cardId, from: rect, to: `[data-brave-card="${e.cardId}"]`, mode: 'move', delay: t, hideTarget: true });
          t += 450;
        }
        out.push({ kind: 'float', anchor: `[data-field-card="${e.hostId}"]`, text: 'BRAVE!', tone: 'good', delay: t });
        break;
      }
      case 'catalyze':
        out.push({ kind: 'banner', tone: 'burst', title: 'CATALYZE!', sub: db.get(s.cards[e.burstId]!.cardNo).name, delay: t });
        t += 600;
        break;
      case 'lifeGained':
        out.push({ kind: 'float', anchor: `[data-life="${e.player}"]`, text: `+${e.amount} Life`, tone: 'good', delay: t });
        break;
      case 'bpBuffed':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: `BP +${e.amount.toLocaleString()}`, tone: 'good', delay: t });
        break;
      case 'discarded':
        out.push({ kind: 'fly', cardId: e.cardId, from: rects[`hand:${e.cardId}`] ?? null, to: `[data-trash="${e.player}"]`, mode: 'move', shrink: true, delay: t, hideTarget: false });
        break;
      case 'cardsRevealed':
        // ไม่มีใบที่เลือกได้ (ไม่มีการเลือกตามมา): แสดงพัดครู่หนึ่ง แล้วค่อยทิ้งลง Trash
        if (s.choice?.kind !== 'card' || !s.choice.revealed) {
          e.cardIds.forEach((id) => revealed.add(id));
          const toTrash = events.some((x) => x.type === 'milled');
          out.push({ kind: 'reveal', owner: e.player, cardIds: e.cardIds, chosen: null, delay: t, duration: 1550, title: toTrash ? undefined : 'แสดงการ์ดจากเด็ค · ไม่มีใบที่เลือกได้ ไว้ใต้สุดเด็ค' });
          t += 1200;
        }
        break;
      case 'milled':
        e.cardIds.forEach((id, i) =>
          out.push({
            kind: 'fly',
            cardId: id,
            from: fromReveal(id, `[data-deck="${e.player}"]`),
            to: `[data-trash="${e.player}"]`,
            mode: 'move',
            shrink: true,
            delay: t + i * 120,
            hideTarget: false,
          }),
        );
        break;
      case 'cardToHand':
        out.push({
          kind: 'fly',
          cardId: e.cardId,
          from: e.from === 'deck' ? fromReveal(e.cardId, `[data-deck="${e.player}"]`) : `[data-trash="${e.player}"]`,
          to: `[data-hand-card="${e.cardId}"]`,
          mode: 'move',
          delay: t,
          hideTarget: true,
        });
        break;
      case 'burstDiscarded':
        out.push({ kind: 'fly', cardId: e.cardId, from: rects[`burst:${e.player}`] ?? `[data-burst-card="${e.player}"]`, to: `[data-trash="${e.player}"]`, mode: 'move', shrink: true, delay: t, hideTarget: false });
        break;
      case 'burstSet': {
        if (e.replacedCardId) {
          out.push({ kind: 'fly', cardId: e.replacedCardId, from: rects[`burst:${e.player}`] ?? null, to: `[data-trash="${e.player}"]`, mode: 'move', shrink: true, delay: t, hideTarget: false });
        }
        const set = s.players[e.player].burst;
        if (set) out.push({ kind: 'fly', cardId: set, from: rects[`hand:${set}`] ?? null, to: `[data-burst-card="${e.player}"]`, mode: 'move', delay: t, hideTarget: false, faceDown: true });
        break;
      }
      case 'gameOver': {
        // ประกาศผลหลังแอนิเมชันทั้งหมดเล่นจบ; แพ้เพราะ Life เป็น 0 = FINAL BLOW ตรงจังหวะที่โดนตี
        const end = Math.max(t, ...out.map(fxEnd));
        let at = end + 300;
        if (e.reason === 'lifeZero') {
          const loser = opponentOf(e.winner);
          const hit = [...out].reverse().find((f) => f.kind === 'damage' && f.player === loser);
          const fb = hit?.delay ?? end;
          out.push({ kind: 'finalBlow', loser, winner: e.winner, delay: fb });
          at = Math.max(end + 300, fb + T.finalBlow);
        }
        out.push({
          kind: 'banner',
          tone: 'win',
          title: `${who(e.winner)} ชนะ!`,
          sub: { lifeZero: 'Life ของคู่แข่งเป็น 0', deckOut: 'เด็คของคู่แข่งหมด', concede: 'คู่แข่งยอมแพ้' }[e.reason],
          delay: at,
        });
        break;
      }
    }
  }
  return out.map((f) => ({ ...f, id: ++fxSeq }) as Fx);
}

/** เวลาที่การ์ดทุบลงสนาม (ms หลังเริ่มบิน) = duration ของการบินใน FlyCard */
/** เวลาของภาพการ์ดออกจากสนาม (ms): แตก/รวมฝุ่น → ดวงวิญญาณลอยลง Trash */
export const GHOST_MS = { destroyBreak: 380, destroy: 1300, depleteGather: 700, deplete: 1450 } as const;

export const PLAY_HIT = { normal: 560, heavy: 900 } as const;

/** เวลาที่ FX หนึ่งเล่นจบ (โดยประมาณ) ใช้หาจุดจบของไทม์ไลน์ */
function fxEnd(f: FxInput): number {
  const d = 'delay' in f ? (f.delay ?? 0) : 0;
  switch (f.kind) {
    case 'fly':
      return d + (f.mode === 'play' && f.heavy ? 1100 : { draw: 420, move: 480, play: 640, magic: 2000, burst: 1900 }[f.mode]);
    case 'summon':
      return d + 1900;
    case 'cardActivate':
    case 'chain':
    case 'reveal':
    case 'target':
      return d + f.duration;
    case 'charge':
      return d + T.chargeEnd;
    case 'ghost':
      return d + (f.mode === 'destroy' ? GHOST_MS.destroy : GHOST_MS.deplete);
    case 'damage':
      return d + 1100;
    case 'float':
      return d + 1000;
    case 'lunge':
      return d + 600;
    case 'banner':
      return f.tone === 'win' ? 0 : 1400;
    default:
      return d;
  }
}

/**
 * Chain ของการโจมตีล่าสุด: เอฟเฟกต์ที่ทำงานตั้งแต่ประกาศโจมตีจนจบการต่อสู้ (เรียงตามลำดับที่เกิด)
 * ทุกอันเกิดผลทันทีที่ทำงาน แถบ Chain แค่แสดงว่าในการโจมตีนี้มีอะไรต่อกันมาแล้วบ้าง
 */
/** ผู้เล่นที่อยู่ฝั่งล่างของจอ (ถือเป็น "ฝั่งเรา" ตอนแสดงผล) */
export const viewPlayer = (st: { fixedView: boolean; viewTurn: PlayerId; online: OnlineState | null }): PlayerId =>
  st.online ? st.online.me : st.fixedView ? 'p1' : st.viewTurn;

/**
 * การ์ดบนมือ/Burst ของผู้เล่นนี้ต้องคว่ำไว้สำหรับคนที่ดูจอนี้หรือไม่
 * ออนไลน์ = ของคู่แข่งคว่ำเสมอ, เล่นเครื่องเดียว = ตามตัวเลือก "ซ่อนมือฝ่ายที่ไม่ได้ตัดสินใจ"
 */
export const hiddenFrom = (st: { online: OnlineState | null; hideIdleHand: boolean; state: GameState }, owner: PlayerId): boolean =>
  st.online ? owner !== st.online.me : st.hideIdleHand && actingPlayer(st.state) !== owner;

/** ผู้เล่นนี้กดสั่งงานจากเครื่องนี้ได้หรือไม่ (ออนไลน์ = เฉพาะที่นั่งของเรา) */
export const controls = (st: { online: OnlineState | null }, player: PlayerId | null | undefined): boolean =>
  !st.online || (st.online.status === 'playing' && player === st.online.me);

export function chainEntries(s: GameState): Extract<GameEvent, { type: 'effectResolving' }>[] {
  return chainLogIndices(s).map((i) => s.log[i] as Extract<GameEvent, { type: 'effectResolving' }>);
}

/**
 * ตำแหน่งใน log ของเอฟเฟกต์ที่อยู่ใน Chain ปัจจุบัน
 * แบ่ง 2 ช่วงตาม Flash Timing: ช่วงประกาศโจมตี (→ Flash ก่อนป้องกัน) และช่วงประกาศป้องกัน (→ Flash ก่อนตัดสิน)
 */
function chainLogIndices(s: GameState): number[] {
  let start = -1;
  for (let i = s.log.length - 1; i >= 0; i--) {
    if (s.log[i]!.type === 'attackDeclared') {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  // ประกาศป้องกันแล้ว = เริ่ม Chain ใหม่
  for (let i = start + 1; i < s.log.length; i++) {
    const e = s.log[i]!;
    if (e.type === 'battleEnded' || e.type === 'turnStarted') break;
    if (e.type === 'blockDeclared') {
      start = i;
      break;
    }
  }
  const out: number[] = [];
  for (let i = start + 1; i < s.log.length; i++) {
    const e = s.log[i]!;
    if (e.type === 'battleEnded' || e.type === 'turnStarted') break;
    if (e.type === 'effectResolving') out.push(i);
  }
  return out;
}

/** อัปเดต fx และพลิกกระดานไปฝั่งผู้เล่นเทิร์นปัจจุบันเมื่อไม่มีแอนิเมชันที่ต้องเล่นให้จบแล้ว */
function settleView(s: { state: GameState; viewTurn: PlayerId }, fx: Fx[]): { fx: Fx[]; viewTurn: PlayerId } {
  return { fx, viewTurn: isFxBlocking(fx) ? s.viewTurn : s.state.turnPlayer };
}

/** แอนิเมชันที่ต้องเล่นให้จบก่อนผู้เล่นตัดสินใจต่อ (ลงการ์ด, เอฟเฟกต์ทำงาน, Magic/Burst, วิ่งชน, cut-in) */
export function isFxBlocking(fx: Fx[]): boolean {
  return fx.some(
    (f) =>
      f.kind === 'cardActivate' ||
      f.kind === 'chain' ||
      f.kind === 'reveal' ||
      f.kind === 'chainAdd' ||
      f.kind === 'target' ||
      f.kind === 'finalBlow' ||
      (f.kind === 'banner' && f.tone === 'win' && (f.delay ?? 0) > 0) ||
      f.kind === 'charge' ||
      f.kind === 'summon' ||
      (f.kind === 'fly' && f.mode !== 'draw'),
  );
}

function currentBpSafe(s: GameState, cardId: string): number {
  const def = db.get(s.cards[cardId]!.cardNo);
  if (!isSpiritLike(def)) return 0;
  const level = cardLevel(s, db, cardId);
  return def.levels.find((l) => l.level === level)?.bp ?? 0;
}

// ---------------------------------------------------------------- Core motion

/** หน่วงเวลาให้ Core บินตรงกับไทม์ไลน์: Core จากการ์ดที่ออกจากสนามตามภาพแตก, Core ไลฟ์ตามตัวเลขดาเมจ */
function coreDelays(prev: GameState, next: GameState, fx: Fx[]): Map<string, number> {
  const ghostAt = new Map<string, number>();
  const damageAt = new Map<PlayerId, number>();
  for (const f of fx) {
    if (f.kind === 'ghost') ghostAt.set(f.cardId, f.delay + (f.mode === 'destroy' ? GHOST_MS.destroyBreak : 300));
    if (f.kind === 'damage' && !damageAt.has(f.player)) damageAt.set(f.player, f.delay);
  }
  const out = new Map<string, number>();
  for (const id of Object.keys(next.cores)) {
    const loc = locateCore(prev, id);
    if (!loc) continue;
    if (loc.area === 'card' && ghostAt.has(loc.cardId)) out.set(id, ghostAt.get(loc.cardId)!);
    else if (loc.area === 'life' && damageAt.has(loc.player)) out.set(id, damageAt.get(loc.player)!);
  }
  return out;
}

// ---------------------------------------------------------------- SFX

/** เล่นเสียงตามไทม์ไลน์ของ FX ชุดใหม่ */
function playFxSounds(list: Fx[]) {
  for (const f of list) {
    switch (f.kind) {
      case 'banner':
        if (f.tone !== 'win') sfx(f.tone === 'turn' ? 'turn' : f.tone === 'step' ? 'step' : 'burst');
        break;
      case 'finalBlow':
        sfx('impact', f.delay);
        sfx('shatter', f.delay + 120);
        sfx('bigdamage', f.delay + 380);
        sfx('burst', f.delay + 420);
        break;
      case 'summon':
        sfx('xrare', f.delay);
        break;
      case 'fly':
        if (f.mode === 'draw') sfx('draw', f.delay);
        else if (f.mode === 'play' && f.heavy) {
          sfx('swish', f.delay);
          sfx('whoosh', f.delay + PLAY_HIT.heavy - 160);
          sfx('impact', f.delay + PLAY_HIT.heavy);
          sfx('bigdamage', f.delay + PLAY_HIT.heavy + 20);
          sfx('place', f.delay + PLAY_HIT.heavy + 40);
        } else if (f.mode === 'play') {
          sfx('swish', f.delay);
          sfx('whoosh', f.delay + PLAY_HIT.normal - 130);
          sfx('place', f.delay + PLAY_HIT.normal);
          sfx('impact', f.delay + PLAY_HIT.normal + 10);
        }
        else if (f.mode === 'magic') sfx(f.timing === 'flash' ? 'flash' : 'magic', f.delay);
        else if (f.mode === 'move') sfx('draw', f.delay);
        break;
      case 'cardActivate':
        sfx('activate', f.delay);
        break;
      case 'chainAdd':
        sfx('chain', f.delay + 300);
        break;
      case 'chain':
        f.cardIds.forEach((_, i) => sfx('chain', f.delay + i * 350));
        sfx('resolve', f.delay + f.duration - 650);
        break;
      case 'lunge':
        sfx('swish', f.delay);
        break;
      case 'target':
        sfx('core', f.delay);
        sfx('activate', f.delay + 250);
        break;
      case 'reveal':
        if (f.chosen) sfx('buff', f.delay + 100);
        else f.cardIds.forEach((_, i) => sfx('draw', f.delay + i * 90));
        break;
      case 'charge':
        sfx('whoosh', f.delay + 150);
        sfx('impact', f.delay + 450);
        break;
      case 'ghost':
        if (f.mode === 'destroy') {
          sfx('impact', f.delay + 60);
          sfx('shatter', f.delay + GHOST_MS.destroyBreak);
          sfx('whoosh', f.delay + GHOST_MS.destroyBreak + 350);
        } else {
          sfx('fade', f.delay);
          sfx('whoosh', f.delay + GHOST_MS.depleteGather + 250);
        }
        sfx('draw', f.delay + (f.mode === 'destroy' ? GHOST_MS.destroy : GHOST_MS.deplete) - 120);
        break;
      case 'damage':
        sfx(f.big ? 'bigdamage' : 'damage', f.delay);
        break;
      case 'float':
        if (f.tone === 'good') sfx('buff', f.delay ?? 0);
        break;
    }
  }
}

// ---------------------------------------------------------------- ลากการ์ดจากมือ

/** ปล่อยการ์ดบนมือที่สนาม จะทำอะไร (null = ปล่อยไม่ได้) */
export function handFieldAction(s: GameState, cardId: string): { kind: PlayKind; timing?: MagicTiming; label: string } | null {
  const card = s.cards[cardId];
  if (!card || !s.players[card.owner].hand.includes(cardId)) return null;
  const def = db.get(card.cardNo);
  const main = inMain(s) && card.owner === s.turnPlayer;
  const flash = flashPlayer(s) === card.owner;
  if (def.type === 'magic') {
    const t = magicTimings(card.cardNo);
    if (flash) return t.includes('flash') ? { kind: 'useMagic', timing: 'flash', label: 'ปล่อยเพื่อใช้ Magic [Flash]' } : null;
    if (!main) return null;
    if (t.length === 0) return { kind: 'useMagic', label: 'ปล่อยเพื่อใช้ Magic' };
    const timing: MagicTiming = t.includes('main') ? 'main' : 'flash';
    return { kind: 'useMagic', timing, label: `ปล่อยเพื่อใช้ Magic [${timing === 'main' ? 'Main' : 'Flash'}]` };
  }
  if (flash && canQuickSummon(s, cardId)) return { kind: 'summon', label: 'ปล่อยเพื่ออัญเชิญ [Quick]' };
  if (!main) return null;
  if (def.type === 'nexus') return { kind: 'deployNexus', label: 'ปล่อยเพื่อวาง Nexus' };
  return { kind: 'summon', label: 'ปล่อยเพื่ออัญเชิญ' };
}

/** ปล่อยการ์ดบนมือที่ช่อง Burst ได้หรือไม่ */
export function canDropBurst(s: GameState, cardId: string): boolean {
  const card = s.cards[cardId];
  if (!card || !s.players[card.owner].hand.includes(cardId)) return false;
  return inMain(s) && card.owner === s.turnPlayer && db.get(card.cardNo).burst && !s.burstSetThisTurn;
}

// ---------------------------------------------------------------- จัด Core (ร่าง)

/** ย้าย Core ในภาพร่างโดยไม่ตรวจสูญสลาย (ยังไม่ส่งไป engine) */
function draftMove(view: GameState, cores: string[], to: CoreTarget): GameState {
  const s = structuredClone(view);
  for (const id of cores) {
    const loc = locateCore(s, id);
    if (!loc) continue;
    const from = loc.area === 'card' ? s.cards[loc.cardId]!.cores : loc.area === 'reserve' ? s.players[loc.player].reserve : null;
    if (!from) continue;
    from.splice(from.indexOf(id), 1);
    if ('cardId' in to) s.cards[to.cardId]!.cores.push(id);
    else s.players[s.cores[id]!.owner].reserve.push(id);
  }
  return s;
}

/** การย้ายสุทธิจากสถานะจริงไปยังภาพร่าง */
function netMoves(truth: GameState, view: GameState): { coreId: string; to: CoreTarget }[] {
  const moves: { coreId: string; to: CoreTarget }[] = [];
  for (const id of Object.keys(view.cores)) {
    const a = locateCore(truth, id);
    const b = locateCore(view, id);
    if (!a || !b || (b.area !== 'reserve' && b.area !== 'card')) continue;
    const same = a.area === b.area && (a.area !== 'card' || (b.area === 'card' && a.cardId === b.cardId));
    if (!same) moves.push({ coreId: id, to: b.area === 'card' ? { cardId: b.cardId } : { area: 'reserve' } });
  }
  return moves;
}

/** การ์ดที่จะสูญสลายถ้ายืนยันการจัด Core ตอนนี้ */
export function draftDepleting(truth: GameState | null, view: GameState): string[] {
  if (!truth) return [];
  const moves = netMoves(truth, view);
  if (moves.length === 0) return [];
  const r = applyAction(truth, { type: 'moveCores', player: truth.turnPlayer, moves }, db);
  if (!r.ok) return [];
  return truth.players[truth.turnPlayer].field.filter((id) => !r.state.players[truth.turnPlayer].field.includes(id));
}

// ---------------------------------------------------------------- store

interface Store {
  state: GameState;
  seed: number;
  history: GameState[];
  error: string | null;
  decks: DeckChoice;
  hideIdleHand: boolean;
  /** true = ผู้เล่น 1 อยู่ล่างเสมอ, false = ผู้เล่นที่ถือเทิร์นอยู่ล่าง */
  fixedView: boolean;
  /** ผู้เล่นเทิร์นที่กระดานแสดงอยู่: เปลี่ยนตาม state หลังแอนิเมชันที่ต้องเล่นให้จบเล่นจบแล้ว (กระดานไม่พลิกกลางแอนิเมชัน) */
  viewTurn: PlayerId;
  /** แสดงเอฟเฟกต์ภาพ (ป้าย, cut-in, ป๊อปอัป, ตัวเลขลอย) */
  animations: boolean;
  /** Pass/ไม่ป้องกันให้อัตโนมัติเมื่อไม่มีตัวเลือก */
  autoPass: boolean;
  /** คิวเอฟเฟกต์ภาพที่กำลังแสดง */
  fx: Fx[];

  /** การ์ดบนมือที่เปิดเมนูอยู่ */
  selectedHandCard: string | null;
  /** Core ที่เลือกไว้ (คลิกเลือกหลายดวงแล้วลาก/คลิกปลายทาง) */
  selectedCores: string[];
  /** Core ที่กำลังลาก */
  dragging: string[] | null;
  play: { cardId: string; kind: PlayKind; timing?: MagicTiming; braveOnto?: string } | null;
  /** สปิริตที่กำลังเลือก Core สำหรับ [Evolution] */
  evolveCard: string | null;
  /** แผงรายละเอียด: การ์ดที่ชี้อยู่ และการ์ดที่คลิกปักไว้ */
  hovered: string | null;
  pinned: string | null;
  /** ดู Trash ของผู้เล่น */
  trashView: PlayerId | null;

  newGame(): void;
  setDeck(player: PlayerId, deck: DeckId): void;
  dispatch(action: Action): boolean;
  /** ทำ action กับ state ในเครื่อง (silent = ไม่มีแอนิเมชัน/เสียง, remote = มาจากห้องออนไลน์: ไม่แสดง error) */
  applyLocal(action: Action, opts?: { silent?: boolean; remote?: boolean }): boolean;
  /** การเล่นออนไลน์ (null = เล่นเครื่องเดียว) */
  online: OnlineState | null;
  onlineHost(deck: DeckId): Promise<void>;
  onlineJoin(code: string, deck: DeckId): Promise<void>;
  onlineLeave(): void;
  /** เจ้าของห้อง: เริ่มเกมใหม่ในห้องเดิม */
  onlineRematch(): void;
  undo(): void;
  clearError(): void;
  toggleHideIdleHand(): void;
  toggleFixedView(): void;
  toggleAnimations(): void;
  toggleAutoPass(): void;
  dismissFx(id: number): void;
  /** FX ที่รอเวลาครบแล้ว: แสดงทันที (delay = 0) */
  showFx(id: number): void;
  /** ข้ามแอนิเมชันที่กำลังเล่นทั้งหมด */
  skipFx(): void;

  hover(cardId: string | null): void;
  pin(cardId: string | null): void;
  openTrash(player: PlayerId | null): void;

  clickHandCard(cardId: string): void;
  openPlay(cardId: string, kind: PlayKind, timing?: MagicTiming, braveOnto?: string): void;
  closePlay(): void;
  openEvolve(cardId: string): void;
  closeEvolve(): void;
  /** ยืนยัน [Evolution] ด้วย Core ที่เลือกไว้ */
  confirmEvolve(): void;
  /** ตอบการเลือกที่รออยู่ */
  choose(pick: ChoicePick): void;

  toggleCore(coreId: string): void;
  clearCores(): void;
  startDrag(coreId: string): void;
  endDrag(): void;
  /** การ์ดบนมือที่กำลังลาก */
  handDrag: string | null;
  startHandDrag(cardId: string): void;
  endHandDrag(): void;
  /** ปล่อยการ์ดที่ลากจากมือ: สนาม = อัญเชิญ/วาง Nexus/ใช้ Magic, burst = เซ็ท Burst */
  dropHand(on: 'field' | 'burst'): void;
  /** Brave บนสนาม (เดี่ยว หรือร่วมร่างอยู่) ที่กำลังลาก */
  braveDrag: string | null;
  startBraveDrag(cardId: string): void;
  endBraveDrag(): void;
  /** ปล่อย Brave ที่ลาก: บนสปิริต = ร่วมร่าง/ย้ายผู้ร่วมร่าง, 'field' = แยกร่าง */
  dropBrave(on: string | 'field'): void;
  /** ย้าย Core ที่ลาก/เลือกไว้ไปที่ปลายทาง (Main Step = จัดในภาพร่าง ยังไม่สูญสลาย) */
  moveCoresTo(to: CoreTarget): void;
  /**
   * สถานะจริงของ engine ระหว่างจัด Core (null = ไม่ได้จัดอยู่)
   * ระหว่างจัด state คือภาพร่างที่แสดงบนกระดาน
   */
  truth: GameState | null;
  /** ยืนยันการจัด Core (ส่งการย้ายทั้งหมดไป engine ทีเดียว ตรวจสูญสลายตอนนี้) */
  confirmCores(): void;
  /** ยกเลิกการจัด Core */
  cancelCores(): void;
  clickFieldCard(cardId: string): void;
}

// ---------------------------------------------------------------- เล่นออนไลน์

export interface OnlineState {
  code: string;
  me: PlayerId;
  uid: string;
  /** ชื่อ transport ที่ใช้ (Firebase / ทดสอบในเครื่อง) */
  via: string;
  status: 'waiting' | 'playing';
  /** ค่าตั้งต้นของรอบปัจจุบัน (null = ยังรอคู่แข่ง) */
  setup: RoomSetup | null;
  /** จำนวน action ของรอบนี้ที่ทำแล้ว */
  applied: number;
  opponentHere: boolean;
}

/** ?online=local = ทดสอบ 2 แท็บในเครื่องเดียว (ไม่ใช้ Firebase) */
const useLocal = typeof location !== 'undefined' && new URLSearchParams(location.search).get('online') === 'local';
const transport: Transport = useLocal ? localTransport : firebaseTransport;
/** เล่นออนไลน์ได้หรือไม่ (ตั้งค่า Firebase แล้ว หรือใช้โหมดทดสอบในเครื่อง) */
export const onlineAvailable = useLocal || firebaseConfigured;
export const onlineVia = transport.name;

const SESSION = 'bs-online';
const randomCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const clearSession = () => sessionStorage.removeItem(SESSION);

let unsubRoom: (() => void) | null = null;
let unsubActions: (() => void) | null = null;
/** ช่องถัดไปที่จะเขียน action ของเรา */
let nextIndex = 0;
/** action ที่มาก่อนลำดับ (รอจนลำดับต่อเนื่อง) */
const buffer = new Map<number, Action>();
/** action ลำดับก่อนหน้านี้มีอยู่แล้วตอนเข้าห้อง: เล่นซ้ำแบบเงียบ */
let silentBelow = 0;

function stopSync() {
  unsubRoom?.();
  unsubActions?.();
  unsubRoom = unsubActions = null;
  buffer.clear();
}

function enterRoom(code: string, me: PlayerId, uid: string) {
  stopSync();
  sessionStorage.setItem(SESSION, JSON.stringify({ code, me, via: transport.name }));
  useGame.setState({ online: { code, me, uid, via: transport.name, status: 'waiting', setup: null, applied: 0, opponentHere: me === 'p2' }, error: null });
  unsubRoom = transport.watchRoom(code, (info) => onRoom(code, info));
}

function onRoom(code: string, info: RoomInfo | null) {
  const on = useGame.getState().online;
  if (!on || on.code !== code) return;
  if (!info) {
    stopSync();
    clearSession();
    useGame.setState({ online: null, error: 'ห้องนี้ถูกปิดแล้ว' });
    return;
  }
  const opponentHere = !!info.seats[opponentOf(on.me)];
  const ready = !!info.setup.decks.p2 && !!info.seats.p2;
  if (ready && (on.status !== 'playing' || on.setup?.round !== info.setup.round)) void startRound(code, info.setup, opponentHere);
  else useGame.setState({ online: { ...on, opponentHere } });
}

async function startRound(code: string, setup: RoomSetup, opponentHere: boolean) {
  unsubActions?.();
  unsubActions = null;
  buffer.clear();
  const decks = { p1: setup.decks.p1, p2: setup.decks.p2 ?? setup.decks.p1 } as DeckChoice;
  if (!DECKS[decks.p1] || !DECKS[decks.p2]) {
    useGame.setState({ error: 'เด็คในห้องนี้ไม่มีในเกมเวอร์ชันนี้' });
    return;
  }
  const existing = await transport.countActions(code, setup.round);
  const st = useGame.getState();
  if (!st.online || st.online.code !== code) return;
  silentBelow = existing;
  nextIndex = existing;
  const state = startGame(setup.seed, decks);
  const banner: Fx[] =
    st.animations && existing === 0 ? [{ id: ++fxSeq, kind: 'banner', tone: 'turn', title: 'เทิร์นที่ 1', sub: `${who(state.turnPlayer)} เริ่มก่อน` }] : [];
  useGame.setState({
    ...resetUi,
    state,
    truth: null,
    seed: setup.seed,
    decks,
    history: [],
    error: null,
    pinned: null,
    fx: banner,
    online: { ...st.online, status: 'playing', setup, applied: 0, opponentHere },
  });
  unsubActions = transport.watchActions(code, setup.round, (index, action) => receive(code, setup.round, index, action));
}

function receive(code: string, round: number, index: number, action: Action) {
  buffer.set(index, action);
  for (;;) {
    const st = useGame.getState();
    const on = st.online;
    if (!on || on.code !== code || on.setup?.round !== round) return;
    const a = buffer.get(on.applied);
    if (!a) return;
    buffer.delete(on.applied);
    // action ที่มาถึงทับภาพร่างการจัด Core ของเรา: ใช้สถานะจริงแล้วทำตามลำดับในห้อง
    if (st.truth) useGame.setState({ state: st.truth, truth: null });
    st.applyLocal(a, { silent: on.applied < silentBelow, remote: true });
    const after = useGame.getState().online!;
    useGame.setState({ online: { ...after, applied: on.applied + 1 } });
    nextIndex = Math.max(nextIndex, on.applied + 1);
  }
}

async function sendActions(list: Action[]) {
  const on = useGame.getState().online;
  if (!on?.setup) return;
  for (const a of list) {
    const index = nextIndex++;
    try {
      const ok = await transport.pushAction(on.code, on.setup.round, index, a);
      if (!ok) {
        useGame.setState({ error: 'ส่ง action ไม่สำเร็จ: มี action อื่นมาก่อน ลองใหม่อีกครั้ง' });
        nextIndex = useGame.getState().online?.applied ?? nextIndex;
        return;
      }
    } catch (e) {
      useGame.setState({ error: `ส่ง action ไม่สำเร็จ: ${(e as Error).message}` });
      return;
    }
  }
}

/** รีเฟรชหน้า: กลับเข้าห้องเดิม (ถ้ายังนั่งที่เดิมอยู่) */
async function resumeSession() {
  const raw = sessionStorage.getItem(SESSION);
  if (!raw || !onlineAvailable) return;
  try {
    const { code, me, via } = JSON.parse(raw) as { code: string; me: PlayerId; via: string };
    if (via !== transport.name) return;
    const uid = await transport.signIn();
    const info = await transport.readRoom(code);
    if (!info || info.seats[me] !== uid) {
      clearSession();
      return;
    }
    enterRoom(code, me, uid);
  } catch {
    clearSession();
  }
}
if (typeof window !== 'undefined') setTimeout(() => void resumeSession(), 0);

function startGame(seed: number, decks: DeckChoice): GameState {
  return createGame({
    db,
    seed,
    decks: { p1: expandDeck(DECKS[decks.p1].entries), p2: expandDeck(DECKS[decks.p2].entries) },
  }).state;
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** ล้างสิ่งที่ผู้เล่นเลือกค้างไว้ทุกครั้งที่ state เปลี่ยน */
const resetUi: Pick<Store, 'selectedHandCard' | 'selectedCores' | 'dragging' | 'play' | 'evolveCard'> = {
  selectedHandCard: null,
  selectedCores: [],
  dragging: null,
  play: null,
  evolveCard: null,
};

export const useGame = create<Store>((set, get) => {
  const seed = randomSeed();
  const decks: DeckChoice = { p1: 'sd01', p2: 'sd01' };
  const initial = startGame(seed, decks);
  return {
    state: initial,
    seed,
    history: [],
    error: null,
    decks,
    hideIdleHand: false,
    fixedView: false,
    viewTurn: initial.turnPlayer,
    animations: true,
    autoPass: true,
    online: null,
    onlineHost: async (deck) => {
      try {
        const uid = await transport.signIn();
        const code = randomCode();
        const setup: RoomSetup = { round: 1, seed: randomSeed(), decks: { p1: deck, p2: null } };
        await transport.createRoom(code, { seats: { p1: uid }, setup });
        enterRoom(code, 'p1', uid);
      } catch (e) {
        set({ error: `สร้างห้องไม่สำเร็จ: ${(e as Error).message}` });
      }
    },
    onlineJoin: async (code, deck) => {
      try {
        const uid = await transport.signIn();
        const c = code.trim().toUpperCase();
        await transport.joinRoom(c, uid, deck);
        enterRoom(c, 'p2', uid);
      } catch (e) {
        set({ error: `เข้าห้องไม่สำเร็จ: ${(e as Error).message}` });
      }
    },
    onlineLeave: () => {
      const on = get().online;
      stopSync();
      clearSession();
      if (on) void transport.leave(on.code, on.me).catch(() => {});
      set({ online: null });
      get().newGame();
    },
    onlineRematch: () => {
      const on = get().online;
      if (!on || on.me !== 'p1' || !on.setup) return;
      void transport.setSetup(on.code, { ...on.setup, round: on.setup.round + 1, seed: randomSeed() });
    },
    fx: [{ id: ++fxSeq, kind: 'banner', tone: 'turn', title: 'เทิร์นที่ 1', sub: 'เริ่มเกม' }],
    selectedHandCard: null,
    selectedCores: [],
    dragging: null,
    play: null,
    evolveCard: null,
    hovered: null,
    pinned: null,
    trashView: null,
    truth: null,
    handDrag: null,
    braveDrag: null,

    startBraveDrag: (cardId) => set({ braveDrag: cardId, selectedHandCard: null, selectedCores: [] }),
    endBraveDrag: () => set({ braveDrag: null }),
    dropBrave(on) {
      const { braveDrag, state, dispatch, fx } = get();
      set({ braveDrag: null });
      if (!braveDrag || isFxBlocking(fx)) return;
      const player = state.cards[braveDrag]!.owner;
      if (on !== 'field') {
        dispatch({ type: 'brave', player, braveId: braveDrag, hostId: on });
        return;
      }
      if (!braveHostOf(state, braveDrag)) return;
      const placement = separatePlacement(state, braveDrag);
      if (!placement) {
        sfx('error');
        set({ error: 'Core ในรีเสิร์ฟไม่พอวางบนเบรฟที่แยกร่าง' });
        return;
      }
      dispatch({ type: 'brave', player, braveId: braveDrag, hostId: null, placement });
    },

    startHandDrag(cardId) {
      set({ handDrag: cardId, selectedHandCard: null, selectedCores: [] });
    },
    endHandDrag: () => set({ handDrag: null }),
    dropHand(on) {
      const { handDrag, state, openPlay, dispatch, fx } = get();
      set({ handDrag: null });
      if (!handDrag || isFxBlocking(fx)) return;
      if (on === 'burst') {
        if (canDropBurst(state, handDrag)) dispatch({ type: 'setBurst', player: state.cards[handDrag]!.owner, cardId: handDrag });
        return;
      }
      const a = handFieldAction(state, handDrag);
      if (a) openPlay(handDrag, a.kind, a.timing);
    },

    newGame() {
      const seed = randomSeed();
      const state = startGame(seed, get().decks);
      const fx: Fx[] = get().animations ? [{ id: ++fxSeq, kind: 'banner', tone: 'turn', title: 'เทิร์นที่ 1', sub: `${who(state.turnPlayer)} เริ่มก่อน` }] : [];
      set({ ...resetUi, state, truth: null, seed, history: [], error: null, pinned: null, hovered: null, fx, viewTurn: state.turnPlayer });
    },

    setDeck(player, deck) {
      set({ decks: { ...get().decks, [player]: deck } });
      get().newGame();
    },

    dispatch(action) {
      const on = get().online;
      if (!on) return get().applyLocal(action);
      // ออนไลน์: ตรวจในเครื่องก่อน แล้วส่งเข้าห้อง (ทั้งสองเครื่องทำ action เมื่อได้รับกลับมาตามลำดับ)
      if (on.status !== 'playing') {
        set({ error: 'รอคู่แข่งเข้าห้องก่อน' });
        return false;
      }
      if (action.player !== on.me) {
        sfx('error');
        set({ error: 'ยังไม่ถึงตาคุณ' });
        return false;
      }
      const { truth, state } = get();
      const list: Action[] = [];
      let base = truth ?? state;
      if (truth) {
        const moves = netMoves(truth, state);
        if (moves.length > 0) list.push({ type: 'moveCores', player: truth.turnPlayer, moves });
      }
      if (!(action.type === 'moveCores' && action.moves.length === 0)) list.push(action);
      for (const a of list) {
        const r = applyAction(base, a, db);
        if (!r.ok) {
          sfx('error');
          set({ error: r.error.message });
          return false;
        }
        base = r.state;
      }
      if (list.length === 0) {
        set({ ...resetUi, state: truth ?? state, truth: null });
        return true;
      }
      void sendActions(list);
      return true;
    },

    applyLocal(action, opts = {}) {
      const silent = !!opts.silent;
      const animate = get().animations && !silent;
      const { truth, history } = get();
      const view = get().state;
      const rects = animate ? snapRects() : {};
      const coreRects = animate ? snapCores() : new Map();
      // มีการจัด Core ค้างอยู่: ยืนยันการจัดก่อน แล้วค่อยทำ action
      const state = truth ?? view;
      let base = state;
      const pre: GameEvent[] = [];
      if (truth) {
        const moves = netMoves(truth, view);
        if (moves.length > 0) {
          const r = applyAction(truth, { type: 'moveCores', player: truth.turnPlayer, moves }, db);
          if (!r.ok) {
            set({ error: r.error.message });
            return false;
          }
          base = r.state;
          pre.push(...r.events);
        }
      }
      const result = action.type === 'moveCores' && action.moves.length === 0 ? { ok: true as const, state: base, events: [] } : applyAction(base, action, db);
      if (!result.ok) {
        if (opts.remote) {
          console.warn('online: action ใช้ไม่ได้', action, result.error);
          return false;
        }
        sfx('error');
        set({ error: result.error.message });
        return false;
      }
      const events = [...pre, ...result.events];
      // ออนไลน์: Auto Pass เปิดเสมอ (ทั้งสองเครื่องต้องเดิน state เหมือนกัน)
      const next = get().autoPass || get().online ? autoAdvance(result.state, events) : result.state;
      const newFx = eventsToFx(events, next, state, rects, action.type === 'choose' ? action.pick : undefined);
      const fx = animate ? [...get().fx, ...newFx] : [];
      if (animate) {
        playFxSounds(newFx);
        // มุมมองสลับฝั่งเมื่อเปลี่ยนเทิร์น: ไม่ให้ Core ทั้งกระดานบินข้ามฝั่ง
        const flipped = !get().fixedView && !isFxBlocking(fx) && next.turnPlayer !== get().viewTurn;
        if (!flipped) primeCoreMotion(coreRects, coreDelays(state, next, newFx));
      }
      else if (!silent && pre.length + result.events.length > 0) sfx('click');
      const c = next.choice;
      const preselect =
        c?.kind === 'payCost'
          ? next.players[c.player].reserve.filter((id) => !next.cores[id]!.isSoul).slice(0, c.cost)
          : c?.kind === 'placeCores'
            ? [...next.players[c.player].reserve].sort((a, b) => Number(next.cores[a]!.isSoul) - Number(next.cores[b]!.isSoul)).slice(0, c.min)
            : [];
      // กระดานพลิกเมื่อแอนิเมชันที่กำลังเล่นจบแล้ว (ดู settleView)
      const viewTurn = isFxBlocking(fx) ? get().viewTurn : next.turnPlayer;
      set({ ...resetUi, state: next, truth: null, history: [...history, state].slice(-100), error: null, fx, selectedCores: preselect, viewTurn });
      return true;
    },

    confirmCores() {
      const { truth, state, dispatch } = get();
      if (!truth) return;
      dispatch({ type: 'moveCores', player: state.turnPlayer, moves: [] });
    },
    cancelCores() {
      const { truth } = get();
      if (truth) set({ ...resetUi, state: truth, truth: null });
    },

    undo() {
      if (get().truth) return get().cancelCores();
      const { history } = get();
      const prev = history.at(-1);
      if (!prev) return;
      set({ ...resetUi, state: prev, truth: null, history: history.slice(0, -1), error: null, fx: [], viewTurn: prev.turnPlayer });
    },

    clearError: () => set({ error: null }),
    toggleHideIdleHand: () => set((s) => ({ hideIdleHand: !s.hideIdleHand })),
    toggleFixedView: () => set((s) => ({ fixedView: !s.fixedView })),
    toggleAnimations: () => set((s) => ({ animations: !s.animations, fx: [] })),
    toggleAutoPass: () => set((s) => ({ autoPass: !s.autoPass })),
    dismissFx: (id) => set((s) => settleView(s, s.fx.filter((f) => f.id !== id))),
    showFx: (id) => set((s) => settleView(s, s.fx.map((f) => (f.id === id && 'delay' in f ? { ...f, delay: 0 } : f)))),
    skipFx: () => {
      cancelSfx();
      set((s) =>
        settleView(
          s,
          s.fx.filter((f) => f.kind === 'banner' && (f.tone === 'win' || f.tone === 'turn')).map((f) => ({ ...f, delay: 0 })),
        ),
      );
    },

    hover: (cardId) => {
      if (cardId && cardId !== get().hovered) sfx('hover');
      set({ hovered: cardId });
    },
    pin: (cardId) => set({ pinned: cardId }),
    openTrash: (player) => set({ trashView: player }),

    clickHandCard(cardId) {
      const { state, selectedHandCard, choose } = get();
      set({ pinned: cardId });
      if (isChoiceCandidate(state, cardId)) return choose(cardId);
      if (state.choice) return;
      const owner = state.cards[cardId]!.owner;
      const canPlay = inMain(state)
        ? owner === state.turnPlayer
        : flashPlayer(state) === owner && (magicTimings(state.cards[cardId]!.cardNo).includes('flash') || canQuickSummon(state, cardId));
      if (!canPlay) return;
      set({ selectedHandCard: selectedHandCard === cardId ? null : cardId, selectedCores: [] });
    },

    openPlay: (cardId, kind, timing, braveOnto) => {
      sfx('click');
      set({ play: { cardId, kind, timing, ...(braveOnto ? { braveOnto } : {}) }, selectedHandCard: null });
    },
    closePlay: () => set({ play: null }),
    openEvolve: (cardId) => set({ evolveCard: cardId, selectedHandCard: null, selectedCores: [] }),
    closeEvolve: () => set({ evolveCard: null, selectedCores: [] }),
    confirmEvolve() {
      const { state, evolveCard, selectedCores, dispatch } = get();
      if (!evolveCard || selectedCores.length === 0) return;
      dispatch({ type: 'evolve', player: state.cards[evolveCard]!.owner, cardId: evolveCard, cores: selectedCores });
    },
    choose(pick) {
      const { state, dispatch } = get();
      if (state.choice) dispatch({ type: 'choose', player: state.choice.player, pick });
    },

    toggleCore(coreId) {
      const { state, selectedCores, evolveCard } = get();
      if (!canSelectCore(state, evolveCard, coreId)) return;
      set({
        selectedCores: selectedCores.includes(coreId) ? selectedCores.filter((id) => id !== coreId) : [...selectedCores, coreId],
        selectedHandCard: null,
      });
    },
    clearCores: () => set({ selectedCores: [] }),

    startDrag(coreId) {
      const { state, selectedCores } = get();
      if (!canMoveCore(state, coreId)) return;
      set({ dragging: selectedCores.includes(coreId) ? selectedCores : [coreId], selectedHandCard: null });
    },
    endDrag: () => set({ dragging: null }),

    moveCoresTo(to) {
      const { state, truth, dragging, selectedCores } = get();
      const cores = (dragging ?? selectedCores).filter((id) => canMoveCore(state, id) && !alreadyAt(state, id, to));
      if (cores.length === 0) return set({ dragging: null });
      if ('cardId' in to && !state.players[state.turnPlayer].field.includes(to.cardId)) return set({ dragging: null });
      // จัดในภาพร่าง: ยังไม่ตรวจสูญสลาย จนกว่าจะยืนยัน (หรือทำ action อื่น)
      const view = draftMove(state, cores, to);
      const base = truth ?? state;
      const changed = netMoves(base, view).length > 0;
      if (changed) sfx('core');
      if (get().animations) primeCoreMotion(snapCores());
      set({ state: changed ? view : base, truth: changed ? base : null, selectedCores: [], dragging: null, error: null });
    },

    clickFieldCard(cardId) {
      const { state, selectedCores, moveCoresTo, dispatch, evolveCard, choose } = get();
      const card = state.cards[cardId]!;
      const def = db.get(card.cardNo);
      set({ pinned: cardId });

      if (isChoiceCandidate(state, cardId)) return choose(cardId);
      if (evolveCard || state.choice) return;

      if (selectedCores.length > 0 && card.owner === state.turnPlayer) {
        moveCoresTo({ cardId });
        return;
      }
      if (state.choice || !isSpiritLike(def) || card.state !== 'refresh') return;
      if (state.phase === 'attack' && !state.battle && card.owner === state.turnPlayer) {
        dispatch({ type: 'declareAttack', player: card.owner, attackerId: cardId });
      } else if (state.battle?.step === 'declareBlock' && card.owner !== state.turnPlayer) {
        dispatch({ type: 'declareBlock', player: card.owner, blockerId: cardId });
      }
    },
  };
});

// เครื่องมือทดสอบระหว่างพัฒนา (เฉพาะ dev server)
if (import.meta.env.DEV) (globalThis as { __game?: typeof useGame }).__game = useGame;
