/**
 * บัญชีผู้ใช้ + ข้อมูลบนคลาวด์ (ระยะ 1: ล็อกอิน Google / Email แล้วซิงก์ชื่อ รูปโปรไฟล์ เด็ค การตั้งค่า ข้ามเครื่อง)
 *
 * โครงสร้างบน Realtime Database (กฎอยู่ใน database.rules.json)
 *   profiles/<uid>   ผู้เล่นที่ล็อกอินแล้วอ่านได้ · เขียนได้แค่เจ้าของ   { name, avatar, updated }
 *   users/<uid>      อ่าน/เขียนได้แค่เจ้าของ
 *     decks/<id>     { code: รหัสเด็ค "c:..." (ชื่อ + การ์ด + ฟอย), updated } · ลบ = { deleted: true, updated }
 *     settings       { values: { <คีย์ localStorage>: ค่าดิบ }, updated }
 *
 * มีสองตัว: Firebase (ใช้จริง) / ในเครื่อง (?online=local หรือยังไม่ได้ตั้งค่า Firebase: ทดสอบโดยไม่ต้องมีเน็ต)
 */

export interface CloudUser {
  uid: string;
  /** อีเมลของบัญชี (แสดงในหน้าบัญชีของเจ้าของเท่านั้น ไม่เก็บลงโปรไฟล์) */
  email: string | null;
  /** ล็อกอินด้วยอะไร */
  provider: 'google' | 'password';
}

export interface CloudProfile {
  name: string;
  /** รหัสการ์ดที่เลือกเป็นรูปโปรไฟล์ */
  avatar: string;
  updated: number;
}

export interface CloudDeck {
  code?: string;
  deleted?: boolean;
  updated: number;
}

export interface CloudSettings {
  values: Record<string, string>;
  updated: number;
}

export interface CloudData {
  profile: CloudProfile | null;
  decks: Record<string, CloudDeck>;
  settings: CloudSettings | null;
}

/** ข้อผิดพลาดที่แสดงให้ผู้เล่นอ่านได้ (ข้อความไทยแล้ว) */
export class AccountError extends Error {}

export interface CloudBackend {
  name: string;
  /** แจ้งทุกครั้งที่สถานะล็อกอินเปลี่ยน (null = ยังไม่ล็อกอิน / ล็อกอินแบบไม่ระบุตัว) */
  onUser(cb: (user: CloudUser | null) => void): () => void;
  signInGoogle(): Promise<void>;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  load(uid: string): Promise<CloudData>;
  saveProfile(uid: string, profile: CloudProfile): Promise<void>;
  saveDeck(uid: string, id: string, deck: CloudDeck): Promise<void>;
  saveSettings(uid: string, settings: CloudSettings): Promise<void>;
}
