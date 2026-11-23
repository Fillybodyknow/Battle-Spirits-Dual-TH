import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// ฟอนต์ฝังในแอป (ทุกเครื่องหน้าตาเหมือนกัน · ใช้ได้ตอนออฟไลน์)
import '@fontsource-variable/noto-sans-thai';
import './index.css';
// สีสำรองสำหรับเบราว์เซอร์ที่ไม่รู้จัก oklch() (สร้างด้วย npm run legacy-colors)
import './legacy-colors.css';
import { registerPwa } from './pwa';
import { installTouch } from './touch';
import { startUpdateCheck } from './version';
import { installGfx } from './gfx';
import { installDragCleanup } from './components/DragGhost';
import { installAccount } from './account/account';
import { checkGameData } from './gameData';

registerPwa();
installTouch();
startUpdateCheck();
installGfx();
installDragCleanup();
installAccount();
// ข้อมูลเกมที่ดาวน์โหลดไว้: เช็กหลังหน้าแรกโหลดเสร็จ (ไม่แย่งเน็ตกับหน้า Preload) · เลือกดาวน์โหลดไว้ = แพตช์ส่วนที่ขาดให้เอง
window.addEventListener('load', () => setTimeout(() => void checkGameData(), 4000));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
