/**
 * คุณภาพการเชื่อมต่อระหว่างเล่นออนไลน์ (ปิง) — ให้ผู้เล่นรู้ตัวว่าเน็ตช้า/หลุด และเห็นปิงของคนอื่นในห้อง
 *
 * - ปิงของเรา: เขียน rooms/<code>/pings/<ที่นั่ง> = { ms, n } ทุก PROBE_MS แล้ววัดเวลาจนเซิร์ฟเวอร์ตอบรับ (1 รอบไป-กลับ)
 *   ค่า ms ที่เขียนคือปิงล่าสุดของเรา → เครื่องอื่นเห็นปิงของเรา · n เพิ่มทุกครั้ง (ค่าเดิมซ้ำ Firebase ไม่แจ้งเปลี่ยน)
 * - ปิงของคนอื่น: ฟัง rooms/<code>/pings · ไม่ได้ข่าวเกิน STALE_MS = "ไม่ตอบสนอง" · หลุดจริง = เซิร์ฟเวอร์ลบค่าของเขาให้ (removeOnDisconnect)
 * - action ที่ส่งแล้วยังไม่กลับมา (ออนไลน์ action มีผลเมื่อเซิร์ฟเวอร์ส่งกลับ): pendingSince → ป้าย "กำลังส่ง…"
 * - หลุดจากเซิร์ฟเวอร์ (Firebase .info/connected) → connected = false
 * ไม่กระทบ engine (ข้อมูลแสดงผลเท่านั้น)
 */
import { create } from 'zustand';
import type { TableSeat, Transport } from './transport';

const PROBE_MS = 3000;
/** ไม่ได้ข่าวจากที่นั่งนั้นนานเท่านี้ = ไม่ตอบสนอง */
export const STALE_MS = 10_000;

/** ms = ปิงที่เขาวัดได้ · gone = ค่าของเขาถูกลบ (หลุด/ออกจากเกม) · seenAt = ได้ข่าวล่าสุด */
export type PeerPing = { ms: number; seenAt: number; gone?: boolean };

export interface NetState {
  /** ต่อกับเซิร์ฟเวอร์อยู่ (หลุด = false) */
  connected: boolean;
  /** ปิงของเรา (ms) · null = ยังวัดไม่ได้ */
  rtt: number | null;
  /** กำลังรอเซิร์ฟเวอร์ตอบรับการวัดตั้งแต่เมื่อไร (ค้างนาน = ปิงสูงกว่าค่าล่าสุด) */
  probeSince: number | null;
  /** ปิงของที่นั่งอื่น (ค่าที่เขาวัดเอง) */
  peers: Partial<Record<TableSeat, PeerPing>>;
  /** action ของเราที่ส่งไปแล้วยังไม่กลับมาตั้งแต่เมื่อไร (null = ไม่มีค้าง) */
  pendingSince: number | null;
}

const initial: NetState = { connected: true, rtt: null, probeSince: null, peers: {}, pendingSince: null };
export const useNet = create<NetState>(() => initial);

/** ปิงที่แสดง: ค่าที่วัดได้ หรือเวลาที่รอการวัดครั้งนี้อยู่ถ้านานกว่า (เน็ตค้างจะเห็นตัวเลขขึ้นเรื่อย ๆ) */
export function shownRtt(s: NetState, now = Date.now()): number | null {
  const waiting = s.probeSince ? now - s.probeSince : 0;
  if (s.rtt === null) return waiting > PROBE_MS ? waiting : null;
  return Math.max(s.rtt, waiting);
}

/** ระดับสัญญาณ: 3 = ดี · 2 = พอใช้ · 1 = ช้า · 0 = หลุด/ไม่ตอบสนอง */
export function pingLevel(ms: number | null, ok = true): 0 | 1 | 2 | 3 {
  if (!ok) return 0;
  if (ms === null) return 3;
  if (ms < 150) return 3;
  if (ms < 400) return 2;
  return 1;
}

