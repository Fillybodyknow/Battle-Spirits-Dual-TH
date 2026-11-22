/**
 * บอทระดับกลาง (สำหรับโหมด Story ในอนาคต)
 *
 * หลักการ: ทุกครั้งที่บอทต้องตัดสินใจ → หาท่าที่ทำได้ (legalActions) → ลองเล่นแต่ละท่าบนสำเนาของเกม (applyAction ไม่แก้ state เดิม)
 * → เล่นต่ออัตโนมัติจนถึงจุดตัดสินใจถัดไป (settle: ตัวเลือกระหว่างเอฟเฟกต์ / Flash / การป้องกันของคู่แข่ง ใช้นโยบายง่าย ๆ)
 * → ให้คะแนนกระดาน (evaluate) แล้วเลือกท่าที่ได้คะแนนสูงสุด
 *
 * ไม่โกง: ก่อนจำลอง การ์ดที่บอทมองไม่เห็น (มือ/เบิร์สของคู่แข่ง, เด็คทั้งสองฝ่าย) ถูกแทนด้วยการ์ดว่างไม่มีเอฟเฟกต์ และสุ่มด้วย seed คงที่
 * deterministic: ไม่ใช้ Math.random (ผลเหมือนเดิมทุกครั้งจาก state เดียวกัน)
 */
import { CLONE_CARD_NO, type CardDatabase, type CardDef } from '@bs/cards';
import { applyAction } from './game';
import {
  activatableOptions,
  baseCost,
  blockersFor,
  canAttackWith,
  cardLevel,
  currentBp,
  effectsNegated,
  handMagic,
  isSpiritLike,
  payableCost,
  quickAbility,
  symbolCount,
} from './rules';
import type { Action, ChoicePick, GameState, PendingChoice, PlayerId, Seat } from './types';
import { burstSetDone } from './seats';
import { allZones, itemSeat, ownField, seatOfCard, seatsOf, useSeat } from './seats';

const opp = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');

/** ผู้เล่นที่ต้องทำอะไรสักอย่างตอนนี้ (null = เกมจบ) */
export function actorOf(s: GameState): PlayerId | null {
  if (s.winner) return null;
  if (s.choice) return s.choice.player;
  if (s.awaitingDraw) return s.awaitingDraw;
  const b = s.battle;
  if (b?.flash) return b.flash.priority;
  if (b?.step === 'declareBlock') return opp(s.turnPlayer);
  return s.turnPlayer;
}

/**
 * 2VS2: ที่นั่งของฝั่ง actor ที่ต้องตัดสินใจตอนนี้
 * เมน/แอทแท็คสเต็ป = คนแรกที่ยังไม่กดพร้อม · แฟลช = คนแรกที่ยังไม่กดผ่าน · ป้องกัน = ทั้งสองคน (เลือกผู้ป้องกันของตัวเอง)
 * ตัวเลือกของเอฟเฟกต์ = ที่นั่งที่เอฟเฟกต์ทำงานอยู่ (ของเรา / คู่แข่งที่ถูกเลือก)
 */
export function actorSeats(s: GameState): Seat[] {
  const who = actorOf(s);
  if (!who || s.mode !== '2v2') return [0];
  const all = seatsOf(s, who);
  if (s.choice) {
    const cur = s.queue[0];
    if (!cur) return [0];
    return [cur.controller === who ? itemSeat(s, cur) : (cur.oppSeat ?? 0)];
  }
  if (s.awaitingDraw) return [0];
  const b = s.battle;
  if (b?.flash) return [all.find((x) => !(b.flash!.seatsPassed ?? []).includes(x)) ?? 0];
  if (b?.step === 'declareBlock') {
    const left = all.filter((x) => !(b.noBlockVotes ?? []).includes(x));
    return left.length ? left : all;
  }
  return [all.find((x) => !(s.seatsReady ?? []).includes(x)) ?? 0];
}

const withSeat = (a: Action, seat: Seat): Action => (seat ? { ...a, seat } : a);

// ---------------------------------------------------------------- ข้อมูลที่บอทเห็น

/** สำเนาสำหรับจำลอง: ซ่อนข้อมูลที่ผู้เล่น me มองไม่เห็น (ไม่โกง) และตัด log (ไม่จำเป็นต่อการจำลอง ทำให้ clone เร็วขึ้น) */
export function botView(s: GameState, me: PlayerId): GameState {
  const v = structuredClone(s);
  v.log = [];
  v.rng = 0x5eed;
  const blank = (id: string) => {
    const c = v.cards[id];
    if (!c) return;
    c.cardNo = CLONE_CARD_NO;
    delete c.realCardNo;
  };
  const o = v.players[opp(me)];
  o.hand.forEach(blank);
  if (o.burst) blank(o.burst);
  for (const p of ['p1', 'p2'] as const) v.players[p].deck.forEach(blank);
  // 2VS2: คู่แข่งคนที่สอง (มือ/เบิร์ส) และเด็คของคนที่สองทั้งสองฝั่ง
  if (o.partner) {
    o.partner.hand.forEach(blank);
    if (o.partner.burst) blank(o.partner.burst);
  }
  for (const p of ['p1', 'p2'] as const) v.players[p].partner?.deck.forEach(blank);
  // สปิริตร่างแยกของคู่แข่ง: ไม่รู้การ์ดจริง
  for (const id of o.field) delete v.cards[id]!.realCardNo;
  return v;
}

