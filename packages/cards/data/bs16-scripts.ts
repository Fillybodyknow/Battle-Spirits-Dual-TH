/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 16 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS25 สีแดง / ขาว / ม่วง)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger เปิดใบบนสุดเด็คคู่แข่งไปแทรช คอสต์ต่ำกว่าอัลติเมทนี้ = ฮิต → then
 * Critical Hit: ต่อจาก U Trigger ที่ฮิต "ถ้าการ์ดที่ฮิต…, นอกจากนี้…" = when({ uTriggerCard: ตัวกรอง }, ...)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const U345 = [3, 4, 5];
const U45 = [4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const STAR_DRAGON = 'มังกรดวงดาว';
const DRAGON_MAN = 'มนุษย์มังกร';
const REBORN = 'ร่างคืนจุติ';
const draw = (count = 1): Step => ({ do: 'draw', count });
const ARMED = 'อาวุธ';
const ARMOR_DRAGON = 'มังกรติดเกราะ';
const SYNTH = 'ทหารสังเคราะห์';
const HELL_LORD = 'เจ้านรก';
/** Curse: เมื่อสปิริตนี้โจมตี → เมื่อจบการต่อสู้ ทำลายสปิริตของคู่แข่งที่ป้องกันอยู่ตอนตัดสินผลการต่อสู้ 1 ตัว */
const curse = (levels: number[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'atBattleEnd' as const, steps: [{ do: 'curseResolve' as const }] }] });
/** Ultra Shield: ไม่รับผลเอฟเฟกต์ของสปิริต/อัลติเมท/เน็กซัส/เมจิค */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
const attackStep: Condition = { attackStep: true };
const oppAttackStep: Condition = { all: [{ attackStep: true }, { oppTurn: true }] };
const rush = (color: 'green' | 'white' | 'red' | 'purple' | 'yellow' | 'blue', n = 1): Condition => ({ rush: { color, count: n } });
/** "สีและเจ็มของสปิริตนี้ถือว่าเป็นสี...ด้วย" */
const alsoColor = (levels: number[], color: 'red' | 'blue') => [
  { kind: 'colorAlso' as const, levels, color },
  { kind: 'symbolAlsoColor' as const, levels, color },
];

/** มีอัลติเมท (สี color) ของเราอยู่บนสนาม */
const ownUltimate = (color?: 'red' | 'white' | 'purple'): Condition => ({ alliesMatchAtLeast: { filter: { types: ['ultimate'], ...(color ? { color } : {}) }, count: 1 } });
const ownAttackStep: Condition = { ownAttackStep: true };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** Spirit Soul: เมื่อเราอัญเชิญการ์ดอัลติเมท สปิริตนี้ได้รับเจ็มสีนี้เพิ่ม 1 เม็ด */
const spiritSoul = (levels: number[], color: 'red' | 'white' | 'purple') => ({ kind: 'summonSymbol' as const, levels, filter: { types: ['ultimate' as const] }, color, count: 1 });
/** "คอร์บนสปิริตนี้จะไม่กลายเป็น 0 เม็ดโดยเอฟเฟกต์ของผู้เล่นทุกคน" */
const coreNotZero = (levels: number[]) => ({ kind: 'coreFloor' as const, levels, self: true as const, filter: {}, min: 1, anyPlayer: true as const });
/** เซอร์ไวเวอร์: "สปิริตนี้จะไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง" */
const survivor = (levels: number[]) => ({ kind: 'destroyImmune' as const, levels, scope: { self: true as const } });
/** True-Rage (สปิริต/อัลติเมท) */
const trueRage: Step = { do: 'mustBlock' };

