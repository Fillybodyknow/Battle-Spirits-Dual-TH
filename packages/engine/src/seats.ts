/**
 * โหมด 2VS2 (กติกา 15): ที่นั่งในทีม
 *
 * สนามของแต่ละฝั่ง (players[p].field) ใช้ร่วมกันทั้งทีม แต่โซนส่วนตัว (เด็ค มือ แทรช เบิร์ส ไลฟ์ รีเสิร์ฟ) แยกต่อคน
 * engine เดิมทั้งหมดอ่านโซนส่วนตัวจาก players[p] จึงใช้วิธี "สลับโซน": ระหว่างทำ action / เอฟเฟกต์ของที่นั่ง 1
 * โซนของที่นั่ง 1 ถูกสลับมาอยู่ที่ players[p] (ของที่นั่ง 0 ไปอยู่ที่ partner) แล้วสลับกลับเมื่อจบ
 * โค้ดเดิมที่เขียนว่า "รีเสิร์ฟ/มือของเรา" จึงได้โซนของคนที่ทำอยู่โดยไม่ต้องแก้
 *
 * ที่ต้องระวัง: ของที่ย้ายไปหา "เจ้าของ" (การ์ดลงแทรช, คอร์ออกจากสนาม) ต้องใช้ zonesOf(ที่นั่งของเจ้าของ) ไม่ใช่ players[p] ตรง ๆ
 * 1VS1: ไม่มี partner ทุกฟังก์ชันในนี้ทำงานเหมือนเดิม
 */
import type { CardInstance, CoreInstance, GameState, PersonalZones, PlayerId, PlayerState, Seat } from './types';

const PERSONAL_KEYS = ['deck', 'hand', 'trashCards', 'burst', 'life', 'reserve', 'trashCores', 'songs'] as const;

export const is2v2 = (s: GameState): boolean => s.mode === '2v2';

/** ที่นั่งที่มีในฝั่งนี้ */
export const seatsOf = (s: GameState, p: PlayerId): Seat[] => (s.players[p].partner ? [0, 1] : [0]);

export const seatOfCard = (card: CardInstance | undefined): Seat => card?.seat ?? 0;
export const seatOfCore = (core: CoreInstance | undefined): Seat => core?.seat ?? 0;

/** ที่นั่งที่โซนอยู่ที่ players[p] ตอนนี้ */
export const activeSeat = (s: GameState, p: PlayerId): Seat => s.players[p].active ?? 0;

/** โซนส่วนตัวของที่นั่ง seat ของฝั่ง p (ไม่ว่าตอนนี้จะสลับอยู่หรือไม่) */
export function zonesOf(s: GameState, p: PlayerId, seat: Seat = 0): PersonalZones {
  const pl = s.players[p];
  if (!pl.partner || activeSeat(s, p) === seat) return pl;
  return pl.partner;
}

/** สลับให้โซนของที่นั่ง seat มาอยู่ที่ players[p] */
export function useSeat(s: GameState, p: PlayerId, seat: Seat = 0): void {
  const pl = s.players[p];
  if (!pl.partner || activeSeat(s, p) === seat) return;
  swap(pl);
}

/** สลับทุกฝั่งกลับเป็นที่นั่ง 0 (สถานะปกติระหว่าง action) */
export function restoreSeats(s: GameState): void {
  for (const p of ['p1', 'p2'] as PlayerId[]) useSeat(s, p, 0);
}

function swap(pl: PlayerState): void {
  const a = pl as unknown as Record<string, unknown>;
  const b = pl.partner as unknown as Record<string, unknown>;
  for (const k of PERSONAL_KEYS) {
    const t = a[k];
    if (b[k] === undefined) delete a[k];
    else a[k] = b[k];
    if (t === undefined) delete b[k];
    else b[k] = t;
  }
  if ((pl.active ?? 0) === 0) pl.active = 1;
  else delete pl.active;
}

/**
 * ที่นั่งของผู้ควบคุมเอฟเฟกต์ในคิว: ระบุไว้ใน item.seat หรือ = ที่นั่งเจ้าของการ์ดต้นเหตุ (เมจิค/เบิร์ส/trigger ของการ์ดใบนั้น)
 * การ์ดต้นเหตุเป็นของอีกฝั่ง (ไม่ค่อยมี) = ที่นั่ง 0
 */
export function itemSeat(s: GameState, item: { controller: PlayerId; sourceId: string; seat?: Seat }): Seat {
  if (item.seat !== undefined) return item.seat;
  const card = s.cards[item.sourceId];
  return card && card.owner === item.controller ? seatOfCard(card) : 0;
}

/** ทำ fn ในฐานะที่นั่ง seat ของฝั่ง p แล้วสลับกลับเป็นที่นั่งเดิม */
export function asSeat<T>(s: GameState, p: PlayerId, seat: Seat, fn: () => T): T {
  const before = activeSeat(s, p);
  useSeat(s, p, seat);
  try {
    return fn();
  } finally {
    useSeat(s, p, before);
  }
}

