import type { CardDatabase, CardDef } from '@bs/cards';
import { cardLevel, currentBp, destroyBurstBanSource, fail, noLoseSource, noRefreshSource, fieldCost, isSpiritLike, levelOf, locateCore, minCores, levelBoostSources, lv1CostZeroSource, payableCost, removeCore, removeFrom, summonLevelCostBoost, type StaticSource } from './rules';
import { PLAYERS, opponentOf, type EndReason, type GameEvent, type GameState, type Phase, type PlayerId } from './types';
import { newBatch, queueLifeLostTriggers, queueTriggers } from './effects';
import { activeSeat, allZones, ownerZones, seatOfCard, zonesOf } from './seats';

/** สถานะระหว่างประมวลผล action หนึ่งครั้ง (s เป็นสำเนาที่แก้ได้) */
export interface Ctx {
  s: GameState;
  db: CardDatabase;
  events: GameEvent[];
  /** state ก่อน action นี้ (อ่านอย่างเดียว): ใช้เทียบว่าความสามารถถาวรเพิ่งมีผลใน action นี้หรือไม่ */
  start?: GameState;
  /** loseLife ครั้งล่าสุด: ไลฟ์ลดจริงเท่าไร (หลังเพดานความเสียหาย) · queueLifeLostTriggers ใช้ค่านี้ */
  lastLifeLost?: { player: PlayerId; amount: number };
}

/** ไลฟ์เสียได้อีกเท่าไรในเทิร์นนี้ (กำแพงผลึกขาว: รวมทั้งเทิร์นไม่เกิน 1) · ไม่มีเพดาน = Infinity */
export function lifeDamageLeft(s: GameState, player: PlayerId): number {
  const cap = (s.lifeCapOne ?? []).find((l) => l.player === player && l.turn === s.turn);
  return cap ? Math.max(0, 1 - (cap.used ?? 0)) : Infinity;
}

/**
 * ความสามารถถาวรของการ์ดบนสนามลงมือ: ให้หน้าเว็บเรืองแสงการ์ดต้นเหตุ (ไม่เปลี่ยน state)
 * บรรทัดเอฟเฟกต์เดียวกันแจ้งครั้งเดียวต่อ action (เช่น Shield กันหลายเอฟเฟกต์ติดกัน)
 */
export function emitStatic(ctx: Ctx, src: StaticSource | StaticSource[] | 'battle' | null | undefined): void {
  if (!src || src === 'battle') return;
  for (const { cardId, source } of Array.isArray(src) ? src : [src]) {
    const card = ctx.s.cards[cardId];
    if (!card) continue;
    if (ctx.events.some((e) => e.type === 'staticApplied' && e.cardId === cardId && e.source === source)) continue;
    emit(ctx, { type: 'staticApplied', player: card.owner, cardId, source });
  }
}

export function emit(ctx: Ctx, event: GameEvent): void {
  ctx.events.push(event);
  ctx.s.log.push(event);
  // การ์ดที่วางแสดงนอกมือ ถูกนำไปใช้แล้ว (ออกจากมือ) = เลิกแสดง
  if (ctx.s.shownCards?.length && event.type !== 'cardShown' && 'cardId' in event) {
    const id = (event as { cardId: string }).cardId;
    const c = ctx.s.cards[id];
    if (c && ctx.s.shownCards.includes(id) && !ownerZones(ctx.s, id).hand.includes(id)) ctx.s.shownCards = ctx.s.shownCards.filter((x) => x !== id);
  }
  // จดการอัญเชิญใบแรกสุดของเทิร์น (นอร์ธซีโรด)
  if (event.type === 'summoned') {
    const s = ctx.s;
    if (s.firstSummon?.turn !== s.turn) s.firstSummon = { turn: s.turn };
    if (!s.firstSummon[event.player]) s.firstSummon[event.player] = event.cardId;
  }
}

/** seat ไม่ระบุ = ที่นั่งที่ทำงานอยู่ของฝั่งนั้น (2VS2) */
export function newCore(ctx: Ctx, owner: PlayerId, isSoul = false, seat = activeSeat(ctx.s, owner)): string {
  const id = `core-${ctx.s.nextCoreId++}`;
  ctx.s.cores[id] = { id, owner, isSoul, ...(seat ? { seat } : {}) };
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
  // BS14 "เมื่อเราจั่วการ์ด" (สมรภูมิโบราณหมื่นหอก)
  {
    const own = ctx.s.players[player].field;
    if (own.length > 0) {
      const batch = newBatch(ctx);
      for (const fid of [...own]) queueTriggers(ctx, fid, 'selfDrew', batch);
    }
  }
  // "เมื่อคู่แข่งจั่วการ์ด"
  const opp = ctx.s.players[opponentOf(player)];
  if (opp.field.length > 0) {
    const batch = newBatch(ctx);
    for (const fid of [...opp.field]) queueTriggers(ctx, fid, 'oppDrew', batch);
  }
}

