/**
 * สคริปต์เอฟเฟกต์ของชุด BSC03 (การ์ดต้นรหัส BSC17: อัลติเมททุกสี) ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger เปิดใบบนสุดเด็คคู่แข่งไปแทรช คอสต์ต่ำกว่าอัลติเมทนี้ = ฮิต → then
 * Double U Trigger: uTrigger.double (2 ใบ, แต่ละใบฮิตได้) · "ต่อ U Trigger ที่ฮิต 1 ครั้ง" = per uTriggerHits · Double Hit = เงื่อนไข uTriggerHitsAtLeast 2
 * Critical Hit: when({ uTriggerCard: ตัวกรอง }, ...)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const U34 = [3, 4];
const U345 = [3, 4, 5];
const U45 = [4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const UNDEAD = 'ผีอมตะ';
const MYTH_BEAST = 'สัตว์มายา';
const ownMainStep: Condition = { ownMainStep: true };
const oppAttackStep: Condition = { all: [{ attackStep: true }, { oppTurn: true }] };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** Double U Trigger เมื่ออัลติเมทนี้โจมตี */
const doubleUTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, double: true as const, then }] });
/** "เมนสเต็ปของเรา: เจ็มอัลติเมททั้งหมดของเรา ถือว่าเป็นเจ็มสี...ด้วย" */
const ultAlso = (levels: number[], ...colors: ('red' | 'purple' | 'green' | 'white')[]) => ({ kind: 'ultimateSymbolsAlso' as const, levels, if: ownMainStep, colors });

