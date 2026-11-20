/**
 * ภาษาสคริปต์เอฟเฟกต์การ์ด (ขั้นที่ 3)
 *
 * ข้อความเอฟเฟกต์ดิบอยู่ใน CardDef.effects ส่วนสคริปต์ที่ engine ประมวลผลได้อยู่ใน CardDef.abilities
 * แต่ละ ability อ้างกลับไปที่ข้อความด้วย `source` (index ใน effects)
 * ข้อความที่ยังไม่มีสคริปต์ = ยังไม่ทำงานใน engine
 */
import type { CardType, Color } from './schema';

/** เงื่อนไข "ถ้า..." */
export type Condition =
  /** มี Soul Core วางอยู่บนการ์ดที่เป็นเจ้าของเอฟเฟกต์ */
  | { soulOnSelf: true }
  /** ใช้ Soul Core ร่วมจ่ายคอสต์ของการ์ดนี้ (Magic) */
  | { paidWithSoul: true }
  /** ไลฟ์ของเจ้าของเอฟเฟกต์ไม่เกิน N */
  | { lifeAtMost: number }
  /** มี Soul Core อยู่ในรีเสิร์ฟของเจ้าของเอฟเฟกต์ */
  | { soulInReserve: true }
  /** มี Soul Core อยู่ในแทรชของเจ้าของเอฟเฟกต์ */
  | { soulInTrash: true }
  /** (trigger summon) การ์ดนี้ถูกอัญเชิญจากเด็ค */
  | { summonedFromDeck: true }
  /** มีการ์ดบนมือเราที่ตรงตัวกรอง */
  | { handHas: CardFilter }
  /** เอฟเฟกต์ (Burst) นี้ถูกสั่งใช้โดย [Catalyze] */
  | { catalyzed: true }
  /** การ์ดเจ้าของเอฟเฟกต์มี Core อย่างน้อย N ดวง */
  | { selfCoresAtLeast: number }
  /** มีการ์ดบนมือเจ้าของเอฟเฟกต์อย่างน้อย N ใบ */
  | { handAtLeast: number }
  /** [Catalyze] ใช้ได้: การ์ดนี้มี Soul Core วางอยู่ และ Burst ที่เซ็ทอยู่ของเราเป็น Soul Burst สีนี้ */
  | { catalyzable: Color | 'any' }
  /** มีสปิริตเราที่ชื่อมีคำใดคำหนึ่งนี้ และมี Soul Core วางอยู่ */
  | { allySoulNamed: string[] }
  /** อยู่ใน Attack Step (เทิร์นใครก็ได้) */
  | { attackStep: true }
  /** "แอทแท็คสเต็ปของเรา" */
  | { ownAttackStep: true }
  /** ทุกเงื่อนไขเป็นจริง */
  | { all: Condition[] }
  /** การ์ดนี้กำลังต่อสู้กับการ์ดประเภทนี้ของคู่แข่ง (ผู้ป้องกันของเรา / ผู้โจมตีที่เราป้องกัน) */
  | { battlingOpponentType: CardType }
  /** มี Soul Core วางอยู่บนสปิริตเรา (ตัวใดก็ได้) */
  | { anyAllySoul: true }
  /** สปิริตนี้ร่วมร่างกับ Brave อยู่ */
  | { selfBraved: true }
  /** เด็คเรามีอย่างน้อย N ใบ */
  | { deckAtLeast: number }
  /** การ์ดของเราบนสนามที่ตรงตัวกรองมีอย่างน้อย 1 ใบ (ไม่ระบุ types = สปิริต/อัลติเมท) */
  | { allyHas: CardFilter }
  /** การ์ดในแทรชเราที่ตรงตัวกรองมีอย่างน้อย 1 ใบ */
  | { trashHas: CardFilter }
  /** สปิริตนี้เป็นผู้โจมตีในการต่อสู้ตอนนี้ */
  | { selfAttacking: true }
  /** สปิริตนี้อยู่ในรูปแบบเสื่อมสภาพ */
  | { selfExhausted: true }
  /** เทิร์นของคู่แข่ง */
  | { oppTurn: true }
  /** เทิร์นนี้ไลฟ์ของเราไม่ได้รับความเสียหายเลย */
  | { noLifeDamageThisTurn: true }
  /** สปิริตนี้ต่อสู้อยู่ (โจมตีหรือป้องกัน) */
  | { selfInBattle: true }
  /** การต่อสู้นี้ใช้ตีระบุแล้ว */
  | { directAttack: true }
  /** ผู้โจมตีของการต่อสู้ตอนนี้เป็นสปิริตของเราเผ่านี้ */
  | { attackerFamily: string }
  /** คู่แข่งมีเบิร์สเซ็ทอยู่ */
  | { opponentHasBurst: true }
  /**
   * สปิริตต้นเหตุ (subject) อยู่บนสนามในรูปแบบเสื่อมสภาพ และยังไม่ได้ใช้ความสามารถชื่อนี้ในเทิร์นนี้
   * ("เทิร์นละ 1 ครั้ง" ที่นับแยกต่อสปิริตที่ได้รับความสามารถ: ใช้คู่กับ step markSubjectOnce)
   */
  | { subjectCanRefreshOnce: string }
  /** สปิริต/อัลติเมทของเราบนสนามอย่างน้อย N ตัว */
  | { alliesAtLeast: number }
  /**
   * การ์ดของคู่แข่งบนสนามที่ตรงตัวกรองมีอย่างน้อย count ตัว (ไม่ระบุ = 1)
   * ไม่ระบุ types = นับเฉพาะสปิริต/อัลติเมท, withCores = ต้องมีคอร์วางอยู่
   */
  | { opponentHas: CardFilter; count?: number; withCores?: true }
  // ---------------- BS06
  /** คู่แข่งมีการ์ดในมืออย่างน้อย N ใบ */
  | { opponentHandAtLeast: number }
  /** สีของสปิริต/อัลติเมท/เน็กซัส (รวมเบรฟที่ร่วมร่าง) บนสนามของคู่แข่งรวมกันอย่างน้อย N สี */
  | { opponentColorsAtLeast: number }
  /** มีการ์ดของเราบนสนามที่ไม่ใช่การ์ดนี้ ตรงตัวกรอง (ไม่ระบุ types = สปิริต/อัลติเมท) */
  | { otherAllyHas: CardFilter }
  /** สปิริตนี้ร่วมร่างกับเบรฟอย่างน้อย N ใบ */
  | { selfBravesAtLeast: number }
  /** สปิริตนี้เป็นการโจมตีใบแรกสุดของเทิร์นเรา */
  | { firstAttackOfTurn: true }
  /** สปิริต/อัลติเมทของเราที่ตรงตัวกรองกำลังต่อสู้อยู่ */
  | { allyInBattle: CardFilter }
  // ---------------- BS07
  /** มีการ์ดเมจิคไทป์ [เพลง] วางบนฟิลด์เราอย่างน้อย N ใบ */
  | { songsAtLeast: number }
  /** (trigger summon) การ์ดนี้ถูกอัญเชิญโดย On Stage */
  | { summonedByOnStage: true }
  /** (trigger summon) การ์ดนี้ถูกอัญเชิญโดยเอฟเฟกต์ของการ์ดที่ตรงตัวกรอง */
  | { summonedBy: CardFilter }
  /** สปิริตนี้ถูกนำไปวางชิดด้านข้างโดย My Unit ในการต่อสู้นี้ */
  | { inUnit: true }
  /** สปิริต/อัลติเมทของเราที่ตรงตัวกรองอย่างน้อย count ตัว */
  | { alliesMatchAtLeast: { filter: CardFilter; count: number } }
  /** การ์ดนี้ยังไม่ได้ใช้ "เทิร์นละ 1 ครั้ง" ชื่อนี้ (ใช้คู่กับ step markOnce: นับเฉพาะครั้งที่ทำจริง) */
  | { onceFree: string }
  /** สปิริตนี้ (เบรฟ granted = ผู้ร่วมร่าง) ตรงตัวกรอง */
  | { selfIs: CardFilter }
  // ---------------- BS08
  /** การ์ดนี้ถูกอัญเชิญโดย Kagemusha แล้วตกเป็นเป้า (ในเทิร์นนี้) */
  | { kageTargeted: true }
  // ---------------- BS09
  /** ในแทรชเรามีการ์ดอย่างน้อย N ใบ */
  | { trashAtLeast: number }
  /** เจ็มของการ์ดบนสนามเรารวมกันมีอย่างน้อย N สี (นับเม็ดละ 1 สี: เม็ดหลายสีเลือกนับเป็นสีที่ยังไม่มี) */
  | { ownGemColorsAtLeast: number }
  /** เงื่อนไขใดเงื่อนไขหนึ่งเป็นจริง */
  | { any: Condition[] }
  /** กลับเงื่อนไข */
  | { not: Condition };

/** "ต่อจำนวน ... N ตัว/ใบ": ตัวคูณของ step (ได้ 0 = ไม่ทำ) */
export interface CountPer {
  /** สปิริต/อัลติเมทของเราที่ตรงตัวกรอง */
  allies?: CardFilter;
  /** BS09: นับ allies ของผู้เล่นทุกคน (ไม่ใช่เฉพาะของเรา) */
  anySide?: true;
  /** การ์ดเมจิคไทป์ [เพลง] บนฟิลด์เรา */
  songs?: true;
  /** เบรฟที่ร่วมร่างกับสปิริตต้นเหตุ (subject) */
  subjectBraves?: true;
  /** จำนวนชื่อทีมที่แตกต่างกันของสปิริตเรา */
  distinctTeams?: true;
  /** จำนวนการ์ดของคู่แข่งที่เอฟเฟกต์นี้ทำลาย */
  destroyedByThis?: true;
  /** BS09: จำนวนเจ็มรวมของการ์ดคู่แข่งที่เอฟเฟกต์นี้ทำลาย */
  destroyedSymbolsByThis?: true;
  /** หารด้วย (ต่อ 2 ตัว = 2) ไม่ระบุ = 1 */
  div?: number;
}

/** ตัวกรองการ์ด */
export interface CardFilter {
  types?: CardType[];
  family?: string;
  /** อยู่ในเผ่าใดเผ่าหนึ่งเหล่านี้ */
  families?: string[];
  /** BP ปัจจุบันไม่เกินค่านี้ (เฉพาะบนสนาม) */
  maxBp?: number;
  /** สภาพบนสนาม */
  state?: 'refresh' | 'exhausted';
  /** คอสต์ที่พิมพ์บนการ์ด */
  minCost?: number;
  maxCost?: number;
  cost?: number;
  /** ชื่อการ์ดมีคำใดคำหนึ่งนี้ */
  nameIncludes?: string[];
  /** การ์ดมีเอฟเฟกต์ Burst */
  hasBurst?: true;
  /** สีของการ์ด */
  color?: Color;
  /** BP ปัจจุบันตั้งแต่ค่านี้ (เฉพาะบนสนาม) */
  minBp?: number;
  /** มี Soul Core วางอยู่ */
  soul?: true;
  /** ไม่มี Soul Core วางอยู่ */
  noSoul?: true;
  /** เทียบคอสต์โดยถือว่า Brave ที่ร่วมร่างอยู่มีคอสต์ 0 */
  ignoreBraveCost?: true;
  /** การ์ดมี [Evolution] */
  hasEvolution?: true;
  /** การ์ดไม่มีเอฟเฟกต์ Burst */
  noBurst?: true;
  /** ชื่อการ์ดไม่ใช่ชื่อเหล่านี้ */
  excludeNames?: string[];
  /** ตรงตัวกรองใดตัวกรองหนึ่งเหล่านี้ (หรือ) */
  anyOf?: CardFilter[];
  /** มีคอร์วางอยู่ไม่เกิน N เม็ด (เฉพาะบนสนาม) */
  maxCores?: number;
  /** ไม่ได้ร่วมร่างกับเบรฟอยู่ */
  noBraves?: true;
  /** เจ็มรวม (รวมเบรฟที่ร่วมร่าง) ตั้งแต่ N เม็ด */
  minSymbols?: number;
  // ---------------- BS07
  /** อยู่ในทีมนี้ */
  team?: string;
  /** ไทป์ของเมจิค (เช่น เพลง) */
  magicType?: string;
  /** การ์ดมี On Stage */
  hasOnStage?: true;
  /** การ์ดมี Solo Part */
  hasSoloPart?: true;
  /** ไม่ใช่การ์ดที่วางแสดงนอกมือ ("ในมือเรา" อย่างเดียว) */
  notShown?: true;
  /** อยู่ทีมเดียวกันกับการ์ดเจ้าของเอฟเฟกต์ (self) / การ์ดต้นเหตุ (subject) อย่างน้อย 1 ทีม */
  sameTeamAs?: 'self' | 'subject';
  /** (engine ใช้ภายใน) อยู่ทีมใดทีมหนึ่งเหล่านี้ (แปลงจาก sameTeamAs) */
  teamsAny?: string[];
  /** นับการ์ดที่วางแสดงนอกมือด้วย ("ในมือ/นอกมือ"): เงื่อนไข handHas และ step ที่เลือกจากมือ (summonFromHand / summonFromHandFree / useMagicFromHandFree) · ไม่ระบุ = ในมืออย่างเดียว */
  withShown?: true;
  /** ไม่ใช่สปิริตนี้ ("ที่ไม่ใช่สปิริตนี้") */
  notSelf?: true;
  /** (engine ใช้ภายใน) ไม่ใช่การ์ดเหล่านี้ (แปลงจาก notSelf) */
  excludeIds?: string[];
  // ---------------- BS08
  /** ข้อความเอฟเฟกต์ของการ์ดมีคำใดคำหนึ่งนี้ (คีย์เวิร์ด เช่น Showdown / Rush / Evolution) */
  textIncludes?: string[];
  /** การ์ดไม่มีข้อความเอฟเฟกต์ */
  noEffectText?: true;
  /** อยู่เผ่าเดียวกันกับสปิริตนี้อย่างน้อย 1 เผ่า (แปลงเป็น families) */
  sameFamilyAs?: 'self';
  /** ไม่ได้ต่อสู้อยู่ (ไม่ใช่ผู้โจมตี/ผู้ป้องกัน) */
  notInBattle?: true;
  // ---------------- BS09
  /** กำลังต่อสู้อยู่ (ผู้โจมตี/ผู้ป้องกัน) */
  inBattle?: true;
  /** ไม่อยู่ในเผ่าใดเลยในเผ่าเหล่านี้ */
  notFamilies?: string[];
  /** มี BP มากที่สุดในบรรดาสปิริตของเจ้าของ (เท่ากันหลายตัว = นับทุกตัว) */
  highestBp?: true;
}

