import { create } from 'zustand';
import { cancelSfx, sfx, type SfxName } from './sfx';
import { primeCoreMotion, snapCores } from './motion';
import { prefs, setPrefs, type HandSort } from './prefs';
import { firebaseConfigured, firebaseTransport } from './online/firebase';
import { localTransport } from './online/local';
import type { DuelMember, DuelRoom, DuelTable, LobbyEntry, RoomInfo, RoomSetup, Transport } from './online/transport';
import { expandDeck, loadAllCards, validateDeck } from '@bs/cards';
import { deckChoices, deckInfo, deckToken, STARTER_DECKS, type DeckId } from './decks';
import { rarityOf, type TextEffect } from '@bs/cards';
import { APP_VERSION } from './changelog';
import {
  activatableAbilities,
  handMagic,
  quickAbility,
  braveFits,
  braveRoom,
  braveToSwap,
  baseCost,
  quickAnyCores,
  trashSummonRule,
  applyAction,
  attackLifeDamage,
  extraSymbols,
  onStageAbilities,
  blockersFor,
  magicUsedUp,
  cardLevel,
  currentBp,
  minCores,
  summonMinCores,
  payableCost,
  magicBanned,
  magicBurstTax,
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
  hasEvolutionNow,
  freezeForCache,
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
/** Core ที่เลือกไว้ตอนเล่นการ์ด: pay = จ่ายคอสต์, place = วางบนการ์ด · manual = ผู้เล่นปรับเอง (ไม่งั้นจัดให้อัตโนมัติ) · pool = Core ที่คลิกได้ */
export type PlayCores = { marks: Record<string, 'pay' | 'place'>; manual: boolean; allowPlace: boolean; pool: string[] };
export type MagicTiming = 'main' | 'flash';

// ---------------------------------------------------------------- บทเรียน (tutorial)

/**
 * ตัวกั้น action ระหว่างเล่นบทเรียน (src/tutorial): guard คืน false = ไม่ให้ทำ action นี้ (ผู้เล่นทำนอกขั้นตอน)
 * after = แจ้งหลัง action ทำสำเร็จ (ใช้เลื่อนขั้นบทเรียน) · null = ไม่ได้เล่นบทเรียน
 */
export interface TutorialHooks {
  guard(action: Action): boolean;
  after(action: Action): void;
}
let tutorialHooks: TutorialHooks | null = null;
export function setTutorialHooks(h: TutorialHooks | null) {
  tutorialHooks = h;
}

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
  // รวม Evolution ที่ได้รับจากการ์ดอื่น (BS08 อามาสึ)
  return hasEvolutionNow(s, db, cardId);
}

/** จังหวะที่ Magic ใบนี้มีตามข้อความเอฟเฟกต์ */
export function magicTimings(cardNo: string): MagicTiming[] {
  return (db.get(cardNo).effects as { timing?: string }[])
    .map((e) => e.timing)
    .filter((t): t is MagicTiming => t === 'main' || t === 'flash');
}

/**
 * การ์ดในมือนี้ใช้เป็นเมจิคได้จังหวะไหน: เมจิค (ตามข้อความ) / สปิริตที่ "ถือว่าเป็นการ์ดเมจิคด้วย" /
 * การ์ดสปิริตที่ได้รับเอฟเฟกต์เมจิคจากการ์ดบนสนาม (คาฉะเนโกะ-อิคุสะ)
 */
export function handMagicTimings(s: GameState, cardId: string): MagicTiming[] {
  const def = db.get(s.cards[cardId]!.cardNo);
  if (def.type === 'magic') return magicTimings(def.cardNo);
  return [...new Set(handMagic(s, db, cardId).map((m) => m.timing))];
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
  // [Quick] ของตัวเอง หรือที่ได้รับจากการ์ดบนสนาม (เกรย์ไนท์)
  const quick = quickAbility(s, db, cardId);
  if (!quick) return false;
  const reserve = s.players[card.owner].reserve;
  const normal = reserve.filter((id) => !s.cores[id]!.isSoul).length;
  if (quick.soul) return normal >= summonMinCores(s, db, cardId) && reserve.some((id) => s.cores[id]!.isSoul);
  // ไซเลนท์ฮิล: ใช้คอร์บนการ์ดในสนามได้ด้วย
  const extra = quickAnyCores(s, db, card.owner) ? s.players[card.owner].field.reduce((n, id) => n + s.cards[id]!.cores.length, 0) : 0;
  return reserve.length + extra >= payableCost(s, db, card.owner, def, baseCost(s, db, cardId)) + summonMinCores(s, db, cardId);
}

/** ผู้ร่วมร่างปัจจุบันของ Brave (null = ไม่ได้ร่วมร่าง) */
export function braveHostOf(s: GameState, braveId: string): string | null {
  for (const p of PLAYERS) for (const id of s.players[p].field) if (s.cards[id]!.braves.includes(braveId)) return id;
  return null;
}

/** สปิริตบนสนามที่ Brave ใบนี้ (บนมือ / บนสนาม / ร่วมร่างอยู่) ร่วมร่างได้ตอนนี้ใน Main Step */
export function braveHosts(s: GameState, cardId: string): string[] {
  const card = s.cards[cardId];
  if (!card || !mine(card.owner)) return [];
  // Main Step ของเรา หรือ Flash timing ที่เบรฟ [Quick] บนมืออัญเชิญได้ (ร่วมร่างทันทีในแอทแท็คสเต็ป: กติกา 04)
  const quickNow = canQuickSummon(s, cardId) && s.players[card.owner].hand.includes(cardId);
  if (!(inMain(s) && card.owner === s.turnPlayer) && !quickNow) return [];
  const def = db.get(card.cardNo);
  const p = s.players[card.owner];
  const current = braveHostOf(s, cardId);
  if (def.type !== 'brave' || !def.braveCondition) return [];
  if (!p.hand.includes(cardId) && !p.field.includes(cardId) && !current) return [];
  return p.field.filter((id) => {
    const host = s.cards[id]!;
    const hd = db.get(host.cardNo);
    if (id === current || !braveFits(def, hd)) return false;
    const swapOut = braveToSwap(s, db, id, cardId);
    if (!swapOut) return true;
    // สปิริตที่มีเบรฟอยู่แล้ว: สลับเบรฟได้ถ้าเบรฟนี้ร่วมร่างอยู่ และเบรฟอีกตัวร่วมร่างกับร่างเดิมของเบรฟนี้ได้ (กติกา 04)
    if (!current) return false;
    return braveFits(db.get(s.cards[swapOut]!.cardNo), db.get(s.cards[current]!.cardNo));
  });
}

/** Core ที่จะวางบน Brave ตอนแยกร่าง (จากรีเสิร์ฟ: Core ธรรมดาก่อน) null = ไม่พอ */
export function separatePlacement(s: GameState, braveId: string): string[] | null {
  const card = s.cards[braveId]!;
  const need = summonMinCores(s, db, braveId);
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
      handMagicTimings(s, id).includes('flash') &&
      // วัดอรุณ: ในเทิร์นนี้ใช้งานการ์ดเมจิคไม่ได้
      !magicBanned(s, player, db, def) &&
      // คอสต์ในมือ (ทริคสเตอร์ -1) + จ่ายเพิ่ม (จินเบร์) ตรงกับที่ engine เรียกเก็บตอนใช้จริง
      payableCost(s, db, player, def, baseCost(s, db, id)) + magicBurstTax(s, db, player).amount <= cores &&
      !magicUsedUp(s, db, player, def.cardNo, 'flash')
    );
  });
  const evolve = p.field.filter(
    (id) =>
      canEvolve(s, id) &&
      p.field.some((o) => o !== id && isSpiritLike(db.get(s.cards[o]!.cardNo)) && s.cards[o]!.cores.length > 0),
  );
  // ดีไวน์เชน: ในการต่อสู้นี้ใช้การ์ดในมือในช่วง Flash ไม่ได้
  const noHand = s.battle?.noHandFlash === player;
  const quick = noHand ? [] : p.hand.filter((id) => canQuickSummon(s, id));
  const activate = p.field.filter((id) => activatableAbilities(s, db, player, id).length > 0);
  const trash = p.trashCards.filter((id) => trashSummonRule(s, db, player, id) !== null);
  return { magic: noHand ? [] : magic, evolve, quick, activate, trash };
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

/** ตัวระบุ choice distribute (ใช้แยกว่าจำนวนที่แบ่งไว้เป็นของ choice ไหน) */
function distributeKey(c: Extract<GameState['choice'], { kind: 'distribute' }>): string {
  return `${c.sourceId}|${c.player}|${c.total}|${c.candidates.join(',')}`;
}

/** จำนวนคอร์ที่แบ่งไว้ของ choice distribute ตอนนี้ (choice อื่น = ว่าง) */
export function allocOf(s: { state: GameState; alloc: { key: string; n: Record<string, number> } | null }): Record<string, number> {
  const c = s.state.choice;
  return c?.kind === 'distribute' && s.alloc?.key === distributeKey(c) ? s.alloc.n : NO_ALLOC;
}
/** ค่าว่างคงที่ (ใช้เป็น selector ของ zustand ได้: ไม่สร้าง object ใหม่ทุกครั้ง) */
const NO_ALLOC: Record<string, number> = Object.freeze({}) as Record<string, number>;

/** สีของ Gem Symbol ทั้งหมดของผู้โจมตี (ตัวเอง + Brave ที่ร่วมร่าง + ที่ได้เพิ่มจากเอฟเฟกต์) สูงสุด 12 เม็ด */
function attackGemColors(s: GameState, attackerId: string): string[] {
  const card = s.cards[attackerId];
  if (!card) return [];
  const out: string[] = [];
  const add = (map: Partial<Record<string, number>>) => {
    for (const [color, n] of Object.entries(map)) for (let i = 0; i < (n ?? 0); i++) out.push(color);
  };
  add(db.get(card.cardNo).symbols);
  for (const b of card.braves) add(db.get(s.cards[b]!.cardNo).symbols);
  add(extraSymbols(s, db, attackerId));
  return out.slice(0, 12);
}

/** ตัวระบุ choice multiCard */
function multiCardKey(c: Extract<GameState['choice'], { kind: 'multiCard' }>): string {
  return `${c.sourceId}|${c.player}|${c.count}|${c.candidates.join(',')}`;
}
const NO_PICKS: string[] = Object.freeze([]) as unknown as string[];
/** การ์ดที่เลือกไว้ของ choice multiCard ตอนนี้ (choice อื่น = ว่าง) */
export function pickedOf(s: { state: GameState; picked: { key: string; ids: string[] } | null }): string[] {
  const c = s.state.choice;
  return c?.kind === 'multiCard' && s.picked?.key === multiCardKey(c) ? s.picked.ids : NO_PICKS;
}
/** การ์ดนี้เป็นตัวเลือกของการเลือกหลายใบทีเดียว (choice multiCard ของเรา) */
export function isMultiCardCandidate(s: GameState, cardId: string): boolean {
  return s.choice?.kind === 'multiCard' && mine(s.choice.player) && s.choice.candidates.includes(cardId);
}

