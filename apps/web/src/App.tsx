import { useEffect, useState } from 'react';
import { Login } from './screens/Login';
import { useAccount } from './account/account';
import { opponentOf } from '@bs/engine';
import { useGame, viewPlayer } from './store';
import { HandFan, PlayerMat } from './components/Board';
import { ChoiceDialog, ErrorToast, FlashCue, PromptBar, SummonPanel, ShownFan, TrashDialog, TrashSummonFan } from './components/Controls';
import { UpdateNotice, WhatsNew } from './components/Updates';
import { CornerButtons, FinalBlowWarning, FloatingInspector, PlayerPlate, TeamMiniPlate, TurnAura } from './components/Hud';
import { PlayDialog } from './components/PlayDialog';
import { MyDeck } from './screens/MyDeck';
import { BTN } from './components/Modal';
import { AttackArrow, FxLayer } from './components/Fx';
import { DrawPrompt } from './components/DrawPrompt';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import { Icon } from './components/Icon';
import { usePortraitPhone } from './touch';
import { probeGfx, useGfx } from './gfx';
import { FpsMeter, SettingsDialog } from './components/SettingsDialog';
import { CoreDragGhost, DragGhost } from './components/DragGhost';
import { DeckViewer } from './screens/DeckViewer';
import { DeckBuilder } from './screens/DeckBuilder';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Solo } from './screens/Solo';
import { useBgmDirector } from './bgmDirector';
import { usePrefs } from './prefs';
import { GameDataAsk, GameDataPill } from './components/GameDataUi';
import { NetWarning } from './components/NetStatus';

const ICON_BTN =
  'flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/50 bg-gradient-to-b from-slate-700 to-slate-900 text-lg text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:scale-105 hover:text-white hover:shadow-[0_0_16px_rgba(56,189,248,0.55)] disabled:opacity-40';

