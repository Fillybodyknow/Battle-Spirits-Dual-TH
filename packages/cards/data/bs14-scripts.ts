/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 14 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS24 สีแดง)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger เปิดใบบนสุดเด็คคู่แข่งไปแทรช คอสต์ต่ำกว่าอัลติเมทนี้ = ฮิต → then
 * Rage: mustBlock.spiritsOnly (บังคับป้องกันเฉพาะสปิริต อัลติเมทไม่บังคับ)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const U34 = [3, 4];
const U345 = [3, 4, 5];
const U45 = [4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const SLAYER = 'มังกรล้างสังหาร';
const DRAGON_MAN = 'มนุษย์มังกร';
const JUDGMENT = 'มังกรล้างสังหารแห่งการตัดสินโทษ จัดจ์เมนต์ ดราโกนิส';
const ARMED = 'อาวุธ';
const NEXUS: CardFilter = { types: ['nexus'] };
/** Heavy Shield: ไม่รับผลเอฟเฟกต์สปิริต/เบรฟ/เน็กซัส/เมจิคของคู่แข่ง */
const HEAVY: ('spirit' | 'nexus' | 'magic' | 'brave' | 'ultimate')[] = ['spirit', 'brave', 'nexus', 'magic'];
const bounce = (filter: CardFilter, extra: { count?: number; if?: Condition } = {}): Step => ({ do: 'bounceOpponent', filter, ...extra });
/** U Trigger ของอัลติเมทขาว: ฮิต = (steps ก่อน) แล้วอัลติเมทนี้ไม่ถูกป้องกันโดยสปิริตของคู่แข่ง */
const whiteUnblockable = (levels: number[], before: Step[] = []) => uTrigger(levels, [...before, { do: 'battleUnblockable', by: 'spirits' }]);

/** มีอัลติเมทของเราอยู่บนสนาม */
const ownUltimate: Condition = { alliesMatchAtLeast: { filter: { types: ['ultimate'] }, count: 1 } };
const ownAttackStep: Condition = { ownAttackStep: true };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
const rush = (color: 'green' | 'white' | 'red' | 'purple' | 'yellow' | 'blue', n = 1): Condition => ({ rush: { color, count: n } });
const destroy = (filter: CardFilter, extra: { count?: number; if?: Condition } = {}): Step => ({ do: 'destroyChosenOpponent', filter, ...extra });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** U Trigger ของอัลติเมทแดง: ฮิต = คู่แข่งต้องป้องกันด้วยสปิริตถ้าทำได้ · ถูกสปิริตป้องกัน = ไลฟ์คู่แข่ง 1 เม็ดไปรีเสิร์ฟ */
const redRageTrigger = (levels: number[]) => uTrigger(levels, [{ do: 'mustBlock', spiritsOnly: true }, { do: 'battleLifeIfBlocked', amount: 1 }]);

export const BS14_SCRIPTS: Record<string, CardScript> = {
  // ---------------- สปิริต
  'ริวแมน คลอว์': [{ kind: 'summonSymbol', levels: ALL3, filter: { types: ['ultimate'] }, color: 'red', count: 1 }],
  บาซิลิแอกซ์: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL2,
      steps: [{ do: 'buffSelf', amount: 2000, untilBattleEnd: true }, when(ownUltimate, [{ do: 'buffSelf', amount: 2000, untilBattleEnd: true }])],
    },
  ],
  'สมิงหมัด คิงรู': [
    { kind: 'destroyBurstBan', levels: ALL3, maxBp: 5000 },
    [
      { kind: 'colorAlso', levels: L23, color: 'green' },
      { kind: 'symbolAlsoColor', levels: L23, color: 'green' },
    ],
  ],
  'ริวแมน ฟีนิกซ์': [
    // "สปิริตของเรามีไม่เกิน 2 ตัว" (รวมสปิริตนี้) = ถือว่าเป็น Lv3 (เลเวลสูงสุด)
    { kind: 'maxLevelIf', levels: ALL3, if: { not: { alliesMatchAtLeast: { filter: { types: SPIRIT }, count: 3 } } } },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'draw', count: 1 }] },
  ],
  อัลโลแคนนอนซอรัส: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [
        destroy({ types: SPIRIT, maxBp: 2000 }),
        when(rush('green'), [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT, noBraves: true } }]),
        when(rush('green', 2), [{ do: 'voidCore', to: 'ally', count: 1, filter: { types: SPIRIT, color: 'red' } }]),
      ],
    },
  ],
  'ริวแมน วัลคา': [
    { kind: 'levelPlus', levels: ALL3, if: ownAttackStep, filter: { types: SPIRIT, family: SLAYER }, amount: 1 },
    // "สปิริตสีแดงทั้งหมดของเรา เมื่อโจมตี สามารถระบุสปิริตคอสต์ไม่เกิน 3 ของคู่แข่ง 1 ตัวแล้วโจมตีได้" (ตีระบุ: เลือกไม่ระบุก็ได้)
    { kind: 'trigger', on: 'allyAttack', subject: { color: 'red' }, ownTurnOnly: true, levels: L23, steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT, maxCost: 3 }, direct: true }] },
  ],
  'สตีม ไทรเซรา': [
    { kind: 'evolution', levels: ALL3 },
    { kind: 'trigger', on: ['attack', 'block'], levels: L23, steps: [when({ firstBattleOfTurn: true }, [{ do: 'buffSelf', amount: 6000, untilBattleEnd: true }])] },
  ],
  'เอคลิปส์ ดราก้อน': [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'summonThisFree' }] },
    { kind: 'bpDestroyBoost', levels: ALL3, amount: 1000, fromTypes: ['spirit', 'brave', 'nexus', 'magic'] },
    { kind: 'lifeImmuneLowCost', levels: ALL3, maxCost: 3 },
  ],
  'เฟลม กันดรากเนอร์': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [when(ownUltimate, [destroy({ types: SPIRIT, maxBp: 12000 })], [destroy({ types: SPIRIT, maxBp: 6000 })])] },
  ],
  'ริวแมน เบลด': [
    { kind: 'handCostSet', levels: ALL3, filter: { names: ['ริวแมน เบลด'] }, cost: 5, if: ownUltimate },
    // "ทำลายสปิริตทั้งหมดที่มีเจ็มตั้งแต่ 2 เม็ดขึ้นไป" = ทั้งสองฝ่าย (รวมของเรา)
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'destroyAllBoth', filter: { types: SPIRIT, minSymbols: 2 } }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [3],
      steps: [
        { do: 'symbolThisTurn', color: 'red', count: 1, untilBattleEnd: true },
        { do: 'buffSelf', amount: 5000, untilBattleEnd: true, per: { selfSymbols: true } },
      ],
    },
  ],
  [JUDGMENT]: [
    {
      kind: 'trigger',
      on: ['ownAttackStepStart', 'oppAttackStepStart'],
      levels: ALL3,
      steps: [
        may('ทิ้งการ์ดสีแดงในมือ 1 ใบ: ในเทิร์นนี้สปิริตของเราทั้งหมด BP+5000', [{ do: 'discard', count: 1, filter: { color: 'red' } }, { do: 'buffAllies', amount: 5000 }], {
          handHas: { color: 'red' },
        }),
      ],
    },
    { kind: 'trigger', on: 'attack', levels: L23, steps: [{ do: 'mustBlock', spiritsOnly: true }] },
    { kind: 'trigger', on: 'attack', levels: [3], steps: [when({ oncePerGameFree: 'judgment-extra-turn' }, [{ do: 'extraTurn', key: 'judgment-extra-turn' }])] },
  ],

  // ---------------- สปิริต (ขาว)
  ออโตเมติกกันเนอร์: [{ kind: 'summonSymbol', levels: ALL2, filter: { types: ['ultimate'] }, color: 'white', count: 1 }],
  อควาคุมะโนมิ: [{ kind: 'trigger', on: 'destroyed', levels: ALL2, steps: [{ do: 'bounceAllOpponent', filter: { types: SPIRIT, minSymbols: 2 } }] }],
  'ไซเบอร์ เชพเพิร์ด': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2],
      steps: [bounce(NEXUS), when(rush('purple'), [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, untilOne: true }])],
    },
  ],
  กรอสชูลิซาร์ด: [
    // "เมื่อถูกทำลายในรูปแบบฟื้นสภาพ จะยังคงอยู่บนสนามในรูปแบบเสื่อมสภาพ" (ทุกแบบ รวมการต่อสู้)
    { kind: 'replaceDestroy', levels: ALL2, subject: { self: true }, battle: true, auto: true, state: 'exhausted', if: { not: { selfExhausted: true } } },
    { kind: 'trigger', on: 'block', levels: [2], steps: [{ do: 'buffSelf', amount: 3000, untilBattleEnd: true }] },
  ],
  'แทงก์โมบิล ไทป์ 90': [
    { kind: 'trigger', on: 'block', levels: ALL3, steps: [{ do: 'buffSelf', amount: 3000, untilBattleEnd: true }, when(ownUltimate, [{ do: 'bounceOpponentBrave' }])] },
  ],
  การ์เน็ตดราก้อน: [
    [
      { kind: 'colorAlso', levels: ALL3, color: 'red' },
      { kind: 'symbolAlsoColor', levels: ALL3, color: 'red' },
    ],
    { kind: 'blockWhileExhausted', levels: ALL3, if: { oppTurn: true }, allies: { types: SPIRIT, families: ['มังกรติดเกราะ', DRAGON_MAN] } },
    { kind: 'effectImmune', levels: L23, scope: 'self', colors: ['red', 'purple', 'white', 'blue'], types: HEAVY },
  ],
  เบิร์สเทอร์เทิล: [
    { kind: 'burst', on: 'afterAllyDestroyedByOpponent', steps: [bounce({ types: SPIRIT }), { do: 'summonThisFree' }] },
    [
      { kind: 'noMill', levels: ALL2 },
      { kind: 'effectImmune', levels: ALL2, scope: 'self', types: ['spirit'], if: ownUltimate },
    ],
  ],
  สแครปแมมมอธ: [
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL2,
      steps: [may('ทิ้งเบิร์สของคู่แข่ง 1 ใบ: นำสปิริตคู่แข่ง 1 ตัวกลับขึ้นมือ', [{ do: 'discardOpponentBurst' }, bounce({ types: SPIRIT })], { all: [{ opponentHasBurst: true }, { opponentHas: { types: SPIRIT } }] })],
    },
    [
      { kind: 'colorAlso', levels: [2], color: 'purple' },
      { kind: 'symbolAlsoColor', levels: [2], color: 'purple' },
    ],
  ],
  'จักรพรรดิป้อมปราการแห่งนภา คิงฟอร์เทรส': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        { ...bounce({ types: SPIRIT }), per: { allies: { types: SPIRITISH, family: ARMED } } } as Step,
        { do: 'voidCore', to: 'reserve', count: 1, per: { bouncedByThis: true } },
      ],
    },
    { kind: 'depletionSave', levels: ALL3, filter: { types: SPIRIT, family: ARMED } },
  ],
  ไวเวิร์นเบริล: [
    { kind: 'handCostSet', levels: ALL3, filter: { names: ['ไวเวิร์นเบริล'] }, cost: 5, if: ownUltimate },
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'bounceOpponentBrave', to: 'deckTop', optional: true }] },
    { kind: 'trigger', on: 'allyAttack', subject: { types: ['ultimate'] }, ownTurnOnly: true, levels: L23, steps: [{ do: 'refreshSelf' }] },
  ],

  // ---------------- อัลติเมท
  'อัลติเมท ดรากซอรัส': [
    { kind: 'trigger', on: 'summon', levels: U34, steps: [destroy({ types: ['nexus'] })] },
    // ฮิต: ทำลายสปิริต BP ไม่เกิน 10000 ของคู่แข่ง 1 ตัว ต่อคอสต์ 1 ของการ์ดที่ถูกวางที่แทรช
    uTrigger([4], [{ ...destroy({ types: SPIRIT, maxBp: 10000 }), per: { uTriggerCost: true } } as Step]),
  ],
  'อัลติเมท ปเทราโทมาฮอว์ก': [
    { kind: 'trigger', on: 'summon', levels: U345, steps: [destroy({ types: SPIRIT, minSymbols: 2 })] },
    redRageTrigger(U345),
  ],
  'ราชามังกรสูงสุด ริไวอา': [
    redRageTrigger(U345),
    {
      kind: 'trigger',
      on: 'attack',
      levels: U45,
      steps: [
        may(
          'นำการ์ดสปิริตสีแดงในแทรช 1 ใบขึ้นมือ: ทำลายสปิริตร่วมร่างของคู่แข่ง 1 ตัว',
          [{ do: 'returnFromTrash', filter: { types: ['spirit'], color: 'red' } }, destroy({ types: SPIRIT, hasBraves: true })],
          { all: [{ trashHas: { types: ['spirit'], color: 'red' } }, { opponentHas: { types: SPIRIT, hasBraves: true } }] },
        ),
      ],
    },
  ],
  'อัลติเมท ซีคฟรีเดน': [
    uTrigger(U345, [{ ...destroy({ types: SPIRIT, maxBp: 10000 }), per: { uTriggerCost: true } } as Step]),
    {
      kind: 'trigger',
      on: 'oppAttack',
      subject: { types: ['ultimate'] },
      oppTurnOnly: true,
      levels: U45,
      steps: [
        may('ทิ้งการ์ดอัลติเมทในมือ 1 ใบ: ฟื้นสภาพอัลติเมทนี้', [{ do: 'discard', count: 1, filter: { types: ['ultimate'] } }, { do: 'refreshSelf' }], {
          all: [{ handHas: { types: ['ultimate'] } }, { selfExhausted: true }],
        }),
      ],
    },
  ],

  // ---------------- อัลติเมท (ขาว)
  'อัลติเมท เอ็มพรา': [
    { kind: 'trigger', on: 'attack', levels: U34, steps: [bounce({ types: SPIRIT, minSymbols: 2 })] },
    whiteUnblockable([4]),
  ],
  'อัลติเมท เฟนริล': [
    whiteUnblockable(U345, [bounce(NEXUS)]),
    { kind: 'staticBp', levels: U45, if: { all: [{ oppTurn: true }, { attackStep: true }] }, scope: { own: { types: SPIRITISH } }, amount: 3000 },
  ],
  'อัลติเมท เฟรยา': [
    { kind: 'trigger', on: 'summon', levels: U345, steps: [{ do: 'turnTrigger', on: 'turnEnd', steps: [{ do: 'refreshAllAllies', filter: { types: ['ultimate'], color: 'white' } }] }] },
    whiteUnblockable(U45),
  ],
  'เทพยักษ์สูงสุด อัลติเมท ธอร์': [
    whiteUnblockable(U345, [bounce(NEXUS)]),
    { kind: 'trigger', on: 'oppAttack', subject: { types: SPIRIT, card: { maxLevel: 2 } }, oppTurnOnly: true, levels: U45, steps: [{ do: 'refreshSelf' }] },
  ],

  // ---------------- เบรฟ
  'บัสเตอร์ฟัลคอน 21': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [
        { do: 'opponentTotalBp', maxTotal: 5000, action: 'bounce', filter: { types: SPIRIT } },
        { do: 'voidCore', to: 'ally', count: 1, filter: { types: SPIRIT, family: ARMED }, per: { bouncedByThis: true } },
      ],
    },
  ],
  ปเทอร์ไฟเตอร์: [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'returnFromTrash', filter: { types: ['spirit'], families: [DRAGON_MAN, 'มังกรติดเกราะ'] } }] },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT, maxBp: 6000 }, direct: true }] },
  ],

  // ---------------- เน็กซัส
  บทโหมโรงสู่หายนะ: [
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { minCost: 7, family: SLAYER },
      ownTurnOnly: true,
      mainStepOnly: true,
      levels: ALL2,
      steps: [{ do: 'symbolAlliesThisTurn', filter: { types: SPIRIT, families: [DRAGON_MAN, 'มังกรดารา'] }, color: 'red', count: 1 }],
    },
    { kind: 'drawStep', levels: [2], extraDraw: [{ amount: 1, if: { alliesMatchAtLeast: { filter: { types: SPIRIT, family: DRAGON_MAN }, count: 1 } } }] },
  ],
  สนามรบที่มอดไหม้: [
    { kind: 'trigger', on: 'allySummoned', subject: { types: ['ultimate'] }, ownTurnOnly: true, mainStepOnly: true, oncePerTurn: true, levels: ALL2, steps: [{ do: 'draw', count: 1 }] },
    { kind: 'trigger', on: 'lifeLost', oppTurnOnly: true, attackStepOnly: true, levels: [2], steps: [{ ...destroy({ types: SPIRIT, maxBp: 4000 }), per: { selfCores: true } } as Step] },
  ],

  สมรภูมิโบราณหมื่นหอก: [
    { kind: 'trigger', on: 'oppExhausted', subject: { types: SPIRITISH }, levels: ALL2, steps: [{ do: 'draw', count: 1 }] },
    { kind: 'trigger', on: 'selfDrew', ownTurnOnly: true, attackStepOnly: true, levels: [2], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }] },
  ],
  นครป้อมปราการหิมะพันปี: [
    { kind: 'trigger', on: 'allySummoned', subject: { types: ['ultimate'] }, ownTurnOnly: true, mainStepOnly: true, levels: ALL2, steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, bpFrom: 'subject' }] },
    { kind: 'trigger', on: 'allyAttackHitLife', subject: { types: ['ultimate'] }, ownTurnOnly: true, levels: [2], steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
  ],
  'ซากโบราณน้ำแข็งเวหา สกาย ริโอ': [
    { kind: 'trigger', on: 'allySummoned', subject: { family: 'มังกรติดเกราะ' }, ownTurnOnly: true, mainStepOnly: true, oncePerTurn: true, levels: ALL2, steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    { kind: 'trigger', on: 'oppHandIncreased', oppTurnOnly: true, attackStepOnly: true, noStack: true, levels: [2], steps: [{ do: 'opponentDiscards', count: 1, perHandIncrease: true }] },
  ],

  // ---------------- เมจิค
  อัลติเมทวอลล์: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'endAttackStepAfterBattle' }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [bounce({ types: SPIRIT, maxCost: 3 }, { count: 3 })] },
  ],
  ซัพเพรสชัน: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'refreshAllAllies', filter: { types: SPIRIT } }, { ...bounce({ types: SPIRIT }), per: { refreshedByThis: true } } as Step],
    },
  ],
  เบรฟเดสทรัคชัน: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'ทำลายเบรฟของสปิริตร่วมร่างของคู่แข่ง 1 ใบ', if: { opponentHas: { types: SPIRIT, hasBraves: true } }, steps: [{ do: 'destroyOpponentBrave' }] },
            { label: 'ทำลายสปิริต BP ไม่เกิน 3000 ของคู่แข่ง 1 ตัว', if: { opponentHas: { types: SPIRIT, maxBp: 3000 } }, steps: [destroy({ types: SPIRIT, maxBp: 3000 })] },
          ],
        },
      ],
    },
  ],
  จัดจ์เมนต์คอล: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [
        { do: 'revealPickRestTrash', count: 6, filter: { types: ['spirit'], family: SLAYER } },
        when({ chosenIs: { names: [JUDGMENT] } }, [destroy({ types: SPIRIT, maxBp: 7000 })]),
      ],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000, filter: { types: SPIRITISH } }] },
  ],
  เฟลมบรีซ: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'noDestroyBurstThisEffect' },
        destroy({ types: SPIRIT, maxBp: 4000 }),
        when(rush('green'), [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT, maxBp: 4000 } }]),
        when(rush('green', 2), [{ do: 'exhaustOpponent', count: 1, filter: { types: SPIRIT } }]),
      ],
    },
  ],
};
