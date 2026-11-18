import { useEffect, useMemo, useState } from 'react';
import { sfx } from '../sfx';
import { useGame, type DeckId, type Fx } from '../store';
import { deckInfo } from '../decks';
import { CardArt, deckColor, deckCover } from '../screens/shared';
import { coverOf, DiamondAvatar } from './SeatAvatar';

/** ลายบนเหรียญ: แกนคอร์หกเหลี่ยม + วงแหวน (ด้านทอง = หัว, ด้านเทา = ก้อย) */
export function CoinFace({ gold }: { gold: boolean }) {
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

type Phase = 'ready' | 'vs' | 'coin' | 'result' | 'choose' | 'final' | 'warp' | 'setup' | 'duel';
/** เวลาเริ่มของแต่ละช่วง (ms) */
const AT = { vs: 1100, coin: 2700, result: 4400, choose: 5500 };
/** เวลาหลังเลือกผู้เริ่มก่อนแล้ว (ms นับจากตอนเลือก): ... วาร์ป → ประกอบกระดาน → DUEL */
const AFTER = { warp: 1300, setup: 2250, duel: 4150, end: 5400 };

/**
 * สถานะแอนิเมชันประกอบกระดาน ใส่ไว้ที่ <html data-board-setup>
 * pre = ซ่อนกระดานไว้ระหว่างฉากเปิด, run = เล่นแอนิเมชันประกอบกระดาน (ดู index.css)
 */
function setBoardSetup(v: 'pre' | 'run' | null) {
  const el = document.documentElement;
  if (v) el.dataset.boardSetup = v;
  else delete el.dataset.boardSetup;
}
const COIN_FLIGHT = 1700;
/** จุดดังที่สุดของเสียง coin (ms นับจากต้นไฟล์) ให้ตรงกับจังหวะเหรียญตก */
const COIN_SFX_HIT = 780;

/** ป้ายผู้เล่นมุมล่าง + การ์ดปกเด็คลอย (ฝั่งซ้ายสีฟ้า / ฝั่งขวาสีแดง) */
function Plate({ side, name, deck, avatar }: { side: 'left' | 'right'; name: string; deck: string; avatar?: string }) {
  const left = side === 'left';
  const accent = left ? '#38bdf8' : '#f43f5e';
  const glow = deckColor(deck as DeckId);
  return (
    <div className={`absolute bottom-[9%] ${left ? 'left-[4%]' : 'right-[4%]'} flex w-[30%] flex-col ${left ? 'items-start' : 'items-end'}`} style={{ animation: `${left ? 'intro-in-left' : 'intro-in-right'} 0.55s cubic-bezier(.2,.9,.3,1) both` }}>
      <div className="relative mb-4 w-[min(15vw,220px)]" style={{ animation: 'home-float 3.2s ease-in-out infinite' }}>
        <div className="absolute inset-[-35%] rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${glow}66, transparent 65%)` }} />
        <CardArt cardNo={deckCover(deck as DeckId)} className={`relative w-full shadow-[0_24px_50px_rgba(0,0,0,0.75)] ${left ? 'rotate-[-7deg]' : 'rotate-[7deg]'}`} />
      </div>
      <div className="relative w-full">
        <div className="h-[3px] w-full" style={{ background: `linear-gradient(${left ? '90deg' : '270deg'}, ${accent}, transparent)`, boxShadow: `0 0 12px ${accent}` }} />
        <div className={`flex items-center gap-3 bg-gradient-to-r py-2.5 ${left ? 'from-slate-950/90 to-transparent pl-4' : 'flex-row-reverse from-transparent to-slate-950/90 pr-4'}`}>
          <DiamondAvatar cardNo={avatar || coverOf(deck)} accent={accent} className={`h-14 w-14 ${left ? 'mr-1' : 'ml-1'}`} />
          <div className={left ? 'text-left' : 'text-right'}>
            <div className="text-xl font-black text-white drop-shadow">{name}</div>
            <div className="text-xs" style={{ color: `${accent}cc` }}>
              {deckInfo(deck).label}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** น้ำวนพลังงานกลางจอ: วงแหวนหลายชั้นหมุนสวนกัน + จุดแสง */
function Vortex({ fade }: { fade: boolean }) {
  const dots = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ a: (i / 26) * 360, r: 34 + ((i * 37) % 14), s: 3 + (i % 3) * 2 })), []);
  return (
    <div className="absolute top-1/2 left-1/2 h-[min(60vh,520px)] w-[min(60vh,520px)] transition-opacity duration-700" style={{ opacity: fade ? 0 : 1, animation: 'intro-vortex-in 0.7s ease-out both' }}>
      {[
        { c: '#a855f7', d: 9, w: 3, rev: false, scale: 1 },
        { c: '#38bdf8', d: 6, w: 2, rev: true, scale: 0.86 },
        { c: '#f43f5e', d: 11, w: 2, rev: false, scale: 0.94 },
        { c: '#818cf8', d: 4.5, w: 1.5, rev: true, scale: 0.72 },
        { c: '#e879f9', d: 7.5, w: 1, rev: false, scale: 0.6 },
      ].map((r, i) => (
        <svg key={i} viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ transform: `scale(${r.scale})`, animation: `intro-spin ${r.d}s linear infinite ${r.rev ? 'reverse' : ''}`, filter: `drop-shadow(0 0 6px ${r.c})` }}>
          {Array.from({ length: 7 }, (_, k) => (
            <ellipse key={k} cx="50" cy="50" rx={46 - k * 2.2} ry={38 - k * 3} fill="none" stroke={r.c} strokeWidth={r.w * 0.35} opacity={0.75 - k * 0.08} transform={`rotate(${k * 23} 50 50)`} />
          ))}
        </svg>
      ))}
      <div className="absolute inset-[30%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.55), rgba(129,140,248,0.25) 40%, transparent 70%)', animation: 'intro-pulse 1.6s ease-in-out infinite' }} />
      <div className="absolute inset-0" style={{ animation: 'intro-spin 14s linear infinite' }}>
        {dots.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-emerald-300"
            style={{ width: d.s, height: d.s, left: `${50 + d.r * Math.cos((d.a * Math.PI) / 180)}%`, top: `${50 + d.r * Math.sin((d.a * Math.PI) / 180)}%`, boxShadow: '0 0 6px #6ee7b7', opacity: 0.8 }}
          />
        ))}
      </div>
    </div>
  );
}

