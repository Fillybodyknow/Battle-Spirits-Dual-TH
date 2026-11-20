import type { CardDatabase, CardDef, Step } from '@bs/cards';
import { assertUsableCore, checkDepletion, destroy, drawCard, emit, emitStatic, endGame, loseLife, newCore, payCost, pendBurst, setPhase, type Ctx } from './ctx';
import { destroyCard, enqueue, fireTriggers, refreshByEffect, newBatch, queueExhaustTriggers, queueLifeLostTriggers, queueMagicUsedTriggers, queueSummonTriggers, queueTriggers, resolveChoice, runQueue } from './effects';
import { nextRandom, shuffle } from './rng';
import {
  attackTaxFor,
  coreTaxed,
  symbolsZeroCard,
  magicBanned,
  magicBurstTax,
  ignoreSummonConditionSource,
  hasEvolutionNow,
  summonBanned,
  summonConditionOk,
  onStageAbilities,
  effectsNegated,
  RuleError,
  activatedSourceCard,
  handMagic,
  activeForcedAttack,
  quickAbility,
  lifeDamageCapped,
  staticSources,
  handCostDeltaSources,
  noReductionBlocked,
  levelBoostSources,
  fieldCost,
  braveFits,
  braveRoom,
  braveToSwap,
  blockersFor,
  blockForced,
  canAttackWith,
  magicUsedUp,
  baseCost,
  braveHostOf,
  cardLevel,
  conditionHolds,
  currentBp,
  extraSymbols,
  fail,
  fieldCard,
  isSpiritLike,
  locateCore,
  minCores,
  summonMinCores,
  payableCost,
  removeCore,
  removeFrom,
  symbolCount,
  forcedAttackers,
  forceAttackHolders,
  attackerUnblockable,
  canBlockExhausted,
  matchesFilter,
  quickAnyCores,
  trashSummonRule,
  activatableAbilities,
  activatableOptions,
} from './rules';
import {
  DEFAULT_CONFIG,
  PLAYERS,
  opponentOf,
  type Action,
  type ActionResult,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerState,
} from './types';

// ---------------------------------------------------------------- setup

export interface CreateGameOptions {
  db: CardDatabase;
  /** รายการ cardNo ทีละใบ (ใช้ expandDeck จาก @bs/cards ได้) */
  decks: Record<PlayerId, string[]>;
  seed: number;
  config?: Partial<GameConfig>;
  /** ถ้าไม่ระบุ สุ่มด้วย seed (แทนเป่ายิ้งฉุบ) */
  firstPlayer?: PlayerId;
  /** false = ใช้ลำดับเด็คตามที่ส่งมา (ใช้ในเทส); ค่าเริ่มต้น true */
  shuffleDecks?: boolean;
}

const emptyPlayer = (): PlayerState => ({
  deck: [],
  hand: [],
  field: [],
  trashCards: [],
  burst: null,
  life: [],
  reserve: [],
  trashCores: [],
  songs: [],
});

/** เตรียมเกมตามหมวด 5 แล้วเริ่มเทิร์นแรกจนถึง Main Step */
export function createGame(options: CreateGameOptions): { state: GameState; events: GameEvent[] } {
  const { db, decks, seed } = options;
  const config = { ...DEFAULT_CONFIG, ...options.config };

  const s: GameState = {
    config,
    rng: seed | 0,
    turn: 1,
    firstPlayer: 'p1',
    turnPlayer: 'p1',
    phase: 'start',
    battle: null,
    queue: [],
    choice: null,
    pendingBursts: [],
    resume: null,
    burstSetThisTurn: false,
    players: { p1: emptyPlayer(), p2: emptyPlayer() },
    cards: {},
    cores: {},
    nextCoreId: 1,
    winner: null,
    endReason: null,
    log: [],
  };
  const ctx: Ctx = { s, db, events: [] };

  for (const player of PLAYERS) {
    for (const cardNo of decks[player]) db.get(cardNo); // โยน error ถ้าไม่มีการ์ดนี้
    let shuffled = decks[player];
    if (options.shuffleDecks !== false) [shuffled, s.rng] = shuffle(decks[player], s.rng);
    // สร้าง id หลังสับ เพื่อไม่ให้ id เผยลำดับในเด็คลิสต์
    shuffled.forEach((cardNo, i) => {
      const id = `${player}-${i + 1}`;
      s.cards[id] = { id, cardNo, owner: player, state: 'refresh', cores: [], turnBp: 0, usedThisTurn: [], braves: [] };
      s.players[player].deck.push(id);
    });

    const p = s.players[player];
    for (let i = 0; i < config.initialLife; i++) p.life.push(newCore(ctx, player));
    for (let i = 0; i < config.initialReserve; i++) p.reserve.push(newCore(ctx, player));
    p.reserve.push(newCore(ctx, player, true));
    for (let i = 0; i < config.initialHand; i++) drawCard(ctx, player);
  }

  let first = options.firstPlayer;
  if (!first) {
    const [r, next] = nextRandom(s.rng);
    s.rng = next;
    first = r < 0.5 ? 'p1' : 'p2';
  }
  s.firstPlayer = first;
  s.turnPlayer = first;
  emit(ctx, { type: 'gameStarted', firstPlayer: first });
  beginTurn(ctx);
  return { state: s, events: ctx.events };
}

// ---------------------------------------------------------------- turn flow

/** Start → Core → Draw → Refresh → Main (ยังไม่มีเอฟเฟกต์ จึงเดินอัตโนมัติ) */
function beginTurn(ctx: Ctx): void {
  const { s } = ctx;
  const player = s.turnPlayer;
  const p = s.players[player];
  emit(ctx, { type: 'turnStarted', turn: s.turn, player });
  if (s.lifeDamagedThisTurn?.length) s.lifeDamagedThisTurn = [];

  setPhase(ctx, 'start');
  if (p.deck.length === 0) {
    endGame(ctx, opponentOf(player), 'deckOut');
    return;
  }
  // "สตาร์ทสเต็ปของเรา" (ประตูปราสาทแห่งแคว้นบุปผาเหลือง)
  {
    const batch = newBatch(ctx);
    for (const id of [...p.field]) queueTriggers(ctx, id, 'startStep', batch);
    // "สตาร์ทสเต็ปของคู่แข่ง" (BS08 Showdown)
    for (const id of [...s.players[opponentOf(player)].field]) queueTriggers(ctx, id, 'oppStartStep', batch);
  }
  if (s.queue.length > 0) {
    runQueue(ctx);
    if (s.winner) return;
    if (s.choice) {
      s.resume = 'afterStart';
      return;
    }
  }
  afterStart(ctx);
}

/** Core Step → Draw Step (ต่อจาก Start Step) */
function afterStart(ctx: Ctx): void {
  const { s } = ctx;
  const player = s.turnPlayer;
  const p = s.players[player];
  setPhase(ctx, 'core');
  if (!(s.turn === 1 && s.config.firstPlayerSkipsCoreStep)) {
    const coreId = newCore(ctx, player);
    p.reserve.push(coreId);
    emit(ctx, { type: 'coreGained', player, coreId });
  }

  setPhase(ctx, 'draw');
  // เอฟเฟกต์ "ดรอว์สเต็ปของเรา" ที่ทำก่อนจั่ว (ร็อคแฮนด์: ทิ้งการ์ดเพื่อจั่วเพิ่ม)
  for (const id of p.field) {
    const level = cardLevel(s, ctx.db, id);
    for (const ab of ctx.db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'drawStep' || !ab.before || !ab.levels.includes(level)) continue;
      enqueue(ctx, { controller: player, sourceId: id, source: ab.source, steps: [...ab.before], paidWithSoul: false, trashWhenDone: false });
    }
  }
  if (s.queue.length > 0) {
    runQueue(ctx);
    if (s.winner) return;
    if (s.choice) {
      s.resume = 'drawStepStart';
      return;
    }
  }
  startDraw(ctx);
}

/** Draw Step: รอกดจั่ว (หน้าเว็บ) หรือจั่วเลย */
function startDraw(ctx: Ctx): void {
  const { s } = ctx;
  const player = s.turnPlayer;
  if (s.config.manualDraw) {
    // รอผู้เล่นกดจั่ว (action 'drawStep')
    s.awaitingDraw = player;
    return;
  }
  continueDraw(ctx);
}

/** จั่วของ Draw Step แล้วเดินต่อไป Refresh → Main */
function continueDraw(ctx: Ctx): void {
  const { s } = ctx;
  drawStep(ctx);
  if (s.choice) {
    s.resume = 'afterDraw'; // เดินต่อเมื่อผู้เล่นเลือกเสร็จ (ดู applyAction)
    return;
  }
  afterDraw(ctx);
}

/** Draw Step: จั่ว 1 ใบ + เอฟเฟกต์ "ดรอว์สเต็ปของเรา" ของการ์ดบนสนาม แล้วทำ after (ถ้ามี) */
function drawStep(ctx: Ctx): void {
  const { s, db } = ctx;
  const player = s.turnPlayer;
  let count = 1 + (s.drawStepExtra ?? 0);
  delete s.drawStepExtra;
  const after: { sourceId: string; steps: Step[] }[] = [];
  const stacked = new Set<string>();
  for (const id of s.players[player].field) {
    const level = cardLevel(s, db, id);
    for (const ab of db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'drawStep' || !ab.levels.includes(level)) continue;
      // "เอฟเฟกต์นี้ไม่แสดงผลซ้ำซ้อน" (เลิฟวิสต้อม): ชื่อเดียวกันนับครั้งเดียว
      if (ab.noStack) {
        const key = `${db.get(s.cards[id]!.cardNo).name}:${ab.source}`;
        if (stacked.has(key)) continue;
        stacked.add(key);
      }
      emit(ctx, { type: 'abilityTriggered', cardId: id, source: ab.source });
      for (const extra of ab.extraDraw) if (conditionHolds(s, id, extra.if)) count += extra.amount;
      if (ab.after) after.push({ sourceId: id, steps: ab.after });
    }
  }
  for (let i = 0; i < count; i++) drawCard(ctx, player);
  for (const a of after) {
    enqueue(ctx, { controller: player, sourceId: a.sourceId, steps: [...a.steps], paidWithSoul: false, trashWhenDone: false });
  }
  runQueue(ctx);
}

