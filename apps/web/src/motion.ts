/**
 * แอนิเมชัน Core ย้ายที่ (FLIP)
 * ก่อน state เปลี่ยน: จับตำแหน่ง Core ทุกดวงบนกระดาน
 * หลัง state เปลี่ยน: Core ที่ไปโผล่ที่ใหม่ (mount ใหม่) จะบินจากตำแหน่งเดิมมาที่ใหม่
 */
type Rect = { x: number; y: number; w: number; h: number };
type Snap = { rects: Map<string, Rect>; delays: Map<string, number> };

let snap: Snap | null = null;

/** ตำแหน่ง Core ทุกดวงบนกระดานตอนนี้ */
export function snapCores(): Map<string, Rect> {
  const out = new Map<string, Rect>();
  if (typeof document === 'undefined') return out;
  document.querySelectorAll<HTMLElement>('[data-core-img]').forEach((el) => {
    const id = el.dataset.coreImg!;
    if (out.has(id)) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.set(id, { x: r.left, y: r.top, w: r.width, h: r.height });
  });
  return out;
}

/** ตั้งตำแหน่งเดิมให้ Core ที่จะ mount ในเฟรมถัดไปใช้ (delays = หน่วงตามไทม์ไลน์) */
export function primeCoreMotion(rects: Map<string, Rect>, delays: Map<string, number> = new Map()) {
  const s: Snap = { rects, delays };
  snap = s;
  // ใช้ได้แค่รอบ render ที่ตามมาทันที
  requestAnimationFrame(() => requestAnimationFrame(() => snap === s && (snap = null)));
}

/** เรียกตอน Core mount: บินจากตำแหน่งเดิม (ถ้ามีและห่างพอ) */
export function flyCoreIn(el: HTMLElement, coreId: string) {
  if (!snap) return;
  const from = snap.rects.get(coreId);
  if (!from) return;
  const to = el.getBoundingClientRect();
  const dx = from.x + from.w / 2 - (to.left + to.width / 2);
  const dy = from.y + from.h / 2 - (to.top + to.height / 2);
  if (Math.hypot(dx, dy) < 4) return;
  const delay = snap.delays.get(coreId) ?? 0;
  const lift = Math.min(60, Math.hypot(dx, dy) * 0.25);
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, filter: 'brightness(1)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.45)`, filter: 'brightness(1.8) drop-shadow(0 0 8px rgba(125,211,252,0.9))', offset: 0.5 },
      { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' },
    ],
    { duration: 480, delay, easing: 'cubic-bezier(.35,.7,.3,1)', fill: 'backwards' },
  );
}
