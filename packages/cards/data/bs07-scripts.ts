/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 07 (ดีว่า: ทีม / On Stage / Solo Part / My Unit / เมจิคไทป์เพลง) ผูกกับการ์ดด้วยชื่อ
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 * กติกา 14 "My Unit" / "และอื่นๆของดีว่า" (นอกมือ, ทีม, On Stage, ไทป์:เพลง, Solo Part)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

const DIVA = 'ดีว่า';
const STAGE = 'สเตจสไตล์';
const PRIVATE = 'ไพรเวทแวร์';
const SENGOKU = 'เจ้าหญิงสงคราม';
const SH = 'ไชนี่ฮาร์ท';
const ABS = 'แอปโซลูท';
const TG = 'ทไวไลท์โกธิค';
const PA = 'พริตตี้เอนิมอลส์';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
/** Ultra Shield: ไม่รับผลเอฟเฟกต์ของสปิริต/อัลติเมท/เน็กซัส/เมจิค */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
const SONG: CardFilter = { types: ['magic'], magicType: 'เพลง' };
const soulOnSelf: Condition = { soulOnSelf: true };
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const draw1: Step = { do: 'draw', count: 1 };
/** เงื่อนไข "หรือ" */
const or = (...c: Condition[]): Condition => ({ not: { all: c.map((x) => ({ not: x })) } });

/** "สามารถ ... ได้": ถามก่อนทำ */
const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });

/** เมจิคไทป์เพลง: "หลังจากนั้น, สามารถนำการ์ดเมจิคนี้ไปวางบนฟิลด์เราได้" */
const song: Step = {
  do: 'chooseOne',
  options: [
    { label: 'วางการ์ดเมจิคนี้บนฟิลด์ (เพลง)', steps: [{ do: 'placeThisSong' }] },
    { label: 'ไม่วาง (ลงแทรช)', steps: [] },
  ],
};

/** Solo Part: "ถ้าสปิริตนี้มี (โซลคอร์) วางอยู่, "<ชื่อ>" ของเราทั้งหมด จะไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง" */
const soloPart = (levels: number[], name: string): ScriptAbility => ({ kind: 'destroyImmune', levels, if: soulOnSelf, scope: { ownNamed: [name] }, soloPart: true });

/**
 * On Stage แอทแท็คสเต็ปของเรา: สปิริตนี้สามารถกลับไปใต้เด็คแทนการโจมตี
 * เพื่ออัญเชิญไม่จ่ายคอสต์ "<ชื่อ>" เผ่า [สเตจสไตล์] จากในมือ/นอกมือของเรา 1 ใบ และจั่วการ์ด 1 ใบ
 */
const onStage = (levels: number[], name: string): ScriptAbility => {
  const target: CardFilter = { types: ['spirit'], nameIncludes: [name], family: STAGE, withShown: true };
  return {
    kind: 'onStage',
    keyword: true,
    levels,
    label: `On Stage: อัญเชิญ "${name}" [สเตจสไตล์] + จั่ว 1 ใบ`,
    if: { handHas: { ...target, withShown: true } },
    steps: [{ do: 'summonFromHandFree', filter: target }, draw1],
  };
};

/** My Unit N: ต้องมีสปิริตเผ่า [ดีว่า] ที่ฟื้นสภาพของเรา N ตัว (ตัวที่โจมตีอยู่เสื่อมสภาพแล้ว ไม่นับ) */
const unit = (n: number): Condition => ({ alliesMatchAtLeast: { filter: { family: DIVA, state: 'refresh' }, count: n } });
const myUnit = (levels: number[], n: number, label: string, steps: Step[], cond?: Condition): ScriptAbility => ({
  kind: 'trigger',
  on: 'attack',
  levels,
  steps: [may(`My Unit ${n}: ${label}`, [{ do: 'myUnit', count: n }, ...steps], cond ? { all: [unit(n), cond] } : unit(n))],
});

