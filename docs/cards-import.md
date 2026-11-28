# นำการ์ดใหม่เข้าเกม (งานต่อเนื่อง · อ่านก่อนทำต่อ)

งานนำการ์ดจากภาพญี่ปุ่น (BS24, BSC15, BSC16, BS25) เข้าเกม ทำทีละสี (~20 ใบ/แบตช์) ตามที่เจ้าของโปรเจกต์ตกลง
จบแต่ละแบตช์ = typecheck + เทสต์ + build ผ่าน แล้วให้เจ้าของโปรเจกต์ดู changelog ก่อน commit/push

## วัตถุดิบ: `cards-list/`

- `cards-list/<ต้นรหัส>/<สี>/*.webp` ภาพการ์ดต้นฉบับ (ชื่อไฟล์ = `<ต้นรหัส>-<เลข>.webp`, X = `-X01`)
- `cards-list/BS24/<สี>.text`, `cards-list/BSC15.text`, `cards-list/BSC16.text`, `cards-list/BSC17.text` = ถอดจากภาพตามแม่แบบแล้ว (ภาษาไทย) **"ชุด: ?" ยังไม่กำหนด**
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
| BSC03 | BSC17 (18 อัลติเมททุกสี) | ✅ (57.0.0 · ชุด bsc03: data/bsc03-scripts.ts + loadBSC03Cards · ถอดจากภาพเอง: `cards-list/BSC17.text`) |
| BSC04 | BSC18 (48 ดีว่าสีเหลือง) | ✅ (58.0.0 · ชุด bsc04: data/bsc04-scripts.ts + loadBSC04Cards · ถอดจากภาพเอง: `cards-list/BSC18.text` · ชื่อใหม่ยังไม่ได้ให้เจ้าของโปรเจกต์ตรวจ) |
| BS18 | BS26 แดง (16) + ขาว (15) + ม่วง (15) | แดง ✅ (63.0.0 · ชุด bs18: data/bs18-scripts.ts + loadBS18Cards · ถอดจากภาพเอง: `cards-list/BS26/แดง.text` · ชื่อ/เผ่าใหม่ยังไม่ได้ให้เจ้าของโปรเจกต์ตรวจ) · ขาว ✅ (63.0.0 · `cards-list/BS26/ขาว.text`) · ม่วง ✅ (63.0.0 · `cards-list/BS26/ม่วง.text` · ครบ 46 ใบ) |
| BS19 | BS26 เขียว (16) + เหลือง (15) + ฟ้า (14) | เขียว ✅ (64.0.0 · ชุด bs19: data/bs19-scripts.ts + loadBS19Cards · `cards-list/BS26/เขียว.text`) · เหลือง ✅ (64.0.0 · `cards-list/BS26/เหลือง.text`) · ฟ้า ✅ (64.0.0 · `cards-list/BS26/ฟ้า.text` · ครบ 45 ใบ) |

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

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS18 แดง)

- **Trigger Counter** = ability `triggerCounter` (การ์ดในมือ) · ใน step uTrigger ตอนฮิต (ทั้งเดี่ยว/Double) ถ้าเจ้าของเด็คมีการ์ดนี้ → แทรก step ภายใน `triggerCounterAsk` ก่อน then (ถามเจ้าของเด็ค) →
  `triggerCounterUse` = `s.queue.unshift` เอฟเฟกต์ใหม่ของเจ้าของการ์ด (ทำก่อนผลฮิตที่เหลือ): เบรฟ/สปิริต = payForSummon + ifOnField(steps) · เมจิค = `payToUseCounter` (payCost → ออกจากมือ, magicUsed, ลงแทรชเมื่อจบ)
  · ตัวแปลงรับบรรทัดที่ขึ้นต้น `Trigger Counter` (ทุกประเภท)