export const BS16_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- แดง (BS25)
  'เดบริ-ซาร์ด': [spiritSoul(ALL2, 'red'), coreNotZero(ALL2)],
  'มูนโบว์ ดรากูน': [{ kind: 'trigger', on: 'destroyedBySpiritEffect', levels: ALL3, steps: [draw()] }],
  'เซอร์ไวเวอร์นีโอ-อาร์ค': [
    survivor(ALL3),
    coreNotZero(ALL3),
    { kind: 'trigger', on: 'attack', levels: L23, steps: [when(ownUltimate(), [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }, draw()])] },
  ],
  'ริวแมน ทีเกอร์': [
    [
      { kind: 'staticBp', levels: ALL2, if: { all: [ownAttackStep, { not: ownUltimate() }] }, scope: { own: { types: SPIRIT, families: [DRAGON_MAN, STAR_DRAGON] } }, amount: 3000 },
      { kind: 'staticBp', levels: ALL2, if: { all: [ownAttackStep, ownUltimate()] }, scope: { own: { types: SPIRITISH, families: [DRAGON_MAN, STAR_DRAGON] } }, amount: 5000 },
    ],
    { kind: 'trigger', on: 'allyAttack', subject: { types: ['ultimate'], family: DRAGON_MAN }, levels: [2], ownTurnOnly: true, noStack: true, steps: [draw()] },
  ],
  ดาร์คแมทเทอร์ดราก้อน: [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'returnFromTrash', filter: { types: ['spirit', 'ultimate'], color: 'red', maxCost: 5 } }] },
    coreNotZero(ALL3),
    { kind: 'maxLevelAllies', levels: ALL3, filter: { types: ['ultimate'], nameIncludes: ['ไก-อสุรา'] }, ownAttackStepOnly: true },
  ],
  'ริวแมน ไลท์นิ่ง': [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { byOpponent: true, card: { families: [REBORN, DRAGON_MAN] } },
      levels: ALL3,
      attackStepOnly: true,
      steps: [{ do: 'activateHandBurst', filter: { color: 'red' } }],
    },
    // ไม่บอกระยะเวลา = จนจบการต่อสู้
    { kind: 'trigger', on: 'attack', levels: [3], steps: [{ do: 'noOpponentDestroyTriggers' }] },
  ],
  'ช้างเพลิงระเบิด แม็กซิมัส': [{ kind: 'handCostSet', levels: ALL3, filter: { names: ['ช้างเพลิงระเบิด แม็กซิมัส'] }, cost: 3, if: ownUltimate('red') }],
  'เรือบรรทุกไดโนเสาร์ อาพาโท': [
    { kind: 'allyCostSet', levels: ALL2, if: ownAttackStep, filter: { types: ['ultimate'], family: REBORN }, cost: 6 },
    { kind: 'allyCostSet', levels: [3], if: ownAttackStep, filter: { types: ['ultimate'], family: REBORN }, cost: 7 },
  ],
  'อัลติเมท ซีคเวิร์ม': [
    // ได้รับ True-Rage = เมื่อสปิริต/อัลติเมทเผ่ามังกรดวงดาวของเราโจมตี
    // subject: บังคับป้องกันตัวที่โจมตี (ไม่ใช่ซีคเวิร์มเอง)
    { kind: 'trigger', on: 'allyAttack', subject: { card: { types: SPIRITISH, family: STAR_DRAGON } }, levels: U345, steps: [{ do: 'mustBlock', subject: true }] },
    uTrigger(U45, [{ do: 'buffSelf', amount: 10000, untilBattleEnd: true }]),
  ],
  'อัลติเมท เอ็กซ์-คาลิบัส': [
    uTrigger(U345, [
      { do: 'destroyChosenOpponent', filter: { types: SPIRIT }, bpFrom: 'self' } as Step,
      when({ uTriggerCard: { maxCost: 3 } }, [{ do: 'battleLifeIfBlocked', amount: 1, blocker: { types: SPIRIT, maxBp: 6000 } }]),
    ]),
  ],
  แนวกางเขนแห่งดวงดาว: [
    { kind: 'reductionAlso', levels: ALL2, filter: { types: ['spirit'], color: 'red' }, from: 'red', to: 'ultimate', count: 1 },
    { kind: 'trigger', on: 'allyBlocked', subject: { card: { types: SPIRIT, family: STAR_DRAGON } }, levels: [2], ownTurnOnly: true, steps: [{ do: 'buffSubject', amount: 5000, untilBattleEnd: true }] },
  ],
  'นีโอ แอกเกรสซีฟเรจ': [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000, ally: true, filter: { color: 'red' } }, { do: 'rageChosenThisTurn' }] },
  ],
  'นีโอ คอลล์ออฟลอสต์': [
    { kind: 'burst', on: 'afterOpponentSummonEffect', steps: [draw(2), { do: 'payToUseFlash', main: true }] },
    { kind: 'magic', timing: 'main', steps: [{ do: 'returnFromTrash', filter: { types: ['spirit', 'ultimate'], color: 'red', maxCost: 7 } }] },
  ],
  'อัลติเมท ไก-อสุรา': [
    uTrigger([3, 4, 5, 6], [
      { do: 'allCoresToSelf', then: [{ do: 'opponentLifeToReserve', count: 1 }] },
      when({ uTriggerCard: { types: ['spirit'] } }, [{ do: 'returnFromTrash', filter: { types: ['spirit'] } }]),
    ]),
    { kind: 'trigger', on: 'attack', levels: [4, 5, 6], steps: [{ do: 'battleDestroyedCoresToVoid' }] },
  ],
  // ---------------------------------------------------------------- ขาว (BS25)
  'ทหารจักรกล ฟรุงนีร์': [
    {
      kind: 'activated',
      levels: ALL3,
      timing: 'attackFlash',
      label: 'เสื่อมสภาพสปิริตนี้: สปิริต/อัลติเมทของเรา 1 ตัว BP+ เท่ากับ BP ของสปิริตนี้ (ในเทิร์นนี้)',
      if: { all: [{ oppTurn: true }, { not: { selfExhausted: true } }] },
      steps: [{ do: 'exhaustSelf' }, { do: 'buffChosen', amount: 0, ally: true, amountFrom: 'exhaustedBp' }],
    },
    { kind: 'effectImmune', levels: L23, if: { all: [{ selfExhausted: true }, { not: { selfInBattle: true } }] }, scope: 'self', types: ['spirit', 'brave', 'magic'] },
  ],
  'แทงก์โมบิล เฮทเซอร์': [
    [
      { kind: 'staticBp', levels: ALL2, if: { all: [{ not: { opponentHasBurst: true } }, { not: ownUltimate() }] }, scope: { own: { types: SPIRIT, family: ARMED } }, amount: 3000 },
      { kind: 'staticBp', levels: ALL2, if: { all: [{ not: { opponentHasBurst: true } }, ownUltimate()] }, scope: { own: { types: SPIRITISH, family: ARMED } }, amount: 5000 },
    ],
    { kind: 'trigger', on: 'block', levels: ALL2, steps: [{ do: 'voidCore', to: 'otherAlly', count: 1, filter: { types: SPIRIT, family: ARMED } }] },
  ],
  'เซอร์ไวเวอร์อุล-ดีเฟนเดอร์': [
    survivor(ALL3),
    {
      kind: 'trigger',
      on: 'block',
      levels: ALL3,
      steps: [{ do: 'buffSelf', amount: 2000, untilBattleEnd: true }, when(rush('blue'), [draw(2), { do: 'discard', count: 2 }])],
    },
  ],
  'สตาร์ดราย-อัน': [alsoColor([1], 'blue'), alsoColor(L23, 'red')],
  เกรย์การ์ม: [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { byBattle: true, card: { types: ['ultimate'], color: 'white' } },
      levels: ALL3,
      attackStepOnly: true,
      steps: [{ do: 'subjectToHand' }, { do: 'refreshSelf' }],
    },
    {
      kind: 'activated',
      levels: [3],
      timing: 'attackFlash',
      label: 'ส่งคอร์ทั้งหมดบนสปิริตนี้ไปแทรช: ฟื้นสภาพอัลติเมท แกรน-โวเดน 1 ตัว',
      if: { allyHas: { types: ['ultimate'], nameIncludes: ['แกรน-โวเดน'], state: 'exhausted' } },
      steps: [{ do: 'selfCoresToTrash', count: 99 }, { do: 'refreshChosenAlly', filter: { types: ['ultimate'], nameIncludes: ['แกรน-โวเดน'] } }],
    },
  ],
  'ซันสโตน ดรากูน': [
    {
      kind: 'trigger',
      on: 'oppAttackStepStart',
      levels: L23,
      steps: [{ do: 'forceAttackChosen', noHolder: true }, when(rush('blue'), [{ do: 'disableChosenOpponent', filter: { types: SPIRIT } }])],
    },
  ],
  'โมบิล โกเล็ม': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'voidCore', to: 'otherAlly', count: 1, filter: { types: SPIRIT, family: SYNTH } }] },
    alsoColor(ALL2, 'blue'),
  ],
  'เทพธิดาโชคชะตา เวลซันดี': [
    { kind: 'effectImmune', levels: ALL3, scope: 'self', colors: ['red', 'purple'], types: ULTRA },
    { kind: 'uTriggerCostBoost', levels: L23, if: oppAttackStep, filter: { types: ['spirit', 'ultimate'], family: ARMED }, amount: 1 },
    { kind: 'refreshWithOpponent', levels: [3] },
  ],
  'ฮิสุย แคนนอน ดราก้อน': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit', 'ultimate'], family: ARMOR_DRAGON }, noTriggers: true }] },
    { kind: 'staticBp', levels: L23, if: oppAttackStep, scope: { own: { types: SPIRITISH, family: ARMOR_DRAGON } }, amount: 3000 },
  ],
  'อัลติเมท โมโนเคร็อก': [
    { kind: 'blockWhileExhausted', levels: [3, 4], if: oppAttackStep },
    { kind: 'trigger', on: 'block', levels: [4], steps: [{ do: 'uTrigger', then: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }] }] },
  ],
  'อัลติเมท อิกดราซิล': [
    uTrigger(U345, [{ do: 'bounceOpponent', filter: { types: SPIRIT } }]),
    { kind: 'trigger', on: 'attack', levels: U45, steps: [when({ not: { opponentHas: { types: SPIRIT } } }, [{ do: 'battleUnblockable' }])] },
  ],
  'นครหุ้มเกราะ ชีลด์เนีย': [
    { kind: 'effectImmune', levels: ALL2, scope: { own: { types: SPIRITISH, color: 'white', minLevel: 3 } }, colors: ['green'], types: ULTRA },
    { kind: 'staticBp', levels: [2], if: oppAttackStep, scope: { own: { types: SPIRITISH, hasUltraShield: true } }, amount: 3000 },
  ],
  ลานล่าของมังกรติดเกราะ: [
    { kind: 'staticBp', levels: ALL2, if: attackStep, scope: { own: { types: SPIRITISH, family: ARMOR_DRAGON } }, amount: 2000 },
    { kind: 'opponentNoSummonTriggers', levels: [2] },
  ],
  ไวท์แคร็ก: [
    { kind: 'handReductionBonus', levels: [], reduction: { blue: 2 }, ifOpponentNoBurst: true },
    { kind: 'magic', timing: 'main', steps: [{ do: 'bounceOpponent', filter: { types: ['nexus'] }, to: 'deckTop' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000 }] },
  ],
  'นีโอ ดรีมริบบอน': [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'refreshAllAllies', filter: { types: SPIRIT, color: 'white' } }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'bounceOpponent', filter: { types: SPIRITISH } }] },
  ],
  'เรือรบมังกรติดเกราะ เอ็นเตอร์ไพรซ์': [
    [
      { kind: 'effectImmune', levels: ALL3, scope: 'self', colors: ['red', 'purple', 'white', 'yellow'], types: ULTRA },
      { kind: 'maxLevelIf', levels: ALL3, if: rush('blue', 2) },
      { kind: 'blockTriggersOnAttack', levels: ALL3, if: rush('blue', 2) },
    ],
    { kind: 'trigger', on: 'block', levels: ALL3, steps: [{ do: 'onBattleWin', steps: [{ do: 'refreshSelf' }, { do: 'opponentLifeToReserve', count: 2 }] }] },
  ],
  'อัลติเมท แกรน-โวเดน': [
    uTrigger(U345, [
      { do: 'keepBounceRest', keep: { uTriggerCost: true } },
      when({ uTriggerCard: { minCost: 3 } }, [{ do: 'bounceOpponent', filter: { types: SPIRIT }, count: 3 }]),
    ]),
    {
      kind: 'trigger',
      on: 'attack',
      levels: [5],
      steps: [
        may(
          'เสื่อมสภาพสปิริตเผ่า [อาวุธ] ของเรา 1 ตัว: ทิ้งเบิร์สของคู่แข่ง',
          [{ do: 'exhaustOwn', filter: { types: SPIRIT, family: ARMED, state: 'refresh' } }, { do: 'discardOpponentBurst' }],
          { all: [{ allyHas: { types: SPIRIT, family: ARMED, state: 'refresh' } }, { opponentHasBurst: true }] },
        ),
      ],
    },
  ],
  // ---------------------------------------------------------------- ม่วง (BS25)
  'อัศวินสิงห์ยมโลก อาโลเคน': [
    spiritSoul(ALL2, 'purple'),
    { kind: 'replaceDestroy', levels: [2], subject: { self: true }, battle: true, discard: { types: ['spirit'], color: 'purple' }, state: 'exhausted' },
  ],
  โบนเซเบอร์ไทเกอร์: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'costBoostThisTurn', filter: { types: ['ultimate'], color: 'purple' }, amount: 1 }] },
    { kind: 'trigger', on: 'destroyed', levels: ALL2, steps: [{ do: 'costBoostThisTurn', filter: { types: ['ultimate'], color: 'purple' }, amount: 1 }] },
  ],
  เซอร์ไวเวอร์วาซาโก: [
    survivor(ALL3),
    {
      kind: 'trigger',
      on: 'oppMagicUse',
      subject: { card: { textIncludes: ['จบแอทแท็คสเต็ป'] } },
      levels: L23,
      if: ownUltimate(),
      steps: [{ do: 'opponentDiscards', count: 2 }],
    },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [draw()] },
  ],
  รูนมาสเตอร์นาคา: [
    {
      kind: 'trigger',
      on: 'endStep',
      zone: 'trash',
      levels: [],
      steps: [may('อัญเชิญรูนมาสเตอร์นาคาจากแทรช (จ่ายคอสต์)', [{ do: 'summonFromTrash', filter: { names: ['รูนมาสเตอร์นาคา'] } }])],
    },
    curse(ALL2),
  ],
  'มาร์ควิสยมโลก โฟคาลอร์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [may('ทิ้งการ์ดในมือ 1 ใบ: จั่ว 2 ใบ', [{ do: 'discard', count: 1 }, draw(2)], { handAtLeast: 1 })] },
    // ผลอยู่ใน U Trigger ของอัลติเมท เบลเซบีท (อัญเชิญได้ 2 ใบ)
    { kind: 'textOnly', levels: L23 },
  ],
  'ทหารม้ายมโลก เอลิเกล': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [draw(), when(ownUltimate(), [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }])] },
  ],
  'กระทิงยมโลก โมแร็กซ์': [
    {
      kind: 'activated',
      levels: ALL2,
      timing: 'attackFlash',
      label: 'ทำลายสปิริต/อัลติเมทเผ่า [เจ้านรก] ของเรา 1 ตัว: จั่ว 1 ใบ',
      if: { allyHas: { types: SPIRITISH, family: HELL_LORD } },
      steps: [{ do: 'destroyOwn', filter: { types: SPIRITISH, family: HELL_LORD } }, draw()],
    },
    { kind: 'trigger', on: 'allyAttack', subject: { card: { types: ['ultimate'], families: [REBORN, HELL_LORD] } }, levels: [2], ownTurnOnly: true, steps: [{ do: 'blockTax', reserveToTrash: 0, fieldToTrash: 1 }] },
  ],
  'ดาร์คเวิร์ม โนวา-เรมแนนต์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'destroyAllOpponentBraves', bothSides: true }] },
    { kind: 'noBraving', levels: ALL3 },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT, state: 'exhausted' }, direct: true }, when(ownUltimate(), [{ do: 'buffSelf', amount: 10000, untilBattleEnd: true }])],
    },
  ],
  'แมวงูยมโลก ไอนี่': [
    { kind: 'handDrawBoost', levels: [], amount: 1 },
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [may('ให้เอฟเฟกต์ [เมื่อสปิริตนี้ถูกทำลาย] ของสปิริตอื่นของเราทำงาน (ไม่ต้องทำลาย)', [{ do: 'fireAllyDestroyedTriggers', filter: { types: SPIRIT, excludeNames: ['แมวงูยมโลก ไอนี่'] } }])],
    },
    { kind: 'trigger', on: 'destroyed', levels: L23, steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, to: 'void' }] },
  ],
  'อัลติเมท บาคูลัส': [
    { kind: 'trigger', on: 'allyDeckMilled', milled: { types: ['ultimate'] }, levels: U345, steps: [{ do: 'opponentLifeToReserve', count: 1 }] },
    uTrigger(U45, [{ do: 'removeOpponentCores', count: 1, untilOne: true, filter: { types: SPIRIT } }]),
    { kind: 'trigger', on: 'attack', levels: [5], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }] },
  ],
  'อัลติเมท เบลิท': [
    { kind: 'trigger', on: 'summon', levels: [3, 4], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, per: { allies: { types: ['ultimate'] } } } as Step] },
    {
      kind: 'trigger',
      on: 'destroyed',
      levels: [4],
      steps: [
        {
          do: 'uTrigger',
          fromTrash: true,
          then: [
            may(
              'ทำลายสปิริตของคู่แข่งที่เสื่อมสภาพ 1 ตัว: นำอัลติเมทนี้กลับขึ้นมือ',
              [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }, { do: 'selfFromTrashToHand' }],
              { opponentHas: { types: SPIRIT, state: 'exhausted' } },
            ),
          ],
        },
      ],
    },
  ],
  'นครยมโลก แอนเทโนรา': [
    { kind: 'trigger', on: 'allySummoned', subject: { types: ['ultimate'], minCost: 4 }, levels: ALL2, ownTurnOnly: true, mainStepOnly: true, steps: [draw()] },
    {
      kind: 'trigger',
      on: 'ownAttackStepStart',
      levels: [2],
      steps: [may('ทิ้งการ์ดในมือ 1 ใบ: ในเทิร์นนี้ สปิริต/อัลติเมทเผ่า [เจ้านรก] ทั้งหมดของเรา BP+2000', [{ do: 'discard', count: 1 }, { do: 'buffAllies', amount: 2000, filter: { types: SPIRITISH, family: HELL_LORD } }], { handAtLeast: 1 })],
    },
  ],
  เบรฟครีเมชัน: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted', hasBraves: true } }, { do: 'drawIfBravesStay', count: 2 }] },
  ],
  'นีโอ พอยซันชูต': [
    { kind: 'magic', timing: 'main', steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRITISH } }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 5000 }] },
  ],
  'อัลติเมท เบลเซบีท': [
    uTrigger(U345, [
      // โฟคาลอร์ Lv2/Lv3 ของเรา (แอทแท็คสเต็ปของเรา): อัญเชิญได้ 2 ใบ
      when(
        { allyHas: { nameIncludes: ['โฟคาลอร์'], minLevel: 2 } },
        [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], color: 'purple' } }, { do: 'summonFromTrashFree', filter: { types: ['spirit'], color: 'purple' } }],
        [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], color: 'purple' } }],
      ),
      when({ uTriggerCard: { maxCost: 3 } }, [{ do: 'removeOpponentCores', count: 1, perPick: 99, to: 'trash', filter: { types: SPIRIT } }]),
    ]),
    { kind: 'trigger', on: 'allyAttackHitLife', levels: U45, ownTurnOnly: true, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }] },
  ],
};
