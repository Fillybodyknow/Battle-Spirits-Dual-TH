/**
 * ธีมไอดอล (เผ่า [ดีว่า] BS07): เวที สปอตไลต์ ดาว โน้ตดนตรี กระดาษสี · สีหลักเหลืองทอง + ชมพู
 *  - IdolFxView: ON STAGE! (ม่านเปิด) / MY UNIT! (เส้นเชื่อมผู้โจมตีกับตัวที่มาวางชิด) / โน้ตดนตรี (วาง/ทิ้งเพลง) / SOLO PART
 *  - CutInIdol: ฉากอัญเชิญของการ์ดเผ่าดีว่า
 *  - IdolSparkles: ประกายดาวรอบการ์ดดีว่าตอนเอฟเฟกต์ทำงาน
 *  - SongWaves: คลื่นเสียง + โน้ตหมุนรอบเมจิคไทป์เพลงตอนร่าย
 * ทุกอย่างวาดด้วย CSS/SVG เอง (ไม่ใช้อีโมจิ: Windows 7 แสดงเป็นกล่องว่าง)
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { db, layoutRect, ON_STAGE_CURTAIN, ON_STAGE_REVEAL, SOUL_DRIVE_BREAK, useGame, type Fx, type Rect } from '../store';
import { IMG } from '../assets';
import { CardBack, CardFace } from './CardFace';
import { effects, flashScale, shakeScale, shakeTarget } from '../gfx';

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
  if (fx.variant === 'soulDrive') return <SoulDrive fx={fx} />;
  return <Notes fx={fx} />;
}

/**
 * ON STAGE!: เล่นตอนการ์ดถูกอัญเชิญด้วย On Stage (เวลาตาม ON_STAGE_* ใน store)
 *  ม่านแดงปิดอยู่ (แสงลอดรอยต่อ) → ม่านเปิด สปอตไลต์ส่องกลางเวที → การ์ดใหม่ลอยขึ้นจากพื้นเวทีพร้อมพลิกจากหลังการ์ดเป็นหน้าการ์ด
 *  → แสงวาบ + รัศมีหมุน + ดาวระยิบรอบการ์ด + โลโก้ ON STAGE! + ริบบิ้นชื่อการ์ด + กระดาษสี → การ์ดบินจากเวทีลงสนาม (fly 'center')
 *  การ์ดกลางเวทีวางตำแหน่ง/ขนาดเดียวกับจุดเริ่มของการ์ดที่บินต่อ (กึ่งกลางกระดาน 300×420) ส่งต่อได้เนียน
 */
