/**
 * Effect engine: คิวเอฟเฟกต์ + การเลือกของผู้เล่น
 *
 * เอฟเฟกต์ทำทีละ step จากหัวคิว ถ้า step ต้องให้ผู้เล่นเลือก engine จะตั้ง s.choice แล้วหยุด
 * action `choose` จะทำ step นั้นให้จบแล้วเดินคิวต่อ ระหว่างรอเลือก action อื่นถูกปฏิเสธ
 */
import type { CardFilter, Condition, CountPer, Step, SubjectFilter, TriggerEvent } from '@bs/cards';
import { assertUsableCore, checkDepletion, destroy, drawCard, emit, emitStatic, endGame, handIncreasedByEffect, leaveField, loseLife, newCore, payCost, pendBurst, sendToTrash, type Ctx } from './ctx';
import { cardColors,
  bpDestroyBoostFor,
  bounceImmuneSource,
  cardBanSource,
  millBoostFor,
  soulCostFreeSource,
  allColorOverride,
  extraSymbols,
  gemColorCount,
  indestructibleSource,
  baseCost,
  braveHostOf,
  braveFits,
  braveRoom,
  destroyImmuneSource,
  coreFloorOf,
  noLifeFromVoidSource,
  showdownBp,
  distinctTeams,
  withTeamOf,
  chargeBonus,
  millBlocked,
  millCapLeft,
  noRefreshSource,
  multiDrawPunished,
  kagemushaOptions,
  kagemushaFreeNexus,
  canAttackWith,
  hasHolyLife,
  voidFromLife,
  turnLocked,
  burstBlocked,
  cardLevel,
  effectsNegated,
  handCards,
  trashImmune,
  trashLockSource,
  trashReturnBlocker,
  burstProtectSource,
  effectSummonTax,
  endStepCounter,
  magicBurstTax,
  magicBanned,
  cardFamilies,
  cardSymbolTotal,
  dispersionCount,
  bounceBottomSource,
  costBoostSources,
  type StaticSource,
  levelBoostSources,
  effectBlocker,
  negatedBy,
  staticSources,
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
  summonMinCores,
  nameHas,
  payableCost,
  removeCore,
  removeFrom,
} from './rules';
import { shuffle } from './rng';
import { teamHand, teamTrash } from './seats';
import { allZones } from './seats';
import { activeSeat, asSeat, itemSeat, normalizeSeats, ownField, ownerZones, seatsOf, useSeat, zonesOf } from './seats';
import { PLAYERS, opponentOf, type ChoicePick, type PendingChoice, type PlayerId, type QueuedEffect } from './types';
import type { Ability, Color } from '@bs/cards';

/**
 * การ์ดบนสนามฟื้นสภาพโดยเอฟเฟกต์ (sourceId = การ์ดต้นเหตุ ถ้ารู้)
 * ประตูปราสาทแห่งแคว้นบุปผาเหลือง Lv2: ในเทิร์นของคู่แข่ง สปิริตแดง/เขียว/ฟ้าที่ฟื้นสภาพโดยเอฟเฟกต์ของสปิริต/อัลติเมท/เมจิค ถูกทำลาย
 */
export function refreshByEffect(ctx: Ctx, cardId: string, sourceId?: string): void {
  const { s, db } = ctx;
  const card = s.cards[cardId]!;
  // BS13 ก็อด-เซคส์ Six Heaven's Rush: การ์ดของคู่แข่งที่ "ฟื้นสภาพไม่ได้" (ทุกทาง)
  const locked = noRefreshSource(s, db, cardId, true);
  if (locked) {
    if (card.state === 'exhausted') emitStatic(ctx, locked);
    return;
  }
  card.state = 'refresh';
  emit(ctx, { type: 'cardRefreshed', cardId });
  // เอฟเฟกต์ของเน็กซัสไม่นับ
  if (sourceId && s.cards[sourceId] && db.get(s.cards[sourceId]!.cardNo).type === 'nexus') return;
  const def = db.get(card.cardNo);
  if (!isSpiritLike(def)) return;
  for (const gateOwner of PLAYERS) {
    if (s.turnPlayer === gateOwner) continue;
    for (const gateId of s.players[gateOwner].field) {
      if (effectsNegated(s, db, gateId)) continue;
      const level = cardLevel(s, db, gateId);
      const ab = db.get(s.cards[gateId]!.cardNo).abilities.find((a) => a.kind === 'destroyRefreshedByEffect' && a.levels.includes(level));
      if (!ab || ab.kind !== 'destroyRefreshedByEffect' || !cardColors(s, db, cardId).some((c) => ab.colors.includes(c))) continue;
      if (card.owner !== gateOwner) {
        const blocker = effectBlocker(s, db, gateId, cardId);
        if (blocker) {
          emitStatic(ctx, blocker);
          continue;
        }
      }
      if (!s.players[card.owner].field.includes(cardId)) return;
      emitStatic(ctx, { cardId: gateId, source: ab.source });
      destroyCard(ctx, cardId, gateOwner, { bySource: gateId, effect: true });
      return;
    }
  }
}

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
    /** allyMagicUsed: ใช้จากในมือ (ไม่ใช่นอกมือ) */
    subjectFromHand?: boolean;
    /** oppDestroyed: ทำลายด้วยเอฟเฟกต์ */
    subjectByEffect?: boolean;
    /** oppDestroyed: การ์ดของคู่แข่งที่ถูกทำลายมี Soul Core วางอยู่ */
    victimSoul?: boolean;
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
    /** BS07 allyDestroyed: การ์ดของคู่แข่งที่ทำลาย / ทำลายโดยสปิริต/อัลติเมทของคู่แข่ง */
    destroyerId?: string;
    subjectBySpirit?: boolean;
    /** BS09 allyDestroyed: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง */
    subjectByOpponentEffect?: boolean;
    /** BS07 summon / allySummoned: ถูกอัญเชิญโดย On Stage / โดยเอฟเฟกต์ของการ์ดนี้ */
    byOnStage?: boolean;
    bySource?: string;
    /** เบรฟที่ร่วมร่างอยู่ก่อนการ์ดออกจากสนาม (trigger "เมื่อสปิริตนี้ถูกทำลาย" ที่เบรฟให้) */
    braves?: string[];
    /** BS10 oppVoidGain: จำนวนคอร์ที่คู่แข่งได้จากวอยด์ */
    voidGain?: number;
    /** BS11 allyBurstActivated: เบิร์สถูกสั่งใช้โดย Catalyze (allySummoned โดยเอฟเฟกต์ = subjectByEffect) */
    subjectCatalyzed?: boolean;
    /** BS12 ทรูธ-อีเด็น: เอฟเฟกต์ "เมื่อการ์ดนี้ถูกอัญเชิญ" ของการ์ดนี้ไม่ทำงาน */
    noSummonTrigger?: boolean;
  } = {},
): void {
  const { s, db } = ctx;
  const card = s.cards[cardId]!;
  const def = db.get(card.cardNo);
  const inHand = ownerZones(s, cardId).hand.includes(cardId);
  const inTrash = ownerZones(s, cardId).trashCards.includes(cardId);
  // เอฟเฟกต์ของการ์ดบนสนามที่ถูกปิด (เมียวโอดาบแดง / เลิฟพรินเซส): trigger ที่ควรทำงานถูกตัด → เรืองแสงการ์ดที่ปิด
  const negated = !inHand && opts.level === undefined && effectsNegated(s, db, cardId);
  const level = opts.level ?? cardLevel(s, db, cardId);
  const own = def.abilities.map((ab) => ({ ab, src: cardId }));
  // Brave ที่ร่วมร่างอยู่: เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ
  const granted = inHand
    ? []
    : (opts.braves ?? card.braves).flatMap((b) => db.get(s.cards[b]!.cardNo).abilities.filter((a) => a.kind === 'trigger' && a.granted).map((ab) => ({ ab, src: b })));
  for (const { ab, src } of [...own, ...granted]) {
    if (ab.kind !== 'trigger') continue;
    const isGranted = src !== cardId;
    if (!isGranted && ab.granted) continue;
    if (ab.zone === 'hand') {
      if (!inHand) continue;
    } else if (ab.zone === 'trash') {
      if (!inTrash) continue;
      // BS09 เมียวโอสยบมาร: การ์ดในแทรชใช้เอฟเฟกต์ไม่ได้
      if (trashLockSource(s, db)) continue;
    } else {
      if (inHand) continue;
      // การ์ดในแทรช: ทำงานเฉพาะเอฟเฟกต์ zone 'trash' (เน็กซัสในแทรชมีคอร์ 0 = นับเป็น Lv1 ได้: No.1 นอร์ธซีโรด)
      // ยกเว้น "เมื่อถูกทำลาย/สูญสลาย" ที่ส่งเลเวลตอนอยู่บนสนามมา (opts.level)
      if (inTrash && opts.level === undefined) continue;
      if (!isGranted && !ab.levels.includes(level)) continue;
    }
    {
      const ons = Array.isArray(ab.on) ? ab.on : [ab.on];
      // แอทแท็คชิฟท์: ในเทิร์นนี้ [เมื่อป้องกัน] ทำงานตอนโจมตีแทน (และไม่ทำงานตอนป้องกัน)
      const shift = s.attackShiftTurn === s.turn;
      const ok = shift && on === 'block' ? false : ons.includes(on) || (shift && on === 'attack' && ons.includes('block'));
      if (!ok) continue;
    }
    if (ab.subject && !(opts.subject && subjectMatches(ctx, opts.subject, ab.subject, cardId, !!opts.srcFromAttack, opts.subjectSoul, { ...opts, subjectByOnStage: opts.byOnStage }))) continue;
    if (ab.blocker && !(opts.blockerId && s.cards[opts.blockerId] && matchesFilter(s, db, opts.blockerId, ab.blocker))) continue;
    if (ab.if && !conditionHolds(s, isGranted ? cardId : src, ab.if, false, false, db)) continue;
    if (ab.milled && !(opts.milled ?? []).some((id) => matchesFilter(s, db, id, ab.milled!))) continue;
    if (ab.attackStepOnly && s.phase !== 'attack') continue;
    if (ab.ownTurnOnly && s.turnPlayer !== card.owner) continue;
    if (ab.oppTurnOnly && s.turnPlayer === card.owner) continue;
    if (ab.mainStepOnly && s.phase !== 'main') continue;
    // BS12 ทรูธ-อีเด็น: อัญเชิญแบบ "เอฟเฟกต์ [เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ] จะไม่ทำงาน" · โดจิ ห้ามงคล: สปิริตทุกตัวของผู้เล่นทุกคน
    if (on === 'summon' && !isGranted) {
      if (opts.noSummonTrigger) continue;
      if (def.type === 'spirit') {
        const ban = staticSources(s, db, PLAYERS, 'noSummonTriggers')[0];
        if (ban) {
          emitStatic(ctx, ban);
          continue;
        }
      }
    }
    if (negated) {
      emitStatic(ctx, negatedBy(s, db, cardId));
      continue;
    }
    // "เมื่อสปิริตของเราถูกอัญเชิญ" (allySummoned ทุกใบ) / oncePerBatch: ต้นเหตุหลายใบพร้อมกันในครั้งเดียว (เช่น อัญเชิญหลายตัวพร้อมกัน) ทำงานครั้งเดียว (เจ้าของโปรเจกต์กำหนด)
    if ((ab.oncePerBatch || on === 'allySummoned') && s.queue.some((q) => !q.started && q.sourceId === src && q.source === ab.source && q.batch === batch)) continue;
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
      // เบิร์ส "หลังจาก [เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ] ของคู่แข่งทำงาน" (กติกา 06 ข้อ 3.3): เฉพาะสปิริต/เบรฟ
      // ไม่นับ "เมื่อเน็กซัสนี้ถูกวาง" (trigger summon เหมือนกัน) และอัลติเมท
      ...(on === 'summon' && ['spirit', 'brave'].includes(db.get(s.cards[src]!.cardNo).type) ? { onSummon: true } : {}),
      ...(on === 'summon' && opts.byOnStage ? { summonByOnStage: true } : {}),
      ...(on === 'summon' && opts.bySource ? { summonBySource: opts.bySource } : {}),
      ...(opts.destroyerId ? { destroyerId: opts.destroyerId } : {}),
      ...(opts.voidGain ? { voidGain: opts.voidGain } : {}),
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
  extra: {
    subjectPaidSoul?: boolean;
    subjectByEffect?: boolean;
    subjectFromTrash?: boolean;
    subjectByOpponent?: boolean;
    subjectFromHand?: boolean;
    subjectBySpirit?: boolean;
    subjectByOnStage?: boolean;
    subjectByOpponentEffect?: boolean;
    subjectCatalyzed?: boolean;
    victimSoul?: boolean;
  } = {},
): boolean {
  const card = ctx.s.cards[cardId]!;
  const def = ctx.db.get(card.cardNo);
  if (f.victimSoul && !extra.victimSoul) return false;
  if (f.attacker && ctx.s.battle?.attackerId !== cardId) return false;
  if (f.team && !def.teams.includes(f.team)) return false;
  if (f.card && !matchesFilter(ctx.s, ctx.db, cardId, f.card)) return false;
  if (f.bySpirit && !extra.subjectBySpirit) return false;
  if (f.byOnStage && !extra.subjectByOnStage) return false;
  if (f.inBattle) {
    const b = ctx.s.battle;
    if (!b || !(b.attackerId === cardId || b.blockers.includes(cardId))) return false;
  }
  if (f.color && !cardColors(ctx.s, ctx.db, cardId).includes(f.color)) return false;
  if (f.types && !f.types.includes(def.type)) return false;
  if (f.paidWithSoul && !extra.subjectPaidSoul) return false;
  if (f.byEffect && !extra.subjectByEffect) return false;
  if (f.fromTrash && !extra.subjectFromTrash) return false;
  if (f.fromHand && !extra.subjectFromHand) return false;
  if (f.byOpponent && !extra.subjectByOpponent) return false;
  if (f.byOpponentEffect && !extra.subjectByOpponentEffect) return false;
  if (f.catalyzed && !extra.subjectCatalyzed) return false;
  if (f.firstOfTurn) {
    const fs = ctx.s.firstSummon;
    if (fs?.turn !== ctx.s.turn || fs[card.owner] !== cardId) return false;
  }
  if (f.minCost !== undefined && def.cost < f.minCost) return false;
  if (f.cost !== undefined && def.cost !== f.cost) return false;
  if (f.self && cardId !== holderId) return false;
  if (f.other && cardId === holderId) return false;
  if (f.soul && soulSnapshot !== undefined) return soulSnapshot && subjectMatches(ctx, cardId, { ...f, soul: undefined }, holderId, srcFromAttack, undefined, extra);
  if (f.attackEffect && !srcFromAttack) return false;
  // เผ่า (รวมเผ่าที่ได้รับ: โอโทโนะซามะ)
  const fam = f.family || f.families ? cardFamilies(ctx.s, ctx.db, cardId) : def.family;
  if (f.family && !fam.includes(f.family)) return false;
  if (f.families && !f.families.some((x) => fam.includes(x))) return false;
  if (f.nameIncludes && !nameHas(def, f.nameIncludes)) return false;
  if (f.names && !f.names.includes(def.name)) return false;
  if (f.soul &&!card.cores.some((id) => ctx.s.cores[id]!.isSoul)) return false;
  if (f.holyLife && !(ctx.s.players[card.owner].field.includes(cardId) && hasHolyLife(ctx.s, ctx.db, cardId))) return false;
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
    for (const id of [...ctx.s.players[me].field, ...teamHand(ctx.s, me)]) {
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
      if (ab.subject.inBattle && !(s.battle && (s.battle.attackerId === cardId || s.battle.blockers.includes(cardId)))) continue;
      if (ab.subject.nameIncludes && !ab.subject.nameIncludes.some((w) => name.includes(w))) continue;
      if (ab.subject.names && !ab.subject.names.includes(name)) continue;
      if (ab.subject.family && !db.get(s.cards[cardId]!.cardNo).family.includes(ab.subject.family)) continue;
      if (ab.if && !conditionHolds(s, id, ab.if, false, false, db)) continue;
      if (ab.discard && !owner.hand.some((h) => matchesFilter(s, db, h, ab.discard!))) continue;
      // มิคาเนะ: ต้องมีคอร์ไลฟ์พอให้ย้าย (ย้ายจนไลฟ์ 0 ได้ แต่แพ้ทันที)
      if (ab.life && owner.life.length < ab.life) continue;
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
  cause: { bySource?: string; effect?: boolean; braves?: string[] } = {},
): void {
  const { s, db } = ctx;
  const owner = s.cards[cardId]!.owner;
  const destroyedSpirit = isSpiritLike(db.get(s.cards[cardId]!.cardNo));
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    if (level > 0 && !negated) {
      const braves = cause.braves ? { braves: cause.braves } : {};
      queueTriggers(ctx, cardId, 'destroyed', batch, { level, soulSnapshot: hadSoul, ...braves });
      if (by !== owner) queueTriggers(ctx, cardId, 'destroyedByOpponent', batch, { level, soulSnapshot: hadSoul, ...braves });
      // กติกา 10 ข้อ 1.2: ถูกทำลายด้วยเอฟเฟกต์ (ไม่ใช่แพ้เทียบ BP)
      if (by !== owner && cause.effect) queueTriggers(ctx, cardId, 'destroyedByOpponentEffect', batch, { level, soulSnapshot: hadSoul, ...braves });
    }
    // BS07: ผู้ทำลาย (การ์ดของคู่แข่ง) และทำลายโดยสปิริต/อัลติเมทของคู่แข่งหรือไม่ (มาโกะอิจิ / เซฟี่-แอริส)
    const src = cause.bySource && s.cards[cause.bySource] ? cause.bySource : undefined;
    const srcHost = src ? (braveHostOf(s, src) ?? src) : undefined;
    const bySpirit = by !== owner && !!srcHost && s.cards[srcHost]!.owner !== owner && isSpiritLike(db.get(s.cards[srcHost]!.cardNo));
    for (const id of [...s.players[owner].field, ...teamHand(s, owner), ...teamTrash(s, owner)]) {
      if (id !== cardId)
        queueTriggers(ctx, id, 'allyDestroyed', batch, {
          subject: cardId,
          subjectSoul: hadSoul,
          subjectByOpponent: by !== owner,
          subjectByOpponentEffect: by !== owner && !!cause.effect,
          subjectBySpirit: bySpirit,
          ...(bySpirit && srcHost ? { destroyerId: srcHost } : {}),
        });
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
        queueTriggers(ctx, id, 'oppDestroyed', batch, { subject: cause.bySource, subjectByEffect: !!cause.effect, victimSoul: hadSoul });
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
  // BS10 สวนลอยฟ้า: ในเทิร์นนี้ไม่ถูกทำลาย
  if ((s.noDestroyTurn ?? []).some((t) => t.cardId === cardId && t.turn === s.turn)) return;
  // BS11 เดย์เบรค-เธิร์ด: "สปิริตนี้จะไม่ถูกทำลาย" (ทุกกรณี)
  {
    const im = indestructibleSource(s, db, cardId);
    if (im) {
      emitStatic(ctx, im);
      return;
    }
  }
  // Solo Part / ราเควล: ไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง
  if (opts.effect && by !== owner) {
    const im = destroyImmuneSource(s, db, cardId);
    if (im) {
      emitStatic(ctx, im);
      return;
    }
  }
  if (!opts.noReplace && by !== owner && s.battle?.staysOnDestroy === owner && isSpiritLike(db.get(card.cardNo))) {
    stayDestroyed(ctx, cardId, by, opts.bySource, 'exhausted');
    return;
  }
  if (!opts.noReplace && by !== owner) {
    const repl = findReplacement(ctx, cardId, !!opts.effect);
    if (repl) {
      const { ab } = repl;
      const state = ab.state === 'same' ? card.state : (ab.state ?? 'exhausted');
      // BS10 นาเดชิโกะ: กลับขึ้นมือแทนการถูกทำลาย
      if (ab.toHand) {
        emitStatic(ctx, { cardId: repl.id, source: ab.source });
        leaveField(ctx, cardId, 'hand', { cloneToHand: true });
        emit(ctx, { type: 'bounced', player: owner, cardId });
        return;
      }
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
            : ab.life
              ? [{ do: 'lifeCoreOnto', cardId, count: ab.life }]
              : [];
      const price = ab.mill
        ? `ทิ้งเด็คคู่แข่ง ${ab.mill} ใบ`
        : ab.millSelf
          ? `ทิ้งใบบนสุดเด็คเรา ${ab.millSelf} ใบ`
          : ab.discard
            ? 'ทิ้งการ์ดเมจิคบนมือ 1 ใบ'
            : ab.life
              ? `นำคอร์ไลฟ์ ${ab.life} เม็ดมาวาง`
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
  const braves = [...card.braves];
  destroy(ctx, cardId, by, opts.bySource);
  queueDestroyTriggers(ctx, cardId, by, level, hadSoul, negated, { ...opts, braves });
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
  const bottom = to === 'hand' ? bounceBottomSource(s, db, cardId) : null;
  emitStatic(ctx, bottom);
  const dest = bottom ? 'deckBottom' : to;
  const spirit = isSpiritLike(db.get(s.cards[cardId]!.cardNo)) && db.get(s.cards[cardId]!.cardNo).type !== 'ultimate';
  if (leaveField(ctx, cardId, 'hand') === 'trash') {
    emit(ctx, { type: 'cloneDiscarded', player: owner, cardId });
    return;
  }
  if (dest === 'hand') {
    emit(ctx, { type: 'bounced', player: owner, cardId });
    // BS09 ริคุโดว: "เมื่อสปิริตของเราถูก...กลับขึ้นมือโดยเอฟเฟกต์ของคู่แข่ง"
    const cur = s.queue[0];
    if (spirit && cur && cur.controller !== owner) {
      queueRightAfterCurrent(ctx, () => {
        const batch = newBatch(ctx);
        for (const id of [...s.players[owner].field]) queueTriggers(ctx, id, 'allyBouncedByOpponent', batch, { subject: cardId });
      });
    }
    return;
  }
  const p = ownerZones(s, cardId);
  removeFrom(p.hand, cardId);
  if (dest === 'deckTop') p.deck.unshift(cardId);
  else p.deck.push(cardId);
  emit(ctx, { type: 'returnedToDeck', player: owner, cardId, where: dest === 'deckTop' ? 'top' : 'bottom' });
}

/** การ์ดสูญสลายเพราะเอฟเฟกต์ของคู่แข่งถอดคอร์: ลงแทรชทันที + "เมื่อสปิริตนี้สูญสลายโดยคู่แข่ง" + Burst */
function depleteByOpponent(ctx: Ctx, item: QueuedEffect, cardId: string, level: number, hadSoul: boolean): void {
  const owner = ctx.s.cards[cardId]!.owner;
  // BS10 นาเดชิโกะ: ถูกทำลาย/สูญสลายโดยเอฟเฟกต์ของคู่แข่ง → กลับขึ้นมือแทน
  const repl = findReplacement(ctx, cardId, true);
  if (repl?.ab.toHand) {
    emitStatic(ctx, { cardId: repl.id, source: repl.ab.source });
    leaveField(ctx, cardId, 'hand');
    emit(ctx, { type: 'bounced', player: owner, cardId });
    return;
  }
  sendToTrash(ctx, cardId);
  emit(ctx, { type: 'depleted', cardId });
  // BS12 มิสึรุกิ: สูญสลายโดยเอฟเฟกต์ของเบิร์สที่นับอยู่
  const bk = ctx.s.burstKills;
  if (bk && item.sourceId === bk.burstId && owner !== bk.controller) bk.count++;
  if (hadSoul) item.depletedSoul = true;
  item.depleted = true;
  // กติกา 10: สูญสลายไม่ใช่การถูกทำลาย → เปิดได้เฉพาะเบิร์สที่เขียน "ถูกทำลาย/สูญสลาย"
  pendBurst(ctx, owner, 'afterAllyDepletedByOpponent');
  queueRightAfterCurrent(ctx, () => queueTriggers(ctx, cardId, 'depletedByOpponent', newBatch(ctx), { level, soulSnapshot: hadSoul }));
  // BS11 โททอลซอง / โลกสีเงิน: "เมื่อสปิริตของเราถูกทำลาย/สูญสลายโดย(เอฟเฟกต์ของ)คู่แข่ง"
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    for (const id of [...ctx.s.players[owner].field])
      queueTriggers(ctx, id, 'allyDepletedByOpponent', batch, { subject: cardId, subjectSoul: hadSoul, subjectByOpponent: true, subjectByOpponentEffect: true });
  });
  // BS10 บิรันบะ: "เมื่อสปิริต/อัลติเมทของคู่แข่งสูญสลาย"
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    for (const id of [...ctx.s.players[opponentOf(owner)].field]) queueTriggers(ctx, id, 'oppDepleted', batch, { subject: cardId });
  });
}

/** การ์ดถูกอัญเชิญ: "เมื่อสปิริตนี้ถูกอัญเชิญ" + "เมื่อสปิริตเรา...ถูกอัญเชิญ" ของการ์ดบนสนามของเจ้าของ */
export function queueSummonTriggers(
  ctx: Ctx,
  cardId: string,
  batch: number = newBatch(ctx),
  opts: {
    paidWithSoul?: boolean;
    fromTrash?: boolean;
    from?: string;
    /** เลเวลที่ใช้ตรวจ trigger (Brave ที่อัญเชิญมาร่วมร่างทันทีไม่มี Core) */
    level?: number;
    /** BS07: อัญเชิญโดย On Stage / โดยเอฟเฟกต์ของการ์ดนี้ */
    byOnStage?: boolean;
    bySource?: string;
    /** BS12 ทรูธ-อีเด็น */
    noSummonTrigger?: boolean;
  } = {},
): void {
  const owner = ctx.s.cards[cardId]!.owner;
  // ลงสนามมาโดนผล "Lv คอสต์ +N" ของคู่แข่ง (ต้องวางคอร์เพิ่ม): เรืองแสงการ์ดต้นเหตุตอนการ์ดลงสนาม (เบรฟที่ร่วมร่างไม่มีเลเวลจากคอร์)
  if (!braveHostOf(ctx.s, cardId)) emitStatic(ctx, levelBoostSources(ctx.s, ctx.db, cardId));
  const level = opts.level ?? cardLevel(ctx.s, ctx.db, cardId);
  if (level > 0)
    queueTriggers(ctx, cardId, 'summon', batch, {
      paidWithSoul: !!opts.paidWithSoul,
      ...(opts.from ? { summonFrom: opts.from } : {}),
      ...(opts.level !== undefined ? { level: opts.level } : {}),
      ...(opts.byOnStage ? { byOnStage: true } : {}),
      ...(opts.bySource ? { bySource: opts.bySource } : {}),
      ...(opts.noSummonTrigger ? { noSummonTrigger: true } : {}),
    });
  // เบรฟที่อัญเชิญมาร่วมร่างทันทีอยู่ในสถานะเบรฟ ไม่ใช่สปิริต (กติกา 04: เป็นสปิริตด้วยเฉพาะตอนยืนเดี่ยวบนสนาม)
  // → ไม่ปลุก "เมื่อสปิริตของเรา...ถูกอัญเชิญ" (ส่วน "เมื่อเบรฟนี้ถูกอัญเชิญ" ของตัวเองยังทำงานตามข้างบน)
  if (braveHostOf(ctx.s, cardId)) return;
  // BS11 ดอน นุระริเฮียน: การ์ดในมือทำงานเมื่อสปิริตของเราถูกอัญเชิญโดยเอฟเฟกต์ (การ์ดที่เพิ่งอัญเชิญเองไม่นับ)
  for (const id of [...ctx.s.players[owner].field, ...teamTrash(ctx.s, owner), ...teamHand(ctx.s, owner)])
    queueTriggers(ctx, id, 'allySummoned', batch, {
      subject: cardId,
      subjectPaidSoul: !!opts.paidWithSoul,
      subjectFromTrash: !!opts.fromTrash,
      subjectFromHand: opts.from === 'hand',
      byOnStage: !!opts.byOnStage,
      subjectByEffect: !!opts.bySource,
    });
}

/** เลเวลที่ใช้ตรวจ trigger อัญเชิญของเบรฟที่ลงไปร่วมร่างทันที (ไม่มี Core): เลเวลต่ำสุดของการ์ด (แบบเดียวกับอัญเชิญเบรฟจากมือ) */
function braveSummonLevel(ctx: Ctx, cardId: string): number {
  const lowest = Math.min(...ctx.db.get(ctx.s.cards[cardId]!.cardNo).levels.map((l) => l.level));
  return Number.isFinite(lowest) ? lowest : 1;
}

/** นำสปิริต/เบรฟกลับไปใต้สุดเด็คเจ้าของ (เบรฟที่ร่วมร่างอยู่: แยกออกจากร่างต้นแล้วไปใต้เด็ค) */
function returnToDeckBottomAny(ctx: Ctx, id: string): void {
  const { s } = ctx;
  const owner = s.cards[id]!.owner;
  const host = braveHostOf(s, id);
  if (host) {
    removeFrom(s.cards[host]!.braves, id);
    s.players[owner].deck.push(id);
    emit(ctx, { type: 'returnedToDeck', player: owner, cardId: id, where: 'bottom' });
    return;
  }
  if (!PLAYERS.some((p) => s.players[p].field.includes(id))) return;
  returnCard(ctx, id, 'deckBottom');
}

/** ผู้เล่นเสียไลฟ์: trigger "เมื่อเราเสียไลฟ์" ของการ์ดบนสนามของผู้เล่นนั้น */
export function queueLifeLostTriggers(ctx: Ctx, player: PlayerId, amount = 1): void {
  if (ctx.s.winner) return;
  // นับตามที่ไลฟ์ลดจริง (เพดานความเสียหายอาจตัดเหลือน้อยกว่าที่สั่ง หรือไม่ลดเลย = ไม่มี trigger)
  if (ctx.lastLifeLost?.player === player) amount = ctx.lastLifeLost.amount;
  if (amount <= 0) return;
  // เอฟเฟกต์ของคู่แข่งกำลังทำงานอยู่ = ไลฟ์ลดเพราะเอฟเฟกต์ (ไม่ใช่การโจมตี)
  const cur = ctx.s.queue[0];
  const byEffect = !!cur?.started && cur.controller !== player;
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    const before = ctx.s.queue.length;
    for (const id of [...ctx.s.players[player].field]) queueTriggers(ctx, id, 'lifeLost', batch, { lifeLost: amount });
    if (byEffect) for (const q of ctx.s.queue.slice(before)) q.lifeLostByEffect = true;
  });
}

