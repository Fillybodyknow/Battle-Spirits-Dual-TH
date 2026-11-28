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
- **งานค้าง: นำการ์ด BS24 / BSC15 / BSC16 เข้าเกมทีละสี** — อ่าน `docs/cards-import.md` (แผนชุด BS14–BS15 + BSC01–BSC02, ความคืบหน้า, ขั้นตอน, คำที่ตกลงแล้ว) วัตถุดิบอยู่ใน `cards-list/`
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
  files/cards/<ต้นรหัส>/*.text  การ์ดทั้งหมด แยกโฟลเดอร์ตามต้นรหัสที่พิมพ์บนการ์ด (BS31/, SD32/, BSC23/, PX/ …) แยกไฟล์ตามประเภทได้
                              ทุกใบมี "รหัส:" + "ชุด:" (ชุดในเกม BS01… ที่การ์ดอยู่ → data/<ชุด>.json + สคริปต์ <ชุด>-scripts.ts)
  files/SD1.text … SD4.text   Starter Deck (รายการเด็คอย่างเดียว อ้างชื่อการ์ดจาก cards/)
                              สคริปต์ของการ์ดที่อยู่ใน Starter ด้วย: `...SD0n_SCRIPTS` ใน bs0n-scripts.ts
  files/แม่แบบการ์ด.txt        แม่แบบการเขียนการ์ด (ไม่ถูกอ่านเป็นชุดการ์ด)
  images/cards/<ต้นรหัส>/<cardNo>.webp   ภาพการ์ด (โฟลเดอร์ตามต้นรหัสเหมือนไฟล์การ์ด) (โหลดอัตโนมัติด้วย glob ตามชื่อไฟล์ = cardNo)
  images/card-thumbs/                 ภาพย่อกว้าง 360px จาก npm run thumbs (CardFace ใช้เมื่อแสดงเล็กกว่าภาพย่อ ใหญ่กว่านั้นสลับเป็นภาพเต็มเอง)
scripts/build-cards.ts       npm run cards
scripts/legacy-colors.mjs    สร้าง apps/web/src/legacy-colors.css (สี hex สำรองให้ Chrome < 111)
```

## คำสั่ง

```sh
npm run dev -- --port 4352          # dev server (ใช้พอร์ตนี้เป็นประจำ)
npm run typecheck
npm run build -w @bs/web
npm run cards                        # แปลง assets/files → packages/cards/data (รันทุกครั้งที่แก้ไฟล์การ์ด)
npm run thumbs                       # สร้างภาพการ์ดย่อ (รันทุกครั้งที่เพิ่ม/เปลี่ยนภาพการ์ด · ไม่รัน = ใช้ภาพเต็มแทน ไม่พังแต่หนักกว่า)
cd /d && npx vitest run --root /d/Coding/Battle-Spirits-Dual-TH   # เทสต์ทั้งหมด (Windows: รันจากรากไดรฟ์แบบนี้)
```

ก่อนบอกว่าเสร็จ: typecheck + เทสต์ + build ต้องผ่าน และงาน UI ควรเปิดดูจริงในเบราว์เซอร์ (ดู "ทดสอบ UI")

## การ์ด: จากไฟล์ข้อความถึงเอฟเฟกต์ที่ทำงาน

1. **เขียนการ์ด** ใน `assets/files/cards/<ต้นรหัส>/` (ดู `แม่แบบการ์ด.txt`) หัวข้อที่ไม่มีค่าไม่ต้องเขียน, เลเวลแบบสั้น `Lv1 1 3000`
   - **"ชุด:"** = ชุดในเกม (BS01, BS02 … / SD01) ที่การ์ดอยู่ ต้องมีทุกใบ · โฟลเดอร์ = ต้นรหัสที่พิมพ์บนการ์ด (BS31-C003 → cards/BS31/) ตัวแปลงตรวจว่าตรงกัน
   - **รหัสการ์ด = รหัสที่พิมพ์บนการ์ดจริง (ล่างขวา)** รูปแบบ `<ชุด>-<ระดับ><เลข>`: "BS31 C 003/114" → `BS31-C003`, "BS19 X 08" → `BS19-X08`, "BSC23 X CP01" → `BSC23-XCP01`, โปรโม "X PX15" → `PX-X15`
     ใส่ในช่อง "รหัส:" ทุกใบ (ตัวแปลงตรวจรูปแบบ + ระดับต้องตรงกับ "การ์ดระดับ") · ชุดในเกม (BS01…) = ช่อง "ชุด:" → `set` ของข้อมูลการ์ด (ชุดเดียวรวมการ์ดจากหลายต้นรหัส)
   - การ์ดหนึ่งใบเขียนข้อมูลเต็ม **ที่เดียว** · Starter Deck ใส่แค่ชื่อในรายการเด็ค · ชื่อ/รหัสซ้ำ = error
   - ฟอย: ในรายการเด็ค `ชื่อการ์ด 3 (ฟอยรุ้ง 1, ฟอยขาว 1)`
   - ต่างอาร์ต (การ์ดใบเดียวกันคนละภาพ เช่น BSC23-XCP01 / BSC23-XCP01-2): เขียนซ้ำด้วยชื่อเดียวกันและ "ชุด:" เดียวกัน ข้อมูลต้องเหมือนกันทุกช่องยกเว้นรหัส · พิมพ์รหัสเดียวกัน = ใบที่สองต่อท้าย `-2`
     (ลิมิตในเด็คนับตามชื่อ = รวมกันไม่เกิน 3, สคริปต์ใช้ร่วมกัน, รายการเด็คอ้างชื่อ = ใบแรก)
2. `npm run cards`
3. **เขียนสคริปต์** ใน `packages/cards/data/<set>-scripts.ts`: `Record<ชื่อการ์ด, CardScript>` ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i
   (array = บรรทัดเดียวหลายความสามารถ, `null` = ยังไม่รองรับ) · จำนวนช่องต้องเท่าจำนวนบรรทัด ไม่งั้น attachScripts โยน error
4. ชุดใหม่ (ค่า "ชุด:" ใหม่): เพิ่ม import + loader ใน `packages/cards/src/index.ts` และใส่ใน `loadAllCards()` (web ใช้ db รวมทุกชุด)
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
- **นอกมือ** (กติกา 14 ข้อ 1): การ์ดยังอยู่ใน `hand` + อยู่ใน `state.shownCards` · step ที่เลือกจาก "ในมือ" (summonFromHand / summonFromHandFree / useMagicFromHandFree / setBurstFromHand / ทิ้งการ์ด)
  ใช้ `handCards` = ไม่รวมนอกมือ · การ์ดที่เขียน "ในมือ/นอกมือ" ใส่ `withShown: true` ในตัวกรอง · หน้าเว็บแสดงในโซน `OutsideZone` บนสนาม (ไม่อยู่ในพัดการ์ดในมือ)
- "เมื่อสปิริตของเราถูกอัญเชิญ" (`allySummoned`) อัญเชิญหลายตัวพร้อมกันในครั้งเดียว = ทำงานครั้งเดียว (กติกาทั่วไป เจ้าของโปรเจกต์กำหนด) · trigger อื่นที่อยากได้แบบเดียวกันใส่ `oncePerBatch`
- **เบรฟ (กติกา 03/04)**: สีของการ์ดบนสนามรวมสีเบรฟที่ร่วมร่าง = `cardColors` (ใช้แทน `def.colors` ทุกจุดที่เช็กสีการ์ดบนสนาม) ·
  ร่างต้นออกจากสนาม → step ภายใน `braveFate` แทรกต่อจากเอฟเฟกต์ปัจจุบัน (รีเสิร์ฟไม่พอ Lv1 = ลงแทรชไม่ถาม, คงอยู่ = `placeCores.noSummon` วางจากรีเสิร์ฟเท่านั้น) ·
  "เมื่อเบรฟนี้ถูกอัญเชิญ" ทำงานทั้งลงเป็นสปิริตและร่วมร่างทุกทาง (ตรวจที่ Lv ต่ำสุด `braveSummonLevel`) · ดึงคอร์จากสนามมาวางตอนอัญเชิญด้วยเอฟเฟกต์ = `checkDepletion` ก่อน trigger อัญเชิญ
- **เบิร์สที่ถูกสั่งใช้แบบไม่สนเงื่อนไข** (Catalyze = โซลเบิร์ส, ยูสึกิ = เบิร์สที่ถูกทิ้ง ทุกแบบ): ไม่มี "การ์ดต้นเหตุ" ของเงื่อนไขเบิร์ส (`item.subjectId` ว่าง, `item.catalyzed`)
  สคริปต์เบิร์สห้ามผูกเป้ากับการ์ดต้นเหตุ (ตัวที่ถูกอัญเชิญ/ทำลาย/โจมตี/เมจิคที่ใช้) เว้นแต่ข้อความการ์ดเจาะจงจริง ๆ — ข้อความทั่วไป "สปิริต 1 ตัว" = ให้ผู้เล่นเลือกเป้าเอง
  (บทเรียน: มาคินะเคยผูกกับตัวที่เพิ่งอัญเชิญ → Catalyze แล้วไม่ทำอะไร) · ข้อความที่แยกกรณี Catalyze ไว้ (ฟอร์ซโคล์ท) ใช้เงื่อนไข `catalyzed`
- **BS05**: `alsoMagic` / `grantMagic` (สปิริตใช้เป็นเมจิคได้ = `handMagic` ใน rules.ts, ใน store ใช้ `handMagicTimings`), `cannotAttack`, `voidFromLife`,
  Charge (`charged` + `bpMinusBoost` / `coreRemovalBoost` = `chargeBonus`), ล็อกโจมตี/ป้องกัน `disableChosenOpponent` (`state.turnLocks`), `negateOpponentsThisTurn` (`effectsLost`),
  `battleExhaustedBlock`, `blockTax`, `battleColorless`, `symbolsZeroThisTurn`, เบิร์ส `afterOpponentAttack`, trigger `unblocked` / `oppAttack` / `startStep` / `milledAny`,
  เน็กซัสถูกวาง = trigger `summon`, `activated.granted` (Flash ที่เบรฟให้ร่างหลัก),
  `destroyRefreshedByEffect` (ฟื้นสภาพด้วยเอฟเฟกต์ต้องผ่าน `refreshByEffect` ใน effects.ts เสมอ),
  `braveNotCounted` (เบรฟไม่นับในจำนวนเบรฟของผู้ร่วมร่าง: `braveRoom` / `braveToSwap`), subject `fromHand` (ใช้เมจิคจากในมือ ไม่ใช่นอกมือ)
- **BS06**: Kagemusha (`kagemusha` / `kagemushaNoSoul` / `kagemushaFree`: ดักใน resolveChoice ของ step ใน `KAGE_STEPS` แล้วบังคับเป้าด้วย `item.kageForce` ใน `ask()`),
  Charge `refreshCountBoost` / `exhaustCountBoost`, `braveSlots` (`braveLimit`), `grantQuick` (ใช้ `quickAbility()` แทนการหา ability quick ตรง ๆ),
  `noMill`, `multiDrawPunish`, `opponentNoReduction`, `lifeDamageCap`, step `lifeShieldThisTurn` / `forceAttackChosen` (`state.forcedAttack`) / `moveSourceBrave` /
  `setBurstFromField` / `battleImmune` / `catalyze.then` (หลังจากเบิร์สนั้นถูกสั่งใช้), เบิร์ส `afterOpponentSummonEffect` (item.onSummon, เลือก "ไม่ใช้" = item.declined)
- **BS07**: ข้อมูลการ์ด `teams` ("ทีม:") / `magicTypes` ("ไทป์: เพลง") / เบรฟ `braveCondition.family` (ตรวจด้วย `braveFits`),
  On Stage (ฉากขึ้นเวทีในหน้าเว็บ = event `summoned.onStage` → idol `onStage` ใน IdolFx + บินจาก `center` · เวลา `ON_STAGE_*` ใน store · `onStage` event ตอนกลับใต้เด็คเหลือป้ายเล็ก) (`onStage` ability + action `onStage`, step ภายใน `onStageLeave`/`onStageDone`, trigger `onStage`/`allyOnStage`, `onStageReplace`, เงื่อนไข `summonedByOnStage`/`summonedBy`),
  เพลงบนฟิลด์ = `players[p].songs` (step `placeThisSong`/`songFromHand`/`songToTrash`/`songToHand`, เงื่อนไข `songsAtLeast`, `staticBp.perSongs`),
  Solo Part = `destroyImmune` (`soloPart`, ตรวจใน `destroyCard`), My Unit = step `myUnit` (`battle.unit`, เงื่อนไข `inUnit`),
  ตัวคูณ "ต่อจำนวน..." = `per` บน step (`CountPer`), `when` (if/else), `extraSteps` (`afterAttackStep` ใน game.ts), `blockLevelSum` (`battle.levelBlock`),
  `unblockableByCost`, `selfCostIf`, `burstOnDiscard`, trigger `allyBlock`/`oppMagicUse` (`negateSubjectMagic`), ตัวกรอง `team`/`sameTeamAs`/`notSelf`/`hasSoloPart`/`hasOnStage`
- **BS08**: อัลติเมทอัญเชิญได้ (ไม่ร่วมร่าง) · `《เงื่อนไขอัญเชิญ: ไลฟ์เราไม่เกิน N》` ในไฟล์การ์ด → `summonCondition` (ตรวจด้วย `summonConditionOk`, หน้าเว็บซ่อนปุ่มอัญเชิญถ้าไม่ครบ) · เจ็ม `อัลติเมท`,
  Showdown = trigger `oppStartStep` + step `showdown.then` (คู่แข่งระบุเป้า, `showdownBp`, event `showdown`), Soul Drive = step `soulToVoid` (event `soulDrive` → ฉากบีบโซลคอร์จนแตก idol `soulDrive` ใน IdolFx · เวลา `SOUL_DRIVE_*` ใน store · keyframes `sd-*`),
  Spirit Soul = `summonSymbol.filter`, Infinite Blade = `chooseBlockers.direct` + `unexhaustSelf`, Evolution ที่ได้รับ = `grantEvolution` (ใช้ `hasEvolutionNow` ทั้ง engine และเว็บ),
  คีย์เวิร์ดในข้อความ = ตัวกรอง `textIncludes` (Rush / Showdown ฯลฯ), `noEffectText`, `sameFamilyAs`, `notInBattle` · ถาวร `coreFloor`, `cannotBlockLowerBp`, `colorAlso`, `noLifeFromVoid`, `effectImmune.exceptNamed`,
  ในเทิร์นนี้: `summonBans` / `turnSymbolBuffs` / `lifeCapOne` / `turnNoAttack` / `attackShiftTurn` · เทิร์นถัดไป `skipSteps` · ในการต่อสู้ `battle.lifeOnBlocked`, `blockTax.discard`,
  `bounceAllOpponent.to: 'deckTop'` (เรียงด้วย `toDeckTop` ซึ่งใช้เด็คของเจ้าของการ์ด) · trigger `ownMainStepStart` / `allyBurstActivated` / `allySoulEvolvedOnto`
- **BS09**: trigger `allyWonBattle` (ชนะและทำลายจากการเทียบ BP: ผู้โจมตีหรือผู้ป้องกันที่ชนะ) / `allyBouncedByOpponent` / `oppSoulToTrash` (การ์ดในมือ: ตรวจใน `checkSoulToTrash` ทุกรอบของ runQueue) · subject `byOpponentEffect`,
  trigger `zone: 'trash'` ทำงานกับ `allySummoned` / `endStep` ด้วย (เซ็นคิ / โกคิ) · ถาวร `familyAlso` (ใช้ `cardFamilies` แทน `def.family`), `ignoreSummonCondition` (`summonConditionOk(..., { paidWithSoul })`),
  `destroyCostBoost`, `maxLevelAllies`, `trashLock` (รวมใน `trashImmune`), `opponentNoTrashReturn`, `oneCoreNoBattle` / `attackTax` (`canAttackWith` / `blockersFor` / declareAttack), `staticBp.perAllies`, `drawStep.noStack`,
  เบรฟ `braveCondition.noEffectText` · step `opponentRandomDiscard` (สุ่มด้วย `s.rng`), `opponentExhaustsOwn`, `ownSoulToTrash`, `opponentNoBurstThisTurn` / `opponentNoMagicThisTurn` (`burstBans` / `magicBans`), `peekOpponentBurst`,
  `magicBurstTax` (จินเบร์: `magicBurstTax()` ใน rules.ts → useMagic `payCost.extra` / เปิดเบิร์ส = step `payBurstTax` · หน้าเว็บบวกใน PlayDialog + responseOptions), `magicBanned()`,
  `immuneChosenThisTurn` (`turnImmune` ใน effectBlocker), `pairBlock` (ใช้กลไก levelBlock: นับจำนวนตัว), `summonFromTrashThen`, `summonFreeHandOrTrash`, `noEndAttackStepThisTurn`, ตัวกรอง `inBattle` / `notFamilies` / `highestBp`, เงื่อนไข `any` / `trashAtLeast` / `ownGemColorsAtLeast` (`gemColorCount`)
- **BS10**: trigger `oppDepleted` / `allySoulDrive` · `allyMagicUsed` ทำงานจากในมือได้ (subject `paidWithSoul`) · `allySummoned` subject `fromHand` · เงื่อนไข `ownGemColor` / `subjectIs` / `trashCoreAtLeast` / `lifeLostByOpponentEffect` (item.lifeLostByEffect)
  ถาวร `burstProtect`, `oppBattleBp`, `familyAlso.allies`, `replaceDestroy.life` / `.toHand` · step `battleCompareLevel` (battle.compareLevel), `symbolsZeroChosen` (`symbolsZeroCard`), `opponentLevelOneThisTurn` (ใน cardLevel),
  `battleCoreTaxThisTurn` (`coreTaxed` + `payCoreTax` ใน game.ts), `noDestroyChosenThisTurn`, `scry`, `voidCoresSpread`, `exhaustAllChosenColor`, `flipDeckTop` (แค่แสดง), `returnBattleMagic` (`s.battleMagic`), `refreshOnBattlerGone` (ใน sendToTrash ของ ctx.ts)
  · trigger `allyBattleEnd` (ปลุกใน endBattle ครั้งเดียว: `battle.endTriggersDone`) · `removeOpponentCores.withReserve` / `.withTrash` (ถามจำนวนจากรีเสิร์ฟ/แทรชก่อน: step `opponentPileCores`) · ตัวกรอง `minCores` · staticBp `own` ที่ระบุ types ultimate = นับอัลติเมทด้วย
  · Bunshin: step `bunshin` = การ์ดบนสนามเปลี่ยน cardNo เป็น `SMP-BUNSHIN` (การ์ดเสมือนใน loadAllCards) และเก็บการ์ดจริงที่ `realCardNo` · `leaveField` คืนการ์ดจริงและส่งลงแทรชเสมอ (ยกเว้น `cloneToHand`) ผู้เรียกที่จะย้ายการ์ดต่อต้องเช็กค่าที่คืน · หน้าเว็บ CardFace วาดเป็นการ์ดคว่ำ
  · ร่างแยกวางคอร์ = choice `placeCores` ของ step `placeCores.clone` (รีเสิร์ฟเท่านั้น) · หงายร่างแยก = นำออกจากสนามแล้ว `placeCores` แบบอัญเชิญด้วยเอฟเฟกต์
  · `millCostReduce` (action summon `mill`, PlayDialog มีปุ่มเลือก) · `effectSummonTax` (placeCores / payForSummon ถามจ่ายเพิ่มด้วย `payBurstTax.label`) · `counterEndAttackStep` (ใน endAttackStepAfterBattle: `endStepCounter`)
  · trigger `oppVoidGain` (การ์ดในมือ: `s.voidGained` จดใน takeVoid / gainLifeFromVoid ตรวจใน runQueue) · catalyze `allTargets` (ask() แปลงเป็น applyPicks ทุกเป้า)
- **BS11**: ตัวแปลงรับบรรทัดกฎที่ขึ้นต้น `เมื่อโซลคอร์` / `เมื่อสปิริต...ถูกอัญเชิญ` / `ต่อจำนวน` (ใช้กับเมจิคได้ด้วย) ·
  trigger `allySoulTrashed` (โซลคอร์ของเราลงแทรชโดยเอฟเฟกต์สปิริตเรา: `soulTrashedByEffect` ใน effects.ts เรียกทุกจุดที่ส่งโซลลงแทรช) / `oppMainStepStart` ·
  `allySummoned` ทำงานจากในมือได้ + subject `byEffect` (ดอน) · `allyBurstActivated` subject `catalyzed` · `catalyze.then` มี subject = เบิร์สนั้น, `catalyze.lifeAs` (`item.lifeAs` ใน holds) ·
  ถาวร `handCostPer` (คอสต์ในมือ ± ต่อจำนวนสปิริต: `self` = การ์ดในมือเอง), `allColorAttackStep` (`allColorOverride` ใน cardColors / fieldSymbols / gem helpers), `indestructible` (ใน destroyCard),
  `showdownWeChoose`, `staticBp.perGemColors`, `coreFloor.min: 'lv1'` · ตัวกรอง `sameColorAlly` (กันวนซ้ำใน `maxLevelAllySource`) / `minReductionColors` · เงื่อนไข `onlyGemColor` ·
  CountPer `handIncrease` / `gemColors` / `bouncedByThis` · step `noLifeDamageChosen` (`state.noLifeDamageCards`), `negateChosenThisTurn` (`state.negatedCards` ใน effectsNegated), `trashCoresToSelf`,
  `ownLifeToSelf`, `coresOffEverySpirit`, `symbolAttackerBattle`, `millTopBranch` (สลากสืบทอด: drawStep.before + `addDrawStepDraw -1`), `symbolsZeroAllOpponent`, `battleLevelUnblock` (`battle.levelUnblock` ใน game.ts),
  `bounceAllOpponent.to: 'deckBottom'` + `withBurst`, `payToUseFlash.main`, `summonFromHandFree.distinctColors`, `revealTakeAll.distinctNames`, `trashCoreToReserve.withSoul`, `opponentLifeToReserve.to: 'trash'`
  · `bounceRedirect` (กู๊ดลัคฮิล: `bounceRedirect()` ใน effects.ts เรียกทุกจุดที่นำสปิริตคู่แข่งกลับขึ้นมือ → chooseOne + step `returnCardsTo`),
  `soulCostFreeThisTurn` (ลองฟิลด์: `state.soulCostFree` · chooseOne ที่ตัวเลือกขึ้นต้นด้วย `soulToTrash` ไม่ต้องมีโซลคอร์ และ soulToTrash ไม่ย้ายโซลจริง),
  `bpDestroyBoost` (โฮมุระแมนดริล: `bpDestroyBoostFor` ใน destroyChosenOpponent / destroyAllOpponent + ทะลุ Shield ใน `hits`), `copyStatsAllies` (ฮะจิริว: `statCopySource` ใน cardLevel / currentBp / extraSymbols)
  · `toDeckBottom` ใช้เด็คของเจ้าของการ์ด (เหมือน toDeckTop) · trigger `allyDepletedByOpponent` (ข้อความ "ถูกทำลาย/สูญสลาย" ใช้คู่กับ allyDestroyed) · ตัวกรอง `hasUltraShield` (รวมที่ได้รับ) ·
  `chooseBlockers.max` + `direct` = True-Consecutive Blade (เลือกระบุ 2 ตัว แบบ Infinite Blade) · `symbolsZeroAllOpponent` มีผลทั้งเทิร์น (`state.symbolsZeroTurn`, กติกา 13 ข้อ 6)
- **BS12**: Assault = trigger `attack` ("เมื่อสปิริตนี้โจมตี" **ไม่ใช่ Flash** เจ้าของโปรเจกต์กำหนด · เทิร์นละ N = เงื่อนไข `usedFewerThan` + step `markOnce` · ตัวช่วย `assault()` ใน bs12-scripts, BS03 มิซึมาตะโอโรจิแบบเดียวกัน) · กันดาละ-ไฮดรา `assaultTrashNexus` + เงื่อนไข `assaultAlt`,
  เบรฟร่วมร่างกับอัลติเมทได้ = `braveCondition.ultimate` (ตัวแปลงอ่าน "สปิริต/อัลติเมท", ตรวจใน `braveFits`) · `braveCostAs` (คอสต์เบรฟที่ร่วมร่าง: `braveFieldCost`) ·
  `bounceImmuneAllies` (ฮาคุไร: ตรวจใน `hits()` ของ step ใน `BOUNCE_STEPS`) · `noSummonTriggers` (ห้ามงคล: เฉพาะการ์ดประเภทสปิริต) / `summonFromHandFree.noTriggers` (ทรูธ-อีเด็น) ตรวจใน queueTriggers ·
  `minSummonPay` (อัญเชิญไม่จ่ายคอสต์ไม่ได้: `payableCost` ขั้นต่ำ + กันใน placeCores / multiSummon / `freeSummonOk`) ·
  `burstMagicBan` (`cardBanSource`: บัวม่วง = คอสต์เท่าเน็กซัสเรา, อาบิส = ไม่มีสีตรงกับเจ็มบนฟิลด์ตัวเอง) → `magicBanned(state, player, db, def)` / `burstBlocked(..., burstDef)` ·
  `nexusExhaustPay` (คาเมะมิสึ: action summon `exhaustNexus` + ปุ่มใน PlayDialog, `nexusExhaustPayMax`) · `attackReserveTax` (แคพิทัลแคพิทัล: `attackReserveTaxFor` ใน canAttackWith / declareAttack) ·
  `millBoost` (Charge ทิ้งเด็ค: `millBoostFor` ใน step mill) · `bpDestroyBoost` ไม่ต้องมี nameIncludes ได้ + `if` / `fromTypes` / `granted` และมีผลกับ `opponentTotalBp` (BP รวม) ด้วย ·
  `opponentTotalBp.metric: 'cost'` / `.filter` · `maxLevelIf.granted` · ในเทิร์นนี้ Lv สูงสุด = step `maxLevelThisTurn` (`state.maxLevelTurn`) · `extraSymbol.perAllies` ·
  step `trashSoulToAlly` / `destroyAllOpponentBraves` / `peekHandDiscard` · `catalyze.countKills` + CountPer `burstKills` (มิสึรุกิ: นับเฉพาะสปิริตคู่แข่งที่เอฟเฟกต์ของเบิร์สนั้นทำลาย/ทำให้สูญสลาย = `state.burstKills` นับใน `destroy` ของ ctx.ts และ `depleteByOpponent`) · CountPer `milledByThis` · `destroyChosenOpponent.bpFrom: 'chosen'` (soulToAlly / refreshChosenAlly ตั้ง chosenId) ·
  `summonFreeHandOrTrash.zones` / `.per` · `opponentLifeToReserve.per` · SubjectFilter `cost` · เงื่อนไข `ownBurstSet`
- **BS13**: Rush = เงื่อนไข `rush: { color, count }` (นับ `fieldSymbols` ของเรา · หลายขั้น "(เจ็ม 1 เม็ด) / (2 เม็ด)" = `when` ซ้อนตามจำนวน สะสม) · เบรฟ `rushIgnore` (มิดไนท์-ซัน: Rush ของผู้ร่วมร่างเป็นจริงเสมอ) ·
  "สีและเจ็มถือว่าเป็นสี...ด้วย" หลายสีได้ (`colorAlso` + `symbolAlsoColor` ทุกสี: ตัวช่วย `alsoColor` ใน bs13-scripts) · ตัวกรอง `minColors` (สีตั้งแต่ N สี) · เงื่อนไข `ownMainStep` ·
  `handCostSet` (การ์ดในมือถือว่ามีคอสต์ N) · `millCap` (ต่อเทิร์นถูกทิ้งเด็คโดยเอฟเฟกต์ของคู่แข่งได้ไม่เกิน N: `millCapLeft` + `state.milledByOpponent`) ·
  `opponentNoRefresh.if` / `.anyRefresh` ("ฟื้นสภาพไม่ได้" ทุกทาง: `noRefreshSource` ตรวจในรีเฟรชสเต็ป, `refreshByEffect`, `unexhaustSelf`, `refreshOnBattlerGone`) ·
  magic `notMain` ("ทำงานในเมนสเต็ปไม่ได้": engine useMagic + `handMagicTimings` ในเว็บ) · step `refreshChosen` (ตัวที่ `voidCore to: 'ally'` เพิ่งเลือก) · `bounceOpponent.coresToTrashIf`
- **BS13 เพิ่มเติม**: เลออนแลนเซอร์ = trigger `oppDestroyed` + subject `victimSoul` (การ์ดคู่แข่งที่ถูกทำลายมีโซลคอร์) · ก็อด-เซคส์ -รูปแบบทำลายล้าง- = `allyBattleEnd` ทำงานจากการ์ดในมือ/แทรชได้ (`zone`) + subject `attacker` ("เมื่อจบการโจมตีของ…") · ตัวแปลงรับบรรทัดที่ขึ้นต้น `เมื่อจบการโจมตีของ` · ลดคอสต์ = เจ็มเม็ดละ 1 ช่อง (จับคู่เฉพาะเมื่อมีการ์ด symbolAlsoColor บนสนาม: `hasSymbolAlso`)
- **BS13 หกเทพพิสุทธิ์ / เทนคาฟุบุ (XX)**: เงื่อนไข `trashMatchAtLeast` / `opponentTrashAtLeast` / `totalCoresAtLeast` (ฟิลด์+รีเสิร์ฟ+แทรช) / `ownGemsAtLeast` ·
  `coreStepBonus` (afterStart ใน game.ts) · `noLoseAtZeroLife` (ไลฟ์ 0 ทุกจุดผ่าน `lifeZeroLose` ใน ctx.ts + `checkLifeZero` ท้าย applyAction: ผลหาย = แพ้) ·
  `opponentBpZero` (`opponentBpZeroSource` ใน currentBpRaw) · `symbolOverrideAllies` (ใช้ `symbolOverrideOf` แทน `battle.symbolOverride` ทุกจุดที่นับเจ็ม) — ตัวกันวนซ้ำ `checkingBpZero` / `checkingSymbolOverride` อยู่ในเงื่อนไข memo ·
  `gainLockExceptColor` (ชโตรม-ไฮด์: `gainLocked` ใน effects.ts = step draw / opponentDiscardHandDraw / discardHandDrawOpponentCount / gainLifeFromVoid / takeVoid / reveal...ขึ้นมือ: เพิ่มทางใหม่ที่การ์ดจากเด็คขึ้นมือหรือคอร์จากวอยด์ต้องเช็กด้วย) ·
  trigger `leftByOpponentEffect` (ถูกนำกลับมือ/เด็คโดยเอฟเฟกต์คู่แข่ง: ใน `returnCard` · ใช้คู่กับ destroyedByOpponentEffect / depletedByOpponent) · subject `byOwnEffect` (oppExhausted: `queueExhaustTriggers(..., byEffect)`) ·
  step `opponentAllCoresToTrash` / `destroySubject` / `soulDriveOthers` (Soul Drive ของการ์ด = ตัวเลือก chooseOne ที่ขึ้นต้นด้วย soulToVoid: `soulDriveOf`) · `handCostSet.cost: 'life'` + `if`
- **สูญสลายไม่ใช่การถูกทำลาย** (กติกา 10): สูญสลายโดยคู่แข่ง = trigger `depletedByOpponent` + เบิร์ส `afterAllyDepletedByOpponent` เท่านั้น
  ข้อความ "ถูกทำลาย/สูญสลาย" = trigger `on: ['destroyedByOpponent', 'depletedByOpponent']` / เบิร์ส `alsoDepleted: true` · "ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง" (ไม่นับแพ้เทียบ BP) = `destroyedByOpponentEffect`
  · เอฟเฟกต์ "เมื่อถูกทำลาย" ทำงานขณะยังอยู่บนสนาม (engine ส่งลงแทรชก่อน: "วางคอร์บนสปิริตนี้" = คอร์กลับรีเสิร์ฟ)
- **BP0 ไม่ถูกทำลายเอง** (เจ้าของโปรเจกต์กำหนด): ทำลายเฉพาะการ์ดที่เขียน "ทำลาย…ที่กลายเป็น BP0" = `debuffChosenOpponent.destroyAtZero`
- **อัลติเมทไม่ใช่สปิริต** (58.0.0): `attachScripts` ปรับสคริปต์ตามข้อความการ์ดเอง (`spiritWording` ใน abilities.ts) ·
  บรรทัดที่ไม่พูดถึงอัลติเมท หรือมีคำว่า "สปิริต" เดี่ยว ๆ (`hasBareSpirit`) = `spiritsOnly` → `spiritLike` ใน execStep ไม่รวมอัลติเมท (ยกเว้นการ์ดนี้เอง และ step ที่ `filter.types` มี 'ultimate') ·
  บรรทัดที่ไม่พูดถึงอัลติเมทเลย: ตัด 'ultimate' ออกจาก types สปิริต/อัลติเมท + เงื่อนไข allyHas/opponentHas/alliesAtLeast ที่ไม่ระบุประเภทนับแค่สปิริต (ยกเว้นอ้างชื่อการ์ด) ·
  ท่อน "เมื่อสปิริต…" ของ trigger = subject.types สปิริต · ท่อน "หลังจากสปิริต…" ของเบิร์ส = `subjectSpiritsOnly` (`pendBurst(..., ultimate)` จด `ultimateOnly`) ·
  **เขียนสคริปต์**: ส่วนที่ข้อความเป็น "สปิริต/อัลติเมท" ต้องใส่ `types` ที่มี 'ultimate' เอง · step ที่ไม่มีตัวกรองแต่หมายถึงสปิริต/อัลติเมท = ใส่ `spiritsOnly: false` ที่ความสามารถ
- **เบิร์ส "หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง"** (`afterAllyDestroyedByOpponent`): นับเฉพาะสปิริต/อัลติเมท (รวมเบรฟที่อยู่เดี่ยวเป็นสปิริต) ตรวจใน `destroy` ของ ctx.ts · เน็กซัส และเบรฟที่ร่วมร่างถูกทำลายออก (`destroyOpponentBrave`) ไม่เปิด (เจ้าของโปรเจกต์กำหนด)
- **กติกา 14 (ตรวจแล้ว 23.0.0)**: บังคับป้องกัน True-Rage / Consecutive Blade ตรวจที่ `blockForced` ใน rules.ts (engine + หน้าเว็บใช้ตัวเดียวกัน; ป้องกันต้องจ่ายก่อน/ต้องใช้ Lv รวม = ไม่บังคับ) ·
  Dispersion (`disperse` ใน effects.ts): เมจิคที่เล็งหลายเป้าพร้อมกัน ("อย่างละ 1 ตัว" / "นอกจากนั้น") ใส่ `noDispersion: true` ที่ ability magic, เล็งเน็กซัสกระจายไม่ได้,
  สปิริตที่ใช้เป็นเมจิค (`item.asMagic`) และ [Flash] ที่จ่ายต่อจากเบิร์สกระจายได้ (เจ้าของโปรเจกต์กำหนด) · Kagemusha: การ์ด Kagemusha ที่ไม่รับผลเอฟเฟกต์นั้น = ดูดมาแล้วลบทิ้ง,
  step ใหม่ที่เล็งสปิริตคู่แข่งต้องเพิ่มใน `KAGE_STEPS` · เอฟเฟกต์ "…ทั้งหมด" (destroyAll / bounceAll ฯลฯ) ไม่ใช่การเล็งเป้า = Kagemusha ไม่ทำงาน (เจ้าของโปรเจกต์ยืนยัน เช่น Burst ชิโรนากัส) · My Unit ใช้คู่เดิมซ้ำในการต่อสู้เดียวได้ (เจ้าของโปรเจกต์กำหนด) · ยังไม่มีการ์ด: Rush, Bunshin, Poison Blade, Rage ธรรมดา (ไม่บังคับอัลติเมท)
- **รหัสการ์ดเปลี่ยน (ย้ายชุด / แก้รหัส) ต้องเพิ่มรหัสเดิม → รหัสใหม่** ใน `packages/cards/src/legacy-card-no.ts` (มีตารางรหัสแบบเดิม `BS01-SP-R001` → รหัสที่พิมพ์บนการ์ดอยู่แล้วทุกใบ) และเปลี่ยนชื่อไฟล์ภาพตาม
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
| ไม่บอกระยะเวลา เช่น "[เมื่อสปิริตนี้โจมตี]: สปิริตนี้ BP+3000" (เจ้าของโปรเจกต์กำหนด) | มีผลจนจบช่วงนั้น (จบการต่อสู้นั้น) | `buffSelf.untilBattleEnd` / `symbolThisTurn.untilBattleEnd` (`card.battleBp` / `battleSymbols` ล้างใน `endBattle` และ `leaveField`) |
| "...นำกลับไปไว้บนสุด/ใต้สุดเด็คโดยเรียงลำดับได้" | เรียงทีเดียว คลิก 1..N แล้วยืนยัน | step `toDeckTop` / `toDeckBottom` → choice `arrange` (pick `{ order }`) |
| "…หรือ…" | เลือกทำอย่างใดอย่างหนึ่ง | `chooseOne` (ใส่ `if` ให้ตัวเลือกที่ไม่มีเป้าหมาย) |
| "ไม่เกิน N" | รวม N | `maxBp` / `maxCost` / `lifeAtMost` |
| "…เมื่อเป็นเช่นนั้น…" | ท่อนหน้าต้องทำได้จริงก่อน ท่อนหลังถึงเกิด | `ifDestroyed` / ตรวจใน engine (เช่น `replaceDestroy.mill` ต้องทิ้งเด็คได้ครบ) |

## หลักของ engine

- `applyAction` ไม่แก้ state เดิม (clone ทุกครั้ง) และต้อง deterministic (สุ่มด้วย seed ใน state) — ออนไลน์พึ่งสิ่งนี้
- เอฟเฟกต์เข้าคิว `state.queue` ทำทีละ step · ต้องให้ผู้เล่นเลือก = ตั้ง `state.choice` แล้วหยุด รอ action `choose`
- trigger ที่เกิดจากเอฟเฟกต์ที่กำลังทำงานเข้าคิวต่อจากเอฟเฟกต์นั้นทันที · เอฟเฟกต์ที่เกิดพร้อมกันของผู้ควบคุมเดียวกัน = ถามลำดับ (choice kind `order`)
- เอฟเฟกต์ที่ผู้เล่นกดใช้เอง: [Evolution] = action `evolve`, เอฟเฟกต์ Flash ของการ์ดบนสนาม (ability `activated`) = action `activate`,
  อัญเชิญจากแทรช (ability `trashSummon`) = action `summon` ที่ cardId อยู่ในแทรช · ของใหม่แบบนี้ต้องเพิ่มใน `responseOptions` (store) ด้วย ไม่งั้น AUTO จะ pass Flash ข้ามไป
- **เล็งหลายเป้า = เลือกทีเดียว** (เจ้าของโปรเจกต์กำหนด): `ask()` แปลง choice `card` ของ step ใน `MULTI_STEPS` ที่ count > 1 เป็น `multiCard` (pick `{ cards }`)
  → step ภายใน `applyPicks` (ถาม Kagemusha ทุกเป้าก่อน แล้วเรียก `applyCardPick` ทีละใบต่อกัน) · ส่งคอร์หลายเม็ด = choice `distribute` (pick `{ alloc }`) → `coresOffBatch`
  · Kagemusha ที่ใช้แล้ว = เป้าทั้งหมดย้ายไปที่การ์ด Kagemusha (กติกา 14) · step ใหม่ที่เล็งหลายตัวด้วย count: เพิ่มใน `MULTI_STEPS`
- **แคชผลคำนวณ (`freezeForCache` ใน rules.ts)**: store ประกาศทุก state ที่ถืออยู่ → `cardLevel` / `currentBp` / `cardColors` / `cardFamilies` / `extraSymbols` / `fieldSymbols` / `payableCost` / `effectsNegated` / `maxLevelAllySource` / `statCopySource` จำผลต่อ state
  (engine ระหว่างทำ action ไม่ใช้แคช · ข้ามแคชเมื่อตัวกันวนซ้ำทำงานอยู่) · หน้าเว็บ **ห้ามแก้ state ใน store ตรง ๆ** (clone ก่อนเสมอ) · ตัวกันวนซ้ำใหม่ใน rules.ts ต้องเพิ่มในเงื่อนไขของ `memo` · เทสต์ `memo.test.ts`
- **บอท (`src/bot.ts`, ระดับกลาง · พื้นฐานโหมด Story)**: `botDecide` / `botAction` = หาท่า (`legalActions` รวมตัวเลือกระหว่างเอฟเฟกต์ทุก kind) → ลองบน `botView` (ซ่อนมือ/เบิร์สคู่แข่งและเด็คทั้งสองฝ่ายด้วยการ์ดว่าง `CLONE_CARD_NO` = ไม่โกง, ตัด log) →
  `settle` (เล่นต่อด้วยนโยบายง่ายจนถึงจุดตัดสินใจอิสระ) → `evaluate` (ไลฟ์, สนาม, คอร์, มือ, เบิร์ส, ความเสี่ยงโดนตีตายเทิร์นหน้า) · จบสเต็ป = คะแนนกระดานตอนนี้ (ไม่จำลองข้ามเทิร์น)
  · `evaluate` ให้คะแนนบรรทัดเอฟเฟกต์ที่เลเวลตอนนี้ใช้ได้ (`abilityValue`: เงื่อนไข soulOnSelf ต้องมีโซลคอร์จริง) · เมนสเต็ปมีท่าจัดคอร์ `coreMoves` (เพิ่มเลเวลจากรีเสิร์ฟ, วาง/สลับโซลคอร์) · จ่ายคอสต์ด้วย `payAny` (รีเสิร์ฟก่อน แล้วคอร์ส่วนเกินเหนือ Lv1 บนสนาม)
  · เทสต์ `bot.test.ts` (ตัวช่วย `bot-helpers.ts`): บอทเล่นกันเองทุกคู่ Starter + เด็คจากการ์ดทุกชุด (จับเอฟเฟกต์ที่ทำให้ค้าง/พังได้: เพิ่มชุดใหม่แล้วรันด้วย) + ชนะการสุ่มท่า
  · หน้าเว็บ: `bot/vsBot.ts` (`startVsBot(decks, { level, botName, onEnd, exit })`): บอทที่นั่ง p2 (`store.botSeat` / `botName`: มือคว่ำ, `mine()` = false, กั้น action ด้วย `setTutorialHooks`) เดินหลังแอนิเมชันจบ · บอทชนะการเสี่ยง = เลือกเอง (ห้ามรอฉากเปิดจบ: ฉากค้างรอการเลือก)
  · `BotOptions.level` 1–6 (ดาวของด่าน): ต่ำ = คะแนนคลาดเคลื่อน + โอกาสพลาด (`BLUNDER`) แบบ deterministic · ★6 = ท่าที่ดีที่สุด `LOOKAHEAD_TOP` ท่าคิดต่ออีกหนึ่งท่าถ้ายังเป็นตาเรา (`bestOneStep`)
- **โหมด SOLO (`screens/Solo.tsx`, screen `'solo'`)**: หน้าแรก (แนะนำ / เล่นล่าสุด / STORIES / ฝึกฝน = TUTORIAL + VS BOT) → รายการด่าน → ฉากเปิดการ์ด → แผนที่ด่าน
  · ข้อมูลด่าน `solo/gates.ts` (โหนด scenario / practice / duel / goal / locked, `after` = ปลดล็อก + เส้นเชื่อม, `afterAny` = ทางแยกให้เลือก (ผ่านทางไหนก็ได้ · `nextNode` ข้ามทางที่ไม่ได้เลือก), `col`/`row` = ตำแหน่ง (row 0–2: ใช้แถว 2 = แผนที่ 3 แถว) · id โหนดที่ถูกลบ = ความคืบหน้านั้นถูกทิ้งตอนโหลด, `deck()` = เด็คของด่านเป็นรหัส `c:`, `avatar` รูปคู่แข่ง, `description` / `deckDescription` ข้อความในแผงด่าน / หน้าดูเด็คคู่แข่ง) ·
  **เนื้อเรื่อง: อ่าน `docs/story/sengoku.md` ก่อนเขียนบทใหม่** (โลก, 6 แคว้น, ตัวละคร, แม่แบบโหนด, สถานะ, ข้อตกลง) · บทเนื้อเรื่องยุคเซ็นโงคุ (`SENGOKU_GATES`): 6 แคว้นตามสี (`emblem` = ตราแคว้น ได้เมื่อถึงเป้าหมาย) + บทสุดท้าย `requires: SENGOKU_REALMS` · `soon` = ยังไม่เปิด · `gateUnlocked` / `emblemEarned` · ชนะโหนดครั้งแรก = EXP โบนัส (`firstClearBonus`) · โหนด practice ที่มี `lesson` = บทเรียนสอนเด็ค (`solo/lessons.ts` → `startTutorial(id, { onDone, exit })`) ·
  ความคืบหน้า `solo/progress.ts` (localStorage `bs-solo` ใน `SETTING_KEYS`) · ดวลจบ = `onEnd` บันทึกผ่าน, หน้าผลมีปุ่ม "กลับไปที่ด่าน" (`vsBotExit()` ใน MatchResult)
- **เลเวลผู้เล่น (`src/progression/level.ts`)**: EXP ใน localStorage `bs-exp` (ซิงก์บัญชี: รวม = ค่าที่มากกว่า `mergeExpJson`) · `matchExp` = สูตร EXP ต่อเกม · ให้ EXP ที่หน้าผลการดวล (`MatchResult` → `addExp` + `ExpGain`) และบทเรียนผ่านครั้งแรก · ห้องออนไลน์ส่งเลเวลที่ `rooms/<code>/levels` (`setLevel`, สมาชิกห้องดวล `DuelMember.level`) · แสดงด้วย `components/LevelBadge.tsx`
- **โหมด 2VS2 (`src/seats.ts`, กติกา `docs/rules/15-2vs2.md`)**: `createGame({ partnerDecks })` → `state.mode = '2v2'` · ฝั่ง p1/p2 = ทีม, สนาม `players[p].field` ใช้ร่วมกัน, การ์ด/คอร์มี `seat` (1 = คนที่สอง, ไม่มี = 0)
  · โซนส่วนตัวของที่นั่ง 1 อยู่ที่ `players[p].partner` · engine **สลับโซน** (`useSeat`) ให้ที่นั่งที่ทำ action (`action.seat`) / ผู้ควบคุมเอฟเฟกต์ (`itemSeat`) อยู่ที่ `players[p]` ระหว่างทำงาน แล้วคืนเป็นที่นั่ง 0 เมื่อจบ action (`restoreSeats`) → โค้ดเดิมที่ใช้ "ของเรา" ได้โซนของคนที่ทำอยู่เอง
  · ส่งของไป "เจ้าของ" ใช้ `ownerZones(s, cardId)` / `zonesOf(s, p, seat)` · `normalizeSeats` ย้ายการ์ด/คอร์ที่หลงไปโซนเพื่อนกลับหลังทุก step · คอร์ที่ใช้จ่าย/จัดได้ = `ownField` (ของตัวเอง)
  · ไลฟ์คู่แข่งลดทั้งสองคน (`loseLife`), step ที่ลงผลกับเด็ค/มือ/เบิร์สคู่แข่ง = `OPP_ZONE_STEPS` (ทำทีละคน: step ภายใน `oppSeat`) · trigger จากมือ/แทรช = `teamHand` / `teamTrash`
  · จบเมน/แอทแท็คสเต็ป = ทุกคนกดพร้อม (`seatsReady`), แฟลช = ทุกคนกดผ่าน (`flash.seatsPassed`) · บอท: `actorSeats` + `legalActions` ติดที่นั่งให้ · เทสต์ `2v2.test.ts`, `2v2-bot.test.ts`
  · `applyAction` รับ state ที่สลับที่นั่งไว้ได้ (คืนเป็นที่นั่ง 0 ก่อนเสมอ) · หน้าเว็บ (ตอนนี้มีแค่ดวลกับบอท: `startVsBot(..., { partners })`): ผู้เล่น = p1 ที่นั่ง 0, อีก 3 ที่นั่งเป็นบอท (`botTurn` ใน vsBot.ts, `BotOptions.seat`)
    `partnerTurn` (store) = ตาของเพื่อนร่วมทีม → `mine`/`controls` เป็น false + แถบ "รอเพื่อนร่วมทีม" · `TeamPlate` (Hud) ป้ายคนที่สองของแต่ละทีม + ดูมือเพื่อน · `OwnerTag` (Board) ป้ายเจ้าของการ์ดบนสนาม
  · **Team Battle ออนไลน์** (DUEL → Team Battle): ห้องดวล `meta.team` = โต๊ะละ 4 ที่นั่ง `TableSeat` p1/p1b/p2/p2b (`tableSeats`, `seatKey`/`keySide`/`keySeat` ใน online/transport.ts) · ห้องเกมมี `setup.partnerDecks` + ที่นั่ง p1b/p2b
    `OnlineState.seat` · state ในเครื่องเก็บ **ในมุมของที่นั่งตัวเอง** (`asMySeat` หลังทุก action) · `dispatch` ติด `seat` ให้ action · `autoAdvance` ต้องตัดสินตามที่นั่งด้วยสำเนาที่สลับที่นั่ง (ห้ามขึ้นกับมุมของเครื่อง ไม่งั้น 4 เครื่องเดินไม่ตรงกัน)
  · **1VS2** (กติกา 15 ข้อ 10): `partnerDecks` ระบุแค่ฝั่งเดียว → อีกฝั่งไม่มี partner = `state.solo` (ไลฟ์ `SOLO_LIFE` 10, คอร์สเต็ป +2, ดรอว์สเต็ปจั่ว 2 ใน game.ts) · โค้ด 2VS2 ตรวจ `players[p].partner` ต่อฝั่ง (ห้ามถือว่า mode 2v2 = มี partner ทั้งสองฝั่ง)
    หน้าเว็บ: VS BOT เลือก 1VS2 / 2VS1 (`startVsBot(..., { partners: { p2 } })`) · Team Battle โต๊ะ 3 คน = 1VS2 (`tablePlayers` ใน store, `gameSeats(setup)` ใน transport) · เทสต์ `1v2.test.ts`
    ทดสอบ: 4 แท็บ `?online=local` (สคริปต์ CDP: import store ด้วย URL เดียวกับที่แอปโหลด จาก `performance.getEntriesByType('resource')` ไม่งั้นได้ store ตัวใหม่)
- `config.manualDraw` (หน้าเว็บเปิดไว้): Draw Step หยุดรอ action `drawStep` · เทสต์ใช้ค่าเริ่มต้น (จั่วเอง) · ฝั่งที่มีเพื่อนร่วมทีม (2VS2) จั่วอัตโนมัติเสมอ (เจ้าของโปรเจกต์กำหนด · 1VS2 ฝั่งคนเดียวยังกดเอง)
- 2VS2 หน้าเว็บ: ช่อง Burst แต่ละที่นั่ง = `data-burst-seat="<p>:<seat>"` (แอนิเมชันเบิร์สใช้ `burstSeatSel` / `burstRect` ตาม `card.seat`) · ภาพร่างจัด Core (`truth`) ไม่หายเมื่อ action ของที่นั่งอื่นมาถึง (`restoreDraft` ใน receive)
- เปลี่ยนลำดับ action ที่ engine คาดหวัง = ห้องออนไลน์ที่เล่นค้างอยู่จะเล่นต่อไม่ได้ (บอกเจ้าของโปรเจกต์ด้วย)
- ความสามารถถาวร (ไม่ผ่านคิว) ไม่มี `effectResolving` → ตรงจุดที่มัน "ลงมือจริง" ให้เรียก `emitStatic(ctx, { cardId, source })` (event `staticApplied`)
  หน้าเว็บจะเรืองแสงการ์ดต้นเหตุ + ป้าย "เอฟเฟกต์ถาวร" · ตัวช่วยหาต้นเหตุ: `staticSources` / `effectBlocker` / `negatedBy` / `bounceBottomSource` ใน rules.ts
  · Shield กันใน `hits()` ของ execStep แล้ว (เรียก `hits` หลังกรองเป้าตามเอฟเฟกต์เสมอ ไม่งั้นเรืองแสงผิดใบ)
  · ผลที่ "เพิ่งเริ่มมีผล" (Lv คอสต์ +N ใน `checkDepletion`) เทียบกับ `ctx.start` (state ก่อน action) · เรืองแสงเฉพาะตอนตัวเลขเปลี่ยนจริง ไม่ใช่ทุกครั้งที่เช็ก

## หลักของหน้าเว็บ

- แอนิเมชันทั้งหมดมาจาก `eventsToFx` ใน store: event ของ engine → รายการ Fx ที่มี `delay` ตามไทม์ไลน์ `t`
  ค่าที่ต้องรอแอนิเมชัน (BP, เลเวล, Core ใหม่) ใช้ `holds` / `coreDelays` ไม่ให้โชว์ก่อนแอนิเมชันถึง
- ป้าย (banner) แสดงทีละอัน delay นับตอนขึ้นเป็นอันแรกของคิว · `isFxBlocking` = แอนิเมชันที่ต้องจบก่อนให้ผู้เล่นทำต่อ
- ฝั่งคู่แข่งหมุน 180° ทั้งแผ่น (Tailwind v4 `rotate-*` ใช้ CSS property `rotate` แยกจาก `transform`)
- จอสัมผัส: การลากของเบราว์เซอร์ (HTML5 drag) ใช้กับนิ้วไม่ได้ → `installTouchDrag` (DragGhost.tsx) แปลงการลากนิ้วบน element ที่ draggable เป็น dragstart/dragover/drop ให้ตัวรับเดิม (ปัดแนวนอนบนการ์ดในมือ = เลื่อนพัด ไม่ลาก) · ทุกอย่างที่ลากได้ยังควรมีทางแตะแทน (หน้าจัดเด็คใช้ pointer events ลากได้ทั้งเมาส์และนิ้ว)
- **การตัดสินใจระหว่างเกมทำบนกระดาน ไม่ใช้ Modal** (เจ้าของโปรเจกต์ต้องการเห็นสนามตลอด):
  เลือกการ์ดนอกสนาม (เด็ค/แทรช) = พัดการ์ด `RevealFan` · จ่ายคอสต์/วาง Core = คลิก Core บนกระดาน + แถบ `PromptBar`
  · อัญเชิญด้วยเอฟเฟกต์ทุกแบบ (เบิร์ส/มือ/เด็ค/แทรช) ใช้แผง `SummonPanel` ที่มุมสนาม (การ์ด, ปุ่ม Lv, ผล Lv/BP, คำเตือนสูญสลาย)
  · อัญเชิญหลายใบ (choice `multiSummon`) = `store.multi`: เลือกจากพัด → วาง Core / คลิกผู้ร่วมร่างทีละใบ → ส่งทีเดียว
  · เล่นการ์ดจากมือ/แทรชตามปกติ (`PlayDialog.tsx`) = แผงที่มุมสนามเหมือนกัน: Core ที่จะจ่าย/วางอยู่ใน `store.playCores` (Core บนกระดานแสดงวงสี คลิกเพื่อสลับ)
- แผงตัวเลือก (choice `option` ใน `PromptBar` → `OptionList` ใน Controls.tsx): ข้อความขึ้นต้น `ไม่/ข้าม/ยกเลิก` = ปุ่มเทาไว้ท้าย (`DECLINE`) · ข้อความซ้ำ = ปุ่มเดียว ×N · มีชื่อการ์ดในมือผู้เลือก = แผ่นมีภาพการ์ด (`cardInLabel`) · ตั้งชื่อ label ใหม่ให้เข้ากฎนี้ (ตัวเลือกไม่ทำอะไร ขึ้นต้นด้วย "ไม่…") ·
  Kagemusha = เลือกจากการ์ดในมือ (`kagemushaChoice` ใน store อ่าน step `kageSet` ของแต่ละตัวเลือก → การ์ดในมือเรืองแสง ป้าย KAGEMUSHA, ตัวที่ถูกเล็ง = `kageForce.orig` ป้าย "ถูกเล็ง", แถบมีแค่ปุ่ม "ไม่ใช้") · เปลี่ยน label/ลำดับ step ใน `kagemusha()` ของ effects.ts ต้องดูตัวนี้ด้วย
- ตั้งค่าการเล่นของผู้เล่น (ยืนยันโจมตี, เรียง/จับการ์ดในมือ, คลิกเดียวเล่น) อยู่ใน `src/prefs.ts` (localStorage, ไม่กระทบ engine)
- Chain นอกการต่อสู้: นับเอฟเฟกต์ตั้งแต่ action ล่าสุดของผู้เล่น (`chainFloor` ใน store, ไม่นับ choose/passFlash/moveCores)
- **ประสิทธิภาพกราฟิก**: แสงเรืองกระพริบ (inline style fx-choice-glow / fx-flash-glow / fx-tag-glow / phase-btn-pulse) ถูกแทนด้วย ::before/::after ที่สลับ opacity ใน index.css (ห้ามใช้ ::before/::after เองบน element ที่ใส่แสงเหล่านี้)
  · แอนิเมชันที่วนตลอดให้ขยับเฉพาะ transform/opacity และไม่ใช้ตัวแปร CSS ใน keyframes (การ์ดจอทำแทนไม่ได้)
- ไอคอนใช้ SVG ใน `components/Icon.tsx` (อีโมจิ/สัญลักษณ์พิเศษเป็นกล่องว่างบน Windows 7)
- สี Tailwind v4 เป็น `oklch()`: ถ้าอัปเดต Tailwind ให้รัน `npm run legacy-colors`
- โหมดออนไลน์: `?online=local` ใช้ transport ในเครื่อง (ทดสอบสองแท็บได้โดยไม่ต้องมี Firebase) · `&lag=<ms>` = จำลองเน็ตช้าของแท็บนั้น
- **ต่อ Realtime Database เฉพาะตอนใช้** (`holdDb` / `withDb` ใน online/firebase.ts · แผนฟรีรับพร้อมกัน 100): เมธอดของ `firebaseTransport` ถูกห่อให้อัตโนมัติ (ตัวฟัง `watch*` = ต่อค้างตลอดที่ฟัง, ที่เหลือ = ต่อระหว่างทำ) · บัญชี (`firebaseCloud`) ห่อด้วย `withDb` · ไม่มีใครใช้ 30 วิ (`DB_IDLE_MS`) = `goOffline` · ใช้ฐานข้อมูลทางใหม่ต้องผ่าน transport หรือ `withDb` · ตัดการเชื่อมต่อ = onDisconnect ทำงาน (สมาชิก/ปิง/รายการห้องหาย) ระหว่างอยู่ในห้องต้องมีตัวฟังค้างไว้
- **ปิง / การเชื่อมต่อ (`online/net.ts` + `components/NetStatus.tsx`)**: ทุกที่นั่งเขียน `rooms/<code>/pings/<ที่นั่ง>` = `{ ms, n }` ทุก 3 วิ (ms = เวลาที่เซิร์ฟเวอร์ตอบรับครั้งก่อน, ลบเองเมื่อหลุด) ·
  `SeatPing` ข้างชื่อบน PlayerPlate / TeamMiniPlate · `NetWarning` = หลุด (`.info/connected` ผ่าน `transport.watchConnected`) / action ที่ส่งแล้วยังไม่กลับ (`markSent` ใน sendActions → `markEchoed` ใน receive) / ที่นั่งอื่นเงียบเกิน `STALE_MS`
- **บัญชีผู้ใช้ (`src/account/`)**: Firebase Auth (Google / Email) ผูกกับ uid ไม่ระบุตัวเดิม (`linkWithPopup` / `linkWithCredential`) · ซิงก์ชื่อ รูปโปรไฟล์ (`bs-avatar`) เด็ค และการตั้งค่า
  - **ต้องล็อกอินก่อนเข้าเกม** (เจ้าของโปรเจกต์กำหนด): `App` แสดง `screens/Login.tsx` (หน้าไตเติล + แผงเข้าสู่ระบบ) จนกว่าจะล็อกอินและแตะเริ่ม · ออกจากระบบ = กลับหน้าไตเติล
    ทดสอบ UI ด้วย `?online=local` (บัญชีจำลอง) หรือเรียก `account.signUpEmail(...)` จาก `/src/account/account.ts` ก่อนเรียก `__game`
  - ข้อมูลอยู่ที่ `profiles/<uid>` (คนล็อกอินอ่านได้) และ `users/<uid>` (เจ้าของเท่านั้น) · เด็คเก็บเป็นรหัส `c:...` (RTDB ตัด null ใน array ทิ้ง ห้ามเก็บ `foils` ตรง ๆ)
  - เก็บในเครื่องก่อนเสมอ แล้ว `account.ts` เช็กการเปลี่ยนแปลงทุก 2.5 วิส่งขึ้น · ดึง+รวมตอนล็อกอิน/เปิดแอป/กลับมาที่แท็บ (`merge.ts` ฟังก์ชันล้วน มีเทสต์ `merge.test.ts`)
  - การตั้งค่าที่ซิงก์ = รายชื่อคีย์ localStorage `SETTING_KEYS` ใน account.ts: เพิ่มการตั้งค่าใหม่ที่อยากให้ตามบัญชี ให้ใส่คีย์ที่นี่ + วิธีใช้ค่าใหม่ใน `applySettings`
  - `?online=local` หรือไม่มีค่า Firebase = บัญชี/คลาวด์จำลองใน localStorage (`localCloud.ts`) ทดสอบซิงก์ได้โดยไม่ต้องมีเน็ต
  - หน้าต่างที่เปิดจาก element ที่มี `backdrop-blur` ต้อง `createPortal` ไป body ไม่งั้น `position: fixed` ถูกจำกัดอยู่ในกรอบนั้น
- หน้า DUEL (`screens/Lobby.tsx`, screen `'lobby'`): เมนูการดวล → Room Match → สร้างห้อง / รายการห้อง → หน้าห้อง
  ห้องดวล (`store.duel`, ฟังก์ชัน `duel*` ใน store) อยู่ที่ `rooms/<code>` = `DuelRoom`: สมาชิก ≤6 (`members`, ลบเองเมื่อหลุด), โต๊ะ (`tables/<n>`: seats / ready / game)
  ทั้งสองที่นั่งกดพร้อม → เครื่องที่นั่ง p1 สร้างห้องเกม `rooms/<code>-<id>` (โครงสร้างห้องเกม 2 คนเดิม: setup/actions) แล้วตั้ง `tables/<n>/game`
  ผู้เล่นทั้งสองเข้าด้วย `enterRoom` เดิม · ผู้ชม = `enterRoom(..., spectator)` (`online.spectator`: mine/controls เป็น false, มือคว่ำทั้งสองฝ่าย)
  ผู้เล่นออกจากเกม = โต๊ะกลับไปรอพร้อมใหม่ · รายการห้องอยู่ที่ `lobby/<code>` (count/max) · โหมด `?online=local` ใช้ path tree ใน localStorage
  **ห้องค้าง**: ทุกห้องจดเวลาล่าสุดที่ `rooms/~index/<code>` (`touchRoom` ตอนเข้า + ทุก 10 นาทีระหว่างอยู่) · เปิดรายการห้อง = `sweepRooms` ลบห้องที่เงียบเกิน 12 ชม. (`removeRoom`: ห้อง + `-chat` + lobby + ดัชนี, ชั่วโมงละครั้งต่อเครื่อง) ·
  เจ้าของปิดห้องดวล = ลบห้องเกมของโต๊ะที่ไม่มีคนนั่งด้วย · ผู้เล่นคนสุดท้ายออกจากเกมของโต๊ะ = ลบห้องเกม · ห้องใหม่ที่มีข้อมูลยาวต้องเข้าทาง `removeRoom` ไม่งั้นค้าง
  กฎ Realtime Database อยู่ที่ `database.rules.json` (+ `firebase.json`) ไม่ได้ deploy อัตโนมัติ: แก้ path ใหม่ใน DB ต้องแก้ไฟล์นี้
  แล้วให้เจ้าของโปรเจกต์วางใน Firebase Console → Realtime Database → Rules (หรือ `npx firebase-tools deploy --only database`)
  ไม่งั้น path ใหม่ถูกปฏิเสธ (เช่น `lobby` ใช้ไม่ได้ = รายการห้องว่าง แต่เข้าด้วยรหัสยังได้)
- **ไม่มีการกระทำ / หลุด (ออนไลน์ 1VS1, `components/AfkWatch.tsx` · เจ้าของโปรเจกต์กำหนด)**: เลือกเริ่มก่อน/หลัง 10 วิ (`PREGAME_CHOOSE_MS`, นับใน MatchIntro) หมดเวลา = สุ่มจาก seed (`pregameTimeout` → setFirst ที่นั่งไหนเขียนก่อนก็ได้ ค่าเดียวกัน) ·
  ระหว่างเกม รอคู่แข่ง (`actorOf`) แล้วไม่มี action ใหม่ 60 วิ = ป้าย "ถือว่าหลุด" · อีก 60 วิ = เครื่องเราส่ง `concede` + `timeout: true` แทนเขา (`forfeitOpponent`, EndReason `timeout`) ·
  คู่แข่งไม่เคยมี action ในรอบนี้เลย (`actedInRound`) = หลุดก่อนได้เล่น → แผง "ไม่นับผล" ออกได้โดยไม่บันทึก · Team Battle ยังไม่ใช้
- **Casual Match (จับคู่อัตโนมัติ 1VS1, `casualStart` / `casualCancel` ใน store, หน้าต่าง `CasualMatch` ใน Lobby.tsx)**: คิวที่ `match/queue/<MAJOR>/<uid>` (จับคู่เฉพาะเวอร์ชัน MAJOR เดียวกัน, หลุด = เซิร์ฟเวอร์ลบเอง) ·
  ทุก 2.5 วิ (`casualTick`): อัปเดตสัญญาณชีพ `seen` → คนที่มาทีหลังล็อกตัวเอง (`claimedBy` = ตัวเอง) แล้วจองคนที่รอนานที่สุดด้วย transaction (เรียงด้วย `at` แล้ว uid: สองคนไม่จองกันเอง) → สร้างห้องเกม `cm-…` (ผู้จอง = p1) แล้วเขียนรหัสห้องที่ `match/found/<uid>` ให้อีกฝ่ายเข้าเป็น p2
  · คนในคิวที่ "ยังมีชีวิต" = เห็น `seen` เปลี่ยนภายใน 10 วิตามนาฬิกาเครื่องเรา (ไม่เทียบนาฬิกาข้ามเครื่อง · ค้างนานกว่านั้นถูกลบ) · ถูกจองแต่ไม่มีห้องภายใน 15 วิ = ปลดเองกลับเข้าคิว
  · ออกจากเกม `cm-…` ครบทุกคน = ลบห้อง (เหมือนห้องของโต๊ะดวล) · รอเกิน 60 วิ หน้าต่างเสนอดวลกับบอท · ทดสอบ 2 แท็บ `?online=local` (แท็บละ uid)
  · หน้า Casual = `CasualPage` (view `'casual'`) · ประวัติ `casualHistory.ts` (localStorage `bs-casual-history` 50 เกม, บันทึกใน MatchResult · id = รหัสห้อง-รอบ)
  · **Replay** (เก็บในเครื่อง `bs-casual-replays` 30 เกม): `ReplayData` = seed + เด็ค + ผู้เริ่มก่อน + action ทั้งหมดของห้อง (จดใน `applyBuffered` → `replayLog`) · เล่นซ้ำด้วย applyAction + autoAdvance แบบเดียวกับออนไลน์
    · `store.replay` = โหมดดูอย่างเดียว (`dispatch` / `mine` / `controls` = ไม่ได้, มุมมอง/มือคว่ำตาม `replay.me` / `reveal`) · `ReplayBar` แทน PromptBar · `startReplay` / `replayStep` / `replaySeek` / `exitReplay`
    · ดูได้เฉพาะ MAJOR เดียวกัน (`replayPlayable`) เพราะ engine เปลี่ยนแล้วเดินไม่ตรง · ทดสอบด้วยบอท 2 แท็บ: แท็บพื้นหลังไม่เล่นแอนิเมชัน (headless) ต้อง `Page.bringToFront` สลับแท็บ
- **แจ้งปัญหา (`components/ReportDialog.tsx`)**: ส่งเข้า Discord ผ่าน Webhook ห้องละตัว (Forum: แจ้งบั๊ก / การ์ดทำงานผิด / ข้อเสนอแนะ) จาก GitHub variables `VITE_REPORT_WEBHOOK_BUG` / `_CARD` / `_IDEA` (ไม่ตั้ง = ไม่มีประเภทนั้น, ไม่ตั้งเลย = ซ่อนปุ่ม) ·
  URL อยู่ในโค้ดหน้าเว็บ (ไม่มีเซิร์ฟเวอร์): ปิด @ ทุกแบบ + ส่งได้ 1 ครั้ง/นาที/เครื่อง · แจ้งจากในเกมแนบ `game-state.json` (สถานะเกมทั้งหมด) · ห้องข้อความธรรมดาไม่รับ `thread_name` = ส่งซ้ำแบบไม่มี · ติดแท็ก Forum อัตโนมัติ = รหัสแท็กใน `TAGS` (รหัสผิด = ส่งซ้ำแบบไม่ติดแท็ก)
- **โพสต์อัปเดตเข้า Discord**: หลัง deploy สำเร็จ `scripts/post-update.mjs` ส่ง changelog ของเวอร์ชันที่ใหม่กว่า commit ก่อนหน้าเข้าห้อง "อัปเดตเกม" (Secret `DISCORD_UPDATE_WEBHOOK` · ไม่ตั้ง = ข้าม · ทดสอบ `node scripts/post-update.mjs --dry`) → ข้อความ changelog = ข้อความที่ผู้เล่นเห็นใน Discord ด้วย
- **บทเรียน (`src/tutorial/`)**: เมนู TUTORIAL หน้าหลัก + ชวนเล่นครั้งเดียวสำหรับ ID ใหม่ (บัญชีสร้างตั้งแต่ `TUTORIAL_SINCE`, กดข้ามได้): ค้างฉากวาร์ปของ Login.tsx (`WarpOut hold`) แล้วขึ้นแผง: ตั้งชื่อ (`WelcomeName`) → เลือกรูปโปรไฟล์ (`WelcomeAvatar`) → ชวนเล่นบทเรียน · ป้ายในหน้าหลักเป็นทางสำรอง · ใช้การ์ด SD01 · กล่องข้อความล้วน (เจ้าของโปรเจกต์กำหนด)
  - `lessons.ts` = ข้อมูลบทเรียน: `setup()` จัด state ด้วย engine (เด็คไม่สับ, `put` วางการ์ดลงสนาม) · ขั้น = `focus`/`allow` (selector ที่ส่องไฟ/กดได้), `expect` (action ที่รอ), `until` (รอ state), `draw` (โชว์หน้ากดจั่ว), `free` (เล่นอิสระ: action ฝั่งเราได้หมด กล่องข้อความย่อ) · `bot` = คู่แข่งตัดสินใจ (null = `smartBot`: จั่ว/อัญเชิญเทิร์นละ 1 ถ้า `botSummons`/โจมตี/ป้องกันเมื่อ BP สูงกว่า/ผ่าน Flash) · `passed` = ด่านที่ต้องชนะ (แพ้ = ลองใหม่)
  - `tutorial.ts` = ตัวรัน: `store.setTutorialHooks` กั้น action ใน `dispatch` (นอกขั้นตอน = ไม่ทำ) · `startScripted(state)` เริ่มเกมไม่มีฉากเปิด · มุมมองคงที่ฝั่ง p1 ระหว่างเรียน
  - `TutorialOverlay.tsx` = ไฟส่อง + กล่องข้อความ + บล็อกการกดทุกที่ (capture) ยกเว้นจุดใน focus/allow ของขั้นที่รอ action
  - จุดที่ส่องไฟใช้ `data-tutorial="..."` (turn-badge, step-<สเต็ป>, play-panel, hand-menu, phase-btn = PASS, prompt-<key> = ปุ่มในแถบคำสั่ง เช่น prompt-opt0 / prompt-pay · `data-tutorial-lock` = ปุ่มมุมซ้ายบนที่กดไม่ได้แม้เล่นอิสระ) และ data-* เดิม (`data-life`, `data-reserve`, `data-hand-card` ฯลฯ): เปลี่ยน UI ตรงนี้ต้องดูบทเรียนด้วย
  - ความคืบหน้า = localStorage `bs-tutorial` (อยู่ใน `SETTING_KEYS` ซิงก์ตามบัญชี)

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
- Service Worker (`public/sw.js`) ห้าม cache `version.json` / `asset-manifest.json` · ชื่อ CACHE `bs-dual-v2` ต้องตรงกับ `src/gameData.ts` (ห้ามเปลี่ยน = ข้อมูลที่ผู้เล่นดาวน์โหลดไว้หาย)
- **ดาวน์โหลดข้อมูลเกมทั้งหมด** (`src/gameData.ts` + `components/GameDataUi.tsx`, ตั้งค่า → ข้อมูลเกม): build เขียน `asset-manifest.json` (ทุกไฟล์ใน assets/ + ขนาด) → โหลดเก็บใน Cache ทีละ 6 ไฟล์ ·
  SW ตอบ assets/ จาก cache ก่อนเสมอ (ชื่อไฟล์มีแฮช) + ตัด Range (เพลง) จากไฟล์เต็มที่เก็บไว้ · เลือกโหลดไว้ (`bs-fulldata`) = เวอร์ชันใหม่แพตช์ส่วนที่ขาด + ลบไฟล์เก่าให้เอง · dev = unsupported (ทดสอบด้วย `vite preview` + build ที่ตั้ง `VITE_PERF_HOOKS=1` → `__gameData`)
- ห้องออนไลน์เก็บเวอร์ชันของแต่ละที่นั่ง (`rooms/<code>/versions`, เขียนแยกหลังสร้าง/เข้าห้อง): MAJOR ไม่ตรง = เข้าห้องไม่ได้ / เจ้าของห้องเห็นคำเตือน
  ดังนั้นการแก้ engine ที่ทำให้ผลการเล่นเปลี่ยน **ต้องขึ้น MAJOR** ไม่งั้นคนละเวอร์ชันจะเข้าห้องเดียวกันแล้วเดินไม่ตรงกัน

## Git / deploy

- commit และ push **เฉพาะเมื่อเจ้าของโปรเจกต์สั่ง** · **ทำงานบน branch `Dev`** (commit/push เข้า `Dev` ได้เมื่อสั่ง · push เข้า `Dev` ไม่รัน Actions ไม่ deploy)
- **ขึ้นเว็บ** = รวม `Dev` เข้า `main` แล้ว push `main` (เฉพาะเมื่อเจ้าของโปรเจกต์สั่งให้ขึ้นเว็บ) แล้วกลับมาทำงานต่อบน `Dev`
- หลัง push: GitHub Actions รันเทสต์ + build + deploy Pages · รอผลจาก
  `https://api.github.com/repos/Fillybodyknow/Battle-Spirits-Dual-TH/actions/runs?head_sha=<sha>` แล้วรายงาน
- ค่า Firebase อยู่ใน environment variables ของ GitHub (`VITE_FIREBASE_*`) ไม่อยู่ใน repo
