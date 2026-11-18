/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 04 ผูกกับการ์ดด้วยชื่อ
 * - การ์ดที่อยู่ใน Starter Deck 04 ด้วย: ใช้สคริปต์ชุดเดียวกับ SD04
 * - การ์ดใหม่ของชุดนี้: ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import { SD04_SCRIPTS } from './sd04-scripts';

const MECH = 'เครื่องกล';
const PRINCESS = 'เจ้าหญิงสงคราม';
const YOKAI = 'โยวไค';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ULTIMATE: CardFilter['types'] = ['ultimate'];
/** การ์ดต้นเหตุที่เป็นสปิริต/อัลติเมท (ภูมิคุ้มกัน "เอฟเฟกต์สปิริต/อัลติเมทของคู่แข่ง") */
const SPIRIT_SOURCES: ('spirit' | 'ultimate' | 'brave')[] = ['spirit', 'ultimate', 'brave'];
/** Ultra Shield: ไม่รับผลเอฟเฟกต์ของสปิริต/อัลติเมท/เน็กซัส/เมจิค (ไม่รวมเบรฟ: กติกา 14 Shield) */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const notPaidSoul: Condition = { not: paidSoul };
const noDamage: Condition = { noLifeDamageThisTurn: true };
const ALL_LV = [1, 2, 3];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };

/** อันโกะ: การ์ดที่วางแสดงนอกมือได้ */
const SHOWABLE: CardFilter = { anyOf: [{ types: ['spirit'], cost: 3 }, { types: ['magic'] }] };

const bounce = (filter: CardFilter, extra: Partial<Extract<Step, { do: 'bounceOpponent' }>> = {}): Step => ({ do: 'bounceOpponent', filter, ...extra });