/** การ์ดนี้เป็นตัวเลือกของการแบ่งคอร์ (choice distribute ของเรา) */
export function isDistributeCandidate(s: GameState, cardId: string): boolean {
  return s.choice?.kind === 'distribute' && mine(s.choice.player) && s.choice.candidates.includes(cardId);
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
/**
 * อัญเชิญหลายใบจากที่แสดง (choice multiSummon) บนกระดาน: เลือกการ์ดจากพัด → วาง Core / เลือกผู้ร่วมร่างทีละใบ → ลงพร้อมกัน
 *  - pick: กำลังเลือกการ์ด · place: กำลังจัดใบที่ index
 *  - plans: ใบที่จัดเสร็จแล้ว (cores = วางเป็นสปิริต, host = Brave ร่วมร่าง) · asSpirit: Brave ที่เลือกลงเป็นสปิริต
 */
export interface MultiPlan {
  phase: 'pick' | 'place';
  picks: string[];
  index: number;
  plans: Record<string, { cores: string[] } | { host: string }>;
  asSpirit: string[];
}
export const EMPTY_MULTI: MultiPlan = { phase: 'pick', picks: [], index: 0, plans: {}, asSpirit: [] };

/** ใบที่กำลังจัดในขั้น place (null = ไม่ได้จัดอยู่) */
export function multiCurrent(s: GameState, m: MultiPlan | null): string | null {
  if (s.choice?.kind !== 'multiSummon' || !m || m.phase !== 'place') return null;
  return m.picks[m.index] ?? null;
}

/** Core ที่วางให้ใบอื่นที่จัดไปแล้ว */
export function multiAssigned(s: GameState, m: MultiPlan | null): string[] {
  if (s.choice?.kind !== 'multiSummon' || !m) return [];
  const cur = multiCurrent(s, m);
  return Object.entries(m.plans).flatMap(([id, p]) => (id !== cur && 'cores' in p ? p.cores : []));
}

/** สปิริตที่ Brave ใบนี้ร่วมร่างได้ (ไม่ซ้ำกับใบอื่นที่จัดไว้) */
export function multiHosts(s: GameState, m: MultiPlan | null, braveId: string): string[] {
  const c = s.choice;
  if (c?.kind !== 'multiSummon' || !m) return [];
  const def = db.get(s.cards[braveId]!.cardNo);
  if (def.type !== 'brave') return [];
  const taken = new Set(Object.entries(m.plans).flatMap(([id, p]) => (id !== braveId && 'host' in p ? [p.host] : [])));
  return s.players[c.player].field.filter((id) => {
    const card = s.cards[id]!;
    const d = db.get(card.cardNo);
    return braveFits(def, d) && braveRoom(s, db, id, braveId) && !taken.has(id);
  });
}

/** ใบที่กำลังจัดเป็น Brave ที่รอเลือกผู้ร่วมร่าง (ยังไม่ได้เลือกลงเป็นสปิริต) */
export function multiNeedsHost(s: GameState, m: MultiPlan | null): boolean {
  const cur = multiCurrent(s, m);
  return !!cur && !m!.asSpirit.includes(cur) && multiHosts(s, m, cur).length > 0;
}

/** สปิริตบนสนามนี้เป็นผู้ร่วมร่างที่คลิกได้ของ Brave ที่กำลังจัด */
export function isMultiHostCandidate(st: { state: GameState; multi: MultiPlan | null }, cardId: string): boolean {
  const cur = multiCurrent(st.state, st.multi);
  return !!cur && mine(st.state.choice?.player) && multiNeedsHost(st.state, st.multi) && multiHosts(st.state, st.multi, cur).includes(cardId);
}

/** Core ในรีเสิร์ฟสำหรับวางอัตโนมัติ n ดวง: Core ธรรมดาก่อน Soul Core (ไม่เอาที่ใช้ไปแล้ว) */
export function autoCores(s: GameState, player: PlayerId, n: number, exclude: string[] = []): string[] {
  return [...s.players[player].reserve]
    .filter((id) => !exclude.includes(id))
    .sort((a, b) => Number(s.cores[a]!.isSoul) - Number(s.cores[b]!.isSoul))
    .slice(0, n);
}

export function canSelectCore(s: GameState, evolveCard: string | null, coreId: string, multi: MultiPlan | null = null): boolean {
  const core = s.cores[coreId];
  const loc = core ? locateCore(s, coreId) : null;
  if (!core || !loc || !mine(core.owner)) return false;
  if (s.choice?.kind === 'multiSummon') {
    if (!multiCurrent(s, multi) || multiNeedsHost(s, multi) || multiAssigned(s, multi).includes(coreId)) return false;
    return core.owner === s.choice.player && loc.player === s.choice.player && (loc.area === 'reserve' || loc.area === 'card');
  }
  if (evolveCard) {
    const owner = s.cards[evolveCard]!.owner;
    return loc.area === 'card' && loc.player === owner && loc.cardId !== evolveCard && isSpiritLike(db.get(s.cards[loc.cardId]!.cardNo));
  }
  if (s.choice?.kind === 'payCost') {
    return core.owner === s.choice.player && loc.player === s.choice.player && (loc.area === 'reserve' || loc.area === 'card');
  }
  // อัญเชิญด้วยเอฟเฟกต์: Core ในรีเสิร์ฟ หรือบนการ์ดในสนามของผู้เลือก
  // เบรฟที่คงอยู่หลังร่างต้นออกจากสนาม: วาง Core จากรีเสิร์ฟเท่านั้น (กติกา 04 ข้อ 2.2)
  if (s.choice?.kind === 'placeCores')
    return core.owner === s.choice.player && loc.player === s.choice.player && (loc.area === 'reserve' || (loc.area === 'card' && !(s.choice.step.do === 'placeCores' && (s.choice.step.noSummon || s.choice.step.clone))));
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
  /** กดจั่วใน Draw Step: การ์ดที่ลอยกลางจอพลิกเปิดหน้า (ลีลาตามระดับความหายาก DRAW_TIER[tier]) ก่อนบินเข้ามือ */
  | {
      id: number;
      kind: 'drawReveal';
      cardId: string;
      cardNo: string;
      rect: Rect;
      tier: number;
      delay: number;
      /** จั่วหลายใบใน Draw Step: ใบแรกถือพื้นมืดไว้ตลอดทั้งชุด (dimMs) · ใบถัดไปไม่วาดพื้นมืดซ้ำ (noDim) */
      dimMs?: number;
      noDim?: boolean;
    }
  /** FINAL BLOW: จังหวะที่ Life เป็น 0 (สโลว์โมชัน แสงวาบ รอยฟัน ฝั่งที่แพ้ร้าว) */
  | { id: number; kind: 'finalBlow'; loser: PlayerId; winner: PlayerId; delay: number }
  /**
   * แถบ "Final Blow !" สองข้างจอ: ประกาศโจมตีที่ถ้าไม่ถูกป้องกัน Life ของคู่แข่งจะเป็น 0 (นับเฉพาะความเสียหายจากการโจมตี)
   * ค้างไว้จนการต่อสู้นี้จบ (ถูกป้องกัน / ชนเข้า Life / ฉาก FINAL BLOW เล่นจบ)
   */
  | { id: number; kind: 'finalBlowBanner'; attackerId: string; delay: number }
  /** ธีมไอดอล (เผ่าดีว่า BS07): ON STAGE! / MY UNIT! / SOLO PART / โน้ตดนตรีตอนวาง-ทิ้งเพลง (ดู IdolFx.tsx) */
  | {
      id: number;
      kind: 'idol';
      variant: 'onStage' | 'myUnit' | 'soloPart' | 'notes' | 'notesBurst';
      cardId?: string;
      cardIds?: string[];
      title?: string;
      anchor?: string;
      rect?: Rect;
      delay: number;
      duration: number;
    }
  | { id: number; kind: 'summon'; cardId: string; level: number; bp: number; delay: number; special?: boolean; /** เบรฟที่อัญเชิญไปร่วมร่างทันที: ชื่อผู้ร่วมร่าง (bp = BP+ ที่ให้) */ braveOnto?: string }
  | { id: number; kind: 'activate'; cardId: string; label: string; text: string; delay: number }
  /** การ์ดบนสนามที่เอฟเฟกต์ทำงาน: ยกขึ้น + เรืองแสง ก่อนผลของเอฟเฟกต์จะเกิด */
  | {
      id: number;
      kind: 'cardActivate';
      cardId: string;
      delay: number;
      duration: number;
      hand?: boolean;
      brave?: boolean;
      /** เอฟเฟกต์ของการ์ดใน Trash (เช่น เมื่อถูกทำลาย): ยกขึ้นจากช่อง Trash */
      trash?: PlayerId;
      /**
       * ตำแหน่งบนสนามก่อน action นี้: การ์ดที่ยังอยู่บนสนามตอนเอฟเฟกต์ทำงาน แต่ออกจากสนามทีหลังในชุดเดียวกัน
       * (เช่น ผู้ป้องกันที่ "เมื่อป้องกัน" ทำงานแล้วแพ้การต่อสู้) ใน DOM ไม่มีการ์ดใบนี้แล้ว จึงยกขึ้นจากตำแหน่งนี้แทน
       */
      rect?: Rect;
      /** การ์ดบนสนามนอนอยู่ (เสื่อมสภาพ) ณ จังหวะที่เอฟเฟกต์ทำงาน */
      lying?: boolean;
    }
  /**
   * เมจิก / เบิร์ส (Spell Stage): ยกขึ้นจากมือเหนือการ์ดใบอื่น (มือที่คว่ำ = พลิกหงายก่อน) หรือพลิกหงายที่ช่อง Burst
   * → ไปค้างที่เวทีข้างกระดาน (ตำแหน่งเดียวกับใบล่าสุดของกอง Chain) เรืองแสงทุกครั้งที่เอฟเฟกต์ทำงาน (pulses)
   * → ค้างจนผลของการ์ดเล่นจบ (end) แล้วค่อยลง Trash / ลงสนาม (field: การ์ดบินจากเวทีลงสนามแทน) / ค้างรอผู้เล่นเลือก (stay: SpellStage แสดงต่อ)
   * เวลาทั้งหมดนับจากต้นไทม์ไลน์ของ action นี้
   */
  | {
      id: number;
      kind: 'spell';
      cardId: string;
      owner: PlayerId;
      tone: 'main' | 'flash' | 'burst';
      from: 'hand' | 'burst' | 'stage';
      fromRect?: Rect;
      delay: number;
      pulses: number[];
      end: number;
      exit: 'trash' | 'field' | 'stay' | 'song';
    }
  /** เอฟเฟกต์หลายอันทำงานพร้อมกัน: แสดงการ์ดเรียงพร้อมเลขลำดับและโซ่ (CHAIN → RESOLVE) */
  | { id: number; kind: 'chain'; cardIds: string[]; delay: number; duration: number }
  /** การ์ดที่เอฟเฟกต์ทำงานเสร็จ บินเข้าไปต่อท้ายแถบ Chain (index = ลำดับใน Chain) */
  | { id: number; kind: 'chainAdd'; cardId: string; index: number; delay: number; /** กอง Chain ณ จังหวะนั้น (Chain 1 ถึงใบนี้) */ stack: { cardId: string; player: PlayerId }[] }
  /** การ์ดที่เปิดจากเด็คเรียงเป็นพัด (หลังเลือก: ใบที่เลือกยกขึ้นก่อนบินขึ้นมือ / ที่เหลือบินลง Trash) */
  | { id: number; kind: 'reveal'; owner: PlayerId; cardIds: string[]; chosen: string | null; delay: number; duration: number; title?: string }
  /** การ์ดถูกทิ้งจากเด็ค: บินออกมาเรียงหงายทีละใบ ค้างไว้ครู่หนึ่ง แล้วแตกทีละใบลง Trash (owner = เจ้าของเด็ค) */
  | { id: number; kind: 'mill'; owner: PlayerId; cardIds: string[]; delay: number; /** ทิ้งจากมือ: บินออกจากตำแหน่งในมือ (ไม่ใช่เด็ค) */ fromHand?: Record<string, Rect>; title?: string }
  /** เส้นเล็งจากการ์ดต้นเอฟเฟกต์ไปยังเป้าหมายที่เลือก */
  | { id: number; kind: 'target'; sourceId: string; targetId: string; delay: number; duration: number }
  /** ตัวเลขดาเมจใหญ่กลางฝั่งที่เสียไลฟ์ (big = โดนโจมตีตรง มีรัศมีแตกกระจาย) */
  /** big = โจมตีตรงเข้า Life (ระเบิด) · lethal = ครั้งที่ทำให้ Life หมด (ระเบิดใหญ่มาก ไม่ว่าจากการโจมตีหรือเอฟเฟกต์) */
  | { id: number; kind: 'damage'; player: PlayerId; amount: number; big: boolean; lethal?: boolean; delay: number }
  | { id: number; kind: 'float'; anchor: string; text: string; tone: 'bad' | 'good'; delay?: number; /** เสียงแทนเสียงประจำ tone */ sound?: SfxName }
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
      /** brave = ลอยขึ้นเหนือผู้ร่วมร่าง (via) แล้วหมุนเข้าช่องเบรฟ */
      mode: 'draw' | 'play' | 'magic' | 'burst' | 'move' | 'brave';
      /** (brave) ผู้ร่วมร่าง */
      via?: string;
      /** มุมหมุนตอนเริ่ม (การ์ดที่นอนอยู่บนสนาม = 90) แล้วค่อยตั้งตรงระหว่างบิน */
      fromRotate?: number;
      shrink?: boolean;
      /** บินแบบคว่ำ (เซ็ท Burst) */
      faceDown?: boolean;
      /** ลงสนามแบบหนักหน่วงเป็นพิเศษ (M ขึ้นไป) */
      heavy?: boolean;
      /** R: แสงสีฟ้าแวบตอนกระแทกพื้น */
      rare?: boolean;
      timing?: 'main' | 'flash';
      /** เสียงตอนการ์ดถึงปลายทาง (แทนเสียงประจำ mode) */
      landSound?: SfxName;
      /** ออกจากสนามแบบหงาย แล้วค่อยพลิกคว่ำกลางทาง (กลับขึ้นมือที่อีกฝ่ายมองไม่เห็น) */
      revealFirst?: boolean;
      /** revealFirst: หงายเกือบตลอดทาง พลิกคว่ำตอนใกล้ถึงมือ (การ์ดจากแทรช = ข้อมูลเปิด) */
      revealLate?: boolean;
      /** (draw) ต่อจากการ์ดที่พลิกเปิดหน้ากลางจอ: เริ่มทึบเต็มที่ */
      fromReveal?: boolean;
      /** faceDown: เริ่มหงาย (เฉพาะคนที่เห็นการ์ดใบนี้ในมือ) แล้วพลิกคว่ำกลางทาง (เซ็ท Burst) */
      flipMid?: boolean;
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
      /** เริ่มจากท่านอนแต่กรอบ from เป็นกรอบตั้งตรง (นอนลงไปแล้วตอนประกาศโจมตีใน action เดียวกัน) */
      startLying?: boolean;
      toExhausted: boolean;
      dies: boolean;
      /** โจมตีเข้า Life ตรง ๆ: สีของ Gem Symbol ทั้งหมด (ตัวเอง + Brave + ที่ได้เพิ่ม) ลอยออกมาพุ่งชนไปพร้อมกัน */
      gems?: string[];
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
      /** การ์ดที่นอนอยู่ถูกฟื้นสภาพก่อนออกจากสนามใน action เดียวกัน (เช่น ประตูปราสาทบุปผาเหลือง): ลุกขึ้นตั้งตรงตอนนี้ (ms) แล้วค่อยแตก */
      refreshAt?: number;
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
  let k = fieldScaleOf(el);
  // กระดานเอียง (ตั้งค่า → เอียงกระดาน): ฝั่งไกลดูเล็กลง ฝั่งใกล้ดูใหญ่ขึ้น → ปรับขนาดตามที่เห็นจริง
  // ใช้อัตราส่วนพื้นที่กรอบ (ไม่ขึ้นกับการหมุน 90° ของการ์ดเสื่อมสภาพ) จำกัดช่วงกันค่าแปลกตอนการ์ดหมุนเฉียง
  if (el instanceof HTMLElement && el.offsetWidth > 0 && el.offsetHeight > 0 && el.closest('.board-tilt.tilted')) {
    const ratio = Math.sqrt((r.width * r.height) / (el.offsetWidth * el.offsetHeight * k * k));
    k *= Math.min(1.1, Math.max(0.85, ratio));
  }
  const w = el instanceof HTMLElement && el.offsetWidth > 0 ? el.offsetWidth * k : r.width;
  const h = el instanceof HTMLElement && el.offsetHeight > 0 ? el.offsetHeight * k : r.height;
  return { x: r.left + r.width / 2 - w / 2, y: r.top + r.height / 2 - h / 2, w, h };
}

/** อัตราย่อของแถว Spirit ที่การ์ดนี้อยู่ (แถวที่การ์ดเยอะถูกย่อด้วย transform: offsetWidth ไม่นับ) */
export function fieldScaleOf(el: Element): number {
  const k = Number(el.closest<HTMLElement>('[data-field-scale]')?.dataset.fieldScale);
  return k > 0 ? k : 1;
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
  grab('[data-song-card]', (el) => `song:${el.dataset.songCard}`);
  grab('[data-field-card] > div:first-child', (el) => `field:${el.parentElement!.dataset.fieldCard}`);
  grab('[data-burst-card]', (el) => `burst:${el.dataset.burstCard}`);
  grab('[data-brave-card]', (el) => `brave:${el.dataset.braveCard}`);
  grab('[data-trash]', (el) => `trash:${el.dataset.trash}`);
  return out;
}

let fxSeq = 0;
const who = (p: PlayerId) => (p === 'p1' ? 'ผู้เล่น 1' : 'ผู้เล่น 2');
const effectText = (cardNo: string, i: number) => (db.get(cardNo).effects as TextEffect[])[i]?.text ?? '';

/** เวลาของแต่ละช่วงในไทม์ไลน์ (ms) */
/**
 * ผู้โจมตีที่แพ้: ถูกกระแทกกระเด็นกลับมาหยุดที่สัดส่วนนี้ของระยะวิ่ง แล้วแตกตรงนั้น (Charge ใน Fx ใช้ค่าเดียวกัน)
 * 0 = เด้งกลับถึงช่องเดิมบนสนาม (เดิม 0.5 หยุดค้างกลางทางทับแถบกลางจอ)
 */
export const CHARGE_KNOCK = 0;

/** ตำแหน่งที่ผู้โจมตีที่แพ้แตก: การ์ดตั้งตรง ณ จุดที่กระเด็นกลับมาหยุด */
export function chargeKnockRect(from: Rect, fromExhausted: boolean, target: Rect): Rect {
  const w = fromExhausted ? from.h : from.w;
  const h = fromExhausted ? from.w : from.h;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const tx = target.x + target.w / 2 - cx;
  const ty = target.y + target.h / 2 - cy;
  const len = Math.hypot(tx, ty) || 1;
  const k = (CHARGE_KNOCK * Math.max(0, len - h * 0.45)) / len;
  return { x: cx + tx * k - w / 2, y: cy + ty * k - h / 2, w, h };
}

/** Spell Stage (ms): intro = ยก/พลิก→เวที→เรืองแสง, glow = จังหวะเรืองแสงครั้งแรก, pulse = เรืองแสงซ้ำ, exit = ลงจากเวทีเข้า Trash */
/** Spell (ms): ยก/พลิกตรงที่เดิม → เรืองแสงตรงนั้น (ไม่วิ่งไปกลางจอ) */
export const CAST_MS = { intro: 1150, lift: 420, arrive: 420, glow: 450, pulse: 1100, exit: 520, rise: 300, rest: 450 } as const;

/** ความยาว cut-in อัญเชิญ (X / XX·XV) ใช้ทั้งไทม์ไลน์และตัวแอนิเมชันใน Fx */
export const CUTIN_MS = { normal: 2500, special: 3300 } as const;
/** จังหวะที่การ์ดทุบกลางจอใน cut-in (สัดส่วนของความยาว): ก่อนหน้า = ชาร์จพลัง, ตรงนี้ = แสงวาบ/คลื่น/จอสั่น */
export const CUTIN_SLAM = 0.17;

/**
 * ตำแหน่งเบรฟที่ร่วมร่าง (ใบที่ bi จากทั้งหมด n ใบ): สลับขวา/ซ้าย แล้วเรียงเป็นแถวลงมา
 * (ชิซุรุร่วมร่างได้ 3 ใบขึ้นไป: ใบที่ 3 ไม่ซ้อนทับใบแรก) · top = ระยะจากขอบบนการ์ด (rem)
 */
export function braveSlot(bi: number, n: number): { right: boolean; top: string } {
  const rows = Math.ceil(n / 2);
  const step = rows > 1 ? Math.min(2.8, 4.6 / (rows - 1)) : 0;
  return { right: bi % 2 === 0, top: `${(rows > 1 ? 0.6 : 1.5) + Math.floor(bi / 2) * step}rem` };
}

/**
 * ระยะเวลาวิ่งชนทั้งหมด (ลุกขึ้น → ค่อย ๆ ถอยชาร์จพลัง → พุ่งเร็ว → ชน → กลับ)
 * CHARGE_WIND = สัดส่วนเวลาที่ถอยสุดแล้วเริ่มพุ่ง · CHARGE_HIT = สัดส่วนเวลาที่ชน (เวลาจริง: ไทม์ไลน์ของการ์ดเป็นเส้นตรง แต่ละช่วงมี easing ของตัวเอง)
 */
export const CHARGE_MS = 1700;
export const CHARGE_WIND = 0.44;
export const CHARGE_HIT = 0.49;

/** กดจั่วใน Draw Step: เวลาพลิกเปิดหน้าการ์ด (ms) */
export const DRAW_FLIP_MS = 420;
/**
 * ลีลาเปิดหน้าการ์ดที่จั่วตามระดับความหายาก (index = drawTier(rank))
 * ms = เวลาทั้งหมดก่อนบินเข้ามือ · scale = ขยายจากการ์ดที่ลอยอยู่ · glow/rings = วงแสง · rays = รัศมีหมุน · sparkles = ประกาย
 */
export interface DrawTierFx {
  ms: number;
  scale: number;
  glow?: string;
  rings: number;
  rays?: string;
  sparkles: number;
  rainbow?: boolean;
  flash?: boolean;
  sound?: SfxName;
}
export const DRAW_TIER: DrawTierFx[] = [
  // C / U
  { ms: 760, scale: 1.25, rings: 0, sparkles: 0 },
  // R
  { ms: 1000, scale: 1.3, glow: '#7dd3fc', rings: 1, sparkles: 0, sound: 'flash' },
  // M
  { ms: 1250, scale: 1.35, glow: '#fde047', rings: 2, rays: 'repeating-conic-gradient(from 0deg, rgba(253,224,71,0.55) 0deg 4deg, transparent 4deg 14deg)', sparkles: 10, sound: 'magic' },
  // X ขึ้นไป
  {
    ms: 1600,
    scale: 1.45,
    glow: '#f0abfc',
    rings: 3,
    rays: 'repeating-conic-gradient(from 0deg, #f43f5e 0deg 3deg, transparent 3deg 9deg, #facc15 9deg 12deg, transparent 12deg 18deg, #22c55e 18deg 21deg, transparent 21deg 27deg, #38bdf8 27deg 30deg, transparent 30deg 36deg, #a855f7 36deg 39deg, transparent 39deg 45deg)',
    sparkles: 16,
    rainbow: true,
    flash: true,
    sound: 'xrare',
  },
];
export const drawTier = (rank: number) => (rank >= 5 ? 3 : rank === 4 ? 2 : rank === 3 ? 1 : 0);

/**
 * สโลว์โมชันตอน Life เป็น 0: ทุกแอนิเมชันบนจอเล่นที่ความเร็ว rate ค้างไว้ hold ms แล้วค่อย ๆ เร่งกลับปกติใน ramp ms
 * จอสั่น + เสียงระเบิดเกิดตอนปล่อย (RELEASE)
 */
export const LETHAL_SLOW = { rate: 0.12, hold: 3600, ramp: 1600 };
/** เวลาจริงที่ยืดออกเพราะสโลว์ (แอนิเมชันตามหลังเวลาจริงเท่านี้) */
// ช่วงเร่งกลับใช้ความเร็ว rate + (1 - rate)·u² → เฉลี่ยเสียไป (1 - rate)·2/3 ของช่วงนั้น
export const LETHAL_SLOW_EXTRA = Math.round(LETHAL_SLOW.hold * (1 - LETHAL_SLOW.rate) + LETHAL_SLOW.ramp * (1 - LETHAL_SLOW.rate) * (2 / 3));
/** จังหวะ "ปล่อย" หลังสโลว์ (นับจากจังหวะที่ Life เป็น 0) */
export const LETHAL_RELEASE = LETHAL_SLOW.hold + Math.round(LETHAL_SLOW.ramp * 0.4);

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
  /** พุ่ง (ประกาศโจมตี/ป้องกัน) */
  lunge: 520,
  /** เบรฟลอยไปร่วมร่าง */
  braveJoin: 900,
  /** Magic / Burst ค้างกลางจอก่อนผลเกิด (แบบเดิม) */
  spell: 1250,
  /** Spell Stage: ยก/พลิก → ไปที่เวที → เรืองแสง ก่อนผลของการ์ดเริ่ม */
  cast: CAST_MS.intro,
  /** จังหวะเรืองแสงครั้งแรก (นับจากเริ่ม) */
  castGlow: CAST_MS.glow,
  /** เรืองแสงซ้ำที่เวที (เช่น จ่ายคอสต์ใช้ Flash ของเบิร์ส) ก่อนผลเกิด */
  castPulse: CAST_MS.pulse,
  /** ลงจากเวทีเข้า Trash */
  castExit: CAST_MS.exit,
  /** ผู้โจมตีวิ่งถึงเป้าหมาย */
  hit: CHARGE_MS * CHARGE_HIT,
  /** ผู้โจมตีวิ่งชนแล้ววิ่งกลับถึงที่เดิม */
  chargeEnd: CHARGE_MS,
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
  finalBlow: 2600 + LETHAL_SLOW_EXTRA,
  /** X-Rare cut-in ก่อนการ์ดบินลงสนาม (การ์ดเริ่มบินตอน cut-in กำลังจาง) */
  cutIn: CUTIN_MS.normal - 250,
  /** cut-in ระดับพิเศษ (XX/XV) ยาวกว่า X */
  cutInSpecial: CUTIN_MS.special - 250,
} as const;

