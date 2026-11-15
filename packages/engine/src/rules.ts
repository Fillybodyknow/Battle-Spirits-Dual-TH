import type { Ability, CardDatabase, CardDef, CardFilter, Condition, SymbolColor } from '@bs/cards';
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
  const level = levelOf(def, card.cores.length - levelCostBoost(state, db, cardId));
  // จักรพรรดิมังกร ซีคฟรีด: มี Soul Core = ถือว่าเป็น Lv สูงสุด
  if (level > 0) {
    for (const ab of def.abilities) {
      if (ab.kind === 'maxLevelIf' && ab.levels.includes(level) && conditionHolds(state, cardId, ab.if, false, false, db)) {
        return def.levels.at(-1)?.level ?? level;
      }
    }
  }
  return level;
}

/** "Lv คอสต์ +N" ที่การ์ดของคู่แข่งให้การ์ดนี้ (เทียบจำนวน Core ที่ต้องมีต่อเลเวล) */
function levelCostBoost(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const opp = state.players[card.owner === 'p1' ? 'p2' : 'p1'];
  if (!state.players[card.owner].field.includes(cardId)) return 0;
  let n = 0;
  for (const src of opp.field) {
    for (const ab of db.get(state.cards[src]!.cardNo).abilities) {
      if (ab.kind !== 'levelCostBoost' || !matchesFilter(state, db, cardId, ab.filter)) continue;
      if (effectsNegated(state, db, src) || !ab.levels.includes(cardLevel(state, db, src))) continue;
      if (!conditionHolds(state, src, ab.if, false, false, db)) continue;
      n += ab.amount;
    }
  }
  return n;
}

/** ชื่อของการ์ด รวมชื่อแฝง ("ถือว่ามีคำว่า ... ในชื่อการ์ดด้วย") */
export function cardNames(def: CardDef): string[] {
  const alias = def.abilities.flatMap((a) => (a.kind === 'nameAlias' ? a.names : []));
  return [def.name, ...alias];
}

/** ชื่อการ์ด (รวมชื่อแฝง) มีคำใดคำหนึ่งนี้ */
export function nameHas(def: CardDef, words: readonly string[]): boolean {
  const names = cardNames(def);
  return words.some((w) => names.some((n) => n.includes(w)));
}

