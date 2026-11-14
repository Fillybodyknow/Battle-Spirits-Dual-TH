import type { CardDatabase, CardDef, CardFilter, Condition, SymbolColor } from '@bs/cards';
import type { CardInstance, GameState, PlayerId } from './types';

/** ข้อผิดพลาดจากการทำ action ผิดกติกา */
export class RuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RuleError';
  }
}

export function fail(code: string, message: string): never {
  throw new RuleError(code, message);
}

/** การ์ดประเภทที่โจมตี/ป้องกันได้ (Brave ที่อยู่เดี่ยวนับเป็นรูปแบบ Spirit) */
export function isSpiritLike(def: CardDef): boolean {
  return def.type === 'spirit' || def.type === 'ultimate' || def.type === 'brave';
}

/** เลเวลตามจำนวน Core บนการ์ด; 0 = ต่ำกว่าเลเวลต่ำสุด */
export function levelOf(def: CardDef, coreCount: number): number {
  for (let i = def.levels.length - 1; i >= 0; i--) {
    const lv = def.levels[i]!;
    if (coreCount >= lv.cores) return lv.level;
  }
  return 0;
}

/** จำนวน Core ขั้นต่ำที่ต้องวางตอนลงสนาม */
export function minCores(def: CardDef): number {
  return def.levels[0]?.cores ?? 0;
}

/** BP ตามเลเวลที่พิมพ์บนการ์ด (ไม่รวมเอฟเฟกต์) */
export function bpOf(def: CardDef, coreCount: number): number {
  const level = levelOf(def, coreCount);
  return def.levels.find((l) => l.level === level)?.bp ?? 0;
}

/** ผู้ร่วมร่างของ Brave นี้ (null = ไม่ได้ร่วมร่าง) */
export function braveHostOf(state: GameState, braveId: string): string | null {
  for (const p of ['p1', 'p2'] as const) {
    for (const id of state.players[p].field) if (state.cards[id]!.braves.includes(braveId)) return id;
  }
  return null;
}

/** เลเวลปัจจุบันของการ์ดบนสนาม (Brave ที่ร่วมร่างอยู่ = เลเวลต่ำสุดของตัวเอง) */
export function cardLevel(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  if (def.type === 'brave' && braveHostOf(state, cardId)) return def.levels[0]?.level ?? 0;
  return levelOf(def, card.cores.length);
}

/** ตรวจเงื่อนไขของเอฟเฟกต์ (paidWithSoul / catalyzed มีความหมายเฉพาะตอนประมวลผลเอฟเฟกต์ในคิว) */
export function conditionHolds(
  state: GameState,
  sourceId: string,
  cond: Condition | undefined,
  paidWithSoul = false,
  catalyzed = false,
  db?: CardDatabase,
): boolean {
  if (!cond) return true;
  const card = state.cards[sourceId]!;
  const owner = state.players[card.owner];
  if ('not' in cond) return !conditionHolds(state, sourceId, cond.not, paidWithSoul, catalyzed, db);
  if ('attackStep' in cond) return state.phase === 'attack';
  if ('allySoulNamed' in cond) {
    if (!db) return false;
    return owner.field.some((id) => {
      const c = state.cards[id]!;
      return cond.allySoulNamed.some((w) => db.get(c.cardNo).name.includes(w)) && c.cores.some((x) => state.cores[x]!.isSoul);
    });
  }
  if ('soulOnSelf' in cond) return card.cores.some((id) => state.cores[id]!.isSoul);
  if ('lifeAtMost' in cond) return owner.life.length <= cond.lifeAtMost;
  if ('soulInReserve' in cond) return owner.reserve.some((id) => state.cores[id]!.isSoul);
  if ('catalyzed' in cond) return catalyzed;
  if ('selfCoresAtLeast' in cond) return card.cores.length >= cond.selfCoresAtLeast;
  if ('handAtLeast' in cond) return owner.hand.length >= cond.handAtLeast;
  if ('catalyzable' in cond) {
    if (!card.cores.some((id) => state.cores[id]!.isSoul) || !owner.burst || !db) return false;
    const def = db.get(state.cards[owner.burst]!.cardNo);
    return def.colors.includes(cond.catalyzable) && def.abilities.some((a) => a.kind === 'burst' && a.soul);
  }
  return paidWithSoul;
}

