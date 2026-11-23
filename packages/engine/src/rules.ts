import type { Ability, CardDatabase, CardDef, CardFilter, Condition, Step, SymbolColor } from '@bs/cards';
import type { CardInstance, GameState, PlayerId } from './types';
import { allZones, ownerZones, teamTrash } from './seats';

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
/** เบรฟนี้นับในจำนวนเบรฟที่รวมร่างได้ของผู้ร่วมร่างนี้ไหม (ปกติสปิริต 1 ตัวมีเบรฟได้ 1 ใบ) */
export function braveCounts(state: GameState, db: CardDatabase, hostId: string, braveId: string): boolean {
  const hostName = db.get(state.cards[hostId]!.cardNo).name;
  return !db.get(state.cards[braveId]!.cardNo).abilities.some((a) => a.kind === 'braveNotCounted' && a.hostName === hostName);
}

/** การ์ดสปิริตนี้ตรงเงื่อนไขร่วมร่างของเบรฟนี้ (คอสต์ตั้งแต่ N / เผ่า) ไม่ตรวจที่ว่าง */
export function braveFits(braveDef: CardDef, hostDef: CardDef): boolean {
  const c = braveDef.braveCondition;
  return (
    (hostDef.type === 'spirit' || (hostDef.type === 'ultimate' && !!c?.ultimate)) &&
    // กติกา 14 Bunshin ข้อ 1: สปิริตร่างแยกรวมร่างไม่ได้
    hostDef.cardNo !== 'SMP-BUNSHIN' &&
    hostDef.cost >= (c?.minCost ?? 0) &&
    (!c?.family || hostDef.family.includes(c.family)) &&
    // BS09 ไดกิว-อาร์มส์: ร่วมร่างกับสปิริตที่ไม่มีข้อความเอฟเฟกต์
    (!c?.noEffectText || effectText(hostDef).trim() === '')
  );
}

/** สปิริตนี้รับเบรฟใบนี้มารวมร่างเพิ่มได้ไหม (ไม่ตรวจคอสต์) */
export function braveRoom(state: GameState, db: CardDatabase, hostId: string, braveId: string): boolean {
  const braves = state.cards[hostId]!.braves.filter((b) => b !== braveId);
  if (!braveCounts(state, db, hostId, braveId)) return true;
  return braves.filter((b) => braveCounts(state, db, hostId, b)).length < braveLimit(state, db, hostId);
}

/** จำนวนเบรฟที่สปิริตนี้รวมร่างได้ (ปกติ 1 · ไคโดว ทสึโนะชิงะ 2) */
export function braveLimit(state: GameState, db: CardDatabase, hostId: string): number {
  if (effectsNegated(state, db, hostId)) return 1;
  const level = cardLevel(state, db, hostId);
  let n = 1;
  for (const a of db.get(state.cards[hostId]!.cardNo).abilities) if (a.kind === 'braveSlots' && !a.allies && a.levels.includes(level)) n = Math.max(n, a.count);
  // สปิริตบนสนามของเราที่ให้ผลกับสปิริตเราที่ตรงตัวกรองทั้งหมด
  for (const src of state.players[state.cards[hostId]!.owner].field) {
    if (effectsNegated(state, db, src)) continue;
    const lv = cardLevel(state, db, src);
    for (const a of db.get(state.cards[src]!.cardNo).abilities) {
      if (a.kind === 'braveSlots' && a.allies && a.levels.includes(lv) && matchesFilter(state, db, hostId, a.allies)) n = Math.max(n, a.count);
    }
  }
  return n;
}

/** เบรฟที่ต้องสลับออกถ้าจะเอาเบรฟใบนี้มารวมร่าง (ใบที่นับในจำนวน) */
export function braveToSwap(state: GameState, db: CardDatabase, hostId: string, braveId: string): string | undefined {
  if (braveRoom(state, db, hostId, braveId)) return undefined;
  return state.cards[hostId]!.braves.find((b) => b !== braveId && braveCounts(state, db, hostId, b));
}

export function braveHostOf(state: GameState, braveId: string): string | null {
  for (const p of ['p1', 'p2'] as const) {
    for (const id of state.players[p].field) if (state.cards[id]!.braves.includes(braveId)) return id;
  }
  return null;
}

/** เลเวลปัจจุบันของการ์ดบนสนาม (Brave ที่ร่วมร่างอยู่ = เลเวลต่ำสุดของตัวเอง) */
function cardLevelRaw(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  if (def.type === 'brave' && braveHostOf(state, cardId)) return def.levels[0]?.level ?? 0;
  const level = levelOf(def, card.cores.length - levelCostBoost(state, db, cardId));
  // BS11 ฮะจิริว: สปิริต "เก็นจิ" ของเรามี Lv เหมือนฮะจิริว
  if (level > 0) {
    const copy = statCopySource(state, db, cardId);
    if (copy) return cardLevel(state, db, copy);
  }
  // จักรพรรดิมังกร ซีคฟรีด: มี Soul Core = ถือว่าเป็น Lv สูงสุด
  if (level > 0) {
    for (const ab of def.abilities) {
      if (ab.kind === 'maxLevelIf' && !ab.granted && ab.levels.includes(level) && conditionHolds(state, cardId, ab.if, false, false, db)) {
        return def.levels.at(-1)?.level ?? level;
      }
    }
    // BS12 จูซุมารุ: [ร่วมร่าง] "แอทแท็คสเต็ปของเรา: สปิริตนี้ถือว่าเป็น Lv สูงสุด"
    for (const b of card.braves) {
      for (const ab of db.get(state.cards[b]!.cardNo).abilities) {
        if (ab.kind === 'maxLevelIf' && ab.granted && conditionHolds(state, cardId, ab.if, false, false, db)) return def.levels.at(-1)?.level ?? level;
      }
    }
    // BS12 อาบิส-อโพคาลิพส์ / พันหัตถ์คันนนจู่โจม: ในเทิร์นนี้ถือว่าเป็น Lv สูงสุด
    if (
      (def.type === 'spirit' || def.type === 'brave') &&
      state.players[card.owner].field.includes(cardId) &&
      (state.maxLevelTurn ?? []).some((t) => t.player === card.owner && t.turn === state.turn && (!t.cardId || t.cardId === cardId))
    )
      return def.levels.at(-1)?.level ?? level;
    // BS09 โอวาริโนะเซได / วัดอรุณ: สปิริตของเราที่ตรงตัวกรองถือว่าเป็น Lv สูงสุด
    if (state.players[card.owner].field.includes(cardId) && maxLevelAllySource(state, db, cardId)) return def.levels.at(-1)?.level ?? level;
    // BS10 สวนลอยฟ้าของเหล่าเจ้าหญิง: ในเทิร์นนี้สปิริตทั้งหมดของผู้เล่นนี้ถือว่าเป็น Lv1
    if ((def.type === 'spirit' || def.type === 'brave') && (state.levelOneTurn ?? []).some((t) => t.player === card.owner && t.turn === state.turn)) return 1;
  }
  return level;
}

/** การ์ดของเราที่ทำให้สปิริตนี้ถือว่าเป็น Lv สูงสุด (maxLevelAllies) */
function maxLevelAllySourceRaw(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  // BS11 ตราแห่งเพลิงรบ: ตัวกรอง "สีเดียวกัน" อ่านสีการ์ด ซึ่งอ่านเลเวลต่อ → กันวนซ้ำ (ระหว่างตรวจ = ใช้เลเวลจากคอร์)
  if (checkingMaxLevel) return null;
  checkingMaxLevel = true;
  try {
    return maxLevelAllySourceInner(state, db, cardId);
  } finally {
    checkingMaxLevel = false;
  }
}
let checkingMaxLevel = false;

function maxLevelAllySourceInner(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const owner = state.cards[cardId]!.owner;
  for (const id of state.players[owner].field) {
    if (id === cardId) continue;
    const def = db.get(state.cards[id]!.cardNo);
    if (!def.abilities.some((a) => a.kind === 'maxLevelAllies')) continue;
    if (effectsNegated(state, db, id)) continue;
    const lv = levelOf(def, state.cards[id]!.cores.length - levelCostBoost(state, db, id));
    for (const ab of def.abilities) {
      if (ab.kind !== 'maxLevelAllies' || !ab.levels.includes(lv)) continue;
      if (ab.ownAttackStepOnly && !(state.turnPlayer === owner && state.phase === 'attack')) continue;
      if (matchesFilter(state, db, cardId, ab.filter)) return { cardId: id, source: ab.source };
    }
  }
  return null;
}

/** "Lv คอสต์ +N" ที่การ์ดของคู่แข่งให้การ์ดนี้ (เทียบจำนวน Core ที่ต้องมีต่อเลเวล) */
function levelCostBoost(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  if (!state.players[card.owner].field.includes(cardId)) return 0;
  return summonLevelCostBoost(state, db, cardId);
}

/**
 * "Lv คอสต์ +N" ที่การ์ดนี้จะได้เมื่ออยู่บนสนาม (ใช้ได้กับการ์ดที่กำลังจะอัญเชิญจากมือ/แทรช/เด็คด้วย)
 * หน้าเว็บใช้แสดง Core ที่ต้องวางต่อ Lv และเตือนสูญสลาย (อาเมะโอชิโนะมิโคโตะ: Lv คอสต์ +3)
 */
/** Core ขั้นต่ำที่ต้องวางตอนการ์ดนี้ลงสนาม = Lv1 ที่พิมพ์ + "Lv คอสต์ +N" (วางไม่ถึง = ไม่ยอมให้อัญเชิญ เจ้าของโปรเจกต์กำหนด) */
export function summonMinCores(state: GameState, db: CardDatabase, cardId: string): number {
  return minCores(db.get(state.cards[cardId]!.cardNo)) + summonLevelCostBoost(state, db, cardId);
}

export function summonLevelCostBoost(state: GameState, db: CardDatabase, cardId: string, out?: StaticSource[]): number {
  const card = state.cards[cardId]!;
  const opp = state.players[card.owner === 'p1' ? 'p2' : 'p1'];
  // กันวนไม่จบ: เลเวลของการ์ดนี้ → ชีลด์ของการ์ดที่มีเลเวล → เลเวลคอสต์ของการ์ดนี้อีก (ระหว่างคำนวณถือว่าไม่มี +N)
  if (boostingLevel.has(cardId)) return 0;
  boostingLevel.add(cardId);
  try {
    return levelCostBoostOf(state, db, cardId, opp.field, out);
  } finally {
    boostingLevel.delete(cardId);
  }
}

/** การ์ดที่ให้ "Lv คอสต์ +N" กับการ์ดนี้ (อาเมะโอชิโนะมิโคโตะ / ราโชว) */
export function levelBoostSources(state: GameState, db: CardDatabase, cardId: string): StaticSource[] {
  const out: StaticSource[] = [];
  summonLevelCostBoost(state, db, cardId, out);
  return out;
}

const boostingLevel = new Set<string>();

function levelCostBoostOf(state: GameState, db: CardDatabase, cardId: string, oppField: string[], out?: StaticSource[]): number {
  let n = 0;
  for (const src of oppField) {
    for (const ab of db.get(state.cards[src]!.cardNo).abilities) {
      if (ab.kind !== 'levelCostBoost') continue;
      // ตัวกรองคอสต์ (อาเมะโอชิโนะมิโคโตะ: คอสต์ 0/2/4/7) ใช้คอสต์ที่ไม่ขึ้นกับเลเวล กันวนไม่จบ (เลเวล ↔ คอสต์ +N)
      levelBoostDepth++;
      let hit: boolean;
      try {
        hit = matchesFilter(state, db, cardId, ab.filter);
      } finally {
        levelBoostDepth--;
      }
      if (!hit) continue;
      // ชีลด์ป้องกันการเปลี่ยนแปลงของเลเวลคอสต์ได้ (กติกา 09 ข้อควรทราบ 3)
      if (effectBlocked(state, db, src, cardId)) continue;
      if (effectsNegated(state, db, src) || !ab.levels.includes(cardLevel(state, db, src))) continue;
      if (!conditionHolds(state, src, ab.if, false, false, db)) continue;
      n += ab.amount;
      out?.push({ cardId: src, source: ab.source });
    }
  }
  return n;
}

