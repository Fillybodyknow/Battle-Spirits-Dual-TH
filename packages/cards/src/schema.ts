import { z } from 'zod';
import type { Ability } from './abilities';

/** 6 สีหลักของเกม (หมวด 3) */
export const COLORS = ['red', 'purple', 'green', 'white', 'yellow', 'blue'] as const;
/** สีที่ใช้กับ gem symbol / สัญลักษณ์ลดคอสต์ได้ รวม "สี Ultimate" */
export const SYMBOL_COLORS = [...COLORS, 'ultimate'] as const;
export const CARD_TYPES = ['spirit', 'ultimate', 'brave', 'nexus', 'magic'] as const;

export const ColorSchema = z.enum(COLORS);
export const SymbolColorSchema = z.enum(SYMBOL_COLORS);
export const CardTypeSchema = z.enum(CARD_TYPES);

/** สี → จำนวน (ใช้ทั้ง reduction และ gem symbol) */
export const SymbolMapSchema = z.partialRecord(SymbolColorSchema, z.number().int().positive());

export const LevelSchema = z.object({
  level: z.number().int().min(1).max(6),
  /** จำนวน Core ขั้นต่ำบนการ์ดเพื่อให้ถึงเลเวลนี้ */
  cores: z.number().int().min(0),
  /** BP ที่เลเวลนี้ (Nexus ไม่มี) */
  bp: z.number().int().min(0).optional(),
});

export const BraveConditionSchema = z.object({
  /** จำนวน Spirit ที่รวมร่างได้พร้อมกัน (Imagine Brave = 2) */
  maxSpirits: z.number().int().min(1).max(2).default(1),
  /** ผู้ร่วมร่างต้องมีคอสต์ตั้งแต่ค่านี้ */
  minCost: z.number().int().min(0).optional(),
  /** ผู้ร่วมร่างต้องเป็นสปิริตเผ่านี้ (BS07 ชุดตุ๊กตาฟูริน) */
  family: z.string().optional(),
  /** ผู้ร่วมร่างต้องเป็นสปิริตที่ไม่มีข้อความเอฟเฟกต์ (BS09 ไดกิว-อาร์มส์) */
  noEffectText: z.boolean().optional(),
  /** BS12 โอคุริดาระ: "ร่วมร่างกับสปิริต/อัลติเมท" = ร่วมร่างกับอัลติเมทได้ด้วย */
  ultimate: z.boolean().optional(),
  /** เอฟเฟกต์ติดตัวที่ให้ผู้ร่วมร่าง: BP+ */
  bp: z.number().int().min(0).optional(),
  /** เงื่อนไขอื่นเก็บเป็นข้อมูลดิบไว้ก่อน */
  requirement: z.unknown().optional(),
});

export const CardDefSchema = z
  .object({
    cardNo: z.string().min(1),
    name: z.string().min(1),
    type: CardTypeSchema,
    cost: z.number().int().min(0),
    colors: z.array(ColorSchema).min(1),
    reduction: SymbolMapSchema.default({}),
    symbols: SymbolMapSchema.default({}),
    family: z.array(z.string()).default([]),
    /** ทีม (BS07 ดีว่า): "ทีม: ไชนี่ฮาร์ท" */
    teams: z.array(z.string()).default([]),
    /** ไทป์ของเมจิค (BS07): "ไทป์: เพลง" */
    magicTypes: z.array(z.string()).default([]),
    levels: z.array(LevelSchema).default([]),
    /** การ์ดมีเอฟเฟกต์ Burst หรือไม่ (ใช้ตรวจตอนเซ็ท Burst) */
    burst: z.boolean().default(false),
    /** นิยามเอฟเฟกต์แบบข้อมูล: จะกำหนดรูปแบบในขั้นที่ 3 */
    effects: z.array(z.unknown()).default([]),
    /** สคริปต์ที่ engine ประมวลผลได้ (ดู abilities.ts) ตรวจชนิดตอนเขียนสคริปต์ ไม่ตรวจซ้ำตอน runtime */
    abilities: z.array(z.custom<Ability>()).default([]),
    summonCondition: z.unknown().optional(),
    braveCondition: BraveConditionSchema.optional(),
    rarity: z.string().optional(),
    illustrator: z.string().optional(),
    flavorText: z.string().optional(),
  })
  .superRefine((card, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['levels'] });
    const { type, levels } = card;

    if (type === 'magic') {
      if (levels.length > 0) issue('Magic ต้องไม่มีเลเวล');
      return;
    }
    if (levels.length === 0) {
      issue(`${type} ต้องมีเลเวลอย่างน้อย 1 ระดับ`);
      return;
    }
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1]!;
      const cur = levels[i]!;
      if (cur.level <= prev.level || cur.cores < prev.cores) {
        issue('เลเวลต้องเรียงจากน้อยไปมาก และจำนวน Core ต้องไม่ลดลง');
      }
    }
    if (type !== 'nexus' && levels.some((l) => l.bp === undefined)) {
      issue(`${type} ต้องระบุ BP ทุกเลเวล`);
    }
    if (type !== 'nexus' && levels[0]!.cores < 1) {
      issue(`${type} ต้องใช้ Core อย่างน้อย 1 ดวงที่เลเวลต่ำสุด`);
    }
    if (type === 'ultimate' && levels[0]!.level < 3) {
      issue('Ultimate เริ่มที่ Lv3');
    }
    if (type === 'brave' && !card.braveCondition) {
      ctx.addIssue({ code: 'custom', message: 'Brave ต้องมี braveCondition', path: ['braveCondition'] });
    }
  });

export type Color = z.infer<typeof ColorSchema>;
export type SymbolColor = z.infer<typeof SymbolColorSchema>;
export type CardType = z.infer<typeof CardTypeSchema>;
export type SymbolMap = z.infer<typeof SymbolMapSchema>;
export type LevelDef = z.infer<typeof LevelSchema>;
export type CardDef = z.output<typeof CardDefSchema>;
/** รูปแบบก่อน parse (ฟิลด์ที่มี default ไม่ต้องใส่) ใช้ตอนเขียน JSON */
export type CardDefInput = z.input<typeof CardDefSchema>;
