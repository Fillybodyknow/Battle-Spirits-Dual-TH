/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 11 ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import type { Color } from '../src/schema';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
/** Ultra Shield: ไม่รับผลเอฟเฟกต์สปิริต/อัลติเมท/เน็กซัส/เมจิค */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const soulInTrash: Condition = { soulInTrash: true };
/** "สามารถส่งโซลคอร์บนสปิริตเรา/รีเสิร์ฟเราลงแทรชเรา" ทำได้ */
const ownSoul: Condition = { any: [{ anyAllySoul: true }, { soulInReserve: true }] };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const GENJI = ['เก็นจิ'];

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

/** Spirit Soul: เมื่อเราอัญเชิญการ์ดอัลติเมท สปิริตนี้ได้รับเจ็มสีนี้เพิ่ม 1 เม็ด */
const spiritSoul = (levels: number[], color: Color): ScriptAbility => ({ kind: 'summonSymbol', levels, filter: { types: ['ultimate'] }, color, count: 1 });

/** การ์ดอัลติเมท "หกขุนศึกเซ็นโงคุ" ใช้โซลคอร์ร่วมจ่ายคอสต์ เพื่ออัญเชิญโดยไม่สนเงื่อนไขอัญเชิญ */
const SENGOKU6: ScriptAbility = { kind: 'ignoreSummonCondition', levels: ALL2, filter: { types: ['ultimate'], nameIncludes: ['หกขุนศึกเซ็นโงคุ'] } };

/** Showdown สตาร์ทสเต็ปของคู่แข่ง */
const showdown = (levels: number[], then: Step[]): ScriptAbility => ({ kind: 'trigger', on: 'oppStartStep', levels, steps: [{ do: 'showdown', then }] });

/** "สามารถส่งโซลคอร์บนสปิริตนี้ลงแทรชเรา เพื่อ ..." */
const paySelfSoul = (label: string, steps: Step[], cond: Condition = soulOnSelf): Step => may(`ส่ง Soul Core บนสปิริตนี้ลงแทรช: ${label}`, [{ do: 'soulToTrash' }, ...steps], cond);
/** "สามารถส่งโซลคอร์บนสปิริตเรา/รีเสิร์ฟเราลงแทรชเรา เพื่อ ..." */
const payOwnSoul = (label: string, steps: Step[]): Step => may(`ส่ง Soul Core บนสปิริตเรา/รีเสิร์ฟลงแทรช: ${label}`, [{ do: 'ownSoulToTrash' }, ...steps], ownSoul);

