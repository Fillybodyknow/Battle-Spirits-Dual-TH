/**
 * ตัวรันบทเรียน: เริ่มเกมจาก state ที่จัดไว้ · กั้น action ให้ทำได้เฉพาะที่ขั้นนั้นรอ · เลื่อนขั้นเมื่อทำครบและแอนิเมชันจบ
 * คู่แข่ง (p2) ตัดสินใจตามบอทของบท · ความคืบหน้าเก็บใน localStorage 'bs-tutorial' (ซิงก์ตามบัญชี: SETTING_KEYS ใน account.ts)
 */
import { create } from 'zustand';
import { blockersFor, canAttackWith, currentBp, payableCost, type Action, type GameState } from '@bs/engine';
import { actingPlayer, db, isFxBlocking, setTutorialHooks, useGame, type Fx } from '../store';
import { LESSONS, type Ids, type Lesson, type TutorialStep } from './lessons';

const KEY = 'bs-tutorial';
interface Progress {
  /** บทที่เล่นจบแล้ว (id) */
  done: string[];
  /** เคยชวนเล่นตอนเข้าครั้งแรกแล้ว (กดเริ่มหรือข้าม) */
  prompted: boolean;
}
function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null;
    return { done: Array.isArray(p?.done) ? p.done.filter((x): x is string => typeof x === 'string') : [], prompted: !!p?.prompted };
  } catch {
    return { done: [], prompted: false };
  }
}
function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ไม่มีที่เก็บ: จำได้แค่รอบนี้ */
  }
}

/** show = รอผู้เล่น (กด "ถัดไป" หรือทำตามที่บอก) · wait = ทำแล้ว รอผล/แอนิเมชัน · done = จบบท */
type Phase = 'show' | 'wait' | 'done';

interface TutorialState {
  lesson: Lesson | null;
  ids: Ids;
  step: number;
  phase: Phase;
  /** จบบทแล้วแต่ไม่ผ่าน (ด่านสุดท้ายแพ้): ให้ลองใหม่ */
  failed: boolean;
  progress: Progress;
}

export const useTutorial = create<TutorialState>(() => ({ lesson: null, ids: {}, step: 0, phase: 'show', failed: false, progress: loadProgress() }));

export const currentStep = (t: TutorialState): TutorialStep | null => t.lesson?.steps[t.step] ?? null;
const startPhase = (st: TutorialStep): Phase => (!st.expect && st.until ? 'wait' : 'show');

/** แอนิเมชันที่ต้องรอให้จบก่อนไปขั้นถัดไป (ไม่นับหน้าผลการดวล ที่ค้างจนผู้เล่นปิด) */
const fxBusy = (fx: Fx[]) => fx.some((f) => f.kind === 'banner') || isFxBlocking(fx.filter((f) => f.kind !== 'result'));

let botPending = false;
let bypass = false;
let unsub: (() => void) | null = null;
let savedFixedView: boolean | null = null;

function botDispatch(a: Action) {
  bypass = true;
  try {
    const ok = useGame.getState().dispatch(a);
    // อัญเชิญไม่ได้ (คอสต์/Core ไม่ตรง): จบ Main Step แทน ไม่ให้ค้าง
    if (!ok && a.type === 'summon') useGame.getState().dispatch({ type: 'endMain', player: a.player });
  } finally {
    bypass = false;
  }
}

/**
 * คู่แข่ง (p2) แบบง่าย: จั่ว · (summon) อัญเชิญสปิริตที่จ่ายไหว Lv1 · โจมตีด้วยตัวที่โจมตีได้ · ป้องกันเมื่อ BP สูงกว่าผู้โจมตี
 * ผ่าน Flash เสมอ · ตัวเลือก = ตัวแรก / ไม่จ่าย
 */
