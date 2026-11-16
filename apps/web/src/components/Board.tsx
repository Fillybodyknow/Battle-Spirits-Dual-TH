import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { activatableAbilities, baseCost, canAttackWith, cardLevel, currentBp, isSpiritLike, payableCost, trashSummonRule, type CoreTarget, type PlayerId } from '@bs/engine';
import { playerLabel } from '../format';
import { IMG } from '../assets';
import type { Fx } from '../store';
import { blockCandidates, controls, hiddenFrom, mine, braveHostOf, braveHosts, canDropBurst, canQuickSummon, handFieldAction, separatePlacement } from '../store';
import { actingPlayer, canEvolve, db, isMultiHostCandidate, flashPlayer, inMain, isChoiceCandidate, isFxBlocking, magicTimings, responseOptions, simulateEvolve, simulateMove, useGame } from '../store';
import { useFlashUsable } from './Controls';
import { CardBack, CardFace } from './CardFace';
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
          {state.cards[h]!.braves.length > 0
            ? `สลับกับ ${db.get(state.cards[state.cards[h]!.braves[0]!]!.cardNo).name} (บน ${db.get(state.cards[h]!.cardNo).name})`
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

/** ค่าที่หน่วงไว้ของการ์ดนี้ (ถ้ายังไม่ถึงเวลา) — render ใหม่เองเมื่อหมดเวลา */
function useHeld(cardId: string): { bp?: number; level?: number; exhausted?: true } | null {
  const hold = useGame((s) => s.holds[cardId]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hold) return;
    const now = performance.now();
    const timers = [hold.until, hold.exhaustedUntil ?? 0]
      .filter((t) => t > now)
      .map((t) => setTimeout(() => tick((n) => n + 1), t - now + 10));
    return () => timers.forEach(clearTimeout);
  }, [hold]);
  if (!hold) return null;
  const now = performance.now();
  const out: { bp?: number; level?: number; exhausted?: true } = {};
  if (now < hold.until) {
    if (hold.bp !== undefined) out.bp = hold.bp;
    if (hold.level !== undefined) out.level = hold.level;
  }
  if (hold.exhaustedUntil && now < hold.exhaustedUntil) out.exhausted = true;
  return out;
}

