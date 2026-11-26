# นำการ์ดใหม่เข้าเกม (งานต่อเนื่อง · อ่านก่อนทำต่อ)

งานนำการ์ดจากภาพญี่ปุ่น (BS24, BSC15, BSC16) เข้าเกม ทำทีละสี (~20 ใบ/แบตช์) ตามที่เจ้าของโปรเจกต์ตกลง
จบแต่ละแบตช์ = typecheck + เทสต์ + build ผ่าน แล้วให้เจ้าของโปรเจกต์ดู changelog ก่อน commit/push

## วัตถุดิบ: `cards-list/`

- `cards-list/<ต้นรหัส>/<สี>/*.webp` ภาพการ์ดต้นฉบับ (ชื่อไฟล์ = `<ต้นรหัส>-<เลข>.webp`, X = `-X01`)
- `cards-list/BS24/<สี>.text`, `cards-list/BSC15.text`, `cards-list/BSC16.text` = ถอดจากภาพตามแม่แบบแล้ว (ภาษาไทย) **"ชุด: ?" ยังไม่กำหนด**
  เจ้าของโปรเจกต์ตรวจชื่อ/เผ่า/คำแล้ว (แก้ตามที่เขาบอกไว้ในไฟล์แล้ว) — ถ้าจะแก้คำ ให้แก้ทั้งใน cards-list และ assets ที่นำเข้าไปแล้ว
- ภาพซ้ำข้ามโฟลเดอร์ (การ์ดหลายสี): BS24-X03 อยู่ทั้งแดง/ขาว (นำเข้าครั้งเดียวกับแดงแล้ว) · BS24-088 อยู่ทั้งขาว/ม่วง (นำเข้ากับขาวแล้ว: **ไม่มีในไฟล์ ม่วง.text** อยู่แล้ว)

## แผนชุดในเกม (เจ้าของโปรเจกต์เลือก)

| ชุด | การ์ด | สถานะ |
|---|---|---|
| BS14 | BS24 แดง (21) + ขาว (20) + ม่วง (19) | แดง ✅ ขาว ✅ (50.0.0) · ม่วง ✅ (51.0.0) |
| BS15 | BS24 เขียว (20) + เหลือง (20) + ฟ้า (20) | เขียว ✅ (52.0.0 · สร้างชุด bs15 แล้ว) · เหลือง ✅ ฟ้า ✅ (53.0.0) |
| BSC01 | BSC15 (16) | ✅ (54.0.0 · ชุด bsc01: data/bsc01-scripts.ts + loadBSC01Cards) |
| BSC02 | BSC16 (42) | ✅ (54.0.0 · ชุด bsc02: data/bsc02-scripts.ts + loadBSC02Cards) · **ครบทุกชุดใน cards-list แล้ว** |

**การ์ด BSC = ชุดในเกมแยกชื่อ "BSC01, BSC02, …"** (เจ้าของโปรเจกต์กำหนด ไม่ใช้ BS16) · BSC15 = BSC01, BSC16 = BSC02 (แยกสองชุด) ·
`BOOSTER_SETS` (bot-helpers.ts) และแบนเนอร์ชุดล่าสุด (`useLatestBoosters` ใน Home.tsx) รับ `/^BSC?\d+$/` แล้ว (แบนเนอร์เรียงตามลำดับใน `loadAllCards()` = ชุดที่เพิ่มทีหลังอยู่บน)

## ขั้นตอนต่อแบตช์

1. `node scripts/import-cards-list.cjs cards-list/BS24/ม่วง.text BS14 cards-list/BS24/ม่วง` (รันไฟล์ละครั้ง)
2. `npm run cards` — ถ้าตัวแปลงไม่รับบรรทัดไหน ปรับถ้อยคำในไฟล์ assets (และ cards-list ให้ตรงกัน) หรือขยายตัวแปลง (`packages/cards/src/text-format.ts`)
3. เขียนสคริปต์ใน `packages/cards/data/bs14-scripts.ts` (ชุดใหม่: สร้างไฟล์ + loader + ใส่ใน `loadAllCards()`)
4. กลไกที่ยังไม่มี: เพิ่มใน DSL/engine ตาม CLAUDE.md แล้วเขียนเทสต์ใน `packages/engine/test/bs14.test.ts` (เทสต์แรกตรวจว่าทุกบรรทัดมีสคริปต์ + จำนวนการ์ดในชุด)
5. `npm run thumbs`, typecheck, เทสต์ทั้งหมด (บอทเล่นเด็คทุกชุดอัตโนมัติ), build · changelog (ขึ้น MAJOR ถ้า engine เปลี่ยน)

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS14)

