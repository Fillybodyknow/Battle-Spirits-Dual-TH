/**
 * ภาษาสคริปต์เอฟเฟกต์การ์ด (ขั้นที่ 3)
 *
 * ข้อความเอฟเฟกต์ดิบอยู่ใน CardDef.effects ส่วนสคริปต์ที่ engine ประมวลผลได้อยู่ใน CardDef.abilities
 * แต่ละ ability อ้างกลับไปที่ข้อความด้วย `source` (index ใน effects)
 * ข้อความที่ยังไม่มีสคริปต์ = ยังไม่ทำงานใน engine
 */
import type { CardType, Color, SymbolColor } from './schema';

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
  | { handHas: CardFilter; /** BSC01: ตั้งแต่ N ใบ (ไม่ระบุ = 1) */ count?: number }
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
  /** BS26: อยู่ในเมนสเต็ป (เทิร์นใครก็ได้) */
  | { mainStep: true }
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
  /** BS17 จูเนียส: trigger อัญเชิญนี้เกิดจากการอัญเชิญโดย Summon Bolt */
  | { summonedBySummonBolt: true }
  /** BS17 ธงโจรสลัดมังกรสามหัว: การ์ดนี้ถูกทำลายจากการเทียบ BP ในการต่อสู้นี้ และมีการ์ด summonBoltOnBattleLoss ของเราที่มีผล */
  | { summonBoltAfterBattleLoss: true }
  /** สปิริตนี้ถูกนำไปวางชิดด้านข้างโดย My Unit ในการต่อสู้นี้ */
  | { inUnit: true }
  /** BSC04 ชุดซานต้า: การ์ดนี้ (ผู้ร่วมร่างสำหรับความสามารถที่เบรฟให้) มีเผ่านี้ที่พิมพ์บนการ์ด */
  | { selfFamily: string }
  /** สปิริต/อัลติเมทของเราที่ตรงตัวกรองอย่างน้อย count ตัว */
  | { alliesMatchAtLeast: { filter: CardFilter; count: number; /** BSC02: นับเฉพาะชื่อการ์ดที่ต่างกัน */ distinctNames?: true } }
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
  // ---------------- BS10
  /** มีเจ็มสีนี้บนฟิลด์เรา */
  | { ownGemColor: Color }
  /** การ์ดต้นเหตุ (subject) ของเอฟเฟกต์นี้ตรงตัวกรอง (ตรวจตอนประมวลผล) */
  | { subjectIs: CardFilter }
  /** BS26 ชิลด์แทงก์: ผู้โจมตีของการต่อสู้นี้ตรงตัวกรอง */
  | { battleAttacker: CardFilter }
  /** BS26 โปรคิวัน: การต่อสู้ตอนนี้มีอัลติเมทของคู่แข่งร่วมต่อสู้ */
  | { battleOpponentUltimate: true }
  /** BS26 เคทอส: ผู้ป้องกันของการต่อสู้นี้ตรงตัวกรอง */
  | { battleBlockedBy: CardFilter }
  /** BS26 จิเก็น / ไลโอดราส: เอฟเฟกต์นี้ทำลายการ์ดที่ตรงตัวกรองแล้ว */
  | { destroyedByThisMatch: CardFilter }
  /** BS26 นอร์แลนดี (trigger lifeLost): ไลฟ์ลดลงครั้งนี้ตั้งแต่ N เม็ด */
  | { lifeLostAtLeast: number }
  /** BS26 ลิงซ์โมเกอร์ (trigger ถูกทำลาย): ผู้ทำลายตรงตัวกรอง */
  | { destroyedBy: CardFilter }
  /** BS26 คอร์เดรน: เอฟเฟกต์นี้ทำให้การ์ดที่ตรงตัวกรองสูญสลาย */
  | { depletedByThis: CardFilter }
  /** BS26 แอมเบอร์ เลออน: เบรฟที่ร่วมร่างกับสปิริตของเราอยู่ตรงตัวกรองตั้งแต่ 1 ใบ */
  | { ownBraveHas: CardFilter }
  /** ในแทรชเรามีคอร์ที่ไม่ใช่โซลคอร์อย่างน้อย N เม็ด */
  | { trashCoreAtLeast: number }
  /** (trigger lifeLost) ไลฟ์ลดลงเพราะเอฟเฟกต์ของคู่แข่ง (ไม่ใช่การโจมตี) */
  | { lifeLostByOpponentEffect: true }
  // ---------------- BS11
  /** เจ็มทั้งหมดบนฟิลด์เราเป็นสีนี้เท่านั้น (มีอย่างน้อย 1 เม็ด) */
  | { onlyGemColor: Color }
  // ---------------- BS12
  /** เรามีเบิร์สเซ็ทอยู่ */
  | { ownBurstSet: true }
  /** กันดาละ-ไฮดรา (assaultTrashNexus) มีผลอยู่: Assault นำเน็กซัสในแทรชกลับขึ้นมือแทนการเสื่อมสภาพเน็กซัสได้ */
  | { assaultAlt: true }
  /** การ์ดนี้ใช้ "เทิร์นละไม่เกิน max ครั้ง" ชื่อนี้ไปน้อยกว่า max ครั้ง (นับจาก step markOnce) */
  | { usedFewerThan: { key: string; max: number } }
  // ---------------- BS14
  /** ระหว่างการต่อสู้ครั้งแรกในเทิร์นนี้ */
  | { firstBattleOfTurn: true }
  /** การ์ดที่เอฟเฟกต์นี้เพิ่งเลือก (revealPickRestTrash ฯลฯ) ตรงตัวกรอง (ตรวจใน holds ของ effects.ts ใช้ซ้อนใน all/not ไม่ได้) */
  | { chosenIs: CardFilter }
  /** BS16 Critical Hit: การ์ดที่ U Trigger ของเอฟเฟกต์นี้เพิ่งวางที่แทรชตรงตัวกรอง (ตรวจใน holds ของ effects.ts ใช้ซ้อนใน all/not ไม่ได้) */
  | { uTriggerCard: CardFilter }
  /** BSC03 Double Hit: Double U Trigger ของเอฟเฟกต์นี้ฮิตตั้งแต่ N ครั้ง */
  | { uTriggerHitsAtLeast: number }
  /** ยังไม่เคยใช้ "เกมละ 1 ครั้ง" ชื่อนี้ (ของผู้เล่นเจ้าของการ์ด) */
  | { oncePerGameFree: string }
  // ---------------- BS13
  /**
   * Rush (กติกา 14 Rush): มีเจ็มสี color บนฟิลด์เราอย่างน้อย count เม็ด
   * (เบรฟที่ให้ "Rush ไม่สนเงื่อนไข" กับผู้ร่วมร่าง = rushIgnore ทำให้เป็นจริงเสมอ)
   */
  | { rush: { color: Color; count: number } }
  /** "เมนสเต็ปของเรา" */
  | { ownMainStep: true }
  /** กลับเงื่อนไข */
  | { not: Condition }
  // ---------------- BS13 หกเทพพิสุทธิ์
  /** การ์ดในแทรชเราที่ตรงตัวกรองอย่างน้อย count ใบ */
  | { trashMatchAtLeast: { filter: CardFilter; count: number } }
  /** ในแทรชคู่แข่งมีการ์ดอย่างน้อย N ใบ */
  | { opponentTrashAtLeast: number }
  /** คอร์บนฟิลด์/รีเสิร์ฟ/แทรชของเรารวมกันอย่างน้อย N เม็ด (รวมโซลคอร์) */
  | { totalCoresAtLeast: number }
  /** เจ็มสี color บนฟิลด์เราอย่างน้อย count เม็ด (เหมือน rush แต่ไม่ใช่ Rush) */
  | { ownGemsAtLeast: { color: Color; count: number } };

/** "ต่อจำนวน ... N ตัว/ใบ": ตัวคูณของ step (ได้ 0 = ไม่ทำ) */
export interface CountPer {
  /** BSC04 แคธี่-เรม: จำนวนเจ็มสีนี้บนฟิลด์เรา */
  ownSymbols?: Color;
  /** สปิริต/อัลติเมทของเราที่ตรงตัวกรอง */
  allies?: CardFilter;
  /** BS09: นับ allies ของผู้เล่นทุกคน (ไม่ใช่เฉพาะของเรา) */
  anySide?: true;
  /** BS10: สปิริต/อัลติเมทของคู่แข่งที่ตรงตัวกรอง */
  opponents?: CardFilter;
  /** BS10: เลเวลของการ์ดนี้ */
  selfLevel?: true;
  /** BS10 บิรันบะ: จำนวนคอร์ที่คู่แข่งได้จากวอยด์ (trigger oppVoidGain) */
  voidGained?: true;
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
  /** BS11: จำนวนการ์ดที่มือคู่แข่งเพิ่มขึ้น (trigger oppHandIncreased) */
  handIncrease?: true;
  /** BS11: จำนวนสีเจ็มบนฟิลด์เรา (true = ทุกการ์ด / ตัวกรอง = เฉพาะสปิริตที่ตรง) */
  gemColors?: true | CardFilter;
  /** BS11: จำนวนการ์ดของคู่แข่งที่เอฟเฟกต์นี้นำกลับขึ้นมือ/เด็ค */
  bouncedByThis?: true;
  /** BS12 มิสึรุกิ: สปิริต/อัลติเมทของคู่แข่งที่ถูกทำลาย/สูญสลายโดยเอฟเฟกต์ของเบิร์สที่ Catalyze สั่งใช้ (catalyze.countKills · ใช้ใน then) */
  burstKills?: true;
  /** BS12 โดจิ ห้ามงคล: การ์ดที่ mill ล่าสุดของเอฟเฟกต์นี้ทิ้งไป ที่ตรงตัวกรอง */
  milledByThis?: CardFilter;
  /** BSC03 Double U Trigger: จำนวนครั้งที่ฮิต */
  uTriggerHits?: true;
  /** BS14 U Trigger: คอสต์ของการ์ดที่ถูกวางที่แทรช (ต่อคอสต์ 1) */
  uTriggerCost?: true;
  /** BS26 เบอร์แมน: ผลรวม BP ของการ์ดของเราที่ตรงตัวกรอง */
  bpSum?: CardFilter;
  /** BS26 เบรฟพิสเกส: จำนวนการ์ดที่ตรงตัวกรองที่เอฟเฟกต์นี้ทำให้สูญสลาย */
  depletedByThis?: CardFilter;
  /** BS26 ควีนไนท์แมร์: จำนวนการ์ดที่ returnAllFromTrash ของเอฟเฟกต์นี้นำขึ้นมือ */
  returnedByThis?: true;
  /** BS14: จำนวนเจ็มของสปิริตนี้ (รวมเจ็มที่ได้รับเพิ่ม) */
  selfSymbols?: true;
  /** BS14: จำนวนคอร์บนการ์ดนี้ (เน็กซัส "ต่อคอร์ 1 เม็ดบนเน็กซัสนี้") */
  selfCores?: true;
  /** BS14 ซัพเพรสชัน: จำนวนสปิริตที่ฟื้นสภาพโดยเอฟเฟกต์นี้ */
  refreshedByThis?: true;
  /** BSC02 ทริคสเตอร์: จำนวนการ์ดที่เอฟเฟกต์นี้นำไปวางแสดงนอกมือ (showFromHandAny) */
  shownByThis?: true;
  /** BSC02: สูงสุด N (หลังคูณ/หาร) */
  max?: number;
  /** หารด้วย (ต่อ 2 ตัว = 2) ไม่ระบุ = 1 */
  div?: number;
}

