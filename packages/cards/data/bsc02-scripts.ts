/**
 * สคริปต์เอฟเฟกต์ของชุด BSC02 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BSC16: ธีมดีว่า ทีมไชนี่ฮาร์ท / แอปโซลูท / ลีเจนด์ดอล)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 * On Stage / ทีม / นอกมือ = กลไกจาก BS07 (ดู bs07-scripts.ts)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

type ScriptAbility = Exclude<CardScript[number], null | unknown[]>;

const DIVA = 'ดีว่า';
const STAGE = 'สเตจสไตล์';
const PRIVATE = 'ไพรเวทแวร์';
const SH = 'ไชนี่ฮาร์ท';
const ABS = 'แอปโซลูท';
/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const draw1: Step = { do: 'draw', count: 1 };
const attackStep: Condition = { attackStep: true };
const ownAttackStep: Condition = { ownAttackStep: true };
const oppAttackStep: Condition = { all: [{ attackStep: true }, { oppTurn: true }] };
/** สปิริตของเราที่ตรงตัวกรองตั้งแต่ N ตัว */
const allies = (filter: CardFilter, count: number): Condition => ({ alliesMatchAtLeast: { filter: { types: SPIRIT, ...filter }, count } });
/** สปิริตของเราที่ตรงตัวกรอง ชื่อการ์ดต่างกันตั้งแต่ N ตัว */
const distinct = (filter: CardFilter, count: number): Condition => ({ alliesMatchAtLeast: { filter: { types: SPIRIT, ...filter }, count, distinctNames: true } });

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });

/**
 * On Stage แอทแท็คสเต็ปของเรา: สปิริตนี้สามารถกลับไปใต้เด็คแทนการโจมตี
 * เพื่ออัญเชิญไม่จ่ายคอสต์ "<ชื่อ>" เผ่า [สเตจสไตล์] จากในมือ/นอกมือของเรา 1 ใบ และจั่วการ์ด 1 ใบ (แบบเดียวกับ BS07)
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
/** เปิดใบบนสุดเด็ค 1 ใบ: ถ้าเป็นสปิริตทีมนี้คอสต์ไม่เกิน N สามารถอัญเชิญไม่จ่ายคอสต์ ไม่งั้นกลับใต้สุดเด็ค */
const revealTeamSummon = (team: string, maxCost: number): Step => ({ do: 'revealSummon', count: 1, filter: { types: ['spirit'], team, maxCost }, max: 1, rest: 'bottom' });