/** [Catalyze] สีเหลือง เมื่อสปิริตนี้โจมตี: สามารถส่ง Soul Core บนสปิริตนี้ลงแทรช เพื่อสั่งใช้ Soul Burst สีเหลืองของเราทันที */
const catalyzeYellow = (levels: number[]): ScriptAbility => ({
  kind: 'trigger',
  on: 'attack',
  levels,
  steps: [
    {
      do: 'chooseOne',
      if: { catalyzable: 'yellow' },
      options: [{ label: 'ส่ง Soul Core ลงแทรช: [Catalyze] สั่งใช้ Soul Burst สีเหลือง', steps: [{ do: 'soulToTrash' }, { do: 'catalyze', color: 'yellow' }] }, NO],
    },
  ],
});

export const BS07_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- Spirit C
  '[หูกระต่ายจัมพ์] ราบี้-ดาริน': [
    soloPart([1, 2], 'ราบี้-ดาริน'),
    { kind: 'trigger', on: 'allyOnStage', subject: { team: SH }, levels: [2], ownTurnOnly: true, if: soulOnSelf, steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }] },
  ],
  '[หญิงงามยิ้มแย้ม] รัน-เบลเซีย': [
    soloPart([1, 2, 3], 'รัน-เบลเซีย'),
    {
      kind: 'trigger',
      on: 'allyExhausted',
      subject: { nameIncludes: ['รัน-เบลเซีย'], other: true },
      levels: [2, 3],
      attackStepOnly: true,
      if: soulOnSelf,
      steps: [{ do: 'refreshSelf' }],
    },
  ],
  'ไซกะ-อุนดีเน่': [
    onStage([1, 2], 'ไซกะ-อุนดีเน่'),
    { kind: 'staticBp', levels: [2], if: { all: [{ attackStep: true }, { oppTurn: true }] }, scope: { own: { team: SH } }, amount: 3000 },
  ],
  คาซาเนะ: [onStage([1, 2, 3], 'คาซาเนะ')],
  '[แมวน้อยจอมซน] คาซาเนะ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2, 3],
      steps: [
        may(
          'ฟื้นสภาพสปิริตทีม ไชนี่ฮาร์ท 1 ตัว (เทิร์นละ 1 ครั้ง)',
          [{ do: 'markOnce', key: 'kasane' }, { do: 'refreshChosenAlly', filter: { team: SH, notSelf: true } }, { do: 'moveAllySoul', filter: { team: SH } }],
          { all: [{ onceFree: 'kasane' }, { otherAllyHas: { team: SH, state: 'exhausted' } }] },
        ),
      ],
    },
  ],
  ซีคฟรีด้า: [
    onStage([1, 2, 3], 'ซีคฟรีด้า'),
    { kind: 'trigger', on: 'allyOnStage', levels: [2, 3], ownTurnOnly: true, steps: [{ do: 'destroyChosenOpponent', filter: { types: ['nexus'] } }] },
  ],
  '[เจ้าหญิงตุ๊กตา] ฮิลด้า-มากาเร็ท': [onStage([1, 2], 'ฮิลด้า-มากาเร็ท'), soloPart([2], 'ฮิลด้า-มากาเร็ท')],
  'โมโมะ-กิวมอนเจ': [
    onStage([1, 2, 3], 'โมโมะ-กิวมอนเจ'),
    { kind: 'staticBp', levels: [2, 3], if: soulOnSelf, scope: { own: { team: ABS } }, amount: 4000 },
  ],
  '[ราชินีสีดำ] เซน่า-ริวมิน': [
    {
      kind: 'activated',
      levels: [1, 2, 3],
      timing: 'attackFlash',
      label: 'วางเพลงจากมือบนฟิลด์: สปิริตทีม ทไวไลท์โกธิค 1 ตัว BP+3000',
      if: { all: [{ handHas: SONG }, { allyHas: { team: TG } }] },
      steps: [{ do: 'songFromHand' }, { do: 'buffChosen', amount: 3000, ally: true, filter: { team: TG } }],
    },
  ],
  // [Lv2] "เมื่ออัญเชิญโดยเอฟเฟกต์ของสปิริตนี้ อัญเชิญได้ไม่เกิน 3 ใบ" = Flash ของ Lv2 อัญเชิญได้ 3 ใบ
  'เลยา-ควาโทร': [
    {
      kind: 'activated',
      levels: [1],
      timing: 'attackFlash',
      label: 'ทำลายสปิริตนี้: อัญเชิญ "เลยา-ควาโทร" [สเตจสไตล์] จากมือ/นอกมือ 1 ใบ',
      if: { handHas: { types: ['spirit'], nameIncludes: ['เลยา-ควาโทร'], family: STAGE, withShown: true } },
      steps: [{ do: 'destroySelf' }, { do: 'summonFromHandFree', filter: { types: ['spirit'], nameIncludes: ['เลยา-ควาโทร'], family: STAGE, withShown: true } }],
    },
    {
      kind: 'activated',
      levels: [2],
      timing: 'attackFlash',
      label: 'ทำลายสปิริตนี้: อัญเชิญ "เลยา-ควาโทร" [สเตจสไตล์] จากมือ/นอกมือ (ไม่เกิน 3 ใบ)',
      if: { handHas: { types: ['spirit'], nameIncludes: ['เลยา-ควาโทร'], family: STAGE, withShown: true } },
      steps: [{ do: 'destroySelf' }, { do: 'summonFromHandFree', max: 3, filter: { types: ['spirit'], nameIncludes: ['เลยา-ควาโทร'], family: STAGE, withShown: true } }],
    },
  ],
  มุโดเนีย: [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [may('วางเพลงจากมือบนฟิลด์: จั่ว 1 ใบ', [{ do: 'songFromHand' }, draw1], { handHas: SONG })] },
    {
      kind: 'activated',
      levels: [2],
      timing: 'attackFlash',
      label: 'ทำลายสปิริตนี้: อัญเชิญ "มุโดเนีย" [สเตจสไตล์] จากในมือ',
      if: { handHas: { types: ['spirit'], nameIncludes: ['มุโดเนีย'], family: STAGE } },
      steps: [{ do: 'destroySelf' }, { do: 'summonFromHandFree', filter: { types: ['spirit'], nameIncludes: ['มุโดเนีย'], family: STAGE, notShown: true } }],
    },
  ],
  มู: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3],
      steps: [may('แสดงใบบนสุดเด็ค 1 ใบ', [{ do: 'revealPickRestTrash', count: 1, filter: { types: ['spirit'], team: PA } }], { deckAtLeast: 1 })],
    },
  ],
  อัน: [
    {
      kind: 'replaceDestroy',
      levels: [2],
      subject: { inBattle: true },
      battle: true,
      auto: true,
      state: 'same',
      if: { all: [{ inUnit: true }, { attackStep: true }] },
    },
  ],
  โชโกะ: [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { inBattle: true },
      levels: [1, 2, 3],
      attackStepOnly: true,
      if: { inUnit: true },
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], maxCost: 3, team: PA } }],
    },
  ],
  'เซ็นโงคุฮิเมะ อุไท': [{ kind: 'trigger', on: 'attack', levels: [1, 2], steps: [{ do: 'draw', count: 1, per: { allies: { family: SENGOKU }, div: 2 } }] }],
  '[เทศกาลเพนต้น] ราเควล': [
    { kind: 'trigger', on: 'summon', levels: [1, 2, 3], steps: [{ do: 'voidCore', to: 'allAllies', count: 1, filter: { nameIncludes: ['เพนต้น'] } }] },
    { kind: 'destroyImmune', levels: [3], if: soulOnSelf, scope: { ownNamed: ['เพนต้น'] } },
  ],
  '[เมเนเจอร์มือฉมัง] ลิลี่': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        may('แสดงใบบนสุดเด็ค 4 ใบ', [{ do: 'revealPickEach', count: 4, filters: [{ types: ['spirit'], hasOnStage: true }, { types: ['brave'] }] }], {
          deckAtLeast: 1,
        }),
      ],
    },
    {
      kind: 'onStage',
      levels: [2],
      label: 'กลับไปใต้เด็คแทนการโจมตี: นำสปิริตทีม ไชนี่ฮาร์ท ในแทรชขึ้นมือ',
      if: { trashHas: { types: ['spirit'], team: SH } },
      steps: [{ do: 'returnFromTrash', filter: { types: ['spirit'], team: SH } }],
    },
  ],

  // ---------------------------------------------------------------- Spirit U
  '[เจ้าหญิงเสียงเพลงสีคราม] ไซกะ-อุนดีเน่': [
    { kind: 'blockWhileExhausted', levels: [1, 2], if: { all: [{ attackStep: true }, { oppTurn: true }] } },
    { kind: 'trigger', on: 'allyBlock', subject: { team: SH }, levels: [2], oppTurnOnly: true, attackStepOnly: true, steps: [{ do: 'voidCore', to: 'subject', count: 1 }] },
  ],
  'แคนดี้-ซาร์ด': [
    onStage([1, 2], 'แคนดี้-ซาร์ด'),
    { kind: 'trigger', on: 'onStage', levels: [1, 2], ownTurnOnly: true, steps: [{ do: 'voidCore', to: 'ally', count: 1 }] },
  ],
  '[สาวน้อยเซ็นโงคุ] เน-รันเทล': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }, { do: 'voidCore', to: 'self', count: 1, if: { songsAtLeast: 1 } }],
    },
  ],
  '[เจ้าหญิงน้อยฟูฟ่อง] เซฟี่-แอริส': [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { team: PA, bySpirit: true },
      levels: [1, 2, 3],
      oppTurnOnly: true,
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, per: { allies: { nameIncludes: ['เซฟี่-แอริส'] } } }],
    },
    soloPart([2, 3], 'เซฟี่-แอริส'),
  ],

  // ---------------------------------------------------------------- Spirit R
  '[เจ้าหญิงมังกรเซ็นโงคุ] ซีคฟรีด้า': [
    {
      kind: 'activated',
      levels: [1, 2, 3],
      timing: 'attackFlash',
      label: 'ย้าย Soul Core บนสปิริตทีม ไชนี่ฮาร์ท ไปสปิริตตัวอื่น',
      if: { allyHas: { team: SH, soul: true } },
      steps: [{ do: 'moveAllySoul', filter: { team: SH } }],
    },
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { team: SH, byOpponent: true },
      levels: [2, 3],
      attackStepOnly: true,
      if: soulOnSelf,
      steps: [{ do: 'gainLifeFromVoid', count: 1 }],
    },
  ],
  'เรย์-โอบะ': [
    onStage([1, 2], 'เรย์-โอบะ'),
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 3000 }, per: { allies: { team: SH } } }] },
  ],
  '[เจ้าหญิงทองคำ] โรส-เบอร์รี่': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { minCost: 8, family: STAGE },
      levels: [1, 2],
      ownTurnOnly: true,
      oncePerTurnByName: true,
      steps: [{ do: 'voidCore', to: 'self', count: 3 }],
    },
    soloPart([2], 'โรส-เบอร์รี่'),
  ],
  '[ราชินีกำแพงเหล็ก] รีเซ่-โดรมเวล': [
    { kind: 'selfCostIf', cost: 8, if: { allyHas: { nameIncludes: ['รีเซ่-โดรมเวล'] } } },
    { kind: 'effectImmune', levels: [2, 3], scope: { own: { team: ABS } }, colors: ['yellow', 'blue'], types: ULTRA },
  ],
  '[กุลสตรีแห่งสนธยา] เลยา-ควาโทร': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [
        may(
          'ทิ้งเพลงบนฟิลด์ 1 ใบ: แสดงใบบนสุดเด็ค 3 ใบ',
          [{ do: 'songToTrash' }, { do: 'revealSummon', count: 3, filter: { types: ['spirit'], team: TG }, max: 1, rest: 'trash' }],
          { all: [{ songsAtLeast: 1 }, { deckAtLeast: 1 }] },
        ),
      ],
    },
  ],
  'แจนนู-ดรานิเอส': [
    { kind: 'trigger', on: 'summon', levels: [1, 2, 3], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 }, per: { songs: true } }] },
    { kind: 'extraSteps', levels: [3], if: soulOnSelf, steps: ['refresh'], once: 'turn' },
  ],
  '[เจ้าหญิงสีดำที่น่าหลงใหล] ไดยะ-รูน': [
    myUnit([2, 3], 2, 'ส่งคอร์ 3 เม็ดบนสปิริตคู่แข่ง 1 ตัวลงรีเสิร์ฟ', [{ do: 'removeOpponentCores', count: 1, perPick: 3 }], {
      opponentHas: { types: SPIRITISH },
      withCores: true,
    }),
  ],
  '[ไอดอลดาวตก] อัน': [
    myUnit([1, 2], 1, 'สปิริตนี้ฟื้นสภาพ (เทิร์นละ 1 ครั้ง)', [{ do: 'markOnce', key: 'an' }, { do: 'refreshSelf' }], { onceFree: 'an' }),
  ],
  '[ไอดอลดาวรุ่ง] โชโกะ': [
    myUnit([1, 2, 3], 1, 'นำสปิริตทีม พริตตี้เอนิมอลส์ ในแทรชขึ้นมือ', [{ do: 'returnFromTrash', filter: { types: ['spirit'], team: PA } }], {
      trashHas: { types: ['spirit'], team: PA },
    }),
  ],
  '[เจ้าหญิงเสียงเพลงนักดาบศักดิ์สิทธิ์] ซึรุ': [
    {
      kind: 'activated',
      levels: [1, 2, 3],
      timing: 'attackFlash',
      label: 'ทิ้งเมจิคในมือ 1 ใบ: เอฟเฟกต์ของคู่แข่งบนสปิริต/อัลติเมทเรา 1 ตัวไร้ผล',
      if: { handHas: { types: ['magic'] } },
      steps: [{ do: 'discard', count: 1, filter: { types: ['magic'] } }, { do: 'cleanseAlly' }],
    },
    catalyzeYellow([2, 3]),
  ],
  'ไชนิ่ง-กันทัน': [
    { kind: 'trigger', on: 'summon', levels: [1, 2, 3], steps: [{ do: 'draw', count: 2 }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      if: soulOnSelf,
      steps: [
        { do: 'buffSelf', amount: 5000, per: { distinctTeams: true }, untilBattleEnd: true },
        { do: 'symbolThisTurn', color: 'yellow', count: 1, per: { distinctTeams: true }, untilBattleEnd: true },
      ],
    },
  ],

  // ---------------------------------------------------------------- Spirit M
  '[เจ้าหญิงดาวเทพ] โนอา-เฟลอร์': [
    soloPart([1, 2, 3], 'โนอา-เฟลอร์'),
    { kind: 'unblockableByCost', levels: [2, 3], attacker: { team: SH, soul: true }, maxCost: 7 },
  ],
  '[เจ้าหญิงเสียงเพลงเต็มพิกัด] แคนดี้-ซาร์ด': [
    soloPart([1, 2], 'แคนดี้-ซาร์ด'),
    { kind: 'blockLevelSum', levels: [2], attacker: { nameIncludes: ['แคนดี้-ซาร์ด'] }, minLevel: 4 },
  ],
  '[เจ้าหญิงเสียงผู้ร้อนแรง] โมโมะ-กิวมอนเจ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3],
      steps: [
        {
          do: 'when',
          if: { summonedByOnStage: true },
          steps: [{ do: 'opponentTotalBp', maxTotal: 15000, action: 'destroy' }],
          else: [{ do: 'opponentTotalBp', maxTotal: 15000, action: 'bounce' }],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [
        may(
          'นำสปิริต BP ไม่เกิน 10000 ของคู่แข่งกลับขึ้นมือ: สปิริตนี้เจ็มเหลือง +1',
          [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 10000 } }, { do: 'symbolThisTurn', color: 'yellow', count: 1, untilBattleEnd: true }],
          { opponentHas: { types: SPIRIT, maxBp: 10000 } },
        ),
      ],
    },
  ],
  '[หกเจ้าหญิงเซ็นโงคุ] มุโดเนีย': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        {
          do: 'when',
          if: { summonedBy: { nameIncludes: ['มุโดเนีย'], family: PRIVATE } },
          steps: [{ do: 'removeOpponentCores', count: 1, to: 'void', per: { songs: true } }],
        },
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'removeOpponentCores', count: 1, per: { allies: { team: TG } } }] },
  ],
  '[เจ้าหญิงเสียงเพลงแห่งการลงทัณฑ์] แจนนู-ดรานิเอส': [
    { kind: 'staticBp', levels: [1, 2, 3], scope: { own: { team: TG } }, amount: 5000 },
    { kind: 'extraSteps', levels: [3], if: { songsAtLeast: 5 }, steps: ['refresh', 'attack'], once: 'game' },
  ],
  '[ไอดอลดาวอันดับหนึ่ง] มู': [
    myUnit([1, 2, 3], 1, 'จั่ว 1 ใบ', [draw1]),
    myUnit([3], 2, 'สปิริตนี้เจ็มเหลือง +2', [{ do: 'symbolThisTurn', color: 'yellow', count: 2, untilBattleEnd: true }]),
  ],
  'เซ็นโงคุฮิเมะ ยูสึกิ': [
    {
      kind: 'burst',
      soul: true,
      on: 'afterAllyDestroyedByOpponent',
      alsoDepleted: true,
      steps: [{ do: 'debuffChosenOpponent', amount: 20000, filter: { types: SPIRIT }, exhaustAtZero: true }, { do: 'summonThisFree' }],
    },
    { kind: 'burstOnDiscard' },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [{ do: 'bounceOpponent', filter: { types: ['nexus'] }, to: 'deckTop' }] },
  ],

  // ---------------------------------------------------------------- Spirit X
  '[นางฟ้าจรัสแสง] เรย์-โอบะ': [
    [
      { kind: 'braveSlots', levels: [1, 2, 3], count: 2, allies: { team: SH } },
      { kind: 'trigger', on: 'allySummoned', subject: { team: SH, byOnStage: true }, levels: [1, 2, 3], steps: [{ do: 'braveFromField', max: 2 }] },
    ],
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { team: SH },
      levels: [2, 3],
      ownTurnOnly: true,
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, to: 'deckBottom', per: { subjectBraves: true } }],
    },
  ],
  'รีเซ่-โดรมเวล': [
    { kind: 'onStageReplace', levels: [1, 2, 3], if: soulOnSelf },
    { kind: 'effectImmune', levels: [3], scope: { ownFamily: PRIVATE }, types: ['spirit', 'ultimate'] },
  ],
  '[เทพีแห่งเซ็นโงคุ] ไดอาน่า-เฟลอร์': [
    soloPart([1, 2, 3], 'ไดอาน่า-เฟลอร์'),
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH }, per: { songs: true, div: 2 } }] },
  ],
  'เซ็นโงคุฮิเมะ มาคินะ': [
    { kind: 'burst', soul: true, on: 'afterOpponentSummonEffect', steps: [{ do: 'returnSubjectToDeck' }, { do: 'summonThisFree' }] },
    { kind: 'extraSymbol', levels: [3], color: 'yellow', count: 1, allies: { families: [DIVA, SENGOKU] } },
  ],
  '[เจ้าหญิงเย้ายวนเซ็นโงคุ] แบล็คสเตอร์': [
    { kind: 'trigger', on: 'summon', levels: [1, 2, 3], steps: [{ do: 'draw', count: 1, per: { allies: { family: DIVA } } }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT } },
        may(
          'ส่ง Soul Core ลงแทรช: อัญเชิญสปิริตเผ่า [ดีว่า] จากในมือไม่จ่ายคอสต์',
          [{ do: 'soulToTrash' }, { do: 'summonFromHandFree', filter: { types: ['spirit'], family: DIVA, notShown: true } }],
          { all: [soulOnSelf, { handHas: { types: ['spirit'], family: DIVA } }] },
        ),
      ],
    },
  ],
  'เจ้าหญิงเสียงเพลงแห่งความงดงามเจ็ดประการ โมโมะเนะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2, 3],
      steps: [
        { do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 7000 } },
        { do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 3000 } },
      ],
    },
    { kind: 'trigger', on: 'attack', levels: [2, 3], if: soulOnSelf, oncePerTurn: true, steps: [{ do: 'refreshSelf' }] },
  ],
  'ขุนพลน่ารักที่สุดรุ่นที่เจ็ด มาโกะอิจิ': [
    {
      kind: 'trigger',
      zone: 'hand',
      on: 'allyDestroyed',
      subject: { family: DIVA, bySpirit: true },
      levels: [],
      steps: [may('อัญเชิญการ์ดนี้ไม่จ่ายคอสต์: ทำลายสปิริตคู่แข่งที่ทำลายสปิริตเรา', [{ do: 'summonCardFree', which: 'self', then: [{ do: 'destroyDestroyer' }] }])],
    },
    {
      kind: 'trigger',
      on: 'oppMagicUse',
      levels: [3],
      oppTurnOnly: true,
      steps: [may('ส่ง Soul Core ลงแทรช: เอฟเฟกต์ของเมจิคนั้นไร้ผล', [{ do: 'soulToTrash' }, { do: 'negateSubjectMagic' }], soulOnSelf)],
    },
  ],
  'สาวน้อยสงครามแห่งวิญญาณซื่อตรง มิสุโนะ': [
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [1, 2, 3, 4],
      steps: [{ do: 'disableChosenOpponent', filter: { types: SPIRITISH }, per: { allies: { families: [DIVA, SENGOKU] } } }],
    },
    { kind: 'extraSymbol', levels: [2, 3, 4], color: 'yellow', count: 1, if: { alliesMatchAtLeast: { filter: { families: [DIVA, SENGOKU] }, count: 4 } } },
  ],

  // ---------------------------------------------------------------- Brave
  ชุดตุ๊กตาฟูริน: [{ kind: 'trigger', on: 'destroyedByOpponent', granted: true, levels: [], steps: [{ do: 'returnFromTrash', filter: { types: ['magic'] } }] }],
  พัดแห่งบุปผาศึกซากุระ: [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        may(
          'ส่ง Soul Core ลงแทรช: ฟื้นสภาพสปิริตทีมเดียวกัน 1 ตัว',
          [{ do: 'soulToTrash' }, { do: 'refreshChosenAlly', filter: { sameTeamAs: 'self', notSelf: true } }],
          { all: [soulOnSelf, { otherAllyHas: { sameTeamAs: 'self', state: 'exhausted' } }] },
        ),
      ],
    },
  ],
  ปิ่นปักผมแห่งบุปผาดารา: [
    { kind: 'trigger', zone: 'hand', on: 'allyOnStage', levels: [], steps: [may('อัญเชิญเบรฟนี้ไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])] },
    { kind: 'staticBp', granted: true, levels: [], scope: { sameTeam: true }, amount: 3000 },
  ],
  เซ็นโงคุโทรฟี่: [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        { do: 'buffSelf', amount: 5000, untilBattleEnd: true },
        { do: 'when', if: { selfIs: { family: DIVA } }, steps: [{ do: 'bounceOpponent', filter: { types: ['nexus'] }, to: 'deckBottom' }] },
      ],
    },
  ],

  // ---------------------------------------------------------------- Magic (ไทป์: เพลง)
  ปาฏิหาริย์ที่เอ่อล้น: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        draw1,
        { do: 'when', if: { paidWithSoul: true }, steps: [{ do: 'handCostThisTurn', filter: { types: ['spirit'], family: DIVA }, delta: -1 }] },
        song,
      ],
    },
  ],
  'เนเวอร์อเกน อีกครั้ง': [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'blockExhaustedThisTurn', filter: { family: DIVA } },
        { do: 'when', if: { paidWithSoul: true }, steps: [{ do: 'buffChosen', amount: 3000, ally: true }] },
        song,
      ],
    },
  ],
  'จงคุกเข่า เอฟวรี่วัน': [{ kind: 'magic', timing: 'flash', steps: [{ do: 'lifeShieldThisTurn', minCost: 4 }, song] }],
  บทเพลงวิญญาณสงครามอลวน: [
    { kind: 'burst', soul: true, on: 'afterLifeLost', steps: [{ do: 'gainLifeFromVoid', count: 1 }, { do: 'songToTrash', opponent: true }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'debuffChosenOpponent', amount: 10000, filter: { types: SPIRITISH }, destroyAtZero: true }, song] },
  ],

  // ---------------------------------------------------------------- Nexus
  'เซ็นโงคุเฟส เมนสเตอ': [
    {
      kind: 'trigger',
      on: 'ownAttackStepStart',
      levels: [1, 2],
      steps: [
        may('ทิ้งสปิริตเผ่า [สเตจสไตล์] ในมือ 1 ใบ: จั่ว 1 ใบ', [{ do: 'discard', count: 1, filter: { types: ['spirit'], family: STAGE } }, draw1], {
          handHas: { types: ['spirit'], family: STAGE },
        }),
      ],
    },
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { family: PRIVATE },
      levels: [2],
      ownTurnOnly: true,
      mainStepOnly: true,
      steps: [{ do: 'returnFromTrash', filter: { types: ['spirit'], family: STAGE, sameTeamAs: 'subject' } }],
    },
  ],
  แอปโซลูทสเตอแห่งอารมณ์เร่าร้อน: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [may('แสดงใบบนสุดเด็ค 2 ใบ', [{ do: 'revealPickRestTrash', count: 2, filter: { types: ['spirit'], team: ABS }, rest: 'top' }], { deckAtLeast: 1 })],
    },
    { kind: 'trigger', on: 'allyAttack', subject: { card: { hasSoloPart: true } }, levels: [2], ownTurnOnly: true, steps: [{ do: 'exhaustOpponent', count: 1 }] },
  ],
  ไชนี่ฮาร์ทสเตอแห่งมายาฝัน: [
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { team: SH },
      levels: [1, 2],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'returnFromTrash', filter: { types: ['brave'] } }],
    },
    { kind: 'staticBp', levels: [2], if: { ownAttackStep: true }, scope: { own: { hasSoloPart: true, soul: true } }, amount: 10000 },
  ],
  ทไวไลท์โกธิคสเตอแห่งคนึงหายามราตรี: [
    {
      kind: 'drawStep',
      levels: [1, 2],
      extraDraw: [],
      before: [
        may('แทนการจั่ว: นำเพลงจากแทรช/บนฟิลด์ขึ้นมือ 1 ใบ', [{ do: 'songToHand' }, { do: 'addDrawStepDraw', amount: -1 }], or({ trashHas: SONG }, { songsAtLeast: 1 })),
      ],
    },
    { kind: 'staticBp', levels: [2], scope: { own: { team: TG } }, amount: 2000, perSongs: true },
  ],
};
