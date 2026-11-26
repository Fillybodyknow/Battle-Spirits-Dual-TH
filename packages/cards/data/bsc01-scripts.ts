/**
 * สคริปต์เอฟเฟกต์ของชุด BSC01 ผูกกับการ์ดด้วยชื่อ (การ์ดจาก BSC15: สปิริตเบิร์ส + เมจิคเบิร์สทุกสี)
 * ช่องที่ i = บรรทัดเอฟเฟกต์ที่ i, null = ยังไม่รองรับใน engine
 *
 * ธีมชุด: เบิร์สอัญเชิญตัวเองไม่จ่ายคอสต์ "เมื่อมีอัลติเมท(สี…)ของเราอยู่" = when(ownUltimate)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import type { Color } from '../src/schema';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ALL2 = [1, 2];
const ALL3 = [1, 2, 3];
const L23 = [2, 3];
const NO = { label: 'ไม่ใช้', steps: [] as Step[] };
const DRAGON_MAN = 'มนุษย์มังกร';
const CURSED = 'มารต้องสาป';
const SYNTH = 'ทหารสังเคราะห์';

/** มีอัลติเมท (สี color) ของเราอยู่บนสนาม */
const ownUltimate = (color?: Color): Condition => ({ alliesMatchAtLeast: { filter: { types: ['ultimate'], ...(color ? { color } : {}) }, count: 1 } });

const may = (label: string, steps: Step[], cond?: Condition): Step => ({ do: 'chooseOne', ...(cond ? { if: cond } : {}), options: [{ label, steps }, NO] });
const when = (cond: Condition, steps: Step[], elseSteps?: Step[]): Step => ({ do: 'when', if: cond, steps, ...(elseSteps ? { else: elseSteps } : {}) });
const destroy = (filter: CardFilter, extra: { count?: number } = {}): Step => ({ do: 'destroyChosenOpponent', filter, ...extra });
const exhaust = (count = 1): Step => ({ do: 'exhaustOpponent', count, filter: { types: SPIRIT } });
const summonThis: Step = { do: 'summonThisFree' };
/** [Flash] ในเทิร์นนี้ สปิริต/อัลติเมท 1 ตัว BP+2000 */
const flashBuff = { kind: 'magic' as const, timing: 'flash' as const, steps: [{ do: 'buffChosen' as const, amount: 2000 }] };