- trigger `uTriggerGuarded` (การ์ดในมือ: U Trigger ของเราถูก Guard) · `oppSummoned` (การ์ดคู่แข่งบนสนาม: การ์ดของเราถูกอัญเชิญ, subject = ตัวที่อัญเชิญ)
- step `bpDestroyBoostBattle` (`card.battleBpDestroy` ใน bpDestroyBoostFor) / `bpDestroyUltimateBattle` (`card.battleBpDestroyUlt`: destroyChosenOpponent ที่มี maxBp เพิ่ม 'ultimate' ในเป้า) ล้างใน endBattle / leaveField
- `summonFromHandFree.then` (step ภายใน `ifSummoned`: ทำต่อเมื่ออัญเชิญสำเร็จ รวมเบรฟที่ร่วมร่าง · อิฟริต)
- step `handCostLifeThisTurn` (`state.turnHandCostLife` ใน baseCost) · ability `ultimatesAsSpiritsForSummon` (summonConditionOk เติม 'ultimate' ใน alliesMatchAtLeast) · `ignoreSummonCondition.always` (ไม่ต้องจ่ายโซลคอร์)
- ตัวกรอง `maxSymbols` / `hasBravedEffect` / `bpBelowAttacker` · `gainLifeFromVoid.maxLife` · `symbolChosenAllyThisTurn.filter` · `trashCoresSpread.filter` · `revealTakeAll.rest: 'top'`
- ตัวแปลง: เงื่อนไขอัญเชิญ "สปิริตคอสต์ตั้งแต่ N ขึ้นไปของเรา…"
- คำ/เผ่าใหม่: 星将 = ขุนพลดวงดาว · 光導 = ดาราจักร · 次代 = รุ่นใหม่ (เจ้าของโปรเจกต์กำหนด) · ยังไม่ได้ตรวจ: 星魂 = วิญญาณดวงดาว · 三龍神 = สามเทพมังกร · 空牙 = เขี้ยวเวหา · 爬獣 = สมิงเลื้อยคลาน (ตาม BS24)

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS18 ขาว)

- ability `targetDodge` (ซิกเฟซุล: ตกเป็นเป้าของเอฟเฟกต์คู่แข่ง → ทิ้งการ์ดในมือ 1 ใบ = ไม่รับผล) · ตรวจที่จุดเดียวกับ Kagemusha (step ใน `KAGE_STEPS`): `dodgeOffer` แทรกเอฟเฟกต์ถามของเจ้าของไว้หน้าคิว
  แล้วลงผลต่อด้วย `applyPicks` (ตัดเป้าที่อยู่ใน `state.dodged`) · `item.dodgeAsked` กันถามซ้ำในเอฟเฟกต์เดียว
- trigger `uTriggerGuarded` ทำงานกับการ์ดบนสนามด้วย (subject = อัลติเมทที่ถูก Guard) · step `refreshBattlingUltimateNoAttack` (`turnLocks.attackOnly`)
- step `ownBraveToHand` (+ then) / `immuneAlliesThisTurn` (`state.turnImmuneAll` ใน effectBlocker) / `opponentBottomsOwn` · `onBattleHitLife.target: 'subject'` · `lifeShieldThisTurn.braved`
- ability `summonConditionMinCost` (ผู้เล่นทุกคน: summonConditionOk เติม minCost ใน alliesMatchAtLeast) · เงื่อนไข `mainStep` / `battleAttacker` / `lifeLostAtLeast` (holds) / `ownBraveHas` · ตัวกรอง `noTextIncludes`

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS18 ม่วง)

- replaceDestroy `oppUltCore` (สม็อกชีพ) / `millSelfIf` (โบนริตเตอร์: บังคับ ทิ้งใบบนสุด ตรง = อยู่ต่อ · step `ifMilled.else`) / `uTriggerStay` (เดวิด: บังคับ U Trigger ฮิต = then + อยู่ต่อ · U Trigger เดี่ยวจด `item.uTriggerHits` แล้ว)
- `removeOpponentCores.depletedToDeckTop` (คิลเมดีส: ถามก่อนส่งคอร์ → `coresOff.toDeckTop`) · `item.depletedIds` (depleteByOpponent) → เงื่อนไข / CountPer `depletedByThis` · step `coresOffEveryOpponent`
- `blockTax.discardFilter` / `.lifeToReserve` + `.ultimatesOnly` (payBlockTax รับ blockerId · loseLife `noBurst`) · trigger ถูกทำลายจด `destroyerId` (ผู้ทำลาย/คู่ต่อสู้) → เงื่อนไข `destroyedBy`
- subject `exhaustedByOpponentEffect` (allyExhausted) · CountPer `returnedByThis` (returnAllFromTrash) · ability `triggerCounterFree` (โทรเมอา) · Trigger Counter ของเบรฟใช้ `ifSummoned` (ร่วมร่างก็ทำงาน)
- เผ่า (ยังไม่ได้ให้เจ้าของโปรเจกต์ตรวจ): 呪鬼 = มารต้องสาป (ตามอัลติเมทม่วง BS24/25) · 魔神 = เทพมาร

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS19 เขียว)

