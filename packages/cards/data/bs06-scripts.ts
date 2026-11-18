/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 06 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

const MASTER = 'ผู้เป็นนาย';
const SERVANT = 'ข้ารับใช้';
const NINJA = 'วายุนินจา';
const MACHINE = 'เครื่องกล';
const AWAKENER = 'ผู้ปลุกกระตุ้น';
const SWORDMASTER = 'จอมดาบ';
const SWORD = 'ดาบกระบี่';
const GENJI = ['เก็นจิ'];
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
/** Ultra Shield: ไม่รับผลเอฟเฟกต์ของสปิริต/อัลติเมท/เน็กซัส/เมจิค (ไม่รวมเบรฟ: กติกา 14 Shield) */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
/** เงื่อนไข "หรือ" */
const or = (...c: Condition[]): Condition => ({ not: { all: c.map((x) => ({ not: x })) } });

/** [Catalyze] ทุกสี เมื่อสปิริตนี้โจมตี: สามารถส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อสั่งใช้ Soul Burst ของเราทันที (then = หลังจากเบิร์สนั้นถูกสั่งใช้) */
const catalyzeSteps = (then: Step[] = [], label = 'ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst'): Step[] => [
  { do: 'chooseOne', if: { catalyzable: 'any' }, options: [{ label, steps: [{ do: 'soulToTrash' }, { do: 'catalyze', ...(then.length ? { then } : {}) }] }, NO] },
];
const catalyze = (levels: number[], then: Step[] = [], label?: string): ScriptAbility => ({ kind: 'trigger', on: 'attack', levels, steps: catalyzeSteps(then, label) });

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });

