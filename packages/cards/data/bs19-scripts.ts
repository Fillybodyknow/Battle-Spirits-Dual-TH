/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 19 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS26 สีเขียว / เหลือง / ฟ้า)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger / Trigger Counter: ดูคำอธิบายใน bs18-scripts.ts
 * Trigger Counter ที่ "ถ้าการ์ดที่ฮิต…ถือว่า Guard" = step guardUTriggerIf (ผลฮิตที่รออยู่ไม่ทำงาน)
 * บรรทัด [ร่วมร่าง] ของสปิริต = ใส่ if: { selfBraved: true } เอง
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const STAR_SOUL = 'วิญญาณดวงดาว';
const STAR_GENERAL = 'ขุนพลดวงดาว';
const GALAXY = 'ดาราจักร';
const INSECT_MAN = 'มนุษย์แมลง';
const BLADE_INSECT = 'แมลงดาบ';
const SWORD_BEAST = 'ศาสตราสมิง';
const DIVA = 'ดีว่า';
const MUSIC = 'เผ่าดนตรี';
const HAS_TC_MAGIC: CardFilter = { types: ['magic'], textIncludes: ['Trigger Counter'] };
const WARRIOR = 'วิญญาณนักรบ';
const BEAST_HEAD = 'สมิงหัว';
const HAS_SB: CardFilter = { textIncludes: ['Summon Bolt'] };
/** การ์ดสปิริตในมือเผ่าเดียวกับสปิริตนี้ คอสต์เป็นค่าในนี้ */
const boltFilter = (costs: number[]): CardFilter => ({ types: ['spirit'], costIn: costs, sameFamilyAs: 'self' });
const boltSummon = (costs: number[]): Step => ({ do: 'summonFromHandFree', filter: boltFilter(costs), summonBolt: true });
/**
 * Summon Bolt: คอสต์ a/b "เมื่อสปิริตนี้โจมตี/ป้องกัน": เมื่อจบการต่อสู้ ทำลายสปิริตนี้ เพื่ออัญเชิญสปิริตเผ่าเดียวกันคอสต์ a หรือ b จากมือไม่จ่ายคอสต์
 * (แบบ BS17 summonBolt แต่คอสต์เป็นสองค่า ไม่ใช่ช่วง) · summons = step อัญเชิญ (เชสเตอร์ Lv2: คอสต์ละ 1 ใบ)
 */
