/**
 * Effect engine: คิวเอฟเฟกต์ + การเลือกของผู้เล่น
 *
 * เอฟเฟกต์ทำทีละ step จากหัวคิว ถ้า step ต้องให้ผู้เล่นเลือก engine จะตั้ง s.choice แล้วหยุด
 * action `choose` จะทำ step นั้นให้จบแล้วเดินคิวต่อ ระหว่างรอเลือก action อื่นถูกปฏิเสธ
 */
import type { Step, SubjectFilter, TriggerEvent } from '@bs/cards';
import { assertUsableCore, checkDepletion, destroy, drawCard, emit, handIncreasedByEffect, leaveField, loseLife, newCore, payCost, type Ctx } from './ctx';
import {
  burstBlocked,
  cardLevel,
  conditionHolds,
  currentBp,
  fail,
  isSpiritLike,
  matchesFilter,
  minCores,
  payableCost,
  removeCore,
  removeFrom,
} from './rules';
import { PLAYERS, opponentOf, type ChoicePick, type PendingChoice, type PlayerId, type QueuedEffect } from './types';

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
  opts: { paidWithSoul?: boolean; subject?: string } = {},
): void {
  const card = ctx.s.cards[cardId]!;
  const def = ctx.db.get(card.cardNo);
  const level = cardLevel(ctx.s, ctx.db, cardId);
  for (const ab of def.abilities) {
    if (ab.kind !== 'trigger' || !ab.levels.includes(level)) continue;
    if (Array.isArray(ab.on) ? !ab.on.includes(on) : ab.on !== on) continue;
    if (ab.subject && !(opts.subject && subjectMatches(ctx, opts.subject, ab.subject))) continue;
    if (ab.attackStepOnly && ctx.s.phase !== 'attack') continue;
    if (ab.ownTurnOnly && ctx.s.turnPlayer !== card.owner) continue;
    if (ab.oncePerTurn) {
      if (card.usedThisTurn.includes(ab.source)) continue;
      card.usedThisTurn.push(ab.source);
    }
    emit(ctx, { type: 'abilityTriggered', cardId, source: ab.source });
    enqueue(ctx, {
      controller: card.owner,
      sourceId: cardId,
      steps: [...ab.steps],
      paidWithSoul: !!opts.paidWithSoul,
      trashWhenDone: false,
      source: ab.source,
      batch,
    });
  }
}

/** สปิริตต้นเหตุ (เช่น ผู้โจมตี) ตรงเงื่อนไขของ trigger แบบ ally* หรือไม่ */
function subjectMatches(ctx: Ctx, cardId: string, f: SubjectFilter): boolean {
  const card = ctx.s.cards[cardId]!;
  if (f.family && !ctx.db.get(card.cardNo).family.includes(f.family)) return false;
  if (f.soul && !card.cores.some((id) => ctx.s.cores[id]!.isSoul)) return false;
  return true;
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
  for (const player of [opponentOf(s.turnPlayer), s.turnPlayer]) {
    const events = pending.filter((p) => p.player === player).map((p) => p.on);
    const burstId = s.players[player].burst;
    if (events.length === 0 || !burstId || burstBlocked(s, ctx.db, player)) continue;
    const ab = ctx.db.get(s.cards[burstId]!.cardNo).abilities.find((x) => x.kind === 'burst' && events.includes(x.on));
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
    });
    queued = true;
  }
  return queued;
}

