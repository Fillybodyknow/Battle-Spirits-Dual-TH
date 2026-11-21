/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 13 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 *
 * Rush (กติกา 14 Rush): เงื่อนไข <เจ็มสี> นับเจ็มบนฟิลด์เรา · ทำงานต่อจากเอฟเฟกต์ด้านบนเสมอ
 *  "(เจ็ม X 1 เม็ด): A. (เจ็ม X 2 เม็ด): B." = มี 1 เม็ดขึ้นไปได้ A, มี 2 เม็ดขึ้นไปได้ A และ B (สะสม)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import type { Color } from '../src/schema';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const NEXUS: CardFilter = { types: ['nexus'] };
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };

/** Shield (กติกา 14): ไม่รับผลเอฟเฟกต์สปิริต/เน็กซัส/เมจิค · Heavy = + เบรฟ · Ultra = + อัลติเมท (ไม่รวมเบรฟ) */
const SHIELD: ('spirit' | 'nexus' | 'magic' | 'brave' | 'ultimate')[] = ['spirit', 'nexus', 'magic'];
const HEAVY: typeof SHIELD = ['spirit', 'brave', 'nexus', 'magic'];
const ULTRA: typeof SHIELD = ['spirit', 'ultimate', 'nexus', 'magic'];

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
/** ถ้าเงื่อนไขจริง ทำ steps */
const when = (cond: Condition, steps: Step[]): Step => ({ do: 'when', if: cond, steps });
/** Rush: เงื่อนไข <เจ็มสี> อย่างน้อย n เม็ด */
const rush = (color: Color, n = 1): Condition => ({ rush: { color, count: n } });
/** "สีและเจ็มของ...นี้ถือว่าเป็นสี ... ด้วย" */
const alsoColor = (levels: number[], ...colors: Color[]): ScriptAbility[] => [
  ...colors.map((color) => ({ kind: 'colorAlso' as const, levels, color })),
  ...colors.map((color) => ({ kind: 'symbolAlsoColor' as const, levels, color })),
];

