import type { BurstEvent, CardFilter, Condition, Step } from '@bs/cards';

export type PlayerId = 'p1' | 'p2';
export const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
export const opponentOf = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');

export type Phase = 'start' | 'core' | 'draw' | 'refresh' | 'main' | 'attack' | 'end';
export type CardState = 'refresh' | 'exhausted';

/**
 * กติกาที่เอกสารยังไม่ยืนยัน (หมวด 11) ทำเป็น config เพื่อแก้ได้โดยไม่ต้องแก้ engine
 */
export interface GameConfig {
  initialLife: number;
  initialReserve: number;
  initialHand: number;
  /** ผู้เริ่มก่อนไม่ได้ Core ในเทิร์นแรก (คู่มือไทยยืนยัน) */
  firstPlayerSkipsCoreStep: boolean;
  /** ผู้เริ่มก่อนข้าม Attack Step ในเทิร์นแรก (ยังไม่ยืนยัน: แหล่งอื่นบอกว่าข้าม) */
  firstPlayerSkipsAttackStep: boolean;
  /** Draw Step รอให้ผู้เล่นกดจั่วเอง (action 'drawStep') แทนจั่วอัตโนมัติ (หน้าเว็บเปิดไว้) */
  manualDraw?: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  initialLife: 5,
  initialReserve: 3,
  initialHand: 4,
  firstPlayerSkipsCoreStep: true,
  firstPlayerSkipsAttackStep: true,
};

export interface CoreInstance {
  id: string;
  owner: PlayerId;
  isSoul: boolean;
}

export interface CardInstance {
  id: string;
  cardNo: string;
  owner: PlayerId;
  state: CardState;
  /** id ของ Core ที่วางอยู่บนการ์ด (มีค่าเฉพาะตอนอยู่บน Field) */
  cores: string[];
  /** BP+ จากเอฟเฟกต์ "ในเทิร์นนี้" (ล้างตอนจบเทิร์น และเมื่อออกจากสนาม) */
  turnBp: number;
  /** BP+ จากเอฟเฟกต์ที่ไม่บอกระยะเวลา ([เมื่อสปิริตนี้โจมตี]): มีผลจนจบการต่อสู้นั้น */
  battleBp?: number;
  /** เจ็มที่เพิ่มจากเอฟเฟกต์ที่ไม่บอกระยะเวลา: มีผลจนจบการต่อสู้นั้น */
  battleSymbols?: { color: string; count: number }[];
  /** source ของเอฟเฟกต์ "เทิร์นละ 1 ครั้ง" ที่ใช้ไปแล้วในเทิร์นนี้ */
  usedThisTurn: number[];
  /** Brave ที่ร่วมร่างอยู่บนการ์ดนี้ (Brave ที่ร่วมร่างไม่อยู่ใน field ของผู้เล่น) */
  braves: string[];
}

/** ทุก array เก็บ id; deck[0] คือใบบนสุด */
export interface PlayerState {
  deck: string[];
  hand: string[];
  field: string[];
  trashCards: string[];
  burst: string | null;
  life: string[];
  reserve: string[];
  trashCores: string[];
  /** การ์ดเมจิคไทป์ [เพลง] ที่วางบนฟิลด์ (BS07: ไม่ใช่การ์ดนอกมือ ใช้งานไม่ได้ วางแสดงเฉย ๆ) */
  songs?: string[];
}

export interface FlashWindow {
  priority: PlayerId;
  consecutivePasses: number;
}

export type BattleStep = 'flashBeforeBlock' | 'declareBlock' | 'flashAfterBlock';

