import { useState } from 'react';
import { PLAYERS, opponentOf } from '@bs/engine';
import { playerLabel } from './format';
import { DECKS, onlineAvailable, onlineVia, useGame, viewPlayer, type CutInMode, type DeckId } from './store';
import { HandFan, PlayerMat } from './components/Board';
import { ChoiceDialog, ErrorToast, PromptBar, TrashDialog } from './components/Controls';
import { CornerButtons, FinalBlowWarning, FloatingInspector, PlayerPlate, TurnAura } from './components/Hud';
import { PlayDialog } from './components/PlayDialog';
import { BTN } from './components/Modal';
import { setSfx, sfx, sfxSettings } from './sfx';
import { AttackArrow, FxLayer } from './components/Fx';
import { CoreDragGhost, DragGhost } from './components/DragGhost';
import { DeckViewer } from './screens/DeckViewer';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';

const ICON_BTN =
  'flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/50 bg-gradient-to-b from-slate-700 to-slate-900 text-lg text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:scale-105 hover:text-white hover:shadow-[0_0_16px_rgba(56,189,248,0.55)] disabled:opacity-40';

/** ปุ่มลอยมุมซ้ายบน (แทน TopBar) */
function Toolbar() {
  const online = useGame((s) => s.online);
  const canUndo = useGame((s) => !s.online && (s.history.length > 0 || !!s.truth));
  const hasDraft = useGame((s) => !!s.truth);
  const { newGame, undo, onlineRematch, cancelCores } = useGame.getState();
  const canRestart = !online || (online.me === 'p1' && online.status === 'playing');
  const restart = () => {
    if (!confirm(online ? 'เริ่มเกมใหม่ในห้องนี้ (ทั้งสองฝ่าย)?' : 'เริ่มเกมใหม่?')) return;
    if (online) onlineRematch();
    else newGame();
  };
  // ออนไลน์: เหลือแค่ปุ่มตั้งค่า (ยอมแพ้/ออกจากห้องอยู่ในตั้งค่า)
  if (online) {
    return (
      <div className="fixed top-2 left-2 z-[45] flex items-center gap-1.5">
        <Settings />
      </div>
    );
  }
  return (
    <div className="fixed top-2 left-2 z-[45] flex items-center gap-1.5">
      <button
        type="button"
        className={ICON_BTN}
        title={online ? 'ออกจากห้องแล้วกลับหน้าหลัก' : 'กลับหน้าหลัก (เกมนี้ยังเล่นต่อได้)'}
        onClick={() => {
          if (online) {
            if (confirm('ออกจากห้องออนไลน์แล้วกลับหน้าหลัก?')) useGame.getState().onlineLeave();
          } else useGame.getState().setScreen('home');
        }}
      >
        ⌂
      </button>
      <Settings />
      <button type="button" disabled={!canUndo && !(online && hasDraft)} onClick={online ? cancelCores : undo} className={ICON_BTN} title={online ? 'ยกเลิกการจัด Core' : 'ย้อน action'}>
        ↶
      </button>
      <button type="button" disabled={!canRestart} onClick={restart} className={ICON_BTN} title={online ? 'เกมใหม่ (เจ้าของห้อง)' : 'เกมใหม่'}>
        ⟳
      </button>
      <OnlinePanel />
    </div>
  );
}

/** ในตั้งค่าตอนออนไลน์: ยอมแพ้ (ระหว่างเล่น) หรือออกจากห้อง (ยังไม่เริ่ม/จบแล้ว) */
function OnlineExit() {
  const online = useGame((s) => s.online);
  const winner = useGame((s) => s.state.winner);
  if (!online) return null;
  const playing = online.status === 'playing' && !winner;
  return (
    <div className="flex flex-col gap-1 border-t border-slate-700 pt-3">
      <span className="text-xs text-slate-400">
        ห้อง <b className="tracking-widest text-white">{online.code}</b> · {online.opponentHere ? '● คู่แข่งอยู่ในห้อง' : '○ คู่แข่งออกจากห้อง'}
      </span>
      <button
        type="button"
        className="rounded-lg bg-rose-700/80 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600"
        onClick={() => {
          if (playing) {
            if (confirm('ยอมแพ้เกมนี้?')) useGame.getState().dispatch({ type: 'concede', player: online.me });
          } else if (confirm('ออกจากห้องแล้วกลับหน้าหลัก?')) useGame.getState().onlineLeave();
        }}
      >
        {playing ? 'ยอมแพ้' : 'ออกจากห้อง'}
      </button>
    </div>
  );
}