/** เจ็มที่เพิ่มจากเอฟเฟกต์ของการ์ดบนสนาม ("สปิริตนี้เจ็มแดงเพิ่ม 1 เม็ด") */
export function extraSymbols(state: GameState, db: CardDatabase, cardId: string): Partial<Record<SymbolColor, number>> {
  const out: Partial<Record<SymbolColor, number>> = {};
  if (effectsNegated(state, db, cardId)) return out;
  const level = cardLevel(state, db, cardId);
  for (const ab of db.get(state.cards[cardId]!.cardNo).abilities) {
    if (ab.kind !== 'extraSymbol' || ab.granted || !ab.levels.includes(level) || !conditionHolds(state, cardId, ab.if, false, false, db)) continue;
    out[ab.color] = (out[ab.color] ?? 0) + ab.count;
  }
  // Brave ที่ร่วมร่าง: "[ร่วมร่าง] ถ้า... สปิริตนี้เจ็ม...เพิ่ม" (เงื่อนไขดูที่ผู้ร่วมร่าง)
  for (const b of state.cards[cardId]!.braves) {
    for (const ab of db.get(state.cards[b]!.cardNo).abilities) {
      if (ab.kind !== 'extraSymbol' || !ab.granted || !conditionHolds(state, cardId, ab.if, false, false, db)) continue;
      out[ab.color] = (out[ab.color] ?? 0) + ab.count;
    }
  }
  return out;
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
  if ('all' in cond) return cond.all.every((c) => conditionHolds(state, sourceId, c, paidWithSoul, catalyzed, db));
  if ('attackStep' in cond) return state.phase === 'attack';
  if ('ownAttackStep' in cond) return state.phase === 'attack' && state.turnPlayer === card.owner;
  if ('anyAllySoul' in cond) return owner.field.some((id) => state.cards[id]!.cores.some((x) => state.cores[x]!.isSoul));
  if ('selfBraved' in cond) return card.braves.length > 0;
  if ('battlingOpponentType' in cond) {
    const b = state.battle;
    if (!b || !db) return false;
    const typeOf = (id: string) => db.get(state.cards[id]!.cardNo).type;
    if (b.attackerId === sourceId) return b.blockers.some((id) => typeOf(id) === cond.battlingOpponentType);
    if (b.blockers.includes(sourceId)) return typeOf(b.attackerId) === cond.battlingOpponentType;
    return false;
  }
  if ('allySoulNamed' in cond) {
    if (!db) return false;
    return owner.field.some((id) => {
      const c = state.cards[id]!;
      return nameHas(db.get(c.cardNo), cond.allySoulNamed) && c.cores.some((x) => state.cores[x]!.isSoul);
    });
  }
  if ('soulOnSelf' in cond) return card.cores.some((id) => state.cores[id]!.isSoul);
  if ('lifeAtMost' in cond) return owner.life.length <= cond.lifeAtMost;
  if ('soulInReserve' in cond) return owner.reserve.some((id) => state.cores[id]!.isSoul);
  if ('soulInTrash' in cond) return owner.trashCores.some((id) => state.cores[id]!.isSoul);
  if ('handHas' in cond) return !!db && owner.hand.some((id) => matchesFilter(state, db, id, cond.handHas));
  if ('catalyzed' in cond) return catalyzed;
  if ('selfCoresAtLeast' in cond) return card.cores.length >= cond.selfCoresAtLeast;
  if ('handAtLeast' in cond) return owner.hand.length >= cond.handAtLeast;
  if ('deckAtLeast' in cond) return owner.deck.length >= cond.deckAtLeast;
  if ('selfAttacking' in cond) return state.battle?.attackerId === sourceId;
  if ('selfExhausted' in cond) return card.state === 'exhausted';
  if ('allyHas' in cond) {
    if (!db) return false;
    const f = cond.allyHas;
    return owner.field.some((id) => (f.types || isSpiritLike(db.get(state.cards[id]!.cardNo))) && matchesFilter(state, db, id, f));
  }
  if ('trashHas' in cond) {
    if (!db) return false;
    return owner.trashCards.some((id) => matchesFilter(state, db, id, cond.trashHas));
  }
  if ('alliesAtLeast' in cond) {
    if (!db) return false;
    return owner.field.filter((id) => isSpiritLike(db.get(state.cards[id]!.cardNo))).length >= cond.alliesAtLeast;
  }
  if ('opponentHas' in cond) {
    if (!db) return false;
    const opp = state.players[card.owner === 'p1' ? 'p2' : 'p1'];
    const f = cond.opponentHas;
    const n = opp.field.filter(
      (id) =>
        (f.types || isSpiritLike(db.get(state.cards[id]!.cardNo))) &&
        matchesFilter(state, db, id, f) &&
        (!cond.withCores || state.cards[id]!.cores.length > 0),
    ).length;
    return n >= (cond.count ?? 1);
  }
  if ('catalyzable' in cond) {
    if (!card.cores.some((id) => state.cores[id]!.isSoul) || !owner.burst || !db) return false;
    const def = db.get(state.cards[owner.burst]!.cardNo);
    return (cond.catalyzable === 'any' || def.colors.includes(cond.catalyzable)) && def.abilities.some((a) => a.kind === 'burst' && a.soul);
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
  const ownLevel = cardLevel(state, db, cardId);
  let bp = (def.levels.find((l) => l.level === ownLevel)?.bp ?? 0) + card.turnBp;
  // "ในเทิร์นนี้ สปิริตเราทั้งหมด BP+": รวมตัวที่ลงสนามหลังเอฟเฟกต์ทำงาน
  for (const b of state.turnBuffs ?? []) {
    if (b.player === card.owner && b.turn === state.turn && (def.type === 'spirit' || def.type === 'brave') && (!b.filter || matchesFilter(state, db, cardId, b.filter)))
      bp += b.amount;
  }
  // เอฟเฟกต์ติดตัวที่ Brave ให้ผู้ร่วมร่าง
  for (const b of card.braves) bp += db.get(state.cards[b]!.cardNo).braveCondition?.bp ?? 0;
  for (const srcId of state.players[card.owner].field) {
    const src = state.cards[srcId]!;
    const srcDef = db.get(src.cardNo);
    const level = cardLevel(state, db, srcId);
    if (effectsNegated(state, db, srcId)) continue;
    for (const ab of srcDef.abilities) {
      if (ab.kind !== 'staticBp' || !ab.levels.includes(level) || !conditionHolds(state, srcId, ab.if, false, false, db)) continue;
      const scope = ab.scope;
      const isSpirit = def.type === 'spirit' || def.type === 'brave';
      const applies =
        'self' in scope
          ? srcId === cardId
          : 'ownFamily' in scope
            ? def.type === 'spirit' && def.family.includes(scope.ownFamily)
            : 'ownNamed' in scope
              ? isSpirit && nameHas(def, scope.ownNamed)
              : isSpirit &&
                (!scope.ownSpirits.color || def.colors.includes(scope.ownSpirits.color)) &&
                (!scope.ownSpirits.family || def.family.includes(scope.ownSpirits.family)) &&
                (!scope.ownSpirits.soul || card.cores.some((x) => state.cores[x]!.isSoul));
      if (applies) bp += ab.amount;
    }
  }
  return Math.max(0, bp);
}

/** การ์ดตรงตัวกรองหรือไม่ (maxBp ใช้ BP ปัจจุบันบนสนาม) */
/** คอสต์ของการ์ดบนสนาม (คอสต์ที่พิมพ์ + เอฟเฟกต์ "คอสต์ +N" ของการ์ดฝ่ายเดียวกัน) การ์ดนอกสนาม = คอสต์ที่พิมพ์ */
export function fieldCost(state: GameState, db: CardDatabase, cardId: string, ignoreBraveCost = false): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const owner = state.players[card.owner];
  if (!owner.field.includes(cardId)) return def.cost;
  let cost = def.cost;
  // สปิริตที่ร่วมร่างกับ Brave: คอสต์ = คอสต์สปิริต + คอสต์ Brave
  if (!ignoreBraveCost) for (const b of card.braves) cost += db.get(state.cards[b]!.cardNo).cost;
  for (const id of owner.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'costBoost' || !ab.levels.includes(level)) continue;
      if (!conditionHolds(state, id, ab.if, false, false, db) || !matchesFilter(state, db, cardId, ab.filter)) continue;
      cost += ab.amount;
    }
  }
  return cost;
}

