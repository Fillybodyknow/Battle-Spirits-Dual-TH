import { useState } from 'react';
import type { TextEffect } from '@bs/cards';
import { opponentOf, symbolCount, type PlayerId } from '@bs/engine';
import { playerLabel } from '../format';
import { actingPlayer, chainEntries, db, isFxBlocking, useGame, viewPlayer } from '../store';
import { CardFace } from './CardFace';
import { CardInspector } from './CardInspector';
import { GameLog } from './Controls';
import { Icon } from './Icon';
import { DiamondAvatar, useSeatAvatar } from './SeatAvatar';
import { setTouchInspected, useLastInputTouch, useTouchInspected } from '../touch';
import { useShownLife } from './useHeld';

/** ชื่อที่แสดงของผู้เล่น (ออนไลน์ = ชื่อที่ตั้ง, เครื่องเดียว = ผู้เล่น 1/2) */
function useSeatName(p: PlayerId): string {
  const online = useGame((s) => s.online);
  const myName = useGame((s) => s.playerName);
  const botSeat = useGame((s) => s.botSeat);
  const botName = useGame((s) => s.botName);
  // ดวลกับบอท: เรา = ชื่อที่ตั้ง · บอท = ชื่อคู่แข่งของด่าน
  if (!online && botSeat) return p === botSeat ? (botName ?? 'บอท') : myName;
  if (!online) return playerLabel(p);
  return online.names[p] ?? (p === online.me ? myName : 'คู่แข่ง');
}

/** ป้ายผู้เล่น: ฝั่งเรามุมซ้ายล่าง ฝั่งคู่แข่งมุมขวาบน (ชื่อ + Life + จำนวนการ์ดบนมือ) */
export function PlayerPlate({ player, corner }: { player: PlayerId; corner: 'bottom-left' | 'top-right' }) {
  // ลดตอนการ์ดชนจริง (ไม่ใช่ตอนเริ่มแอนิเมชันโจมตี)
  const life = useShownLife(player);
  // จำนวนการ์ดในมือ (ไม่นับการ์ดที่วางแสดงนอกมือ: อยู่ในโซนนอกมือบนสนาม)
  const hand = useGame((s) => s.state.players[player].hand.filter((id) => !(s.state.shownCards ?? []).includes(id)).length);
  const turn = useGame((s) => s.state.turnPlayer === player && !s.state.winner);
  const name = useSeatName(player);
  const avatar = useSeatAvatar(player);
  const bottom = corner === 'bottom-left';
  const accent = bottom ? '#38bdf8' : '#f43f5e';
  return (
    <div data-setup="plate" className={`pointer-events-none fixed z-[42] flex items-center gap-2 ${bottom ? 'bottom-4 left-5' : 'top-4 right-5 flex-row-reverse'}`}>
      <div className="relative">
        <DiamondAvatar cardNo={avatar} accent={accent} />
        {/* เลขที่นั่งเล็ก ๆ ที่มุมล่างของกรอบ */}
        <span
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border bg-slate-950 px-1.5 text-[10px] leading-4 font-black"
          style={{ color: accent, borderColor: accent }}
        >
          {player === 'p1' ? '1' : '2'}
        </span>
      </div>
      <div className={`flex min-w-52 flex-col ${bottom ? '' : 'items-end'}`}>
        <div
          className={`flex items-center gap-2 px-3 py-0.5 text-sm font-bold text-white ${bottom ? 'bg-gradient-to-r from-slate-950/95 to-slate-900/40' : 'flex-row-reverse bg-gradient-to-l from-slate-950/95 to-slate-900/40'}`}
          style={{ borderTop: `2px solid ${accent}` }}
        >
          <span className="max-w-40 truncate">{name}</span>
          {turn && <span className="rounded bg-yellow-300 px-1 text-[10px] font-black text-slate-900">เทิร์น</span>}
        </div>
        <div className={`flex items-baseline gap-2 px-3 ${bottom ? 'bg-gradient-to-r from-slate-950/95 to-transparent' : 'justify-end bg-gradient-to-l from-slate-950/95 to-transparent'}`}>
          <span className="text-xs font-black tracking-widest text-slate-400">LIFE</span>
          <span className="text-3xl leading-tight font-black text-white tabular-nums drop-shadow">{life}</span>
          <span className="text-xs text-slate-400">· มือ {hand}</span>
        </div>
      </div>
    </div>
  );
}

