import { useEffect, useMemo, useRef, useState } from 'react';
import { opponentOf, type PlayerId } from '@bs/engine';
import { sfx } from '../sfx';
import { layoutRect, useGame, type Fx, type Rect } from '../store';
import { deckInfo } from '../decks';
import { BTN } from './Modal';
import { restartVsBot, vsBotExit, vsBotInfo } from '../bot/vsBot';
import { addExp, matchExp } from '../progression/level';
import { ExpGain } from './LevelBadge';

const REASON: Record<string, (win: string, lose: string) => string> = {
  lifeZero: (_w, l) => `Life ของ ${l} เป็น 0!`,
  deckOut: (_w, l) => `เด็คของ ${l} หมด!`,
  concede: (_w, l) => `${l} ยอมแพ้`,
};

/** แผ่นสนามของผู้แพ้แตก: รอยร้าวลามจากจุดกลาง + เศษกระจกกระเด็น + แสงวาบ */
function Shatter({ rect }: { rect: Rect }) {
  const cracks = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.2;
      let x = 50;
      let y = 50;
      const pts = [`${x},${y}`];
      for (let k = 1; k <= 4; k++) {
        const r = k * (13 + (i % 4) * 2);
        x = 50 + Math.cos(a + (k % 2 ? 0.12 : -0.1)) * r;
        y = 50 + Math.sin(a + (k % 2 ? -0.08 : 0.1)) * r * 0.55;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      out.push(pts.join(' '));
    }
    return out;
  }, []);
  // กิ่งรอยร้าวสั้น ๆ แตกออกจากเส้นหลัก
  const branches = useMemo(
    () =>
      cracks.flatMap((p, i) => {
        const pts = p.split(' ').map((q) => q.split(',').map(Number) as [number, number]);
        return pts.slice(1, 4).map(([x, y], k) => {
          const a = ((i * 47 + k * 83) % 360) * (Math.PI / 180);
          const len = 4 + ((i + k) % 4) * 2;
          return `${x},${y} ${(x + Math.cos(a) * len).toFixed(1)},${(y + Math.sin(a) * len * 0.6).toFixed(1)}`;
        });
      }),
    [cracks],
  );
  const shards = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = (i * 137.5 * Math.PI) / 180;
        const d = 120 + ((i * 53) % 260);
        return {
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d * 0.7 - 80,
          rot: ((i * 97) % 540) - 270,
          size: 14 + ((i * 31) % 34),
          clip: ['polygon(0 0, 100% 20%, 40% 100%)', 'polygon(10% 0, 100% 50%, 0 100%)', 'polygon(0 30%, 80% 0, 100% 100%, 20% 80%)'][i % 3],
          delay: (i % 6) * 25,
        };
      }),
    [],
  );
  return (
    <div className="pointer-events-none absolute overflow-visible" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {/* แผ่นสนามมืดลง */}
      <div className="absolute inset-0 rounded-xl bg-black/55" style={{ animation: 'result-dim 0.5s 0.15s ease-out both' }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{ transformOrigin: '50% 50%', animation: 'result-crack-grow 0.45s 0.05s cubic-bezier(.2,.9,.3,1) both', filter: 'drop-shadow(0 0 4px rgba(186,230,253,0.9))' }}>
        {cracks.map((p, i) => (
          <polyline key={i} points={p} fill="none" stroke="rgba(240,249,255,0.95)" strokeWidth={i % 3 === 0 ? 2.4 : 1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {branches.map((p, i) => (
          <polyline key={`b${i}`} points={p} fill="none" stroke="rgba(226,240,255,0.75)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 h-[140%] w-[90%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(165,243,252,0.5) 25%, transparent 60%)', animation: 'coin-burst 0.8s 0.1s ease-out both' }} />
      {shards.map((s, i) => (
        <span
          key={i}
          className="absolute top-1/2 left-1/2"
          style={{
            width: s.size,
            height: s.size,
            clipPath: s.clip,
            background: 'linear-gradient(135deg, rgba(226,232,240,0.95), rgba(71,85,105,0.9) 60%, rgba(15,23,42,0.95))',
            ['--dx' as string]: `${s.dx}px`,
            ['--dy' as string]: `${s.dy}px`,
            ['--rot' as string]: `${s.rot}deg`,
            animation: `result-shard 1.1s ${0.12 + s.delay / 1000}s cubic-bezier(.15,.6,.4,1) both`,
          }}
        />
      ))}
    </div>
  );
}

/** ตัวอักษร VICTORY / DEFEAT: วาดเส้นขอบก่อน แล้วเติมสี */
function BigWord({ text, win }: { text: string; win: boolean }) {
  return (
    <svg viewBox="0 0 1000 220" className="w-[min(86vw,1100px)] overflow-visible">
      <defs>
        <linearGradient id="result-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={win ? '#ffffff' : '#e2e8f0'} />
          <stop offset="1" stopColor={win ? '#e0f2fe' : '#64748b'} />
        </linearGradient>
      </defs>
      <text
        x="500"
        y="170"
        textAnchor="middle"
        fontSize="190"
        fontWeight="900"
        fontStyle="italic"
        fontFamily="'Segoe UI', system-ui, sans-serif"
        fill="url(#result-fill)"
        stroke={win ? '#ffffff' : '#94a3b8'}
        strokeWidth="3"
        style={{
          strokeDasharray: 2400,
          strokeDashoffset: 2400,
          fillOpacity: 0,
          filter: win ? 'drop-shadow(0 0 18px rgba(186,230,253,0.9)) drop-shadow(-4px 0 0 rgba(34,211,238,0.6)) drop-shadow(4px 0 0 rgba(244,63,94,0.6))' : 'drop-shadow(0 0 12px rgba(100,116,139,0.8))',
          animation: 'result-draw 0.8s ease-out forwards, result-fill 0.5s 0.75s ease-out forwards',
        }}
      >
        {text}
      </text>
    </svg>
  );
}

/** ฉากจบเกม: สนามผู้แพ้แตก → VICTORY / DEFEAT → แผงสรุปผล */
export function MatchResult({ fx, onClose }: { fx: Extract<Fx, { kind: 'result' }>; onClose: () => void }) {
  const showFx = useGame((s) => s.showFx);
  const online = useGame((s) => s.online);
  const decks = useGame((s) => s.decks);
  const names = useGame((s) => s.online?.names);
  const myName = useGame((s) => s.playerName);
  const { startLocal, onlineLeave, setScreen } = useGame.getState();
  const [step, setStep] = useState<'wait' | 'shatter' | 'word' | 'panel'>(fx.delay > 0 ? 'wait' : 'shatter');
  const [mat, setMat] = useState<Rect | null>(null);

  const loser = opponentOf(fx.winner);
  const botSeat = useGame((s) => s.botSeat);
  // ออนไลน์ = มุมของที่นั่งเรา · ดวลกับบอท = บอทชนะคือเราแพ้ · สองคนเครื่องเดียว = ฉลองผู้ชนะเสมอ
  const win = online ? fx.winner === online.me : botSeat ? fx.winner !== botSeat : true;
  const botName = useGame((s) => s.botName);
  const label = (p: PlayerId) =>
    online
      ? p === online.me
        ? (names?.[p] ?? myName)
        : (names?.[p] ?? 'คู่แข่ง')
      : botSeat
        ? p === botSeat
          ? (botName ?? 'บอท')
          : myName
        : p === 'p1'
          ? 'ผู้เล่น 1'
          : 'ผู้เล่น 2';
  const exit = vsBotExit();
  // EXP ของเกมนี้ (ครั้งเดียวต่อหน้าผล): ออนไลน์ = ที่นั่งเรา · ดวลกับบอท = ฝั่งที่ไม่ใช่บอท · ผู้ชม/เครื่องเดียว/บทเรียน = ไม่มี
  const award = useMemo(() => {
    const bot = vsBotInfo();
    const me = online && !online.spectator ? online.me : bot && botSeat ? opponentOf(botSeat) : null;
    if (!me) return null;
    const r = matchExp({ mode: online ? 'online' : 'bot', won: fx.winner === me, stars: bot?.stars, story: bot?.story, firstClearBonus: bot?.firstClearBonus, turn: useGame.getState().state.turn, reason: fx.reason });
    return addExp(`result-${online?.code ?? 'bot'}-${fx.id}`, r.exp, r.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.id]);

  const started = useRef(false);
  const seq = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => seq.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (started.current) return;
    const begin = () => {
      setMat(layoutRect(document.querySelector(`[data-mat="${loser}"]`)));
      setStep('shatter');
      sfx('shatter');
      sfx('bigdamage', 60);
      const el = document.querySelector<HTMLElement>(`[data-mat="${loser}"]`);
      el?.animate(
        [
          { transform: 'translate(0,0)' },
          { transform: 'translate(-9px,5px)' },
          { transform: 'translate(8px,-6px)' },
          { transform: 'translate(-5px,3px)' },
          { transform: 'translate(0,0)' },
        ],
        { duration: 420, easing: 'ease-out' },
      );
    };
    const start = () => {
      started.current = true;
      begin();
      seq.current.push(
        setTimeout(() => {
          setStep('word');
          sfx(win ? 'win' : 'fade');
        }, 1250),
        setTimeout(() => setStep('panel'), 3000),
      );
      // ระหว่างรอนับเป็นแอนิเมชันที่ต้องเล่นให้จบ: เริ่มแล้วปลดสถานะนั้น
      if (fx.delay > 0) showFx(fx.id);
    };
    const t = setTimeout(start, Math.max(0, fx.delay));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.delay]);

  if (step === 'wait') return null;
  const reason = (REASON[fx.reason] ?? REASON.lifeZero!)(label(fx.winner), label(loser));
  // ออนไลน์: เล่นอีกครั้ง = ออกจากห้องแล้วกลับไป DUEL LOBBY (ทั้งสองฝั่งกดได้)
  const canRematch = true;

  return (
    <div className="fixed inset-0 z-[66] overflow-hidden">
      {mat && step !== 'panel' && <Shatter rect={mat} />}
      {mat && step === 'panel' && <div className="pointer-events-none absolute rounded-xl bg-black/55" style={{ left: mat.x, top: mat.y, width: mat.w, height: mat.h }} />}

      {(step === 'word' || step === 'panel') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: step === 'panel' ? 'radial-gradient(ellipse at center, rgba(2,6,23,0.72), rgba(2,6,23,0.92))' : 'radial-gradient(ellipse at center, rgba(2,6,23,0.35), rgba(2,6,23,0.8))', transition: 'background 0.5s', animation: 'fx-fade-in 0.4s ease-out both' }}>
          {/* ลำแสงหลากสี (ชนะ) / ฝุ่นตกช้า ๆ (แพ้) */}
          {win ? (
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 h-[180vmax] w-[180vmax]"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.28) 0deg 2deg, transparent 2deg 9deg, rgba(250,204,21,0.22) 9deg 11deg, transparent 11deg 17deg, rgba(56,189,248,0.22) 17deg 19deg, transparent 19deg 26deg, rgba(244,114,182,0.2) 26deg 28deg, transparent 28deg 34deg)',
                maskImage: 'radial-gradient(circle, #000 0%, transparent 42%)',
                WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 42%)',
                translate: '-50% -50%',
                animation: 'fx-rays 24s linear infinite, result-rays-in 0.9s 0.7s ease-out both',
              }}
            />
          ) : (
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.4), rgba(2,6,23,0.85))' }} />
          )}
          <div className={step === 'panel' ? 'transition-transform duration-500' : ''} style={{ transform: step === 'panel' ? 'translateY(-8vh) scale(0.85)' : undefined }}>
            <BigWord text={win ? 'VICTORY' : 'DEFEAT'} win={win} />
          </div>
          {!online && step === 'word' && <div className="mt-2 text-2xl font-black text-yellow-200 drop-shadow" style={{ animation: 'fx-slide-up 0.4s 0.9s ease-out both' }}>{label(fx.winner)} ชนะ!</div>}

          {step === 'panel' && (
            <div className="relative mt-2 flex w-[min(80vw,900px)] flex-col items-center gap-4" style={{ animation: 'fx-slide-up 0.45s ease-out both' }}>
              <div className="rounded-full bg-black/60 px-5 py-1.5 text-sm text-slate-200">{reason}</div>
              <div className="flex w-full items-center gap-3">
                {(['p1', 'p2'] as const).map((p, i) => {
                  const won = p === fx.winner;
                  const accent = i === 0 ? '#38bdf8' : '#f43f5e';
                  return (
                    <div key={p} className={`flex flex-1 items-center gap-3 ${i === 1 ? 'flex-row-reverse text-right' : ''}`}>
                      <div className="flex h-12 w-12 items-center justify-center text-3xl">{won ? '👑' : ''}</div>
                      <div className="flex-1">
                        <div className="h-[3px]" style={{ background: `linear-gradient(${i === 0 ? '90deg' : '270deg'}, ${accent}, transparent)` }} />
                        <div className={`bg-gradient-to-r py-2 ${i === 0 ? 'from-slate-950/90 to-transparent pl-3' : 'from-transparent to-slate-950/90 pr-3'}`}>
                          <div className="text-lg font-black text-white">{label(p)}</div>
                          <div className="text-xs" style={{ color: won ? '#fde68a' : '#94a3b8' }}>
                            {won ? 'ชนะ' : 'แพ้'} · {deckInfo(decks[p]).label}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {award && <ExpGain award={award} />}
              <div className="flex gap-3">
                {canRematch && (
                  <button
                    type="button"
                    className={BTN.secondary}
                    onClick={() => {
                      onClose();
                      if (online) {
                        onlineLeave();
                        setScreen('lobby');
                      }
                      else if (botSeat) restartVsBot();
                      else startLocal(decks);
                    }}
                  >
                    เล่นอีกครั้ง
                  </button>
                )}
                <button
                  type="button"
                  className={`${BTN.primary} px-10`}
                  onClick={() => {
                    onClose();
                    if (online) onlineLeave();
                    else if (exit) exit.run();
                    else {
                      useGame.setState({ localInProgress: false });
                      setScreen('home');
                    }
                  }}
                >
                  {exit?.label ?? 'กลับหน้าหลัก'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
