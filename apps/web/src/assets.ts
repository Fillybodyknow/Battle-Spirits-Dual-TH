/** รูปจาก assets/images ของโปรเจค (Vite ใส่ hash ให้ตอน build) */
import cardBack from '../../../assets/images/app/BS_back.webp';
import core from '../../../assets/images/app/core.webp';
import soulCore from '../../../assets/images/app/soul-core.webp';

/** ภาพแผ่นรองเล่น (ไม่บังคับ): วางไฟล์ assets/images/app/playmat.webp|png|jpg แล้วจะใช้เป็นพื้นสนามแทนลายเริ่มต้น */
const playmatFiles = import.meta.glob('../../../assets/images/app/playmat.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const playmat: string | undefined = Object.values(playmatFiles)[0];

export const IMG = { cardBack, core, soulCore, playmat };

/**
 * ภาพการ์ด: assets/images/cards/<ชุด>/<cardNo>.webp|png|jpg (เช่น SD01/SD01-001.webp)
 * โหลดอัตโนมัติทุกไฟล์ในโฟลเดอร์ ชื่อไฟล์ (ไม่รวมนามสกุล) = cardNo
 */
const cardImages = import.meta.glob('../../../assets/images/cards/**/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const CARD_ART: Record<string, string> = {};
for (const [path, url] of Object.entries(cardImages)) {
  const cardNo = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  CARD_ART[cardNo] = url;
}

/** URL ภาพของการ์ด หรือ undefined ถ้ายังไม่มีภาพ */
export const cardArt = (cardNo: string): string | undefined => CARD_ART[cardNo];
