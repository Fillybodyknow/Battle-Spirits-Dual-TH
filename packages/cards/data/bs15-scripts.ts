/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 15 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS24 สีเขียว / เหลือง / ฟ้า)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger เปิดใบบนสุดเด็คคู่แข่งไปแทรช คอสต์ต่ำกว่าอัลติเมทนี้ = ฮิต → then
 * "ถ้าจะป้องกันด้วยสปิริต ต้องป้องกันด้วยสปิริต N ตัว ต่อสู้ตัวเดียว" = step pairBlock.count (ผู้โจมตีเลือกตัวที่จะต่อสู้)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const U345 = [3, 4, 5];
const U45 = [4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const QUICK = { kind: 'quick' as const };
const SWORD_BEAST = 'ศาสตราสมิง';
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const DIVA = 'ดีว่า';
const SONGBIRD = 'วิหคสังคีต';
const BEHEMOTH = 'บีฮีมอธ';
const SYNTH = 'ทหารสังเคราะห์';
const NEXUS: CardFilter = { types: ['nexus'] };
/** ทิ้งใบบนสุดเด็คคู่แข่ง */
const mill = (count: number | 'level'): Step => ({ do: 'mill', count });
/** U Trigger ของอัลติเมทฟ้า: ฮิต = ทิ้งเด็คคู่แข่ง N ใบ ต่อคอสต์ 1 ของการ์ดที่วางที่แทรช */
const millTrigger = (levels: number[], perCost: number) => uTrigger(levels, [{ ...mill(perCost), per: { uTriggerCost: true } } as Step]);
const destroyCost = (maxCost: number, extra: Partial<Extract<Step, { do: 'destroyChosenOpponent' }>> = {}): Step => ({ do: 'destroyChosenOpponent', filter: { types: SPIRIT, maxCost }, ...extra });
const ownAttackStep: Condition = { ownAttackStep: true };
/** ในเทิร์นนี้ สปิริตคู่แข่ง N ตัว BP- */
const debuff = (amount: number, extra: { count?: number; destroyAtZero?: true } = {}): Step => ({ do: 'debuffChosenOpponent', amount, filter: { types: SPIRIT }, ...extra });
/** U Trigger ของอัลติเมทเหลือง (อองจู / โซเฟีย): ไม่ถูกป้องกันโดยสปิริตคอสต์ไม่เกินคอสต์การ์ดที่วางที่แทรช + นำเมจิคในแทรชกลับขึ้นมือ */
const yellowUnblockTrigger = (levels: number[]) => uTrigger(levels, [{ do: 'uTriggerCostUnblock' }, { do: 'returnFromTrash', filter: { types: ['magic'] } }]);

/** มีอัลติเมทของเราอยู่บนสนาม */
const ownUltimate: Condition = { alliesMatchAtLeast: { filter: { types: ['ultimate'] }, count: 1 } };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
const rush = (color: 'green' | 'white' | 'red' | 'purple' | 'yellow' | 'blue', n = 1): Condition => ({ rush: { color, count: n } });
const exhaust = (count = 1): Step => ({ do: 'exhaustOpponent', count, filter: { types: SPIRIT } });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** Bunshin : 1 (เมื่อสปิริตนี้ถูกอัญเชิญ / โจมตี) */
const bunshin = (on: 'summon' | 'attack', levels: number[]) => ({ kind: 'trigger' as const, on, levels, steps: [{ do: 'bunshin' as const, max: 1 }] });

export const BS15_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- เขียว (BS24)
  แอกซ์มอธ: [{ kind: 'replaceDestroy', levels: ALL2, subject: { self: true }, toHand: true }],
  // คอร์บนสปิริตนี้ไม่ลดต่ำกว่า Lv1 โดยคู่แข่ง เมื่อมีการ์ดอัลติเมทในมือให้เปิดแสดง (ตีความ: มีการ์ดอัลติเมทในมือ = มีผลเสมอ)
  โยโรอิฟุคุโร: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'voidCore', to: 'self', count: 1 }] },
    { kind: 'coreFloor', levels: ALL2, self: true, filter: {}, min: 'lv1', if: { handHas: { types: ['ultimate'] } } },
  ],
  เซเบอร์ฮอร์เน็ต: [
    QUICK,
    // คู่แข่งเลือกเสื่อมสภาพสปิริตตัวเอง · มีอัลติเมทของเรา = เราเลือก
    { kind: 'trigger', on: 'destroyed', levels: [2], steps: [when(ownUltimate, [exhaust()], [{ do: 'opponentExhaustsOwn', count: 1, filter: { types: SPIRIT } }])] },
  ],
  ซอร์ดพูมา: [QUICK, bunshin('summon', ALL2)],
  คานาบูน: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        { do: 'voidCore', to: 'reserve', count: 1 },
        when(rush('yellow'), [{ do: 'disableChosenOpponent', filter: { types: SPIRIT }, blockOnly: true }]),
      ],
    },
  ],
  ซอร์ดโคโยตี: [
    // สปิริตเผ่า [ศาสตราสมิง] ของเราได้รับ "เมื่อสปิริตนี้โจมตี: คู่แข่งจะสั่งใช้เบิร์สไม่ได้" (ในการต่อสู้นั้น)
    { kind: 'trigger', on: 'allyAttack', levels: ALL2, subject: { family: SWORD_BEAST }, steps: [{ do: 'battleNoBurst' }] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [exhaust()] },
  ],
  ไนท์อีเกิล: [bunshin('attack', ALL3), { kind: 'cloneBp', levels: L23, bp: 11000 }],
  สกอร์เปียนไนท์: [
    { kind: 'selfCostIf', cost: 5, if: ownUltimate },
    { kind: 'trigger', on: ['attack', 'block'], levels: ALL3, steps: [{ do: 'exhaustAllOpponent', filter: { types: SPIRIT, maxCost: 3 } }] },
    { kind: 'blockOpponentBurst', levels: [3], anyTurn: true, if: { allyInBattle: { types: ['ultimate'] } } },
  ],
  'สัตว์พันปี บีฮีมอธ ซีดาร์': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'voidCore', to: 'reserve', count: 1, per: { allies: { types: SPIRIT, color: 'yellow' } } }] },
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: L23,
      ownTurnOnly: true,
      subject: { types: SPIRIT, nameIncludes: ['บีฮีมอธ'] },
      steps: [{ do: 'pairBlock', count: 2, attacker: 'subject' }],
    },
  ],
  'อัลติเมท จิกะวอสป์': [QUICK, uTrigger([4], [exhaust(3)])],
  'อัลติเมท จีโอ': [uTrigger(U345, [{ do: 'pairBlock', count: 3 }])],
  'อัลติเมท เทรนตัน': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: U345,
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], color: 'green' } }],
    },
    uTrigger(U45, [{ do: 'pairBlock', count: 3 }]),
  ],
  'อัลติเมท ไกเซอร์แอตลาส': [
    uTrigger(U345, [exhaust(3)]),
    // ชนะและทำลายด้วยการเทียบ BP (ตอนโจมตี) = ไลฟ์คู่แข่ง 1 เม็ดไปวอยด์
    { kind: 'trigger', on: 'allyWonBattle', levels: U45, subject: { self: true, attacker: true }, steps: [{ do: 'opponentLifeToReserve', count: 1, to: 'void' }] },
  ],
  // ---------------- เบรฟ / เน็กซัส / เมจิค เขียว
  คุวะกาแทงก์: [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'voidCore', to: 'ally', count: 1, filter: { types: SPIRIT, families: [SWORD_BEAST, 'สัตว์มายา'] } }] },
  ],
  เทือกเขาดังกาโรที่หมุนวน: [
    { kind: 'cloneVoidCore', levels: ALL2 },
    {
      kind: 'trigger',
      on: 'lifeLost',
      levels: [2],
      oppTurnOnly: true,
      attackStepOnly: true,
      if: { all: [{ lifeAtMost: 3 }, { not: { lifeAtMost: 0 } }] },
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], textIncludes: ['Bunshin'] } }],
    },
  ],
  ดงผลไม้แห่งชีวิต: [
    {
      kind: 'trigger',
      on: 'allySummoned',
      levels: ALL2,
      ownTurnOnly: true,
      mainStepOnly: true,
      oncePerTurn: true,
      subject: { types: ['ultimate'] },
      steps: [{ do: 'voidCore', to: 'reserve', count: 1 }],
    },
    { kind: 'trigger', on: 'lifeLost', levels: [2], oppTurnOnly: true, attackStepOnly: true, steps: [{ do: 'draw', count: 1, perLifeLost: true }] },
  ],
  ไซเคิลพาวเวอร์: [
    {
      kind: 'magic',
      timing: 'flash',
      notMain: true,
      steps: [{ do: 'buffChosen', amount: 2000 }, when(rush('yellow'), [{ do: 'atBattleEnd', steps: [{ do: 'selfFromTrashToHand' }] }])],
    },
  ],
  ไบนดิงครีปเปอร์: [{ kind: 'magic', timing: 'flash', steps: [exhaust(), when(ownUltimate, [exhaust()])] }],
  แชโดว์ลีฟ: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'activateBunshin' }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [exhaust(), { ...exhaust(), per: { allies: { family: 'ร่างแยก' } } } as Step] },
  ],

  // ---------------------------------------------------------------- เหลือง (BS24)
  วอตชิโน: [{ kind: 'replaceDestroy', levels: ALL2, subject: { self: true }, battle: true, exhaustOpp: { types: SPIRIT, maxBp: 5000 }, state: 'exhausted' }],
  โคดะเมาส์: [
    {
      kind: 'trigger',
      on: 'destroyed',
      levels: ALL2,
      steps: [may('เปิดการ์ดบนสุดเด็ค 6 ใบ นำสปิริต "บีฮีมอธ" 1 ใบขึ้นมือ ที่เหลือทิ้ง', [{ do: 'revealPickRestTrash', count: 6, filter: { types: ['spirit'], nameIncludes: [BEHEMOTH] } }], { deckAtLeast: 1 })],
    },
    [
      { kind: 'colorAlso', levels: [2], color: 'green' },
      { kind: 'symbolAlsoColor', levels: [2], color: 'green' },
    ],
  ],
  'นักร้อง อาร์เชีย': [
    { kind: 'trigger', on: ['allyDestroyed', 'allyDepletedByOpponent'], levels: ALL3, subject: { family: DIVA, byOpponent: true }, steps: [{ do: 'draw', count: 1 }] },
    // "สามารถให้สปิริตนี้ยังคงอยู่" (ถาม) เมื่อมีอัลติเมทของเรา
    { kind: 'replaceDestroy', levels: L23, subject: { self: true }, battle: true, if: ownUltimate, state: 'exhausted' },
  ],
  'นักร้อง มาริกะ': [
    { kind: 'trigger', on: 'oppAttack', levels: ALL2, subject: { types: SPIRIT, maxCost: 3 }, steps: [{ do: 'gainLifeFromVoid', count: 1 }] },
    {
      kind: 'staticBp',
      levels: [2],
      scope: { own: { types: ['ultimate'] } },
      amount: 10000,
      if: {
        all: [
          { allyHas: { names: ['นักร้อง อาร์เชีย'] } },
          { allyHas: { names: ['นักร้อง มาริกะ'] } },
          { allyHas: { names: ['นักร้อง โคโค'] } },
          { allyHas: { names: ['นักร้อง มิเรฟา'] } },
        ],
      },
    },
  ],
  โคเคทริส: [
    {
      kind: 'trigger',
      on: 'block',
      levels: ALL3,
      steps: [debuff(3000), when(rush('green'), [{ do: 'refreshOnBattleWin' }]), when(rush('green', 2), [exhaust()])],
    },
  ],
  'นักร้อง โคโค': [
    { kind: 'trigger', on: ['attack', 'block'], levels: ALL3, steps: [{ do: 'disableChosenOpponent', filter: { types: SPIRIT } }] },
    { kind: 'effectImmune', levels: L23, scope: { own: { types: SPIRIT, family: DIVA } }, types: ['spirit'], if: ownUltimate },
  ],
  อัศวินเพนต้น: [
    {
      kind: 'trigger',
      on: ['allyDestroyed', 'allyDepletedByOpponent'],
      levels: ALL3,
      attackStepOnly: true,
      subject: { types: SPIRIT, color: 'yellow', byOpponent: true },
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], family: SONGBIRD } }],
    },
    { kind: 'staticBp', levels: L23, scope: { self: true }, amount: 1000, perAllies: { types: SPIRITISH, family: SONGBIRD } },
  ],
  'สัตว์ปีก วิงบีฮีมอธ': [
    {
      kind: 'trigger',
      on: ['destroyedByOpponent', 'depletedByOpponent'],
      levels: ALL3,
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, to: 'deckBottom', per: { allies: { types: SPIRIT, nameIncludes: [BEHEMOTH] } } }],
    },
    { kind: 'unblockableByCost', levels: L23, if: ownAttackStep, attacker: { types: SPIRIT, nameIncludes: [BEHEMOTH] }, maxLevel: 2 },
  ],
  'นักร้อง มิเรฟา': [
    { kind: 'selfCostIf', cost: 5, if: ownUltimate },
    {
      kind: 'trigger',
      on: 'allyAttack',
      levels: L23,
      ownTurnOnly: true,
      subject: { types: ['ultimate'] },
      steps: [
        may(
          'เปิดการ์ดใบบนสุดเด็ค: สปิริตเผ่าดีว่า = อัลติเมทนั้นไม่ถูกป้องกันโดยสปิริต · นำการ์ดที่เปิดขึ้นมือ',
          [{ do: 'revealTopIf', filter: { types: ['spirit'], family: DIVA }, then: [{ do: 'battleUnblockable', by: 'spirits' }] }],
          { deckAtLeast: 1 },
        ),
      ],
    },
  ],
  'อัลติเมท โคริสทัล': [
    { kind: 'trigger', on: 'attack', levels: U345, steps: [{ do: 'atBattleEnd', steps: [{ do: 'destroySelf' }] }] },
    uTrigger(U345, [{ do: 'battleIndestructibleSelf' }]),
  ],
  'อัลติเมท อองจู': [yellowUnblockTrigger([3, 4])],
  'อัลติเมท โซเฟีย': [
    { kind: 'trigger', on: 'summon', levels: U345, steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], family: DIVA } }] },
    yellowUnblockTrigger(U45),
  ],
  'อัลติเมท อองเปอเรอร์': [
    uTrigger(U345, [{ do: 'summonFromHandFree', filter: { types: ['spirit'], nameIncludes: ['เพนต้น'] }, noTriggers: true, per: { uTriggerCost: true } }]),
  ],
  'อัลติเมท มิคาฟาร์': [
    uTrigger(U345, [{ do: 'magicBounceLifeThisTurn' }]),
    { kind: 'trigger', on: 'attack', levels: U45, steps: [{ do: 'useMagicFromHandFree', filter: { withShown: true } }] },
  ],
  // ---------------- เบรฟ / เน็กซัส / เมจิค เหลือง
  วิงแอร์โรว์: [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [debuff(3000)] },
    { kind: 'trigger', on: 'attack', levels: [1], granted: true, steps: [debuff(3000, { destroyAtZero: true })] },
  ],
  สถานที่ที่นางฟ้าร่อนลงมา: [
    {
      kind: 'trigger',
      on: 'startStep',
      levels: ALL2,
      steps: [may('วางการ์ดเมจิคในมือ 1 ใบแสดงนอกมือ เพื่อจั่วการ์ด 1 ใบ', [{ do: 'showFromHand', filter: { types: ['magic'] } }, { do: 'draw', count: 1 }], { handHas: { types: ['magic'] } })],
    },
    // เมนสเต็ปของเรา: อัญเชิญการ์ดอัลติเมท = สปิริตดีว่าทุกตัวได้รับเจ็มเหลือง +1 (นับตอนจ่ายคอสต์อัลติเมทนั้น)
    { kind: 'summonSymbol', levels: [2], if: { ownMainStep: true }, filter: { types: ['ultimate'] }, perAllies: { types: SPIRIT, family: DIVA }, color: 'yellow', count: 1 },
  ],
  หอสมุดคัมภีร์เวทที่ถูกผนึก: [
    [
      { kind: 'noMill', levels: ALL2 },
      { kind: 'noEffectRefresh', levels: ALL2 },
    ],
    { kind: 'magicDrawDouble', levels: [2] },
  ],
  แบทเทิลแคนเซิล: [
    { kind: 'burst', on: 'afterOpponentAttack', steps: [{ do: 'allyCoreToLife', filter: { types: SPIRITISH } }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'battleNoCompare' }] },
  ],
  เซนต์บรีซ: [
    { kind: 'magic', timing: 'flash', noDispersion: true, steps: [debuff(3000, { count: 2 }), when(rush('green'), [{ do: 'exhaustAllOpponent', filter: { types: SPIRIT, maxBp: 5000 } }])] },
  ],
  อัลติเมทพลาสมา: [
    { kind: 'trashImmune' },
    {
      kind: 'magic',
      timing: 'flash',
      useIf: { all: [ownAttackStep, { allyInBattle: { types: ['ultimate'] } }] },
      steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT }, to: 'deckBottom', count: 2 }, { do: 'draw', count: 1, per: { bouncedByThis: true } }],
    },
  ],

  // ---------------------------------------------------------------- ฟ้า (BS24)
  'ควอตซ์ โกเล็ม': [{ kind: 'trigger', on: ['attack', 'block'], levels: ALL3, steps: [mill(1)] }],
  'นักเดินเรือยักษ์ โทบี้': [
    {
      kind: 'trigger',
      on: 'allySummoned',
      levels: ALL2,
      ownTurnOnly: true,
      mainStepOnly: true,
      oncePerTurn: true,
      subject: { family: SYNTH, maxCost: 4 },
      steps: [{ do: 'voidCore', to: 'self', count: 1 }],
    },
  ],
  'ไรออต โกเล็ม': [
    // Crush: ทิ้งเด็คคู่แข่งเท่ากับ Lv ของสปิริตนี้
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [mill('level')] },
    { kind: 'replaceDestroy', levels: L23, subject: { self: true }, battle: true, exhaustOwn: NEXUS, state: 'refresh' },
  ],
  'คาราเวล โกเล็ม': [
    {
      kind: 'trigger',
      // ตามการ์ดภาษาไทย "โจมตี/ป้องกัน" (เจ้าของโปรเจกต์ยืนยัน): ทำงานตอนประกาศโจมตี (ไม่ต้องถูกป้องกัน) หรือตอนป้องกัน
      on: ['allyAttack', 'allyBlock'],
      levels: ALL2,
      attackStepOnly: true,
      subject: { card: { types: ['ultimate'], anyOf: [{ color: 'white' }, { color: 'blue' }] } },
      steps: [{ do: 'voidCore', to: 'self', count: 1 }],
    },
    [
      { kind: 'levelPlus', levels: ALL2, if: { attackStep: true }, filter: { types: ['ultimate'], family: SYNTH }, amount: 1 },
      // Rush <เจ็มขาว>: สปิริตนี้ไม่รับผลเอฟเฟกต์สปิริตของคู่แข่ง
      { kind: 'effectImmune', levels: ALL2, scope: 'self', types: ['spirit'], if: rush('white') },
    ],
  ],
  'ยักษ์โจรสลัด คิด': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        may(
          'เปิดการ์ดบนสุดเด็ค 4 ใบ นำอัลติเมทเผ่าทหารสังเคราะห์/วิญญาณนักรบทั้งหมดขึ้นมือ ที่เหลือใต้สุดเด็ค',
          [{ do: 'revealTakeAll', count: 4, filter: { types: ['ultimate'], families: [SYNTH, 'วิญญาณนักรบ'] }, rest: 'bottom' }],
          { deckAtLeast: 1 },
        ),
      ],
    },
    { kind: 'trigger', on: ['attack', 'block'], levels: L23, steps: [destroyCost(1), when(ownUltimate, [destroyCost(3)])] },
  ],
  แบร์เซนทอร์: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [destroyCost(5, { costPlusPer: { per: { allies: { types: ['ultimate'] } }, amount: 5 } })] },
    // Assault: 2
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2],
      steps: [
        {
          do: 'chooseOne',
          if: { all: [{ usedFewerThan: { key: 'assault', max: 2 } }, { selfExhausted: true }, { allyHas: { types: ['nexus'], state: 'refresh' } }] },
          options: [
            { label: '[Assault: 2] เสื่อมสภาพเน็กซัสเรา 1 ใบ: ฟื้นสภาพสปิริตนี้', steps: [{ do: 'markOnce', key: 'assault' }, { do: 'exhaustOwn', filter: { types: ['nexus'], state: 'refresh' } }, { do: 'refreshSelf' }] },
            NO,
          ],
        },
      ],
    },
  ],
  'แกลเลียน โกเล็ม': [
    { kind: 'selfCostIf', cost: 5, if: ownUltimate },
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [destroyCost(5)] },
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { types: ['ultimate'] },
      milled: { types: ['magic'] },
      steps: [{ do: 'forceBlockChosen', filter: { types: SPIRIT } }],
    },
  ],
  'มังกรหัวฉลาม ชาร์กไฮดรา': [
    {
      kind: 'trigger',
      on: ['allyDestroyed', 'oppSpiritDestroyed'],
      levels: ALL3,
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { types: SPIRIT, minCost: 8 },
      steps: [{ do: 'refreshSelf' }],
    },
  ],
  'อัลติเมท ร็อคโกเล็ม': [
    { kind: 'attackOncePerTurn', levels: U345, filter: { types: SPIRIT, maxCost: 3 } },
    millTrigger(U45, 2),
  ],
  'อัลติเมท ม่อนโกคู': [uTrigger(U345, [{ do: 'doubleBpSelf' }])],
  'อัลติเมท ไอรอนโกเล็ม': [{ kind: 'trigger', on: 'attack', levels: U345, steps: [mill('level')] }, millTrigger(U45, 2)],
  'อัลติเมท แรนดอล์ฟ': [
    millTrigger([3, 4], 2),
    {
      kind: 'trigger',
      on: 'oppDeckMilled',
      levels: [4],
      ownTurnOnly: true,
      attackStepOnly: true,
      subject: { types: ['ultimate'] },
      milled: { types: ['magic'] },
      steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, to: 'trash', per: { milledByThis: { types: ['magic'] } } }],
    },
  ],
  'อัลติเมท คาสเซิลโกเล็ม': [millTrigger(U345, 3), { kind: 'ignoreOppNoMill', levels: U45, maxCost: 5 }],
  // ---------------- เบรฟ / เน็กซัส / เมจิค ฟ้า
  'ล็อบส์ อาร์มส์': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1],
      granted: true,
      steps: [
        { ...mill(1), per: { allies: { types: SPIRITISH, family: SYNTH } } } as Step,
        { do: 'voidCore', to: 'self', count: 1, per: { milledByThis: { types: ['magic'] } } },
      ],
    },
  ],
  รูปปั้นแซฟไฟร์: [
    { kind: 'trigger', on: 'oppDeckMilled', levels: ALL2, ownTurnOnly: true, attackStepOnly: true, subject: { uTriggerMill: true }, milledMax: 6, steps: [mill(4)] },
    { kind: 'trigger', on: 'oppBurstActivated', levels: [2], attackStepOnly: true, steps: [mill(7)] },
  ],
  ประตูชัยที่ถูกลืม: [
    { kind: 'burstMagicBan', levels: ALL2, mode: 'gemColor', magicOnly: true },
    { kind: 'noLifeFromVoid', levels: [2], opponentOnly: true },
  ],
  เคลียร์เอดจ์: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'opponentDiscardTo', keep: 3, withShown: true }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000 }] },
  ],
  โอเวอร์ไดรฟ์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { do: 'buffChosen', amount: 5000, filter: { types: SPIRITISH } },
        when(rush('white'), [{ do: 'refreshChosenAlly', filter: { types: SPIRIT, color: 'blue' } }]),
        when(rush('white', 2), [{ do: 'bounceAllOpponent', filter: { types: SPIRIT, minSymbols: 2 } }]),
      ],
    },
  ],
  เบรกไกรนด์: [
    { kind: 'burst', on: 'afterOpponentSummonEffect', steps: [{ do: 'opponentTotalBp', maxTotal: 3, action: 'destroy', metric: 'cost', filter: { types: SPIRIT } }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [destroyCost(3, { count: 3 }), { ...mill(2), per: { destroyedByThis: true } } as Step] },
  ],
};
