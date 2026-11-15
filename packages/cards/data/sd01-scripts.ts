/**
 * สคริปต์เอฟเฟกต์ของ Starter Deck 01 ผูกกับการ์ดด้วยชื่อ
 * แต่ละช่องตรงกับบรรทัดเอฟเฟกต์ใน assets/files/SD1.text ตามลำดับ (รวม Burst ซึ่งอยู่ช่องแรก)
 * null = ยังไม่รองรับใน engine (เทสจะตรวจว่าจำนวนช่องตรงกับข้อความ)
 */
import type { CardScript } from '../src/abilities';

type Entry = NonNullable<CardScript[number]>;

const WAR_DRAGON = 'มังกรยุทธ์';
const ALL_LV = [1, 2, 3];
const trueRage = (levels: number[]): Entry => ({ kind: 'trigger', on: 'attack', levels, steps: [{ do: 'mustBlock' }] });

export const SD01_SCRIPTS: Record<string, CardScript> = {
  ฮิเอ็นดราก้อน: [
    { kind: 'staticBp', levels: ALL_LV, if: { soulOnSelf: true }, scope: { ownFamily: WAR_DRAGON }, amount: 4000 },
    trueRage([2, 3]),
  ],
  ฮากาเนะวูม: [
    {
      kind: 'trigger',
      on: 'blockKeyword',
      levels: [1, 2],
      attackStepOnly: true,
      ownTurnOnly: true,
      steps: [{ do: 'chooseBlockers' }],
    },
    trueRage([2]),
  ],
  โซลดรอว์: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        { do: 'draw', count: 2 },
        { do: 'draw', count: 1, if: { paidWithSoul: true } },
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 4000 }] },
  ],
  โอนิมุฉะไรซัน: [
    trueRage(ALL_LV),
    { kind: 'trigger', on: 'attack', levels: ALL_LV, steps: [{ do: 'draw', count: 1 }] },
    // แอทแท็คสเต็ปของเรา: สปิริตเผ่า [มังกรยุทธ์] ของเราถูกป้องกันโดยอัลติเมท → สปิริตนั้น BP+10000
    {
      kind: 'trigger',
      on: 'allyBlocked',
      subject: { family: 'มังกรยุทธ์' },
      blocker: { types: ['ultimate'] },
      levels: [2, 3],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'buffSubject', amount: 10000 }],
    },
  ],
  'ซามูไร-ดราก้อน': [
    { kind: 'evolution', levels: ALL_LV },
    {
      kind: 'trigger',
      on: 'soulEvolvedOnto',
      levels: [2, 3],
      attackStepOnly: true,
      oncePerTurn: true,
      steps: [{ do: 'refreshSelf' }, { do: 'buffSelf', amount: 5000 }],
    },
  ],
  'มังกรเซ็นโงคุ โซลดราก้อน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3, 4],
      steps: [{ do: 'destroyAllOpponent', filter: { types: ['ultimate'], maxBp: 20000 } }],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2, 3, 4],
      steps: [
        {
          do: 'chooseOne',
          if: { soulOnSelf: true },
          options: [
            { label: 'ส่ง Soul Core ลงแทรช: คู่แข่งต้องป้องกัน 2 ตัว', steps: [{ do: 'soulToTrash' }, { do: 'consecutiveBlade' }] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3, 4],
      steps: [{ do: 'lifeOnBlockerDestroyed', amount: 1, onlyConsecutiveBlade: true }],
    },
  ],
  'มังกรศรชัย เบียวฮะ': [
    { kind: 'evolution', levels: [1, 2] },
    {
      kind: 'trigger',
      on: 'allyDepletedByEvolution',
      levels: [2],
      attackStepOnly: true,
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: ['spirit'], maxBp: 4000 } },
        { do: 'draw', count: 2, if: { soulOnSelf: true } },
      ],
    },
  ],
  หุบเหวร้อยปราชญ์: [
    { kind: 'drawStep', levels: [1], extraDraw: [{ amount: 1 }], after: [{ do: 'discard', count: 1 }] },
    { kind: 'drawStep', levels: [2], extraDraw: [{ amount: 1 }, { amount: 1, if: { lifeAtMost: 2 } }] },
  ],
  เบิร์สวอลล์: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'gainLifeFromVoid', count: 1 }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'endAttackStepAfterBattle' }] },
  ],
  'อิคุสะ โทคาเงะ': [{ kind: 'staticBp', levels: [3], if: { soulOnSelf: true }, scope: { self: true }, amount: 6000 }],
  มุฉะดาริว: [],
  จินไรดราก้อน: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL_LV,
      steps: [
        { do: 'buffSelf', amount: 3000 },
        { do: 'mustBlock', if: { soulOnSelf: true } },
      ],
    },
  ],
  มุฉะดราโค: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL_LV,
      steps: [{ do: 'revealPickRestTrash', count: 4, filter: { types: ['spirit'], family: WAR_DRAGON } }],
    },
  ],
  'คาบุริว ดรอว์': [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        { do: 'draw', count: 2 },
        { do: 'returnFromTrash', filter: { types: ['spirit'], family: WAR_DRAGON } },
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000 }] },
  ],
  'เซ็นโกคุ-กุเร็นดราก้อน': [
    trueRage(ALL_LV),
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL_LV,
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'จั่วการ์ด 1 ใบ', steps: [{ do: 'draw', count: 1 }] },
            { label: 'ในเทิร์นนี้ BP+5000', steps: [{ do: 'buffSelf', amount: 5000 }] },
          ],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [{ do: 'lifeOnBlockerDestroyed', amount: 1, if: { soulOnSelf: true } }],
    },
  ],
};
