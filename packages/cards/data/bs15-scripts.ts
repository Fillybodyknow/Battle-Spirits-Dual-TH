/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 15 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS24 สีเขียว / เหลือง / ฟ้า)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger เปิดใบบนสุดเด็คคู่แข่งไปแทรช คอสต์ต่ำกว่าอัลติเมทนี้ = ฮิต → then
 * "ถ้าจะป้องกันด้วยสปิริต ต้องป้องกันด้วยสปิริต N ตัว ต่อสู้ตัวเดียว" = step pairBlock.count (ผู้โจมตีเลือกตัวที่จะต่อสู้)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const U345 = [3, 4, 5];
const U45 = [4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const QUICK = { kind: 'quick' as const };
const SWORD_BEAST = 'ศาสตราสมิง';

/** มีอัลติเมทของเราอยู่บนสนาม */
const ownUltimate: Condition = { alliesMatchAtLeast: { filter: { types: ['ultimate'] }, count: 1 } };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
const rush = (color: 'green' | 'white' | 'red' | 'purple' | 'yellow' | 'blue', n = 1): Condition => ({ rush: { color, count: n } });
const exhaust = (count = 1): Step => ({ do: 'exhaustOpponent', count, filter: { types: SPIRIT } });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** Bunshin : 1 (เมื่อสปิริตนี้ถูกอัญเชิญ / โจมตี) */
const bunshin = (on: 'summon' | 'attack', levels: number[]) => ({ kind: 'trigger' as const, on, levels, steps: [{ do: 'bunshin' as const, max: 1 }] });

export const BS15_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- เขียว (BS24)
  แอกซ์มอธ: [{ kind: 'replaceDestroy', levels: ALL2, subject: { self: true }, toHand: true }],
  // คอร์บนสปิริตนี้ไม่ลดต่ำกว่า Lv1 โดยคู่แข่ง เมื่อมีการ์ดอัลติเมทในมือให้เปิดแสดง (ตีความ: มีการ์ดอัลติเมทในมือ = มีผลเสมอ)
  โยโรอิฟุคุโร: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    { kind: 'coreFloor', levels: ALL2, self: true, filter: {}, min: 'lv1', if: { handHas: { types: ['ultimate'] } } },
  ],
  เซเบอร์ฮอร์เน็ต: [
    QUICK,
    // คู่แข่งเลือกเสื่อมสภาพสปิริตตัวเอง · มีอัลติเมทของเรา = เราเลือก
    { kind: 'trigger', on: 'destroyed', levels: [2], steps: [when(ownUltimate, [exhaust()], [{ do: 'opponentExhaustsOwn', count: 1, filter: { types: SPIRIT } }])] },
  ],
  ซอร์ดพูมา: [QUICK, bunshin('summon', ALL2)],
  คานาบูน: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        { do: 'voidCore', to: 'reserve', count: 1 },
        when(rush('yellow'), [{ do: 'disableChosenOpponent', filter: { types: SPIRIT }, blockOnly: true }]),
      ],
    },
  ],
  ซอร์ดโคโยตี: [
    // สปิริตเผ่า [ศาสตราสมิง] ของเราได้รับ "เมื่อสปิริตนี้โจมตี: คู่แข่งจะสั่งใช้เบิร์สไม่ได้" (ในการต่อสู้นั้น)
    { kind: 'trigger', on: 'allyAttack', levels: ALL2, subject: { family: SWORD_BEAST }, steps: [{ do: 'battleNoBurst' }] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [exhaust()] },
  ],
  ไนท์อีเกิล: [bunshin('attack', ALL3), { kind: 'cloneBp', levels: L23, bp: 11000 }],
  สกอร์เปียนไนท์: [
    { kind: 'selfCostIf', cost: 5, if: ownUltimate },
    { kind: 'trigger', on: ['attack', 'block'], levels: ALL3, steps: [{ do: 'exhaustAllOpponent', filter: { types: SPIRIT, maxCost: 3 } }] },
    { kind: 'blockOpponentBurst', levels: [3], anyTurn: true, if: { allyInBattle: { types: ['ultimate'] } } },
  ],
  'สัตว์พันปี บีฮีมอธ ซีดาร์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'voidCore', to: 'reserve', count: 1, per: { allies: { types: SPIRIT, color: 'yellow' } } }] },
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: L23,
      ownTurnOnly: true,
      subject: { types: SPIRIT, nameIncludes: ['บีฮีมอธ'] },
      steps: [{ do: 'pairBlock', count: 2, attacker: 'subject' }],
    },
  ],
  'อัลติเมท จิกะวอสป์': [QUICK, uTrigger([4], [exhaust(3)])],
  'อัลติเมท จีโอ': [uTrigger(U345, [{ do: 'pairBlock', count: 3 }])],
  'อัลติเมท เทรนตัน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: U345,
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], color: 'green' } }],
    },
    uTrigger(U45, [{ do: 'pairBlock', count: 3 }]),
  ],
  'อัลติเมท ไกเซอร์แอตลาส': [
    uTrigger(U345, [exhaust(3)]),
    // ชนะและทำลายด้วยการเทียบ BP (ตอนโจมตี) = ไลฟ์คู่แข่ง 1 เม็ดไปวอยด์
    { kind: 'trigger', on: 'allyWonBattle', levels: U45, subject: { self: true, attacker: true }, steps: [{ do: 'opponentLifeToReserve', count: 1, to: 'void' }] },
  ],
  // ---------------- เบรฟ / เน็กซัส / เมจิค เขียว
  คุวะกาแทงก์: [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'voidCore', to: 'ally', count: 1, filter: { types: SPIRIT, families: [SWORD_BEAST, 'สัตว์มายา'] } }] },
  ],
  เทือกเขาดังกาโรที่หมุนวน: [
    { kind: 'cloneVoidCore', levels: ALL2 },
    {
      kind: 'trigger',
      on: 'lifeLost',
      levels: [2],
      oppTurnOnly: true,
      attackStepOnly: true,
      if: { all: [{ lifeAtMost: 3 }, { not: { lifeAtMost: 0 } }] },
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], textIncludes: ['Bunshin'] } }],
    },
  ],
  ดงผลไม้แห่งชีวิต: [
    {
      kind: 'trigger',
      on: 'allySummoned',
      levels: ALL2,
      ownTurnOnly: true,
      mainStepOnly: true,
      oncePerTurn: true,
      subject: { types: ['ultimate'] },
      steps: [{ do: 'voidCore', to: 'reserve', count: 1 }],
    },
    { kind: 'trigger', on: 'lifeLost', levels: [2], oppTurnOnly: true, attackStepOnly: true, steps: [{ do: 'draw', count: 1, perLifeLost: true }] },
  ],
  ไซเคิลพาวเวอร์: [
    {
      kind: 'magic',
      timing: 'flash',
      notMain: true,
      steps: [{ do: 'buffChosen', amount: 2000 }, when(rush('yellow'), [{ do: 'atBattleEnd', steps: [{ do: 'selfFromTrashToHand' }] }])],
    },
  ],
  ไบนดิงครีปเปอร์: [{ kind: 'magic', timing: 'flash', steps: [exhaust(), when(ownUltimate, [exhaust()])] }],
  แชโดว์ลีฟ: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'activateBunshin' }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [exhaust(), { ...exhaust(), per: { allies: { family: 'ร่างแยก' } } } as Step] },
  ],
};