/** Refresh Step → Main Step */
function afterDraw(ctx: Ctx): void {
  const { s } = ctx;
  const player = s.turnPlayer;
  // ไทดัล-บลู (Soul Drive): เทิร์นนี้ข้ามรีเฟรชสเต็ป / เมนสเต็ป
  const skip = (s.skipSteps ?? []).filter((x) => x.player === player && x.turn === s.turn).flatMap((x) => x.steps);
  if (skip.includes('refresh')) setPhase(ctx, 'refresh');
  else refreshStep(ctx);
  if (skip.includes('main')) {
    enterAttackStep(ctx, player);
    return;
  }
  setPhase(ctx, 'main');
  // "เมื่อเริ่มเมนสเต็ปของเรา" (BS08 No.15 นิวลากูน)
  const batch = newBatch(ctx);
  for (const id of [...s.players[player].field]) queueTriggers(ctx, id, 'ownMainStepStart', batch);
  runQueue(ctx);
}

/** Refresh Step ของผู้เล่นเทิร์น (ใช้ซ้ำกับ "เข้า [รีเฟรชสเต็ปของเรา] อีก 1 ครั้ง") */
function refreshStep(ctx: Ctx): void {
  const { s } = ctx;
  const player = s.turnPlayer;
  const p = s.players[player];
  setPhase(ctx, 'refresh');
  // ฟื้นสภาพไม่ได้: ถูกล็อกด้วยเอฟเฟกต์ (เคล็ดวิชาปลดปล่อยพสุธา) / เอฟเฟกต์ของคู่แข่งบนสนาม (โซอุม)
  const locks = s.refreshLocks ?? [];
  const opp = s.players[opponentOf(player)];
  /** การ์ดของคู่แข่งที่ทำให้การ์ดนี้ฟื้นสภาพไม่ได้ (โซอุม) */
  const noRefreshBy = (id: string) => {
    for (const src of opp.field) {
      const level = cardLevel(s, ctx.db, src);
      const a = ctx.db.get(s.cards[src]!.cardNo).abilities.find((a) => a.kind === 'opponentNoRefresh' && a.levels.includes(level) && matchesFilter(s, ctx.db, id, a.filter));
      if (a) return { cardId: src, source: a.source };
    }
    return null;
  };
  for (const id of p.field) {
    if (locks.includes(id)) continue;
    const by = noRefreshBy(id);
    // เสื่อมสภาพอยู่แล้วฟื้นไม่ได้เพราะโซอุม → เรืองแสงโซอุม
    if (by) {
      if (s.cards[id]!.state === 'exhausted') emitStatic(ctx, by);
      continue;
    }
    s.cards[id]!.state = 'refresh';
  }
  if (locks.length > 0) s.refreshLocks = locks.filter((id) => s.cards[id]!.owner !== player);
  p.reserve.push(...p.trashCores);
  p.trashCores = [];
  emit(ctx, { type: 'refreshed', player });
}

/** เข้าแอทแท็คสเต็ป: "เมื่อเริ่มแอทแท็คสเต็ปของเรา/คู่แข่ง" */
function enterAttackStep(ctx: Ctx, player: PlayerId): void {
  setPhase(ctx, 'attack');
  const batch = newBatch(ctx);
  for (const id of [...ctx.s.players[player].field]) queueTriggers(ctx, id, 'ownAttackStepStart', batch);
  for (const id of [...ctx.s.players[opponentOf(player)].field]) queueTriggers(ctx, id, 'oppAttackStepStart', batch);
  runQueue(ctx);
}

/**
 * จบแอทแท็คสเต็ปของเรา: "หลังจากจบสเต็ป เข้า [รีเฟรชสเต็ป]/[แอทแท็คสเต็ป] อีก 1 ครั้ง" (แจนนู-ดรานิเอส) แล้วไปเอนด์สเต็ป
 */
function afterAttackStep(ctx: Ctx): void {
  const { s, db } = ctx;
  const player = s.turnPlayer;
  for (const id of [...s.players[player].field]) {
    if (!s.players[player].field.includes(id) || effectsNegated(s, db, id)) continue;
    const lv = cardLevel(s, db, id);
    const def = db.get(s.cards[id]!.cardNo);
    for (const ab of def.abilities) {
      if (ab.kind !== 'extraSteps' || !ab.levels.includes(lv) || !conditionHolds(s, id, ab.if, false, false, db)) continue;
      const key = `${player}:${def.name}:${ab.source}`;
      const used = ab.once === 'turn' ? s.cards[id]!.usedThisTurn.includes(ab.source) : (s.usedOncePerGame ?? []).includes(key);
      if (used) continue;
      if (ab.once === 'turn') s.cards[id]!.usedThisTurn.push(ab.source);
      else s.usedOncePerGame = [...(s.usedOncePerGame ?? []), key];
      emit(ctx, { type: 'abilityTriggered', cardId: id, source: ab.source });
      for (const st of ab.steps) {
        emit(ctx, { type: 'extraStep', player, step: st, cardId: id });
        if (st === 'refresh') refreshStep(ctx);
      }
      if (ab.steps.includes('attack')) {
        enterAttackStep(ctx, player);
        return;
      }
    }
  }
  endTurn(ctx);
}

function endTurn(ctx: Ctx): void {
  const { s } = ctx;
  setPhase(ctx, 'end');
  // "เอนด์สเต็ปของเรา"
  const batch = newBatch(ctx);
  for (const id of [...s.players[s.turnPlayer].field, ...s.players[s.turnPlayer].trashCards]) queueTriggers(ctx, id, 'endStep', batch);
  for (const id of [...s.players[opponentOf(s.turnPlayer)].field]) queueTriggers(ctx, id, 'oppEndStep', batch);
  if (s.queue.length > 0) {
    runQueue(ctx);
    if (s.winner) return;
    if (s.choice) {
      s.resume = 'endTurn';
      return;
    }
  }
  finishTurn(ctx);
}

/** ส่งเทิร์นให้อีกฝ่าย */
function finishTurn(ctx: Ctx): void {
  const { s } = ctx;
  for (const card of Object.values(s.cards)) {
    card.turnBp = 0;
    card.usedThisTurn = [];
  }
  s.usedOncePerTurn = [];
  if (s.turnTriggers?.length) s.turnTriggers = [];
  s.turn += 1;
  s.turnPlayer = opponentOf(s.turnPlayer);
  s.burstSetThisTurn = false;
  beginTurn(ctx);
}

// ---------------------------------------------------------------- field helpers

function requireMain(ctx: Ctx, player: PlayerId): void {
  const { s } = ctx;
  if (s.turnPlayer !== player) fail('NOT_YOUR_TURN', 'ไม่ใช่เทิร์นของคุณ');
  if (s.phase !== 'main' || s.battle) fail('WRONG_PHASE', 'ทำได้เฉพาะ Main Step');
}

function cardInHand(ctx: Ctx, player: PlayerId, cardId: string): CardDef {
  if (!ctx.s.players[player].hand.includes(cardId)) fail('NOT_IN_HAND', `การ์ด ${cardId} ไม่ได้อยู่บนมือ`);
  return ctx.db.get(ctx.s.cards[cardId]!.cardNo);
}

// ---------------------------------------------------------------- actions

type Handler<T extends Action['type']> = (ctx: Ctx, action: Extract<Action, { type: T }>) => void;