/** ตัวกรองการ์ด */
export interface CardFilter {
  /** BSC04 ไดอาน่า-เฟลอร์: ต่อสู้อยู่กับการ์ดของคู่แข่งประเภทนี้ */
  battlingTypes?: CardType[];
  /** BSC04 เน-รันเทล: BP ไม่เกินการ์ดนี้ (engine แปลงเป็น maxBp ก่อนทำ step) */
  maxBpSelf?: true;
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
  /** ชื่อการ์ดมีคำใดคำหนึ่งนี้ ("ที่มีคำว่า … ในชื่อการ์ด") */
  nameIncludes?: string[];
  /** ชื่อการ์ดตรงกับชื่อใดชื่อหนึ่งนี้ทั้งชื่อ (ข้อความอ้าง "ชื่อการ์ด" ตรง ๆ ไม่ได้เขียน "ในชื่อการ์ด") */
  names?: string[];
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
  /** BS26 พาร์ฟูม: ร่วมร่างกับเบรฟเผ่านี้อยู่ */
  braveFamily?: string;
  /** BS26 วาร์โกเบรฟ: คอสต์ (บนสนาม) เป็นค่าใดค่าหนึ่งในนี้ */
  costIn?: number[];
  /** BS26 อควาเรียส: ไม่มีคำเหล่านี้ในข้อความ */
  noTextIncludes?: string[];
  /** BS26 คริมสันแฟลร์: เจ็มรวมไม่เกิน N เม็ด */
  maxSymbols?: number;
  /** BS26 หุบเขาใหญ่ไกน่าร็อค: การ์ดที่มีเอฟเฟกต์ [ร่วมร่าง] */
  hasBravedEffect?: true;
  /** BS26 ไกเซอร์ดราก้อน: BP ต่ำกว่าผู้โจมตีของการต่อสู้นี้ */
  bpBelowAttacker?: true;
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
  /** BS10: ไม่ใช่สีใดเลยในสีเหล่านี้ */
  notColors?: Color[];
  /** BS13: มีสีตั้งแต่ N สีขึ้นไป (นับสีบนสนามรวม "ถือว่าเป็นสี...ด้วย") */
  minColors?: number;
  /** มีคอร์วางอยู่อย่างน้อย N เม็ด (เฉพาะบนสนาม) */
  minCores?: number;
  /** BS14: มีคอร์ที่ไม่ใช่โซลคอร์วางอยู่อย่างน้อย N เม็ด (เฉพาะบนสนาม) */
  minNormalCores?: number;
  // ---------------- BS11
  /** มีสปิริตอื่นของเจ้าของที่ตรงตัวกรองนี้และมีสีเดียวกันอย่างน้อย 1 สี (ตราแห่งเพลิงรบ) */
  sameColorAlly?: CardFilter;
  /** สัญลักษณ์ลดคอสต์มีอย่างน้อย N สี */
  minReductionColors?: number;
  /** มี Ultra Shield (ของตัวเอง หรือได้รับจากการ์ดอื่น) */
  hasUltraShield?: true;
  /** BS14: เป็นสปิริตร่วมร่าง (มีเบรฟร่วมร่างอยู่) */
  hasBraves?: true;
  /** BS14: เลเวลปัจจุบันไม่เกิน N (เฉพาะบนสนาม) */
  maxLevel?: number;
  /** BSC02: เลเวลปัจจุบันตั้งแต่ N (เฉพาะบนสนาม) */
  minLevel?: number;
  /** BSC02 ราเควล: ร่วมร่างกับเบรฟที่ชื่อมีคำเหล่านี้ */
  braveNamed?: string[];
  /** BSC02 ทริคสเตอร์: เฉพาะการ์ดที่วางแสดงนอกมือ (ใช้คู่กับ withShown) */
  shownOnly?: true;
  /** (engine ใช้ภายใน) เป็นการ์ดใบใดใบหนึ่งเหล่านี้ (Curse: ผู้ป้องกันตอนตัดสินผลการต่อสู้) */
  onlyIds?: string[];
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
  | { do: 'draw'; count: number; if?: Condition; /** (engine ใช้ภายใน) BS15 หอสมุดคัมภีร์: ถามจั่ว 2 เท่าแล้ว */ libAsked?: true; /** จำนวนใบ × จำนวนคอร์ไลฟ์ที่ลดลง (trigger lifeLost) */ perLifeLost?: true; per?: CountPer; }
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
  | {
      do: 'buffChosen';
      amount: number;
      /** เฉพาะสปิริตของเรา */
      ally?: true;
      filter?: CardFilter;
      /** หลังจากนั้น ถ้าสปิริตนั้นมี BP ตั้งแต่ค่านี้ ฟื้นสภาพสปิริตนั้น */
      refreshIfMinBp?: number;
      /** BSC02 งานขอบคุณแฟนคลับ: BP+ เท่ากับ BP ของสปิริตที่ exhaustOwn ก่อนหน้าในเอฟเฟกต์นี้เสื่อมสภาพ */
      amountFrom?: 'exhaustedBp';
      /** "ในการต่อสู้นี้" */
      untilBattleEnd?: true;
    }
  /** สปิริตต้นเหตุ (subject) BP+ ในเทิร์นนี้ */
  | { do: 'buffSubject'; amount: number; /** ไม่บอกระยะเวลา = จนจบการต่อสู้ */ untilBattleEnd?: true }
  /** [True-Rage]: คู่แข่งต้องป้องกันถ้าทำได้ (ใช้ระหว่างการต่อสู้) */
  | {
      do: 'mustBlock';
      if?: Condition;
      subject?: true;
      /** BS14 Rage / U Trigger ของอัลติเมทแดง: บังคับเฉพาะสปิริต (อัลติเมทไม่ต้องป้องกัน) */
      spiritsOnly?: true;
    }
  /** ทำลายการ์ดของคู่แข่งทั้งหมดที่ตรงตัวกรอง */
  | { do: 'destroyAllOpponent'; filter: CardFilter }
  /** แสดงใบบนสุดเด็ค N ใบ เลือก 1 ใบที่ตรงตัวกรองขึ้นมือ ที่เหลือลง Trash */
  | { do: 'revealPickRestTrash'; count: number; filter: CardFilter; /** BSC04 แคธี่-เรม: count × จำนวนนี้ */ per?: CountPer; /** การ์ดที่เหลือ: ลงแทรช (ค่าเริ่มต้น) / ใต้สุดเด็ค / บนสุดเด็ค เรียงลำดับได้ */ rest?: 'trash' | 'bottom' | 'top' }
  /** แสดงใบบนสุดเด็ค N ใบ นำการ์ดที่ตรงตัวกรองทั้งหมดขึ้นมือ ที่เหลือลงแทรช */
  | { do: 'revealTakeAll'; count: number; filter: CardFilter; /** ที่เหลือ: แทรช (ค่าเริ่มต้น) / ใต้สุดเด็คเรียงลำดับได้ */ rest?: 'trash' | 'bottom' | 'top'; /** BS26 มาริกะ: ที่เหลือ = อัญเชิญการ์ดที่ตรงตัวกรองได้ 1 ใบโดยไม่จ่ายคอสต์ แล้วไว้ใต้สุดเด็ค */ thenSummon?: CardFilter; /** BS11: ชื่อการ์ดละ 1 ใบ */ distinctNames?: true }
  /** นำการ์ดในแทรชเรา 1 ใบที่ตรงตัวกรอง กลับขึ้นมือ */
  | { do: 'returnFromTrash'; filter: CardFilter; if?: Condition; /** จำนวนใบ (ไม่ระบุ = 1) */ count?: number; per?: CountPer }
  /** เมื่อจบการต่อสู้นี้ จบ Attack Step */
  | { do: 'endAttackStepAfterBattle'; /** (engine ใช้ภายใน) ถามโฮเนะสุมิแล้ว */ checked?: true }
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
  | { do: 'opponentDiscards'; count: number; if?: Condition; /** BS15 เคลียร์เอดจ์: ทิ้งการ์ดที่วางแสดงนอกมือได้ด้วย */ withShown?: true; /** จำนวนใบ = จำนวนการ์ดที่มือคู่แข่งเพิ่มขึ้น (trigger oppHandIncreased) */ perHandIncrease?: true }
  /** ถ้าเอฟเฟกต์นี้ทำให้การ์ดที่มี Soul Core วางอยู่สูญสลาย: ทำ steps */
  | { do: 'ifDepletedSoul'; steps: Step[] }
  /** ส่งคอร์ในรีเสิร์ฟคู่แข่งทั้งหมดไปแทรชคู่แข่ง */
  | { do: 'opponentReserveToTrash' }
  /** ในการต่อสู้นี้ ถ้าสปิริตนี้ชนะและทำลายสปิริตคู่แข่งจากการเทียบ BP: สปิริตนี้ฟื้นสภาพ */
  | { do: 'refreshOnBattleWin'; if?: Condition; /** BS26 เรกิออส: เฉพาะเมื่อทำลายแต่อัลติเมทของคู่แข่ง */ ultimatesOnly?: true }
  /** ในการต่อสู้นี้ คู่แข่งป้องกันได้เฉพาะการ์ดที่ตรงตัวกรอง */
  | { do: 'restrictBlockers'; filter: CardFilter }
  /** ในการต่อสู้นี้ คู่แข่งใช้เอฟเฟกต์แฟลชไม่ได้ */
  | { do: 'battleNoFlash' }
  /** ในการต่อสู้นี้ คู่แข่งสั่งใช้เบิร์สไม่ได้ */
  | { do: 'battleNoBurst'; if?: Condition }
  /** ส่งคอร์ทั้งหมดบนเน็กซัสคู่แข่งทั้งหมดลงแทรชคู่แข่ง */
  | { do: 'opponentNexusCoresToTrash' }
  /** "ในเทิร์นนี้, เมื่อสปิริตของเราถูกทำลาย": ทำ steps (subject = สปิริตที่ถูกทำลาย) */
  | { do: 'turnTrigger'; /** turnEnd = "เมื่อจบเทิร์นนี้" (ทำในเอนด์สเต็ป) · allyUltExhausted = อัลติเมทของเราเสื่อมสภาพ (BS26) */ on: 'allyDestroyed' | 'turnEnd' | 'allyUltExhausted'; steps: Step[] }
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
      /** BS11 True-Consecutive Blade: เลือกได้ไม่เกิน N ตัว (ต่อสู้พร้อมกัน) */
      max?: number;
    }
  /** เราเลือกทิ้งการ์ดในมือ N ใบ */
  | { do: 'discard'; count: number; if?: Condition; filter?: CardFilter }
  /** นำ Core จากวอยด์ (Core ใหม่) วางที่ไลฟ์เรา */
  | { do: 'gainLifeFromVoid'; count: number; /** BS26 ซีคเวิร์ม โนวา: ไลฟ์มีได้สูงสุดเท่านี้ */ maxLife?: number }
  /** Burst: "หลังจากนั้นสามารถจ่ายคอสต์ เพื่อให้เอฟเฟกต์ [Flash] ของการ์ดนี้ทำงาน" (จ่ายหรือไม่ก็ได้) */
  | { do: 'payToUseFlash'; /** BS11: เอฟเฟกต์ [Main] ของการ์ดนี้แทน [Flash] */ main?: true }
  /** (engine ใช้ภายใน) เปิด Burst: นำการ์ดออกจากช่อง Burst และลง Trash เมื่อประมวลผลเสร็จ */
  | { do: 'openBurst' }
  /** สปิริตนี้ฟื้นสภาพ */
  | { do: 'refreshSelf'; if?: Condition }
  /** เลือกการ์ดของคู่แข่งที่ตรงตัวกรองแล้วทำลาย count ตัว (ไม่ระบุ = 1, ไม่มีให้เลือก = ข้าม) */
  | {
      do: 'destroyChosenOpponent';
      filter: CardFilter;
      count?: number;
      /** BS15 แบร์เซนทอร์: คอสต์ที่ทำลายได้ (maxCost) +amount ต่อจำนวนนี้ */
      costPlusPer?: { per: CountPer; amount: number };
      exclude?: string[];
      if?: Condition;
      /** BP ไม่เกิน: self = BP ปัจจุบันของสปิริตนี้, subjectLv1 = BP ที่ Lv1 ของสปิริตต้นเหตุ */
      bpFrom?: 'self' | 'subjectLv1' | /** BS12 เมาท์เทนเชพ: BP ของสปิริตที่เพิ่งเลือก (soulToAlly) */ 'chosen';
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
  /** BS26 ซิกเฟซุล: คู่แข่งเลือกการ์ดของตัวเอง 1 ใบกลับไปไว้ใต้สุดเด็ค */
  | { do: 'opponentBottomsOwn'; filter: CardFilter }
  /** BS26 เบรฟสกอร์เปียน: คู่แข่งเลือกทำลายการ์ดของตัวเองที่คอสต์ต่ำที่สุด (ตรงตัวกรอง) 1 ใบ */
  | { do: 'opponentDestroysOwnLowest'; filter: CardFilter }
  /** "ในเทิร์นนี้ สปิริตเราทั้งหมด (ที่ตรงตัวกรอง) BP+": มีผลทั้งเทิร์น รวมตัวที่ลงสนามทีหลัง */
  | { do: 'buffAllies'; amount: number; filter?: CardFilter }
  /** อัญเชิญการ์ดในแทรชเราไม่จ่ายคอสต์ (เลือก ไม่อัญเชิญก็ได้) */
  | {
      do: 'summonFromTrashFree';
      filter: CardFilter;
      /** BS14 ดีมอนส์พัพเพ็ต: เอฟเฟกต์ [เมื่อสปิริตนี้ถูกอัญเชิญ] ไม่ทำงาน */
      noTriggers?: true;
      /** BSC04 มิเรีย: คอสต์ต่ำกว่าการ์ดต้นเหตุ (subject: สปิริตที่ถูกทำลาย) */
      belowSubjectCost?: true;
      /** BSC04 ชูว: อัญเชิญได้ N ใบ (ไม่ระบุ = 1) */
      max?: number;
    }
  /** ทำลายสปิริต/อัลติเมทของคู่แข่งที่คอสต์สูงสุด 1 ตัว (คอสต์สูงสุดเท่ากันหลายตัว = เลือก) */
  | { do: 'destroyHighestCostOpponent'; filter: CardFilter }
  /** ทิ้งใบบนสุดเด็คคู่แข่ง N ใบ ('level' = เท่าเลเวลของสปิริตนี้: [Crush]) */
  | { do: 'mill'; count: number | 'level' | /** BS17 ออริฮาลคอน โกเล็ม (Crush ที่ให้): Lv ของ subject */ 'subjectLevel' }
  /** ถ้าการ์ดที่ถูกทิ้งด้วย mill ล่าสุดของเอฟเฟกต์นี้ ตรงตัวกรองอย่างน้อย 1 ใบ: ทำ steps */
  | { do: 'ifMilled'; filter: CardFilter; steps: Step[]; /** BS26: ไม่ตรง = ทำอันนี้ */ else?: Step[] }
  /** ทิ้งใบบนสุดเด็คคู่แข่ง 1 ใบ ต่อคอสต์รวมของการ์ดคู่แข่งที่ถูกทำลายโดยเอฟเฟกต์นี้ */
  | { do: 'millPerDestroyedCost' }
  /** ทิ้งเบิร์สที่เซ็ทอยู่ของคู่แข่ง */
  | { do: 'discardOpponentBurst' }
  /** BSC01 ทัวร์มาลีนดรากูน: นำเบิร์สของคู่แข่ง 1 ใบกลับขึ้นมือ (ไม่ใช่การทิ้ง) */
  | { do: 'bounceOpponentBurst' }
  /** สปิริตที่เป็นต้นเหตุของ trigger (เช่น สปิริตที่ทิ้งเด็ค) ฟื้นสภาพ */
  | { do: 'refreshSubject'; if?: Condition }
  /**
   * สามารถอัญเชิญการ์ดบนมือเรา 1 ใบที่ตรงตัวกรอง (จ่ายคอสต์ตามปกติ)
   * fullReductionIf = ถ้าเงื่อนไขเป็นจริง การลดคอสต์ทั้งหมดถือว่าลดจนครบแล้ว
   */
  | { do: 'summonFromHand'; filter: CardFilter; fullReductionIf?: Condition }
  /** (engine ใช้ภายใน) จ่ายคอสต์เพื่ออัญเชิญ cardId จากมือ */
  | { do: 'payForSummon'; cardId: string; cost: number; /** (engine ใช้ภายใน) รวมคอสต์เพิ่มของสิงโตควันม่วงแล้ว */ taxPaid?: true; /** (engine ใช้ภายใน) ถามทิ้งเด็คลดคอสต์แล้ว */ millAsked?: true }
  /** (engine ใช้ภายใน) ทำลายการ์ด (ไม่ถามเอฟเฟกต์แทนที่ซ้ำ) */
  | { do: 'destroyCard'; cardId: string; by: 'p1' | 'p2'; bySource?: string }
  /** (engine ใช้ภายใน) การ์ดอยู่บนสนามต่อในรูปแบบเสื่อมสภาพ */
  | { do: 'exhaustCard'; cardId: string }
  /** (engine ใช้ภายใน) ถือว่าถูกทำลายแล้ว แต่ยังอยู่บนสนาม (เอฟเฟกต์แทนที่) ในสภาพ state (ไม่ระบุ = เสื่อมสภาพ) */
  | { do: 'destroyedButStays'; cardId: string; by: 'p1' | 'p2'; bySource?: string; state?: 'refresh' | 'exhausted' }
  /** นำการ์ดทั้งหมดในแทรชเราไปไว้ใต้สุดเด็ค (เรียงลำดับได้) */
  | { do: 'trashToDeckBottom' }
  /** สามารถอัญเชิญไม่จ่ายคอสต์การ์ดบนมือเรา 1 ใบที่ตรงตัวกรอง */
  | { do: 'summonFromHandFree'; filter: CardFilter; if?: Condition; /** BS26 อิฟริต: ทำต่อเมื่ออัญเชิญสำเร็จ (อยู่บนสนามหรือร่วมร่างอยู่) */ then?: Step[]; /** BS17: อัญเชิญโดย Summon Bolt */ summonBolt?: true; /** อัญเชิญได้ไม่เกิน max ใบ (ไม่ระบุ = 1) */ max?: number; /** BS11 ริวเซ็น: สีละ 1 ใบ */ distinctColors?: true; /** BS12 ทรูธ-อีเด็น: เอฟเฟกต์ [เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ] ของการ์ดที่อัญเชิญจะไม่ทำงาน */ noTriggers?: true; /** BS15 อองเปอเรอร์: max × จำนวนนี้ */ per?: CountPer }
  /**
   * ในเทิร์นนี้ เลือกการ์ดของคู่แข่งที่ตรงตัวกรอง BP-amount แล้วทำลายตัวที่ BP กลายเป็น 0
   * count = จำนวนตัว (ไม่ระบุ = 1), countPerAllyFamily = จำนวนตัวเท่าสปิริตเราเผ่านี้
   */
  | {
      do: 'debuffChosenOpponent';
      amount: number;
      filter: CardFilter;
      /** BSC02 เวียร์จ: "ในการต่อสู้นี้" (ไม่ระบุ = ในเทิร์นนี้) */
      untilBattleEnd?: true;
      /** "ทำลายสปิริตที่กลายเป็น BP0 โดยเอฟเฟกต์นี้" (ไม่ระบุ = BP0 แล้วยังอยู่บนสนาม) */
      destroyAtZero?: true;
      /** "เสื่อมสภาพสปิริตที่กลายเป็น BP0 โดยเอฟเฟกต์นี้" */
      exhaustAtZero?: true;
      /** BS11 "เมื่อสปิริตนั้นกลายเป็น BP0 โดยเอฟเฟกต์นี้, ...และ...": ทำต่อเมื่อกลายเป็น BP0 (ไม่ขึ้นกับว่าทำลายได้หรือไม่) */
      zeroThen?: Step[];
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
  | { do: 'opponentCannotAttack'; types: CardType[]; if?: Condition; /** BSC01 เนเมียนไลอ้อน: เฉพาะตัวที่ตรงตัวกรอง (เช่น คอสต์ไม่เกิน 4) */ filter?: CardFilter }
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
      /** BS26 อีเกรต: ฟื้นสภาพไม่ได้ทุกทางจนถึงตอนเริ่มแอทแท็คสเต็ปครั้งถัดไปของเจ้าของ */
      lockUntilAttack?: true;
      /** (engine ใช้ภายใน) บวก Charge แล้ว */
      charged?: true;
      per?: CountPer;
      /** BS10 ชา-ซู: เลือกสปิริตของฝ่ายไหนก็ได้ (รวมของเรา) */
      anySide?: true;
    }
  /** เสื่อมสภาพสปิริตคู่แข่งกี่ตัวก็ได้ BP รวมไม่เกิน maxTotal */
  | { do: 'exhaustOpponentTotalBp'; maxTotal: number; /** (engine ใช้ภายใน) เลือกครบแล้ว ไม่ถามต่อ */ final?: true }
  /** นำการ์ดคู่แข่ง 1 ใบที่ตรงตัวกรองกลับขึ้นมือ (Core บนการ์ดไปรีเสิร์ฟของเจ้าของ) */
  | {
      do: 'bounceOpponent';
      filter: CardFilter;
      /** BS13 ดาร์คเนส-กริฟฟอน: ถ้าเงื่อนไขจริง คอร์บนการ์ดที่กลับขึ้นมือลงแทรชของเจ้าของแทนรีเสิร์ฟ */
      coresToTrashIf?: Condition;
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
  | {
      do: 'bounceAllOpponent';
      filter: CardFilter;
      if?: Condition;
      /** deckTop / deckBottom = กลับไปไว้บนสุด/ใต้สุดเด็คโดยเรียงลำดับได้ */
      to?: 'deckTop' | 'deckBottom';
      /** BS11: รวมเบิร์สที่เซ็ทอยู่ของคู่แข่งด้วย */
      withBurst?: true;
    }
  /** นำ Core จากวอยด์มาวาง */
  | { do: 'voidCore'; to: VoidTarget; count: number; filter?: CardFilter; if?: Condition; /** จำนวนเม็ด = จำนวนสปิริตของเรา */ countPerAlly?: true; per?: CountPer }
  /** ส่ง Soul Core บนสปิริตนี้ไปที่รีเสิร์ฟเรา */
  | { do: 'soulToReserve' }
  /**
   * แสดงใบบนสุดเด็ค N ใบ อัญเชิญไม่จ่ายคอสต์ใบที่ตรงตัวกรองได้สูงสุด max ใบ (null = กี่ใบก็ได้)
   * ที่เหลือไว้ใต้สุดเด็ค (เรียงลำดับได้)
   */
  | { do: 'revealSummon'; count: number; filter: CardFilter; max: number | null; /** ที่เหลือ: ใต้สุดเด็ค (ค่าเริ่มต้น) / ลงแทรช */ rest?: 'bottom' | 'trash'; /** BSC02 ฮาร์ดบีท: "เมื่อสปิริตนี้ถูกอัญเชิญ" ไม่ทำงาน */ noTriggers?: true }
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
      per?: CountPer;
    }
  /** เสื่อมสภาพสปิริต/อัลติเมทของคู่แข่งที่ตรงตัวกรองทั้งหมด */
  | { do: 'exhaustAllOpponent'; filter: CardFilter; if?: Condition; /** BSC01 ฮานะโนะแมนทิส: ของผู้เล่นทุกคน */ bothSides?: true }
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
      /** BS10 มุโดว: เลือกคอร์ในแทรชของคู่แข่งได้ด้วย */
      withTrash?: true;
      /** BS09 เฮล-สคัล: เลือกคอร์ในรีเสิร์ฟของคู่แข่งได้ด้วย */
      withReserve?: true;
      /** (engine ใช้ภายใน) ถามแบ่งจากรีเสิร์ฟ/แทรชแล้ว */
      pileAsked?: true;
      /** BS26 คิลเมดีส: ถ้าเป้าจะสูญสลาย ถามว่าจะนำกลับไปไว้บนสุดเด็คแทนลงแทรช */
      depletedToDeckTop?: true;
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
  | { do: 'coresOff'; cardId: string; n: number; to: 'reserve' | 'trash' | 'void'; byOpponent: boolean; soul?: boolean; /** BS26 คิลเมดีส: สูญสลายแล้วกลับไปไว้บนสุดเด็คแทนแทรช */ toDeckTop?: true }
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
  | { do: 'useMagicFromHandFree'; /** BS15 มิคาฟาร์: withShown = ใช้การ์ดที่วางแสดงนอกมือได้ด้วย */ filter?: CardFilter }
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
  | { do: 'summonFromTrash'; filter: CardFilter; repeat?: true; /** ถ้าเงื่อนไขจริง การลดคอสต์ถือว่าลดจนครบแล้ว */ fullReductionIf?: Condition }
  /** ส่งคอร์ไลฟ์คู่แข่ง N เม็ดไปที่รีเสิร์ฟคู่แข่ง */
  | { do: 'opponentLifeToReserve'; count: number; /** ส่งลงแทรชคู่แข่งแทนรีเสิร์ฟ · void = ไปวอยด์ (BS15 ไกเซอร์แอตลาส) */ to?: 'trash' | 'void'; /** BS12: count × จำนวนนี้ */ per?: CountPer }
  /** ส่ง Core บนสปิริตนี้ N ดวงลงแทรชเรา (เลือก Core ธรรมดาก่อน) */
  | { do: 'selfCoresToTrash'; count: number; /** ส่งไปรีเสิร์ฟเราแทนแทรช · BSC04 กาแล็กซี่เอ็กซ์โป: ไปวอยด์ */ to?: 'reserve' | 'void' }
  /** เมื่อจบการต่อสู้นี้ ทำ steps */
  | { do: 'atBattleEnd'; steps: Step[] }
  /** BS17 เบียคุ-กาโร: "เมื่อตัดสินผลการต่อสู้" (バトル解決時) = ทำ steps ก่อนเทียบ BP / ไลฟ์ลดของการต่อสู้นี้ */
  | { do: 'atBattleResolve'; steps: Step[] }
  /** BS17 ซาราตี: ในการต่อสู้นี้ เมื่อการโจมตีของการ์ดนี้ทำให้ไลฟ์คู่แข่งลดลง ทำ steps */
  | { do: 'onBattleHitLife'; steps: Step[]; /** BS26 สคูลด์: การ์ดต้นเหตุ (subject) แทนการ์ดนี้ */ target?: 'subject' }
  /** BS17 คู-ซี: ในการต่อสู้นี้ ผู้โจมตี (การ์ดนี้) ไม่ถูกป้องกันโดยสปิริต/อัลติเมทที่มี Lv ต่ำกว่าการ์ดนี้ */
  | { do: 'battleUnblockableLowerLevel' }
  /** BS17 เพนต้น / พาวเวอร์ดาวน์: ในเทิร์นนี้ เด็คของเราจะไม่ถูกทิ้ง */
  | { do: 'noMillThisTurn' }
  /** BS17 ออริฮาลคอน โกเล็ม Critical Hit: ในเทิร์นนี้ เมื่อเด็คคู่แข่งถูกทิ้งตั้งแต่ min ใบในครั้งเดียว ส่งคอร์จากไลฟ์คู่แข่ง 1 เม็ดไปรีเสิร์ฟ */
  | { do: 'bigMillLifeThisTurn'; min: number }
  /** BSC03 ทามาโมโนะอิน: ในเทิร์นนี้ การ์ดของเราที่ตรงตัวกรองทั้งหมด จะไม่ถูกป้องกันโดยอัลติเมทของคู่แข่ง */
  | { do: 'unblockableByUltimatesThisTurn'; filter: CardFilter }
  /** BS17 แรนดอมบอมบ์: ดูการ์ดในมือคู่แข่ง 1 ใบ (เลือกคว่ำหน้า) แล้วทำลายการ์ดคู่แข่งที่ตรงตัวกรองที่มีคอสต์ไม่เกินคอสต์ของการ์ดนั้น 1 ตัว */
  | { do: 'peekOneHandDestroy'; filter: CardFilter }
  /** BS17 ออร์แกนปีกทองคำ: นำใบบนสุดเด็คเรา ไม่เกิน max ใบ ไปวางคว่ำใต้การ์ดนี้ (n: engine ใช้ภายใน = จำนวนที่เลือก) */
  | { do: 'deckToUnder'; max: number; n?: number }
  /** (engine ใช้ภายใน) ออร์แกนปีกทองคำ: ทิ้งการ์ดใต้เน็กซัส 1 ใบ เพื่อให้การ์ดที่ U Trigger วางที่แทรชถือว่าคอสต์ +amount */
  | { do: 'underBoost'; nexusId: string; amount: number; source: number }
  /** นำสปิริตนี้กลับขึ้นมือ ถ้าสำเร็จทำ then */
  | { do: 'returnSelfToHand'; then?: Step[] }
  /** สามารถนำการ์ดที่มีเอฟเฟกต์ Burst บนมือเรา 1 ใบไปเซ็ทได้ */
  /**
   * เซ็ทการ์ดที่มีเอฟเฟกต์เบิร์ส "ในมือ" (ไม่รวมการ์ดนอกมือ กติกา 06 Q5)
   * then = ทำต่อเฉพาะเมื่อเซ็ทจริง ("สามารถ X เพื่อ Y": มี then = ต้องเลือก 1 ใบ ไม่มีปุ่มไม่เลือก เพราะเลือกใช้มาแล้วจาก may)
   */
  | { do: 'setBurstFromHand'; then?: Step[]; /** "ในมือ/นอกมือ" */ withShown?: true }
  /** [Catalyze]: สั่งใช้ Soul Burst สีนี้ของเราที่เซ็ทอยู่ (ไม่ต้องรอเงื่อนไข) */
  | { do: 'catalyze'; /** BSC03 บาเซล: เบิร์สใดก็ได้ (ไม่ต้องเป็นโซลเบิร์ส) */ anyBurst?: true; /** ไม่ระบุ = ทุกสี */ color?: Color; /** BS10: สีใดสีหนึ่งในนี้ */ colors?: Color[]; /** BS10 มิโคโตะ: เอฟเฟกต์เลือกเป้า 1 ตัวของเบิร์สนั้น = ทั้งหมดแทน */ allTargets?: true; /** "หลังจากเบิร์สนั้นถูกสั่งใช้": ทำต่อหลังเบิร์สทำงานจบ (subject = เบิร์สนั้น) */ then?: Step[]; /** BS11 สุโอว: เบิร์สที่ชื่อมีคำเหล่านี้ ไลฟ์เราถือว่าเป็น life */ lifeAs?: { names: string[]; life: number }; /** BS12 มิสึรุกิ: นับสปิริตของคู่แข่งที่เบิร์สนั้นทำลาย/ทำให้สูญสลาย ให้ then ใช้ (CountPer burstKills) */ countKills?: true; /** (ภายใน) 2VS2: ใช้เบิร์สของที่นั่งนี้ในทีม (เราเลือกใช้เบิร์สของเพื่อนได้) */ burstSeat?: 0 | 1 }
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
      /** (engine ใช้ภายใน) Bunshin: วางเป็นสปิริตร่างแยก (คอร์จากรีเสิร์ฟ ไม่ใช่การอัญเชิญ) */
      clone?: true;
      /** (engine ใช้ภายใน) จ่ายคอสต์เพิ่มของสิงโตควันม่วงแล้ว */
      taxPaid?: true;
      /** (engine ใช้ภายใน) ถามทิ้งเด็คลดคอสต์ (สิงโตควันม่วง) แล้ว */
      millAsked?: true;
      /** เอฟเฟกต์ [เมื่อสปิริตนี้ถูกอัญเชิญ] ของการ์ดนี้ไม่ทำงาน */
      noTriggers?: true;
      /** (engine ใช้ภายใน) BS15 ดังกาโร: ถามแล้วว่าจะใช้คอร์จากวอยด์ไหม / วางคอร์จากวอยด์ 1 เม็ดแทนรีเสิร์ฟ */
      voidAsked?: true;
      fromVoid?: true;
    }
  /** (engine ใช้ภายใน) Brave ที่อัญเชิญด้วยเอฟเฟกต์: เลือกสปิริตที่จะร่วมร่าง หรือไม่เลือก = ลงเป็นสปิริต */
  | { do: 'braveOrSpirit'; cardId: string; /** BSC04 ไดอาน่า-เฟลอร์ X: ลงเป็นสปิริตไม่ได้ (ต้องร่วมร่าง) */ noSpirit?: true }
  /** (engine ใช้ภายใน) เบรฟที่ผู้ร่วมร่างออกจากสนาม: เลือกให้อยู่ต่อหรือลง Trash */
  /** (ภายใน engine) ร่างต้นออกจากสนาม: เบรฟจะคงอยู่ไหม · รีเสิร์ฟไม่พอ Lv1 = ลงแทรชเลย ไม่ถาม (กติกา 04 ข้อ 2) */
  | { do: 'braveFate'; cardId: string; state: 'refresh' | 'exhausted'; continuesAttackOf?: string }
  /** (ภายใน) 2VS2: step ถัดไปทำกับโซนส่วนตัวของคู่แข่งที่นั่งนี้ (null = จบ) · กติกา 15 ข้อ 8 */
  | { do: 'oppSeat'; seat: 0 | 1 | null }
  /** (ภายใน) 2VS2: step ถัดไปทำในฐานะที่นั่งนี้ของทีมเรา (เจ้าของเอฟเฟกต์เลือกให้เพื่อนจั่ว) · null = กลับเป็นที่นั่งเดิม */
  | { do: 'selfSeat'; seat: 0 | 1 | null }
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
  | { do: 'disableChosenOpponent'; filter: CardFilter; count?: number; countPerAllyFamily?: string; if?: Condition; dispersed?: true; per?: CountPer; /** BS15 คานาบูน: ป้องกันไม่ได้อย่างเดียว (ยังโจมตีได้) */ blockOnly?: true }
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
  | { do: 'blockTax'; /** BS26 มุคุโระ: การ์ดที่ทิ้ง (discard) ต้องตรงตัวกรอง */ discardFilter?: CardFilter; /** BS26 ควีนไนท์แมร์: ส่งคอร์ไลฟ์ N เม็ดไปรีเสิร์ฟ (เปิดเบิร์สไม่ได้) */ lifeToReserve?: number; /** BS26: ภาษีเฉพาะการป้องกันด้วยอัลติเมท */ ultimatesOnly?: true; reserveToTrash: number; /** ทิ้งการ์ดบนมือแทน (อาคิตะ-ด็อก) */ discard?: number; /** BSC02 มิเรีย: ส่งคอร์บนฟิลด์ของตัวเอง (สนาม/รีเสิร์ฟ) N เม็ดไปแทรช */ fieldToTrash?: number }
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
  | { do: 'exhaustOpponentTotalCost'; maxTotal: number; /** (engine ใช้ภายใน) เลือกครบแล้ว ไม่ถามต่อ */ final?: true }
  /** (เบรฟที่ให้เอฟเฟกต์) สามารถนำเบรฟนี้ไปรวมร่างกับสปิริตของเราใบอื่นที่รวมร่างได้ */
  | { do: 'moveSourceBrave' }
  /** สามารถเลือกสปิริตของคู่แข่ง 1 ตัว: ตัวนั้นต้องโจมตีมาที่สปิริตนี้เป็นใบแรกสุดของสเต็ป ถ้าทำได้ */
  | { do: 'forceAttackChosen'; /** BS16 ซันสโตน ดรากูน: "สปิริตนั้นต้องโจมตีถ้าทำได้" (ไม่ต้องโจมตีมาที่สปิริตนี้) */ noHolder?: true }
  /** ในเทิร์นนี้ ไลฟ์เราไม่ได้รับความเสียหายจากการโจมตีของสปิริต/อัลติเมทคอสต์ตั้งแต่ minCost */
  | { do: 'lifeShieldThisTurn'; /** BS26 แอนตี้เบรฟแบริเออร์: เฉพาะสปิริตร่วมร่าง */ braved?: true; minCost?: number; /** BSC01 เบิร์สต์แบริเออร์: การโจมตีของสปิริตคอสต์ไม่เกิน N (อัลติเมทไม่นับ) */ maxCost?: number; spiritsOnly?: true }
  /** (engine ใช้ภายใน) Kagemusha: จดว่าการ์ดนี้ถูกอัญเชิญแล้ว เอฟเฟกต์ที่เล็งอยู่ต้องเล็งการ์ดนี้แทน */
  | { do: 'kageSet'; cardId: string }
  // ---------------- BS07
  /** (เมจิคไทป์เพลง) นำการ์ดเมจิคนี้ไปวางบนฟิลด์เรา แทนลงแทรช */
  | { do: 'placeThisSong' }
  /** นำการ์ดเมจิคไทป์ [เพลง] ในมือเรา 1 ใบไปวางบนฟิลด์เรา */
  | { do: 'songFromHand' }
  /** ทิ้งการ์ดเมจิคไทป์ [เพลง] บนฟิลด์เรา (opponent = ของคู่แข่ง) 1 ใบ */
  | { do: 'songToTrash'; opponent?: true }
  /** BSC04 เซน่า-ริวมิน: นำคอร์ทั้งหมดในแทรชเราไปวางบนสปิริตของเราได้ตามใจชอบ (left: engine ใช้ภายใน) */
  | { do: 'trashCoresSpread'; left?: number; /** BS26 ริวแมน แฟนตาซิสต้า: วางได้เฉพาะการ์ดของเราที่ตรงตัวกรอง */ filter?: CardFilter }
  /** BSC04 คอสตูมเชนจ์: แยกเบรฟ 1 ใบออกจากสปิริตร่วมร่างของเรา 1 ตัว (เบรฟอยู่ต่อเป็นสปิริต/ลงแทรชตามกติกา 04) */
  | { do: 'separateOwnBrave' }
  /** BSC04 ไดอาน่า-เฟลอร์: นำการ์ดนี้กลับไปไว้ใต้สุดเด็ค */
  | { do: 'selfToDeckBottom' }
  /** (engine ใช้ภายใน) แยกเบรฟใบนี้ */
  | { do: 'separateBraveId'; braveId: string }
  /** BSC04 ดีว่าซิมโฟนี: แยกเบรฟทั้งหมดออกจากสปิริต/อัลติเมทร่วมร่างของคู่แข่ง 1 ตัว (คู่แข่งจัดคอร์เอง) */
  | { do: 'separateOpponentBraves' }
  /** BSC04 คอสตูมเชนจ์: สามารถอัญเชิญไม่จ่ายคอสต์การ์ดเบรฟในมือเรา (filter) ร่วมร่างกับสปิริตของเรา (host) โดยตรง (braveId: engine ใช้ภายใน) */
  | { do: 'braveFromHandOnto'; filter: CardFilter; host: CardFilter; braveId?: string }
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
  /** (engine ใช้ภายใน) BS26 Trigger Counter: ถามเจ้าของเด็คที่ U Trigger ฮิต / ใช้การ์ดที่เลือก / จ่ายคอสต์เมจิค */
  | { do: 'triggerCounterAsk' }
  /** (engine ใช้ภายใน) BS26: ผลฮิตของ U Trigger (guarded = Trigger Counter ทำให้เป็น Guard แล้ว: ไม่ทำผลฮิต) */
  | { do: 'uTriggerHitGate'; steps: Step[]; guarded?: true; /** BS26 อิลลูชันมิเรอร์: "คู่แข่ง" ในผลฮิตเปลี่ยนเป็น "เรา" */ mirrored?: true }
  /** BS26 อิลลูชันมิเรอร์ (Trigger Counter): ผลฮิตที่รออยู่ "คู่แข่ง" → "เรา" (ของเจ้าของอัลติเมท) */
  | { do: 'mirrorUTriggerHit' }
  /** (engine ใช้ภายใน) จบช่วงที่สลับ "คู่แข่ง" เป็น "เรา" */
  | { do: 'mirrorEnd' }
  /** (engine ใช้ภายใน) BS26 เนินโซลูจ: ถามเจ้าของการ์ดที่กำลังจะสูญสลาย / ผลของแต่ละตัวเลือก */
  | { do: 'askDepletionSave'; cardId: string; level: number; hadSoul: boolean; srcId: string; source: number }
  | { do: 'depletionLifeSave'; cardId: string; srcId: string; source: number }
  | { do: 'depleteHeld'; cardId: string; level: number; hadSoul: boolean }
  /** BS26 เคทอส: ถือว่าไม่ถูกป้องกัน (ไม่เทียบ BP) */
  | { do: 'treatAsUnblocked' }
  /** BS26 เบรฟอาร์โก: Summon Bolt ของผู้ร่วมร่างทำงานโดยไม่ทำลายสปิริตนี้ (ใช้ step อัญเชิญจาก Summon Bolt ของผู้ร่วมร่าง) */
  | { do: 'summonBoltNoDestroy' }
  /** BS26 เอ็ดเวิร์ด: ในเทิร์นนี้ คู่แข่งใช้การ์ดในมือที่มีสีเดียวกับการ์ดที่เอฟเฟกต์นี้เพิ่งทิ้งจากเด็คคู่แข่งไม่ได้ */
  | { do: 'opponentHandColorBanMilled' }
  /** BS26 อิมแพคโรอาร์: ทำลายอัลติเมทของคู่แข่งที่กำลังต่อสู้ ถ้าคอสต์ไม่เกิน (คอสต์ของการ์ดที่ U Trigger ฮิต + plus) */
  | { do: 'destroyBattlingUltByHitCost'; plus: number }
  /** BS26 เชนจ์ลิง: ในการต่อสู้นี้ ฝั่งเราเทียบ BP ด้วยอัลติเมทของเราที่เลือกแทน */
  | { do: 'battleBpSubstitute' }
  /** BS26 วาร์โกเบรฟ: ส่งคอร์บนสปิริตของเรา 1 เม็ดไปแทรชของเรา */
  | { do: 'ownSpiritCoreToTrash' }
  /** BS26 ฟ็อกซ์สตาร์ / ไฮเพรสเชอร์ (Trigger Counter): ถ้าการ์ดที่ฮิตตรงตัวกรอง = ถือว่า Guard */
  | { do: 'guardUTriggerIf'; filter: CardFilter }
  /** BS26 ไฮเพรสเชอร์: การ์ดคู่แข่งที่ตรงตัวกรอง 1 ใบ ฟื้นสภาพไม่ได้ทุกทางจนถึงตอนเริ่มแอทแท็คสเต็ปครั้งถัดไปของเจ้าของ */
  | { do: 'lockRefreshOpponent'; filter: CardFilter }
  /** BS26 อีเกรต: ในการต่อสู้นี้ [เอฟเฟกต์เสื่อมสภาพคู่แข่ง] ของการ์ดนี้เลือกอัลติเมทได้ */
  | { do: 'exhaustUltimateBattle' }
  /** BS26 บอเรียสวูล์ฟ: ดูใบบนสุดเด็คคู่แข่ง */
  | { do: 'peekOpponentDeckTop' }
  /** BS26 ทุ่งหญ้าอัลบา: เปิดใบบนสุดเด็ค ถ้าเป็นการ์ดสปิริต/เบรฟคอสต์ต่ำกว่าการ์ดต้นเหตุ อัญเชิญได้ (จ่ายคอสต์) ไม่งั้นทิ้ง */
  | { do: 'revealTopSummonBelowSubject' }
  /** (engine ใช้ภายใน) ทิ้งการ์ดนี้ถ้ายังอยู่ในเด็ค */
  | { do: 'deckCardToTrash'; cardId: string }
  /** BS26 เบรฟพิสเกส: ส่งคอร์บนสปิริตและอัลติเมททั้งหมดของคู่แข่งตัวละ 1 เม็ดไปรีเสิร์ฟคู่แข่ง */
  | { do: 'coresOffEveryOpponent' }
  /** BS26 ไฮม์แคนนอน: อัลติเมทของเราที่กำลังต่อสู้ 1 ตัวฟื้นสภาพ และในเทิร์นนี้โจมตีไม่ได้ */
  | { do: 'refreshBattlingUltimateNoAttack' }
  /** BS26 แอมเบอร์ เลออน / อควาเรียส: นำเบรฟที่ร่วมร่างกับสปิริตของเรา 1 ใบที่ตรงตัวกรองกลับขึ้นมือ (then = ทำต่อเมื่อนำกลับได้) */
  | { do: 'ownBraveToHand'; filter: CardFilter; then?: Step[]; /** BS26 เคทอส: เฉพาะเบรฟของสปิริตนี้ */ ofSelf?: true }
  /** BS26 ซอร์ดฟิช: ในเทิร์นนี้สปิริตทั้งหมดของเราไม่รับผลเอฟเฟกต์ของการ์ดประเภทเหล่านี้ของคู่แข่ง */
  | { do: 'immuneAlliesThisTurn'; fromTypes: CardType[] }
  /** (engine ใช้ภายใน) BS26 ซิกเฟซุล: การ์ดนี้ไม่รับผลเอฟเฟกต์ที่เล็งอยู่ */
  | { do: 'dodgeSet'; cardId: string }
  /** (engine ใช้ภายใน) ทำ steps ถ้าการ์ดนี้อยู่บนสนาม (รวมเบรฟที่ร่วมร่างอยู่) */
  | { do: 'ifSummoned'; cardId: string; steps: Step[] }
  /** BS26 อัลโลเบลดเดอร์: ในการต่อสู้นี้ ขอบเขต [เอฟเฟกต์ทำลาย BP] ของการ์ดนี้ +amount */
  | { do: 'bpDestroyBoostBattle'; amount: number }
  /** BS26 ชิโซเบิร์ด: ในการต่อสู้นี้ [เอฟเฟกต์ทำลาย BP] ของการ์ดนี้เลือกเป้าเป็นอัลติเมทได้ */
  | { do: 'bpDestroyUltimateBattle' }
  /** BS26 ประกายแห่งซูเปอร์โนวา: ในเทิร์นนี้ การ์ดในมือเราที่ตรงตัวกรองมีคอสต์เท่ากับจำนวนไลฟ์ของเรา */
  | { do: 'handCostLifeThisTurn'; filter: CardFilter }
  | { do: 'triggerCounterUse'; cardId: string }
  | { do: 'payToUseCounter' }
  /** (engine ใช้ภายใน) เบิร์สของเราที่ถูกคู่แข่งทิ้ง ไม่สั่งใช้: ลงแทรช */
  | { do: 'trashOwnBurst' }
  /** (engine ใช้ภายใน) On Stage จบ: trigger "เมื่อสปิริตนี้/สปิริตของเรา On Stage" */
  | { do: 'onStageDone'; cardId: string; level: number; soul: boolean }
  /** แสดงใบบนสุดเด็ค count ใบ นำการ์ดที่ตรงตัวกรองแต่ละตัวอย่างละ 1 ใบขึ้นมือ ที่เหลือลงแทรช (picked: engine ใช้ภายใน) */
  | { do: 'revealPickEach'; count: number; filters: CardFilter[]; revealed?: string[]; index?: number }
  /** นำสปิริตคู่แข่งกี่ตัวก็ได้ BP รวมไม่เกิน maxTotal กลับขึ้นมือ / ทำลาย */
  | { do: 'opponentTotalBp'; maxTotal: number; action: 'bounce' | 'destroy' | /** BSC04 ฟงนีน่า: ในการต่อสู้นี้ป้องกันไม่ได้ */ 'noBlock'; used?: number; /** (engine ใช้ภายใน) เลือกครบแล้ว ไม่ถามต่อ */ final?: true; /** BS12: รวมคอสต์ (บนสนาม) แทน BP */ metric?: 'cost'; /** BS12: ตัวกรองเป้า (ไม่ระบุ = สปิริต/อัลติเมท) */ filter?: CardFilter; /** (engine ใช้ภายใน) บวกขอบเขตจาก [เอฟเฟกต์ทำลาย BP] แล้ว */ boosted?: true }
  /** ในเทิร์นนี้ สปิริตนี้เจ็มสี color เพิ่ม count เม็ด */
  | {
      do: 'symbolThisTurn';
      color: Color | /** BSC03 เรย์-ซอเลอร์ */ 'ultimate';
      count: number;
      per?: CountPer;
      /** มีผลจนจบการต่อสู้นั้น */
      untilBattleEnd?: true;
      /** BSC04 ไดยะ-รูน: การ์ดต้นเหตุ (subject) แทนการ์ดนี้ */
      target?: 'subject';
    }
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
  | { do: 'blockExhaustedThisTurn'; filter: CardFilter; /** chosen = การ์ดที่เพิ่งเลือก (buffChosen) แทนการเลือกใหม่ */ target?: 'chosen'; /** BSC04 ซายะ-ไชน์: สปิริตทั้งหมดของเรา (ไม่เลือก) */ all?: true }
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
  | { do: 'opponentDiscardTo'; keep: number; /** BS15 เคลียร์เอดจ์: นับ/ทิ้งการ์ดที่วางแสดงนอกมือด้วย */ withShown?: true }
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
  | {
      do: 'battleLifeIfBlocked';
      amount: number;
      /** BSC03 ซอร์ดมาสเตอร์: amount × จำนวนนี้ */
      per?: CountPer;
      /** BS08 เฟลมมังกรคลั่ง: ผู้โจมตีต้องมีโซลคอร์ */
      soulAttacker?: true;
      /** ผู้ป้องกันต้องตรงตัวกรอง (BS14 "ถูกสปิริตป้องกัน" / BS16 เอ็กซ์-คาลิบัส: สปิริต BP ไม่เกิน 6000) */
      blocker?: CardFilter;
    }
  /** ในเทิร์นนี้ ไลฟ์ของเราเสียหายได้ไม่เกิน 1 ต่อครั้ง */
  | { do: 'lifeCapOneThisTurn' }
  /** ฟื้นสภาพสปิริต/อัลติเมทของเราทั้งหมด (noAttack = ตัวที่ฟื้นสภาพโดยเอฟเฟกต์นี้โจมตีไม่ได้ในเทิร์นนี้) */
  | { do: 'refreshAllAllies'; noAttack?: true; /** เฉพาะตัวที่ตรงตัวกรอง (เช่น สปิริตเท่านั้น) */ filter?: CardFilter }
  /** ในเทิร์นนี้ เอฟเฟกต์ [เมื่อสปิริต/อัลติเมทนี้ป้องกัน] ทั้งหมดทำงานตอนโจมตีแทน */
  | { do: 'attackShiftThisTurn' }
  /** ทำลายการ์ดของทั้งสองฝ่ายที่ตรงตัวกรองทั้งหมด */
  | { do: 'destroyAllBoth'; filter: CardFilter }
  /** นำคอร์ (ไม่ใช่โซลคอร์) count เม็ดในแทรชเราไปรีเสิร์ฟ */
  | { do: 'trashCoreToReserve'; count: number; /** BS11: รวมโซลคอร์ด้วย */ withSoul?: true }
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
  | { do: 'pairBlock'; /** BS15: จำนวนสปิริตที่ต้องป้องกันพร้อมกัน (ไม่ระบุ = 2) */ count?: number; /** BS15 บีฮีมอธ: ผู้โจมตีคือการ์ดต้นเหตุ (allyAttack) ไม่ใช่การ์ดนี้ */ attacker?: 'subject' }
  /** อัญเชิญการ์ดในแทรชเรา 1 ใบที่ตรงตัวกรอง (สามารถ, จ่ายคอสต์) · then = ทำต่อเมื่ออัญเชิญสำเร็จ */
  | { do: 'summonFromTrashThen'; filter: CardFilter; then: Step[] }
  /** อัญเชิญไม่จ่ายคอสต์การ์ดในมือ/แทรชเราที่ตรงตัวกรองได้ไม่เกิน max ใบ */
  | { do: 'summonFreeHandOrTrash'; filter: CardFilter; max: number; /** BS12: เลือกจากโซนเหล่านี้เท่านั้น (ไม่ระบุ = มือและแทรช) */ zones?: ('hand' | 'trash' | /** BSC04 ราเควล: นอกมือเท่านั้น */ 'shown')[]; /** BS12: max × จำนวนนี้ */ per?: CountPer }
  // ---------------- BS12
  /** ในเทิร์นนี้ ถือว่าเป็น Lv สูงสุด: allies = สปิริตเราทั้งหมด (รวมตัวที่ลงทีหลัง), chosen = สปิริตที่เพิ่งเลือก (refreshChosenAlly) */
  | { do: 'maxLevelThisTurn'; target: 'allies' | 'chosen' | 'subject' }
  // ---------------- BSC02
  /** ดีว่าสเตจ: เราชนะเกม */
  | { do: 'winGame' }
  /** นักร้อง เอ็นจู: เปิดใบบนสุดเด็ค ตรงตัวกรอง = วางแสดงนอกมือ (ใช้ได้เสมือนอยู่ในมือ) · ไม่ตรง = ใต้สุดเด็ค */
  | { do: 'revealTopToShown'; filter: CardFilter }
  /** ทริคสเตอร์: สามารถนำการ์ดในมือที่ตรงตัวกรองกี่ใบก็ได้ไปวางแสดงนอกมือ แล้วทำ then (CountPer shownByThis) */
  | { do: 'showFromHandAny'; filter: CardFilter; then: Step[] }
  /** คัทลียา: เลือกระบุสปิริตคู่แข่ง 1 ตัว ในเทิร์นนี้เอฟเฟกต์ "แอทแท็คสเต็ปของคู่แข่ง" / "เมื่อสปิริตนี้ป้องกัน" ของตัวนั้นไม่ทำงาน */
  | { do: 'timingLockChosen' }
  /** โซโลวิง: ในการต่อสู้นี้ ผู้โจมตีไม่ถูกป้องกันโดยสปิริตเลเวลนี้ของคู่แข่ง */
  | { do: 'battleUnblockableLevel'; level: number }
  /** ดีว่าเมดเลย์: ส่งคอร์ในแทรชเรา N เม็ดไปวอยด์ */
  | { do: 'trashCoreToVoid'; count: number }
  // ---------------- BS16
  /** ริวแมน ไลท์นิ่ง: สั่งใช้เอฟเฟกต์เบิร์สของการ์ดในมือ 1 ใบที่ตรงตัวกรอง โดยไม่สนเงื่อนไขเบิร์ส (สามารถ: เลือกไม่ใช้ได้) */
  | { do: 'activateHandBurst'; filter: CardFilter }
  /** ริวแมน ไลท์นิ่ง / วินด์เซอร์เคิล: เอฟเฟกต์ [เมื่อสปิริตนี้ถูกทำลาย] / [...ถูกทำลายโดยคู่แข่ง] ของสปิริตคู่แข่งไม่ทำงาน (จนจบการต่อสู้ / thisTurn = ในเทิร์นนี้) */
  | { do: 'noOpponentDestroyTriggers'; thisTurn?: true }
  /** นีโอ แอกเกรสซีฟเรจ: ในเทิร์นนี้ สปิริตที่ buffChosen ก่อนหน้าเลือก ได้รับ True-Rage (โจมตีเมื่อไหร่ คู่แข่งต้องป้องกันถ้าทำได้) */
  | { do: 'rageChosenThisTurn' }
  /** อัลติเมท ไก-อสุรา: นำคอร์ทั้งหมดบนสปิริตทั้งหมดของเรามาวางบนการ์ดนี้ แล้วถ้ามีคอร์ถูกวางตั้งแต่ 1 เม็ด ทำ then */
  | { do: 'allCoresToSelf'; then: Step[] }
  /** อัลติเมท ไก-อสุรา: ในการต่อสู้นี้ คอร์ทั้งหมดบนสปิริตคู่แข่งที่ถูกทำลายไปที่วอยด์ */
  | { do: 'battleDestroyedCoresToVoid' }
  /** ฟรุงนีร์: เสื่อมสภาพสปิริตนี้ (จด BP ไว้ให้ buffChosen.amountFrom exhaustedBp) */
  | { do: 'exhaustSelf' }
  /** เอ็นเตอร์ไพรซ์: ในการต่อสู้นี้ เมื่อสปิริตนี้ทำลายการ์ดของคู่แข่งด้วยการเทียบ BP (ชนะ) ทำ steps */
  | { do: 'onBattleWin'; steps: Step[] }
  /** แกรน-โวเดน: เลือกคงสปิริตของคู่แข่งไว้ไม่เกิน N ตัว (N = per) ที่เหลือทั้งหมดกลับไปใต้สุดเด็ค */
  | { do: 'keepBounceRest'; keep: CountPer }
  /** โบนเซเบอร์ไทเกอร์: ในเทิร์นนี้ การ์ดของเราที่ตรงตัวกรองทั้งหมด คอสต์ +amount */
  | { do: 'costBoostThisTurn'; filter: CardFilter; amount: number }
  /** แมวงูยมโลก ไอนี่: สามารถให้เอฟเฟกต์ [เมื่อสปิริตนี้ถูกทำลาย] ของสปิริตอื่นของเราที่ตรงตัวกรองทั้งหมดทำงาน โดยไม่ต้องทำลาย */
  | { do: 'fireAllyDestroyedTriggers'; filter: CardFilter }
  /** เบรฟครีเมชัน: หลังจากนั้น ถ้าคู่แข่งคงเบรฟของสปิริตที่เอฟเฟกต์นี้ทำลายไว้บนฟิลด์ เราจั่ว count ใบ */
  | { do: 'drawIfBravesStay'; count: number }
  /** (engine ใช้ภายใน) จั่วถ้าการ์ดใดใบหนึ่งยังอยู่บนฟิลด์ของเจ้าของ */
  | { do: 'drawIfAnyOnField'; cardIds: string[]; count: number }
  /** (engine ใช้ภายใน) มิเรีย: ผู้ควบคุมเลือกส่งคอร์บนฟิลด์ของตัวเอง 1 เม็ด (รีเสิร์ฟ หรือบนการ์ดใบไหน) ไปแทรช */
  | { do: 'fieldCoreToTrash' }
  /** ฮาร์ดบีท: สามารถนำสปิริตของเราที่ตรง filter กี่ตัวก็ได้กลับใต้สุดเด็ค แล้วเปิดใบบนสุดเท่าจำนวนนั้น อัญเชิญไม่จ่ายคอสต์การ์ดที่ตรง summon กี่ใบก็ได้ ("เมื่อถูกอัญเชิญ" ไม่ทำงาน) ที่เหลือทิ้ง */
  | { do: 'alliesToBottomReveal'; filter: CardFilter; summon: CardFilter }
  /** BS12 โอนิมารุ: นำโซลคอร์ในแทรชเรามาวางที่สปิริตของเรา 1 ตัวที่ตรงตัวกรอง (เลือก) */
  | { do: 'trashSoulToAlly'; filter: CardFilter }
  /** ทำลายเบรฟที่ร่วมร่างอยู่ของคู่แข่งทั้งหมด */
  | { do: 'destroyAllOpponentBraves'; /** BS16 โนวา-เรมแนนต์: ของผู้เล่นทุกคน */ bothSides?: true }
  /** เราดูการ์ดในมือคู่แข่งทั้งหมด แล้วเลือกทิ้ง count ใบ (ที่ตรงตัวกรอง) */
  | { do: 'peekHandDiscard'; count: number; filter?: CardFilter }
  /** (engine ใช้ภายใน) จินเบร์: จ่ายคอสต์เพิ่ม cost เพื่อสั่งใช้เบิร์ส แล้วทำ then (ไม่จ่าย = ไม่เปิด) */
  | { do: 'payBurstTax'; cost: number; then: Step[]; /** ข้อความที่ถาม (ไม่ระบุ = จ่ายเพื่อสั่งใช้เบิร์ส) */ label?: string }
  // ---------------- BS13
  /** ฟื้นสภาพสปิริตที่เพิ่งเลือกในเอฟเฟกต์นี้ (voidCore to ally) */
  | { do: 'refreshChosen' }
  // ---------------- BS10
  /** เลือกสี 1 สี แล้วเสื่อมสภาพการ์ดสีนั้นที่ตรงตัวกรองทั้งหมด (ทั้งสองฝ่าย) */
  | { do: 'exhaustAllChosenColor'; filter: CardFilter }
  /** เบิร์ส "หลังจาก [เมื่ออัญเชิญ] ของคู่แข่งทำงาน" สั่งใช้จากเอฟเฟกต์นี้ไม่ได้ */
  | { do: 'blockSummonBurst'; if?: Condition }
  /** ในเทิร์นนี้ สปิริตของเราที่ตรงตัวกรองได้รับ "[เมื่อสปิริตนี้โจมตี] คู่แข่งสั่งใช้เบิร์สไม่ได้" */
  | { do: 'grantAttackNoBurstThisTurn'; filter: CardFilter }
  /** ในเทิร์นนี้ สปิริตนี้ไม่ถูกป้องกัน */
  | { do: 'unblockableSelfThisTurn'; if?: Condition }
  /** ในเทิร์นนี้ สปิริตของเรา 1 ตัว (เลือก) ได้รับเจ็มสีนี้เพิ่ม */
  | { do: 'symbolChosenAllyThisTurn'; color: Color; count: number; /** BS26 พลีอาดีส: ตัวกรองเป้า (notSelf ได้) */ filter?: CardFilter }
  /** ในการต่อสู้นี้ เมื่อสปิริตที่ต่อสู้กับสปิริตนี้ถูกทำลาย/สูญสลาย สปิริตนี้ฟื้นสภาพ */
  | { do: 'refreshOnBattlerGone' }
  /** สปิริตที่คู่แข่งเพิ่งเลือกเสื่อมสภาพ (opponentExhaustsOwn) มี BP ไม่เกินสปิริตต้นเหตุ (ผู้โจมตี): ส่งคอร์ไลฟ์คู่แข่ง 1 เม็ดลงรีเสิร์ฟ */
  | { do: 'lifeIfChosenBpAtMostSubject' }
  /** พลิกหงายการ์ดใบบนสุดเด็คของเราหรือคู่แข่ง (เลือก) ให้ทั้งสองฝ่ายเห็น */
  | { do: 'flipDeckTop'; /** (engine ใช้ภายใน) เด็คของใคร */ whose?: 'me' | 'opp' }
  /** ในการต่อสู้นี้ เทียบ Lv แทน BP */
  | { do: 'battleCompareLevel' }
  /** ในเทิร์นนี้ สปิริตของคู่แข่ง 1 ตัว (เลือก) เจ็มกลายเป็น 0 */
  | { do: 'symbolsZeroChosen'; filter: CardFilter; /** BS17 โกลเด้นเคาน์เตอร์: ใช้ตัวที่เอฟเฟกต์นี้เพิ่งเลือก (chosenId) ไม่ถาม */ chosen?: true }
  /** นำคอร์ที่ไม่ใช่โซลคอร์ในแทรชเรา count เม็ดไปวางไลฟ์ */
  | { do: 'trashCoreToLife'; count: number }
  /** เทนเซย์: ต่อจำนวนคอร์ในรีเสิร์ฟ+บนสปิริต/อัลติเมทของเรา 1 เม็ด วางคอร์วอยด์ 1 เม็ดบนสปิริต/อัลติเมทของเราตามใจชอบ (left: engine ใช้ภายใน) */
  | { do: 'voidCoresSpread'; left?: number }
  /** นำคอร์วอยด์มาวางไลฟ์เราจนกระทั่งไลฟ์เป็น max */
  | { do: 'lifeUpTo'; max: number }
  /** ดูใบบนสุดเด็คเรา count ใบ เลือกไปไว้ใต้สุดเด็คกี่ใบก็ได้ ที่เหลือกลับบนสุดเรียงลำดับได้ */
  | { do: 'scry'; count: number; /** (engine ใช้ภายใน) การ์ดที่ดูอยู่ */ cards?: string[] }
  /** นำการ์ดเมจิคที่เราใช้งานในการต่อสู้นี้ทั้งหมดในแทรชเรากลับขึ้นมือ */
  | { do: 'returnBattleMagic' }
  /** ในเทิร์นนี้ สปิริตของเรา 1 ตัว (เลือก) ไม่ถูกทำลาย */
  | { do: 'noDestroyChosenThisTurn'; filter: CardFilter }
  /** ในเทิร์นนี้ สปิริตทั้งหมดของคู่แข่งถือว่าเป็น Lv1 */
  | { do: 'opponentLevelOneThisTurn' }
  /** ในเทิร์นนี้ คู่แข่งโจมตี/ป้องกันได้ต่อเมื่อส่งคอร์ 1 เม็ดบนตัวนั้นไปวอยด์ */
  | { do: 'battleCoreTaxThisTurn' }
  /** ในการต่อสู้นี้ ถ้าสปิริตเผ่านี้ของเราที่โจมตีไม่ถูกป้องกัน: เจ็มกลายเป็นสีนี้ count เม็ด */
  | { do: 'symbolIfUnblocked'; family: string; color: Color; count: number }
  /** ในเทิร์นนี้ สปิริตของเรา 1 ตัว (เลือก): ทำความเสียหายไลฟ์คู่แข่งจากการโจมตี → ส่งคอร์ไลฟ์คู่แข่ง 1 เม็ดลงรีเสิร์ฟ */
  | { do: 'lifeOnHitChosenThisTurn'; filter: CardFilter }
  /** (engine ใช้ภายใน) มิคาเนะ: นำคอร์ไลฟ์ count เม็ดมาวางบนการ์ดนี้ */
  | { do: 'lifeCoreOnto'; cardId: string; count: number }
  /** (engine ใช้ภายใน) ส่งคอร์ n เม็ดในรีเสิร์ฟ/แทรชของคู่แข่งไป to */
  | { do: 'opponentPileCores'; from: 'reserve' | 'trash'; n: number; to: 'reserve' | 'trash' | 'void'; /** 2VS2: กองของคู่แข่งที่นั่งนี้ (ไม่ระบุ = ที่นั่ง 0) */ seat?: 0 | 1 }
  /** ส่งคอร์ count เม็ดบนการ์ดต้นเหตุ (subject) ของเราลงแทรชเรา (คอร์ปกติก่อน) */
  | { do: 'subjectCoresToTrash'; count: number }
  /** Bunshin: สามารถนำใบบนสุดเด็คเราไม่เกิน max ใบไปวางคว่ำบนฟิลด์ (วางคอร์จากรีเสิร์ฟใบละ 1 เม็ด) กลายเป็นสปิริตร่างแยก (n: engine ใช้ภายใน) */
  | { do: 'bunshin'; max: number; n?: number }
  /** หงายสปิริตร่างแยกของเรา 1 ตัว: เป็นการ์ดสปิริต = อัญเชิญไม่จ่ายคอสต์ / การ์ดอื่น = ทิ้ง */
  | { do: 'flipClone' }
  /** (engine ใช้ภายใน) ส่งโซลคอร์บนการ์ดนี้ลงแทรชของเจ้าของ */
  | { do: 'cardSoulToTrash'; cardId: string }
  /** (engine ใช้ภายใน) สิงโตควันม่วง: ทิ้งใบบนสุดเด็คเรา n ใบ */
  | { do: 'millSelfN'; n: number }
  /** คำสาปบงการชีพ: ถ้าเบิร์สนี้ถูกสั่งใช้โดย Catalyze ในเทิร์นนี้การ์ดนี้ถือว่าไร้สี */
  | { do: 'colorlessIfCatalyzed' }
  // ---------------- BS11
  /** เลือกระบุสปิริต/อัลติเมทของคู่แข่ง count ตัว: ในเทิร์นนี้ทำความเสียหายแก่ไลฟ์เราไม่ได้ */
  | { do: 'noLifeDamageChosen'; count: number; filter: CardFilter; /** (engine ใช้ภายใน) ขยายจำนวนเป้าด้วย Dispersion แล้ว */ dispersed?: true }
  /** ในเทิร์นนี้ สปิริต/อัลติเมท 1 ตัว (ฝ่ายใดก็ได้) สูญเสียเอฟเฟกต์ทั้งหมดและรับเพิ่มไม่ได้ */
  | { do: 'negateChosenThisTurn'; filter: CardFilter; /** BS26 ราบิตต้า: เฉพาะในการต่อสู้นี้ */ untilBattleEnd?: true }
  /** นำคอร์ในแทรชเรา (รวมโซลคอร์) ไม่เกิน max เม็ดมาวางบนสปิริตนี้ (ไม่ระบุ = ทั้งหมด) */
  | { do: 'trashCoresToSelf'; max?: number }
  /** นำคอร์ไลฟ์ของเรา count เม็ดมาวางบนสปิริตนี้ (ไม่นับเป็นการเสียไลฟ์ที่สั่งใช้เบิร์สได้) */
  | { do: 'ownLifeToSelf'; count: number }
  /** ส่งคอร์บนสปิริต/อัลติเมทของผู้เล่นทุกคนตัวละ 1 เม็ดลงแทรชเจ้าของ */
  | { do: 'coresOffEverySpirit' }
  /** BSC01 ซาโตริดีมอน: ส่งคอร์บนสปิริตทั้งหมดของคู่แข่งไปรีเสิร์ฟคู่แข่ง จนเหลือตัวละ 1 เม็ด (ไม่ใช่การเล็งเป้า) */
  | { do: 'opponentCoresDownToOne' }
  /** ในการต่อสู้นี้ สปิริตของเราที่กำลังโจมตีอยู่ได้รับเจ็มสีนี้เพิ่ม */
  | { do: 'symbolAttackerBattle'; color: Color; count: number }
  /** ทิ้งใบบนสุดเด็คเรา 1 ใบ แล้วทำ steps ของกรณีแรกที่ตรง ไม่ตรงเลย = นำการ์ดที่ทิ้งขึ้นมือ (otherwiseToHand) */
  | { do: 'millTopBranch'; cases: { filter: CardFilter; steps: Step[] }[]; otherwiseToHand?: true }
  /** ในเทิร์นนี้ สปิริต/อัลติเมทของคู่แข่งที่ตรงตัวกรองทั้งหมด เจ็มกลายเป็น 0 (รวมตัวที่ลงทีหลังในเทิร์น: กติกา 13 ข้อ 6) */
  | { do: 'symbolsZeroAllOpponent'; filter: CardFilter }
  /** ในการต่อสู้นี้ เมื่อเทียบ BP: ผู้โจมตีของเรามี Lv ≥ ผู้ป้องกัน = ไม่เทียบ BP และถือว่าไม่ถูกป้องกัน */
  | { do: 'battleLevelUnblock' }
  /** ในเทิร์นนี้ เอฟเฟกต์ของสปิริตเราที่ชื่อมีคำเหล่านี้ ถือว่าได้ส่งโซลคอร์ลงแทรชแล้ว (ลองฟิลด์) */
  | { do: 'soulCostFreeThisTurn'; nameIncludes: string[] }
  /** (engine ใช้ภายใน) นำการ์ดเหล่านี้บนสนามกลับไปที่ to (เด็คหลายใบ = เรียงลำดับได้) */
  | { do: 'returnCardsTo'; cardIds: string[]; to: 'hand' | 'deckTop' | 'deckBottom' }
  // ---------------- BS13 หกเทพพิสุทธิ์
  /** ส่งคอร์ทั้งหมด (รวมโซลคอร์) บนการ์ดของคู่แข่งที่ตรงตัวกรองทั้งหมดลงแทรชคู่แข่ง (เดธ-กัล-วาดอส) */
  | { do: 'opponentAllCoresToTrash'; filter: CardFilter }
  /** ทำลายการ์ดต้นเหตุ (subject) ของคู่แข่ง (เจียส: ตัวที่เสื่อมสภาพโดยเอฟเฟกต์ของเรา) */
  | { do: 'destroySubject' }
  /**
   * เทนคาฟุบุ: อัลติเมทของเราสีละ 1 ตัว (แดง/ม่วง/เขียว/ขาว/เหลือง/ฟ้า ตัวละครั้ง) ที่ไม่ใช่ชื่อ excludeNames แสดงผล Soul Drive ของตัวเอง
   * Soul Drive ของการ์ด = ตัวเลือกใน chooseOne ที่ขึ้นต้นด้วย soulToVoid (ทำส่วนที่ต่อจาก soulToVoid โดยไม่ต้องจ่ายโซลคอร์ของตัวนั้น)
   * colorIdx / used = (engine ใช้ภายใน) สีถัดไปที่ต้องเลือก / ตัวที่เลือกแล้ว
   */
  | { do: 'soulDriveOthers'; excludeNames: string[]; colorIdx?: number; used?: string[] }
  // ---------------- BS14
  /**
   * U Trigger (กติกา 05 ข้อ 4): นำการ์ดใบบนสุดเด็คคู่แข่ง 1 ใบไปวางที่แทรช (ไม่ใช่ [เอฟเฟกต์ทิ้งเด็ค])
   * คอสต์ของการ์ดนั้นต่ำกว่าคอสต์ของอัลติเมทนี้ (บนสนาม) = ฮิต → ทำ then (CountPer uTriggerCost = คอสต์ของการ์ดที่วาง)
   */
  | { do: 'uTrigger'; then: Step[]; /** BS16 เบลิท: U Trigger ตอนอัลติเมทนี้ถูกทำลาย (ไม่อยู่บนสนามแล้ว: เทียบกับคอสต์บนการ์ด) */ fromTrash?: true; /** (engine ใช้ภายใน) 2VS2: เลือกเด็คของคู่แข่งแล้ว (then ทำหลังคืนที่นั่งคู่แข่ง) */ seatPicked?: true; /** (engine ใช้ภายใน) BS17 ออร์แกนปีกทองคำ: วางที่แทรชแล้ว รอตัดสินฮิต */ milledId?: string; /** BSC03 Double U Trigger: วางใบบนสุด 2 ใบ แต่ละใบที่คอสต์ต่ำกว่า = ฮิต (item.uTriggerHits) */ double?: true }
  /** "หลังจบเทิร์นนี้ เราได้เล่นเทิร์นของเราอีก 1 เทิร์น" · key = เกมละ 1 ครั้ง (เงื่อนไข oncePerGameFree) */
  | { do: 'extraTurn'; key?: string }
  /** "ในเอฟเฟกต์นี้ คู่แข่งไม่สามารถสั่งใช้เบิร์ส 'หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง'" (เฟลมบรีซ) */
  | { do: 'noDestroyBurstThisEffect' }
  /** นำเบรฟของสปิริตร่วมร่างของคู่แข่ง 1 ใบกลับขึ้นมือ / กลับไปไว้บนสุดเด็ค (optional = "สามารถ") */
  | { do: 'bounceOpponentBrave'; to?: 'hand' | 'deckTop'; optional?: true }
  // ---------------- BS14 ม่วง
  /** Curse (เมื่อจบการต่อสู้): ทำลายสปิริตของคู่แข่งที่ป้องกันอยู่ตอนตัดสินผลการต่อสู้ 1 ตัว (ใช้ใน atBattleEnd) */
  | { do: 'curseResolve' }
  /** แก๊สอุซางิ: ทิ้งการ์ดที่วางแสดงนอกมือของคู่แข่ง count ใบ (เราเลือก) */
  | { do: 'discardOpponentShown'; count: number; per?: CountPer }
  /** เควตซัลโคอาตล์: นำคอร์ (ไม่ใช่โซลคอร์: โซลคอร์ไปไลฟ์ไม่ได้ถ้าเอฟเฟกต์ไม่ระบุ) บนการ์ดของเราที่ตรงตัวกรอง 1 เม็ด มาวางที่ไลฟ์ของเรา */
  | { do: 'allyCoreToLife'; filter: CardFilter }
  // ---------------- BS15 เขียว
  /** แชโดว์ลีฟ: ให้ Bunshin ของสปิริตของเรา 1 ตัวทำงาน (ใช้จำนวนสูงสุดของ Bunshin ที่มี) */
  | { do: 'activateBunshin' }
  /** BS17 ไนท์ไอบิส: Bunshin ของสปิริตทั้งหมดของเราทำงาน (ทีละตัว) */
  | { do: 'activateBunshinAll' }
  /** BS17 ไนท์ไอบิส: เลือกสปิริตร่างแยกของเราที่ฟื้นสภาพ 1 ตัว (ไม่ใช่ subject) มาซ้อน = เสื่อมสภาพตัวนั้น แล้วในการต่อสู้นี้ subject ถือว่ามีคอสต์/BP/เจ็มตามนี้ */
  | { do: 'cloneStack'; cost: number; bp: number; symbols: number }
  // ---------------- BS15 เหลือง
  /** มิเรฟา: เปิดการ์ดใบบนสุดเด็คเรา ตรงตัวกรอง = ทำ then · หลังจากนั้นนำการ์ดที่เปิดขึ้นมือ */
  | { do: 'revealTopIf'; filter: CardFilter; then: Step[] }
  /** โคริสทัล: ในการต่อสู้นี้ การ์ดนี้จะไม่ถูกทำลาย */
  | { do: 'battleIndestructibleSelf' }
  /** อองจู / โซเฟีย (U Trigger ฮิต): ในการต่อสู้นี้ ไม่ถูกป้องกันโดยสปิริตคู่แข่งที่คอสต์ไม่เกินคอสต์ของการ์ดที่ U Trigger วางที่แทรช */
  | { do: 'uTriggerCostUnblock' }
  /** มิคาฟาร์ (U Trigger ฮิต): เทิร์นนี้ 1 ครั้ง เมื่อเอฟเฟกต์เมจิคของเรานำสปิริตคู่แข่งกลับขึ้นมือ/เข้าเด็ค = ไลฟ์คู่แข่ง 1 เม็ดไปรีเสิร์ฟ */
  | { do: 'magicBounceLifeThisTurn' }
  /** แบทเทิลแคนเซิล: ตอนตัดสินผลการต่อสู้ จบการต่อสู้โดยไม่เทียบ BP */
  | { do: 'battleNoCompare' }
  // ---------------- BS15 ฟ้า
  /** ม่อนโกคู: BP ของการ์ดนี้เพิ่มเป็น 2 เท่า (จนจบการต่อสู้นี้) */
  | { do: 'doubleBpSelf' }
  /** แกลเลียน โกเล็ม: เลือกระบุสปิริตคู่แข่ง 1 ตัว ในเทิร์นนี้คู่แข่งต้องป้องกันด้วยสปิริตนั้นถ้าทำได้ */
  | { do: 'forceBlockChosen'; filter: CardFilter };

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
  /** BS17 ผลของหญ้าเขี้ยวมรกต: U Trigger ของอัลติเมทของเราฮิต (subject = อัลติเมทนั้น) */
  | 'allyUTriggerHit'
  /** BS17 เพนต้น / พาวเวอร์ดาวน์: การ์ดนี้ถูกวางจากเด็คเราที่แทรชโดย U Trigger ของคู่แข่ง (คู่กับ milledByOpponent) */
  | 'uTriggeredByOpponent'
  /** BS26 เครื่องบินรบปเทรา (การ์ดในมือ): U Trigger ของเราถูก Guard */
  | 'uTriggerGuarded'
  /** BS26 หุบเขาใหญ่ไกน่าร็อค: การ์ดของคู่แข่งถูกอัญเชิญ (subject = การ์ดนั้น) */
  | 'oppSummoned'
  /** BS17 เหมืองแร่หายาก: ไลฟ์ของคู่แข่งลดลง */
  | 'oppLifeLost'
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
  /** BS16 บาคูลัส: เด็คของเราถูกทิ้งโดยเอฟเฟกต์ทิ้งเด็คของคู่แข่ง (ตัวกรอง milled) */
  | 'allyDeckMilled'
  /** เราเสียไลฟ์ */
  | 'lifeLost'
  /** เราใช้การ์ดเมจิค (ทำงานหลังเอฟเฟกต์ของเมจิคนั้น) */
  | 'allyMagicUsed'
  /** สปิริตนี้ (ที่โจมตี) ถูกป้องกัน */
  | 'blocked'
  /** สปิริตเรา (subject) ที่โจมตีถูกป้องกัน */
  | 'allyBlocked'
  /** BS16 มูนโบว์ ดรากูน: การ์ดนี้ถูกทำลาย/สูญสลายโดยเอฟเฟกต์ของสปิริต/อัลติเมท (ของผู้เล่นใดก็ได้) */
  | 'destroyedBySpiritEffect'
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
  /** BS14: เราจั่วการ์ด (ทุกแบบ) */
  | 'selfDrew'
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
  | 'oppSoulToTrash'
  // ---------------- BS10
  /** สปิริต/อัลติเมทของคู่แข่งสูญสลาย */
  | 'oppDepleted'
  /** เอฟเฟกต์ Soul Drive ของเราทำงาน (ทำงานหลังเอฟเฟกต์นั้น) */
  | 'allySoulDrive'
  /** จบการต่อสู้ของสปิริต/อัลติเมทของเรา (subject = ตัวที่ต่อสู้ ยังอยู่บนสนาม) */
  | 'allyBattleEnd'
  /** (การ์ดในมือ) คู่แข่งได้คอร์จากวอยด์ (ไม่นับคอร์สเต็ป) */
  | 'oppVoidGain'
  // ---------------- BS11
  /** โซลคอร์ของเราถูกนำไปวางที่แทรชโดยเอฟเฟกต์ของสปิริตเรา */
  | 'allySoulTrashed'
  /** สปิริตของเรา (subject) สูญสลายโดยเอฟเฟกต์ของคู่แข่ง (ข้อความ "ถูกทำลาย/สูญสลาย") */
  | 'allyDepletedByOpponent'
  /** เริ่มเมนสเต็ปของคู่แข่ง */
  | 'oppMainStepStart'
  // ---------------- BS13 หกเทพพิสุทธิ์
  /** การ์ดนี้ถูกนำกลับขึ้นมือ/เด็คจากฟิลด์โดยเอฟเฟกต์ของคู่แข่ง (ใช้คู่กับ destroyedByOpponentEffect / depletedByOpponent = "ออกจากฟิลด์โดยเอฟเฟกต์ของคู่แข่ง") */
  | 'leftByOpponentEffect'
  /** BS15 ชาร์กไฮดรา: สปิริต/อัลติเมทของคู่แข่ง (subject) ถูกทำลาย (ด้วยเหตุใดก็ได้) */
  | 'oppSpiritDestroyed'
  // ---------------- BSC04
  /** My Unit ของสปิริตนี้สำเร็จ: ทำงานครั้งละตัวที่นำมาวางชิด (subject = ตัวที่นำมาวางชิด) */
  | 'unitFormed'
  /** สปิริตนี้ถูกนำไปวางชิดด้วย My Unit (subject = สปิริตที่ใช้ My Unit = ตัวที่โจมตี/ป้องกันอยู่) */
  | 'placedInUnit'
  /** สปิริตของเราใช้ My Unit (subject = สปิริตที่ใช้ My Unit · ครั้งละ 1 ครั้งต่อ My Unit) */
  | 'allyUnitFormed';

