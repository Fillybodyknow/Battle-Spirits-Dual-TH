/**
 * มิติระดับ 3 "สนามมีชีวิต": ส่งตำแหน่งเมาส์ให้ CSS (index.css → .live-light / .card-lift)
 * - แผ่นสนาม (.mat-slab): --lx / --lt = สัดส่วนจากกลางกรอบบนจอ (-0.5..0.5) นอกแผ่น = -9 (แสงหลุดออกนอก)
 * - การ์ดที่ชี้ (.card-lift): --fx / --fy แบบเดียวกัน
 * ใช้กรอบที่เห็นบนจอ (getBoundingClientRect) จึงใช้ได้ทั้งตอนเอียงกระดานและแผ่นที่หมุน 180° (CSS แปลงทิศด้วย --ly)
 * อัปเดตเฟรมละครั้ง · เมาส์เท่านั้น (นิ้ว/ปากกาไม่มี hover)
 */
import { effects } from './gfx';

export function installLiveTable(): () => void {
  let frame = 0;
  let last: PointerEvent | null = null;
  let card: HTMLElement | null = null;

  const update = () => {
    frame = 0;
    const e = last;
    if (!e) return;
    for (const mat of document.querySelectorAll<HTMLElement>('.mat-slab')) {
      const r = mat.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      mat.style.setProperty('--lx', inside ? ((e.clientX - r.left) / r.width - 0.5).toFixed(3) : '-9');
      mat.style.setProperty('--lt', inside ? ((e.clientY - r.top) / r.height - 0.5).toFixed(3) : '-9');
    }
    const hit = (e.target as Element | null)?.closest?.('.card-lift') as HTMLElement | null;
    if (card && card !== hit) {
      card.style.removeProperty('--fx');
      card.style.removeProperty('--fy');
    }
    card = hit;
    if (hit) {
      const r = hit.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
      hit.style.setProperty('--fx', clamp((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      hit.style.setProperty('--fy', clamp((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    }
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !effects().liveTable) return;
    last = e;
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
  };
}
