import { isXRare } from '@bs/cards';
import { browserKind, useInstall } from '../pwa';
import { useEffect, useMemo, useState } from 'react';
import { cardArt } from '../assets';
import { BTN } from '../components/Modal';
import { setSfx, sfx, sfxSettings } from '../sfx';
import { DECKS, db, onlineAvailable, useGame, type DeckId } from '../store';
import { CardArt, DeckTile, GLOW, deckColor, deckCover, deckSize } from './shared';

/** คู่การ์ด X-Rare ที่หมุนแสดงทางขวาของหน้าหลัก */
function useShowcase(): string[][] {
  return useMemo(() => {
    const xr = db.all().filter((c) => isXRare(c) && cardArt(c.cardNo));
    const pairs: string[][] = [];
    for (let i = 0; i < xr.length; i += 2) pairs.push(xr.slice(i, i + 2).map((c) => c.cardNo));
    return pairs.length > 0 ? pairs : [[db.all()[0]!.cardNo]];
  }, []);
}

/** ภาพการ์ดคู่ลอยทางขวา: สลับชุดทุก 7 วินาที */
function Showcase() {
  const pairs = useShowcase();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % pairs.length), 7000);
    return () => clearInterval(t);
  }, [pairs.length]);
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-[62%]">
      {pairs.map((pair, k) => {
        const glow = GLOW[db.get(pair[0]!).colors[0] ?? 'blue'] ?? GLOW.blue!;
        const on = k === i;
        return (
          <div key={k} className="absolute inset-0 transition-[opacity,transform] duration-1000" style={{ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateX(6%)' }}>
            {/* แสงหลังการ์ด */}
            <div className="absolute top-1/2 left-[55%] h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${glow}66, transparent 65%)` }} />
            {pair[1] && (
              <div className="absolute top-[12%] left-[18%] w-[min(22vw,330px)]" style={{ animation: 'home-float 7s ease-in-out infinite', animationDelay: '-2s' }}>
                <CardArt cardNo={pair[1]} className="w-full rotate-[-10deg] opacity-90 shadow-[0_30px_60px_rgba(0,0,0,0.7)]" />
              </div>
            )}
            <div className="absolute top-[18%] left-[44%] w-[min(27vw,400px)]" style={{ animation: 'home-float 6s ease-in-out infinite' }}>
              <CardArt cardNo={pair[0]!} className="w-full rotate-[6deg] shadow-[0_40px_80px_rgba(0,0,0,0.75)] ring-2 ring-white/20" />
              <div className="absolute inset-0 rotate-[6deg] overflow-hidden rounded-xl">
                <div className="absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: 'home-sheen 5s ease-in-out infinite' }} />
              </div>
            </div>
          </div>
        );
      })}
      {/* ชื่อการ์ดที่แสดง */}
      <div className="absolute right-8 bottom-8 text-right">
        <div className="text-[11px] tracking-[0.4em] text-sky-200/70">X-RARE</div>
        <div className="text-lg font-black text-white drop-shadow">{pairs[i]!.map((no) => db.get(no).name).join(' · ')}</div>
      </div>
    </div>
  );
}

/** ป้ายโปรไฟล์มุมซ้ายบน (คลิกชื่อเพื่อแก้) */
function ProfilePlate() {
  const name = useGame((s) => s.playerName);
  const setName = useGame((s) => s.setPlayerName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const avatar = deckCover('sd02');
  return (
    <div className="flex items-center gap-3 self-start rounded-r-2xl border border-l-0 border-sky-300/30 bg-gradient-to-r from-slate-950/95 to-slate-900/70 py-2 pr-6 pl-5 shadow-[0_0_24px_rgba(56,189,248,0.15)] backdrop-blur">
      <div className="relative h-14 w-14 overflow-hidden rounded-xl ring-2 ring-yellow-300/80 shadow-[0_0_14px_rgba(250,204,21,0.4)]">
        {cardArt(avatar) ? <img src={cardArt(avatar)} alt="" className="absolute top-[-18%] left-[-30%] w-[160%] max-w-none" /> : <div className="h-full w-full bg-slate-700" />}
      </div>
      <div className="min-w-0">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setName(draft);
              setEditing(false);
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={16}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setName(draft);
                setEditing(false);
              }}
              className="w-44 rounded bg-slate-800 px-2 py-0.5 text-lg font-black text-white ring-1 ring-yellow-300 outline-none"
            />
          </form>
        ) : (
          <button type="button" onClick={() => (setDraft(name), setEditing(true))} className="group flex items-center gap-2 text-lg font-black text-white" title="แก้ชื่อ">
            {name}
            <span className="text-xs text-slate-500 group-hover:text-yellow-300">✎</span>
          </button>
        )}
        <div className="text-xs tracking-wider text-sky-200/70">นักดวล · Battle Spirits Dual TH</div>
      </div>
    </div>
  );
}