const handlers: { [T in Action['type']]: Handler<T> } = {
  summon(ctx, { player, cardId, payment, placement, braveOnto, mill }) {
    const { s, db } = ctx;
    const flash = s.battle?.flash;
    if (!flash) requireMain(ctx, player);
    // อัญเชิญจากแทรช (ร็อคแฮนด์ / มุเมอิ): ต้องมีเอฟเฟกต์อนุญาตในจังหวะนี้
    const inTrash = s.players[player].trashCards.includes(cardId);
    const trashRule = inTrash ? trashSummonRule(s, db, player, cardId) : null;
    if (inTrash && !trashRule) fail('NOT_IN_HAND', 'อัญเชิญการ์ดนี้จากแทรชไม่ได้ในตอนนี้');
    if (inTrash && braveOnto) fail('WRONG_PHASE', 'การ์ดจากแทรชร่วมร่างทันทีไม่ได้');
    const def = inTrash ? db.get(s.cards[cardId]!.cardNo) : cardInHand(ctx, player, cardId);
    const quick = inTrash ? undefined : quickAbility(s, db, cardId);
    if (flash) {
      if (flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');
      if (!quick && !trashRule) fail('WRONG_PHASE', 'อัญเชิญใน Flash timing ได้เฉพาะการ์ดที่มี [Quick]');
      if (s.battle?.noFlash === player) fail('NO_FLASH', 'ในการต่อสู้นี้ใช้เอฟเฟกต์แฟลชไม่ได้');
      if (!inTrash && s.battle?.noHandFlash === player && !(s.shownCards ?? []).includes(cardId)) fail('NO_FLASH', 'ในการต่อสู้นี้ใช้การ์ดในมือในช่วง Flash ไม่ได้');
      // เบรฟที่มี [Quick] อัญเชิญมาร่วมร่างทันทีในแอทแท็คสเต็ปได้ (กติกา 04)
      if (braveOnto && !quick) fail('WRONG_PHASE', 'ร่วมร่าง Brave ได้เฉพาะ Main Step');
    }
    if (def.type !== 'spirit' && def.type !== 'brave' && def.type !== 'ultimate') fail('WRONG_CARD_TYPE', 'อัญเชิญได้เฉพาะ Spirit/Ultimate/Brave');
    // อัลติเมท: ตรวจเงื่อนไขอัญเชิญก่อน (กติกา 03 ข้อ 2.2)
    const soulPay = payment.some((id) => s.cores[id]?.isSoul);
    if (def.type === 'ultimate' && !summonConditionOk(s, db, cardId, { paidWithSoul: soulPay })) fail('SUMMON_CONDITION', `ยังไม่ครบเงื่อนไขอัญเชิญ: ${(def.summonCondition as { text?: string })?.text ?? ''}`);
    if (def.type === 'ultimate' && braveOnto) fail('WRONG_CARD_TYPE', 'อัลติเมทร่วมร่างไม่ได้');
    // เงื่อนไขไม่ครบแต่อัญเชิญได้เพราะจ่ายด้วยโซลคอร์: เรืองแสงการ์ดที่ให้ผล
    if (def.type === 'ultimate' && soulPay && !summonConditionOk(s, db, cardId, { paidWithSoul: false })) emitStatic(ctx, ignoreSummonConditionSource(s, db, cardId));
    // เฮียวจินดราก้อน: ในเทิร์นนี้อัญเชิญคอสต์ไม่เกิน N ไม่ได้
    if (summonBanned(s, db, player, def)) fail('SUMMON_BANNED', 'ในเทิร์นนี้อัญเชิญการ์ดนี้ไม่ได้ (เอฟเฟกต์ของคู่แข่ง)');

    const p = s.players[player];
    const card = s.cards[cardId]!;
    const paidWithSoul = payment.some((id) => s.cores[id]?.isSoul);
    if (trashRule?.soulPayment && !paidWithSoul) fail('SOUL_REQUIRED', 'ต้องใช้ Soul Core ร่วมจ่ายคอสต์เพื่ออัญเชิญจากแทรช');

    if (braveOnto) {
      // อัญเชิญเพื่อร่วมร่างทันที: จ่ายคอสต์ ไม่วาง Core บน Brave
      // "เมื่อเบรฟนี้ถูกอัญเชิญ" ทำงานเหมือนอัญเชิญเป็นสปิริต (กติกา 03 ข้อ 3, 04) โดยถือเป็นเลเวลต่ำสุดของการ์ด
      // (ตีความ: เบรฟที่ร่วมร่างไม่มี Core จึงใช้ [Lv1])
      if (def.type !== 'brave' || !def.braveCondition) fail('WRONG_CARD_TYPE', 'ร่วมร่างได้เฉพาะ Brave');
      const host = braveHost(ctx, player, def, braveOnto, cardId);
      // [Quick] ใน Flash timing: คอร์ที่จ่ายต้องมาจากรีเสิร์ฟ
      const { paid } = payCost(ctx, player, def, payment, placement, { noPlacement: true, reserveOnly: !!flash && !quickAnyCores(s, db, player) });
      removeFrom(p.hand, cardId);
      host.braves.push(cardId);
      card.state = host.state;
      card.cores = [];
      emit(ctx, { type: 'summoned', player, cardId, paid, ...(flash ? { quick: true } : {}) });
      emit(ctx, { type: 'braved', cardId, hostId: braveOnto });
      if (flash) {
        flash.consecutivePasses = 0;
        flash.priority = opponentOf(player);
      }
      checkDepletion(ctx);
      if (host.braves.includes(cardId) && p.field.includes(braveOnto)) {
        const lowest = Math.min(...def.levels.map((l) => l.level));
        queueSummonTriggers(ctx, cardId, newBatch(ctx), { paidWithSoul, from: 'hand', level: Number.isFinite(lowest) ? lowest : 1 });
        runQueue(ctx);
      }
      return;
    }

    let paid: number;
    let placed: string[];
    if (flash && quick?.soul) {
      // [Soul Quick]: จ่ายคอสต์ทั้งหมดด้วย Soul Core ในรีเสิร์ฟ 1 ดวง, วาง Core จากรีเสิร์ฟ
      const soul = payment[0];
      if (payment.length !== 1 || !soul || !s.cores[soul]?.isSoul || !p.reserve.includes(soul)) {
        fail('WRONG_PAYMENT', '[Soul Quick] ต้องจ่ายด้วย Soul Core ในรีเสิร์ฟ 1 ดวง');
      }
      if (new Set(placement).size !== placement.length || placement.includes(soul) || placement.some((id) => !p.reserve.includes(id))) {
        fail('RESERVE_ONLY', '[Soul Quick] วางได้เฉพาะ Core จากรีเสิร์ฟ');
      }
      const need = summonMinCores(s, db, cardId);
      if (placement.length < need) fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${need} ดวง`);
      removeCore(s, soul);
      p.trashCores.push(soul);
      for (const id of placement) removeCore(s, id);
      paid = 1;
      placed = placement;
    } else {
      // BS10 สิงโตควันม่วง: ทิ้งใบบนสุดเด็คเราไม่เกิน N ใบ ใบละคอสต์ -1
      let milled = 0;
      if (mill && mill > 0) {
        const ab = def.abilities.find((a) => a.kind === 'millCostReduce');
        if (ab?.kind !== 'millCostReduce') fail('NO_SUCH_EFFECT', 'การ์ดนี้ทิ้งเด็คเพื่อลดคอสต์ไม่ได้');
        const ids = p.deck.slice(0, Math.min(mill, ab.max));
        for (const id of ids) removeFrom(p.deck, id);
        p.trashCards.push(...ids);
        milled = ids.length;
        if (ids.length > 0) emit(ctx, { type: 'milled', player, cardIds: ids });
      }
      // ฮาคุโดวโทคาเงะ: สัญลักษณ์บนสนามลดคอสต์ได้แต่ถูกห้าม = จ่ายแพงขึ้นจริง → เรืองแสงก่อนการ์ดลงสนาม
      emitStatic(ctx, noReductionBlocked(s, db, player, def, baseCost(s, db, cardId)));
      ({ paid, placed } = payCost(ctx, player, def, payment, placement, {
        reserveOnly: !!flash && !trashRule && !quickAnyCores(s, db, player),
        baseCost: Math.max(0, baseCost(s, db, cardId) - milled),
        minPlacement: summonMinCores(s, db, cardId),
      }));
    }
    removeFrom(inTrash ? p.trashCards : p.hand, cardId);
    p.field.push(cardId);
    card.state = 'refresh';
    card.cores = [...placed];
    emit(ctx, { type: 'summoned', player, cardId, paid, ...(flash && !inTrash ? { quick: true } : {}), ...(inTrash ? { fromTrash: true as const } : {}) });
    if (flash) {
      flash.consecutivePasses = 0;
      flash.priority = opponentOf(player);
    }
    checkDepletion(ctx);
    if (p.field.includes(cardId)) {
      queueSummonTriggers(ctx, cardId, newBatch(ctx), { paidWithSoul, fromTrash: inTrash, from: inTrash ? 'trash' : 'hand' });
      runQueue(ctx);
    }
  },

  deployNexus(ctx, { player, cardId, payment, placement }) {
    requireMain(ctx, player);
    const def = cardInHand(ctx, player, cardId);
    if (def.type !== 'nexus') fail('WRONG_CARD_TYPE', 'วางได้เฉพาะ Nexus');

    const { paid, placed } = payCost(ctx, player, def, payment, placement);
    const p = ctx.s.players[player];
    const card = ctx.s.cards[cardId]!;
    removeFrom(p.hand, cardId);
    p.field.push(cardId);
    card.state = 'refresh';
    card.cores = [...placed];
    emit(ctx, { type: 'nexusDeployed', player, cardId, paid });
    checkDepletion(ctx);
    // "เมื่อเน็กซัสนี้ถูกวาง"
    queueTriggers(ctx, cardId, 'summon', newBatch(ctx));
    runQueue(ctx);
  },

  useMagic(ctx, { player, cardId, payment, timing }) {
    const { s } = ctx;
    const flash = s.battle?.flash;
    if (flash) {
      if (flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');
      if (s.battle?.noFlash === player) fail('NO_FLASH', 'ในการต่อสู้นี้ใช้เอฟเฟกต์แฟลชไม่ได้');
      if (s.battle?.noHandFlash === player && !(s.shownCards ?? []).includes(cardId)) fail('NO_FLASH', 'ในการต่อสู้นี้ใช้การ์ดในมือในช่วง Flash ไม่ได้');
    } else {
      requireMain(ctx, player);
    }
    const def = cardInHand(ctx, player, cardId);
    // BS09 วัดอรุณ: ในเทิร์นนี้ใช้งานการ์ดเมจิคไม่ได้
    if (magicBanned(s, player)) fail('MAGIC_BANNED', 'ในเทิร์นนี้ใช้งานการ์ดเมจิคไม่ได้ (เอฟเฟกต์ของคู่แข่ง)');
    // เมจิค / การ์ดสปิริตที่ "ถือว่าเป็นการ์ดเมจิคด้วย" / การ์ดที่ได้รับเอฟเฟกต์เมจิคจากการ์ดบนสนาม (คาฉะเนโกะ-อิคุสะ)
    const asMagic = handMagic(s, ctx.db, cardId);
    if (def.type !== 'magic' && asMagic.length === 0) fail('WRONG_CARD_TYPE', 'ใช้ได้เฉพาะ Magic');

    const has = (t: 'main' | 'flash') => (def.type === 'magic' ? magicTimings(def).includes(t) : asMagic.some((m) => m.timing === t));
    const use = timing ?? (flash || !has('main') ? 'flash' : 'main');
    if (flash && use !== 'flash') fail('WRONG_TIMING', 'ระหว่าง Flash timing ใช้ได้เฉพาะเอฟเฟกต์ [Flash]');
    // การ์ดที่ไม่มีข้อความเอฟเฟกต์เลย (ชุดตัวอย่าง) ใช้ใน Main Step ได้ตามเดิม
    if ((def.effects.length > 0 || def.type !== 'magic') && !has(use)) fail('NO_SUCH_EFFECT', `การ์ดนี้ไม่มีเอฟเฟกต์ [${use === 'main' ? 'Main' : 'Flash'}]`);
    if (flash && def.type === 'magic' && def.effects.length === 0) fail('NO_SUCH_EFFECT', 'การ์ดนี้ไม่มีเอฟเฟกต์ [Flash]');

    if (magicUsedUp(s, ctx.db, player, def.cardNo, use)) fail('ONCE_PER_TURN', 'เอฟเฟกต์นี้ใช้ได้เทิร์นละ 1 ครั้ง');
    const paidWithSoul = payment.some((id) => s.cores[id]?.isSoul);
    // ใช้เป็นเมจิค: จ่ายคอสต์อย่างเดียว ไม่วาง Core (การ์ดสปิริตที่ใช้เป็นเมจิคก็เช่นกัน)
    // คอสต์ในมือ (ทริคสเตอร์: แอทแท็คสเต็ปของเรา เมจิคในมือคอสต์ -1) ต้องใช้ตอนจ่ายจริงด้วย ไม่ใช่แค่ตอนแสดง
    const handCost = baseCost(s, ctx.db, cardId);
    emitStatic(ctx, handCost !== def.cost ? handCostDeltaSources(s, ctx.db, cardId) : []);
    // BS09 จินเบร์: แอทแท็คสเต็ปของคู่แข่ง ต้องจ่ายคอสต์เพิ่ม
    const tax = magicBurstTax(s, ctx.db, player);
    emitStatic(ctx, tax.sources);
    const { paid } = payCost(ctx, player, def, payment, [], { noPlacement: true, baseCost: handCost, extra: tax.amount });
    const once = def.abilities.find((a) => a.kind === 'magic' && a.timing === use && a.oncePerTurn);
    if (once) s.usedOncePerTurn = [...(s.usedOncePerTurn ?? []), `${player}:${def.cardNo}:${once.source}`];
    // ใช้จากการ์ดที่วางแสดงนอกมือ (ไม่ใช่ "จากในมือ")
    const fromShown = (s.shownCards ?? []).includes(cardId);
    removeFrom(s.players[player].hand, cardId);
    emit(ctx, { type: 'magicUsed', player, cardId, paid, timing: use });
    checkDepletion(ctx);

    if (flash) {
      flash.consecutivePasses = 0;
      flash.priority = opponentOf(player);
    }
    const effects = asMagic.filter((m) => m.timing === use);
    const source = effects.find((m) => m.source >= 0)?.source;
    // กติกา 03 ข้อ 5: เมจิคหนึ่งใบมีหลายความสามารถ เลือกใช้ได้เพียงความสามารถเดียว
    // (เช่น ยูคิเกิร์ลมี Flash ของตัวเอง + ได้รับ Flash จากคาฉะเนโกะ-อิคุสะ)
    const steps: Step[] =
      effects.length > 1
        ? [
            {
              do: 'chooseOne',
              options: effects.map((m) => ({
                label: m.label ?? `ใช้เอฟเฟกต์ [${use === 'main' ? 'Main' : 'Flash'}] ของ${def.name}`,
                steps: m.steps,
              })),
            },
          ]
        : effects.flatMap((m) => m.steps);
    enqueue(ctx, {
      controller: player,
      sourceId: cardId,
      ...(def.type !== 'magic' && source !== undefined ? { source } : {}),
      ...(def.type !== 'magic' ? { asMagic: true } : {}),
      steps,
      paidWithSoul,
      trashWhenDone: true,
    });
    {
      const at = s.queue.length - 1;
      const batch = newBatch(ctx);
      for (const id of [...s.players[opponentOf(player)].field]) queueTriggers(ctx, id, 'oppMagicUse', batch, { subject: cardId });
      const added = s.queue.splice(at + 1);
      s.queue.splice(at, 0, ...added);
    }
    // BS10 เฟรกรันส์รีเวอร์: จดเมจิคที่ใช้งานในการต่อสู้นี้
    if (s.battle) s.battleMagic = [...(s.battleMagic ?? []), { cardId, player }];
    queueMagicUsedTriggers(ctx, player, cardId, !fromShown, paidWithSoul);
    runQueue(ctx);
  },

  moveCores(ctx, { player, moves }) {
    requireMain(ctx, player);
    const p = ctx.s.players[player];
    for (const { coreId, to } of moves) {
      assertUsableCore(ctx, player, coreId);
      if ('cardId' in to) fieldCard(ctx.s, player, to.cardId);
      removeCore(ctx.s, coreId);
      if ('cardId' in to) ctx.s.cards[to.cardId]!.cores.push(coreId);
      else p.reserve.push(coreId);
    }
    emit(ctx, { type: 'coresMoved', player, count: moves.length });
    checkDepletion(ctx);
  },

  setBurst(ctx, { player, cardId }) {
    requireMain(ctx, player);
    if (ctx.s.burstSetThisTurn) fail('BURST_ALREADY_SET', 'เซ็ท Burst ได้เทิร์นละครั้ง');
    const def = cardInHand(ctx, player, cardId);
    if (!def.burst) fail('NO_BURST_EFFECT', 'การ์ดที่ไม่มีเอฟเฟกต์ Burst เซ็ทไม่ได้');
    if ((ctx.s.shownCards ?? []).includes(cardId)) fail('SHOWN_CARD', 'การ์ดที่วางแสดงนอกมือเซ็ทเป็น Burst ไม่ได้ (กติกา 06 Q&A 5)');

    const p = ctx.s.players[player];
    const replaced = p.burst;
    if (replaced) p.trashCards.push(replaced);
    removeFrom(p.hand, cardId);
    p.burst = cardId;
    ctx.s.burstSetThisTurn = true;
    emit(ctx, { type: 'burstSet', player, replacedCardId: replaced });
  },

  discardBurst(ctx, { player }) {
    requireMain(ctx, player);
    const p = ctx.s.players[player];
    const cardId = p.burst;
    if (!cardId) fail('NO_BURST', 'ไม่มี Burst ที่เซ็ทอยู่');
    p.burst = null;
    p.trashCards.push(cardId);
    emit(ctx, { type: 'burstDiscarded', player, cardId });
  },

  endMain(ctx, { player }) {
    requireMain(ctx, player);
    if (ctx.s.turn === 1 && ctx.s.config.firstPlayerSkipsAttackStep) {
      setPhase(ctx, 'attack');
      endTurn(ctx);
      return;
    }
    enterAttackStep(ctx, player);
  },

  declareAttack(ctx, { player, attackerId }) {
    const { s } = ctx;
    if (s.turnPlayer !== player) fail('NOT_YOUR_TURN', 'ไม่ใช่เทิร์นของคุณ');
    if (s.phase !== 'attack' || s.battle) fail('WRONG_PHASE', 'ประกาศโจมตีได้เฉพาะ Attack Step');
    const card = fieldCard(s, player, attackerId);
    if (!isSpiritLike(ctx.db.get(card.cardNo))) fail('CANNOT_ATTACK', 'การ์ดนี้โจมตีไม่ได้');
    if (card.state !== 'refresh') fail('EXHAUSTED', 'การ์ดเสื่อมสภาพอยู่');
    if (!canAttackWith(s, ctx.db, attackerId)) fail('CANNOT_ATTACK', 'การ์ดนี้โจมตีไม่ได้ในเทิร์นนี้');
    // อิจิโกะฮิโทฟุริ: ตัวที่ถูกระบุต้องโจมตีเป็นใบแรกของสเต็ป
    const fa = activeForcedAttack(s, ctx.db, player);
    if (fa && fa.attackerId !== attackerId) fail('MUST_ATTACK', `ต้องโจมตีด้วย ${ctx.db.get(s.cards[fa.attackerId]!.cardNo).name} ก่อน`);
    s.forcedAttack = undefined;
    if (s.firstAttack?.turn !== s.turn) s.firstAttack = { turn: s.turn, cardId: attackerId };

    // BS09 สุสานของจักรพรรดิมาร: ต้องส่งคอร์ N เม็ดบนตัวที่สั่งโจมตีลงแทรชก่อนโจมตี · สูญสลาย = ไม่ได้โจมตี
    const tax = attackTaxFor(s, ctx.db, player);
    if (tax > 0) {
      emitStatic(ctx, staticSources(s, ctx.db, [opponentOf(player)], 'attackTax'));
      const normals = card.cores.filter((c) => !s.cores[c]!.isSoul);
      const hasSoul = card.cores.some((c) => s.cores[c]!.isSoul);
      // มีโซลคอร์และเลือกได้ (ส่งไม่หมด และคอร์ปกติพอ): ผู้เล่นเลือกว่าจะส่งโซลคอร์ด้วยหรือไม่ แล้วโจมตีต่อ (resume)
      if (hasSoul && tax < card.cores.length && normals.length >= tax) {
        enqueue(ctx, { controller: player, sourceId: attackerId, steps: [{ do: 'coresOff', cardId: attackerId, n: tax, to: 'trash', byOpponent: false }], paidWithSoul: false, trashWhenDone: false, announce: false });
        s.pendingAttack = { attackerId, ...(fa ? { fa } : {}) };
        s.resume = 'declareAttack';
        runQueue(ctx);
        return;
      }
      const pay = [...card.cores].sort((x, y) => Number(s.cores[x]!.isSoul) - Number(s.cores[y]!.isSoul)).slice(0, tax);
      card.cores = card.cores.filter((c) => !pay.includes(c));
      s.players[player].trashCores.push(...pay);
      emit(ctx, { type: 'coresRemoved', cardId: attackerId, count: pay.length, to: 'trash' });
      checkDepletion(ctx);
      if (!s.players[player].field.includes(attackerId)) {
        runQueue(ctx);
        return;
      }
    }
    if (coreTaxed(s, player) && !payCoreTax(ctx, attackerId)) {
      runQueue(ctx);
      return;
    }
    beginAttack(ctx, player, attackerId, fa);
  },

  passFlash(ctx, { player }) {
    const battle = ctx.s.battle;
    if (!battle?.flash) fail('NO_FLASH_WINDOW', 'ไม่อยู่ในช่วง Flash');
    if (battle.flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');

    emit(ctx, { type: 'flashPassed', player });
    battle.flash.consecutivePasses += 1;
    battle.flash.priority = opponentOf(player);
    if (battle.flash.consecutivePasses < 2) return;

    battle.flash = null;
    // ผู้โจมตีออกจากสนามไประหว่าง Flash1: จบ Flash1 แล้วจบการต่อสู้ทันที ไม่มีการป้องกัน (กติกา 02 Q&A 3)
    if (battle.step === 'flashBeforeBlock' && !inBattle(ctx.s, battle.attackerId)) {
      endBattle(ctx);
      return;
    }
    if (battle.step === 'flashBeforeBlock') {
      battle.step = 'declareBlock';
      applyChosenBlockers(ctx);
    } else {
      resolveBattle(ctx);
    }
  },

  declareBlock(ctx, { player, blockerId }) {
    const battle = requireBlockStep(ctx, player);
    const card = fieldCard(ctx.s, player, blockerId);
    if (!isSpiritLike(ctx.db.get(card.cardNo))) fail('CANNOT_BLOCK', 'การ์ดนี้ป้องกันไม่ได้');
    if (card.state !== 'refresh' && !canBlockExhausted(ctx.s, ctx.db, blockerId)) fail('EXHAUSTED', 'การ์ดเสื่อมสภาพอยู่');
    if (attackerUnblockable(ctx.s, battle.attackerId, ctx.db.get(card.cardNo).type)) fail('CANNOT_BLOCK', 'การโจมตีนี้ป้องกันไม่ได้');
    if (battle.blockFilter && !matchesFilter(ctx.s, ctx.db, blockerId, battle.blockFilter)) fail('CANNOT_BLOCK', 'การต่อสู้นี้ป้องกันด้วยการ์ดนี้ไม่ได้');
    if (!canBlockWith(ctx, player).includes(blockerId)) {
      fail('CANNOT_BLOCK', battle.consecutiveBlade ? 'ต้องป้องกันด้วยสปิริตที่ไม่มีชีลด์ให้ครบก่อน ([Consecutive Blade])' : 'ป้องกันด้วยการ์ดนี้ไม่ได้');
    }

    if (coreTaxed(ctx.s, player) && !payCoreTax(ctx, blockerId)) {
      runQueue(ctx);
      return;
    }
    payBlockTax(ctx, player, battle.attackerId);
    card.state = battle.exhaustedBlock ? 'refresh' : 'exhausted';
    battle.blockers.push(blockerId);
    emit(ctx, { type: 'blockDeclared', blockerId });
    if (battle.exhaustedBlock) refreshByEffect(ctx, blockerId);
    const batch = newBatch(ctx);
    if (battle.levelBlock) {
      // แคนดี้-ซาร์ด: Lv รวมถึงแล้ว = ป้องกันครบ ผู้โจมตีเลือกสู้ 1 ตัว (ยังไม่ถึง = ต้องประกาศตัวถัดไป)
      if (blockLevelTotal(ctx) >= battle.levelBlock) {
        openFlashAfterBlock(battle, player);
        if (battle.blockers.length > 1) {
          enqueue(ctx, { controller: opponentOf(player), sourceId: battle.attackerId, steps: [{ do: 'chooseBattleBlocker' }], paidWithSoul: false, trashWhenDone: false, announce: false });
        }
      }
    } else if (!(battle.blockers.length < battle.maxBlockers && canBlockWith(ctx, player).length > 0)) {
      // [Consecutive Blade]: ประกาศตัวถัดไปได้ (บังคับถ้าทำได้)
      openFlashAfterBlock(battle, player);
    }
    queueTriggers(ctx, blockerId, 'block', batch);
    for (const id of [...ctx.s.players[player].field]) if (id !== blockerId) queueTriggers(ctx, id, 'allyBlock', batch, { subject: blockerId });
    queueTriggers(ctx, blockerId, 'allyBlock', batch, { subject: blockerId });
    queueBlockedTriggers(ctx, battle.attackerId, blockerId, batch);
    lifeOnBlocked(ctx);
    queueExhaustTriggers(ctx, blockerId);
    runQueue(ctx);
  },

  /** ไม่บล็อก หรือ (เมื่อบล็อกได้หลายตัว) ไม่บล็อกเพิ่ม */
  noBlock(ctx, { player }) {
    const battle = requireBlockStep(ctx, player);
    if (blockForced(ctx.s, ctx.db)) {
      fail('MUST_BLOCK', battle.consecutiveBlade ? 'ต้องป้องกัน 2 ตัวถ้าทำได้ ([Consecutive Blade])' : 'ต้องป้องกันถ้าทำได้ ([True-Rage])');
    }
    if (battle.levelBlock && battle.blockers.length > 0 && blockLevelTotal(ctx) < battle.levelBlock) {
      fail('MUST_BLOCK', `ต้องป้องกันเพิ่มให้ Lv รวมถึง ${battle.levelBlock}`);
    }
    if (battle.blockers.length > 0) {
      openFlashAfterBlock(battle, player);
      return;
    }
    emit(ctx, { type: 'noBlock' });
    // "เมื่อสปิริตนี้ไม่ถูกป้องกัน" (ทไวไลท์-แฟนตาเซีย) ทำงานก่อนตัดสินการต่อสู้
    queueTriggers(ctx, battle.attackerId, 'unblocked', newBatch(ctx));
    if (ctx.s.queue.length > 0) {
      runQueue(ctx);
      if (ctx.s.winner || !ctx.s.battle) return;
      if (ctx.s.choice) {
        ctx.s.resume = 'resolveBattle';
        return;
      }
    }
    resolveBattle(ctx);
  },

  endAttackStep(ctx, { player }) {
    const { s } = ctx;
    if (s.turnPlayer !== player) fail('NOT_YOUR_TURN', 'ไม่ใช่เทิร์นของคุณ');
    if (s.phase !== 'attack' || s.battle) fail('WRONG_PHASE', 'จบ Attack Step ได้เมื่อไม่มีการต่อสู้ค้างอยู่');
    const forced = forcedAttackers(s, ctx.db, player);
    if (forced.length > 0) {
      const holder = activeForcedAttack(s, ctx.db, player)?.holderId ?? forceAttackHolders(s, ctx.db, player)[0]!.id;
      fail('MUST_ATTACK', `ต้องโจมตีก่อนจบ Attack Step (เอฟเฟกต์ของ ${ctx.db.get(s.cards[holder]!.cardNo).name}): ${forced.map((id) => ctx.db.get(s.cards[id]!.cardNo).name).join(', ')}`);
    }
    afterAttackStep(ctx);
  },

  onStage(ctx, { player, cardId, source }) {
    const { s, db } = ctx;
    if (s.turnPlayer !== player) fail('NOT_YOUR_TURN', 'ไม่ใช่เทิร์นของคุณ');
    if (s.phase !== 'attack' || s.battle) fail('WRONG_PHASE', 'On Stage ได้เฉพาะแอทแท็คสเต็ปของเรา ตอนที่ไม่มีการต่อสู้ค้างอยู่');
    fieldCard(s, player, cardId);
    const fa = activeForcedAttack(s, db, player);
    if (fa) fail('MUST_ATTACK', `ต้องโจมตีด้วย ${db.get(s.cards[fa.attackerId]!.cardNo).name} ก่อน`);
    const ab = onStageAbilities(s, db, player, cardId).find((a) => a.source === source);
    if (!ab) fail('CANNOT_ON_STAGE', 'ใช้ความสามารถนี้ไม่ได้ตอนนี้ (สปิริตต้องสั่งโจมตีได้ และทำได้ครบตามเงื่อนไข)');
    const card = s.cards[cardId]!;
    const level = cardLevel(s, db, cardId);
    const soul = card.cores.some((id) => s.cores[id]!.isSoul);
    emit(ctx, { type: 'activated', player, cardId, source });
    const done: Step[] = ab.keyword ? [{ do: 'onStageDone', cardId, level, soul }] : [];
    enqueue(ctx, {
      controller: player,
      sourceId: cardId,
      source,
      steps: [{ do: 'onStageLeave', cardId, keyword: !!ab.keyword }, ...ab.steps, ...done],
      paidWithSoul: false,
      trashWhenDone: false,
      onStage: !!ab.keyword,
      soulSnapshot: soul,
    });
    runQueue(ctx);
  },

  activate(ctx, { player, cardId, source, from }) {
    const { s, db } = ctx;
    const flash = s.battle?.flash;
    if (!flash) fail('WRONG_PHASE', 'ใช้เอฟเฟกต์ Flash ได้เฉพาะใน Flash timing');
    if (flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');
    if (s.battle?.noFlash === player) fail('NO_FLASH', 'ในการต่อสู้นี้ใช้เอฟเฟกต์แฟลชไม่ได้');
    fieldCard(s, player, cardId);
    // from = การ์ดเจ้าของเอฟเฟกต์ (ผู้ร่วมร่างกับ Brave อาจมีเอฟเฟกต์บรรทัดเดียวกัน)
    const opt = activatableOptions(s, db, player, cardId).find((o) => o.ability.source === source && (from === undefined || o.from === from));
    if (!opt) fail('CANNOT_ACTIVATE', 'ใช้เอฟเฟกต์นี้ไม่ได้ตอนนี้');
    const ab = opt.ability;
    // นับ "เทิร์นละ N ครั้ง" ที่การ์ดเจ้าของเอฟเฟกต์
    s.cards[opt.from]!.usedThisTurn.push(source);
    emit(ctx, { type: 'activated', player, cardId, source, ...(opt.from !== cardId ? { from: opt.from } : {}) });
    flash.consecutivePasses = 0;
    flash.priority = opponentOf(player);
    enqueue(ctx, { controller: player, sourceId: ab.granted ? opt.from : cardId, steps: [...ab.steps], paidWithSoul: false, trashWhenDone: false, source });
    runQueue(ctx);
  },

  evolve(ctx, { player, cardId, cores }) {
    const { s, db } = ctx;
    const flash = s.battle?.flash;
    if (flash) {
      if (flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');
    } else {
      requireMain(ctx, player);
    }
    const card = fieldCard(s, player, cardId);
    const level = cardLevel(s, db, cardId);
    void level;
    if (!hasEvolutionNow(s, db, cardId)) {
      fail('NO_EVOLUTION', 'สปิริตนี้ใช้ [Evolution] ไม่ได้ (ที่เลเวลนี้)');
    }
    if (cores.length === 0) fail('NO_CORES', 'ต้องเลือก Core อย่างน้อย 1 ดวง');
    if (new Set(cores).size !== cores.length) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
    for (const id of cores) {
      const loc = locateCore(s, id);
      const ok = loc?.area === 'card' && loc.player === player && loc.cardId !== cardId && isSpiritLike(db.get(s.cards[loc.cardId]!.cardNo));
      if (!ok) fail('CORE_NOT_USABLE', '[Evolution] ใช้ได้เฉพาะ Core บนสปิริตอื่นของเรา');
    }

    const soul = cores.some((id) => s.cores[id]!.isSoul);
    for (const id of cores) {
      removeCore(s, id);
      card.cores.push(id);
    }
    emit(ctx, { type: 'evolved', cardId, count: cores.length, soul });
    if (flash) {
      flash.consecutivePasses = 0;
      flash.priority = opponentOf(player);
    }

    const depleted = checkDepletion(ctx);
    if (soul) {
      // "เมื่อโซลคอร์ถูกวางบนสปิริตของเราโดย Evolution" (สุเมรากิ-ดราก้อน) เกิดพร้อมกับของตัวเอง
      const batch = newBatch(ctx);
      queueTriggers(ctx, cardId, 'soulEvolvedOnto', batch);
      for (const id of [...s.players[player].field]) queueTriggers(ctx, id, 'allySoulEvolvedOnto', batch, { subject: cardId });
      runQueue(ctx);
    }
    if (depleted.length > 0) {
      const batch = newBatch(ctx);
      // การ์ดในมือก็ทำงาน (สุเมรากิ-ดราก้อน: อัญเชิญไม่จ่ายคอสต์)
      for (const id of [...s.players[player].field, ...s.players[player].hand]) queueTriggers(ctx, id, 'allyDepletedByEvolution', batch);
      runQueue(ctx);
    }
  },

  brave(ctx, { player, braveId, hostId, placement = [] }) {
    requireMain(ctx, player);
    const { s, db } = ctx;
    const brave = s.cards[braveId];
    if (!brave || brave.owner !== player) fail('NOT_ON_FIELD', 'ไม่ใช่ Brave ของคุณ');
    const def = db.get(brave.cardNo);
    if (def.type !== 'brave' || !def.braveCondition) fail('WRONG_CARD_TYPE', 'ใช้ได้เฉพาะ Brave');
    const p = s.players[player];
    const from = braveHostOf(s, braveId);
    if (!from && !p.field.includes(braveId)) fail('NOT_ON_FIELD', 'Brave ต้องอยู่บนสนาม');

    if (hostId === null) {
      // แยกร่าง: Brave อยู่บนสนามเดี่ยว ๆ สภาพเดียวกับผู้ร่วมร่าง
      if (!from) fail('NOT_BRAVED', 'Brave นี้ไม่ได้ร่วมร่างอยู่');
      if (new Set(placement).size !== placement.length) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
      for (const id of placement) assertUsableCore(ctx, player, id);
      const need = summonMinCores(s, db, braveId);
      if (placement.length < need) fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${need} ดวง`);
      const host = s.cards[from]!;
      removeFrom(host.braves, braveId);
      for (const id of placement) removeCore(s, id);
      brave.cores = [...placement];
      brave.state = host.state;
      p.field.push(braveId);
      emit(ctx, { type: 'braveSeparated', cardId: braveId, stays: true });
    } else {
      if (hostId === from) fail('INVALID_HOST', 'ร่วมร่างกับสปิริตนี้อยู่แล้ว');
      // สลับเบรฟบนสปิริตรวมร่างสองตัวได้เลย ไม่ต้องแยกร่างก่อน (กติกา 04 ข้อ 3)
      const target = from ? s.cards[hostId] : undefined;
      const swapOut = from && target && target.owner === player && p.field.includes(hostId) ? braveToSwap(s, db, hostId, braveId) : undefined;
      if (from && swapOut) {
        const host = braveHost(ctx, player, def, hostId, braveId, true);
        const otherId = swapOut;
        const other = s.cards[otherId]!;
        const fromHost = s.cards[from]!;
        if (!braveFits(db.get(other.cardNo), db.get(fromHost.cardNo))) fail('INVALID_HOST', `${db.get(other.cardNo).name} ร่วมร่างกับสปิริตนั้นไม่ได้`);
        // สภาพหลังสลับ: เบรฟติดสภาพของร่างเดิมมาด้วย ฝ่ายใดเสื่อมสภาพ = ร่างที่รวมแล้วเสื่อมสภาพ
        const anyExhausted = fromHost.state === 'exhausted' || host.state === 'exhausted' ? 'exhausted' : 'refresh';
        removeFrom(fromHost.braves, braveId);
        removeFrom(host.braves, otherId);
        host.braves.push(braveId);
        fromHost.braves.push(otherId);
        host.state = anyExhausted;
        fromHost.state = anyExhausted;
        brave.state = anyExhausted;
        other.state = anyExhausted;
        emit(ctx, { type: 'braved', cardId: braveId, hostId });
        emit(ctx, { type: 'braved', cardId: otherId, hostId: from });
        checkDepletion(ctx);
        return;
      }
      const host = braveHost(ctx, player, def, hostId, braveId);
      // สภาพที่ติดไปด้วย: Brave เดี่ยว = สภาพของ Brave, ย้ายจากผู้ร่วมร่างเดิม = สภาพของผู้ร่วมร่างเดิม
      const carried = from ? s.cards[from]!.state : brave.state;
      if (from) removeFrom(s.cards[from]!.braves, braveId);
      else {
        removeFrom(p.field, braveId);
        p.reserve.push(...brave.cores);
        brave.cores = [];
      }
      host.braves.push(braveId);
      // ฝ่ายใดฝ่ายหนึ่งเสื่อมสภาพ = ร่างที่รวมแล้วเสื่อมสภาพ (กติกา 04 สปิริตรวมร่าง ข้อ 1)
      // (เดิมใช้สภาพของเบรฟทับ ทำให้แปะเบรฟที่ฟื้นสภาพบนสปิริตที่โจมตีไปแล้ว = ฟื้นสภาพโจมตีซ้ำได้)
      const merged = host.state === 'exhausted' || carried === 'exhausted' ? 'exhausted' : 'refresh';
      host.state = merged;
      brave.state = merged;
      emit(ctx, { type: 'braved', cardId: braveId, hostId });
    }
    checkDepletion(ctx);
  },

  choose(ctx, { player, pick }) {
    resolveChoice(ctx, player, pick);
  },

  drawStep(ctx, { player }) {
    const { s } = ctx;
    if (s.awaitingDraw !== player || s.phase !== 'draw') fail('NOT_DRAW_STEP', 'ตอนนี้ไม่ใช่ Draw Step ของผู้เล่นนี้');
    delete s.awaitingDraw;
    continueDraw(ctx);
  },
  concede(ctx, { player }) {
    endGame(ctx, opponentOf(player), 'concede');
  },
};