/** ผู้เล่นใช้การ์ดเมจิค: trigger "เมื่อเราใช้งานการ์ดเมจิค" (เข้าคิวหลังเอฟเฟกต์ของเมจิค = ทำงานหลังจากนั้น) */
export function queueMagicUsedTriggers(ctx: Ctx, player: PlayerId, magicId?: string, fromHand = true, paidWithSoul = false): void {
  const batch = newBatch(ctx);
  // BS10 คิวบิฟ็อกซ์: การ์ดในมือทำงานได้ด้วย
  for (const id of [...ctx.s.players[player].field, ...teamHand(ctx.s, player)])
    queueTriggers(ctx, id, 'allyMagicUsed', batch, magicId ? { subject: magicId, subjectFromHand: fromHand, subjectPaidSoul: paidWithSoul } : {});
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
  // 2VS2: เบิร์สของทั้งสองคนในทีมเปิดได้เมื่อเงื่อนไขเกิดกับทีม (กติกา 15 ข้อ 5)
  for (const player of [opponentOf(s.turnPlayer), s.turnPlayer]) for (const seat of seatsOf(s, player)) asSeat(s, player, seat, () => {
    const events = pending.filter((p) => p.player === player).map((p) => p.on);
    const burstId = s.players[player].burst;
    if (events.length === 0 || !burstId) return;
    if (burstBlocked(s, ctx.db, player, ctx.db.get(s.cards[burstId]!.cardNo))) {
      emitStatic(ctx, cardBanSource(s, ctx.db, player, ctx.db.get(s.cards[burstId]!.cardNo)));
      return;
    }
    const extra = extraBurstEvents(s, ctx.db, player);
    const anyExtra = events.some((e) => extra.includes(e));
    const ab = ctx.db.get(s.cards[burstId]!.cardNo).abilities.find(
      (x) => x.kind === 'burst' && (events.includes(x.on) || (!!x.alsoDepleted && events.includes('afterAllyDepletedByOpponent')) || anyExtra),
    );
    if (!ab || ab.kind !== 'burst') return;
    const subjectId = pending.find((p) => p.player === player && (p.on === ab.on || (ab.alsoDepleted && p.on === 'afterAllyDepletedByOpponent')))?.subjectId;
    // BS09 จินเบร์: ต้องจ่ายคอสต์เพิ่มเพื่อสั่งใช้เบิร์ส (คอร์ไม่พอ = เปิดไม่ได้)
    const tax = magicBurstTax(s, ctx.db, player).amount;
    const openSteps: Step[] = [{ do: 'openBurst' }, ...ab.steps];
    if (tax > 0 && usableCores(ctx, player).length < tax) return;
    enqueue(ctx, {
      ...(subjectId ? { subjectId } : {}),
      controller: player,
      ...(seat ? { seat } : {}),
      sourceId: burstId,
      steps: [
        {
          do: 'chooseOne',
          options: [
            tax > 0 ? { label: `เปิด Burst (จ่ายคอสต์เพิ่ม ${tax})`, steps: [{ do: 'payBurstTax', cost: tax, then: openSteps }] } : { label: 'เปิด Burst', steps: openSteps },
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
  });
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
  // 2VS2: เอฟเฟกต์แต่ละอันทำในฐานะที่นั่งของผู้ควบคุม (drainQueue สลับให้) จบแล้วคืนที่นั่งเดิมให้โค้ดที่เรียก
  if (s.mode === '2v2') {
    const before = { p1: activeSeat(s, 'p1'), p2: activeSeat(s, 'p2') };
    try {
      runQueueInner(ctx);
    } finally {
      useSeat(s, 'p1', before.p1);
      useSeat(s, 'p2', before.p2);
    }
    return;
  }
  runQueueInner(ctx);
}

function runQueueInner(ctx: Ctx): void {
  const { s } = ctx;
  for (;;) {
    drainQueue(ctx);
    checkDepletion(ctx);
    checkSoulToTrash(ctx);
    checkVoidGain(ctx);
    if (s.choice || s.winner) return;
    // การ์ดที่สูญสลาย/Brave ที่ต้องเลือก หรือ Burst ที่เงื่อนไขเกิดระหว่างนี้ → ทำต่อ
    if (s.queue.length === 0 && !flushBursts(ctx)) return;
  }
}

/**
 * BS09 โทวโดว (การ์ดในมือ): "เมื่อโซลคอร์ของคู่แข่งถูกนำไปวางที่แทรชของคู่แข่ง หลังจากเอฟเฟกต์นั้นทำงาน"
 * ตรวจหลังเอฟเฟกต์/การกระทำแต่ละครั้ง: โซลคอร์เพิ่งไปอยู่ในแทรชของผู้เล่นใด → การ์ดในมือของอีกฝ่ายทำงาน
 */
export function checkSoulToTrash(ctx: Ctx): void {
  const { s } = ctx;
  for (const p of PLAYERS) {
    const now = s.players[p].trashCores.some((c) => s.cores[c]!.isSoul);
    const seen = s.soulInTrashSeen?.[p] ?? false;
    if (now === seen) continue;
    s.soulInTrashSeen = { ...(s.soulInTrashSeen ?? {}), [p]: now };
    if (!now) continue;
    const other = opponentOf(p);
    const batch = newBatch(ctx);
    for (const id of [...teamHand(s, other)]) queueTriggers(ctx, id, 'oppSoulToTrash', batch);
  }
}

/** BS10 บิรันบะ (การ์ดในมือ): คู่แข่งได้คอร์จากวอยด์ (โดยเอฟเฟกต์) → การ์ดในมือของอีกฝ่ายทำงาน */
function checkVoidGain(ctx: Ctx): void {
  const { s } = ctx;
  const gained = s.voidGained;
  if (!gained) return;
  s.voidGained = undefined;
  for (const p of PLAYERS) {
    const n = gained[p] ?? 0;
    if (n <= 0) continue;
    const batch = newBatch(ctx);
    for (const id of [...teamHand(s, opponentOf(p))]) queueTriggers(ctx, id, 'oppVoidGain', batch, { voidGain: n });
  }
}

function drainQueue(ctx: Ctx): void {
  const { s } = ctx;
  while (!s.choice && !s.winner && s.queue.length > 0) {
    // เอฟเฟกต์จากบนมือ/ในแทรชที่ยังไม่เริ่ม แต่การ์ดย้ายออกไปแล้ว (เช่น อัญเชิญไปด้วย trigger อันก่อน): ตัดทิ้ง
    // ไม่งั้นการ์ดใบเดียวถูกอัญเชิญซ้ำ (เมียวโอแห่งการไถ่บาป เมื่อเด็คคู่แข่งถูกทิ้งสองครั้ง)
    const stale = s.queue.filter((q) => !q.started && q.zone && !zonesOf(s, q.controller, itemSeat(s, q))[q.zone === 'hand' ? 'hand' : 'trashCards'].includes(q.sourceId));
    if (stale.length > 0) {
      s.queue = s.queue.filter((q) => !stale.includes(q));
      continue;
    }
    const item = s.queue[0]!;
    useSeat(s, item.controller, itemSeat(s, item));
    if (s.mode === '2v2') useSeat(s, opponentOf(item.controller), item.oppSeat ?? 0);
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
      // "หลังจาก [เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ] ของคู่แข่งทำงาน" (เลือกไม่ใช้ "สามารถ" = ไม่นับ: กติกา 06 Q7)
      if (item.onSummon && item.started && !item.declined) pendBurst(ctx, opponentOf(item.controller), 'afterOpponentSummonEffect', item.sourceId);
      if (item.trashWhenDone) {
        s.players[item.controller].trashCards.push(item.sourceId);
        emit(ctx, { type: 'spellResolved', player: item.controller, cardId: item.sourceId });
      }
      continue;
    }
    execStep(ctx, item, step);
    normalizeSeats(s);
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
  // Kagemusha: การเลือกครั้งถัดไปของเอฟเฟกต์นี้ต้องเล็งการ์ด Kagemusha ที่อัญเชิญมา (ไม่อัญเชิญ = เป้าเดิม)
  const onField = (id: string) => PLAYERS.some((p) => ctx.s.players[p].field.includes(id));
  if (item.kageForce && choice.kind === 'card' && (player === item.controller || ownerPicksTarget(choice, player, item))) {
    const f = item.kageForce;
    item.kageForce = undefined;
    const forced = [f.kage, f.orig].find((id) => !!id && onField(id));
    // การ์ด Kagemusha ที่ไม่รับผลเอฟเฟกต์นี้ (ชิโมะคาเสะ: ไม่รับผลสปิริต/เมจิคของคู่แข่ง) = ดูดเอฟเฟกต์มาแล้วลบทิ้ง (กติกา 14 Kagemusha)
    if (forced && forced === f.kage) {
      const blocker = effectBlocker(ctx.s, ctx.db, item.sourceId, forced);
      if (blocker) {
        emitStatic(ctx, blocker);
        item.kageDone = [...(item.kageDone ?? []), forced];
        if ('step' in choice) item.kageAbsorb = { cardId: forced, stepDo: choice.step.do };
        return;
      }
    }
    if (forced) {
      item.kageDone = [...(item.kageDone ?? []), forced];
      // กติกา 14 Kagemusha ข้อ 2: ดูดเอฟเฟกต์มาหมด = เป้าที่เหลือของ step นี้ก็ต้องเป็นการ์ด Kagemusha
      if (forced === f.kage && 'step' in choice) item.kageAbsorb = { cardId: forced, stepDo: choice.step.do };
      choice = { ...choice, candidates: [forced], prompt: `${choice.prompt} (Kagemusha: ต้องเล็งการ์ดนี้)` };
    }
  } else if (item.kageAbsorb && choice.kind === 'card' && (player === item.controller || ownerPicksTarget(choice, player, item)) && 'step' in choice) {
    if (choice.step.do !== item.kageAbsorb.stepDo) item.kageAbsorb = undefined;
    else {
      // เป้าที่เหลือ: เล็งการ์ด Kagemusha ได้อีกก็เล็ง ไม่ได้ (เช่น เสื่อมสภาพไปแล้ว) = เอฟเฟกต์ส่วนนี้จบ
      const kage = item.kageAbsorb.cardId;
      if (!onField(kage) || !choice.candidates.includes(kage)) return;
      choice = { ...choice, candidates: [kage], prompt: `${choice.prompt} (Kagemusha: ต้องเล็งการ์ดนี้)` };
    }
  }
  // BS10 มิโคโตะ: เบิร์สที่สั่งใช้โดย Catalyze นี้ "เลือกเป้า 1 ตัว" = ทั้งหมดแทน
  if (
    item.allTargets &&
    choice.kind === 'card' &&
    player === item.controller &&
    !choice.optional &&
    !choice.revealed &&
    MULTI_STEPS.has(choice.step.do) &&
    ((choice.step as { count?: number }).count ?? 1) === 1 &&
    choice.candidates.length > 1
  ) {
    item.steps.unshift({ do: 'applyPicks', picks: [...choice.candidates], step: choice.step, player, kage: true });
    return;
  }
  // เล็งหลายเป้า (เช่น ทำลาย/เสื่อมสภาพ/BP- 2 ตัว): เลือกครบทีเดียว แล้วผลเกิดกับทุกใบพร้อมกัน (เจ้าของโปรเจกต์กำหนด)
  if (choice.kind === 'card' && !choice.optional && !choice.revealed && MULTI_STEPS.has(choice.step.do)) {
    const n = Math.min((choice.step as { count?: number }).count ?? 1, choice.candidates.length);
    if (n > 1) {
      const prompt = choice.prompt.replace(/ ?\(อีก \d+ (ตัว|ใบ)\)/, '').replace('1 ใบที่จะ', `${n} ใบที่จะ`);
      choice = { kind: 'multiCard', prompt: `${prompt} (เลือก ${n} ${/มือ/.test(prompt) ? 'ใบ' : 'ตัว'}พร้อมกัน)`, candidates: choice.candidates, count: n, step: choice.step };
    }
  }
  ctx.s.choice = { ...choice, player, sourceId: item.sourceId } as PendingChoice;
}

/** เลือกหลายตัวทีเดียวโดยค่ารวม (BP / คอสต์) ไม่เกินงบ แล้วกดยืนยัน (choice multiCard แบบ budget) */
function askBudget(ctx: Ctx, item: QueuedEffect, candidates: string[], step: Step, prompt: string, label: string, max: number, value: (id: string) => number): void {
  const values: Record<string, number> = {};
  for (const id of candidates) values[id] = value(id);
  ask(ctx, item, { kind: 'multiCard', prompt, candidates, count: candidates.length, step, budget: { max, values, label } });
}

/** step ที่เลือกหลายเป้า (count > 1) ได้ทีเดียว: choice multiCard → applyPicks */
const MULTI_STEPS = new Set<Step['do']>([
  'destroyChosenOpponent',
  'exhaustOpponent',
  'bounceOpponent',
  'debuffChosenOpponent',
  'disableChosenOpponent',
  'unblockableThisTurn',
  'refreshChosenAlly',
  'opponentDiscards',
  'discard',
  'noLifeDamageChosen',
]);

/** step ที่เล็งการ์ดของคู่แข่ง (เปิดให้ Kagemusha ทำงาน) */
const KAGE_STEPS = new Set<Step['do']>([
  // ตีระบุ / เลือกผู้ป้องกัน
  'chooseBlockers',
  'destroyChosenOpponent',
  'debuffChosenOpponent',
  'exhaustOpponent',
  'bounceOpponent',
  'disableChosenOpponent',
  'removeOpponentCores',
  'moveOpponentCore',
  'destroyHighestCostOpponent',
  // เล็งตามผลรวม BP/คอสต์ และบังคับโจมตี (ราชาผึ้ง ฟง-นี้ด, โควจิกิริ, อิจิโกะฮิโทฟุริ ฯลฯ)
  'exhaustOpponentTotalBp',
  'exhaustOpponentTotalCost',
  'opponentTotalBp',
  'forceAttackChosen',
  // BS11
  'noLifeDamageChosen',
  'negateChosenThisTurn',
  // Showdown: คู่แข่งระบุสปิริตของตัวเอง = สปิริตนั้นตกเป็นเป้าของเอฟเฟกต์เรา (เจ้าของเลือกเองแล้วใช้ Kagemusha ได้)
  'showdown',
]);

/** การเลือกของ Showdown ที่คู่แข่งเป็นคนระบุสปิริตของตัวเอง */
const ownerPicksTarget = (choice: { step?: Step }, player: PlayerId, item: QueuedEffect) => choice.step?.do === 'showdown' && player !== item.controller;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * 2VS2: step ที่ลงผลกับโซนส่วนตัวของคู่แข่ง (เด็ค มือ เบิร์ส รีเสิร์ฟ) = ทำกับคู่แข่งทีละคน ทั้งสองคน (กติกา 15 ข้อ 8)
 * ไลฟ์ของคู่แข่ง (loseLife) ลดทั้งสองคนอยู่แล้ว ไม่ต้องอยู่ในนี้
 */
const OPP_ZONE_STEPS = new Set<string>([
  'mill',
  'discardOpponentBurst',
  'peekOpponentBurst',
  'opponentDiscardHandDraw',
  'opponentTrashSameNameToBottom',
  'peekHandDiscard',
  'opponentRandomDiscard',
  'opponentDiscards',
  'opponentDiscardTo',
  'opponentReserveToTrash',
]);

/** 2VS2: step จั่วนี้ต้องถามว่าใครจั่วไหม (เงื่อนไขไม่ผ่าน / ไม่อยู่ในดรอว์สเต็ป = ไม่ถาม ปล่อยให้ step ข้ามเอง) */
function drawAsks(ctx: Ctx, item: QueuedEffect, step: Step): boolean {
  if (step.do === 'addDrawStepDraw') return ctx.s.phase === 'draw' && step.amount !== 0;
  if (step.do !== 'draw') return false;
  if (step.count < 1) return false;
  if (step.perLifeLost && !(item.lifeLost ?? 0)) return false;
  if (!step.if) return true;
  if ('soulOnSelf' in step.if && item.soulSnapshot !== undefined) return item.soulSnapshot;
  return conditionHolds(ctx.s, selfOf(ctx, item), step.if, item.paidWithSoul, item.catalyzed, ctx.db);
}

function execStep(ctx: Ctx, item: QueuedEffect, step: Step): void {
  const { s, db } = ctx;
  const me = item.controller;
  if (s.mode === '2v2') {
    if (step.do === 'oppSeat') {
      if (step.seat === null) delete item.oppSeat;
      else item.oppSeat = step.seat;
      useSeat(s, opponentOf(me), step.seat ?? 0);
      return;
    }
    if (step.do === 'selfSeat') {
      if (step.seat === null) {
        if (item.seatPrev !== undefined) item.seat = item.seatPrev;
        delete item.seatPrev;
      } else {
        item.seatPrev = itemSeat(s, item);
        item.seat = step.seat;
      }
      useSeat(s, me, itemSeat(s, item));
      return;
    }
    // เอฟเฟกต์จั่วการ์ดของเรา: เจ้าของเอฟเฟกต์เลือกว่าใครในทีมจั่ว (กติกา 15 ข้อ 8)
    if ((step.do === 'draw' || step.do === 'addDrawStepDraw') && item.seatPrev === undefined && s.players[me].partner && drawAsks(ctx, item, step)) {
      const mine = itemSeat(s, item);
      const other = mine === 0 ? 1 : 0;
      const what = step.do === 'draw' ? 'จั่ว' : step.amount >= 0 ? 'จั่วเพิ่มในดรอว์สเต็ป' : 'จั่วน้อยลงในดรอว์สเต็ป';
      item.steps.unshift({
        do: 'chooseOne',
        options: [
          { label: `เรา${what}`, steps: [{ do: 'selfSeat', seat: mine }, step, { do: 'selfSeat', seat: null }] },
          { label: `ให้เพื่อนร่วมทีม${what}`, steps: [{ do: 'selfSeat', seat: other }, step, { do: 'selfSeat', seat: null }] },
        ],
      });
      return;
    }
    if (item.oppSeat === undefined && OPP_ZONE_STEPS.has(step.do) && s.players[opponentOf(me)].partner) {
      item.steps.unshift({ do: 'oppSeat', seat: 0 }, step, { do: 'oppSeat', seat: 1 }, step, { do: 'oppSeat', seat: null });
      return;
    }
  }
  const self = selfOf(ctx, item);
  const holds = (cond: Parameters<typeof conditionHolds>[2]) => {
    // การ์ดที่ออกจากสนามไปแล้ว: ใช้สภาพ Soul Core ตอนเกิด trigger
    if (cond && 'soulOnSelf' in cond && item.soulSnapshot !== undefined) return item.soulSnapshot;
    if (cond && 'not' in cond && 'soulOnSelf' in cond.not && item.soulSnapshot !== undefined) return !item.soulSnapshot;
    if (cond && 'summonedFromDeck' in cond) return item.summonFrom === 'deck';
    if (cond && 'summonedByOnStage' in cond) return !!item.summonByOnStage;
    if (cond && 'summonedBy' in cond) return !!item.summonBySource && !!s.cards[item.summonBySource] && matchesFilter(s, db, item.summonBySource, cond.summonedBy);
    if (cond && 'subjectCanRefreshOnce' in cond) {
      const id = item.subjectId;
      return (
        !!id &&
        onField(ctx, id) &&
        s.cards[id]!.state === 'exhausted' &&
        !(s.usedOncePerTurn ?? []).includes(`${id}:${cond.subjectCanRefreshOnce}`)
      );
    }
    if (cond && 'subjectIs' in cond) return !!item.subjectId && !!s.cards[item.subjectId] && matchesFilter(s, db, item.subjectId, cond.subjectIs);
    if (cond && 'lifeLostByOpponentEffect' in cond) return !!item.lifeLostByEffect;
    // BS11 สุโอว: เบิร์สที่ Catalyze สั่งใช้ ถือว่าไลฟ์เราเป็น N
    if (cond && 'lifeAtMost' in cond && item.lifeAs !== undefined) return item.lifeAs <= cond.lifeAtMost;
    return conditionHolds(s, self, cond, item.paidWithSoul, item.catalyzed, db);
  };
  const opp = opponentOf(me);
  const spiritLike = (id: string) => isSpiritLike(db.get(s.cards[id]!.cardNo));
  /** เอฟเฟกต์นี้ส่งผลถึงการ์ดนี้ได้ (ไม่ติด Ultra Shield ฯลฯ) */
  // ทุกจุดเรียกหลังกรองเป้าตามเอฟเฟกต์แล้ว: ถูกกัน = การ์ดนี้ควรโดนแต่ Shield กันไว้ → เรืองแสงการ์ดที่ให้ Shield
  // BS11 โฮมุระแมนดริล: [เอฟเฟกต์ทำลาย BP] ของการ์ดที่ระบุ ขอบเขต +N และ Ultra Shield ป้องกันไม่ได้
  const bpBoost =
    (step.do === 'destroyChosenOpponent' || step.do === 'destroyAllOpponent') && step.filter.maxBp !== undefined && s.cards[self]
      ? bpDestroyBoostFor(s, db, self)
      : null;
  const hits = (id: string) => {
    if (bpBoost?.pierce && s.cards[id]?.owner !== me) return true;
    const blocker = effectBlocker(s, db, item.sourceId, id);
    emitStatic(ctx, blocker);
    if (blocker !== null) return false;
    // BS12 ฮาคุไร: สปิริตเผ่าที่ระบุของคู่แข่งจะไม่กลับขึ้นมือ/เข้ากองจากบนฟิลด์โดยเอฟเฟกต์ของเรา
    if (BOUNCE_STEPS.has(step.do) && !(step.do === 'opponentTotalBp' && step.action !== 'bounce') && s.cards[id]?.owner !== me) {
      const im = bounceImmuneSource(s, db, id);
      if (im) {
        emitStatic(ctx, im);
        return false;
      }
    }
    return true;
  };
  /** การ์ดในแทรชที่เอฟเฟกต์ส่งผลได้ (เทปเปคิวอลล์ไม่รับผล) */
  const inTrashOk = (id: string) => !trashImmune(db, s, id);
  /** BS12 ทรูธ-อีเด็น: การ์ดที่ต้องจ่ายคอสต์อย่างน้อย N อัญเชิญไม่จ่ายคอสต์ไม่ได้ */
  const freeSummonOk = (id: string) => !db.get(s.cards[id]!.cardNo).abilities.some((a) => a.kind === 'minSummonPay');
  /**
   * Dispersion: เมจิคของเราที่เล็งเป้าการ์ดคู่แข่ง 1 ตัว ระหว่างที่ไรกะโจมตี/ป้องกัน = เล็งได้ N ตัว
   * คืน true ถ้าขยายแล้ว (step ใหม่เข้าคิวแทน)
   */
  const disperse = (count: number, st: Step & { dispersed?: true }): boolean => {
    // กติกา 14 Dispersion: เฉพาะเมจิค 1 เป้า, เอฟเฟกต์จากเบิร์สกระจายไม่ได้ (แฟลชที่จ่ายต่อจากเบิร์สกระจายได้: isBurst ถูกล้างตอนจ่าย)
    if (count !== 1 || st.dispersed || item.controller !== me || item.isBurst) return false;
    const src = s.cards[item.sourceId];
    if (!src) return false;
    const srcDef = db.get(src.cardNo);
    // เมจิค หรือสปิริตที่ใช้เป็นเมจิค (เจ้าของโปรเจกต์กำหนด)
    if (srcDef.type !== 'magic' && !item.asMagic) return false;
    // ข้อ 11: เล็งหลายเป้าพร้อมกัน ("อย่างละ 1 ตัว" / "นอกจากนั้น") กระจายไม่ได้
    if (srcDef.abilities.some((a) => a.kind === 'magic' && a.noDispersion)) return false;
    // ข้อ 1: เฉพาะเอฟเฟกต์ที่เล็งสปิริต/อัลติเมท (เบรฟที่ยืนเดี่ยวนับเป็นสปิริต) · เล็งเน็กซัส กระจายไม่ได้
    const types = 'filter' in st ? (st.filter as CardFilter | undefined)?.types : undefined;
    if (types && types.some((t) => t !== 'spirit' && t !== 'ultimate' && t !== 'brave')) return false;
    const n = dispersionCount(s, db, me);
    if (n <= 1) return false;
    item.steps.unshift({ ...st, count: n, dispersed: true } as Step);
    return true;
  };

  /** การ์ดที่เลือกได้จาก "ในมือ": ไม่รวมการ์ดนอกมือ เว้นแต่ตัวกรองระบุ withShown ("ในมือ/นอกมือ") */
  const handPool = (p: PlayerId, st: Step): string[] => ('filter' in st && st.filter && (st.filter as CardFilter).withShown ? s.players[p].hand : handCards(s, p));

  // BS07 "ต่อจำนวน ...": คูณจำนวน/ค่าก่อนทำ (ได้ 0 = ไม่ทำ)
  if ('per' in step && step.per) {
    const k = countPer(ctx, item, step.per);
    if (k <= 0) return;
    const { per: _p, ...rest } = step;
    const scaled = (
      rest.do === 'buffSelf' ? { ...rest, amount: rest.amount * k } : { ...rest, count: ((rest as { count?: number }).count ?? 1) * k }
    ) as Step;
    item.steps.unshift(scaled);
    return;
  }
  // "ที่ไม่ใช่สปิริตนี้"
  if ('filter' in step && step.filter && (step.filter as CardFilter).notSelf) {
    const f = step.filter as CardFilter;
    item.steps.unshift({ ...step, filter: { ...f, notSelf: undefined, excludeIds: [...(f.excludeIds ?? []), self] } } as Step);
    return;
  }
  // "ทีมเดียวกันกับสปิริตนี้/สปิริตที่...": แปลงเป็นชื่อทีมจริงก่อน
  if ('filter' in step && step.filter && ((step.filter as CardFilter).sameTeamAs || (step.filter as CardFilter).sameFamilyAs)) {
    item.steps.unshift({ ...step, filter: withTeamOf(s, db, step.filter as CardFilter, self, item.subjectId) } as Step);
    return;
  }

  switch (step.do) {
    case 'draw': {
      if (!holds(step.if)) return;
      const before = s.players[me].hand.length;
      for (let i = 0; i < step.count * (step.perLifeLost ? (item.lifeLost ?? 0) : 1); i++) drawCard(ctx, me, true);
      const n = s.players[me].hand.length - before;
      // คิชูด็อก: จั่วตั้งแต่ 2 ใบในครั้งเดียวโดยเอฟเฟกต์ → การ์ดบนสนามและในมือทั้งหมดของฝ่ายนี้ไปใต้สุดเด็ค
      if (n >= 2 && multiDrawPunished(s, db)) {
        emitStatic(ctx, staticSources(s, db, PLAYERS, 'multiDrawPunish'));
        massToDeckBottom(ctx, me);
        return;
      }
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
      // Charge: เอฟเฟกต์เสื่อมสภาพคู่แข่งของเรา จำนวนตัว + (คามุย-ฮายาเตะ)
      if (!step.charged) {
        const bonus = chargeBonus(s, db, me, 'exhaustCountBoost');
        if (bonus > 0) {
          item.steps.unshift({ ...step, count: step.count + bonus, charged: true });
          return;
        }
      }
      const pool = step.anySide ? [...s.players[me].field, ...s.players[opp].field] : s.players[opp].field;
      const candidates = pool.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && (!step.filter || matchesFilter(s, db, id, step.filter)) && (s.cards[id]!.owner === me || hits(id)),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริต${step.anySide ? '' : 'ของคู่แข่ง'}ที่จะเสื่อมสภาพ (${step.count} ตัว)`, candidates, step });
      return;
    }

    case 'exhaustAllOpponent':
      if (!holds(step.if)) return;
      for (const id of s.players[opp].field) {
        if (spiritLike(id) && s.cards[id]!.state === 'refresh' && matchesFilter(s, db, id, step.filter) && hits(id)) {
          s.cards[id]!.state = 'exhausted';
          emit(ctx, { type: 'exhausted', cardId: id });
          queueExhaustTriggers(ctx, id);
        }
      }
      return;

    case 'millSelf': {
      if (millBlocked(s, db)) {
        if (step.count > 0 && s.players[me].deck.length > 0) emitStatic(ctx, staticSources(s, db, PLAYERS, 'noMill'));
        return;
      }
      const deck = s.players[me].deck;
      const ids = deck.splice(0, Math.min(step.count, deck.length));
      if (ids.length === 0) return;
      s.players[me].trashCards.push(...ids);
      item.milled = ids;
      emit(ctx, { type: 'milled', player: me, cardIds: ids });
      queueMilledAny(ctx, ids);
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
      // Charge: เอฟเฟกต์ถอดคอร์ลงรีเสิร์ฟของเรา ถอดเพิ่ม (ไลท์นิ่ง-ชิออน)
      if (!step.charged && (step.to ?? 'reserve') === 'reserve' && !step.untilOne && !step.opponentChooses) {
        const bonus = chargeBonus(s, db, me, 'coreRemovalBoost');
        if (bonus > 0) {
          item.steps.unshift((step.perPick ?? 1) > 1 || step.count === 1 ? { ...step, perPick: (step.perPick ?? 1) + bonus, charged: true } : { ...step, count: step.count + bonus, charged: true });
          return;
        }
      }
      const candidates = s.players[opp].field.filter(
        (id) =>
          (step.filter?.types ? true : spiritLike(id)) &&
          hits(id) &&
          s.cards[id]!.cores.length > (step.untilOne ? 1 : 0) &&
          (!step.filter || matchesFilter(s, db, id, step.filter)) &&
          !coreRemovalImmune(s, db, id),
      );
      // BS09 เฮล-สคัล / BS10 มุโดว: เลือกคอร์ในรีเสิร์ฟ / แทรชของคู่แข่งได้ด้วย (กองคอร์เป็นตัวเลือกหนึ่งในหน้าแบ่งคอร์)
      const pileFrom: 'reserve' | 'trash' | null = step.withReserve ? 'reserve' : step.withTrash ? 'trash' : null;
      // 2VS2: กองของคู่แข่งแต่ละคนเป็นตัวเลือกแยกกัน (เลือกจากของทั้งสองคนรวมกัน: กติกา 15 ข้อ 8) · id "pile:<กอง>:<ฝั่ง>[:1]"
      const piles = pileFrom
        ? seatsOf(s, opp).map((seat) => {
            const z = zonesOf(s, opp, seat);
            const cap = (pileFrom === 'reserve' ? z.reserve : z.trashCores).filter((c) => (step.to ?? 'reserve') !== 'void' || !s.cores[c]!.isSoul).length;
            return { id: `pile:${pileFrom}:${opp}${seat ? ':1' : ''}`, cap };
          })
        : [];
      const pileCap = piles.reduce((n, p) => n + p.cap, 0);
      if (candidates.length === 0 && pileCap === 0) return;
      // หลายเม็ด (ทีละ 1 เม็ดต่อการเลือก): แบ่งจำนวนให้แต่ละตัวทีเดียว แล้วส่งออกพร้อมกัน (เจ้าของโปรเจกต์กำหนด)
      if (!step.untilOne && (step.perPick ?? 1) === 1 && (step.count > 1 || pileCap > 0)) {
        const to = step.to ?? 'reserve';
        // กติกา 07 ข้อ 4: โซลคอร์ไม่ถูกนำไปวอยด์
        const caps: Record<string, number> = Object.fromEntries(candidates.map((id) => [id, s.cards[id]!.cores.filter((c) => to !== 'void' || !s.cores[c]!.isSoul).length]));
        for (const p of piles) if (p.cap > 0) caps[p.id] = p.cap;
        const usable = [...candidates, ...piles.filter((p) => p.cap > 0).map((p) => p.id)].filter((id) => caps[id]! > 0);
        const total = Math.min(step.count, usable.reduce((n, id) => n + caps[id]!, 0));
        if (total === 0) return;
        const where = to === 'trash' ? 'แทรช' : to === 'void' ? 'วอยด์' : 'รีเสิร์ฟ';
        ask(
          ctx,
          item,
          {
            kind: 'distribute',
            prompt: `เลือกคอร์บนสปิริต/อัลติเมท${step.opponentChooses ? 'ของตัวเอง' : 'ของคู่แข่ง'}${pileFrom ? ` (หรือคลิกช่อง${pileFrom === 'reserve' ? 'รีเสิร์ฟ' : 'แทรช'}คู่แข่ง)` : ''}ที่จะส่งไป${where} รวม ${total} เม็ด`,
            candidates: usable,
            caps: Object.fromEntries(usable.map((id) => [id, caps[id]!])),
            total,
            to,
            step,
          },
          step.opponentChooses ? opp : me,
        );
        return;
      }
      const prompt = step.untilOne
        ? 'เลือกสปิริต/อัลติเมทของคู่แข่งที่จะส่งคอร์ไปรีเสิร์ฟจนเหลือ 1 เม็ด'
        : `เลือกสปิริต/อัลติเมท${step.opponentChooses ? 'ของตัวเอง' : 'ของคู่แข่ง'}ที่จะส่งคอร์ ${step.perPick ?? 1} เม็ดไป${step.to === 'trash' ? 'แทรช' : step.to === 'void' ? 'วอยด์' : 'รีเสิร์ฟ'} (อีก ${step.count} ครั้ง)`;
      ask(ctx, item, { kind: 'card', prompt, candidates, step }, step.opponentChooses ? opp : me);
      return;
    }

    case 'exhaustOpponentTotalBp': {
      const candidates = s.players[opp].field.filter(
        // ตัวที่ไม่รับผลเอฟเฟกต์ของการ์ดนี้ (ชิโมะคาเสะ ฯลฯ) เลือกไม่ได้
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && currentBp(s, db, id) <= step.maxTotal && hits(id),
      );
      if (candidates.length === 0 || step.final) return;
      askBudget(ctx, item, candidates, step, `เลือกสปิริตของคู่แข่งที่จะเสื่อมสภาพ (BP รวมไม่เกิน ${step.maxTotal.toLocaleString()})`, 'BP', step.maxTotal, (id) => currentBp(s, db, id));
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
      if (step.bpFrom === 'subject') {
        if (!item.subjectId || !onField(ctx, item.subjectId)) return;
        filter = { ...filter, maxBp: currentBp(s, db, item.subjectId) };
      }
      const pool = step.anySide ? [...s.players[me].field, ...s.players[opp].field] : s.players[opp].field;
      const candidates = pool.filter((id) => matchesFilter(s, db, id, filter) && hits(id));
      if (candidates.length === 0) return;
      const where = step.to === 'deckBottom' ? 'ไปไว้ใต้สุดเด็ค' : step.to === 'deckTop' ? 'ไปไว้บนสุดเด็ค' : 'กลับขึ้นมือ';
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ด${step.anySide ? '' : 'ของคู่แข่ง'}ที่จะนำ${where}`, candidates, step: { ...step, filter, costFrom: undefined, bpFrom: undefined } });
      return;
    }

    case 'bounceAllOpponent':
      if (!holds(step.if)) return;
      {
        const ids = s.players[opp].field.filter((id) => matchesFilter(s, db, id, step.filter) && hits(id));
        if (step.to === 'deckBottom') {
          // BS11 แปดเก็นจิ: ใต้สุดเด็คโดยเรียงลำดับได้ (รวมเบิร์สที่เซ็ทอยู่) ผู้ใช้เอฟเฟกต์เรียง
          const all = [...ids];
          const burst = s.players[opp].burst;
          if (step.withBurst && burst && !burstProtectSource(s, db, opp)) {
            s.players[opp].burst = null;
            s.players[opp].deck.unshift(burst);
            all.push(burst);
          }
          for (const id of ids) returnCard(ctx, id, 'deckTop');
          item.bouncedCount = (item.bouncedCount ?? 0) + ids.length;
          const onTop = all.filter((id) => s.players[opp].deck.includes(id));
          if (onTop.length > 0) item.steps.unshift({ do: 'toDeckBottom', cardIds: onTop });
          return;
        }
        if (step.to !== 'deckTop' && bounceRedirect(ctx, item, me, ids, item.steps)) {
          item.bouncedCount = (item.bouncedCount ?? 0) + ids.length;
          return;
        }
        for (const id of ids) returnCard(ctx, id, step.to === 'deckTop' ? 'deckTop' : 'hand');
        item.bouncedCount = (item.bouncedCount ?? 0) + ids.length;
        // บนสุดเด็คโดยเรียงลำดับได้ (เซ็นริวดาคุ Soul Drive): ผู้ใช้เอฟเฟกต์เรียง
        const onTop = ids.filter((id) => s.players[opp].deck.includes(id));
        if (step.to === 'deckTop' && onTop.length > 1) item.steps.unshift({ do: 'toDeckTop', cardIds: onTop });
      }
      return;

    case 'battleUnblockable':
      if (s.battle && holds(step.if)) s.battle.unblockable = step.by ?? 'all';
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
      // กติกา 14 ห้ามเมจิค: ร่ายเมจิคจากในมือ/นอกมือไม่ได้เลย (วัดอรุณ)
      if (magicBanned(s, me)) return;
      const candidates = handPool(me, step).filter((id) => {
        const d = db.get(s.cards[id]!.cardNo);
        return !magicBanned(s, me, db, d) && d.type === 'magic' && d.abilities.some((a) => a.kind === 'magic' && a.timing === 'flash');
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
      const names = new Set<string>();
      const take = revealed.filter((id) => {
        if (!matchesFilter(s, db, id, step.filter)) return false;
        if (!step.distinctNames) return true;
        const name = db.get(s.cards[id]!.cardNo).name;
        if (names.has(name)) return false;
        names.add(name);
        return true;
      });
      for (const id of take) {
        removeFrom(s.players[me].deck, id);
        s.players[me].hand.push(id);
        emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'deck' });
      }
      if (take.length > 0) handIncreasedByEffect(ctx, me);
      const rest = revealed.filter((id) => !take.includes(id));
      if (rest.length > 0 && step.rest === 'bottom') item.steps.unshift({ do: 'toDeckBottom', cardIds: rest });
      else if (rest.length > 0) mill(ctx, me, rest);
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
        const got = takeVoid(ctx, me, step.count);
        s.players[me].reserve.push(...got);
        if (got.length > 0) emit(ctx, { type: 'voidCore', player: me, cardId: null, count: got.length });
      } else if (step.to === 'subject') {
        if (item.subjectId && onField(ctx, item.subjectId)) addVoidCores(ctx, me, item.subjectId, step.count);
      } else if (step.to === 'trash') {
        const got = takeVoid(ctx, me, step.count);
        s.players[me].trashCores.push(...got);
        if (got.length > 0) emit(ctx, { type: 'voidCore', player: me, cardId: null, count: got.length, trash: true });
      } else if (step.to === 'self') {
        if (onField(ctx, self)) addVoidCores(ctx, me, self, step.count);
      } else if (step.to === 'refreshedByThis') {
        for (const id of item.refreshedByThis ?? []) if (onField(ctx, id)) addVoidCores(ctx, me, id, step.count);
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

    case 'toDeckTop': {
      // "นำกลับไปไว้บนสุดเด็คโดยเรียงลำดับได้": การ์ดยังอยู่บนสุดเด็ค เลือกใบที่จะอยู่ล่างสุดของกลุ่มก่อน
      const deckOwner = s.cards[step.cardIds[0]!]?.owner ?? me;
      const left = step.cardIds.filter((id) => s.players[deckOwner].deck.includes(id));
      if (left.length <= 1 || left.every((id) => s.cards[id]!.cardNo === s.cards[left[0]!]!.cardNo)) return;
      ask(ctx, item, { kind: 'arrange', prompt: `เรียงลำดับการ์ดที่จะนำกลับไปไว้บนสุดเด็ค${deckOwner === me ? '' : 'คู่แข่ง'} (1 = บนสุด)`, cardIds: left, where: 'top', step });
      return;
    }

    case 'toDeckBottom': {
      // เด็คของเจ้าของการ์ด (BS11: การ์ดของคู่แข่งไปใต้สุดเด็คคู่แข่ง ผู้ใช้เอฟเฟกต์เรียง)
      const deckOwner = s.cards[step.cardIds[0]!]?.owner ?? me;
      const left = step.cardIds.filter((id) => s.players[deckOwner].deck.includes(id));
      if (left.length === 0) return;
      // ใบเดียว หรือการ์ดชื่อเดียวกันทั้งหมด: ลำดับไม่มีผล ไม่ต้องถาม
      if (left.length === 1 || left.every((id) => s.cards[id]!.cardNo === s.cards[left[0]!]!.cardNo)) {
        for (const id of left) toBottom(ctx, deckOwner, id);
        return;
      }
      ask(ctx, item, { kind: 'arrange', prompt: `เรียงลำดับการ์ดที่จะนำไปไว้ใต้สุดเด็ค${deckOwner === me ? '' : 'คู่แข่ง'} (ใบสุดท้าย = ล่างสุด)`, cardIds: left, where: 'bottom', step });
      return;
    }

    case 'summonThisFree':
      item.trashWhenDone = false;
      item.steps.unshift({ do: 'placeCores', cardId: item.sourceId });
      return;

    case 'placeCores': {
      const def = db.get(s.cards[step.cardId]!.cardNo);
      // Bunshin: วางคอร์จากรีเสิร์ฟตั้งแต่ 1 เม็ด (ไม่ใช่การอัญเชิญ)
      if (step.clone) {
        const c = s.cards[step.cardId]!;
        if (s.players[me].reserve.length === 0 || !s.players[me].deck.includes(step.cardId)) {
          if (c.realCardNo) {
            c.cardNo = c.realCardNo;
            delete c.realCardNo;
          }
          return;
        }
        ask(ctx, item, { kind: 'placeCores', prompt: 'สปิริตร่างแยก: วาง Core จากรีเสิร์ฟ (อย่างน้อย 1 ดวง)', cardId: step.cardId, min: 1, step });
        return;
      }
      // BS12 ทรูธ-อีเด็น: อัญเชิญไม่ได้ถ้าไม่จ่ายคอสต์อย่างน้อย N (การอัญเชิญด้วยเอฟเฟกต์ทั้งหมดไม่จ่ายคอสต์) → การ์ดอยู่ที่เดิม
      if (!step.noSummon && def.abilities.some((a) => a.kind === 'minSummonPay')) {
        if (step.cardId === item.sourceId && !inAnyZone(ctx, me, step.cardId)) item.trashWhenDone = true;
        return;
      }
      // BS10 สิงโตควันม่วง: "เมื่อทำการอัญเชิญการ์ดนี้ สามารถทิ้งใบบนสุดเด็คได้" (อัญเชิญไม่จ่ายคอสต์ก็ทิ้งได้)
      if (!step.noSummon && !step.millAsked) {
        const mab = def.abilities.find((a) => a.kind === 'millCostReduce');
        const max = mab?.kind === 'millCostReduce' ? Math.min(mab.max, s.players[me].deck.filter((id) => id !== step.cardId).length) : 0;
        if (max > 0) {
          item.steps.unshift({
            do: 'chooseOne',
            options: Array.from({ length: max + 1 }, (_, n) => ({
              label: n === 0 ? 'ไม่ทิ้งเด็ค' : `ทิ้งใบบนสุดเด็ค ${n} ใบ`,
              steps: [...(n > 0 ? [{ do: 'millSelfN' as const, n }] : []), { ...step, millAsked: true as const }],
            })),
          });
          return;
        }
      }
      // BS10 สิงโตควันม่วง: อัญเชิญสปิริต/เบรฟที่ไม่ใช่สีม่วงโดยเอฟเฟกต์ ต้องจ่ายคอสต์เพิ่ม
      if (!step.noSummon && !step.taxPaid) {
        const tax = effectSummonTax(s, db, step.cardId);
        if (tax.cost > 0) {
          emitStatic(ctx, tax.sources);
          if (usableCores(ctx, me).length < tax.cost + summonMinCores(s, db, step.cardId)) {
            if (step.cardId === item.sourceId && !inAnyZone(ctx, me, step.cardId)) item.trashWhenDone = true;
            else if (!inAnyZone(ctx, me, step.cardId)) s.players[me].trashCards.push(step.cardId);
            return;
          }
          item.steps.unshift({ do: 'payBurstTax', cost: tax.cost, label: `จ่ายคอสต์เพิ่ม ${tax.cost} เพื่ออัญเชิญ ${def.name} (ไม่จ่าย = ไม่อัญเชิญ)`, then: [{ ...step, taxPaid: true }] });
          return;
        }
      }
      // Brave ที่อัญเชิญด้วยเอฟเฟกต์: เลือกได้ว่าจะร่วมร่างหรือลงเป็นสปิริต
      if (def.type === 'brave' && !step.noSummon && !step.asSpirit && braveHostsFor(ctx, me, step.cardId).length > 0) {
        item.steps.unshift({ do: 'braveOrSpirit', cardId: step.cardId });
        return;
      }
      // อัญเชิญด้วยเอฟเฟกต์: ใช้ Core จากรีเสิร์ฟและบนการ์ดในสนามของเราได้
      // เบรฟที่คงอยู่หลังร่างต้นออกจากสนาม: ดึงจากรีเสิร์ฟเท่านั้น (กติกา 04 ข้อ 2.2)
      const available = step.noSummon ? s.players[me].reserve.length : usableCores(ctx, me).length;
      const need = summonMinCores(s, db, step.cardId); // รวม Lv คอสต์ +N
      if (!step.noSummon && available < need) {
        // วาง Core กำหนด Lv1 ไม่ได้ = อัญเชิญไม่ได้ (เจ้าของโปรเจกต์กำหนด) การ์ดอยู่ที่เดิม
        // การ์ดที่กำลังใช้อยู่เอง (เบิร์ส/เมจิค "อัญเชิญการ์ดนี้") ไม่ได้อยู่ในโซนไหน → ลงแทรชตามปกติของการ์ดที่ใช้แล้ว
        if (step.cardId === item.sourceId && !inAnyZone(ctx, me, step.cardId)) item.trashWhenDone = true;
        return;
      }
      // เบรฟที่คงอยู่หลังผู้ร่วมร่างออกจากสนาม: ไม่มี Core ให้วาง = สูญสลาย (กติกา 04 ข้อ 2.2)
      if (available === 0) {
        putOnField(ctx, item, step, []);
        return;
      }
      const min = Math.min(need, available);
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

    case 'braveFate': {
      // กติกา 04 ข้อ 2.2: คงอยู่ = กำหนดคอร์ใหม่โดยดึงจากรีเสิร์ฟ · รีเสิร์ฟไม่พอเลเวล 1 = คงอยู่ไม่ได้ ลงแทรชพร้อมร่างต้น
      if (s.players[me].reserve.length < summonMinCores(s, db, step.cardId)) {
        item.steps.unshift({ do: 'braveTrash', cardId: step.cardId });
        return;
      }
      item.steps.unshift({
        do: 'chooseOne',
        options: [
          {
            label: 'ให้เบรฟอยู่บนสนามต่อ (วาง Core จากรีเสิร์ฟ)',
            steps: [{ do: 'placeCores', cardId: step.cardId, state: step.state, noSummon: true, ...(step.continuesAttackOf ? { continuesAttackOf: step.continuesAttackOf } : {}) }],
          },
          { label: 'ส่งเบรฟลง Trash', steps: [{ do: 'braveTrash', cardId: step.cardId }] },
        ],
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
      // Charge: เอฟเฟกต์ฟื้นสภาพสปิริตของเรา จำนวนตัว + (คราวน์-โซลาร์)
      if (!step.charged) {
        const bonus = chargeBonus(s, db, me, 'refreshCountBoost');
        item.steps.unshift({ ...step, count: (step.count ?? 1) + bonus, charged: true });
        return;
      }
      if ((step.count ?? 1) < 1) return;
      const candidates = s.players[me].field.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'exhausted' && matchesFilter(s, db, id, step.filter) && !(step.exclude ?? []).includes(id),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตเราที่จะฟื้นสภาพ (อีก ${step.count ?? 1} ตัว)`, candidates, step });
      return;
    }

    case 'opponentLifeToReserve': {
      const n = step.count * (step.per ? countPer(ctx, item, step.per) : 1);
      if (n <= 0) return;
      if (!loseLife(ctx, opp, n, me, step.to === 'trash' ? 'trash' : undefined)) queueLifeLostTriggers(ctx, opp, n);
      return;
    }

    case 'selfCoresToTrash': {
      const card = s.cards[self]!;
      if (!onField(ctx, self) || card.cores.length < step.count) return;
      item.steps.unshift({ do: 'coresOff', cardId: self, n: step.count, to: step.to ?? 'trash', byOpponent: false });
      return;
    }

    case 'applyPicks': {
      let picks = step.picks;
      // กลับมาหลังถาม Kagemusha: อัญเชิญการ์ด Kagemusha แล้ว = เอฟเฟกต์ทั้งหมดเล็งการ์ดนั้นแทน (กติกา 14 Kagemusha ข้อ 2)
      if (item.kageForce) {
        const kage = item.kageForce.kage;
        item.kageForce = undefined;
        if (kage && onField(ctx, kage)) {
          item.kageDone = [...(item.kageDone ?? []), kage];
          // การ์ด Kagemusha ไม่รับผลเอฟเฟกต์นี้ = ดูดมาแล้วลบทิ้ง
          if (!hits(kage)) return;
          picks = [kage];
        }
      }
      // เป้าที่ยังอยู่ที่เดิม (สนาม / มือ)
      picks = picks.filter((id) => onField(ctx, id) || PLAYERS.some((p) => s.players[p].hand.includes(id)));
      if (picks.length === 0) return;
      // ถาม Kagemusha ของทุกเป้าก่อนเกิดผล
      if (step.kage) {
        for (const id of picks) {
          if (s.cards[id]!.owner === step.player || (item.kageDone ?? []).includes(id)) continue;
          if (kagemusha(ctx, item, { ...step, picks }, id, true)) return;
        }
      }
      // ทำผลทีละใบต่อกันทันที (ใบที่เหลือทำต่อหลังผลของใบนี้)
      const [first, ...rest] = picks;
      if (rest.length > 0) item.steps.unshift({ ...step, picks: rest, kage: false });
      applyCardPick(ctx, item, { kind: 'card', player: step.player, sourceId: item.sourceId, prompt: '', candidates: picks, step: step.step }, step.player, first!);
      return;
    }

    case 'coresOffBatch': {
      let alloc = step.alloc;
      // กลับมาหลังถาม Kagemusha: อัญเชิญการ์ด Kagemusha แล้ว = เอฟเฟกต์ทั้งหมดเล็งการ์ดนั้นแทน (กติกา 14 Kagemusha ข้อ 2)
      if (item.kageForce) {
        const kage = item.kageForce.kage;
        item.kageForce = undefined;
        if (kage && onField(ctx, kage)) {
          item.kageDone = [...(item.kageDone ?? []), kage];
          // การ์ด Kagemusha ไม่รับผลเอฟเฟกต์นี้ = ดูดมาแล้วลบทิ้ง
          if (!hits(kage)) return;
          alloc = [{ cardId: kage, n: alloc.reduce((n, a) => n + a.n, 0) }];
        }
      }
      alloc = alloc.filter((a) => a.n > 0 && onField(ctx, a.cardId));
      if (alloc.length === 0) return;
      // ถาม Kagemusha ของทุกเป้าก่อนส่งคอร์ออก
      if (step.kage) {
        for (const a of alloc) {
          if (s.cards[a.cardId]!.owner === me || (item.kageDone ?? []).includes(a.cardId)) continue;
          if (kagemusha(ctx, item, { ...step, alloc }, a.cardId, true)) return;
        }
      }
      // Soul Core (กติกา 07 Q2): เจ้าของการ์ดเลือกของแต่ละตัวให้ครบก่อน แล้วค่อยส่งออกพร้อมกัน
      if (step.to !== 'void') {
        for (const [i, a] of alloc.entries()) {
          if (a.soul !== undefined) continue;
          const card = s.cards[a.cardId]!;
          const n = Math.min(a.n, card.cores.length);
          const normals = card.cores.filter((c) => !s.cores[c]!.isSoul).length;
          const hasSoul = card.cores.some((c) => s.cores[c]!.isSoul);
          if (!hasSoul || n >= card.cores.length || normals < n) continue;
          const withSoul = (soul: boolean): Step => ({ ...step, alloc: alloc.map((x, j) => (j === i ? { ...x, soul } : x)) });
          const where = step.to === 'trash' ? 'แทรช' : 'รีเสิร์ฟ';
          const options = [
            { label: `ส่งคอร์ปกติ ${n} เม็ด (เก็บ Soul Core ไว้)`, steps: [withSoul(false)] },
            { label: n > 1 ? `ส่ง Soul Core + คอร์ปกติ ${n - 1} เม็ด` : 'ส่ง Soul Core', steps: [withSoul(true)] },
          ];
          ask(
            ctx,
            item,
            { kind: 'option', prompt: `${db.get(card.cardNo).name}: เลือกคอร์ที่จะส่งไป${where} ${n} เม็ด`, options: options.map((o) => o.label), step: { do: 'chooseOne', options } },
            card.owner,
          );
          return;
        }
      }
      // ส่งออกทุกตัวต่อกันทันที (ไม่มีการเลือกคั่น)
      item.steps.unshift(...alloc.map((a): Step => ({ do: 'coresOff', cardId: a.cardId, n: a.n, to: step.to, byOpponent: true, soul: a.soul ?? false })));
      return;
    }

    case 'coresOff': {
      // กติกา 07 Q2: เอฟเฟกต์ส่งคอร์ออก ถ้าการ์ดมี Soul Core เจ้าของการ์ดเลือกได้ว่าจะส่ง Soul Core หรือคอร์ปกติ
      const card = s.cards[step.cardId];
      if (!card || !onField(ctx, step.cardId)) return;
      let n = Math.min(step.n, card.cores.length);
      // เจ้าแห่งน้ำ โอตโตะ: คู่แข่งทำให้คอร์เหลือต่ำกว่า N เม็ดไม่ได้
      if (step.byOpponent && n > 0) {
        const floor = coreFloorOf(s, db, step.cardId);
        if (floor && card.cores.length - n < floor.min) {
          n = Math.max(0, card.cores.length - floor.min);
          emitStatic(ctx, floor.src);
        }
      }
      if (n <= 0) return;
      const normals = card.cores.filter((c) => !s.cores[c]!.isSoul);
      const soulCore = card.cores.find((c) => s.cores[c]!.isSoul);
      const where = step.to === 'trash' ? 'แทรช' : step.to === 'void' ? 'วอยด์' : 'รีเสิร์ฟ';
      // กติกา 07 ข้อ 4: โซลคอร์ไม่ถูกนำไปวอยด์
      if (step.to === 'void') {
        const moved = normals.slice(0, n);
        if (moved.length === 0) return;
        const preLevel = cardLevel(s, db, step.cardId);
        card.cores = card.cores.filter((c) => !moved.includes(c));
        for (const c of moved) delete s.cores[c];
        emit(ctx, { type: 'coresRemoved', cardId: step.cardId, count: moved.length, to: 'void' });
        const pdef = db.get(card.cardNo);
        if (isSpiritLike(pdef) && levelOf(pdef, card.cores.length) === 0) depleteByOpponent(ctx, item, step.cardId, preLevel, !!soulCore);
        return;
      }
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
      if (leaveField(ctx, item.sourceId, 'hand') === 'trash') return;
      emit(ctx, { type: 'bounced', player: me, cardId: item.sourceId });
      handIncreasedByEffect(ctx, me);
      if (step.then) item.steps.unshift(...step.then);
      return;

    case 'setBurstFromHand': {
      // กติกา 06 Q5: การ์ดที่วางนอกมือนำมาเซ็ทเบิร์สไม่ได้
      const candidates = (step.withShown ? s.players[me].hand : handCards(s, me)).filter((id) => db.get(s.cards[id]!.cardNo).burst);
      if (candidates.length === 0) return;
      ask(ctx, item, step.then ? { kind: 'card', prompt: 'เลือกการ์ดที่มีเอฟเฟกต์ Burst บนมือไปเซ็ท', candidates, step } : { kind: 'card', prompt: 'เลือกการ์ดที่มีเอฟเฟกต์ Burst บนมือไปเซ็ท (ไม่เลือกก็ได้)', candidates, optional: true, step });
      return;
    }

    case 'catalyze': {
      const burstId = s.players[me].burst;
      if (!burstId) return;
      const def = db.get(s.cards[burstId]!.cardNo);
      const ab = def.abilities.find((x) => x.kind === 'burst');
      if (!ab || ab.kind !== 'burst' || !ab.soul || (step.color && !def.colors.includes(step.color)) || (step.colors && !step.colors.some((c) => def.colors.includes(c)))) return;
      emit(ctx, { type: 'catalyze', cardId: item.sourceId, burstId });
      // BS12 มิสึรุกิ: นับสปิริตคู่แข่งที่เบิร์สนี้ทำลาย/ทำให้สูญสลาย (นับใน destroy ของ ctx.ts และ depleteByOpponent)
      if (step.countKills) s.burstKills = { burstId, controller: me, count: 0 };
      // สั่งใช้ทันทีหลังเอฟเฟกต์นี้
      s.queue.splice(1, 0, {
        controller: me,
        sourceId: burstId,
        steps: [{ do: 'openBurst' }, ...ab.steps],
        paidWithSoul: false,
        trashWhenDone: false,
        announce: false,
        catalyzed: true,
        ...(step.allTargets ? { allTargets: true } : {}),
        ...(step.lifeAs && nameHas(def, step.lifeAs.names) ? { lifeAs: step.lifeAs.life } : {}),
      });
      // "หลังจากเบิร์สนั้นถูกสั่งใช้": ต่อท้ายเบิร์ส (subject = เบิร์สนั้น)
      if (step.then?.length) {
        s.queue.splice(2, 0, {
          controller: me,
          sourceId: item.sourceId,
          steps: [...step.then],
          paidWithSoul: false,
          trashWhenDone: false,
          announce: false,
          started: true,
          subjectId: burstId,
          ...(item.source !== undefined ? { source: item.source } : {}),
        });
      }
      return;
    }

    case 'buffSelf':
      if (!onField(ctx, self) || !holds(step.if)) return;
      if (step.untilBattleEnd) {
        // ไม่บอกระยะเวลา: มีผลจนจบการต่อสู้นั้น (หรือออกจากสนาม)
        s.cards[self]!.battleBp = (s.cards[self]!.battleBp ?? 0) + step.amount;
        emit(ctx, { type: 'bpBuffed', cardId: self, amount: step.amount });
      } else addTurnBp(ctx, self, step.amount);
      return;

    case 'buffSubject':
      if (item.subjectId && onField(ctx, item.subjectId)) addTurnBp(ctx, item.subjectId, step.amount);
      return;

    case 'buffChosen': {
      const candidates = (step.ally ? s.players[me].field : PLAYERS.flatMap((p) => s.players[p].field)).filter(
        (id) => isSpiritLike(db.get(s.cards[id]!.cardNo)) && (!step.filter || matchesFilter(s, db, id, step.filter)),
      );
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

    case 'destroyAllOpponent': {
      const f = bpBoost && step.filter.maxBp !== undefined ? { ...step.filter, maxBp: step.filter.maxBp + bpBoost.amount } : step.filter;
      if (bpBoost) emitStatic(ctx, bpBoost.src);
      for (const id of [...s.players[opponentOf(me)].field]) {
        if (matchesFilter(s, db, id, f) && hits(id)) {
          recordDestroyed(ctx, item, id);
          destroyCard(ctx, id, me, { bySource: item.sourceId, effect: true });
        }
      }
      return;
    }

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
        else if (step.rest === 'top') item.steps.unshift({ do: 'toDeckTop', cardIds: revealed });
        else mill(ctx, me, revealed);
        return;
      }
      const restText = step.rest === 'bottom' ? 'ที่เหลือไว้ใต้สุดเด็ค' : step.rest === 'top' ? 'ที่เหลือไว้บนสุดเด็คตามเดิม' : 'ที่เหลือลง Trash';
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ด 1 ใบขึ้นมือ ${restText}`, candidates, revealed, step });
      return;
    }

    case 'returnFromTrash': {
      if (!holds(step.if)) return;
      // BS09 วัดอรุณ: นำการ์ดในแทรชกลับขึ้นมือไม่ได้
      {
        const block = trashReturnBlocker(s, db, me);
        if (block) {
          if (s.players[me].trashCards.some((id) => matchesFilter(s, db, id, step.filter))) emitStatic(ctx, block);
          return;
        }
      }
      const candidates = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรช 1 ใบกลับขึ้นมือ', candidates, step });
      return;
    }

    case 'endAttackStepAfterBattle': {
      if (!s.battle || endAttackStepLocked(ctx, me)) return;
      // BS10 โฮเนะสุมิ: เอฟเฟกต์ "จบแอทแท็คสเต็ป" ของเมจิค → คู่แข่งส่งโซลคอร์บนโฮเนะสุมิลงแทรชได้ = ไร้ผล ถ้าเราไม่จ่ายเพิ่ม
      const srcCard = s.cards[item.sourceId];
      const isMagic = !!srcCard && (db.get(srcCard.cardNo).type === 'magic' || !!item.asMagic);
      const counter = !step.checked && isMagic ? endStepCounter(s, db, opp) : null;
      if (counter) {
        const name = db.get(s.cards[counter.cardId]!.cardNo).name;
        const done: Step = { ...step, checked: true };
        const options = [
          {
            label: `ส่ง Soul Core บน${name}ลงแทรช: เอฟเฟกต์จบแอทแท็คสเต็ปไร้ผล ถ้าคู่แข่งไม่จ่ายเพิ่ม ${counter.cost}`,
            steps: [
              { do: 'cardSoulToTrash' as const, cardId: counter.cardId },
              { do: 'payBurstTax' as const, cost: counter.cost, label: `จ่ายคอสต์เพิ่ม ${counter.cost} เพื่อให้เอฟเฟกต์จบแอทแท็คสเต็ปทำงาน (ไม่จ่าย = ไร้ผล)`, then: [done] },
            ],
          },
          { label: 'ไม่ใช้', steps: [done] },
        ];
        ask(ctx, item, { kind: 'option', prompt: `${name}: ทำให้เอฟเฟกต์จบแอทแท็คสเต็ปของคู่แข่งไร้ผล?`, options: options.map((o) => o.label), step: { do: 'chooseOne', options } }, opp);
        return;
      }
      s.battle.endAttackStepAfter = true;
      return;
    }

    case 'colorlessIfCatalyzed':
      if (item.catalyzed) s.colorlessTurn = [...(s.colorlessTurn ?? []).filter((t) => t.turn === s.turn), { cardId: item.sourceId, turn: s.turn }];
      return;

    case 'millSelfN': {
      const deck = s.players[me].deck;
      const ids = deck.splice(0, Math.min(step.n, deck.length));
      if (ids.length === 0) return;
      s.players[me].trashCards.push(...ids);
      emit(ctx, { type: 'milled', player: me, cardIds: ids });
      queueMilledAny(ctx, ids);
      return;
    }

    case 'cardSoulToTrash': {
      const c = s.cards[step.cardId];
      if (!c || !onField(ctx, step.cardId)) return;
      const soul = c.cores.find((x) => s.cores[x]!.isSoul);
      if (!soul) return;
      c.cores = c.cores.filter((x) => x !== soul);
      s.players[c.owner].trashCores.push(soul);
      emit(ctx, { type: 'soulToTrash', cardId: step.cardId });
      return;
    }

    case 'lifeOnBlockerDestroyed':
      if (s.battle?.attackerId === self && holds(step.if)) {
        if (step.to === 'trash') s.battle.lifeOnBlockerDestroyedTrash = (s.battle.lifeOnBlockerDestroyedTrash ?? 0) + step.amount;
        else if (step.onlyConsecutiveBlade) s.battle.lifeOnBlockerDestroyedByBlade += step.amount;
        else s.battle.lifeOnBlockerDestroyed += step.amount;
      }
      return;

    case 'soulToTrash': {
      // BS11 ลองฟิลด์: ถือว่าได้ส่งโซลคอร์ลงแทรชแล้ว (โซลคอร์ยังอยู่)
      {
        const free = soulCostFreeSource(s, db, self);
        if (free && onField(ctx, self)) {
          emitStatic(ctx, free);
          return;
        }
      }
      const card = s.cards[self]!;
      const soul = card.cores.find((id) => s.cores[id]!.isSoul);
      if (!soul || !onField(ctx, self)) return;
      card.cores.splice(card.cores.indexOf(soul), 1);
      s.players[me].trashCores.push(soul);
      emit(ctx, { type: 'soulToTrash', cardId: self });
      soulTrashedByEffect(ctx, item, me);
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
      // BS11 True-Consecutive Blade: เลือกระบุได้ไม่เกิน N ตัว ต่อสู้พร้อมกัน
      if (step.max && battle.chosenBlockers.length === 0) battle.maxBlockers = step.max;
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
        for (const id of [...teamHand(s, opp)]) queueTriggers(ctx, id, 'oppBurstActivated', batch);
        // "หลังจากเบิร์สของเราถูกสั่งใช้" (โฮมุแรดคอล): ทำงานหลังเบิร์สนี้
        for (const id of [...s.players[me].field]) queueTriggers(ctx, id, 'allyBurstActivated', batch, { subject: item.sourceId, subjectCatalyzed: !!item.catalyzed });
      }
      return;
    }

    case 'gainLifeFromVoid': {
      // องเมียววาราชิ: คอร์มาจากไลฟ์ของเจ้าของเอฟเฟกต์เอง = ไลฟ์ไม่เปลี่ยน
      // ฟุทสึโนะมิทามะ: ผู้เล่นทุกคนนำคอร์จากวอยด์มาวางที่ไลฟ์ไม่ได้
      {
        const no = noLifeFromVoidSource(s, db);
        if (no) {
          emitStatic(ctx, no);
          return;
        }
      }
      if (voidFromLife(s, db)) {
        emitStatic(ctx, staticSources(s, db, PLAYERS, 'voidFromLife'));
        return;
      }
      for (let i = 0; i < step.count; i++) s.players[me].life.push(newCore(ctx, me));
      if (step.count > 0) s.voidGained = { ...(s.voidGained ?? {}), [me]: (s.voidGained?.[me] ?? 0) + step.count };
      emit(ctx, { type: 'lifeGained', player: me, amount: step.count });
      return;
    }

    case 'payToUseFlash': {
      const def = db.get(s.cards[item.sourceId]!.cardNo);
      const timing = step.main ? 'main' : 'flash';
      if (!def.abilities.some((a) => a.kind === 'magic' && a.timing === timing)) return;
      const cost = payableCost(s, db, me, def);
      ask(ctx, item, { kind: 'payCost', prompt: `จ่ายคอสต์ ${cost} เพื่อใช้เอฟเฟกต์ [${step.main ? 'Main' : 'Flash'}] ของ ${def.name}?`, cost, step });
      return;
    }

    case 'refreshSelf':
      if (onField(ctx, self) && s.cards[self]!.state !== 'refresh' && holds(step.if)) refreshByEffect(ctx, self, item.sourceId);
      return;

    case 'destroyChosenOpponent': {
      if (!holds(step.if)) return;
      if (!step.anySide && disperse(step.count ?? 1, step)) return;
      // BP ไม่เกิน BP ของสปิริตนี้ / BP ที่ Lv1 ของสปิริตต้นเหตุ
      let filter = step.filter;
      if (step.bpFrom === 'self') {
        if (!onField(ctx, self)) return;
        filter = { ...filter, maxBp: currentBp(s, db, self) };
      } else if (step.bpFrom === 'chosen') {
        // BS12 เมาท์เทนเชพ: BP ไม่เกินสปิริตที่เพิ่งรับโซลคอร์
        if (!item.chosenId || !onField(ctx, item.chosenId)) return;
        filter = { ...filter, maxBp: currentBp(s, db, item.chosenId) };
      } else if (step.bpFrom === 'subjectLv1') {
        const subject = item.subjectId ? s.cards[item.subjectId] : undefined;
        if (!subject) return;
        filter = { ...filter, maxBp: db.get(subject.cardNo).levels[0]?.bp ?? 0 };
      }
      if (bpBoost && filter.maxBp !== undefined) {
        filter = { ...filter, maxBp: filter.maxBp + bpBoost.amount };
        emitStatic(ctx, bpBoost.src);
      }
      // คอสต์ไม่เกินคอสต์ของการ์ดอ้างอิง (ตัวนี้ / การ์ดที่เป็นเหตุ) · "คอสต์ +N" บนการ์ดนั้น (มิซึมาตะโอโรจิ) นับรวม
      // แถบด้านบนตัดข้อความยาว: เพดานคอสต์อยู่ต้นข้อความ (costCap) ที่มาของ +N อยู่ท้าย (costNote อ่านเต็มตอนกดขยาย)
      let costCap = '';
      let costNote = '';
      let boostedOnly: (cap: number) => boolean = () => false;
      let boostSrc: StaticSource[] = [];
      const capFrom = step.costFrom === 'self' ? self : step.costFrom === 'subject' ? item.subjectId : step.costFrom === 'chosen' ? item.chosenId : undefined;
      // ชามอน: คอสต์ไม่เกินผลรวมคอสต์ของสปิริต/อัลติเมทของเราที่ตรงตัวกรอง (ไม่รวมสปิริตนี้)
      if (step.costFrom === 'alliesSum') {
        const f = step.alliesFilter ?? {};
        const sum = s.players[me].field.filter((id) => id !== self && spiritLike(id) && matchesFilter(s, db, id, f)).reduce((n, id) => n + fieldCost(s, db, id), 0);
        filter = { ...filter, maxCost: sum };
        costCap = `คอสต์ไม่เกิน ${sum}`;
      } else if (step.costFrom) {
        if (!capFrom || !s.cards[capFrom] || (step.costFrom === 'self' && !onField(ctx, self))) return;
        const boosts = costBoostSources(s, db, capFrom);
        const cap = fieldCost(s, db, capFrom);
        const bonus = boosts.reduce((n, b) => n + b.amount, 0);
        filter = { ...filter, maxCost: cap };
        costCap = `คอสต์ไม่เกิน ${cap}`;
        if (bonus !== 0) {
          const names = [...new Set(boosts.map((b) => db.get(s.cards[b.cardId]!.cardNo).name))].join(', ');
          costNote = ` (${db.get(s.cards[capFrom]!.cardNo).name} ${cap - bonus} ${bonus > 0 ? '+' : ''}${bonus} จาก ${names})`;
          boostSrc = boosts;
          // เป้าที่เลือกได้เพราะ "คอสต์ +N" เท่านั้น (คอสต์เกินคอสต์เดิมของการ์ดอ้างอิง)
          boostedOnly = (c) => c > cap - bonus;
        }
      }
      // BS09 โกมาฟุ: [เอฟเฟกต์ทำลายคอสต์] ของสปิริตเผ่า [สมิงหัว] ของเรา ทำลายได้เพิ่ม +N คอสต์
      if (filter.maxCost !== undefined) {
        const dcb = destroyCostBoost(ctx, item);
        if (dcb.amount > 0) {
          const before = filter.maxCost;
          filter = { ...filter, maxCost: before + dcb.amount };
          if (costCap) costCap = `คอสต์ไม่เกิน ${before + dcb.amount}`;
          const prevBoosted = boostedOnly;
          boostedOnly = (c) => prevBoosted(c) || c > before;
          boostSrc = [...boostSrc, ...dcb.sources];
        }
      }
      // เลือกหลายตัว = คนละตัว (ตัวที่รอดด้วยเอฟเฟกต์แทนที่ไม่ถูกเลือกซ้ำ)
      const pool = step.anySide ? [...s.players[me].field, ...s.players[opponentOf(me)].field] : s.players[opponentOf(me)].field;
      const candidates = pool.filter((id) => matchesFilter(s, db, id, filter) && !step.exclude?.includes(id) && hits(id));
      if (candidates.length === 0) return;
      // "คอสต์ +N" ทำให้มีเป้าเพิ่มจริง → เรืองแสงการ์ดต้นเหตุก่อนให้เลือก
      if (candidates.some((id) => boostedOnly(fieldCost(s, db, id)))) emitStatic(ctx, boostSrc);
      const n = step.count ?? 1;
      const whose = step.anySide ? '' : 'ของคู่แข่ง';
      // เพดานคอสต์ขึ้นต้นประโยค (แถบด้านบนตัดท้าย) เช่น "คอสต์ไม่เกิน 6: เลือกการ์ดของคู่แข่งที่จะทำลาย (No.3 ร็อคแฮนด์ 4 +2 จาก มิซึมาตะโอโรจิแห่งเขียวคราม)"
      const base = n > 1 ? `เลือกการ์ด${whose}ที่จะทำลาย (อีก ${n} ตัว)` : costCap ? `เลือกการ์ด${whose}ที่จะทำลาย` : `เลือกการ์ด${whose} 1 ใบที่จะทำลาย`;
      const prompt = costCap ? `${costCap}: ${base}` : base;
      ask(ctx, item, { kind: 'card', prompt: prompt + costNote, candidates, step });
      return;
    }

    // ---------------- BS10 Bunshin
    case 'bunshin': {
      const p = s.players[me];
      const max = Math.min(step.max, p.deck.length, p.reserve.length);
      if (max <= 0) return;
      if (step.n === undefined) {
        item.steps.unshift({
          do: 'chooseOne',
          options: [
            ...Array.from({ length: max }, (_, i) => ({ label: `Bunshin: นำใบบนสุดเด็ค ${i + 1} ใบมาเป็นสปิริตร่างแยก`, steps: [{ do: 'bunshin' as const, max, n: i + 1 }] })),
            { label: 'ไม่ใช้', steps: [] },
          ],
        });
        return;
      }
      const ids = p.deck.slice(0, Math.min(step.n, max));
      // ใบบนสุดคว่ำเป็นสปิริตร่างแยก แล้ววางคอร์จากรีเสิร์ฟทีละใบ (ตั้งแต่ 1 เม็ด)
      for (const id of ids) {
        const card = s.cards[id]!;
        card.realCardNo = card.cardNo;
        card.cardNo = 'SMP-BUNSHIN';
        card.turnBp = 0;
        card.usedThisTurn = [];
        card.braves = [];
      }
      item.steps.unshift(...ids.map((id) => ({ do: 'placeCores' as const, cardId: id, clone: true as const })));
      emit(ctx, { type: 'bunshin', player: me, cardIds: ids });
      return;
    }

    case 'flipClone': {
      const candidates = s.players[me].field.filter((id) => !!s.cards[id]!.realCardNo);
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตร่างแยกของเราที่จะหงาย', candidates, step });
      return;
    }

    // ---------------- BS10
    case 'exhaustAllChosenColor': {
      const f = step.filter;
      if (!f.color) {
        const colors: [Color, string][] = [['red', 'แดง'], ['purple', 'ม่วง'], ['green', 'เขียว'], ['white', 'ขาว'], ['yellow', 'เหลือง'], ['blue', 'ฟ้า']];
        item.steps.unshift({ do: 'chooseOne', options: colors.map(([c, th]) => ({ label: `สี${th}`, steps: [{ do: 'exhaustAllChosenColor', filter: { ...f, color: c } }] })) });
        return;
      }
      for (const p of PLAYERS) {
        for (const id of [...s.players[p].field]) {
          if (s.cards[id]!.state !== 'refresh' || !matchesFilter(s, db, id, f) || (p !== me && !hits(id))) continue;
          s.cards[id]!.state = 'exhausted';
          emit(ctx, { type: 'exhausted', cardId: id });
          queueExhaustTriggers(ctx, id);
        }
      }
      return;
    }

    case 'blockSummonBurst':
      if (holds(step.if)) item.declined = true;
      return;

    case 'grantAttackNoBurstThisTurn':
      s.attackNoBurstGrants = [...(s.attackNoBurstGrants ?? []).filter((g) => g.turn === s.turn), { player: me, turn: s.turn, filter: step.filter }];
      return;

    case 'unblockableSelfThisTurn':
      if (!holds(step.if) || !onField(ctx, self)) return;
      s.unblockableTurn = [...(s.unblockableTurn ?? []).filter((u) => u.turn === s.turn), { cardId: self, turn: s.turn }];
      return;

    case 'symbolChosenAllyThisTurn': {
      const candidates = s.players[me].field.filter((id) => spiritLike(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะได้รับเจ็มเพิ่มในเทิร์นนี้', candidates, step });
      return;
    }

    case 'refreshOnBattlerGone':
      if (s.battle && onField(ctx, self)) s.battle.refreshOnGone = [...(s.battle.refreshOnGone ?? []), self];
      return;

    case 'lifeIfChosenBpAtMostSubject': {
      const chosen = item.exhaustedChosen;
      const subj = item.subjectId;
      if (!chosen || !subj || !s.cards[chosen] || !s.cards[subj] || !onField(ctx, chosen) || !onField(ctx, subj)) return;
      if (currentBp(s, db, chosen) <= currentBp(s, db, subj)) item.steps.unshift({ do: 'opponentLifeToReserve', count: 1 });
      return;
    }

    case 'flipDeckTop': {
      if (!step.whose) {
        item.steps.unshift({
          do: 'chooseOne',
          options: [
            { label: 'พลิกการ์ดบนสุดเด็คของเรา', steps: [{ do: 'flipDeckTop', whose: 'me' }], if: { deckAtLeast: 1 } },
            { label: 'พลิกการ์ดบนสุดเด็คคู่แข่ง', steps: [{ do: 'flipDeckTop', whose: 'opp' }] },
          ],
        });
        return;
      }
      const p = step.whose === 'me' ? me : opp;
      const top = s.players[p].deck[0];
      if (top) emit(ctx, { type: 'cardsRevealed', player: p, cardIds: [top] });
      return;
    }

    case 'battleCompareLevel':
      if (s.battle) s.battle.compareLevel = true;
      return;

    case 'symbolsZeroChosen': {
      const candidates = s.players[opp].field.filter((id) => matchesFilter(s, db, id, step.filter) && hits(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของคู่แข่ง: ในเทิร์นนี้เจ็มกลายเป็น 0', candidates, step });
      return;
    }

    case 'trashCoreToLife': {
      const p = s.players[me];
      const pick = p.trashCores.filter((c) => !s.cores[c]!.isSoul).slice(0, step.count);
      if (pick.length === 0) return;
      for (const c of pick) removeFrom(p.trashCores, c);
      p.life.push(...pick);
      emit(ctx, { type: 'lifeGained', player: me, amount: pick.length });
      return;
    }

    case 'voidCoresSpread': {
      const allies = s.players[me].field.filter((id) => spiritLike(id));
      let left = step.left;
      if (left === undefined) left = s.players[me].reserve.length + allies.reduce((n, id) => n + s.cards[id]!.cores.length, 0);
      if (left <= 0 || allies.length === 0) return;
      if (allies.length === 1) {
        addVoidCores(ctx, me, allies[0]!, left);
        return;
      }
      const caps: Record<string, number> = {};
      for (const id of allies) caps[id] = left;
      ask(ctx, item, { kind: 'distribute', prompt: `แบ่งคอร์วอยด์ ${left} เม็ดวางบนสปิริต/อัลติเมทของเรา`, candidates: allies, caps, total: left, to: 'place', step: { ...step, left } });
      return;
    }

    case 'lifeUpTo': {
      const need = step.max - s.players[me].life.length;
      if (need > 0) item.steps.unshift({ do: 'gainLifeFromVoid', count: need });
      return;
    }

    case 'scry': {
      const cards = step.cards ?? s.players[me].deck.slice(0, step.count);
      if (cards.length === 0) return;
      if (!step.cards) emit(ctx, { type: 'cardsRevealed', player: me, cardIds: cards });
      ask(ctx, item, {
        kind: 'card',
        prompt: 'เลือกการ์ดที่จะไว้ใต้สุดเด็ค (ทีละใบ) หรือเก็บที่เหลือไว้บนสุด',
        candidates: cards,
        revealed: cards,
        optional: true,
        skipLabel: 'ที่เหลือไว้บนสุด',
        step: { ...step, cards },
      });
      return;
    }

    case 'returnBattleMagic': {
      const p = s.players[me];
      const ids = (s.battleMagic ?? []).filter((m) => m.player === me && p.trashCards.includes(m.cardId) && inTrashOk(m.cardId)).map((m) => m.cardId);
      if (ids.length === 0) return;
      if (trashReturnBlocker(s, db, me)) return;
      for (const id of ids) {
        removeFrom(p.trashCards, id);
        p.hand.push(id);
        emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'trash' });
      }
      return;
    }

    case 'noDestroyChosenThisTurn': {
      const candidates = s.players[me].field.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเรา: ในเทิร์นนี้จะไม่ถูกทำลาย', candidates, step });
      return;
    }

    case 'opponentLevelOneThisTurn':
      s.levelOneTurn = [...(s.levelOneTurn ?? []).filter((t) => t.turn === s.turn), { player: opp, turn: s.turn }];
      return;

    case 'battleCoreTaxThisTurn':
      s.coreTaxTurn = [...(s.coreTaxTurn ?? []).filter((t) => t.turn === s.turn), { player: opp, turn: s.turn }];
      return;

    case 'symbolIfUnblocked':
      if (s.battle) s.battle.symbolIfUnblocked = { player: me, family: step.family, color: step.color, count: step.count };
      return;

    case 'lifeOnHitChosenThisTurn': {
      const candidates = s.players[me].field.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเรา: ในเทิร์นนี้ทำความเสียหายไลฟ์จากการโจมตี → ส่งคอร์ไลฟ์คู่แข่งเพิ่ม 1 เม็ด', candidates, step });
      return;
    }

    case 'opponentPileCores': {
      const p = zonesOf(s, opp, step.seat ?? 0);
      const pile = step.from === 'reserve' ? p.reserve : p.trashCores;
      // คอร์ปกติก่อน · ไปวอยด์ได้เฉพาะคอร์ปกติ
      const pick = [...pile].sort((a, b) => Number(s.cores[a]!.isSoul) - Number(s.cores[b]!.isSoul)).filter((c) => step.to !== 'void' || !s.cores[c]!.isSoul).slice(0, step.n);
      for (const c of pick) removeFrom(pile, c);
      if (step.to === 'void') for (const c of pick) delete s.cores[c];
      else (step.to === 'trash' ? p.trashCores : p.reserve).push(...pick);
      if (pick.length > 0) emit(ctx, { type: 'coresMoved', player: opp, count: pick.length });
      return;
    }

    case 'subjectCoresToTrash': {
      const id = item.subjectId;
      if (!id || !onField(ctx, id) || s.cards[id]!.owner !== me) return;
      const card = s.cards[id]!;
      const pick = [...card.cores].sort((a, b) => Number(s.cores[a]!.isSoul) - Number(s.cores[b]!.isSoul)).slice(0, step.count);
      card.cores = card.cores.filter((c) => !pick.includes(c));
      s.players[me].trashCores.push(...pick);
      emit(ctx, { type: 'coresRemoved', cardId: id, count: pick.length, to: 'trash' });
      return;
    }

    case 'lifeCoreOnto': {
      const p = s.players[me];
      if (!onField(ctx, step.cardId)) return;
      const moved = p.life.splice(Math.max(0, p.life.length - step.count), step.count);
      s.cards[step.cardId]!.cores.push(...moved);
      emit(ctx, { type: 'coresMoved', player: me, count: moved.length });
      // ไลฟ์เป็น 0 = แพ้ (2VS2: ไลฟ์ของทั้งทีมเป็น 0)
      if (allZones(s, me).every((z) => z.life.length === 0)) endGame(ctx, opp, 'lifeZero');
      return;
    }

    // ---------------- BS09
    case 'opponentRandomDiscard': {
      if (!holds(step.if) || handImmune(s, db, opp) || step.count < 1) return;
      const hand = handCards(s, opp);
      if (hand.length === 0) return;
      // "ทิ้งแบบสุ่ม" แบบเล่นจริง: คู่แข่งสับการ์ดในมือแล้วยื่นคว่ำหน้าให้เราเลือก (เจ้าของโปรเจกต์กำหนด)
      const [order, next] = shuffle(hand, s.rng);
      s.rng = next;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกการ์ดในมือคู่แข่ง (คว่ำหน้า) 1 ใบที่จะทิ้ง${step.count > 1 ? ` (อีก ${step.count} ใบ)` : ''}`,
        candidates: order,
        blind: true,
        step,
      });
      return;
    }

    case 'opponentExhaustsOwn': {
      const candidates = s.players[opp].field.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && (!step.filter || matchesFilter(s, db, id, step.filter)) && hits(id),
      );
      if (candidates.length === 0 || step.count < 1) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตของตัวเองที่จะเสื่อมสภาพ (อีก ${step.count} ตัว)`, candidates, step }, opp);
      return;
    }

    case 'ownSoulToTrash': {
      const onSpirits = s.players[me].field.filter((id) => s.cards[id]!.cores.some((c) => s.cores[c]!.isSoul));
      const inReserve = s.players[me].reserve.some((c) => s.cores[c]!.isSoul);
      if (onSpirits.length === 0) {
        if (inReserve) {
          soulReserveToTrash(ctx, me);
          soulTrashedByEffect(ctx, item, me);
        }
        return;
      }
      ask(ctx, item, {
        kind: 'card',
        prompt: 'เลือกการ์ดที่จะส่ง Soul Core ลงแทรช',
        candidates: onSpirits,
        ...(inReserve ? { optional: true, skipLabel: 'ใช้ Soul Core ในรีเสิร์ฟ' } : {}),
        step,
      });
      return;
    }

    case 'opponentNoBurstThisTurn':
      if (!holds(step.if)) return;
      s.burstBans = [...(s.burstBans ?? []).filter((b) => b.turn === s.turn), { player: opp, turn: s.turn }];
      return;

    case 'opponentNoMagicThisTurn':
      s.magicBans = [...(s.magicBans ?? []).filter((b) => b.turn === s.turn), { player: opp, turn: s.turn }];
      return;

    case 'peekOpponentBurst': {
      const burst = s.players[opp].burst;
      if (!burst) return;
      emit(ctx, { type: 'cardsRevealed', player: opp, cardIds: [burst] });
      if (!matchesFilter(s, db, burst, step.filter)) return;
      {
        const prot = burstProtectSource(s, db, opp);
        if (prot) {
          emitStatic(ctx, prot);
          return;
        }
      }
      s.players[opp].burst = null;
      s.players[opp].trashCards.push(burst);
      item.burstDiscarded = true;
      emit(ctx, { type: 'burstDiscarded', player: opp, cardId: burst });
      // BS09 อิกคาคุ Lv3: สั่งใช้เอฟเฟกต์เบิร์สของเบิร์สที่ถูกทิ้งได้ (ห้ามอัญเชิญ/วาง/จ่ายแฟลช)
      if (onField(ctx, self) && !effectsNegated(s, db, self) && db.get(s.cards[self]!.cardNo).abilities.some((a) => a.kind === 'useDiscardedBurst' && a.levels.includes(cardLevel(s, db, self)))) {
        const bab = db.get(s.cards[burst]!.cardNo).abilities.find((a) => a.kind === 'burst');
        if (bab?.kind === 'burst') {
          const banned = new Set<Step['do']>(['summonThisFree', 'payToUseFlash', 'summonCardFree', 'placeThisSong', 'openBurst']);
          const strip = (steps: Step[]): Step[] =>
            steps
              .filter((x) => !banned.has(x.do))
              .map((x) => (x.do === 'chooseOne' ? { ...x, options: x.options.map((o) => ({ ...o, steps: strip(o.steps) })) } : x));
          const steps = strip(bab.steps);
          if (steps.length > 0) {
            const name = db.get(s.cards[burst]!.cardNo).name;
            item.steps.unshift({ do: 'chooseOne', options: [{ label: `สั่งใช้เอฟเฟกต์เบิร์สของ ${name}`, steps }, { label: 'ไม่ใช้', steps: [] }] });
          }
        }
      }
      return;
    }

    case 'opponentDiscardHandDraw': {
      if (handImmune(s, db, opp)) return;
      for (const id of handCards(s, opp)) {
        removeFrom(s.players[opp].hand, id);
        s.players[opp].trashCards.push(id);
        emit(ctx, { type: 'discarded', player: opp, cardId: id });
      }
      for (let i = 0; i < step.draw; i++) drawCard(ctx, opp, true);
      return;
    }

    case 'opponentTrashSameNameToBottom': {
      const candidates = s.players[opp].trashCards.filter(inTrashOk);
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ดในแทรชคู่แข่ง: ชื่อเดียวกันไม่เกิน ${step.max} ใบกลับไปไว้ใต้สุดเด็ค`, candidates, step });
      return;
    }

    case 'immuneChosenThisTurn': {
      const candidates = s.players[me].field.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริต/อัลติเมทของเรา: ในเทิร์นนี้ไม่รับเอฟเฟกต์ทั้งหมดของคู่แข่ง', candidates, step });
      return;
    }

    case 'destroyOwn': {
      const candidates = s.players[me].field.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดของเราที่จะทำลาย', candidates, step });
      return;
    }

    case 'destroyLowestCostOpponent': {
      const pool = s.players[opp].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter) && hits(id));
      if (pool.length === 0) return;
      const costOf = (id: string) => fieldCost(s, db, id);
      const min = Math.min(...pool.map(costOf));
      const candidates = pool.filter((id) => costOf(id) === min);
      if (candidates.length === 1) {
        recordDestroyed(ctx, item, candidates[0]!);
        destroyCard(ctx, candidates[0]!, me, { bySource: item.sourceId, effect: true });
        return;
      }
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตคอสต์น้อยที่สุด (${min}) ของคู่แข่งที่จะทำลาย`, candidates, step });
      return;
    }

    case 'noEndAttackStepThisTurn':
      s.noEndAttackStep = [...(s.noEndAttackStep ?? []).filter((x) => x.turn === s.turn), { player: me, turn: s.turn, filter: step.filter }];
      return;

    case 'pairBlock':
      if (s.battle && s.battle.attackerId === self && s.battle.step === 'flashBeforeBlock') {
        s.battle.pairBlock = true;
        s.battle.levelBlock = 2;
        s.battle.maxBlockers = 99;
      }
      return;

    case 'summonFromTrashThen': {
      const candidates = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรชที่จะอัญเชิญ (จ่ายคอสต์)', candidates, optional: true, skipLabel: 'ไม่อัญเชิญ', step });
      return;
    }

    case 'summonFreeHandOrTrash': {
      // BS12 ครัชแอนด์บิลด์: max × จำนวน (เช่น สปิริตที่ถูกทำลายโดยเอฟเฟกต์นี้)
      if (step.per) {
        const k = countPer(ctx, item, step.per);
        const { per: _per, ...rest } = step;
        void _per;
        if (k > 0) item.steps.unshift({ ...rest, max: step.max * k });
        return;
      }
      if (step.max < 1) return;
      const zones = step.zones ?? ['hand', 'trash'];
      const candidates = [...(zones.includes('hand') ? handPool(me, step) : []), ...(zones.includes('trash') ? s.players[me].trashCards.filter(inTrashOk) : [])].filter(
        (id) => matchesFilter(s, db, id, step.filter) && freeSummonOk(id),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ดในมือ/แทรชที่จะอัญเชิญไม่จ่ายคอสต์ (อีกไม่เกิน ${step.max} ใบ)`, candidates, optional: true, skipLabel: 'พอแล้ว', step });
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
      if (millBlocked(s, db)) {
        if (s.players[opp].deck.length > 0) emitStatic(ctx, staticSources(s, db, PLAYERS, 'noMill'));
        return;
      }
      let n = step.count === 'level' ? (onField(ctx, self) ? cardLevel(s, db, self) : 0) : step.count;
      // BS12 เมลสตอร์ม Charge: [เอฟเฟกต์ทิ้งเด็คคู่แข่ง] ที่ไม่ใช่ของอัลติเมทของเรา จำนวนทิ้ง +N
      if (n > 0 && s.cards[self] && db.get(s.cards[self]!.cardNo).type !== 'ultimate') {
        const boost = millBoostFor(s, db, me);
        if (boost.amount > 0) {
          emitStatic(ctx, boost.src);
          n += boost.amount;
        }
      }
      // BS13 สถานที่ศักดิ์สิทธิ์ต้องห้าม: ต่อเทิร์น เด็คถูกทิ้งโดยเอฟเฟกต์สปิริต/เน็กซัส/เมจิค(/เบรฟ)ของคู่แข่งได้มากสุด N ใบ (อัลติเมทไม่นับ)
      const capped = s.cards[self] && db.get(s.cards[self]!.cardNo).type !== 'ultimate' ? millCapLeft(s, db, opp) : null;
      if (capped && n > capped.left) {
        if (s.players[opp].deck.length > capped.left) emitStatic(ctx, capped.src);
        n = capped.left;
      }
      const ids = s.players[opp].deck.slice(0, n);
      item.milled = ids;
      if (ids.length === 0) return;
      if (capped) {
        const rec = s.milledByOpponent?.turn === s.turn ? s.milledByOpponent : { turn: s.turn };
        s.milledByOpponent = { ...rec, [opp]: (rec[opp] ?? 0) + ids.length };
      }
      mill(ctx, opp, ids);
      queueMillTriggers(ctx, item, ids);
      // การ์ดที่ถูกทิ้ง: "เมื่อถูกทิ้งโดยเอฟเฟกต์ทิ้งเด็คของคู่แข่ง" (วันโคมะ)
      queueRightAfterCurrent(ctx, () => {
        const batch = newBatch(ctx);
        for (const id of ids) queueTriggers(ctx, id, 'milledByOpponent', batch);
      });
      queueMilledAny(ctx, ids);
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
      const candidates = handPool(me, step).filter((id) => matchesFilter(s, db, id, step.filter) && freeSummonOk(id));
      if (candidates.length === 0) return;
      if ((step.max ?? 1) > 1) {
        // อัญเชิญได้หลายใบ: เลือกทีเดียว ลงสนามพร้อมกัน
        ask(ctx, item, { kind: 'multiSummon', prompt: `อัญเชิญไม่จ่ายคอสต์จากมือได้ไม่เกิน ${step.max} ใบ`, revealed: candidates, candidates, max: step.max!, step });
        return;
      }
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
      // Charge: เอฟเฟกต์ BP- ของเรา BP- เพิ่มขึ้น (แองเจลิคฟีเธอร์)
      if (!step.charged) {
        const bonus = chargeBonus(s, db, me, 'bpMinusBoost');
        if (bonus > 0) {
          item.steps.unshift({ ...step, amount: step.amount + bonus, charged: true });
          return;
        }
      }
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
      s.attackBans = [...(s.attackBans ?? []), { player: opp, turn: s.turn, types: step.types, sourceId: item.sourceId }];
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
      // BS10 ทันโปโปะ: แอทแท็คสเต็ป เบิร์สถูกทิ้งไม่ได้
      {
        const prot = burstProtectSource(s, db, opp);
        if (prot) {
          emitStatic(ctx, prot);
          return;
        }
      }
      // เซ็นโงคุฮิเมะ ยูสึกิ: เบิร์สที่ถูกทิ้งโดยคู่แข่ง สั่งใช้ได้โดยไม่สนเงื่อนไข (ถามเจ้าของหลังเอฟเฟกต์นี้)
      const bdef = db.get(s.cards[id]!.cardNo);
      const bab = bdef.abilities.find((a) => a.kind === 'burst');
      if (bab && bab.kind === 'burst' && bdef.abilities.some((a) => a.kind === 'burstOnDiscard') && !burstBlocked(s, db, opp)) {
        item.burstDiscarded = true;
        const src = bdef.abilities.find((a) => a.kind === 'burstOnDiscard')!;
        emitStatic(ctx, { cardId: id, source: src.source });
        queueRightAfterCurrent(ctx, () =>
          enqueue(ctx, {
            controller: opp,
            sourceId: id,
            steps: [
              {
                do: 'chooseOne',
                options: [
                  { label: 'สั่งใช้ Burst (ไม่สนเงื่อนไข)', steps: [{ do: 'openBurst' }, ...bab.steps] },
                  { label: 'ไม่ใช้ (ทิ้งลงแทรช)', steps: [{ do: 'trashOwnBurst' }] },
                ],
              },
            ],
            paidWithSoul: false,
            trashWhenDone: false,
            announce: false,
          }),
        );
        return;
      }
      s.players[opp].burst = null;
      s.players[opp].trashCards.push(id);
      emit(ctx, { type: 'burstDiscarded', player: opp, cardId: id, byEffect: true });
      item.burstDiscarded = true;
      return;
    }

    case 'refreshSubject': {
      const id = item.subjectId;
      if (!id || !onField(ctx, id) || !holds(step.if) || s.cards[id]!.state === 'refresh') return;
      refreshByEffect(ctx, id, item.sourceId);
      return;
    }

    case 'summonFromHand': {
      const candidates = handPool(me, step).filter((id) => matchesFilter(s, db, id, step.filter));
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
      if (s.phase !== 'draw') return;
      if (s.players[me].partner) {
        const seat = activeSeat(s, me);
        const extra = [...(s.drawStepExtraSeats ?? [0, 0])];
        extra[seat] = (extra[seat] ?? 0) + step.amount;
        s.drawStepExtraSeats = extra;
      } else s.drawStepExtra = (s.drawStepExtra ?? 0) + step.amount;
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
        if (db.get(card.cardNo).type !== 'nexus' || card.cores.length === 0 || !hits(id)) continue;
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

    case 'payBurstTax': {
      emitStatic(ctx, magicBurstTax(s, db, me).sources);
      if (usableCores(ctx, me).length < step.cost) return;
      ask(ctx, item, { kind: 'payCost', prompt: step.label ?? `จ่ายคอสต์เพิ่ม ${step.cost} เพื่อสั่งใช้เบิร์ส (ไม่จ่าย = ไม่เปิด)`, cost: step.cost, step });
      return;
    }

    case 'payForSummon': {
      if (!s.players[me].hand.includes(step.cardId) && !s.players[me].trashCards.includes(step.cardId)) return;
      // BS10 สิงโตควันม่วง: ทิ้งใบบนสุดเด็คลดคอสต์ (ทุกการอัญเชิญ)
      if (!step.millAsked) {
        const mab = db.get(s.cards[step.cardId]!.cardNo).abilities.find((a) => a.kind === 'millCostReduce');
        const max = mab?.kind === 'millCostReduce' ? Math.min(mab.max, s.players[me].deck.length) : 0;
        if (max > 0) {
          item.steps.unshift({
            do: 'chooseOne',
            options: Array.from({ length: max + 1 }, (_, n) => ({
              label: n === 0 ? 'ไม่ทิ้งเด็ค' : `ทิ้งใบบนสุดเด็ค ${n} ใบ: คอสต์ -${n}`,
              steps: [...(n > 0 ? [{ do: 'millSelfN' as const, n }] : []), { ...step, cost: Math.max(0, step.cost - n), millAsked: true as const }],
            })),
          });
          return;
        }
      }
      // BS10 สิงโตควันม่วง: อัญเชิญโดยเอฟเฟกต์ต้องจ่ายเพิ่ม
      if (!step.taxPaid) {
        const tax = effectSummonTax(s, db, step.cardId);
        if (tax.cost > 0) {
          emitStatic(ctx, tax.sources);
          item.steps.unshift({ ...step, cost: step.cost + tax.cost, taxPaid: true });
          return;
        }
      }
      if (step.cost === 0) {
        item.steps.unshift({ do: 'placeCores', cardId: step.cardId, taxPaid: true, millAsked: true });
        return;
      }
      // จ่ายคอสต์แล้วต้องเหลือ Core วางให้ถึง Lv1 ไม่งั้นไม่ถาม (จ่ายไปเปล่า ๆ แล้วอัญเชิญไม่ได้)
      if (usableCores(ctx, me).length < step.cost + summonMinCores(s, db, step.cardId)) return;
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

    // ---------------- BS05
    case 'ifReturned':
      if (item.returned && s.cards[item.returned] && matchesFilter(s, db, item.returned, step.filter)) item.steps.unshift(...step.steps);
      return;

    case 'disableChosenOpponent': {
      if (!holds(step.if)) return;
      const n = step.countPerAllyFamily
        ? s.players[me].field.filter((id) => spiritLike(id) && db.get(s.cards[id]!.cardNo).family.includes(step.countPerAllyFamily!)).length
        : (step.count ?? 1);
      if (n <= 0) return;
      if (!step.countPerAllyFamily && disperse(n, step)) return;
      const candidates = s.players[opp].field.filter((id) => matchesFilter(s, db, id, step.filter) && hits(id) && !turnLocked(s, id));
      if (candidates.length === 0) return;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกสปิริตของคู่แข่งที่จะโจมตี/ป้องกันไม่ได้ในเทิร์นนี้ (อีก ${n} ตัว)`,
        candidates,
        step: { ...step, count: n, countPerAllyFamily: undefined, if: undefined },
      });
      return;
    }

    case 'summonCardFree': {
      const id = step.which === 'self' ? item.sourceId : item.subjectId;
      if (!id || !s.cards[id] || s.cards[id]!.owner !== me) return;
      const p = s.players[me];
      if (!p.trashCards.includes(id) && !p.hand.includes(id)) return;
      if (p.trashCards.includes(id) && !inTrashOk(id)) return;
      item.steps.unshift({ do: 'placeCores', cardId: id }, ...(step.then ? [{ do: 'ifOnField' as const, cardId: id, steps: step.then }] : []));
      return;
    }

    case 'discardUpTo': {
      const done = item.discardedCount ?? 0;
      if (done >= step.max) return;
      const hand = handCards(s, me).filter((id) => !step.filter || matchesFilter(s, db, id, step.filter));
      if (hand.length === 0) return;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกการ์ดในมือที่จะทิ้ง (ทิ้งแล้ว ${done}/${step.max} ใบ) หรือหยุด`,
        candidates: hand,
        optional: true,
        skipLabel: done > 0 ? 'พอแล้ว' : 'ไม่ทิ้ง',
        step,
      });
      return;
    }

    case 'removeCoresPerDiscarded': {
      const n = item.discardedCount ?? 0;
      if (n > 0) item.steps.unshift({ do: 'removeOpponentCores', count: n, to: step.to });
      return;
    }

    case 'summonFromTrashBudget': {
      if (step.budget <= 0) return;
      const candidates = s.players[me].trashCards.filter(
        (id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id) && baseCost(s, db, id) <= step.budget,
      );
      if (candidates.length === 0) return;
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกการ์ดในแทรชที่จะอัญเชิญไม่จ่ายคอสต์ (คอสต์รวมเหลือ ${step.budget})`,
        candidates,
        optional: true,
        skipLabel: 'พอแล้ว',
        step,
      });
      return;
    }

    case 'battleExhaustedBlock':
      if (s.battle) s.battle.exhaustedBlock = true;
      return;

    case 'endAttackStepIfAfterBattle':
      if (s.battle) s.battle.endAttackStepIf = { player: me, sourceId: self, cond: step.if };
      return;

    case 'showSubjectFromTrash': {
      const id = item.subjectId;
      if (!id || !s.players[me].trashCards.includes(id) || !inTrashOk(id)) return;
      removeFrom(s.players[me].trashCards, id);
      s.players[me].hand.push(id);
      s.shownCards = [...(s.shownCards ?? []), id];
      emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'trash' });
      emit(ctx, { type: 'cardShown', player: me, cardId: id });
      return;
    }

    case 'setBurstFromShown': {
      const shown = s.shownCards ?? [];
      const candidates = s.players[me].hand.filter((id) => shown.includes(id) && db.get(s.cards[id]!.cardNo).burst);
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดที่วางแสดงนอกมือที่มีเอฟเฟกต์ Burst ไปเซ็ท (ไม่เลือกก็ได้)', candidates, optional: true, step });
      return;
    }

    case 'returnAllChosenColor': {
      if (!holds(step.if)) return;
      const pool = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      const colors = [...new Set(pool.flatMap((id) => db.get(s.cards[id]!.cardNo).colors))];
      if (colors.length === 0) return;
      const label: Record<string, string> = { red: 'แดง', purple: 'ม่วง', green: 'เขียว', white: 'ขาว', yellow: 'เหลือง', blue: 'ฟ้า' };
      item.steps.unshift({
        do: 'chooseOne',
        options: colors.map((c) => ({
          label: `สี${label[c] ?? c} (${pool.filter((id) => db.get(s.cards[id]!.cardNo).colors.includes(c)).length} ใบ)`,
          steps: [{ do: 'returnAllFromTrash', filter: { ...step.filter, color: c } } as Step],
        })),
      });
      return;
    }

    case 'returnAllFromTrash': {
      const p = s.players[me];
      const ids = p.trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (ids.length === 0) return;
      for (const id of ids) {
        removeFrom(p.trashCards, id);
        p.hand.push(id);
        emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'trash' });
      }
      handIncreasedByEffect(ctx, me);
      return;
    }

    case 'unblockableByCostAtMostSelf':
      if (s.battle?.attackerId === self && onField(ctx, self)) {
        const min = fieldCost(s, db, self) + 1;
        const prev = s.battle.blockFilter ?? {};
        // สปิริตคอสต์ไม่เกินสปิริตนี้ป้องกันไม่ได้ (อัลติเมทยังป้องกันได้)
        s.battle.blockFilter = { anyOf: [{ ...prev, types: ['ultimate'] }, { ...prev, minCost: min }] };
      }
      return;

    case 'blockTax':
      if (s.battle) s.battle.blockTax = { reserveToTrash: step.reserveToTrash, ...(step.discard ? { discard: step.discard } : {}) };
      return;

    case 'destroySourceBrave': {
      const brave = item.sourceId;
      const host = braveHostOf(s, brave);
      if (!host || db.get(s.cards[brave]!.cardNo).type !== 'brave') return;
      removeFrom(s.cards[host]!.braves, brave);
      s.players[me].trashCards.push(brave);
      emit(ctx, { type: 'destroyed', cardId: brave, bySource: brave });
      if (step.then) item.steps.unshift(...step.then);
      return;
    }

    case 'ifFirstZeroBp':
      if (item.firstZeroBp) item.steps.unshift(...step.steps);
      return;

    case 'reserveToLife': {
      const p = s.players[me];
      // กติกา 07 ข้อ 5: โซลคอร์จะไม่ถูกนำไปวางที่ไลฟ์
      const normals = p.reserve.filter((c) => !s.cores[c]!.isSoul);
      const n = Math.min(step.count, normals.length);
      if (n <= 0) return;
      const pick = normals.slice(0, n);
      for (const id of pick) removeFrom(p.reserve, id);
      p.life.push(...pick);
      emit(ctx, { type: 'lifeGained', player: me, amount: n });
      return;
    }

    case 'battleColorless':
      if (s.battle?.attackerId === self) s.battle.colorless = true;
      return;

    case 'moveOpponentCore': {
      const pool = s.players[opp].field.filter((id) => spiritLike(id) && hits(id));
      if (!step.fromId) {
        const from = pool.filter((id) => s.cards[id]!.cores.length > 0 && pool.some((o) => o !== id));
        if (from.length === 0) return;
        ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของคู่แข่งที่จะนำคอร์ออก 1 เม็ด', candidates: from, step });
        return;
      }
      const to = pool.filter((id) => id !== step.fromId);
      if (to.length === 0 || !onField(ctx, step.fromId)) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตตัวอื่นของคู่แข่งที่จะวางคอร์นั้น', candidates: to, step });
      return;
    }

    case 'negateOpponentsThisTurn':
      s.effectsLost = [...(s.effectsLost ?? []).filter((e) => e.turn === s.turn), { player: opp, turn: s.turn }];
      return;

    case 'soulToAlly': {
      const from = step.from === 'self' ? self : item.sourceId;
      const card = s.cards[from]!;
      if (!onField(ctx, from) || !card.cores.some((c) => s.cores[c]!.isSoul)) return;
      // ลองเคพ: ฟื้นสภาพสปิริตที่รับ = เลือกได้เฉพาะตัวที่เสื่อมสภาพ
      const candidates = s.players[me].field.filter((id) => id !== from && spiritLike(id) && (!step.refresh || s.cards[id]!.state === 'exhausted'));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะวาง Soul Core', candidates, step });
      return;
    }

    case 'ifDepleted':
      if (item.depleted) item.steps.unshift(...step.steps);
      return;

    // ---------------- BS06
    case 'returnOwnToHand': {
      const candidates = s.players[me].field.filter(
        (id) => (!step.other || id !== self) && (step.filter.types ? true : spiritLike(id)) && matchesFilter(s, db, id, step.filter),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดของเราที่จะนำกลับขึ้นมือ', candidates, step });
      return;
    }

    case 'moveAllySoul': {
      const soulOn = (id: string) => s.cards[id]!.cores.some((c) => s.cores[c]!.isSoul);
      const allies = s.players[me].field.filter(spiritLike);
      if (!step.fromId) {
        const candidates = allies.filter((id) => soulOn(id) && (!step.filter || matchesFilter(s, db, id, step.filter)));
        if (candidates.length === 0 || allies.length < 2) return;
        ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะย้าย Soul Core ออก (ไม่ย้ายก็ได้)', candidates, optional: true, step });
        return;
      }
      const candidates = allies.filter((id) => id !== step.fromId);
      if (candidates.length === 0 || !onField(ctx, step.fromId)) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะวาง Soul Core', candidates, step });
      return;
    }

    // ---------------- BS07
    case 'placeThisSong': {
      // เมจิคไทป์เพลงที่ใช้เสร็จ (กำลังจะลงแทรช) → วางบนฟิลด์แทน
      const id = item.sourceId;
      if (!item.trashWhenDone || inAnyZone(ctx, me, id)) return;
      item.trashWhenDone = false;
      const p = s.players[me];
      p.songs = [...(p.songs ?? []), id];
      emit(ctx, { type: 'songPlaced', player: me, cardId: id, from: 'used' });
      return;
    }

    case 'songFromHand': {
      const candidates = handCards(s, me).filter((id) => matchesFilter(s, db, id, { types: ['magic'], magicType: 'เพลง' }));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดเมจิคไทป์ [เพลง] ในมือที่จะวางบนฟิลด์', candidates, step });
      return;
    }

    case 'songToTrash': {
      const who = step.opponent ? opp : me;
      const list = s.players[who].songs ?? [];
      if (list.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ดเมจิคไทป์ [เพลง] บนฟิลด์${step.opponent ? 'คู่แข่ง' : 'เรา'}ที่จะทิ้ง`, candidates: [...list], step });
      return;
    }

    case 'songToHand': {
      const p = s.players[me];
      const candidates = [
        ...p.trashCards.filter((id) => inTrashOk(id) && matchesFilter(s, db, id, { types: ['magic'], magicType: 'เพลง' })),
        ...(p.songs ?? []),
      ];
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดเมจิคไทป์ [เพลง] จากแทรชหรือบนฟิลด์ที่จะนำขึ้นมือ', candidates, step });
      return;
    }

    case 'myUnit': {
      const b = s.battle;
      if (!b || b.attackerId !== self || !onField(ctx, self)) return;
      const picked = (step.picked ?? []).filter((id) => onField(ctx, id));
      if (picked.length >= step.count) {
        // วางชิดผู้โจมตี: ตัวแรกด้านขวา ตัวที่สองด้านซ้าย (ลำดับบนสนาม)
        const f = s.players[me].field;
        for (const id of picked) removeFrom(f, id);
        const at = f.indexOf(self);
        if (picked[0]) f.splice(at + 1, 0, picked[0]);
        if (picked[1]) f.splice(at, 0, picked[1]);
        b.unit = [...new Set([...(b.unit ?? []), ...picked])];
        emit(ctx, { type: 'myUnit', attackerId: self, cardIds: picked });
        return;
      }
      const candidates = s.players[me].field.filter(
        // ตัวที่อยู่ใน unit ของการต่อสู้นี้แล้วเลือกซ้ำได้ (เจ้าของโปรเจกต์กำหนด: My Unit อีกครั้งใช้คู่เดิมได้)
        (id) => id !== self && !picked.includes(id) && spiritLike(id) && s.cards[id]!.state === 'refresh' && db.get(s.cards[id]!.cardNo).family.includes('ดีว่า'),
      );
      if (candidates.length < step.count - picked.length) return;
      ask(ctx, item, { kind: 'card', prompt: `My Unit: เลือกสปิริตเผ่า [ดีว่า] ที่ฟื้นสภาพมาวางชิด (${picked.length + 1}/${step.count})`, candidates, step: { ...step, picked } });
      return;
    }

    case 'destroySelf':
      if (onField(ctx, self)) destroyCard(ctx, self, me, { bySource: self, effect: true });
      return;

    case 'onStageLeave': {
      const id = step.cardId;
      if (!onField(ctx, id)) return;
      if (step.keyword && step.exhaust === undefined) {
        // รีเซ่-โดรมเวล: เสื่อมสภาพแทนการกลับใต้สุดเด็ค
        const repl = onStageReplaceSource(ctx, me);
        if (repl) {
          ask(ctx, item, {
            kind: 'option',
            prompt: `On Stage: ${db.get(s.cards[id]!.cardNo).name} กลับไปใต้สุดเด็ค หรือเสื่อมสภาพแทน (${db.get(s.cards[repl.cardId]!.cardNo).name})`,
            options: ['กลับไปใต้สุดเด็ค', 'เสื่อมสภาพแทน (ถือว่ากลับใต้สุดเด็คแล้ว)'],
            step: {
              do: 'chooseOne',
              options: [
                { label: 'กลับไปใต้สุดเด็ค', steps: [{ ...step, exhaust: false }] },
                { label: 'เสื่อมสภาพแทน (ถือว่ากลับใต้สุดเด็คแล้ว)', steps: [{ ...step, exhaust: true }] },
              ],
            },
          });
          return;
        }
      }
      if (step.exhaust) {
        const repl = onStageReplaceSource(ctx, me);
        emitStatic(ctx, repl);
        s.cards[id]!.state = 'exhausted';
        emit(ctx, { type: 'onStage', player: me, cardId: id, exhaustedInstead: true });
        queueExhaustTriggers(ctx, id);
        return;
      }
      emit(ctx, { type: 'onStage', player: me, cardId: id });
      returnCard(ctx, id, 'deckBottom');
      return;
    }

    case 'onStageDone': {
      const batch = newBatch(ctx);
      queueTriggers(ctx, step.cardId, 'onStage', batch, { level: step.level, soulSnapshot: step.soul });
      for (const id of [...s.players[me].field, ...teamHand(s, me)]) {
        if (id !== step.cardId) queueTriggers(ctx, id, 'allyOnStage', batch, { subject: step.cardId, subjectSoul: step.soul });
      }
      return;
    }

    case 'ifOnField':
      if (onField(ctx, step.cardId)) item.steps.unshift(...step.steps);
      return;

    case 'trashOwnBurst': {
      const p = s.players[me];
      if (p.burst !== item.sourceId) return;
      p.burst = null;
      p.trashCards.push(item.sourceId);
      emit(ctx, { type: 'burstDiscarded', player: me, cardId: item.sourceId, byEffect: true });
      return;
    }

    case 'revealPickEach': {
      const p = s.players[me];
      if (!step.revealed) {
        const revealed = p.deck.slice(0, step.count);
        if (revealed.length === 0) return;
        emit(ctx, { type: 'cardsRevealed', player: me, cardIds: revealed });
        item.steps.unshift({ ...step, revealed, index: 0 });
        return;
      }
      const left = step.revealed.filter((id) => p.deck.includes(id));
      const i = step.index ?? 0;
      if (i >= step.filters.length) {
        if (left.length > 0) mill(ctx, me, left);
        return;
      }
      const candidates = left.filter((id) => matchesFilter(s, db, id, step.filters[i]!));
      if (candidates.length === 0) {
        item.steps.unshift({ ...step, index: i + 1 });
        return;
      }
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ดที่จะเพิ่มขึ้นมือ (${i + 1}/${step.filters.length}) ที่เหลือลงแทรช`, candidates, revealed: left, step });
      return;
    }

    case 'opponentTotalBp': {
      // BS12 รินโดว / กุเร็นเบรอส: "ทำลาย ... BP รวมไม่เกิน" นับเป็น [เอฟเฟกต์ทำลาย BP] → ขอบเขต +N
      if (step.action === 'destroy' && step.metric !== 'cost' && !step.boosted && s.cards[self]) {
        const boost = bpDestroyBoostFor(s, db, self);
        if (boost) {
          emitStatic(ctx, boost.src);
          item.steps.unshift({ ...step, maxTotal: step.maxTotal + boost.amount, boosted: true });
          return;
        }
      }
      const byCost = step.metric === 'cost';
      const value = (id: string) => (byCost ? fieldCost(s, db, id) : currentBp(s, db, id));
      const candidates = s.players[opp].field.filter((id) => (step.filter ? matchesFilter(s, db, id, step.filter) : spiritLike(id)) && value(id) <= step.maxTotal && hits(id));
      if (candidates.length === 0 || step.final) return;
      const what = byCost ? `คอสต์รวมไม่เกิน ${step.maxTotal}` : `BP รวมไม่เกิน ${step.maxTotal.toLocaleString()}`;
      askBudget(ctx, item, candidates, step, `เลือกสปิริตของคู่แข่งที่จะ${step.action === 'bounce' ? 'กลับขึ้นมือ' : 'ทำลาย'} (${what})`, byCost ? 'คอสต์' : 'BP', step.maxTotal, value);
      return;
    }

    // ---------------- BS12
    case 'trashSoulToAlly': {
      const soul = s.players[me].trashCores.find((c) => s.cores[c]!.isSoul);
      const candidates = s.players[me].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter));
      if (!soul || candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะวาง Soul Core จากแทรช', candidates, step });
      return;
    }

    case 'maxLevelThisTurn': {
      const cardId = step.target === 'chosen' ? item.chosenId : undefined;
      if (step.target === 'chosen' && (!cardId || !onField(ctx, cardId))) return;
      s.maxLevelTurn = [...(s.maxLevelTurn ?? []).filter((t) => t.turn === s.turn), { player: me, turn: s.turn, ...(cardId ? { cardId } : {}) }];
      return;
    }

    case 'destroyAllOpponentBraves': {
      for (const host of [...s.players[opp].field]) {
        for (const b of [...(s.cards[host]?.braves ?? [])]) {
          if (!hits(b)) continue;
          removeFrom(s.cards[host]!.braves, b);
          s.players[opp].trashCards.push(b);
          emit(ctx, { type: 'destroyed', cardId: b, bySource: item.sourceId });
        }
      }
      return;
    }

    case 'peekHandDiscard': {
      const hand = s.players[opp].hand;
      if (hand.length === 0) return;
      // เราดูการ์ดในมือคู่แข่งทั้งหมด (แสดงให้เราเห็น) แล้วเลือกทิ้งใบที่ตรงตัวกรอง
      emit(ctx, { type: 'cardsRevealed', player: opp, cardIds: [...hand] });
      const candidates = hand.filter((id) => !step.filter || matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0 || step.count < 1) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกการ์ดในมือคู่แข่งที่จะทิ้ง (อีก ${step.count} ใบ)`, candidates, revealed: [...hand], step });
      return;
    }

    case 'symbolThisTurn':
      if (!onField(ctx, self)) return;
      if (step.untilBattleEnd) {
        const c = s.cards[self]!;
        c.battleSymbols = [...(c.battleSymbols ?? []), { color: step.color, count: step.count }];
        return;
      }
      s.turnSymbols = [...(s.turnSymbols ?? []).filter((t) => t.turn === s.turn), { cardId: self, turn: s.turn, color: step.color, count: step.count }];
      return;

    case 'negateSubjectMagic': {
      const q = s.queue.find((x) => x !== item && x.sourceId === item.subjectId && x.trashWhenDone && !x.started);
      if (!q) return;
      q.steps = [];
      q.announce = false;
      emit(ctx, { type: 'magicNegated', cardId: q.sourceId, bySource: item.sourceId });
      return;
    }

    case 'returnSubjectToDeck': {
      // มาคินะ: "เอฟเฟกต์ของสปิริต/เบรฟ 1 ตัวไร้ผล, นำสปิริต/เบรฟนั้นกลับไปไว้ใต้สุดเด็ค"
      // ข้อความไม่ได้เจาะจงการ์ดที่เพิ่งถูกอัญเชิญ และไม่ได้ระบุฝ่าย → เลือกสปิริต/เบรฟบนสนาม 1 ตัวเอง (ทั้งสองฝ่าย รวมเบรฟที่ร่วมร่าง)
      // ทั้งตอนเบิร์สเปิดตามเงื่อนไข และตอนสั่งใช้ด้วย Catalyze · การ์ดของคู่แข่งที่มี Shield กันเอฟเฟกต์นี้ = เลือกไม่ได้
      const pool = PLAYERS.flatMap((p) => [...s.players[p].field.filter((c) => spiritLike(c)), ...s.players[p].field.flatMap((c) => s.cards[c]!.braves)]);
      const candidates = pool.filter((c) => s.cards[c]!.owner === me || hits(c));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริต/เบรฟ 1 ตัว: เอฟเฟกต์ไร้ผล แล้วนำกลับไปไว้ใต้สุดเด็ค', candidates, step });
      return;
    }

    case 'destroyDestroyer': {
      const id = item.destroyerId;
      if (!id || !onField(ctx, id) || s.cards[id]!.owner === me || !hits(id)) return;
      destroyCard(ctx, id, me, { bySource: item.sourceId, effect: true });
      return;
    }

    case 'braveFromField': {
      const host = item.subjectId;
      if (step.max < 1 || !host || !onField(ctx, host)) return;
      const hostDef = db.get(s.cards[host]!.cardNo);
      const candidates = [
        ...s.players[me].field.filter((id) => id !== host && db.get(s.cards[id]!.cardNo).type === 'brave'),
        ...s.players[me].field.filter((id) => id !== host).flatMap((id) => s.cards[id]!.braves),
      ].filter((b) => braveFits(db.get(s.cards[b]!.cardNo), hostDef) && braveRoom(s, db, host, b));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกเบรฟบนฟิลด์เราที่จะรวมร่างกับ ${hostDef.name} (อีกไม่เกิน ${step.max} ใบ)`, candidates, optional: true, skipLabel: 'พอแล้ว', step });
      return;
    }

    case 'cleanseAlly': {
      const candidates = s.players[me].field.filter(spiritLike);
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริต/อัลติเมทของเราที่เอฟเฟกต์ของคู่แข่งจะไร้ผล', candidates, step });
      return;
    }

    case 'markOnce':
      s.usedOncePerTurn = [...(s.usedOncePerTurn ?? []), `${self}:${step.key}`];
      return;

    case 'blockExhaustedThisTurn': {
      const candidates = s.players[me].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะป้องกันได้แม้อยู่ในรูปแบบเสื่อมสภาพในเทิร์นนี้', candidates, step });
      return;
    }

    case 'handCostThisTurn':
      s.turnHandCost = [...(s.turnHandCost ?? []).filter((t) => t.turn === s.turn), { player: me, turn: s.turn, filter: step.filter, delta: step.delta }];
      return;

    // ---------------- BS08
    case 'showdown': {
      if (!onField(ctx, self) || !spiritLike(self)) return;
      const t = step.targetId;
      if (!t) {
        // คู่แข่งระบุสปิริตของตัวเอง 1 ตัว (ตัวที่ไม่รับผลเอฟเฟกต์นี้เลือกไม่ได้)
        const candidates = s.players[opp].field.filter((id) => ['spirit', 'brave'].includes(db.get(s.cards[id]!.cardNo).type) && hits(id));
        if (candidates.length === 0) return;
        // BS11 โกวจิน: เราเลือกระบุสปิริตของคู่แข่งเอง
        const we = staticSources(s, db, [me], 'showdownWeChoose')[0];
        if (we) {
          emitStatic(ctx, we);
          ask(ctx, item, { kind: 'card', prompt: `Showdown: เลือกสปิริตของคู่แข่ง 1 ตัวที่จะเทียบ BP กับ ${db.get(s.cards[self]!.cardNo).name}`, candidates, step });
          return;
        }
        ask(ctx, item, { kind: 'card', prompt: `Showdown: เลือกสปิริตของคุณ 1 ตัวที่จะเทียบ BP กับ ${db.get(s.cards[self]!.cardNo).name}`, candidates, step }, opp);
        return;
      }
      if (!onField(ctx, t)) return;
      const bp = showdownBp(s, db, self);
      const targetBp = currentBp(s, db, t);
      emit(ctx, { type: 'showdown', cardId: self, targetId: t, bp, targetBp });
      // ตัวที่ BP น้อยกว่าหรือเท่ากันถูกทำลาย (เท่ากัน = ทั้งคู่)
      const oppLoses = targetBp <= bp;
      const selfLoses = bp <= targetBp;
      if (oppLoses) {
        recordDestroyed(ctx, item, t);
        destroyCard(ctx, t, me, { bySource: self, effect: true });
      }
      if (selfLoses) destroyCard(ctx, self, me, { bySource: self, effect: true });
      // "เมื่อทำลายเฉพาะสปิริตคู่แข่ง": เอฟเฟกต์ถัดไปทำงาน
      if (oppLoses && !selfLoses && !onField(ctx, t)) item.steps.unshift(...step.then);
      return;
    }

    case 'summonBanThisTurn':
      s.summonBans = [...(s.summonBans ?? []).filter((b) => b.turn === s.turn), { player: opp, turn: s.turn, maxCost: step.maxCost, types: step.types }];
      return;

    case 'opponentDiscardTo': {
      const n = handCards(s, opp).length - step.keep;
      if (n > 0) item.steps.unshift({ do: 'opponentDiscards', count: n });
      return;
    }

    case 'setBurstFromTrash': {
      const candidates = s.players[me].trashCards.filter((id) => inTrashOk(id) && db.get(s.cards[id]!.cardNo).burst && matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรชที่จะนำไปเซ็ทเบิร์ส (ไม่เซ็ทก็ได้)', candidates, optional: true, skipLabel: 'ไม่เซ็ท', step });
      return;
    }

    case 'opponentSymbolMinusThisTurn':
      s.turnSymbolBuffs = [...(s.turnSymbolBuffs ?? []).filter((b) => b.turn === s.turn), { player: opp, turn: s.turn, color: step.color, count: -1 }];
      return;

    case 'symbolAlliesThisTurn':
      s.turnSymbolBuffs = [...(s.turnSymbolBuffs ?? []).filter((b) => b.turn === s.turn), { player: me, turn: s.turn, filter: step.filter, color: step.color, count: step.count }];
      return;

    case 'ownCoreToVoid': {
      const p = s.players[me];
      const normal = (c: string) => !s.cores[c]!.isSoul;
      // กติกา 07 ข้อ 4: โซลคอร์ไม่ไปวอยด์
      if (step.fromId === 'trash') {
        const c = p.trashCores.find(normal);
        if (!c) return;
        removeFrom(p.trashCores, c);
        delete s.cores[c];
        emit(ctx, { type: 'coresMoved', player: me, count: 1 });
        return;
      }
      const cards = p.field.filter((id) => s.cards[id]!.cores.some(normal));
      const inTrash = p.trashCores.some(normal);
      if (cards.length === 0) {
        if (inTrash) item.steps.unshift({ do: 'ownCoreToVoid', fromId: 'trash' });
        return;
      }
      ask(ctx, item, {
        kind: 'card',
        prompt: 'เลือกการ์ดบนฟิลด์ที่จะส่งคอร์ 1 เม็ดไปวอยด์' + (inTrash ? ' หรือส่งคอร์ในแทรช' : ''),
        candidates: cards,
        ...(inTrash ? { optional: true, skipLabel: 'ส่งคอร์ในแทรช' } : {}),
        step,
      });
      return;
    }

    case 'soulToVoid': {
      // BS10 เจเน็ท: "หลังจากเอฟเฟกต์ Soul Drive ของเราทำงาน"
      queueRightAfterCurrent(ctx, () => {
        const batch = newBatch(ctx);
        for (const id of [...s.players[me].field]) queueTriggers(ctx, id, 'allySoulDrive', batch);
      });
      if (!onField(ctx, self)) return;
      const card = s.cards[self]!;
      const soul = card.cores.find((c) => s.cores[c]!.isSoul);
      if (!soul) return;
      card.cores = card.cores.filter((c) => c !== soul);
      delete s.cores[soul];
      emit(ctx, { type: 'soulDrive', cardId: self });
      return;
    }

    case 'opponentSkipStepsNextTurn':
      s.skipSteps = [...(s.skipSteps ?? []).filter((x) => x.turn >= s.turn), { player: opp, turn: s.turn + 1, steps: step.steps }];
      return;

    case 'battleLifeIfBlocked': {
      const b = s.battle;
      if (!b || s.cards[b.attackerId]!.owner !== me) return;
      b.lifeOnBlocked = { player: me, amount: step.amount };
      // ถูกป้องกันอยู่แล้ว (แฟลชหลังป้องกัน): เกิดผลทันที
      const atk = s.cards[b.attackerId]!;
      if (b.blockers.length > 0 && atk.cores.some((c) => s.cores[c]!.isSoul)) {
        b.lifeOnBlocked.done = true;
        if (!loseLife(ctx, opp, step.amount, me)) queueLifeLostTriggers(ctx, opp, step.amount);
      }
      return;
    }

    case 'lifeCapOneThisTurn':
      s.lifeCapOne = [...(s.lifeCapOne ?? []).filter((l) => l.turn === s.turn), { player: me, turn: s.turn }];
      return;

    case 'refreshAllAllies':
      for (const id of [...s.players[me].field]) {
        if (!spiritLike(id) || s.cards[id]!.state !== 'exhausted') continue;
        if (step.filter && !matchesFilter(s, db, id, step.filter)) continue;
        refreshByEffect(ctx, id, item.sourceId);
        if ((s.cards[id]!.state as string) === 'refresh') item.refreshedByThis = [...(item.refreshedByThis ?? []), id];
        if (step.noAttack && onField(ctx, id)) s.turnNoAttack = [...(s.turnNoAttack ?? []).filter((t) => t.turn === s.turn), { cardId: id, turn: s.turn }];
      }
      return;

    case 'attackShiftThisTurn':
      s.attackShiftTurn = s.turn;
      return;

    case 'destroyAllBoth':
      for (const p of PLAYERS) {
        for (const id of [...s.players[p].field]) {
          if (!matchesFilter(s, db, id, step.filter) || (p !== me && !hits(id))) continue;
          if (p !== me) recordDestroyed(ctx, item, id);
          destroyCard(ctx, id, me, { bySource: item.sourceId, effect: true });
        }
      }
      return;

    case 'trashCoreToReserve': {
      const p = s.players[me];
      const moved = p.trashCores.filter((c) => step.withSoul || !s.cores[c]!.isSoul).slice(0, step.count);
      if (moved.length === 0) return;
      p.trashCores = p.trashCores.filter((c) => !moved.includes(c));
      p.reserve.push(...moved);
      emit(ctx, { type: 'coresMoved', player: me, count: moved.length });
      return;
    }

    case 'selfFromTrashToHand': {
      const id = item.sourceId;
      const p = s.players[me];
      if (!p.trashCards.includes(id) || !inTrashOk(id)) return;
      removeFrom(p.trashCards, id);
      p.hand.push(id);
      emit(ctx, { type: 'cardToHand', player: me, cardId: id, from: 'trash' });
      return;
    }

    case 'unexhaustSelf':
      if (onField(ctx, self) && s.cards[self]!.state === 'exhausted' && !noRefreshSource(s, db, self, true)) {
        s.cards[self]!.state = 'refresh';
        emit(ctx, { type: 'cardRefreshed', cardId: self });
      }
      return;

    case 'ifBounced':
      if ((item.bouncedCount ?? 0) > 0) item.steps.unshift(...step.steps);
      return;

    // ---------------- BS11
    case 'noLifeDamageChosen': {
      const candidates = s.players[opp].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter) && hits(id));
      if (candidates.length === 0 || step.count < 1) return;
      if (disperse(step.count, step)) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกระบุสปิริต/อัลติเมทของคู่แข่ง 1 ตัว: ในเทิร์นนี้ทำความเสียหายแก่ไลฟ์เราไม่ได้', candidates, step });
      return;
    }

    case 'negateChosenThisTurn': {
      const candidates = PLAYERS.flatMap((p) => s.players[p].field).filter(
        (id) => spiritLike(id) && matchesFilter(s, db, id, step.filter) && (s.cards[id]!.owner === me || hits(id)),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริต/อัลติเมท 1 ตัว: ในเทิร์นนี้สูญเสียเอฟเฟกต์ทั้งหมด', candidates, step });
      return;
    }

    case 'trashCoresToSelf': {
      if (!onField(ctx, self)) return;
      const p = s.players[me];
      const moved = p.trashCores.slice(0, step.max ?? p.trashCores.length);
      if (moved.length === 0) return;
      p.trashCores = p.trashCores.filter((c) => !moved.includes(c));
      s.cards[self]!.cores.push(...moved);
      emit(ctx, { type: 'coresMoved', player: me, count: moved.length });
      return;
    }

    case 'ownLifeToSelf': {
      // นำคอร์ไลฟ์มาวาง = ไลฟ์ลดลง แต่ไม่ใช่การเสียไลฟ์ที่ทำให้เบิร์สของเราถูกสั่งใช้ได้ (ข้อความการ์ด)
      if (!onField(ctx, self) || step.count < 1) return;
      item.steps.unshift({ do: 'lifeCoreOnto', cardId: self, count: step.count });
      return;
    }

    case 'coresOffEverySpirit': {
      // ส่งคอร์บนสปิริต/อัลติเมทของผู้เล่นทุกคนตัวละ 1 เม็ดลงแทรชเจ้าของ (ทำพร้อมกัน: ฝั่งคู่แข่งเลือกด้วยผู้ควบคุม)
      const steps: Step[] = [];
      for (const p of PLAYERS) {
        for (const id of s.players[p].field) {
          if (!spiritLike(id) || s.cards[id]!.cores.length === 0) continue;
          if (p !== me && !hits(id)) continue;
          steps.push({ do: 'coresOff', cardId: id, n: 1, to: 'trash', byOpponent: p !== me });
        }
      }
      item.steps.unshift(...steps);
      return;
    }

    case 'symbolAttackerBattle': {
      const a = s.battle?.attackerId;
      if (!a || s.cards[a]!.owner !== me || !onField(ctx, a)) return;
      s.cards[a]!.battleSymbols = [...(s.cards[a]!.battleSymbols ?? []), { color: step.color, count: step.count }];
      return;
    }

    case 'millTopBranch': {
      const p = s.players[me];
      const top = p.deck[0];
      if (!top) return;
      mill(ctx, me, [top]);
      const hit = step.cases.find((c) => matchesFilter(s, db, top, c.filter));
      if (hit) {
        item.steps.unshift(...hit.steps);
        return;
      }
      if (step.otherwiseToHand && p.trashCards.includes(top) && inTrashOk(top)) {
        removeFrom(p.trashCards, top);
        p.hand.push(top);
        emit(ctx, { type: 'cardToHand', player: me, cardId: top, from: 'trash' });
      }
      return;
    }

    case 'symbolsZeroAllOpponent': {
      // "ในเทิร์นนี้ ... ทั้งหมด" = รวมตัวที่ลงสนามทีหลังในเทิร์นนี้ (กติกา 13 ข้อ 6)
      s.symbolsZeroTurn = [...(s.symbolsZeroTurn ?? []).filter((t) => t.turn === s.turn), { player: opp, turn: s.turn, filter: step.filter }];
      for (const id of s.players[opp].field) if (spiritLike(id) && matchesFilter(s, db, id, step.filter)) emit(ctx, { type: 'cardLocked', cardId: id });
      return;
    }

    case 'soulCostFreeThisTurn':
      s.soulCostFree = [...(s.soulCostFree ?? []).filter((x) => x.turn === s.turn), { player: me, turn: s.turn, names: step.nameIncludes, cardId: item.sourceId, source: item.source ?? 0 }];
      return;

    case 'returnCardsTo': {
      const ids = step.cardIds.filter((id) => onField(ctx, id));
      if (ids.length === 0) return;
      if (step.to === 'hand') {
        for (const id of ids) returnCard(ctx, id, 'hand');
        return;
      }
      // บนสุด/ใต้สุดเด็คโดยเรียงลำดับได้: ผู้ใช้เอฟเฟกต์เรียง
      for (const id of ids) returnCard(ctx, id, 'deckTop');
      const owner = s.cards[ids[0]!]!.owner;
      const onDeck = ids.filter((id) => s.cards[id]!.owner === owner && ownerZones(s, id).deck.includes(id));
      if (step.to === 'deckBottom' && onDeck.length > 0) item.steps.unshift({ do: 'toDeckBottom', cardIds: onDeck });
      else if (step.to === 'deckTop' && onDeck.length > 1) item.steps.unshift({ do: 'toDeckTop', cardIds: onDeck });
      return;
    }

    case 'battleLevelUnblock':
      if (s.battle && s.cards[s.battle.attackerId]?.owner === me) s.battle.levelUnblock = me;
      return;

    case 'when':
      item.steps.unshift(...(holds(step.if) ? step.steps : (step.else ?? [])));
      return;

    case 'chooseBattleBlocker': {
      const b = s.battle;
      if (!b || b.blockers.length <= 1) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริต/อัลติเมทของคู่แข่งที่จะต่อสู้ด้วย (1 ตัว)', candidates: [...b.blockers], step });
      return;
    }

    case 'setBurstFromField': {
      const candidates = s.players[me].field.filter((id) => spiritLike(id) && matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะนำไปเซ็ทเบิร์ส (ไม่เซ็ทก็ได้)', candidates, optional: true, step });
      return;
    }

    case 'battleImmune':
      if (s.battle && onField(ctx, self) && (s.battle.attackerId === self || s.battle.blockers.includes(self))) {
        s.battle.immune = [...(s.battle.immune ?? []), { cardId: self, types: step.types }];
      }
      return;

    case 'unblockableByBpAtMostSubject':
      if (s.battle && s.battle.attackerId === item.subjectId) s.battle.blockBpBan = true;
      return;

    case 'ifExhaustedAtLeast':
      if ((item.exhaustedCount ?? 0) >= step.n) item.steps.unshift(...step.steps);
      return;

    case 'soulFromTrashToSelf': {
      const p = s.players[me];
      const soul = p.trashCores.find((c) => s.cores[c]!.isSoul);
      if (!soul || !onField(ctx, self)) return;
      removeFrom(p.trashCores, soul);
      s.cards[self]!.cores.push(soul);
      emit(ctx, { type: 'soulFromTrash', cardId: self });
      if (step.then) item.steps.unshift(...step.then);
      return;
    }

    case 'exhaustOpponentTotalCost': {
      const candidates = s.players[opp].field.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && fieldCost(s, db, id) <= step.maxTotal && hits(id),
      );
      if (candidates.length === 0 || step.final) return;
      askBudget(ctx, item, candidates, step, `เลือกสปิริตของคู่แข่งที่จะเสื่อมสภาพ (คอสต์รวมไม่เกิน ${step.maxTotal})`, 'คอสต์', step.maxTotal, (id) => fieldCost(s, db, id));
      return;
    }

    case 'moveSourceBrave': {
      const brave = item.sourceId;
      const host = braveHostOf(s, brave);
      if (!host) return;
      const min = db.get(s.cards[brave]!.cardNo).braveCondition?.minCost ?? 0;
      const candidates = s.players[me].field.filter(
        (id) =>
          id !== host &&
          braveFits(db.get(s.cards[brave]!.cardNo), db.get(s.cards[id]!.cardNo)) &&
          fieldCost(s, db, id) >= min &&
          braveRoom(s, db, id, brave),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของเราที่จะให้เบรฟนี้ไปรวมร่าง (ไม่ย้ายก็ได้)', candidates, optional: true, step });
      return;
    }

    case 'forceAttackChosen': {
      if (!onField(ctx, self)) return;
      const candidates = s.players[opp].field.filter((id) => spiritLike(id) && canAttackWith(s, db, id) && hits(id));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตของคู่แข่งที่ต้องโจมตีมาที่สปิริตนี้เป็นใบแรก (ไม่เลือกก็ได้)', candidates, optional: true, step });
      return;
    }

    case 'lifeShieldThisTurn':
      s.lifeShields = [...(s.lifeShields ?? []).filter((l) => l.turn === s.turn), { player: me, minCost: step.minCost, turn: s.turn }];
      emit(ctx, { type: 'lifeShield', player: me, minCost: step.minCost });
      return;

    case 'kageSet': {
      if (!onField(ctx, step.cardId)) return;
      s.cards[step.cardId]!.kageTurn = s.turn;
      const target = s.queue.find((q) => q.kageForce && !q.kageForce.kage);
      if (target?.kageForce) target.kageForce.kage = step.cardId;
      return;
    }

    case 'symbolsZeroThisTurn':
      s.symbolsZero = { turn: s.turn, minSymbols: step.minSymbols };
      return;

    // ---------------- BS13
    case 'refreshChosen':
      if (item.chosenId && onField(ctx, item.chosenId) && s.cards[item.chosenId]!.state === 'exhausted') refreshByEffect(ctx, item.chosenId, self);
      return;

    case 'destroyOwnForReturn': {
      const candidates = s.players[me].field.filter((id) => spiritLike(id));
      const n = step.count ?? 0;
      const back = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter) && inTrashOk(id));
      if (candidates.length === 0) {
        if (n > 0) for (let i = 0; i < n; i++) item.steps.unshift({ do: 'returnFromTrash', filter: step.filter });
        return;
      }
      ask(ctx, item, {
        kind: 'card',
        prompt: `เลือกสปิริตของเราที่จะทำลาย (ทำลายแล้ว ${n} ตัว · การ์ดสปิริตในแทรช ${back.length} ใบ) หรือหยุด`,
        candidates,
        optional: true,
        skipLabel: n > 0 ? 'พอแล้ว' : 'ไม่ทำลาย',
        step,
      });
      return;
    }

    case 'chooseOne': {
      // BS11 ลองฟิลด์: ตัวเลือกที่จ่ายด้วยการส่งโซลคอร์บนสปิริตนี้ ถือว่าส่งแล้ว = ไม่ต้องมีโซลคอร์
      const soulFree = onField(ctx, self) && !!soulCostFreeSource(s, db, self) && step.options.some((o) => o.steps[0]?.do === 'soulToTrash');
      const holdsFree = (cond: Condition | undefined): boolean => {
        if (!cond || !soulFree) return holds(cond);
        if ('soulOnSelf' in cond) return true;
        if ('catalyzable' in cond) {
          const b = s.players[me].burst;
          if (!b) return false;
          const d = db.get(s.cards[b]!.cardNo);
          return (cond.catalyzable === 'any' || d.colors.includes(cond.catalyzable)) && d.abilities.some((a) => a.kind === 'burst' && a.soul);
        }
        if ('all' in cond) return cond.all.every(holdsFree);
        if ('any' in cond) return cond.any.some(holdsFree);
        return holds(cond);
      };
      if (!holdsFree(step.if)) return;
      // ตัวเลือกที่ทำไม่ได้ (เช่น "สามารถ X เพื่อ Y" ที่ทำได้ไม่ครบสองท่อน) ไม่แสดง
      const options = step.options.filter((o) => (o.steps[0]?.do === 'soulToTrash' ? holdsFree(o.if) : holds(o.if)));
      if (!options.some((o) => o.steps.length > 0)) return;
      ask(ctx, item, { kind: 'option', prompt: 'เลือก 1 อย่าง', options: options.map((o) => o.label), step: { ...step, options } });
      return;
    }
  }
}

