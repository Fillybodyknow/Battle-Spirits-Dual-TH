/**
 * กล่องเด็ค (วาดเองด้วย CSS) + การ์ดเด่น 3 ใบโผล่ออกจากกล่องเป็นพัดเมื่อชี้
 * ใช้ของตกแต่งของเด็ค (สีกล่อง / การ์ดเด่น) จาก decks.ts
 */
import { rarityOf } from '@bs/cards';
import { cardArt } from '../assets';
import { deckInfo, loadDeckAcc, type DeckId } from '../decks';
import { db } from '../store';
import { CardArt, deckColor } from '../screens/shared';

/** การ์ดเด่นอัตโนมัติ: มีภาพก่อน · หายากสูงก่อน · คอสต์สูงก่อน · ไม่ซ้ำ */
export function autoKeyCards(deck: DeckId, n: number): string[] {
  const scored = deckInfo(deck)
    .entries.map((e) => ({ cardNo: e.cardNo, rank: rarityOf(db.find(e.cardNo)?.rarity)?.rank ?? 0, art: cardArt(e.cardNo) ? 1 : 0, cost: db.find(e.cardNo)?.cost ?? 0 }))
    .sort((a, b) => b.art - a.art || b.rank - a.rank || b.cost - a.cost);
  const out: string[] = [];
  for (const s of scored) {
    if (out.length >= n) break;
    if (!out.includes(s.cardNo)) out.push(s.cardNo);
  }
  return out;
}

/** การ์ดเด่นของเด็ค: ที่ตั้งไว้เอง (ยังอยู่ในเด็ค) ก่อน แล้วเติมด้วยอัตโนมัติ */
export function keyCards(deck: DeckId, n: number): string[] {
  const inDeck = new Set(deckInfo(deck).entries.map((e) => e.cardNo));
  const set = (loadDeckAcc(deck).main ?? []).filter((c) => inDeck.has(c));
  const out = [...new Set(set)];
  for (const c of autoKeyCards(deck, n + out.length)) if (out.length < n && !out.includes(c)) out.push(c);
  return out.slice(0, n);
}

/** สีกล่องที่เลือกได้ (ไม่เลือก = สีหลักของเด็ค) */
export const CASE_COLORS: { id: string; label: string; color: string }[] = [
  { id: '#f43f5e', label: 'แดง', color: '#f43f5e' },
  { id: '#a855f7', label: 'ม่วง', color: '#a855f7' },
  { id: '#22c55e', label: 'เขียว', color: '#22c55e' },
  { id: '#e2e8f0', label: 'ขาว', color: '#e2e8f0' },
  { id: '#facc15', label: 'เหลือง', color: '#facc15' },
  { id: '#38bdf8', label: 'ฟ้า', color: '#38bdf8' },
  { id: '#f97316', label: 'ส้ม', color: '#f97316' },
  { id: '#64748b', label: 'เทาเหล็ก', color: '#64748b' },
  { id: '#d4a72c', label: 'ทอง', color: '#d4a72c' },
];

/** กล่องเด็ค · open = กางการ์ดค้างไว้ · caseOverride = ดูตัวอย่างสีก่อนบันทึก */
export function DeckBox({ deck, open, size = 1, caseOverride, mainOverride }: { deck: DeckId; open?: boolean; size?: number; caseOverride?: string; mainOverride?: string[] }) {
  const acc = loadDeckAcc(deck);
  const caseStyle = caseOverride ?? acc.case;
  const cards = mainOverride ?? keyCards(deck, 3);
  const color = caseStyle && caseStyle !== 'art' ? caseStyle : deckColor(deck);
  const art = caseStyle === 'art' ? cards[0] : undefined;
  const w = 64 * size;
  const h = 84 * size;
  return (
    <div className="relative" style={{ width: w * 1.9, height: h * 1.75 }}>
      {/* การ์ดที่โผล่จากกล่อง */}
      {cards.map((no, i) => {
        const off = i - (cards.length - 1) / 2;
        return (
          <div
            key={no + i}
            className={`absolute left-1/2 shadow-[0_6px_14px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out ${open ? '' : '[--up:0] group-hover:[--up:1]'}`}
            style={
              {
                ...(open ? { '--up': 1 } : {}),
                width: w * 0.92,
                bottom: h * 0.35,
                zIndex: 1 + (i === 1 ? 2 : 1),
                transform: `translateX(-50%) translateX(calc(var(--up) * ${off * w * 0.62}px)) translateY(calc(var(--up) * ${-h * 0.42 + Math.abs(off) * h * 0.08}px)) rotate(calc(var(--up) * ${off * 13}deg))`,
                opacity: 'var(--up)',
              } as React.CSSProperties
            }
          >
            <CardArt cardNo={no} className="w-full rounded-md" />
          </div>
        );
      })}
      {/* กล่อง: ฝา + ด้านข้าง + ด้านหน้า */}
      <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2" style={{ width: w, height: h }}>
        <div className="absolute -top-[7%] left-[6%] h-[9%] w-full skew-x-[-40deg] rounded-sm" style={{ background: `linear-gradient(90deg, ${color}cc, ${color}77)` }} />
        <div className="absolute top-[-3%] -right-[13%] h-full w-[14%] skew-y-[-40deg] rounded-sm brightness-50" style={{ background: color }} />
        <div className="absolute inset-0 overflow-hidden rounded-sm ring-1 ring-white/25" style={{ background: `radial-gradient(circle at 50% 38%, ${color}, ${color}55 55%, #0b1020 100%)` }}>
          {art ? (
            <CardArt cardNo={art} className="absolute inset-0 h-full w-full scale-125 object-cover object-[50%_25%]" />
          ) : (
            <svg viewBox="0 0 100 100" className="absolute inset-[18%] opacity-80">
              <path d="M50 6L94 50 50 94 6 50z" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="4" />
              <path d="M50 26L74 50 50 74 26 50z" fill="white" fillOpacity="0.35" />
            </svg>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      </div>
    </div>
  );
}