const STAGE_W = 300;
const STAGE_H = 420;
function OnStage({ fx }: { fx: IdolFx }) {
  const rich = effects().matMotion;
  const d = fx.duration;
  const at = (p: number) => Math.round(d * p);
  /** การ์ด X-Rare ขึ้นเวที: แสงวาบหนัก + จอสั่น + ฟอยรุ้งวิ่งผ่านการ์ด + รัศมีรุ้ง + ป้าย X-RARE */
  const special = !!fx.special;
  useEffect(() => {
    if (!special) return;
    const k = shakeScale();
    if (k === 0) return;
    const t = setTimeout(() => {
      shakeTarget()?.animate(
        [[0, 0], [0, 12], [-10, -7], [8, 5], [-4, -3], [0, 0]].map(([x, y]) => ({ transform: `translate(${x! * k}px,${y! * k}px)` })),
        { duration: 560, easing: 'ease-out' },
      );
    }, at(ON_STAGE_REVEAL));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')) || 0;
  const cx = (innerWidth - sidebar) / 2;
  const cy = innerHeight / 2;
  const def = fx.cardId ? db.get(useGame.getState().state.cards[fx.cardId]?.cardNo ?? '') : null;
  const curtain = (side: 'l' | 'r') => (
    <div
      className={`absolute inset-y-0 w-1/2 ${side === 'l' ? 'left-0' : 'right-0'}`}
      style={{
        background:
          'repeating-linear-gradient(90deg, #7f1d1d 0px, #b91c1c 22px, #991b1b 38px, #7f1d1d 56px), linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.45))',
        backgroundBlendMode: 'multiply',
        boxShadow: side === 'l' ? 'inset -18px 0 30px rgba(0,0,0,0.5)' : 'inset 18px 0 30px rgba(0,0,0,0.5)',
        animation: `ostage-curtain-${side} ${d}ms cubic-bezier(.6,0,.3,1) both`,
      }}
    />
  );
  /** ดาวระยิบรอบการ์ด (เริ่มหลังการ์ดเผยหน้า) */
  const stars = Array.from({ length: rich ? 10 : 5 }, (_, i) => {
    const ang = (i / (rich ? 10 : 5)) * Math.PI * 2 + 0.4;
    const rx = STAGE_W * 0.62 + rnd(i + 3) * 30;
    const ry = STAGE_H * 0.56 + rnd(i + 7) * 30;
    return { x: Math.cos(ang) * rx, y: Math.sin(ang) * ry, size: 18 + rnd(i + 5) * 16, delay: at(ON_STAGE_REVEAL) + i * 60, color: i % 2 ? PINK : GOLD };
  });
  return (
    <div className="pointer-events-none fixed inset-0 z-[46] overflow-hidden" style={{ animation: `idol-fade ${d}ms ease-out both` }}>
      {/* เวทีมืด + แสงชมพูจากพื้นเวที */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(244,114,182,0.4), rgba(15,10,40,0.88) 62%)' }} />
      <Spotlights n={rich ? 4 : 2} delay={at(ON_STAGE_CURTAIN)} />
      {/* แสงวงรีบนพื้นเวทีใต้การ์ด */}
      <div
        className="absolute rounded-[50%]"
        style={{
          left: cx - STAGE_W * 0.9,
          top: cy + STAGE_H * 0.38,
          width: STAGE_W * 1.8,
          height: STAGE_H * 0.32,
          background: 'radial-gradient(ellipse, rgba(253,224,71,0.75), rgba(244,114,182,0.35) 45%, transparent 70%)',
          animation: `ostage-floor ${d}ms ease-out both`,
        }}
      />
      {/* รัศมีหมุนหลังการ์ด */}
      <div className="absolute" style={{ left: cx - 380, top: cy - 380, width: 760, height: 760, animation: `ostage-rays ${d}ms ease-out both` }}>
        <div
          className="h-full w-full rounded-full"
          style={{
            background: special
              ? 'repeating-conic-gradient(from 0deg, rgba(253,224,71,0.7) 0deg 7deg, transparent 7deg 15deg, rgba(244,114,182,0.6) 15deg 22deg, transparent 22deg 30deg, rgba(56,189,248,0.55) 30deg 37deg, transparent 37deg 45deg)'
              : 'repeating-conic-gradient(from 0deg, rgba(253,224,71,0.55) 0deg 8deg, transparent 8deg 22deg, rgba(249,168,212,0.45) 22deg 30deg, transparent 30deg 45deg)',
            maskImage: 'radial-gradient(circle, #000 18%, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 18%, transparent 68%)',
            animation: rich ? 'idol-spin 9s linear infinite' : undefined,
          }}
        />
      </div>
      {/* การ์ดขึ้นเวที: ลอยขึ้นจากพื้น + พลิกจากหลังการ์ดเป็นหน้าการ์ด
          พลิกแบบ 2 มิติ (หลังการ์ดหดกว้างเป็น 0 แล้วหน้าการ์ดขยายออก): แบบ 3 มิติ (backface-visibility) หลังการ์ดไม่ซ่อนจริง
          เมื่อหน้าการ์ดมีชั้นที่เคลื่อนไหวแยก (ฟอยรุ้งของ X-Rare) เห็นหน้าการ์ดตะแคงไปมาแทน */}
      <div className="absolute" style={{ left: cx - STAGE_W / 2, top: cy - STAGE_H / 2, width: STAGE_W, height: STAGE_H }}>
        <div className="relative h-full w-full" style={{ animation: `ostage-card ${d}ms cubic-bezier(.2,.8,.3,1) both` }}>
          <div className="absolute inset-0" style={{ animation: `ostage-back ${d}ms ease-in both` }}>
            <CardBack />
          </div>
          <div className={`absolute inset-0 overflow-hidden rounded-xl ${special ? 'shadow-[0_0_60px_18px_rgba(250,204,21,0.75)]' : 'shadow-[0_0_40px_10px_rgba(250,204,21,0.55)]'}`} style={{ animation: `ostage-front ${d}ms ease-out both` }}>
            {def && <CardFace def={def} />}
            {/* X-Rare: แถบฟอยรุ้งวิ่งผ่านการ์ด 2 รอบหลังเผยหน้า */}
            {special && (
              <div
                className="absolute inset-y-[-20%] left-0 w-1/2"
                style={{
                  background: 'linear-gradient(100deg, transparent 10%, rgba(255,255,255,0.0) 20%, rgba(253,224,71,0.55) 35%, rgba(244,114,182,0.55) 48%, rgba(56,189,248,0.55) 60%, rgba(255,255,255,0.7) 66%, transparent 80%)',
                  mixBlendMode: 'screen',
                  animation: `ostage-holo 900ms ${at(ON_STAGE_REVEAL)}ms ease-in-out 2 both`,
                }}
              />
            )}
          </div>
        </div>
      </div>
      {/* แสงวาบตอนเผยหน้า */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,255,255,0.95), rgba(253,224,71,0.5) 22%, transparent 55%)`, animation: `ostage-flash ${d}ms ease-out both` }} />
      {/* X-Rare: แสงวาบขาวเต็มจอตอนเผยหน้า (ตามตั้งค่าลดแสงวาบ) */}
      {special && (
        <div className="absolute inset-0" style={{ opacity: flashScale() }}>
          <div className="absolute inset-0 bg-white" style={{ animation: `ostage-flash-x ${d}ms ease-out both` }} />
        </div>
      )}
      {stars.map((st, i) => (
        <div key={i} className="absolute" style={{ left: cx + st.x - st.size / 2, top: cy + st.y - st.size / 2, animation: `ostage-star 900ms ${st.delay}ms ease-out both` }}>
          <Star size={st.size} color={st.color} style={{ animation: 'idol-spin 2.6s linear infinite' }} />
        </div>
      ))}
      {rich && <Confetti count={46} delay={at(ON_STAGE_REVEAL)} duration={d * 0.6} />}
      {/* โลโก้เหนือการ์ด + ริบบิ้นชื่อการ์ดใต้การ์ด */}
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: cy - STAGE_H / 2 - (special ? 128 : 96), animation: `ostage-pop ${d}ms ease-out both` }}>
        {special && (
          <span
            className="mb-1 rounded-full px-4 py-0.5 text-sm font-black tracking-[0.3em] text-white shadow-[0_0_18px_rgba(250,204,21,0.9)]"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #ec4899, #8b5cf6, #38bdf8, #22c55e, #f59e0b)', border: '2px solid #fff' }}
          >
            X-RARE
          </span>
        )}
        <IdolTitle text="ON STAGE!" size={64} />
      </div>
      {fx.title && (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: cy + STAGE_H / 2 + 14, animation: `ostage-pop ${d}ms ease-out both` }}>
          <span
            className="rounded-full px-6 py-1 text-lg font-black whitespace-nowrap text-slate-950 shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
            style={{ background: 'linear-gradient(90deg, #fde047, #f9a8d4, #fde047)', border: '2px solid #fff' }}
          >
            {fx.title}
          </span>
        </div>
      )}
      {curtain('l')}
      {curtain('r')}
      {/* แสงลอดรอยต่อม่านก่อนเปิด */}
      <div
        className="absolute inset-y-0 w-10"
        style={{ left: cx - 20, background: 'linear-gradient(90deg, transparent, rgba(253,224,71,0.85), transparent)', animation: `ostage-seam ${d}ms ease-in both` }}
      />
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

/**
 * SOUL DRIVE: บีบโซลคอร์จนแตก (keyframes sd-* ใน index.css · สัดส่วนเวลาตรงกับ SOUL_DRIVE_* ใน store)
 *  โซลคอร์ลอยขึ้นเหนือการ์ด (ใหญ่ เรืองแสง) → ถูกบีบ: โซลคอร์สั่นและยุบ รอยร้าวลามขึ้น 3 ระดับ
 *  → แตก: แสงวาบ + คลื่นกระแทก + เศษผลึกและประกายปลิวรอบทิศ + จอสั่น → ป้าย SOUL DRIVE กระแทกลง
 */
const SD_SHARDS = 14;
const SD_SPARKS = 18;
function SoulDrive({ fx }: { fx: IdolFx }) {
  const rich = effects().matMotion;
  const d = fx.duration;
  useEffect(() => {
    const k = shakeScale();
    if (k === 0) return;
    const t = setTimeout(() => {
      shakeTarget()?.animate(
        [[0, 0], [-14, 9], [12, -8], [-8, 6], [5, -3], [-2, 1], [0, 0]].map(([x, y]) => ({ transform: `translate(${x! * k}px,${y! * k}px)` })),
        { duration: 620, easing: 'ease-out' },
      );
    }, Math.round(d * SOUL_DRIVE_BREAK));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ซ่อนลูกศรโจมตีระหว่างฉาก (ลูกศรวาดคนละชั้น ทับโซลคอร์)
  useEffect(() => {
    document.body.classList.add('fx-soul-drive');
    return () => document.body.classList.remove('fx-soul-drive');
  }, []);
  const r = cardRectOf(fx.cardId!);
  if (!r) return null;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const S = Math.max(140, r.w * 1.3);
  const box = (w: number, h = w): CSSProperties => ({ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h });
  const anim = (name: string, easing = 'linear') => `${name} ${d}ms ${easing} both`;
  // รอยร้าว 3 ระดับ (เส้นจากจุดกลางออกไปขอบ) พิกัดใน viewBox 0..100
  const cracks = [
    'M50 50 L38 30 L41 18 M50 50 L66 40 L80 36 M50 50 L46 70',
    'M38 30 L24 26 M66 40 L70 22 L78 12 M46 70 L58 84 M46 70 L30 78',
    'M50 50 L20 52 L10 46 M24 26 L18 14 M80 36 L90 48 M58 84 L66 94 M30 78 L22 90 M70 22 L60 8',
  ];
  const shards = rich ? SD_SHARDS : 8;
  const sparks = rich ? SD_SPARKS : 6;
  return (
    <div className="pointer-events-none fixed inset-0 z-[49] overflow-hidden">
      {/* ฉากมืดลงรอบการ์ด */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(46,16,101,0.25), rgba(2,6,23,0.72) 60%)`, animation: anim('sd-dim') }} />
      {/* แสงพลังรวมหลังโซลคอร์ (แรงขึ้นตอนถูกบีบ แล้วระเบิดออก) */}
      <div style={{ ...box(S * 1.9), borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,114,182,0.85), rgba(168,85,247,0.55) 38%, transparent 70%)', animation: anim('sd-glow', 'ease-out') }} />
      {/* โซลคอร์: ใหญ่ขึ้น → ถูกบีบสั่นยุบ → พองแล้วแตก */}
      <div style={{ ...box(S * 0.8), animation: anim('sd-orb', 'ease-in-out') }}>
        <img src={IMG.soulCore} alt="" draggable={false} className="h-full w-full select-none" style={{ filter: 'drop-shadow(0 0 18px rgba(244,114,182,0.95)) brightness(1.15)' }} />
        {/* แสงลอดจากข้างใน (สว่างขึ้นเรื่อย ๆ ตอนรอยร้าวลาม) */}
        <div className="absolute inset-[18%] rounded-full" style={{ background: 'radial-gradient(circle, #ffffff, rgba(253,224,255,0.8) 40%, transparent 72%)', animation: anim('sd-core-light') }} />
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {cracks.map((p, i) => (
            <g key={i} style={{ animation: anim(`sd-crack${i + 1}`) }}>
              {/* รอยร้าว = แสงขาวลอดออกมา (ขอบม่วงเรือง) ทับเส้นเข้มบาง ๆ ให้เห็นชัดบนโซลคอร์สีอ่อน */}
              <path d={p} stroke="#2e1065" strokeWidth={5.5 - i} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <path d={p} stroke="#ffffff" strokeWidth={2.4 - i * 0.4} fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 3px #f0abfc) drop-shadow(0 0 6px #e879f9)' }} />
            </g>
          ))}
        </svg>
      </div>
      {/* แตก: แสงวาบ (ตามตั้งค่าลดแสงวาบ) + คลื่นกระแทก 2 ชั้น */}
      <div className="absolute inset-0" style={{ opacity: flashScale() }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${cx}px ${cy}px, #ffffff, rgba(240,171,252,0.75) 18%, rgba(168,85,247,0.25) 40%, transparent 65%)`, animation: anim('sd-flash', 'ease-out') }} />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{ ...box(S * (i ? 1.1 : 0.8)), borderRadius: '50%', border: `${i ? 3 : 6}px solid ${i ? '#f0abfc' : '#ffffff'}`, boxShadow: '0 0 24px rgba(216,180,254,0.9), inset 0 0 18px rgba(216,180,254,0.7)', animation: anim(i ? 'sd-wave2' : 'sd-wave', 'ease-out') }}
        />
      ))}
      {/* เศษผลึกโซลคอร์ปลิวออกรอบทิศ */}
      {Array.from({ length: shards }, (_, i) => {
        const deg = (360 / shards) * i + ((i * 37) % 17) - 8;
        const size = S * (0.16 + ((i * 7) % 5) * 0.035);
        return (
          <div key={`s${i}`} style={{ ...box(size), rotate: `${deg}deg` }}>
            <div
              className="h-full w-full"
              style={{
                clipPath: i % 2 ? 'polygon(50% 0, 100% 70%, 30% 100%)' : 'polygon(20% 0, 100% 30%, 60% 100%, 0 80%)',
                background: i % 3 ? 'linear-gradient(135deg, #ffffff, #fbcfe8 30%, #e11d48 70%, #881337)' : 'linear-gradient(135deg, #ffffff, #f0abfc 45%, #a855f7)',
                ['--d' as string]: `${-(S * (1.1 + ((i * 13) % 7) * 0.14))}px`,
                ['--r' as string]: `${(i % 2 ? 1 : -1) * (200 + ((i * 53) % 260))}deg`,
                animation: anim('sd-shard', 'cubic-bezier(.15,.7,.3,1)'),
              }}
            />
          </div>
        );
      })}
      {/* ประกายไฟ */}
      {Array.from({ length: sparks }, (_, i) => {
        const deg = (360 / sparks) * i + 10;
        return (
          <div key={`p${i}`} style={{ ...box(8), rotate: `${deg}deg` }}>
            <div
              className="h-full w-full rounded-full bg-white"
              style={{
                boxShadow: '0 0 8px 2px rgba(244,114,182,0.95)',
                ['--d' as string]: `${-(S * (0.8 + ((i * 11) % 6) * 0.2))}px`,
                ['--r' as string]: '0deg',
                animation: anim('sd-shard', 'cubic-bezier(.1,.8,.3,1)'),
              }}
            />
          </div>
        );
      })}
      {/* ป้าย SOUL DRIVE กระแทกลง */}
      <div className="absolute flex flex-col items-center" style={{ left: cx, top: r.y - 10, translate: '-50% -100%', animation: anim('sd-title', 'ease-out') }}>
        <span
          className="whitespace-nowrap font-black italic tracking-wider"
          style={{
            fontSize: 46,
            lineHeight: 1,
            color: '#fdf4ff',
            WebkitTextStroke: '2px #581c87',
            textShadow: '0 0 14px rgba(244,114,182,0.95), 0 0 30px rgba(168,85,247,0.9), 0 4px 0 #3b0764',
          }}
        >
          SOUL DRIVE
        </span>
        {fx.title && (
          <span className="mt-1 whitespace-nowrap rounded-full border border-fuchsia-300/70 bg-purple-950/85 px-3 py-0.5 text-sm font-bold text-fuchsia-100 shadow-[0_0_14px_rgba(217,70,239,0.7)]">
            {fx.title}
          </span>
        )}
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