export interface Battle {
  attackerId: string;
  /** ผู้ป้องกัน (ปกติไม่เกิน 1 ตัว, [Consecutive Blade] ได้ 2 ตัว) */
  blockers: string[];
  /** จำนวนผู้ป้องกันสูงสุดในการต่อสู้นี้ */
  maxBlockers: number;
  /** การต่อสู้นี้ใช้ [Consecutive Blade] */
  consecutiveBlade: boolean;
  /** ผู้ป้องกันที่ฝ่ายโจมตีเลือกให้ด้วยเอฟเฟกต์ (ประกาศอัตโนมัติเมื่อถึงช่วงบล็อก) */
  chosenBlockers: string[];
  step: BattleStep;
  flash: FlashWindow | null;
  /** [True-Rage]: ฝ่ายป้องกันต้องบล็อกถ้าทำได้ */
  mustBlock: boolean;
  /** จบ Attack Step เมื่อการต่อสู้นี้จบ (เบิร์สวอลล์) */
  endAttackStepAfter: boolean;
  /** เอฟเฟกต์ที่ทำงาน "เมื่อจบการต่อสู้นี้" */
  endEffects: QueuedEffect[];
  /** ไลฟ์ที่คู่แข่งเสีย ต่อผู้ป้องกัน 1 ตัวที่ถูกทำลายในการต่อสู้นี้ */
  lifeOnBlockerDestroyed: number;
  /** เหมือน lifeOnBlockerDestroyed แต่นับเฉพาะเมื่อใช้ [Consecutive Blade] */
  lifeOnBlockerDestroyedByBlade: number;
  /** สปิริตคู่แข่งที่ต่อสู้อยู่ถูกทำลาย/สูญสลาย → ส่งคอร์ไลฟ์ของเจ้าของ (ดุ๊คคิงเทารอส) */
  lifeOnBattlerGone?: { amount: number; to: 'reserve' | 'trash' };
  /** สปิริตที่ฟื้นสภาพเมื่อชนะและทำลายสปิริตคู่แข่งจากการเทียบ BP */
  refreshOnWin?: string[];
  /** ตีระบุ / ถูกบังคับให้โจมตีมาหา: ไม่มีแฟลชหลังโจมตี ผู้ป้องกันที่เลือกไว้ป้องกันทันที (กติกา 14 ตีระบุ) */
  skipFlash1?: boolean;
  /** การต่อสู้นี้ใช้ตีระบุแล้ว ([Consecutive Blade] จะไม่เกิดผล: กติกา 14 Consecutive Blade ข้อควรรู้ 4) */
  direct?: boolean;
  /** mustBlock ก่อน [Consecutive Blade] ทำงาน (คืนค่าเมื่อถูกยกเลิกเพราะตีระบุ) */
  mustBlockBeforeBlade?: boolean;
  /** ในการต่อสู้นี้ เจ็มของการ์ดนี้ (รวม Brave) ถือเป็นสี color จำนวน count เม็ด */
  symbolOverride?: { cardId: string; color: string; count: number };
  /** ผู้โจมตีไม่ถูกป้องกัน (spirits = ไม่ถูกป้องกันโดยสปิริต, ultimates = ไม่ถูกป้องกันโดยอัลติเมท) */
  unblockable?: 'all' | 'spirits' | 'ultimates';
  /** ในการต่อสู้นี้ ตัวที่เสื่อมสภาพป้องกันได้ (ตัวที่ฟื้นสภาพป้องกันไม่ได้) และฟื้นสภาพเมื่อป้องกัน (รินเนะ) */
  exhaustedBlock?: boolean;
  /** จบ Attack Step เมื่อจบการต่อสู้นี้ ถ้าเงื่อนไขของผู้เล่นนี้เป็นจริงตอนจบ (ยูคิเกิร์ล) */
  endAttackStepIf?: { player: PlayerId; sourceId: string; cond: Condition };
  /** คู่แข่งต้องส่งคอร์รีเสิร์ฟ N เม็ดลงแทรชก่อนป้องกัน (ฮิเมะเนโกะ) · paid = จ่ายแล้วในการต่อสู้นี้ */
  blockTax?: { reserveToTrash: number; paid?: boolean };
  /** ผู้โจมตีถือว่าไร้สีในการต่อสู้นี้ (ไลท์นิ่ง-ชิออน) */
  colorless?: boolean;
  /** การ์ดที่ออกจากสนามไปแล้วระหว่างการต่อสู้นี้ (กลับมาบนสนามอีก = การ์ดใหม่ ไม่ใช่ผู้โจมตี/ผู้ป้องกันเดิม) */
  left?: string[];
  /** ผู้เล่นที่ใช้การ์ดในมือในช่วง Flash ไม่ได้ในการต่อสู้นี้ */
  noHandFlash?: PlayerId;
  /** ผู้เล่นที่สปิริตถูกทำลายโดยคู่แข่งแล้วยังอยู่บนสนาม (เสื่อมสภาพ) ในการต่อสู้นี้ */
  staysOnDestroy?: PlayerId;
  /** ฝ่ายป้องกันป้องกันได้เฉพาะการ์ดที่ตรงตัวกรอง */
  blockFilter?: CardFilter;
  /** ผู้เล่นที่ใช้เอฟเฟกต์แฟลชไม่ได้ในการต่อสู้นี้ */
  noFlash?: PlayerId;
  /** ผู้เล่นที่สั่งใช้เบิร์สไม่ได้ในการต่อสู้นี้ */
  noBurst?: PlayerId;
  /** ส่งคอร์ไลฟ์คู่แข่งลงแทรช ต่อผู้ป้องกัน 1 ตัวที่ถูกทำลายจากการเทียบ BP (อุสึบะคาเงโร่) */
  lifeOnBlockerDestroyedTrash?: number;
  /** ในการต่อสู้นี้ การ์ดนี้ไม่รับผลเอฟเฟกต์ของการ์ดประเภทเหล่านี้ของคู่แข่ง (ฮิสะมารุ บัสเตอร์) */
  immune?: { cardId: string; types: string[] }[];
  /** ผู้โจมตีไม่ถูกป้องกันโดยสปิริตของคู่แข่งที่ BP ไม่เกินผู้โจมตี (ฮาคุเกอิน) */
  blockBpBan?: boolean;
  /** ตัดสินผลการต่อสู้แล้ว (เทียบ BP / เสียไลฟ์) แต่ยังไม่จบ เช่น รอเบิร์สหลังเสียไลฟ์ (หน้าเว็บใช้: ไม่เล่นวิ่งชนซ้ำ / ไม่ขึ้น Final Blow) */
  resolved?: boolean;
  /** My Unit: สปิริตที่ถูกนำมาวางชิดผู้โจมตี */
  unit?: string[];
  /** แคนดี้-ซาร์ด: ฝ่ายป้องกันต้องใช้สปิริต/อัลติเมทที่ Lv รวมตั้งแต่ค่านี้ (ป้องกันหลายตัว แล้วผู้โจมตีเลือกสู้ 1 ตัว) */
  levelBlock?: number;
}

