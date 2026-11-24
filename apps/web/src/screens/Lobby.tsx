/**
 * หน้า DUEL: เมนูการดวล → Free Duel → Duel Room
 *  - Room Match: สร้างห้อง / เข้าห้อง (รายการห้อง + ค้นหาด้วยรหัส)
 *  - สร้างห้อง: ตั้งชื่อห้อง ความคิดเห็น แสดงในรายการห้อง เด็คที่ใช้
 *  - หน้าห้อง: โต๊ะ 1 โต๊ะ 2 ที่นั่ง กด ENTRY เพื่อนั่ง (ครบสองคน = เริ่มเกม)
 */
import { useEffect, useRef, useState } from 'react';
import type { DuelRoom, LobbyEntry, TableSeat } from '../online/transport';
import { sfx } from '../sfx';
import {
  compatibleVersion,
  duelCreate,
  duelJoin,
  duelLeave,
  duelReady,
  duelSetDeck,
  duelChatSend,
  watchDuelChat,
  CHAT_MAX,
  type ChatMsg,
  duelSit,
  duelSpectate,
  duelStand,
  listRooms,
  sweepRooms,
  onlineAvailable,
  onlineVia,
  playableDecks,
  seatOf,
  tablePlayers,
  tableSeats,
  seatUid,
  tableIds,
  useGame,
  type DeckId,
} from '../store';
import { DeckBox, keyCards } from '../components/DeckBox';
import { COLOR_LABEL } from '../format';
import { deckInfo } from '../decks';
import { db } from '../store';
import { BackButton, CardArt, deckColor, deckSize } from './shared';
import { AvatarImg } from '../components/AccountDialog';

const LOBBY_DECK_KEY = 'bs-lobby-deck';
const COMMENTS = ['', 'ยินดีต้อนรับทุกคน', 'มือใหม่ ฝึกเล่น', 'เด็คสนุก ๆ', 'ดวลจริงจัง', 'Starter Deck เท่านั้น', 'ทดสอบเด็ค'];

type View = { kind: 'menu' } | { kind: 'create' } | { kind: 'list' } | { kind: 'room'; code: string };

/** หน้าที่เปิดอยู่ (จำไว้ตอนไปหน้าดู/จัดเด็คแล้วกลับมา) */
let lastView: View = { kind: 'menu' };
/** โหมดที่เลือกในเมนูการดวล: Team Battle (2VS2) / Duel Room (1VS1) */
let lastTeam = false;
/** ไปแก้เด็คจากหน้าห้อง: กลับมาแล้วส่งเด็คที่แก้ขึ้นห้องใหม่ */
let resyncDeck = false;

/** ไปหน้าดู/จัดเด็ค แล้วกลับมาที่หน้า DUEL */
/** เปลี่ยนเด็ค: เปิดหน้าเด็คของฉันในโหมดเลือก · เลือกแล้วกลับห้อง (useLobbyDeck อ่านเด็คที่เลือกจาก LOBBY_DECK_KEY แล้วส่งขึ้นห้อง) */
function pickDeckScreen(deck: DeckId) {
  resyncDeck = true;
  useGame.setState({ deckPick: deck, deckReturn: 'lobby' });
  useGame.getState().setScreen('mydeck');
}

function openDeckScreen(deck: DeckId, screen: 'decks' | 'builder') {
  useGame.setState({ deckView: deck, deckReturn: 'lobby' });
  useGame.getState().setScreen(screen);
}

/** เด็คที่ใช้ในหน้าห้อง: จำเด็คที่เลือกล่าสุดของเครื่องนี้ */
function useLobbyDeck(): [DeckId, (id: DeckId) => void] {
  const decks = useGame((s) => s.decks);
  const [deck, setDeckState] = useState<DeckId>(() => {
    const ids = playableDecks();
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOBBY_DECK_KEY);
    } catch {
      /* อ่านไม่ได้ก็ใช้ค่าอื่น */
    }
    if (saved && ids.includes(saved)) return saved;
    // ห้าม decks.p1 ตรง ๆ หลังเล่นออนไลน์ (= เด็คของเจ้าของห้อง)
    return ids.includes(decks.p1) ? decks.p1 : (ids[0] ?? 'sd01');
  });
  const set = (id: DeckId) => {
    setDeckState(id);
    try {
      localStorage.setItem(LOBBY_DECK_KEY, id);
    } catch {
      /* เก็บไม่ได้ก็ไม่เป็นไร */
    }
  };
  return [deck, set];
}

// ---------------------------------------------------------------- ส่วนประกอบ

/** หัวข้อหน้า (ปุ่มย้อนกลับ + ชื่อหน้า) */
function TopBar({ title, sub, onBack }: { title: string; sub: string; onBack: () => void }) {
  return (
    <header className="relative z-10 flex items-center gap-5 border-b border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent py-4 pr-6">
      <BackButton onClick={onBack} label="ย้อนกลับ" />
      <div>
        <div className="text-[11px] tracking-[0.4em] text-sky-300">{sub}</div>
        <div className="text-2xl font-black text-white">{title}</div>
      </div>
    </header>
  );
}

type EmblemIcon = 'room' | 'rank' | 'casual' | 'team' | 'event';