/** สปิริตของผู้เล่นที่ Brave ใบนี้ร่วมร่างได้ (คอสต์ถึง, ยังไม่มี Brave) */
function braveHostsFor(ctx: Ctx, player: PlayerId, braveId: string): string[] {
  const braveDef = ctx.db.get(ctx.s.cards[braveId]!.cardNo);
  return ctx.s.players[player].field.filter((id) => braveFits(braveDef, ctx.db.get(ctx.s.cards[id]!.cardNo)) && braveRoom(ctx.s, ctx.db, id, braveId));
}

/** Core ที่ผู้เล่นใช้วางได้: ในรีเสิร์ฟ และบนการ์ดในสนามของตัวเอง */
function usableCores(ctx: Ctx, player: PlayerId): string[] {
  const p = ctx.s.players[player];
  // 2VS2: เฉพาะคอร์บนการ์ดของตัวเอง (กติกา 15 ข้อ 2)
  return [...p.reserve, ...ownField(ctx.s, player).flatMap((id) => ctx.s.cards[id]!.cores)];
}

function addVoidCores(ctx: Ctx, player: PlayerId, cardId: string, count: number): void {
  const got = takeVoid(ctx, player, count);
  ctx.s.cards[cardId]!.cores.push(...got);
  if (got.length > 0) emit(ctx, { type: 'voidCore', player, cardId, count: got.length });
}

