/**
 * แสดงคุณภาพการเชื่อมต่อระหว่างเล่นออนไลน์ (ข้อมูลจาก online/net.ts)
 *  - SeatPing: ขีดสัญญาณ + ปิง (ms) ข้างชื่อผู้เล่นบนป้าย · เรา = ที่วัดเอง · คนอื่น = ค่าที่เขาส่งมา
 *  - NetWarning: ป้ายกลางจอด้านบนเมื่อหลุดจากเซิร์ฟเวอร์ / ส่ง action แล้วรอนาน / คู่แข่งไม่ตอบสนอง
 */
import { useEffect, useState } from 'react';
import type { PlayerId } from '@bs/engine';
import { pingLevel, shownRtt, STALE_MS, useNet } from '../online/net';
import { seatKey, type TableSeat } from '../online/transport';
import { useGame } from '../store';

/** รีเฟรชทุก ms (ตัวเลขที่ขึ้นกับเวลา: รอนานเท่าไร / ไม่ได้ข่าวนานเท่าไร) · ไม่ใช่ออนไลน์ = ไม่ตั้งเวลา (ไม่วาดใหม่เปล่า ๆ) */
export function useNow(ms: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

const LEVEL_COLOR = ['#f43f5e', '#f97316', '#facc15', '#4ade80'] as const;
const LEVEL_TEXT = ['หลุด', 'ช้า', 'พอใช้', 'ดี'] as const;

/** ขีดสัญญาณ 3 ขีด (0 = หลุด: ขีดจางทั้งหมด + กากบาท) */
export function PingBars({ level, className = '' }: { level: 0 | 1 | 2 | 3; className?: string }) {
  const color = LEVEL_COLOR[level];
  return (
    <svg viewBox="0 0 14 12" width="14" height="12" className={`shrink-0 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 5} y={8 - i * 4} width="3.5" height={4 + i * 4} rx="0.8" fill={level > i ? color : 'rgba(148,163,184,0.35)'} />
      ))}
      {level === 0 && <path d="M8.5 1.5l5 5M13.5 1.5l-5 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/** ปิงของที่นั่ง (ไม่ใช่ออนไลน์ / ยังไม่มีข้อมูล = ไม่แสดง) */
function useSeatPing(key: TableSeat | null): { ms: number | null; level: 0 | 1 | 2 | 3; label: string } | null {
  const net = useNet();
  const online = useGame((s) => s.online);
  const now = useNow(500, !!online);
  if (!online || !key) return null;
  const mine = !online.spectator && key === seatKey(online.me, online.seat ?? 0);
  if (mine) {
    const ms = shownRtt(net, now);
    const level = pingLevel(ms, net.connected);
    return { ms, level, label: !net.connected ? 'หลุด' : ms === null ? '…' : `${ms} ms` };
  }
  const p = net.peers[key];
  if (!p) return null;
  const stale = p.gone || now - p.seenAt > STALE_MS;
  const level = pingLevel(p.ms, !stale);
  return { ms: p.ms, level, label: p.gone ? 'หลุด' : stale ? 'ไม่ตอบสนอง' : `${p.ms} ms` };
}

/** ป้ายปิงเล็ก ๆ ข้างชื่อผู้เล่น */
export function SeatPing({ player, seat }: { player: PlayerId; seat: number }) {
  const key = seatKey(player, seat ? 1 : 0);
  const ping = useSeatPing(key);
  if (!ping) return null;
  return (
    <span
      data-ping={key}
      title={`การเชื่อมต่อ: ${LEVEL_TEXT[ping.level]}${ping.ms !== null && ping.level > 0 ? ` (ปิง ${ping.ms} ms)` : ''}`}
      className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold tabular-nums"
      style={{ color: LEVEL_COLOR[ping.level] }}
    >
      <PingBars level={ping.level} />
      {ping.label}
    </span>
  );
}

/** ชื่อของที่นั่ง (ใช้ในป้ายเตือน) */
function seatName(names: Partial<Record<TableSeat, string>>, k: TableSeat): string {
  return names[k] ?? 'คู่แข่ง';
}

/** ป้ายเตือนกลางจอด้านบน: หลุด / ส่งแล้วรอนาน / ผู้เล่นอื่นไม่ตอบสนอง */
export function NetWarning() {
  const online = useGame((s) => s.online);
  const net = useNet();
  const now = useNow(250, !!online && online.status !== 'waiting');
  if (!online || online.status === 'waiting') return null;
  let tone: 'red' | 'amber' | 'sky' | null = null;
  let text = '';
  const waited = net.pendingSince ? now - net.pendingSince : 0;
  const myKey = online.spectator ? null : seatKey(online.me, online.seat ?? 0);
  const silent = (Object.entries(net.peers) as [TableSeat, NonNullable<(typeof net.peers)[TableSeat]>][]).filter(
    ([k, p]) => k !== myKey && (p.gone || now - p.seenAt > STALE_MS),
  );
  if (!net.connected) {
    tone = 'red';
    text = 'ขาดการเชื่อมต่อกับเซิร์ฟเวอร์ · กำลังเชื่อมต่อใหม่… (สิ่งที่กดระหว่างนี้จะส่งเมื่อต่อติด)';
  } else if (waited > 2500) {
    tone = 'amber';
    text = `เน็ตช้า · รอเซิร์ฟเวอร์ตอบกลับ ${(waited / 1000).toFixed(1)} วิ (ไม่ต้องกดซ้ำ)`;
  } else if (waited > 600) {
    tone = 'sky';
    text = 'กำลังส่ง…';
  } else if (silent.length) {
    tone = 'amber';
    const [k, p] = silent[0]!;
    text = p.gone ? `${seatName(online.names, k)} หลุดการเชื่อมต่อ · รอกลับมา…` : `${seatName(online.names, k)} ไม่ตอบสนอง · อาจเน็ตช้าหรือหลุด`;
  }
  if (!tone) return null;
  const cls =
    tone === 'red'
      ? 'border-rose-400/70 bg-rose-950/90 text-rose-100'
      : tone === 'amber'
        ? 'border-amber-300/70 bg-amber-950/90 text-amber-100'
        : 'border-sky-300/50 bg-slate-950/85 text-sky-100';
  return (
    <div
      data-net-warning={tone}
      className={`pointer-events-none fixed top-14 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold shadow-lg ${cls}`}
    >
      {tone === 'sky' ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-300/30 border-t-sky-200" />
      ) : (
        <PingBars level={tone === 'red' ? 0 : 1} />
      )}
      {text}
    </div>
  );
}