export const BSC01_SCRIPTS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- สปิริต
  'ริวแมน แฮมเมอร์': [
    { kind: 'burst', on: 'afterLifeLost', steps: [destroy({ types: SPIRIT, maxBp: 4000 }, { count: 3 }), when(ownUltimate('red'), [summonThis])] },
    { kind: 'trigger', on: 'destroyed', levels: L23, steps: [{ do: 'destroyOpponentBrave' }] },
  ],
  โกซุดีมอน: [
    {
      kind: 'burst',
      on: 'afterAllyDestroyedByOpponent',
      steps: [
        may(
          'นำการ์ดสปิริตเผ่ามารต้องสาปในแทรชขึ้นมือ: อัญเชิญโกซุดีมอนไม่จ่ายคอสต์',
          [{ do: 'returnFromTrash', filter: { types: SPIRIT, family: CURSED } }, summonThis],
          { trashHas: { types: SPIRIT, family: CURSED } },
        ),
      ],
    },
    // Curse
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'atBattleEnd', steps: [{ do: 'curseResolve' }] }] },
  ],
  ซาโตริดีมอน: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'opponentCoresDownToOne' }, when(ownUltimate(), [summonThis])] },
    { kind: 'trigger', on: 'allyBurstActivated', zone: 'trash', levels: [1], steps: [{ do: 'selfFromTrashToHand' }] },
  ],
  ฮานะโนะแมนทิส: [
    // "สปิริตคอสต์ไม่เกิน 3 ทั้งหมด" ไม่ระบุฝั่ง = ของผู้เล่นทุกคน
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'exhaustAllOpponent', filter: { types: SPIRIT, maxCost: 3 }, bothSides: true }, summonThis] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [when(ownUltimate(), [exhaust()])] },
  ],
  ซอว์กริซลี่: [
    { kind: 'burst', on: 'afterAllyDestroyedByOpponent', alsoDepleted: true, steps: [exhaust(2), when(ownUltimate(), [summonThis])] },
    // "เมื่อสปิริตนี้โจมตี/ป้องกัน": มีผลจนจบการต่อสู้นั้น
    { kind: 'trigger', on: ['attack', 'block'], levels: [2], steps: [{ do: 'battleNoBurst' }] },
  ],
  'เฮฟวี่ แทงก์โมบิล T-35': [
    { kind: 'burst', on: 'afterAllyDestroyedByOpponent', steps: [summonThis] },
    [
      { kind: 'blockWhileExhausted', levels: [2] },
      { kind: 'staticBp', levels: [2], if: { all: [{ oppTurn: true }, { attackStep: true }, ownUltimate()] }, scope: { self: true }, amount: 3000 },
    ],
  ],
  ทัวร์มาลีนดรากูน: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'bounceOpponentBurst' }, when(ownUltimate(), [summonThis])] },
    { kind: 'depletionSave', levels: ALL2, filter: {}, selfVoid: true },
    { kind: 'replaceDestroy', levels: [2], subject: { self: true }, auto: true, state: 'exhausted' },
  ],
  เนเมียนไลอ้อน: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'opponentCannotAttack', types: SPIRIT, filter: { maxCost: 4 } }, summonThis] },
    { kind: 'trigger', on: 'destroyedByOpponent', levels: L23, steps: [{ do: 'draw', count: 1 }, when(ownUltimate('yellow'), [{ do: 'draw', count: 1 }])] },
  ],
  นางฟ้าเดลูเอล: [
    {
      kind: 'burst',
      on: 'afterOpponentAttack',
      steps: [
        { do: 'debuffChosenOpponent', amount: 3000, filter: { types: SPIRIT } },
        when(ownUltimate('yellow'), [summonThis, { do: 'setBurstFromHand' }]),
      ],
    },
    { kind: 'effectImmune', levels: [3], if: { ownBurstSet: true }, scope: 'self', types: ['spirit', 'brave'] },
  ],
  'บริแกน โกเล็ม': [
    { kind: 'burst', on: 'afterAllyDestroyedByOpponent', steps: [summonThis] },
    {
      kind: 'activated',
      levels: ALL2,
      timing: 'attackFlash',
      label: 'เสื่อมสภาพสปิริต/อัลติเมทของเรา: ทำลายสปิริตที่มี "ไม่ถูกป้องกัน" ของคู่แข่ง',
      if: {
        all: [
          { oppTurn: true },
          { allyHas: { types: SPIRITISH, state: 'refresh' } },
          { opponentHas: { types: SPIRIT, textIncludes: ['ไม่ถูกป้องกัน'] } },
        ],
      },
      steps: [{ do: 'exhaustOwn', filter: { types: SPIRITISH, state: 'refresh' } }, destroy({ types: SPIRIT, textIncludes: ['ไม่ถูกป้องกัน'] })],
    },
  ],
  'ฟริเกต โกเล็ม': [
    { kind: 'burst', on: 'afterLifeLost', steps: [when(ownUltimate('blue'), [summonThis])] },
    // "เบรฟของสปิริตร่วมร่างของคู่แข่งถือว่ามีคอสต์ 0" = ตอนเลือกเป้าของเอฟเฟกต์นี้ นับคอสต์ไม่รวมเบรฟ
    { kind: 'trigger', on: 'summon', levels: ALL3, steps: [destroy({ types: SPIRIT, maxCost: 8, ignoreBraveCost: true })] },
    { kind: 'staticBp', levels: L23, if: { oppTurn: true }, scope: { own: { types: SPIRITISH, family: SYNTH } }, amount: 2000 },
  ],
  'ริวแมน ก็อดเบรกเกอร์': [
    {
      kind: 'burst',
      on: 'afterLifeLost',
      steps: [destroy({ types: SPIRIT, maxBp: 10000 }), when(ownUltimate(), [{ do: 'draw', count: 1 }, summonThis])],
    },
    {
      kind: 'trigger',
      on: 'attack',
      levels: L23,
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'ทิ้งการ์ดอัลติเมทในมือ 1 ใบ: ฟื้นสภาพริวแมน ก็อดเบรกเกอร์', if: { handHas: { types: ['ultimate'] } }, steps: [{ do: 'discard', count: 1, filter: { types: ['ultimate'] } }, { do: 'refreshSelf' }] },
            {
              label: 'ทิ้งการ์ดสปิริตเผ่ามนุษย์มังกรในมือ 2 ใบ: ฟื้นสภาพริวแมน ก็อดเบรกเกอร์',
              if: { handHas: { types: SPIRIT, family: DRAGON_MAN }, count: 2 },
              steps: [{ do: 'discard', count: 2, filter: { types: SPIRIT, family: DRAGON_MAN } }, { do: 'refreshSelf' }],
            },
            NO,
          ],
        },
      ],
    },
  ],

  // ---------------------------------------------------------------- เมจิค
  เฟลมเบิร์สต์: [
    { kind: 'burst', on: 'afterAllyDestroyedByOpponent', steps: [{ do: 'destroyAllBoth', filter: { types: SPIRIT, maxBp: 3000 } }, { do: 'payToUseFlash' }] },
    flashBuff,
  ],
  เดธเบิร์สต์: [
    { kind: 'burst', on: 'afterLifeLost', steps: [destroy({ types: SPIRIT, state: 'exhausted' }), { do: 'payToUseFlash' }] },
    flashBuff,
  ],
  เบิร์สต์แบริเออร์: [
    { kind: 'burst', on: 'afterLifeLost', steps: [{ do: 'lifeShieldThisTurn', maxCost: 3, spiritsOnly: true }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'bounceOpponent', filter: { types: ['nexus'] } }] },
  ],
  เรโซแนนซ์เบิร์สต์: [
    { kind: 'burst', on: 'afterOpponentSummonEffect', steps: [{ do: 'opponentNoMagicThisTurn' }, { do: 'payToUseFlash' }] },
    { kind: 'magic', timing: 'flash', steps: [destroy({ types: SPIRIT, maxCost: 4, textIncludes: ['เมื่อสปิริตนี้ถูกอัญเชิญ'] })] },
  ],
};
