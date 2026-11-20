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

registerPwa();
installTouch();
startUpdateCheck();
installGfx();
installDragCleanup();
installAccount();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
