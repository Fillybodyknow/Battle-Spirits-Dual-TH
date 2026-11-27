// โพสต์ changelog ของเวอร์ชันใหม่เข้าห้อง "อัปเดตเกม" ใน Discord (GitHub Actions เรียกหลัง deploy สำเร็จ)
//   DISCORD_UPDATE_WEBHOOK = Webhook ของห้องอัปเดตเกม (GitHub Secret · ไม่ตั้ง = ข้าม)
//   SITE_URL = ลิงก์เว็บ (ใส่ในโพสต์)
// โพสต์เฉพาะเวอร์ชันที่ใหม่กว่า changelog ของ commit ก่อนหน้า (รัน deploy ซ้ำ = ไม่โพสต์ซ้ำ)
// ทดสอบในเครื่อง: node scripts/post-update.mjs --dry (พิมพ์ข้อความที่จะส่ง ไม่ส่งจริง)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FILE = 'apps/web/src/changelog.ts';
const dry = process.argv.includes('--dry');
const webhook = process.env.DISCORD_UPDATE_WEBHOOK ?? '';
const site = process.env.SITE_URL ?? '';

/** อ่านรายการ changelog จากข้อความไฟล์ (ไฟล์นี้ไม่ import อะไร: อ่านด้วยการหาข้อความแบบเดียวกับ vite.config) */
function parse(src) {
  const body = src.slice(src.indexOf('export const CHANGELOG'));
  const out = [];
  const re = /version:\s*'([^']+)',\s*date:\s*'([^']+)',\s*items:\s*\[([\s\S]*?)\n\s*\],?\s*\n\s*\}/g;
  let m;
  while ((m = re.exec(body))) {
    const items = [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
    out.push({ version: m[1], date: m[2], items });
  }
  // รายการ items บรรทัดเดียว: items: ['...'],
  if (out.length === 0 || !out[0].items.length) {
    const re1 = /version:\s*'([^']+)',\s*date:\s*'([^']+)',\s*items:\s*\[([^\]]*)\]/g;
    const alt = [];
    while ((m = re1.exec(body))) alt.push({ version: m[1], date: m[2], items: [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]) });
    if (alt.length && (!out.length || alt[0].version === out[0].version || !out[0].items.length)) return alt;
  }
  return out;
}

const cmp = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

const now = parse(readFileSync(FILE, 'utf8'));
if (!now.length) {
  console.log('อ่าน changelog ไม่ได้: ข้าม');
  process.exit(0);
}
let prevTop = null;
try {
  const prev = parse(execSync(`git show HEAD~1:${FILE}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  prevTop = prev[0]?.version ?? null;
} catch {
  console.log('ไม่มี commit ก่อนหน้าให้เทียบ: โพสต์เฉพาะเวอร์ชันบนสุด');
}
const fresh = (prevTop ? now.filter((e) => cmp(e.version, prevTop) > 0) : now.slice(0, 1)).slice(0, 3).reverse();
if (fresh.length === 0) {
  console.log(`เวอร์ชันไม่เปลี่ยน (${now[0].version}): ไม่โพสต์`);
  process.exit(0);
}

const kind = (v, prev) => {
  if (!prev) return 'อัปเดต';
  const [a, b] = [v.split('.').map(Number), prev.split('.').map(Number)];
  return a[0] !== b[0] ? 'อัปเดตใหญ่' : a[1] !== b[1] ? 'อัปเดต' : 'แก้ไข';
};
const thDate = (d) => {
  const [y, mo, da] = d.split('-').map(Number);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${da} ${months[mo - 1]} ${y + 543}`;
};
let before = prevTop;
const embeds = fresh.map((e) => {
  const k = kind(e.version, before);
  before = e.version;
  let desc = e.items.map((t) => `• ${t}`).join('\n');
  if (desc.length > 3900) desc = desc.slice(0, 3900) + '\n…';
  return {
    title: `${k} v${e.version}`,
    ...(site ? { url: site } : {}),
    description: desc,
    color: k === 'อัปเดตใหญ่' ? 0xf59e0b : k === 'อัปเดต' ? 0x38bdf8 : 0x94a3b8,
    footer: { text: `Battle Spirits Dual TH · ${thDate(e.date)}` },
  };
});
const payload = {
  username: 'อัปเดตเกม · Battle Spirits Dual TH',
  content: site ? `เปิดเกมใหม่เพื่อรับอัปเดต (หรือกดปุ่มอัปเดตที่ขึ้นในเกม) · ${site}` : '',
  embeds,
  allowed_mentions: { parse: [] },
};

if (dry) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}
if (!webhook.startsWith('https://')) {
  console.log('ยังไม่ได้ตั้ง DISCORD_UPDATE_WEBHOOK: ข้าม');
  process.exit(0);
}
const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
if (!res.ok) {
  console.log(`::warning::โพสต์อัปเดตเข้า Discord ไม่สำเร็จ (${res.status}): ${(await res.text()).slice(0, 300)}`);
  process.exit(0);
}
console.log(`โพสต์อัปเดต ${fresh.map((e) => e.version).join(', ')} เข้า Discord แล้ว`);
