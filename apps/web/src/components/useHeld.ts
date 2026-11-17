import { useEffect, useState } from 'react';
import { useGame } from '../store';

/** ค่าที่หน่วงไว้ของการ์ดนี้ (ถ้ายังไม่ถึงเวลา) — render ใหม่เองเมื่อหมดเวลา */
export function useHeld(cardId: string): { bp?: number; level?: number; exhausted?: true } | null {
  const hold = useGame((s) => s.holds[cardId]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hold) return;
    const now = performance.now();
    const timers = [hold.until, hold.exhaustedUntil ?? 0]
      .filter((t) => t > now)
      .map((t) => setTimeout(() => tick((n) => n + 1), t - now + 10));
    return () => timers.forEach(clearTimeout);
  }, [hold]);
  if (!hold) return null;
  const now = performance.now();
  const out: { bp?: number; level?: number; exhausted?: true } = {};
  if (now < hold.until) {
    if (hold.bp !== undefined) out.bp = hold.bp;
    if (hold.level !== undefined) out.level = hold.level;
  }
  if (hold.exhaustedUntil && now < hold.exhaustedUntil) out.exhausted = true;
  return out;
}
