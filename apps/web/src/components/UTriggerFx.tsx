import { useEffect, useLayoutEffect, useRef } from 'react';
import { db, layoutRect, UT_MS, uTriggerBonusAt, uTriggerDuration, uTriggerExitAt, uTriggerStampAt, type Fx, type Rect } from '../store';
import { CardBack, CardFace } from './CardFace';

type UFx = Extract<Fx, { kind: 'uTrigger' }>;

const CARD_W = 150;
const CARD_H = 210;

/** ตำแหน่งในฉาก: อัลติเมทต้นเหตุทางซ้าย การ์ดที่เปิดทางขวา (Double = 2 ใบเรียงกัน) */
function layout(n: number) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const gap = 34;
  const total = CARD_W * (n + 1) + gap * n + 40;
  const left = cx - total / 2;
  const top = cy - CARD_H / 2 + 10;
  return {
    cx,
    cy,
    top,
    ult: { x: left, y: top, w: CARD_W, h: CARD_H },
    cards: Array.from({ length: n }, (_, i) => ({ x: left + CARD_W + 40 + gap + i * (CARD_W + gap), y: top, w: CARD_W, h: CARD_H })),
    vsX: left + CARD_W + 20 + gap / 2,
  };
}

/** translate/scale จากกล่อง slot ไปทับกล่อง to (ใช้กับ transform เท่านั้น) */
function delta(slot: Rect, to: Rect | null, extra = ''): string {
  if (!to) return `translate(0px, 0px) scale(1) ${extra}`;
  const dx = to.x + to.w / 2 - (slot.x + slot.w / 2);
  const dy = to.y + to.h / 2 - (slot.y + slot.h / 2);
  return `translate(${dx}px, ${dy}px) scale(${Math.max(0.2, to.w / slot.w)}) ${extra}`;
}

/** ประกายทองกระจายออกจากจุดกลาง (ตอน HIT) */
const SPARKS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);

/**
 * ฉาก U Trigger: เปิดฉาก (ป้าย U TRIGGER + อัลติเมทลอยมาทางซ้าย) → การ์ดใบบนสุดเด็คคู่แข่งบินมาพลิกหงาย →
 * ป้ายเทียบคอสต์ → ตรา HIT! (ทอง + ประกาย) / GUARD (โล่ฟ้า + การ์ดมืดลง) → ป้าย CRITICAL HIT / DOUBLE HIT → การ์ดบินลงแทรช
 * ขยับเฉพาะ transform/opacity (ลื่นบนมือถือ)
 */