/** ตราสัญลักษณ์ของเมนู: เพชรซ้อนชั้น + ไอคอน */
function Emblem({ icon, color, size = 130 }: { icon: EmblemIcon; color: string; size?: number }) {
  const line = { fill: 'none', stroke: color, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const glyph = {
    room: (
      <>
        <path d="M38 68V32h24v36" {...line} />
        <path d="M44 68V38h12v30" {...line} />
        <circle cx="53" cy="53" r="1.6" fill={color} />
      </>
    ),
    rank: <path d="M50 30l5.5 11.5 12.5 1.8-9 8.8 2 12.4L50 58.6l-11 5.9 2-12.4-9-8.8 12.5-1.8z" {...line} />,
    casual: (
      <>
        <rect x="35" y="35" width="30" height="30" rx="5" {...line} />
        <circle cx="43" cy="43" r="2.4" fill={color} />
        <circle cx="57" cy="57" r="2.4" fill={color} />
        <circle cx="50" cy="50" r="2.4" fill={color} />
      </>
    ),
    team: (
      <>
        <circle cx="42" cy="42" r="6" {...line} />
        <circle cx="58" cy="42" r="6" {...line} />
        <path d="M30 66c2-9 8-13 12-13s10 4 12 13M46 66c2-9 8-13 12-13s10 4 12 13" {...line} />
      </>
    ),
    event: <path d="M36 66l14-34 14 34z M43 52h14" {...line} />,
  }[icon];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="drop-shadow-[0_0_14px_rgba(0,0,0,0.6)]">
      <path d="M50 4L96 50 50 96 4 50z" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="2" />
      <path d="M50 14L86 50 50 86 14 50z" fill="rgba(2,6,23,0.75)" stroke={color} strokeOpacity="0.6" strokeWidth="2" />
      <path d="M50 22L78 50 50 78 22 50z" fill="none" stroke={color} strokeOpacity="0.9" strokeWidth="1.5" />
      {glyph}
    </svg>
  );
}

/** ไทล์เมนูการดวล (ไม่มี onClick = ยังไม่เปิด) */
function DuelTile({ title, tag, icon, color, status, onClick, className = '', big }: { title: string; tag?: string; icon: EmblemIcon; color: string; status: string; onClick?: () => void; className?: string; big?: boolean }) {
  const locked = !onClick;
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => {
        sfx('click');
        onClick?.();
      }}
      onMouseEnter={() => !locked && sfx('hover')}
      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 bg-slate-950/80 text-left transition ${
        locked ? 'cursor-not-allowed border-white/10 opacity-60 saturate-50' : 'border-white/15 hover:-translate-y-0.5 hover:border-lime-300 hover:shadow-[0_0_26px_rgba(190,242,100,0.45)]'
      } ${className}`}
    >
      <div className="flex items-center justify-between bg-black/70 px-4 py-2">
        <span className="text-lg font-black text-white">{title}</span>
        {tag && <span className="text-sm font-bold text-slate-300">{tag}</span>}
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        style={{ background: `repeating-linear-gradient(135deg, ${color}14 0 18px, transparent 18px 36px), radial-gradient(circle at 50% 50%, ${color}33, transparent 70%)` }}
      >
        <div className="transition duration-300 group-hover:scale-110">
          <Emblem icon={icon} color={color} size={big ? 170 : 96} />
        </div>
      </div>
      <div className={`px-4 py-2 text-center text-sm font-bold ${locked ? 'bg-black/60 text-slate-400' : 'bg-gradient-to-r from-amber-500/90 to-orange-600/80 text-white'}`}>{status}</div>
    </button>
  );
}

/** แถวตั้งค่าในหน้าสร้างห้อง */
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border border-white/10 bg-black/70 px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold text-white">{label}</span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => (sfx('click'), onChange(!on))} className={`w-20 rounded-full py-1 text-sm font-black transition ${on ? 'bg-lime-300 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
      {on ? 'ON' : 'OFF'}
    </button>
  );
}

/** กล่องเด็คที่ใช้ (มุมขวาล่างของหน้าห้อง): ชี้ = การ์ดเด่นโผล่ · กด = เมนูเด็ค */
function DeckCard({ deck, onChange, lockedReason, onEdit, onView }: { deck: DeckId; onChange?: (id: DeckId) => void; lockedReason?: string; onEdit?: () => void; onView: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => (sfx('click'), setMenu(true))}
        onMouseEnter={() => sfx('hover')}
        className="group flex w-full flex-col items-center rounded-2xl bg-slate-700/40 px-4 pt-2 pb-3 ring-1 ring-white/10 transition hover:bg-slate-600/45 hover:ring-lime-300/60"
        title="เมนูเด็ค"
      >
        <DeckBox deck={deck} />
        <div className="mt-1 max-w-full truncate text-lg font-black text-white">{deckInfo(deck).label}</div>
        <div className="text-xs text-slate-400">{deckSize(deck)} ใบ · กดเพื่อเปิดเมนูเด็ค</div>
      </button>
      {menu && <DeckMenu deck={deck} onClose={() => setMenu(false)} onChange={onChange} lockedReason={lockedReason} onEdit={onEdit} onView={onView} />}
    </>
  );
}

