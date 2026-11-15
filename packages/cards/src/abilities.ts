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
  /** เอฟเฟกต์ (Burst) นี้ถูกสั่งใช้โดย [Catalyze] */
  | { catalyzed: true }
  /** การ์ดเจ้าของเอฟเฟกต์มี Core อย่างน้อย N ดวง */
  | { selfCoresAtLeast: number }
  /** มีการ์ดบนมือเจ้าของเอฟเฟกต์อย่างน้อย N ใบ */
  | { handAtLeast: number }
  /** [Catalyze] ใช้ได้: การ์ดนี้มี Soul Core วางอยู่ และ Burst ที่เซ็ทอยู่ของเราเป็น Soul Burst สีนี้ */
  | { catalyzable: Color }
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
  /** กลับเงื่อนไข */
  | { not: Condition };

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
  /** การ์ดมี [Evolution] */
  hasEvolution?: true;
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
  /** สปิริตเราที่ตรง filter ทุกตัว ตัวละ count */
  | 'allAllies';

/** ขั้นตอนของเอฟเฟกต์ ทำตามลำดับ */
export type Step =
  /** เราจั่วการ์ด */
  | { do: 'draw'; count: number; if?: Condition }
  /** ในเทิร์นนี้ สปิริตนี้ BP+ */
  | { do: 'buffSelf'; amount: number; if?: Condition }
  /** ในเทิร์นนี้ เลือกสปิริต/อัลติเมท 1 ตัว (ฝ่ายใดก็ได้) BP+ */
  | { do: 'buffChosen'; amount: number }
  /** สปิริตต้นเหตุ (subject) BP+ ในเทิร์นนี้ */
  | { do: 'buffSubject'; amount: number }
  /** [True-Rage]: คู่แข่งต้องป้องกันถ้าทำได้ (ใช้ระหว่างการต่อสู้) */
  | { do: 'mustBlock'; if?: Condition; subject?: true }
  /** ทำลายการ์ดของคู่แข่งทั้งหมดที่ตรงตัวกรอง */
  | { do: 'destroyAllOpponent'; filter: CardFilter }
  /** แสดงใบบนสุดเด็ค N ใบ เลือก 1 ใบที่ตรงตัวกรองขึ้นมือ ที่เหลือลง Trash */
  | { do: 'revealPickRestTrash'; count: number; filter: CardFilter }
  /** นำการ์ดในแทรชเรา 1 ใบที่ตรงตัวกรอง กลับขึ้นมือ */
  | { do: 'returnFromTrash'; filter: CardFilter; if?: Condition }
  /** เมื่อจบการต่อสู้นี้ จบ Attack Step */
  | { do: 'endAttackStepAfterBattle' }
  /**
   * ในการต่อสู้นี้ ส่งไลฟ์คู่แข่งลงรีเสิร์ฟคู่แข่ง ต่อผู้ป้องกัน 1 ตัวที่ถูกทำลายจากการเทียบ BP
   * onlyConsecutiveBlade = นับเฉพาะเมื่อการต่อสู้นี้ใช้ [Consecutive Blade]
   */
  | { do: 'lifeOnBlockerDestroyed'; amount: number; if?: Condition; onlyConsecutiveBlade?: true }
  /** ส่ง Soul Core บนสปิริตนี้ไปที่แทรชเรา */
  | { do: 'soulToTrash' }
  /** [Consecutive Blade]: คู่แข่งต้องป้องกันด้วย 2 ตัวถ้าทำได้ และต่อสู้พร้อมกัน */
  | { do: 'consecutiveBlade' }
  /**
   * เราเลือกสปิริต/อัลติเมทของคู่แข่งที่จะป้องกันในการต่อสู้นี้ (ไม่เลือกก็ได้, เลือกตัวที่เสื่อมสภาพได้)
   * เลือกได้สูงสุดเท่าจำนวนผู้ป้องกันของการต่อสู้นี้
   */
  | { do: 'chooseBlockers' }
  /** เราเลือกทิ้งการ์ดในมือ N ใบ */
  | { do: 'discard'; count: number; if?: Condition; filter?: CardFilter }
  /** นำ Core จากวอยด์ (Core ใหม่) วางที่ไลฟ์เรา */
  | { do: 'gainLifeFromVoid'; count: number }
  /** Burst: "หลังจากนั้นสามารถจ่ายคอสต์ เพื่อให้เอฟเฟกต์ [Flash] ของการ์ดนี้ทำงาน" (จ่ายหรือไม่ก็ได้) */
  | { do: 'payToUseFlash' }
  /** (engine ใช้ภายใน) เปิด Burst: นำการ์ดออกจากช่อง Burst และลง Trash เมื่อประมวลผลเสร็จ */
  | { do: 'openBurst' }
  /** สปิริตนี้ฟื้นสภาพ */
  | { do: 'refreshSelf' }
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
    }
  /** ถ้าเอฟเฟกต์นี้ทำลายการ์ดที่ตรงเงื่อนไขได้ (BP ตอนถูกทำลาย / ประเภท) ทำ steps ต่อ */
  | { do: 'ifDestroyed'; filter: { minBp?: number; types?: CardType[]; opponent?: true }; steps: Step[] }
  /** ทำลาย Brave ที่ร่วมร่างอยู่ของคู่แข่ง 1 ใบ (เลือก) */
  | { do: 'destroyOpponentBrave'; if?: Condition }
  /** คู่แข่งเลือกทำลายการ์ดของตัวเองที่ตรงตัวกรอง 1 ใบ */
  | { do: 'opponentDestroysOwn'; filter: CardFilter }
  /** สปิริตเราทั้งหมด (ที่ตรงตัวกรอง) BP+ ในเทิร์นนี้ */
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
  | { do: 'summonFromHandFree'; filter: CardFilter; if?: Condition }
  /**
   * ในเทิร์นนี้ เลือกการ์ดของคู่แข่งที่ตรงตัวกรอง BP-amount แล้วทำลายตัวที่ BP กลายเป็น 0
   * count = จำนวนตัว (ไม่ระบุ = 1), countPerAllyFamily = จำนวนตัวเท่าสปิริตเราเผ่านี้
   */
  | { do: 'debuffChosenOpponent'; amount: number; filter: CardFilter; count?: number; countPerAllyFamily?: string; if?: Condition; exclude?: string[] }
  /** ในเทิร์นนี้ การ์ดของคู่แข่งประเภทเหล่านี้ทั้งหมดโจมตีไม่ได้ */
  | { do: 'opponentCannotAttack'; types: CardType[]; if?: Condition }
  /** เสื่อมสภาพสปิริตคู่แข่ง N ตัว (เลือกทีละตัว จากตัวที่ยังฟื้นสภาพ) */
  | { do: 'exhaustOpponent'; count: number; filter?: CardFilter; if?: Condition }
  /** เสื่อมสภาพสปิริตคู่แข่งกี่ตัวก็ได้ BP รวมไม่เกิน maxTotal */
  | { do: 'exhaustOpponentTotalBp'; maxTotal: number }
  /** นำการ์ดคู่แข่ง 1 ใบที่ตรงตัวกรองกลับขึ้นมือ (Core บนการ์ดไปรีเสิร์ฟของเจ้าของ) */
  | { do: 'bounceOpponent'; filter: CardFilter }
  /** นำ Core จากวอยด์มาวาง */
  | { do: 'voidCore'; to: VoidTarget; count: number; filter?: CardFilter; if?: Condition }
  /** ส่ง Soul Core บนสปิริตนี้ไปที่รีเสิร์ฟเรา */
  | { do: 'soulToReserve' }
  /**
   * แสดงใบบนสุดเด็ค N ใบ อัญเชิญไม่จ่ายคอสต์ใบที่ตรงตัวกรองได้สูงสุด max ใบ (null = กี่ใบก็ได้)
   * ที่เหลือไว้ใต้สุดเด็ค (เรียงลำดับได้)
   */
  | { do: 'revealSummon'; count: number; filter: CardFilter; max: number | null }
  /** (Burst) หลังเอฟเฟกต์นี้ อัญเชิญการ์ดสปิริตนี้ไม่จ่ายคอสต์ */
  | { do: 'summonThisFree' }
  /** ทิ้งการ์ดบนมือเราทั้งหมด แล้วจั่วการ์ดเท่าจำนวนการ์ดบนมือคู่แข่ง */
  | { do: 'discardHandDrawOpponentCount' }
  /** ฟื้นสภาพสปิริตเรา 1 ตัวที่ตรงตัวกรอง */
  | { do: 'refreshChosenAlly'; filter: CardFilter }
  /** ส่งคอร์ไลฟ์คู่แข่ง N เม็ดไปที่รีเสิร์ฟคู่แข่ง */
  | { do: 'opponentLifeToReserve'; count: number }
  /** ส่ง Core บนสปิริตนี้ N ดวงลงแทรชเรา (เลือก Core ธรรมดาก่อน) */
  | { do: 'selfCoresToTrash'; count: number }
  /** เมื่อจบการต่อสู้นี้ ทำ steps */
  | { do: 'atBattleEnd'; steps: Step[] }
  /** นำสปิริตนี้กลับขึ้นมือ ถ้าสำเร็จทำ then */
  | { do: 'returnSelfToHand'; then?: Step[] }
  /** สามารถนำการ์ดที่มีเอฟเฟกต์ Burst บนมือเรา 1 ใบไปเซ็ทได้ */
  | { do: 'setBurstFromHand' }
  /** [Catalyze]: สั่งใช้ Soul Burst สีนี้ของเราที่เซ็ทอยู่ (ไม่ต้องรอเงื่อนไข) */
  | { do: 'catalyze'; color: Color }
  /** (engine ใช้ภายใน) ไล่วางการ์ดที่เหลือไว้ใต้สุดเด็คตามลำดับที่เลือก */
  | { do: 'toDeckBottom'; cardIds: string[] }
  /** (engine ใช้ภายใน) วาง Core จากรีเสิร์ฟบนการ์ดที่อัญเชิญไม่จ่ายคอสต์ แล้วนำลงสนาม */
  | { do: 'placeCores'; cardId: string; state?: 'refresh' | 'exhausted'; noSummon?: true; asSpirit?: true }
  /** (engine ใช้ภายใน) Brave ที่อัญเชิญด้วยเอฟเฟกต์: เลือกสปิริตที่จะร่วมร่าง หรือไม่เลือก = ลงเป็นสปิริต */
  | { do: 'braveOrSpirit'; cardId: string }
  /** (engine ใช้ภายใน) เบรฟที่ผู้ร่วมร่างออกจากสนาม: เลือกให้อยู่ต่อหรือลง Trash */
  | { do: 'braveTrash'; cardId: string }
  /** ผู้ควบคุมเลือก 1 ตัวเลือก (if = ถามเฉพาะเมื่อเงื่อนไขเป็นจริง) */
  | { do: 'chooseOne'; options: { label: string; steps: Step[] }[]; if?: Condition };

