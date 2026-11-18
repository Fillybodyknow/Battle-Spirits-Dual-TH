/**
 * การเล่นด้วยนิ้ว (มือถือ / iPad)
 *  - <html class="touch-ui"> เมื่ออุปกรณ์ใช้นิ้วเป็นหลัก (CSS: ไม่ซูมเมื่อแตะสองครั้ง, ไม่เลือกข้อความ, ไม่มีเมนูกดค้างของระบบ)
 *  - กดค้างการ์ด (สนาม / มือ / Brave) = เปิดรายละเอียดการ์ดค้างไว้ (แทนการเอาเมาส์ชี้) และไม่นับเป็นการแตะ
 *  - จำว่าการกดล่าสุดมาจากนิ้วหรือเมาส์ (แผงรายละเอียดไม่ตามการ "ชี้" ที่เบราว์เซอร์จำลองจากการแตะ)
 */
import { useEffect, useState } from 'react';
import { hiddenFrom, useGame } from './store';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
const CARD_SELECTOR = '[data-field-card],[data-hand-card],[data-brave-card],[data-spell-card],[data-cast-slot],[data-pick-card],[data-reveal-card]';

let lastWasTouch = false;
const listeners = new Set<(touch: boolean) => void>();

/** การ์ดที่กดค้างเปิดดูอยู่ (ใช้นิ้ว) แยกจากการปักการ์ดด้วยการคลิกบนคอม */
let inspected: string | null = null;
const inspectListeners = new Set<(id: string | null) => void>();
export function setTouchInspected(id: string | null): void {
  inspected = id;
  inspectListeners.forEach((fn) => fn(id));
}
export function useTouchInspected(): string | null {
  const [id, setId] = useState(inspected);
  useEffect(() => {
    inspectListeners.add(setId);
    return () => void inspectListeners.delete(setId);
  }, []);
  return id;
}

/** การกดล่าสุดมาจากนิ้ว */
export function useLastInputTouch(): boolean {
  const [touch, setTouch] = useState(lastWasTouch);
  useEffect(() => {
    listeners.add(setTouch);
    return () => void listeners.delete(setTouch);
  }, []);
  return touch;
}

/** อุปกรณ์ใช้นิ้วเป็นหลัก (มือถือ / แท็บเล็ต) */
export const isCoarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** ถือแนวตั้งบนมือถือ (จอด้านสั้นน้อยกว่า 700) */
export function usePortraitPhone(): boolean {
  const check = () =>
    isCoarsePointer() && window.matchMedia('(orientation: portrait)').matches && Math.min(screen.width, screen.height) < 700;
  const [portrait, setPortrait] = useState(check);
  useEffect(() => {
    const update = () => setPortrait(check());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return portrait;
}

/** การ์ดที่กดค้างเปิดดูได้ (การ์ดบนมือคู่แข่งที่คว่ำอยู่ = ไม่ได้) */
function inspectable(el: Element): string | null {
  const id =
    el.getAttribute('data-field-card') ?? el.getAttribute('data-hand-card') ?? el.getAttribute('data-brave-card') ?? el.getAttribute('data-spell-card') ?? el.getAttribute('data-cast-slot') ?? el.getAttribute('data-pick-card') ?? el.getAttribute('data-reveal-card');
  if (!id) return null;
  const s = useGame.getState();
  const card = s.state.cards[id];
  if (!card) return null;
  // การ์ดในมือที่คว่ำอยู่ดูไม่ได้ ยกเว้นใบที่วางแสดงนอกมือ (ทั้งสองฝ่ายเห็น)
  if (s.state.players[card.owner].hand.includes(id) && hiddenFrom(s, card.owner) && !(s.state.shownCards ?? []).includes(id)) return null;
  return id;
}

/** ติดตั้งครั้งเดียวตอนเปิดแอป */
export function installTouch(): void {
  if (typeof window === 'undefined') return;
  if (isCoarsePointer()) document.documentElement.classList.add('touch-ui');

  // เปิดแบบแอป (ติดตั้งแล้ว): ล็อกจอแนวนอน (Android รองรับ, iOS ไม่รองรับ = ใช้ป้ายให้หมุนจอแทน)
  const lockLandscape = () => {
    const standalone = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (standalone && orientation?.lock) orientation.lock('landscape').catch(() => {});
  };
  lockLandscape();
  window.addEventListener('pointerdown', lockLandscape, { once: true });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  let suppressClick = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };

  window.addEventListener(
    'pointerdown',
    (e) => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (touch !== lastWasTouch) {
        lastWasTouch = touch;
        listeners.forEach((fn) => fn(touch));
      }
      cancel();
      if (!touch) return;
      const el = (e.target as Element | null)?.closest(CARD_SELECTOR);
      const id = el ? inspectable(el) : null;
      if (!id) return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        setTouchInspected(id);
        suppressClick = true;
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS);
    },
    { capture: true },
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
    },
    { capture: true },
  );
  window.addEventListener('pointerup', cancel, { capture: true });
  window.addEventListener('pointercancel', cancel, { capture: true });
  // กดค้างเปิดรายละเอียดแล้ว: ไม่นับเป็นการแตะ (ไม่เล่นการ์ด/ไม่เลือก)
  window.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
  // เมนูกดค้างของระบบ (Android/iOS) บนกระดาน
  window.addEventListener('contextmenu', (e) => {
    if (lastWasTouch) e.preventDefault();
  });
}
