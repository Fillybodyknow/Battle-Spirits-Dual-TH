import type { CardDatabase, CardDef } from '@bs/cards';
import { fail, isSpiritLike, levelOf, locateCore, minCores, payableCost, removeCore, removeFrom } from './rules';
import { PLAYERS, opponentOf, type EndReason, type GameEvent, type GameState, type Phase, type PlayerId } from './types';

/** สถานะระหว่างประมวลผล action หนึ่งครั้ง (s เป็นสำเนาที่แก้ได้) */
export interface Ctx {
  s: GameState;
  db: CardDatabase;
  events: GameEvent[];
}

export function emit(ctx: Ctx, event: GameEvent): void {
  ctx.events.push(event);
  ctx.s.log.push(event);
}

export function newCore(ctx: Ctx, owner: PlayerId, isSoul = false): string {
  const id = `core-${ctx.s.nextCoreId++}`;
  ctx.s.cores[id] = { id, owner, isSoul };
  return id;
}

/** byEffect = จั่วด้วยเอฟเฟกต์ (มือเพิ่มขึ้นโดยเอฟเฟกต์ → เงื่อนไข Burst ของคู่แข่ง) */
export function drawCard(ctx: Ctx, player: PlayerId, byEffect = false): void {
  const p = ctx.s.players[player];
  const id = p.deck.shift();
  if (!id) return;
  p.hand.push(id);
  emit(ctx, { type: 'cardDrawn', player, cardId: id });
  if (byEffect) handIncreasedByEffect(ctx, player);
}

/** มือของผู้เล่นเพิ่มขึ้นโดยเอฟเฟกต์ของตัวเอง → Burst "หลังจากมือของคู่แข่งเพิ่มขึ้น" ของอีกฝ่าย */
export function handIncreasedByEffect(ctx: Ctx, player: PlayerId): void {
  pendBurst(ctx, opponentOf(player), 'afterOpponentHandIncreased');
}

/** จดเงื่อนไข Burst ไว้ ถามเจ้าของเมื่อเอฟเฟกต์ที่กำลังทำงานจบ (ดู flushBursts) */
export function pendBurst(ctx: Ctx, player: PlayerId, on: GameState['pendingBursts'][number]['on']): void {
  const list = ctx.s.pendingBursts;
  if (!list.some((b) => b.player === player && b.on === on)) list.push({ player, on });
}

export function setPhase(ctx: Ctx, phase: Phase): void {
  ctx.s.phase = phase;
  emit(ctx, { type: 'phaseChanged', phase });
}

export function endGame(ctx: Ctx, winner: PlayerId, reason: EndReason): void {
  ctx.s.winner = winner;
  ctx.s.endReason = reason;
  ctx.s.battle = null;
  ctx.s.queue = [];
  ctx.s.choice = null;
  emit(ctx, { type: 'gameOver', winner, reason });
}

/**
 * การ์ดออกจากสนามไป Trash หรือมือ: Core บนการ์ดกลับ Reserve ของเจ้าของ
 * Brave ที่ร่วมร่างอยู่: เจ้าของเลือกให้อยู่บนสนามต่อหรือลง Trash (เข้าคิวเอฟเฟกต์)
 */
export function leaveField(ctx: Ctx, cardId: string, to: 'trash' | 'hand'): void {
  const card = ctx.s.cards[cardId]!;
  const p = ctx.s.players[card.owner];
  const hostState = card.state;
  removeFrom(p.field, cardId);
  p.reserve.push(...card.cores);
  card.cores = [];
  card.state = 'refresh';
  card.turnBp = 0;
  card.usedThisTurn = [];
  (to === 'trash' ? p.trashCards : p.hand).push(cardId);
  for (const braveId of card.braves) {
    ctx.s.queue.push({
      controller: card.owner,
      sourceId: braveId,
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'ให้เบรฟอยู่บนสนามต่อ (วาง Core จากรีเสิร์ฟ)', steps: [{ do: 'placeCores', cardId: braveId, state: hostState, noSummon: true }] },
            { label: 'ส่งเบรฟลง Trash', steps: [{ do: 'braveTrash', cardId: braveId }] },
          ],
        },
      ],
      paidWithSoul: false,
      trashWhenDone: false,
      announce: false,
    });
  }
  card.braves = [];
}

export function sendToTrash(ctx: Ctx, cardId: string): void {
  leaveField(ctx, cardId, 'trash');
}