- ผลฮิตของ U Trigger ที่มี Trigger Counter รออยู่ = ห่อด้วย step ภายใน `uTriggerHitGate` · step `guardUTriggerIf` (ใน Trigger Counter) หาเอฟเฟกต์ที่รอ gate ในคิว แล้วตั้ง `guarded` = ไม่ทำผลฮิต + trigger `uTriggerGuarded`
- step `lockRefreshOpponent` (`state.refreshLocks`) / `exhaustUltimateBattle` (`card.battleExhaustUlt`: exhaustOpponent เติม 'ultimate') / `peekOpponentDeckTop` / `revealTopSummonBelowSubject` (payForSummon รับใบบนสุดเด็ค) / `deckCardToTrash`
- `refreshOnBattleWin.ultimatesOnly` (`battle.refreshOnWinUlt`) · `turnTrigger.on: 'allyUltExhausted'` (queueExhaustTriggers) · replaceDestroy `toHand` + `then`
- ability `opponentCostBoost` (fieldCost) / `unblockableByExhausted` (`exhaustedBlockBanned` ใน blockersFor) · เงื่อนไข `battleOpponentUltimate`
- เผ่า: 剣獣 = ศาสตราสมิง · 刃虫 = แมลงดาบ · 爪鳥 = กรงเล็บวิหค · 殻人 = มนุษย์แมลง (ตาม BS24/25) · 殻虫 = แมลงปีกแข็ง (เจ้าของโปรเจกต์กำหนด)

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS19 เหลือง)

- อิลลูชันมิเรอร์ = step `mirrorUTriggerHit` (ตั้ง `mirrored` ที่ gate) → ระหว่างผลฮิต `item.mirrored` = `opp` ใน execStep เป็นผู้ควบคุมเอง (**execStep ใช้ `opp` แทน `opponentOf(me)` ทุกจุดแล้ว: step ใหม่ต้องใช้ `opp`**) · step ภายใน `mirrorEnd`
- step `treatAsUnblocked` / `battleBpSubstitute` (`battle.bpSub` ใน resolveBattle) / `ownSpiritCoreToTrash` · `negateChosenThisTurn.untilBattleEnd` (`negatedCards[].battle` ล้างใน endBattle) · `revealTakeAll.thenSummon` (→ revealSummon ที่เหลือ) · `ownBraveToHand.ofSelf`
- ability `triggerCounterMagicFree` (payToUseCounter ไม่ถามจ่าย) / `alliesUnblockableBy` (`alliesUnblockableBlocked` ใน blockersFor) / `opponentAttackBan` (`opponentAttackBanned` ใน canAttackWith · granted ได้) · `depletionSave.lifeCore` ("สามารถ" = ถามเจ้าของ: พักการสูญสลายด้วย `state.depletionHold` ที่ checkDepletion ข้าม → step ภายใน askDepletionSave / depletionLifeSave / depleteHeld · depletionSaveSource ข้ามแบบ lifeCore)
- ตัวกรอง `braveFamily` / `costIn` · เงื่อนไข `battleBlockedBy`
- `staticSources` ข้ามการ์ดที่ไม่มีความสามารถชนิดนั้นก่อนคำนวณเลเวล (เร็วขึ้น) · memo.test: กระดานสุ่มบางแบบ (BS32-X02 + คาราเวล โกเล็ม) คำนวณสด ~9 วิ (ปัญหาเดิม) ขยายเวลาเทสต์เป็น 180 วิ
- เผ่า (ยังไม่ได้ตรวจ): 楽族 = เผ่าดนตรี · 小玩 = ของเล่น · 戯狩 = นักล่าสนุก · 想獣 = สัตว์มายา (ตามของเดิม) · 天霊 = คนธรรพ์ · 神聖命 = Holy Life

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BS19 ฟ้า)

