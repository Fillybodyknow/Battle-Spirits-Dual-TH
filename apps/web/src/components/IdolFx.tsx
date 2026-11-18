/**
 * ธีมไอดอล (เผ่า [ดีว่า] BS07): เวที สปอตไลต์ ดาว โน้ตดนตรี กระดาษสี · สีหลักเหลืองทอง + ชมพู
 *  - IdolFxView: ON STAGE! (ม่านเปิด) / MY UNIT! (เส้นเชื่อมผู้โจมตีกับตัวที่มาวางชิด) / โน้ตดนตรี (วาง/ทิ้งเพลง) / SOLO PART
 *  - CutInIdol: ฉากอัญเชิญของการ์ดเผ่าดีว่า
 *  - IdolSparkles: ประกายดาวรอบการ์ดดีว่าตอนเอฟเฟกต์ทำงาน
 *  - SongWaves: คลื่นเสียง + โน้ตหมุนรอบเมจิคไทป์เพลงตอนร่าย
 * ทุกอย่างวาดด้วย CSS/SVG เอง (ไม่ใช้อีโมจิ: Windows 7 แสดงเป็นกล่องว่าง)
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { db, layoutRect, type Fx, type Rect } from '../store';
import { effects } from '../gfx';

export const DIVA = 'ดีว่า';
export const isDivaCard = (cardNo: string) => db.get(cardNo).family.includes(DIVA);
export const isSongCard = (cardNo: string) => db.get(cardNo).magicTypes.includes('เพลง');

const GOLD = '#fde047';
const PINK = '#f472b6';
const CONFETTI = ['#fde047', '#f472b6', '#38bdf8', '#a78bfa', '#fb923c', '#ffffff'];

/** สุ่มแบบคงที่ (เลขเดิมได้ค่าเดิม) */
const rnd = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** โน้ตดนตรี (เขบ็ต 1 ชั้น / 2 ตัวเชื่อมกัน) */
export function Note({ size = 22, color = GOLD, double = false, style }: { size?: number; color?: string; double?: boolean; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {double ? (
        <path d="M9 4 L21 2 V15.5 A3 3 0 1 1 19 12.8 V6.6 L11 8 V17.5 A3 3 0 1 1 9 14.8 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" />
      ) : (
        <path d="M11 3 V15.6 A3.4 3.4 0 1 1 9 12.6 V3 Z M11 3 C15 4 18 6 17 10 C16 7.5 13.5 6.8 11 6.8 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" />
      )}
    </svg>
  );
}

/** ดาว 5 แฉก */
export function Star({ size = 16, color = GOLD, style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      <path d="M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.1 L18.5 21.6 L12 17.6 L5.5 21.6 L7.3 14.1 L1.5 9.2 L9.1 8.6 Z" fill={color} />
    </svg>
  );
}