/** ขอบเขตของ BP+ ถาวร */
export type StaticScope =
  | { self: true }
  /** สปิริตเผ่านี้ของเราทั้งหมด */
  | { ownFamily: string }
  /** สปิริตเราที่ชื่อมีคำใดคำหนึ่งนี้ทั้งหมด */
  | { ownNamed: string[] }
  /** สปิริตเราทั้งหมดที่ตรงเงื่อนไข (สี / เผ่า / มี Soul Core) */
  | { ownSpirits: { color?: Color; family?: string; soul?: true } };

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
  | 'oppDestroyed';

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
}

/** เงื่อนไขเปิด Burst */
export type BurstEvent = 'afterLifeLost' | 'afterAllyDestroyedByOpponent' | 'afterOpponentHandIncreased';

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
  | { kind: 'drawStep'; source: number; levels: number[]; extraDraw: { amount: number; if?: Condition }[]; after?: Step[] }
  /** เอฟเฟกต์ Burst: เมื่อเงื่อนไขเกิด เจ้าของเลือกเปิดได้ (ไม่เปิด = การ์ดยังเซ็ทอยู่) */
  | { kind: 'burst'; source: number; on: BurstEvent; steps: Step[]; soul?: true }
  /**
   * Flash [Quick]: อัญเชิญจากมือใน Flash timing โดยใช้ Core จากรีเสิร์ฟเท่านั้น
   * soul = [Soul Quick]: จ่ายคอสต์ทั้งหมดด้วย Soul Core ในรีเสิร์ฟ 1 ดวง (เฉพาะ Attack Step)
   */
  | { kind: 'quick'; source: number; soul?: true }
  /** แอทแท็คสเต็ปของเรา: เบิร์สของคู่แข่งไม่สามารถทำงาน */
  | { kind: 'blockOpponentBurst'; source: number; levels: number[]; if?: Condition }
  /** Flash [Evolution]: นำ Core บนสปิริตอื่นของเรากี่ดวงก็ได้มาวางบนสปิริตนี้ (ใช้ด้วย action evolve) */
  | { kind: 'evolution'; source: number; levels: number[] }
  /** BP+ ที่มีผลตลอดเวลาขณะการ์ดอยู่บนสนาม */
  | { kind: 'staticBp'; source: number; levels: number[]; if?: Condition; scope: StaticScope; amount: number }
  /** "ถ้า...สปิริตนี้เจ็มสี color เพิ่ม count เม็ด" */
  | { kind: 'extraSymbol'; source: number; levels: number[]; if?: Condition; color: Color; count: number }
  /** "ถ้า...สปิริตนี้ถือว่าเป็น Lv สูงสุด" */
  | { kind: 'maxLevelIf'; source: number; levels: number[]; if: Condition }
  /** "สปิริตนี้/การ์ดสปิริตนี้ถือว่ามีคำว่า ... ในชื่อการ์ดด้วย" */
  | { kind: 'nameAlias'; source: number; names: string[] }
  /** เอฟเฟกต์ Magic: [Main] หรือ [Flash] */
  | { kind: 'magic'; source: number; timing: 'main' | 'flash'; steps: Step[]; oncePerTurn?: true };

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
