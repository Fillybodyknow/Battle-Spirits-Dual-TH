// นำการ์ดที่ถอดจากภาพไว้ใน cards-list/ เข้าเกม (ดู docs/cards-import.md)
//   node scripts/import-cards-list.cjs <ไฟล์.text> <ชุดในเกม> <โฟลเดอร์ภาพ>
//   เช่น node scripts/import-cards-list.cjs cards-list/BS24/ม่วง.text BS14 cards-list/BS24/ม่วง
// - แยกการ์ดตาม "ประเภท:" → ต่อท้าย assets/files/cards/<ต้นรหัส>/<Spirits|Ultimate|Brave|Nexus|Magic>.text
// - แทน "ชุด: ?" ด้วยชุดที่ระบุ
// - คัดลอกภาพ <โฟลเดอร์ภาพ>/<ต้นรหัส>-<เลข>.webp → assets/images/cards/<ต้นรหัส>/<รหัส>.webp
// รันซ้ำกับไฟล์เดิม = การ์ดซ้ำ (build-cards จะ error) ให้รันไฟล์ละครั้งเดียว แล้วรัน npm run cards / npm run thumbs
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..') + '/';
const [src, set, imgDir] = process.argv.slice(2);
if (!src || !set || !imgDir) {
  console.error('ใช้: node scripts/import-cards-list.cjs <ไฟล์.text> <ชุดในเกม เช่น BS14> <โฟลเดอร์ภาพ>');
  process.exit(1);
}
const text = fs.readFileSync(src, 'utf8').split('\r\n').join('\n');
const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
const FILE = { Spirit: 'Spirits.text', Ultimate: 'Ultimate.text', Brave: 'Brave.text', Nexus: 'Nexus.text', Magic: 'Magic.text' };
const out = {};
let images = 0;
for (const b of blocks) {
  const code = b.match(/^รหัส:\s*(\S+)/m)[1];
  const type = b.match(/^ประเภท:\s*(\S+)/m)[1];
  const prefix = code.split('-')[0];
  const body = b.replace(/^ชุด:\s*\?$/m, `ชุด: ${set}`);
  if (/^ชุด:\s*\?/m.test(body)) throw new Error('ชุด ' + code);
  const file = `assets/files/cards/${prefix}/${FILE[type]}`;
  (out[file] ??= []).push(body);
  const tail = code.slice(prefix.length + 1);
  const num = tail.replace(/^[A-Z]+(?=\d)/, '');
  const isX = /^X\d/.test(tail);
  const srcImg = path.join(imgDir, `${prefix}-${isX ? 'X' + num : num}.webp`);
  const dstDir = root + `assets/images/cards/${prefix}`;
  fs.mkdirSync(dstDir, { recursive: true });
  if (!fs.existsSync(srcImg)) throw new Error('ไม่มีภาพ ' + srcImg);
  fs.copyFileSync(srcImg, `${dstDir}/${code}.webp`);
  images++;
}
for (const [file, list] of Object.entries(out)) {
  const p = root + file;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\s*$/, '') + '\n\n' : '';
  fs.writeFileSync(p, prev + list.join('\n\n') + '\n');
  console.log(file, '+', list.length);
}
console.log('ภาพ', images);
