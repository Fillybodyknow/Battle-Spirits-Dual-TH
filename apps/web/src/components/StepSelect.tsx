import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from '@bs/engine';
import { actingPlayer, controls, isFxBlocking, useGame, viewPlayer } from '../store';

type Step = GameState['phase'];

/** ลำดับสเต็ปในเทิร์น พร้อมไอคอนและชื่อ */
const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: 'start', label: 'Start', icon: '◇' },
  { id: 'core', label: 'Core', icon: '⬢' },
  { id: 'draw', label: 'Draw', icon: '🂠' },
  { id: 'refresh', label: 'Refresh', icon: '↻' },
  { id: 'main', label: 'Main', icon: '✦' },
  { id: 'attack', label: 'Attack', icon: '⚔' },
  { id: 'end', label: 'End', icon: '⏏' },
];

/**
 * สเต็ปที่ผู้เล่นถือเทิร์นเปลี่ยนไปได้ตอนนี้ (ไม่มีอะไรค้างให้ตัดสินใจ)
 * null = เปลี่ยนสเต็ปไม่ได้ตอนนี้
 */
export function useStepSelect(): { phase: Step; attack: 'ok' | 'skip' | null; end: boolean; go: (to: Step) => void } | null {
  const state = useGame((s) => s.state);
  const online = useGame((s) => s.online);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const truth = useGame((s) => s.truth);
  const evolveCard = useGame((s) => s.evolveCard);
  const actor = actingPlayer(state);
  if (online && online.status !== 'playing') return null;
  if (state.winner || blocking || truth || evolveCard || state.choice || state.battle) return null;
  if (state.phase !== 'main' && state.phase !== 'attack') return null;
  if (actor !== state.turnPlayer || !controls({ online }, actor)) return null;

  const player = state.turnPlayer;
  // เทิร์นแรกของผู้เริ่มก่อน: ข้าม Attack Step (จบ Main = จบเทิร์น)
  const skipsAttack = state.turn === 1 && state.config.firstPlayerSkipsAttackStep;
  const go = (to: Step) => {
    const { dispatch } = useGame.getState();
    if (state.phase === 'main') {
      dispatch({ type: 'endMain', player });
      if (to !== 'end') return;
      // ไป End: ผ่าน Attack Step ต่อเลยถ้าไม่มีอะไรค้าง (เช่นเอฟเฟกต์ตอนเริ่ม Attack Step)
      const s = useGame.getState().state;
      if (s.phase === 'attack' && s.turnPlayer === player && !s.choice && !s.battle) dispatch({ type: 'endAttackStep', player });
    } else if (state.phase === 'attack' && to === 'end') {
      dispatch({ type: 'endAttackStep', player });
    }
  };
  return { phase: state.phase, attack: state.phase === 'main' ? (skipsAttack ? 'skip' : 'ok') : null, end: true, go };
}

