import { useEffect, useState } from 'react';
import type { PlayerId } from '@bs/engine';
import { BTN } from '../components/Modal';
import { sfx } from '../sfx';
import { DECKS, onlineAvailable, onlineVia, useGame, type DeckId } from '../store';
import { BackButton, CardArt, DeckTile, deckColor, deckCover } from './shared';

/** ป้ายผู้เล่นฝั่งหนึ่งในหน้าจอ VS */
function PlayerPlate({ name, deck, side, waiting }: { name?: string; deck?: DeckId | null; side: 'left' | 'right'; waiting?: boolean }) {
  const glow = deck ? deckColor(deck) : '#64748b';
  return (
    <div className={`flex w-80 flex-col items-center gap-4 ${side === 'left' ? 'lobby-in-left' : 'lobby-in-right'}`}>
      <div className="relative h-80 w-56">
        <div className="absolute inset-[-30%] rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${glow}55, transparent 65%)` }} />
        {deck && !waiting ? (
          <CardArt cardNo={deckCover(deck)} className={`relative w-full shadow-[0_30px_60px_rgba(0,0,0,0.7)] ${side === 'left' ? 'rotate-[-5deg]' : 'rotate-[5deg]'}`} />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-sky-300/40 bg-slate-900/60">
            <div className="flex flex-col items-center gap-3 text-sky-200/80">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-300/20 border-t-sky-300" />
              <span className="text-sm font-bold">รอคู่แข่ง…</span>
            </div>
          </div>
        )}
      </div>
      <div className={`w-full rounded-xl border px-4 py-2 text-center ${waiting ? 'border-white/10 bg-black/40' : 'border-yellow-300/40 bg-gradient-to-r from-slate-950/90 via-slate-900/90 to-slate-950/90'}`}>
        <div className="truncate text-xl font-black text-white">{waiting ? '???' : (name ?? 'นักดวล')}</div>
        <div className="text-xs text-slate-400">{deck && !waiting ? DECKS[deck].label : 'ยังไม่มีผู้เล่น'}</div>
      </div>
    </div>
  );
}

