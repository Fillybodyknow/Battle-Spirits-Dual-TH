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
 *   rooms/<code>/meta               { name, comment, listed, createdAt } ข้อมูลห้อง (Duel Room)
 *   lobby/<code>                    LobbyEntry: รายการห้องที่เปิดให้เห็น (ลบเมื่อห้องเต็ม/เจ้าของออก/หลุด)
 *
 * action เก็บเป็นสตริง JSON เพราะ Realtime Database ทิ้งค่า null และ array ว่าง
 */
import type { Action, PlayerId } from '@bs/engine';

export interface RoomSetup {
  round: number;
  seed: number;
  decks: { p1: string; p2: string | null };
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
}
export interface DuelTable {
  seats?: Partial<Record<PlayerId, string>>;
  ready?: Partial<Record<PlayerId, boolean>>;
  /** รหัสห้องเกมที่โต๊ะนี้กำลังดวล */
  game?: string;
}
export interface DuelRoom {
  kind: 'duel';
  host: string;
  meta: RoomMeta & { max: number; tables: number; version: string };
  members?: Record<string, DuelMember>;
  tables?: Record<string, DuelTable>;
}

export interface RoomInfo {
  seats: Partial<Record<PlayerId, string>>;
  setup: RoomSetup;
  /** ชื่อที่ผู้เล่นตั้งเอง */
  names?: Partial<Record<PlayerId, string>>;
  /** เวอร์ชันแอปของแต่ละที่นั่ง (ข้อมูลเสริม: เขียนแยกหลังสร้าง/เข้าห้อง ห้องเก่าหรือเครื่องเวอร์ชันเก่าจะไม่มี) */
  versions?: Partial<Record<PlayerId, string>>;
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
  leave(code: string, seat: PlayerId): Promise<void>;
  /** บันทึกเวอร์ชันแอปของที่นั่งนี้ (ใช้กันคนละเวอร์ชันที่ engine ไม่ตรงกันเล่นด้วยกัน) */
  setVersion(code: string, seat: PlayerId, version: string): Promise<void>;
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
  setPath(path: string, value: unknown): Promise<void>;
  removePath(path: string): Promise<void>;
  /** ทรานแซกชัน: fn คืน undefined = ยกเลิก · คืน value หลังเขียน (null = ไม่มีข้อมูล) */
  transactPath(path: string, fn: (cur: any) => unknown): Promise<{ committed: boolean; value: unknown }>;
  /** ลบ path นี้เองเมื่อเครื่องนี้หลุด (ปิดแท็บ/เน็ตหลุด) ทำไม่ได้ก็ข้าม */
  removeOnDisconnect(path: string): Promise<void>;
}

export const actionKey = (index: number) => String(index).padStart(6, '0');
export const encodeAction = (a: Action) => JSON.stringify(a);
export const decodeAction = (s: string) => JSON.parse(s) as Action;