/** หน้าต่างเลือกสเต็ป: แถวหกเหลี่ยมตามลำดับสเต็ป สเต็ปที่ไปได้กดได้ */
export function StepSelectDialog({ onClose }: { onClose: () => void }) {
  const ctl = useStepSelect();
  if (!ctl) return null;
  const cur = STEPS.findIndex((s) => s.id === ctl.phase);
  const pick = (to: Step) => {
    ctl.go(to);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onClick={onClose} style={{ animation: 'fx-fade-in 0.15s ease-out both' }}>
      <div
        className="relative w-[min(860px,94vw)] overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-b from-slate-900/95 via-[#0b1730]/95 to-slate-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'step-pop 0.22s cubic-bezier(.2,.9,.3,1.2) both' }}
      >
        <div className="border-b border-white/10 bg-black/30 py-2.5 text-center text-sm font-bold tracking-wide text-sky-100">เลือกสเต็ปที่จะไป</div>
        <div className="flex items-center justify-center px-6 pt-9 pb-6">
          {STEPS.map((st, i) => {
            const isCur = i === cur;
            const past = i < cur;
            const target = st.id === 'attack' ? ctl.attack === 'ok' : st.id === 'end' ? ctl.end && !isCur : false;
            const note = st.id === 'attack' && ctl.attack === 'skip' ? 'เทิร์นแรกข้าม' : null;
            return (
              <div key={st.id} className="flex items-center">
                {i > 0 && <div className={`h-0.5 w-4 sm:w-6 ${i <= cur ? 'bg-amber-300/50' : 'bg-white/15'}`} />}
                <div className="relative flex flex-col items-center">
                  {isCur && <div className="absolute -top-6 text-xs font-black text-amber-300">ตอนนี้</div>}
                  <button
                    type="button"
                    disabled={!target}
                    onClick={() => pick(st.id)}
                    className={`group relative flex h-[84px] w-[76px] flex-col items-center justify-center gap-0.5 transition ${
                      target ? 'cursor-pointer hover:-translate-y-1 hover:scale-105' : 'cursor-default'
                    }`}
                    style={{ clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' }}
                  >
                    <span
                      className={`absolute inset-0 ${
                        isCur
                          ? 'bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600'
                          : target
                            ? 'bg-gradient-to-b from-sky-200 via-sky-400 to-indigo-600 group-hover:from-white group-hover:via-sky-300'
                            : 'bg-slate-700/60'
                      }`}
                    />
                    <span
                      className={`absolute inset-[3px] ${isCur ? 'bg-[#2a1d05]' : target ? 'bg-[#0d1d3a] group-hover:bg-[#14305c]' : 'bg-slate-900/90'}`}
                      style={{ clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' }}
                    />
                    <span className={`relative text-xl leading-none ${isCur ? 'text-amber-300' : target ? 'text-sky-200' : past ? 'text-slate-600' : 'text-slate-500'}`}>{st.icon}</span>
                    <span className={`relative text-sm font-black ${isCur ? 'text-amber-200' : target ? 'text-white' : past ? 'text-slate-600' : 'text-slate-500'}`}>{st.label}</span>
                  </button>
                  {target && <div className="absolute -bottom-5 text-[10px] font-bold text-sky-300">ไปสเต็ปนี้</div>}
                  {note && <div className="absolute -bottom-5 text-[10px] whitespace-nowrap text-slate-500">{note}</div>}
                  {past && <div className="absolute -bottom-5 text-[10px] whitespace-nowrap text-slate-500">ผ่านแล้ว ✓</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-center pt-2 pb-5">
          <button type="button" onClick={onClose} className="btn-steel rounded-lg px-10 py-2 text-sm font-bold">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const STEP_LABEL: Record<Step, string> = { start: 'Start', core: 'Core', draw: 'Draw', refresh: 'Refresh', main: 'Main', attack: 'Attack', end: 'End' };

/**
 * ป้าย Turn/Step กลางแถบกลางกระดาน
 * เทิร์นของเรา (ฝั่งล่าง) = วงกลมสีฟ้า · เทิร์นคู่แข่ง = หกเหลี่ยมสีแดง (ขอบทองทั้งคู่)
 * กดได้เมื่อเปลี่ยนสเต็ปได้ → เปิดหน้าต่างเลือกสเต็ป
 */
export function TurnBadge() {
  const turn = useGame((s) => s.state.turn);
  const phase = useGame((s) => s.state.phase);
  const ours = useGame((s) => viewPlayer(s) === s.state.turnPlayer);
  const ctl = useStepSelect();
  const [open, setOpen] = useState(false);
  const HEX = 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)';
  const shape = ours ? { borderRadius: '9999px' } : { clipPath: HEX };
  return (
    <>
      <button
        type="button"
        key={`${turn}-${phase}`}
        disabled={!ctl}
        onClick={() => setOpen(true)}
        title={ctl ? 'กดเพื่อเลือกสเต็ปที่จะไป' : undefined}
        className={`group absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 ${ours ? 'h-[60px] w-[60px]' : 'h-[58px] w-[68px]'} ${
          ctl ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ animation: 'fx-chain-in 0.4s ease-out both' }}
      >
        {/* ขอบทอง */}
        <span
          className={`absolute inset-0 bg-gradient-to-b from-amber-100 via-amber-400 to-amber-700 transition ${ctl ? 'group-hover:brightness-125' : ''}`}
          style={{ ...shape, boxShadow: ours ? '0 0 14px rgba(56,189,248,0.6)' : undefined }}
        />
        {/* ตัวป้าย */}
        <span
          className={`absolute inset-[3px] flex flex-col items-center justify-center ${
            ours
              ? 'bg-[radial-gradient(circle_at_50%_30%,#7dd3fc_0%,#2563eb_45%,#1e1b6b_100%)]'
              : 'bg-[radial-gradient(circle_at_50%_30%,#fb7185_0%,#be123c_45%,#4c0519_100%)]'
          }`}
          style={shape}
        >
          <span className="text-[10px] leading-none font-bold text-white/85">Turn {turn}</span>
          <span className="text-[15px] leading-tight font-black text-white italic [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{STEP_LABEL[phase]}</span>
        </span>
        {/* กดได้: วงแสงกระพริบรอบป้าย */}
        {ctl && (
          <span
            className="pointer-events-none absolute -inset-1 border-2 border-sky-200/70"
            style={{ ...shape, animation: 'turn-badge-ping 1.8s ease-out infinite' }}
          />
        )}
      </button>
      {open && ctl && <StepSelectDialog onClose={() => setOpen(false)} />}
    </>
  );
}