/** by = ผู้เล่นที่ทำลาย (การต่อสู้ / เอฟเฟกต์) ใช้ตรวจ Burst "ถูกทำลายโดยคู่แข่ง" */
export function destroy(ctx: Ctx, cardId: string, by?: PlayerId): void {
  const owner = ctx.s.cards[cardId]!.owner;
  sendToTrash(ctx, cardId);
  emit(ctx, { type: 'destroyed', cardId });
  if (by && by !== owner) pendBurst(ctx, owner, 'afterAllyDestroyedByOpponent');
}

/** ไลฟ์ไปรีเสิร์ฟของเจ้าของ; คืน true ถ้าไลฟ์หมดแล้วจบเกม */
export function loseLife(ctx: Ctx, player: PlayerId, amount: number, winner: PlayerId): boolean {
  const p = ctx.s.players[player];
  const n = Math.min(amount, p.life.length);
  p.reserve.push(...p.life.splice(p.life.length - n, n));
  emit(ctx, { type: 'lifeLost', player, amount: n });
  if (n > 0) pendBurst(ctx, player, 'afterLifeLost');
  if (p.life.length > 0) return false;
  endGame(ctx, winner, 'lifeZero');
  return true;
}

/** สูญสลาย: Spirit/Ultimate/Brave ที่ Core ต่ำกว่าเลเวลต่ำสุด; คืน id ที่สูญสลาย */
export function checkDepletion(ctx: Ctx): string[] {
  const depleted: string[] = [];
  for (const player of PLAYERS) {
    for (const cardId of [...ctx.s.players[player].field]) {
      const card = ctx.s.cards[cardId]!;
      const def = ctx.db.get(card.cardNo);
      if (isSpiritLike(def) && levelOf(def, card.cores.length) === 0) {
        sendToTrash(ctx, cardId);
        emit(ctx, { type: 'depleted', cardId });
        depleted.push(cardId);
      }
    }
  }
  return depleted;
}

/** Core ที่ใช้จ่าย/วางได้ ต้องเป็นของเรา และอยู่ใน Reserve หรือบนการ์ดในสนามเรา (ห้ามใช้จาก Trash) */
export function assertUsableCore(ctx: Ctx, player: PlayerId, coreId: string): void {
  const core = ctx.s.cores[coreId];
  if (!core || core.owner !== player) fail('CORE_NOT_OWNED', `Core ${coreId} ไม่ใช่ของคุณ`);
  const loc = locateCore(ctx.s, coreId);
  if (!loc || loc.player !== player || (loc.area !== 'reserve' && loc.area !== 'card')) {
    fail('CORE_NOT_USABLE', `Core ${coreId} ต้องอยู่ใน Reserve หรือบนการ์ดในสนาม`);
  }
}

/**
 * จ่ายคอสต์และดึง Core ที่จะวางบนการ์ด (หมวด 3 ข้อ 4-6)
 * คืนค่า id ของ Core ที่ต้องวางบนการ์ดใหม่
 */
export function payCost(
  ctx: Ctx,
  player: PlayerId,
  def: CardDef,
  payment: string[],
  placement: string[],
  opts: { noPlacement?: boolean; reserveOnly?: boolean } = {},
): { paid: number; placed: string[] } {
  const cost = payableCost(ctx.s, ctx.db, player, def);
  if (payment.length !== cost) {
    fail('WRONG_PAYMENT', `ต้องจ่าย Core ${cost} ดวง แต่ส่งมา ${payment.length} ดวง`);
  }
  const all = [...payment, ...placement];
  if (new Set(all).size !== all.length) fail('DUPLICATE_CORE', 'ใช้ Core ดวงเดียวกันซ้ำ');
  for (const id of all) assertUsableCore(ctx, player, id);
  if (opts.reserveOnly && all.some((id) => !ctx.s.players[player].reserve.includes(id))) {
    fail('RESERVE_ONLY', '[Quick] ใช้ได้เฉพาะ Core จากรีเสิร์ฟ');
  }
  if (opts.noPlacement) {
    if (placement.length > 0) fail('NO_PLACEMENT', 'Brave ที่ร่วมร่างไม่ต้องวาง Core');
  } else if (placement.length < minCores(def)) {
    fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${minCores(def)} ดวง`);
  }

  const p = ctx.s.players[player];
  for (const id of payment) {
    removeCore(ctx.s, id);
    p.trashCores.push(id);
  }
  for (const id of placement) removeCore(ctx.s, id);
  return { paid: cost, placed: placement };
}
