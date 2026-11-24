/**
 * ชั้นส่งข้อมูลของการเล่นออนไลน์
 *
 * engine เดิน deterministic (seed + applyAction) จึงซิงก์แค่ "ค่าตั้งต้นของเกม + action ตามลำดับ"
 * ทั้งสองเครื่องเล่น action ชุดเดียวกันซ้ำ → ได้ state และแอนิเมชันเหมือนกัน
 *
 * โครงสร้างข้อมูล (Realtime Database):
 *   rooms/<code>/seats/{p1,p2}      uid ของผู้เล่นแต่ละที่นั่ง
 *   rooms/<code>/setup              { round, seed, decks: { p1, p2 } } (round เพิ่มเมื่อเล่นใหม่)
 *   rooms/<code>/actions/<round>/<000000> = JSON ของ action (ลำดับต่อเนื่อง ไม่มีช่องว่าง)
 *   rooms/<code>/avatars/{p1,p2}  รูปโปรไฟล์ (รหัสการ์ด) ของแต่ละที่นั่ง
 *   rooms/<code>/levels/{p1,p2}   เลเวลผู้เล่นของแต่ละที่นั่ง
 *   rooms/~index/<code>            เวลาที่ห้องมีความเคลื่อนไหวล่าสุด (ms) · ใช้ลบห้องค้าง (sweepRooms ใน store.ts)
 *   rooms/<code>/pings/<ที่นั่ง>   { ms, n } ปิงของที่นั่งนั้น (online/net.ts · ลบเองเมื่อหลุด)
 *   rooms/<code>/meta               { name, comment, listed, createdAt } ข้อมูลห้อง (Duel Room)
 *   lobby/<code>                    LobbyEntry: รายการห้องที่เปิดให้เห็น (ลบเมื่อห้องเต็ม/เจ้าของออก/หลุด)
 *
 * action เก็บเป็นสตริง JSON เพราะ Realtime Database ทิ้งค่า null และ array ว่าง
 */
import type { Action, PlayerId, Seat } from '@bs/engine';

/**
 * ที่นั่งในห้อง/โต๊ะ: p1 / p2 = คนแรกของแต่ละฝั่ง · p1b / p2b = คนที่สองของทีม (Team Battle 2VS2: กติกา 15)
 */
export type TableSeat = PlayerId | 'p1b' | 'p2b';
export const TEAM_SEATS: readonly TableSeat[] = ['p1', 'p1b', 'p2', 'p2b'];
export const seatKey = (side: PlayerId, seat: Seat = 0): TableSeat => (seat ? (`${side}b` as TableSeat) : side);
export const keySide = (key: TableSeat): PlayerId => key.slice(0, 2) as PlayerId;
export const keySeat = (key: TableSeat): Seat => (key.endsWith('b') ? 1 : 0);
/** ที่นั่งที่อยู่ในเกมนี้ (1VS1 = p1/p2 · Team Battle = p1/p2 + คนที่สองของฝั่งที่มีเด็ค) */
export const gameSeats = (setup: Pick<RoomSetup, 'partnerDecks'>): TableSeat[] => [
  'p1',
  ...(setup.partnerDecks?.p1 ? (['p1b'] as const) : []),
  'p2',
  ...(setup.partnerDecks?.p2 ? (['p2b'] as const) : []),
];

export interface RoomSetup {
  round: number;
  seed: number;
  decks: { p1: string; p2: string | null };
  /** Team Battle (2VS2): เด็คของคนที่สองของแต่ละทีม · มีฝั่งเดียว = 1VS2 (อีกฝั่งเล่นคนเดียว) */
  partnerDecks?: { p1?: string; p2?: string };
  /** ผู้เริ่มก่อนที่คนชนะการเสี่ยงเลือกแล้ว (ยังไม่มี = กำลังเลือก) */
  first?: PlayerId;
}

/** ข้อมูลห้องที่เจ้าของตั้งตอนสร้าง (Duel Room) */
export interface RoomMeta {
  name: string;
  comment: string;
  /** แสดงในรายการห้อง */
  listed: boolean;
  createdAt: number;
}