- Summon Bolt คอสต์สองค่า (a/b ไม่ใช่ช่วง) = ตัวช่วย `summonBolt()` ใน bs19-scripts (ตัวกรอง `costIn`) · step `summonBoltNoDestroy` (เบรฟอาร์โก: หา step อัญเชิญ summonBolt ในความสามารถของผู้ร่วมร่าง)
- เบรฟ `braveCondition.textIncludes` (ตัวแปลง: "ร่วมร่างกับสปิริตที่มี Summon Bolt" · ตรวจใน braveFits)
- `destroyedByThis[].id` + เงื่อนไข `destroyedByThisMatch` (destroyHighestCostOpponent จดแล้ว) · CountPer `bpSum` · `attackReserveTax.filter` (มีตัวกรอง = ไม่สนโซลคอร์)
- step `opponentHandColorBanMilled` (`state.handColorBans` ใน summonBanned / magicBanned) / `destroyBattlingUltByHitCost` (คอสต์จาก U Trigger ที่รอ gate) / `opponentDestroysOwnLowest`
- เผ่า: 闘神 = วิญญาณนักรบ · 獣頭 = สมิงหัว · 剣使 = จอมดาบ · 造兵 = ทหารสังเคราะห์ · 異合 = ร่างประกอบ (ตามของเดิม ยังไม่ได้ตรวจคู่ญี่ปุ่น)

## ข้อตกลงคำ/เผ่าที่เจ้าของโปรเจกต์ยืนยันแล้ว (ใช้ต่อ)

覚醒 = Evolution · 激突 = Rage · 重装甲 = Heavy Shield · 呪滅撃 = Destructive Curse · 新生 (BS24) = ร่างคืนจุติ (BS33/34 ใช้ "รุ่นใหม่" ตามเดิม) ·
滅龍 = มังกรล้างสังหาร · 武装 = อาวุธ · 動器 = จักรกลมีชีวิต · 空魚 = ปลาบิน · 怪虫 = ปรสิต · 無魔 = ผีอมตะ · 冥主 = เจ้านรก · 遊精 = หมู่ภมร ·
翼竜 = มังกรบิน · 戦竜 = มังกรศึก (คนละเผ่ากับ มังกรยุทธ์ ของยุคเซ็นโงคุ BS31–34) · 「バトルした時」 = "เมื่อ…โจมตี/ป้องกัน" (ไม่ใช้ "เมื่อ…ต่อสู้" เจ้าของโปรเจกต์กำหนด) · 星竜 = มังกรดวงดาว (เดิม มังกรดารา) · 護将 = ผู้พิทักษ์ · 神星 = เทพดวงดาว · 戦騎 = นักรบ · 調査員 = นักวิจัย · 戦獣 = สมิงสงคราม · 闘神 = วิญญาณนักรบ · 天霊 = คนธรรพ์ · 皇獣 = เจ้าสมิง · 古竜 = มังกรโบราณ · 地竜 = มังกรดิน · 歌鳥 = วิหคสังคีต · 漂精 = ภูตพเนจร · ペンタン = เพนต้น · ฟงนีน่า · โอเซโร เผ่า เจ้านรก/เงามาร

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

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BSC03)

- Double U Trigger = `uTrigger.double` (2 ใบ แต่ละใบฮิตได้: `item.uTriggerHits`) · "ต่อ U Trigger ที่ฮิต 1 ครั้ง" = CountPer `uTriggerHits` · Double Hit = เงื่อนไข `uTriggerHitsAtLeast` (ออร์แกนปีกทองคำไม่ถามกับ Double)
- `ultimateSymbolsAlso` (เจ็มอัลติเมทถือเป็นสีอื่น: `ultimateAlsoColors` ใน cardGems / fieldSymbolsRaw / payableCost / ownGemColors / gemColorCount · ตัวกันวนซ้ำ `checkingUltAlso`) · `lv1CostZero` (`lv1CostZeroSource` ใน cardLevelRaw / summonMinCores / checkDepletion · `checkingLv1Zero`)
- `noVoidGainBySpirits` (takeVoid: ต้นเหตุเป็นสปิริต/เบรฟ) · step `unblockableByUltimatesThisTurn` (`state.ultUnblockTurns` ใน blockersFor) · `catalyze.anyBurst` (เบิร์สที่ไม่ใช่โซลเบิร์ส) · `battleLifeIfBlocked.per` · `symbolThisTurn.color: ultimate`
- ตัวแปลง: เงื่อนไขอัญเชิญ "สปิริตสีA/Bของเรา…" (สีใดสีหนึ่ง = anyOf) / "อัลติเมทของเรา…" / "สปิริตเผ่า [X] ของเรา…"