/** ปลายทางของ Core จากวอยด์ */
export type VoidTarget =
  /** บนการ์ดนี้ */
  | 'self'
  /** รีเสิร์ฟเรา */
  | 'reserve'
  /** สปิริตเรา 1 ตัวที่ไม่ใช่การ์ดนี้ (เลือก) */
  | 'otherAlly'
  /** สปิริตเรา 1 ตัว (เลือก รวมการ์ดนี้) */
  | 'ally'
  /** แทรชเรา */
  | 'trash'
  /** การ์ดต้นเหตุ (subject) ของ trigger */
  | 'subject'
  /** สปิริตเราที่ตรง filter ทุกตัว ตัวละ count */
  | 'allAllies'
  /** BS09: สปิริตที่ฟื้นสภาพโดย refreshAllAllies ก่อนหน้าในเอฟเฟกต์นี้ ตัวละ count */
  | 'refreshedByThis';

/** ขั้นตอนของเอฟเฟกต์ ทำตามลำดับ */
export type Step =
  /** เราจั่วการ์ด */
  | { do: 'draw'; count: number; if?: Condition; /** จำนวนใบ × จำนวนคอร์ไลฟ์ที่ลดลง (trigger lifeLost) */ perLifeLost?: true; per?: CountPer; }
  /** ในเทิร์นนี้ สปิริตนี้ BP+ */
  | {
      do: 'buffSelf';
      amount: number;
      if?: Condition;
      per?: CountPer;
      /** ข้อความไม่บอกระยะเวลา ([เมื่อสปิริตนี้โจมตี/ป้องกัน]) = มีผลจนจบการต่อสู้นั้น (ไม่ระบุ = ในเทิร์นนี้) */
      untilBattleEnd?: true;
    }
  /** ในเทิร์นนี้ เลือกสปิริต/อัลติเมท 1 ตัว (ฝ่ายใดก็ได้) BP+ */
  | { do: 'buffChosen'; amount: number; /** เฉพาะสปิริตของเรา */ ally?: true; filter?: CardFilter; /** หลังจากนั้น ถ้าสปิริตนั้นมี BP ตั้งแต่ค่านี้ ฟื้นสภาพสปิริตนั้น */ refreshIfMinBp?: number }
  /** สปิริตต้นเหตุ (subject) BP+ ในเทิร์นนี้ */
  | { do: 'buffSubject'; amount: number }
  /** [True-Rage]: คู่แข่งต้องป้องกันถ้าทำได้ (ใช้ระหว่างการต่อสู้) */
  | { do: 'mustBlock'; if?: Condition; subject?: true }
  /** ทำลายการ์ดของคู่แข่งทั้งหมดที่ตรงตัวกรอง */
  | { do: 'destroyAllOpponent'; filter: CardFilter }
  /** แสดงใบบนสุดเด็ค N ใบ เลือก 1 ใบที่ตรงตัวกรองขึ้นมือ ที่เหลือลง Trash */
  | { do: 'revealPickRestTrash'; count: number; filter: CardFilter; /** การ์ดที่เหลือ: ลงแทรช (ค่าเริ่มต้น) / ใต้สุดเด็ค / บนสุดเด็ค เรียงลำดับได้ */ rest?: 'trash' | 'bottom' | 'top' }
  /** แสดงใบบนสุดเด็ค N ใบ นำการ์ดที่ตรงตัวกรองทั้งหมดขึ้นมือ ที่เหลือลงแทรช */
  | { do: 'revealTakeAll'; count: number; filter: CardFilter; /** ที่เหลือ: แทรช (ค่าเริ่มต้น) / ใต้สุดเด็คเรียงลำดับได้ */ rest?: 'trash' | 'bottom' }
  /** นำการ์ดในแทรชเรา 1 ใบที่ตรงตัวกรอง กลับขึ้นมือ */
  | { do: 'returnFromTrash'; filter: CardFilter; if?: Condition }
  /** เมื่อจบการต่อสู้นี้ จบ Attack Step */
  | { do: 'endAttackStepAfterBattle' }
  /**
   * ในการต่อสู้นี้ ส่งไลฟ์คู่แข่งลงรีเสิร์ฟคู่แข่ง ต่อผู้ป้องกัน 1 ตัวที่ถูกทำลายจากการเทียบ BP
   * onlyConsecutiveBlade = นับเฉพาะเมื่อการต่อสู้นี้ใช้ [Consecutive Blade]
   */
  | { do: 'lifeOnBlockerDestroyed'; amount: number; if?: Condition; onlyConsecutiveBlade?: true; /** ส่งคอร์ไลฟ์ไปแทรชแทนรีเสิร์ฟ */ to?: 'trash' }
  /** ในการต่อสู้นี้ เมื่อสปิริตคู่แข่งที่ต่อสู้อยู่ถูกทำลาย/สูญสลาย (ด้วยเหตุใดก็ได้) ส่งคอร์ไลฟ์คู่แข่ง amount เม็ดไป to */
  | { do: 'lifeOnBattlerGone'; amount: number; to: 'reserve' | 'trash' }
  /** (Draw Step) จำนวนจั่วของ Draw Step นี้ +amount */
  | { do: 'addDrawStepDraw'; amount: number }
  /** คู่แข่งเลือกทิ้งการ์ดบนมือตัวเอง count ใบ */
  | { do: 'opponentDiscards'; count: number; if?: Condition; /** จำนวนใบ = จำนวนการ์ดที่มือคู่แข่งเพิ่มขึ้น (trigger oppHandIncreased) */ perHandIncrease?: true }
  /** ถ้าเอฟเฟกต์นี้ทำให้การ์ดที่มี Soul Core วางอยู่สูญสลาย: ทำ steps */
  | { do: 'ifDepletedSoul'; steps: Step[] }
  /** ส่งคอร์ในรีเสิร์ฟคู่แข่งทั้งหมดไปแทรชคู่แข่ง */
  | { do: 'opponentReserveToTrash' }
  /** ในการต่อสู้นี้ ถ้าสปิริตนี้ชนะและทำลายสปิริตคู่แข่งจากการเทียบ BP: สปิริตนี้ฟื้นสภาพ */
  | { do: 'refreshOnBattleWin'; if?: Condition }
  /** ในการต่อสู้นี้ คู่แข่งป้องกันได้เฉพาะการ์ดที่ตรงตัวกรอง */
  | { do: 'restrictBlockers'; filter: CardFilter }
  /** ในการต่อสู้นี้ คู่แข่งใช้เอฟเฟกต์แฟลชไม่ได้ */
  | { do: 'battleNoFlash' }
  /** ในการต่อสู้นี้ คู่แข่งสั่งใช้เบิร์สไม่ได้ */
  | { do: 'battleNoBurst'; if?: Condition }
  /** ส่งคอร์ทั้งหมดบนเน็กซัสคู่แข่งทั้งหมดลงแทรชคู่แข่ง */
  | { do: 'opponentNexusCoresToTrash' }
  /** "ในเทิร์นนี้, เมื่อสปิริตของเราถูกทำลาย": ทำ steps (subject = สปิริตที่ถูกทำลาย) */
  | { do: 'turnTrigger'; on: 'allyDestroyed'; steps: Step[] }
  /** นำการ์ดต้นเหตุ (subject) ในแทรชเรากลับขึ้นมือ */
  | { do: 'subjectToHand'; if?: Condition }
  /** ส่ง Soul Core บนสปิริตนี้ไปที่แทรชเรา */
  | { do: 'soulToTrash' }
  /** [Consecutive Blade]: คู่แข่งต้องป้องกันด้วย 2 ตัวถ้าทำได้ และต่อสู้พร้อมกัน */
  | { do: 'consecutiveBlade' }
  /**
   * เราเลือกสปิริต/อัลติเมทของคู่แข่งที่จะป้องกันในการต่อสู้นี้ (ไม่เลือกก็ได้, เลือกตัวที่เสื่อมสภาพได้)
   * เลือกได้สูงสุดเท่าจำนวนผู้ป้องกันของการต่อสู้นี้
   */
  | {
      do: 'chooseBlockers';
      /** เลือกได้เฉพาะตัวที่ตรงตัวกรอง */
      filter?: CardFilter;
      /** ตีระบุ: เลือกแล้วไม่มีแฟลชหลังโจมตี ตัวที่ถูกเลือกป้องกันทันที (กติกา 14 ตีระบุ) */
      direct?: true;
    }
  /** เราเลือกทิ้งการ์ดในมือ N ใบ */
  | { do: 'discard'; count: number; if?: Condition; filter?: CardFilter }
  /** นำ Core จากวอยด์ (Core ใหม่) วางที่ไลฟ์เรา */
  | { do: 'gainLifeFromVoid'; count: number }
  /** Burst: "หลังจากนั้นสามารถจ่ายคอสต์ เพื่อให้เอฟเฟกต์ [Flash] ของการ์ดนี้ทำงาน" (จ่ายหรือไม่ก็ได้) */
  | { do: 'payToUseFlash' }
  /** (engine ใช้ภายใน) เปิด Burst: นำการ์ดออกจากช่อง Burst และลง Trash เมื่อประมวลผลเสร็จ */
  | { do: 'openBurst' }
  /** สปิริตนี้ฟื้นสภาพ */
  | { do: 'refreshSelf'; if?: Condition }
  /** เลือกการ์ดของคู่แข่งที่ตรงตัวกรองแล้วทำลาย count ตัว (ไม่ระบุ = 1, ไม่มีให้เลือก = ข้าม) */
  | {
      do: 'destroyChosenOpponent';
      filter: CardFilter;
      count?: number;
      exclude?: string[];
      if?: Condition;
      /** BP ไม่เกิน: self = BP ปัจจุบันของสปิริตนี้, subjectLv1 = BP ที่ Lv1 ของสปิริตต้นเหตุ */
      bpFrom?: 'self' | 'subjectLv1';
      /** เลือกการ์ดของฝ่ายไหนก็ได้ (รวมของเรา) */
      anySide?: true;
      /** (engine ใช้ภายใน) ขยายจำนวนเป้าด้วย Dispersion แล้ว */
      dispersed?: true;
      /** คอสต์ไม่เกิน: subject = คอสต์ (บนสนาม) ของการ์ดต้นเหตุ */
      costFrom?: 'subject' | 'self' | 'chosen' | 'alliesSum';
      /** costFrom alliesSum: นับคอสต์รวมของสปิริต/อัลติเมทของเราที่ตรงตัวกรอง (ไม่รวมสปิริตนี้) */
      alliesFilter?: CardFilter;
      per?: CountPer;
    }
  /** ถ้าเอฟเฟกต์นี้ทำลายการ์ดที่ตรงเงื่อนไขได้ (BP ตอนถูกทำลาย / ประเภท) ทำ steps ต่อ */
  | { do: 'ifDestroyed'; filter: { minBp?: number; types?: CardType[]; opponent?: true }; steps: Step[] }
  /** ทำลาย Brave ที่ร่วมร่างอยู่ของคู่แข่ง 1 ใบ (เลือก) */
  | { do: 'destroyOpponentBrave'; if?: Condition }
  /** คู่แข่งเลือกทำลายการ์ดของตัวเองที่ตรงตัวกรอง 1 ใบ */
  | { do: 'opponentDestroysOwn'; filter: CardFilter }
  /** "ในเทิร์นนี้ สปิริตเราทั้งหมด (ที่ตรงตัวกรอง) BP+": มีผลทั้งเทิร์น รวมตัวที่ลงสนามทีหลัง */
  | { do: 'buffAllies'; amount: number; filter?: CardFilter }
  /** อัญเชิญการ์ดในแทรชเราไม่จ่ายคอสต์ (เลือก ไม่อัญเชิญก็ได้) */
  | { do: 'summonFromTrashFree'; filter: CardFilter }
  /** ทำลายสปิริต/อัลติเมทของคู่แข่งที่คอสต์สูงสุด 1 ตัว (คอสต์สูงสุดเท่ากันหลายตัว = เลือก) */
  | { do: 'destroyHighestCostOpponent'; filter: CardFilter }
  /** ทิ้งใบบนสุดเด็คคู่แข่ง N ใบ ('level' = เท่าเลเวลของสปิริตนี้: [Crush]) */
  | { do: 'mill'; count: number | 'level' }
  /** ถ้าการ์ดที่ถูกทิ้งด้วย mill ล่าสุดของเอฟเฟกต์นี้ ตรงตัวกรองอย่างน้อย 1 ใบ: ทำ steps */
  | { do: 'ifMilled'; filter: CardFilter; steps: Step[] }
  /** ทิ้งใบบนสุดเด็คคู่แข่ง 1 ใบ ต่อคอสต์รวมของการ์ดคู่แข่งที่ถูกทำลายโดยเอฟเฟกต์นี้ */
  | { do: 'millPerDestroyedCost' }
  /** ทิ้งเบิร์สที่เซ็ทอยู่ของคู่แข่ง */
  | { do: 'discardOpponentBurst' }
  /** สปิริตที่เป็นต้นเหตุของ trigger (เช่น สปิริตที่ทิ้งเด็ค) ฟื้นสภาพ */
  | { do: 'refreshSubject'; if?: Condition }
  /**
   * สามารถอัญเชิญการ์ดบนมือเรา 1 ใบที่ตรงตัวกรอง (จ่ายคอสต์ตามปกติ)
   * fullReductionIf = ถ้าเงื่อนไขเป็นจริง การลดคอสต์ทั้งหมดถือว่าลดจนครบแล้ว
   */
  | { do: 'summonFromHand'; filter: CardFilter; fullReductionIf?: Condition }
  /** (engine ใช้ภายใน) จ่ายคอสต์เพื่ออัญเชิญ cardId จากมือ */
  | { do: 'payForSummon'; cardId: string; cost: number }
  /** (engine ใช้ภายใน) ทำลายการ์ด (ไม่ถามเอฟเฟกต์แทนที่ซ้ำ) */
  | { do: 'destroyCard'; cardId: string; by: 'p1' | 'p2'; bySource?: string }
  /** (engine ใช้ภายใน) การ์ดอยู่บนสนามต่อในรูปแบบเสื่อมสภาพ */
  | { do: 'exhaustCard'; cardId: string }
  /** (engine ใช้ภายใน) ถือว่าถูกทำลายแล้ว แต่ยังอยู่บนสนาม (เอฟเฟกต์แทนที่) ในสภาพ state (ไม่ระบุ = เสื่อมสภาพ) */
  | { do: 'destroyedButStays'; cardId: string; by: 'p1' | 'p2'; bySource?: string; state?: 'refresh' | 'exhausted' }
  /** นำการ์ดทั้งหมดในแทรชเราไปไว้ใต้สุดเด็ค (เรียงลำดับได้) */
  | { do: 'trashToDeckBottom' }
  /** สามารถอัญเชิญไม่จ่ายคอสต์การ์ดบนมือเรา 1 ใบที่ตรงตัวกรอง */
  | { do: 'summonFromHandFree'; filter: CardFilter; if?: Condition; /** อัญเชิญได้ไม่เกิน max ใบ (ไม่ระบุ = 1) */ max?: number }
  /**
   * ในเทิร์นนี้ เลือกการ์ดของคู่แข่งที่ตรงตัวกรอง BP-amount แล้วทำลายตัวที่ BP กลายเป็น 0
   * count = จำนวนตัว (ไม่ระบุ = 1), countPerAllyFamily = จำนวนตัวเท่าสปิริตเราเผ่านี้
   */
  | {
      do: 'debuffChosenOpponent';
      amount: number;
      filter: CardFilter;
      /** "ทำลายสปิริตที่กลายเป็น BP0 โดยเอฟเฟกต์นี้" (ไม่ระบุ = BP0 แล้วยังอยู่บนสนาม) */
      destroyAtZero?: true;
      /** "เสื่อมสภาพสปิริตที่กลายเป็น BP0 โดยเอฟเฟกต์นี้" */
      exhaustAtZero?: true;
      count?: number;
      countPerAllyFamily?: string;
      if?: Condition;
      exclude?: string[];
      /** (engine ใช้ภายใน) ขยายจำนวนเป้าด้วย Dispersion แล้ว */
      dispersed?: true;
      /** (engine ใช้ภายใน) บวก Charge แล้ว */
      charged?: true;
    }
  /** ในเทิร์นนี้ การ์ดของคู่แข่งประเภทเหล่านี้ทั้งหมดโจมตีไม่ได้ */
  | { do: 'opponentCannotAttack'; types: CardType[]; if?: Condition }
  /** เสื่อมสภาพสปิริตคู่แข่ง N ตัว (เลือกทีละตัว จากตัวที่ยังฟื้นสภาพ) */
  | {
      do: 'exhaustOpponent';
      count: number;
      /** (engine ใช้ภายใน) ขยายจำนวนเป้าด้วย Dispersion แล้ว */
      dispersed?: true;
      filter?: CardFilter;
      if?: Condition;
      /** ตัวที่เสื่อมสภาพโดยเอฟเฟกต์นี้ฟื้นสภาพไม่ได้จนจบรีเฟรชสเต็ปครั้งถัดไปของเจ้าของ */
      lockRefresh?: true;
      /** (engine ใช้ภายใน) บวก Charge แล้ว */
      charged?: true;
      per?: CountPer;
    }
  /** เสื่อมสภาพสปิริตคู่แข่งกี่ตัวก็ได้ BP รวมไม่เกิน maxTotal */
  | { do: 'exhaustOpponentTotalBp'; maxTotal: number }
  /** นำการ์ดคู่แข่ง 1 ใบที่ตรงตัวกรองกลับขึ้นมือ (Core บนการ์ดไปรีเสิร์ฟของเจ้าของ) */
  | {
      do: 'bounceOpponent';
      filter: CardFilter;
      /** ปลายทาง (ไม่ระบุ = กลับขึ้นมือ) */
      to?: 'hand' | 'deckBottom' | 'deckTop';
      /** เลือกการ์ดฝ่ายไหนก็ได้ (รวมของเรา) */
      anySide?: true;
      count?: number;
      /** จำนวนตัว = จำนวนสปิริตเผ่านี้ของเรา */
      countPerAllyFamily?: string;
      /** คอสต์ไม่เกิน: self = คอสต์สปิริตนี้, subject = คอสต์ดั้งเดิมของการ์ดต้นเหตุ */
      costFrom?: 'self' | 'subject';
      /** BP ไม่เกิน: subject = BP ปัจจุบันของการ์ดต้นเหตุ */
      bpFrom?: 'subject';
      if?: Condition;
      /** (engine ใช้ภายใน) ขยายจำนวนเป้าด้วย Dispersion แล้ว */
      dispersed?: true;
      per?: CountPer;
    }
  /** นำการ์ดของคู่แข่งที่ตรงตัวกรองทั้งหมดกลับขึ้นมือ */
  | { do: 'bounceAllOpponent'; filter: CardFilter; if?: Condition; /** deckTop = กลับไปไว้บนสุดเด็คโดยเรียงลำดับได้ */ to?: 'deckTop' }
  /** นำ Core จากวอยด์มาวาง */
  | { do: 'voidCore'; to: VoidTarget; count: number; filter?: CardFilter; if?: Condition; /** จำนวนเม็ด = จำนวนสปิริตของเรา */ countPerAlly?: true; per?: CountPer }
  /** ส่ง Soul Core บนสปิริตนี้ไปที่รีเสิร์ฟเรา */
  | { do: 'soulToReserve' }
  /**
   * แสดงใบบนสุดเด็ค N ใบ อัญเชิญไม่จ่ายคอสต์ใบที่ตรงตัวกรองได้สูงสุด max ใบ (null = กี่ใบก็ได้)
   * ที่เหลือไว้ใต้สุดเด็ค (เรียงลำดับได้)
   */
  | { do: 'revealSummon'; count: number; filter: CardFilter; max: number | null; /** ที่เหลือ: ใต้สุดเด็ค (ค่าเริ่มต้น) / ลงแทรช */ rest?: 'bottom' | 'trash' }
  /** (Burst) หลังเอฟเฟกต์นี้ อัญเชิญการ์ดสปิริตนี้ไม่จ่ายคอสต์ */
  | { do: 'summonThisFree' }
  /** ทิ้งการ์ดบนมือเราทั้งหมด แล้วจั่วการ์ดเท่าจำนวนการ์ดบนมือคู่แข่ง */
  | { do: 'discardHandDrawOpponentCount' }
  /** ฟื้นสภาพสปิริตเรา 1 ตัวที่ตรงตัวกรอง */
  | {
      do: 'refreshChosenAlly';
      filter: CardFilter;
      if?: Condition;
      /** ถ้าเงื่อนไขนี้จริง ฟื้นสภาพสปิริตเราทั้งหมดที่ชื่อเดียวกับตัวที่ฟื้นสภาพด้วย */
      sameNameIf?: Condition;
      /** จำนวนตัว (ไม่ระบุ = 1) */
      count?: number;
      exclude?: string[];
      /** (engine ใช้ภายใน) บวก Charge แล้ว */
      charged?: true;
    }
  /** เสื่อมสภาพสปิริต/อัลติเมทของคู่แข่งที่ตรงตัวกรองทั้งหมด */
  | { do: 'exhaustAllOpponent'; filter: CardFilter; if?: Condition }
  /**
   * ส่งคอร์บนสปิริต/อัลติเมทของคู่แข่งไปรีเสิร์ฟ (หรือแทรช) ของคู่แข่ง ทีละเม็ด (เลือกเป้าหมายทุกครั้ง)
   *  - untilOne: เลือก 1 ตัว ส่งจนเหลือคอร์ 1 เม็ด
   *  - opponentChooses: คู่แข่งเลือกสปิริตของตัวเอง
   *  - countPerAllyFamily / countPerSelfCore: จำนวนเม็ด = จำนวนสปิริตเผ่านั้นของเรา / คอร์บนสปิริตนี้
   */
  | {
      do: 'removeOpponentCores';
      count: number;
      filter?: CardFilter;
      /** void = ออกจากเกม (ไปวอยด์) */
      to?: 'reserve' | 'trash' | 'void';
      untilOne?: true;
      opponentChooses?: true;
      countPerAllyFamily?: string;
      countPerSelfCore?: true;
      /** จำนวนเม็ด = จำนวนการ์ดที่ตรงตัวกรองจากที่ทิ้งเด็คล่าสุดของเอฟเฟกต์นี้ (millSelf) */
      countPerMilled?: CardFilter;
      /** จำนวนเม็ดที่ส่งออกจากตัวที่เลือกแต่ละครั้ง (ไม่ระบุ = 1) */
      perPick?: number;
      if?: Condition;
      per?: CountPer;
      /** (engine ใช้ภายใน) บวก Charge แล้ว */
      charged?: true;
    }
  /**
   * (ภายใน engine) ส่งคอร์ n เม็ดออกจากการ์ด cardId ไป to
   * มี Soul Core และเลือกได้ (ส่งไม่หมด และคอร์ปกติพอ) = เจ้าของการ์ดเลือกว่าจะส่ง Soul Core ด้วยหรือไม่ (กติกา 07 Q2)
   * soul = ผลที่เลือกแล้ว · byOpponent = เอฟเฟกต์ของคู่แข่ง (เช็กสูญสลายโดยคู่แข่ง)
   */
  | { do: 'coresOff'; cardId: string; n: number; to: 'reserve' | 'trash' | 'void'; byOpponent: boolean; soul?: boolean }
  /**
   * (ภายใน engine) ส่งคอร์ออกจากหลายตัวตามที่แบ่งไว้ (choice distribute) ทีเดียว:
   * ถาม Kagemusha ของทุกเป้าก่อน (kage = ผู้เลือกคือผู้ควบคุมเอฟเฟกต์) → ถามเรื่อง Soul Core ของแต่ละตัว → ส่งออกพร้อมกัน
   */
  /**
   * (ภายใน engine) ผลของการเลือกหลายใบทีเดียว (choice multiCard): step = step เดิม (count 1) · player = ผู้เลือก
   * ถาม Kagemusha ของทุกเป้าก่อน (kage) แล้วทำผลกับทีละใบต่อกันทันที
   */
  | { do: 'applyPicks'; picks: string[]; step: Step; player: 'p1' | 'p2'; kage: boolean }
  | { do: 'coresOffBatch'; alloc: { cardId: string; n: number; soul?: boolean }[]; to: 'reserve' | 'trash' | 'void'; kage: boolean }
  /** ทิ้งใบบนสุดเด็คเราเอง */
  | { do: 'millSelf'; count: number }
  /** ในการต่อสู้นี้ ผู้โจมตีจะไม่ถูกป้องกัน (by: 'spirits' = ไม่ถูกป้องกันโดยสปิริตเท่านั้น) */
  | { do: 'battleUnblockable'; /** spirits = ไม่ถูกป้องกันโดยสปิริต, ultimates = ไม่ถูกป้องกันโดยอัลติเมท */ by?: 'spirits' | 'ultimates'; if?: Condition }
  /** ในเทิร์นนี้ เลือกสปิริตเราที่ตรงตัวกรอง N ตัวให้ไม่ถูกป้องกัน (countPerNexus = จำนวนเน็กซัสของผู้เล่นทุกคน) */
  | { do: 'unblockableThisTurn'; filter: CardFilter; count?: number; countPerNexus?: true }
  /** ในการต่อสู้นี้ คู่แข่งใช้การ์ดในมือในช่วง Flash ไม่ได้ */
  | { do: 'battleNoHandFlash' }
  /** ในการต่อสู้นี้ สปิริตเราที่ถูกทำลายโดยคู่แข่งจะยังอยู่บนสนามในรูปแบบเสื่อมสภาพ */
  | { do: 'battleStaysOnDestroy'; if?: Condition }
  /** ใช้งานการ์ดเมจิค [Flash] 1 ใบในมือเราโดยไม่จ่ายคอสต์ */
  | { do: 'useMagicFromHandFree' }
  /** ส่ง Soul Core บนสปิริตเราที่ตรงตัวกรอง 1 ตัว (เลือก) ลงแทรช */
  | { do: 'allySoulToTrash'; filter: CardFilter }
  /** นำการ์ดในมือเราที่ตรงตัวกรอง 1 ใบไป "วางแสดงนอกมือ" (ทั้งสองฝ่ายเห็น ใช้งานได้เหมือนอยู่ในมือจนจบเกม) */
  | { do: 'showFromHand'; filter: CardFilter }
  /** ในการต่อสู้นี้ เจ็มของสปิริตนี้ (รวม Brave) กลายเป็นเจ็มสี color จำนวน count เม็ด */
  | { do: 'setSymbols'; color: Color; count: number }
  /** จดว่าสปิริตต้นเหตุ (subject) ใช้ความสามารถชื่อนี้แล้วในเทิร์นนี้ (ดู subjectCanRefreshOnce) */
  | { do: 'markSubjectOnce'; key: string }
  /** ถ้าเบิร์สของคู่แข่งถูกทิ้งโดยเอฟเฟกต์นี้: ทำ steps */
  | { do: 'ifBurstDiscarded'; steps: Step[] }
  /** เลือกการ์ดของเราที่ฟื้นสภาพอยู่และตรงตัวกรอง 1 ใบ แล้วเสื่อมสภาพ (ไม่ระบุ types = สปิริต/อัลติเมท) */
  | { do: 'exhaustOwn'; filter: CardFilter }
  /** สามารถอัญเชิญการ์ดในแทรชเรา 1 ใบที่ตรงตัวกรอง (จ่ายคอสต์ตามคอสต์ในแทรช) repeat = กี่ใบก็ได้ */
  | { do: 'summonFromTrash'; filter: CardFilter; repeat?: true }
  /** ส่งคอร์ไลฟ์คู่แข่ง N เม็ดไปที่รีเสิร์ฟคู่แข่ง */
  | { do: 'opponentLifeToReserve'; count: number }
  /** ส่ง Core บนสปิริตนี้ N ดวงลงแทรชเรา (เลือก Core ธรรมดาก่อน) */
  | { do: 'selfCoresToTrash'; count: number; /** ส่งไปรีเสิร์ฟเราแทนแทรช */ to?: 'reserve' }
  /** เมื่อจบการต่อสู้นี้ ทำ steps */
  | { do: 'atBattleEnd'; steps: Step[] }
  /** นำสปิริตนี้กลับขึ้นมือ ถ้าสำเร็จทำ then */
  | { do: 'returnSelfToHand'; then?: Step[] }
  /** สามารถนำการ์ดที่มีเอฟเฟกต์ Burst บนมือเรา 1 ใบไปเซ็ทได้ */
  /**
   * เซ็ทการ์ดที่มีเอฟเฟกต์เบิร์ส "ในมือ" (ไม่รวมการ์ดนอกมือ กติกา 06 Q5)
   * then = ทำต่อเฉพาะเมื่อเซ็ทจริง ("สามารถ X เพื่อ Y": มี then = ต้องเลือก 1 ใบ ไม่มีปุ่มไม่เลือก เพราะเลือกใช้มาแล้วจาก may)
   */
  | { do: 'setBurstFromHand'; then?: Step[] }
  /** [Catalyze]: สั่งใช้ Soul Burst สีนี้ของเราที่เซ็ทอยู่ (ไม่ต้องรอเงื่อนไข) */
  | { do: 'catalyze'; /** ไม่ระบุ = ทุกสี */ color?: Color; /** "หลังจากเบิร์สนั้นถูกสั่งใช้": ทำต่อหลังเบิร์สทำงานจบ */ then?: Step[] }
  /** (engine ใช้ภายใน) ไล่วางการ์ดที่เหลือไว้ใต้สุดเด็คตามลำดับที่เลือก */
  | { do: 'toDeckBottom'; cardIds: string[] }
  /** (engine ใช้ภายใน) การ์ดที่แสดง (ยังอยู่บนสุดเด็ค) เรียงลำดับใหม่บนสุดเด็ค: ใบที่เลือกทีหลังอยู่บนกว่า */
  | { do: 'toDeckTop'; cardIds: string[] }
  /** (engine ใช้ภายใน) วาง Core จากรีเสิร์ฟบนการ์ดที่อัญเชิญไม่จ่ายคอสต์ แล้วนำลงสนาม */
  | {
      do: 'placeCores';
      cardId: string;
      state?: 'refresh' | 'exhausted';
      noSummon?: true;
      asSpirit?: true;
      /** (engine ใช้ภายใน) เบรฟที่อยู่ต่อหลังร่างต้น (id นี้) ออกจากสนาม: ถ้าร่างต้นกำลังโจมตีอยู่ในแฟลชหลังโจมตี เบรฟโจมตีต่อ */
      continuesAttackOf?: string;
    }
  /** (engine ใช้ภายใน) Brave ที่อัญเชิญด้วยเอฟเฟกต์: เลือกสปิริตที่จะร่วมร่าง หรือไม่เลือก = ลงเป็นสปิริต */
  | { do: 'braveOrSpirit'; cardId: string }
  /** (engine ใช้ภายใน) เบรฟที่ผู้ร่วมร่างออกจากสนาม: เลือกให้อยู่ต่อหรือลง Trash */
  /** (ภายใน engine) ร่างต้นออกจากสนาม: เบรฟจะคงอยู่ไหม · รีเสิร์ฟไม่พอ Lv1 = ลงแทรชเลย ไม่ถาม (กติกา 04 ข้อ 2) */
  | { do: 'braveFate'; cardId: string; state: 'refresh' | 'exhausted'; continuesAttackOf?: string }
  | { do: 'braveTrash'; cardId: string }
  /**
   * ผู้ควบคุมเลือก 1 ตัวเลือก (if = ถามเฉพาะเมื่อเงื่อนไขเป็นจริง)
   * options[].if = ตัวเลือกนี้เลือกได้เฉพาะเมื่อเงื่อนไขเป็นจริง ("สามารถ X เพื่อ Y": ต้องทำได้ทั้งสองท่อน)
   * ถ้าเหลือแต่ตัวเลือกที่ไม่ทำอะไร = ไม่ถาม
   */
  | { do: 'chooseOne'; options: { label: string; steps: Step[]; if?: Condition }[]; if?: Condition }
  // ---------------- BS05
  /** ถ้าการ์ดที่ returnFromTrash ล่าสุดของเอฟเฟกต์นี้นำขึ้นมือตรงตัวกรอง: ทำ steps */
  | { do: 'ifReturned'; filter: CardFilter; steps: Step[] }
  /** ในเทิร์นนี้ เลือกการ์ดของคู่แข่งที่ตรงตัวกรอง count ตัว: โจมตี/ป้องกันไม่ได้ */
  | { do: 'disableChosenOpponent'; filter: CardFilter; count?: number; countPerAllyFamily?: string; if?: Condition; dispersed?: true; per?: CountPer; }
  /** อัญเชิญไม่จ่ายคอสต์: subject = การ์ดต้นเหตุ (เช่น การ์ดสปิริตที่ใช้เป็นเมจิค) / self = การ์ดนี้ (ในแทรช) */
  | { do: 'summonCardFree'; which: 'subject' | 'self'; /** "เมื่อเป็นเช่นนั้น": ทำต่อเมื่ออัญเชิญสำเร็จ */ then?: Step[] }
  /** สามารถทิ้งการ์ดในมือเราได้ไม่เกิน max ใบ (จำจำนวนไว้ใช้กับ removeCoresPerDiscarded) */
  | { do: 'discardUpTo'; max: number; filter?: CardFilter }
  /** ส่งคอร์ 1 เม็ดบนสปิริตคู่แข่ง ต่อการ์ดที่ discardUpTo ทิ้งไป 1 ใบ */
  | { do: 'removeCoresPerDiscarded'; to: 'reserve' | 'trash' }
  /** อัญเชิญไม่จ่ายคอสต์การ์ดในแทรชเรากี่ใบก็ได้ คอสต์รวม (คอสต์ในแทรช) ไม่เกิน budget */
  | { do: 'summonFromTrashBudget'; filter: CardFilter; budget: number }
  /** ในการต่อสู้นี้: สปิริตคู่แข่งที่ฟื้นสภาพป้องกันไม่ได้ ที่เสื่อมสภาพป้องกันได้ และฟื้นสภาพเมื่อป้องกัน */
  | { do: 'battleExhaustedBlock' }
  /** เมื่อจบการต่อสู้นี้ ถ้าเงื่อนไขเป็นจริง (ตรวจตอนจบ) จบ Attack Step */
  | { do: 'endAttackStepIfAfterBattle'; if: Condition }
  /** นำการ์ดต้นเหตุ (เมจิคที่ใช้แล้ว) จากแทรชไปวางแสดงนอกมือ */
  | { do: 'showSubjectFromTrash' }
  /** สามารถนำการ์ดที่วางแสดงนอกมือที่มีเอฟเฟกต์ Burst 1 ใบไปเซ็ทได้ */
  | { do: 'setBurstFromShown' }
  /** เลือก 1 สี แล้วนำการ์ดที่ตรงตัวกรองสีนั้นทั้งหมดในแทรชเรากลับขึ้นมือ */
  | { do: 'returnAllChosenColor'; filter: CardFilter; if?: Condition }
  /** นำการ์ดในแทรชเราที่ตรงตัวกรองทั้งหมดกลับขึ้นมือ */
  | { do: 'returnAllFromTrash'; filter: CardFilter }
  /** ในการต่อสู้นี้ ผู้โจมตี (สปิริตนี้) ไม่ถูกป้องกันโดยสปิริตคู่แข่งที่คอสต์ไม่เกินคอสต์ของสปิริตนี้ */
  | { do: 'unblockableByCostAtMostSelf' }
  /** ในการต่อสู้นี้ คู่แข่งจะป้องกันได้ต้องส่งคอร์รีเสิร์ฟ N เม็ดลงแทรช */
  | { do: 'blockTax'; reserveToTrash: number; /** ทิ้งการ์ดบนมือแทน (อาคิตะ-ด็อก) */ discard?: number }
  /** ทำลายเบรฟที่ให้เอฟเฟกต์นี้ (ร่วมร่างอยู่) ถ้าทำได้ ทำ then */
  | { do: 'destroySourceBrave'; then?: Step[] }
  /** ถ้า debuff ของเอฟเฟกต์นี้ทำให้สปิริตคู่แข่งกลายเป็น BP0 เป็นตัวแรกของเทิร์น: ทำ steps */
  | { do: 'ifFirstZeroBp'; steps: Step[] }
  /** นำคอร์รีเสิร์ฟเรา N เม็ดไปวางที่ไลฟ์เรา */
  | { do: 'reserveToLife'; count: number }
  /** ในการต่อสู้นี้ สปิริตนี้ถือว่าไร้สี */
  | { do: 'battleColorless' }
  /** นำคอร์ 1 เม็ดบนสปิริตคู่แข่งไปวางบนสปิริตตัวอื่นของคู่แข่ง (fromId: engine ใช้ภายใน) */
  | { do: 'moveOpponentCore'; fromId?: string }
  /** ในเทิร์นนี้ สปิริต/เน็กซัสของคู่แข่งทั้งหมดสูญเสียเอฟเฟกต์ทั้งหมด */
  | { do: 'negateOpponentsThisTurn' }
  /** นำ Soul Core บนการ์ดนี้ไปวางบนสปิริตเรา 1 ตัว (เลือก) */
  | {
      do: 'soulToAlly';
      /** self = Soul Core บนสปิริตนี้ (เบรฟที่ให้เอฟเฟกต์: ผู้ร่วมร่าง) แทนการ์ดเจ้าของเอฟเฟกต์ */
      from?: 'self';
      /** ฟื้นสภาพสปิริตที่รับ Soul Core */
      refresh?: true;
      /** หลังวางสำเร็จ ทำต่อ */
      then?: Step[];
    }
  /** ถ้าเอฟเฟกต์นี้ทำให้การ์ดของคู่แข่งสูญสลาย: ทำ steps */
  | { do: 'ifDepleted'; steps: Step[] }
  /** ในเทิร์นนี้ สปิริต/อัลติเมทที่มีเจ็มตั้งแต่ minSymbols เม็ดถือว่ามีเจ็ม 0 */
  | { do: 'symbolsZeroThisTurn'; minSymbols: number }
  /** สามารถทำลายสปิริตเรากี่ตัวก็ได้ แล้วนำการ์ดในแทรชที่ตรงตัวกรองกลับขึ้นมือ ต่อจำนวนที่ทำลาย (count: engine ใช้ภายใน) */
  | { do: 'destroyOwnForReturn'; filter: CardFilter; count?: number }
  // ---------------- BS06
  /** นำการ์ดของเรา 1 ใบที่ตรงตัวกรองกลับขึ้นมือ (บังคับถ้ามี) other = ไม่ใช่สปิริตนี้ */
  | { do: 'returnOwnToHand'; filter: CardFilter; other?: true }
  /** สามารถย้าย Soul Core บนสปิริตของเรา ไปวางบนสปิริตอื่นของเรา (fromId: engine ใช้ภายใน) */
  | { do: 'moveAllySoul'; fromId?: string; /** ย้ายจากสปิริตที่ตรงตัวกรองเท่านั้น */ filter?: CardFilter }
  /** สามารถนำสปิริตของเราที่ตรงตัวกรอง 1 ตัวไปเซ็ทเบิร์ส */
  | { do: 'setBurstFromField'; filter: CardFilter }
  /** ในการต่อสู้นี้ สปิริตนี้ไม่รับผลเอฟเฟกต์ของการ์ดประเภทเหล่านี้ของคู่แข่ง */
  | { do: 'battleImmune'; types: CardType[] }
  /** ในการต่อสู้นี้ สปิริตต้นเหตุ (ที่โจมตี) ไม่ถูกป้องกันโดยสปิริตของคู่แข่งที่มี BP ไม่เกินสปิริตนั้น */
  | { do: 'unblockableByBpAtMostSubject' }
  /** ถ้าเอฟเฟกต์นี้เสื่อมสภาพสปิริตคู่แข่งได้ตั้งแต่ n ตัว: ทำ steps */
  | { do: 'ifExhaustedAtLeast'; n: number; steps: Step[] }
  /** นำ Soul Core ในแทรชเรามาวางบนสปิริตนี้ เมื่อเป็นเช่นนั้น ทำ then */
  | { do: 'soulFromTrashToSelf'; then?: Step[] }
  /** เสื่อมสภาพสปิริต/อัลติเมทของคู่แข่งกี่ตัวก็ได้ คอสต์รวมไม่เกิน maxTotal */
  | { do: 'exhaustOpponentTotalCost'; maxTotal: number }
  /** (เบรฟที่ให้เอฟเฟกต์) สามารถนำเบรฟนี้ไปรวมร่างกับสปิริตของเราใบอื่นที่รวมร่างได้ */
  | { do: 'moveSourceBrave' }
  /** สามารถเลือกสปิริตของคู่แข่ง 1 ตัว: ตัวนั้นต้องโจมตีมาที่สปิริตนี้เป็นใบแรกสุดของสเต็ป ถ้าทำได้ */
  | { do: 'forceAttackChosen' }
  /** ในเทิร์นนี้ ไลฟ์เราไม่ได้รับความเสียหายจากการโจมตีของสปิริต/อัลติเมทคอสต์ตั้งแต่ minCost */
  | { do: 'lifeShieldThisTurn'; minCost: number }
  /** (engine ใช้ภายใน) Kagemusha: จดว่าการ์ดนี้ถูกอัญเชิญแล้ว เอฟเฟกต์ที่เล็งอยู่ต้องเล็งการ์ดนี้แทน */
  | { do: 'kageSet'; cardId: string }
  // ---------------- BS07
  /** (เมจิคไทป์เพลง) นำการ์ดเมจิคนี้ไปวางบนฟิลด์เรา แทนลงแทรช */
  | { do: 'placeThisSong' }
  /** นำการ์ดเมจิคไทป์ [เพลง] ในมือเรา 1 ใบไปวางบนฟิลด์เรา */
  | { do: 'songFromHand' }
  /** ทิ้งการ์ดเมจิคไทป์ [เพลง] บนฟิลด์เรา (opponent = ของคู่แข่ง) 1 ใบ */
  | { do: 'songToTrash'; opponent?: true }
  /** นำการ์ดเมจิคไทป์ [เพลง] จากแทรชหรือบนฟิลด์เรา 1 ใบกลับขึ้นมือ */
  | { do: 'songToHand' }
  /** My Unit: นำสปิริตเผ่า [ดีว่า] ที่ฟื้นสภาพของเรา count ตัวมาวางชิดสปิริตนี้ */
  | { do: 'myUnit'; count: number; /** (engine ใช้ภายใน) ที่เลือกแล้ว */ picked?: string[] }
  /** ทำลายสปิริตนี้ */
  | { do: 'destroySelf' }
  /** (engine ใช้ภายใน) On Stage: สปิริตกลับไปใต้สุดเด็ค (หรือเสื่อมสภาพแทน: รีเซ่-โดรมเวล) */
  | { do: 'onStageLeave'; cardId: string; keyword: boolean; /** (ตัดสินแล้ว) เสื่อมสภาพแทนกลับใต้เด็ค */ exhaust?: boolean }
  /** (engine ใช้ภายใน) ถ้าการ์ดนี้อยู่บนสนาม ทำ steps ("เมื่อเป็นเช่นนั้น" หลังอัญเชิญ) */
  | { do: 'ifOnField'; cardId: string; steps: Step[] }
  /** (engine ใช้ภายใน) เบิร์สของเราที่ถูกคู่แข่งทิ้ง ไม่สั่งใช้: ลงแทรช */
  | { do: 'trashOwnBurst' }
  /** (engine ใช้ภายใน) On Stage จบ: trigger "เมื่อสปิริตนี้/สปิริตของเรา On Stage" */
  | { do: 'onStageDone'; cardId: string; level: number; soul: boolean }
  /** แสดงใบบนสุดเด็ค count ใบ นำการ์ดที่ตรงตัวกรองแต่ละตัวอย่างละ 1 ใบขึ้นมือ ที่เหลือลงแทรช (picked: engine ใช้ภายใน) */
  | { do: 'revealPickEach'; count: number; filters: CardFilter[]; revealed?: string[]; index?: number }
  /** นำสปิริตคู่แข่งกี่ตัวก็ได้ BP รวมไม่เกิน maxTotal กลับขึ้นมือ / ทำลาย */
  | { do: 'opponentTotalBp'; maxTotal: number; action: 'bounce' | 'destroy'; used?: number }
  /** ในเทิร์นนี้ สปิริตนี้เจ็มสี color เพิ่ม count เม็ด */
  | { do: 'symbolThisTurn'; color: Color; count: number; per?: CountPer; /** มีผลจนจบการต่อสู้นั้น */ untilBattleEnd?: true }
  /** ทำให้เอฟเฟกต์ของการ์ดเมจิคต้นเหตุ (subject) ไร้ผล */
  | { do: 'negateSubjectMagic' }
  /** (มาคินะ) เลือกสปิริต/เบรฟบนสนาม 1 ตัว (ทั้งสองฝ่าย): เอฟเฟกต์ไร้ผล แล้วนำกลับไปไว้ใต้สุดเด็คเจ้าของ */
  | { do: 'returnSubjectToDeck' }
  /** ทำลายสปิริตของคู่แข่งที่ทำลายสปิริตต้นเหตุ (subject) */
  | { do: 'destroyDestroyer' }
  /** สามารถนำเบรฟบนฟิลด์เราไม่เกิน max ใบมารวมร่างกับสปิริตต้นเหตุ (subject) */
  | { do: 'braveFromField'; max: number }
  /** เอฟเฟกต์ของคู่แข่งทั้งหมดที่ทำงานบนสปิริต/อัลติเมทของเรา 1 ตัวไร้ผล */
  | { do: 'cleanseAlly' }
  /** จดว่าการ์ดนี้ใช้ "เทิร์นละ 1 ครั้ง" ชื่อนี้แล้ว (ดู onceFree) */
  | { do: 'markOnce'; key: string }
  /** ในเทิร์นนี้ สปิริตของเราที่ตรงตัวกรอง 1 ตัวป้องกันได้แม้อยู่ในรูปแบบเสื่อมสภาพ */
  | { do: 'blockExhaustedThisTurn'; filter: CardFilter; /** chosen = การ์ดที่เพิ่งเลือก (buffChosen) แทนการเลือกใหม่ */ target?: 'chosen' }
  /** ในเทิร์นนี้ การ์ดในมือ/นอกมือเราที่ตรงตัวกรองทั้งหมด คอสต์ +delta */
  | { do: 'handCostThisTurn'; filter: CardFilter; delta: number }
  /** ถ้าเงื่อนไขเป็นจริงทำ steps ไม่งั้นทำ else */
  | { do: 'when'; if: Condition; steps: Step[]; else?: Step[] }
  // ---------------- BS08
  /**
   * Showdown: เทียบ BP ของสปิริตนี้กับสปิริตของคู่แข่งที่คู่แข่งระบุเอง 1 ตัว ตัวที่ BP น้อยกว่าหรือเท่ากันถูกทำลาย
   * ทำลายเฉพาะสปิริตคู่แข่งได้ = ทำ then
   */
  | { do: 'showdown'; then: Step[]; /** (engine ใช้ภายใน) สปิริตคู่แข่งที่ถูกระบุ */ targetId?: string }
  /** ในเทิร์นนี้ คู่แข่งอัญเชิญการ์ดประเภทเหล่านี้ที่คอสต์ไม่เกิน maxCost ไม่ได้ */
  | { do: 'summonBanThisTurn'; maxCost: number; types: CardType[] }
  /** คู่แข่งเลือกทิ้งการ์ดบนมือจนเหลือ keep ใบ */
  | { do: 'opponentDiscardTo'; keep: number }
  /** สามารถนำการ์ดในแทรชเราที่ตรงตัวกรอง (มีเบิร์ส) 1 ใบไปเซ็ท */
  | { do: 'setBurstFromTrash'; filter: CardFilter }
  /** ในเทิร์นนี้ สปิริต/อัลติเมทของคู่แข่งทั้งหมดเสียเจ็มสีนี้ 1 เม็ด */
  | { do: 'opponentSymbolMinusThisTurn'; color: Color }
  /** ในเทิร์นนี้ สปิริตของเราที่ตรงตัวกรองทั้งหมดได้รับเจ็มสีนี้เพิ่ม count เม็ด (รวมตัวที่ลงทีหลัง) */
  | { do: 'symbolAlliesThisTurn'; filter: CardFilter; color: Color; count: number }
  /** ส่งคอร์ (ไม่ใช่โซลคอร์) 1 เม็ดบนฟิลด์หรือในแทรชเราไปวอยด์ (เลือก) */
  | { do: 'ownCoreToVoid'; /** (engine ใช้ภายใน) จากการ์ดนี้ */ fromId?: string }
  /** Soul Drive: นำโซลคอร์บนการ์ดนี้ออกจากเกม (ไปวอยด์) */
  | { do: 'soulToVoid' }
  /** คู่แข่งข้ามสเต็ปเหล่านี้ในเทิร์นถัดไปของคู่แข่ง */
  | { do: 'opponentSkipStepsNextTurn'; steps: ('refresh' | 'main')[] }
  /** ในการต่อสู้นี้ ถ้าสปิริตของเราที่มีโซลคอร์ (ผู้โจมตี) ถูกป้องกัน: ส่งคอร์ไลฟ์คู่แข่ง amount เม็ดลงรีเสิร์ฟ */
  | { do: 'battleLifeIfBlocked'; amount: number }
  /** ในเทิร์นนี้ ไลฟ์ของเราเสียหายได้ไม่เกิน 1 ต่อครั้ง */
  | { do: 'lifeCapOneThisTurn' }
  /** ฟื้นสภาพสปิริต/อัลติเมทของเราทั้งหมด (noAttack = ตัวที่ฟื้นสภาพโดยเอฟเฟกต์นี้โจมตีไม่ได้ในเทิร์นนี้) */
  | { do: 'refreshAllAllies'; noAttack?: true; /** เฉพาะตัวที่ตรงตัวกรอง (เช่น สปิริตเท่านั้น) */ filter?: CardFilter }
  /** ในเทิร์นนี้ เอฟเฟกต์ [เมื่อสปิริต/อัลติเมทนี้ป้องกัน] ทั้งหมดทำงานตอนโจมตีแทน */
  | { do: 'attackShiftThisTurn' }
  /** ทำลายการ์ดของทั้งสองฝ่ายที่ตรงตัวกรองทั้งหมด */
  | { do: 'destroyAllBoth'; filter: CardFilter }
  /** นำคอร์ (ไม่ใช่โซลคอร์) count เม็ดในแทรชเราไปรีเสิร์ฟ */
  | { do: 'trashCoreToReserve'; count: number }
  /** นำการ์ดนี้ (ในแทรช) กลับขึ้นมือ */
  | { do: 'selfFromTrashToHand' }
  /** สปิริตนี้ไม่เสื่อมสภาพ (กลับเป็นฟื้นสภาพ ไม่นับเป็นการฟื้นสภาพโดยเอฟเฟกต์) */
  | { do: 'unexhaustSelf' }
  /** ถ้าเอฟเฟกต์นี้นำการ์ดของคู่แข่งกลับขึ้นมือ/เด็คได้: ทำ steps */
  | { do: 'ifBounced'; steps: Step[] }
  /** (engine ใช้ภายใน) แคนดี้-ซาร์ด: ผู้โจมตีเลือกสู้กับผู้ป้องกัน 1 ตัว */
  | { do: 'chooseBattleBlocker' }
  // ---------------- BS09
  /** ทิ้งการ์ดในมือคู่แข่งแบบสุ่ม count ใบ */
  | { do: 'opponentRandomDiscard'; count: number; if?: Condition }
  /** คู่แข่งเลือกเสื่อมสภาพสปิริตของตัวเอง count ตัว (ที่ฟื้นสภาพอยู่) */
  | { do: 'opponentExhaustsOwn'; count: number; filter?: CardFilter }
  /** ส่งโซลคอร์บนสปิริต/อัลติเมทของเรา หรือในรีเสิร์ฟเรา (เลือก) ลงแทรชเรา */
  | { do: 'ownSoulToTrash' }
  /** ในเทิร์นนี้ คู่แข่งสั่งใช้เบิร์สไม่ได้ */
  | { do: 'opponentNoBurstThisTurn'; if?: Condition }
  /** ในเทิร์นนี้ คู่แข่งใช้งานการ์ดเมจิคไม่ได้ */
  | { do: 'opponentNoMagicThisTurn' }
  /** ดูเบิร์สคู่แข่ง: ถ้าตรงตัวกรอง ทิ้งเบิร์สนั้น */
  | { do: 'peekOpponentBurst'; filter: CardFilter }
  /** สามารถให้คู่แข่งทิ้งการ์ดในมือทั้งหมด เพื่อคู่แข่งจั่วการ์ด draw ใบ (ถามผู้ควบคุมเอฟเฟกต์) */
  | { do: 'opponentDiscardHandDraw'; draw: number }
  /** นำการ์ดชื่อเดียวกันไม่เกิน max ใบในแทรชคู่แข่งกลับไปไว้ใต้สุดเด็ค */
  | { do: 'opponentTrashSameNameToBottom'; max: number }
  /** ในเทิร์นนี้ สปิริต/อัลติเมทของเราที่ตรงตัวกรอง 1 ตัว (เลือก) ไม่รับผลเอฟเฟกต์ทั้งหมดของคู่แข่ง */
  | { do: 'immuneChosenThisTurn'; filter: CardFilter }
  /** ทำลายการ์ดของเรา 1 ใบที่ตรงตัวกรอง (เลือก) · then = ทำต่อเมื่อทำลายได้ */
  | { do: 'destroyOwn'; filter: CardFilter; then?: Step[] }
  /** ทำลายสปิริตของคู่แข่งที่คอสต์น้อยที่สุด 1 ตัว (เท่ากันหลายตัว = เลือก) */
  | { do: 'destroyLowestCostOpponent'; filter: CardFilter }
  /** ในเทิร์นนี้ ขณะสปิริตของเราที่ตรงตัวกรองโจมตีอยู่ เอฟเฟกต์ของคู่แข่งจบแอทแท็คสเต็ปไม่ได้ */
  | { do: 'noEndAttackStepThisTurn'; filter: CardFilter }
  /** ในการต่อสู้นี้ คู่แข่งต้องป้องกันด้วยสปิริต 2 ตัว หรืออัลติเมท 2 ตัว แล้วผู้โจมตีเลือกสู้ 1 ตัว */
  | { do: 'pairBlock' }
  /** อัญเชิญการ์ดในแทรชเรา 1 ใบที่ตรงตัวกรอง (สามารถ, จ่ายคอสต์) · then = ทำต่อเมื่ออัญเชิญสำเร็จ */
  | { do: 'summonFromTrashThen'; filter: CardFilter; then: Step[] }
  /** อัญเชิญไม่จ่ายคอสต์การ์ดในมือ/แทรชเราที่ตรงตัวกรองได้ไม่เกิน max ใบ */
  | { do: 'summonFreeHandOrTrash'; filter: CardFilter; max: number }
  /** (engine ใช้ภายใน) จินเบร์: จ่ายคอสต์เพิ่ม cost เพื่อสั่งใช้เบิร์ส แล้วทำ then (ไม่จ่าย = ไม่เปิด) */
  | { do: 'payBurstTax'; cost: number; then: Step[] };