const summonBolt = (levels: number[], costs: number[], summons: Step[] = [boltSummon(costs)]) => ({
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
            {
              label: `Summon Bolt: ทำลายสปิริตนี้ เพื่ออัญเชิญสปิริตคอสต์ ${costs.join('/')} เผ่าเดียวกันจากมือไม่จ่ายคอสต์`,
              if: { all: [{ selfCoresAtLeast: 1 }, { handHas: boltFilter(costs) }] } as Condition,
              steps: [{ do: 'destroySelf' } as Step, ...summons],
            },
            {
              label: `Summon Bolt: อัญเชิญสปิริตคอสต์ ${costs.join('/')} เผ่าเดียวกันจากมือไม่จ่ายคอสต์`,
              if: { all: [{ summonBoltAfterBattleLoss: true }, { handHas: boltFilter(costs) }] } as Condition,
              steps: summons,
            },
            NO,
          ],
        },
      ],
    },
  ],
});
/** Assault: N "เมื่อสปิริตนี้โจมตี": เทิร์นละไม่เกิน N ครั้ง เสื่อมสภาพเน็กซัสเรา 1 ใบ เพื่อฟื้นสภาพ (แบบ BS12) */
const assault = (levels: number[], n: number) => ({
  kind: 'trigger' as const,
  on: 'attack' as const,
  levels,
  steps: [
    may(
      `[Assault: ${n}] เสื่อมสภาพเน็กซัสเรา 1 ใบ: ฟื้นสภาพสปิริตนี้`,
      [{ do: 'markOnce', key: 'assault' }, { do: 'exhaustOwn', filter: { types: ['nexus'], state: 'refresh' } }, { do: 'refreshSelf' }],
      { all: [{ usedFewerThan: { key: 'assault', max: n } }, { selfExhausted: true }, { allyHas: { types: ['nexus'], state: 'refresh' } }] },
    ),
  ],
});
const draw = (count = 1): Step => ({ do: 'draw', count });
const braved: Condition = { selfBraved: true };
const ownAttackStep: Condition = { ownAttackStep: true };
const oppAttackStep: Condition = { all: [{ attackStep: true }, { oppTurn: true }] };
const QUICK = { kind: 'quick' as const };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
const bravedAttack = (levels: number[], steps: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, if: braved, steps });
const braveFromHand = (family: string): Step => ({ do: 'summonFromHandFree', filter: { types: ['brave'], family } });
/** อัญเชิญเบรฟ [ดาราจักร]/[วิญญาณดวงดาว] จากมือ (ขุนพลดวงดาว): ดาราจักรสำเร็จ = galaxyThen */
const starGeneralSummon = (galaxyLabel: string, galaxyThen: Step[]): Step => ({
  do: 'chooseOne',
  options: [
    { label: `อัญเชิญเบรฟเผ่า [${GALAXY}] จากมือ: ${galaxyLabel}`, if: { handHas: { types: ['brave'], family: GALAXY } }, steps: [{ ...braveFromHand(GALAXY), then: galaxyThen } as Step] },
    { label: `อัญเชิญเบรฟเผ่า [${STAR_SOUL}] จากมือ`, if: { handHas: { types: ['brave'], family: STAR_SOUL } }, steps: [braveFromHand(STAR_SOUL)] },
    NO,
  ],
});
/** อัลติเมท "รุ่นใหม่" BS26: ไม่สนเงื่อนไขอัญเชิญของอัลติเมทคอสต์ไม่เกิน 7 + เจ็มอัลติเมทเป็นสีนี้ด้วย */
const nextGen = (levels: number[], color: 'green' | 'yellow' | 'blue') => [
  { kind: 'ignoreSummonCondition' as const, levels, filter: { types: ['ultimate' as const], maxCost: 7 }, always: true as const },
  { kind: 'ultimateSymbolsAlso' as const, levels, colors: [color] },
];

