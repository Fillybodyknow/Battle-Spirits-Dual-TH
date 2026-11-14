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
 *
 * action เก็บเป็นสตริง JSON เพราะ Realtime Database ทิ้งค่า null และ array ว่าง
 */
import type { Action, PlayerId } from '@bs/engine';

export interface RoomSetup {
  round: number;
  seed: number;
  decks: { p1: string; p2: string | null };
}

export interface RoomInfo {
  seats: Partial<Record<PlayerId, string>>;
  setup: RoomSetup;
  /** ชื่อที่ผู้เล่นตั้งเอง */
  names?: Partial<Record<PlayerId, string>>;
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
  /** เริ่มรอบใหม่ (เล่นใหม่) */
  setSetup(code: string, setup: RoomSetup): Promise<void>;
  /** ออกจากที่นั่ง */
  leave(code: string, seat: PlayerId): Promise<void>;
}

export const actionKey = (index: number) => String(index).padStart(6, '0');
export const encodeAction = (a: Action) => JSON.stringify(a);
export const decodeAction = (s: string) => JSON.parse(s) as Action;
