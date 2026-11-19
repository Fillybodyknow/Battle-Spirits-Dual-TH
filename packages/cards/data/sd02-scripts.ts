/**
 * สคริปต์เอฟเฟกต์ของ Starter Deck 02 ผูกกับการ์ดด้วยชื่อ
 * แต่ละช่องตรงกับบรรทัดเอฟเฟกต์ใน assets/files/SD2.text ตามลำดับ (รวม Burst ซึ่งอยู่ช่องแรก)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type Entry = NonNullable<CardScript[number]>;

const NINJA = 'วายุนินจา';
const INSECT = 'มนุษย์แมลง';
const SPIRIT: CardFilter = { types: ['spirit', 'brave'] };

/** "สามารถส่ง (โซลคอร์) บนสปิริตนี้ไปที่..., เพื่อ X ได้" */
const soulCost = (to: 'reserve' | 'trash', label: string, then: Step[], cond: Condition = { soulOnSelf: true }): Step => ({
  do: 'chooseOne',
  if: cond,
  options: [
    { label, steps: [to === 'reserve' ? { do: 'soulToReserve' } : { do: 'soulToTrash' }, ...then] },
    { label: 'ไม่ใช้', steps: [] },
  ],
});

/** ส่ง Soul Core เพื่อแสดงใบบนสุดเด็ค: ต้องมี Soul Core และเด็คต้องมีการ์ด */
const soulAndDeck: Condition = { all: [{ soulOnSelf: true }, { deckAtLeast: 1 }] };

const exhaust1: Step = { do: 'exhaustOpponent', count: 1, filter: SPIRIT };

export const SD02_SCRIPTS: Record<string, CardScript> = {
  'มารสายลม ชิโนบิริกะ': [
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { family: NINJA, soul: true },
      levels: [1, 2],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'bounceOpponent', filter: { types: ['spirit', 'ultimate', 'brave'], state: 'exhausted' } }],
    },
  ],
  'นินจาเขี้ยวพิศวง รับแพนเธอร์': [
    { kind: 'trigger', on: ['attack', 'block'], levels: [1, 2], steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    { kind: 'staticBp', levels: [2], if: { soulInReserve: true }, scope: { self: true }, amount: 4000 },
  ],
  'มารวายุ นินโควโชว': [
    { kind: 'quick' },
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [exhaust1, { do: 'voidCore', to: 'self', count: 1, if: { paidWithSoul: true } }],
    },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ ชูริคาบุโตะ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2, 3],
      steps: [
        soulCost('reserve', 'ส่ง Soul Core ไปรีเสิร์ฟ: แสดงใบบนสุดเด็ค 1 ใบ', [
          { do: 'revealSummon', count: 1, filter: { types: ['spirit'], family: NINJA }, max: 1 },
        ], soulAndDeck),
      ],
    },
  ],
  'ผู้นำแห่งผีเสื้อราตรีสวมเกราะ คุวากะสเลเยอร์': [
    { kind: 'trigger', on: 'attack', levels: [1, 2, 3], steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2, 3],
      steps: [
        soulCost('reserve', 'ส่ง Soul Core ไปรีเสิร์ฟ: แสดงใบบนสุดเด็ค 3 ใบ', [
          { do: 'revealSummon', count: 3, filter: { types: ['spirit', 'brave'], family: NINJA }, max: null },
        ], soulAndDeck),
      ],
    },
  ],
  'นินจาผีเสื้อราตรีสวมเกราะ โทบิคาเงะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'voidCore', to: 'allAllies', count: 1, filter: { types: ['spirit', 'brave'], families: [NINJA, INSECT] } }],
    },
    { kind: 'blockOpponentBurst', levels: [2], if: { soulOnSelf: true } },
  ],
  เท็ปโปนานะฟุชิ: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [
        {
          do: 'chooseOne',
          if: { handAtLeast: 1 },
          options: [
            { label: 'ทิ้งการ์ดบนมือทั้งหมด แล้วจั่วเท่าการ์ดบนมือคู่แข่ง', steps: [{ do: 'discardHandDrawOpponentCount' }] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
  'ชิโนบิโชกุน คุโระฮางาเนะ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      alsoDepleted: true,
      steps: [
        exhaust1,
        { do: 'exhaustOpponent', count: 1, filter: { types: ['spirit', 'ultimate', 'brave'] }, if: { catalyzed: true } },
        { do: 'summonThisFree' },
      ],
    },
    {
      kind: 'trigger',
      on: 'allyAttackHitLife',
      subject: { family: NINJA, soul: true },
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
  ],
  ชิโนบิโคงาเนะ: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        { do: 'voidCore', to: 'self', count: 1 },
        { do: 'voidCore', to: 'otherAlly', count: 1, if: { paidWithSoul: true } },
      ],
    },
  ],
  'มารวายุ เบนิมาโทอิ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [{ do: 'voidCore', to: 'reserve', count: 1 }, { ...exhaust1, if: { soulOnSelf: true } }],
    },
  ],
  'นินจาชั้นสูงแห่งมารวายุ ไฮวินด์': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [{ do: 'refreshChosenAlly', filter: { types: ['spirit', 'brave'], family: NINJA } }, { do: 'summonThisFree' }],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2],
      steps: [
        {
          do: 'atBattleEnd',
          steps: [
            {
              do: 'chooseOne',
              options: [
                { label: 'นำสปิริตนี้กลับขึ้นมือ', steps: [{ do: 'returnSelfToHand', then: [{ do: 'setBurstFromHand' }] }] },
                { label: 'ไม่ใช้', steps: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
  ชูริเคนพันเล่ม: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentHandIncreased',
      steps: [
        { do: 'exhaustOpponent', count: 2, filter: SPIRIT },
        { do: 'voidCore', to: 'reserve', count: 2 },
        { do: 'payToUseFlash' },
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 4000 }] },
  ],
  'นินจาสลาตัน คิริคาเงะ': [
    { kind: 'quick', soul: true },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2, 3],
      steps: [
        // ถามเฉพาะเมื่อมี Soul Core บนตัวนี้ และ Burst ที่เซ็ทอยู่เป็น Soul Burst สีเขียว (ไม่งั้นเสีย Soul Core ฟรี)
        soulCost('trash', 'ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst สีเขียว', [{ do: 'catalyze', color: 'green' }], { catalyzable: 'green' }),
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [exhaust1] },
  ],
  'ราชาผึ้ง ฟง-นี้ด': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'voidCore', to: 'self', count: 3 }] },
    { kind: 'trigger', on: 'attack', levels: [1, 2], steps: [{ do: 'exhaustOpponentTotalBp', maxTotal: 10000 }] },
    {
      kind: 'trigger',
      on: 'attackHitLife',
      levels: [2],
      steps: [
        {
          do: 'chooseOne',
          // ส่ง 3 ดวงแล้วต้องยังเหลือคอร์ (ไม่งั้นสูญสลาย ฟื้นสภาพไม่ได้ = ท่อนหลังทำไม่ได้)
          if: { selfCoresAtLeast: 4 },
          options: [
            { label: 'ส่ง Core บนสปิริตนี้ 3 ดวงลงแทรช: ฟื้นสภาพ', steps: [{ do: 'selfCoresToTrash', count: 3 }, { do: 'refreshSelf' }] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
};
