import { useEffect } from 'react';
import { controls, isFxBlocking, useGame } from '../store';
import { sfx } from '../sfx';
import { CardBack } from './CardFace';
import { currentStep, useTutorial } from '../tutorial/tutorial';

/**
 * Draw Step แบบกดจั่วเอง: การ์ดใบบนสุดของเด็คลอยขึ้นมากลางจอ กดเพื่อจั่ว
 * แสดงหลังป้ายสเต็ปและแอนิเมชันก่อนหน้าเล่นจบ · ปิดแอนิเมชันอยู่ = จั่วให้ทันที
 * การ์ดที่จั่วบินออกจากตำแหน่งนี้ไปที่มือ (eventsToFx อ่านตำแหน่งจาก [data-draw-prompt])
 */
export function DrawPrompt() {
  const player = useGame((s) => s.state.awaitingDraw);
  const online = useGame((s) => s.online);
  const animations = useGame((s) => s.animations);
  const busy = useGame((s) => s.fx.some((f) => f.kind === 'banner') || isFxBlocking(s.fx));
  const deckLeft = useGame((s) => (player ? s.state.players[player].deck.length : 0));
  const mine = !!player && controls({ online }, player);
  // บทเรียน: แสดงเฉพาะขั้นที่สอนจั่ว (ขั้นอื่นไม่บังคำอธิบาย)
  const tutorialHide = useTutorial((t) => !!t.lesson && !currentStep(t)?.draw);

  const draw = () => {
    if (!player) return;
    sfx('draw');
    useGame.getState().dispatch({ type: 'drawStep', player });
  };

  // ปิดแอนิเมชัน: ไม่ต้องรอกด
  useEffect(() => {
    if (mine && !animations) draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, animations, player]);

  if (!mine || busy || !animations || tutorialHide) return null;
  return (
    <div className="fixed inset-0 z-[45] flex cursor-pointer items-center justify-center bg-black/40" onClick={draw} style={{ animation: 'fx-fade-in 0.25s ease-out both' }}>
      <div className="flex flex-col items-center gap-5">
        <div data-draw-prompt className="relative h-[238px] w-[170px]" style={{ animation: 'draw-rise 0.65s cubic-bezier(.2,.9,.3,1.15) both' }}>
          {/* แสงรอบการ์ด */}
          <div className="absolute -inset-10 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle, rgba(125,211,252,0.55), transparent 65%)', animation: 'draw-glow 1.8s ease-in-out infinite' }} />
          <div className="relative h-full w-full" style={{ animation: 'draw-bob 2.2s ease-in-out 0.65s infinite' }}>
            <div className="h-full w-full rounded-lg shadow-[0_0_0_2px_rgba(186,230,253,0.9),0_0_28px_rgba(56,189,248,0.8),0_20px_40px_rgba(0,0,0,0.6)] transition hover:scale-105">
              <CardBack />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center" style={{ animation: 'fx-slide-up 0.4s ease-out 0.35s both' }}>
          <span className="text-3xl font-black tracking-wider text-white italic [text-shadow:0_0_18px_rgba(56,189,248,0.9)]">DRAW</span>
          <span className="text-sm font-semibold text-sky-200">กดเพื่อจั่วการ์ด · เหลือในเด็ค {deckLeft} ใบ</span>
        </div>
      </div>
    </div>
  );
}