let levelBoostDepth = 0;

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
function extraSymbolsRaw(state: GameState, db: CardDatabase, cardId: string): Partial<Record<SymbolColor, number>> {
  const out: Partial<Record<SymbolColor, number>> = {};
  if (effectsNegated(state, db, cardId)) return out;
  const level = cardLevel(state, db, cardId);
  for (const ab of db.get(state.cards[cardId]!.cardNo).abilities) {
    if (ab.kind !== 'extraSymbol' || ab.granted || ab.allies || !ab.levels.includes(level) || !conditionHolds(state, cardId, ab.if, false, false, db)) continue;
    // BS12 เซ็นจู: ต่อจำนวนการ์ดของเราที่ตรงตัวกรอง (เน็กซัส)
    const k = ab.perAllies ? state.players[state.cards[cardId]!.owner].field.filter((id) => matchesFilter(state, db, id, ab.perAllies!)).length : 1;
    if (k <= 0) continue;
    out[ab.color] = (out[ab.color] ?? 0) + ab.count * k;
  }
  // การ์ดของเราที่ให้ผลกับสปิริตเราที่ตรงตัวกรองทั้งหมด (เซ็นโงคุฮิเมะ มาคินะ)
  const owner = state.cards[cardId]!.owner;
  for (const src of state.players[owner].field) {
    if (effectsNegated(state, db, src)) continue;
    const lv = cardLevel(state, db, src);
    for (const ab of db.get(state.cards[src]!.cardNo).abilities) {
      if (ab.kind !== 'extraSymbol' || !ab.allies || ab.granted || !ab.levels.includes(lv) || !conditionHolds(state, src, ab.if, false, false, db)) continue;
      if (!matchesFilter(state, db, cardId, ab.allies)) continue;
      out[ab.color] = (out[ab.color] ?? 0) + ab.count;
    }
  }
  // BS11 ฮะจิริว: เจ็มเหมือนฮะจิริว (ส่วนต่างจากเจ็มที่พิมพ์ของการ์ดนี้)
  // เจ็มของฮะจิริว = เจ็มที่พิมพ์ + เจ็มของเบรฟที่ร่วมร่างกับฮะจิริว (เจ้าของโปรเจกต์กำหนด)
  {
    const copy = statCopySource(state, db, cardId);
    if (copy) {
      const mine = db.get(state.cards[cardId]!.cardNo).symbols;
      const theirs: Partial<Record<SymbolColor, number>> = {};
      for (const id of [copy, ...state.cards[copy]!.braves]) {
        for (const [c, n] of Object.entries(db.get(state.cards[id]!.cardNo).symbols) as [SymbolColor, number][]) theirs[c] = (theirs[c] ?? 0) + n;
      }
      for (const c of new Set([...Object.keys(mine), ...Object.keys(theirs)]) as Set<SymbolColor>) {
        const d = (theirs[c] ?? 0) - (mine[c] ?? 0);
        if (d !== 0) out[c] = (out[c] ?? 0) + d;
      }
    }
  }
  // เจ็มที่เพิ่มจนจบการต่อสู้นี้ (เอฟเฟกต์ไม่บอกระยะเวลา)
  for (const t of state.cards[cardId]!.battleSymbols ?? []) out[t.color as SymbolColor] = (out[t.color as SymbolColor] ?? 0) + t.count;
  // "ในเทิร์นนี้ สปิริตของเรา...ทั้งหมดได้รับเจ็มเพิ่ม" / "สปิริตคู่แข่งทั้งหมดสูญเสียเจ็มสี..." (BS08)
  for (const t of state.turnSymbolBuffs ?? []) {
    const c = state.cards[cardId]!;
    if (t.player !== c.owner || t.turn !== state.turn || (t.filter && !matchesFilter(state, db, cardId, t.filter))) continue;
    const col = t.color as SymbolColor;
    if (t.count < 0) {
      // เสียเจ็มได้เฉพาะสีที่มีอยู่ (ของการ์ด + เบรฟ + ที่เพิ่ม)
      const have = [cardId, ...c.braves].reduce((n, x) => n + (db.get(state.cards[x]!.cardNo).symbols[col] ?? 0), 0) + (out[col] ?? 0);
      out[col] = (out[col] ?? 0) - Math.min(have, -t.count);
    } else out[col] = (out[col] ?? 0) + t.count;
  }
  // "ในเทิร์นนี้ สปิริตนี้เจ็ม...เพิ่ม"
  for (const t of state.turnSymbols ?? []) {
    if (t.cardId === cardId && t.turn === state.turn) out[t.color as SymbolColor] = (out[t.color as SymbolColor] ?? 0) + t.count;
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
  if ('handHas' in cond) {
    if (!db) return false;
    // ปกติไม่นับการ์ดที่วางแสดงนอกมือ · withShown = "ในมือ/นอกมือ"
    const pool = cond.handHas.withShown ? owner.hand : handCards(state, card.owner);
    const f = withTeamOf(state, db, cond.handHas, sourceId);
    return pool.some((id) => matchesFilter(state, db, id, f));
  }
  if ('catalyzed' in cond) return catalyzed;
  if ('selfCoresAtLeast' in cond) return card.cores.length >= cond.selfCoresAtLeast;
  if ('handAtLeast' in cond) return handCards(state, card.owner).length >= cond.handAtLeast;
  if ('deckAtLeast' in cond) return owner.deck.length >= cond.deckAtLeast;
  if ('selfAttacking' in cond) return state.battle?.attackerId === sourceId;
  if ('selfExhausted' in cond) return card.state === 'exhausted';
  if ('oppTurn' in cond) return state.turnPlayer !== card.owner;
  if ('noLifeDamageThisTurn' in cond) return !(state.lifeDamagedThisTurn ?? []).includes(card.owner);
  if ('directAttack' in cond) return !!state.battle?.direct;
  if ('selfInBattle' in cond) return !!state.battle && (state.battle.attackerId === sourceId || state.battle.blockers.includes(sourceId));
  if ('attackerFamily' in cond) {
    const b = state.battle;
    if (!b || !db) return false;
    const a = state.cards[b.attackerId]!;
    return a.owner === card.owner && db.get(a.cardNo).family.includes(cond.attackerFamily);
  }
  if ('opponentHasBurst' in cond) return allZones(state, card.owner === 'p1' ? 'p2' : 'p1').some((z) => !!z.burst);
  if ('opponentHandAtLeast' in cond) return handCards(state, card.owner === 'p1' ? 'p2' : 'p1').length >= cond.opponentHandAtLeast;
  if ('opponentColorsAtLeast' in cond) {
    if (!db) return false;
    const opp = state.players[card.owner === 'p1' ? 'p2' : 'p1'];
    const colors = new Set<string>();
    for (const id of opp.field) for (const c of [id, ...state.cards[id]!.braves]) for (const col of db.get(state.cards[c]!.cardNo).colors) colors.add(col);
    return colors.size >= cond.opponentColorsAtLeast;
  }
  if ('otherAllyHas' in cond) {
    if (!db) return false;
    const f = withTeamOf(state, db, cond.otherAllyHas, sourceId);
    return owner.field.some((id) => id !== sourceId && (f.types || isSpiritLike(db.get(state.cards[id]!.cardNo))) && matchesFilter(state, db, id, f));
  }
  if ('selfBravesAtLeast' in cond) return card.braves.length >= cond.selfBravesAtLeast;
  if ('firstAttackOfTurn' in cond) return state.firstAttack?.turn === state.turn && state.firstAttack.cardId === sourceId;
  if ('allyInBattle' in cond) {
    const b = state.battle;
    if (!b || !db) return false;
    return [b.attackerId, ...b.blockers].some((id) => state.cards[id]!.owner === card.owner && owner.field.includes(id) && matchesFilter(state, db, id, cond.allyInBattle));
  }
  if ('allyHas' in cond) {
    if (!db) return false;
    const f = withTeamOf(state, db, cond.allyHas, sourceId);
    return owner.field.some((id) => (f.types || isSpiritLike(db.get(state.cards[id]!.cardNo))) && matchesFilter(state, db, id, f));
  }
  if ('trashHas' in cond) {
    if (!db) return false;
    // 2VS2: "แทรชเรา" = แทรชของทั้งทีม (เจ้าของโปรเจกต์กำหนด)
    return teamTrash(state, card.owner).some((id) => matchesFilter(state, db, id, cond.trashHas));
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
  // ---------------- BS07
  if ('songsAtLeast' in cond) return (owner.songs ?? []).length >= cond.songsAtLeast;
  if ('inUnit' in cond) return !!state.battle?.unit?.includes(sourceId);
  if ('alliesMatchAtLeast' in cond) {
    if (!db) return false;
    const f = withTeamOf(state, db, cond.alliesMatchAtLeast.filter, sourceId);
    return owner.field.filter((id) => !(f.notSelf && id === sourceId) && (f.types || isSpiritLike(db.get(state.cards[id]!.cardNo))) && matchesFilter(state, db, id, f)).length >= cond.alliesMatchAtLeast.count;
  }
  if ('kageTargeted' in cond) return card.kageTurn === state.turn;
  // ---------------- BS09
  if ('any' in cond) return cond.any.some((c) => conditionHolds(state, sourceId, c, paidWithSoul, catalyzed, db));
  if ('trashAtLeast' in cond) return teamTrash(state, card.owner).length >= cond.trashAtLeast;
  // ---------------- BS10
  if ('ownGemColor' in cond) return !!db && ownGemColors(state, db, card.owner).has(cond.ownGemColor);
  if ('trashCoreAtLeast' in cond) return allZones(state, card.owner).flatMap((z) => z.trashCores).filter((c) => !state.cores[c]!.isSoul).length >= cond.trashCoreAtLeast;
  // ---------------- BS11
  // ---------------- BS12
  // 2VS2: "มีเบิร์สของเราเซ็ทอยู่" นับเบิร์สของทั้งทีม (เจ้าของโปรเจกต์กำหนด)
  if ('ownBurstSet' in cond) return allZones(state, card.owner).some((z) => z.burst !== null && z.burst !== undefined);
  // ---------------- BS13
  if ('rush' in cond) {
    if (!db) return false;
    // มิดไนท์-ซัน: [ร่วมร่าง] Rush ไม่สนเงื่อนไข
    if (owner.field.includes(sourceId) && card.braves.some((b) => db.get(state.cards[b]!.cardNo).abilities.some((a) => a.kind === 'rushIgnore'))) return true;
    return (fieldSymbols(state, db, card.owner)[cond.rush.color] ?? 0) >= cond.rush.count;
  }
  if ('ownMainStep' in cond) return state.phase === 'main' && state.turnPlayer === card.owner;
  if ('assaultAlt' in cond) return !!db && state.phase === 'attack' && state.turnPlayer === card.owner && staticSources(state, db, [card.owner], 'assaultTrashNexus').length > 0;
  if ('onlyGemColor' in cond) {
    if (!db) return false;
    const colors = ownGemColors(state, db, card.owner);
    return colors.size === 1 && colors.has(cond.onlyGemColor);
  }
  // ตรวจได้เฉพาะตอนประมวลผลเอฟเฟกต์ในคิว (ดู holds ใน effects.ts)
  if ('subjectIs' in cond || 'lifeLostByOpponentEffect' in cond) return false;
  if ('ownGemColorsAtLeast' in cond) return !!db && gemColorCount(state, db, card.owner) >= cond.ownGemColorsAtLeast;
  if ('selfIs' in cond) return !!db && matchesFilter(state, db, sourceId, cond.selfIs);
  if ('usedFewerThan' in cond) return (state.usedOncePerTurn ?? []).filter((k) => k === `${sourceId}:${cond.usedFewerThan.key}`).length < cond.usedFewerThan.max;
  if ('onceFree' in cond) return !(state.usedOncePerTurn ?? []).includes(`${sourceId}:${cond.onceFree}`);
  // ตรวจได้เฉพาะตอนประมวลผลเอฟเฟกต์ในคิว (ดู holds ใน effects.ts)
  if ('summonedByOnStage' in cond || 'summonedBy' in cond) return false;
  if ('catalyzable' in cond) {
    if (!card.cores.some((id) => state.cores[id]!.isSoul) || !db) return false;
    // 2VS2: Catalyze สั่งใช้เบิร์สของเพื่อนร่วมทีมได้ (เจ้าของโปรเจกต์กำหนด)
    return allZones(state, card.owner).some((z) => {
      if (!z.burst) return false;
      const def = db.get(state.cards[z.burst]!.cardNo);
      return (cond.catalyzable === 'any' || def.colors.includes(cond.catalyzable)) && def.abilities.some((a) => a.kind === 'burst' && a.soul);
    });
  }
  return paidWithSoul;
}

/**
 * BP ปัจจุบันบนสนาม = BP ตามเลเวล + BP+ ในเทิร์นนี้ + BP+ ถาวรจากการ์ดของเจ้าของ
 */
function currentBpRaw(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  if (!isSpiritLike(def)) return 0;
  const ownLevel = cardLevel(state, db, cardId);
  // BS11 ฮะจิริว: BP (ที่พิมพ์ตามเลเวล) เหมือนฮะจิริว
  const copy = statCopySource(state, db, cardId);
  const baseDef = copy ? db.get(state.cards[copy]!.cardNo) : def;
  let bp = (baseDef.levels.find((l) => l.level === ownLevel)?.bp ?? 0) + card.turnBp + (card.battleBp ?? 0);
  // "ในเทิร์นนี้ สปิริตเราทั้งหมด BP+": รวมตัวที่ลงสนามหลังเอฟเฟกต์ทำงาน
  for (const b of state.turnBuffs ?? []) {
    if (b.player === card.owner && b.turn === state.turn && (def.type === 'spirit' || def.type === 'brave') && (!b.filter || matchesFilter(state, db, cardId, b.filter)))
      bp += b.amount;
  }
  // เอฟเฟกต์ติดตัวที่ Brave ให้ผู้ร่วมร่าง
  for (const b of card.braves) bp += db.get(state.cards[b]!.cardNo).braveCondition?.bp ?? 0;
  // BS11 ฮะจิริว: BP+ ที่เบรฟให้ฮะจิริวก็ก๊อปปี้ด้วย (เหมือนเจ็ม: เจ้าของโปรเจกต์กำหนด)
  if (copy) for (const b of state.cards[copy]!.braves) bp += db.get(state.cards[b]!.cardNo).braveCondition?.bp ?? 0;
  const ownerP = state.players[card.owner];
  // การ์ดบนสนาม + เบรฟที่ร่วมร่างอยู่ (ความสามารถที่ผู้ร่วมร่างได้รับ: "สปิริตนี้" = ผู้ร่วมร่าง)
  const sources = ownerP.field.flatMap((f) => [{ srcId: f, holder: f }, ...state.cards[f]!.braves.map((b) => ({ srcId: b, holder: f }))]);
  for (const { srcId, holder } of sources) {
    const src = state.cards[srcId]!;
    const srcDef = db.get(src.cardNo);
    const isBrave = srcId !== holder;
    const level = isBrave ? 0 : cardLevel(state, db, srcId);
    if (effectsNegated(state, db, holder)) continue;
    for (const ab of srcDef.abilities) {
      if (ab.kind !== 'staticBp') continue;
      if (isBrave ? !ab.granted : ab.granted || !ab.levels.includes(level)) continue;
      if (!conditionHolds(state, holder, ab.if, false, false, db)) continue;
      const scope = ab.scope;
      const isSpirit = def.type === 'spirit' || def.type === 'brave';
      const applies =
        'self' in scope
          ? holder === cardId
          : 'ownFamily' in scope
            ? def.type === 'spirit' && cardFamilies(state, db, cardId).includes(scope.ownFamily)
            : 'ownNamed' in scope
              ? isSpirit && nameHas(def, scope.ownNamed)
              : 'own' in scope
                ? (isSpirit || (def.type === 'ultimate' && !!scope.own.types?.includes('ultimate'))) && matchesFilter(state, db, cardId, scope.own)
                : 'sameTeam' in scope
                  ? isSpirit && (holder === cardId || shareTeam(db.get(state.cards[holder]!.cardNo), def))
                  : isSpirit &&
                    (!scope.ownSpirits.color || cardColors(state, db, cardId).includes(scope.ownSpirits.color)) &&
                    (!scope.ownSpirits.family || def.family.includes(scope.ownSpirits.family)) &&
                    (!scope.ownSpirits.soul || card.cores.some((x) => state.cores[x]!.isSoul));
      const perAllies = ab.perAllies ? ownerP.field.filter((x) => matchesFilter(state, db, x, ab.perAllies!)).length : 1;
      const perGem = ab.perGemColors ? gemColorCount(state, db, card.owner) : 1;
      if (applies) bp += ab.amount * (ab.perSongs ? (ownerP.songs ?? []).length : 1) * perAllies * perGem;
    }
  }
  // BS10 สวนลอยฟ้า Lv2: แอทแท็คสเต็ป สปิริตของคู่แข่งที่ต่อสู้อยู่ BP-N
  if (state.phase === 'attack' && state.battle && (state.battle.attackerId === cardId || state.battle.blockers.includes(cardId)) && (def.type === 'spirit' || def.type === 'brave')) {
    for (const src of staticSources(state, db, [card.owner === 'p1' ? 'p2' : 'p1'], 'oppBattleBp')) {
      const ab = db.get(state.cards[src.cardId]!.cardNo).abilities.find((a) => a.kind === 'oppBattleBp' && a.source === src.source);
      if (ab?.kind === 'oppBattleBp') bp += ab.amount;
    }
  }
  return Math.max(0, bp);
}

/** การ์ดตรงตัวกรองหรือไม่ (maxBp ใช้ BP ปัจจุบันบนสนาม) */
/** คอสต์ของการ์ดบนสนาม (คอสต์ที่พิมพ์ + เอฟเฟกต์ "คอสต์ +N" ของการ์ดฝ่ายเดียวกัน) การ์ดนอกสนาม = คอสต์ที่พิมพ์ */
export function fieldCost(state: GameState, db: CardDatabase, cardId: string, ignoreBraveCost = false, out?: (StaticSource & { amount: number })[]): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const owner = state.players[card.owner];
  if (!owner.field.includes(cardId)) return def.cost;
  let cost = def.cost;
  // สปิริตที่ร่วมร่างกับ Brave: คอสต์ = คอสต์สปิริต + คอสต์ Brave
  if (!ignoreBraveCost) for (const b of card.braves) cost += braveFieldCost(db, state.cards[b]!.cardNo);
  // ระหว่างคำนวณ Lv คอสต์ +N: ไม่นับ "คอสต์ +N" ที่ต้องใช้เลเวล (กันวนไม่จบ)
  if (levelBoostDepth > 0) return cost;
  for (const id of owner.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'costBoost' || !ab.levels.includes(level)) continue;
      if (!conditionHolds(state, id, ab.if, false, false, db) || !matchesFilter(state, db, cardId, ab.filter)) continue;
      cost += ab.amount;
      out?.push({ cardId: id, source: ab.source, amount: ab.amount });
    }
  }
  return cost;
}

/** คอสต์ของเบรฟที่ร่วมร่างอยู่ (BS12 โอคุริดาระ: "[ร่วมร่าง] เบรฟนี้ถือว่ามีคอสต์ 2") */
export function braveFieldCost(db: CardDatabase, cardNo: string): number {
  const def = db.get(cardNo);
  const as = def.abilities.find((a) => a.kind === 'braveCostAs');
  return as?.kind === 'braveCostAs' ? as.cost : def.cost;
}

/** การ์ดที่ทำให้คอสต์บนสนามของการ์ดนี้เปลี่ยน ("เน็กซัสของเราทั้งหมดคอสต์ +2" มิซึมาตะโอโรจิ) พร้อมจำนวน */
export function costBoostSources(state: GameState, db: CardDatabase, cardId: string): (StaticSource & { amount: number })[] {
  const out: (StaticSource & { amount: number })[] = [];
  fieldCost(state, db, cardId, false, out);
  return out;
}

export function matchesFilter(state: GameState, db: CardDatabase, cardId: string, filter: CardFilter): boolean {
  const def = db.get(state.cards[cardId]!.cardNo);
  // การ์ดในแทรช: ใช้คอสต์ในแทรช ("การ์ดนี้ในแทรชถือว่ามีคอสต์ N": นาราคุ ↔ คุรามะ "คอสต์ไม่เกิน 4 ในแทรช")
  const inTrash = ownerZones(state, cardId).trashCards.includes(cardId);
  const costOf = () => (inTrash ? baseCost(state, db, cardId) : fieldCost(state, db, cardId, !!filter.ignoreBraveCost));
  // "การ์ดสปิริตนี้ ถือว่าเป็นการ์ดเมจิคด้วย" (ยูคิเกิร์ล / โบคุโบคุ)
  if (filter.types && !filter.types.includes(def.type) && !(filter.types.includes('magic') && def.abilities.some((a) => a.kind === 'alsoMagic'))) return false;
  // เผ่า (รวมเผ่าที่ได้รับ: โอโทโนะซามะ)
  const fam = filter.family || filter.families || filter.notFamilies ? cardFamilies(state, db, cardId) : def.family;
  if (filter.family && !fam.includes(filter.family)) return false;
  if (filter.families && !filter.families.some((f) => fam.includes(f))) return false;
  if (filter.notFamilies && filter.notFamilies.some((f) => fam.includes(f))) return false;
  if (filter.state && state.cards[cardId]!.state !== filter.state) return false;
  if (filter.maxBp !== undefined && currentBp(state, db, cardId) > filter.maxBp) return false;
  if (filter.minCost !== undefined && costOf() < filter.minCost) return false;
  if (filter.maxCost !== undefined && costOf() > filter.maxCost) return false;
  if (filter.cost !== undefined && costOf() !== filter.cost) return false;
  if (filter.nameIncludes && !nameHas(def, filter.nameIncludes)) return false;
  if (filter.names && !filter.names.includes(def.name)) return false;
  if (filter.hasBurst && !def.burst) return false;
  if (filter.color && !cardColors(state, db, cardId).includes(filter.color)) return false;
  if (filter.minBp !== undefined && currentBp(state, db, cardId) < filter.minBp) return false;
  const card = state.cards[cardId]!;
  const hasSoul = card.cores.some((id) => state.cores[id]!.isSoul);
  if (filter.soul && !hasSoul) return false;
  if (filter.noSoul && hasSoul) return false;
  if (filter.hasEvolution && !def.abilities.some((a) => a.kind === 'evolution')) return false;
  if (filter.noBurst && def.burst) return false;
  if (filter.excludeNames && filter.excludeNames.includes(def.name)) return false;
  if (filter.anyOf && !filter.anyOf.some((f) => matchesFilter(state, db, cardId, f))) return false;
  if (filter.maxCores !== undefined && card.cores.length > filter.maxCores) return false;
  if (filter.noBraves && card.braves.length > 0) return false;
  if (filter.minSymbols !== undefined && cardSymbolTotal(state, db, cardId) < filter.minSymbols) return false;
  // ---------------- BS07
  if (filter.team && !def.teams.includes(filter.team)) return false;
  if (filter.teamsAny && !filter.teamsAny.some((t) => def.teams.includes(t))) return false;
  if (filter.magicType && !def.magicTypes.includes(filter.magicType)) return false;
  if (filter.hasOnStage && !def.abilities.some((a) => a.kind === 'onStage' && a.keyword)) return false;
  if (filter.hasSoloPart && !hasSoloPart(def)) return false;
  if (filter.notShown && (state.shownCards ?? []).includes(cardId)) return false;
  if (filter.excludeIds?.includes(cardId)) return false;
  // ---------------- BS08
  if (filter.textIncludes && !filter.textIncludes.some((w) => textHas(def, w))) return false;
  if (filter.noEffectText && effectText(def).trim() !== '') return false;
  if (filter.notInBattle && state.battle && (state.battle.attackerId === cardId || state.battle.blockers.includes(cardId))) return false;
  // ---------------- BS09
  if (filter.minCores !== undefined && card.cores.length < filter.minCores) return false;
  if (filter.notColors && cardColors(state, db, cardId).some((c) => filter.notColors!.includes(c))) return false;
  if (filter.minColors && cardColors(state, db, cardId).length < filter.minColors) return false;
  // ---------------- BS11
  if (filter.hasUltraShield && !hasUltraShield(state, db, cardId)) return false;
  if (filter.minReductionColors !== undefined && Object.values(def.reduction).filter((v) => (v ?? 0) > 0).length < filter.minReductionColors) return false;
  if (filter.sameColorAlly) {
    const owner = state.players[state.cards[cardId]!.owner];
    const mine = cardColors(state, db, cardId);
    if (!owner.field.some((x) => x !== cardId && matchesFilter(state, db, x, filter.sameColorAlly!) && cardColors(state, db, x).some((c) => mine.includes(c)))) return false;
  }
  if (filter.inBattle && !(state.battle && (state.battle.attackerId === cardId || state.battle.blockers.includes(cardId)))) return false;
  if (filter.highestBp) {
    const owner = state.players[card.owner];
    if (!owner.field.includes(cardId)) return false;
    const bp = currentBp(state, db, cardId);
    if (owner.field.some((x) => x !== cardId && isSpiritLike(db.get(state.cards[x]!.cardNo)) && currentBp(state, db, x) > bp)) return false;
  }
  return true;
}