/** ป้ายจำนวนผู้ชมระหว่างเล่นออนไลน์ · ชี้/แตะเพื่อดูรายชื่อ */
function WatchersBadge() {
  const watchers = useGame((s) => s.online?.watchers);
  const [open, setOpen] = useState(false);
  const names = Object.values(watchers ?? {}).map((n) => n || 'ผู้ชม');
  const list = names.length ? names.join(', ') : 'ยังไม่มีผู้ชม';
  return (
    <div className="relative">
      <button
        type="button"
        data-watchers={names.length}
        title={list}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className={`flex h-10 items-center gap-1.5 rounded-full border border-sky-300/50 bg-gradient-to-b from-slate-700 to-slate-900 px-3 text-sm font-bold text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:text-white ${names.length ? '' : 'opacity-60'}`}
      >
        <Icon name="eye" className="text-lg" />
        <span>ผู้ชม {names.length}</span>
      </button>
      {open && names.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 max-h-60 min-w-36 overflow-y-auto rounded-lg border border-sky-300/40 bg-slate-900/95 px-3 py-2 text-sm text-sky-100 shadow-lg">
          {names.map((n, i) => (
            <div key={i} className="truncate py-0.5">{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** ปุ่มลอยมุมซ้ายบน (แทน TopBar) */
function Toolbar() {
  const online = useGame((s) => s.online);
  // ออนไลน์: เหลือแค่ปุ่มตั้งค่า (ยอมแพ้/ออกจากห้องอยู่ในตั้งค่า)
  if (online) {
    return (
      <div className="fixed top-2 left-2 z-[45] flex items-center gap-1.5">
        <Settings />
        <WatchersBadge />
      </div>
    );
  }
  // ออฟไลน์ (ดวลกับบอท / บทเรียน): กลับหน้าหลัก + ตั้งค่า
  return (
    <div data-tutorial-lock className="fixed top-2 left-2 z-[45] flex items-center gap-1.5">
      <button
        type="button"
        className={ICON_BTN}
        title="กลับหน้าหลัก"
        onClick={() => {
          const g = useGame.getState();
          // ดวลกับบอท: ออกจากหน้าเกม = จบการดวลนี้
          if (g.botSeat && !g.state.winner && !confirm('ออกจากการดวลนี้แล้วกลับหน้าหลัก?')) return;
          g.setScreen('home');
        }}
      >
        <Icon name="home" />
      </button>
      <Settings />
    </div>
  );
}

/** ในตั้งค่าตอนออนไลน์: ยอมแพ้ (ระหว่างเล่น) หรือออกจากห้อง (ยังไม่เริ่ม/จบแล้ว) */
function OnlineExit() {
  const online = useGame((s) => s.online);
  const winner = useGame((s) => s.state.winner);
  if (!online) return null;
  const playing = online.status === 'playing' && !winner && !online.spectator;
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
          } else if (confirm(online.spectator ? 'ออกจากการชมแล้วกลับห้องดวล?' : 'ออกจากเกม?')) useGame.getState().onlineLeave();
        }}
      >
        {playing ? 'ยอมแพ้' : online.spectator ? 'ออกจากการชม' : 'ออกจากเกม'}
      </button>
    </div>
  );
}

/** ในตั้งค่าตอนดวลกับบอท: ยอมแพ้ */
function BotConcede() {
  const botSeat = useGame((s) => s.botSeat);
  const winner = useGame((s) => s.state.winner);
  if (!botSeat || winner) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-slate-700 pt-3">
      <button
        type="button"
        className="rounded-lg bg-rose-700/80 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600"
        onClick={() => {
          if (confirm('ยอมแพ้เกมนี้?')) useGame.getState().dispatch({ type: 'concede', player: opponentOf(botSeat) });
        }}
      >
        ยอมแพ้
      </button>
    </div>
  );
}

/** ปุ่มตั้งค่าในเกม: เปิดหน้าต่างตั้งค่า (แท็บการเล่น: ยอมแพ้ / ออกจากห้อง) */
function Settings() {
  const [open, setOpen] = useState(false);
  const online = useGame((s) => s.online);
  const extra = online ? <OnlineExit /> : <BotConcede />;
  return (
    <>
      <button type="button" className={ICON_BTN} onClick={() => setOpen(true)} title="ตั้งค่า">
        <Icon name="settings" />
      </button>
      {open && <SettingsDialog onClose={() => setOpen(false)} playExtra={extra} />}
    </>
  );
}

/** สลับหน้า: หน้าหลัก / Lobby / ดูเด็ค / กระดาน */
export function App() {
  const screen = useGame((s) => s.screen);
  useBgmDirector();
  // ต้องล็อกอินก่อนเข้าเกม: เปิดแอปเริ่มที่หน้าไตเติลเสมอ · ออกจากระบบ = กลับหน้าไตเติล
  const user = useAccount((s) => s.user);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!user) setEntered(false);
  }, [user]);
  const gated = !entered || !user;
  // มือถือแนวนอน: กระดานเกมต้องการความสูง 860 ส่วนหน้าเมนูใช้น้อยกว่า (ย่อน้อยลง ปุ่ม/ตัวหนังสือใหญ่ขึ้น)
  useEffect(() => {
    const w = window as unknown as { __fitH?: number; __refit?: () => void };
    w.__fitH = screen === 'game' && !gated ? 860 : 640;
    w.__refit?.();
  }, [screen, gated]);
  if (gated) {
    return (
      <>
        <Login onEnter={() => setEntered(true)} />
        <UpdateNotice />
        <GameDataPill />
        <RotateHint />
      </>
    );
  }
  return (
    <>
      {/* เพิ่งเข้าจากหน้าไตเติล: แสงวาบจางออก */}
      <div className="pointer-events-none fixed inset-0 z-[150] bg-white" style={{ animation: 'login-flash-out 0.6s ease-out both' }} />
      {screen === 'home' ? <Home /> : screen === 'solo' ? <Solo /> : screen === 'lobby' ? <Lobby /> : screen === 'decks' ? <DeckViewer /> : screen === 'mydeck' ? <MyDeck /> : screen === 'builder' ? <DeckBuilder /> : <GameScreen />}
      {screen !== 'game' && <ErrorToast />}
      {/* อัปเดตแอป: แจ้งเวอร์ชันใหม่ / มีอะไรใหม่หลังอัปเดต */}
      <UpdateNotice />
      {/* ดาวน์โหลดข้อมูลเกมทั้งหมด: ชวนครั้งแรก (หน้าหลัก) + ป้ายความคืบหน้า */}
      {screen === 'home' && <GameDataAsk />}
      <GameDataPill />
      <WhatsNew />
      <FpsMeter />
      {/* มือถือ: เล่นแนวนอนเท่านั้น (ทุกหน้า) */}
      <RotateHint />
    </>
  );
}

/** ถือมือถือแนวตั้ง: เกมเล่นแนวนอนเท่านั้น */
function RotateHint() {
  if (!usePortraitPhone()) return null;
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[#05040d]/95 text-center text-white">
      <div className="text-7xl" style={{ animation: 'rotate-hint 2.4s ease-in-out infinite' }}>
        📱
      </div>
      <div className="text-4xl font-black">หมุนโทรศัพท์เป็นแนวนอน</div>
      <div className="text-2xl text-slate-300">เกมนี้เล่นได้เฉพาะแนวนอน</div>
    </div>
  );
}

