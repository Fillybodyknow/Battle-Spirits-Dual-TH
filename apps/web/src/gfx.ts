/**
 * ตั้งค่ากราฟิก (แบบเกม PC): ชุดคุณภาพ + ตัวเลือกย่อย + ความสบายตา
 *
 * - ชุดคุณภาพ (quality) คุมเฉพาะ "เอฟเฟกต์ตกแต่ง" (ของที่ขยับวนตลอด: แรงเครื่องส่วนใหญ่อยู่ตรงนี้)
 *   แก้ตัวเลือกย่อยเอง = กลายเป็น 'custom' · 'auto' = สูง หรือ ต่ำ ถ้าเครื่องช้า/ระบบขอลดการเคลื่อนไหว
 * - ความสบายตา (จอสั่น, แสงวาบ) และแสดง FPS ตั้งแยก ไม่ขึ้นกับชุดคุณภาพ
 * - ผลทาง CSS = คลาส gfx-* บน <html> (index.css) · จอสั่น/แสงวาบอ่านค่าจาก gfx() ใน Fx.tsx
 *
 * auto: เฝ้าดูเฟรมเรตระหว่างเล่นช่วงแรก (ราว 2 นาที) ช่วง 2 วินาทีที่ได้ไม่ถึง 30 เฟรม ครบ 2 ครั้ง = เครื่องช้า
 * → ใช้ชุดต่ำ และจำไว้ (เครื่องช้ามักไหวตอนกระดานนิ่ง แต่กระตุกตอน Flash/ต่อสู้ จึงต้องวัดระหว่างเล่นจริง)
 */
import { useEffect, useState } from 'react';

export type Quality = 'auto' | 'low' | 'medium' | 'high' | 'custom';
export type FoilMode = 'anim' | 'static' | 'off';
export interface Effects {
  /** ฉากหลังเคลื่อนไหว (ออโรร่า + อนุภาคลอย) */
  bgMotion: boolean;
  /** กรอบเรืองแสงวิ่งรอบสนามตาผู้เล่น + แสงกวาดสนาม */
  matMotion: boolean;
  /** แสงเรือง/ปุ่มกระพริบ และของที่วนตลอด (false = ค้างไว้ที่จังหวะสว่าง) */
  glowPulse: boolean;
  /** ฟอยการ์ด */
  foil: FoilMode;
  /** เบลอพื้นหลังหน้าต่าง/แผง */
  blur: boolean;
}
export interface GfxSettings {
  quality: Quality;
  /** ค่าของชุด 'custom' */
  custom: Effects;
  shake: 'on' | 'light' | 'off';
  flash: 'on' | 'low';
  showFps: boolean;
}

export const PRESETS: Record<'low' | 'medium' | 'high', Effects> = {
  high: { bgMotion: true, matMotion: true, glowPulse: true, foil: 'anim', blur: true },
  // กลาง: ตัดตัวที่กินเครื่องสูง (ฉากหลัง + แสงกระพริบ) แต่เก็บกรอบวิ่งรอบสนามและเบลอไว้
  medium: { bgMotion: false, matMotion: true, glowPulse: false, foil: 'static', blur: true },
  low: { bgMotion: false, matMotion: false, glowPulse: false, foil: 'static', blur: false },
};

const KEY = 'bs-gfx';
/** ผลวัดของ auto: เครื่องนี้ช้า */
const SLOW_KEY = 'bs-gfx-slow';
const DEFAULTS: GfxSettings = { quality: 'auto', custom: PRESETS.high, shake: 'on', flash: 'on', showFps: false };

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ไม่มี storage: ใช้แค่ในรอบนี้ */
  }
};

function load(): GfxSettings {
  try {
    const raw = JSON.parse(read(KEY) ?? 'null') as Partial<GfxSettings> | null;
    if (raw && typeof raw === 'object') return { ...DEFAULTS, ...raw, custom: { ...PRESETS.high, ...(raw.custom ?? {}) } };
  } catch {
    /* ค่าเสีย: ใช้ค่าเริ่มต้น */
  }
  return { ...DEFAULTS };
}

let settings = load();
let slow = read(SLOW_KEY) === '1';
/** เพิ่งเปลี่ยนเป็นชุดต่ำให้อัตโนมัติในรอบนี้ (ขึ้นป้ายบอกผู้เล่น) */
let autoJustLowered = false;
const listeners = new Set<() => void>();

// สร้าง MediaQueryList ครั้งเดียว (เรียก matchMedia ใหม่ทุกครั้ง = แพง: ถูกเรียกทุกเฟรมและทุกครั้งที่วาดการ์ด)
const reducedMotionMq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
const reducedMotion = () => !!reducedMotionMq?.matches;
/** ชุดที่ auto เลือกตอนนี้ */
export const autoPreset = (): 'low' | 'high' => (slow || reducedMotion() ? 'low' : 'high');