export const BS04_SCRIPTS: Record<string, CardScript> = {
  ...SD04_SCRIPTS,

  // ---------------------------------------------------------------- Brave
  'รถถังชุดเกราะ บิทเตอร์คาบุโตะ': [
    { kind: 'effectImmune', granted: true, levels: [], scope: 'self', colors: ['white', 'yellow'], types: ULTRA },
    { kind: 'effectImmune', granted: true, levels: [], scope: 'self', colors: ['purple'], types: ULTRA, if: soulOnSelf },
  ],
  'แขนเสื้อเกราะ ไฟเตอร์': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [bounce({ types: SPIRITISH, maxBp: 6000 }, { to: 'deckBottom' })] },
    { kind: 'effectImmune', granted: true, levels: [], scope: 'self', colors: ['green', 'blue'], types: ULTRA },
  ],
  โอคิดาคุ: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [{ do: 'returnFromTrash', filter: { anyOf: [{ types: ['spirit'], family: PRINCESS }, { types: ['magic'], color: 'yellow' }] } }],
    },
    // ผู้ร่วมร่างโจมตีอยู่ เมื่อเราใช้เมจิค (หลังเอฟเฟกต์ของเมจิค): ในการต่อสู้นี้ เจ็มกลายเป็นเหลือง 2 เม็ด
    { kind: 'trigger', on: 'allyMagicUsed', granted: true, levels: [], if: { selfAttacking: true }, steps: [{ do: 'setSymbols', color: 'yellow', count: 2 }] },
  ],

  // ---------------------------------------------------------------- Magic
  ไทม์รีวินด์: [
    { kind: 'magic', timing: 'main', steps: [bounce({ types: ['nexus'] }, { to: 'deckBottom' })] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT }, if: paidSoul }] },
  ],
  เทปเปคิวอลล์: [
    { kind: 'trashImmune' },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'endAttackStepAfterBattle' }, { do: 'battleStaysOnDestroy', if: paidSoul }] },
  ],
  ดรีมบับเบิล: [
    { kind: 'magic', timing: 'flash', steps: [bounce({ types: SPIRIT }, { if: notPaidSoul }), bounce({ types: SPIRITISH }, { if: paidSoul })] },
  ],
  ดีไวน์เชน: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'battleNoHandFlash' }, { do: 'battleNoBurst', if: { anyAllySoul: true } }] }],
  ดรีมเชส: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        bounce({ types: SPIRIT }, { anySide: true, to: 'deckTop', if: notPaidSoul }),
        bounce({ types: ULTIMATE }, { anySide: true, to: 'deckTop', if: paidSoul }),
      ],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.1 นอร์ธซีโรด': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      // สปิริตสีขาวที่เป็นการอัญเชิญใบแรกสุดของเทิร์น (การวางเน็กซัสไม่นับ, Brave นับ)
      subject: { types: SPIRIT, color: 'white', firstOfTurn: true },
      levels: [1, 2],
      ownTurnOnly: true,
      mainStepOnly: true,
      steps: [{ do: 'voidCore', to: 'subject', count: 1 }],
    },
    // ไม่รับความเสียหายจากอัลติเมท: ยังไม่มีอัลติเมทในเกม
    null,
  ],
  ปราสาทเครื่องกล: [
    { kind: 'trigger', on: 'oppEndStep', levels: [1, 2], if: noDamage, oncePerTurnByName: true, steps: [{ do: 'draw', count: 2 }] },
    { kind: 'trigger', on: 'oppEndStep', levels: [2], steps: [{ do: 'revealSummon', count: 1, filter: { types: ['spirit'], family: MECH }, max: 1, rest: 'trash' }] },
  ],
  'No.38 เลิฟพรินเซส': [
    { kind: 'trigger', on: 'allyMagicUsed', levels: [1, 2], ownTurnOnly: true, attackStepOnly: true, steps: [{ do: 'draw', count: 1 }] },
    { kind: 'negateOpponentNexus', levels: [2], if: soulOnSelf, unlessNamed: ['No.'] },
  ],

  // ---------------------------------------------------------------- Spirit (ขาว)
  'มหานักรบเครื่องกล คองโก': [
    { kind: 'effectImmune', levels: ALL_LV, scope: { ownFamily: MECH }, types: SPIRIT_SOURCES, oppTurnOnly: true },
    { kind: 'trigger', on: ['attack', 'block'], levels: ALL_LV, steps: [bounce({ types: SPIRITISH, noSoul: true })] },
    { kind: 'bounceToBottom', levels: [2, 3], if: soulOnSelf, attackStepOnly: true },
  ],
  คัทเทอร์สวอลโล: [
    { kind: 'trigger', on: 'destroyedByOpponent', levels: [1, 2], steps: [bounce({ types: SPIRIT }), bounce({ types: SPIRIT }, { if: soulOnSelf })] },
  ],
  'สุนัขเครื่องกล เซตะด็อก': [{ kind: 'staticBp', levels: [1, 2], if: soulOnSelf, scope: { self: true }, amount: 5000 }],
  'นักรบเครื่องกล ไซอุน': [
    { kind: 'staticBp', levels: ALL_LV, scope: { ownFamily: MECH }, amount: 3000 },
    {
      kind: 'trigger',
      on: 'oppEndStep',
      levels: [2, 3],
      if: noDamage,
      steps: [{ do: 'voidCore', to: 'self', count: 1 }, { do: 'voidCore', to: 'self', count: 2, if: soulOnSelf }],
    },
  ],
  'แปดอัศวินเก็นจิ ฮิดาสุดีเฟนเดอร์': [
    { kind: 'effectImmune', levels: [1, 2], scope: 'self', colors: ['purple', 'blue'], types: ULTRA },
    { kind: 'effectImmune', levels: [2], scope: { ownNamed: ['เก็นจิ'] }, colors: ['purple', 'blue'], types: ULTRA },
  ],
  ฟุบุกิโกะเซน: [
    { kind: 'trigger', on: 'oppHandIncreased', levels: [1, 2], oppTurnOnly: true, steps: [{ do: 'opponentDiscards', count: 1, perHandIncrease: true }] },
  ],
  'ขุนพลเครื่องกล ชิงุเระ': [
    { kind: 'blockWhileExhausted', levels: ALL_LV },
    { kind: 'staticBp', levels: ALL_LV, if: { oppTurn: true }, scope: { self: true }, amount: 4000 },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3],
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [{ label: 'ส่ง Soul Core ลงแทรช: ไม่ถูกป้องกันโดยสปิริตของคู่แข่ง', steps: [{ do: 'soulToTrash' }, { do: 'battleUnblockable', by: 'spirits' }] }, NO],
        },
      ],
    },
  ],
  'แปดอัศวินเก็นจิ อุสุงาเนะสไตรเกอร์': [
    { kind: 'trigger', on: 'attack', levels: ALL_LV, steps: [{ do: 'discardOpponentBurst' }, { do: 'ifBurstDiscarded', steps: [bounce({ types: SPIRITISH })] }] },
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { nameIncludes: ['เก็นจิ'] },
      levels: [2, 3],
      ownTurnOnly: true,
      if: soulOnSelf,
      // เก็นจิแต่ละตัวได้ "[เมื่อสปิริตนี้โจมตี] เมื่อจบการต่อสู้, เทิร์นละ 1 ครั้ง, สปิริตนี้สามารถฟื้นสภาพได้" (นับแยกต่อตัว นับเมื่อฟื้นสภาพจริง)
      steps: [
        {
          do: 'atBattleEnd',
          steps: [
            {
              do: 'chooseOne',
              options: [
                {
                  label: 'ฟื้นสภาพสปิริตที่โจมตี (ตัวละเทิร์นละ 1 ครั้ง)',
                  if: { subjectCanRefreshOnce: 'genji-refresh' },
                  steps: [{ do: 'refreshSubject' }, { do: 'markSubjectOnce', key: 'genji-refresh' }],
                },
                NO,
              ],
            },
          ],
        },
      ],
    },
  ],
  'ขุนพลเครื่องกล เกียวเทน': [
    { kind: 'trigger', on: 'oppEndStep', levels: [1, 2], if: noDamage, steps: [bounce({ types: SPIRITISH })] },
    // ระบุอัลติเมทของคู่แข่งให้โจมตีไม่ได้: ยังไม่มีอัลติเมทในเกม
    null,
  ],
  'จักรกลอสูรปืนใหญ่ ไลโอเนล': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        { do: 'bounceAllOpponent', filter: { types: SPIRIT, maxBp: 10000 }, if: notPaidSoul },
        { do: 'bounceAllOpponent', filter: { types: ULTIMATE, maxBp: 15000 }, if: paidSoul },
      ],
    },
  ],
  'นักรบเครื่องกลแห่งแขนยักษ์ ราดัน': [
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [bounce({ types: SPIRIT }, { countPerAllyFamily: MECH })] },
    { kind: 'blockWhileExhausted', levels: ALL_LV },
    // ต้องโจมตีถ้าทำได้ และสปิริตนี้เข้าป้องกันเอง (ป้องกันได้แม้เสื่อมสภาพ)
    { kind: 'forceAttack', levels: [2, 3], filter: { types: SPIRIT, maxBp: 10000 } },
  ],
  'สมิงเครื่องกล โชวโจว': [
    {
      kind: 'trigger',
      on: 'oppHandIncreased',
      levels: [1, 2],
      oppTurnOnly: true,
      steps: [
        { do: 'voidCore', to: 'ally', count: 1, filter: { types: SPIRIT, color: 'white' } },
        { do: 'refreshChosenAlly', filter: { types: SPIRIT, color: 'white' }, if: soulOnSelf },
      ],
    },
  ],
  'นักรบเครื่องกล ซันเทะสึ': [
    { kind: 'effectImmune', levels: [1, 2], scope: 'self', colors: ['red'], types: ULTRA },
    { kind: 'effectImmune', levels: [2], if: soulOnSelf, scope: { ownColor: 'white' }, colors: ['red'], types: ULTRA },
  ],
  'นักรบเครื่องกล ชิรานุอิ': [
    { kind: 'effectImmune', levels: [1, 2], scope: 'self', colors: ['red', 'purple', 'white'], types: ULTRA },
    { kind: 'blockWhileExhausted', levels: [1, 2], if: soulOnSelf },
    { kind: 'trigger', on: 'block', levels: [2], steps: [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }] },
  ],
  'สมิงเครื่องกล โยโรอิเฟนท์': [
    { kind: 'symbolAlsoColor', levels: ALL_LV, color: 'purple' },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [bounce({ types: ['nexus'] }, { to: 'deckBottom' }), bounce({ types: SPIRITISH }, { costFrom: 'self', if: soulOnSelf })],
    },
  ],
  'ป้อมปราการไร้พ่าย โอดิน': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL_LV,
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [
            {
              label: 'ส่ง Soul Core ลงแทรช: ต่อเน็กซัส 1 ใบ สปิริตสีขาวของเรา 1 ตัวไม่ถูกป้องกันในเทิร์นนี้',
              steps: [{ do: 'soulToTrash' }, { do: 'unblockableThisTurn', filter: { types: SPIRIT, color: 'white' }, countPerNexus: true }],
            },
            NO,
          ],
        },
      ],
    },
    { kind: 'effectImmune', levels: [2, 3], scope: 'allNexus', types: SPIRIT_SOURCES },
  ],
  'อุล-ดีเน่': [
    { kind: 'trigger', on: 'attack', levels: [1, 2], steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    { kind: 'replaceDestroy', levels: [2], subject: { self: true }, if: soulOnSelf, battle: true, auto: true, state: 'exhausted' },
  ],

  // ---------------------------------------------------------------- Spirit (เหลือง)
  'เซ็นโงคุฮิเมะ นายูทะ': [
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      levels: [1, 2, 3, 4],
      ownTurnOnly: true,
      attackStepOnly: true,
      if: { attackerFamily: PRINCESS },
      steps: [{ do: 'battleUnblockable' }],
    },
    {
      kind: 'activated',
      levels: [2, 3, 4],
      timing: 'attackFlash',
      label: 'ใช้งานการ์ดเมจิค [Flash] 1 ใบในมือโดยไม่จ่ายคอสต์',
      maxPerTurn: 1,
      if: { all: [soulOnSelf, { handHas: { types: ['magic'] } }] },
      steps: [{ do: 'useMagicFromHandFree' }],
    },
  ],
  'เซ็นโงคุฮิเมะ รูริ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: 'แสดงใบบนสุดเด็ค 3 ใบ: เมจิคที่ไม่มีเบิร์ส 1 ใบขึ้นมือ',
              if: { all: [notPaidSoul, { deckAtLeast: 1 }] },
              steps: [{ do: 'revealPickRestTrash', count: 3, filter: { types: ['magic'], noBurst: true }, rest: 'bottom' }],
            },
            {
              label: 'แสดงใบบนสุดเด็ค 6 ใบ: เมจิคที่ไม่มีเบิร์ส 1 ใบขึ้นมือ',
              if: { all: [paidSoul, { deckAtLeast: 1 }] },
              steps: [{ do: 'revealPickRestTrash', count: 6, filter: { types: ['magic'], noBurst: true }, rest: 'bottom' }],
            },
            NO,
          ],
        },
      ],
    },
  ],
  'เทพธิดาเซ็นโงคุ มุชาเอล': [
    { kind: 'replaceDestroy', levels: ALL_LV, subject: { family: PRINCESS }, state: 'exhausted' },
    {
      kind: 'activated',
      levels: [3],
      timing: 'attackFlash',
      label: 'ส่ง Soul Core บนสปิริตเจ้าหญิงสงครามลงแทรช: สปิริต/อัลติเมทคู่แข่ง 1 ตัว BP-5000',
      if: {
        all: [{ ownAttackStep: true }, { allyHas: { types: SPIRIT, family: PRINCESS, soul: true } }, { opponentHas: { types: SPIRITISH } }],
      },
      steps: [{ do: 'allySoulToTrash', filter: { types: SPIRIT, family: PRINCESS } }, { do: 'debuffChosenOpponent', amount: 5000, filter: { types: SPIRITISH } }],
    },
  ],
  คาฉะเนโกะ: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL_LV,
      steps: [
        { do: 'returnFromTrash', filter: { types: ['spirit'], family: YOKAI, excludeNames: ['คาฉะเนโกะ'] } },
        { do: 'returnFromTrash', filter: { types: ['spirit'], family: YOKAI, excludeNames: ['คาฉะเนโกะ'] } },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [
            {
              label: 'ส่ง Soul Core ลงแทรช: ฟื้นสภาพสปิริตโยวไค 2 ตัว',
              if: { allyHas: { types: SPIRIT, family: YOKAI, state: 'exhausted', excludeNames: ['คาฉะเนโกะ'] } },
              steps: [
                { do: 'soulToTrash' },
                { do: 'refreshChosenAlly', filter: { types: SPIRIT, family: YOKAI, excludeNames: ['คาฉะเนโกะ'] } },
                { do: 'refreshChosenAlly', filter: { types: SPIRIT, family: YOKAI, excludeNames: ['คาฉะเนโกะ'] } },
              ],
            },
            NO,
          ],
        },
      ],
    },
  ],
  'เซ็นโงคุฮิเมะ ไรกะ': [
    { kind: 'dispersion', levels: ALL_LV, count: 2 },
    { kind: 'trigger', on: 'allyMagicUsed', levels: [2, 3], if: { selfInBattle: true }, steps: [bounce({ types: SPIRITISH }, { costFrom: 'subject' })] },
  ],
  'เซ็นโงคุฮิเมะ ทริคสเตอร์': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'แสดงใบบนสุดเด็ค 5 ใบ: การ์ดเมจิคทั้งหมดขึ้นมือ ที่เหลือทิ้ง', if: { deckAtLeast: 1 }, steps: [{ do: 'revealTakeAll', count: 5, filter: { types: ['magic'] } }] },
            NO,
          ],
        },
      ],
    },
    { kind: 'handCostDelta', levels: [2], filter: { types: ['magic'] }, delta: -1, ownAttackStepOnly: true },
  ],
  'เซ็นโงคุฮิเมะ อันโกะ': [
    {
      kind: 'trigger',
      on: 'ownAttackStepStart',
      levels: [1, 2],
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [
            {
              label: 'วางแสดงการ์ดสปิริตคอสต์ 3 หรือการ์ดเมจิคในมือ 1 ใบ: จั่วการ์ด 1 ใบ',
              if: { all: [{ handHas: SHOWABLE }, { deckAtLeast: 1 }] },
              steps: [{ do: 'showFromHand', filter: SHOWABLE }, { do: 'draw', count: 1 }],
            },
            NO,
          ],
        },
      ],
    },
  ],
  ซึกิอุซางิ: [
    // Holy Life: การโจมตีของสปิริตนี้ทำให้ไลฟ์คู่แข่งได้รับความเสียหาย → คอร์วอยด์วางไลฟ์เรา
    { kind: 'trigger', on: 'attackHitLife', levels: [1, 2], steps: [{ do: 'gainLifeFromVoid', count: 1 }] },
    { kind: 'trigger', on: 'attackHitLife', levels: [2], if: soulOnSelf, steps: [{ do: 'gainLifeFromVoid', count: 1 }] },
  ],
};
