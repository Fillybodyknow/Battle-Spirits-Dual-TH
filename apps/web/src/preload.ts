/**
 * โหลดของจริงระหว่างฉากวาร์ป "CONNECTING" หลังแตะเริ่มที่หน้าไตเติล (Login.tsx)
 *  1. ซิงก์บัญชีกับเซิร์ฟเวอร์ (เด็ค / การตั้งค่า / รูปโปรไฟล์) ให้หน้าหลักแสดงข้อมูลล่าสุดตั้งแต่แรก
 *  2. ถอดรหัสไฟล์เสียงประกอบทุกไฟล์ (เสียงแรกของแต่ละแบบไม่ดีเลย์)
 *  3. ภาพที่หน้าหลักแสดงทันที (ภาพการ์ดคู่ทางขวา, ปกเด็ค, รูปโปรไฟล์, ภาพหลังการ์ด/คอร์/เจ็ม)
 *  4. ฟอนต์
 * ความคืบหน้า = งานที่เสร็จ / งานทั้งหมด (ถ่วงน้ำหนัก) · งานที่ค้างนานเกิน TIMEOUT ถือว่าจบ (ไม่ให้ผู้เล่นติดหน้าโหลด)
 */
import { isXRare } from '@bs/cards';
import { account, useAccount } from './account/account';
import { GEM_IMG, IMG, cardArt } from './assets';
import { deckChoices } from './decks';
import { deckCover } from './screens/shared';
import { preloadSfx, sfxPreloadList } from './sfx';
import { db } from './store';

export type PreloadProgress = { done: number; total: number; label: string };

/** งานเดียวค้างได้ไม่เกินนี้ (ms) แล้วนับว่าเสร็จ (เน็ตช้ามาก: เข้าหน้าหลักได้ ส่วนที่ค้างโหลดต่อเบื้องหลัง เช่นเสียงถอดรหัสเก็บไว้เมื่อเสร็จ) */
const TIMEOUT = 15000;

const withTimeout = <T>(p: Promise<T>, ms = TIMEOUT): Promise<T | void> => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

/** โหลดภาพและถอดรหัสไว้ (เบราว์เซอร์เก็บใน cache ให้หน้าถัดไปแสดงทันที) */
function loadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => void img.decode().catch(() => {}).finally(resolve);
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** ภาพที่หน้าหลักใช้ทันที (ไม่ซ้ำ) */
function homeImages(): string[] {
  const urls: (string | undefined)[] = [IMG.cardBack, IMG.core, IMG.soulCore, IMG.playmat, ...Object.values(GEM_IMG)];
  // ภาพการ์ดคู่ทางขวา (ชุดแรก + ชุดถัดไปที่จะสลับมา) = ลำดับเดียวกับ useShowcase ใน Home.tsx
  const xr = db.all().filter((c) => isXRare(c) && cardArt(c.cardNo));
  urls.push(...xr.slice(0, 4).map((c) => cardArt(c.cardNo)));
  // ปกเด็ค (Starter + เด็คที่จัดเอง) และรูปโปรไฟล์
  for (const id of deckChoices()) urls.push(cardArt(deckCover(id)));
  const avatar = useAccount.getState().avatar;
  if (avatar) urls.push(cardArt(avatar));
  return [...new Set(urls.filter((u): u is string => !!u))];
}

/**
 * โหลดทั้งหมด · ต้องเรียกจาก event ที่ผู้ใช้กด (เสียงต้องสร้าง AudioContext ในจังหวะนั้น)
 * onProgress เรียกทุกครั้งที่งานย่อยเสร็จ · resolve เมื่อทุกงานจบ (สำเร็จ/ล้มเหลว/หมดเวลา)
 */
export async function preloadAll(onProgress: (p: PreloadProgress) => void): Promise<void> {
  const sounds = sfxPreloadList();
  // ซิงก์บัญชีก่อน: ปกเด็ค/รูปโปรไฟล์อาจเปลี่ยนตามข้อมูลจากเซิร์ฟเวอร์
  const SYNC_W = 6;
  let total = SYNC_W + sounds.length + 1;
  let done = 0;
  let label = 'เชื่อมต่อเซิร์ฟเวอร์';
  const report = () => onProgress({ done: Math.min(done, total), total, label });
  const tick = (w = 1) => {
    done += w;
    report();
  };
  report();

  // เสียงเริ่มโหลดพร้อมกับซิงก์เลย (ไม่ต้องรอกัน)
  const soundsDone = withTimeout(preloadSfx(sounds, () => tick()));
  const fonts = withTimeout(document.fonts?.ready ?? Promise.resolve()).then(() => tick());

  await withTimeout(account.syncNow().catch(() => {}));
  tick(SYNC_W);

  const images = homeImages();
  total += images.length;
  label = 'โหลดภาพ';
  report();
  const imagesDone = Promise.all(images.map((u) => withTimeout(loadImage(u)).then(() => tick())));

  label = 'โหลดภาพและเสียง';
  report();
  await Promise.all([soundsDone, fonts, imagesDone]);
  done = total;
  label = 'พร้อม';
  report();
}
