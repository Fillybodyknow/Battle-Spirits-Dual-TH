/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 08 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import type { Color } from '../src/schema';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const NEXUS: CardFilter = { types: ['nexus'] };
/** Ultra Shield: ไม่รับผลเอฟเฟกต์ของสปิริต/อัลติเมท/เน็กซัส/เมจิค */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
/** คีย์เวิร์ด "Evolution, True-Rage, Showdown, Consecutive Blade, Infinite Blade แม้เพียงอย่างใดอย่างหนึ่ง" */
const KW = ['Evolution', 'True-Rage', 'Showdown', 'Consecutive Blade', 'Infinite Blade'];
const SUMING = 'สมิงหัว';
const MECHA_BEAST = 'สมิงจักรกล';
const EARTH_DRAGON = 'มังกรดิน';
const ARMORED_DRAGON = 'มังกรติดเกราะ';
const ALL3 = [1, 2, 3];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
/** ถ้าเงื่อนไขจริง ทำ steps */
const when = (cond: Condition, steps: Step[], otherwise?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(otherwise ? { else: otherwise } : {}) });

/** Showdown สตาร์ทสเต็ปของคู่แข่ง: เทียบ BP กับสปิริตที่คู่แข่งระบุ ทำลายเฉพาะสปิริตคู่แข่ง = then */
const showdown = (levels: number[], then: Step[]): ScriptAbility => ({ kind: 'trigger', on: 'oppStartStep', levels, steps: [{ do: 'showdown', then }] });

const COLORS: [Color, string][] = [
  ['red', 'แดง'],
  ['purple', 'ม่วง'],
  ['green', 'เขียว'],
  ['white', 'ขาว'],
  ['yellow', 'เหลือง'],
  ['blue', 'ฟ้า'],
];