/** เอฟเฟกต์ที่รอประมวลผล (หัวคิวคือที่กำลังทำ) */
export interface QueuedEffect {
  controller: PlayerId;
  /** การ์ดที่เป็นเจ้าของเอฟเฟกต์ */
  sourceId: string;
  /** ขั้นตอนที่ยังไม่ได้ทำ */
  steps: Step[];
  /** ใช้ Soul Core ร่วมจ่ายคอสต์ (Magic) */
  paidWithSoul: boolean;
  /** Magic: นำการ์ดลง Trash เมื่อประมวลผลเสร็จ */
  trashWhenDone: boolean;
  /** ลำดับความสามารถในการ์ด (trigger) ไม่มี = Magic / Burst */
  source?: number;
  /** เอฟเฟกต์ที่เกิดพร้อมกัน (batch เดียวกัน + ผู้ควบคุมเดียวกัน) ผู้ควบคุมเลือกลำดับได้ */
  batch?: number;
  /** เริ่มทำงานแล้ว (ประกาศ effectResolving แล้ว) */
  started?: boolean;
  /** false = ไม่ประกาศตอนเริ่ม (Burst: ประกาศตอนเปิดจริง) */
  announce?: boolean;
  /** Burst ที่ถูกสั่งใช้โดย [Catalyze] */
  catalyzed?: boolean;
  /** การ์ดที่ถูกทิ้งด้วย mill ล่าสุดของเอฟเฟกต์นี้ */
  milled?: string[];
  /** การ์ดที่เอฟเฟกต์นี้ทำลาย (BP ตอนถูกทำลาย / ประเภท) ใช้กับ ifDestroyed */
  destroyedByThis?: { bp: number; type: string; opponent: boolean }[];
  /** ตำแหน่งใน log ตอนเอฟเฟกต์เริ่ม (นับการ์ดที่ถูกทำลายโดยเอฟเฟกต์นี้) */
  logStart?: number;
  /** สปิริตที่เป็นต้นเหตุของ trigger นี้ */
  subjectId?: string;
  /** trigger lifeLost: จำนวนคอร์ไลฟ์ที่ลดลง */
  lifeLost?: number;
  /** trigger summon: การ์ดถูกอัญเชิญมาจากไหน */
  summonFrom?: string;
  /** เอฟเฟกต์นี้ทำให้การ์ดที่มี Soul Core สูญสลายแล้ว */
  depletedSoul?: boolean;
  /** เอฟเฟกต์จากเบิร์ส (รวมแฟลชที่จ่ายคอสต์ต่อจากเบิร์ส: กติกา 06 Q&A 3) */
  isBurst?: boolean;
  /** trigger oppHandIncreased: จำนวนการ์ดที่มือคู่แข่งเพิ่มขึ้น */
  handIncrease?: number;
  /** เอฟเฟกต์นี้ทิ้งเบิร์สของคู่แข่งได้ */
  burstDiscarded?: boolean;
  /** เอฟเฟกต์นี้มาจาก "เมื่อสปิริตนี้โจมตี" */
  fromAttack?: boolean;
  /** trigger ที่ทำงานขณะการ์ดอยู่บนมือ/ในแทรช: การ์ดย้ายออกจากที่นั้นก่อนถึงคิว = ไม่ทำงาน */
  zone?: 'hand' | 'trash';
  /** มี Soul Core บนการ์ดนี้ตอนเกิด trigger (การ์ดที่ออกจากสนามไปแล้ว) */
  soulSnapshot?: boolean;
  /** การ์ดที่ returnFromTrash ล่าสุดของเอฟเฟกต์นี้นำขึ้นมือ */
  returned?: string;
  /** จำนวนการ์ดที่ discardUpTo ทิ้ง */
  discardedCount?: number;
  /** debuff ของเอฟเฟกต์นี้ทำให้สปิริตกลายเป็น BP0 เป็นตัวแรกของเทิร์น */
  firstZeroBp?: boolean;
  /** เอฟเฟกต์นี้ทำให้การ์ดของคู่แข่งสูญสลาย */
  depleted?: boolean;
  /** จำนวนสปิริตคู่แข่งที่เอฟเฟกต์นี้เสื่อมสภาพ */
  exhaustedCount?: number;
  /** Kagemusha: เป้าที่ถูกเลือกเดิม / การ์ด Kagemusha ที่อัญเชิญแล้ว (การเลือกครั้งต่อไปของเอฟเฟกต์นี้ถูกบังคับ) */
  kageForce?: { orig: string; kage?: string };
  /** Kagemusha ดูดเอฟเฟกต์มาหมด: การเลือกที่เหลือของ step ชนิดนี้ต้องเล็งการ์ดนี้ (เล็งไม่ได้ = จบ) */
  kageAbsorb?: { cardId: string; stepDo: string };
  /** การ์ดที่ Kagemusha ตัดสินแล้ว (ไม่ถามซ้ำ) */
  kageDone?: string[];
  /** (BS07) เอฟเฟกต์ On Stage: การ์ดที่อัญเชิญด้วยเอฟเฟกต์นี้ถือว่าอัญเชิญโดย On Stage */
  onStage?: boolean;
  /** (BS07) trigger summon: การ์ดถูกอัญเชิญโดย On Stage / โดยเอฟเฟกต์ของการ์ดนี้ */
  summonByOnStage?: boolean;
  summonBySource?: string;
  /** (BS07) trigger allyDestroyed: การ์ดของคู่แข่งที่ทำลาย subject */
  destroyerId?: string;
  /** เอฟเฟกต์ "เมื่อสปิริต/เบรฟนี้ถูกอัญเชิญ" */
  onSummon?: boolean;
  /** ผู้ควบคุมเลือกไม่ใช้เอฟเฟกต์ "สามารถ" นี้ */
  declined?: boolean;
}

