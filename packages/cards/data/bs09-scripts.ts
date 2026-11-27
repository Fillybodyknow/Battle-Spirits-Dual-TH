/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 09 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
/** มีโซลคอร์บนสปิริตเรา หรือในรีเสิร์ฟเรา (ใช้กับ ownSoulToTrash) */
const soulAvailable: Condition = { any: [{ anyAllySoul: true }, { soulInReserve: true }] };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
/** ถ้าเงื่อนไขจริง ทำ steps */
const when = (cond: Condition, steps: Step[], otherwise?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(otherwise ? { else: otherwise } : {}) });

/** [Catalyze] เมื่อสปิริตนี้โจมตี: สามารถส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อสั่งใช้ Soul Burst (then = หลังจากเบิร์สนั้นถูกสั่งใช้) */
const catalyze = (levels: number[], color: 'purple' | 'any', then: Step[] = []): ScriptAbility => ({
  kind: 'trigger',
  on: 'attack',
  levels,
  steps: [
    {
      do: 'chooseOne',
      if: { catalyzable: color },
      options: [
        {
          label: `ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst${color === 'purple' ? 'สีม่วง' : ''}`,
          steps: [{ do: 'soulToTrash' }, { do: 'catalyze', ...(color === 'purple' ? { color } : {}), ...(then.length ? { then } : {}) }],
        },
        NO,
      ],
    },
  ],
});

/** "การ์ดอัลติเมทที่มีคำว่า หกขุนศึกเซ็นโงคุ ... ใช้โซลคอร์ร่วมจ่าย เพื่ออัญเชิญโดยไม่สนเงื่อนไข" (เหล่าคนใกล้ชิด) */
const SENGOKU6: ScriptAbility = { kind: 'ignoreSummonCondition', levels: [1, 2], filter: { types: ['ultimate'], nameIncludes: ['หกขุนศึกเซ็นโงคุ'] } };

/** "สามารถส่งโซลคอร์บนสปิริตเรา/รีเสิร์ฟเราลงแทรชเรา, เพื่อ ..." */
const paySoul = (label: string, steps: Step[], cond?: Condition): Step =>
  may(label, [{ do: 'ownSoulToTrash' }, ...steps], cond ? { all: [soulAvailable, cond] } : soulAvailable);

/** ชื่อ "จอมมารสวรรค์ ก็อด-เซคส์" (ร่างแรก ไม่ใช่ร่างที่มีชื่อต่อท้าย) */
const GOD_SEXS: CardFilter = { names: ['จอมมารสวรรค์ ก็อด-เซคส์'] };

