/**
 * สร้าง apps/web/src/legacy-colors.css: สีของ Tailwind v4 ในรูป hex สำหรับเบราว์เซอร์ที่ไม่รู้จัก oklch()
 * (เช่น Chrome 109 บน Windows 7 ซึ่งพื้นหลัง/ตัวอักษรที่ใช้สีของ Tailwind จะหายเป็นโปร่งใส)
 *
 * ใช้: node scripts/legacy-colors.mjs  (รันใหม่เมื่ออัปเดต tailwindcss)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const themePath = join(dirname(require.resolve('tailwindcss/package.json')), 'theme.css');
const theme = readFileSync(themePath, 'utf8');

/** oklch → sRGB hex (สูตรของ CSS Color 4) */
function oklchToHex(l, c, h) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return (
    '#' +
    lin
      .map((x) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

const lines = [];
for (const m of theme.matchAll(/(--color-[a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) {
  const [, name, l, c, h] = m;
  lines.push(`    ${name}: ${oklchToHex(Number(l) / 100, Number(c), Number(h))};`);
}
if (lines.length < 200) throw new Error(`อ่านสีจาก ${themePath} ได้แค่ ${lines.length} สี`);

const dirs = { t: 'top', tr: 'top right', r: 'right', br: 'bottom right', b: 'bottom', bl: 'bottom left', l: 'left', tl: 'top left' };
const gradients = Object.entries(dirs)
  .map(([k, v]) => `  .bg-gradient-to-${k} { --tw-gradient-position: to ${v}; }`)
  .join('\n');

writeFileSync(
  'apps/web/src/legacy-colors.css',
  `/* สร้างโดย scripts/legacy-colors.mjs — ห้ามแก้เอง
 * เบราว์เซอร์เก่าที่ไม่รู้จัก oklch() (เช่น Chrome 109 บน Windows 7):
 *  - ใช้สีของ Tailwind เป็น hex แทน
 *  - ไล่สีโดยไม่ระบุ "in oklab" (ไม่งั้นทั้ง gradient ใช้ไม่ได้)
 */
@supports not (color: oklch(50% 0.1 180)) {
  :root, :host {
${lines.join('\n')}
  }
${gradients}
}
`,
);
console.log(`legacy-colors.css: ${lines.length} สี`);