/** ปุ่ม 🌐: สร้างห้อง / เข้าห้อง / สถานะห้อง */
function OnlinePanel() {
  const online = useGame((s) => s.online);
  const decks = useGame((s) => s.decks);
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState<DeckId>(decks.p1);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { onlineHost, onlineJoin, onlineLeave } = useGame.getState();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div className="relative flex items-center gap-1.5">
      <button type="button" className={ICON_BTN} onClick={() => setOpen((o) => !o)} title="เล่นออนไลน์">
        🌐
      </button>
      {online && (
        <span className="rounded-full border border-emerald-300/40 bg-black/70 px-3 py-1 text-xs text-emerald-200 shadow">
          ห้อง <b className="tracking-widest text-white">{online.code}</b> · คุณคือ{playerLabel(online.me)} ·{' '}
          {online.status === 'waiting' ? 'รอคู่แข่ง…' : online.opponentHere ? '● คู่แข่งอยู่ในห้อง' : '○ คู่แข่งออกจากห้อง'}
        </span>
      )}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 flex w-80 flex-col gap-3 rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm shadow-xl">
          <div className="flex items-center justify-between">
            <b className="text-slate-100">เล่นออนไลน์</b>
            <span className="text-xs text-slate-500">ผ่าน {onlineVia}</span>
          </div>
          {!onlineAvailable ? (
            <p className="text-xs text-amber-300">
              ยังไม่ได้ตั้งค่า Firebase: ใส่ค่าใน <code>apps/web/.env.local</code> (ดู <code>.env.example</code>) แล้วรัน dev server ใหม่
            </p>
          ) : online ? (
            <>
              {online.status === 'waiting' ? (
                <div className="flex flex-col items-center gap-1 rounded-lg bg-black/40 p-3">
                  <span className="text-xs text-slate-400">ส่งรหัสนี้ให้เพื่อน</span>
                  <span className="text-3xl font-black tracking-[0.3em] text-yellow-300 select-all">{online.code}</span>
                  <span className="text-xs text-slate-400">รอคู่แข่งเข้าห้อง…</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  กำลังเล่นอยู่ในห้อง {online.code} · {online.me === 'p1' ? 'คุณเป็นเจ้าของห้อง กด ⟳ เพื่อเริ่มเกมใหม่ในห้องนี้' : 'เจ้าของห้องเริ่มเกมใหม่ได้'}
                </p>
              )}
              <button
                type="button"
                className={BTN.secondary}
                onClick={() => {
                  if (confirm('ออกจากห้อง?')) {
                    onlineLeave();
                    setOpen(false);
                  }
                }}
              >
                ออกจากห้อง
              </button>
            </>
          ) : (
            <>
              <label className="flex items-center justify-between gap-2">
                <span className="text-slate-300">เด็คของคุณ</span>
                <select value={deck} onChange={(e) => setDeck(e.target.value as DeckId)} className="rounded bg-slate-700 px-2 py-1 text-slate-100">
                  {(Object.keys(DECKS) as DeckId[]).map((id) => (
                    <option key={id} value={id}>
                      {DECKS[id].label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busy} className={BTN.primary} onClick={() => run(() => onlineHost(deck))}>
                สร้างห้อง
              </button>
              <div className="flex items-center gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="รหัสห้อง"
                  maxLength={5}
                  className="w-28 rounded bg-slate-800 px-2 py-1.5 text-center font-bold tracking-widest text-white uppercase ring-1 ring-slate-600 outline-none focus:ring-yellow-300"
                />
                <button type="button" disabled={busy || code.length < 5} className={`${BTN.secondary} flex-1`} onClick={() => run(() => onlineJoin(code, deck))}>
                  เข้าห้อง
                </button>
              </div>
              <p className="text-xs text-slate-500">ผู้สร้างห้องเป็นผู้เล่น 1 · ผู้เข้าห้องเป็นผู้เล่น 2 · ผู้เริ่มก่อนสุ่มจาก seed ของห้อง</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Settings() {
  const [open, setOpen] = useState(false);
  const decks = useGame((s) => s.decks);
  const hideIdleHand = useGame((s) => s.hideIdleHand);
  const fixedView = useGame((s) => s.fixedView);
  const animations = useGame((s) => s.animations);
  const cutIn = useGame((s) => s.cutIn);
  const setCutIn = useGame((s) => s.setCutIn);
  const autoPass = useGame((s) => s.autoPass);
  const seed = useGame((s) => s.seed);
  const online = useGame((s) => s.online);
  const { setDeck, toggleHideIdleHand, toggleFixedView, toggleAnimations, toggleAutoPass } = useGame.getState();
  const [sound, setSound] = useState(sfxSettings());
  const updateSound = (next: Partial<typeof sound>) => {
    setSfx(next);
    setSound(sfxSettings());
  };
  return (
    <div className="relative">
      <button type="button" className={ICON_BTN} onClick={() => setOpen((o) => !o)} title="ตั้งค่า">
        ⚙
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 flex w-72 flex-col gap-3 rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm shadow-xl">
          {!online && (
            <>
          {PLAYERS.map((p) => (
            <label key={p} className="flex items-center justify-between gap-2">
              <span className="text-slate-300">เด็ค{playerLabel(p)}</span>
              <select
                value={decks[p]}
                disabled={!!online}
                onChange={(e) => setDeck(p, e.target.value as DeckId)}
                className="rounded bg-slate-700 px-2 py-1 text-slate-100"
              >
                {(Object.keys(DECKS) as DeckId[]).map((id) => (
                  <option key={id} value={id}>
                    {DECKS[id].label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="-mt-1 text-xs text-slate-500">เปลี่ยนเด็คจะเริ่มเกมใหม่</p>
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input type="checkbox" checked={hideIdleHand} onChange={toggleHideIdleHand} />
            ซ่อนมือฝ่ายที่ไม่ได้ตัดสินใจ
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input type="checkbox" checked={fixedView} onChange={toggleFixedView} />
            มุมมองคงที่ (ผู้เล่น 1 อยู่ล่างเสมอ)
          </label>
            </>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input type="checkbox" checked={animations} onChange={toggleAnimations} />
            เอฟเฟกต์ภาพ (ป้ายสเต็ป, cut-in อัญเชิญ, ป๊อปอัปเอฟเฟกต์)
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <span className="shrink-0">Cut-in การ์ด X</span>
            <select
              value={cutIn}
              disabled={!animations}
              onChange={(e) => setCutIn(e.target.value as CutInMode)}
              className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 disabled:opacity-40"
            >
              <option value="first">ครั้งแรกของการ์ดแต่ละชนิด</option>
              <option value="always">ทุกครั้ง</option>
              <option value="off">ปิด (ลงสนามแบบหนักแทน)</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <label className="flex cursor-pointer items-center gap-2 text-slate-300">
              <input type="checkbox" checked={sound.on} onChange={(e) => updateSound({ on: e.target.checked })} />
              เสียงประกอบ (SFX)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.volume}
              disabled={!sound.on}
              onChange={(e) => updateSound({ volume: Number(e.target.value) })}
              onPointerUp={() => sfx('activate')}
              className="ml-6 accent-yellow-400 disabled:opacity-40"
              aria-label="ความดังเสียง"
            />
          </div>
          {!online && (
            <>
          <label className="flex cursor-pointer items-start gap-2 text-slate-300">
            <input type="checkbox" checked={autoPass} onChange={toggleAutoPass} className="mt-1" />
            <span>
              Auto Pass
              <span className="block text-xs text-slate-500">Pass/ไม่ป้องกันให้เองเมื่อไม่มีการ์ดหรือสปิริตที่ใช้ได้</span>
            </span>
          </label>
            </>
          )}
          {online && <OnlineExit />}
          {!online && <span className="text-xs text-slate-500">seed {seed}</span>}
        </div>
      )}
    </div>
  );
}

/** สลับหน้า: หน้าหลัก / Lobby / ดูเด็ค / กระดาน */
export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <>
      {screen === 'home' ? <Home /> : screen === 'lobby' ? <Lobby /> : screen === 'decks' ? <DeckViewer /> : <GameScreen />}
      {screen !== 'game' && <ErrorToast />}
    </>
  );
}

function GameScreen() {
  const [inspector, setInspector] = useState(true);
  // ผู้เล่นที่ถือเทิร์นอยู่ด้านล่าง (มือใหญ่ กดง่าย) เว้นแต่ตั้งมุมมองคงที่
  const bottom = useGame(viewPlayer);
  const top = opponentOf(bottom);

  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] overflow-hidden">
      {/* ออร่าฝั่งที่ต้องตัดสินใจ: อยู่หลังกระดาน ไม่บังการ์ด */}
      <TurnAura />
      {/* กระดาน */}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <main className="mx-auto flex min-h-0 w-full max-w-[1380px] flex-1 flex-col gap-1.5 overflow-y-auto px-3 pt-0 pb-0">
          {/* เว้นที่ให้มือคู่แข่งแบบพัดที่ลอยอยู่ขอบบน */}
          <div className="h-[56px] shrink-0" />
          <PlayerMat player={top} top />
          <div className="sticky top-0 bottom-0 z-30 shrink-0">
            <PromptBar />
          </div>
          <PlayerMat player={bottom} />
          {/* เว้นที่ให้มือแบบพัดที่ลอยอยู่ขอบล่าง */}
          <div className="h-[104px] shrink-0" />
        </main>
        <HandFan player={top} top />
        <HandFan player={bottom} />
      </div>

      {/* HUD: ป้ายผู้เล่น / รายละเอียดการ์ดลอย / ปุ่มมุมขวาล่าง */}
      <FinalBlowWarning />
      <PlayerPlate player={bottom} corner="bottom-left" />
      <PlayerPlate player={top} corner="top-right" />
      <FloatingInspector enabled={inspector} />
      <CornerButtons inspector={inspector} setInspector={setInspector} />

      <AttackArrow />
      <DragGhost />
      <CoreDragGhost />
      <FxLayer />
      <PlayDialog />
      <ChoiceDialog />
      <TrashDialog />
      <ErrorToast />
    </div>
  );
}