export function enqueue(ctx: Ctx, item: QueuedEffect): void {
  ctx.s.queue.push(item);
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
    const item = s.queue[0]!;
    if (!item.started) {
      // เอฟเฟกต์ที่เกิดพร้อมกันของผู้ควบคุมเดียวกัน: ให้ผู้ควบคุมเลือกว่าอันไหนทำงานก่อน
      const group: QueuedEffect[] = [];
      for (const q of s.queue) {
        if (q.started || q.batch === undefined || q.batch !== item.batch || q.controller !== item.controller) break;
        group.push(q);
      }
      if (group.length >= 2) {
        s.choice = {
          kind: 'order',
          player: item.controller,
          sourceId: item.sourceId,
          prompt: 'เอฟเฟกต์เกิดพร้อมกัน: เลือกอันที่จะทำงานก่อน',
          effects: group.map((q) => ({ sourceId: q.sourceId, source: q.source ?? null })),
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
  if (item.announce !== false) emit(ctx, { type: 'effectResolving', player: item.controller, cardId: item.sourceId, source: item.source ?? null });
}

const onField = (ctx: Ctx, cardId: string) => PLAYERS.some((p) => ctx.s.players[p].field.includes(cardId));

function addTurnBp(ctx: Ctx, cardId: string, amount: number): void {
  ctx.s.cards[cardId]!.turnBp += amount;
  emit(ctx, { type: 'bpBuffed', cardId, amount });
}

function ask(ctx: Ctx, item: QueuedEffect, choice: DistributiveOmit<PendingChoice, 'player' | 'sourceId'>): void {
  ctx.s.choice = { ...choice, player: item.controller, sourceId: item.sourceId } as PendingChoice;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function execStep(ctx: Ctx, item: QueuedEffect, step: Step): void {
  const { s, db } = ctx;
  const me = item.controller;
  const holds = (cond: Parameters<typeof conditionHolds>[2]) => conditionHolds(s, item.sourceId, cond, item.paidWithSoul, item.catalyzed, db);
  const opp = opponentOf(me);
  const spiritLike = (id: string) => isSpiritLike(db.get(s.cards[id]!.cardNo));

  switch (step.do) {
    case 'draw':
      if (holds(step.if)) for (let i = 0; i < step.count; i++) drawCard(ctx, me, true);
      return;

    case 'exhaustOpponent': {
      if (step.count < 1 || !holds(step.if)) return;
      const candidates = s.players[opp].field.filter(
        (id) => spiritLike(id) && s.cards[id]!.state === 'refresh' && (!step.filter || matchesFilter(s, db, id, step.filter)),
      );
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตของคู่แข่งที่จะเสื่อมสภาพ (${step.count} ตัว)`, candidates, step });
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
      const candidates = s.players[opp].field.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดของคู่แข่งที่จะนำกลับขึ้นมือ', candidates, step });
      return;
    }

    case 'voidCore': {
      if (!holds(step.if)) return;
      if (step.to === 'reserve') {
        for (let i = 0; i < step.count; i++) s.players[me].reserve.push(newCore(ctx, me));
        emit(ctx, { type: 'voidCore', player: me, cardId: null, count: step.count });
      } else if (step.to === 'self') {
        if (onField(ctx, item.sourceId)) addVoidCores(ctx, me, item.sourceId, step.count);
      } else if (step.to === 'allAllies') {
        for (const id of s.players[me].field) {
          if (spiritLike(id) && (!step.filter || matchesFilter(s, db, id, step.filter))) addVoidCores(ctx, me, id, step.count);
        }
      } else {
        const candidates = s.players[me].field.filter((id) => id !== item.sourceId && spiritLike(id));
        if (candidates.length === 0) return;
        ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริตเราที่จะวางคอร์วอยด์ ${step.count} เม็ด`, candidates, step });
      }
      return;
    }

    case 'soulToReserve': {
      const card = s.cards[item.sourceId]!;
      const soul = card.cores.find((id) => s.cores[id]!.isSoul);
      if (!soul || !onField(ctx, item.sourceId)) return;
      card.cores.splice(card.cores.indexOf(soul), 1);
      s.players[me].reserve.push(soul);
      emit(ctx, { type: 'soulToReserve', cardId: item.sourceId });
      return;
    }

    case 'revealSummon': {
      const revealed = s.players[me].deck.slice(0, step.count);
      if (revealed.length === 0) return;
      emit(ctx, { type: 'cardsRevealed', player: me, cardIds: revealed });
      const candidates = revealed.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0 || step.max === 0) {
        item.steps.unshift({ do: 'toDeckBottom', cardIds: revealed });
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
      if (p.hand.length === 0) return;
      for (const id of [...p.hand]) {
        removeFrom(p.hand, id);
        p.trashCards.push(id);
        emit(ctx, { type: 'discarded', player: me, cardId: id });
      }
      const n = s.players[opp].hand.length;
      for (let i = 0; i < n; i++) drawCard(ctx, me, true);
      return;
    }

    case 'refreshChosenAlly': {
      const candidates = s.players[me].field.filter((id) => s.cards[id]!.state === 'exhausted' && matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกสปิริตเราที่จะฟื้นสภาพ', candidates, step });
      return;
    }

    case 'opponentLifeToReserve':
      loseLife(ctx, opp, step.count, me);
      return;

    case 'selfCoresToTrash': {
      const card = s.cards[item.sourceId]!;
      if (!onField(ctx, item.sourceId) || card.cores.length < step.count) return;
      const sorted = [...card.cores].sort((x, y) => Number(s.cores[x]!.isSoul) - Number(s.cores[y]!.isSoul));
      const take = sorted.slice(0, step.count);
      for (const id of take) card.cores.splice(card.cores.indexOf(id), 1);
      s.players[me].trashCores.push(...take);
      emit(ctx, { type: 'coresToTrash', cardId: item.sourceId, count: take.length });
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
      if (!ab || ab.kind !== 'burst' || !ab.soul || !def.colors.includes(step.color)) return;
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
      if (onField(ctx, item.sourceId) && holds(step.if)) addTurnBp(ctx, item.sourceId, step.amount);
      return;

    case 'buffChosen': {
      const candidates = PLAYERS.flatMap((p) => s.players[p].field).filter((id) => isSpiritLike(db.get(s.cards[id]!.cardNo)));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: `เลือกสปิริต 1 ตัว ได้ BP+${step.amount} ในเทิร์นนี้`, candidates, step });
      return;
    }

    case 'mustBlock':
      if (s.battle?.attackerId === item.sourceId && holds(step.if)) {
        s.battle.mustBlock = true;
        emit(ctx, { type: 'mustBlock', cardId: item.sourceId });
        blockKeywordActivated(ctx, me);
      }
      return;

    case 'destroyAllOpponent':
      for (const id of [...s.players[opponentOf(me)].field]) {
        if (matchesFilter(s, db, id, step.filter)) destroy(ctx, id, me);
      }
      return;

    case 'revealPickRestTrash': {
      const revealed = s.players[me].deck.slice(0, step.count);
      if (revealed.length === 0) return;
      emit(ctx, { type: 'cardsRevealed', player: me, cardIds: revealed });
      const candidates = revealed.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) {
        mill(ctx, me, revealed);
        return;
      }
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ด 1 ใบขึ้นมือ ที่เหลือลง Trash', candidates, revealed, step });
      return;
    }

    case 'returnFromTrash': {
      const candidates = s.players[me].trashCards.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดในแทรช 1 ใบกลับขึ้นมือ', candidates, step });
      return;
    }

    case 'endAttackStepAfterBattle':
      if (s.battle) s.battle.endAttackStepAfter = true;
      return;

    case 'lifeOnBlockerDestroyed':
      if (s.battle?.attackerId === item.sourceId && holds(step.if)) {
        if (step.onlyConsecutiveBlade) s.battle.lifeOnBlockerDestroyedByBlade += step.amount;
        else s.battle.lifeOnBlockerDestroyed += step.amount;
      }
      return;

    case 'soulToTrash': {
      const card = s.cards[item.sourceId]!;
      const soul = card.cores.find((id) => s.cores[id]!.isSoul);
      if (!soul || !onField(ctx, item.sourceId)) return;
      card.cores.splice(card.cores.indexOf(soul), 1);
      s.players[me].trashCores.push(soul);
      emit(ctx, { type: 'soulToTrash', cardId: item.sourceId });
      return;
    }

    case 'consecutiveBlade':
      if (s.battle?.attackerId === item.sourceId) {
        s.battle.consecutiveBlade = true;
        s.battle.maxBlockers = 2;
        s.battle.mustBlock = true;
        emit(ctx, { type: 'consecutiveBlade', cardId: item.sourceId });
        blockKeywordActivated(ctx, me);
      }
      return;

    case 'chooseBlockers': {
      const battle = s.battle;
      if (!battle || battle.step !== 'flashBeforeBlock' || s.turnPlayer !== me) return;
      if (battle.chosenBlockers.length >= battle.maxBlockers) return;
      const candidates = s.players[opponentOf(me)].field.filter(
        (id) => isSpiritLike(db.get(s.cards[id]!.cardNo)) && !battle.chosenBlockers.includes(id),
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
      const hand = s.players[me].hand;
      if (step.count < 1 || hand.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดบนมือ 1 ใบที่จะทิ้ง', candidates: [...hand], step });
      return;
    }

    case 'openBurst': {
      const p = s.players[me];
      if (p.burst !== item.sourceId) return;
      p.burst = null;
      item.trashWhenDone = true;
      emit(ctx, { type: 'burstActivated', player: me, cardId: item.sourceId });
      emit(ctx, { type: 'effectResolving', player: me, cardId: item.sourceId, source: null });
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
      if (onField(ctx, item.sourceId)) {
        s.cards[item.sourceId]!.state = 'refresh';
        emit(ctx, { type: 'cardRefreshed', cardId: item.sourceId });
      }
      return;

    case 'destroyChosenOpponent': {
      const candidates = s.players[opponentOf(me)].field.filter((id) => matchesFilter(s, db, id, step.filter));
      if (candidates.length === 0) return;
      ask(ctx, item, { kind: 'card', prompt: 'เลือกการ์ดของคู่แข่ง 1 ใบที่จะทำลาย', candidates, step });
      return;
    }

    case 'chooseOne':
      if (!holds(step.if)) return;
      ask(ctx, item, { kind: 'option', prompt: 'เลือก 1 อย่าง', options: step.options.map((o) => o.label), step });
      return;
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
function detach(ctx: Ctx, player: PlayerId, cardId: string): 'deck' | 'hand' | 'burst' | 'other' {
  const p = ctx.s.players[player];
  if (p.deck.includes(cardId)) {
    removeFrom(p.deck, cardId);
    return 'deck';
  }
  if (p.hand.includes(cardId)) {
    removeFrom(p.hand, cardId);
    return 'hand';
  }
  if (p.trashCards.includes(cardId)) removeFrom(p.trashCards, cardId);
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
  s.players[me].field.push(step.cardId);
  card.cores = [...cores];
  card.state = step.state ?? 'refresh';
  if (step.noSummon) {
    emit(ctx, { type: 'braveSeparated', cardId: step.cardId, stays: true });
    return;
  }
  emit(ctx, { type: 'summoned', player: me, cardId: step.cardId, paid: 0, from: from === 'other' && item.sourceId === step.cardId ? 'burst' : from });
  // trigger ของการ์ดที่ลงสนามทำงานหลังเอฟเฟกต์นี้จบ
  const level = cardLevel(s, ctx.db, step.cardId);
  if (level > 0) queueTriggers(ctx, step.cardId, 'summon');
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
  for (const id of summoned) if (cardLevel(s, db, id) > 0) queueTriggers(ctx, id, 'summon', batch);
  const rest = choice.revealed.filter((id) => !usedCards.has(id));
  if (rest.length > 0) s.queue[0]!.steps.unshift({ do: 'toDeckBottom', cardIds: rest });
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

  if (choice.kind === 'payCost') {
    const item = s.queue[0]!;
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
    s.queue[0]!.steps.unshift(...option.steps);
    emit(ctx, { type: 'optionChosen', player, option: option.label });
  } else {
    if (pick === null && choice.optional) {
      // ไม่อัญเชิญเพิ่ม: ที่เหลือไว้ใต้สุดเด็ค
      if (step.do === 'braveOrSpirit') s.queue[0]!.steps.unshift({ do: 'placeCores', cardId: step.cardId, asSpirit: true });
      s.choice = null;
      runQueue(ctx);
      return;
    }
    if (typeof pick !== 'string' || !choice.candidates.includes(pick)) fail('INVALID_PICK', 'เลือกการ์ดนี้ไม่ได้');
    const p = s.players[player];
    switch (step.do) {
      case 'chooseBlockers':
        s.battle!.chosenBlockers.push(pick);
        emit(ctx, { type: 'blockerChosen', cardId: pick });
        s.queue[0]!.steps.unshift({ do: 'chooseBlockers' }); // เลือกตัวถัดไปถ้ายังเลือกได้
        break;
      case 'buffChosen':
        addTurnBp(ctx, pick, step.amount);
        break;
      case 'revealPickRestTrash':
        removeFrom(p.deck, pick);
        p.hand.push(pick);
        emit(ctx, { type: 'cardToHand', player, cardId: pick, from: 'deck' });
        handIncreasedByEffect(ctx, player);
        mill(ctx, player, (choice.revealed ?? []).filter((id) => id !== pick));
        break;
      case 'destroyChosenOpponent':
        destroy(ctx, pick, player);
        break;
      case 'exhaustOpponent':
        s.cards[pick]!.state = 'exhausted';
        emit(ctx, { type: 'exhausted', cardId: pick });
        if (step.count > 1) s.queue[0]!.steps.unshift({ ...step, count: step.count - 1, if: undefined });
        break;
      case 'exhaustOpponentTotalBp': {
        const bp = currentBp(s, ctx.db, pick);
        s.cards[pick]!.state = 'exhausted';
        emit(ctx, { type: 'exhausted', cardId: pick });
        s.queue[0]!.steps.unshift({ do: 'exhaustOpponentTotalBp', maxTotal: step.maxTotal - bp });
        break;
      }
      case 'bounceOpponent':
        leaveField(ctx, pick, 'hand');
        emit(ctx, { type: 'bounced', player: s.cards[pick]!.owner, cardId: pick });
        break;
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
        s.queue[0]!.steps.unshift({ do: 'toDeckBottom', cardIds: step.cardIds.filter((id) => id !== pick) });
        break;
      case 'refreshChosenAlly':
        s.cards[pick]!.state = 'refresh';
        emit(ctx, { type: 'cardRefreshed', cardId: pick });
        break;
      case 'setBurstFromHand': {
        const replaced = p.burst;
        if (replaced) p.trashCards.push(replaced);
        removeFrom(p.hand, pick);
        p.burst = pick;
        emit(ctx, { type: 'burstSet', player, replacedCardId: replaced });
        break;
      }
      case 'discard':
        removeFrom(p.hand, pick);
        p.trashCards.push(pick);
        emit(ctx, { type: 'discarded', player, cardId: pick });
        if (step.count > 1) s.queue[0]!.steps.unshift({ do: 'discard', count: step.count - 1 });
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
