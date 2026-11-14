/**
 * สคริปต์เอฟเฟกต์ของ Starter Deck 03 ผูกกับการ์ดด้วยชื่อ
 * แต่ละช่องตรงกับบรรทัดเอฟเฟกต์ใน assets/files/SD3.text ตามลำดับ
 * (Burst อยู่ช่องแรก, เอฟเฟกต์ที่ Brave ให้ผู้ร่วมร่างอยู่ท้ายสุด)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import { SD01_SCRIPTS } from './sd01-scripts';

const WARRIOR = 'วิญญาณนักรบ';
const MYOO = 'เมียวโอ';
const DOJI = 'โดจิ';
/** สปิริต/อัลติเมท (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const soulOnSelf: Condition = { soulOnSelf: true };
const mill = (count: number | 'level'): Step => ({ do: 'mill', count });

export const SD03_SCRIPTS: Record<string, CardScript> = {
  โดจิวิหคเขียว: [
    {
      kind: 'trigger',
      on: 'destroyedByOpponent',
      levels: [1, 2],
      steps: [{ do: 'summonFromHand', filter: { types: ['spirit'], nameIncludes: [MYOO] }, fullReductionIf: soulOnSelf }],
    },
  ],
  // [Crush]: ทิ้งเด็คคู่แข่งเท่าเลเวลของสปิริตนี้
  โดจิทะเลฟ้า: [{ kind: 'trigger', on: 'attack', levels: [1, 2, 3], steps: [mill('level')] }],
  โดจินกาขาว: [{ kind: 'replaceDestroy', levels: [1, 2], subject: { nameIncludes: [MYOO, DOJI] }, mill: 3 }],
  ยาริสควิด: [],
  เมียวโอญาณวารี: [
    { kind: 'staticBp', levels: [1, 2, 3], if: soulOnSelf, scope: { ownNamed: [MYOO, DOJI] }, amount: 4000 },
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      milled: { types: ['magic'] },
      levels: [2, 3],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'voidCore', to: 'ally', count: 1 }],
    },
  ],
  'เรือมังกรคู่ ไฮดร้าชิพ': [
    // เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ (BP+4000 อยู่ใน braveCondition)
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [mill(1), { do: 'ifMilled', filter: { minCost: 6 }, steps: [{ do: 'refreshSelf' }] }],
    },
  ],
  อารามคันนงพันรูป: [
    { kind: 'staticBp', levels: [1, 2], if: { attackStep: true }, scope: { ownFamily: WARRIOR }, amount: 2000 },
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      subject: { soul: true, attackEffect: true },
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [mill(5)],
    },
  ],
  'โซเกคิ เบลส': [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxCost: 4 }, count: 2 }, { do: 'millPerDestroyedCost' }],
    },
  ],
  เมียวโอทะเลคราม: [
    { kind: 'trigger', on: 'attack', levels: [1, 2], steps: [mill(7)] },
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      subject: { self: true, attackEffect: true },
      levels: [2],
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [
            { label: 'ส่ง Soul Core ลงแทรช: ทิ้งใบบนสุดเด็คคู่แข่ง 7 ใบ', steps: [{ do: 'soulToTrash' }, mill(7)] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
  เมียวโอดาบแดง: [
    { kind: 'negateOpponentEffects', levels: [1, 2, 3], maxCost: 4 },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [mill(3), { do: 'ifMilled', filter: { types: ['magic'] }, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxCost: 5 } }] }],
    },
  ],
  มนตราดรอว์: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        { do: 'draw', count: 3 },
        { do: 'discard', count: 2, if: { not: { allySoulNamed: [MYOO, DOJI] } } },
        { do: 'discard', count: 1, if: { allySoulNamed: [MYOO, DOJI] } },
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 3000 }] },
  ],
  เมียวโอแห่งการไถ่บาป: [
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      zone: 'hand',
      milled: { hasBurst: true },
      levels: [],
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'อัญเชิญการ์ดนี้จากมือไม่จ่ายคอสต์', steps: [{ do: 'summonThisFree' }] },
            { label: 'ไม่อัญเชิญ', steps: [] },
          ],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [mill(5), { do: 'ifMilled', filter: { maxCost: 5 }, steps: [{ do: 'discardOpponentBurst' }] }],
    },
  ],
  'ฮะไดเมียวโอ เนอวาน่า': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2, 3, 4],
      steps: [{ do: 'destroyHighestCostOpponent', filter: { types: SPIRITISH } }, { do: 'millPerDestroyedCost' }],
    },
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      subject: { nameIncludes: [MYOO] },
      milled: { cost: 3 },
      levels: [2, 3, 4],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'refreshSubject', if: soulOnSelf }],
    },
  ],
  เมียวโอดาบฟ้า: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [mill(3), { do: 'returnFromTrash', filter: { types: ['spirit'], family: WARRIOR }, if: soulOnSelf }],
    },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'destroyChosenOpponent', filter: { types: ['spirit', 'brave'], maxCost: 4 } }] },
  ],
  เบิร์สวอลล์: SD01_SCRIPTS['เบิร์สวอลล์']!,
};
