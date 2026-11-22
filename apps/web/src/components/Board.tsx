import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { burstSetDone, activatableOptions, blockForced, onStageAbilities, baseCost, braveToSwap, canAttackWith, cardColors, cardGems, cardLevel, currentBp, isSpiritLike, magicBanned, payableCost, summonConditionOk, trashSummonRule, type CoreTarget, type GameState, type PlayerId } from '@bs/engine';
import { COLOR_LABEL, playerLabel } from '../format';
import { GEM_IMG, IMG } from '../assets';
import type { Fx } from '../store';
import { blockCandidates, braveSlot, controls, hiddenFrom, mine, braveHostOf, braveHosts, canDropBurst, canQuickSummon, handFieldAction, separatePlacement, viewPlayer, mySeat, partnerName } from '../store';
import { usePrefs, type HandLayout } from '../prefs';
import { castHandSlots, sortHand } from '../store';
import { CastRestCard, pickingCores } from './Fx';
import { allocOf, isDistributeCandidate, isMultiCardCandidate, pickedOf } from '../store';
import { actingPlayer, canEvolve, db, isMultiHostCandidate, flashPlayer, inMain, isChoiceCandidate, isFxBlocking, handMagicTimings, responseOptions, simulateEvolve, simulateMove, useGame } from '../store';
import { useFlashUsable } from './Controls';
import { useHeld, useShownLife } from './useHeld';
import { CardBack, CardFace } from './CardFace';
import { FieldCracks } from './Cracks';
import { Note } from './IdolFx';
import { Core, CoreRow, CoreTray } from './Core';
import { beginCardDrag } from './DragGhost';

/** การ์ดนี้มีแอนิเมชันกำลังบินมาที่ตำแหน่งของมัน (ซ่อนตัวจริงไว้ก่อน) */
function useFlying(cardId: string): boolean {
  // ภาพวิ่งชน (charge) ซ่อนการ์ดตัวจริงเองตอนเริ่มวิ่ง
  return useGame((s) => s.fx.some((f) => f.kind === 'fly' && f.hideTarget && f.cardId === cardId));
}

// ---------------------------------------------------------------- drag & drop

/** ผลของการวาง Core ที่กำลังลากลงบนปลายทาง: ใช้แสดงตัวอย่างก่อนปล่อย */
function useDropPreview(to: CoreTarget | null) {
  const state = useGame((s) => s.state);
  const dragging = useGame((s) => s.dragging);
  return useMemo(() => (dragging && to ? simulateMove(state, dragging, to) : null), [state, dragging, to && ('cardId' in to ? to.cardId : 'r')]);
}

/** การ์ดที่จะสูญสลายถ้าย้าย Core ที่กำลังลากออกไป */
function useDepletingWhileDragging(): Set<string> {
  const state = useGame((s) => s.state);
  const dragging = useGame((s) => s.dragging);
  return useMemo(() => {
    if (!dragging) return new Set();
    const after = simulateMove(state, dragging, { area: 'reserve' });
    if (!after) return new Set();
    return new Set(state.players[state.turnPlayer].field.filter((id) => !after.players[state.turnPlayer].field.includes(id)));
  }, [state, dragging]);
}

function dropHandlers(active: boolean, onDrop: () => void, setOver: (v: boolean) => void) {
  if (!active) return {};
  return {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      onDrop();
    },
  };
}

// ---------------------------------------------------------------- field

/** เมนู Brave ใน Main Step: ร่วมร่าง / ย้ายผู้ร่วมร่าง / แยกร่าง */
function BraveMenu({ braveId, onClose }: { braveId: string; onClose: () => void }) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const card = state.cards[braveId]!;
  const attached = !state.players[card.owner].field.includes(braveId);
  const hosts = braveHosts(state, braveId);
  const placement = attached ? separatePlacement(state, braveId) : null;
  const run = (hostId: string | null) => {
    onClose();
    dispatch({ type: 'brave', player: card.owner, braveId, hostId, ...(hostId === null && placement ? { placement } : {}) });
  };
  return (
    <div
      className="absolute inset-x-[-1.5rem] bottom-full z-30 mb-2 flex flex-col gap-1 rounded-lg border border-emerald-300/60 bg-slate-900 p-1.5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="px-1 text-[11px] font-bold text-emerald-300">{db.get(card.cardNo).name}</span>
      {hosts.map((h) => (
        <button key={h} type="button" className="rounded bg-emerald-500/20 px-2 py-1 text-left text-xs text-emerald-100 hover:bg-emerald-500/40" onClick={() => run(h)}>
          {braveToSwap(state, db, h, braveId)
            ? `สลับกับ ${db.get(state.cards[braveToSwap(state, db, h, braveId)!]!.cardNo).name} (บน ${db.get(state.cards[h]!.cardNo).name})`
            : `${attached ? 'ย้ายไปร่วมร่างกับ' : 'ร่วมร่างกับ'} ${db.get(state.cards[h]!.cardNo).name}`}
        </button>
      ))}
      {attached && (
        <button
          type="button"
          disabled={!placement}
          className="rounded bg-sky-500/20 px-2 py-1 text-left text-xs text-sky-100 hover:bg-sky-500/40 disabled:opacity-40"
          onClick={() => run(null)}
          title={placement ? 'วาง Core จากรีเสิร์ฟบนเบรฟ (ย้าย Core เพิ่มได้ภายหลัง)' : 'Core ในรีเสิร์ฟไม่พอวางบนเบรฟ'}
        >
          แยกร่าง (วาง Core {placement?.length ?? 0} ดวงจากรีเสิร์ฟ)
        </button>
      )}
      {hosts.length === 0 && !attached && <span className="px-1 text-xs text-slate-400">ไม่มีสปิริตที่ร่วมร่างได้ (คอสต์ 4+)</span>}
      <button type="button" className="rounded px-2 py-0.5 text-xs text-slate-400 hover:text-white" onClick={onClose}>
        ปิด
      </button>
    </div>
  );
}

/** การ์ดอยู่บนแผ่นฝั่งตรงข้ามที่หมุน 180° (ป้ายที่ต้องอ่านได้ หมุนกลับ) */
const MatTopCtx = createContext(false);

/** สายฟ้า (สัญลักษณ์ Flash) เป็น SVG: อีโมจิเป็นกล่องว่างบน Windows 7 */
function Bolt({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M13.5 2 4 13.5h6.5L9 22l11-12.5h-6.8L13.5 2Z" fill="currentColor" />
    </svg>
  );
}

/**
 * เมนูเอฟเฟกต์ Flash ของการ์ดบนสนาม: ลอยเหนือการ์ด (portal ไป body: ไม่ถูกกรอบสนามตัด / มือไม่บัง)
 * แยกแถวตามการ์ดเจ้าของเอฟเฟกต์ (ตัวเอง / Brave ที่ร่วมร่าง) พร้อมข้อความย่อ · ชี้แถว = แผงข้อมูลของการ์ดใบนั้น
 * การ์ดอยู่ครึ่งบนของจอ (ฝั่งที่หมุนกลับ): เปิดลงด้านล่างแทน
 */
function FlashMenu({ cardId, anchor, onClose }: { cardId: string; anchor: React.RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const state = useGame((s) => s.state);
  const hover = useGame((s) => s.hover);
  const card = state.cards[cardId]!;
  const opts = activatableOptions(state, db, card.owner, cardId);
  const evo = canEvolve(state, cardId);
  const count = opts.length + (evo ? 1 : 0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(() => anchor.current?.getBoundingClientRect() ?? null);

  // ตามตำแหน่งการ์ด (เสื่อมสภาพ/ขยับ/ย่อหน้าจอ)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setRect((p) => (p && Math.abs(p.left - r.left) < 0.5 && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.width - r.width) < 0.5 ? p : r));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [anchor]);

  // คลิกที่อื่น (นอกเมนูและนอกการ์ด) = ปิด
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [anchor, onClose]);

  if (!rect) return null;
  // ไม่ให้ล้นขอบจอซ้าย/ขวา (กว้าง 17rem = 272px)
  const cx = Math.min(Math.max(rect.left + rect.width / 2, 144), window.innerWidth - 144);
  const below = rect.top + rect.height / 2 < window.innerHeight / 2;
  const pos: React.CSSProperties = below ? { top: rect.bottom + 10 } : { bottom: window.innerHeight - rect.top + 10 };
  const run = (source: number, from: string) => {
    onClose();
    hover(null);
    useGame.getState().dispatch({ type: 'activate', player: card.owner, cardId, source, ...(from !== cardId ? { from } : {}) });
  };

  return createPortal(
    <div
      ref={menuRef}
      data-flash-menu={cardId}
      className="fixed z-[65] flex w-[17rem] -translate-x-1/2 flex-col gap-1 rounded-xl border border-cyan-300/70 bg-slate-900/95 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
      style={{ left: cx, ...pos, animation: 'fx-fade-in 0.15s ease-out both' }}
    >
      <div className="flex items-center gap-1 px-1 text-[11px] font-black text-cyan-300">
        <Bolt />
        {flashPlayer(state) ? 'เลือกเอฟเฟกต์ Flash' : 'เลือกเอฟเฟกต์'}
        {count > 1 ? ` (${count})` : ''}
      </div>
      <div className="flex max-h-[16rem] flex-col gap-1 overflow-y-auto">
        {evo && (
          <button
            type="button"
            onClick={() => {
              onClose();
              hover(null);
              useGame.getState().openEvolve(cardId);
            }}
            onMouseEnter={() => hover(cardId)}
            onMouseLeave={() => hover(null)}
            className="flex items-start gap-1.5 rounded-lg bg-emerald-400 p-1 pr-1.5 text-left text-slate-900 shadow hover:bg-emerald-200"
          >
            <div className="h-10 w-7 shrink-0 overflow-hidden rounded">
              <CardFace def={db.get(card.cardNo)} size="xs" />
            </div>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1 text-xs font-black">
                <span className="truncate">{db.get(card.cardNo).name}</span>
                <span className="shrink-0 rounded bg-emerald-800 px-1 text-[9px] text-white">Evolution</span>
              </span>
              <span className="line-clamp-2 text-[10px] leading-tight font-semibold text-slate-800">ดึง Core จากสปิริตอื่นของเรามาวางบนสปิริตนี้ (เลือก Core บนกระดาน)</span>
            </span>
          </button>
        )}
        {opts.map(({ ability: ab, from }) => {
          const def = db.get(state.cards[from]!.cardNo);
          const text = ab.label.startsWith('[') ? ab.label.slice(ab.label.indexOf(']') + 1).trim() : ab.label;
          return (
            <button
              key={`${from}-${ab.source}`}
              type="button"
              onClick={() => run(ab.source, from)}
              onMouseEnter={() => hover(from)}
              onMouseLeave={() => hover(null)}
              title={ab.label}
              className="flex items-start gap-1.5 rounded-lg bg-cyan-300 p-1 pr-1.5 text-left text-slate-900 shadow hover:bg-cyan-100"
            >
              <div className="h-10 w-7 shrink-0 overflow-hidden rounded">
                <CardFace def={def} size="xs" />
              </div>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1 text-xs font-black">
                  <span className="truncate">{def.name}</span>
                  {from !== cardId && <span className="shrink-0 rounded bg-emerald-700 px-1 text-[9px] text-white">Brave</span>}
                </span>
                <span className="line-clamp-2 text-[10px] leading-tight font-semibold text-slate-800">{text}</span>
              </span>
            </button>
          );
        })}
      </div>
      {/* หัวลูกศรชี้ไปที่การ์ด */}
      <span
        className={`absolute h-3 w-3 -translate-x-1/2 rotate-45 bg-slate-900 ${below ? '-top-[7px] border-t border-l' : '-bottom-[7px] border-r border-b'} border-cyan-300/70`}
        style={{ left: `calc(50% + ${rect.left + rect.width / 2 - cx}px)` }}
      />
    </div>,
    document.body,
  );
}

/** สีเจ็มสำหรับแสงเรือง / เจ็มที่ไม่มีภาพ (อัลติเมท) */
const GEM_HEX: Record<string, string> = { red: '#ef4444', purple: '#a855f7', green: '#22c55e', white: '#e2e8f0', yellow: '#facc15', blue: '#38bdf8', ultimate: '#fbbf24' };

/** ภาพเจ็มสีเดียว (ไม่มีภาพ = ข้าวหลามตัดสีนั้น) */
function GemIcon({ color, className }: { color: string; className: string }) {
  return GEM_IMG[color] ? (
    <img src={GEM_IMG[color]} alt="" draggable={false} className={`${className} object-contain`} style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.9))' }} />
  ) : (
    <span className={`${className} flex items-center justify-center`}>
      <span className="h-[62%] w-[62%] rotate-45 rounded-[2px] border border-white/80" style={{ background: GEM_HEX[color] ?? '#facc15' }} />
    </span>
  );
}

/**
 * ป้ายเจ็มของการ์ดบนสนามทุกใบที่มีเจ็ม (สปิริต/อัลติเมท/เบรฟ/เน็กซัส · มุมขวาล่าง คู่กับป้าย Lv มุมซ้ายล่าง · ป้าย BP อยู่มุมขวาบน)
 * · เจ็มทีละเม็ดตามสี (มากกว่า 3 เม็ด = ภาพ + ×จำนวน) รวมเจ็มจากเบรฟที่ร่วมร่าง / เอฟเฟกต์
 * · "เจ็มถือว่าเป็นสี X ด้วย" (ทุกเจ็มของการ์ด รวมจากเบรฟ/เอฟเฟกต์): เจ็มเม็ดนั้นตัดแบ่งแนวเฉียงเป็นสีเดิม/สี X (หลายสี = แถบเฉียง) + ขอบป้ายไล่สีทุกสีที่นับได้
 * · "สีถือว่าเป็นสี X ด้วย" (ไม่ได้รวมเจ็ม) และสีจากเบรฟ: จุดสีหลังเส้นคั่น
 * · เจ็มถูกทำให้เป็น 0 ในเทิร์นนี้: เจ็มจาง + ขีดฆ่า "0"
 */
