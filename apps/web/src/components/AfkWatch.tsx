/**
 * ออนไลน์ 1VS1: จับคนที่ไม่มีการกระทำนานเกิน (หลุด / ไม่อยู่หน้าจอ) · เจ้าของโปรเจกต์กำหนด
 * - เลือกเริ่มก่อน/หลัง: 10 วิ (นับถอยหลังใน MatchIntro) หมดเวลา = สุ่ม · ตัวสำรองที่นี่เผื่อฉากเปิดไม่ได้เล่น
 * - ระหว่างเกม: ตาที่ต้องรอคู่แข่ง (actorOf) แล้วไม่มี action ใหม่ 60 วิ = ถือว่าหลุด (ขึ้นป้าย) · อีก 60 วิ = แพ้
 *   (เครื่องเราส่ง concede timeout แทนเขา) · คู่แข่งไม่เคยมี action ในเกมนี้เลย = หลุดก่อนได้เล่น → ไม่นับผล ออกได้
 * - ตาของเราเองไม่มีการกระทำ 60 วิ = ป้ายเตือนว่าจะแพ้อัตโนมัติ
 * Team Battle (มีเพื่อนร่วมทีม) ยังไม่ใช้กฎนี้
 */
import { useEffect, useRef, useState } from 'react';
import { actorOf, opponentOf } from '@bs/engine';
import { actedInRound, forfeitOpponent, pregameTimeout, PREGAME_CHOOSE_MS, PREGAME_GRACE_MS, useGame } from '../store';
import { useNow } from './NetStatus';

export const AFK_MS = 60_000;
export const FORFEIT_MS = 120_000;
/** ตัวสำรองช่วงเลือกเริ่มก่อน/หลัง: นับจากตอนเข้าช่วงเลือก (รวมฉากโยนเหรียญราว 5.5 วิ) */
const PREGAME_FALLBACK_MS = 6_000 + PREGAME_CHOOSE_MS + PREGAME_GRACE_MS + 3_000;

export function AfkWatch() {
  const online = useGame((s) => s.online);
  const winner = useGame((s) => s.state.winner);
  const replay = useGame((s) => !!s.replay);
  const team = useGame((s) => !!(s.state.players.p1.partner || s.state.players.p2.partner));
  const actor = useGame((s) => (s.online?.status === 'playing' && !s.state.winner ? actorOf(s.truth ?? s.state) : null));
  const player = !!online && !online.spectator && !replay && !team;
  const playing = player && online!.status === 'playing' && !winner;
  const choosing = player && online!.status === 'choosing';
  const now = useNow(500, playing || choosing);
  const [voided, setVoided] = useState(false);

  // เวลาที่เริ่มรอ: รีเซ็ตเมื่อมี action ใหม่ หรือคนที่ต้องตัดสินใจเปลี่ยน
  const key = `${online?.code}|${online?.setup?.round}|${online?.applied}|${actor}`;
  const since = useRef({ key: '', at: 0 });
  if (since.current.key !== key) since.current = { key, at: Date.now() };
  const choosingAt = useRef(0);
  if (!choosing) choosingAt.current = 0;
  else if (!choosingAt.current) choosingAt.current = Date.now();
  const fired = useRef('');

  const me = online?.me ?? 'p1';
  const opp = opponentOf(me);
  const elapsed = now - since.current.at;
  const waitOpp = playing && actor === opp;
  const waitMe = playing && actor === me;

  useEffect(() => {
    if (choosing && choosingAt.current && now - choosingAt.current >= PREGAME_FALLBACK_MS) pregameTimeout();
    if (!waitOpp || elapsed < FORFEIT_MS || fired.current === key) return;
    fired.current = key;
    if (actedInRound(opp)) forfeitOpponent();
    else setVoided(true);
  }, [now, choosing, waitOpp, elapsed, key, opp]);
  // มี action ใหม่ (คู่แข่งกลับมา) / เกมใหม่ = ล้างสถานะไม่นับผล
  useEffect(() => setVoided(false), [key]);

  if (!playing) return null;
  const left = Math.max(0, Math.ceil((FORFEIT_MS - elapsed) / 1000));
  const oppName = online!.names[opp] ?? 'คู่แข่ง';

  if (voided && waitOpp)
    return (
      <div className="fixed top-1/2 left-1/2 z-[70] flex w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl border border-amber-300/60 bg-slate-950/95 p-5 text-center shadow-2xl">
        <div className="text-lg font-black text-amber-200">{oppName} หลุดการเชื่อมต่อก่อนได้เล่น</div>
        <div className="text-sm text-slate-300">เกมนี้ไม่นับผล (ไม่บันทึกประวัติและ EXP)</div>
        <button type="button" className="btn-game rounded-xl px-8 py-2 font-black" onClick={() => useGame.getState().onlineLeave()}>
          ออกจากเกม
        </button>
      </div>
    );
  if (elapsed < AFK_MS || (!waitOpp && !waitMe)) return null;
  const text = waitOpp
    ? `${oppName} ไม่ตอบสนอง (ถือว่าหลุดการเชื่อมต่อ) · ${actedInRound(opp) ? 'ชนะอัตโนมัติ' : 'เกมนี้ไม่นับผล'}ใน ${left} วิ`
    : `คุณไม่มีการกระทำนานเกินไป · ถ้าไม่ทำอะไรภายใน ${left} วิ จะแพ้อัตโนมัติ`;
  return (
    <div
      data-afk={waitOpp ? 'opponent' : 'me'}
      className={`pointer-events-none fixed top-24 left-1/2 z-[60] -translate-x-1/2 rounded-full border px-4 py-1.5 text-sm font-bold shadow-lg ${
        waitOpp ? 'border-amber-300/70 bg-amber-950/90 text-amber-100' : 'border-rose-400/70 bg-rose-950/90 text-rose-100'
      }`}
    >
      {text}
    </div>
  );
}