/** ขอบเขตของ BP+ ถาวร */
export type StaticScope =
  | { self: true }
  /** สปิริตเผ่านี้ของเราทั้งหมด */
  | { ownFamily: string }
  /** สปิริตเราที่ชื่อมีคำใดคำหนึ่งนี้ทั้งหมด */
  | { ownNamed: string[] }
  /** สปิริตเราทั้งหมดที่ตรงเงื่อนไข (สี / เผ่า / มี Soul Core) */
  | { ownSpirits: { color?: Color; family?: string; soul?: true } }
  /** สปิริตเราทั้งหมดที่ตรงตัวกรอง (BS07: ทีม / Solo Part) */
  | { own: CardFilter }
  /** (เบรฟ granted) ผู้ร่วมร่าง และสปิริตเราทั้งหมดที่อยู่ทีมเดียวกันกับผู้ร่วมร่าง */
  | { sameTeam: true };

/**
 * เหตุการณ์ที่ trigger รอ
 * - attack / summon: สปิริตนี้โจมตี / ถูกอัญเชิญ
 * - soulEvolvedOnto: Soul Core ถูกนำมาวางบนสปิริตนี้โดย [Evolution]
 * - allyDepletedByEvolution: สปิริตอื่นของเราสูญสลายโดย [Evolution]
 * - blockKeyword: [True-Rage] หรือ [Consecutive Blade] ของสปิริตเราทำงาน
 * - block: สปิริตนี้ป้องกัน
 * - allyAttack: สปิริตเรา (รวมตัวนี้) ที่ตรง subject โจมตี
 * - attackHitLife: การโจมตีของสปิริตนี้ทำให้คู่แข่งเสียไลฟ์
 * - allyAttackHitLife: การโจมตีของสปิริตเรา (ตรง subject) ทำให้คู่แข่งเสียไลฟ์
 */