// ---------------------------------------------------------------- ให้คะแนนกระดาน

/** คะแนนของกระดานจากมุมของ me (สูง = ดีสำหรับ me) */
export function evaluate(s: GameState, db: CardDatabase, me: PlayerId): number {
  if (s.winner) return s.winner === me ? 1e6 : -1e6;
  return side(s, db, me, true) - side(s, db, opp(me), false);
}

function side(s: GameState, db: CardDatabase, p: PlayerId, isMe: boolean): number {
  const pl = s.players[p];
  // 2VS2: โซนส่วนตัวของทั้งสองคนในทีม · ทีมแพ้เมื่อไลฟ์เป็น 0 ทั้งคู่ = ความอันตรายดูจากไลฟ์ที่มากที่สุด
  const zones = allZones(s, p);
  let v = 0;
  // ไลฟ์ยิ่งน้อยยิ่งอันตราย (เม็ดท้าย ๆ มีค่ามากขึ้น)
  const life = Math.max(...zones.map((z) => z.life.length));
  v += life * 1200 + (life <= 2 ? -1500 : 0) + (life <= 1 ? -2500 : 0);
  // ไลฟ์ของอีกคน (ไม่ใช่ตัวตัดสินแพ้ แต่ยังมีค่า: เบิร์ส/เงื่อนไขไลฟ์)
  if (zones.length > 1) v += (zones.reduce((n, z) => n + z.life.length, 0) - life) * 250;
  /** คู่แข่งมีสปิริตที่จะโจมตีเราได้ในเทิร์นหน้า */
  const threat = s.players[opp(p)].field.filter((id) => isSpiritLike(db.get(s.cards[id]!.cardNo))).length;
  for (const id of pl.field) {
    const c = s.cards[id]!;
    const def = db.get(c.cardNo);
    v += c.cores.length * 60;
    if (isSpiritLike(def)) {
      const lv = cardLevel(s, db, id);
      if (lv <= 0) continue;
      v += 350 + currentBp(s, db, id) / 25 + lv * 80 + symbolCount(def) * 120 + abilityValue(s, db, id, lv);
      for (const b of c.braves) v += 250 + symbolCount(db.get(s.cards[b]!.cardNo)) * 120;
      // เทิร์นของเรา: ตัวที่เสื่อมสภาพป้องกันในเทิร์นคู่แข่งไม่ได้ (ไลฟ์ยิ่งน้อย ตัวป้องกันยิ่งมีค่า)
      if (c.state === 'exhausted' && s.turnPlayer === p && threat > 0) v -= 120 + Math.max(0, 5 - life) * 160;
    } else {
      v += 280 + cardLevel(s, db, id) * 60 + symbolCount(def) * 120 + abilityValue(s, db, id, cardLevel(s, db, id));
    }
  }
  // เทิร์นของเรา: เทิร์นหน้าคู่แข่งตีเข้าไลฟ์ได้เท่าไร (ตัวที่ยังฟื้นสภาพของเรากันได้ตัวละ 1 การโจมตีที่แรงสุด)
  if (s.turnPlayer === p) {
    const incoming = s.players[opp(p)].field
      .filter((id) => isSpiritLike(db.get(s.cards[id]!.cardNo)) && cardLevel(s, db, id) > 0)
      .map((id) => symbolCount(db.get(s.cards[id]!.cardNo)) + s.cards[id]!.braves.reduce((n, b) => n + symbolCount(db.get(s.cards[b]!.cardNo)), 0))
      .sort((a, b) => b - a);
    const blockers = pl.field.filter((id) => isSpiritLike(db.get(s.cards[id]!.cardNo)) && s.cards[id]!.state === 'refresh' && cardLevel(s, db, id) > 0).length;
    const dmg = incoming.slice(blockers).reduce((n, k) => n + k, 0);
    if (dmg >= life) v -= 7000;
    else v -= dmg * 150;
  }
  for (const z of zones) {
    v += z.reserve.length * 55;
    v += z.hand.length * 110;
    if (z.burst) v += isMe ? 220 : 180;
  }
  // เด็คหมด = แพ้ (2VS2: ต้องหมดทั้งคู่)
  const deck = Math.max(...zones.map((z) => z.deck.length));
  if (deck < 6) v -= (6 - deck) * 300;
  return v;
}

/**
 * ค่าของเอฟเฟกต์ที่ "เปิดใช้" อยู่บนการ์ดนี้: บรรทัดเอฟเฟกต์ที่เลเวลตอนนี้ใช้ได้ (ไม่ถูกลบล้าง)
 * เงื่อนไข "มีโซลคอร์วางอยู่บนสปิริตนี้" ต้องมีโซลคอร์จริง → บอทรู้ว่าการเพิ่มเลเวล/วางโซลคอร์ทำให้เอฟเฟกต์ทำงาน (เช่น ก็อด-เซคส์ Lv2)
 */
