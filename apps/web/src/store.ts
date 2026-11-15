import { create } from 'zustand';
import { cancelSfx, sfx } from './sfx';
import { primeCoreMotion, snapCores } from './motion';
import { firebaseConfigured, firebaseTransport } from './online/firebase';
import { localTransport } from './online/local';
import type { RoomInfo, RoomSetup, Transport } from './online/transport';
import { expandDeck, loadAllCards, validateDeck } from '@bs/cards';
import { deckChoices, deckInfo, deckToken, STARTER_DECKS, type DeckId } from './decks';
import { rarityOf, type TextEffect } from '@bs/cards';
import {
  activatableAbilities,
  baseCost,
  quickAnyCores,
  trashSummonRule,
  applyAction,
  blockersFor,
  magicUsedUp,
  cardLevel,
  currentBp,
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
  type EndReason,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@bs/engine';

/** การ์ดทุกชุดที่ UI ใช้: Starter Deck 01–04 (SD01-…SD04-) */
export const db = loadAllCards();

/** เด็คที่เลือกเล่นได้ (Starter + เด็คที่จัดเองซึ่งถูกกติกา) */
export const playableDecks = (): DeckId[] => deckChoices().filter((id) => validateDeck(deckInfo(id).entries, db).valid);

/** Starter Deck (เด็คที่จัดเองดู decks.ts) */
export const DECKS = STARTER_DECKS;
export type { DeckId };
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
  if (!core || !inMain(s) || core.owner !== s.turnPlayer || !mine(core.owner)) return false;
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
  // ไซเลนท์ฮิล: ใช้คอร์บนการ์ดในสนามได้ด้วย
  const extra = quickAnyCores(s, db, card.owner) ? s.players[card.owner].field.reduce((n, id) => n + s.cards[id]!.cores.length, 0) : 0;
  return reserve.length + extra >= payableCost(s, db, card.owner, def, baseCost(s, db, cardId)) + minCores(def);
}

/** ผู้ร่วมร่างปัจจุบันของ Brave (null = ไม่ได้ร่วมร่าง) */
export function braveHostOf(s: GameState, braveId: string): string | null {
  for (const p of PLAYERS) for (const id of s.players[p].field) if (s.cards[id]!.braves.includes(braveId)) return id;
  return null;
}

