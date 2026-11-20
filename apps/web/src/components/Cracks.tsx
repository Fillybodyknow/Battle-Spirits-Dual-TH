/**
 * สนามเป็นแผ่นหิน: เสีย Life 1 ดวง = หินแตกเพิ่ม 1 แนว (แตกตอนตัวเลขดาเมจขึ้น)
 * รอยแตกเดิมค่อย ๆ แยกกว้างขึ้นทุกครั้งที่เสีย Life (เห็นเหวมืดข้างใต้ ขอบหินรับแสง/เงา เศษหินตกในร่อง)
 * Life เหลือไม่ถึง 2 = ก้นเหวเรืองแดงเต้นเป็นจังหวะ · ได้ Life คืน = รอยแตกหุบกลับ
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerId } from '@bs/engine';
import { useGame } from '../store';
import { useShownLife } from './useHeld';

const W = 1000;
const H = 420;

/** สุ่มแบบมี seed (ภาพเดิมทุกครั้งที่เปิด) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const f1 = (n: number) => n.toFixed(1);
const line = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}`;

interface Fault {
  /** จุดกระแทก */
  x: number;
  y: number;
  /** แนวแตกหลัก (จากปลายหนึ่ง ผ่านจุดกระแทก ไปอีกปลาย) */
  pts: Pt[];
  /** ความกว้างสัมพัทธ์ตามแนว (0 ที่ปลาย → 1 กลาง) */
  taper: number[];
  /** ความกว้างสูงสุดเมื่อแยกเต็มที่ */
  maxW: number;
  /** รอยร้าวเส้นผมแตกออกด้านข้าง (ไม่แยกกว้าง) */
  hairs: Pt[][];
  /** เศษหินในร่อง: ตำแหน่งตามแนว, เยื้องข้าง, ขนาด, มุม */
  rubble: { s: number; off: number; size: number; rot: number }[];
}

/** แนวแตกหนึ่งแนว: เดินหยักออกสองทางจากจุดกระแทกจนเลยขอบหรือครบความยาว */
function makeFault(seed: number, x: number, y: number, ang: number): Fault {
  const r = rng(seed);
  const walk = (dir: number, len: number): Pt[] => {
    const out: Pt[] = [];
    let a = dir;
    let px = x;
    let py = y;
    for (let d = 0; d < len; ) {
      a += (r() - 0.5) * 0.7;
      // ดึงกลับเข้าแนวเดิม ไม่ให้วกวน
      a += (dir - a) * 0.25;
      const step = 22 + r() * 26;
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
      d += step;
      out.push([px, py]);
      if (px < -30 || px > W + 30 || py < -30 || py > H + 30) break;
    }
    return out;
  };
  const a1 = walk(ang, 260 + r() * 320);
  const a2 = walk(ang + Math.PI, 220 + r() * 280);
  const pts: Pt[] = [...a2.reverse(), [x, y], ...a1];
  const n = pts.length;
  const centerIdx = a2.length;
  // กว้างสุดที่จุดกระแทก แคบลงถึงปลาย (ปลายที่เลยขอบสนามยังกว้างอยู่บ้าง)
  const taper = pts.map(([px, py], i) => {
    const t = i <= centerIdx ? i / Math.max(1, centerIdx) : (n - 1 - i) / Math.max(1, n - 1 - centerIdx);
    const out = px < 0 || px > W || py < 0 || py > H;
    return Math.max(out ? 0.35 : 0, Math.pow(t, 0.55)) * (0.75 + r() * 0.5);
  });
  taper[centerIdx] = 1.15;
  // รอยร้าวเส้นผม 3–5 เส้นแตกออกจากแนวหลัก
  const hairs: Pt[][] = [];
  const hn = 3 + Math.floor(r() * 3);
  for (let h = 0; h < hn; h++) {
    const i = 1 + Math.floor(r() * (n - 2));
    const [bx, by] = pts[i]!;
    const [cx, cy] = pts[Math.min(n - 1, i + 1)]!;
    let a = Math.atan2(cy - by, cx - bx) + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.7);
    const hp: Pt[] = [[bx, by]];
    let px = bx;
    let py = by;
    const steps = 2 + Math.floor(r() * 3);
    for (let k = 0; k < steps; k++) {
      a += (r() - 0.5) * 0.8;
      const step = 14 + r() * 22;
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
      hp.push([px, py]);
    }
    hairs.push(hp);
  }
  const rubble = Array.from({ length: 5 + Math.floor(r() * 4) }, () => ({ s: 0.15 + r() * 0.7, off: (r() - 0.5) * 0.6, size: 0.35 + r() * 0.45, rot: r() * 360 }));
  return { x, y, pts, taper, maxW: 13 + r() * 6, hairs, rubble };
}