/**
 * คอร์ที่ "นำจากวอยด์" โดยเอฟเฟกต์ของผู้เล่นนี้
 * องเมียววาราชิ (เมนสเต็ปของผู้เล่นทุกคน): มาจากไลฟ์ของเจ้าของเอฟเฟกต์แทน (ไลฟ์ไม่พอ = ได้เท่าที่มี)
 * การเสียไลฟ์นี้สั่งใช้เบิร์สไม่ได้ · ไลฟ์หมด = แพ้
 */
function takeVoid(ctx: Ctx, player: PlayerId, count: number): string[] {
  const { s, db } = ctx;
  if (!voidFromLife(s, db)) {
    if (count > 0) s.voidGained = { ...(s.voidGained ?? {}), [player]: (s.voidGained?.[player] ?? 0) + count };
    return Array.from({ length: count }, () => newCore(ctx, player));
  }
  if (count > 0) emitStatic(ctx, staticSources(s, db, PLAYERS, 'voidFromLife'));
  const life = s.players[player].life;
  const got = life.splice(Math.max(0, life.length - count), count);
  if (got.length > 0) emit(ctx, { type: 'lifeLost', player, amount: got.length });
  if (allZones(s, player).every((z) => z.life.length === 0)) endGame(ctx, opponentOf(player), 'lifeZero');
  return got;
}

