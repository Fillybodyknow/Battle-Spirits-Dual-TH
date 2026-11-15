/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 02 ผูกกับการ์ดด้วยชื่อ
 * - การ์ดที่อยู่ใน Starter Deck 02 ด้วย: ใช้สคริปต์ชุดเดียวกับ SD02
 * - การ์ดใหม่ของชุดนี้: ช่องที่เป็น null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import { SD02_SCRIPTS } from './sd02-scripts';

const NINJA = 'วายุนินจา';
const INSECT = 'มนุษย์แมลง';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ULTIMATE: CardFilter['types'] = ['ultimate'];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const notPaidSoul: Condition = { not: paidSoul };
const ALL_LV = [1, 2, 3];

const exhaust = (types: CardFilter['types'], extra: { count?: number; filter?: CardFilter; if?: Condition } = {}): Step => ({
  do: 'exhaustOpponent',
  count: extra.count ?? 1,
  filter: { types, ...extra.filter },
  ...(extra.if ? { if: extra.if } : {}),
});

export const BS02_SCRIPTS: Record<string, CardScript> = {
  ...SD02_SCRIPTS,

  // ---------------------------------------------------------------- Brave
  ฮานุรุกามะ: [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    // ตีความ: คู่แข่งสั่งใช้เบิร์สไม่ได้ในการต่อสู้นี้
    { kind: 'trigger', on: 'attack', granted: true, levels: [], if: soulOnSelf, steps: [{ do: 'battleNoBurst' }] },
  ],
  คาราคุริโอโอคามิ: [
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [exhaust(SPIRIT), { do: 'refreshOnBattleWin', if: soulOnSelf }] },
  ],
  'เหยี่ยวชุดเกราะ ชุยรัน-ฮอว์ค': [{ kind: 'quick' }, { kind: 'extraSymbol', granted: true, levels: [], if: soulOnSelf, color: 'green', count: 1 }],

  // ---------------------------------------------------------------- Magic
  เคล็ดวิชาเคลื่อนย้ายในพริบตา: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, family: NINJA }, sameNameIf: paidSoul }] },
  ],
  เคล็ดวิชาปลดปล่อยวายุ: [
    { kind: 'magic', timing: 'flash', steps: [exhaust(SPIRITISH, { filter: { noSoul: true } }), { do: 'buffChosen', amount: 5000 }] },
  ],
  เคล็ดวิชาสลับร่างแทนกาย: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [{ do: 'turnTrigger', on: 'allyDestroyed', steps: [exhaust(SPIRIT), { do: 'subjectToHand', if: paidSoul }] }],
    },
    { kind: 'magic', timing: 'flash', steps: [exhaust(SPIRIT, { if: paidSoul })] },
  ],
  เคล็ดวิชาปลดปล่อยพสุธา: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        exhaust(SPIRIT, { if: notPaidSoul }),
        // ใช้ Soul Core: ตัวที่เสื่อมสภาพฟื้นสภาพไม่ได้จนจบรีเฟรชสเต็ปครั้งถัดไปของคู่แข่ง
        { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT }, if: paidSoul, lockRefresh: true },
      ],
    },
  ],
  แปลงร่างสลับกายคู่: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [
        exhaust(SPIRITISH),
        { do: 'summonFromHandFree', filter: { types: ['spirit'], family: NINJA }, if: { catalyzed: true } },
        { do: 'summonFromHandFree', filter: { types: ['spirit'], family: NINJA }, if: { catalyzed: true } },
        { do: 'payToUseFlash' },
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'exhaustAllOpponent', filter: { types: SPIRITISH, maxCost: 4 } }] },
  ],
  เคล็ดวิชาปลดปล่อยเขียวขจี: [
    { kind: 'magic', timing: 'flash', steps: [exhaust(SPIRITISH), { do: 'voidCore', to: 'ally', count: 2, if: paidSoul }] },
  ],
  แฮนด์รีเวิร์ส: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'discardHandDrawOpponentCount' }, { do: 'draw', count: 1, if: paidSoul }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000 }] },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.22 ไซเลนท์ฮิล': [
    {
      kind: 'trigger',
      on: 'lifeLost',
      levels: [1, 2],
      oppTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'draw', count: 1, perLifeLost: true }],
    },
    { kind: 'quickAnyCores', levels: [2], if: soulOnSelf },
  ],
  ลมหวนกรรโชกแรง: [
    {
      kind: 'trigger',
      on: 'endStep',
      levels: [1, 2],
      steps: [
        { do: 'refreshChosenAlly', filter: { types: SPIRIT, families: [INSECT, NINJA] } },
        { do: 'refreshChosenAlly', filter: { types: SPIRIT, families: [INSECT, NINJA] } },
      ],
    },
    { kind: 'trigger', on: 'allyDestroyed', subject: { types: SPIRIT }, levels: [2], steps: [exhaust(SPIRITISH)] },
  ],

  // ---------------------------------------------------------------- Spirit
  'นินจาผีเสื้อราตรีสวมเกราะ ฮ็อปปะ': [
    { kind: 'quick' },
    { kind: 'staticBp', levels: [1, 2], if: soulOnSelf, scope: { self: true }, amount: 3000 },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ ทคคุริวอสพ์': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'voidCore', to: 'self', count: 1 }, exhaust(SPIRITISH, { if: { summonedFromDeck: true } })],
    },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ คุซาริคามะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'voidCore', to: 'reserve', count: 2 }, { do: 'opponentDiscards', count: 1, if: { summonedFromDeck: true } }],
    },
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], steps: [exhaust(ULTIMATE, { count: 2 })] },
  ],
  'นินจาเขี้ยวพิศวง โคคุโร่': [
    { kind: 'staticBp', levels: ALL_LV, if: { soulInReserve: true }, scope: { self: true }, amount: 5000 },
    { kind: 'trigger', on: ['attack', 'block'], levels: ALL_LV, steps: [exhaust(SPIRITISH)] },
  ],
  'พระนักรบร่างประหลาด โซอุม': [
    {
      kind: 'activated',
      levels: ALL_LV,
      timing: 'attackFlash',
      label: 'เสื่อมสภาพสปิริตเผ่าร่างประกอบของเรา: เสื่อมสภาพสปิริต/อัลติเมทคู่แข่ง 1 ตัว',
      if: {
        all: [
          { allyHas: { types: SPIRIT, family: 'ร่างประกอบ', state: 'refresh' } },
          { opponentHas: { types: SPIRITISH, state: 'refresh' } },
        ],
      },
      steps: [{ do: 'exhaustOwn', filter: { types: SPIRIT, family: 'ร่างประกอบ' } }, exhaust(SPIRITISH)],
    },
    { kind: 'opponentNoRefresh', levels: [2, 3], filter: { types: SPIRITISH, minCost: 8 } },
  ],
  'นินจาชั้นสูงผีเสื้อราตรีสวมเกราะ เบ็คโด': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: 'นำคอร์วอยด์วางบนสปิริตเรา 2 ตัว: เสื่อมสภาพสปิริต/อัลติเมทคู่แข่ง 1 ตัว',
              if: { all: [{ alliesAtLeast: 2 }, { opponentHas: { types: SPIRITISH, state: 'refresh' } }] },
              steps: [{ do: 'voidCore', to: 'self', count: 1 }, { do: 'voidCore', to: 'otherAlly', count: 1 }, exhaust(SPIRITISH)],
            },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2],
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [
            {
              label: 'เสื่อมสภาพสปิริต BP ไม่เกิน 10000 ของคู่แข่ง: ส่งคอร์ไลฟ์คู่แข่ง 1 เม็ดไปรีเสิร์ฟ',
              if: { opponentHas: { types: SPIRIT, maxBp: 10000, state: 'refresh' } },
              steps: [exhaust(SPIRIT, { filter: { maxBp: 10000 } }), { do: 'opponentLifeToReserve', count: 1 }],
            },
            {
              label: 'เสื่อมสภาพอัลติเมท BP ไม่เกิน 20000 ของคู่แข่ง: ส่งคอร์ไลฟ์คู่แข่ง 1 เม็ดไปรีเสิร์ฟ',
              if: { opponentHas: { types: ULTIMATE, maxBp: 20000, state: 'refresh' } },
              steps: [exhaust(ULTIMATE, { filter: { maxBp: 20000 } }), { do: 'opponentLifeToReserve', count: 1 }],
            },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ โนมิคาเงะ': [{ kind: 'quick' }],
  'นินจาผีเสื้อราตรีสวมเกราะ นามิเทนโท': [
    { kind: 'trigger', on: 'destroyed', levels: [1, 2], steps: [exhaust(SPIRIT), exhaust(SPIRIT, { if: soulOnSelf })] },
  ],
  'นักบวชนินจา ฮิกุราชิ': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    { kind: 'trigger', on: 'destroyedByOpponent', levels: [2], steps: [{ do: 'exhaustAllOpponent', filter: { types: SPIRIT, maxCost: 3 } }] },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ กิริโชว': [
    { kind: 'staticBp', levels: ALL_LV, if: soulOnSelf, scope: { ownFamily: NINJA }, amount: 4000 },
    { kind: 'trigger', on: 'oppDrew', levels: [2, 3], if: { selfExhausted: true }, steps: [{ do: 'refreshSelf' }] },
  ],
  'นินจาเขี้ยวพิศวง เซนโดกิสึเนะ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [
        {
          do: 'chooseOne',
          if: { catalyzable: 'any' },
          options: [
            { label: 'ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst', steps: [{ do: 'soulToTrash' }, { do: 'catalyze' }] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [exhaust(SPIRIT)] },
  ],
  'นินจาเขี้ยวพิศวงชั้นสูง เฮียวโซวกะ': [{ kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [exhaust(SPIRITISH, { count: 3 })] }],
  'มารวายุ อามาซึบะ': [
    { kind: 'quick' },
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        { do: 'refreshChosenAlly', filter: { types: SPIRIT, maxCost: 5 }, if: notPaidSoul },
        { do: 'refreshChosenAlly', filter: { types: SPIRIT }, if: paidSoul },
      ],
    },
  ],
  'นินจาเขี้ยวพิศวง ทาจิคาเซะวูล์ฟ': [
    {
      kind: 'burst',
      on: 'afterLifeLost',
      steps: [{ do: 'summonThisFree' }, { do: 'voidCore', to: 'self', count: 2, if: { soulInReserve: true } }],
    },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [exhaust(SPIRIT)] },
  ],
  ดุ๊คคิงเทารอส: [
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [{ do: 'voidCore', to: 'self', count: 1, countPerAlly: true }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [
        // สปิริตคู่แข่งที่ต่อสู้อยู่ถูกทำลาย/สูญสลาย (ด้วยเหตุใดก็ได้) → คอร์ไลฟ์คู่แข่ง 1 เม็ดลงแทรช
        { do: 'lifeOnBattlerGone', amount: 1, to: 'trash' },
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [{ label: 'ส่ง Soul Core ไปรีเสิร์ฟ: ในการต่อสู้นี้คู่แข่งใช้เอฟเฟกต์แฟลชไม่ได้', steps: [{ do: 'soulToReserve' }, { do: 'battleNoFlash' }] }, { label: 'ไม่ใช้', steps: [] }],
        },
      ],
    },
  ],
  เอปวิป: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'voidCore', to: 'reserve', count: 1 }, { do: 'voidCore', to: 'trash', count: 2, if: paidSoul }],
    },
  ],
};