function abilityValue(s: GameState, db: CardDatabase, id: string, lv: number): number {
  if (lv <= 0 || effectsNegated(s, db, id)) return 0;
  const card = s.cards[id]!;
  const soul = card.cores.some((c) => s.cores[c]!.isSoul);
  let v = 0;
  for (const a of db.get(card.cardNo).abilities) {
    const levels = (a as { levels?: number[] }).levels;
    if (!levels || !levels.includes(lv)) continue;
    const cond = (a as { if?: unknown }).if;
    if (!soul && cond && JSON.stringify(cond).includes('"soulOnSelf"')) continue;
    v += 120;
  }
  return v;
}

// ---------------------------------------------------------------- จ่ายคอสต์

/** Core สำหรับจ่ายจากรีเสิร์ฟ: ใช้คอร์ธรรมดาก่อน เก็บโซลคอร์ไว้ (null = ไม่พอ) */
function payFrom(s: GameState, p: PlayerId, n: number, exclude: string[] = []): string[] | null {
  if (n <= 0) return [];
  const pool = s.players[p].reserve.filter((c) => !exclude.includes(c));
  const ordered = [...pool.filter((c) => !s.cores[c]!.isSoul), ...pool.filter((c) => s.cores[c]!.isSoul)];
  return ordered.length >= n ? ordered.slice(0, n) : null;
}

/**
 * Core สำหรับวาง/จ่าย ที่ดึงจากการ์ดบนสนามได้ด้วย (รีเสิร์ฟก่อน แล้วค่อยดึงคอร์ส่วนเกินจากสปิริตเรา ไม่ให้ตัวไหนต่ำกว่า Lv1)
 * สุดท้ายถ้ายังไม่พอ ยอมดึงจนสปิริตสูญสลาย (ต้องทำตามกติกา "ต้องวางอย่างน้อย N")
 */
function coresAnywhere(s: GameState, db: CardDatabase, p: PlayerId, n: number, exclude: string[] = []): string[] | null {
  if (n <= 0) return [];
  const out = payFrom(s, p, Math.min(n, s.players[p].reserve.filter((c) => !exclude.includes(c)).length), exclude) ?? [];
  const surplus: string[] = [];
  const rest: string[] = [];
  for (const id of ownField(s, p)) {
    const card = s.cards[id]!;
    const def = db.get(card.cardNo);
    const keep = def.type === 'nexus' ? 0 : (def.levels[0]?.cores ?? 1);
    const cores = [...card.cores.filter((c) => !s.cores[c]!.isSoul), ...card.cores.filter((c) => s.cores[c]!.isSoul)].filter((c) => !exclude.includes(c));
    surplus.push(...cores.slice(0, Math.max(0, card.cores.length - keep)));
    rest.push(...cores.slice(Math.max(0, card.cores.length - keep)));
  }
  for (const c of [...surplus, ...rest]) {
    if (out.length >= n) break;
    out.push(c);
  }
  return out.length >= n ? out : null;
}

/**
 * จ่ายคอสต์: รีเสิร์ฟก่อน แล้วค่อยใช้คอร์ส่วนเกินบนการ์ดของเรา (ไม่ให้ตัวไหนต่ำกว่า Lv1 · คอร์ธรรมดาก่อนโซลคอร์)
 * → คอร์ที่ย้ายขึ้นสนามเพื่อเพิ่มเลเวลยังใช้จ่ายการ์ดแพงในเทิร์นถัดไปได้ (null = ไม่พอ)
 */
function payAny(s: GameState, db: CardDatabase, p: PlayerId, n: number): string[] | null {
  if (n <= 0) return [];
  const free = s.players[p].reserve.length;
  const out = payFrom(s, p, Math.min(n, free)) ?? [];
  if (out.length >= n) return out;
  const surplus: string[] = [];
  for (const id of ownField(s, p)) {
    const card = s.cards[id]!;
    const def = db.get(card.cardNo);
    const keep = def.type === 'nexus' ? 0 : (def.levels[0]?.cores ?? 1);
    const cores = [...card.cores.filter((c) => !s.cores[c]!.isSoul), ...card.cores.filter((c) => s.cores[c]!.isSoul)];
    surplus.push(...cores.slice(0, Math.max(0, card.cores.length - keep)));
  }
  for (const c of surplus) {
    if (out.length >= n) break;
    out.push(c);
  }
  return out.length >= n ? out : null;
}

function handCost(s: GameState, db: CardDatabase, p: PlayerId, id: string, def: CardDef): number {
  return payableCost(s, db, p, def, baseCost(s, db, id));
}

// ---------------------------------------------------------------- ท่าที่ทำได้

