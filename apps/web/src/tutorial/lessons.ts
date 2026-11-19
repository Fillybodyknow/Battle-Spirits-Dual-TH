/**
 * บทเรียนพื้นฐาน (Tutorial): จัดสถานการณ์บนกระดานจริงด้วย engine แล้วให้ผู้เล่นทำตามทีละขั้น
 * การ์ดใช้ Starter Deck 01 (สีแดง) · ผู้เล่น = p1 (ล่าง) · คู่แข่ง = p2 ทำตามบอทของบท
 *
 * ขั้นหนึ่ง (TutorialStep):
 *  - focus = จุดที่ส่องไฟ (selector) และกดได้ · allow = สิ่งที่เปิดตามมา (เมนูการ์ด / แผงยืนยัน) ส่องไฟและกดได้เมื่อปรากฏ
 *  - expect = รอ action นี้ (กดผิดขั้นตอน = ไม่เกิดอะไร) · ไม่มี expect / until = มีปุ่ม "ถัดไป"
 *  - until = รอจน state เป็นแบบนี้ (และแอนิเมชันเล่นจบ) แล้วไปขั้นถัดไปเอง
 */
import { applyAction, createGame, type Action, type GameConfig, type GameState, type PlayerId } from '@bs/engine';
import { db } from '../store';

export type Ids = Record<string, string>;

export interface TutorialStep {
  text: string | ((s: GameState, ids: Ids) => string);
  focus?: (ids: Ids) => string[];
  allow?: (ids: Ids) => string[];
  expect?: (a: Action, ids: Ids) => boolean;
  until?: (s: GameState, ids: Ids) => boolean;
  /** ให้หน้ากดจั่ว (Draw Step) แสดงในขั้นนี้ (ขั้นอื่นซ่อนไว้ ไม่บังคำอธิบาย) */
  draw?: boolean;
  /** เล่นอิสระ: ทำ action ของฝั่งเราได้ทุกอย่าง ไม่มีจอมืด กล่องข้อความย่อไว้ด้านบน (ใช้คู่กับ until) */
  free?: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  sub: string;
  setup(): { state: GameState; ids: Ids };
  steps: TutorialStep[];
  /** คู่แข่งตัดสินใจ (คืน null = ใช้บอทพื้นฐาน smartBot: จั่ว · โจมตี · ป้องกันเมื่อ BP สูงกว่า · ผ่าน Flash) */
  bot?(s: GameState, ids: Ids): Action | null;
  /** บอทพื้นฐานอัญเชิญสปิริตใน Main Step ด้วย */
  botSummons?: boolean;
  /** ด่านที่ต้องชนะ: false ตอนจบ = ไม่ผ่าน ให้ลองใหม่ */
  passed?(s: GameState): boolean;
}

const card = (name: string): string => {
  const c = db.all().find((x) => x.name === name);
  if (!c) throw new Error(`บทเรียน: ไม่พบการ์ด ${name}`);
  return c.cardNo;
};

// การ์ดจาก Starter Deck 01 ที่ไม่มีเอฟเฟกต์ซับซ้อน (ไม่มี Flash ไม่ถามอะไรระหว่างบทเรียน)
const DARIU = () => card('มุฉะดาริว'); // คอสต์ 1 · ลดคอสต์แดง 1 · Lv1 1 ดวง 3000 / Lv2 3 ดวง 6000 · ไม่มีเอฟเฟกต์
const JINRAI = () => card('จินไรดราก้อน'); // คอสต์ 3 · ลดคอสต์แดง 2
const HIEN = () => card('ฮิเอ็นดราก้อน');
const HAGANE = () => card('ฮากาเนะวูม');
const SOUL = () => card('โซลดรอว์'); // เมจิค [Main] จั่ว 2 · [Flash] BP+4000
const KABU = () => card('คาบุริว ดรอว์'); // เมจิค [Main] จั่ว 2 · [Flash] BP+2000
const NEXUS = () => card('หุบเหวร้อยปราชญ์'); // เน็กซัส: Draw Step จั่วเพิ่ม
const WALL = () => card('เบิร์สวอลล์'); // เบิร์ส: หลังเสียไลฟ์ ได้ไลฟ์คืน + [Flash] จบ Attack Step

