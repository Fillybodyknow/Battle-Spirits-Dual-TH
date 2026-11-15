# CLAUDE.md

คู่มือสำหรับ Claude ที่เปิดโปรเจกต์นี้ครั้งแรก อ่านไฟล์นี้ก่อนลงมือ

## แอปนี้คืออะไร

**Battle Spirits Dual TH**: เว็บแอปเล่นการ์ดเกม Battle Spirits ภาษาไทย (กติกายุค Double Drive) สองคน
เล่นเครื่องเดียวสลับกัน หรือดวลออนไลน์ผ่าน Firebase · ติดตั้งเป็นเว็บแอป (PWA) ได้ · เล่นบนคอม มือถือ และ iPad (แนวนอน)

- เว็บจริง: https://fillybodyknow.github.io/Battle-Spirits-Dual-TH/ (deploy อัตโนมัติเมื่อ push เข้า `main`)
- หน้าตาและฟีลการเล่นอ้างอิงแนว Yu-Gi-Oh Master Duel (เจ้าของโปรเจกต์ส่งภาพมาเทียบบ่อย) แต่ **ออกแบบเองทั้งหมด** ห้ามคัดลอกภาพ/โลโก้/asset ของเกมอื่น
- กติกาอ้างอิง: `assets/Battle Spirits — คู่มือกติกาเกมสำหรับวางโครงเว็บแอป.pdf`
- เจ้าของโปรเจกต์คุยภาษาไทย: ตอบเป็นภาษาไทย ข้อความใน UI และคอมเมนต์ในโค้ดเป็นภาษาไทย

## โครงสร้าง (npm workspaces, TypeScript, ESM)

```
packages/cards/    ข้อมูลการ์ด + ภาษาสคริปต์เอฟเฟกต์
  src/text-format.ts   ตัวแปลงไฟล์การ์ดภาษาไทย (.text) → JSON (import แค่ type: รันด้วย node ตรง ๆ ได้)
  src/abilities.ts     DSL เอฟเฟกต์ (Step / Condition / CardFilter / TriggerEvent / Ability) + attachScripts
  src/schema.ts, database.ts, deck.ts (validateDeck: ≥40 ใบ, ชื่อเดียวกัน ≤3), rarity.ts
  data/<set>.json, <set>-deck.json   สร้างจาก npm run cards (ห้ามแก้มือ)
  data/<set>-scripts.ts               สคริปต์เอฟเฟกต์ เขียนมือ ผูกกับการ์ดด้วย "ชื่อการ์ด"
packages/engine/   กฎเกมแบบ pure + deterministic: applyAction(state, action, db) → { state, events }
  src/game.ts    action handlers (summon, declareAttack, endMain, drawStep, …) + ลำดับสเต็ปในเทิร์น
  src/effects.ts คิวเอฟเฟกต์, trigger, การเลือกของผู้เล่น (PendingChoice), execStep/resolveChoice
  src/rules.ts   เลเวล, BP, matchesFilter, conditionHolds, ลดคอสต์ ฯลฯ
  src/ctx.ts     helper เปลี่ยน state (destroy, leaveField, loseLife, payCost, …)
  test/          vitest ตามชุดการ์ด (sd02…sd04, bs01, manual-draw, …)
apps/web/          React 19 + Vite + Tailwind v4 + Zustand
  src/store.ts     store กลาง: dispatch action, eventsToFx (แปลง event → ไทม์ไลน์แอนิเมชัน), holds, online
  src/decks.ts     Starter Deck + เด็คที่จัดเอง (localStorage) + รหัสเด็คแบบ "c:..." สำหรับส่งออนไลน์
  src/components/  Board, Fx (แอนิเมชันทั้งหมด), Controls (แถบกลาง/ตัวเลือก), Hud, MatchIntro, StepSelect, DrawPrompt, …
  src/screens/     Home, Lobby, DeckViewer, DeckBuilder
  src/online/      transport (Firebase / local) — ออนไลน์ = ส่ง action เข้าห้อง ทั้งสองเครื่อง apply ตามลำดับเดียวกัน
  src/touch.ts     จอสัมผัส: กดค้างดูการ์ด, ป้ายหมุนจอ, ล็อกแนวนอน
  index.html       สคริปต์ viewport: ย่อทั้งหน้าให้พอดีจอ (กระดาน 1280×860, หน้าเมนู ×640) บนมือถือ/iPad
assets/
  files/SD1.text … SD4.text   Starter Deck (การ์ด + รายการเด็คท้ายไฟล์)
  files/BS01/*.text           Booster Set (โฟลเดอร์ แยกไฟล์ตามประเภทได้)
  files/แม่แบบการ์ด.txt        แม่แบบการเขียนการ์ด (ไม่ถูกอ่านเป็นชุดการ์ด)
  images/cards/<ชุด>/<cardNo>.webp   ภาพการ์ด (โหลดอัตโนมัติด้วย glob ตามชื่อไฟล์ = cardNo)
scripts/build-cards.ts       npm run cards
scripts/legacy-colors.mjs    สร้าง apps/web/src/legacy-colors.css (สี hex สำรองให้ Chrome < 111)
```