/** action ที่ส่งไปแล้วยังไม่กลับมา */
const pending = new Set<number>();
export function markSent(index: number) {
  pending.add(index);
  if (useNet.getState().pendingSince === null) useNet.setState({ pendingSince: Date.now() });
}
export function markEchoed(index: number) {
  if (!pending.delete(index)) return;
  useNet.setState({ pendingSince: pending.size ? Date.now() : null });
}
export function clearPending() {
  pending.clear();
  if (useNet.getState().pendingSince !== null) useNet.setState({ pendingSince: null });
}

/**
 * เริ่มวัดการเชื่อมต่อของห้องเกม · seat = ที่นั่งของเรา (ผู้ชม = ไม่มี: ไม่เขียนปิงของตัวเอง แต่ยังเห็นของผู้เล่น)
 * คืนฟังก์ชันหยุด
 */
export function startNet(transport: Transport, code: string, seat: TableSeat | null): () => void {
  useNet.setState(initial);
  clearPending();
  const path = `rooms/${code}/pings`;
  let stopped = false;
  const lastN: Partial<Record<TableSeat, number>> = {};
  const unsubPeers = transport.watchPath(path, (v) => {
    const all = (v ?? {}) as Partial<Record<TableSeat, { ms?: number; n?: number }>>;
    const now = Date.now();
    const prev = useNet.getState().peers;
    const peers: Partial<Record<TableSeat, PeerPing>> = {};
    for (const [k, p] of Object.entries(all) as [TableSeat, { ms?: number; n?: number }][]) {
      if (k === seat || !p) continue;
      const fresh = p.n !== lastN[k];
      lastN[k] = p.n;
      peers[k] = { ms: p.ms ?? 0, seenAt: fresh ? now : (prev[k]?.seenAt ?? now) };
    }
    // เคยเห็นแล้วหายไป = เซิร์ฟเวอร์ลบให้ตอนหลุด (หรือออกจากเกม)
    for (const [k, p] of Object.entries(prev) as [TableSeat, PeerPing][]) if (!peers[k] && p) peers[k] = { ...p, gone: true };
    useNet.setState({ peers });
  });
  const unsubConn =
    transport.watchConnected?.((c) => {
      useNet.setState({ connected: c });
      // ต่อกลับมาแล้ว: ตั้งให้เซิร์ฟเวอร์ลบปิงของเราเมื่อหลุดอีกครั้ง (ของเดิมถูกใช้ไปตอนหลุด)
      if (c && seat && !stopped) void transport.removeOnDisconnect(`${path}/${seat}`).catch(() => {});
    }) ?? (() => {});

  let n = 0;
  const samples: number[] = [];
  const probe = () => {
    if (stopped || !seat || useNet.getState().probeSince !== null) return;
    const t0 = Date.now();
    useNet.setState({ probeSince: t0 });
    transport
      .setPath(`${path}/${seat}`, { ms: useNet.getState().rtt ?? 0, n: ++n })
      .then(() => {
        if (stopped) return;
        samples.push(Date.now() - t0);
        if (samples.length > 3) samples.shift();
        // ค่ากลางของ 3 ครั้งล่าสุด (กันตัวเลขกระโดดจากครั้งเดียวที่สะดุด)
        const rtt = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
        useNet.setState({ rtt, probeSince: null });
      })
      .catch(() => {
        if (!stopped) useNet.setState({ probeSince: null });
      });
  };
  if (seat) {
    // ปิดแท็บ/เน็ตหลุด: เซิร์ฟเวอร์ลบปิงของเราให้ → เครื่องอื่นรู้ว่าเราหลุด
    void transport.removeOnDisconnect(`${path}/${seat}`).catch(() => {});
    probe();
  }
  const timer = setInterval(probe, PROBE_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    unsubPeers();
    unsubConn();
    if (seat) void transport.removePath(`${path}/${seat}`).catch(() => {});
    clearPending();
    useNet.setState(initial);
  };
}