export function matchesFilter(state: GameState, db: CardDatabase, cardId: string, filter: CardFilter): boolean {
  const def = db.get(state.cards[cardId]!.cardNo);
  const costOf = () => fieldCost(state, db, cardId, !!filter.ignoreBraveCost);
  if (filter.types && !filter.types.includes(def.type)) return false;
  if (filter.family && !def.family.includes(filter.family)) return false;
  if (filter.families && !filter.families.some((f) => def.family.includes(f))) return false;
  if (filter.state && state.cards[cardId]!.state !== filter.state) return false;
  if (filter.maxBp !== undefined && currentBp(state, db, cardId) > filter.maxBp) return false;
  if (filter.minCost !== undefined && costOf() < filter.minCost) return false;
  if (filter.maxCost !== undefined && costOf() > filter.maxCost) return false;
  if (filter.cost !== undefined && costOf() !== filter.cost) return false;
  if (filter.nameIncludes && !nameHas(def, filter.nameIncludes)) return false;
  if (filter.hasBurst && !def.burst) return false;
  if (filter.color && !def.colors.includes(filter.color)) return false;
  if (filter.minBp !== undefined && currentBp(state, db, cardId) < filter.minBp) return false;
  const card = state.cards[cardId]!;
  const hasSoul = card.cores.some((id) => state.cores[id]!.isSoul);
  if (filter.soul && !hasSoul) return false;
  if (filter.noSoul && hasSoul) return false;
  if (filter.hasEvolution && !def.abilities.some((a) => a.kind === 'evolution')) return false;
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
  // กันวนไม่จบ: เลเวลของการ์ดที่ปิดเอฟเฟกต์อาจขึ้นกับเอฟเฟกต์ของฝั่งนี้ (ราโชว: เน็กซัสคู่แข่ง Lv คอสต์ +2)
  // ระหว่างตรวจ ถือว่าการ์ดอื่นไม่ถูกปิดเอฟเฟกต์
  if (checkingNegation) return false;
  checkingNegation = true;
  try {
    return state.players[state.turnPlayer].field.some((id) => {
      const srcDef = db.get(state.cards[id]!.cardNo);
      const level = cardLevel(state, db, id);
      return srcDef.abilities.some((a) => a.kind === 'negateOpponentEffects' && a.levels.includes(level) && def.cost <= a.maxCost);
    });
  } finally {
    checkingNegation = false;
  }
}
let checkingNegation = false;

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
  for (const id of state.players[player].field) {
    for (const [color, n] of Object.entries(extraSymbols(state, db, id)) as [SymbolColor, number][]) {
      out[color] = (out[color] ?? 0) + n;
    }
  }
  // "เจ็มของสปิริตนี้ถือว่าเป็นเจ็มสี...ด้วย" (คานิคอง)
  for (const id of state.players[player].field) {
    const def = db.get(state.cards[id]!.cardNo);
    const also = def.abilities.find((a) => a.kind === 'symbolAlsoColor' && a.levels.includes(cardLevel(state, db, id)));
    if (!also || also.kind !== 'symbolAlsoColor' || effectsNegated(state, db, id)) continue;
    const own = Object.entries(def.symbols).reduce((n, [c, v]) => n + (c === also.color ? 0 : (v ?? 0)), 0);
    if (own > 0) out[also.color] = (out[also.color] ?? 0) + own;
  }
  return out;
}