/** การ์ดถูกทิ้งจากเด็คโดยเอฟเฟกต์ทิ้งเด็ค (ของใครก็ได้): trigger "milledAny" ของการ์ดใบนั้น (อยู่ในแทรชแล้ว) */
function queueMilledAny(ctx: Ctx, ids: string[]): void {
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    for (const id of ids) queueTriggers(ctx, id, 'milledAny', batch);
  });
}

function toBottom(ctx: Ctx, player: PlayerId, cardId: string): void {
  const deck = ctx.s.players[player].deck;
  removeFrom(deck, cardId);
  deck.push(cardId);
  emit(ctx, { type: 'cardsToDeckBottom', player, cardIds: [cardId] });
}

/** นำการ์ดออกจากที่อยู่เดิม (เด็ค/มือ/แทรช/ช่อง Burst) ถ้ามี */
/** การ์ดอยู่ในโซนใดโซนหนึ่งของผู้เล่น (เด็ค/มือ/แทรช/เบิร์ส/สนาม/ร่วมร่าง) */
function inAnyZone(ctx: Ctx, player: PlayerId, cardId: string): boolean {
  const p = ctx.s.players[player];
  return p.deck.includes(cardId) || p.hand.includes(cardId) || p.trashCards.includes(cardId) || p.burst === cardId || onField(ctx, cardId);
}

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
  // Bunshin: กลายเป็นสปิริตร่างแยก (ไม่ใช่การอัญเชิญ)
  if (step.clone) return;
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
  // กติกา 03: ดึงคอร์จากสปิริตบนสนามมาวาง = สปิริตนั้นสูญสลายทันที (เป็นส่วนของการอัญเชิญ ก่อน "เมื่อสปิริตนี้ถูกอัญเชิญ" ทำงาน)
  // กติกา 04 ข้อ 2: ร่างต้นที่สูญสลาย → ถามเรื่องเบรฟที่ร่วมร่างก่อน (แบบเดียวกับการอัญเชิญจากมือใน game.ts)
  checkDepletion(ctx);
  if (!s.players[me].field.includes(step.cardId)) return;
  // trigger ของการ์ดที่ลงสนามทำงานหลังเอฟเฟกต์นี้จบ
  queueSummonTriggers(ctx, step.cardId, newBatch(ctx), { fromTrash: from === 'trash', from, byOnStage: !!item.onStage, bySource: item.sourceId });
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
    if (def.abilities.some((a) => a.kind === 'minSummonPay')) fail('INVALID_PICK', `${def.name} อัญเชิญไม่จ่ายคอสต์ไม่ได้`);
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
    const need = summonMinCores(s, db, pk.cardId);
    if (cores.length < need) fail('NOT_ENOUGH_CORES', `${def.name} ต้องวาง Core อย่างน้อย ${need} ดวง`);
  }

  // BS11 ริวเซ็น: สีละ 1 ใบ (การ์ดหลายสีนับเป็นสีใดสีหนึ่งของมัน: ต้องจับคู่การ์ด→สีที่ไม่ซ้ำกันได้)
  if (choice.step.do === 'summonFromHandFree' && choice.step.distinctColors) {
    const colorsOf = picks.map((pk) => db.get(s.cards[pk.cardId]!.cardNo).colors as string[]);
    const used = new Set<string>();
    const fit = (i: number): boolean => i >= colorsOf.length || colorsOf[i]!.some((c) => !used.has(c) && (used.add(c), fit(i + 1) || (used.delete(c), false)));
    if (!fit(0)) fail('INVALID_PICK', 'อัญเชิญได้สีละ 1 ใบ');
  }
  const summoned: string[] = [];
  const fromHand = choice.step.do === 'summonFromHandFree';
  const from = fromHand ? 'hand' : 'deck';
  for (const pk of picks) {
    const card = s.cards[pk.cardId]!;
    removeFrom(s.players[player][fromHand ? 'hand' : 'deck'], pk.cardId);
    if (pk.braveOnto) {
      const host = s.cards[pk.braveOnto]!;
      host.braves.push(pk.cardId);
      card.cores = [];
      card.state = host.state;
      emit(ctx, { type: 'summoned', player, cardId: pk.cardId, paid: 0, from });
      emit(ctx, { type: 'braved', cardId: pk.cardId, hostId: pk.braveOnto });
      summoned.push(pk.cardId);
      continue;
    }
    for (const id of pk.cores ?? []) removeCore(s, id);
    s.players[player].field.push(pk.cardId);
    card.cores = [...(pk.cores ?? [])];
    card.state = 'refresh';
    emit(ctx, { type: 'summoned', player, cardId: pk.cardId, paid: 0, from });
    summoned.push(pk.cardId);
  }
  const batch = newBatch(ctx);
  const cur = s.queue[0];
  for (const id of summoned)
    queueSummonTriggers(ctx, id, batch, {
      from,
      byOnStage: !!cur?.onStage,
      ...(cur ? { bySource: cur.sourceId } : {}),
      ...(braveHostOf(s, id) ? { level: braveSummonLevel(ctx, id) } : {}),
      ...(choice.step.do === 'summonFromHandFree' && choice.step.noTriggers ? { noSummonTrigger: true } : {}),
    });
  if (fromHand) return;
  const rest = choice.revealed.filter((id) => !usedCards.has(id));
  const restStep = choice.step.do === 'revealSummon' ? choice.step.rest : undefined;
  if (rest.length > 0 && restStep === 'trash') mill(ctx, player, rest);
  else if (rest.length > 0) s.queue[0]!.steps.unshift({ do: 'toDeckBottom', cardIds: rest });
}