/** ท่าที่ลองได้ของ me ตอนนี้ (บางท่าอาจผิดกติกา: กรองด้วย applyAction ตอนลอง) */
/**
 * 2VS2: ที่นั่งนี้เล่นได้อิสระตอนนี้ไหม (เมนสเต็ป / แอทแท็คสเต็ปที่ไม่มีการต่อสู้ค้าง ของทีมนี้ และยังไม่กดพร้อม)
 * สองคนในทีมเล่นพร้อมกันได้ (กติกา 15 ข้อ 3) ไม่ต้องรอให้อีกคนกดพร้อมก่อน
 */
export function seatFree(s: GameState, me: PlayerId, seat: Seat): boolean {
  if (s.mode !== '2v2' || s.winner || s.choice || s.awaitingDraw || s.turnPlayer !== me) return false;
  if (!(s.phase === 'main' || (s.phase === 'attack' && !s.battle))) return false;
  return !(s.seatsReady ?? []).includes(seat);
}

/** onlySeat = สร้างท่าเฉพาะที่นั่งนี้ (บอทคู่หูในหน้าเว็บ: เล่นพร้อมกับผู้เล่นได้ในเมน/แอทแท็คสเต็ป) */
export function legalActions(s: GameState, db: CardDatabase, me: PlayerId, onlySeat?: Seat): Action[] {
  if (s.mode !== '2v2' || actorOf(s) !== me) return legalActionsSeat(s, db, me);
  // 2VS2: สร้างท่าในมุมของที่นั่งที่ต้องทำ (สลับโซนในสำเนา) แล้วติดที่นั่งให้ action
  const out: Action[] = [];
  const seats = onlySeat === undefined ? actorSeats(s) : actorSeats(s).includes(onlySeat) || seatFree(s, me, onlySeat) ? [onlySeat] : [];
  for (const seat of seats) {
    let view = s;
    // state ที่รับมาอาจสลับที่นั่งไว้แล้ว (หน้าเว็บ): สลับให้ตรงที่นั่งที่จะสร้างท่าเสมอ
    if ((s.players[me].active ?? 0) !== seat) {
      view = structuredClone(s);
      useSeat(view, me, seat);
    }
    for (const a of legalActionsSeat(view, db, me)) {
      if (a.type === 'noBlock' && out.some((x) => x.type === 'noBlock')) continue;
      // ป้องกันได้เฉพาะสปิริตของตัวเอง
      if (a.type === 'declareBlock' && seatOfCard(s.cards[a.blockerId]) !== seat) continue;
      if (a.type === 'declareAttack' && seatOfCard(s.cards[a.attackerId]) !== seat) continue;
      out.push(withSeat(a, seat));
    }
  }
  return out;
}

function legalActionsSeat(s: GameState, db: CardDatabase, me: PlayerId): Action[] {
  if (s.winner) return [];
  if (s.choice) return s.choice.player === me ? choiceActions(s, db, me, s.choice) : [];
  if (s.awaitingDraw === me) return [{ type: 'drawStep', player: me }];
  const b = s.battle;
  const out: Action[] = [];
  if (b?.flash) {
    if (b.flash.priority !== me) return [];
    out.push({ type: 'passFlash', player: me });
    out.push(...flashPlays(s, db, me));
    return out;
  }
  if (b?.step === 'declareBlock') {
    if (opp(s.turnPlayer) !== me) return [];
    out.push({ type: 'noBlock', player: me });
    for (const id of blockersFor(s, db, me)) out.push({ type: 'declareBlock', player: me, blockerId: id });
    return out;
  }
  if (s.turnPlayer !== me) return [];
  if (s.phase === 'main') {
    out.push({ type: 'endMain', player: me });
    out.push(...mainPlays(s, db, me));
  } else if (s.phase === 'attack') {
    out.push({ type: 'endAttackStep', player: me });
    for (const id of s.players[me].field) if (canAttackWith(s, db, id)) out.push({ type: 'declareAttack', player: me, attackerId: id });
    out.push(...activations(s, db, me));
  }
  return out;
}

function mainPlays(s: GameState, db: CardDatabase, me: PlayerId): Action[] {
  const out: Action[] = [];
  const p = s.players[me];
  const seen = new Set<string>();
  for (const id of p.hand) {
    const def = db.get(s.cards[id]!.cardNo);
    // การ์ดชื่อเดียวกันหลายใบในมือ: ลองใบเดียวพอ
    if (seen.has(def.cardNo)) continue;
    seen.add(def.cardNo);
    const cost = handCost(s, db, me, id, def);
    const pay = payAny(s, db, me, cost);
    if (def.type === 'spirit' || def.type === 'ultimate' || def.type === 'brave') {
      if (!pay) continue;
      const left = p.reserve.filter((c) => !pay.includes(c)).length;
      const lv1 = def.levels[0]?.cores ?? 1;
      // วาง Lv1 / เลเวลสูงสุดที่วางไหว
      const counts = new Set<number>([lv1]);
      for (const l of def.levels) if (l.cores <= left) counts.add(l.cores);
      for (const n of counts) {
        const place = payFrom(s, me, n, pay);
        if (place && place.length === n) out.push({ type: 'summon', player: me, cardId: id, payment: pay, placement: place });
      }
      if (def.type === 'brave') {
        for (const host of p.field) {
          if (db.get(s.cards[host]!.cardNo).type === 'spirit' || db.get(s.cards[host]!.cardNo).type === 'ultimate') {
            out.push({ type: 'summon', player: me, cardId: id, payment: pay, placement: [], braveOnto: host });
          }
        }
      }
    } else if (def.type === 'nexus') {
      if (pay) out.push({ type: 'deployNexus', player: me, cardId: id, payment: pay, placement: [] });
    } else if (def.type === 'magic' || handMagic(s, db, id).length > 0) {
      if (!pay) continue;
      const timings = new Set(handMagic(s, db, id).map((m) => m.timing));
      for (const t of timings) out.push({ type: 'useMagic', player: me, cardId: id, payment: pay, timing: t });
    }
    if (def.burst && !burstSetDone(s, me) && !p.burst) out.push({ type: 'setBurst', player: me, cardId: id });
  }
  out.push(...coreMoves(s, db, me));
  out.push(...activations(s, db, me));
  return out;
}