/**
 * BP ปัจจุบันบนสนาม = BP ตามเลเวล + BP+ ในเทิร์นนี้ + BP+ ถาวรจากการ์ดของเจ้าของ
 */
export function currentBp(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  if (!isSpiritLike(def)) return 0;
  let bp = bpOf(def, card.cores.length) + card.turnBp;
  // เอฟเฟกต์ติดตัวที่ Brave ให้ผู้ร่วมร่าง
  for (const b of card.braves) bp += db.get(state.cards[b]!.cardNo).braveCondition?.bp ?? 0;
  for (const srcId of state.players[card.owner].field) {
    const src = state.cards[srcId]!;
    const srcDef = db.get(src.cardNo);
    const level = levelOf(srcDef, src.cores.length);
    if (effectsNegated(state, db, srcId)) continue;
    for (const ab of srcDef.abilities) {
      if (ab.kind !== 'staticBp' || !ab.levels.includes(level) || !conditionHolds(state, srcId, ab.if, false, false, db)) continue;
      const applies =
        'self' in ab.scope
          ? srcId === cardId
          : 'ownFamily' in ab.scope
            ? def.type === 'spirit' && def.family.includes(ab.scope.ownFamily)
            : (def.type === 'spirit' || def.type === 'brave') && ab.scope.ownNamed.some((w) => def.name.includes(w));
      if (applies) bp += ab.amount;
    }
  }
  return bp;
}

/** การ์ดตรงตัวกรองหรือไม่ (maxBp ใช้ BP ปัจจุบันบนสนาม) */
export function matchesFilter(state: GameState, db: CardDatabase, cardId: string, filter: CardFilter): boolean {
  const def = db.get(state.cards[cardId]!.cardNo);
  if (filter.types && !filter.types.includes(def.type)) return false;
  if (filter.family && !def.family.includes(filter.family)) return false;
  if (filter.families && !filter.families.some((f) => def.family.includes(f))) return false;
  if (filter.state && state.cards[cardId]!.state !== filter.state) return false;
  if (filter.maxBp !== undefined && currentBp(state, db, cardId) > filter.maxBp) return false;
  if (filter.minCost !== undefined && def.cost < filter.minCost) return false;
  if (filter.maxCost !== undefined && def.cost > filter.maxCost) return false;
  if (filter.cost !== undefined && def.cost !== filter.cost) return false;
  if (filter.nameIncludes && !filter.nameIncludes.some((w) => def.name.includes(w))) return false;
  if (filter.hasBurst && !def.burst) return false;
  return true;
}

/**
 * เอฟเฟกต์ของการ์ดบนสนามนี้ถูกปิดหรือไม่ (เมียวโอดาบแดง: "แอทแท็คสเต็ปของเรา: สปิริต/อัลติเมทคอสต์ไม่เกิน N ของคู่แข่ง เอฟเฟกต์จะไม่ทำงาน")
 * การ์ดที่ปิดได้คือของฝ่ายที่ไม่ใช่ผู้เล่นเทิร์น จึงไม่วนตรวจกันเอง
 */
export function effectsNegated(state: GameState, db: CardDatabase, cardId: string): boolean {
  if (state.phase !== 'attack') return false;
  const card = state.cards[cardId];
  if (!card || card.owner === state.turnPlayer) return false;
  if (!state.players[card.owner].field.includes(cardId)) return false;
  const def = db.get(card.cardNo);
  if (def.type !== 'spirit' && def.type !== 'ultimate' && def.type !== 'brave') return false;
  return state.players[state.turnPlayer].field.some((id) => {
    const srcDef = db.get(state.cards[id]!.cardNo);
    const level = cardLevel(state, db, id);
    return srcDef.abilities.some((a) => a.kind === 'negateOpponentEffects' && a.levels.includes(level) && def.cost <= a.maxCost);
  });
}