/** เงื่อนไขของสปิริตที่ทำให้ trigger แบบ ally* ทำงาน */
export interface SubjectFilter {
  /** BS16 เกรย์การ์ม: ถูกทำลายจากการเทียบ BP (ไม่ใช่เอฟเฟกต์) */
  byBattle?: true;
  family?: string;
  /** oppDestroyed: การ์ดของคู่แข่งที่ถูกทำลายมี Soul Core วางอยู่ (เลออนแลนเซอร์) */
  victimSoul?: true;
  /** allyBattleEnd: ต้นเหตุคือผู้โจมตีของการต่อสู้นี้ ("เมื่อจบการโจมตีของ…") */
  attacker?: true;
  /** มี Soul Core วางอยู่ */
  soul?: true;
  /** ชื่อการ์ดมีคำใดคำหนึ่งนี้ */
  nameIncludes?: string[];
  /** ชื่อการ์ดตรงทั้งชื่อ */
  names?: string[];
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
  /** BS12 โอคุริดาระ: คอสต์ที่พิมพ์บนการ์ดต้นเหตุเท่ากับค่านี้ */
  cost?: number;
  /** อยู่ในเผ่าใดเผ่าหนึ่งเหล่านี้ */
  families?: string[];
  /** สปิริตต้นเหตุมี Holy Life (ของตัวเอง หรือได้รับจากการ์ดอื่น) */
  holyLife?: true;
  /** BS13 เจียส (oppExhausted): เสื่อมสภาพโดยเอฟเฟกต์ของเรา (ผู้ควบคุมเอฟเฟกต์ = เจ้าของการ์ดที่รอ trigger) */
  byOwnEffect?: true;
  // ---------------- BS07
  /** อยู่ในทีมนี้ */
  team?: string;
  /** สปิริตต้นเหตุกำลังต่อสู้อยู่ */
  inBattle?: true;
  /** allyDestroyed: ถูกทำลายโดยสปิริต/อัลติเมทของคู่แข่ง (ต่อสู้ หรือเอฟเฟกต์ของสปิริต/อัลติเมท) */
  bySpirit?: true;
  /** allySummoned: ถูกอัญเชิญโดย On Stage */
  byOnStage?: true;
  /** BS17: ถูกอัญเชิญโดย Summon Bolt */
  bySummonBolt?: true;
  /** การ์ดต้นเหตุตรงตัวกรอง (เช่น มี Solo Part) */
  card?: CardFilter;
  // ---------------- BS09
  /** allyDestroyed: ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (ไม่นับการต่อสู้) */
  byOpponentEffect?: true;
  /** BS26 ซีแบ็ค อาร์เมอร์ (allyExhausted): เสื่อมสภาพโดยเอฟเฟกต์ของคู่แข่ง */
  exhaustedByOpponentEffect?: true;
  // ---------------- BS11
  /** allyBurstActivated: เบิร์สนั้นถูกสั่งใช้โดย Catalyze */
  catalyzed?: true;
  /** BS15 มาริกะ: คอสต์ที่พิมพ์บนการ์ดต้นเหตุไม่เกินค่านี้ */
  maxCost?: number;
  /** BS15 รูปปั้นแซฟไฟร์ (oppDeckMilled): การทิ้งเด็คเป็นเอฟเฟกต์ของ U Trigger (ผลเมื่อฮิต) */
  uTriggerMill?: true;
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

/**
 * ข้อมูลที่ attachScripts ใส่ให้ตามข้อความการ์ด (ปกติสคริปต์ไม่ต้องเขียนเอง)
 * อัลติเมทไม่ใช่สปิริต: คำว่า "สปิริต" = สปิริต + เบรฟที่อยู่เดี่ยวเท่านั้น
 */
export interface AbilityMeta {
  /**
   * step ที่ไม่ระบุประเภท (หรือ types ไม่มี 'ultimate') เลือก/นับเฉพาะสปิริต ไม่รวมอัลติเมท (ยกเว้นการ์ดนี้เอง)
   * ใส่ให้อัตโนมัติเมื่อบรรทัดไม่พูดถึงอัลติเมท หรือมีคำว่า "สปิริต" เดี่ยว ๆ (ไม่ใช่ "สปิริต/อัลติเมท")
   * สคริปต์ใส่ false เองได้: บรรทัดที่ step ไม่ระบุประเภทหมายถึง "สปิริต/อัลติเมท" แต่ step นั้นไม่มีตัวกรอง
   */
  spiritsOnly?: boolean;
  /** เบิร์ส: เงื่อนไข "หลังจากสปิริต..." (ไม่มีอัลติเมท) = ต้นเหตุที่เป็นอัลติเมทไม่เปิดเบิร์สนี้ */
  subjectSpiritsOnly?: true;
}

export type Ability = AbilityCore & AbilityMeta;

type AbilityCore =
  /** เอฟเฟกต์ที่ทำงานเมื่อเกิดเหตุการณ์ (เฉพาะเลเวลที่ระบุ) */
  | {
      kind: 'trigger';
      source: number;
      /** หลายเหตุการณ์ = "เมื่อสปิริตนี้โจมตี/ป้องกัน" */
      on: TriggerEvent | TriggerEvent[];
      /** เหตุการณ์ ally*: สปิริตที่เป็นต้นเหตุต้องตรงเงื่อนไขนี้ */
      subject?: SubjectFilter;
      /** BSC02 allyOnStage: การ์ดต้นเหตุของ step (subject) = ตัวที่ถูกอัญเชิญโดย On Stage นั้น (ตัวกรอง subject ยังตรวจตัวที่กลับใต้เด็ค) */
      onStageSummoned?: true;
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
      /** "เอฟเฟกต์นี้ไม่แสดงผลซ้ำซ้อน" (ต่อเหตุการณ์): การ์ดชื่อเดียวกันของเจ้าของเดียวกันหลายใบทำงานแค่ใบเดียวต่อเหตุการณ์ (ไม่จำกัดต่อเทิร์น) */
      noStack?: true;
      /** oppDeckMilled: การ์ดที่ถูกทิ้งต้องมีอย่างน้อย 1 ใบตรงตัวกรองนี้ */
      milled?: CardFilter;
      /** BS15 รูปปั้นแซฟไฟร์ (oppDeckMilled): ทิ้งได้ไม่เกิน N ใบ */
      milledMax?: number;
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
      /** BS10 มิคาเนะ: จ่ายด้วยการนำคอร์ไลฟ์ N เม็ดมาวางบนการ์ดนี้ */
      life?: number;
      /** BS10 นาเดชิโกะ: กลับขึ้นมือแทนการถูกทำลาย */
      toHand?: true;
      /** BSC02 เวียร์จ: "สามารถกลับขึ้นมือได้" = ถามก่อน (ใช้กับ toHand) */
      ask?: true;
      /** BS14 Destructive Curse (ควีน เมดูค): จ่ายด้วยการส่งคอร์ไลฟ์คู่แข่ง N เม็ดไปแทรชคู่แข่ง */
      oppLife?: number;
      /** BS15 วอตชิโน: จ่ายด้วยการเสื่อมสภาพสปิริตคู่แข่งที่ตรงตัวกรอง 1 ตัว */
      exhaustOpp?: CardFilter;
      /** BS15 ไรออต โกเล็ม: จ่ายด้วยการเสื่อมสภาพการ์ดของเราที่ตรงตัวกรอง 1 ใบ (เน็กซัส) */
      exhaustOwn?: CardFilter;
      /** BS17 อาร์ชิบอลด์: จ่ายด้วยการทำลายการ์ดนี้ (ต้นเหตุ) */
      destroySource?: true;
      /** BS17 อาร์ชิบอลด์: ใช้กับการถูกทำลายโดยเราเองด้วย (Summon Bolt) */
      ownToo?: true;
      /** BS26 สม็อกชีพ: จ่ายด้วยการส่งคอร์บนอัลติเมทของคู่แข่ง 1 เม็ดไปรีเสิร์ฟคู่แข่ง */
      oppUltCore?: true;
      /** BS26 โบนริตเตอร์: (บังคับ ไม่ถาม) ทิ้งใบบนสุดเด็คเรา 1 ใบ ถ้าตรงตัวกรอง = อยู่ต่อ ไม่งั้นถูกทำลาย */
      millSelfIf?: CardFilter;
      /** BS26 เดวิด: (บังคับ ไม่ถาม) U Trigger ถ้าฮิต = then แล้วอยู่ต่อ ไม่งั้นถูกทำลาย */
      uTriggerStay?: true;
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
      /** BS11: BP+ × จำนวนสีเจ็มบนฟิลด์เรา */
      perGemColors?: true;
      /** BS14 เดสเปราโด: BP+ × จำนวนคอร์ในรีเสิร์ฟ/แทรชของคู่แข่ง */
      perOpponentPileCores?: true;
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
      /** BS12 เซ็นจู: count × จำนวนการ์ดของเราที่ตรงตัวกรองนี้ (เช่น เน็กซัส) */
      perAllies?: CardFilter;
    }
  /** "เจ็มของสปิริตนี้ถือว่าเป็นเจ็มสี color ด้วย" */
  | { kind: 'symbolAlsoColor'; source: number; levels: number[]; color: Color }
  /** "เมื่ออัญเชิญการ์ดที่ชื่อมีคำ ... สปิริตนี้เจ็มสี color เพิ่ม count" (นับเฉพาะตอนจ่ายคอสต์การ์ดนั้น) */
  | { kind: 'summonSymbol'; source: number; levels: number[]; if?: Condition; /** BS15 นางฟ้าร่อน: เจ็ม × จำนวนการ์ดของเราที่ตรงตัวกรอง (สปิริตดีว่าทุกตัวได้รับเจ็ม) */ perAllies?: CardFilter; nameIncludes?: string[]; /** การ์ดที่อัญเชิญตรงตัวกรอง (Spirit Soul: การ์ดอัลติเมท) */ filter?: CardFilter; color: Color; count: number }
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
  | { kind: 'blockWhileExhausted'; source: number; levels: number[]; if?: Condition; /** BS14 การ์เน็ตดราก้อน: สปิริตของเราที่ตรงตัวกรองทั้งหมด (ไม่ระบุ = การ์ดนี้) */ allies?: CardFilter }
  /** "สปิริต/อัลติเมทของคู่แข่งทั้งหมดที่จะกลับขึ้นมือจะกลับไปไว้ใต้สุดเด็คแทน" */
  | { kind: 'bounceToBottom'; source: number; levels: number[]; if?: Condition; attackStepOnly?: true }
  /** "เน็กซัสทั้งหมดของคู่แข่งที่ไม่มีคำว่า ... ในชื่อจะสูญเสียเอฟเฟกต์ทั้งหมด" */
  | { kind: 'negateOpponentNexus'; source: number; levels: number[]; if?: Condition; unlessNamed: string[] }
  /** "แอทแท็คสเต็ปของเรา: การ์ดในมือเราที่ตรงตัวกรองทั้งหมดคอสต์ +delta" */
  | { kind: 'handCostDelta'; source: number; levels: number[]; filter: CardFilter; delta: number; ownAttackStepOnly?: true; /** BS14 สึจิกุดีมอน: เมนสเต็ปของเรา */ ownMainStepOnly?: true }
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
  | { kind: 'maxLevelIf'; source: number; levels: number[]; if: Condition; /** BS12 จูซุมารุ: Brave ให้ผู้ร่วมร่าง */ granted?: true }
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
  | { kind: 'opponentNoRefresh'; source: number; levels: number[]; filter: CardFilter; if?: Condition; /** BS13 ก็อด-เซคส์: "ฟื้นสภาพไม่ได้" ทุกทาง (รวมฟื้นสภาพด้วยเอฟเฟกต์) ไม่ใช่แค่รีเฟรชสเต็ป */ anyRefresh?: true }
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
      /** BS13 เดรมาซาดาร์: "เอฟเฟกต์นี้ ทำงานในเมนสเต็ปไม่ได้" */
      notMain?: true;
      /** BS15 อัลติเมทพลาสมา: ใช้งานได้เฉพาะเมื่อเงื่อนไขจริง (ตรวจด้วยการ์ดเมจิคนี้) */
      useIf?: Condition;
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
  | { kind: 'noMill'; source: number; levels: number[]; /** BS17 เพนต้น: เฉพาะเด็คของเรา (ทิ้งโดยเอฟเฟกต์ของคู่แข่ง) */ ownOnly?: true }
  /** ผู้เล่นทุกคน: จั่วการ์ดตั้งแต่ 2 ใบใน 1 ครั้งโดยเอฟเฟกต์ = การ์ดบนสนาม/ในมือทั้งหมดของฝ่ายนั้นไปใต้สุดเด็ค (คิชูด็อก) */
  | { kind: 'multiDrawPunish'; source: number; levels: number[] }
  /** คู่แข่งอัญเชิญการ์ดสปิริตคอสต์ดั้งเดิมไม่เกิน maxCost: ใช้สัญลักษณ์ลดคอสต์ไม่ได้ */
  | { kind: 'opponentNoReduction'; source: number; levels: number[]; maxCost: number }
  /** สปิริตนี้รวมร่างกับเบรฟได้ไม่เกิน count ใบ */
  | { kind: 'braveSlots'; source: number; levels: number[]; count: number; /** สปิริตของเราที่ตรงตัวกรองทั้งหมด (แทนตัวการ์ดนี้) */ allies?: CardFilter }
  /** ไลฟ์ของเราได้รับความเสียหายจากสปิริต/อัลติเมทของคู่แข่งได้เพียง 1 เม็ดต่อ 1 ตัวต่อเทิร์น */
  | { kind: 'lifeDamageCap'; source: number; levels: number[]; /** BSC04 แบ็คสเตจ: เฉพาะผู้โจมตีที่มีเจ็มตั้งแต่ N เม็ด */ minSymbols?: number }
  // ---------------- BS07
  /**
   * On Stage (แอทแท็คสเต็ปของเรา): สปิริตนี้กลับไปใต้เด็คแทนการโจมตี แล้วทำ steps (action onStage)
   * keyword = เป็น "On Stage" จริง (ปลุก trigger onStage/allyOnStage) · ไม่ใส่ = กลับใต้เด็คแทนการโจมตีเฉย ๆ (ลิลี่)
   * if = เงื่อนไขที่ต้องทำได้ ("เพื่อ" ท่อนหลังต้องทำได้)
   */
  | { kind: 'onStage'; source: number; levels: number[]; label: string; steps: Step[]; if?: Condition; keyword?: true }
  /** "เมื่อสปิริตของเราจะทำการ On Stage, สามารถเสื่อมสภาพสปิริตนั้น เพื่อถือว่ากลับใต้สุดเด็คแล้ว" (รีเซ่-โดรมเวล) */
  | {
      kind: 'onStageReplace';
      source: number;
      levels: number[];
      if?: Condition;
      /** BSC04 แบ็คสเตจ: เสื่อมสภาพการ์ดนี้ (เน็กซัส) แทน · สปิริตที่ On Stage อยู่ต่อสภาพเดิม */
      exhaustSelf?: true;
    }
  /** การ์ดของเราที่ตรง scope ไม่ถูกทำลายโดยเอฟเฟกต์ของคู่แข่ง (soloPart = เป็นความสามารถ Solo Part) */
  | { kind: 'destroyImmune'; source: number; levels: number[]; if?: Condition; /** BS17 อาร์เชีย: เฉพาะเอฟเฟกต์ของการ์ดประเภทนี้ */ fromTypes?: CardType[]; scope: { ownNamed: string[] } | { own: CardFilter } | /** BS16 เซอร์ไวเวอร์: การ์ดนี้เอง */ { self: true }; soloPart?: true }
  /** "หลังจากจบแอทแท็คสเต็ปของเรา: เข้า [รีเฟรชสเต็ป] / [แอทแท็คสเต็ป] อีก 1 ครั้ง" once = ไม่เกินเทิร์นละ/เกมละ 1 ครั้ง */
  | { kind: 'extraSteps'; source: number; levels: number[]; if?: Condition; steps: ('refresh' | 'attack')[]; once: 'turn' | 'game' }
  /** "เมื่อ <attacker> ของเราโจมตี คู่แข่งป้องกันได้ด้วยสปิริต/อัลติเมทตั้งแต่ 1 ตัวที่ Lv รวมตั้งแต่ minLevel แล้วเราเลือกสู้ 1 ตัว" */
  | { kind: 'blockLevelSum'; source: number; levels: number[]; if?: Condition; attacker: CardFilter; minLevel: number }
  /** "แอทแท็คสเต็ปของเรา: <attacker> ของเราจะไม่ถูกป้องกันโดยสปิริต/อัลติเมทคอสต์ไม่เกิน maxCost ของคู่แข่ง" */
  | { kind: 'unblockableByCost'; source: number; levels: number[]; if?: Condition; attacker: CardFilter; maxCost?: number; /** BS15 วิงบีฮีมอธ: ไม่ถูกป้องกันโดยสปิริต Lv ไม่เกินนี้ */ maxLevel?: number; /** BSC02 วันหยุดของดีว่า: ไม่ถูกป้องกันโดยสปิริตใด ๆ ของคู่แข่ง */ bySpirits?: true }
  /** "การ์ดสปิริตนี้, เมื่อ..., จะถือว่ามีคอสต์ N" (ในมือ/นอกมือ) */
  | { kind: 'selfCostIf'; source: number; cost: number; if: Condition }
  /** "การ์ดนี้ที่เซ็ทอยู่ เมื่อถูกทิ้งโดยคู่แข่ง, สามารถสั่งใช้เบิร์สโดยไม่สนเงื่อนไขได้" */
  | { kind: 'burstOnDiscard'; source: number }
  // ---------------- BS08
  /** คอร์บนการ์ดของเราที่ตรงตัวกรองจะเหลือน้อยกว่า min เม็ดโดยคู่แข่งไม่ได้ */
  | { kind: 'coreFloor'; source: number; levels: number[]; if?: Condition; filter: CardFilter; /** lv1 = เท่าเลเวลคอสต์ Lv1 ของแต่ละการ์ด */ min: number | 'lv1'; /** BS15 โยโรอิฟุคุโร: เฉพาะการ์ดนี้ */ self?: true; /** BS16 "โดยเอฟเฟกต์ของผู้เล่นทุกคน" (ไม่ระบุ = เฉพาะคู่แข่ง) */ anyPlayer?: true }
  /** BS16 อาพาโท: การ์ดของเราที่ตรงตัวกรองบนสนาม ถือว่ามีคอสต์ cost */
  | { kind: 'allyCostSet'; source: number; levels: number[]; if?: Condition; filter: CardFilter; cost: number }
  /** BS16 เวลซันดี: การ์ดของเราที่ตรงตัวกรองที่ถูกวางที่แทรชโดย U Trigger ของคู่แข่ง ถือว่าคอสต์ +amount (เทียบฮิต) */
  | { kind: 'uTriggerCostBoost'; source: number; levels: number[]; if?: Condition; filter: CardFilter; amount: number }
  /** BS17 เซเบอร์เซเซริ: การ์ดนี้ถูกวางจากเด็คเราที่แทรชโดย U Trigger ของอัลติเมทคอสต์ไม่เกิน maxCost ของคู่แข่ง = Guard (ไม่ฮิต) */
  | { kind: 'uTriggerGuard'; source: number; levels: number[]; maxCost: number }
  /**
   * BS26 Trigger Counter (การ์ดในมือ): เมื่อ U Trigger ของคู่แข่งฮิต ก่อนผลฮิตทำงาน
   * เบรฟ/สปิริต = จ่ายคอสต์อัญเชิญ แล้วทำ steps (ถ้าอยู่บนสนาม) · เมจิค = จ่ายคอสต์ใช้ แล้วทำ steps (ลงแทรช)
   */
  | { kind: 'triggerCounter'; source: number; levels: number[]; steps: Step[] }
  /** BS26 ซิกเฟซุล: เมื่อการ์ดนี้ตกเป็นเป้าของเอฟเฟกต์คู่แข่ง สามารถทิ้งการ์ดในมือ 1 ใบเพื่อไม่รับผลเอฟเฟกต์นั้น (key = ใช้ได้ตามเงื่อนไข if เช่น usedFewerThan) */
  | { kind: 'targetDodge'; source: number; levels: number[]; if?: Condition; key: string }
  /** BS26 จุดเชื่อมกาลอวกาศ A-01: สปิริตคอสต์ต่ำกว่า min ไม่นับในเงื่อนไขอัญเชิญของอัลติเมท (ผู้เล่นทุกคน) */
  /** BS26 เมืองแห่งความโศก โทรเมอา: อัญเชิญเบรฟจากมือด้วย Trigger Counter ไม่ต้องจ่ายคอสต์ */
  | { kind: 'triggerCounterFree'; source: number; levels: number[] }
  /** BS26 เอคิดนา: ใช้ Trigger Counter ของการ์ดเมจิคของเราได้โดยไม่ต้องจ่ายคอสต์ */
  | { kind: 'triggerCounterMagicFree'; source: number; levels: number[]; if?: Condition }
  /** BS26 พาร์ฟูม: การ์ดของเราที่ตรงตัวกรองไม่ถูกป้องกันโดยการ์ดประเภทนี้ของคู่แข่ง */
  | { kind: 'alliesUnblockableBy'; source: number; levels: number[]; if?: Condition; filter: CardFilter; by: 'spirits' | 'ultimates' }
  /** BS26 วาร์โกเบรฟ: การ์ดของคู่แข่งที่ตรงตัวกรองโจมตีไม่ได้ (granted = ผู้ร่วมร่างได้รับ) */
  | { kind: 'opponentAttackBan'; source: number; levels: number[]; if?: Condition; filter: CardFilter; granted?: true }
  /** BS26 ชิโรคาบุโตะ: การ์ดของคู่แข่งที่ตรงตัวกรองคอสต์ +amount (ลบได้) */
  | { kind: 'opponentCostBoost'; source: number; levels: number[]; if?: Condition; filter: CardFilter; amount: number }
  /** BS26 ชิโรคาบุโตะ: การ์ดของเราที่ตรงตัวกรองไม่ถูกป้องกันโดยการ์ดคู่แข่งที่เสื่อมสภาพ */
  | { kind: 'unblockableByExhausted'; source: number; levels: number[]; if?: Condition; filter: CardFilter }
  | { kind: 'summonConditionMinCost'; source: number; levels: number[]; if?: Condition; min: number }
  /** BS16 เวลซันดี: รีเฟรชสเต็ปของคู่แข่ง เราก็ทำรีเฟรชสเต็ปด้วย */
  | { kind: 'refreshWithOpponent'; source: number; levels: number[] }
  /** BS16 โนวา-เรมแนนต์: สปิริตทั้งหมดจะร่วมร่างไม่ได้ */
  | { kind: 'noBraving'; source: number; levels: number[] }
  /** BS16 ไอนี่: การ์ดนี้ในมือ ใน [ดรอว์สเต็ปของเรา] สามารถทิ้งการ์ดนี้ เพื่อจำนวนจั่ว +amount */
  | { kind: 'handDrawBoost'; source: number; levels: number[]; amount: number }
  /** บรรทัดที่ไม่มีผลเอง (ผลอยู่ในสคริปต์ของการ์ดอื่น เช่น โฟคาลอร์ → เบลเซบีท) */
  | { kind: 'textOnly'; source: number; levels: number[] }
  /** BS16 เอ็นเตอร์ไพรซ์: เอฟเฟกต์ [เมื่อสปิริตนี้ป้องกัน] ของสปิริตเราทั้งหมด ทำงานเมื่อโจมตีด้วย */
  | { kind: 'blockTriggersOnAttack'; source: number; levels: number[]; if?: Condition }
  /** BS16 ลานล่าของมังกรติดเกราะ: เมนสเต็ปของคู่แข่ง "เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ" ของการ์ดคู่แข่งไม่ทำงาน */
  | { kind: 'opponentNoSummonTriggers'; source: number; levels: number[] }
  /** BS16 ไวท์แคร็ก: การ์ดนี้ในมือ ระหว่างที่คู่แข่งไม่ได้เซ็ทเบิร์ส ได้รับสัญลักษณ์ลดคอสต์เพิ่ม */
  | { kind: 'handReductionBonus'; source: number; levels: number[]; reduction: Partial<Record<SymbolColor, number>>; ifOpponentNoBurst?: true }
  /** BS16 แนวกางเขนแห่งดวงดาว: การ์ดในมือที่ตรงตัวกรอง สัญลักษณ์ลดคอสต์สี from count เม็ด ถือว่าเป็นสี to ด้วย */
  | { kind: 'reductionAlso'; source: number; levels: number[]; filter: CardFilter; from: SymbolColor; to: SymbolColor; count: number }
  /** แอทแท็คสเต็ปของคู่แข่ง: สปิริตนี้ป้องกันสปิริตที่ BP น้อยกว่าสปิริตนี้ไม่ได้ */
  | { kind: 'cannotBlockLowerBp'; source: number; levels: number[] }
  /** ขณะทำการ Showdown สปิริตนี้ BP+amount */
  | { kind: 'showdownBp'; source: number; levels: number[]; amount: number }
  /** สีของการ์ดนี้ถือว่าเป็นสีนี้ด้วย (ใช้คู่กับ symbolAlsoColor ถ้าเจ็มด้วย) */
  | { kind: 'colorAlso'; source: number; levels: number[]; color: Color }
  /** สปิริตของเราที่ตรงตัวกรองทั้งหมดได้รับ [Evolution] */
  | { kind: 'grantEvolution'; source: number; levels: number[]; filter: CardFilter }
  /** ผู้เล่นทุกคนนำคอร์จากวอยด์มาวางที่ไลฟ์ไม่ได้ */
  | { kind: 'noLifeFromVoid'; source: number; levels: number[]; /** BS15 ประตูชัย: เฉพาะคู่แข่ง */ opponentOnly?: true }
  // ---------------- BS09
  /** ถ้าเงื่อนไขจริง สปิริตนี้ได้รับเผ่านี้ */
  /** BSC02 ชุดตุ๊กตาเพนต้น: การ์ดนี้ (granted = ผู้ร่วมร่าง) เป็นทีมเหล่านี้ด้วย */
  | { kind: 'teamAlso'; source: number; levels: number[]; teams: string[]; granted?: true }
  | { kind: 'familyAlso'; source: number; levels: number[]; if?: Condition; family: string; /** BSC04 ชุดซานต้า: เบรฟให้ผู้ร่วมร่าง */ granted?: true; /** BS10: การ์ดของเราที่ตรงตัวกรองได้รับแทน (ไม่ใช่ตัวการ์ดนี้) */ allies?: CardFilter }
  /** การ์ดของเราที่ตรงตัวกรอง ใช้โซลคอร์ร่วมจ่ายคอสต์อัญเชิญ เพื่ออัญเชิญโดยไม่สนเงื่อนไข (《เงื่อนไขอัญเชิญ》) ได้ */
  | { kind: 'ignoreSummonCondition'; source: number; levels: number[]; filter: CardFilter; /** BS26 ฮิโนโกะ: ไม่สนเงื่อนไขอัญเชิญเลย (ไม่ต้องจ่ายด้วยโซลคอร์) */ always?: true }
  /** BS26 ประกายแห่งซูเปอร์โนวา: ตอนอัญเชิญการ์ดที่ตรง filter อัลติเมทของเราถือว่าเป็นสปิริตด้วย (นับในเงื่อนไขอัญเชิญ) */
  | { kind: 'ultimatesAsSpiritsForSummon'; source: number; levels: number[]; filter: CardFilter; ownMainStepOnly?: true }
  /** [เอฟเฟกต์ทำลายคอสต์] (ทำลายคอสต์ไม่เกิน N) ของสปิริต/อัลติเมทของเราที่ตรงตัวกรอง ทำลายได้เพิ่ม +amount คอสต์ */
  | { kind: 'destroyCostBoost'; source: number; levels: number[]; if?: Condition; filter: CardFilter; amount: number }
  /** สปิริตของเราที่ตรงตัวกรองทั้งหมดถือว่าเป็น Lv สูงสุด (ownAttackStepOnly = แอทแท็คสเต็ปของเรา) */
  | { kind: 'maxLevelAllies'; source: number; levels: number[]; filter: CardFilter; ownAttackStepOnly?: true; /** BSC04 เวนดี้-เคท: ระหว่างที่เงื่อนไขเป็นจริง */ if?: Condition }
  /** การ์ดในแทรชของผู้เล่นทุกคนไม่รับผลเอฟเฟกต์อื่นและใช้เอฟเฟกต์ของการ์ดนั้นไม่ได้ (เมียวโอสยบมาร) */
  | { kind: 'trashLock'; source: number; levels: number[] }
  /** BSC03 เบรดร้า: เจ็มอัลติเมททั้งหมดของเรา ถือว่าเป็นเจ็มสีเหล่านี้ด้วย */
  | { kind: 'ultimateSymbolsAlso'; source: number; levels: number[]; if?: Condition; colors: Color[] }
  /** BSC03 ดอน ดิเอกอด: ผู้เล่นทุกคนเพิ่มคอร์จากวอยด์ด้วยเอฟเฟกต์ของสปิริตไม่ได้ */
  | { kind: 'noVoidGainBySpirits'; source: number; levels: number[] }
  /** BSC03 กิ-กาชา: คอสต์ Lv1 ของการ์ดของเราที่ตรงตัวกรองเป็น 0 (ไม่ถูกเปลี่ยนด้วยเอฟเฟกต์อื่น) */
  | { kind: 'lv1CostZero'; source: number; levels: number[]; filter: CardFilter }
  /** คู่แข่งนำการ์ดในแทรชกลับขึ้นมือไม่ได้ */
  | { kind: 'opponentNoTrashReturn'; source: number; levels: number[] }
  /** แอทแท็คสเต็ปของผู้เล่นทุกคน: สปิริต/อัลติเมทที่มีคอร์ 1 เม็ดโจมตี/ป้องกันไม่ได้ */
  | { kind: 'oneCoreNoBattle'; source: number; levels: number[] }
  /** แอทแท็คสเต็ปของคู่แข่ง: คู่แข่งโจมตีได้ต่อเมื่อส่งคอร์ cores เม็ดบนตัวที่สั่งโจมตีลงแทรช */
  | { kind: 'attackTax'; source: number; levels: number[]; cores: number }
  /** แอทแท็คสเต็ปของเรา: คู่แข่งจะใช้งานการ์ดเมจิค/สั่งใช้เบิร์สได้ต่อเมื่อจ่ายคอสต์เพิ่ม amount (จินเบร์) */
  | { kind: 'magicBurstTax'; source: number; levels: number[]; if?: Condition; amount: number }
  // ---------------- BS10
  /** แอทแท็คสเต็ปของผู้เล่นทุกคน: เบิร์สของเราถูกทิ้งไม่ได้ */
  | { kind: 'burstProtect'; source: number; levels: number[] }
  /** แอทแท็คสเต็ปของผู้เล่นทุกคน: สปิริตทั้งหมดของคู่แข่งที่ต่อสู้อยู่ BP+amount (ลบ = ลด) */
  | { kind: 'oppBattleBp'; source: number; levels: number[]; amount: number }
  /** สิงโตควันม่วง: เมื่ออัญเชิญการ์ดนี้ (จากมือ) ทิ้งใบบนสุดเด็คเราได้ไม่เกิน max ใบ ใบละ คอสต์ -1 */
  | { kind: 'millCostReduce'; source: number; max: number }
  /** ผู้เล่นทุกคน: อัญเชิญการ์ดสปิริต/เบรฟที่ไม่ใช่สีม่วงโดยเอฟเฟกต์ ต้องจ่ายคอสต์เพิ่ม cost */
  | { kind: 'effectSummonTax'; source: number; levels: number[]; cost: number }
  /** โฮเนะสุมิ: เอฟเฟกต์ "จบแอทแท็คสเต็ป" ของเมจิคคู่แข่ง → ส่งโซลคอร์บนการ์ดนี้ลงแทรช = ไร้ผล ถ้าคู่แข่งไม่จ่ายเพิ่ม cost */
  | { kind: 'counterEndAttackStep'; source: number; levels: number[]; cost: number }
  /** อิกคาคุ Lv3: เบิร์สที่ถูกทิ้งโดยเอฟเฟกต์ของสปิริตนี้ → สั่งใช้เอฟเฟกต์เบิร์สนั้นได้ (ห้ามอัญเชิญ/วาง/จ่ายแฟลช) */
  | { kind: 'useDiscardedBurst'; source: number; levels: number[] }
  // ---------------- BS11
  /**
   * คอสต์ในมือของการ์ดที่ตรงตัวกรอง +delta ต่อสปิริตของเราที่ตรง per 1 ตัว
   * self = การ์ดนี้ในมือ (ไม่ดูเลเวล) · ไม่ใส่ = การ์ดบนสนามให้ผลกับการ์ดในมือ
   */
  | { kind: 'handCostPer'; source: number; levels: number[]; filter: CardFilter; per: CardFilter; delta: number; self?: true }
  /** แอทแท็คสเต็ปของผู้เล่นทุกคน: สีและเจ็มของสปิริต/อัลติเมท/เน็กซัสทั้งหมดกลายเป็นสีนี้ (ยาเท็นโดว) */
  | { kind: 'allColorAttackStep'; source: number; levels: number[]; color: Color }
  /** สปิริตนี้จะไม่ถูกทำลาย (ทุกกรณี) ถ้าเงื่อนไขเป็นจริง */
  | { kind: 'indestructible'; source: number; levels: number[]; if?: Condition }
  /** เราเป็นผู้เลือกระบุสปิริตของคู่แข่งใน Showdown ของเรา (โกวจิน) */
  | { kind: 'showdownWeChoose'; source: number; levels: number[] }
  /** แอทแท็คสเต็ปของผู้เล่นทุกคน: สปิริตคู่แข่งที่จะกลับขึ้นมือโดยเอฟเฟกต์ของเรา → ส่งโซลคอร์ลงแทรช เพื่อไปไว้บนสุด/ใต้สุดเด็คแทน (กู๊ดลัคฮิล) */
  | { kind: 'bounceRedirect'; source: number; levels: number[] }
  /** [เอฟเฟกต์ทำลาย BP] ของการ์ดเราที่ชื่อมีคำเหล่านี้ ขอบเขต +amount (pierceShield = Ultra Shield ป้องกันไม่ได้) */
  | { kind: 'bpDestroyBoost'; source: number; levels: number[]; /** ไม่ระบุ = ทุกการ์ดของเรา */ nameIncludes?: string[]; amount: number; pierceShield?: true; ownAttackStepOnly?: true; /** BS12 */ if?: Condition; /** BS12: เฉพาะเอฟเฟกต์ของการ์ดเราประเภทเหล่านี้ (Charge "ไม่ใช่ของอัลติเมท" / "ของสปิริต/เบรฟ/เมจิค") */ fromTypes?: CardType[]; /** BS12: Brave ให้ผู้ร่วมร่าง */ granted?: true }
  /** สปิริตของเราที่ตรงตัวกรองทั้งหมดมี Lv / BP / เจ็ม เหมือนการ์ดนี้ (ฮะจิริว) */
  | { kind: 'copyStatsAllies'; source: number; levels: number[]; if?: Condition; filter: CardFilter }
  // ---------------- BS12
  /** สปิริตของเราที่ตรงตัวกรองทั้งหมด จะไม่กลับขึ้นมือ/เข้ากองจากบนฟิลด์โดยเอฟเฟกต์ของคู่แข่ง */
  | { kind: 'bounceImmuneAllies'; source: number; levels: number[]; filter: CardFilter }
  /** คาเมะมิสึ: เมนสเต็ปของเรา เมื่ออัญเชิญการ์ดชื่อเหล่านี้ เสื่อมสภาพเน็กซัสของเรากี่ใบก็ได้ ใบละ = จ่ายแล้ว 1 คอสต์ */
  | { kind: 'nexusExhaustPay'; source: number; levels: number[]; names: string[] }
  /** โดจิ ห้ามงคล: เอฟเฟกต์ [เมื่อสปิริตนี้ถูกอัญเชิญ] ของสปิริตทั้งหมดของผู้เล่นทุกคนไม่ทำงาน */
  | { kind: 'noSummonTriggers'; source: number; levels: number[] }
  /** กันดาละ-ไฮดรา: แอทแท็คสเต็ปของเรา Assault ของสปิริตเรานำเน็กซัสในแทรชกลับขึ้นมือแทนการเสื่อมสภาพเน็กซัสได้ */
  | { kind: 'assaultTrashNexus'; source: number; levels: number[] }
  /**
   * คู่แข่งสั่งใช้เบิร์ส/ใช้งานการ์ดเมจิคไม่ได้:
   *  nexusCost = ที่คอสต์เท่ากับคอสต์ของเน็กซัสของเรา (เมียวโอบัวม่วง: แอทแท็คสเต็ปของเรา)
   *  gemColor = นอกจากที่มีสีเดียวกับสีเจ็มบนฟิลด์ของคู่แข่งเอง (อาบิส-อโพคาลิพส์)
   */
  | { kind: 'burstMagicBan'; source: number; levels: number[]; mode: 'nexusCost' | 'gemColor'; ownAttackStepOnly?: true; granted?: true; /** BS15 ประตูชัย: ห้ามเฉพาะเมจิค (เบิร์สสั่งใช้ได้) */ magicOnly?: true }
  /** Charge: [เอฟเฟกต์ทิ้งเด็คคู่แข่ง] ที่ไม่ใช่ของอัลติเมทของเรา จำนวนทิ้ง +amount */
  | { kind: 'millBoost'; source: number; levels: number[]; amount: number; granted?: true }
  /** ทรูธ-อีเด็น: การ์ดนี้อัญเชิญไม่ได้ถ้าไม่จ่ายอย่างน้อย min คอสต์ (อัญเชิญไม่จ่ายคอสต์ไม่ได้) */
  | { kind: 'minSummonPay'; source: number; min: number }
  /** โอคุริดาระ: [ร่วมร่าง] เบรฟนี้ถือว่ามีคอสต์ cost */
  | { kind: 'braveCostAs'; source: number; levels: number[]; cost: number; granted: true }
  /** แคพิทัลแคพิทัล: แอทแท็คสเต็ปของคู่แข่ง สปิริต/อัลติเมทที่ไม่มีโซลคอร์จะโจมตีได้ต่อเมื่อส่งคอร์ในรีเสิร์ฟ cores เม็ดลงแทรช (+soulBonus ถ้าการ์ดนี้มีโซลคอร์) */
  | { kind: 'attackReserveTax'; source: number; levels: number[]; cores: number; soulBonus: number; /** BS26 ทะเลสายฟ้า: เฉพาะการ์ดคู่แข่งที่ตรงตัวกรอง (มีโซลคอร์ก็ต้องจ่าย) */ filter?: CardFilter }
  // ---------------- BS13
  /** อิจิบันสเปียร์: การ์ดในมือเราที่ตรงตัวกรองทั้งหมดถือว่ามีคอสต์ cost */
  | {
      kind: 'handCostSet';
      source: number;
      levels: number[];
      filter: CardFilter;
      /** life = เท่ากับจำนวนไลฟ์ของเรา (เทนคาฟุบุ) */
      cost: number | 'life';
      if?: Condition;
    }
  /** สถานที่ศักดิ์สิทธิ์ต้องห้าม: ต่อ 1 เทิร์น เด็คเราถูกทิ้งโดยเอฟเฟกต์ของคู่แข่งได้มากสุด max ใบ */
  | { kind: 'millCap'; source: number; levels: number[]; max: number }
  /** มิดไนท์-ซัน: [ร่วมร่าง] Rush ของผู้ร่วมร่างไม่สนเงื่อนไข */
  | { kind: 'rushIgnore'; source: number; levels: number[]; granted: true }
  // ---------------- BS14
  /** "สปิริต/อัลติเมทของเราที่ตรงตัวกรอง ถือว่ามีเลเวลสูงขึ้น amount เลเวล" (ไม่เกินเลเวลสูงสุดของการ์ด) */
  | { kind: 'levelPlus'; source: number; levels: number[]; filter: CardFilter; amount: number; if?: Condition }
  /** คิงรู: "เมื่อสปิริต BP ไม่เกิน maxBp ถูกทำลาย ผู้เล่นทุกคนสั่งใช้เบิร์ส 'หลังจากสปิริตของเราถูกทำลายโดยคู่แข่ง' ไม่ได้" */
  | { kind: 'destroyBurstBan'; source: number; levels: number[]; maxBp: number }
  /** เอคลิปส์ ดราก้อน: แอทแท็คสเต็ปของผู้เล่นทุกคน การโจมตีของสปิริตคอสต์ไม่เกิน maxCost ไลฟ์ของผู้เล่นทุกคนไม่ลดลง */
  | { kind: 'lifeImmuneLowCost'; source: number; levels: number[]; maxCost: number }
  /**
   * คิงฟอร์เทรส: สปิริตของเราที่ตรงตัวกรอง เมื่อจะสูญสลายโดยเอฟเฟกต์ที่ไม่ใช่ของอัลติเมทของคู่แข่ง
   * นำคอร์จากรีเสิร์ฟมาวางให้ถึง Lv1 แล้วอยู่ต่อในรูปแบบฟื้นสภาพ (ทำเองเมื่อรีเสิร์ฟพอ)
   */
  | {
      kind: 'depletionSave';
      source: number;
      levels: number[];
      filter: CardFilter;
      /** BSC01 ทัวร์มาลีนดรากูน: การ์ดนี้เอง เมื่อจะสูญสลายโดยคู่แข่ง (ทุกเอฟเฟกต์) นำคอร์จากวอยด์ 1 เม็ดมาวาง อยู่ต่อแบบเสื่อมสภาพ · เลเวล = ก่อนถูกถอดคอร์ */
      selfVoid?: true;
      /** BS26 เนินโซลูจ: "สามารถ" นำคอร์ไลฟ์เรา 1 เม็ดมาวาง อยู่ต่อแบบฟื้นสภาพ (ถามเจ้าของ: ระหว่างถาม การ์ดยังไม่สูญสลาย) */
      lifeCore?: true;
    }
  // ---------------- BS13 หกเทพพิสุทธิ์
  /** เจียส: คอร์ที่ได้รับในคอร์สเต็ปของเรา +amount */
  | { kind: 'coreStepBonus'; source: number; levels: number[]; amount: number; if?: Condition; /** "ไม่แสดงผลซ้ำซ้อน": การ์ดชื่อเดียวกันนับครั้งเดียว */ noStack?: true }
  /** BS17 อาซาเอล: ตอนตัดสินผลการต่อสู้ ถ้าผู้โจมตีของคู่แข่งมี BP ไม่เกิน maxBp ไลฟ์ของเราไม่ลด */
  /** BS17 ออริฮาลคอน โกเล็ม: การ์ดของเราที่ตรงตัวกรองถือว่ามีคีย์เวิร์ด/ข้อความนี้ (ตัวกรอง textIncludes เห็นด้วย) */
  | { kind: 'grantText'; source: number; levels: number[]; if?: Condition; filter: CardFilter; text: string; /** ตัวที่ให้เองไม่ได้รับ (ออริฮาลคอน โกเล็ม: เจ้าของโปรเจกต์กำหนด) */ excludeSelf?: true }
  /** BS17 ธงโจรสลัดมังกรสามหัว: สปิริตที่มี Summon Bolt ของเราที่ถูกทำลายจากการเทียบ BP ยังใช้ Summon Bolt ได้ */
  | { kind: 'summonBoltOnBattleLoss'; source: number; levels: number[]; if?: Condition }
  | { kind: 'lowBpLifeShield'; source: number; levels: number[]; if?: Condition; maxBp: number }
  /** BS17 ออร์แกนปีกทองคำ: การ์ดในเด็คเราถูกวางที่แทรชโดย U Trigger ของคู่แข่ง สามารถทิ้งการ์ดใต้การ์ดนี้ 1 ใบ เพื่อให้การ์ดนั้นคอสต์ +amount */
  | { kind: 'uTriggerUnderBoost'; source: number; levels: number[]; if?: Condition; amount: number }
  /** เอล-ราฟิล: ไลฟ์ของเราเป็น 0 แล้วยังไม่แพ้ (เงื่อนไขหายไปตอนไลฟ์ 0 = แพ้ทันทีที่จบ action) */
  | { kind: 'noLoseAtZeroLife'; source: number; levels: number[]; if?: Condition }
  /** เอล-ราฟิล: สปิริต/อัลติเมทของคู่แข่งทั้งหมดกลายเป็น BP0 */
  | { kind: 'opponentBpZero'; source: number; levels: number[]; if?: Condition }
  /** ดรากุ-แม็กนา: เจ็มของการ์ดของเราที่ตรงตัวกรองทั้งหมดกลายเป็นเจ็มสี color จำนวน count เม็ด (แทนเจ็มทั้งหมดรวมเบรฟ) */
  | { kind: 'symbolOverrideAllies'; source: number; levels: number[]; if?: Condition; filter: CardFilter; color: Color; count: number }
  /** ชโตรม-ไฮด์: ผู้เล่นทุกคน เพิ่มการ์ดในมือจากเด็ค / เพิ่มคอร์จากวอยด์ ด้วยเอฟเฟกต์ที่ไม่ใช่สี color ไม่ได้ */
  | { kind: 'gainLockExceptColor'; source: number; levels: number[]; color: Color }
  // ---------------- BS14 ม่วง
  /** เธิร์ดอายส์ สเนก: คอร์ที่คู่แข่งจะนำจากวอยด์มาเพิ่มโดยเอฟเฟกต์ ถูกนำมาวางบนสปิริตนี้แทน */
  | { kind: 'stealOpponentVoid'; source: number; levels: number[] }
  /** ควีน เมดูค: สปิริตของเราที่ตรงตัวกรองทำให้ไลฟ์คู่แข่งลดลง (โจมตี) = คอร์ไลฟ์ไปวอยด์แทนรีเสิร์ฟ/แทรช */
  | { kind: 'lifeToVoidOnHit'; source: number; levels: number[]; filter: CardFilter }
  // ---------------- BS15 เขียว
  /** ไนท์อีเกิล: สปิริตร่างแยกทั้งหมดของเรา BP ของ Lv1 ถือว่าเป็น bp */
  | { kind: 'cloneBp'; source: number; levels: number[]; bp: number }
  /** ดังกาโร: เมื่อเราจะสร้างสปิริตร่างแยก สามารถวางคอร์จากวอยด์ 1 เม็ดแทนคอร์จากรีเสิร์ฟ (ไม่แสดงผลซ้ำซ้อน) */
  | { kind: 'cloneVoidCore'; source: number; levels: number[] }
  // ---------------- BS15 เหลือง
  /** หอสมุดคัมภีร์: สปิริตของผู้เล่นทุกคนจะไม่ฟื้นสภาพโดยเอฟเฟกต์ */
  | { kind: 'noEffectRefresh'; source: number; levels: number[] }
  /** หอสมุดคัมภีร์ Lv2: แอทแท็คสเต็ปของเรา จั่วการ์ดด้วยเอฟเฟกต์เมจิคของเรา → สามารถเสื่อมสภาพเน็กซัสนี้ เพื่อจั่ว 2 เท่า (ไม่ซ้อน) */
  | { kind: 'magicDrawDouble'; source: number; levels: number[] }
  // ---------------- BS15 ฟ้า
  /** ร็อคโกเล็ม: แอทแท็คสเต็ปของผู้เล่นทุกคน สปิริตที่ตรงตัวกรองของผู้เล่นทุกคนโจมตีได้เทิร์นละ 1 ครั้ง */
  | { kind: 'attackOncePerTurn'; source: number; levels: number[]; filter: CardFilter }
  /** คาสเซิลโกเล็ม: แอทแท็คสเต็ปของเรา "เด็คจะไม่ถูกทิ้ง" ของสปิริตคอสต์ไม่เกิน maxCost / เน็กซัส ของคู่แข่งไม่มีผล */
  | { kind: 'ignoreOppNoMill'; source: number; levels: number[]; maxCost: number }
  // ---------------- BSC04
  /** เซฟี่-แอริส: เมนสเต็ปของผู้เล่นทุกคน การ์ดที่ตรงตัวกรองที่ผู้เล่นคนใดก็ได้อัญเชิญ ลงสนามในรูปแบบเสื่อมสภาพ */
  | { kind: 'summonExhausted'; source: number; levels: number[]; filter: CardFilter }
  /** กาแล็กซี่เอ็กซ์โป: วางคอร์บนการ์ดนี้ไม่ได้ นอกจากเอฟเฟกต์ของการ์ดนี้เอง (รวมตอนวาง) */
  | { kind: 'coreLock'; source: number }
  /** ไดอาน่า-เฟลอร์ X: คู่แข่งให้เบรฟอยู่ในรูปแบบสปิริตไม่ได้ (อัญเชิญเป็นสปิริต / แยกร่าง / อยู่ต่อหลังร่างต้นออกจากสนาม = ไม่ได้ · ร่วมร่างโดยตรงได้) */
  | { kind: 'oppNoBraveSpirit'; source: number; levels: number[] };

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
    const textOf = (i: number): string => {
      const e = card.effects?.[i] as { text?: unknown } | undefined;
      return typeof e?.text === 'string' ? e.text : '';
    };
    const abilities = script.flatMap((a, source) =>
      a ? (Array.isArray(a) ? a : [a]).map((x) => spiritWording({ ...x, source } as Ability, textOf(source))) : [],
    );
    return { ...card, abilities };
  });
}

