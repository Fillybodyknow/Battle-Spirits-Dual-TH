import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { opponentOf } from '@bs/engine';
import { cardArt } from '../assets';
import { actingPlayer, chainEntries, viewPlayer, db, GHOST_MS, isFxBlocking, layoutRect, PLAY_HIT, useGame, type Fx, type Rect, hiddenFrom, COIN_MS } from '../store';
import { CardBack, CardFace } from './CardFace';
import { sfx } from '../sfx';
import { playerLabel } from '../format';

/** เรียก onDone เมื่อครบเวลา (ms = null → ไม่ปิดเอง) */
function useAutoDismiss(onDone: () => void, ms: number | null) {
  useEffect(() => {
    if (ms === null) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** พื้นที่กระดาน (ไม่รวมแผงรายละเอียดด้านขวา) */
const BOARD = 'fixed inset-y-0 left-0 right-[var(--sidebar)]';

// ---------------------------------------------------------------- banner

const BANNER_TONE = {
  turn: 'from-amber-500/0 via-amber-400/95 to-amber-500/0 text-slate-950',
  step: 'from-sky-600/0 via-sky-500/95 to-sky-600/0 text-white',
  burst: 'from-orange-600/0 via-orange-500/95 to-orange-600/0 text-white',
  win: 'from-yellow-500/0 via-yellow-300 to-yellow-500/0 text-slate-950',
};

function Banner({ fx, onDone }: { fx: Extract<Fx, { kind: 'banner' }>; onDone: () => void }) {
  const win = fx.tone === 'win';
  const showFx = useGame((s) => s.showFx);
  const shown = (fx.delay ?? 0) === 0;
  // นับเวลาปิดเมื่อป้ายแสดงจริงแล้ว (ป้ายที่มี delay ต้องรอแอนิเมชันก่อนหน้า เช่น โยนเหรียญ)
  useEffect(() => {
    if (!shown || win) return;
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => showFx(fx.id), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (shown && win) sfx('win');
  }, [shown, win]);
  if (!shown) return null;
  return (
    <div className={`${BOARD} z-50 flex items-center overflow-hidden ${win ? 'bg-black/70' : 'pointer-events-none'}`} onClick={onDone}>
      {win && (
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[160vmax] w-[160vmax]"
          style={{
            background: 'repeating-conic-gradient(from 0deg, rgba(250,204,21,0.22) 0deg 6deg, transparent 6deg 18deg)',
            maskImage: 'radial-gradient(circle, #000 0%, transparent 45%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 45%)',
            translate: '-50% -50%',
            animation: 'fx-rays 30s linear infinite',
          }}
        />
      )}
      <div
        className={`pointer-events-auto w-full bg-gradient-to-r py-4 shadow-[0_0_40px_rgba(0,0,0,0.6)] ${BANNER_TONE[fx.tone]}`}
        style={{ animation: win ? 'fx-slide-up 0.4s ease-out both' : 'fx-banner 1.4s cubic-bezier(.2,.8,.2,1) both' }}
      >
        <div className="flex flex-col items-center" style={{ transform: win ? undefined : 'skewX(12deg)' }}>
          <span className="text-4xl font-black tracking-wider italic drop-shadow" style={{ animation: 'fx-banner-text 0.6s ease-out both' }}>
            {fx.title}
          </span>
          {fx.sub && <span className="text-sm font-semibold opacity-80">{fx.sub}</span>}
          {win && <span className="mt-2 text-xs opacity-70">คลิกเพื่อปิด</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- summon cut-in

function SummonCutIn({ fx, onDone }: { fx: Extract<Fx, { kind: 'summon' }>; onDone: () => void }) {
  useAutoDismiss(onDone, fx.delay + 1900);
  const [shown, setShown] = useState(fx.delay === 0);
  useEffect(() => {
    if (fx.delay === 0) return;
    const t = setTimeout(() => setShown(true), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const card = useGame((s) => s.state.cards[fx.cardId]);
  if (!card || !shown) return null;
  const def = db.get(card.cardNo);
  const art = cardArt(def.cardNo);
  const main = def.colors[0] ?? 'red';
  const ray = { red: '#ef4444', purple: '#a855f7', green: '#22c55e', white: '#e2e8f0', yellow: '#facc15', blue: '#38bdf8' }[main];

  return (
    <div
      className={`${BOARD} z-50 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-black/75`}
      style={{ animation: 'fx-fade-in-out 1.9s ease both' }}
      onClick={onDone}
      title="คลิกเพื่อข้าม"
    >
      {/* แสงรัศมีหมุน */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-40"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${ray} 0deg 4deg, transparent 4deg 18deg)`,
          maskImage: 'radial-gradient(circle, black 0%, transparent 55%)',
          animation: 'fx-rays 12s linear infinite',
        }}
      />
      <div className="relative" style={{ animation: 'fx-summon-card 1.9s cubic-bezier(.2,.9,.2,1) both' }}>
        {art ? (
          <img src={art} alt={def.name} className="h-[52vh] max-h-[460px] rounded-xl shadow-[0_0_60px_rgba(255,255,255,0.35)]" draggable={false} />
        ) : (
          <div className="h-80 w-56">
            <CardFace def={def} level={fx.level} />
          </div>
        )}
      </div>
      <div className="relative mt-5 flex w-full flex-col items-center gap-1 bg-gradient-to-r from-transparent via-black/80 to-transparent py-3" style={{ animation: 'fx-slide-up 0.5s 0.3s ease-out both' }}>
        {def.levels.length > 0 && fx.level > 0 && (
          <div className="flex gap-1 text-xl text-yellow-300 drop-shadow">
            {Array.from({ length: fx.level }, (_, i) => (
              <span key={i}>★</span>
            ))}
          </div>
        )}
        <span className="text-3xl font-black tracking-wide text-white italic">{def.name}</span>
        <span className="text-sm text-slate-300">
          {def.type === 'nexus' ? 'วาง Nexus' : 'อัญเชิญ'} · Lv{fx.level}
          {fx.bp > 0 && <span className="ml-2 font-bold text-yellow-300">BP {fx.bp.toLocaleString()}</span>}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- effect toast

function ActivateToast({ fx, onDone }: { fx: Extract<Fx, { kind: 'activate' }>; onDone: () => void }) {
  useAutoDismiss(onDone, fx.delay + 3200);
  const card = useGame((s) => s.state.cards[fx.cardId]);
  const hover = useGame((s) => s.hover);
  if (!card) return null;
  const def = db.get(card.cardNo);
  return (
    <div
      className="pointer-events-auto flex w-full cursor-pointer gap-3 rounded-xl border border-yellow-300/50 bg-slate-950/95 p-2.5 shadow-2xl"
      style={{ animation: `fx-toast 3.2s ${fx.delay}ms ease both` }}
      onClick={onDone}
      onMouseEnter={() => hover(fx.cardId)}
      onMouseLeave={() => hover(null)}
    >
      <div className="h-24 w-17 shrink-0">
        <CardFace def={def} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold tracking-wide text-yellow-300">{fx.label}</div>
        <div className="text-sm font-bold text-white">{def.name}</div>
        <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-slate-300">{fx.text}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- floating numbers

function FloatText({ fx, onDone }: { fx: Extract<Fx, { kind: 'float' }>; onDone: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector(fx.anchor);
    if (!el) return onDone();
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top + r.height / 3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useAutoDismiss(onDone, 1400 + (fx.delay ?? 0));
  if (!pos) return null;
  return (
    <div
      className={`pointer-events-none fixed z-50 text-2xl font-black whitespace-nowrap [text-shadow:0_2px_0_#000,0_0_12px_rgba(0,0,0,0.8)] ${
        fx.tone === 'bad' ? 'text-rose-400' : 'text-emerald-300'
      }`}
      style={{ left: pos.x, top: pos.y, animation: `fx-float 1.4s ${fx.delay ?? 0}ms ease-out both` }}
    >
      {fx.text}
    </div>
  );
}

/** ชั้นเอฟเฟกต์ภาพ: ป้าย/cut-in ทีละอัน, ป๊อปอัปเอฟเฟกต์ซ้อนได้ 3 อัน, ตัวเลขลอยพร้อมกันได้ */
/** ลายบนเหรียญ: แกนคอร์หกเหลี่ยม + วงแหวน (ด้านทอง/ด้านเทาใช้ลายเดียวกัน ต่างแค่สี) */
function CoinFace({ gold }: { gold: boolean }) {
  const ink = gold ? '#7c4a03' : '#334155';
  const hi = gold ? '#fff7cc' : '#f8fafc';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-full"
      style={{
        background: gold
          ? 'radial-gradient(circle at 35% 30%, #fffbe6 0%, #fde68a 18%, #f5b72a 48%, #c27c0e 78%, #8a5208 100%)'
          : 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e2e8f0 18%, #a3afc0 50%, #6b7789 78%, #3f4856 100%)',
        boxShadow: `inset 0 0 0 6px ${gold ? '#b8740c' : '#5b6575'}, inset 0 0 0 10px ${hi}55, inset 0 0 0 16px ${gold ? '#d99a1e' : '#8792a3'}, inset 0 -10px 24px rgba(0,0,0,0.35)`,
        backfaceVisibility: 'hidden',
        transform: gold ? 'none' : 'rotateX(180deg)',
      }}
    >
      <svg viewBox="0 0 100 100" className="h-[62%] w-[62%]" style={{ filter: `drop-shadow(0 1px 0 ${hi})` }}>
        <circle cx="50" cy="50" r="44" fill="none" stroke={ink} strokeWidth="2.5" strokeDasharray="4 5" opacity="0.7" />
        <polygon points="50,14 81,32 81,68 50,86 19,68 19,32" fill="none" stroke={ink} strokeWidth="5" strokeLinejoin="round" />
        <polygon points="50,28 68,39 68,61 50,72 32,61 32,39" fill={ink} opacity="0.85" />
        <polygon points="50,36 60,42 50,48 40,42" fill={hi} opacity="0.8" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line key={a} x1="50" y1="14" x2="50" y2="6" stroke={ink} strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 50 50)`} />
        ))}
      </svg>
    </div>
  );
}

/** โยนเหรียญตอนเริ่มเกม: เหรียญลอยขึ้นหมุน แล้วตกลงกลางจอ แสดงผลว่าใครเริ่มก่อน */
function CoinToss({ fx, onDone }: { fx: Extract<Fx, { kind: 'coin' }>; onDone: () => void }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    sfx('swish');
    sfx('whoosh', 250);
    const land = setTimeout(() => {
      setLanded(true);
      sfx('impact');
      sfx(fx.heads ? 'buff' : 'fade', 150);
    }, 1900);
    const done = setTimeout(onDone, COIN_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tone = fx.heads ? '#facc15' : '#cbd5e1';
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] flex flex-col items-center justify-center" style={{ animation: `fx-fade-in-out ${COIN_MS}ms ease both` }}>
      <div className="absolute inset-0 bg-black/70" />
      {/* แสงหลังเหรียญตอนตกถึงพื้น */}
      {landed && (
        <div
          className="absolute top-1/2 left-1/2 h-[520px] w-[520px] rounded-full"
          style={{ background: `radial-gradient(circle, ${tone}55, transparent 62%)`, animation: 'coin-burst 0.9s ease-out both' }}
        />
      )}
      <div className="relative" style={{ perspective: '900px' }}>
        <div style={{ animation: 'coin-arc 1.9s cubic-bezier(.25,.6,.35,1) both' }}>
          <div
            className="relative h-48 w-48"
            style={{
              transformStyle: 'preserve-3d',
              ['--spin' as string]: fx.heads ? '2160deg' : '2340deg',
              animation: 'coin-spin 1.9s cubic-bezier(.2,.75,.3,1) both',
            }}
          >
            <CoinFace gold />
            <CoinFace gold={false} />
          </div>
        </div>
        {/* เงาบนพื้น */}
        <div className="absolute top-full left-1/2 mt-6 h-4 w-36 -translate-x-1/2 rounded-full bg-black/60 blur-md" style={{ animation: 'coin-shadow 1.9s cubic-bezier(.25,.6,.35,1) both' }} />
      </div>
      <div className="relative mt-14 h-24 text-center">
        {landed && (
          <>
            <div className="text-sm font-bold tracking-[0.5em]" style={{ color: tone, animation: 'fx-slide-up 0.4s ease-out both' }}>
              {fx.sub}
            </div>
            <div
              className="mt-1 text-5xl font-black italic"
              style={{ color: fx.heads ? '#fde68a' : '#e2e8f0', textShadow: `0 0 24px ${tone}aa, 0 3px 0 rgba(0,0,0,0.6)`, animation: 'lobby-vs 0.55s cubic-bezier(.2,1.4,.4,1) both' }}
            >
              {fx.title}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FxLayer() {
  const fx = useGame((s) => s.fx);
  const dismiss = useGame((s) => s.dismissFx);
  const current = fx.find((f) => f.kind === 'banner' || f.kind === 'summon');
  const toasts = fx.filter((f): f is Extract<Fx, { kind: 'activate' }> => f.kind === 'activate').slice(0, 3);
  const floats = fx.filter((f): f is Extract<Fx, { kind: 'float' }> => f.kind === 'float');

  return (
    <>
      {current?.kind === 'banner' && <Banner key={current.id} fx={current} onDone={() => dismiss(current.id)} />}
      {fx.map((f) => (f.kind === 'coin' ? <CoinToss key={f.id} fx={f} onDone={() => dismiss(f.id)} /> : null))}
      {fx.map((f) => (f.kind === 'finalBlow' ? <FinalBlow key={f.id} fx={f} onDone={() => dismiss(f.id)} /> : null))}
      {current?.kind === 'summon' && <SummonCutIn key={current.id} fx={current} onDone={() => dismiss(current.id)} />}
      {/* ป๊อปอัปเอฟเฟกต์ลอยทับแผงรายละเอียดด้านขวา เพื่อไม่บังกระดาน */}
      <div className="pointer-events-none fixed top-2 right-2 z-40 flex w-[calc(var(--sidebar)-1rem)] flex-col gap-2">
        {toasts.map((t) => (
          <ActivateToast key={t.id} fx={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
      {floats.map((f) => (
        <FloatText key={f.id} fx={f} onDone={() => dismiss(f.id)} />
      ))}
      {fx.map((f) =>
        f.kind === 'fly' ? (
          <FlyCard key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'lunge' ? (
          <Lunge key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'ghost' ? (
          <Ghost key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'charge' ? (
          <Charge key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'cardActivate' ? (
          <CardActivate key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'chainAdd' ? (
          <ChainAddFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'reveal' ? (
          <RevealFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'target' ? (
          <TargetFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'chain' ? (
          <ChainDisplay key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'damage' ? (
          <Damage key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : null,
      )}
      <SkipOverlay />
    </>
  );
}

// ---------------------------------------------------------------- card motion

const rectOf = layoutRect;

/** กึ่งกลางกระดาน (ไม่รวมแผงด้านขวา) ขนาดการ์ดใหญ่ */
function boardCenter(w: number, h: number): Rect {
  const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')) || 400;
  return { x: (innerWidth - sidebar) / 2 - w / 2, y: innerHeight / 2 - h / 2, w, h };
}

const frame = (r: Rect, extra: Keyframe = {}): Keyframe => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, ...extra });

const COLOR_HEX: Record<string, string> = { red: '#ef4444', purple: '#a855f7', green: '#22c55e', white: '#e2e8f0', yellow: '#facc15', blue: '#38bdf8' };

/** สร้าง element ชั่วคราวบน body แล้วลบทิ้งเมื่อแอนิเมชันจบ */
function spawnFx(style: Partial<CSSStyleDeclaration>, keyframes: Keyframe[], opts: KeyframeAnimationOptions) {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', zIndex: '44' }, style);
  document.body.appendChild(el);
  el.animate(keyframes, { fill: 'both', ...opts }).onfinish = () => el.remove();
}

/**
 * แรงกระแทกตอนการ์ดลงสนาม: การ์ดยุบตัว + แสงวาบ + คลื่นกระแทก + สะเก็ดไฟ + จอสั่น
 * heavy (X-Rare): คลื่นหลายชั้น, เสาแสง, แสงวาบทั้งกระดาน, สะเก็ดมากขึ้น, จอสั่นแรง
 */
function landImpact(target: Element, color: string, heavy: boolean) {
  const r = layoutRect(target);
  if (!r) return;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  // การ์ดยุบแล้วเด้ง
  target.animate(
    heavy
      ? [
          { transform: 'scale(1.3, 0.82)', filter: 'brightness(3)' },
          { transform: 'scale(0.92, 1.08)', filter: 'brightness(1.6)', offset: 0.35 },
          { transform: 'scale(1.04, 0.97)', offset: 0.65 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ]
      : [
          { transform: 'scale(1.18, 0.88)', filter: 'brightness(2.2)' },
          { transform: 'scale(0.96, 1.04)', filter: 'brightness(1.2)', offset: 0.45 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
    { duration: heavy ? 650 : 420, easing: 'ease-out' },
  );
  // คลื่นกระแทก (วงรีแนบพื้น)
  const rings = heavy ? [0, 120, 260] : [0];
  rings.forEach((d, i) => {
    const size = Math.max(r.w, r.h) * (heavy ? 1.2 : 0.9);
    spawnFx(
      {
        left: `${cx - size / 2}px`,
        top: `${cy - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: `${heavy ? 6 - i : 4}px solid ${i === 1 ? '#fff' : color}`,
        boxShadow: `0 0 24px ${color}, inset 0 0 24px ${color}`,
      },
      [
        { transform: 'scale(0.4, 0.22)', opacity: 1 },
        { transform: `scale(${heavy ? 4.2 : 2.6}, ${heavy ? 2.1 : 1.4})`, opacity: 0 },
      ],
      { duration: heavy ? 900 : 600, delay: d, easing: 'cubic-bezier(.1,.7,.3,1)' },
    );
  });
  // แสงวาบตรงจุดตก
  const glow = Math.max(r.w, r.h) * (heavy ? 3 : 1.8);
  spawnFx(
    {
      left: `${cx - glow / 2}px`,
      top: `${cy - glow / 2}px`,
      width: `${glow}px`,
      height: `${glow}px`,
      borderRadius: '50%',
      background: `radial-gradient(circle, #fff 0%, ${color} 25%, transparent 65%)`,
      mixBlendMode: 'screen',
    },
    [
      { transform: 'scale(0.3)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0 },
    ],
    { duration: heavy ? 700 : 420, easing: 'ease-out' },
  );
  // สะเก็ดไฟกระจาย
  const n = heavy ? 22 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = (heavy ? 170 : 90) + ((i * 37) % 60);
    const len = heavy ? 26 : 16;
    spawnFx(
      {
        left: `${cx - 2}px`,
        top: `${cy - len / 2}px`,
        width: '4px',
        height: `${len}px`,
        borderRadius: '2px',
        background: `linear-gradient(${i % 2 ? '#fff' : color}, transparent)`,
        boxShadow: `0 0 8px ${color}`,
      },
      [
        { transform: `rotate(${a + Math.PI / 2}rad) translateY(0)`, opacity: 1 },
        { transform: `rotate(${a + Math.PI / 2}rad) translateY(${-dist}px) scaleY(0.4)`, opacity: 0 },
      ],
      { duration: (heavy ? 700 : 450) + (i % 4) * 60, easing: 'cubic-bezier(.1,.8,.3,1)' },
    );
  }
  if (heavy) {
    // เสาแสงพุ่งขึ้นจากช่อง
    spawnFx(
      {
        left: `${cx - r.w * 0.6}px`,
        top: '0px',
        width: `${r.w * 1.2}px`,
        height: `${cy}px`,
        background: `linear-gradient(to top, #fff, ${color} 30%, transparent)`,
        mixBlendMode: 'screen',
        transformOrigin: 'bottom',
      },
      [
        { transform: 'scaleX(0.2) scaleY(0)', opacity: 1 },
        { transform: 'scaleX(1) scaleY(1)', opacity: 0.9, offset: 0.25 },
        { transform: 'scaleX(0.1) scaleY(1)', opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out' },
    );
    // แสงวาบทั้งกระดาน
    spawnFx(
      { inset: '0', background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,255,255,0.85), ${color}66 40%, transparent 80%)` },
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 550, easing: 'ease-out' },
    );
  }
  // จอสั่น
  const k = heavy ? 14 : 5;
  document.querySelector('main')?.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-k}px,${k * 0.7}px)` },
      { transform: `translate(${k * 0.8}px,${-k * 0.6}px)` },
      { transform: `translate(${-k * 0.5}px,${k * 0.4}px)` },
      { transform: `translate(${k * 0.25}px,0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: heavy ? 520 : 300, easing: 'ease-out' },
  );
}

/** การ์ดบิน: จั่ว (Deck → มือ), ลงการ์ด (มือ → สนาม แล้วกระแทก), Magic (มือ → กลางจอ → Trash), Burst (ช่อง Burst → กลางจอ) */
function FlyCard({ fx, onDone }: { fx: Extract<Fx, { kind: 'fly' }>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const card = useGame((s) => s.state.cards[fx.cardId]);
  // จั่วเข้ามือที่ซ่อนอยู่ = บินแบบคว่ำ
  const faceDown = useGame(
    (s) => {
      const owner = s.state.cards[fx.cardId]?.owner;
      return !!fx.faceDown || ((fx.mode === 'draw' || fx.mode === 'move') && !!owner && hiddenFrom(s, owner));
    },
  );
  const [flipped, setFlipped] = useState(fx.mode !== 'burst');

  useLayoutEffect(() => {
    const el = ref.current;
    // 'center' = ต่อจาก cut-in X-Rare: เริ่มจากการ์ดใหญ่กลางจอ
    const from = fx.from === 'center' ? boardCenter(300, 420) : typeof fx.from === 'string' ? rectOf(document.querySelector(fx.from)) : fx.from;
    if (!el || !from) return onDone();
    let anim: Animation;
    if (fx.mode === 'magic' || fx.mode === 'burst') {
      const big = boardCenter(208, 290);
      const end = rectOf(document.querySelector(fx.to)) ?? from;
      const small = { x: end.x + end.w / 2 - 20, y: end.y + end.h / 2 - 28, w: 40, h: 56 };
      anim = el.animate(
        fx.mode === 'magic'
          ? [frame(from, { opacity: 1 }), frame(big, { opacity: 1, offset: 0.22 }), frame(big, { opacity: 1, offset: 0.78 }), frame(small, { opacity: 0 })]
          : [frame(from, { opacity: 1, transform: 'rotateY(180deg)' }), frame(big, { opacity: 1, transform: 'rotateY(0deg)', offset: 0.35 }), frame(big, { opacity: 1, offset: 0.8 }), frame(big, { opacity: 0, transform: 'scale(1.15)' })],
        { duration: fx.mode === 'magic' ? 2000 : 1900, delay: fx.delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      );
      if (fx.mode === 'burst') setTimeout(() => setFlipped(true), fx.delay + 280);
    } else {
      const slot = rectOf(document.querySelector(fx.to));
      if (!slot) return onDone();
      // ลง Trash: ย่อเป็นการ์ดเล็กกลางช่อง
      const to = fx.shrink ? { x: slot.x + slot.w / 2 - 22, y: slot.y + slot.h / 2 - 31, w: 44, h: 62 } : slot;
      const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 40, w: (from.w + to.w) / 2, h: (from.h + to.h) / 2 };
      if (fx.mode === 'play') {
        // หยิบการ์ดขึ้นมาถือค้างเหนือช่อง → ทุบลงฉับพลัน
        const heavy = !!fx.heavy;
        const k = heavy ? 1.75 : 1.4;
        const hold = { x: to.x + to.w / 2 - (to.w * k) / 2, y: to.y - (heavy ? 170 : 95), w: to.w * k, h: to.h * k };
        const up = { ...hold, y: hold.y - (heavy ? 18 : 10) };
        const total = heavy ? PLAY_HIT.heavy : PLAY_HIT.normal;
        const slam = 1 - (heavy ? 130 : 110) / total; // ช่วงทุบลงสั้นมาก
        const lifted = '0 60px 40px rgba(0,0,0,0.55), 0 0 30px rgba(255,255,255,0.25)';
        anim = el.animate(
          [
            frame(from, { opacity: 1, transform: 'rotate(0deg)', boxShadow: '0 8px 20px rgba(0,0,0,0.5)', easing: 'cubic-bezier(.2,.9,.3,1)' }),
            frame(hold, { offset: heavy ? 0.3 : 0.24, opacity: 1, transform: 'rotate(-6deg)', boxShadow: lifted, filter: heavy ? 'brightness(1.3)' : 'brightness(1.1)', easing: 'ease-in-out' }),
            frame(up, { offset: slam - 0.12, opacity: 1, transform: 'rotate(-3deg)', boxShadow: lifted, filter: heavy ? 'brightness(1.7)' : 'brightness(1.2)', easing: 'ease-out' }),
            frame({ ...up, y: up.y - (heavy ? 14 : 8) }, { offset: slam, opacity: 1, transform: 'rotate(2deg)', boxShadow: lifted, filter: heavy ? 'brightness(2)' : 'brightness(1.3)', easing: 'cubic-bezier(.9,0,1,.5)' }),
            frame(to, { opacity: 1, transform: 'rotate(0deg)', boxShadow: '0 0 0 rgba(0,0,0,0)', filter: 'brightness(2.6)' }),
          ],
          { duration: total, delay: fx.delay, fill: 'forwards' },
        );
      } else
      anim = el.animate(
        fx.mode === 'draw'
          ? [frame(from, { opacity: 0.6 }), frame(to, { opacity: 1 })]
          : fx.mode === 'move'
            ? [frame(from, { opacity: 1 }), frame(mid, { offset: 0.5, opacity: 1, transform: 'rotate(-6deg)' }), frame(to, { opacity: fx.shrink ? 0.2 : 1 })]
          : [frame(from, { opacity: 1 }), frame(mid, { offset: 0.55, opacity: 1, transform: 'scale(1.12)' }), frame(to, { opacity: 1 })],
        { duration: fx.mode === 'draw' ? 420 : fx.mode === 'move' ? 480 : 520, delay: fx.delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' },
      );
    }
    anim.onfinish = () => {
      if (fx.mode === 'play') {
        const target = document.querySelector(fx.to);
        const c = useGame.getState().state.cards[fx.cardId];
        const color = (c && COLOR_HEX[db.get(c.cardNo).colors[0] ?? 'red']) || '#facc15';
        if (target) landImpact(target, color, !!fx.heavy);
      }
      onDone();
    };
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!card) return null;
  const def = db.get(card.cardNo);
  const glow =
    fx.mode === 'magic'
      ? fx.timing === 'flash'
        ? '0 0 40px 12px rgba(129,140,248,0.85)'
        : '0 0 40px 12px rgba(250,204,21,0.8)'
      : fx.mode === 'burst'
        ? '0 0 50px 16px rgba(251,146,60,0.9)'
        : '0 8px 24px rgba(0,0,0,0.6)';
  return (
    <div ref={ref} className="pointer-events-none fixed z-[41] rounded-lg" style={{ boxShadow: glow, perspective: 800, opacity: 0 }}>
      {(fx.mode === 'magic' || fx.mode === 'burst') && (
        <div
          className="absolute top-1/2 left-1/2 -z-10 aspect-square w-[160%] rounded-full"
          style={{
            border: `4px solid ${fx.mode === 'burst' ? '#fb923c' : fx.timing === 'flash' ? '#818cf8' : '#facc15'}`,
            animation: `fx-shockwave 0.9s ${fx.delay + 400}ms ease-out both`,
          }}
        />
      )}
      {faceDown || !flipped ? <CardBack /> : <CardFace def={def} />}
    </div>
  );
}

/** พุ่งเข้าหาเป้าหมายแล้วดีดกลับ (ใช้กล่องนอกของการ์ด ซึ่งไม่หมุนตามสถานะเสื่อมสภาพ) */
function Lunge({ fx, onDone }: { fx: Extract<Fx, { kind: 'lunge' }>; onDone: () => void }) {
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-field-card="${fx.cardId}"] > div`);
    const a = rectOf(el);
    const b = rectOf(document.querySelector(fx.target));
    if (!el || !a || !b) return onDone();
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(len * 0.45, fx.max);
    const tx = (dx / len) * reach;
    const ty = (dy / len) * reach;
    const anim = el.animate(
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${-tx * 0.12}px,${-ty * 0.12}px) scale(1.05)`, offset: 0.25 },
        { transform: `translate(${tx}px,${ty}px) scale(1.12)`, offset: 0.55 },
        { transform: 'translate(0,0) scale(1)' },
      ],
      { duration: 520, delay: fx.delay, easing: 'cubic-bezier(.3,.6,.3,1)' },
    );
    el.style.zIndex = '35';
    anim.onfinish = () => {
      el.style.zIndex = '';
      onDone();
    };
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** ระหว่างแอนิเมชันที่ต้องเล่นให้จบ: บังการคลิกบนกระดาน คลิกเพื่อข้าม */
function SkipOverlay() {
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const skipFx = useGame((s) => s.skipFx);
  if (!blocking) return null;
  return (
    <div className={`${BOARD} z-[38] cursor-pointer`} onClick={skipFx} title="คลิกเพื่อข้ามแอนิเมชัน">
      <span className="absolute bottom-36 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-300">คลิกเพื่อข้าม ▸▸</span>
    </div>
  );
}

/** การ์ดบนสนามที่เอฟเฟกต์ทำงาน: ยกขึ้น ขยาย และเรืองแสงทอง แล้วค่อยวางกลับ */
function CardActivate({ fx, onDone }: { fx: Extract<Fx, { kind: 'cardActivate' }>; onDone: () => void }) {
  const [burst, setBurst] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-field-card="${fx.cardId}"] > div:first-child`);
    if (!el) return onDone();
    const showBurst = setTimeout(() => setBurst(layoutRect(el)), fx.delay + fx.duration * 0.2);
    const glow = 'drop-shadow(0 0 14px rgba(250,204,21,0.95)) drop-shadow(0 0 4px rgba(255,255,255,0.9)) brightness(1.25)';
    const anim = el.animate(
      [
        { transform: 'translateY(0) scale(1)', filter: 'none' },
        { transform: 'translateY(-18px) scale(1.14)', filter: glow, offset: 0.25 },
        { transform: 'translateY(-18px) scale(1.14)', filter: glow, offset: 0.8 },
        { transform: 'translateY(0) scale(1)', filter: 'none' },
      ],
      { duration: fx.duration, delay: fx.delay, easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
    const z = setTimeout(() => (el.style.zIndex = '30'), fx.delay);
    anim.onfinish = () => {
      el.style.zIndex = '';
      onDone();
    };
    return () => {
      clearTimeout(z);
      clearTimeout(showBurst);
      el.style.zIndex = '';
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!burst) return null;
  return (
    <div className="pointer-events-none fixed z-[29]" style={{ left: burst.x + burst.w / 2, top: burst.y + burst.h / 2 - 18 }}>
      <div
        className="absolute h-72 w-72 rounded-full"
        style={{
          background: 'repeating-conic-gradient(from 0deg, rgba(253,224,71,0.9) 0deg 3deg, transparent 3deg 14deg)',
          maskImage: 'radial-gradient(circle, black 15%, transparent 60%)',
          animation: `fx-sunburst ${fx.duration * 0.8}ms ease-out both`,
        }}
      />
      <div
        className="absolute h-44 w-44 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(250,204,21,0.55) 35%, transparent 70%)', animation: `fx-sunburst ${fx.duration * 0.8}ms ease-out both` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- FINAL BLOW

/** รอยร้าวจากจุดกลางฝั่งที่แพ้ (เส้นหยัก ๆ กระจายออก) */
function crackPaths(w: number, h: number): string[] {
  const cx = w / 2;
  const cy = h / 2;
  const rays = 11;
  const out: string[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (i % 2 ? 0.17 : -0.11);
    const len = Math.hypot(w, h) * (0.35 + ((i * 37) % 10) / 30);
    let d = `M${cx},${cy}`;
    for (let k = 1; k <= 6; k++) {
      const r = (len * k) / 6;
      const j = (k % 2 ? 1 : -1) * (8 + ((i * 13 + k * 7) % 14));
      d += ` L${cx + Math.cos(a) * r - Math.sin(a) * j},${cy + Math.sin(a) * r + Math.cos(a) * j}`;
    }
    out.push(d);
  }
  return out;
}

/**
 * FINAL BLOW: จังหวะที่โจมตีจน Life เป็น 0
 * เวลาเกือบหยุด (แอนิเมชันบนกระดานช้าลง) → แสงวาบ + รอยฟันเฉียง → ข้อความ FINAL BLOW → ฝั่งที่แพ้ร้าวและมืดลง
 */
function FinalBlow({ fx, onDone }: { fx: Extract<Fx, { kind: 'finalBlow' }>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mat, setMat] = useState<Rect | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => {
      setMat(layoutRect(document.querySelector(`[data-mat="${fx.loser}"]`)));
      setOn(true);
    }, fx.delay);
    const b = setTimeout(onDone, fx.delay + 2600);
    return () => [a, b].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (!on) return;
    // เวลาเกือบหยุด: แอนิเมชันอื่นบนจอเล่นช้าลงชั่วครู่
    const slowed = document.getAnimations().filter((x) => {
      const target = (x.effect as KeyframeEffect | null)?.target;
      return !(target && ref.current?.contains(target));
    });
    slowed.forEach((x) => (x.playbackRate = 0.1));
    const restore = setTimeout(() => slowed.forEach((x) => (x.playbackRate = 1)), 750);
    // จอสั่นแรงหลังแสงวาบ
    const shake = setTimeout(
      () =>
        document.querySelector('main')?.animate(
          [
            { transform: 'translate(0,0)' },
            { transform: 'translate(-16px,9px)' },
            { transform: 'translate(14px,-10px)' },
            { transform: 'translate(-10px,6px)' },
            { transform: 'translate(6px,-4px)' },
            { transform: 'translate(0,0)' },
          ],
          { duration: 450, easing: 'ease-out' },
        ),
      420,
    );
    return () => {
      clearTimeout(restore);
      clearTimeout(shake);
      slowed.forEach((x) => (x.playbackRate = 1));
    };
  }, [on]);
  if (!on) return null;
  return (
    <div ref={ref} className={`${BOARD} pointer-events-none z-[60] overflow-hidden`}>
      {/* ฝั่งที่แพ้: มืดลง + รอยร้าว */}
      {mat && (
        <div className="absolute" style={{ left: mat.x, top: mat.y, width: mat.w, height: mat.h, animation: 'fx-fb-dim 2.6s ease-out both' }}>
          <div className="absolute inset-0 rounded-xl bg-[radial-gradient(ellipse_at_center,rgba(127,29,29,0.35),rgba(0,0,0,0.75))]" />
          <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 0 14px rgba(248,113,113,0.8))' }}>
            {crackPaths(mat.w, mat.h).map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#fff"
                strokeWidth={i % 3 === 0 ? 3.5 : 2}
                strokeLinejoin="bevel"
                pathLength={1}
                strokeDasharray="1"
                style={{ animation: `fx-fb-crack 0.45s ${450 + i * 25}ms cubic-bezier(.2,.8,.2,1) both` }}
              />
            ))}
          </svg>
        </div>
      )}
      {/* เส้นความเร็วรอบกลางจอ */}
      <div
        className="absolute top-1/2 left-1/2 h-[180vmax] w-[180vmax]"
        style={{
          translate: '-50% -50%',
          background: 'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.16) 0deg 1.2deg, transparent 1.2deg 7deg)',
          maskImage: 'radial-gradient(circle, transparent 12%, #000 40%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 12%, #000 40%)',
          animation: 'fx-fb-lines 2.6s ease-out both',
        }}
      />
      {/* รอยฟันเฉียง 2 เส้น */}
      {[-24, 156].map((deg, i) => (
        <div
          key={deg}
          className="absolute top-1/2 left-1/2 h-2 w-[140%] rounded-full bg-white"
          style={{
            translate: '-50% -50%',
            rotate: `${deg + i * 38}deg`,
            boxShadow: '0 0 20px 6px rgba(251,191,36,0.9), 0 0 60px 20px rgba(239,68,68,0.6)',
            animation: `fx-fb-slash 0.7s ${120 + i * 140}ms cubic-bezier(.2,.9,.2,1) both`,
          }}
        />
      ))}
      {/* ข้อความ */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div style={{ animation: 'fx-fb-text 2.6s cubic-bezier(.2,.9,.3,1) 0.32s both' }}>
          <div
            className="bg-gradient-to-b from-white via-yellow-200 to-amber-500 bg-clip-text text-[7rem] leading-none font-black tracking-tight text-transparent italic"
            style={{ filter: 'drop-shadow(0 4px 0 #7c2d12) drop-shadow(0 0 24px rgba(251,191,36,0.85)) drop-shadow(0 0 60px rgba(239,68,68,0.7))', transform: 'skewX(-8deg)' }}
          >
            FINAL BLOW
          </div>
        </div>
        <div
          className="mt-3 rounded-full bg-black/70 px-5 py-1 text-lg font-bold text-rose-200 shadow"
          style={{ animation: 'fx-fb-sub 2.6s ease-out 0.6s both' }}
        >
          Life ของ {playerLabel(fx.loser)} เหลือ 0
        </div>
      </div>
      {/* แสงวาบ */}
      <div className="absolute inset-0 bg-white" style={{ animation: 'fx-fb-flash 0.55s ease-out both' }} />
    </div>
  );
}

// ---------------------------------------------------------------- CHAIN (แถบสะสมระหว่างการโจมตี)

/**
 * แถบ Chain ในแถบกลางจอ: เอฟเฟกต์ที่ทำงานไปแล้วในการโจมตีนี้ เรียงต่อกันพร้อมเลขลำดับ
 * แสดงตั้งแต่ประกาศโจมตีจนสปิริตวิ่งชนจบ (การ์ดที่กำลังบินเข้ามาจะยังซ่อนช่องไว้)
 */
export function ChainTracker({ side }: { side: 'self' | 'opp' }) {
  const state = useGame((s) => s.state);
  const fx = useGame((s) => s.fx);
  const hover = useGame((s) => s.hover);
  const me = useGame(viewPlayer);
  const entries = chainEntries(state);
  const flying = new Set(fx.flatMap((f) => (f.kind === 'chainAdd' ? [f.index] : [])));
  const active = !!state.battle || fx.some((f) => f.kind === 'charge' || f.kind === 'chainAdd');
  const mine = (p: string) => (side === 'self' ? p === me : p !== me);
  if (!active || !entries.some((e) => mine(e.player))) return null;
  const color = side === 'self' ? 'text-amber-300 ring-amber-300/40' : 'text-sky-300 ring-sky-300/40';
  return (
    <div className={`flex shrink-0 items-center gap-1 rounded-lg bg-black/40 py-0.5 pr-1.5 pl-1 ring-1 ${color} ${side === 'opp' ? 'flex-row-reverse' : ''}`}>
      <span className="px-1 text-[10px] leading-tight font-black tracking-widest [writing-mode:vertical-rl] rotate-180">CHAIN</span>
      {entries.map((e, i) => {
        const card = state.cards[e.cardId];
        if (!card || !mine(e.player)) return null;
        const hidden = flying.has(i);
        return (
          <div
            key={i}
            data-chain-slot={i}
            className={`relative h-12 w-[2.15rem] shrink-0 cursor-help ${hidden ? 'invisible' : ''}`}
            style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i, animation: hidden ? undefined : 'fx-chain-pop 0.35s ease-out both' }}
            onMouseEnter={() => hover(e.cardId)}
            onMouseLeave={() => hover(null)}
            title={db.get(card.cardNo).name}
          >
            <div className={`h-full w-full overflow-hidden rounded ring-2 ${side === 'self' ? 'ring-amber-300' : 'ring-sky-300'}`}>
              <CardFace def={db.get(card.cardNo)} size="xs" />
            </div>
            <span className="absolute -top-1.5 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[10px] font-black text-slate-900 shadow">
              {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CHAIN_LINK_MS = 2600;
const CHAIN_HOLD_END = 0.83; // สัดส่วนเวลาที่การ์ดค้างในกอง Chain ก่อนบินลงแถบ
const STACK_W = 150;
const STACK_H = 210;

/** ระยะระหว่างการ์ดในกอง Chain (ความสูงการ์ด + ช่องให้เห็นโซ่) */
const STACK_STEP = STACK_H + 48;

/**
 * ตำแหน่งการ์ดในกอง Chain กลางจอ: ใบใหม่สุดอยู่จุดเดิมเสมอ ใบที่ต่อมาก่อนไล่ลงไปด้านล่างทีละช่อง (ล้นจอได้)
 * ของเราอยู่ซ้าย ของคู่แข่งอยู่ขวา
 */
function stackLayout(sides: ('self' | 'opp')[]): Rect[] {
  const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')) || 400;
  const cx = (innerWidth - sidebar) / 2;
  const top = innerHeight * 0.42;
  const last = sides.length - 1;
  return sides.map((side, k) => {
    const x = cx + (side === 'self' ? -1 : 1) * 140;
    const y = top + (last - k) * STACK_STEP;
    return { x: x - STACK_W / 2, y: y - STACK_H / 2, w: STACK_W, h: STACK_H };
  });
}

/**
 * ต่อ Chain: กอง Chain กลางจอ (การ์ดที่ต่อมาก่อนซ้อนอยู่ + โซ่เชื่อมเป็นทอด ๆ)
 * การ์ดใหม่พุ่งมาวางบนสุด โซ่ข้อสุดท้ายลากต่อเข้าหา "CHAIN n" แล้วการ์ดใหม่ย่อบินลงแถบ Chain
 */
function ChainAddFx({ fx, onDone }: { fx: Extract<Fx, { kind: 'chainAdd' }>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(fx.delay === 0);
  const state = useGame((s) => s.state);
  const me = useGame(viewPlayer);
  useEffect(() => {
    if (on) return;
    const t = setTimeout(() => setOn(true), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // กองตั้งแต่ Chain 1 ถึงใบนี้
  const stack = chainEntries(state).slice(0, fx.index + 1);
  const sides = stack.map((e) => (e.player === me ? 'self' : 'opp') as 'self' | 'opp');
  useLayoutEffect(() => {
    if (!on) return;
    const el = ref.current;
    const to = layoutRect(document.querySelector(`[data-chain-slot="${fx.index}"]`));
    const from = layoutRect(document.querySelector(`[data-field-card="${fx.cardId}"] > div:first-child`)) ?? boardCenter(150, 210);
    const spot = stackLayout(sides)[fx.index];
    if (!el || !to || !spot) return onDone();
    const big = { x: spot.x - spot.w * 0.06, y: spot.y - spot.h * 0.06, w: spot.w * 1.12, h: spot.h * 1.12 };
    const anim = el.animate(
      [
        frame(from, { opacity: 1, transform: 'rotate(0deg)', filter: 'brightness(1.6)' }),
        frame(big, { offset: 0.12, opacity: 1, transform: 'rotate(-4deg)', filter: 'brightness(1.5)' }),
        frame(spot, { offset: 0.18, opacity: 1, transform: 'rotate(0deg)', filter: 'brightness(1)' }),
        frame(spot, { offset: CHAIN_HOLD_END, opacity: 1, transform: 'rotate(0deg)', filter: 'brightness(1.1)', easing: 'cubic-bezier(.5,0,.3,1)' }),
        frame(to, { opacity: 1, transform: 'rotate(0deg)', filter: 'brightness(1.8)' }),
      ],
      { duration: CHAIN_LINK_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    );
    anim.onfinish = onDone;
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  const card = state.cards[fx.cardId];
  if (!on || !card) return null;
  const layout = stackLayout(sides);
  const spot = layout[fx.index]!;
  const mine = sides[fx.index] === 'self';
  const n = fx.index + 1;
  const toneOf = (side: 'self' | 'opp') =>
    side === 'self'
      ? { ring: '#fbbf24', glow: 'rgba(251,191,36,0.75)', text: 'from-yellow-100 via-amber-300 to-orange-500', badge: 'bg-amber-400' }
      : { ring: '#7dd3fc', glow: 'rgba(56,189,248,0.75)', text: 'from-white via-sky-200 to-sky-500', badge: 'bg-sky-400' };
  const tone = toneOf(sides[fx.index]!);
  const hold = `${CHAIN_LINK_MS * CHAIN_HOLD_END}ms`;
  const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  return (
    <>
      <div className={`${BOARD} pointer-events-none z-[44] overflow-hidden`} style={{ animation: `fx-cl-backdrop ${hold} ease-out both` }}>
        <div className="absolute inset-0 bg-black/60" />
        {/* การ์ดที่ต่อมาก่อนหน้า */}
        {stack.slice(0, fx.index).map((e, k) => {
          const c = state.cards[e.cardId];
          const r = layout[k]!;
          if (!c) return null;
          return (
            <div
              key={k}
              className="absolute"
              style={{ left: r.x, top: r.y, width: r.w, height: r.h, filter: 'brightness(0.9)', ['--push' as string]: `${-STACK_STEP}px`, animation: 'fx-cl-push 0.4s 0.22s cubic-bezier(.3,1.3,.5,1) both' }}
            >
              <div className="h-full w-full rounded-lg shadow-[0_8px_20px_rgba(0,0,0,0.7)]" style={{ boxShadow: `0 0 14px ${toneOf(sides[k]!).glow}` }}>
                <CardFace def={db.get(c.cardNo)} />
              </div>
              <span className={`absolute -top-3 ${sides[k] === 'self' ? '-left-3' : '-right-3'} flex h-8 w-8 items-center justify-center rounded-full ${toneOf(sides[k]!).badge} text-base font-black text-slate-900 shadow-lg`}>
                {k + 1}
              </span>
            </div>
          );
        })}
        {/* โซ่เชื่อมการ์ดในกองเป็นทอด ๆ (ข้อสุดท้ายลากต่อเข้าหาการ์ดใหม่) */}
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          {layout.slice(1).map((r, k) => {
            const older = layout[k]!;
            const a = { x: older.x + older.w / 2, y: older.y + 6 };
            const b = { x: r.x + r.w / 2, y: r.y + r.h - 6 };
            const last = k === layout.length - 2;
            const t = toneOf(sides[k + 1]!);
            return (
              <g
                key={k}
                style={{
                  filter: `drop-shadow(0 0 6px ${t.glow})`,
                  ['--push' as string]: `${-STACK_STEP}px`,
                  animation: last ? undefined : 'fx-cl-push 0.4s 0.22s cubic-bezier(.3,1.3,.5,1) both',
                }}
              >
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth={14} strokeLinecap="round" />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={t.ring}
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeDasharray="16 9"
                  pathLength={last ? 100 : undefined}
                  style={last ? { strokeDasharray: '100', animation: 'fx-cl-link 0.35s 0.42s ease-out both' } : undefined}
                />
              </g>
            );
          })}
        </svg>
        {/* วงแหวนโซ่ + CHAIN n รอบการ์ดใหม่ */}
        <div className="absolute flex items-center justify-center" style={{ left: spot.x + spot.w / 2, top: spot.y + spot.h / 2 }}>
          <div
            className="absolute aspect-square w-[20rem] rounded-full"
            style={{
              background: `repeating-conic-gradient(from 0deg, ${tone.ring} 0deg 7deg, transparent 7deg 15deg)`,
              maskImage: 'radial-gradient(circle, transparent 54%, #000 55%, #000 60%, transparent 61%)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 54%, #000 55%, #000 60%, transparent 61%)',
              filter: `drop-shadow(0 0 10px ${tone.glow})`,
              animation: 'fx-cl-ring 1.2s cubic-bezier(.2,.8,.2,1) both',
            }}
          />
          <div className="absolute aspect-square w-[15rem] rounded-full" style={{ boxShadow: `0 0 70px 18px ${tone.glow}, inset 0 0 50px ${tone.glow}`, animation: 'fx-cl-pulse 0.9s ease-out both' }} />
          <div className="absolute flex flex-col items-center" style={{ transform: `translateX(${mine ? '-15rem' : '15rem'})` }}>
            <span
              className={`bg-gradient-to-b ${tone.text} bg-clip-text text-2xl font-black tracking-[0.35em] text-transparent italic`}
              style={{ animation: 'fx-cl-word 0.5s 0.1s cubic-bezier(.2,.9,.3,1.3) both' }}
            >
              CHAIN
            </span>
            <span
              className={`bg-gradient-to-b ${tone.text} bg-clip-text text-[7rem] leading-none font-black text-transparent italic`}
              style={{ filter: `drop-shadow(0 4px 0 #0f172a) drop-shadow(0 0 20px ${tone.glow})`, animation: 'fx-cl-num 0.55s 0.15s cubic-bezier(.2,.9,.3,1.4) both' }}
            >
              {n}
            </span>
          </div>
        </div>
      </div>
      <div ref={ref} className="pointer-events-none fixed z-[45] rounded-lg" style={{ opacity: 0, boxShadow: `0 0 30px 8px ${tone.glow}` }}>
        <CardFace def={db.get(card.cardNo)} />
      </div>
    </>
  );
}

/** ตำแหน่งพัดการ์ดที่เปิดจากเด็ค: กลางฝั่งของผู้เปิด */
function fanLayout(owner: string, n: number) {
  const mat = layoutRect(document.querySelector(`[data-mat="${owner}"]`));
  const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')) || 400;
  const cx = mat ? mat.x + mat.w / 2 : (innerWidth - sidebar) / 2;
  const cy = mat ? mat.y + mat.h / 2 : innerHeight / 2;
  const W = 132;
  const H = 185;
  const gap = Math.min(150, (innerWidth - sidebar - 120) / Math.max(n, 1));
  return Array.from({ length: n }, (_, i) => {
    const off = i - (n - 1) / 2;
    return { x: cx + off * gap - W / 2, y: cy - H / 2 + off * off * 6, rot: off * 5, W, H };
  });
}

/**
 * พัดการ์ดที่เปิดจากเด็ค (ทั้งสองฝ่ายเห็น)
 *  - onPick: กำลังให้เลือก (คลิกใบที่เรืองแสง)
 *  - chosen: ผลการเลือก (ใบที่เลือกยกขึ้น ที่เหลือหรี่)
 */
export function RevealFan({
  owner,
  cardIds,
  candidates,
  chosen,
  onPick,
  onSkip,
  title,
}: {
  owner: string;
  cardIds: string[];
  candidates?: string[];
  chosen?: string | null;
  onPick?: (id: string) => void;
  /** ไม่เลือก (ตัวเลือกที่ไม่บังคับ) */
  onSkip?: () => void;
  title: string;
}) {
  const cards = useGame((s) => s.state.cards);
  const hover = useGame((s) => s.hover);
  const pos = fanLayout(owner, cardIds.length);
  const top = Math.min(...pos.map((p) => p.y)) - 44;
  const cx = pos.length ? (pos[0]!.x + pos[pos.length - 1]!.x + pos[0]!.W) / 2 : 0;
  return (
    <div className={`${BOARD} z-[39] pointer-events-none`}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute -translate-x-1/2 rounded-full bg-black/75 px-4 py-1 text-sm font-bold text-sky-100 shadow" style={{ left: cx, top }}>
        {title}
        {onSkip && (
          <button type="button" onClick={onSkip} className="pointer-events-auto ml-3 rounded-full bg-slate-200 px-3 py-0.5 text-xs font-black text-slate-900 hover:bg-white">
            ไม่เลือก
          </button>
        )}
      </div>
      {cardIds.map((id, i) => {
        const card = cards[id];
        const p = pos[i]!;
        if (!card) return null;
        const can = !!onPick && !!candidates?.includes(id);
        const isChosen = chosen === id;
        const dim = (onPick && !can) || (chosen !== undefined && chosen !== null && !isChosen);
        return (
          <div
            key={id}
            data-reveal-card={id}
            className={`pointer-events-auto absolute transition-[transform,filter] duration-300 ${can ? 'cursor-pointer hover:-translate-y-3' : ''}`}
            style={{
              left: p.x,
              top: p.y,
              width: p.W,
              height: p.H,
              transform: `rotate(${isChosen ? 0 : p.rot}deg) translateY(${isChosen ? -36 : 0}px) scale(${isChosen ? 1.12 : 1})`,
              filter: dim ? 'brightness(0.45) grayscale(0.5)' : undefined,
              zIndex: isChosen ? 5 : i,
            }}
            onClick={can ? () => onPick!(id) : undefined}
            onMouseEnter={() => hover(id)}
            onMouseLeave={() => hover(null)}
          >
            <div className="h-full w-full" style={{ animation: `fx-chain-in 0.4s ${i * 90}ms cubic-bezier(.2,.9,.3,1.2) both` }}>
            <div
              className={`relative h-full w-full rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.7)] ${can ? 'ring-4 ring-fuchsia-400' : ''} ${isChosen ? 'ring-4 ring-yellow-300' : ''}`}
              style={can ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : isChosen ? { boxShadow: '0 0 30px 8px rgba(250,204,21,0.7)' } : undefined}
            >
              <CardFace def={db.get(card.cardNo)} />
              {dim && <div className="absolute inset-0 rounded-lg bg-slate-950/65" />}
            </div>
            </div>
            {can && <div className="absolute inset-x-2 -bottom-3 rounded bg-fuchsia-500 py-0.5 text-center text-xs font-bold text-white shadow">คลิกเพื่อเลือก</div>}
            {isChosen && <div className="absolute inset-x-2 -bottom-3 rounded bg-yellow-300 py-0.5 text-center text-xs font-black text-slate-900 shadow">เลือก ✓ ขึ้นมือ</div>}
          </div>
        );
      })}
    </div>
  );
}

function RevealFx({ fx, onDone }: { fx: Extract<Fx, { kind: 'reveal' }>; onDone: () => void }) {
  const [shown, setShown] = useState(fx.delay === 0);
  useEffect(() => {
    const a = setTimeout(() => setShown(true), fx.delay);
    const b = setTimeout(onDone, fx.delay + fx.duration);
    return () => [a, b].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!shown) return null;
  return (
    <RevealFan
      owner={fx.owner}
      cardIds={fx.cardIds}
      chosen={fx.chosen}
      title={fx.title ?? (fx.chosen ? 'เลือกการ์ดจากที่แสดง' : 'แสดงการ์ดจากเด็ค · ไม่มีใบที่เลือกได้ ทิ้งลง Trash ทั้งหมด')}
    />
  );
}

/** เส้นเล็งจากการ์ดต้นเอฟเฟกต์ไปยังเป้าหมาย + เป้าเล็งบนเป้าหมาย */
function TargetFx({ fx, onDone }: { fx: Extract<Fx, { kind: 'target' }>; onDone: () => void }) {
  const [pts, setPts] = useState<{ from: { x: number; y: number } | null; to: { x: number; y: number }; size: number } | null>(null);
  useLayoutEffect(() => {
    const t = setTimeout(() => {
      const target = layoutRect(document.querySelector(`[data-field-card="${fx.targetId}"] > div:first-child`) ?? document.querySelector(`[data-hand-card="${fx.targetId}"]`));
      if (!target) return onDone();
      const src = layoutRect(document.querySelector(`[data-field-card="${fx.sourceId}"] > div:first-child`));
      setPts({
        from: src && fx.sourceId !== fx.targetId ? { x: src.x + src.w / 2, y: src.y + src.h / 2 } : null,
        to: { x: target.x + target.w / 2, y: target.y + target.h / 2 },
        size: Math.max(target.w, target.h) * 0.9,
      });
    }, fx.delay);
    const d = setTimeout(onDone, fx.delay + fx.duration);
    return () => [t, d].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!pts) return null;
  const { from, to, size } = pts;
  return (
    <div className="pointer-events-none fixed inset-0 z-[43]">
      {from && (
        <svg className="absolute inset-0 h-full w-full" style={{ filter: 'drop-shadow(0 0 6px #e879f9)' }}>
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#f0abfc"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray="14 8"
            style={{ animation: 'fx-dash 0.5s linear infinite' }}
          />
          <circle cx={from.x} cy={from.y} r={10} fill="#e879f9" />
        </svg>
      )}
      <div className="absolute" style={{ left: to.x, top: to.y }}>
        <div
          className="absolute rounded-full border-4 border-fuchsia-300"
          style={{ width: size, height: size, animation: 'fx-reticle 0.5s ease-out both', boxShadow: '0 0 20px rgba(232,121,249,0.8), inset 0 0 20px rgba(232,121,249,0.5)' }}
        >
          <div className="absolute top-1/2 left-0 h-0.5 w-full bg-fuchsia-200/80" />
          <div className="absolute top-0 left-1/2 h-full w-0.5 bg-fuchsia-200/80" />
        </div>
        <div className="absolute -translate-x-1/2 rounded bg-fuchsia-500 px-2 py-0.5 text-xs font-black text-white shadow" style={{ top: size / 2 + 4 }}>
          🎯 เป้าหมาย
        </div>
      </div>
    </div>
  );
}

/**
 * CHAIN: เอฟเฟกต์หลายอันทำงานพร้อมกัน
 * การ์ดเรียงซิกแซกกลางกระดาน มีเลขลำดับเรืองแสงและโซ่เชื่อม แล้วขึ้น RESOLVE ก่อนผลจะเกิดทีละอันบนสนาม
 */
function ChainDisplay({ fx, onDone }: { fx: Extract<Fx, { kind: 'chain' }>; onDone: () => void }) {
  const [phase, setPhase] = useState<'wait' | 'build' | 'resolve'>(fx.delay > 0 ? 'wait' : 'build');
  const cards = useGame((s) => s.state.cards);
  useEffect(() => {
    const a = setTimeout(() => setPhase('build'), fx.delay);
    const b = setTimeout(() => setPhase('resolve'), fx.delay + fx.duration - 650);
    const c = setTimeout(onDone, fx.delay + fx.duration);
    return () => [a, b, c].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (phase === 'wait') return null;

  const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')) || 400;
  const cx = (innerWidth - sidebar) / 2;
  const n = fx.cardIds.length;
  const W = 150;
  const H = 210;
  const stepY = Math.min(130, (innerHeight - H - 120) / Math.max(n - 1, 1));
  const top = innerHeight / 2 - ((n - 1) * stepY) / 2;
  const pos = fx.cardIds.map((_, i) => ({ x: cx + (i % 2 === 0 ? 110 : -110), y: top + i * stepY }));

  return (
    <div className={`${BOARD} z-[44] pointer-events-none`}>
      <div className="absolute inset-0 bg-black/45" style={{ animation: 'fx-fade-in-out ' + (fx.duration - 0) + 'ms ease both' }} />
      {/* โซ่ */}
      <svg className="absolute inset-0 h-full w-full" style={{ left: 0, top: 0 }}>
        {pos.slice(1).map((p, i) => {
          const a = pos[i]!;
          return (
            <g key={i} style={{ animation: `fx-fade-in-out ${fx.duration - (i + 1) * 350}ms ${(i + 1) * 350}ms ease both` }}>
              <line x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke="#0f172a" strokeWidth={14} strokeLinecap="round" />
              <line x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke="#cbd5e1" strokeWidth={9} strokeLinecap="round" strokeDasharray="16 7" />
            </g>
          );
        })}
      </svg>
      {fx.cardIds.map((id, i) => {
        const card = cards[id];
        if (!card) return null;
        const p = pos[i]!;
        const resolving = phase === 'resolve';
        return (
          <div
            key={id + i}
            className="absolute"
            style={{ left: p.x - W / 2, top: p.y - H / 2, width: W, height: H, animation: `fx-chain-in 0.45s ${i * 350}ms cubic-bezier(.2,.9,.3,1.2) both` }}
          >
            <div className={`h-full w-full rounded-lg shadow-[0_0_30px_rgba(103,232,249,0.6)] transition ${resolving ? 'brightness-125' : ''}`}>
              <CardFace def={db.get(card.cardNo)} />
            </div>
            <span
              className="absolute -bottom-6 font-black italic text-cyan-200 [text-shadow:0_0_12px_#22d3ee,0_0_4px_#fff,0_3px_0_#0e7490]"
              style={{ fontSize: 76, lineHeight: 1, [i % 2 === 0 ? 'left' : 'right']: -34 }}
            >
              {i + 1}
            </span>
          </div>
        );
      })}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
        <span
          key={phase}
          className="inline-block text-7xl font-black tracking-[0.15em] text-slate-100 italic [text-shadow:0_0_20px_rgba(103,232,249,0.9),0_4px_0_#334155]"
          style={{ animation: 'fx-chain-word 0.7s ease-out both' }}
        >
          {phase === 'resolve' ? 'RESOLVE' : 'CHAIN'}
        </span>
      </div>
    </div>
  );
}

/** ตัวเลขดาเมจใหญ่กลางฝั่งที่เสียไลฟ์ + ช่อง Life กะพริบแดง (โจมตีตรง: รัศมีแตกกระจาย) */
function Damage({ fx, onDone }: { fx: Extract<Fx, { kind: 'damage' }>; onDone: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const t = setTimeout(() => {
      const mat = layoutRect(document.querySelector(`[data-mat="${fx.player}"]`));
      if (!mat) return onDone();
      setPos({ x: mat.x + mat.w / 2, y: mat.y + mat.h / 2 });
      document.querySelector(`[data-life="${fx.player}"]`)?.animate(
        [{ boxShadow: '0 0 0 0 rgba(244,63,94,0)', filter: 'brightness(1)' }, { boxShadow: '0 0 24px 8px rgba(244,63,94,0.9)', filter: 'brightness(1.6)', offset: 0.3 }, { boxShadow: '0 0 0 0 rgba(244,63,94,0)', filter: 'brightness(1)' }],
        { duration: 900, easing: 'ease-out' },
      );
    }, fx.delay);
    const done = setTimeout(onDone, fx.delay + 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!pos) return null;
  return (
    <div className="pointer-events-none fixed z-[45]" style={{ left: pos.x, top: pos.y }}>
      {fx.big && (
        <div
          className="absolute h-[34rem] w-[34rem] rounded-full"
          style={{
            background: 'repeating-conic-gradient(from 0deg, rgba(254,226,226,0.95) 0deg 2.5deg, rgba(225,29,72,0.8) 2.5deg 6deg, transparent 6deg 13deg)',
            maskImage: 'radial-gradient(circle, transparent 12%, black 22%, transparent 62%)',
            animation: 'fx-sunburst 1s ease-out both',
          }}
        />
      )}
      <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ animation: 'fx-damage 1.5s cubic-bezier(.2,.9,.3,1) both' }}>
        <div className="text-[110px] leading-none font-black text-rose-500 italic [-webkit-text-stroke:4px_#fff] [text-shadow:0_6px_0_#7f1d1d,0_0_30px_rgba(0,0,0,0.8)]">
          −{fx.amount}
        </div>
        <div className="-mt-2 text-2xl font-black tracking-[0.3em] text-white [text-shadow:0_2px_0_#7f1d1d]">LIFE</div>
      </div>
    </div>
  );
}

const CHARGE_MS = 1000;
const HIT_AT = 0.45; // สัดส่วนเวลาที่ชนเป้าหมาย (ต้องตรงกับ HIT ใน store)

/**
 * ผู้โจมตีวิ่งชนเป้าหมาย: ลุกตั้งตรง → ถอยตั้งหลัก → พุ่งชน (จอสั่น + แสงกระแทก) → วิ่งกลับ / แตกสลายตรงจุดชน
 * ใช้การ์ดโคลนลอยเหนือกระดาน เพราะแผ่นรองเล่นตัดสิ่งที่ล้นขอบ การ์ดจริงถูกซ่อนระหว่างนี้
 */
function Charge({ fx, onDone }: { fx: Extract<Fx, { kind: 'charge' }>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [impact, setImpact] = useState<{ x: number; y: number } | null>(null);
  // ขนาดการ์ดตั้งตรง (กล่องนอกของการ์ดที่นอนอยู่จะกว้างกว่าสูง)
  const cardW = fx.fromExhausted ? fx.from.h : fx.from.w;
  const cardH = fx.fromExhausted ? fx.from.w : fx.from.h;
  const cx = fx.from.x + fx.from.w / 2;
  const cy = fx.from.y + fx.from.h / 2;

  useLayoutEffect(() => {
    const el = ref.current;
    const t = typeof fx.target === 'string' ? rectOf(document.querySelector(fx.target)) : fx.target;
    if (!el || !t) return onDone();
    const tx = t.x + t.w / 2 - cx;
    const ty = t.y + t.h / 2 - cy;
    const len = Math.hypot(tx, ty) || 1;
    // หยุดก่อนถึงกลางเป้าหมายเล็กน้อย ให้ดูเหมือนชนขอบ
    const stop = Math.max(0, len - cardH * 0.45);
    const hx = (tx / len) * stop;
    const hy = (ty / len) * stop;
    const rot = fx.fromExhausted ? 'rotate(90deg)' : 'rotate(0deg)';
    const rotEnd = fx.toExhausted ? 'rotate(90deg)' : 'rotate(0deg)';
    // แพ้: ถูกกระแทกกระเด็นกลับ เซ แล้วกลับถึงที่เดิม (ภาพถูกทำลายเล่นต่อที่ช่องของตัวเอง)
    const back = fx.fromExhausted ? 'rotate(90deg)' : 'rotate(0deg)';
    const end: Keyframe[] = fx.dies
      ? [
          { transform: `translate(${hx * 0.7}px,${hy * 0.7}px) rotate(-10deg) scale(1.05)`, filter: 'brightness(2.2) saturate(0.6)', offset: 0.55 },
          { transform: `translate(${hx * 0.25}px,${hy * 0.25}px) rotate(8deg) scale(1)`, filter: 'brightness(1.3) saturate(0.5)', offset: 0.75 },
          { transform: `translate(${-hx * 0.04}px,${-hy * 0.04}px) ${back} scale(1)`, filter: 'brightness(1.1) saturate(0.5)', offset: 0.9 },
          { transform: `translate(0,0) ${back} scale(1)`, filter: 'brightness(1)' },
        ]
      : [
          { transform: `translate(${hx * 0.9}px,${hy * 0.9}px) rotate(0deg) scale(1.08)`, offset: 0.58 },
          { transform: `translate(0,0) ${rotEnd} scale(1)` },
        ];
    const anim = el.animate(
      [
        { transform: `translate(0,0) ${rot} scale(1)`, opacity: 1 },
        { transform: `translate(${-hx * 0.08}px,${-hy * 0.08}px) rotate(0deg) scale(1.12)`, offset: 0.2 },
        { transform: `translate(${hx}px,${hy}px) rotate(0deg) scale(1.18)`, offset: HIT_AT, easing: 'ease-out' },
        ...end,
      ],
      { duration: CHARGE_MS, delay: fx.delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' },
    );
    const hit = setTimeout(() => {
      setImpact({ x: cx + hx, y: cy + hy });
      // จอสั่น + เป้าหมายสั่น
      document.querySelector('main')?.animate(
        [{ transform: 'translate(0,0)' }, { transform: 'translate(-8px,4px)' }, { transform: 'translate(7px,-5px)' }, { transform: 'translate(-4px,3px)' }, { transform: 'translate(0,0)' }],
        { duration: 320, easing: 'ease-out' },
      );
      if (typeof fx.target === 'string') {
        document.querySelector(fx.target)?.animate([{ filter: 'brightness(2.5)' }, { filter: 'brightness(1)' }], { duration: 400 });
      }
    }, fx.delay + CHARGE_MS * HIT_AT);
    anim.onfinish = onDone;
    return () => {
      clearTimeout(hit);
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={ref}
        className="pointer-events-none fixed z-[42] rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
        style={{ left: cx - cardW / 2, top: cy - cardH / 2, width: cardW, height: cardH }}
      >
        <CardFace def={db.get(fx.cardNo)} />
      </div>
      {impact && (
        <div className="pointer-events-none fixed z-[43]" style={{ left: impact.x, top: impact.y }}>
          <div className="absolute h-56 w-56 rounded-full" style={{ animation: 'fx-impact 0.5s ease-out both', background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(253,224,71,0.7) 25%, rgba(244,63,94,0.4) 50%, transparent 70%)' }} />
          <div className="absolute h-72 w-72 rounded-full border-4 border-yellow-200" style={{ animation: 'fx-impact-ring 0.55s ease-out both' }} />
        </div>
      )}
    </>
  );
}

/** การ์ดที่ออกจากสนาม: แตกกระจาย (ถูกทำลาย) / จางหายลงพื้น (สูญสลาย) */
/** จุดรอบขอบการ์ด (%) ใช้ทั้งรอยร้าวและเศษการ์ดที่แตก */
const SHARD_EDGE: [number, number][] = [
  [0, 0], [38, 0], [72, 0], [100, 0], [100, 34], [100, 70], [100, 100], [62, 100], [28, 100], [0, 100], [0, 64], [0, 28],
];
const SHARD_CENTER: [number, number] = [52, 46];

/** ฝุ่นแสงของการ์ดที่สูญสลาย: ตำแหน่งเริ่ม (% ของการ์ด) */
const DUST = Array.from({ length: 22 }, (_, i) => ({ x: 8 + ((i * 37) % 84), y: 6 + ((i * 53) % 88), s: 3 + (i % 3) * 2 }));

/**
 * การ์ดออกจากสนาม → กลายเป็นดวงวิญญาณลอยลง Trash
 *  - ถูกทำลาย: สั่น + รอยร้าววิ่งทั่วใบ → แตกเป็นเสี่ยง ๆ กระเด็น → ดวงวิญญาณสีส้มทอง
 *  - สูญสลาย: สีซีด → สลายจากล่างขึ้นบนเป็นฝุ่นแสง ฝุ่นรวมตัวกลางใบ → ดวงวิญญาณสีฟ้าม่วง
 */
function Ghost({ fx, onDone }: { fx: Extract<Fx, { kind: 'ghost' }>; onDone: () => void }) {
  const destroy = fx.mode === 'destroy';
  const total = destroy ? GHOST_MS.destroy : GHOST_MS.deplete;
  const [shown, setShown] = useState(!fx.hiddenUntilStart || fx.delay === 0);
  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => setShown(true), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [to] = useState(() => {
    const trash = rectOf(document.querySelector(`[data-trash="${fx.owner}"]`));
    return trash
      ? { dx: trash.x + trash.w / 2 - (fx.rect.x + fx.rect.w / 2), dy: trash.y + trash.h / 2 - (fx.rect.y + fx.rect.h / 2) }
      : { dx: 0, dy: 60 };
  });
  useEffect(() => {
    // Trash เรืองแสงรับดวงวิญญาณ
    const b = setTimeout(
      () =>
        document.querySelector(`[data-trash="${fx.owner}"]`)?.animate(
          [{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: `brightness(2) drop-shadow(0 0 12px ${destroy ? '#fb923c' : '#a5b4fc'})`, transform: 'scale(1.04)', offset: 0.3 }, { filter: 'brightness(1)', transform: 'scale(1)' }],
          { duration: 450, easing: 'ease-out' },
        ),
      fx.delay + total - 120,
    );
    const c = setTimeout(onDone, fx.delay + total);
    return () => [b, c].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const def = db.get(fx.cardNo);
  // กรอบกว้างกว่าสูง = การ์ดนอนอยู่ (เสื่อมสภาพ): วาดการ์ดตั้งตรงแล้วหมุน 90° ให้ตรงกับบนสนาม
  const lying = fx.rect.w > fx.rect.h;
  const cardW = lying ? fx.rect.h : fx.rect.w;
  const cardH = lying ? fx.rect.w : fx.rect.h;
  const soul = destroy
    ? { core: '#fff7ed', mid: '#fb923c', glow: 'rgba(251,146,60,0.9)' }
    : { core: '#eef2ff', mid: '#818cf8', glow: 'rgba(129,140,248,0.9)' };
  const soulAt = destroy ? GHOST_MS.destroyBreak : GHOST_MS.depleteGather;
  const vars = { '--dx': `${to.dx}px`, '--dy': `${to.dy}px` } as React.CSSProperties;
  const [cx, cy] = SHARD_CENTER;
  /** เวลาเริ่มของแอนิเมชันนี้ (ก่อนถึงเวลา การ์ดค้างอยู่ที่เดิม) */
  const D = fx.delay;
  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed z-[41]" style={{ left: fx.rect.x, top: fx.rect.y, width: fx.rect.w, height: fx.rect.h, ...vars }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative shrink-0" style={{ width: cardW, height: cardH, transform: lying ? 'rotate(90deg)' : undefined }}>
          {destroy ? (
            <>
              {/* การ์ดสั่น + รอยร้าว แล้วหายไปตอนแตก */}
              <div className="absolute inset-0" style={{ animation: `fx-g-crack-card ${GHOST_MS.destroyBreak}ms ${D}ms linear both` }}>
                <CardFace def={def} />
                <div className="absolute inset-0 rounded-lg bg-rose-500/30 mix-blend-screen" />
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{ filter: 'drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #fb923c)' }}>
                  {SHARD_EDGE.map(([x, y], i) => {
                    const mx = (cx + x) / 2 + (i % 2 ? 4 : -4);
                    const my = (cy + y) / 2 + (i % 3 ? -3 : 3);
                    return (
                      <polyline
                        key={i}
                        points={`${cx},${cy} ${mx},${my} ${x},${y}`}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={i % 3 === 0 ? 1.4 : 0.8}
                        vectorEffect="non-scaling-stroke"
                        pathLength={1}
                        strokeDasharray="1"
                        style={{ animation: `fx-fb-crack 0.22s ${D + 60 + (i % 6) * 30}ms ease-out both` }}
                      />
                    );
                  })}
                </svg>
              </div>
              {/* เศษการ์ด */}
              {SHARD_EDGE.map(([x, y], i) => {
                const [nx, ny] = SHARD_EDGE[(i + 1) % SHARD_EDGE.length]!;
                const ang = Math.atan2((y + ny) / 2 - cy, (x + nx) / 2 - cx);
                const dist = 70 + ((i * 29) % 50);
                return (
                  <div
                    key={i}
                    className="absolute inset-0 opacity-0"
                    style={
                      {
                        clipPath: `polygon(${cx}% ${cy}%, ${x}% ${y}%, ${nx}% ${ny}%)`,
                        '--tx': `${Math.cos(ang) * dist}px`,
                        '--ty': `${Math.sin(ang) * dist + 30}px`,
                        '--rot': `${(i % 2 ? 1 : -1) * (25 + ((i * 17) % 40))}deg`,
                        animation: `fx-g-shard 0.65s ${D + GHOST_MS.destroyBreak}ms cubic-bezier(.15,.7,.3,1) forwards`,
                      } as React.CSSProperties
                    }
                  >
                    <CardFace def={def} />
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {/* ซีด แล้วสลายจากล่างขึ้นบน */}
              <div className="absolute inset-0" style={{ animation: `fx-g-dissolve ${GHOST_MS.depleteGather}ms ${D}ms ease-in both` }}>
                <CardFace def={def} />
                <div className="absolute inset-0 rounded-lg bg-indigo-400/25 mix-blend-screen" />
              </div>
              {/* ขอบที่กำลังสลาย */}
              <div
                className="absolute inset-x-0 h-1.5 rounded-full bg-indigo-100"
                style={{ boxShadow: '0 0 12px 4px rgba(165,180,252,0.9)', animation: `fx-g-edge ${GHOST_MS.depleteGather}ms ${D}ms ease-in both` }}
              />
              {/* ฝุ่นแสงลอยขึ้นแล้วรวมกลางใบ */}
              {DUST.map((d, i) => (
                <div
                  key={i}
                  className="absolute rounded-full bg-indigo-100"
                  style={
                    {
                      left: `${d.x}%`,
                      top: `${d.y}%`,
                      width: d.s,
                      height: d.s,
                      boxShadow: '0 0 6px 2px rgba(165,180,252,0.9)',
                      '--gx': `${((cx - d.x) / 100) * cardW}px`,
                      '--gy': `${((cy - d.y) / 100) * cardH}px`,
                      animation: `fx-g-dust ${GHOST_MS.depleteGather - (100 - d.y) * 3}ms ${D + (100 - d.y) * 3}ms ease-in both`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </>
          )}
        </div>
      </div>
      {/* ดวงวิญญาณ + หางแสง ลอยโค้งลง Trash */}
      {[0, 1, 2].map((k) => (
        <div
          key={k}
          className="absolute top-1/2 left-1/2 rounded-full"
          style={{
            width: 34 - k * 9,
            height: 34 - k * 9,
            opacity: 0,
            background: `radial-gradient(circle, ${soul.core} 0%, ${soul.mid} 45%, transparent 72%)`,
            boxShadow: `0 0 ${24 - k * 6}px ${8 - k * 2}px ${soul.glow}`,
            animation: `fx-g-soul ${total - soulAt}ms ${D + soulAt + k * 55}ms cubic-bezier(.45,0,.35,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- attack arrow

type Line = { x1: number; y1: number; x2: number; y2: number };

function centerOf(selector: string): { x: number; y: number } | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** ลูกศรจากผู้โจมตีไปยังผู้ป้องกัน (หรือ Life ของฝ่ายป้องกันถ้ายังไม่มีผู้ป้องกัน) */
export function AttackArrow() {
  const battle = useGame((s) => s.state.battle);
  const turnPlayer = useGame((s) => s.state.turnPlayer);
  const [lines, setLines] = useState<Line[]>([]);
  const attacker = battle?.attackerId;
  const blockers = battle?.blockers.join(',') ?? '';

  useLayoutEffect(() => {
    if (!attacker) {
      setLines([]);
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      const from = centerOf(`[data-field-card="${attacker}"] > div`);
      const targets = blockers
        ? blockers.split(',').map((id) => centerOf(`[data-field-card="${id}"] > div`))
        : [centerOf(`[data-life="${opponentOf(turnPlayer)}"]`)];
      const next = from ? targets.filter((t): t is { x: number; y: number } => !!t).map((t) => ({ x1: from.x, y1: from.y, x2: t.x, y2: t.y })) : [];
      const key = next.map((l) => `${l.x1 | 0},${l.y1 | 0},${l.x2 | 0},${l.y2 | 0}`).join(';');
      if (key !== last) {
        last = key;
        setLines(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [attacker, blockers, turnPlayer]);

  if (lines.length === 0) return null;
  const color = blockers ? '#38bdf8' : '#f43f5e';
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" style={{ filter: `drop-shadow(0 0 8px ${color})` }}>
      <defs>
        <marker id="fx-arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      {lines.map((l, i) => {
        // หยุดก่อนถึงกลางเป้าหมายเล็กน้อยให้หัวลูกศรไม่จมใต้การ์ด
        const dx = l.x2 - l.x1;
        const dy = l.y2 - l.y1;
        const len = Math.hypot(dx, dy) || 1;
        const end = { x: l.x2 - (dx / len) * 40, y: l.y2 - (dy / len) * 40 };
        return (
          <g key={i}>
            <line x1={l.x1} y1={l.y1} x2={end.x} y2={end.y} stroke={color} strokeOpacity={0.25} strokeWidth={18} strokeLinecap="round" />
            <line
              x1={l.x1}
              y1={l.y1}
              x2={end.x}
              y2={end.y}
              stroke={color}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray="22 8"
              markerEnd="url(#fx-arrowhead)"
              style={{ animation: 'fx-dash 0.6s linear infinite' }}
            />
          </g>
        );
      })}
    </svg>
  );
}
