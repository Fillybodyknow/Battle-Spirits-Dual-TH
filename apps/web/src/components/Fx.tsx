import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { opponentOf, type PlayerId } from '@bs/engine';
import { cardArt } from '../assets';
import { braveSlot, CAST_MS, CHARGE_HIT, CHARGE_MS, DRAW_FLIP_MS, DRAW_TIER, LETHAL_RELEASE, LETHAL_SLOW, LETHAL_SLOW_EXTRA, CUTIN_MS, CUTIN_SLAM, castCards, castHandSlots, castTone, controls, CHARGE_KNOCK, actingPlayer, chainEntries, viewPlayer, db, fieldScaleOf, GHOST_MS, isFxBlocking, layoutRect, MILL_MS, millBreakAt, millDuration, PLAY_HIT, useGame, type Fx, type Rect, hiddenFrom } from '../store';
import { CardBack, CardFace } from './CardFace';
import { setSfxTimeScale, sfx } from '../sfx';
import { effects, flashScale, shakeScale } from '../gfx';
import { playerLabel } from '../format';
import { MatchIntro } from './MatchIntro';
import { MatchResult } from './MatchResult';

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
  mini: 'from-sky-700/0 via-sky-600/90 to-sky-700/0 text-white',
};

function Banner({ fx, onDone }: { fx: Extract<Fx, { kind: 'banner' }>; onDone: () => void }) {
  const win = fx.tone === 'win';
  const mini = fx.tone === 'mini';
  // ป้ายสเต็ป: ของเราสีฟ้า ของคู่แข่งสีแดง
  const theirs = useGame((s) => mini && !!fx.player && viewPlayer(s) !== fx.player);
  const showFx = useGame((s) => s.showFx);
  const shown = (fx.delay ?? 0) === 0;
  // นับเวลาปิดเมื่อป้ายแสดงจริงแล้ว (ป้ายที่มี delay ต้องรอแอนิเมชันก่อนหน้า เช่น โยนเหรียญ)
  useEffect(() => {
    if (!shown || win) return;
    const t = setTimeout(onDone, mini ? 900 : 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => showFx(fx.id), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  // เสียงเล่นตอนป้ายขึ้นจริง (ป้ายแสดงทีละอันตามคิว)
  useEffect(() => {
    if (!shown) return;
    sfx(win ? 'win' : fx.tone === 'turn' ? 'turn' : fx.tone === 'step' ? 'step' : fx.tone === 'mini' ? 'tick' : 'burst');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
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
        className={`pointer-events-auto w-full bg-gradient-to-r shadow-[0_0_40px_rgba(0,0,0,0.6)] ${mini ? 'py-1.5' : 'py-4'} ${theirs ? 'from-rose-700/0 via-rose-600/90 to-rose-700/0 text-white' : BANNER_TONE[fx.tone]}`}
        style={{ animation: win ? 'fx-slide-up 0.4s ease-out both' : `fx-banner ${mini ? 0.9 : 1.4}s cubic-bezier(.2,.8,.2,1) both` }}
      >
        <div className="flex flex-col items-center" style={{ transform: win ? undefined : 'skewX(12deg)' }}>
          <span className={`${mini ? 'text-2xl' : 'text-4xl'} font-black tracking-wider italic drop-shadow`} style={{ animation: 'fx-banner-text 0.6s ease-out both' }}>
            {fx.title}
          </span>
          {fx.sub && <span className={`${mini ? 'text-xs' : 'text-sm'} font-semibold opacity-80`}>{fx.sub}</span>}
          {win && <span className="mt-2 text-xs opacity-70">คลิกเพื่อปิด</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- summon cut-in

/** ธีม Cut-in ตามสีหลักของการ์ด (สีที่ไม่มีธีม = แบบเดิม: แถบความเร็ว + สะเก็ดไฟ) */
type CutInThemeName = 'fire' | 'water' | 'dark' | 'wind' | 'ice' | 'holy';
const CUTIN_THEME: Partial<Record<string, CutInThemeName>> = { red: 'fire', blue: 'water', purple: 'dark', green: 'wind', white: 'ice', yellow: 'holy' };

/** ค่าที่ทุกธีมใช้: ms(สัดส่วนเวลา) · at = จังหวะทุบ (ms) · n(เต็ม, ต่ำ) = จำนวนอนุภาคตามระดับกราฟิก */
type ThemeArgs = { dur: number; at: number; special: boolean; n: (full: number, low: number) => number; ms: (k: number) => string };

/** ม่วง = ความมืด: ความมืดคืบจากขอบจอ + วิญญาณหมุนวนเข้า → วงเวทย์อักขระกางออกใต้การ์ด → วงเวทย์หมุน + ควันมืดลอยขึ้น */
function CutInDark({ dur, at, special, n }: ThemeArgs) {
  const souls = n(special ? 26 : 18, 8);
  const smoke = n(14, 6);
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  return (
    <>
      {/* ความมืดคืบเข้าจากขอบจอ */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 22%, rgba(59,7,100,0.55) 55%, rgba(2,0,10,0.92) 85%)', animation: `ci-fade-in ${at}ms ease-in both` }} />
      {/* วิญญาณหมุนวนเข้ากลางจอ */}
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {Array.from({ length: souls }, (_, i) => {
          const size = 6 + prand(i + 700) * 10;
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: -size / 2,
                top: -size / 2,
                width: size,
                height: size,
                background: 'radial-gradient(circle, #fff 0%, #e9d5ff 30%, rgba(168,85,247,0.6) 60%, transparent 72%)',
                boxShadow: '0 0 14px rgba(192,132,252,0.9)',
                ['--a' as string]: `${prand(i + 710) * 360}deg`,
                ['--r' as string]: `${32 + prand(i + 720) * 30}vmax`,
                animation: `ci-spiral-in ${Math.round(at * (0.7 + prand(i + 730) * 0.3))}ms ${Math.round(prand(i + 740) * at * 0.25)}ms cubic-bezier(.5,0,.9,.6) both`,
              }}
            />
          );
        })}
      </div>
      {/* วงเวทย์กางออกใต้การ์ด แล้วหมุนช้า ๆ */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[min(92vh,92vw)] w-[min(92vh,92vw)]" style={{ translate: '-50% -50%', animation: `ci-circle-in 600ms ${at}ms cubic-bezier(.2,.9,.3,1.2) both` }}>
        <svg viewBox="-100 -100 200 200" className="h-full w-full" style={{ filter: 'drop-shadow(0 0 3px #e9d5ff) drop-shadow(0 0 10px #a855f7)', animation: 'fx-rays 14s linear infinite' }}>
          <circle r="96" fill="none" stroke="#e9d5ff" strokeWidth="1.2" />
          <circle r="88" fill="none" stroke="#c084fc" strokeWidth="0.6" />
          <circle r="62" fill="none" stroke="#e9d5ff" strokeWidth="0.9" />
          <circle r="40" fill="rgba(88,28,135,0.18)" stroke="#c084fc" strokeWidth="0.6" />
          {/* ดาวหกแฉก */}
          <polygon points="0,-62 53.7,31 -53.7,31" fill="none" stroke="#e9d5ff" strokeWidth="0.8" />
          <polygon points="0,62 53.7,-31 -53.7,-31" fill="none" stroke="#e9d5ff" strokeWidth="0.8" />
          {/* อักขระรอบวง (ลวดลาย ไม่มีความหมาย) */}
          {Array.from({ length: 24 }, (_, i) => (
            <text key={i} x="0" y="-90" fill="#f3e8ff" fontSize="7" textAnchor="middle" transform={`rotate(${i * 15})`}>
              {runes[i % runes.length]}
            </text>
          ))}
        </svg>
      </div>
      {/* ควันมืดลอยขึ้น */}
      {Array.from({ length: smoke }, (_, i) => {
        const size = 14 + prand(i + 760) * 22;
        return (
          <span
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${prand(i + 770) * 100}%`,
              bottom: `${-10 + prand(i + 780) * 20}%`,
              width: `${size}vmin`,
              height: `${size}vmin`,
              background: 'radial-gradient(circle, rgba(76,29,149,0.55), rgba(30,10,60,0.3) 45%, transparent 70%)',
              ['--sway' as string]: `${(prand(i + 790) - 0.5) * 12}vw`,
              animation: `ci-ember ${2000 + Math.round(prand(i + 800) * 1400)}ms ${at + Math.round(prand(i + 810) * dur * 0.3)}ms ease-out both`,
            }}
          />
        );
      })}
    </>
  );
}

/** เขียว = ลม: ใบไม้หมุนเป็นพายุเข้ากลางจอ → รอยฟันของลมโค้งหลายเส้น → ใบไม้ปลิวผ่านจอ */
function CutInWind({ dur, at, special, n }: ThemeArgs) {
  const leaves = n(special ? 30 : 22, 9);
  const drift = n(special ? 22 : 16, 7);
  const leafStyle = (i: number, size: number) => ({
    width: size,
    height: size * 0.55,
    borderRadius: '0 100% 0 100%',
    background: `linear-gradient(135deg, ${i % 3 === 0 ? '#bbf7d0' : '#4ade80'}, ${i % 2 ? '#15803d' : '#166534'})`,
    boxShadow: '0 0 6px rgba(74,222,128,0.5)',
  });
  return (
    <>
      {/* พายุใบไม้หมุนเข้ากลางจอ (ชาร์จ) */}
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {Array.from({ length: leaves }, (_, i) => {
          const size = 16 + prand(i + 900) * 18;
          return (
            <span
              key={i}
              className="absolute"
              style={{
                ...leafStyle(i, size),
                left: -size / 2,
                top: -size / 4,
                ['--a' as string]: `${prand(i + 910) * 360}deg`,
                ['--r' as string]: `${30 + prand(i + 920) * 34}vmax`,
                animation: `ci-spiral-in ${Math.round(at * (0.75 + prand(i + 930) * 0.25))}ms ${Math.round(prand(i + 940) * at * 0.2)}ms cubic-bezier(.4,0,.8,.6) both`,
              }}
            />
          );
        })}
      </div>
      {/* รอยฟันของลม: เส้นโค้งปาดผ่านจอตอนทุบ */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 160 90" preserveAspectRatio="none" style={{ filter: 'drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px #22c55e)' }}>
        {[
          'M -10 70 Q 80 -10 170 40',
          'M -10 30 Q 70 100 170 55',
          'M -10 85 Q 90 20 170 10',
          'M -10 15 Q 85 70 170 80',
          'M 20 95 Q 70 30 150 -5',
        ]
          .slice(0, special ? 5 : 4)
          .map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={i % 2 ? '#bbf7d0' : '#fff'}
              strokeWidth={i === 0 ? 1.4 : 0.8}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              style={{ animation: `ci-slash 650ms ${at + i * 70}ms cubic-bezier(.2,.8,.2,1) both` }}
            />
          ))}
      </svg>
      {/* ใบไม้ปลิวผ่านจอ (หลังทุบ) */}
      {Array.from({ length: drift }, (_, i) => {
        const size = 14 + prand(i + 960) * 16;
        return (
          <span
            key={i}
            className="pointer-events-none absolute"
            style={{
              ...leafStyle(i + 1, size),
              left: -60,
              top: `${prand(i + 970) * 100}%`,
              ['--sway' as string]: `${(prand(i + 980) - 0.5) * 30}vh`,
              ['--rot' as string]: `${(prand(i + 990) > 0.5 ? 1 : -1) * (540 + prand(i + 995) * 540)}deg`,
              animation: `ci-drift ${1200 + Math.round(prand(i + 1000) * 900)}ms ${at + Math.round(prand(i + 1010) * dur * 0.4)}ms ease-in-out both`,
            }}
          />
        );
      })}
    </>
  );
}

/** ขาว = น้ำแข็ง/เหล็ก: น้ำแข็งเกาะลามจากขอบจอ → ผลึกน้ำแข็งแตกกระจาย + รอยร้าวสีน้ำแข็ง → เกล็ดน้ำแข็งร่วง */
function CutInIce({ dur, at, special, n }: ThemeArgs) {
  const shards = n(special ? 26 : 18, 8);
  const flakes = n(special ? 40 : 28, 10);
  return (
    <>
      {/* น้ำแข็งเกาะขอบจอ */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(186,230,253,0.18) 62%, rgba(224,242,254,0.55) 88%, rgba(255,255,255,0.75) 100%)',
          animation: `ci-fade-in ${at}ms ease-in both`,
        }}
      />
      {/* ผลึกน้ำแข็งที่มุมจอ (ลามเข้ามา) */}
      {(
        [
          [0, 0, 0],
          [1, 0, 90],
          [1, 1, 180],
          [0, 1, 270],
        ] as const
      ).map(([cx, cy, base], i) => (
        // จุดมุมจอ = (0,0) ของ viewBox · กิ่งน้ำแข็งแผ่เข้าในจอ (มุม base ถึง base+90)
        <svg
          key={i}
          viewBox={`${cx ? -100 : 0} ${cy ? -100 : 0} 100 100`}
          className="pointer-events-none absolute h-[38vmin] w-[38vmin]"
          style={{
            ...(cx ? { right: 0 } : { left: 0 }),
            ...(cy ? { bottom: 0 } : { top: 0 }),
            transformOrigin: `${cx ? '100%' : '0'} ${cy ? '100%' : '0'}`,
            filter: 'drop-shadow(0 0 4px #7dd3fc)',
            animation: `ci-frost ${at}ms ease-out both`,
          }}
        >
          {[0, 18, 36, 54, 72, 90].map((a, k) => (
            <g key={k} transform={`rotate(${base + a})`}>
              <line x1="0" y1="0" x2={70 - (k % 2) * 25} y2="0" stroke="#e0f2fe" strokeWidth="1.2" />
              <line x1={22} y1="0" x2={32} y2="-8" stroke="#e0f2fe" strokeWidth="0.8" />
              <line x1={22} y1="0" x2={32} y2="8" stroke="#e0f2fe" strokeWidth="0.8" />
              <line x1={42} y1="0" x2={50} y2="-6" stroke="#e0f2fe" strokeWidth="0.7" />
              <line x1={42} y1="0" x2={50} y2="6" stroke="#e0f2fe" strokeWidth="0.7" />
            </g>
          ))}
        </svg>
      ))}
      {/* ผลึกน้ำแข็งแตกกระจายตอนทุบ */}
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {Array.from({ length: shards }, (_, i) => {
          const ang = (i / shards) * Math.PI * 2 + prand(i + 1100) * 0.4;
          const dist = 240 + prand(i + 1110) * 300;
          const w = 10 + prand(i + 1120) * 18;
          // ชั้นนอกพุ่งออก (transform) · ชั้นในหมุนให้ปลายแหลมชี้ทิศที่พุ่ง (แยกกัน ไม่ให้การหมุนพาทิศพุ่งเพี้ยน)
          return (
            <span
              key={i}
              className="absolute"
              style={{
                left: -w / 2,
                top: -w,
                width: w,
                height: w * 2.2,
                ['--tx' as string]: `${Math.cos(ang) * dist}px`,
                ['--ty' as string]: `${Math.sin(ang) * dist}px`,
                animation: `fx-ci-spark 900ms ${at}ms cubic-bezier(.1,.8,.3,1) both`,
              }}
            >
              <span
                className="block h-full w-full"
                style={{
                  clipPath: 'polygon(50% 0, 100% 35%, 70% 100%, 20% 85%, 0 30%)',
                  background: 'linear-gradient(160deg, #fff, #bae6fd 45%, #38bdf8 85%)',
                  rotate: `${(ang * 180) / Math.PI + 90}deg`,
                }}
              />
            </span>
          );
        })}
      </div>
      {/* เกล็ดน้ำแข็งร่วง */}
      {Array.from({ length: flakes }, (_, i) => {
        const size = 4 + prand(i + 1150) * 8;
        return (
          <span
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${prand(i + 1160) * 100}%`,
              top: -20,
              width: size,
              height: size,
              background: 'radial-gradient(circle, #fff 30%, rgba(224,242,254,0.6) 60%, transparent 72%)',
              ['--sway' as string]: `${(prand(i + 1170) - 0.5) * 10}vw`,
              ['--rot' as string]: '0deg',
              animation: `ci-fall ${1800 + Math.round(prand(i + 1180) * 1400)}ms ${at + Math.round(prand(i + 1190) * dur * 0.4)}ms linear both`,
            }}
          />
        );
      })}
    </>
  );
}

/** เหลือง = แสงศักดิ์สิทธิ์: ลำแสงส่องลงจากด้านบน → แสงวาบรูปกากบาท + วงรัศมีซ้อนขยาย → ขนนกสีทองร่วง + ประกายระยิบ */
function CutInHoly({ dur, at, special, n }: ThemeArgs) {
  const feathers = n(special ? 18 : 12, 5);
  const twinkles = n(special ? 30 : 20, 8);
  return (
    <>
      {/* ลำแสงส่องลงจากด้านบน (ชาร์จ) */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-full w-[34vw] origin-top"
        style={{
          translate: '-50% 0',
          background: 'linear-gradient(to bottom, rgba(255,251,235,0.95), rgba(253,224,71,0.45) 55%, transparent)',
          maskImage: 'linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent)',
          animation: `ci-beam ${at}ms ease-in both`,
        }}
      />
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {/* วงรัศมีสีทองซ้อนขยาย */}
        {Array.from({ length: special ? 4 : 3 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: -130,
              top: -130,
              width: 260,
              height: 260,
              border: `${4 - Math.min(i, 2)}px solid #fde68a`,
              boxShadow: '0 0 24px rgba(250,204,21,0.9), inset 0 0 18px rgba(255,251,235,0.7)',
              opacity: 0,
              animation: `ci-ripple 1.2s ${at + i * 150}ms ease-out both`,
            }}
          />
        ))}
        {/* แสงวาบรูปกากบาท */}
        {[0, 90].map((rot) => (
          <div
            key={rot}
            className="absolute rounded-full"
            style={{
              left: '-80vmax',
              top: -6,
              width: '160vmax',
              height: 12,
              rotate: `${rot}deg`,
              background: 'linear-gradient(90deg, transparent, rgba(253,224,71,0.8) 30%, #fff 50%, rgba(253,224,71,0.8) 70%, transparent)',
              boxShadow: '0 0 30px 8px rgba(253,224,71,0.7)',
              opacity: 0,
              animation: `ci-cross 800ms ${at}ms cubic-bezier(.1,.8,.3,1) both`,
            }}
          />
        ))}
      </div>
      {/* ประกายระยิบ */}
      {Array.from({ length: twinkles }, (_, i) => {
        const size = 10 + prand(i + 1300) * 16;
        return (
          <span
            key={i}
            className="pointer-events-none absolute"
            style={{
              left: `${prand(i + 1310) * 100}%`,
              top: `${prand(i + 1320) * 100}%`,
              width: size,
              height: size,
              translate: '-50% -50%',
              clipPath: 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)',
              background: 'radial-gradient(circle, #fff, #fde047 60%)',
              opacity: 0,
              animation: `ci-twinkle 700ms ${at + Math.round(prand(i + 1330) * dur * 0.55)}ms ease-in-out both`,
            }}
          />
        );
      })}
      {/* ขนนกสีทองร่วงช้า ๆ */}
      {Array.from({ length: feathers }, (_, i) => {
        const size = 26 + prand(i + 1350) * 20;
        return (
          <span
            key={i}
            className="pointer-events-none absolute"
            style={{
              left: `${prand(i + 1360) * 100}%`,
              top: -60,
              width: size * 0.38,
              height: size,
              borderRadius: '50% 50% 50% 50% / 80% 80% 20% 20%',
              background: 'linear-gradient(90deg, #fffbeb 0 46%, #fcd34d 48% 52%, #fef3c7 54%)',
              boxShadow: '0 0 10px rgba(253,224,71,0.7)',
              ['--sway' as string]: `${(prand(i + 1370) - 0.5) * 16}vw`,
              ['--rot' as string]: `${(prand(i + 1380) - 0.5) * 160}deg`,
              animation: `ci-fall ${2200 + Math.round(prand(i + 1390) * 1200)}ms ${at + Math.round(prand(i + 1400) * dur * 0.35)}ms ease-in-out both`,
            }}
          />
        );
      })}
    </>
  );
}



/**
 * ชั้นเอฟเฟกต์ประจำสีของ Cut-in (อยู่หลังการ์ด)
 *  ไฟ (แดง): ขอบล่างร้อนแดงตอนชาร์จ → ระเบิดเพลิงตอนทุบ → เปลวไฟเลียขอบล่าง + ประกายไฟลอยขึ้น
 *  น้ำ (ฟ้า): น้ำหมุนวนเข้ากลางจอ + ฟองอากาศ → คลื่นซัดผ่านจอ + วงน้ำกระเพื่อม + หยดน้ำกระเซ็น → แสงระลอกใต้น้ำ
 *  ความมืด (ม่วง) / ลม (เขียว) / น้ำแข็ง (ขาว) / แสงศักดิ์สิทธิ์ (เหลือง): ดู CutInDark / CutInWind / CutInIce / CutInHoly
 */
function CutInTheme({ theme, dur, slam, special, rich }: { theme: CutInThemeName; dur: number; slam: number; special: boolean; rich: boolean }) {
  const ms = (k: number) => `${Math.round(dur * k)}ms`;
  const at = Math.round(dur * slam);
  const n = (full: number, low: number) => (rich ? full : low);
  const args: ThemeArgs = { dur, at, special, n, ms };
  if (theme === 'dark') return <CutInDark {...args} />;
  if (theme === 'wind') return <CutInWind {...args} />;
  if (theme === 'ice') return <CutInIce {...args} />;
  if (theme === 'holy') return <CutInHoly {...args} />;
  if (theme === 'fire') {
    const flames = n(12, 6);
    const embers = n(special ? 48 : 34, 12);
    return (
      <>
        {/* ความร้อนจากขอบล่าง (ตั้งแต่ชาร์จ) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%]" style={{ background: 'linear-gradient(to top, rgba(234,88,12,0.6), rgba(220,38,38,0.25) 45%, transparent)', animation: `ci-fade-in ${ms(slam)} ease-in both` }} />
        {/* เปลวไฟเลียขอบล่าง: ลุกขึ้นก่อนทุบเล็กน้อย แล้วไหวตลอด */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] origin-bottom" style={{ animation: `ci-fire-in ${ms(0.14)} ${at - 160}ms ease-out both` }}>
          {Array.from({ length: flames }, (_, i) => {
            const x = ((i + 0.5) / flames) * 100 + (prand(i + 300) - 0.5) * 4;
            return (
              <span
                key={i}
                className="absolute bottom-[-10%] origin-bottom"
                style={{
                  left: `${x}%`,
                  width: `${8 + prand(i + 310) * 9}vw`,
                  height: `${60 + prand(i + 320) * 45}%`,
                  translate: '-50% 0',
                  borderRadius: '50% 50% 45% 45% / 70% 70% 30% 30%',
                  // ขอบไล่โปร่งในตัว (ไม่ใช้ blur / blend: เปลวไฟหลายก้อนเต็มจอหนักเกินสำหรับเครื่องช้า)
                  background: 'radial-gradient(ellipse at 50% 85%, rgba(255,247,174,0.95) 0%, rgba(253,224,71,0.9) 14%, rgba(249,115,22,0.75) 36%, rgba(220,38,38,0.45) 58%, rgba(220,38,38,0) 72%)',
                  animation: `ci-flame ${380 + Math.round(prand(i + 330) * 320)}ms ${Math.round(prand(i + 340) * 300)}ms ease-in-out infinite alternate`,
                }}
              />
            );
          })}
        </div>
        {/* ระเบิดเพลิงตอนทุบ */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[120vmax] w-[120vmax] rounded-full"
          style={{
            translate: '-50% -50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(253,224,71,0.9) 9%, rgba(249,115,22,0.75) 22%, rgba(220,38,38,0.5) 38%, rgba(127,29,29,0.3) 52%, transparent 64%)',
            opacity: 0,
            animation: `ci-blast ${special ? 950 : 750}ms ${at}ms cubic-bezier(.1,.8,.3,1) forwards`,
          }}
        />
        {/* ประกายไฟลอยขึ้น */}
        {Array.from({ length: embers }, (_, i) => {
          const size = 2 + prand(i + 400) * 5;
          return (
            <span
              key={i}
              className="pointer-events-none absolute rounded-full"
              style={{
                left: `${prand(i + 410) * 100}%`,
                bottom: `${prand(i + 420) * 35 - 5}%`,
                width: size,
                height: size,
                background: i % 4 === 0 ? '#fff7ae' : '#fb923c',
                boxShadow: `0 0 ${size * 3}px #f97316`,
                ['--sway' as string]: `${(prand(i + 430) - 0.5) * 14}vw`,
                animation: `ci-ember ${1300 + Math.round(prand(i + 440) * 1400)}ms ${at + Math.round(prand(i + 450) * dur * 0.45)}ms ease-out both`,
              }}
            />
          );
        })}
      </>
    );
  }
  // น้ำ
  const bubbles = n(special ? 30 : 22, 9);
  const drops = n(special ? 30 : 22, 10);
  return (
    <>
      {/* น้ำหมุนวนเข้ากลางจอ (ชาร์จ) */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[95vmin] w-[95vmin]" style={{ translate: '-50% -50%', animation: `ci-swirl ${ms(slam + 0.06)} ease-in both` }}>
        <div
          className="h-full w-full rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent, rgba(56,189,248,0.6), transparent 22%, rgba(14,165,233,0.5) 48%, transparent 60%, rgba(186,230,253,0.55) 80%, transparent)',
            maskImage: 'radial-gradient(circle, transparent 16%, #000 30%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 16%, #000 30%, transparent 70%)',
            animation: 'fx-rays 0.9s linear infinite',
          }}
        />
      </div>
      {/* แสงระลอกใต้น้ำ (หลังทุบ) */}
      <div className="pointer-events-none absolute inset-0" style={{ opacity: 0, animation: `ci-fade-in 500ms ${at}ms ease-out forwards` }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'repeating-radial-gradient(ellipse at 30% 25%, rgba(186,230,253,0.16) 0 3px, transparent 3px 44px), repeating-radial-gradient(ellipse at 72% 78%, rgba(125,211,252,0.13) 0 4px, transparent 4px 60px), linear-gradient(to bottom, rgba(14,116,144,0.25), rgba(8,47,73,0.35))',
            animation: 'ci-caustic 3.2s linear infinite alternate',
          }}
        />
      </div>
      {/* คลื่นซัดผ่านจอตอนทุบ */}
      <svg
        className="pointer-events-none absolute top-1/2 left-0 h-[75vh] w-[220%]"
        viewBox="0 0 220 50"
        preserveAspectRatio="none"
        style={{ translate: '0 -50%', opacity: 0, animation: `ci-wave ${special ? 1000 : 800}ms ${at - 40}ms cubic-bezier(.25,.7,.3,1) both` }}
      >
        <defs>
          <linearGradient id="ci-wave-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.95" />
            <stop offset="0.25" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="0.7" stopColor="#0369a1" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0c4a6e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 26 Q 13.75 12 27.5 26 T 55 26 T 82.5 26 T 110 26 T 137.5 26 T 165 26 T 192.5 26 T 220 26 V50 H0 Z" fill="url(#ci-wave-g)" />
        <path d="M0 26 Q 13.75 12 27.5 26 T 55 26 T 82.5 26 T 110 26 T 137.5 26 T 165 26 T 192.5 26 T 220 26" fill="none" stroke="#fff" strokeWidth="0.7" strokeOpacity="0.9" />
      </svg>
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {/* วงน้ำกระเพื่อม (วงรีแบน = มองจากมุมเฉียง) */}
        {Array.from({ length: special ? 5 : 4 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: -170,
              top: -60,
              width: 340,
              height: 120,
              border: `${3 - Math.min(i, 2)}px solid rgba(224,242,254,0.9)`,
              boxShadow: '0 0 18px rgba(56,189,248,0.8), inset 0 0 12px rgba(186,230,253,0.6)',
              opacity: 0,
              animation: `ci-ripple 1.1s ${at + i * 130}ms ease-out both`,
            }}
          />
        ))}
        {/* หยดน้ำกระเซ็น (พุ่งออกแล้วตกลง) */}
        {Array.from({ length: drops }, (_, i) => {
          const ang = -Math.PI / 2 + (prand(i + 500) - 0.5) * Math.PI * 1.5;
          const dist = 180 + prand(i + 510) * 280;
          const size = 5 + prand(i + 520) * 8;
          return (
            <span
              key={i}
              className="absolute"
              style={{
                left: -size / 2,
                top: -size / 2,
                width: size,
                height: size * 1.35,
                borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                background: 'radial-gradient(circle at 35% 30%, #fff, #7dd3fc 45%, #0284c7)',
                boxShadow: '0 0 8px rgba(56,189,248,0.8)',
                ['--tx' as string]: `${Math.cos(ang) * dist}px`,
                ['--ty' as string]: `${Math.sin(ang) * dist}px`,
                animation: `ci-drop ${900 + Math.round(prand(i + 530) * 400)}ms ${at}ms cubic-bezier(.2,.7,.4,1) both`,
              }}
            />
          );
        })}
      </div>
      {/* ฟองอากาศลอยขึ้นตลอดฉาก */}
      {Array.from({ length: bubbles }, (_, i) => {
        const size = 6 + prand(i + 600) * 22;
        return (
          <span
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${prand(i + 610) * 100}%`,
              bottom: -40,
              width: size,
              height: size,
              border: '1.5px solid rgba(224,242,254,0.75)',
              background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85) 0 12%, rgba(125,211,252,0.15) 40%, transparent 70%)',
              ['--sway' as string]: `${(prand(i + 620) - 0.5) * 10}vw`,
              animation: `ci-bubble ${1700 + Math.round(prand(i + 630) * 1500)}ms ${Math.round(prand(i + 640) * dur * 0.7)}ms ease-in both`,
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Cut-in อัญเชิญ X-Rare (special = XX/XV ยาวและอลังกว่า)
 *  แสงวาบ → แถบเฉียงสีของการ์ด 2 แถบปาดสวนกัน (เส้นความเร็ว) + แถบดำบน/ล่าง
 *  → การ์ดพุ่งเข้าจากด้านข้างแบบ 3 มิติ ทุบกลางจอ (จอสั่น + คลื่นกระแทก + สะเก็ดไฟ + แสงปาดหน้าการ์ด)
 *  → ชื่อการ์ดตัวยักษ์วิ่งอยู่ด้านหลัง · ป้ายชื่อ/เลเวล/BP เลื่อนเข้า
 *  → การ์ดยุบลงกลางจอ (ภาพการ์ดบินลงสนามรับช่วงต่อจากกลางจอ)
 */
function SummonCutIn({ fx, onDone }: { fx: Extract<Fx, { kind: 'summon' }>; onDone: () => void }) {
  const dur = fx.special ? CUTIN_MS.special : CUTIN_MS.normal;
  useAutoDismiss(onDone, fx.delay + dur);
  const [shown, setShown] = useState(fx.delay === 0);
  useEffect(() => {
    if (fx.delay === 0) return;
    const t = setTimeout(() => setShown(true), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // จังหวะการ์ดทุบกลางจอ: จอสั่นแรงทั้งฉาก cut-in และกระดานด้านหลัง
  const SLAM = CUTIN_SLAM;
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => {
      const pts: [number, number][] = fx.special
        ? [[-22, 12], [18, -14], [-14, 9], [10, -6], [-5, 3], [2, -1]]
        : [[-16, 9], [13, -10], [-9, 6], [5, -3], [-2, 1]];
      shakeEl(rootRef.current, pts, fx.special ? 560 : 460);
      shakeMain(pts, fx.special ? 560 : 460);
    }, dur * SLAM);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const card = useGame((s) => s.state.cards[fx.cardId]);
  if (!card || !shown) return null;
  const def = db.get(card.cardNo);
  const art = cardArt(def.cardNo);
  const main = def.colors[0] ?? 'red';
  const ray = COLOR_HEX[main] ?? '#ef4444';
  const rich = effects().matMotion;
  const ms = (k: number) => `${Math.round(dur * k)}ms`;
  const sparks = rich && !CUTIN_THEME[main] ? (fx.special ? 28 : 18) : 0;
  const rarity = (def.rarity ?? 'X').toUpperCase();
  // ธีมตามสีหลัก (แดง = ไฟ, ฟ้า = น้ำ) · สีอื่นใช้แถบความเร็ว + สะเก็ดไฟแบบเดิม
  const theme = CUTIN_THEME[main] ?? null;
  // แถบความเร็ว: สีการ์ด + เส้นขาวบาง ๆ วิ่ง
  const band = (dir: 1 | -1, top: string, delay: number) => (
    <div
      className="pointer-events-none absolute left-[-20%] h-[22vh] w-[140%]"
      style={{
        top,
        ['--dir' as string]: String(dir),
        background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 46px), linear-gradient(90deg, transparent, ${ray}cc 18%, ${ray} 50%, ${ray}cc 82%, transparent)`,
        backgroundSize: '48px 100%, 100% 100%',
        boxShadow: `0 0 40px ${ray}`,
        transform: 'skewY(-8deg)',
        // ปาดเข้าทันทีตอนทุบ (สั้นและเร็ว)
        animation: `fx-ci-band ${ms(0.09)} ${ms(SLAM + delay)} cubic-bezier(.1,.9,.2,1) both, fx-ci-lines 0.25s linear infinite, fx-ci-band-out ${ms(0.18)} ${ms(0.8)} ease-in both`,
        mixBlendMode: 'screen',
      }}
    />
  );
  return (
    <div
      ref={rootRef}
      className={`${BOARD} z-50 flex cursor-pointer flex-col items-center justify-center overflow-hidden ${fx.special ? 'bg-black/90' : 'bg-black/80'}`}
      style={{ animation: `fx-fade-in-out ${dur}ms ease both`, perspective: 1200 }}
      onClick={onDone}
      title="คลิกเพื่อข้าม"
    >
      {/* ชาร์จพลัง: เส้นแสงพุ่งเข้าหากลางจอ + ลูกแสงกลางจอโตขึ้น (ก่อนทุบ) */}
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const ang = (i / 16) * 360 + prand(i + 40) * 12;
          return (
            <span
              key={i}
              className="absolute top-0 left-0 h-[3px] origin-left rounded-full"
              style={{
                width: `${30 + prand(i + 50) * 25}vmax`,
                background: `linear-gradient(90deg, ${i % 2 ? '#fff' : ray}, transparent)`,
                ['--r' as string]: `rotate(${ang}deg)`,
                animation: `fx-ci-charge ${ms(SLAM)} ${Math.round(prand(i + 60) * dur * 0.05)}ms cubic-bezier(.6,0,.9,.5) both`,
              }}
            />
          );
        })}
        <div
          className="absolute rounded-full"
          style={{ left: -60, top: -60, width: 120, height: 120, background: `radial-gradient(circle, #fff, ${ray} 45%, transparent 70%)`, animation: `fx-ci-core ${ms(SLAM)} ease-in both` }}
        />
      </div>
      {/* รัศมีหมุนสีการ์ด (หลังทุบ) */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[170vmax] w-[170vmax] -translate-x-1/2 -translate-y-1/2 opacity-45"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${ray} 0deg 3deg, transparent 3deg 14deg)`,
          maskImage: 'radial-gradient(circle, black 0%, transparent 55%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 55%)',
          animation: `fx-rays 10s linear infinite, fx-ci-after ${ms(0.1)} ${ms(SLAM)} ease-out both`,
        }}
      />
      {theme && <CutInTheme theme={theme} dur={dur} slam={SLAM} special={!!fx.special} rich={rich} />}
      {/* ทุบ: เส้นความเร็วระเบิดออกจากกลางจอ */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[200vmax] w-[200vmax]"
        style={{
          background: 'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.95) 0deg 0.6deg, transparent 0.6deg 7deg)',
          maskImage: 'radial-gradient(circle, transparent 6%, #000 14%, #000 30%, transparent 55%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 6%, #000 14%, #000 30%, transparent 55%)',
          opacity: 0,
          animation: `fx-ci-burst 0.55s ${ms(SLAM)} cubic-bezier(.1,.8,.3,1) forwards`,
        }}
      />
      {/* ทุบ: รอยร้าวแตกออกจากจุดกระแทก */}
      {(!theme || theme === 'fire' || theme === 'ice') && (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="-50 -50 100 100" preserveAspectRatio="xMidYMid slice" style={{ filter: theme === 'fire' ? 'drop-shadow(0 0 2px #fde047) drop-shadow(0 0 8px #f97316) drop-shadow(0 0 14px #dc2626)' : theme === 'ice' ? 'drop-shadow(0 0 2px #fff) drop-shadow(0 0 8px #38bdf8)' : `drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px ${ray})` }}>
        {Array.from({ length: fx.special ? 11 : 8 }, (_, i) => {
          const n = fx.special ? 11 : 8;
          const a = (i / n) * Math.PI * 2 + prand(i + 70) * 0.5;
          const pts: string[] = ['0,0'];
          for (let k = 1; k <= 4; k++) {
            const r = k * (9 + prand(i * 9 + k) * 6);
            const jit = (prand(i * 13 + k) - 0.5) * 0.5;
            pts.push(`${(Math.cos(a + jit) * r).toFixed(1)},${(Math.sin(a + jit) * r).toFixed(1)}`);
          }
          return (
            <polyline
              key={i}
              points={pts.join(' ')}
              fill="none"
              stroke={theme === 'fire' ? '#fed7aa' : theme === 'ice' ? '#e0f2fe' : '#fff'}
              strokeWidth={(i % 3 === 0 ? 0.6 : 0.35) * (theme === 'fire' ? 1.4 : 1)}
              pathLength={1}
              strokeDasharray="1"
              style={{ animation: `fx-ci-crack 0.9s ${Math.round(dur * SLAM)}ms ease-out both` }}
            />
          );
        })}
      </svg>
      )}
      {fx.special && (
        <>
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 h-[170vmax] w-[170vmax] -translate-x-1/2 -translate-y-1/2 opacity-55 mix-blend-screen"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, #f43f5e 0deg 3deg, transparent 3deg 9deg, #facc15 9deg 12deg, transparent 12deg 18deg, #22c55e 18deg 21deg, transparent 21deg 27deg, #38bdf8 27deg 30deg, transparent 30deg 36deg, #a855f7 36deg 39deg, transparent 39deg 45deg)',
              maskImage: 'radial-gradient(circle, black 0%, transparent 60%)',
              WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 60%)',
              animation: 'fx-rays 7s linear infinite reverse',
            }}
          />
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(253,224,71,0.55), rgba(251,146,60,0.2) 45%, transparent 70%)', animation: 'aura-pulse 1.1s ease-in-out infinite' }}
          />
        </>
      )}
      {/* แถบเฉียงปาดสวนกัน */}
      {!theme && band(1, '14%', 0)}
      {!theme && band(-1, '62%', 0.02)}
      {/* ชื่อการ์ดตัวยักษ์วิ่งอยู่ด้านหลัง */}
      <div className="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 whitespace-nowrap" style={{ animation: `fx-ci-marquee ${dur * 1.6}ms linear both` }}>
        {[0, 1].map((i) => (
          <span
            key={i}
            className="pr-24 text-[22vh] leading-none font-black tracking-tight italic"
            style={{ color: 'transparent', WebkitTextStroke: `2px ${ray}`, opacity: 0.35, textShadow: `0 0 30px ${ray}66` }}
          >
            {def.name}
          </span>
        ))}
      </div>
      {/* แถบดำบน/ล่าง (ภาพยนตร์) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-black" style={{ animation: `fx-ci-bar ${ms(0.18)} ease-out both`, boxShadow: `0 2px 0 ${ray}` }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black" style={{ animation: `fx-ci-bar ${ms(0.18)} ease-out both`, boxShadow: `0 -2px 0 ${ray}` }} />
      {/* คลื่นกระแทกตอนทุบ */}
      <div className="pointer-events-none absolute top-1/2 left-1/2" style={{ width: 0, height: 0 }}>
        {[0, 1, 2].slice(0, theme === 'water' || theme === 'dark' || theme === 'holy' ? 0 : fx.special ? 3 : 2).map((i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: -110,
              top: -110,
              width: 220,
              height: 220,
              border: `${6 - i * 2}px solid ${i === 0 ? '#fff' : ray}`,
              boxShadow: `0 0 30px ${ray}`,
              animation: `fx-cl-shock 0.8s ${Math.round(dur * SLAM) + i * 90}ms cubic-bezier(.1,.7,.3,1) both`,
            }}
          />
        ))}
        {/* สะเก็ดไฟพุ่งออก */}
        {Array.from({ length: sparks }, (_, i) => {
          const ang = (i / sparks) * Math.PI * 2 + prand(i + 3) * 0.4;
          const dist = 220 + prand(i * 7 + 1) * 260;
          const size = 3 + prand(i * 5 + 2) * 5;
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: -size / 2,
                top: -size / 2,
                width: size,
                height: size,
                background: i % 3 === 0 ? '#fff' : ray,
                boxShadow: `0 0 ${size * 3}px ${ray}`,
                ['--tx' as string]: `${Math.cos(ang) * dist}px`,
                ['--ty' as string]: `${Math.sin(ang) * dist}px`,
                animation: `fx-ci-spark 0.9s ${Math.round(dur * SLAM)}ms cubic-bezier(.1,.8,.3,1) both`,
              }}
            />
          );
        })}
      </div>
      {/* การ์ด: พุ่งเข้าแบบ 3 มิติ → ทุบ → ลอย → ยุบลง */}
      <div className="relative" style={{ animation: `fx-ci-card ${dur}ms linear both`, transformStyle: 'preserve-3d' }}>
        <div className="relative overflow-hidden rounded-xl" style={{ boxShadow: `0 0 0 3px ${ray}, 0 0 60px ${ray}, 0 0 120px ${ray}88` }}>
          {art ? (
            <img src={art} alt={def.name} className="block h-[54vh] max-h-[480px] rounded-xl" draggable={false} />
          ) : (
            <div className="h-80 w-56">
              <CardFace def={def} level={fx.level} />
            </div>
          )}
          <div className="pointer-events-none absolute -inset-y-[20%] left-0 w-1/3" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.9), transparent)', animation: `fx-cl-sheen 0.6s ${ms(SLAM + 0.02)} ease-in-out both` }} />
          {fx.special && (
            <div
              className="pointer-events-none absolute -inset-y-[20%] left-0 w-1/3"
              style={{ background: 'linear-gradient(100deg, transparent, rgba(253,224,71,0.85), transparent)', animation: `fx-cl-sheen 0.7s ${ms(0.55)} ease-in-out both` }}
            />
          )}
        </div>
      </div>
      {/* ป้ายชื่อ */}
      <div
        className="relative mt-6 flex w-[min(820px,90%)] -skew-x-12 flex-col items-center gap-1 border-y-2 bg-gradient-to-r from-transparent via-black/90 to-transparent py-3"
        style={{ borderColor: ray, animation: `fx-ci-plate ${ms(0.25)} ${ms(SLAM + 0.12)} cubic-bezier(.2,.9,.3,1.2) both` }}
      >
        <div className="flex skew-x-12 flex-col items-center gap-1">
          {fx.special && (
            <span className="bg-gradient-to-r from-rose-400 via-yellow-200 to-sky-400 bg-clip-text text-sm font-black tracking-[0.5em] text-transparent">
              {rarity} RARE · SPECIAL SUMMON
            </span>
          )}
          <span className="bg-gradient-to-b from-white via-white to-slate-300 bg-clip-text text-4xl font-black tracking-wide text-transparent italic" style={{ filter: `drop-shadow(0 3px 0 #0f172a) drop-shadow(0 0 14px ${ray})` }}>
            {def.name}
          </span>
          <span className="text-sm text-slate-200">
            {fx.braveOnto ? (
              <>
                อัญเชิญร่วมร่าง → {fx.braveOnto}
                {fx.bp > 0 && <span className="ml-2 font-bold text-emerald-300">BP +{fx.bp.toLocaleString()}</span>}
              </>
            ) : (
              <>
                {def.type === 'nexus' ? 'วาง Nexus' : 'อัญเชิญ'} · Lv{fx.level}
                {fx.bp > 0 && <span className="ml-2 font-bold text-yellow-300">BP {fx.bp.toLocaleString()}</span>}
              </>
            )}
          </span>
        </div>
      </div>
      {/* ทุบ: แสงวาบเต็มจอ (บนสุด) */}
      <div
        className="pointer-events-none absolute inset-0"
        // forwards (ไม่ใช่ both): ก่อนถึงจังหวะทุบต้องมองไม่เห็น
        style={{ background: `radial-gradient(circle, #fff 0%, #fff 35%, ${ray} 80%)`, opacity: 0, animation: `fx-ci-flash ${Math.round(260 * flashScale())}ms ${ms(SLAM)} ease-out forwards` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- draw reveal

/**
 * กดจั่วใน Draw Step: การ์ดที่ลอยอยู่กลางจอพลิกเปิดหน้าก่อนบินเข้ามือ (เฉพาะจอของคนจั่ว)
 * แยกลีลาตามระดับความหายาก (DRAW_TIER ใน store): ปกติ = พลิกเฉย ๆ · R = แสงฟ้าวาบ + แสงปาดหน้าการ์ด
 * M = รัศมีทองหมุน + ประกาย · X ขึ้นไป = รัศมีรุ้ง + แสงวาบ + ประกายมากกว่า และค้างนานที่สุด
 */
function DrawReveal({ fx, onDone }: { fx: Extract<Fx, { kind: 'drawReveal' }>; onDone: () => void }) {
  const tier = DRAW_TIER[fx.tier] ?? DRAW_TIER[0]!;
  const dimMs = fx.dimMs ?? tier.ms;
  useAutoDismiss(onDone, fx.delay + Math.max(tier.ms, dimMs));
  // แสดงเมื่อถึงคิวเท่านั้น (จั่วหลายใบ: ใบถัดไปไม่โผล่ทับใบที่กำลังเปิด)
  const [shown, setShown] = useState(fx.delay <= 0);
  useEffect(() => {
    if (fx.delay <= 0) return;
    const t = setTimeout(() => setShown(true), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const def = db.get(fx.cardNo);
  // ขนาดตอนเปิดหน้า: ใหญ่ขึ้นจากการ์ดที่ลอยอยู่ (ระดับสูงขยายมากกว่า) จุดกึ่งกลางเดิม
  const k = tier.scale;
  const cx = fx.rect.x + fx.rect.w / 2;
  const cy = fx.rect.y + fx.rect.h / 2;
  const w = fx.rect.w * k;
  const h = fx.rect.h * k;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !shown) return;
    const flipEnd = DRAW_FLIP_MS / tier.ms;
    const anim = el.animate(
      [
        { transform: `scale(${1 / k}) rotateY(180deg)` },
        { transform: `scale(${(1 + 1 / k) / 2}) rotateY(90deg)`, offset: flipEnd * 0.5 },
        { transform: 'scale(1.06) rotateY(0deg)', offset: flipEnd, easing: 'ease-out' },
        { transform: 'scale(1) rotateY(0deg)', offset: Math.min(0.95, flipEnd + 0.12) },
        { transform: 'scale(1) rotateY(0deg)' },
      ],
      { duration: tier.ms, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' },
    );
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  if (!shown) return null;
  // จังหวะที่หน้าการ์ดหันมา (นับจากตอนแสดง · เอฟเฟกต์ตามระดับเริ่มตรงนี้)
  const atMs = Math.round(DRAW_FLIP_MS * 0.55);
  const at = `${atMs}ms`;
  const glow = tier.glow;
  return (
    <div className="pointer-events-none fixed inset-0 z-[45]">
      {/* พื้นมืด (ต่อจากหน้ากดจั่ว) แล้วจางออกตอนการ์ดบินเข้ามือ */}
      {!fx.noDim && <div className="absolute inset-0 bg-black/40" style={{ animation: `draw-dim-out ${dimMs}ms linear both` }} />}
      {/* การ์ด + เอฟเฟกต์ของใบนี้หายไปตอนบินเข้ามือ (ใบแรกที่ถือพื้นมืดไว้ต่อ ต้องไม่ค้างกลางจอ) */}
      <div className="absolute" style={{ left: cx, top: cy, width: 0, height: 0, animation: `draw-gone 1ms ${tier.ms}ms forwards` }}>
        {/* M ขึ้นไป: รัศมีหมุนหลังการ์ด (ทอง / รุ้ง) */}
        {tier.rays && (
          <div
            className="absolute h-[70vmin] w-[70vmin] rounded-full"
            style={{
              left: '-35vmin',
              top: '-35vmin',
              background: tier.rays,
              maskImage: 'radial-gradient(circle, #000 18%, transparent 68%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 18%, transparent 68%)',
              opacity: 0,
              animation: `ci-fade-in 300ms ${at} ease-out forwards, fx-rays 6s linear infinite`,
            }}
          />
        )}
        {/* R ขึ้นไป: วงแสงขยายออกตอนเปิดหน้า */}
        {glow &&
          Array.from({ length: tier.rings }, (_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: -w * 0.6,
                top: -w * 0.6,
                width: w * 1.2,
                height: w * 1.2,
                border: `3px solid ${glow}`,
                boxShadow: `0 0 24px ${glow}`,
                opacity: 0,
                animation: `ci-ripple 900ms ${atMs + i * 140}ms ease-out both`,
              }}
            />
          ))}
        {/* M ขึ้นไป: ประกายรูปดาวกระจาย */}
        {Array.from({ length: tier.sparkles }, (_, i) => {
          const ang = (i / tier.sparkles) * Math.PI * 2 + prand(i + 1500) * 0.5;
          const dist = w * (0.75 + prand(i + 1510) * 0.9);
          const size = 10 + prand(i + 1520) * 14;
          return (
            <span
              key={i}
              className="absolute"
              style={{
                left: Math.cos(ang) * dist - size / 2,
                top: Math.sin(ang) * dist - size / 2,
                width: size,
                height: size,
                clipPath: 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)',
                background: tier.rainbow ? `hsl(${(i * 47) % 360} 95% 75%)` : 'radial-gradient(circle, #fff, #fde047 60%)',
                opacity: 0,
                animation: `ci-twinkle 700ms ${atMs + Math.round(prand(i + 1530) * 500)}ms ease-in-out both`,
              }}
            />
          );
        })}
        {/* การ์ด: หลังการ์ด → พลิกเปิดหน้า */}
        <div className="absolute" style={{ left: -w / 2, top: -h / 2, width: w, height: h, perspective: 1000 }}>
          <div ref={ref} className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
            <div className="absolute inset-0 overflow-hidden rounded-lg" style={{ backfaceVisibility: 'hidden', boxShadow: glow ? `0 0 0 2px ${glow}, 0 0 30px ${glow}, 0 20px 40px rgba(0,0,0,0.6)` : '0 0 0 2px rgba(186,230,253,0.9), 0 20px 40px rgba(0,0,0,0.6)' }}>
              <CardFace def={def} />
              {/* R ขึ้นไป: แสงปาดหน้าการ์ด */}
              {glow && <div className="absolute -inset-y-[20%] left-0 w-1/3" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.85), transparent)', animation: `fx-cl-sheen 0.7s ${at} ease-in-out both` }} />}
            </div>
            <div className="absolute inset-0 overflow-hidden rounded-lg" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
              <CardBack />
            </div>
          </div>
        </div>
      </div>
      {/* X ขึ้นไป: แสงวาบทั้งจอตอนเปิดหน้า */}
      {tier.flash && (
        <div className="absolute inset-0" style={{ opacity: flashScale() }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, #fff 0%, rgba(255,255,255,0.6) 30%, transparent 70%)', opacity: 0, animation: `fx-ci-flash 420ms ${at} ease-out forwards` }} />
        </div>
      )}
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
export function FxLayer() {
  const fx = useGame((s) => s.fx);
  const dismiss = useGame((s) => s.dismissFx);
  const introDone = useGame((s) => s.introDone);
  const current = fx.find((f) => f.kind === 'banner' || f.kind === 'summon');
  const toasts = fx.filter((f): f is Extract<Fx, { kind: 'activate' }> => f.kind === 'activate').slice(0, 3);
  const floats = fx.filter((f): f is Extract<Fx, { kind: 'float' }> => f.kind === 'float');

  return (
    <>
      {current?.kind === 'banner' && <Banner key={current.id} fx={current} onDone={() => dismiss(current.id)} />}
      {fx.map((f) => (f.kind === 'intro' ? <MatchIntro key={f.id} fx={f} onDone={() => introDone(f.id)} /> : null))}
      {fx.map((f) => (f.kind === 'result' ? <MatchResult key={f.id} fx={f} onClose={() => dismiss(f.id)} /> : null))}
      {fx.map((f) => (f.kind === 'finalBlow' ? <FinalBlow key={f.id} fx={f} onDone={() => dismiss(f.id)} /> : null))}
      {current?.kind === 'summon' && <SummonCutIn key={current.id} fx={current} onDone={() => dismiss(current.id)} />}
      {/* ป๊อปอัปเอฟเฟกต์มุมขวาบน (ใต้ป้ายผู้เล่นคู่แข่ง) อยู่เหนือจอสลัว */}
      <div className="pointer-events-none fixed top-24 right-3 z-[48] flex w-[340px] flex-col gap-2">
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
        ) : f.kind === 'drawReveal' ? (
          <DrawReveal key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'finalBlowBanner' ? (
          <FinalBlowBanner key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'cardActivate' ? (
          <CardActivate key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'spell' ? (
          <SpellFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'chainAdd' ? (
          <ChainAddFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'reveal' ? (
          <RevealFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'mill' ? (
          <MillFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'target' ? (
          <TargetFx key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'chain' ? (
          <ChainDisplay key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : f.kind === 'damage' ? (
          <Damage key={f.id} fx={f} onDone={() => dismiss(f.id)} />
        ) : null,
      )}
      <SpellStage />
      <SkipOverlay />
    </>
  );
}

// ---------------------------------------------------------------- card motion

const rectOf = layoutRect;

/**
 * ความกว้างแผงถาวรด้านขวา (--sidebar ตอนนี้ = 0px: กระดานเต็มจอ)
 * เดิมเขียน `parseFloat(...) || 400` ทำให้ 0 กลายเป็น 400 จุดกึ่งกลางเยื้องซ้าย 200px (กอง Chain ของคู่แข่งเลยอยู่กลางจอ)
 */
function sidebarWidth(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar'));
  return Number.isFinite(v) ? v : 0;
}

/** กึ่งกลางกระดาน (ไม่รวมแผงด้านขวา) ขนาดการ์ดใหญ่ */
function boardCenter(w: number, h: number): Rect {
  const sidebar = sidebarWidth();
  return { x: (innerWidth - sidebar) / 2 - w / 2, y: innerHeight / 2 - h / 2, w, h };
}

const frame = (r: Rect, extra: Keyframe = {}): Keyframe => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, ...extra });

const COLOR_HEX: Record<string, string> = { red: '#ef4444', purple: '#a855f7', green: '#22c55e', white: '#e2e8f0', yellow: '#facc15', blue: '#38bdf8' };

/** จอสั่นตามการตั้งค่า (ตั้งค่า → กราฟิก → จอสั่น): points = ระยะ px ของแต่ละจังหวะ ก่อนคูณความแรง */
function shakeMain(points: [number, number][], duration: number) {
  return shakeEl(document.querySelector('main'), points, duration);
}
function shakeEl(el: Element | null | undefined, points: [number, number][], duration: number) {
  const k = shakeScale();
  if (k === 0) return;
  return el?.animate(
    [{ transform: 'translate(0,0)' }, ...points.map(([x, y]) => ({ transform: `translate(${x * k}px,${y * k}px)` })), { transform: 'translate(0,0)' }],
    { duration, easing: 'ease-out' },
  );
}

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
/** R: วงแสงสีฟ้าขยายออก + ประกายรอบการ์ดตอนลงสนาม */
function rareFlash(target: Element) {
  const r = layoutRect(target);
  if (!r) return;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  spawnFx(
    { left: `${cx - r.w * 0.8}px`, top: `${cy - r.w * 0.8}px`, width: `${r.w * 1.6}px`, height: `${r.w * 1.6}px`, borderRadius: '50%', background: 'radial-gradient(circle, rgba(224,242,254,0.95) 0%, rgba(56,189,248,0.55) 35%, transparent 70%)' },
    [
      { transform: 'scale(0.3)', opacity: 1 },
      { transform: 'scale(1.6)', opacity: 0 },
    ],
    { duration: 520, easing: 'ease-out' },
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    spawnFx(
      { left: `${cx - 3}px`, top: `${cy - 3}px`, width: '6px', height: '6px', borderRadius: '50%', background: '#e0f2fe', boxShadow: '0 0 8px 3px rgba(56,189,248,0.9)' },
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r.w * 0.9}px, ${Math.sin(a) * r.w * 0.9}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }
}

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
      [{ opacity: flashScale() }, { opacity: 0 }],
      { duration: 550, easing: 'ease-out' },
    );
  }
  // จอสั่น
  const k = heavy ? 14 : 5;
  shakeMain(
    [
      [-k, k * 0.7],
      [k * 0.8, -k * 0.6],
      [-k * 0.5, k * 0.4],
      [k * 0.25, 0],
    ],
    heavy ? 520 : 300,
  );
}

/** การ์ดบิน: จั่ว (Deck → มือ), ลงการ์ด (มือ → สนาม แล้วกระแทก), Magic (มือ → กลางจอ → Trash), Burst (ช่อง Burst → กลางจอ) */
/** การ์ดของฝั่งตรงข้าม (กระดานด้านบนหมุน 180°): ภาพการ์ดที่ลอยอยู่ต้องกลับหัวตาม */
function upsideFor(owner: string | undefined): boolean {
  return !!owner && owner !== viewPlayer(useGame.getState());
}

/** ห่อหน้าการ์ดให้กลับหัวเมื่อเป็นของฝั่งตรงข้าม */
function Upside({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <div className="h-full w-full rotate-180">{children}</div> : <>{children}</>;
}

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
  // ออกจากสนามแบบหงาย: พลิกคว่ำกลางทาง
  const ownerVisible = useGame((s) => {
    const owner = s.state.cards[fx.cardId]?.owner;
    return !!owner && !hiddenFrom(s, owner);
  });
  const [revealed, setRevealed] = useState(!!fx.revealFirst || (!!fx.flipMid && ownerVisible));

  useLayoutEffect(() => {
    const el = ref.current;
    // 'center' = ต่อจาก cut-in X-Rare: เริ่มจากการ์ดใหญ่กลางจอ
    // 'stage:<owner>' = ออกจากเวทีของการ์ดที่ร่าย (เช่น เบิร์สที่อัญเชิญตัวเองลงสนาม)
    const from0 =
      fx.from === 'center'
        ? boardCenter(300, 420)
        : typeof fx.from === 'string' && fx.from.startsWith('stage:')
          ? // ออกจากที่การ์ดค้างอยู่ (เบิร์สที่รอวาง Core = ช่อง Burst แบบหงาย)
            (rectOf(document.querySelector(`[data-spell-card="${fx.cardId}"]`)) ?? restRect(fx.from.slice(6) as PlayerId, castTone(useGame.getState().state, fx.cardId)))
          : typeof fx.from === 'string'
            ? rectOf(document.querySelector(fx.from))
            : fx.from;
    // การ์ดที่นอนอยู่ (กรอบแนวนอน): วาดการ์ดตั้งตรงขนาดเดิมแล้วหมุน fromRotate ให้ทับตำแหน่งเดิมพอดี
    const from =
      from0 && fx.fromRotate && from0.w > from0.h
        ? { x: from0.x + from0.w / 2 - from0.h / 2, y: from0.y + from0.h / 2 - from0.w / 2, w: from0.h, h: from0.w }
        : from0;
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
    } else if (fx.mode === 'brave') {
      // ร่วมร่าง: ลอยขึ้นเหนือผู้ร่วมร่าง (ขนาดใกล้เคียงการ์ดบนสนาม) → หมุนลงช่องเบรฟที่มุมการ์ด
      const slotEl = document.querySelector<HTMLElement>(fx.to);
      const slot = rectOf(slotEl);
      if (!slotEl || !slot) return onDone();
      const host = fx.via ? rectOf(document.querySelector(fx.via)) : null;
      const rot = slotEl.className.includes('-rotate-12') ? -12 : 12;
      const over = host ? { x: host.x + host.w * 0.15, y: host.y - host.h * 0.45, w: host.w * 0.7, h: host.h * 0.7 } : slot;
      const glow = '0 0 26px 8px rgba(52,211,153,0.85)';
      anim = el.animate(
        [
          frame(from, { opacity: 1, transform: `rotate(${fx.fromRotate ?? 0}deg)` }),
          frame(over, { offset: 0.45, opacity: 1, transform: 'rotate(-4deg)', boxShadow: glow, filter: 'brightness(1.2)', easing: 'ease-in-out' }),
          frame({ ...over, y: over.y - 8 }, { offset: 0.65, opacity: 1, transform: 'rotate(0deg)', boxShadow: glow, filter: 'brightness(1.5)', easing: 'cubic-bezier(.7,0,.9,.6)' }),
          frame(slot, { opacity: 1, transform: `rotate(${rot}deg)`, boxShadow: glow, filter: 'brightness(2)' }),
        ],
        { duration: 900, delay: fx.delay, fill: 'both' },
      );
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
          ? [frame(from, { opacity: fx.fromReveal ? 1 : 0.6 }), frame(to, { opacity: 1 })]
          : fx.mode === 'move'
            ? [
                frame(from, { opacity: 1, transform: `rotate(${fx.fromRotate ?? 0}deg)`, filter: fx.fromRotate ? 'brightness(0.75)' : 'none' }),
                frame(mid, { offset: 0.5, opacity: 1, transform: 'rotate(-6deg)', filter: 'none' }),
                frame(to, { opacity: fx.shrink ? 0.2 : 1, transform: 'rotate(0deg)', filter: 'none' }),
              ]
          : [frame(from, { opacity: 1 }), frame(mid, { offset: 0.55, opacity: 1, transform: 'scale(1.12)' }), frame(to, { opacity: 1 })],
        // ย้ายโซน: ค้างที่จุดเริ่มระหว่างรอคิว (การ์ดออกจากโซนเดิมใน state ไปแล้ว ไม่ให้หายวับ)
        { duration: fx.mode === 'draw' ? 420 : fx.mode === 'move' ? 480 : 520, delay: fx.delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: fx.mode === 'move' ? 'both' : 'forwards' },
      );
      if (fx.revealFirst || fx.flipMid) setTimeout(() => setRevealed(false), fx.delay + 240);
    }
    anim.onfinish = () => {
      if (fx.mode === 'brave' && fx.via) {
        const host = document.querySelector(fx.via);
        if (host) landImpact(host, '#34d399', false);
      }
      if (fx.mode === 'play') {
        const target = document.querySelector(fx.to);
        const c = useGame.getState().state.cards[fx.cardId];
        const color = (c && COLOR_HEX[db.get(c.cardNo).colors[0] ?? 'red']) || '#facc15';
        if (target) {
          landImpact(target, fx.rare ? '#7dd3fc' : color, !!fx.heavy);
          if (fx.rare) rareFlash(target);
        }
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
      <Upside on={fx.mode !== 'magic' && fx.mode !== 'burst' && upsideFor(card?.owner)}>
        {(faceDown && !revealed) || !flipped ? <CardBack /> : <CardFace def={def} />}
      </Upside>
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
    const sign = el.closest('[data-mat].rotate-180') ? -1 : 1;
    const tx = (dx / len) * reach * sign;
    const ty = (dy / len) * reach * sign;
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

/**
 * การ์ดที่เอฟเฟกต์ทำงาน (บนสนาม/บนมือ): ทั้งจอสลัวลง แล้วสำเนาการ์ดลอยขึ้นเหนือทุกอย่าง ขยาย เรืองแสงทอง มีวงไฮไลต์รอบการ์ด แล้ววางกลับ
 * การ์ดตัวจริงซ่อนไว้ระหว่างนั้น (สำเนาอยู่ชั้นบนสุด ไม่ติดลำดับชั้นของกระดาน)
 */
function CardActivate({ fx, onDone }: { fx: Extract<Fx, { kind: 'cardActivate' }>; onDone: () => void }) {
  const card = useGame((s) => s.state.cards[fx.cardId]);
  const [view, setView] = useState<{ rect: Rect; lift: number; k: number; lying: boolean; faceDown: boolean; upside: boolean } | null>(null);
  const [burst, setBurst] = useState(false);
  const cloneRef = useRef<HTMLDivElement>(null);
  /** กล่องที่หมุนตามการ์ด (นอน/กลับหัว): วงไฮไลต์อยู่ที่นี่ ให้ขอบเรืองแสงตามรูปการ์ด */
  const ringRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // fx.rect: การ์ดที่ยังอยู่บนสนามตอนเอฟเฟกต์ทำงาน แต่ออกจากสนามทีหลังในชุดเดียวกัน (ไม่มีใน DOM แล้ว)
    // ภาพที่ยืนแทนที่ช่องเดิมคือภาพแตก (Ghost) ของการ์ดใบนี้: ซ่อนภาพนั้นระหว่างยกขึ้น
    const el = fx.rect
      ? null
      : fx.trash
        ? document.querySelector<HTMLElement>(`[data-trash-top="${fx.trash}"]`)
        : fx.hand
          ? document.querySelector<HTMLElement>(`[data-hand-card="${fx.cardId}"]`)
          : fx.brave
            ? document.querySelector<HTMLElement>(`[data-brave-card="${fx.cardId}"]`)
            : document.querySelector<HTMLElement>(`[data-field-card="${fx.cardId}"] > div:first-child`);
    const owner = useGame.getState().state.cards[fx.cardId]?.owner;
    if ((!el && !fx.rect) || !owner) return onDone();
    // การ์ดบนสนาม: ซ่อนแค่หน้าการ์ด (ป้าย BP / Brave ที่ร่วมร่างยังอยู่)
    const faceOf = () =>
      el ? (!fx.hand && !fx.brave && !fx.trash ? ((el.firstElementChild as HTMLElement | null) ?? el) : el) : document.querySelector<HTMLElement>(`[data-ghost-card="${fx.cardId}"]`);
    let face: HTMLElement | null = null;
    // ขนาดจริงของกล่อง (ไม่รวมการหมุนของพัดบนมือ) วางกลางกรอบที่เห็นบนจอ
    // (การ์ดบนสนามที่แถวถูกย่อ: ใช้ขนาดหลังย่อ)
    let rect: Rect;
    let w: number;
    let h: number;
    if (el) {
      const bb = el.getBoundingClientRect();
      const k = fieldScaleOf(el);
      w = el.offsetWidth * k;
      h = el.offsetHeight * k;
      rect = { x: bb.x + bb.width / 2 - w / 2, y: bb.y + bb.height / 2 - h / 2, w, h };
    } else {
      rect = fx.rect!;
      w = rect.w;
      h = rect.h;
    }
    // ท่าตามสภาพ ณ จังหวะที่เอฟเฟกต์ทำงาน (เช่น เพิ่งประกาศป้องกัน = นอน) กล่องบนจออาจยังหมุนไม่เสร็จ: สลับกว้าง/สูงรอบจุดกลาง
    if (fx.lying !== undefined && fx.lying !== w > h) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      [w, h] = [h, w];
      rect = { x: cx - w / 2, y: cy - h / 2, w, h };
    }
    const upside = upsideFor(owner);
    // "ยกขึ้น" เข้าหาเจ้าของการ์ด: ฝั่งตรงข้ามเลื่อนลงบนจอ
    const lift = fx.trash ? (upside ? 90 : -90) : fx.hand ? (upside ? 110 : -130) : fx.brave ? (upside ? 40 : -40) : upside ? 26 : -26;
    setView({
      rect,
      lift,
      k: fx.trash ? 2.4 : fx.hand ? 1.3 : fx.brave ? 1.9 : 1.24,
      lying: !fx.hand && !fx.brave && !fx.trash && w > h,
      faceDown: !!fx.hand && hiddenFrom(useGame.getState(), owner),
      upside,
    });
    const hide = setTimeout(() => {
      face = faceOf();
      if (face) face.style.visibility = 'hidden';
    }, fx.delay);
    const showBurst = setTimeout(() => setBurst(true), fx.delay + fx.duration * 0.2);
    const end = setTimeout(() => {
      if (face) face.style.visibility = '';
      onDone();
    }, fx.delay + fx.duration);
    return () => {
      [hide, showBurst, end].forEach(clearTimeout);
      if (face) face.style.visibility = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = cloneRef.current;
    if (!el || !view) return;
    const glow = 'drop-shadow(0 0 16px rgba(250,204,21,0.95)) drop-shadow(0 0 4px rgba(255,255,255,0.9)) brightness(1.18)';
    const ring = '0 0 0 3px rgba(253,224,71,0.95), 0 0 26px 8px rgba(250,204,21,0.75)';
    // fill forwards: ระหว่างรอถึงคิว (delay) ใช้สไตล์ตั้งต้น opacity 0 = ยังไม่โผล่ (ไม่ทับการ์ดตัวจริงตอน Chain ก่อนหน้ายังเล่นอยู่)
    const timing = { duration: fx.duration, delay: fx.delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' } as const;
    const anim = el.animate(
      [
        { transform: 'translateY(0) scale(1)', filter: 'none', opacity: 1 },
        { transform: `translateY(${view.lift}px) scale(${view.k})`, filter: glow, opacity: 1, offset: 0.22 },
        { transform: `translateY(${view.lift}px) scale(${view.k * 1.02})`, filter: glow, opacity: 1, offset: 0.5 },
        { transform: `translateY(${view.lift}px) scale(${view.k})`, filter: glow, opacity: 1, offset: 0.82 },
        { transform: 'translateY(0) scale(1)', filter: 'none', opacity: 1 },
      ],
      timing,
    );
    const ringAnim = ringRef.current?.animate(
      [
        { boxShadow: '0 0 0 0 rgba(253,224,71,0)' },
        { boxShadow: ring, offset: 0.22 },
        { boxShadow: '0 0 0 4px rgba(254,240,138,1), 0 0 40px 14px rgba(250,204,21,0.9)', offset: 0.5 },
        { boxShadow: ring, offset: 0.82 },
        { boxShadow: '0 0 0 0 rgba(253,224,71,0)' },
      ],
      timing,
    );
    return () => {
      anim.cancel();
      ringAnim?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (!view || !card) return null;
  const { rect } = view;
  const cw = view.lying ? rect.h : rect.w;
  const ch = view.lying ? rect.w : rect.h;
  const def = db.get(card.cardNo);
  return (
    <>
      {/* ทั้งจอสลัว (รวม HUD) */}
      <div className="pointer-events-none fixed inset-0 z-[45] bg-slate-950/75" style={{ animation: `fx-spot ${fx.duration}ms ${fx.delay}ms ease-out both` }} />
      {burst && <Sunburst burst={{ ...rect, y: rect.y + view.lift + 18 }} duration={fx.duration} />}
      {/* สำเนาการ์ดเหนือจอสลัว + วงไฮไลต์ */}
      <div className="pointer-events-none fixed z-[47] flex items-center justify-center" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        <div ref={cloneRef} className="rounded-lg" style={{ width: cw, height: ch, transform: 'scale(1)', opacity: 0 }}>
          <div ref={ringRef} className="h-full w-full rounded-lg" style={{ transform: `${view.lying ? 'rotate(90deg)' : ''} ${view.upside ? 'rotate(180deg)' : ''}`.trim() || undefined }}>
            {view.faceDown ? <CardBack /> : <CardFace def={def} />}
          </div>
        </div>
      </div>
    </>
  );
}

function Sunburst({ burst, duration }: { burst: Rect; duration: number }) {
  const fx = { duration };
  return (
    <div className="pointer-events-none fixed z-[46]" style={{ left: burst.x + burst.w / 2, top: burst.y + burst.h / 2 - 18 }}>
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
    const b = setTimeout(onDone, fx.delay + 2600 + LETHAL_SLOW_EXTRA);
    return () => [a, b].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (!on) return;
    // สโลว์โมชันทั้งจอ: ทุกแอนิเมชัน (รวมระเบิด ตัวเลข การ์ดที่ชน และฉากนี้เอง) ช้าลง ค้างไว้ แล้วค่อย ๆ เร่งกลับปกติ
    // ตั้งทุกเฟรม เพื่อให้แอนิเมชันที่เพิ่งเริ่มระหว่างนี้ช้าตามด้วย
    const { rate, hold, ramp } = LETHAL_SLOW;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = performance.now() - t0;
      const u = t <= hold ? 0 : Math.min(1, (t - hold) / ramp);
      const r = rate + (1 - rate) * u * u;
      // จอสั่นตอนปล่อย: ไม่ทำให้ช้า
      for (const x of document.getAnimations()) if (!(x as Animation & { _noSlow?: boolean })._noSlow) x.playbackRate = r;
      // เสียงช้าตามภาพ
      setSfxTimeScale(r);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    // ปล่อย: จอสั่นแรง (ระเบิดถึงจุดพีค)
    const shake = setTimeout(() => {
      const a = shakeMain(
        [
          [-22, 12],
          [18, -14],
          [-14, 9],
          [10, -6],
          [-5, 3],
        ],
        650,
      );
      if (a) (a as Animation & { _noSlow?: boolean })._noSlow = true;
    }, LETHAL_RELEASE);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(shake);
      document.getAnimations().forEach((x) => (x.playbackRate = 1));
      setSfxTimeScale(1);
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
      {/* แสงวาบ */}
      <div className="absolute inset-0" style={{ opacity: flashScale() }}>
        <div className="absolute inset-0 bg-white" style={{ animation: 'fx-fb-flash 0.55s ease-out both' }} />
      </div>
    </div>
  );
}

/**
 * แถบเหลืองแนวตั้งสองข้างจอ "Final Blow !" วิ่งสวนกัน
 * ขึ้นตอนประกาศโจมตีที่ถ้าไม่ป้องกัน Life คู่แข่งจะเป็น 0 · ค้างไว้จนการต่อสู้นี้จบ แล้วเลื่อนออก
 */
function FinalBlowBanner({ fx, onDone }: { fx: Extract<Fx, { kind: 'finalBlowBanner' }>; onDone: () => void }) {
  const [on, setOn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // ยังอยู่ในการต่อสู้นี้: การต่อสู้ยังไม่จบ / ภาพวิ่งชนยังเล่นอยู่ / ฉาก FINAL BLOW (Life เป็น 0) ยังเล่นอยู่
  const active = useGame(
    (s) => s.state.battle?.attackerId === fx.attackerId || s.fx.some((f) => (f.kind === 'charge' && f.cardId === fx.attackerId) || f.kind === 'finalBlow' || (f.kind === 'damage' && !!f.lethal)),
  );
  useEffect(() => {
    const t = setTimeout(() => setOn(true), fx.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!on || active) return;
    setLeaving(true);
    const t = setTimeout(onDone, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, active]);
  if (!on) return null;
  return (
    <div className={`${BOARD} pointer-events-none z-[59] overflow-hidden`}>
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} w-16 overflow-hidden bg-gradient-to-b from-lime-200 via-yellow-300 to-lime-200 shadow-[0_0_24px_rgba(190,242,100,0.8)]`}
          style={{ '--from': side === 'left' ? '-110%' : '110%', animation: leaving ? 'fx-fb-bar-out 0.45s ease-in both' : 'fx-fb-bar-in 0.4s cubic-bezier(.2,.9,.3,1) both' } as React.CSSProperties}
        >
          <div
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            style={{ '--dist': side === 'left' ? '-50%' : '50%', translate: side === 'left' ? undefined : '0 -50%', animation: 'fx-fb-scroll 2.4s linear infinite' } as React.CSSProperties}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className="mb-10 text-4xl font-black whitespace-nowrap text-slate-900 italic"
                style={{ writingMode: 'vertical-rl', transform: side === 'left' ? 'rotate(180deg)' : undefined }}
              >
                Final Blow !
              </span>
            ))}
          </div>
        </div>
      ))}
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
const CHAIN_HOLD_END = 0.83; // สัดส่วนเวลาที่การ์ดค้างในกอง Chain ก่อนจางหาย
/** ขนาดการ์ดในกอง Chain (ใบที่ต่อมาก่อนจะถูกย่ออีกตอนแสดง: OLD_SCALE) */
const STACK_W = 176;
const STACK_H = 246;
/** ใบ Chain ล่าสุดใหญ่ที่สุด */
const STACK_NEW = 1.2;
/** ระยะจากกลางจอถึงกอง Chain: ของเราอยู่ซ้าย ของคู่แข่งอยู่ขวา */
const CHAIN_SIDE_OFFSET = 340;

/** ระยะระหว่างการ์ดในกอง Chain (ความสูงการ์ด + ช่องให้เห็นโซ่) */
const STACK_STEP = STACK_H + 48;

/**
 * ตำแหน่งการ์ดในกอง Chain กลางจอ: ใบใหม่สุดอยู่จุดเดิมเสมอ ใบที่ต่อมาก่อนไล่ลงไปด้านล่างทีละช่อง (ล้นจอได้)
 * ของเราอยู่ซ้าย ของคู่แข่งอยู่ขวา
 */
function stackLayout(sides: ('self' | 'opp')[]): Rect[] {
  const sidebar = sidebarWidth();
  const cx = (innerWidth - sidebar) / 2;
  const top = innerHeight * 0.42;
  const last = sides.length - 1;
  return sides.map((side, k) => {
    const x = cx + (side === 'self' ? -1 : 1) * CHAIN_SIDE_OFFSET;
    const y = top + (last - k) * STACK_STEP;
    const z = k === last ? STACK_NEW : 1;
    return { x: x - (STACK_W * z) / 2, y: y - (STACK_H * z) / 2, w: STACK_W * z, h: STACK_H * z };
  });
}


// ---------------------------------------------------------------- Spell Stage (เมจิก / เบิร์ส)

/**
 * เวทีของการ์ดที่กำลังร่าย: ตำแหน่งเดียวกับใบล่าสุดของกอง Chain (ของเราซ้าย คู่แข่งขวา)
 * ฉาก Chain ที่แทรกขึ้นมาจึงต่อจากการ์ดใบนี้ได้พอดี
 */
export function stageRect(owner: string): Rect {
  const side = viewPlayer(useGame.getState()) === owner ? 'self' : 'opp';
  return stackLayout([side])[0]!;
}

/** กลับไปพัก (รอเลือก) / ขึ้นเวทีจากที่พัก ก่อนเรืองแสงซ้ำ (ms) */
const REST_MS = CAST_MS.rest;

/** ยกการ์ดขึ้นจากช่อง Burst: ขยายรอบกลางช่อง แล้วเยื้องเข้าหากลางกระดาน (ช่องอยู่คอลัมน์ริมจอ ไม่ให้ล้นขอบ) */
function liftFromSlot(slot: Rect): Rect {
  const k = 1.7;
  const w = slot.w * k;
  const h = slot.h * k;
  const boardCx = (innerWidth - sidebarWidth()) / 2;
  const cx = slot.x + slot.w / 2 + Math.sign(boardCx - (slot.x + slot.w / 2)) * slot.w * 0.55;
  const cy = slot.y + slot.h / 2 + Math.sign(innerHeight / 2 - (slot.y + slot.h / 2)) * slot.h * 0.2;
  const x = Math.max(8, Math.min(innerWidth - sidebarWidth() - w - 8, cx - w / 2));
  const y = Math.max(8, Math.min(innerHeight - h - 8, cy - h / 2));
  return { x, y, w, h };
}

/**
 * ที่พักของการ์ดที่ร่ายค้างรอผู้เล่นเลือก
 *  เบิร์ส: ช่อง Burst ของเจ้าของ (หงายหน้า)
 *  เมจิก: ท้ายพัดมือของเจ้าของ ยกขึ้นจากมือเล็กน้อย (ไม่บังการ์ดบนมือที่อาจต้องคลิกเลือก)
 */
export function restRect(owner: PlayerId, tone: 'main' | 'flash' | 'burst', cardId?: string): Rect {
  if (tone === 'burst') {
    const r = rectOf(document.querySelector(`[data-burst-card="${owner}"]`));
    if (r) return r;
  }
  const g = useGame.getState();
  const upside = viewPlayer(g) !== owner;
  // ช่องเดิมในพัดมือที่เว้นไว้ (ตำแหน่งที่สั่งใช้): ลอยขึ้นจากช่องเล็กน้อย
  if (cardId) {
    const slot = rectOf(document.querySelector(`[data-cast-slot="${cardId}"]`));
    if (slot) return { ...slot, y: slot.y + (upside ? 1 : -1) * slot.h * 0.22 };
  }
  const W = 116;
  const H = 162;
  const cards = g.state.players[owner].hand.map((id) => rectOf(document.querySelector(`[data-hand-card="${id}"]`))).filter((r): r is Rect => !!r);
  if (cards.length === 0) {
    const cx = (innerWidth - sidebarWidth()) / 2;
    return { x: cx - W / 2, y: upside ? 12 : innerHeight - H - 12, w: W, h: H };
  }
  const right = Math.max(...cards.map((r) => r.x + r.w));
  const x = Math.min(right + 10, innerWidth - sidebarWidth() - W - 12);
  // ยกออกจากแนวมือเล็กน้อย (มือเราอยู่ล่าง = ขึ้น, มือคู่แข่งอยู่บน = ลง)
  const edge = upside ? Math.max(...cards.map((r) => r.y + r.h)) : Math.min(...cards.map((r) => r.y));
  return { x, y: upside ? edge - H * 0.55 : edge - H * 0.45, w: W, h: H };
}

const SPELL_TONE = {
  main: { color: '#facc15', glow: 'rgba(250,204,21,0.85)', label: 'MAGIC [MAIN]' },
  flash: { color: '#818cf8', glow: 'rgba(129,140,248,0.9)', label: 'MAGIC [FLASH]' },
  burst: { color: '#fb923c', glow: 'rgba(251,146,60,0.9)', label: 'BURST' },
} as const;

/** หน้าตาการ์ดบนเวที (ใช้ทั้งตอนร่ายและตอนค้างรอเลือก): หน้า/หลังสำหรับพลิก + ป้ายประเภท + แสงเรือง */
function SpellCardBody({ cardId, tone, flipRef, pulse }: { cardId: string; tone: keyof typeof SPELL_TONE; flipRef?: React.Ref<HTMLDivElement>; pulse: number }) {
  const card = useGame((s) => s.state.cards[cardId]);
  // การ์ดของฝั่งคู่แข่ง: คงทิศกลับหัวตามฝั่งของเขา (ไม่หมุนให้ตั้งตรง)
  const upside = useGame((s) => !!card && viewPlayer(s) !== card.owner);
  if (!card) return null;
  const t = SPELL_TONE[tone];
  return (
    <>
      {/* รัศมีหมุน + คลื่น ตอนเอฟเฟกต์ทำงาน */}
      {pulse > 0 && (
        <>
          <div
            key={`rays-${pulse}`}
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 aspect-square w-[300%] rounded-full"
            style={{
              translate: '-50% -50%',
              background: `repeating-conic-gradient(from 0deg, ${t.color} 0deg 4deg, transparent 4deg 16deg)`,
              maskImage: 'radial-gradient(circle, #000 18%, transparent 62%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 18%, transparent 62%)',
              animation: 'fx-spell-rays 1.2s ease-out both',
            }}
          />
          <div
            key={`ring-${pulse}`}
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 aspect-square w-[140%] rounded-full"
            // fx-shockwave เลื่อนกึ่งกลางเอง (translate -50%) ไม่ต้องใส่ translate ซ้ำ
            style={{ border: `5px solid ${t.color}`, boxShadow: `0 0 24px ${t.glow}, inset 0 0 24px ${t.glow}`, animation: 'fx-shockwave 0.9s ease-out both' }}
          />
        </>
      )}
      <div className="relative h-full w-full" style={{ transform: upside ? 'rotate(180deg)' : undefined, transformStyle: 'preserve-3d' }}>
      <div ref={flipRef} className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
        <div
          key={`face-${pulse}`}
          className="absolute inset-0 rounded-lg"
          style={{
            backfaceVisibility: 'hidden',
            boxShadow: `0 0 0 3px ${t.color}, 0 0 30px 8px ${t.glow}`,
            animation: pulse > 0 ? 'fx-spell-glow 1.1s ease-out both' : undefined,
          }}
        >
          <CardFace def={db.get(card.cardNo)} />
          {/* แสงปาดหน้าการ์ดตอนทำงาน */}
          {pulse > 0 && (
            <div className="absolute inset-0 overflow-hidden rounded-lg">
              <div className="absolute -inset-y-[20%] left-0 w-2/5" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.85), transparent)', animation: 'fx-cl-sheen 0.7s 0.1s ease-in-out both' }} />
            </div>
          )}
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <CardBack />
        </div>
      </div>
      </div>
      {/* ป้ายประเภท: ด้านที่หันเข้ากลางกระดาน (ของเรา = บน, ของคู่แข่ง = ล่าง) อ่านได้ตรงเสมอ */}
      <div
        className={`pointer-events-none absolute ${upside ? '-bottom-7' : '-top-7'} left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-black tracking-[0.2em] whitespace-nowrap text-slate-950 italic`}
        style={{ background: t.color, boxShadow: `0 0 14px ${t.glow}` }}
      >
        {t.label}
      </div>
    </>
  );
}

/**
 * เมจิก / เบิร์สที่กำลังร่าย (ดู Fx 'spell' ใน store)
 *  มือ: ยกขึ้นเหนือการ์ดใบอื่น (มือที่คว่ำ = พลิกหงายระหว่างยก) → ขยายไปที่เวที → เรืองแสง
 *  เบิร์ส: พลิกหงายที่ช่อง Burst → ขยายไปที่เวที → เรืองแสง
 *  ค้างที่เวทีจนผลของการ์ดจบ แล้วลง Trash (ย่อเข้าช่อง) / ลงสนาม (ภาพบินลงสนามรับช่วงต่อ) / ค้างรอเลือก (SpellStage รับช่วงต่อ)
 */
function SpellFx({ fx, onDone }: { fx: Extract<Fx, { kind: 'spell' }>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState(0);
  const [dim, setDim] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const flip = flipRef.current;
    if (!el) return onDone();
    const st = useGame.getState();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const anims: Animation[] = [];
    const D = fx.delay;
    // ทุกอย่างเกิดตรงที่เดิม: ช่องเดิมในมือ (ยกขึ้นเล็กน้อย) / ช่อง Burst · ไม่วิ่งไปกลางจอ
    const rest = restRect(fx.owner, fx.tone, fx.cardId);
    // เบิร์ส: ตอนทำงานยกขึ้นจากช่อง (ขยาย ~1.7 เท่า เยื้องเข้าหากลางกระดานไม่ให้ล้นขอบจอ) · กลับลงช่องตอนรอเลือก
    const stage = fx.tone === 'burst' ? liftFromSlot(rest) : rest;
    /** ตำแหน่งปัจจุบันของการ์ด (ไว้เริ่มท่าถัดไป) */
    let cur = stage;
    const moveTo = (to: Rect, ms: number, at = 0) => {
      const from = cur;
      cur = to;
      const a = el.animate([frame(from, { opacity: 1, transform: 'rotate(0deg)' }), frame(to, { opacity: 1, transform: 'rotate(0deg)' })], {
        duration: ms,
        delay: at,
        easing: 'cubic-bezier(.3,.8,.3,1)',
        fill: 'forwards',
      });
      anims.push(a);
      return a;
    };
    if (fx.from === 'stage') {
      // ค้างรอเลือกอยู่ที่มือ / ช่อง Burst (หงาย): เอฟเฟกต์ทำงานอีกครั้ง = เรืองแสงตรงนั้น (เบิร์สยกขึ้นจากช่องก่อน)
      cur = rest;
      anims.push(el.animate([frame(rest, { opacity: 1 }), frame(rest, { opacity: 1 })], { duration: 1, fill: 'forwards' }));
      if (flip) anims.push(flip.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)' }], { duration: 1, fill: 'forwards' }));
      if (fx.pulses.length > 0 && stage !== rest) {
        timers.push(setTimeout(() => moveTo(stage, CAST_MS.rise), Math.max(0, fx.pulses[0]! - CAST_MS.rise)));
      }
    } else {
      // มือ: ยกขึ้นจากช่องเดิมเล็กน้อย · เบิร์ส: พลิกหงายพร้อมยกขึ้น (ขยาย) จากช่อง Burst
      const start = fx.from === 'burst' ? rest : (fx.fromRect ?? rest);
      const L = CAST_MS.lift / CAST_MS.intro;
      anims.push(
        el.animate(
          [
            frame(start, { opacity: 1, filter: 'brightness(1)', boxShadow: '0 0 0 rgba(0,0,0,0)', easing: 'cubic-bezier(.2,.9,.3,1)' }),
            frame(stage, { offset: L, opacity: 1, filter: 'brightness(1.25)', boxShadow: '0 40px 40px rgba(0,0,0,0.55)' }),
            frame(stage, { opacity: 1, filter: 'brightness(1)', boxShadow: '0 40px 40px rgba(0,0,0,0.55)' }),
          ],
          { duration: CAST_MS.intro, delay: D, fill: 'both' },
        ),
      );
      // พลิกหงาย: ช่อง Burst เสมอ / มือที่คว่ำ (มือคู่แข่ง)
      const faceDown = fx.from === 'burst' || hiddenFrom(st, fx.owner);
      if (flip) {
        anims.push(
          faceDown
            ? flip.animate(
                [
                  { transform: 'rotateY(180deg) scale(1)' },
                  { transform: 'rotateY(180deg) scale(1)', offset: 0.04 },
                  { transform: 'rotateY(90deg) scale(1.08)', offset: L * 0.65 },
                  { transform: 'rotateY(0deg) scale(1)', offset: L },
                  { transform: 'rotateY(0deg) scale(1)' },
                ],
                { duration: CAST_MS.intro, delay: D, fill: 'both', easing: 'ease-in-out' },
              )
            : flip.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)' }], { duration: 1, fill: 'forwards' }),
        );
      }
    }
    // เรืองแสงทุกครั้งที่เอฟเฟกต์ทำงาน (+ จอสลัวสั้น ๆ ให้การ์ดเด่น)
    fx.pulses.forEach((p, i) => {
      timers.push(
        setTimeout(() => {
          setPulse(i + 1);
          setDim((d) => d + 1);
        }, p),
      );
    });
    // ออกจากเวที: ลง Trash / ลงสนาม (ภาพบินลงสนามรับช่วงต่อ) / รอเลือก = กลับไปพักที่มือ (ยกขึ้นเล็กน้อย) หรือช่อง Burst (หงาย)
    timers.push(
      setTimeout(() => {
        if (fx.exit === 'trash') {
          const trash = rectOf(document.querySelector(`[data-trash="${fx.owner}"]`));
          if (!trash) return onDone();
          const small = { x: trash.x + trash.w / 2 - 22, y: trash.y + trash.h / 2 - 31, w: 44, h: 62 };
          const a = el.animate([frame(cur, { opacity: 1, transform: 'rotate(0deg)' }), frame(small, { opacity: 0.3, transform: 'rotate(-8deg)' })], {
            duration: CAST_MS.exit,
            easing: 'cubic-bezier(.5,0,.6,1)',
            fill: 'forwards',
          });
          anims.push(a);
          a.onfinish = onDone;
        } else if (fx.exit === 'song') {
          // เมจิคไทป์เพลง: ย่อลงไปวางที่โซนเพลงบนฟิลด์
          const slot = rectOf(document.querySelector(`[data-song-card="${fx.cardId}"]`));
          if (!slot) return onDone();
          const a = el.animate([frame(cur, { opacity: 1, transform: 'rotate(0deg)' }), frame(slot, { opacity: 1, transform: 'rotate(0deg)' })], {
            duration: CAST_MS.exit,
            easing: 'cubic-bezier(.5,0,.6,1)',
            fill: 'forwards',
          });
          anims.push(a);
          a.onfinish = onDone;
        } else if (fx.exit === 'stay' && cur !== rest) {
          // วัดที่พักใหม่ตอนนี้: พัดมืออาจเปลี่ยนระหว่างที่ผลเล่นอยู่ (เช่น จั่วการ์ดเพิ่ม)
          moveTo(restRect(fx.owner, fx.tone, fx.cardId), REST_MS).onfinish = onDone;
        } else onDone();
      }, fx.end),
    );
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {dim > 0 && <div key={dim} className={`${BOARD} pointer-events-none z-[41] bg-slate-950/55`} style={{ animation: 'fx-spell-dim 1.1s ease-out both' }} />}
      <div ref={ref} data-spell-card={fx.cardId} className="pointer-events-none fixed z-[42]" style={{ opacity: 0, perspective: 900 }}>
        <SpellCardBody cardId={fx.cardId} tone={fx.tone} flipRef={flipRef} pulse={pulse} />
      </div>
    </>
  );
}

/** เมจิกที่พักอยู่ในช่องเดิมของพัดมือ (Board วาดในพัด ให้ซ้อนกับใบข้าง ๆ ตามลำดับเหมือนการ์ดในมือ) */
export function CastRestCard({ cardId }: { cardId: string }) {
  const tone = useGame((s) => castTone(s.state, cardId));
  // กำลังมีภาพของการ์ดใบนี้เล่นอยู่ (ขึ้นเวที / กลับมาพัก / ลง Trash): ซ่อนไว้ก่อน
  const busy = useGame((s) => s.fx.some((f) => (f.kind === 'spell' || f.kind === 'fly' || f.kind === 'chainAdd') && f.cardId === cardId));
  if (busy) return null;
  return (
    <div className="relative h-full w-full">
      <SpellCardBody cardId={cardId} tone={tone} pulse={0} />
    </div>
  );
}

/** กำลังเลือก Core บนกระดาน (จ่าย/วาง): การ์ดที่พักรอเลือกต้องไม่บัง/ไม่ขวาง Core บนสนาม */
export function pickingCores(s: ReturnType<typeof useGame.getState>): boolean {
  const k = s.state.choice?.kind;
  return k === 'payCost' || k === 'placeCores' || k === 'multiSummon' || !!s.play || !!s.evolveCard;
}

/** การ์ดที่ยังร่ายไม่จบ (รอเลือกเป้าหมาย / จ่ายใช้ Flash / วาง Core ลงสนาม): พักไว้ที่มือ (เมจิก) หรือช่อง Burst แบบหงาย (เบิร์ส) */
export function SpellStage() {
  const state = useGame((s) => s.state);
  const fx = useGame((s) => s.fx);
  // ผู้เลือกวาง Core ลงสนาม (การ์ดใบนี้) เห็นการ์ดในแผงอัญเชิญอยู่แล้ว: ไม่ซ้อนบนเวทีทับแผง (อีกฝ่ายยังเห็นบนเวที)
  const panelCard = useGame((s) => (s.state.choice?.kind === 'placeCores' && controls(s, s.state.choice.player) ? s.state.choice.cardId : null));
  // เมจิกที่มีช่องในพัดมือ: พัดมือวาดเอง (CastRestCard) ซ้อนกับใบข้าง ๆ ตามลำดับ
  const inHandSlot = useGame((s) => `${castHandSlots(s.state, 'p1')},${castHandSlots(s.state, 'p2')}`);
  const ids = castCards(state).filter(
    (id) => id !== panelCard && !inHandSlot.includes(`${id}:`) && !fx.some((f) => (f.kind === 'spell' || f.kind === 'fly' || f.kind === 'chainAdd') && f.cardId === id),
  );
  const picking = useGame(pickingCores);
  const hover = useGame((s) => s.hover);
  const pin = useGame((s) => s.pin);
  if (ids.length === 0) return null;
  return (
    <>
      {ids.map((id) => {
        const card = state.cards[id];
        if (!card) return null;
        const tone: keyof typeof SPELL_TONE = castTone(state, id);
        const r = restRect(card.owner, tone, id);
        // ชี้/คลิก/กดค้างดูความสามารถได้ (เช่น เบิร์สที่รอจ่าย Flash) · ตอนเลือก Core เมจิกที่พักไม่ขวาง Core บนสนาม (โปร่งและคลิกทะลุ)
        const blocking = picking && tone !== 'burst';
        return (
          <div
            key={id}
            data-spell-card={id}
            className={`fixed z-[42] transition-opacity ${blocking ? 'pointer-events-none opacity-35' : 'pointer-events-auto cursor-pointer'}`}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, animation: 'fx-spell-idle 2.4s ease-in-out infinite' }}
            onMouseEnter={() => hover(id)}
            onMouseLeave={() => hover(null)}
            onClick={() => pin(id)}
          >
            <SpellCardBody cardId={id} tone={tone} pulse={0} />
          </div>
        );
      })}
    </>
  );
}

const inRect = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
/** ย่อ Rect รอบจุดกึ่งกลาง */
const shrink = (r: Rect, k: number): Rect => ({ x: r.x + (r.w * (1 - k)) / 2, y: r.y + (r.h * (1 - k)) / 2, w: r.w * k, h: r.h * k });
/** สุ่มแบบคงที่ตามเลข (ไม่เปลี่ยนทุกครั้งที่ render) */
const prand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// เวลา (วินาที) ของข้อโซ่ที่เพิ่งต่อ สัมพันธ์กับการ์ดใหม่ที่พุ่งมาวางในกอง
const CL_DRAW_AT = 0.42;
const CL_DRAW_MS = 0.38;
/** โซ่ต่อถึงการ์ดใหม่ = ล็อก: แสงวาบ คลื่นกระแทก จอสั่น เลข Chain พลิก */
const CL_LOCK_AT = CL_DRAW_AT + CL_DRAW_MS;
/** ช่วงโซ่ถูกกระชากให้ตึงหลังล็อก */
const CL_SNAP = 0.4;
/** การ์ดที่ต่อมาก่อน: ย่อลงและเอียงเล็กน้อยให้การ์ดใหม่เด่น */
const OLD_SCALE = 0.88;

/**
 * โซ่หนึ่งข้อระหว่างการ์ดสองใบในกอง Chain (วาดไว้ใต้การ์ด: การ์ดบังปลายโซ่)
 *  - ลากจากกลางการ์ดเก่าถึงกลางการ์ดใหม่ ห้อยโค้งตามแรงโน้มถ่วง (แกว่งเบา ๆ)
 *  - ข้อโซ่ = ห่วงรีเรียงต่อกัน + แสงสะท้อน ไล่สีจากสีของการ์ดเก่าไปการ์ดใหม่
 *  - fresh (ข้อที่เพิ่งต่อ): เหวี่ยงหย่อน ๆ เข้าหาการ์ดใหม่ → ล็อก (แสงวาบตรงขอบการ์ด) → ถูกกระชากตึง
 *    → สายฟ้าแลบตามโซ่ (rich) → ลูกพลังงานวิ่งไปตามโซ่
 *  - ข้อเก่า: ประกายเล็ก ๆ ไหลผ่านช้า ๆ
 * from/to = กรอบการ์ดที่มองเห็น (ใช้หาจุดที่โซ่โผล่พ้นขอบการ์ด)
 */
function ChainLink({ id, from, to, colorFrom, colorTo, glow, fresh, rich }: { id: string; from: Rect; to: Rect; colorFrom: string; colorTo: string; glow: string; fresh: boolean; rich: boolean }) {
  const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = Math.max(36, Math.min(150, dist * 0.22));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const curve = (sx: number, sy: number) => `M ${a.x} ${a.y} Q ${mid.x + sx} ${mid.y + sy} ${b.x} ${b.y}`;
  const d1 = curve(0, sag);
  const d2 = curve((b.x - a.x) * 0.05, sag * 0.78);
  // ข้อใหม่: หย่อนก่อนล็อก แล้วกระชากตึงเกินนิดหนึ่งก่อนคืนรูป
  const dSlack = curve(0, sag * 1.5);
  const dTaut = curve(0, sag * 0.4);
  // จุดบนเส้นโค้ง (รูปปกติ d1)
  const ctrl = { x: mid.x, y: mid.y + sag };
  const at = (t: number) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * ctrl.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * ctrl.y + t * t * b.y });
  // จุดที่โซ่โผล่พ้นขอบการ์ด (ไว้วางแสงล็อก)
  let ta = 0;
  while (ta < 1 && inRect(from, at(ta))) ta += 0.01;
  let tb = 1;
  while (tb > 0 && inRect(to, at(tb))) tb -= 0.01;
  const exitA = at(ta);
  const exitB = at(tb);
  // ขนาดโซ่ (คูณทุกความกว้าง/ระยะเส้นประ)
  const S = 2.2;
  const P = 31 * S; // ระยะหนึ่งห่วง
  const pathId = `${id}-p`;
  const sway = '.45 0 .55 1;.45 0 .55 1';
  /** การขยับของเส้น: ข้อใหม่ = หย่อน → กระชากตึง → แกว่ง · ข้อเก่า = แกว่งอย่างเดียว */
  const motion = (
    <>
      {fresh && <animate attributeName="d" values={`${dSlack};${dTaut};${d1}`} keyTimes="0;0.4;1" dur={`${CL_SNAP}s`} begin={`${CL_LOCK_AT}s`} fill="freeze" calcMode="spline" keySplines=".2 .9 .3 1;.3 0 .4 1" />}
      <animate attributeName="d" values={`${d1};${d2};${d1}`} dur="1.9s" begin={fresh ? `${CL_LOCK_AT + CL_SNAP}s` : '0s'} repeatCount="indefinite" calcMode="spline" keySplines={sway} />
    </>
  );
  const base = fresh ? dSlack : d1;
  const sparks = [0, 60, 120, 180, 240, 300];
  const lock = (p: { x: number; y: number }, color: string) => (
    <g transform={`translate(${p.x} ${p.y})`}>
      <circle r={18} fill="none" stroke={color} strokeWidth={5} style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `fx-cl-lock 0.55s ${CL_LOCK_AT}s ease-out both` }} />
      <circle r={9} fill="#fff" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `fx-cl-lock-core 0.5s ${CL_LOCK_AT}s ease-out both` }} />
      {sparks.map((deg) => (
        <line key={deg} x1={0} y1={-12} x2={0} y2={-26} stroke={color} strokeWidth={3.5} strokeLinecap="round" transform={`rotate(${deg})`} style={{ animation: `fx-cl-spark 0.45s ${CL_LOCK_AT}s ease-out both` }} />
      ))}
    </g>
  );
  // สายฟ้าตามโซ่ (เฉพาะช่วงที่โผล่พ้นการ์ด): เส้นหยัก 3 แบบสลับกันกะพริบ
  const arcs = fresh && rich && tb > ta
    ? [0, 1, 2].map((v) => {
        const n = Math.max(6, Math.round(((tb - ta) * dist) / 22));
        const pts = Array.from({ length: n + 1 }, (_, i) => {
          const t = ta + ((tb - ta) * i) / n;
          const p = at(t);
          const q = at(Math.min(1, t + 0.01));
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const off = i === 0 || i === n ? 0 : (prand(v * 97 + i) - 0.5) * 22;
          return `${(p.x - ((q.y - p.y) / len) * off).toFixed(1)},${(p.y + ((q.x - p.x) / len) * off).toFixed(1)}`;
        });
        return (
          <polyline
            key={v}
            points={pts.join(' ')}
            fill="none"
            stroke="#fff"
            strokeWidth={2.2}
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 4px ${colorTo}) drop-shadow(0 0 8px ${colorTo})`, animation: `fx-cl-arc 0.7s ${CL_LOCK_AT + 0.05 + v * 0.07}s linear both` }}
          />
        );
      })
    : null;
  return (
    <g>
      <defs>
        <path id={pathId} d={base}>
          {motion}
        </path>
        <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
          <stop offset="0" stopColor={colorFrom} />
          <stop offset="1" stopColor={colorTo} />
        </linearGradient>
        {fresh && (
          <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={-4000} y={-4000} width={12000} height={12000}>
            {/* ต้องเป็น <path> จริง: pathLength ใช้กับ <use> ไม่ได้ (เส้นประจะนับเป็น px แล้วโซ่ขาดเป็นช่วง ๆ) */}
            <path d={base} fill="none" stroke="#fff" strokeWidth={110} strokeLinecap="round" pathLength={100} style={{ strokeDasharray: 100, animation: `fx-cl-link ${CL_DRAW_MS}s ${CL_DRAW_AT}s ease-out both` }}>
              {motion}
            </path>
          </mask>
        )}
      </defs>
      <g mask={fresh ? `url(#${id}-m)` : undefined} style={{ filter: `drop-shadow(0 0 9px ${glow})` }}>
        {/* เงา/ขอบมืดของโซ่ */}
        <use href={`#${pathId}`} fill="none" stroke="#020617" strokeOpacity={0.85} strokeWidth={17 * S} strokeLinecap="round" />
        {/* ห่วงโซ่ (รี) */}
        <use href={`#${pathId}`} fill="none" stroke={`url(#${id}-g)`} strokeWidth={11 * S} strokeLinecap="round" strokeDasharray={`${20 * S} ${P - 20 * S}`} />
        {/* รูกลางห่วง: ทำให้ดูเป็นห่วงกลวง */}
        <use href={`#${pathId}`} fill="none" stroke="#0b1020" strokeWidth={3.5 * S} strokeLinecap="round" strokeDasharray={`${9 * S} ${P - 9 * S}`} strokeDashoffset={-5.5 * S} />
        {/* ห่วงขวางที่คล้องระหว่างห่วงรี */}
        <use href={`#${pathId}`} fill="none" stroke={`url(#${id}-g)`} strokeWidth={5 * S} strokeLinecap="butt" strokeDasharray={`${6 * S} ${P - 6 * S}`} strokeDashoffset={-22.5 * S} />
        {/* แสงสะท้อนบนห่วง */}
        <use href={`#${pathId}`} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={2 * S} strokeLinecap="round" strokeDasharray={`${10 * S} ${P - 10 * S}`} strokeDashoffset={-3 * S} transform={`translate(0 ${-3 * S})`} />
      </g>
      {arcs}
      {/* ลูกพลังงานวิ่งไปตามโซ่: ข้อใหม่ = เร็วและสว่างหลังล็อก, ข้อเก่า = ประกายช้า ๆ */}
      {(fresh ? [0, 0.12] : [0]).map((lag, i) => (
        <circle key={i} r={(fresh ? 6 - i * 2 : 3.5) * 1.7} fill="#fff" opacity={0} style={{ filter: `drop-shadow(0 0 8px ${colorTo}) drop-shadow(0 0 3px #fff)` }}>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.1;0.85;1"
            dur={fresh ? '0.6s' : '1.6s'}
            begin={fresh ? `${CL_LOCK_AT + CL_SNAP + lag}s` : `${lag + 0.3}s`}
            repeatCount={fresh ? 2 : 'indefinite'}
          />
          <animateMotion dur={fresh ? '0.6s' : '1.6s'} begin={fresh ? `${CL_LOCK_AT + CL_SNAP + lag}s` : `${lag + 0.3}s`} repeatCount={fresh ? 2 : 'indefinite'}>
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
      {fresh && lock(exitA, colorFrom)}
      {fresh && lock(exitB, colorTo)}
    </g>
  );
}

/** วงเวทรอบการ์ดใหม่ในกอง Chain: วงซ้อนหลายชั้นหมุนสวนกัน + อักษรรอบวง + ดาวหกแฉก */
function MagicCircle({ id, color, glow, spin, scale }: { id: string; color: string; glow: string; spin: boolean; scale: number }) {
  const rot = (sec: number, reverse: boolean) =>
    spin ? { transformBox: 'fill-box' as const, transformOrigin: 'center', animation: `fx-cl-spin ${sec}s linear infinite${reverse ? ' reverse' : ''}` } : undefined;
  const tri = (deg: number) =>
    [0, 120, 240]
      .map((k) => {
        const r = ((k + deg - 90) * Math.PI) / 180;
        return `${(Math.cos(r) * 134).toFixed(1)},${(Math.sin(r) * 134).toFixed(1)}`;
      })
      .join(' ');
  // วงกลมโปร่งใสขนาดเท่ากันทุกชั้น: ให้กรอบของแต่ละชั้นสมมาตร หมุนรอบกึ่งกลางพอดี
  const pad = <circle r={166} fill="none" stroke="none" />;
  return (
    <svg
      width={340 * scale}
      height={340 * scale}
      viewBox="-170 -170 340 340"
      className="absolute overflow-visible"
      style={{ left: -170 * scale, top: -170 * scale, filter: `drop-shadow(0 0 8px ${glow})`, animation: 'fx-cl-ring 1.2s cubic-bezier(.2,.8,.2,1) both' }}
    >
      <defs>
        <path id={`${id}-rune`} d="M 0 -147 A 147 147 0 1 1 -0.01 -147" />
      </defs>
      <g style={rot(26, false)}>
        {pad}
        <circle r={162} fill="none" stroke={color} strokeWidth={3} />
        <circle r={155} fill="none" stroke={color} strokeWidth={9} strokeDasharray="2 9" strokeOpacity={0.85} />
      </g>
      <g style={rot(20, true)}>
        {pad}
        <text fill={color} fontSize={12} fontWeight={800} opacity={0.9}>
          <textPath href={`#${id}-rune`} textLength={918} lengthAdjust="spacing">
            {'CHAIN • LINK • SPIRIT • BURST • CHAIN • LINK • SPIRIT • BURST • '}
          </textPath>
        </text>
        <circle r={139} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.8} />
      </g>
      <g style={rot(14, false)}>
        {pad}
        <polygon points={tri(0)} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.85} />
        <polygon points={tri(180)} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.85} />
      </g>
      <g style={rot(9, true)}>
        {pad}
        <circle r={124} fill="none" stroke={color} strokeWidth={5} strokeDasharray="30 14" strokeOpacity={0.95} />
      </g>
    </svg>
  );
}

/**
 * แถบขอบจอในฉาก Chain: ปาดเข้ามาจากนอกจอ ขอบด้านในเฉียง
 * ข้างในมีลายโซ่เลื่อนขึ้น + อักษร CHAIN แนวตั้ง · วาบสว่างตอนโซ่ล็อก
 */
function EdgeBand({ side, color, glow, rich }: { side: 'left' | 'right'; color: string; glow: string; rich: boolean }) {
  const left = side === 'left';
  const clip = left ? 'polygon(0 0, 100% 0, 62% 100%, 0 100%)' : 'polygon(0 0, 100% 0, 100% 100%, 38% 100%)';
  // ลายโซ่หนึ่งช่วง (สูง 60): ห่วงรีด้านหน้า + ห่วงด้านข้างที่คล้องทะลุบน/ล่าง
  const link = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='60'><rect x='15.5' y='-2' width='5' height='12' rx='2.5' fill='${color}'/><rect x='15.5' y='26' width='5' height='38' rx='2.5' fill='${color}'/><rect x='7' y='4' width='22' height='30' rx='11' fill='none' stroke='${color}' stroke-width='5'/><rect x='10' y='8' width='4' height='10' rx='2' fill='white' fill-opacity='0.6'/></svg>`,
  );
  const edge = left ? { left: 14 } : { right: 14 };
  const textEdge = left ? { left: 56 } : { right: 56 };
  return (
    <div
      className={`absolute inset-y-0 ${left ? 'left-0' : 'right-0'}`}
      style={{ width: 92, filter: `drop-shadow(0 0 12px ${glow})`, ['--from' as string]: left ? '-110%' : '110%', animation: 'fx-cl-band-in 0.45s 0.05s cubic-bezier(.2,.8,.2,1) both' }}
    >
      <div className="absolute inset-0" style={{ clipPath: clip }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(${left ? 90 : 270}deg, ${glow}, rgba(2,6,23,0.88) 80%)` }} />
        {/* ลายโซ่ */}
        <div
          className="absolute inset-y-0"
          style={{ ...edge, width: 36, backgroundImage: `url("data:image/svg+xml,${link}")`, backgroundRepeat: 'repeat-y', animation: rich ? 'fx-cl-band-scroll 1.4s linear infinite' : undefined }}
        />
        {/* อักษร CHAIN แนวตั้ง */}
        <div className="absolute inset-y-0 overflow-hidden text-[11px] font-black tracking-[0.4em] text-white/60 italic" style={{ ...textEdge, writingMode: 'vertical-rl', transform: left ? undefined : 'rotate(180deg)' }}>
          <span className="block whitespace-nowrap" style={{ animation: rich ? 'fx-cl-band-text 6s linear infinite' : undefined }}>
            {'CHAIN • '.repeat(30)}
          </span>
        </div>
        {/* วาบตอนโซ่ล็อก */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(${left ? 90 : 270}deg, #fff, transparent 85%)`, animation: `fx-cl-band-flash 0.5s ${CL_LOCK_AT}s ease-out both` }} />
      </div>
    </div>
  );
}

/** ตราเลข Chain บนมุมการ์ด (สี่เหลี่ยมข้าวหลามตัด) */
function ChainBadge({ n, self, ring, glow, style }: { n: number; self: boolean; ring: string; glow: string; style?: CSSProperties }) {
  return (
    <span className={`absolute -top-5 ${self ? '-left-5' : '-right-5'} flex h-12 w-12 items-center justify-center`} style={style}>
      <span className="absolute inset-1.5 rotate-45 rounded-md border-2 border-white/90" style={{ background: `linear-gradient(135deg, #fff 0%, ${ring} 45%, #0f172a 100%)`, boxShadow: `0 0 16px ${glow}, 0 4px 10px rgba(0,0,0,0.6)` }} />
      <span className="relative text-xl font-black text-slate-950 italic" style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}>
        {n}
      </span>
    </span>
  );
}

/** ฉาก Chain เปิดอยู่กี่อัน (ซ่อนลูกศรโจมตี/มือระหว่างฉาก) */
let chainFocus = 0;
const setChainFocus = (d: number) => {
  chainFocus = Math.max(0, chainFocus + d);
  document.documentElement.classList.toggle('fx-chain-focus', chainFocus > 0);
};

/** สีเลข/วงเวทตามความยาว Chain: 2 = สีฝั่ง, 3 = แดงเพลิง, 4+ = ม่วงเข้ม */
const CHAIN_HEAT = [
  null,
  { ring: '#fb7185', glow: 'rgba(244,63,94,0.85)', text: 'from-yellow-100 via-orange-400 to-rose-600' },
  { ring: '#e879f9', glow: 'rgba(217,70,239,0.9)', text: 'from-white via-fuchsia-300 to-violet-600' },
] as const;

/**
 * ต่อ Chain (แสดงเมื่อมีตั้งแต่ 2 Chain): กอง Chain ของเราซ้าย ของคู่แข่งขวา
 *  1. ซ่อนลูกศรโจมตี/มือ + ฉากมืด แบ่งแสงสองฝั่ง (ทอง | ฟ้า) มีแนวปะทะกลางจอ สปอตไลต์หลังการ์ด ขอบจอมืด ประกายไฟลอย
 *  2. การ์ดใหม่พุ่งมาวางบนสุด (แสงปาดหน้าการ์ด) การ์ดเก่าย่อ/เอียง ถูกดันลงไป
 *  3. โซ่เหวี่ยงเข้าหาการ์ดใหม่ → ล็อก: คลื่นกระแทก จอสั่น การ์ดสะท้าน โซ่ถูกกระชากตึง สายฟ้าแลบ เลข CHAIN พลิก
 *  4. Chain ยิ่งยาวยิ่งแรง (สี/คลื่น/จอสั่น/ประกายไฟ)
 * ชุดกราฟิกต่ำ: ไม่มีประกายไฟลอย สายฟ้า และวงเวทไม่หมุน
 */
function ChainAddFx({ fx, onDone }: { fx: Extract<Fx, { kind: 'chainAdd' }>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
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
  // กอง ณ จังหวะที่ต่อ Chain (store ส่งมา) · กองจากสภาพปัจจุบันอาจว่างไปแล้ว (เช่น Attack Step จบในชุดเดียวกัน)
  const stack = fx.stack.length > 0 ? fx.stack : chainEntries(state).slice(0, fx.index + 1);
  const sides = stack.map((e) => (e.player === me ? 'self' : 'opp') as 'self' | 'opp');
  const n = fx.index + 1;
  const heat = n >= 4 ? 2 : n >= 3 ? 1 : 0;
  useLayoutEffect(() => {
    if (!on) return;
    const el = ref.current;
    // เมจิก/เบิร์สบนเวที: ออกจากเวที (ตำแหน่งเดียวกับใบล่าสุดของกอง Chain)
    const from =
      layoutRect(
        document.querySelector(`[data-field-card="${fx.cardId}"] > div:first-child`) ??
          document.querySelector(`[data-brave-card="${fx.cardId}"]`) ??
          document.querySelector(`[data-spell-card="${fx.cardId}"]`),
      ) ?? boardCenter(150, 210);
    const spot = stackLayout(sides)[fx.index];
    if (!el || !spot) return onDone();
    const big = { x: spot.x - spot.w * 0.06, y: spot.y - spot.h * 0.06, w: spot.w * 1.12, h: spot.h * 1.12 };
    // easing ใส่รายช่วง: ถ้าใส่ทั้งแอนิเมชัน เวลาจะถูกบีบจนการ์ดเริ่มจางตั้งแต่ราว 1.1 วิ (แทนที่จะค้างถึง CHAIN_HOLD_END)
    const ease = 'cubic-bezier(.2,.8,.2,1)';
    const anim = el.animate(
      [
        frame(from, { opacity: 1, transform: 'rotate(0deg)', filter: 'brightness(1.6)', easing: ease }),
        frame(big, { offset: 0.12, opacity: 1, transform: 'rotate(-4deg)', filter: 'brightness(1.5)', easing: ease }),
        frame(spot, { offset: 0.18, opacity: 1, transform: 'rotate(0deg)', filter: 'brightness(1)' }),
        frame(spot, { offset: CHAIN_HOLD_END, opacity: 1, transform: 'rotate(0deg) scale(1)', filter: 'brightness(1.1)', easing: 'ease-in' }),
        frame(spot, { opacity: 0, transform: 'rotate(0deg) scale(0.92)', filter: 'brightness(1.4)' }),
      ],
      { duration: CHAIN_LINK_MS, fill: 'forwards' },
    );
    anim.onfinish = onDone;
    // ซ่อนลูกศรโจมตี/มือระหว่างฉาก (คืนตอนฉากเริ่มจาง)
    setChainFocus(1);
    let focused = true;
    const unfocus = () => {
      if (focused) setChainFocus(-1);
      focused = false;
    };
    const tUnfocus = setTimeout(unfocus, CHAIN_LINK_MS * CHAIN_HOLD_END);
    // ล็อก: จอสั่น (ยิ่ง Chain ยาวยิ่งแรง) ทั้งฉาก Chain และกระดานด้านหลัง
    const k = 1 + heat * 0.4;
    const tShake = setTimeout(() => {
      const pts: [number, number][] = [[-7 * k, 3 * k], [6 * k, -3 * k], [-4 * k, 2 * k], [2 * k, -1 * k]];
      shakeEl(stageRef.current, pts, 380);
      shakeEl(document.querySelector('main'), pts, 380);
    }, CL_LOCK_AT * 1000);
    return () => {
      anim.cancel();
      clearTimeout(tUnfocus);
      clearTimeout(tShake);
      unfocus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  const card = state.cards[fx.cardId];
  // กองไม่ครบถึงใบนี้ (ไม่ควรเกิด): ไม่วาด ดีกว่าทำให้ทั้งหน้าพัง
  if (!on || !card || sides.length <= fx.index) return null;
  const rich = effects().matMotion;
  const layout = stackLayout(sides);
  const spot = layout[fx.index]!;
  const toneOf = (side: 'self' | 'opp') =>
    side === 'self'
      ? { ring: '#fbbf24', glow: 'rgba(251,191,36,0.75)', text: 'from-yellow-100 via-amber-300 to-orange-500' }
      : { ring: '#7dd3fc', glow: 'rgba(56,189,248,0.75)', text: 'from-white via-sky-200 to-sky-500' };
  const tone = toneOf(sides[fx.index]!);
  // สีเลข/วงเวท/คลื่น: ตามความยาว Chain
  const accent = CHAIN_HEAT[heat] ?? tone;
  const hold = `${CHAIN_LINK_MS * CHAIN_HOLD_END}ms`;
  const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const sc = center(spot);
  // ขนาดวงเวท/คลื่น ตามขนาดการ์ดใหม่ (วงในสุดเลยมุมการ์ดเล็กน้อย)
  const ms = Math.hypot(spot.w, spot.h) / 2 / 129;
  const midX = (innerWidth - sidebarWidth()) / 2;
  const push = { ['--push' as string]: `${-STACK_STEP}px`, animation: 'fx-cl-push 0.4s 0.22s cubic-bezier(.3,1.3,.5,1) both' };
  /** ทิศสะท้านตอนล็อก: การ์ดถูกโซ่ดึงเข้าหากัน */
  const pull = (fromR: Rect, toR: Rect, px: number) => {
    const p = center(fromR);
    const q = center(toR);
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { ['--rx' as string]: `${((q.x - p.x) / len) * px}px`, ['--ry' as string]: `${((q.y - p.y) / len) * px}px` };
  };
  const prev = layout[fx.index - 1];
  const embers = rich ? 22 + heat * 12 : 0;
  return (
    <>
      <div ref={stageRef} className={`${BOARD} pointer-events-none z-[44] overflow-hidden`} style={{ animation: `fx-cl-backdrop ${hold} ease-out both` }}>
        <div className="absolute inset-0 bg-slate-950/80" />
        {/* แสงสองฝั่ง: ของเรา (ทอง) | คู่แข่ง (ฟ้า) */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 34% 75% at ${midX - CHAIN_SIDE_OFFSET}px 55%, rgba(251,191,36,0.24), transparent 70%), radial-gradient(ellipse 34% 75% at ${midX + CHAIN_SIDE_OFFSET}px 55%, rgba(56,189,248,0.24), transparent 70%)`,
          }}
        />
        {/* Chain ยาว: ไอร้อนกลางจอ */}
        {heat > 0 && (
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 45% 60% at ${midX}px ${sc.y}px, ${accent.glow}, transparent 70%)`, opacity: 0.32, animation: 'fx-cl-heat 0.9s ease-in-out infinite alternate' }}
          />
        )}
        {/* แนวปะทะกลางจอ */}
        <div
          className="absolute -top-[10%] h-[120%] w-[3px]"
          style={{
            left: midX,
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0.85) 70%, transparent)',
            boxShadow: `0 0 26px 7px ${heat ? accent.glow : 'rgba(255,255,255,0.28)'}`,
            animation: 'fx-cl-seam 0.5s 0.1s cubic-bezier(.2,.8,.2,1) both',
          }}
        />
        {/* ขอบจอมืด */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.8) 100%)' }} />
        {/* แถบขอบจอ: ซ้าย = ฝั่งเรา (ทอง) ขวา = คู่แข่ง (ฟ้า) · Chain ยาวใช้สีตามความยาว */}
        <EdgeBand side="left" color={heat ? accent.ring : '#fbbf24'} glow={heat ? accent.glow : 'rgba(251,191,36,0.75)'} rich={rich} />
        <EdgeBand side="right" color={heat ? accent.ring : '#7dd3fc'} glow={heat ? accent.glow : 'rgba(56,189,248,0.75)'} rich={rich} />
        {/* ประกายไฟลอยขึ้น */}
        {Array.from({ length: embers }, (_, i) => {
          const x = prand(i * 3 + 1) * (midX * 2);
          const hot = heat > 0 && prand(i * 7 + 2) < 0.45;
          const color = hot ? accent.ring : x < midX ? '#fcd34d' : '#7dd3fc';
          const size = 2 + prand(i * 5 + 3) * 3.5;
          return (
            <span
              key={i}
              className="absolute -bottom-3 rounded-full"
              style={{
                left: x,
                width: size,
                height: size,
                background: color,
                boxShadow: `0 0 ${size * 3}px ${color}`,
                ['--dx' as string]: `${(prand(i * 11 + 4) - 0.5) * 120}px`,
                animation: `fx-cl-ember ${1.6 + prand(i * 13 + 5) * 1.4}s ${prand(i * 17 + 6) * 1.4}s ease-out infinite both`,
              }}
            />
          );
        })}
        {/* สปอตไลต์หลังการ์ดแต่ละใบ */}
        {layout.map((r, k) => (
          <div key={k} className="absolute" style={k === fx.index ? undefined : push}>
            <div
              className="absolute rounded-full"
              style={{
                left: r.x + r.w / 2 - r.w * 1.3,
                top: r.y + r.h / 2 - r.h * 1.0,
                width: r.w * 2.6,
                height: r.h * 2.0,
                background: `radial-gradient(ellipse, ${toneOf(sides[k]!).glow} 0%, transparent 62%)`,
                opacity: k === fx.index ? 0.55 : 0.3,
              }}
            />
          </div>
        ))}
        {/* โซ่เชื่อมการ์ดในกองเป็นทอด ๆ จากกลางการ์ดถึงกลางการ์ด (ข้อสุดท้ายลากต่อเข้าหาการ์ดใหม่) วาดก่อน = อยู่ใต้การ์ด */}
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          {layout.slice(1).map((r, k) => {
            const last = k === layout.length - 2;
            const older = toneOf(sides[k]!);
            const newer = toneOf(sides[k + 1]!);
            return (
              <g key={k} style={last ? undefined : push}>
                <ChainLink
                  id={`cl-${fx.id}-${k}`}
                  from={shrink(layout[k]!, OLD_SCALE)}
                  to={last ? r : shrink(r, OLD_SCALE)}
                  colorFrom={older.ring}
                  colorTo={newer.ring}
                  glow={newer.glow}
                  fresh={last}
                  rich={rich}
                />
              </g>
            );
          })}
        </svg>
        {/* การ์ดที่ต่อมาก่อนหน้า: ย่อ เอียง หรี่ลง */}
        {stack.slice(0, fx.index).map((e, k) => {
          const c = state.cards[e.cardId];
          const r = layout[k]!;
          if (!c) return null;
          const t = toneOf(sides[k]!);
          const self = sides[k] === 'self';
          const linked = k === fx.index - 1;
          return (
            <div key={k} className="absolute" style={{ left: r.x, top: r.y, width: r.w, height: r.h, ...push }}>
              <div className="relative h-full w-full" style={{ transform: `scale(${OLD_SCALE}) rotate(${self ? -4 : 4}deg)` }}>
                <div
                  className="h-full w-full rounded-lg"
                  style={{
                    boxShadow: `0 0 0 2px ${t.ring}, 0 0 18px ${t.glow}, 0 12px 26px rgba(0,0,0,0.75)`,
                    filter: 'brightness(0.82) saturate(0.85)',
                    ...(linked ? { ...pull(r, spot, 12), animation: `fx-cl-recoil 0.42s ${CL_LOCK_AT}s ease-out both` } : {}),
                  }}
                >
                  <CardFace def={db.get(c.cardNo)} />
                </div>
                <ChainBadge n={k + 1} self={self} ring={t.ring} glow={t.glow} />
              </div>
            </div>
          );
        })}
        {/* วงเวท + คลื่นกระแทกตอนล็อก รอบการ์ดใหม่ */}
        <div className="absolute" style={{ left: sc.x, top: sc.y }}>
          <div className="absolute rounded-full" style={{ left: -120 * ms, top: -120 * ms, width: 240 * ms, height: 240 * ms, boxShadow: `0 0 70px 18px ${accent.glow}, inset 0 0 50px ${accent.glow}`, animation: 'fx-cl-pulse 0.9s ease-out both' }} />
          <MagicCircle id={`mc-${fx.id}`} color={accent.ring} glow={accent.glow} spin={rich} scale={ms} />
          {Array.from({ length: 2 + heat }, (_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{ left: -70 * ms, top: -70 * ms, width: 140 * ms, height: 140 * ms, border: `${4 - i}px solid ${accent.ring}`, boxShadow: `0 0 18px ${accent.glow}, inset 0 0 14px ${accent.glow}`, animation: `fx-cl-shock 0.65s ${CL_LOCK_AT + i * 0.09}s cubic-bezier(.1,.7,.3,1) both` }}
            />
          ))}
        </div>
        {/* ป้าย CHAIN n เหนือการ์ดใหม่: เลขพลิกจาก n-1 → n ตอนโซ่ล็อก */}
        <div className="absolute" style={{ left: sc.x, top: spot.y - 22, transform: 'translate(-50%, -100%)' }}>
          <div className="relative flex items-center gap-3 px-9 py-1" style={{ animation: 'fx-cl-panel 0.45s 0.08s cubic-bezier(.2,.9,.3,1.3) both' }}>
            <div
              className="absolute inset-0 -skew-x-12 border-y-2"
              style={{ borderColor: accent.ring, background: 'linear-gradient(90deg, transparent, rgba(2,6,23,0.94) 16%, rgba(2,6,23,0.94) 84%, transparent)', boxShadow: `0 0 26px ${accent.glow}` }}
            />
            <span className={`relative bg-gradient-to-b ${accent.text} bg-clip-text text-2xl font-black tracking-[0.3em] text-transparent italic`}>CHAIN</span>
            <span className="relative inline-block h-[5.5rem]" style={{ width: n >= 10 ? '7.5rem' : '4.5rem', perspective: 400 }}>
              {[n - 1, n].map((v, i) => (
                <span
                  key={v}
                  className={`absolute inset-0 flex items-center justify-center bg-gradient-to-b ${accent.text} bg-clip-text text-[5.5rem] leading-none font-black text-transparent italic`}
                  style={{
                    filter: `drop-shadow(0 3px 0 #0f172a) drop-shadow(0 0 16px ${accent.glow})`,
                    animation: i === 0 ? `fx-cl-flip-out 0.2s ${CL_LOCK_AT - 0.2}s ease-in both` : `fx-cl-flip-in 0.45s ${CL_LOCK_AT}s cubic-bezier(.2,.9,.3,1.4) both`,
                  }}
                >
                  {v}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
      {/* การ์ดใหม่: กรอบเรืองแสง + แสงปาด + สะท้านตอนโซ่ล็อก + ตราเลข Chain */}
      <div ref={ref} data-chain-card className="pointer-events-none fixed z-[45]" style={{ opacity: 0 }}>
        <div
          className="relative h-full w-full rounded-lg"
          style={{ boxShadow: `0 0 0 2px ${tone.ring}, 0 0 34px 10px ${tone.glow}`, ...(prev ? pull(spot, prev, 12) : {}), animation: `fx-cl-recoil 0.42s ${CL_LOCK_AT}s ease-out both` }}
        >
          <CardFace def={db.get(card.cardNo)} />
          <div className="absolute inset-0 overflow-hidden rounded-lg">
            <div className="absolute -inset-y-[20%] left-0 w-2/5" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.8), transparent)', animation: 'fx-cl-sheen 0.75s 0.5s ease-in-out both' }} />
          </div>
        </div>
        <ChainBadge n={n} self={sides[fx.index] === 'self'} ring={tone.ring} glow={tone.glow} style={{ animation: `fx-cl-num 0.45s ${CL_LOCK_AT}s cubic-bezier(.2,.9,.3,1.4) both` }} />
      </div>
    </>
  );
}

/** ตำแหน่งพัดการ์ดที่เปิดจากเด็ค: กลางฝั่งของผู้เปิด */
function fanLayout(owner: string, n: number) {
  const mat = layoutRect(document.querySelector(`[data-mat="${owner}"]`));
  const sidebar = sidebarWidth();
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
  chosenIds,
  chosenLabel,
  chosenLabels,
  onConfirm,
  flatChosen,
}: {
  owner: string;
  cardIds: string[];
  candidates?: string[];
  chosen?: string | null;
  onPick?: (id: string) => void;
  /** ไม่เลือก (ตัวเลือกที่ไม่บังคับ) */
  onSkip?: () => void;
  title: string;
  /** เลือกหลายใบ: ใบที่เลือกแล้ว (ยกขึ้น) แต่ยังคลิกเพื่อยกเลิกได้ */
  chosenIds?: string[];
  /** ป้ายใต้ใบที่เลือก */
  chosenLabel?: string;
  /** ป้ายใต้ใบที่เลือกแยกรายใบ (เช่น ลำดับ 1, 2, 3) */
  chosenLabels?: Record<string, string>;
  /** ปุ่มยืนยันบนแถบชื่อ */
  onConfirm?: { label: string; disabled: boolean; run: () => void };
  /** ใบที่เลือกแล้วไม่ยกขึ้น (เรียงลำดับ: ไม่บังแถบชื่อ/ปุ่มยืนยัน) */
  flatChosen?: boolean;
}) {
  const cards = useGame((s) => s.state.cards);
  const hover = useGame((s) => s.hover);
  const pos = fanLayout(owner, cardIds.length);
  const top = Math.min(...pos.map((p) => p.y)) - 44;
  const cx = pos.length ? (pos[0]!.x + pos[pos.length - 1]!.x + pos[0]!.W) / 2 : 0;
  // จอสลัวเว้นแถบกลางไว้: ปุ่มบนแถบ (ไม่อัญเชิญ / ถัดไป) สว่างเท่ากับการ์ดที่แสดง ไม่จมอยู่ใต้ความมืด
  const bar = layoutRect(document.querySelector('[data-setup="bar"]'));
  return (
    <div className={`${BOARD} z-[39] pointer-events-none`}>
      {bar ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/40" style={{ height: Math.max(0, bar.y) }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/40" style={{ top: bar.y + bar.h }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/40" />
      )}
      <div className="absolute -translate-x-1/2 rounded-full bg-black/75 px-4 py-1 text-sm font-bold text-sky-100 shadow" style={{ left: cx, top }}>
        {title}
        {onSkip && (
          <button type="button" onClick={onSkip} className="pointer-events-auto ml-3 rounded-full bg-slate-200 px-3 py-0.5 text-xs font-black text-slate-900 hover:bg-white">
            ไม่เลือก
          </button>
        )}
        {onConfirm && (
          <button
            type="button"
            disabled={onConfirm.disabled}
            onClick={onConfirm.run}
            className="pointer-events-auto ml-3 rounded-full bg-yellow-300 px-3 py-0.5 text-xs font-black text-slate-900 hover:bg-yellow-200 disabled:opacity-40"
          >
            {onConfirm.label}
          </button>
        )}
      </div>
      {cardIds.map((id, i) => {
        const card = cards[id];
        const p = pos[i]!;
        if (!card) return null;
        const can = !!onPick && !!candidates?.includes(id);
        const isChosen = chosen === id || !!chosenIds?.includes(id);
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
              transform: isChosen && !flatChosen ? 'rotate(0deg) translateY(-36px) scale(1.12)' : `rotate(${p.rot}deg)`,
              filter: dim ? 'brightness(0.45) grayscale(0.5)' : undefined,
              zIndex: isChosen ? 5 : i,
            }}
            onClick={can ? () => onPick!(id) : undefined}
            onMouseEnter={() => hover(id)}
            onMouseLeave={() => hover(null)}
          >
            <div className="h-full w-full" style={{ animation: `fx-chain-in 0.4s ${i * 90}ms cubic-bezier(.2,.9,.3,1.2) both` }}>
            <div
              className={`relative h-full w-full rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.7)] ${can && !isChosen ? 'ring-4 ring-fuchsia-400' : ''} ${isChosen ? 'ring-4 ring-yellow-300' : ''}`}
              style={isChosen ? { boxShadow: '0 0 30px 8px rgba(250,204,21,0.7)' } : can ? { animation: 'fx-choice-glow 1.4s ease-in-out infinite' } : undefined}
            >
              <CardFace def={db.get(card.cardNo)} />
              {dim && <div className="absolute inset-0 rounded-lg bg-slate-950/65" />}
            </div>
            </div>
            {can && !isChosen && <div className="absolute inset-x-2 -bottom-3 rounded bg-fuchsia-500 py-0.5 text-center text-xs font-bold text-white shadow">คลิกเพื่อเลือก</div>}
            {isChosen && <div className="absolute inset-x-2 -bottom-3 rounded bg-yellow-300 py-0.5 text-center text-xs font-black text-slate-900 shadow">{chosenLabels?.[id] ?? chosenLabel ?? 'เลือก ✓ ขึ้นมือ'}</div>}
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

  const sidebar = sidebarWidth();
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
      // ระเบิด: จอสั่น (ครั้งที่ Life หมด = แรงและนานกว่า)
      // ครั้งที่ Life หมด: จอสั่นตอนปล่อยสโลว์ (อยู่ใน FinalBlow)
      if (fx.big && !fx.lethal)
        shakeMain(
          [
            [-10, 6],
            [9, -7],
            [-5, 3],
          ],
          380,
        );
      document.querySelector(`[data-life="${fx.player}"]`)?.animate(
        [{ boxShadow: '0 0 0 0 rgba(244,63,94,0)', filter: 'brightness(1)' }, { boxShadow: '0 0 24px 8px rgba(244,63,94,0.9)', filter: 'brightness(1.6)', offset: 0.3 }, { boxShadow: '0 0 0 0 rgba(244,63,94,0)', filter: 'brightness(1)' }],
        { duration: 900, easing: 'ease-out' },
      );
    }, fx.delay);
    const done = setTimeout(onDone, fx.delay + 1500 + (fx.lethal ? LETHAL_SLOW_EXTRA : 0));
    return () => {
      clearTimeout(t);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!pos) return null;
  // ขนาดระเบิด: โจมตีตรง (big) / ครั้งที่ Life หมด (lethal: ใหญ่เกือบเต็มจอ)
  const boom = fx.lethal ? 72 : fx.big ? 34 : 0;
  return (
    <>
      {/* ครั้งที่ Life หมด: แสงขาวแดงวาบทั้งจอ */}
      {fx.lethal && (
        <div className="pointer-events-none fixed inset-0 z-[44]" style={{ opacity: flashScale() }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, #fff 0%, rgba(254,205,211,0.9) 35%, rgba(190,18,60,0.55) 70%, rgba(127,29,29,0.35) 100%)', animation: 'fx-dmg-flash 0.9s ease-out both' }} />
        </div>
      )}
      <div className="pointer-events-none fixed z-[45]" style={{ left: pos.x, top: pos.y }}>
        {boom > 0 && (
          <>
            {/* ลูกระเบิดขาว → ชมพู → แดง */}
            <div
              className="absolute rounded-full"
              style={{
                width: `${boom * 0.9}rem`,
                height: `${boom * 0.9}rem`,
                translate: '-50% -50%',
                background:
                  'radial-gradient(circle, #fff 0%, #fff 16%, rgba(255,228,230,0.95) 28%, rgba(251,113,133,0.85) 44%, rgba(225,29,72,0.7) 58%, rgba(136,19,55,0.35) 68%, transparent 74%)',
                animation: `fx-dmg-sphere ${fx.lethal ? 1.3 : 0.9}s cubic-bezier(.15,.9,.3,1) both`,
              }}
            />
            {/* วงแหวนแดงขยายออก */}
            {(fx.lethal ? [0, 0.12, 0.24] : [0]).map((d) => (
              <div
                key={d}
                className="absolute rounded-full border-[6px] border-rose-500/90"
                style={{
                  width: `${boom * 0.8}rem`,
                  height: `${boom * 0.8}rem`,
                  translate: '-50% -50%',
                  boxShadow: '0 0 30px rgba(244,63,94,0.9), inset 0 0 30px rgba(255,255,255,0.6)',
                  animation: `fx-dmg-ring ${fx.lethal ? 1.1 : 0.8}s ${d}s ease-out both`,
                }}
              />
            ))}
            {/* เส้นแสงพุ่งออกรอบด้าน */}
            <div
              className="absolute rounded-full"
              style={{
                // fx-sunburst จัดกึ่งกลางด้วย transform ในคีย์เฟรมเอง (ไม่ต้องใส่ translate ซ้ำ)
                width: `${boom}rem`,
                height: `${boom}rem`,
                background: 'repeating-conic-gradient(from 0deg, rgba(254,226,226,0.95) 0deg 2.5deg, rgba(225,29,72,0.8) 2.5deg 6deg, transparent 6deg 13deg)',
                maskImage: 'radial-gradient(circle, transparent 12%, black 22%, transparent 62%)',
                WebkitMaskImage: 'radial-gradient(circle, transparent 12%, black 22%, transparent 62%)',
                animation: `fx-sunburst ${fx.lethal ? 1.4 : 1}s ease-out both`,
              }}
            />
          </>
        )}
        <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ animation: 'fx-damage 1.5s cubic-bezier(.2,.9,.3,1) both' }}>
          <div
            className={`${fx.lethal ? 'text-[150px]' : 'text-[110px]'} leading-none font-black text-rose-500 italic [-webkit-text-stroke:4px_#fff] [text-shadow:0_6px_0_#7f1d1d,0_0_30px_rgba(0,0,0,0.8)]`}
          >
            −{fx.amount}
          </div>
          <div className="-mt-2 text-2xl font-black tracking-[0.3em] text-white [text-shadow:0_2px_0_#7f1d1d]">LIFE</div>
        </div>
      </div>
    </>
  );
}