/**
 * จัดคอร์ในเมนสเต็ป: เพิ่มเลเวลการ์ดบนสนามด้วยคอร์จากรีเสิร์ฟ (เลเวลถัดไป / สูงสุดที่ไหว)
 * และวางโซลคอร์จากรีเสิร์ฟบนการ์ด (เพิ่ม 1 เม็ด หรือสลับกับคอร์ธรรมดาบนการ์ดนั้น = จำนวนเท่าเดิม)
 */
function coreMoves(s: GameState, db: CardDatabase, me: PlayerId): Action[] {
  const out: Action[] = [];
  const p = s.players[me];
  const soul = p.reserve.find((c) => s.cores[c]!.isSoul);
  for (const id of ownField(s, me)) {
    const card = s.cards[id]!;
    const def = db.get(card.cardNo);
    const cur = card.cores.length;
    const need = [...new Set(def.levels.map((l) => l.cores - cur).filter((n) => n > 0 && n <= p.reserve.length))].sort((a, b) => a - b);
    for (const n of new Set([need[0], need[need.length - 1]])) {
      if (n === undefined) continue;
      const cores = payFrom(s, me, n);
      if (cores) out.push({ type: 'moveCores', player: me, moves: cores.map((coreId) => ({ coreId, to: { cardId: id } })) });
    }
    if (soul && !card.cores.some((c) => s.cores[c]!.isSoul)) {
      out.push({ type: 'moveCores', player: me, moves: [{ coreId: soul, to: { cardId: id } }] });
      const plain = card.cores.find((c) => !s.cores[c]!.isSoul);
      if (plain) out.push({ type: 'moveCores', player: me, moves: [{ coreId: soul, to: { cardId: id } }, { coreId: plain, to: { area: 'reserve' } }] });
    }
  }
  return out;
}

function flashPlays(s: GameState, db: CardDatabase, me: PlayerId): Action[] {
  const out: Action[] = [];
  const p = s.players[me];
  const seen = new Set<string>();
  for (const id of p.hand) {
    const def = db.get(s.cards[id]!.cardNo);
    if (seen.has(def.cardNo)) continue;
    seen.add(def.cardNo);
    const pay = payAny(s, db, me, handCost(s, db, me, id, def));
    if (!pay) continue;
    if (handMagic(s, db, id).some((m) => m.timing === 'flash')) out.push({ type: 'useMagic', player: me, cardId: id, payment: pay, timing: 'flash' });
    if (quickAbility(s, db, id)) {
      const place = payFrom(s, me, def.levels[0]?.cores ?? 1, pay);
      if (place) out.push({ type: 'summon', player: me, cardId: id, payment: pay, placement: place });
    }
  }
  out.push(...activations(s, db, me));
  return out;
}

function activations(s: GameState, db: CardDatabase, me: PlayerId): Action[] {
  const out: Action[] = [];
  for (const id of ownField(s, me)) {
    for (const o of activatableOptions(s, db, me, id)) out.push({ type: 'activate', player: me, cardId: id, source: o.ability.source, from: o.from });
  }
  return out;
}