export type TriggerEvent =
  | 'attack'
  | 'summon'
  | 'soulEvolvedOnto'
  | 'allyDepletedByEvolution'
  | 'blockKeyword'
  | 'block'
  | 'allyAttack'
  | 'attackHitLife'
  | 'allyAttackHitLife'
  /** เราทิ้งเด็คคู่แข่งด้วยเอฟเฟกต์ (subject = สปิริตที่เป็นเจ้าของเอฟเฟกต์นั้น) */
  | 'oppDeckMilled'
  /** การ์ดนี้ถูกทำลายโดยคู่แข่ง (ต่อสู้หรือเอฟเฟกต์) */
  | 'destroyedByOpponent'
  /** การ์ดนี้ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (ไม่นับการต่อสู้) */
  | 'destroyedByOpponentEffect'
  /** การ์ดนี้ถูกทำลาย (โดยใครก็ได้) */
  | 'destroyed'
  /** สปิริตเรา (subject) ถูกทำลาย */
  | 'allyDestroyed'
  /** สปิริตเรา (subject) ถูกอัญเชิญ */
  | 'allySummoned'
  /** การ์ดนี้ถูกทิ้งจากเด็คโดยเอฟเฟกต์ของคู่แข่ง (การ์ดอยู่ในแทรชแล้ว) */
  | 'milledByOpponent'
  /** เราเสียไลฟ์ */
  | 'lifeLost'
  /** เราใช้การ์ดเมจิค (ทำงานหลังเอฟเฟกต์ของเมจิคนั้น) */
  | 'allyMagicUsed'
  /** สปิริตนี้ (ที่โจมตี) ถูกป้องกัน */
  | 'blocked'
  /** สปิริตเรา (subject) ที่โจมตีถูกป้องกัน */
  | 'allyBlocked'
  /** การ์ดของคู่แข่งถูกทำลายโดยการ์ดของเรา (subject = การ์ดของเราที่ทำลาย) */
  | 'oppDestroyed'
  /** การ์ดของเรา (subject) เสื่อมสภาพ (เอฟเฟกต์ / โจมตี / ป้องกัน) */
  | 'allyExhausted'
  /** การ์ดของคู่แข่ง (subject) เสื่อมสภาพ */
  | 'oppExhausted'
  /** เอนด์สเต็ปของคู่แข่ง */
  | 'oppEndStep'
  /** มือของคู่แข่งเพิ่มขึ้นโดยเอฟเฟกต์ (step opponentDiscards.perHandIncrease = ต่อจำนวนใบ) */
  | 'oppHandIncreased'
  /** เอนด์สเต็ปของเรา */
  | 'endStep'
  /** เริ่มแอทแท็คสเต็ปของคู่แข่ง */
  | 'oppAttackStepStart'
  /** เริ่มแอทแท็คสเต็ปของเรา */
  | 'ownAttackStepStart'
  /** คู่แข่งจั่วการ์ด */
  | 'oppDrew'
  /** เบิร์สของคู่แข่งถูกสั่งใช้ (ใช้กับ zone: 'hand') */
  | 'oppBurstActivated'
  /** การ์ดนี้สูญสลายโดยเอฟเฟกต์ของคู่แข่ง (ถูกถอดคอร์) */
  | 'depletedByOpponent'
  /** สปิริตนี้ (ที่โจมตี) ไม่ถูกป้องกัน */
  | 'unblocked'
  /** สปิริต/อัลติเมทของคู่แข่ง (subject) โจมตี */
  | 'oppAttack'
  /** สตาร์ทสเต็ปของเรา */
  | 'startStep'
  /** สปิริตนี้ On Stage (การ์ดกลับไปใต้เด็คแล้ว) */
  | 'onStage'
  /** สปิริตของเรา (subject = ตัวที่ On Stage) On Stage */
  | 'allyOnStage'
  /** สปิริตของเรา (subject) ป้องกัน */
  | 'allyBlock'
  /** คู่แข่งใช้งานการ์ดเมจิค (subject = เมจิคนั้น ทำงานก่อนเอฟเฟกต์ของเมจิค) */
  | 'oppMagicUse'
  /** สตาร์ทสเต็ปของคู่แข่ง */
  | 'oppStartStep'
  /** เมื่อเริ่มเมนสเต็ปของเรา */
  | 'ownMainStepStart'
  /** เบิร์สของเรา (subject) ถูกสั่งใช้ (ทำงานหลังเบิร์สนั้น) */
  | 'allyBurstActivated'
  /** Soul Core ถูกวางบนสปิริตของเรา (subject) โดย [Evolution] */
  | 'allySoulEvolvedOnto'
  /** การ์ดนี้ถูกทิ้งจากเด็คโดยเอฟเฟกต์ทิ้งเด็คของผู้เล่นคนใดก็ได้ (การ์ดอยู่ในแทรชแล้ว) */
  | 'milledAny'
  // ---------------- BS09
  /** สปิริต/อัลติเมทของเรา (subject) ชนะและทำลายสปิริตคู่แข่งจากการต่อสู้เทียบ BP */
  | 'allyWonBattle'
  /** สปิริตของเรา (subject) ถูกนำกลับขึ้นมือโดยเอฟเฟกต์ของคู่แข่ง */
  | 'allyBouncedByOpponent'
  /** (การ์ดในมือ) โซลคอร์ของคู่แข่งถูกนำไปวางที่แทรชของคู่แข่ง */
  | 'oppSoulToTrash';

