import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
// สีสำรองสำหรับเบราว์เซอร์ที่ไม่รู้จัก oklch() (สร้างด้วย npm run legacy-colors)
import './legacy-colors.css';
import { registerPwa } from './pwa';
import { installTouch } from './touch';
import { startUpdateCheck } from './version';

registerPwa();
installTouch();
startUpdateCheck();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