export const BSC02_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- ไชนี่ฮาร์ท
  'รัน-เบลเซีย': [
    onStage(ALL2, 'รัน-เบลเซีย'),
    { kind: 'staticBp', levels: [2], if: attackStep, scope: { ownNamed: ['เซน่า-ริวมิน', 'โนอา-เฟลอร์'] }, amount: 2000 },
  ],
  '[สไมล์เกิร์ล] รัน-เบลเซีย': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [when({ summonedByOnStage: true }, [draw1, { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }])],
    },
    { kind: 'trigger', on: 'destroyedByOpponent', levels: L23, steps: [when(allies({ team: SH }, 3), [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 5000 } }])] },
  ],
  'ราบี้-ดาริน': [onStage(ALL2, 'ราบี้-ดาริน'), { kind: 'staticBp', levels: [2], if: attackStep, scope: { own: { types: SPIRIT, family: PRIVATE } }, amount: 1000 }],
  // "สปิริตทีม ไชนี่ฮาร์ท ของเรา On Stage" = ตัวที่กลับใต้เด็ค · คอร์วางบนตัวที่ถูกอัญเชิญ
  '[พริตตี้เกิร์ล] ราบี้-ดาริน': [
    { kind: 'trigger', on: 'allyOnStage', subject: { team: SH }, onStageSummoned: true, levels: ALL2, ownTurnOnly: true, steps: [{ do: 'voidCore', to: 'subject', count: 1 }] },
  ],
  'ซายะ-ไชน์': [
    onStage(ALL3, 'ซายะ-ไชน์'),
    // "บนฟิลด์ของเรามีแต่สปิริตเผ่า [ไพรเวทแวร์]" = ไม่มีสปิริต/อัลติเมทของเราที่ไม่ใช่เผ่านี้
    { kind: 'blockWhileExhausted', levels: L23, if: { all: [oppAttackStep, { not: { allyHas: { types: SPIRITISH, notFamilies: [PRIVATE] } } }] } },
  ],
  '[หญิงสาวสีขาวบริสุทธิ์] ซายะ-ไชน์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'revealPickRestTrash', count: 4, filter: { nameIncludes: ['เซน่า-ริวมิน', 'โนอา-เฟลอร์'] }, rest: 'bottom' }] },
    { kind: 'blockWhileExhausted', levels: L23, if: { all: [oppAttackStep, allies({ team: SH }, 3)] } },
  ],
  'เซน่า-ริวมิน': [
    onStage(ALL2, 'เซน่า-ริวมิน'),
    {
      kind: 'trigger',
      on: 'allyWonBattle',
      subject: { card: { team: SH, minCost: 7 } },
      levels: [2],
      ownTurnOnly: true,
      steps: [{ do: 'opponentLifeToReserve', count: 1 }],
    },
  ],
  '[ราชินีเพลิงดุ] เซน่า-ริวมิน': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [when(allies({ team: SH }, 3), [{ do: 'voidCore', to: 'self', count: 2 }])] },
    { kind: 'unblockableByCost', levels: [2], if: ownAttackStep, attacker: { team: SH, minCost: 7 }, maxLevel: 2 },
  ],
  'โนอา-เฟลอร์': [
    onStage(ALL3, 'โนอา-เฟลอร์'),
    { kind: 'extraSymbol', levels: L23, if: ownAttackStep, color: 'yellow', count: 1, allies: { nameIncludes: ['โนอา-เฟลอร์'], family: STAGE, notSelf: true } },
  ],

  // ---------------------------------------------------------------- แอปโซลูท
  'ฮิลด้า-มากาเร็ท': [onStage([3], 'ฮิลด้า-มากาเร็ท')],
  '[ไอดอลหุ่นเชิด] ฮิลด้า-มากาเร็ท': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [when({ summonedByOnStage: true }, [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, team: ABS }, count: 2 }])] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [revealTeamSummon(ABS, 5)] },
  ],
  'เดริส-เพลทิโอ': [onStage(ALL3, 'เดริส-เพลทิโอ')],
  '[เจ็ดขุนพลไอดอล] เดริส-เพลทิโอ': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [when(allies({ team: ABS }, 3), [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }])] },
    { kind: 'trigger', on: 'allyDestroyed', subject: { team: ABS, byOpponent: true }, levels: L23, oppTurnOnly: true, attackStepOnly: true, steps: [draw1] },
  ],
  'มิเรีย-ซันเดย์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [may('ทิ้งการ์ดในมือ 1 ใบ: จั่ว 1 ใบ', [{ do: 'discard', count: 1 }, draw1], { handAtLeast: 1 })] },
    onStage(ALL3, 'มิเรีย-ซันเดย์'),
  ],
  '[สามผู้ยิ่งใหญ่แห่งไอดอล] มิเรีย-ซันเดย์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'revealSummon', count: 3, filter: { types: ['spirit'], family: PRIVATE }, max: 1, rest: 'bottom' }] },
    // คู่แข่งต้องส่งคอร์บนฟิลด์ของตัวเอง 1 เม็ดไปแทรช จึงจะป้องกันได้
    { kind: 'trigger', on: 'allyAttack', subject: { team: ABS }, levels: [3], ownTurnOnly: true, steps: [{ do: 'blockTax', reserveToTrash: 0, fieldToTrash: 1 }] },
  ],
  ฟงนีน่า: [onStage(ALL2, 'ฟงนีน่า'), { kind: 'trigger', on: 'attackHitLife', levels: [2], steps: [{ do: 'voidCore', to: 'self', count: 1 }] }],
  '[แดนเซอร์ผู้ร้อนแรง] ฟงนีน่า': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'voidCore', to: 'self', count: 1, per: { allies: { types: SPIRIT, team: ABS }, max: 3 } }] },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2],
      steps: [
        {
          do: 'atBattleEnd',
          steps: [
            may(
              'ส่งคอร์บนสปิริตนี้ 1 เม็ดไปแทรช: ฟื้นสภาพสปิริตนี้',
              [{ do: 'markOnce', key: 'fongnina-dancer' }, { do: 'selfCoresToTrash', count: 1 }, { do: 'refreshSelf' }],
              { all: [{ usedFewerThan: { key: 'fongnina-dancer', max: 1 } }, { selfCoresAtLeast: 2 }, { selfExhausted: true }] },
            ),
          ],
        },
      ],
    },
  ],
  'รีฟา-เชียร์ส': [
    onStage(ALL3, 'รีฟา-เชียร์ส'),
    { kind: 'trigger', on: 'lifeLost', levels: L23, oppTurnOnly: true, attackStepOnly: true, steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], family: PRIVATE } }] },
  ],
  '[นักร้องแห่งสรรพสิ่ง] รีฟา-เชียร์ส': [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [revealTeamSummon(ABS, 6)] },
    { kind: 'staticBp', levels: [3], if: { all: [ownAttackStep, allies({ team: ABS }, 3)] }, scope: { own: { types: SPIRIT } }, amount: 5000 },
  ],
  'ออลทีน่า-แคลน': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [when(allies({ family: PRIVATE }, 3), [draw1])] },
    onStage(ALL3, 'ออลทีน่า-แคลน'),
  ],
  '[ปีกสีขาว] ออลทีน่า-แคลน': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, count: 1, per: { allies: { types: SPIRIT, team: ABS } } } as Step] },
    {
      kind: 'trigger',
      on: 'allyExhausted',
      subject: { card: { team: ABS, excludeNames: ['[ปีกสีขาว] ออลทีน่า-แคลน'] } },
      levels: [3],
      steps: [{ do: 'refreshSelf' }],
    },
  ],
  'ริวเนะ-มาโตะ': [onStage([1, 2, 3, 4], 'ริวเนะ-มาโตะ'), { kind: 'staticBp', levels: [2, 3, 4], if: ownAttackStep, scope: { own: { types: SPIRIT, team: ABS } }, amount: 2000 }],

  // ---------------------------------------------------------------- ดีว่าอื่น ๆ
  ราเควลผู้รักเพนต้น: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit', 'brave'], maxCost: 4, nameIncludes: ['เพนต้น'] } }] },
    { kind: 'staticBp', levels: [2], if: attackStep, scope: { own: { types: SPIRIT, braveNamed: ['ชุดตุ๊กตาเพนต้น'] } }, amount: 3000 },
  ],
  'พริม-อองจู': [{ kind: 'trigger', on: 'allyOnStage', levels: ALL3, ownTurnOnly: true, noStack: true, steps: [draw1] }],
  อาร์เชียในวันหยุด: [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [{ do: 'debuffChosenOpponent', amount: 5000, filter: { types: SPIRIT } }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        may(
          'เปิดใบบนสุดเด็ค 1 ใบ (คอสต์ตั้งแต่ 5 = ฟื้นสภาพ เทิร์นละครั้ง) แล้วนำขึ้นมือ',
          [{ do: 'revealTopIf', filter: { minCost: 5 }, then: [when({ usedFewerThan: { key: 'archia-holiday', max: 1 } }, [{ do: 'markOnce', key: 'archia-holiday' }, { do: 'refreshSelf' }])] }],
          { deckAtLeast: 1 },
        ),
      ],
    },
  ],

  // ---------------------------------------------------------------- ลีเจนด์ดอล
  // "การ์ดสปิริตที่วางแสดง จนจบเกม ใช้งานได้เสมือนอยู่ในมือ" = นอกมือ (กติกา 14 ข้อ 1)
  'นักร้อง เอ็นจู': [{ kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'revealTopToShown', filter: { types: ['spirit'], family: DIVA } }] }],
  'นักร้อง อาวริเอล': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [when(allies({ family: DIVA }, 3), [{ do: 'returnFromTrash', filter: { types: ['magic'], color: 'yellow' } }])] },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxBp: 3000 }, to: 'deckBottom' }] },
  ],
  'นักร้อง คัทลียา': [{ kind: 'trigger', on: 'ownAttackStepStart', levels: L23, steps: [{ do: 'timingLockChosen' }] }],
  'นักร้อง เวียร์จ': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL3,
      steps: [{ do: 'debuffChosenOpponent', amount: 5000, filter: { types: SPIRIT }, untilBattleEnd: true, zeroThen: [{ do: 'ifFirstZeroBp', steps: [draw1] }] }],
    },
    { kind: 'replaceDestroy', levels: L23, subject: { family: DIVA }, battle: true, toHand: true, ask: true },
  ],

  // ---------------------------------------------------------------- เบรฟ
  โกลเด้นวิงไมค์: [{ kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [draw1] }],
  ชุดตุ๊กตาเพนต้น: [{ kind: 'teamAlso', granted: true, levels: [], teams: [SH, ABS] }],
  โซโลวิง: [
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        may(
          'ส่งคอร์บนสปิริตนี้ 1 เม็ดไปรีเสิร์ฟ: ฟื้นสภาพ + ไม่ถูกป้องกันโดยสปิริต Lv2',
          [{ do: 'markOnce', key: 'solowing' }, { do: 'selfCoresToTrash', count: 1, to: 'reserve' }, { do: 'refreshSelf' }, { do: 'battleUnblockableLevel', level: 2 }],
          { all: [{ usedFewerThan: { key: 'solowing', max: 1 } }, { selfCoresAtLeast: 2 }] },
        ),
      ],
    },
  ],

  // ---------------------------------------------------------------- เน็กซัส
  วันหยุดของดีว่า: [
    {
      kind: 'unblockableByCost',
      levels: ALL2,
      if: { all: [ownAttackStep, distinct({ family: PRIVATE }, 6)] },
      attacker: { family: PRIVATE },
      bySpirits: true,
    },
    { kind: 'trigger', on: 'allyDestroyed', subject: { family: PRIVATE, byOpponent: true }, levels: [2], steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
  ],
  ดีว่าสเตจ: [
    { kind: 'trigger', on: 'allyOnStage', onStageSummoned: true, levels: ALL2, ownTurnOnly: true, steps: [{ do: 'maxLevelThisTurn', target: 'subject' }] },
    { kind: 'trigger', on: 'startStep', levels: [2], steps: [when(distinct({ family: STAGE }, 10), [{ do: 'winGame' }])] },
  ],
  งานขอบคุณแฟนคลับ: [
    {
      kind: 'activated',
      levels: ALL2,
      timing: 'attackFlash',
      label: 'เสื่อมสภาพสปิริตเผ่า [ไพรเวทแวร์]/[สเตจสไตล์]: สปิริตของเรา 1 ตัว BP+ เท่ากับ BP ของตัวนั้น (ในการต่อสู้นี้)',
      if: { allyHas: { types: SPIRIT, families: [PRIVATE, STAGE], state: 'refresh' } },
      steps: [
        { do: 'exhaustOwn', filter: { types: SPIRIT, families: [PRIVATE, STAGE], state: 'refresh' } },
        { do: 'buffChosen', amount: 0, ally: true, amountFrom: 'exhaustedBp', untilBattleEnd: true },
      ],
    },
    {
      kind: 'trigger',
      on: 'allyAttackHitLife',
      levels: [2],
      ownTurnOnly: true,
      oncePerTurn: true,
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], maxCost: 3, withShown: true } }],
    },
  ],

  // ---------------------------------------------------------------- เมจิค
  ทวินเพอร์ฟอร์มานซ์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'สปิริตของเรา 1 ตัว BP+3000', steps: [{ do: 'buffChosen', amount: 3000, ally: true }] },
            {
              label: 'นำสปิริตเผ่า [ไพรเวทแวร์] ของเรากลับขึ้นมือ: เสื่อมสภาพสปิริตคู่แข่ง 1 ตัว',
              if: { all: [{ allyHas: { types: SPIRIT, family: PRIVATE } }, { opponentHas: { types: SPIRIT, state: 'refresh' } }] },
              steps: [{ do: 'returnOwnToHand', filter: { types: SPIRIT, family: PRIVATE } }, { do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }],
            },
          ],
        },
      ],
    },
  ],
  สวีทฮาร์ท: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'endAttackStepIfAfterBattle', if: { allyHas: { types: SPIRIT, family: DIVA } } }] }],
  ดีว่าเมดเลย์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'นำสปิริตคู่แข่ง 1 ตัวกลับใต้สุดเด็ค', steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, to: 'deckBottom' }] },
            {
              label: 'ส่งคอร์ในแทรช 1 เม็ดไปวอยด์: นำอัลติเมท Lv3 ของคู่แข่งกลับใต้สุดเด็คแทน',
              if: { all: [{ trashCoreAtLeast: 1 }, { opponentHas: { types: ['ultimate'], minLevel: 3, maxLevel: 3 } }] },
              steps: [{ do: 'trashCoreToVoid', count: 1 }, { do: 'bounceOpponent', filter: { types: ['ultimate'], minLevel: 3, maxLevel: 3 }, to: 'deckBottom' }],
            },
          ],
        },
      ],
    },
  ],
  ฮาร์ดบีท: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'alliesToBottomReveal', filter: { types: SPIRIT, family: DIVA }, summon: { types: ['spirit'], family: DIVA } }] }],

  // ---------------------------------------------------------------- X
  '[ไอดอลดาวเทพสูงสุด] โนอา-เฟลอร์': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [when({ lifeAtMost: 5 }, [{ do: 'gainLifeFromVoid', count: 1 }, { do: 'bounceOpponent', filter: { types: SPIRIT } }])],
    },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [when(distinct({ family: STAGE }, 3), [{ do: 'symbolThisTurn', color: 'yellow', count: 1, untilBattleEnd: true }])] },
  ],
  // ตีระบุ (กติกา 14): สปิริตทีม แอปโซลูท ของเราเมื่อโจมตี สามารถระบุสปิริตคู่แข่ง 1 ตัว แล้วต่อสู้กับตัวนั้น
  '[มิโกะแห่งเสียงเพลง] ริวเนะ-มาโตะ': [
    { kind: 'trigger', on: 'summon', levels: [1, 2, 3, 4], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxBp: 15000 } }] },
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { team: ABS },
      levels: [3, 4],
      ownTurnOnly: true,
      steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT }, direct: true }],
    },
  ],
  'นักร้อง ทริคสเตอร์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'showFromHandAny', filter: { types: ['spirit'], family: DIVA }, then: [{ do: 'draw', count: 1, per: { shownByThis: true } }] }] },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], family: DIVA, withShown: true, shownOnly: true } }] },
  ],
};
