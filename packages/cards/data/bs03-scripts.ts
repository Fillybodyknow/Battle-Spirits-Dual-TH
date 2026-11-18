/**
 * สคริปต์เอฟเฟกต์ของ Booster Set 03 ผูกกับการ์ดด้วยชื่อ
 * - การ์ดที่อยู่ใน Starter Deck 03 ด้วย: ใช้สคริปต์ชุดเดียวกับ SD03
 * - การ์ดใหม่ของชุดนี้: ช่องที่เป็น null = ยังไม่รองรับใน engine (แสดงข้อความได้ แต่ไม่ทำงาน)
 */
import type { CardFilter, CardScript, Condition, Step } from '../src/abilities';
import { SD03_SCRIPTS } from './sd03-scripts';

/** สปิริต (Brave ที่อยู่เดี่ยวนับเป็นสปิริต) */
const SPIRIT: CardFilter['types'] = ['spirit', 'brave'];
/** สปิริต/อัลติเมท */
const SPIRITISH: CardFilter['types'] = ['spirit', 'ultimate', 'brave'];
const ULTIMATE: CardFilter['types'] = ['ultimate'];
/** สปิริต/อัลติเมท/เน็กซัส */
const WITH_NEXUS: CardFilter['types'] = ['spirit', 'ultimate', 'brave', 'nexus'];
const soulOnSelf: Condition = { soulOnSelf: true };
const paidSoul: Condition = { paidWithSoul: true };
const notPaidSoul: Condition = { not: paidSoul };
const ALL_LV = [1, 2, 3];
const CURSED = 'มารต้องสาป';
const CURSED_OR_BEAST: CardFilter = { families: [CURSED, 'วิญญาณสมิง'] };
const OGUMA_FAMILIES = [CURSED, 'วิญญาณสมิง', 'อสูรราตรี'];

const destroy = (filter: CardFilter, extra: { count?: number; if?: Condition } = {}): Step => ({ do: 'destroyChosenOpponent', filter, ...extra });
/** ส่งคอร์บนสปิริต(/อัลติเมท)คู่แข่งไปรีเสิร์ฟคู่แข่ง */
const removeCores = (count: number, types: CardFilter['types'], extra: { if?: Condition; untilOne?: true } = {}): Step => ({
  do: 'removeOpponentCores',
  count,
  filter: { types },
  ...extra,
});