## คำสั่ง

```sh
npm run dev -- --port 4352          # dev server (ใช้พอร์ตนี้เป็นประจำ)
npm run typecheck
npm run build -w @bs/web
npm run cards                        # แปลง assets/files → packages/cards/data (รันทุกครั้งที่แก้ไฟล์การ์ด)
cd /d && npx vitest run --root /d/Coding/Battle-Spirits-Dual-TH   # เทสต์ทั้งหมด (Windows: รันจากรากไดรฟ์แบบนี้)
```

ก่อนบอกว่าเสร็จ: typecheck + เทสต์ + build ต้องผ่าน และงาน UI ควรเปิดดูจริงในเบราว์เซอร์ (ดู "ทดสอบ UI")

## การ์ด: จากไฟล์ข้อความถึงเอฟเฟกต์ที่ทำงาน

1. **เขียนการ์ด** ใน `assets/files` (ดู `แม่แบบการ์ด.txt`) หัวข้อที่ไม่มีค่าไม่ต้องเขียน, เลเวลแบบสั้น `Lv1 1 3000`
   - ไฟล์ `SD1.text` → ชุด SD01 รหัส `SD01-001…` ตามลำดับ · โฟลเดอร์ `BS01/` → รหัส `BS01-SP-R001` (ชุด-ประเภท-ระดับ+เลข)
   - การ์ดหนึ่งใบเขียนข้อมูลเต็ม **ที่เดียว** (เช่นการ์ด Booster ที่อยู่ใน Starter Deck) อีกชุดใส่แค่ชื่อในรายการเด็ค · ชื่อ/รหัสซ้ำ = error
   - ฟอย: ในรายการเด็ค `ชื่อการ์ด 3 (ฟอยรุ้ง 1, ฟอยขาว 1)`
2. `npm run cards`
3. **เขียนสคริปต์** ใน `packages/cards/data/<set>-scripts.ts`: `Record<ชื่อการ์ด, CardScript>` ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i
   (array = บรรทัดเดียวหลายความสามารถ, `null` = ยังไม่รองรับ) · จำนวนช่องต้องเท่าจำนวนบรรทัด ไม่งั้น attachScripts โยน error
4. ชุดใหม่: เพิ่ม import + loader ใน `packages/cards/src/index.ts` และใส่ใน `loadAllCards()` (web ใช้ db รวมทุกชุด)
5. กลไกที่ DSL ยังไม่มี: เพิ่ม type ใน `abilities.ts` → จัดการใน `effects.ts` (execStep/resolveChoice) / `rules.ts` / `game.ts`
6. เขียนเทสต์ใน `packages/engine/test/<set>.test.ts` (ดู helper `setup/put/act/choose/passAll` ใน `bs01.test.ts`)

ถ้าข้อความการ์ดกำกวม: ตีความให้สมเหตุสมผล แล้ว **บอกเจ้าของโปรเจกต์ว่าตีความอะไรไว้** (เขาจะแก้ถ้าไม่ตรง)

## หลักของ engine

- `applyAction` ไม่แก้ state เดิม (clone ทุกครั้ง) และต้อง deterministic (สุ่มด้วย seed ใน state) — ออนไลน์พึ่งสิ่งนี้
- เอฟเฟกต์เข้าคิว `state.queue` ทำทีละ step · ต้องให้ผู้เล่นเลือก = ตั้ง `state.choice` แล้วหยุด รอ action `choose`
- trigger ที่เกิดจากเอฟเฟกต์ที่กำลังทำงานเข้าคิวต่อจากเอฟเฟกต์นั้นทันที · เอฟเฟกต์ที่เกิดพร้อมกันของผู้ควบคุมเดียวกัน = ถามลำดับ (choice kind `order`)
- `config.manualDraw` (หน้าเว็บเปิดไว้): Draw Step หยุดรอ action `drawStep` · เทสต์ใช้ค่าเริ่มต้น (จั่วเอง)
- เปลี่ยนลำดับ action ที่ engine คาดหวัง = ห้องออนไลน์ที่เล่นค้างอยู่จะเล่นต่อไม่ได้ (บอกเจ้าของโปรเจกต์ด้วย)

