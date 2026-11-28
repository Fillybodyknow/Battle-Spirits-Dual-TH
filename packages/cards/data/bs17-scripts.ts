/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 17 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS25 สีเขียว / เหลือง / ฟ้า)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger เปิดใบบนสุดเด็คคู่แข่งไปแทรช คอสต์ต่ำกว่าอัลติเมทนี้ = ฮิต → then
 * Critical Hit: ต่อจาก U Trigger ที่ฮิต "ถ้าการ์ดที่ฮิต…, นอกจากนี้…" = when({ uTriggerCard: ตัวกรอง }, ...)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const U345 = [3, 4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
/** Flash Quick: อัญเชิญจากมือใน Flash timing โดยใช้คอร์จากรีเสิร์ฟเท่านั้น */
const QUICK = { kind: 'quick' as const };
const SWORD_BEAST = 'ศาสตราสมิง';
const CLONE = 'ร่างแยก';
/** การ์ดที่มี Quick */
const HAS_QUICK: CardFilter = { textIncludes: ['Quick'] };
const oppAttackStep: Condition = { all: [{ attackStep: true }, { oppTurn: true }] };
const U45 = [4, 5];
const DIVA = 'ดีว่า';
const RESEARCHER = 'นักวิจัย';
const GANDHARVA = 'คนธรรพ์';
/** สปิริตเผ่า [ดีว่า]/[นักวิจัย] ของเรารวมกันตั้งแต่ 3 ตัว */
const DIVA3: Condition = { alliesMatchAtLeast: { filter: { types: SPIRIT, families: [DIVA, RESEARCHER] }, count: 3 } };
/** มีอัลติเมทของเราอยู่บนสนาม */
const ownUltimate: Condition = { alliesMatchAtLeast: { filter: { types: ['ultimate'] }, count: 1 } };
const draw = (count = 1): Step => ({ do: 'draw', count });
const SYNTH = 'ทหารสังเคราะห์';
const WARRIOR = 'วิญญาณนักรบ';
const SUMMON_BOLT = 'Summon Bolt';
/** ทำลายสปิริตคอสต์ n ของคู่แข่ง 1 ตัว (เลเวน: "คอสต์ 1/2/3/4 อย่างละ 1 ตัว") */
const destroyCostExact = (n: number): Step => ({ do: 'destroyChosenOpponent', filter: { types: SPIRIT, minCost: n, maxCost: n } });
/**
 * Summon Bolt : คอสต์ min/max เมื่อสปิริตนี้โจมตี/ป้องกัน: เมื่อจบการต่อสู้ สามารถทำลายสปิริตนี้ เพื่ออัญเชิญไม่จ่ายคอสต์
 * การ์ดสปิริตในมือคอสต์ min หรือ max ที่มีเผ่าเดียวกัน (อัญเชิญโดย Summon Bolt = summonBolt)
 * ธงโจรสลัดมังกรสามหัว: ถูกทำลายจากการเทียบ BP ไปแล้วก็ยังอัญเชิญได้ (ไม่ต้องทำลายตัวเอง)
 */
const summonBolt = (levels: number[], min: number, max: number) => {
  const f: CardFilter = { types: ['spirit'], minCost: min, maxCost: max, sameFamilyAs: 'self' };
  const summon: Step = { do: 'summonFromHandFree', filter: f, summonBolt: true };
  return {
    kind: 'trigger' as const,
    on: ['attack', 'block'] as ('attack' | 'block')[],
    levels,
    steps: [
      {
        do: 'atBattleEnd' as const,
        steps: [
          {
            do: 'chooseOne' as const,
            options: [
              { label: `Summon Bolt: ทำลายสปิริตนี้ เพื่ออัญเชิญสปิริตคอสต์ ${min}/${max} เผ่าเดียวกันจากมือไม่จ่ายคอสต์`, if: { all: [{ selfCoresAtLeast: 1 }, { handHas: f }] } as Condition, steps: [{ do: 'destroySelf' } as Step, summon] },
              { label: `Summon Bolt: อัญเชิญสปิริตคอสต์ ${min}/${max} เผ่าเดียวกันจากมือไม่จ่ายคอสต์`, if: { all: [{ summonBoltAfterBattleLoss: true }, { handHas: f }] } as Condition, steps: [summon] },
              NO,
            ],
          },
        ],
      },
    ],
  };
};

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
const rush = (color: 'green' | 'white' | 'red' | 'purple' | 'yellow' | 'blue', n = 1): Condition => ({ rush: { color, count: n } });
const exhaust = (count = 1, types: CardFilter['types'] = SPIRIT): Step => ({ do: 'exhaustOpponent', count, filter: { types } });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** Spirit Soul: เมื่อเราอัญเชิญการ์ดอัลติเมท สปิริตนี้ได้รับเจ็มสีนี้เพิ่ม 1 เม็ด */
const spiritSoul = (levels: number[], color: 'green' | 'yellow' | 'blue') => ({ kind: 'summonSymbol' as const, levels, filter: { types: ['ultimate' as const] }, color, count: 1 });
/** เซอร์ไวเวอร์: "สปิริตนี้จะไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง" */
const survivor = (levels: number[]) => ({ kind: 'destroyImmune' as const, levels, scope: { self: true as const } });

export const BS17_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- เขียว (BS25)
  ฮาคุบิซอร์ด: [QUICK, spiritSoul(ALL3, 'green')],
  เซเบอร์เซเซริ: [{ kind: 'uTriggerGuard', levels: [], maxCost: 7 }],
  เซอร์ไวเวอร์ฟูกะ: [survivor(ALL2), { kind: 'trigger', on: 'depletedByOpponent', levels: ALL2, steps: [{ do: 'bunshin', max: 1 }] }],
  ไลคาออสปาดา: [QUICK, { kind: 'trigger', on: 'summon', levels: ALL2, if: oppAttackStep, steps: [exhaust(2)] }],
  ลัคกี้แคท: [
    QUICK,
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { byBattle: true, card: { types: SPIRIT, ...HAS_QUICK } },
      levels: [3],
      oppTurnOnly: true,
      attackStepOnly: true,
      steps: [may('นำสปิริตที่ถูกทำลายกลับขึ้นมือ', [{ do: 'subjectToHand' }])],
    },
  ],
  ไนท์ไอบิส: [
    {
      kind: 'trigger',
      on: ['allyAttack', 'allyBlock'],
      subject: { card: { family: CLONE } },
      levels: ALL3,
      steps: [{ do: 'cloneStack', cost: 6, bp: 20000, symbols: 2 }],
    },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: L23,
      if: { not: { alliesMatchAtLeast: { filter: { family: CLONE }, count: 3 } } },
      steps: [{ do: 'activateBunshinAll' }],
    },
  ],
  แดนดริออน: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'voidCore', to: 'reserve', count: 2 }] },
    {
      kind: 'trigger',
      on: 'allyAttackHitLife',
      subject: { card: { types: ['ultimate'], nameIncludes: ['เบียคุ-กาโร'] } },
      levels: [2],
      ownTurnOnly: true,
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
  ],
  'แมลงจ้าวดาบ แกรนดิควากา': [
    QUICK,
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [
        { do: 'buffSelf', amount: 5000, untilBattleEnd: true },
        when(rush('red'), [{ do: 'destroyChosenOpponent', filter: { types: ['nexus'] } }]),
        when(rush('yellow'), [{ do: 'battleUnblockableLevel', level: 1 }]),
      ],
    },
  ],
  'อัลติเมท คาราคาลอสซัม': [QUICK, { kind: 'trigger', on: 'block', levels: [4], steps: [{ do: 'uTrigger', then: [{ do: 'refreshSelf' }] }] }],
  'อัลติเมท อาเมนบอร์ก': [
    QUICK,
    uTrigger(U345, [{ do: 'summonFromHandFree', filter: { types: ['spirit'], ...HAS_QUICK } }]),
  ],
  ผลของหญ้าเขี้ยวมรกต: [
    { kind: 'staticBp', levels: ALL2, if: { attackStep: true }, scope: { own: { types: SPIRITISH, inBattle: true } }, amount: 2000 },
    {
      kind: 'trigger',
      on: 'allyUTriggerHit',
      subject: { card: { types: ['ultimate'], color: 'green' } },
      levels: [2],
      attackStepOnly: true,
      steps: [{ do: 'returnFromTrash', filter: { types: ['spirit', 'ultimate'], ...HAS_QUICK } }],
    },
  ],
  วินด์เซอร์เคิล: [
    {
      kind: 'burst',
      on: 'afterAllyDestroyedByOpponent',
      steps: [{ do: 'subjectToHand', if: { subjectIs: { types: ['spirit'], ...HAS_QUICK } } }, { do: 'payToUseFlash' }],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'noOpponentDestroyTriggers', thisTurn: true }] },
  ],
  ไบนดิงสเกล: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'เสื่อมสภาพสปิริต/อัลติเมทของคู่แข่ง 1 ตัว', steps: [exhaust(1, SPIRITISH)], if: { opponentHas: { types: SPIRITISH, state: 'refresh' } } },
            { label: 'ในเทิร์นนี้ สปิริต/อัลติเมท 1 ตัว BP+10000', steps: [{ do: 'buffChosen', amount: 10000 }] },
          ],
        },
      ],
    },
  ],
  'อัลติเมท เบียคุ-กาโร': [
    QUICK,
    uTrigger(U345, [
      { ...exhaust(1), per: { allies: { types: SPIRITISH, family: SWORD_BEAST } } } as Step,
      when({ uTriggerCard: { maxCost: 3 } }, [{ do: 'atBattleResolve', steps: [{ do: 'bounceAllOpponent', filter: { types: SPIRIT, state: 'exhausted' }, to: 'deckBottom' }] }]),
    ]),
  ],
  // ---------------------------------------------------------------- เหลือง (BS25)
  นางฟ้าวิสเอล: [spiritSoul(ALL3, 'yellow'), { kind: 'bpMinusBoost', levels: L23, amount: 1000 }],
  เคริวเนียร์: [
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { types: ['ultimate'], color: 'yellow' },
      levels: ALL2,
      ownTurnOnly: true,
      mainStepOnly: true,
      oncePerTurn: true,
      steps: [draw()],
    },
    { kind: 'trigger', on: 'destroyedByOpponent', levels: [2], steps: [draw()] },
  ],
  เซอร์ไวเวอร์นางฟ้าเมล: [
    survivor(ALL2),
    [
      { kind: 'staticBp', levels: ALL2, if: { all: [{ attackStep: true }, { not: ownUltimate }] }, scope: { own: { types: SPIRIT, family: GANDHARVA } }, amount: 2000 },
      { kind: 'staticBp', levels: ALL2, if: { all: [{ attackStep: true }, ownUltimate] }, scope: { own: { types: SPIRITISH, family: GANDHARVA } }, amount: 4000 },
    ],
    { kind: 'trigger', on: 'allyAttack', subject: { types: ['ultimate'], nameIncludes: ['อิสฟีล'] }, levels: [2], ownTurnOnly: true, steps: [draw(2)] },
  ],
  'นักวิจัย อาร์เชีย': [
    { kind: 'destroyImmune', levels: ALL3, if: { not: { selfExhausted: true } }, fromTypes: ['spirit', 'brave', 'magic'], scope: { self: true } },
    { kind: 'drawStep', levels: L23, extraDraw: [{ amount: 1, if: DIVA3 }], noStack: true },
    { kind: 'coreStepBonus', levels: [3], amount: 1, if: DIVA3, noStack: true },
  ],
  คาลิดอน: [
    { kind: 'trigger', on: 'attackHitLife', levels: ALL3, steps: [{ do: 'gainLifeFromVoid', count: 1 }] },
    { kind: 'trigger', on: 'destroyedByOpponent', levels: L23, steps: [draw(), when(rush('green', 2), [{ do: 'voidCore', to: 'reserve', count: 2 }])] },
  ],
  'นักร้อง ราเควล': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL2,
      steps: [
        {
          do: 'debuffChosenOpponent',
          amount: 5000,
          filter: { types: SPIRIT },
          untilBattleEnd: true,
          zeroThen: [may('อัญเชิญไม่จ่ายคอสต์สปิริตเผ่า [ภูตพเนจร]/[ดีว่า]/[นักวิจัย] จากแทรช 1 ใบ', [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], families: ['ภูตพเนจร', DIVA, RESEARCHER] } }])],
        },
      ],
    },
    { kind: 'uTriggerCostBoost', levels: [2], if: oppAttackStep, filter: { types: ['spirit', 'ultimate'], families: [GANDHARVA, DIVA] }, amount: 1 },
  ],
  'คุณหนูนางฟ้า อาซาเอล': [
    { kind: 'lowBpLifeShield', levels: ALL3, if: oppAttackStep, maxBp: 5000 },
    { kind: 'costBoost', levels: L23, if: { ownAttackStep: true }, filter: { types: ['ultimate'], family: GANDHARVA }, amount: 2 },
  ],
  'อัศวินศักดิ์สิทธิ์ เพนต้น': [
    {
      kind: 'trigger',
      on: ['milledByOpponent', 'uTriggeredByOpponent'],
      zone: 'trash',
      levels: [],
      steps: [may('อัญเชิญเพนต้นจากแทรชโดยไม่จ่ายคอสต์', [{ do: 'summonThisFree' }]), { do: 'noMillThisTurn' }],
    },
    { kind: 'noMill', levels: ALL3, ownOnly: true },
    { kind: 'staticBp', levels: L23, if: { all: [{ attackStep: true }, ownUltimate] }, scope: { self: true }, amount: 10000 },
  ],
  'อัลติเมท ซาราตี': [
    uTrigger(U345, [{ do: 'onBattleHitLife', steps: [{ do: 'gainLifeFromVoid', count: 1 }] }]),
    { kind: 'trigger', on: 'attack', levels: [5], steps: [{ do: 'atBattleEnd', steps: [{ do: 'returnBattleMagic' }] }] },
  ],
  'อัลติเมท คู-ซี': [uTrigger([4], [{ do: 'battleUnblockableLowerLevel' }])],
  ออร์แกนปีกทองคำ: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'deckToUnder', max: 3 }] },
    { kind: 'uTriggerUnderBoost', levels: [2], if: oppAttackStep, amount: 2 },
  ],
  พาวเวอร์ดาวน์: [
    { kind: 'trigger', on: ['milledByOpponent', 'uTriggeredByOpponent'], zone: 'trash', levels: [], steps: [{ do: 'selfFromTrashToHand' }, { do: 'noMillThisTurn' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'debuffChosenOpponent', amount: 3000, filter: { types: SPIRIT } }, draw()] },
  ],
  โกลเด้นเคาน์เตอร์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'debuffChosenOpponent', amount: 10000, filter: { types: SPIRITISH }, zeroThen: [{ do: 'symbolsZeroChosen', filter: {}, chosen: true }] }],
    },
  ],
  'อัลติเมท อิสฟีล': [
    uTrigger(U345, [
      { do: 'useMagicFromHandFree' },
      when({ uTriggerCard: { types: ['magic'] } }, [{ do: 'useMagicFromHandFree' }]),
    ]),
    {
      kind: 'trigger',
      on: 'allyBlocked',
      subject: { types: ['ultimate'], family: GANDHARVA },
      blocker: { types: SPIRIT, maxBp: 3000 },
      levels: U45,
      ownTurnOnly: true,
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
  ],
  // ---------------------------------------------------------------- ฟ้า (BS25)
  'เมคานิค คอร์กี้': [spiritSoul(ALL2, 'blue'), { kind: 'familyAlso', levels: [2], family: SYNTH }],
  'เก็คโค โกเล็ม': [{ kind: 'extraSymbol', levels: ALL2, if: { ownMainStep: true }, color: 'white', count: 2 }],
  'โจรสลัดฝึกหัด เทอร์รี่': [summonBolt(ALL3, 3, 4), { kind: 'trigger', on: 'destroyed', levels: ALL3, steps: [draw(), { do: 'discard', count: 1 }] }],
  เซอร์ไวเวอร์บาดี: [survivor(ALL3), summonBolt(ALL3, 5, 6)],
  'นักดาบยักษ์ อาร์ชิบอลด์': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [may('จั่วการ์ด 2 ใบ แล้วทิ้งการ์ดในมือ 2 ใบ', [draw(2), { do: 'discard', count: 2 }], { deckAtLeast: 1 })] },
    // แทนการถูกทำลาย (รวมที่ทำลายตัวเองด้วย Summon Bolt): ทำลายอาร์ชิบอลด์ สปิริตนั้นอยู่ต่อแบบเสื่อมสภาพ
    { kind: 'replaceDestroy', levels: [2], subject: { card: { types: SPIRIT, textIncludes: [SUMMON_BOLT] } }, battle: true, ownToo: true, destroySource: true, state: 'exhausted' },
  ],
  'นกศึก พาราคีต': [{ kind: 'staticBp', levels: ALL2, if: { attackStep: true }, scope: { own: { types: SPIRIT, family: WARRIOR, inBattle: true } }, amount: 2000 }],
  'นักปืนยักษ์ คลิฟฟอร์ด': [
    summonBolt(ALL3, 7, 8),
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        may(
          'ทำลายสปิริตคอสต์ไม่เกิน 3 ของคู่แข่ง 1 ตัว: นำคอร์จากวอยด์ 1 เม็ดมาวางบนสปิริตนี้',
          [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 3 } }, { do: 'voidCore', to: 'self', count: 1 }],
          { opponentHas: { types: SPIRIT, maxCost: 3 } },
        ),
      ],
    },
  ],
  'อาดามันต์ โกเล็ม': [
    { kind: 'maxLevelAllies', levels: ALL3, filter: { types: SPIRITISH, textIncludes: ['Crush'] }, ownAttackStepOnly: true },
    {
      kind: 'trigger',
      on: 'allyUTriggerHit',
      subject: { card: { types: ['ultimate'], nameIncludes: ['ออริฮาลคอน โกเล็ม'] } },
      levels: L23,
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'returnFromTrash', filter: { types: ['spirit', 'ultimate'], family: SYNTH } }],
    },
  ],
  'เทพยักษ์ จูเนียส': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [when({ summonedBySummonBolt: true }, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT } }], [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 } }])],
    },
    { kind: 'staticBp', levels: ALL3, if: { attackStep: true }, scope: { own: { types: SPIRIT, family: WARRIOR } }, amount: 5000 },
  ],
  'อัลติเมท การาดรูก': [
    { kind: 'trigger', on: 'summon', levels: U345, steps: [{ do: 'summonFreeHandOrTrash', filter: { types: ['nexus'] }, max: 1 }] },
    uTrigger(U345, [{ do: 'mill', count: 5 }]),
  ],
  'อัลติเมท เลเวน': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      zone: 'hand',
      subject: { bySummonBolt: true },
      levels: [],
      steps: [may('อัญเชิญอัลติเมท เลเวนจากมือโดยไม่จ่ายคอสต์', [{ do: 'summonThisFree' }])],
    },
    { kind: 'trigger', on: 'summon', levels: U345, steps: [1, 2, 3, 4].map(destroyCostExact) },
    { kind: 'trigger', on: 'summon', levels: U345, steps: [{ do: 'uTrigger', then: [5, 6, 7].map(destroyCostExact) }] },
  ],
  ธงโจรสลัดมังกรสามหัว: [
    { kind: 'summonBoltOnBattleLoss', levels: ALL2, if: { attackStep: true } },
    {
      kind: 'trigger',
      on: 'allyBlocked',
      subject: { card: { textIncludes: [SUMMON_BOLT] } },
      levels: [2],
      ownTurnOnly: true,
      steps: [may('จั่วการ์ด 1 ใบ แล้วทิ้งการ์ดในมือ 1 ใบ', [draw(), { do: 'discard', count: 1 }], { deckAtLeast: 1 })],
    },
  ],
  เหมืองแร่หายาก: [
    { kind: 'staticBp', levels: ALL2, if: { ownAttackStep: true }, scope: { own: { types: SPIRITISH, textIncludes: ['Crush'], inBattle: true } }, amount: 2000 },
    { kind: 'trigger', on: 'oppLifeLost', levels: [2], attackStepOnly: true, steps: [{ do: 'mill', count: 3 }] },
  ],
  ซัพพอร์ตแฟล็ก: [
    {
      kind: 'trigger',
      on: 'allySummoned',
      zone: 'trash',
      subject: { bySummonBolt: true },
      levels: [],
      steps: [may('ส่งคอร์บนฟิลด์ของเรา 1 เม็ดไปแทรช: นำซัพพอร์ตแฟล็กกลับขึ้นมือ', [{ do: 'fieldCoreToTrash' }, { do: 'selfFromTrashToHand' }])],
    },
    { kind: 'magic', timing: 'main', steps: [{ do: 'returnFromTrash', filter: { types: ['spirit'], textIncludes: [SUMMON_BOLT] } }, { do: 'discard', count: 1 }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000 }] },
  ],
  แรนดอมบอมบ์: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'peekOneHandDestroy', filter: { types: SPIRITISH } }] }],
  'เทพยักษ์จ้าวสมุทร ดูแรน-คิด': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'returnAllFromTrash', filter: { types: ['spirit'], textIncludes: [SUMMON_BOLT] } }] },
    { kind: 'trigger', on: 'allySummoned', subject: { bySummonBolt: true }, levels: L23, attackStepOnly: true, steps: [{ do: 'refreshSelf' }] },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], textIncludes: [SUMMON_BOLT] } }] },
  ],
  'อัลติเมท ออริฮาลคอน โกเล็ม': [
    [
      // ตัวออริฮาลคอน โกเล็มเองไม่ได้รับ Crush (เจ้าของโปรเจกต์กำหนด) = excludeSelf / subject.other
      { kind: 'grantText', levels: U345, if: { ownAttackStep: true }, filter: { types: SPIRITISH, family: SYNTH }, text: 'Crush', excludeSelf: true },
      // Crush ที่ได้รับ: เมื่อโจมตี ทิ้งใบบนสุดเด็คคู่แข่ง = Lv ของตัวที่โจมตี
      { kind: 'trigger', on: 'allyAttack', subject: { card: { types: SPIRITISH, family: SYNTH }, other: true }, levels: U345, ownTurnOnly: true, steps: [{ do: 'mill', count: 'subjectLevel' }] },
    ],
    uTrigger(U45, [when({ uTriggerCard: { minCost: 5 } }, [{ do: 'bigMillLifeThisTurn', min: 6 }]), { do: 'mill', count: 6 }]),
  ],
};