export const BS13_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Spirit
  ซอร์ดดอล: [alsoColor(ALL2, 'white')],
  'โบน-ไดล์': [{ kind: 'extraSymbol', levels: ALL2, if: { ownMainStep: true }, color: 'white', count: 2 }],
  ชุดเกราะเร่าร้อน: [{ kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'draw', count: 1 }] }, alsoColor(ALL2, 'white')],
  อิจิบันสเปียร์: [
    alsoColor(ALL2, 'red'),
    { kind: 'handCostSet', levels: ALL2, filter: { nameIncludes: ['จอมมารสวรรค์ ก็อด-เซคส์'] }, cost: 6 },
    // Ultra Shield: แดง/ขาว/ฟ้า
    { kind: 'effectImmune', levels: [2], scope: 'self', colors: ['red', 'white', 'blue'], types: ULTRA },
  ],
  'นักรบเครื่องกล จาโด': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT } },
        // "นอกจากนี้ เมื่อมีโซลคอร์อยู่บนสปิริตสีแดงของเราที่ไม่ใช่สปิริตนี้": จั่วด้วย (ไม่ขึ้นกับว่ากลับขึ้นมือได้ไหม)
        { do: 'draw', count: 1, if: { alliesMatchAtLeast: { filter: { types: SPIRIT, color: 'red', soul: true, notSelf: true }, count: 1 } } },
      ],
    },
    alsoColor(ALL2, 'red'),
  ],
  'แบทเทิลชิพ-โมอา': [
    { kind: 'noMill', levels: ALL2 },
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL2,
      steps: [{ do: 'discardOpponentBurst' }, { do: 'bounceOpponent', filter: { types: SPIRIT, maxCost: 3 }, if: { ownBurstSet: true } }],
    },
  ],
  'เนก้า-ไทฟอน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [{ do: 'bounceOpponent', filter: NEXUS, count: 3 }, when(rush('purple'), [{ do: 'draw', count: 1 }])],
    },
    { kind: 'trigger', on: 'oppAttack', levels: ALL3, steps: [{ do: 'voidCore', to: 'ally', count: 1, filter: { color: 'purple' } }, { do: 'refreshChosen' }] },
    alsoColor(L23, 'purple'),
  ],
  'นักรบเครื่องกล อิเทะคาชะ': [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', alsoDepleted: true, steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }, { do: 'summonThisFree' }] },
    alsoColor(ALL3, 'red', 'purple'),
    { kind: 'staticBp', levels: L23, if: soulOnSelf, scope: { own: { types: SPIRIT, minColors: 2 } }, amount: 3000 },
  ],
  'มังกรวีรบุรุษ ซีค-ยามาโตะ-ฟรีด': [
    {
      kind: 'burst',
      on: 'afterLifeLost',
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 15000 }, if: { lifeAtMost: 3 } }, { do: 'summonThisFree' }],
    },
    // ตีระบุ (กติกา 14)
    { kind: 'trigger', on: 'attack', levels: [2, 3, 4], steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT }, direct: true }] },
    { kind: 'trigger', on: 'attack', levels: [3, 4], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT }, bpFrom: 'self', if: { ownBurstSet: true } }] },
  ],
  'เทพจักรกลปืนคู่ ดิรุม-ไดน่า': [
    // Heavy Shield: แดง/เขียว/ฟ้า
    { kind: 'effectImmune', levels: ALL3, scope: 'self', colors: ['red', 'green', 'blue'], types: HEAVY },
    {
      kind: 'activated',
      levels: ALL3,
      timing: 'attackFlash',
      label: 'เสื่อมสภาพสปิริตเผ่า [อาวุธ] ของเรา 1 ตัว: ทำลายสปิริตที่มีเอฟเฟกต์ "ไม่ถูกป้องกัน" ของคู่แข่ง 1 ตัว',
      if: {
        all: [{ oppTurn: true }, { allyHas: { types: SPIRIT, family: 'อาวุธ', state: 'refresh' } }, { opponentHas: { types: SPIRIT, textIncludes: ['ไม่ถูกป้องกัน'] } }],
      },
      steps: [{ do: 'exhaustOwn', filter: { types: SPIRIT, family: 'อาวุธ', state: 'refresh' } }, { do: 'destroyChosenOpponent', filter: { types: SPIRIT, textIncludes: ['ไม่ถูกป้องกัน'] } }],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        may('ทิ้งเบิร์สคู่แข่ง 1 ใบ: ฟื้นสภาพสปิริตเรา 1 ตัว', [{ do: 'discardOpponentBurst' }, { do: 'refreshChosenAlly', filter: { types: SPIRIT, state: 'exhausted' } }], {
          all: [{ opponentHasBurst: true }, { allyHas: { types: SPIRIT, state: 'exhausted' } }],
        }),
      ],
    },
  ],
  'ขุนศึกจักรพรรดิดำ ดาร์คเนส-กริฟฟอน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRITISH }, per: { gemColors: true }, coresToTrashIf: paidSoul }],
    },
    { kind: 'trigger', on: 'attack', levels: L23, oncePerTurn: true, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }, { do: 'refreshSelf' }] },
  ],
  'จอมมารสวรรค์ ก็อด-เซคส์': [
    [
      { kind: 'effectImmune', levels: ALL3, scope: 'self', types: ['spirit', 'magic'] },
      // Six Heaven's Rush: เงื่อนไข <เจ็ม 3 สี> สปิริต/อัลติเมทของคู่แข่งทั้งหมดฟื้นสภาพไม่ได้ (ทุกทาง ไม่ใช่แค่รีเฟรชสเต็ป)
      { kind: 'opponentNoRefresh', levels: ALL3, filter: { types: SPIRITISH }, if: { ownGemColorsAtLeast: 3 }, anyRefresh: true },
    ],
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: L23,
      subject: { card: { minColors: 2 } },
      if: { all: [{ ownAttackStep: true }, soulOnSelf] },
      steps: [{ do: 'removeOpponentCores', count: 2, filter: { types: SPIRITISH }, to: 'trash' }],
    },
  ],

  // ---------------------------------------------------------------- Brave
  'สคัล-การูด้า': [{ kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'draw', count: 1 }] }],
  โอริงามิฮันเทอร์: [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        { do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, to: 'reserve' },
        { do: 'voidCore', to: 'ally', count: 1, filter: { color: 'white', soul: true } },
      ],
    },
  ],

  // ---------------------------------------------------------------- Magic
  เดรมาซาดาร์: [
    {
      kind: 'magic',
      timing: 'flash',
      notMain: true,
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } },
        when(rush('white'), [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, color: 'purple', state: 'exhausted' } }]),
        when(rush('white', 2), [{ do: 'discardOpponentBurst' }]),
      ],
    },
  ],
  ดาบจอมมาร: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentAttack',
      steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, state: 'exhausted' }, per: { gemColors: true } }, { do: 'payToUseFlash' }],
    },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT } },
        { do: 'draw', count: 1, if: { alliesMatchAtLeast: { filter: { types: SPIRIT, soul: true, anyOf: [{ color: 'red' }, { color: 'purple' }] }, count: 1 } } },
      ],
    },
  ],
  ดรีมเนบิวล่า: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT } },
        when(rush('purple'), [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, to: 'reserve' }]),
        when(rush('purple', 2), [{ do: 'draw', count: 1 }]),
      ],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  สถานที่ศักดิ์สิทธิ์ต้องห้าม: [
    // สปิริตคอสต์ตั้งแต่ 8 ของเราได้รับ Shield: ม่วง/เขียว/ขาว/เหลือง/ฟ้า
    { kind: 'effectImmune', levels: ALL2, scope: { own: { types: SPIRIT, minCost: 8 } }, colors: ['purple', 'green', 'white', 'yellow', 'blue'], types: SHIELD },
    { kind: 'millCap', levels: [2], max: 5 },
  ],
  เกาะโรงงานในทะเลปรอท: [
    { kind: 'trigger', on: 'oppHandIncreased', levels: ALL2, oppTurnOnly: true, steps: [{ do: 'opponentDiscards', count: 1, perHandIncrease: true }] },
    // สปิริตสีม่วง/ขาวของเราได้รับ Heavy Shield: ม่วง/ขาว
    { kind: 'effectImmune', levels: [2], scope: { own: { types: SPIRIT, anyOf: [{ color: 'purple' }, { color: 'white' }] } }, colors: ['purple', 'white'], types: HEAVY },
  ],
  ปราสาทหกสวรรค์ที่ถูกย้อมไปด้วยสีแดงฉาน: [alsoColor(ALL2, 'purple'), { kind: 'drawStep', levels: [2], extraDraw: [{ amount: 1 }], after: [{ do: 'discard', count: 1 }] }],
};
