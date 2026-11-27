/**
 * สคริปต์เอฟเฟกต์ของชุด BSC04 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BSC18: ธีมดีว่า ทีมไชนี่ฮาร์ท / แอปโซลูท / พริตตี้เอนิมอลส์ / ทไวไลท์โกธิค / ลีเจนด์ดอล)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 * On Stage / ทีม / นอกมือ / เพลง / My Unit = กลไกจาก BS07 (ดู bs07-scripts.ts)
 * BSC04: trigger unitFormed ("เมื่อนำ X มาวางชิดด้วย My Unit") / placedInUnit ("เมื่อสปิริตนี้ถูกนำไปวางชิดด้วย My Unit") / allyUnitFormed ("เมื่อสปิริตของเราใช้ My Unit")
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

const DIVA = 'ดีว่า';
const STAGE = 'สเตจสไตล์';
const PRIVATE = 'ไพรเวทแวร์';
const SH = 'ไชนี่ฮาร์ท';
const ABS = 'แอปโซลูท';
const PA = 'พริตตี้เอนิมอลส์';
const TG = 'ทไวไลท์โกธิค';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const draw1: Step = { do: 'draw', count: 1 };
const attackStep: Condition = { attackStep: true };
const hasSong: Condition = { songsAtLeast: 1 };
/** สปิริตของเราที่ตรงตัวกรองตั้งแต่ N ตัว */
const allies = (filter: CardFilter, count: number): Condition => ({ alliesMatchAtLeast: { filter: { types: SPIRIT, ...filter }, count } });
const SONG: CardFilter = { types: ['magic'], magicType: 'เพลง' };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
/** "หลังจากนั้น, สามารถนำการ์ดเมจิคนี้ไปวางบนฟิลด์เราได้" (เพลง) */
const song: Step = {
  do: 'chooseOne',
  options: [
    { label: 'วางการ์ดเมจิคนี้บนฟิลด์ (เพลง)', steps: [{ do: 'placeThisSong' }] },
    { label: 'ไม่วาง (ลงแทรช)', steps: [] },
  ],
};

/**
 * On Stage แอทแท็คสเต็ปของเรา: สปิริตนี้สามารถกลับไปใต้เด็คแทนการโจมตี
 * เพื่ออัญเชิญไม่จ่ายคอสต์ "<ชื่อ>" เผ่า [สเตจสไตล์] จากในมือ/นอกมือของเรา 1 ใบ และจั่วการ์ด N ใบ
 * also = การ์ดที่อัญเชิญได้แทน (โลล่า-เบียคุรัน Lv2: การ์ดสปิริตเผ่า [สเตจสไตล์] ทีม ไชนี่ฮาร์ท)
 */
const onStage = (levels: number[], name: string, opts: { draw?: number; also?: CardFilter } = {}): ScriptAbility => {
  const target: CardFilter = opts.also
    ? { types: ['spirit'], family: STAGE, withShown: true, anyOf: [{ nameIncludes: [name] }, opts.also] }
    : { types: ['spirit'], nameIncludes: [name], family: STAGE, withShown: true };
  const n = opts.draw ?? 1;
  return {
    kind: 'onStage',
    keyword: true,
    levels,
    label: `On Stage: อัญเชิญ "${name}"${opts.also ? ' / สปิริตทีม ไชนี่ฮาร์ท' : ''} [สเตจสไตล์] + จั่ว ${n} ใบ`,
    if: { handHas: { ...target, withShown: true } },
    steps: [{ do: 'summonFromHandFree', filter: target }, { do: 'draw', count: n }],
  };
};