## หลักของหน้าเว็บ

- แอนิเมชันทั้งหมดมาจาก `eventsToFx` ใน store: event ของ engine → รายการ Fx ที่มี `delay` ตามไทม์ไลน์ `t`
  ค่าที่ต้องรอแอนิเมชัน (BP, เลเวล, Core ใหม่) ใช้ `holds` / `coreDelays` ไม่ให้โชว์ก่อนแอนิเมชันถึง
- ป้าย (banner) แสดงทีละอัน delay นับตอนขึ้นเป็นอันแรกของคิว · `isFxBlocking` = แอนิเมชันที่ต้องจบก่อนให้ผู้เล่นทำต่อ
- ฝั่งคู่แข่งหมุน 180° ทั้งแผ่น (Tailwind v4 `rotate-*` ใช้ CSS property `rotate` แยกจาก `transform`)
- จอสัมผัส: การลากของเบราว์เซอร์ใช้กับนิ้วไม่ได้ ทุกอย่างที่ลากได้ต้องมีทางแตะแทน (หน้าจัดเด็คใช้ pointer events ลากได้ทั้งเมาส์และนิ้ว)
- ไอคอนใช้ SVG ใน `components/Icon.tsx` (อีโมจิ/สัญลักษณ์พิเศษเป็นกล่องว่างบน Windows 7)
- สี Tailwind v4 เป็น `oklch()`: ถ้าอัปเดต Tailwind ให้รัน `npm run legacy-colors`
- โหมดออนไลน์: `?online=local` ใช้ transport ในเครื่อง (ทดสอบสองแท็บได้โดยไม่ต้องมี Firebase)

## ทดสอบ UI

ไม่มี Playwright: ใช้ headless Edge ผ่าน Chrome DevTools Protocol ด้วยสคริปต์ node สั้น ๆ (เก็บใน scratchpad ไม่ใช่ในโปรเจกต์)
- เปิด `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe --headless=new --remote-debugging-port=<port>`
- `window.__game` = Zustand store (เช่น `__game.getState().startLocal({ p1: 'sd01', p2: 'sd03' })`)
- จำลองมือถือ: `Emulation.setDeviceMetricsOverride` (844×390, mobile, screenOrientation) + `Emulation.setTouchEmulationEnabled`
- ถ่ายภาพหน้าจอแล้วเปิดดูเอง อย่าเชื่อแค่ว่าโค้ดคอมไพล์ผ่าน · ปิด dev server/เบราว์เซอร์เมื่อเสร็จ

## กับดักที่เจอแล้ว (Windows + Git Bash)

- **อย่าแก้ไฟล์ด้วย `node -e "…"` หรือ heredoc ที่มี backtick / `${}` / `$`**: shell กินตัวอักษรทำให้โค้ดพัง
  ใช้ Edit tool หรือเขียนสคริปต์ `.cjs` ด้วย Write tool แล้วรัน · ในสคริปต์แทนข้อความด้วย `s.split(a).join(b)`
  **ห้าม** `s.replace(a, b)` ที่ b มี `$` (`` $` `` / `$&` ถูกตีความ → เคยทำให้ไฟล์ซ้ำทั้งก้อน)
- ไฟล์ปนกันระหว่าง CRLF/LF: สคริปต์แก้ไฟล์ควร normalize `\r\n` ก่อนค้นหา แล้วคืนแบบเดิม
- `scripts/build-cards.ts` รันด้วย node (type stripping): import ภายใน packages ต้องมีนามสกุล `.ts` และ import ค่าได้เฉพาะไฟล์ที่ไม่ import ต่อแบบไม่มีนามสกุล
- ไฟล์ข้อมูลใน `packages/cards/data/*.json` สร้างใหม่ทุกครั้งที่ `npm run cards` — แก้ที่ `.text` เสมอ

## Git / deploy

- commit และ push **เฉพาะเมื่อเจ้าของโปรเจกต์สั่ง** (มักพูดว่า "commit และ push ขึ้นเว็บ") ทำงานบน `main`
- หลัง push: GitHub Actions รันเทสต์ + build + deploy Pages · รอผลจาก
  `https://api.github.com/repos/Fillybodyknow/Battle-Spirits-Dual-TH/actions/runs?head_sha=<sha>` แล้วรายงาน
- ค่า Firebase อยู่ใน environment variables ของ GitHub (`VITE_FIREBASE_*`) ไม่อยู่ใน repo