/** เผ่าของการ์ด รวมเผ่าที่ได้รับจากเอฟเฟกต์ (BS09 โอโทโนะซามะ: มีโซลคอร์ = ได้รับเผ่า [ผู้เป็นนาย]) */
function cardFamiliesRaw(state: GameState, db: CardDatabase, cardId: string): string[] {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  if (!state.players[card.owner].field.includes(cardId)) return def.family;
  // BS10 ไยบะโนะคามิ: การ์ดอื่นของเราให้เผ่ากับการ์ดที่ตรงตัวกรอง
  const given: string[] = [];
  for (const src of state.players[card.owner].field) {
    if (src === cardId) continue;
    const sdef = db.get(state.cards[src]!.cardNo);
    if (!sdef.abilities.some((a) => a.kind === 'familyAlso' && a.allies)) continue;
    if (effectsNegated(state, db, src)) continue;
    const slv = levelOf(sdef, state.cards[src]!.cores.length - levelCostBoost(state, db, src));
    for (const a of sdef.abilities) {
      if (a.kind !== 'familyAlso' || !a.allies || !a.levels.includes(slv) || !conditionHolds(state, src, a.if, false, false, db)) continue;
      if (def.type === a.allies.types?.[0] || (!a.allies.types && isSpiritLike(def))) given.push(a.family);
    }
  }
  if (given.length) return [...new Set([...def.family, ...given])];
  if (!def.abilities.some((a) => a.kind === 'familyAlso') || effectsNegated(state, db, cardId)) return def.family;
  const lv = levelOf(def, card.cores.length - levelCostBoost(state, db, cardId));
  const extra = def.abilities.flatMap((a) => (a.kind === 'familyAlso' && !a.allies && a.levels.includes(lv) && conditionHolds(state, cardId, a.if, false, false, db) ? [a.family] : []));
  return extra.length ? [...def.family, ...extra.filter((f) => !def.family.includes(f))] : def.family;
}

/** การ์ดมี Solo Part */
export function hasSoloPart(def: CardDef): boolean {
  return def.abilities.some((a) => a.kind === 'destroyImmune' && a.soloPart);
}

/** การ์ดสองใบมีทีมเดียวกันอย่างน้อย 1 ทีม */
export function shareTeam(a: CardDef, b: CardDef): boolean {
  return a.teams.some((t) => b.teams.includes(t));
}

/** ตัวกรอง sameTeamAs: แทนด้วยทีมของการ์ด refId (ไม่มีทีม = ไม่มีการ์ดใดตรง) */
export function withTeamOf(state: GameState, db: CardDatabase, f: CardFilter, selfId: string, subjectId?: string): CardFilter {
  // BS08 "มีเผ่าเดียวกันกับสปิริตนี้"
  if (f.sameFamilyAs) {
    const fam = state.cards[selfId] ? db.get(state.cards[selfId]!.cardNo).family : [];
    const { sameFamilyAs: _f, ...rest } = f;
    return withTeamOf(state, db, { ...rest, families: fam.length ? fam : ['\u0000'] }, selfId, subjectId);
  }
  if (!f.sameTeamAs) return f;
  const ref = f.sameTeamAs === 'self' ? selfId : subjectId;
  const teams = ref && state.cards[ref] ? db.get(state.cards[ref]!.cardNo).teams : [];
  const { sameTeamAs: _, ...rest } = f;
  return { ...rest, teamsAny: teams.length ? teams : ['\u0000'] };
}

/**
 * การ์ดของเราที่ทำให้การ์ดนี้ไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (Solo Part / ราเควล)
 */
export function destroyImmuneSource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  for (const id of state.players[card.owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const lv = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'destroyImmune' || !ab.levels.includes(lv) || !conditionHolds(state, id, ab.if, false, false, db)) continue;
      const ok = 'ownNamed' in ab.scope ? nameHas(def, ab.scope.ownNamed) : matchesFilter(state, db, cardId, ab.scope.own);
      if (ok && isSpiritLike(def)) return { cardId: id, source: ab.source };
    }
  }
  return null;
}

/** On Stage ของการ์ดบนสนามนี้ที่ใช้ได้ตอนนี้ (แอทแท็คสเต็ปของเรา ไม่มีการต่อสู้ค้าง สปิริตต้องสั่งโจมตีได้) */
export function onStageAbilities(state: GameState, db: CardDatabase, player: PlayerId, cardId: string): Extract<Ability, { kind: 'onStage' }>[] {
  const card = state.cards[cardId];
  if (!card || card.owner !== player || !state.players[player].field.includes(cardId)) return [];
  if (state.winner || state.choice || state.battle || state.phase !== 'attack' || state.turnPlayer !== player || state.queue.length > 0) return [];
  if (!canAttackWith(state, db, cardId) || effectsNegated(state, db, cardId)) return [];
  const level = cardLevel(state, db, cardId);
  return db
    .get(card.cardNo)
    .abilities.filter((a): a is Extract<Ability, { kind: 'onStage' }> => a.kind === 'onStage' && a.levels.includes(level) && conditionHolds(state, cardId, a.if, false, false, db));
}

/** โนอา-เฟลอร์: การ์ดของเราที่ทำให้ผู้โจมตีนี้ไม่ถูกป้องกันโดยการ์ดนี้ (คอสต์ไม่เกิน N) */
export function costBlockBan(state: GameState, db: CardDatabase, attackerId: string, blockerId: string): StaticSource | null {
  const owner = state.cards[attackerId]!.owner;
  if (state.turnPlayer !== owner || state.phase !== 'attack') return null;
  for (const id of state.players[owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const lv = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'unblockableByCost' || !ab.levels.includes(lv) || !conditionHolds(state, id, ab.if, false, false, db)) continue;
      if (matchesFilter(state, db, attackerId, ab.attacker) && fieldCost(state, db, blockerId) <= ab.maxCost) return { cardId: id, source: ab.source };
    }
  }
  return null;
}

/** จำนวนชื่อทีมที่แตกต่างกันของสปิริตเรา */
export function distinctTeams(state: GameState, db: CardDatabase, player: PlayerId): number {
  const set = new Set<string>();
  for (const id of state.players[player].field) {
    const d = db.get(state.cards[id]!.cardNo);
    if (isSpiritLike(d)) for (const t of d.teams) set.add(t);
  }
  return set.size;
}

/**
 * เอฟเฟกต์ของการ์ดบนสนามนี้ถูกปิดหรือไม่ (เมียวโอดาบแดง: "แอทแท็คสเต็ปของเรา: สปิริต/อัลติเมทคอสต์ไม่เกิน N ของคู่แข่ง เอฟเฟกต์จะไม่ทำงาน")
 * การ์ดที่ปิดได้คือของฝ่ายที่ไม่ใช่ผู้เล่นเทิร์น จึงไม่วนตรวจกันเอง
 */
function effectsNegatedRaw(state: GameState, db: CardDatabase, cardId: string): boolean {
  // BS11 นปเปะระเกิร์ล: ในเทิร์นนี้การ์ดนี้สูญเสียเอฟเฟกต์ทั้งหมด
  if ((state.negatedCards ?? []).some((e) => e.cardId === cardId && e.turn === state.turn)) return true;
  // "ในเทิร์นนี้ สปิริต/เน็กซัสคู่แข่งทั้งหมดจะสูญเสียเอฟเฟกต์ทั้งหมด" (ดาบชีพอัสนี มิคาซึกิ)
  if (state.effectsLost?.length) {
    const c = state.cards[cardId];
    if (c && state.effectsLost.some((e) => e.player === c.owner && e.turn === state.turn)) {
      const t = db.get(c.cardNo).type;
      const onField = state.players[c.owner].field.includes(cardId) || !!braveHostOf(state, cardId);
      if (onField && t !== 'magic') return true;
    }
  }
  // เน็กซัส: "เน็กซัสทั้งหมดของคู่แข่งที่ไม่มีคำว่า ... ในชื่อจะสูญเสียเอฟเฟกต์ทั้งหมด"
  {
    const c = state.cards[cardId];
    if (c && !checkingNegation && db.get(c.cardNo).type === 'nexus' && state.players[c.owner].field.includes(cardId)) {
      const def = db.get(c.cardNo);
      const opp = state.players[c.owner === 'p1' ? 'p2' : 'p1'];
      checkingNegation = true;
      try {
        const hit = opp.field.some((id) =>
          db
            .get(state.cards[id]!.cardNo)
            .abilities.some(
              (a) =>
                a.kind === 'negateOpponentNexus' &&
                !nameHas(def, a.unlessNamed) &&
                a.levels.includes(cardLevel(state, db, id)) &&
                conditionHolds(state, id, a.if, false, false, db),
            ),
        );
        if (hit) return true;
      } finally {
        checkingNegation = false;
      }
    }
  }
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
function fieldSymbolsRaw(state: GameState, db: CardDatabase, player: PlayerId): Partial<Record<SymbolColor, number>> {
  const out: Partial<Record<SymbolColor, number>> = {};
  // ทิพบอล: ในเทิร์นนี้การ์ดที่มีเจ็มตั้งแต่ N เม็ด ถือว่ามีเจ็ม 0
  const zero = state.symbolsZero?.turn === state.turn ? state.symbolsZero.minSymbols : null;
  const zeroed = (id: string) => zero !== null && cardSymbolTotal(state, db, id) >= zero;
  // ในการต่อสู้นี้ เจ็มของการ์ดนี้ถูกเปลี่ยน (โอคิดาคุ): ใช้ค่าที่เปลี่ยนแทนเจ็มของการ์ดและ Brave ทั้งหมด
  const override = state.battle?.symbolOverride;
  // Brave ที่ร่วมร่าง: ผู้ร่วมร่างได้รับ gem symbol ของ Brave ด้วย
  for (const f of state.players[player].field) {
    if (zeroed(f) || symbolsZeroCard(state, f, db)) continue;
    if (override?.cardId === f) {
      out[override.color as SymbolColor] = (out[override.color as SymbolColor] ?? 0) + override.count;
      continue;
    }
    for (const id of [f, ...state.cards[f]!.braves]) {
      const def = db.get(state.cards[id]!.cardNo);
      for (const [color, n] of Object.entries(def.symbols) as [SymbolColor, number][]) {
        out[color] = (out[color] ?? 0) + n;
      }
    }
  }
  for (const id of state.players[player].field) {
    if (override?.cardId === id || zeroed(id)) continue;
    for (const [color, n] of Object.entries(extraSymbols(state, db, id)) as [SymbolColor, number][]) {
      out[color] = (out[color] ?? 0) + n;
    }
  }
  // BS11 ยาเท็นโดว: เจ็มทั้งหมดกลายเป็นสีเดียว (เจ็มอัลติเมทยังเป็นเจ็มอัลติเมท)
  {
    const all = allColorOverride(state, db);
    if (all) {
      const total = (Object.entries(out) as [SymbolColor, number][]).reduce((n, [c, v]) => n + (c === 'ultimate' ? 0 : v), 0);
      return { ...(out.ultimate ? { ultimate: out.ultimate } : {}), ...(total > 0 ? { [all]: total } : {}) };
    }
  }
  // "เจ็มของสปิริตนี้ถือว่าเป็นเจ็มสี...ด้วย" (คานิคอง) · นับทุกเจ็มของการ์ดนี้ รวมเจ็มจากเบรฟที่ร่วมร่างและจากเอฟเฟกต์ (เจ้าของโปรเจกต์กำหนด)
  // BS13: ถือว่าเป็นหลายสีได้ (อิเทะคาชะ "สีแดง/ม่วงด้วย") = เจ็มนับเป็นทุกสีที่ระบุ
  for (const id of state.players[player].field) {
    if (override?.cardId === id || zeroed(id) || !hasSymbolAlso(db, state.cards[id]!.cardNo)) continue;
    for (const g of cardGems(state, db, id).gems) for (const c of g.also) out[c] = (out[c] ?? 0) + g.count;
  }
  return out;
}

/** จำนวนเจ็มทั้งหมดของการ์ดบนสนามนี้ (รวม Brave และเจ็มที่เพิ่มจากเอฟเฟกต์) */
export function cardSymbolTotal(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  let n = 0;
  for (const id of [cardId, ...card.braves]) n += symbolCount(db.get(state.cards[id]!.cardNo));
  for (const v of Object.values(extraSymbols(state, db, cardId))) n += v ?? 0;
  return n;
}

/** การ์ดนี้มี "เจ็มถือว่าเป็นสี...ด้วย" (เช็กเร็ว: ไม่มี = เจ็มทุกเม็ดมีสีเดียว) */
const symbolAlsoCache = new Map<string, boolean>();
function hasSymbolAlso(db: CardDatabase, cardNo: string): boolean {
  let v = symbolAlsoCache.get(cardNo);
  if (v === undefined) {
    v = db.get(cardNo).abilities.some((a) => a.kind === 'symbolAlsoColor');
    symbolAlsoCache.set(cardNo, v);
  }
  return v;
}

/** เจ็มกลุ่มหนึ่งบนการ์ดบนสนาม: สี จำนวน และสีที่ "ถือว่าเป็นสี...ด้วย" */
export interface CardGem {
  color: SymbolColor;
  count: number;
  /** เจ็มของสปิริตนี้ถือว่าเป็นสีเหล่านี้ด้วย (symbolAlsoColor: ทุกเจ็มของการ์ดนี้ รวมจากเบรฟ/เอฟเฟกต์) */
  also: SymbolColor[];
  /** มาจากเบรฟที่ร่วมร่าง / เอฟเฟกต์ (ไม่ใช่เจ็มที่พิมพ์บนการ์ดตัวเอง) */
  added?: boolean;
}

/**
 * เจ็มของการ์ดบนสนามใบนี้สำหรับแสดงผล (กติกาเดียวกับ fieldSymbolsRaw: เบรฟ, เจ็มจากเอฟเฟกต์, เจ็มเป็น 0, โอคิดาคุ, ยาเท็นโดว)
 * zeroed = เจ็มของการ์ดนี้ถูกทำให้เป็น 0 ในเทิร์นนี้ (มีเจ็มจริงแต่ไม่นับ)
 */
export function cardGems(state: GameState, db: CardDatabase, cardId: string): { gems: CardGem[]; zeroed: boolean } {
  const card = state.cards[cardId];
  if (!card) return { gems: [], zeroed: false };
  const zero = state.symbolsZero?.turn === state.turn ? state.symbolsZero.minSymbols : null;
  if (zero !== null && cardSymbolTotal(state, db, cardId) >= zero) return { gems: [], zeroed: true };
  const override = state.battle?.symbolOverride;
  if (override?.cardId === cardId) return { gems: override.count > 0 ? [{ color: override.color as SymbolColor, count: override.count, also: [] }] : [], zeroed: false };
  const def = db.get(card.cardNo);
  const own: Partial<Record<SymbolColor, number>> = {};
  const added: Partial<Record<SymbolColor, number>> = {};
  const add = (into: Partial<Record<SymbolColor, number>>, color: SymbolColor, n: number) => {
    if (n > 0) into[color] = (into[color] ?? 0) + n;
  };
  const baseZero = symbolsZeroCard(state, cardId, db);
  if (!baseZero) {
    for (const [c, n] of Object.entries(def.symbols) as [SymbolColor, number][]) add(own, c, n);
    for (const b of card.braves) for (const [c, n] of Object.entries(db.get(state.cards[b]!.cardNo).symbols) as [SymbolColor, number][]) add(added, c, n);
  }
  for (const [c, n] of Object.entries(extraSymbols(state, db, cardId)) as [SymbolColor, number][]) add(added, c, n);
  const list = (m: Partial<Record<SymbolColor, number>>) => Object.entries(m) as [SymbolColor, number][];
  if (list(own).length === 0 && list(added).length === 0) return { gems: [], zeroed: baseZero && symbolCount(def) > 0 };
  // ยาเท็นโดว: เจ็มทั้งหมดเป็นสีเดียว (เจ็มอัลติเมทคงเดิม)
  const all = allColorOverride(state, db);
  if (all) {
    const total = [...list(own), ...list(added)].reduce((n, [c, v]) => n + (c === 'ultimate' ? 0 : v), 0);
    const ult = (own.ultimate ?? 0) + (added.ultimate ?? 0);
    return { gems: [...(total ? [{ color: all as SymbolColor, count: total, also: [] }] : []), ...(ult ? [{ color: 'ultimate' as SymbolColor, count: ult, also: [] }] : [])], zeroed: false };
  }
  const lv = cardLevel(state, db, cardId);
  const also = effectsNegated(state, db, cardId) ? [] : def.abilities.flatMap((a) => (a.kind === 'symbolAlsoColor' && a.levels.includes(lv) ? [a.color as SymbolColor] : []));
  // "เจ็มของสปิริตนี้ถือว่าเป็นสี...ด้วย" มีผลกับทุกเจ็มของการ์ดนี้ (รวมเจ็มจากเบรฟ/เอฟเฟกต์) · เจ็มอัลติเมทไม่เปลี่ยน
  const alsoFor = (c: SymbolColor) => (c === 'ultimate' ? [] : [...new Set(also.filter((x) => x !== c))]);
  const gems: CardGem[] = list(own).map(([c, n]) => ({ color: c, count: n, also: alsoFor(c) }));
  for (const [c, n] of list(added)) gems.push({ color: c, count: n, also: alsoFor(c), added: true });
  return { gems, zeroed: false };
}

/** คอสต์ที่ต้องจ่ายจริงหลังลดด้วย gem symbol บนสนาม (หมวด 3 ข้อ 1-4) */
/**
 * คอสต์ของการ์ด (ก่อนลดคอสต์): การ์ดในแทรช = "ถือว่ามีคอสต์" จากสปิริตบนสนาม / จากตัวการ์ดเอง
 */
export function baseCost(state: GameState, db: CardDatabase, cardId: string): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const owner = ownerZones(state, cardId);
  // การ์ดที่วางแสดงนอกมือ (อันโกะ) ไม่ใช่การ์ดในมือ: ไม่รับผล "การ์ดในมือเรา...คอสต์" (กติกา 14 นอกมือ)
  const zone = owner.trashCards.includes(cardId) ? 'trash' : owner.hand.includes(cardId) && !(state.shownCards ?? []).includes(cardId) ? 'hand' : null;
  // BS07: "การ์ดสปิริตนี้, เมื่อมี ... ของเราอยู่, จะถือว่ามีคอสต์ N" / "ในเทิร์นนี้ การ์ด...ในมือ/นอกมือเรา คอสต์ -1" (ในมือหรือนอกมือ)
  if (owner.hand.includes(cardId)) {
    const own = def.abilities.find((a) => a.kind === 'selfCostIf');
    let c = own && own.kind === 'selfCostIf' && conditionHolds(state, cardId, own.if, false, false, db) ? own.cost : null;
    const turnDelta = (state.turnHandCost ?? [])
      .filter((t) => t.player === card.owner && t.turn === state.turn && matchesFilter(state, db, cardId, t.filter))
      .reduce((n, t) => n + t.delta, 0);
    if (c !== null || turnDelta !== 0) {
      if (c === null) c = zone === 'hand' ? baseCostInner(state, db, cardId, zone) : def.cost;
      return Math.max(0, c + turnDelta);
    }
  }
  return baseCostInner(state, db, cardId, zone);
}

