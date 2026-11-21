/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 12 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import type { CardType } from '../src/schema';
import type { Color } from '../src/schema';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const NEXUS: CardFilter = { types: ['nexus'] };
/** Charge "ที่ไม่ใช่ของอัลติเมทของเรา" */
const NOT_ULTIMATE: CardType[] = ['spirit', 'brave', 'magic', 'nexus'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const catalyzed: Condition = { catalyzed: true };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
/** ถ้าเงื่อนไขจริง ทำ steps */
const when = (cond: Condition, steps: Step[], otherwise?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(otherwise ? { else: otherwise } : {}) });

/** [Catalyze] เมื่อสปิริตนี้โจมตี: สามารถส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อสั่งใช้ Soul Burst สีที่ระบุ (ไม่ระบุสี = ทุกสี) */
const catalyze = (levels: number[], colors: Color[] | null, label: string, extra: Partial<Extract<Step, { do: 'catalyze' }>> = {}): ScriptAbility => ({
  kind: 'trigger',
  on: 'attack',
  levels,
  steps: [
    {
      do: 'chooseOne',
      if: colors ? { any: colors.map((c) => ({ catalyzable: c })) } : { catalyzable: 'any' },
      options: [
        { label: `ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst${label}`, steps: [{ do: 'soulToTrash' }, { do: 'catalyze', ...(colors ? { colors } : {}), ...extra }] },
        NO,
      ],
    },
  ],
});

/**
 * Assault: N "เมื่อสปิริตนี้โจมตี": ตอนประกาศโจมตี สปิริตนี้ (เทิร์นละไม่เกิน N ครั้ง) สามารถเสื่อมสภาพเน็กซัสเรา 1 ใบ เพื่อฟื้นสภาพ
 * (ไม่ใช่ Flash ที่กดใช้เอง: เจ้าของโปรเจกต์กำหนด) · กันดาละ-ไฮดรา Lv2/3: นำเน็กซัสในแทรชกลับขึ้นมือแทนการเสื่อมสภาพเน็กซัสได้
 */
const ALT: Condition = { all: [{ assaultAlt: true }, { trashHas: NEXUS }] };
const READY_NEXUS: Condition = { allyHas: { types: ['nexus'], state: 'refresh' } };
const assault = (levels: number[], n: number, granted = false): ScriptAbility => ({
  kind: 'trigger',
  on: 'attack',
  levels,
  ...(granted ? { granted: true as const } : {}),
  steps: [
    {
      do: 'chooseOne',
      if: { all: [{ usedFewerThan: { key: 'assault', max: n } }, { selfExhausted: true }, { any: [READY_NEXUS, ALT] }] },
      options: [
        {
          label: `[Assault: ${n}] เสื่อมสภาพเน็กซัสเรา 1 ใบ: ฟื้นสภาพสปิริตนี้`,
          if: READY_NEXUS,
          steps: [{ do: 'markOnce', key: 'assault' }, { do: 'exhaustOwn', filter: { types: ['nexus'], state: 'refresh' } }, { do: 'refreshSelf' }],
        },
        {
          label: `[Assault: ${n}] นำเน็กซัสในแทรชกลับขึ้นมือ (กันดาละ-ไฮดรา): ฟื้นสภาพสปิริตนี้`,
          if: ALT,
          steps: [{ do: 'markOnce', key: 'assault' }, { do: 'returnFromTrash', filter: NEXUS }, { do: 'refreshSelf' }],
        },
        NO,
      ],
    },
  ],
});

