/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 10 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import type { Color } from '../src/schema';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const soulInTrash: Condition = { soulInTrash: true };
/** "เมื่อมีโซลคอร์อยู่บนฟิลด์เรา" (สปิริต/อัลติเมท/เน็กซัส) */
const soulOnField: Condition = { any: [{ anyAllySoul: true }, { allyHas: { types: ['spirit', 'ultimate', 'brave', 'nexus'], soul: true } }] };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
/** ถ้าเงื่อนไขจริง ทำ steps */
const when = (cond: Condition, steps: Step[], otherwise?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(otherwise ? { else: otherwise } : {}) });

/** [Catalyze] เมื่อสปิริตนี้โจมตี: สามารถส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อสั่งใช้ Soul Burst สีที่ระบุ */
const catalyze = (levels: number[], colors: Color[], label: string, allTargets = false): ScriptAbility => ({
  kind: 'trigger',
  on: 'attack',
  levels,
  steps: [
    {
      do: 'chooseOne',
      if: { any: colors.map((c) => ({ catalyzable: c })) },
      options: [{ label: `ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst${label}`, steps: [{ do: 'soulToTrash' }, { do: 'catalyze', colors, ...(allTargets ? { allTargets: true as const } : {}) }] }, NO],
    },
  ],
});

/** Spirit Soul: เมื่อเราอัญเชิญการ์ดอัลติเมท สปิริตนี้ได้รับเจ็มสีนี้เพิ่ม 1 เม็ด */
const spiritSoul = (levels: number[], color: Color): ScriptAbility => ({ kind: 'summonSymbol', levels, filter: { types: ['ultimate'] }, color, count: 1 });

/** Quick: อัญเชิญจากมือใน Flash timing โดยใช้คอร์จากรีเสิร์ฟเท่านั้น */
const QUICK: ScriptAbility = { kind: 'quick' };

/** คอร์บนการ์ดของเราที่ตรงตัวกรองจะเหลือน้อยกว่า min เม็ดโดยคู่แข่งไม่ได้ */
const coreFloor = (levels: number[], filter: CardFilter, min: number): ScriptAbility => ({ kind: 'coreFloor', levels, filter, min });

/** เลือกสี 1 สี แล้วเสื่อมสภาพสปิริตสีนั้นทั้งหมด (ทั้งสองฝ่าย) */
const exhaustColor: Step = { do: 'exhaustAllChosenColor', filter: { types: SPIRIT } };