export function smartBot(s: GameState, summon = false): Action | null {
  const p = 'p2' as const;
  if (s.winner) return null;
  const c = s.choice;
  if (c) {
    if (c.player !== p) return null;
    if (c.kind === 'card') return { type: 'choose', player: p, pick: c.optional ? null : (c.candidates[0] ?? null) };
    if (c.kind === 'payCost') return { type: 'choose', player: p, pick: null };
    if (c.kind === 'multiCard') return { type: 'choose', player: p, pick: { cards: c.candidates.slice(0, c.count) } };
    if (c.kind === 'distribute') {
      // แบ่งคอร์: ไล่จากตัวแรกให้ครบจำนวน
      const alloc: Record<string, number> = {};
      let left = c.total;
      for (const id of c.candidates) {
        const n = Math.min(left, c.caps[id] ?? 0);
        if (n > 0) alloc[id] = n;
        left -= n;
      }
      return { type: 'choose', player: p, pick: { alloc } };
    }
    return { type: 'choose', player: p, pick: 0 };
  }
  if (s.awaitingDraw === p) return { type: 'drawStep', player: p };
  if (s.battle?.flash) return s.battle.flash.priority === p ? { type: 'passFlash', player: p } : null;
  if (s.battle?.step === 'declareBlock') {
    if (s.turnPlayer === p) return null;
    const bp = currentBp(s, db, s.battle.attackerId);
    const blocker = blockersFor(s, db, p).find((id) => currentBp(s, db, id) > bp);
    return blocker ? { type: 'declareBlock', player: p, blockerId: blocker } : { type: 'noBlock', player: p };
  }
  if (s.turnPlayer !== p || s.battle) return null;
  const me = s.players[p];
  if (s.phase === 'main') {
    // อัญเชิญได้เทิร์นละ 1 ตัว (บทเรียน: ไม่ให้คู่แข่งลงสปิริตคอสต์ 0 รัว ๆ จนโหดเกินไป)
    const turnStart = s.log.map((e) => e.type).lastIndexOf('turnStarted');
    const summoned = s.log.slice(turnStart + 1).some((e) => e.type === 'summoned' && s.cards[e.cardId]?.owner === p);
    if (summon && !summoned) {
      for (const id of me.hand) {
        const def = db.get(s.cards[id]!.cardNo);
        if (def.type !== 'spirit') continue;
        const cost = payableCost(s, db, p, def);
        if (me.reserve.length >= cost + 1) return { type: 'summon', player: p, cardId: id, payment: me.reserve.slice(0, cost), placement: [me.reserve[cost]!] };
      }
    }
    return { type: 'endMain', player: p };
  }
  if (s.phase === 'attack') {
    const attacker = me.field.find((id) => canAttackWith(s, db, id));
    return attacker ? { type: 'declareAttack', player: p, attackerId: attacker } : { type: 'endAttackStep', player: p };
  }
  return null;
}

function advance() {
  const t = useTutorial.getState();
  if (!t.lesson) return;
  const next = t.step + 1;
  if (next >= t.lesson.steps.length) {
    // ด่านที่ต้องชนะ: แพ้ = ไม่นับว่าจบบท ให้ลองใหม่
    if (t.lesson.passed && !t.lesson.passed(useGame.getState().state)) {
      useTutorial.setState({ phase: 'done', failed: true });
      return;
    }
    const done = t.progress.done.includes(t.lesson.id) ? t.progress.done : [...t.progress.done, t.lesson.id];
    const progress = { ...t.progress, done };
    saveProgress(progress);
    useTutorial.setState({ phase: 'done', failed: false, progress });
    return;
  }
  useTutorial.setState({ step: next, phase: startPhase(t.lesson.steps[next]!) });
}

