import { useEffect, useRef, useState } from 'react';
import { IMG } from '../assets';
import { db, useGame } from '../store';
import { CardBack, CardFace } from './CardFace';

/** รูปโปร่งใส 1px: ซ่อนภาพลากของเบราว์เซอร์ (การ์ดในมือหมุน/จมขอบจอ ทำให้ภาพของเบราว์เซอร์หายหรือถูกตัด) */
const BLANK = typeof Image !== 'undefined' ? new Image() : null;
if (BLANK) BLANK.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let startAt = { x: 0, y: 0 };
/** เวลาของ dragover ล่าสุด: ใช้แยกว่ามีการลากค้างอยู่จริง หรือแค่ state ค้าง */
let lastDragOver = 0;

/** เรียกใน onDragStart ของการ์ดที่ลาก (มือ / Brave บนสนาม): ซ่อนภาพของเบราว์เซอร์ และจำจุดเริ่ม */
export function beginCardDrag(e: React.DragEvent) {
  if (BLANK) e.dataTransfer.setDragImage(BLANK, 0, 0);
  startAt = { x: e.clientX, y: e.clientY };
  lastDragOver = performance.now();
}

/** ล้างสถานะการลากทั้งหมด (การ์ดบนมือ / Brave / Burst / Core) */
function clearDrags() {
  const s = useGame.getState();
  if (s.handDrag || s.braveDrag || s.burstDrag || s.dragging) useGame.setState({ handDrag: null, braveDrag: null, burstDrag: null, dragging: null });
}

/**
 * กันภาพลากค้างจอ (เจอบน iPad): ปกติล้างด้วย onDragEnd ของการ์ดที่ลาก แต่ถ้าการ์ดหายจากมือก่อน (เช่น วางเป็น Burst)
 * หรือปล่อยนอกช่องที่รับ เบราว์เซอร์อาจไม่ส่ง dragend มาที่การ์ดนั้น → state ค้าง ภาพการ์ดลอยค้าง และลอยตามเวลาลาก Core
 *  - ทุก drop / dragend ในหน้า: ล้างหลังตัวรับ (onDrop) ทำงานเสร็จ
 *  - แตะ/คลิกใหม่ขณะที่ไม่มีการลากจริง (ไม่มี dragover มาสักพัก): ล้างของที่ค้าง
 */
export function installDragCleanup() {
  if (typeof document === 'undefined') return;
  const later = () => setTimeout(clearDrags, 0);
  document.addEventListener('drop', later, true);
  document.addEventListener('dragend', later, true);
  document.addEventListener('dragover', () => (lastDragOver = performance.now()), true);
  document.addEventListener(
    'pointerdown',
    () => {
      if (performance.now() - lastDragOver > 500) clearDrags();
    },
    true,
  );
}

/**
 * ลากด้วยนิ้ว: มือถือ/แท็บเล็ตส่วนใหญ่ไม่รองรับการลากของเบราว์เซอร์ (HTML5 drag & drop)
 * → แปลงการลากนิ้วบนการ์ดที่ draggable เป็นเหตุการณ์ dragstart / dragenter / dragover / dragleave / drop / dragend
 * ตัวรับเดิมทั้งหมด (สนาม, ช่อง Burst, การ์ดในมือ, Core, ผู้ร่วมร่าง) ใช้ได้ทันทีโดยไม่ต้องแก้
 *  - เริ่มลากเมื่อนิ้วขยับเกิน TOUCH_DRAG_PX · การ์ดในมือที่ปัดแนวนอน = เลื่อนพัดการ์ดตามเดิม (ไม่เริ่มลาก)
 *  - กดค้างโดยไม่ขยับ = เปิดดูการ์ด (touch.ts) ตามเดิม · ลากแล้ว = ไม่นับเป็นการแตะ (ไม่เปิดเมนู)
 */
const TOUCH_DRAG_PX = 10;
export function installTouchDrag() {
  if (typeof document === 'undefined') return;
  let src: HTMLElement | null = null;
  let start = { x: 0, y: 0 };
  let dragging = false;
  let over: Element | null = null;
  let dt: DataTransfer | null = null;
  let suppressClick = false;
  const makeTransfer = (): DataTransfer => {
    try {
      return new DataTransfer();
    } catch {
      const data: Record<string, string> = {};
      return {
        dropEffect: 'move',
        effectAllowed: 'all',
        types: [],
        files: [],
        items: [],
        setData: (k: string, v: string) => void (data[k] = v),
        getData: (k: string) => data[k] ?? '',
        clearData: () => {},
        setDragImage: () => {},
      } as unknown as DataTransfer;
    }
  };
  const fire = (target: EventTarget, type: string, x: number, y: number): boolean => {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer?: DataTransfer };
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    Object.defineProperty(ev, 'clientX', { value: x });
    Object.defineProperty(ev, 'clientY', { value: y });
    Object.defineProperty(ev, 'pageX', { value: x });
    Object.defineProperty(ev, 'pageY', { value: y });
    return target.dispatchEvent(ev);
  };
  const reset = () => {
    src = null;
    dragging = false;
    over = null;
    dt = null;
  };
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return reset();
      const el = (e.target as Element | null)?.closest<HTMLElement>('[draggable="true"]');
      if (!el) return reset();
      src = el;
      dragging = false;
      start = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!src) return;
      const t = e.touches[0]!;
      if (!dragging) {
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.hypot(dx, dy) < TOUCH_DRAG_PX) return;
        // ปัดพัดการ์ดในมือแนวนอน = เลื่อน ไม่ใช่ลาก
        if (src.closest('[data-hand-card]') && Math.abs(dx) > Math.abs(dy)) return reset();
        dt = makeTransfer();
        dragging = true;
        fire(src, 'dragstart', start.x, start.y);
      }
      e.preventDefault(); // ไม่ให้หน้าจอเลื่อนระหว่างลาก
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (target !== over) {
        if (over) fire(over, 'dragleave', t.clientX, t.clientY);
        if (target) fire(target, 'dragenter', t.clientX, t.clientY);
        over = target;
      }
      if (target) fire(target, 'dragover', t.clientX, t.clientY);
      lastDragOver = performance.now();
    },
    { capture: true, passive: false },
  );
  const end = (e: TouchEvent, drop: boolean) => {
    if (!src) return;
    if (dragging) {
      const t = e.changedTouches[0];
      const x = t?.clientX ?? start.x;
      const y = t?.clientY ?? start.y;
      const target = drop ? document.elementFromPoint(x, y) : null;
      if (target) fire(target, 'drop', x, y);
      fire(src, 'dragend', x, y);
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 400);
      setTimeout(clearDrags, 0);
    }
    reset();
  };
  document.addEventListener('touchend', (e) => end(e, true), { capture: true });
  document.addEventListener('touchcancel', (e) => end(e, false), { capture: true });
  // ลากเสร็จแล้ว: ไม่นับเป็นการแตะการ์ด
  document.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
}