/** BS12 ฮาคุไร: step ที่นำการ์ดบนสนามกลับขึ้นมือ/เข้ากอง */
const BOUNCE_STEPS = new Set<string>(['bounceOpponent', 'bounceAllOpponent', 'returnSubjectToDeck', 'returnAllChosenColor', 'opponentTotalBp']);

/** "ต่อจำนวน ..." ของ step */
function countPer(ctx: Ctx, item: QueuedEffect, per: CountPer): number {
  const { s, db } = ctx;
  const me = item.controller;
  const self = selfOf(ctx, item);
  let n = 0;
  if (per.allies) {
    const f = withTeamOf(s, db, per.allies, self, item.subjectId);
    const field = per.anySide ? [...s.players.p1.field, ...s.players.p2.field] : s.players[me].field;
    void field;
    n = field.filter((id) => (f.types || isSpiritLike(db.get(s.cards[id]!.cardNo))) && matchesFilter(s, db, id, f)).length;
  } else if (per.songs) n = (s.players[me].songs ?? []).length;
  else if (per.subjectBraves) n = item.subjectId && s.cards[item.subjectId] ? s.cards[item.subjectId]!.braves.length : 0;
  else if (per.distinctTeams) n = distinctTeams(s, db, me);
  else if (per.destroyedByThis) n = (item.destroyedByThis ?? []).filter((d) => d.opponent).length;
  else if (per.opponents) n = s.players[opponentOf(me)].field.filter((id) => matchesFilter(s, db, id, per.opponents!)).length;
  else if (per.voidGained) n = item.voidGain ?? 0;
  else if (per.selfLevel) n = s.players[s.cards[self]!.owner].field.includes(self) ? cardLevel(s, db, self) : 0;
  else if (per.destroyedSymbolsByThis) n = (item.destroyedByThis ?? []).filter((d) => d.opponent).reduce((k, d) => k + (d.symbols ?? 0), 0);
  // ---------------- BS11
  else if (per.handIncrease) n = item.handIncrease ?? 0;
  else if (per.bouncedByThis) n = item.bouncedCount ?? 0;
  // ---------------- BS12
  else if (per.burstKills) n = s.burstKills && s.burstKills.burstId === item.subjectId ? s.burstKills.count : 0;
  else if (per.milledByThis) n = (item.milled ?? []).filter((id) => matchesFilter(s, db, id, per.milledByThis!)).length;
  else if (per.gemColors) {
    if (per.gemColors === true) n = gemColorCount(s, db, me);
    else {
      const f = per.gemColors;
      const colors = new Set<string>();
      for (const id of s.players[me].field) {
        if (!isSpiritLike(db.get(s.cards[id]!.cardNo)) || !matchesFilter(s, db, id, f)) continue;
        const all = allColorOverride(s, db);
        for (const x of [id, ...s.cards[id]!.braves]) for (const [c, k] of Object.entries(db.get(s.cards[x]!.cardNo).symbols)) if ((k ?? 0) > 0 && c !== 'ultimate') colors.add(all ?? c);
        for (const [c, k] of Object.entries(extraSymbols(s, db, id)) as [string, number | undefined][]) if ((k ?? 0) > 0 && c !== 'ultimate') colors.add(all ?? c);
      }
      n = colors.size;
    }
  }
  return Math.floor(n / (per.div ?? 1));
}