/**
 * แปลง event ของ engine เป็นเอฟเฟกต์ภาพแบบไทม์ไลน์
 * engine ประมวลผลเสร็จในครั้งเดียว แต่ภาพจะเล่นตามลำดับ event: ลงการ์ด → เอฟเฟกต์ทำงาน (ยกขึ้นเรืองแสง) → ผลของเอฟเฟกต์
 * t = เวลาที่ขั้นถัดไปจะเริ่ม
 */
/** ตัวเลือก cut-in อัญเชิญ: always = ทุกครั้ง (ค่าเริ่มต้น), first = ครั้งแรกของการ์ดชนิดนั้นในเกม, off = ปิด (ลงหนักแทน) */
export type CutInMode = 'always' | 'first' | 'off';
let cutInMode: CutInMode = (() => {
  try {
    const v = localStorage.getItem('bs-cutin');
    return v === 'always' || v === 'off' || v === 'first' ? v : 'always';
  } catch {
    return 'always';
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
      // พัดหายพอดีตอนการ์ดเริ่มบินออก (ภาพบินจับตำแหน่งจากพัดตอนเริ่ม) ไม่ซ้อนกัน
      out.push({ kind: 'reveal', owner: pc.player, cardIds: pc.revealed, chosen: pick, delay: 0, duration: 900 });
      t = 900;
    } else if (PLAYERS.some((p) => prev.players[p].trashCards.includes(pick) || (prev.players[p].songs ?? []).includes(pick))) {
      // เลือกจากแทรช / เพลงบนฟิลด์ (ข้อมูลเปิด): ทั้งสองฝ่ายเห็นพัดการ์ดที่เลือกได้ ใบที่เลือกยกขึ้น แล้วค่อยบินไปปลายทาง
      // (ไม่เล็งที่ปลายทาง: การ์ดย้ายเข้ามือไปแล้ว ฝั่งที่มองไม่เห็นมือจะเห็นแค่หลังการ์ด)
      const ids = pc.candidates.includes(pick) ? pc.candidates : [pick];
      ids.forEach((id) => revealed.add(id));
      out.push({ kind: 'reveal', owner: pc.player, cardIds: ids, chosen: pick, delay: 0, duration: 900, title: pc.prompt });
      t = 900;
    } else {
      out.push({ kind: 'target', sourceId: pc.sourceId, targetId: pick, delay: 0, duration: 1000 });
      t = 900;
    }
  }
  // อัญเชิญหลายใบจากที่แสดงจากเด็ค (การ์ดจากมือ = ภาพบินจากมือตามปกติ ไม่ต้องเปิดพัด)
  if (pc?.kind === 'multiSummon' && pc.step.do !== 'summonFromHandFree' && typeof pick === 'object' && pick !== null && 'summons' in pick) {
    pc.revealed.forEach((id) => revealed.add(id));
    out.push({ kind: 'reveal', owner: pc.player, cardIds: pc.revealed, chosen: null, delay: 0, duration: 650, title: 'อัญเชิญการ์ดที่เลือก · ที่เหลือไว้ใต้สุดเด็ค' });
    t = 650;
  }
  const fromReveal = (id: string, fallback: string) => (revealed.has(id) ? `[data-reveal-card="${id}"]` : fallback);
  let draws = 0;
  // กดจั่วใน Draw Step (จอของคนจั่ว): ทุกใบที่จั่วใน Draw Step นี้ (รวมใบที่เอฟเฟกต์ให้จั่วเพิ่ม) พลิกเปิดกลางจอทีละใบ
  const drawPrompt = prev.awaitingDraw ? promptRect() : null;
  let inDrawStep = !!drawPrompt;
  let reveals = 0;
  const onAnyField = (id: string) => PLAYERS.some((p) => s.players[p].field.includes(id) || prev.players[p].field.includes(id));
  /** การ์ดที่นอนอยู่บนสนามก่อน action นี้ (เสื่อมสภาพ): ภาพบินเริ่มจากท่านอน */
  const lyingRot = (id: string) => (prev.players[prev.cards[id]?.owner ?? 'p1'].field.includes(id) && prev.cards[id]?.state === 'exhausted' ? 90 : 0);

  // Spell Stage: เมจิก/เบิร์สที่กำลังร่ายใน action นี้ + ที่ค้างอยู่บนเวทีจาก action ก่อน (รอเลือกจ่าย Flash / วาง Core ฯลฯ)
  type SpellIn = Extract<FxInput, { kind: 'spell' }>;
  const casting = new Map<string, SpellIn & { fresh: boolean; exitSet: boolean }>();
  for (const id of castCards(prev)) {
    if (!s.cards[id]) continue;
    casting.set(id, { kind: 'spell', cardId: id, owner: s.cards[id]!.owner, tone: castTone(prev, id), from: 'stage', delay: 0, pulses: [], end: 0, exit: 'stay', fresh: false, exitSet: false });
  }

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
    // ตัดสินการต่อสู้แล้วแต่ไม่มีใครเสียอะไร (เช่น ลิมิเต็ดบาเรีย / ลองเคพ / เจ็ม 0 / ทั้งคู่ไม่ถูกทำลาย): ยังวิ่งชนให้เห็น
    // ไม่นับการต่อสู้ที่จบเพราะผู้โจมตี/ผู้ป้องกันออกจากสนามไปก่อน
    const onFieldBoth = (id: string) => PLAYERS.some((p) => prev.players[p].field.includes(id) && s.players[p].field.includes(id));
    const quietEnd =
      events.some((e) => e.type === 'battleEnded') && onFieldBoth(attackerId) && (!blocked || blockers.some(onFieldBoth)) && (!pb || (pb.step !== 'flashBeforeBlock' && !pb.resolved));
    const resolved =
      (blocked
        ? destroyedIds.has(attackerId) || blockers.some((b) => destroyedIds.has(b))
        : events.some((e) => e.type === 'lifeLost' && e.player === defender && e.attack)) || quietEnd;
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
        ...(blocked ? {} : { gems: attackGemColors(prev, attackerId) }),
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
    ((e.type === 'destroyed' && (e.cardId === attackerId || blockers.includes(e.cardId))) || (e.type === 'lifeLost' && e.player === defender && (e.attack || blockers.length > 0)) || e.type === 'battleEnded');

  /** ภาพการ์ดแตก/สูญสลายเล่นจบเมื่อไหร่: ขั้นถัดไปต้องรอ ไม่งั้นเอฟเฟกต์ที่ตามมาจะยกเรืองแสงทับกับการ์ดที่กำลังแตก */
  let ghostsEnd = 0;

  // ลำดับใน Chain ของการโจมตีนี้ (เอฟเฟกต์ที่ทำงานตั้งแต่ประกาศโจมตีจนจบการต่อสู้)
  // เทียบด้วยตำแหน่งใน log: events คือท้าย log พอดี (Auto Pass คัดลอก state ใหม่ จึงเทียบ object ตรง ๆ ไม่ได้)
  // นับ Chain ณ จังหวะของ event นั้น (ตัด log ถึงตรงนั้น): ถ้าใช้สภาพสุดท้าย เอฟเฟกต์ที่ตามด้วยการเปลี่ยนสเต็ป/จบการต่อสู้
  // ในชุดเดียวกัน (เช่น จ่ายคอสต์ใช้ Flash ของเบิร์ส แล้ว Attack Step จบ) จะหลุดจาก Chain และฉากต่อ Chain ไม่ขึ้น
  const chainPos = new Map<GameEvent, number>();
  /** กอง Chain ณ จังหวะนั้น (ฉากต่อ Chain ใช้ ไม่ใช้กองจากสภาพสุดท้ายที่อาจว่างไปแล้ว) */
  const chainStackAt = new Map<GameEvent, { cardId: string; player: PlayerId }[]>();
  events.forEach((ev, i) => {
    if (ev.type !== 'effectResolving') return;
    const at = s.log.length - events.length + i;
    const idxs = chainLogIndices({ ...s, log: s.log.slice(0, at + 1) });
    const pos = idxs.indexOf(at);
    if (pos < 0) return;
    chainPos.set(ev, pos);
    chainStackAt.set(
      ev,
      idxs.slice(0, pos + 1).map((li) => {
        const x = s.log[li] as Extract<GameEvent, { type: 'effectResolving' }>;
        return { cardId: x.cardId, player: x.player };
      }),
    );
  });
  /** การ์ดเสื่อมสภาพอยู่ไหม ณ จังหวะของ event ลำดับ idx (ประกาศโจมตี/ป้องกัน = เสื่อมสภาพทันที) */
  const exhaustedAt = (id: string, idx: number) => {
    let ex = prev.cards[id]?.state === 'exhausted';
    for (let i = 0; i < idx; i++) {
      const x = events[i]!;
      if ((x.type === 'exhausted' && x.cardId === id) || (x.type === 'blockDeclared' && x.blockerId === id) || (x.type === 'attackDeclared' && x.attackerId === id)) ex = true;
      else if (x.type === 'cardRefreshed' && x.cardId === id) ex = false;
    }
    return ex;
  };

  /** การ์ดที่ฟื้นสภาพด้วยเอฟเฟกต์ใน action นี้แล้วออกจากสนาม: เวลาที่ภาพลุกขึ้น */
  const refreshedAt = new Map<string, number>();
  /** event ทิ้งจากมือที่รวมเข้าชุดก่อนหน้าแล้ว */
  const grouped = new Set<GameEvent>();
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
        if (e.phase !== 'draw') inDrawStep = false;
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
      case 'cardDrawn': {
        // กดจั่วใน Draw Step (จอของคนจั่ว): พลิกเปิดหน้ากลางจอก่อน แล้วค่อยบินเข้ามือ ทีละใบ
        const pr = inDrawStep && prev.awaitingDraw === e.player ? drawPrompt : null;
        if (pr) {
          // ใบถัดไป: เว้นจังหวะให้ใบก่อนหน้าบินออกจากกลางจอก่อน
          if (reveals++ > 0) t += 220;
          const cardNo = s.cards[e.cardId]!.cardNo;
          const tier = drawTier(rarityOf(db.get(cardNo).rarity)?.rank ?? 0);
          const k = DRAW_TIER[tier]!.scale;
          out.push({ kind: 'drawReveal', cardId: e.cardId, cardNo, rect: pr, tier, delay: t });
          t += DRAW_TIER[tier]!.ms;
          const big = { x: pr.x + pr.w / 2 - (pr.w * k) / 2, y: pr.y + pr.h / 2 - (pr.h * k) / 2, w: pr.w * k, h: pr.h * k };
          out.push({ kind: 'fly', cardId: e.cardId, from: big, to: `[data-hand-card="${e.cardId}"]`, mode: 'draw', fromReveal: true, delay: t, hideTarget: true });
          draws++;
          break;
        }
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
      }
      case 'summoned':
      case 'nexusDeployed': {
        const card = s.cards[e.cardId]!;
        const to = `[data-field-card="${e.cardId}"] > div:first-child`;
        draws = 0;
        // การ์ดบนเวที (เบิร์ส/เมจิกที่ลงสนาม): ออกจากเวทีตอนนี้ (ภาพบินลงสนามรับช่วงต่อ)
        const staged = casting.get(e.cardId);
        if (staged) Object.assign(staged, { end: t, exit: 'field', exitSet: true });
        // ระดับความหายาก: C/U ปกติ · R แสงฟ้าแวบ · M ลงหนัก · X cut-in · XX/XV cut-in พิเศษ
        const rank = rarityOf(db.get(card.cardNo).rarity)?.rank ?? 0;
        const host0 = Object.values(s.cards).find((c) => c.braves.includes(e.cardId));
        if (rank >= 5 && wantCutIn(s, events, e, card.cardNo)) {
          // cut-in เล่นก่อน (การ์ดบนสนามซ่อนไว้) แล้วการ์ดใหญ่กลางจอค่อยทุบลงสนาม
          const onField = s.players[card.owner].field.includes(e.cardId);
          const special = rank >= 6;
          out.push({
            kind: 'summon',
            cardId: e.cardId,
            level: onField ? cardLevel(s, db, e.cardId) : 0,
            bp: onField ? currentBpSafe(s, e.cardId) : host0 ? (db.get(card.cardNo).braveCondition?.bp ?? 0) : 0,
            ...(host0 ? { braveOnto: db.get(host0.cardNo).name } : {}),
            delay: t,
            special,
          });
          t += special ? T.cutInSpecial : T.cutIn;
          if (host0) {
            // เบรฟ X-Rare ที่อัญเชิญไปร่วมร่างทันที: หลัง Cut-in ลอยจากกลางจอไปเหนือผู้ร่วมร่างแล้วหมุนเข้าช่องเบรฟ
            out.push({ kind: 'fly', cardId: e.cardId, from: 'center', to: `[data-brave-card="${e.cardId}"]`, via: `[data-field-card="${host0.id}"] > div:first-child`, mode: 'brave', delay: t, hideTarget: true });
            t += T.braveJoin;
          } else {
            out.push({ kind: 'fly', cardId: e.cardId, from: 'center', to, mode: 'play', heavy: true, delay: t, hideTarget: true });
            t += T.landHeavy;
          }
        } else {
          const heavy = rank >= 4 && !host0;
          const origin = e.type === 'summoned' ? e.from : undefined;
          // อยู่บนเวที (เช่น เบิร์สที่อัญเชิญตัวเอง): บินจากเวทีลงสนาม
          const fromStage = casting.has(e.cardId);
          const from = fromStage
            ? `stage:${card.owner}`
            : origin === 'deck'
              ? fromReveal(e.cardId, `[data-deck="${e.player}"]`)
              : origin === 'burst'
                ? (rects[`burst:${e.player}`] ?? 'center')
                : origin === 'trash' || (e.type === 'summoned' && e.fromTrash)
                  ? (rects[`trash:${e.player}`] ?? 'center')
                  : (rects[`hand:${e.cardId}`] ?? null);
          // Brave ที่ร่วมร่าง: บินไปที่ผู้ร่วมร่าง
          const host = Object.values(s.cards).find((c) => c.braves.includes(e.cardId));
          if (host) {
            // ลอยขึ้นเหนือผู้ร่วมร่าง แล้วหมุนเข้าช่องเบรฟ (ป้าย BRAVE! ตามมาจากเหตุการณ์ braved)
            out.push({ kind: 'fly', cardId: e.cardId, from, to: `[data-brave-card="${e.cardId}"]`, via: `[data-field-card="${host.id}"] > div:first-child`, mode: 'brave', delay: t, hideTarget: true });
            t += T.braveJoin;
          } else {
            out.push({ kind: 'fly', cardId: e.cardId, from, to, mode: 'play', heavy, rare: rank === 3, delay: t, hideTarget: true });
            t += heavy ? T.landHeavy : T.land;
          }
        }
        break;
      }
      case 'effectResolving': {
        if (hitAt !== null) effectAfterHit = true;
        // การ์ดบนเวที (เมจิก/เบิร์ส): ครั้งแรกเรืองแสงไปแล้วตอนขึ้นเวที · ครั้งต่อ ๆ ไป (เช่น จ่ายใช้ Flash) เรืองแสงซ้ำที่เวที
        const cast = casting.get(e.cardId);
        if (cast) {
          if (cast.fresh) cast.fresh = false;
          else {
            // เบิร์สที่พักอยู่ในช่อง Burst: ยกขึ้น (ขยาย) ก่อนแล้วค่อยเรืองแสง
            const rise = cast.from === 'stage' && cast.tone === 'burst' && cast.pulses.length === 0 ? CAST_MS.rise : 0;
            cast.pulses.push(t + rise);
            t += rise + T.castPulse;
          }
          if (e.source !== null) {
            out.push({ kind: 'activate', cardId: e.cardId, label: 'เอฟเฟกต์ทำงาน', text: effectText(s.cards[e.cardId]!.cardNo, e.source), delay: t });
          }
          // ต่อ Chain (ตั้งแต่ Chain 2): ผลของการ์ดรอจนฉาก Chain จบ
          const ci = chainPos.get(e) ?? -1;
          if (ci >= 1) {
            out.push({ kind: 'chainAdd', cardId: e.cardId, index: ci, delay: t, stack: chainStackAt.get(e) ?? [] });
            t += T.chainLink;
          }
          draws = 0;
          break;
        }
        // การ์ดบนสนามยกขึ้นเรืองแสง → ผลของเอฟเฟกต์เกิดทันที → การ์ดบินไปต่อท้าย Chain
        // การ์ดบนสนาม หรือบนมือ (เอฟเฟกต์ที่ทำงานจากมือ): ยกขึ้นเรืองแสง + จอสลัว
        const inHand = !onAnyField(e.cardId) && PLAYERS.some((p) => s.players[p].hand.includes(e.cardId) || prev.players[p].hand.includes(e.cardId));
        // Brave ที่ร่วมร่างอยู่ (เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ): การ์ด Brave ใบเล็กบนผู้ร่วมร่างยกขึ้น
        const onHost = !onAnyField(e.cardId) && !inHand && Object.values(s.cards).some((c) => c.braves.includes(e.cardId));
        // การ์ดที่ไปอยู่ใน Trash แล้ว (เอฟเฟกต์ "เมื่อถูกทำลาย" ฯลฯ): ยกขึ้นจากช่อง Trash หลังภาพแตกลง Trash เล่นจบ
        // (Magic / Burst มีภาพของตัวเองแล้ว)
        const viaSpell = events.some((x) => (x.type === 'magicUsed' || x.type === 'burstActivated') && x.cardId === e.cardId);
        // ดูตามไทม์ไลน์ ไม่ใช่สภาพสุดท้าย: การ์ดที่ยังอยู่บนสนาม ณ จังหวะนี้ แล้วค่อยออกจากสนามทีหลังในชุดเดียวกัน
        // (ผู้ป้องกันที่ "เมื่อป้องกัน" ทำงานแล้วแพ้การต่อสู้) ต้องยกขึ้นจากสนาม ไม่ใช่จาก Trash
        const idx = events.indexOf(e);
        const leftEarlier = events
          .slice(0, idx)
          .some((x) => ((x.type === 'destroyed' && !x.stays) || x.type === 'depleted') && x.cardId === e.cardId);
        const stillOnField = PLAYERS.some((p) => prev.players[p].field.includes(e.cardId)) && !leftEarlier;
        const trashOwner =
          !viaSpell && !inHand && !stillOnField && !PLAYERS.some((p) => s.players[p].field.includes(e.cardId)) && db.get(s.cards[e.cardId]!.cardNo).type !== 'magic'
            ? PLAYERS.find((p) => s.players[p].trashCards.includes(e.cardId))
            : undefined;
        if (trashOwner) t = Math.max(t, ghostsEnd);
        const field = onAnyField(e.cardId) || inHand || onHost || !!trashOwner;
        // ยังอยู่บนสนามตอนนี้ แต่ไม่อยู่แล้วในสภาพสุดท้าย: ใช้ตำแหน่งก่อน action
        const goneLater = stillOnField && !PLAYERS.some((p) => s.players[p].field.includes(e.cardId));
        const fieldRect = goneLater ? rects[`field:${e.cardId}`] : undefined;
        if (field)
          out.push({
            kind: 'cardActivate',
            cardId: e.cardId,
            delay: t,
            duration: T.activate,
            hand: inHand,
            brave: onHost && !trashOwner,
            ...(trashOwner ? { trash: trashOwner } : {}),
            ...(fieldRect ? { rect: fieldRect } : {}),
            // ท่าของการ์ดบนสนาม ณ จังหวะนี้ (เช่น ป้องกันแล้ว = นอน) ไม่ใช่จากกล่องบนจอที่อาจกำลังหมุนอยู่
            ...(!inHand && !onHost && !trashOwner ? { lying: exhaustedAt(e.cardId, events.indexOf(e)) } : {}),
          });
        if (e.source !== null) {
          out.push({ kind: 'activate', cardId: e.cardId, label: 'เอฟเฟกต์ทำงาน', text: effectText(s.cards[e.cardId]!.cardNo, e.source), delay: t });
        }
        const index = chainPos.get(e) ?? -1;
        // ต่อ Chain: แสดงกอง "CHAIN n" เฉพาะเมื่อมีตั้งแต่ 2 Chain ขึ้นไป (Chain 1 เดี่ยว ๆ ไม่ต้องโชว์)
        const chained = index >= 1;
        if (chained) out.push({ kind: 'chainAdd', cardId: e.cardId, index, delay: t + (field ? T.activate : 0), stack: chainStackAt.get(e) ?? [] });
        t += (field ? T.activate : 250) + (chained ? T.chainLink : 0);
        draws = 0;
        break;
      }
      case 'magicUsed': {
        const cardNo = s.cards[e.cardId]!.cardNo;
        const text = (db.get(cardNo).effects as TextEffect[]).filter((x) => x.timing === e.timing).map((x) => x.text).join(' ');
        // ตำแหน่งเดิมในพัดมือ (ซ้าย→ขวาบนจอ): พัดมือเว้นช่องไว้ให้การ์ดกลับมาพักระหว่างรอเลือก
        {
          const mine = rects[`hand:${e.cardId}`];
          if (mine) {
            const others = prev.players[e.player].hand.filter((id) => id !== e.cardId && rects[`hand:${id}`]);
            castSlots.set(e.cardId, others.filter((id) => rects[`hand:${id}`]!.x < mine.x).length);
          }
        }
        // ยกขึ้นจากมือ → เวที → เรืองแสง (ป้ายข้อความขึ้นตอนเรืองแสง) · ค้างที่เวทีจนผลจบแล้วค่อยลง Trash
        out.push({ kind: 'activate', cardId: e.cardId, label: `Magic [${e.timing === 'main' ? 'Main' : 'Flash'}]`, text, delay: t + T.castGlow });
        casting.set(e.cardId, {
          kind: 'spell',
          cardId: e.cardId,
          owner: e.player,
          tone: e.timing,
          from: 'hand',
          ...(rects[`hand:${e.cardId}`] ? { fromRect: rects[`hand:${e.cardId}`] } : {}),
          delay: t,
          pulses: [t + T.castGlow],
          end: 0,
          exit: 'stay',
          fresh: true,
          exitSet: false,
        });
        t += T.cast;
        draws = 0;
        break;
      }
      case 'spellResolved': {
        // ผลของการ์ดนี้จบแล้ว: ลง Trash ตอนนี้ (ไม่รอแอนิเมชันอื่นที่ตามมาใน action เดียวกัน เช่น จบการต่อสู้/เปลี่ยนสเต็ป)
        const c = casting.get(e.cardId);
        if (c && !c.exitSet) {
          const soFar = Math.max(t, ghostsEnd, ...out.filter((f) => f.kind !== 'banner' && f.kind !== 'result' && f.kind !== 'finalBlow' && f !== c).map(fxEnd));
          Object.assign(c, { end: c.from === 'stage' ? soFar : Math.max(soFar, c.delay + T.cast), exit: 'trash', exitSet: true });
        }
        break;
      }
      // ---------------- BS07
      case 'songPlaced': {
        if (e.from === 'used') {
          // เมจิคไทป์เพลงที่ใช้เสร็จ: ออกจากเวทีไปวางที่โซนเพลงแทนลงแทรช
          const c = casting.get(e.cardId);
          if (c && !c.exitSet) {
            const soFar = Math.max(t, ghostsEnd, ...out.filter((f) => f.kind !== 'banner' && f.kind !== 'result' && f.kind !== 'finalBlow' && f !== c).map(fxEnd));
            Object.assign(c, { end: c.from === 'stage' ? soFar : Math.max(soFar, c.delay + T.cast), exit: 'song', exitSet: true });
            out.push({ kind: 'idol', variant: 'notes', anchor: `[data-song-zone="${e.player}"]`, delay: c.end + T.castExit, duration: 1100 });
          }
        } else {
          const rect = rects[`hand:${e.cardId}`];
          if (rect) out.push({ kind: 'fly', cardId: e.cardId, from: rect, to: `[data-song-card="${e.cardId}"]`, mode: 'move', delay: t, hideTarget: true, revealFirst: true });
          t += 500;
          out.push({ kind: 'idol', variant: 'notes', anchor: `[data-song-zone="${e.player}"]`, delay: t, duration: 1100 });
        }
        break;
      }
      case 'songRemoved': {
        const rect = rects[`song:${e.cardId}`];
        if (rect && e.to === 'trash') out.push({ kind: 'idol', variant: 'notesBurst', rect, delay: t, duration: 900 });
        const to = e.to === 'trash' ? `[data-trash="${e.player}"]` : `[data-hand-card="${e.cardId}"]`;
        if (rect) out.push({ kind: 'fly', cardId: e.cardId, from: rect, to, mode: 'move', delay: t, hideTarget: e.to === 'hand', shrink: e.to === 'trash' });
        t += 500;
        break;
      }
      case 'onStage':
        // ม่านเวทีเปิด + สปอตไลต์ (ธีมไอดอล) แล้วการ์ดค่อยกลับใต้เด็ค
        out.push({ kind: 'idol', variant: 'onStage', cardId: e.cardId, title: db.get(s.cards[e.cardId]!.cardNo).name, delay: t, duration: 1700 });
        t += 1500;
        if (e.exhaustedInstead) out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'เสื่อมสภาพแทนกลับใต้เด็ค', tone: 'bad', delay: t });
        break;
      case 'myUnit':
        out.push({ kind: 'idol', variant: 'myUnit', cardId: e.attackerId, cardIds: e.cardIds, title: e.cardIds.map((id) => db.get(s.cards[id]!.cardNo).name).join(' · '), delay: t, duration: 1400 });
        t += 1400;
        break;
      case 'showdown': {
        // BS08 Showdown: ป้ายเทียบ BP แล้วค่อยแตก (destroyed ตามหลัง)
        const nm = (id: string) => db.get(s.cards[id]!.cardNo).name;
        out.push({ kind: 'banner', tone: 'burst', title: 'SHOWDOWN!', sub: `${nm(e.cardId)} BP ${e.bp.toLocaleString()} ปะทะ ${nm(e.targetId)} BP ${e.targetBp.toLocaleString()}`, delay: t });
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: `BP ${e.bp.toLocaleString()}`, tone: e.bp > e.targetBp ? 'good' : 'bad', delay: t + 300 });
        out.push({ kind: 'float', anchor: `[data-field-card="${e.targetId}"]`, text: `BP ${e.targetBp.toLocaleString()}`, tone: e.targetBp > e.bp ? 'good' : 'bad', delay: t + 300 });
        t += 1300;
        break;
      }
      case 'soulDrive':
        out.push({ kind: 'banner', tone: 'burst', title: 'SOUL DRIVE', sub: db.get(s.cards[e.cardId]!.cardNo).name, delay: t });
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'Soul Core ออกจากเกม', tone: 'bad', delay: t + 200 });
        t += 1000;
        break;
      case 'magicNegated':
        out.push({ kind: 'banner', tone: 'step', title: 'ไร้ผล!', sub: `เอฟเฟกต์ของ ${db.get(s.cards[e.cardId]!.cardNo).name}`, delay: t });
        t += 800;
        break;
      case 'extraStep':
        out.push({ kind: 'banner', tone: 'step', title: e.step === 'refresh' ? 'REFRESH STEP' : 'ATTACK STEP', sub: `อีกครั้ง (${db.get(s.cards[e.cardId]!.cardNo).name})`, delay: t });
        t += 900;
        break;
      case 'cleansed':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'เอฟเฟกต์คู่แข่งไร้ผล', tone: 'good', delay: t });
        t += 400;
        break;
      case 'burstActivated':
        out.push({ kind: 'banner', tone: 'burst', title: 'BURST!', sub: db.get(s.cards[e.cardId]!.cardNo).name });
        // พลิกหงายที่ช่อง Burst → เวที (ขยายให้อ่านง่าย) → เรืองแสง · ค้างจนผลจบ / รอเลือก แล้วค่อยลง Trash หรือลงสนาม
        casting.set(e.cardId, {
          kind: 'spell',
          cardId: e.cardId,
          owner: e.player,
          tone: 'burst',
          from: 'burst',
          ...(rects[`burst:${e.player}`] ? { fromRect: rects[`burst:${e.player}`] } : {}),
          delay: t,
          pulses: [t + T.castGlow],
          end: 0,
          exit: 'stay',
          fresh: true,
          exitSet: false,
        });
        t += T.cast;
        draws = 0;
        break;
      case 'cardRefreshed': {
        // ฟื้นสภาพแล้วออกจากสนามใน action เดียวกัน: ภาพการ์ดที่จะแตกลุกขึ้นก่อน (บนสนามจริงการ์ดหายไปแล้ว)
        const leaves = PLAYERS.some((p) => prev.players[p].field.includes(e.cardId)) && !PLAYERS.some((p) => s.players[p].field.includes(e.cardId));
        if (leaves && exhaustedAt(e.cardId, events.indexOf(e))) {
          refreshedAt.set(e.cardId, t);
          t += 450;
        }
        break;
      }
      case 'abilityTriggered': {
        // "ดรอว์สเต็ปของเรา" (จำนวนจั่ว +N): ไม่ผ่านคิวเอฟเฟกต์ จึงไม่มี effectResolving · การ์ดต้นเหตุยกขึ้นเรืองแสง + ข้อความเอฟเฟกต์ ก่อนจั่ว
        // (trigger อื่นมีแอนิเมชันตอน effectResolving อยู่แล้ว: ไม่ทำซ้ำ)
        const c = s.cards[e.cardId];
        if (!c || db.get(c.cardNo).abilities.find((ab) => ab.source === e.source)?.kind !== 'drawStep' || !onAnyField(e.cardId)) break;
        out.push({ kind: 'cardActivate', cardId: e.cardId, delay: t, duration: T.activate, lying: exhaustedAt(e.cardId, events.indexOf(e)) });
        out.push({ kind: 'activate', cardId: e.cardId, label: 'เอฟเฟกต์ทำงาน', text: effectText(c.cardNo, e.source), delay: t });
        t += T.activate;
        draws = 0;
        break;
      }
      case 'staticApplied': {
        // ความสามารถถาวรลงมือ (Shield กัน, ปิดเอฟเฟกต์, ส่งใต้เด็คแทนขึ้นมือ ฯลฯ): การ์ดต้นเหตุยกขึ้นเรืองแสง + ข้อความเอฟเฟกต์ ก่อนผลจะเกิด
        const onHost = !onAnyField(e.cardId) && [s, prev].some((st) => Object.values(st.cards).some((c) => c.braves.includes(e.cardId)));
        if (!onAnyField(e.cardId) && !onHost) break;
        const idx = events.indexOf(e);
        const goneLater = PLAYERS.some((p) => prev.players[p].field.includes(e.cardId)) && !PLAYERS.some((p) => s.players[p].field.includes(e.cardId));
        const fieldRect = goneLater ? rects[`field:${e.cardId}`] : undefined;
        out.push({
          kind: 'cardActivate',
          cardId: e.cardId,
          delay: t,
          duration: T.activate,
          brave: onHost,
          ...(fieldRect ? { rect: fieldRect } : {}),
          ...(!onHost ? { lying: exhaustedAt(e.cardId, idx) } : {}),
        });
        out.push({ kind: 'activate', cardId: e.cardId, label: 'เอฟเฟกต์ถาวร', text: effectText(s.cards[e.cardId]!.cardNo, e.source), delay: t });
        {
          const ab = db.get(s.cards[e.cardId]!.cardNo).abilities.find((a) => a.source === e.source);
          if (ab?.kind === 'destroyImmune' && ab.soloPart && onAnyField(e.cardId)) out.push({ kind: 'idol', variant: 'soloPart', cardId: e.cardId, delay: t + 200, duration: 1300 });
        }
        t += T.activate;
        draws = 0;
        break;
      }
      case 'evolved':
        // [Evolution]: สปิริตที่รับ Core ยกขึ้นเรืองแสง
        if (onAnyField(e.cardId)) out.push({ kind: 'cardActivate', cardId: e.cardId, delay: t, duration: T.activate });
        t += T.activate;
        break;
      case 'attackDeclared': {
        // การโจมตีที่ถ้าไม่ป้องกัน Life คู่แข่งจะเป็น 0: แถบ Final Blow ขึ้นตั้งแต่ประกาศโจมตี
        {
          const atkOwner = prev.cards[e.attackerId]?.owner ?? s.cards[e.attackerId]!.owner;
          const lifeNow = prev.players[opponentOf(atkOwner)].life.length;
          const at0 = s.battle?.attackerId === e.attackerId ? s : prev;
          if (lifeNow > 0 && at0.cards[e.attackerId] && attackLifeDamage(at0, db, e.attackerId) >= lifeNow) out.push({ kind: 'finalBlowBanner', attackerId: e.attackerId, delay: t });
        }
        // ตัดสินใน action เดียวกัน: แสดงแค่การวิ่งชน · ยกเว้นมีเอฟเฟกต์ทำงานก่อนผลการต่อสู้ (เช่น "เมื่อสปิริตนี้โจมตี")
        // ต้องให้การ์ดพุ่ง/นอนลงก่อน แล้วเอฟเฟกต์ค่อยทำงาน แล้วจึงวิ่งชน (เริ่มจากท่านอน)
        if (charge) {
          const i0 = events.indexOf(e);
          const iHit = events.findIndex((x, i) => i > i0 && ((x.type === 'destroyed' && (x.cardId === attackerId || blockers.includes(x.cardId))) || (x.type === 'lifeLost' && x.player === defender && (x.attack || blockers.length > 0))));
          const effectFirst = events.some((x, i) => i > i0 && (iHit < 0 || i < iHit) && x.type === 'effectResolving');
          if (!effectFirst) break;
          if (charge.kind === 'charge' && !charge.fromExhausted) charge.startLying = true;
        }
        const target = opponentOf(s.cards[e.attackerId]!.owner);
        out.push({ kind: 'lunge', cardId: e.attackerId, target: `[data-player-target="${target}"]`, delay: t, max: 36 });
        // เอฟเฟกต์ "เมื่อสปิริตนี้โจมตี" เริ่มหลังพุ่งเสร็จ (การ์ดนอนลงแล้ว)
        t += T.lunge;
        break;
      }
      case 'blockDeclared': {
        if (charge) break;
        // ผู้ป้องกันนอนลงแล้วขยับเข้าหาผู้โจมตี ก่อนเอฟเฟกต์ "เมื่อสปิริตนี้ป้องกัน"
        const atk = s.battle?.attackerId ?? pb?.attackerId;
        if (atk) out.push({ kind: 'lunge', cardId: e.blockerId, target: `[data-field-card="${atk}"]`, delay: t, max: 24 });
        t += T.lunge;
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
          // ผู้โจมตีที่แพ้: แตกตรงจุดที่กระเด็นกลับมาหยุด (CHARGE_KNOCK = 0: ช่องเดิมบนสนาม แบบตั้งตรง)
          const knock = recoil && charge?.kind === 'charge' && typeof charge.target !== 'string' ? chargeKnockRect(rect, charge.fromExhausted, charge.target) : null;
          const refreshAt = refreshedAt.get(e.cardId);
          out.push({ kind: 'ghost', cardId: e.cardId, owner, slot, cardNo: s.cards[e.cardId]!.cardNo, rect: knock ?? rect, mode: e.type === 'destroyed' ? 'destroy' : 'deplete', delay, hiddenUntilStart: recoil, ...(refreshAt !== undefined && !knock ? { refreshAt } : {}) });
          ghostsEnd = Math.max(ghostsEnd, delay + T.ghost);
        }
        break;
      }
      case 'lifeLost':
        if (e.amount > 0) {
          const direct = !!charge && e.player === defender && blockers.length === 0;
          // เสีย Life จากการโจมตีเอง = จังหวะชน, จากเอฟเฟกต์ที่ทำงานทีหลัง (เช่น ส่งไลฟ์ลงรีเสิร์ฟ) = ตามคิวเอฟเฟกต์
          // ไม่ถูกป้องกัน: นับเป็นจังหวะชนเฉพาะไลฟ์ที่หายเพราะการโจมตีจริง (เอฟเฟกต์ "เมื่อโจมตี" ส่งไลฟ์ เช่น มิสึรุกิ = ตามคิวเอฟเฟกต์)
          const fromBattle = e.player === defender && !effectAfterHit && (blockers.length > 0 || !!e.attack);
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
        // ค้างที่ช่องบนสนามจนถึงคิวของตัวเอง (FlyCard fill both) แล้วบินขึ้นมือ · กลับหลายตัวในเอฟเฟกต์เดียว = ไล่ตามกันถี่ ๆ
        if (rect) out.push({ kind: 'fly', cardId: e.cardId, from: rect, to: `[data-hand-card="${e.cardId}"]`, mode: 'move', delay: t, hideTarget: true, revealFirst: true, fromRotate: lyingRot(e.cardId) });
        out.push({ kind: 'float', anchor: `[data-hand-card="${e.cardId}"]`, text: 'กลับขึ้นมือ', tone: 'bad', delay: t });
        t += 260;
        break;
      }
      case 'returnedToDeck': {
        // การ์ดบนสนามบินกลับเด็ค (คว่ำ)
        const rect = rects[`field:${e.cardId}`];
        if (rect) out.push({ kind: 'fly', cardId: e.cardId, from: rect, to: `[data-deck="${e.player}"]`, mode: 'move', shrink: true, faceDown: true, delay: t, hideTarget: false, fromRotate: lyingRot(e.cardId) });
        out.push({ kind: 'float', anchor: `[data-deck="${e.player}"]`, text: e.where === 'top' ? 'บนสุดเด็ค' : 'ใต้สุดเด็ค', tone: 'bad', delay: t });
        t += 500;
        break;
      }
      case 'voidCore':
        out.push({
          kind: 'float',
          // คอร์วอยด์ลงแทรช (เอปวิป): ป้ายขึ้นที่แทรช ไม่ใช่รีเสิร์ฟ
          anchor: e.cardId ? `[data-field-card="${e.cardId}"]` : e.trash ? `[data-trash="${e.player}"]` : `[data-reserve="${e.player}"]`,
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
            // การ์ดที่แสดงอยู่ในพัด: เริ่มแบบหงาย (ไม่บังพัด) แล้วพลิกคว่ำกลางทาง
            ...(revealed.has(id) ? { revealFirst: true } : {}),
            delay: t + i * 120,
            hideTarget: false,
          }),
        );
        t += 300;
        break;
      case 'braved': {
        // อัญเชิญมาร่วมร่างใน action นี้: ภาพบินเล่นไปแล้วตอน summoned
        const summonedNow = events.some((x) => x.type === 'summoned' && x.cardId === e.cardId);
        // ร่วมร่างจากสนาม (เบรฟเดี่ยว) หรือย้ายจากผู้ร่วมร่างเดิม (ตำแหน่งช่องเบรฟเดิม)
        const rect = summonedNow ? undefined : (rects[`field:${e.cardId}`] ?? rects[`brave:${e.cardId}`]);
        if (rect) {
          out.push({ kind: 'fly', cardId: e.cardId, from: rect, to: `[data-brave-card="${e.cardId}"]`, via: `[data-field-card="${e.hostId}"] > div:first-child`, mode: 'brave', delay: t, hideTarget: true, ...(rects[`field:${e.cardId}`] ? { fromRotate: lyingRot(e.cardId) } : {}) });
          t += T.braveJoin;
        }
        out.push({ kind: 'float', anchor: `[data-field-card="${e.hostId}"]`, text: 'BRAVE!', tone: 'good', delay: t, sound: 'brave' });
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
      case 'cardLocked':
        out.push({ kind: 'float', anchor: `[data-field-card="${e.cardId}"]`, text: 'โจมตี/ป้องกันไม่ได้ในเทิร์นนี้', tone: 'bad', delay: t });
        t += 450;
        break;
      case 'coresPaidToBlock':
        out.push({ kind: 'float', anchor: `[data-reserve="${e.player}"]`, text: `-${e.count} Core (ค่าป้องกัน)`, tone: 'bad', delay: t });
        t += 350;
        break;
      case 'attackBanned':
        out.push({ kind: 'banner', tone: 'step', title: 'ห้ามโจมตี', sub: `สปิริตของ${who(e.player)}โจมตีไม่ได้ในเทิร์นนี้`, delay: t });
        t += 900;
        break;
      case 'discarded': {
        // ทิ้งจากมือ: รวมใบที่ทิ้งต่อเนื่องกันเป็นชุดเดียว หงายเรียงกลางจอให้ทั้งสองฝั่งเห็น แล้วแตกลง Trash
        if (grouped.has(e)) break;
        const i0 = events.indexOf(e);
        const ids: string[] = [];
        for (let i = i0; i < events.length; i++) {
          const x = events[i]!;
          if (x.type !== 'discarded' || x.player !== e.player) break;
          grouped.add(x);
          ids.push(x.cardId);
        }
        const fromHand: Record<string, Rect> = {};
        for (const id of ids) {
          const r = rects[`hand:${id}`];
          if (r) fromHand[id] = r;
        }
        out.push({ kind: 'mill', owner: e.player, cardIds: ids, delay: t, fromHand, title: `${who(e.player)}ทิ้งการ์ดจากมือ` });
        t += millDuration(ids.length) - 600;
        draws = 0;
        break;
      }
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
          from: fromReveal(e.cardId, e.from === 'deck' ? `[data-deck="${e.player}"]` : `[data-trash="${e.player}"]`),
          to: `[data-hand-card="${e.cardId}"]`,
          mode: 'move',
          delay: t,
          hideTarget: true,
          // การ์ดในแทรช / การ์ดที่แสดงจากเด็ค เป็นข้อมูลเปิด: บินแบบหงายให้ทั้งสองฝ่ายเห็น แล้วค่อยพลิกคว่ำตอนเข้ามือที่อีกฝ่ายมองไม่เห็น
          ...(e.from === 'trash' || revealed.has(e.cardId) ? { revealFirst: true, revealLate: true } : {}),
        });
        break;
      case 'burstDiscarded': {
        const slot = rects[`burst:${e.player}`];
        // ถูกเอฟเฟกต์ทำลาย: หงายการ์ดที่ช่อง Burst ให้เห็น → ร้าวแล้วแตก → ดวงวิญญาณลอยลง Trash (แบบเดียวกับสปิริตถูกทำลาย)
        if (e.byEffect && slot) {
          out.push({ kind: 'float', anchor: `[data-burst-card="${e.player}"]`, text: 'BURST ถูกทำลาย!', tone: 'bad', delay: t });
          out.push({ kind: 'ghost', cardId: e.cardId, owner: e.player, slot: -1, cardNo: s.cards[e.cardId]!.cardNo, rect: slot, mode: 'destroy', delay: t + 150 });
          t += 150 + T.ghost;
          break;
        }
        out.push({ kind: 'fly', cardId: e.cardId, from: slot ?? `[data-burst-card="${e.player}"]`, to: `[data-trash="${e.player}"]`, mode: 'move', shrink: true, delay: t, hideTarget: false });
        break;
      }
      case 'burstSet': {
        if (e.replacedCardId) {
          out.push({ kind: 'fly', cardId: e.replacedCardId, from: rects[`burst:${e.player}`] ?? null, to: `[data-trash="${e.player}"]`, mode: 'move', shrink: true, delay: t, hideTarget: false });
        }
        const set = s.players[e.player].burst;
        // ใบใหม่: ออกจากมือแบบหงาย (เฉพาะคนที่เห็นมือนั้น) แล้วพลิกคว่ำกลางทาง · ใบเดิมออกจากช่องก่อนเล็กน้อย
        // ช่อง Burst ซ่อนใบใหม่ไว้จนบินถึง (hideTarget)
        if (set) {
          out.push({
            kind: 'fly',
            cardId: set,
            from: rects[`hand:${set}`] ?? rects[`field:${set}`] ?? null,
            to: `[data-burst-card="${e.player}"]`,
            mode: 'move',
            delay: t + (e.replacedCardId ? 250 : 0),
            hideTarget: true,
            faceDown: true,
            flipMid: true,
            landSound: 'burstSet',
          });
          t += e.replacedCardId ? 250 : 0;
        }
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
          if (hit) hit.lethal = true;
          out.push({ kind: 'finalBlow', loser, winner: e.winner, delay: fb });
          at = Math.max(end + 300, fb + T.finalBlow);
        }
        out.push({ kind: 'result', winner: e.winner, reason: e.reason, delay: at });
        break;
      }
    }
  }
  // จั่วหลายใบใน Draw Step: พื้นมืดต่อเนื่องตั้งแต่ใบแรกจนใบสุดท้ายบินออก (ไม่ซ้อน ไม่กระพริบระหว่างใบ)
  const revealFx = out.filter((f): f is Extract<FxInput, { kind: 'drawReveal' }> => f.kind === 'drawReveal');
  if (revealFx.length > 1) {
    const last = revealFx[revealFx.length - 1]!;
    revealFx[0]!.dimMs = last.delay + DRAW_TIER[last.tier]!.ms - revealFx[0]!.delay;
    revealFx.slice(1).forEach((f) => (f.noDim = true));
  }
  // Spell Stage: การ์ดบนเวทีออกเมื่อผลทั้งหมดเล่นจบ: ลง Trash / ค้างไว้ (ยังร่ายไม่จบ รอผู้เล่นเลือก) · ที่ลงสนามตั้งไว้แล้วตอนอัญเชิญ
  if (casting.size > 0) {
    const endAll = Math.max(t, ghostsEnd, ...out.filter((f) => f.kind !== 'banner' && f.kind !== 'result' && f.kind !== 'finalBlow').map(fxEnd));
    const pending = new Set(castCards(s));
    for (const c of casting.values()) {
      const { fresh: _fresh, exitSet, ...spell } = c;
      castToneMemo.set(c.cardId, c.tone);
      if (!exitSet) {
        spell.end = spell.from === 'stage' ? endAll : Math.max(endAll, spell.delay + T.cast);
        spell.exit = PLAYERS.some((p) => s.players[p].trashCards.includes(c.cardId)) && !pending.has(c.cardId) ? 'trash' : 'stay';
      }
      out.push(spell);
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
      return d + (f.mode === 'play' && f.heavy ? 1100 : { draw: 420, move: 480, play: 640, magic: 2000, burst: 1900, brave: 900 }[f.mode]);
    case 'summon':
      return d + (f.special ? CUTIN_MS.special : CUTIN_MS.normal);
    case 'spell':
      return f.end + (f.exit === 'trash' || f.exit === 'song' ? T.castExit : 0);
    case 'cardActivate':
    case 'chain':
    case 'reveal':
    case 'target':
    case 'idol':
      return d + f.duration;
    case 'charge':
      return d + T.chargeEnd;
    case 'drawReveal':
      return d + DRAW_TIER[f.tier]!.ms;
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
  st.online ? !!st.online.spectator || owner !== st.online.me : st.hideIdleHand && actingPlayer(st.state) !== owner;

/**
 * การ์ด/Core/การเลือกของผู้เล่นนี้ จับต้องได้จากเครื่องนี้หรือไม่ (ออนไลน์ = เฉพาะของที่นั่งเรา)
 * ใช้เฉพาะฝั่ง UI ห้ามใช้ในสิ่งที่ autoAdvance ใช้ตัดสิน (responseOptions, blockCandidates, canEvolve, canQuickSummon)
 * ไม่งั้นสองเครื่องจะเดิน state ต่างกัน
 */
export function mine(player: PlayerId | null | undefined): boolean {
  const on = useGame.getState().online;
  return !on || (!on.spectator && player === on.me);
}

/** ผู้เล่นนี้กดสั่งงานจากเครื่องนี้ได้หรือไม่ (ออนไลน์ = เฉพาะที่นั่งของเรา) */
export const controls = (st: { online: OnlineState | null }, player: PlayerId | null | undefined): boolean =>
  !st.online || (!st.online.spectator && st.online.status === 'playing' && player === st.online.me);

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
 * จุดเริ่มของ action ล่าสุดของผู้เล่นใน log (ไม่นับการตอบตัวเลือก / Pass / จัด Core)
 * นอกการต่อสู้ Chain เริ่มใหม่ทุกครั้งที่ผู้เล่นทำ action ใหม่ (อัญเชิญ, ใช้ Magic, จบสเต็ป ฯลฯ)
 */
let chainFloor = 0;
const CHAIN_CONTINUES = new Set<Action['type']>(['choose', 'passFlash', 'moveCores', 'noBlock']);

/**
 * ตำแหน่งใน log ของเอฟเฟกต์ที่อยู่ใน Chain ปัจจุบัน
 * ในการต่อสู้ แบ่ง 2 ช่วงตาม Flash Timing: ช่วงประกาศโจมตี (→ Flash ก่อนป้องกัน) และช่วงประกาศป้องกัน (→ Flash ก่อนตัดสิน)
 * นอกการต่อสู้ (Main / End Step, หลังจบการต่อสู้): เอฟเฟกต์ที่ทำงานต่อเนื่องจาก action เดียวกันของผู้เล่น
 */
function chainLogIndices(s: GameState): number[] {
  let start = -1;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const t = s.log[i]!.type;
    if (t === 'attackDeclared' || t === 'blockDeclared' || t === 'battleEnded' || t === 'turnStarted' || t === 'phaseChanged') {
      start = i;
      break;
    }
  }
  const inBattle = start >= 0 && (s.log[start]!.type === 'attackDeclared' || s.log[start]!.type === 'blockDeclared');
  if (!inBattle && chainFloor <= s.log.length) start = Math.max(start, chainFloor - 1);
  const out: number[] = [];
  for (let i = start + 1; i < s.log.length; i++) {
    if (s.log[i]!.type === 'effectResolving') out.push(i);
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
/** เวลา (ms) ของจังหวะในฉากต่อ Chain สำหรับเสียง: ต้องตรงกับ CL_DRAW_AT / CL_LOCK_AT ใน Fx.tsx */
const CHAIN_SFX = { draw: 420, lock: 800 };

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
      (f.kind === 'idol' && (f.variant === 'onStage' || f.variant === 'myUnit')) ||
      (f.kind === 'banner' && f.tone === 'win' && (f.delay ?? 0) > 0) ||
      (f.kind === 'result' && f.delay > 0) ||
      f.kind === 'charge' ||
      f.kind === 'drawReveal' ||
      f.kind === 'summon' ||
      f.kind === 'spell' ||
      (f.kind === 'fly' && f.mode !== 'draw'),
  );
}

/**
 * การ์ดที่ "กำลังร่ายอยู่" (ไม่อยู่ในโซนไหนเลย): เมจิก/เบิร์สที่เอฟเฟกต์ยังทำงานไม่จบ (engine ใส่ Trash ตอนเอฟเฟกต์จบ)
 * เช่น รอเลือกเป้าหมาย / รอเลือกจ่ายคอสต์ใช้ Flash / รอวาง Core ลงสนามจากช่อง Burst · แสดงค้างที่เวที (SpellStage)
 */
export function castCards(s: GameState): string[] {
  const placed = (id: string) =>
    PLAYERS.some((p) => {
      const pl = s.players[p];
      return pl.hand.includes(id) || pl.field.includes(id) || pl.trashCards.includes(id) || pl.deck.includes(id) || pl.burst === id || pl.field.some((f) => s.cards[f]!.braves.includes(id));
    });
  // เฉพาะเมจิก (ลง Trash เมื่อเอฟเฟกต์จบ) และเบิร์สที่เปิดอยู่ · การ์ดอื่นที่ไม่อยู่ในโซน (เช่น เบรฟที่แยกออกมารอเลือกว่าจะอยู่ต่อไหม) ไม่ใช่การ์ดที่กำลังร่าย
  const casting = (q: GameState['queue'][number]) => q.trashWhenDone || !!q.isBurst;
  const ids = new Set<string>();
  for (const q of s.queue) if (casting(q) && s.cards[q.sourceId] && !placed(q.sourceId)) ids.add(q.sourceId);
  const pc = s.choice?.kind === 'placeCores' ? s.choice.cardId : null;
  if (pc && !placed(pc) && s.queue.some((q) => q.sourceId === pc && casting(q))) ids.add(pc);
  return [...ids];
}

/** ประเภทตอนขึ้นเวที (Magic [Main] / [Flash] / Burst) จำไว้ให้ตอนค้างรอเลือกแสดงป้ายเดิม */
const castToneMemo = new Map<string, 'main' | 'flash' | 'burst'>();
/** เมจิกที่ใช้จากมือ: เคยอยู่ใบที่เท่าไรในพัดมือ (นับจากซ้ายบนจอ) · พัดมือเว้นช่องนี้ไว้ให้การ์ดพักระหว่างรอเลือก */
const castSlots = new Map<string, number>();
/** ช่องในพัดมือที่เว้นให้เมจิกของผู้เล่นนี้ที่ยังร่ายไม่จบ ("id:index,…" เป็นข้อความ ให้ selector ของ zustand เทียบค่าได้) */
export function castHandSlots(s: GameState, player: PlayerId): string {
  return castCards(s)
    .filter((id) => s.cards[id]?.owner === player && castSlots.has(id) && castTone(s, id) !== 'burst')
    .map((id) => `${id}:${castSlots.get(id)}`)
    .join(',');
}

/** สีของการ์ดที่ค้างบนเวที: ตามตอนขึ้นเวที · ไม่รู้ = เปิดจากช่อง Burst → burst, เมจิก → flash */
export function castTone(s: GameState, cardId: string): 'main' | 'flash' | 'burst' {
  const memo = castToneMemo.get(cardId);
  if (memo) return memo;
  return s.queue.some((q) => q.sourceId === cardId && q.isBurst) ? 'burst' : db.get(s.cards[cardId]!.cardNo).type === 'magic' ? 'flash' : 'burst';
}

function currentBpSafe(s: GameState, cardId: string): number {
  const def = db.get(s.cards[cardId]!.cardNo);
  if (!isSpiritLike(def)) return 0;
  const level = cardLevel(s, db, cardId);
  return def.levels.find((l) => l.level === level)?.bp ?? 0;
}

// ---------------------------------------------------------------- Core motion

/** ลำดับที่ Core ถูกสร้าง (engine ตั้งชื่อ core-N เรียงตามลำดับ) */
const coreSeq = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1)) || 0;

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
  /** Core ที่ออกจากการ์ดด้วยเอฟเฟกต์ แยกตามการ์ด (ไว้จับคู่กับ event ทีละเอฟเฟกต์) */
  const leaving = new Map<string, string[]>();
  for (const id of Object.keys(next.cores)) {
    const loc = locateCore(prev, id);
    if (!loc) continue;
    if (loc.area === 'card' && ghostAt.has(loc.cardId)) out.set(id, ghostAt.get(loc.cardId)!);
    else if (loc.area === 'life' && damageAt.has(loc.player)) out.set(id, damageAt.get(loc.player)!);
    else if (loc.area === 'card') {
      const now = locateCore(next, id);
      if (now?.area === 'card' && now.cardId === loc.cardId) continue;
      leaving.set(loc.cardId, [...(leaving.get(loc.cardId) ?? []), id]);
    }
  }
  // Core ที่ออกจากการ์ดด้วยเอฟเฟกต์ (ลง Trash / ส่งออกโดยคู่แข่ง / Soul Core → Reserve): ออกตามจังหวะของแต่ละเอฟเฟกต์
  for (const [cardId, ids] of leaving) {
    const pool = [...ids];
    for (const e of events) {
      const at = lastEventAt.get(e);
      if (e.type === 'soulToReserve' && e.cardId === cardId) {
        const soul = pool.find((c) => next.cores[c]!.isSoul);
        if (soul) {
          pool.splice(pool.indexOf(soul), 1);
          if (at) out.set(soul, at);
        }
      } else if ((e.type === 'coresToTrash' || e.type === 'coresRemoved') && e.cardId === cardId) {
        for (const c of pool.splice(0, e.count)) if (at) out.set(c, at);
      }
    }
  }
  // Core ที่เกิดใหม่ (Core Step / Void Core / ไลฟ์จากวอยด์): โผล่ตามจังหวะในไทม์ไลน์
  // จับคู่ทีละเม็ดตามลำดับที่เกิด: เอฟเฟกต์หลายอันที่ให้คอร์ (เช่น นอร์ธซีโรด 2 ใบ) โผล่คนละจังหวะ
  // (เดิมจับกับ event อันแรกที่ตรง → คอร์ของทุกเอฟเฟกต์โผล่พร้อมกันตอนอันแรก)
  const born = Object.keys(next.cores)
    .filter((id) => !prev.cores[id])
    .sort((a, b) => coreSeq(a) - coreSeq(b));
  const makers = events.filter((e) => e.type === 'voidCore' || e.type === 'lifeGained');
  const sizeOf = (e: GameEvent | undefined) => (e?.type === 'voidCore' ? e.count : e?.type === 'lifeGained' ? e.amount : 0);
  let mi = 0;
  let left = sizeOf(makers[0]);
  for (const id of born) {
    // Core จาก Core Step: โผล่ตอนป้าย CORE STEP แสดงจบ
    const gained = timeOf((e) => e.type === 'coreGained' && e.coreId === id);
    if (gained !== undefined) {
      out.set(id, gained);
      continue;
    }
    while (mi < makers.length && left <= 0) left = sizeOf(makers[++mi]);
    const maker = makers[mi];
    if (!maker) continue;
    left--;
    const at = lastEventAt.get(maker);
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
      case 'drawReveal': {
        const snd = DRAW_TIER[f.tier]!.sound;
        sfx('swish', f.delay + 60);
        if (snd) sfx(snd, f.delay + Math.round(DRAW_FLIP_MS * 0.55));
        break;
      }
      case 'finalBlowBanner':
        sfx('whoosh', f.delay);
        sfx('impact', f.delay + 120);
        break;
      case 'finalBlow':
        // กระแทกตอนเริ่มสโลว์ · แตก/ระเบิดตอนปล่อย
        sfx('impact', f.delay);
        sfx('shatter', f.delay + LETHAL_RELEASE - 80);
        sfx('bigdamage', f.delay + LETHAL_RELEASE);
        sfx('burst', f.delay + LETHAL_RELEASE + 40);
        break;
      case 'summon': {
        // ชาร์จ → ทุบ (เสียงกระแทกหนัก ตรงจังหวะแสงวาบ)
        const slam = f.delay + Math.round((f.special ? CUTIN_MS.special : CUTIN_MS.normal) * CUTIN_SLAM);
        sfx('whoosh', f.delay);
        // จุดกระแทกของเสียง xrare อยู่ที่ ~340ms จากต้นไฟล์ → เริ่มก่อนจังหวะทุบเท่านั้น
        sfx('xrare', Math.max(f.delay, slam - 340));
        sfx('impact', slam);
        sfx('bigdamage', slam + 20);
        break;
      }
      case 'fly':
        if (f.mode === 'draw') sfx('draw', f.delay);
        else if (f.mode === 'play' && f.heavy) {
          sfx('swish', f.delay);
          sfx('whoosh', f.delay + PLAY_HIT.heavy - 160);
          sfx('bigdamage', f.delay + PLAY_HIT.heavy + 20);
          sfx('place', f.delay + PLAY_HIT.heavy + 40);
        } else if (f.mode === 'play') {
          sfx('swish', f.delay);
          sfx('whoosh', f.delay + PLAY_HIT.normal - 130);
          sfx('place', f.delay + PLAY_HIT.normal);
        }
        else if (f.mode === 'magic') sfx(f.timing === 'flash' ? 'flash' : 'magic', f.delay);
        else if (f.landSound) {
          // เซ็ท Burst ฯลฯ: ปัดออกจากมือ แล้วเสียงประจำตอนถึงช่อง
          sfx('draw', f.delay);
          sfx(f.landSound, f.delay + 400);
        } else if (f.mode === 'move') sfx('draw', f.delay);
        else if (f.mode === 'brave') {
          sfx('swish', f.delay);
          sfx('whoosh', f.delay + 560);
        }
        break;
      case 'cardActivate':
        sfx('activate', f.delay);
        break;
      case 'spell':
        // ยก/พลิกขึ้นเวที → เสียงประจำประเภทตอนเรืองแสงครั้งแรก · เรืองแสงซ้ำ = เสียงเอฟเฟกต์ทำงาน · ลง Trash = ปัด
        if (f.from !== 'stage') sfx('swish', f.delay);
        f.pulses.forEach((p, i) => sfx(i === 0 && f.from !== 'stage' ? (f.tone === 'burst' ? 'burstCard' : f.tone === 'flash' ? 'flash' : 'magic') : 'activate', p));
        if (f.exit === 'trash' || f.exit === 'song') sfx('whoosh', f.end);
        break;
      case 'chainAdd': {
        // ตรงกับไทม์ไลน์ของ ChainAddFx (Fx.tsx): พุ่งเข้า 0 · โซ่ลาก CL_DRAW_AT · ล็อก CL_LOCK_AT · เลขพลิกหลังล็อก
        const heavy = f.index + 1 >= 3;
        sfx('chainIn', f.delay);
        sfx('chainRattle', f.delay + CHAIN_SFX.draw);
        sfx(heavy ? 'chainLockHeavy' : 'chainLock', f.delay + CHAIN_SFX.lock);
        sfx('chainDrone', f.delay + CHAIN_SFX.lock);
        sfx('chainNumber', f.delay + CHAIN_SFX.lock + 110);
        break;
      }
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
        sfx('whoosh', f.delay + CHARGE_MS * CHARGE_WIND - 40);
        sfx('attackHit', f.delay + T.hit);
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
        if (f.sound) sfx(f.sound, f.delay ?? 0);
        else if (f.tone === 'good') sfx('buff', f.delay ?? 0);
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

const TYPE_ORDER: Record<string, number> = { spirit: 0, ultimate: 1, brave: 2, nexus: 3, magic: 4 };
const COLOR_ORDER = ['red', 'purple', 'green', 'white', 'yellow', 'blue'];

/** ลำดับการ์ดในมือตามที่ตั้งค่าไว้ (การ์ดที่ได้มาใหม่ในโหมดจัดเอง ต่อท้าย) */
export function sortHand(s: GameState, hand: string[], mode: HandSort, manual?: string[]): string[] {
  if (mode === 'draw') return hand;
  if (mode === 'manual') {
    if (!manual) return hand;
    const known = manual.filter((id) => hand.includes(id));
    return [...known, ...hand.filter((id) => !known.includes(id))];
  }
  const key = (id: string): (number | string)[] => {
    const def = db.get(s.cards[id]!.cardNo);
    const cost = def.cost;
    const color = Math.min(...def.colors.map((c) => (COLOR_ORDER.indexOf(c) + 7) % 7));
    const type = TYPE_ORDER[def.type] ?? 9;
    return mode === 'cost' ? [cost, color, def.name] : mode === 'color' ? [color, cost, def.name] : [type, cost, def.name];
  };
  const keys = new Map(hand.map((id) => [id, key(id)]));
  return [...hand].sort((a, b) => {
    const ka = keys.get(a)!;
    const kb = keys.get(b)!;
    for (let i = 0; i < ka.length; i++) {
      const x = ka[i]!;
      const y = kb[i]!;
      if (x === y) continue;
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th');
    }
    return hand.indexOf(a) - hand.indexOf(b);
  });
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
  /** อัญเชิญหลายใบจากที่แสดงบนกระดาน (ดู MultiPlan) */
  multi: MultiPlan | null;
  /** ขั้นเลือกการ์ด: เลือก/ยกเลิกการ์ดที่แสดง */
  multiToggle(cardId: string): void;
  /** ถัดไป: เลือกการ์ดเสร็จ → จัดใบแรก / จัดใบนี้เสร็จ → ใบถัดไป หรือส่งการเลือกทั้งหมด */
  multiNext(): void;
  /** ย้อนกลับไปใบก่อนหน้า / กลับไปเลือกการ์ด */
  multiBack(): void;
  /** Brave ที่กำลังจัด: ลงสนามเป็นสปิริต (วาง Core เอง) */
  multiAsSpirit(): void;
  /** เลือก Core อัตโนมัติ n ดวงจากรีเสิร์ฟ (ปุ่มเลือก Lv) */
  autoSelectCores(n: number): void;
  /** Core ที่กำลังลาก */
  dragging: string[] | null;
  play: { cardId: string; kind: PlayKind; timing?: MagicTiming; braveOnto?: string } | null;
  /** การ์ดที่กำลังเล่น (แผงเล่นการ์ดบนกระดาน): Core ที่จะจ่าย/วาง แสดงบน Core ในกระดาน · คลิก Core บนกระดาน = ปรับเอง */
  playCores: PlayCores | null;
  setPlayCores(v: PlayCores | null): void;
  /** คลิก Core บนกระดานระหว่างเล่นการ์ด: ว่าง → จ่าย → วางบนการ์ด → ว่าง */
  cyclePlayCore(coreId: string): void;
  /**
   * กำลังแบ่งคอร์ที่จะส่งออก (choice distribute): key = choice ที่แบ่งอยู่ (เปลี่ยน choice = เริ่มใหม่) · n = จำนวนต่อการ์ด
   * อ่านผ่าน allocOf() เสมอ
   */
  alloc: { key: string; n: Record<string, number> } | null;
  /** เพิ่ม/ลดจำนวนคอร์ที่จะส่งออกจากการ์ดนี้ (ไม่เกินที่มี และรวมไม่เกินที่ต้องส่ง) */
  allocAdd(cardId: string, delta: number): void;
  allocClear(): void;
  /** เลือกหลายใบทีเดียว (choice multiCard): การ์ดที่เลือกไว้ · อ่านผ่าน pickedOf() */
  picked: { key: string; ids: string[] } | null;
  /** เลือก/ยกเลิกการ์ดนี้ (เต็มจำนวนแล้วเลือกเพิ่มไม่ได้) */
  togglePick(cardId: string): void;
  clearPicks(): void;
  /** สปิริตที่กดโจมตีแล้ว รอยืนยัน */
  attackConfirm: string | null;
  confirmAttack(ok: boolean): void;
  /** สปิริตที่กดป้องกันแล้ว รอยืนยัน */
  blockConfirm: string | null;
  confirmBlock(ok: boolean): void;
  /** สปิริตที่กำลังเลือก Core สำหรับ [Evolution] */
  evolveCard: string | null;
  /** แผงรายละเอียด: การ์ดที่ชี้อยู่ และการ์ดที่คลิกปักไว้ */
  hovered: string | null;
  pinned: string | null;
  /** ดู Trash ของผู้เล่น */
  trashView: PlayerId | null;
  /** พัดการ์ดใน Trash ที่อัญเชิญได้ตอนนี้ (แตะช่อง Trash ตอนมีใบที่อัญเชิญได้) */
  trashFan: PlayerId | null;
  /** พัดการ์ดนอกมือ (แตะโซนนอกมือบนสนาม) */
  shownFan: PlayerId | null;

  newGame(): void;
  setDeck(player: PlayerId, deck: DeckId): void;
  dispatch(action: Action): boolean;
  /** ทำ action กับ state ในเครื่อง (silent = ไม่มีแอนิเมชัน/เสียง, remote = มาจากห้องออนไลน์: ไม่แสดง error) */
  applyLocal(action: Action, opts?: { silent?: boolean; remote?: boolean }): boolean;
  /** การเล่นออนไลน์ (null = เล่นเครื่องเดียว) */
  online: OnlineState | null;
  onlineHost(deck: DeckId, meta?: { name: string; comment: string; listed: boolean }): Promise<void>;
  /** หน้าที่แสดงอยู่ */
  screen: Screen;
  setScreen(screen: Screen): void;
  /** ชื่อผู้เล่นของเครื่องนี้ (จำไว้ใน localStorage) */
  playerName: string;
  setPlayerName(name: string): void;
  /** เริ่มเกมเล่นเครื่องเดียวด้วยเด็คที่เลือก แล้วไปหน้ากระดาน */
  startLocal(decks: DeckChoice): void;
  /** เริ่มเกมจาก state ที่จัดไว้แล้ว (บทเรียน): ไม่มีฉากเปิดเกม · ไม่นับเป็นเกมเครื่องเดียวที่เล่นต่อได้ */
  startScripted(state: GameState): void;
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
  /** หน้าดู/จัดเด็คกดย้อนกลับแล้วไปหน้านี้ (เปิดจากหน้า DUEL = lobby) */
  deckReturn: Screen;
  /** หน้าเด็คของฉันในโหมดเลือกเด็คให้ห้องดวล (เด็คที่ใช้อยู่) · null = โหมดปกติ */
  deckPick: DeckId | null;
  onlineJoin(code: string, deck: DeckId): Promise<void>;
  onlineLeave(): void;
  /** ห้องดวลที่อยู่ (หลายคน หลายโต๊ะ) */
  duel: DuelState | null;
  /** เจ้าของห้องเปลี่ยนเด็คระหว่างรอคู่แข่ง */
  onlineSetDeck(deck: DeckId): Promise<void>;
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
  /** ลำดับการ์ดในมือที่ผู้เล่นจัดเอง (ลากสลับ) · ใช้เมื่อเลือกเรียงแบบ "จัดเอง" */
  handOrder: Partial<Record<PlayerId, string[]>>;
  /** ย้ายการ์ดในมือไปไว้ตำแหน่ง index ของลำดับที่แสดงอยู่ (shown) */
  reorderHand(player: PlayerId, shown: string[], cardId: string, index: number): void;
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

export type Screen = 'home' | 'lobby' | 'decks' | 'mydeck' | 'builder' | 'game';

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
  /** เข้าชมการดวล (ไม่ได้เป็นผู้เล่น: สั่งอะไรไม่ได้ เห็นมือคว่ำทั้งสองฝ่าย) */
  spectator?: boolean;
  /** ค่าตั้งต้นของรอบปัจจุบัน (null = ยังรอคู่แข่ง) */
  setup: RoomSetup | null;
  /** จำนวน action ของรอบนี้ที่ทำแล้ว */
  applied: number;
  opponentHere: boolean;
  /** ชื่อผู้เล่นในห้อง */
  names: Partial<Record<PlayerId, string>>;
  /** รูปโปรไฟล์ (รหัสการ์ด) ของแต่ละที่นั่ง · ไม่มี = ใช้หน้าปกเด็คของที่นั่งนั้น */
  avatars: Partial<Record<PlayerId, string>>;
  /** ผู้ชมที่อยู่ในห้องเกมตอนนี้ (uid → ชื่อ) จาก rooms/<code>/watchers · ผู้ชมลบตัวเองเมื่อออก/หลุดการเชื่อมต่อ */
  watchers?: Record<string, string>;
}

/** รูปโปรไฟล์ที่เลือกไว้ (เก็บโดย account.ts) · ยังไม่เลือก = undefined */
export const storedAvatar = (): string | undefined => {
  try {
    return localStorage.getItem('bs-avatar') || undefined;
  } catch {
    return undefined;
  }
};

/** ?online=local = ทดสอบ 2 แท็บในเครื่องเดียว (ไม่ใช้ Firebase) */
const useLocal = typeof location !== 'undefined' && new URLSearchParams(location.search).get('online') === 'local';
const transport: Transport = useLocal ? localTransport : firebaseTransport;
/** เล่นออนไลน์ได้หรือไม่ (ตั้งค่า Firebase แล้ว หรือใช้โหมดทดสอบในเครื่อง) */
export const onlineAvailable = useLocal || firebaseConfigured;
export const onlineVia = transport.name;

/** รายการห้องที่เปิดให้เห็น (ใหม่สุดก่อน · ตัดห้องเก่าเกิน 6 ชั่วโมง) */
export async function listRooms(): Promise<LobbyEntry[]> {
  await transport.signIn(); // กฎฐานข้อมูลให้อ่านรายการห้องได้เฉพาะเครื่องที่ล็อกอินแล้ว
  const all = await transport.listRooms();
  const fresh = Date.now() - 6 * 3600_000;
  return all.filter((e) => e.createdAt > fresh).sort((a, b) => b.createdAt - a.createdAt);
}

/** ดูข้อมูลห้อง (ก่อนกดเข้าที่นั่ง) */
export function watchRoomInfo(code: string, cb: (info: RoomInfo | null) => void): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;
  void transport.signIn().then(
    () => {
      if (!cancelled) stop = transport.watchRoom(code, cb);
    },
    () => cb(null),
  );
  return () => {
    cancelled = true;
    stop?.();
  };
}

