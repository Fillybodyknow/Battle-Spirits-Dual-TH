import { readFileSync } from 'node:fs';
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

export default defineConfig({
  // GitHub Pages เสิร์ฟที่ /<repo>/ (ตั้งผ่าน VITE_BASE ใน workflow) ในเครื่องใช้ '/'
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), versionFile()],
});