/** การตัดสินใจที่ engine รอจากผู้เล่น (ระหว่างนี้ทำได้แค่ choose หรือ concede) */
export type PendingChoice =
  | { kind: 'option'; player: PlayerId; sourceId: string; prompt: string; options: string[]; step: Step }
  | {
      kind: 'card';
      player: PlayerId;
      sourceId: string;
      prompt: string;
      candidates: string[];
      /** การ์ดที่แสดงจากเด็ค (ไม่ได้เลือกจะลง Trash) */
      revealed?: string[];
      /** ไม่เลือกก็ได้ (pick: null) */
      optional?: boolean;
      /** ข้อความปุ่ม "ไม่เลือก" (ถ้าไม่ระบุใช้ข้อความทั่วไป) */
      skipLabel?: string;
      step: Step;
    }
  /** จ่ายคอสต์ของการ์ด sourceId (ตอบด้วย pick: { pay: [...] } หรือ null = ไม่จ่าย) */
  | { kind: 'payCost'; player: PlayerId; sourceId: string; prompt: string; cost: number; step: Step }
  /**
   * วาง Core จากรีเสิร์ฟบนการ์ดที่กำลังอัญเชิญโดยไม่จ่ายคอสต์ (ตอบด้วย pick: { pay: [...] })
   * ต้องวางอย่างน้อย min ดวง (ถ้ารีเสิร์ฟมีไม่พอ ต้องวางทั้งหมด)
   */
  | { kind: 'placeCores'; player: PlayerId; sourceId: string; prompt: string; cardId: string; min: number; step: Step }
  /**
   * อัญเชิญการ์ดที่แสดงจากเด็คไม่จ่ายคอสต์ (เลือกทีเดียว ลงพร้อมกัน): ตอบด้วย pick: { summons: [...] }
   * max = จำนวนสูงสุด (null = กี่ใบก็ได้) ใบที่ไม่ได้เลือกไว้ใต้สุดเด็ค
   */
  | {
      kind: 'multiSummon';
      player: PlayerId;
      sourceId: string;
      prompt: string;
      revealed: string[];
      candidates: string[];
      max: number | null;
      step: Step;
    }
  /**
   * เรียงลำดับการ์ดที่จะนำกลับไปไว้บนสุด/ใต้สุดเด็ค ("โดยเรียงลำดับได้"): ตอบด้วย pick: { order: [...] } ครบทุกใบ
   * order[0] = ใบที่อยู่บนสุดของกลุ่ม · ใบสุดท้าย = ล่างสุดของกลุ่ม (ใต้สุดเด็ค = ใบสุดท้ายอยู่ล่างสุดของเด็ค)
   */
  | { kind: 'arrange'; player: PlayerId; sourceId: string; prompt: string; cardIds: string[]; where: 'top' | 'bottom'; step: Step }
  /** เอฟเฟกต์หลายอันเกิดพร้อมกัน: เลือกอันที่จะทำงานก่อน (pick = index ใน effects) ที่เหลือจะถามต่อ */
  | {
      kind: 'order';
      player: PlayerId;
      sourceId: string;
      prompt: string;
      /** key: เอฟเฟกต์ที่ key เท่ากันผลเหมือนกันทุกอย่าง (หน้าจอรวมเป็นอันเดียว ×N) */
      effects: { sourceId: string; source: number | null; key?: string }[];
    };

