import { useLayoutEffect, useRef, useState } from 'react';
import { IMG } from '../assets';
import { flyCoreIn } from '../motion';
import { canMoveCore, canSelectCore, useGame, multiAssigned, multiCurrent } from '../store';
import { beginCardDrag } from './DragGhost';

interface CoreProps {
  coreId: string;
  size?: 'sm' | 'md' | 'lg';
  /** บนกระดาน: คลิกเพื่อเลือก และลากไปวางได้ (เฉพาะ Core ที่ย้ายได้ตอนนี้) */
  board?: boolean;
  /** ใน dialog: คลิกเพื่อสลับสถานะ */
  onClick?: () => void;
  /** สถานะใน dialog จ่ายคอสต์ */
  mark?: 'pay' | 'place' | null;
  /** ไม่ต้องบินเมื่อย้ายที่ (เช่น ในแผงรายละเอียด) */
  noFlip?: boolean;
}

const SIZE = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };

export function Core({ coreId, size = 'md', board, onClick, mark: markProp, noFlip }: CoreProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const flip = !noFlip && !onClick;
  // mount ใหม่ = Core ย้ายมาจากที่อื่น: บินจากตำแหน่งเดิม
  useLayoutEffect(() => {
    if (flip && imgRef.current) flyCoreIn(imgRef.current, coreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const core = useGame((s) => s.state.cores[coreId]);
  const movable = useGame((s) => !!board && !s.evolveCard && canMoveCore(s.state, coreId));
  /** โหมดเลือก Core พิเศษ (Evolution / จ่ายคอสต์) ให้ Core ที่เลือกได้เรืองแสง */
  const picking = useGame(
    (s) => !!board && (!!s.evolveCard || s.state.choice?.kind === 'payCost' || s.state.choice?.kind === 'placeCores' || !!multiCurrent(s.state, s.multi)),
  );
  const selectable = useGame((s) => !!board && canSelectCore(s.state, s.evolveCard, coreId, s.multi));
  /** อัญเชิญหลายใบ: Core ที่จัดให้ใบอื่นไปแล้ว */
  const assigned = useGame((s) => !!board && multiAssigned(s.state, s.multi).includes(coreId));
  const selected = useGame((s) => s.selectedCores.includes(coreId));
  const dragging = useGame((s) => s.dragging?.includes(coreId) ?? false);
  const toggleCore = useGame((s) => s.toggleCore);
  // เล่นการ์ดจากมือ (แผงเล่นการ์ดบนกระดาน): Core ที่จะจ่าย/วางมีวงสี · คลิกเพื่อปรับ
  const playMark = useGame((s) => (board && s.playCores ? (s.playCores.marks[coreId] ?? null) : null));
  const playPick = useGame((s) => !!board && !!s.playCores?.pool.includes(coreId));
  const playOn = useGame((s) => !!board && !!s.playCores);
  const cyclePlayCore = useGame((s) => s.cyclePlayCore);
  // Core ที่เลือกในคำถามของเอฟเฟกต์: จ่ายคอสต์ = จ่าย (แดง) · วาง Core อัญเชิญ = วาง (เขียว)
  const selectedAs = useGame((s) =>
    s.state.choice?.kind === 'payCost' ? 'pay' : s.state.choice?.kind === 'placeCores' || s.state.choice?.kind === 'multiSummon' ? 'place' : null,
  );
  const mark = markProp ?? playMark ?? (board && selected && selectedAs ? selectedAs : null);
  const startDrag = useGame((s) => s.startDrag);
  const endDrag = useGame((s) => s.endDrag);
  if (!core) return null;

  // เฉพาะ Core ที่จะจ่าย/วางเท่านั้นที่มีวงสี (ยกขึ้น + ป้าย - / +) ส่วน Core ที่แค่คลิกได้ไม่มีวง
  // (เดิมทุกดวงที่คลิกได้มีวงชมพู คอร์บนสนามมีวงสีหมดจนแยกไม่ออกว่าดวงไหนจ่าย ดวงไหนวาง)
  const ring =
    mark === 'pay'
      ? 'ring-[3px] ring-rose-500 rounded-full bg-rose-500/45 -translate-y-1 shadow-[0_0_10px_rgba(244,63,94,0.9)]'
      : mark === 'place'
        ? 'ring-[3px] ring-emerald-400 rounded-full bg-emerald-500/45 -translate-y-1 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
        : selected
          ? 'ring-2 ring-yellow-300 rounded-full bg-yellow-300/30 -translate-y-0.5'
          : assigned
            ? 'ring-2 ring-emerald-400 rounded-full bg-emerald-500/30 opacity-70'
            : '';
  // โหมดเลือก Core: ดวงที่คลิกได้แต่ยังไม่เลือก = ปกติ, ดวงที่คลิกไม่ได้ = จาง
  const dimmed = (picking && !selectable && !mark) || (playOn && !playPick && !mark);
  const pic = (
    <img
      ref={imgRef}
      data-core-img={flip ? coreId : undefined}
      src={core.isSoul ? IMG.soulCore : IMG.core}
      alt={core.isSoul ? 'Soul Core' : 'Core'}
      draggable={false}
      className={`${SIZE[size]} shrink-0 drop-shadow transition ${core.isSoul && !mark ? 'soul-glow' : ''} ${ring} ${dragging || dimmed ? 'opacity-40' : ''}`}
    />
  );
  // ป้ายบอกหน้าที่: - = จ่าย, + = วางบนการ์ด (บนกระดานเท่านั้น ในแผงมีคำอธิบายอยู่แล้ว)
  const img =
    board && (mark === 'pay' || mark === 'place') ? (
      <span className="core-mark">
        {pic}
        <span className={`core-badge ${mark === 'pay' ? 'bg-rose-400' : 'bg-emerald-300'}`}>{mark === 'pay' ? '-' : '+'}</span>
      </span>
    ) : (
      pic
    );
  const title = core.isSoul ? 'Soul Core' : 'Core';

  if (playPick) {
    return (
      <span
        role="button"
        tabIndex={0}
        data-core={coreId}
        title={`${title} · คลิกเพื่อสลับ: ว่าง → จ่าย → วางบนการ์ด → ว่าง`}
        onClick={(e) => {
          e.stopPropagation();
          cyclePlayCore(coreId);
        }}
        className="cursor-pointer transition hover:scale-110"
      >
        {img}
      </span>
    );
  }
  if (selectable) {
    return (
      <span
        role="button"
        tabIndex={0}
        data-core={coreId}
        draggable={movable}
        title={movable ? `${title} · ลากไปวางบนการ์ดหรือ Reserve · คลิกเพื่อเลือกหลายดวง` : `${title} · คลิกเพื่อเลือก`}
        onClick={(e) => {
          e.stopPropagation();
          toggleCore(coreId);
        }}
        onDragStart={
          movable
            ? (e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', coreId);
                // ซ่อนภาพลากของเบราว์เซอร์ (มักไม่ขึ้นหรือถูกตัด) ใช้ภาพ Core ลอยตามเมาส์แทน (DragGhost)
                beginCardDrag(e);
                startDrag(coreId);
              }
            : undefined
        }
        onDragEnd={movable ? endDrag : undefined}
        className={`transition hover:scale-110 ${movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      >
        {img}
      </span>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="cursor-pointer transition hover:scale-110"
      >
        {img}
      </button>
    );
  }
  // ไม่กลืนคลิก เพื่อให้คลิกทะลุไปถึงการ์ดที่วางอยู่ (เช่น ตอนเลือกโจมตี)
  return (
    <span title={title} className="pointer-events-none">
      {img}
    </span>
  );
}

/** แถว Core (Soul Core ขึ้นก่อน) */
export function CoreRow({ cores, size, board, noFlip }: { cores: string[]; size?: CoreProps['size']; board?: boolean; noFlip?: boolean }) {
  const all = useGame((s) => s.state.cores);
  const sorted = [...cores].sort((a, b) => Number(all[b]?.isSoul) - Number(all[a]?.isSoul));
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {sorted.map((id) => (
        <Core key={id} coreId={id} size={size} board={board} noFlip={noFlip} />
      ))}
    </div>
  );
}

const PX = { sm: 16, md: 24, lg: 32 } as const;

/**
 * ถาด Core บนการ์ดในสนาม: สูงแถวเดียวเสมอ (Core เยอะ = ซ้อนกัน + ป้ายจำนวน) การ์ดจะไม่ถูกดัน
 * ชี้เมาส์ (หรือกำลังลาก Core จากถาดนี้) = กางออกเป็นแผงลอยทับ เห็น Core ทุกดวงแยกกัน ลากทีละดวงได้ง่าย
 */
export function CoreTray({ cores, width, size = 'md' }: { cores: string[]; width: number; size?: 'sm' | 'md' }) {
  const all = useGame((s) => s.state.cores);
  const draggingHere = useGame((s) => !!s.dragging?.some((id) => cores.includes(id)));
  const [hover, setHover] = useState(false);
  const sorted = [...cores].sort((a, b) => Number(all[b]?.isSoul) - Number(all[a]?.isSoul));
  const px = PX[size];
  const gap = 2;
  const showCount = sorted.length >= 5;
  const room = width - (showCount ? 22 : 0);
  const natural = sorted.length * px + (sorted.length - 1) * gap;
  // ระยะห่างระหว่าง Core (ติดลบ = ซ้อน)
  const step = sorted.length > 1 && natural > room ? Math.max(6, (room - px) / (sorted.length - 1)) - px : gap;
  const stacked = step < 0;
  const open = stacked && (hover || draggingHere);
  return (
    <div className="relative flex items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center">
        {sorted.map((id, i) => (
          <div key={id} style={{ marginLeft: i === 0 ? 0 : step, zIndex: sorted.length - i }} className="relative">
            <Core coreId={id} size={size} board />
          </div>
        ))}
      </div>
      {showCount && (
        <span className="ml-1 rounded bg-black/70 px-1 text-[11px] font-black text-sky-200 ring-1 ring-sky-300/40">×{sorted.length}</span>
      )}
      {open && (
        <div
          className="absolute top-1/2 left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-wrap justify-center gap-1 rounded-lg bg-slate-950/95 p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.7)] ring-1 ring-sky-300/50"
          style={{ width: Math.max(width + 16, 4 * (px + 4) + 12) }}
        >
          {sorted.map((id) => (
            <Core key={id} coreId={id} size={size} board noFlip />
          ))}
        </div>
      )}
    </div>
  );
}