export const BS12_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Brave
  'ดาบมังกรเกราะ โกวเท็น': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentSummonEffect',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'ทำลายสปิริต BP ไม่เกิน 5000 ของคู่แข่ง 1 ตัว', if: { opponentHas: { types: SPIRIT, maxBp: 5000 } }, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } }] },
            { label: 'ทำลายเน็กซัสของคู่แข่ง 1 ใบ', if: { opponentHas: NEXUS }, steps: [{ do: 'destroyChosenOpponent', filter: NEXUS }] },
          ],
        },
        { do: 'summonThisFree' },
      ],
    },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 6000 } }] },
  ],
  'ดาบมังกรเพลิง โอนิมารุ': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'buffChosen', amount: 10000, ally: true }, { do: 'summonThisFree' }] },
    // เมื่อจบการต่อสู้ เทิร์นละ 1 ครั้ง: "สามารถ X เพื่อ Y" ต้องมีโซลคอร์ในแทรช สปิริตสีแดง และสปิริตเผ่า [ผู้เป็นนาย] ที่เสื่อมสภาพอยู่
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        {
          do: 'atBattleEnd',
          steps: [
            may(
              'นำ Soul Core ในแทรชวางที่สปิริตสีแดง: ฟื้นสภาพสปิริตเผ่า [ผู้เป็นนาย] 1 ตัว',
              [{ do: 'markOnce', key: 'โอนิมารุ' }, { do: 'trashSoulToAlly', filter: { color: 'red' } }, { do: 'refreshChosenAlly', filter: { types: SPIRIT, family: 'ผู้เป็นนาย', state: 'exhausted' } }],
              { all: [{ onceFree: 'โอนิมารุ' }, { soulInTrash: true }, { allyHas: { types: SPIRIT, color: 'red' } }, { allyHas: { types: SPIRIT, family: 'ผู้เป็นนาย', state: 'exhausted' } }] },
            ),
          ],
        },
      ],
    },
  ],
  โกเล็มพิทักษ์ธรรม: [
    {
      kind: 'activated',
      levels: [],
      timing: 'attackFlash',
      granted: true,
      label: 'เสื่อมสภาพเน็กซัสเรา 1 ใบ: ฟื้นสภาพสปิริตนี้',
      if: { all: [{ oppTurn: true }, { selfExhausted: true }, READY_NEXUS] },
      steps: [{ do: 'exhaustOwn', filter: { types: ['nexus'], state: 'refresh' } }, { do: 'refreshSelf' }],
    },
  ],
  'ดาบยักษ์ทะเลคราม เมลสตอร์ม': [
    { kind: 'millBoost', levels: [1], amount: 1 },
    { kind: 'millBoost', levels: [], amount: 1, granted: true },
    assault([], 1, true),
  ],
  'ดาบยักษ์แห่งหุบเหว อาบิส-อโพคาลิพส์': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'maxLevelThisTurn', target: 'allies' }] },
    { kind: 'burstMagicBan', levels: [], mode: 'gemColor', granted: true },
  ],
  'ดาบแห่งการพิพากษาที่แท้จริง ทรูธ-อีเด็น': [
    { kind: 'minSummonPay', min: 1 },
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [
        {
          do: 'summonFromHandFree',
          filter: { anyOf: [{ types: ['spirit'], family: 'จอมดาบ' }, { types: ['brave'], family: 'ดาบกระบี่' }] },
          max: 40,
          noTriggers: true,
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        may('ทิ้งเบิร์สคู่แข่ง: ทำลายสปิริตคู่แข่ง 1 ตัว', [{ do: 'discardOpponentBurst' }, { do: 'destroyChosenOpponent', filter: { types: SPIRIT } }], {
          all: [{ opponentHasBurst: true }, { opponentHas: { types: SPIRIT } }],
        }),
      ],
    },
  ],
  'ดาบศักดิ์สิทธิ์แห่งแสง ไชนิ่ง-ซอร์ด': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [{ do: 'destroyAllOpponent', filter: { types: SPIRIT, maxBp: 3000 } }, { do: 'draw', count: 1, per: { destroyedByThis: true } }],
    },
    { kind: 'bpDestroyBoost', levels: [1], amount: 1000, fromTypes: NOT_ULTIMATE },
    { kind: 'bpDestroyBoost', levels: [], amount: 1000, fromTypes: NOT_ULTIMATE, granted: true },
  ],
  'ดาบมารแห่งความมืด ดาร์ก-เบลด': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [{ do: 'destroyChosenOpponent', filter: NEXUS }, { do: 'ifDestroyed', filter: { types: ['nexus'], opponent: true }, steps: [{ do: 'draw', count: 1 }] }],
    },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'chooseBlockers', direct: true }] },
  ],
  ราชาราชสีห์: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 7000 } },
        when(catalyzed, [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 15000 } }]),
        { do: 'summonThisFree' },
      ],
    },
  ],
  โอคุริดาระ: [
    { kind: 'trigger', on: 'allySummoned', zone: 'trash', levels: [], subject: { types: ['ultimate'], cost: 8 }, steps: [{ do: 'selfFromTrashToHand' }] },
    { kind: 'braveCostAs', levels: [], cost: 2, granted: true },
  ],
  'ดาบเจ้าวารี จูซุมารุ': [
    { kind: 'burst', soul: true, on: 'afterOpponentHandIncreased', steps: [{ do: 'peekHandDiscard', count: 1, filter: { types: ['magic'] } }, { do: 'summonThisFree' }] },
    { kind: 'maxLevelIf', levels: [], if: { ownAttackStep: true }, granted: true },
  ],

  // ---------------------------------------------------------------- Magic
  ท่าฟันดาบสะบั้นเพลิงสวรรค์: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentAttack',
      steps: [{ do: 'draw', count: 1 }, when(catalyzed, [{ do: 'symbolAlliesThisTurn', filter: {}, color: 'red', count: 1 }]), { do: 'payToUseFlash' }],
    },
    {
      kind: 'magic',
      timing: 'flash',
      noDispersion: true,
      steps: [{ do: 'destroyChosenOpponent', filter: NEXUS }, when(paidSoul, [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, minSymbols: 2 } }])],
    },
  ],
  การคำรามแห่งเปลวเพลิง: [
    {
      kind: 'magic',
      timing: 'flash',
      noDispersion: true,
      steps: [{ do: 'destroyAllOpponent', filter: { types: SPIRIT, maxBp: 3000 } }, when(paidSoul, [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 10000 } }])],
    },
  ],
  พันหัตถ์คันนนจู่โจม: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      steps: [{ do: 'destroyAllOpponentBraves' }, { do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxCost: 6 } }, { do: 'payToUseFlash' }],
    },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, family: 'วิญญาณนักรบ' } }, { do: 'maxLevelThisTurn', target: 'chosen' }],
    },
  ],
  ครัชแอนด์บิลด์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'opponentTotalBp', maxTotal: 5, action: 'destroy', metric: 'cost', filter: { types: SPIRIT } },
        { do: 'summonFreeHandOrTrash', filter: NEXUS, max: 1, zones: ['trash'], per: { destroyedByThis: true } },
      ],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  'No.6 เมาท์เทนเชพ': [
    { kind: 'extraSymbol', levels: ALL2, if: { ownBurstSet: true }, color: 'red', count: 1 },
    {
      kind: 'activated',
      levels: [2],
      timing: 'attackFlash',
      label: 'นำ Soul Core บนเน็กซัสนี้วางที่สปิริตเรา: ทำลายสปิริตคู่แข่งที่ BP ไม่เกินสปิริตนั้น',
      if: { all: [{ oppTurn: true }, soulOnSelf, { alliesAtLeast: 1 }, { opponentHas: { types: SPIRIT } }] },
      steps: [{ do: 'soulToAlly', then: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT }, bpFrom: 'chosen' }] }],
    },
  ],
  เจย์ดีห้าชั้นแห่งบัวบาน: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentSummonEffect',
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 } },
        when(catalyzed, [{ do: 'voidCore', to: 'ally', count: 2, filter: { color: 'blue' } }]),
        { do: 'summonThisFree' },
      ],
    },
    {
      kind: 'activated',
      levels: [1],
      timing: 'attackFlash',
      label: 'ทิ้งการ์ดสีฟ้าในมือ 1 ใบ: จั่ว 2 ใบ แล้วทิ้ง 1 ใบ',
      maxPerTurn: 1,
      if: { all: [{ oppTurn: true }, { handHas: { color: 'blue' } }] },
      steps: [{ do: 'discard', count: 1, filter: { color: 'blue' } }, { do: 'draw', count: 2 }, { do: 'discard', count: 1 }],
    },
  ],
  'No.26 แคพิทัลแคพิทัล': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'summonThisFree' }] },
    { kind: 'attackReserveTax', levels: [1], cores: 1, soulBonus: 1 },
  ],

  // ---------------------------------------------------------------- Spirit
  'จอมราชันเซ็นโงคุ กิวมอนจิ': [
    { kind: 'burst', soul: true, on: 'afterOpponentSummonEffect', steps: [{ do: 'opponentTotalBp', maxTotal: 20000, action: 'destroy', filter: { types: SPIRIT } }, { do: 'summonThisFree' }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 15000 } },
        when(soulOnSelf, [{ do: 'ifDestroyed', filter: { opponent: true }, steps: [{ do: 'opponentLifeToReserve', count: 1 }] }]),
      ],
    },
  ],
  นัมบังมุฉะฮาคุไร: [
    { kind: 'bounceImmuneAllies', levels: ALL3, filter: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] } },
    { kind: 'trigger', on: 'ownAttackStepStart', levels: L23, steps: [when({ all: [soulOnSelf, { ownBurstSet: true }] }, [{ do: 'draw', count: 1 }])] },
  ],
  ซีโนะบาซุคุ: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 3000 } }, { do: 'ifDestroyed', filter: { opponent: true }, steps: [{ do: 'draw', count: 1 }] }],
    },
    { kind: 'staticBp', levels: ALL2, if: soulOnSelf, scope: { ownFamily: 'เจ้าสมิง' }, amount: 4000 },
  ],
  'บุตรแห่งพยัคฆ์ ไทกะ': [{ kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'draw', count: 1 }] }, catalyze(L23, ['red'], 'สีแดง')],
  'มังกรยุทธ์ดาบ มุรามาสะ-ดราก้อน': [
    catalyze(ALL3, null, '', { then: [{ do: 'setBurstFromHand' }] }),
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'chooseBlockers', direct: true }] },
  ],
  'ราชันดอกบัว เซ็นจู': [
    catalyze(ALL3, null, '', { then: [{ do: 'opponentTotalBp', maxTotal: 10, action: 'destroy', metric: 'cost', filter: { types: SPIRITISH } }] }),
    { kind: 'extraSymbol', levels: L23, if: { ownAttackStep: true }, color: 'blue', count: 1, perAllies: NEXUS },
  ],
  'ซันซกคุ-แบร์': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } }, when(paidSoul, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } }])],
    },
  ],
  'มุฉะริว รินโดว': [
    { kind: 'burst', soul: true, on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } }, { do: 'summonThisFree' }] },
    { kind: 'bpDestroyBoost', levels: L23, if: soulOnSelf, amount: 5000 },
  ],
  'มังกรยุทธ์จอมประจัญบาน โชวเก็น': [catalyze(ALL2, null, ''), { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 10000 } }] }],
  'ขุนพลสมิงเพลิงโลกันตร์ กุเร็นเบรอส': [
    { kind: 'evolution', levels: ALL3 },
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'opponentTotalBp', maxTotal: 5000, action: 'destroy', filter: { types: SPIRIT } }] },
    { kind: 'bpDestroyBoost', levels: L23, if: soulOnSelf, amount: 10000, fromTypes: ['spirit', 'brave', 'magic'] },
  ],
  'โดจิ นาคาเหลือง': [
    [
      { kind: 'trigger', on: 'allyDestroyed', levels: ALL2, subject: { types: ['nexus'], byOpponent: true }, steps: [{ do: 'voidCore', to: 'self', count: 2 }] },
      // "ถูกทำลาย/สูญสลายโดยคู่แข่ง": ดักการสูญสลายด้วย (กติกา 10: สูญสลายไม่ใช่การถูกทำลาย)
      { kind: 'trigger', on: 'allyDepletedByOpponent', levels: ALL2, subject: { types: ['nexus'] }, steps: [{ do: 'voidCore', to: 'self', count: 2 }] },
    ],
  ],
  'ปรมาจารย์ช่างตีเหล็ก คาเมะมิสึ': [{ kind: 'nexusExhaustPay', levels: ALL2, names: ['ราชันดอกบัว เซ็นจู'] }],
  'โดจิ ห้ามงคล': [
    { kind: 'noSummonTriggers', levels: ALL3 },
    {
      kind: 'trigger',
      on: 'destroyedByOpponentEffect',
      levels: ALL3,
      if: soulOnSelf,
      steps: [{ do: 'mill', count: 5 }, { do: 'opponentLifeToReserve', count: 1, per: { milledByThis: { types: ['spirit'] } } }],
    },
  ],
  เมียวโอมังกรสมุทร: [{ kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'draw', count: 2 }, { do: 'discard', count: 2 }] }, catalyze(L23, ['blue'], 'สีฟ้า')],
  'บูล นักบวชทรงศีล': [{ kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'voidCore', to: 'ally', count: 1 }] }],
  'กันดาละ-ไฮดรา': [assault(ALL3, 2), { kind: 'assaultTrashNexus', levels: L23 }],
  เมียวโอบัวม่วง: [catalyze(ALL3, null, ''), { kind: 'burstMagicBan', levels: L23, mode: 'nexusCost', ownAttackStepOnly: true }],
  โอโอจิโระไทเกอร์: [
    [
      { kind: 'maxLevelAllies', levels: ALL3, filter: { soul: true } },
      { kind: 'maxLevelIf', levels: ALL3, if: soulOnSelf },
    ],
    { kind: 'trigger', on: 'allyWonBattle', levels: [3], subject: { self: true }, if: { selfAttacking: true }, steps: [{ do: 'peekHandDiscard', count: 2 }] },
  ],
  เมียวโอหมัดเหล็ก: [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'summonFreeHandOrTrash', filter: NEXUS, max: 3 }, { do: 'summonThisFree' }] },
    assault(L23, 3),
  ],
  'มังกรยุทธ์ดาบศักดิ์สิทธิ์ มิสึรุกิ-ดราก้อน': [
    { kind: 'trigger', on: 'endStep', levels: ALL3, ownTurnOnly: true, steps: [{ do: 'setBurstFromHand' }] },
    catalyze(L23, null, '', { countKills: true, then: [{ do: 'opponentLifeToReserve', count: 1, per: { burstKills: true } }] }),
  ],
  'เมียวโอดาบศักดิ์สิทธิ์ ชูร่า': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'summonFromHandFree', filter: { types: ['brave'], family: 'ดาบกระบี่' } }] },
    catalyze(L23, null, ''),
  ],
};
