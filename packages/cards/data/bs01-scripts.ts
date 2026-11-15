/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 01 ผูกกับการ์ดด้วยชื่อ
 * แต่ละช่องตรงกับบรรทัดเอฟเฟกต์ใน assets/files/BS01/*.text ตามลำดับ
 * (ช่องที่เป็น array = บรรทัดเดียวมีหลายความสามารถ)
 */
import type { CardFilter, CardScript, Condition } from '../src/abilities';
import { SD01_SCRIPTS } from './sd01-scripts';

/** การ์ดที่อยู่ใน Starter Deck 01 ด้วย: ใช้สคริปต์ชุดเดียวกัน */
const FROM_SD01 = [
  'ฮิเอ็นดราก้อน',
  'ฮากาเนะวูม',
  'โซลดรอว์',
  'โอนิมุฉะไรซัน',
  'ซามูไร-ดราก้อน',
  'มังกรเซ็นโงคุ โซลดราก้อน',
  'มังกรศรชัย เบียวฮะ',
  'หุบเหวร้อยปราชญ์',
  'อิคุสะ โทคาเงะ',
  'มุฉะดาริว',
  'จินไรดราก้อน',
  'มุฉะดราโค',
  'คาบุริว ดรอว์',
  'เซ็นโกคุ-กุเร็นดราก้อน',
];

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ULTIMATE: CardFilter['types'] = ['ultimate'];
const NEXUS: CardFilter = { types: ['nexus'] };
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const notPaidSoul: Condition = { not: paidSoul };
const ownAttackStep: Condition = { ownAttackStep: true };
const ALL_LV = [1, 2, 3];
const destroy = (filter: CardFilter, extra: { count?: number; if?: Condition } = {}) => ({ do: 'destroyChosenOpponent' as const, filter, ...extra });
const trueRage = (levels: number[]) => ({ kind: 'trigger' as const, on: 'attack' as const, levels, steps: [{ do: 'mustBlock' as const }] });

