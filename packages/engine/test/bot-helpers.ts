/** ตัวช่วยให้บอทเล่นเกมทั้งเกม (ใช้ใน bot.test.ts) */
import { expandDeck, loadAllCards, SD01_DECK, SD02_DECK, SD03_DECK, SD04_DECK, type DeckEntry } from '@bs/cards';
import { actorOf, applyAction, botDecide, createGame, legalActions, type Action, type GameState, type PlayerId } from '../src';

export const db = loadAllCards();
export const STARTERS: Record<string, readonly DeckEntry[]> = { sd01: SD01_DECK, sd02: SD02_DECK, sd03: SD03_DECK, sd04: SD04_DECK };

/** ชุดการ์ด Booster ทั้งหมด (BS01…) */
export const BOOSTER_SETS = [...new Set(db.all().map((c) => c.set).filter((x): x is string => !!x && /^BS[0-9]+$/.test(x)))].sort();

/**
 * เด็คทดสอบจากการ์ดทั้งชุด (ใบละ 1 ใบ เติมจนครบอย่างน้อย 40 ใบ) ไว้ให้บอทลองเอฟเฟกต์ของทุกใบ
 * (เดิมใบละ 3 = เด็ค 100–180 ใบ: สองฝั่งตั้งรับเต็มสนามแล้วเกมลากจนเด็คหมดเกิน 60 เทิร์น เทสต์ช้าจนหมดเวลา)
 */
export function setDeck(set: string): string[] {
  const cards = db.all().filter((c) => c.set === set && ['spirit', 'brave', 'nexus', 'magic', 'ultimate'].includes(c.type));
  const out: string[] = [];
  for (const c of cards) out.push(c.cardNo);
  while (out.length < 40) out.push(...out.slice(0, 40 - out.length));
  return out;
}
export const deckOf = (name: string) => (STARTERS[name] ? expandDeck([...STARTERS[name]!]) : setDeck(name));

/** bot = ระดับ 5 · { level } = กำหนดความเก่ง 1–5 · random = สุ่มท่า */
export type Policy = 'bot' | 'random' | { level: number };

export interface GameRecord {
  winner: PlayerId | null;
  turns: number;
  actions: number;
  /** ท่าที่บอทเลือกใช้กับเกมจริงไม่ได้ (ต้องใช้ทางสำรอง) */
  fallbacks: number;
  ms: number;
  /** สรุปทีละเทิร์น (เปิดด้วย trace) */
  log: string[];
}

/** ท่าสุ่มที่ถูกกติกา (ไว้เทียบความเก่ง) */
function randomAction(s: GameState, who: PlayerId, rnd: () => number): Action | null {
  const acts = legalActions(s, db, who).filter((a) => applyAction(s, a, db).ok);
  return acts.length ? acts[Math.floor(rnd() * acts.length)]! : null;
}

/** เล่นจนจบเกม (ค้าง/วน = โยน error) */
export function play(d1: string, d2: string, seed: number, policies: Record<PlayerId, Policy> = { p1: 'bot', p2: 'bot' }, trace = false): GameRecord {
  let s: GameState = createGame({ db, decks: { p1: deckOf(d1), p2: deckOf(d2) }, seed, firstPlayer: seed % 2 ? 'p1' : 'p2' }).state;
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const t0 = Date.now();
  const log: string[] = [];
  let actions = 0;
  let fallbacks = 0;
  let perTurn = 0;
  let lastTurn = s.turn;
  while (!s.winner && actions < 5000) {
    const who = actorOf(s)!;
    const pol = policies[who];
    let a: Action | null = pol === 'random' ? randomAction(s, who, rnd) : (botDecide(s, db, who, { level: pol === 'bot' ? 5 : pol.level })?.action ?? null);
    let r = a ? applyAction(s, a, db) : null;
    if (!r || !r.ok) {
      fallbacks++;
      a = s.choice
        ? { type: 'choose', player: who, pick: null }
        : s.battle?.flash
          ? { type: 'passFlash', player: who }
          : s.battle?.step === 'declareBlock'
            ? { type: 'noBlock', player: who }
            : s.phase === 'main'
              ? { type: 'endMain', player: who }
              : { type: 'endAttackStep', player: who };
      r = applyAction(s, a, db);
      if (!r.ok) {
        const c = s.choice;
        throw new Error(
          `[${d1} vs ${d2} seed ${seed}] ค้าง: ${JSON.stringify(a)} → ${r.error.code} ${r.error.message} · choice ${JSON.stringify(c && { kind: c.kind, prompt: 'prompt' in c ? c.prompt : '', src: db.get(s.cards[c.sourceId]!.cardNo).name })}`,
        );
      }
    }
    const done = a as Action;
    if (trace && done.type !== 'passFlash' && done.type !== 'choose') {
      const name = (id: string) => db.get(s.cards[id]!.cardNo).name;
      const detail = 'cardId' in done ? ` ${name(done.cardId)}` : done.type === 'declareAttack' ? ` ${name(done.attackerId)}` : done.type === 'declareBlock' ? ` ${name(done.blockerId)}` : '';
      log.push(`T${s.turn} ${who}(${JSON.stringify(policies[who])}) ${done.type}${detail} · life p1 ${s.players.p1.life.length} p2 ${s.players.p2.life.length}`);
    }
    s = r.state;
    actions++;
    if (s.turn !== lastTurn) {
      lastTurn = s.turn;
      perTurn = 0;
    } else if (++perTurn > 200) throw new Error(`[${d1} vs ${d2} seed ${seed}] วนไม่จบในเทิร์น ${s.turn}: ${JSON.stringify(done)}`);
  }
  return { winner: s.winner ?? null, turns: s.turn, actions, fallbacks, ms: Date.now() - t0, log };
}