/** ตรวจว่าสปิริตนี้เป็นผู้ร่วมร่างของ Brave ได้ (สปิริตของเรา, คอสต์ถึง, ยังไม่มี Brave ยกเว้นตอนสลับเบรฟ) */
function braveHost(ctx: Ctx, player: PlayerId, def: CardDef, hostId: string, braveId: string, swapping = false) {
  const host = fieldCard(ctx.s, player, hostId);
  const hostDef = ctx.db.get(host.cardNo);
  if (hostDef.type !== 'spirit') fail('INVALID_HOST', 'ร่วมร่างได้กับสปิริตเท่านั้น');
  if (!swapping && !braveRoom(ctx.s, ctx.db, hostId, braveId)) fail('INVALID_HOST', 'สปิริตนี้มี Brave ร่วมร่างอยู่แล้ว');
  const min = def.braveCondition?.minCost ?? 0;
  if (hostDef.cost < min) fail('INVALID_HOST', `ผู้ร่วมร่างต้องมีคอสต์ตั้งแต่ ${min} ขึ้นไป`);
  if (!braveFits(def, hostDef)) fail('INVALID_HOST', `ผู้ร่วมร่างต้องเป็นสปิริตเผ่า ${def.braveCondition?.family}`);
  return host;
}

/** จังหวะใช้ Magic ที่การ์ดมี ตามข้อความเอฟเฟกต์ */
function magicTimings(def: CardDef): ('main' | 'flash')[] {
  const out: ('main' | 'flash')[] = [];
  for (const e of def.effects as { timing?: string }[]) {
    if ((e.timing === 'main' || e.timing === 'flash') && !out.includes(e.timing)) out.push(e.timing);
  }
  return out;
}

