import type { CardDatabase, CardDef, Step } from '@bs/cards';
import { assertUsableCore, checkDepletion, destroy, drawCard, emit, endGame, loseLife, newCore, payCost, setPhase, type Ctx } from './ctx';
import { destroyCard, enqueue, fireTriggers, newBatch, queueLifeLostTriggers, queueMagicUsedTriggers, queueSummonTriggers, queueTriggers, resolveChoice, runQueue } from './effects';
import { nextRandom, shuffle } from './rng';
import {
  RuleError,
  blockersFor,
  canAttackWith,
  magicUsedUp,
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
  payableCost,
  removeCore,
  removeFrom,
  symbolCount,
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

  setPhase(ctx, 'start');
  if (p.deck.length === 0) {
    endGame(ctx, opponentOf(player), 'deckOut');
    return;
  }

  setPhase(ctx, 'core');
  if (!(s.turn === 1 && s.config.firstPlayerSkipsCoreStep)) {
    const coreId = newCore(ctx, player);
    p.reserve.push(coreId);
    emit(ctx, { type: 'coreGained', player, coreId });
  }

  setPhase(ctx, 'draw');
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
  let count = 1;
  const after: { sourceId: string; steps: Step[] }[] = [];
  for (const id of s.players[player].field) {
    const level = cardLevel(s, db, id);
    for (const ab of db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'drawStep' || !ab.levels.includes(level)) continue;
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
  const p = s.players[player];
  setPhase(ctx, 'refresh');
  for (const id of p.field) s.cards[id]!.state = 'refresh';
  p.reserve.push(...p.trashCores);
  p.trashCores = [];
  emit(ctx, { type: 'refreshed', player });

  setPhase(ctx, 'main');
}

function endTurn(ctx: Ctx): void {
  const { s } = ctx;
  setPhase(ctx, 'end');
  for (const card of Object.values(s.cards)) {
    card.turnBp = 0;
    card.usedThisTurn = [];
  }
  s.usedOncePerTurn = [];
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
  summon(ctx, { player, cardId, payment, placement, braveOnto }) {
    const { s, db } = ctx;
    const flash = s.battle?.flash;
    if (!flash) requireMain(ctx, player);
    const def = cardInHand(ctx, player, cardId);
    const quick = def.abilities.find((a) => a.kind === 'quick');
    if (flash) {
      if (flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');
      if (!quick) fail('WRONG_PHASE', 'อัญเชิญใน Flash timing ได้เฉพาะการ์ดที่มี [Quick]');
      if (braveOnto) fail('WRONG_PHASE', 'ร่วมร่าง Brave ได้เฉพาะ Main Step');
    }
    if (def.type === 'ultimate') fail('NOT_SUPPORTED', 'Ultimate ยังไม่รองรับ (ขั้นที่ 3)');
    if (def.type !== 'spirit' && def.type !== 'brave') fail('WRONG_CARD_TYPE', 'อัญเชิญได้เฉพาะ Spirit/Brave');

    const p = s.players[player];
    const card = s.cards[cardId]!;
    const paidWithSoul = payment.some((id) => s.cores[id]?.isSoul);

    if (braveOnto) {
      // อัญเชิญเพื่อร่วมร่างทันที: จ่ายคอสต์ ไม่วาง Core บน Brave และ "เมื่อเบรฟนี้ถูกอัญเชิญ" ไม่ทำงาน
      if (def.type !== 'brave' || !def.braveCondition) fail('WRONG_CARD_TYPE', 'ร่วมร่างได้เฉพาะ Brave');
      const host = braveHost(ctx, player, def, braveOnto);
      const { paid } = payCost(ctx, player, def, payment, placement, { noPlacement: true });
      removeFrom(p.hand, cardId);
      host.braves.push(cardId);
      card.state = host.state;
      card.cores = [];
      emit(ctx, { type: 'summoned', player, cardId, paid });
      emit(ctx, { type: 'braved', cardId, hostId: braveOnto });
      checkDepletion(ctx);
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
      if (placement.length < minCores(def)) fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${minCores(def)} ดวง`);
      removeCore(s, soul);
      p.trashCores.push(soul);
      for (const id of placement) removeCore(s, id);
      paid = 1;
      placed = placement;
    } else {
      ({ paid, placed } = payCost(ctx, player, def, payment, placement, { reserveOnly: !!flash }));
    }
    removeFrom(p.hand, cardId);
    p.field.push(cardId);
    card.state = 'refresh';
    card.cores = [...placed];
    emit(ctx, { type: 'summoned', player, cardId, paid, ...(flash ? { quick: true } : {}) });
    if (flash) {
      flash.consecutivePasses = 0;
      flash.priority = opponentOf(player);
    }
    checkDepletion(ctx);
    if (p.field.includes(cardId)) {
      queueSummonTriggers(ctx, cardId, newBatch(ctx), { paidWithSoul });
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
  },

  useMagic(ctx, { player, cardId, payment, timing }) {
    const { s } = ctx;
    const flash = s.battle?.flash;
    if (flash) {
      if (flash.priority !== player) fail('NOT_YOUR_PRIORITY', 'ยังไม่ถึงตาคุณใน Flash timing');
    } else {
      requireMain(ctx, player);
    }
    const def = cardInHand(ctx, player, cardId);
    if (def.type !== 'magic') fail('WRONG_CARD_TYPE', 'ใช้ได้เฉพาะ Magic');

    const has = (t: 'main' | 'flash') => magicTimings(def).includes(t);
    const use = timing ?? (flash || !has('main') ? 'flash' : 'main');
    if (flash && use !== 'flash') fail('WRONG_TIMING', 'ระหว่าง Flash timing ใช้ได้เฉพาะเอฟเฟกต์ [Flash]');
    // การ์ดที่ไม่มีข้อความเอฟเฟกต์เลย (ชุดตัวอย่าง) ใช้ใน Main Step ได้ตามเดิม
    if (def.effects.length > 0 && !has(use)) fail('NO_SUCH_EFFECT', `การ์ดนี้ไม่มีเอฟเฟกต์ [${use === 'main' ? 'Main' : 'Flash'}]`);
    if (flash && def.effects.length === 0) fail('NO_SUCH_EFFECT', 'การ์ดนี้ไม่มีเอฟเฟกต์ [Flash]');

    if (magicUsedUp(s, ctx.db, player, def.cardNo, use)) fail('ONCE_PER_TURN', 'เอฟเฟกต์นี้ใช้ได้เทิร์นละ 1 ครั้ง');
    const paidWithSoul = payment.some((id) => s.cores[id]?.isSoul);
    const { paid } = payCost(ctx, player, def, payment, []);
    const once = def.abilities.find((a) => a.kind === 'magic' && a.timing === use && a.oncePerTurn);
    if (once) s.usedOncePerTurn = [...(s.usedOncePerTurn ?? []), `${player}:${def.cardNo}:${once.source}`];
    removeFrom(s.players[player].hand, cardId);
    emit(ctx, { type: 'magicUsed', player, cardId, paid, timing: use });
    checkDepletion(ctx);

    if (flash) {
      flash.consecutivePasses = 0;
      flash.priority = opponentOf(player);
    }
    const abilities = def.abilities.filter((a) => a.kind === 'magic' && a.timing === use);
    enqueue(ctx, {
      controller: player,
      sourceId: cardId,
      steps: abilities.flatMap((a) => (a.kind === 'magic' ? a.steps : [])),
      paidWithSoul,
      trashWhenDone: true,
    });
    queueMagicUsedTriggers(ctx, player);
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
    setPhase(ctx, 'attack');
    if (ctx.s.turn === 1 && ctx.s.config.firstPlayerSkipsAttackStep) endTurn(ctx);
  },

  declareAttack(ctx, { player, attackerId }) {
    const { s } = ctx;
    if (s.turnPlayer !== player) fail('NOT_YOUR_TURN', 'ไม่ใช่เทิร์นของคุณ');
    if (s.phase !== 'attack' || s.battle) fail('WRONG_PHASE', 'ประกาศโจมตีได้เฉพาะ Attack Step');
    const card = fieldCard(s, player, attackerId);
    if (!isSpiritLike(ctx.db.get(card.cardNo))) fail('CANNOT_ATTACK', 'การ์ดนี้โจมตีไม่ได้');
    if (card.state !== 'refresh') fail('EXHAUSTED', 'การ์ดเสื่อมสภาพอยู่');
    if (!canAttackWith(s, ctx.db, attackerId)) fail('CANNOT_ATTACK', 'การ์ดนี้โจมตีไม่ได้ในเทิร์นนี้');

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
    emit(ctx, { type: 'attackDeclared', attackerId });
    // เอฟเฟกต์ "เมื่อสปิริตนี้โจมตี" + "เมื่อสปิริตเรา...โจมตี" (เกิดพร้อมกัน) ประมวลผลก่อนเปิด Flash timing
    const batch = newBatch(ctx);
    queueTriggers(ctx, attackerId, 'attack', batch);
    for (const id of [...s.players[player].field]) queueTriggers(ctx, id, 'allyAttack', batch, { subject: attackerId });
    runQueue(ctx);
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
    if (card.state !== 'refresh') fail('EXHAUSTED', 'การ์ดเสื่อมสภาพอยู่');

    card.state = 'exhausted';
    battle.blockers.push(blockerId);
    emit(ctx, { type: 'blockDeclared', blockerId });
    // [Consecutive Blade]: ประกาศตัวถัดไปได้ (บังคับถ้าทำได้)
    if (!(battle.blockers.length < battle.maxBlockers && canBlockWith(ctx, player).length > 0)) openFlashAfterBlock(battle, player);
    const batch = newBatch(ctx);
    queueTriggers(ctx, blockerId, 'block', batch);
    queueBlockedTriggers(ctx, battle.attackerId, blockerId, batch);
    runQueue(ctx);
  },

  /** ไม่บล็อก หรือ (เมื่อบล็อกได้หลายตัว) ไม่บล็อกเพิ่ม */
  noBlock(ctx, { player }) {
    const battle = requireBlockStep(ctx, player);
    if (battle.mustBlock && canBlockWith(ctx, player).length > 0) {
      fail('MUST_BLOCK', battle.consecutiveBlade ? 'ต้องป้องกัน 2 ตัวถ้าทำได้ ([Consecutive Blade])' : 'ต้องป้องกันถ้าทำได้ ([True-Rage])');
    }
    if (battle.blockers.length > 0) {
      openFlashAfterBlock(battle, player);
      return;
    }
    emit(ctx, { type: 'noBlock' });
    resolveBattle(ctx);
  },

  endAttackStep(ctx, { player }) {
    const { s } = ctx;
    if (s.turnPlayer !== player) fail('NOT_YOUR_TURN', 'ไม่ใช่เทิร์นของคุณ');
    if (s.phase !== 'attack' || s.battle) fail('WRONG_PHASE', 'จบ Attack Step ได้เมื่อไม่มีการต่อสู้ค้างอยู่');
    endTurn(ctx);
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
    if (!db.get(card.cardNo).abilities.some((a) => a.kind === 'evolution' && a.levels.includes(level))) {
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
    if (soul) fireTriggers(ctx, cardId, 'soulEvolvedOnto');
    if (depleted.length > 0) {
      const batch = newBatch(ctx);
      for (const id of [...s.players[player].field]) queueTriggers(ctx, id, 'allyDepletedByEvolution', batch);
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
      if (placement.length < minCores(def)) fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${minCores(def)} ดวง`);
      const host = s.cards[from]!;
      removeFrom(host.braves, braveId);
      for (const id of placement) removeCore(s, id);
      brave.cores = [...placement];
      brave.state = host.state;
      p.field.push(braveId);
      emit(ctx, { type: 'braveSeparated', cardId: braveId, stays: true });
    } else {
      if (hostId === from) fail('INVALID_HOST', 'ร่วมร่างกับสปิริตนี้อยู่แล้ว');
      const host = braveHost(ctx, player, def, hostId);
      // สภาพที่ติดไปด้วย: Brave เดี่ยว = สภาพของ Brave, ย้ายจากผู้ร่วมร่างเดิม = สภาพของผู้ร่วมร่างเดิม
      const carried = from ? s.cards[from]!.state : brave.state;
      if (from) removeFrom(s.cards[from]!.braves, braveId);
      else {
        removeFrom(p.field, braveId);
        p.reserve.push(...brave.cores);
        brave.cores = [];
      }
      host.braves.push(braveId);
      host.state = carried;
      brave.state = carried;
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

/** ตรวจว่าสปิริตนี้เป็นผู้ร่วมร่างของ Brave ได้ (สปิริตของเรา, คอสต์ถึง, ยังไม่มี Brave) */
function braveHost(ctx: Ctx, player: PlayerId, def: CardDef, hostId: string) {
  const host = fieldCard(ctx.s, player, hostId);
  const hostDef = ctx.db.get(host.cardNo);
  if (hostDef.type !== 'spirit') fail('INVALID_HOST', 'ร่วมร่างได้กับสปิริตเท่านั้น');
  if (host.braves.length > 0) fail('INVALID_HOST', 'สปิริตนี้มี Brave ร่วมร่างอยู่แล้ว');
  const min = def.braveCondition?.minCost ?? 0;
  if (hostDef.cost < min) fail('INVALID_HOST', `ผู้ร่วมร่างต้องมีคอสต์ตั้งแต่ ${min} ขึ้นไป`);
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
  const chosen = battle.chosenBlockers.filter((id) => s.players[defender].field.includes(id));
  if (chosen.length === 0) return;
  for (const id of chosen) {
    s.cards[id]!.state = 'exhausted';
    battle.blockers.push(id);
    emit(ctx, { type: 'blockDeclared', blockerId: id });
  }
  // [Consecutive Blade] แต่ฝ่ายโจมตีเลือกไม่ครบ: ฝ่ายป้องกันประกาศตัวที่เหลือเอง
  if (!(battle.blockers.length < battle.maxBlockers && canBlockWith(ctx, defender).length > 0)) openFlashAfterBlock(battle, defender);
  const batch = newBatch(ctx);
  for (const id of chosen) queueTriggers(ctx, id, 'block', batch);
  for (const id of chosen) queueBlockedTriggers(ctx, battle.attackerId, id, batch);
  runQueue(ctx);
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

/** ผู้โจมตีถูกป้องกัน: "เมื่อสปิริตนี้ถูกป้องกัน" + "เมื่อสปิริตเราถูกป้องกัน" */
function queueBlockedTriggers(ctx: Ctx, attackerId: string, blockerId: string, batch: number): void {
  const attacker = ctx.s.cards[attackerId];
  if (!attacker || !ctx.s.players[attacker.owner].field.includes(attackerId)) return;
  queueTriggers(ctx, attackerId, 'blocked', batch, { blockerId });
  for (const id of [...ctx.s.players[attacker.owner].field]) queueTriggers(ctx, id, 'allyBlocked', batch, { subject: attackerId, blockerId });
}

/** ต่อสู้ตัดสิน (หมวด 7 ข้อ 5-7) */
function resolveBattle(ctx: Ctx): void {
  const { s, db } = ctx;
  const battle = s.battle!;
  const attacker = s.cards[battle.attackerId]!;
  const attackerDef = db.get(attacker.cardNo);
  const defender = opponentOf(attacker.owner);

  let lostLife = false;
  const blockers = battle.blockers.filter((id) => s.players[defender].field.includes(id));
  if (blockers.length === 0) {
    const extra = Object.values(extraSymbols(s, db, attacker.id)).reduce<number>((n, v) => n + (v ?? 0), 0);
    if (loseLife(ctx, defender, symbolCount(attackerDef) + braveSymbols(ctx, attacker.id) + extra, attacker.owner)) return;
    lostLife = true;
    queueLifeLostTriggers(ctx, defender);
  } else {
    // เทียบ BP กับผู้ป้องกันทีละตัว โดยใช้ BP ก่อนมีใครถูกทำลาย (ต่อสู้พร้อมกัน)
    const bpA = currentBp(s, db, attacker.id);
    const results = blockers.map((id) => ({ id, bp: currentBp(s, db, id) }));
    const destroyedBlockers = results.filter((r) => r.bp <= bpA).map((r) => r.id);
    const attackerLoses = results.some((r) => bpA <= r.bp);
    for (const id of destroyedBlockers) destroyCard(ctx, id, attacker.owner, { bySource: attacker.id });
    if (attackerLoses) destroyCard(ctx, attacker.id, defender, { bySource: results.find((r) => bpA <= r.bp)!.id });

    const perBlocker = battle.lifeOnBlockerDestroyed + (battle.consecutiveBlade ? battle.lifeOnBlockerDestroyedByBlade : 0);
    if (destroyedBlockers.length > 0 && perBlocker > 0) {
      if (loseLife(ctx, defender, perBlocker * destroyedBlockers.length, attacker.owner)) return;
      lostLife = true;
      queueLifeLostTriggers(ctx, defender);
    }
  }

  // เอฟเฟกต์ "เมื่อการโจมตีทำให้คู่แข่งเสียไลฟ์" (ผู้โจมตียังอยู่บนสนาม)
  if (lostLife && s.players[attacker.owner].field.includes(attacker.id)) {
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
  // เอฟเฟกต์ "เมื่อจบการต่อสู้นี้" (ไฮวินด์)
  if (battle.endEffects.length > 0) {
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
  emit(ctx, { type: 'battleEnded' });
  if (battle.endAttackStepAfter) endTurn(ctx);
}

/** ผู้โจมตีหรือผู้ป้องกันออกจากสนามระหว่างการต่อสู้ (สูญสลาย/ถูกทำลายโดยเอฟเฟกต์) → การต่อสู้จบทันที */
function checkBattleParticipants(ctx: Ctx): void {
  const { s } = ctx;
  const battle = s.battle;
  if (!battle || s.choice || s.winner) return;
  const onField = (id: string) => s.players[s.cards[id]!.owner].field.includes(id);
  const blockersGone = battle.blockers.length > 0 && !battle.blockers.some(onField);
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
  const ctx: Ctx = { s: structuredClone(state), db, events: [] };
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
    if (ctx.s.resume && !ctx.s.choice && !ctx.s.winner) {
      const resume = ctx.s.resume;
      ctx.s.resume = null;
      if (resume === 'afterDraw') afterDraw(ctx);
      else if (ctx.s.battle) endBattle(ctx);
    }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: { code: e.code, message: e.message } };
    throw e;
  }
  return { ok: true, state: ctx.s, events: ctx.events };
}