/** ห้องในรายการห้อง (lobby/<code>) */
export interface LobbyEntry {
  code: string;
  name: string;
  comment: string;
  host: string;
  createdAt: number;
  /** เวอร์ชันแอปของเจ้าของห้อง */
  version: string;
  /** จำนวนคนในห้อง / สูงสุด */
  count?: number;
  max?: number;
  /** ห้อง Team Battle (2VS2) */
  team?: boolean;
}

/**
 * ห้องดวล (Duel Room) ที่ rooms/<code>: สมาชิกหลายคน หลายโต๊ะ
 * เกมของแต่ละโต๊ะอยู่ที่ rooms/<code>-<id> (โครงสร้างเดียวกับห้องเกม 2 คนเดิม) ไม่ซ้อนในห้อง
 * ผู้ฟังข้อมูลห้องจะได้ไม่ต้องรับ action ของทุกเกม
 */
export interface DuelMember {
  name: string;
  /** รหัสเด็ค (deckToken) */
  deck: string;
  version: string;
  joinedAt: number;
  /** รูปโปรไฟล์ (รหัสการ์ด) · สมาชิกจากเครื่องเวอร์ชันเก่าไม่มี */
  avatar?: string;
  /** เลเวลผู้เล่น · เครื่องเวอร์ชันเก่าไม่มี */
  level?: number;
}
export interface DuelTable {
  seats?: Partial<Record<TableSeat, string>>;
  ready?: Partial<Record<TableSeat, boolean>>;
  /** รหัสห้องเกมที่โต๊ะนี้กำลังดวล */
  game?: string;
}
export interface DuelRoom {
  kind: 'duel';
  host: string;
  meta: RoomMeta & { max: number; tables: number; version: string; /** Team Battle: โต๊ะละ 4 ที่นั่ง (2VS2) */ team?: boolean };
  members?: Record<string, DuelMember>;
  tables?: Record<string, DuelTable>;
}

/** ห้องเกม (Team Battle มีที่นั่ง p1b / p2b เพิ่ม) */
export interface RoomInfo {
  seats: Partial<Record<TableSeat, string>>;
  setup: RoomSetup;
  /** ชื่อที่ผู้เล่นตั้งเอง */
  names?: Partial<Record<TableSeat, string>>;
  /** เวอร์ชันแอปของแต่ละที่นั่ง (ข้อมูลเสริม: เขียนแยกหลังสร้าง/เข้าห้อง ห้องเก่าหรือเครื่องเวอร์ชันเก่าจะไม่มี) */
  versions?: Partial<Record<TableSeat, string>>;
  /** รูปโปรไฟล์ (รหัสการ์ด) ของแต่ละที่นั่ง (ข้อมูลเสริม เขียนแยกเหมือน versions) */
  avatars?: Partial<Record<TableSeat, string>>;
  /** เลเวลผู้เล่นของแต่ละที่นั่ง (ข้อมูลเสริม เขียนแยกเหมือน avatars) */
  levels?: Partial<Record<TableSeat, number>>;
  meta?: RoomMeta;
}