/** คอสต์ที่ต้องจ่ายจริงหลังลดด้วย gem symbol บนสนาม (หมวด 3 ข้อ 1-4) */
/**
 * คอสต์ของการ์ด (ก่อนลดคอสต์): การ์ดในแทรช = "ถือว่ามีคอสต์" จากสปิริตบนสนาม / จากตัวการ์ดเอง
 */
export function baseCost(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const owner = state.players[card.owner];
  const zone = owner.trashCards.includes(cardId) ? 'trash' : owner.hand.includes(cardId) ? 'hand' : null;
  if (!zone) return def.cost;
  let cost: number | null = null;
  for (const id of owner.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'trashCostAll' || (ab.zone ?? 'trash') !== zone || !ab.levels.includes(level)) continue;
      if (ab.attackStepOnly && state.phase !== 'attack') continue;
      if (ab.mainStepOnly && (state.phase !== 'main' || state.turnPlayer !== card.owner)) continue;
      if (!matchesFilter(state, db, cardId, ab.filter)) continue;
      cost = cost === null ? ab.cost : Math.min(cost, ab.cost);
    }
  }
  if (cost !== null) return cost;
  if (zone === 'hand') return def.cost;
  const own = def.abilities.find((a) => a.kind === 'trashCost');
  return own && own.kind === 'trashCost' ? own.cost : def.cost;
}

/** เอฟเฟกต์ Flash ที่กดใช้เอง (activated) ของการ์ดบนสนามนี้ที่ใช้ได้ตอนนี้ */
export function activatableAbilities(state: GameState, db: CardDatabase, player: PlayerId, cardId: string): Extract<Ability, { kind: 'activated' }>[] {
  const card = state.cards[cardId];
  if (!card || card.owner !== player || !state.players[player].field.includes(cardId)) return [];
  if (state.winner || state.choice) return [];
  const flash = state.battle?.flash;
  if (!flash || flash.priority !== player || state.phase !== 'attack') return [];
  if (effectsNegated(state, db, cardId)) return [];
  const level = cardLevel(state, db, cardId);
  return db.get(card.cardNo).abilities.filter(
    (a): a is Extract<Ability, { kind: 'activated' }> =>
      a.kind === 'activated' &&
      a.levels.includes(level) &&
      (a.maxPerTurn === undefined || card.usedThisTurn.filter((x) => x === a.source).length < a.maxPerTurn) &&
      conditionHolds(state, cardId, a.if, false, false, db),
  );
}

