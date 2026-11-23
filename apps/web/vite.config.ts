import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** เลขเวอร์ชันล่าสุดใน src/changelog.ts (รายการแรกของ CHANGELOG) */
function readAppVersion(): string {
  const src = readFileSync(fileURLToPath(new URL('./src/changelog.ts', import.meta.url)), 'utf8');
  const m = /version:\s*'([^']+)'/.exec(src);
  if (!m) throw new Error('หาเลขเวอร์ชันใน src/changelog.ts ไม่เจอ');
  return m[1]!;
}

/**
 * version.json = เวอร์ชันที่ deploy อยู่บนเว็บ แอปที่เปิดค้างไว้ดึงไฟล์นี้เป็นระยะเพื่อรู้ว่ามีเวอร์ชันใหม่
 * build: เขียนลง dist · dev: เสิร์ฟสด ๆ จาก changelog.ts
 */
function versionFile(): Plugin {
  return {
    name: 'bs-version-file',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0]?.endsWith('/version.json')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ version: readAppVersion() }));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: readAppVersion() }) });
    },
  };
}

/**
 * asset-manifest.json = รายชื่อไฟล์ทั้งหมดใน assets/ (ภาพการ์ด เสียง ฟอนต์ JS/CSS) พร้อมขนาด
 * ใช้กับ "ดาวน์โหลดข้อมูลเกมทั้งหมด" (src/gameData.ts) · เขียนหลัง build เสร็จ (ไฟล์ครบทุกตัวแล้ว)
 */
function assetManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'bs-asset-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    writeBundle() {
      const dir = join(outDir, 'assets');
      const files = readdirSync(dir)
        .filter((f) => statSync(join(dir, f)).isFile())
        .sort()
        .map((f) => ({ path: `assets/${f}`, size: statSync(join(dir, f)).size }));
      writeFileSync(join(outDir, 'asset-manifest.json'), JSON.stringify({ version: readAppVersion(), files }));
    },
  };
}

export default defineConfig({
  // GitHub Pages เสิร์ฟที่ /<repo>/ (ตั้งผ่าน VITE_BASE ใน workflow) ในเครื่องใช้ '/'
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), versionFile(), assetManifest()],
});