export const BS09_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Spirit C
  เซ็นคิ: [
    // (ในแทรช) เมื่อ "โกคิ" ของเราถูกอัญเชิญ: สามารถอัญเชิญการ์ดสปิริตนี้ (จ่ายคอสต์)
    { kind: 'trigger', on: 'allySummoned', zone: 'trash', levels: [], subject: { nameIncludes: ['โกคิ'] }, steps: [{ do: 'summonFromTrash', filter: { types: ['spirit'], nameIncludes: ['เซ็นคิ'] } }] },
    {
      kind: 'trigger',
      on: 'destroyedByOpponent',
      levels: ALL3,
      steps: [may('ทิ้งการ์ดในมือ 1 ใบ เพื่อจั่วการ์ด 1 ใบ', [{ do: 'discard', count: 1 }, { do: 'draw', count: 1 }], { handAtLeast: 1 })],
    },
  ],
  เนมุริเนโกะ: [{ kind: 'trigger', on: 'destroyed', levels: [1, 2], steps: [{ do: 'removeOpponentCores', count: 1, perPick: 2, filter: { types: SPIRIT } }] }],
  'นักบวชวิถียักษ์ อารายะ': [{ kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'draw', count: 1 }] }, catalyze([2], 'purple')],
  มูฉะเดวิล: [
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { family: 'มารต้องสาป' },
      steps: [
        may(
          'ส่ง Soul Core บนสปิริตเราลงแทรช เพื่อทำลายสปิริตเสื่อมสภาพของคู่แข่ง',
          [{ do: 'allySoulToTrash', filter: {} }, { do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }],
          { all: [{ anyAllySoul: true }, { opponentHas: { types: SPIRIT, state: 'exhausted' } }] },
        ),
      ],
    },
  ],
  อินทรีควันม่วง: [{ kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'draw', count: 3 }] }],
  'มารวายุ ยาบุซาเมะ': [
    { kind: 'quick' },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: ALL3,
      steps: [{ do: 'atBattleEnd', steps: [may('ส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อนำสปิริตนี้กลับขึ้นมือ', [{ do: 'soulToTrash' }, { do: 'returnSelfToHand' }], soulOnSelf)] }],
    },
  ],
  'หน่วยเฝ้าระวัง คินกะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [when(paidSoul, [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }], [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT, maxCost: 3 } }])],
    },
  ],
  'โคงะคุมูฉะ ฮิชิงาตะ': [
    { kind: 'trigger', on: 'allyAttack', levels: ALL3, ownTurnOnly: true, attackStepOnly: true, subject: { color: 'red', soul: true }, steps: [{ do: 'draw', count: 1 }] },
    [
      { kind: 'colorAlso', levels: [3], color: 'red' },
      { kind: 'symbolAlsoColor', levels: [3], color: 'red' },
    ],
  ],
  โอโทโนะซามะ: [{ kind: 'familyAlso', levels: [1, 2], if: soulOnSelf, family: 'ผู้เป็นนาย' }],
  โนโคกิริวูล์ฟ: [
    {
      kind: 'trigger',
      on: 'allyWonBattle',
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { families: ['ร่างประกอบ', 'สมิงหัว'] },
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT }, costFrom: 'subject' }],
    },
  ],
  เมียวโอดาบธรรม: [{ kind: 'trigger', on: 'attack', levels: [3], steps: [{ do: 'mill', count: 15 }] }],
  มัทชรา: [{ kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'opponentRandomDiscard', count: 1, if: paidSoul }] }],

  // ---------------------------------------------------------------- Spirit U
  'เหล่าคนใกล้ชิด เฮล-สคัล': [
    SENGOKU6,
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2],
      steps: [when({ allyHas: { nameIncludes: ['หกขุนศึกเซ็นโงคุ มุโดว'] } }, [{ do: 'removeOpponentCores', count: 3, to: 'trash', filter: { types: [...SPIRIT!, 'nexus'] }, withReserve: true }])],
    },
  ],
  'จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบที่ศูนย์-': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [{ do: 'draw', count: 1 }, when({ ownGemColorsAtLeast: 2 }, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }])],
    },
  ],
  'เหล่าคนใกล้ชิด อุซชน': [
    SENGOKU6,
    {
      kind: 'trigger',
      on: 'allyBattleEnd',
      levels: [2],
      attackStepOnly: true,
      if: { allyHas: { nameIncludes: ['หกขุนศึกเซ็นโงคุ เทนเซย์'] } },
      subject: { color: 'green', types: SPIRITISH },
      steps: [
        may('ส่งคอร์ 3 เม็ดบนสปิริต/อัลติเมทนั้นลงแทรช เพื่อฟื้นสภาพ', [{ do: 'subjectCoresToTrash', count: 3 }, { do: 'refreshSubject' }], {
          subjectIs: { state: 'exhausted', minCores: 4 },
        }),
      ],
    },
  ],
  'ข้ารับใช้ผู้ภักดี เอโสะวูล์ฟ': [
    { kind: 'trigger', on: 'allyAttack', levels: ALL3, ownTurnOnly: true, attackStepOnly: true, subject: { family: 'ศาสตราสมิง' }, steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    {
      kind: 'trigger',
      on: 'allyWonBattle',
      levels: L23,
      attackStepOnly: true,
      if: { allyHas: { nameIncludes: ['สมิงไดเมียว โยยะโนะคามิ'] } },
      subject: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] },
      steps: [{ do: 'refreshSubject' }],
    },
  ],
  'นักรบธารน้ำแข็ง โกมาฟุ': [
    {
      kind: 'destroyCostBoost',
      levels: [1, 2],
      if: { any: [{ anyAllySoul: true }, { allyHas: { types: ['spirit', 'ultimate', 'brave', 'nexus'], soul: true } }] },
      filter: { family: 'สมิงหัว' },
      amount: 2,
    },
  ],
  'เหล่าคนใกล้ชิด จินเบร์': [
    SENGOKU6,
    { kind: 'magicBurstTax', levels: [2], if: { allyHas: { nameIncludes: ['หกขุนศึกเซ็นโงคุ ไทดัล-บลู'] } }, amount: 3 },
  ],

  // ---------------------------------------------------------------- Spirit R
  'นักบวชองเมียว ชิโดะ': [
    catalyze(ALL3, 'any', [{ do: 'setBurstFromTrash', filter: { hasBurst: true, textIncludes: ['Soul Burst'] } }]),
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: L23,
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] },
      steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRITISH } }],
    },
  ],
  'นินจาเขี้ยวพิศวง วาราบิ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว', steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }] },
            { label: 'ฟื้นสภาพสปิริต/อัลติเมทเผ่า [ศาสตราสมิง] ของเรา 1 ตัว', steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRITISH, family: 'ศาสตราสมิง' } }] },
          ],
        },
        { do: 'summonThisFree' },
      ],
    },
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
  ],
  'นินจาเขี้ยวพิศวงชั้นกลาง เสโอ-คามุย': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'voidCore', to: 'self', count: 2 }, when(paidSoul, [{ do: 'opponentExhaustsOwn', count: 2 }])] },
    {
      kind: 'trigger',
      on: 'allyAttackHitLife',
      levels: L23,
      ownTurnOnly: true,
      attackStepOnly: true,
      if: soulOnSelf,
      subject: { families: ['ข้ารับใช้', 'ศาสตราสมิง'] },
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
  ],
  'ขุนศึกมังกรทะเล อิกคาคุ': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost: 4 } }] },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'peekOpponentBurst', filter: { types: ['spirit', 'magic'] } }] },
    // ทำงานใน peekOpponentBurst (Lv2) ตอนทิ้งเบิร์สได้
    { kind: 'useDiscardedBurst', levels: [3] },
  ],
  ดาร์ควิช: [
    { kind: 'staticBp', levels: ALL3, if: soulOnSelf, scope: { ownFamily: 'มารต้องสาป' }, amount: 5000 },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'destroyChosenOpponent', anySide: true, filter: { types: SPIRIT, state: 'exhausted' } }] },
  ],
  ฮังกรี้ทรี: [
    {
      kind: 'trigger',
      on: ['destroyedByOpponent', 'depletedByOpponent'],
      levels: [1, 2],
      steps: [{ do: 'opponentRandomDiscard', count: 1 }, { do: 'opponentRandomDiscard', count: 2, if: { opponentHandAtLeast: 5 } }],
    },
  ],

  // ---------------------------------------------------------------- Spirit M
  โกคิ: [
    [
      { kind: 'trashCost', cost: 5 },
      // อัญเชิญใน [เอนด์สเต็ปของเรา] ได้: ถามตอนเริ่มเอนด์สเต็ป (จ่ายคอสต์ 5)
      { kind: 'trigger', on: 'endStep', zone: 'trash', levels: [], steps: [{ do: 'summonFromTrash', filter: { types: ['spirit'], nameIncludes: ['โกคิ'] } }] },
    ],
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRITISH }, per: { allies: { types: SPIRIT, families: ['อสูรราตรี', 'มารต้องสาป', 'วิญญาณสมิง'] }, anySide: true } }],
    },
    { kind: 'trigger', on: 'allyDestroyed', levels: L23, subject: { nameIncludes: ['เซ็นคิ'] }, steps: [{ do: 'opponentDestroysOwn', filter: { types: SPIRITISH } }] },
  ],
  'นินจาแห่งแผ่นดิน ไดบีท': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      steps: [{ do: 'voidCore', to: 'ally', count: 1 }, { do: 'opponentNoBurstThisTurn', if: { catalyzed: true } }, { do: 'summonThisFree' }],
    },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'pairBlock' }] },
  ],
  เมียวโอสยบมาร: [
    { kind: 'trashLock', levels: ALL3 },
    catalyze(L23, 'any', [may('ให้คู่แข่งทิ้งการ์ดในมือทั้งหมด แล้วคู่แข่งจั่วการ์ด 2 ใบ', [{ do: 'opponentDiscardHandDraw', draw: 2 }], { opponentHandAtLeast: 5 })]),
  ],

  // ---------------------------------------------------------------- Spirit X
  'จักรพรรดิองเมียว ริคุโดว': [
    [
      {
        kind: 'trigger',
        on: 'allyDestroyed',
        levels: [1, 2, 3, 4],
        subject: { byOpponentEffect: true },
        steps: [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], families: ['ผู้เป็นนาย', 'อสูรราตรี', 'มารต้องสาป'] } }],
      },
      {
        kind: 'trigger',
        on: 'allyBouncedByOpponent',
        levels: [1, 2, 3, 4],
        steps: [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], families: ['ผู้เป็นนาย', 'อสูรราตรี', 'มารต้องสาป'] } }],
      },
    ],
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3, 4],
      steps: [{ do: 'summonFromTrashThen', filter: { types: ['spirit'], color: 'purple' }, then: [{ do: 'opponentRandomDiscard', count: 1 }] }],
    },
  ],
  'ผู้นำนินจาเขี้ยวพิศวง โทวโดว': [
    { kind: 'trigger', on: 'oppSoulToTrash', zone: 'hand', levels: [], steps: [may('อัญเชิญ โทวโดว ไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])] },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2, 3, 4],
      steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRITISH }, lockRefresh: true, per: { allies: { types: SPIRITISH, family: 'ศาสตราสมิง' } } }],
    },
  ],
  'ไดเมียวเจ็ดดาบสมุทร ชิโรนากัส': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      alsoDepleted: true,
      steps: [{ do: 'destroyAllBoth', filter: { types: SPIRIT, notFamilies: ['ผู้เป็นนาย', 'สมิงหัว'] } }, { do: 'summonThisFree' }],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        when({ lifeAtMost: 3 }, [
          { do: 'destroyChosenOpponent', filter: { types: SPIRITISH }, costFrom: 'self' },
          { do: 'symbolThisTurn', color: 'blue', count: 1, per: { destroyedSymbolsByThis: true } },
        ]),
      ],
    },
  ],

  // ---------------------------------------------------------------- Brave
  'ไดกิว-อาร์มส์': [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        when({ selfIs: { minBp: 10000 } }, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT }, costFrom: 'self' }]),
        when({ selfIs: { minBp: 20000 } }, [{ do: 'restrictBlockers', filter: { soul: true } }]),
      ],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  ต้นสนเดี่ยวของป่าแห่งนินจา: [
    { kind: 'trigger', on: 'oppDrew', levels: [1, 2], steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRITISH } }] },
    { kind: 'trigger', on: 'allyWonBattle', levels: [2], subject: { family: 'ศาสตราสมิง' }, steps: [{ do: 'voidCore', to: 'subject', count: 2 }] },
  ],
  'No.10 ดราวต์ฮอร์ส': [
    { kind: 'trigger', on: 'allyAttack', levels: [1, 2], ownTurnOnly: true, attackStepOnly: true, subject: { family: 'วายุนินจา' }, steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }] },
    {
      kind: 'trigger',
      on: 'oppAttack',
      levels: [2],
      oppTurnOnly: true,
      attackStepOnly: true,
      subject: { types: SPIRIT },
      steps: [paySoul('ส่ง Soul Core ลงแทรช เพื่อเสื่อมสภาพสปิริต/อัลติเมทคู่แข่ง 2 ตัว', [{ do: 'exhaustOpponent', count: 2, filter: { types: SPIRITISH } }], { opponentHas: { types: SPIRITISH, state: 'refresh' } })],
    },
  ],
  'No.35 เมาท์เท่นเมาท์': [
    { kind: 'trigger', on: 'allySummoned', levels: [1, 2], subject: { card: { types: ['spirit'], noEffectText: true } }, steps: [{ do: 'draw', count: 2 }, { do: 'discard', count: 2 }] },
    {
      kind: 'trigger',
      on: 'ownAttackStepStart',
      levels: [2],
      steps: [paySoul('ส่ง Soul Core ลงแทรช: ในเทิร์นนี้ เอฟเฟกต์คู่แข่งจบแอทแท็คสเต็ปไม่ได้ ขณะสปิริตไม่มีเอฟเฟกต์ของเราโจมตี', [{ do: 'noEndAttackStepThisTurn', filter: { types: ['spirit'], noEffectText: true } }])],
    },
  ],
  โอวาริโนะเซได: [
    { kind: 'maxLevelAllies', levels: [1, 2], filter: { types: SPIRIT, nameIncludes: ['ก็อด-เซคส์'] }, ownAttackStepOnly: true },
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { nameIncludes: ['ก็อด-เซคส์'] },
      steps: [{ do: 'restrictBlockers', filter: { types: SPIRIT, highestBp: true } }],
    },
  ],
  'No.23 เลิฟวิสต้อม': [
    { kind: 'drawStep', levels: [1, 2], extraDraw: [{ amount: 1, if: { trashAtLeast: 10 } }], noStack: true },
    {
      kind: 'trigger',
      on: 'allySummoned',
      levels: [2],
      attackStepOnly: true,
      subject: { fromTrash: true, color: 'purple' },
      steps: [paySoul('ส่ง Soul Core ลงแทรช เพื่อทำลายสปิริตเสื่อมสภาพของคู่แข่ง', [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, state: 'exhausted' } }], { opponentHas: { types: SPIRIT, state: 'exhausted' } })],
    },
  ],
  'วัดอรุณ ปราสาทพระวิหารแห่งอรุณรุ่ง': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'opponentNoMagicThisTurn' }, { do: 'summonThisFree' }] },
    { kind: 'opponentNoTrashReturn', levels: [1, 2] },
    { kind: 'maxLevelAllies', levels: [2], filter: { types: SPIRIT, family: 'ผู้ปลุกกระตุ้น' }, ownAttackStepOnly: true },
  ],
  บึงสูบชีพ: [
    { kind: 'trigger', on: 'startStep', levels: [1, 2], steps: [{ do: 'opponentReserveToTrash' }, { do: 'removeOpponentCores', count: 1, to: 'trash', filter: { types: SPIRIT } }] },
    { kind: 'trigger', on: 'startStep', levels: [2], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, per: { allies: { types: SPIRIT, family: 'มารต้องสาป' } } }] },
  ],
  สุสานของจักรพรรดิมาร: [{ kind: 'oneCoreNoBattle', levels: [1, 2] }, { kind: 'attackTax', levels: [2], cores: 2 }],
  ผลไม้แห่งชีวิต: [
    { kind: 'trigger', on: 'lifeLost', levels: [1, 2], steps: [{ do: 'draw', count: 1 }] },
    { kind: 'trigger', on: 'lifeLost', levels: [2], steps: [{ do: 'voidCore', to: 'reserve', count: 1 }, { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }] },
  ],
  สมรภูมิโบราณต้องสาป: [
    { kind: 'trigger', on: 'oppExhausted', levels: [1, 2], subject: { types: SPIRITISH }, steps: [{ do: 'draw', count: 1 }] },
    {
      kind: 'activated',
      levels: [2],
      timing: 'attackFlash',
      label: 'ส่ง Soul Core บนเน็กซัสนี้ลงแทรช: ทำลายสปิริต/อัลติเมทที่กำลังป้องกันของคู่แข่ง',
      if: { all: [{ ownAttackStep: true }, soulOnSelf, { opponentHas: { types: SPIRITISH, inBattle: true } }] },
      steps: [{ do: 'soulToTrash' }, { do: 'destroyChosenOpponent', filter: { types: SPIRITISH, inBattle: true } }],
    },
  ],
  ต้นไม้แห่งนักปราชญ์ที่ถูกซ่อนไว้: [
    { kind: 'staticBp', levels: [1, 2], if: { attackStep: true }, scope: { own: { types: SPIRIT, inBattle: true } }, amount: 1000, perAllies: { types: SPIRIT, state: 'exhausted' } },
    {
      kind: 'trigger',
      on: 'endStep',
      levels: [2],
      steps: [{ do: 'refreshAllAllies', filter: { types: SPIRIT } }, { do: 'voidCore', to: 'refreshedByThis', count: 1, if: soulOnSelf }],
    },
  ],

  // ---------------------------------------------------------------- Magic
  จุติจอมมารสวรรค์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'returnFromTrash', filter: { types: ['spirit'], anyOf: [{ color: 'purple' }, { color: 'white' }] } },
        { do: 'summonFromHandFree', filter: { nameIncludes: ['จอมมารสวรรค์ ก็อด-เซคส์ -รูปแบบทำลายล้าง-'] }, if: { trashHas: GOD_SEXS } },
      ],
    },
  ],
  คามุยวินด์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว', steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }], if: { opponentHas: { types: SPIRIT, state: 'refresh' } } },
            { label: 'นำการ์ดชื่อเดียวกันไม่เกิน 3 ใบในแทรชคู่แข่งไปใต้สุดเด็ค', steps: [{ do: 'opponentTrashSameNameToBottom', max: 3 }] },
          ],
        },
      ],
    },
  ],
  โอเชี่ยนคอล: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'summonFreeHandOrTrash', filter: { types: ['spirit'], noEffectText: true }, max: 3 }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffAllies', amount: 10000, filter: { types: SPIRIT, noEffectText: true } }] },
  ],
  เฟเธอร์บาเรีย: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'immuneChosenThisTurn', filter: { types: SPIRITISH, inBattle: true } }] }],
  วายุนินจาสตอร์ม: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        may(
          'เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว เพื่อฟื้นสภาพสปิริตเผ่า [วายุนินจา] ของเรา 1 ตัว',
          [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }, { do: 'refreshChosenAlly', filter: { types: SPIRIT, family: 'วายุนินจา' } }],
          { all: [{ opponentHas: { types: SPIRIT, state: 'refresh' } }, { allyHas: { types: SPIRIT, family: 'วายุนินจา', state: 'exhausted' } }] },
        ),
        { do: 'voidCore', to: 'reserve', count: 1, if: paidSoul },
      ],
    },
  ],
  คำสาปบงการชีพ: [
    // "ถ้าเบิร์สนี้ถูกสั่งใช้โดย Catalyze การ์ดเมจิคนี้ถือว่าไร้สี" (ชีลด์ตามสีกันไม่ได้)
    { kind: 'burst', soul: true, on: 'afterOpponentAttack', steps: [{ do: 'colorlessIfCatalyzed' }, { do: 'removeOpponentCores', count: 1, perPick: 2, filter: { types: SPIRIT } }, { do: 'payToUseFlash' }] },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'destroyOwn', filter: { types: SPIRIT }, then: [{ do: 'opponentDestroysOwn', filter: { types: SPIRIT } }] }],
    },
  ],
  ท่าฟันหนึ่งดาบผ่าสมุทร: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'destroyAllOpponent', filter: { types: SPIRITISH, textIncludes: ['ไม่ถูกป้องกัน'] } },
        when({ allyHas: { types: SPIRITISH, family: 'สมิงหัว' } }, [{ do: 'destroyLowestCostOpponent', filter: { types: SPIRIT } }]),
      ],
    },
  ],
};