// ---------------------------------------------------------------- อัลติเมทไม่ใช่สปิริต

/** ข้อความพูดถึงอัลติเมท (ไม่นับ "อัลติเมทนี้" / เจ็มอัลติเมท / ชื่อการ์ดในเครื่องหมายคำพูด) */
export function mentionsUltimate(text: string): boolean {
  const t = text.replace(/"[^"]*"|“[^”]*”|「[^」]*」/g, '').split('เจ็มอัลติเมท').join('');
  return /อัลติเมท(?!นี้)/.test(t);
}

/** มีคำว่า "สปิริต" ที่หมายถึงสปิริตอย่างเดียว (ไม่ใช่ "สปิริต/อัลติเมท" / "สปิริตนี้" / "การ์ดสปิริต") */
export function hasBareSpirit(text: string): boolean {
  const t = text.replace(/"[^"]*"|สปิริต\s*\/\s*อัลติเมท|อัลติเมท\s*\/\s*สปิริต|สปิริต(?:และ|หรือ)อัลติเมท|สปิริตนี้|การ์ดสปิริต/g, '');
  return t.includes('สปิริต');
}

/** ท่อนเงื่อนไขของ trigger/เบิร์ส ("เมื่อสปิริตของคู่แข่งโจมตี" / "หลังจากสปิริตเราถูกทำลาย...") หมายถึงสปิริตอย่างเดียว */
export function clauseSpiritsOnly(text: string): boolean {
  const m = /(?:เมื่อ|หลังจาก)[^,:\]】)]*/.exec(text);
  if (!m) return false;
  const c = m[0];
  // "สปิริต/อัลติเมทนี้" = ครอบคลุมอัลติเมทด้วย (mentionsUltimate ข้าม "อัลติเมทนี้" ไว้ จึงต้องเช็กรูปทับก่อน · ออริฮาลคอน โกเล็ม: Crush ที่ให้ [ทหารสังเคราะห์])
  if (/สปิริต\s*\/\s*อัลติเมท|อัลติเมท\s*\/\s*สปิริต/.test(c)) return false;
  return c.includes('สปิริต') && !mentionsUltimate(c) && !c.includes('เน็กซัส') && !c.includes('การ์ด');
}