/** หน้าจอ VS: รอคู่แข่ง / พบคู่แข่งแล้วนับถอยหลังเข้าเกม */
function Versus() {
  const online = useGame((s) => s.online)!;
  const setScreen = useGame((s) => s.setScreen);
  const leave = useGame((s) => s.onlineLeave);
  const [copied, setCopied] = useState(false);
  const [count, setCount] = useState(3);
  // พบคู่แข่งแล้ว (กำลังเลือกผู้เริ่มก่อน หรือเล่นอยู่): เข้ากระดานไปดูฉากเปิดเกม
  const ready = online.status !== 'waiting';
  const me = online.me;
  const opp: PlayerId = me === 'p1' ? 'p2' : 'p1';
  const decks = online.setup?.decks;
  const myDeck = (decks?.[me] ?? useGame.getState().decks[me]) as DeckId;

  // พบคู่แข่ง: นับ 3-2-1 แล้วเข้ากระดาน
  useEffect(() => {
    if (!ready) return;
    // ฉากเปิดเกมบนกระดานมี VS + โยนเหรียญอยู่แล้ว: แสดงว่าพบคู่แข่งครู่เดียวแล้วเข้ากระดาน
    setCount(1);
    const t = setTimeout(() => setCount(0), 700);
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    if (count === 0) setScreen('game');

  }, [ready, count, setScreen]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-10">
        <PlayerPlate side="left" name={online.names[me] ?? useGame.getState().playerName} deck={myDeck} />
        <div className="flex w-56 flex-col items-center gap-4">
          <div className={`text-8xl font-black italic ${ready ? 'lobby-vs text-yellow-300' : 'text-white/30'}`} style={{ textShadow: ready ? '0 0 30px rgba(250,204,21,0.8)' : undefined }}>
            VS
          </div>
          {ready ? (
            <div className="lobby-count text-2xl font-black text-white">พบคู่แข่ง!</div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-sky-300/30 bg-black/60 px-5 py-3">
              <span className="text-xs tracking-widest text-sky-200/80">รหัสห้อง</span>
              <span className="font-mono text-4xl font-black tracking-[0.3em] text-yellow-300 select-all">{online.code}</span>
              <button
                type="button"
                className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-bold text-sky-100 hover:bg-sky-500/40"
                onClick={() => {
                  void navigator.clipboard?.writeText(online.code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกรหัส'}
              </button>
              <span className="text-center text-[11px] text-slate-400">ส่งรหัสนี้ให้เพื่อน แล้วให้เพื่อนกด "เข้าห้อง"</span>
            </div>
          )}
        </div>
        <PlayerPlate side="right" name={online.names[opp]} deck={(decks?.[opp] ?? null) as DeckId | null} waiting={!ready} />
      </div>
      {!ready && (
        <button
          type="button"
          className={BTN.secondary}
          onClick={() => {
            if (confirm('ยกเลิกห้องนี้?')) leave();
          }}
        >
          ยกเลิกห้อง
        </button>
      )}
    </div>
  );
}

/** เลือกเด็ค + สร้างห้อง / เข้าห้องด้วยรหัส */
function RoomSetup() {
  const decks = useGame((s) => s.decks);
  const name = useGame((s) => s.playerName);
  const setName = useGame((s) => s.setPlayerName);
  const { onlineHost, onlineJoin } = useGame.getState();
  const [deck, setDeck] = useState<DeckId>(decks.p1);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    sfx('click');
    await fn();
    setBusy(false);
  };
  const ids = Object.keys(DECKS) as DeckId[];

  return (
    <div className="flex flex-1 items-center justify-center gap-10 px-10">
      {/* เลือกเด็ค */}
      <section className="lobby-in-left flex max-w-2xl flex-col gap-4">
        <div>
          <div className="text-xs tracking-[0.3em] text-sky-300">STEP 1</div>
          <div className="text-2xl font-black text-white">เลือกเด็คของคุณ</div>
        </div>
        <div className="flex flex-wrap gap-3">
          {ids.map((id) => (
            <DeckTile key={id} id={id} selected={deck === id} onClick={() => (sfx('hover'), setDeck(id))} />
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          ชื่อของคุณ
          <input
            defaultValue={name}
            maxLength={16}
            onBlur={(e) => setName(e.target.value)}
            className="w-48 rounded-lg bg-slate-800/80 px-3 py-1.5 font-bold text-white ring-1 ring-slate-600 outline-none focus:ring-yellow-300"
          />
        </label>
      </section>

      {/* สร้าง / เข้าห้อง */}
      <section className="lobby-in-right flex w-[360px] flex-col gap-4">
        <div>
          <div className="text-xs tracking-[0.3em] text-sky-300">STEP 2</div>
          <div className="text-2xl font-black text-white">เปิดห้องหรือเข้าห้อง</div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => onlineHost(deck))}
          className="group relative overflow-hidden rounded-2xl border border-yellow-300/60 bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500 p-5 text-left shadow-[0_0_30px_rgba(250,204,21,0.35)] transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <div className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/40 transition-all duration-700 group-hover:left-[120%]" />
          <div className="relative text-3xl font-black text-slate-950 italic">CREATE ROOM</div>
          <div className="relative text-sm font-bold text-slate-800">สร้างห้อง แล้วส่งรหัสให้เพื่อน</div>
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-700" />
          หรือ
          <span className="h-px flex-1 bg-slate-700" />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-300/30 bg-slate-950/70 p-5">
          <div className="text-lg font-black text-white italic">JOIN ROOM</div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && code.length === 5 && run(() => onlineJoin(code, deck))}
            placeholder="รหัส 5 ตัว"
            maxLength={5}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-center font-mono text-3xl font-black tracking-[0.5em] text-yellow-300 uppercase ring-1 ring-slate-600 outline-none placeholder:text-base placeholder:tracking-normal placeholder:text-slate-600 focus:ring-2 focus:ring-yellow-300"
          />
          <button type="button" disabled={busy || code.length < 5} onClick={() => run(() => onlineJoin(code, deck))} className={`${BTN.secondary} py-2.5 text-base`}>
            เข้าห้อง
          </button>
        </div>
        <p className="text-xs text-slate-500">ผู้สร้างห้องเป็นผู้เล่น 1 · ผู้เข้าห้องเป็นผู้เล่น 2 · ผู้เริ่มก่อนสุ่มจาก seed ของห้อง · ผ่าน {onlineVia}</p>
      </section>
    </div>
  );
}

export function Lobby() {
  const online = useGame((s) => s.online);
  const setScreen = useGame((s) => s.setScreen);
  const leave = useGame((s) => s.onlineLeave);
  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 left-1/2 h-[150%] w-px rotate-[18deg] bg-gradient-to-b from-transparent via-sky-300/40 to-transparent" />
        <div className="absolute right-[-3%] bottom-[-5%] font-black tracking-tighter text-white/[0.03] italic select-none" style={{ fontSize: '16vw', lineHeight: 1 }}>
          LOBBY
        </div>
      </div>
      <header className="relative flex items-center gap-6 pt-6">
        <BackButton
          onClick={() => {
            if (online && online.status === 'waiting') {
              if (!confirm('ออกจากห้องที่รออยู่?')) return;
              leave();
              return;
            }
            setScreen(online ? 'game' : 'home');
          }}
          label={online?.status === 'playing' ? 'กลับเข้ากระดาน' : 'หน้าหลัก'}
        />
        <div>
          <div className="text-xs tracking-[0.4em] text-sky-300">ONLINE DUEL</div>
          <div className="text-3xl font-black text-white italic">DUEL LOBBY</div>
        </div>
      </header>
      {!onlineAvailable ? (
        <div className="flex flex-1 items-center justify-center text-amber-300">ยังไม่ได้ตั้งค่า Firebase (apps/web/.env.local)</div>
      ) : online ? (
        <Versus />
      ) : (
        <RoomSetup />
      )}
    </div>
  );
}