/** ไมโครโฟน */
function Mic({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="idol-mic" x1="0" x2="1">
          <stop offset="0" stopColor="#fef08a" />
          <stop offset="0.5" stopColor="#facc15" />
          <stop offset="1" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      <rect x="16" y="4" width="16" height="24" rx="8" fill="url(#idol-mic)" stroke="#713f12" strokeWidth="1.5" />
      <path d="M18 12 H30 M18 17 H30 M18 22 H30" stroke="#a16207" strokeWidth="1.2" />
      <path d="M11 22 A13 13 0 0 0 37 22" fill="none" stroke="#fde047" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 35 V43 M17 43 H31" stroke="#fde047" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** ข้อความหัวเรื่องแบบโลโก้ไอดอล (ไล่สีเหลือง-ชมพู ขอบขาว มีดาวประดับ) */
function IdolTitle({ text, sub, size = 64 }: { text: string; sub?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center" style={{ animation: 'idol-title 0.7s cubic-bezier(.2,1.4,.4,1) both' }}>
      <div className="relative">
        <Star size={size * 0.5} color={PINK} style={{ position: 'absolute', left: -size * 0.55, top: -size * 0.1, animation: 'idol-spin 3s linear infinite' }} />
        <Star size={size * 0.38} color={GOLD} style={{ position: 'absolute', right: -size * 0.5, bottom: -size * 0.05, animation: 'idol-spin 2.4s linear infinite reverse' }} />
        <span
          className="block font-black whitespace-nowrap italic"
          style={{
            fontSize: size,
            lineHeight: 1.05,
            letterSpacing: '0.04em',
            background: 'linear-gradient(180deg, #fffbeb 0%, #fde047 38%, #f59e0b 60%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextStroke: '2px #ffffff',
            filter: 'drop-shadow(0 4px 0 #be185d) drop-shadow(0 0 18px rgba(250,204,21,0.8))',
          }}
        >
          {text}
        </span>
      </div>
      {sub && (
        <span className="mt-2 rounded-full px-4 py-0.5 text-base font-bold text-slate-950 shadow-lg" style={{ background: 'linear-gradient(90deg, #fde047, #f9a8d4)' }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/** กระดาษสีโปรยลงทั้งจอ */
function Confetti({ count, delay = 0, duration = 1600 }: { count: number; delay?: number; duration?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${rnd(i + 11) * 100}%`,
            width: 6 + rnd(i + 21) * 6,
            height: 10 + rnd(i + 31) * 8,
            background: CONFETTI[i % CONFETTI.length],
            borderRadius: i % 3 === 0 ? '50%' : 2,
            ['--dx' as string]: `${(rnd(i + 41) - 0.5) * 18}vw`,
            ['--r' as string]: `${360 + rnd(i + 51) * 720}deg`,
            animation: `idol-confetti ${duration * (0.7 + rnd(i + 61) * 0.5)}ms ${delay + rnd(i + 71) * 500}ms ease-in both`,
          }}
        />
      ))}
    </>
  );
}

/** ลำแสงสปอตไลต์จากด้านบน ส่ายไปมา */
function Spotlights({ n, color = 'rgba(253,224,71,0.55)', delay = 0 }: { n: number; color?: string; delay?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = ((i + 0.5) / n) * 100;
        return (
          <div
            key={i}
            className="absolute top-[-8%] h-[120%] w-[26vw] origin-top"
            style={{
              left: `${x}%`,
              translate: '-50% 0',
              background: `linear-gradient(to bottom, ${i % 2 ? 'rgba(249,168,212,0.6)' : color}, transparent 85%)`,
              clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)',
              ['--a' as string]: `${(i - (n - 1) / 2) * 14}deg`,
              animation: `idol-sway ${1100 + i * 170}ms ${delay}ms ease-in-out infinite alternate`,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
    </>
  );
}

const cardRectOf = (id: string): Rect | null => layoutRect(document.querySelector(`[data-field-card="${id}"] > div:first-child`));

type IdolFx = Extract<Fx, { kind: 'idol' }>;

/** แอนิเมชันธีมไอดอลตาม variant */
export function IdolFxView({ fx, onDone }: { fx: IdolFx; onDone: () => void }) {
  const [shown, setShown] = useState(fx.delay === 0);
  useEffect(() => {
    const a = setTimeout(() => setShown(true), fx.delay);
    const b = setTimeout(onDone, fx.delay + fx.duration);
    return () => [a, b].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!shown) return null;
  if (fx.variant === 'onStage') return <OnStage fx={fx} />;
  if (fx.variant === 'myUnit') return <MyUnit fx={fx} />;
  if (fx.variant === 'soloPart') return <SoloPart fx={fx} />;
  return <Notes fx={fx} />;
}

/** ON STAGE!: ม่านเวทีแดงเปิดออก → สปอตไลต์ส่าย → ชื่อการ์ด + กระดาษสี */
function OnStage({ fx }: { fx: IdolFx }) {
  const rich = effects().matMotion;
  const d = fx.duration;
  const curtain = (side: 'l' | 'r') => (
    <div
      className={`absolute inset-y-0 w-1/2 ${side === 'l' ? 'left-0' : 'right-0'}`}
      style={{
        background:
          'repeating-linear-gradient(90deg, #7f1d1d 0px, #b91c1c 22px, #991b1b 38px, #7f1d1d 56px), linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.45))',
        backgroundBlendMode: 'multiply',
        boxShadow: side === 'l' ? 'inset -18px 0 30px rgba(0,0,0,0.5)' : 'inset 18px 0 30px rgba(0,0,0,0.5)',
        animation: `idol-curtain-${side} ${d}ms cubic-bezier(.6,0,.3,1) both`,
      }}
    />
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[46] overflow-hidden" style={{ animation: `idol-fade ${d}ms ease-out both` }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(244,114,182,0.35), rgba(15,10,40,0.82) 60%)' }} />
      <Spotlights n={rich ? 4 : 2} delay={Math.round(d * 0.3)} />
      {rich && <Confetti count={42} delay={Math.round(d * 0.35)} duration={d * 0.7} />}
      <div className="absolute inset-0 flex items-center justify-center" style={{ animation: `idol-pop-in ${d}ms ease-out both` }}>
        <IdolTitle text="ON STAGE!" sub={fx.title} size={72} />
      </div>
      {curtain('l')}
      {curtain('r')}
      {/* ระบายม่านด้านบนสีทอง */}
      <div
        className="absolute inset-x-0 top-0 h-[9%]"
        style={{
          background: 'radial-gradient(circle at 50% 0, #b91c1c 60%, transparent 62%) 0 0 / 80px 100%, linear-gradient(#991b1b, #7f1d1d)',
          borderBottom: '4px solid #facc15',
          boxShadow: '0 4px 16px rgba(250,204,21,0.6)',
        }}
      />
    </div>
  );
}

/** MY UNIT!: วงแสงรอบผู้โจมตีกับตัวที่มาวางชิด + เส้นแสงเชื่อม + โลโก้ */
function MyUnit({ fx }: { fx: IdolFx }) {
  const ids = [fx.cardId!, ...(fx.cardIds ?? [])];
  const rects = ids.map(cardRectOf).filter((r): r is Rect => !!r);
  const c = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const d = fx.duration;
  return (
    <div className="pointer-events-none fixed inset-0 z-[46]" style={{ animation: `idol-fade ${d}ms ease-out both` }}>
      <div className="absolute inset-0 bg-slate-950/45" />
      <svg className="absolute inset-0 h-full w-full">
        {rects.slice(1).map((r, i) => {
          const a = c(rects[0]!);
          const b = c(r);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={i % 2 ? PINK : GOLD}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="14 10"
              style={{ filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.9))', animation: 'idol-dash 0.6s linear infinite' }}
            />
          );
        })}
      </svg>
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute rounded-lg"
          style={{
            left: r.x - 6,
            top: r.y - 6,
            width: r.w + 12,
            height: r.h + 12,
            border: `4px solid ${i === 0 ? GOLD : PINK}`,
            boxShadow: `0 0 24px 6px ${i === 0 ? 'rgba(250,204,21,0.8)' : 'rgba(244,114,182,0.8)'}`,
            animation: `idol-ring-pulse 0.7s ${i * 120}ms ease-in-out infinite alternate`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 top-[30%] flex justify-center">
        <IdolTitle text="MY UNIT!" sub={fx.title} size={56} />
      </div>
    </div>
  );
}

/** SOLO PART: วงแสงทองขยาย + ไมโครโฟน + ป้าย บนการ์ดที่ให้ความสามารถ */
function SoloPart({ fx }: { fx: IdolFx }) {
  const r = cardRectOf(fx.cardId!);
  if (!r) return null;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return (
    <div className="pointer-events-none fixed inset-0 z-[48]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: cx,
            top: cy,
            width: r.h * 1.3,
            height: r.h * 1.3,
            translate: '-50% -50%',
            border: `4px solid ${i === 1 ? PINK : GOLD}`,
            boxShadow: '0 0 20px rgba(250,204,21,0.8)',
            animation: `idol-ring ${fx.duration * 0.7}ms ${i * 160}ms ease-out both`,
          }}
        />
      ))}
      <div className="absolute flex flex-col items-center" style={{ left: cx, top: r.y - 8, translate: '-50% -100%', animation: `idol-title 0.6s cubic-bezier(.2,1.4,.4,1) both` }}>
        <Mic size={52} />
        <span className="rounded-full px-3 py-0.5 text-sm font-black tracking-widest text-slate-950 italic shadow-lg" style={{ background: 'linear-gradient(90deg, #fde047, #f9a8d4)' }}>
          SOLO PART
        </span>
      </div>
    </div>
  );
}

/** โน้ตดนตรีลอยขึ้น (วางเพลง) / กระจายออก (ทิ้งเพลง) */
function Notes({ fx }: { fx: IdolFx }) {
  const r = fx.rect ?? (fx.anchor ? layoutRect(document.querySelector(fx.anchor)) : null);
  if (!r) return null;
  const burst = fx.variant === 'notesBurst';
  const n = effects().matMotion ? 9 : 5;
  return (
    <div className="pointer-events-none fixed inset-0 z-[47]">
      {Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2;
        const dx = burst ? Math.cos(ang) * (60 + rnd(i) * 40) : (rnd(i + 3) - 0.5) * 90;
        const dy = burst ? Math.sin(ang) * (60 + rnd(i) * 40) : -(70 + rnd(i + 5) * 70);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: r.x + r.w / 2,
              top: r.y + r.h / 2,
              ['--dx' as string]: `${dx}px`,
              ['--dy' as string]: `${dy}px`,
              animation: `idol-note-fly ${fx.duration * (0.75 + rnd(i + 9) * 0.25)}ms ${i * 60}ms ease-out both`,
            }}
          >
            <Note size={18 + rnd(i + 7) * 12} color={i % 3 === 0 ? PINK : i % 3 === 1 ? GOLD : '#7dd3fc'} double={i % 2 === 0} />
          </div>
        );
      })}
    </div>
  );
}

/** ฉากอัญเชิญของการ์ดเผ่าดีว่า (ใช้แทนธีมตามสี) */
export function CutInIdol({ at, special, n }: { at: number; special: boolean; n: (full: number, low: number) => number }) {
  const twinkles = n(special ? 30 : 20, 8);
  return (
    <>
      {/* เวที: พื้นหลังม่วงเข้ม + พื้นเวทีเรืองชมพู */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 110%, rgba(244,114,182,0.55), rgba(76,29,149,0.55) 45%, rgba(15,10,40,0.7) 75%)', animation: `ci-fade-in ${at}ms ease-in both` }} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Spotlights n={n(special ? 5 : 3, 2)} delay={Math.round(at * 0.4)} />
      </div>
      {/* ป้ายไฟขอบบน/ล่าง */}
      {(['top', 'bottom'] as const).map((side) => (
        <div
          key={side}
          className={`pointer-events-none absolute inset-x-0 ${side === 'top' ? 'top-[6%]' : 'bottom-[6%]'} h-3`}
          style={{
            background: `radial-gradient(circle, ${GOLD} 35%, transparent 40%) 0 50% / 26px 100%`,
            filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.9))',
            animation: `idol-bulbs 0.5s steps(2) infinite, ci-fade-in ${at}ms ease-in both`,
          }}
        />
      ))}
      {/* ดาวระยิบระยับ */}
      {Array.from({ length: twinkles }, (_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute"
          style={{ left: `${rnd(i + 101) * 100}%`, top: `${rnd(i + 201) * 100}%`, animation: `ci-twinkle ${700 + rnd(i + 301) * 700}ms ${at * 0.5 + rnd(i + 401) * 900}ms ease-in-out infinite` }}
        >
          <Star size={10 + rnd(i + 501) * 16} color={i % 3 ? GOLD : PINK} />
        </div>
      ))}
      {/* ทุบ: กระดาษสีโปรย */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Confetti count={n(special ? 48 : 30, 12)} delay={at} />
      </div>
    </>
  );
}

/** ประกายดาวรอบการ์ดเผ่าดีว่าตอนเอฟเฟกต์ทำงาน (แทนวงแสงทองธรรมดา) */
export function IdolSparkles({ rect, delay, duration }: { rect: Rect; delay: number; duration: number }) {
  const n = effects().matMotion ? 12 : 6;
  return (
    <div className="pointer-events-none fixed z-[48]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2;
        return (
          <div
            key={i}
            className="absolute top-1/2 left-1/2"
            style={{
              ['--dx' as string]: `${Math.cos(ang) * (rect.w * 0.75 + rnd(i) * 30)}px`,
              ['--dy' as string]: `${Math.sin(ang) * (rect.h * 0.62 + rnd(i + 1) * 30)}px`,
              animation: `idol-note-fly ${duration * 0.7}ms ${delay + duration * 0.15 + i * 35}ms ease-out both`,
            }}
          >
            {i % 4 === 0 ? <Note size={20} color={PINK} /> : <Star size={12 + rnd(i + 2) * 12} color={i % 2 ? GOLD : '#fef9c3'} />}
          </div>
        );
      })}
    </div>
  );
}

/** เมจิคไทป์เพลงบนเวที: คลื่นเสียงขยายเป็นจังหวะ + โน้ตหมุนรอบการ์ด */
export function SongWaves({ color }: { color: string }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 aspect-square w-[150%] rounded-full"
          style={{ border: `3px solid ${color}`, boxShadow: `0 0 16px ${color}`, animation: `idol-wave 1.8s ${i * 600}ms ease-out infinite` }}
        />
      ))}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 aspect-square w-[190%]" style={{ translate: '-50% -50%', animation: 'idol-spin 6s linear infinite' }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const ang = (i / 5) * Math.PI * 2;
          return (
            <div key={i} className="absolute" style={{ left: `${50 + 46 * Math.sin(ang)}%`, top: `${50 - 46 * Math.cos(ang)}%`, translate: '-50% -50%' }}>
              <Note size={26} color={i % 2 ? PINK : GOLD} double={i % 2 === 0} />
            </div>
          );
        })}
      </div>
    </>
  );
}