export interface GameState {
  config: GameConfig;
  /** สถานะของ seeded RNG (เกมเดิน deterministic) */
  rng: number;
  turn: number;
  firstPlayer: PlayerId;
  turnPlayer: PlayerId;
  phase: Phase;
  battle: Battle | null;
  /** คิวเอฟเฟกต์ที่กำลังประมวลผล */
  queue: QueuedEffect[];
  /** รอผู้เล่นตัดสินใจ */
  choice: PendingChoice | null;
  /** เงื่อนไข Burst ที่เกิดขึ้นแล้ว รอถามเจ้าของ Burst เมื่อเอฟเฟกต์ที่กำลังทำงานจบ */
  pendingBursts: { player: PlayerId; on: BurstEvent; /** การ์ดต้นเหตุ (เช่น การ์ดของคู่แข่งที่เอฟเฟกต์อัญเชิญเพิ่งทำงาน) */ subjectId?: string }[];
  /** ขั้นตอนของเทิร์นที่ต้องเดินต่อเมื่อเลือกเสร็จ (เช่น เอฟเฟกต์ใน Draw Step ให้เลือกทิ้งการ์ด) */
  resume: 'afterDraw' | 'afterStart' | 'resolveBattle' | 'endBattle' | 'endTurn' | 'drawStepStart' | null;
  burstSetThisTurn: boolean;
  /** "ในเทิร์นนี้ ... โจมตีไม่ได้": การ์ดของ player ประเภท types โจมตีไม่ได้ในเทิร์น turn */
  attackBans?: { player: PlayerId; turn: number; types: string[] }[];
  /** "ในเทิร์นนี้ สปิริตเราทั้งหมด BP+": สปิริตของ player ที่ตรง filter BP+amount ในเทิร์น turn */
  turnBuffs?: { player: PlayerId; turn: number; amount: number; filter?: CardFilter }[];
  /** เอฟเฟกต์ "เทิร์นละ 1 ครั้ง" ที่ใช้ไปแล้ว (player:cardNo:source) ล้างตอนจบเทิร์น */
  usedOncePerTurn?: string[];
  /** การ์ดที่ฟื้นสภาพไม่ได้ในรีเฟรชสเต็ปครั้งถัดไปของเจ้าของ (ล้างเมื่อผ่านรีเฟรชสเต็ปนั้น) */
  refreshLocks?: string[];
  /** จำนวนจั่วเพิ่มของ Draw Step ปัจจุบัน (เอฟเฟกต์ก่อนจั่ว) */
  drawStepExtra?: number;
  /** ผู้เล่นที่ไลฟ์ได้รับความเสียหายในเทิร์นนี้ (ล้างเมื่อเริ่มเทิร์นใหม่) */
  lifeDamagedThisTurn?: PlayerId[];
  /**
   * การ์ดที่ "วางแสดงนอกมือ" (อันโกะ): ยังอยู่ใน hand เพื่อใช้งานได้เหมือนอยู่ในมือ แต่ทั้งสองฝ่ายเห็น
   * และไม่นับเป็นการ์ดในมือสำหรับเอฟเฟกต์ทิ้งการ์ด / เงื่อนไขจำนวนการ์ดในมือ (ใช้ handCards ใน rules)
   */
  shownCards?: string[];
  /** การ์ดที่อัญเชิญเป็นใบแรกสุดของเทิร์นนี้ ของแต่ละผู้เล่น */
  firstSummon?: { turn: number; p1?: string; p2?: string };
  /** สปิริตที่ไม่ถูกป้องกันในเทิร์นนี้ */
  unblockableTurn?: { cardId: string; turn: number }[];
  /** "ในเทิร์นนี้, เมื่อ..." ที่เมจิคตั้งไว้ (ล้างเมื่อจบเทิร์น) */
  turnTriggers?: { player: PlayerId; turn: number; on: 'allyDestroyed'; steps: Step[]; sourceId: string; paidWithSoul: boolean }[];
  /** Draw Step แบบกดจั่วเอง: ผู้เล่นที่ต้องกดจั่ว (ระหว่างนี้ทำ action อื่นไม่ได้) */
  awaitingDraw?: PlayerId;
  /** "ในเทิร์นนี้ สปิริตนั้นจะโจมตี/ป้องกันไม่ได้" */
  turnLocks?: { cardId: string; turn: number }[];
  /** "ในเทิร์นนี้ สปิริต/เน็กซัสของคู่แข่งทั้งหมดสูญเสียเอฟเฟกต์ทั้งหมด": การ์ดของ player เสียเอฟเฟกต์ในเทิร์น turn */
  effectsLost?: { player: PlayerId; turn: number }[];
  /** "ในเทิร์นนี้ สปิริต/อัลติเมทที่มีเจ็มตั้งแต่ N เม็ดถือว่ามีเจ็ม 0" */
  symbolsZero?: { turn: number; minSymbols: number };
  /** เทิร์นที่มีสปิริตกลายเป็น BP0 โดย debuff ไปแล้ว */
  bpZeroTurn?: number;
  /** ในเทิร์นนี้ ไลฟ์ของผู้เล่นนี้ไม่ได้รับความเสียหายจากการโจมตีของสปิริต/อัลติเมทคอสต์ตั้งแต่ minCost (ลิมิเต็ดบาเรีย) */
  lifeShields?: { player: PlayerId; minCost: number; turn: number }[];
  /** สปิริต/อัลติเมทที่ทำให้ไลฟ์ของ player เสียหายแล้วในเทิร์นนี้ (ลองเคพ) */
  lifeDamageBy?: { turn: number; player: PlayerId; ids: string[] };
  /** การโจมตีใบแรกสุดของเทิร์น */
  firstAttack?: { turn: number; cardId: string };
  // ---------------- BS07
  /** ในเทิร์นนี้ การ์ดนี้เจ็มสี color เพิ่ม count เม็ด */
  turnSymbols?: { cardId: string; turn: number; color: string; count: number }[];
  /** ในเทิร์นนี้ การ์ดนี้ป้องกันได้แม้อยู่ในรูปแบบเสื่อมสภาพ */
  turnBlockExhausted?: { cardId: string; turn: number }[];
  /** ในเทิร์นนี้ การ์ดในมือ/นอกมือของ player ที่ตรงตัวกรอง คอสต์ +delta */
  turnHandCost?: { player: PlayerId; turn: number; filter: CardFilter; delta: number }[];
  /** ความสามารถ "เกมละ 1 ครั้ง" ที่ใช้แล้ว (player:cardNo:source) */
  usedOncePerGame?: string[];
  /** สเต็ปที่ต้องเข้าเพิ่มหลังจบแอทแท็คสเต็ป (จาก extraSteps) */
  extraSteps?: ('refresh' | 'attack')[];
  /** อิจิโกะฮิโทฟุริ: สปิริตของ attackerOwner ตัวนี้ต้องโจมตีเป็นใบแรกของสเต็ป และ holder เข้าป้องกันเอง */
  forcedAttack?: { turn: number; attackerId: string; holderId: string };
  players: Record<PlayerId, PlayerState>;
  cards: Record<string, CardInstance>;
  cores: Record<string, CoreInstance>;
  nextCoreId: number;
  winner: PlayerId | null;
  endReason: EndReason | null;
  log: GameEvent[];
}