## กลไกที่เพิ่มแล้วระหว่างงานนี้ (BSC04)

- My Unit: trigger `unitFormed` (สปิริตที่ใช้ My Unit · subject = ตัวที่นำมาวางชิด · ตัวช่วย `unitWith()` ใช้ `oncePerBatch`) / `placedInUnit` (ตัวที่ถูกนำไปวางชิด · subject = ตัวที่ใช้ My Unit) / `allyUnitFormed` (การ์ดของเราทุกใบ) ทำงานต่อจากเอฟเฟกต์ My Unit · step `myUnit` ใช้ตอนป้องกันได้ (`myUnit(..., { on: 'block' })`)
- `opponentTotalBp.action: 'noBlock'` (`battle.noBlockIds` ใน blockersFor) · `summonFromTrashFree.belowSubjectCost` / `.max` · `summonFreeHandOrTrash.zones: 'shown'` · `symbolThisTurn.target: 'subject'` · `blockExhaustedThisTurn.all` · ตัวกรอง `battlingTypes` / `maxBpSelf` (แปลงเป็น maxBp ตอนเริ่ม step) · CountPer `ownSymbols` · `revealPickRestTrash.per`
- ability `summonExhausted` (เซฟี่-แอริส: `summonExhaustedSource` ใน summon / placeCores / multiSummon) · `coreLock` (กาแล็กซี่เอ็กซ์โป: deployNexus + moveCores) · `oppNoBraveSpirit` ("ให้เบรฟอยู่ในรูปแบบสปิริตไม่ได้": action summon / placeCores → braveOrSpirit.noSpirit ร่วมร่างอย่างเดียว / multiSummon / แยกร่างใน action brave / braveFate = ลงแทรช · เบรฟที่ยืนเดี่ยวอยู่ก่อนลงแทรช `trashBannedBraves` ใน checkDepletion + ท้าย applyAction, event depleted.braveBan) · `onStageReplace.exhaustSelf` (แบ็คสเตจ) · `lifeDamageCap.minSymbols` · `maxLevelAllies.if` (นับการ์ดต้นเหตุเองด้วยถ้าตรงตัวกรอง: โอโอจิโระไทเกอร์ / เวนดี้-เคท) · `familyAlso.granted` + เงื่อนไข `selfFamily` (ชุดซานต้า)
- step `separateOwnBrave` / `separateOpponentBraves` (`separateBrave` → braveFate ของเจ้าของเบรฟ: อยู่ต่อด้วยคอร์จากรีเสิร์ฟ หรือลงแทรช) · `braveFromHandOnto` · `trashCoresSpread` · `selfToDeckBottom` · เบิร์ส afterAllyDestroyedByOpponent มี subject = สปิริตที่ถูกทำลาย (subjectToHand ของวินด์เซอร์เคิล / คอสตูมเชนจ์)
- ชื่อ/คำที่ใช้: ทีม ไชนี่ฮาร์ท / แอปโซลูท / พริตตี้เอนิมอลส์ / ทไวไลท์โกธิค / ลีเจนด์ดอล (ตามของเดิม) · 歌姫X = "นักร้อง X" · ชื่อใหม่: โลล่า-เบียคุรัน, โปรอน-ซาจิต้า, การ์เน็ต-รูตี้, เลโอน่า-ไลค์บูม, เวนดี้-เคท, ชูว, แคธี่-เรม, ไม-อาสึกะ, นักร้อง โรเมด้า, นักร้อง คาน่อน
