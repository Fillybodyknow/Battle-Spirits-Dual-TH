/**
 * ข้อมูลโหมด Story (SOLO → STORIES): แต่ละ "ด่าน" (Gate) = แผนที่ของโหนด เนื้อเรื่อง / ฝึกซ้อม / ดวล / เป้าหมาย
 *
 * เขียนด่านใหม่: เพิ่ม object ใน GATES
 *  - cardNo = การ์ดหน้าปกของด่าน (ภาพในรายการ + ฉากเปิดการ์ด)
 *  - nodes: ตำแหน่งบนแผนที่ = col (ซ้าย→ขวา) / row (0 = แถวบน, 1 = แถวล่าง) · after = โหนดที่ต้องผ่านก่อน (ปลดล็อก + เส้นเชื่อม)
 *  - scenario / goal: lines = บทพูดทีละกล่อง (speaker ว่าง = คำบรรยาย)
 *  - practice: ใช้เด็คที่ด่านให้ยืม (playerDeck) · duel: ผู้เล่นเลือกเด็คเอง (หรือใช้เด็คยืมของด่านก็ได้)
 *  - stars 1–6 = ความเก่งของบอท (6 = คิดล่วงหน้าอีกหนึ่งท่า) · botDeck = เด็คของคู่แข่ง (รหัส Starter เช่น 'sd02' หรือ deck(...) ด้านล่าง)
 *  - locked: true = โหนดกั้น (ผ่านอัตโนมัติเมื่อโหนดใน after ผ่านครบ ใช้แยกเส้นทางด่านพิเศษ)
 * ความคืบหน้าเก็บใน localStorage 'bs-solo' (ซิงก์ตามบัญชี)
 */
import type { DeckEntry } from '@bs/cards';
import { encodeDeck, type DeckId } from '../decks';

export interface StoryLine {
  /** ชื่อผู้พูด (ว่าง = คำบรรยาย) */
  speaker?: string;
  text: string;
}

export type GateNodeKind = 'scenario' | 'practice' | 'duel' | 'goal' | 'locked';

export interface GateNode {
  id: string;
  kind: GateNodeKind;
  col: number;
  row: 0 | 1;
  after?: string[];
  title?: string;
  lines?: StoryLine[];
  stars?: number;
  /** ชื่อคู่แข่งบนกระดาน */
  opponent?: string;
  /** รูปโปรไฟล์ของคู่แข่ง (รหัสการ์ด · ไม่ระบุ = การ์ดหน้าปกของด่าน) */
  avatar?: string;
  /** คำอธิบายในแผงด่านดวล (ไม่ระบุ = ชื่อคู่แข่ง + เด็ค) */
  description?: string;
  /** คำอธิบายเด็คของคู่แข่ง (หน้าดูเด็คคู่แข่ง) */
  deckDescription?: string;
  botDeck?: DeckId;
  /** เด็คที่ด่านให้ยืม (practice บังคับใช้ · duel เลือกได้) */
  playerDeck?: DeckId;
}

export interface Gate {
  id: string;
  title: string;
  /** การ์ดหน้าปก */
  cardNo: string;
  /** คำอธิบายด่าน (แผงรายละเอียด) */
  description: string;
  nodes: GateNode[];
}

/** เด็คที่กำหนดในด่าน: [รหัสการ์ด, จำนวน][] → DeckId (รหัส c:...) */
const deck = (name: string, list: [string, number][]): DeckId => encodeDeck(name, list.map(([cardNo, count]): DeckEntry => ({ cardNo, count })));

/** เด็คจอมมารสวรรค์ (เจ้าของโปรเจกต์จัด: สปิริตหลายสี ขาว/แดง/ม่วง) */
const SIX_HEAVENS = deck('เด็คจอมมารสวรรค์', [
  ['BS04-C082', 1],
  ['BS12-C009', 2],
  ['BS14-X01', 1],
  ['BS22-C010', 2],
  ['BS22-U057', 3],
  ['BS22-C070', 1],
  ['BS23-M034', 2],
  ['BS23-X04', 1],
  ['BS24-U102', 1],
  ['BS24-R107', 2],
  ['P14-U29', 2],
  ['SD06-U016', 3],
  ['SD32-C001', 3],
  ['SD32-C002', 3],
  ['SD32-C003', 2],
  ['SD32-M004', 1],
  ['SD32-U005', 2],
  ['SD32-C006', 2],
  ['SD32-U007', 2],
  ['SD32-X01', 1],
  ['SD32-X02', 3],
]);