/** ตำแหน่งเมาส์ระหว่างลาก (เบราว์เซอร์ไม่ส่ง mousemove ระหว่างลาก: ใช้ dragover ที่ยิงต่อเนื่องแทน) */
function useDragPos(active: boolean) {
  const [pos, setPos] = useState(startAt);
  useEffect(() => {
    if (!active) return;
    setPos(startAt);
    let frame = 0;
    const onOver = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      const p = { x: e.clientX, y: e.clientY };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPos(p));
    };
    document.addEventListener('dragover', onOver);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('dragover', onOver);
    };
  }, [active]);
  return pos;
}

/** Core ที่ลอยตามเมาส์ระหว่างลาก (ลากหลายดวง = ซ้อนกันพร้อมจำนวน) */
export function CoreDragGhost() {
  const dragging = useGame((s) => s.dragging);
  const cores = useGame((s) => s.state.cores);
  const pos = useDragPos(!!dragging);
  if (!dragging || dragging.length === 0) return null;
  const shown = dragging.slice(0, 5);
  return (
    <div className="pointer-events-none fixed z-[70] flex items-center" style={{ left: pos.x - 18, top: pos.y - 18 }}>
      {shown.map((id, i) => (
        <img
          key={id}
          src={cores[id]?.isSoul ? IMG.soulCore : IMG.core}
          alt=""
          className="h-9 w-9 drop-shadow-[0_6px_8px_rgba(0,0,0,0.7)]"
          style={{ marginLeft: i === 0 ? 0 : -22, zIndex: shown.length - i, filter: 'drop-shadow(0 0 8px rgba(56,189,248,0.8))' }}
        />
      ))}
      {dragging.length > 1 && (
        <span className="ml-1 rounded-full bg-sky-500 px-1.5 text-xs font-black text-white shadow">×{dragging.length}</span>
      )}
    </div>
  );
}

/** การ์ดที่ลอยตามเมาส์ระหว่างลากการ์ดจากมือ (เอียงตามทิศที่ลาก) */
export function DragGhost() {
  const cardId = useGame((s) => s.handDrag ?? s.braveDrag ?? s.burstDrag);
  const faceDown = useGame((s) => !!s.burstDrag);
  const card = useGame((s) => {
    const id = s.handDrag ?? s.braveDrag ?? s.burstDrag;
    return id ? s.state.cards[id] : undefined;
  });
  const [pos, setPos] = useState(startAt);
  const [tilt, setTilt] = useState(0);
  const last = useRef(startAt);

  useEffect(() => {
    if (!cardId) return;
    setPos(startAt);
    last.current = startAt;
    let frame = 0;
    const onOver = (e: DragEvent) => {
      // ระหว่างลาก เบราว์เซอร์ไม่ส่ง mousemove: ใช้ dragover ที่ยิงต่อเนื่องแทน
      if (e.clientX === 0 && e.clientY === 0) return;
      const p = { x: e.clientX, y: e.clientY };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const dx = p.x - last.current.x;
        last.current = p;
        setPos(p);
        setTilt((t) => t * 0.6 + Math.max(-18, Math.min(18, dx * 0.9)) * 0.4);
      });
    };
    document.addEventListener('dragover', onOver);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('dragover', onOver);
      setTilt(0);
    };
  }, [cardId]);

  if (!cardId || !card) return null;
  const W = 136;
  const H = 190;
  return (
    <div
      className="pointer-events-none fixed z-[70]"
      style={{
        left: pos.x - W / 2,
        top: pos.y - H * 0.35,
        width: W,
        height: H,
        transform: `rotate(${tilt}deg) scale(1.08)`,
        transition: 'transform 0.08s linear',
        filter: 'drop-shadow(0 18px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(250,204,21,0.45))',
      }}
    >
      {faceDown ? <CardBack /> : <CardFace def={db.get(card.cardNo)} />}
    </div>
  );
}
