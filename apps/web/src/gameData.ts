/**
 * ดาวน์โหลดข้อมูลเกมทั้งหมด (แบบเกม PC): โหลดทุกไฟล์ใน assets/ (ภาพการ์ด เสียง เพลง ฟอนต์) เก็บใน Cache ของ Service Worker
 * → เปิดการ์ดไหนก็ขึ้นทันที และเล่นออฟไลน์ได้ · ไม่ดาวน์โหลด = โหลดทีละไฟล์ตอนใช้ (แบบเดิม)
 *
 * - รายชื่อไฟล์ + ขนาด = asset-manifest.json (สร้างตอน build: vite.config.ts)
 * - Service Worker (public/sw.js) ตอบไฟล์ assets/ จากที่เก็บไว้ก่อนเสมอ (ชื่อไฟล์มีแฮช เนื้อหาไม่เปลี่ยน)
 * - เลือกดาวน์โหลดแล้ว (`bs-fulldata`, เฉพาะเครื่องนี้) = เวอร์ชันใหม่มีไฟล์เพิ่ม โหลดเฉพาะส่วนที่ขาดให้เอง + ลบไฟล์ของเวอร์ชันเก่า
 * - dev (ไม่มี Service Worker / manifest) = 'unsupported'
 */
import { create } from 'zustand';
import { APP_VERSION } from './changelog';

/** ต้องตรงกับ CACHE ใน public/sw.js */
const CACHE = 'bs-dual-v2';
const OPT_KEY = 'bs-fulldata';
const ASKED_KEY = 'bs-fulldata-asked';
const CONCURRENCY = 6;

type ManifestFile = { path: string; size: number };

export type GameDataStatus =
  | 'unsupported' // dev / เบราว์เซอร์ไม่มี Cache API
  | 'checking'
  | 'partial' // ยังโหลดไม่ครบ
  | 'downloading'
  | 'paused'
  | 'complete'
  | 'error';

export type GameData = {
  status: GameDataStatus;
  /** ขนาดรวมทุกไฟล์ / ที่โหลดเก็บไว้แล้ว (ไบต์) */
  total: number;
  have: number;
  files: number;
  haveFiles: number;
  /** ไฟล์ที่โหลดไม่สำเร็จรอบล่าสุด */
  failed: number;
  /** ผู้เล่นเลือกดาวน์โหลดข้อมูลทั้งหมดในเครื่องนี้แล้ว */
  optIn: boolean;
  /** เบราว์เซอร์รับปากว่าจะไม่ลบข้อมูลเองตอนเครื่องที่เก็บข้อมูลใกล้เต็ม */
  persisted: boolean;
  /** พื้นที่ว่างโดยประมาณที่เว็บนี้ใช้ได้ (ไบต์) · null = ไม่รู้ */
  free: number | null;
  /** ข้อความผิดพลาดล่าสุด */
  error: string | null;
};

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* โหมดส่วนตัว ฯลฯ */
  }
};

export const useGameData = create<GameData>(() => ({
  status: 'checking',
  total: 0,
  have: 0,
  files: 0,
  haveFiles: 0,
  failed: 0,
  optIn: lsGet(OPT_KEY) === '1',
  persisted: false,
  free: null,
  error: null,
}));
const set = (p: Partial<GameData>) => useGameData.setState(p);

let manifest: ManifestFile[] | null = null;
/** ไฟล์ที่มีในที่เก็บแล้ว (URL เต็ม) */
let cached = new Set<string>();
let abort: AbortController | null = null;

const urlOf = (path: string) => new URL(import.meta.env.BASE_URL + path, location.href).href;

function recount() {
  if (!manifest) return;
  let have = 0;
  let haveFiles = 0;
  for (const f of manifest) {
    if (cached.has(urlOf(f.path))) {
      have += f.size;
      haveFiles++;
    }
  }
  const total = manifest.reduce((n, f) => n + f.size, 0);
  set({ have, haveFiles, total, files: manifest.length });
  return haveFiles === manifest.length;
}

async function refreshStorage() {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = await navigator.storage?.estimate?.();
    const free = est?.quota != null ? Math.max(0, est.quota - (est.usage ?? 0)) : null;
    set({ persisted, free });
  } catch {
    /* ไม่รองรับ: ปล่อยค่าเดิม */
  }
}