function baseCostInner(state: GameState, db: CardDatabase, cardId: string, zone: 'trash' | 'hand' | null): number {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const owner = state.players[card.owner];
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
  // BS13 อิจิบันสเปียร์: "การ์ด...ในมือเราถือว่ามีคอสต์ N"
  if (zone === 'hand') {
    for (const id of owner.field) {
      if (effectsNegated(state, db, id)) continue;
      const level = cardLevel(state, db, id);
      for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
        if (ab.kind !== 'handCostSet' || !ab.levels.includes(level) || !matchesFilter(state, db, cardId, ab.filter)) continue;
        cost = cost === null ? ab.cost : Math.min(cost, ab.cost);
      }
    }
  }
  if (cost !== null) return cost;
  if (zone === 'hand') {
    // "แอทแท็คสเต็ปของเรา: การ์ดเมจิคทั้งหมดในมือเราคอสต์ -1"
    let delta = 0;
    for (const id of owner.field) {
      if (effectsNegated(state, db, id)) continue;
      const level = cardLevel(state, db, id);
      for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
        if (ab.kind !== 'handCostDelta' || !ab.levels.includes(level) || !matchesFilter(state, db, cardId, ab.filter)) continue;
        if (ab.ownAttackStepOnly && (state.phase !== 'attack' || state.turnPlayer !== card.owner)) continue;
        delta += ab.delta;
      }
    }
    delta += handCostPerDelta(state, db, cardId);
    return Math.max(0, def.cost + delta);
  }
  const own = def.abilities.find((a) => a.kind === 'trashCost');
  return own && own.kind === 'trashCost' ? own.cost : def.cost;
}

/** เอฟเฟกต์ Flash ที่กดใช้เอง (activated) ของการ์ดบนสนามนี้ที่ใช้ได้ตอนนี้ */
/** เอฟเฟกต์ Flash ที่กดใช้ได้ตอนนี้ พร้อมการ์ดเจ้าของเอฟเฟกต์ (from = cardId เอง หรือ Brave ที่ร่วมร่างอยู่) */
export interface ActivatableOption {
  ability: Extract<Ability, { kind: 'activated' }>;
  from: string;
}

/**
 * เอฟเฟกต์ Flash (activated) ของการ์ดบนสนามที่ใช้ได้ตอนนี้ แยกตามการ์ดเจ้าของ
 * ผู้ร่วมร่างกับ Brave อาจมีเอฟเฟกต์ที่บรรทัดเดียวกัน → ต้องรู้ว่าเป็นของใบไหน
 * "เทิร์นละ N ครั้ง" นับที่การ์ดเจ้าของเอฟเฟกต์ (เอฟเฟกต์ที่ Brave ให้ = นับที่ Brave ไม่ปนกับของผู้ร่วมร่าง)
 */
export function activatableOptions(state: GameState, db: CardDatabase, player: PlayerId, cardId: string): ActivatableOption[] {
  const card = state.cards[cardId];
  if (!card || card.owner !== player || !state.players[player].field.includes(cardId)) return [];
  if (state.winner || state.choice) return [];
  const flash = state.battle?.flash;
  if (!flash || flash.priority !== player || state.phase !== 'attack') return [];
  if (effectsNegated(state, db, cardId)) return [];
  const level = cardLevel(state, db, cardId);
  const isActivated = (a: Ability): a is Extract<Ability, { kind: 'activated' }> => a.kind === 'activated';
  const own = db.get(card.cardNo).abilities.filter(isActivated).map((ability) => ({ ability, from: cardId }));
  const granted = card.braves.flatMap((b) =>
    db
      .get(state.cards[b]!.cardNo)
      .abilities.filter((a): a is Extract<Ability, { kind: 'activated' }> => isActivated(a) && !!a.granted)
      .map((ability) => ({ ability, from: b })),
  );
  return [...own, ...granted].filter(
    ({ ability: a, from }) =>
      (a.granted || a.levels.includes(level)) &&
      (a.maxPerTurn === undefined || state.cards[from]!.usedThisTurn.filter((x) => x === a.source).length < a.maxPerTurn) &&
      conditionHolds(state, cardId, a.if, false, false, db),
  );
}

export function activatableAbilities(state: GameState, db: CardDatabase, player: PlayerId, cardId: string): Extract<Ability, { kind: 'activated' }>[] {
  return activatableOptions(state, db, player, cardId).map((o) => o.ability);
}

/** ผู้โจมตีนี้ไม่ถูกป้องกันโดยการ์ดประเภทนี้ */
export function attackerUnblockable(state: GameState, attackerId: string, blockerType: string): boolean {
  const b = state.battle;
  if (b?.attackerId === attackerId && b.unblockable) {
    if (b.unblockable === 'all') return true;
    if (b.unblockable === 'spirits' && blockerType !== 'ultimate') return true;
    if (b.unblockable === 'ultimates' && blockerType === 'ultimate') return true;
  }
  return (state.unblockableTurn ?? []).some((u) => u.cardId === attackerId && u.turn === state.turn);
}

/** สปิริตนี้ป้องกันได้แม้อยู่ในรูปแบบเสื่อมสภาพ */
export function canBlockExhausted(state: GameState, db: CardDatabase, cardId: string): boolean {
  if ((state.turnBlockExhausted ?? []).some((t) => t.cardId === cardId && t.turn === state.turn)) return true;
  if (effectsNegated(state, db, cardId)) return false;
  const level = cardLevel(state, db, cardId);
  return db
    .get(state.cards[cardId]!.cardNo)
    .abilities.some((a) => a.kind === 'blockWhileExhausted' && a.levels.includes(level) && conditionHolds(state, cardId, a.if, false, false, db));
}

/**
 * เอฟเฟกต์ของการ์ด sourceId ส่งผลถึงการ์ด targetId ไม่ได้ (Ultra Shield / "จะไม่รับผลเอฟเฟกต์...ของคู่แข่ง")
 * ใช้กับเอฟเฟกต์ที่เลือก/ทำกับการ์ดของอีกฝ่ายเท่านั้น
 */
export function effectBlocked(state: GameState, db: CardDatabase, sourceId: string, targetId: string): boolean {
  return effectBlocker(state, db, sourceId, targetId) !== null;
}

/**
 * การ์ดที่ทำให้การ์ด targetId ไม่รับผลเอฟเฟกต์ของ sourceId (Ultra/Heavy Shield ฯลฯ)
 * 'battle' = กันด้วยผลในการต่อสู้นี้ (ไม่ใช่ความสามารถถาวร) · null = ไม่ถูกกัน
 */
export function effectBlocker(state: GameState, db: CardDatabase, sourceId: string, targetId: string): StaticSource | 'battle' | null {
  const src = state.cards[sourceId];
  const target = state.cards[targetId];
  if (!src || !target) return null;
  // ทาเคะนาชิ ฟอร์เทรส: ไม่รับผลเอฟเฟกต์ใด ๆ (รวมของเรา) ยกเว้นการ์ดที่ชื่อมีคำที่ระบุ
  if (state.players[target.owner].field.includes(targetId) && !effectsNegated(state, db, targetId)) {
    const lv = cardLevel(state, db, targetId);
    for (const ab of db.get(target.cardNo).abilities) {
      if (ab.kind !== 'effectImmune' || !ab.exceptNamed || !ab.levels.includes(lv) || sourceId === targetId) continue;
      if (!nameHas(db.get(src.cardNo), ab.exceptNamed)) return { cardId: targetId, source: ab.source };
    }
  }
  if (src.owner === target.owner) return null;
  const tDef = db.get(target.cardNo);
  const hostOf = (braveId: string) => braveHostOf(state, braveId);
  // ต้นเหตุเป็นสปิริตรวมร่าง (หรือเบรฟที่ให้ความสามารถแก่ผู้ร่วมร่าง): นับเป็นสปิริต ได้สีของเบรฟด้วย (กติกา 04)
  const srcHost = db.get(src.cardNo).type === 'brave' ? (hostOf(sourceId) ?? sourceId) : sourceId;
  const hostCard = state.cards[srcHost]!;
  const srcType = db.get(hostCard.cardNo).type;
  // ในการต่อสู้นี้ผู้โจมตีถือว่าไร้สี (ไลท์นิ่ง-ชิออน): ชีลด์ตามสีกันไม่ได้
  const colorless = !!state.battle?.colorless && state.battle.attackerId === srcHost;
  // คำสาปบงการชีพ (Catalyze): ในเทิร์นนี้การ์ดนี้ถือว่าไร้สี
  const turnColorless = (state.colorlessTurn ?? []).some((t) => t.cardId === srcHost && t.turn === state.turn);
  const srcColors = new Set(colorless || turnColorless ? [] : [hostCard, ...hostCard.braves.map((b) => state.cards[b]!)].flatMap((c) => db.get(c.cardNo).colors));
  // ฮิสะมารุ บัสเตอร์: ในการต่อสู้นี้ไม่รับผลเอฟเฟกต์เมจิคของคู่แข่ง
  if ((state.battle?.immune ?? []).some((im) => im.cardId === targetId && im.types.includes(srcType))) return 'battle';
  // BS09 เฟเธอร์บาเรีย: ในเทิร์นนี้ไม่รับเอฟเฟกต์ทั้งหมดของคู่แข่ง
  if ((state.turnImmune ?? []).some((t) => t.cardId === targetId && t.turn === state.turn)) return 'battle';
  for (const p of ['p1', 'p2'] as const) {
    if (p === src.owner) continue; // ผู้ถือความสามารถต้องเป็นคู่แข่งของต้นเหตุ
    for (const holder of state.players[p].field.flatMap((f) => [f, ...state.cards[f]!.braves])) {
      const hDef = db.get(state.cards[holder]!.cardNo);
      for (const ab of hDef.abilities) {
        // exceptNamed (ทาเคะนาชิ ฟอร์เทรส) ตรวจแยกไว้ด้านบน
        if (ab.kind !== 'effectImmune' || ab.exceptNamed) continue;
        const host = ab.granted ? hostOf(holder) : holder;
        if (!host) continue;
        if (!ab.granted && (!state.players[p].field.includes(holder) || !ab.levels.includes(cardLevel(state, db, holder)))) continue;
        if (effectsNegated(state, db, host)) continue;
        if (ab.oppTurnOnly && state.turnPlayer === p) continue;
        if (!conditionHolds(state, host, ab.if, false, false, db)) continue;
        if (ab.colors && !ab.colors.some((c) => srcColors.has(c))) continue;
        if (ab.types && !ab.types.includes(srcType)) continue;
        const sc = ab.scope;
        const inScope =
          sc === 'self'
            ? targetId === host
            : sc === 'allNexus'
              ? tDef.type === 'nexus' || targetId === host
              : target.owner === p &&
                ('ownFamily' in sc
                  ? tDef.family.includes(sc.ownFamily)
                  : 'ownNamed' in sc
                    ? nameHas(tDef, sc.ownNamed)
                    : 'own' in sc
                      ? matchesFilter(state, db, targetId, sc.own)
                      : cardColors(state, db, targetId).includes(sc.ownColor));
        if (inScope) return { cardId: holder, source: ab.source };
      }
    }
  }
  return null;
}

/** การ์ดของผู้เล่นนี้ที่ถูกนำกลับขึ้นมือ ต้องไปไว้ใต้สุดเด็คแทน (คองโก) */
export function bounceGoesBottom(state: GameState, db: CardDatabase, cardId: string): boolean {
  return bounceBottomSource(state, db, cardId) !== null;
}

/** การ์ดที่ทำให้การ์ดนี้ไปใต้สุดเด็คแทนการกลับขึ้นมือ (คองโก) */
export function bounceBottomSource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const owner = state.cards[cardId]!.owner;
  const opp = state.players[owner === 'p1' ? 'p2' : 'p1'];
  for (const id of opp.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    const a = db
      .get(state.cards[id]!.cardNo)
      .abilities.find(
        (a) => a.kind === 'bounceToBottom' && a.levels.includes(level) && (!a.attackStepOnly || state.phase === 'attack') && conditionHolds(state, id, a.if, false, false, db),
      );
    if (a) return { cardId: id, source: a.source };
  }
  return null;
}

/**
 * สีของการ์ดบนสนาม: สีของตัวเอง + สีของเบรฟที่ร่วมร่างอยู่ (กติกา 04: สปิริต/อัลติเมทได้รับสีจากเบรฟ)
 * การ์ดนอกสนาม / เบรฟที่ร่วมร่างอยู่ = สีของตัวเอง
 */
function cardColorsRaw(state: GameState, db: CardDatabase, cardId: string): CardDef['colors'] {
  const card = state.cards[cardId];
  if (!card) return [];
  // BS11 ยาเท็นโดว: แอทแท็คสเต็ป สีของสปิริต/อัลติเมท/เน็กซัสทั้งหมดบนสนามกลายเป็นสีขาว
  if (state.players[card.owner].field.includes(cardId)) {
    const all = allColorOverride(state, db);
    if (all) return [all];
  }
  let own = db.get(card.cardNo).colors;
  // "สีของสปิริตนี้ถือว่าเป็นสี...ด้วย" (BS08 โฮมุแรดคอล / เมโนอุดราก้อน)
  if (state.players[card.owner].field.includes(cardId) && !effectsNegated(state, db, cardId)) {
    const lv = cardLevel(state, db, cardId);
    const also = db.get(card.cardNo).abilities.flatMap((a) => (a.kind === 'colorAlso' && a.levels.includes(lv) ? [a.color] : []));
    if (also.length) own = [...new Set([...own, ...also])];
  }
  if (card.braves.length === 0) return own;
  return [...new Set([...own, ...card.braves.flatMap((b) => db.get(state.cards[b]!.cardNo).colors)])];
}

/** การ์ดในมือจริง (ไม่รวมการ์ดที่วางแสดงนอกมือ): ใช้กับเอฟเฟกต์ทิ้งการ์ด / เงื่อนไขจำนวนการ์ดในมือ */
export function handCards(state: GameState, player: PlayerId): string[] {
  const shown = state.shownCards ?? [];
  return shown.length ? state.players[player].hand.filter((id) => !shown.includes(id)) : state.players[player].hand;
}

/** การ์ดที่ต้องโจมตีของผู้เล่นนี้ (ราดัน): ฝั่งตรงข้ามมีเอฟเฟกต์บังคับ และตัวนั้นยังโจมตีได้ */
export function forcedAttackers(state: GameState, db: CardDatabase, player: PlayerId): string[] {
  if (state.phase !== 'attack' || state.turnPlayer !== player || state.battle) return [];
  // อิจิโกะฮิโทฟุริ: ตัวที่ถูกระบุต้องโจมตีเป็นใบแรกของสเต็ป (ถ้าทำได้)
  const fa = activeForcedAttack(state, db, player);
  if (fa) return [fa.attackerId];
  const filters = forceAttackHolders(state, db, player).map((h) => h.filter);
  if (filters.length === 0) return [];
  return state.players[player].field.filter((id) => canAttackWith(state, db, id) && filters.some((f) => matchesFilter(state, db, id, f)));
}