- U Trigger = step `uTrigger.then` (+ CountPer `uTriggerCost`, ป้าย HIT/GUARD, 2VS2 เลือกเด็คคู่แข่ง) · ตัวช่วย `uTrigger()` ใน bs14-scripts
- Rage = `mustBlock.spiritsOnly` · เทิร์นพิเศษ = step `extraTurn` + เงื่อนไข `oncePerGameFree` · `levelPlus` · `destroyBurstBan` / step `noDestroyBurstThisEffect`
- `lifeImmuneLowCost`, `depletionSave`, `blockWhileExhausted.allies`, step `bounceOpponentBrave`, `turnTrigger.on: 'turnEnd'`, trigger `selfDrew`, `noStack` (ไม่แสดงผลซ้ำซ้อนต่อเหตุการณ์)
- ตัวกรอง `hasBraves` / `maxLevel` · เงื่อนไข `firstBattleOfTurn` / `chosenIs` · CountPer `selfSymbols` / `selfCores` / `refreshedByThis`
- ตัวแปลง: เงื่อนไขอัญเชิญ "สปิริตสีX ของเราตั้งแต่ N ตัว[ขึ้นไป]" (หลายสีคั่นด้วย "และ")
- ม่วง: Curse = trigger attack → `atBattleEnd` + step `curseResolve` (ผู้ป้องกันตอนตัดสินผล `battle.blockersAtResolve`, ตัวกรองภายใน `onlyIds`) · ตัวช่วย `curse()` ใน bs14-scripts ·
  Destructive Curse = `replaceDestroy.oppLife` (+ `subject.card` สำหรับ "ได้รับ Destructive Curse") · `lifeToVoidOnHit` (loseLife `to: 'void'`) · `stealOpponentVoid` (`stealVoid` ใน takeVoid / gainLifeFromVoid) ·
  step `discardOpponentShown` / `allyCoreToLife` (คอร์ธรรมดาเท่านั้น: **โซลคอร์ไม่ไปไลฟ์ เว้นแต่เอฟเฟกต์ระบุ** เจ้าของโปรเจกต์กำหนด · ตัวกรอง `minNormalCores`) · `summonFromTrashFree.noTriggers` (→ `placeCores.noTriggers`) · `staticBp.perOpponentPileCores` · `handCostDelta.ownMainStepOnly`

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS15)

- เขียว: `pairBlock.count` (ป้องกันด้วยสปิริต N ตัว ต่อสู้ตัวเดียว) + `.attacker: 'subject'` (บีฮีมอธ: allyAttack) · `cloneBp` (BP Lv1 ของร่างแยก: `cloneBpFor` ใน currentBpRaw) ·
  `cloneVoidCore` (ดังกาโร: placeCores.clone ถาม `fromVoid`) · `disableChosenOpponent.blockOnly` (`turnLocked(…, forBlock)`) · step `activateBunshin` (`bunshinOf`) ·
  `coreFloor.self` · `opponentLifeToReserve.to: 'void'` · โยโรอิฟุคุโร "เปิดแสดงการ์ดอัลติเมทในมือ" = มีผลเมื่อมีการ์ดอัลติเมทในมือ (ไม่ถาม)
- เหลือง: `replaceDestroy.exhaustOpp` (วอตชิโน) · SubjectFilter `maxCost` · `unblockableByCost.maxLevel` (maxCost ไม่บังคับแล้ว) · `summonSymbol.perAllies` · magic `useIf` (engine useMagic + `handMagicTimings` ในเว็บ) ·
  `noEffectRefresh` (ใน `noRefreshSource` เมื่อ byEffect) · `magicDrawDouble` (step draw ถาม `libAsked`) · step `revealTopIf` / `battleIndestructibleSelf` (`battle.noDestroy`) / `uTriggerCostUnblock` (`blockFilter`) /
  `magicBounceLifeThisTurn` (`state.magicBounceLife` ตรวจใน `returnCard`) / `battleNoCompare` (`battle.noCompare` → event `battleCancelled`) · `summonFromHandFree.per` (คูณ max) · `useMagicFromHandFree.filter.withShown` · `refreshOnBattleWin` ใช้กับผู้ป้องกันได้

