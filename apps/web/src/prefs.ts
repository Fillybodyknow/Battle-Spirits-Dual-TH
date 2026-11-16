/**
 * ตั้งค่าการเล่นของผู้เล่น (เก็บใน localStorage ของเครื่อง): ยืนยันก่อนโจมตี, การเรียง/จับการ์ดในมือ, วิธีหยิบการ์ดไปเล่น
 * ไม่มีผลกับ engine (ออนไลน์สองเครื่องตั้งต่างกันได้)
 */
import { create } from 'zustand';

/** เรียงการ์ดในมือ: ตามลำดับที่ได้มา / คอสต์ / สี / ประเภท / จัดเอง (ลากสลับ) */
export type HandSort = 'draw' | 'cost' | 'color' | 'type' | 'manual';
/** การจับการ์ดในมือ: พัด / แถวตรงซ้อนกัน / แถวกางไม่ซ้อน */
export type HandLayout = 'fan' | 'row' | 'spread';
/** หยิบการ์ดไปเล่น: คลิกเปิดเมนู / คลิกเดียวเล่นเลย (ถ้ามีทางเล่นทางเดียว) */
export type PlayMode = 'menu' | 'direct';

export type Prefs = { confirmAttack: boolean; handSort: HandSort; handLayout: HandLayout; playMode: PlayMode };

const KEY = 'bs-play-prefs';
const DEFAULTS: Prefs = { confirmAttack: true, handSort: 'draw', handLayout: 'fan', playMode: 'menu' };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* ใช้ค่าเริ่มต้น */
  }
  return DEFAULTS;
}

export const usePrefs = create<Prefs>(() => load());

export const prefs = () => usePrefs.getState();

export function setPrefs(next: Partial<Prefs>) {
  usePrefs.setState(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(usePrefs.getState()));
  } catch {
    /* เก็บไม่ได้ (โหมดส่วนตัว) ก็ใช้ได้ในรอบนี้ */
  }
}