/** trigger ที่ต้นเหตุ (subject) เป็นสปิริตบนสนามเสมอ (เติม subject.types ได้โดยไม่ทำให้ trigger เงียบ) */
const SPIRIT_SUBJECT_EVENTS = new Set<TriggerEvent>([
  'allyAttack',
  'allyAttackHitLife',
  'allyDestroyed',
  'allySummoned',
  'allyBlocked',
  'allyExhausted',
  'oppExhausted',
  'oppAttack',
  'allyOnStage',
  'allyBlock',
  'allyWonBattle',
  'allyBouncedByOpponent',
  'oppDepleted',
  'allyBattleEnd',
  'allyDepletedByOpponent',
  'oppSpiritDestroyed',
]);
/** เงื่อนไขเบิร์สที่มีสปิริตต้นเหตุ */
const SPIRIT_SUBJECT_BURSTS = new Set<BurstEvent>(['afterAllyDestroyedByOpponent', 'afterAllyDepletedByOpponent', 'afterOpponentAttack']);
const SPIRIT_TYPES: CardType[] = ['spirit', 'brave'];
/** คีย์เงื่อนไขที่ไม่ระบุประเภท = นับสปิริต/อัลติเมท/เบรฟบนสนาม */
const SPIRIT_FILTER_CONDS = ['allyHas', 'otherAllyHas', 'opponentHas'] as const;

