/**
 * Effect engine: คิวเอฟเฟกต์ + การเลือกของผู้เล่น
 *
 * เอฟเฟกต์ทำทีละ step จากหัวคิว ถ้า step ต้องให้ผู้เล่นเลือก engine จะตั้ง s.choice แล้วหยุด
 * action `choose` จะทำ step นั้นให้จบแล้วเดินคิวต่อ ระหว่างรอเลือก action อื่นถูกปฏิเสธ
 */
import type { Step, SubjectFilter, TriggerEvent } from '@bs/cards';
import { assertUsableCore, checkDepletion, destroy, drawCard, emit, handIncreasedByEffect, leaveField, loseLife, newCore, payCost, pendBurst, sendToTrash, type Ctx } from './ctx';
import {
  baseCost,
  braveHostOf,
  burstBlocked,
  cardLevel,
  effectsNegated,
  handCards,
  effectBlocked,
  trashImmune,
  dispersionCount,
  bounceGoesBottom,
  handImmune,
  levelOf,
  extraBurstEvents,
  coreRemovalImmune,
  fieldCost,
  conditionHolds,
  currentBp,
  fail,
  isSpiritLike,
  matchesFilter,
  minCores,
  nameHas,
  payableCost,
  removeCore,
  removeFrom,
} from './rules';
import { PLAYERS, opponentOf, type ChoicePick, type PendingChoice, type PlayerId, type QueuedEffect } from './types';
import type { Ability } from '@bs/cards';

/** ยิง trigger ของการ์ดตามเหตุการณ์ (ตรวจเลเวล ณ ตอนนี้) แล้วประมวลผล */
export function fireTriggers(ctx: Ctx, cardId: string, on: TriggerEvent): void {
  queueTriggers(ctx, cardId, on);
  runQueue(ctx);
}

/** ใส่ trigger ที่ตรงเงื่อนไขเข้าคิวโดยไม่ประมวลผล (ใช้ได้ระหว่างที่คิวกำลังทำงาน) */
export function queueTriggers(
  ctx: Ctx,
  cardId: string,
  on: TriggerEvent,
  batch: number = newBatch(ctx),
  opts: {
    paidWithSoul?: boolean;
    subject?: string;
    /** oppDeckMilled: การ์ดที่ถูกทิ้ง */
    milled?: string[];
    /** oppDeckMilled: เอฟเฟกต์ที่ทิ้งเด็คเป็นเอฟเฟกต์ "เมื่อสปิริตนี้โจมตี" */
    srcFromAttack?: boolean;
    /** เลเวลก่อนออกจากสนาม (trigger ของการ์ดที่ถูกทำลายไปแล้ว) */
    level?: number;
    soulSnapshot?: boolean;
    /** subject ออกจากสนามไปแล้ว: มี Soul Core อยู่ตอนนั้นหรือไม่ */
    subjectSoul?: boolean;
    /** allySummoned: subject จ่ายคอสต์อัญเชิญด้วย Soul Core */
    subjectPaidSoul?: boolean;
    /** allySummoned: subject ถูกอัญเชิญจากแทรช */
    subjectFromTrash?: boolean;
    /** oppDestroyed: ทำลายด้วยเอฟเฟกต์ */
    subjectByEffect?: boolean;
    /** blocked / allyBlocked: ผู้ป้องกัน */
    blockerId?: string;
    /** allyDestroyed: ถูกทำลายโดยคู่แข่ง */
    subjectByOpponent?: boolean;
    /** lifeLost: จำนวนคอร์ไลฟ์ที่ลดลง */
    lifeLost?: number;
    /** summon: อัญเชิญมาจากไหน */
    summonFrom?: string;
    /** oppHandIncreased: จำนวนการ์ดที่เพิ่มขึ้น */
    handIncrease?: number;
  } = {},
): void {
  const { s, db } = ctx;
  const card = s.cards[cardId]!;
  const def = db.get(card.cardNo);
  const inHand = s.players[card.owner].hand.includes(cardId);
  const inTrash = s.players[card.owner].trashCards.includes(cardId);
  // เอฟเฟกต์ของการ์ดบนสนามที่ถูกปิด (เมียวโอดาบแดง)
  if (!inHand && opts.level === undefined && effectsNegated(s, db, cardId)) return;
  const level = opts.level ?? cardLevel(s, db, cardId);
  const own = def.abilities.map((ab) => ({ ab, src: cardId }));
  // Brave ที่ร่วมร่างอยู่: เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ
  const granted = inHand
    ? []
    : card.braves.flatMap((b) => db.get(s.cards[b]!.cardNo).abilities.filter((a) => a.kind === 'trigger' && a.granted).map((ab) => ({ ab, src: b })));
  for (const { ab, src } of [...own, ...granted]) {
    if (ab.kind !== 'trigger') continue;
    const isGranted = src !== cardId;
    if (!isGranted && ab.granted) continue;
    if (ab.zone === 'hand') {
      if (!inHand) continue;
    } else if (ab.zone === 'trash') {
      if (!inTrash) continue;
    } else {
      if (inHand) continue;
      if (!isGranted && !ab.levels.includes(level)) continue;
    }
    if (Array.isArray(ab.on) ? !ab.on.includes(on) : ab.on !== on) continue;
    if (ab.subject && !(opts.subject && subjectMatches(ctx, opts.subject, ab.subject, cardId, !!opts.srcFromAttack, opts.subjectSoul, opts))) continue;
    if (ab.blocker && !(opts.blockerId && s.cards[opts.blockerId] && matchesFilter(s, db, opts.blockerId, ab.blocker))) continue;
    if (ab.if && !conditionHolds(s, isGranted ? cardId : src, ab.if, false, false, db)) continue;
    if (ab.milled && !(opts.milled ?? []).some((id) => matchesFilter(s, db, id, ab.milled!))) continue;
    if (ab.attackStepOnly && s.phase !== 'attack') continue;
    if (ab.ownTurnOnly && s.turnPlayer !== card.owner) continue;
    if (ab.oppTurnOnly && s.turnPlayer === card.owner) continue;
    if (ab.mainStepOnly && s.phase !== 'main') continue;
    if (ab.oncePerTurnByName) {
      const key = `${card.owner}:${db.get(s.cards[src]!.cardNo).name}:${ab.source}`;
      if ((s.usedOncePerTurn ?? []).includes(key)) continue;
      s.usedOncePerTurn = [...(s.usedOncePerTurn ?? []), key];
    }
    if (ab.oncePerTurn) {
      const used = s.cards[src]!.usedThisTurn;
      if (used.includes(ab.source)) continue;
      used.push(ab.source);
    }
    emit(ctx, { type: 'abilityTriggered', cardId: src, source: ab.source });
    enqueue(ctx, {
      controller: card.owner,
      sourceId: src,
      steps: [...ab.steps],
      paidWithSoul: !!opts.paidWithSoul,
      trashWhenDone: false,
      source: ab.source,
      batch,
      ...(opts.subject ? { subjectId: opts.subject } : {}),
      ...(on === 'attack' ? { fromAttack: true } : {}),
      ...(ab.zone ? { zone: ab.zone } : {}),
      ...(opts.soulSnapshot !== undefined ? { soulSnapshot: opts.soulSnapshot } : {}),
      ...(opts.lifeLost !== undefined ? { lifeLost: opts.lifeLost } : {}),
      ...(opts.summonFrom ? { summonFrom: opts.summonFrom } : {}),
      ...(opts.handIncrease ? { handIncrease: opts.handIncrease } : {}),
    });
  }
}

/** สปิริตต้นเหตุ (เช่น ผู้โจมตี / สปิริตที่ทิ้งเด็ค) ตรงเงื่อนไขของ trigger หรือไม่ */
function subjectMatches(
  ctx: Ctx,
  cardId: string,
  f: SubjectFilter,
  holderId: string,
  srcFromAttack: boolean,
  soulSnapshot?: boolean,
  extra: { subjectPaidSoul?: boolean; subjectByEffect?: boolean; subjectFromTrash?: boolean; subjectByOpponent?: boolean } = {},
): boolean {
  const card = ctx.s.cards[cardId]!;
  const def = ctx.db.get(card.cardNo);
  if (f.color && !def.colors.includes(f.color)) return false;
  if (f.types && !f.types.includes(def.type)) return false;
  if (f.paidWithSoul && !extra.subjectPaidSoul) return false;
  if (f.byEffect && !extra.subjectByEffect) return false;
  if (f.fromTrash && !extra.subjectFromTrash) return false;
  if (f.byOpponent && !extra.subjectByOpponent) return false;
  if (f.firstOfTurn) {
    const fs = ctx.s.firstSummon;
    if (fs?.turn !== ctx.s.turn || fs[card.owner] !== cardId) return false;
  }
  if (f.minCost !== undefined && def.cost < f.minCost) return false;
  if (f.self && cardId !== holderId) return false;
  if (f.other && cardId === holderId) return false;
  if (f.soul && soulSnapshot !== undefined) return soulSnapshot && subjectMatches(ctx, cardId, { ...f, soul: undefined }, holderId, srcFromAttack, undefined, extra);
  if (f.attackEffect && !srcFromAttack) return false;
  if (f.family && !def.family.includes(f.family)) return false;
  if (f.nameIncludes && !nameHas(def, f.nameIncludes)) return false;
  if (f.soul && !card.cores.some((id) => ctx.s.cores[id]!.isSoul)) return false;
  return true;
}

/** "สปิริตนี้" ของเอฟเฟกต์: Brave ที่ร่วมร่างอยู่ = ผู้ร่วมร่าง (เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ) */
function selfOf(ctx: Ctx, item: QueuedEffect): string {
  return braveHostOf(ctx.s, item.sourceId) ?? item.sourceId;
}

/**
 * trigger ที่เกิดจากเอฟเฟกต์ที่กำลังทำงาน: ต่อคิวถัดจากเอฟเฟกต์นั้นทันที (ก่อนเอฟเฟกต์อื่นที่รออยู่)
 * เช่น ผู้โจมตีทิ้งเด็ค → อารามทำงาน → ค่อยถึงเอฟเฟกต์ของ Brave ที่เกิดพร้อมกันตอนโจมตี
 */
function queueRightAfterCurrent(ctx: Ctx, fn: () => void): void {
  const q = ctx.s.queue;
  const before = q.length;
  fn();
  if (q.length === before || !q[0]?.started) return;
  const added = q.splice(before, q.length - before);
  q.splice(1, 0, ...added);
}

/** เราทิ้งเด็คคู่แข่ง: trigger "oppDeckMilled" ของการ์ดบนสนามและบนมือของเรา */
function queueMillTriggers(ctx: Ctx, item: QueuedEffect, milled: string[]): void {
  const me = item.controller;
  const subject = selfOf(ctx, item);
  const batch = newBatch(ctx);
  queueRightAfterCurrent(ctx, () => {
    for (const id of [...ctx.s.players[me].field, ...ctx.s.players[me].hand]) {
      queueTriggers(ctx, id, 'oppDeckMilled', batch, { subject, milled, srcFromAttack: !!item.fromAttack });
    }
  });
}

/**
 * เอฟเฟกต์แทนที่การถูกทำลายที่ใช้ได้กับการ์ดนี้ (ถูกทำลายโดยคู่แข่ง)
 *  - โดจินกาขาว: เมียวโอ/โดจิที่ถูกทำลายโดยเอฟเฟกต์ → ทิ้งเด็คคู่แข่ง 3 ใบ อยู่ต่อแบบเสื่อมสภาพ
 *  - คัปปัปปะ: มี Soul Core → อยู่ต่อแบบเสื่อมสภาพเอง (ต่อสู้ด้วย)
 *  - อินุงามิ: ทิ้งเมจิคบนมือ 1 ใบ → อยู่ต่อแบบฟื้นสภาพ (ต่อสู้ด้วย)
 */
function findReplacement(ctx: Ctx, cardId: string, byEffect: boolean): { id: string; ab: Extract<Ability, { kind: 'replaceDestroy' }> } | null {
  const { s, db } = ctx;
  const owner = s.players[s.cards[cardId]!.owner];
  const name = db.get(s.cards[cardId]!.cardNo).name;
  for (const id of owner.field) {
    if (effectsNegated(s, db, id)) continue;
    const level = cardLevel(s, db, id);
    for (const ab of db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'replaceDestroy' || !ab.levels.includes(level)) continue;
      if (!byEffect && !ab.battle) continue;
      if (ab.subject.self && id !== cardId) continue;
      if (ab.subject.nameIncludes && !ab.subject.nameIncludes.some((w) => name.includes(w))) continue;
      if (ab.subject.family && !db.get(s.cards[cardId]!.cardNo).family.includes(ab.subject.family)) continue;
      if (ab.if && !conditionHolds(s, id, ab.if, false, false, db)) continue;
      if (ab.discard && !owner.hand.some((h) => matchesFilter(s, db, h, ab.discard!))) continue;
      // จ่ายด้วยการทิ้งเด็คคู่แข่ง: ต้องทิ้งได้ครบจำนวน ("เมื่อเป็นเช่นนั้น" = ทำข้างหน้าได้ ข้างหลังถึงเกิด)
      if (ab.mill && s.players[s.cards[cardId]!.owner === 'p1' ? 'p2' : 'p1'].deck.length < ab.mill) continue;
      if (ab.millSelf && owner.deck.length < ab.millSelf) continue;
      return { id, ab };
    }
  }
  return null;
}