function FieldCard({ cardId, depleting }: { cardId: string; depleting: boolean }) {
  const state = useGame((s) => s.state);
  const dragging = useGame((s) => s.dragging);
  const hasSelection = useGame((s) => s.selectedCores.length > 0);
  const pinned = useGame((s) => s.pinned === cardId);
  /** เป็นตัวเลือกของเอฟเฟกต์ที่รออยู่ (คลิกเพื่อเลือก) · อัญเชิญหลายใบ: ผู้ร่วมร่างของ Brave ที่กำลังจัด */
  const candidate = useGame((s) => (isChoiceCandidate(s.state, cardId) || isMultiHostCandidate(s, cardId)) && !isFxBlocking(s.fx));
  /** กำลังเลือก Core สำหรับ [Evolution] ของการ์ดนี้ */
  const evolving = useGame((s) => s.evolveCard === cardId);
  const evolveMode = useGame((s) => !!s.evolveCard);
  const selectedCores = useGame((s) => s.selectedCores);
  const flying = useFlying(cardId);
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

  // ออนไลน์: จับต้องได้เฉพาะการ์ดของที่นั่งเรา
  const own = mine(card.owner);
  const ready = own && spirit && !exhausted && !state.winner && !state.choice;
  const canAttack = ready && state.phase === 'attack' && !battle && card.owner === state.turnPlayer && canAttackWith(state, db, cardId);
  // ป้องกัน: ใช้รายชื่อจาก engine (รวมตัวที่ป้องกันได้แม้เสื่อมสภาพ / กฎป้องกันพิเศษ)
  const canBlock = own && !state.winner && !state.choice && battle?.step === 'declareBlock' && card.owner !== state.turnPlayer && blockCandidates(state).includes(cardId);
  const ownTurnMain = own && inMain(state) && card.owner === state.turnPlayer;
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
        [candidate, 'ring-4 ring-fuchsia-400 cursor-pointer'],
        [flashReady, 'ring-4 ring-cyan-300'],
        [evolving || over, 'ring-4 ring-emerald-400'],
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
        <div className="relative h-24 w-[4.2rem] shrink-0 cursor-pointer">
          <CardFace def={def} size="xs" level={level} />
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
      className={`flex shrink-0 flex-col items-center gap-1 transition-[width] duration-300 ${exhausted ? 'w-40' : 'w-28'} ${card.braves.length > 0 ? 'mr-7' : ''} ${flying ? 'invisible' : ''}`}
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
          clickFieldCard(cardId);
        }}
        className={`relative flex items-center justify-center transition-[height,width] duration-300 ${exhausted ? 'h-28 w-40' : 'h-40 w-28'} ${draggingThis ? 'opacity-40' : ''}`}
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
        {/* Brave ที่ร่วมร่าง: ซ้อนมุมบนขวาของผู้ร่วมร่าง */}
        {card.braves.map((b) => {
          // เป็นเป้าหมายให้เลือก (เช่น ทำลายเบรฟที่ร่วมร่างอยู่)
          const braveCandidate = !fxBlocking && isChoiceCandidate(state, b);
          return (
          <div
            key={b}
            data-brave-card={b}
            className={`absolute top-6 -right-8 z-[5] h-[4.6rem] w-[3.3rem] rotate-12 rounded shadow-[0_4px_10px_rgba(0,0,0,0.7)] ${
              braveCandidate ? 'cursor-pointer ring-4 ring-fuchsia-400' : 'ring-2 ring-emerald-300'
            }`}
            title={`Brave: ${db.get(state.cards[b]!.cardNo).name}${ownTurnMain ? ' · คลิกเพื่อแยกร่าง/ย้าย' : ''}`}
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
              if (!ownTurnMain || state.choice) return;
              e.stopPropagation();
              setBraveMenu(braveMenu ? null : b);
            }}
            draggable={ownTurnMain && !fxBlocking && !state.choice}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', 'brave:' + b);
              beginCardDrag(e);
              setBraveMenu(null);
              useGame.getState().startBraveDrag(b);
            }}
            onDragEnd={() => useGame.getState().endBraveDrag()}
            style={braveCandidate ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : ownTurnMain ? { cursor: 'pointer' } : undefined}
          >
            <CardFace def={db.get(state.cards[b]!.cardNo)} size="xs" />
          </div>
          );
        })}
        {braveMenu && ownTurnMain && <BraveMenu braveId={braveMenu} onClose={() => setBraveMenu(null)} />}
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
        {candidate && (
          <div className="absolute inset-x-1 bottom-1 rounded bg-fuchsia-500 py-0.5 text-center text-xs font-bold text-white shadow">คลิกเพื่อเลือก</div>
        )}
        {canAttack && (
          <div className="absolute inset-x-1 bottom-1 rounded bg-amber-400 py-0.5 text-center text-xs font-bold text-slate-900">คลิกเพื่อโจมตี</div>
        )}
        {canBlock && (
          <div className="absolute inset-x-1 bottom-1 rounded bg-sky-400 py-0.5 text-center text-xs font-bold text-slate-900">คลิกเพื่อป้องกัน</div>
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
        className={`flex h-8 w-full items-center justify-center rounded-md border px-1 py-0.5 ${
          over ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/10 bg-black/40'
        }`}
      >
        {card.cores.length > 0 ? (
          <CoreTray cores={card.cores} width={exhausted ? 148 : 100} />
        ) : (
          <span className="text-[11px] text-slate-500">ไม่มี Core</span>
        )}
      </div>
      {evolving ? (
        <button type="button" onClick={closeEvolve} className="w-full rounded-md bg-slate-700 py-1 text-xs font-bold text-emerald-300 shadow">
          กำลังเลือก Core… (ยกเลิก)
        </button>
      ) : (
        !evolveMode &&
        own && canEvolve(state, cardId) && (
          <button
            type="button"
            onClick={() => openEvolve(cardId)}
            className="w-full rounded-md bg-emerald-500 py-1 text-xs font-bold text-slate-900 shadow hover:bg-emerald-400"
            style={flashPlayer(state) ? { animation: 'fx-flash-glow 1.2s ease-in-out infinite' } : undefined}
          >
            [Evolution] ดึง Core มาวาง
          </button>
        )
      )}
      {/* เอฟเฟกต์ Flash ที่กดใช้เอง (โซอุม / โอกุมะ / Assault) */}
      {own &&
        !evolveMode &&
        activatableAbilities(state, db, card.owner, cardId).map((ab) => (
          <button
            key={ab.source}
            type="button"
            onClick={() => useGame.getState().dispatch({ type: 'activate', player: card.owner, cardId, source: ab.source })}
            onMouseEnter={() => hover(cardId)}
            onMouseLeave={() => hover(null)}
            title={ab.label}
            className="w-full rounded-md bg-cyan-300 py-1 text-xs font-bold text-slate-900 shadow hover:bg-cyan-200"
            style={{ animation: 'fx-flash-glow 1.2s ease-in-out infinite' }}
          >
            {/* ชื่อสั้นบนปุ่ม (รายละเอียดอยู่ใน title และแผงข้อมูลการ์ด) */}
            {ab.label.startsWith('[') ? ab.label.slice(0, ab.label.indexOf(']') + 1) : '[Flash]'} ใช้เอฟเฟกต์
          </button>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- playmat

/** ช่องบนแผ่นรองเล่น: กรอบขอบโลหะ ชื่อช่องตัวสลัก + คำอ่านภาษาไทย */
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

function LifeSlot({ player }: { player: PlayerId }) {
  const state = useGame((s) => s.state);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const dispatch = useGame((s) => s.dispatch);
  const life = state.players[player].life;
  const slots = Math.max(state.config.initialLife, life.length, 6);
  // ช่วงประกาศป้องกัน: คลิกแผง Life ของฝ่ายป้องกัน = ไม่ป้องกัน (รับการโจมตีด้วย Life)
  const battle = state.battle;
  const canTake =
    !blocking &&
    mine(player) &&
    !state.choice &&
    !state.winner &&
    battle?.step === 'declareBlock' &&
    player !== state.turnPlayer &&
    !(battle.mustBlock && blockCandidates(state).length > 0);
  const more = (battle?.blockers.length ?? 0) > 0;
  return (
    <MatSlot
      data-life={player}
      label="Life"
      sub="ไลฟ์"
      count={life.length}
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

function ReserveSlot({ player }: { player: PlayerId }) {
  const state = useGame((s) => s.state);
  const dragging = useGame((s) => s.dragging);
  const hasSelection = useGame((s) => s.selectedCores.length > 0);
  const moveCoresTo = useGame((s) => s.moveCoresTo);
  const [over, setOver] = useState(false);
  const p = state.players[player];
  const active = mine(player) && inMain(state) && player === state.turnPlayer && (!!dragging || hasSelection);
  const target = useMemo<CoreTarget>(() => ({ area: 'reserve' }), []);

  return (
    <MatSlot
      data-reserve={player}
      label="Reserve"
      sub="รีเสิร์ฟ"
      count={p.reserve.length}
      className={`min-h-14 flex-1 ${over ? 'border-emerald-400 bg-emerald-400/25' : active ? 'cursor-pointer border-dashed border-emerald-400/80' : ''}`}
      onClick={active ? () => moveCoresTo(target) : undefined}
      {...dropHandlers(active, () => moveCoresTo(target), setOver)}
    >
      {p.reserve.length > 0 ? <CoreRow cores={p.reserve} size="md" board /> : <span className="text-[11px] text-slate-500">ว่าง</span>}
    </MatSlot>
  );
}

function BurstSlot({ player }: { player: PlayerId }) {
  const state = useGame((s) => s.state);
  const hiddenBurst = useGame((s) => hiddenFrom(s, player));
  const { hover, pin } = useGame.getState();
  const burst = state.players[player].burst;
  const visible = !!burst && !hiddenBurst;
  const dropOk = useGame((s) => !!s.handDrag && s.state.cards[s.handDrag]!.owner === player && canDropBurst(s.state, s.handDrag));
  const dropHand = useGame((s) => s.dropHand);
  const dispatch = useGame((s) => s.dispatch);
  const fxBlocking = useGame((s) => isFxBlocking(s.fx));
  const [over, setOver] = useState(false);
  const myMain = useGame((s) => controls(s, player)) && inMain(state) && state.turnPlayer === player && !fxBlocking;
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
          data-burst-card={player}
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
      {myMain && state.burstSetThisTurn && <span className="absolute top-1 right-1 rounded bg-black/60 px-1 text-[9px] text-orange-200">เซ็ทแล้วเทิร์นนี้</span>}
    </MatSlot>
  );
}

function DeckSlot({ player }: { player: PlayerId }) {
  const count = useGame((s) => s.state.players[player].deck.length);
  return (
    <MatSlot label="Deck" sub="เด็ค" count={count}>
      <div data-deck={player} className="relative mx-auto h-16 w-11">
        {count > 0 ? (
          <>
            <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-black/70" />
            <div className="absolute inset-0">
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

function TrashSlot({ player }: { player: PlayerId }) {
  const p = useGame((s) => s.state.players[player]);
  const state = useGame((s) => s.state);
  const openTrash = useGame((s) => s.openTrash);
  // การ์ดที่ภาพ "ถูกทิ้งจากเด็ค" ยังเล่นอยู่: ยังไม่โชว์ใน Trash
  const fxList = useGame((s) => s.fx);
  const milling = fxList.flatMap((f) => (f.kind === 'mill' && f.owner === player ? f.cardIds : []));
  const shown = milling.length > 0 ? p.trashCards.filter((id) => !milling.includes(id)) : p.trashCards;
  const top = shown.at(-1);
  const hover = useGame((s) => s.hover);
  // ลาก Burst ของผู้เล่นนี้มาปล่อย = ทิ้ง Burst
  const burstDrop = useGame((s) => !!s.burstDrag && s.state.players[player].burst === s.burstDrag);
  const [over, setOver] = useState(false);
  /** การ์ดใน Trash ที่อัญเชิญได้ตอนนี้ (Flash Timing หรือ Main Step) */
  const summonable = useGame((s) =>
    !mine(player) || isFxBlocking(s.fx) || s.state.choice || s.state.winner
      ? 0
      : s.state.players[player].trashCards.filter((id) => trashSummonRule(s.state, db, player, id) !== null).length,
  );
  const inFlash = !!state.battle?.flash;
  return (
    <MatSlot
      data-trash={player}
      style={summonable > 0 && !burstDrop ? { animation: `${inFlash ? 'fx-flash-glow 1.2s' : 'fx-choice-glow 1.4s'} ease-in-out infinite` } : undefined}
      label="Trash"
      sub="แทรช"
      className={`min-h-20 flex-1 cursor-pointer hover:border-slate-200/50 ${
        burstDrop ? (over ? 'border-rose-300 bg-rose-500/30' : 'border-dashed border-rose-300') : summonable > 0 ? (inFlash ? 'border-cyan-300 bg-cyan-400/10' : 'border-yellow-300 bg-yellow-300/10') : ''
      }`}
      onClick={() => openTrash(player)}
      title={summonable > 0 ? `อัญเชิญจาก Trash ได้ ${summonable} ใบ · คลิกเพื่อเปิด` : 'คลิกดูการ์ดใน Trash'}
      {...dropHandlers(burstDrop, () => {
        useGame.setState({ burstDrag: null });
        useGame.getState().dispatch({ type: 'discardBurst', player });
      }, setOver)}
    >
      {burstDrop && (
        <div className="pointer-events-none absolute inset-x-1 -top-2 z-10 rounded bg-rose-600 py-0.5 text-center text-[11px] font-bold text-white shadow">ปล่อยเพื่อทิ้ง Burst</div>
      )}
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
          onMouseEnter={() => top && hover(top)}
          onMouseLeave={() => hover(null)}
        >
          {top ? (
            <>
              {p.trashCards.length > 1 && <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-slate-950 ring-1 ring-white/10" />}
              <div className="relative h-full w-full" key={top} style={{ animation: 'fx-chain-pop 0.35s ease-out both' }}>
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

  return (
    <section
      data-mat={player}
      className={`mat-sheen relative isolate flex min-h-fit flex-1 gap-2 overflow-hidden rounded-xl border-2 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.55)] flex-row ${top ? 'rotate-180' : ''} ${
        acting ? 'mat-active border-transparent shadow-[0_0_24px_rgba(250,204,21,0.25)]' : 'border-slate-500/30'
      }`}
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
      </div>

      <div className={`flex w-32 shrink-0 gap-2 ${col}`}>
        <BurstSlot player={player} />
        <LifeSlot player={player} />
        <ReserveSlot player={player} />
      </div>

      {/* Field */}
      <div
        className={`relative flex min-w-0 flex-1 gap-2 rounded-md border bg-black/15 p-2 transition ${col} ${
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
          <div className="flex flex-1 justify-center">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-black/15 p-1">
              {nexus.length > 0 ? (
                nexus.map((id) => <FieldCard key={id} cardId={id} depleting={depleting.has(id)} />)
              ) : (
                <span className="px-6 py-0.5 text-[10px] tracking-[0.3em] text-white/25 select-none">NEXUS</span>
              )}
            </div>
          </div>
          {/* ถ่วงขวาให้ช่อง Nexus อยู่กลางสนาม */}
          <div className="w-36 shrink-0" />
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
            {slots.map((slot) =>
              'id' in slot ? (
                <FieldCard key={slot.id} cardId={slot.id} depleting={depleting.has(slot.id)} />
              ) : (
                // ช่องว่างของการ์ดที่กำลังแตก: rect วัดจากจอ (ย่อแล้ว) จึงหารกลับเป็นขนาดก่อนย่อ
                <div
                  key={`gap-${slot.gap.id}`}
                  className="shrink-0"
                  style={{ width: slot.gap.rect.w / fieldScale, height: slot.gap.rect.h / fieldScale + 32 }}
                />
              ),
            )}
          </div>
        </div>
      </div>

      <div className={`flex w-32 shrink-0 gap-2 ${col}`}>
        <DeckSlot player={player} />
        <TrashSlot player={player} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- hand

/**
 * ตำแหน่งในพัด: off = ห่างจากกลางส่วนที่มองเห็นกี่ใบ (ติดลบ = ซ้าย) · spread = จำนวนใบที่เห็นพร้อมกัน
 * มือยาวเกินจอ (เลื่อนได้): ความโค้งคิดจากกลางหน้าต่าง ใบที่อยู่ในจอจึงไม่จมลึก
 */
type FanPos = { index: number; off: number; spread: number; top?: boolean };

/** ท่าของการ์ดในพัด: เอียงตามตำแหน่ง ใบริมจมลึกกว่า ชี้/เลือกแล้วยกขึ้นตั้งตรง */
function fanStyle(fan: FanPos, raised: boolean, lift = false): React.CSSProperties {
  // ใบที่เลยขอบหน้าต่างไปแล้ว (ถูกตัดไม่ให้เห็น): ไม่ต้องเอียง/จมเพิ่ม เวลาเลื่อนเข้ามาจะได้ไม่โผล่ขึ้นจากใต้จอ
  const edge = fan.spread / 2 + 0.5;
  const off = Math.max(-edge, Math.min(edge, fan.off));
  const angle = off * Math.min(6, 36 / Math.max(fan.spread, 1));
  if (fan.top) {
    // มือคู่แข่ง: พัดกลับหัวที่ขอบบน (เหมือนนั่งถือการ์ดอยู่ฝั่งตรงข้าม) จมเหนือขอบจอ
    return {
      transform: raised ? 'translateY(8%) rotate(0deg) scale(1.1)' : `translateY(calc(${lift ? -32 : -50}% - ${off * off * 2}px)) rotate(${-angle}deg)`,
      transformOrigin: '50% 0%',
      zIndex: raised ? 50 : lift ? 40 + fan.index : fan.index + 1,
      marginLeft: fan.index === 0 ? 0 : '-1.6rem',
      transition: 'transform 160ms ease-out',
    };
  }
  return {
    transform: raised ? 'translateY(-8%) rotate(0deg) scale(1.1)' : `translateY(calc(${lift ? 26 : 42}% + ${off * off * 2.5}px)) rotate(${angle}deg)`,
    transformOrigin: '50% 100%',
    zIndex: raised ? 50 : lift ? 40 + fan.index : fan.index + 1,
    marginLeft: fan.index === 0 ? 0 : '-2.25rem',
    transition: 'transform 160ms ease-out',
  };
}

function HandCard({ cardId, hidden, small, fan }: { cardId: string; hidden: boolean; small?: boolean; fan?: FanPos }) {
  const state = useGame((s) => s.state);
  const selected = useGame((s) => s.selectedHandCard === cardId);
  const { clickHandCard, openPlay, dispatch, hover } = useGame.getState();
  const [hovering, setHovering] = useState(false);
  const candidate = useGame((s) => isChoiceCandidate(s.state, cardId) && !isFxBlocking(s.fx));
  const flashUsable = useFlashUsable(cardId);
  const flying = useFlying(cardId);
  const dragged = useGame((s) => s.handDrag === cardId);
  const fxBlocking = useGame((s) => isFxBlocking(s.fx));
  const { startHandDrag, endHandDrag } = useGame.getState();
  const scroller = useContext(HandScrollCtx);
  const card = state.cards[cardId]!;
  const def = db.get(card.cardNo);
  /** วางแสดงนอกมือ (อันโกะ): หงายให้ทั้งสองฝ่ายเห็น */
  const shown = (state.shownCards ?? []).includes(cardId);
  const size = small ? 'h-16 w-11' : fan?.top ? 'h-32 w-[5.75rem]' : fan ? 'h-48 w-34' : 'h-36 w-26';
  const draggable = !hidden && !fxBlocking && (!!handFieldAction(state, cardId) || canDropBurst(state, cardId));
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

  const main = mine(card.owner) && inMain(state) && card.owner === state.turnPlayer;
  const flash = mine(card.owner) && flashPlayer(state) === card.owner;
  const timings = def.type === 'magic' ? magicTimings(card.cardNo) : [];
  const pay = payableCost(state, db, card.owner, def, baseCost(state, db, cardId));
  const affordable = pay <= state.players[card.owner].reserve.length + state.players[card.owner].field.reduce((n, id) => n + state.cards[id]!.cores.length, 0);
  const quick = canQuickSummon(state, cardId);
  const playable = ((main || (flash && timings.includes('flash'))) && affordable) || quick;

  const options: { label: string; run: () => void }[] = [];
  if (main && (def.type === 'spirit' || def.type === 'brave' || def.type === 'ultimate')) {
    options.push({ label: 'อัญเชิญ', run: () => openPlay(cardId, 'summon') });
  }
  for (const host of braveHosts(state, cardId)) {
    options.push({ label: `ร่วมร่างกับ ${db.get(state.cards[host]!.cardNo).name}`, run: () => openPlay(cardId, 'summon', undefined, host) });
  }
  if (quick) options.push({ label: 'อัญเชิญ [Quick]', run: () => openPlay(cardId, 'summon') });
  if (main && def.type === 'nexus') options.push({ label: 'วาง Nexus', run: () => openPlay(cardId, 'deployNexus') });
  if (def.type === 'magic') {
    if (main && timings.length === 0) options.push({ label: 'ใช้ Magic', run: () => openPlay(cardId, 'useMagic') });
    if (main && timings.includes('main')) options.push({ label: 'ใช้ [Main]', run: () => openPlay(cardId, 'useMagic', 'main') });
    if ((main || flash) && timings.includes('flash')) options.push({ label: 'ใช้ [Flash]', run: () => openPlay(cardId, 'useMagic', 'flash') });
  }
  if (main && def.burst) options.push({ label: 'เซ็ทเป็น Burst', run: () => dispatch({ type: 'setBurst', player: card.owner, cardId }) });

  return (
    <div
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
      <div
        onClick={() => clickHandCard(cardId)}
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
        title={draggable ? 'ลากไปที่สนามเพื่อเล่น หรือช่อง Burst เพื่อเซ็ท · คลิกเพื่อเปิดเมนู' : undefined}
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
        } ${selected ? `ring-4 ring-yellow-300 ${fan ? '' : '-translate-y-3'}` : ''} ${candidate ? 'cursor-pointer ring-4 ring-fuchsia-400' : ''}`}
        style={candidate ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : flashUsable ? { animation: 'fx-flash-glow 1.2s ease-in-out infinite' } : undefined}
      >
        <div className={`h-full w-full ${fan?.top && !(hovering || selected) ? 'rotate-180' : ''}`}>
          <CardFace def={def} size={small || fan?.top ? 'xs' : 'md'} payCost={pay} />
        </div>
        {candidate && (
          <div className="absolute inset-x-1 top-1 rounded bg-fuchsia-500 py-0.5 text-center text-xs font-bold text-white shadow">คลิกเพื่อเลือก</div>
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
        <div className={`absolute inset-x-0 z-20 flex flex-col ${fan?.top ? "top-full mt-4" : "bottom-full mb-4"} gap-1 rounded-lg border border-yellow-300/60 bg-slate-900 p-1.5 shadow-xl`}>
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
          <button type="button" onClick={() => clickHandCard(cardId)} className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-white/10">
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  );
}

/** การ์ดบนมือขอใช้การลากนี้เป็นการเลื่อนมือ (คืน true = ห้ามเริ่มลากการ์ดไปเล่น) */
const HandScrollCtx = createContext<{ claimDrag: () => boolean } | null>(null);

/** เว้นขอบซ้าย/ขวาของหน้าต่างมือ ไม่ให้ทับป้ายผู้เล่นและปุ่มมุมจอ · หน้าต่างแคบสุดเท่านี้ (จอเล็กยอมทับมุมเล็กน้อย) */
const HAND_SIDE = 290;
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
export function HandFan({ player, top }: { player: PlayerId; top?: boolean }) {
  const state = useGame((s) => s.state);
  const hand = state.players[player].hand;
  const hidden = useGame((s) => hiddenFrom(s, player));
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
      const win = Math.min(outer.clientWidth, Math.max(HAND_MIN_WINDOW, outer.clientWidth - HAND_SIDE * 2));
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
  }, [hand.length]);

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
    return s.state.players[player].hand.filter((id) => o.magic.includes(id) || o.quick.includes(id)).join(',');
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
      if (!d.moved && Math.abs(dx) > DRAG_START && Math.abs(dx) >= Math.abs(ev.clientY - d.y)) {
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
        if (d.moved || dx >= dy) {
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
  const center = overflow ? (offset + geo.win / 2 - geo.card / 2) / geo.step : (hand.length - 1) / 2;
  const spread = overflow ? geo.win / geo.step : hand.length;
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
      data-player-target={player}
      data-setup={top ? 'hand-top' : 'hand-bottom'}
      data-hand-fan
      className={`pointer-events-none fixed left-0 right-[var(--sidebar)] z-20 flex h-0 justify-center ${top ? 'top-0 items-start' : 'bottom-0 items-end'}`}
    >
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
            {hand.map((id, index) => (
              <HandCard key={id} cardId={id} hidden={hidden} fan={{ index, off: index - center, spread, top }} />
            ))}
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
