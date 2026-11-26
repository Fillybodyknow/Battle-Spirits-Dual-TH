# นำการ์ดใหม่เข้าเกม (งานต่อเนื่อง · อ่านก่อนทำต่อ)

งานนำการ์ดจากภาพญี่ปุ่น (BS24, BSC15, BSC16, BS25) เข้าเกม ทำทีละสี (~20 ใบ/แบตช์) ตามที่เจ้าของโปรเจกต์ตกลง
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
| BSC02 | BSC16 (42) | ✅ (54.0.0 · ชุด bsc02: data/bsc02-scripts.ts + loadBSC02Cards) |
| BS16 | BS25 แดง (14) + ขาว (17) + ม่วง (15) | แดง ✅ ขาว ✅ ม่วง ✅ (55.0.0 · ครบ 46 ใบ) |
| BS17 | BS25 เขียว (14) + เหลือง (14) + ฟ้า (17) | เขียว ✅ เหลือง ✅ ฟ้า ✅ (56.0.0 · ครบ 45 ใบ) |

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
「バトルした時」 = "เมื่อ…โจมตี/ป้องกัน" (ไม่ใช้ "เมื่อ…ต่อสู้" เจ้าของโปรเจกต์กำหนด) · 星竜 = มังกรดวงดาว (เดิม มังกรดารา) · 護将 = ผู้พิทักษ์ · 神星 = เทพดวงดาว · 戦騎 = นักรบ · 調査員 = นักวิจัย · 戦獣 = สมิงสงคราม · 闘神 = วิญญาณนักรบ · 天霊 = คนธรรพ์ · 皇獣 = เจ้าสมิง · 古竜 = มังกรโบราณ · 地竜 = มังกรดิน · 歌鳥 = วิหคสังคีต · 漂精 = ภูตพเนจร · ペンタン = เพนต้น · ฟงนีน่า · โอเซโร เผ่า เจ้านรก/เงามาร

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS16 แดง)

- Critical Hit = เงื่อนไข `uTriggerCard` (การ์ดที่ U Trigger ของเอฟเฟกต์นี้วาง: `item.uTriggerCardId`) ใช้ใน when ต่อจาก then ของ uTrigger · `coreFloor.anyPlayer` (ไม่เป็น 0 แม้เอฟเฟกต์ของเรา: `coreFloorOf(..., ownEffect)`) · `destroyImmune.scope.self` (เซอร์ไวเวอร์)
- trigger `destroyedBySpiritEffect` (ถูกทำลาย/สูญสลายโดยเอฟเฟกต์ของสปิริต/อัลติเมทของใครก็ได้) · step `activateHandBurst` (เบิร์สในมือ ไม่สนเงื่อนไข) · `noOpponentDestroyTriggers` (`battle.noDestroyTriggers` / `.thisTurn`) · `rageChosenThisTurn` (`state.turnRage`) · `allCoresToSelf` · `battleDestroyedCoresToVoid` (destroy ใน ctx.ts)
- ability `allyCostSet` (ใน fieldCost) · `reductionAlso` (payableCostInner ลองทั้งสองแบบ) · `battleLifeIfBlocked.blocker` / `.soulAttacker` (เดิมบังคับโซลคอร์ทุกใบ) · `buffSubject.untilBattleEnd`

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS16 ขาว)

- `uTriggerCostBoost` (การ์ดของเราที่ U Trigger คู่แข่งเปิด ถือว่าคอสต์ +N · ใช้ต่อกับราเควล/ออร์แกนปีกทองคำของ BS17) · `refreshWithOpponent` (refreshStep ใน game.ts) · `blockTriggersOnAttack` · `opponentNoSummonTriggers` · `handReductionBonus`
- step `exhaustSelf` (จด exhaustedBp) · `onBattleWin` (`battle.winSteps`) · `keepBounceRest` (ฟิลด์ `keep`: ห้ามตั้งชื่อ `per` เพราะ engine ใช้ `per` เป็นตัวคูณของทุก step) · `forceAttackChosen.noHolder` · SubjectFilter `byBattle`
- ตัวกันวนซ้ำ `checkingMaxLevelIf` (maxLevelIf ที่เงื่อนไขนับเจ็ม เช่น Rush) อยู่ในเงื่อนไขของ memo

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS16 ม่วง)