/** ไล่ทั้งความสามารถ: ตัด 'ultimate' ออกจาก types ที่เป็นสปิริต/อัลติเมท + เงื่อนไขนับสปิริตที่ไม่ระบุประเภท = ไม่รวมอัลติเมท */
function stripUltimates(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripUltimates);
  if (!v || typeof v !== 'object') return v;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) o[k] = stripUltimates(x);
  const types = o.types;
  if (
    Array.isArray(types) &&
    types.includes('spirit') &&
    types.includes('ultimate') &&
    types.every((t) => t === 'spirit' || t === 'ultimate' || t === 'brave')
  )
    o.types = types.filter((t) => t !== 'ultimate');
  for (const k of SPIRIT_FILTER_CONDS) {
    const f = o[k] as Record<string, unknown> | undefined;
    // "ถ้ามี [ชื่อการ์ด] ของเราอยู่" = อ้างชื่อ ไม่ใช่ "สปิริต" (ชื่ออาจเป็นอัลติเมท)
    if (f && typeof f === 'object' && !f.types && !f.names && !f.nameIncludes) o[k] = { ...f, types: SPIRIT_TYPES };
  }
  const m = o.alliesMatchAtLeast as { filter?: Record<string, unknown> } | undefined;
  if (m?.filter && !m.filter.types) o.alliesMatchAtLeast = { ...m, filter: { ...m.filter, types: SPIRIT_TYPES } };
  if (typeof o.alliesAtLeast === 'number' && Object.keys(o).length === 1) return { alliesMatchAtLeast: { count: o.alliesAtLeast, filter: { types: SPIRIT_TYPES } } };
  return o;
}