/** เลข MAJOR เดียวกัน = เล่นออนไลน์ด้วยกันได้ */
export const compatibleVersion = (v: string | undefined) => !v || v.split('.')[0] === APP_VERSION.split('.')[0];

const SESSION = 'bs-online';
const randomCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const clearSession = () => sessionStorage.removeItem(SESSION);

let unsubRoom: (() => void) | null = null;
let unsubActions: (() => void) | null = null;
let unsubWatchers: (() => void) | null = null;
/** ช่องถัดไปที่จะเขียน action ของเรา */
let nextIndex = 0;
/** action ที่มาก่อนลำดับ (รอจนลำดับต่อเนื่อง) */
const buffer = new Map<number, Action>();
/** action ลำดับก่อนหน้านี้มีอยู่แล้วตอนเข้าห้อง: เล่นซ้ำแบบเงียบ */
let silentBelow = 0;

function stopSync() {
  unsubRoom?.();
  unsubActions?.();
  unsubWatchers?.();
  unsubRoom = unsubActions = unsubWatchers = null;
  buffer.clear();
}

/** เลข MAJOR เดียวกัน = engine เดินเหมือนกัน เล่นออนไลน์ด้วยกันได้ (ดูกติกาเลขเวอร์ชันใน changelog.ts) */
const sameMajor = (a: string, b: string) => a.split('.')[0] === b.split('.')[0];
const versionMismatchText = (other: string) =>
  `อีกฝ่ายใช้เวอร์ชัน ${other} แต่เครื่องนี้ใช้ ${APP_VERSION}: กติกาในเกมไม่ตรงกัน ให้ทั้งสองฝั่งอัปเดตเป็นเวอร์ชันล่าสุด (โหลดหน้าเว็บใหม่) ก่อนเล่นด้วยกัน`;

