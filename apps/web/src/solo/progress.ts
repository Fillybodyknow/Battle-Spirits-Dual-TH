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

function load(): SoloProgress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoloProgress> | null;
    return {
      cleared: Array.isArray(p?.cleared) ? p.cleared.filter((x): x is string => typeof x === 'string') : [],
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
}

export const useSolo = create<SoloState>(() => ({ view: 'home', gateId: GATES[0]?.id ?? '', intro: false, reading: null, progress: load() }));

const key = (gateId: string, nodeId: string) => `${gateId}/${nodeId}`;

/** โหนดนี้ผ่านแล้วไหม (โหนดกั้น "locked" = ผ่านเองเมื่อปลดล็อก) */
export function nodeCleared(p: SoloProgress, gate: Gate, node: GateNode): boolean {
  if (node.kind === 'locked') return nodeUnlocked(p, gate, node);
  return p.cleared.includes(key(gate.id, node.id));
}

/** เล่นโหนดนี้ได้หรือยัง (โหนดใน after ผ่านครบ) */
export function nodeUnlocked(p: SoloProgress, gate: Gate, node: GateNode): boolean {
  return (node.after ?? []).every((id) => {
    const prev = gate.nodes.find((n) => n.id === id);
    return !prev || nodeCleared(p, gate, prev);
  });
}

/** ผ่านด่านแล้ว (ถึงเป้าหมาย) */
export const gateCleared = (p: SoloProgress, gate: Gate) => gate.nodes.filter((n) => n.kind === 'goal').every((n) => nodeCleared(p, gate, n));

/** ผ่านทุกโหนด (รวมเส้นทางพิเศษ) */
export const gateComplete = (p: SoloProgress, gate: Gate) => gate.nodes.every((n) => nodeCleared(p, gate, n));

/** โหนดถัดไปที่ควรเล่น (เล่นได้แต่ยังไม่ผ่าน ตัวแรกตามลำดับ) */
export function nextNode(p: SoloProgress, gate: Gate): GateNode | null {
  return gate.nodes.find((n) => n.kind !== 'locked' && nodeUnlocked(p, gate, n) && !nodeCleared(p, gate, n)) ?? null;
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