/** เกมตั้งต้น: p1 เริ่มก่อน · เด็คไม่สับ (ใบบนสุด = ต้นรายการ) · ที่เหลือเป็นมุฉะดาริว */
function game(p1Top: string[], config: Partial<GameConfig> = {}): GameState {
  const pad = (top: string[]) => [...top, ...Array<string>(40 - top.length).fill(DARIU())];
  return createGame({
    db,
    decks: { p1: pad(p1Top), p2: pad([]) },
    seed: 20261119,
    firstPlayer: 'p1',
    shuffleDecks: false,
    config: { manualDraw: true, ...config },
  }).state;
}

function act(s: GameState, a: Action): GameState {
  const r = applyAction(s, a, db);
  if (!r.ok) throw new Error(`บทเรียน: ${a.type} ${r.error.message}`);
  return r.state;
}

let seq = 0;
/** วางการ์ดลงสนามพร้อม Core (Core ใหม่ ไม่ได้มาจาก Reserve) */
function put(s: GameState, owner: PlayerId, cardNo: string, cores: number): string {
  const id = `tut-card-${++seq}`;
  const coreIds = Array.from({ length: cores }, () => {
    const c = `tut-core-${++seq}`;
    s.cores[c] = { id: c, owner, isSoul: false };
    return c;
  });
  s.cards[id] = { id, cardNo, owner, state: 'refresh', cores: coreIds, turnBp: 0, usedThisTurn: [], braves: [] };
  s.players[owner].field.push(id);
  return id;
}

const handCard = (s: GameState, cardNo: string) => s.players.p1.hand.find((id) => s.cards[id]!.cardNo === cardNo)!;
const field = (id: string) => `[data-field-card="${id}"]`;
const hand = (id: string) => `[data-hand-card="${id}"]`;
/** แผงอัญเชิญ + เมนูของการ์ดในมือ (คลิกการ์ด = ยกขึ้นพร้อมเมนู "อัญเชิญ") */
const PLAY = ['[data-tutorial="play-panel"]', '[data-tutorial="hand-menu"]'];
const SWORD = 'button[title="โจมตี"]';