// ---------------- ท่าโจมตีของดีว่า ----------------

const NOTE1 = 'M11 3 V15.6 A3.4 3.4 0 1 1 9 12.6 V3 Z M11 3 C15 4 18 6 17 10 C16 7.5 13.5 6.8 11 6.8 Z';
const NOTE2 = 'M9 4 L21 2 V15.5 A3 3 0 1 1 19 12.8 V6.6 L11 8 V17.5 A3 3 0 1 1 9 14.8 Z';
const STAR = 'M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.1 L18.5 21.6 L12 17.6 L5.5 21.6 L7.3 14.1 L1.5 9.2 L9.1 8.6 Z';
const TRAIL_COLORS = [GOLD, PINK, '#ffffff', '#f9a8d4', '#fde68a'];

/**
 * หางของดีว่าตอนพุ่งโจมตี (แทนควัน): โน้ตดนตรีและดาวหลุดออกจากการ์ดตามทางที่พุ่ง ลอยกระจายออกด้านข้าง หมุน แล้วจางหาย
 * + สปอตไลต์จากขอบจอบนส่องตามการ์ดตั้งแต่ช่วงชาร์จจนชนเป้า
 * follow = การ์ดโคลนที่กำลังพุ่ง · from/until = ช่วงเวลา (ms นับจาก mount) ที่ปล่อยโน้ต · spotFrom = เวลาที่สปอตไลต์เริ่มส่อง
 */