/** การ์ดในมือของผู้เล่นนี้ไม่รับผลเอฟเฟกต์ของคู่แข่ง (คานิคอง) */
export function handImmune(state: GameState, db: CardDatabase, player: PlayerId): boolean {
  return state.players[player].field.some((id) => {
    if (effectsNegated(state, db, id)) return false;
    const level = cardLevel(state, db, id);
    return db
      .get(state.cards[id]!.cardNo)
      .abilities.some((a) => a.kind === 'handImmune' && a.levels.includes(level) && conditionHolds(state, id, a.if, false, false, db));
  });
}

/** Quick ของผู้เล่นนี้ใช้คอร์จากการ์ดบนสนามได้ (ไซเลนท์ฮิล: แอทแท็คสเต็ปของเรา) */
export function quickAnyCores(state: GameState, db: CardDatabase, player: PlayerId): boolean {
  if (state.phase !== 'attack' || state.turnPlayer !== player) return false;
  return state.players[player].field.some((id) => {
    if (effectsNegated(state, db, id)) return false;
    const level = cardLevel(state, db, id);
    return db
      .get(state.cards[id]!.cardNo)
      .abilities.some((a) => a.kind === 'quickAnyCores' && a.levels.includes(level) && conditionHolds(state, id, a.if, false, false, db));
  });
}

/** การ์ดนี้ไม่ถูกถอดคอร์โดยคู่แข่ง (คานิคอง) */
export function coreRemovalImmune(state: GameState, db: CardDatabase, cardId: string): boolean {
  const owner = state.players[state.cards[cardId]!.owner];
  return owner.field.some((id) => {
    if (effectsNegated(state, db, id)) return false;
    const level = cardLevel(state, db, id);
    return db
      .get(state.cards[id]!.cardNo)
      .abilities.some(
        (a) => a.kind === 'coreRemovalImmune' && a.levels.includes(level) && conditionHolds(state, id, a.if, false, false, db) && matchesFilter(state, db, cardId, a.filter),
      );
  });
}

/** เงื่อนไขเบิร์สเพิ่มเติมของผู้เล่นนี้ (อากุนิอัส) */
export function extraBurstEvents(state: GameState, db: CardDatabase, player: PlayerId): string[] {
  return state.players[player].field.flatMap((id) => {
    const level = cardLevel(state, db, id);
    return db.get(state.cards[id]!.cardNo).abilities.flatMap((a) => (a.kind === 'burstAlsoOn' && a.levels.includes(level) ? a.events : []));
  });
}

/** กติกาที่อนุญาตให้อัญเชิญการ์ดในแทรชด้วย action summon ตอนนี้ (null = ไม่ได้) */
export function trashSummonRule(state: GameState, db: CardDatabase, player: PlayerId, cardId: string): { soulPayment: boolean } | null {
  const p = state.players[player];
  if (!p.trashCards.includes(cardId)) return null;
  const def = db.get(state.cards[cardId]!.cardNo);
  if (def.type !== 'spirit' && def.type !== 'brave') return null;
  const flash = state.battle?.flash;
  const timingOk = (t: 'main' | 'attackFlash') =>
    t === 'main' ? !flash && state.phase === 'main' && state.turnPlayer === player : !!flash && state.phase === 'attack' && flash.priority === player;
  let rule: { soulPayment: boolean } | null = null;
  const allow = (soul: boolean) => {
    rule = rule ? { soulPayment: rule.soulPayment && soul } : { soulPayment: soul };
  };
  for (const ab of def.abilities) {
    if (ab.kind === 'trashSummon' && ab.self && timingOk(ab.timing)) allow(!!ab.soulPayment);
  }
  for (const id of p.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'trashSummon' || ab.self || !ab.levels.includes(level) || !timingOk(ab.timing)) continue;
      if (ab.filter && !matchesFilter(state, db, cardId, ab.filter)) continue;
      allow(!!ab.soulPayment);
    }
  }
  return rule;
}