/** แปลงสี hex เป็น [r,g,b] */
const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * ภาพเส้นควัน 1 เส้น (สร้างครั้งเดียวต่อสี): ริ้วยาวตามแนวนอนหลายเส้นซ้อนกัน เบลอเล็กน้อย
 * แกนกลางเข้มทึบ ขอบเป็นสีการ์ดสว่างขึ้นนิดหน่อย → วาดหมุนตามทิศที่พุ่ง ได้สายควันที่มีลายตามแนวพุ่ง
 */
const streakCache = new Map<string, HTMLCanvasElement[]>();
function streakSprites(hex: string): HTMLCanvasElement[] {
  const hit = streakCache.get(hex);
  if (hit) return hit;
  const [r, g, b] = rgbOf(hex);
  const mix = (t: number, to: number) => [Math.round(r + (to - r) * t), Math.round(g + (to - g) * t), Math.round(b + (to - b) * t)];
  const deep = mix(0.7, 0);
  const dark = mix(0.45, 0);
  const base = [r, g, b];
  const rim = mix(0.12, 255);
  const out = Array.from({ length: 5 }, (_, k) => {
    const W = 192;
    const H = 64;
    let seed = (k + 1) * 7919;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const raw = document.createElement('canvas');
    raw.width = W;
    raw.height = H;
    const rc = raw.getContext('2d')!;
    const streak = (c: number[], al: number, spread: number, thick: number) => {
      const y = H / 2 + (rnd() + rnd() - 1) * H * spread;
      const x = W * (0.25 + rnd() * 0.5);
      const rx = W * (0.15 + rnd() * 0.3);
      const ry = H * thick * (0.5 + rnd());
      rc.save();
      rc.translate(x, y);
      rc.scale(1, ry / rx);
      const grd = rc.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${al})`);
      grd.addColorStop(0.6, `rgba(${c[0]},${c[1]},${c[2]},${al * 0.5})`);
      grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      rc.fillStyle = grd;
      rc.beginPath();
      rc.arc(0, 0, rx, 0, Math.PI * 2);
      rc.fill();
      rc.restore();
    };
    // ขอบสว่าง (กว้าง จาง) → ตัวควันสีการ์ด → แกนเข้มทึบตรงกลาง
    for (let i = 0; i < 6; i++) streak(rim, 0.16 + rnd() * 0.12, 0.32, 0.1);
    for (let i = 0; i < 14; i++) streak(base, 0.3 + rnd() * 0.25, 0.26, 0.08);
    for (let i = 0; i < 20; i++) streak(dark, 0.45 + rnd() * 0.3, 0.18, 0.07);
    for (let i = 0; i < 14; i++) streak(deep, 0.5 + rnd() * 0.3, 0.1, 0.05);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.filter = 'blur(2px)';
    ctx.drawImage(raw, 0, 0);
    ctx.filter = 'none';
    // ขอบจางเป็นวงรี (ไม่มีขอบตัดของภาพ)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, H / W);
    const mask = ctx.createRadialGradient(0, 0, W * 0.2, 0, 0, W / 2);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(-W / 2, -W / 2, W, W);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    return c;
  });
  streakCache.set(hex, out);
  return out;
}

/**
 * หางควันตามการ์ดที่พุ่ง (canvas): ทุกเฟรมปล่อยเส้นควันตลอดทางที่การ์ดผ่าน หมุนตามทิศที่พุ่ง
 * ใกล้การ์ดหนาทึบ ยิ่งเก่ายิ่งเรียวและจาง → ได้สายควันข้นที่เรียวไปทางท้าย · มีเส้นควันบาง ๆ แตกออกที่ขอบ
 * สีตามสีการ์ด · กราฟิกต่ำ = เส้นน้อยลง
 */
function SmokeTrail({ follow, hex, from, until, size }: { follow: React.RefObject<HTMLDivElement | null>; hex: string; from: number; until: number; size: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvas.current;
    const cv2 = frontCanvas.current;
    const ctx = cv?.getContext('2d');
    const ctx2 = cv2?.getContext('2d');
    if (!cv || !ctx || !cv2 || !ctx2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sprites = streakSprites(hex);
    const full = effects().blur;
    /**
     * helix = ควันสองเส้นพันกันเป็นเกลียวตามทางที่พุ่ง (ยิ่งเก่า เกลียวยิ่งแคบ → หางเรียวลง)
     * wrap = ควันชั้นหน้าที่ห่อตัวการ์ด: เกาะไปกับการ์ด ไหลจากหัวไปท้ายพร้อมวนเป็นเกลียวรอบตัวการ์ด
     */
    type P = {
      kind: 'helix' | 'wrap';
      x: number;
      y: number;
      nx: number;
      ny: number;
      lat: number;
      slope: number;
      ang: number;
      born: number;
      life: number;
      len: number;
      thick: number;
      a: number;
      img: HTMLCanvasElement;
      phase: number;
    };
    const parts: P[] = [];
    const t0 = performance.now();
    let raf = 0;
    let prev: [number, number] | null = null;
    /** ระยะทางที่พุ่งไปแล้ว (ใช้หมุนเกลียวตามระยะ) */
    let travelled = 0;
    /** ตำแหน่ง/ทิศของการ์ดล่าสุด: ควันชั้นหน้าเกาะไปกับการ์ด */
    let head = { x: 0, y: 0, ux: 0, uy: -1, w: 0 };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = () => sprites[(Math.random() * sprites.length) | 0]!;
    /** รอบเกลียว: ระยะทางต่อ 1 รอบ (เท่าความกว้างการ์ด × PERIOD) และความกว้างเกลียว */
    const PERIOD = 1.5;
    const AMP = 0.3;
    const step = (now: number) => {
      const box = cv.getBoundingClientRect();
      if (cv.width !== Math.round(box.width * dpr)) {
        cv.width = Math.round(box.width * dpr);
        cv.height = Math.round(box.height * dpr);
        cv2.width = cv.width;
        cv2.height = cv.height;
      }
      // ตำแหน่งจริงของการ์ด → พิกัดบน canvas (รองรับหน้าเว็บที่ถูกย่อทั้งหน้า)
      const k = cv.width / (box.width || 1);
      const el = follow.current;
      const elapsed = now - t0;
      if (el && elapsed >= from && elapsed <= until) {
        const r = el.getBoundingClientRect();
        const cx = (r.left + r.width / 2 - box.left) * k;
        const cy = (r.top + r.height / 2 - box.top) * k;
        const w = size * k;
        const [px, py] = prev ?? [cx, cy];
        const dx = cx - px;
        const dy = cy - py;
        const dist = Math.hypot(dx, dy);
        // ปล่อยเฉพาะตอนพุ่งจริง (เร็ว) · ช่วงถอยตั้งหลัก/หมุนตั้งตรงขยับช้า = ไม่ปล่อยควัน
        if (dist > w * 0.06) {
          const ux = dx / dist;
          const uy = dy / dist;
          const ang = Math.atan2(uy, ux);
          head = { x: cx, y: cy, ux, uy, w };
          const n = Math.min(full ? 16 : 5, Math.max(1, Math.round(dist / (w * (full ? 0.06 : 0.2)))));
          for (let i = 0; i < n; i++) {
            const f = (i + Math.random()) / n;
            const bx = px + dx * f;
            const by = py + dy * f;
            const born = now - (1 - f) * 16;
            const at = travelled + dist * f;
            // เกลียวเล็กที่ต้นทาง (ท้ายหาง) แล้วค่อย ๆ กว้างขึ้นจนเท่าตัวการ์ด → มองจากการ์ดลงไป เกลียวเล็กลงเรื่อย ๆ
            const grow = Math.min(1, at / (w * 3.5));
            const amp = AMP * (0.2 + 0.8 * grow);
            // รอบถี่ขึ้นเมื่อเกลียวแคบ (เหมือนน้ำวน)
            const theta = (at / (w * PERIOD)) * Math.PI * 2 * (1.35 - 0.35 * grow);
            // เกลียวสองเส้น (ห่างกันครึ่งรอบ) · ด้านที่หันเข้าหาจอ (cos > 0) ทึบกว่า · สุ่มเหลื่อมเล็กน้อยให้ขอบไม่เรียบ
            for (const off of [0, Math.PI]) {
              const th = theta + off + rand(-0.25, 0.25);
              parts.push({
                kind: 'helix',
                x: bx,
                y: by,
                nx: -uy,
                ny: ux,
                lat: (Math.sin(th) * amp + rand(-0.06, 0.06)) * w,
                slope: Math.atan(Math.cos(th) * amp * ((Math.PI * 2) / PERIOD)) + rand(-0.15, 0.15),
                ang,
                born,
                life: rand(560, 820),
                len: w * rand(0.85, 1.15) * (0.6 + 0.4 * grow),
                thick: w * rand(0.6, 0.85) * (0.55 + 0.45 * grow),
                a: (0.5 + 0.5 * ((Math.cos(th) + 1) / 2)) * rand(0.8, 1),
                img: pick(),
                phase: 0,
              });
            }
          }
          // ชั้นหน้า: ควันห่อทั้งตัวการ์ด วนเป็นเกลียวรอบการ์ด (ต่อเนื่องกับเกลียวของหาง)
          const m = full ? 7 : 3;
          for (let i = 0; i < m; i++) {
            parts.push({ kind: 'wrap', x: 0, y: 0, nx: 0, ny: 0, lat: 0, slope: 0, ang: 0, born: now, life: rand(320, 480), len: w * rand(0.85, 1.25), thick: w * rand(0.45, 0.7), a: rand(0.7, 0.95), img: pick(), phase: Math.random() * Math.PI * 2 });
          }
          travelled += dist;
        }
        prev = [cx, cy];
      } else prev = null;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx2.clearRect(0, 0, cv2.width, cv2.height);
      // วาดเก่าก่อน ใหม่ทับ → ส่วนที่อยู่ใกล้การ์ดทึบสุด
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        const u = (now - p.born) / p.life;
        if (u >= 1) {
          parts.splice(i--, 1);
          continue;
        }
        const c = p.kind === 'wrap' ? ctx2 : ctx;
        c.save();
        c.globalAlpha = p.a * (u < 0.06 ? u / 0.06 : Math.pow(1 - (u - 0.06) / 0.94, 1.3));
        let thick = p.thick * (1 - 0.6 * u);
        const len = p.len * (1 + 0.3 * u);
        if (p.kind === 'wrap') {
          // พิกัดตามตัวการ์ด: ไหลจากหัว (+0.8) ไปท้าย (-1.0) × ความกว้างการ์ด · ด้านข้างวนเป็นเกลียว
          const hw = head.w;
          const th = p.phase + u * Math.PI * 2;
          const along = (0.8 - 1.8 * u) * hw;
          const lat = Math.sin(th) * hw * 0.38;
          c.translate(head.x + head.ux * along - head.uy * lat, head.y + head.uy * along + head.ux * lat);
          c.rotate(Math.atan2(head.uy, head.ux) + Math.atan(Math.cos(th) * 1.6));
          c.globalAlpha *= 0.6 + 0.4 * ((Math.cos(th) + 1) / 2);
        } else {
          // เกลียวแคบลงตามอายุ (ส่วนท้ายของหางเล็กลง) + ลอยถอยหลังเล็กน้อย
          const shrink = 1 - 0.75 * u;
          const back = (now - p.born) * 0.015 * k;
          const lat = p.lat * shrink;
          c.translate(p.x + p.nx * lat - p.ny * back, p.y + p.ny * lat + p.nx * back);
          c.rotate(p.ang + p.slope * shrink);
          if (p.kind === 'helix') thick *= 0.7 + 0.3 * shrink;
        }
        c.drawImage(p.img, -len / 2, -thick / 2, len, thick);
        c.restore();
      }
      if (parts.length > 0 || elapsed < until) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ชั้นหลังอยู่ใต้การ์ด (z 41) · ชั้นหน้าอยู่เหนือการ์ด (z 42) แต่ใต้แสงกระแทก (z 43)
  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[41] h-full w-full" />
      <canvas ref={frontCanvas} className="pointer-events-none fixed inset-0 z-[42] h-full w-full" />
    </>
  );
}

const HIT_AT = CHARGE_HIT; // สัดส่วนเวลาที่ชนเป้าหมาย (ค่าเดียวกับ store)

/**
 * ผู้โจมตีวิ่งชนเป้าหมาย: ลุกตั้งตรง → ถอยตั้งหลัก → พุ่งชน (จอสั่น + แสงกระแทก) → วิ่งกลับ / แตกสลายตรงจุดชน
 * ใช้การ์ดโคลนลอยเหนือกระดาน เพราะแผ่นรองเล่นตัดสิ่งที่ล้นขอบ การ์ดจริงถูกซ่อนระหว่างนี้
 */
function Charge({ fx, onDone }: { fx: Extract<Fx, { kind: 'charge' }>; onDone: () => void }) {
  const [{ card, onBoard }] = useState(() => {
    const st = useGame.getState().state;
    const c = st.cards[fx.cardId];
    return { card: c, onBoard: !!c && st.players[c.owner].field.includes(fx.cardId) };
  });
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
    const rot = fx.fromExhausted || fx.startLying ? 'rotate(90deg)' : 'rotate(0deg)';
    const rotEnd = fx.toExhausted ? 'rotate(90deg)' : 'rotate(0deg)';
    // แพ้: ถูกกระแทกกระเด็นกลับ (ตามสัดส่วน CHARGE_KNOCK: 0 = ถึงช่องเดิม) เซ แล้วหยุดตั้งตรงตรงนั้น ภาพร้าว/แตกเล่นต่อที่จุดนี้
    const K = CHARGE_KNOCK;
    const end: Keyframe[] = fx.dies
      ? [
          { transform: `translate(${hx * (K + 0.12)}px,${hy * (K + 0.12)}px) rotate(-14deg) scale(1.08)`, filter: 'brightness(2.4) saturate(0.6)', offset: 0.6 },
          { transform: `translate(${hx * (K - 0.04)}px,${hy * (K - 0.04)}px) rotate(7deg) scale(1.02)`, filter: 'brightness(1.4) saturate(0.4)', offset: 0.76 },
          { transform: `translate(${hx * K}px,${hy * K}px) rotate(-2deg) scale(1)`, filter: 'brightness(1.1) saturate(0.3)', offset: 0.88 },
          { transform: `translate(${hx * K}px,${hy * K}px) rotate(0deg) scale(1)`, filter: 'brightness(1) saturate(0.3)' },
        ]
      : [
          { transform: `translate(${hx * 0.9}px,${hy * 0.9}px) rotate(0deg) scale(1.08)`, offset: 0.58 },
          { transform: `translate(0,0) ${rotEnd} scale(1)` },
        ];
    const anim = el.animate(
      // ทึบตลอดทาง: ตัวการ์ดตั้ง opacity 0 ไว้ (ซ่อนก่อนถึงคิว) ถ้าคีย์เฟรมท้าย ๆ ไม่ระบุ
      // เบราว์เซอร์จะไล่ความทึบกลับไปหา 0 ทำให้การ์ดจางลงตอนวิ่งกลับ
      [
        { transform: `translate(0,0) ${rot} scale(1)` },
        { transform: `translate(${-hx * 0.08}px,${-hy * 0.08}px) rotate(0deg) scale(1.12)`, offset: 0.2 },
        { transform: `translate(${hx}px,${hy}px) rotate(0deg) scale(1.18)`, offset: HIT_AT, easing: 'ease-out' },
        ...end,
      ].map((k) => ({ ...k, opacity: 1 })),
      // ผู้โจมตีที่ยังอยู่บนสนาม: ก่อนถึงคิวแสดงการ์ดตัวจริง (มี Core / BP / Brave) แล้วค่อยสลับเป็นภาพที่วิ่ง
      // ผู้โจมตีที่แพ้ (ออกจากสนามแล้ว): ภาพนี้ยืนแทนที่ช่องเดิมไปจนวิ่ง
      { duration: CHARGE_MS, delay: fx.delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: onBoard ? 'forwards' : 'both' },
    );
    const real = onBoard ? document.querySelector<HTMLElement>(`[data-field-card="${fx.cardId}"]`) : null;
    const swap = setTimeout(() => real && (real.style.visibility = 'hidden'), fx.delay);
    const hit = setTimeout(() => {
      setImpact({ x: cx + hx, y: cy + hy });
      // จอสั่น + เป้าหมายสั่น
      shakeMain(
        [
          [-8, 4],
          [7, -5],
          [-4, 3],
        ],
        320,
      );
      if (typeof fx.target === 'string') {
        document.querySelector(fx.target)?.animate([{ filter: 'brightness(2.5)' }, { filter: 'brightness(1)' }], { duration: 400 });
      }
    }, fx.delay + CHARGE_MS * HIT_AT);
    anim.onfinish = () => {
      if (real) real.style.visibility = '';
      onDone();
    };
    return () => {
      clearTimeout(hit);
      clearTimeout(swap);
      if (real) real.style.visibility = '';
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={ref}
        className="pointer-events-none fixed z-[42] rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
        style={{ left: cx - cardW / 2, top: cy - cardH / 2, width: cardW, height: cardH, ...(onBoard ? { opacity: 0 } : {}) }}
      >
        <Upside on={upsideFor(card?.owner)}>
          <div className="relative h-full w-full">
            <CardFace def={db.get(fx.cardNo)} />
            {/* Brave ที่ร่วมร่าง วิ่งไปพร้อมผู้ร่วมร่าง */}
            {(card?.braves ?? []).map((b, bi, all) => (
              <div
                key={b}
                className={`absolute h-[4.6rem] w-[3.3rem] rounded shadow-[0_4px_10px_rgba(0,0,0,0.7)] ring-2 ring-emerald-300 ${braveSlot(bi, all.length).right ? '-right-8 rotate-12' : '-left-8 -rotate-12'}`}
                style={{ top: braveSlot(bi, all.length).top }}
              >
                <CardFace def={db.get(useGame.getState().state.cards[b]!.cardNo)} size="xs" />
              </div>
            ))}
          </div>
        </Upside>
      </div>
      {/* หางควันสีตามการ์ด: ปล่อยตั้งแต่เริ่มพุ่ง (หลังถอยตั้งหลัก) จนชนเป้าหมาย · วางหลังการ์ดใน DOM: ชั้นหน้า (z 42 เท่าการ์ด) จึงทับการ์ด */}
      <SmokeTrail
        follow={ref}
        hex={COLOR_HEX[db.get(fx.cardNo).colors[0] ?? 'red'] ?? '#a855f7'}
        from={fx.delay + CHARGE_MS * 0.2}
        until={fx.delay + CHARGE_MS * (HIT_AT + 0.04)}
        size={cardW}
      />
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
  /**
   * เวลาเริ่มของแอนิเมชันนี้ (ก่อนถึงเวลา การ์ดค้างอยู่ที่เดิม)
   * hiddenUntilStart: แสดงตอนถึงเวลาแล้ว = เริ่มทันที (เดิมนับ delay ซ้ำสองรอบ ผู้โจมตีที่แพ้เลยหายไปก่อนจะร้าว/แตก)
   */
  const D = fx.hiddenUntilStart ? 0 : fx.delay;
  if (!shown) return null;
  return (
    <div data-ghost-card={fx.cardId} className="pointer-events-none fixed z-[41]" style={{ left: fx.rect.x, top: fx.rect.y, width: fx.rect.w, height: fx.rect.h, ...vars }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative shrink-0"
          style={{
            width: cardW,
            height: cardH,
            transform: `${lying ? 'rotate(90deg)' : ''} ${!fx.upright && upsideFor(fx.owner) ? 'rotate(180deg)' : ''}`.trim() || undefined,
            // ฟื้นสภาพก่อนถูกทำลาย: ลุกจากท่านอนขึ้นตั้งตรง แล้วค่อยร้าว/แตก
            ...(lying && fx.refreshAt !== undefined
              ? { ['--fx-lie' as string]: upsideFor(fx.owner) && !fx.upright ? 'rotate(270deg)' : 'rotate(90deg)', ['--fx-up' as string]: upsideFor(fx.owner) && !fx.upright ? 'rotate(180deg)' : 'rotate(0deg)', animation: `ghost-refresh 380ms ${fx.refreshAt}ms cubic-bezier(.3,.7,.3,1) both` }
              : {}),
          }}
        >
          {destroy ? (
            <>
              {/* การ์ดสั่น + รอยร้าว แล้วหายไปตอนแตก */}
              <div className="absolute inset-0" style={{ animation: `fx-g-crack-card ${GHOST_MS.destroyBreak}ms ${D}ms linear both` }}>
                <CardFace def={def} />
                {/* สีแดง + รอยร้าว: เริ่มตอนถึงคิวแตกเท่านั้น (ก่อนหน้านั้นการ์ดดูปกติ เช่น ระหว่างรอการ์ดต้นเหตุเรืองแสง) */}
                <div className="absolute inset-0" style={{ opacity: 0, animation: `ci-fade-in 120ms ${D}ms ease-out forwards` }}>
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

/**
 * การ์ดถูกทิ้งจากเด็ค: บินจากเด็คมาเรียงหงายกลางสนามของเจ้าของเด็คทีละใบ → ค้างให้อ่าน → แตกทีละใบเป็นดวงวิญญาณลง Trash
 */
function MillFx({ fx, onDone }: { fx: Extract<Fx, { kind: 'mill' }>; onDone: () => void }) {
  const n = fx.cardIds.length;
  useAutoDismiss(onDone, fx.delay + millDuration(n));
  // ตำแหน่งการ์ดแต่ละใบ: แถวเดียวกลางสนามของเจ้าของเด็ค (ใบเยอะ = ซ้อนกันมากขึ้น)
  const [slots] = useState<Rect[]>(() => {
    // กลางจอ
    const w = 110;
    const h = 154;
    const maxW = Math.min(window.innerWidth * 0.7, 1100);
    const gap = n > 1 ? Math.min(w + 14, (maxW - w) / (n - 1)) : 0;
    const left = window.innerWidth / 2 - (w + gap * (n - 1)) / 2;
    const top = window.innerHeight / 2 - h / 2;
    return fx.cardIds.map((_, i) => ({ x: left + gap * i, y: top, w, h }));
  });
  const [broken, setBroken] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
    const deck = rectOf(document.querySelector(`[data-deck="${fx.owner}"]`));
    const anims = refs.current.map((el, i) => {
      if (!el) return null;
      const s = slots[i]!;
      // ทิ้งจากมือ: ออกจากตำแหน่งการ์ดใบนั้นในมือ
      const src = fx.fromHand ? (fx.fromHand[fx.cardIds[i]!] ?? deck) : deck;
      const dx = src ? src.x + src.w / 2 - (s.x + s.w / 2) : 0;
      const dy = src ? src.y + src.h / 2 - (s.y + s.h / 2) : 0;
      return el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.45) rotateY(180deg)`, opacity: 0 },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 40}px) scale(0.9) rotateY(90deg)`, opacity: 1, offset: 0.45 },
          { transform: 'translate(0, 0) scale(1) rotateY(0deg)', opacity: 1 },
        ],
        { duration: MILL_MS.fly, delay: fx.delay + i * MILL_MS.show, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' },
      );
    });
    const timers = fx.cardIds.map((_, i) => setTimeout(() => setBroken(i + 1), fx.delay + millBreakAt(n, i)));
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a?.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cards = useGame((s) => s.state.cards);
  const s0 = slots[0];
  return (
    <>
      {fx.title && s0 && broken === 0 && (
        <div
          className="pointer-events-none fixed z-[42] -translate-x-1/2 rounded-full bg-slate-950/85 px-4 py-1 text-sm font-bold text-rose-200 ring-1 ring-rose-400/50"
          style={{ left: s0.x + (slots.at(-1)!.x + s0.w - s0.x) / 2, top: s0.y - 38, animation: `fx-chain-pop 0.35s ${fx.delay}ms ease-out both` }}
        >
          {fx.title}
        </div>
      )}
      {fx.cardIds.map((id, i) => {
        const s = slots[i]!;
        const card = cards[id];
        if (!card) return null;
        if (i < broken) {
          return (
            <Ghost
              key={id}
              fx={{ id: -1 - i, kind: 'ghost', cardId: id, owner: fx.owner, slot: -1, cardNo: card.cardNo, rect: s, mode: 'destroy', delay: 0, upright: true }}
              onDone={() => {}}
            />
          );
        }
        return (
          <div
            key={id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="pointer-events-none fixed z-[41] rounded-lg shadow-[0_10px_24px_rgba(0,0,0,0.7)]"
            style={{ left: s.x, top: s.y, width: s.w, height: s.h, zIndex: 41 + i, perspective: 800 }}
          >
            {/* ตั้งตรงเสมอ ให้อ่านง่ายว่าทิ้งอะไรไปบ้าง */}
            <CardFace def={db.get(card.cardNo)} />
          </div>
        );
      })}
    </>
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
        : // ยังไม่ได้ตัดสินว่าจะป้องกันหรือรับด้วย Life: ชี้ไปกลางสนามคู่แข่ง (ไม่ชี้ไปที่ Life ก่อน)
          [centerOf(`[data-mat="${opponentOf(turnPlayer)}"]`)];
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
    <svg data-attack-arrow className="pointer-events-none fixed inset-0 z-30 h-full w-full" style={{ filter: `drop-shadow(0 0 8px ${color})` }}>
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