export function DivaTrail({ follow, from, until, spotFrom, size }: { follow: RefObject<HTMLDivElement | null>; from: number; until: number; spotFrom: number; size: number }) {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = back.current;
    const cv2 = front.current;
    const ctx = cv?.getContext('2d');
    const ctx2 = cv2?.getContext('2d');
    if (!cv || !cv2 || !ctx || !ctx2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const full = effects().blur;
    const paths = [new Path2D(NOTE1), new Path2D(NOTE2), new Path2D(STAR)];
    type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; born: number; life: number; shape: number; color: string; front: boolean };
    const parts: P[] = [];
    const t0 = performance.now();
    let prev: [number, number] | null = null;
    let raf = 0;
    let seq = 0;
    /** จุดต้นสปอตไลต์ (ขอบบนจอ) เลือกครั้งเดียวตอนเริ่มส่อง */
    let spotX: number | null = null;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const spotEnd = until + 420;
    const step = (now: number) => {
      const box = cv.getBoundingClientRect();
      if (cv.width !== Math.round(box.width * dpr)) {
        cv.width = cv2.width = Math.round(box.width * dpr);
        cv.height = cv2.height = Math.round(box.height * dpr);
      }
      const k = cv.width / (box.width || 1);
      const w = size * k;
      const elapsed = now - t0;
      const el = follow.current;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx2.clearRect(0, 0, cv2.width, cv2.height);
      const r = el?.getBoundingClientRect();
      const cx = r ? (r.left + r.width / 2 - box.left) * k : 0;
      const cy = r ? (r.top + r.height / 2 - box.top) * k : 0;
      // ---- สปอตไลต์: กรวยแสงจากขอบบนจอ ส่องตามการ์ด (ค่อย ๆ สว่างขึ้น/จางลง) ----
      if (r && elapsed >= spotFrom && elapsed <= spotEnd) {
        if (spotX === null) spotX = cx + (cx < cv.width / 2 ? 1 : -1) * cv.width * 0.12;
        const a = Math.min(1, (elapsed - spotFrom) / 260) * Math.min(1, (spotEnd - elapsed) / 300);
        const rad = w * 1.05;
        const ang = Math.atan2(cy, cx - spotX);
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const g = ctx.createLinearGradient(spotX, 0, cx, cy);
        g.addColorStop(0, `rgba(255,250,210,${0.05 * a})`);
        g.addColorStop(0.75, `rgba(253,230,138,${0.3 * a})`);
        g.addColorStop(1, `rgba(255,255,240,${0.45 * a})`);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(spotX - w * 0.12, -4);
        ctx.lineTo(spotX + w * 0.12, -4);
        ctx.lineTo(cx + nx * rad, cy + ny * rad);
        ctx.lineTo(cx - nx * rad, cy - ny * rad);
        ctx.closePath();
        ctx.fill();
        // วงแสงบนพื้นรอบการ์ด
        const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.25);
        pool.addColorStop(0, `rgba(255,250,220,${0.4 * a})`);
        pool.addColorStop(0.6, `rgba(244,114,182,${0.18 * a})`);
        pool.addColorStop(1, 'rgba(244,114,182,0)');
        ctx.fillStyle = pool;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // ---- ปล่อยโน้ต/ดาวตามทางที่พุ่ง ----
      if (r && elapsed >= from && elapsed <= until) {
        const [px, py] = prev ?? [cx, cy];
        const dx = cx - px;
        const dy = cy - py;
        const dist = Math.hypot(dx, dy);
        if (dist > w * 0.04) {
          const ux = dx / dist;
          const uy = dy / dist;
          const n = Math.min(full ? 7 : 3, Math.max(1, Math.round(dist / (w * (full ? 0.22 : 0.5)))));
          for (let i = 0; i < n; i++) {
            const f = (i + Math.random()) / n;
            const s = seq++;
            // หลุดออกทางซ้าย/ขวาสลับกัน ลอยออกด้านข้าง + ขึ้นเล็กน้อย
            const sideDir = s % 2 ? 1 : -1;
            const off = rand(0.1, 0.5) * w * sideDir;
            const spd = rand(0.05, 0.16) * k;
            parts.push({
              x: px + dx * f - uy * off,
              y: py + dy * f + ux * off,
              vx: -uy * sideDir * spd - ux * 0.04 * k,
              vy: ux * sideDir * spd - uy * 0.04 * k - 0.03 * k,
              rot: rand(-0.6, 0.6),
              vr: rand(-0.004, 0.004),
              s: w * rand(0.28, 0.46),
              born: now - (1 - f) * 16,
              life: rand(650, 1000),
              shape: s % 5 === 4 ? 1 : s % 3 === 0 ? 2 : 0,
              color: TRAIL_COLORS[s % TRAIL_COLORS.length]!,
              front: s % 3 === 1,
            });
          }
        }
        prev = [cx, cy];
      } else prev = null;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        const age = now - p.born;
        const u = age / p.life;
        if (u >= 1) {
          parts.splice(i--, 1);
          continue;
        }
        const c = p.front ? ctx2 : ctx;
        const pop = u < 0.12 ? 0.5 + (u / 0.12) * 0.7 : 1.2 - 0.35 * ((u - 0.12) / 0.88);
        const sc = (p.s / 24) * pop;
        c.save();
        c.globalAlpha = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.4);
        c.translate(p.x + p.vx * age, p.y + p.vy * age);
        c.rotate(p.rot + p.vr * age + Math.sin(age / 140) * 0.25);
        c.scale(sc, sc);
        c.translate(-12, -12);
        if (full) {
          c.shadowColor = p.color === '#ffffff' ? GOLD : p.color;
          c.shadowBlur = 10 * k;
        }
        c.fillStyle = p.color;
        c.fill(paths[p.shape]!);
        c.shadowBlur = 0;
        c.lineWidth = 0.8;
        c.strokeStyle = 'rgba(120,20,70,0.55)';
        c.stroke(paths[p.shape]!);
        c.restore();
      }
      if (parts.length > 0 || elapsed < spotEnd) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ชั้นหลังใต้การ์ด (z 41: สปอตไลต์ + โน้ตส่วนใหญ่) · ชั้นหน้าเหนือการ์ด (z 42)
  return (
    <>
      <canvas ref={back} className="pointer-events-none fixed inset-0 z-[41] h-full w-full" />
      <canvas ref={front} className="pointer-events-none fixed inset-0 z-[42] h-full w-full" />
    </>
  );
}