/** อิจิโกะฮิโทฟุริที่ยังมีผล: สปิริตที่ถูกระบุยังโจมตีได้ และผู้ร่วมร่างที่ให้ผลยังอยู่บนสนาม */
export function activeForcedAttack(state: GameState, db: CardDatabase, player: PlayerId): { attackerId: string; holderId: string } | null {
  const fa = state.forcedAttack;
  if (!fa || fa.turn !== state.turn || state.turnPlayer !== player || state.phase !== 'attack') return null;
  const opp = player === 'p1' ? 'p2' : 'p1';
  if (!state.players[opp].field.includes(fa.holderId) || !state.players[player].field.includes(fa.attackerId)) return null;
  if (!canAttackWith(state, db, fa.attackerId)) return null;
  return fa;
}

/** การ์ดฝั่งตรงข้ามของผู้เล่นนี้ที่บังคับให้โจมตีมาหา (ราดัน) */
export function forceAttackHolders(state: GameState, db: CardDatabase, player: PlayerId): { id: string; filter: CardFilter }[] {
  const opp = state.players[player === 'p1' ? 'p2' : 'p1'];
  const out: { id: string; filter: CardFilter }[] = [];
  for (const id of opp.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) if (a.kind === 'forceAttack' && a.levels.includes(level)) out.push({ id, filter: a.filter });
  }
  return out;
}

/** การ์ดนี้ในแทรชไม่รับผลเอฟเฟกต์ (เทปเปคิวอลล์) */
export function trashImmune(db: CardDatabase, state: GameState, cardId: string): boolean {
  return db.get(state.cards[cardId]!.cardNo).abilities.some((a) => a.kind === 'trashImmune') || !!trashLockSource(state, db);
}

/** BS09 เมียวโอสยบมาร: การ์ดในแทรชของผู้เล่นทุกคนไม่รับผลเอฟเฟกต์และใช้เอฟเฟกต์ไม่ได้ */
export function trashLockSource(state: GameState, db: CardDatabase): StaticSource | null {
  return staticSources(state, db, ['p1', 'p2'], 'trashLock')[0] ?? null;
}

/** BS09 จินเบร์: คอสต์ที่ผู้เล่นนี้ต้องจ่ายเพิ่มเพื่อใช้งานเมจิค/สั่งใช้เบิร์สตอนนี้ (แอทแท็คสเต็ปของคู่แข่งที่มีจินเบร์) */
export function magicBurstTax(state: GameState, db: CardDatabase, player: PlayerId): { amount: number; sources: StaticSource[] } {
  const opp = player === 'p1' ? 'p2' : 'p1';
  const out = { amount: 0, sources: [] as StaticSource[] };
  if (state.turnPlayer !== opp || state.phase !== 'attack') return out;
  for (const src of staticSources(state, db, [opp], 'magicBurstTax')) {
    const ab = db.get(state.cards[src.cardId]!.cardNo).abilities.find((a) => a.kind === 'magicBurstTax' && a.source === src.source);
    if (ab?.kind !== 'magicBurstTax' || !conditionHolds(state, src.cardId, ab.if, false, false, db)) continue;
    out.amount += ab.amount;
    out.sources.push(src);
  }
  return out;
}

/** BS10 สิงโตควันม่วง: คอสต์ที่ต้องจ่ายเพิ่มเพื่ออัญเชิญการ์ดนี้โดยเอฟเฟกต์ (สปิริต/เบรฟที่ไม่ใช่สีม่วง) */
export function effectSummonTax(state: GameState, db: CardDatabase, cardId: string): { cost: number; sources: StaticSource[] } {
  const def = db.get(state.cards[cardId]!.cardNo);
  const out = { cost: 0, sources: [] as StaticSource[] };
  if ((def.type !== 'spirit' && def.type !== 'brave') || def.colors.includes('purple')) return out;
  for (const src of staticSources(state, db, ['p1', 'p2'], 'effectSummonTax')) {
    const ab = db.get(state.cards[src.cardId]!.cardNo).abilities.find((a) => a.kind === 'effectSummonTax' && a.source === src.source);
    if (ab?.kind !== 'effectSummonTax') continue;
    out.cost += ab.cost;
    out.sources.push(src);
  }
  return out;
}

/** BS10 โฮเนะสุมิ: การ์ดของ player ที่ทำให้เอฟเฟกต์ "จบแอทแท็คสเต็ป" ของเมจิคคู่แข่งไร้ผลได้ (มีโซลคอร์วางอยู่) */
export function endStepCounter(state: GameState, db: CardDatabase, player: PlayerId): { cardId: string; cost: number } | null {
  for (const src of staticSources(state, db, [player], 'counterEndAttackStep')) {
    const card = state.cards[src.cardId]!;
    if (!card.cores.some((c) => state.cores[c]!.isSoul)) continue;
    const ab = db.get(card.cardNo).abilities.find((a) => a.kind === 'counterEndAttackStep' && a.source === src.source);
    if (ab?.kind === 'counterEndAttackStep') return { cardId: src.cardId, cost: ab.cost };
  }
  return null;
}

/** BS10 โทฟุบอย: ในเทิร์นนี้เจ็มของการ์ดนี้เป็น 0 */
export function symbolsZeroCard(state: GameState, cardId: string, db?: CardDatabase): boolean {
  if ((state.symbolsZeroCards ?? []).some((t) => t.cardId === cardId && t.turn === state.turn)) return true;
  // BS11 โททอลซอง: ในเทิร์นนี้การ์ดทั้งหมดที่ตรงตัวกรอง (รวมตัวที่ลงทีหลัง)
  const c = state.cards[cardId];
  return !!db && !!c && (state.symbolsZeroTurn ?? []).some((t) => t.turn === state.turn && t.player === c.owner && matchesFilter(state, db, cardId, t.filter));
}

/** BS10 ผ่าวิบัติไร้ผนึก: ในเทิร์นนี้ผู้เล่นนี้ต้องส่งคอร์ 1 เม็ดของตัวที่โจมตี/ป้องกันไปวอยด์ */
export function coreTaxed(state: GameState, player: PlayerId): boolean {
  return (state.coreTaxTurn ?? []).some((t) => t.player === player && t.turn === state.turn);
}

/** BS10 ทันโปโปะ: แอทแท็คสเต็ป เบิร์สของผู้เล่นนี้ถูกทิ้งไม่ได้ */
export function burstProtectSource(state: GameState, db: CardDatabase, player: PlayerId): StaticSource | null {
  if (state.phase !== 'attack') return null;
  return staticSources(state, db, [player], 'burstProtect')[0] ?? null;
}

/** สีเจ็มทั้งหมดบนฟิลด์ของผู้เล่น (รวม "เจ็มถือว่าเป็นสี...ด้วย") */
export function ownGemColors(state: GameState, db: CardDatabase, player: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const id of state.players[player].field) {
    const card = state.cards[id]!;
    let n = 0;
    for (const x of [id, ...card.braves]) for (const [color, k] of Object.entries(db.get(state.cards[x]!.cardNo).symbols)) if ((k ?? 0) > 0) (out.add(color), (n += k ?? 0));
    for (const [color, k] of Object.entries(extraSymbols(state, db, id))) if ((k ?? 0) > 0) (out.add(color), (n += k ?? 0));
    if (n > 0 && !effectsNegated(state, db, id)) for (const a of db.get(card.cardNo).abilities) if (a.kind === 'symbolAlsoColor' && a.levels.includes(cardLevel(state, db, id))) out.add(a.color);
  }
  out.delete('ultimate');
  {
    const all = allColorOverride(state, db);
    if (all) return new Set(out.size > 0 ? [all] : []);
  }
  return out;
}

/** BS09 วัดอรุณ: ในเทิร์นนี้ผู้เล่นนี้ใช้งานการ์ดเมจิคไม่ได้ */
export function magicBanned(state: GameState, player: PlayerId, db?: CardDatabase, def?: CardDef): boolean {
  if ((state.magicBans ?? []).some((b) => b.player === player && b.turn === state.turn)) return true;
  return !!db && !!def && cardBanSource(state, db, player, def) !== null;
}

/**
 * BS12 เมียวโอบัวม่วง / อาบิส-อโพคาลิพส์: การ์ดของคู่แข่งที่ห้ามผู้เล่นนี้สั่งใช้เบิร์ส/ใช้งานการ์ดเมจิคใบนี้ (คืนต้นเหตุ)
 *  nexusCost = คอสต์เท่ากับคอสต์ของเน็กซัสของคู่แข่ง (เจ้าของเอฟเฟกต์) · gemColor = ไม่มีสีเดียวกับสีเจ็มบนฟิลด์ของผู้เล่นนี้
 */
export function cardBanSource(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef): StaticSource | null {
  const opp = player === 'p1' ? 'p2' : 'p1';
  for (const id of state.players[opp].field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    const entries = [
      ...db.get(state.cards[id]!.cardNo).abilities.filter((a) => a.kind === 'burstMagicBan' && !a.granted && a.levels.includes(level)).map((ab) => ({ ab, src: id })),
      ...state.cards[id]!.braves.flatMap((b) => db.get(state.cards[b]!.cardNo).abilities.filter((a) => a.kind === 'burstMagicBan' && a.granted).map((ab) => ({ ab, src: b }))),
    ];
    for (const { ab, src } of entries) {
      if (ab.kind !== 'burstMagicBan') continue;
      if (ab.ownAttackStepOnly && !(state.phase === 'attack' && state.turnPlayer === opp)) continue;
      if (ab.mode === 'nexusCost') {
        const costs = state.players[opp].field.filter((n) => db.get(state.cards[n]!.cardNo).type === 'nexus').map((n) => fieldCost(state, db, n));
        if (costs.includes(def.cost)) return { cardId: src, source: ab.source };
      } else {
        const gems = ownGemColors(state, db, player);
        if (!def.colors.some((c) => gems.has(c))) return { cardId: src, source: ab.source };
      }
    }
  }
  return null;
}

/** BS09 วัดอรุณ: ผู้เล่นนี้นำการ์ดในแทรชกลับขึ้นมือไม่ได้ (เน็กซัสของคู่แข่ง) */
export function trashReturnBlocker(state: GameState, db: CardDatabase, player: PlayerId): StaticSource | null {
  return staticSources(state, db, [player === 'p1' ? 'p2' : 'p1'], 'opponentNoTrashReturn')[0] ?? null;
}

/** BS09 สุสานของจักรพรรดิมาร: แอทแท็คสเต็ป สปิริต/อัลติเมทที่มีคอร์ 1 เม็ดโจมตี/ป้องกันไม่ได้ */
export function oneCoreLocked(state: GameState, db: CardDatabase, cardId: string): boolean {
  if (state.phase !== 'attack' || state.cards[cardId]!.cores.length !== 1) return false;
  return staticSources(state, db, ['p1', 'p2'], 'oneCoreNoBattle').length > 0;
}

/** BS12 ฮาคุไร: การ์ดของเราที่ทำให้สปิริตนี้ไม่กลับขึ้นมือ/เข้ากองโดยเอฟเฟกต์ของคู่แข่ง */
export function bounceImmuneSource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const card = state.cards[cardId];
  if (!card || !state.players[card.owner].field.includes(cardId)) return null;
  for (const src of staticSources(state, db, [card.owner], 'bounceImmuneAllies')) {
    const ab = db.get(state.cards[src.cardId]!.cardNo).abilities.find((a) => a.kind === 'bounceImmuneAllies' && a.source === src.source);
    if (ab?.kind === 'bounceImmuneAllies' && matchesFilter(state, db, cardId, ab.filter)) return src;
  }
  return null;
}

/** BS12 เมลสตอร์ม: Charge จำนวนทิ้งเด็คเพิ่มของผู้เล่นนี้ (การ์ดบนสนามตามเลเวล + เบรฟที่ให้ผู้ร่วมร่าง) */
export function millBoostFor(state: GameState, db: CardDatabase, player: PlayerId): { amount: number; src: StaticSource[] } {
  let amount = 0;
  const src: StaticSource[] = [];
  for (const id of state.players[player].field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind === 'millBoost' && !a.granted && a.levels.includes(level)) {
        amount += a.amount;
        src.push({ cardId: id, source: a.source });
      }
    }
    for (const b of state.cards[id]!.braves) {
      for (const a of db.get(state.cards[b]!.cardNo).abilities) {
        if (a.kind === 'millBoost' && a.granted) {
          amount += a.amount;
          src.push({ cardId: b, source: a.source });
        }
      }
    }
  }
  return { amount, src };
}

/**
 * BS12 คาเมะมิสึ: จำนวนเน็กซัสที่เสื่อมสภาพแทนการจ่ายคอสต์ได้ตอนอัญเชิญการ์ดนี้จากมือ (เมนสเต็ปของเรา) · 0 = ใช้ไม่ได้
 * ไม่เกินคอสต์ที่ต้องจ่าย (base = คอสต์ก่อนลด)
 */
export function nexusExhaustPayMax(state: GameState, db: CardDatabase, player: PlayerId, cardId: string, base: number): { max: number; src: StaticSource | null } {
  if (state.phase !== 'main' || state.turnPlayer !== player || state.battle) return { max: 0, src: null };
  const def = db.get(state.cards[cardId]!.cardNo);
  for (const s of staticSources(state, db, [player], 'nexusExhaustPay')) {
    const ab = db.get(state.cards[s.cardId]!.cardNo).abilities.find((a) => a.kind === 'nexusExhaustPay' && a.source === s.source);
    if (ab?.kind !== 'nexusExhaustPay' || !ab.names.includes(def.name)) continue;
    const ready = state.players[player].field.filter((id) => db.get(state.cards[id]!.cardNo).type === 'nexus' && state.cards[id]!.state === 'refresh').length;
    return { max: Math.min(ready, payableCost(state, db, player, def, base)), src: s };
  }
  return { max: 0, src: null };
}

/** BS12 แคพิทัลแคพิทัล: จำนวนคอร์ในรีเสิร์ฟที่ต้องส่งลงแทรชเพื่อสั่งการ์ดนี้โจมตี (การ์ดที่ไม่มีโซลคอร์ · 0 = ไม่มี) */
export function attackReserveTaxFor(state: GameState, db: CardDatabase, attackerId: string): { cores: number; src: StaticSource[] } {
  const card = state.cards[attackerId]!;
  if (state.phase !== 'attack' || card.cores.some((c) => state.cores[c]!.isSoul)) return { cores: 0, src: [] };
  let cores = 0;
  const src: StaticSource[] = [];
  for (const s of staticSources(state, db, [card.owner === 'p1' ? 'p2' : 'p1'], 'attackReserveTax')) {
    const ab = db.get(state.cards[s.cardId]!.cardNo).abilities.find((a) => a.kind === 'attackReserveTax' && a.source === s.source);
    if (ab?.kind !== 'attackReserveTax') continue;
    cores += ab.cores + (state.cards[s.cardId]!.cores.some((c) => state.cores[c]!.isSoul) ? ab.soulBonus : 0);
    src.push(s);
  }
  return { cores, src };
}

/** BS09 สุสานของจักรพรรดิมาร Lv2: จำนวนคอร์ที่ผู้เล่นนี้ต้องส่งลงแทรชจากตัวที่สั่งโจมตี (0 = ไม่มี) */
export function attackTaxFor(state: GameState, db: CardDatabase, attacker: PlayerId): number {
  let n = 0;
  for (const src of staticSources(state, db, [attacker === 'p1' ? 'p2' : 'p1'], 'attackTax')) {
    const ab = db.get(state.cards[src.cardId]!.cardNo).abilities.find((a) => a.kind === 'attackTax' && a.source === src.source);
    if (ab?.kind === 'attackTax') n = Math.max(n, ab.cores);
  }
  return n;
}

/** จำนวนสีของเจ็มบนสนามของผู้เล่น (นับเม็ดละ 1 สี: เลือกสีที่ทำให้ได้จำนวนสีมากที่สุด) */
export function gemColorCount(state: GameState, db: CardDatabase, player: PlayerId): number {
  if (allColorOverride(state, db)) return ownGemColors(state, db, player).size;
  // เจ็มแต่ละเม็ดเป็นสีใดได้บ้าง ("เจ็มถือว่าเป็นสี...ด้วย" = หลายตัวเลือก) แล้วจับคู่เม็ด→สีให้ได้จำนวนสีมากที่สุด
  const gems: string[][] = [];
  for (const id of state.players[player].field) {
    const card = state.cards[id]!;
    const also = effectsNegated(state, db, id) ? [] : db.get(card.cardNo).abilities.flatMap((a) => (a.kind === 'symbolAlsoColor' && a.levels.includes(cardLevel(state, db, id)) ? [a.color as string] : []));
    const add = (color: string, n: number) => {
      for (let i = 0; i < n; i++) gems.push([color, ...also].filter((c) => c !== 'ultimate'));
    };
    for (const x of [id, ...card.braves]) for (const [color, n] of Object.entries(db.get(state.cards[x]!.cardNo).symbols)) add(color, n ?? 0);
    for (const [color, n] of Object.entries(extraSymbols(state, db, id))) add(color, n ?? 0);
  }
  const owner = new Map<string, number>();
  const tryGem = (g: number, seen: Set<string>): boolean => {
    for (const c of gems[g]!) {
      if (seen.has(c)) continue;
      seen.add(c);
      const cur = owner.get(c);
      if (cur === undefined || tryGem(cur, seen)) {
        owner.set(c, g);
        return true;
      }
    }
    return false;
  };
  gems.forEach((_, g) => tryGem(g, new Set()));
  return owner.size;
}

/** Dispersion ของผู้เล่นนี้ทำงานอยู่ (การ์ดที่มีความสามารถกำลังโจมตี/ป้องกัน): จำนวนเป้าใหม่ หรือ 0 */
export function dispersionCount(state: GameState, db: CardDatabase, player: PlayerId): number {
  const b = state.battle;
  if (!b) return 0;
  let n = 0;
  for (const id of state.players[player].field) {
    if (b.attackerId !== id && !b.blockers.includes(id)) continue;
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) if (a.kind === 'dispersion' && a.levels.includes(level)) n = Math.max(n, a.count);
  }
  return n;
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

function payableCostRaw(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef, base: number): number {
  const n = payableCostInner(state, db, player, def, base);
  // BS12 ทรูธ-อีเด็น: อัญเชิญไม่ได้ถ้าไม่จ่ายอย่างน้อย N คอสต์
  const min = def.abilities.find((a) => a.kind === 'minSummonPay');
  return min?.kind === 'minSummonPay' ? Math.max(min.min, n) : n;
}

