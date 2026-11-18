/**
 * รูปโปรไฟล์ของผู้เล่นแต่ละที่นั่ง (ระหว่างเกม / ฉากเปิดเกม)
 * ออนไลน์ = รูปที่ผู้เล่นตั้งไว้ (rooms/<code>/avatars) · ไม่มี = รูปเริ่มต้น (ไม่ใช้หน้าปกเด็ค: ไม่เผยเด็คก่อนดวล)
 * เครื่องเดียว = ผู้เล่น 1 ใช้รูปของบัญชีนี้ ผู้เล่น 2 ใช้รูปเริ่มต้น
 */
import type { PlayerId } from '@bs/engine';
import { useAccount } from '../account/account';
import { deckCover } from '../screens/shared';
import { useGame, type DeckId } from '../store';
import { AvatarImg } from './AccountDialog';

/** รูปเริ่มต้น = ปก Starter Deck 02 (เหมือนป้ายโปรไฟล์หน้าแรก) · ส่งรหัสเด็คมา = หน้าปกเด็คนั้น */
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
  const mine = useAccount((s) => s.avatar);
  if (online) {
    const a = online.avatars[p];
    if (a) return a;
    if (!online.spectator && p === online.me && mine) return mine;
    return coverOf();
  }
  return p === 'p1' && mine ? mine : coverOf();
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
