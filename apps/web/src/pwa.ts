/** เว็บแอปติดตั้งได้ (PWA): ลงทะเบียน Service Worker + จับจังหวะที่เบราว์เซอร์อนุญาตให้ติดตั้ง */
import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function registerPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  // dev ไม่ใช้ Service Worker (กัน cache ค้างตอนแก้โค้ด)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
    });
  }
}

/** เปิดอยู่ในโหมดแอปที่ติดตั้งแล้ว */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone / iPad (Safari ไม่มีปุ่มติดตั้งอัตโนมัติ ต้องกด แชร์ → เพิ่มไปยังหน้าจอโฮม) */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** เบราว์เซอร์ที่ใช้อยู่ (ใช้เลือกวิธีติดตั้งที่จะบอกผู้ใช้) */
export function browserKind(): 'ios' | 'android' | 'edge' | 'chrome' | 'firefox' | 'safari' | 'other' {
  const ua = navigator.userAgent;
  if (isIos()) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/edg\//i.test(ua)) return 'edge';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/chrome|crios/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}

/**
 * สถานะการติดตั้ง: 'prompt' = กดแล้วขึ้นหน้าต่างติดตั้งของเบราว์เซอร์, 'manual' = บอกวิธีติดตั้งเองตามเบราว์เซอร์,
 * null = เปิดอยู่ในแอปที่ติดตั้งแล้ว
 */
export function useInstall(): { mode: 'prompt' | 'manual' | null; install: () => Promise<boolean> } {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  const mode = isStandalone() ? null : deferred ? 'prompt' : 'manual';
  return {
    mode,
    install: async () => {
      if (!deferred) return false;
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        return false; // เบราว์เซอร์ไม่ยอมเปิดหน้าต่างติดตั้ง: ให้บอกวิธีติดตั้งเองแทน
      }
      deferred = null;
      notify();
      return true;
    },
  };
}