function payableCostInner(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef, base: number): number {
  const full = def.abilities.some(
    (a) => a.kind === 'fullReductionIfAlly' && state.players[player].field.some((id) => db.get(state.cards[id]!.cardNo).name === a.name),
  );
  if (full) return Math.max(0, base - Object.values(def.reduction).reduce<number>((n, v) => n + (v ?? 0), 0));
  // ฮาคุโดวโทคาเงะ: คู่แข่งอัญเชิญการ์ดสปิริตคอสต์ดั้งเดิมไม่เกิน N ใช้สัญลักษณ์ลดคอสต์ไม่ได้
  if (def.type === 'spirit' && noReductionFor(state, db, player, def)) return base;
  const reductionTotal = Object.values(def.reduction).reduce<number>((n, v) => n + (v ?? 0), 0);
  if (reductionTotal === 0) return base;
  // "เมื่ออัญเชิญการ์ดที่ชื่อมีคำ ... สปิริตนี้เจ็มเพิ่ม" (ปะกุกุ)
  const summonGems: SymbolColor[] = [];
  for (const id of state.players[player].field) {
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'summonSymbol' || effectsNegated(state, db, id)) continue;
      if (ab.nameIncludes && !nameHas(def, ab.nameIncludes)) continue;
      // Spirit Soul: "เมื่อเราทำการอัญเชิญการ์ดอัลติเมท"
      if (ab.filter?.types && !ab.filter.types.includes(def.type)) continue;
      if (!ab.levels.includes(cardLevel(state, db, id)) || !conditionHolds(state, id, ab.if, false, false, db)) continue;
      for (let i = 0; i < ab.count; i++) summonGems.push(ab.color);
    }
  }
  // ไม่มีการ์ด "เจ็มถือว่าเป็นสี...ด้วย" บนสนาม: เจ็มแต่ละเม็ดมีสีเดียว นับตามสีได้เลย (เร็ว)
  if (!state.players[player].field.some((id) => hasSymbolAlso(db, state.cards[id]!.cardNo))) {
    const symbols = { ...fieldSymbols(state, db, player) };
    for (const c of summonGems) symbols[c] = (symbols[c] ?? 0) + 1;
    let reduced = 0;
    for (const [color, max] of Object.entries(def.reduction) as [SymbolColor, number][]) reduced += Math.min(max, symbols[color] ?? 0);
    return Math.max(0, base - reduced);
  }
  // เจ็มทีละเม็ด: สีที่เม็ดนั้นใช้ได้ ("เจ็มถือว่าเป็นสี...ด้วย" = หลายสี แต่ยังเป็นเจ็ม 1 เม็ด ลดคอสต์ได้ 1 ช่องเท่านั้น)
  const gems: string[][] = summonGems.map((c) => [c]);
  for (const id of state.players[player].field) {
    for (const g of cardGems(state, db, id).gems) for (let i = 0; i < g.count; i++) gems.push([g.color, ...g.also]);
  }
  // ช่องลดคอสต์ทีละช่อง แล้วจับคู่เจ็ม → ช่อง ให้ลดได้มากที่สุด (เจ็มหนึ่งเม็ดใช้ได้ช่องเดียว)
  const slots: string[] = [];
  for (const [color, max] of Object.entries(def.reduction) as [SymbolColor, number][]) for (let i = 0; i < (max ?? 0); i++) slots.push(color);
  const owner: (number | undefined)[] = slots.map(() => undefined);
  const tryGem = (g: number, seen: boolean[]): boolean => {
    for (let k = 0; k < slots.length; k++) {
      if (seen[k] || !gems[g]!.includes(slots[k]!)) continue;
      seen[k] = true;
      if (owner[k] === undefined || tryGem(owner[k]!, seen)) {
        owner[k] = g;
        return true;
      }
    }
    return false;
  };
  let reduced = 0;
  for (let g = 0; g < gems.length && reduced < slots.length; g++) if (tryGem(g, [])) reduced++;
  return Math.max(0, base - reduced);
}

/** การ์ดสปิริตนี้ของผู้เล่นนี้ใช้สัญลักษณ์ลดคอสต์ไม่ได้ (การ์ดของคู่แข่งห้ามไว้) */
export function noReductionFor(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef): boolean {
  return noReductionSources(state, db, player, def).length > 0;
}

/** การ์ดของคู่แข่งที่ทำให้การ์ดสปิริตนี้ใช้สัญลักษณ์ลดคอสต์ไม่ได้ (ฮาคุโดวโทคาเงะ) */
export function noReductionSources(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef): StaticSource[] {
  const opp = state.players[player === 'p1' ? 'p2' : 'p1'];
  const out: StaticSource[] = [];
  for (const id of opp.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind === 'opponentNoReduction' && a.levels.includes(level) && def.cost <= a.maxCost) out.push({ cardId: id, source: a.source });
    }
  }
  return out;
}

/**
 * อัญเชิญ/ใช้การ์ดนี้แล้ว "ไม่ได้ลดคอสต์" เพราะการ์ดของคู่แข่ง (ฮาคุโดวโทคาเงะ): คืนต้นเหตุเฉพาะเมื่อสัญลักษณ์บนสนามลดคอสต์ได้จริง
 * (ไม่มีสัญลักษณ์ให้ลดอยู่แล้ว = ไม่ได้ทำให้จ่ายแพงขึ้น ไม่ต้องเรืองแสง)
 */
export function noReductionBlocked(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef, base: number): StaticSource[] {
  if (def.type !== 'spirit') return [];
  const src = noReductionSources(state, db, player, def);
  if (src.length === 0) return [];
  const symbols = fieldSymbols(state, db, player);
  const couldReduce = (Object.entries(def.reduction) as [SymbolColor, number][]).some(([color, max]) => max > 0 && (symbols[color] ?? 0) > 0);
  return couldReduce && base > 0 ? src : [];
}

/** การ์ดบนสนามของเราที่ทำให้คอสต์ของการ์ดในมือใบนี้เปลี่ยน ("แอทแท็คสเต็ปของเรา: เมจิคในมือคอสต์ -1" ทริคสเตอร์) */
export function handCostDeltaSources(state: GameState, db: CardDatabase, cardId: string): StaticSource[] {
  const card = state.cards[cardId]!;
  const owner = state.players[card.owner];
  if (!owner.hand.includes(cardId) || (state.shownCards ?? []).includes(cardId)) return [];
  const out: StaticSource[] = [];
  for (const id of owner.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'handCostDelta' || !ab.levels.includes(level) || !matchesFilter(state, db, cardId, ab.filter)) continue;
      if (ab.ownAttackStepOnly && (state.phase !== 'attack' || state.turnPlayer !== card.owner)) continue;
      if (ab.delta !== 0) out.push({ cardId: id, source: ab.source });
    }
  }
  out.push(...handCostPerSources(state, db, cardId));
  return out;
}

/** BS11 ฮะจิริว / ตราแห่งเพลิงรบ: คอสต์ในมือ +delta ต่อสปิริตของเราที่ตรงตัวกรอง (คืนต้นเหตุพร้อมค่าที่เปลี่ยน) */
function handCostPerList(state: GameState, db: CardDatabase, cardId: string): { src: StaticSource; delta: number }[] {
  const card = state.cards[cardId]!;
  const owner = state.players[card.owner];
  const out: { src: StaticSource; delta: number }[] = [];
  const count = (f: CardFilter) => owner.field.filter((x) => isSpiritLike(db.get(state.cards[x]!.cardNo)) && matchesFilter(state, db, x, f)).length;
  for (const ab of db.get(card.cardNo).abilities) {
    if (ab.kind !== 'handCostPer' || !ab.self) continue;
    const n = count(ab.per);
    if (n > 0) out.push({ src: { cardId, source: ab.source }, delta: ab.delta * n });
  }
  for (const id of owner.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'handCostPer' || ab.self || !ab.levels.includes(level) || !matchesFilter(state, db, cardId, ab.filter)) continue;
      const n = count(ab.per);
      if (n > 0) out.push({ src: { cardId: id, source: ab.source }, delta: ab.delta * n });
    }
  }
  return out;
}

function handCostPerDelta(state: GameState, db: CardDatabase, cardId: string): number {
  return handCostPerList(state, db, cardId).reduce((n, x) => n + x.delta, 0);
}

function handCostPerSources(state: GameState, db: CardDatabase, cardId: string): StaticSource[] {
  return handCostPerList(state, db, cardId).map((x) => x.src);
}

let checkingAllColor = false;
/** BS11 ยาเท็นโดว: แอทแท็คสเต็ปของผู้เล่นทุกคน สีและเจ็มของการ์ดบนสนามทั้งหมดกลายเป็นสีนี้ (null = ไม่มีผล) */
export function allColorOverride(state: GameState, db: CardDatabase): CardDef['colors'][number] | null {
  if (state.phase !== 'attack' || checkingAllColor) return null;
  checkingAllColor = true;
  try {
    for (const p of ['p1', 'p2'] as const) {
      for (const id of state.players[p].field) {
        const ab = db.get(state.cards[id]!.cardNo).abilities.find((a) => a.kind === 'allColorAttackStep');
        if (ab?.kind !== 'allColorAttackStep' || !ab.levels.includes(cardLevel(state, db, id)) || effectsNegated(state, db, id)) continue;
        return ab.color;
      }
    }
    return null;
  } finally {
    checkingAllColor = false;
  }
}

/** BS11 โอนิมารุ: การ์ดนี้มี Ultra Shield (ข้อความการ์ดเอง หรือได้รับจากการ์ดของเรา เช่น ชิโอมาเนกิ) */
export function hasUltraShield(state: GameState, db: CardDatabase, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  const owner = state.players[card.owner];
  if (!owner.field.includes(cardId)) return false;
  const tDef = db.get(card.cardNo);
  const lv = cardLevel(state, db, cardId);
  // ของตัวเอง: Ultra Shield = effectImmune scope self ที่กันอัลติเมทด้วย
  if (!effectsNegated(state, db, cardId) && tDef.abilities.some((a) => a.kind === 'effectImmune' && a.scope === 'self' && !a.granted && a.levels.includes(lv) && !!a.types?.includes('ultimate')))
    return true;
  for (const id of owner.field) {
    if (id === cardId || effectsNegated(state, db, id)) continue;
    const hl = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind !== 'effectImmune' || a.scope === 'self' || a.scope === 'allNexus' || !a.levels.includes(hl) || !a.types?.includes('ultimate')) continue;
      if (!conditionHolds(state, id, a.if, false, false, db)) continue;
      const sc = a.scope;
      const ok =
        'ownFamily' in sc
          ? tDef.family.includes(sc.ownFamily)
          : 'ownNamed' in sc
            ? nameHas(tDef, sc.ownNamed)
            : 'own' in sc
              ? matchesFilter(state, db, cardId, sc.own)
              : cardColors(state, db, cardId).includes(sc.ownColor);
      if (ok) return true;
    }
  }
  return false;
}

let checkingCopy = false;
/** BS11 ฮะจิริว: การ์ดที่สปิริตนี้ก๊อปปี้ Lv / BP / เจ็ม (null = ไม่มี) · การ์ดที่ให้ผลเองไม่ก๊อปปี้ (กันวนซ้ำ) */
function statCopySourceRaw(state: GameState, db: CardDatabase, cardId: string): string | null {
  if (checkingCopy) return null;
  const card = state.cards[cardId];
  if (!card) return null;
  const owner = state.players[card.owner];
  if (!owner.field.includes(cardId)) return null;
  const def = db.get(card.cardNo);
  if (def.type !== 'spirit' || def.abilities.some((a) => a.kind === 'copyStatsAllies')) return null;
  checkingCopy = true;
  try {
    for (const id of owner.field) {
      if (id === cardId) continue;
      const ab = db.get(state.cards[id]!.cardNo).abilities.find((a) => a.kind === 'copyStatsAllies');
      if (ab?.kind !== 'copyStatsAllies' || effectsNegated(state, db, id)) continue;
      if (!ab.levels.includes(cardLevel(state, db, id)) || !conditionHolds(state, id, ab.if, false, false, db)) continue;
      if (matchesFilter(state, db, cardId, ab.filter)) return id;
    }
    return null;
  } finally {
    checkingCopy = false;
  }
}

/** BS11 โฮมุระแมนดริล: [เอฟเฟกต์ทำลาย BP] ของการ์ดนี้ ขอบเขต +amount / ทะลุ Ultra Shield */
export function bpDestroyBoostFor(state: GameState, db: CardDatabase, cardId: string): { amount: number; pierce: boolean; src: StaticSource[] } | null {
  const card = state.cards[cardId];
  if (!card) return null;
  const def = db.get(card.cardNo);
  const out = { amount: 0, pierce: false, src: [] as StaticSource[] };
  // BS12: ของการ์ดบนสนามเอง (ตามเลเวล) + ที่เบรฟให้ผู้ร่วมร่าง (Charge ของไชนิ่ง-ซอร์ด)
  for (const id of state.players[card.owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    const entries = [
      ...db.get(state.cards[id]!.cardNo).abilities.filter((a) => a.kind === 'bpDestroyBoost' && !a.granted && a.levels.includes(level)).map((ab) => ({ ab, src: id })),
      ...state.cards[id]!.braves.flatMap((b) => db.get(state.cards[b]!.cardNo).abilities.filter((a) => a.kind === 'bpDestroyBoost' && a.granted).map((ab) => ({ ab, src: b }))),
    ];
    for (const { ab, src } of entries) {
      if (ab.kind !== 'bpDestroyBoost') continue;
      if (ab.nameIncludes && !nameHas(def, ab.nameIncludes)) continue;
      if (ab.fromTypes && !ab.fromTypes.includes(def.type)) continue;
      if (ab.ownAttackStepOnly && !(state.phase === 'attack' && state.turnPlayer === card.owner)) continue;
      if (!conditionHolds(state, id, ab.if, false, false, db)) continue;
      out.amount += ab.amount;
      out.pierce ||= !!ab.pierceShield;
      out.src.push({ cardId: src, source: ab.source });
    }
  }
  return out.src.length ? out : null;
}

/** BS11 ลองฟิลด์: ในเทิร์นนี้เอฟเฟกต์ของการ์ดนี้ถือว่าได้ส่งโซลคอร์ลงแทรชแล้ว (คืนต้นเหตุ) */
export function soulCostFreeSource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const card = state.cards[cardId];
  if (!card) return null;
  const e = (state.soulCostFree ?? []).find((x) => x.player === card.owner && x.turn === state.turn && nameHas(db.get(card.cardNo), x.names));
  return e ? { cardId: e.cardId, source: e.source } : null;
}

/** BS11 เดย์เบรค-เธิร์ด: "สปิริตนี้จะไม่ถูกทำลาย" ที่มีผลอยู่ */
export function indestructibleSource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const card = state.cards[cardId];
  if (!card || !state.players[card.owner].field.includes(cardId) || effectsNegated(state, db, cardId)) return null;
  const lv = cardLevel(state, db, cardId);
  for (const ab of db.get(card.cardNo).abilities) {
    if (ab.kind === 'indestructible' && ab.levels.includes(lv) && conditionHolds(state, cardId, ab.if, false, false, db)) return { cardId, source: ab.source };
  }
  return null;
}

/** การ์ดที่มีความสามารถนี้ (ไม่ถูกปิดเอฟเฟกต์ เลเวลตรง) อยู่บนสนามของผู้เล่นเหล่านี้ */
function fieldHas(state: GameState, db: CardDatabase, players: readonly PlayerId[], kind: Ability['kind']): boolean {
  return staticSources(state, db, players, kind).length > 0;
}

/** การ์ดต้นเหตุของความสามารถถาวร (บรรทัดเอฟเฟกต์ที่ทำงาน) ใช้ส่ง event ให้หน้าเว็บเรืองแสงการ์ดนั้น */
export interface StaticSource {
  cardId: string;
  source: number;
}

/** การ์ดบนสนามของผู้เล่นเหล่านี้ที่มีความสามารถถาวรชนิดนี้ทำงานอยู่ (เลเวลตรง · ไม่ถูกปิดเอฟเฟกต์) */
export function staticSources(state: GameState, db: CardDatabase, players: readonly PlayerId[], kind: Ability['kind']): StaticSource[] {
  const out: StaticSource[] = [];
  for (const p of players) {
    for (const id of state.players[p].field) {
      if (effectsNegated(state, db, id)) continue;
      const level = cardLevel(state, db, id);
      for (const a of db.get(state.cards[id]!.cardNo).abilities) {
        if (a.kind === kind && 'levels' in a && a.levels.includes(level)) out.push({ cardId: id, source: a.source });
      }
    }
  }
  return out;
}

/** การ์ดที่ทำให้เอฟเฟกต์ของการ์ดนี้ไม่ทำงาน (เลิฟพรินเซส / เมียวโอดาบแดง) · ถูกปิดด้วยเอฟเฟกต์ในเทิร์นนี้ (เมจิค) = null */
export function negatedBy(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const c = state.cards[cardId];
  if (!c || !effectsNegated(state, db, cardId)) return null;
  const def = db.get(c.cardNo);
  const opp = c.owner === 'p1' ? 'p2' : 'p1';
  for (const id of state.players[opp].field) {
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind === 'negateOpponentNexus' && def.type === 'nexus' && !nameHas(def, a.unlessNamed) && a.levels.includes(level) && conditionHolds(state, id, a.if, false, false, db)) {
        return { cardId: id, source: a.source };
      }
      if (a.kind === 'negateOpponentEffects' && state.phase === 'attack' && opp === state.turnPlayer && a.levels.includes(level) && def.cost <= a.maxCost) {
        return { cardId: id, source: a.source };
      }
    }
  }
  return null;
}

/** ทาเนงาชิมะ: เด็คของผู้เล่นทุกคนจะไม่ถูกทิ้ง */
export function millBlocked(state: GameState, db: CardDatabase): boolean {
  return fieldHas(state, db, ['p1', 'p2'], 'noMill');
}