/** ปรับคุณภาพกราฟิกเป็น "ต่ำ" ให้อัตโนมัติ: บอกผู้เล่นครั้งเดียว */
function GfxNotice() {
  const { autoJustLowered, dismissNotice } = useGfx();
  useEffect(() => {
    if (!autoJustLowered) return;
    const t = setTimeout(dismissNotice, 7000);
    return () => clearTimeout(t);
  }, [autoJustLowered, dismissNotice]);
  if (!autoJustLowered) return null;
  return (
    <div className="fixed top-14 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-sky-300/50 bg-slate-950/95 py-2 pr-2 pl-4 text-sm shadow-xl">
      <span className="text-slate-200">
        เครื่องนี้แสดงภาพไม่ทัน: ปรับคุณภาพกราฟิกเป็น <b className="text-sky-200">ต่ำ</b> ให้อัตโนมัติ (เปลี่ยนได้ในตั้งค่า → กราฟิก)
      </span>
      <button type="button" onClick={dismissNotice} className="rounded px-2 text-slate-400 hover:text-white">
        ✕
      </button>
    </div>
  );
}

function GameScreen() {
  const [inspector, setInspector] = useState(true);
  // โหมดลดเอฟเฟกต์อัตโนมัติ: วัดเฟรมเรตบนกระดานหลังฉากเปิดเกม/แอนิเมชันจบ
  const settled = useGame((s) => !s.fx.some((f) => f.kind === 'intro') && !(s.pregame && !s.pregame.chosen));
  useEffect(() => {
    if (settled) probeGfx();
  }, [settled]);
  // ผู้เล่นที่ถือเทิร์นอยู่ด้านล่าง (มือใหญ่ กดง่าย) เว้นแต่ตั้งมุมมองคงที่
  const bottom = useGame(viewPlayer);
  const top = opponentOf(bottom);
  // 2VS2: มือของคนที่สองของแต่ละทีม
  // 1VS2: ฝั่งที่เล่นคนเดียวไม่มีมือ/ป้ายคนที่สอง
  const topTeam = useGame((s) => !!s.state.players[opponentOf(viewPlayer(s))].partner);
  const bottomTeam = useGame((s) => !!s.state.players[viewPlayer(s)].partner);
  const partnerHidden = useGame((s) => s.partnerHandHidden);
  const tilt = usePrefs((p) => p.boardTilt);

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
          {/* โต๊ะ: สนามสองฝั่ง + แถบกลาง เอียงเป็นระนาบเดียว (ตั้งค่า → กราฟิก → เอียงกระดาน) */}
          <div className={`board-tilt flex flex-1 flex-col gap-1.5 ${tilt ? 'tilted' : ''}`}>
            <PlayerMat player={top} top />
            <div data-setup="bar" className="sticky top-0 bottom-0 z-30 shrink-0">
              <PromptBar />
            </div>
            <PlayerMat player={bottom} />
          </div>
          {/* เว้นที่ให้มือแบบพัดที่ลอยอยู่ขอบล่าง */}
          <div className="h-[104px] shrink-0" />
        </main>
        <HandFan player={top} top />
        <HandFan player={bottom} />
        {/* 2VS2: มือของคนที่สองของแต่ละทีม (พัดเดียวกับคนหลัก แบ่งครึ่งจอ: คู่แข่ง 2 = บนซ้าย · เพื่อนร่วมทีม = ล่างขวา หงายหน้า ดูได้อย่างเดียว) */}
        {topTeam && <HandFan player={top} top partner />}
        {bottomTeam && !partnerHidden && <HandFan player={bottom} partner />}
      </div>

      {/* HUD: ป้ายผู้เล่น / รายละเอียดการ์ดลอย / ปุ่มมุมขวาล่าง */}
      <FinalBlowWarning />
      {/* ออนไลน์: หลุด / ส่งแล้วรอนาน / คู่แข่งไม่ตอบสนอง */}
      <NetWarning />
      <FlashCue />
      <GfxNotice />
      <PlayerPlate player={bottom} corner="bottom-left" />
      <PlayerPlate player={top} corner="top-right" />
      {/* 2VS2: โปรไฟล์ย่อของคนที่สองของแต่ละทีม */}
      {bottomTeam && <TeamMiniPlate player={bottom} corner="bottom-right" />}
      {topTeam && <TeamMiniPlate player={top} corner="top-left" />}
      <FloatingInspector enabled={inspector} />
      <CornerButtons inspector={inspector} setInspector={setInspector} />

      <AttackArrow />
      <DragGhost />
      <CoreDragGhost />
      <FxLayer />
      <DrawPrompt />
      <TutorialOverlay />
      <PlayDialog />
      <ChoiceDialog />
      <SummonPanel />
      <TrashDialog />
      <TrashSummonFan />
      <ShownFan />
      <ErrorToast />
    </div>
  );
}
