/**
 * ประวัติการดวล Casual Match (เก็บในเครื่อง · ล่าสุดก่อน · สูงสุด MAX รายการ)
 * บันทึกตอนขึ้นหน้าผลการดวลของห้อง Casual Match (MatchResult) · id = รหัสห้อง + รอบ (ไม่บันทึกซ้ำ)
 */
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

export function recordCasual(r: CasualRecord): void {
  const list = casualHistory();
  if (list.some((x) => x.id === r.id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([r, ...list].slice(0, MAX)));
  } catch {
    /* เก็บไม่ได้ก็ไม่เป็นไร */
  }
}