/** ช่วงวาร์ป: เส้นแสงพุ่งออกจากกลางจอ + ลำแสงฟ้า/แดงพาดผ่าน */
function Warp() {
  const streaks = useMemo(
    () => Array.from({ length: 110 }, (_, i) => ({ a: (i * 137.5) % 360, delay: (i % 12) * 55, len: 140 + ((i * 53) % 320), w: 2 + (i % 3), r0: 20 + ((i * 71) % 260), hue: ['#38bdf8', '#818cf8', '#22d3ee', '#c084fc', '#e2e8f0', '#67e8f9'][i % 6] })),
    [],
  );
  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={{ animation: 'intro-fade-io 1.1s ease both' }}>
      {streaks.map((s, i) => (
        <span key={i} className="absolute top-1/2 left-1/2 origin-left rounded-full" style={{ width: s.len, height: s.w, rotate: `${s.a}deg`, background: `linear-gradient(90deg, transparent, ${s.hue})`, boxShadow: `0 0 12px ${s.hue}, 0 0 4px #fff`, ['--r0' as string]: `${s.r0}px`, animation: `intro-streak 0.9s ${s.delay}ms cubic-bezier(.5,0,.9,.6) both` }} />
      ))}
      {/* แสงวาบกลางจอ */}
      <div className="absolute top-1/2 left-1/2 h-[60vmin] w-[60vmin] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.9), rgba(129,140,248,0.5) 25%, transparent 65%)', animation: 'coin-burst 0.8s ease-out both' }} />
      <div className="absolute top-[10%] right-[-25%] h-28 w-[80%] rounded-full bg-indigo-400 blur-2xl" style={{ animation: 'intro-trail-a 1.1s ease-in both' }} />
      <div className="absolute bottom-[12%] left-[-25%] h-28 w-[80%] rounded-full bg-rose-500 blur-2xl" style={{ animation: 'intro-trail-b 1.1s ease-in both' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, transparent 35%, rgba(0,0,0,0.7) 90%)' }} />
    </div>
  );
}