/** รีเซ่-โดรมเวล: การ์ดของเราที่ให้ On Stage เสื่อมสภาพแทนกลับใต้เด็คได้ */
function onStageReplaceSource(ctx: Ctx, player: PlayerId): StaticSource | null {
  const { s, db } = ctx;
  for (const id of s.players[player].field) {
    if (effectsNegated(s, db, id)) continue;
    const lv = cardLevel(s, db, id);
    for (const ab of db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind === 'onStageReplace' && ab.levels.includes(lv) && conditionHolds(s, id, ab.if, false, false, db)) return { cardId: id, source: ab.source };
    }
  }
  return null;
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
  if (cur) {
    useSeat(s, cur.controller, itemSeat(s, cur));
    if (s.mode === '2v2') useSeat(s, opponentOf(cur.controller), cur.oppSeat ?? 0);
  }

  if (choice.kind === 'multiSummon') {
    multiSummon(ctx, player, choice, pick);
    s.choice = null;
    runQueue(ctx);
    return;
  }

  if (choice.kind === 'arrange') {
    const order = typeof pick === 'object' && pick !== null && 'order' in pick ? pick.order : null;
    if (!order || order.length !== choice.cardIds.length || new Set(order).size !== order.length || !order.every((id) => choice.cardIds.includes(id))) {
      fail('INVALID_PICK', 'ต้องเรียงลำดับการ์ดให้ครบทุกใบ');
    }
    const deck = s.players[s.cards[order[0]!]!.owner].deck;
    for (const id of order) removeFrom(deck, id);
    if (choice.where === 'top') deck.unshift(...order);
    else deck.push(...order);
    if (choice.where === 'bottom') emit(ctx, { type: 'cardsToDeckBottom', player, cardIds: order });
    s.choice = null;
    runQueue(ctx);
    return;
  }

  if (choice.kind === 'multiCard' && choice.budget) {
    // ฟง-นีด: เลือกกี่ตัวก็ได้ ค่ารวมไม่เกินงบ แล้วผลเกิดกับทุกตัวพร้อมกัน
    const cards = typeof pick === 'object' && pick !== null && 'cards' in pick ? pick.cards : null;
    if (!cards || new Set(cards).size !== cards.length || !cards.every((id) => choice.candidates.includes(id))) fail('INVALID_PICK', 'เลือกการ์ดไม่ถูกต้อง');
    const budget = choice.budget;
    const sum = cards.reduce((n, id) => n + (budget.values[id] ?? 0), 0);
    if (sum > budget.max) fail('INVALID_PICK', `${budget.label} รวมเกิน ${budget.max}`);
    const picks = choice.candidates.filter((id) => cards.includes(id));
    if (picks.length > 0) cur.steps.unshift({ do: 'applyPicks', picks, step: { ...choice.step, final: true } as Step, player, kage: player === cur.controller && KAGE_STEPS.has(choice.step.do) });
    s.choice = null;
    runQueue(ctx);
    return;
  }
  if (choice.kind === 'multiCard') {
    const cards = typeof pick === 'object' && pick !== null && 'cards' in pick ? pick.cards : null;
    if (!cards || cards.length !== choice.count || new Set(cards).size !== cards.length || !cards.every((id) => choice.candidates.includes(id))) {
      fail('INVALID_PICK', `ต้องเลือก ${choice.count} ใบ (ไม่ซ้ำ)`);
    }
    // เรียงตามลำดับตัวเลือก (deterministic ไม่ขึ้นกับลำดับที่คลิก)
    const picks = choice.candidates.filter((id) => cards.includes(id));
    cur.steps.unshift({ do: 'applyPicks', picks, step: { ...choice.step, count: 1 } as Step, player, kage: player === cur.controller && KAGE_STEPS.has(choice.step.do) });
    s.choice = null;
    runQueue(ctx);
    return;
  }

  if (choice.kind === 'distribute') {
    const alloc = typeof pick === 'object' && pick !== null && 'alloc' in pick ? pick.alloc : null;
    if (!alloc) fail('INVALID_PICK', 'ต้องส่งจำนวนคอร์ของแต่ละตัว');
    let sum = 0;
    for (const [id, n] of Object.entries(alloc)) {
      if (!choice.candidates.includes(id) || !Number.isInteger(n) || n < 0 || n > choice.caps[id]!) fail('INVALID_PICK', 'จำนวนคอร์ไม่ถูกต้อง');
      sum += n;
    }
    if (sum !== choice.total) fail('INVALID_PICK', `ต้องเลือกคอร์รวม ${choice.total} เม็ด`);
    // เรียงตามลำดับตัวเลือก (deterministic ไม่ขึ้นกับลำดับคีย์ที่ส่งมา)
    const entries = choice.candidates.filter((id) => (alloc[id] ?? 0) > 0).map((id) => ({ cardId: id, n: alloc[id]! }));
    // กองคอร์ในรีเสิร์ฟ/แทรชของคู่แข่ง (มุโดว / เฮล-สคัล)
    for (const e of entries.filter((x) => x.cardId.startsWith('pile:'))) {
      const [, from, , seat] = e.cardId.split(':') as [string, 'reserve' | 'trash', string, string | undefined];
      cur.steps.unshift({ do: 'opponentPileCores', from, n: e.n, to: choice.to === 'place' ? 'reserve' : choice.to, ...(seat === '1' ? { seat: 1 as const } : {}) });
    }
    const cardEntries = entries.filter((x) => !x.cardId.startsWith('pile:'));
    entries.length = 0;
    entries.push(...cardEntries);
    if (choice.to === 'place') {
      // เทนเซย์: วางคอร์วอยด์ตามที่แบ่ง
      for (const e of entries) if (s.players[player].field.includes(e.cardId)) addVoidCores(ctx, player, e.cardId, e.n);
    } else cur.steps.unshift({ do: 'coresOffBatch', alloc: entries, to: choice.to, kage: player === cur.controller });
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
    // เบรฟที่คงอยู่หลังร่างต้นออกจากสนาม: คอร์ต้องมาจากรีเสิร์ฟ (กติกา 04 ข้อ 2.2)
    if ((step.noSummon || step.clone) && cores.some((id) => !s.players[player].reserve.includes(id))) fail('RESERVE_ONLY', step.clone ? 'สปิริตร่างแยกต้องวาง Core จากรีเสิร์ฟ' : 'เบรฟที่คงอยู่ต้องวาง Core จากรีเสิร์ฟ');
    putOnField(ctx, s.queue[0]!, step, cores);
    s.choice = null;
    runQueue(ctx);
    return;
  }

  if (choice.kind === 'payCost' && step.do === 'payBurstTax') {
    // จินเบร์: จ่ายแล้วเปิดเบิร์ส · ไม่จ่าย = ไม่เปิด (เบิร์สยังเซ็ทอยู่)
    if (pick !== null) {
      if (typeof pick !== 'object' || !('pay' in pick)) fail('INVALID_PICK', 'ต้องส่ง Core ที่จะจ่าย หรือ null เพื่อไม่จ่าย');
      if (pick.pay.length !== step.cost) fail('WRONG_PAYMENT', `ต้องจ่าย Core ${step.cost} ดวง`);
      if (new Set(pick.pay).size !== pick.pay.length) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
      for (const id of pick.pay) assertUsableCore(ctx, player, id);
      for (const id of pick.pay) {
        removeCore(s, id);
        s.players[player].trashCores.push(id);
      }
      emit(ctx, { type: 'costPaid', player, cardId: choice.sourceId, paid: step.cost });
      cur.steps.unshift(...step.then);
    } else {
      // สิงโตควันม่วง: ไม่จ่าย = ไม่อัญเชิญ · การ์ดที่ไม่ได้อยู่ในโซนใด (เบิร์ส/ร่างแยกที่หงาย) ลงแทรช
      const ps = step.then[0];
      if (ps?.do === 'placeCores' && !inAnyZone(ctx, cur.controller, ps.cardId)) {
        if (ps.cardId === cur.sourceId) cur.trashWhenDone = true;
        else s.players[s.cards[ps.cardId]!.owner].trashCards.push(ps.cardId);
      }
    }
  } else if (choice.kind === 'payCost' && step.do === 'payForSummon') {
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
      cur.steps.unshift({ do: 'placeCores', cardId: step.cardId, taxPaid: true, millAsked: true });
    }
  } else if (choice.kind === 'payCost') {
    const item = cur;
    if (pick !== null) {
      if (typeof pick !== 'object' || !('pay' in pick)) fail('INVALID_PICK', 'ต้องส่ง Core ที่จะจ่าย หรือ null เพื่อไม่จ่าย');
      const def = ctx.db.get(s.cards[choice.sourceId]!.cardNo);
      const { paid } = payCost(ctx, player, def, pick.pay, []);
      emit(ctx, { type: 'costPaid', player, cardId: choice.sourceId, paid });
      item.paidWithSoul = pick.pay.some((id) => s.cores[id]!.isSoul);
      // แฟลชที่จ่ายคอสต์ต่อจากเบิร์ส ไม่ใช่ "เอฟเฟกต์จากเบิร์ส" แล้ว: กระจายด้วย Dispersion ได้ (เจ้าของโปรเจกต์กำหนด)
      item.isBurst = false;
      // BS11 ระบำวิญญาณมังกร: "เอฟเฟกต์เมน" ของการ์ดนี้
      const timing = step.do === 'payToUseFlash' && step.main ? 'main' : 'flash';
      const flash = def.abilities.flatMap((a) => (a.kind === 'magic' && a.timing === timing ? a.steps : []));
      item.steps.unshift(...flash);
      // จ่าย Flash ของการ์ดนี้ (เช่น หลังเปิด Burst) = ต่อ Chain อีกข้อ
      const flashText = (def.effects as { timing?: string }[]).findIndex((x) => x.timing === timing);
      emit(ctx, { type: 'effectResolving', player, cardId: choice.sourceId, source: flashText >= 0 ? flashText : null });
    }
  } else if (choice.kind === 'option') {
    if (step.do !== 'chooseOne' || typeof pick !== 'number' || !step.options[pick]) fail('INVALID_PICK', 'ตัวเลือกไม่ถูกต้อง');
    const option = step.options[pick]!;
    // เลือกไม่ใช้เอฟเฟกต์ "สามารถ" ทั้งเอฟเฟกต์ (เช่น เมื่ออัญเชิญ: เบิร์สของคู่แข่งเปิดไม่ได้)
    if (option.steps.length === 0 && cur.steps.length === 0) cur.declined = true;
    cur.steps.unshift(...option.steps);
    emit(ctx, { type: 'optionChosen', player, option: option.label });
  } else {
    if (pick === null && choice.optional) {
      // ไม่อัญเชิญเพิ่ม: ที่เหลือไว้ใต้สุดเด็ค
      if (step.do === 'braveOrSpirit') cur.steps.unshift({ do: 'placeCores', cardId: step.cardId, asSpirit: true });
      // ไม่ทำลายเพิ่ม: นำการ์ดกลับขึ้นมือตามจำนวนที่ทำลาย
      if (step.do === 'destroyOwnForReturn') for (let i = 0; i < (step.count ?? 0); i++) cur.steps.unshift({ do: 'returnFromTrash', filter: step.filter });
      if (step.do === 'ownCoreToVoid') cur.steps.unshift({ do: 'ownCoreToVoid', fromId: 'trash' });
      if (step.do === 'ownSoulToTrash') {
        soulReserveToTrash(ctx, player);
        soulTrashedByEffect(ctx, cur, player);
      }
      // เทนเซย์: วางที่เหลือบนการ์ดนี้
      if (step.do === 'voidCoresSpread' && step.left) {
        const self = braveHostOf(s, cur.sourceId) ?? cur.sourceId;
        if (s.players[player].field.includes(self)) addVoidCores(ctx, player, self, step.left);
      }
      // เธาซันด์ลีฟ: ที่เหลือไว้บนสุดเด็คโดยเรียงลำดับได้
      if (step.do === 'scry' && (step.cards?.length ?? 0) > 1) cur.steps.unshift({ do: 'toDeckTop', cardIds: step.cards! });
      s.choice = null;
      runQueue(ctx);
      return;
    }
    if (typeof pick !== 'string' || !choice.candidates.includes(pick)) fail('INVALID_PICK', 'เลือกการ์ดนี้ไม่ได้');
    // Kagemusha: สปิริตของคู่แข่ง (ที่มี Soul Core) ตกเป็นเป้า → คู่แข่งอัญเชิญการ์ด Kagemusha จากมือได้ แล้วเอฟเฟกต์ต้องเล็งการ์ดนั้นแทน
    const targeted = player === cur.controller ? s.cards[pick]!.owner !== player : step.do === 'showdown' && s.cards[pick]!.owner === player;
    if (KAGE_STEPS.has(step.do) && targeted && !(cur.kageDone ?? []).includes(pick) && kagemusha(ctx, cur, step, pick)) return;
    applyCardPick(ctx, cur, choice, player, pick);
  }

  s.choice = null;
  runQueue(ctx);
}

/**
 * ผลของการเลือกการ์ด 1 ใบ (choice kind card) · ใช้ทั้งการเลือกทีละใบ และการเลือกหลายใบทีเดียว (applyPicks: ส่ง step ที่ count = 1)
 */