/** คิชูด็อก: จั่วตั้งแต่ 2 ใบในครั้งเดียวโดยเอฟเฟกต์ = การ์ดบนสนาม/ในมือของฝ่ายนั้นไปใต้สุดเด็ค */
export function multiDrawPunished(state: GameState, db: CardDatabase): boolean {
  return fieldHas(state, db, ['p1', 'p2'], 'multiDrawPunish');
}

/** ลองเคพ: ไลฟ์ของผู้เล่นนี้เสียหายจากสปิริตคู่แข่งได้ 1 เม็ดต่อตัวต่อเทิร์น */
/**
 * ความเสียหายต่อ Life ถ้าการโจมตีของ attackerId ไม่ถูกป้องกัน (คาดการณ์ ไม่แก้ state)
 * สูตรเดียวกับตอนตัดสินการต่อสู้ใน game.ts (ใช้แสดงผล เช่น แถบ Final Blow ของหน้าเว็บ)
 */
export function attackLifeDamage(state: GameState, db: CardDatabase, attackerId: string): number {
  const attacker = state.cards[attackerId];
  if (!attacker) return 0;
  const defender = attacker.owner === 'p1' ? 'p2' : 'p1';
  const extra = Object.values(extraSymbols(state, db, attackerId)).reduce<number>((n, v) => n + (v ?? 0), 0);
  const override = state.battle?.symbolOverride?.cardId === attackerId ? state.battle.symbolOverride.count : null;
  const braves = attacker.braves.reduce((n, b) => n + symbolCount(db.get(state.cards[b]!.cardNo)), 0);
  let dmg = override ?? symbolCount(db.get(attacker.cardNo)) + braves + extra;
  if (state.symbolsZero?.turn === state.turn && dmg >= state.symbolsZero.minSymbols) dmg = 0;
  if (symbolsZeroCard(state, attackerId, db)) dmg = 0;
  if ((state.lifeShields ?? []).some((l) => l.player === defender && l.turn === state.turn && fieldCost(state, db, attackerId) >= l.minCost)) dmg = 0;
  if ((state.noLifeDamageCards ?? []).some((l) => l.cardId === attackerId && l.player === defender && l.turn === state.turn)) dmg = 0;
  // กำแพงผลึกขาว: ในเทิร์นนี้ไลฟ์เสียหายรวมได้ไม่เกิน 1 (ที่เสียไปแล้วหลังเริ่มมีผลนับด้วย)
  const capOne = (state.lifeCapOne ?? []).find((l) => l.player === defender && l.turn === state.turn);
  if (capOne) dmg = Math.min(dmg, Math.max(0, 1 - (capOne.used ?? 0)));
  if (dmg > 0 && lifeDamageCapped(state, db, defender)) {
    const rec = state.lifeDamageBy?.turn === state.turn && state.lifeDamageBy.player === defender ? state.lifeDamageBy : null;
    dmg = rec?.ids.includes(attackerId) ? 0 : 1;
  }
  return dmg;
}

export function lifeDamageCapped(state: GameState, db: CardDatabase, player: PlayerId): boolean {
  return fieldHas(state, db, [player], 'lifeDamageCap');
}

/** [Quick] ของการ์ดในมือนี้: ของตัวเอง หรือได้รับจากการ์ดบนสนามของเรา (เกรย์ไนท์) */
export function quickAbility(state: GameState, db: CardDatabase, cardId: string): Extract<Ability, { kind: 'quick' }> | undefined {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const own = def.abilities.find((a): a is Extract<Ability, { kind: 'quick' }> => a.kind === 'quick');
  if (own) return own;
  if (def.type !== 'spirit' || !handCards(state, card.owner).includes(cardId)) return undefined;
  for (const id of state.players[card.owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind === 'grantQuick' && a.levels.includes(level) && matchesFilter(state, db, cardId, a.filter) && conditionHolds(state, id, a.if, false, false, db)) {
        return { kind: 'quick', source: -1 };
      }
    }
  }
  return undefined;
}

/**
 * Kagemusha: การ์ดในมือของ owner ที่อัญเชิญได้เมื่อ targetId (สปิริตของ owner) ตกเป็นเป้าเอฟเฟกต์ของคู่แข่ง
 * free = มีเน็กซัส (อู่พิทักษ์สวรรค์) ที่ฟื้นสภาพอยู่ให้เสื่อมสภาพเพื่ออัญเชิญฟรี
 */
export function kagemushaOptions(state: GameState, db: CardDatabase, targetId: string): { cardId: string; cost: number; payable: boolean; placeable: boolean }[] {
  const target = state.cards[targetId];
  if (!target) return [];
  const owner = target.owner;
  const p = state.players[owner];
  if (!p.field.includes(targetId) || !isSpiritLike(db.get(target.cardNo))) return [];
  const soul = target.cores.some((c) => state.cores[c]!.isSoul);
  if (!soul) {
    const fam = db.get(target.cardNo).family;
    const ok = p.field.some((id) => {
      if (effectsNegated(state, db, id)) return false;
      const level = cardLevel(state, db, id);
      return db.get(state.cards[id]!.cardNo).abilities.some((a) => a.kind === 'kagemushaNoSoul' && a.levels.includes(level) && a.families.some((f) => fam.includes(f)));
    });
    if (!ok) return [];
  }
  const cores = p.reserve.length + p.field.reduce((n, id) => n + state.cards[id]!.cores.length, 0);
  return handCards(state, owner)
    .filter((id) => db.get(state.cards[id]!.cardNo).abilities.some((a) => a.kind === 'kagemusha'))
    .map((id) => {
      const def = db.get(state.cards[id]!.cardNo);
      const cost = payableCost(state, db, owner, def);
      const need = summonMinCores(state, db, id);
      // payable = จ่ายคอสต์แล้วยังวาง Core ถึง Lv1 · placeable = อัญเชิญไม่จ่ายคอสต์แล้ววาง Core ถึง Lv1
      return { cardId: id, cost, payable: cores >= cost + need, placeable: cores >= need };
    });
}

/** เน็กซัสที่ให้อัญเชิญโดย Kagemusha ไม่จ่ายคอสต์ได้ (ฟื้นสภาพอยู่) */
export function kagemushaFreeNexus(state: GameState, db: CardDatabase, owner: PlayerId): string | undefined {
  return state.players[owner].field.find((id) => {
    const card = state.cards[id]!;
    if (card.state !== 'refresh' || effectsNegated(state, db, id)) return false;
    const level = cardLevel(state, db, id);
    return db.get(card.cardNo).abilities.some((a) => a.kind === 'kagemushaFree' && a.levels.includes(level));
  });
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
export function burstBlocked(state: GameState, db: CardDatabase, player: PlayerId, burstDef?: CardDef): boolean {
  if (state.battle?.noBurst === player) return true;
  // BS12 เมียวโอบัวม่วง / อาบิส-อโพคาลิพส์: ห้ามเบิร์สใบนี้ตามคอสต์/สี
  if (burstDef && cardBanSource(state, db, player, burstDef)) return true;
  // BS09 ไดบีท: ในเทิร์นนี้คู่แข่งสั่งใช้เบิร์สไม่ได้
  if ((state.burstBans ?? []).some((b) => b.player === player && b.turn === state.turn)) return true;
  const opp = player === 'p1' ? 'p2' : 'p1';
  const ownAttack = state.turnPlayer === opp && state.phase === 'attack';
  return state.players[opp].field.some((id) => {
    if (effectsNegated(state, db, id)) return false;
    const def = db.get(state.cards[id]!.cardNo);
    const level = cardLevel(state, db, id);
    const own = def.abilities.some((a) => a.kind === 'blockOpponentBurst' && !a.granted && a.levels.includes(level) && (a.anyTurn || ownAttack) && conditionHolds(state, id, a.if, false, false, db));
    // เบรฟที่ร่วมร่าง: ผู้ร่วมร่างได้รับ (โฮทารุมารุ)
    const granted = state.cards[id]!.braves.some((b) =>
      db.get(state.cards[b]!.cardNo).abilities.some((a) => a.kind === 'blockOpponentBurst' && a.granted && (a.anyTurn || ownAttack) && conditionHolds(state, id, a.if, false, false, db)),
    );
    return own || granted;
  });
}

/** การ์ดนี้ประกาศโจมตีได้ตอนนี้หรือไม่ (ไม่ดูเฟส): สปิริตที่ฟื้นสภาพ และไม่ถูกห้ามโจมตีในเทิร์นนี้ */
export function canAttackWith(state: GameState, db: CardDatabase, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  const def = db.get(card.cardNo);
  if (!isSpiritLike(def) || card.state !== 'refresh') return false;
  if (turnLocked(state, cardId)) return false;
  if (!effectsNegated(state, db, cardId)) {
    const level = cardLevel(state, db, cardId);
    if (def.abilities.some((a) => a.kind === 'cannotAttack' && a.levels.includes(level) && conditionHolds(state, cardId, a.if, false, false, db))) return false;
  }
  if ((state.turnNoAttack ?? []).some((t) => t.cardId === cardId && t.turn === state.turn)) return false;
  // BS09 สุสานของจักรพรรดิมาร: คอร์ 1 เม็ดโจมตีไม่ได้ / ต้องส่งคอร์ 2 เม็ดลงแทรชเพื่อโจมตี
  if (oneCoreLocked(state, db, cardId)) return false;
  if (card.cores.length < attackTaxFor(state, db, card.owner)) return false;
  // BS12 แคพิทัลแคพิทัล: ต้องส่งคอร์ในรีเสิร์ฟลงแทรช
  if (ownerZones(state, cardId).reserve.length < attackReserveTaxFor(state, db, cardId).cores) return false;
  if (coreTaxed(state, card.owner) && !card.cores.some((c) => !state.cores[c]!.isSoul)) return false;
  // "ในเทิร์นนี้ สปิริตคู่แข่งทั้งหมดโจมตีไม่ได้" ลงผลกับสปิริตแต่ละตัว: ตัวที่ไม่รับผลเอฟเฟกต์ของการ์ดต้นเหตุยังโจมตีได้ (เจ้าของโปรเจกต์กำหนด)
  return !(state.attackBans ?? []).some(
    (b) => b.player === card.owner && b.turn === state.turn && b.types.includes(def.type) && !(b.sourceId && effectBlocked(state, db, b.sourceId, cardId)),
  );
}

/** "ในเทิร์นนี้ สปิริตนั้นจะโจมตี/ป้องกันไม่ได้" */
export function turnLocked(state: GameState, cardId: string): boolean {
  return (state.turnLocks ?? []).some((l) => l.cardId === cardId && l.turn === state.turn);
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
  const b = state.battle;
  const list = state.players[defender].field.filter((id) => {
    const card = state.cards[id]!;
    const def = db.get(card.cardNo);
    if (b?.blockers.includes(id)) return false; // ประกาศป้องกันไปแล้ว (ป้องกันได้แม้เสื่อมสภาพก็ไม่นับซ้ำ)
    if (b?.blockFilter && !matchesFilter(state, db, id, b.blockFilter)) return false;
    if (attacker && attackerUnblockable(state, attacker.id, def.type)) return false;
    if (turnLocked(state, id)) return false;
    if (oneCoreLocked(state, db, id)) return false;
    if (coreTaxed(state, defender) && !card.cores.some((c) => !state.cores[c]!.isSoul)) return false;
    // ไทรซอร์ดอน: ป้องกันสปิริตที่ BP น้อยกว่าสปิริตนี้ไม่ได้
    if (attacker && cannotBlockLowerBp(state, db, id) && currentBp(state, db, attacker.id) < currentBp(state, db, id)) return false;
    // โนอา-เฟลอร์: ไม่ถูกป้องกันโดยสปิริต/อัลติเมทคอสต์ไม่เกิน N
    if (attacker && costBlockBan(state, db, attacker.id, id)) return false;
    // ฮาคุเกอิน: สปิริตที่ BP ไม่เกินผู้โจมตีป้องกันไม่ได้
    if (b?.blockBpBan && attacker && def.type !== 'ultimate' && currentBp(state, db, id) <= currentBp(state, db, attacker.id)) return false;
    // รินเนะ: ในการต่อสู้นี้ตัวที่ฟื้นสภาพป้องกันไม่ได้ ตัวที่เสื่อมสภาพป้องกันได้
    if (b?.exhaustedBlock) return card.state === 'exhausted' && isSpiritLike(def) && (sameCost === null || def.cost === sameCost);
    return (card.state === 'refresh' || canBlockExhausted(state, db, id)) && isSpiritLike(def) && (sameCost === null || def.cost === sameCost);
  });
  // BS09 ไดบีท: ต้องป้องกันด้วยสปิริต 2 ตัว หรืออัลติเมท 2 ตัว (ประเภทเดียวกับตัวแรกที่ประกาศ)
  if (b?.pairBlock) {
    const kind = (x: string) => (db.get(state.cards[x]!.cardNo).type === 'ultimate' ? 'ultimate' : 'spirit');
    const first = b.blockers[0];
    if (first) {
      const same = list.filter((x) => kind(x) === kind(first));
      return b.blockers.length + same.length >= 2 ? same : [];
    }
    return list.filter((x) => list.filter((y) => kind(y) === kind(x)).length >= 2);
  }
  // แคนดี้-ซาร์ด: ป้องกันได้เฉพาะเมื่อรวม Lv ของผู้ป้องกัน (ที่ประกาศแล้ว + ที่ป้องกันได้ทั้งหมด) ถึงเกณฑ์
  if (b?.levelBlock) {
    const lv = (ids: string[]) => ids.reduce((n, x) => n + cardLevel(state, db, x), 0);
    if (lv(b.blockers) + lv(list) < b.levelBlock) return [];
  }
  // ฮิเมะเนโกะ: ต้องส่งคอร์รีเสิร์ฟลงแทรชก่อนป้องกัน (ยังไม่จ่าย และคอร์ไม่พอ = ป้องกันไม่ได้)
  if (b?.blockTax && !b.blockTax.paid && state.players[defender].reserve.length < b.blockTax.reserveToTrash) return [];
  // อาคิตะ-ด็อก: ต้องทิ้งการ์ดบนมือก่อนป้องกัน
  if (b?.blockTax?.discard && !b.blockTax.paid && handCards(state, defender).length < b.blockTax.discard) return [];
  // [Consecutive Blade]: ตัวที่ไม่มีชีลด์ (ไม่รับผลของผู้โจมตี) ต้องป้องกันให้ครบก่อน
  // ตัวที่มีชีลด์จะมาแย่งช่องไม่ได้ ยกเว้นตัวไม่มีชีลด์ไม่พอ (กติกา 14 Consecutive Blade Q&A 4-5)
  if (b?.consecutiveBlade && b.mustBlock) {
    const plain = list.filter((id) => !effectBlocked(state, db, b.attackerId, id));
    if (plain.length >= b.maxBlockers - b.blockers.length) return plain;
  }
  return list;
}

/**
 * ฝ่ายป้องกันถูกบังคับให้ป้องกัน ([True-Rage] / [Consecutive Blade]): มีตัวที่ป้องกันได้และไม่มีชีลด์กันผู้โจมตี
 * ผู้โจมตีตั้งเงื่อนไขการป้องกันไว้ (ต้องจ่ายก่อนป้องกัน / ต้องใช้ Lv รวมหลายตัว) = ไม่บังคับ (กติกา 14 Rage Q&A 9-10)
 */
export function blockForced(state: GameState, db: CardDatabase): boolean {
  const b = state.battle;
  if (!b?.mustBlock) return false;
  if (b.levelBlock) return false;
  if (b.blockTax && !b.blockTax.paid) return false;
  const defender = state.cards[b.attackerId]!.owner === 'p1' ? 'p2' : 'p1';
  return blockersFor(state, db, defender).some((id) => !effectBlocked(state, db, b.attackerId, id));
}

/** เอฟเฟกต์ Flash ที่เบรฟที่ร่วมร่างอยู่ให้ผู้ร่วมร่าง (มุราซาเมะ) */
export function grantedActivated(state: GameState, db: CardDatabase, hostId: string): Extract<Ability, { kind: 'activated' }>[] {
  return state.cards[hostId]!.braves.flatMap((b) =>
    db.get(state.cards[b]!.cardNo).abilities.filter((a): a is Extract<Ability, { kind: 'activated' }> => a.kind === 'activated' && !!a.granted),
  );
}

/** การ์ดที่เป็นเจ้าของเอฟเฟกต์ activated นี้ (เอฟเฟกต์ที่เบรฟให้ = เบรฟ) */
export function activatedSourceCard(state: GameState, db: CardDatabase, hostId: string, source: number): string {
  for (const b of state.cards[hostId]!.braves) {
    if (db.get(state.cards[b]!.cardNo).abilities.some((a) => a.kind === 'activated' && a.granted && a.source === source)) return b;
  }
  return hostId;
}

/**
 * การ์ดในมือนี้ใช้งานเป็นการ์ดเมจิคได้อย่างไรบ้าง: เมจิค / สปิริตที่ "ถือว่าเป็นการ์ดเมจิคด้วย" /
 * การ์ดสปิริตที่การ์ดบนสนามของเราให้ถือว่าเป็นเมจิค (แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ)
 */
export function handMagic(state: GameState, db: CardDatabase, cardId: string): { timing: 'main' | 'flash'; steps: Step[]; source: number; label?: string }[] {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const out: { timing: 'main' | 'flash'; steps: Step[]; source: number; label?: string }[] = [];
  for (const a of def.abilities) if (a.kind === 'magic') out.push({ timing: a.timing, steps: a.steps, source: a.source });
  if (def.type === 'magic') return out;
  const owner = state.players[card.owner];
  if (!owner.hand.includes(cardId)) return out;
  for (const id of owner.field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind !== 'grantMagic' || !a.levels.includes(level)) continue;
      if (a.attackStepOnly && state.phase !== 'attack') continue;
      if (!matchesFilter(state, db, cardId, a.filter)) continue;
      if (out.some((m) => m.source === -1 && m.label === a.label)) continue; // การ์ดชื่อเดียวกันหลายใบให้เอฟเฟกต์เดียวกัน
      out.push({ timing: a.timing, steps: a.steps, source: -1, label: a.label });
    }
  }
  return out;
}

