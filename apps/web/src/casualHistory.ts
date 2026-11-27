/**
 * ประวัติการดวล Casual Match (เก็บในเครื่อง · ล่าสุดก่อน · สูงสุด MAX รายการ)
 * บันทึกตอนขึ้นหน้าผลการดวลของห้อง Casual Match (MatchResult) · id = รหัสห้อง + รอบ (ไม่บันทึกซ้ำ)
 */
import type { ReplayData } from './store';

export interface CasualRecord {
  id: string;
  /** เวลาจบเกม (ms) */
  at: number;
  won: boolean;
  opponent: string;
  opponentAvatar?: string;
  /** ชื่อเด็คของเรา / ของคู่แข่ง */
  myDeck: string;
  oppDeck: string;
  turns: number;
}

const KEY = 'bs-casual-history';
const MAX = 50;

export function casualHistory(): CasualRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as CasualRecord[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- Replay ของแต่ละเกม (id เดียวกับประวัติ)
const REPLAY_KEY = 'bs-casual-replays';
/** เก็บ Replay ล่าสุดไม่เกินเท่านี้ (เกมละราว 20–80 KB · localStorage มีที่จำกัด) */
const MAX_REPLAYS = 30;

function readReplays(): Record<string, ReplayData> {
  try {
    const v = JSON.parse(localStorage.getItem(REPLAY_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, ReplayData>) : {};
  } catch {
    return {};
  }
}

export function getReplay(id: string): ReplayData | null {
  return readReplays()[id] ?? null;
}

/** บันทึก Replay (เก็บเฉพาะเกมล่าสุด · ที่เต็ม = ทิ้งเกมเก่าทีละเกมจนเก็บได้) */
export function saveReplay(id: string, d: ReplayData): void {
  const keep = new Set(casualHistory().slice(0, MAX_REPLAYS).map((r) => r.id));
  keep.add(id);
  const all = readReplays();
  const ids = [id, ...casualHistory().map((r) => r.id).filter((x) => x !== id && all[x] && keep.has(x))];
  for (let n = ids.length; n >= 1; n--) {
    const out: Record<string, ReplayData> = {};
    for (const x of ids.slice(0, n)) out[x] = x === id ? d : all[x]!;
    try {
      localStorage.setItem(REPLAY_KEY, JSON.stringify(out));
      return;
    } catch {
      /* เต็ม: ลองเก็บน้อยลง */
    }
  }
}

export function recordCasual(r: CasualRecord): void {
  const list = casualHistory();
  if (list.some((x) => x.id === r.id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([r, ...list].slice(0, MAX)));
  } catch {
    /* เก็บไม่ได้ก็ไม่เป็นไร */
  }
}