- ฟ้า: `replaceDestroy.exhaustOwn` · `destroyChosenOpponent.costPlusPer` · trigger `oppSpiritDestroyed` · oppDeckMilled `milledMax` + subject `uTriggerMill` + item.milled จาก trigger (CountPer `milledByThis`) ·
  `attackOncePerTurn` (`state.attackedThisTurn` / `attackOnceLocked`) · `ignoreOppNoMill` (`millBlockSources`) · step `doubleBpSelf` / `forceBlockChosen` (`state.forcedBlockers` / `forcedBlocker` ใน blockForced + declareBlock) ·
  `burstMagicBan.magicOnly` · `noLifeFromVoid.opponentOnly` · `opponentDiscards/DiscardTo.withShown` · oppBurstActivated ทำงานกับการ์ดบนสนามด้วย

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BSC01)

- step `opponentCoresDownToOne` (ซาโตริดีมอน) / `bounceOpponentBurst` (event `burstToHand`, 2VS2 เลือกเบิร์สคู่แข่งแบบ OPP_ONE_BURST_STEPS) · `exhaustAllOpponent.bothSides` ·
  `opponentCannotAttack.filter` (`attackBans[].filter`) · `lifeShieldThisTurn.maxCost` / `.spiritsOnly` (ตรวจที่ `lifeShielded` ใน rules.ts) · `depletionSave.selfVoid` (ทัวร์มาลีน: ทำเองไม่ถาม) ·
  trigger `allyBurstActivated` ทำงานจากแทรช (`zone: 'trash'`) · เงื่อนไข `handHas.count`

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BSC02)

- step `winGame` (EndReason `effectWin`) · `revealTopToShown` (นอกมือ) · `showFromHandAny` (+ CountPer `shownByThis`) · `alliesToBottomReveal` (ฮาร์ดบีท: revealSummon `noTriggers`) · `trashCoreToVoid` · `battleUnblockableLevel` (`battle.unblockLevels`)
- คัทลียา: step `timingLockChosen` → `state.timingLocks` + `timingLocked()` ใน rules.ts (ดูข้อความบรรทัด "แอทแท็คสเต็ปของคู่แข่ง" / "เมื่อสปิริตนี้ป้องกัน" · ตรวจใน staticSources, staticBp, extraSymbol, ป้องกันขณะเสื่อมสภาพ, Flash, queueTriggers)
- ทีมจากเบรฟ = ability `teamAlso` (granted) + `cardTeams()` ใช้แทน `def.teams` · ตัวกรอง `braveNamed` / `minLevel` / `shownOnly` · เงื่อนไข `alliesMatchAtLeast.distinctNames` · CountPer `max`
- trigger `onStageSummoned` (allyOnStage: subject = ตัวที่ On Stage อัญเชิญ: `item.onStageSummonedId`) · `maxLevelThisTurn.target: subject` · `blockTax.fieldToTrash` · `unblockableByCost.bySpirits`
- `debuffChosenOpponent.untilBattleEnd` / `buffChosen.untilBattleEnd` + `amountFrom: exhaustedBp` (exhaustOwn จด `item.exhaustedBp`) · `replaceDestroy.ask` (toHand แบบถาม)

## ข้อตกลงคำ/เผ่าที่เจ้าของโปรเจกต์ยืนยันแล้ว (ใช้ต่อ)

覚醒 = Evolution · 激突 = Rage · 重装甲 = Heavy Shield · 呪滅撃 = Destructive Curse · 新生 (BS24) = ร่างคืนจุติ (BS33/34 ใช้ "รุ่นใหม่" ตามเดิม) ·
滅龍 = มังกรล้างสังหาร · 武装 = อาวุธ · 動器 = จักรกลมีชีวิต · 空魚 = ปลาบิน · 怪虫 = ปรสิต · 無魔 = ผีอมตะ · 冥主 = เจ้านรก · 遊精 = หมู่ภมร ·
歌鳥 = วิหคสังคีต · 漂精 = ภูตพเนจร · ペンタン = เพนต้น · ฟงนีน่า · โอเซโร เผ่า เจ้านรก/เงามาร
