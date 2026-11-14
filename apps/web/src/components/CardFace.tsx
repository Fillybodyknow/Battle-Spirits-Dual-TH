import type { CardDef, SymbolColor } from '@bs/cards';
import { IMG, cardArt } from '../assets';
import { COLOR_BG, COLOR_BORDER, TYPE_LABEL } from '../format';

function Gems({ map, shape }: { map: CardDef['symbols']; shape: 'diamond' | 'dot' }) {
  const entries = Object.entries(map) as [SymbolColor, number][];
  return (
    <span className="flex items-center gap-0.5">
      {entries.flatMap(([color, n]) =>
        Array.from({ length: n }, (_, i) => (
          <span
            key={`${color}${i}`}
            className={`${shape === 'diamond' ? 'h-2.5 w-2.5 rotate-45 border border-black/30' : 'h-2.5 w-2.5 rounded-full border-2 border-white/90'} ${COLOR_BG[color]}`}
          />
        )),
      )}
    </span>
  );
}

const textOn = (c: SymbolColor) => (c === 'white' || c === 'yellow' ? 'text-slate-900' : 'text-white');

interface CardFaceProps {
  def: CardDef;
  /** เลเวลปัจจุบัน (บนสนาม) เพื่อไฮไลต์แถวเลเวล */
  level?: number;
  /** md = บนสนาม/มือ, sm = การ์ดเล็ก, xs = การ์ดจิ๋ว (มือฝ่ายตรงข้าม: ชี้เพื่อดูรายละเอียด) */
  size?: 'xs' | 'sm' | 'md';
  /** คอสต์ที่ต้องจ่ายจริงหลังลด (แสดงถ้าต่างจากคอสต์บนการ์ด) */
  payCost?: number;
}

/**
 * ภาพการ์ดเต็มใบ (มีกรอบ/ข้อความในภาพแล้ว): แสดงภาพตรง ๆ แล้วซ้อนเฉพาะข้อมูลที่เปลี่ยนระหว่างเกม
 */
function CardArt({ def, art, level, payCost }: { def: CardDef; art: string; level?: number; payCost?: number }) {
  const reduced = payCost !== undefined && payCost < def.cost;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black shadow-md">
      <img src={art} alt={def.name} draggable={false} className="h-full w-full object-cover" />
      {reduced && (
        <span
          className="absolute top-0.5 left-0.5 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-emerald-400 px-1 text-sm font-black text-slate-900 shadow"
          title={`ลดคอสต์จาก ${def.cost} เหลือ ${payCost}`}
        >
          {payCost}
          <span className="text-[9px] line-through opacity-60">{def.cost}</span>
        </span>
      )}
      {level !== undefined && level > 0 && def.levels.length > 1 && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-yellow-300 px-1.5 text-xs font-black text-slate-900 shadow">Lv{level}</span>
      )}
    </div>
  );
}

/** หน้าการ์ด: ใช้ภาพการ์ดถ้ามี (assets/images/cards) ไม่งั้นแสดงแบบข้อความ */
export function CardFace({ def, level, size = 'md', payCost }: CardFaceProps) {
  const art = cardArt(def.cardNo);
  if (art) return <CardArt def={def} art={art} level={level} payCost={payCost} />;
  if (size === 'xs') return <CardChip def={def} />;
  const main = def.colors[0] ?? 'white';
  const sm = size === 'sm';
  const reduced = payCost !== undefined && payCost < def.cost;
  return (
    <div className={`relative isolate flex h-full w-full flex-col overflow-hidden rounded-lg border-2 bg-slate-900 shadow-md ${COLOR_BORDER[main]}`}>
      <div className={`flex items-center gap-1 px-1.5 py-1 ${COLOR_BG[main]} ${textOn(main)}`}>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black ${reduced ? 'bg-emerald-400 text-slate-900' : 'bg-black/35 text-white'}`}
          title={reduced ? `ลดคอสต์จาก ${def.cost} เหลือ ${payCost}` : 'คอสต์'}
        >
          {reduced ? payCost : def.cost}
        </span>
        {reduced && <span className="text-[10px] font-bold line-through opacity-75">{def.cost}</span>}
        <span className="ml-auto">
          <Gems map={def.reduction} shape="dot" />
        </span>
      </div>
      <div className={`line-clamp-2 shrink-0 px-1.5 pt-1 font-bold leading-snug text-white ${sm ? 'text-[11px]' : 'text-[13px]'}`}>{def.name}</div>
      <div className="flex shrink-0 items-center justify-between px-1.5 text-[10px] text-slate-400">
        <span>{TYPE_LABEL[def.type]}</span>
        <span className="flex gap-0.5">
          {def.effects.length > 0 && <span className="rounded bg-slate-700 px-1 text-slate-200">✦{def.effects.length}</span>}
          {def.burst && <span className="rounded bg-orange-500 px-1 font-bold text-white">B</span>}
        </span>
      </div>
      {!sm && def.family.length > 0 &&<div className="shrink-0 truncate px-1.5 text-[10px] text-slate-500">{def.family.join(' · ')}</div>}
      <div className="mt-auto min-h-0 space-y-px overflow-hidden px-1 pb-1">
        {def.levels.map((lv) => (
          <div
            key={lv.level}
            className={`flex justify-between rounded px-1 ${sm ? 'text-[10px]' : 'text-[11px]'} ${
              lv.level === level ? 'bg-yellow-300 font-bold text-slate-900' : 'text-slate-300'
            }`}
          >
            <span>
              Lv{lv.level} <span className="opacity-70">●{lv.cores}</span>
            </span>
            {lv.bp !== undefined && <span>{lv.bp.toLocaleString()}</span>}
          </div>
        ))}
        <div className="flex justify-end pt-0.5">
          <Gems map={def.symbols} shape="diamond" />
        </div>
      </div>
    </div>
  );
}

/** การ์ดจิ๋ว: คอสต์ + ชื่อ */
function CardChip({ def }: { def: CardDef }) {
  const main = def.colors[0] ?? 'white';
  return (
    <div className={`flex h-full w-full flex-col overflow-hidden rounded-md border-2 bg-slate-900 ${COLOR_BORDER[main]}`}>
      <div className={`px-1 text-xs font-black ${COLOR_BG[main]} ${textOn(main)}`}>{def.cost}</div>
      <div className="line-clamp-3 px-1 pt-0.5 text-[10px] leading-tight font-semibold text-white">{def.name}</div>
    </div>
  );
}

export function CardBack({ label }: { label?: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-black/50 shadow-md">
      <img src={IMG.cardBack} alt="หลังการ์ด" draggable={false} className="h-full w-full object-cover" />
      {label && (
        <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded bg-black/70 px-1.5 text-[10px] font-bold text-orange-300">{label}</span>
      )}
    </div>
  );
}