/** สปิริตบนสนามที่ Brave ใบนี้ (บนมือ / บนสนาม / ร่วมร่างอยู่) ร่วมร่างได้ตอนนี้ใน Main Step */
export function braveHosts(s: GameState, cardId: string): string[] {
  const card = s.cards[cardId];
  if (!card || !inMain(s) || card.owner !== s.turnPlayer || !mine(card.owner)) return [];
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

/**
 * ตัวเลือกที่ผู้เล่นใช้ได้ใน Flash timing ตอนนี้: Magic [Flash] ที่จ่ายไหว, สปิริตที่ใช้ [Evolution] ได้, การ์ด [Quick],
 * การ์ดบนสนามที่มีเอฟเฟกต์ Flash กดใช้ได้ (activate) และการ์ดในแทรชที่อัญเชิญได้ (trash)
 */
export function responseOptions(
  s: GameState,
  player: PlayerId,
): { magic: string[]; evolve: string[]; quick: string[]; activate: string[]; trash: string[] } {
  // ในการต่อสู้นี้ใช้เอฟเฟกต์แฟลชไม่ได้ (ดุ๊คคิงเทารอส)
  if (flashPlayer(s) !== player || s.battle?.noFlash === player) return { magic: [], evolve: [], quick: [], activate: [], trash: [] };
  const p = s.players[player];
  const cores = p.reserve.length + p.field.reduce((n, id) => n + s.cards[id]!.cores.length, 0);
  const magic = p.hand.filter((id) => {
    const def = db.get(s.cards[id]!.cardNo);
    return (
      def.type === 'magic' &&
      magicTimings(def.cardNo).includes('flash') &&
      payableCost(s, db, player, def) <= cores &&
      !magicUsedUp(s, db, player, def.cardNo, 'flash')
    );
  });
  const evolve = p.field.filter(
    (id) =>
      canEvolve(s, id) &&
      p.field.some((o) => o !== id && isSpiritLike(db.get(s.cards[o]!.cardNo)) && s.cards[o]!.cores.length > 0),
  );
  const quick = p.hand.filter((id) => canQuickSummon(s, id));
  const activate = p.field.filter((id) => activatableAbilities(s, db, player, id).length > 0);
  const trash = p.trashCards.filter((id) => trashSummonRule(s, db, player, id) !== null);
  return { magic, evolve, quick, activate, trash };
}

/**
 * การเลือกการ์ดที่ทำบนกระดานได้: ตัวเลือกทุกใบอยู่บนสนาม หรือบนมือของผู้เลือก
 * (การ์ดที่เปิดจากเด็ค / ใน Trash ยังใช้หน้าต่าง)
 */
export function isInlineChoice(s: GameState): boolean {
  const c = s.choice;
  if (!c || c.kind !== 'card' || c.revealed) return false;
  // Brave ที่ร่วมร่างอยู่ (ไม่อยู่ใน field) ก็เลือกบนกระดานได้
  const onBoard = (id: string) => PLAYERS.some((p) => s.players[p].field.some((f) => f === id || s.cards[f]!.braves.includes(id)));
  return c.candidates.every((id) => onBoard(id) || s.players[c.player].hand.includes(id));
}

/** การ์ดนี้เป็นตัวเลือกของการเลือกบนกระดานตอนนี้หรือไม่ */
export function isChoiceCandidate(s: GameState, cardId: string): boolean {
  return isInlineChoice(s) && s.choice?.kind === 'card' && mine(s.choice.player) && s.choice.candidates.includes(cardId);
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
  if (!core || !loc || !mine(core.owner)) return false;
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
  return blockersFor(s, db, opponentOf(s.turnPlayer));
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
      if (o.magic.length + o.evolve.length + o.quick.length + o.activate.length + o.trash.length === 0) action = { type: 'passFlash', player: fp };
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
  | {
      id: number;
      kind: 'banner';
      title: string;
      sub?: string;
      tone: 'turn' | 'step' | 'burst' | 'win' | 'mini';
      delay?: number;
      /** เจ้าของสเต็ป (ป้ายเล็ก: ฝั่งเราสีฟ้า / คู่แข่งสีแดง) */
      player?: PlayerId;
      /** ห้ามพลิกกระดานจนกว่าป้ายนี้จะแสดงจบ (END STEP) */
      holdView?: boolean;
    }
  /** ฉากจบเกม: สนามผู้แพ้แตก → VICTORY/DEFEAT → แผงสรุปผล (delay = รอแอนิเมชันก่อนหน้า, ระหว่างรอนับเป็นแอนิเมชันที่ต้องเล่นให้จบ) */
  | { id: number; kind: 'result'; winner: PlayerId; reason: EndReason; delay: number }
  /** ฉากเปิดเกม: READY → VS → โยนเหรียญ (heads = ด้านทอง: คนที่ดูจอนี้เริ่มก่อน) → วาร์ป → DUEL */
  | { id: number; kind: 'intro'; heads: boolean; left: IntroSide; right: IntroSide }
  /** FINAL BLOW: การโจมตีที่ทำให้ Life เป็น 0 (เวลาหยุดชั่วครู่ แสงวาบ ข้อความใหญ่ ฝั่งที่แพ้ร้าว) */
  | { id: number; kind: 'finalBlow'; loser: PlayerId; winner: PlayerId; delay: number }
  | { id: number; kind: 'summon'; cardId: string; level: number; bp: number; delay: number; special?: boolean }
  | { id: number; kind: 'activate'; cardId: string; label: string; text: string; delay: number }
  /** การ์ดบนสนามที่เอฟเฟกต์ทำงาน: ยกขึ้น + เรืองแสง ก่อนผลของเอฟเฟกต์จะเกิด */
  | { id: number; kind: 'cardActivate'; cardId: string; delay: number; duration: number; hand?: boolean; brave?: boolean }
  /** เอฟเฟกต์หลายอันทำงานพร้อมกัน: แสดงการ์ดเรียงพร้อมเลขลำดับและโซ่ (CHAIN → RESOLVE) */
  | { id: number; kind: 'chain'; cardIds: string[]; delay: number; duration: number }
  /** การ์ดที่เอฟเฟกต์ทำงานเสร็จ บินเข้าไปต่อท้ายแถบ Chain (index = ลำดับใน Chain) */
  | { id: number; kind: 'chainAdd'; cardId: string; index: number; delay: number }
  /** การ์ดที่เปิดจากเด็คเรียงเป็นพัด (หลังเลือก: ใบที่เลือกยกขึ้นก่อนบินขึ้นมือ / ที่เหลือบินลง Trash) */
  | { id: number; kind: 'reveal'; owner: PlayerId; cardIds: string[]; chosen: string | null; delay: number; duration: number; title?: string }
  /** การ์ดถูกทิ้งจากเด็ค: บินออกมาเรียงหงายทีละใบ ค้างไว้ครู่หนึ่ง แล้วแตกทีละใบลง Trash (owner = เจ้าของเด็ค) */
  | { id: number; kind: 'mill'; owner: PlayerId; cardIds: string[]; delay: number }
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
      /** ลงสนามแบบหนักหน่วงเป็นพิเศษ (M ขึ้นไป) */
      heavy?: boolean;
      /** R: แสงสีฟ้าแวบตอนกระแทกพื้น */
      rare?: boolean;
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
      /** แสดงตั้งตรงเสมอ (ภาพการ์ดถูกทิ้งจากเด็ค: ให้อ่านง่ายไม่ว่าฝั่งไหน) */
      upright?: true;
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
  grab('[data-trash]', (el) => `trash:${el.dataset.trash}`);
  return out;
}

let fxSeq = 0;
const who = (p: PlayerId) => (p === 'p1' ? 'ผู้เล่น 1' : 'ผู้เล่น 2');
const effectText = (cardNo: string, i: number) => (db.get(cardNo).effects as TextEffect[])[i]?.text ?? '';

/** เวลาของแต่ละช่วงในไทม์ไลน์ (ms) */
const T = {
  /** ป้ายสเต็ปเล็ก (Start/Core/Draw/Refresh/Main/End) */
  miniBanner: 900,
  /** ป้ายเทิร์นขึ้นจริง 1.4 วินาที (ป้ายสเต็ปที่ตามมาต้องรอจนจบ) */
  turnBannerFull: 1400,
  /** การ์ดบินลงสนาม + กระแทก */
  land: 820,
  /** X-Rare ลอยค้างแล้วทุบลงสนาม + แรงกระแทก */
  landHeavy: 1350,
  /** การ์ดบนสนามยกขึ้นเรืองแสงก่อนเอฟเฟกต์ทำงาน */
  activate: 1500,
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
  /** cut-in ระดับพิเศษ (XX/XV) ยาวกว่า X */
  cutInSpecial: 2450,
} as const;

/**
 * แปลง event ของ engine เป็นเอฟเฟกต์ภาพแบบไทม์ไลน์
 * engine ประมวลผลเสร็จในครั้งเดียว แต่ภาพจะเล่นตามลำดับ event: ลงการ์ด → เอฟเฟกต์ทำงาน (ยกขึ้นเรืองแสง) → ผลของเอฟเฟกต์
 * t = เวลาที่ขั้นถัดไปจะเริ่ม
 */
/** ตัวเลือก cut-in อัญเชิญ: always = ทุกครั้ง, first = ครั้งแรกของการ์ดชนิดนั้นในเกม, off = ปิด (ลงหนักแทน) */
export type CutInMode = 'always' | 'first' | 'off';
let cutInMode: CutInMode = (() => {
  try {
    const v = localStorage.getItem('bs-cutin');
    return v === 'always' || v === 'off' || v === 'first' ? v : 'first';
  } catch {
    return 'first';
  }
})();

/** ควรเล่น cut-in ให้การอัญเชิญนี้ไหม (first: ดูจาก log ว่าการ์ดชนิดนี้เคยลงสนามมาก่อนในเกมนี้หรือยัง) */
function wantCutIn(s: GameState, events: GameEvent[], e: GameEvent, cardNo: string): boolean {
  if (cutInMode === 'off') return false;
  if (cutInMode === 'always') return true;
  const at = s.log.length - events.length + events.indexOf(e);
  return !s.log.slice(0, at).some((x) => (x.type === 'summoned' || x.type === 'nexusDeployed') && s.cards[x.cardId]?.cardNo === cardNo);
}

/** เวลาบนไทม์ไลน์ FX ของแต่ละ event ในชุดล่าสุด (ms) ใช้หน่วงการแสดงผลบนกระดานให้ตรงกับแอนิเมชัน */
let lastEventAt = new Map<GameEvent, number>();

function eventsToFx(events: GameEvent[], s: GameState, prev: GameState, rects: Record<string, Rect>, pick?: unknown): Fx[] {
  const out: FxInput[] = [];
  lastEventAt = new Map();
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
  /** มีเอฟเฟกต์ทำงานหลังการชนแล้ว: Life ที่เสียต่อจากนี้เป็นผลของเอฟเฟกต์ (ตามไทม์ไลน์ ไม่ใช่จังหวะชน) */
  let effectAfterHit = false;
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
    lastEventAt.set(e, t);

    switch (e.type) {
      case 'turnStarted':
        // รอแอนิเมชันก่อนหน้าเล่นจบก่อน (กระดานจะพลิกฝั่งพร้อมป้ายนี้)
        out.push({ kind: 'banner', tone: 'turn', title: `เทิร์นที่ ${e.turn}`, sub: `${who(e.player)}`, delay: t });
        t += T.turnBannerFull;
        break;
      case 'phaseChanged': {
        if (e.phase === 'attack' && !newTurn) out.push({ kind: 'banner', tone: 'step', title: 'ATTACK STEP', sub: 'เลือกสปิริตที่จะโจมตี' });
        // ป้ายเล็กของสเต็ปช่วงต้นเทิร์น (Start → Core → Draw → Refresh → Main) และ End
        const gotCore = events.some((x) => x.type === 'coreGained' && x.player === s.turnPlayer);
        const mini: Partial<Record<typeof e.phase, [string, string]>> = {
          start: ['START STEP', 'เริ่มเทิร์น'],
          core: ['CORE STEP', gotCore ? 'ได้รับ Core 1 ดวง' : 'เทิร์นแรกของผู้เริ่มก่อน: ไม่ได้รับ Core'],
          draw: ['DRAW STEP', 'จั่วการ์ด'],
          refresh: ['REFRESH STEP', 'ฟื้นสภาพการ์ดและนำ Core ใน Trash กลับ Reserve'],
          main: ['MAIN STEP', 'เล่นการ์ดและจัด Core'],
          end: ['END STEP', 'จบเทิร์น'],
        };
        const m = mini[e.phase];
        if (m) {
          // End Step เป็นของผู้เล่นเทิร์นก่อน (เหตุการณ์ก่อนเปลี่ยนเทิร์น) ที่เหลือเป็นของผู้ถือเทิร์นใหม่
          const owner = e.phase === 'end' ? prev.turnPlayer : s.turnPlayer;
          out.push({ kind: 'banner', tone: 'mini', title: m[0], sub: m[1], delay: t, player: owner, ...(e.phase === 'end' ? { holdView: true } : {}) });
          // Core Step: Core ใหม่โผล่กลางป้าย (ครึ่งหลังนับต่อที่ coreGained)
          t += e.phase === 'core' && gotCore ? T.miniBanner / 2 : T.miniBanner;
        }
        break;
      }
      case 'coreGained':
        if (newTurn) t += T.miniBanner / 2;
        break;
      case 'cardDrawn':
        out.push({
          kind: 'fly',
          cardId: e.cardId,
          // กดจั่วใน Draw Step: ใบแรกบินออกจากการ์ดที่ลอยอยู่กลางจอ
          from: (prev.awaitingDraw === e.player && draws === 0 && promptRect()) || `[data-deck="${e.player}"]`,
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
        // ระดับความหายาก: C/U ปกติ · R แสงฟ้าแวบ · M ลงหนัก · X cut-in · XX/XV cut-in พิเศษ
        const rank = rarityOf(db.get(card.cardNo).rarity)?.rank ?? 0;
        const host0 = Object.values(s.cards).find((c) => c.braves.includes(e.cardId));
        if (rank >= 5 && !host0 && wantCutIn(s, events, e, card.cardNo)) {
          // cut-in เล่นก่อน (การ์ดบนสนามซ่อนไว้) แล้วการ์ดใหญ่กลางจอค่อยทุบลงสนาม
          const onField = s.players[card.owner].field.includes(e.cardId);
          const special = rank >= 6;
          out.push({
            kind: 'summon',
            cardId: e.cardId,
            level: onField ? cardLevel(s, db, e.cardId) : 0,
            bp: onField ? currentBpSafe(s, e.cardId) : 0,
            delay: t,
            special,
          });
          t += special ? T.cutInSpecial : T.cutIn;
          out.push({ kind: 'fly', cardId: e.cardId, from: 'center', to, mode: 'play', heavy: true, delay: t, hideTarget: true });
          t += T.landHeavy;
        } else {
          const heavy = rank >= 4 && !host0;
          const origin = e.type === 'summoned' ? e.from : undefined;
          const from =
            origin === 'deck'
              ? fromReveal(e.cardId, `[data-deck="${e.player}"]`)
              : origin === 'burst'
                ? (rects[`burst:${e.player}`] ?? 'center')
                : origin === 'trash' || (e.type === 'summoned' && e.fromTrash)
                  ? (rects[`trash:${e.player}`] ?? 'center')
                  : (rects[`hand:${e.cardId}`] ?? null);
          // Brave ที่ร่วมร่าง: บินไปที่ผู้ร่วมร่าง
          const host = Object.values(s.cards).find((c) => c.braves.includes(e.cardId));
          const dest = host ? `[data-brave-card="${e.cardId}"]` : to;
          out.push({ kind: 'fly', cardId: e.cardId, from, to: dest, mode: 'play', heavy, rare: rank === 3, delay: t, hideTarget: true });
          t += heavy ? T.landHeavy : T.land;
        }
        break;
      }
      case 'effectResolving': {
        if (hitAt !== null) effectAfterHit = true;
        // การ์ดบนสนามยกขึ้นเรืองแสง → ผลของเอฟเฟกต์เกิดทันที → การ์ดบินไปต่อท้าย Chain
        // การ์ดบนสนาม หรือบนมือ (เอฟเฟกต์ที่ทำงานจากมือ): ยกขึ้นเรืองแสง + จอสลัว
        const inHand = !onAnyField(e.cardId) && PLAYERS.some((p) => s.players[p].hand.includes(e.cardId) || prev.players[p].hand.includes(e.cardId));
        // Brave ที่ร่วมร่างอยู่ (เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ): การ์ด Brave ใบเล็กบนผู้ร่วมร่างยกขึ้น
        const onHost = !onAnyField(e.cardId) && !inHand && Object.values(s.cards).some((c) => c.braves.includes(e.cardId));
        const field = onAnyField(e.cardId) || inHand || onHost;
        if (field) out.push({ kind: 'cardActivate', cardId: e.cardId, delay: t, duration: T.activate, hand: inHand, brave: onHost });
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
        if (e.type === 'destroyed' && e.stays) {
          out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'ถูกทำลาย → อยู่ต่อ (เสื่อมสภาพ)', tone: 'bad', delay: t });
          t += 450;
          break;
        }
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
          // เสีย Life จากการโจมตีเอง = จังหวะชน, จากเอฟเฟกต์ที่ทำงานทีหลัง (เช่น ส่งไลฟ์ลงรีเสิร์ฟ) = ตามคิวเอฟเฟกต์
          const fromBattle = e.player === defender && !effectAfterHit;
          out.push({ kind: 'damage', player: e.player, amount: e.amount, big: direct && fromBattle, delay: at(fromBattle) });
          if (!fromBattle) t += 700;
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
      case 'coresRemoved':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: `-${e.count} Core`, tone: 'bad', delay: t });
        t += 350;
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
        out.push({
          kind: 'float',
          anchor: `[data-field-card="${e.cardId}"]`,
          text: e.amount >= 0 ? `BP +${e.amount.toLocaleString()}` : `BP -${(-e.amount).toLocaleString()}`,
          tone: e.amount >= 0 ? 'good' : 'bad',
          delay: t,
        });
        if (e.amount < 0) t += 500;
        break;
      case 'attackBanned':
        out.push({ kind: 'banner', tone: 'step', title: 'ห้ามโจมตี', sub: `สปิริตของ${who(e.player)}โจมตีไม่ได้ในเทิร์นนี้`, delay: t });
        t += 900;
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
      case 'milled': {
        const fresh = e.cardIds.filter((id) => !revealed.has(id));
        if (fresh.length > 0) {
          out.push({ kind: 'mill', owner: e.player, cardIds: fresh, delay: t });
          t += millDuration(fresh.length) - 600;
        }
        e.cardIds.filter((id) => revealed.has(id)).forEach((id, i) =>
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
        if (fresh.length < e.cardIds.length) t += 250 + (e.cardIds.length - fresh.length) * 120;
        break;
      }
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
          const hit = [...out].reverse().find((f): f is Extract<FxInput, { kind: 'damage' }> => f.kind === 'damage' && f.player === loser);
          const fb = hit?.delay ?? end;
          out.push({ kind: 'finalBlow', loser, winner: e.winner, delay: fb });
          at = Math.max(end + 300, fb + T.finalBlow);
        }
        out.push({ kind: 'result', winner: e.winner, reason: e.reason, delay: at });
        break;
      }
    }
  }
  // ป้ายแสดงทีละอัน และนับ delay ตอนขึ้นมาเป็นอันแรกในคิว: อันที่ตามหลังป้ายอื่นในชุดเดียวกันจึงไม่ต้องรอซ้ำ
  let bannerSeen = false;
  for (const f of out) {
    if (f.kind !== 'banner' || f.tone === 'win') continue;
    if (bannerSeen) f.delay = 0;
    bannerSeen = true;
  }
  return out.map((f) => ({ ...f, id: ++fxSeq }) as Fx);
}