export const BS03_SCRIPTS: Record<string, CardScript> = {
  ...SD03_SCRIPTS,

  // ---------------------------------------------------------------- Brave
  'โอริงามิ เบิร์ด': [
    { kind: 'trashCost', cost: 2 },
    [
      // เลือกให้สปิริตที่เสื่อมสภาพของคู่แข่ง 1 ตัวเป็นผู้ป้องกัน (ไม่เลือกก็ได้)
      { kind: 'trigger', on: 'attack', granted: true, levels: [], steps: [{ do: 'chooseBlockers', filter: { types: SPIRIT, state: 'exhausted' }, direct: true }] },
      { kind: 'trigger', on: 'attack', granted: true, levels: [], if: soulOnSelf, steps: [{ do: 'destroyOpponentBrave' }] },
    ],
  ],
  'โอริงามิ ฮอร์ส': [
    { kind: 'trigger', on: 'summon', levels: [1], steps: [removeCores(1, SPIRIT, { untilOne: true })] },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      granted: true,
      levels: [],
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: 'ทิ้งการ์ดในมือ 1 ใบ: ส่งคอร์บนสปิริตคู่แข่ง 1 เม็ดไปรีเสิร์ฟ',
              if: { all: [{ handAtLeast: 1 }, { opponentHas: { types: SPIRIT }, withCores: true }] },
              steps: [{ do: 'discard', count: 1 }, removeCores(1, SPIRIT)],
            },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
  เจ็ทคารูร่า: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1],
      steps: [{ do: 'draw', count: 2 }, { do: 'draw', count: 1, if: paidSoul }, { do: 'discard', count: 2 }],
    },
    { kind: 'trigger', on: ['attack', 'block'], granted: true, levels: [], steps: [{ do: 'buffSelf', amount: 4000, untilBattleEnd: true }] },
  ],

  // ---------------------------------------------------------------- Magic
  ชิคิงามิออฟเดอะเดด: [
    { kind: 'magic', timing: 'flash', steps: [{ do: 'summonFromTrash', filter: { types: ['spirit', 'brave'], ...CURSED_OR_BEAST } }] },
  ],
  ฝ่ามือสังสารซ่อนสาป: [
    { kind: 'magic', timing: 'main', steps: [{ do: 'opponentNexusCoresToTrash' }] },
    { kind: 'magic', timing: 'flash', steps: [destroy({ types: SPIRITISH, maxCost: 6, state: 'exhausted' }, { if: paidSoul })] },
  ],
  โซลชูท: [{ kind: 'magic', timing: 'flash', steps: [removeCores(1, SPIRITISH), removeCores(1, SPIRITISH, { if: paidSoul })] }],
  // ส่วน "เบรฟที่รวมร่างอยู่ถือว่ามีคอสต์ 0" ยังไม่รองรับ (เทียบคอสต์ตามสปิริตที่พิมพ์บนการ์ด)
  ไอโครบาคุริว: [
    {
      kind: 'magic',
      timing: 'flash',
      // เบรฟที่ร่วมร่างอยู่ถือว่าคอสต์ 0 = เทียบเฉพาะคอสต์ของสปิริต
      steps: [
        destroy({ types: SPIRITISH, maxCost: 6, ignoreBraveCost: true }, { if: notPaidSoul }),
        destroy({ types: SPIRITISH, maxCost: 6, ignoreBraveCost: true }, { count: 3, if: paidSoul }),
      ],
    },
  ],

  // ---------------------------------------------------------------- Nexus
  สมรภูมิชี้ชะตาแห่งหอกนับพัน: [
    { kind: 'trigger', on: 'oppExhausted', subject: { types: SPIRITISH }, levels: [1, 2], oppTurnOnly: true, steps: [{ do: 'draw', count: 1 }] },
    {
      kind: 'trigger',
      on: 'allyDestroyed',
      subject: { types: SPIRIT, soul: true, byOpponent: true },
      levels: [2],
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH }, costFrom: 'subject' }],
    },
  ],
  'No.3 ร็อคแฮนด์': [
    // ถามก่อนจั่ว: ทิ้งแล้ว Draw Step จั่วเพิ่ม 2 ใบ (ไม่ใช่การจั่วด้วยเอฟเฟกต์)
    {
      kind: 'drawStep',
      levels: [1, 2],
      extraDraw: [],
      before: [
        {
          do: 'chooseOne',
          options: [
            {
              label: 'ทิ้งสปิริตเผ่ามารต้องสาปในมือ 1 ใบ: จั่วเพิ่ม 2 ใบ',
              if: { all: [{ handHas: { types: ['spirit'], family: CURSED } }, { deckAtLeast: 1 }] },
              steps: [{ do: 'discard', count: 1, filter: { types: ['spirit'], family: CURSED } }, { do: 'addDrawStepDraw', amount: 2 }],
            },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
    { kind: 'trashSummon', levels: [2], filter: { types: ['spirit'], family: CURSED }, timing: 'main', soulPayment: true },
  ],
  'No.34 ลาร์คไอส์แลนด์': [
    {
      kind: 'trigger',
      on: 'allyAttack',
      subject: { color: 'blue' },
      levels: [1, 2],
      ownTurnOnly: true,
      if: soulOnSelf,
      steps: [{ do: 'mill', count: 1 }, { do: 'buffSubject', amount: 5000 }],
    },
    { kind: 'trashCostAll', zone: 'hand', mainStepOnly: true, levels: [2], filter: { types: ['spirit'], nameIncludes: ['เมียวโอ'] }, cost: 6 },
  ],

  // ---------------------------------------------------------------- Spirit
  'นักพรตชั่วร้าย โอกุมะ': [
    {
      kind: 'activated',
      levels: [1, 2, 3, 4],
      timing: 'attackFlash',
      label: 'ส่ง Soul Core ลงแทรช: อัญเชิญสปิริต/เบรฟเผ่ามารต้องสาป/วิญญาณสมิง/อสูรราตรีในแทรช',
      if: { all: [soulOnSelf, { trashHas: { types: ['spirit', 'brave'], families: OGUMA_FAMILIES } }] },
      steps: [{ do: 'soulToTrash' }, { do: 'summonFromTrash', filter: { types: ['spirit', 'brave'], families: OGUMA_FAMILIES }, repeat: true }],
    },
    { kind: 'replaceDestroy', levels: [2, 3, 4], subject: { self: true }, battle: true, millSelf: 4, state: 'same' },
  ],
  กาสุมิมิสุคุ: [{ kind: 'trigger', on: ['destroyedByOpponent', 'depletedByOpponent'], levels: [1, 2], steps: [removeCores(1, SPIRITISH)] }],
  'ชิคิงามิ โฮวริคิ': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [{ do: 'draw', count: 1 }, removeCores(1, SPIRIT, { if: paidSoul })] },
  ],
  'โอฉิมุฉะ โบน': [
    {
      kind: 'trigger',
      on: 'attack',
      levels: [1, 2],
      steps: [removeCores(1, SPIRIT), { do: 'returnFromTrash', filter: { types: ['spirit'], color: 'purple' }, if: soulOnSelf }],
    },
  ],
  'ยักษ์นักสู้สวมเกราะ ราโชว': [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL_LV,
      steps: [
        {
          do: 'chooseOne',
          options: [
            // ต้องทิ้งได้ครบ 4 และจั่วได้ครบ 2 (ทำได้ทั้งสองท่อน)
            { label: 'ทิ้งใบบนสุดเด็คเรา 4 ใบ: จั่วการ์ด 2 ใบ', if: { deckAtLeast: 6 }, steps: [{ do: 'millSelf', count: 4 }, { do: 'draw', count: 2 }] },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
    { kind: 'levelCostBoost', levels: [2, 3], if: { soulInTrash: true }, filter: { types: ['nexus'] }, amount: 2 },
  ],
  'องเมียวจิดูดเลือด ฮิเร็น': [
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [{ do: 'draw', count: 1 }] },
    {
      kind: 'trigger',
      on: 'attack',
      levels: [2, 3],
      steps: [
        {
          do: 'chooseOne',
          if: soulOnSelf,
          options: [
            {
              label: 'ทิ้งใบบนสุดเด็คเรา 4 ใบ: ต่อการ์ดสปิริตที่ทิ้ง 1 ใบ ส่งคอร์คู่แข่ง 1 เม็ดไปรีเสิร์ฟ',
              if: { deckAtLeast: 1 },
              steps: [{ do: 'millSelf', count: 4 }, { do: 'removeOpponentCores', count: 1, countPerMilled: { types: ['spirit'] }, filter: { types: SPIRITISH } }],
            },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
  'คาราคุโช โคคุโกว': [
    { kind: 'trashCostAll', levels: [1, 2], filter: { types: ['spirit'], ...CURSED_OR_BEAST }, cost: 0, attackStepOnly: true },
    { kind: 'trigger', on: ['destroyedByOpponent', 'depletedByOpponent'], levels: [2], steps: [{ do: 'summonFromTrash', filter: { types: ['spirit'], ...CURSED_OR_BEAST } }] },
  ],
  เคมุริซารุ: [
    { kind: 'trigger', on: ['destroyedByOpponent', 'depletedByOpponent'], levels: ALL_LV, steps: [removeCores(3, SPIRITISH), { do: 'draw', count: 3, if: soulOnSelf }] },
  ],
  มังกรควันม่วง: [
    { kind: 'trashCost', cost: 3 },
    {
      kind: 'trigger',
      on: 'attack',
      levels: ALL_LV,
      steps: [destroy({ types: SPIRIT, state: 'exhausted' }), destroy({ types: ULTIMATE, state: 'exhausted' }, { if: soulOnSelf })],
    },
  ],
  'ชิคิงามิ ซันคิ': [
    { kind: 'trashCost', cost: 3 },
    {
      kind: 'trigger',
      on: ['attack', 'block'],
      levels: ALL_LV,
      steps: [
        {
          do: 'chooseOne',
          options: [
            {
              label: 'ส่งคอร์บนสปิริต/อัลติเมท/เน็กซัสคู่แข่ง 1 เม็ดไปรีเสิร์ฟ: จั่วการ์ด 1 ใบ',
              if: { all: [{ opponentHas: { types: WITH_NEXUS }, withCores: true }, { deckAtLeast: 1 }] },
              steps: [removeCores(1, WITH_NEXUS), { do: 'draw', count: 1 }],
            },
            { label: 'ไม่ใช้', steps: [] },
          ],
        },
      ],
    },
  ],
  'ราชายักษ์ นาราคุ': [
    { kind: 'trashCost', cost: 4 },
    {
      kind: 'trigger',
      on: 'summon',
      levels: [1, 2],
      steps: [{ do: 'removeOpponentCores', count: 2, countPerAllyFamily: 'อสูรราตรี', filter: { types: SPIRITISH } }],
    },
  ],
  'บุชชิ ปะกุกุ': [{ kind: 'summonSymbol', levels: [1, 2], if: soulOnSelf, nameIncludes: ['เมียวโอ', 'โดจิ'], color: 'blue', count: 1 }],
  คานิคอง: [
    { kind: 'symbolAlsoColor', levels: ALL_LV, color: 'green' },
    [
      { kind: 'handImmune', levels: [2, 3], if: soulOnSelf },
      { kind: 'coreRemovalImmune', levels: [2, 3], if: soulOnSelf, filter: { types: SPIRIT, families: ['มนุษย์แมลง', 'ร่างประกอบ'] } },
    ],
  ],
  'มนุษย์สมิงนักฟันดาบ กาโอว': [
    { kind: 'trigger', on: 'summon', levels: [1, 2], steps: [destroy({ types: SPIRITISH, maxCost: 7, noSoul: true })] },
    { kind: 'trigger', on: 'attack', levels: [2], if: soulOnSelf, steps: [{ do: 'restrictBlockers', filter: { soul: true } }] },
  ],
  เทพยักษ์บาซาระ: [
    {
      kind: 'trigger',
      on: 'summon',
      levels: ALL_LV,
      steps: [
        { do: 'removeOpponentCores', count: 1, countPerSelfCore: true, filter: { types: SPIRITISH } },
        { do: 'ifDepletedSoul', steps: [{ do: 'opponentReserveToTrash' }] },
      ],
    },
    {
      kind: 'trigger',
      on: 'allyExhausted',
      subject: { types: SPIRIT, color: 'purple' },
      levels: [2, 3],
      attackStepOnly: true,
      steps: [removeCores(1, SPIRITISH)],
    },
  ],
  'เมียวโอเพลิงคราม อากุนิอัส': [
    {
      kind: 'trigger',
      on: 'oppBurstActivated',
      zone: 'hand',
      levels: [],
      steps: [{ do: 'chooseOne', options: [{ label: 'อัญเชิญเมียวโอเพลิงคราม อากุนิอัสไม่จ่ายคอสต์', steps: [{ do: 'summonThisFree' }] }, { label: 'ไม่ใช้', steps: [] }] }],
    },
    { kind: 'burstAlsoOn', levels: [1, 2], events: ['afterLifeLost', 'afterAllyDestroyedByOpponent'] },
    { kind: 'trigger', on: 'attack', levels: [2], steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH }, costFrom: 'self', if: soulOnSelf }] },
  ],
  'โบน-วีเซล': [
    {
      kind: 'trigger',
      on: 'oppAttackStepStart',
      levels: [2],
      steps: [
        { do: 'removeOpponentCores', count: 1, opponentChooses: true, filter: { types: SPIRIT }, if: { not: soulOnSelf } },
        { do: 'removeOpponentCores', count: 1, perPick: 2, opponentChooses: true, filter: { types: SPIRIT }, if: soulOnSelf },
      ],
    },
  ],
  'นักพรตอสรพิษ ชุดะ': [
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [{ do: 'draw', count: 1, if: paidSoul }] },
    {
      kind: 'trigger',
      on: 'allySummoned',
      subject: { types: ['spirit'], fromTrash: true, minCost: 6 },
      levels: [2, 3],
      steps: [removeCores(1, SPIRITISH, { untilOne: true })],
    },
  ],
  'โยวจุทสึชิ มุเมอิ': [
    { kind: 'trashSummon', levels: [], self: true, timing: 'attackFlash', soulPayment: true },
    { kind: 'trigger', on: 'summon', levels: ALL_LV, steps: [destroy({ types: SPIRIT, state: 'exhausted', maxBp: 10000 })] },
  ],
  มิซึมาตะโอโรจิแห่งเขียวคราม: [
    {
      kind: 'trigger',
      on: 'allyExhausted',
      subject: { types: ['nexus'] },
      levels: ALL_LV,
      attackStepOnly: true,
      steps: [{ do: 'destroyChosenOpponent', filter: { types: SPIRITISH }, costFrom: 'subject' }],
    },
    // Assault: ระหว่างโจมตี เสื่อมสภาพเน็กซัสเรา 1 ใบเพื่อฟื้นสภาพ เทิร์นละไม่เกิน 2 ครั้ง
    {
      kind: 'activated',
      levels: ALL_LV,
      timing: 'attackFlash',
      label: '[Assault] เสื่อมสภาพเน็กซัสเรา 1 ใบ: ฟื้นสภาพสปิริตนี้',
      maxPerTurn: 2,
      if: { all: [{ selfAttacking: true }, { selfExhausted: true }, { allyHas: { types: ['nexus'], state: 'refresh' } }] },
      steps: [{ do: 'exhaustOwn', filter: { types: ['nexus'] } }, { do: 'refreshSelf' }],
    },
    { kind: 'costBoost', levels: [2, 3], if: soulOnSelf, filter: { types: ['nexus'] }, amount: 2 },
  ],
};
