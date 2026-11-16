/**
 * เช็กเวอร์ชันใหม่ + จำว่าผู้เล่นเห็น Changelog ของเวอร์ชันไหนแล้ว
 *  - ดึง version.json (ไม่ใช้ cache) ตอนเปิดแอป ทุก 10 นาที และตอนกลับมาที่แท็บ/ต่อเน็ตได้
 *    ถ้าบนเว็บใหม่กว่าเวอร์ชันที่รันอยู่ = มีอัปเดต (ปุ่มอัปเดต = โหลดหน้าใหม่ ได้ไฟล์ชุดใหม่ทั้งหมด)
 *  - เปิดเวอร์ชันใหม่ครั้งแรก: เด้ง "มีอะไรใหม่" (เฉพาะคนที่เคยเล่นแล้ว คนเปิดครั้งแรกไม่ต้องเห็น)
 */
import { useEffect, useState } from 'react';
import { APP_VERSION, CHANGELOG, newerThan, type ChangelogEntry } from './changelog';

const SEEN_KEY = 'bs-seen-version';
const CHECK_EVERY_MS = 10 * 60 * 1000;

let latest: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

async function check(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const v = ((await res.json()) as { version?: unknown }).version;
    if (typeof v === 'string' && v !== latest) {
      latest = v;
      notify();
    }
  } catch {
    /* ออฟไลน์ / เน็ตหลุด: ไว้เช็กรอบหน้า */
  }
}

/** เรียกครั้งเดียวตอนเปิดแอป */
export function startUpdateCheck(): void {
  if (typeof window === 'undefined') return;
  setTimeout(check, 3000);
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('online', () => void check());
}

/** เวอร์ชันใหม่ที่มีบนเว็บ (null = ใช้ล่าสุดอยู่แล้ว / ยังไม่รู้) */
export function useNewVersion(): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return latest && newerThan(latest, APP_VERSION) ? latest : null;
}

/** อัปเดต: ให้ Service Worker เช็กไฟล์ชุดใหม่ แล้วโหลดหน้าใหม่ (หน้าเว็บดึงจากเน็ตก่อนเสมอ) */
export async function applyUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* ไม่มี Service Worker ก็โหลดใหม่ได้เลย */
  }
  location.reload();
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    /* ไม่มี storage: เด้งซ้ำตอนเปิดครั้งหน้าก็ไม่เป็นไร */
  }
}

/**
 * รายการ Changelog ที่ต้องเด้งให้ดูตอนเปิดแอป (ว่าง = ไม่ต้องเด้ง)
 *  - เคยเห็นเวอร์ชันเก่ากว่า → ทุกเวอร์ชันที่ใหม่กว่านั้น
 *  - ยังไม่เคยบันทึก แต่เคยเล่นแล้ว (มีข้อมูลของเกมในเครื่อง = ผู้เล่นก่อนมีระบบนี้) → เฉพาะเวอร์ชันล่าสุด
 *  - เปิดครั้งแรกจริง ๆ → ไม่เด้ง แค่จำไว้ว่าอยู่เวอร์ชันนี้
 */
export async function pendingChangelog(): Promise<ChangelogEntry[]> {
  const seen = readSeen();
  if (seen) return newerThan(APP_VERSION, seen) ? CHANGELOG.filter((e) => newerThan(e.version, seen)) : [];
  let played = false;
  try {
    played = Object.keys(localStorage).some((k) => k.startsWith('bs-') && k !== SEEN_KEY && k !== 'bs-local-online');
  } catch {
    /* ไม่มี storage */
  }
  // เคยเปิดเว็บมาก่อน = มี cache ของ Service Worker จากรอบก่อน (วัดไว้ตั้งแต่ก่อนลงทะเบียน Service Worker รอบนี้)
  if (!played) played = await hadCacheBefore;
  if (played) return CHANGELOG.slice(0, 1);
  markChangelogSeen();
  return [];
}

/** วัดตอนโหลดไฟล์นี้ (ก่อน Service Worker ของรอบนี้สร้าง cache) */
const hadCacheBefore: Promise<boolean> =
  typeof caches === 'undefined'
    ? Promise.resolve(false)
    : caches
        .keys()
        .then((keys) => keys.some((k) => k.startsWith('bs-dual-')))
        .catch(() => false);
