/**
 * สคริปต์เอฟเฟกต์ของ Starter Deck 04 ผูกกับการ์ดด้วยชื่อ
 * แต่ละช่องตรงกับบรรทัดเอฟเฟกต์ใน assets/files/SD4.text ตามลำดับ
 * (ช่องที่เป็น array = บรรทัดเดียวมีหลายความสามารถ)
 */
import type { CardFilter, CardScript, Condition } from '../src/abilities';

const YOKAI = 'โยวไค';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const notPaidSoul: Condition = { not: paidSoul };

export const SD04_SCRIPTS: Record<string, CardScript> = {
  'ฮิโทสึเมะ โบส': [{ kind: 'trigger', on: 'destroyed', levels: [1, 2], steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, family: YOKAI } }] }],
  คาระคาสะแมน: [],
  คัปปัปปะ: [
    [
      { kind: 'trigger', on: 'destroyedByOpponent', levels: [1, 2], steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT, maxCost: 3 } }] },
      // มี Soul Core: ถือว่าถูกทำลายแล้ว แต่ยังอยู่บนฟิลด์แบบเสื่อมสภาพ
      { kind: 'replaceDestroy', levels: [1, 2], subject: { self: true }, if: soulOnSelf, battle: true, auto: true, state: 'exhausted' },
    ],
  ],
  วันโคมะ: [
    {
      kind: 'trigger',
      on: 'milledByOpponent',
      zone: 'trash',
      levels: [],
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'นำการ์ดทั้งหมดในแทรชกลับไปใต้สุดเด็ค (เรียงลำดับเอง)', steps: [{ do: 'trashToDeckBottom' }] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
    { kind: 'trigger', on: 'allyDestroyed', subject: { other: true }, levels: [1, 2], steps: [{ do: 'refreshSelf' }] },
  ],
  'ซาชิกิ เกิร์ล': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { family: YOKAI },
      levels: [1, 2],
      ownTurnOnly: true,
      mainStepOnly: true,
      steps: [{ do: 'draw', count: 1, if: soulOnSelf }],
    },
  ],
  นูริคาเบะ: [],
  'โอโบโระ กิชชา': [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      zone: 'hand',
      subject: { family: YOKAI },
      levels: [],
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'อัญเชิญเบรฟนี้จากมือไม่จ่ายคอสต์', steps: [{ do: 'summonThisFree' }] },
            { label: 'ไม่อัญเชิญ', steps: [] },
          ],
        },
      ],
    },
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'draw', count: 1, if: paidSoul }] },
  ],
  บ้านมาโยอิ: [
    {
      kind: 'trigger',
      on: 'lifeLost',
      levels: [1, 2],
      oppTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], family: YOKAI } }],
    },
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { soul: true },
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      oncePerTurn: true,
      steps: [{ do: 'gainLifeFromVoid', count: 1 }],
    },
  ],
  'ฮิโนะทามะ แอทแท็ค': [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'debuffChosenOpponent', amount: 6000, filter: { types: SPIRITISH }, count: 1, if: notPaidSoul, destroyAtZero: true },
        // ใช้ Soul Core: เลือกเป้าหมายได้เท่าจำนวนสปิริตเราเผ่า [โยวไค]
        { do: 'debuffChosenOpponent', amount: 6000, filter: { types: SPIRITISH }, countPerAllyFamily: YOKAI, if: paidSoul, destroyAtZero: true },
      ],
    },
  ],
  'โทเซ็นโบ วอลล์': [
    { kind: 'fullReductionIfAlly', name: 'นูริคาเบะ' },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'opponentCannotAttack', types: ['spirit', 'brave'], if: notPaidSoul },
        { do: 'opponentCannotAttack', types: ['spirit', 'brave', 'ultimate'], if: paidSoul },
      ],
    },
  ],
  โดโระเทอร์โบ: [{ kind: 'blockSameCost', levels: [1, 2, 3], family: YOKAI, if: soulOnSelf }],
  เยลโล่รีคัฟเวอร์: [
    { kind: 'magic', timing: 'flash', oncePerTurn: true, steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, color: 'yellow' } }] },
  ],
  ฟูริน: [{ kind: 'trigger', on: 'destroyedByOpponent', levels: [1, 2, 3], steps: [{ do: 'returnFromTrash', filter: { types: ['magic'] } }] }],
  อินุงามิ: [
    {
      kind: 'trigger',
      on: 'allyMagicUsed',
      levels: [1, 2, 3],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'draw', count: 1, if: soulOnSelf }],
    },
    // ทิ้งเมจิคบนมือ 1 ใบ: ถือว่าถูกทำลายแล้ว แต่ยังอยู่บนฟิลด์แบบฟื้นสภาพ
    { kind: 'replaceDestroy', levels: [2, 3], subject: { self: true }, battle: true, discard: { types: ['magic'] }, state: 'refresh' },
  ],
};