/** My Unit N: ต้องมีสปิริตเผ่า [ดีว่า] ที่ฟื้นสภาพของเรา N ตัว (ไม่นับตัวนี้) */
const unit = (n: number): Condition => ({ alliesMatchAtLeast: { filter: { family: DIVA, state: 'refresh', notSelf: true }, count: n } });
/** My Unit : N เมื่อสปิริตนี้โจมตี (on: 'block' = เมื่อสปิริตนี้ป้องกัน) */
const myUnit = (levels: number[], n: number, label: string, steps: Step[], opts: { on?: 'attack' | 'block'; cond?: Condition } = {}): ScriptAbility => ({
  kind: 'trigger',
  on: opts.on ?? 'attack',
  levels,
  steps: [may(`My Unit ${n}: ${label}`, [{ do: 'myUnit', count: n }, ...steps], opts.cond ? { all: [unit(n), opts.cond] } : unit(n))],
});
/** "เมื่อสปิริตนี้ถูกนำไปวางชิดด้วย My Unit" (subject = สปิริตของเราที่โจมตีอยู่) */
const placed = (levels: number[], steps: Step[]): ScriptAbility => ({ kind: 'trigger', on: 'placedInUnit', levels, ownTurnOnly: true, attackStepOnly: true, steps });
/** "เมื่อนำ <ตัวกรอง> มาวางชิดด้วย My Unit" (ทำงานครั้งเดียวต่อ My Unit) */
const unitWith = (levels: number[], subject: { nameIncludes?: string[]; family?: string }, steps: Step[]): ScriptAbility => ({
  kind: 'trigger',
  on: 'unitFormed',
  subject,
  levels,
  oncePerBatch: true,
  steps,
});
/** "ในเทิร์นนี้, สปิริต/อัลติเมทของคู่แข่ง N ตัว BP-X. ทำลายสปิริต/อัลติเมทที่กลายเป็น BP0 โดยเอฟเฟกต์นี้" */
const bpDown = (amount: number, count = 1, destroy = true): Step => ({ do: 'debuffChosenOpponent', amount, filter: { types: SPIRITISH }, ...(count > 1 ? { count } : {}), ...(destroy ? { destroyAtZero: true } : {}) });
/** สปิริตของเราเผ่า/ตัวกรองนี้ เมื่อถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง สามารถอยู่ต่อในรูปแบบเสื่อมสภาพ */
const stayExhausted = (levels: number[], subject: { families?: string[]; maxCost?: number }): ScriptAbility => ({
  kind: 'replaceDestroy',
  levels,
  subject: { types: SPIRIT, ...subject },
  state: 'exhausted',
});