/** เวลาที่การ์ดทุบลงสนาม (ms หลังเริ่มบิน) = duration ของการบินใน FlyCard */
/** เวลาของภาพการ์ดออกจากสนาม (ms): แตก/รวมฝุ่น → ดวงวิญญาณลอยลง Trash */
export const GHOST_MS = { destroyBreak: 380, destroy: 1300, depleteGather: 700, deplete: 1450 } as const;

export const PLAY_HIT = { normal: 560, heavy: 900 } as const;

/** เวลาของภาพการ์ดถูกทิ้งจากเด็ค (ms): ออกทีละใบ → ค้าง → แตกทีละใบ */
export const MILL_MS = { show: 170, fly: 420, hold: 700, brk: 230 } as const;
export const millBreakAt = (n: number, i: number) => (n - 1) * MILL_MS.show + MILL_MS.fly + MILL_MS.hold + i * MILL_MS.brk;
export const millDuration = (n: number) => millBreakAt(n, n - 1) + GHOST_MS.destroy;

/** เวลาที่ FX หนึ่งเล่นจบ (โดยประมาณ) ใช้หาจุดจบของไทม์ไลน์ */
function fxEnd(f: FxInput): number {
  const d = 'delay' in f ? (f.delay ?? 0) : 0;
  switch (f.kind) {
    case 'fly':
      return d + (f.mode === 'play' && f.heavy ? 1100 : { draw: 420, move: 480, play: 640, magic: 2000, burst: 1900 }[f.mode]);
    case 'summon':
      return d + (f.special ? 2600 : 1900);
    case 'cardActivate':
    case 'chain':
    case 'reveal':
    case 'target':
      return d + f.duration;
    case 'charge':
      return d + T.chargeEnd;
    case 'ghost':
      return d + (f.mode === 'destroy' ? GHOST_MS.destroy : GHOST_MS.deplete);
    case 'mill':
      return d + millDuration(f.cardIds.length);
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

/**
 * การ์ด/Core/การเลือกของผู้เล่นนี้ จับต้องได้จากเครื่องนี้หรือไม่ (ออนไลน์ = เฉพาะของที่นั่งเรา)
 * ใช้เฉพาะฝั่ง UI ห้ามใช้ในสิ่งที่ autoAdvance ใช้ตัดสิน (responseOptions, blockCandidates, canEvolve, canQuickSummon)
 * ไม่งั้นสองเครื่องจะเดิน state ต่างกัน
 */
export function mine(player: PlayerId | null | undefined): boolean {
  const on = useGame.getState().online;
  return !on || player === on.me;
}

/** ผู้เล่นนี้กดสั่งงานจากเครื่องนี้ได้หรือไม่ (ออนไลน์ = เฉพาะที่นั่งของเรา) */
export const controls = (st: { online: OnlineState | null }, player: PlayerId | null | undefined): boolean =>
  !st.online || (st.online.status === 'playing' && player === st.online.me);

/**
 * เอฟเฟกต์ที่กำลังทำงานอยู่ตอนนี้ (หัวคิวที่เริ่มแล้ว): การ์ด + ลำดับบรรทัดเอฟเฟกต์ใน CardDef.effects
 * Magic/Burst (ไม่มี source) = บรรทัดตาม timing ที่ใช้ (Burst / [Main] / [Flash] / Magic ไม่มี timing = ทุกบรรทัดที่ไม่ใช่ Burst)
 */
export function resolvingEffect(s: GameState): { cardId: string; lines: number[] } | null {
  const head = s.queue[0];
  if (!head || !head.started || s.winner) return null;
  const cardId = head.sourceId;
  if (head.source !== undefined) return { cardId, lines: [head.source] };
  const card = s.cards[cardId];
  if (!card) return null;
  const effects = db.get(card.cardNo).effects as TextEffect[];
  const idx = (pred: (e: TextEffect) => boolean) => effects.map((e, i) => (pred(e) ? i : -1)).filter((i) => i >= 0);
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]!;
    if (e.type === 'burstActivated' && e.cardId === cardId) return { cardId, lines: idx((x) => x.timing === 'burst') };
    if (e.type === 'magicUsed' && e.cardId === cardId) {
      const t = idx((x) => x.timing === e.timing);
      return { cardId, lines: t.length ? t : idx((x) => x.timing !== 'burst') };
    }
  }
  return { cardId, lines: idx((x) => x.timing !== 'burst') };
}

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