/** trigger หลังการ์ดถูกทำลาย: "เมื่อถูกทำลาย" / "ถูกทำลายโดยคู่แข่ง" ของการ์ดนั้น และ "เมื่อสปิริตเราถูกทำลาย" ของการ์ดอื่น (สนาม/มือ) */
function queueDestroyTriggers(
  ctx: Ctx,
  cardId: string,
  by: PlayerId,
  level: number,
  hadSoul: boolean,
  negated: boolean,
  cause: { bySource?: string; effect?: boolean } = {},
): void {
  const { s, db } = ctx;
  const owner = s.cards[cardId]!.owner;
  const destroyedSpirit = isSpiritLike(db.get(s.cards[cardId]!.cardNo));
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    if (level > 0 && !negated) {
      queueTriggers(ctx, cardId, 'destroyed', batch, { level, soulSnapshot: hadSoul });
      if (by !== owner) queueTriggers(ctx, cardId, 'destroyedByOpponent', batch, { level, soulSnapshot: hadSoul });
    }
    for (const id of [...s.players[owner].field, ...s.players[owner].hand]) {
      if (id !== cardId) queueTriggers(ctx, id, 'allyDestroyed', batch, { subject: cardId, subjectSoul: hadSoul, subjectByOpponent: by !== owner });
    }
    // "ในเทิร์นนี้, เมื่อสปิริตของเราถูกทำลาย" (เมจิคที่ใช้ไปแล้ว)
    if (destroyedSpirit) {
      for (const t of s.turnTriggers ?? []) {
        if (t.player !== owner || t.turn !== s.turn || t.on !== 'allyDestroyed') continue;
        enqueue(ctx, { controller: owner, sourceId: t.sourceId, steps: [...t.steps], paidWithSoul: t.paidWithSoul, trashWhenDone: false, subjectId: cardId, batch });
      }
    }
    // "เมื่อสปิริต/อัลติเมทของคู่แข่งถูกทำลายโดย...ของเรา"
    if (by !== owner && destroyedSpirit && cause.bySource && s.cards[cause.bySource]) {
      for (const id of [...s.players[by].field]) {
        queueTriggers(ctx, id, 'oppDestroyed', batch, { subject: cause.bySource, subjectByEffect: !!cause.effect });
      }
    }
  });
}

/**
 * ถือว่าถูกทำลายแล้ว แต่ยังอยู่บนสนามในสภาพ state
 *  - Burst "ถูกทำลาย" ไม่ทำงาน: สปิริตรอด ไม่ได้ถูกส่งลงแทรช (กติกา 06 ข้อ 3.2)
 *  - เอฟเฟกต์ "เมื่อถูกทำลาย" อื่น ๆ (withTriggers):
 *    เอฟเฟกต์ "คงอยู่" กับเอฟเฟกต์ "เมื่อถูกทำลาย" อื่นเกิดพร้อมกัน เจ้าของเทิร์นเป็นผู้เรียง (กติกา 11)
 *    เจ้าของการ์ดถือเทิร์น = เรียงให้ได้ทั้งสองอย่าง (ทำงานต่อ) · คู่แข่งถือเทิร์น = เรียง "คงอยู่" ก่อน อย่างอื่นไม่ทำงาน
 *    (ตีความ: เจ้าของเทิร์นเลือกทางที่ได้เปรียบเสมอ จนกว่าจะมีระบบให้เจ้าของเทิร์นเรียงเอฟเฟกต์ของทั้งสองฝ่ายเอง)
 */
function stayDestroyed(
  ctx: Ctx,
  cardId: string,
  by: PlayerId,
  bySource: string | undefined,
  state: 'refresh' | 'exhausted',
  withTriggers = true,
): void {
  const { s, db } = ctx;
  if (!onField(ctx, cardId)) return;
  const card = s.cards[cardId]!;
  const level = cardLevel(s, db, cardId);
  const hadSoul = card.cores.some((id) => s.cores[id]!.isSoul);
  const negated = effectsNegated(s, db, cardId);
  card.state = state;
  emit(ctx, { type: 'destroyed', cardId, stays: true, cost: fieldCost(s, db, cardId), ...(bySource ? { bySource } : {}) });
  if (withTriggers) queueDestroyTriggers(ctx, cardId, by, level, hadSoul, negated, { ...(bySource ? { bySource } : {}), effect: true });
}

/**
 * ทำลายการ์ดบนสนาม (ต่อสู้ / เอฟเฟกต์)
 *  - มีเอฟเฟกต์แทนที่: ทำเองเลย (auto) หรือถามเจ้าของก่อน (เข้าคิวหน้าสุด ทำก่อนขั้นถัดไปของเอฟเฟกต์ที่ทำลาย)
 *  - trigger "ถูกทำลาย" ของการ์ดที่ถูกทำลาย (ใช้เลเวล/Soul Core ก่อนออกจากสนาม) และของการ์ดอื่นของเจ้าของ
 */
export function destroyCard(ctx: Ctx, cardId: string, by: PlayerId, opts: { bySource?: string; effect?: boolean; noReplace?: boolean } = {}): void {
  const { s, db } = ctx;
  const card = s.cards[cardId]!;
  const owner = card.owner;
  if (!opts.noReplace && by !== owner && s.battle?.staysOnDestroy === owner && isSpiritLike(db.get(card.cardNo))) {
    stayDestroyed(ctx, cardId, by, opts.bySource, 'exhausted');
    return;
  }
  if (!opts.noReplace && by !== owner) {
    const repl = findReplacement(ctx, cardId, !!opts.effect);
    if (repl) {
      const { ab } = repl;
      const state = ab.state === 'same' ? card.state : (ab.state ?? 'exhausted');
      if (ab.auto) {
        stayDestroyed(ctx, cardId, by, opts.bySource, state);
        if (ab.then) {
          s.queue.unshift({ controller: owner, sourceId: repl.id, source: ab.source, steps: [...ab.then], paidWithSoul: false, trashWhenDone: false });
        }
        return;
      }
      const name = db.get(card.cardNo).name;
      const stay: Step = { do: 'destroyedButStays', cardId, by, state, ...(opts.bySource ? { bySource: opts.bySource } : {}) };
      const pay: Step[] = ab.mill
        ? [{ do: 'mill', count: ab.mill }]
        : ab.millSelf
          ? [{ do: 'millSelf', count: ab.millSelf }]
          : ab.discard
            ? [{ do: 'discard', count: 1, filter: ab.discard }]
            : [];
      const price = ab.mill
        ? `ทิ้งเด็คคู่แข่ง ${ab.mill} ใบ`
        : ab.millSelf
          ? `ทิ้งใบบนสุดเด็คเรา ${ab.millSelf} ใบ`
          : ab.discard
            ? 'ทิ้งการ์ดเมจิคบนมือ 1 ใบ'
            : 'ใช้เอฟเฟกต์';
      s.queue.unshift({
        controller: owner,
        sourceId: repl.id,
        source: ab.source,
        steps: [
          {
            do: 'chooseOne',
            options: [
              { label: `${price}: ${name} อยู่ต่อแบบ${state === 'refresh' ? 'ฟื้นสภาพ' : 'เสื่อมสภาพ'}`, steps: [...pay, stay] },
              { label: `ให้ ${name} ถูกทำลาย`, steps: [{ do: 'destroyCard', cardId, by, ...(opts.bySource ? { bySource: opts.bySource } : {}) }] },
            ],
          },
        ],
        paidWithSoul: false,
        trashWhenDone: false,
      });
      return;
    }
  }
  const level = cardLevel(s, db, cardId);
  const hadSoul = card.cores.some((id) => s.cores[id]!.isSoul);
  const negated = effectsNegated(s, db, cardId);
  destroy(ctx, cardId, by, opts.bySource);
  queueDestroyTriggers(ctx, cardId, by, level, hadSoul, negated, opts);
}

/** การ์ดเสื่อมสภาพโดยเอฟเฟกต์: "เมื่อ...ของเราเสื่อมสภาพ" ของการ์ดบนสนามของเจ้าของ (ทำงานต่อจากเอฟเฟกต์ที่กำลังทำงาน) */
export function queueExhaustTriggers(ctx: Ctx, cardId: string): void {
  const owner = ctx.s.cards[cardId]!.owner;
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    for (const id of [...ctx.s.players[owner].field]) queueTriggers(ctx, id, 'allyExhausted', batch, { subject: cardId });
    for (const id of [...ctx.s.players[opponentOf(owner)].field]) queueTriggers(ctx, id, 'oppExhausted', batch, { subject: cardId });
  });
}

/**
 * นำการ์ดบนสนามกลับขึ้นมือ / ไปไว้บนสุด-ใต้สุดเด็คของเจ้าของ
 * (คองโก: ของฝั่งตรงข้ามที่จะกลับขึ้นมือ ไปไว้ใต้สุดเด็คแทน)
 */
function returnCard(ctx: Ctx, cardId: string, to: 'hand' | 'deckTop' | 'deckBottom'): void {
  const { s, db } = ctx;
  const owner = s.cards[cardId]!.owner;
  const dest = to === 'hand' && bounceGoesBottom(s, db, cardId) ? 'deckBottom' : to;
  leaveField(ctx, cardId, 'hand');
  if (dest === 'hand') {
    emit(ctx, { type: 'bounced', player: owner, cardId });
    return;
  }
  const p = s.players[owner];
  removeFrom(p.hand, cardId);
  if (dest === 'deckTop') p.deck.unshift(cardId);
  else p.deck.push(cardId);
  emit(ctx, { type: 'returnedToDeck', player: owner, cardId, where: dest === 'deckTop' ? 'top' : 'bottom' });
}

/** การ์ดสูญสลายเพราะเอฟเฟกต์ของคู่แข่งถอดคอร์: ลงแทรชทันที + "เมื่อสปิริตนี้สูญสลายโดยคู่แข่ง" + Burst */
function depleteByOpponent(ctx: Ctx, item: QueuedEffect, cardId: string, level: number, hadSoul: boolean): void {
  const owner = ctx.s.cards[cardId]!.owner;
  sendToTrash(ctx, cardId);
  emit(ctx, { type: 'depleted', cardId });
  if (hadSoul) item.depletedSoul = true;
  pendBurst(ctx, owner, 'afterAllyDestroyedByOpponent');
  queueRightAfterCurrent(ctx, () => queueTriggers(ctx, cardId, 'depletedByOpponent', newBatch(ctx), { level, soulSnapshot: hadSoul }));
}

/** การ์ดถูกอัญเชิญ: "เมื่อสปิริตนี้ถูกอัญเชิญ" + "เมื่อสปิริตเรา...ถูกอัญเชิญ" ของการ์ดบนสนามของเจ้าของ */
export function queueSummonTriggers(
  ctx: Ctx,
  cardId: string,
  batch: number = newBatch(ctx),
  opts: { paidWithSoul?: boolean; fromTrash?: boolean; from?: string; /** เลเวลที่ใช้ตรวจ trigger (Brave ที่อัญเชิญมาร่วมร่างทันทีไม่มี Core) */ level?: number } = {},
): void {
  const owner = ctx.s.cards[cardId]!.owner;
  const level = opts.level ?? cardLevel(ctx.s, ctx.db, cardId);
  if (level > 0)
    queueTriggers(ctx, cardId, 'summon', batch, {
      paidWithSoul: !!opts.paidWithSoul,
      ...(opts.from ? { summonFrom: opts.from } : {}),
      ...(opts.level !== undefined ? { level: opts.level } : {}),
    });
  for (const id of [...ctx.s.players[owner].field])
    queueTriggers(ctx, id, 'allySummoned', batch, { subject: cardId, subjectPaidSoul: !!opts.paidWithSoul, subjectFromTrash: !!opts.fromTrash });
}

/** ผู้เล่นเสียไลฟ์: trigger "เมื่อเราเสียไลฟ์" ของการ์ดบนสนามของผู้เล่นนั้น */
export function queueLifeLostTriggers(ctx: Ctx, player: PlayerId, amount = 1): void {
  if (ctx.s.winner) return;
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    for (const id of [...ctx.s.players[player].field]) queueTriggers(ctx, id, 'lifeLost', batch, { lifeLost: amount });
  });
}