export const BSC04_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- ไชนี่ฮาร์ท
  '[ออเรนจ์สไมล์] รัน-เบลเซีย': [
    myUnit(ALL2, 1, 'ทำลายสปิริต BP ไม่เกิน 3000 ของคู่แข่ง 1 ตัว', [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 3000 } }]),
    unitWith([2], { nameIncludes: ['ราบี้-ดาริน'] }, [{ do: 'battleUnblockable', by: 'ultimates' }]),
  ],
  '[กรีนบัมบีน่า] ราบี้-ดาริน': [
    myUnit(ALL3, 1, 'จั่ว 1 ใบ', [draw1]),
    unitWith(L23, { nameIncludes: ['รัน-เบลเซีย'] }, [{ do: 'battleUnblockable', by: 'spirits' }]),
  ],
  '[เกรย์แองเจิล] ซายะ-ไชน์': [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'summonThisFree' }, { do: 'blockExhaustedThisTurn', filter: {}, all: true }] },
    myUnit(L23, 1, 'สปิริตนี้ BP+5000', [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }], { on: 'block' }),
  ],
  'โลล่า-เบียคุรัน': [
    onStage([1], 'โลล่า-เบียคุรัน'),
    // Lv2-3: การ์ดที่อัญเชิญด้วย On Stage เปลี่ยนเป็นสปิริตเผ่า [สเตจสไตล์] ทีม ไชนี่ฮาร์ท ได้ (รวม On Stage ของบรรทัดแรกที่ Lv2-3 ไว้ที่นี่)
    onStage(L23, 'โลล่า-เบียคุรัน', { also: { team: SH } }),
  ],
  '[เพอร์เพิลไทเกอร์] โลล่า-เบียคุรัน': [
    myUnit(ALL3, 1, 'ในเทิร์นนี้ สปิริต/อัลติเมทของคู่แข่ง 1 ตัว BP-3000', [bpDown(3000, 1, false)]),
    // ได้รับ "[เมื่อสปิริตนี้โจมตี] คู่แข่งจะสั่งใช้เบิร์สไม่ได้" = เมื่อสปิริตเผ่า [ดีว่า] ของเราโจมตี
    { kind: 'trigger', on: 'allyAttack', subject: { family: DIVA }, levels: L23, ownTurnOnly: true, steps: [{ do: 'battleNoBurst' }] },
  ],
  'โปรอน-ซาจิต้า': [
    onStage(ALL3, 'โปรอน-ซาจิต้า'),
    placed(L23, [may('ระบุสปิริตของคู่แข่ง 1 ตัว แล้วโจมตีสปิริตนั้น', [{ do: 'chooseBlockers', filter: { types: SPIRIT }, direct: true }], { opponentHas: { types: SPIRIT } })]),
  ],
  '[คริมสันชูตเตอร์] โปรอน-ซาจิต้า': [
    myUnit(ALL3, 2, 'ทำลายสปิริต/อัลติเมท BP ไม่เกิน 10000 ของคู่แข่ง 2 ตัว', [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH, maxBp: 10000 }, count: 2 }]),
    { kind: 'staticBp', levels: L23, scope: { own: { types: SPIRIT, team: SH } }, amount: 5000 },
  ],

  // ---------------------------------------------------------------- แอปโซลูท
  '[ไตรเซเลอร์] เดริส-เพลทิโอ': [
    { kind: 'trigger', on: 'allySummoned', subject: { team: ABS, byOnStage: true }, levels: ALL3, ownTurnOnly: true, attackStepOnly: true, steps: [bpDown(5000)] },
  ],
  '[อินโนเซนต์เวฟ] มิเรีย-ซันเดย์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'songToTrash', opponent: true }, { do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }] },
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { family: DIVA, byOpponent: true },
      levels: L23,
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'summonFromTrashFree', filter: { types: ['spirit'] }, belowSubjectCost: true, noTriggers: true }],
    },
  ],
  '[สแปลชแดนเซอร์] ฟงนีน่า': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [draw1] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'opponentTotalBp', maxTotal: 10000, action: 'noBlock', filter: { types: SPIRITISH } }] },
  ],
  'โรส-เบอร์รี่': [
    // จั่ว +2 ใบ (บรรทัดถัดไป) รวมไว้ใน On Stage นี้
    onStage(ALL3, 'โรส-เบอร์รี่', { draw: 3 }),
    { kind: 'textOnly', levels: ALL3 },
  ],
  '[ไอดอลควีน] โรส-เบอร์รี่': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'voidCore', to: 'self', count: 1 }, when({ summonedByOnStage: true }, [{ do: 'voidCore', to: 'self', count: 2 }])] },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT }, per: { allies: { types: SPIRIT, team: ABS } } }] },
  ],
  'การ์เน็ต-รูตี้': [
    onStage(ALL3, 'การ์เน็ต-รูตี้'),
    { kind: 'trigger', on: 'oppExhausted', levels: L23, ownTurnOnly: true, attackStepOnly: true, steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
  ],
  '[นางรำแห่งสายลมหอม] การ์เน็ต-รูตี้': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [when({ summonedByOnStage: true }, [{ do: 'exhaustOpponent', count: 3, filter: { types: SPIRITISH } }])] },
    { kind: 'trigger', on: 'allyBlocked', subject: { team: ABS }, levels: [3], ownTurnOnly: true, steps: [{ do: 'refreshSubject' }] },
  ],

  // ---------------------------------------------------------------- พริตตี้เอนิมอลส์
  'เลโอน่า-ไลค์บูม': [placed(ALL3, [draw1])],
  '[ไลอ้อนขี้อาย] เลโอน่า-ไลค์บูม': [
    myUnit(ALL3, 2, 'เปิดใบบนสุดเด็ค: สปิริตทีม พริตตี้เอนิมอลส์ อัญเชิญไม่จ่ายคอสต์ได้', [
      { do: 'revealSummon', count: 1, filter: { types: ['spirit'], team: PA }, max: 1, rest: 'bottom' },
    ]),
    { kind: 'trigger', on: 'allyExhausted', subject: { team: PA, minCost: 6, other: true }, levels: [3], steps: [{ do: 'refreshSelf' }] },
  ],
  'เวนดี้-เคท': [placed(L23, [{ do: 'mustBlock', subject: true }])],
  '[พาวเวอร์ฟูลด็อก] เวนดี้-เคท': [
    myUnit(ALL3, 1, 'ทำลายสปิริต BP ไม่เกิน 5000 ของคู่แข่ง 1 ตัว', [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } }]),
    { kind: 'maxLevelAllies', levels: L23, filter: { types: SPIRIT }, if: allies({ team: PA }, 5) },
  ],
  'ไดยะ-รูน': [placed([2], [{ do: 'symbolThisTurn', color: 'yellow', count: 1, untilBattleEnd: true, target: 'subject' }])],
  '[เลดี้คร็อกโคไดล์] ไดยะ-รูน': [
    myUnit(ALL3, 1, 'นำคอร์วอยด์ 1 เม็ดวางบนสปิริตนี้', [{ do: 'voidCore', to: 'self', count: 1 }]),
    stayExhausted([3], { families: [STAGE] }),
  ],
  'เซฟี่-แอริส': [{ kind: 'summonExhausted', levels: ALL3, filter: { types: ['spirit'], minCost: 6, notFamilies: [DIVA] } }],
  '[ปุยปุยแกะน้อย] เซฟี่-แอริส': [
    { kind: 'staticBp', levels: ALL3, scope: { own: { types: SPIRIT, team: PA } }, amount: 3000 },
    {
      kind: 'trigger',
      on: 'allyWonBattle',
      levels: L23,
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, family: DIVA } }],
    },
  ],
  ชูว: [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], family: PRIVATE }, max: 3, noTriggers: true }] },
    placed(L23, [{ do: 'battleUnblockableLevel', level: 2 }, { do: 'battleUnblockableLevel', level: 3 }]),
  ],
  '[คาวเกิร์ล] ชูว': [myUnit(L23, 2, 'นำสปิริตคอสต์ไม่เกิน 5 ของคู่แข่ง 2 ตัวกลับขึ้นมือ', [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxCost: 5 }, count: 2 }])],

  // ---------------------------------------------------------------- ทไวไลท์โกธิค
  'แคธี่-เรม': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        may(
          'เปิดการ์ดบนสุดเด็ค (ต่อเจ็มเหลือง 1 เม็ด 1 ใบ): นำเมจิคไทป์ [เพลง] 1 ใบขึ้นมือ',
          [{ do: 'revealPickRestTrash', count: 1, per: { ownSymbols: 'yellow' }, filter: SONG, rest: 'bottom' }],
          { deckAtLeast: 1 },
        ),
      ],
    },
  ],
  '[ราชินีขั้วโลกเหนือ] แคธี่-เรม': [
    { kind: 'staticBp', levels: ALL2, if: attackStep, scope: { own: { types: SPIRIT, team: TG } }, amount: 2000 },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [draw1, { do: 'discard', count: 1 }, when(hasSong, [draw1])] },
  ],
  'เน-รันเทล': [
    {
      kind: 'trigger',
      zone: 'hand',
      on: 'allyDestroyed',
      subject: { family: DIVA, byOpponent: true },
      levels: [],
      steps: [may('อัญเชิญ เน-รันเทล จากในมือไม่จ่ายคอสต์', [{ do: 'summonCardFree', which: 'self' }])],
    },
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [may('นำการ์ดเมจิคไทป์ [เพลง] บนฟิลด์/ในแทรช 1 ใบขึ้นมือ', [{ do: 'songToHand' }])] },
  ],
  '[สตรีแห่งหินออบซิเดียน] เน-รันเทล': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxBpSelf: true } }, when(hasSong, [{ do: 'battleUnblockable', by: 'spirits' }])] },
    myUnit(L23, 1, 'สปิริตนี้ BP+10000', [{ do: 'buffSelf', amount: 10000, untilBattleEnd: true }]),
  ],
  'ไดอาน่า-เฟลอร์': [
    { kind: 'staticBp', levels: ALL3, if: attackStep, scope: { own: { types: SPIRIT, team: TG, battlingTypes: ['ultimate'] } }, amount: 10000 },
    {
      kind: 'trigger',
      on: 'ownAttackStepStart',
      levels: L23,
      steps: [
        may(
          'ทิ้งเพลงบนฟิลด์: อัญเชิญ "ไดอาน่า-เฟลอร์" [สเตจสไตล์] จากมือ/นอกมือ แล้วสปิริตนี้ไปใต้สุดเด็ค',
          [{ do: 'songToTrash' }, { do: 'summonFromHandFree', filter: { types: ['spirit'], nameIncludes: ['ไดอาน่า-เฟลอร์'], family: STAGE, withShown: true } }, { do: 'selfToDeckBottom' }],
          { all: [hasSong, { handHas: { types: ['spirit'], nameIncludes: ['ไดอาน่า-เฟลอร์'], family: STAGE, withShown: true } }] },
        ),
      ],
    },
  ],
  '[เทพธิดาสีดำสนิท] ไดอาน่า-เฟลอร์': [
    {
      kind: 'trigger',
      on: 'allyWonBattle',
      subject: { team: TG },
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [may('ระบุสปิริต/อัลติเมทของคู่แข่ง 1 ตัว แล้วโจมตีตัวนั้น', [{ do: 'chooseBlockers', filter: { types: SPIRITISH }, direct: true }], { opponentHas: { types: SPIRITISH } })] },
    { kind: 'oppNoBraveSpirit', levels: [3] },
  ],
  '[วันหยุดใต้แสงลอดใบไม้] เซน่า-ริวมิน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        may(
          'เปิดการ์ดบนสุดเด็ค 3 ใบ: นำสปิริตเผ่า [ไพรเวทแวร์]/[สเตจสไตล์] 1 ใบขึ้นมือ',
          [{ do: 'revealPickRestTrash', count: 3, filter: { types: ['spirit'], families: [PRIVATE, STAGE] }, rest: 'top' }],
          { deckAtLeast: 1 },
        ),
      ],
    },
  ],
  '[สายลมอ่อนยามราตรีมืด] เซน่า-ริวมิน': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'bounceOpponent', filter: { types: ['nexus'] } }] },
    { kind: 'trigger', on: 'endStep', levels: L23, steps: [when(hasSong, [{ do: 'trashCoresSpread' }])] },
  ],
  'ไม-อาสึกะ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [{ do: 'disableChosenOpponent', filter: { types: SPIRIT }, countPerAllyFamily: PRIVATE, blockOnly: true }],
    },
  ],
  '[เจ้าหญิงมายา] ไม-อาสึกะ': [
    { kind: 'trigger', on: 'attack', levels: [1, 2, 3, 4], steps: [may('ทิ้งเพลงบนฟิลด์ 1 ใบ: สปิริตนี้ฟื้นสภาพ', [{ do: 'songToTrash' }, { do: 'refreshSelf' }], hasSong)] },
    { kind: 'trigger', on: 'attack', levels: [3, 4], steps: [when(hasSong, [{ do: 'battleDestroyedCoresToVoid' }])] },
  ],

  // ---------------------------------------------------------------- ลีเจนด์ดอล / อื่น ๆ
  'นักร้อง โรเมด้า': [
    stayExhausted(ALL3, { maxCost: 3 }),
    {
      kind: 'trigger',
      on: 'summon',
      levels: L23,
      steps: [
        may('ทิ้งการ์ดสปิริตเผ่า [ดีว่า] ในมือ 1 ใบ: จั่ว 2 ใบ (เทิร์นละ 1 ครั้ง)', [{ do: 'markOnce', key: 'romeda' }, { do: 'discard', count: 1, filter: { types: ['spirit'], family: DIVA } }, { do: 'draw', count: 2 }], {
          all: [{ onceFree: 'romeda' }, { handHas: { types: ['spirit'], family: DIVA } }],
        }),
      ],
    },
  ],
  'นักร้อง คาน่อน': [
    { kind: 'burst', on: 'afterLifeLost', steps: [when({ lifeAtMost: 3 }, [bpDown(10000)]), { do: 'summonThisFree' }] },
    { kind: 'trigger', on: ['attack', 'block'], levels: L23, steps: [bpDown(5000)] },
  ],
  '[ท็อปไอดอล] ทริคสเตอร์': [
    myUnit(ALL3, 2, 'ในเทิร์นนี้ สปิริต/อัลติเมทของคู่แข่ง 2 ตัว BP-5000', [bpDown(5000, 2, false)]),
    [
      unitWith(L23, { family: PRIVATE }, [{ do: 'bounceOpponent', filter: { types: SPIRITISH, maxBp: 5000 }, to: 'deckBottom' }]),
      unitWith(L23, { family: STAGE }, [{ do: 'symbolThisTurn', color: 'yellow', count: 1, untilBattleEnd: true }]),
    ],
  ],
  '[อัลติเมทสไตล์] ราเควล': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3, 4, 5],
      steps: [
        {
          do: 'uTrigger',
          then: [
            {
              do: 'debuffChosenOpponent',
              amount: 10000,
              filter: { types: SPIRITISH },
              untilBattleEnd: true,
              zeroThen: [{ do: 'summonFreeHandOrTrash', filter: { types: ['spirit'], family: DIVA, withShown: true }, max: 1, zones: ['shown', 'trash'] }],
            },
          ],
        },
      ],
    },
  ],

  // ---------------------------------------------------------------- เบรฟ
  ชุดซานต้า: [
    [
      { kind: 'extraSymbol', granted: true, levels: [], color: 'yellow', count: 1, if: { all: [{ ownAttackStep: true }, { selfFamily: STAGE }] } },
      { kind: 'familyAlso', granted: true, levels: [], family: STAGE, if: { all: [{ ownAttackStep: true }, { selfFamily: PRIVATE }] } },
    ],
  ],
  'โกลเด้นวิง V': [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [draw1, { do: 'disableChosenOpponent', filter: { types: SPIRITISH, maxBp: 6000 }, blockOnly: true }],
    },
  ],

  // ---------------------------------------------------------------- เน็กซัส
  'เวลคัม ทู เพนต้นแลนด์': [
    { kind: 'trigger', on: 'allyDestroyed', subject: { family: DIVA, byOpponent: true }, levels: ALL2, attackStepOnly: true, steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    { kind: 'trigger', on: 'allyDestroyed', subject: { family: DIVA, byOpponent: true }, levels: [2], attackStepOnly: true, steps: [draw1] },
  ],
  แบ็คสเตจ: [
    { kind: 'onStageReplace', levels: ALL2, exhaustSelf: true },
    { kind: 'lifeDamageCap', levels: [2], minSymbols: 2 },
  ],
  กาแล็กซี่เอ็กซ์โป: [
    { kind: 'coreLock' },
    { kind: 'trigger', on: 'allyUnitFormed', levels: ALL2, attackStepOnly: true, steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    { kind: 'trigger', on: 'startStep', levels: [2], steps: [may('นำคอร์ 10 เม็ดบนเน็กซัสนี้ไปวอยด์: เราชนะเกม', [{ do: 'selfCoresToTrash', count: 10, to: 'void' }, { do: 'winGame' }], { selfCoresAtLeast: 10 })] },
  ],

  // ---------------------------------------------------------------- เมจิค
  คอสตูมเชนจ์: [
    {
      kind: 'burst',
      on: 'afterAllyDestroyedByOpponent',
      steps: [{ do: 'subjectToHand', if: { subjectIs: { types: ['spirit'], family: DIVA } } }, { do: 'payToUseFlash' }],
    },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'separateOwnBrave' }, { do: 'braveFromHandOnto', filter: { color: 'yellow' }, host: { family: DIVA } }],
    },
  ],
  ฮีลลิ่งเมโลดี้: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'endAttackStepIfAfterBattle', if: { lifeAtMost: 2 } }, song] }],
  แองเจิลจอมซน: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'revealSummon', count: 2, filter: { types: ['spirit'], family: DIVA }, max: 1, rest: 'trash', noTriggers: true }, song] },
  ],
  'คิวท์×คิวท์': [
    {
      kind: 'magic',
      timing: 'main',
      steps: [{ do: 'showFromHandAny', filter: { types: ['spirit'], family: DIVA }, then: [{ do: 'draw', count: 1, per: { shownByThis: true } }] }, song],
    },
  ],
  ดีว่าซิมโฟนี: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'separateOpponentBraves' }, bpDown(7000), song] }],
};