function GemBadge({ cardId, compact }: { cardId: string; compact?: boolean }) {
  const state = useGame((s) => s.state);
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const { gems, zeroed } = cardGems(state, db, cardId);
  const gemAlso = new Set(gems.flatMap((g) => [g.color, ...g.also]));
  const extraColors = cardColors(state, db, cardId).filter((c) => !def.colors.includes(c) && !gemAlso.has(c));
  const total = gems.reduce((n, g) => n + g.count, 0);
  if (total === 0 && !zeroed && extraColors.length === 0) return null;
  const many = total > 3;
  const multi = gems.some((g) => g.also.length > 0);
  const rainbow = [...new Set(gems.flatMap((g) => [g.color, ...g.also]))].map((c) => GEM_HEX[c] ?? '#fff');
  const title = [
    zeroed ? 'เจ็ม 0 (ในเทิร์นนี้)' : `เจ็ม ${total} เม็ด`,
    ...gems.map(
      (g) =>
        `${COLOR_LABEL[g.color]} ${g.count}${g.added ? ' (จากเบรฟ/เอฟเฟกต์)' : ''}${g.also.length ? ` · ถือว่าเป็นสี${g.also.map((c) => COLOR_LABEL[c]).join('/')}ด้วย` : ''}`,
    ),
    ...(extraColors.length ? [`สีการ์ดถือว่าเป็นสี${extraColors.map((c) => COLOR_LABEL[c]).join('/')}ด้วย`] : []),
  ].join('\n');
  // "ถือว่าเป็นสี X ด้วย" = เจ็มเม็ดเดียวตัดแบ่งแนวเฉียง: ซ้ายบนสีเดิม → ขวาล่างสีที่ถือว่าเป็นด้วย (หลายสี = แถบเฉียงเท่า ๆ กัน)
  const icon = (color: string, also: string[], key: number | string) => {
    const parts = [color, ...also];
    return (
      <span key={key} className="relative h-[26px] w-[26px] shrink-0">
        {parts.map((c, i) => {
          if (i === 0) return <GemIcon key={c} color={c} className="absolute inset-0 h-full w-full" />;
          const from = (i / parts.length) * 100;
          const to = ((i + 1) / parts.length) * 100;
          const mask = `linear-gradient(135deg, transparent ${from}%, #000 ${from}%, #000 ${to}%, transparent ${to}%)`;
          return (
            <span key={c} className="absolute inset-0" style={{ maskImage: mask, WebkitMaskImage: mask }}>
              <GemIcon color={c} className="h-full w-full" />
            </span>
          );
        })}
      </span>
    );
  };
  return (
    <div
      data-gems={cardId}
      title={title}
      className={`pointer-events-auto absolute z-[6] origin-bottom-right rounded-md p-px shadow ${compact ? '-right-1.5 -bottom-1 scale-[0.8]' : '-right-2.5 bottom-1'}`}
      // ขอบไล่สี = เจ็มนับได้หลายสี
      style={{ background: multi ? `linear-gradient(135deg, ${rainbow.join(', ')})` : 'rgba(255,255,255,0.15)' }}
    >
      {/* 3 เม็ดขึ้นไป: เจ็มซ้อนกันเล็กน้อย ป้ายไม่ยาวไปชนป้าย Lv */}
      <div className={`flex items-center rounded-[5px] bg-black/85 py-0.5 pr-1 pl-1 ${total >= 3 && !many ? '-space-x-1.5' : 'gap-0.5'}`}>
        {zeroed ? (
          <>
            <span className="flex opacity-60 grayscale">{icon(Object.keys(def.symbols)[0] ?? 'white', [], 'z')}</span>
            <span className="text-sm font-black text-rose-300 line-through decoration-2">0</span>
          </>
        ) : many ? (
          gems.map((g, i) => (
            <span key={i} className="flex items-center gap-px">
              {icon(g.color, g.also, i)}
              <span className="text-sm font-black text-white">×{g.count}</span>
            </span>
          ))
        ) : (
          gems.flatMap((g, i) => Array.from({ length: g.count }, (_, k) => icon(g.color, g.also, `${i}-${k}`)))
        )}
        {extraColors.length > 0 && (
          <span className="ml-0.5 flex items-center gap-0.5 border-l border-white/25 pl-1">
            {extraColors.map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full ring-1 ring-white/60" style={{ background: GEM_HEX[c] }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/** 2VS2: ป้ายเจ้าของการ์ดบนสนามรวม (เรา / เพื่อน / คู่แข่ง 1 / คู่แข่ง 2) */
function OwnerTag({ cardId, top }: { cardId: string; top: boolean }) {
  const card = useGame((s) => s.state.cards[cardId]);
  const me = useGame((s) => viewPlayer(s));
  const names = useGame((s) => s.teamNames);
  if (!card) return null;
  const seat = card.seat ?? 0;
  const ours = card.owner === me;
  // การ์ดของเครื่องนี้ = ที่นั่งของเรา (Team Battle: คนที่สองของทีมก็เห็นการ์ดตัวเองเป็น "เรา")
  const own = ours && seat === mySeat();
  const label = ours ? (own ? 'เรา' : 'เพื่อน') : seat ? 'คู่แข่ง 2' : 'คู่แข่ง 1';
  const cls = ours ? (own ? 'bg-sky-400 text-slate-950' : 'bg-violet-500 text-white') : seat ? 'bg-orange-500 text-white' : 'bg-rose-500 text-white';
  const title = ours ? (own ? 'การ์ดของเรา' : (names?.[card.owner] ?? 'เพื่อนร่วมทีม')) : seat ? (names?.[card.owner] ?? 'คู่แข่งคนที่ 2') : 'คู่แข่งคนที่ 1';
  return (
    <div
      title={title}
      className={`pointer-events-none absolute -left-2 z-[6] rounded px-1.5 text-[10px] leading-4 font-black shadow ring-1 ring-black/40 ${cls} ${top ? 'bottom-1 rotate-180' : '-top-2'}`}
    >
      {label}
    </div>
  );
}

function FieldCard({ cardId, depleting }: { cardId: string; depleting: boolean }) {
  const state = useGame((s) => s.state);
  const dragging = useGame((s) => s.dragging);
  const hasSelection = useGame((s) => s.selectedCores.length > 0);
  const pinned = useGame((s) => s.pinned === cardId);
  /** เป็นตัวเลือกของเอฟเฟกต์ที่รออยู่ (คลิกเพื่อเลือก) · อัญเชิญหลายใบ: ผู้ร่วมร่างของ Brave ที่กำลังจัด */
  const candidate = useGame((s) => (isChoiceCandidate(s.state, cardId) || isMultiHostCandidate(s, cardId) || isDistributeCandidate(s.state, cardId) || isMultiCardCandidate(s.state, cardId)) && !isFxBlocking(s.fx));
  /** เลือกหลายใบทีเดียว: ตัวนี้ถูกเลือกไว้ */
  const picked = useGame((s) => pickedOf(s).includes(cardId));
  /** แบ่งคอร์ที่จะส่งออก: จำนวนที่เลือกจากการ์ดนี้ */
  const allocN = useGame((s) => allocOf(s)[cardId] ?? 0);
  // เทนเซย์: แบ่งคอร์วอยด์ไปวาง (ไม่ใช่ส่งออก)
  const allocPlace = useGame((s) => s.state.choice?.kind === 'distribute' && s.state.choice.to === 'place');
  const matTop = useContext(MatTopCtx);
  /** กำลังเลือก Core สำหรับ [Evolution] ของการ์ดนี้ */
  const evolving = useGame((s) => s.evolveCard === cardId);
  const evolveMode = useGame((s) => !!s.evolveCard);
  const selectedCores = useGame((s) => s.selectedCores);
  const flying = useFlying(cardId);
  /** เบรฟที่กำลังบินมาร่วมร่าง: ช่องเบรฟซ่อนไว้จนบินถึง */
  const flyingBraves = useGame((s) => s.fx.filter((f) => f.kind === 'fly' && f.hideTarget).map((f) => (f.kind === 'fly' ? f.cardId : '')).join(','));
  const { clickFieldCard, moveCoresTo, openEvolve, closeEvolve, hover, openPlay } = useGame.getState();
  const [over, setOver] = useState(false);
  /** กำลังลาก Brave จากมือ และสปิริตนี้ร่วมร่างได้ */
  const braveDrop = useGame((s) => !!s.handDrag && braveHosts(s.state, s.handDrag).includes(cardId));
  /** กำลังลาก Brave บนสนาม และสปิริตนี้รับร่วมร่างได้ */
  const fieldBraveDrop = useGame((s) => !!s.braveDrag && braveHosts(s.state, s.braveDrag).includes(cardId));
  const draggingThis = useGame((s) => s.braveDrag === cardId);
  const fxBlocking = useGame((s) => isFxBlocking(s.fx));
  /** Flash Timing: การ์ดนี้มีเอฟเฟกต์ Flash / [Evolution] ที่กดใช้ได้ตอนนี้ */
  const flashReady = useGame((s) => {
    const fp = flashPlayer(s.state);
    if (!fp || !mine(fp) || isFxBlocking(s.fx)) return false;
    const o = responseOptions(s.state, fp);
    return o.activate.includes(cardId) || o.evolve.includes(cardId);
  });
  /** เมนู Brave ที่เปิดอยู่ (Brave เดี่ยวตัวนี้ หรือ Brave ที่ร่วมร่างกับตัวนี้) */
  const [braveMenu, setBraveMenu] = useState<string | null>(null);
  /** เมนูเอฟเฟกต์ Flash ที่กดใช้เอง (เปิดเมื่อคลิกการ์ด) */
  const [flashOpen, setFlashOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  // ระหว่างแอนิเมชันเอฟเฟกต์: แสดง BP/Lv เดิมไว้ก่อน จนกว่าจะเล่นถึงจังหวะที่ค่าเปลี่ยน
  const held = useHeld(cardId);
  const level = held?.level ?? cardLevel(state, db, cardId);
  const bp = held?.bp ?? currentBp(state, db, cardId);
  const spirit = isSpiritLike(def);
  const exhausted = card.state === 'exhausted' || !!held?.exhausted;
  const battle = state.battle;
  const isAttacker = battle?.attackerId === cardId;
  const isBlocker = battle?.blockers.includes(cardId) ?? false;

  // ออนไลน์: จับต้องได้เฉพาะการ์ดของที่นั่งเรา · 2VS2: การ์ดของเพื่อนร่วมทีมโจมตี/ป้องกัน/จัดคอร์/ใช้เอฟเฟกต์ไม่ได้
  // (state อยู่ในมุมของที่นั่งเรา: ที่นั่งที่อยู่ที่ players[เจ้าของ] = ที่นั่งของเครื่องนี้)
  const own = mine(card.owner) && (state.mode !== '2v2' || (card.seat ?? 0) === (state.players[card.owner].active ?? 0));
  const ready = own && spirit && !exhausted && !state.winner && !state.choice;
  const canAttack = ready && state.phase === 'attack' && !battle && card.owner === state.turnPlayer && canAttackWith(state, db, cardId);
  const confirming = useGame((s) => s.attackConfirm === cardId);
  const blockConfirming = useGame((s) => s.blockConfirm === cardId);
  /** On Stage (BS07) ที่ทำได้ตอนนี้: ทางเลือกแทนการโจมตี */
  const stageAbs = own && mine(card.owner) ? onStageAbilities(state, db, card.owner, cardId) : [];
  // ป้องกัน: ใช้รายชื่อจาก engine (รวมตัวที่ป้องกันได้แม้เสื่อมสภาพ / กฎป้องกันพิเศษ)
  const canBlock = own && !state.winner && !state.choice && battle?.step === 'declareBlock' && card.owner !== state.turnPlayer && blockCandidates(state).includes(cardId);
  const ownTurnMain = own && inMain(state) && card.owner === state.turnPlayer;
  /** เบรฟที่ร่วมร่างบนการ์ดนี้: เจ้าของเบรฟสั่งแยกร่าง/ย้ายได้ในเมนสเต็ป (2VS2: ดูที่นั่งของเบรฟ ไม่ใช่ของร่างหลัก) */
  const braveOwnMain = (b: string) =>
    mine(card.owner) && (state.mode !== '2v2' || (state.cards[b]?.seat ?? 0) === (state.players[card.owner].active ?? 0)) && inMain(state) && card.owner === state.turnPlayer;
  const flashOpts = own && !evolveMode && !fxBlocking ? activatableOptions(state, db, card.owner, cardId) : [];
  /** [Evolution] ใช้ได้ตอนนี้ (Main Step ของเรา / Flash timing): อยู่ในเมนูเดียวกับเอฟเฟกต์ Flash */
  const evo = own && !evolveMode && !fxBlocking && canEvolve(state, cardId);
  const menuCount = flashOpts.length + (evo ? 1 : 0);
  // ใช้ได้หมด / หมดจังหวะ: ปิดเมนู
  useEffect(() => {
    if (flashOpen && menuCount === 0) setFlashOpen(false);
  }, [flashOpen, menuCount]);
  const dropTarget = ownTurnMain && (!!dragging || hasSelection);

  const target = useMemo<CoreTarget>(() => ({ cardId }), [cardId]);
  const preview = useDropPreview(dragging && ownTurnMain ? target : null);
  const previewText = (() => {
    if (evolving) {
      const after = simulateEvolve(state, cardId, selectedCores);
      return after ? `→ Lv${cardLevel(after, db, cardId)} · BP ${currentBp(after, db, cardId).toLocaleString()}` : null;
    }
    if (!preview) return null;
    if (!preview.players[card.owner].field.includes(cardId)) return 'สูญสลาย!';
    const lv = cardLevel(preview, db, cardId);
    return def.type === 'nexus' ? `→ Lv${lv}` : `→ Lv${lv} · BP ${currentBp(preview, db, cardId).toLocaleString()}`;
  })();

  // กรอบการ์ด: สถานะแรกที่เป็นจริงตามลำดับความสำคัญ
  const ring =
    (
      [
        [picked, 'ring-4 ring-yellow-300 cursor-pointer'],
        [candidate, 'ring-4 ring-fuchsia-400 cursor-pointer'],
        [flashReady, 'ring-4 ring-cyan-300'],
        [evolving || over, 'ring-4 ring-emerald-400'],
        [canAttack && confirming, 'ring-4 ring-rose-500 cursor-pointer -translate-y-1'],
        [canAttack, 'ring-4 ring-amber-400 cursor-pointer'],
        [canBlock, 'ring-4 ring-sky-400 cursor-pointer'],
        [dropTarget, 'ring-2 ring-emerald-400/60 cursor-pointer'],
        [isAttacker || isBlocker, 'ring-4 ring-rose-500'],
        [pinned, 'ring-2 ring-slate-300'],
      ] as const
    ).find(([on]) => on)?.[1] ?? '';

  if (def.type === 'nexus') {
    return (
      <div
        data-field-card={cardId}
        className={`relative flex shrink-0 items-center gap-1 rounded-lg bg-black/40 p-1 transition ${flying ? 'invisible' : ''} ${
          candidate
            ? 'cursor-pointer ring-4 ring-fuchsia-400'
            : over
              ? 'ring-4 ring-emerald-400'
              : dropTarget
                ? 'ring-2 ring-emerald-400/60'
                : pinned
                  ? 'ring-2 ring-slate-300'
                  : 'ring-1 ring-white/10'
        }`}
        onMouseEnter={() => hover(cardId)}
        onMouseLeave={() => hover(null)}
        onClick={() => clickFieldCard(cardId)}
        {...dropHandlers(dropTarget, () => moveCoresTo(target), setOver)}
      >
        {/* เสื่อมสภาพ: หมุน 90° เหมือนสปิริต (กรอบขยายตามให้ไม่ทับช่อง Core) */}
        <div
          className={`relative flex shrink-0 cursor-pointer items-center justify-center transition-[height,width] duration-300 ${exhausted ? 'h-[4.2rem] w-24' : 'h-24 w-[4.2rem]'}`}
        >
          <div className={`h-24 w-[4.2rem] shrink-0 transition-transform duration-300 ${exhausted ? 'rotate-90 brightness-75' : ''}`}>
            <CardFace def={def} size="xs" level={level} />
          </div>
          {/* เจ็มของเน็กซัสนี้ */}
          <GemBadge cardId={cardId} compact />
        </div>
        {/* ช่อง Core แคบ ๆ ข้างการ์ด เรียงแนวตั้ง (หลายดวงซ้อนกันให้พอดีช่อง) · ชื่อ/รายละเอียดดูจากแผงรายละเอียดการ์ด */}
        <div className="flex h-24 w-8 flex-col items-center justify-center rounded bg-black/50 py-1 ring-1 ring-white/10">
          {card.cores.length > 0 ? (
            card.cores.map((id, i) => (
              <div
                key={id}
                className="relative"
                style={{ marginTop: i === 0 ? 0 : card.cores.length > 3 ? -Math.ceil((24 * card.cores.length - 84) / (card.cores.length - 1)) : 2, zIndex: card.cores.length - i }}
              >
                <Core coreId={id} size="md" board />
              </div>
            ))
          ) : (
            // ช่องว่าง: placeholder รูป Core เส้นประ
            <div className="flex flex-col items-center gap-1 select-none">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-300/30">
                <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
              <span className="text-[8px] text-slate-500">CORE</span>
            </div>
          )}
        </div>
        {previewText && (
          <span className="absolute top-full left-1/2 z-10 mt-0.5 -translate-x-1/2 rounded bg-emerald-400 px-1 text-center text-[10px] font-bold whitespace-nowrap text-slate-900">
            {previewText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      data-field-card={cardId}
      className={`flex shrink-0 flex-col items-center gap-1 transition-[width] duration-300 ${exhausted ? 'w-40' : 'w-28'} ${card.braves.length > 0 ? 'mr-7' : ''} ${card.braves.length > 1 ? 'ml-7' : ''} ${flying ? 'invisible' : ''}`}
      onMouseEnter={() => hover(cardId)}
      onMouseLeave={() => hover(null)}
      {...(braveDrop
        ? dropHandlers(true, () => {
            const brave = useGame.getState().handDrag;
            useGame.getState().endHandDrag();
            if (brave) openPlay(brave, 'summon', undefined, cardId);
          }, setOver)
        : fieldBraveDrop
          ? dropHandlers(true, () => useGame.getState().dropBrave(cardId), setOver)
          : dropHandlers(dropTarget, () => moveCoresTo(target), setOver))}
    >
      {/* กล่องนอกมีขนาดเท่าการ์ดที่เห็นจริง (เสื่อมสภาพ = นอน 90°) ป้ายทั้งหมดอยู่ในกล่องนี้ จึงไม่หมุนตาม */}
      <div
        onClick={() => {
          // Brave เดี่ยวของเราใน Main Step: เปิดเมนูร่วมร่าง
          const st = useGame.getState();
          if (def.type === 'brave' && ownTurnMain && st.selectedCores.length === 0 && !st.state.choice && !isChoiceCandidate(st.state, cardId)) {
            setBraveMenu(braveMenu ? null : cardId);
            return;
          }
          // มีเอฟเฟกต์ Flash / [Evolution] ที่กดใช้ได้: เปิด/ปิดเมนูเหนือการ์ด (เลือก Core ไว้ = ย้าย Core มาวางตามปกติ)
          if (menuCount > 0 && !st.state.choice && !isChoiceCandidate(st.state, cardId) && st.selectedCores.length === 0) {
            // แตะการ์ด = ปักแผงรายละเอียดการ์ดด้วย (เหมือนการ์ดใบอื่น) พร้อมเปิดเมนู
            useGame.setState({ pinned: cardId });
            setFlashOpen(!flashOpen);
            return;
          }
          clickFieldCard(cardId);
        }}
        ref={boxRef}
        className={`card-lift relative flex items-center justify-center ${exhausted ? 'h-28 w-40' : 'h-40 w-28'} ${draggingThis ? 'opacity-40' : ''}`}
        draggable={def.type === 'brave' && ownTurnMain && !fxBlocking && !state.choice}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', 'brave:' + cardId);
          beginCardDrag(e);
          setBraveMenu(null);
          useGame.getState().startBraveDrag(cardId);
        }}
        onDragEnd={() => useGame.getState().endBraveDrag()}
      >
        <div
          className={`h-40 w-28 shrink-0 rounded-lg transition-transform duration-300 ${exhausted ? 'rotate-90 brightness-75' : ''} ${ring}`}
          style={
            candidate
              ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' }
              : flashReady
                ? { animation: 'fx-flash-glow 1.2s ease-in-out infinite' }
                : undefined
          }
        >
          <CardFace def={def} level={level} />
        </div>
        {spirit && (
          <div
            className={`absolute -top-2.5 -right-2.5 rounded-md px-1.5 py-0.5 text-sm font-black shadow ${
              card.turnBp > 0 || bp > (def.levels.find((l) => l.level === level)?.bp ?? 0) ? 'bg-yellow-300 text-slate-900' : 'bg-black/85 text-yellow-300'
            }`}
          >
            {bp.toLocaleString()}
          </div>
        )}
        {/* เจ็มของการ์ดนี้ (ทุกการ์ดที่มีเจ็ม) */}
        <GemBadge cardId={cardId} />
        {/* 2VS2: เจ้าของการ์ด (สนามรวมของทีม: จัดคอร์/โจมตีได้เฉพาะของตัวเอง) */}
        {state.mode === '2v2' && <OwnerTag cardId={cardId} top={matTop} />}
        {/* แบ่งคอร์ที่จะส่งออก: จำนวนที่เลือกจากตัวนี้ + ปุ่มลด */}
        {allocN > 0 && (
          <div className={`absolute inset-x-0 z-[7] flex items-center justify-center gap-1 ${matTop ? 'top-2 rotate-180' : 'bottom-2'}`}>
            <button
              type="button"
              aria-label="ลด 1 เม็ด"
              onClick={(e) => {
                e.stopPropagation();
                useGame.getState().allocAdd(cardId, -1);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/90 text-lg font-black text-white shadow ring-2 ring-fuchsia-300 hover:bg-slate-700"
            >
              −
            </button>
            <span className="rounded-md bg-fuchsia-500 px-2 py-0.5 text-sm font-black whitespace-nowrap text-white shadow-lg">{allocPlace ? 'วาง' : 'ส่ง'} {allocN}</span>
          </div>
        )}
        {/* มีเอฟเฟกต์ Flash / [Evolution] ที่กดใช้ได้: ป้ายบอกให้คลิกการ์ด (Main Step มีแค่ Evolution = ป้าย Evolution สีเขียว) */}
        {menuCount > 0 && !flashOpen && (
          <div
            className={`pointer-events-none absolute top-6 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-black whitespace-nowrap text-slate-900 shadow ${flashPlayer(state) ? 'bg-cyan-300' : 'bg-emerald-400'}`}
            style={flashPlayer(state) ? { animation: 'fx-flash-glow 1.2s ease-in-out infinite' } : undefined}
          >
            <Bolt />
            {flashPlayer(state) ? `Flash${menuCount > 1 ? ` ×${menuCount}` : ''}` : 'Evolution'}
          </div>
        )}
        {/* Brave ที่ร่วมร่าง: ซ้อนมุมบนขวาของผู้ร่วมร่าง */}
        {card.braves.map((b, bi) => {
          // เป็นเป้าหมายให้เลือก (เช่น ทำลายเบรฟที่ร่วมร่างอยู่)
          const braveCandidate = !fxBlocking && isChoiceCandidate(state, b);
          const slot = braveSlot(bi, card.braves.length);
          // แยกร่าง/ย้ายเบรฟ = เจ้าของเบรฟ (2VS2: เบรฟของเราที่ร่วมร่างกับสปิริตของเพื่อน ดึงกลับได้ · ของเพื่อนบนสปิริตเรา ไม่ได้)
          const braveMain = braveOwnMain(b);
          return (
          <div
            key={b}
            data-brave-card={b}
            className={`absolute z-[5] h-[4.6rem] w-[3.3rem] rounded ${slot.right ? '-right-8 rotate-12' : '-left-8 -rotate-12'} ${flyingBraves.split(',').includes(b) ? 'invisible' : ''} shadow-[0_4px_10px_rgba(0,0,0,0.7)] ${
              braveCandidate ? 'cursor-pointer ring-4 ring-fuchsia-400' : 'ring-2 ring-emerald-300'
            }`}
            title={`Brave: ${db.get(state.cards[b]!.cardNo).name}${braveMain ? ' · คลิกเพื่อแยกร่าง/ย้าย' : ''}`}
            onMouseEnter={(e) => {
              e.stopPropagation();
              hover(b);
            }}
            onClick={(e) => {
              if (braveCandidate) {
                e.stopPropagation();
                useGame.getState().choose(b);
                return;
              }
              e.stopPropagation();
              // คลิกเบรฟ = เปิดรายละเอียดของเบรฟ (ไม่ใช่ผู้ร่วมร่าง) · เทิร์นเราใน Main Step เปิดเมนูแยกร่าง/ย้ายด้วย
              useGame.setState({ pinned: b });
              if (!braveMain || state.choice) return;
              setBraveMenu(braveMenu ? null : b);
            }}
            draggable={braveMain && !fxBlocking && !state.choice}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', 'brave:' + b);
              beginCardDrag(e);
              setBraveMenu(null);
              useGame.getState().startBraveDrag(b);
            }}
            onDragEnd={() => useGame.getState().endBraveDrag()}
            style={{ top: slot.top, ...(braveCandidate ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : braveMain ? { cursor: 'pointer' } : {}) }}
          >
            <CardFace def={db.get(state.cards[b]!.cardNo)} size="xs" />
          </div>
          );
        })}
        {braveMenu && (braveMenu === cardId ? ownTurnMain : braveOwnMain(braveMenu)) && <BraveMenu braveId={braveMenu} onClose={() => setBraveMenu(null)} />}
        {(braveDrop || fieldBraveDrop) && (
          <div className="absolute inset-x-1 bottom-1 z-10 rounded bg-emerald-400 py-0.5 text-center text-xs font-bold text-slate-900 shadow">
            {over ? 'ปล่อยเพื่อร่วมร่าง' : 'ร่วมร่างได้'}
          </div>
        )}
        {!isBlocker && battle?.chosenBlockers.includes(cardId) && (
          <div className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded bg-fuchsia-500 px-1.5 text-[11px] font-black whitespace-nowrap text-white shadow">
            🎯 ถูกเลือกให้ป้องกัน
          </div>
        )}
        {(isAttacker || isBlocker) && (
          <div className={`absolute -top-2.5 -left-2 rounded px-1.5 text-xs font-black text-white shadow ${isAttacker ? 'bg-rose-600' : 'bg-sky-600'}`}>
            {isAttacker ? 'โจมตี' : 'ป้องกัน'}
          </div>
        )}
        {candidate && allocN === 0 && (
          <div
            className={`absolute inset-x-1 rounded py-0.5 text-center text-xs font-bold shadow ${matTop ? 'top-1 rotate-180' : 'bottom-1'} ${picked ? 'bg-yellow-300 text-slate-900' : 'bg-fuchsia-500 text-white'}`}
          >
            {picked ? 'เลือกแล้ว ✓' : 'คลิกเพื่อเลือก'}
          </div>
        )}
        {canAttack && !confirming && (
          <div className="absolute inset-x-1 bottom-1 rounded bg-amber-400 py-0.5 text-center text-xs font-bold text-slate-900">คลิกเพื่อโจมตี</div>
        )}
        {/* On Stage (BS07): ทำได้แทนการโจมตี · ก่อนกด = ป้ายบนการ์ด · กดการ์ดแล้ว = ปุ่มข้างปุ่มดาบ */}
        {canAttack && stageAbs.length > 0 && !confirming && (
          <div className="pointer-events-none absolute top-6 left-1/2 z-[6] -translate-x-1/2 rounded-md bg-pink-400 px-1.5 py-0.5 text-[10px] font-black whitespace-nowrap text-slate-900 shadow">On Stage</div>
        )}
        {/* On Stage: ปุ่มวงกลมแบบเดียวกับปุ่มดาบ วางคู่กัน (ดาบซ้าย · On Stage ขวา) */}
        {canAttack &&
          confirming &&
          stageAbs.map((ab, i) => (
            <button
              key={ab.source}
              type="button"
              title={ab.label}
              onClick={(e) => {
                e.stopPropagation();
                useGame.setState({ attackConfirm: null });
                useGame.getState().dispatch({ type: 'onStage', player: card.owner, cardId, source: ab.source });
              }}
              className="absolute -top-7 z-20 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `calc(50% + ${38 + i * 76}px)`, animation: 'attack-btn-in 0.25s 0.05s cubic-bezier(.2,1.4,.4,1) both' }}
            >
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-pink-100 bg-gradient-to-b from-pink-400 to-fuchsia-700 text-white shadow-[0_0_18px_rgba(244,114,182,0.9),inset_0_2px_6px_rgba(255,255,255,0.45)] transition hover:scale-110">
                <span className="absolute inset-0 rounded-full border-2 border-pink-200/70" style={{ animation: 'login-ring 1.6s ease-out infinite' }} />
                {/* ไมโครโฟน (ธีมไอดอลของ On Stage) */}
                <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <path d="M12 17v5" />
                  <path d="M8 22h8" />
                </svg>
              </span>
              <span className="-mt-1 rounded bg-black/60 px-1.5 text-sm font-black whitespace-nowrap text-white [text-shadow:0_0_6px_rgba(244,114,182,0.9)]">
                {ab.keyword ? 'On Stage' : 'กลับใต้เด็ค'}
              </span>
            </button>
          ))}
        {/* ยืนยันโจมตี: ปุ่มวงกลมรูปดาบลอยเหนือการ์ด (กดปุ่ม หรือคลิกการ์ดซ้ำ = โจมตี) */}
        {canAttack && confirming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useGame.getState().confirmAttack(true);
            }}
            className="absolute -top-7 z-20 flex -translate-x-1/2 flex-col items-center"
            // มีปุ่ม On Stage: ดาบขยับไปซ้าย วางคู่กัน
            style={{ left: stageAbs.length > 0 ? 'calc(50% - 38px)' : '50%', animation: 'attack-btn-in 0.25s cubic-bezier(.2,1.4,.4,1) both' }}
            title="โจมตี"
          >
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-sky-100 bg-gradient-to-b from-sky-400 to-blue-700 text-white shadow-[0_0_18px_rgba(56,189,248,0.9),inset_0_2px_6px_rgba(255,255,255,0.45)] transition hover:scale-110">
              <span className="absolute inset-0 rounded-full border-2 border-sky-200/70" style={{ animation: 'login-ring 1.6s ease-out infinite' }} />
              <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
                <path d="m13 19 6-6" />
                <path d="m16 16 4 4" />
                <path d="m19 21 2-2" />
              </svg>
            </span>
            <span className="-mt-1 rounded bg-black/60 px-1.5 text-sm font-black text-white [text-shadow:0_0_6px_rgba(56,189,248,0.9)]">Attack</span>
          </button>
        )}
        {canBlock && !blockConfirming && (
          <div className="absolute inset-x-1 bottom-1 rounded bg-sky-400 py-0.5 text-center text-xs font-bold text-slate-900">คลิกเพื่อป้องกัน</div>
        )}
        {/* ยืนยันป้องกัน: ปุ่มวงกลมรูปโล่ลอยเหนือการ์ด (กดปุ่ม = ป้องกัน · คลิกการ์ดซ้ำ = พับปุ่ม) */}
        {canBlock && blockConfirming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useGame.getState().confirmBlock(true);
            }}
            // แผ่นสนามฝั่งบน (หมุน 180°): วางไว้ขอบล่างของการ์ด = ด้านบนบนจอ และหมุนกลับให้อ่านตรง
            className={`absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center ${matTop ? '-bottom-7 rotate-180' : '-top-7'}`}
            style={{ animation: 'attack-btn-in 0.25s cubic-bezier(.2,1.4,.4,1) both' }}
            title="ป้องกัน"
          >
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-100 bg-gradient-to-b from-emerald-400 to-teal-700 text-white shadow-[0_0_18px_rgba(52,211,153,0.9),inset_0_2px_6px_rgba(255,255,255,0.45)] transition hover:scale-110">
              <span className="absolute inset-0 rounded-full border-2 border-emerald-200/70" style={{ animation: 'login-ring 1.6s ease-out infinite' }} />
              <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span className="-mt-1 rounded bg-black/60 px-1.5 text-sm font-black text-white [text-shadow:0_0_6px_rgba(52,211,153,0.9)]">Block</span>
          </button>
        )}
        {previewText && (
          <div
            className={`absolute inset-x-1 bottom-1 rounded py-1 text-center text-sm font-bold shadow-lg ${
              previewText === 'สูญสลาย!' ? 'bg-rose-600 text-white' : 'bg-emerald-400 text-slate-900'
            }`}
          >
            {previewText}
          </div>
        )}
        {spirit && level === 0 && !previewText && (
          <div className="absolute inset-x-1 top-1/3 rounded bg-rose-700/90 py-1 text-center text-xs font-bold text-white shadow-lg">
            Core ไม่พอ
            <br />
            <span className="font-normal">สูญสลายเมื่อยืนยัน</span>
          </div>
        )}
        {depleting && !previewText && level > 0 && (
          <div className="absolute inset-x-1 bottom-1 rounded bg-rose-600 py-1 text-center text-sm font-bold text-white shadow-lg">จะสูญสลาย!</div>
        )}
      </div>

      {/* ถาด Core: ลากออกไปได้ วางเข้ามาได้ */}
      <div
        onClick={() => clickFieldCard(cardId)}
        className={`tray-well flex h-8 w-full items-center justify-center rounded-md border px-1 py-0.5 ${
          over ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/10 bg-black/40'
        }`}
      >
        {card.cores.length > 0 ? (
          <CoreTray cores={card.cores} width={exhausted ? 148 : 100} />
        ) : (
          <span className="text-[11px] text-slate-500">ไม่มี Core</span>
        )}
      </div>
      {evolving && (
        <button type="button" onClick={closeEvolve} className="w-full rounded-md bg-slate-700 py-1 text-xs font-bold text-emerald-300 shadow">
          กำลังเลือก Core… (ยกเลิก)
        </button>
      )}
      {/* เอฟเฟกต์ Flash ที่กดใช้เอง (โซอุม / โอกุมะ / Assault / ที่ Brave ให้) + [Evolution]: คลิกการ์ด → เมนูลอยเหนือการ์ด */}
      {flashOpen && menuCount > 0 && <FlashMenu cardId={cardId} anchor={boxRef} onClose={() => setFlashOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- playmat

/** ช่องบนแผ่นรองเล่น: กรอบขอบโลหะ ชื่อช่องตัวสลัก + คำอ่านภาษาไทย */
/**
 * มุโดว / เฮล-สคัล: คอร์ในรีเสิร์ฟ/แทรชของคู่แข่งเป็นตัวเลือกหนึ่งในหน้าแบ่งคอร์ (choice distribute)
 * คลิกช่อง = +1 เม็ด · ปุ่ม − = ลด
 */
export function PileAlloc({ pileId, label }: { pileId: string; label: string }) {
  const candidate = useGame((s) => isDistributeCandidate(s.state, pileId) && !isFxBlocking(s.fx));
  const n = useGame((s) => allocOf(s)[pileId] ?? 0);
  // ฝั่งคู่แข่งหมุน 180°: หมุนป้ายกลับให้อ่านได้
  const matTop = useContext(MatTopCtx);
  if (!candidate) return null;
  return (
    <div
      className={`absolute inset-0 z-20 flex cursor-pointer items-center justify-center rounded-lg ring-4 ring-fuchsia-400 ${matTop ? 'rotate-180' : ''}`}
      style={{ animation: 'fx-choice-glow 1.4s ease-in-out infinite' }}
      onClick={(e) => {
        e.stopPropagation();
        useGame.getState().allocAdd(pileId, 1);
      }}
      title={`คลิกเพื่อส่งคอร์จาก${label} 1 เม็ด`}
    >
      {n > 0 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="ลด 1 เม็ด"
            onClick={(e) => {
              e.stopPropagation();
              useGame.getState().allocAdd(pileId, -1);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/90 text-lg font-black text-white shadow ring-2 ring-fuchsia-300 hover:bg-slate-700"
          >
            −
          </button>
          <span className="rounded-md bg-fuchsia-500 px-2 py-0.5 text-sm font-black whitespace-nowrap text-white shadow-lg">ส่ง {n}</span>
        </div>
      ) : (
        <span className="rounded bg-fuchsia-500 px-1.5 py-0.5 text-[11px] font-bold text-white shadow">คลิก: คอร์จาก{label}</span>
      )}
    </div>
  );
}

function MatSlot({
  label,
  sub,
  count,
  children,
  className = '',
  ...rest
}: {
  label: string;
  sub: string;
  count?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`slot-frame relative flex flex-col gap-1 rounded-lg p-1.5 ${className}`}
      {...rest}
    >
      <div className="flex items-baseline justify-between gap-1 leading-none">
        <span className="font-serif text-[15px] font-bold tracking-wider text-slate-100 [text-shadow:0_1px_0_#000,0_0_8px_rgba(255,255,255,0.3)]">
          {label}
          <span className="ml-1 font-sans text-[10px] font-normal tracking-normal text-slate-400 [text-shadow:none]">{sub}</span>
        </span>
        {count !== undefined && <span className="text-xs font-semibold text-slate-300">{count}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * 2VS2: ช่องของคนที่สองของทีม (partner) = โซนที่ players[p].partner (state อยู่ในมุมของที่นั่งเรา: คนหลัก = ที่นั่งที่แสดงอยู่)
 * ช่องของคนที่สองดูได้อย่างเดียว (จัดคอร์/เซ็ทเบิร์ส/อัญเชิญจากแทรช = เจ้าของทำจากเครื่องตัวเอง)
 */
function zoneOf(state: GameState, player: PlayerId, partner?: boolean) {
  return partner ? state.players[player].partner! : state.players[player];
}
/** id กองคอร์ของคนนี้ในหน้าแบ่งคอร์ (pile:<กอง>:<ฝั่ง>[:1] ตามที่นั่งจริง) */
function pileId(state: GameState, kind: 'reserve' | 'trash', player: PlayerId, partner?: boolean): string {
  const active = state.players[player].active ?? 0;
  const seat = partner ? (active ? 0 : 1) : active;
  return `pile:${kind}:${player}${seat ? ':1' : ''}`;
}

function LifeSlot({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const state = useGame((s) => s.state);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const dispatch = useGame((s) => s.dispatch);
  const life = zoneOf(state, player, partner).life;
  const heldLife = useShownLife(player);
  const shownLife = partner ? life.length : heldLife;
  const slots = Math.max(state.config.initialLife, life.length, 6);
  // ช่วงประกาศป้องกัน: คลิกแผง Life ของฝ่ายป้องกัน = ไม่ป้องกัน (รับการโจมตีด้วย Life)
  const battle = state.battle;
  const canTake =
    !partner &&
    !blocking &&
    mine(player) &&
    !state.choice &&
    !state.winner &&
    battle?.step === 'declareBlock' &&
    player !== state.turnPlayer &&
    !(blockForced(state, db) && blockCandidates(state).length > 0);
  const more = (battle?.blockers.length ?? 0) > 0;
  return (
    <MatSlot
      data-life={partner ? undefined : player}
      label="Life"
      sub="ไลฟ์"
      count={shownLife}
      className={canTake ? 'cursor-pointer ring-4 ring-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.6)] transition hover:brightness-125' : ''}
      style={canTake ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : undefined}
      onClick={canTake ? () => dispatch({ type: 'noBlock', player }) : undefined}
      title={canTake ? (more ? 'ไม่ป้องกันเพิ่ม' : 'ไม่ป้องกัน: รับการโจมตีด้วย Life') : undefined}
    >
      {canTake && (
        <span className="pointer-events-none absolute inset-x-1 -bottom-2.5 z-10 rounded bg-rose-500 py-0.5 text-center text-[10px] font-black whitespace-nowrap text-white shadow">
          {more ? 'คลิก: ไม่ป้องกันเพิ่ม' : 'คลิก: รับด้วย Life'}
        </span>
      )}
      <div className="grid grid-cols-3 gap-x-1.5 gap-y-1 self-center">
        {Array.from({ length: slots }, (_, i) => (
          <div
            key={i}
            className="life-socket flex h-6 w-6 items-center justify-center rounded-full"
          >
            {life[i] && <Core coreId={life[i]!} size="md" />}
          </div>
        ))}
      </div>
    </MatSlot>
  );
}

function ReserveSlot({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const state = useGame((s) => s.state);
  const dragging = useGame((s) => s.dragging);
  const hasSelection = useGame((s) => s.selectedCores.length > 0);
  const moveCoresTo = useGame((s) => s.moveCoresTo);
  const [over, setOver] = useState(false);
  const p = zoneOf(state, player, partner);
  const active = !partner && mine(player) && inMain(state) && player === state.turnPlayer && (!!dragging || hasSelection);
  const target = useMemo<CoreTarget>(() => ({ area: 'reserve' }), []);

  return (
    <MatSlot
      data-reserve={partner ? undefined : player}
      label="Reserve"
      sub="รีเสิร์ฟ"
      count={p.reserve.length}
      className={`min-h-14 flex-1 ${over ? 'border-emerald-400 bg-emerald-400/25' : active ? 'cursor-pointer border-dashed border-emerald-400/80' : ''}`}
      onClick={active ? () => moveCoresTo(target) : undefined}
      {...dropHandlers(active, () => moveCoresTo(target), setOver)}
    >
      {p.reserve.length > 0 ? <CoreRow cores={p.reserve} size="md" board /> : <span className="text-[11px] text-slate-500">ว่าง</span>}
      <PileAlloc pileId={pileId(state, 'reserve', player, partner)} label="รีเสิร์ฟ" />
    </MatSlot>
  );
}

function BurstSlot({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const state = useGame((s) => s.state);
  const hiddenBurst = useGame((s) => hiddenFrom(s, player));
  const { hover, pin } = useGame.getState();
  const setBurst = zoneOf(state, player, partner).burst;
  // ใบที่กำลังบินมาเซ็ท: ช่องยังว่างจนบินถึง
  const flyingIn = useFlying(setBurst ?? '');
  const burst = flyingIn ? null : setBurst;
  const visible = !!burst && !hiddenBurst;
  const dropOk = useGame((s) => !partner && !!s.handDrag && s.state.cards[s.handDrag]!.owner === player && canDropBurst(s.state, s.handDrag));
  const dropHand = useGame((s) => s.dropHand);
  const dispatch = useGame((s) => s.dispatch);
  const fxBlocking = useGame((s) => isFxBlocking(s.fx));
  const [over, setOver] = useState(false);
  const myMain = useGame((s) => controls(s, player)) && !partner && inMain(state) && state.turnPlayer === player && !fxBlocking;
  /** คลิกการ์ด Burst ของเรา (Main Step) = เปิดตัวเลือก "ทิ้ง Burst" แทนป้าย "เซ็ทอยู่!" */
  const [menu, setMenu] = useState(false);
  const showMenu = menu && myMain && !!burst;
  const dragging = useGame((s) => !!burst && s.burstDrag === burst);
  return (
    <MatSlot
      label="Burst"
      sub="เบิร์สต์"
      className={`${burst ? 'border-orange-400/90 bg-orange-500/15' : ''} ${dropOk ? (over ? 'border-orange-300 bg-orange-400/35' : 'border-dashed border-orange-300') : ''}`}
      style={burst || dropOk ? { animation: 'fx-burst-glow 2s ease-in-out infinite' } : undefined}
      {...dropHandlers(dropOk, () => dropHand('burst'), setOver)}
    >
      {dropOk && (
        <div className="pointer-events-none absolute inset-x-1 -bottom-2 z-10 rounded bg-orange-500 py-0.5 text-center text-[11px] font-bold text-white shadow">
          {burst ? 'ปล่อยเพื่อเซ็ท Burst (แทนใบเดิม)' : 'ปล่อยเพื่อเซ็ท Burst'}
        </div>
      )}
      {/* การ์ด Burst กลางช่อง: ว่าง = กรอบเส้นประมีคำว่า "ว่าง" · เซ็ทแล้ว = หลังการ์ด + ป้าย + ปุ่มทิ้ง (มุมขวาบนของการ์ด) */}
      <div className="flex flex-1 items-center justify-center">
        <div
          data-burst-card={partner ? undefined : player}
          className={`relative h-24 w-[4.2rem] shrink-0 ${burst ? 'rounded-lg ring-2 ring-orange-400' : ''} ${visible ? 'cursor-pointer' : ''} ${dragging ? 'opacity-40' : ''}`}
          onMouseEnter={() => visible && hover(burst)}
          onMouseLeave={() => {
            hover(null);
            setMenu(false);
          }}
          onClick={() => {
            if (visible) pin(burst);
            if (myMain && burst) setMenu((v) => !v);
          }}
          draggable={myMain && !!burst}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'burst:' + burst);
            beginCardDrag(e);
            setMenu(false);
            hover(null);
            useGame.setState({ burstDrag: burst });
          }}
          onDragEnd={() => useGame.setState({ burstDrag: null })}
        >
          {burst ? (
            <CardBack />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-400/30 text-[11px] text-slate-500">ว่าง</div>
          )}
          {burst && !showMenu && (
            <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-orange-500/95 py-px text-center text-[10px] font-black whitespace-nowrap text-white shadow">เซ็ทอยู่!</span>
          )}
          {showMenu && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenu(false);
                dispatch({ type: 'discardBurst', player });
              }}
              className="absolute inset-x-0.5 bottom-1 rounded bg-rose-600 py-0.5 text-center text-[11px] font-black whitespace-nowrap text-white shadow-lg ring-1 ring-white/40 hover:bg-rose-500"
              style={{ animation: 'fx-chain-pop 0.2s ease-out both' }}
              title="ทิ้ง Burst ที่เซ็ทอยู่ลง Trash"
            >
              ทิ้ง Burst
            </button>
          )}
        </div>
      </div>
      {myMain && burstSetDone(state, player) && <span className="absolute top-1 right-1 rounded bg-black/60 px-1 text-[9px] text-orange-200">เซ็ทแล้วเทิร์นนี้</span>}
    </MatSlot>
  );
}

/** ความหนาของกองการ์ด (px): ยิ่งมากยิ่งหนา สูงสุด 6 */
function pileDepth(count: number): number {
  return count <= 0 ? 0 : Math.min(6, Math.ceil(count / 7));
}

/** ขอบกองการ์ดซ้อนกันตามความหนา (แสงจากด้านบน: ขอบล่างของกองเห็นเป็นชั้น ๆ) · face = กองหงาย (แทรช) */
function PileEdge({ count, face }: { count: number; face?: boolean }) {
  const n = pileDepth(count);
  return (
    <>
      <div className="absolute inset-0 rounded-lg" style={{ boxShadow: '0 calc(var(--ly) * 6px) 8px rgba(0,0,0,0.55)' }} />
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className={`absolute inset-0 rounded-lg ${face ? 'bg-slate-800 ring-1 ring-white/10' : 'bg-slate-900 ring-1 ring-slate-400/25'}`}
          style={{ translate: `0 calc(var(--ly) * ${-i}px)` }}
        />
      ))}
    </>
  );
}

function DeckSlot({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const count = useGame((s) => zoneOf(s.state, player, partner).deck.length);
  return (
    <MatSlot label="Deck" sub="เด็ค" count={count}>
      <div data-deck={partner ? undefined : player} className="relative mx-auto h-16 w-11">
        {count > 0 ? (
          <>
            <PileEdge count={count} />
            <div className="absolute inset-0" style={{ translate: `0 calc(var(--ly) * ${-pileDepth(count)}px)` }}>
              <CardBack />
            </div>
          </>
        ) : (
          <div className="h-full w-full rounded-lg border border-dashed border-rose-500/60" />
        )}
      </div>
    </MatSlot>
  );
}

function TrashSlot({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const p = useGame((s) => zoneOf(s.state, player, partner));
  const state = useGame((s) => s.state);
  const openTrash = useGame((s) => s.openTrash);
  // การ์ดที่ภาพ "ถูกทิ้ง" (จากเด็ค/มือ) หรือภาพแตกจากสนามยังเล่นอยู่: ยังไม่โชว์ใน Trash
  const fxList = useGame((s) => s.fx);
  // เมจิก/เบิร์สที่ยังค้างบนเวที (Spell Stage) ก็ยังไม่โชว์ใน Trash จนกว่าจะลงจากเวที
  const milling = fxList.flatMap((f) =>
    f.kind === 'mill' && f.owner === player ? f.cardIds : (f.kind === 'ghost' || f.kind === 'spell') && f.owner === player ? [f.cardId] : [],
  );
  const shown = milling.length > 0 ? p.trashCards.filter((id) => !milling.includes(id)) : p.trashCards;
  const top = shown.at(-1);
  const hover = useGame((s) => s.hover);
  // ลาก Burst ของผู้เล่นนี้มาปล่อย = ทิ้ง Burst
  const burstDrop = useGame((s) => !partner && !!s.burstDrag && s.state.players[player].burst === s.burstDrag);
  const [over, setOver] = useState(false);
  /** การ์ดใน Trash ที่อัญเชิญได้ตอนนี้ (Flash Timing หรือ Main Step) */
  const summonable = useGame((s) =>
    partner || !mine(player) || isFxBlocking(s.fx) || s.state.choice || s.state.winner
      ? 0
      : s.state.players[player].trashCards.filter((id) => trashSummonRule(s.state, db, player, id) !== null).length,
  );
  const inFlash = !!state.battle?.flash;
  return (
    <MatSlot
      data-trash={partner ? undefined : player}
      style={summonable > 0 && !burstDrop ? { animation: `${inFlash ? 'fx-flash-glow 1.2s' : 'fx-choice-glow 1.4s'} ease-in-out infinite` } : undefined}
      label="Trash"
      sub="แทรช"
      className={`min-h-20 flex-1 cursor-pointer hover:border-slate-200/50 ${
        burstDrop ? (over ? 'border-rose-300 bg-rose-500/30' : 'border-dashed border-rose-300') : summonable > 0 ? (inFlash ? 'border-cyan-300 bg-cyan-400/10' : 'border-yellow-300 bg-yellow-300/10') : ''
      }`}
      // มีใบที่อัญเชิญได้: เปิดพัดการ์ดบนกระดาน (เฉพาะใบที่อัญเชิญได้) · ไม่มี = ดูทั้งกอง
      onClick={() => {
        useGame.setState({ trashViewPartner: !!partner });
        if (summonable > 0) useGame.setState({ trashFan: player });
        else openTrash(player);
      }}
      title={summonable > 0 ? `อัญเชิญจาก Trash ได้ ${summonable} ใบ · คลิกเพื่อเลือก` : 'คลิกดูการ์ดใน Trash'}
      {...dropHandlers(burstDrop, () => {
        useGame.setState({ burstDrag: null });
        useGame.getState().dispatch({ type: 'discardBurst', player });
      }, setOver)}
    >
      {burstDrop && (
        <div className="pointer-events-none absolute inset-x-1 -top-2 z-10 rounded bg-rose-600 py-0.5 text-center text-[11px] font-bold text-white shadow">ปล่อยเพื่อทิ้ง Burst</div>
      )}
      <PileAlloc pileId={pileId(state, 'trash', player, partner)} label="แทรช" />
      {summonable > 0 && !burstDrop && (
        <div
          className={`pointer-events-none absolute inset-x-1 -top-2.5 z-10 rounded py-0.5 text-center text-[11px] font-black text-slate-950 shadow ${inFlash ? 'bg-cyan-300' : 'bg-yellow-300'}`}
        >
          {inFlash ? 'FLASH · ' : ''}อัญเชิญได้ {summonable} ใบ · คลิก
        </div>
      )}
      {/* การ์ดใบล่าสุดใน Trash (หงายหน้า) */}
      <div className="flex items-center gap-2 border-b border-slate-500/40 pb-1.5">
        <div
          className="relative h-16 w-11 shrink-0"
          data-trash-top={partner ? undefined : player}
          onMouseEnter={() => top && hover(top)}
          onMouseLeave={() => hover(null)}
        >
          {top ? (
            <>
              {p.trashCards.length > 1 && <PileEdge count={p.trashCards.length - 1} face />}
              <div className="relative h-full w-full" key={top} style={{ animation: 'fx-chain-pop 0.35s ease-out both', translate: `0 calc(var(--ly) * ${-pileDepth(p.trashCards.length - 1)}px)` }}>
                <CardFace def={db.get(state.cards[top]!.cardNo)} size="xs" />
              </div>
            </>
          ) : (
            <div className="h-full w-full rounded border border-dashed border-slate-400/30" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 text-[11px]">
          <span className="text-slate-400">Card · {shown.length} ใบ</span>
          <span className="line-clamp-2 text-slate-200">{top ? db.get(state.cards[top]!.cardNo).name : '—'}</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px]">
        <span className="text-slate-400">Core · {p.trashCores.length}</span>
        {p.trashCores.length > 0 && <CoreRow cores={p.trashCores} size="sm" />}
      </div>
    </MatSlot>
  );
}

/**
 * เมจิคไทป์ [เพลง] ที่วางบนฟิลด์ (BS07 กติกา 14 ไทป์:เพลง): วางแสดงไว้เฉย ๆ ใช้งานไม่ได้ (ไม่ใช่นอกมือ)
 * การ์ดซ้อนกันเป็นแถว ชี้/แตะค้างดูรายละเอียดได้
 */
const NO_SONGS: string[] = [];
function SongZone({ player, partner, compact }: { player: PlayerId; partner?: boolean; compact?: boolean }) {
  const songs = useGame((s) => zoneOf(s.state, player, partner).songs) ?? NO_SONGS;
  const hover = useGame((s) => s.hover);
  // การ์ดที่ยังเล่นแอนิเมชันอยู่ (บินจากเวที/มือ): ซ่อนตัวจริงไว้จนภาพมาถึง
  const busy = useGame((s) => s.fx.flatMap((f) => ((f.kind === 'spell' && f.exit === 'song') || (f.kind === 'fly' && f.hideTarget) ? [f.cardId] : [])).join('|')).split('|');
  return (
    <div className={`flex shrink-0 flex-col items-end gap-1 ${compact ? "" : "w-36"}`}>
      {/* นอกมือ (กติกา 14) อยู่เหนือโซนเพลง · กำหนดโซนแยกกันชัดเจน */}
      <OutsideZone player={player} partner={partner} />
      {songs.length > 0 && (
        <div data-song-zone={player} className="flex flex-col items-end gap-0.5" title="เมจิคไทป์ [เพลง] บนฟิลด์ (วางแสดง ใช้งานไม่ได้)">
          <span className="relative flex items-center gap-1 rounded bg-fuchsia-600/80 px-1.5 text-[10px] font-black tracking-wide text-white shadow">
            {/* โน้ตลอยขึ้นเบา ๆ ตลอดที่มีเพลงบนฟิลด์ */}
            <Note size={12} color="#fde047" style={{ position: 'absolute', left: -10, top: -6, animation: 'idol-note-float 2.4s ease-in-out infinite' }} />
            <Note size={10} color="#f9a8d4" double style={{ position: 'absolute', right: -8, top: -4, animation: 'idol-note-float 2.4s 1.2s ease-in-out infinite' }} />
            เพลง {songs.length}
          </span>
          <div className="flex">
            {songs.map((id, i) => (
              <div
                key={id}
                data-song-card={id}
                className={`h-14 w-10 shrink-0 cursor-pointer rounded shadow-[0_2px_8px_rgba(0,0,0,0.6)] transition hover:-translate-y-1 ${busy.includes(id) ? 'invisible' : ''}`}
                style={{ marginLeft: i === 0 ? 0 : songs.length > 3 ? -28 : -18, zIndex: i }}
                onMouseEnter={() => hover(id)}
                onMouseLeave={() => hover(null)}
                onClick={() => useGame.setState({ pinned: id })}
              >
                <CardFace def={db.get(useGame.getState().state.cards[id]!.cardNo)} size="xs" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** ป้ายหกเหลี่ยม "Turn N · สเต็ป" บนสนามของผู้ถือเทิร์น */
/**
 * แผ่นรองเล่นของผู้เล่น
 *  ซ้าย: Burst / Life / Reserve · กลาง: Field · ขวา: Deck / Trash
 *  ฝั่งตรงข้าม (top) หมุนทั้งแผ่น 180° (รวมตัวหนังสือ) เหมือนนั่งคนละฝั่งโต๊ะ
 */
export function PlayerMat({ player, top }: { player: PlayerId; top?: boolean }) {
  const state = useGame((s) => s.state);
  const p = state.players[player];
  const acting = actingPlayer(state) === player;
  const myTurn = state.turnPlayer === player;
  const fxBlocking = useGame((s) => isFxBlocking(s.fx));
  const depleting = useDepletingWhileDragging();
  const col = 'flex-col';
  const handDrag = useGame((s) => s.handDrag);
  const handAction = handDrag && state.cards[handDrag]!.owner === player ? handFieldAction(state, handDrag) : null;
  const dropHand = useGame((s) => s.dropHand);
  const [fieldOver, setFieldOver] = useState(false);
  const separating = useGame((s) => !!s.braveDrag && s.state.cards[s.braveDrag]!.owner === player && !!braveHostOf(s.state, s.braveDrag));
  const fieldDrop = handAction ? { label: handAction.label } : separating ? { label: 'ปล่อยที่ว่างเพื่อแยกร่าง' } : null;
  const nexus = p.field.filter((id) => db.get(state.cards[id]!.cardNo).type === 'nexus');
  const spirits = p.field.filter((id) => !nexus.includes(id));
  // การ์ดที่เพิ่งออกจากสนามและภาพแตกยังเล่นอยู่: เว้นช่องเดิมไว้ การ์ดอื่นจะได้ไม่เลื่อนมาทับ
  const leaving = useGame((s) => s.fx).filter(
    (f): f is Extract<Fx, { kind: 'ghost' }> => f.kind === 'ghost' && f.owner === player && f.slot >= 0 && !p.field.includes(f.cardId),
  );
  const slots: ({ id: string } | { gap: Extract<Fx, { kind: 'ghost' }> })[] = spirits.map((id) => ({ id }));
  [...leaving].sort((a, b) => a.slot - b.slot).forEach((g) => slots.splice(Math.min(g.slot, slots.length), 0, { gap: g }));

  // แถว Spirit เป็นแถวเดียวเสมอ: ถ้ากว้างหรือสูงเกินสนาม ย่อทั้งแถวให้พอดี (กระดานจึงสูงคงที่ ไม่ต้องเลื่อนจอ)
  // ต้องดูความสูงด้วย: จอที่เตี้ยกว่า (iPad) หรือมีปุ่ม [Evolution]/Flash ใต้การ์ด แถวจะยาวลงจนถาด Core/ปุ่มล้นขอบล่างถูกตัด กดไม่ได้
  const rowOuter = useRef<HTMLDivElement>(null);
  const rowInner = useRef<HTMLDivElement>(null);
  const [fieldScale, setFieldScale] = useState(1);
  /** ย่อตามความสูงได้ถึงแค่นี้ เกินกว่านั้นให้แผ่นสนามสูงขึ้น (เลื่อนจอดูได้) แทนการย่อจนเล็กเกิน/ตัดปุ่มทิ้ง */
  const MIN_HEIGHT_SCALE = 0.7;
  /** ความสูงจริงของแถว (ก่อนย่อ): ใช้จองความสูงขั้นต่ำ = แถวที่ย่อถึง MIN_HEIGHT_SCALE (ไม่ขึ้นกับพื้นที่ จึงไม่วนแก้กันไปมา) */
  const [rowNeedH, setRowNeedH] = useState(0);
  useLayoutEffect(() => {
    const outer = rowOuter.current;
    const inner = rowInner.current;
    if (!outer || !inner) return;
    // offsetWidth/Height ไม่นับ transform จึงวัดขนาดจริงของแถวได้แม้กำลังย่ออยู่ (+เผื่อป้าย BP / ป้ายโจมตีที่ยื่นออกขอบ)
    const fit = () => {
      const needH = inner.offsetHeight + 28;
      setRowNeedH(needH);
      // พื้นที่ไม่เคยเตี้ยกว่า needH * MIN_HEIGHT_SCALE (จองไว้ด้วย minHeight) จึงย่อตามความสูงได้ไม่ต่ำกว่าขั้นต่ำเอง
      setFieldScale(Math.min(1, outer.clientWidth / (inner.offsetWidth + 16), outer.clientHeight / needH));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const renderSlot = (slot: { id: string } | { gap: Extract<Fx, { kind: 'ghost' }> }) =>
    'id' in slot ? (
      <FieldCard key={slot.id} cardId={slot.id} depleting={depleting.has(slot.id)} />
    ) : (
      // ช่องว่างของการ์ดที่กำลังแตก: rect วัดจากจอ (ย่อแล้ว) จึงหารกลับเป็นขนาดก่อนย่อ
      <div key={`gap-${slot.gap.id}`} className="shrink-0" style={{ width: slot.gap.rect.w / fieldScale, height: slot.gap.rect.h / fieldScale + 32 }} />
    );

  return (
    <MatTopCtx.Provider value={!!top}>
    <section
      data-mat={player}
      className={`mat-sheen mat-slab relative isolate flex min-h-fit flex-1 gap-2 overflow-hidden rounded-xl border-2 p-2 flex-row ${top ? 'rotate-180' : ''} ${
        acting ? 'mat-active border-transparent' : 'border-slate-500/30'
      }`}
      style={{ '--ly': top ? -1 : 1 } as React.CSSProperties}
    >
      {/* กรอบเรืองแสงวิ่งรอบ (ตาของผู้เล่นนี้): ชั้นไล่สีหมุนด้วย transform ใต้ mask เส้นขอบ */}
      {acting && (
        <div className="mat-ring" aria-hidden="true">
          <div className="mat-ring-spin" />
        </div>
      )}
      {/* พื้นแผ่นรองเล่น: ภาพของผู้ใช้ (ถ้ามี) หรือท้องฟ้า-ผืนทรายโทนเทา */}
      <div className="absolute inset-0 -z-10">
        {IMG.playmat ? (
          <>
            <img src={IMG.playmat} alt="" className="h-full w-full object-cover" draggable={false} />
            <div className="absolute inset-0 bg-black/45" />
          </>
        ) : (
          <div
            className={`relative h-full w-full ${
              top
                ? 'bg-[radial-gradient(ellipse_at_50%_60%,#3b1d3a_0%,#241629_45%,#110b18_100%)]'
                : 'bg-[radial-gradient(ellipse_at_50%_40%,#17345a_0%,#14223d_45%,#0a1020_100%)]'
            }`}
          >
            <div className="absolute inset-0 bg-[repeating-linear-gradient(60deg,rgba(255,255,255,0.025)_0_1px,transparent_1px_26px),repeating-linear-gradient(-60deg,rgba(255,255,255,0.025)_0_1px,transparent_1px_26px)]" />
            <div
              className={`absolute top-1/2 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border ${top ? 'border-rose-300/10' : 'border-sky-300/10'}`}
              style={{ boxShadow: top ? '0 0 80px rgba(244,63,94,0.12) inset' : '0 0 80px rgba(56,189,248,0.14) inset' }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
          </div>
        )}
        {/* มิติ: แสงจากกลางกระดาน (ขอบบนของแผ่นในพิกัดตัวเอง = ด้านกลางกระดานทั้งสองฝั่ง) · ขอบไกลมืดลง */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(255,255,255,0.15),rgba(255,255,255,0.04)_45%,transparent_75%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(0,0,0,0.55))]" />
        {/* แสงฝั่งที่ต้องตัดสินใจ (สีเดียวกับออร่าขอบจอ) ฉายจากขอบนอกเข้ามาบนพื้นสนาม: อยู่ใต้การ์ดทุกอย่าง */}
        {acting && !fxBlocking && !state.winner && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(0deg, rgba(${top ? '244,63,94' : '56,189,248'},0.38), rgba(${top ? '244,63,94' : '56,189,248'},0.14) 45%, transparent 80%)`,
              mixBlendMode: 'screen',
              animation: 'aura-pulse 2.6s ease-in-out infinite',
            }}
          />
        )}
      </div>
      {/* รอยร้าวตาม Life ที่เสีย */}
      <FieldCracks player={player} top={top} />

      {p.partner ? (
        // 2VS2: ช่องทั้งหมดของคนที่แสดงอยู่ (เรา / คู่แข่ง 1) อยู่ติดกันทางซ้าย · Field ตรงกลาง · ช่องของคนที่สองทางขวา
        <SeatZones player={player} />
      ) : (
        <div className={`flex w-32 shrink-0 gap-2 ${col}`}>
          <BurstSlot player={player} />
          <LifeSlot player={player} />
          <ReserveSlot player={player} />
        </div>
      )}

      {/* Field */}
      <div
        className={`field-well relative flex min-w-0 flex-1 gap-2 rounded-md border bg-black/15 p-2 transition ${col} ${
          fieldDrop ? (fieldOver ? 'border-yellow-300 bg-yellow-300/15' : 'border-dashed border-yellow-300/80') : 'border-slate-300/15'
        }`}
        {...(handAction
          ? dropHandlers(true, () => dropHand('field'), setFieldOver)
          : dropHandlers(separating, () => useGame.getState().dropBrave('field'), setFieldOver))}
      >
        {fieldDrop && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <span className={`rounded-full px-4 py-1.5 text-sm font-bold shadow-lg ${fieldOver ? 'bg-yellow-300 text-slate-900' : 'bg-black/70 text-yellow-200'}`}>
              {fieldDrop.label}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center select-none">
          <span className="text-[11px] tracking-[0.4em] text-white/15">สนาม</span>
          <span className="font-serif text-6xl font-bold tracking-wide text-white/10 [text-shadow:0_2px_0_rgba(0,0,0,0.3)]">Field</span>
        </div>
        {/* แถวบนของสนาม: ป้ายผู้เล่น (ซ้าย) + ช่อง Nexus (กลาง) */}
        <div className="relative flex shrink-0 items-start gap-2">
          <div className="flex w-36 shrink-0 flex-wrap items-center gap-1.5">
            <span className={`rounded px-2 py-0.5 text-xs font-black ${acting ? 'player-tag-active' : 'player-tag text-slate-200'}`}>
              {playerLabel(player)}
            </span>
            {myTurn && <span className="text-[11px] font-semibold text-yellow-300 [text-shadow:0_1px_2px_#000]">● เทิร์นนี้</span>}
            {p.burst && (
              <span
                className="rounded bg-orange-500 px-1.5 py-0.5 text-[11px] font-black text-white shadow"
                style={{ animation: 'fx-burst-glow 2s ease-in-out infinite' }}
                title="ผู้เล่นนี้เซ็ท Burst ไว้"
              >
                💥 Burst
              </span>
            )}
          </div>
          {p.partner ? (
            // 2VS2: Nexus / นอกมือ / เพลง แบ่งตามเจ้าของ (คนที่แสดงอยู่ = ซ้าย · คนที่สองของทีม = ขวา)
            // ช่องว่างทางขวากว้างเท่าป้ายผู้เล่นทางซ้าย: กรอบ Nexus อยู่กึ่งกลางสนามตรงกับกลุ่มสปิริต
            <>
              <TeamNexusRow player={player} top={!!top} nexus={nexus} depleting={depleting} />
              <div className="w-36 shrink-0" aria-hidden="true" />
            </>
          ) : (
            <>
              <div className="flex flex-1 justify-center">
                <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-black/15 p-1">
                  {nexus.length > 0 ? (
                    nexus.map((id) => <FieldCard key={id} cardId={id} depleting={depleting.has(id)} />)
                  ) : (
                    <span className="px-6 py-0.5 text-[10px] tracking-[0.3em] text-white/25 select-none">NEXUS</span>
                  )}
                </div>
              </div>
              {/* ขวา: เมจิคไทป์ [เพลง] ที่วางบนฟิลด์ (BS07) · ถ่วงให้ช่อง Nexus อยู่กลางสนาม */}
              <SongZone player={player} />
            </>
          )}
        </div>

        {/* แถว Spirit / Ultimate: แถวเดียว ย่อตามจำนวนตัว (data-field-scale ให้แอนิเมชันวัดขนาดการ์ดที่ย่อแล้วได้ถูก) */}
        {/* แถวลอยกลางพื้นที่ (absolute): ความสูงของแถวไม่ดันแผ่นสนามให้สูงขึ้น ย่อให้พอดีพื้นที่แทน */}
        <div ref={rowOuter} className="relative min-h-0 min-w-0 flex-1" style={rowNeedH ? { minHeight: Math.ceil(rowNeedH * MIN_HEIGHT_SCALE) } : undefined}>
          <div
            ref={rowInner}
            data-field-scale={fieldScale}
            className="absolute top-1/2 left-1/2 flex w-max items-start gap-3 transition-transform duration-300"
            style={{ transform: `translate(-50%, -50%) scale(${fieldScale})` }}
          >
            {p.partner ? (
              // 2VS2: แบ่งสนามเป็นสองกลุ่มตามเจ้าของ (คนที่แสดงอยู่ = ซ้าย · คนที่สองของทีม = ขวา) มีกรอบและป้ายกำกับ
              <TeamFieldGroups player={player} top={!!top} slots={slots} render={renderSlot} />
            ) : (
              slots.map(renderSlot)
            )}
          </div>
        </div>
      </div>

      {p.partner ? (
        /* 2VS2: ช่องทั้งหมดของคนที่สองของทีม (เพื่อนร่วมทีม / คู่แข่งคนที่ 2) */
        <SeatZones player={player} partner />
      ) : (
        <div className={`flex w-32 shrink-0 gap-2 ${col}`}>
          <DeckSlot player={player} />
          <TrashSlot player={player} />
        </div>
      )}
    </section>
    </MatTopCtx.Provider>
  );
}

type FieldSlot = { id: string } | { gap: Extract<Fx, { kind: 'ghost' }> };

/** สีของกลุ่มตามเจ้าของ (2VS2) */
function teamTone(mineSide: boolean, partner: boolean): { box: string; chip: string } {
  if (mineSide) return partner ? { box: 'border-violet-300/50 bg-violet-400/[0.08]', chip: 'bg-violet-500 text-white' } : { box: 'border-sky-300/50 bg-sky-400/[0.07]', chip: 'bg-sky-400 text-slate-950' };
  return partner ? { box: 'border-orange-300/50 bg-orange-400/[0.08]', chip: 'bg-orange-500 text-white' } : { box: 'border-rose-300/50 bg-rose-400/[0.07]', chip: 'bg-rose-500 text-white' };
}

/** 2VS2: แถว Nexus แบ่งสองกรอบตามเจ้าของ · แต่ละกรอบมีนอกมือ/เพลงของเจ้าของคนนั้นด้วย */
function TeamNexusRow({ player, top, nexus, depleting }: { player: PlayerId; top: boolean; nexus: string[]; depleting: Set<string> }) {
  const state = useGame((s) => s.state);
  const me = useGame((s) => viewPlayer(s));
  const active = state.players[player].active ?? 0;
  const mineSide = player === me;
  return (
    <div className="flex flex-1 items-start justify-center gap-3">
      {[false, true].map((partner) => {
        const ids = nexus.filter((id) => ((state.cards[id]?.seat ?? 0) === active) === !partner);
        const tone = teamTone(mineSide, partner);
        return (
          <div key={String(partner)} className={`relative flex items-start gap-2 rounded-md border border-dashed px-2 pt-5 pb-1 ${tone.box}`}>
            <span className={`absolute left-1.5 rounded px-1 text-[10px] leading-4 font-black ${top ? 'bottom-0.5 rotate-180' : 'top-0.5'} ${tone.chip}`}>
              NEXUS · {partner ? (mineSide ? 'เพื่อน' : 'คู่แข่ง 2') : mineSide ? 'เรา' : 'คู่แข่ง 1'}
            </span>
            <div className="flex min-w-20 flex-wrap items-center justify-center gap-2">
              {ids.length > 0 ? ids.map((id) => <FieldCard key={id} cardId={id} depleting={depleting.has(id)} />) : <span className="m-auto py-2 text-[10px] text-white/30">ว่าง</span>}
            </div>
            <SongZone player={player} partner={partner} compact />
          </div>
        );
      })}
    </div>
  );
}

/**
 * 2VS2: แถวสปิริตของสนามรวม แบ่งเป็นสองกลุ่มตามเจ้าของ (กรอบสี + ป้ายชื่อ) ให้เห็นชัดว่าตัวไหนของใคร
 * กลุ่มซ้าย = คนที่แสดงอยู่ที่ players[p] (ฝั่งเรา = เครื่องนี้) · กลุ่มขวา = คนที่สองของทีม
 */
function TeamFieldGroups({ player, top, slots, render }: { player: PlayerId; top: boolean; slots: FieldSlot[]; render: (s: FieldSlot) => React.ReactNode }) {
  const state = useGame((s) => s.state);
  const me = useGame((s) => viewPlayer(s));
  useGame((s) => s.teamNames);
  const active = state.players[player].active ?? 0;
  const mineSide = player === me;
  const ofMain = (slot: FieldSlot) => ('id' in slot ? (state.cards[slot.id]?.seat ?? 0) === active : true);
  const groups = [
    { key: 'main', slots: slots.filter(ofMain), label: mineSide ? 'เรา' : 'คู่แข่ง 1', tone: mineSide ? 'sky' : 'rose' },
    { key: 'partner', slots: slots.filter((s) => !ofMain(s)), label: mineSide ? `เพื่อน · ${partnerName(player, true)}` : `คู่แข่ง 2 · ${partnerName(player, false)}`, tone: mineSide ? 'violet' : 'orange' },
  ];
  const ring: Record<string, string> = {
    sky: 'border-sky-300/50 bg-sky-400/[0.07]',
    violet: 'border-violet-300/50 bg-violet-400/[0.08]',
    rose: 'border-rose-300/50 bg-rose-400/[0.07]',
    orange: 'border-orange-300/50 bg-orange-400/[0.08]',
  };
  const chip: Record<string, string> = { sky: 'bg-sky-400 text-slate-950', violet: 'bg-violet-500 text-white', rose: 'bg-rose-500 text-white', orange: 'bg-orange-500 text-white' };
  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className={`relative flex min-h-[12rem] min-w-[8.5rem] items-start gap-3 rounded-xl border-2 border-dashed px-3 pt-6 pb-2 ${ring[g.tone]}`}>
          <span className={`absolute left-2 max-w-[90%] truncate rounded px-1.5 text-[11px] leading-4 font-black ${top ? 'bottom-1 rotate-180' : 'top-1'} ${chip[g.tone]}`}>{g.label}</span>
          {g.slots.length > 0 ? g.slots.map(render) : <span className="m-auto text-xs text-white/30">ยังไม่มีสปิริต</span>}
        </div>
      ))}
    </>
  );
}

/**
 * 2VS2: ช่องทั้งหมดของผู้เล่นหนึ่งคน (Burst / Life / Reserve · Deck / Trash) อยู่ติดกันเป็นชุด มีชื่อกำกับ
 * คนที่แสดงอยู่ (เรา / คู่แข่ง 1) = ซ้ายของ Field · คนที่สองของทีม = ขวาของ Field (เรียงกลับด้าน: Deck/Trash ติด Field เหมือนกัน)
 */
function SeatZones({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const me = useGame((s) => viewPlayer(s));
  useGame((s) => s.online?.names);
  useGame((s) => s.teamNames);
  const mineSide = player === me;
  const label = partner ? (mineSide ? `เพื่อน · ${partnerName(player, true)}` : `คู่แข่ง 2 · ${partnerName(player, false)}`) : mineSide ? 'เรา' : 'คู่แข่ง 1';
  const tone = partner ? (mineSide ? 'bg-violet-500/85 text-white' : 'bg-orange-500/85 text-white') : mineSide ? 'bg-sky-400/90 text-slate-950' : 'bg-rose-500/85 text-white';
  const front = (
    <div key="front" className="flex w-28 shrink-0 flex-col gap-2">
      <BurstSlot player={player} partner={partner} />
      <LifeSlot player={player} partner={partner} />
      <ReserveSlot player={player} partner={partner} />
    </div>
  );
  const back = (
    <div key="back" className="flex w-28 shrink-0 flex-col gap-2">
      <DeckSlot player={player} partner={partner} />
      <TrashSlot player={player} partner={partner} />
    </div>
  );
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className={`truncate rounded px-1.5 py-0.5 text-center text-[11px] font-black ${tone}`} title={label}>
        {label}
      </div>
      <div className="flex min-h-0 flex-1 gap-2">{partner ? [back, front] : [front, back]}</div>
    </div>
  );
}

// ---------------------------------------------------------------- hand

/**
 * ตำแหน่งในพัด: off = ห่างจากกลางส่วนที่มองเห็นกี่ใบ (ติดลบ = ซ้าย) · spread = จำนวนใบที่เห็นพร้อมกัน
 * มือยาวเกินจอ (เลื่อนได้): ความโค้งคิดจากกลางหน้าต่าง ใบที่อยู่ในจอจึงไม่จมลึก
 */
type FanPos = { index: number; off: number; spread: number; top?: boolean; layout?: HandLayout };

/** ท่าของการ์ดในพัด: เอียงตามตำแหน่ง ใบริมจมลึกกว่า ชี้/เลือกแล้วยกขึ้นตั้งตรง */
function fanStyle(fan: FanPos, raised: boolean, lift = false): React.CSSProperties {
  // ใบที่เลยขอบหน้าต่างไปแล้ว (ถูกตัดไม่ให้เห็น): ไม่ต้องเอียง/จมเพิ่ม เวลาเลื่อนเข้ามาจะได้ไม่โผล่ขึ้นจากใต้จอ
  const edge = fan.spread / 2 + 0.5;
  // แถวตรง / กางไม่ซ้อน: ไม่เอียง ไม่จมตามตำแหน่ง
  const flat = fan.layout === 'row' || fan.layout === 'spread';
  const off = flat ? 0 : Math.max(-edge, Math.min(edge, fan.off));
  const angle = off * Math.min(6, 36 / Math.max(fan.spread, 1));
  const overlapTop = fan.layout === 'spread' ? '0.3rem' : '-1.6rem';
  const overlap = fan.layout === 'spread' ? '0.35rem' : fan.layout === 'row' ? '-1.6rem' : '-2.25rem';
  if (fan.top) {
    // มือคู่แข่ง: พัดกลับหัวที่ขอบบน (เหมือนนั่งถือการ์ดอยู่ฝั่งตรงข้าม) จมเหนือขอบจอ
    return {
      transform: raised ? 'translateY(8%) rotate(0deg) scale(1.1)' : `translateY(calc(${lift ? -32 : -50}% - ${off * off * 2}px)) rotate(${-angle}deg)`,
      transformOrigin: '50% 0%',
      zIndex: raised ? 50 : lift ? 40 + fan.index : fan.index + 1,
      marginLeft: fan.index === 0 ? 0 : overlapTop,
      transition: 'transform 160ms ease-out',
    };
  }
  return {
    transform: raised ? 'translateY(-8%) rotate(0deg) scale(1.1)' : `translateY(calc(${lift ? 26 : 42}% + ${off * off * 2.5}px)) rotate(${angle}deg)`,
    transformOrigin: '50% 100%',
    zIndex: raised ? 50 : lift ? 40 + fan.index : fan.index + 1,
    marginLeft: fan.index === 0 ? 0 : overlap,
    transition: 'transform 160ms ease-out',
  };
}

/** ลำดับการ์ดในมือที่แสดง: เรียงตามที่ตั้งค่า (มือที่คว่ำอยู่ไม่เรียง ไม่ให้ตำแหน่งบอกว่าเป็นการ์ดอะไร) */
function useShownHand(player: PlayerId, hidden: boolean, partner = false): string[] {
  const state = useGame((s) => s.state);
  const manualRaw = useGame((s) => s.handOrder[player]);
  const manual = partner ? undefined : manualRaw;
  const sort = usePrefs((p) => p.handSort);
  const all = partner ? (state.players[player].partner?.hand ?? []) : state.players[player].hand;
  // การ์ดที่วางแสดงนอกมืออยู่ในโซน "นอกมือ" บนสนาม (OutsideZone) ไม่อยู่ในพัดการ์ดในมือ
  const shownKey = (state.shownCards ?? []).join(',');
  const hand = useMemo(() => (shownKey ? all.filter((id) => !shownKey.split(',').includes(id)) : all), [all, shownKey]);
  return useMemo(() => (hidden ? hand : sortHand(state, hand, sort, manual)), [state, hand, sort, manual, hidden]);
}

/** ทางเล่นการ์ดใบนี้ตอนนี้ (การ์ดในมือ / การ์ดที่วางแสดงนอกมือ ที่ใช้ได้เสมือนอยู่ในมือ) */
export function playOptions(state: GameState, cardId: string): { label: string; run: () => void }[] {
  const { openPlay, dispatch } = useGame.getState();
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  const main = mine(card.owner) && inMain(state) && card.owner === state.turnPlayer;
  const flash = mine(card.owner) && flashPlayer(state) === card.owner;
  const timings = handMagicTimings(state, cardId);
  const quick = canQuickSummon(state, cardId);
  /** วางแสดงนอกมือ: เซ็ทเป็น Burst ไม่ได้ (กติกา 06 Q5) */
  const shownOut = (state.shownCards ?? []).includes(cardId);
  const options: { label: string; run: () => void }[] = [];
  // อัลติเมท: แสดงเมื่อครบเงื่อนไขอัญเชิญ (เช่น ไลฟ์เราไม่เกิน 3)
  if (main && (def.type === 'spirit' || def.type === 'brave' || (def.type === 'ultimate' && summonConditionOk(state, db, cardId)))) {
    options.push({ label: 'อัญเชิญ', run: () => openPlay(cardId, 'summon') });
  }
  for (const host of braveHosts(state, cardId)) {
    options.push({ label: `ร่วมร่างกับ ${db.get(state.cards[host]!.cardNo).name}`, run: () => openPlay(cardId, 'summon', undefined, host) });
  }
  if (quick) options.push({ label: 'อัญเชิญ [Quick]', run: () => openPlay(cardId, 'summon') });
  if (main && def.type === 'nexus') options.push({ label: 'วาง Nexus', run: () => openPlay(cardId, 'deployNexus') });
  // วัดอรุณ: ในเทิร์นนี้ใช้งานการ์ดเมจิคไม่ได้ (รวมสปิริตที่ใช้เป็นเมจิค)
  // BS12 เมียวโอบัวม่วง / อาบิส-อโพคาลิพส์: ห้ามเมจิคตามคอสต์/สีของการ์ดใบนี้
  const noMagic = magicBanned(state, card.owner, db, def);
  if (noMagic) {
    // ไม่แสดงตัวเลือกใช้เมจิค
  } else if (def.type === 'magic') {
    if (main && timings.length === 0) options.push({ label: 'ใช้ Magic', run: () => openPlay(cardId, 'useMagic') });
    if (main && timings.includes('main')) options.push({ label: 'ใช้ [Main]', run: () => openPlay(cardId, 'useMagic', 'main') });
    if ((main || flash) && timings.includes('flash')) options.push({ label: 'ใช้ [Flash]', run: () => openPlay(cardId, 'useMagic', 'flash') });
  } else if ((main || flash) && timings.includes('flash')) {
    // การ์ดสปิริตที่ใช้เป็นเมจิคได้ (ยูคิเกิร์ล / ได้รับจากคาฉะเนโกะ-อิคุสะ)
    options.push({ label: 'ใช้เป็นเมจิค [Flash]', run: () => openPlay(cardId, 'useMagic', 'flash') });
  }
  if (main && def.burst && !shownOut) options.push({ label: 'เซ็ทเป็น Burst', run: () => dispatch({ type: 'setBurst', player: card.owner, cardId }) });
  return options;
}

/**
 * โซน "นอกมือ" (กติกา 14 ข้อ 1): การ์ดที่วางแสดงนอกมือ อยู่ข้างสนาม ทั้งสองฝ่ายเห็น ไม่อยู่ในพัดการ์ดในมือ
 * แตะตรงไหนของโซนก็ได้ = กางเป็นพัดใหญ่กลางกระดาน (ShownFan ใน Controls) แล้วเลือกใช้จากพัด
 * มีใบที่ใช้ได้ตอนนี้ = โซนเรืองแสง (ฟ้า = Flash / เหลือง = Main / ชมพู = เป็นตัวเลือกของเอฟเฟกต์)
 */
function OutsideZone({ player, partner }: { player: PlayerId; partner?: boolean }) {
  const state = useGame((s) => s.state);
  const hover = useGame((s) => s.hover);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const flying = useGame((s) => s.fx.filter((f) => f.kind === 'fly' && f.hideTarget).map((f) => (f.kind === 'fly' ? f.cardId : '')).join('|'));
  const ids = (state.shownCards ?? []).filter((id) => zoneOf(state, player, partner).hand.includes(id));
  if (ids.length === 0) return null;
  // 2VS2: นอกมือของคนที่สองของทีม = ดูได้อย่างเดียว (ชี้ดูรายละเอียดได้)
  const candidate = !partner && !blocking && ids.some((id) => isChoiceCandidate(state, id) || isMultiCardCandidate(state, id));
  const usable = !partner && !blocking && !candidate && ids.some((id) => playOptions(state, id).length > 0);
  const tone = candidate ? 'fuchsia' : usable ? (flashPlayer(state) ? 'cyan' : 'yellow') : null;
  return (
    <button
      type="button"
      data-outside-zone={player}
      onClick={() => !partner && useGame.setState({ shownFan: player })}
      title="นอกมือ: การ์ดที่วางแสดง ใช้งานได้เสมือนอยู่ในมือ (ทั้งสองฝ่ายเห็น) · แตะเพื่อกางดู/ใช้"
      className={`flex cursor-pointer flex-col items-end gap-0.5 rounded-lg p-1 transition hover:bg-amber-300/15 ${
        tone === 'cyan' ? 'ring-2 ring-cyan-300 bg-cyan-400/10' : tone === 'yellow' ? 'ring-2 ring-yellow-300 bg-yellow-300/10' : tone === 'fuchsia' ? 'ring-2 ring-fuchsia-400 bg-fuchsia-400/10' : ''
      }`}
      style={tone === 'cyan' ? { animation: 'fx-flash-glow 1.2s ease-in-out infinite' } : tone ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : undefined}
    >
      <span className="rounded bg-amber-400 px-1.5 text-[10px] font-black tracking-wide whitespace-nowrap text-slate-900 shadow">
        นอกมือ {ids.length}
        {tone ? ' · แตะเพื่อใช้' : ''}
      </span>
      <span className="flex">
        {ids.map((id, i) => (
          <span
            key={id}
            data-hand-card={id}
            className={`block h-20 w-14 shrink-0 rounded shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-amber-300/70 ${flying.split('|').includes(id) ? 'invisible' : ''}`}
            style={{ marginLeft: i === 0 ? 0 : ids.length > 3 ? -36 : -20, zIndex: i }}
            onMouseEnter={() => hover(id)}
            onMouseLeave={() => hover(null)}
          >
            <CardFace def={db.get(state.cards[id]!.cardNo)} size="xs" />
          </span>
        ))}
      </span>
    </button>
  );
}


function HandCard({ cardId, hidden, small, fan, shown: order }: { cardId: string; hidden: boolean; small?: boolean; fan?: FanPos; shown?: string[] }) {
  // 2VS2: การ์ดในมือของเพื่อนร่วมทีม (ที่นั่งของการ์ดไม่ใช่ที่นั่งที่แสดงอยู่) = ดูได้อย่างเดียว
  const readOnly = useGame((s) => s.state.mode === '2v2' && (s.state.cards[cardId]?.seat ?? 0) !== (s.state.players[s.state.cards[cardId]?.owner ?? 'p1'].active ?? 0));
  const state = useGame((s) => s.state);
  const selected = useGame((s) => s.selectedHandCard === cardId);
  const { clickHandCard, openPlay, dispatch, hover } = useGame.getState();
  const [hovering, setHovering] = useState(false);
  const candidate = useGame((s) => (isChoiceCandidate(s.state, cardId) || isMultiCardCandidate(s.state, cardId)) && !isFxBlocking(s.fx));
  /** เลือกหลายใบทีเดียว: ใบนี้ถูกเลือกไว้ */
  const picked = useGame((s) => pickedOf(s).includes(cardId));
  const flashUsable = useFlashUsable(cardId);
  const flying = useFlying(cardId);
  const dragged = useGame((s) => s.handDrag === cardId);
  const fxBlocking = useGame((s) => isFxBlocking(s.fx));
  const { startHandDrag, endHandDrag } = useGame.getState();
  const scroller = useContext(HandScrollCtx);
  /** ตัวการ์ด (ตำแหน่งให้เมนูที่ portal ไปชั้นบนสุด) */
  const cardRef = useRef<HTMLDivElement>(null);
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  /** วางแสดงนอกมือ (อันโกะ): หงายให้ทั้งสองฝ่ายเห็น */
  const shown = (state.shownCards ?? []).includes(cardId);
  const size = small ? 'h-16 w-11' : fan?.top ? 'h-32 w-[5.75rem]' : fan ? 'h-48 w-34' : 'h-36 w-26';
  const playMode = usePrefs((p) => p.playMode);
  // ลากได้เสมอเมื่อเป็นมือของเรา: ลากไปสนาม = เล่น, ลากไปวางบนการ์ดใบอื่นในมือ = สลับตำแหน่ง
  const draggable = !readOnly && !hidden && !fxBlocking && mine(card.owner);
  /** การ์ดใบอื่นในมือเดียวกันกำลังถูกลากมาวาง (สลับตำแหน่ง) */
  const reorderOver = useGame((s) => !!order && !!s.handDrag && s.handDrag !== cardId && order.includes(s.handDrag));
  const [dropSide, setDropSide] = useState<'l' | 'r' | null>(null);
  const style = fan ? fanStyle(fan, hovering || selected, flashUsable && !hidden) : undefined;

  if (hidden && !shown) {
    // ใส่ data-hand-card ด้วย: แอนิเมชันจั่ว/ลงการ์ด/กลับขึ้นมือของมือที่คว่ำไว้ (มือคู่แข่ง) ต้องใช้ตำแหน่งนี้
    return (
      <div data-hand-card={cardId} className={`${size} shrink-0 ${flying ? 'invisible' : ''}`} style={style}>
        <div className={`h-full w-full ${fan?.top ? 'rotate-180' : ''}`}>
          <CardBack />
        </div>
      </div>
    );
  }

  const main = !readOnly && mine(card.owner) && inMain(state) && card.owner === state.turnPlayer;
  const flash = !readOnly && mine(card.owner) && flashPlayer(state) === card.owner;
  const timings = handMagicTimings(state, cardId);
  const pay = payableCost(state, db, card.owner, def, baseCost(state, db, cardId));
  const affordable = pay <= state.players[card.owner].reserve.length + state.players[card.owner].field.reduce((n, id) => n + state.cards[id]!.cores.length, 0);
  const quick = canQuickSummon(state, cardId);
  const playable = ((main || (flash && timings.includes('flash'))) && affordable) || quick;

  const options = playOptions(state, cardId);

  return (
    <div
      ref={cardRef}
      data-hand-card={cardId}
      className={`relative ${size} pointer-events-auto shrink-0 ${flying ? 'invisible' : ''}`}
      style={style}
      onMouseEnter={() => {
        hover(cardId);
        setHovering(true);
      }}
      onMouseLeave={() => {
        hover(null);
        setHovering(false);
      }}
    >
      {reorderOver && dropSide && (
        <div className={`pointer-events-none absolute inset-y-2 z-30 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,0.9)] ${dropSide === 'l' ? '-left-1' : '-right-1'}`} />
      )}
      <div
        onClick={() => {
          // มือของเพื่อน: คลิก = ปักแผงรายละเอียดเท่านั้น
          if (readOnly) {
            useGame.setState({ pinned: cardId });
            return;
          }
          // คลิกเดียวเล่นเลย (ตั้งค่า): มีทางเล่นทางเดียว = เปิดแผงเล่นการ์ดทันที
          if (playMode === 'direct' && !candidate && !state.choice && options.length === 1) {
            useGame.setState({ pinned: cardId });
            options[0]!.run();
            return;
          }
          clickHandCard(cardId);
        }}
        onDragOver={(e) => {
          if (!reorderOver) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          setDropSide(e.clientX < r.left + r.width / 2 ? 'l' : 'r');
        }}
        onDragLeave={() => setDropSide(null)}
        onDrop={(e) => {
          const from = useGame.getState().handDrag;
          setDropSide(null);
          if (!reorderOver || !from || !order) return;
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const rest = order.filter((id) => id !== from);
          const at = rest.indexOf(cardId) + (e.clientX < r.left + r.width / 2 ? 0 : 1);
          useGame.getState().reorderHand(card.owner, order, from, at);
        }}
        draggable={draggable}
        onDragStart={(e) => {
          // ลากไปทางซ้าย/ขวาบนมือที่ยาวเกินจอ = เลื่อนมือ ไม่ใช่หยิบการ์ดไปเล่น
          if (scroller?.claimDrag()) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', 'hand:' + cardId);
          beginCardDrag(e);
          startHandDrag(cardId);
          setHovering(false);
        }}
        onDragEnd={endHandDrag}
        title={draggable ? 'ลากไปที่สนามเพื่อเล่น / ช่อง Burst เพื่อเซ็ท / การ์ดใบอื่นในมือเพื่อสลับตำแหน่ง · คลิกเพื่อเปิดเมนู' : undefined}
        className={`h-full w-full rounded-lg shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition ${dragged ? 'opacity-40' : ''} ${draggable ? 'active:cursor-grabbing' : ''} ${
          flashUsable
            ? `cursor-pointer ring-4 ring-cyan-300 ${fan ? '' : 'hover:-translate-y-2'}`
            : playable
              ? `cursor-pointer ring-2 ring-yellow-300/70 ${fan ? '' : 'hover:-translate-y-2'}`
              : flash
                ? 'brightness-50 saturate-50'
                : main
                  ? 'brightness-75'
                  : ''
        } ${selected || picked ? `ring-4 ring-yellow-300 ${fan ? '' : '-translate-y-3'}` : ''} ${candidate && !picked ? 'cursor-pointer ring-4 ring-fuchsia-400' : ''}`}
        style={candidate ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : flashUsable ? { animation: 'fx-flash-glow 1.2s ease-in-out infinite' } : undefined}
      >
        <div className={`h-full w-full ${fan?.top && !(hovering || selected) ? 'rotate-180' : ''}`}>
          <CardFace def={def} size={small || fan?.top ? 'xs' : 'md'} payCost={pay} />
        </div>
        {candidate && (
          <div className={`absolute inset-x-1 top-1 rounded py-0.5 text-center text-xs font-bold shadow ${picked ? 'bg-yellow-300 text-slate-900' : 'bg-fuchsia-500 text-white'}`}>{picked ? 'เลือกแล้ว ✓' : 'คลิกเพื่อเลือก'}</div>
        )}
        {shown && !candidate && (
          <div
            title="วางแสดงนอกมือ: ทั้งสองฝ่ายเห็น ใช้งานได้เหมือนอยู่ในมือ"
            className={`pointer-events-none absolute inset-x-1 rounded bg-amber-300 py-0.5 text-center text-[10px] font-black text-slate-950 shadow ${fan?.top && !(hovering || selected) ? 'top-1' : 'bottom-1'}`}
          >
            วางแสดง
          </div>
        )}
        {/* ป้าย FLASH บนส่วนที่โผล่พ้นขอบจอ (มือคู่แข่งกลับหัว: ส่วนที่เห็นคือขอบล่าง) */}
        {flashUsable && !candidate && (
          <div
            title="ใช้ได้ใน Flash Timing นี้ · คลิกเพื่อใช้"
            className={`pointer-events-none absolute inset-x-1 rounded bg-cyan-300 py-0.5 text-center text-xs font-black tracking-[0.2em] text-slate-950 shadow ${fan?.top && !(hovering || selected) ? 'bottom-1' : 'top-1'}`}
          >
            FLASH
          </div>
        )}
      </div>
      {selected && (
        <HandMenuPortal anchor={cardRef} below={!!fan?.top}>
          {options.length === 0 && <span className="px-1 text-xs text-slate-400">ใช้ตอนนี้ไม่ได้</span>}
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                o.run();
              }}
              className="rounded bg-yellow-300 px-2 py-1 text-sm font-semibold text-slate-900 hover:bg-yellow-200"
            >
              {o.label}
            </button>
          ))}
          {order && order.length > 1 && (
            <div className="flex gap-1">
              {([-1, 1] as const).map((d) => {
                const i = order.indexOf(cardId);
                const ok = i + d >= 0 && i + d < order.length;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!ok}
                    title={d < 0 ? 'ย้ายการ์ดไปทางซ้าย' : 'ย้ายการ์ดไปทางขวา'}
                    onClick={(e) => {
                      e.stopPropagation();
                      useGame.getState().reorderHand(card.owner, order, cardId, i + d);
                    }}
                    className="flex-1 rounded bg-slate-700 py-0.5 text-xs font-bold text-slate-200 hover:bg-slate-600 disabled:opacity-30"
                  >
                    {d < 0 ? '◀ ย้าย' : 'ย้าย ▶'}
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" onClick={() => clickHandCard(cardId)} className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-white/10">
            ยกเลิก
          </button>
        </HandMenuPortal>
      )}
    </div>
  );
}

/**
 * เมนูของการ์ดในมือ: วาดบนชั้นบนสุดของหน้า (portal) เพราะพัดการ์ดในมืออยู่ชั้นต่ำกว่าแถบคำสั่งกลางกระดาน
 * (เดิมเมนูที่เด้งขึ้นไปโดนแถบทับ ปุ่มบนสุดกดไม่ได้) · ตามตำแหน่งการ์ดทุกเฟรม (การ์ดยกขึ้น/พัดเลื่อน)
 */
function HandMenuPortal({ anchor, below, children }: { anchor: React.RefObject<HTMLDivElement | null>; below: boolean; children: React.ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(() => anchor.current?.getBoundingClientRect() ?? null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setRect((p) => (p && Math.abs(p.left - r.left) < 0.5 && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.width - r.width) < 0.5 && Math.abs(p.bottom - r.bottom) < 0.5 ? p : r));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [anchor]);
  if (!rect) return null;
  const w = Math.max(rect.width, 136);
  const left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, 8), window.innerWidth - w - 8);
  return createPortal(
    <div
      data-tutorial="hand-menu"
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[66] flex flex-col gap-1 rounded-lg border border-yellow-300/60 bg-slate-900 p-1.5 shadow-xl"
      style={{ left, width: w, ...(below ? { top: rect.bottom + 16 } : { bottom: window.innerHeight - rect.top + 16 }) }}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * ช่องในพัดมือของเมจิกที่ยังร่ายไม่จบ (รอเลือก): การ์ดพักยกขึ้นจากแนวมือเล็กน้อย (ตำแหน่งเดียวกับ restRect ใน Fx)
 * อยู่ในพัด จึงซ้อนกับใบข้าง ๆ ตามลำดับ · ชี้แล้วยกขึ้นและเปิดรายละเอียดได้เหมือนการ์ดในมือ (คลิกเล่นไม่ได้)
 */
function CastSlot({ cardId, top, fan }: { cardId: string; top?: boolean; fan: FanPos }) {
  const [hovering, setHovering] = useState(false);
  const hover = useGame((s) => s.hover);
  // กำลังเลือก Core บนกระดาน: ไม่ยกขึ้นจากแนวมือ (ไม่บัง Core ของสปิริตแถวล่าง) และโปร่งลง
  const picking = useGame(pickingCores);
  return (
    <div
      data-cast-slot={cardId}
      className={`${top ? 'h-32 w-[5.75rem]' : 'h-48 w-34'} pointer-events-auto shrink-0`}
      style={fanStyle(fan, hovering, false)}
      onMouseEnter={() => {
        hover(cardId);
        setHovering(true);
      }}
      onMouseLeave={() => {
        hover(null);
        setHovering(false);
      }}
    >
      <div className={`h-full w-full transition-[transform,opacity] ${picking ? 'opacity-50' : ''}`} style={{ transform: `translateY(${picking ? 0 : top ? 22 : -22}%)` }}>
        <CastRestCard cardId={cardId} />
      </div>
    </div>
  );
}

/** การ์ดบนมือขอใช้การลากนี้เป็นการเลื่อนมือ (คืน true = ห้ามเริ่มลากการ์ดไปเล่น) */
const HandScrollCtx = createContext<{ claimDrag: () => boolean } | null>(null);

/** เว้นขอบซ้าย/ขวาของหน้าต่างมือ ไม่ให้ทับป้ายผู้เล่นและปุ่มมุมจอ · หน้าต่างแคบสุดเท่านี้ (จอเล็กยอมทับมุมเล็กน้อย) */
const HAND_SIDE = 290;
/**
 * 2VS2: พัดมือแบ่งครึ่งจอ เว้นที่ป้ายผู้เล่น/ปุ่มมุมจอ
 * ล่าง: เรา = ซ้าย (เว้นป้ายผู้เล่นมุมซ้ายล่าง) · เพื่อน = ขวา (เว้นปุ่มมุมขวาล่าง) · บน: คู่แข่ง 2 = ซ้าย (เว้นปุ่มมุมซ้ายบน) · คู่แข่ง 1 = ขวา (เว้นป้ายคู่แข่ง)
 */
const SPLIT_FAN = {
  bottom: { main: 'left-[300px] right-1/2', partner: 'left-1/2 right-[250px]' },
  top: { main: 'left-1/2 right-[300px]', partner: 'left-[110px] right-1/2' },
} as const;
const HAND_MIN_WINDOW = 760;
/** ระยะจากขอบหน้าต่างที่เอาเมาส์ไปค้างแล้วมือเลื่อนเอง และความเร็วสูงสุด (px ต่อเฟรม) */
const EDGE_ZONE = 110;
const EDGE_SPEED = 14;
/** ลากเกินระยะนี้ถึงนับเป็นการเลื่อน (น้อยกว่านี้ = คลิก) */
const DRAG_START = 6;

/**
 * มือแบบพัด ลอยทับขอบล่าง (มือคู่แข่ง = ขอบบน) และจมลงใต้ขอบเล็กน้อย
 * การ์ดขนาดเดิมเสมอ ถ้ามือยาวเกินหน้าต่าง: เลื่อนซ้าย/ขวาได้ด้วย เอาเมาส์ค้างที่ขอบ, กดลาก (เมาส์/นิ้ว), ลูกศรที่ขอบ, ลูกล้อเมาส์
 */
export function HandFan({ player, top, partner = false }: { player: PlayerId; top?: boolean; partner?: boolean }) {
  const hidden = useGame((s) => hiddenFrom(s, player));
  /**
   * 2VS2: มือของแต่ละทีมแยกสองฝั่ง ตรงกับช่องของเจ้าของบนแผ่นสนาม
   * ล่าง: เรา = ครึ่งซ้าย · เพื่อนร่วมทีม = ครึ่งขวา (หงายหน้า ดูได้อย่างเดียว) · บน (หมุน 180°): คู่แข่ง 1 = ครึ่งขวา · คู่แข่ง 2 = ครึ่งซ้าย
   */
  // ซ่อนมือเพื่อนแล้ว: มือเรา (ล่าง) กางเต็มความกว้างเหมือนปกติ
  const split = useGame((s) => !!s.state.players[player].partner && !(!top && s.partnerHandHidden));
  const hand = useShownHand(player, hidden, partner);
  // เมจิกที่ยังร่ายไม่จบ: เว้นช่องเดิมในพัดไว้ (การ์ดพักลอยเหนือช่องระหว่างรอเลือก)
  // 2VS2: ช่องพักของเมจิกที่ร่ายอยู่ = พัดมือของเจ้าของการ์ด (ไม่ใช่ทุกใบของฝั่งนี้)
  const slotKey = useGame((s) => {
    const all = castHandSlots(s.state, player);
    if (!s.state.players[player].partner || !all) return all;
    const active = s.state.players[player].active ?? 0;
    return all
      .split(',')
      .filter((x) => ((s.state.cards[x.split(':')[0]!]?.seat ?? 0) === active) !== partner)
      .join(',');
  });
  const items = useMemo(() => {
    const out: { id: string; slot?: true }[] = hand.map((id) => ({ id }));
    const slots = slotKey
      ? slotKey.split(',').map((x) => {
          const [id, i] = x.split(':');
          return { id: id!, index: Number(i) };
        })
      : [];
    for (const sl of slots.sort((a, b) => a.index - b.index)) out.splice(Math.min(sl.index, out.length), 0, { id: sl.id, slot: true });
    return out;
  }, [hand, slotKey]);
  const layout = usePrefs((p) => p.handLayout);
  const selected = useGame((s) => s.selectedHandCard);
  const outerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  /** ขนาดที่วัดจาก layout: หน้าต่าง / ทั้งแถว / การ์ดหนึ่งใบ / ระยะระหว่างใบ */
  const [geo, setGeo] = useState({ win: 0, row: 0, card: 0, step: 1 });
  const overflow = geo.row > geo.win + 1;
  const maxOffset = overflow ? geo.row - geo.win : 0;
  const [offset, setOffsetState] = useState(0);
  const offsetRef = useRef(0);
  const maxRef = useRef(0);
  maxRef.current = maxOffset;
  const scrollTo = (v: number) => {
    const next = Math.max(0, Math.min(maxRef.current, v));
    offsetRef.current = next;
    setOffsetState(next);
  };

  // วัดขนาดใหม่เมื่อจำนวนใบ/ขนาดจอเปลี่ยน (offsetLeft ไม่นับ transform ของพัด)
  const prevLen = useRef(hand.length);
  useLayoutEffect(() => {
    const measure = () => {
      const outer = outerRef.current;
      const kids = rowRef.current?.children;
      if (!outer || !kids || kids.length === 0) return setGeo({ win: 0, row: 0, card: 0, step: 1 });
      const first = kids[0] as HTMLElement;
      const last = kids[kids.length - 1] as HTMLElement;
      const card = first.offsetWidth;
      const step = kids.length > 1 ? (kids[1] as HTMLElement).offsetLeft - first.offsetLeft : card;
      // 2VS2: พัดกินครึ่งจอ เว้นขอบแค่นิดเดียว
      const win = split ? outer.clientWidth - 40 : Math.min(outer.clientWidth, Math.max(HAND_MIN_WINDOW, outer.clientWidth - HAND_SIDE * 2));
      const row = last.offsetLeft + last.offsetWidth - first.offsetLeft;
      maxRef.current = row > win + 1 ? row - win : 0;
      setGeo({ win, row, card, step });
      // จั่ว/ได้การ์ดขึ้นมือ (ใบใหม่ต่อท้าย): เลื่อนไปให้เห็นใบใหม่ · มือลดลง: ไม่ให้เลื่อนเลยขอบ
      scrollTo(hand.length > prevLen.current ? maxRef.current : offsetRef.current);
      prevLen.current = hand.length;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, split]);

  // เลือกการ์ดที่อยู่ชิดขอบ: เลื่อนให้เห็นทั้งใบ (เมนูเล่นการ์ดจะได้ไม่ถูกตัด)
  const showCard = (i: number) => {
    if (i < 0 || !overflow) return;
    const left = i * geo.step;
    if (left < offsetRef.current) scrollTo(left);
    else if (left + geo.card > offsetRef.current + geo.win) scrollTo(left + geo.card - geo.win);
  };
  useEffect(() => {
    showCard(selected ? hand.indexOf(selected) : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  // Flash Timing ของผู้เล่นนี้: เลื่อนให้เห็นการ์ดใบแรกที่ใช้ได้ (ถ้าไม่มีใบไหนอยู่ในจอ)
  const flashCards = useGame((s) => {
    // มือที่คว่ำไว้ (ออนไลน์ = มือคู่แข่ง) ห้ามเลื่อนตาม ไม่งั้นตำแหน่งที่เลื่อนไปจะบอกว่าการ์ด Flash อยู่ใบไหน
    if (flashPlayer(s.state) !== player || isFxBlocking(s.fx) || hiddenFrom(s, player)) return '';
    const o = responseOptions(s.state, player);
    return sortHand(s.state, s.state.players[player].hand, usePrefs.getState().handSort, s.handOrder[player]).filter((id) => o.magic.includes(id) || o.quick.includes(id)).join(',');
  });
  useEffect(() => {
    if (!flashCards || !overflow) return;
    const idx = flashCards.split(',').map((id) => hand.indexOf(id));
    const visible = idx.some((i) => i * geo.step >= offsetRef.current - 1 && i * geo.step + geo.card <= offsetRef.current + geo.win + 1);
    if (!visible) showCard(idx[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashCards]);

  // เลื่อนเองต่อเนื่องตอนเมาส์ค้างที่ขอบ (ความเร็ว: ติดลบ = ไปซ้าย)
  const vel = useRef(0);
  const raf = useRef(0);
  const setVel = (v: number) => {
    vel.current = v;
    if (!v || raf.current) return;
    const tick = () => {
      if (!vel.current) {
        raf.current = 0;
        return;
      }
      scrollTo(offsetRef.current + vel.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // กดลากเลื่อน: เริ่มนับเมื่อขยับแนวนอนเกิน DRAG_START · ลากแล้วปล่อย = ไม่นับเป็นคลิก
  const drag = useRef<{ x: number; y: number; start: number; moved: boolean; lastX: number; lastY: number } | null>(null);
  const suppressClick = useRef(false);
  const startDrag = (e: React.PointerEvent) => {
    if (!overflow || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: offsetRef.current, moved: false, lastX: e.clientX, lastY: e.clientY };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.lastX = ev.clientX;
      d.lastY = ev.clientY;
      const dx = ev.clientX - d.x;
      if (!d.moved && Math.abs(dx) > DRAG_START && Math.abs(dx) > Math.abs(ev.clientY - d.y) * 2) {
        d.moved = true;
        setVel(0);
      }
      if (d.moved) scrollTo(d.start - dx);
    };
    const end = () => {
      if (drag.current?.moved) {
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
      }
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const scrollCtx = useMemo(
    () => ({
      // เบราว์เซอร์เริ่มลากการ์ด (HTML5 drag) หลังขยับไม่กี่ px: ถ้าลากไปทางข้างบนมือที่เลื่อนได้ ให้เป็นการเลื่อนมือแทน
      claimDrag: () => {
        const d = drag.current;
        setVel(0);
        if (!d) return false;
        const dx = Math.abs(d.lastX - d.x);
        const dy = Math.abs(d.lastY - d.y);
        // เลื่อนมือเฉพาะเมื่อลากแนวนอนชัดเจน: ลากเฉียงขึ้น / ขยับนิดเดียว = หยิบการ์ดไปเล่น (เดิมเฉียงนิดเดียวก็กลายเป็นเลื่อนมือ)
        if (d.moved || (dx > DRAG_START && dx > dy * 2)) {
          d.moved = true;
          return true;
        }
        drag.current = null; // ลากขึ้น/ลง = หยิบการ์ดไปเล่นตามปกติ
        return false;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ตำแหน่งกลางของส่วนที่มองเห็น (หน่วย: ใบ) ใช้คิดความโค้งของพัด
  const center = overflow ? (offset + geo.win / 2 - geo.card / 2) / geo.step : (items.length - 1) / 2;
  const spread = overflow ? geo.win / geo.step : items.length;
  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      aria-label={dir < 0 ? 'เลื่อนมือไปทางซ้าย' : 'เลื่อนมือไปทางขวา'}
      className={`pointer-events-auto absolute z-[60] flex h-14 w-9 items-center justify-center rounded-full bg-slate-950/80 text-yellow-200 shadow-lg ring-1 ring-yellow-300/50 hover:bg-slate-900 ${
        dir < 0 ? 'left-1' : 'right-1'
      } ${top ? 'top-12' : 'bottom-12'}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setVel(dir * EDGE_SPEED)}
      onPointerLeave={() => setVel(0)}
      onClick={() => scrollTo(offsetRef.current + dir * geo.win * 0.6)}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={dir < 0 ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
      </svg>
    </button>
  );

  return (
    <div
      ref={outerRef}
      data-player-target={split ? undefined : player}
      data-setup={partner ? undefined : top ? 'hand-top' : 'hand-bottom'}
      data-hand-fan={partner ? undefined : true}
      className={`pointer-events-none fixed z-20 flex h-0 justify-center ${!split ? 'left-0 right-[var(--sidebar)]' : SPLIT_FAN[top ? 'top' : 'bottom'][partner ? 'partner' : 'main']} ${top ? 'top-0 items-start' : 'bottom-0 items-end'}`}
    >
      {/* 2VS2: เป้าของการโจมตีตรง = กลางจอระหว่างทั้งสองคนของทีม (ไลฟ์ลดทั้งคู่) ไม่ใช่พัดมือของคนแรก */}
      {split && !partner && <div data-player-target={player} aria-hidden="true" className={`pointer-events-none fixed left-1/2 h-28 w-24 -translate-x-1/2 ${top ? 'top-0' : 'bottom-0'}`} />}
      {/* หน้าต่างของมือ: มือยาวเกิน = ตัดส่วนที่เลยซ้าย/ขวา (ด้านบน/ล่างยังยื่นได้ ให้ใบที่ยกขึ้นและเมนูการ์ดแสดงครบ) */}
      <div
        className={`relative flex shrink-0 ${top ? 'items-start' : 'items-end'}`}
        style={
          overflow
            ? { width: geo.win, clipPath: top ? 'inset(-60px 0 -800px 0)' : 'inset(-800px 0 -60px 0)', touchAction: 'none' }
            : undefined
        }
        onPointerDown={startDrag}
        onPointerMove={(e) => {
          if (!overflow || e.pointerType !== 'mouse' || drag.current?.moved) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          setVel(x < EDGE_ZONE ? -(1 - x / EDGE_ZONE) * EDGE_SPEED : x > r.width - EDGE_ZONE ? (1 - (r.width - x) / EDGE_ZONE) * EDGE_SPEED : 0);
        }}
        onPointerLeave={() => setVel(0)}
        onWheel={(e) => overflow && scrollTo(offsetRef.current + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY))}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <HandScrollCtx.Provider value={scrollCtx}>
          <div ref={rowRef} className={`flex shrink-0 ${top ? 'items-start' : 'items-end'}`} style={overflow ? { transform: `translateX(${-offset}px)` } : undefined}>
            {items.map((it, index) =>
              it.slot ? (
                // ช่องของเมจิกที่ยังร่ายไม่จบ: การ์ดพักในช่องเดิม ยกขึ้นเล็กน้อย ซ้อนกับใบข้าง ๆ ตามลำดับเหมือนการ์ดในมือ
                <CastSlot key={`slot-${it.id}`} cardId={it.id} top={top} fan={{ index, off: index - center, spread, top, layout }} />
              ) : (
                <HandCard key={it.id} cardId={it.id} hidden={hidden} shown={hidden ? undefined : hand} fan={{ index, off: index - center, spread, top, layout }} />
              ),
            )}
          </div>
        </HandScrollCtx.Provider>
        {overflow && offset > 0.5 && arrow(-1)}
        {overflow && offset < maxOffset - 0.5 && arrow(1)}
      </div>
    </div>
  );
}

export function Hand({ player, small }: { player: PlayerId; small?: boolean }) {
  const state = useGame((s) => s.state);
  const hand = state.players[player].hand;
  const hidden = useGame((s) => hiddenFrom(s, player));
  return (
    <div data-player-target={player} className="flex items-end justify-center gap-2 px-2">
      {hand.map((id) => (
        <HandCard key={id} cardId={id} hidden={hidden} small={small} />
      ))}
    </div>
  );
}