/** Spirit/Ultimate ที่ฟื้นสภาพของผู้เล่น (ใช้ป้องกันได้) */
function canBlockWith(ctx: Ctx, player: PlayerId): string[] {
  return blockersFor(ctx.s, ctx.db, player);
}

/** ผู้ป้องกันที่ฝ่ายโจมตีเลือกไว้ (ฮากาเนะวูม) ประกาศบล็อกอัตโนมัติ ตัวที่ออกจากสนามไปแล้วไม่นับ */
function applyChosenBlockers(ctx: Ctx): void {
  const { s } = ctx;
  const battle = s.battle!;
  const defender = opponentOf(s.turnPlayer);
  const chosen = battle.chosenBlockers.filter((id) => inBattle(s, id));
  if (chosen.length === 0) return;
  payBlockTax(ctx, defender, battle.attackerId);
  for (const id of chosen) {
    const wasExhausted = s.cards[id]!.state === 'exhausted';
    s.cards[id]!.state = battle.exhaustedBlock ? 'refresh' : 'exhausted';
    battle.blockers.push(id);
    emit(ctx, { type: 'blockDeclared', blockerId: id });
    if (battle.exhaustedBlock && wasExhausted) refreshByEffect(ctx, id);
  }
  // [Consecutive Blade] แต่ฝ่ายโจมตีเลือกไม่ครบ: ฝ่ายป้องกันประกาศตัวที่เหลือเอง
  if (!(battle.blockers.length < battle.maxBlockers && canBlockWith(ctx, defender).length > 0)) openFlashAfterBlock(battle, defender);
  const batch = newBatch(ctx);
  for (const id of chosen) queueTriggers(ctx, id, 'block', batch);
  for (const id of chosen) queueBlockedTriggers(ctx, battle.attackerId, id, batch);
  lifeOnBlocked(ctx);
  runQueue(ctx);
}