/** ผู้เล่นใช้การ์ดเมจิค: trigger "เมื่อเราใช้งานการ์ดเมจิค" (เข้าคิวหลังเอฟเฟกต์ของเมจิค = ทำงานหลังจากนั้น) */
export function queueMagicUsedTriggers(ctx: Ctx, player: PlayerId, magicId?: string): void {
  const batch = newBatch(ctx);
  for (const id of [...ctx.s.players[player].field]) queueTriggers(ctx, id, 'allyMagicUsed', batch, magicId ? { subject: magicId } : {});
}

/** id ของกลุ่มเอฟเฟกต์ที่เกิดพร้อมกัน (ตำแหน่งใน log ตอนนี้: deterministic) */
export function newBatch(ctx: Ctx): number {
  return ctx.s.log.length;
}

/** [True-Rage]/[Consecutive Blade] ทำงาน → trigger "blockKeyword" ของการ์ดบนสนามของผู้ควบคุม */
function blockKeywordActivated(ctx: Ctx, player: PlayerId): void {
  const batch = newBatch(ctx);
  for (const id of [...ctx.s.players[player].field]) queueTriggers(ctx, id, 'blockKeyword', batch);
}

/**
 * เงื่อนไข Burst ที่จดไว้ (pendingBursts): ถ้า Burst ที่เซ็ทอยู่ของผู้เล่นมีเงื่อนไขตรง ให้ถามว่าจะเปิดหรือไม่
 * ฝ่ายที่ไม่ใช่ผู้เล่นเทิร์นถูกถามก่อน คืน true ถ้ามีการถามเข้าคิว
 */
function flushBursts(ctx: Ctx): boolean {
  const { s } = ctx;
  const pending = s.pendingBursts;
  if (pending.length === 0) return false;
  s.pendingBursts = [];
  if (s.winner) return false;
  let queued = false;
  // Burst ของทั้งสองฝ่ายที่เงื่อนไขเกิดพร้อมกัน = กลุ่มเดียวกัน: เจ้าของเทิร์นเรียงว่าใครเปิดก่อน (กติกา 11, ดู drainQueue)
  const batch = newBatch(ctx);
  for (const player of [opponentOf(s.turnPlayer), s.turnPlayer]) {
    const events = pending.filter((p) => p.player === player).map((p) => p.on);
    const burstId = s.players[player].burst;
    if (events.length === 0 || !burstId || burstBlocked(s, ctx.db, player)) continue;
    const extra = extraBurstEvents(s, ctx.db, player);
    const anyExtra = events.some((e) => extra.includes(e));
    const ab = ctx.db.get(s.cards[burstId]!.cardNo).abilities.find((x) => x.kind === 'burst' && (events.includes(x.on) || anyExtra));
    if (!ab || ab.kind !== 'burst') continue;
    enqueue(ctx, {
      controller: player,
      sourceId: burstId,
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'เปิด Burst', steps: [{ do: 'openBurst' }, ...ab.steps] },
            { label: 'ไม่เปิด', steps: [] },
          ],
        },
      ],
      paidWithSoul: false,
      trashWhenDone: false,
      announce: false,
      batch,
    });
    queued = true;
  }
  return queued;
}

export function enqueue(ctx: Ctx, item: QueuedEffect): void {
  ctx.s.queue.push(item);
}

/** เอฟเฟกต์สองอันที่ผลเหมือนกันทุกอย่าง (ใช้ตัดสินว่าต้องถามลำดับไหม) */
export function effectKey(q: { sourceId: string; source?: number | null; subjectId?: string; fromAttack?: boolean; soulSnapshot?: boolean; paidWithSoul?: boolean }): string {
  return [q.sourceId, q.source ?? '-', q.subjectId ?? '-', q.fromAttack ? 1 : 0, q.soulSnapshot ?? '-', q.paidWithSoul ? 1 : 0].join('|');
}

/** เดินคิวจนหมด หรือจนต้องรอผู้เล่นเลือก */
export function runQueue(ctx: Ctx): void {
  const { s } = ctx;
  for (;;) {
    drainQueue(ctx);
    checkDepletion(ctx);
    if (s.choice || s.winner) return;
    // การ์ดที่สูญสลาย/Brave ที่ต้องเลือก หรือ Burst ที่เงื่อนไขเกิดระหว่างนี้ → ทำต่อ
    if (s.queue.length === 0 && !flushBursts(ctx)) return;
  }
}

function drainQueue(ctx: Ctx): void {
  const { s } = ctx;
  while (!s.choice && !s.winner && s.queue.length > 0) {
    // เอฟเฟกต์จากบนมือ/ในแทรชที่ยังไม่เริ่ม แต่การ์ดย้ายออกไปแล้ว (เช่น อัญเชิญไปด้วย trigger อันก่อน): ตัดทิ้ง
    // ไม่งั้นการ์ดใบเดียวถูกอัญเชิญซ้ำ (เมียวโอแห่งการไถ่บาป เมื่อเด็คคู่แข่งถูกทิ้งสองครั้ง)
    const stale = s.queue.filter((q) => !q.started && q.zone && !s.players[q.controller][q.zone === 'hand' ? 'hand' : 'trashCards'].includes(q.sourceId));
    if (stale.length > 0) {
      s.queue = s.queue.filter((q) => !stale.includes(q));
      continue;
    }
    const item = s.queue[0]!;
    if (!item.started) {
      // เอฟเฟกต์ที่รอทำงาน (ที่เพิ่งเกิด + ที่ค้างจากก่อนหน้า เช่น เอฟเฟกต์ของ Brave ตอนโจมตี) ของทั้งสองฝ่าย:
      // เจ้าของเทิร์นเป็นผู้เรียงว่าอันไหนทำงานก่อน รวมถึงเอฟเฟกต์ของคู่แข่ง (กติกา 11)
      const group: QueuedEffect[] = [];
      for (const q of s.queue) {
        if (q.started || q.batch === undefined || item.batch === undefined) break;
        group.push(q);
      }
      // เอฟเฟกต์ที่เหมือนกันทุกอย่าง (การ์ด/บรรทัด/ต้นเหตุเดียวกัน) ลำดับไม่มีผล: ไม่ต้องถาม
      // เช่น เมียวโอทะเลคราม Lv2 ที่เกิดสองครั้งจากการทิ้งเด็คของตัวเอง + ของเรือมังกรคู่ที่ร่วมร่าง
      const distinct = new Set(group.map(effectKey));
      if (group.length >= 2 && distinct.size >= 2) {
        const both = group.some((q) => q.controller !== s.turnPlayer);
        s.choice = {
          kind: 'order',
          player: s.turnPlayer,
          sourceId: item.sourceId,
          prompt: both
            ? 'เอฟเฟกต์ของทั้งสองฝ่ายเกิดพร้อมกัน: เจ้าของเทิร์นเลือกอันที่จะทำงานก่อน'
            : 'เอฟเฟกต์เกิดพร้อมกัน: เลือกอันที่จะทำงานก่อน',
          effects: group.map((q) => ({ sourceId: q.sourceId, source: q.source ?? null, key: effectKey(q) })),
        };
        break;
      }
      startEffect(ctx, item);
    }
    const step = item.steps.shift();
    if (!step) {
      s.queue.shift();
      if (item.trashWhenDone) s.players[item.controller].trashCards.push(item.sourceId);
      continue;
    }
    execStep(ctx, item, step);
  }
}

/** ประกาศว่าเอฟเฟกต์นี้เริ่มทำงาน (ผลเกิดทันที ไม่ต้องรอ resolve) */
function startEffect(ctx: Ctx, item: QueuedEffect): void {
  item.started = true;
  item.logStart = ctx.s.log.length;
  if (item.announce !== false) emit(ctx, { type: 'effectResolving', player: item.controller, cardId: item.sourceId, source: item.source ?? null });
}

const onField = (ctx: Ctx, cardId: string) => PLAYERS.some((p) => ctx.s.players[p].field.includes(cardId));

function addTurnBp(ctx: Ctx, cardId: string, amount: number): void {
  ctx.s.cards[cardId]!.turnBp += amount;
  emit(ctx, { type: 'bpBuffed', cardId, amount });
}

