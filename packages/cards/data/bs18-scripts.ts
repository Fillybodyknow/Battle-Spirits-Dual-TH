/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 18 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BS26 สีแดง / ขาว / ม่วง)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * U Trigger (กติกา 05 ข้อ 4): step uTrigger · Critical Hit = when({ uTriggerCard: ตัวกรอง }, ...)
 * Trigger Counter (BS26): ability triggerCounter บนการ์ดในมือ → ถามเจ้าของเด็คตอน U Trigger ของคู่แข่งฮิต ก่อนผลฮิต
 *   (เบรฟ = จ่ายคอสต์อัญเชิญแล้วทำ steps · เมจิค = จ่ายคอสต์ใช้แล้วทำ steps)
 * บรรทัด [ร่วมร่าง] ของสปิริต = ใส่ if: { selfBraved: true } เอง
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const U345 = [3, 4, 5];
const U45 = [4, 5];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const STAR_DRAGON = 'มังกรดวงดาว';
const DRAGON_MAN = 'มนุษย์มังกร';
const STAR_GENERAL = 'ขุนพลดวงดาว';
const STAR_SOUL = 'วิญญาณดวงดาว';
const LIGHT_GUIDE = 'ดาราจักร';
const THREE_DRAGON_GODS = 'สามเทพมังกร';
const draw = (count = 1): Step => ({ do: 'draw', count });
const destroy = (filter: CardFilter, count?: number): Step => ({ do: 'destroyChosenOpponent', filter, ...(count ? { count } : {}) });
const braved: Condition = { selfBraved: true };
const ownAttackStep: Condition = { ownAttackStep: true };

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
/** U Trigger เมื่ออัลติเมทนี้โจมตี */
const uTrigger = (levels: number[], then: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'uTrigger' as const, then }] });
/** [ร่วมร่าง] เมื่อสปิริตนี้โจมตีขณะร่วมร่าง */
const bravedAttack = (levels: number[], steps: Step[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, if: braved, steps });
/** อัญเชิญเบรฟเผ่านี้จากมือโดยไม่จ่ายคอสต์ */
const braveFromHand = (family: string): Step => ({ do: 'summonFromHandFree', filter: { types: ['brave'], family } });
/** Ultra Shield: ไม่รับผลเอฟเฟกต์ของสปิริต/อัลติเมท/เน็กซัส/เมจิค */
const ULTRA: ('spirit' | 'ultimate' | 'nexus' | 'magic')[] = ['spirit', 'ultimate', 'nexus', 'magic'];
const ultraShield = (levels: number[], colors: ('red' | 'green' | 'white')[], granted = false) => ({
  kind: 'effectImmune' as const,
  levels,
  scope: 'self' as const,
  colors,
  types: ULTRA,
  ...(granted ? { granted: true as const } : {}),
});
const attackStep: Condition = { attackStep: true };
const GALAXY = 'ดาราจักร';
const HAS_TC: CardFilter = { types: ['brave'], textIncludes: ['Trigger Counter'] };
/** อัญเชิญเบรฟ [ดาราจักร]/[วิญญาณดวงดาว] จากมือ (ขุนพลดวงดาว): ดาราจักรสำเร็จ = galaxyThen */
const starGeneralSummon = (galaxyLabel: string, galaxyThen: Step[]): Step => ({
  do: 'chooseOne',
  options: [
    { label: `อัญเชิญเบรฟเผ่า [${GALAXY}] จากมือ: ${galaxyLabel}`, if: { handHas: { types: ['brave'], family: GALAXY } }, steps: [{ ...braveFromHand(GALAXY), then: galaxyThen } as Step] },
    { label: `อัญเชิญเบรฟเผ่า [${STAR_SOUL}] จากมือ`, if: { handHas: { types: ['brave'], family: STAR_SOUL } }, steps: [braveFromHand(STAR_SOUL)] },
    NO,
  ],
});