/** สปิริตนี้มี Holy Life: ของตัวเอง (ข้อความเอฟเฟกต์ที่เลเวลนี้) หรือได้รับจากการ์ดอื่นของเรา (สมิงโยวไค นุเอะ) */
export function hasHolyLife(state: GameState, db: CardDatabase, cardId: string): boolean {
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const level = cardLevel(state, db, cardId);
  const holy = (e: unknown) => typeof (e as { text?: string }).text === 'string' && (e as { text: string }).text.includes('Holy Life');
  if (def.effects.some((e, i) => holy(e) && def.abilities.some((a) => a.source === i && 'levels' in a && a.levels.includes(level)))) return true;
  for (const id of state.players[card.owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const src = db.get(state.cards[id]!.cardNo);
    const lv = cardLevel(state, db, id);
    for (const a of src.abilities) {
      if (a.kind !== 'trigger' || a.on !== 'allyAttackHitLife' || !a.levels.includes(lv) || !holy(src.effects[a.source])) continue;
      if (a.ownTurnOnly && state.turnPlayer !== card.owner) continue;
      const fam = a.subject?.families;
      if (!fam || fam.some((f) => def.family.includes(f))) return true;
    }
  }
  return false;
}

/** อองเมียววาราชิ: ตอนนี้คอร์จากวอยด์ที่วางโดยเอฟเฟกต์มาจากไลฟ์ของเจ้าของเอฟเฟกต์แทน */
export function voidFromLife(state: GameState, db: CardDatabase): boolean {
  if (state.phase !== 'main') return false;
  return PLAYER_IDS.some((p) =>
    state.players[p].field.some((id) => {
      if (effectsNegated(state, db, id)) return false;
      const level = cardLevel(state, db, id);
      return db.get(state.cards[id]!.cardNo).abilities.some((a) => a.kind === 'voidFromLife' && a.levels.includes(level));
    }),
  );
}
const PLAYER_IDS = ['p1', 'p2'] as const;

/** Charge ของผู้เล่นนี้ (เอฟเฟกต์ BP- / ถอดคอร์ลงรีเสิร์ฟ เพิ่มขึ้น) จากการ์ดบนสนามและเบรฟที่ร่วมร่าง */
export function chargeBonus(
  state: GameState,
  db: CardDatabase,
  player: PlayerId,
  kind: 'bpMinusBoost' | 'coreRemovalBoost' | 'refreshCountBoost' | 'exhaustCountBoost',
): number {
  let n = 0;
  for (const id of state.players[player].field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) if (a.kind === kind && !a.granted && a.levels.includes(level)) n += a.amount;
    for (const b of state.cards[id]!.braves) {
      for (const a of db.get(state.cards[b]!.cardNo).abilities) if (a.kind === kind && a.granted) n += a.amount;
    }
  }
  return n;
}

/** Magic "เอฟเฟกต์นี้ใช้ได้เทิร์นละ 1 ครั้ง" ที่ใช้ไปแล้วในเทิร์นนี้ */
export function magicUsedUp(state: GameState, db: CardDatabase, player: PlayerId, cardNo: string, timing: 'main' | 'flash'): boolean {
  const def = db.get(cardNo);
  const ab = def.abilities.find((a) => a.kind === 'magic' && a.timing === timing);
  if (!ab || ab.kind !== 'magic' || !ab.oncePerTurn) return false;
  return (state.usedOncePerTurn ?? []).includes(`${player}:${cardNo}:${ab.source}`);
}

// ---------------------------------------------------------------- BS08

/** ข้อความเอฟเฟกต์ทั้งหมดของการ์ด (ใช้ตรวจคีย์เวิร์ด เช่น Showdown / Rush / Evolution) */
export function effectText(def: CardDef): string {
  return (def.effects as { text?: string }[]).map((e) => e.text ?? '').join(' ');
}

/**
 * ตัวกรอง textIncludes: คำ (ภาษาไทย) = มีคำนี้ในข้อความ · คีย์เวิร์ดภาษาอังกฤษ (Showdown, Rush, Evolution ฯลฯ) = การ์ดมีความสามารถนั้นเอง
 * ความสามารถ = คีย์เวิร์ดอยู่ต้นบรรทัดเอฟเฟกต์ / ต่อจาก "]" "." "[" / "Flash" / "Soul" / "True -" / "Heaven('s)" (Six Heaven's Rush)
 * ที่อ้างถึงเฉย ๆ ("สปิริตที่มี Showdown", "โดย Evolution", ได้รับ "True-Rage …") ไม่นับ (กุนซือ โดรเดอร์ดราก้อน เขียนรายชื่อคีย์เวิร์ดไว้ในข้อความตัวเอง)
 */
export function textHas(def: CardDef, word: string): boolean {
  const effects = def.effects as { text?: string; keyword?: string }[];
  const lines = effects.map((e) => e.text ?? '');
  if (!/^[A-Za-z]/.test(word)) return lines.some((t) => t.includes(word));
  // คีย์เวิร์ดที่ตัวแปลงแยกเก็บไว้ (Flash Quick: … → keyword 'Quick')
  if (effects.some((e) => e.keyword?.includes(word))) return true;
  for (const t of lines) {
    for (let i = t.indexOf(word); i >= 0; i = t.indexOf(word, i + 1)) {
      const before = t.slice(0, i).trimEnd();
      if (before === '' || /[\].[]$/.test(before) || /(?:Flash|Soul|True\s*-|Heaven(?:'s)?)$/.test(before)) return true;
    }
  }
  return false;
}

/** ไทรซอร์ดอน: สปิริตนี้ป้องกันสปิริตที่ BP น้อยกว่าไม่ได้ (แอทแท็คสเต็ปของคู่แข่ง) */
export function cannotBlockLowerBp(state: GameState, db: CardDatabase, cardId: string): boolean {
  if (effectsNegated(state, db, cardId)) return false;
  const lv = cardLevel(state, db, cardId);
  return db.get(state.cards[cardId]!.cardNo).abilities.some((a) => a.kind === 'cannotBlockLowerBp' && a.levels.includes(lv));
}

/** เจ้าแห่งน้ำ โอตโตะ: จำนวนคอร์ขั้นต่ำที่คู่แข่งถอดการ์ดนี้ให้ต่ำกว่าไม่ได้ (0 = ไม่มีผล) */
export function coreFloorOf(state: GameState, db: CardDatabase, cardId: string): { min: number; src: StaticSource } | null {
  const owner = state.cards[cardId]!.owner;
  let best: { min: number; src: StaticSource } | null = null;
  for (const id of state.players[owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const lv = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind !== 'coreFloor' || !ab.levels.includes(lv) || !conditionHolds(state, id, ab.if, false, false, db)) continue;
      if (!matchesFilter(state, db, cardId, ab.filter)) continue;
      // BS11 ทามะกิ: "ต่ำกว่าที่เลเวลคอสต์ที่ Lv1 ต้องการ" = จำนวนคอร์ของ Lv1 ของการ์ดนั้น
      const min = ab.min === 'lv1' ? (db.get(state.cards[cardId]!.cardNo).levels[0]?.cores ?? 0) : ab.min;
      if (min > 0 && (!best || min > best.min)) best = { min, src: { cardId: id, source: ab.source } };
    }
  }
  return best;
}

/** การ์ดนี้ใช้ [Evolution] ได้ไหม (ของตัวเอง หรือได้รับจากการ์ดของเรา: ซามูไร-ดราก้อน-อามาสึ) */
export function hasEvolutionNow(state: GameState, db: CardDatabase, cardId: string): boolean {
  const card = state.cards[cardId]!;
  const level = cardLevel(state, db, cardId);
  if (db.get(card.cardNo).abilities.some((a) => a.kind === 'evolution' && a.levels.includes(level))) return true;
  for (const id of state.players[card.owner].field) {
    if (effectsNegated(state, db, id)) continue;
    const lv = cardLevel(state, db, id);
    for (const ab of db.get(state.cards[id]!.cardNo).abilities) {
      if (ab.kind === 'grantEvolution' && ab.levels.includes(lv) && matchesFilter(state, db, cardId, ab.filter)) return true;
    }
  }
  return false;
}

/** BP ที่ใช้เทียบใน Showdown (รวม "ขณะทำการ Showdown สปิริตนี้ BP+") */
export function showdownBp(state: GameState, db: CardDatabase, cardId: string): number {
  let bp = currentBp(state, db, cardId);
  if (!effectsNegated(state, db, cardId)) {
    const lv = cardLevel(state, db, cardId);
    for (const ab of db.get(state.cards[cardId]!.cardNo).abilities) if (ab.kind === 'showdownBp' && ab.levels.includes(lv)) bp += ab.amount;
  }
  return bp;
}

/** การ์ดนี้ของ player อัญเชิญไม่ได้ในเทิร์นนี้ (เฮียวจินดราก้อน) */
export function summonBanned(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef): boolean {
  return (state.summonBans ?? []).some((b) => b.player === player && b.turn === state.turn && b.types.includes(def.type) && def.cost <= b.maxCost);
}

/** เงื่อนไขอัญเชิญของอัลติเมท ("ไลฟ์เราไม่เกิน N") ผ่านไหม */
export function summonConditionOk(state: GameState, db: CardDatabase, cardId: string, opts: { paidWithSoul?: boolean } = {}): boolean {
  const cond = db.get(state.cards[cardId]!.cardNo).summonCondition as (Condition & { text?: string }) | undefined;
  if (!cond) return true;
  // BS09 เหล่าคนใกล้ชิด: ใช้โซลคอร์ร่วมจ่ายคอสต์ = อัญเชิญโดยไม่สนเงื่อนไข (opts.paidWithSoul ไม่ระบุ = ถามว่า "อัญเชิญได้ถ้าจ่ายด้วยโซลคอร์" ด้วย)
  if (opts.paidWithSoul !== false && ignoreSummonConditionSource(state, db, cardId)) return true;
  const { text: _t, ...c } = cond as Condition & { text?: string };
  return conditionHolds(state, cardId, c as Condition, false, false, db);
}

/** BS09: การ์ดของเราที่ให้การ์ดนี้ใช้โซลคอร์ร่วมจ่าย เพื่ออัญเชิญโดยไม่สนเงื่อนไข */
export function ignoreSummonConditionSource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  const owner = state.cards[cardId]!.owner;
  for (const src of staticSources(state, db, [owner], 'ignoreSummonCondition')) {
    const ab = db.get(state.cards[src.cardId]!.cardNo).abilities.find((a) => a.kind === 'ignoreSummonCondition' && a.source === src.source);
    if (ab?.kind === 'ignoreSummonCondition' && matchesFilter(state, db, cardId, ab.filter)) return src;
  }
  return null;
}

/** ฟุทสึโนะมิทามะ: ผู้เล่นทุกคนนำคอร์จากวอยด์มาวางที่ไลฟ์ไม่ได้ */
export function noLifeFromVoidSource(state: GameState, db: CardDatabase): StaticSource | null {
  return staticSources(state, db, ['p1', 'p2'], 'noLifeFromVoid')[0] ?? null;
}

// ---------------------------------------------------------------- แคชผลคำนวณ (หน้าเว็บ)
/*
 * หน้าเว็บวาดจอใหม่ทีไรต้องคำนวณเลเวล/สี/เจ็ม/คอสต์ของการ์ดทุกใบซ้ำหลายร้อยครั้ง (ฟังก์ชันพวกนี้เรียกกันเองเป็นทอด ๆ)
 * state ที่หน้าเว็บถืออยู่ไม่ถูกแก้อีกแล้ว (engine สร้าง state ใหม่ทุก action) → จำผลไว้ต่อ state หนึ่งก้อน
 * - ใช้เฉพาะ state ที่ถูกประกาศด้วย freezeForCache (engine ระหว่างทำ action แก้ state ไปเรื่อย ๆ = ไม่ใช้แคช ผลการเล่นไม่เปลี่ยน)
 * - ใช้เฉพาะตอนไม่มีตัวกันวนซ้ำตัวไหนทำงานอยู่ (ระหว่างนั้นผลขึ้นกับบริบท เช่น checkingMaxLevel)
 */
const frozenStates = new WeakSet<object>();
const memoStore = new WeakMap<object, { db: CardDatabase; map: Map<string, unknown> }>();
/** ประกาศว่า state นี้จะไม่ถูกแก้อีก (ให้ฟังก์ชันใน rules จำผลคำนวณได้) */
export function freezeForCache(state: GameState): void {
  frozenStates.add(state);
}
function memo<T>(state: GameState, db: CardDatabase, key: string, compute: () => T): T {
  if (!frozenStates.has(state) || checkingMaxLevel || boostingLevel.size > 0 || levelBoostDepth > 0 || checkingNegation || checkingAllColor || checkingCopy) return compute();
  let entry = memoStore.get(state);
  if (!entry || entry.db !== db) {
    entry = { db, map: new Map() };
    memoStore.set(state, entry);
  }
  if (entry.map.has(key)) return entry.map.get(key) as T;
  const v = compute();
  entry.map.set(key, v);
  return v;
}
export function cardLevel(state: GameState, db: CardDatabase, cardId: string): number {
  return memo(state, db, 'cardLevel|' + cardId, () => cardLevelRaw(state, db, cardId));
}
export function maxLevelAllySource(state: GameState, db: CardDatabase, cardId: string): StaticSource | null {
  return memo(state, db, 'maxLevelAllySource|' + cardId, () => maxLevelAllySourceRaw(state, db, cardId));
}
export function effectsNegated(state: GameState, db: CardDatabase, cardId: string): boolean {
  return memo(state, db, 'effectsNegated|' + cardId, () => effectsNegatedRaw(state, db, cardId));
}
export function currentBp(state: GameState, db: CardDatabase, cardId: string): number {
  return memo(state, db, 'currentBp|' + cardId, () => currentBpRaw(state, db, cardId));
}
export function statCopySource(state: GameState, db: CardDatabase, cardId: string): string | null {
  return memo(state, db, 'statCopySource|' + cardId, () => statCopySourceRaw(state, db, cardId));
}
export function cardFamilies(state: GameState, db: CardDatabase, cardId: string): string[] {
  return [...memo(state, db, 'cardFamilies|' + cardId, () => cardFamiliesRaw(state, db, cardId))];
}
export function cardColors(state: GameState, db: CardDatabase, cardId: string): CardDef['colors'] {
  return [...memo(state, db, 'cardColors|' + cardId, () => cardColorsRaw(state, db, cardId))];
}
export function extraSymbols(state: GameState, db: CardDatabase, cardId: string): Partial<Record<SymbolColor, number>> {
  return { ...memo(state, db, 'extraSymbols|' + cardId, () => extraSymbolsRaw(state, db, cardId)) };
}
export function fieldSymbols(state: GameState, db: CardDatabase, player: PlayerId): Partial<Record<SymbolColor, number>> {
  return { ...memo(state, db, 'fieldSymbols|' + player, () => fieldSymbolsRaw(state, db, player)) };
}
export function payableCost(state: GameState, db: CardDatabase, player: PlayerId, def: CardDef, base: number = def.cost): number {
  return memo(state, db, 'payableCost|' + player + '|' + def.cardNo + '|' + base, () => payableCostRaw(state, db, player, def, base));
}

// ---------------------------------------------------------------- BS13
/**
 * การ์ดของคู่แข่งที่ทำให้การ์ดนี้ฟื้นสภาพไม่ได้ (opponentNoRefresh: โซอุม = รีเฟรชสเต็ป, ก็อด-เซคส์ Six Heaven's Rush = ทุกทาง)
 * byEffect = ฟื้นสภาพด้วยเอฟเฟกต์ (นับเฉพาะ anyRefresh)
 */
export function noRefreshSource(state: GameState, db: CardDatabase, cardId: string, byEffect: boolean): StaticSource | null {
  const card = state.cards[cardId];
  if (!card) return null;
  const opp = card.owner === 'p1' ? 'p2' : 'p1';
  for (const src of state.players[opp].field) {
    if (effectsNegated(state, db, src)) continue;
    const level = cardLevel(state, db, src);
    for (const a of db.get(state.cards[src]!.cardNo).abilities) {
      if (a.kind !== 'opponentNoRefresh' || !a.levels.includes(level) || (byEffect && !a.anyRefresh)) continue;
      if (!matchesFilter(state, db, cardId, a.filter) || !conditionHolds(state, src, a.if, false, false, db)) continue;
      // ตัวที่ไม่รับผลเอฟเฟกต์ของการ์ดต้นเหตุ (ก็อด-เซคส์ / Shield) ยังฟื้นสภาพได้ (เจ้าของโปรเจกต์กำหนด เหมือน attackBans)
      if (effectBlocked(state, db, src, cardId)) continue;
      return { cardId: src, source: a.source };
    }
  }
  return null;
}

/** สถานที่ศักดิ์สิทธิ์ต้องห้าม: เด็คของผู้เล่นนี้ถูกทิ้งโดยเอฟเฟกต์ของคู่แข่งได้อีกกี่ใบในเทิร์นนี้ (null = ไม่จำกัด) */
export function millCapLeft(state: GameState, db: CardDatabase, player: PlayerId): { left: number; src: StaticSource } | null {
  let best: { max: number; src: StaticSource } | null = null;
  for (const id of state.players[player].field) {
    if (effectsNegated(state, db, id)) continue;
    const level = cardLevel(state, db, id);
    for (const a of db.get(state.cards[id]!.cardNo).abilities) {
      if (a.kind === 'millCap' && a.levels.includes(level) && (!best || a.max < best.max)) best = { max: a.max, src: { cardId: id, source: a.source } };
    }
  }
  if (!best) return null;
  const used = state.milledByOpponent?.turn === state.turn ? (state.milledByOpponent[player] ?? 0) : 0;
  return { left: Math.max(0, best.max - used), src: best.src };
}