/**
 * อัลติเมทไม่ใช่สปิริต (ปรับสคริปต์ตามข้อความการ์ดตอนผูก ไม่ต้องเขียนในสคริปต์เอง):
 * - บรรทัดที่ไม่พูดถึงอัลติเมท = spiritsOnly (engine: step ที่ไม่ระบุประเภทเลือก/นับเฉพาะสปิริต) + ตัด ultimate ออกจาก types สปิริต/อัลติเมท
 * - บรรทัดที่มีทั้ง "สปิริต" เดี่ยว ๆ และ "สปิริต/อัลติเมท" = spiritsOnly (ส่วนที่เป็นอัลติเมทสคริปต์ต้องระบุ types เอง)
 * - ท่อน "เมื่อสปิริต..." ของ trigger = ต้นเหตุต้องเป็นสปิริต · ท่อน "หลังจากสปิริต..." ของเบิร์ส = subjectSpiritsOnly
 */
function spiritWording(ab: Ability, text: string): Ability {
  if (!text) return ab;
  let out = ab;
  const scripted = out.spiritsOnly !== undefined;
  if (!mentionsUltimate(text)) out = { ...(stripUltimates(out) as Ability), ...(scripted ? {} : { spiritsOnly: true }) };
  else if (!scripted && hasBareSpirit(text)) out = { ...out, spiritsOnly: true };
  if (!clauseSpiritsOnly(text)) return out;
  if (out.kind === 'trigger') {
    const on = Array.isArray(out.on) ? out.on : [out.on];
    if (on.every((e) => SPIRIT_SUBJECT_EVENTS.has(e)) && !out.subject?.types) out = { ...out, subject: { ...out.subject, types: SPIRIT_TYPES } };
    else if (out.subject?.types) out = { ...out, subject: stripUltimates(out.subject) as typeof out.subject };
  }
  if (out.kind === 'burst' && (SPIRIT_SUBJECT_BURSTS.has(out.on) || out.alsoDepleted)) out = { ...out, subjectSpiritsOnly: true };
  return out;
}