export const BS06_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Spirit (เขียว)
  'ผู้นำมารวายุ ชิโนบิโอว': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [
        { do: 'exhaustOpponent', count: 2 },
        // Catalyze: หลังจากนั้น สปิริตรูปแบบเสื่อมสภาพของคู่แข่ง 2 ตัวไปไว้ใต้สุดเด็ค
        { do: 'bounceOpponent', filter: { types: SPIRIT, state: 'exhausted' }, to: 'deckBottom', count: 2, if: { catalyzed: true } },
        { do: 'summonThisFree' },
      ],
    },
    {
      kind: 'activated',
      levels: [2, 3],
      timing: 'attackFlash',
      label: 'ส่งคอร์ 2 เม็ด หรือ Soul Core บนสปิริตนี้ลงรีเสิร์ฟ: เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว',
      if: { all: [{ attackStep: true }, { opponentHas: { types: SPIRIT, state: 'refresh' } }, or({ selfCoresAtLeast: 2 }, soulOnSelf)] },
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'ส่งคอร์ 2 เม็ดลงรีเสิร์ฟ', steps: [{ do: 'selfCoresToTrash', count: 2, to: 'reserve' }], if: { selfCoresAtLeast: 2 } },
            { label: 'ส่ง Soul Core 1 เม็ดลงรีเสิร์ฟ', steps: [{ do: 'soulToReserve' }], if: soulOnSelf },
          ],
        },
        { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } },
      ],
    },
  ],
  โทเงะแอนท์: [
    {
      kind: 'trigger',
      on: 'destroyed',
      levels: [1, 2],
      steps: [
        { do: 'voidCore', to: 'reserve', count: 2, if: soulOnSelf },
        { do: 'voidCore', to: 'reserve', count: 1, if: { not: soulOnSelf } },
      ],
    },
  ],
  'นินจาเขี้ยวพิศวง โมมอนจา': [{ kind: 'quick' }, { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'moveAllySoul' }] }],
  'มารวายุ ซาซาคุไน': [
    [
      { kind: 'quick' },
      // อัญเชิญด้วย [Quick] (แอทแท็คสเต็ป) โดยใช้ Soul Core ร่วมจ่าย: นำคอร์วอยด์ 1 เม็ดวางรีเสิร์ฟ
      { kind: 'trigger', on: 'allySummoned', subject: { self: true, paidWithSoul: true }, levels: [1, 2], attackStepOnly: true, steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    ],
    { kind: 'trigger', on: ['attack', 'block'], levels: [1, 2], steps: [{ do: 'buffSelf', amount: 3000, untilBattleEnd: true }] },
  ],
  'มารวายุ เกรย์ไนท์': [{ kind: 'grantQuick', levels: [1, 2, 3], filter: { types: ['spirit'], family: NINJA }, if: soulOnSelf }],
  'นินจาเขี้ยวพิศวง จากัน': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentHandIncreased',
      steps: [{ do: 'opponentDiscards', count: 2, if: { opponentHandAtLeast: 5 } }, { do: 'summonThisFree' }],
    },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ รูนิเฮล': [{ kind: 'trigger', on: 'attack', levels: [1, 2, 3], steps: [{ do: 'voidCore', to: 'self', count: 1 }] }, catalyze([2, 3])],
  'นินจาผีเสื้อราตรีสวมเกราะ โอโอชิโอ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentSummonEffect',
      steps: [
        // สีบนสนามคู่แข่งรวมกันตั้งแต่ 2 สี: เสื่อมสภาพทั้งหมดแทน
        { do: 'exhaustAllOpponent', filter: { types: SPIRITISH }, if: { opponentColorsAtLeast: 2 } },
        { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT }, if: { not: { opponentColorsAtLeast: 2 } } },
        { do: 'summonThisFree' },
      ],
    },
    { kind: 'staticBp', levels: [2, 3], scope: { ownSpirits: { soul: true } }, amount: 10000 },
  ],
  'นินจามารวายุชั้นสูง โทคิชาเนะ': [
    catalyze([1, 2, 3], [{ do: 'setBurstFromField', filter: { hasBurst: true } }], 'ส่ง Soul Core ลงแทรช: [Catalyze] แล้วนำสปิริตที่มีเบิร์สไปเซ็ทได้'),
    {
      kind: 'activated',
      levels: [2, 3],
      timing: 'attackFlash',
      label: 'นำสปิริตนี้กลับขึ้นมือ: ฟื้นสภาพสปิริตของเรา 1 ตัว',
      if: { all: [{ attackStep: true }, { otherAllyHas: { state: 'exhausted' } }] },
      steps: [{ do: 'returnSelfToHand', then: [{ do: 'refreshChosenAlly', filter: { types: SPIRITISH } }] }],
    },
  ],
  'ขุนศึกดาบศักดิ์สิทธิ์ ไคโดว ทสึโนะชิงะ': [
    catalyze([1, 2]),
    { kind: 'braveSlots', levels: [1, 2], count: 2 },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2],
      oncePerTurn: true,
      if: { selfBravesAtLeast: 2 },
      steps: [{ do: 'atBattleEnd', steps: [{ do: 'refreshSelf', if: { selfBravesAtLeast: 2 } }] }],
    },
  ],

  // ---------------------------------------------------------------- Spirit (ขาว)
  'จอมทัพใหญ่จักรกล ไทคูน': [
    { kind: 'kagemushaNoSoul', levels: [1, 2, 3, 4], families: [MASTER, SERVANT] },
    {
      kind: 'activated',
      levels: [2, 3, 4],
      timing: 'attackFlash',
      label: 'นำสปิริตเราเผ่า [เครื่องกล] 1 ตัวกลับขึ้นมือ: ฟื้นสภาพสปิริตนี้ · ในเทิร์นนี้สปิริตเราทั้งหมด BP+5000',
      if: { all: [{ ownAttackStep: true }, { selfExhausted: true }, { otherAllyHas: { types: SPIRIT, family: MACHINE } }] },
      steps: [{ do: 'returnOwnToHand', filter: { types: SPIRIT, family: MACHINE }, other: true }, { do: 'refreshSelf' }, { do: 'buffAllies', amount: 5000 }],
    },
  ],
  'ทหารจักรกลพลปืนยาว ทาเนงาชิมะ': [
    [
      { kind: 'noMill', levels: [1, 2, 3] },
      { kind: 'effectImmune', levels: [1, 2, 3], scope: 'self', types: ['spirit', 'ultimate', 'nexus', 'brave'], if: soulOnSelf },
    ],
  ],
  'สุนัขเครื่องกล คิชูด็อก': [
    { kind: 'effectImmune', levels: [1, 2, 3], scope: 'self', colors: ['red', 'purple', 'blue'], types: ULTRA },
    { kind: 'multiDrawPunish', levels: [1, 2, 3] },
  ],
  'นักรบเครื่องกล S23': [{ kind: 'kagemusha' }],
  'แปดอัศวินเก็นจิ ทสึคิดาสุ แลนเซอร์': [
    { kind: 'kagemusha' },
    { kind: 'trigger', on: 'allyDestroyed', subject: { nameIncludes: GENJI }, levels: [2], steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }] },
  ],
  'เสนาธิการเครื่องกล ชิโมะคาเสะ': [
    { kind: 'kagemusha' },
    { kind: 'effectImmune', levels: [1, 2, 3], scope: 'self', types: ['spirit', 'magic', 'brave'] },
    { kind: 'trigger', on: 'block', levels: [2, 3], steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 15000 } }] },
  ],
  ฮาคุโดวโทคาเงะ: [
    { kind: 'effectImmune', levels: [1, 2, 3], scope: 'self', colors: ['green', 'white', 'yellow'], types: ULTRA },
    { kind: 'opponentNoReduction', levels: [2, 3], maxCost: 3 },
  ],
  'แปดอัศวินเก็นจิ ฮิสะมารุ บัสเตอร์': [
    catalyze([1, 2, 3], [{ do: 'battleImmune', types: ['magic'] }], 'ส่ง Soul Core ลงแทรช: [Catalyze] แล้วไม่รับผลเมจิคของคู่แข่งในการต่อสู้นี้'),
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { nameIncludes: GENJI },
      levels: [2, 3],
      ownTurnOnly: true,
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, bpFrom: 'subject' }],
    },
  ],
  'ป้อมปราการเครื่องกล ฮาคุเกอิน': [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'summonThisFree' }] },
    { kind: 'cannotAttack', levels: [1] },
    { kind: 'trigger', on: 'allyAttack', subject: { families: [MASTER, SERVANT] }, levels: [2], ownTurnOnly: true, steps: [{ do: 'unblockableByBpAtMostSubject' }] },
  ],
  'เครื่องกลดาบศักดิ์สิทธิ์ ริวดันโอว': [
    catalyze([1, 2], [{ do: 'discardOpponentBurst' }], 'ส่ง Soul Core ลงแทรช: [Catalyze] แล้วทิ้งเบิร์สของคู่แข่ง'),
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'summonFromHandFree', filter: { types: ['brave'], family: SWORD } }] },
  ],

  // ---------------------------------------------------------------- Brave
  'วิหคชุดเกราะ คิเรนจักคุ': [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      if: { all: [{ firstAttackOfTurn: true }, soulOnSelf, { otherAllyHas: {} }] },
      steps: [may('นำ Soul Core บนสปิริตนี้ไปวางบนสปิริตอื่นของเรา: ฟื้นสภาพสปิริตนี้', [{ do: 'soulToAlly', from: 'self', then: [{ do: 'refreshSelf' }] }])],
    },
  ],
  'ดาบมารแมลงดำ อุสึบะคาเงโร่': [
    { kind: 'quick' },
    { kind: 'trigger', on: ['attack', 'block'], granted: true, levels: [], steps: [{ do: 'battleNoBurst' }] },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'lifeOnBlockerDestroyed', amount: 1, to: 'trash' }] },
  ],
  'ดาบแสงแห่งนภา คราวน์-โซลาร์': [
    { kind: 'refreshCountBoost', levels: [1], amount: 1 },
    { kind: 'refreshCountBoost', levels: [], amount: 1, granted: true },
    { kind: 'trigger', on: ['attack', 'block'], granted: true, levels: [], steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, noBraves: true } }] },
  ],
  'ดาบคู่แห่งวายุกรรโชก คามุย-ฮายาเตะ': [
    { kind: 'exhaustCountBoost', levels: [1], amount: 1 },
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }, { do: 'ifExhaustedAtLeast', n: 3, steps: [{ do: 'refreshSelf' }] }],
    },
  ],
  'ดาบสมบัติแห่งรัตติกาลสีขาว มิดไนท์-ซัน': [
    // Heavy Shield: ไม่รับผลเอฟเฟกต์สปิริต/เบรฟ/เน็กซัส/เมจิคสีเขียว/ขาว/เหลือง/ฟ้าของคู่แข่ง
    { kind: 'effectImmune', granted: true, levels: [], scope: 'self', colors: ['green', 'white', 'yellow', 'blue'], types: ['spirit', 'brave', 'nexus', 'magic'] },
    // Rush ไม่สนเงื่อนไข: ยังไม่มีการ์ดที่มี Rush ในเกม
    null,
  ],
  'ดาบเทพธรณี โอเทนตะ': [
    { kind: 'burst', soul: true, on: 'afterOpponentAttack', steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 15000 } }, { do: 'summonThisFree' }] },
    {
      kind: 'activated',
      granted: true,
      levels: [],
      timing: 'attackFlash',
      label: 'นำ Soul Core ในแทรชมาวางบนสปิริตนี้: นำสปิริต/อัลติเมทของคู่แข่ง 1 ตัวกลับขึ้นมือ',
      if: { all: [{ selfAttacking: true }, { soulInTrash: true }] },
      maxPerTurn: 1,
      steps: [{ do: 'soulFromTrashToSelf', then: [{ do: 'bounceOpponent', filter: { types: SPIRITISH } }] }],
    },
  ],
  โฮทารุมารุ: [{ kind: 'blockOpponentBurst', granted: true, anyTurn: true, levels: [], if: { allyInBattle: { families: [AWAKENER, SWORDMASTER, SWORD] } } }],
  'ดาบปีกวายุ โควจิกิริ': [
    { kind: 'burst', soul: true, on: 'afterOpponentSummonEffect', steps: [{ do: 'exhaustOpponentTotalCost', maxTotal: 12 }, { do: 'summonThisFree' }] },
    {
      kind: 'activated',
      granted: true,
      levels: [],
      timing: 'attackFlash',
      label: 'ย้ายเบรฟนี้ไปรวมร่างกับสปิริตอื่นของเรา',
      if: { ownAttackStep: true },
      steps: [{ do: 'moveSourceBrave' }],
    },
  ],
  อิจิโกะฮิโทฟุริ: [{ kind: 'trigger', on: 'oppAttackStepStart', granted: true, levels: [], steps: [{ do: 'forceAttackChosen' }] }],

  // ---------------------------------------------------------------- Magic
  เคล็ดวิชาพลิกเสื่อทาทามิ: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }, { do: 'returnOwnToHand', filter: { types: SPIRIT, family: NINJA } }] },
  ],
  นีดเดิลเกลียวสว่าน: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentHandIncreased',
      steps: [{ do: 'revealSummon', count: 2, filter: { types: ['spirit'], maxCost: 5 }, max: null, rest: 'trash' }, { do: 'payToUseFlash' }],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000, refreshIfMinBp: 10000 }] },
  ],
  ลิมิเต็ดบาเรีย: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'lifeShieldThisTurn', minCost: 4 }, { do: 'bounceOpponent', filter: { types: ['nexus'] }, if: paidSoul }] },
  ],
  ฟอร์ซโคล์ท: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }, { do: 'battleUnblockable', if: { catalyzed: true } }, { do: 'payToUseFlash' }],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'bounceAllOpponent', filter: { types: SPIRITISH, minSymbols: 2 } }] },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.25 โกรวซเลเบรชั่น': [
    { kind: 'trigger', on: 'allySummoned', subject: { types: ['spirit', 'brave'] }, levels: [1, 2], attackStepOnly: true, steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    { kind: 'staticBp', levels: [2], if: { all: [{ ownAttackStep: true }, soulOnSelf] }, scope: { ownFamily: NINJA }, amount: 5000 },
  ],
  อู่พิทักษ์สวรรค์: [
    { kind: 'kagemushaFree', levels: [1, 2] },
    { kind: 'trigger', on: 'oppHandIncreased', levels: [2], mainStepOnly: true, oppTurnOnly: true, steps: [{ do: 'opponentDiscards', count: 1, perHandIncrease: true }] },
  ],
  'No.42 ลองเคพ': [
    { kind: 'lifeDamageCap', levels: [1, 2] },
    {
      kind: 'trigger',
      on: 'oppAttack',
      levels: [2],
      oppTurnOnly: true,
      steps: [may('นำ Soul Core บนเน็กซัสนี้ไปวางบนสปิริตเรา: ฟื้นสภาพสปิริตนั้น', [{ do: 'soulToAlly', refresh: true }], { all: [soulOnSelf, { allyHas: { state: 'exhausted' } }] })],
    },
  ],
};
