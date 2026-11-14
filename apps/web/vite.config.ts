import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // GitHub Pages เสิร์ฟที่ /<repo>/ (ตั้งผ่าน VITE_BASE ใน workflow) ในเครื่องใช้ '/'
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
});