/** เช็กว่าโหลดอะไรไว้แล้วบ้าง (+ ลบไฟล์ของเวอร์ชันเก่า, โหลดส่วนที่ขาดให้ถ้าเลือกดาวน์โหลดไว้) */
export async function checkGameData(): Promise<void> {
  if (!import.meta.env.PROD || typeof caches === 'undefined' || !('serviceWorker' in navigator)) {
    set({ status: 'unsupported' });
    return;
  }
  if (useGameData.getState().status === 'downloading') return;
  set({ status: 'checking', error: null });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}asset-manifest.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = (await res.json()) as { version: string; files: ManifestFile[] };
    manifest = m.files;
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    cached = new Set(keys.map((r) => r.url));
    // ลบไฟล์ของเวอร์ชันเก่า: เฉพาะเมื่อแอปที่เปิดอยู่เป็นเวอร์ชันเดียวกับบนเว็บ (แอปเก่าที่เปิดค้างอาจยังใช้ไฟล์เดิมอยู่)
    if (m.version === APP_VERSION) {
      const keep = new Set(manifest.map((f) => urlOf(f.path)));
      const stale = keys.filter((r) => new URL(r.url).pathname.includes('/assets/') && !keep.has(r.url));
      await Promise.all(stale.map((r) => cache.delete(r)));
      for (const r of stale) cached.delete(r.url);
    }
    const done = recount();
    await refreshStorage();
    set({ status: done ? 'complete' : 'partial' });
    // เลือกดาวน์โหลดไว้แล้ว: แพตช์ส่วนที่ขาดให้เอง (เวอร์ชันใหม่มีการ์ด/เสียงเพิ่ม)
    if (!done && useGameData.getState().optIn) void downloadGameData();
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** เริ่ม / ดาวน์โหลดต่อ: โหลดเฉพาะไฟล์ที่ยังไม่มี ทีละ CONCURRENCY ไฟล์ */
export async function downloadGameData(): Promise<void> {
  const st = useGameData.getState();
  if (st.status === 'unsupported' || st.status === 'downloading') return;
  if (!manifest) {
    await checkGameData();
    if (!manifest) return;
  }
  lsSet(OPT_KEY, '1');
  lsSet(ASKED_KEY, '1');
  set({ optIn: true, failed: 0, error: null });
  // ขอให้เบราว์เซอร์ไม่ลบข้อมูลเอง (Chrome อนุญาตเองถ้าติดตั้งแอป/ใช้บ่อย, Firefox ถามผู้ใช้)
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* ไม่รองรับ */
  }
  await refreshStorage();
  const todo = manifest.filter((f) => !cached.has(urlOf(f.path)));
  if (!todo.length) {
    set({ status: 'complete' });
    return;
  }
  const need = todo.reduce((n, f) => n + f.size, 0);
  const free = useGameData.getState().free;
  if (free !== null && free < need) {
    set({ status: 'error', error: `พื้นที่เก็บข้อมูลไม่พอ (ต้องการ ${formatBytes(need)} · เหลือ ${formatBytes(free)})` });
    return;
  }

  const ctrl = new AbortController();
  abort = ctrl;
  set({ status: 'downloading' });
  const cache = await caches.open(CACHE);
  let failed = 0;
  let next = 0;
  let lastPaint = 0;
  const paint = (force = false) => {
    const now = performance.now();
    if (!force && now - lastPaint < 250) return;
    lastPaint = now;
    recount();
  };
  const worker = async () => {
    while (!ctrl.signal.aborted && next < todo.length) {
      const f = todo[next++]!;
      const url = urlOf(f.path);
      let ok = false;
      for (let tryNo = 0; tryNo < 3 && !ok && !ctrl.signal.aborted; tryNo++) {
        try {
          const res = await fetch(url, { signal: ctrl.signal });
          if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
          await cache.put(url, res);
          cached.add(url);
          ok = true;
        } catch (e) {
          if (ctrl.signal.aborted) break;
          // ที่เก็บเต็ม: หยุดทั้งหมด
          if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            ctrl.abort();
            set({ error: 'พื้นที่เก็บข้อมูลเต็ม' });
            break;
          }
        }
      }
      if (!ok && !ctrl.signal.aborted) failed++;
      paint();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (abort === ctrl) abort = null;
  paint(true);
  await refreshStorage();
  const stoppedByUser = ctrl.signal.aborted && !useGameData.getState().error;
  const done = manifest.every((f) => cached.has(urlOf(f.path)));
  set({
    failed,
    status: done ? 'complete' : stoppedByUser ? 'paused' : 'error',
    error: done || stoppedByUser ? null : (useGameData.getState().error ?? `โหลดไม่สำเร็จ ${failed} ไฟล์ (เน็ตหลุด?) กดดาวน์โหลดต่อได้`),
  });
}

/** หยุดชั่วคราว (ไฟล์ที่โหลดเสร็จแล้วยังเก็บไว้) */
export function pauseGameData() {
  abort?.abort();
}

/** ลบข้อมูลที่ดาวน์โหลดไว้ + เลิกโหลดอัตโนมัติ (เกมกลับไปโหลดทีละไฟล์ตอนใช้) */
export async function clearGameData(): Promise<void> {
  abort?.abort();
  lsSet(OPT_KEY, null);
  set({ optIn: false });
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.filter((r) => new URL(r.url).pathname.includes('/assets/')).map((r) => cache.delete(r)));
    cached = new Set((await cache.keys()).map((r) => r.url));
  } catch {
    /* ไม่มีที่เก็บ */
  }
  recount();
  await refreshStorage();
  set({ status: 'partial', failed: 0, error: null });
}

/** ชวนดาวน์โหลดครั้งแรก: ยังไม่เคยตอบ และยังโหลดไม่ครบ */
export const shouldAskGameData = (s: GameData) => !s.optIn && lsGet(ASKED_KEY) !== '1' && s.status === 'partial';
export const dismissGameDataAsk = () => lsSet(ASKED_KEY, '1');

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

if (import.meta.env.DEV || import.meta.env.VITE_PERF_HOOKS) {
  Object.assign(globalThis, { __gameData: { useGameData, checkGameData, downloadGameData, pauseGameData, clearGameData } });
}