function ask(ctx: Ctx, item: QueuedEffect, choice: DistributiveOmit<PendingChoice, 'player' | 'sourceId'>, player: PlayerId = item.controller): void {
  ctx.s.choice = { ...choice, player, sourceId: item.sourceId } as PendingChoice;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function execStep(ctx: Ctx, item: QueuedEffect, step: Step): void {
  const { s, db } = ctx;
  const me = item.controller;
  const self = selfOf(ctx, item);
  const holds = (cond: Parameters<typeof conditionHolds>[2]) => {
    // การ์ดที่ออกจากสนามไปแล้ว: ใช้สภาพ Soul Core ตอนเกิด trigger
    if (cond && 'soulOnSelf' in cond && item.soulSnapshot !== undefined) return item.soulSnapshot;
    if (cond && 'summonedFromDeck' in cond) return item.summonFrom === 'deck';
    if (cond && 'subjectCanRefreshOnce' in cond) {
      const id = item.subjectId;
      return (
        !!id &&
        onField(ctx, id) &&
        s.cards[id]!.state === 'exhausted' &&
        !(s.usedOncePerTurn ?? []).includes(`${id}:${cond.subjectCanRefreshOnce}`)
      );
    }
    return conditionHolds(s, self, cond, item.paidWithSoul, item.catalyzed, db);
  };
  const opp = opponentOf(me);
  const spiritLike = (id: string) => isSpiritLike(db.get(s.cards[id]!.cardNo));
  /** เอฟเฟกต์นี้ส่งผลถึงการ์ดนี้ได้ (ไม่ติด Ultra Shield ฯลฯ) */
  const hits = (id: string) => !effectBlocked(s, db, item.sourceId, id);
  /** การ์ดในแทรชที่เอฟเฟกต์ส่งผลได้ (เทปเปคิวอลล์ไม่รับผล) */
  const inTrashOk = (id: string) => !trashImmune(db, s, id);
  /**
   * Dispersion: เมจิคของเราที่เล็งเป้าการ์ดคู่แข่ง 1 ตัว ระหว่างที่ไรกะโจมตี/ป้องกัน = เล็งได้ N ตัว
   * คืน true ถ้าขยายแล้ว (step ใหม่เข้าคิวแทน)
   */
  const disperse = (count: number, st: Step & { dispersed?: true }): boolean => {
    // กติกา 14 Dispersion: เฉพาะเมจิค 1 เป้า, เอฟเฟกต์จากเบิร์ส (รวมแฟลชหลังเปิดเบิร์ส) กระจายไม่ได้
    if (count !== 1 || st.dispersed || item.controller !== me || item.isBurst) return false;
    const src = s.cards[item.sourceId];
    if (!src || db.get(src.cardNo).type !== 'magic') return false;
    const n = dispersionCount(s, db, me);
    if (n <= 1) return false;
    item.steps.unshift({ ...st, count: n, dispersed: true } as Step);
    return true;
  };

  switch (step.do) {
    case 'draw': {
      if (!holds(step.if)) return;
      const before = s.players[me].hand.length;
      for (let i = 0; i < step.count * (step.perLifeLost ? (item.lifeLost ?? 0) : 1); i++) drawCard(ctx, me, true);
      const n = s.players[me].hand.length - before;
      if (n > 0) {
        // "เมื่อมือของคู่แข่งเพิ่มขึ้นโดยเอฟเฟกต์" ของอีกฝ่าย (ทำงานต่อจากเอฟเฟกต์นี้)
        queueRightAfterCurrent(ctx, () => {
          const batch = newBatch(ctx);
          for (const id of [...s.players[opp].field]) queueTriggers(ctx, id, 'oppHandIncreased', batch, { handIncrease: n });
        });
      }
      return;
    }

    case 'exhaustOpponent': {
      if (step.count < 1 || !holds(step.if)) return;
      if (disperse(step.count, step)) return;
      const candidates = s.players[opp].field.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && (!step.filter || matchesFilter(s, db, id, step.filter)) && hits(id),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตของคู่แข่งที่จะเสื่อมสภาพ (${step.count} ตัว)`, candidates, step });
      return;
    }

    case 'exhaustAllOpponent':
      for (const id of s.players[opp].field) {
        if (spiritLike(id) && s.cards[id]!.state === 'refresh' && matchesFilter(s, db, id, step.filter) && hits(id)) {
          s.cards[id]!.state = 'exhausted';
          emit(ctx, { type: 'exhausted', cardId: id });
          queueExhaustTriggers(ctx, id);
        }
      }
      return;

    case 'millSelf': {
      const deck = s.players[me].deck;
      const ids = deck.splice(0, Math.min(step.count, deck.length));
      if (ids.length === 0) return;
      s.players[me].trashCards.push(...ids);
      item.milled = ids;
      emit(ctx, { type: 'milled', player: me, cardIds: ids });
      return;
    }

    case 'removeOpponentCores': {
      if (!holds(step.if)) return;
      // จำนวนเม็ดตามสปิริตเผ่าของเรา / ตามคอร์บนสปิริตนี้: แปลงเป็นจำนวนตายตัวก่อน
      if (step.countPerMilled) {
        const n = (item.milled ?? []).filter((id) => matchesFilter(s, db, id, step.countPerMilled!)).length;
        if (n * step.count === 0) return;
        item.steps.unshift({ ...step, count: n * step.count, countPerMilled: undefined });
        return;
      }
      if (step.countPerAllyFamily || step.countPerSelfCore) {
        const n = step.countPerAllyFamily
          ? s.players[me].field.filter((id) => spiritLike(id) && db.get(s.cards[id]!.cardNo).family.includes(step.countPerAllyFamily!)).length
          : onField(ctx, self)
            ? s.cards[self]!.cores.length
            : 0;
        if (n * step.count === 0) return;
        item.steps.unshift({ ...step, count: n * step.count, countPerAllyFamily: undefined, countPerSelfCore: undefined });
        return;
      }
      if (step.count < 1) return;
      const candidates = s.players[opp].field.filter(
        (id) =>
          (step.filter?.types ? true : spiritLike(id)) &&
          hits(id) &&
          s.cards[id]!.cores.length > (step.untilOne ? 1 : 0) &&
          (!step.filter || matchesFilter(s, db, id, step.filter)) &&
          !coreRemovalImmune(s, db, id),
      );
      if (candidates.length === 0) return;
      const prompt = step.untilOne
        ? 'เลือกสปิริต/อัลติเมทของคู่แข่งที่จะส่งคอร์ไปรีเสิร์ฟจนเหลือ 1 เม็ด'
        : `เลือกสปิริต/อัลติเมท${step.opponentChooses ? 'ของตัวเอง' : 'ของคู่แข่ง'}ที่จะส่งคอร์ 1 เม็ดไป${step.to === 'trash' ? 'แทรช' : 'รีเสิร์ฟ'} (อีก ${step.count} เม็ด)`;
      ask(ctx, item, { kind: 'card', prompt, candidates, step }, step.opponentChooses ? opp : me);
      return;
    }

    case 'exhaustOpponentTotalBp': {
      const candidates = s.players[opp].field.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && currentBp(s, db, id) <= step.maxTotal,
      );
      if (candidates.length === 0) return;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกสปิริตของคู่แข่งที่จะเสื่อมสภาพ (BP รวมเหลือ ${step.maxTotal}) หรือหยุด`,
        candidates,
        optional: true,
        step,
      });
      return;
    }

    case 'bounceOpponent': {
      if (!holds(step.if)) return;
      if (step.countPerAllyFamily) {
        const n = s.players[me].field.filter((id) => spiritLike(id) && db.get(s.cards[id]!.cardNo).family.includes(step.countPerAllyFamily!)).length;
        if (n === 0) return;
        item.steps.unshift({ ...step, count: n * (step.count ?? 1), countPerAllyFamily: undefined, if: undefined });
        return;
      }
      if ((step.count ?? 1) < 1) return;
      if (!step.anySide && disperse(step.count ?? 1, step)) return;
      let filter = step.filter;
      if (step.costFrom === 'self') {
        if (!onField(ctx, self)) return;
        filter = { ...filter, maxCost: fieldCost(s, db, self) };
      } else if (step.costFrom === 'subject') {
        if (!item.subjectId || !s.cards[item.subjectId]) return;
        filter = { ...filter, maxCost: db.get(s.cards[item.subjectId]!.cardNo).cost };
      }
      const pool = step.anySide ? [...s.players[me].field, ...s.players[opp].field] : s.players[opp].field;
      const candidates = pool.filter((id) => matchesFilter(s, db, id, filter) && hits(id));
      if (candidates.length === 0) return;
      const where = step.to === 'deckBottom' ? 'ไปไว้ใต้สุดเด็ค' : step.to === 'deckTop' ? 'ไปไว้บนสุดเด็ค' : 'กลับขึ้นมือ';
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ด${step.anySide ? '' : 'ของคู่แข่ง'}ที่จะนำ${where}`, candidates, step: { ...step, filter, costFrom: undefined } });
      return;
    }

    case 'bounceAllOpponent':
      if (!holds(step.if)) return;
      for (const id of [...s.players[opp].field]) if (matchesFilter(s, db, id, step.filter) && hits(id)) returnCard(ctx, id, 'hand');
      return;

    case 'battleUnblockable':
      if (s.battle) s.battle.unblockable = step.by ?? 'all';
      return;

    case 'unblockableThisTurn': {
      const n = step.countPerNexus
        ? (['p1', 'p2'] as const).reduce((k, p) => k + s.players[p].field.filter((id) => db.get(s.cards[id]!.cardNo).type === 'nexus').length, 0)
        : (step.count ?? 1);
      if (n < 1) return;
      const candidates = s.players[me].field.filter(
        (id) => spiritLike(id) && matchesFilter(s, db, id, step.filter) && !(s.unblockableTurn ?? []).some((u) => u.cardId === id && u.turn === s.turn),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตเราที่จะไม่ถูกป้องกันในเทิร์นนี้ (อีก ${n} ตัว)`, candidates, step: { ...step, count: n, countPerNexus: undefined } });
      return;
    }

    case 'battleNoHandFlash':
      if (s.battle) s.battle.noHandFlash = opp;
      return;

    case 'battleStaysOnDestroy':
      if (s.battle && holds(step.if)) s.battle.staysOnDestroy = me;
      return;

    case 'useMagicFromHandFree': {
      const candidates = s.players[me].hand.filter((id) => {
        const d = db.get(s.cards[id]!.cardNo);
        return d.type === 'magic' && d.abilities.some((a) => a.kind === 'magic' && a.timing === 'flash');
      });
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดเมจิคในมือที่จะใช้งานไม่จ่ายคอสต์ ([Flash])', candidates, optional: true, skipLabel: 'ไม่ใช้', step });
      return;
    }

    case 'allySoulToTrash': {
      const candidates = s.players[me].field.filter((id) => matchesFilter(s, db, id, step.filter) && s.cards[id]!.cores.some((c) => s.cores[c]!.isSoul));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตเราที่จะส่ง Soul Core ลงแทรช', candidates, step });
      return;
    }

    case 'showFromHand': {
      const candidates = handCards(s, me).filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในมือที่จะวางแสดงนอกมือ (ใช้งานได้เหมือนอยู่ในมือจนจบเกม)', candidates, step });
      return;
    }

    case 'setSymbols':
      if (s.battle && onField(ctx, self)) s.battle.symbolOverride = { cardId: self, color: step.color, count: step.count };
      return;

    case 'markSubjectOnce':
      if (item.subjectId) s.usedOncePerTurn = [...(s.usedOncePerTurn ?? []), `${item.subjectId}:${step.key}`];
      return;

    case 'ifBurstDiscarded':
      if (item.burstDiscarded) item.steps.unshift(...step.steps);
      return;

    case 'revealTakeAll': {
      const revealed = s.players[me].deck.slice(0, step.count);
      if (revealed.length === 0) return;
      emit(ctx, { type: 'cardsRevealed', player: me, cardIds: revealed });
      const take = revealed.filter((id) => matchesFilter(s, db, id, step.filter));
      for (const id of take) {
        removeFrom(s.players[me].deck, id);
        s.players[me].hand.push(id);
        emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'deck' });
      }
      if (take.length > 0) handIncreasedByEffect(ctx, me);
      const rest = revealed.filter((id) => !take.includes(id));
      if (rest.length > 0) mill(ctx, me, rest);
      return;
    }

    case 'voidCore': {
      if (!holds(step.if)) return;
      if (step.countPerAlly) {
        const n = s.players[me].field.filter((id) => spiritLike(id)).length;
        if (n === 0) return;
        item.steps.unshift({ ...step, count: step.count * n, countPerAlly: undefined });
        return;
      }
      if (step.to === 'reserve') {
        for (let i = 0; i < step.count; i++) s.players[me].reserve.push(newCore(ctx, me));
        emit(ctx, { type: 'voidCore', player: me, cardId: null, count: step.count });
      } else if (step.to === 'subject') {
        if (item.subjectId && onField(ctx, item.subjectId)) addVoidCores(ctx, me, item.subjectId, step.count);
      } else if (step.to === 'trash') {
        for (let i = 0; i < step.count; i++) s.players[me].trashCores.push(newCore(ctx, me));
        emit(ctx, { type: 'voidCore', player: me, cardId: null, count: step.count, trash: true });
      } else if (step.to === 'self') {
        if (onField(ctx, self)) addVoidCores(ctx, me, self, step.count);
      } else if (step.to === 'allAllies') {
        for (const id of s.players[me].field) {
          if (spiritLike(id) && (!step.filter || matchesFilter(s, db, id, step.filter))) addVoidCores(ctx, me, id, step.count);
        }
      } else {
        const candidates = s.players[me].field.filter(
          (id) => (step.to === 'ally' || id !== self) && spiritLike(id) && (!step.filter || matchesFilter(s, db, id, step.filter)),
        );
        if (candidates.length === 0) return;
        ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตเราที่จะวางคอร์วอยด์ ${step.count} เม็ด`, candidates, step });
      }
      return;
    }

    case 'soulToReserve': {
      const card = s.cards[self]!;
      const soul = card.cores.find((id) => s.cores[id]!.isSoul);
      if (!soul || !onField(ctx, self)) return;
      card.cores.splice(card.cores.indexOf(soul), 1);
      s.players[me].reserve.push(soul);
      emit(ctx, { type: 'soulToReserve', cardId: self });
      return;
    }

    case 'revealSummon': {
      const revealed = s.players[me].deck.slice(0, step.count);
      if (revealed.length === 0) return;
      emit(ctx, { type: 'cardsRevealed', player: me, cardIds: revealed });
      const candidates = revealed.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0 || step.max === 0) {
        if (step.rest === 'trash') mill(ctx, me, revealed);
        else item.steps.unshift({ do: 'toDeckBottom', cardIds: revealed });
        return;
      }
      ask(ctx, item, {
        kind: 'multiSummon',
        prompt:
          step.max === null
            ? 'เลือกการ์ดที่จะอัญเชิญไม่จ่ายคอสต์ (กี่ใบก็ได้ ลงพร้อมกัน) ที่เหลือไว้ใต้สุดเด็ค'
            : `เลือกการ์ดที่จะอัญเชิญไม่จ่ายคอสต์ (สูงสุด ${step.max} ใบ) ที่เหลือไว้ใต้สุดเด็ค`,
        revealed,
        candidates,
        max: step.max,
        step,
      });
      return;
    }

    case 'toDeckBottom': {
      const left = step.cardIds.filter((id) => s.players[me].deck.includes(id));
      if (left.length === 0) return;
      // ใบเดียว หรือการ์ดชื่อเดียวกันทั้งหมด: ลำดับไม่มีผล ไม่ต้องถาม
      if (left.length === 1 || left.every((id) => s.cards[id]!.cardNo === s.cards[left[0]!]!.cardNo)) {
        for (const id of left) toBottom(ctx, me, id);
        return;
      }
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดที่จะวางใต้สุดเด็คก่อน (ใบที่เลือกทีหลังจะอยู่ล่างกว่า)', candidates: left, revealed: left, step });
      return;
    }

    case 'summonThisFree':
      item.trashWhenDone = false;
      item.steps.unshift({ do: 'placeCores', cardId: item.sourceId });
      return;

    case 'placeCores': {
      const def = db.get(s.cards[step.cardId]!.cardNo);
      // Brave ที่อัญเชิญด้วยเอฟเฟกต์: เลือกได้ว่าจะร่วมร่างหรือลงเป็นสปิริต
      if (def.type === 'brave' && !step.noSummon && !step.asSpirit && braveHostsFor(ctx, me, step.cardId).length > 0) {
        item.steps.unshift({ do: 'braveOrSpirit', cardId: step.cardId });
        return;
      }
      // อัญเชิญด้วยเอฟเฟกต์: ใช้ Core จากรีเสิร์ฟและบนการ์ดในสนามของเราได้
      const available = usableCores(ctx, me).length;
      if (available === 0) {
        putOnField(ctx, item, step, []);
        return;
      }
      const min = Math.min(minCores(def), available);
      ask(ctx, item, {
        kind: 'placeCores',
        prompt: `วาง Core บน ${def.name} (อย่างน้อย ${min} ดวง จากรีเสิร์ฟหรือการ์ดบนสนาม)`,
        cardId: step.cardId,
        min,
        step,
      });
      return;
    }

    case 'braveOrSpirit': {
      const name = db.get(s.cards[step.cardId]!.cardNo).name;
      ask(ctx, item, {
        kind: 'card',
        prompt: `${name}: เลือกสปิริตที่จะร่วมร่าง หรือลงสนามเป็นสปิริต`,
        candidates: braveHostsFor(ctx, me, step.cardId),
        optional: true,
        skipLabel: 'ลงสนามเป็นสปิริต',
        step,
      });
      return;
    }

    case 'braveTrash':
      s.players[me].trashCards.push(step.cardId);
      emit(ctx, { type: 'braveSeparated', cardId: step.cardId, stays: false });
      return;

    case 'discardHandDrawOpponentCount': {
      const p = s.players[me];
      if (handCards(s, me).length === 0) return;
      for (const id of [...handCards(s, me)]) {
        removeFrom(p.hand, id);
        p.trashCards.push(id);
        emit(ctx, { type: 'discarded', player: me, cardId: id });
      }
      const n = s.players[opp].hand.length;
      for (let i = 0; i < n; i++) drawCard(ctx, me, true);
      return;
    }

    case 'refreshChosenAlly': {
      if (!holds(step.if)) return;
      const candidates = s.players[me].field.filter((id) => s.cards[id]!.state === 'exhausted' && matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตเราที่จะฟื้นสภาพ', candidates, step });
      return;
    }

    case 'opponentLifeToReserve':
      if (!loseLife(ctx, opp, step.count, me)) queueLifeLostTriggers(ctx, opp, step.count);
      return;

    case 'selfCoresToTrash': {
      const card = s.cards[self]!;
      if (!onField(ctx, self) || card.cores.length < step.count) return;
      item.steps.unshift({ do: 'coresOff', cardId: self, n: step.count, to: 'trash', byOpponent: false });
      return;
    }

    case 'coresOff': {
      // กติกา 07 Q2: เอฟเฟกต์ส่งคอร์ออก ถ้าการ์ดมี Soul Core เจ้าของการ์ดเลือกได้ว่าจะส่ง Soul Core หรือคอร์ปกติ
      const card = s.cards[step.cardId];
      if (!card || !onField(ctx, step.cardId)) return;
      const n = Math.min(step.n, card.cores.length);
      if (n <= 0) return;
      const normals = card.cores.filter((c) => !s.cores[c]!.isSoul);
      const soulCore = card.cores.find((c) => s.cores[c]!.isSoul);
      const where = step.to === 'trash' ? 'แทรช' : 'รีเสิร์ฟ';
      if (step.soul === undefined && soulCore && n < card.cores.length && normals.length >= n) {
        const options = [
          { label: `ส่งคอร์ปกติ ${n} เม็ด (เก็บ Soul Core ไว้)`, steps: [{ ...step, soul: false }] },
          { label: n > 1 ? `ส่ง Soul Core + คอร์ปกติ ${n - 1} เม็ด` : 'ส่ง Soul Core', steps: [{ ...step, soul: true }] },
        ];
        ask(
          ctx,
          item,
          { kind: 'option', prompt: `${db.get(card.cardNo).name}: เลือกคอร์ที่จะส่งไป${where} ${n} เม็ด`, options: options.map((o) => o.label), step: { do: 'chooseOne', options } },
          card.owner,
        );
        return;
      }
      // ไม่ต้องเลือก: คอร์ปกติออกก่อน (คอร์ปกติไม่พอ = Soul Core ออกด้วย)
      const moved = step.soul && soulCore ? [soulCore, ...normals.slice(0, n - 1)] : [...normals, ...(soulCore ? [soulCore] : [])].slice(0, n);
      const owner = s.players[card.owner];
      const preLevel = cardLevel(s, db, step.cardId);
      const hadSoul = !!soulCore;
      card.cores = card.cores.filter((c) => !moved.includes(c));
      (step.to === 'trash' ? owner.trashCores : owner.reserve).push(...moved);
      if (step.byOpponent) {
        emit(ctx, { type: 'coresRemoved', cardId: step.cardId, count: moved.length, to: step.to });
        const pdef = db.get(card.cardNo);
        if (isSpiritLike(pdef) && levelOf(pdef, card.cores.length) === 0) depleteByOpponent(ctx, item, step.cardId, preLevel, hadSoul);
      } else {
        emit(ctx, { type: 'coresToTrash', cardId: step.cardId, count: moved.length });
      }
      return;
    }

    case 'atBattleEnd':
      s.battle?.endEffects.push({
        controller: me,
        sourceId: item.sourceId,
        steps: [...step.steps],
        paidWithSoul: item.paidWithSoul,
        trashWhenDone: false,
        ...(item.source !== undefined ? { source: item.source } : {}),
        ...(item.subjectId ? { subjectId: item.subjectId } : {}),
      });
      return;

    case 'returnSelfToHand':
      if (!onField(ctx, item.sourceId)) return;
      leaveField(ctx, item.sourceId, 'hand');
      emit(ctx, { type: 'bounced', player: me, cardId: item.sourceId });
      handIncreasedByEffect(ctx, me);
      if (step.then) item.steps.unshift(...step.then);
      return;

    case 'setBurstFromHand': {
      const candidates = s.players[me].hand.filter((id) => db.get(s.cards[id]!.cardNo).burst);
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดที่มีเอฟเฟกต์ Burst บนมือไปเซ็ท (ไม่เลือกก็ได้)', candidates, optional: true, step });
      return;
    }

    case 'catalyze': {
      const burstId = s.players[me].burst;
      if (!burstId) return;
      const def = db.get(s.cards[burstId]!.cardNo);
      const ab = def.abilities.find((x) => x.kind === 'burst');
      if (!ab || ab.kind !== 'burst' || !ab.soul || (step.color && !def.colors.includes(step.color))) return;
      emit(ctx, { type: 'catalyze', cardId: item.sourceId, burstId });
      // สั่งใช้ทันทีหลังเอฟเฟกต์นี้
      s.queue.splice(1, 0, {
        controller: me,
        sourceId: burstId,
        steps: [{ do: 'openBurst' }, ...ab.steps],
        paidWithSoul: false,
        trashWhenDone: false,
        announce: false,
        catalyzed: true,
      });
      return;
    }

    case 'buffSelf':
      if (onField(ctx, self) && holds(step.if)) addTurnBp(ctx, self, step.amount);
      return;

    case 'buffSubject':
      if (item.subjectId && onField(ctx, item.subjectId)) addTurnBp(ctx, item.subjectId, step.amount);
      return;

    case 'buffChosen': {
      const candidates = PLAYERS.flatMap((p) => s.players[p].field).filter((id) => isSpiritLike(db.get(s.cards[id]!.cardNo)));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริต 1 ตัว ได้ BP+${step.amount} ในเทิร์นนี้`, candidates, step });
      return;
    }

    case 'mustBlock': {
      // subject: True-Rage ที่ให้สปิริตเรา (ปราสาทมังกรระอุ) = ผู้โจมตีที่เป็นต้นเหตุ
      const who = step.subject ? item.subjectId : self;
      if (who && s.battle?.attackerId === who && holds(step.if)) {
        s.battle.mustBlock = true;
        // True-Rage ไม่ได้ถูกยกเลิกไปด้วยเมื่อตีระบุทำให้ Consecutive Blade ไม่เกิดผล
        s.battle.mustBlockBeforeBlade = true;
        emit(ctx, { type: 'mustBlock', cardId: who });
        blockKeywordActivated(ctx, me);
      }
      return;
    }

    case 'destroyAllOpponent':
      for (const id of [...s.players[opponentOf(me)].field]) {
        if (matchesFilter(s, db, id, step.filter) && hits(id)) {
          recordDestroyed(ctx, item, id);
          destroyCard(ctx, id, me, { bySource: item.sourceId, effect: true });
        }
      }
      return;

    case 'ifDestroyed': {
      const f = step.filter;
      const hit = (item.destroyedByThis ?? []).some(
        (d) => (f.minBp === undefined || d.bp >= f.minBp) && (!f.types || f.types.includes(d.type as never)) && (!f.opponent || d.opponent),
      );
      if (hit) item.steps.unshift(...step.steps);
      return;
    }

    case 'destroyOpponentBrave': {
      if (!holds(step.if)) return;
      const candidates = s.players[opp].field.flatMap((id) => s.cards[id]!.braves).filter(hits);
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกเบรฟที่ร่วมร่างอยู่ของคู่แข่ง 1 ใบที่จะทำลาย', candidates, step });
      return;
    }

    case 'opponentDestroysOwn': {
      const candidates = s.players[opp].field.filter((id) => matchesFilter(s, db, id, step.filter) && hits(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดของตัวเอง 1 ใบที่จะถูกทำลาย', candidates, step }, opp);
      return;
    }

    case 'buffAllies':
      // ตัวที่อยู่บนสนามตอนนี้: แสดงแอนิเมชัน BP+ (ค่าจริงคิดจาก turnBuffs ใน currentBp)
      for (const id of s.players[me].field) {
        const def = db.get(s.cards[id]!.cardNo);
        if ((def.type === 'spirit' || def.type === 'brave') && (!step.filter || matchesFilter(s, db, id, step.filter)))
          emit(ctx, { type: 'bpBuffed', cardId: id, amount: step.amount });
      }
      s.turnBuffs = [...(s.turnBuffs ?? []).filter((b) => b.turn === s.turn), { player: me, turn: s.turn, amount: step.amount, ...(step.filter ? { filter: step.filter } : {}) }];
      return;

    case 'summonFromTrashFree': {
      const candidates = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรชที่จะอัญเชิญไม่จ่ายคอสต์', candidates, optional: true, skipLabel: 'ไม่อัญเชิญ', step });
      return;
    }

    case 'revealPickRestTrash': {
      const revealed = s.players[me].deck.slice(0, step.count);
      if (revealed.length === 0) return;
      emit(ctx, { type: 'cardsRevealed', player: me, cardIds: revealed });
      const candidates = revealed.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) {
        if (step.rest === 'bottom') item.steps.unshift({ do: 'toDeckBottom', cardIds: revealed });
        else mill(ctx, me, revealed);
        return;
      }
      ask(ctx, item, { kind: 'card', prompt: step.rest === 'bottom' ? 'เลือกการ์ด 1 ใบขึ้นมือ ที่เหลือไว้ใต้สุดเด็ค' : 'เลือกการ์ด 1 ใบขึ้นมือ ที่เหลือลง Trash', candidates, revealed, step });
      return;
    }

    case 'returnFromTrash': {
      if (!holds(step.if)) return;
      const candidates = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรช 1 ใบกลับขึ้นมือ', candidates, step });
      return;
    }

    case 'endAttackStepAfterBattle':
      if (s.battle) s.battle.endAttackStepAfter = true;
      return;

    case 'lifeOnBlockerDestroyed':
      if (s.battle?.attackerId === self && holds(step.if)) {
        if (step.onlyConsecutiveBlade) s.battle.lifeOnBlockerDestroyedByBlade += step.amount;
        else s.battle.lifeOnBlockerDestroyed += step.amount;
      }
      return;

    case 'soulToTrash': {
      const card = s.cards[self]!;
      const soul = card.cores.find((id) => s.cores[id]!.isSoul);
      if (!soul || !onField(ctx, self)) return;
      card.cores.splice(card.cores.indexOf(soul), 1);
      s.players[me].trashCores.push(soul);
      emit(ctx, { type: 'soulToTrash', cardId: self });
      return;
    }

    case 'consecutiveBlade':
      // ใช้ร่วมกับตีระบุ: ไม่เกิดผล (กติกา 14 Consecutive Blade ข้อควรรู้ 4)
      if (s.battle?.attackerId === self && !s.battle.direct) {
        s.battle.mustBlockBeforeBlade = s.battle.mustBlock;
        s.battle.consecutiveBlade = true;
        s.battle.maxBlockers = 2;
        s.battle.mustBlock = true;
        emit(ctx, { type: 'consecutiveBlade', cardId: self });
        blockKeywordActivated(ctx, me);
      }
      return;

    case 'chooseBlockers': {
      const battle = s.battle;
      if (!battle || battle.step !== 'flashBeforeBlock' || s.turnPlayer !== me) return;
      if (battle.chosenBlockers.length >= battle.maxBlockers) return;
      const candidates = s.players[opponentOf(me)].field.filter(
        (id) =>
          isSpiritLike(db.get(s.cards[id]!.cardNo)) && !battle.chosenBlockers.includes(id) && (!step.filter || matchesFilter(s, db, id, step.filter)) && hits(id),
      );
      if (candidates.length === 0) return;
      const left = battle.maxBlockers - battle.chosenBlockers.length;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกสปิริตของคู่แข่งที่จะป้องกัน (เหลือ ${left} ตัว, เลือกตัวที่เสื่อมสภาพได้)`,
        candidates,
        optional: true,
        step,
      });
      return;
    }

    case 'discard': {
      const hand = handCards(s, me).filter((id) => !step.filter || matchesFilter(s, db, id, step.filter));
      if (step.count < 1 || hand.length === 0 || !holds(step.if)) return;
      ask(ctx, item, { kind: 'card', prompt: step.filter ? 'เลือกการ์ดบนมือ 1 ใบที่จะทิ้ง (ตามเงื่อนไข)' : 'เลือกการ์ดบนมือ 1 ใบที่จะทิ้ง', candidates: hand, step });
      return;
    }

    case 'openBurst': {
      const p = s.players[me];
      if (p.burst !== item.sourceId) return;
      p.burst = null;
      item.trashWhenDone = true;
      item.isBurst = true;
      emit(ctx, { type: 'burstActivated', player: me, cardId: item.sourceId });
      emit(ctx, { type: 'effectResolving', player: me, cardId: item.sourceId, source: null });
      // "การ์ดนี้ในมือ, หลังจากเบิร์สของคู่แข่งถูกสั่งใช้" (ทำงานหลังเบิร์สนี้)
      {
        const batch = newBatch(ctx);
        for (const id of [...s.players[opp].hand]) queueTriggers(ctx, id, 'oppBurstActivated', batch);
      }
      return;
    }

    case 'gainLifeFromVoid':
      for (let i = 0; i < step.count; i++) s.players[me].life.push(newCore(ctx, me));
      emit(ctx, { type: 'lifeGained', player: me, amount: step.count });
      return;

    case 'payToUseFlash': {
      const def = db.get(s.cards[item.sourceId]!.cardNo);
      if (!def.abilities.some((a) => a.kind === 'magic' && a.timing === 'flash')) return;
      const cost = payableCost(s, db, me, def);
      ask(ctx, item, { kind: 'payCost', prompt: `จ่ายคอสต์ ${cost} เพื่อใช้เอฟเฟกต์ [Flash] ของ ${def.name}?`, cost, step });
      return;
    }

    case 'refreshSelf':
      if (onField(ctx, self) && s.cards[self]!.state !== 'refresh') {
        s.cards[self]!.state = 'refresh';
        emit(ctx, { type: 'cardRefreshed', cardId: self });
      }
      return;

    case 'destroyChosenOpponent': {
      if (!holds(step.if)) return;
      if (!step.anySide && disperse(step.count ?? 1, step)) return;
      // BP ไม่เกิน BP ของสปิริตนี้ / BP ที่ Lv1 ของสปิริตต้นเหตุ
      let filter = step.filter;
      if (step.bpFrom === 'self') {
        if (!onField(ctx, self)) return;
        filter = { ...filter, maxBp: currentBp(s, db, self) };
      } else if (step.bpFrom === 'subjectLv1') {
        const subject = item.subjectId ? s.cards[item.subjectId] : undefined;
        if (!subject) return;
        filter = { ...filter, maxBp: db.get(subject.cardNo).levels[0]?.bp ?? 0 };
      }
      if (step.costFrom === 'self') {
        if (!onField(ctx, self)) return;
        filter = { ...filter, maxCost: fieldCost(s, db, self) };
      }
      if (step.costFrom === 'subject') {
        if (!item.subjectId || !s.cards[item.subjectId]) return;
        filter = { ...filter, maxCost: fieldCost(s, db, item.subjectId) };
      }
      // เลือกหลายตัว = คนละตัว (ตัวที่รอดด้วยเอฟเฟกต์แทนที่ไม่ถูกเลือกซ้ำ)
      const pool = step.anySide ? [...s.players[me].field, ...s.players[opponentOf(me)].field] : s.players[opponentOf(me)].field;
      const candidates = pool.filter((id) => matchesFilter(s, db, id, filter) && !step.exclude?.includes(id) && hits(id));
      if (candidates.length === 0) return;
      const n = step.count ?? 1;
      const whose = step.anySide ? '' : 'ของคู่แข่ง';
      ask(ctx, item, { kind: 'card', prompt: n > 1 ? `เลือกการ์ด${whose}ที่จะทำลาย (อีก ${n} ตัว)` : `เลือกการ์ด${whose} 1 ใบที่จะทำลาย`, candidates, step });
      return;
    }

    case 'destroyHighestCostOpponent': {
      const pool = s.players[opp].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter) && hits(id));
      if (pool.length === 0) return;
      // คอสต์บนสนาม: สปิริตที่ร่วมร่างกับ Brave = คอสต์สปิริต + คอสต์ Brave
      const costOf = (id: string) => fieldCost(s, db, id);
      const max = Math.max(...pool.map(costOf));
      const candidates = pool.filter((id) => costOf(id) === max);
      if (candidates.length === 1) {
        destroyCard(ctx, candidates[0]!, me, { bySource: item.sourceId, effect: true });
        return;
      }
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตคอสต์สูงสุด (${max}) ของคู่แข่งที่จะทำลาย`, candidates, step });
      return;
    }

    case 'mill': {
      const n = step.count === 'level' ? (onField(ctx, self) ? cardLevel(s, db, self) : 0) : step.count;
      const ids = s.players[opp].deck.slice(0, n);
      item.milled = ids;
      if (ids.length === 0) return;
      mill(ctx, opp, ids);
      queueMillTriggers(ctx, item, ids);
      // การ์ดที่ถูกทิ้ง: "เมื่อถูกทิ้งโดยเอฟเฟกต์ทิ้งเด็คของคู่แข่ง" (วันโคมะ)
      queueRightAfterCurrent(ctx, () => {
        const batch = newBatch(ctx);
        for (const id of ids) queueTriggers(ctx, id, 'milledByOpponent', batch);
      });
      return;
    }

    case 'trashToDeckBottom': {
      const p = s.players[me];
      // การ์ดที่ไม่รับผลเอฟเฟกต์ (เทปเปคิวอลล์) อยู่ในแทรชต่อ
      const ids = p.trashCards.filter(inTrashOk);
      if (ids.length === 0) return;
      p.trashCards = p.trashCards.filter((id) => !ids.includes(id));
      p.deck.push(...ids);
      item.steps.unshift({ do: 'toDeckBottom', cardIds: ids });
      return;
    }

    case 'summonFromHandFree': {
      if (!holds(step.if)) return;
      const candidates = s.players[me].hand.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดบนมือที่จะอัญเชิญไม่จ่ายคอสต์', candidates, optional: true, skipLabel: 'ไม่อัญเชิญ', step });
      return;
    }

    case 'debuffChosenOpponent': {
      if (!holds(step.if)) return;
      const n = step.countPerAllyFamily
        ? s.players[me].field.filter((id) => spiritLike(id) && db.get(s.cards[id]!.cardNo).family.includes(step.countPerAllyFamily!)).length
        : (step.count ?? 1);
      if (n <= 0) return;
      if (!step.countPerAllyFamily && disperse(n, step)) return;
      const candidates = s.players[opp].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter) && !step.exclude?.includes(id) && hits(id));
      if (candidates.length === 0) return;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกสปิริตของคู่แข่งที่จะ BP-${step.amount.toLocaleString()} (อีก ${n} ตัว)`,
        candidates,
        step: { ...step, count: n, countPerAllyFamily: undefined, if: undefined },
      });
      return;
    }

    case 'opponentCannotAttack':
      if (!holds(step.if)) return;
      s.attackBans = [...(s.attackBans ?? []), { player: opp, turn: s.turn, types: step.types }];
      emit(ctx, { type: 'attackBanned', player: opp });
      return;

    case 'ifMilled':
      if ((item.milled ?? []).some((id) => matchesFilter(s, db, id, step.filter))) item.steps.unshift(...step.steps);
      return;

    case 'millPerDestroyedCost': {
      let total = 0;
      for (let i = item.logStart ?? 0; i < s.log.length; i++) {
        const e = s.log[i]!;
        if (e.type === 'destroyed' && e.bySource === item.sourceId && s.cards[e.cardId]!.owner === opp) total += e.cost ?? db.get(s.cards[e.cardId]!.cardNo).cost;
      }
      if (total > 0) item.steps.unshift({ do: 'mill', count: total });
      return;
    }

    case 'discardOpponentBurst': {
      const id = s.players[opp].burst;
      if (!id) return;
      s.players[opp].burst = null;
      s.players[opp].trashCards.push(id);
      emit(ctx, { type: 'burstDiscarded', player: opp, cardId: id });
      item.burstDiscarded = true;
      return;
    }

    case 'refreshSubject': {
      const id = item.subjectId;
      if (!id || !onField(ctx, id) || !holds(step.if) || s.cards[id]!.state === 'refresh') return;
      s.cards[id]!.state = 'refresh';
      emit(ctx, { type: 'cardRefreshed', cardId: id });
      return;
    }

    case 'summonFromHand': {
      const candidates = s.players[me].hand.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดบนมือที่จะอัญเชิญ (จ่ายคอสต์)', candidates, optional: true, skipLabel: 'ไม่อัญเชิญ', step });
      return;
    }

    case 'opponentDiscards': {
      if (!holds(step.if) || handImmune(s, db, opp)) return;
      if (step.perHandIncrease) {
        const n = step.count * (item.handIncrease ?? 0);
        if (n > 0) item.steps.unshift({ ...step, count: n, perHandIncrease: undefined });
        return;
      }
      const hand = handCards(s, opp);
      if (step.count < 1 || hand.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดบนมือ 1 ใบที่จะทิ้ง (เอฟเฟกต์ของคู่แข่ง)', candidates: [...hand], step }, opp);
      return;
    }

    case 'ifDepletedSoul':
      if (item.depletedSoul) item.steps.unshift(...step.steps);
      return;

    case 'opponentReserveToTrash': {
      const p = s.players[opp];
      if (p.reserve.length === 0) return;
      p.trashCores.push(...p.reserve);
      p.reserve = [];
      return;
    }

    case 'refreshOnBattleWin':
      if (s.battle?.attackerId === self && holds(step.if)) s.battle.refreshOnWin = [...(s.battle.refreshOnWin ?? []), self];
      return;

    case 'lifeOnBattlerGone':
      if (s.battle?.attackerId === self) s.battle.lifeOnBattlerGone = { amount: step.amount, to: step.to };
      return;

    case 'addDrawStepDraw':
      if (s.phase === 'draw') s.drawStepExtra = (s.drawStepExtra ?? 0) + step.amount;
      return;

    case 'restrictBlockers':
      if (s.battle) s.battle.blockFilter = step.filter;
      return;

    case 'battleNoFlash':
      if (s.battle) s.battle.noFlash = opp;
      return;

    case 'battleNoBurst':
      if (s.battle && holds(step.if)) s.battle.noBurst = opp;
      return;

    case 'opponentNexusCoresToTrash':
      for (const id of s.players[opp].field) {
        const card = s.cards[id]!;
        if (db.get(card.cardNo).type !== 'nexus' || card.cores.length === 0) continue;
        const n = card.cores.length;
        s.players[opp].trashCores.push(...card.cores);
        card.cores = [];
        emit(ctx, { type: 'coresRemoved', cardId: id, count: n, to: 'trash' });
      }
      return;

    case 'turnTrigger':
      s.turnTriggers = [...(s.turnTriggers ?? []), { player: me, turn: s.turn, on: step.on, steps: step.steps, sourceId: item.sourceId, paidWithSoul: item.paidWithSoul }];
      return;

    case 'subjectToHand': {
      const id = item.subjectId;
      if (!id || !s.players[me].trashCards.includes(id) || !holds(step.if)) return;
      removeFrom(s.players[me].trashCards, id);
      s.players[me].hand.push(id);
      emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'trash' });
      return;
    }

    case 'exhaustOwn': {
      const f = step.filter;
      const candidates = s.players[me].field.filter(
        (id) => (f.types || spiritLike(id)) && s.cards[id]!.state === 'refresh' && matchesFilter(s, db, id, f),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดของเราที่จะเสื่อมสภาพ', candidates, step });
      return;
    }

    case 'summonFromTrash': {
      const candidates = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรชที่จะอัญเชิญ (จ่ายคอสต์)', candidates, optional: true, skipLabel: 'ไม่อัญเชิญ', step });
      return;
    }

    case 'payForSummon': {
      if (!s.players[me].hand.includes(step.cardId) && !s.players[me].trashCards.includes(step.cardId)) return;
      if (step.cost === 0) {
        item.steps.unshift({ do: 'placeCores', cardId: step.cardId });
        return;
      }
      const name = db.get(s.cards[step.cardId]!.cardNo).name;
      ask(ctx, item, { kind: 'payCost', prompt: `จ่ายคอสต์ ${step.cost} เพื่ออัญเชิญ ${name}?`, cost: step.cost, step });
      return;
    }

    case 'destroyCard':
      if (onField(ctx, step.cardId)) destroyCard(ctx, step.cardId, step.by, { ...(step.bySource ? { bySource: step.bySource } : {}), effect: true, noReplace: true });
      return;

    case 'destroyedButStays': {
      // เอฟเฟกต์ "สามารถ…เพื่อคงอยู่" แยกจากเอฟเฟกต์ "เมื่อถูกทำลาย" อื่น: เจ้าของเทิร์นเรียง (ดู stayDestroyed)
      const owner = s.cards[step.cardId]!.owner;
      stayDestroyed(ctx, step.cardId, step.by, step.bySource, step.state ?? 'exhausted', owner === s.turnPlayer);
      return;
    }

    case 'exhaustCard':
      if (onField(ctx, step.cardId)) {
        s.cards[step.cardId]!.state = 'exhausted';
        emit(ctx, { type: 'exhausted', cardId: step.cardId });
      }
      return;

    case 'chooseOne': {
      if (!holds(step.if)) return;
      // ตัวเลือกที่ทำไม่ได้ (เช่น "สามารถ X เพื่อ Y" ที่ทำได้ไม่ครบสองท่อน) ไม่แสดง
      const options = step.options.filter((o) => holds(o.if));
      if (!options.some((o) => o.steps.length > 0)) return;
      ask(ctx, item, { kind: 'option', prompt: 'เลือก 1 อย่าง', options: options.map((o) => o.label), step: { ...step, options } });
      return;
    }
  }
}

/** สปิริตของผู้เล่นที่ Brave ใบนี้ร่วมร่างได้ (คอสต์ถึง, ยังไม่มี Brave) */
function braveHostsFor(ctx: Ctx, player: PlayerId, braveId: string): string[] {
  const min = ctx.db.get(ctx.s.cards[braveId]!.cardNo).braveCondition?.minCost ?? 0;
  return ctx.s.players[player].field.filter((id) => {
    const host = ctx.s.cards[id]!;
    const def = ctx.db.get(host.cardNo);
    return def.type === 'spirit' && def.cost >= min && host.braves.length === 0;
  });
}

/** Core ที่ผู้เล่นใช้วางได้: ในรีเสิร์ฟ และบนการ์ดในสนามของตัวเอง */
function usableCores(ctx: Ctx, player: PlayerId): string[] {
  const p = ctx.s.players[player];
  return [...p.reserve, ...p.field.flatMap((id) => ctx.s.cards[id]!.cores)];
}

function addVoidCores(ctx: Ctx, player: PlayerId, cardId: string, count: number): void {
  for (let i = 0; i < count; i++) ctx.s.cards[cardId]!.cores.push(newCore(ctx, player));
  emit(ctx, { type: 'voidCore', player, cardId, count });
}

function toBottom(ctx: Ctx, player: PlayerId, cardId: string): void {
  const deck = ctx.s.players[player].deck;
  removeFrom(deck, cardId);
  deck.push(cardId);
  emit(ctx, { type: 'cardsToDeckBottom', player, cardIds: [cardId] });
}

/** นำการ์ดออกจากที่อยู่เดิม (เด็ค/มือ/แทรช/ช่อง Burst) ถ้ามี */
function detach(ctx: Ctx, player: PlayerId, cardId: string): 'deck' | 'hand' | 'burst' | 'trash' | 'other' {
  const p = ctx.s.players[player];
  if (p.deck.includes(cardId)) {
    removeFrom(p.deck, cardId);
    return 'deck';
  }
  if (p.hand.includes(cardId)) {
    removeFrom(p.hand, cardId);
    return 'hand';
  }
  if (p.trashCards.includes(cardId)) {
    removeFrom(p.trashCards, cardId);
    return 'trash';
  }
  if (p.burst === cardId) {
    p.burst = null;
    return 'burst';
  }
  return 'other';
}

/** วางการ์ดลงสนามพร้อม Core (อัญเชิญไม่จ่ายคอสต์ / Brave ที่อยู่ต่อ) แล้วยิง trigger "ถูกอัญเชิญ" */
function putOnField(ctx: Ctx, item: QueuedEffect, step: Extract<Step, { do: 'placeCores' }>, cores: string[]): void {
  const { s } = ctx;
  const me = item.controller;
  const card = s.cards[step.cardId]!;
  const from = detach(ctx, me, step.cardId);
  for (const id of cores) removeCore(s, id);
  // กันการ์ดใบเดียวอยู่บนสนามซ้ำ
  if (!s.players[me].field.includes(step.cardId)) s.players[me].field.push(step.cardId);
  card.cores = [...cores];
  card.state = step.state ?? 'refresh';
  if (step.noSummon) {
    emit(ctx, { type: 'braveSeparated', cardId: step.cardId, stays: true });
    // สปิริตรวมร่างที่โจมตีหายไปในแฟลชหลังโจมตี แล้วเลือกให้เบรฟอยู่ต่อ: เบรฟโจมตีต่อในรูปแบบเสื่อมสภาพ (กติกา 04 ข้อ 3)
    const battle = s.battle;
    if (step.continuesAttackOf && battle && battle.attackerId === step.continuesAttackOf && battle.step === 'flashBeforeBlock' && battle.flash) {
      battle.attackerId = step.cardId;
      card.state = 'exhausted';
    }
    return;
  }
  emit(ctx, { type: 'summoned', player: me, cardId: step.cardId, paid: 0, from: from === 'other' && item.sourceId === step.cardId ? 'burst' : from });
  // trigger ของการ์ดที่ลงสนามทำงานหลังเอฟเฟกต์นี้จบ
  queueSummonTriggers(ctx, step.cardId, newBatch(ctx), { fromTrash: from === 'trash', from });
}

/**
 * อัญเชิญการ์ดที่แสดงจากเด็คหลายใบพร้อมกัน: ตรวจทั้งหมดก่อน แล้วลงสนามพร้อมกัน
 * trigger "ถูกอัญเชิญ" ของทุกใบ (ที่ไม่ได้ร่วมร่าง) อยู่ในกลุ่มเดียวกัน เจ้าของเลือกลำดับได้
 */
function multiSummon(ctx: Ctx, player: PlayerId, choice: Extract<PendingChoice, { kind: 'multiSummon' }>, pick: ChoicePick): void {
  const { s, db } = ctx;
  const picks = typeof pick === 'object' && pick !== null && 'summons' in pick ? pick.summons : null;
  if (!picks) fail('INVALID_PICK', 'ต้องส่งรายการการ์ดที่จะอัญเชิญ');
  if (choice.max !== null && picks.length > choice.max) fail('TOO_MANY', `อัญเชิญได้สูงสุด ${choice.max} ใบ`);
  const usedCards = new Set<string>();
  const usedCores = new Set<string>();
  const usedHosts = new Set<string>();
  for (const pk of picks) {
    if (!choice.candidates.includes(pk.cardId) || usedCards.has(pk.cardId)) fail('INVALID_PICK', 'เลือกการ์ดนี้ไม่ได้');
    usedCards.add(pk.cardId);
    const def = db.get(s.cards[pk.cardId]!.cardNo);
    if (pk.braveOnto) {
      if (def.type !== 'brave') fail('WRONG_CARD_TYPE', 'ร่วมร่างได้เฉพาะ Brave');
      if (usedHosts.has(pk.braveOnto) || !braveHostsFor(ctx, player, pk.cardId).includes(pk.braveOnto)) {
        fail('INVALID_HOST', `${def.name} ร่วมร่างกับสปิริตนี้ไม่ได้`);
      }
      usedHosts.add(pk.braveOnto);
      continue;
    }
    const cores = pk.cores ?? [];
    for (const id of cores) {
      if (usedCores.has(id)) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
      assertUsableCore(ctx, player, id);
      usedCores.add(id);
    }
    if (cores.length < minCores(def)) fail('NOT_ENOUGH_CORES', `${def.name} ต้องวาง Core อย่างน้อย ${minCores(def)} ดวง`);
  }

  const summoned: string[] = [];
  for (const pk of picks) {
    const card = s.cards[pk.cardId]!;
    removeFrom(s.players[player].deck, pk.cardId);
    if (pk.braveOnto) {
      const host = s.cards[pk.braveOnto]!;
      host.braves.push(pk.cardId);
      card.cores = [];
      card.state = host.state;
      emit(ctx, { type: 'summoned', player, cardId: pk.cardId, paid: 0, from: 'deck' });
      emit(ctx, { type: 'braved', cardId: pk.cardId, hostId: pk.braveOnto });
      continue;
    }
    for (const id of pk.cores ?? []) removeCore(s, id);
    s.players[player].field.push(pk.cardId);
    card.cores = [...(pk.cores ?? [])];
    card.state = 'refresh';
    emit(ctx, { type: 'summoned', player, cardId: pk.cardId, paid: 0, from: 'deck' });
    summoned.push(pk.cardId);
  }
  const batch = newBatch(ctx);
  for (const id of summoned) queueSummonTriggers(ctx, id, batch, { from: 'deck' });
  const rest = choice.revealed.filter((id) => !usedCards.has(id));
  const restStep = choice.step.do === 'revealSummon' ? choice.step.rest : undefined;
  if (rest.length > 0 && restStep === 'trash') mill(ctx, player, rest);
  else if (rest.length > 0) s.queue[0]!.steps.unshift({ do: 'toDeckBottom', cardIds: rest });
}

function mill(ctx: Ctx, player: PlayerId, cardIds: string[]): void {
  const p = ctx.s.players[player];
  for (const id of cardIds) {
    removeFrom(p.deck, id);
    p.trashCards.push(id);
  }
  emit(ctx, { type: 'milled', player, cardIds });
}

/** action `choose`: ทำ step ที่รออยู่ให้จบด้วยตัวเลือกของผู้เล่น แล้วเดินคิวต่อ */
export function resolveChoice(ctx: Ctx, player: PlayerId, pick: ChoicePick): void {
  const { s } = ctx;
  const choice = s.choice;
  if (!choice) fail('NO_CHOICE', 'ไม่มีอะไรให้เลือก');
  if (choice.player !== player) fail('NOT_YOUR_CHOICE', 'ยังไม่ถึงตาคุณเลือก');
  if (choice.kind === 'order') {
    if (typeof pick !== 'number' || !choice.effects[pick]) fail('INVALID_PICK', 'ตัวเลือกไม่ถูกต้อง');
    const [chosen] = s.queue.splice(pick, 1);
    s.queue.unshift(chosen!);
    s.choice = null;
    startEffect(ctx, chosen!);
    runQueue(ctx);
    return;
  }
  const step = choice.step;
  /** เอฟเฟกต์ที่ถามอยู่ (ต้องจับไว้ก่อน: การทำลายอาจแทรกเอฟเฟกต์แทนที่ไว้หน้าคิว) */
  const cur = s.queue[0]!;

  if (choice.kind === 'multiSummon') {
    multiSummon(ctx, player, choice, pick);
    s.choice = null;
    runQueue(ctx);
    return;
  }

  if (choice.kind === 'placeCores') {
    const cores = typeof pick === 'object' && pick !== null && 'pay' in pick ? pick.pay : null;
    if (!cores) fail('INVALID_PICK', 'ต้องส่ง Core ที่จะวาง');
    if (new Set(cores).size !== cores.length) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
    for (const id of cores) assertUsableCore(ctx, player, id);
    if (cores.length < choice.min) fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${choice.min} ดวง`);
    if (step.do !== 'placeCores') throw new Error('placeCores');
    putOnField(ctx, s.queue[0]!, step, cores);
    s.choice = null;
    runQueue(ctx);
    return;
  }

  if (choice.kind === 'payCost' && step.do === 'payForSummon') {
    if (pick !== null) {
      if (typeof pick !== 'object' || !('pay' in pick)) fail('INVALID_PICK', 'ต้องส่ง Core ที่จะจ่าย หรือ null เพื่อไม่จ่าย');
      if (pick.pay.length !== step.cost) fail('WRONG_PAYMENT', `ต้องจ่าย Core ${step.cost} ดวง`);
      if (new Set(pick.pay).size !== pick.pay.length) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
      for (const id of pick.pay) assertUsableCore(ctx, player, id);
      for (const id of pick.pay) {
        removeCore(s, id);
        s.players[player].trashCores.push(id);
      }
      emit(ctx, { type: 'costPaid', player, cardId: step.cardId, paid: step.cost });
      cur.steps.unshift({ do: 'placeCores', cardId: step.cardId });
    }
  } else if (choice.kind === 'payCost') {
    const item = cur;
    if (pick !== null) {
      if (typeof pick !== 'object' || !('pay' in pick)) fail('INVALID_PICK', 'ต้องส่ง Core ที่จะจ่าย หรือ null เพื่อไม่จ่าย');
      const def = ctx.db.get(s.cards[choice.sourceId]!.cardNo);
      const { paid } = payCost(ctx, player, def, pick.pay, []);
      emit(ctx, { type: 'costPaid', player, cardId: choice.sourceId, paid });
      item.paidWithSoul = pick.pay.some((id) => s.cores[id]!.isSoul);
      const flash = def.abilities.flatMap((a) => (a.kind === 'magic' && a.timing === 'flash' ? a.steps : []));
      item.steps.unshift(...flash);
      // จ่าย Flash ของการ์ดนี้ (เช่น หลังเปิด Burst) = ต่อ Chain อีกข้อ
      const flashText = (def.effects as { timing?: string }[]).findIndex((x) => x.timing === 'flash');
      emit(ctx, { type: 'effectResolving', player, cardId: choice.sourceId, source: flashText >= 0 ? flashText : null });
    }
  } else if (choice.kind === 'option') {
    if (step.do !== 'chooseOne' || typeof pick !== 'number' || !step.options[pick]) fail('INVALID_PICK', 'ตัวเลือกไม่ถูกต้อง');
    const option = step.options[pick]!;
    cur.steps.unshift(...option.steps);
    emit(ctx, { type: 'optionChosen', player, option: option.label });
  } else {
    if (pick === null && choice.optional) {
      // ไม่อัญเชิญเพิ่ม: ที่เหลือไว้ใต้สุดเด็ค
      if (step.do === 'braveOrSpirit') cur.steps.unshift({ do: 'placeCores', cardId: step.cardId, asSpirit: true });
      s.choice = null;
      runQueue(ctx);
      return;
    }
    if (typeof pick !== 'string' || !choice.candidates.includes(pick)) fail('INVALID_PICK', 'เลือกการ์ดนี้ไม่ได้');
    const p = s.players[player];
    switch (step.do) {
      case 'chooseBlockers':
        s.battle!.chosenBlockers.push(pick);
        if (step.direct) {
          const b = s.battle!;
          b.skipFlash1 = true;
          b.direct = true;
          // ตีระบุหลัง [Consecutive Blade]: Consecutive Blade ไม่เกิดผล (ป้องกันตัวเดียวตามปกติ)
          if (b.consecutiveBlade) {
            b.consecutiveBlade = false;
            b.maxBlockers = 1;
            b.mustBlock = b.mustBlockBeforeBlade ?? false;
          }
        }
        emit(ctx, { type: 'blockerChosen', cardId: pick });
        cur.steps.unshift({ do: 'chooseBlockers', ...(step.filter ? { filter: step.filter } : {}) }); // เลือกตัวถัดไปถ้ายังเลือกได้
        break;
      case 'buffChosen':
        addTurnBp(ctx, pick, step.amount);
        break;
      case 'revealPickRestTrash':
        removeFrom(p.deck, pick);
        p.hand.push(pick);
        emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'deck' });
        handIncreasedByEffect(ctx, player);
        if (step.rest === 'bottom') cur.steps.unshift({ do: 'toDeckBottom', cardIds: (choice.revealed ?? []).filter((id) => id !== pick) });
        else mill(ctx, player, (choice.revealed ?? []).filter((id) => id !== pick));
        break;
      case 'destroyChosenOpponent':
        recordDestroyed(ctx, cur, pick);
        destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
        if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: (step.count ?? 1) - 1, exclude: [...(step.exclude ?? []), pick] });
        break;
      case 'destroyHighestCostOpponent':
        destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
        break;
      case 'summonFromHandFree':
      case 'summonFromTrashFree':
        cur.steps.unshift({ do: 'placeCores', cardId: pick });
        break;
      case 'destroyOpponentBrave': {
        // Brave ที่ร่วมร่างอยู่: ออกจากผู้ร่วมร่างลง Trash ของเจ้าของ (ผู้ร่วมร่างอยู่ต่อ)
        const owner = s.cards[pick]!.owner;
        for (const id of s.players[owner].field) removeFrom(s.cards[id]!.braves, pick);
        s.players[owner].trashCards.push(pick);
        emit(ctx, { type: 'destroyed', cardId: pick, bySource: cur.sourceId });
        if (owner !== player) pendBurst(ctx, owner, 'afterAllyDestroyedByOpponent');
        break;
      }
      case 'opponentDestroysOwn':
        // คู่แข่งเป็นคนเลือก แต่ถูกทำลายโดยเอฟเฟกต์ของเรา
        destroyCard(ctx, pick, cur.controller, { bySource: cur.sourceId, effect: true });
        break;
      case 'debuffChosenOpponent': {
        s.cards[pick]!.turnBp -= step.amount;
        emit(ctx, { type: 'bpBuffed', cardId: pick, amount: -step.amount });
        const rest = (step.count ?? 1) - 1;
        if (rest > 0) cur.steps.unshift({ ...step, count: rest, exclude: [...(step.exclude ?? []), pick] });
        if (currentBp(s, ctx.db, pick) <= 0) destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
        break;
      }
      case 'summonFromHand': {
        const def = ctx.db.get(s.cards[pick]!.cardNo);
        const full = step.fullReductionIf && conditionHoldsFor(ctx, cur, step.fullReductionIf);
        const reduce = Object.values(def.reduction).reduce<number>((n, v) => n + (v ?? 0), 0);
        const cost = full ? Math.max(0, def.cost - reduce) : payableCost(s, ctx.db, player, def);
        cur.steps.unshift({ do: 'payForSummon', cardId: pick, cost });
        break;
      }
      case 'exhaustOwn':
        s.cards[pick]!.state = 'exhausted';
        emit(ctx, { type: 'exhausted', cardId: pick });
        queueExhaustTriggers(ctx, pick);
        break;
      case 'summonFromTrash': {
        const def = ctx.db.get(s.cards[pick]!.cardNo);
        const cost = payableCost(s, ctx.db, player, def, baseCost(s, ctx.db, pick));
        cur.steps.unshift({ do: 'payForSummon', cardId: pick, cost }, ...(step.repeat ? [step] : []));
        break;
      }
      case 'exhaustOpponent':
        s.cards[pick]!.state = 'exhausted';
        emit(ctx, { type: 'exhausted', cardId: pick });
        if (step.lockRefresh) s.refreshLocks = [...(s.refreshLocks ?? []), pick];
        queueExhaustTriggers(ctx, pick);
        if (step.count > 1) cur.steps.unshift({ ...step, count: step.count - 1, if: undefined });
        break;
      case 'removeOpponentCores': {
        // ส่งคอร์ออก (เจ้าของการ์ดเลือกได้ว่าจะส่ง Soul Core หรือไม่: coresOff) แล้วค่อยเลือกตัวถัดไป
        const card = s.cards[pick]!;
        const n = step.untilOne ? Math.max(0, card.cores.length - 1) : Math.min(step.perPick ?? 1, card.cores.length);
        if (!step.untilOne && step.count > 1) cur.steps.unshift({ ...step, count: step.count - 1, if: undefined });
        cur.steps.unshift({ do: 'coresOff', cardId: pick, n, to: step.to ?? 'reserve', byOpponent: true });
        break;
      }
      case 'exhaustOpponentTotalBp': {
        const bp = currentBp(s, ctx.db, pick);
        s.cards[pick]!.state = 'exhausted';
        emit(ctx, { type: 'exhausted', cardId: pick });
        cur.steps.unshift({ do: 'exhaustOpponentTotalBp', maxTotal: step.maxTotal - bp });
        break;
      }
      case 'bounceOpponent':
        returnCard(ctx, pick, step.to === 'deckBottom' ? 'deckBottom' : step.to === 'deckTop' ? 'deckTop' : 'hand');
        if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: (step.count ?? 1) - 1, if: undefined });
        break;
      case 'unblockableThisTurn':
        s.unblockableTurn = [...(s.unblockableTurn ?? []).filter((u) => u.turn === s.turn), { cardId: pick, turn: s.turn }];
        if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: (step.count ?? 1) - 1 });
        break;
      case 'useMagicFromHandFree': {
        const def = ctx.db.get(s.cards[pick]!.cardNo);
        removeFrom(p.hand, pick);
        emit(ctx, { type: 'magicUsed', player, cardId: pick, paid: 0, timing: 'flash' });
        const steps = def.abilities.flatMap((a) => (a.kind === 'magic' && a.timing === 'flash' ? a.steps : []));
        // ทำงานต่อจากเอฟเฟกต์นี้ทันที แล้วเมจิคลงแทรช
        s.queue.splice(1, 0, { controller: player, sourceId: pick, steps: [...steps], paidWithSoul: false, trashWhenDone: true });
        queueMagicUsedTriggers(ctx, player, pick);
        break;
      }
      case 'showFromHand':
        s.shownCards = [...(s.shownCards ?? []), pick];
        emit(ctx, { type: 'cardShown', player, cardId: pick });
        break;
      case 'allySoulToTrash': {
        const card = s.cards[pick]!;
        const soul = card.cores.find((c) => s.cores[c]!.isSoul);
        if (soul) {
          card.cores = card.cores.filter((c) => c !== soul);
          p.trashCores.push(soul);
          emit(ctx, { type: 'soulToTrash', cardId: pick });
        }
        break;
      }
      case 'voidCore':
        addVoidCores(ctx, player, pick, step.count);
        break;
      case 'braveOrSpirit': {
        // ร่วมร่างทันที: ไม่วาง Core และ "เมื่อเบรฟนี้ถูกอัญเชิญ" ไม่ทำงาน
        const from = detach(ctx, player, step.cardId);
        const host = s.cards[pick]!;
        const brave = s.cards[step.cardId]!;
        host.braves.push(step.cardId);
        brave.cores = [];
        brave.state = host.state;
        emit(ctx, { type: 'summoned', player, cardId: step.cardId, paid: 0, from });
        emit(ctx, { type: 'braved', cardId: step.cardId, hostId: pick });
        break;
      }
      case 'toDeckBottom':
        toBottom(ctx, player, pick);
        cur.steps.unshift({ do: 'toDeckBottom', cardIds: step.cardIds.filter((id) => id !== pick) });
        break;
      case 'refreshChosenAlly': {
        s.cards[pick]!.state = 'refresh';
        emit(ctx, { type: 'cardRefreshed', cardId: pick });
        if (step.sameNameIf && conditionHoldsFor(ctx, cur, step.sameNameIf)) {
          const name = ctx.db.get(s.cards[pick]!.cardNo).name;
          for (const id of p.field) {
            if (id === pick || s.cards[id]!.state !== 'exhausted' || ctx.db.get(s.cards[id]!.cardNo).name !== name) continue;
            s.cards[id]!.state = 'refresh';
            emit(ctx, { type: 'cardRefreshed', cardId: id });
          }
        }
        break;
      }
      case 'setBurstFromHand': {
        const replaced = p.burst;
        if (replaced) p.trashCards.push(replaced);
        removeFrom(p.hand, pick);
        p.burst = pick;
        emit(ctx, { type: 'burstSet', player, replacedCardId: replaced });
        break;
      }
      case 'opponentDiscards':
        removeFrom(p.hand, pick);
        p.trashCards.push(pick);
        emit(ctx, { type: 'discarded', player, cardId: pick });
        if (step.count > 1) cur.steps.unshift({ ...step, count: step.count - 1, if: undefined });
        break;
      case 'discard':
        removeFrom(p.hand, pick);
        p.trashCards.push(pick);
        emit(ctx, { type: 'discarded', player, cardId: pick });
        if (step.count > 1) cur.steps.unshift({ do: 'discard', count: step.count - 1, ...(step.filter ? { filter: step.filter } : {}) });
        break;
      case 'returnFromTrash':
        removeFrom(p.trashCards, pick);
        p.hand.push(pick);
        emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'trash' });
        handIncreasedByEffect(ctx, player);
        break;
      default:
        throw new Error(`step ${step.do} ไม่ได้ใช้การเลือกการ์ด`);
    }
  }

  s.choice = null;
  runQueue(ctx);
}

/** จำการ์ดที่เอฟเฟกต์นี้ทำลาย (BP ก่อนออกจากสนาม) */
function recordDestroyed(ctx: Ctx, item: QueuedEffect, cardId: string): void {
  const def = ctx.db.get(ctx.s.cards[cardId]!.cardNo);
  (item.destroyedByThis ??= []).push({ bp: currentBp(ctx.s, ctx.db, cardId), type: def.type, opponent: ctx.s.cards[cardId]!.owner !== item.controller });
}

/** ตรวจเงื่อนไขในบริบทของเอฟเฟกต์ (การ์ดที่ออกจากสนามแล้วใช้สภาพ Soul Core ตอนเกิด trigger) */
function conditionHoldsFor(ctx: Ctx, item: QueuedEffect, cond: Parameters<typeof conditionHolds>[2]): boolean {
  if (cond && 'soulOnSelf' in cond && item.soulSnapshot !== undefined) return item.soulSnapshot;
  return conditionHolds(ctx.s, selfOf(ctx, item), cond, item.paidWithSoul, item.catalyzed, ctx.db);
}
