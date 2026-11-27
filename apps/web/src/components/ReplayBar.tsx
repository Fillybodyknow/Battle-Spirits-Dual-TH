/**
 * แถบควบคุม Replay (Casual Match): แทนแถบคำสั่งกลางกระดาน (PromptBar) ระหว่างดู Replay ไม่บังมือ/สนาม
 * เล่น/หยุด, ทีละ action, ย้อน, ความเร็ว, เลื่อนไปจุดใดก็ได้, เปิดไพ่ทั้งสองฝั่ง
 * เล่นอัตโนมัติ = รอแอนิเมชันของ action ก่อนหน้าจบ (isFxBlocking) แล้วเว้นช่วงตามความเร็ว (x4 = ไม่มีแอนิเมชัน)
 */
import { useEffect } from 'react';
import { exitReplay, isFxBlocking, replaySeek, replaySet, replayStep, useGame } from '../store';
import { PHASES, playerLabel } from '../format';
import { Icon } from './Icon';

const GAP: Record<1 | 2 | 4, number> = { 1: 700, 2: 250, 4: 40 };

const BTN =
  'flex h-9 min-w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-slate-800/90 px-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-40';

export function ReplayBar() {
  const replay = useGame((s) => s.replay);
  const busy = useGame((s) => isFxBlocking(s.fx.filter((f) => f.kind !== 'result')) || s.fx.some((f) => f.kind === 'banner'));
  const turn = useGame((s) => s.state.turn);
  const turnPlayer = useGame((s) => s.state.turnPlayer);
  const phase = useGame((s) => s.state.phase);
  const winner = useGame((s) => s.state.winner);

  // เล่นอัตโนมัติ
  const playing = !!replay?.playing;
  const index = replay?.index ?? 0;
  const speed = replay?.speed ?? 1;
  useEffect(() => {
    if (!playing || (busy && speed !== 4)) return;
    const t = setTimeout(() => {
      if (!replayStep()) replaySet({ playing: false });
    }, GAP[speed]);
    return () => clearTimeout(t);
  }, [playing, busy, index, speed]);

  if (!replay) return null;
  const total = replay.data.actions.length;
  const atEnd = replay.index >= total;
  const pause = () => replaySet({ playing: false });
  const phaseLabel = PHASES.find((p) => p.id === phase)?.label ?? phase;
  return (
    <div className="flex min-h-[52px] items-center gap-2 rounded-xl border border-sky-300/40 bg-slate-950/85 px-3 py-1.5 shadow-lg">
      <span className="shrink-0 rounded bg-sky-500/25 px-2 py-0.5 text-xs font-black tracking-widest text-sky-200">REPLAY</span>
      <span className="w-48 shrink-0 truncate text-sm text-slate-200">
        {winner && atEnd ? (
          <b className="text-yellow-300">{playerLabel(winner)} ชนะ</b>
        ) : (
          <>
            เทิร์น <b className="text-white">{turn}</b> · {playerLabel(turnPlayer)} · {phaseLabel}
          </>
        )}
      </span>
      <button type="button" className={BTN} title="กลับไปเริ่มต้น" onClick={() => (pause(), replaySeek(0))} disabled={replay.index === 0}>
        <Icon name="restart" />
      </button>
      <button type="button" className={BTN} title="ย้อนกลับ 1 ขั้น" onClick={() => (pause(), replaySeek(replay.index - 1))} disabled={replay.index === 0}>
        <Icon name="back" />
      </button>
      <button
        type="button"
        className={`${BTN} w-16 bg-sky-600/90 hover:bg-sky-500`}
        disabled={atEnd && !replay.playing}
        onClick={() => replaySet({ playing: !replay.playing })}
      >
        {replay.playing ? 'หยุด' : 'เล่น'}
      </button>
      <button type="button" className={BTN} title="ไปข้างหน้า 1 ขั้น" onClick={() => (pause(), replayStep())} disabled={atEnd || busy}>
        <Icon name="chevron" />
      </button>
      <button type="button" className={`${BTN} w-11`} title="ความเร็ว (x4 = ไม่มีแอนิเมชัน)" onClick={() => replaySet({ speed: replay.speed === 1 ? 2 : replay.speed === 2 ? 4 : 1 })}>
        x{replay.speed}
      </button>
      <input
        type="range"
        min={0}
        max={total}
        value={replay.index}
        onChange={(e) => (pause(), replaySeek(Number(e.target.value)))}
        className="min-w-24 flex-1 accent-sky-400"
        title="เลื่อนไปยังจุดที่ต้องการ"
      />
      <span className="w-16 shrink-0 text-center text-xs text-slate-400">
        {replay.index}/{total}
      </span>
      <button
        type="button"
        className={`${BTN} ${replay.reveal ? 'bg-amber-600/80 hover:bg-amber-500' : ''}`}
        title="แสดงการ์ดในมือ/เบิร์สของทั้งสองฝั่ง"
        onClick={() => replaySet({ reveal: !replay.reveal })}
      >
        <Icon name="eye" className="mr-1" />
        {replay.reveal ? 'เปิดไพ่' : 'ปิดไพ่'}
      </button>
      <button type="button" className={`${BTN} gap-1 bg-rose-700/80 px-3 hover:bg-rose-600`} title="ออกจาก Replay" onClick={() => exitReplay()}>
        <Icon name="close" />
        ออก
      </button>
    </div>
  );
}
