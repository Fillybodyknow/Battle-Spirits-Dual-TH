import { isXRare } from '@bs/cards';
import { cardArt } from '../assets';
import { CardFace } from '../components/CardFace';
import { DECKS, db, type DeckId } from '../store';

/** การ์ดหน้าปกของเด็ค: X-Rare ใบแรกที่มีภาพ ไม่งั้นใบแรกที่มีภาพ ไม่งั้นใบแรก */
export function deckCover(id: DeckId): string {
  const entries = DECKS[id].entries;
  const withArt = entries.filter((e) => cardArt(e.cardNo));
  const xr = withArt.find((e) => isXRare(db.find(e.cardNo) ?? {}));
  return (xr ?? withArt[0] ?? entries[0]!).cardNo;
}

export const deckSize = (id: DeckId) => DECKS[id].entries.reduce((n, e) => n + e.count, 0);

/** สีหลักของเด็ค (สีที่การ์ดในเด็คใช้มากที่สุด) ใช้แต่งแสงพื้นหลัง */
export function deckColor(id: DeckId): string {
  const count: Record<string, number> = {};
  for (const e of DECKS[id].entries) for (const c of db.find(e.cardNo)?.colors ?? []) count[c] = (count[c] ?? 0) + e.count;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'blue';
  return GLOW[top] ?? GLOW.blue!;
}

export const GLOW: Record<string, string> = {
  red: '#f43f5e',
  purple: '#a855f7',
  green: '#22c55e',
  white: '#e2e8f0',
  yellow: '#facc15',
  blue: '#38bdf8',
};

/** ภาพการ์ดเต็มใบ (ใช้ภาพจริงถ้ามี ไม่งั้นการ์ดข้อความ) */
export function CardArt({ cardNo, className = '' }: { cardNo: string; className?: string }) {
  const art = cardArt(cardNo);
  if (art) return <img src={art} alt={db.get(cardNo).name} draggable={false} className={`rounded-xl object-cover ${className}`} />;
  return (
    <div className={className}>
      <CardFace def={db.get(cardNo)} />
    </div>
  );
}

/** ปุ่มย้อนกลับมุมซ้ายบนของหน้าเมนู */
export function BackButton({ onClick, label = 'หน้าหลัก' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2 rounded-r-full border border-l-0 border-sky-300/40 bg-black/60 py-2 pr-5 pl-4 text-sm font-bold text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.25)] backdrop-blur transition hover:pl-6 hover:text-white"
    >
      <span className="transition group-hover:-translate-x-1">◀</span> {label}
    </button>
  );
}

/** ไทล์เลือกเด็ค: ภาพปก + ชื่อ + จำนวนใบ */
export function DeckTile({ id, selected, onClick, small }: { id: DeckId; selected: boolean; onClick: () => void; small?: boolean }) {
  const glow = deckColor(id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-slate-950/80 text-left transition ${
        small ? 'w-32' : 'w-40'
      } ${selected ? 'border-yellow-300 shadow-[0_0_22px_rgba(250,204,21,0.55)]' : 'border-white/10 hover:-translate-y-1 hover:border-white/40'}`}
    >
      <div className={`relative overflow-hidden ${small ? 'h-28' : 'h-36'}`} style={{ background: `radial-gradient(circle at 50% 30%, ${glow}55, transparent 70%)` }}>
        <CardArt cardNo={deckCover(id)} className="absolute top-2 left-1/2 w-[78%] -translate-x-1/2 rotate-[-4deg] shadow-xl transition group-hover:scale-105" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>
      <div className="relative px-2.5 pt-1 pb-2">
        <div className="truncate text-sm font-black text-white">{DECKS[id].label}</div>
        <div className="text-[11px] text-slate-400">{deckSize(id)} ใบ</div>
      </div>
      {selected && <div className="absolute top-1.5 right-1.5 rounded-full bg-yellow-300 px-1.5 text-[11px] font-black text-slate-900">✓</div>}
    </button>
  );
}
