/**
 * ระดับความหายากของการ์ด (จากบรรทัด "การ์ดระดับ <code>" ในไฟล์การ์ด)
 *  C = Common · U/UC = Uncommon · R = Rare · M = Master Rare · X = X-Rare · XX/XV/อื่น ๆ = ระดับพิเศษ
 */
export interface RarityInfo {
  /** รหัสมาตรฐาน (UC → U, X-Rare → X) */
  code: string;
  /** ชื่อเต็ม */
  label: string;
  /** อันดับ 1 (C) … 6 (ระดับพิเศษ) */
  rank: number;
}

const TABLE: Record<string, Omit<RarityInfo, 'code'>> = {
  C: { label: 'Common', rank: 1 },
  U: { label: 'Uncommon', rank: 2 },
  R: { label: 'Rare', rank: 3 },
  M: { label: 'Master Rare', rank: 4 },
  X: { label: 'X-Rare', rank: 5 },
};

export function rarityOf(raw: string | undefined): RarityInfo | null {
  if (!raw) return null;
  let code = raw.trim().toUpperCase();
  if (code === 'UC') code = 'U';
  if (code === 'X-RARE' || code === 'XRARE') code = 'X';
  const hit = TABLE[code];
  if (hit) return { code, ...hit };
  // XX / XV / ระดับพิเศษอื่น ๆ
  return { code, label: code.startsWith('X') ? `${code}-Rare` : code, rank: 6 };
}

/** X-Rare ขึ้นไป (ใช้ cut-in / ลงสนามแบบหนักหน่วง / ภาพหน้าปก) */
export const isXRare = (card: { rarity?: string }) => (rarityOf(card.rarity)?.rank ?? 0) >= 5;