export const BS18_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- แดง (BS26)
  'สตาร์รี่ ริวแมน': [
    { kind: 'coreFloor', levels: ALL2, filter: { types: SPIRIT, family: STAR_DRAGON }, min: 1, anyPlayer: true },
    { kind: 'trigger', on: 'block', levels: ALL2, steps: [destroy({ types: SPIRIT, maxBp: 6000 })] },
  ],
  ดราโก้สปีดเดอร์: [
    { kind: 'trigger', on: 'attack', levels: ALL3, steps: [draw()] },
    // สามารถระบุสปิริต/อัลติเมทที่ฟื้นสภาพ แล้วโจมตีตัวนั้น (แบบปเทอร์ไฟเตอร์)
    bravedAttack(L23, [{ do: 'chooseBlockers', filter: { types: SPIRITISH, state: 'refresh' }, direct: true }]),
  ],
  เครื่องบินรบปเทรา: [
    {
      kind: 'trigger',
      on: 'uTriggerGuarded',
      zone: 'hand',
      levels: [],
      steps: [may('อัญเชิญเครื่องบินรบปเทราจากมือโดยไม่จ่ายคอสต์', [{ do: 'summonThisFree' }])],
    },
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'destroyOpponentBrave' }] },
  ],
  อัลโลเบลดเดอร์: [
    { kind: 'trigger', on: 'attack', levels: ALL2, steps: [destroy({ types: SPIRIT, maxBp: 4000 })] },
    bravedAttack([2], [{ do: 'bpDestroyBoostBattle', amount: 6000 }]),
  ],
  'พลีอาดีส ร็อคดราก้อน': [
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'symbolChosenAllyThisTurn', color: 'red', count: 1, filter: { types: SPIRIT, family: STAR_GENERAL, notSelf: true } }] },
    { kind: 'extraSymbol', levels: [3], if: { all: [braved, ownAttackStep] }, color: 'red', count: 1 },
  ],
  'แม่ทัพมังกรเพลิง อิฟริต': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: `อัญเชิญเบรฟเผ่า [${LIGHT_GUIDE}] จากมือ: ในเทิร์นนี้ ${STAR_GENERAL} ทั้งหมดของเราเจ็มแดง +1`,
              if: { handHas: { types: ['brave'], family: LIGHT_GUIDE } },
              // ได้เจ็มเมื่ออัญเชิญสำเร็จเท่านั้น
              steps: [{ ...braveFromHand(LIGHT_GUIDE), then: [{ do: 'symbolAlliesThisTurn', filter: { types: SPIRIT, family: STAR_GENERAL }, color: 'red', count: 1 }] } as Step],
            },
            { label: `อัญเชิญเบรฟเผ่า [${STAR_SOUL}] จากมือ`, if: { handHas: { types: ['brave'], family: STAR_SOUL } }, steps: [braveFromHand(STAR_SOUL)] },
            NO,
          ],
        },
      ],
    },
    bravedAttack(L23, [{ do: 'destroyChosenOpponent', filter: { types: SPIRIT }, bpFrom: 'self' }]),
  ],
  'ริวแมน แฟนตาซิสต้า': [
    { kind: 'trigger', on: 'ownAttackStepStart', levels: ALL3, steps: [{ do: 'trashCoresSpread', filter: { types: SPIRITISH, family: DRAGON_MAN } }] },
    { kind: 'staticBp', levels: L23, if: ownAttackStep, scope: { own: { types: SPIRIT, family: DRAGON_MAN } }, amount: 5000, perAllies: { types: ['ultimate'] } },
  ],
  'จักรพรรดิมังกร ไกเซอร์ดราก้อน': [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [may('เปิดการ์ด 6 ใบจากบนสุดเด็ค: นำการ์ดเบรฟขึ้นมือ', [{ do: 'revealTakeAll', count: 6, filter: { types: ['brave'] }, rest: 'top' }])] },
    bravedAttack([2], [{ do: 'battleLifeIfBlocked', amount: 2, blocker: { types: SPIRITISH, bpBelowAttacker: true } }]),
  ],
  'มังกรเพลิงชาด ฮิโนโกะ': [
    [
      { kind: 'ignoreSummonCondition', levels: U345, filter: { types: ['ultimate'], maxCost: 7 }, always: true },
      { kind: 'ultimateSymbolsAlso', levels: U345, colors: ['red'] },
    ],
    uTrigger(U45, [draw(2)]),
  ],
  'เกราะดาวปืนใหญ่ บัลด์ลิซาร์ด': [
    { kind: 'triggerCounter', levels: [], steps: [destroy({ types: ['ultimate'], inBattle: true, maxBp: 10000 })] },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }] },
  ],
  'เกราะดาววิหค ชิโซเบิร์ด': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [
        destroy({ types: SPIRIT, maxBp: 4000 }, 2),
        may(
          'เสื่อมสภาพสปิริตของเรา 1 ตัว เพื่อทำลายเน็กซัสของคู่แข่ง 1 ใบ',
          [{ do: 'exhaustOwn', filter: { types: SPIRIT } }, destroy({ types: ['nexus'] })],
          { all: [{ alliesMatchAtLeast: { filter: { types: SPIRIT, state: 'refresh' }, count: 1 } }, { opponentHas: { types: ['nexus'] } }] },
        ),
      ],
    },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'bpDestroyUltimateBattle' }] },
  ],
  หุบเขาใหญ่ไกน่าร็อค: [
    { kind: 'trigger', on: 'oppSummoned', subject: { types: ['ultimate'] }, levels: ALL2, oppTurnOnly: true, mainStepOnly: true, steps: [draw(2)] },
    { kind: 'summonSymbol', levels: [2], if: { ownMainStep: true }, filter: { types: ['spirit'], hasBravedEffect: true }, color: 'red', count: 2 },
  ],
  ประกายแห่งซูเปอร์โนวา: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [{ do: 'handCostLifeThisTurn', filter: { types: ['ultimate'], family: THREE_DRAGON_GODS } }] },
    { kind: 'ultimatesAsSpiritsForSummon', levels: [2], filter: { types: ['ultimate'], family: THREE_DRAGON_GODS }, ownMainStepOnly: true },
  ],
  แคนนอนบอล: [
    { kind: 'triggerCounter', levels: [], steps: [destroy({ types: ['ultimate'], inBattle: true, minBp: 20000 })] },
    { kind: 'magic', timing: 'main', steps: [draw(2)] },
  ],
  คริมสันแฟลร์: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: 'ทำลายสปิริตร่วมร่างของคู่แข่งที่มีเจ็ม 1 เม็ด 2 ตัว',
              if: { opponentHas: { types: SPIRIT, hasBraves: true, minSymbols: 1, maxSymbols: 1 } },
              steps: [destroy({ types: SPIRIT, hasBraves: true, minSymbols: 1, maxSymbols: 1 }, 2)],
            },
            {
              label: 'ทำลายสปิริตของคู่แข่งที่มีเจ็ม 2 เม็ด 1 ตัว',
              if: { opponentHas: { types: SPIRIT, minSymbols: 2, maxSymbols: 2 } },
              steps: [destroy({ types: SPIRIT, minSymbols: 2, maxSymbols: 2 })],
            },
          ],
        },
      ],
    },
  ],
  'อัลติเมท ซีคเวิร์ม โนวา': [
    { kind: 'trigger', on: 'summon', levels: U345, steps: [{ do: 'uTrigger', then: [{ do: 'gainLifeFromVoid', count: 1, per: { uTriggerCost: true }, maxLife: 5 } as Step] }] },
    uTrigger(U45, [{ do: 'mustBlock' }, when({ uTriggerCard: { maxCost: 4 } }, [destroy({ types: SPIRIT, maxBp: 12000 })])]),
  ],
  // ---------------------------------------------------------------- ขาว (BS26)
  'แทงก์โมบิล เลโอพาร์ด': [
    ultraShield(ALL2, ['red']),
    bravedAttack([2], [{ do: 'bounceOpponent', filter: { types: SPIRIT, maxCost: 4 } }]),
  ],
  'แอมเบอร์ เลออน': [
    {
      kind: 'trigger',
      on: 'block',
      levels: ALL2,
      steps: [
        may(
          'นำเบรฟที่มี Trigger Counter ของสปิริตร่วมร่างของเรากลับขึ้นมือ: สปิริตนี้ BP+5000',
          [{ do: 'ownBraveToHand', filter: { textIncludes: ['Trigger Counter'] }, then: [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }] }],
          { ownBraveHas: { textIncludes: ['Trigger Counter'] } },
        ),
      ],
    },
    { kind: 'effectImmune', levels: [2], scope: { own: { types: SPIRIT, maxBp: 3000 } }, types: ['ultimate'] },
  ],
  'เทพธิดาโชคชะตา สคูลด์': [
    ultraShield(ALL3, ['green', 'white']),
    { kind: 'costBoost', levels: L23, if: attackStep, filter: { types: ['ultimate'], color: 'white' }, amount: 1 },
    {
      kind: 'trigger',
      on: 'allyUTriggerHit',
      levels: [3],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'onBattleHitLife', target: 'subject', steps: [{ do: 'opponentLifeToReserve', count: 1 }] }],
    },
  ],
  'เครื่องจักรเทพปืนใหญ่ ไฮม์แคนนอน': [
    {
      kind: 'trigger',
      on: 'uTriggerGuarded',
      levels: ALL2,
      attackStepOnly: true,
      steps: [may('อัลติเมทของเราที่กำลังต่อสู้ฟื้นสภาพ (ในเทิร์นนี้โจมตีไม่ได้)', [{ do: 'refreshBattlingUltimateNoAttack' }])],
    },
  ],
  'เครื่องจักรอสูรเขาเดียว ยูนิคอร์น': [
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      zone: 'hand',
      subject: { byOpponent: true, card: { types: SPIRIT, color: 'white', minCost: 5 } },
      levels: [],
      steps: [may('อัญเชิญเครื่องจักรอสูรเขาเดียว ยูนิคอร์นจากมือโดยไม่จ่ายคอสต์', [{ do: 'summonThisFree' }])],
    },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: [2],
      if: { all: [braved, { usedFewerThan: { key: 'unicorn', max: 1 } }] },
      steps: [{ do: 'markOnce', key: 'unicorn' }, { do: 'refreshSelf' }],
    },
  ],
  'ขุนพลอัศวินขาว ซิกเฟซุล': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: `อัญเชิญเบรฟเผ่า [${GALAXY}] จากมือ: คู่แข่งนำสปิริตของตัวเอง 1 ตัวกลับไปไว้ใต้สุดเด็ค`,
              if: { handHas: { types: ['brave'], family: GALAXY } },
              steps: [{ ...braveFromHand(GALAXY), then: [{ do: 'opponentBottomsOwn', filter: { types: SPIRIT } }] } as Step],
            },
            { label: `อัญเชิญเบรฟเผ่า [${STAR_SOUL}] จากมือ`, if: { handHas: { types: ['brave'], family: STAR_SOUL } }, steps: [braveFromHand(STAR_SOUL)] },
            NO,
          ],
        },
      ],
    },
    { kind: 'targetDodge', levels: L23, if: { all: [braved, attackStep, { usedFewerThan: { key: 'dodge', max: 1 } }] }, key: 'dodge' },
  ],
  'โอนิกซ์ดราก้อน ไรเดอร์': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL2,
      steps: [{ do: 'bounceAllOpponent', filter: { types: SPIRIT, maxBp: 5000 } }, { do: 'voidCore', to: 'self', count: 1, per: { bouncedByThis: true } }],
    },
    { kind: 'trigger', on: 'oppExhausted', subject: { types: ['ultimate'] }, levels: [2], if: braved, attackStepOnly: true, steps: [{ do: 'refreshSelf' }] },
  ],
  'จักรพรรดิเทพสายฟ้า เทรน': [
    [
      { kind: 'ignoreSummonCondition', levels: U345, filter: { types: ['ultimate'], maxCost: 7 }, always: true },
      { kind: 'ultimateSymbolsAlso', levels: U345, colors: ['white'] },
    ],
    { kind: 'trigger', on: 'block', levels: U45, steps: [{ do: 'uTrigger', then: [{ do: 'voidCore', to: 'self', count: 1 }, { do: 'refreshSelf' }] }] },
  ],
  'เกราะดาวโล่ ชิลด์แทงก์': [
    ultraShield([], ['green', 'white'], true),
    {
      kind: 'trigger',
      on: 'block',
      granted: true,
      levels: [],
      steps: [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }, when({ battleAttacker: { types: ['ultimate'] } }, [{ do: 'buffSelf', amount: 5000, untilBattleEnd: true }])],
    },
  ],
  'เกราะดาวดาบ ซอร์ดฟิช': [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'immuneAlliesThisTurn', fromTypes: ['ultimate'] }] },
    { kind: 'trigger', on: ['attack', 'block'], granted: true, levels: [], steps: [{ do: 'buffSelf', amount: 3000, untilBattleEnd: true }] },
  ],
  'จุดเชื่อมกาลอวกาศ A-01': [
    { kind: 'summonConditionMinCost', levels: ALL2, if: { mainStep: true }, min: 3 },
    { kind: 'trigger', on: 'allyDeckMilled', levels: [2], milled: { types: ['brave'] }, steps: [{ do: 'noMillThisTurn' }] },
  ],
  แนวป้องกันสมบูรณ์แบบนอร์แลนดี: [
    { kind: 'trigger', on: 'uTriggerGuarded', subject: { card: { types: ['ultimate'], minBp: 10000 } }, levels: ALL2, steps: [{ do: 'voidCore', to: 'reserve', count: 1 }] },
    { kind: 'trigger', on: 'lifeLost', levels: [2], oppTurnOnly: true, attackStepOnly: true, if: { lifeLostAtLeast: 2 }, steps: [{ do: 'endAttackStepAfterBattle' }] },
  ],
  อัลติเมทอีเรเซอร์: [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'bounceOpponent', filter: { types: ['ultimate'], inBattle: true, maxBp: 20000 } }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'bounceOpponent', filter: { types: SPIRIT } }] },
  ],
  แอนตี้เบรฟแบริเออร์: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'lifeShieldThisTurn', braved: true }] }],
  'เกราะดาวคนโท เบรฟอควาเรียส': [
    ultraShield([], ['red', 'white'], true),
    {
      kind: 'trigger',
      on: 'endStep',
      granted: true,
      levels: [],
      steps: [
        may(
          'นำเบรฟที่ไม่มีเอฟเฟกต์ [เมื่อเบรฟนี้ถูกอัญเชิญ] ของสปิริตร่วมร่างของเรากลับขึ้นมือ: คอร์จากวอยด์ 1 เม็ดไปบนสปิริตของเรา',
          [{ do: 'ownBraveToHand', filter: { noTextIncludes: ['เมื่อเบรฟนี้ถูกอัญเชิญ'] }, then: [{ do: 'voidCore', to: 'ally', count: 1 }] }],
          { ownBraveHas: { noTextIncludes: ['เมื่อเบรฟนี้ถูกอัญเชิญ'] } },
        ),
      ],
    },
  ],

  // ---------------------------------------------------------------- ม่วง (BS26)
  สม็อกชีพ: [{ kind: 'replaceDestroy', levels: ALL3, subject: { card: { types: SPIRIT } }, oppUltCore: true }],
  ฮอร์นไวเปอร์: [
    { kind: 'trigger', on: 'summon', levels: ALL2, steps: [draw()] },
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], if: braved, steps: [draw()] },
  ],
  'ซีแบ็ค อาร์เมอร์': [
    {
      kind: 'trigger',
      on: 'allyExhausted',
      subject: { types: ['ultimate'], exhaustedByOpponentEffect: true },
      levels: ALL2,
      steps: [
        may(
          'ส่งคอร์บนสปิริตคู่แข่ง 1 เม็ดไปแทรช: อัลติเมทนั้นฟื้นสภาพ',
          [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, to: 'trash' }, { do: 'refreshSubject' }],
          { opponentHas: { types: SPIRIT, minCores: 1 } },
        ),
      ],
    },
  ],
  ลิงซ์โมเกอร์: [
    {
      kind: 'trigger',
      on: 'destroyedByOpponent',
      levels: ALL3,
      steps: [{ do: 'opponentDiscards', count: 1 }, when({ destroyedBy: { types: ['ultimate'] } }, [{ do: 'opponentDiscards', count: 1 }])],
    },
  ],
  โบนริตเตอร์: [
    { kind: 'replaceDestroy', levels: ALL2, subject: { self: true }, millSelfIf: { types: ['spirit', 'brave'], color: 'purple' }, battle: true },
    bravedAttack([2], [{ do: 'returnFromTrash', filter: HAS_TC }]),
  ],
  'อัศวินนรก คิลเมดีส': [{ kind: 'trigger', on: 'summon', levels: ALL3, steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, depletedToDeckTop: true }] }],
  'ขุนพลเถ้ากระดูก มุคุโระ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [
        starGeneralSummon('ส่งคอร์บนอัลติเมทคู่แข่ง 1 เม็ดไปแทรชได้', [
          may('ส่งคอร์บนอัลติเมทของคู่แข่ง 1 เม็ดไปแทรช', [{ do: 'removeOpponentCores', count: 1, filter: { types: ['ultimate'] }, to: 'trash' }], { opponentHas: { types: ['ultimate'], minCores: 1 } }),
        ]),
      ],
    },
    bravedAttack(L23, [{ do: 'blockTax', reserveToTrash: 0, discard: 1, discardFilter: { types: ['magic'] } }]),
  ],
  ควีนไนท์แมร์: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL3,
      steps: [{ do: 'returnAllFromTrash', filter: { types: ['brave'] } }, { do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT }, per: { returnedByThis: true } }],
    },
    bravedAttack(L23, [{ do: 'blockTax', reserveToTrash: 0, lifeToReserve: 1, ultimatesOnly: true }]),
  ],
  'จักรพรรดิปีศาจ เดวิด': [
    [
      { kind: 'ignoreSummonCondition', levels: [3, 4], filter: { types: ['ultimate'], maxCost: 7 }, always: true },
      { kind: 'ultimateSymbolsAlso', levels: [3, 4], colors: ['purple'] },
    ],
    { kind: 'replaceDestroy', levels: [4], subject: { self: true }, uTriggerStay: true, then: [draw()], state: 'refresh', battle: true, ownToo: true },
  ],
  'เกราะดาวมาร ฟลายบีท': [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: ['ultimate'], inBattle: true } }] },
    { kind: 'trigger', on: 'oppDepleted', granted: true, subject: { types: ['ultimate'] }, levels: [], steps: [draw()] },
  ],
  'เกราะดาวอสรพิษ สเนคเคิลส์': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRITISH, maxCost: 6 } }] },
  ],
  'เมืองแห่งความโศก โทรเมอา': [
    { kind: 'triggerCounterFree', levels: ALL2 },
    { kind: 'trigger', on: 'endStep', levels: [2], ownTurnOnly: true, steps: [{ do: 'returnFromTrash', filter: { types: ['brave'] } }] },
  ],
  คอร์เดรน: [
    { kind: 'triggerCounter', levels: [], steps: [{ do: 'removeOpponentCores', count: 1, perPick: 2, filter: { types: ['ultimate'], inBattle: true }, to: 'trash' }] },
    {
      kind: 'magic',
      timing: 'flash',
      steps: [{ do: 'removeOpponentCores', count: 1, filter: { types: SPIRIT } }, when({ depletedByThis: { types: SPIRIT, minCost: 5 } }, [{ do: 'trashCoreToLife', count: 1 }])],
    },
  ],
  ฟอร์บิดเดนเกรฟ: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'summonFromTrashFree', filter: { types: ['ultimate'], families: ['รุ่นใหม่', 'มารต้องสาป'] } }] }],
  'เกราะดาวมีนคู่ เบรฟพิสเกส': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [{ do: 'coresOffEveryOpponent' }, { do: 'draw', count: 1, per: { depletedByThis: { types: ['ultimate'] } } } as Step] },
    {
      kind: 'trigger',
      on: 'attack',
      granted: true,
      levels: [],
      steps: [
        may(
          'ทิ้งการ์ดสีม่วงในมือ 1 ใบ: ทำลายอัลติเมทของคู่แข่งที่เสื่อมสภาพ 1 ตัว',
          [{ do: 'discard', count: 1, filter: { color: 'purple' } }, destroy({ types: ['ultimate'], state: 'exhausted' })],
          { all: [{ handHas: { color: 'purple' } }, { opponentHas: { types: ['ultimate'], state: 'exhausted' } }] },
        ),
      ],
    },
  ],

};