function applyCardPick(ctx: Ctx, cur: QueuedEffect, choice: Extract<PendingChoice, { kind: 'card' }>, player: PlayerId, pick: string): void {
  const { s } = ctx;
  const step = choice.step;
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
      cur.chosenId = pick;
      addTurnBp(ctx, pick, step.amount);
      // นีดเดิลเกลียวสว่าน: หลังจากนั้น BP ตั้งแต่ N → ฟื้นสภาพ
      if (step.refreshIfMinBp !== undefined && s.cards[pick]!.state === 'exhausted' && currentBp(s, ctx.db, pick) >= step.refreshIfMinBp) refreshByEffect(ctx, pick, cur.sourceId);
      break;
    case 'revealPickRestTrash':
      removeFrom(p.deck, pick);
      p.hand.push(pick);
      emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'deck' });
      handIncreasedByEffect(ctx, player);
      if (step.rest === 'bottom') cur.steps.unshift({ do: 'toDeckBottom', cardIds: (choice.revealed ?? []).filter((id) => id !== pick) });
      else if (step.rest === 'top') cur.steps.unshift({ do: 'toDeckTop', cardIds: (choice.revealed ?? []).filter((id) => id !== pick) });
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
    // ---------------- BS10 Bunshin
    case 'flipClone': {
      const c = s.cards[pick]!;
      if (!c.realCardNo) break;
      const real = c.realCardNo;
      emit(ctx, { type: 'cardsRevealed', player, cardIds: [pick] });
      if (ctx.db.get(real).type === 'spirit') {
        // การ์ดสปิริต: อัญเชิญไม่จ่ายคอสต์ (คอร์บนร่างแยกกลับรีเสิร์ฟ แล้ววางคอร์ใหม่แบบอัญเชิญด้วยเอฟเฟกต์)
        c.cardNo = real;
        delete c.realCardNo;
        removeFrom(s.players[player].field, pick);
        s.players[player].reserve.push(...c.cores);
        c.cores = [];
        c.state = 'refresh';
        cur.steps.unshift({ do: 'placeCores', cardId: pick });
      } else {
        leaveField(ctx, pick, 'trash');
        emit(ctx, { type: 'cloneDiscarded', player, cardId: pick });
      }
      break;
    }
    // ---------------- BS09 ทิ้งการ์ดในมือคู่แข่งแบบสุ่ม (เลือกคว่ำหน้า)
    case 'opponentRandomDiscard': {
      const owner = s.cards[pick]!.owner;
      removeFrom(ownerZones(s, pick).hand, pick);
      ownerZones(s, pick).trashCards.push(pick);
      emit(ctx, { type: 'discarded', player: owner, cardId: pick });
      if (step.count > 1) cur.steps.unshift({ ...step, count: step.count - 1, if: undefined });
      break;
    }
    // ---------------- BS10
    case 'symbolChosenAllyThisTurn':
      s.turnSymbols = [...(s.turnSymbols ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn, color: step.color, count: step.count }];
      break;
    case 'symbolsZeroChosen':
      s.symbolsZeroCards = [...(s.symbolsZeroCards ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn }];
      break;
    case 'voidCoresSpread':
      addVoidCores(ctx, player, pick, 1);
      if ((step.left ?? 1) > 1) cur.steps.unshift({ ...step, left: (step.left ?? 1) - 1 });
      break;
    case 'scry': {
      const p2 = s.players[player];
      removeFrom(p2.deck, pick);
      p2.deck.push(pick);
      emit(ctx, { type: 'returnedToDeck', player, cardId: pick, where: 'bottom' });
      const rest = (step.cards ?? []).filter((id) => id !== pick);
      if (rest.length > 0) cur.steps.unshift({ ...step, cards: rest });
      break;
    }
    case 'noLifeDamageChosen':
      s.noLifeDamageCards = [...(s.noLifeDamageCards ?? []).filter((t) => t.turn === s.turn), { cardId: pick, player, turn: s.turn }];
      emit(ctx, { type: 'cardLocked', cardId: pick });
      break;
    case 'negateChosenThisTurn':
      s.negatedCards = [...(s.negatedCards ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn }];
      emit(ctx, { type: 'cardLocked', cardId: pick });
      break;
    case 'noDestroyChosenThisTurn':
      s.noDestroyTurn = [...(s.noDestroyTurn ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn }];
      break;
    case 'lifeOnHitChosenThisTurn':
      s.hitLifeTurn = [...(s.hitLifeTurn ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn }];
      break;
    // ---------------- BS09
    case 'destroyLowestCostOpponent':
      recordDestroyed(ctx, cur, pick);
      destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
      break;
    case 'opponentExhaustsOwn':
      // คู่แข่งเป็นคนเลือก แต่เสื่อมสภาพโดยเอฟเฟกต์ของเรา
      cur.exhaustedChosen = pick;
      s.cards[pick]!.state = 'exhausted';
      emit(ctx, { type: 'exhausted', cardId: pick });
      queueExhaustTriggers(ctx, pick);
      if (step.count > 1) cur.steps.unshift({ ...step, count: step.count - 1 });
      break;
    case 'ownSoulToTrash': {
      const card = s.cards[pick]!;
      const soul = card.cores.find((c) => s.cores[c]!.isSoul);
      if (soul) {
        card.cores = card.cores.filter((c) => c !== soul);
        p.trashCores.push(soul);
        emit(ctx, { type: 'soulToTrash', cardId: pick });
        soulTrashedByEffect(ctx, cur, player);
      }
      break;
    }
    case 'opponentTrashSameNameToBottom': {
      const owner = s.cards[pick]!.owner;
      const op = ownerZones(s, pick);
      const name = ctx.db.get(s.cards[pick]!.cardNo).name;
      const ids = [pick, ...op.trashCards.filter((id) => id !== pick && ctx.db.get(s.cards[id]!.cardNo).name === name && !trashImmune(ctx.db, s, id))].slice(0, step.max);
      for (const id of ids) {
        removeFrom(op.trashCards, id);
        op.deck.push(id);
        emit(ctx, { type: 'returnedToDeck', player: owner, cardId: id, where: 'bottom' });
      }
      break;
    }
    case 'immuneChosenThisTurn':
      s.turnImmune = [...(s.turnImmune ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn }];
      emit(ctx, { type: 'bpBuffed', cardId: pick, amount: 0 });
      break;
    case 'destroyOwn':
      destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
      if (step.then) cur.steps.unshift(...step.then);
      break;
    case 'summonFromTrashThen': {
      const def = ctx.db.get(s.cards[pick]!.cardNo);
      const cost = payableCost(s, ctx.db, player, def, baseCost(s, ctx.db, pick));
      cur.steps.unshift({ do: 'payForSummon', cardId: pick, cost }, { do: 'ifOnField', cardId: pick, steps: step.then });
      break;
    }
    case 'summonFreeHandOrTrash':
      cur.steps.unshift({ do: 'placeCores', cardId: pick }, ...(step.max > 1 ? [{ ...step, max: step.max - 1 }] : []));
      break;
    case 'summonFromHandFree':
      cur.steps.unshift({ do: 'placeCores', cardId: pick });
      break;
    case 'summonFromTrashFree':
      cur.steps.unshift({ do: 'placeCores', cardId: pick });
      break;
    case 'destroyOpponentBrave': {
      // Brave ที่ร่วมร่างอยู่: ออกจากผู้ร่วมร่างลง Trash ของเจ้าของ (ผู้ร่วมร่างอยู่ต่อ)
      const owner = s.cards[pick]!.owner;
      // เอาออกเฉพาะจากผู้ร่วมร่างที่มีเบรฟใบนี้ (removeFrom โยน error ถ้าไม่มี: เดิมวนทุกการ์ด = พังเมื่อคู่แข่งมีการ์ดบนสนามหลายใบ)
      for (const id of s.players[owner].field) if (s.cards[id]!.braves.includes(pick)) removeFrom(s.cards[id]!.braves, pick);
      s.players[owner].trashCards.push(pick);
      emit(ctx, { type: 'destroyed', cardId: pick, bySource: cur.sourceId });
      // เบรฟที่ร่วมร่างอยู่ไม่ใช่สปิริต: ไม่เปิดเบิร์ส "หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง" (เจ้าของโปรเจกต์กำหนด)
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
      if (currentBp(s, ctx.db, pick) <= 0) {
        // "กลายเป็น BP0 เป็นใบแรกสุดของเทิร์น" (แองเจลิคฟีเธอร์)
        if (s.bpZeroTurn !== s.turn) cur.firstZeroBp = true;
        s.bpZeroTurn = s.turn;
        // BP0 ไม่ถูกทำลายเอง: ทำลายเฉพาะเอฟเฟกต์ที่เขียนว่า "ทำลาย…ที่กลายเป็น BP0 โดยเอฟเฟกต์นี้"
        if (step.destroyAtZero) destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
        // BS11 บุปผาร่ายรำดรอว์: "ทำลายสปิริตนั้นและเราจั่ว" = จั่วเมื่อกลายเป็น BP0 แม้ทำลายไม่ได้
        if (step.zeroThen?.length) cur.steps.unshift(...step.zeroThen);
        if (!step.destroyAtZero && step.exhaustAtZero && s.cards[pick]!.state === 'refresh') {
          s.cards[pick]!.state = 'exhausted';
          emit(ctx, { type: 'exhausted', cardId: pick });
          queueExhaustTriggers(ctx, pick);
        }
      }
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
      const base = baseCost(s, ctx.db, pick);
      const fullRed = step.fullReductionIf && conditionHoldsFor(ctx, cur, step.fullReductionIf);
      const cost = fullRed ? Math.max(0, base - Object.values(def.reduction).reduce<number>((n, v) => n + (v ?? 0), 0)) : payableCost(s, ctx.db, player, def, base);
      cur.steps.unshift({ do: 'payForSummon', cardId: pick, cost }, ...(step.repeat ? [step] : []));
      break;
    }
    case 'exhaustOpponent':
      s.cards[pick]!.state = 'exhausted';
      emit(ctx, { type: 'exhausted', cardId: pick });
      if (step.lockRefresh) s.refreshLocks = [...(s.refreshLocks ?? []), pick];
      cur.exhaustedCount = (cur.exhaustedCount ?? 0) + 1;
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
      if (!step.final) cur.steps.unshift({ do: 'exhaustOpponentTotalBp', maxTotal: step.maxTotal - bp });
      break;
    }
    case 'bounceOpponent': {
      // BS13 ดาร์คเนส-กริฟฟอน: ใช้โซลคอร์จ่ายคอสต์อัญเชิญ = คอร์บนการ์ดที่กลับขึ้นมือลงแทรชของเจ้าของแทนรีเสิร์ฟ
      if (step.coresToTrashIf && conditionHolds(s, cur.sourceId, step.coresToTrashIf, cur.paidWithSoul, !!cur.catalyzed, ctx.db)) {
        const card = s.cards[pick]!;
        const moved = [...card.cores, ...card.braves.flatMap((b) => s.cards[b]!.cores)];
        if (moved.length > 0) {
          card.cores = [];
          for (const b of card.braves) s.cards[b]!.cores = [];
          s.players[card.owner].trashCores.push(...moved);
          emit(ctx, { type: 'coresToTrash', cardId: pick, count: moved.length });
        }
      }
      const redirected = !step.to || step.to === 'hand' ? bounceRedirect(ctx, cur, player, [pick], null) : false;
      if (!redirected) returnCard(ctx, pick, step.to === 'deckBottom' ? 'deckBottom' : step.to === 'deckTop' ? 'deckTop' : 'hand');
      cur.bouncedCount = (cur.bouncedCount ?? 0) + 1;
      if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: (step.count ?? 1) - 1, if: undefined });
      // ถามเรื่องกู๊ดลัคฮิลก่อนเป้าถัดไป
      if (redirected) bounceRedirect(ctx, cur, player, [pick], cur.steps);
      break;
    }
    case 'unblockableThisTurn':
      s.unblockableTurn = [...(s.unblockableTurn ?? []).filter((u) => u.turn === s.turn), { cardId: pick, turn: s.turn }];
      if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: (step.count ?? 1) - 1 });
      break;
    case 'useMagicFromHandFree': {
      const def = ctx.db.get(s.cards[pick]!.cardNo);
      const fromShown = (s.shownCards ?? []).includes(pick);
      removeFrom(p.hand, pick);
      emit(ctx, { type: 'magicUsed', player, cardId: pick, paid: 0, timing: 'flash' });
      const steps = def.abilities.flatMap((a) => (a.kind === 'magic' && a.timing === 'flash' ? a.steps : []));
      // ทำงานต่อจากเอฟเฟกต์นี้ทันที แล้วเมจิคลงแทรช
      s.queue.splice(1, 0, { controller: player, sourceId: pick, steps: [...steps], paidWithSoul: false, trashWhenDone: true });
      queueMagicUsedTriggers(ctx, player, pick, !fromShown);
      break;
    }
      // ---------------- BS08
      case 'showdown':
        cur.steps.unshift({ ...step, targetId: pick });
        break;
      case 'setBurstFromTrash': {
        const old = p.burst;
        if (old) p.trashCards.push(old);
        removeFrom(p.trashCards, pick);
        p.burst = pick;
        emit(ctx, { type: 'burstSet', player, replacedCardId: old ?? null });
        break;
      }
      case 'ownCoreToVoid': {
        const card = s.cards[pick]!;
        const c = card.cores.find((x) => !s.cores[x]!.isSoul);
        if (c) {
          card.cores = card.cores.filter((x) => x !== c);
          delete s.cores[c];
          emit(ctx, { type: 'coresRemoved', cardId: pick, count: 1, to: 'void' });
        }
        break;
      }

    case 'showFromHand':
      s.shownCards = [...(s.shownCards ?? []), pick];
      emit(ctx, { type: 'cardShown', player, cardId: pick });
      break;
    case 'allySoulToTrash': {
      cur.chosenId = pick;
      const card = s.cards[pick]!;
      const soul = card.cores.find((c) => s.cores[c]!.isSoul);
      if (soul) {
        card.cores = card.cores.filter((c) => c !== soul);
        p.trashCores.push(soul);
        emit(ctx, { type: 'soulToTrash', cardId: pick });
        soulTrashedByEffect(ctx, cur, player);
      }
      break;
    }
    case 'voidCore':
      addVoidCores(ctx, player, pick, step.count);
      // BS13 เนก้า-ไทฟอน: "...วางบนสปิริตสีม่วงของเรา, ฟื้นสภาพสปิริตนั้น" (refreshChosen)
      cur.chosenId = pick;
      break;
    case 'returnSubjectToDeck':
      returnToDeckBottomAny(ctx, pick);
      break;
    case 'braveOrSpirit': {
      // ร่วมร่างทันที: ไม่วาง Core · กติกา 04: อัญเชิญแบบร่วมร่างโดยตรง "เมื่อเบรฟนี้ถูกอัญเชิญ" ก็ทำงานตามปกติ
      const from = detach(ctx, player, step.cardId);
      const host = s.cards[pick]!;
      const brave = s.cards[step.cardId]!;
      host.braves.push(step.cardId);
      brave.cores = [];
      brave.state = host.state;
      emit(ctx, { type: 'summoned', player, cardId: step.cardId, paid: 0, from });
      emit(ctx, { type: 'braved', cardId: step.cardId, hostId: pick });
      queueSummonTriggers(ctx, step.cardId, newBatch(ctx), { from, bySource: cur.sourceId, level: braveSummonLevel(ctx, step.cardId) });
      break;
    }
    case 'toDeckTop': {
      // วางใบนี้บนสุด แล้วใบที่เลือกต่อไปจะวางทับ (ใบสุดท้ายที่เหลืออยู่บนสุด)
      const rest = step.cardIds.filter((id) => id !== pick && p.deck.includes(id));
      removeFrom(p.deck, pick);
      for (const id of rest) removeFrom(p.deck, id);
      p.deck.unshift(pick);
      p.deck.unshift(...rest);
      if (rest.length > 1) cur.steps.unshift({ do: 'toDeckTop', cardIds: rest });
      break;
    }
    case 'toDeckBottom':
      toBottom(ctx, player, pick);
      cur.steps.unshift({ do: 'toDeckBottom', cardIds: step.cardIds.filter((id) => id !== pick) });
      break;
    case 'refreshChosenAlly': {
      cur.chosenId = pick;
      refreshByEffect(ctx, pick, cur.sourceId);
      if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: (step.count ?? 1) - 1, exclude: [...(step.exclude ?? []), pick], if: undefined });
      if (step.sameNameIf && conditionHoldsFor(ctx, cur, step.sameNameIf)) {
        const name = ctx.db.get(s.cards[pick]!.cardNo).name;
        for (const id of p.field) {
          if (id === pick || s.cards[id]!.state !== 'exhausted' || ctx.db.get(s.cards[id]!.cardNo).name !== name) continue;
          refreshByEffect(ctx, id, cur.sourceId);
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
      if (step.then) cur.steps.unshift(...step.then);
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
      cur.returned = pick;
      emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'trash' });
      handIncreasedByEffect(ctx, player);
      if ((step.count ?? 1) > 1) cur.steps.unshift({ ...step, count: step.count! - 1 });
      break;
    case 'disableChosenOpponent': {
      s.turnLocks = [...(s.turnLocks ?? []).filter((l) => l.turn === s.turn), { cardId: pick, turn: s.turn }];
      emit(ctx, { type: 'cardLocked', cardId: pick });
      const rest = (step.count ?? 1) - 1;
      if (rest > 0) cur.steps.unshift({ ...step, count: rest });
      break;
    }
    case 'discardUpTo':
      removeFrom(p.hand, pick);
      p.trashCards.push(pick);
      emit(ctx, { type: 'discarded', player, cardId: pick });
      cur.discardedCount = (cur.discardedCount ?? 0) + 1;
      cur.steps.unshift(step);
      break;
    case 'summonFromTrashBudget': {
      const cost = baseCost(s, ctx.db, pick);
      cur.steps.unshift({ do: 'placeCores', cardId: pick }, { ...step, budget: step.budget - cost });
      break;
    }
    case 'setBurstFromShown': {
      const replaced = p.burst;
      if (replaced) p.trashCards.push(replaced);
      removeFrom(p.hand, pick);
      s.shownCards = (s.shownCards ?? []).filter((id) => id !== pick);
      p.burst = pick;
      emit(ctx, { type: 'burstSet', player, replacedCardId: replaced });
      break;
    }
    case 'moveOpponentCore': {
      if (!step.fromId) {
        cur.steps.unshift({ do: 'moveOpponentCore', fromId: pick });
        break;
      }
      const from = s.cards[step.fromId]!;
      // คอร์ปกติก่อน
      const core = from.cores.find((c) => !s.cores[c]!.isSoul) ?? from.cores[0];
      if (!core) break;
      from.cores = from.cores.filter((c) => c !== core);
      s.cards[pick]!.cores.push(core);
      emit(ctx, { type: 'coresRemoved', cardId: step.fromId, count: 1, to: 'reserve' });
      break;
    }
    case 'soulToAlly': {
      const from = step.from === 'self' ? selfOf(ctx, cur) : cur.sourceId;
      const card = s.cards[from]!;
      const soul = card.cores.find((c) => s.cores[c]!.isSoul);
      if (soul) {
        cur.chosenId = pick;
        card.cores = card.cores.filter((c) => c !== soul);
        s.cards[pick]!.cores.push(soul);
        emit(ctx, { type: 'soulToReserve', cardId: from });
        if (step.refresh && s.cards[pick]!.state === 'exhausted') refreshByEffect(ctx, pick, cur.sourceId);
        if (step.then) cur.steps.unshift(...step.then);
      }
      break;
    }
    case 'returnOwnToHand':
      returnCard(ctx, pick, 'hand');
      break;
    // ---------------- BS12
    case 'trashSoulToAlly': {
      const soul = p.trashCores.find((c) => s.cores[c]!.isSoul);
      if (!soul) break;
      removeFrom(p.trashCores, soul);
      s.cards[pick]!.cores.push(soul);
      emit(ctx, { type: 'coresMoved', player, count: 1 });
      break;
    }
    case 'peekHandDiscard': {
      const opp = opponentOf(player);
      removeFrom(s.players[opp].hand, pick);
      s.players[opp].trashCards.push(pick);
      emit(ctx, { type: 'discarded', player: opp, cardId: pick });
      if (step.count > 1) cur.steps.unshift({ ...step, count: step.count - 1 });
      break;
    }
    // ---------------- BS07
    case 'songFromHand': {
      removeFrom(p.hand, pick);
      p.songs = [...(p.songs ?? []), pick];
      emit(ctx, { type: 'songPlaced', player, cardId: pick, from: 'hand' });
      break;
    }
    case 'songToTrash': {
      const owner = s.players[s.cards[pick]!.owner];
      owner.songs = (owner.songs ?? []).filter((id) => id !== pick);
      owner.trashCards.push(pick);
      emit(ctx, { type: 'songRemoved', player: s.cards[pick]!.owner, cardId: pick, to: 'trash' });
      break;
    }
    case 'songToHand': {
      if (p.trashCards.includes(pick)) {
        removeFrom(p.trashCards, pick);
        p.hand.push(pick);
        emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'trash' });
      } else {
        p.songs = (p.songs ?? []).filter((id) => id !== pick);
        p.hand.push(pick);
        emit(ctx, { type: 'songRemoved', player, cardId: pick, to: 'hand' });
      }
      handIncreasedByEffect(ctx, player);
      break;
    }
    case 'myUnit':
      cur.steps.unshift({ ...step, picked: [...(step.picked ?? []), pick] });
      break;
    case 'revealPickEach':
      removeFrom(p.deck, pick);
      p.hand.push(pick);
      emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'deck' });
      handIncreasedByEffect(ctx, player);
      cur.steps.unshift({ ...step, index: (step.index ?? 0) + 1 });
      break;
    case 'opponentTotalBp': {
      const bp = step.metric === 'cost' ? fieldCost(s, ctx.db, pick) : currentBp(s, ctx.db, pick);
      if (step.action === 'bounce' && !bounceRedirect(ctx, cur, player, [pick], cur.steps)) returnCard(ctx, pick, 'hand');
      else {
        recordDestroyed(ctx, cur, pick);
        destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
      }
      if (!step.final) cur.steps.unshift({ ...step, maxTotal: step.maxTotal - bp });
      break;
    }
    case 'braveFromField': {
      const host = cur.subjectId!;
      const from = braveHostOf(s, pick);
      const brave = s.cards[pick]!;
      if (from) removeFrom(s.cards[from]!.braves, pick);
      else {
        // เบรฟที่ยืนเดี่ยว: Core บนเบรฟกลับรีเสิร์ฟ
        removeFrom(p.field, pick);
        p.reserve.push(...brave.cores);
        brave.cores = [];
      }
      s.cards[host]!.braves.push(pick);
      brave.state = s.cards[host]!.state;
      emit(ctx, { type: 'braved', cardId: pick, hostId: host });
      if (step.max > 1) cur.steps.unshift({ ...step, max: step.max - 1 });
      break;
    }
    case 'cleanseAlly': {
      const c = s.cards[pick]!;
      if (c.turnBp < 0) c.turnBp = 0;
      s.turnLocks = (s.turnLocks ?? []).filter((l) => l.cardId !== pick);
      s.refreshLocks = (s.refreshLocks ?? []).filter((id) => id !== pick);
      emit(ctx, { type: 'cleansed', cardId: pick });
      break;
    }
    case 'blockExhaustedThisTurn':
      s.turnBlockExhausted = [...(s.turnBlockExhausted ?? []).filter((t) => t.turn === s.turn), { cardId: pick, turn: s.turn }];
      break;
    case 'chooseBattleBlocker':
      if (s.battle) s.battle.blockers = [pick];
      emit(ctx, { type: 'blockerChosen', cardId: pick });
      break;

    case 'moveAllySoul': {
      if (!step.fromId) {
        cur.steps.unshift({ do: 'moveAllySoul', fromId: pick });
        break;
      }
      const from = s.cards[step.fromId]!;
      const soul = from.cores.find((c) => s.cores[c]!.isSoul);
      if (!soul) break;
      from.cores = from.cores.filter((c) => c !== soul);
      s.cards[pick]!.cores.push(soul);
      emit(ctx, { type: 'soulToReserve', cardId: step.fromId });
      break;
    }
    case 'setBurstFromField': {
      if (leaveField(ctx, pick, 'hand') === 'trash') break;
      removeFrom(p.hand, pick);
      const replaced = p.burst;
      if (replaced) p.trashCards.push(replaced);
      p.burst = pick;
      emit(ctx, { type: 'burstSet', player, replacedCardId: replaced });
      break;
    }
    case 'exhaustOpponentTotalCost': {
      const cost = fieldCost(s, ctx.db, pick);
      s.cards[pick]!.state = 'exhausted';
      emit(ctx, { type: 'exhausted', cardId: pick });
      queueExhaustTriggers(ctx, pick);
      if (!step.final) cur.steps.unshift({ do: 'exhaustOpponentTotalCost', maxTotal: step.maxTotal - cost });
      break;
    }
    case 'moveSourceBrave': {
      const brave = cur.sourceId;
      const host = braveHostOf(s, brave);
      if (!host) break;
      const to = s.cards[pick]!;
      removeFrom(s.cards[host]!.braves, brave);
      to.braves.push(brave);
      // กติกา 04 ข้อ 1: ฝ่ายใดเสื่อมสภาพ = ร่างที่รวมแล้วเสื่อมสภาพ
      if (s.cards[host]!.state === 'exhausted') to.state = 'exhausted';
      s.cards[brave]!.state = to.state;
      emit(ctx, { type: 'braved', cardId: brave, hostId: pick });
      break;
    }
    case 'forceAttackChosen':
      s.forcedAttack = { turn: s.turn, attackerId: pick, holderId: selfOf(ctx, cur) };
      emit(ctx, { type: 'forcedAttack', cardId: pick, holderId: selfOf(ctx, cur) });
      break;
    case 'destroyOwnForReturn':
      destroyCard(ctx, pick, player, { bySource: cur.sourceId, effect: true });
      cur.steps.unshift({ ...step, count: (step.count ?? 0) + 1 });
      break;
    default:
      throw new Error(`step ${step.do} ไม่ได้ใช้การเลือกการ์ด`);
  }
}

/**
 * Kagemusha: ถ้าเป้า (สปิริตของคู่แข่งของผู้เลือก) เปิดให้ Kagemusha ได้ → ถามเจ้าของเป้าก่อน แล้วค่อยให้เอฟเฟกต์เล็งใหม่
 * คืน true ถ้าเข้าคิวถามแล้ว (การเลือกครั้งนี้ยังไม่มีผล)
 */
function kagemusha(ctx: Ctx, cur: QueuedEffect, step: Step, pick: string, fromExec = false): boolean {
  const { s, db } = ctx;
  const owner = s.cards[pick]!.owner;
  const free = kagemushaFreeNexus(s, db, owner);
  const usable = kagemushaOptions(s, db, pick).filter((o) => o.payable || (free && o.placeable));
  if (usable.length === 0) return false;
  const name = (id: string) => db.get(s.cards[id]!.cardNo).name;
  const options = usable.flatMap((o) => [
    ...(o.payable
      ? [{ label: `Kagemusha: อัญเชิญ ${name(o.cardId)} (จ่ายคอสต์ ${o.cost})`, steps: [{ do: 'payForSummon', cardId: o.cardId, cost: o.cost }, { do: 'kageSet', cardId: o.cardId }] as Step[] }]
      : []),
    ...(free && o.placeable
      ? [{ label: `Kagemusha: เสื่อมสภาพ ${name(free)} เพื่ออัญเชิญ ${name(o.cardId)} ไม่จ่ายคอสต์`, steps: [{ do: 'exhaustCard', cardId: free }, { do: 'placeCores', cardId: o.cardId }, { do: 'kageSet', cardId: o.cardId }] as Step[] }]
      : []),
  ]);
  cur.kageDone = [...(cur.kageDone ?? []), pick];
  cur.kageForce = { orig: pick };
  // เอฟเฟกต์ที่เล็งอยู่เลือกใหม่หลัง Kagemusha (ครั้งนั้นบังคับเป้า)
  cur.steps.unshift(step);
  s.queue.unshift({
    controller: owner,
    sourceId: usable[0]!.cardId,
    steps: [{ do: 'chooseOne', options: [...options, { label: 'ไม่ใช้ Kagemusha', steps: [] }] }],
    paidWithSoul: false,
    trashWhenDone: false,
    started: true,
    announce: false,
  });
  emit(ctx, { type: 'kagemushaChance', player: owner, targetId: pick });
  // เรียกจาก execStep (coresOffBatch): อยู่ใน runQueue อยู่แล้ว คิวที่แทรกไว้หน้าสุดจะทำงานต่อเอง
  if (fromExec) return true;
  s.choice = null;
  runQueue(ctx);
  return true;
}

/** คิชูด็อก: การ์ดบนสนาม (รวมเบรฟ) และในมือทั้งหมดของผู้เล่นนี้ไปใต้สุดเด็ค (Core บนการ์ดกลับรีเสิร์ฟ) */
function massToDeckBottom(ctx: Ctx, player: PlayerId): void {
  const { s } = ctx;
  const p = s.players[player];
  // Bunshin: สปิริตร่างแยกจะเข้าเด็ค = ถูกทิ้งแทน
  const clones = p.field.filter((f) => s.cards[f]!.realCardNo);
  for (const f of clones) {
    const c = s.cards[f]!;
    c.cardNo = c.realCardNo!;
    delete c.realCardNo;
    p.reserve.push(...c.cores);
    c.cores = [];
    c.state = 'refresh';
    removeFrom(p.field, f);
    p.trashCards.push(f);
  }
  const fieldIds = p.field.flatMap((f) => [f, ...s.cards[f]!.braves]);
  for (const f of p.field) {
    const c = s.cards[f]!;
    p.reserve.push(...c.cores);
    c.cores = [];
    c.braves = [];
    c.state = 'refresh';
    c.turnBp = 0;
    c.usedThisTurn = [];
  }
  const all = [...fieldIds, ...p.hand];
  if (s.battle) {
    const b = s.battle;
    const hit = all.filter((id) => id === b.attackerId || b.blockers.includes(id) || b.chosenBlockers.includes(id));
    if (hit.length > 0) b.left = [...(b.left ?? []), ...hit];
  }
  s.shownCards = (s.shownCards ?? []).filter((id) => !p.hand.includes(id));
  p.field = [];
  p.hand = [];
  p.deck.push(...all);
  emit(ctx, { type: 'cardsToDeckBottom', player, cardIds: all });
}

/** ส่งโซลคอร์ในรีเสิร์ฟของผู้เล่นลงแทรช */
/**
 * BS11 กู๊ดลัคฮิล Lv2: แอทแท็คสเต็ป สปิริตคู่แข่งที่จะกลับขึ้นมือโดยเอฟเฟกต์ของ player
 * → ถามว่าจะส่งโซลคอร์ (บนสปิริต/รีเสิร์ฟ) ลงแทรช เพื่อไปไว้บนสุด/ใต้สุดเด็คแทนไหม
 * steps = ที่ใส่ตัวเลือก (null = แค่ตรวจว่าใช้ได้) · คืน true = ใช้ได้ (ผู้เรียกไม่ต้องนำกลับขึ้นมือเอง)
 */
function bounceRedirect(ctx: Ctx, item: QueuedEffect, player: PlayerId, ids: string[], steps: Step[] | null): boolean {
  const { s, db } = ctx;
  if (s.phase !== 'attack') return false;
  const spirits = ids.filter((id) => {
    const c = s.cards[id];
    if (!c || c.owner === player || !s.players[c.owner].field.includes(id)) return false;
    const t = db.get(c.cardNo).type;
    return (t === 'spirit' || t === 'brave') && !bounceBottomSource(s, db, id);
  });
  if (spirits.length !== ids.length || spirits.length === 0) return false;
  const src = staticSources(s, db, [player], 'bounceRedirect')[0];
  if (!src) return false;
  const p = s.players[player];
  const hasSoul = p.reserve.some((c) => s.cores[c]!.isSoul) || p.field.some((id) => s.cards[id]!.cores.some((c) => s.cores[c]!.isSoul));
  if (!hasSoul) return false;
  if (steps) {
    void item;
    steps.unshift({
      do: 'chooseOne',
      options: [
        { label: 'กู๊ดลัคฮิล: ส่ง Soul Core ลงแทรช → ไปไว้บนสุดเด็คแทน', steps: [{ do: 'ownSoulToTrash' }, { do: 'returnCardsTo', cardIds: spirits, to: 'deckTop' }] },
        { label: 'กู๊ดลัคฮิล: ส่ง Soul Core ลงแทรช → ไปไว้ใต้สุดเด็คแทน', steps: [{ do: 'ownSoulToTrash' }, { do: 'returnCardsTo', cardIds: spirits, to: 'deckBottom' }] },
        { label: 'กลับขึ้นมือตามปกติ', steps: [{ do: 'returnCardsTo', cardIds: spirits, to: 'hand' }] },
      ],
    });
  }
  return true;
}

/** BS11 ชุยฮะ: โซลคอร์ของ player ถูกนำไปวางที่แทรชโดยเอฟเฟกต์ของสปิริตของ player → trigger allySoulTrashed */
function soulTrashedByEffect(ctx: Ctx, item: QueuedEffect, player: PlayerId): void {
  const { s, db } = ctx;
  const src = braveHostOf(s, item.sourceId) ?? item.sourceId;
  const card = s.cards[src];
  if (!card || card.owner !== player || item.controller !== player || !isSpiritLike(db.get(card.cardNo))) return;
  queueRightAfterCurrent(ctx, () => {
    const batch = newBatch(ctx);
    for (const id of [...s.players[player].field]) queueTriggers(ctx, id, 'allySoulTrashed', batch, { subject: src });
  });
}

function soulReserveToTrash(ctx: Ctx, player: PlayerId): void {
  const p = ctx.s.players[player];
  const soul = p.reserve.find((c) => ctx.s.cores[c]!.isSoul);
  if (!soul) return;
  removeFrom(p.reserve, soul);
  p.trashCores.push(soul);
  emit(ctx, { type: 'coresMoved', player, count: 1 });
}

/** BS09 เมาท์เท่นเมาท์: ขณะสปิริตของคู่แข่ง (ของผู้เล่นที่ไม่ใช่ me) ที่ตรงตัวกรองโจมตีอยู่ เอฟเฟกต์ของ me จบแอทแท็คสเต็ปไม่ได้ */
function endAttackStepLocked(ctx: Ctx, me: PlayerId): boolean {
  const { s, db } = ctx;
  const b = s.battle;
  if (!b) return false;
  const attackerOwner = s.cards[b.attackerId]!.owner;
  if (attackerOwner === me) return false;
  return (s.noEndAttackStep ?? []).some((x) => x.turn === s.turn && x.player === attackerOwner && matchesFilter(s, db, b.attackerId, x.filter));
}

/** BS09 โกมาฟุ: [เอฟเฟกต์ทำลายคอสต์] ของสปิริต/อัลติเมทของเราที่ตรงตัวกรอง ทำลายได้เพิ่ม +N คอสต์ */
function destroyCostBoost(ctx: Ctx, item: QueuedEffect): { amount: number; sources: StaticSource[] } {
  const { s, db } = ctx;
  const out = { amount: 0, sources: [] as StaticSource[] };
  const src = s.cards[item.sourceId];
  if (!src) return out;
  const host = braveHostOf(s, item.sourceId) ?? item.sourceId;
  if (!s.players[src.owner].field.includes(host) || !isSpiritLike(db.get(s.cards[host]!.cardNo))) return out;
  for (const id of s.players[src.owner].field) {
    if (effectsNegated(s, db, id)) continue;
    const lv = cardLevel(s, db, id);
    for (const ab of db.get(s.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'destroyCostBoost' || !ab.levels.includes(lv) || !conditionHolds(s, id, ab.if, false, false, db)) continue;
      if (!matchesFilter(s, db, host, ab.filter)) continue;
      out.amount += ab.amount;
      out.sources.push({ cardId: id, source: ab.source });
    }
  }
  return out;
}

/** จำการ์ดที่เอฟเฟกต์นี้ทำลาย (BP ก่อนออกจากสนาม) */
function recordDestroyed(ctx: Ctx, item: QueuedEffect, cardId: string): void {
  const def = ctx.db.get(ctx.s.cards[cardId]!.cardNo);
  (item.destroyedByThis ??= []).push({
    bp: currentBp(ctx.s, ctx.db, cardId),
    type: def.type,
    opponent: ctx.s.cards[cardId]!.owner !== item.controller,
    symbols: cardSymbolTotal(ctx.s, ctx.db, cardId),
  });
}

/** ตรวจเงื่อนไขในบริบทของเอฟเฟกต์ (การ์ดที่ออกจากสนามแล้วใช้สภาพ Soul Core ตอนเกิด trigger) */
function conditionHoldsFor(ctx: Ctx, item: QueuedEffect, cond: Parameters<typeof conditionHolds>[2]): boolean {
  if (cond && 'soulOnSelf' in cond && item.soulSnapshot !== undefined) return item.soulSnapshot;
  return conditionHolds(ctx.s, selfOf(ctx, item), cond, item.paidWithSoul, item.catalyzed, ctx.db);
}
