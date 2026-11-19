/**
 * หน้าจอบทเรียนบนกระดาน: ไฟส่องจุดที่ต้องกด (จอมืดยกเว้นช่องนั้น) + กล่องข้อความ
 * ระหว่างบทเรียนบล็อกการกด/ลากทุกที่ ยกเว้นจุดที่ขั้นนั้นให้ทำ และกล่องข้อความ
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store';
import { BTN } from '../components/Modal';
import { LESSONS } from './lessons';
import { currentStep, endTutorial, nextStep, startTutorial, useTutorial } from './tutorial';

type Box = { x: number; y: number; w: number; h: number };
const PAD = 8;

/** ตำแหน่งบนจอของทุก element ที่ตรงกับ selector */
function rectsOf(selectors: string[]): Box[] {
  return selectors.flatMap((q) =>
    [...document.querySelectorAll(q)].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 })),
  );
}
const same = (a: Box[], b: Box[]) => a.length === b.length && a.every((r, i) => Math.abs(r.x - b[i]!.x) < 1 && Math.abs(r.y - b[i]!.y) < 1 && Math.abs(r.w - b[i]!.w) < 1 && Math.abs(r.h - b[i]!.h) < 1);

const BLOCKED = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'dragstart', 'contextmenu', 'keydown'] as const;

/** ระหว่างบทเรียน: การกดที่ไม่ได้อยู่ในจุดที่ขั้นนั้นให้ทำ ถูกกันไว้ (capture ก่อนถึงตัวเกม) */
function useInputLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-tutorial-ui]')) return;
      const t = useTutorial.getState();
      const st = currentStep(t);
      // เล่นอิสระ: กดได้ทุกที่ ยกเว้นปุ่มมุมซ้ายบน (หน้าหลัก/ย้อน/เกมใหม่: ทำให้บทเรียนเพี้ยน)
      if (st?.free && t.phase !== 'done') {
        if (!target?.closest('[data-tutorial-lock]')) return;
      } else if (e.type !== 'keydown' && t.phase === 'show' && st?.expect && target) {
        const sels = [...(st.focus?.(t.ids) ?? []), ...(st.allow?.(t.ids) ?? [])];
        if (sels.some((q) => [...document.querySelectorAll(q)].some((el) => el.contains(target)))) return;
      }
      e.stopPropagation();
      e.preventDefault();
    };
    for (const type of BLOCKED) document.addEventListener(type, handler, true);
    return () => {
      for (const type of BLOCKED) document.removeEventListener(type, handler, true);
    };
  }, [active]);
}