export const BS08_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Magic
  ท่าจั่วเห็นผลในคราเดียว: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'revealPickRestTrash', count: 5, filter: { types: ['spirit'], textIncludes: KW }, rest: 'bottom' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000 }] },
  ],
  เฟลมมังกรคลั่ง: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 6000 } }, { do: 'battleLifeIfBlocked', amount: 1, soulAttacker: true }],
    },
  ],
  กำแพงผลึกขาว: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }, when(paidSoul, [{ do: 'lifeCapOneThisTurn' }])] },
  ],
  การอัญเชิญอันเปี่ยมล้นจากทะเล: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        { do: 'draw', count: 2 },
        { do: 'discard', count: 1 },
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, textIncludes: ['Rush'] }, if: paidSoul },
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000 }] },
  ],
  เพียวอีลิกเซอร์: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'refreshAllAllies', noAttack: true }] }],
  แอทแท็คชิฟท์: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'attackShiftThisTurn' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 10000, filter: { types: SPIRIT } }] },
  ],
  ดาบนี้คือปีกแห่งแสง: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'buffChosen', amount: 3000, ally: true },
        { do: 'blockExhaustedThisTurn', filter: { types: SPIRITISH }, target: 'chosen' },
      ],
    },
  ],
  ทลายครามกงล้อสวรรค์: [
    {
      kind: 'magic',
      timing: 'flash',
      // "อย่างละ 1 ตัว" = เล็ง 3 ตัวพร้อมกัน: Dispersion กระจายไม่ได้ (กติกา 14 Dispersion ข้อ 11)
      noDispersion: true,
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, cost: 0 } },
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, cost: 3 } },
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, cost: 5 } },
        { do: 'voidCore', to: 'reserve', count: 1, per: { destroyedByThis: true } },
      ],
    },
  ],
  บัสเตอร์ฟาแลงซ์: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'destroyAllBoth', filter: NEXUS }] },
    { kind: 'magic', timing: 'flash', steps: [when(paidSoul, [{ do: 'destroyAllOpponent', filter: NEXUS }])] },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.43 แบร์บุ๊ค': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { card: { textIncludes: ['Showdown'] } },
      levels: [1, 2],
      ownTurnOnly: true,
      mainStepOnly: true,
      steps: [{ do: 'trashCoreToReserve', count: 1 }],
    },
    { kind: 'staticBp', levels: [2], if: { anyAllySoul: true }, scope: { own: { textIncludes: ['Showdown'] } }, amount: 3000 },
  ],
  'No.15 นิวลากูน': [
    {
      kind: 'trigger',
      on: 'ownMainStepStart',
      levels: [1, 2],
      steps: [may('นำการ์ดอัลติเมทในมือไปวางแสดงนอกมือ: จั่ว 1 ใบ', [{ do: 'showFromHand', filter: { types: ['ultimate'] } }, { do: 'draw', count: 1 }], { handHas: { types: ['ultimate'] } })],
    },
    { kind: 'trigger', on: 'endStep', levels: [2], if: { soulInTrash: true }, steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRITISH, color: 'white' }, count: 3 }] },
  ],
  'No.2 บลูฟอเรส': [
    {
      kind: 'trigger',
      on: 'oppDestroyed',
      subject: { families: [SUMING], byEffect: true, types: SPIRITISH },
      levels: [1, 2],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'voidCore', to: 'ally', count: 2 }],
    },
    { kind: 'trigger', on: 'oppEndStep', levels: [2], if: { anyAllySoul: true }, steps: [{ do: 'opponentDiscardTo', keep: 3 }] },
  ],
  'ยานรบเครื่องกล ฟุทสึโนะมิทามะ': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }, { do: 'summonThisFree' }] },
    { kind: 'noLifeFromVoid', levels: [1, 2] },
    { kind: 'trigger', on: 'destroyed', levels: [2], steps: [{ do: 'selfFromTrashToHand' }] },
  ],
  อามิตะเนียวไรโช: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentHandIncreased',
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, minCost: 8 } }, { do: 'summonThisFree' }],
    },
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    // "ราชันดอกบัว เซ็นจู" ยังไม่มีในเกม
    null,
  ],
  ยอดแหลมแห่งหิมะพันปี: [
    {
      kind: 'trigger',
      on: 'startStep',
      levels: [1, 2],
      steps: [when(soulOnSelf, [{ do: 'bounceOpponent', filter: NEXUS, to: 'deckTop' }], [{ do: 'bounceOpponent', filter: NEXUS }])],
    },
    { kind: 'trigger', on: 'startStep', levels: [2], steps: [{ do: 'bounceOpponent', filter: { types: SPIRITISH } }] },
  ],
  'ปราสาทมังกรใหญ่-ฮนมารุ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      alsoDepleted: true,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 10000 } }, { do: 'summonThisFree' }],
    },
    { kind: 'staticBp', levels: [1, 2], if: { ownAttackStep: true }, scope: { ownSpirits: {} }, amount: 3000 },
    { kind: 'drawStep', levels: [2], extraDraw: [{ amount: 1 }] },
  ],

  // ---------------------------------------------------------------- Spirit (แดง)
  โดรามารุ: [{ kind: 'summonSymbol', levels: [1, 2], nameIncludes: ['ซามูไร-ดราก้อน', 'โซลดราก้อน'], color: 'red', count: 1 }],
  'กุนซือ โดรเดอร์ดราก้อน': [
    { kind: 'trigger', on: 'allyAttack', subject: { card: { textIncludes: KW } }, levels: ALL3, ownTurnOnly: true, steps: [{ do: 'draw', count: 1 }] },
  ],
  'ขุนศึกผู้งามสง่า เฮียวจินดราก้อน': [showdown(ALL3, [{ do: 'summonBanThisTurn', maxCost: 4, types: ['spirit', 'ultimate', 'brave'] }])],
  'มังกรนภาตะวัน เร็นเกียว': [
    { kind: 'evolution', levels: ALL3 },
    {
      kind: 'trigger',
      on: 'soulEvolvedOnto',
      levels: [3],
      if: { selfAttacking: true },
      oncePerTurn: true,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 20000 } }],
    },
  ],
  ฮัมเมอร์เดรค: [{ kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'ownCoreToVoid' }] }],
  ไทรซอร์ดอน: [
    { kind: 'staticBp', levels: [1], if: soulOnSelf, scope: { ownFamily: EARTH_DRAGON }, amount: 5000 },
    { kind: 'cannotBlockLowerBp', levels: [2] },
  ],
  สพิโนแอ็กซ์: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [
        may(
          'ส่งโซลคอร์ลงแทรช: ไม่ถูกป้องกันโดยสปิริตที่มีข้อความเอฟเฟกต์',
          [{ do: 'soulToTrash' }, { do: 'restrictBlockers', filter: { anyOf: [{ types: ['ultimate'] }, { noEffectText: true }] } }],
          soulOnSelf,
        ),
      ],
    },
  ],
  แลนซ์แรพเตอร์: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        when(paidSoul, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 10000 } }], [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 2000 } }]),
      ],
    },
  ],
  จูราสสิคเคิล: [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [when(paidSoul, [{ do: 'symbolAlliesThisTurn', filter: { families: [EARTH_DRAGON] }, color: 'red', count: 1 }])] },
    { kind: 'trigger', on: 'attack', levels: [1, 2], steps: [{ do: 'buffSelf', amount: 6000, untilBattleEnd: true }] },
  ],
  โฮมุแรดคอล: [
    [
      { kind: 'colorAlso', levels: [1, 2], color: 'green' },
      { kind: 'symbolAlsoColor', levels: [1, 2], color: 'green' },
    ],
    {
      kind: 'trigger',
      on: 'allyBurstActivated',
      subject: { color: 'green' },
      levels: [1, 2],
      steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, color: 'green' } }],
    },
  ],
  'ขุนศึกดาบใหญ่ ซันเกคิดราก้อน': [
    { kind: 'staticBp', levels: ALL3, scope: { own: { textIncludes: ['Showdown'] } }, amount: 2000 },
    showdown([2, 3], [when({ lifeAtMost: 3 }, [{ do: 'opponentLifeToReserve', count: 1 }])]),
  ],
  เซนโกคุคอนดอร์: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      steps: [{ do: 'destroyAllOpponent', filter: { types: SPIRIT, maxBp: 4000 } }, { do: 'summonThisFree' }],
    },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2],
      steps: [{ do: 'setBurstFromTrash', filter: { types: ['spirit', 'brave'], excludeNames: ['เซนโกคุคอนดอร์'] } }],
    },
  ],
  'ขุนศึกมังกรอัศวิน ไกชูว': [
    { kind: 'showdownBp', levels: ALL3, amount: 5000 },
    showdown(
      [2, 3],
      [{ do: 'chooseOne', options: COLORS.map(([c, th]) => ({ label: `เจ็ม${th}`, steps: [{ do: 'opponentSymbolMinusThisTurn', color: c }] as Step[] })) }],
    ),
  ],
  'มังกรผลึกใส เดียแมท': [{ kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, noSoul: true } }] }],
  'มังกรผู้ลุกตื่น สุเมรากิ-ดราก้อน': [
    { kind: 'trigger', zone: 'hand', on: 'allyDepletedByEvolution', levels: [], steps: [may('อัญเชิญการ์ดนี้ไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])] },
    {
      kind: 'trigger',
      on: 'allySoulEvolvedOnto',
      levels: [2],
      attackStepOnly: true,
      steps: [may('ฟื้นสภาพสปิริตนั้น', [{ do: 'markSubjectOnce', key: 'sumeragi' }, { do: 'refreshSubject' }], { subjectCanRefreshOnce: 'sumeragi' })],
    },
  ],
  'นกดึกดำบรรพ์ ฟินิเซียส': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        { do: 'destroyAllOpponent', filter: { types: SPIRIT, maxBp: 6000 } },
        { do: 'ifDestroyed', filter: { opponent: true }, steps: [{ do: 'voidCore', to: 'reserve', count: 2 }] },
      ],
    },
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], steps: [{ do: 'voidCore', to: 'ally', count: 1 }] },
  ],
  'มังกรยอดนักดาบ ซามูไร-ดราก้อน-อามาสึ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      if: soulOnSelf,
      steps: [
        may(
          'Infinite Blade: เลือกโจมตีสปิริต/อัลติเมทของคู่แข่ง 1 ตัว (สปิริตนี้ไม่เสื่อมสภาพ)',
          // เลือกเป้าแล้วเท่านั้นสปิริตนี้จึงไม่เสื่อมสภาพ ("เมื่อเป็นเช่นนั้น") · ตัวที่มี Shield เลือกไม่ได้ (กติกา 14 Infinite Blade)
          [{ do: 'chooseBlockers', direct: true, filter: { types: SPIRITISH } }, when({ directAttack: true }, [{ do: 'unexhaustSelf' }])],
          { opponentHas: { types: SPIRITISH } },
        ),
      ],
    },
    { kind: 'grantEvolution', levels: [2, 3], filter: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] } },
  ],

  // ---------------------------------------------------------------- Spirit (ขาว)
  ซาดุโร่คาบุโทคาเกะ: [
    { kind: 'effectImmune', levels: [1, 2], if: soulOnSelf, scope: { own: { types: SPIRIT, maxCost: 4 } }, colors: ['red', 'blue'], types: ULTRA },
  ],
  มูฉะลิซาร์ด: [
    { kind: 'summonSymbol', levels: [1, 2], filter: { types: ['ultimate'] }, color: 'white', count: 1 },
    {
      kind: 'trigger',
      on: 'destroyedByOpponentEffect',
      levels: [1, 2],
      // กติกา 10 ข้อ 1.2: เอฟเฟกต์เมื่อถูกทำลายทำงานขณะยังอยู่บนสนาม → คอร์ 3 เม็ดวางบนสปิริตนี้ แล้วกลับรีเสิร์ฟเมื่อการ์ดลงแทรช
      // engine ส่งการ์ดลงแทรชก่อนแล้ว: ผลเท่ากับนำคอร์วอยด์ 3 เม็ดวางรีเสิร์ฟเรา
      steps: [may('แสดงการ์ดอัลติเมทในมือ: นำคอร์วอยด์ 3 เม็ดวางบนสปิริตนี้ (กลับรีเสิร์ฟ)', [{ do: 'voidCore', to: 'reserve', count: 3 }], { handHas: { types: ['ultimate'] } })],
    },
  ],
  'มังกรเครื่องกล ชิโรงาเนะดราก้อน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT } },
        may('แสดงใบบนสุดเด็ค 4 ใบ: นำการ์ดอัลติเมททั้งหมดขึ้นมือ', [{ do: 'revealTakeAll', count: 4, filter: { types: ['ultimate'] }, rest: 'bottom' }], { all: [paidSoul, { deckAtLeast: 1 }] }),
      ],
    },
  ],
  'แปดอัศวินเก็นจิ โอโมดากะ-เดอะ-บูชิโด': [
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { nameIncludes: ['เก็นจิ'] },
      levels: ALL3,
      steps: [
        may(
          'นำสปิริต BP ไม่เกิน 10000 ของคู่แข่งกลับขึ้นมือ: ผู้โจมตีไม่ถูกป้องกันโดยสปิริต',
          [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 10000 } }, { do: 'ifBounced', steps: [{ do: 'battleUnblockable', by: 'spirits' }] }],
          { opponentHas: { types: SPIRIT, maxBp: 10000 } },
        ),
      ],
    },
  ],
  'E-วัลเชอร์': [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'bounceOpponent', filter: NEXUS }, { do: 'summonThisFree' }] },
    { kind: 'staticBp', levels: [2], if: soulOnSelf, scope: { ownFamily: MECHA_BEAST }, amount: 4000 },
  ],
  'มังกรเกล็ดเงิน นิธฮ็อก': [
    { kind: 'trigger', on: 'block', levels: [1, 2], steps: [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }] },
    { kind: 'blockWhileExhausted', levels: [2] },
  ],
  'สัตว์เครื่องกล โชวเอ็น': [
    { kind: 'kagemusha' },
    {
      kind: 'trigger',
      // "ถูกทำลาย/สูญสลายโดยเอฟเฟ็ค" (กติกา 10: แพ้เทียบ BP ไม่นับ)
      on: ['destroyedByOpponentEffect', 'depletedByOpponent'],
      levels: [2],
      oppTurnOnly: true,
      attackStepOnly: true,
      if: { kageTargeted: true },
      steps: [{ do: 'endAttackStepAfterBattle' }],
    },
  ],
  เอเลแฟนท์ไทท์: [
    { kind: 'trigger', on: 'block', levels: [1, 2], steps: [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }, { do: 'bounceOpponent', filter: { types: SPIRIT } }] },
  ],
  'มนุษย์จักรกล ลากูน่า': [{ kind: 'staticBp', levels: [2], scope: { ownSpirits: { color: 'white' } }, amount: 5000 }],
  เมโนอุดราก้อน: [
    { kind: 'staticBp', levels: [1, 2], if: soulOnSelf, scope: { own: { types: SPIRITISH, families: [ARMORED_DRAGON] } }, amount: 5000 },
    { kind: 'effectImmune', levels: [1, 2], scope: 'self', types: ['spirit', 'brave'] },
    [
      { kind: 'colorAlso', levels: [2], color: 'blue' },
      { kind: 'symbolAlsoColor', levels: [2], color: 'blue' },
    ],
  ],
  'สุนัขเครื่องกล อาคิตะ-ด็อก': [
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { family: MECHA_BEAST },
      levels: [1, 2],
      ownTurnOnly: true,
      if: soulOnSelf,
      steps: [{ do: 'blockTax', reserveToTrash: 0, discard: 1 }],
    },
  ],
  'เจ้าหญิงจักรกลผู้ลึกลับ โซล': [
    {
      kind: 'trigger',
      zone: 'hand',
      on: 'allyDestroyed',
      subject: { color: 'white', byOpponent: true, types: SPIRIT },
      levels: [],
      steps: [may('อัญเชิญการ์ดนี้ไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])],
    },
    { kind: 'blockWhileExhausted', levels: [1, 2] },
    { kind: 'trigger', on: ['destroyedByOpponent', 'depletedByOpponent'], levels: [1, 2], if: { oppTurn: true }, steps: [{ do: 'endAttackStepAfterBattle' }] },
  ],
  'แปดอัศวินเก็นจิ ทาเคะนาชิ ฟอร์เทรส': [
    { kind: 'burst', soul: true, on: 'afterOpponentAttack', steps: [{ do: 'summonThisFree' }] },
    { kind: 'effectImmune', levels: ALL3, scope: 'self', exceptNamed: ['เก็นจิ'] },
    {
      kind: 'trigger',
      on: 'oppEndStep',
      levels: [2, 3],
      if: { noLifeDamageThisTurn: true },
      steps: [{ do: 'summonFromHandFree', filter: { types: SPIRIT, nameIncludes: ['เก็นจิ'] } }],
    },
  ],
  'ภูตสถิตเกราะ ดีส': [
    {
      kind: 'trigger',
      on: 'blocked',
      levels: [1, 2],
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT, notInBattle: true } }, { do: 'ifBounced', steps: [{ do: 'voidCore', to: 'self', count: 2 }] }],
    },
    {
      kind: 'replaceDestroy',
      levels: [2],
      subject: { self: true },
      state: 'same',
      battle: true,
      auto: true,
      then: [{ do: 'refreshChosenAlly', filter: { types: SPIRITISH, notSelf: true } }],
    },
  ],

  // ---------------------------------------------------------------- Spirit (ฟ้า)
  'เจ้าแห่งน้ำ โอตโตะ': [{ kind: 'coreFloor', levels: [1, 2], filter: { types: SPIRITISH, families: [SUMING] }, min: 2 }],
  เทริโนะสุเกะแห่งคนขายยา: [
    { kind: 'summonSymbol', levels: [1, 2], filter: { types: ['ultimate'] }, color: 'blue', count: 1 },
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { families: [SUMING], paidWithSoul: true },
      levels: [1, 2],
      ownTurnOnly: true,
      mainStepOnly: true,
      steps: [{ do: 'voidCore', to: 'self', count: 1 }],
    },
  ],
  'มูฉะชายฝั่ง คิริซาเมะ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [
        { do: 'draw', count: 1 },
        { do: 'discard', count: 1 },
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 3 }, if: soulOnSelf },
      ],
    },
  ],
  'นักรบกระแสน้ำ เซย์จูโร่': [
    {
      kind: 'trigger',
      on: 'oppDestroyed',
      subject: { families: [SUMING], byEffect: true, types: SPIRITISH },
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [
        { do: 'draw', count: 2 },
        { do: 'discard', count: 1 },
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 } }] },
  ],
  ซาโซริซัน: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [
        may(
          'ส่งโซลคอร์บนสปิริตเผ่า [มนุษย์แมลง] ลงแทรช: ทำลายสปิริตคู่แข่งคอสต์ไม่เกินสปิริตนั้น',
          [{ do: 'allySoulToTrash', filter: { families: ['มนุษย์แมลง'] } }, { do: 'destroyChosenOpponent', filter: { types: SPIRIT }, costFrom: 'chosen' }],
          { all: [{ allyHas: { families: ['มนุษย์แมลง'], soul: true } }, { opponentHas: { types: SPIRIT } }] },
        ),
      ],
    },
  ],
  ชูม็อคแพนเธอร์: [
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [1, 2],
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 } },
        when({ all: [soulOnSelf, { opponentHandAtLeast: 4 }] }, [{ do: 'opponentDiscardTo', keep: 3 }]),
      ],
    },
  ],
  'ขุนพลทะเลแห่งคลื่นกระหน่ำ ชามอน': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT }, costFrom: 'alliesSum', alliesFilter: { types: SPIRITISH, families: [SUMING] } }],
    },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [{ do: 'restrictBlockers', filter: { types: SPIRITISH, minCost: 8 } }] },
  ],
  คุจาคุเมียวโอ: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentSummonEffect',
      steps: [{ do: 'draw', count: 3 }, { do: 'discard', count: 1 }, { do: 'summonThisFree' }],
    },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2, 3],
      steps: [
        {
          do: 'atBattleEnd',
          steps: [
            may(
              'Summon Bolt: ทำลายสปิริตนี้ เพื่ออัญเชิญสปิริตคอสต์ 2-8 เผ่าเดียวกันจากมือไม่จ่ายคอสต์',
              [{ do: 'destroySelf' }, { do: 'summonFromHandFree', filter: { types: ['spirit'], minCost: 2, maxCost: 8, sameFamilyAs: 'self' } }],
              { all: [{ selfCoresAtLeast: 1 }, { handHas: { types: ['spirit'], minCost: 2, maxCost: 8, sameFamilyAs: 'self' } }] },
            ),
          ],
        },
      ],
    },
  ],

  // ---------------------------------------------------------------- Ultimate
  'หกขุนศึกเซ็นโงคุ เซ็นริวดาคุ': [
    { kind: 'effectImmune', levels: [3, 4, 5], scope: 'self', colors: ['red', 'purple', 'white', 'blue'], types: ULTRA },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [4, 5],
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'นำสปิริต/อัลติเมทคอสต์ไม่เกิน 7 ของคู่แข่ง 1 ตัวกลับขึ้นมือ', steps: [{ do: 'bounceOpponent', filter: { types: SPIRITISH, maxCost: 7 } }] },
            {
              label: 'Soul Drive: นำโซลคอร์ออกจากเกม เพื่อนำสปิริต/อัลติเมทของคู่แข่งทั้งหมดไปไว้บนสุดเด็ค',
              if: soulOnSelf,
              steps: [{ do: 'soulToVoid' }, { do: 'bounceAllOpponent', filter: { types: SPIRITISH }, to: 'deckTop' }],
            },
          ],
        },
      ],
    },
  ],
  'หกขุนศึกเซ็นโงคุ ไทดัล-บลู': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3, 4],
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 7 } },
        may('Soul Drive: นำโซลคอร์ออกจากเกม เพื่อให้คู่แข่งข้ามรีเฟรชสเต็ปและเมนสเต็ปในเทิร์นถัดไป', [{ do: 'soulToVoid' }, { do: 'opponentSkipStepsNextTurn', steps: ['refresh', 'main'] }], soulOnSelf),
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [4], steps: [{ do: 'destroyChosenOpponent', filter: { types: ['ultimate'], maxCost: 7 } }] },
  ],
};