export interface Transport {
  /** ชื่อแสดงผล เช่น "Firebase" */
  readonly name: string;
  /** uid ของเครื่องนี้ (Firebase: Anonymous Auth) */
  signIn(): Promise<string>;
  /** สร้างห้องใหม่ (ล้มเหลวถ้ารหัสซ้ำ) */
  createRoom(code: string, info: RoomInfo): Promise<void>;
  /** จองที่นั่ง p2 และตั้งเด็คของ p2 คืนข้อมูลห้อง (ล้มเหลวถ้าไม่มีห้องหรือเต็ม) */
  joinRoom(code: string, uid: string, deck: string, name: string): Promise<RoomInfo>;
  /** อ่านห้องหนึ่งครั้ง */
  readRoom(code: string): Promise<RoomInfo | null>;
  /** ติดตามข้อมูลห้อง (ที่นั่ง/ค่าตั้งต้น) */
  watchRoom(code: string, cb: (info: RoomInfo | null) => void): () => void;
  /** จำนวน action ที่มีอยู่แล้วในรอบนี้ (ใช้แยก action เก่าที่ต้องเล่นซ้ำแบบเงียบตอนเข้าห้องกลางเกม) */
  countActions(code: string, round: number): Promise<number>;
  /** ติดตาม action ของรอบนี้ (รวมที่มีอยู่แล้ว) ส่ง index มาด้วย */
  watchActions(code: string, round: number, cb: (index: number, action: Action) => void): () => void;
  /** เขียน action ที่ช่อง index (ไม่ทับถ้ามีแล้ว) คืน false ถ้าช่องถูกใช้ไปแล้ว */
  pushAction(code: string, round: number, index: number, action: Action): Promise<boolean>;
  /** คนชนะการเสี่ยงเลือกผู้เริ่มก่อนของรอบนี้ (เขียนครั้งเดียว) */
  setFirst(code: string, round: number, first: PlayerId): Promise<void>;
  /** เริ่มรอบใหม่ (เล่นใหม่) */
  setSetup(code: string, setup: RoomSetup): Promise<void>;
  /** ออกจากที่นั่ง */
  leave(code: string, seat: TableSeat): Promise<void>;
  /** บันทึกเวอร์ชันแอปของที่นั่งนี้ (ใช้กันคนละเวอร์ชันที่ engine ไม่ตรงกันเล่นด้วยกัน) */
  setVersion(code: string, seat: PlayerId, version: string): Promise<void>;
  /** บันทึกรูปโปรไฟล์ของที่นั่งนี้ (แสดงในเกม/ฉากเปิดเกม) */
  setAvatar(code: string, seat: PlayerId, avatar: string): Promise<void>;
  setLevel(code: string, seat: PlayerId, level: number): Promise<void>;
  /** เจ้าของห้องเปลี่ยนเด็คระหว่างรอ (ไม่เปลี่ยนถ้ามีคู่แข่งนั่งแล้ว) คืน false ถ้าเปลี่ยนไม่ได้ */
  setHostDeck(code: string, deck: string): Promise<boolean>;
  /** ห้องที่เปิดให้เห็นในรายการ */
  listRooms(): Promise<LobbyEntry[]>;
  /** ลงรายการห้อง (ลบเองเมื่อเครื่องนี้หลุดถ้า transport ทำได้) */
  publishRoom(entry: LobbyEntry): Promise<void>;
  /** เอาออกจากรายการห้อง */
  unpublishRoom(code: string): Promise<void>;

  // ---- อ่าน/เขียนตาม path (ใช้กับห้องดวล) ----
  watchPath(path: string, cb: (value: unknown) => void): () => void;
  /** อ่านค่าที่ path หนึ่งครั้ง (ไม่มี = null) */
  readPath(path: string): Promise<unknown>;
  setPath(path: string, value: unknown): Promise<void>;
  removePath(path: string): Promise<void>;
  /** ทรานแซกชัน: fn คืน undefined = ยกเลิก · คืน value หลังเขียน (null = ไม่มีข้อมูล) */
  transactPath(path: string, fn: (cur: any) => unknown): Promise<{ committed: boolean; value: unknown }>;
  /** ลบ path นี้เองเมื่อเครื่องนี้หลุด (ปิดแท็บ/เน็ตหลุด) ทำไม่ได้ก็ข้าม */
  removeOnDisconnect(path: string): Promise<void>;
  /** สถานะการเชื่อมต่อกับเซิร์ฟเวอร์ (true = ต่ออยู่) · ไม่มี = ถือว่าต่ออยู่เสมอ */
  watchConnected?(cb: (connected: boolean) => void): () => void;
}

export const actionKey = (index: number) => String(index).padStart(6, '0');
export const encodeAction = (a: Action) => JSON.stringify(a);
export const decodeAction = (s: string) => JSON.parse(s) as Action;