export const BS10_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Spirit ม่วง
  โฮเนะสุมิ: [{ kind: 'counterEndAttackStep', levels: [1, 2], cost: 2 }],
  ยักษ์หมาป่า: [
    spiritSoul(ALL3, 'purple'),
    { kind: 'trigger', on: 'endStep', levels: ALL3, steps: [{ do: 'returnFromTrash', filter: { types: ['ultimate'] } }] },
  ],
  'มูฉะม้ายักษ์ คุไก': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }, { do: 'draw', count: 1, if: { allyHas: { types: ['ultimate'], color: 'purple' } } }],
    },
  ],
  'ชิคิกามิ โคบุชิ': [
    { kind: 'trashCost', cost: 3 },
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [when(soulInTrash, [{ do: 'opponentDestroysOwn', filter: { types: SPIRIT } }])] },
  ],
  'ริบ-รีพเพอร์': [{ kind: 'staticBp', levels: [1, 2], if: { ownGemColor: 'red' }, scope: { self: true }, amount: 8000 }],
  'โบน-กลาดิเอเตอร์': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'restrictBlockers', filter: { notColors: ['green', 'white'] } }] },
  ],
  'ชา-ซู': [
    {
      kind: 'trigger',
      on: 'destroyed',
      levels: [1, 2],
      steps: [when(soulInTrash, [{ do: 'removeOpponentCores', count: 1, perPick: 2, filter: { types: SPIRIT } }], [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT }, anySide: true }])],
    },
  ],
  คอไบรก้า: [{ kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'removeOpponentCores', count: 1, untilOne: true, filter: { types: SPIRITISH } }] }],
  มิสท์วีเซล: [{ kind: 'trashCost', cost: 2 }, { kind: 'trigger', on: 'destroyed', levels: [1, 2], steps: [{ do: 'draw', count: 3 }] }],
  เคมุริเทน: [{ kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'draw', count: 1 }, { do: 'blockSummonBurst', if: soulInTrash }] }],
  'ฤาษีแห่งความมืด คุรามะ': [
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [1, 2],
      steps: [{ do: 'summonFromTrash', filter: { types: ['spirit'], color: 'purple', maxCost: 4 }, fullReductionIf: soulInTrash }],
    },
  ],
  'ยักษ์มหาเดียว ชิกัน': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [may('ทิ้งการ์ดสีม่วงในมือ 1 ใบ เพื่อจั่วการ์ด 1 ใบ', [{ do: 'discard', count: 1, filter: { color: 'purple' } }, { do: 'draw', count: 1 }], { handHas: { color: 'purple' } })],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        { do: 'returnFromTrash', filter: { types: ['ultimate'], color: 'purple' } },
        { do: 'ifReturned', filter: { types: ['ultimate'] }, steps: [{ do: 'removeOpponentCores', count: 1, perPick: 2, filter: { types: SPIRIT } }] },
      ],
    },
  ],
  สิงโตควันม่วง: [{ kind: 'millCostReduce', max: 3 }, { kind: 'effectSummonTax', levels: L23, cost: 5 }],
  'ยักษ์หน้ามังกร บิรันบะ': [
    {
      kind: 'trigger',
      on: 'oppVoidGain',
      zone: 'hand',
      levels: [],
      steps: [
        may('อัญเชิญ บิรันบะ ไม่จ่ายคอสต์ แล้วส่งคอร์คู่แข่งไปวอยด์ 2 เม็ดต่อคอร์ที่เพิ่มขึ้น', [
          { do: 'summonCardFree', which: 'self', then: [{ do: 'removeOpponentCores', count: 2, to: 'void', filter: { types: SPIRITISH }, per: { voidGained: true } }] },
        ]),
      ],
    },
    {
      kind: 'trigger',
      on: 'oppDepleted',
      levels: L23,
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [may('นำสปิริตนี้กลับขึ้นมือ', [{ do: 'returnSelfToHand' }])],
    },
  ],

  // ---------------------------------------------------------------- Spirit เขียว
  'ผู้ส่งสาร เจเน็ท': [spiritSoul([1, 2], 'green'), { kind: 'trigger', on: 'allySoulDrive', levels: [2], steps: [{ do: 'voidCore', to: 'reserve', count: 3 }] }],
  'นินจาผีเสื้อราตรีสวมเกราะ เฮียคุเตะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'grantAttackNoBurstThisTurn', filter: { family: 'วายุนินจา' } }, { do: 'unblockableSelfThisTurn', if: { summonedFromDeck: true } }],
    },
  ],
  'ข้ารับใช้ผู้ภักดี ลาเทล': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [{ do: 'voidCore', to: 'self', count: 1 }, { do: 'voidCore', to: 'otherAlly', count: 1, filter: { family: 'ข้ารับใช้' } }],
    },
    { kind: 'staticBp', levels: [2], if: soulOnSelf, scope: { own: { types: SPIRITISH, family: 'ศาสตราสมิง' } }, amount: 4000 },
  ],
  'ข้ารับใช้ผู้ภักดี ยูคิโนะโจว': [
    coreFloor([1, 2], { types: SPIRITISH, families: ['ผู้เป็นนาย', 'ข้ารับใช้', 'ศาสตราสมิง'] }, 4),
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }] },
  ],
  ลีฟวูล์ฟ: [QUICK, { kind: 'staticBp', levels: ALL3, if: soulOnSelf, scope: { own: { types: SPIRIT, textIncludes: ['Quick'] } }, amount: 2000 }],
  เอเมแอนท์: [
    coreFloor([1, 2], { types: SPIRIT, color: 'green' }, 1),
    { kind: 'trigger', on: 'destroyed', levels: [1, 2], steps: [{ do: 'buffAllies', amount: 3000 }] },
  ],
  เอเมอรัลด์ซิสเซอร์: [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRITISH } }] },
    coreFloor([2], { types: SPIRIT, color: 'green' }, 3),
  ],
  'ซิก้า-วอสพ์': [QUICK, { kind: 'staticBp', levels: [1, 2], if: { soulInReserve: true }, scope: { self: true }, amount: 8000 }],
  กากันโบว: [
    [
      QUICK,
      { kind: 'trigger', on: 'summon', levels: [1, 2], if: paidSoul, steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, color: 'red' } }] },
    ],
  ],
  'มูฉะเปลือกเกราะ ชิคาดุ': [
    [
      { kind: 'colorAlso', levels: ALL3, color: 'red' },
      { kind: 'symbolAlsoColor', levels: ALL3, color: 'red' },
    ],
    {
      kind: 'trigger',
      on: 'allyBurstActivated',
      levels: ALL3,
      steps: [
        { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } },
        when({ subjectIs: { color: 'red' } }, [{ do: 'symbolChosenAllyThisTurn', color: 'red', count: 1 }]),
      ],
    },
  ],
  'มารวายุชุดเกราะ โยโรอิสุโมะ': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'bunshin', max: 2 }] },
    // สปิริตร่างแยกของเราที่ถูกทำลาย → ขึ้นมือแทน (ร่างแยกกลับเป็นการ์ดจริง)
    { kind: 'replaceDestroy', levels: [2], subject: { family: 'ร่างแยก' }, if: soulOnSelf, toHand: true, battle: true, auto: true },
  ],
  'สมิงพุ่งชน บลานโบอา': [
    { kind: 'trigger', on: ['attack', 'block'], levels: [1, 2], steps: [{ do: 'refreshOnBattlerGone' }, { do: 'buffSelf', amount: 5000, untilBattleEnd: true, if: soulOnSelf }] },
    { kind: 'trigger', on: 'attackHitLife', levels: [2], steps: [{ do: 'opponentLifeToReserve', count: 1 }] },
  ],
  'มารวายุนินจาชั้นสูง เดวซอล': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'summonThisFree' }] },
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'bunshin', max: 4 }] },
  ],
  'ปักษาเหนือขีดจำกัด วัลเพลเชอร์': [{ kind: 'selfCostIf', cost: 3, if: { lifeAtMost: 3 } }, QUICK],
  'สมิงไดเมียว ไยบะโนะคามิ': [
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] },
      steps: [{ do: 'opponentExhaustsOwn', count: 1 }, { do: 'lifeIfChosenBpAtMostSubject' }],
    },
    { kind: 'familyAlso', levels: L23, if: { anyAllySoul: true }, family: 'ข้ารับใช้', allies: { types: ['ultimate'] } },
  ],

  // ---------------------------------------------------------------- Spirit เหลือง
  'เซ็นโงคุฮิเมะ ทันโปโปะ': [{ kind: 'burstProtect', levels: ALL3 }],
  'เซ็นโงคุฮิเมะ นาเดชิโกะ': [
    { kind: 'replaceDestroy', levels: ALL3, subject: { family: 'เจ้าหญิงสงคราม' }, if: soulOnSelf, toHand: true, auto: true },
  ],
  มาคุระกาเอชิคิด: [{ kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'flipDeckTop' }] }],
  'เจเนอรัล เซโตะไดโช': [{ kind: 'alsoMagic' }, { kind: 'magic', timing: 'flash', steps: [{ do: 'battleCompareLevel' }] }],
  โทฟุบอย: [{ kind: 'alsoMagic' }, { kind: 'magic', timing: 'flash', steps: [{ do: 'symbolsZeroChosen', filter: { types: SPIRIT } }] }],
  'เซ็นโงคุฮิเมะ มิคาเนะ': [
    { kind: 'replaceDestroy', levels: [1, 2], subject: { self: true }, life: 1, battle: true },
    catalyze([2], ['yellow'], 'สีเหลือง'),
  ],
  คิวบิฟ็อกซ์: [
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      zone: 'hand',
      levels: [],
      attackStepOnly: true,
      subject: { color: 'yellow' },
      steps: [may('อัญเชิญ คิวบิฟ็อกซ์ ไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])],
    },
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      levels: L23,
      subject: { color: 'yellow', paidWithSoul: true },
      if: { selfAttacking: true },
      steps: [{ do: 'battleUnblockable' }],
    },
  ],
  'เซ็นโงคุฮิเมะ เคย์': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      alsoDepleted: true,
      steps: [{ do: 'summonThisFree' }, { do: 'setBurstFromHand', withShown: true }],
    },
    {
      kind: 'trigger',
      on: 'allyBurstActivated',
      levels: L23,
      steps: [
        may('เซ็ทการ์ดที่มีเบิร์สในมือ/นอกมือ 1 ใบ เพื่อนำคอร์ในแทรช 1 เม็ดไปวางไลฟ์', [{ do: 'setBurstFromHand', withShown: true, then: [{ do: 'trashCoreToLife', count: 1 }] }], {
          all: [{ handHas: { hasBurst: true, withShown: true } }, { trashCoreAtLeast: 1 }],
        }),
      ],
    },
  ],
  'เซ็นโงคุฮิเมะ มิโคโตะ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [{ do: 'debuffChosenOpponent', amount: 10000, filter: { types: SPIRIT }, destroyAtZero: true }, { do: 'summonThisFree' }],
    },
    catalyze(L23, ['red', 'white', 'yellow'], 'สีแดง/ขาว/เหลือง', true),
  ],

  // ---------------------------------------------------------------- Ultimate
  'หกขุนศึกเซ็นโงคุ เทนเซย์': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3, 4, 5],
      // "บนสปิริตและอัลติเมทของเรา" (voidCoresSpread ไม่มีตัวกรอง → spiritsOnly: false)
      spiritsOnly: false,
      steps: [may('Soul Drive: นำ Soul Core ออกจากเกม เพื่อวางคอร์วอยด์บนสปิริต/อัลติเมทของเรา', [{ do: 'soulToVoid' }, { do: 'voidCoresSpread' }], soulOnSelf)],
    },
    { kind: 'trigger', on: ['attack', 'block'], levels: [4, 5], steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRITISH } }] },
  ],
  'หกขุนศึกเซ็นโงคุ บาเครุคัทซึ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3, 4, 5],
      steps: [
        { do: 'summonFromHandFree', filter: { types: ['spirit', 'ultimate'], color: 'yellow', maxCost: 6 } },
        may('Soul Drive: นำ Soul Core ออกจากเกม เพื่อนำคอร์วอยด์มาวางไลฟ์จนเป็น 6', [{ do: 'soulToVoid' }, { do: 'lifeUpTo', max: 6 }], soulOnSelf),
      ],
    },
  ],
  'หกขุนศึกเซ็นโงคุ มุโดว': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3, 4],
      steps: [
        may(
          'Soul Drive: นำ Soul Core ออกจากเกม เพื่อส่งคอร์ของคู่แข่งไปวอยด์ 2 เม็ดต่อ Lv',
          [{ do: 'soulToVoid' }, { do: 'removeOpponentCores', count: 2, to: 'void', filter: { types: SPIRITISH }, withTrash: true, per: { selfLevel: true } }],
          soulOnSelf,
        ),
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [4], steps: [{ do: 'removeOpponentCores', count: 1, perPick: 3, filter: { types: SPIRIT } }] },
    { kind: 'trigger', on: 'attack', levels: [4], steps: [{ do: 'battleColorless' }] },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.21 ไดเวอเจนท์ฮิล': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      levels: [1, 2],
      ownTurnOnly: true,
      if: soulInTrash,
      subject: { fromHand: true, card: { cost: 3 } },
      steps: [{ do: 'draw', count: 1 }],
    },
    {
      kind: 'trigger',
      on: 'lifeLost',
      levels: [2],
      if: { lifeLostByOpponentEffect: true },
      steps: [may('ย้าย Soul Core บนเน็กซัสนี้ไปวางบนสปิริตเรา เพื่อส่งคอร์ไลฟ์คู่แข่ง 1 เม็ดลงรีเสิร์ฟ', [{ do: 'soulToAlly', then: [{ do: 'opponentLifeToReserve', count: 1 }] }], { all: [soulOnSelf, { alliesAtLeast: 1 }] })],
    },
  ],
  'No.12 เธาซันด์ลีฟ': [
    { kind: 'trigger', on: 'ownMainStepStart', levels: [1, 2], steps: [may('ดูการ์ดบนสุดเด็ค 2 ใบ', [{ do: 'scry', count: 2 }], { deckAtLeast: 1 })] },
    { kind: 'trigger', on: 'endStep', levels: [2], steps: [when(soulOnField, [{ do: 'returnAllFromTrash', filter: { types: ['magic'], nameIncludes: ['เคล็ดวิชา'] } }])] },
  ],
  'No.37 เฟรกรันส์รีเวอร์': [
    { kind: 'trigger', on: 'endStep', levels: [1, 2], steps: [when(soulOnField, [{ do: 'returnFromTrash', filter: { types: ['spirit'], family: 'โยวไค' } }])] },
    // Brilliant ที่สปิริตเผ่า [โยวไค] ได้รับ: เมื่อโจมตี → จบการต่อสู้ นำเมจิคที่ใช้ในการต่อสู้นี้กลับขึ้นมือ
    { kind: 'trigger', on: 'allyAttack', levels: [2], subject: { family: 'โยวไค' }, steps: [{ do: 'atBattleEnd', steps: [{ do: 'returnBattleMagic' }] }] },
  ],
  ปราการยักษ์หิน: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      alsoDepleted: true,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }, { do: 'summonThisFree' }],
    },
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'draw', count: 1 }] },
    { kind: 'trigger', on: 'endStep', levels: [2], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }] },
  ],
  แผ่นดินดาวกระจาย: [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'voidCore', to: 'reserve', count: 1 }, { do: 'summonThisFree' }] },
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT } }] },
    { kind: 'trigger', on: 'endStep', levels: [2], steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT }, count: 2 }] },
  ],
  สวนลอยฟ้าของเหล่าเจ้าหญิง: [
    { kind: 'burst', soul: true, on: 'afterOpponentSummonEffect', steps: [{ do: 'noDestroyChosenThisTurn', filter: { types: SPIRIT } }, { do: 'summonThisFree' }] },
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'opponentLevelOneThisTurn' }] },
    { kind: 'oppBattleBp', levels: [2], amount: -3000 },
  ],

  // ---------------------------------------------------------------- Magic
  ผ่าวิบัติไร้ผนึก: [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'battleCoreTaxThisTurn' }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, state: 'exhausted' }, if: paidSoul }] },
  ],
  เคล็ดวิชาการอัญเชิญ: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'flipClone' }] }],
  เพลิงจิ้งจอกอิมแพ็ค: [
    { kind: 'fullReductionIfAlly', name: 'คิวบิฟ็อกซ์' },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'symbolIfUnblocked', family: 'โยวไค', color: 'yellow', count: 2 }] },
  ],
  ไบน์ดิ้งธอร์น: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }, when({ soulInReserve: true }, [{ do: 'buffChosen', amount: 3000, ally: true, filter: { types: SPIRIT } }])],
    },
  ],
  คมดาบวายุหมุนเขี้ยวสมิง: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } },
        when(paidSoul, [{ do: 'lifeOnHitChosenThisTurn', filter: { types: SPIRITISH, families: ['ผู้เป็นนาย', 'ข้ารับใช้'] } }]),
      ],
    },
  ],
  ชาโดว์อีลิกเซอร์: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'reserveToLife', count: 1 }, { do: 'draw', count: 1, if: paidSoul }] }],
  คำสาปวิญญาณย้อนกลับ: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'summonFromTrashFree', filter: { types: ['spirit'], family: 'อสูรราตรี' } },
        when({ all: [paidSoul, { oppTurn: true }] }, [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], maxCost: 2 } }]),
      ],
    },
  ],
  จังหวะร่ายรำแห่งจิตวิญญาณ: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [may('ระบุสปิริต/อัลติเมทคู่แข่ง 1 ตัว: ในเทิร์นนี้โจมตี/ป้องกันไม่ได้', [{ do: 'disableChosenOpponent', filter: { types: SPIRITISH } }], { opponentHas: { types: SPIRITISH } }), { do: 'payToUseFlash' }],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'debuffChosenOpponent', amount: 6000, filter: { types: SPIRITISH }, destroyAtZero: true }] },
  ],
  คาออสดรอว์: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        when(
          paidSoul,
          [{ do: 'destroyAllOpponent', filter: { types: SPIRIT, state: 'exhausted' } }, { do: 'draw', count: 1, per: { destroyedByThis: true } }],
          [{ do: 'draw', count: 1, per: { opponents: { types: SPIRIT, state: 'exhausted' } } }],
        ),
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000, filter: { types: SPIRIT } }] },
  ],
  ไบน์ดิ้งวูดส์: [
    { kind: 'magic', timing: 'main', steps: [exhaustColor] },
    { kind: 'magic', timing: 'flash', steps: [when(paidSoul, [exhaustColor])] },
  ],
};