/** รายการเมนูตัวใหญ่ */
function MenuItem({ title, sub, onClick, big, disabled, badge }: { title: string; sub: string; onClick: () => void; big?: boolean; disabled?: boolean; badge?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        sfx('click');
        onClick();
      }}
      onMouseEnter={() => !disabled && sfx('hover')}
      className="group relative flex items-baseline gap-4 py-1 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="absolute top-1/2 -left-6 h-[70%] w-1.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-yellow-200 to-amber-500 shadow-[0_0_12px_rgba(250,204,21,0.8)] transition-all group-hover:-left-8 group-hover:h-full group-disabled:opacity-0" />
      <span
        className={`bg-gradient-to-r from-white via-sky-100 to-sky-300 bg-clip-text font-black tracking-wide text-transparent italic transition group-hover:translate-x-2 group-hover:from-yellow-100 group-hover:to-amber-400 ${
          big ? 'text-7xl' : 'text-4xl'
        }`}
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        {title}
      </span>
      <span className="text-sm text-slate-300 transition group-hover:translate-x-2 group-hover:text-white">{sub}</span>
      {badge && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">{badge}</span>}
    </button>
  );
}

/** แบนเนอร์ Starter Deck มุมซ้ายล่าง (หมุนเอง / กดลูกศร) */
function DeckBanner({ onOpen }: { onOpen: (id: DeckId) => void }) {
  const ids = (Object.keys(DECKS) as DeckId[]).filter((id) => id.startsWith('sd'));
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % ids.length), 5000);
    return () => clearInterval(t);
  }, [ids.length]);
  const id = ids[i]!;
  const glow = deckColor(id);
  return (
    <div className="w-[420px]">
      <div className="relative h-36 overflow-hidden rounded-xl border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        <button type="button" onClick={() => onOpen(id)} className="absolute inset-0 text-left" style={{ background: `linear-gradient(110deg, ${glow}44, #0b1020 55%)` }}>
          <div className="absolute top-0 left-0 rounded-br-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-0.5 text-xs font-black text-slate-950">STARTER DECK</div>
          <div className="absolute top-8 left-8 z-10 max-w-[54%]">
            <div className="text-2xl font-black text-white drop-shadow">{DECKS[id].label}</div>
            <div className="mt-1 text-xs text-slate-300">
              {deckSize(id)} ใบ · การ์ดเด่น {db.get(deckCover(id)).name}
            </div>
            <div className="mt-2 text-xs font-bold text-yellow-300">ดูการ์ดในเด็ค ▶</div>
          </div>
          <div className="absolute top-3 right-3 flex [&>*]:origin-bottom">
            {DECKS[id].entries
              .filter((e) => cardArt(e.cardNo))
              .slice(0, 3)
              .map((e, k) => (
                <CardArt key={e.cardNo} cardNo={e.cardNo} className={`-ml-12 w-[4.6rem] shadow-xl ${["rotate-[-8deg]", "rotate-[2deg]", "rotate-[10deg]"][k]}`} />
              ))
              .reverse()}
          </div>
        </button>
        {ids.length > 1 && (
          <>
            <button type="button" onClick={() => setI((i - 1 + ids.length) % ids.length)} className="absolute top-1/2 left-1 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-white hover:bg-black/80">
              ‹
            </button>
            <button type="button" onClick={() => setI((i + 1) % ids.length)} className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-white hover:bg-black/80">
              ›
            </button>
          </>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {ids.map((d, k) => (
          <button key={d} type="button" onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-yellow-300' : 'w-1.5 bg-white/40'}`} />
        ))}
      </div>
    </div>
  );
}

/** หน้าต่างเลือกเด็คสองฝั่งสำหรับเล่นเครื่องเดียว */
function LocalSetup({ onClose }: { onClose: () => void }) {
  const decks = useGame((s) => s.decks);
  const startLocal = useGame((s) => s.startLocal);
  const [pick, setPick] = useState(decks);
  const ids = Object.keys(DECKS) as DeckId[];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel flex max-w-4xl flex-col gap-4 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-xs tracking-[0.3em] text-sky-300">LOCAL DUEL</div>
          <div className="text-2xl font-black text-white">เล่นเครื่องเดียว (สองคนสลับกัน)</div>
        </div>
        {(['p1', 'p2'] as const).map((p) => (
          <div key={p}>
            <div className="mb-2 text-sm font-bold text-slate-300">เด็คผู้เล่น {p === 'p1' ? '1' : '2'}</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {ids.map((id) => (
                <DeckTile key={id} id={id} small selected={pick[p] === id} onClick={() => setPick({ ...pick, [p]: id })} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN.secondary} onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className={`${BTN.primary} px-8`} onClick={() => startLocal(pick)}>
            เริ่มดวล!
          </button>
        </div>
      </div>
    </div>
  );
}

/** ปุ่มติดตั้งเป็นเว็บแอป: PC/Android = ป๊อปอัปติดตั้งของเบราว์เซอร์, iOS = บอกวิธีเพิ่มไปยังหน้าจอโฮม */
/** วิธีติดตั้งตามเบราว์เซอร์ (เมื่อเบราว์เซอร์ไม่มีหน้าต่างติดตั้งให้กด) */
function InstallSteps() {
  const kind = browserKind();
  const steps: Record<ReturnType<typeof browserKind>, { title: string; items: React.ReactNode[] }> = {
    ios: { title: 'ติดตั้งบน iPhone / iPad', items: ['เปิดหน้านี้ด้วย Safari', <>กดปุ่ม <b>แชร์</b> ⬆ ด้านล่าง/บนของจอ</>, <>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b></>] },
    android: { title: 'ติดตั้งบน Android', items: ['เปิดหน้านี้ด้วย Chrome', <>กดเมนู <b>⋮</b> มุมขวาบน</>, <>เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></>] },
    edge: { title: 'ติดตั้งบน Microsoft Edge', items: [<>กดไอคอน <b>⊕ / ติดตั้งแอป</b> ท้ายช่องที่อยู่เว็บ</>, <>หรือเมนู <b>…</b> → <b>แอป</b> → <b>ติดตั้งไซต์นี้เป็นแอป</b></>] },
    chrome: { title: 'ติดตั้งบน Google Chrome', items: [<>กดไอคอน <b>ติดตั้ง</b> (จอมีลูกศร) ท้ายช่องที่อยู่เว็บ</>, <>หรือเมนู <b>⋮</b> → <b>แคสต์ บันทึก และแชร์</b> → <b>ติดตั้งหน้าเว็บเป็นแอป</b></>] },
    safari: { title: 'ติดตั้งบน Safari (Mac)', items: [<>เมนู <b>ไฟล์</b> → <b>เพิ่มไปยัง Dock</b></>] },
    firefox: { title: 'Firefox ยังติดตั้งเว็บแอปไม่ได้', items: ['เปิดหน้านี้ด้วย Chrome หรือ Edge แล้วกดปุ่มติดตั้งอีกครั้ง'] },
    other: { title: 'ติดตั้งเป็นแอป', items: ['เปิดหน้านี้ด้วย Chrome / Edge (PC, Android) หรือ Safari (iPhone)', 'แล้วกดปุ่มติดตั้งอีกครั้ง'] },
  };
  const s = steps[kind];
  return (
    <>
      <div className="mb-2 font-black text-white">{s.title}</div>
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        {s.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
    </>
  );
}

function InstallButton() {
  const { mode, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (!mode) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (mode === 'prompt' ? void install().then((ok) => !ok && setHelp(true)) : setHelp((v) => !v))}
        className="flex h-10 items-center gap-1.5 rounded-full border border-yellow-300/60 bg-gradient-to-b from-amber-300 to-amber-600 px-4 text-sm font-black text-slate-950 shadow-[0_0_14px_rgba(250,204,21,0.45)] hover:brightness-110"
        title="ติดตั้งเป็นแอปบนเครื่องนี้"
      >
        ⬇ ติดตั้งแอป
      </button>
      {help && (
        <div className="absolute top-12 right-0 z-50 w-72 rounded-xl border border-sky-300/40 bg-slate-950/95 p-4 text-sm text-slate-200 shadow-2xl">
          <InstallSteps />
          <button type="button" onClick={() => setHelp(false)} className="mt-3 w-full rounded-lg bg-slate-800 py-1 text-xs hover:bg-slate-700">
            ปิด
          </button>
        </div>
      )}
    </div>
  );
}

export function Home() {
  const setScreen = useGame((s) => s.setScreen);
  const localInProgress = useGame((s) => s.localInProgress);
  const [local, setLocal] = useState(false);
  const [sound, setSound] = useState(sfxSettings());

  return (
    <div className="game-bg relative h-screen min-w-[1200px] overflow-hidden">
      {/* แถบเฉียงตกแต่ง */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 left-[30%] h-[150%] w-40 rotate-[24deg] bg-gradient-to-b from-sky-400/0 via-sky-400/10 to-sky-400/0" />
        <div className="absolute -top-1/4 left-[36%] h-[150%] w-6 rotate-[24deg] bg-gradient-to-b from-yellow-300/0 via-yellow-300/20 to-yellow-300/0" />
        <div className="absolute right-[-4%] bottom-[-6%] font-black tracking-tighter text-white/[0.03] italic select-none" style={{ fontSize: '18vw', lineHeight: 1 }}>
          DUAL
        </div>
      </div>

      <Showcase />

      {/* คอลัมน์ซ้าย: เงาไล่ให้อ่านเมนูง่าย */}
      <div className="absolute inset-y-0 left-0 w-[48%] bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-transparent" />
      <div className="relative flex h-full flex-col justify-between py-6">
        <ProfilePlate />

        <nav className="flex flex-col gap-1 pl-16">
          {localInProgress && <MenuItem title="CONTINUE" sub="เล่นเกมเครื่องเดียวต่อ" onClick={() => setScreen('game')} />}
          <MenuItem big title="DUEL" sub="ดวลออนไลน์กับเพื่อน" onClick={() => setScreen('lobby')} disabled={!onlineAvailable} badge={onlineAvailable ? 'ONLINE' : undefined} />
          <MenuItem title="LOCAL" sub="เล่นเครื่องเดียว สองคนสลับกัน" onClick={() => setLocal(true)} />
          <MenuItem title="DECK" sub="ดูการ์ดในเด็ค" onClick={() => setScreen('decks')} />
          {!onlineAvailable && <p className="mt-1 text-xs text-amber-300/80">ยังไม่ได้ตั้งค่า Firebase: ดวลออนไลน์ไม่ได้</p>}
        </nav>

        <div className="pl-6">
          <DeckBanner onOpen={(id) => (useGame.setState({ deckView: id }), setScreen('decks'))} />
        </div>
      </div>

      {/* มุมขวาบน */}
      <div className="absolute top-5 right-6 flex items-center gap-2">
        <InstallButton />
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            onlineAvailable ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-500/40 bg-black/40 text-slate-400'
          }`}
        >
          {onlineAvailable ? '● เซิร์ฟเวอร์พร้อม' : '○ ออฟไลน์'}
        </span>
        <button
          type="button"
          onClick={() => {
            setSfx({ on: !sound.on });
            setSound(sfxSettings());
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/40 bg-black/50 text-lg text-sky-100 hover:text-white"
          title="เสียงประกอบ"
        >
          {sound.on ? '🔊' : '🔇'}
        </button>
      </div>

      {local && <LocalSetup onClose={() => setLocal(false)} />}
    </div>
  );
}