/** การ์ดบนสนามของที่นั่งที่ทำงานอยู่ (2VS2: ไม่รวมของเพื่อน · 1VS1 = ทั้งสนาม) — ใช้กับสิ่งที่ "จัดได้เฉพาะของตัวเอง" เช่น คอร์ที่ใช้จ่ายได้ */
export function ownField(s: GameState, p: PlayerId): string[] {
  const field = s.players[p].field;
  if (!s.players[p].partner) return field;
  const seat = activeSeat(s, p);
  return field.filter((id) => seatOfCard(s.cards[id]) === seat);
}

/** โซนส่วนตัวของเจ้าของการ์ดใบนี้ */
export function ownerZones(s: GameState, cardId: string): PersonalZones {
  const card = s.cards[cardId]!;
  return zonesOf(s, card.owner, seatOfCard(card));
}

/**
 * 2VS2: ย้ายการ์ด/คอร์ที่ไปอยู่ในโซนของเพื่อนร่วมทีม กลับไปโซนของเจ้าของ (กติกา 15 ข้อ 2)
 * โค้ดเดิมหลายจุดส่งการ์ด/คอร์ไป "โซนของเจ้าของ" ด้วย players[owner] (= ที่นั่งที่ทำงานอยู่) ตัวนี้แก้ให้ถูกที่นั่งหลังทุก step
 * - คอร์บนการ์ดในสนาม = ของเจ้าของการ์ด (วางด้วยเอฟเฟกต์บนการ์ดเพื่อนก็นับเป็นของเพื่อน)
 * - คอร์/การ์ดในโซนผิดที่นั่ง = ย้ายไปโซนเดียวกันของที่นั่งเจ้าของ (เด็ค: ใบบนสุด = บนสุด ที่เหลือ = ใต้สุด)
 */
export function normalizeSeats(s: GameState): void {
  if (s.mode !== '2v2') return;
  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const pl = s.players[p];
    if (!pl.partner) continue;
    for (const id of pl.field) {
      const card = s.cards[id]!;
      const seat = seatOfCard(card);
      for (const b of [id, ...card.braves]) {
        for (const c of s.cards[b]!.cores) setCoreSeat(s, c, seat);
      }
    }
    for (const seat of [0, 1] as Seat[]) {
      const z = zonesOf(s, p, seat);
      for (const key of ['reserve', 'trashCores', 'life'] as const) {
        const wrong = z[key].filter((c) => seatOfCore(s.cores[c]) !== seat);
        if (wrong.length === 0) continue;
        z[key] = z[key].filter((c) => !wrong.includes(c));
        for (const c of wrong) zonesOf(s, p, seatOfCore(s.cores[c]))[key].push(c);
      }
      for (const key of ['hand', 'trashCards'] as const) {
        const wrong = z[key].filter((id) => seatOfCard(s.cards[id]) !== seat);
        if (wrong.length === 0) continue;
        z[key] = z[key].filter((id) => !wrong.includes(id));
        for (const id of wrong) zonesOf(s, p, seatOfCard(s.cards[id]))[key].push(id);
      }
      const wrongDeck = z.deck.filter((id) => seatOfCard(s.cards[id]) !== seat);
      if (wrongDeck.length > 0) {
        const top = z.deck[0];
        z.deck = z.deck.filter((id) => !wrongDeck.includes(id));
        for (const id of wrongDeck) {
          const target = zonesOf(s, p, seatOfCard(s.cards[id])).deck;
          if (id === top) target.unshift(id);
          else target.push(id);
        }
      }
      if (z.burst && seatOfCard(s.cards[z.burst]) !== seat) {
        const id = z.burst;
        z.burst = null;
        const target = zonesOf(s, p, seatOfCard(s.cards[id]));
        if (target.burst) target.trashCards.push(id);
        else target.burst = id;
      }
    }
  }
}

function setCoreSeat(s: GameState, coreId: string, seat: Seat): void {
  const core = s.cores[coreId]!;
  if (seat) core.seat = seat;
  else delete core.seat;
}

/** เซ็ทเบิร์สไปแล้วในเทิร์นนี้ (2VS2: ของที่นั่งที่ทำงานอยู่ · ต่างคนต่างเซ็ทได้) */
export function burstSetDone(s: GameState, p: PlayerId): boolean {
  if (s.mode !== '2v2') return s.burstSetThisTurn;
  return (s.burstSetSeats ?? []).includes(activeSeat(s, p));
}

/** การ์ดในมือของทุกคนในฝั่งนี้ (trigger ที่ทำงานจากในมือ) */
export const teamHand = (s: GameState, p: PlayerId): string[] => allZones(s, p).flatMap((z) => z.hand);
/** การ์ดในแทรชของทุกคนในฝั่งนี้ (trigger ที่ทำงานจากในแทรช) */
export const teamTrash = (s: GameState, p: PlayerId): string[] => allZones(s, p).flatMap((z) => z.trashCards);

/** ที่นั่งทั้งหมดของฝั่งนี้ (ในฐานะโซนส่วนตัว) */
export const allZones = (s: GameState, p: PlayerId): PersonalZones[] => seatsOf(s, p).map((seat) => zonesOf(s, p, seat));
