/**
 * หน้าไตเติล + เข้าสู่ระบบ (ต้องล็อกอินก่อนเข้าเกม)
 * องค์ประกอบแนวหน้าเริ่มเกมการ์ดบน PC แต่วาดเองทั้งหมด (ไม่ใช้โลโก้/ภาพ/ข้อความของเกมอื่น):
 *  แถบแสงเฉียง · เส้นวงจรมุมจอ · โลโก้ตัวอักษรในกรอบข้าวหลามตัด (ทรงคอร์) · ปุ่มวงแหวน Soul Core ให้แตะ
 *  มุมซ้ายบน Ver + Player ID · มุมขวาล่าง ตั้งค่า / บัญชี
 * แตะ (หรือกดคีย์ใดก็ได้): ล็อกอินอยู่ = แสงวาบเข้าเกม · ยังไม่ล็อกอิน = แผงเข้าสู่ระบบกลางจอ
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isXRare } from '@bs/cards';
import { playerId, useAccount } from '../account/account';
import { cardArt, IMG } from '../assets';
import { effects } from '../gfx';
import { db } from '../store';
import { APP_VERSION } from '../changelog';
import { AccountDialog, SignInForm } from '../components/AccountDialog';
import { SettingsDialog } from '../components/SettingsDialog';
import { Icon } from '../components/Icon';
import { sfx } from '../sfx';
import { deckCover } from './shared';
import { BTN } from '../components/Modal';
import { useNeedsWelcome } from '../tutorial/TutorialMenu';
import { markPrompted, startTutorial } from '../tutorial/tutorial';
import { LESSONS } from '../tutorial/lessons';
import { preloadAll, type PreloadProgress } from '../preload';

/** ฉากวาร์ปยาวอย่างน้อยเท่าเดิม (แสงวาบเดิมเริ่มที่ 2.8 วิ) แม้โหลดเสร็จเร็ว */
const MIN_WARP_MS = 2800;
/** ID ใหม่: แผงชวนเล่นบทเรียนขึ้นไม่เร็วกว่านี้หลังแตะเริ่ม (เดิม 1.4 วิ) */
const WELCOME_AT_MS = 1400;
/** เพดานเวลาหน้าโหลดรวม (ms) */
const MAX_LOAD_MS = 20000;

/** ประกายลอยขึ้น (ตำแหน่ง/ความเร็วตายตัวตามลำดับ ไม่สุ่มทุกครั้งที่วาด) */
const MOTES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 1.5 + ((i * 7) % 3),
  dur: 10 + ((i * 13) % 12),
  delay: -((i * 29) % 20),
  hue: i % 4 === 0 ? '#c4b5fd' : '#60a5fa',
}));