/** ตำแหน่งการ์ดที่ลอยรอให้กดจั่ว (DrawPrompt) */
function promptRect(): Rect | null {
  const el = typeof document === 'undefined' ? null : document.querySelector('[data-draw-prompt]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

/** ยังพลิกกระดานไม่ได้: แอนิเมชันที่ต้องเล่นจบ หรือป้าย END STEP ของเทิร์นก่อนยังแสดงอยู่ */
function viewHeld(fx: Fx[]): boolean {
  return isFxBlocking(fx) || fx.some((f) => f.kind === 'banner' && f.holdView);
}

/** เวลา (performance.now) ที่ Core เกิดใหม่แต่ละดวงต้องโผล่ ใช้ตั้งเวลาใหม่เมื่อกระดานพลิก (Core ถูกวาดใหม่ทั้งหมด) */
const coreAppearAt = new Map<string, number>();

/** อัปเดต fx และพลิกกระดานไปฝั่งผู้เล่นเทิร์นปัจจุบันเมื่อไม่มีแอนิเมชันที่ต้องเล่นให้จบแล้ว */
function settleView(s: { state: GameState; viewTurn: PlayerId }, fx: Fx[]): { fx: Fx[]; viewTurn: PlayerId } {
  const viewTurn = viewHeld(fx) ? s.viewTurn : s.state.turnPlayer;
  if (viewTurn !== s.viewTurn) {
    const now = performance.now();
    const left = new Map<string, number>();
    for (const [id, at] of coreAppearAt) if (at > now) left.set(id, at - now);
    coreAppearAt.clear();
    primeCoreMotion(new Map(), left);
  }
  return { fx, viewTurn };
}

/** แอนิเมชันที่ต้องเล่นให้จบก่อนผู้เล่นตัดสินใจต่อ (ลงการ์ด, เอฟเฟกต์ทำงาน, Magic/Burst, วิ่งชน, cut-in) */
export function isFxBlocking(fx: Fx[]): boolean {
  return fx.some(
    (f) =>
      f.kind === 'cardActivate' ||
      f.kind === 'intro' ||
      f.kind === 'chain' ||
      f.kind === 'reveal' ||
      f.kind === 'mill' ||
      f.kind === 'chainAdd' ||
      f.kind === 'target' ||
      f.kind === 'finalBlow' ||
      (f.kind === 'banner' && f.tone === 'win' && (f.delay ?? 0) > 0) ||
      (f.kind === 'result' && f.delay > 0) ||
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
function coreDelays(prev: GameState, next: GameState, fx: Fx[], events: GameEvent[] = []): Map<string, number> {
  const timeOf = (pred: (e: GameEvent) => boolean) => {
    const e = events.find(pred);
    return e ? lastEventAt.get(e) : undefined;
  };
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
    else if (loc.area === 'card') {
      // Core ที่ออกจากการ์ดด้วยเอฟเฟกต์ (ลง Trash / Soul Core → Reserve)
      const at = timeOf((e) => (e.type === 'coresToTrash' || e.type === 'soulToReserve') && e.cardId === loc.cardId);
      if (at) out.set(id, at);
    }
  }
  // Core ที่เกิดใหม่ (Core Step / Void Core): โผล่ตามจังหวะในไทม์ไลน์
  for (const id of Object.keys(next.cores)) {
    if (prev.cores[id]) continue;
    const loc = locateCore(next, id);
    const at =
      // Core จาก Core Step: โผล่ตอนป้าย CORE STEP แสดงจบ
      timeOf((e) => e.type === 'coreGained' && e.coreId === id) ??
      timeOf((e) => e.type === 'voidCore' && (loc?.area === 'card' ? e.cardId === loc.cardId : e.cardId === null)) ??
      timeOf((e) => e.type === 'voidCore');
    if (at !== undefined) out.set(id, at);
  }
  return out;
}

/** ค่าที่แสดงบนการ์ดแบบหน่วงไว้ (BP / Lv เดิม) จนกว่าแอนิเมชันจะเล่นถึงเอฟเฟกต์ที่ทำให้ค่าเปลี่ยน */
/** ค่าที่แสดงแบบหน่วง: BP/Lv เดิมจนถึง until, สภาพเสื่อมสภาพจนถึง exhaustedUntil (การ์ดที่ฟื้นสภาพด้วยเอฟเฟกต์ทีหลัง) */
export type Hold = { bp?: number; level?: number; until: number; exhaustedUntil?: number };

function computeHolds(prev: GameState, next: GameState, events: GameEvent[], delays: Map<string, number>): Record<string, Hold> {
  const out: Record<string, Hold> = {};
  const now = performance.now();
  for (const p of PLAYERS) {
    for (const id of next.players[p].field) {
      const before = prev.players[p].field.includes(id) ? prev.cards[id]!.cores : [];
      const after = next.cards[id]!.cores;
      // Core ที่เข้า/ออกการ์ดนี้แบบหน่วง (ยังไม่ถึงจังหวะ)
      const entering = after.filter((c) => !before.includes(c) && (delays.get(c) ?? 0) > 0);
      const leaving = before.filter((c) => !after.includes(c) && (delays.get(c) ?? 0) > 0);
      const buffs = events.filter((e): e is Extract<GameEvent, { type: 'bpBuffed' }> => e.type === 'bpBuffed' && e.cardId === id && (lastEventAt.get(e) ?? 0) > 0);
      if (entering.length + leaving.length + buffs.length === 0) continue;
      let at = 0;
      for (const c of [...entering, ...leaving]) at = Math.max(at, delays.get(c)! + 400);
      for (const e of buffs) at = Math.max(at, lastEventAt.get(e)!);
      // สภาพก่อนผลที่หน่วงไว้: ย้อน Core ที่ยังไม่ถึงจังหวะ + หัก BP ที่ยังไม่ได้รับ
      const tmp = structuredClone(next);
      tmp.cards[id]!.cores = [...after.filter((c) => !entering.includes(c)), ...leaving];
      const bp = currentBp(tmp, db, id) - buffs.reduce((n, e) => n + e.amount, 0);
      const level = cardLevel(tmp, db, id);
      if (bp === currentBp(next, db, id) && level === cardLevel(next, db, id)) continue;
      out[id] = { bp, level, until: now + at };
    }
  }
  // ฟื้นสภาพด้วยเอฟเฟกต์ทีหลัง (เช่น ผู้โจมตีที่เนอวาน่าให้ฟื้นสภาพ): แสดงเสื่อมสภาพไว้ก่อนจนถึงจังหวะนั้น
  for (const e of events) {
    if (e.type !== 'cardRefreshed') continue;
    const at = lastEventAt.get(e) ?? 0;
    if (at <= 0) continue;
    out[e.cardId] = { ...(out[e.cardId] ?? { until: 0 }), exhaustedUntil: now + at };
  }
  return out;
}

// ---------------------------------------------------------------- SFX

/** เล่นเสียงตามไทม์ไลน์ของ FX ชุดใหม่ */
function playFxSounds(list: Fx[]) {
  for (const f of list) {
    switch (f.kind) {
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
      case 'mill':
        f.cardIds.forEach((_, i) => {
          sfx('draw', f.delay + i * MILL_MS.show);
          sfx('shatter', f.delay + millBreakAt(f.cardIds.length, i) + GHOST_MS.destroyBreak);
        });
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
  if (!card || !s.players[card.owner].hand.includes(cardId) || !mine(card.owner)) return null;
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
  if (!card || !s.players[card.owner].hand.includes(cardId) || !mine(card.owner)) return false;
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
  /** BP/Lv ที่ยังแสดงค่าเดิมไว้ระหว่างแอนิเมชัน (cardId → ค่าเดิม + เวลาเลิกหน่วง) */
  holds: Record<string, Hold>;

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
  /** หน้าที่แสดงอยู่ */
  screen: Screen;
  setScreen(screen: Screen): void;
  /** ชื่อผู้เล่นของเครื่องนี้ (จำไว้ใน localStorage) */
  playerName: string;
  setPlayerName(name: string): void;
  /** เริ่มเกมเล่นเครื่องเดียวด้วยเด็คที่เลือก แล้วไปหน้ากระดาน */
  startLocal(decks: DeckChoice): void;
  /** มีเกมเครื่องเดียวที่เล่นค้างอยู่ (กลับไปเล่นต่อได้) */
  localInProgress: boolean;
  /** ก่อนเริ่มเกม: คนชนะการเสี่ยง และผู้เริ่มก่อนที่เลือก (null = ยังเลือกอยู่) */
  pregame: { winner: PlayerId; chosen: PlayerId | null } | null;
  /** คนชนะการเสี่ยงเลือกเริ่มก่อน (true) หรือเริ่มหลัง (false) */
  chooseFirst(goFirst: boolean): void;
  /** ฉากเปิดเกมจบ: ปิดฉาก แล้วขึ้นป้ายเทิร์นที่ 1 */
  introDone(id: number): void;
  /** เด็คที่เปิดดูในหน้าเด็ค */
  deckView: DeckId;
  onlineJoin(code: string, deck: DeckId): Promise<void>;
  onlineLeave(): void;
  /** เจ้าของห้อง: เริ่มเกมใหม่ในห้องเดิม */
  onlineRematch(): void;
  undo(): void;
  clearError(): void;
  toggleHideIdleHand(): void;
  toggleFixedView(): void;
  toggleAnimations(): void;
  /** cut-in อัญเชิญการ์ด X ขึ้นไป */
  cutIn: CutInMode;
  setCutIn(mode: CutInMode): void;
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
  /** Burst ที่กำลังลาก (ไปปล่อยที่ Trash = ทิ้ง Burst) */
  burstDrag: string | null;
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

export type Screen = 'home' | 'lobby' | 'decks' | 'builder' | 'game';

function loadName(): string {
  try {
    return localStorage.getItem('bs-name') || 'นักดวล';
  } catch {
    return 'นักดวล';
  }
}

export interface OnlineState {
  code: string;
  me: PlayerId;
  uid: string;
  /** ชื่อ transport ที่ใช้ (Firebase / ทดสอบในเครื่อง) */
  via: string;
  /** waiting = รอคู่แข่ง, choosing = คนชนะการเสี่ยงกำลังเลือกเริ่มก่อน/หลัง, playing = เล่นอยู่ */
  status: 'waiting' | 'choosing' | 'playing';
  /** ค่าตั้งต้นของรอบปัจจุบัน (null = ยังรอคู่แข่ง) */
  setup: RoomSetup | null;
  /** จำนวน action ของรอบนี้ที่ทำแล้ว */
  applied: number;
  opponentHere: boolean;
  /** ชื่อผู้เล่นในห้อง */
  names: Partial<Record<PlayerId, string>>;
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
  useGame.setState({
    online: { code, me, uid, via: transport.name, status: 'waiting', setup: null, applied: 0, opponentHere: me === 'p2', names: {} },
    error: null,
  });
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
  const names = info.names ?? {};
  if (ready && (on.status === 'waiting' || on.setup?.round !== info.setup.round)) {
    useGame.setState({ online: { ...on, names } });
    void startRound(code, info.setup, opponentHere);
  } else if (on.status === 'choosing' && info.setup.first && on.setup?.round === info.setup.round) {
    // คนชนะการเสี่ยงเลือกแล้ว: สร้างเกมด้วยผู้เริ่มก่อนที่เลือก แล้วเริ่มรับ action
    useGame.setState({ online: { ...on, opponentHere, names } });
    beginPlay(code, info.setup, opponentHere, 0);
  } else {
    // ยังรอคู่แข่ง: เก็บ setup ของห้องไว้ (หน้า Lobby แสดงเด็คที่เลือกจริงจากห้อง)
    useGame.setState({ online: { ...on, opponentHere, names, ...(on.status === 'waiting' ? { setup: info.setup } : {}) } });
  }
}

async function startRound(code: string, setup: RoomSetup, opponentHere: boolean) {
  unsubActions?.();
  unsubActions = null;
  buffer.clear();
  const decks = { p1: setup.decks.p1, p2: setup.decks.p2 ?? setup.decks.p1 } as DeckChoice;
  // Starter Deck หรือเด็คที่จัดเอง (รหัส "c:..." มีรายการการ์ดในตัว) ที่ถอดได้และถูกกติกา
  const known = (id: DeckId) => !!DECKS[id] || (id.startsWith('c:') && deckInfo(id).custom && validateDeck(deckInfo(id).entries, db).valid);
  if (!known(decks.p1) || !known(decks.p2)) {
    useGame.setState({ error: 'เด็คในห้องนี้ไม่มีในเกมเวอร์ชันนี้' });
    return;
  }
  const existing = await transport.countActions(code, setup.round);
  const st = useGame.getState();
  if (!st.online || st.online.code !== code) return;
  const me = st.online.me;
  const opp = opponentOf(me);
  const winner = coinWinner(setup.seed);
  const names = st.online.names;
  // ฉากเปิดเกม: จอของคนชนะการเสี่ยงออกหัว จอของอีกฝั่งออกก้อย
  const intro: Fx[] =
    st.animations && existing === 0
      ? matchIntro(winner === me, { name: names[me] ?? st.playerName, deck: decks[me] }, { name: names[opp] ?? 'คู่แข่ง', deck: decks[opp] })
      : [];
  const nav = st.screen === 'lobby' ? {} : { screen: 'game' as const };
  if (setup.first) {
    // เลือกผู้เริ่มก่อนไปแล้ว (เช่น กลับเข้าห้องหลังรีเฟรช)
    useGame.setState({ fx: intro, pregame: { winner, chosen: setup.first }, ...nav });
    beginPlay(code, setup, opponentHere, existing);
    return;
  }
  // ยังไม่ได้เลือก: แสดงกระดานชั่วคราว (ผู้ชนะการเสี่ยงเริ่มก่อน) ระหว่างรอคนชนะเลือก
  useGame.setState({
    ...resetUi,
    state: startGame(setup.seed, decks, winner),
    truth: null,
    seed: setup.seed,
    decks,
    history: [],
    error: null,
    pinned: null,
    fx: intro,
    pregame: { winner, chosen: null },
    online: { ...st.online, status: 'choosing', setup, applied: 0, opponentHere },
    ...nav,
  });
}

/** สร้างเกมของรอบนี้ด้วยผู้เริ่มก่อนที่เลือกแล้ว แล้วเริ่มรับ action (existing = action ที่มีอยู่แล้ว เล่นซ้ำแบบเงียบ) */
function beginPlay(code: string, setup: RoomSetup, opponentHere: boolean, existing: number) {
  unsubActions?.();
  buffer.clear();
  const st = useGame.getState();
  if (!st.online || !setup.first) return;
  const decks = { p1: setup.decks.p1, p2: setup.decks.p2 ?? setup.decks.p1 } as DeckChoice;
  silentBelow = existing;
  nextIndex = existing;
  useGame.setState({
    ...resetUi,
    state: startGame(setup.seed, decks, setup.first),
    truth: null,
    seed: setup.seed,
    decks,
    history: [],
    error: null,
    pinned: null,
    pregame: { winner: st.pregame?.winner ?? coinWinner(setup.seed), chosen: setup.first },
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

/** ผู้เล่นฝั่งหนึ่งในฉากเปิดเกม */
export interface IntroSide {
  name: string;
  deck: string;
}

/** ฉากเปิดเกม (โยนเหรียญ + เลือกเริ่มก่อน/หลัง) ป้ายเทิร์นที่ 1 ขึ้นเมื่อฉากจบ (introDone) */
function matchIntro(heads: boolean, left: IntroSide, right: IntroSide): Fx[] {
  return [{ id: ++fxSeq, kind: 'intro', heads, left, right }];
}

function startGame(seed: number, decks: DeckChoice, firstPlayer?: PlayerId): GameState {
  return createGame({
    db,
    seed,
    // เด็คที่ไม่มีแล้ว (เช่น เด็คตัวอย่างเดิมจากห้องออนไลน์เก่า) ใช้ Starter Deck 01 แทน
    // เด็คที่จัดเอง/หาไม่เจอ: deckInfo จัดการให้ (หาไม่เจอ = Starter Deck 01)
    decks: { p1: expandDeck(deckInfo(decks.p1).entries), p2: expandDeck(deckInfo(decks.p2).entries) },
    ...(firstPlayer ? { firstPlayer } : {}),
    // Draw Step รอผู้เล่นกดจั่วเอง (DrawPrompt)
    config: { manualDraw: true },
  }).state;
}

/** คนชนะการเสี่ยงของรอบออนไลน์ (คำนวณจาก seed ของห้อง: ทั้งสองเครื่องได้ผลเดียวกัน) */
function coinWinner(seed: number): PlayerId {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) & 1) === 0 ? 'p1' : 'p2';
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
    holds: {},
    autoPass: true,
    online: null,
    screen: 'home',
    setScreen: (screen) => set({ screen }),
    playerName: loadName(),
    setPlayerName: (name) => {
      const clean = name.trim().slice(0, 16) || 'นักดวล';
      try {
        localStorage.setItem('bs-name', clean);
      } catch {
        /* ไม่มี storage ก็ใช้ชื่อในหน่วยความจำ */
      }
      set({ playerName: clean });
    },
    localInProgress: false,
    deckView: 'sd01',
    pregame: null,
    startLocal: (decks) => {
      set({ decks });
      get().newGame();
      set({ screen: 'game', localInProgress: true });
    },
    chooseFirst: (goFirst) => {
      const { pregame, online, seed, decks } = get();
      if (!pregame || pregame.chosen) return;
      const first = goFirst ? pregame.winner : opponentOf(pregame.winner);
      sfx('click');
      if (online) {
        if (online.me !== pregame.winner || !online.setup) return;
        void transport.setFirst(online.code, online.setup.round, first);
        return;
      }
      // เล่นเครื่องเดียว: สร้างเกมใหม่ด้วย seed เดิมและผู้เริ่มก่อนที่เลือก
      const state = startGame(seed, decks, first);
      set({ ...resetUi, state, truth: null, history: [], pregame: { ...pregame, chosen: first }, viewTurn: state.turnPlayer });
    },
    introDone: (id) => {
      const st = get();
      const banner: Fx = { id: ++fxSeq, kind: 'banner', tone: 'turn', title: 'เทิร์นที่ 1', sub: `${who(st.state.turnPlayer)} เริ่มก่อน` };
      set({ fx: [...st.fx.filter((f) => f.id !== id), ...(st.animations ? [banner] : [])], viewTurn: st.state.turnPlayer });
    },
    onlineHost: async (deck) => {
      try {
        const uid = await transport.signIn();
        const code = randomCode();
        const setup: RoomSetup = { round: 1, seed: randomSeed(), decks: { p1: deckToken(deck), p2: null } };
        await transport.createRoom(code, { seats: { p1: uid }, setup, names: { p1: get().playerName } });
        enterRoom(code, 'p1', uid);
      } catch (e) {
        set({ error: `สร้างห้องไม่สำเร็จ: ${(e as Error).message}` });
      }
    },
    onlineJoin: async (code, deck) => {
      try {
        const uid = await transport.signIn();
        const c = code.trim().toUpperCase();
        await transport.joinRoom(c, uid, deckToken(deck), get().playerName);
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
      set({ online: null, screen: 'home', localInProgress: false });
      get().newGame();
    },
    onlineRematch: () => {
      const on = get().online;
      if (!on || on.me !== 'p1' || !on.setup) return;
      // รอบใหม่: โยนเหรียญและเลือกผู้เริ่มก่อนใหม่ (ไม่เอา first ของรอบก่อน)
      void transport.setSetup(on.code, { round: on.setup.round + 1, seed: randomSeed(), decks: on.setup.decks });
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
    burstDrag: null,

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
      const d = get().decks;
      const fx: Fx[] = get().animations ? matchIntro(true, { name: 'ผู้เล่น 1', deck: d.p1 }, { name: 'ผู้เล่น 2', deck: d.p2 }) : [];
      // คนชนะการเสี่ยง = ผู้เริ่มก่อนชั่วคราวที่ seed สุ่มได้ (ไม่มีแอนิเมชัน = ใช้ตามนั้นเลย)
      set({ pregame: { winner: state.turnPlayer, chosen: get().animations ? null : state.turnPlayer } });
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
      let holds: Record<string, Hold> = {};
      if (animate) {
        playFxSounds(newFx);
        // มุมมองสลับฝั่งเมื่อเปลี่ยนเทิร์น: ไม่ให้ Core ทั้งกระดานบินข้ามฝั่ง
        // ออนไลน์กระดานไม่พลิกฝั่ง: Core บินตามปกติแม้เปลี่ยนเทิร์น
        const flipped = !get().online && !get().fixedView && !viewHeld(fx) && next.turnPlayer !== get().viewTurn;
        const delays = coreDelays(state, next, newFx, events);
        // จำเวลาโผล่ของ Core เกิดใหม่ไว้ เผื่อกระดานพลิกทีหลัง
        const now = performance.now();
        for (const [id, d] of delays) if (!state.cores[id]) coreAppearAt.set(id, now + d);
        if (!flipped) primeCoreMotion(coreRects, delays);
        // กระดานพลิก: ไม่ให้ Core บิน แต่ Core ที่เกิดใหม่ (Core Step) ยังโผล่ตามจังหวะ
        else primeCoreMotion(new Map(), new Map([...delays].filter(([id]) => !state.cores[id])));
        holds = { ...get().holds, ...computeHolds(state, next, events, delays) };
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
      const viewTurn = viewHeld(fx) ? get().viewTurn : next.turnPlayer;
      set({ ...resetUi, state: next, truth: null, history: [...history, state].slice(-100), error: null, fx, holds, selectedCores: preselect, viewTurn });
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
    cutIn: cutInMode,
    setCutIn: (mode) => {
      cutInMode = mode;
      try {
        localStorage.setItem('bs-cutin', mode);
      } catch {
        /* ไม่มีที่เก็บ: ใช้ได้แค่รอบนี้ */
      }
      set({ cutIn: mode });
    },
    toggleAutoPass: () => set((s) => ({ autoPass: !s.autoPass })),
    dismissFx: (id) => set((s) => settleView(s, s.fx.filter((f) => f.id !== id))),
    showFx: (id) => set((s) => settleView(s, s.fx.map((f) => (f.id === id && 'delay' in f ? { ...f, delay: 0 } : f)))),
    skipFx: () => {
      cancelSfx();
      set({ holds: {} });
      set((s) =>
        settleView(
          s,
          s.fx
            .filter((f) => (f.kind === 'banner' && (f.tone === 'win' || f.tone === 'turn')) || f.kind === 'result' || (f.kind === 'intro' && !s.pregame?.chosen))
            .map((f) => (f.kind === 'banner' || f.kind === 'result' ? { ...f, delay: 0 } : f)),
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
      if (!mine(owner)) return;
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
      if (evolveCard || state.choice || !mine(card.owner)) return;

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