/** ค่าเอฟเฟกต์ที่ใช้จริงตอนนี้ */
export function effects(): Effects {
  const q = settings.quality;
  return q === 'custom' ? settings.custom : PRESETS[q === 'auto' ? autoPreset() : q];
}
export const gfx = () => settings;

function apply() {
  if (typeof document !== 'undefined') {
    const e = effects();
    const c = document.documentElement.classList;
    c.toggle('gfx-bg-static', !e.bgMotion);
    c.toggle('gfx-mat-static', !e.matMotion);
    c.toggle('gfx-glow-static', !e.glowPulse);
    c.toggle('gfx-foil-static', e.foil === 'static');
    c.toggle('gfx-foil-off', e.foil === 'off');
    c.toggle('gfx-no-blur', !e.blur);
  }
  listeners.forEach((f) => f());
}

function save(next: GfxSettings) {
  settings = next;
  write(KEY, JSON.stringify(next));
  autoJustLowered = false;
  apply();
}

export function setQuality(q: Quality) {
  // เปลี่ยนไป custom ตรง ๆ: เริ่มจากค่าที่ใช้อยู่ตอนนี้
  save({ ...settings, quality: q, custom: q === 'custom' && settings.quality !== 'custom' ? effects() : settings.custom });
}
/** แก้ตัวเลือกย่อย = ชุดกำหนดเอง */
export function setEffect<K extends keyof Effects>(k: K, v: Effects[K]) {
  save({ ...settings, quality: 'custom', custom: { ...effects(), [k]: v } });
}
export function setComfort(next: Partial<Pick<GfxSettings, 'shake' | 'flash' | 'showFps'>>) {
  save({ ...settings, ...next });
}
/** คืนค่าเริ่มต้นทั้งหมด (รวมลืมผลวัดว่าเครื่องช้า) */
export function resetGfx() {
  slow = false;
  try {
    localStorage.removeItem(SLOW_KEY);
  } catch {
    /* ไม่มี storage */
  }
  save({ ...DEFAULTS });
}

/** อ่านการตั้งค่ากราฟิกจาก localStorage ใหม่ (ซิงก์บัญชีเขียนค่าจากเครื่องอื่นลงมา) */
export function reloadGfx() {
  settings = load();
  apply();
}

/** เรียกครั้งเดียวตอนเปิดแอป */
export function installGfx() {
  apply();
}

/** ช่วงละ 2 วินาที: ไม่ถึง FPS_THRESHOLD = ช่วงกระตุก · ครบ BAD_WINDOWS = เครื่องช้า · เฝ้าดูไม่เกิน MAX_WINDOWS ช่วง */
const FPS_THRESHOLD = 30;
const WINDOW_MS = 2000;
const BAD_WINDOWS = 2;
const MAX_WINDOWS = 60;
let probing = false;
/** auto: เฝ้าดูเฟรมเรตระหว่างเล่นจริงช่วงแรก กระตุกซ้ำ = ใช้ชุดต่ำและจำไว้ · หยุดนับระหว่างสลับไปแท็บอื่น */
export function probeGfx() {
  if (probing || settings.quality !== 'auto' || autoPreset() === 'low' || typeof requestAnimationFrame === 'undefined') return;
  probing = true;
  let windows = 0;
  let bad = 0;
  let frames = 0;
  let start = performance.now();
  const tick = (t: number) => {
    if (settings.quality !== 'auto' || autoPreset() === 'low') return; // ผู้เล่นเลือกเอง / ลดแล้ว: เลิกวัด
    frames++;
    if (t - start >= WINDOW_MS) {
      const fps = (frames * 1000) / (t - start);
      if (!document.hidden && t - start < WINDOW_MS * 2) {
        windows++;
        if (fps < FPS_THRESHOLD) bad++;
      }
      frames = 0;
      start = t;
      if (bad >= BAD_WINDOWS) {
        slow = true;
        write(SLOW_KEY, '1');
        autoJustLowered = true;
        apply();
        return;
      }
      if (windows >= MAX_WINDOWS) return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** ค่าที่ใช้กับ Fx: แรงจอสั่น (0 = ไม่สั่น) / ความแรงแสงวาบเต็มจอ */
export const shakeScale = () => (settings.shake === 'off' ? 0 : settings.shake === 'light' ? 0.4 : 1);
export const flashScale = () => (settings.flash === 'low' ? 0.3 : 1);

export function useGfx() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return {
    settings,
    effects: effects(),
    autoPreset: autoPreset(),
    autoJustLowered,
    dismissNotice: () => {
      autoJustLowered = false;
      apply();
    },
  };
}
