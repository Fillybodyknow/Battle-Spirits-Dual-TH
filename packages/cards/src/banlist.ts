/**
 * Banlist (ประกาศจำกัดการ์ด) · เจ้าของโปรเจกต์กำหนด: บังคับทุกโหมด (validateDeck ใช้เป็นค่าเริ่มต้น)
 * - ชื่อการ์ด (ตรงกับ "ชื่อ:" ในไฟล์การ์ด) → จำนวนที่ใส่ในเด็คได้: 0 = ห้ามใช้, 1 = จำกัด 1 ใบ, 2 = จำกัด 2 ใบ
 * - การ์ดต่างอาร์ตชื่อเดียวกันนับรวมกัน (เหมือนลิมิต 3 ใบ)
 * - แก้รายการ = เปลี่ยน updated ด้วย (แสดงในหน้า Banlist) · ไม่กระทบ engine (ไม่ต้องขึ้น MAJOR)
 */
export type BanLevel = 0 | 1 | 2;

export const BANLIST: { updated: string; cards: Record<string, BanLevel> } = {
  updated: '2026-11-28',
  cards: {
    // จำกัด 1
    'ยักษ์นักสู้สวมเกราะ ราโชว': 1,
    สิงโตควันม่วง: 1,
    สถานที่ศักดิ์สิทธิ์ต้องห้าม: 1,
  },
};

/** จำนวนสูงสุดที่ใส่ในเด็คได้ของการ์ดชื่อนี้ (ไม่อยู่ใน Banlist = max) */
export const copyLimit = (name: string, max = 3): number => BANLIST.cards[name] ?? max;

export const BAN_LABEL: Record<BanLevel, string> = { 0: 'ห้ามใช้', 1: 'จำกัด 1', 2: 'จำกัด 2' };