/** ตัวเลือกที่จะลองสำหรับการตัดสินใจระหว่างเอฟเฟกต์ */
function choiceActions(s: GameState, db: CardDatabase, me: PlayerId, c: PendingChoice): Action[] {
  const picks: ChoicePick[] = [];
  switch (c.kind) {
    case 'option':
      c.options.forEach((_, i) => picks.push(i));
      break;
    case 'order':
      c.effects.forEach((_, i) => picks.push(i));
      break;
    case 'card':
      picks.push(...rankCards(s, db, me, c.candidates).slice(0, 10));
      if (c.optional) picks.push(null);
      break;
    case 'multiCard': {
      const ranked = rankCards(s, db, me, c.candidates);
      if (c.budget) {
        // งบรวมไม่เกิน max: เก็บตัวที่ดีที่สุดเท่าที่งบพอ
        const chosen: string[] = [];
        let used = 0;
        for (const id of ranked) {
          const v = c.budget.values[id] ?? 0;
          if (chosen.length < c.count && used + v <= c.budget.max) (chosen.push(id), (used += v));
        }
        picks.push({ cards: chosen });
      } else {
        const n = Math.min(c.count, ranked.length);
        picks.push({ cards: ranked.slice(0, n) });
        // ทางเลือกอื่น: สลับตัวสุดท้ายกับตัวถัดไป
        if (ranked.length > n) picks.push({ cards: [...ranked.slice(0, n - 1), ranked[n]!] });
      }
      break;
    }
    case 'payCost': {
      const pay = payFrom(s, me, c.cost) ?? coresAnywhere(s, db, me, c.cost);
      if (pay) picks.push({ pay });
      picks.push(null);
      break;
    }
    case 'placeCores': {
      // รีเสิร์ฟไม่พอ: ดึงคอร์ส่วนเกินจากสปิริตเรา (กติกาให้วางจากการ์ดบนสนามได้ ยกเว้นบางเอฟเฟกต์ที่วางจากรีเสิร์ฟเท่านั้น)
      const pay = payFrom(s, me, c.min) ?? coresAnywhere(s, db, me, c.min) ?? payFrom(s, me, s.players[me].reserve.length);
      if (pay) picks.push({ pay });
      const more = payFrom(s, me, c.min + 1);
      if (more) picks.push({ pay: more });
      break;
    }
    case 'multiSummon': {
      const ranked = [...c.candidates].sort((a, b) => db.get(s.cards[b]!.cardNo).cost - db.get(s.cards[a]!.cardNo).cost);
      const summons: { cardId: string; cores: string[] }[] = [];
      const used: string[] = [];
      for (const id of ranked) {
        if (c.max !== null && summons.length >= c.max) break;
        const def = db.get(s.cards[id]!.cardNo);
        const need = def.type === 'nexus' ? 0 : (def.levels[0]?.cores ?? 1);
        const cores = payFrom(s, me, need, used);
        if (!cores) continue;
        used.push(...cores);
        summons.push({ cardId: id, cores });
      }
      picks.push({ summons });
      if (summons.length > 0) picks.push({ summons: [] });
      break;
    }
    case 'arrange':
      picks.push({ order: [...c.cardIds] });
      break;
    case 'distribute': {
      // แบบที่ 1: ไล่ทีละตัวเรียงจากคอร์น้อย (ทำให้สูญสลาย) · แบบที่ 2: เกลี่ยเท่า ๆ กัน
      const byFew = [...c.candidates].sort((a, b) => (c.caps[a] ?? 0) - (c.caps[b] ?? 0));
      picks.push({ alloc: fill(byFew, c.caps, c.total) });
      picks.push({ alloc: spread(c.candidates, c.caps, c.total) });
      break;
    }
  }
  const seen = new Set<string>();
  return picks
    .filter((pk) => {
      const k = JSON.stringify(pk);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((pick) => ({ type: 'choose', player: me, pick }));
}

function fill(order: string[], caps: Record<string, number>, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = total;
  for (const id of order) {
    const n = Math.min(left, caps[id] ?? 0);
    if (n > 0) out[id] = n;
    left -= n;
  }
  return out;
}

function spread(order: string[], caps: Record<string, number>, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = total;
  for (let round = 0; left > 0 && round < 50; round++) {
    let moved = false;
    for (const id of order) {
      if (left <= 0) break;
      if ((out[id] ?? 0) < (caps[id] ?? 0)) {
        out[id] = (out[id] ?? 0) + 1;
        left--;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** เรียงการ์ดที่เลือกได้: การ์ดคู่แข่ง = ตัวที่มีค่ามากก่อน · การ์ดของเรา = ตัวที่มีค่าน้อยก่อน (เผื่อเป็นการเสียสละ) */
function rankCards(s: GameState, db: CardDatabase, me: PlayerId, ids: string[]): string[] {
  const worth = (id: string) => {
    const c = s.cards[id];
    if (!c) return 0;
    const def = db.get(c.cardNo);
    const onField = s.players[c.owner].field.includes(id);
    return onField && isSpiritLike(def) ? currentBp(s, db, id) + cardLevel(s, db, id) * 1000 : def.cost * 1000;
  };
  const key = (id: string) => (s.cards[id]?.owner === me ? -worth(id) : 1e9 + worth(id));
  return [...ids].sort((a, b) => key(b) - key(a));
}

// ---------------------------------------------------------------- เล่นต่ออัตโนมัติระหว่างจำลอง

/** นโยบายง่าย ๆ ระหว่างจำลอง (ไม่ประเมินลึก): ทางเลือกแรกที่ทำได้ / คู่แข่งป้องกันเมื่อคุ้ม */
function quickPolicy(s: GameState, db: CardDatabase, who: PlayerId): Action {
  if (s.choice) {
    const acts = choiceActions(s, db, who, s.choice);
    return acts[0] ?? { type: 'choose', player: who, pick: null };
  }
  if (s.awaitingDraw) return { type: 'drawStep', player: s.awaitingDraw };
  const b = s.battle!;
  if (b.flash) return withSeat({ type: 'passFlash', player: b.flash.priority }, actorSeats(s)[0]!);
  // ป้องกัน: ใช้ตัวที่ชนะผู้โจมตีได้ (BP สูงกว่า) ตัวที่อ่อนที่สุด · ไลฟ์จะหมด = ป้องกันด้วยตัวที่มีค่าน้อยสุด
  const def = opp(s.turnPlayer);
  const blockers = blockersFor(s, db, def);
  const atkBp = currentBp(s, db, b.attackerId);
  const winners = blockers.filter((id) => currentBp(s, db, id) > atkBp).sort((x, y) => currentBp(s, db, x) - currentBp(s, db, y));
  if (winners[0]) return withSeat({ type: 'declareBlock', player: def, blockerId: winners[0] }, seatOfCard(s.cards[winners[0]]));
  const dmg = symbolCount(db.get(s.cards[b.attackerId]!.cardNo));
  if (blockers.length > 0 && dmg >= s.players[def].life.length) {
    const cheapest = [...blockers].sort((x, y) => currentBp(s, db, x) - currentBp(s, db, y))[0]!;
    return withSeat({ type: 'declareBlock', player: def, blockerId: cheapest }, seatOfCard(s.cards[cheapest]));
  }
  // 2VS2: โหวตไม่ป้องกันในนามคนที่ยังไม่โหวต
  return withSeat({ type: 'noBlock', player: def }, actorSeats(s)[0]!);
}

/** เล่นต่ออัตโนมัติจนถึงจุดที่ต้องตัดสินใจอย่างอิสระ (เมน/แอทแท็คสเต็ปที่ไม่มีการต่อสู้ค้าง) */
function settle(s: GameState, db: CardDatabase, limit = 40): GameState {
  let cur = s;
  for (let i = 0; i < limit; i++) {
    if (cur.winner) return cur;
    const busy = !!cur.choice || !!cur.awaitingDraw || (!!cur.battle && (!!cur.battle.flash || cur.battle.step === 'declareBlock'));
    if (!busy) return cur;
    const who = actorOf(cur)!;
    const r = applyAction(cur, quickPolicy(cur, db, who), db);
    if (!r.ok) {
      // นโยบายง่ายทำไม่ได้ (เช่น ตัวเลือกที่จ่ายไม่ไหว): ไม่เลือก / ผ่าน
      const fallback: Action = cur.choice ? { type: 'choose', player: who, pick: null } : withSeat({ type: 'passFlash', player: who }, actorSeats(cur)[0]!);
      const r2 = applyAction(cur, fallback, db);
      if (!r2.ok) return cur;
      cur = r2.state;
    } else cur = r.state;
  }
  return cur;
}

// ---------------------------------------------------------------- ตัดสินใจ

export interface BotDecision {
  action: Action;
  score: number;
  /** จำนวนท่าที่ลอง (ไว้ดูประสิทธิภาพ) */
  tried: number;
}

/**
 * เลือกท่าของ me จาก state จริง (null = ไม่ใช่ตาของ me)
 * ท่าที่ "จบสเต็ป/ผ่าน" ใช้คะแนนของกระดานตอนนี้ (ไม่จำลองข้ามเทิร์น) → บอทจะทำอะไรเพิ่มก็ต่อเมื่อทำให้กระดานดีขึ้นจริง
 */
export interface BotOptions {
  /** ระดับความเก่ง 1–6 (ดาวของด่าน): ต่ำ = ใส่ความคลาดเคลื่อนให้คะแนนแต่ละท่า (เลือกท่าที่ไม่ดีที่สุดบ้าง) · 5 = เต็มที่ · 6 = คิดล่วงหน้าอีกหนึ่งท่า */
  level?: number;
  /** 2VS2: ตัดสินใจแทนที่นั่งนี้เท่านั้น (หน้าเว็บ: เพื่อนร่วมทีมเป็นบอท ไม่กดแทนผู้เล่น) */
  seat?: Seat;
  /** (ไว้ดีบัก) คะแนนของทุกท่าที่ลอง */
  debug?: { action: Action; score: number }[];
}

/** ความคลาดเคลื่อนแบบคงที่ (deterministic: ไม่ใช้ Math.random) ตามตำแหน่งในเกมและลำดับท่า */
function noise(s: GameState, i: number): number {
  const p = s.players;
  let h =
    (s.turn * 73856093) ^
    (p.p1.deck.length * 19349663) ^
    (p.p2.deck.length * 83492791) ^
    ((i + 1) * 2654435761) ^
    (p.p1.hand.length * 97) ^
    (p.p2.hand.length * 131) ^
    (p.p1.reserve.length * 7919) ^
    (p.p2.reserve.length * 104729) ^
    (p.p1.field.length * 15485863) ^
    (p.p2.field.length * 32452843) ^
    ((s.battle ? s.battle.blockers.length + 3 : 1) * 49979687) ^
    ((s.choice ? s.choice.kind.length : 0) * 67867967);
  h = Math.imul(h ^ (h >>> 15), 2246822519) ^ Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

/** คะแนนคลาดเคลื่อนเล็กน้อย (★1 ≈ ±800 · ★4 ≈ ±200) */
function jitter(s: GameState, i: number, level: number): number {
  if (level >= 5) return 0;
  return (noise(s, i) - 0.5) * (5 - Math.max(1, level)) * 400;
}

/** โอกาสที่บอทจะ "พลาด" (เลือกท่าที่ทำได้สักท่าแทนท่าที่ดีที่สุด) ตามระดับ ★1–★4 */
const BLUNDER = [0.45, 0.3, 0.18, 0.08];

/** ★6: จำนวนท่าที่ดีที่สุด (จากการดูท่าเดียว) ที่นำไปคิดต่ออีกหนึ่งท่า */
const LOOKAHEAD_TOP = 6;

/** คะแนนของท่าที่ดีที่สุดท่าเดียวจากกระดานนี้ (จบสเต็ป/ผ่าน = กระดานตอนนี้) */
function bestOneStep(s: GameState, db: CardDatabase, me: PlayerId): number {
  let best = evaluate(s, db, me);
  for (const a of legalActions(s, db, me)) {
    if (a.type === 'endMain' || a.type === 'endAttackStep') continue;
    const r = applyAction(s, a, db);
    if (!r.ok) continue;
    best = Math.max(best, evaluate(settle(r.state, db), db, me));
  }
  return best;
}

export function botDecide(real: GameState, db: CardDatabase, me: PlayerId, opts: BotOptions = {}): BotDecision | null {
  const level = opts.level ?? 5;
  const debug = opts.debug;
  if (actorOf(real) !== me) return null;
  const s = botView(real, me);
  const acts = legalActions(s, db, me, opts.seat).filter((a) => opts.seat === undefined || (a.seat ?? 0) === opts.seat);
  if (acts.length === 0) return null;
  const base = evaluate(s, db, me);
  let best: BotDecision | null = null;
  let tried = 0;
  const valid: { action: Action; score: number; after?: GameState }[] = [];
  for (const [i, a] of acts.entries()) {
    let score: number;
    // จบสเต็ป = อยู่เฉย (ไม่จำลองข้ามเทิร์น) · ผ่าน Flash ต้องจำลองต่อจนจบการต่อสู้ เพื่อเทียบกับการใช้เมจิคได้
    if (a.type === 'endMain' || a.type === 'endAttackStep') {
      // ยังต้องตรวจว่าจบได้จริง (เช่น ราดัน: ต้องโจมตีก่อนจบ Attack Step)
      if (!applyAction(s, a, db).ok) continue;
      score = base;
    } else {
      const r = applyAction(s, a, db);
      if (!r.ok) continue;
      tried++;
      const after = settle(r.state, db);
      score = evaluate(after, db, me);
      // ทางเลือกในตัวเลือกเอฟเฟกต์: ไม่มีท่า "อยู่เฉย" ให้เทียบ
      if (level >= 6) {
        valid.push({ action: a, score, after });
        continue;
      }
    }
    // ระดับต่ำ: คลาดเคลื่อน (ยกเว้นท่าที่แพ้/ชนะทันที)
    if (Math.abs(score) < 5e5) score += jitter(real, i, level);
    debug?.push({ action: a, score });
    valid.push({ action: a, score });
    // เสมอกัน: เลือกท่าแรก (ลำดับใน legalActions: จบสเต็ป/ผ่าน มาก่อน = ไม่ทำอะไรเกินจำเป็น)
    if (!best || score > best.score + 1) best = { action: a, score, tried };
  }
  // ★6: ท่าที่ดีที่สุด LOOKAHEAD_TOP ท่า ถ้าหลังจากนั้นยังเป็นตาเรา = คิดต่ออีกหนึ่งท่า (เห็นคอมโบ เช่น ย้ายคอร์เพิ่มเลเวลแล้วค่อยโจมตี)
  if (level >= 6) {
    const top = valid.filter((v) => v.after).sort((x, y) => y.score - x.score).slice(0, LOOKAHEAD_TOP);
    for (const v of top) {
      const after = v.after!;
      if (after.winner || actorOf(after) !== me) continue;
      tried++;
      v.score = Math.max(v.score, bestOneStep(after, db, me));
    }
    for (const v of valid) {
      debug?.push({ action: v.action, score: v.score });
      if (!best || v.score > best.score + 1) best = { action: v.action, score: v.score, tried };
    }
  }
  if (!best) return null;
  // ระดับต่ำ: บางครั้งพลาด (ไม่เลือกท่าที่แพ้ทันที)
  if (level < 5 && noise(real, 9973) < (BLUNDER[Math.max(1, Math.round(level)) - 1] ?? 0)) {
    const ok = valid.filter((v) => v.score > -5e5);
    const pick = ok[Math.floor(noise(real, 7919) * ok.length)];
    if (pick) best = { action: pick.action, score: pick.score, tried };
  }
  best.tried = tried;
  return best;
}

/** ท่าที่บอทเลือก (ทางลัด) */
export function botAction(real: GameState, db: CardDatabase, me: PlayerId, opts: BotOptions = {}): Action | null {
  return botDecide(real, db, me, opts)?.action ?? null;
}
