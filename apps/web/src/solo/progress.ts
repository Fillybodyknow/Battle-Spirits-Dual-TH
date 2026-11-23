/**
 * สถานะโหมด Solo: หน้าที่เปิดอยู่ + ความคืบหน้าของด่าน (localStorage 'bs-solo' · ซิงก์ตามบัญชี: SETTING_KEYS ใน account.ts)
 */
import { create } from 'zustand';
import { GATES, gateById, type Gate, type GateNode } from './gates';

const KEY = 'bs-solo';

export interface SoloProgress {
  /** โหนดที่ผ่านแล้ว ("ด่าน/โหนด") */
  cleared: string[];
  /** ด่านที่เล่นล่าสุด */
  last: string | null;
}

/**
 * รายการ "ด่าน/โหนด" ที่ยังมีอยู่จริง: บทที่เขียนใหม่ (เปลี่ยน id โหนด) = ความคืบหน้าเดิมของบทนั้นถูกล้างทิ้ง
 * (ป่าวายุเขียนใหม่ 41.1.0 · เจ้าของโปรเจกต์กำหนดให้ล้าง) · ด่านที่ไม่รู้จัก (เช่น จากเวอร์ชันใหม่กว่า) คงไว้
 */
function stillExists(entry: string): boolean {
  const [gateId, nodeId] = entry.split('/');
  const gate = gateId ? gateById(gateId) : undefined;
  return !gate || gate.nodes.some((n) => n.id === nodeId);
}

function load(): SoloProgress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoloProgress> | null;
    return {
      cleared: Array.isArray(p?.cleared) ? p.cleared.filter((x): x is string => typeof x === 'string' && stillExists(x)) : [],
      last: typeof p?.last === 'string' ? p.last : null,
    };
  } catch {
    return { cleared: [], last: null };
  }
}
function save(p: SoloProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ไม่มีที่เก็บ: จำได้แค่รอบนี้ */
  }
}

export type SoloView = 'home' | 'stories' | 'gate';

interface SoloState {
  view: SoloView;
  /** ด่านที่เลือกในรายการ / ที่เปิดแผนที่อยู่ */
  gateId: string;
  /** ฉากเปิดการ์ดก่อนเข้าแผนที่ */
  intro: boolean;
  /** เนื้อเรื่องที่กำลังอ่าน (โหนด scenario / goal) */
  reading: string | null;
  progress: SoloProgress;
  /** แผงด่านดวลที่เปิดอยู่บนแผนที่ (id โหนด) · กลับจากหน้าเลือก/แก้เด็คแล้วเปิดค้างไว้ */
  panel: string | null;
}

export const useSolo = create<SoloState>(() => ({ view: 'home', gateId: GATES[0]?.id ?? '', intro: false, reading: null, progress: load(), panel: null }));

const key = (gateId: string, nodeId: string) => `${gateId}/${nodeId}`;

/** โหนดนี้ผ่านแล้วไหม (โหนดกั้น "locked" = ผ่านเองเมื่อปลดล็อก) */
export function nodeCleared(p: SoloProgress, gate: Gate, node: GateNode): boolean {
  if (node.kind === 'locked') return nodeUnlocked(p, gate, node);
  return p.cleared.includes(key(gate.id, node.id));
}

/** เล่นโหนดนี้ได้หรือยัง (โหนดใน after ผ่านครบ และโหนดใน afterAny ผ่านอย่างน้อยหนึ่ง) */
export function nodeUnlocked(p: SoloProgress, gate: Gate, node: GateNode): boolean {
  const done = (id: string) => {
    const prev = gate.nodes.find((n) => n.id === id);
    return !prev || nodeCleared(p, gate, prev);
  };
  const any = node.afterAny ?? [];
  return (node.after ?? []).every(done) && (any.length === 0 || any.some(done));
}

/** ผ่านด่านแล้ว (ถึงเป้าหมาย) · บทที่ยังไม่เปิด/ไม่มีเป้าหมาย = ยังไม่ผ่าน */
export function gateCleared(p: SoloProgress, gate: Gate): boolean {
  const goals = gate.nodes.filter((n) => n.kind === 'goal');
  return !gate.soon && goals.length > 0 && goals.every((n) => nodeCleared(p, gate, n));
}

/** บทนี้เล่นได้ไหม: เปิดแล้ว และผ่านบทที่ต้องผ่านก่อนครบ */
export function gateUnlocked(p: SoloProgress, gate: Gate): boolean {
  if (gate.soon) return false;
  return (gate.requires ?? []).every((id) => {
    const g = gateById(id);
    return !!g && gateCleared(p, g);
  });
}

/** ได้ตราแคว้นของบทนี้แล้ว */
export const emblemEarned = (p: SoloProgress, gate: Gate) => !!gate.emblem && gateCleared(p, gate);

/** ผ่านทุกโหนด (รวมเส้นทางพิเศษ) */
export const gateComplete = (p: SoloProgress, gate: Gate) => gate.nodes.length > 0 && gate.nodes.every((n) => nodeCleared(p, gate, n));

/** โหนดถัดไปที่ควรเล่น (เล่นได้แต่ยังไม่ผ่าน ตัวแรกตามลำดับ) */
export function nextNode(p: SoloProgress, gate: Gate): GateNode | null {
  // ทางแยกที่ไม่ได้เลือก (อีกทางผ่านแล้ว จนโหนดที่รวมทางปลดล็อก) ไม่นับเป็นด่านถัดไป: ยังกลับไปเล่นได้ แต่ไม่ชี้ไปหา
  // ทั้งสาย: โหนดที่ทุกทางต่อไปจบที่ทางแยกที่ไม่ได้เลือก ก็ข้ามด้วย
  const skipped = (n: GateNode, seen = new Set<string>()): boolean => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    if (gate.nodes.some((m) => m.afterAny?.includes(n.id) && nodeUnlocked(p, gate, m))) return true;
    const next = gate.nodes.filter((m) => m.after?.includes(n.id));
    return next.length > 0 && next.every((m) => skipped(m, seen));
  };
  const playable = (n: GateNode) => n.kind !== 'locked' && nodeUnlocked(p, gate, n) && !nodeCleared(p, gate, n);
  return gate.nodes.find((n) => playable(n) && !skipped(n)) ?? gate.nodes.find(playable) ?? null;
}

export function markCleared(gateId: string, nodeId: string) {
  const p = useSolo.getState().progress;
  const k = key(gateId, nodeId);
  if (p.cleared.includes(k)) return;
  const progress = { ...p, cleared: [...p.cleared, k] };
  save(progress);
  useSolo.setState({ progress });
}

export function markLast(gateId: string) {
  const p = useSolo.getState().progress;
  if (p.last === gateId) return;
  const progress = { ...p, last: gateId };
  save(progress);
  useSolo.setState({ progress });
}

/** เปิดแผนที่ด่าน (withIntro = เล่นฉากเปิดการ์ดก่อน) */
export function openGate(gateId: string, withIntro: boolean) {
  if (!gateById(gateId)) return;
  markLast(gateId);
  useSolo.setState({ view: 'gate', gateId, intro: withIntro, reading: null });
}

/** โหลดความคืบหน้าใหม่ (ซิงก์จากบัญชีแล้ว) */
export function reloadSoloProgress() {
  useSolo.setState({ progress: load() });
}
