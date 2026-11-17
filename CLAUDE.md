# CLAUDE.md

คู่มือสำหรับ Claude ที่เปิดโปรเจกต์นี้ครั้งแรก อ่านไฟล์นี้ก่อนลงมือ

## แอปนี้คืออะไร

**Battle Spirits Dual TH**: เว็บแอปเล่นการ์ดเกม Battle Spirits ภาษาไทย (กติกายุค Double Drive) สองคน
เล่นเครื่องเดียวสลับกัน หรือดวลออนไลน์ผ่าน Firebase · ติดตั้งเป็นเว็บแอป (PWA) ได้ · เล่นบนคอม มือถือ และ iPad (แนวนอน)

- เว็บจริง: https://fillybodyknow.github.io/Battle-Spirits-Dual-TH/ (deploy อัตโนมัติเมื่อ push เข้า `main`)
- หน้าตาและฟีลการเล่นอ้างอิงแนว Yu-Gi-Oh Master Duel (เจ้าของโปรเจกต์ส่งภาพมาเทียบบ่อย) แต่ **ออกแบบเองทั้งหมด** ห้ามคัดลอกภาพ/โลโก้/asset ของเกมอื่น
- **กติกา: `docs/rules/`** (เจ้าของโปรเจกต์รวบรวม 14 เรื่อง, สารบัญใน README) อ่านส่วนที่เกี่ยวข้องก่อนแก้ engine หรือเขียนสคริปต์การ์ด
  อ้างในคอมเมนต์/เทสต์ด้วยเลขไฟล์ + ข้อ (`// กติกา 02 ข้อ 6.1`)
  เอกสารเดิม: `assets/Battle Spirits — คู่มือกติกาเกมสำหรับวางโครงเว็บแอป.pdf` (ขัดกันให้ถือ `docs/rules/`)
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
docs/rules/        กติกาเกม 14 เรื่อง (README = สารบัญ)
assets/
  files/SD1.text … SD4.text   Starter Deck (การ์ด + รายการเด็คท้ายไฟล์)
  files/BS01/ … BS04/*.text   Booster Set (โฟลเดอร์ แยกไฟล์ตามประเภทได้) — การ์ดของ SD01–SD04 เขียนเต็มไว้ที่นี่ (SD*.text เหลือแค่รายการเด็ค)
                              สคริปต์ของการ์ดที่อยู่ใน Starter ด้วย: `...SD0n_SCRIPTS` ใน bs0n-scripts.ts
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

### กลไกที่มีใน DSL แล้ว (ดู type เต็มใน `abilities.ts`) — เช็กก่อนเพิ่มของใหม่

- **trigger (`on`)**: summon, attack, block, destroyed / destroyedByOpponent / depletedByOpponent (ถูกถอดคอร์จนสูญสลาย),
  allyDestroyed (subject: soul / byOpponent), allyExhausted / oppExhausted (รวมตอนโจมตี/ป้องกัน), lifeLost (step `draw.perLifeLost`),
  endStep, oppAttackStepStart, oppDrew, oppBurstActivated (`zone: 'hand'`), allySummoned (subject: fromTrash / minCost / paidWithSoul)
  · ตัวเลือกของ trigger: `ownTurnOnly`, `oppTurnOnly`, `attackStepOnly`, `mainStepOnly`, `granted` (Brave), `if`
- **ability kind ถาวร**: staticBp, extraSymbol (`granted` ได้), symbolAlsoColor, summonSymbol, costBoost, levelCostBoost,
  trashCost / trashCostAll (`zone: 'hand'` = คอสต์ในมือ), opponentNoRefresh, coreRemovalImmune, handImmune, quickAnyCores, burstAlsoOn,
  replaceDestroy (`mill` / `millSelf` / `discard`), drawStep (`before` = ก่อนจั่ว + step `addDrawStepDraw`)
- **กดใช้เอง**: `activated` (Flash ของการ์ดบนสนาม, `maxPerTurn`), `trashSummon` (อัญเชิญจากแทรช), evolution, quick
- **ในการต่อสู้นี้**: restrictBlockers, battleNoFlash, battleNoBurst, lifeOnBattlerGone, refreshOnBattleWin, chooseBlockers (`filter`)
- **ในเทิร์นนี้**: buffAllies (`state.turnBuffs` ตัวที่ลงทีหลังก็ได้), opponentCannotAttack, turnTrigger · ล็อกฟื้นสภาพ: `exhaustOpponent.lockRefresh`
- **คอสต์**: `baseCost` (คอสต์ในมือ/แทรช), `fieldCost` (บนสนาม: รวมคอสต์ Brave ที่ร่วมร่าง + costBoost; filter `ignoreBraveCost`),
  `destroyChosenOpponent.costFrom` ('self' / 'subject')
- **เงื่อนไขเฉพาะ trigger อัญเชิญ**: `summonedFromDeck` (ตรวจใน `holds` ของ effects.ts ใช้ซ้อนใน `all`/`not` ไม่ได้)
- **BS04**: `effectImmune` (Ultra Shield / "ไม่รับผลเอฟเฟกต์...ของคู่แข่ง" ตามสี/ประเภทการ์ดต้นเหตุ ตรวจด้วย `effectBlocked` = ตัวช่วย `hits()` ใน execStep
  ทุก step ที่เลือก/ทำกับการ์ดคู่แข่งต้องกรองด้วย `hits`), `bounceOpponent` (`to`: มือ/บนสุด/ใต้สุดเด็ค, `anySide`, `costFrom`) / `bounceAllOpponent` / `bounceToBottom`,
  `blockWhileExhausted`, `battleUnblockable` / `unblockableThisTurn`, `battleNoHandFlash`, `battleStaysOnDestroy`, `useMagicFromHandFree`, `handCostDelta`,
  `negateOpponentNexus`, trigger `oppEndStep` / `oppHandIncreased` / `oncePerTurnByName`, เงื่อนไข `noLifeDamageThisTurn` / `oppTurn` / `selfInBattle` / `attackerFamily`
- **BS05**: `alsoMagic` / `grantMagic` (สปิริตใช้เป็นเมจิคได้ = `handMagic` ใน rules.ts, ใน store ใช้ `handMagicTimings`), `cannotAttack`, `voidFromLife`,
  Charge (`charged` + `bpMinusBoost` / `coreRemovalBoost` = `chargeBonus`), ล็อกโจมตี/ป้องกัน `disableChosenOpponent` (`state.turnLocks`), `negateOpponentsThisTurn` (`effectsLost`),
  `battleExhaustedBlock`, `blockTax`, `battleColorless`, `symbolsZeroThisTurn`, เบิร์ส `afterOpponentAttack`, trigger `unblocked` / `oppAttack` / `startStep` / `milledAny`,
  เน็กซัสถูกวาง = trigger `summon`, `activated.granted` (Flash ที่เบรฟให้ร่างหลัก),
  `destroyRefreshedByEffect` (ฟื้นสภาพด้วยเอฟเฟกต์ต้องผ่าน `refreshByEffect` ใน effects.ts เสมอ),
  `braveNotCounted` (เบรฟไม่นับในจำนวนเบรฟของผู้ร่วมร่าง: `braveRoom` / `braveToSwap`), subject `fromHand` (ใช้เมจิคจากในมือ ไม่ใช่นอกมือ)
- **BP0 ไม่ถูกทำลายเอง** (เจ้าของโปรเจกต์กำหนด): ทำลายเฉพาะการ์ดที่เขียน "ทำลาย…ที่กลายเป็น BP0" = `debuffChosenOpponent.destroyAtZero`
- **ย้ายการ์ดไปเขียนเต็มที่ชุดอื่น = รหัสการ์ดเปลี่ยน**: เพิ่มรหัสเดิม → รหัสใหม่ใน `packages/cards/src/legacy-card-no.ts`
  (เด็คที่ผู้เล่นจัดไว้ / รหัสเด็คออนไลน์แปลงตอนโหลดด้วย `migrateEntries` ใน decks.ts) ไม่งั้นเด็คเก่าหาการ์ดไม่เจอ

ถ้าข้อความการ์ดกำกวม: ตีความให้สมเหตุสมผล แล้ว **บอกเจ้าของโปรเจกต์ว่าตีความอะไรไว้** (เขาจะแก้ถ้าไม่ตรง)

### รูปประโยคเอฟเฟกต์ → วิธีเขียนสคริปต์ (กติกาจากเจ้าของโปรเจกต์ ดูฉบับเต็มใน `docs/rules/13-รวมข้อควรทราบ.md`)

| รูปประโยค | ความหมาย | สคริปต์ |
|---|---|---|
| ทั่วไป "เสื่อมสภาพ…2 ตัว" | บังคับ ทำเท่าที่ทำได้ | step ตรง ๆ (ไม่มีเป้าหมาย = ข้าม) |
| "สามารถ…" | เลือกไม่ใช้ได้ แต่ถ้าใช้ต้องทำเต็มที่เท่าที่ทำได้ (มี 3 ตัว ใช้ "2 ตัว" จะทำแค่ 1 ไม่ได้) | `chooseOne` [ทำ, ไม่ใช้] |
| "สามารถ X เพื่อ Y" | ต้องทำได้ **ทั้งสองท่อน** ไม่งั้นไม่เกิดทั้งคู่ | `chooseOne` + `options[].if` ตรวจทั้ง X และ Y (`opponentHas`, `deckAtLeast`, `handAtLeast`, `alliesAtLeast`, `selfCoresAtLeast`…) ตัวเลือกที่ทำไม่ได้จะไม่แสดง ถ้าเหลือแต่ "ไม่ใช้" = ไม่ถาม |
| "…หลังจากเอฟเฟกต์นี้ทำงาน…" | ทำตามลำดับ ท่อนหน้าทำไม่ได้ ท่อนหลังก็ยังเกิด และมีจังหวะให้เอฟเฟกต์ที่รออยู่ทำงานก่อน | steps ต่อกัน (เช่น `summonThisFree`) |
| "…หลังจากนั้น…" | เหมือนข้างบน แต่ทำต่อเนื่องทันที | steps ต่อกัน |
| "ในเทิร์นนี้…" | ติดจนจบเทิร์นแม้ตัวที่ให้ผลออกจากสนามแล้ว ถ้าเป็น "ทั้งหมด" ตัวที่ลงมาใหม่ในเทิร์นก็โดนด้วย | `buffAllies` (เก็บใน `state.turnBuffs`), `opponentCannotAttack` (`attackBans`) |
| "ในเกมนี้…" | ติดจนจบเกม | ยังไม่มี step |
| "…หรือ…" | เลือกทำอย่างใดอย่างหนึ่ง | `chooseOne` (ใส่ `if` ให้ตัวเลือกที่ไม่มีเป้าหมาย) |
| "ไม่เกิน N" | รวม N | `maxBp` / `maxCost` / `lifeAtMost` |
| "…เมื่อเป็นเช่นนั้น…" | ท่อนหน้าต้องทำได้จริงก่อน ท่อนหลังถึงเกิด | `ifDestroyed` / ตรวจใน engine (เช่น `replaceDestroy.mill` ต้องทิ้งเด็คได้ครบ) |

## หลักของ engine

- `applyAction` ไม่แก้ state เดิม (clone ทุกครั้ง) และต้อง deterministic (สุ่มด้วย seed ใน state) — ออนไลน์พึ่งสิ่งนี้
- เอฟเฟกต์เข้าคิว `state.queue` ทำทีละ step · ต้องให้ผู้เล่นเลือก = ตั้ง `state.choice` แล้วหยุด รอ action `choose`
- trigger ที่เกิดจากเอฟเฟกต์ที่กำลังทำงานเข้าคิวต่อจากเอฟเฟกต์นั้นทันที · เอฟเฟกต์ที่เกิดพร้อมกันของผู้ควบคุมเดียวกัน = ถามลำดับ (choice kind `order`)
- เอฟเฟกต์ที่ผู้เล่นกดใช้เอง: [Evolution] = action `evolve`, เอฟเฟกต์ Flash ของการ์ดบนสนาม (ability `activated`) = action `activate`,
  อัญเชิญจากแทรช (ability `trashSummon`) = action `summon` ที่ cardId อยู่ในแทรช · ของใหม่แบบนี้ต้องเพิ่มใน `responseOptions` (store) ด้วย ไม่งั้น AUTO จะ pass Flash ข้ามไป
- `config.manualDraw` (หน้าเว็บเปิดไว้): Draw Step หยุดรอ action `drawStep` · เทสต์ใช้ค่าเริ่มต้น (จั่วเอง)
- เปลี่ยนลำดับ action ที่ engine คาดหวัง = ห้องออนไลน์ที่เล่นค้างอยู่จะเล่นต่อไม่ได้ (บอกเจ้าของโปรเจกต์ด้วย)

## หลักของหน้าเว็บ

- แอนิเมชันทั้งหมดมาจาก `eventsToFx` ใน store: event ของ engine → รายการ Fx ที่มี `delay` ตามไทม์ไลน์ `t`
  ค่าที่ต้องรอแอนิเมชัน (BP, เลเวล, Core ใหม่) ใช้ `holds` / `coreDelays` ไม่ให้โชว์ก่อนแอนิเมชันถึง
- ป้าย (banner) แสดงทีละอัน delay นับตอนขึ้นเป็นอันแรกของคิว · `isFxBlocking` = แอนิเมชันที่ต้องจบก่อนให้ผู้เล่นทำต่อ
- ฝั่งคู่แข่งหมุน 180° ทั้งแผ่น (Tailwind v4 `rotate-*` ใช้ CSS property `rotate` แยกจาก `transform`)
- จอสัมผัส: การลากของเบราว์เซอร์ใช้กับนิ้วไม่ได้ ทุกอย่างที่ลากได้ต้องมีทางแตะแทน (หน้าจัดเด็คใช้ pointer events ลากได้ทั้งเมาส์และนิ้ว)
- **การตัดสินใจระหว่างเกมทำบนกระดาน ไม่ใช้ Modal** (เจ้าของโปรเจกต์ต้องการเห็นสนามตลอด):
  เลือกการ์ดนอกสนาม (เด็ค/แทรช) = พัดการ์ด `RevealFan` · จ่ายคอสต์/วาง Core = คลิก Core บนกระดาน + แถบ `PromptBar`
  · อัญเชิญด้วยเอฟเฟกต์ทุกแบบ (เบิร์ส/มือ/เด็ค/แทรช) ใช้แผง `SummonPanel` ที่มุมสนาม (การ์ด, ปุ่ม Lv, ผล Lv/BP, คำเตือนสูญสลาย)
  · อัญเชิญหลายใบ (choice `multiSummon`) = `store.multi`: เลือกจากพัด → วาง Core / คลิกผู้ร่วมร่างทีละใบ → ส่งทีเดียว
  · เล่นการ์ดจากมือ/แทรชตามปกติ (`PlayDialog.tsx`) = แผงที่มุมสนามเหมือนกัน: Core ที่จะจ่าย/วางอยู่ใน `store.playCores` (Core บนกระดานแสดงวงสี คลิกเพื่อสลับ)
- ตั้งค่าการเล่นของผู้เล่น (ยืนยันโจมตี, เรียง/จับการ์ดในมือ, คลิกเดียวเล่น) อยู่ใน `src/prefs.ts` (localStorage, ไม่กระทบ engine)
- Chain นอกการต่อสู้: นับเอฟเฟกต์ตั้งแต่ action ล่าสุดของผู้เล่น (`chainFloor` ใน store, ไม่นับ choose/passFlash/moveCores)
- ไอคอนใช้ SVG ใน `components/Icon.tsx` (อีโมจิ/สัญลักษณ์พิเศษเป็นกล่องว่างบน Windows 7)
- สี Tailwind v4 เป็น `oklch()`: ถ้าอัปเดต Tailwind ให้รัน `npm run legacy-colors`
- โหมดออนไลน์: `?online=local` ใช้ transport ในเครื่อง (ทดสอบสองแท็บได้โดยไม่ต้องมี Firebase)
- หน้า DUEL (`screens/Lobby.tsx`, screen `'lobby'`): เมนูการดวล → Room Match → สร้างห้อง / รายการห้อง → หน้าห้อง
  ห้องดวล (`store.duel`, ฟังก์ชัน `duel*` ใน store) อยู่ที่ `rooms/<code>` = `DuelRoom`: สมาชิก ≤6 (`members`, ลบเองเมื่อหลุด), โต๊ะ (`tables/<n>`: seats / ready / game)
  ทั้งสองที่นั่งกดพร้อม → เครื่องที่นั่ง p1 สร้างห้องเกม `rooms/<code>-<id>` (โครงสร้างห้องเกม 2 คนเดิม: setup/actions) แล้วตั้ง `tables/<n>/game`
  ผู้เล่นทั้งสองเข้าด้วย `enterRoom` เดิม · ผู้ชม = `enterRoom(..., spectator)` (`online.spectator`: mine/controls เป็น false, มือคว่ำทั้งสองฝ่าย)
  ผู้เล่นออกจากเกม = โต๊ะกลับไปรอพร้อมใหม่ · รายการห้องอยู่ที่ `lobby/<code>` (count/max) · โหมด `?online=local` ใช้ path tree ใน localStorage
  กฎ Realtime Database อยู่ที่ `database.rules.json` (+ `firebase.json`) ไม่ได้ deploy อัตโนมัติ: แก้ path ใหม่ใน DB ต้องแก้ไฟล์นี้
  แล้วให้เจ้าของโปรเจกต์วางใน Firebase Console → Realtime Database → Rules (หรือ `npx firebase-tools deploy --only database`)
  ไม่งั้น path ใหม่ถูกปฏิเสธ (เช่น `lobby` ใช้ไม่ได้ = รายการห้องว่าง แต่เข้าด้วยรหัสยังได้)

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

## เวอร์ชัน / Changelog

- เลขเวอร์ชันและ Changelog อยู่ที่ `apps/web/src/changelog.ts` ที่เดียว (เวอร์ชันของแอป = รายการบนสุดของ `CHANGELOG`)
- **ทุกครั้งที่จะ push ของที่ผู้เล่นเห็นได้ขึ้นเว็บ**: เพิ่มรายการใหม่บนสุด (PATCH = แก้บั๊ก, MINOR = ของใหม่,
  MAJOR = เปลี่ยนใหญ่/ลำดับ action ของ engine เปลี่ยนจนเล่นออนไลน์กับเวอร์ชันเก่าไม่ได้) เขียนเป็นภาษาไทยแบบที่ผู้เล่นอ่านเข้าใจ
  แล้วให้เจ้าของโปรเจกต์ดูข้อความก่อน commit
- build เขียน `version.json` (vite.config.ts อ่านเลขจาก changelog.ts) แอปที่เปิดค้างไว้เช็กไฟล์นี้ทุก 10 นาที/ตอนกลับมาที่แท็บ
  ถ้าใหม่กว่า = ขึ้นป้ายให้อัปเดต · เปิดเวอร์ชันใหม่ครั้งแรก = เด้ง "มีอะไรใหม่" (`version.ts`, `components/Updates.tsx`)
- Service Worker (`public/sw.js`) ห้าม cache `version.json`
- ห้องออนไลน์เก็บเวอร์ชันของแต่ละที่นั่ง (`rooms/<code>/versions`, เขียนแยกหลังสร้าง/เข้าห้อง): MAJOR ไม่ตรง = เข้าห้องไม่ได้ / เจ้าของห้องเห็นคำเตือน
  ดังนั้นการแก้ engine ที่ทำให้ผลการเล่นเปลี่ยน **ต้องขึ้น MAJOR** ไม่งั้นคนละเวอร์ชันจะเข้าห้องเดียวกันแล้วเดินไม่ตรงกัน

## Git / deploy

- commit และ push **เฉพาะเมื่อเจ้าของโปรเจกต์สั่ง** (มักพูดว่า "commit และ push ขึ้นเว็บ") ทำงานบน `main`
- หลัง push: GitHub Actions รันเทสต์ + build + deploy Pages · รอผลจาก
  `https://api.github.com/repos/Fillybodyknow/Battle-Spirits-Dual-TH/actions/runs?head_sha=<sha>` แล้วรายงาน
- ค่า Firebase อยู่ใน environment variables ของ GitHub (`VITE_FIREBASE_*`) ไม่อยู่ใน repo