/** ฉากเปิดเกม: READY → VS → โยนเหรียญ → ผล → คนชนะเลือกเริ่มก่อน/หลัง → ประกาศผู้เริ่มก่อน → วาร์ป → DUEL! */
export function MatchIntro({ fx, onDone }: { fx: Extract<Fx, { kind: 'intro' }>; onDone: () => void }) {
  const pregame = useGame((s) => s.pregame);
  const online = useGame((s) => s.online);
  const chooseFirst = useGame((s) => s.chooseFirst);
  const [phase, setPhase] = useState<Phase>('ready');
  const [landed, setLanded] = useState(false);
  /** ถึงช่วงเลือกแล้ว (ค้างเป็น true ตลอด) */
  const [reached, setReached] = useState(false);
  const chosen = pregame?.chosen ?? null;

  // ซ่อนกระดานไว้ตลอดฉากเปิด แล้วค่อยประกอบตอนช่วง setup (ออกจากฉาก = แสดงกระดานปกติ)
  useEffect(() => {
    setBoardSetup('pre');
    return () => setBoardSetup(null);
  }, []);
  useEffect(() => {
    if (phase === 'setup' || phase === 'duel') setBoardSetup('run');
  }, [phase]);

  // ช่วงก่อนเลือก: เวลาตายตัว
  useEffect(() => {
    const timers = [
      setTimeout(() => (setPhase('vs'), sfx('whoosh')), AT.vs),
      setTimeout(() => sfx('impact'), AT.vs + 250),
      setTimeout(() => (setPhase('coin'), sfx('swish')), AT.coin),
      // เสียงเหรียญ: จุดเหรียญตกพื้นในไฟล์อยู่ที่ ~COIN_SFX_HIT → เริ่มก่อนเหรียญตกเท่านั้น
      setTimeout(() => sfx('coin'), AT.coin + COIN_FLIGHT - COIN_SFX_HIT),
      setTimeout(() => (setLanded(true), sfx('impact'), sfx(fx.heads ? 'buff' : 'fade', 120)), AT.coin + COIN_FLIGHT),
      setTimeout(() => setPhase('result'), AT.result),
      setTimeout(() => (setPhase('choose'), setReached(true)), AT.choose),
    ];
    sfx('step');
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เลือกแล้ว (และถึงช่วงเลือกแล้ว): ประกาศผู้เริ่มก่อน → วาร์ป → DUEL → จบ
  // ผูกกับค่าที่ไม่กลับเป็นเท็จ: ไม่งั้นพอเปลี่ยนช่วง ตัวจับเวลาจะถูกยกเลิก
  const afterChoose = reached && chosen !== null;
  useEffect(() => {
    if (!afterChoose) return;
    setPhase('final');
    sfx('buff');
    const timers = [
      setTimeout(() => (setPhase('warp'), sfx('whoosh')), AFTER.warp),
      setTimeout(() => (setPhase('setup'), sfx('place')), AFTER.setup),
      setTimeout(() => sfx('swish'), AFTER.setup + 950),
      setTimeout(() => sfx('draw'), AFTER.setup + 1200),
      setTimeout(() => (setPhase('duel'), sfx('duelStart')), AFTER.duel),
      setTimeout(onDone, AFTER.end),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterChoose]);

  const stage = phase === 'vs' || phase === 'coin' || phase === 'result' || phase === 'choose' || phase === 'final';
  const tone = fx.heads ? '#facc15' : '#cbd5e1';
  const winner = pregame?.winner ?? 'p1';
  // ผู้ชม: บอกชื่อผู้เล่นจากห้อง (ไม่พูดกับ "คุณ")
  const spec = !!online?.spectator;
  const seatName = (p: string) => (spec ? (online?.names[p as 'p1' | 'p2'] ?? (p === 'p1' ? 'ผู้เล่น 1' : 'ผู้เล่น 2')) : p === 'p1' ? 'ผู้เล่น 1' : 'ผู้เล่น 2');
  // ข้อความ: ออนไลน์พูดกับ "คุณ" / เครื่องเดียวบอกชื่อผู้เล่น
  const winText = online && !spec ? (fx.heads ? 'คุณชนะการเสี่ยง!' : 'คู่แข่งชนะการเสี่ยง') : `${seatName(winner)} ชนะการเสี่ยง!`;
  const firstText = chosen === null ? '' : online && !spec ? (chosen === online.me ? 'คุณเริ่มก่อน!' : 'คุณเริ่มทีหลัง') : `${seatName(chosen)} เริ่มก่อน!`;
  const iChoose = !online || (!online.spectator && online.me === winner);

  // ข้ามฉาก: ก่อนเลือก = ไปที่ช่วงเลือกเลย / เลือกแล้ว = จบฉาก
  const skip = () => {
    if (chosen === null) {
      setLanded(true);
      setPhase('choose');
      setReached(true);
    } else onDone();
  };

  const strip = (label: string, text: string, color: string, glow: string) => (
    <div className="absolute inset-x-0 top-[64%] z-10">
      <div
        key={text}
        className="mx-auto flex h-20 w-[64%] items-center justify-center border-y border-sky-300/40 bg-gradient-to-r from-transparent via-slate-950/90 to-transparent"
        style={{ animation: 'intro-strip 0.45s cubic-bezier(.2,.9,.3,1) both' }}
      >
        <span className="text-xs font-bold tracking-[0.5em]" style={{ color: glow }}>
          {label}
        </span>
        <span className="ml-5 text-4xl font-black italic" style={{ color, textShadow: `0 0 18px ${glow}aa` }}>
          {text}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      {/* พื้นหลังฉาก (หายตอนประกอบกระดาน/DUEL ให้เห็นกระดาน) */}
      {phase !== 'setup' && phase !== 'duel' && (
        <div className="absolute inset-0 bg-[#05040d]">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 15% 80%, rgba(56,189,248,0.25), transparent 50%), radial-gradient(ellipse at 85% 80%, rgba(244,63,94,0.25), transparent 50%)' }} />
          <div className="absolute -top-1/4 left-[22%] h-[150%] w-[34%] rotate-[32deg] bg-gradient-to-b from-indigo-400/0 via-indigo-400/20 to-indigo-400/0" style={{ animation: 'intro-band 1.2s ease-out both' }} />
        </div>
      )}
      {/* เส้นสแกน */}
      <div className="pointer-events-none absolute inset-0 z-[5] opacity-40" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 4px)' }} />

      {phase === 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="text-sm font-bold tracking-[0.8em] text-sky-300/80" style={{ animation: 'fx-slide-up 0.5s ease-out both' }}>
            BATTLE SPIRITS DUAL
          </div>
          <div className="text-8xl font-black italic text-white" style={{ textShadow: '0 0 28px rgba(186,230,253,0.9), 0 0 2px #fff', animation: 'intro-ready 1.1s ease-out both' }}>
            READY
          </div>
        </div>
      )}

      {stage && (
        <>
          <Vortex fade={false} />
          <Plate side="left" name={fx.left.name} deck={fx.left.deck} avatar={fx.left.avatar} />
          <Plate side="right" name={fx.right.name} deck={fx.right.deck} avatar={fx.right.avatar} />
          {phase === 'vs' && (
            <div className="absolute top-1/2 left-1/2 text-[9rem] font-black italic text-white" style={{ textShadow: '0 0 30px rgba(196,181,253,0.95), 0 0 4px #fff', animation: 'intro-vs 1.6s cubic-bezier(.2,1.4,.4,1) both' }}>
              VS
            </div>
          )}
          {phase !== 'vs' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ perspective: '800px' }}>
              <div style={{ animation: landed && phase !== 'coin' ? undefined : `intro-coin-arc ${COIN_FLIGHT}ms cubic-bezier(.25,.6,.35,1) both` }}>
                <div
                  className="relative h-32 w-32"
                  style={{
                    transformStyle: 'preserve-3d',
                    ['--spin' as string]: fx.heads ? '2160deg' : '2340deg',
                    ...(landed && phase !== 'coin'
                      ? { transform: `rotateX(${fx.heads ? 0 : 180}deg)` }
                      : { animation: `coin-spin ${COIN_FLIGHT}ms cubic-bezier(.2,.75,.3,1) both` }),
                  }}
                >
                  <CoinFace gold />
                  <CoinFace gold={false} />
                </div>
              </div>
              {landed && phase === 'coin' && (
                <div className="absolute top-1/2 left-1/2 h-80 w-80 rounded-full" style={{ background: `radial-gradient(circle, ${tone}66, transparent 62%)`, animation: 'coin-burst 0.9s ease-out both' }} />
              )}
            </div>
          )}
          {phase === 'result' && strip(fx.heads ? 'ออกหัว' : 'ออกก้อย', winText, fx.heads ? '#fde68a' : '#e2e8f0', tone)}
          {phase === 'choose' && chosen === null && (
            <div className="absolute inset-x-0 top-[62%] z-10 flex flex-col items-center gap-4" style={{ animation: 'fx-slide-up 0.35s ease-out both' }}>
              {iChoose ? (
                <>
                  <div className="text-lg font-bold text-yellow-200 drop-shadow">{online ? 'คุณชนะการเสี่ยง: เลือกลำดับการเล่น' : `${seatName(winner)} ชนะการเสี่ยง: เลือกลำดับการเล่น`}</div>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => chooseFirst(true)} className="btn-game rounded-xl px-10 py-3 text-xl font-black italic">
                      เริ่มก่อน
                    </button>
                    <button type="button" onClick={() => chooseFirst(false)} className="btn-steel rounded-xl px-10 py-3 text-xl font-black italic">
                      เริ่มหลัง
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-20 w-[64%] items-center justify-center gap-3 border-y border-sky-300/40 bg-gradient-to-r from-transparent via-slate-950/90 to-transparent text-2xl font-bold text-slate-200">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-sky-300/30 border-t-sky-300" />
                  {spec ? seatName(winner) : 'คู่แข่ง'}กำลังเลือกว่าจะเริ่มก่อนหรือเริ่มหลัง…
                </div>
              )}
            </div>
          )}
          {phase === 'final' && chosen !== null && strip('ลำดับการเล่น', firstText, '#fde68a', '#facc15')}
        </>
      )}

      {phase === 'warp' && <Warp />}

      {phase === 'duel' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45" style={{ animation: `intro-fade-out ${AFTER.end - AFTER.duel}ms ease-in both` }}>
          <div className="relative text-[13rem] leading-none font-black tracking-tight italic select-none" style={{ animation: 'intro-duel 0.7s cubic-bezier(.2,1.3,.4,1) both' }}>
            <span className="absolute inset-0 text-cyan-300/70" style={{ transform: 'translate(-8px, 2px)', animation: 'intro-rgb 0.9s ease-out both' }}>
              DUEL
            </span>
            <span className="absolute inset-0 text-rose-400/70" style={{ transform: 'translate(8px, -2px)', animation: 'intro-rgb 0.9s ease-out both reverse' }}>
              DUEL
            </span>
            <span className="relative text-white/90" style={{ WebkitTextStroke: '2px rgba(255,255,255,0.9)', textShadow: '0 0 30px rgba(255,255,255,0.6)' }}>
              DUEL
            </span>
          </div>
        </div>
      )}

      {phase !== 'choose' && (
        <button type="button" onClick={skip} className="absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/20 backdrop-blur hover:bg-white/20">
          ข้าม ▸▸
        </button>
      )}
    </div>
  );
}