/** เมนูเด็ค: แก้ไขเด็ค / เปลี่ยนเด็ค / ดูการ์ดในเด็ค */
function DeckMenu({
  deck,
  onClose,
  onChange,
  lockedReason,
  onEdit,
  onView,
}: {
  deck: DeckId;
  onClose: () => void;
  onChange?: (id: DeckId) => void;
  lockedReason?: string;
  onEdit?: () => void;
  onView: () => void;
}) {
  const custom = deckInfo(deck).custom;
  const item = (label: string, sub: string, onClick?: () => void) => (
    <button
      type="button"
      disabled={!onClick}
      onClick={() => (sfx('click'), onClick?.())}
      onMouseEnter={() => onClick && sfx('hover')}
      className="flex w-full flex-col items-center rounded-full border-2 border-white/40 bg-black py-2.5 transition enabled:hover:border-lime-300 enabled:hover:shadow-[0_0_20px_rgba(190,242,100,0.5)] disabled:opacity-40"
    >
      <span className="text-lg font-black text-white">{label}</span>
      <span className="text-xs text-slate-400">{sub}</span>
    </button>
  );
  const colors = [...new Set(deckInfo(deck).entries.flatMap((e) => db.find(e.cardNo)?.colors ?? []))];
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/70" onClick={onClose}>
      <div className="flex h-full w-[52rem] max-w-full flex-col justify-center bg-gradient-to-b from-slate-800/95 via-slate-900/95 to-slate-950/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b-2 border-sky-400 pb-3 text-center text-2xl font-black text-white">เมนูเด็ค</div>
        <div className="bg-black/50 px-8 py-4">
          <div className="text-center text-lg font-black text-white">{deckInfo(deck).label}</div>
          <div className="mt-2 flex items-end justify-center gap-4">
            <DeckBox deck={deck} open size={1.1} />
            <div className="flex gap-2 pb-2">
              {keyCards(deck, 8)
                .slice(3)
                .map((no) => (
                  <div key={no} className="w-16 rounded-md bg-slate-800/80 p-1 ring-1 ring-white/10">
                    <CardArt cardNo={no} className="w-full rounded" />
                  </div>
                ))}
            </div>
          </div>
          <div className="mt-1 text-center text-xs text-slate-400">
            {deckSize(deck)} ใบ · {deckInfo(deck).entries.length} ชนิด · สี {colors.map((c) => COLOR_LABEL[c as keyof typeof COLOR_LABEL] ?? c).join(' / ')}
          </div>
        </div>
          <div className="flex flex-col gap-3 bg-gradient-to-b from-sky-900/30 to-transparent px-16 py-6">
            {item(custom ? 'แก้ไขเด็ค' : 'จัดเด็คใหม่จากเด็คนี้', lockedReason ?? (custom ? 'เปิดหน้าจัดเด็ค' : 'คัดลอก Starter Deck ไปจัดเอง'), lockedReason ? undefined : onEdit)}
            {item('เปลี่ยนเด็ค', lockedReason ?? 'ไปหน้าเด็คของฉันเพื่อเลือกเด็คที่จะใช้ในห้องนี้', lockedReason ? undefined : onChange && (() => pickDeckScreen(deck)))}
            {item('ดูการ์ดในเด็ค', 'รายการการ์ดทั้งหมดของเด็คนี้', onView)}
          </div>
        <div className="flex justify-center pt-2">
          <button type="button" onClick={onClose} className="w-96 rounded-lg border border-white/40 bg-black py-2.5 text-lg font-black text-lime-300 hover:border-lime-300">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}