export type EndReason = 'lifeZero' | 'deckOut' | 'concede';

/** ปลายทางของการย้าย Core */
export type CoreTarget = { area: 'reserve' } | { cardId: string };

export type Action =
  /**
   * อัญเชิญจากมือ: Main Step หรือ (การ์ดที่มี [Quick]) ใน Flash timing
   * braveOnto = Brave ร่วมร่างกับสปิริตนี้ (ไม่วาง Core บน Brave)
   */
  | { type: 'summon'; player: PlayerId; cardId: string; payment: string[]; placement: string[]; braveOnto?: string }
  | { type: 'deployNexus'; player: PlayerId; cardId: string; payment: string[]; placement: string[] }
  /** timing: เอฟเฟกต์ที่จะใช้ ([Main] หรือ [Flash]) ไม่ระบุ = [Main] ถ้ามี ไม่งั้น [Flash]; ระหว่าง Flash timing ใช้ได้แค่ [Flash] */
  | { type: 'useMagic'; player: PlayerId; cardId: string; payment: string[]; timing?: 'main' | 'flash' }
  | { type: 'moveCores'; player: PlayerId; moves: { coreId: string; to: CoreTarget }[] }
  | { type: 'setBurst'; player: PlayerId; cardId: string }
  /** Main Step: ทิ้ง Burst ที่เซ็ทอยู่ลง Trash (ไม่นับเป็นการเซ็ท) */
  | { type: 'discardBurst'; player: PlayerId }
  | { type: 'endMain'; player: PlayerId }
  | { type: 'declareAttack'; player: PlayerId; attackerId: string }
  | { type: 'endAttackStep'; player: PlayerId }
  | { type: 'passFlash'; player: PlayerId }
  | { type: 'declareBlock'; player: PlayerId; blockerId: string }
  | { type: 'noBlock'; player: PlayerId }
  /** ตอบ PendingChoice: index ของตัวเลือก, id การ์ด, { pay } สำหรับจ่ายคอสต์ หรือ null = ไม่จ่าย */
  | { type: 'choose'; player: PlayerId; pick: ChoicePick }
  /** Flash [Evolution]: ย้าย Core จากสปิริตอื่นของเรามาวางบน cardId */
  | { type: 'evolve'; player: PlayerId; cardId: string; cores: string[] }
  /** ใช้เอฟเฟกต์ Flash ของการ์ดบนสนาม (ability kind activated ที่บรรทัด source) */
  | { type: 'activate'; player: PlayerId; cardId: string; source: number }
  /**
   * Main Step: ย้าย Brave บนสนามของเรา
   *  - Brave เดี่ยว → ร่วมร่างกับ hostId (Core บน Brave กลับรีเสิร์ฟ, ผู้ร่วมร่างมีสภาพตาม Brave)
   *  - Brave ที่ร่วมร่างอยู่ → ย้ายไป hostId อื่น (ผู้ร่วมร่างใหม่มีสภาพตามผู้ร่วมร่างเดิม)
   *  - hostId null = แยกร่าง: วาง Core (placement) บน Brave, Brave มีสภาพตามผู้ร่วมร่างเดิม
   */
  | { type: 'brave'; player: PlayerId; braveId: string; hostId: string | null; placement?: string[] }
  | { type: 'concede'; player: PlayerId }
  /** Draw Step แบบกดจั่วเอง (config.manualDraw) */
  | { type: 'drawStep'; player: PlayerId }
  /** (BS07) แอทแท็คสเต็ปของเรา: ใช้ On Stage ของการ์ดบนสนาม (ability onStage ที่บรรทัด source) แทนการโจมตี */
  | { type: 'onStage'; player: PlayerId; cardId: string; source: number };