/** จุดกระแทก + ทิศแนวแตก (เรียงตาม Life ที่เสีย) */
const SPOTS: [number, number, number][] = [
  [540, 210, 0.35],
  [280, 140, -0.9],
  [790, 290, 0.95],
  [200, 330, 0.15],
  [700, 100, -0.3],
  [450, 350, -1.25],
  [900, 150, 1.4],
  [120, 170, 0.6],
];

/** ความกว้างร่อง (สัดส่วนของ maxW) ของแนวที่ i เมื่อเสีย Life ไป lost ดวง: แนวเก่ายิ่งแยกกว้าง */
function spread(i: number, lost: number): number {
  if (i >= lost) return 0;
  const age = lost - i - 1;
  return Math.min(1, 0.16 + age * 0.2 + lost * 0.05);
}

/** ค่อย ๆ เปลี่ยนความกว้างร่องไปหาเป้าหมาย (หินค่อย ๆ แยก) */
function useTween(targets: number[], ms: number): number[] {
  const [cur, setCur] = useState(targets);
  const from = useRef(targets);
  const key = targets.join(',');
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = targets.map((b, i) => (a[i] ?? 0) + (b - (a[i] ?? 0)) * e);
      from.current = v;
      setCur(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return cur;
}

/** ร่องแตกที่ความกว้าง w: รูปเหว + ขอบสองฝั่ง */
function gap(f: Fault, w: number) {
  const L: Pt[] = [];
  const R: Pt[] = [];
  const n = f.pts.length;
  f.pts.forEach(([x, y], i) => {
    const [nx, ny] = f.pts[Math.min(i + 1, n - 1)]!;
    const [bx, by] = f.pts[Math.max(i - 1, 0)]!;
    const dx = nx - bx;
    const dy = ny - by;
    const d = Math.hypot(dx, dy) || 1;
    const half = (w * f.taper[i]!) / 2;
    L.push([x - (dy / d) * half, y + (dx / d) * half]);
    R.push([x + (dy / d) * half, y - (dx / d) * half]);
  });
  return { L, R, shape: `${line(L)}L${[...R].reverse().map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z` };
}

/** จุดบนแนวที่ตำแหน่ง s (0–1) + เวกเตอร์ตั้งฉาก */
function along(f: Fault, s: number): { p: Pt; nrm: Pt; taper: number } {
  const n = f.pts.length;
  const i = Math.min(n - 2, Math.floor(s * (n - 1)));
  const [ax, ay] = f.pts[i]!;
  const [bx, by] = f.pts[i + 1]!;
  const d = Math.hypot(bx - ax, by - ay) || 1;
  const t = s * (n - 1) - i;
  return { p: [ax + (bx - ax) * t, ay + (by - ay) * t], nrm: [-(by - ay) / d, (bx - ax) / d], taper: f.taper[i]! };
}

export function FieldCracks({ player, top }: { player: PlayerId; top?: boolean }) {
  const initial = useGame((s) => s.state.config.initialLife);
  const life = useShownLife(player);
  const lost = Math.max(0, Math.min(SPOTS.length, initial - life));
  const pinch = life < 2;
  const faults = useMemo(() => SPOTS.map(([x, y, a], i) => makeFault((player === 'p1' ? 101 : 211) + i * 977, x, y, a)), [player]);
  const widths = useTween(
    faults.map((_, i) => spread(i, lost)),
    900,
  );
  // แนวที่เพิ่งแตก (ไม่นับที่มีอยู่แล้วตอนเปิดหน้า): แสงวาบ + สนามสั่น
  const seen = useRef(lost);
  const svgRef = useRef<SVGSVGElement>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  useEffect(() => {
    if (lost > seen.current) {
      setFresh(lost - 1);
      svgRef.current?.closest('[data-mat]')?.animate(
        [{ translate: '0 0' }, { translate: '-6px 3px' }, { translate: '5px -3px' }, { translate: '-3px 2px' }, { translate: '2px -1px' }, { translate: '0 0' }],
        { duration: 380, easing: 'ease-out' },
      );
      const t = setTimeout(() => setFresh(null), 800);
      seen.current = lost;
      return () => clearTimeout(t);
    }
    seen.current = lost;
  }, [lost]);

  if (lost === 0 && widths.every((w) => w < 0.01)) return null;
  const glow = pinch ? '#f43f5e' : top ? '#be185d' : '#0284c7';
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 z-[-5] h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`crack-flash-${player}`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor={pinch ? '#f43f5e' : '#94a3b8'} stopOpacity="0" />
        </radialGradient>
        {/* หินเศษ: ผิวขรุขระ */}
        <filter id={`crack-rough-${player}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={player === 'p1' ? 3 : 7} />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>
      {faults.map((f, i) => {
        const s = widths[i]!;
        if (s < 0.01) return null;
        const w = s * f.maxW;
        const g = gap(f, w);
        const isFresh = fresh === i;
        return (
          <g key={i}>
            {isFresh && (
              <circle
                cx={f.x}
                cy={f.y}
                r={120}
                fill={`url(#crack-flash-${player})`}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', opacity: 0, animation: 'crack-flash 0.7s ease-out forwards' }}
              />
            )}
            {/* รอยร้าวเส้นผมรอบแนวแตก */}
            {f.hairs.map((h, j) => (
              <g key={j} opacity={Math.min(1, s * 3)}>
                <path d={line(h)} fill="none" stroke="rgba(2,6,23,0.75)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                <path d={line(h.map(([x, y]) => [x + 0.8, y + 0.8] as Pt))} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.6} strokeLinecap="round" />
              </g>
            ))}
            {/* เหว: มืดสนิท ก้นเหวเรืองจาง ๆ */}
            <path d={g.shape} fill="#020409" filter={`url(#crack-rough-${player})`} />
            <path
              d={line(f.pts)}
              fill="none"
              stroke={glow}
              strokeWidth={Math.max(0.6, w * (pinch ? 0.16 : 0.28))}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={pinch ? 0.9 : 0.35 * Math.min(1, s * 1.6)}
              style={pinch ? { animation: 'crack-pinch 1.6s ease-in-out infinite' } : undefined}
            />
            {/* เศษหินตกในร่อง */}
            {w > 5 &&
              f.rubble.map((rb, j) => {
                const a = along(f, rb.s);
                const half = (w * a.taper) / 2;
                const cx = a.p[0] + a.nrm[0] * rb.off * half;
                const cy = a.p[1] + a.nrm[1] * rb.off * half;
                const sz = rb.size * half;
                return (
                  <polygon
                    key={j}
                    points={`${f1(cx - sz)},${f1(cy)} ${f1(cx - sz * 0.2)},${f1(cy - sz * 0.8)} ${f1(cx + sz)},${f1(cy - sz * 0.1)} ${f1(cx + sz * 0.3)},${f1(cy + sz * 0.7)}`}
                    fill="#1e293b"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={0.5}
                    transform={`rotate(${f1(rb.rot)} ${f1(cx)} ${f1(cy)})`}
                  />
                );
              })}
            {/* ขอบหิน: ฝั่งหนึ่งรับแสง อีกฝั่งเป็นเงา */}
            <path d={line(g.L)} fill="none" stroke="rgba(226,232,240,0.38)" strokeWidth={1.1} strokeLinejoin="round" />
            <path d={line(g.R)} fill="none" stroke="rgba(0,0,0,0.85)" strokeWidth={2.4} strokeLinejoin="round" />
            {/* เส้นแตกวิ่งออกจากจุดกระแทกตอนแตกใหม่ */}
            {isFresh && (
              <path
                d={line(f.pts)}
                pathLength={1}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2}
                strokeLinecap="round"
                style={{ strokeDasharray: 1, animation: 'crack-draw 0.3s cubic-bezier(.2,.8,.3,1) both, crack-fade 0.8s 0.25s ease-out forwards' }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