export const BS01_SCRIPTS: Record<string, CardScript> = {
  ...Object.fromEntries(FROM_SD01.map((name) => [name, SD01_SCRIPTS[name]!])),

  // ---------------------------------------------------------------- Brave
  'ชุดเกราะมังกร ดรากุมารุ': [{ kind: 'trigger', on: ['attack', 'block'], granted: true, levels: [], steps: [{ do: 'buffSelf', amount: 4000 }] }],
  'มังกรบินชุดเกราะ โอโซเดลเกอร์': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [destroy({ types: SPIRITISH, maxBp: 4000 }, { count: 3 }), { do: 'destroyOpponentBrave', if: paidSoul }],
    },
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'mustBlock' }] },
  ],
  'ชุดเกราะขุนพลดาบ แอช-ไลอ้อน': [
    { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'opponentDestroysOwn', filter: { types: SPIRITISH, maxBp: 7000, noSoul: true } }] },
  ],

  // ---------------------------------------------------------------- Magic
  โซลออร่า: [{ kind: 'magic', timing: 'flash', steps: [{ do: 'buffAllies', amount: 3000 }, { do: 'buffAllies', amount: 3000, filter: { soul: true } }] }],
  ผ่าสังหารทำลายล้างแห่งเปลวเพลิง: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'destroyOpponentBrave' }, destroy({ types: SPIRITISH, maxBp: 7000 }, { if: paidSoul })] },
  ],
  เอ็นชินสไตรค์: [{ kind: 'magic', timing: 'flash', steps: [destroy({ types: SPIRIT, maxBp: 3000 }, { count: 2 }), destroy(NEXUS, { if: paidSoul })] }],
  กุเร็นเฟลม: [
    {
      kind: 'magic',
      timing: 'flash',
      steps: [destroy({ types: SPIRIT, maxBp: 8000 }, { if: notPaidSoul }), destroy({ types: ULTIMATE, maxBp: 20000 }, { if: paidSoul })],
    },
  ],
  บัสเตอร์สเปียร์: [
    // เลือกเน็กซัสฝ่ายไหนก็ได้ แต่จั่ว 2 เฉพาะเมื่อทำลายเน็กซัสของคู่แข่ง
    {
      kind: 'magic',
      timing: 'flash',
      steps: [
        { ...destroy(NEXUS), anySide: true },
        { do: 'ifDestroyed', filter: { types: ['nexus'], opponent: true }, steps: [{ do: 'draw', count: 2 }] },
      ],
    },
  ],
  ดับเบิ้ลดรอว์: [
    {
      kind: 'magic',
      timing: 'main',
      steps: [{ do: 'draw', count: 2 }, { do: 'summonFromHandFree', filter: { nameIncludes: ['จักรพรรดิมังกร ซีคฟรีด'] }, if: paidSoul }],
    },
    { kind: 'magic', timing: 'flash', steps: [{ do: 'buffChosen', amount: 2000 }] },
  ],

  // ---------------------------------------------------------------- Nexus
  ทวีปแห่งหุบผาหินแหลมคม: [
    { kind: 'trigger', on: 'allySummoned', subject: { paidWithSoul: true }, levels: [1, 2], ownTurnOnly: true, mainStepOnly: true, steps: [destroy(NEXUS)] },
    {
      kind: 'trigger',
      on: 'oppDestroyed',
      subject: { color: 'red', types: SPIRIT },
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      steps: [{ do: 'draw', count: 1 }],
    },
  ],
  'No.17 สโตนริเวอร์': [
    { kind: 'trigger', on: 'allyAttack', subject: { soul: true }, levels: [1, 2], steps: [{ ...destroy({ types: SPIRIT }), bpFrom: 'subjectLv1' }] },
    { kind: 'staticBp', levels: [2], if: { all: [ownAttackStep, soulOnSelf] }, scope: { ownSpirits: { color: 'red' } }, amount: 5000 },
  ],
  ปราสาทมังกรระอุ: [
    [
      { kind: 'staticBp', levels: [1, 2], if: ownAttackStep, scope: { ownSpirits: { color: 'red' } }, amount: 2000 },
      { kind: 'staticBp', levels: [1, 2], if: { all: [ownAttackStep, soulOnSelf] }, scope: { ownSpirits: { color: 'red' } }, amount: 2000 },
    ],
    // สปิริตสีแดงเผ่า [มังกรยุทธ์] ได้รับ True-Rage
    { kind: 'trigger', on: 'allyAttack', subject: { family: 'มังกรยุทธ์', color: 'red' }, levels: [2], steps: [{ do: 'mustBlock', subject: true }] },
  ],
  'No.13 อีสท์แคพพิทัล': [
    {
      kind: 'trigger',
      on: 'lifeLost',
      levels: [1, 2],
      oppTurnOnly: true,
      attackStepOnly: true,
      steps: [
        {
          do: 'chooseOne',
          options: [
            { label: 'ทำลายสปิริต BP ไม่เกิน 5000 ของคู่แข่ง 1 ตัว', steps: [destroy({ types: SPIRIT, maxBp: 5000 })] },
            { label: 'ทำลายอัลติเมท BP ไม่เกิน 10000 ของคู่แข่ง 1 ตัว', steps: [destroy({ types: ULTIMATE, maxBp: 10000 })] },
          ],
        },
      ],
    },
    {
      kind: 'trigger',
      on: 'allyBlocked',
      subject: { color: 'red' },
      blocker: { types: SPIRIT, maxBp: 3000 },
      levels: [2],
      ownTurnOnly: true,
      attackStepOnly: true,
      if: soulOnSelf,
      steps: [{ do: 'refreshSubject' }],
    },
  ],

  // ---------------------------------------------------------------- Spirit
  มุฉะโทคาเงะ: [],
  ไยเบิร์ด: [{ kind: 'trigger', on: 'destroyed', levels: ALL_LV, steps: [destroy({ types: SPIRITISH, maxBp: 6000 }, { if: soulOnSelf })] }],
  โฮมุระชีตาร์: [{ kind: 'trigger', on: 'attack', levels: [1, 2], steps: [destroy({ types: SPIRIT, maxBp: 4000 }), destroy(NEXUS, { if: soulOnSelf })] }],
  'มุโซ ริวมัน': [
    { kind: 'nameAlias', names: ['ริวแมน'] },
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [destroy({ types: SPIRIT, maxBp: 6000 }, { if: notPaidSoul }), destroy({ types: ULTIMATE, maxBp: 15000 }, { if: paidSoul })],
    },
  ],
  โยโรอิสเตโก: [],
  'เซนโกคุ-ไทเกอร์': [
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [destroy({ types: SPIRITISH, minBp: 20000 })] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [
        { ...destroy({ types: SPIRIT }), bpFrom: 'self' },
        {
          do: 'ifDestroyed',
          filter: { minBp: 7000 },
          steps: [
            {
              do: 'chooseOne',
              if: soulOnSelf,
              options: [
                { label: 'ส่ง Soul Core ลงแทรช: สปิริตนี้ฟื้นสภาพ', steps: [{ do: 'soulToTrash' }, { do: 'refreshSelf' }] },
                { label: 'ไม่ใช้', steps: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
  'มังกรขุนพลเพลิง โกวเอ็น': [
    { kind: 'staticBp', levels: [1, 2], if: soulOnSelf, scope: { ownFamily: 'มังกรยุทธ์' }, amount: 10000 },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'destroyAllOpponent', filter: { types: SPIRITISH, maxBp: 5000 } }] },
  ],
  'มังกรดาบแดง เดอะ-ฮีท': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [destroy({ types: SPIRIT, maxBp: 8000 }, { count: 2 })] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [destroy({ types: ULTIMATE, maxBp: 20000 }, { if: soulOnSelf })] },
  ],
  โอโอโซเตะพูเทร่า: [
    { kind: 'trigger', on: 'blocked', levels: [1, 2], steps: [{ do: 'draw', count: 1 }] },
    { kind: 'staticBp', levels: [2], if: soulOnSelf, scope: { self: true }, amount: 4000 },
  ],
  มังกรนภาราตรี: [
    { kind: 'trigger', on: 'destroyed', levels: [1, 2], steps: [destroy({ types: ULTIMATE, maxBp: 12000 })] },
    trueRage([2]),
  ],
  ชิปปูดราก้อน: [trueRage([1, 2]), { kind: 'staticBp', levels: [2], if: { battlingOpponentType: 'ultimate' }, scope: { self: true }, amount: 10000 }],
  'มุราคุโมะ ดราก้อน': [
    { kind: 'trigger', on: 'allyBlocked', levels: [1, 2], ownTurnOnly: true, attackStepOnly: true, steps: [{ do: 'draw', count: 1 }] },
    { kind: 'staticBp', levels: [2], if: ownAttackStep, scope: { ownSpirits: { soul: true } }, amount: 10000 },
  ],
  'วาคะมุฉะ ฮิรินมารุ': [{ kind: 'trigger', on: 'attack', levels: [2, 3], steps: [destroy(NEXUS), destroy({ types: SPIRITISH, maxBp: 8000 }, { if: soulOnSelf })] }],
  'อาระมุฉะ มา-โซว': [
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [destroy({ types: SPIRITISH, maxBp: 20000, noSoul: true })] },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [destroy({ types: SPIRIT, maxBp: 6000 }), destroy({ types: ULTIMATE, maxBp: 15000 }, { if: soulOnSelf })] },
  ],
  'มังกรดาบเหล็กกล้า ดาลิโวรอส': [{ kind: 'trigger', on: 'attack', levels: [2, 3], steps: [destroy(NEXUS), { do: 'draw', count: 1, if: soulOnSelf }] }],
  'เซ็นโงคุ ซีคฟรีด': [
    { kind: 'evolution', levels: ALL_LV },
    { kind: 'trigger', on: 'attack', levels: ALL_LV, steps: [destroy({ types: SPIRITISH, maxBp: 10000 })] },
    { kind: 'extraSymbol', levels: [2, 3], if: soulOnSelf, color: 'red', count: 1 },
  ],
  'มังกรเขาคู่ ดาบุฮอร์น': [{ kind: 'staticBp', levels: [1, 2], if: soulOnSelf, scope: { self: true }, amount: 5000 }, trueRage([2])],
  'มังกรทองเซ็นโงคุ ราโอว': [
    { kind: 'evolution', levels: ALL_LV },
    {
      kind: 'trigger',
      on: 'allyDepletedByEvolution',
      levels: ALL_LV,
      attackStepOnly: true,
      steps: [{ do: 'summonFromHandFree', filter: { types: ['spirit'], hasEvolution: true } }],
    },
    { kind: 'trigger', on: 'attack', levels: [2, 3], steps: [destroy({ types: SPIRIT, maxBp: 5000 })] },
  ],
  'ขุนพลมังกรป่าเถื่อน ฮะกุนดราก้อน': [
    { kind: 'evolution', levels: ALL_LV },
    { kind: 'staticBp', levels: ALL_LV, if: ownAttackStep, scope: { ownSpirits: { soul: true } }, amount: 10000 },
    { kind: 'trigger', on: 'allyDepletedByEvolution', levels: [2, 3], attackStepOnly: true, steps: [{ do: 'refreshSelf' }] },
  ],
  'จักรพรรดิมังกร ซีคฟรีด': [
    { kind: 'evolution', levels: ALL_LV },
    { kind: 'maxLevelIf', levels: ALL_LV, if: soulOnSelf },
    // ถูกทำลายโดยคู่แข่ง (ต่อสู้/เอฟเฟกต์) และไลฟ์ไม่เกิน 5: คอร์วอยด์ 2 เม็ดวางไลฟ์ อยู่ต่อในสภาพเดิม
    { kind: 'replaceDestroy', levels: [3], subject: { self: true }, battle: true, auto: true, state: 'same', if: { lifeAtMost: 5 }, then: [{ do: 'gainLifeFromVoid', count: 2 }] },
  ],
  ดรัคซอรัส: [{ kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [destroy(NEXUS), destroy({ types: SPIRIT, maxBp: 3000 }, { if: { anyAllySoul: true } })] }],
  หมอผีดรัคโน่: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [
        { do: 'returnFromTrash', filter: { types: ['spirit'] }, if: notPaidSoul },
        {
          do: 'chooseOne',
          if: paidSoul,
          options: [
            { label: 'นำการ์ดสปิริตในแทรช 1 ใบกลับขึ้นมือ', steps: [{ do: 'returnFromTrash', filter: { types: ['spirit'] } }] },
            { label: 'อัญเชิญสปิริตเผ่า [มังกรโบราณ] ในแทรชไม่จ่ายคอสต์', steps: [{ do: 'summonFromTrashFree', filter: { types: ['spirit'], family: 'มังกรโบราณ' } }] },
          ],
        },
      ],
    },
  ],
  'สัตว์เทพเพลิง โฮมุระวูล์ฟ': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL_LV,
      steps: [destroy({ types: SPIRITISH, maxBp: 10000 }), { do: 'summonFromHandFree', filter: { types: ['brave'], color: 'red' }, if: paidSoul }],
    },
    // [ร่วมร่าง] แอทแท็คสเต็ปของผู้เล่นทุกคน: สปิริตคู่แข่งถูกทำลายโดยเอฟเฟกต์ของสปิริต/อัลติเมทเรา → จั่ว 2
    {
      kind: 'trigger',
      on: 'oppDestroyed',
      subject: { byEffect: true, types: SPIRITISH },
      levels: [2, 3],
      attackStepOnly: true,
      if: { selfBraved: true },
      steps: [{ do: 'draw', count: 2 }],
    },
  ],
};

