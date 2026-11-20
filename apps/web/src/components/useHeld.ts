import { useEffect, useState } from 'react';
import type { PlayerId } from '@bs/engine';
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

/** event ที่ Fx ยิงตอนระเบิดดาเมจเริ่มจริง (detail = ผู้เล่นที่เสียไลฟ์) */
export const DAMAGE_SHOWN = 'bs-damage-shown';

/**
 * Life ที่แสดง (ตัวเลข/ช่อง Life/รอยร้าว): ลดลงตรงจังหวะที่ระเบิดดาเมจเริ่มจริง ไม่ใช่ทันทีที่ state เปลี่ยน
 * (โจมตีตรง: ระเบิดรอให้การ์ดแตะเป้าก่อน) · สำรองด้วยเวลาตามไทม์ไลน์ เผื่อไม่มีแอนิเมชัน
 */
export function useShownLife(player: PlayerId): number {
  const life = useGame((s) => s.state.players[player].life.length);
  const [shown, setShown] = useState(life);
  useEffect(() => {
    if (life >= shown) {
      setShown(life);
      return;
    }
    const hit = useGame.getState().fx.find((f) => f.kind === 'damage' && f.player === player);
    if (!hit || !('delay' in hit)) {
      setShown(life);
      return;
    }
    const show = () => setShown(life);
    const onDamage = (e: Event) => (e as CustomEvent<PlayerId>).detail === player && show();
    window.addEventListener(DAMAGE_SHOWN, onDamage);
    const t = setTimeout(show, (hit.delay ?? 0) + 600);
    return () => {
      window.removeEventListener(DAMAGE_SHOWN, onDamage);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [life]);
  return shown;
}
