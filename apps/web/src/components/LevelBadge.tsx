/**
 * แสดงเลเวลผู้เล่น: ป้าย Lv / หลอด EXP / แผง EXP ที่ได้ในหน้าผลการดวล (progression/level.ts)
 */
import { useEffect, useState } from 'react';
import type { PlayerId } from '@bs/engine';
import { levelOf, useLevel, type ExpAward } from '../progression/level';
import { useGame } from '../store';
import { sfx } from '../sfx';

/** ป้าย "Lv.N" เล็ก ๆ */
export function LevelChip({ level, className = '' }: { level: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-baseline gap-0.5 rounded bg-gradient-to-b from-amber-200 to-amber-400 px-1.5 leading-tight font-black text-slate-900 shadow ${className}`}>
      <span className="text-[0.65em]">Lv.</span>
      {level}
    </span>
  );
}

/** เลเวลของเรา (ป้ายโปรไฟล์หน้าหลัก): ป้าย Lv + หลอด EXP */
export function MyLevel() {
  const exp = useLevel((s) => s.exp);
  const { level, into, need } = levelOf(exp);
  return (
    <span className="mt-1 flex items-center gap-2">
      <LevelChip level={level} className="text-sm" />
      <span className="relative block h-1.5 w-28 overflow-hidden rounded-full bg-slate-700/80" title={need ? `EXP ${into}/${need}` : 'เลเวลสูงสุด'}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-300 to-lime-300" style={{ width: need ? `${(into / need) * 100}%` : '100%' }} />
      </span>
    </span>
  );
}

/** เลเวลของที่นั่งนี้บนกระดาน (null = ไม่แสดง: บอท / สองคนเครื่องเดียว / ห้องจากเครื่องเวอร์ชันเก่า) */
export function useSeatLevel(p: PlayerId): number | null {
  const online = useGame((s) => s.online);
  const botSeat = useGame((s) => s.botSeat);
  const exp = useLevel((s) => s.exp);
  const mine = levelOf(exp).level;
  if (online) return online.levels?.[p] ?? (!online.spectator && p === online.me ? mine : null);
  if (botSeat) return p === botSeat ? null : mine;
  return null;
}

/**
 * แผง EXP ในหน้าผลการดวล: +EXP แล้วหลอดวิ่งจากค่าเดิมไปค่าใหม่ (ผ่านหลายเลเวลได้) · ขึ้นเลเวล = ป้าย LEVEL UP!
 */
export function ExpGain({ award }: { award: ExpAward }) {
  const from = levelOf(award.before);
  const to = levelOf(award.after);
  // เฟรมของหลอด: เลเวลที่กำลังแสดง + สัดส่วน (เริ่มที่ค่าเดิม)
  const [shown, setShown] = useState({ level: from.level, pct: from.need ? from.into / from.need : 1, anim: false });
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (award.gained <= 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 500;
    // เต็มหลอดทีละเลเวล แล้วเริ่มหลอดใหม่
    for (let lv = from.level; lv < to.level; lv++) {
      const at = t;
      timers.push(setTimeout(() => setShown({ level: lv, pct: 1, anim: true }), at));
      timers.push(
        setTimeout(() => {
          setShown({ level: lv + 1, pct: 0, anim: false });
          setUp(true);
          sfx('activate');
        }, at + 650),
      );
      t += 750;
    }
    timers.push(setTimeout(() => setShown({ level: to.level, pct: to.need ? to.into / to.need : 1, anim: true }), t));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [award.key]);
  return (
    <div className="flex w-[min(80vw,520px)] flex-col gap-1.5 rounded-xl bg-black/60 px-5 py-3 ring-1 ring-white/10" style={{ animation: 'fx-slide-up 0.45s 0.2s ease-out both' }}>
      <div className="flex items-center gap-3">
        <LevelChip level={shown.level} className="text-lg" />
        {up && (
          <span className="text-lg font-black tracking-wide text-yellow-300 italic drop-shadow-[0_0_10px_rgba(250,204,21,0.7)]" style={{ animation: 'fx-slide-up 0.35s ease-out both' }}>
            LEVEL UP!
          </span>
        )}
        <span className="ml-auto text-2xl font-black text-lime-300 tabular-nums">+{award.gained} EXP</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-700">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-300 to-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.7)]"
          style={{ width: `${shown.pct * 100}%`, transition: shown.anim ? 'width 0.6s ease-out' : 'none' }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{award.note}</span>
        <span>{to.need ? `อีก ${to.need - to.into} EXP ถึง Lv.${to.level + 1}` : 'เลเวลสูงสุด'}</span>
      </div>
    </div>
  );
}