- step `costBoostThisTurn` (`state.turnCostBoosts` ใน fieldCost) · `fireAllyDestroyedTriggers` (ไอนี่) · `drawIfBravesStay` → step ภายใน `drawIfAnyOnField` ท้ายคิว (หลัง braveFate · `item.destroyedBraves` จด ใน destroyChosenOpponent) · `destroyAllOpponentBraves.bothSides` · `uTrigger.fromTrash` (เบลิท: เทียบคอสต์บนการ์ด)
- ability `noBraving` (ใน braveRoom) · `handDrawBoost` (การ์ดในมือ: ตอนเริ่มดรอว์สเต็ปเข้าคิวถาม → discard + addDrawStepDraw) · `textOnly` (บรรทัดที่ผลอยู่ในการ์ดอื่น: โฟคาลอร์ → เบลเซบีท) · trigger `allyDeckMilled` (ตัวกรอง `milled`)

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS17 เขียว)

- ability `uTriggerGuard` (เซเบอร์เซเซริ: การ์ดที่ U Trigger ของอัลติเมทคอสต์ไม่เกิน N วางที่แทรช = ไม่ฮิต · ตรวจใน step uTrigger) · trigger `allyUTriggerHit` (subject = อัลติเมทที่ U Trigger ฮิต)
- step `cloneStack` (ไนท์ไอบิส: ร่างแยกซ้อน = เสื่อมสภาพตัวที่ซ้อน + `card.battleStack` คอสต์/BP ใน fieldCost / currentBpRaw ล้างใน endBattle/leaveField) · `activateBunshinAll` · step `atBattleResolve` ("เมื่อตัดสินผลการต่อสู้" バトル解決時 ≠ "เมื่อจบการต่อสู้" バトル終了時: `battle.resolveEffects` ทำตอนเริ่ม resolveBattle ก่อนเทียบ BP · ผู้ป้องกันหายหมด = จบการต่อสู้ไม่ลดไลฟ์) · ตัวกรอง "มี Quick" = `textIncludes: ['Quick']`

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS17 เหลือง)

- การ์ดใต้เน็กซัส (ออร์แกนปีกทองคำ) = `card.under` (ไม่อยู่ในโซนใด · leaveField ส่งลงแทรช) · step `deckToUnder` · ability `uTriggerUnderBoost` (ใน step uTrigger: วางที่แทรชแล้วถามเจ้าของเด็คก่อนตัดสินฮิต = `uTrigger.milledId` + step ภายใน `underBoost` → `s.uTriggerExtraCost`)
- trigger `uTriggeredByOpponent` (การ์ดที่ U Trigger ของคู่แข่งวางที่แทรช · ใช้คู่กับ `milledByOpponent` zone trash) · step `noMillThisTurn` (`state.noMillTurns` ใน millBlockSources) · `noMill.ownOnly`
- ability `lowBpLifeShield` (อาซาเอล: ใน lifeShielded) · `destroyImmune.fromTypes` (destroyImmuneSource รับประเภทการ์ดต้นเหตุ) · `coreStepBonus.noStack`
- step `onBattleHitLife` (`battle.hitLifeSteps`) · `battleUnblockableLowerLevel` (`battle.unblockLowerLevel` ใน blockersFor) · `symbolsZeroChosen.chosen` (debuffChosenOpponent ตั้ง chosenId · "BP0 ครั้งแรกในเทิร์นนี้" = `zeroThen`)

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS17 ฟ้า)

- Summon Bolt = ตัวช่วย `summonBolt()` ใน bs17-scripts (atBattleEnd → chooseOne: ทำลายตัวเอง + `summonFromHandFree.summonBolt`) · "ถูกอัญเชิญโดย Summon Bolt" = `item.summonBolt` → queueSummonTriggers `bySummonBolt` → เงื่อนไข `summonedBySummonBolt` / SubjectFilter `bySummonBolt`
- ธงโจรสลัด: `battle.bpDestroyed` (จดใน resolveBattle) + ability `summonBoltOnBattleLoss` + เงื่อนไข `summonBoltAfterBattleLoss` (เงื่อนไขที่ดูจากเอฟเฟกต์ในคิวซ้อนใน `all` ได้เฉพาะที่ระบุใน holds)
- `replaceDestroy.destroySource` / `.ownToo` (อาร์ชิบอลด์: แทนการถูกทำลายที่เราทำเอง · ถูกทำลายแต่อยู่ต่อ = trigger ถูกทำลายยังทำงาน) · ability `grantText` (คีย์เวิร์ดที่ได้รับ: ตัวกรอง textIncludes เห็นด้วย) · mill `count: subjectLevel`
- step `bigMillLifeThisTurn` (`state.bigMillLife` ตรวจใน step mill) · `peekOneHandDestroy` (เลือกการ์ดในมือคู่แข่งแบบคว่ำ → destroyChosenOpponent maxCost) · trigger `oppLifeLost` (ใน queueLifeLostTriggers)
- **ระวัง: `staticSources` ไม่ตรวจ `if` ของ ability** ความสามารถถาวรใหม่ที่มี `if` ต้องเรียก `conditionHolds` เอง