export const BS11_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Brave
  'ดาบมังกรเพลิง โอนิมารุ-ชินอุจิ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [
        { do: 'destroyAllOpponent', filter: { types: SPIRIT, maxBp: 6000 } },
        // "สปิริตที่มี Ultra Shield" = ของตัวเอง หรือที่ได้รับจากการ์ดอื่น · Shield ที่กันสีแดงยังกันผลนี้ได้ (กติกา 14 Shield)
        when({ catalyzed: true }, [{ do: 'destroyAllOpponent', filter: { types: SPIRIT, hasUltraShield: true } }]),
        { do: 'summonThisFree' },
      ],
    },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'atBattleEnd', steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 12000 } }] }] },
  ],

  // ---------------------------------------------------------------- Magic
  ระบำวิญญาณมังกร: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterLifeLost',
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } },
        { do: 'destroyChosenOpponent', filter: { types: ['nexus'] } },
        { do: 'payToUseFlash', main: true },
      ],
    },
    { kind: 'magic', timing: 'main', steps: [{ do: 'revealPickRestTrash', count: 5, filter: { types: SPIRIT, family: 'มังกรยุทธ์' }, rest: 'bottom' }] },
  ],
  โฮมุระโอคาบุกิ: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'opponentTotalBp', maxTotal: 7000, action: 'destroy' },
        { do: 'refreshChosenAlly', filter: { types: SPIRITISH, family: 'เจ้าสมิง' }, if: paidSoul, per: { destroyedByThis: true } },
      ],
    },
  ],
  เฟลมแดนซ์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        when(
          paidSoul,
          [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 10000 } }],
          [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 4000 } }],
        ),
      ],
    },
  ],
  สุดยอดกระบวนค่ายไร้เทียมทานแห่งแปดเก็นจิ: [
    {
      kind: 'burst',
      soul: true,
      on: 'afterOpponentHandIncreased',
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, to: 'deckTop' }, { do: 'payToUseFlash' }],
    },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRITISH } },
        // ตีความ: "สปิริตที่มีคำว่า เก็นจิ อยู่ตั้งแต่ 8 ตัว" = ของเรา
        when({ alliesMatchAtLeast: { filter: { types: SPIRIT, nameIncludes: GENJI }, count: 8 } }, [
          { do: 'bounceAllOpponent', filter: { types: ['spirit', 'ultimate', 'brave', 'nexus'] }, to: 'deckBottom', withBurst: true },
        ]),
      ],
    },
  ],
  บุปผาร่ายรำดรอว์: [
    // ในแทรช: เอนด์สเต็ปของเรา ถ้ามีโซลคอร์ในแทรช กลับขึ้นมือ (การ์ดชื่อนี้ 1 ใบต่อเทิร์น)
    { kind: 'trigger', on: 'endStep', zone: 'trash', levels: [], oncePerTurnByName: true, if: soulInTrash, steps: [{ do: 'selfFromTrashToHand' }] },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        // "เมื่อกลายเป็น BP0 โดยเอฟเฟกต์นี้, ทำลายสปิริตนั้นและเราจั่ว 1 ใบ": จั่วเมื่อ BP0 แม้สปิริตนั้นไม่ถูกทำลาย
        { do: 'debuffChosenOpponent', amount: 3000, filter: { types: SPIRIT }, destroyAtZero: true, zeroThen: [{ do: 'draw', count: 1 }] },
      ],
    },
  ],
  ไซเลนท์วอลล์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'endAttackStepAfterBattle' },
        may('นำสปิริตคู่แข่งที่ไม่ได้ต่อสู้อยู่ 1 ตัวกลับขึ้นมือ', [{ do: 'bounceOpponent', filter: { types: SPIRIT, notInBattle: true } }], {
          all: [{ lifeAtMost: 2 }, { opponentHas: { types: SPIRIT, notInBattle: true } }],
        }),
      ],
    },
  ],
  'หิมะน้ำแข็ง เซอร์เคิล': [
    {
      kind: 'magic',
      timing: 'flash',
      // จ่ายปกติ = เล็ง 1 ตัว (กระจายด้วย Dispersion ได้) · จ่ายด้วยโซลคอร์ = 2 ตัว (กติกา 14 Dispersion ข้อ 1)
      steps: [when(paidSoul, [{ do: 'noLifeDamageChosen', count: 2, filter: { types: SPIRITISH } }], [{ do: 'noLifeDamageChosen', count: 1, filter: { types: SPIRITISH } }])],
    },
  ],
  ขบวนร้อยอสูรท่องราตรี: [{ kind: 'magic', timing: 'flash', steps: [when(soulInTrash, [{ do: 'summonFreeHandOrTrash', filter: { types: SPIRIT, family: 'โยวไค' }, max: 100 }])] }],
  เฟลมเทมเพส: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [when(paidSoul, [{ do: 'destroyAllBoth', filter: { types: SPIRITISH, maxBp: 7000 } }], [{ do: 'destroyAllBoth', filter: { types: SPIRITISH, maxBp: 3000 } }])],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  บอนโนจิเทมเพิลที่ลุกไหม้: [
    {
      kind: 'trigger',
      on: 'allyBurstActivated',
      subject: { catalyzed: true },
      levels: ALL2,
      ownTurnOnly: true,
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRITISH } },
        when({ subjectIs: { color: 'white' } }, [{ do: 'bounceOpponent', filter: { types: SPIRITISH } }]),
      ],
    },
    // ตีความ: ไม่แยกว่ามือเพิ่มจากเอฟเฟกต์สปิริต/เมจิค หรือเน็กซัส (นับทุกเอฟเฟกต์ของคู่แข่ง)
    { kind: 'trigger', on: 'oppHandIncreased', levels: [2], steps: [may('จั่วการ์ดเท่าจำนวนที่มือคู่แข่งเพิ่มขึ้น', [{ do: 'draw', count: 1, per: { handIncrease: true } }])] },
  ],
  'No.40 กู๊ดลัคฮิล': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'bounceOpponent', filter: { types: ['nexus'] }, to: 'deckTop' }] },
    { kind: 'bounceRedirect', levels: [2] },
  ],
  สลากสืบทอดบัลลังก์: [
    {
      kind: 'drawStep',
      levels: [1],
      extraDraw: [],
      before: [
        may(
          'ทิ้งใบบนสุดเด็คแทนการจั่ว',
          [
            { do: 'addDrawStepDraw', amount: -1 },
            {
              do: 'millTopBranch',
              cases: [
                { filter: { types: SPIRIT, family: 'เจ้าหญิงสงคราม' }, steps: [{ do: 'draw', count: 2 }] },
                { filter: { types: ['magic'] }, steps: [{ do: 'voidCore', to: 'ally', count: 2, filter: { types: SPIRIT, family: 'เจ้าหญิงสงคราม' } }] },
              ],
              otherwiseToHand: true,
            },
          ],
          { deckAtLeast: 1 },
        ),
      ],
    },
  ],
  'No.30 โททอลซองเมาท์เท่น': [
    {
      kind: 'trigger',
      // "ถูกทำลาย/สูญสลายโดยคู่แข่ง" (กติกา 10: สูญสลายไม่ใช่การถูกทำลาย จึงต้องระบุทั้งสองแบบ)
      on: ['allyDestroyed', 'allyDepletedByOpponent'],
      subject: { color: 'yellow', byOpponent: true },
      levels: ALL2,
      attackStepOnly: true,
      steps: [{ do: 'draw', count: 1 }],
    },
    {
      kind: 'trigger',
      on: 'oppMainStepStart',
      levels: [2],
      steps: [payOwnSoul('ในเทิร์นนี้ สปิริตคู่แข่งที่มีสัญลักษณ์ลดคอสต์ตั้งแต่ 2 สี เจ็มเป็น 0', [{ do: 'symbolsZeroAllOpponent', filter: { types: SPIRITISH, minReductionColors: 2 } }])],
    },
  ],
  โลกสีเงินที่ถูกรุกราน: [
    {
      kind: 'trigger',
      on: 'oppAttackStepStart',
      levels: ALL2,
      steps: [
        when(
          soulInTrash,
          [{ do: 'trashCoreToReserve', count: 99, withSoul: true }, { do: 'refreshAllAllies', filter: { types: SPIRIT, family: 'รถศึกมีชีวิต' } }],
          [{ do: 'trashCoreToReserve', count: 99, withSoul: true }],
        ),
      ],
    },
    {
      kind: 'trigger',
      on: ['allyDestroyed', 'allyDepletedByOpponent'],
      subject: { byOpponentEffect: true },
      levels: [2],
      oppTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'voidCore', to: 'reserve', count: 2 }],
    },
  ],
  ตราแห่งเพลิงรบ: [
    { kind: 'handCostPer', levels: ALL2, filter: { types: SPIRIT, family: 'ผู้เป็นนาย' }, per: { types: SPIRIT, family: 'ข้ารับใช้' }, delta: -1 },
    { kind: 'maxLevelAllies', levels: [2], filter: { types: SPIRIT, family: 'ผู้เป็นนาย', sameColorAlly: { types: SPIRIT, family: 'ข้ารับใช้' } } },
  ],
  'No.20 ลองฟิลด์': [
    { kind: 'trigger', on: 'allyBlocked', subject: { family: 'มังกรยุทธ์' }, levels: ALL2, ownTurnOnly: true, steps: [{ do: 'draw', count: 1 }] },
    {
      kind: 'trigger',
      on: 'ownAttackStepStart',
      levels: [2],
      steps: [payOwnSoul('ในเทิร์นนี้ เอฟเฟกต์ของ "โซลดราก้อน" ถือว่าได้ส่ง Soul Core ลงแทรชแล้ว', [{ do: 'soulCostFreeThisTurn', nameIncludes: ['โซลดราก้อน'] }])],
    },
  ],

  // ---------------------------------------------------------------- Spirit แดง
  'มังกรธนูหน้าไม้ ชุยฮะ': [
    {
      kind: 'trigger',
      on: 'allySoulTrashed',
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      oncePerTurn: true,
      steps: [may('นำ Soul Core ในแทรชมาวางบนสปิริตนี้', [{ do: 'soulFromTrashToSelf' }], soulInTrash)],
    },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 10000 }, if: soulOnSelf }] },
  ],
  'สุนัขพลปืน ซัจชู': [spiritSoul(ALL2, 'red')],
  มูฉะเร็กซ์: [
    { kind: 'evolution', levels: ALL3 },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [when(soulOnSelf, [{ do: 'symbolThisTurn', color: 'green', count: 1, untilBattleEnd: true }])] },
  ],
  มังกรเพลิงศักดิ์สิทธิ์: [{ kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 8000 } }] }],
  'เหล่าคนใกล้ชิด โฮมุระแมนดริล': [
    SENGOKU6,
    { kind: 'bpDestroyBoost', levels: [2], nameIncludes: ['หกขุนศึกเซ็นโงคุ เลออนแลนเซอร์'], amount: 10000, pierceShield: true, ownAttackStepOnly: true },
  ],
  'นักบวชนักรบ สุโอว': [
    catalyze(ALL3, ['red', 'white', 'blue'], 'สีแดง/ขาว/ฟ้า', { lifeAs: { names: ['โซลดราก้อน'], life: 3 } }),
    { kind: 'staticBp', levels: L23, if: { ownAttackStep: true }, scope: { ownFamily: 'ผู้เป็นนาย' }, amount: 10000 },
  ],
  'ขุนศึกคลั่ง โกวจิน': [
    { kind: 'showdownWeChoose', levels: ALL3 },
    showdown(L23, [{ do: 'draw', count: 2 }]),
  ],
  'ผู้รับใช้ผู้ยิ่งใหญ่ ริวเซ็น': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'summonFromHandFree', filter: { types: SPIRIT, family: 'ผู้เป็นนาย' }, max: 6, distinctColors: true }] },
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { family: 'ผู้เป็นนาย' },
      levels: L23,
      ownTurnOnly: true,
      steps: [
        { do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 20000 }, per: { gemColors: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] } } },
        { do: 'draw', count: 1, per: { gemColors: { families: ['ผู้เป็นนาย', 'ข้ารับใช้'] } } },
      ],
    },
  ],
  'มังกรป้อมปราการ กีก้า': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        may('ทำลายสปิริต BP ไม่เกิน 12000 ของคู่แข่ง 1 ตัว เพื่อนำคอร์ในแทรชไม่เกิน 5 เม็ดมาวางที่สปิริตนี้', [
          { do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 12000 } },
          { do: 'ifDestroyed', filter: { opponent: true }, steps: [{ do: 'trashCoresToSelf', max: 5 }] },
          // "สามารถ X เพื่อ Y": ต้องมีคอร์ในแทรชให้วางด้วย (กติกา 13 ข้อ 3)
        ], { all: [{ opponentHas: { types: SPIRIT, maxBp: 12000 } }, { any: [{ trashCoreAtLeast: 1 }, soulInTrash] }] }),
      ],
    },
    // ตีความ: ย้ายโซลคอร์ได้เฉพาะระหว่างสปิริตของเรา (ยังไม่รองรับการย้ายจากรีเสิร์ฟ/ไปเน็กซัส)
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], steps: [{ do: 'moveAllySoul' }] },
  ],
  'จักรพรรดิมังกรเซ็นโงคุ เบิร์นนิ่ง-โซลดราก้อน': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [when({ lifeAtMost: 3 }, [{ do: 'summonThisFree' }, { do: 'trashCoresToSelf' }])] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3, 4],
      steps: [
        {
          do: 'chooseOne',
          if: { all: [soulOnSelf, { not: { directAttack: true } }] },
          options: [
            {
              label: 'ส่ง Soul Core ลงแทรช: เลือกสปิริต/อัลติเมทคู่แข่งไม่เกิน 2 ตัวต่อสู้พร้อมกัน',
              // "เลือกระบุ ... และทำการต่อสู้พร้อมกัน" = แบบ Infinite Blade / ตีระบุ 2 ตัว (ไม่มีแฟลชหลังโจมตี, เล็งตัวที่มี Shield สีแดงไม่ได้: กติกา 14)
              steps: [{ do: 'soulToTrash' }, { do: 'chooseBlockers', direct: true, max: 2 }, { do: 'lifeOnBattlerGone', amount: 1, to: 'reserve' }],
            },
            NO,
          ],
        },
      ],
    },
  ],

  // ---------------------------------------------------------------- Spirit ขาว
  'แปดอัศวินเก็นจิ เก็นตะ': [{ kind: 'staticBp', levels: ALL3, scope: { self: true }, amount: 3000, perAllies: { types: SPIRIT, nameIncludes: GENJI } }],
  แรดบอร์ก: [
    [
      { kind: 'colorAlso', levels: ALL3, color: 'red' },
      { kind: 'symbolAlsoColor', levels: ALL3, color: 'red' },
    ],
    { kind: 'staticBp', levels: ALL3, scope: { self: true }, amount: 2000, perGemColors: true },
  ],
  'นักรบเครื่องกล ชุยอุน': [
    { kind: 'effectImmune', levels: ALL3, scope: 'self', colors: ['purple', 'green', 'blue'], types: ULTRA },
    catalyze(L23, ['white'], 'สีขาว'),
  ],
  'นักรบเครื่องกล ยูคิมุเระ': [
    { kind: 'kagemusha' },
    // "เมื่อสปิริตนี้ป้องกัน: ... เมื่อชนะและทำลาย" = ชนะการต่อสู้ตอนเป็นผู้ป้องกัน
    {
      kind: 'trigger',
      on: 'allyWonBattle',
      subject: { self: true },
      levels: [2],
      if: { all: [soulOnSelf, { selfInBattle: true }, { not: { selfAttacking: true } }] },
      steps: [{ do: 'opponentLifeToReserve', count: 1, to: 'trash' }],
    },
  ],
  'เจ้าหญิงจักรกล มานี': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'buffSelf', amount: 3000, untilBattleEnd: true }, when(soulOnSelf, [{ do: 'trashCoreToReserve', count: 3, withSoul: true }])] },
  ],
  ราบิคริสต้า: [{ kind: 'trigger', on: 'attack', levels: ALL2, steps: [{ do: 'restrictBlockers', filter: { notColors: ['red', 'purple'] } }] }],
  'เหล่าคนใกล้ชิด ชิบะด็อก': [
    SENGOKU6,
    { kind: 'extraSteps', levels: [2], if: { allyHas: { types: ['ultimate'], nameIncludes: ['หกขุนศึกเซ็นโงคุ เซ็นริวดาคุ'] } }, steps: ['refresh'], once: 'turn' },
  ],
  'นินจาเครื่องกล ชิโอมาเนกิ': [
    { kind: 'effectImmune', levels: ALL2, scope: 'self', colors: ['red', 'purple'], types: ULTRA },
    { kind: 'effectImmune', levels: [2], scope: { ownColor: 'green' }, colors: ['red', 'purple'], types: ULTRA },
  ],
  'เมทัลดี้-บัค': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'coresOffEverySpirit' }] },
    { kind: 'trigger', on: 'destroyed', levels: [2], steps: [{ do: 'selfFromTrashToHand' }] },
  ],
  'ขุนพลเครื่องกล อิจิยะ-โจ': [
    {
      kind: 'trigger',
      on: 'oppEndStep',
      levels: ALL3,
      if: { noLifeDamageThisTurn: true },
      steps: [
        { do: 'bounceOpponent', filter: { types: ['spirit', 'brave', 'nexus'] } },
        when(soulOnSelf, [{ do: 'bounceOpponent', filter: { types: ['spirit', 'brave', 'nexus'] } }]),
      ],
    },
    { kind: 'trigger', on: 'block', levels: L23, steps: [{ do: 'buffSelf', amount: 10000, untilBattleEnd: true }] },
  ],
  'นักบวชเครื่องกล ยาเท็นโดว': [
    { kind: 'allColorAttackStep', levels: ALL3, color: 'white' },
    catalyze(L23, null, '', { then: [when({ subjectIs: { color: 'white' } }, [{ do: 'bounceOpponent', filter: { types: SPIRITISH }, to: 'deckBottom' }])] }),
  ],
  'แปดอัศวินเก็นจิ ฮะจิริว': [
    { kind: 'handCostPer', self: true, levels: [], filter: {}, per: { types: SPIRIT, nameIncludes: GENJI }, delta: -1 },
    { kind: 'blockWhileExhausted', levels: ALL2, if: { all: [{ attackStep: true }, { oppTurn: true }] } },
    { kind: 'copyStatsAllies', levels: [2], if: soulOnSelf, filter: { types: SPIRIT, nameIncludes: GENJI } },
  ],
  'นักรบใต้หล้า เดย์เบรค-เธิร์ด': [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'discardOpponentBurst' }, { do: 'summonThisFree' }] },
    { kind: 'indestructible', levels: L23, if: { not: { opponentHasBurst: true } } },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [{ do: 'battleUnblockable', if: { all: [{ onlyGemColor: 'white' }, { not: { opponentHasBurst: true } }] } }] },
  ],

  // ---------------------------------------------------------------- Spirit เหลือง
  กิวคิ: [
    { kind: 'alsoMagic' },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'debuffChosenOpponent', amount: 3000, filter: { types: SPIRIT }, destroyAtZero: true }] },
    [
      { kind: 'colorAlso', levels: ALL2, color: 'white' },
      { kind: 'symbolAlsoColor', levels: ALL2, color: 'white' },
    ],
  ],
  'เซ็นโงคุฮิเมะ โคโชว': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'atBattleEnd', steps: [{ do: 'returnBattleMagic' }] }] },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [paySelfSoul('ใช้งานเมจิคในมือ 1 ใบไม่จ่ายคอสต์', [{ do: 'useMagicFromHandFree' }], { all: [soulOnSelf, { handHas: { types: ['magic'] } }] })] },
  ],
  นปเปะระเกิร์ล: [{ kind: 'alsoMagic' }, { kind: 'magic', timing: 'flash', steps: [{ do: 'negateChosenThisTurn', filter: { types: SPIRITISH } }] }],
  'อิตทัน โมเมน': [{ kind: 'alsoMagic' }, { kind: 'magic', timing: 'flash', steps: [{ do: 'battleLevelUnblock' }] }],
  'เซ็นโงคุฮิเมะ ทามะกิ': [
    { kind: 'coreFloor', levels: ALL3, filter: { types: SPIRIT }, min: 'lv1' },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: L23,
      steps: [
        paySelfSoul('วางคอร์วอยด์ 1 เม็ดบนสปิริตเผ่าเจ้าหญิงสงครามอื่นของเรา', [{ do: 'voidCore', to: 'otherAlly', count: 1, filter: { types: SPIRIT, family: 'เจ้าหญิงสงคราม' } }], {
          all: [soulOnSelf, { otherAllyHas: { types: SPIRIT, family: 'เจ้าหญิงสงคราม' } }],
        }),
      ],
    },
  ],
  'เหล่าคนใกล้ชิด วันโคมะอุน': [
    SENGOKU6,
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2],
      steps: [
        may('นำคอร์ไลฟ์ 1 เม็ดมาวางบนสปิริตนี้: ในเทิร์นนี้ไม่ถูกป้องกัน', [{ do: 'ownLifeToSelf', count: 1 }, { do: 'unblockableSelfThisTurn' }], {
          allyHas: { types: ['ultimate'], nameIncludes: ['หกขุนศึกเซ็นโงคุ บาเครุคัทซึ'] },
        }),
      ],
    },
  ],
  'ดอน นุระริเฮียน': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      zone: 'hand',
      subject: { byEffect: true },
      levels: [],
      steps: [may('อัญเชิญการ์ดนี้ในมือไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])],
    },
    [
      { kind: 'replaceDestroy', levels: ALL3, subject: { family: 'โยวไค' }, state: 'refresh', if: soulOnSelf },
      { kind: 'replaceDestroy', levels: ALL3, subject: { family: 'โยวไค' }, if: { not: soulOnSelf } },
    ],
  ],
  'เซ็นโงคุฮิเมะ คิระ & ซาระ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        may('แสดงใบบนสุดเด็ค 5 ใบ', [{ do: 'revealTakeAll', count: 5, filter: { types: SPIRIT, families: ['เจ้าหญิงสงคราม', 'คนธรรพ์'] }, distinctNames: true }], { deckAtLeast: 1 }),
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        { do: 'debuffChosenOpponent', amount: 5000, filter: { types: SPIRITISH }, destroyAtZero: true },
        paySelfSoul('ทำเอฟเฟกต์ BP-5000 ซ้ำอีก 1 ครั้ง', [{ do: 'debuffChosenOpponent', amount: 5000, filter: { types: SPIRITISH }, destroyAtZero: true }]),
      ],
    },
  ],
  'เซ็นโงคุฮิเมะ อายาเมะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3, 4],
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT }, per: { allies: { types: SPIRIT, families: ['เจ้าหญิงสงคราม', 'คนธรรพ์'] } } },
        { do: 'returnFromTrash', filter: { types: ['magic'] }, per: { bouncedByThis: true } },
      ],
    },
    { kind: 'trigger', on: 'allyMagicUsed', levels: [2, 3, 4], ownTurnOnly: true, attackStepOnly: true, steps: [{ do: 'symbolAttackerBattle', color: 'yellow', count: 1 }] },
  ],
};