export function TutorialOverlay() {
  const t = useTutorial();
  const state = useGame((s) => s.state);
  const st = currentStep(t);
  const [holes, setHoles] = useState<Box[]>([]);
  useInputLock(!!t.lesson);

  // ตำแหน่งจุดที่ส่องไฟ: ตามทุกเฟรม (การ์ดขยับ / แผงเปิดตามมา)
  useEffect(() => {
    if (!t.lesson) return;
    let raf = 0;
    const loop = () => {
      const tt = useTutorial.getState();
      const s = currentStep(tt);
      const next = tt.phase === 'show' && !s?.free && s?.focus ? rectsOf(s.focus(tt.ids)) : [];
      setHoles((prev) => (same(prev, next) ? prev : next));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [t.lesson]);

  if (!t.lesson) return null;
  const lesson = t.lesson;
  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const nextLesson = LESSONS[idx + 1];
  const text =
    t.phase === 'done'
      ? t.failed
        ? 'ยังไม่ผ่าน: Life ของเราหมดก่อน · ลองใหม่อีกครั้งได้เลย'
        : `จบ${lesson.title} ✓`
      : st
        ? typeof st.text === 'function'
          ? st.text(state, t.ids)
          : st.text
        : '';
  const free = !!st?.free && t.phase !== 'done';
  const dim = t.phase === 'show' && !free;

  // กล่องข้อความ: อยู่ฝั่งตรงข้ามจุดที่ส่องไฟ (ไม่บัง)
  const vh = typeof window !== 'undefined' ? window.innerHeight : 860;
  const cy = holes.length ? holes.reduce((n, r) => n + r.y + r.h / 2, 0) / holes.length : null;
  // เล่นอิสระ: กล่องย่อไว้ด้านบน ไม่บังกระดาน
  const boxPos = free
    ? { top: 58, transform: 'translateX(-50%)' }
    : cy === null
      ? { top: '50%', transform: 'translate(-50%, -50%)' }
      : cy > vh * 0.5
        ? { top: 76, transform: 'translateX(-50%)' }
        : { bottom: 130, transform: 'translateX(-50%)' };

  return createPortal(
    <>
      {/* จอมืด + ช่องส่องไฟ */}
      {dim && (
        <svg className="pointer-events-none fixed inset-0 z-[70] h-full w-full" style={{ animation: 'fx-fade-in 0.2s ease-out both' }}>
          <defs>
            <mask id="tutorial-holes">
              <rect width="100%" height="100%" fill="white" />
              {holes.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={12} fill="black" />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={holes.length ? 'rgba(2,6,23,0.62)' : 'rgba(2,6,23,0.45)'} mask="url(#tutorial-holes)" />
          {holes.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={12} fill="none" stroke="#fde047" strokeWidth={3} style={{ filter: 'drop-shadow(0 0 8px rgba(253,224,71,0.9))', animation: 'tutorial-pulse 1.4s ease-in-out infinite' }} />
          ))}
        </svg>
      )}
      {/* กล่องข้อความ */}
      <div
        data-tutorial-ui
        className={`hud-panel fixed left-1/2 z-[80] flex flex-col rounded-2xl border border-yellow-300/40 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${free ? 'w-[min(460px,92vw)] gap-1.5 p-2.5 opacity-95' : 'w-[min(600px,92vw)] gap-3 p-4'}`}
        style={{ ...boxPos, animation: 'fx-fade-in 0.2s ease-out both' }}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-yellow-300 px-1.5 py-0.5 font-black text-slate-900">บทเรียน</span>
          <span className="font-bold text-yellow-100">{lesson.title}</span>
          <span className="flex-1" />
          {t.phase !== 'done' && (
            <span className="text-slate-400">
              {t.step + 1}/{lesson.steps.length}
            </span>
          )}
        </div>
        <p className={`leading-relaxed font-semibold whitespace-pre-line text-white ${free ? 'text-[13px]' : 'text-[15px]'}`}>{text}</p>
        <div className="flex items-center gap-2">
          <button type="button" className={`${BTN.ghost} !px-2 !py-1 text-xs`} onClick={() => endTutorial()}>
            {t.phase === 'done' ? 'กลับหน้าหลัก' : 'ออกจากบทเรียน'}
          </button>
          <span className="flex-1" />
          {t.phase === 'show' && st && !st.expect && (
            <button type="button" className={`${BTN.primary} px-6`} onClick={nextStep}>
              ถัดไป ▸
            </button>
          )}
          {t.phase === 'show' && st?.expect && <span className="text-xs font-bold text-yellow-200">ทำตามขั้นตอนบนกระดาน (จุดที่มีกรอบเหลือง)</span>}
          {t.phase === 'wait' && !free && <span className="text-xs text-slate-400">กำลังเล่น…</span>}
          {free && <span className="text-xs font-bold text-yellow-200">เล่นได้เต็มที่</span>}
          {t.phase === 'done' &&
            (t.failed ? (
              <button type="button" className={`${BTN.primary} px-6`} onClick={() => startTutorial(lesson.id)}>
                ลองอีกครั้ง ▸
              </button>
            ) : nextLesson ? (
              <button type="button" className={`${BTN.primary} px-6`} onClick={() => startTutorial(nextLesson.id)}>
                {nextLesson.title} ▸
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-300">เรียนครบทุกบทแล้ว!</span>
            ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