export const BSC03_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- แดง
  'อัลติเมท เบรดร้า': [ultAlso(U345, 'red'), uTrigger(U45, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 10000 } }])],
  'อัลติเมท ซอร์ดมาสเตอร์ ดราก้อน': [
    { kind: 'trigger', on: 'attack', levels: U345, steps: [{ do: 'mustBlock' }] },
    doubleUTrigger(U45, [
      { do: 'battleLifeIfBlocked', amount: 1, blocker: { types: SPIRIT }, per: { uTriggerHits: true } } as Step,
      when({ uTriggerHitsAtLeast: 2 }, [{ do: 'destroyOpponentBrave' }]),
    ]),
  ],
  'เพลิงระเบิดสูงสุด อัลติเมท บาเซล': [
    {
      kind: 'burst',
      on: 'afterLifeLost',
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 6000 } },
        { do: 'destroyChosenOpponent', filter: { types: ['nexus'] } },
        { do: 'summonThisFree' },
      ],
    },
    uTrigger(U45, [
      may(
        'สั่งใช้เบิร์สของเรา 1 ใบ โดยไม่สนเงื่อนไขเบิร์ส',
        [{ do: 'catalyze', anyBurst: true, then: [may('เซ็ทการ์ดที่มีเบิร์สในมือ 1 ใบ', [{ do: 'setBurstFromHand' }], { handHas: { hasBurst: true } })] }],
        { ownBurstSet: true },
      ),
    ]),
  ],
  // ---------------------------------------------------------------- ม่วง
  'อัลติเมท โซลฮอร์ส': [ultAlso(U34, 'red', 'purple'), uTrigger([4], [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }])],
  'อัลติเมท ดอน ดิเอกอด': [
    [
      { kind: 'noMill', levels: U345 },
      { kind: 'noVoidGainBySpirits', levels: U345 },
    ],
    {
      kind: 'trigger',
      on: 'destroyedByOpponent',
      levels: U45,
      steps: [{ do: 'uTrigger', fromTrash: true, then: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, to: 'void', per: { uTriggerCost: true } } as Step] }],
    },
  ],
  'ราชันย์โครงกระดูก อัลติเมท กิ-กาชา': [
    { kind: 'selfCostIf', cost: 5, if: { all: [] } },
    { kind: 'lv1CostZero', levels: U345, filter: { types: SPIRIT, family: UNDEAD } },
    uTrigger(U45, [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], family: UNDEAD } }]),
  ],
  // ---------------------------------------------------------------- เขียว
  'อัลติเมท เซ็คโคคิจิ': [ultAlso(U34, 'red', 'green'), uTrigger([4], [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT } }])],
  'อัลติเมท แกรนต์ เบ็งเคย์': [
    {
      kind: 'burst',
      on: 'afterOpponentSummonEffect',
      // ตอนเบิร์สถูกสั่งใช้ เอฟเฟกต์ที่ทำงานคือ [เมื่อเบรฟนี้ถูกอัญเชิญ] = คู่แข่งทิ้งการ์ดในมือ 1 ใบ
      steps: [{ do: 'summonThisFree' }, when({ subjectIs: { types: ['brave'] } }, [{ do: 'opponentDiscards', count: 1 }])],
    },
    uTrigger([4], [{ do: 'opponentDiscards', count: 1 }]),
  ],
  'อัลติเมท โอนิคุวาก้า': [
    { kind: 'trigger', on: 'attack', levels: U34, if: { firstBattleOfTurn: true }, steps: [{ do: 'refreshSelf' }] },
    uTrigger([4], [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }, when({ uTriggerCard: { types: ['spirit'] } }, [{ do: 'voidCore', to: 'reserve', count: 2 }])]),
  ],
  // ---------------------------------------------------------------- ขาว
  'อัลติเมท อิกัว บักกี้': [ultAlso(U34, 'red', 'white'), uTrigger([4], [{ do: 'bounceOpponent', filter: { types: SPIRIT } }])],
  'อัลติเมท แซงค์ ไชน์': [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'summonThisFree' }] },
    { kind: 'blockWhileExhausted', levels: U34, if: oppAttackStep },
    { kind: 'trigger', on: 'block', levels: [4], steps: [{ do: 'uTrigger', then: [{ do: 'onBattleWin', steps: [{ do: 'opponentLifeToReserve', count: 1 }] }] }] },
  ],
  'จอมพลสูงสุด อัลติเมท เรย์-ซอเลอร์': [
    {
      kind: 'trigger',
      on: 'oppAttackStepStart',
      levels: U345,
      steps: [may('เลือกระบุสปิริตของคู่แข่ง 1 ตัว: ในเทิร์นนี้โจมตีไม่ได้', [{ do: 'disableChosenOpponent', filter: { types: SPIRIT } }], { opponentHas: { types: SPIRIT } })],
    },
    uTrigger(U45, [{ do: 'battleUnblockable', by: 'spirits' }, when({ uTriggerCard: { maxCost: 3 } }, [{ do: 'symbolThisTurn', color: 'ultimate', count: 1, untilBattleEnd: true }])]),
  ],
  // ---------------------------------------------------------------- เหลือง
  'อัลติเมท ฮิปโปกริฟฟี่': [
    { kind: 'trigger', on: 'attack', levels: U345, steps: [{ do: 'blockTax', reserveToTrash: 1 }] },
    uTrigger(U45, [{ do: 'returnFromTrash', filter: { types: ['spirit'], family: MYTH_BEAST } }]),
  ],
  'อัลติเมท ทามาโมโนะอิน': [
    { kind: 'unblockableByCost', levels: U345, if: { ownAttackStep: true }, attacker: { types: ['ultimate'] }, maxLevel: 1 },
    uTrigger(U45, [{ do: 'unblockableByUltimatesThisTurn', filter: { types: SPIRIT, textIncludes: ['Holy Life'] } }]),
  ],
  'อัลติเมท ทริคสเตอร์': [
    { kind: 'trigger', on: 'summon', levels: U345, steps: [{ do: 'returnFromTrash', filter: { types: ['magic'] } }] },
    uTrigger(U45, [{ do: 'returnFromTrash', filter: {} }, when({ uTriggerCard: { maxCost: 4 } }, [{ do: 'refreshAllAllies', filter: { types: ['ultimate'], notSelf: true } }])]),
  ],
  // ---------------------------------------------------------------- ฟ้า
  'อัลติเมท ซี เซอร์เพนเดอร์': [
    { kind: 'trigger', on: 'summon', levels: U34, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, hasBraves: true } }] },
    { kind: 'trigger', on: 'oppAttackStepStart', levels: [4], steps: [{ do: 'uTrigger', then: [{ do: 'opponentCannotAttack', types: ['spirit', 'brave'], filter: { maxCost: 5 } }] }] },
  ],
  'อัลติเมท โกลดิแอส': [
    { kind: 'trashLock', levels: U345 },
    doubleUTrigger(U45, [
      { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 }, per: { uTriggerHits: true } } as Step,
      when({ uTriggerHitsAtLeast: 2 }, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT } }]),
    ]),
  ],
  'อัลติเมท โอไรออน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: U34,
      steps: [
        {
          do: 'uTrigger',
          then: [
            { do: 'opponentTotalBp', maxTotal: 12, action: 'destroy', metric: 'cost', filter: { types: SPIRIT } },
            when({ uTriggerCard: { maxCost: 5 } }, [{ do: 'mill', count: 12 }]),
          ],
        },
      ],
    },
  ],
};