/** จำนวน gem symbol ทั้งหมด = Life ที่ลดเมื่อโจมตีสำเร็จ */
export function symbolCount(def: CardDef): number {
  return Object.values(def.symbols).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** gem symbol บนสนามของผู้เล่น แยกตามสี */
export function fieldSymbols(
  state: GameState,
  db: CardDatabase,
  player: PlayerId,
): Partial<Record<SymbolColor, number>> {
  const out: Partial<Record<SymbolColor, number>> = {};
  // Brave ที่ร่วมร่าง: ผู้ร่วมร่างได้รับ gem symbol ของ Brave ด้วย
  for (const id of state.players[player].field.flatMap((f) => [f, ...state.cards[f]!.braves])) {
    const def = db.get(state.cards[id]!.cardNo);
    for (const [color, n] of Object.entries(def.symbols) as [SymbolColor, number][]) {
      out[color] = (out[color] ?? 0) + n;
    }
  }
  return out;
}

/** คอสต์ที่ต้องจ่ายจริงหลังลดด้วย gem symbol บนสนาม (หมวด 3 ข้อ 1-4) */
export function payableCost(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef): number {
  const symbols = fieldSymbols(state, db, player);
  let reduced = 0;
  for (const [color, max] of Object.entries(def.reduction) as [SymbolColor, number][]) {
    reduced += Math.min(max, symbols[color] ?? 0);
  }
  return Math.max(0, def.cost - reduced);
}

export type CoreLocation =
  | { area: 'life' | 'reserve' | 'trashCores'; player: PlayerId }
  | { area: 'card'; player: PlayerId; cardId: string };

export function locateCore(state: GameState, coreId: string): CoreLocation | null {
  for (const player of ['p1', 'p2'] as const) {
    const p = state.players[player];
    if (p.life.includes(coreId)) return { area: 'life', player };
    if (p.reserve.includes(coreId)) return { area: 'reserve', player };
    if (p.trashCores.includes(coreId)) return { area: 'trashCores', player };
    for (const cardId of p.field) {
      if (state.cards[cardId]!.cores.includes(coreId)) return { area: 'card', player, cardId };
    }
  }
  return null;
}

export function removeCore(state: GameState, coreId: string): void {
  const loc = locateCore(state, coreId);
  if (!loc) fail('CORE_NOT_FOUND', `ไม่พบ Core ${coreId}`);
  const remove = (arr: string[]) => arr.splice(arr.indexOf(coreId), 1);
  if (loc.area === 'card') remove(state.cards[loc.cardId]!.cores);
  else remove(state.players[loc.player][loc.area]);
}

export function removeFrom(arr: string[], id: string): void {
  const i = arr.indexOf(id);
  if (i < 0) throw new Error(`ไม่พบ ${id}`);
  arr.splice(i, 1);
}

export function fieldCard(state: GameState, player: PlayerId, cardId: string): CardInstance {
  if (!state.players[player].field.includes(cardId)) {
    fail('NOT_ON_FIELD', `การ์ด ${cardId} ไม่ได้อยู่บนสนามของ ${player}`);
  }
  return state.cards[cardId]!;
}

/** Burst ของผู้เล่นนี้ถูกห้ามทำงานตอนนี้หรือไม่ (เช่น โทบิคาเงะ: แอทแท็คสเต็ปของคู่แข่ง) */
export function burstBlocked(state: GameState, db: CardDatabase, player: PlayerId): boolean {
  const opp = player === 'p1' ? 'p2' : 'p1';
  if (state.turnPlayer !== opp || state.phase !== 'attack') return false;
  return state.players[opp].field.some((id) => {
    const def = db.get(state.cards[id]!.cardNo);
    const level = cardLevel(state, db, id);
    return def.abilities.some((a) => a.kind === 'blockOpponentBurst' && a.levels.includes(level) && conditionHolds(state, id, a.if));
  });
}