/** แผงรายละเอียดการ์ดลอยมุมซ้ายบน: ชี้การ์ด = แสดง, คลิกการ์ด = ปักไว้ (✕ ปิด) */
export function FloatingInspector({ enabled }: { enabled: boolean }) {
  const hovered = useGame((s) => s.hovered);
  const pinned = useGame((s) => s.pinned);
  const pin = useGame((s) => s.pin);
  // ใช้นิ้ว: เปิดเฉพาะการ์ดที่กดค้าง (การแตะทั่วไปไม่เปิดแผงค้างไว้บังกระดาน)
  const touch = useLastInputTouch();
  const touchInspected = useTouchInspected();
  const shown = touch ? touchInspected : (hovered ?? pinned);
  const show = enabled && !!shown;
  if (!show) return null;
  const sticky = touch || (!!pinned && !hovered);
  return (
    <div
      className={`fixed top-14 left-2 z-[43] flex h-[min(600px,calc(100vh-150px))] w-[320px] flex-col rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.7)] ${sticky ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ animation: 'fx-fade-in 0.12s ease-out both' }}
    >
      <CardInspector />
      {(touch || pinned) && (
        <button
          type="button"
          onClick={() => (touch ? setTouchInspected(null) : pin(null))}
          className="pointer-events-auto absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-sm text-slate-200 ring-1 ring-white/30 hover:bg-rose-600"
          title="ปิดรายละเอียดการ์ด"
        >
          ✕
        </button>
      )}
    </div>
  );
}

const CORNER_BTN =
  'relative flex h-12 w-12 items-center justify-center rounded-full border-2 bg-gradient-to-b from-slate-700 to-slate-950 text-lg font-black shadow-[0_0_12px_rgba(56,189,248,0.35)] transition hover:scale-105';

/** ปุ่มมุมขวาล่าง: Auto Pass / รายละเอียดการ์ด / Chain / Log */
export function CornerButtons({ inspector, setInspector }: { inspector: boolean; setInspector: (v: boolean) => void }) {
  const online = useGame((s) => s.online);
  const autoPass = useGame((s) => s.autoPass);
  const toggleAutoPass = useGame((s) => s.toggleAutoPass);
  const state = useGame((s) => s.state);
  const [panel, setPanel] = useState<'log' | 'chain' | null>(null);
  const chain = state.battle ? chainEntries(state) : [];
  const auto = !!online || autoPass;
  const on = (v: boolean) => (v ? 'border-sky-300 text-sky-100' : 'border-slate-600 text-slate-500');

  return (
    <>
      <div className="fixed right-3 bottom-3 z-[44] flex items-end gap-2">
        <button
          type="button"
          disabled={!!online}
          onClick={toggleAutoPass}
          className={`${CORNER_BTN} ${on(auto)} text-[11px] disabled:cursor-default`}
          title={online ? 'Auto Pass (ออนไลน์เปิดตลอด)' : 'Auto Pass: Pass/ไม่ป้องกันให้เองเมื่อไม่มีอะไรใช้ได้'}
        >
          AUTO
        </button>
        <button type="button" onClick={() => setInspector(!inspector)} className={`${CORNER_BTN} ${on(inspector)}`} title="แสดงรายละเอียดการ์ดเมื่อชี้">
          <Icon name="info" />
        </button>
        <button type="button" onClick={() => setPanel(panel === 'chain' ? null : 'chain')} className={`${CORNER_BTN} ${on(panel === 'chain' || chain.length > 0)}`} title="Chain ปัจจุบัน">
          <Icon name="chain" />
          {chain.length > 0 && (
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-1.5 text-xs font-black text-slate-900 shadow">{chain.length}</span>
          )}
        </button>
        <button type="button" onClick={() => setPanel(panel === 'log' ? null : 'log')} className={`${CORNER_BTN} ${on(panel === 'log')}`} title="Log">
          <Icon name="log" />
        </button>
      </div>

      {panel && (
        <aside
          className="fixed top-16 right-3 bottom-20 z-[44] flex w-[340px] flex-col overflow-hidden rounded-xl border border-sky-400/30 bg-slate-950/95 shadow-[0_10px_40px_rgba(0,0,0,0.7)] backdrop-blur"
          style={{ animation: 'lobby-in-right 0.25s ease-out both' }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <span className="text-sm font-black tracking-widest text-sky-200">{panel === 'log' ? 'LOG' : 'CHAIN'}</span>
            <button type="button" onClick={() => setPanel(null)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
          {panel === 'log' ? <GameLog /> : <ChainList />}
        </aside>
      )}
    </>
  );
}

/** รายการ Chain ปัจจุบัน (ลิงก์ล่าสุดอยู่บน) */
function ChainList() {
  const state = useGame((s) => s.state);
  const hover = useGame((s) => s.hover);
  const entries = state.battle ? chainEntries(state) : [];
  if (entries.length === 0) return <p className="p-4 text-sm text-slate-500">ยังไม่มี Chain ในการต่อสู้นี้</p>;
  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {entries
        .map((e, i) => ({ e, i }))
        .reverse()
        .map(({ e, i }) => {
          const card = state.cards[e.cardId];
          if (!card) return null;
          const def = db.get(card.cardNo);
          const text = e.source === null ? '' : ((def.effects as TextEffect[])[e.source]?.text ?? '');
          return (
            <li key={i} className="flex gap-2 rounded-lg bg-black/40 p-2 ring-1 ring-white/10" onMouseEnter={() => hover(e.cardId)} onMouseLeave={() => hover(null)}>
              <div className="relative h-20 w-14 shrink-0">
                <CardFace def={def} size="xs" />
                <span className="absolute -top-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-black text-slate-900">{i + 1}</span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{def.name}</div>
                <div className="text-[11px] text-slate-400">{playerLabel(e.player)}</div>
                <div className="line-clamp-3 text-xs text-slate-300">{text}</div>
              </div>
            </li>
          );
        })}
    </ol>
  );
}

/**
 * ออร่าฝั่งที่ระบบกำลังรอให้ตัดสินใจ (ถือเทิร์น / ถูกถาม / ถือสิทธิ์ Flash / ต้องเลือกป้องกัน)
 * ฝั่งล่างสีฟ้า (แสงพุ่งขึ้นจากขอบล่าง) ฝั่งบนสีแดง (แสงพุ่งลงจากขอบบน)
 */
export function TurnAura() {
  const state = useGame((s) => s.state);
  const bottom = useGame(viewPlayer);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const actor = actingPlayer(state);
  if (!actor || state.winner || blocking) return null;
  const low = actor === bottom;
  const rgb = low ? '56,189,248' : '244,63,94';
  const streaks = Array.from({ length: 22 }, (_, i) => ({ left: (i * 4.7 + (i % 3) * 7) % 100, delay: (i * 0.37) % 3, dur: 2.2 + (i % 4) * 0.5, h: 40 + ((i * 13) % 60) }));
  return (
    <div key={low ? 'low' : 'high'} className="pointer-events-none absolute inset-0 z-0 overflow-hidden" style={{ animation: 'aura-in 0.6s ease-out both' }}>
      {/* ม่านแสงจากขอบจอ */}
      <div
        className={`absolute inset-x-0 h-[42%] ${low ? 'bottom-0' : 'top-0'}`}
        style={{
          background: `linear-gradient(${low ? '0deg' : '180deg'}, rgba(${rgb},0.55), rgba(${rgb},0.2) 35%, transparent 100%)`,
          mixBlendMode: 'screen',
          animation: 'aura-pulse 2.6s ease-in-out infinite',
        }}
      />
      {/* เส้นแสงที่ขอบ */}
      <div className={`absolute inset-x-0 h-[3px] ${low ? 'bottom-0' : 'top-0'}`} style={{ background: `rgba(${rgb},0.95)`, boxShadow: `0 0 18px 6px rgba(${rgb},0.8), 0 0 60px 20px rgba(${rgb},0.4)` }} />
      {/* เส้นแสงลอยไล่ขึ้น/ลง */}
      {streaks.map((s, i) => (
        <span
          key={i}
          className={`absolute w-[2px] rounded-full ${low ? 'bottom-0' : 'top-0'}`}
          style={{
            left: `${s.left}%`,
            height: s.h,
            background: `linear-gradient(${low ? '0deg' : '180deg'}, transparent, rgba(${rgb},0.9), transparent)`,
            boxShadow: `0 0 8px rgba(${rgb},0.9)`,
            // แยกทิศเป็นคนละ keyframes (ไม่ใช้ตัวแปร CSS ใน keyframes) ให้การ์ดจอทำแอนิเมชันเองได้ ไม่ต้องคำนวณ style ใหม่ทุกเฟรม
            animation: `${low ? 'aura-rise-up' : 'aura-rise-down'} ${s.dur}s ${s.delay}s ease-in infinite`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * การโจมตีนี้ถึงตาย (ไม่นับเอฟเฟกต์): ยังไม่มีผู้ป้องกัน และ Life ที่จะเสีย ≥ Life ที่เหลือของฝ่ายป้องกัน
 * แสดงแถบ "Final Blow !" วิ่งตามขอบซ้าย-ขวาของจอ
 */
export function FinalBlowWarning() {
  const state = useGame((s) => s.state);
  const battle = state.battle;
  // ตัดสินผลแล้ว (เสียไลฟ์ไปแล้ว รอเบิร์ส/เอฟเฟกต์ก่อนจบการต่อสู้): ไม่ใช่การโจมตีที่จะถึงตายอีก
  if (!battle || state.winner || battle.blockers.length > 0 || battle.resolved) return null;
  const attacker = state.cards[battle.attackerId];
  if (!attacker) return null;
  const defender = opponentOf(attacker.owner);
  const dmg = symbolCount(db.get(attacker.cardNo)) + attacker.braves.reduce((n, b) => n + symbolCount(db.get(state.cards[b]!.cardNo)), 0);
  const life = state.players[defender].life.length;
  if (dmg <= 0 || dmg < life) return null;
  // ข้อความสองท่อนเหมือนกัน (7 + 7): เลื่อนไปครึ่งความยาวพอดี = วนต่อกันเนียน
  const text = Array.from({ length: 14 }, () => 'Final Blow !').join('  ') + '  ';
  const band = (side: 'left' | 'right') => (
    <div
      className={`absolute inset-y-[-10%] w-14 overflow-hidden ${side === 'left' ? 'left-0' : 'right-0'}`}
      style={{
        background: 'linear-gradient(90deg, #a3e635, #fde047 50%, #a3e635)',
        boxShadow: '0 0 24px 6px rgba(190,242,100,0.55)',
        transform: `rotate(${side === 'left' ? 4 : -4}deg)`,
        animation: `fb-band-in-${side} 0.45s cubic-bezier(.2,.9,.3,1) both`,
      }}
    >
      {/* เลื่อนด้วย transform (การ์ดจอทำเอง ไม่ต้องจัดเลย์เอาต์/วาดข้อความใหม่ทุกเฟรม) */}
      <div className="absolute top-0 left-1/2 will-change-transform" style={{ animation: `fb-band-scroll-${side} 22s linear infinite` }}>
        <div
          className="text-[2.1rem] font-black whitespace-nowrap text-rose-600 italic [text-shadow:0_2px_0_rgba(255,255,255,0.6)]"
          style={{ writingMode: 'vertical-rl', transform: side === 'left' ? 'rotate(180deg)' : undefined }}
        >
          {text}
        </div>
      </div>
    </div>
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[41] overflow-hidden" key={battle.attackerId}>
      {/* ขอบจอแดงเรือง */}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 120px 30px rgba(244,63,94,0.35)', animation: 'aura-pulse 1.2s ease-in-out infinite' }} />
      {band('left')}
      {band('right')}
    </div>
  );
}
