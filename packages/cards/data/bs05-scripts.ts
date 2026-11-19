/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 05 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

const MASTER = 'ผู้เป็นนาย';
const SERVANT = 'ข้ารับใช้';
const YOKAI = 'โยวไค';
const SMING = 'วิญญาณสมิง';
const YAKSHA = 'อสูรราตรี';
const CURSED = 'มารต้องสาป';
const PRINCESS = 'เจ้าหญิงสงคราม';
const SWORD = 'ดาบกระบี่';
const GHOST = 'ผีอมตะ';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const notPaidSoul: Condition = { not: paidSoul };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const draw1: Step = { do: 'draw', count: 1 };

/** [Catalyze] ทุกสี เมื่อสปิริตนี้โจมตี: สามารถส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อสั่งใช้ Soul Burst ของเราทันที */
const catalyzeSteps = (after: Step[] = [], label = 'ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst'): Step[] => [
  { do: 'chooseOne', if: { catalyzable: 'any' }, options: [{ label, steps: [{ do: 'soulToTrash' }, { do: 'catalyze' }, ...after] }, NO] },
];
const catalyze = (levels: number[]): ScriptAbility => ({ kind: 'trigger', on: 'attack', levels, steps: catalyzeSteps() });

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });

export const BS05_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Spirit (ม่วง)
  'ราชาวิญญาณเทพ อาเมะโอชิโนะมิโคโตะ': [
    { kind: 'trashCost', cost: 4 },
    {
      kind: 'levelCostBoost',
      levels: [1, 2, 3, 4],
      if: soulOnSelf,
      filter: { types: SPIRIT, anyOf: [{ cost: 0 }, { cost: 2 }, { cost: 4 }, { cost: 7 }] },
      amount: 3,
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3, 4],
      steps: [
        { do: 'returnFromTrash', filter: { color: 'purple' } },
        { do: 'ifReturned', filter: { families: [MASTER, SERVANT] }, steps: [{ do: 'opponentDestroysOwn', filter: { types: SPIRIT } }] },
      ],
    },
  ],
  ยักษ์วิญญาณ: [{ kind: 'trigger', on: 'destroyed', levels: [1, 2, 3], steps: [{ do: 'draw', count: 1, if: soulOnSelf }] }],
  องเมียววาราชิ: [
    [
      { kind: 'cannotAttack', levels: [1, 2], if: soulOnSelf },
      { kind: 'effectImmune', levels: [1, 2], scope: 'self', if: soulOnSelf },
    ],
    // เมนสเต็ปของผู้เล่นทุกคน: คอร์จากวอยด์ที่วางโดยเอฟเฟกต์มาจากไลฟ์ของเจ้าของเอฟเฟกต์แทน
    { kind: 'voidFromLife', levels: [1, 2] },
  ],
  หมูป่าควันม่วง: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        may('ทิ้งการ์ดสปิริตในมือ 1 ใบ: จั่วการ์ด 1 ใบ', [{ do: 'discard', count: 1, filter: { types: ['spirit'] } }, draw1], {
          all: [{ handHas: { types: ['spirit'] } }, { deckAtLeast: 1 }],
        }),
      ],
    },
  ],
  'ชิคิงามิ ชูวไค': [
    { kind: 'trashCost', cost: 2 },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2, 3],
      // ตีระบุสปิริตคู่แข่งที่มีคอร์ไม่เกิน 2 เม็ด (ไม่เลือกก็ได้) · มี Soul Core: จั่วเพิ่ม 1 ใบ
      steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT, maxCores: 2 }, direct: true }, { do: 'draw', count: 1, if: soulOnSelf }],
    },
  ],
  'ผู้ใช้ศาสตร์มายา ชิมอน': [{ kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'removeOpponentCores', count: 1, perPick: 2 }] }, catalyze([1, 2])],
  พยัคฆ์ควันม่วง: [
    // ถูกทิ้งจากเด็คโดยเอฟเฟกต์ทิ้งเด็คของผู้เล่นทุกคน: อัญเชิญไม่จ่ายคอสต์ได้ (U Trigger ยังไม่มีในเกม)
    { kind: 'trigger', on: 'milledAny', zone: 'trash', levels: [], steps: [may('อัญเชิญพยัคฆ์ควันม่วงไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])] },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [{ do: 'discardUpTo', max: 3 }, { do: 'removeCoresPerDiscarded', to: 'trash' }] },
  ],
  'โยวจุทสึชิ ยาคุโมะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3],
      steps: [may('อัญเชิญการ์ดสปิริตในแทรชไม่จ่ายคอสต์ (คอสต์รวมไม่เกิน 6)', [{ do: 'summonFromTrashBudget', filter: { types: ['spirit'] }, budget: 6 }], paidSoul)],
    },
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { families: [CURSED, YAKSHA] },
      levels: [2, 3],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }],
    },
  ],
  'มิโกะเบื้องหลัง รินเนะ': [
    { kind: 'trigger', on: 'attack', levels: [1, 2, 3], steps: [{ do: 'removeOpponentCores', count: 2 }] },
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { families: [MASTER, SERVANT] },
      levels: [2, 3],
      ownTurnOnly: true,
      if: soulOnSelf,
      steps: [{ do: 'battleExhaustedBlock' }],
    },
  ],
  'ภูตผีดาบศักดิ์สิทธิ์ อีเกล็น': [
    { kind: 'trigger', on: 'summon', levels: [1, 2, 3], steps: [{ do: 'summonFromTrashFree', filter: { types: ['brave'], family: SWORD } }] },
    catalyze([2, 3]),
  ],

  // ---------------------------------------------------------------- Spirit (เหลือง)
  'แม่ทัพโยวไค คาฉะเนโกะ-อิคุสะ': [
    {
      kind: 'grantMagic',
      levels: [1, 2, 3, 4],
      filter: { types: ['spirit'], families: [MASTER, YOKAI] },
      timing: 'flash',
      attackStepOnly: true,
      label: 'ใช้เป็นเมจิค [Flash]: สปิริตคู่แข่ง 1 ตัวโจมตี/ป้องกันไม่ได้ในเทิร์นนี้',
      steps: [{ do: 'disableChosenOpponent', filter: { types: SPIRIT } }],
    },
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      subject: { types: ['spirit'] },
      levels: [2, 3, 4],
      ownTurnOnly: true,
      attackStepOnly: true,
      if: soulOnSelf,
      steps: [may('อัญเชิญการ์ดสปิริตนั้นไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'subject' }])],
    },
  ],
  'เซ็นโงคุฮิเมะ มิซึคิ': [
    { kind: 'trigger', on: 'allyMagicUsed', levels: [1, 2], attackStepOnly: true, steps: [{ do: 'returnFromTrash', filter: { types: ['spirit'], family: PRINCESS } }] },
  ],
  'เซ็นโงคุฮิเมะ ชาร์ล': [
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      // "เมื่อเราใช้งานการ์ดเมจิคจากในมือ": ใช้จากนอกมือไม่นับ
      subject: { fromHand: true },
      levels: [1, 2, 3],
      attackStepOnly: true,
      steps: [may('นำการ์ดเมจิคนั้นไปวางแสดงนอกมือ (ใช้งานได้เหมือนอยู่ในมือจนจบเกม)', [{ do: 'showSubjectFromTrash' }])],
    },
    { kind: 'replaceDestroy', levels: [2, 3], subject: { self: true }, auto: true, state: 'exhausted' },
  ],
  ยูคิเกิร์ล: [
    { kind: 'alsoMagic' },
    // ใช้จากมือแบบเมจิค [Flash]: เมื่อจบการต่อสู้นี้ ถ้าไลฟ์เราไม่เกิน 2 จบแอทแท็คสเต็ป
    { kind: 'magic', timing: 'flash', steps: [{ do: 'endAttackStepIfAfterBattle', if: { lifeAtMost: 2 } }] },
  ],
  คินชาจิ: [
    // Holy Life: การโจมตีของสปิริตนี้ทำให้ไลฟ์คู่แข่งได้รับความเสียหาย → คอร์วอยด์วางไลฟ์เรา
    { kind: 'trigger', on: 'attackHitLife', levels: [1, 2, 3], steps: [{ do: 'gainLifeFromVoid', count: 1 }] },
    { kind: 'trigger', on: 'allyAttack', subject: { holyLife: true }, levels: [2, 3], ownTurnOnly: true, steps: [{ do: 'battleUnblockable', by: 'ultimates' }] },
  ],
  'นักดาบบิวะ โบคุโบคุ': [{ kind: 'alsoMagic' }, { kind: 'magic', timing: 'flash', steps: [{ do: 'debuffChosenOpponent', amount: 4000, filter: { types: SPIRIT }, destroyAtZero: true }] }],
  'เซ็นโงคุฮิเมะ คุสุโนะฮะ': [catalyze([1, 2, 3]), { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [{ do: 'setBurstFromShown' }] }],
  'สมิงโยวไค นุเอะ': [
    // ผู้เป็นนาย/ข้ารับใช้ของเราได้รับ Holy Life
    {
      kind: 'trigger',
      on: 'allyAttackHitLife',
      subject: { families: [MASTER, SERVANT] },
      levels: [1, 2],
      ownTurnOnly: true,
      steps: [{ do: 'gainLifeFromVoid', count: 1 }],
    },
    {
      kind: 'trigger',
      on: 'allyAttackHitLife',
      subject: { families: [MASTER, SERVANT] },
      levels: [3],
      ownTurnOnly: true,
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
  ],
  'เซ็นโงคุฮิเมะ คุอง': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentAttack',
      steps: [
        { do: 'gainLifeFromVoid', count: 1 },
        { do: 'returnAllChosenColor', filter: { types: ['magic'] }, if: { catalyzed: true } },
        { do: 'summonThisFree' },
      ],
    },
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      levels: [2, 3],
      attackStepOnly: true,
      steps: [{ do: 'debuffChosenOpponent', amount: 10000, filter: { types: SPIRIT } }],
    },
  ],
  'เจ้าหญิงดาบศักดิ์สิทธิ์ ชิซุรุ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3],
      steps: [
        {
          do: 'chooseOne',
          options: [
            ...[5, 4, 3, 2, 1].map((n) => ({
              label: `แสดงใบบนสุดเด็ค ${n} ใบ (การ์ดที่มีเอฟเฟกต์ Burst ขึ้นมือ ที่เหลือทิ้ง)`,
              if: { deckAtLeast: n } as Condition,
              steps: [{ do: 'revealTakeAll', count: n, filter: { hasBurst: true } } as Step],
            })),
            NO,
          ],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: catalyzeSteps([{ do: 'unblockableByCostAtMostSelf' }], 'ส่ง Soul Core ลงแทรช: [Catalyze] แล้วไม่ถูกป้องกันโดยสปิริตคอสต์ไม่เกินสปิริตนี้'),
    },
  ],

  // ---------------------------------------------------------------- Brave
  'โอริงามิ มังคี': [{ kind: 'trigger', on: 'attack', granted: true, levels: [], steps: catalyzeSteps() }],
  ฮิเมะเนโกะ: [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [{ do: 'blockTax', reserveToTrash: 2 }, { do: 'draw', count: 1, if: soulOnSelf }],
    },
  ],
  'ดาบกระดูกแห่งอาชญากร เอ็กซิคิวชันเนอร์': [
    // Immortality: ผีอมตะ (แอทแท็คสเต็ปของผู้เล่นทุกคน) การ์ดนี้ในแทรช: เมื่อสปิริตเผ่าผีอมตะของเราถูกทำลาย อัญเชิญได้ (จ่ายคอสต์)
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      zone: 'trash',
      subject: { family: GHOST },
      attackStepOnly: true,
      levels: [],
      steps: [{ do: 'summonFromTrash', filter: { nameIncludes: ['เอ็กซิคิวชันเนอร์'] } }],
    },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      granted: true,
      levels: [],
      steps: [
        may('ทำลายเบรฟนี้: คู่แข่งเลือกทำลายสปิริตตนเอง 1 ตัว', [{ do: 'destroySourceBrave', then: [{ do: 'opponentDestroysOwn', filter: { types: SPIRIT } }] }], {
          opponentHas: { types: SPIRIT },
        }),
      ],
    },
  ],
  'ดาบเทพแห่งปีกแสง แองเจลิคฟีเธอร์': [
    { kind: 'bpMinusBoost', levels: [1], amount: 1000 },
    { kind: 'bpMinusBoost', granted: true, levels: [], amount: 1000 },
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [{ do: 'debuffChosenOpponent', amount: 3000, filter: { types: SPIRIT } }, { do: 'ifFirstZeroBp', steps: [{ do: 'refreshSelf' }] }],
    },
  ],
  'ดาบสวรรค์แห่งจินตนาการ ทไวไลท์-แฟนตาเซีย': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [may('นำคอร์รีเสิร์ฟ 1 เม็ดไปวางไลฟ์', [{ do: 'reserveToLife', count: 1 }], { lifeAtMost: 5 })] },
    [
      { kind: 'trigger', on: 'blocked', granted: true, levels: [], blocker: { types: SPIRIT }, steps: [{ do: 'refreshSelf' }] },
      { kind: 'trigger', on: 'unblocked', granted: true, levels: [], steps: [{ do: 'gainLifeFromVoid', count: 1 }] },
    ],
  ],
  'ดาบวิญญาณประกายม่วง ไลท์นิ่ง-ชิออน': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'removeOpponentCores', count: 1 }, draw1] },
    { kind: 'coreRemovalBoost', granted: true, levels: [], amount: 1 },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'battleColorless' }] },
  ],
  'ดาบภูต มุราซาเมะ': [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'removeOpponentCores', count: 1, perPick: 3 }, { do: 'summonThisFree' }] },
    {
      kind: 'activated',
      granted: true,
      levels: [],
      timing: 'attackFlash',
      label: 'ย้ายคอร์ 1 เม็ดบนสปิริตคู่แข่งไปตัวอื่น: จั่วการ์ด 1 ใบ',
      maxPerTurn: 1,
      if: { all: [{ selfAttacking: true }, { opponentHas: { types: SPIRIT }, count: 2 }, { deckAtLeast: 1 }] },
      steps: [{ do: 'moveOpponentCore' }, draw1],
    },
  ],
  ฮิเมะสึรุอิจิมอนจิ: [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'returnFromTrash', filter: { color: 'yellow' } }, { do: 'summonThisFree' }] },
    // ไม่ถูกนับในจำนวนเบรฟที่รวมร่างได้ของชิซุรุ: ชิซุรุมีฮิเมะสึรุ + เบรฟอื่นได้อีก 1 ใบ
    { kind: 'braveNotCounted', hostName: 'เจ้าหญิงดาบศักดิ์สิทธิ์ ชิซุรุ' },
  ],
  'ดาบชีพอัสนี มิคาซึกิ': [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'negateOpponentsThisTurn' }, { do: 'summonThisFree' }] },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      granted: true,
      levels: [],
      oncePerTurn: true,
      steps: [
        {
          do: 'atBattleEnd',
          steps: [may('เซ็ทการ์ดที่มีเอฟเฟกต์ Burst ในมือ: สปิริตนี้ฟื้นสภาพ', [{ do: 'setBurstFromHand', then: [{ do: 'refreshSelf' }] }], { handHas: { hasBurst: true } })],
        },
      ],
    },
  ],

  // ---------------------------------------------------------------- Magic
  ดาร์คอินิทิเอชัน: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'destroyOwnForReturn', filter: { types: ['spirit'] } }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000 }] },
  ],
  ไยมายากระชากวิญญาณ: [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'removeOpponentCores', count: 1 }, { do: 'ifDepleted', steps: [draw1] }] },
  ],
  'โยไร สปาร์ค': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'debuffChosenOpponent', amount: 5000, filter: { types: SPIRIT }, count: 2, destroyAtZero: true }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [draw1, { do: 'buffChosen', amount: 2000 }] },
  ],
  ลำแสงวิญญาณสวรรค์ศักดิ์สิทธิ์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'disableChosenOpponent', filter: { types: SPIRITISH }, if: notPaidSoul },
        // ใช้ Soul Core จ่าย: เลือกได้ต่อสปิริตเผ่าเจ้าหญิงสงครามของเรา 1 ตัว
        { do: 'disableChosenOpponent', filter: { types: SPIRITISH }, countPerAllyFamily: PRINCESS, if: paidSoul },
      ],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.32 ไอส์แลนด์รูท': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [draw1] },
    {
      kind: 'trigger',
      on: 'oppAttack',
      levels: [2],
      steps: [
        may('ย้าย Soul Core บนเน็กซัสนี้ไปสปิริตเรา: ส่งคอร์ 2 เม็ดบนสปิริตคู่แข่ง 1 ตัวไปรีเสิร์ฟ', [{ do: 'soulToAlly' }, { do: 'removeOpponentCores', count: 1, perPick: 2 }], {
          all: [soulOnSelf, { alliesAtLeast: 1 }, { opponentHas: { types: SPIRITISH }, withCores: true }],
        }),
      ],
    },
  ],
  หุบเขาควันม่วง: [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], family: SMING, maxCost: 6 } }] },
    { kind: 'trigger', on: 'allyAttack', subject: { families: [SMING, YAKSHA] }, levels: [2], ownTurnOnly: true, steps: [{ do: 'removeOpponentCores', count: 1 }] },
  ],
  ประตูปราสาทแห่งแคว้นบุปผาเหลือง: [
    {
      kind: 'trigger',
      on: 'startStep',
      levels: [1, 2],
      steps: [
        may('วางแสดงการ์ดสปิริต/เมจิคในมือ 1 ใบ: จั่วการ์ด 1 ใบ', [{ do: 'showFromHand', filter: { types: ['spirit', 'magic'] } }, draw1], {
          all: [{ handHas: { types: ['spirit', 'magic'] } }, { deckAtLeast: 1 }],
        }),
      ],
    },
    // เทิร์นของคู่แข่ง: ทำลายสปิริต/อัลติเมทแดง/เขียว/ฟ้าทั้งหมด (ทั้งสองฝั่ง) ที่ฟื้นสภาพโดยเอฟเฟกต์ของสปิริต/อัลติเมท/เมจิค
    { kind: 'destroyRefreshedByEffect', levels: [2], colors: ['red', 'green', 'blue'] },
  ],
  'No.11 ทิพบอล': [
    { kind: 'trigger', on: 'allyMagicUsed', levels: [1, 2], attackStepOnly: true, steps: [{ do: 'buffChosen', amount: 3000, ally: true }] },
    {
      kind: 'trigger',
      on: 'oppAttackStepStart',
      levels: [2],
      steps: [
        may('ย้าย Soul Core ไปสปิริตเรา: ในเทิร์นนี้การ์ดที่มีเจ็มตั้งแต่ 2 เม็ดถือว่ามีเจ็ม 0', [{ do: 'soulToAlly' }, { do: 'symbolsZeroThisTurn', minSymbols: 2 }], {
          all: [soulOnSelf, { alliesAtLeast: 1 }],
        }),
      ],
    },
  ],
};