/** แถบแสงเฉียง (ฉากหลัง) */
function Bands() {
  const bands = [
    { left: '-12%', width: '34%', from: 'rgba(59,130,246,0.30)', dur: 18 },
    { left: '30%', width: '22%', from: 'rgba(96,165,250,0.18)', dur: 24 },
    { left: '58%', width: '40%', from: 'rgba(30,64,175,0.28)', dur: 21 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden">
      {bands.map((b, i) => (
        <div
          key={i}
          className="absolute -top-1/2 h-[200%]"
          style={{
            left: b.left,
            width: b.width,
            transform: 'rotate(35deg)',
            background: `linear-gradient(90deg, transparent, ${b.from} 30%, ${b.from} 70%, transparent)`,
            animation: `login-band ${b.dur}s ease-in-out ${-i * 5}s infinite alternate`,
          }}
        />
      ))}
      {/* แถบมืดตัดเฉียง ให้เกิดชั้นลึก */}
      <div className="absolute -top-1/2 left-[40%] h-[200%] w-[16%] bg-black/45" style={{ transform: 'rotate(35deg)' }} />
    </div>
  );
}

/** เส้นวงจรเหลี่ยมที่มุมจอ */
function Circuit({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 260 160"
      className={`pointer-events-none absolute h-[22vh] w-auto text-sky-200/35 ${flip ? 'right-0 bottom-0 rotate-180' : 'top-0 left-0'}`}
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path d="M0 40 H60 L80 20 H180" strokeWidth="1.2" />
      <path d="M0 70 H40 L70 100 H120" strokeWidth="0.8" />
      <path d="M20 0 V30 L40 50 V140" strokeWidth="0.8" opacity="0.7" />
      <rect x="178" y="17" width="6" height="6" fill="currentColor" stroke="none" />
      <rect x="118" y="97" width="5" height="5" fill="currentColor" stroke="none" />
      <circle cx="40" cy="140" r="3" />
    </svg>
  );
}

/** กรอบข้าวหลามตัดหลังโลโก้ (ทรงคอร์ของ Battle Spirits) */
function Emblem() {
  return (
    <svg viewBox="-100 -100 200 200" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="emb" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#emb)">
        <polygon points="0,-96 74,0 0,96 -74,0" strokeWidth="1.4" />
        <polygon points="0,-84 64,0 0,84 -64,0" strokeWidth="0.5" />
        <line x1="-74" y1="0" x2="-100" y2="0" strokeWidth="1" />
        <line x1="74" y1="0" x2="100" y2="0" strokeWidth="1" />
      </g>
    </svg>
  );
}


/**
 * ฉากเข้าเกม: อุโมงค์เนบิวลาหมุนวน + เส้นความเร็ว · การ์ด (หลังการ์ดของเกมปนภาพการ์ดจริง) พุ่งออกจากกลางจอเข้าหากล้อง → แสงวาบ
 * ค่าของแต่ละใบตายตัวตามลำดับ (ไม่สุ่มทุกครั้งที่วาด) · กราฟิกต่ำ = การ์ดครึ่งเดียว
 */
/**
 * hold = ค้างฉากนี้ไว้ (ID ใหม่: รอเลือกเริ่มบทเรียน/ข้าม) การ์ดพุ่งวนไม่หยุด ไม่มีแสงวาบ
 * leaving = แสงวาบทันที (ออกจากฉากค้าง)
 */
function WarpOut({ hold = false, leaving = false, progress = null }: { hold?: boolean; leaving?: boolean; progress?: PreloadProgress | null }) {
  // การ์ดน้อย ใหญ่ ช้า ให้มองเห็นแต่ละใบชัด (เจ้าของโปรเจกต์ปรับ: เดิม 28 ใบ เล็กและเร็วเกินไป)
  const count = effects().blur ? 12 : 7;
  const fronts = useMemo(
    () =>
      db
        .all()
        .filter((c) => c.type !== 'magic' && cardArt(c.cardNo))
        .map((c) => c.cardNo),
    [],
  );
  const cards = Array.from({ length: count }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const r = 55 + ((i * 23) % 50);
    return {
      dx: `${Math.cos(a) * r}vmax`,
      dy: `${Math.sin(a) * r * 0.75}vmax`,
      rx: `${((i * 71) % 140) - 70}deg`,
      ry: `${((i * 53) % 160) - 80}deg`,
      rz: `${((i * 97) % 360) - 180}deg`,
      delay: i * 0.1,
      dur: 1.8 + ((i * 7) % 5) * 0.15,
      art: i % 3 === 0 && fronts.length ? cardArt(fronts[(i * 31) % fronts.length]!) : IMG.cardBack,
    };
  });
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden bg-[#05030c]" style={{ animation: 'login-warp-bg 0.35s ease-out both' }}>
      {/* เนบิวลาม่วง-ฟ้าหมุนวนเข้าศูนย์กลาง (ดำแค่รูตรงกลาง) */}
      <div
        className="absolute top-1/2 left-1/2 h-[280vmax] w-[280vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          // ไม่ใช้ filter: blur บน element ใหญ่ขนาดนี้ (เบราว์เซอร์บางตัวไม่วาดชั้นนี้เลย) · conic ไล่สีนุ่มอยู่แล้ว
          background:
            'conic-gradient(from 0deg, #6d28d9, #1d4ed8, #a21caf, #312e81, #7c3aed, #0e7490, #9333ea, #1e3a8a, #6d28d9)',
          animation: hold ? 'login-vortex 3.3s cubic-bezier(.5,0,.8,.6) both, login-vortex-loop 40s linear 3.3s infinite' : 'login-vortex 3.3s cubic-bezier(.5,0,.8,.6) both',
        }}
      />
      {/* ก้อนแสงม่วงซ้าย / ฟ้าขวา */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 65% at 12% 35%, rgba(192,38,211,0.7), transparent 70%), radial-gradient(ellipse 45% 60% at 88% 60%, rgba(59,130,246,0.6), transparent 70%), radial-gradient(ellipse 35% 30% at 70% 10%, rgba(139,92,246,0.45), transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 50%, #000 0%, rgba(2,1,10,0.92) 6%, rgba(10,5,30,0.55) 16%, transparent 38%), radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)' }}
      />
      {/* ลำแสงความเร็ว: หนา หัวสว่างขาว สลับฟ้า/ม่วง */}
      {Array.from({ length: 34 }, (_, i) => {
        const cyan = i % 2 === 0;
        const thick = 3 + ((i * 5) % 6);
        const len = 22 + ((i * 13) % 30);
        return (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 origin-left"
            style={{ rotate: `${i * 10.6 + ((i * 7) % 5)}deg`, width: `${len}vmax`, height: thick }}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(90deg, transparent, ${cyan ? 'rgba(56,189,248,0.9)' : 'rgba(192,132,252,0.9)'} 70%, #fff)`,
                boxShadow: `0 0 ${thick * 3}px ${cyan ? '#38bdf8' : '#c084fc'}`,
                animation: `login-streak ${0.7 + ((i * 3) % 5) * 0.08}s ${(i % 9) * 0.09}s ease-in infinite`,
              }}
            />
          </span>
        );
      })}
      {/* การ์ดพุ่งเข้าหากล้อง */}
      <div className="absolute inset-0" style={{ perspective: '900px' }}>
        {cards.map((c, i) => (
          <img
            key={i}
            src={c.art}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 w-[15vw] min-w-28 rounded-lg shadow-[0_0_24px_rgba(167,139,250,0.55)] ring-1 ring-amber-200/40"
            style={
              {
                '--dx': c.dx,
                '--dy': c.dy,
                '--rx': c.rx,
                '--ry': c.ry,
                '--rz': c.rz,
                animation: `login-warp-card ${c.dur}s cubic-bezier(.55,0,.9,.5) ${c.delay}s ${hold ? 'infinite' : 'both'}`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      {/* มุมขวาล่าง: กำลังโหลดจริง (preload.ts) · แถบ + เปอร์เซ็นต์ + สิ่งที่กำลังโหลด */}
      {progress && !leaving && (
        <div className="absolute right-8 bottom-6 flex w-72 flex-col items-end gap-1.5 text-white">
          <div className="flex items-center gap-2" style={{ animation: 'login-tap 1.2s ease-in-out infinite' }}>
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="6" y="3" width="12" height="18" rx="2" transform="rotate(-14 12 12)" />
              <rect x="9" y="7" width="6" height="7" rx="1" transform="rotate(-14 12 12)" strokeWidth="1.5" />
            </svg>
            <span className="text-xl font-black tracking-wider italic [text-shadow:0_0_10px_rgba(255,255,255,0.6)]">
              {progress.done >= progress.total ? 'READY' : 'CONNECTING'}
            </span>
            <span className="w-12 text-right text-lg font-black tabular-nums [text-shadow:0_0_10px_rgba(255,255,255,0.6)]">
              {Math.floor((progress.done / Math.max(1, progress.total)) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15 ring-1 ring-white/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-300 via-white to-amber-200 shadow-[0_0_10px_rgba(186,230,253,0.9)] transition-[width] duration-300 ease-out"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <div className="text-xs font-bold text-white/70">{progress.label}</div>
        </div>
      )}
      {/* ปิดท้าย: แสงวาบ (ค้างฉาก = วาบตอนเลือกแล้วเท่านั้น) */}
      {(!hold || leaving) && <div className="absolute inset-0 bg-white" style={{ animation: hold ? 'login-flash 0.5s ease-in both' : 'login-flash 0.5s ease-in 2.8s both' }} />}
    </div>
  );
}

/**
 * ตัวละครฝั่งขวา: X-Rare ของทุกกล่อง สุ่ม 2 ใบต่อการเปิดแอป
 * เฉพาะ Spirit / Ultimate (Brave ส่วนใหญ่เป็นอาวุธ ไม่ใช่ตัวละคร) · มีไม่ถึง 2 ใบ = รวม X-Rare ทุกประเภท
 */
function useHeroes(): string[] {
  return useMemo(() => {
    const xr = db.all().filter((c) => isXRare(c) && cardArt(c.cardNo));
    const spirits = xr.filter((c) => c.type === 'spirit' || c.type === 'ultimate');
    const pool = [...(spirits.length >= 2 ? spirits : xr)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 2).map((c) => c.cardNo);
  }, []);
}

/**
 * ภาพตัวละคร: ครอปเฉพาะภาพประกอบของการ์ด (ส่วนบน ~2–56% ของความสูงการ์ด ใต้นั้นเป็นกล่องข้อความ)
 * ขอบจางกลืนฉากหลังด้วย mask
 */
function HeroArt({ cardNo, className, delay }: { cardNo: string; className: string; delay: number }) {
  // วงรีจางหมดก่อนถึงขอบกล่อง (ไม่เห็นขอบภาพเป็นเส้นตรง)
  const mask = 'radial-gradient(ellipse 47% 44% at 50% 48%, #000 45%, transparent 100%)';
  return (
    <div className={`absolute ${className}`} style={{ animation: `login-hero-in 1.4s cubic-bezier(.2,.9,.3,1) ${delay}s both` }}>
      <div
        className="h-full w-full"
        style={{
          backgroundImage: `url(${cardArt(cardNo)})`,
          backgroundSize: 'auto 185%',
          // เริ่มที่ ~5% ของการ์ด: ข้ามขอบบน/ไอคอนคอสต์มุมซ้ายบน
          backgroundPosition: '50% 12%',
          maskImage: mask,
          WebkitMaskImage: mask,
          animation: `home-float ${7 + delay * 4}s ease-in-out infinite`,
        }}
      />
    </div>
  );
}

/** ละอองแสงกลมลอยขึ้นฝั่งตัวละคร */
const BOKEH = Array.from({ length: 22 }, (_, i) => ({
  left: 52 + ((i * 41) % 46),
  size: 6 + ((i * 11) % 26),
  dur: 9 + ((i * 7) % 9),
  delay: -((i * 13) % 16),
  op: 0.25 + ((i * 3) % 5) * 0.1,
}));

/** ไอคอนโอนข้อมูล (ลูกศรวน) */
function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 7h-9a5 5 0 0 0-5 5" />
      <path d="M17 4l3 3-3 3" />
      <path d="M4 17h9a5 5 0 0 0 5-5" />
      <path d="M7 20l-3-3 3-3" />
    </svg>
  );
}

const PILL_BTN =
  'flex h-11 items-center gap-2 rounded-full border-2 border-white/85 bg-black/55 px-5 text-sm font-bold text-white shadow-[0_0_16px_rgba(96,165,250,0.3)] transition hover:bg-white/15 active:scale-95';

export function Login({ onEnter }: { onEnter: () => void }) {
  const { ready, user, error } = useAccount();
  const [phase, setPhase] = useState<'title' | 'login' | 'entering'>('title');
  // ID ใหม่: ค้างฉากการ์ดพุ่งไว้ แล้วชวนเล่นบทเรียน (เริ่ม = เข้าบทที่ 1 · ข้าม = หน้าหลัก)
  const needsWelcome = useNeedsWelcome();
  const [hold, setHold] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leave = (tutorial: boolean) => {
    if (leaving) return;
    sfx('click');
    markPrompted();
    setLeaving(true);
    setTimeout(() => sfx('impact'), 80);
    setTimeout(() => {
      if (tutorial) startTutorial(LESSONS[0]!.id);
      onEnter();
    }, 520);
  };
  const [dialog, setDialog] = useState<'settings' | 'account' | null>(null);

  // เข้าเกม: ฉากการ์ดพุ่งออกจากอุโมงค์ วนไประหว่างโหลดของจริง (preload.ts) · โหลดเสร็จ = แสงวาบเข้าหน้าหลัก
  // (ID ใหม่: โหลดเสร็จแล้วค่อยขึ้นแผงชวนเล่นบทเรียน) · ฉากวาร์ปยาวอย่างน้อยเท่าเดิม (MIN_WARP_MS) แม้โหลดเร็ว
  const [progress, setProgress] = useState<PreloadProgress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const enteredAt = useRef(0);
  const enter = useCallback(() => {
    setPhase('entering');
    sfx('whoosh');
    setHold(true);
    enteredAt.current = Date.now();
    // เรียกในจังหวะที่ผู้เล่นแตะ: สร้าง AudioContext สำหรับถอดรหัสเสียงได้
    // เพดานรวม: เน็ตช้ามากก็เข้าหน้าหลักได้ภายใน MAX_LOAD_MS (ส่วนที่ค้างโหลดต่อเบื้องหลัง)
    void Promise.race([preloadAll(setProgress), new Promise<void>((r) => setTimeout(r, MAX_LOAD_MS))]).then(() => setLoaded(true));
  }, []);
  // ID ใหม่: แผงชวนเล่นบทเรียนขึ้นเมื่อโหลดเสร็จ และไม่เร็วกว่าเดิม (1.4 วิหลังแตะเริ่ม)
  const [welcomeReady, setWelcomeReady] = useState(false);
  useEffect(() => {
    if (!loaded || !needsWelcome) return;
    const t = setTimeout(() => setWelcomeReady(true), Math.max(0, WELCOME_AT_MS - (Date.now() - enteredAt.current)));
    return () => clearTimeout(t);
  }, [loaded, needsWelcome]);
  useEffect(() => {
    if (!loaded || needsWelcome) return;
    const t = setTimeout(() => {
      setLeaving(true);
      sfx('impact');
      setTimeout(onEnter, 520);
    }, Math.max(0, MIN_WARP_MS - (Date.now() - enteredAt.current)));
    return () => clearTimeout(t);
  }, [loaded, needsWelcome, onEnter]);

  const start = useCallback(() => {
    if (!ready || phase !== 'title' || dialog) return;
    sfx('click');
    if (user) enter();
    else setPhase('login');
  }, [ready, phase, dialog, user, enter]);

  // "กดคีย์ใดก็ได้"
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (phase === 'title' && !e.repeat) start();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [phase, start]);

  // ล็อกอินสำเร็จจากแผง → กลับหน้าไตเติล (โชว์ Player ID + ปุ่มโอนข้อมูล) รอแตะอีกครั้งเพื่อเข้าหน้าหลัก
  useEffect(() => {
    if (phase === 'login' && user) setPhase('title');
  }, [phase, user]);

  const heroes = useHeroes();
  const login = phase === 'login';
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#03040c] text-white select-none" onClick={start}>
      {/* ฉากหลัง: ไล่สีน้ำเงิน-ม่วง · แถบแสงเฉียง · เส้นสแกน · ประกาย */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #070b1f 0%, #0a1033 45%, #120a2e 80%, #1e0f3d 100%)' }} />
      <Bands />
      <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)' }} />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="absolute bottom-[-4%] rounded-full"
          style={{
            left: `${m.left}%`,
            width: m.size,
            height: m.size,
            background: m.hue,
            boxShadow: `0 0 ${m.size * 4}px ${m.hue}`,
            animation: `login-mote ${m.dur}s linear ${m.delay}s infinite`,
          }}
        />
      ))}
      <Circuit />
      <Circuit flip />

      {/* ฝั่งขวา: ตัวละคร X-Rare กล่องล่าสุด + แสงฟ้าด้านหลัง + ละอองแสง */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[60%]">
        <div className="absolute top-[8%] right-[10%] h-[80%] w-[70%] rounded-full bg-sky-500/20 blur-3xl" />
        {/* สองตัวแยกซ้าย-ขวา ทับกันแค่ขอบที่จาง · ตัวหลังต่ำลงเล็กน้อยให้มีมิติ */}
        {heroes[1] && <HeroArt cardNo={heroes[1]} className="top-[13%] right-[-2%] h-[80vh] w-[26vw] opacity-90" delay={0.35} />}
        {heroes[0] && <HeroArt cardNo={heroes[0]} className="top-[4%] right-[38%] h-[86vh] w-[27vw]" delay={0.1} />}
        {BOKEH.map((b, i) => (
          <span
            key={i}
            className="absolute bottom-[-6%] rounded-full bg-sky-200 blur-[2px]"
            style={{
              left: `${(b.left - 40) / 0.6}%`,
              width: b.size,
              height: b.size,
              opacity: b.op,
              boxShadow: `0 0 ${b.size}px rgba(125,211,252,0.9)`,
              animation: `login-mote ${b.dur}s linear ${b.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ฝั่งซ้าย: โลโก้ในกรอบข้าวหลามตัด + แตะเพื่อเริ่ม · แผงเข้าสู่ระบบเปิด = โลโก้ย่อขึ้นด้านบน */}
      <div
        className={`absolute left-0 flex w-1/2 flex-col items-center transition-all duration-700 ${login ? 'top-[2%] scale-[0.6]' : 'top-[14%]'}`}
        style={{ transformOrigin: 'top center' }}
      >
        <div className="relative flex h-[min(44vh,360px)] w-[min(44vh,360px)] items-center justify-center" style={{ animation: 'login-logo-in 1.4s cubic-bezier(.2,.9,.3,1) both' }}>
          <div className={`absolute inset-0 transition-opacity duration-700 ${login ? 'opacity-0' : 'opacity-100'}`} style={{ filter: 'drop-shadow(0 0 12px rgba(96,165,250,0.6))' }}>
            <Emblem />
          </div>
          <div className="relative flex flex-col items-center whitespace-nowrap">
            <div
              className="text-[clamp(2.6rem,5.6vw,5.4rem)] leading-none font-black tracking-tight italic"
              style={{
                background: 'linear-gradient(180deg, #fffbeb 0%, #fde68a 38%, #f59e0b 62%, #92400e 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 4px 0 #0c0a09) drop-shadow(0 0 26px rgba(251,191,36,0.4))',
              }}
            >
              BATTLE SPIRITS
            </div>
            <div className={`mt-2 text-[clamp(1rem,1.8vw,1.6rem)] font-black tracking-[0.55em] text-slate-100 transition-opacity duration-500 [text-shadow:0_0_16px_rgba(96,165,250,0.9)] ${login ? 'opacity-0' : ''}`}>
              DUAL · TH
            </div>
          </div>
        </div>

        {/* แตะเพื่อเริ่ม: วงแหวน Soul Core + ข้อความ (ใต้โลโก้ แบบ "PRESS ⓐ") */}
        {phase !== 'login' && (
          <div className="mt-2 flex items-center gap-4">
            <div className="text-base font-black tracking-[0.35em] text-sky-100/90" style={{ animation: 'login-tap 2.4s ease-in-out infinite' }}>
              {ready ? 'แตะเพื่อเริ่ม' : 'กำลังเชื่อมต่อ…'}
            </div>
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 rounded-full border-2 border-white/80 shadow-[0_0_16px_rgba(147,197,253,0.8),inset_0_0_12px_rgba(147,197,253,0.6)]" />
              <span className="absolute inset-0 rounded-full border border-sky-200/70" style={{ animation: 'login-ring 2.4s ease-out infinite' }} />
              <span className="absolute inset-[16%] rounded-full bg-black/80" />
              <img src={IMG.soulCore} alt="" draggable={false} className="relative h-7 w-7 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]" style={{ animation: 'login-core 2.4s ease-in-out infinite' }} />
            </div>
          </div>
        )}
      </div>

      {/* แผงเข้าสู่ระบบ: ฝั่งซ้าย ใต้โลโก้ที่ย่อขึ้นไป (ตัวละครฝั่งขวายังอยู่) */}
      {login && !user && (
        <div className="pointer-events-none absolute left-0 top-[17%] bottom-[3%] flex w-1/2 min-w-[min(100%,26rem)] items-center justify-center px-4">
          <div
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-sky-300/40 bg-slate-950/85 p-5 shadow-[0_0_60px_rgba(56,189,248,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md"
            style={{ animation: 'login-panel-in 0.45s cubic-bezier(.2,.9,.3,1) both' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-black tracking-wide">เข้าสู่ระบบ</div>
              <button type="button" onClick={() => setPhase('title')} className="rounded px-2 text-sm text-slate-400 hover:bg-white/10 hover:text-white">
                ย้อนกลับ
              </button>
            </div>
            <SignInForm />
            {error && <div className="mt-3 rounded-lg bg-rose-950/60 px-3 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-400/40">{error}</div>}
          </div>
        </div>
      )}

      {/* มุมซ้ายบน: เวอร์ชัน / Player ID */}
      <div className="absolute top-4 left-14 text-sm leading-snug font-bold tracking-wide text-slate-200/90 [text-shadow:0_1px_2px_#000]">
        <div>Ver: {APP_VERSION}</div>
        <div>Player ID: {user ? playerId(user.uid) : '---'}</div>
      </div>

      {/* มุมซ้ายล่าง: ชื่อเกม */}
      <div className="absolute bottom-4 left-6 text-xs font-semibold tracking-wide text-slate-300/80">Battle Spirits Dual TH</div>

      {/* มุมขวาล่าง: โอนข้อมูล/บัญชี (หลังล็อกอิน) · ตั้งค่า */}
      {!login && (
        <div className="absolute right-6 bottom-5 flex gap-3" onClick={(e) => e.stopPropagation()}>
          {user && (
            <button type="button" className={PILL_BTN} title="บัญชี · ซิงก์ข้อมูลข้ามเครื่อง" onClick={() => (sfx('click'), setDialog('account'))} style={{ animation: 'login-panel-in 0.45s ease-out both' }}>
              <SyncIcon />
              โอนข้อมูล / บัญชี
            </button>
          )}
          <button type="button" className={PILL_BTN} title="ตั้งค่า" onClick={() => (sfx('click'), setDialog('settings'))}>
            <Icon name="settings" className="text-xl" />
          </button>
        </div>
      )}

      {dialog && (
        <div onClick={(e) => e.stopPropagation()}>
          {dialog === 'settings' ? <SettingsDialog onClose={() => setDialog(null)} /> : <AccountDialog onClose={() => setDialog(null)} fallbackAvatar={deckCover('sd02')} allowSyncNow />}
        </div>
      )}

      {/* เข้าเกม: การ์ดพุ่งออกจากอุโมงค์ แล้วแสงวาบ */}
      {phase === 'entering' && <WarpOut hold={hold} leaving={leaving} progress={welcomeReady ? null : progress} />}
      {phase === 'entering' && welcomeReady && !leaving && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
          <div
            className="hud-panel flex w-[min(560px,92vw)] flex-col gap-4 rounded-2xl border border-yellow-300/50 p-6 shadow-[0_0_60px_rgba(167,139,250,0.45)]"
            style={{ animation: 'fx-slide-up 0.45s cubic-bezier(.2,.9,.3,1) 0.2s both' }}
          >
            <div>
              <div className="text-xs font-bold tracking-[0.3em] text-yellow-200/80">WELCOME</div>
              <div className="text-2xl font-black text-white">ยินดีต้อนรับนักดวลหน้าใหม่!</div>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">
              เล่นบทเรียนพื้นฐานก่อนไหม? พาดูสนาม อัญเชิญสปิริต และโจมตีจนชนะ บนกระดานจริงทีละขั้น ใช้เวลาไม่กี่นาที
              <br />
              <span className="text-slate-400">กลับมาเล่นได้ทุกเมื่อจากเมนู TUTORIAL ในหน้าหลัก</span>
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN.secondary} onClick={() => leave(false)}>
                ข้าม
              </button>
              <button type="button" className={`${BTN.primary} px-8`} onClick={() => leave(true)}>
                เริ่มบทเรียน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