export const LESSONS: Lesson[] = [
  {
    id: 'basics',
    title: 'บทที่ 1: รู้จักสนาม',
    sub: 'ส่วนต่าง ๆ ของกระดาน · ลำดับสเต็ปในหนึ่งเทิร์น · จั่วการ์ด',
    setup: () => ({ state: game([DARIU(), JINRAI(), HIEN(), HAGANE()]), ids: {} }),
    steps: [
      { text: 'ยินดีต้อนรับสู่ Battle Spirits!\nบทนี้จะพาดูส่วนต่าง ๆ ของสนาม และลำดับของหนึ่งเทิร์น' },
      { text: 'Life ของเรา: เริ่มเกมมี 5 ดวง\nโดนโจมตีแล้วไม่ป้องกัน Life จะลดลง · Life หมด = แพ้', focus: () => ['[data-life="p1"]'] },
      {
        text: 'Reserve: ที่เก็บ Core ของเรา\nCore ใช้จ่ายคอสต์ตอนเล่นการ์ด และวางบนสปิริตเพื่อกำหนดเลเวล · ทุกเทิร์นได้ Core เพิ่ม 1 ดวงใน Core Step',
        focus: () => ['[data-reserve="p1"]'],
      },
      { text: 'Deck: กองการ์ดของเรา จั่วเทิร์นละ 1 ใบใน Draw Step\nถ้าต้องจั่วแต่ไม่มีการ์ดเหลือ = แพ้', focus: () => ['[data-deck="p1"]'] },
      {
        text: 'Trash: การ์ดที่ใช้แล้ว ถูกทำลาย หรือถูกทิ้ง มาอยู่ที่นี่\nCore ที่จ่ายคอสต์ก็มาพักที่นี่ แล้วกลับ Reserve ใน Refresh Step',
        focus: () => ['[data-trash="p1"]'],
      },
      { text: 'การ์ดในมือ: เริ่มเกมมี 4 ใบ\nชี้ที่การ์ดเพื่อดูรายละเอียดได้ทุกเมื่อ', focus: () => ['[data-hand-card]'] },
      { text: 'สนามของเรา: สปิริตและเน็กซัสที่เล่นแล้วจะอยู่ตรงนี้\nด้านบนคือสนามของคู่แข่ง', focus: () => ['[data-mat="p1"]'] },
      {
        text: 'หนึ่งเทิร์นเดินตามลำดับ:\nStart → Core → Draw → Refresh → Main → Attack → End\nป้ายกลางจอบอกเทิร์นและสเต็ปปัจจุบัน',
        focus: () => ['[data-tutorial="turn-badge"]'],
      },
      {
        text: 'ตอนนี้อยู่ใน Draw Step\nกดการ์ดที่ลอยอยู่กลางจอเพื่อจั่ว 1 ใบ',
        focus: () => ['[data-draw-prompt]'],
        expect: (a) => a.type === 'drawStep',
        until: (s) => s.phase === 'main',
        draw: true,
      },
      {
        text: 'จั่วแล้ว! ตอนนี้เข้าสู่ Main Step: ช่วงอัญเชิญสปิริตและใช้เมจิค (บทที่ 2)\nหลังจากนั้นคือ Attack Step: ช่วงโจมตี (บทที่ 3)',
        focus: () => ['[data-tutorial="turn-badge"]'],
      },
    ],
  },
  {
    id: 'summon',
    title: 'บทที่ 2: อัญเชิญสปิริต',
    sub: 'คอสต์ · ลดคอสต์ด้วยเจ็ม · วาง Core กำหนดเลเวล',
    setup: () => {
      let s = game([DARIU(), JINRAI(), HIEN(), HAGANE()], { initialReserve: 6 });
      s = act(s, { type: 'drawStep', player: 'p1' });
      return { state: s, ids: { dariu: handCard(s, DARIU()), jinrai: handCard(s, JINRAI()) } };
    },
    steps: [
      { text: 'บทนี้: อัญเชิญสปิริตลงสนาม\nการ์ดสปิริตเล่นได้ใน Main Step ของเรา โดยจ่าย Core ตามคอสต์ของการ์ด' },
      {
        text: (s) => `ตอนนี้มี Core ใน Reserve ${s.players.p1.reserve.length} ดวง\n(ดวงสีแดงคือ Soul Core ใช้แทน Core ปกติได้)`,
        focus: () => ['[data-reserve="p1"]'],
      },
      {
        text: 'มุฉะดาริว: ตัวเลขมุมซ้ายบนของการ์ดคือคอสต์ (1)\nคลิกการ์ด → "อัญเชิญ" → เลือก Lv1 → กด "อัญเชิญ" ที่แผงด้านขวา\nจ่าย Core 1 ดวงเป็นคอสต์ และวางบนการ์ดอีก 1 ดวงให้เป็น Lv1',
        focus: (ids) => [hand(ids.dariu!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'summon' && a.cardId === ids.dariu,
      },
      {
        text: 'อัญเชิญสำเร็จ!\nCore บนสปิริตบอกเลเวล: วาง 1 ดวง = Lv1 BP 3,000 · วาง 3 ดวง = Lv2 BP 6,000\nถ้า Core บนสปิริตน้อยกว่าที่ Lv1 ต้องการ สปิริตจะสูญสลาย',
        focus: (ids) => [field(ids.dariu!)],
      },
      {
        text: 'จินไรดราก้อน: คอสต์ 3 แต่มีสัญลักษณ์ลดคอสต์สีแดง 2 ช่อง\nมุฉะดาริวบนสนามมีเจ็มสีแดง 1 → คอสต์ลด 1 เหลือ 2\nคลิกการ์ดแล้วอัญเชิญเลย',
        focus: (ids) => [hand(ids.jinrai!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'summon' && a.cardId === ids.jinrai,
      },
      {
        text: 'ยิ่งมีสปิริตสีเดียวกันบนสนาม การ์ดสีนั้นยิ่งเล่นได้ถูกลง\nCore ที่จ่ายเป็นคอสต์ไปอยู่ใน Trash และจะกลับ Reserve ใน Refresh Step ของเทิร์นถัดไป',
        focus: (ids) => [field(ids.dariu!), field(ids.jinrai!), '[data-trash="p1"]'],
      },
    ],
  },
  {
    id: 'battle',
    title: 'บทที่ 3: โจมตีและป้องกัน',
    sub: 'ไป Attack Step · ต่อสู้ด้วย BP · ลด Life จนชนะ',
    setup: () => {
      let s = game([DARIU(), DARIU(), DARIU(), DARIU()], { firstPlayerSkipsAttackStep: false });
      s = act(s, { type: 'drawStep', player: 'p1' });
      s = structuredClone(s);
      const big = put(s, 'p1', DARIU(), 3); // Lv2 BP 6000
      const small = put(s, 'p1', DARIU(), 1); // Lv1 BP 3000
      const guard = put(s, 'p2', DARIU(), 1); // Lv1 BP 3000
      s.players.p2.life = s.players.p2.life.slice(0, 1);
      return { state: s, ids: { big, small, guard } };
    },
    bot: (s, ids) =>
      s.battle?.step === 'declareBlock' && s.players.p2.field.includes(ids.guard!) && s.cards[ids.guard!]!.state === 'refresh'
        ? { type: 'declareBlock', player: 'p2', blockerId: ids.guard! }
        : null,
    steps: [
      { text: 'บทนี้: โจมตีและป้องกัน\nเรามีสปิริต 2 ตัว คู่แข่งเหลือ Life 1 ดวงและมีสปิริตป้องกัน 1 ตัว' },
      {
        text: 'ไป Attack Step: กดป้ายสเต็ปกลางจอ แล้วเลือก "Attack"',
        focus: () => ['[data-tutorial="turn-badge"]', '[data-tutorial="step-attack"]'],
        expect: (a) => a.type === 'endMain',
        until: (s) => s.phase === 'attack',
      },
      {
        text: 'โจมตีด้วยสปิริต Lv2 (BP 6,000)\nคลิกสปิริต แล้วกดปุ่มดาบ',
        focus: (ids) => [field(ids.big!), SWORD],
        expect: (a, ids) => a.type === 'declareAttack' && a.attackerId === ids.big,
        until: (s) => !s.battle,
      },
      {
        text: 'คู่แข่งสั่งสปิริตป้องกัน: เทียบ BP กัน ฝ่ายที่ BP น้อยกว่าถูกทำลาย (เท่ากัน = ถูกทำลายทั้งคู่)\nBP 6,000 ชนะ 3,000 → สปิริตของคู่แข่งถูกทำลาย\nสปิริตที่โจมตีแล้วจะเสื่อมสภาพ (นอนลง) โจมตีซ้ำในเทิร์นนี้ไม่ได้',
        focus: (ids) => [field(ids.big!)],
      },
      {
        text: 'คู่แข่งไม่มีสปิริตป้องกันแล้ว: โจมตีด้วยสปิริตอีกตัว\nโจมตีที่ไม่ถูกป้องกันลด Life คู่แข่งตามจำนวนเจ็มของสปิริต (1 ดวง)',
        focus: (ids) => [field(ids.small!), SWORD],
        expect: (a, ids) => a.type === 'declareAttack' && a.attackerId === ids.small,
        until: (s) => !!s.winner,
      },
      { text: 'Life ของคู่แข่งหมด: เราชนะ!\nนี่คือพื้นฐานการต่อสู้ใน Battle Spirits' },
    ],
  },
  {
    id: 'magic',
    title: 'บทที่ 4: เมจิคและ Flash',
    sub: 'ใช้เมจิค [Main] · Flash Timing ระหว่างการต่อสู้ · เพิ่ม BP ด้วย [Flash]',
    setup: () => {
      let s = game([SOUL(), KABU(), DARIU(), DARIU()], { firstPlayerSkipsAttackStep: false, initialReserve: 7 });
      s = act(s, { type: 'drawStep', player: 'p1' });
      s = structuredClone(s);
      const big = put(s, 'p1', DARIU(), 3); // Lv2 BP 6000
      put(s, 'p1', DARIU(), 1);
      const guard = put(s, 'p2', DARIU(), 3); // Lv2 BP 6000 (เท่ากัน)
      return { state: s, ids: { big, guard, soul: handCard(s, SOUL()), kabu: handCard(s, KABU()) } };
    },
    bot: (s, ids) =>
      s.battle?.step === 'declareBlock' && s.players.p2.field.includes(ids.guard!) && s.cards[ids.guard!]!.state === 'refresh'
        ? { type: 'declareBlock', player: 'p2', blockerId: ids.guard! }
        : null,
    steps: [
      {
        text: 'บทนี้: เมจิค\nเมจิคใช้ครั้งเดียวแล้วลง Trash · เอฟเฟกต์ [Main] ใช้ใน Main Step ของเรา · [Flash] ใช้ใน Flash Timing ระหว่างการต่อสู้',
      },
      {
        text: 'โซลดรอว์ [Main]: จั่วการ์ด 2 ใบ\nคอสต์ 5 แต่ลดได้ด้วยเจ็มแดงสูงสุด 3 · ตอนนี้มีสปิริตแดง 2 ตัว → เหลือ 3\nคลิกการ์ด → ใช้ [Main] → กดยืนยันที่แผงด้านขวา',
        focus: (ids) => [hand(ids.soul!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'useMagic' && a.cardId === ids.soul,
      },
      { text: 'จั่วแล้ว 2 ใบ!\nเมจิคที่ใช้แล้วลง Trash', focus: () => ['[data-trash="p1"]'] },
      {
        text: 'ไป Attack Step: กดป้ายสเต็ปกลางจอ แล้วเลือก "Attack"',
        focus: () => ['[data-tutorial="turn-badge"]', '[data-tutorial="step-attack"]'],
        expect: (a) => a.type === 'endMain',
        until: (s) => s.phase === 'attack',
      },
      {
        text: 'โจมตีด้วยสปิริต Lv2 (BP 6,000)\nคลิกสปิริต แล้วกดปุ่มดาบ',
        focus: (ids) => [field(ids.big!), SWORD],
        expect: (a, ids) => a.type === 'declareAttack' && a.attackerId === ids.big,
        until: (s) => s.battle?.flash?.priority === 'p1',
      },
      {
        text: 'Flash Timing: จังหวะที่ทั้งสองฝ่ายใช้ [Flash] ได้ (ก่อนคู่แข่งตัดสินใจป้องกัน)\nตอนนี้ยังไม่ต้องใช้: กด PASS (ไม่ใช้)',
        focus: () => ['[data-tutorial="phase-btn"]'],
        expect: (a) => a.type === 'passFlash' && a.player === 'p1',
        until: (s) => !!s.battle && s.battle.blockers.length > 0 && s.battle.flash?.priority === 'p1',
      },
      {
        text: 'คู่แข่งป้องกันด้วย BP 6,000 เท่ากับเรา: BP เท่ากัน = ถูกทำลายทั้งคู่!\nใช้ คาบุริว ดรอว์ [Flash]: สปิริต 1 ตัว BP+2,000\nคลิกการ์ด → ใช้ [Flash] → กดยืนยัน',
        focus: (ids) => [hand(ids.kabu!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'useMagic' && a.cardId === ids.kabu,
        until: (s) => s.choice?.kind === 'card',
      },
      {
        text: 'เลือกสปิริตที่จะเพิ่ม BP: คลิกสปิริตของเราที่กำลังโจมตี',
        focus: (ids) => [field(ids.big!)],
        expect: (a, ids) => a.type === 'choose' && a.pick === ids.big,
        until: (s) => !s.battle,
      },
      {
        text: 'BP 8,000 ชนะ 6,000 → สปิริตของคู่แข่งถูกทำลาย\nBP ที่เพิ่มจาก [Flash] อยู่จนจบเทิร์นนี้ · ใช้ [Flash] พลิกผลการต่อสู้ได้แบบนี้',
        focus: (ids) => [field(ids.big!)],
      },
    ],
  },
  {
    id: 'burst',
    title: 'บทที่ 5: เน็กซัสและเบิร์ส',
    sub: 'วางเน็กซัส · เซ็ทเบิร์ส · เปิดเบิร์สตอนคู่แข่งโจมตี',
    setup: () => {
      let s = game([NEXUS(), WALL(), DARIU(), DARIU()], { initialReserve: 8 });
      s = act(s, { type: 'drawStep', player: 'p1' });
      s = structuredClone(s);
      put(s, 'p2', DARIU(), 3);
      put(s, 'p2', DARIU(), 3);
      return { state: s, ids: { nexus: handCard(s, NEXUS()), wall: handCard(s, WALL()) } };
    },
    steps: [
      { text: 'บทนี้: เน็กซัสและเบิร์ส\nเน็กซัสให้ผลต่อเนื่องบนสนาม · เบิร์สคือการ์ดที่คว่ำรอไว้ เปิดใช้ได้ฟรีเมื่อเงื่อนไขเกิด' },
      {
        text: 'หุบเหวร้อยปราชญ์ (เน็กซัส): วางแล้วอยู่บนสนามถาวร ไม่โจมตีและไม่ป้องกัน\nLv1 ไม่ต้องวาง Core · คลิกการ์ด → วาง → กดยืนยันที่แผงด้านขวา',
        focus: (ids) => [hand(ids.nexus!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'deployNexus' && a.cardId === ids.nexus,
      },
      {
        text: 'วางเน็กซัสแล้ว!\nหุบเหวร้อยปราชญ์ Lv1: Draw Step ของเราจั่วเพิ่ม 1 ใบ แล้วทิ้งการ์ดในมือ 1 ใบ (เริ่มเทิร์นหน้า)',
        focus: (ids) => [field(ids.nexus!)],
      },
      {
        text: 'เบิร์สวอลล์มี [Burst]: "หลังเราเสียไลฟ์" ได้ Life คืน 1 ดวง\nเซ็ทคว่ำไว้ที่ช่อง Burst ได้เทิร์นละ 1 ใบ · คลิกการ์ด → เซ็ท Burst',
        focus: (ids) => [hand(ids.wall!)],
        allow: () => PLAY,
        expect: (a, ids) => a.type === 'setBurst' && a.cardId === ids.wall,
      },
      { text: 'เซ็ทแล้ว: การ์ดคว่ำอยู่ คู่แข่งไม่รู้ว่าเป็นการ์ดอะไร', focus: () => ['[data-burst-card="p1"]'] },
      {
        text: 'จบเทิร์นของเรา: กดป้ายสเต็ปกลางจอ แล้วเลือก "End"',
        focus: () => ['[data-tutorial="turn-badge"]', '[data-tutorial="step-end"]'],
        expect: (a) => a.type === 'endMain' || a.type === 'endAttackStep',
        until: (s) => s.turnPlayer === 'p2',
      },
      {
        text: 'เทิร์นของคู่แข่ง: คู่แข่งกำลังโจมตีด้วยสปิริต และเราไม่มีสปิริตป้องกัน…',
        until: (s) => s.choice?.kind === 'option' && s.choice.player === 'p1',
      },
      {
        text: 'เราเสียไลฟ์! เงื่อนไขของเบิร์สวอลล์เกิดแล้ว: กด "เปิด Burst"',
        focus: () => ['[data-tutorial="prompt-opt0"]'],
        expect: (a) => a.type === 'choose' && a.pick === 0,
        until: (s) => s.choice?.kind === 'payCost',
      },
      {
        text: 'ได้ Life คืน 1 ดวง!\nเบิร์สวอลล์ยังจ่ายคอสต์ 4 เพื่อใช้ [Flash] ต่อได้: จบ Attack Step ของคู่แข่งหลังการต่อสู้นี้ (สปิริตอีกตัวโจมตีไม่ได้) · กด "จ่าย 4"',
        focus: () => ['[data-tutorial="prompt-pay"]'],
        expect: (a) => a.type === 'choose' && !!a.pick && typeof a.pick === 'object' && 'pay' in a.pick,
        until: (s) => s.turnPlayer === 'p1' && s.awaitingDraw === 'p1',
      },
      { text: 'เบิร์สวอลล์หยุดการโจมตีของคู่แข่งไว้ได้ สปิริตอีกตัวไม่ได้โจมตี\nตอนนี้กลับมาเป็นเทิร์นของเรา' },
      {
        text: 'Draw Step: หุบเหวร้อยปราชญ์ทำงาน จั่ว 2 ใบ\nกดการ์ดที่ลอยอยู่เพื่อจั่ว',
        focus: () => ['[data-draw-prompt]'],
        expect: (a) => a.type === 'drawStep',
        until: (s) => s.choice?.kind === 'card' && s.choice.player === 'p1',
        draw: true,
      },
      {
        text: 'จั่วเพิ่มแล้ว · ต่อไปทิ้งการ์ดในมือ 1 ใบตามเอฟเฟกต์ของหุบเหวร้อยปราชญ์\nคลิกการ์ดในมือใบไหนก็ได้',
        focus: () => ['[data-hand-card]'],
        allow: () => PLAY,
        expect: (a) => a.type === 'choose',
        until: (s) => !s.choice,
      },
      { text: 'เน็กซัสให้ผลทุกเทิร์นตราบที่อยู่บนสนาม\nเบิร์สเปิดใช้ได้ฟรีเมื่อเงื่อนไขเกิด แม้เป็นเทิร์นของคู่แข่ง' },
    ],
  },
  {
    id: 'final',
    title: 'บทที่ 6: ด่านสุดท้าย',
    sub: 'เล่นเองเต็มที่ · ทำ Life คู่แข่งให้เป็น 0',
    botSummons: true,
    passed: (s) => s.winner === 'p1',
    setup: () => {
      let s = game([SOUL(), HIEN(), KABU(), DARIU()], { firstPlayerSkipsAttackStep: false, initialReserve: 5 });
      s = act(s, { type: 'drawStep', player: 'p1' });
      s = structuredClone(s);
      put(s, 'p1', DARIU(), 3); // Lv2 BP 6000
      put(s, 'p1', JINRAI(), 1); // Lv1
      put(s, 'p2', DARIU(), 1); // Lv1 BP 3000
      s.players.p2.life = s.players.p2.life.slice(0, 3);
      return { state: s, ids: {} };
    },
    steps: [
      {
        text: 'ด่านสุดท้าย: เล่นเองเต็มที่!\nคู่แข่งมี Life 3 ดวง และจะอัญเชิญ โจมตี ป้องกันตอบโต้\nใช้ทุกอย่างที่เรียนมา: อัญเชิญ · เมจิค [Main]/[Flash] · โจมตีเมื่อคู่แข่งป้องกันไม่ได้',
      },
      {
        text: 'เป้าหมาย: ทำ Life ของคู่แข่งให้เป็น 0 · กดป้ายสเต็ปกลางจอเพื่อไป Attack / จบเทิร์น',
        free: true,
        draw: true,
        until: (s) => !!s.winner,
      },
      { text: (s) => (s.winner === 'p1' ? 'ชนะแล้ว! ผ่านบทเรียนพื้นฐานครบทุกบท\nพร้อมดวลจริงแล้ว: ลองจัดเด็คของตัวเอง หรือไปดวลออนไลน์กับเพื่อนได้เลย' : 'Life ของเราหมดก่อน…') },
    ],
  },
];
