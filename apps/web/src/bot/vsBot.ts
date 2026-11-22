/**
 * ดวลกับบอท (SOLO → VS BOT และการดวลในโหมด Story)
 * ผู้เล่นอยู่ที่นั่ง p1 (ด้านล่างตลอด) · บอทอยู่ p2: ตัดสินใจด้วย botAction ของ engine (ไม่เห็นมือ/เด็ค/เบิร์สของผู้เล่น)
 * บอทรอแอนิเมชันจบก่อนเดินทุกครั้ง · กั้นไม่ให้ผู้เล่นกดแทนฝั่งบอท (ใช้ตัวกั้น action เดียวกับบทเรียน)
 */
import { actorOf, botAction, type Action, type PlayerId } from '@bs/engine';
import { db, isFxBlocking, setTutorialHooks, useGame, type Fx } from '../store';
import { setSeatNames } from '../format';

const BOT: PlayerId = 'p2';
/** เวลาคิด (ms) ก่อนบอทเดินแต่ละท่า ให้ผู้เล่นเห็นทีละจังหวะ */
const THINK_MS = 450;

export interface VsBotOptions {
  /** ความเก่ง 1–5 (ไม่ระบุ = 5) */
  level?: number;
  /** ชื่อคู่แข่งที่แสดง (ไม่ระบุ = บอท) */
  botName?: string;
  /** รูปโปรไฟล์ของคู่แข่ง (รหัสการ์ด · ไม่ระบุ = รูปสำรอง) */
  botAvatar?: string;
  /** ด่าน Story (EXP ×1.5) */
  story?: boolean;
  /** ชนะครั้งแรกของด่านนี้ได้ EXP เพิ่ม */
  firstClearBonus?: number;
  /** จบเกม (ครั้งเดียวต่อเกม) */
  onEnd?: (won: boolean) => void;
  /** ปุ่มหลักในหน้าผลการดวล (เช่น กลับไปที่ด่าน) แทน "กลับหน้าหลัก" */
  exit?: { label: string; run: () => void };
}

let unsub: (() => void) | null = null;
let pending = false;
let bypass = false;
let savedFixedView: boolean | null = null;
let opts: VsBotOptions = {};
let decks: { p1: string; p2: string } | null = null;
let ended = false;

/** แอนิเมชันที่ต้องรอให้จบก่อนบอทเดิน (ไม่นับหน้าผลการดวลที่ค้างจนผู้เล่นปิด) */
const fxBusy = (fx: Fx[]) => fx.some((f) => f.kind === 'banner') || isFxBlocking(fx.filter((f) => f.kind !== 'result'));

/** ท่าสำรองที่ไม่ทำให้เกมค้าง (ท่าที่บอทเลือกใช้ไม่ได้จริง) */
function fallback(): Action {
  const s = useGame.getState().state;
  if (s.choice) return { type: 'choose', player: BOT, pick: null };
  if (s.battle?.flash) return { type: 'passFlash', player: BOT };
  if (s.battle?.step === 'declareBlock') return { type: 'noBlock', player: BOT };
  return s.phase === 'main' ? { type: 'endMain', player: BOT } : { type: 'endAttackStep', player: BOT };
}

function botMove() {
  const g = useGame.getState();
  if (!g.botSeat || g.state.winner || actorOf(g.state) !== BOT) return;
  const a = botAction(g.state, db, BOT, { level: opts.level ?? 5 }) ?? fallback();
  bypass = true;
  try {
    if (!g.dispatch(a)) g.dispatch(fallback());
  } finally {
    bypass = false;
  }
}

function tick() {
  const g = useGame.getState();
  if (!g.botSeat) return;
  if (g.screen !== 'game') return endVsBot();
  // pregame ค้างค่าไว้ตลอดเกม (ใครเลือกเริ่มก่อน): จบเกมจริง = เลือกผู้เริ่มก่อนแล้ว
  if (g.state.winner && !ended && !(g.pregame && !g.pregame.chosen)) {
    ended = true;
    opts.onEnd?.(g.state.winner !== BOT);
  }
  if (pending) return;
  // ฉากเปิดเกม: บอทชนะการเสี่ยง = เลือกเริ่มก่อน (ฉากเปิดนับเป็นแอนิเมชันที่ค้างรอการเลือก: ห้ามรอให้จบก่อน)
  if (g.pregame && !g.pregame.chosen) {
    if (g.pregame.winner === BOT) {
      pending = true;
      setTimeout(() => {
        pending = false;
        const p = useGame.getState().pregame;
        if (useGame.getState().botSeat && p && !p.chosen) useGame.getState().chooseFirst(true);
      }, 2600);
    }
    return;
  }
  if (fxBusy(g.fx)) return;
  if (g.state.winner || actorOf(g.state) !== BOT) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    botMove();
  }, THINK_MS);
}

/** เริ่มดวลกับบอท: d.p1 = ผู้เล่น, d.p2 = บอท */
export function startVsBot(d: { p1: string; p2: string }, o: VsBotOptions = {}) {
  const g = useGame.getState();
  if (g.online) {
    alert('ออกจากห้องออนไลน์ก่อนดวลกับบอท');
    return;
  }
  endVsBot();
  opts = o;
  decks = d;
  ended = false;
  savedFixedView = g.fixedView;
  setTutorialHooks({ guard: (a) => bypass || a.player !== BOT, after: () => {} });
  useGame.setState({ fixedView: true, botSeat: BOT, botName: o.botName ?? null, botAvatar: o.botAvatar ?? null });
  // ข้อความบนกระดาน (ตาของ…, รอ…, ป้ายสนาม): ชื่อเรา / ชื่อคู่แข่ง แทน ผู้เล่น 1/2
  setSeatNames({ p1: g.playerName, [BOT]: o.botName ?? 'บอท' });
  g.startLocal(d);
  unsub = useGame.subscribe(() => setTimeout(tick, 0));
  setTimeout(tick, 0);
}

/** เล่นอีกครั้ง (เด็คและตัวเลือกเดิม) */
export function restartVsBot() {
  if (decks) startVsBot(decks, opts);
}

/** ข้อมูลการดวลกับบอทตอนนี้ (หน้าผลการดวลใช้คิด EXP) · null = ไม่ได้ดวลกับบอท */
export function vsBotInfo(): { stars: number; story: boolean; firstClearBonus: number } | null {
  return useGame.getState().botSeat ? { stars: opts.level ?? 5, story: !!opts.story, firstClearBonus: opts.firstClearBonus ?? 0 } : null;
}

/** ปุ่มหลักในหน้าผลการดวล (null = ใช้ "กลับหน้าหลัก" ตามปกติ) */
export function vsBotExit(): VsBotOptions['exit'] | null {
  return useGame.getState().botSeat ? (opts.exit ?? null) : null;
}

/** ออกจากโหมดดวลกับบอท (ออกจากหน้าเกม = จบ: เกมนี้เล่นต่อแบบสองคนไม่ได้) */
export function endVsBot() {
  unsub?.();
  unsub = null;
  pending = false;
  const g = useGame.getState();
  if (!g.botSeat && savedFixedView === null) return;
  setTutorialHooks(null);
  setSeatNames(null);
  useGame.setState({ botSeat: null, botName: null, botAvatar: null, localInProgress: false, ...(savedFixedView !== null ? { fixedView: savedFixedView } : {}) });
  savedFixedView = null;
}
