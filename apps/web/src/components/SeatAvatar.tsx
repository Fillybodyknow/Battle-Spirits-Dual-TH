/**
 * รูปโปรไฟล์ของผู้เล่นแต่ละที่นั่ง (ระหว่างเกม / ฉากเปิดเกม)
 * ออนไลน์ = รูปที่ผู้เล่นตั้งไว้ (rooms/<code>/avatars) · ไม่มี = หน้าปกเด็คของที่นั่งนั้น
 * เครื่องเดียว = ผู้เล่น 1 ใช้รูปของบัญชีนี้ ผู้เล่น 2 ใช้หน้าปกเด็ค
 */
import type { PlayerId } from '@bs/engine';
import { useAccount } from '../account/account';
import { deckCover } from '../screens/shared';
import { useGame, type DeckId } from '../store';
import { AvatarImg } from './AccountDialog';

/** หน้าปกเด็คเป็นรูปสำรอง (รหัสเด็คที่ถอดไม่ได้ = ปก Starter) */
export function coverOf(deck?: string | null): string {
  try {
    if (deck) return deckCover(deck as DeckId);
  } catch {
    /* ใช้ปกสำรอง */
  }
  return deckCover('sd02');
}

export function useSeatAvatar(p: PlayerId): string {
  const online = useGame((s) => s.online);
  const decks = useGame((s) => s.decks);
  const mine = useAccount((s) => s.avatar);
  if (online) {
    const a = online.avatars[p];
    if (a) return a;
    if (!online.spectator && p === online.me && mine) return mine;
    return coverOf(online.setup?.decks[p]);
  }
  return p === 'p1' && mine ? mine : coverOf(decks[p]);
}

/** รูปโปรไฟล์ในกรอบข้าวหลามตัด (ตัดภาพให้เต็มกรอบ ไม่เอียงตาม) */
export function DiamondAvatar({ cardNo, accent, className = 'h-14 w-14' }: { cardNo: string; accent: string; className?: string }) {
  return (
    <div className={`relative shrink-0 rotate-45 overflow-hidden border-2 bg-slate-950 ${className}`} style={{ borderColor: accent, boxShadow: `0 0 14px ${accent}88` }}>
      <div className="absolute top-1/2 left-1/2 h-[142%] w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-45">
        <AvatarImg cardNo={cardNo} className="h-full w-full" />
      </div>
    </div>
  );
}