/** จุดชนของดีว่า: วงแสงชมพูทอง + โน้ตและดาวแตกกระจายออกรอบทิศ (วางในกล่อง fixed ที่จุดชน) */
export function DivaImpact() {
  const n = effects().blur ? 14 : 8;
  return (
    <>
      <div className="absolute h-60 w-60 rounded-full" style={{ animation: 'fx-impact 0.55s ease-out both', background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(253,224,71,0.7) 25%, rgba(244,114,182,0.5) 50%, transparent 70%)' }} />
      <div className="absolute h-72 w-72 rounded-full border-4 border-pink-300" style={{ animation: 'fx-impact-ring 0.6s ease-out both', boxShadow: '0 0 18px rgba(244,114,182,0.8)' }} />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + rnd(i + 3) * 0.4;
        const d = 110 + rnd(i + 7) * 90;
        const color = TRAIL_COLORS[i % TRAIL_COLORS.length]!;
        const style: CSSProperties = {
          position: 'absolute',
          left: 0,
          top: 0,
          ['--dx' as string]: `${Math.cos(a) * d}px`,
          ['--dy' as string]: `${Math.sin(a) * d - 30}px`,
          animation: `idol-note-fly ${700 + rnd(i + 11) * 300}ms ${rnd(i + 13) * 80}ms ease-out both`,
          filter: `drop-shadow(0 0 6px ${color === '#ffffff' ? GOLD : color})`,
        };
        return i % 3 === 2 ? <Star key={i} size={20 + rnd(i) * 10} color={color} style={style} /> : <Note key={i} size={24 + rnd(i) * 12} color={color} double={i % 4 === 1} style={style} />;
      })}
    </>
  );
}
