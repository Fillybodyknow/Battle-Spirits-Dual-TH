/**
 * npm run thumbs: สร้างภาพการ์ดย่อสำหรับบนกระดาน/มือ/พัดการ์ด
 *   assets/images/cards/<ต้นรหัส>/<รหัส>.webp → assets/images/card-thumbs/<ต้นรหัส>/<รหัส>.webp (กว้าง THUMB_W px)
 * หน้าเว็บ (CardFace) ใช้ภาพย่อเมื่อการ์ดแสดงเล็กกว่าภาพย่อ ใหญ่กว่านั้น (ดูรายละเอียด / cut-in) สลับไปใช้ภาพเต็มเอง
 * สร้างเฉพาะภาพที่ยังไม่มี หรือภาพเต็มใหม่กว่าภาพย่อ · ลบภาพย่อที่ไม่มีภาพเต็มแล้ว
 * รันทุกครั้งที่เพิ่ม/เปลี่ยนภาพการ์ด (ไม่รัน = หน้าเว็บใช้ภาพเต็มแทน ไม่พัง แต่หนักกว่า)
 */
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** ความกว้างภาพย่อ (px): การ์ดบนกระดานกว้าง 112 px · ×2 จอความละเอียดสูง + เผื่อการ์ดในพัด/แผงเลือก */
export const THUMB_W = 360;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets/images/cards');
const OUT = join(root, 'assets/images/card-thumbs');

let made = 0;
let kept = 0;
let removed = 0;
const wanted = new Set();
for (const set of readdirSync(SRC)) {
  const dir = join(SRC, set);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) {
    if (!/\.(webp|png|jpe?g)$/i.test(f)) continue;
    const name = f.replace(/\.[^.]+$/, '') + '.webp';
    const out = join(OUT, set, name);
    wanted.add(join(set, name));
    const src = join(dir, f);
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
      kept++;
      continue;
    }
    mkdirSync(join(OUT, set), { recursive: true });
    await sharp(src).resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 75, effort: 6 }).toFile(out);
    made++;
  }
}
if (existsSync(OUT)) {
  for (const set of readdirSync(OUT)) {
    const dir = join(OUT, set);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!wanted.has(join(set, f))) {
        unlinkSync(join(dir, f));
        removed++;
      }
    }
  }
}
console.log(`card thumbs: สร้าง ${made}, คงเดิม ${kept}, ลบ ${removed} (กว้าง ${THUMB_W}px) → assets/images/card-thumbs`);
