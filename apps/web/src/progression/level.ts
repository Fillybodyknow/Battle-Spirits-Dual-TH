/**
 * เลเวลผู้เล่น: EXP สะสมจากการดวล (ออนไลน์ / ดวลกับบอท / ด่าน Story) และบทเรียน
 * เก็บใน localStorage `bs-exp` (อยู่ใน SETTING_KEYS ของ account.ts: ซิงก์ตามบัญชี · รวมสองเครื่อง = ค่าที่มากกว่า)
 */
import { create } from 'zustand';

const KEY = 'bs-exp';
export const MAX_LEVEL = 99;

/** EXP ที่ต้องใช้จากเลเวลนี้ไปเลเวลถัดไป */
export const expToNext = (level: number) => 100 + 25 * (level - 1);

export interface LevelInfo {
  level: number;
  /** EXP ที่สะสมในเลเวลนี้แล้ว */
  into: number;
  /** EXP ที่ต้องใช้ไปเลเวลถัดไป (เลเวลสูงสุด = 0) */
  need: number;
}

export function levelOf(exp: number): LevelInfo {
  let level = 1;
  let left = Math.max(0, Math.floor(exp));
  while (level < MAX_LEVEL && left >= expToNext(level)) {
    left -= expToNext(level);
    level++;
  }
  return level >= MAX_LEVEL ? { level: MAX_LEVEL, into: 0, need: 0 } : { level, into: left, need: expToNext(level) };
}

function load(): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { exp?: unknown };
    return typeof v.exp === 'number' && v.exp >= 0 ? Math.floor(v.exp) : 0;
  } catch {
    return 0;
  }
}

function save(exp: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ exp }));
  } catch {
    /* เก็บไม่ได้ก็ใช้ค่าในหน่วยความจำ */
  }
}

/** ผล EXP ของการดวลล่าสุด (หน้าผลการดวลแสดงหลอด EXP วิ่ง) */
export interface ExpAward {
  /** อ้างอิงหน้าผลการดวลที่ให้ EXP นี้ (กันให้ซ้ำ) */
  key: string;
  gained: number;
  before: number;
  after: number;
  /** ที่มาของ EXP (บรรทัดสั้น ๆ) */
  note: string;
}

export const useLevel = create<{ exp: number; last: ExpAward | null }>(() => ({ exp: load(), last: null }));

/** โหลด EXP ใหม่ (ซิงก์บัญชีเขียนค่าจากเครื่องอื่นลงมา) */
export function reloadLevel() {
  useLevel.setState({ exp: load() });
}

/** เพิ่ม EXP (key ซ้ำ = ไม่ให้ซ้ำ) · คืนผลที่ให้ */
export function addExp(key: string, gained: number, note: string): ExpAward | null {
  const st = useLevel.getState();
  if (st.last?.key === key) return st.last;
  const before = st.exp;
  const after = before + Math.max(0, Math.round(gained));
  save(after);
  const award = { key, gained: after - before, before, after, note };
  useLevel.setState({ exp: after, last: award });
  return award;
}

/** รวม EXP จากเครื่องอื่น (ซิงก์บัญชี): ใช้ค่าที่มากกว่า (EXP ไม่มีวันลด) */
export function mergeExpJson(local: string | null, remote: string | null): string {
  const exp = (v: string | null) => {
    try {
      const o = v ? (JSON.parse(v) as { exp?: unknown }) : {};
      return typeof o.exp === 'number' ? o.exp : 0;
    } catch {
      return 0;
    }
  };
  return JSON.stringify({ exp: Math.max(exp(local), exp(remote)) });
}

/**
 * EXP ของการดวลหนึ่งเกม
 * - ออนไลน์: ชนะ 150 / แพ้ 60
 * - ดวลกับบอท: ชนะ 50 + 15×ดาว / แพ้ 15 + 5×ดาว · ด่าน Story ×1.5
 * - ยอมแพ้ก่อนเทิร์นที่ 3 = ไม่ได้ทั้งสองฝ่าย (กันกดยอมแพ้รัว ๆ เพื่อปั่น EXP)
 */
export function matchExp(o: { mode: 'online' | 'bot'; won: boolean; stars?: number; story?: boolean; firstClearBonus?: number; turn: number; reason: string }): { exp: number; note: string } {
  if (o.reason === 'concede' && o.turn < 3) return { exp: 0, note: 'ยอมแพ้ก่อนเทิร์นที่ 3 ไม่ได้รับ EXP' };
  if (o.mode === 'online') return { exp: o.won ? 150 : 60, note: o.won ? 'ชนะดวลออนไลน์' : 'ดวลออนไลน์' };
  const stars = Math.max(1, Math.min(6, o.stars ?? 5));
  const base = o.won ? 50 + 15 * stars : 15 + 5 * stars;
  const bonus = o.won ? (o.firstClearBonus ?? 0) : 0;
  const exp = Math.round(base * (o.story ? 1.5 : 1)) + bonus;
  return { exp, note: `${o.story ? 'ด่าน Story' : 'ดวลกับบอท'} ★${stars}${o.won ? ' · ชนะ' : ''}${bonus ? ` · ผ่านด่านครั้งแรก +${bonus}` : ''}` };
}

/** EXP จากบทเรียนที่ผ่านครั้งแรก */
export const TUTORIAL_EXP = 50;
