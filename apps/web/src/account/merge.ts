/**
 * รวมข้อมูลในเครื่องกับบนคลาวด์ (ฟังก์ชันล้วน: ไม่แตะ localStorage / เน็ต · เทสต์อยู่ใน merge.test.ts)
 * หลัก: แก้ล่าสุดชนะ (เทียบ updated) · ลบในเครื่องหนึ่ง = หายทุกเครื่อง (คลาวด์เก็บเป็น { deleted })
 */
import type { CloudDeck, CloudSettings } from './cloud';

/** เด็คในเครื่องในรูปที่ซิงก์ (code = รหัสเด็ค "c:..." มีชื่อ + การ์ด + ฟอย) */
export interface SyncDeck {
  id: string;
  code: string;
  updated: number;
}

export interface DeckMerge {
  /** รายการเด็คในเครื่องหลังรวม */
  local: SyncDeck[];
  /** สิ่งที่ต้องเขียนขึ้นคลาวด์ */
  push: Record<string, CloudDeck>;
  /** เด็คที่ซิงก์แล้ว (id → updated) ใช้รู้ว่าเด็คที่หายจากเครื่องคือ "ลบในเครื่องนี้" */
  known: Record<string, number>;
}

/**
 * @param known เด็คที่เคยซิงก์ในเครื่องนี้ (id → updated ตอนซิงก์) · ล็อกอินครั้งแรก = {}
 */
export function mergeDecks(local: SyncDeck[], cloud: Record<string, CloudDeck>, known: Record<string, number>, now: number): DeckMerge {
  const byId = new Map(local.map((d) => [d.id, d]));
  const ids = new Set([...byId.keys(), ...Object.keys(cloud), ...Object.keys(known)]);
  const out: SyncDeck[] = [];
  const push: Record<string, CloudDeck> = {};
  for (const id of ids) {
    const l = byId.get(id);
    const c = cloud[id];
    if (l) {
      if (c?.deleted && c.updated >= l.updated) continue; // ลบจากเครื่องอื่นหลังแก้ล่าสุดในเครื่องนี้
      if (c && !c.deleted && c.code && c.updated > l.updated) {
        out.push({ id, code: c.code, updated: c.updated }); // เครื่องอื่นแก้ใหม่กว่า
        continue;
      }
      out.push(l);
      if (!c || l.updated > c.updated) push[id] = { code: l.code, updated: l.updated };
      continue;
    }
    // ไม่มีในเครื่อง
    if (!c || c.deleted || !c.code) continue;
    const k = known[id];
    if (k !== undefined && c.updated <= k) {
      push[id] = { deleted: true, updated: now }; // ลบในเครื่องนี้หลังซิงก์ (และเครื่องอื่นไม่ได้แก้ต่อ)
      continue;
    }
    out.push({ id, code: c.code, updated: c.updated }); // เด็คใหม่จากเครื่องอื่น / เครื่องอื่นแก้หลังเราลบ
  }
  out.sort((a, b) => b.updated - a.updated);
  return { local: out, push, known: Object.fromEntries(out.map((d) => [d.id, d.updated])) };
}

/** สถานะการตั้งค่าที่ซิงก์ล่าสุดในเครื่องนี้ */
export interface SettingsState {
  hash: string;
  updated: number;
}

export const settingsHash = (values: Record<string, string>) =>
  JSON.stringify(
    Object.keys(values)
      .sort()
      .map((k) => [k, values[k]]),
  );

/**
 * การตั้งค่าทั้งก้อน: ฉบับล่าสุดชนะ
 * @param state null = ยังไม่เคยซิงก์ในเครื่องนี้กับบัญชีนี้ (ล็อกอินครั้งแรก): ถ้าบัญชีมีการตั้งค่าแล้ว ใช้ของบัญชี
 */
export function mergeSettings(
  local: Record<string, string>,
  cloud: CloudSettings | null,
  state: SettingsState | null,
  now: number,
): { apply: Record<string, string> | null; push: CloudSettings | null; state: SettingsState } {
  const hash = settingsHash(local);
  if (!state) {
    if (cloud) return { apply: cloud.values, push: null, state: { hash: settingsHash(cloud.values), updated: cloud.updated } };
    return { apply: null, push: { values: local, updated: now }, state: { hash, updated: now } };
  }
  const changed = hash !== state.hash;
  const localUpdated = changed ? now : state.updated;
  if (cloud && cloud.updated > localUpdated) {
    return { apply: cloud.values, push: null, state: { hash: settingsHash(cloud.values), updated: cloud.updated } };
  }
  if (changed || !cloud) return { apply: null, push: { values: local, updated: localUpdated }, state: { hash, updated: localUpdated } };
  return { apply: null, push: null, state };
}