/** เฟลมมังกรคลั่ง: ผู้โจมตีของเรา (มีโซลคอร์) ถูกป้องกัน → ส่งคอร์ไลฟ์ฝ่ายป้องกันลงรีเสิร์ฟ */
function lifeOnBlocked(ctx: Ctx): void {
  const { s } = ctx;
  const b = s.battle;
  const lb = b?.lifeOnBlocked;
  if (!b || !lb || lb.done || b.blockers.length === 0) return;
  const attacker = s.cards[b.attackerId]!;
  if (attacker.owner !== lb.player || !attacker.cores.some((c) => s.cores[c]!.isSoul)) return;
  lb.done = true;
  const defender = opponentOf(lb.player);
  if (!loseLife(ctx, defender, lb.amount, lb.player)) queueLifeLostTriggers(ctx, defender, lb.amount);
}

function openFlashAfterBlock(battle: NonNullable<GameState['battle']>, defender: PlayerId): void {
  battle.step = 'flashAfterBlock';
  battle.flash = { priority: defender, consecutivePasses: 0 };
}

function requireBlockStep(ctx: Ctx, player: PlayerId) {
  const battle = ctx.s.battle;
  if (!battle || battle.step !== 'declareBlock') fail('WRONG_PHASE', 'ไม่อยู่ในช่วงประกาศบล็อก');
  if (player === ctx.s.turnPlayer) fail('NOT_DEFENDER', 'ฝ่ายป้องกันเท่านั้นที่บล็อกได้');
  return battle;
}

/** BS10 ผ่าวิบัติไร้ผนึก: ส่งคอร์ปกติ 1 เม็ดบนตัวที่โจมตี/ป้องกันไปวอยด์ (โซลคอร์ไปวอยด์ไม่ได้) · คืน false ถ้าตัวนั้นสูญสลาย */
function payCoreTax(ctx: Ctx, cardId: string): boolean {
  const { s } = ctx;
  const card = s.cards[cardId]!;
  const core = card.cores.find((c) => !s.cores[c]!.isSoul);
  if (!core) return true;
  card.cores = card.cores.filter((c) => c !== core);
  delete s.cores[core];
  emit(ctx, { type: 'coresRemoved', cardId, count: 1, to: 'void' });
  checkDepletion(ctx);
  return s.players[card.owner].field.includes(cardId);
}

