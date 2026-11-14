import { useEffect, useRef, useState } from 'react';
import { IMG } from '../assets';
import { db, useGame } from '../store';
import { CardBack, CardFace } from './CardFace';

/** รูปโปร่งใส 1px: ซ่อนภาพลากของเบราว์เซอร์ (การ์ดในมือหมุน/จมขอบจอ ทำให้ภาพของเบราว์เซอร์หายหรือถูกตัด) */
const BLANK = typeof Image !== 'undefined' ? new Image() : null;
if (BLANK) BLANK.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let startAt = { x: 0, y: 0 };

/** เรียกใน onDragStart ของการ์ดที่ลาก (มือ / Brave บนสนาม): ซ่อนภาพของเบราว์เซอร์ และจำจุดเริ่ม */
export function beginCardDrag(e: React.DragEvent) {
  if (BLANK) e.dataTransfer.setDragImage(BLANK, 0, 0);
  startAt = { x: e.clientX, y: e.clientY };
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