export const BS19_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- เขียว (BS26)
  สึรุกิมุคาเดะ: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL2,
      steps: [{ do: 'battleNoBurst' }, when({ rush: { color: 'white', count: 1 } }, [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxCost: 3 } }])],
    },
  ],
  'นักรบเปลือก เท็นโด': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    { kind: 'coreRemovalImmune', levels: L23, filter: { types: SPIRIT, family: INSECT_MAN } },
  ],
  โปรคิวัน: [
    QUICK,
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        when({ all: [{ attackStep: true }, { battleOpponentUltimate: true }] }, [
          { do: 'buffChosen', amount: 6000, ally: true, filter: { types: SPIRIT, inBattle: true }, untilBattleEnd: true },
        ]),
      ],
    },
  ],
  'ซิลบาร์ ยันมะ': [
    QUICK,
    {
      kind: 'replaceDestroy',
      levels: ALL2,
      subject: { card: { types: SPIRIT, families: [INSECT_MAN, BLADE_INSECT] } },
      toHand: true,
      then: [{ do: 'voidCore', to: 'reserve', count: 1 }],
    },
  ],
  'หมาป่าลมเหนือ บอเรียสวูล์ฟ': [
    { kind: 'trigger', on: 'ownAttackStepStart', levels: ALL2, steps: [may('ดูการ์ดใบบนสุดเด็คของคู่แข่ง', [{ do: 'peekOpponentDeckTop' }])] },
    { kind: 'bounceImmuneAllies', levels: ALL2, filter: { types: SPIRIT, family: SWORD_BEAST } },
  ],
  'ขุนพลเปลือกดาบ เรกิออส': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [starGeneralSummon('เสื่อมสภาพสปิริตคู่แข่งไม่เกิน 2 ตัว', [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT } }])],
    },
    { kind: 'trigger', on: ['attack', 'block'], levels: L23, if: braved, steps: [{ do: 'refreshOnBattleWin', ultimatesOnly: true }] },
  ],
  'สมิงดาบล่า คาร่าฮาวด์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'voidCore', to: 'self', count: 1, per: { allies: { types: SPIRIT, family: STAR_SOUL } } }] },
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }] },
    { kind: 'trigger', on: ['allyAttack', 'allyBlock'], subject: { card: { hasBraves: true } }, levels: L23, if: braved, steps: [{ do: 'battleNoBurst' }] },
  ],
  'หงส์มรกต นิกซ์': [nextGen([3, 4], 'green'), uTrigger([4], [{ do: 'voidCore', to: 'reserve', count: 2 }])],
  'เกราะดาวพสุธา ฟ็อกซ์สตาร์': [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: ['ultimate'] } }, { do: 'guardUTriggerIf', filter: { types: ['spirit'] } }] },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT, maxCost: 3 } }] },
  ],
  'เกราะดาวนภา อีเกรต': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT }, lockUntilAttack: true }] },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'exhaustUltimateBattle' }] },
  ],
  ทุ่งหญ้าใหญ่อัลบา: [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { card: { types: SPIRIT, color: 'green' } },
      levels: ALL2,
      oppTurnOnly: true,
      attackStepOnly: true,
      steps: [may('เปิดการ์ดใบบนสุดเด็คของเรา (สปิริต/เบรฟคอสต์ต่ำกว่า = อัญเชิญได้)', [{ do: 'revealTopSummonBelowSubject' }], { deckAtLeast: 1 })],
    },
    { kind: 'bounceImmuneAllies', levels: [2], filter: { types: SPIRIT, family: INSECT_MAN } },
  ],
  ไฮเพรสเชอร์: [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'lockRefreshOpponent', filter: { types: ['ultimate'], inBattle: true } }, { do: 'guardUTriggerIf', filter: { types: ['spirit'] } }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT, maxCost: 5 } }] },
  ],
  อัลติเมทวินด์: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'turnTrigger', on: 'allyUltExhausted', steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }] }] },
  ],
  'นักพรตเปลือก ชิโรคาบุโตะ': [
    { kind: 'unblockableByExhausted', levels: ALL3, if: ownAttackStep, filter: { types: SPIRIT, families: [INSECT_MAN, STAR_GENERAL] } },
    { kind: 'opponentCostBoost', levels: ALL3, if: oppAttackStep, filter: { types: ['ultimate'] }, amount: -2 },
    bravedAttack(L23, [
      may(
        'เสื่อมสภาพสปิริตของคู่แข่ง 2 ตัว: สปิริตร่วมร่างของเรา 1 ตัวฟื้นสภาพ',
        [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRIT } }, { do: 'refreshChosenAlly', filter: { types: SPIRIT, hasBraves: true } }],
        { opponentHas: { types: SPIRIT, state: 'refresh' } },
      ),
    ]),
  ],
  'อัลติเมท รากนาร็อค': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [3, 4, 5],
      steps: [
        { do: 'exhaustAllOpponent', filter: { types: SPIRIT } },
        { do: 'summonFromHandFree', filter: { types: ['spirit', 'ultimate'], anyOf: [{ color: 'green' }, { color: 'white' }] } },
      ],
    },
    uTrigger([4, 5], [{ do: 'bounceOpponent', filter: { types: SPIRIT }, to: 'deckBottom' }, { do: 'battleUnblockable', by: 'spirits' }]),
  ],
  'เกราะดาวปูยักษ์ เบรฟแคนเซอร์': [{ kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'pairBlock' }] }],
  // ---------------------------------------------------------------- เหลือง (BS26)
  พริมมัปโปะ: [
    { kind: 'trigger', on: 'destroyedByOpponent', levels: ALL2, steps: [when({ alliesMatchAtLeast: { filter: { types: SPIRIT, family: DIVA }, count: 1 } }, [draw(2)])] },
  ],
  ราดอน: [
    {
      kind: 'trigger',
      on: 'leftByOpponentEffect',
      levels: ALL2,
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], family: STAR_GENERAL } }],
    },
  ],
  'เจ้าหญิงภูต พาร์ฟูม': [
    {
      kind: 'trigger',
      on: 'oppAttackStepStart',
      levels: ALL3,
      steps: [{ do: 'returnFromTrash', filter: { ...HAS_TC_MAGIC, anyOf: [{ color: 'purple' }, { color: 'white' }, { color: 'yellow' }] } }],
    },
    { kind: 'alliesUnblockableBy', levels: [3], if: { all: [braved, ownAttackStep] }, filter: { types: SPIRIT, hasBraves: true, braveFamily: GALAXY }, by: 'spirits' },
  ],
  'นางฟ้า นาสุเอล': [
    {
      kind: 'trigger',
      on: 'uTriggerGuarded',
      subject: { card: { types: ['ultimate'], minCost: 6 } },
      levels: ALL2,
      steps: [draw(), { do: 'allyCoreToLife', filter: {} }],
    },
  ],
  '[คุณหนูนักร้อง] กรีเฟีย ดาร์ค': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [may('เปิดการ์ด 3 ใบจากบนสุดเด็ค: นำสปิริตเผ่า [ดีว่า] ขึ้นมือ', [{ do: 'revealTakeAll', count: 3, filter: { types: ['spirit'], family: DIVA }, rest: 'top' }], { deckAtLeast: 1 })],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [{ do: 'buffSelf', amount: 1000, untilBattleEnd: true, per: { allies: { types: SPIRIT, family: DIVA }, anySide: true } } as Step],
    },
  ],
  'ขุนพลภูต กลอเรีย': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [starGeneralSummon('นำการ์ดเมจิคในแทรช 2 ใบขึ้นมือ', [{ do: 'returnFromTrash', filter: { types: ['magic'] }, count: 2 }])] },
    bravedAttack(L23, [{ do: 'battleUnblockable', by: 'ultimates' }]),
  ],
  'สัตว์ทะเล เคทอส': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'draw', count: 1, per: { allies: { types: SPIRIT, families: [MUSIC, STAR_SOUL] } } } as Step] },
    {
      kind: 'trigger',
      on: 'blocked',
      levels: L23,
      if: { all: [braved, { battleBlockedBy: { types: ['ultimate'] } }] },
      steps: [may('นำเบรฟของสปิริตนี้ 1 ใบกลับขึ้นมือ: ถือว่าไม่ถูกป้องกัน (ไม่เทียบ BP)', [{ do: 'ownBraveToHand', filter: {}, ofSelf: true, then: [{ do: 'treatAsUnblocked' }] }])],
    },
  ],
  'นักร้องนาเดชิโกะ มาริกะ': [
    {
      kind: 'trigger',
      on: 'destroyedByOpponent',
      levels: ALL2,
      steps: [
        may(
          'เปิดการ์ด 5 ใบจากบนสุดเด็ค: เมจิคขึ้นมือ อัญเชิญอัลติเมท [คนธรรพ์] ได้ 1 ใบ',
          [{ do: 'revealTakeAll', count: 5, filter: { types: ['magic'] }, rest: 'bottom', thenSummon: { types: ['ultimate'], family: 'คนธรรพ์' } }],
          { deckAtLeast: 1 },
        ),
      ],
    },
  ],
  'อาชาสวรรค์ศักดิ์สิทธิ์ สกาย': [nextGen([3, 4, 5], 'yellow'), uTrigger([4, 5], [{ do: 'gainLifeFromVoid', count: 1 }])],
  'เกราะดาวกระต่าย ราบิตต้า': [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'negateChosenThisTurn', filter: { types: ['ultimate'], inBattle: true, maxBp: 15000 }, untilBattleEnd: true }] },
    { kind: 'trigger', on: 'block', granted: true, levels: [], steps: [{ do: 'debuffChosenOpponent', filter: { types: ['ultimate'] }, amount: 3000, untilBattleEnd: true }] },
  ],
  'เกราะดาวกันย์ วาร์โกเบรฟ': [
    {
      kind: 'activated',
      granted: true,
      levels: [],
      timing: 'attackFlash',
      label: 'ส่งคอร์บนสปิริตของเรา 1 เม็ดไปแทรช: สปิริต/อัลติเมทของคู่แข่ง 1 ตัว BP-3000 (ในการต่อสู้นี้)',
      if: { all: [ownAttackStep, { alliesMatchAtLeast: { filter: { types: SPIRIT, minCores: 1 }, count: 1 } }] },
      steps: [{ do: 'ownSpiritCoreToTrash' }, { do: 'debuffChosenOpponent', filter: { types: SPIRITISH }, amount: 3000, untilBattleEnd: true }],
    },
    { kind: 'opponentAttackBan', granted: true, levels: [], if: oppAttackStep, filter: { types: ['ultimate'], costIn: [2, 3, 5, 7] } },
  ],
  เนินโซลูจ: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'returnFromTrash', filter: { types: ['spirit', 'brave'], color: 'yellow' } }] },
    { kind: 'depletionSave', levels: [2], filter: { types: SPIRIT }, lifeCore: true },
  ],
  อิลลูชันมิเรอร์: [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'mirrorUTriggerHit' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'disableChosenOpponent', filter: { types: SPIRITISH } }] },
  ],
  เชนจ์ลิง: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'battleBpSubstitute' }] }],
  'เทพธิดาสัตว์มายา เอคิดนา': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [
        { do: 'gainLifeFromVoid', count: 1 },
        when({ all: [{ lifeAtMost: 3 }, { usedFewerThan: { key: 'echidna', max: 1 } }] }, [{ do: 'markOnce', key: 'echidna' }, { do: 'refreshSelf' }]),
      ],
    },
    { kind: 'triggerCounterMagicFree', levels: ALL3, if: { attackStep: true } },
    { kind: 'replaceDestroy', levels: [3], if: { all: [braved, { attackStep: true }] }, subject: { card: { types: SPIRIT, families: [MUSIC, STAR_GENERAL] } }, state: 'exhausted' },
  ],

  // ---------------------------------------------------------------- ฟ้า (BS26)
  'นายท้ายเรือ ไอแซค': [
    summonBolt(ALL2, [4, 5]),
    { kind: 'trigger', on: 'destroyedByOpponent', levels: [2], steps: [boltSummon([4, 5])] },
  ],
  'ทหารชายแดน นูเบีย': [
    { kind: 'replaceDestroy', levels: ALL2, subject: { self: true }, mill: 5, state: 'same' },
    { kind: 'staticBp', levels: [2], scope: { self: true }, amount: 3000, perAllies: { types: ['ultimate'], family: 'รุ่นใหม่' } },
  ],
  'รองกัปตัน เชสเตอร์': [
    // Lv2 = บรรทัดถัดไป (อัญเชิญคอสต์ 5 และ 6 อย่างละ 1 ตัว)
    summonBolt([1], [5, 6]),
    summonBolt([2], [5, 6], [boltSummon([5]), boltSummon([6])]),
  ],
  'หมาป่าดาบ จิเก็น': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 2 } },
        when({ destroyedByThisMatch: { textIncludes: ['Spirit Soul'] } }, [{ do: 'voidCore', to: 'reserve', count: 1 }]),
      ],
    },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2],
      if: braved,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 0 }, costPlusPer: { per: { allies: { types: SPIRIT, family: BEAST_HEAD } }, amount: 1 } }],
    },
  ],
  'โจรสลัดทะเลดาว เพอร์ซีอุส': [
    summonBolt(ALL2, [6, 8]),
    bravedAttack([2], [
      when({ usedFewerThan: { key: 'perseus', max: 1 } }, [
        { do: 'markOnce', key: 'perseus' },
        { do: 'returnFromTrash', filter: { types: ['spirit'], family: WARRIOR } },
        { do: 'voidCore', to: 'self', count: 2 },
      ]),
    ]),
  ],
  'นักดาบแมว เบอร์แมน': [
    assault(ALL2, 2),
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'buffSelf', amount: 1, untilBattleEnd: true, per: { bpSum: { types: ['ultimate'], state: 'exhausted' } } } as Step] },
  ],
  'ขุนพลโจรสลัด เอ็ดเวิร์ด': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [starGeneralSummon('จั่ว 3 ใบ แล้วทิ้งการ์ดในมือ 2 ใบ', [draw(3), { do: 'discard', count: 2 }])] },
    bravedAttack(L23, [{ do: 'mill', count: 1 }, { do: 'opponentHandColorBanMilled' }]),
  ],
  'จักรพรรดิสมิงน้ำเงิน แพนเซอร์': [
    nextGen([3, 4, 5], 'blue'),
    uTrigger([4, 5], [
      { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 5 } },
      when({ destroyedByThisMatch: { types: SPIRIT } }, [{ do: 'voidCore', to: 'reserve', count: 1 }]),
    ]),
  ],
  'เกราะดาวนาวา เบรฟอาร์โก': [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'destroyChosenOpponent', filter: { types: ['ultimate'], inBattle: true, costIn: [6, 7] } }] },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'atBattleEnd', steps: [{ do: 'summonBoltNoDestroy' }] }] },
  ],
  'เกราะดาวพิจิก เบรฟสกอร์เปียน': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'opponentDestroysOwnLowest', filter: { types: ['ultimate'] } }] },
    { kind: 'trigger', on: 'destroyed', levels: [1], steps: [{ do: 'summonFromTrashFree', filter: { types: ['nexus'], color: 'blue' }, max: 3 }] },
  ],
  ทะเลสายฟ้า: [
    { kind: 'staticBp', levels: ALL2, if: { attackStep: true }, scope: { own: { ...HAS_SB, types: SPIRIT } }, amount: 2000 },
    { kind: 'attackReserveTax', levels: [2], cores: 2, soulBonus: 0, filter: { types: ['ultimate'] } },
  ],
  ธันเดอร์แทคติกส์: [
    {
      kind: 'trigger',
      on: 'endStep',
      zone: 'trash',
      levels: [],
      ownTurnOnly: true,
      oncePerTurnByName: true,
      steps: [{ do: 'selfFromTrashToHand' }],
    },
    {
      kind: 'magic',
      timing: 'flash',
      noDispersion: true,
      steps: [
        { do: 'buffChosen', amount: 2000, ally: true, filter: { types: SPIRIT } },
        { do: 'buffChosen', amount: 3000, ally: true, filter: { ...HAS_SB, types: SPIRIT } },
      ],
    },
  ],
  อิมแพคโรอาร์: [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'destroyBattlingUltByHitCost', plus: 3 }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 } }] },
  ],
  'ราชาสมิงรุ่นใหม่ ไลโอดราส': [
    uTrigger([3, 4, 5], [
      { do: 'destroyHighestCostOpponent', filter: { types: SPIRIT } },
      when({ destroyedByThisMatch: { types: SPIRIT, minCost: 8 } }, [{ do: 'opponentLifeToReserve', count: 1 }]),
    ]),
    { kind: 'trigger', on: 'allyUTriggerHit', subject: { types: ['ultimate'], family: 'รุ่นใหม่' }, levels: [4, 5], attackStepOnly: true, steps: [{ do: 'battleNoHandFlash' }] },
  ],

};

void ALL3;
void draw;