export function UTriggerFx({ fx, onDone }: { fx: UFx; onDone: () => void }) {
  const n = fx.cards.length;
  const L = useRef(layout(n)).current;
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const bonus = !!fx.bonus;
  const exitAt = uTriggerExitAt(n, bonus);

  useEffect(() => {
    const t = setTimeout(() => done.current(), fx.delay + uTriggerDuration(n, bonus));
    return () => clearTimeout(t);
  }, [fx.delay, n, bonus]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const d0 = fx.delay;
    const q = (sel: string) => el.querySelector<HTMLElement>(sel);
    const qa = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)];
    const anims: Animation[] = [];
    // เข้า = fill both (ก่อนเริ่มซ่อนตามคีย์เฟรมแรก) · ออก/สะเทือน = ห้ามเติมย้อนหลัง (ไม่งั้นคีย์เฟรมแรกของมันทับภาพตั้งแต่ต้นฉาก)
    const run = (node: HTMLElement | null, frames: Keyframe[], at: number, duration: number, easing = 'cubic-bezier(.2,.8,.3,1)', fill: FillMode = 'both') => {
      if (node) anims.push(node.animate(frames, { delay: d0 + at, duration, easing, fill }));
    };
    const out = (node: HTMLElement | null, frames: Keyframe[], at: number, duration: number, easing = 'ease-in') => run(node, frames, at, duration, easing, 'forwards');
    const total = uTriggerDuration(n, bonus);
    const fieldUlt = layoutRect(document.querySelector(`[data-field-card="${fx.cardId}"] > div`));
    const deck = layoutRect(document.querySelector(`[data-deck="${fx.owner}"]`));
    const trash = layoutRect(document.querySelector(`[data-trash="${fx.owner}"]`));

    // พื้นมืด + ป้ายหัวเรื่อง
    run(q('[data-ut="dim"]'), [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], 0, total, 'linear');
    run(q('[data-ut="title"]'), [{ opacity: 0, transform: 'translateX(-50%) scale(1.6)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], 0, UT_MS.intro + 80, 'cubic-bezier(.2,1.4,.4,1)');
    out(q('[data-ut="title"]'), [{ opacity: 1 }, { opacity: 0 }], exitAt, UT_MS.exit);
    run(q('[data-ut="ring"]'), [{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)' }, { opacity: 0.9, transform: 'translate(-50%, -50%) scale(1) rotate(120deg)', offset: 0.3 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.25) rotate(360deg)' }], 0, total, 'linear');

    // อัลติเมทต้นเหตุ: จากบนสนามลอยมาทางซ้าย แล้วกลับที่เดิมตอนจบ
    const ultEl = q('[data-ut="ult"]');
    run(ultEl, [{ transform: delta(L.ult, fieldUlt), opacity: 0.4 }, { transform: 'translate(0px, 0px) scale(1)', opacity: 1 }], 0, UT_MS.intro);
    out(ultEl, [{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, { transform: delta(L.ult, fieldUlt), opacity: 0 }], exitAt, UT_MS.exit);
    run(q('[data-ut="ultCost"]'), [{ opacity: 0, transform: 'translateX(-50%) translateY(8px)' }, { opacity: 1, transform: 'translateX(-50%) translateY(0)' }], UT_MS.intro - 120, 260);
    out(q('[data-ut="ultCost"]'), [{ opacity: 1 }, { opacity: 0 }], exitAt, 200);

    fx.cards.forEach((c, i) => {
      const slot = L.cards[i]!;
      const start = UT_MS.intro + i * UT_MS.per;
      const card = q(`[data-ut="card${i}"]`);
      // บินออกจากเด็ค → ค้าง → (จบ) ลงแทรช
      run(card, [{ transform: delta(slot, deck), opacity: 0 }, { transform: delta(slot, deck), opacity: 1, offset: 0.05 }, { transform: 'translate(0px, -26px) scale(1.04)', offset: 0.7 }, { transform: 'translate(0px, 0px) scale(1)', opacity: 1 }], start, UT_MS.flip + 80);
      out(card, [{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, { transform: delta(slot, trash, 'rotate(18deg)'), opacity: 0 }], exitAt + i * 70, UT_MS.exit - 40, 'cubic-bezier(.5,0,.8,.6)');
      // พลิกหงาย (ด้านหลัง → ด้านหน้า)
      run(q(`[data-ut="flip${i}"]`), [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.35 }, { transform: 'rotateY(0deg)' }], start, UT_MS.flip + 120, 'cubic-bezier(.3,.7,.4,1)');
      // เทียบคอสต์
      run(q(`[data-ut="cmp${i}"]`), [{ opacity: 0, transform: 'translateX(-50%) scale(0.6)' }, { opacity: 1, transform: 'translateX(-50%) scale(1.12)', offset: 0.6 }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], start + UT_MS.compare, 260);
      out(q(`[data-ut="cmp${i}"]`), [{ opacity: 1 }, { opacity: 0 }], exitAt, 200);
      const stampAt = uTriggerStampAt(i);
      // ตรา HIT! / GUARD
      run(q(`[data-ut="stamp${i}"]`), [{ opacity: 0, transform: 'translate(-50%, -50%) scale(2.6) rotate(-14deg)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(0.92) rotate(-10deg)', offset: 0.55 }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-10deg)' }], stampAt, 300, 'cubic-bezier(.3,1.5,.5,1)');
      out(q(`[data-ut="stamp${i}"]`), [{ opacity: 1 }, { opacity: 0 }], exitAt, 160);
      if (c.hit) {
        run(q(`[data-ut="glow${i}"]`), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0.75 }], stampAt, exitAt - stampAt, 'ease-out');
        run(q(`[data-ut="burst${i}"]`), [{ opacity: 1, transform: 'translate(-50%, -50%) scale(0.2)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(2.4)' }], stampAt, 620, 'cubic-bezier(.1,.7,.3,1)');
        qa(`[data-ut="spark${i}"]`).forEach((sp, k) => {
          const a = SPARKS[k]!;
          const r = 120 + (k % 3) * 26;
          run(sp, [{ opacity: 1, transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)' }, { opacity: 0, transform: `translate(-50%, -50%) translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(0.3)` }], stampAt + 20, 560, 'cubic-bezier(.1,.8,.3,1)');
        });
        // สะเทือนเล็กน้อยตอนตราลง
        run(card, [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(-6px, 3px)' }, { transform: 'translate(5px, -3px)' }, { transform: 'translate(0px, 0px)' }], stampAt + 120, 180, 'linear', 'none');
      } else {
        run(q(`[data-ut="shade${i}"]`), [{ opacity: 0 }, { opacity: 0.6 }], stampAt, 260, 'ease-out');
      }
    });

    // Critical Hit / Double Hit: แถบพาดกลางจอ
    if (bonus) {
      const at = uTriggerBonusAt(n);
      run(q('[data-ut="bonus"]'), [{ opacity: 0, transform: 'translate(-50%, -50%) scaleX(0)' }, { opacity: 1, transform: 'translate(-50%, -50%) scaleX(1)', offset: 0.35 }, { opacity: 1, transform: 'translate(-50%, -50%) scaleX(1)', offset: 0.85 }, { opacity: 0, transform: 'translate(-50%, -50%) scaleX(1.05)' }], at, UT_MS.bonus + 120, 'cubic-bezier(.2,.9,.3,1)');
      run(q('[data-ut="bonusText"]'), [{ transform: 'scale(1.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.4 }, { transform: 'scale(1.04)', opacity: 1 }], at + 60, UT_MS.bonus - 60, 'cubic-bezier(.3,1.5,.5,1)');
    }
    return () => anims.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ultDef = db.get(fx.cardNo);
  const title = n > 1 ? 'DOUBLE U TRIGGER' : 'U TRIGGER';
  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[44]">
      <div data-ut="dim" className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, rgba(40,26,4,0.72) 0%, rgba(2,6,23,0.86) 70%)' }} />
      {/* วงเวทสีทองหลังฉาก */}
      <div
        data-ut="ring"
        className="absolute rounded-full opacity-0"
        style={{ left: L.cx, top: L.cy + 10, width: 520, height: 520, border: '3px solid rgba(251,191,36,0.55)', boxShadow: '0 0 60px rgba(251,191,36,0.35), inset 0 0 60px rgba(251,191,36,0.25)', outline: '1px dashed rgba(253,230,138,0.5)', outlineOffset: -28 }}
      />
      {/* ป้ายหัวเรื่อง */}
      <div data-ut="title" className="absolute flex flex-col items-center opacity-0" style={{ left: L.cx, top: L.top - 92 }}>
        <div className="flex items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 text-2xl font-black text-slate-900 shadow-[0_0_18px_rgba(251,191,36,0.8)] ring-2 ring-amber-100">
            U
          </span>
          <span className="bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-4xl font-black tracking-wider text-transparent italic drop-shadow-[0_3px_0_rgba(0,0,0,0.6)]">
            {title}
          </span>
        </div>
        <span className="mt-1 rounded-full bg-black/60 px-3 py-0.5 text-xs font-bold text-amber-100 ring-1 ring-amber-300/40">
          {ultDef.name} · คอสต์ต่ำกว่า {fx.ultCost} = ฮิต
        </span>
      </div>
      {/* อัลติเมทต้นเหตุ */}
      <div data-ut="ult" className="absolute rounded-xl shadow-[0_0_30px_rgba(251,191,36,0.55)] ring-2 ring-amber-300" style={{ left: L.ult.x, top: L.ult.y, width: CARD_W, height: CARD_H }}>
        <CardFace def={ultDef} />
        <span data-ut="ultCost" className="absolute -bottom-9 left-1/2 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-3 py-0.5 text-sm font-black whitespace-nowrap text-slate-900 opacity-0 shadow ring-1 ring-amber-100">
          คอสต์ {fx.ultCost}
        </span>
      </div>
      <span className="absolute -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-amber-200/80 italic" style={{ left: L.vsX, top: L.cy + 10 }}>
        ▶
      </span>
      {fx.cards.map((c, i) => {
        const slot = L.cards[i]!;
        return (
          <div key={c.cardId}>
            <div data-ut={`card${i}`} className="absolute opacity-0" style={{ left: slot.x, top: slot.y, width: CARD_W, height: CARD_H, perspective: 900 }}>
              <div data-ut={`flip${i}`} className="relative h-full w-full" style={{ transformStyle: 'preserve-3d', transform: 'rotateY(180deg)' }}>
                <div className="absolute inset-0 overflow-hidden rounded-xl" style={{ backfaceVisibility: 'hidden' }}>
                  <CardFace def={db.get(c.cardNo)} />
                  <div data-ut={`shade${i}`} className="absolute inset-0 bg-slate-950 opacity-0" />
                </div>
                <div className="absolute inset-0 overflow-hidden rounded-xl" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <CardBack />
                </div>
              </div>
              {/* ขอบทองเรืองตอนฮิต */}
              {c.hit && <div data-ut={`glow${i}`} className="absolute -inset-1 rounded-2xl opacity-0 ring-4 ring-amber-300 shadow-[0_0_36px_10px_rgba(251,191,36,0.65)]" />}
            </div>
            {/* เทียบคอสต์ */}
            <span
              data-ut={`cmp${i}`}
              className={`absolute rounded-full px-3 py-0.5 text-sm font-black whitespace-nowrap opacity-0 shadow ring-1 ${c.hit ? 'bg-emerald-400 text-slate-900 ring-emerald-100' : 'bg-slate-700 text-slate-100 ring-slate-400'}`}
              style={{ left: slot.x + CARD_W / 2, top: slot.y + CARD_H + 14 }}
            >
              คอสต์ {c.cost} {c.hit ? '<' : '≥'} {fx.ultCost}
            </span>
            {c.hit && (
              <>
                <div
                  data-ut={`burst${i}`}
                  className="absolute rounded-full opacity-0"
                  style={{ left: slot.x + CARD_W / 2, top: slot.y + CARD_H / 2, width: 220, height: 220, background: 'radial-gradient(circle, rgba(254,243,199,0.95) 0%, rgba(251,191,36,0.6) 35%, rgba(251,191,36,0) 70%)' }}
                />
                {SPARKS.map((_, k) => (
                  <div
                    key={k}
                    data-ut={`spark${i}`}
                    className="absolute h-3 w-3 rotate-45 rounded-sm bg-amber-200 opacity-0 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
                    style={{ left: slot.x + CARD_W / 2, top: slot.y + CARD_H / 2 }}
                  />
                ))}
              </>
            )}
            {/* ตราผล */}
            <div data-ut={`stamp${i}`} className="absolute opacity-0" style={{ left: slot.x + CARD_W / 2, top: slot.y + CARD_H / 2 }}>
              {c.hit ? (
                <span className="block text-5xl font-black tracking-tight text-amber-300 italic" style={{ WebkitTextStroke: '3px #451a03', textShadow: '0 0 18px rgba(251,191,36,0.9), 0 5px 0 #78350f' }}>
                  HIT!
                </span>
              ) : (
                <span className="flex flex-col items-center">
                  <svg viewBox="0 0 24 24" className="h-16 w-16 drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]">
                    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="rgba(14,165,233,0.85)" stroke="#e0f2fe" strokeWidth="1.5" />
                    <path d="M8.5 12.5 11 15l4.5-5" fill="none" stroke="#e0f2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-3xl font-black tracking-wider text-sky-200 italic" style={{ WebkitTextStroke: '2px #0c4a6e' }}>
                    GUARD
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })}
      {/* Critical Hit / Double Hit */}
      {bonus && (
        <div
          data-ut="bonus"
          className="absolute flex h-24 items-center justify-center opacity-0"
          style={{ left: L.cx, top: L.cy + 10, width: Math.min(window.innerWidth, 980), background: 'linear-gradient(90deg, rgba(127,29,29,0) 0%, rgba(185,28,28,0.92) 18%, rgba(234,88,12,0.95) 50%, rgba(185,28,28,0.92) 82%, rgba(127,29,29,0) 100%)', boxShadow: '0 0 40px rgba(251,146,60,0.6)' }}
        >
          <span data-ut="bonusText" className="text-5xl font-black tracking-wider text-amber-100 italic" style={{ WebkitTextStroke: '2px #7c2d12', textShadow: '0 0 20px rgba(254,215,170,0.9), 0 4px 0 #7c2d12' }}>
            {fx.bonus === 'double' ? 'DOUBLE HIT!' : 'CRITICAL HIT!'}
          </span>
        </div>
      )}
    </div>
  );
}