function enterRoom(code: string, me: PlayerId, uid: string, spectator = false) {
  stopSync();
  if (!spectator) sessionStorage.setItem(SESSION, JSON.stringify({ code, me, via: transport.name }));
  useGame.setState({
    online: { code, me, uid, via: transport.name, status: 'waiting', setup: null, applied: 0, opponentHere: me === 'p2', names: {}, avatars: {}, ...(spectator ? { spectator } : {}) },
    error: null,
  });
  unsubRoom = transport.watchRoom(code, (info) => onRoom(code, info));
  // จำนวนผู้ชม: ทุกเครื่องในห้อง (ผู้เล่น/ผู้ชม) ฟังรายชื่อ · ผู้ชมเพิ่มชื่อตัวเอง และให้เซิร์ฟเวอร์ลบเองเมื่อหลุดการเชื่อมต่อ/ปิดแท็บ
  unsubWatchers = transport.watchPath(watcherPath(code), (v) => {
    const on = useGame.getState().online;
    if (on?.code === code) useGame.setState({ online: { ...on, watchers: (v as Record<string, string> | null) ?? {} } });
  });
  if (spectator) {
    const path = watcherPath(code, uid);
    void transport
      .setPath(path, useGame.getState().playerName)
      .then(() => transport.removeOnDisconnect(path))
      .catch(() => {});
  }
}