/** เงื่อนไขของสปิริตที่ทำให้ trigger แบบ ally* ทำงาน */
export interface SubjectFilter {
  family?: string;
  /** มี Soul Core วางอยู่ */
  soul?: true;
  /** ชื่อการ์ดมีคำใดคำหนึ่งนี้ */
  nameIncludes?: string[];
  /** ต้นเหตุคือการ์ดนี้เอง */
  self?: true;
  /** เอฟเฟกต์ต้นเหตุเป็นเอฟเฟกต์ "เมื่อสปิริตนี้โจมตี" */
  attackEffect?: true;
  /** ต้นเหตุไม่ใช่การ์ดนี้ */
  other?: true;
  /** สีของสปิริตต้นเหตุ */
  color?: Color;
  /** ประเภทของการ์ดต้นเหตุ */
  types?: CardType[];
  /** allySummoned: จ่ายคอสต์อัญเชิญด้วย Soul Core */
  paidWithSoul?: true;
  /** oppDestroyed: ทำลายด้วยเอฟเฟกต์ (ไม่ใช่การต่อสู้) */
  byEffect?: true;
  /** allyDestroyed: ถูกทำลายโดยคู่แข่ง */
  byOpponent?: true;
  /** allySummoned: เป็นการอัญเชิญใบแรกสุดของเทิร์น (นับทุกการอัญเชิญ รวม Brave / ด้วยเอฟเฟกต์ · ไม่นับการวางเน็กซัส) */
  firstOfTurn?: true;
  /** allySummoned: อัญเชิญจากแทรช */
  fromTrash?: true;
  /** allyMagicUsed: ใช้จากในมือ (ไม่ใช่การ์ดที่วางแสดงนอกมือ) */
  fromHand?: true;
  /** คอสต์ที่พิมพ์บนการ์ดต้นเหตุตั้งแต่ค่านี้ */
  minCost?: number;
  /** อยู่ในเผ่าใดเผ่าหนึ่งเหล่านี้ */
  families?: string[];
  /** สปิริตต้นเหตุมี Holy Life (ของตัวเอง หรือได้รับจากการ์ดอื่น) */
  holyLife?: true;
  // ---------------- BS07
  /** อยู่ในทีมนี้ */
  team?: string;
  /** สปิริตต้นเหตุกำลังต่อสู้อยู่ */
  inBattle?: true;
  /** allyDestroyed: ถูกทำลายโดยสปิริต/อัลติเมทของคู่แข่ง (ต่อสู้ หรือเอฟเฟกต์ของสปิริต/อัลติเมท) */
  bySpirit?: true;
  /** allySummoned: ถูกอัญเชิญโดย On Stage */
  byOnStage?: true;
  /** การ์ดต้นเหตุตรงตัวกรอง (เช่น มี Solo Part) */
  card?: CardFilter;
  // ---------------- BS09
  /** allyDestroyed: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (ไม่นับการต่อสู้) */
  byOpponentEffect?: true;
}