/** ประกาศโจมตีต่อหลังผ่านเงื่อนไข (และจ่ายคอร์ของสุสานของจักรพรรดิมารแล้ว): เสื่อมสภาพผู้โจมตี + เริ่มการต่อสู้ */
function beginAttack(ctx: Ctx, player: PlayerId, attackerId: string, fa: { attackerId: string; holderId: string } | null | undefined): void {
  const { s } = ctx;
  const card = s.cards[attackerId]!;
    card.state = 'exhausted';
    s.battle = {
      attackerId,
      blockers: [],
      maxBlockers: 1,
      consecutiveBlade: false,
      chosenBlockers: [],
      step: 'flashBeforeBlock',
      flash: { priority: opponentOf(player), consecutivePasses: 0 },
      mustBlock: false,
      endAttackStepAfter: false,
      endEffects: [],
      lifeOnBlockerDestroyed: 0,
      lifeOnBlockerDestroyedByBlade: 0,
    };
    // แคนดี้-ซาร์ด: ป้องกันได้ด้วยสปิริต/อัลติเมทตั้งแต่ 1 ตัวที่ Lv รวมตั้งแต่ N (ป้องกันหลายตัวได้)
    const lb = levelBlockFor(ctx, attackerId);
    if (lb) {
      s.battle.levelBlock = lb;
      s.battle.maxBlockers = 99;
    }
    s.battleMagic = [];
    // BS10 เฮียคุเตะ: ในเทิร์นนี้สปิริตที่ได้รับ "[เมื่อสปิริตนี้โจมตี] คู่แข่งสั่งใช้เบิร์สไม่ได้"
    if ((s.attackNoBurstGrants ?? []).some((g) => g.player === player && g.turn === s.turn && matchesFilter(s, ctx.db, attackerId, g.filter))) s.battle.noBurst = opponentOf(player);
    emit(ctx, { type: 'attackDeclared', attackerId });
    // อิจิโกะฮิโทฟุริ: ผู้ร่วมร่างที่ระบุไว้เข้าป้องกันเองถ้าป้องกันได้
    if (fa) {
      const hc = s.cards[fa.holderId]!;
      if ((hc.state === 'refresh' || canBlockExhausted(s, ctx.db, fa.holderId)) && !attackerUnblockable(s, attackerId, ctx.db.get(hc.cardNo).type)) {
        s.battle.chosenBlockers.push(fa.holderId);
        s.battle.skipFlash1 = true;
      }
    }
    // "ต้องโจมตีมาที่สปิริตนี้" (ราดัน): สปิริตนั้นเข้าป้องกันเองถ้าป้องกันได้
    for (const h of fa ? [] : forceAttackHolders(s, ctx.db, player)) {
      if (!matchesFilter(s, ctx.db, attackerId, h.filter)) continue;
      const hc = s.cards[h.id]!;
      const ok = (hc.state === 'refresh' || canBlockExhausted(s, ctx.db, h.id)) && !attackerUnblockable(s, attackerId, ctx.db.get(hc.cardNo).type);
      if (ok) {
        s.battle.chosenBlockers.push(h.id);
        s.battle.skipFlash1 = true;
        break;
      }
    }
    // เอฟเฟกต์ "เมื่อสปิริตนี้โจมตี" + "เมื่อสปิริตเรา...โจมตี" (เกิดพร้อมกัน) ประมวลผลก่อนเปิด Flash timing
    const batch = newBatch(ctx);
    queueTriggers(ctx, attackerId, 'attack', batch);
    for (const id of [...s.players[player].field]) queueTriggers(ctx, id, 'allyAttack', batch, { subject: attackerId });
    for (const id of [...s.players[opponentOf(player)].field]) queueTriggers(ctx, id, 'oppAttack', batch, { subject: attackerId });
    queueExhaustTriggers(ctx, attackerId);
    // Burst "หลังจากสปิริต/อัลติเมทคู่แข่งโจมตี" (เซ็นโงคุฮิเมะ คุอง)
    pendBurst(ctx, opponentOf(player), 'afterOpponentAttack');
    runQueue(ctx);
}

/** ผู้โจมตีถูกป้องกัน: "เมื่อสปิริตนี้ถูกป้องกัน" + "เมื่อสปิริตเราถูกป้องกัน" */
function queueBlockedTriggers(ctx: Ctx, attackerId: string, blockerId: string, batch: number): void {
  const attacker = ctx.s.cards[attackerId];
  if (!attacker || !inBattle(ctx.s, attackerId)) return;
  queueTriggers(ctx, attackerId, 'blocked', batch, { blockerId });
  for (const id of [...ctx.s.players[attacker.owner].field]) queueTriggers(ctx, id, 'allyBlocked', batch, { subject: attackerId, blockerId });
}

/** ต่อสู้ตัดสิน (หมวด 7 ข้อ 5-7) */
function resolveBattle(ctx: Ctx): void {
  const { s, db } = ctx;
  const battle = s.battle!;
  battle.resolved = true;
  const attacker = s.cards[battle.attackerId]!;
  const attackerDef = db.get(attacker.cardNo);
  const defender = opponentOf(attacker.owner);

  let lostLife = false;
  const blockers = battle.blockers.filter((id) => inBattle(s, id));
  if (blockers.length === 0) {
    // BS10 เพลิงจิ้งจอกอิมแพ็ค: สปิริตเผ่าที่ระบุของผู้ใช้ไม่ถูกป้องกัน → เจ็มกลายเป็นสีนั้น N เม็ด
    const siu = battle.symbolIfUnblocked;
    if (siu && siu.player === attacker.owner && attackerDef.family.includes(siu.family)) battle.symbolOverride = { cardId: attacker.id, color: siu.color as never, count: siu.count };
    const extra = Object.values(extraSymbols(s, db, attacker.id)).reduce<number>((n, v) => n + (v ?? 0), 0);
    const override = battle.symbolOverride?.cardId === attacker.id ? battle.symbolOverride.count : null;
    let dmg = override ?? symbolCount(attackerDef) + braveSymbols(ctx, attacker.id) + extra;
    // ทิพบอล: ในเทิร์นนี้การ์ดที่มีเจ็มตั้งแต่ N เม็ดถือว่ามีเจ็ม 0
    if (s.symbolsZero?.turn === s.turn && dmg >= s.symbolsZero.minSymbols) dmg = 0;
    if (symbolsZeroCard(s, attacker.id)) dmg = 0;
    // ลิมิเต็ดบาเรีย: ไลฟ์ไม่ได้รับความเสียหายจากการโจมตีของสปิริตคอสต์ตั้งแต่ N
    if ((s.lifeShields ?? []).some((l) => l.player === defender && l.turn === s.turn && fieldCost(s, db, attacker.id) >= l.minCost)) dmg = 0;
    // ลองเคพ: เสียหายได้ 1 เม็ดต่อสปิริต 1 ตัวต่อเทิร์น
    if (dmg > 0 && lifeDamageCapped(s, db, defender)) {
      const rec = s.lifeDamageBy?.turn === s.turn && s.lifeDamageBy.player === defender ? s.lifeDamageBy : { turn: s.turn, player: defender, ids: [] as string[] };
      const capped = rec.ids.includes(attacker.id) ? 0 : 1;
      if (capped < dmg) emitStatic(ctx, staticSources(s, db, [defender], 'lifeDamageCap'));
      dmg = capped;
      s.lifeDamageBy = { ...rec, ids: [...rec.ids, attacker.id] };
    }
    if (dmg > 0) {
      if (loseLife(ctx, defender, dmg, attacker.owner)) return;
      lostLife = true;
      queueLifeLostTriggers(ctx, defender, dmg);
    }
  } else {
    // เทียบ BP กับผู้ป้องกันทีละตัว โดยใช้ BP ก่อนมีใครถูกทำลาย (ต่อสู้พร้อมกัน)
    // BS10 เจเนอรัล เซโตะไดโช: ในการต่อสู้นี้เทียบ Lv แทน BP
    const power = (id: string) => (battle.compareLevel ? cardLevel(s, db, id) : currentBp(s, db, id));
    const bpA = power(attacker.id);
    const results = blockers.map((id) => ({ id, bp: power(id) }));
    const destroyedBlockers = results.filter((r) => r.bp <= bpA).map((r) => r.id);
    const attackerLoses = results.some((r) => bpA <= r.bp);
    for (const id of destroyedBlockers) destroyCard(ctx, id, attacker.owner, { bySource: attacker.id });
    if (s.winner) return;
    if (attackerLoses) destroyCard(ctx, attacker.id, defender, { bySource: results.find((r) => bpA <= r.bp)!.id });
    // BS09 "เมื่อสปิริตของเราชนะและทำลายสปิริตคู่แข่งจากการต่อสู้เทียบ BP"
    {
      const batch = newBatch(ctx);
      const winners: string[] = [];
      if (!attackerLoses && destroyedBlockers.length > 0) winners.push(attacker.id);
      for (const r of results) if (r.bp > bpA) winners.push(r.id);
      for (const w of winners) {
        if (!s.cards[w] || !s.players[s.cards[w]!.owner].field.includes(w)) continue;
        for (const id of [...s.players[s.cards[w]!.owner].field]) queueTriggers(ctx, id, 'allyWonBattle', batch, { subject: w });
      }
    }
    // "ชนะและทำลายสปิริตคู่แข่งจากการเทียบ BP → ฟื้นสภาพ" (คาราคุริโอโอคามิ)
    if (!attackerLoses && destroyedBlockers.length > 0 && battle.refreshOnWin?.includes(attacker.id) && inBattle(s, attacker.id)) {
      refreshByEffect(ctx, attacker.id, attacker.id);
    }

    const perBlocker = battle.lifeOnBlockerDestroyed + (battle.consecutiveBlade ? battle.lifeOnBlockerDestroyedByBlade : 0);
    if (destroyedBlockers.length > 0 && perBlocker > 0) {
      if (loseLife(ctx, defender, perBlocker * destroyedBlockers.length, attacker.owner)) return;
      lostLife = true;
      queueLifeLostTriggers(ctx, defender, perBlocker * destroyedBlockers.length);
    }
    // อุสึบะคาเงโร่: ชนะและทำลายจากการเทียบ BP → ส่งคอร์ไลฟ์คู่แข่งลงแทรช
    // [Consecutive Blade] ทำลายผู้ป้องกันได้ 2 ตัว ก็เกิดผลครั้งเดียว (กติกา 14 Consecutive Blade ข้อควรรู้ 2: เบรฟแบบเบโอวูฟ)
    const toTrash = !attackerLoses ? (battle.lifeOnBlockerDestroyedTrash ?? 0) : 0;
    if (destroyedBlockers.length > 0 && toTrash > 0) {
      if (loseLife(ctx, defender, toTrash, attacker.owner, 'trash')) return;
      lostLife = true;
      queueLifeLostTriggers(ctx, defender, toTrash);
    }
  }

  // เอฟเฟกต์ "เมื่อการโจมตีทำให้คู่แข่งเสียไลฟ์" (ผู้โจมตียังอยู่บนสนาม)
  if (lostLife && inBattle(s, attacker.id)) {
    if ((s.hitLifeTurn ?? []).some((t) => t.cardId === attacker.id && t.turn === s.turn)) {
      enqueue(ctx, { controller: attacker.owner, sourceId: attacker.id, steps: [{ do: 'opponentLifeToReserve', count: 1 }], paidWithSoul: false, trashWhenDone: false, announce: false });
    }
    const batch = newBatch(ctx);
    queueTriggers(ctx, attacker.id, 'attackHitLife', batch);
    for (const id of [...s.players[attacker.owner].field]) queueTriggers(ctx, id, 'allyAttackHitLife', batch, { subject: attacker.id });
  }
  // Burst (เช่น "หลังจากเราเสียไลฟ์") ทำงานก่อนการต่อสู้จบ (เอฟเฟกต์ [Flash] ของมันอ้างถึง "การต่อสู้นี้")
  runQueue(ctx);
  if (s.winner) return;
  if (s.choice) {
    s.resume = 'endBattle';
    return;
  }
  endBattle(ctx);
}