/** รายชื่อผู้ชมของห้องเกม (uid = ผู้ชมคนนั้น) */
function watcherPath(code: string, uid?: string): string {
  return `rooms/${code}/watchers${uid ? `/${uid}` : ''}`;
}

/** ที่นั่ง (uid) ของห้องเกมล่าสุด: ฉากเปิดเกมใช้แสดง Player ID */
let lastSeats: Partial<Record<PlayerId, string>> = {};

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
  // คู่แข่งใช้เวอร์ชันที่ engine ไม่ตรงกับเรา: เตือน (เครื่องเวอร์ชันเก่ามากจะไม่มีข้อมูลนี้ = ตรวจไม่ได้)
  const oppVersion = info.versions?.[opponentOf(on.me)];
  if (oppVersion && !sameMajor(oppVersion, APP_VERSION) && useGame.getState().error !== versionMismatchText(oppVersion)) {
    useGame.setState({ error: versionMismatchText(oppVersion) });
  }
  const ready = !!info.setup.decks.p2 && !!info.seats.p2;
  const names = info.names ?? {};
  const avatars = info.avatars ?? {};
  lastSeats = info.seats;
  if (ready && (on.status === 'waiting' || on.setup?.round !== info.setup.round)) {
    useGame.setState({ online: { ...on, names, avatars } });
    void startRound(code, info.setup, opponentHere);
  } else if (on.status === 'choosing' && info.setup.first && on.setup?.round === info.setup.round) {
    // คนชนะการเสี่ยงเลือกแล้ว: สร้างเกมด้วยผู้เริ่มก่อนที่เลือก แล้วเริ่มรับ action
    useGame.setState({ online: { ...on, opponentHere, names, avatars } });
    beginPlay(code, info.setup, opponentHere, 0);
  } else {
    // ยังรอคู่แข่ง: เก็บ setup ของห้องไว้ (หน้า Lobby แสดงเด็คที่เลือกจริงจากห้อง)
    useGame.setState({ online: { ...on, opponentHere, names, avatars, ...(on.status === 'waiting' ? { setup: info.setup } : {}) } });
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
  const avatars = st.online.avatars;
  // ฉากเปิดเกม: จอของคนชนะการเสี่ยงออกหัว จอของอีกฝั่งออกก้อย
  const intro: Fx[] =
    st.animations && existing === 0
      ? matchIntro(winner === me, { name: names[me] ?? st.playerName, deck: decks[me], avatar: avatars[me] ?? storedAvatar(), uid: lastSeats[me] ?? st.online.uid }, { name: names[opp] ?? 'คู่แข่ง', deck: decks[opp], avatar: avatars[opp], uid: lastSeats[opp] })
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


// ---------------------------------------------------------------- ห้องดวล (Duel Room: หลายคน หลายโต๊ะ)

/** ห้องดวลที่เครื่องนี้อยู่ */
export interface DuelState {
  code: string;
  uid: string;
  room: DuelRoom | null;
}

const DUEL_SESSION = 'bs-duel-room';
const roomPath = (code: string) => `rooms/${code}`;
let unsubDuel: (() => void) | null = null;
/** เกมที่เครื่องนี้ออกมาแล้ว (ไม่ดึงกลับเข้าไปเองอีก) */
const leftGames = new Set<string>();
/** กำลังสร้างเกมของโต๊ะ (กันสร้างซ้ำ) */
let startingTable = false;

/** สมาชิกที่ยังอยู่ในห้อง (คนที่หลุดถูกลบออกจาก members แล้ว ที่นั่งของเขาถือว่าว่าง) */
export function seatUid(room: DuelRoom, t: string, seat: PlayerId): string | undefined {
  const uid = room.tables?.[t]?.seats?.[seat];
  return uid && room.members?.[uid] ? uid : undefined;
}
export const tableIds = (room: DuelRoom) => Array.from({ length: room.meta.tables }, (_, i) => String(i + 1));
/** ที่นั่งของ uid ในห้อง */
export function seatOf(room: DuelRoom, uid: string): { t: string; seat: PlayerId } | null {
  for (const t of tableIds(room)) for (const seat of PLAYERS) if (seatUid(room, t, seat) === uid) return { t, seat };
  return null;
}

function stopDuel() {
  unsubDuel?.();
  unsubDuel = null;
}

function watchDuel(code: string, uid: string) {
  stopDuel();
  try {
    sessionStorage.setItem(DUEL_SESSION, code);
  } catch {
    /* */
  }
  useGame.setState({ duel: { code, uid, room: null }, error: null });
  unsubDuel = transport.watchPath(roomPath(code), (v) => onDuel(code, uid, v as DuelRoom | null));
}

function onDuel(code: string, uid: string, room: DuelRoom | null) {
  const st = useGame.getState();
  if (st.duel?.code !== code) return;
  if (!room || room.kind !== 'duel') {
    stopDuel();
    sessionStorage.removeItem(DUEL_SESSION);
    useGame.setState({ duel: null, error: 'ห้องนี้ถูกปิดแล้ว' });
    return;
  }
  // หลุดแล้วกลับมา (เน็ตหลุดชั่วคราว): ใส่ชื่อกลับเข้าห้อง
  if (!room.members?.[uid]) {
    const n = Object.keys(room.members ?? {}).length;
    if (n < room.meta.max) {
      void transport.setPath(`${roomPath(code)}/members/${uid}`, myMember(lastLobbyDeck)).then(() => transport.removeOnDisconnect(`${roomPath(code)}/members/${uid}`)).catch(() => {});
    }
  }
  useGame.setState({ duel: { code, uid, room } });
  const mine = seatOf(room, uid);
  if (!mine) return;
  const tb = room.tables?.[mine.t] ?? {};
  // ทั้งสองฝั่งพร้อม: ที่นั่ง p1 เป็นคนสร้างเกม
  if (!tb.game && mine.seat === 'p1' && seatUid(room, mine.t, 'p2') && tb.ready?.p1 && tb.ready?.p2 && !startingTable) {
    void startTable(code, room, mine.t, uid);
  }
  // โต๊ะของเราเริ่มเกมแล้ว: เข้ากระดาน
  if (tb.game && !leftGames.has(tb.game) && st.online?.code !== tb.game) enterRoom(tb.game, mine.seat, uid);
}

/** avatars ของห้องเกม (ไม่ใส่ค่าว่าง: Firebase ไม่รับ undefined) */
function seatAvatars(a1?: string, a2?: string): { avatars?: Partial<Record<PlayerId, string>> } {
  const avatars = { ...(a1 ? { p1: a1 } : {}), ...(a2 ? { p2: a2 } : {}) };
  return Object.keys(avatars).length ? { avatars } : {};
}

async function startTable(code: string, room: DuelRoom, t: string, uid: string) {
  startingTable = true;
  try {
    const p2 = seatUid(room, t, 'p2')!;
    const m1 = room.members![uid]!;
    const m2 = room.members![p2]!;
    const game = `${code}-${randomCode()}`;
    const setup: RoomSetup = { round: 1, seed: randomSeed(), decks: { p1: m1.deck, p2: m2.deck } };
    await transport.createRoom(game, { seats: { p1: uid, p2 }, setup, names: { p1: m1.name, p2: m2.name }, versions: { p1: m1.version, p2: m2.version }, ...seatAvatars(m1.avatar, m2.avatar) });
    const res = await transport.transactPath(`${roomPath(code)}/tables/${t}`, (cur: DuelTable | null) => {
      if (!cur) return cur;
      if (cur.game || !cur.ready?.p1 || !cur.ready?.p2 || cur.seats?.p1 !== uid || cur.seats?.p2 !== p2) return undefined;
      return { ...cur, game };
    });
    if (!res.committed || (res.value as DuelTable | null)?.game !== game) void transport.removePath(roomPath(game)).catch(() => {});
  } catch (e) {
    useGame.setState({ error: `เริ่มเกมไม่สำเร็จ: ${(e as Error).message}` });
  } finally {
    startingTable = false;
  }
}

/** เด็คที่เลือกล่าสุดในหน้าห้อง (ใช้ตอนกลับเข้าห้องเอง) */
let lastLobbyDeck: DeckId = 'sd01';
function myMember(deck: DeckId): DuelMember {
  lastLobbyDeck = deck;
  const avatar = storedAvatar();
  return { name: useGame.getState().playerName, deck: deckToken(deck), version: APP_VERSION, joinedAt: Date.now(), ...(avatar ? { avatar } : {}) };
}

function lobbyCount(code: string, room: DuelRoom | null) {
  if (!room?.meta.listed) return;
  void transport.setPath(`lobby/${code}/count`, Object.keys(room.members ?? {}).length).catch(() => {});
}

export async function duelCreate(meta: { name: string; comment: string; listed: boolean; max: number }, deck: DeckId): Promise<void> {
  try {
    const uid = await transport.signIn();
    const code = randomCode();
    const name = useGame.getState().playerName;
    const max = Math.max(2, Math.min(6, meta.max));
    const room: DuelRoom = {
      kind: 'duel',
      host: uid,
      meta: { name: meta.name.trim() || `ห้องของ ${name}`, comment: meta.comment, listed: meta.listed, createdAt: Date.now(), max, tables: Math.ceil(max / 2), version: APP_VERSION },
      members: { [uid]: myMember(deck) },
    };
    const res = await transport.transactPath(roomPath(code), (cur) => (cur ? undefined : room));
    if (!res.committed) throw new Error('รหัสห้องนี้ถูกใช้แล้ว ลองใหม่อีกครั้ง');
    void transport.removeOnDisconnect(`${roomPath(code)}/members/${uid}`).catch(() => {});
    if (room.meta.listed) {
      void transport
        .publishRoom({ code, name: room.meta.name, comment: room.meta.comment, host: name, createdAt: room.meta.createdAt, version: APP_VERSION, count: 1, max })
        .catch(() => {});
    }
    watchDuel(code, uid);
  } catch (e) {
    useGame.setState({ error: `สร้างห้องไม่สำเร็จ: ${(e as Error).message}` });
  }
}

export async function duelJoin(rawCode: string, deck: DeckId): Promise<boolean> {
  try {
    const uid = await transport.signIn();
    const code = rawCode.trim().toUpperCase();
    let reason = '';
    const res = await transport.transactPath(roomPath(code), (cur: DuelRoom | null) => {
      // ครั้งแรก SDK อาจส่ง null มาก่อนอ่านค่าจริง: คืนค่าเดิมให้ลองใหม่กับข้อมูลจริง
      if (!cur) return cur;
      if (cur.kind !== 'duel') {
        reason = 'ไม่พบห้องนี้';
        return undefined;
      }
      if (!compatibleVersion(cur.meta.version)) {
        reason = versionMismatchText(cur.meta.version);
        return undefined;
      }
      const members = cur.members ?? {};
      if (!members[uid] && Object.keys(members).length >= cur.meta.max) {
        reason = 'ห้องนี้เต็มแล้ว';
        return undefined;
      }
      return { ...cur, members: { ...members, [uid]: myMember(deck) } };
    });
    const room = res.value as DuelRoom | null;
    if (!res.committed || !room) throw new Error(reason || 'ไม่พบห้องนี้');
    void transport.removeOnDisconnect(`${roomPath(code)}/members/${uid}`).catch(() => {});
    lobbyCount(code, room);
    watchDuel(code, uid);
    return true;
  } catch (e) {
    useGame.setState({ error: `เข้าห้องไม่สำเร็จ: ${(e as Error).message}` });
    return false;
  }
}

/** แก้ห้องของเรา (ทรานแซกชันทั้งห้อง) */
async function duelUpdate(fn: (room: DuelRoom, uid: string) => DuelRoom | undefined): Promise<boolean> {
  const d = useGame.getState().duel;
  if (!d) return false;
  const res = await transport.transactPath(roomPath(d.code), (cur: DuelRoom | null) => {
    if (!cur) return cur;
    return fn(cur, d.uid);
  });
  return res.committed;
}

/** ลุกจากทุกที่นั่งของ uid (ในห้องที่แก้อยู่) */
function vacate(room: DuelRoom, uid: string) {
  for (const t of Object.keys(room.tables ?? {})) {
    const tb = room.tables![t]!;
    for (const seat of PLAYERS) {
      if (tb.seats?.[seat] === uid) {
        delete tb.seats[seat];
        if (tb.ready) delete tb.ready[seat];
      }
    }
  }
}

export async function duelLeave(): Promise<void> {
  const st = useGame.getState();
  const d = st.duel;
  if (!d) return;
  if (st.online) st.onlineLeave();
  stopDuel();
  sessionStorage.removeItem(DUEL_SESSION);
  useGame.setState({ duel: null });
  const host = d.room?.host === d.uid;
  try {
    if (host) {
      await transport.removePath(roomPath(d.code));
      await transport.removePath(chatPath(d.code)).catch(() => {});
      await transport.unpublishRoom(d.code);
    } else {
      const res = await transport.transactPath(roomPath(d.code), (cur: DuelRoom | null) => {
        if (!cur) return cur;
        if (cur.members) delete cur.members[d.uid];
        vacate(cur, d.uid);
        return cur;
      });
      lobbyCount(d.code, res.value as DuelRoom | null);
    }
  } catch {
    /* ออกแล้วฝั่งเรา */
  }
}

export function duelSit(t: string, seat: PlayerId) {
  void duelUpdate((room, uid) => {
    const tb = room.tables?.[t] ?? {};
    const taken = tb.seats?.[seat];
    if (taken && taken !== uid && room.members?.[taken]) return undefined;
    if (tb.game) return undefined;
    vacate(room, uid);
    room.tables = { ...(room.tables ?? {}), [t]: { ...(room.tables?.[t] ?? {}), seats: { ...(room.tables?.[t]?.seats ?? {}), [seat]: uid }, ready: { ...(room.tables?.[t]?.ready ?? {}), [seat]: false } } };
    return room;
  }).then((ok) => !ok && useGame.setState({ error: 'นั่งที่นี่ไม่ได้ (มีคนนั่งแล้ว)' }));
}

export function duelStand() {
  void duelUpdate((room, uid) => {
    const s = seatOf(room, uid);
    if (s && room.tables?.[s.t]?.game) return undefined;
    vacate(room, uid);
    return room;
  });
}

export function duelReady(ready: boolean) {
  void duelUpdate((room, uid) => {
    const s = seatOf(room, uid);
    if (!s || room.tables?.[s.t]?.game) return undefined;
    const tb = room.tables![s.t]!;
    tb.ready = { ...(tb.ready ?? {}), [s.seat]: ready };
    return room;
  });
}

export function duelSetDeck(deck: DeckId) {
  const d = useGame.getState().duel;
  lastLobbyDeck = deck;
  if (!d) return;
  void transport.setPath(`${roomPath(d.code)}/members/${d.uid}/deck`, deckToken(deck)).catch((e: Error) => useGame.setState({ error: `เปลี่ยนเด็คไม่สำเร็จ: ${e.message}` }));
}

// ---------------------------------------------------------------- แชตในห้องดวล
// เก็บแยกจากข้อมูลห้องที่ rooms/<code>-chat (ใช้กฎ Realtime Database ของ rooms เดิม ·
// ไม่ชนกับทรานแซกชันของห้อง และหน้าห้องไม่ต้องวาดใหม่ทุกข้อความ)

export interface ChatMsg {
  uid: string;
  name: string;
  text: string;
  at: number;
  avatar?: string;
}

/** ความยาวข้อความแชตสูงสุด */
export const CHAT_MAX = 200;
const chatPath = (code: string) => `rooms/${code}-chat`;

/** ติดตามแชตของห้องดวล (เรียงตามเวลา เก็บ 100 ข้อความล่าสุด) */
export function watchDuelChat(code: string, cb: (msgs: ChatMsg[]) => void): () => void {
  return transport.watchPath(chatPath(code), (v) => {
    const all = Object.values((v ?? {}) as Record<string, ChatMsg>).filter((m) => m && typeof m.text === 'string');
    all.sort((a, b) => a.at - b.at);
    cb(all.slice(-100));
  });
}

export function duelChatSend(text: string) {
  const d = useGame.getState().duel;
  const msg = text.trim().slice(0, CHAT_MAX);
  if (!d || !msg) return;
  const at = Date.now();
  const avatar = storedAvatar();
  const m: ChatMsg = { uid: d.uid, name: useGame.getState().playerName, text: msg, at, ...(avatar ? { avatar } : {}) };
  void transport
    .setPath(`${chatPath(d.code)}/${at.toString(36)}-${d.uid.slice(0, 8)}`, m)
    .catch((e: Error) => useGame.setState({ error: `ส่งข้อความไม่สำเร็จ: ${e.message}` }));
}

/** เข้าชมการดวลของโต๊ะ t (มือทั้งสองฝ่ายคว่ำ สั่งอะไรไม่ได้) */
export function duelSpectate(t: string) {
  const d = useGame.getState().duel;
  const game = d?.room?.tables?.[t]?.game;
  if (!d || !game) return;
  leftGames.delete(game);
  enterRoom(game, 'p1', d.uid, true);
}

/** รีเฟรชหน้า: กลับเข้าห้องดวลเดิม */
async function resumeDuel() {
  const code = sessionStorage.getItem(DUEL_SESSION);
  if (!code || !onlineAvailable) return;
  let deck: DeckId = 'sd01';
  try {
    deck = localStorage.getItem('bs-lobby-deck') ?? 'sd01';
  } catch {
    /* */
  }
  if (!(await duelJoin(code, deck))) sessionStorage.removeItem(DUEL_SESSION);
}
if (typeof window !== 'undefined') setTimeout(() => void resumeDuel(), 0);

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
  /** รูปโปรไฟล์ (รหัสการ์ด) · ไม่มี = หน้าปกเด็ค */
  avatar?: string;
  /** uid ของที่นั่ง (แสดง Player ID) · เล่นเครื่องเดียว = ไม่มี */
  uid?: string;
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
const resetUi: Pick<Store, 'selectedHandCard' | 'selectedCores' | 'dragging' | 'play' | 'playCores' | 'attackConfirm' | 'blockConfirm' | 'evolveCard' | 'multi'> = {
  selectedHandCard: null,
  selectedCores: [],
  multi: null,
  dragging: null,
  play: null,
  playCores: null,
  attackConfirm: null,
  blockConfirm: null,
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
    deckReturn: 'home',
    deckPick: null,
    pregame: null,
    startScripted: (state) => {
      set({ ...resetUi, state, truth: null, history: [], error: null, fx: [], holds: {}, pregame: null, viewTurn: state.turnPlayer, screen: 'game', localInProgress: false });
    },
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
        if (online.spectator || online.me !== pregame.winner || !online.setup) return;
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
    onlineHost: async (deck, meta) => {
      try {
        const uid = await transport.signIn();
        const code = randomCode();
        const setup: RoomSetup = { round: 1, seed: randomSeed(), decks: { p1: deckToken(deck), p2: null } };
        const name = get().playerName;
        const roomMeta = { name: meta?.name.trim() || `ห้องของ ${name}`, comment: meta?.comment ?? '', listed: meta?.listed ?? false, createdAt: Date.now() };
        await transport.createRoom(code, { seats: { p1: uid }, setup, names: { p1: name }, meta: roomMeta });
        // เวอร์ชันของเรา: เขียนแยก เขียนไม่ได้ก็เล่นได้ตามเดิม (แค่ตรวจเวอร์ชันไม่ได้)
        void transport.setVersion(code, 'p1', APP_VERSION).catch(() => {});
        const av1 = storedAvatar();
        if (av1) void transport.setAvatar(code, 'p1', av1).catch(() => {});
        // ลงรายการห้อง: ลงไม่ได้ (สิทธิ์ฐานข้อมูล) ก็ยังเข้าด้วยรหัสห้องได้
        if (roomMeta.listed) {
          void transport
            .publishRoom({ code, name: roomMeta.name, comment: roomMeta.comment, host: name, createdAt: roomMeta.createdAt, version: APP_VERSION })
            .catch(() => {});
        }
        enterRoom(code, 'p1', uid);
      } catch (e) {
        set({ error: `สร้างห้องไม่สำเร็จ: ${(e as Error).message}` });
      }
    },
    onlineJoin: async (code, deck) => {
      try {
        const uid = await transport.signIn();
        const c = code.trim().toUpperCase();
        // เจ้าของห้องใช้เวอร์ชันที่ engine ไม่ตรงกับเรา (MAJOR ต่างกัน): เล่นด้วยกันจะเดินไม่ตรงกัน ไม่ให้เข้า
        const host = (await transport.readRoom(c))?.versions?.p1;
        if (host && !sameMajor(host, APP_VERSION)) {
          set({ error: versionMismatchText(host) });
          return;
        }
        await transport.joinRoom(c, uid, deckToken(deck), get().playerName);
        // ห้องเต็มแล้ว: เอาออกจากรายการห้อง
        void transport.unpublishRoom(c).catch(() => {});
        void transport.setVersion(c, 'p2', APP_VERSION).catch(() => {});
        const av2 = storedAvatar();
        if (av2) void transport.setAvatar(c, 'p2', av2).catch(() => {});
        enterRoom(c, 'p2', uid);
      } catch (e) {
        set({ error: `เข้าห้องไม่สำเร็จ: ${(e as Error).message}` });
      }
    },
    onlineLeave: () => {
      const on = get().online;
      const duel = get().duel;
      stopSync();
      clearSession();
      if (on) leftGames.add(on.code);
      if (on && !on.spectator) void transport.leave(on.code, on.me).catch(() => {});
      // ผู้ชมออกจากเกม: เอาชื่อออกจากรายชื่อผู้ชมทันที (ไม่ต้องรอหลุดการเชื่อมต่อ)
      if (on?.spectator) void transport.removePath(watcherPath(on.code, on.uid)).catch(() => {});
      if (on?.me === 'p1' && !duel) void transport.unpublishRoom(on.code).catch(() => {});
      // ผู้เล่นออกจากเกมของโต๊ะ: โต๊ะกลับไปรอพร้อมใหม่ (ยังนั่งที่เดิม)
      if (duel && on && !on.spectator) {
        void transport
          .transactPath(`rooms/${duel.code}/tables`, (cur: Record<string, DuelTable> | null) => {
            if (!cur) return cur;
            for (const tb of Object.values(cur)) {
              if (tb?.game === on.code) {
                delete tb.game;
                tb.ready = {};
              }
            }
            return cur;
          })
          .catch(() => {});
      }
      set({ online: null, screen: duel || (on && on.status === 'waiting') ? 'lobby' : 'home', localInProgress: false });
      get().newGame();
    },
    onlineSetDeck: async (deck) => {
      const on = get().online;
      if (!on || on.me !== 'p1' || on.status !== 'waiting') return;
      try {
        if (!(await transport.setHostDeck(on.code, deckToken(deck)))) set({ error: 'เปลี่ยนเด็คไม่ได้: คู่แข่งเข้าที่นั่งแล้ว' });
      } catch (e) {
        set({ error: `เปลี่ยนเด็คไม่สำเร็จ: ${(e as Error).message}` });
      }
    },
    onlineRematch: () => {
      const on = get().online;
      if (!on || on.spectator || on.me !== 'p1' || !on.setup) return;
      // รอบใหม่: โยนเหรียญและเลือกผู้เริ่มก่อนใหม่ (ไม่เอา first ของรอบก่อน)
      void transport.setSetup(on.code, { round: on.setup.round + 1, seed: randomSeed(), decks: on.setup.decks });
    },
    fx: [{ id: ++fxSeq, kind: 'banner', tone: 'turn', title: 'เทิร์นที่ 1', sub: 'เริ่มเกม' }],
    selectedHandCard: null,
    selectedCores: [],
    multi: null,
    dragging: null,
    play: null,
    playCores: null,
    attackConfirm: null,
    blockConfirm: null,
    alloc: null,
    allocAdd(cardId, delta) {
      const { state } = get();
      const c = state.choice;
      if (c?.kind !== 'distribute' || !mine(c.player) || !c.candidates.includes(cardId)) return;
      const n = { ...allocOf(get()) };
      const sum = Object.values(n).reduce((a, b) => a + b, 0);
      const cur = n[cardId] ?? 0;
      const next = Math.max(0, Math.min(c.caps[cardId] ?? 0, cur + delta, cur + (c.total - sum)));
      if (next === cur) return;
      sfx('click');
      n[cardId] = next;
      set({ alloc: { key: distributeKey(c), n } });
    },
    allocClear() {
      set({ alloc: null });
    },
    picked: null,
    togglePick(cardId) {
      const c = get().state.choice;
      if (c?.kind !== 'multiCard' || !mine(c.player) || !c.candidates.includes(cardId)) return;
      const ids = pickedOf(get());
      // ฟง-นีด: เลือกได้จนกว่าค่ารวมจะเกินงบ
      const fits = (list: string[]) => (c.budget ? list.reduce((n, x) => n + (c.budget!.values[x] ?? 0), 0) <= c.budget.max : list.length <= c.count);
      const next = ids.includes(cardId) ? ids.filter((x) => x !== cardId) : fits([...ids, cardId]) ? [...ids, cardId] : ids;
      if (next === ids) return;
      sfx('click');
      set({ picked: { key: multiCardKey(c), ids: next } });
    },
    clearPicks() {
      set({ picked: null });
    },
    duel: null,
    evolveCard: null,
    hovered: null,
    pinned: null,
    trashView: null,
    trashFan: null,
    shownFan: null,
    truth: null,
    handDrag: null,
    handOrder: {},
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
    reorderHand(player, shown, cardId, index) {
      const rest = shown.filter((id) => id !== cardId);
      rest.splice(Math.max(0, Math.min(rest.length, index)), 0, cardId);
      setPrefs({ handSort: 'manual' });
      set({ handOrder: { ...get().handOrder, [player]: rest }, handDrag: null });
    },
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
      const fx: Fx[] = get().animations ? matchIntro(true, { name: 'ผู้เล่น 1', deck: d.p1, avatar: storedAvatar() }, { name: 'ผู้เล่น 2', deck: d.p2 }) : [];
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
      if (!on) {
        if (tutorialHooks && !tutorialHooks.guard(action)) {
          sfx('error');
          return false;
        }
        const ok = get().applyLocal(action);
        if (ok) tutorialHooks?.after(action);
        return ok;
      }
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
      if (!CHAIN_CONTINUES.has(action.type)) chainFloor = base.log.length;
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
      // เลือกหลายใบทีเดียว: คลิก = เลือก/ยกเลิก
      if (isMultiCardCandidate(state, cardId)) return get().togglePick(cardId);
      if (state.choice) return;
      const owner = state.cards[cardId]!.owner;
      if (!mine(owner)) return;
      const canPlay = inMain(state)
        ? owner === state.turnPlayer
        : flashPlayer(state) === owner && (handMagicTimings(state, cardId).includes('flash') || canQuickSummon(state, cardId));
      // เล่นตอนนี้ไม่ได้ก็ยังเปิดเมนูได้ (ปุ่มย้ายตำแหน่งการ์ดในมือ สำหรับจอสัมผัสที่ลากไม่ได้)
      set({ selectedHandCard: selectedHandCard === cardId ? null : cardId, selectedCores: canPlay ? [] : get().selectedCores });
    },

    openPlay: (cardId, kind, timing, braveOnto) => {
      sfx('click');
      set({ play: { cardId, kind, timing, ...(braveOnto ? { braveOnto } : {}) }, selectedHandCard: null });
    },
    closePlay: () => set({ play: null, playCores: null }),
    setPlayCores: (v) => set({ playCores: v }),
    cyclePlayCore(coreId) {
      const pc = get().playCores;
      if (!pc || !pc.pool.includes(coreId)) return;
      const marks = { ...pc.marks };
      const cur = marks[coreId];
      if (!cur) marks[coreId] = 'pay';
      else if (cur === 'pay' && pc.allowPlace) marks[coreId] = 'place';
      else delete marks[coreId];
      sfx('core');
      set({ playCores: { ...pc, marks, manual: true } });
    },
    confirmAttack(ok) {
      const id = get().attackConfirm;
      set({ attackConfirm: null });
      if (!ok || !id) return;
      const { state, dispatch } = get();
      const card = state.cards[id];
      if (card && state.phase === 'attack' && !state.battle && card.owner === state.turnPlayer && card.state === 'refresh') {
        dispatch({ type: 'declareAttack', player: card.owner, attackerId: id });
      }
    },
    confirmBlock(ok) {
      const id = get().blockConfirm;
      set({ blockConfirm: null });
      if (!ok || !id) return;
      const { state, dispatch } = get();
      const card = state.cards[id];
      if (card && state.battle?.step === 'declareBlock' && card.owner !== state.turnPlayer && blockCandidates(state).includes(id)) {
        dispatch({ type: 'declareBlock', player: card.owner, blockerId: id });
      }
    },
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

    multiToggle(cardId) {
      const { state } = get();
      const c = state.choice;
      if (c?.kind !== 'multiSummon' || !c.candidates.includes(cardId)) return;
      const m = get().multi ?? EMPTY_MULTI;
      if (m.phase !== 'pick') return;
      if (m.picks.includes(cardId)) {
        set({ multi: { ...m, picks: m.picks.filter((id) => id !== cardId) } });
        return;
      }
      if (c.max !== null && m.picks.length >= c.max) return;
      sfx('click');
      set({ multi: { ...m, picks: [...m.picks, cardId] } });
    },
    multiNext() {
      const { state, selectedCores, choose } = get();
      const c = state.choice;
      if (c?.kind !== 'multiSummon') return;
      const m = get().multi ?? EMPTY_MULTI;
      // เตรียมใบที่ i: Core ที่วางไว้เดิม หรือเลือกอัตโนมัติตามจำนวนขั้นต่ำ
      const enter = (mm: MultiPlan, i: number) => {
        const id = mm.picks[i]!;
        const prev = mm.plans[id];
        const used = Object.entries(mm.plans).flatMap(([k, p]) => (k !== id && 'cores' in p ? p.cores : []));
        const at = { ...mm, phase: 'place' as const, index: i };
        const cores = multiNeedsHost(state, at)
          ? []
          : prev && 'cores' in prev
            ? prev.cores
            : autoCores(state, c.player, summonMinCores(state, db, id), used);
        set({ multi: at, selectedCores: cores });
      };
      if (m.phase === 'pick') {
        if (m.picks.length === 0) return;
        enter(m, 0);
        return;
      }
      const cur = m.picks[m.index]!;
      const plans = { ...m.plans };
      if (!multiNeedsHost(state, m)) plans[cur] = { cores: [...selectedCores] };
      const next = { ...m, plans };
      if (m.index + 1 < m.picks.length) {
        enter(next, m.index + 1);
        return;
      }
      const summons = m.picks.map((id) => {
        const p = plans[id]!;
        return 'host' in p ? { cardId: id, braveOnto: p.host } : { cardId: id, cores: p.cores };
      });
      choose({ summons });
    },
    multiBack() {
      const { state } = get();
      const m = get().multi;
      if (state.choice?.kind !== 'multiSummon' || !m || m.phase !== 'place') return;
      if (m.index === 0) {
        set({ multi: { ...m, phase: 'pick' }, selectedCores: [] });
        return;
      }
      const prev = m.picks[m.index - 1]!;
      const p = m.plans[prev];
      set({ multi: { ...m, index: m.index - 1 }, selectedCores: p && 'cores' in p ? p.cores : [] });
    },
    multiAsSpirit() {
      const { state } = get();
      const m = get().multi;
      const cur = multiCurrent(state, m);
      if (!cur || !m) return;
      const used = multiAssigned(state, m);
      const plans = { ...m.plans };
      delete plans[cur];
      set({
        multi: { ...m, plans, asSpirit: [...m.asSpirit, cur] },
        selectedCores: autoCores(state, state.choice!.player, summonMinCores(state, db, cur), used),
      });
    },
    autoSelectCores(n) {
      const { state, multi } = get();
      const c = state.choice;
      if (!c) return;
      set({ selectedCores: autoCores(state, c.player, n, multiAssigned(state, multi)) });
    },

    toggleCore(coreId) {
      const { state, selectedCores, evolveCard } = get();
      if (!canSelectCore(state, evolveCard, coreId, get().multi)) return;
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
      // เลือกหลายใบทีเดียว: คลิก = เลือก/ยกเลิก
      if (isMultiCardCandidate(state, cardId)) return get().togglePick(cardId);
      // แบ่งคอร์ที่จะส่งออก: คลิก = +1 เม็ด
      if (isDistributeCandidate(state, cardId)) return get().allocAdd(cardId, 1);
      // อัญเชิญหลายใบ: Brave ที่กำลังจัด → คลิกสปิริตที่จะร่วมร่าง
      {
        const m = get().multi;
        const cur = multiCurrent(state, m);
        if (cur && multiNeedsHost(state, m) && multiHosts(state, m, cur).includes(cardId)) {
          set({ multi: { ...m!, plans: { ...m!.plans, [cur]: { host: cardId } } } });
          get().multiNext();
          return;
        }
      }
      if (evolveCard || state.choice || !mine(card.owner)) return;

      if (selectedCores.length > 0 && card.owner === state.turnPlayer) {
        moveCoresTo({ cardId });
        return;
      }
      if (state.choice || !isSpiritLike(def)) return;
      // ป้องกัน: ตามรายชื่อจาก engine (บางตัวป้องกันได้แม้เสื่อมสภาพ เช่น ชิงุเระ / ชิรานุอิ / ราดัน)
      if (state.battle?.step === 'declareBlock' && card.owner !== state.turnPlayer) {
        if (!blockCandidates(state).includes(cardId)) return;
        // ยืนยันก่อนป้องกัน (ตั้งค่าเดียวกับยืนยันโจมตี): กดปุ่มโล่เพื่อป้องกัน · คลิกการ์ดเดิมอีกครั้ง = พับปุ่ม
        if (prefs().confirmAttack) {
          sfx('click');
          set({ blockConfirm: get().blockConfirm === cardId ? null : cardId });
          return;
        }
        dispatch({ type: 'declareBlock', player: card.owner, blockerId: cardId });
        return;
      }
      if (card.state !== 'refresh') return;
      if (state.phase === 'attack' && !state.battle && card.owner === state.turnPlayer) {
        // ยืนยันก่อนโจมตี (ตั้งค่าได้): กดปุ่มโจมตีเพื่อยืนยัน · คลิกสปิริตเดิมอีกครั้ง = พับปุ่ม
        // ทำ On Stage ได้ (BS07): ต้องผ่านขั้นยืนยันเสมอ (ปุ่ม On Stage อยู่ข้างปุ่มโจมตี)
        const stage = onStageAbilities(state, db, card.owner, cardId).length > 0;
        if (prefs().confirmAttack || stage) {
          sfx('click');
          set({ attackConfirm: get().attackConfirm === cardId ? null : cardId });
          return;
        }
        set({ attackConfirm: null });
        dispatch({ type: 'declareAttack', player: card.owner, attackerId: cardId });
      } else if (state.battle?.step === 'declareBlock' && card.owner !== state.turnPlayer) {
        dispatch({ type: 'declareBlock', player: card.owner, blockerId: cardId });
      }
    },
  };
});

// state ที่อยู่ใน store ไม่ถูกแก้อีก (แก้ = clone ก่อนเสมอ) → ให้ rules จำผลคำนวณ เลเวล/สี/เจ็ม/คอสต์ ต่อ state ได้
// (listener นี้ลงทะเบียนก่อน component ทุกตัว: ทำงานก่อนหน้าจอจะอ่าน state ใหม่)
freezeForCache(useGame.getState().state);
useGame.subscribe((n, p) => {
  if (n.state !== p.state) freezeForCache(n.state);
  if (n.truth && n.truth !== p.truth) freezeForCache(n.truth);
});

// เครื่องมือทดสอบระหว่างพัฒนา (เฉพาะ dev server)
// dev / build ทดสอบความลื่น (VITE_PERF_HOOKS=1 ตั้งเฉพาะตอนวัดในเครื่อง ไม่มีใน build ที่ขึ้นเว็บ): ให้สคริปต์ทดสอบเข้าถึง store
if (import.meta.env.DEV || import.meta.env.VITE_PERF_HOOKS) Object.assign(globalThis, { __game: useGame, __db: db, __setPrefs: setPrefs });