export function payableCost(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef, base: number = def.cost): number {
  const full = def.abilities.some(
    (a) => a.kind === 'fullReductionIfAlly' && state.players[player].field.some((id) => db.get(state.cards[id]!.cardNo).name === a.name),
  );
  if (full) return Math.max(0, base - Object.values(def.reduction).reduce<number>((n, v) => n + (v ?? 0), 0));
  const symbols = { ...fieldSymbols(state, db, player) };
  // "เมื่ออัญเชิญการ์ดที่ชื่อมีคำ ... สปิริตนี้เจ็มเพิ่ม" (ปะกุกุ)
  for (const id of state.players[player].field) {
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'summonSymbol' || !nameHas(def, ab.nameIncludes) || effectsNegated(state, db, id)) continue;
      if (!ab.levels.includes(cardLevel(state, db, id)) || !conditionHolds(state, id, ab.if, false, false, db)) continue;
      symbols[ab.color] = (symbols[ab.color] ?? 0) + ab.count;
    }
  }
  let reduced = 0;
  for (const [color, max] of Object.entries(def.reduction) as [SymbolColor, number][]) {
    reduced += Math.min(max, symbols[color] ?? 0);
  }
  return Math.max(0, base - reduced);
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
  if (state.battle?.noBurst === player) return true;
  const opp = player === 'p1' ? 'p2' : 'p1';
  if (state.turnPlayer !== opp || state.phase !== 'attack') return false;
  return state.players[opp].field.some((id) => {
    const def = db.get(state.cards[id]!.cardNo);
    const level = cardLevel(state, db, id);
    return def.abilities.some((a) => a.kind === 'blockOpponentBurst' && a.levels.includes(level) && conditionHolds(state, id, a.if));
  });
}

/** การ์ดนี้ประกาศโจมตีได้ตอนนี้หรือไม่ (ไม่ดูเฟส): สปิริตที่ฟื้นสภาพ และไม่ถูกห้ามโจมตีในเทิร์นนี้ */
export function canAttackWith(state: GameState, db: CardDatabase, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  const def = db.get(card.cardNo);
  if (!isSpiritLike(def) || card.state !== 'refresh') return false;
  return !(state.attackBans ?? []).some((b) => b.player === card.owner && b.turn === state.turn && b.types.includes(def.type));
}

/**
 * สปิริตของ defender ที่ป้องกันการโจมตีปัจจุบันได้
 * โดโระเทอร์โบ: ถ้าผู้โจมตีเป็นเผ่าที่กำหนด ป้องกันได้เฉพาะตัวที่คอสต์เท่ากับผู้โจมตี
 */
export function blockersFor(state: GameState, db: CardDatabase, defender: PlayerId): string[] {
  const attacker = state.battle ? state.cards[state.battle.attackerId] : undefined;
  let sameCost: number | null = null;
  if (attacker) {
    const aDef = db.get(attacker.cardNo);
    const locked = state.players[attacker.owner].field.some((id) => {
      if (effectsNegated(state, db, id)) return false;
      const level = cardLevel(state, db, id);
      return db
        .get(state.cards[id]!.cardNo)
        .abilities.some((a) => a.kind === 'blockSameCost' && a.levels.includes(level) && aDef.family.includes(a.family) && conditionHolds(state, id, a.if, false, false, db));
    });
    if (locked) sameCost = aDef.cost;
  }
  return state.players[defender].field.filter((id) => {
    const card = state.cards[id]!;
    const def = db.get(card.cardNo);
    if (state.battle?.blockFilter && !matchesFilter(state, db, id, state.battle.blockFilter)) return false;
    return card.state === 'refresh' && isSpiritLike(def) && (sameCost === null || def.cost === sameCost);
  });
}

/** Magic "เอฟเฟกต์นี้ใช้ได้เทิร์นละ 1 ครั้ง" ที่ใช้ไปแล้วในเทิร์นนี้ */
export function magicUsedUp(state: GameState, db: CardDatabase, player: PlayerId, cardNo: string, timing: 'main' | 'flash'): boolean {
  const def = db.get(cardNo);
  const ab = def.abilities.find((a) => a.kind === 'magic' && a.timing === timing);
  if (!ab || ab.kind !== 'magic' || !ab.oncePerTurn) return false;
  return (state.usedOncePerTurn ?? []).includes(`${player}:${cardNo}:${ab.source}`);
}