/** gem symbol ที่ผู้ร่วมร่างได้รับจาก Brave */
function braveSymbols(ctx: Ctx, cardId: string): number {
  return ctx.s.cards[cardId]!.braves.reduce((n, b) => n + symbolCount(ctx.db.get(ctx.s.cards[b]!.cardNo)), 0);
}

function endBattle(ctx: Ctx): void {
  const battle = ctx.s.battle!;
  // BS09 อุซชน: "เมื่อจบการต่อสู้ของสปิริต/อัลติเมทของเรา" (ตัวที่ต่อสู้และยังอยู่บนสนาม)
  let ended = false;
  if (!battle.endTriggersDone) {
    battle.endTriggersDone = true;
    const batch = newBatch(ctx);
    const before = ctx.s.queue.length;
    for (const id of [battle.attackerId, ...battle.blockers]) {
      const c = ctx.s.cards[id];
      if (!c || !inBattle(ctx.s, id)) continue;
      for (const f of [...ctx.s.players[c.owner].field]) queueTriggers(ctx, f, 'allyBattleEnd', batch, { subject: id });
    }
    ended = ctx.s.queue.length > before;
  }
  // เอฟเฟกต์ "เมื่อจบการต่อสู้นี้" (ไฮวินด์)
  if (battle.endEffects.length > 0 || ended) {
    ctx.s.queue.push(...battle.endEffects);
    battle.endEffects = [];
    runQueue(ctx);
    if (ctx.s.winner) return;
    if (ctx.s.choice) {
      ctx.s.resume = 'endBattle';
      return;
    }
  }
  ctx.s.battle = null;
  // BP+ / เจ็มที่มีผล "จนจบช่วงนั้น" ([เมื่อสปิริตนี้โจมตี/ป้องกัน] ที่ไม่บอกระยะเวลา) หมดลง
  for (const c of Object.values(ctx.s.cards)) {
    delete c.battleBp;
    delete c.battleSymbols;
  }
  emit(ctx, { type: 'battleEnded' });
  const cond = battle.endAttackStepIf;
  const endIf = !!cond && !!ctx.s.cards[cond.sourceId] && conditionHolds(ctx.s, cond.sourceId, cond.cond, false, false, ctx.db);
  if (battle.endAttackStepAfter || endIf) afterAttackStep(ctx);
}

/** แคนดี้-ซาร์ด: Lv รวมที่ฝ่ายป้องกันต้องใช้ป้องกันผู้โจมตีนี้ (null = ป้องกันตามปกติ) */
function levelBlockFor(ctx: Ctx, attackerId: string): number | null {
  const { s, db } = ctx;
  const owner = s.cards[attackerId]!.owner;
  let need: number | null = null;
  for (const id of s.players[owner].field) {
    if (effectsNegated(s, db, id)) continue;
    const lv = cardLevel(s, db, id);
    for (const ab of db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'blockLevelSum' || !ab.levels.includes(lv) || !conditionHolds(s, id, ab.if, false, false, db)) continue;
      if (!matchesFilter(s, db, attackerId, ab.attacker)) continue;
      emit(ctx, { type: 'staticApplied', player: owner, cardId: id, source: ab.source });
      need = Math.max(need ?? 0, ab.minLevel);
    }
  }
  return need;
}

/** Lv รวมของผู้ป้องกันที่ประกาศแล้ว */
function blockLevelTotal(ctx: Ctx): number {
  if (ctx.s.battle?.pairBlock) return ctx.s.battle.blockers.length;
  return (ctx.s.battle?.blockers ?? []).reduce((n, id) => n + cardLevel(ctx.s, ctx.db, id), 0);
}

/** ฮิเมะเนโกะ: การป้องกันครั้งแรกของการต่อสู้นี้ ฝ่ายป้องกันส่งคอร์รีเสิร์ฟลงแทรช (คอร์ปกติก่อน) */
function payBlockTax(ctx: Ctx, defender: PlayerId, attackerId: string): void {
  const tax = ctx.s.battle?.blockTax;
  if (!tax || tax.paid) return;
  // อาคิตะ-ด็อก: ทิ้งการ์ดบนมือ (ฝ่ายป้องกันเลือก) แทนการส่งคอร์
  if (tax.discard) {
    tax.paid = true;
    enqueue(ctx, { controller: defender, sourceId: attackerId, steps: [{ do: 'discard', count: tax.discard }], paidWithSoul: false, trashWhenDone: false, announce: false });
    return;
  }
  const p = ctx.s.players[defender];
  const pay = [...p.reserve].sort((a, b) => Number(ctx.s.cores[a]!.isSoul) - Number(ctx.s.cores[b]!.isSoul)).slice(0, tax.reserveToTrash);
  for (const id of pay) removeFrom(p.reserve, id);
  p.trashCores.push(...pay);
  tax.paid = true;
  emit(ctx, { type: 'coresPaidToBlock', player: defender, count: pay.length });
}

/** การ์ดนี้ยังอยู่ในการต่อสู้: อยู่บนสนาม และไม่เคยออกจากสนามระหว่างการต่อสู้นี้ */
function inBattle(s: GameState, id: string): boolean {
  return s.players[s.cards[id]!.owner].field.includes(id) && !(s.battle?.left ?? []).includes(id);
}

/** ผู้โจมตีหรือผู้ป้องกันออกจากสนามระหว่างการต่อสู้ (สูญสลาย/ถูกทำลายโดยเอฟเฟกต์) → การต่อสู้จบทันที */
function checkBattleParticipants(ctx: Ctx): void {
  const { s } = ctx;
  const battle = s.battle;
  if (!battle || s.choice || s.winner) return;
  const onField = (id: string) => inBattle(s, id);
  const blockersGone = battle.blockers.length > 0 && !battle.blockers.some(onField);
  // ผู้โจมตีหายก่อน/ระหว่าง Flash1: ยังมี Flash1 ต่อจนจบ แล้วค่อยจบการต่อสู้ (กติกา 02 Q&A 3 · ดู passFlash)
  if (!onField(battle.attackerId) && battle.step === 'flashBeforeBlock' && battle.flash) return;
  if (!onField(battle.attackerId) || blockersGone) endBattle(ctx);
}

/**
 * ฟังก์ชันหลักของ engine: ตรวจกติกาแล้วคืน state ใหม่ (ไม่แก้ state เดิม)
 * action ที่ผิดกติกาจะได้ { ok: false } และ state เดิมไม่เปลี่ยน
 */
export function applyAction(state: GameState, input: Action, db: CardDatabase): ActionResult {
  // คัดลอก action: engine ห้ามแก้ object ของผู้เรียก (array ใน action ถูกใช้เป็นข้อมูลใน state เช่น Core บนการ์ด)
  const action = structuredClone(input);
  if (state.winner) return { ok: false, error: { code: 'GAME_OVER', message: 'เกมจบแล้ว' } };
  const ctx: Ctx = { s: structuredClone(state), db, events: [], start: state };
  try {
    if (state.choice && action.type !== 'choose' && action.type !== 'concede') {
      fail('CHOICE_PENDING', 'ต้องเลือกให้เสร็จก่อน');
    }
    if (state.awaitingDraw && action.type !== 'drawStep' && action.type !== 'concede') {
      fail('DRAW_PENDING', 'ต้องจั่วการ์ดใน Draw Step ก่อน');
    }
    (handlers[action.type] as Handler<Action['type']>)(ctx, action);
    // งานค้าง (Brave ที่ผู้ร่วมร่างสูญสลายจากการย้าย Core, Burst ที่เงื่อนไขเกิด)
    if (!ctx.s.choice && !ctx.s.winner && (ctx.s.queue.length > 0 || ctx.s.pendingBursts.length > 0)) runQueue(ctx);
    checkBattleParticipants(ctx);
    // ตีระบุ / ราดัน: ไม่มีแฟลชหลังโจมตี ตัวที่ถูกเลือกป้องกันทันที (กติกา 14 ตีระบุ ข้อ 3-4)
    {
      const b = ctx.s.battle;
      if (b && b.skipFlash1 && b.step === 'flashBeforeBlock' && b.flash && !ctx.s.choice && !ctx.s.winner && ctx.s.queue.length === 0) {
        b.skipFlash1 = false;
        b.flash = null;
        b.step = 'declareBlock';
        applyChosenBlockers(ctx);
      }
    }
    if (ctx.s.resume && !ctx.s.choice && !ctx.s.winner) {
      const resume = ctx.s.resume;
      ctx.s.resume = null;
      if (resume === 'afterDraw') afterDraw(ctx);
      else if (resume === 'afterStart') afterStart(ctx);
      else if (resume === 'resolveBattle') {
        if (ctx.s.battle) resolveBattle(ctx);
      } else if (resume === 'endTurn') finishTurn(ctx);
      else if (resume === 'drawStepStart') startDraw(ctx);
      else if (resume === 'declareAttack') {
        // สุสานของจักรพรรดิมาร: จ่ายคอร์แล้ว ผู้โจมตียังอยู่ = โจมตีต่อ
        const pa = ctx.s.pendingAttack;
        ctx.s.pendingAttack = undefined;
        const owner = pa && ctx.s.cards[pa.attackerId]?.owner;
        if (pa && owner && ctx.s.players[owner].field.includes(pa.attackerId) && ctx.s.phase === 'attack' && !ctx.s.battle) beginAttack(ctx, owner, pa.attackerId, pa.fa);
      }
      else if (ctx.s.battle) endBattle(ctx);
    }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: { code: e.code, message: e.message } };
    throw e;
  }
  return { ok: true, state: ctx.s, events: ctx.events };
}