export const GATES: Gate[] = [
  {
    id: 'flame-gate',
    title: 'ประตูเปลวเพลิง',
    cardNo: 'BS31-X01',
    description: 'เรียนรู้พื้นฐานการบุกด้วยสปิริตสีแดง: อัญเชิญ เพิ่มเลเวล แล้วโจมตีให้ไลฟ์คู่แข่งหมด\n\nเปลวไฟที่ไม่เคยดับรอผู้ท้าชิงอยู่ที่ปลายทาง',
    nodes: [
      {
        id: 'intro',
        kind: 'scenario',
        col: 0,
        row: 1,
        title: 'จุดเริ่มต้น',
        lines: [
          { text: 'ณ ประตูเปลวเพลิง ผู้ท้าชิงทุกคนต้องพิสูจน์ตัวเองด้วยการดวล' },
          { speaker: 'ผู้เฝ้าประตู', text: 'เจ้ามาถึงที่นี่แล้วสินะ ก่อนจะผ่านไปได้ ข้าจะดูว่าเจ้าคุมสปิริตได้ดีแค่ไหน' },
          { speaker: 'ผู้เฝ้าประตู', text: 'ลองใช้เด็คที่ข้าให้ยืมดูก่อน อัญเชิญ เพิ่มเลเวล แล้วบุกให้ถึงไลฟ์ของคู่แข่ง' },
        ],
      },
      { id: 'practice', kind: 'practice', col: 1, row: 1, after: ['intro'], stars: 1, opponent: 'ผู้ฝึกหัด', description: 'ฝึกอัญเชิญและโจมตีด้วยเด็คที่ด่านให้ยืม ลองวางคอร์เพิ่มเลเวลสปิริต แล้วโจมตีให้ไลฟ์คู่แข่งหมด', avatar: 'BS31-C027', playerDeck: 'sd01', botDeck: 'sd02', title: 'ฝึกซ้อม' },
      { id: 'duel1', kind: 'duel', col: 2, row: 1, after: ['practice'], stars: 2, opponent: 'ผู้เฝ้าประตู', description: 'ผู้เฝ้าประตูรอผู้ท้าชิงอยู่หน้าประตูเปลวเพลิง ใช้ทุกอย่างที่ฝึกมาเพื่อผ่านไปให้ได้', avatar: 'BS31-R067', playerDeck: 'sd01', botDeck: 'sd03', title: 'ดวลกับผู้เฝ้าประตู' },
      {
        id: 'goal',
        kind: 'goal',
        col: 3,
        row: 1,
        after: ['duel1'],
        title: 'ผ่านประตู',
        lines: [
          { speaker: 'ผู้เฝ้าประตู', text: 'ฝีมือไม่เลว... ประตูเปลวเพลิงยอมรับเจ้าแล้ว' },
          { text: 'แต่เหนือประตูนี้ขึ้นไป ยังมีผู้ท้าชิงที่แข็งแกร่งกว่ารออยู่' },
        ],
      },
      { id: 'lock', kind: 'locked', col: 3, row: 0, after: ['goal'], title: 'เส้นทางพิเศษ' },
      { id: 'duel2', kind: 'duel', col: 4, row: 0, after: ['lock'], stars: 4, opponent: 'นักดวลเปลวเพลิง', description: 'นักดวลเปลวเพลิงเล่นเร็วและดุดัน อย่าปล่อยให้ไลฟ์เหลือน้อยจนไม่มีตัวป้องกัน', avatar: 'BS31-U060', playerDeck: 'sd01', botDeck: 'sd04', title: 'ดวลพิเศษ' },
      { id: 'duel3', kind: 'duel', col: 5, row: 0, after: ['duel2'], stars: 5, opponent: 'ราชาแห่งเปลวเพลิง', description: 'ราชาแห่งเปลวเพลิงเล่นเต็มกำลัง วางแผนทุกเทิร์นให้ดีก่อนตัดสินใจโจมตี', avatar: 'BS31-X01', playerDeck: 'sd01', botDeck: 'sd01', title: 'ดวลชี้ขาด' },
    ],
  },
  {
    id: 'six-heavens',
    title: 'หกสวรรค์แห่งจอมมาร',
    cardNo: 'SD32-X02',
    description: 'สปิริตหลายสีและความสามารถ Rush: ยิ่งมีเจ็มหลายสีบนฟิลด์ เอฟเฟกต์ยิ่งแรง\n\nจอมมารสวรรค์รอผู้ที่กล้าท้าทายหกสวรรค์',
    nodes: [
      {
        id: 'intro',
        kind: 'scenario',
        col: 0,
        row: 1,
        title: 'ปราสาทสีแดงฉาน',
        lines: [
          { text: 'ปราสาทหกสวรรค์ถูกย้อมด้วยสีแดงฉาน เสียงกึกก้องดังมาจากบัลลังก์ด้านบน' },
          { speaker: 'จอมมารสวรรค์', text: 'สีทั้งหกรวมเป็นหนึ่งเดียวในมือข้า เจ้าจะต้านทานได้หรือ?' },
          { text: 'สปิริตที่มีหลายสีเติมเจ็มให้หลายสีพร้อมกัน ทำให้ Rush ทำงานง่ายขึ้น' },
        ],
      },
      { id: 'practice', kind: 'practice', col: 1, row: 1, after: ['intro'], stars: 2, opponent: 'ทหารเฝ้าปราสาท', description: 'ลองใช้เด็คจอมมารสวรรค์: สปิริตหลายสีเติมเจ็มหลายสีพร้อมกัน ทำให้ Rush ทำงานง่ายขึ้น', avatar: 'SD32-C003', playerDeck: SIX_HEAVENS, botDeck: 'sd04', title: 'ฝึกใช้หลายสี' },
      { id: 'duel1', kind: 'duel', col: 2, row: 1, after: ['practice'], stars: 3, opponent: 'จอมมารสวรรค์', description: 'จอมมารสวรรค์ใช้สปิริตหลายสีเหมือนกัน ระวังเอฟเฟกต์ที่นำสปิริตของเรากลับขึ้นมือ', avatar: 'SD32-X02', playerDeck: SIX_HEAVENS, botDeck: SIX_HEAVENS, deckDescription: 'อัญเชิญสปิริตหลายสีอย่าง ซอร์ดดอล และ นักรบเครื่องกล อิเทะคาชะ เพื่อเติมเจ็มหลายสีบนฟิลด์ ให้ Rush ของการ์ดอย่าง ดรีมเนบิวล่า ทำงานเต็มที่ แล้วปิดเกมด้วย จอมมารสวรรค์ ก็อด-เซคส์',  title: 'ท้าดวลจอมมาร' },
      {
        id: 'goal',
        kind: 'goal',
        col: 3,
        row: 1,
        after: ['duel1'],
        title: 'บัลลังก์ว่างเปล่า',
        lines: [
          { speaker: 'จอมมารสวรรค์', text: 'ไม่น่าเชื่อ... สีทั้งหกของข้าพ่ายแพ้' },
          { text: 'ปราสาทหกสวรรค์เงียบลง แสงสีแดงค่อย ๆ จางหายไป' },
        ],
      },
      { id: 'lock', kind: 'locked', col: 3, row: 0, after: ['goal'], title: 'บัลลังก์ชั้นบน' },
      { id: 'duel2', kind: 'duel', col: 4, row: 0, after: ['lock'], stars: 5, opponent: 'จอมมารสวรรค์ (ตื่นเต็มพลัง)', description: 'จอมมารตื่นเต็มพลังแล้ว ก็อด-เซคส์ ที่มีโซลคอร์จะส่งคอร์ของเราลงแทรชทุกครั้งที่สปิริตหลายสีโจมตี', avatar: 'SD32-X02', playerDeck: SIX_HEAVENS, botDeck: SIX_HEAVENS, deckDescription: 'อัญเชิญสปิริตหลายสีอย่าง ซอร์ดดอล และ นักรบเครื่องกล อิเทะคาชะ เพื่อเติมเจ็มหลายสีบนฟิลด์ ให้ Rush ของการ์ดอย่าง ดรีมเนบิวล่า ทำงานเต็มที่ แล้วปิดเกมด้วย จอมมารสวรรค์ ก็อด-เซคส์',  title: 'จอมมารตื่นเต็มพลัง' },
      // ผ่าน ★5 แล้วค่อยเปิด ★6
      { id: 'duel3', kind: 'duel', col: 5, row: 0, after: ['duel2'], stars: 6, opponent: 'จอมมารสวรรค์ (ร่างสุดท้าย)', description: 'ร่างสุดท้ายของจอมมารคิดล่วงหน้าทุกท่า นี่คือศึกที่ยากที่สุดของหกสวรรค์', avatar: 'SD32-X02', playerDeck: SIX_HEAVENS, botDeck: SIX_HEAVENS, deckDescription: 'อัญเชิญสปิริตหลายสีอย่าง ซอร์ดดอล และ นักรบเครื่องกล อิเทะคาชะ เพื่อเติมเจ็มหลายสีบนฟิลด์ ให้ Rush ของการ์ดอย่าง ดรีมเนบิวล่า ทำงานเต็มที่ แล้วปิดเกมด้วย จอมมารสวรรค์ ก็อด-เซคส์',  title: 'ศึกตัดสินหกสวรรค์' },
    ],
  },
];

export const gateById = (id: string) => GATES.find((g) => g.id === id) ?? null;