/** เงื่อนไขเปิด Burst */
export type BurstEvent =
  | 'afterLifeLost'
  | 'afterAllyDestroyedByOpponent'
  /** หลังจากสปิริตเราสูญสลายโดยคู่แข่ง (กติกา 10: สูญสลายไม่ใช่การถูกทำลาย) — เบิร์สที่เขียน "ถูกทำลาย/สูญสลาย" ใส่ alsoDepleted */
  | 'afterAllyDepletedByOpponent'
  | 'afterOpponentHandIncreased'
  /** หลังจากสปิริต/อัลติเมทคู่แข่งโจมตี */
  | 'afterOpponentAttack'
  /** หลังจาก [เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ] ของคู่แข่งทำงาน (เลือกไม่ใช้ "สามารถ" = ไม่นับ: กติกา 06 Q7) */
  | 'afterOpponentSummonEffect';

export type Ability =
  /** เอฟเฟกต์ที่ทำงานเมื่อเกิดเหตุการณ์ (เฉพาะเลเวลที่ระบุ) */
  | {
      kind: 'trigger';
      source: number;
      /** หลายเหตุการณ์ = "เมื่อสปิริตนี้โจมตี/ป้องกัน" */
      on: TriggerEvent | TriggerEvent[];
      /** เหตุการณ์ ally*: สปิริตที่เป็นต้นเหตุต้องตรงเงื่อนไขนี้ */
      subject?: SubjectFilter;
      levels: number[];
      steps: Step[];
      /** "แอทแท็คสเต็ปของผู้เล่นทุกคน": ทำงานเฉพาะใน Attack Step (เทิร์นใครก็ได้) */
      attackStepOnly?: true;
      /** "...สเต็ปของเรา": ทำงานเฉพาะเทิร์นของเจ้าของ */
      ownTurnOnly?: true;
      /** "เทิร์นละ 1 ครั้ง" */
      oncePerTurn?: true;
      /** "เอฟเฟกต์นี้จะไม่แสดงผลซ้ำซ้อน": การ์ดชื่อเดียวกันหลายใบทำงานแค่ครั้งเดียวต่อเทิร์น */
      oncePerTurnByName?: true;
      /** การ์ดหลายใบเป็นต้นเหตุพร้อมกันในครั้งเดียว (เช่น อัญเชิญหลายตัวพร้อมกัน): ทำงานครั้งเดียว ไม่ใช่ใบละครั้ง */
      oncePerBatch?: true;
      /** oppDeckMilled: การ์ดที่ถูกทิ้งต้องมีอย่างน้อย 1 ใบตรงตัวกรองนี้ */
      milled?: CardFilter;
      /** ทำงานขณะการ์ดอยู่บนมือ / ในแทรช (ไม่ดูเลเวล) */
      zone?: 'hand' | 'trash';
      /** "เมนสเต็ป...": ทำงานเฉพาะ Main Step */
      mainStepOnly?: true;
      /** "...ของคู่แข่ง": ทำงานเฉพาะเทิร์นของคู่แข่ง */
      oppTurnOnly?: true;
      /** Brave: เอฟเฟกต์ที่ผู้ร่วมร่างได้รับ (ทำงานเมื่อผู้ร่วมร่างเกิดเหตุการณ์, "สปิริตนี้" = ผู้ร่วมร่าง) */
      granted?: true;
      /** blocked / allyBlocked: ผู้ป้องกันต้องตรงตัวกรองนี้ */
      blocker?: CardFilter;
      /** เงื่อนไขเพิ่ม (ตรวจตอนเกิด trigger) */
      if?: Condition;
    }
  /** "แอทแท็คสเต็ปของเรา: สปิริต/อัลติเมทคอสต์ไม่เกิน maxCost ของคู่แข่งทั้งหมด เอฟเฟกต์จะไม่ทำงาน" */
  | { kind: 'negateOpponentEffects'; source: number; levels: number[]; maxCost: number }
  /**
   * เมื่อสปิริตเราที่ตรง subject ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง: สามารถทิ้งใบบนสุดเด็คคู่แข่ง mill ใบ
   * เพื่อให้สปิริตนั้นอยู่บนสนามต่อในรูปแบบเสื่อมสภาพ
   */
  | {
      kind: 'replaceDestroy';
      source: number;
      levels: number[];
      /** การ์ดที่ถูกทำลายต้องตรงเงื่อนไขนี้ (self = การ์ดนี้เอง) */
      subject: SubjectFilter;
      /** จ่ายด้วยการทิ้งเด็คคู่แข่ง N ใบ */
      mill?: number;
      /** จ่ายด้วยการทิ้งใบบนสุดเด็คเรา N ใบ (ต้องทิ้งได้ครบ) */
      millSelf?: number;
      /** จ่ายด้วยการทิ้งการ์ดบนมือเรา 1 ใบที่ตรงตัวกรอง */
      discard?: CardFilter;
      /** สภาพที่อยู่ต่อ (ไม่ระบุ = เสื่อมสภาพ, same = สภาพเดิม) */
      state?: 'refresh' | 'exhausted' | 'same';
      /** ทำต่อหลังอยู่ต่อ (เช่น นำคอร์วอยด์วางไลฟ์) */
      then?: Step[];
      /** ใช้กับการถูกทำลายจากการต่อสู้ด้วย (ไม่ระบุ = เฉพาะเอฟเฟกต์ของคู่แข่ง) */
      battle?: true;
      /** ไม่ถาม: ทำงานเองเมื่อเงื่อนไขครบ */
      auto?: true;
      if?: Condition;
    }
  /** "ถ้าเรามี <name> อยู่, การลดคอสต์ทั้งหมดของการ์ดนี้ถือว่าลดจนครบแล้ว" */
  | { kind: 'fullReductionIfAlly'; source: number; name: string }
  /** "แอทแท็คสเต็ปของเรา: เมื่อสปิริตเราเผ่านี้โจมตี คู่แข่งป้องกันได้เฉพาะตัวที่คอสต์เท่ากับผู้โจมตี" */
  | { kind: 'blockSameCost'; source: number; levels: number[]; family: string; if?: Condition }
  /**
   * "ดรอว์สเต็ปของเรา: จำนวนจั่วการ์ด +N" แต่ละรายการใน extraDraw บวกเพิ่มถ้าเงื่อนไขเป็นจริง
   * after = สิ่งที่ทำหลังจั่ว (เช่น ทิ้งการ์ด)
   */
  | {
      kind: 'drawStep';
      source: number;
      levels: number[];
      extraDraw: { amount: number; if?: Condition }[];
      /** ทำก่อนจั่ว (เช่น ทิ้งการ์ดเพื่อเพิ่มจำนวนจั่ว: addDrawStepDraw) */
      before?: Step[];
      after?: Step[];
      /** "เอฟเฟกต์นี้ไม่แสดงผลซ้ำซ้อน": การ์ดชื่อเดียวกันหลายใบนับครั้งเดียว */
      noStack?: true;
    }
  /** เอฟเฟกต์ Burst: เมื่อเงื่อนไขเกิด เจ้าของเลือกเปิดได้ (ไม่เปิด = การ์ดยังเซ็ทอยู่) */
  | { kind: 'burst'; source: number; on: BurstEvent; steps: Step[]; soul?: true; /** "ถูกทำลาย/สูญสลายโดยคู่แข่ง": เปิดได้ตอนสูญสลายโดยคู่แข่งด้วย */ alsoDepleted?: true }
  /**
   * Flash [Quick]: อัญเชิญจากมือใน Flash timing โดยใช้ Core จากรีเสิร์ฟเท่านั้น
   * soul = [Soul Quick]: จ่ายคอสต์ทั้งหมดด้วย Soul Core ในรีเสิร์ฟ 1 ดวง (เฉพาะ Attack Step)
   */
  | { kind: 'quick'; source: number; soul?: true }
  /** แอทแท็คสเต็ปของเรา: เบิร์สของคู่แข่งไม่สามารถทำงาน */
  | { kind: 'blockOpponentBurst'; source: number; levels: number[]; if?: Condition; /** ทุกเทิร์น (ไม่จำกัดแอทแท็คสเต็ปของเรา) */ anyTurn?: true; /** Brave: ผู้ร่วมร่างได้รับ */ granted?: true }
  /** Flash [Evolution]: นำ Core บนสปิริตอื่นของเรากี่ดวงก็ได้มาวางบนสปิริตนี้ (ใช้ด้วย action evolve) */
  | { kind: 'evolution'; source: number; levels: number[] }
  /** BP+ ที่มีผลตลอดเวลาขณะการ์ดอยู่บนสนาม */
  | {
      kind: 'staticBp';
      source: number;
      levels: number[];
      if?: Condition;
      scope: StaticScope;
      amount: number;
      /** BP+ × จำนวนการ์ดเมจิคไทป์ [เพลง] บนฟิลด์เรา */
      perSongs?: true;
      /** BS09: BP+ × จำนวนการ์ดของเราที่ตรงตัวกรอง */
      perAllies?: CardFilter;
      /** เบรฟ: ผลที่ผู้ร่วมร่างได้รับ ("สปิริตนี้" = ผู้ร่วมร่าง) */
      granted?: true;
    }
  /** "ถ้า...สปิริตนี้เจ็มสี color เพิ่ม count เม็ด" */
  | {
      kind: 'extraSymbol';
      source: number;
      levels: number[];
      if?: Condition;
      color: Color;
      count: number;
      /** Brave: ผู้ร่วมร่างได้รับ */
      granted?: true;
      /** สปิริตของเราที่ตรงตัวกรองทั้งหมดได้รับ (แทนตัวการ์ดนี้) */
      allies?: CardFilter;
    }
  /** "เจ็มของสปิริตนี้ถือว่าเป็นเจ็มสี color ด้วย" */
  | { kind: 'symbolAlsoColor'; source: number; levels: number[]; color: Color }
  /** "เมื่ออัญเชิญการ์ดที่ชื่อมีคำ ... สปิริตนี้เจ็มสี color เพิ่ม count" (นับเฉพาะตอนจ่ายคอสต์การ์ดนั้น) */
  | { kind: 'summonSymbol'; source: number; levels: number[]; if?: Condition; nameIncludes?: string[]; /** การ์ดที่อัญเชิญตรงตัวกรอง (Spirit Soul: การ์ดอัลติเมท) */ filter?: CardFilter; color: Color; count: number }
  /** "การ์ดของคู่แข่งที่ตรงตัวกรองทั้งหมด Lv คอสต์ +amount" */
  | { kind: 'levelCostBoost'; source: number; levels: number[]; if?: Condition; filter: CardFilter; amount: number }
  /** "สปิริตของเราที่ตรงตัวกรองจะไม่ถูกถอดคอร์โดยคู่แข่ง" */
  | { kind: 'coreRemovalImmune'; source: number; levels: number[]; if?: Condition; filter: CardFilter }
  /**
   * ไม่รับผลเอฟเฟกต์ของคู่แข่ง (Ultra Shield ฯลฯ)
   *  - scope: self = การ์ดนี้ (granted = ผู้ร่วมร่าง) · ownFamily / ownNamed / ownColor = การ์ดของเรา · allNexus = เน็กซัสทุกใบบนสนาม
   *  - colors: สีของการ์ดต้นเหตุ (ไม่ระบุ = ทุกสี) · types: ประเภทของการ์ดต้นเหตุ (ไม่ระบุ = ทุกประเภท)
   */
  | {
      kind: 'effectImmune';
      source: number;
      levels: number[];
      if?: Condition;
      scope: 'self' | 'allNexus' | { ownFamily: string } | { ownNamed: string[] } | { ownColor: Color } | { own: CardFilter };
      colors?: Color[];
      types?: CardType[];
      oppTurnOnly?: true;
      granted?: true;
      /** ไม่รับผลเอฟเฟกต์ใด ๆ รวมของเราเอง ยกเว้นการ์ดที่ชื่อมีคำเหล่านี้ (ทาเคะนาชิ ฟอร์เทรส) */
      exceptNamed?: string[];
    }
  /** ป้องกันได้แม้อยู่ในรูปแบบเสื่อมสภาพ */
  | { kind: 'blockWhileExhausted'; source: number; levels: number[]; if?: Condition }
  /** "สปิริต/อัลติเมทของคู่แข่งทั้งหมดที่จะกลับขึ้นมือจะกลับไปไว้ใต้สุดเด็คแทน" */
  | { kind: 'bounceToBottom'; source: number; levels: number[]; if?: Condition; attackStepOnly?: true }
  /** "เน็กซัสทั้งหมดของคู่แข่งที่ไม่มีคำว่า ... ในชื่อจะสูญเสียเอฟเฟกต์ทั้งหมด" */
  | { kind: 'negateOpponentNexus'; source: number; levels: number[]; if?: Condition; unlessNamed: string[] }
  /** "แอทแท็คสเต็ปของเรา: การ์ดในมือเราที่ตรงตัวกรองทั้งหมดคอสต์ +delta" */
  | { kind: 'handCostDelta'; source: number; levels: number[]; filter: CardFilter; delta: number; ownAttackStepOnly?: true }
  /**
   * "แอทแท็คสเต็ปของคู่แข่ง: สปิริตของคู่แข่งที่ตรงตัวกรองทั้งหมด จะต้องโจมตีมาที่สปิริตนี้ ถ้าทำได้"
   * = คู่แข่งจบแอทแท็คสเต็ปไม่ได้ถ้าตัวที่ตรงยังโจมตีได้ · ตัวที่ตรงโจมตี → สปิริตนี้เข้าป้องกันเอง (ถ้าป้องกันได้)
   */
  | { kind: 'forceAttack'; source: number; levels: number[]; filter: CardFilter }
  /** "การ์ดนี้ในแทรช จะไม่รับผลเอฟเฟกต์อื่น ๆ" (ดึงกลับ / อัญเชิญ / ย้ายออกจากแทรชไม่ได้) */
  | { kind: 'trashImmune'; source: number }
  /** Dispersion: ระหว่างที่สปิริตนี้โจมตี/ป้องกัน เมจิคของเราที่เล็งเป้าสปิริต/อัลติเมทของคู่แข่ง 1 ตัว กลายเป็น count ตัว */
  | { kind: 'dispersion'; source: number; levels: number[]; count: number }
  /** "การ์ดในมือเราจะไม่รับผลเอฟเฟกต์ของคู่แข่ง" */
  | { kind: 'handImmune'; source: number; levels: number[]; if?: Condition }
  /** "แอทแท็คสเต็ปของเรา: ใช้ Quick โดยใช้คอร์จากการ์ดบนสนามของเราได้" */
  | { kind: 'quickAnyCores'; source: number; levels: number[]; if?: Condition }
  /** "เบิร์สของเราสั่งใช้ในเงื่อนไขเหล่านี้ได้ด้วย" */
  | { kind: 'burstAlsoOn'; source: number; levels: number[]; events: BurstEvent[] }
  /** "ถ้า...สปิริตนี้ถือว่าเป็น Lv สูงสุด" */
  | { kind: 'maxLevelIf'; source: number; levels: number[]; if: Condition }
  /** "การ์ดนี้ในแทรชเราถือว่ามีคอสต์ N" */
  | { kind: 'trashCost'; source: number; cost: number }
  /** (บนสนาม) "การ์ดที่ตรงตัวกรองในแทรชเราทั้งหมดจะถือว่ามีคอสต์ N" attackStepOnly = เฉพาะ Attack Step */
  | {
      kind: 'trashCostAll';
      source: number;
      levels: number[];
      filter: CardFilter;
      cost: number;
      attackStepOnly?: true;
      /** "เมนสเต็ปของเรา" */
      mainStepOnly?: true;
      /** การ์ดในมือแทนแทรช */
      zone?: 'hand' | 'trash';
    }
  /**
   * อัญเชิญการ์ดในแทรชเราได้ด้วย action summon (จ่ายคอสต์ตามคอสต์ในแทรช)
   *  - self: การ์ดใบนี้ในแทรช (ไม่ดูเลเวล) / ไม่ใส่ = การ์ดบนสนามอนุญาตให้การ์ดที่ตรง filter
   *  - timing: main = เมนสเต็ปของเรา, attackFlash = Flash ในแอทแท็คสเต็ปของผู้เล่นทุกคน
   *  - soulPayment: ต้องใช้ Soul Core ร่วมจ่ายคอสต์
   */
  | { kind: 'trashSummon'; source: number; levels: number[]; filter?: CardFilter; self?: true; timing: 'main' | 'attackFlash'; soulPayment?: true }
  /** "สปิริตนี้/การ์ดสปิริตนี้ถือว่ามีคำว่า ... ในชื่อการ์ดด้วย" */
  | { kind: 'nameAlias'; source: number; names: string[] }
  /**
   * เอฟเฟกต์ Flash ของการ์ดบนสนามที่ผู้เล่นกดใช้เอง (action activate)
   *  - timing attackFlash = Flash ในแอทแท็คสเต็ปของผู้เล่นทุกคน
   *  - if = ใช้ได้เมื่อเงื่อนไขเป็นจริง ("สามารถ X เพื่อ Y": ตรวจว่าทำได้ทั้งสองท่อน)
   *  - maxPerTurn = ใช้ได้เทิร์นละไม่เกิน N ครั้ง
   */
  | { kind: 'activated'; source: number; levels: number[]; timing: 'attackFlash'; label: string; steps: Step[]; if?: Condition; maxPerTurn?: number; /** Brave: ผู้ร่วมร่างได้รับ (เงื่อนไขดูที่ผู้ร่วมร่าง) */ granted?: true }
  /** "รีเฟรชสเต็ปของคู่แข่ง: การ์ดของคู่แข่งที่ตรงตัวกรองทั้งหมดจะฟื้นสภาพไม่ได้" */
  | { kind: 'opponentNoRefresh'; source: number; levels: number[]; filter: CardFilter }
  /** "ถ้า... การ์ดของเราที่ตรงตัวกรองบนสนามทั้งหมดคอสต์ +amount" */
  | { kind: 'costBoost'; source: number; levels: number[]; if?: Condition; filter: CardFilter; amount: number }
  /** เอฟเฟกต์ Magic: [Main] หรือ [Flash] (การ์ดสปิริตที่ "ถือว่าเป็นการ์ดเมจิคด้วย" ใช้จากมือได้เช่นกัน) */
  | {
      kind: 'magic';
      source: number;
      timing: 'main' | 'flash';
      steps: Step[];
      oncePerTurn?: true;
      /** เล็งหลายเป้าพร้อมกัน ("อย่างละ 1 ตัว" / "เลือก 1 ตัว. นอกจากนั้น เลือกอีก 1 ตัว"): กระจายด้วย Dispersion ไม่ได้ (กติกา 14 Dispersion ข้อ 11) */
      noDispersion?: true;
    }
  /** "การ์ดสปิริตนี้ ถือว่าเป็นการ์ดเมจิคด้วย" (ตัวกรอง types magic นับการ์ดนี้ด้วย) */
  | { kind: 'alsoMagic'; source: number }
  /** เบรฟนี้ไม่ถูกนับในจำนวนเบรฟที่รวมร่างได้ของสปิริตชื่อนี้ (ฮิเมะสึรุอิจิมอนจิ → ชิซุรุ) */
  | { kind: 'braveNotCounted'; source: number; hostName: string }
  /** สปิริตนี้โจมตีไม่ได้ */
  | { kind: 'cannotAttack'; source: number; levels: number[]; if?: Condition }
  /** การ์ดในมือเราที่ตรงตัวกรอง ถือว่าเป็นการ์ดเมจิคที่มีเอฟเฟกต์ [Flash] steps (attackStepOnly = แอทแท็คสเต็ปของผู้เล่นทุกคน) */
  | { kind: 'grantMagic'; source: number; levels: number[]; filter: CardFilter; timing: 'flash'; steps: Step[]; label: string; attackStepOnly?: true }
  /** เมนสเต็ปของผู้เล่นทุกคน: คอร์จากวอยด์ที่วางโดยเอฟเฟกต์ มาจากไลฟ์ของเจ้าของเอฟเฟกต์แทน (เสียไลฟ์นี้สั่งใช้เบิร์สไม่ได้) */
  | { kind: 'voidFromLife'; source: number; levels: number[] }
  /** เทิร์นของคู่แข่ง: ทำลายสปิริตสีที่ระบุทั้งหมดที่ฟื้นสภาพโดยเอฟเฟกต์ของสปิริต/อัลติเมท/เมจิค (ประตูปราสาทแห่งแคว้นบุปผาเหลือง) */
  | { kind: 'destroyRefreshedByEffect'; source: number; levels: number[]; colors: Color[] }
  /** Charge: [เอฟเฟกต์ BP-] ของเราที่ไม่ใช่ของอัลติเมท BP- เพิ่มขึ้น amount */
  | { kind: 'bpMinusBoost'; source: number; levels: number[]; amount: number; granted?: true }
  /** Charge: [เอฟเฟกต์ถอดคอร์] ลงรีเสิร์ฟของเราที่ไม่ใช่ของอัลติเมท ถอดคอร์เพิ่ม amount เม็ด */
  | { kind: 'coreRemovalBoost'; source: number; levels: number[]; amount: number; granted?: true }
  // ---------------- BS06
  /** Charge: [เอฟเฟกต์ฟื้นสภาพสปิริต] ของเรา จำนวนตัว +amount */
  | { kind: 'refreshCountBoost'; source: number; levels: number[]; amount: number; granted?: true }
  /** Charge: [เอฟเฟกต์เสื่อมสภาพคู่แข่ง] ของเรา จำนวนตัว +amount */
  | { kind: 'exhaustCountBoost'; source: number; levels: number[]; amount: number; granted?: true }
  /**
   * Kagemusha (การ์ดในมือ): เมื่อสปิริตของเราที่มี Soul Core ตกเป็นเป้าหมายเอฟเฟกต์ของคู่แข่ง
   * สามารถอัญเชิญการ์ดนี้ (จ่ายคอสต์) แล้วเอฟเฟกต์นั้นต้องเล็งการ์ดนี้แทน
   */
  | { kind: 'kagemusha'; source: number }
  /** Kagemusha ของเราทำงานได้แม้สปิริตเผ่านี้ที่ตกเป็นเป้าจะไม่มี Soul Core (ไทคูน) */
  | { kind: 'kagemushaNoSoul'; source: number; levels: number[]; families: string[] }
  /** อัญเชิญโดย Kagemusha: สามารถเสื่อมสภาพเน็กซัสนี้เพื่ออัญเชิญไม่จ่ายคอสต์ (อู่พิทักษ์สวรรค์) */
  | { kind: 'kagemushaFree'; source: number; levels: number[] }
  /** ถ้าเงื่อนไขจริง การ์ดสปิริตในมือเราที่ตรงตัวกรองได้รับ [Quick] (เกรย์ไนท์) */
  | { kind: 'grantQuick'; source: number; levels: number[]; filter: CardFilter; if?: Condition }
  /** เด็คของผู้เล่นทุกคนจะไม่ถูกทิ้ง */
  | { kind: 'noMill'; source: number; levels: number[] }
  /** ผู้เล่นทุกคน: จั่วการ์ดตั้งแต่ 2 ใบใน 1 ครั้งโดยเอฟเฟกต์ = การ์ดบนสนาม/ในมือทั้งหมดของฝ่ายนั้นไปใต้สุดเด็ค (คิชูด็อก) */
  | { kind: 'multiDrawPunish'; source: number; levels: number[] }
  /** คู่แข่งอัญเชิญการ์ดสปิริตคอสต์ดั้งเดิมไม่เกิน maxCost: ใช้สัญลักษณ์ลดคอสต์ไม่ได้ */
  | { kind: 'opponentNoReduction'; source: number; levels: number[]; maxCost: number }
  /** สปิริตนี้รวมร่างกับเบรฟได้ไม่เกิน count ใบ */
  | { kind: 'braveSlots'; source: number; levels: number[]; count: number; /** สปิริตของเราที่ตรงตัวกรองทั้งหมด (แทนตัวการ์ดนี้) */ allies?: CardFilter }
  /** ไลฟ์ของเราได้รับความเสียหายจากสปิริต/อัลติเมทของคู่แข่งได้เพียง 1 เม็ดต่อ 1 ตัวต่อเทิร์น */
  | { kind: 'lifeDamageCap'; source: number; levels: number[] }
  // ---------------- BS07
  /**
   * On Stage (แอทแท็คสเต็ปของเรา): สปิริตนี้กลับไปใต้เด็คแทนการโจมตี แล้วทำ steps (action onStage)
   * keyword = เป็น "On Stage" จริง (ปลุก trigger onStage/allyOnStage) · ไม่ใส่ = กลับใต้เด็คแทนการโจมตีเฉย ๆ (ลิลี่)
   * if = เงื่อนไขที่ต้องทำได้ ("เพื่อ" ท่อนหลังต้องทำได้)
   */
  | { kind: 'onStage'; source: number; levels: number[]; label: string; steps: Step[]; if?: Condition; keyword?: true }
  /** "เมื่อสปิริตของเราจะทำการ On Stage, สามารถเสื่อมสภาพสปิริตนั้น เพื่อถือว่ากลับใต้สุดเด็คแล้ว" (รีเซ่-โดรมเวล) */
  | { kind: 'onStageReplace'; source: number; levels: number[]; if?: Condition }
  /** การ์ดของเราที่ตรง scope ไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (soloPart = เป็นความสามารถ Solo Part) */
  | { kind: 'destroyImmune'; source: number; levels: number[]; if?: Condition; scope: { ownNamed: string[] } | { own: CardFilter }; soloPart?: true }
  /** "หลังจากจบแอทแท็คสเต็ปของเรา: เข้า [รีเฟรชสเต็ป] / [แอทแท็คสเต็ป] อีก 1 ครั้ง" once = ไม่เกินเทิร์นละ/เกมละ 1 ครั้ง */
  | { kind: 'extraSteps'; source: number; levels: number[]; if?: Condition; steps: ('refresh' | 'attack')[]; once: 'turn' | 'game' }
  /** "เมื่อ <attacker> ของเราโจมตี คู่แข่งป้องกันได้ด้วยสปิริต/อัลติเมทตั้งแต่ 1 ตัวที่ Lv รวมตั้งแต่ minLevel แล้วเราเลือกสู้ 1 ตัว" */
  | { kind: 'blockLevelSum'; source: number; levels: number[]; if?: Condition; attacker: CardFilter; minLevel: number }
  /** "แอทแท็คสเต็ปของเรา: <attacker> ของเราจะไม่ถูกป้องกันโดยสปิริต/อัลติเมทคอสต์ไม่เกิน maxCost ของคู่แข่ง" */
  | { kind: 'unblockableByCost'; source: number; levels: number[]; if?: Condition; attacker: CardFilter; maxCost: number }
  /** "การ์ดสปิริตนี้, เมื่อ..., จะถือว่ามีคอสต์ N" (ในมือ/นอกมือ) */
  | { kind: 'selfCostIf'; source: number; cost: number; if: Condition }
  /** "การ์ดนี้ที่เซ็ทอยู่ เมื่อถูกทิ้งโดยคู่แข่ง, สามารถสั่งใช้เบิร์สโดยไม่สนเงื่อนไขได้" */
  | { kind: 'burstOnDiscard'; source: number }
  // ---------------- BS08
  /** คอร์บนการ์ดของเราที่ตรงตัวกรองจะเหลือน้อยกว่า min เม็ดโดยคู่แข่งไม่ได้ */
  | { kind: 'coreFloor'; source: number; levels: number[]; if?: Condition; filter: CardFilter; min: number }
  /** แอทแท็คสเต็ปของคู่แข่ง: สปิริตนี้ป้องกันสปิริตที่ BP น้อยกว่าสปิริตนี้ไม่ได้ */
  | { kind: 'cannotBlockLowerBp'; source: number; levels: number[] }
  /** ขณะทำการ Showdown สปิริตนี้ BP+amount */
  | { kind: 'showdownBp'; source: number; levels: number[]; amount: number }
  /** สีของการ์ดนี้ถือว่าเป็นสีนี้ด้วย (ใช้คู่กับ symbolAlsoColor ถ้าเจ็มด้วย) */
  | { kind: 'colorAlso'; source: number; levels: number[]; color: Color }
  /** สปิริตของเราที่ตรงตัวกรองทั้งหมดได้รับ [Evolution] */
  | { kind: 'grantEvolution'; source: number; levels: number[]; filter: CardFilter }
  /** ผู้เล่นทุกคนนำคอร์จากวอยด์มาวางที่ไลฟ์ไม่ได้ */
  | { kind: 'noLifeFromVoid'; source: number; levels: number[] }
  // ---------------- BS09
  /** ถ้าเงื่อนไขจริง สปิริตนี้ได้รับเผ่านี้ */
  | { kind: 'familyAlso'; source: number; levels: number[]; if?: Condition; family: string }
  /** การ์ดของเราที่ตรงตัวกรอง ใช้โซลคอร์ร่วมจ่ายคอสต์อัญเชิญ เพื่ออัญเชิญโดยไม่สนเงื่อนไข (《เงื่อนไขอัญเชิญ》) ได้ */
  | { kind: 'ignoreSummonCondition'; source: number; levels: number[]; filter: CardFilter }
  /** [เอฟเฟกต์ทำลายคอสต์] (ทำลายคอสต์ไม่เกิน N) ของสปิริต/อัลติเมทของเราที่ตรงตัวกรอง ทำลายได้เพิ่ม +amount คอสต์ */
  | { kind: 'destroyCostBoost'; source: number; levels: number[]; if?: Condition; filter: CardFilter; amount: number }
  /** สปิริตของเราที่ตรงตัวกรองทั้งหมดถือว่าเป็น Lv สูงสุด (ownAttackStepOnly = แอทแท็คสเต็ปของเรา) */
  | { kind: 'maxLevelAllies'; source: number; levels: number[]; filter: CardFilter; ownAttackStepOnly?: true }
  /** การ์ดในแทรชของผู้เล่นทุกคนไม่รับผลเอฟเฟกต์อื่นและใช้เอฟเฟกต์ของการ์ดนั้นไม่ได้ (เมียวโอสยบมาร) */
  | { kind: 'trashLock'; source: number; levels: number[] }
  /** คู่แข่งนำการ์ดในแทรชกลับขึ้นมือไม่ได้ */
  | { kind: 'opponentNoTrashReturn'; source: number; levels: number[] }
  /** แอทแท็คสเต็ปของผู้เล่นทุกคน: สปิริต/อัลติเมทที่มีคอร์ 1 เม็ดโจมตี/ป้องกันไม่ได้ */
  | { kind: 'oneCoreNoBattle'; source: number; levels: number[] }
  /** แอทแท็คสเต็ปของคู่แข่ง: คู่แข่งโจมตีได้ต่อเมื่อส่งคอร์ cores เม็ดบนตัวที่สั่งโจมตีลงแทรช */
  | { kind: 'attackTax'; source: number; levels: number[]; cores: number }
  /** แอทแท็คสเต็ปของเรา: คู่แข่งจะใช้งานการ์ดเมจิค/สั่งใช้เบิร์สได้ต่อเมื่อจ่ายคอสต์เพิ่ม amount (จินเบร์) */
  | { kind: 'magicBurstTax'; source: number; levels: number[]; if?: Condition; amount: number };