/** มือของผู้เล่นเพิ่มขึ้นโดยเอฟเฟกต์ของตัวเอง → Burst "หลังจากมือของคู่แข่งเพิ่มขึ้น" ของอีกฝ่าย */
export function handIncreasedByEffect(ctx: Ctx, player: PlayerId): void {
  pendBurst(ctx, opponentOf(player), 'afterOpponentHandIncreased');
}

/** จดเงื่อนไข Burst ไว้ ถามเจ้าของเมื่อเอฟเฟกต์ที่กำลังทำงานจบ (ดู flushBursts) */
export function pendBurst(ctx: Ctx, player: PlayerId, on: GameState['pendingBursts'][number]['on'], subjectId?: string): void {
  const list = ctx.s.pendingBursts;
  if (!list.some((b) => b.player === player && b.on === on)) list.push({ player, on, ...(subjectId ? { subjectId } : {}) });
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
export function leaveField(ctx: Ctx, cardId: string, to: 'trash' | 'hand', opts: { cloneToHand?: boolean } = {}): 'trash' | 'hand' {
  const card = ctx.s.cards[cardId]!;
  const field = ctx.s.players[card.owner].field;
  // 2VS2: การ์ดและคอร์บนการ์ดกลับไปโซนของเจ้าของการ์ด (กติกา 15 ข้อ 2)
  const p = zonesOf(ctx.s, card.owner, seatOfCard(card));
  // Bunshin: สปิริตร่างแยกออกจากสนาม = กลับเป็นการ์ดจริง · จะกลับขึ้นมือ/เข้าเด็ค = ถูกทิ้งแทน (กติกา 14 Bunshin ข้อ 2)
  if (card.realCardNo) {
    card.cardNo = card.realCardNo;
    delete card.realCardNo;
    if (!opts.cloneToHand) to = 'trash';
  }
  const hostState = card.state;
  removeFrom(field, cardId);
  // ออกจากสนามระหว่างการต่อสู้: ถ้าถูกอัญเชิญกลับมา (เช่น ชิคิงามิออฟเดอะเดด) ถือเป็นการ์ดใหม่ ไม่ได้โจมตี/ป้องกันอยู่
  const battle = ctx.s.battle;
  if (battle && (battle.attackerId === cardId || battle.blockers.includes(cardId) || battle.chosenBlockers.includes(cardId))) {
    battle.left = [...(battle.left ?? []), cardId];
  }
  p.reserve.push(...card.cores);
  if (card.seat) for (const c of card.cores) ctx.s.cores[c]!.seat = card.seat;
  card.cores = [];
  card.state = 'refresh';
  card.turnBp = 0;
  delete card.battleBp;
  delete card.battleSymbols;
  delete card.battleStack;
  // BS17 ออร์แกนปีกทองคำ: การ์ดใต้เน็กซัสถูกทิ้งเมื่อเน็กซัสออกจากฟิลด์
  if (card.under?.length) {
    p.trashCards.push(...card.under);
    delete card.under;
  }
  card.usedThisTurn = [];
  (to === 'trash' ? p.trashCards : p.hand).push(cardId);
  // กติกา 04 ข้อ 2: ร่างต้นออกจากสนาม (ถูกทำลาย / สูญสลาย / กลับขึ้นมือ / กลับใต้กอง) → เลือกเรื่องเบรฟทันที
  // แทรกต่อจากเอฟเฟกต์ที่กำลังทำงาน ก่อนเอฟเฟกต์อื่นที่รอคิวอยู่ (เดิมต่อท้ายคิว = เอฟเฟกต์ที่รออยู่ทำงานก่อน ระหว่างนั้นเบรฟไม่อยู่บนสนาม)
  let at = ctx.s.queue[0]?.started ? 1 : 0;
  for (const braveId of card.braves) {
    ctx.s.queue.splice(at++, 0, {
      controller: card.owner,
      sourceId: braveId,
      steps: [{ do: 'braveFate', cardId: braveId, state: hostState, continuesAttackOf: cardId }],
      paidWithSoul: false,
      trashWhenDone: false,
      announce: false,
      // ทำทันที ไม่รวมกลุ่มให้ถามลำดับกับเอฟเฟกต์อื่น
      started: true,
    });
  }
  card.braves = [];
  return to;
}

export function sendToTrash(ctx: Ctx, cardId: string): void {
  const battle = ctx.s.battle;
  const gone = !!battle?.lifeOnBattlerGone && battle.blockers.includes(cardId) && ctx.s.players[ctx.s.cards[cardId]!.owner].field.includes(cardId);
  // BS10 บลานโบอา: ตัวที่ต่อสู้กับสปิริตนี้ถูกทำลาย/สูญสลาย → สปิริตนี้ฟื้นสภาพ
  const fighting = battle && ctx.s.players[ctx.s.cards[cardId]!.owner].field.includes(cardId) && (battle.attackerId === cardId || battle.blockers.includes(cardId));
  const refresh = fighting
    ? (battle!.refreshOnGone ?? []).filter((id) => id !== cardId && ctx.s.cards[id] && ctx.s.cards[id]!.owner !== ctx.s.cards[cardId]!.owner && ctx.s.players[ctx.s.cards[id]!.owner].field.includes(id))
    : [];
  leaveField(ctx, cardId, 'trash');
  for (const id of refresh) {
    if (ctx.s.cards[id]!.state !== 'exhausted' || noRefreshSource(ctx.s, ctx.db, id, true)) continue;
    ctx.s.cards[id]!.state = 'refresh';
    emit(ctx, { type: 'cardRefreshed', cardId: id });
  }
  // "เมื่อสปิริตของคู่แข่งที่ต่อสู้อยู่ถูกทำลาย/สูญสลาย" (ดุ๊คคิงเทารอส)
  if (gone && battle?.lifeOnBattlerGone && !ctx.s.winner) {
    const owner = ctx.s.cards[cardId]!.owner;
    const { amount, to } = battle.lifeOnBattlerGone;
    if (!loseLife(ctx, owner, amount, opponentOf(owner), to)) queueLifeLostTriggers(ctx, owner, amount);
  }
}

/** by = ผู้เล่นที่ทำลาย (การต่อสู้ / เอฟเฟกต์) ใช้ตรวจ Burst "ถูกทำลายโดยคู่แข่ง" */
export function destroy(ctx: Ctx, cardId: string, by?: PlayerId, bySource?: string): void {
  const owner = ctx.s.cards[cardId]!.owner;
  const cost = fieldCost(ctx.s, ctx.db, cardId);
  // เบิร์ส "หลังจากสปิริต(/อัลติเมท)ของเราถูกทำลายโดยคู่แข่ง": เฉพาะสปิริต/อัลติเมท (รวมเบรฟที่อยู่เป็นสปิริตเอง) ไม่ใช่เน็กซัส
  // ตรวจก่อนลงแทรช (ร่างแยก Bunshin ถูกคืนเป็นการ์ดจริงตอนออกจากสนาม)
  const spirit = isSpiritLike(ctx.db.get(ctx.s.cards[cardId]!.cardNo));
  // BS14 คิงรู: สปิริต BP ไม่เกิน N ถูกทำลาย = ห้ามเบิร์สนั้น · เฟลมบรีซ: ในเอฟเฟกต์นี้ห้ามเบิร์สนั้น (เอฟเฟกต์ที่กำลังทำงาน = หัวคิว)
  const bpBan = spirit && by && by !== owner ? destroyBurstBanSource(ctx.s, ctx.db, currentBp(ctx.s, ctx.db, cardId)) : null;
  const effectBan = !!ctx.s.queue[0]?.started && !!ctx.s.queue[0]?.noDestroyBurst && ctx.s.queue[0]?.controller === by;
  // BS16 ไก-อสุรา: ในการต่อสู้นี้ คอร์บนสปิริตคู่แข่งที่ถูกทำลายไปวอยด์ (โซลคอร์ไม่ไปวอยด์: กติกา 07 ข้อ 4)
  if (by && by !== owner && ctx.s.battle?.destroyedCoresVoid === by) {
    const card = ctx.s.cards[cardId]!;
    const gone = card.cores.filter((c) => !ctx.s.cores[c]!.isSoul);
    card.cores = card.cores.filter((c) => ctx.s.cores[c]!.isSoul);
    for (const c of gone) delete ctx.s.cores[c];
    if (gone.length > 0) emit(ctx, { type: 'coresRemoved', cardId, count: gone.length, to: 'void' });
  }
  sendToTrash(ctx, cardId);
  // BS12 มิสึรุกิ: ถูกทำลายโดยเอฟเฟกต์ของเบิร์สที่นับอยู่
  const bk = ctx.s.burstKills;
  if (bk && spirit && bySource === bk.burstId && owner !== bk.controller) bk.count++;
  emit(ctx, { type: 'destroyed', cardId, cost, ...(bySource ? { bySource } : {}) });
  if (bpBan) emitStatic(ctx, bpBan);
  if (by && by !== owner && spirit && !bpBan && !effectBan) pendBurst(ctx, owner, 'afterAllyDestroyedByOpponent');
}

/** ไลฟ์ไปรีเสิร์ฟของเจ้าของ; คืน true ถ้าไลฟ์หมดแล้วจบเกม */
export function loseLife(ctx: Ctx, player: PlayerId, amount: number, winner: PlayerId, to: 'reserve' | 'trash' | 'void' = 'reserve', attack = false, opts: { selfOnly?: boolean } = {}): boolean {
  // กำแพงผลึกขาว: ทั้งเทิร์นไลฟ์เสียรวมไม่เกิน 1 (ทุกความเสียหาย ทั้งโจมตีและเอฟเฟกต์ · ไม่นับการจ่ายไลฟ์ของเราเอง)
  const cap = opts.selfOnly ? undefined : (ctx.s.lifeCapOne ?? []).find((l) => l.player === player && l.turn === ctx.s.turn);
  if (cap) amount = Math.min(amount, Math.max(0, 1 - (cap.used ?? 0)));
  if (amount <= 0) {
    ctx.lastLifeLost = { player, amount: 0 };
    return false;
  }
  const lostNow = (n: number) => {
    if (cap) cap.used = (cap.used ?? 0) + n;
    ctx.lastLifeLost = { player, amount: n };
  };
  // 2VS2: ไลฟ์ของคู่แข่งลดพร้อมกันทั้งสองคน · ทีมแพ้เมื่อไลฟ์เป็น 0 ทั้งคู่ (กติกา 15 ข้อ 4, 7) · selfOnly = เฉพาะที่นั่งที่ทำอยู่ (จ่ายไลฟ์ของเราเอง)
  if (ctx.s.players[player].partner) {
    const zones = opts.selfOnly ? [ctx.s.players[player]] : allZones(ctx.s, player);
    let lost = 0;
    for (const z of zones) {
      const k = Math.min(amount, z.life.length);
      const gone = z.life.splice(z.life.length - k, k);
      if (to === 'void') for (const c of gone) delete ctx.s.cores[c];
      else (to === 'trash' ? z.trashCores : z.reserve).push(...gone);
      lost = Math.max(lost, k);
    }
    lostNow(lost);
    emit(ctx, { type: 'lifeLost', player, amount: lost, ...(attack ? { attack: true } : {}) });
    if (lost > 0 && !(ctx.s.lifeDamagedThisTurn ?? []).includes(player)) ctx.s.lifeDamagedThisTurn = [...(ctx.s.lifeDamagedThisTurn ?? []), player];
    if (lost > 0) pendBurst(ctx, player, 'afterLifeLost');
    if (allZones(ctx.s, player).some((z) => z.life.length > 0)) return false;
    return lifeZeroLose(ctx, player, winner);
  }
  const p = ctx.s.players[player];
  const n = Math.min(amount, p.life.length);
  const gone = p.life.splice(p.life.length - n, n);
  // BS14 ควีน เมดูค: คอร์ไลฟ์ไปวอยด์
  if (to === 'void') for (const c of gone) delete ctx.s.cores[c];
  else (to === 'trash' ? p.trashCores : p.reserve).push(...gone);
  lostNow(n);
  emit(ctx, { type: 'lifeLost', player, amount: n, ...(attack ? { attack: true } : {}) });
  if (n > 0 && !(ctx.s.lifeDamagedThisTurn ?? []).includes(player)) ctx.s.lifeDamagedThisTurn = [...(ctx.s.lifeDamagedThisTurn ?? []), player];
  if (n > 0) pendBurst(ctx, player, 'afterLifeLost');
  if (p.life.length > 0) return false;
  return lifeZeroLose(ctx, player, winner);
}

/** ไลฟ์ (ทั้งทีม) เป็น 0: แพ้ เว้นแต่มี "ไลฟ์ 0 แล้วไม่แพ้" (BS13 เอล-ราฟิล) · คืน true ถ้าจบเกม */
export function lifeZeroLose(ctx: Ctx, player: PlayerId, winner: PlayerId): boolean {
  const keep = noLoseSource(ctx.s, ctx.db, player);
  if (keep) {
    emitStatic(ctx, keep);
    return false;
  }
  endGame(ctx, winner, 'lifeZero');
  return true;
}

/** จบ action: ผู้เล่นที่ไลฟ์ 0 อยู่แต่ไม่มี "ไลฟ์ 0 แล้วไม่แพ้" แล้ว (เอล-ราฟิลออกจากสนาม / เงื่อนไขหาย) = แพ้ */
export function checkLifeZero(ctx: Ctx): void {
  for (const p of PLAYERS) {
    if (ctx.s.winner) return;
    if (allZones(ctx.s, p).every((z) => z.life.length === 0) && !noLoseSource(ctx.s, ctx.db, p)) endGame(ctx, opponentOf(p), 'lifeZero');
  }
}

/** สูญสลาย: Spirit/Ultimate/Brave ที่ Core ต่ำกว่าเลเวลต่ำสุด; คืน id ที่สูญสลาย */
export function checkDepletion(ctx: Ctx): string[] {
  const depleted: string[] = [];
  for (const player of PLAYERS) {
    for (const cardId of [...ctx.s.players[player].field]) {
      const card = ctx.s.cards[cardId]!;
      const def = ctx.db.get(card.cardNo);
      // คอร์ไม่ถึงเลเวลต่ำสุด (รวม "Lv คอสต์ +N" จากเอฟเฟกต์ เช่นราโชว) = สูญสลาย ทั้งสปิริตและเน็กซัส
      const counts = isSpiritLike(def) || (def.type === 'nexus' && def.levels.length > 0);
      // BSC03 กิ-กาชา: คอสต์ Lv1 เป็น 0 = ไม่สูญสลาย
      if (counts && (levelOf(def, card.cores.length) === 0 || cardLevel(ctx.s, ctx.db, cardId) === 0) && !lv1CostZeroSource(ctx.s, ctx.db, cardId)) {
        // สูญสลายเพราะ "Lv คอสต์ +N" (คอร์ถึง Lv1 ตามที่พิมพ์ แต่ไม่ถึงเมื่อรวม +N) → เรืองแสงการ์ดต้นเหตุก่อน
        if (levelOf(def, card.cores.length) > 0) emitStatic(ctx, levelBoostSources(ctx.s, ctx.db, cardId));
        sendToTrash(ctx, cardId);
        emit(ctx, { type: 'depleted', cardId });
        depleted.push(cardId);
      } else if (counts && ctx.start?.players[player].field.includes(cardId)) {
        // "Lv คอสต์ +N" เพิ่งมีผลกับการ์ดที่อยู่บนสนามอยู่แล้วใน action นี้ จนเลเวลตก (อาเมะลงสนาม / ได้โซลคอร์)
        const was = summonLevelCostBoost(ctx.start, ctx.db, cardId);
        const now = summonLevelCostBoost(ctx.s, ctx.db, cardId);
        const n = card.cores.length;
        if (now > was && levelOf(def, n - now) < levelOf(def, n - was)) emitStatic(ctx, levelBoostSources(ctx.s, ctx.db, cardId));
      }
    }
  }
  return depleted;
}

/** Core ที่ใช้จ่าย/วางได้ ต้องเป็นของเรา และอยู่ใน Reserve หรือบนการ์ดในสนามเรา (ห้ามใช้จาก Trash) */
export function assertUsableCore(ctx: Ctx, player: PlayerId, coreId: string): void {
  const core = ctx.s.cores[coreId];
  if (!core || core.owner !== player) fail('CORE_NOT_OWNED', `Core ${coreId} ไม่ใช่ของคุณ`);
  // 2VS2: ใช้ได้เฉพาะคอร์ของตัวเอง (กติกา 15 ข้อ 2)
  if (ctx.s.mode === '2v2' && (core.seat ?? 0) !== activeSeat(ctx.s, player)) fail('CORE_NOT_OWNED', 'คอร์นี้เป็นของเพื่อนร่วมทีม');
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
  opts: { noPlacement?: boolean; reserveOnly?: boolean; /** คอสต์ก่อนลด (การ์ดในแทรช) */ baseCost?: number; /** Core ขั้นต่ำที่ต้องวาง (รวม Lv คอสต์ +N) */ minPlacement?: number; /** คอสต์ที่ต้องจ่ายเพิ่ม (จินเบร์) */ extra?: number } = {},
): { paid: number; placed: string[] } {
  const cost = payableCost(ctx.s, ctx.db, player, def, opts.baseCost ?? def.cost) + (opts.extra ?? 0);
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
  } else {
    const min = opts.minPlacement ?? minCores(def);
    if (placement.length < min) fail('NOT_ENOUGH_CORES', `ต้องวาง Core อย่างน้อย ${min} ดวง`);
  }

  const p = ctx.s.players[player];
  for (const id of payment) {
    removeCore(ctx.s, id);
    p.trashCores.push(id);
  }
  for (const id of placement) removeCore(ctx.s, id);
  return { paid: cost, placed: [...placement] };
}