/** การ์ดหนึ่งใบที่อัญเชิญพร้อมกัน: วาง Core (cores) หรือ Brave ร่วมร่างกับ braveOnto */
export interface SummonPick {
  cardId: string;
  cores?: string[];
  braveOnto?: string;
}

export type ChoicePick = number | string | { pay: string[] } | { summons: SummonPick[] } | { order: string[] } | null;

export type GameEvent =
  | { type: 'gameStarted'; firstPlayer: PlayerId }
  | { type: 'turnStarted'; turn: number; player: PlayerId }
  | { type: 'phaseChanged'; phase: Phase }
  | { type: 'coreGained'; player: PlayerId; coreId: string }
  | { type: 'cardDrawn'; player: PlayerId; cardId: string }
  | { type: 'refreshed'; player: PlayerId }
  /** from = ที่มาเมื่ออัญเชิญด้วยเอฟเฟกต์ (ไม่จ่ายคอสต์) */
  | { type: 'summoned'; player: PlayerId; cardId: string; paid: number; from?: 'deck' | 'burst' | 'hand' | 'trash' | 'other'; quick?: boolean; /** อัญเชิญจากแทรชแบบจ่ายคอสต์ */ fromTrash?: true }
  | { type: 'nexusDeployed'; player: PlayerId; cardId: string; paid: number }
  | { type: 'magicUsed'; player: PlayerId; cardId: string; paid: number; timing: 'main' | 'flash' }
  | { type: 'coresMoved'; player: PlayerId; count: number }
  | { type: 'burstSet'; player: PlayerId; replacedCardId: string | null }
  | { type: 'burstDiscarded'; player: PlayerId; cardId: string; /** ถูกเอฟเฟกต์ของคู่แข่งทำลาย (ไม่ใช่เจ้าของทิ้งเอง) */ byEffect?: true }
  | { type: 'depleted'; cardId: string }
  | { type: 'attackDeclared'; attackerId: string }
  | { type: 'blockDeclared'; blockerId: string }
  | { type: 'noBlock' }
  | { type: 'flashPassed'; player: PlayerId }
  | { type: 'lifeLost'; player: PlayerId; amount: number }
  /** bySource = การ์ดที่เป็นเจ้าของเอฟเฟกต์ที่ทำลาย */
  /** cost = คอสต์บนสนามตอนถูกทำลาย (รวมคอสต์ Brave ที่ร่วมร่าง: Brave แยกออกไปแล้วหลังทำลาย จึงต้องจดไว้ตอนนั้น) */
  | { type: 'destroyed'; cardId: string; bySource?: string; stays?: true; cost?: number }
  /** คอร์บนการ์ดถูกส่งออก (เอฟเฟกต์ถอดคอร์) */
  | { type: 'coresRemoved'; cardId: string; count: number; to: 'reserve' | 'trash' | 'void' }
  /** การ์ดในมือถูกวางแสดงนอกมือ */
  | { type: 'cardShown'; player: PlayerId; cardId: string }
  /** การ์ดบนสนามกลับไปไว้ในเด็ค (บนสุด/ใต้สุด) */
  | { type: 'returnedToDeck'; player: PlayerId; cardId: string; where: 'top' | 'bottom' }
  /** ผู้เล่นกดใช้เอฟเฟกต์ Flash ของการ์ดบนสนาม */
  | { type: 'activated'; player: PlayerId; cardId: string; source: number }
  | { type: 'battleEnded' }
  | { type: 'gameOver'; winner: PlayerId; reason: EndReason }
  /** source = index บรรทัดเอฟเฟกต์ใน CardDef.effects */
  | { type: 'abilityTriggered'; cardId: string; source: number }
  /** ความสามารถถาวรของการ์ดบนสนามเปลี่ยนผลของเกมตอนนี้ (Shield กันเอฟเฟกต์, ปิดเอฟเฟกต์, ส่งใต้เด็คแทนขึ้นมือ ฯลฯ) ไม่มีผลกับ state */
  | { type: 'staticApplied'; player: PlayerId; cardId: string; source: number }
  /** เอฟเฟกต์เริ่มทำงาน (หลังเลือกลำดับแล้ว) source = null คือ Magic / Burst */
  | { type: 'effectResolving'; player: PlayerId; cardId: string; source: number | null }
  | { type: 'bpBuffed'; cardId: string; amount: number }
  | { type: 'mustBlock'; cardId: string }
  | { type: 'cardsRevealed'; player: PlayerId; cardIds: string[] }
  | { type: 'cardToHand'; player: PlayerId; cardId: string; from: 'deck' | 'trash' }
  /** player = เจ้าของเด็ค */
  | { type: 'milled'; player: PlayerId; cardIds: string[] }
  | { type: 'optionChosen'; player: PlayerId; option: string }
  | { type: 'evolved'; cardId: string; count: number; soul: boolean }
  | { type: 'cardRefreshed'; cardId: string }
  | { type: 'discarded'; player: PlayerId; cardId: string }
  /** การ์ดนี้โจมตี/ป้องกันไม่ได้ในเทิร์นนี้ */
  | { type: 'cardLocked'; cardId: string }
  /** ฝ่ายป้องกันส่งคอร์รีเสิร์ฟลงแทรชเพื่อป้องกัน */
  | { type: 'coresPaidToBlock'; player: PlayerId; count: number }
  | { type: 'burstActivated'; player: PlayerId; cardId: string }
  /** เมจิก/เบิร์สทำเอฟเฟกต์จบแล้ว ลง Trash (ตอนนี้) */
  | { type: 'spellResolved'; player: PlayerId; cardId: string }
  | { type: 'lifeGained'; player: PlayerId; amount: number }
  | { type: 'costPaid'; player: PlayerId; cardId: string; paid: number }
  | { type: 'soulToTrash'; cardId: string }
  | { type: 'consecutiveBlade'; cardId: string }
  | { type: 'blockerChosen'; cardId: string }
  | { type: 'exhausted'; cardId: string }
  /** การ์ดบนสนามกลับขึ้นมือเจ้าของ */
  | { type: 'bounced'; player: PlayerId; cardId: string }
  /** Core ใหม่จากวอยด์ (cardId null = รีเสิร์ฟ) */
  | { type: 'voidCore'; player: PlayerId; cardId: string | null; count: number; trash?: true }
  | { type: 'soulToReserve'; cardId: string }
  /** นำ Soul Core จากแทรชมาวางบนการ์ดนี้ (โอเทนตะ) */
  | { type: 'soulFromTrash'; cardId: string }
  /** ในเทิร์นนี้ ไลฟ์ไม่ได้รับความเสียหายจากการโจมตีของสปิริตคอสต์ตั้งแต่ minCost (ลิมิเต็ดบาเรีย) */
  | { type: 'lifeShield'; player: PlayerId; minCost: number }
  /** สปิริตนี้ต้องโจมตีมาที่ holder เป็นใบแรกของสเต็ป (อิจิโกะฮิโทฟุริ) */
  | { type: 'forcedAttack'; cardId: string; holderId: string }
  /** สปิริตของ player ตกเป็นเป้า: เปิดให้ใช้ Kagemusha */
  | { type: 'kagemushaChance'; player: PlayerId; targetId: string }
  | { type: 'coresToTrash'; cardId: string; count: number }
  | { type: 'cardsToDeckBottom'; player: PlayerId; cardIds: string[] }
  | { type: 'braved'; cardId: string; hostId: string }
  /** ผู้ร่วมร่างออกจากสนาม: Brave อยู่ต่อ (stays) หรือลง Trash */
  | { type: 'braveSeparated'; cardId: string; stays: boolean }
  | { type: 'catalyze'; cardId: string; burstId: string }
  /** การ์ดของ player โจมตีไม่ได้ในเทิร์นนี้ */
  | { type: 'attackBanned'; player: PlayerId }
  // ---------------- BS07
  /** เมจิคไทป์เพลงถูกวางบนฟิลด์ (from: ใช้เสร็จ / จากมือ) */
  | { type: 'songPlaced'; player: PlayerId; cardId: string; from: 'used' | 'hand' }
  /** เมจิคไทป์เพลงบนฟิลด์ออกไป (to: แทรช / มือ) */
  | { type: 'songRemoved'; player: PlayerId; cardId: string; to: 'trash' | 'hand' }
  /** สปิริตทำ On Stage (กลับไปใต้เด็ค หรือเสื่อมสภาพแทน) */
  | { type: 'onStage'; player: PlayerId; cardId: string; exhaustedInstead?: true }
  /** My Unit: สปิริตถูกนำมาวางชิดผู้โจมตี */
  | { type: 'myUnit'; attackerId: string; cardIds: string[] }
  /** เอฟเฟกต์ของการ์ดเมจิคถูกทำให้ไร้ผล */
  | { type: 'magicNegated'; cardId: string; bySource: string }
  /** สเต็ปเพิ่มจากเอฟเฟกต์ (รีเฟรช/แอทแท็คสเต็ปอีกครั้ง) */
  | { type: 'extraStep'; player: PlayerId; step: 'refresh' | 'attack'; cardId: string }
  /** เอฟเฟกต์ของคู่แข่งบนการ์ดนี้ถูกล้าง */
  | { type: 'cleansed'; cardId: string };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: { code: string; message: string } };