/** สคริปต์ของการ์ดหนึ่งใบ เรียงตาม effects (null = ยังไม่รองรับ, array = บรรทัดเดียวมีหลายความสามารถ) */
export type CardScript = (DistributiveOmit<Ability, 'source'> | DistributiveOmit<Ability, 'source'>[] | null)[];

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/**
 * ผูกสคริปต์เข้ากับข้อมูลการ์ดตามชื่อ: ช่องที่ i ของสคริปต์ = effects[i]
 * โยน error ถ้าจำนวนช่องไม่ตรงกับจำนวนบรรทัดเอฟเฟกต์ (กันสคริปต์เลื่อนไปผิดบรรทัด)
 */
export function attachScripts<T extends { name: string; effects?: unknown[] }>(
  cards: readonly T[],
  scripts: Record<string, CardScript>,
): (T & { abilities: Ability[] })[] {
  return cards.map((card) => {
    const script = scripts[card.name] ?? [];
    const effectCount = card.effects?.length ?? 0;
    if (scripts[card.name] && script.length !== effectCount) {
      throw new Error(`สคริปต์ของ ${card.name} มี ${script.length} ช่อง แต่การ์ดมีเอฟเฟกต์ ${effectCount} บรรทัด`);
    }
    const abilities = script.flatMap((a, source) => (a ? (Array.isArray(a) ? a : [a]).map((x) => ({ ...x, source }) as Ability) : []));
    return { ...card, abilities };
  });
}