/** ตรวจทุกครั้งที่เกมเปลี่ยน: คู่แข่งตัดสินใจ / ขั้นที่รอผลเสร็จแล้วไปต่อ */
function tick() {
  const t = useTutorial.getState();
  const g = useGame.getState();
  if (!t.lesson) return;
  if (g.screen !== 'game') return endTutorial(false);
  const busy = fxBusy(g.fx);
  // คู่แข่ง: รอแอนิเมชันจบก่อน แล้วค่อยตัดสินใจ (ให้ผู้เล่นเห็นทีละจังหวะ)
  if (!busy && !g.state.winner && actingPlayer(g.state) === 'p2' && !botPending) {
    const a = t.lesson.bot?.(g.state, t.ids) ?? smartBot(g.state, !!t.lesson.botSummons);
    if (a) {
      botPending = true;
      setTimeout(() => {
        botPending = false;
        if (useTutorial.getState().lesson) botDispatch(a);
      }, 500);
    }
  }
  const st = currentStep(t);
  if (st && t.phase === 'wait' && !busy && (st.until?.(g.state, t.ids) ?? true)) advance();
}

/**
 * เริ่มบทเรียน · คืน false = ไม่ได้เริ่ม
 * อยู่ในห้องออนไลน์ = เริ่มไม่ได้ (action จะถูกส่งเข้าห้อง) · มีเกมเครื่องเดียวค้างอยู่ = ถามก่อน (บทเรียนใช้กระดานเดียวกัน)
 */
export function startTutorial(id: string): boolean {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) return false;
  const g = useGame.getState();
  if (g.online) {
    alert('ออกจากห้องออนไลน์ก่อนเล่นบทเรียน');
    return false;
  }
  if (g.localInProgress && !confirm('เกมเครื่องเดียวที่เล่นค้างอยู่จะหายไป เริ่มบทเรียนเลยไหม?')) return false;
  endTutorial(false, true);
  const { state, ids } = lesson.setup();
  // ผู้เล่นอยู่ด้านล่างตลอด (ไม่พลิกกระดานตอนคู่แข่งตัดสินใจ)
  savedFixedView = g.fixedView;
  useGame.setState({ fixedView: true });
  setTutorialHooks({
    guard: (a) => {
      if (bypass) return true;
      const t = useTutorial.getState();
      const st = currentStep(t);
      // เล่นอิสระ (ด่านสุดท้าย): ทำได้ทุกอย่างของฝั่งเรา
      if (st?.free && t.phase !== 'done') return a.player === 'p1';
      return t.phase === 'show' && !!st?.expect?.(a, t.ids);
    },
    after: (a) => {
      if (bypass) return;
      const t = useTutorial.getState();
      const st = currentStep(t);
      if (t.phase === 'show' && st?.expect?.(a, t.ids)) useTutorial.setState({ phase: 'wait' });
    },
  });
  useTutorial.setState({ lesson, ids, step: 0, phase: startPhase(lesson.steps[0]!), failed: false });
  g.startScripted(state);
  const offGame = useGame.subscribe(tick);
  const offTutorial = useTutorial.subscribe(() => setTimeout(tick, 0));
  unsub = () => {
    offGame();
    offTutorial();
  };
  return true;
}

/** ปุ่ม "ถัดไป" ของขั้นที่อธิบายอย่างเดียว */
export function nextStep() {
  const t = useTutorial.getState();
  const st = currentStep(t);
  if (t.phase === 'show' && st && !st.expect) advance();
}

/** ออกจากบทเรียน (home = กลับหน้าหลัก) */
export function endTutorial(home = true, quiet = false) {
  if (!useTutorial.getState().lesson && quiet) return;
  unsub?.();
  unsub = null;
  setTutorialHooks(null);
  if (savedFixedView !== null) useGame.setState({ fixedView: savedFixedView });
  savedFixedView = null;
  useTutorial.setState({ lesson: null, ids: {}, step: 0, phase: 'show', failed: false });
  if (home) useGame.getState().setScreen('home');
}

/** บันทึกว่าชวนเล่นแล้ว (กดเริ่มหรือข้ามที่ป้ายต้อนรับ) */
export function markPrompted() {
  const progress = { ...useTutorial.getState().progress, prompted: true };
  saveProgress(progress);
  useTutorial.setState({ progress });
}

/** โหลดความคืบหน้าใหม่ (ซิงก์จากบัญชีแล้ว) */
export function reloadTutorialProgress() {
  useTutorial.setState({ progress: loadProgress() });
}