const timeText = (t: number) => new Date(t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- หน้าต่าง ๆ

function DuelMenu({ onRoom, onTeam }: { onRoom: () => void; onTeam: () => void }) {
  return (
    <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-10 px-16 py-6">
      <div className="flex min-h-0 flex-col gap-2">
        <h2 className="text-lg font-black text-white">Ranked Duel</h2>
        <DuelTile title="แรงก์" tag="เร็ว ๆ นี้" icon="rank" color="#4ade80" status="ยังไม่เปิด" className="h-56 shrink-0" big />
        <h2 className="mt-2 text-lg font-black text-white">Free Duel</h2>
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-4">
          <DuelTile title="Duel Room" icon="room" color="#38bdf8" status="ใช้งานได้" onClick={onRoom} className="row-span-2" big />
          <DuelTile title="Casual Match" tag="เร็ว ๆ นี้" icon="casual" color="#facc15" status="ยังไม่เปิด" />
          <DuelTile title="Team Battle" tag="ทดลอง" icon="team" color="#c084fc" status="2VS2 · ใช้งานได้" onClick={onTeam} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2">
        <h2 className="text-lg font-black text-white">Event Duel</h2>
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/10 bg-black/40 text-slate-400">
          <Emblem icon="event" color="#f472b6" size={90} />
          ยังไม่มีอีเวนต์ในตอนนี้
        </div>
      </div>
    </div>
  );
}

/** หน้าต่าง Room Match: สร้างห้อง / เข้าห้อง / ชมการดวล */
function RoomMatch({ onClose, onCreate, onEnter, team }: { onClose: () => void; onCreate: () => void; onEnter: () => void; team: boolean }) {
  const item = (label: string, sub: string, onClick?: () => void) => (
    <button
      type="button"
      disabled={!onClick}
      onClick={() => (sfx('click'), onClick?.())}
      onMouseEnter={() => onClick && sfx('hover')}
      className="flex w-full flex-col items-center rounded-full border-2 border-white/40 bg-black py-3 transition enabled:hover:border-lime-300 enabled:hover:shadow-[0_0_20px_rgba(190,242,100,0.5)] disabled:opacity-40"
    >
      <span className="text-lg font-black text-white">{label}</span>
      <span className="text-xs text-slate-400">{sub}</span>
    </button>
  );
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/70" onClick={onClose}>
      <div className="flex h-full w-[46rem] max-w-full flex-col justify-center bg-gradient-to-b from-slate-800/95 via-slate-900/95 to-slate-950/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`border-b-2 pb-3 text-center text-2xl font-black text-white ${team ? 'border-fuchsia-400' : 'border-sky-400'}`}>{team ? 'Team Battle (2VS2)' : 'Room Match'}</div>
        <div className="flex flex-col gap-4 bg-gradient-to-b from-sky-900/30 to-transparent px-16 py-8">
          {team && <div className="text-center text-sm text-slate-300">ทีมละ 2 คน · สนามใช้ร่วมกันทั้งทีม · ต้องมีผู้เล่นครบ 4 คนต่อโต๊ะ</div>}
          {item('สร้างห้อง', team ? 'ตั้งชื่อห้อง เลือกเด็ค แล้วรอเพื่อนอีก 3 คน' : 'ตั้งชื่อห้อง เลือกเด็ค แล้วรอคู่แข่ง', onCreate)}
          {item('เข้าห้อง', 'เลือกจากรายการห้อง หรือใส่รหัสห้อง', onEnter)}
          {item('ชมการดวล', 'เร็ว ๆ นี้')}
        </div>
        <div className="flex justify-center">
          <button type="button" onClick={onClose} className="w-96 rounded-lg border border-white/40 bg-black py-2.5 text-lg font-black text-lime-300 hover:border-lime-300">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateRoom({ deck, team }: { deck: DeckId; team: boolean }) {
  const playerName = useGame((s) => s.playerName);
  const [roomName, setRoomName] = useState(`${team ? 'ทีมของ' : 'ห้องของ'} ${playerName}`);
  const [comment, setComment] = useState('');
  const [listed, setListed] = useState(true);
  const [max, setMax] = useState(team ? 4 : 6);
  const [busy, setBusy] = useState(false);
  const input = 'w-72 rounded bg-slate-800 px-3 py-1.5 text-right font-bold text-lime-300 outline-none focus:ring-2 focus:ring-lime-300';
  const create = async () => {
    setBusy(true);
    sfx('click');
    await duelCreate({ name: roomName, comment, listed, max, team }, deck);
    setBusy(false);
  };
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-16 py-6">
      <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-2 overflow-y-auto pr-2">
        <h3 className="mb-1 text-lg font-black text-white">ตั้งค่าห้อง</h3>
        <SettingRow label="ชื่อห้อง">
          <input value={roomName} maxLength={24} onChange={(e) => setRoomName(e.target.value)} className={input} />
        </SettingRow>
        <SettingRow label="ความคิดเห็น" hint="แสดงในรายการห้อง">
          <select value={comment} onChange={(e) => setComment(e.target.value)} className={input}>
            {COMMENTS.map((c) => (
              <option key={c} value={c}>
                {c || 'ไม่มี'}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="จำนวนคนในห้องสูงสุด" hint={`โต๊ะ ${team ? Math.floor(max / 4) : Math.ceil(max / 2)} โต๊ะ${team ? ' (โต๊ะละ 4 คน: 2VS2)' : ''} · คนที่ไม่ได้นั่งโต๊ะเข้าชมการดวลได้`}>
          <select value={max} onChange={(e) => setMax(Number(e.target.value))} className={input}>
            {(team ? [4, 5, 6, 7, 8] : [2, 3, 4, 5, 6]).map((n) => (
              <option key={n} value={n}>
                {n} คน
              </option>
            ))}
          </select>
        </SettingRow>
        <h3 className="mt-4 mb-1 text-lg font-black text-white">ตั้งค่าขั้นสูง</h3>
        <SettingRow label="แสดงในรายการห้อง" hint="ปิด = เข้าได้ด้วยรหัสห้องเท่านั้น">
          <Toggle on={listed} onChange={setListed} />
        </SettingRow>
      </div>
      {/* เด็คเลือก/เปลี่ยนในหน้าห้อง (สร้างห้องด้วยเด็คที่เลือกล่าสุด) */}
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="absolute right-12 bottom-8 w-80 rounded-lg border-2 border-white/40 bg-black py-3 text-xl font-black text-lime-300 transition hover:border-lime-300 hover:shadow-[0_0_24px_rgba(190,242,100,0.5)] disabled:opacity-50"
      >
        {busy ? 'กำลังสร้าง…' : 'สร้างห้อง'}
      </button>
    </div>
  );
}

function RoomList({ onOpen, team }: { onOpen: (code: string) => void; team: boolean }) {
  const [rooms, setRooms] = useState<LobbyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const load = () => {
    setRooms(null);
    setError(null);
    // ลบห้องค้าง (ไม่มีความเคลื่อนไหวเกิน 12 ชม.) ทำเบื้องหลัง ไม่รอ
    void sweepRooms();
    listRooms().then((list) => setRooms(list.filter((x) => !!x.team === team)), (e: Error) => {
      setRooms([]);
      setError(`โหลดรายการห้องไม่ได้ (${e.message}) · ยังเข้าห้องด้วยรหัสได้`);
    });
  };
  useEffect(load, []);
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center gap-4 px-16 py-5">
      <div className="flex w-full max-w-5xl items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-white/30 bg-slate-200/10 px-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && code.length === 5 && onOpen(code)}
            maxLength={5}
            placeholder="ใส่รหัสห้อง (5 ตัว)"
            className="flex-1 bg-transparent py-2.5 font-mono text-lg font-black tracking-[0.3em] text-white uppercase outline-none placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400"
          />
          <button type="button" disabled={code.length !== 5} onClick={() => onOpen(code)} className="rounded-full bg-lime-300 px-4 py-1 text-sm font-black text-slate-950 disabled:opacity-30">
            เข้า
          </button>
        </div>
        <button type="button" onClick={load} title="รีเฟรช" className="flex h-11 w-16 items-center justify-center rounded-full border border-white/40 bg-black text-white hover:border-lime-300">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
          </svg>
        </button>
      </div>
      {error && <div className="text-sm text-amber-300">{error}</div>}
      <div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {rooms === null && <div className="py-10 text-center text-slate-400">กำลังโหลด…</div>}
        {rooms?.length === 0 && !error && <div className="py-10 text-center text-slate-400">ยังไม่มีห้องที่เปิดอยู่ · ลองสร้างห้องเอง หรือใส่รหัสห้องจากเพื่อน</div>}
        {rooms?.map((r) => {
          const ok = compatibleVersion(r.version);
          return (
            <button
              key={r.code}
              type="button"
              onClick={() => (sfx('click'), onOpen(r.code))}
              className="group flex shrink-0 items-center gap-4 border-l-4 border-lime-300 bg-sky-950/70 px-5 py-3 text-left transition hover:bg-sky-900/80"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-lg font-black text-white">{r.name}</div>
                <div className="text-sm text-slate-300">
                  เจ้าของห้อง: {r.host} · ความคิดเห็น: {r.comment || 'ไม่มี'}
                </div>
                {!ok && <div className="text-xs font-bold text-amber-300">เวอร์ชันไม่ตรงกัน ({r.version}) เล่นด้วยกันไม่ได้</div>}
              </div>
              <div className="flex flex-col items-end gap-0.5 text-sm text-slate-300">
                <span className="font-bold text-white">
                  {r.team ? '2VS2 · ' : ''}คนในห้อง {r.count ?? 1}/{r.max ?? 2}
                </span>
                <span>เปิดเมื่อ {timeText(r.createdAt)}</span>
                <span className="font-mono text-xs text-slate-400">#{r.code}</span>
              </div>
              <span className="text-2xl text-slate-300 transition group-hover:translate-x-1">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** รูปโปรไฟล์ของสมาชิก · ไม่มี (เครื่องเวอร์ชันเก่า) = ตัวอักษรแรกของชื่อบนพื้นสีที่ได้จากชื่อ */
function Avatar({ name, avatar, size = 'md' }: { name: string; avatar?: string; size?: 'sm' | 'md' }) {
  if (avatar) return <AvatarImg cardNo={avatar} className={size === 'sm' ? 'h-8 w-8 shrink-0 rounded-full ring-1 ring-white/30' : 'h-full w-full'} />;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <div
      className={`flex items-center justify-center font-black text-white ${size === 'sm' ? 'h-8 w-8 rounded-full text-sm' : 'h-full w-full text-4xl'}`}
      style={{ background: `linear-gradient(145deg, hsl(${h} 70% 50%), hsl(${(h + 50) % 360} 65% 28%))`, textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
    >
      {letter}
    </div>
  );
}

const HEX = 'polygon(25% 2%, 75% 2%, 100% 50%, 75% 98%, 25% 98%, 0 50%)';

/** ที่นั่งบนโต๊ะ: กดที่ว่างเพื่อนั่ง · ที่นั่งของเรามีปุ่มลุก */
function Seat({ name, avatar, me, ready, onSit, onStand, locked }: { name?: string; avatar?: string; me?: boolean; ready?: boolean; onSit?: () => void; onStand?: () => void; locked?: boolean }) {
  const filled = !!name;
  return (
    <div className="flex w-36 flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={filled || !onSit}
        onClick={() => (sfx('click'), onSit?.())}
        title={filled ? name : 'กดเพื่อนั่งที่นี่'}
        className={`group relative h-24 w-28 p-[3px] transition ${me ? 'bg-lime-300' : filled ? 'bg-slate-400' : 'bg-slate-600 enabled:hover:bg-lime-300'}`}
        style={{ clipPath: HEX }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden bg-slate-800" style={{ clipPath: HEX }}>
          {filled ? <Avatar name={name} avatar={avatar} /> : <span className="text-sm font-bold text-slate-400 group-enabled:group-hover:text-lime-300">{onSit ? 'นั่งที่นี่' : 'ว่าง'}</span>}
        </div>
      </button>
      <div className={`max-w-full truncate text-sm font-bold ${filled ? 'text-white' : 'text-slate-500'}`}>{name ?? 'ว่าง'}</div>
      <div className="flex h-5 items-center gap-1">
        {filled && <span className={`rounded px-1.5 text-[11px] font-black ${ready ? 'bg-lime-300 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>{ready ? 'พร้อม' : 'ยังไม่พร้อม'}</span>}
        {me && onStand && !locked && (
          <button type="button" onClick={() => (sfx('click'), onStand())} className="rounded px-1.5 text-[11px] font-bold text-slate-300 ring-1 ring-white/20 hover:text-white">
            ลุก
          </button>
        )}
      </div>
    </div>
  );
}

/** โต๊ะหนึ่งโต๊ะ: ที่นั่ง 2 ฝั่ง + ตรงกลาง (พร้อม / เข้าชมการดวล / รอ) */
function TableCard({ room, t, uid }: { room: DuelRoom; t: string; uid: string }) {
  const online = useGame((s) => s.online);
  const tb = room.tables?.[t] ?? {};
  const keys = tableSeats(room);
  const team = !!room.meta.team;
  const mySeat = keys.find((k) => seatUid(room, t, k) === uid) ?? null;
  const name = (u?: string) => (u ? room.members?.[u]?.name : undefined);
  const avatar = (u?: string) => (u ? room.members?.[u]?.avatar : undefined);
  const game = tb.game;
  const ready = (s: TableSeat) => !!tb.ready?.[s];
  const iAmReady = mySeat ? ready(mySeat) : false;
  // Team Battle: 3 คน = 1VS2 (ฝั่งที่ไม่มีคนที่สองเล่นคนเดียว) · 4 คน = 2VS2
  const players = tablePlayers(room, t);
  const full = !!players;
  const allReady = !!players && players.every(ready);
  const solo = team && players?.length === 3 ? (players.filter((k) => k.startsWith('p1')).length === 1 ? 'ทีม A' : 'ทีม B') : null;
  const starting = !!game && !!online && online.code === game && online.status === 'waiting';

  let center: React.ReactNode;
  if (game && mySeat) {
    center = <div className="lobby-vs text-3xl font-black text-yellow-300 italic">{starting ? 'กำลังเริ่ม…' : 'กำลังดวล'}</div>;
  } else if (game) {
    center = (
      <button
        type="button"
        onClick={() => (sfx('click'), duelSpectate(t))}
        className="w-full rounded-xl border-2 border-sky-300/60 bg-black py-3 text-xl font-black text-sky-200 transition hover:border-lime-300 hover:text-lime-300 hover:shadow-[0_0_24px_rgba(190,242,100,0.45)]"
      >
        เข้าชมการดวล
      </button>
    );
  } else if (full) {
    center = mySeat ? (
      <>
        <button
          type="button"
          onClick={() => (sfx('click'), duelReady(!iAmReady))}
          className={`w-full rounded-xl border-2 py-3 text-2xl font-black tracking-widest transition ${
            iAmReady ? 'border-lime-300 bg-lime-300 text-slate-950' : 'border-white/30 bg-black text-lime-300 hover:border-lime-300 hover:shadow-[0_0_24px_rgba(190,242,100,0.5)]'
          }`}
        >
          {iAmReady ? 'พร้อมแล้ว ✓' : 'พร้อม'}
        </button>
        {solo && (
          <div className="rounded bg-amber-400/15 px-2 py-0.5 text-xs font-black text-amber-200" title="ฝั่งที่เล่นคนเดียว: ไลฟ์ 10 · คอร์สเต็ป +2 · ดรอว์สเต็ปจั่ว 2 ใบ">
            1VS2 · {solo} เล่นคนเดียว (ไลฟ์ 10 · คอร์ +2 · จั่ว 2)
          </div>
        )}
        <div className="text-xs text-slate-300">{allReady ? 'กำลังเริ่มเกม…' : iAmReady ? 'รอคนอื่นกดพร้อม (กดอีกครั้งเพื่อยกเลิก)' : `กดพร้อมเมื่อเลือกเด็คเสร็จ · ${team ? 'ทุกคนพร้อม' : 'ทั้งสองฝ่ายพร้อม'} = เริ่มดวล`}</div>
      </>
    ) : (
      <div className="text-sm text-slate-300">{allReady ? 'กำลังเริ่มเกม…' : 'รอผู้เล่นกดพร้อม…'}</div>
    );
  } else {
    center = (
      <>
        <div className="text-3xl font-black text-white/40 italic">VS</div>
        <div className="text-sm text-sky-200">{mySeat ? (team ? 'รอผู้เล่น (3 คน = 1VS2 · 4 คน = 2VS2)…' : 'รอคู่แข่งมานั่ง…') : 'กดที่นั่งว่างเพื่อนั่ง'}</div>
      </>
    );
  }
  const canSit = !game;
  return (
    <div className="shrink-0 overflow-hidden rounded-lg bg-slate-800/60 shadow-xl">
      <div className="flex items-center justify-between bg-slate-200 px-5 py-1.5 font-black text-slate-900">
        <span>โต๊ะ {t}</span>
        {game && <span className="text-xs font-bold text-rose-600">● กำลังดวล</span>}
      </div>
      <div className="flex items-center justify-center gap-8 px-6 py-4">
        {(['p1', 'p2'] as const).map((side, i) => {
          const seats = keys.filter((k) => k.startsWith(side));
          const col = (
            <div key={side} className="flex flex-col items-center gap-1">
              {team && <div className={`text-xs font-black tracking-widest ${side === 'p1' ? 'text-sky-300' : 'text-rose-300'}`}>{side === 'p1' ? 'ทีม A' : 'ทีม B'}</div>}
              <div className="flex gap-2">
                {seats.map((k) => {
                  const u = seatUid(room, t, k);
                  return <Seat key={k} name={name(u)} avatar={avatar(u)} me={mySeat === k} ready={ready(k)} onSit={canSit ? () => duelSit(t, k) : undefined} onStand={duelStand} locked={!!game || iAmReady} />;
                })}
              </div>
            </div>
          );
          return i === 0 ? (
            col
          ) : (
            <div key="rest" className="contents">
              <div className="flex w-64 flex-col items-center gap-2 text-center">{center}</div>
              {col}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** หน้าห้อง: โต๊ะทั้งหมด + เมนูห้อง + กล่องเด็ค */
function RoomView({ deck, setDeck }: { deck: DeckId; setDeck: (id: DeckId) => void }) {
  const duel = useGame((s) => s.duel)!;
  const online = useGame((s) => s.online);
  const setScreen = useGame((s) => s.setScreen);
  const [copied, setCopied] = useState(false);
  const [details, setDetails] = useState(false);
  const room = duel.room;
  const uid = duel.uid;
  // เกมของโต๊ะเราเริ่มแล้ว / กดเข้าชม: เข้ากระดานเมื่อพร้อม
  const go = !!online && online.status !== 'waiting';
  useEffect(() => {
    if (!go) return;
    const t = setTimeout(() => setScreen('game'), online?.spectator ? 0 : 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, setScreen]);
  // กลับมาจากหน้าจัดเด็ค: ส่งเด็คที่แก้แล้วขึ้นห้อง
  useEffect(() => {
    if (!room || !resyncDeck) return;
    resyncDeck = false;
    duelSetDeck(deck);
  }, [room, deck]);

  if (!room) return <div className="relative z-10 flex flex-1 items-center justify-center text-slate-300">กำลังโหลดห้อง {duel.code}…</div>;

  const members = Object.entries(room.members ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const seated = new Set(tableIds(room).flatMap((t) => tableSeats(room).map((p) => seatUid(room, t, p)).filter((x): x is string => !!x)));
  const watchers = members.filter(([u]) => !seated.has(u)).length;
  const mine = seatOf(room, uid);
  const myTable = mine ? room.tables?.[mine.t] : undefined;
  const locked = !!myTable?.game ? 'กำลังดวลอยู่ เปลี่ยนเด็คไม่ได้' : mine && myTable?.ready?.[mine.seat] ? 'กดยกเลิก "พร้อม" ก่อนเปลี่ยนเด็ค' : undefined;
  const host = room.host === uid;

  const menu = (label: string, onClick: () => void, danger?: boolean) => (
    <button
      type="button"
      onClick={() => (sfx('click'), onClick())}
      className={`flex items-center justify-between border border-white/40 bg-black px-5 py-3 text-left font-bold transition hover:border-lime-300 ${danger ? 'text-rose-400' : 'text-white'}`}
    >
      {label} <span className="text-slate-400">›</span>
    </button>
  );

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-6 px-16 pt-3 text-sm text-slate-200">
        <span className="text-lg font-black text-white">{room.meta.name}</span>
        <span>
          รหัสห้อง <b className="font-mono tracking-widest text-lime-300">{duel.code}</b>
        </span>
        <span>
          คนในห้อง {members.length}/{room.meta.max}
        </span>
        <span>ผู้ชม {watchers}</span>
      </div>
      <div className="flex min-h-0 flex-1 gap-10 px-16 py-4">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {tableIds(room).map((t) => (
            <TableCard key={t} room={room} t={t} uid={uid} />
          ))}
        </div>
        <div className="flex w-[22rem] shrink-0 flex-col gap-3">
          {menu(details ? 'ซ่อนรายละเอียดห้อง' : 'รายละเอียดห้อง / สมาชิก', () => setDetails((v) => !v))}
          {details && (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-white/10 bg-black/70 p-3 text-sm text-slate-300">
              <div>ความคิดเห็น: {room.meta.comment || 'ไม่มี'}</div>
              <div>
                เปิดเมื่อ {timeText(room.meta.createdAt)} · {room.meta.listed ? 'แสดงในรายการห้อง' : 'เข้าด้วยรหัสเท่านั้น'} · ผ่าน {onlineVia}
              </div>
              <div className="mt-1 text-xs font-bold text-sky-300">สมาชิก</div>
              {members.map(([u, m]) => {
                const s = seatOf(room, u);
                return (
                  <div key={u} className="flex items-center gap-2">
                    <Avatar name={m.name} avatar={m.avatar} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-bold text-white">
                      {m.name}
                      {u === uid && <span className="ml-1 text-lime-300">(คุณ)</span>}
                    </span>
                    <span className="text-xs text-slate-400">{u === room.host ? 'เจ้าของห้อง · ' : ''}{s ? `โต๊ะ ${s.t}` : 'ผู้ชม'}</span>
                  </div>
                );
              })}
            </div>
          )}
          {menu(copied ? 'คัดลอกรหัสห้องแล้ว ✓' : 'คัดลอกรหัสห้อง (ส่งให้เพื่อน)', () => {
            void navigator.clipboard?.writeText(duel.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          })}
          {menu(host ? 'ยุบห้อง' : 'ออกจากห้อง', () => confirm(host ? 'ยุบห้องนี้? (ทุกคนจะถูกพาออก)' : 'ออกจากห้อง?') && void duelLeave(), true)}
          <RoomChat code={duel.code} uid={uid} />
          <div className="shrink-0">
            <DeckCard
              deck={deck}
              lockedReason={locked}
              onChange={(id) => {
                setDeck(id);
                duelSetDeck(id);
              }}
              onEdit={() => {
                resyncDeck = true;
                openDeckScreen(deck, 'builder');
              }}
              onView={() => openDeckScreen(deck, 'decks')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** แชตในห้องดวล: ทุกคนในห้อง (ผู้เล่น/ผู้ชม) คุยกันได้ · Enter = ส่ง */
function RoomChat({ code, uid }: { code: string; uid: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  useEffect(() => watchDuelChat(code, setMsgs), [code]);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    // เสียงเบา ๆ เมื่อมีข้อความใหม่จากคนอื่น (ไม่นับตอนโหลดครั้งแรก)
    if (seen.current && msgs.length > seen.current && msgs.at(-1)?.uid !== uid) sfx('hover');
    seen.current = msgs.length;
  }, [msgs, uid]);
  const send = () => {
    if (!text.trim()) return;
    duelChatSend(text);
    setText('');
  };
  return (
    <div className="flex min-h-40 flex-1 flex-col overflow-hidden rounded-lg border border-white/15 bg-black/60">
      <div className="border-b border-white/10 px-3 py-1.5 text-xs font-bold tracking-wider text-sky-300">แชตในห้อง</div>
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2 text-sm">
        {msgs.length === 0 && <div className="m-auto text-xs text-slate-500">ยังไม่มีข้อความ · ทักทายเพื่อนในห้องได้เลย</div>}
        {msgs.map((m) => (
          <div key={`${m.at}-${m.uid}`} className={`flex items-start gap-2 ${m.uid === uid ? 'flex-row-reverse text-right' : ''}`}>
            <Avatar name={m.name} avatar={m.avatar} size="sm" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">
                {m.uid === uid ? 'คุณ' : m.name} · {new Date(m.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className={`inline-block max-w-full rounded-lg px-2 py-1 break-words whitespace-pre-wrap ${m.uid === uid ? 'bg-lime-300/20 text-lime-50' : 'bg-slate-700/70 text-slate-100'}`}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 border-t border-white/10 p-2">
        <input
          value={text}
          maxLength={CHAT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="พิมพ์ข้อความ…"
          className="min-w-0 flex-1 rounded bg-slate-900 px-2 py-1.5 text-sm text-white ring-1 ring-slate-600 focus:ring-lime-300 focus:outline-none"
        />
        <button type="button" onClick={send} disabled={!text.trim()} className="rounded bg-lime-300 px-3 text-sm font-black text-slate-900 disabled:opacity-40">
          ส่ง
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- หน้าหลักของ DUEL

export function Lobby() {
  const duel = useGame((s) => s.duel);
  const online = useGame((s) => s.online);
  const setScreen = useGame((s) => s.setScreen);
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => {
    lastView = v;
    setViewState(v);
  };
  const [roomMatch, setRoomMatch] = useState(false);
  const [team, setTeamState] = useState(lastTeam);
  const setTeam = (v: boolean) => {
    lastTeam = v;
    setTeamState(v);
  };
  const [deck, setDeck] = useLobbyDeck();

  // อยู่ในห้องดวลแล้ว (สร้าง / เข้า / กลับมาจากกระดาน): แสดงหน้าห้อง
  const current: View = duel ? { kind: 'room', code: duel.code } : view.kind === 'room' ? { kind: 'list' } : view;
  const back = () => {
    if (online && online.status !== 'waiting') return setScreen('game');
    if (duel) {
      if (confirm(duel.room?.host === duel.uid ? 'ยุบห้องนี้? (ทุกคนจะถูกพาออก)' : 'ออกจากห้อง?')) {
        void duelLeave();
        setView({ kind: 'list' });
      }
      return;
    }
    if (current.kind === 'menu') return setScreen('home');
    setView({ kind: 'menu' });
    setRoomMatch(true);
  };
  const roomTeam = duel?.room ? !!duel.room.meta.team : team;
  const title = {
    menu: ['DUEL MENU', 'เมนูการดวล'],
    create: [team ? 'CREATE TEAM ROOM' : 'CREATE ROOM', team ? 'สร้างห้อง Team Battle' : 'สร้างห้อง'],
    list: [team ? 'TEAM BATTLE' : 'ROOM LIST', team ? 'รายการห้อง Team Battle' : 'รายการห้อง'],
    room: [roomTeam ? 'TEAM BATTLE' : 'ROOM MATCH', roomTeam ? 'ห้อง Team Battle (2VS2)' : 'ห้องดวล'],
  }[current.kind];

  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 left-[46%] h-[150%] w-72 rotate-[28deg] bg-gradient-to-b from-sky-400/0 via-sky-400/10 to-sky-400/0" />
        <div className="absolute -top-1/4 left-[56%] h-[150%] w-10 rotate-[28deg] bg-gradient-to-b from-indigo-400/0 via-indigo-400/15 to-indigo-400/0" />
      </div>
      <TopBar sub={title[1]!} title={title[0]!} onBack={back} />
      {!onlineAvailable ? (
        <div className="flex flex-1 items-center justify-center text-amber-300">ยังไม่ได้ตั้งค่า Firebase (apps/web/.env.local)</div>
      ) : current.kind === 'menu' ? (
        <DuelMenu onRoom={() => (setTeam(false), setRoomMatch(true))} onTeam={() => (setTeam(true), setRoomMatch(true))} />
      ) : current.kind === 'create' ? (
        <CreateRoom key={String(team)} deck={deck} team={team} />
      ) : current.kind === 'list' ? (
        <RoomList key={String(team)} onOpen={(code) => void duelJoin(code, deck)} team={team} />
      ) : (
        <RoomView deck={deck} setDeck={setDeck} />
      )}
      {roomMatch && !duel && (
        <RoomMatch
          team={team}
          onClose={() => setRoomMatch(false)}
          onCreate={() => (setRoomMatch(false), setView({ kind: 'create' }))}
          onEnter={() => (setRoomMatch(false), setView({ kind: 'list' }))}
        />
      )}
    </div>
  );
}
