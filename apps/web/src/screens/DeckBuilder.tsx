import { useEffect, useMemo, useRef, useState } from 'react';
import { BAN_LABEL, BANLIST, copyLimit, DEFAULT_DECK_RULES, rarityOf, validateDeck, type DeckEntry, type DeckError } from '@bs/cards';
import { RARITY_BADGE } from '../format';
import { db, useGame } from '../store';
import { deckInfo, deckSizeOf, deleteMyDeck, loadMyDecks, newDeckId, saveMyDeck, STARTER_DECKS, type SavedDeck } from '../decks';
import { BTN } from '../components/Modal';
import { useAccount } from '../account/account';
import { CardDetail } from '../components/CardDetail';
import { BackButton, CardArt } from './shared';
import { byTypeCost, FilterBar, FilterPanel, useCardFilters } from './DeckFilters';

const MAX = DEFAULT_DECK_RULES.maxCopiesPerName;
const MIN = DEFAULT_DECK_RULES.minCards;
/** ใส่ได้กี่ใบ (Banlist: ห้าม 0 / จำกัด 1 / จำกัด 2 · ไม่อยู่ในลิสต์ = 3) */
const limitOf = (name: string) => copyLimit(name, MAX);
function errorText(e: DeckError): string {
  switch (e.code) {
    case 'TOO_FEW_CARDS':
      return `ต้องมีอย่างน้อย ${e.min} ใบ (ตอนนี้ ${e.total})`;
    case 'TOO_MANY_COPIES':
      return `${e.name} ใส่ได้ไม่เกิน ${e.max} ใบ`;
    case 'RESTRICTED':
      return e.max === 0 ? `${e.name} ถูกห้ามใช้ (Banlist)` : `${e.name} ถูกจำกัดไว้ ${e.max} ใบ (Banlist)`;
    case 'UNKNOWN_CARD':
      return `ไม่รู้จักการ์ด ${e.cardNo}`;
    default:
      return 'จำนวนการ์ดไม่ถูกต้อง';
  }
}

interface Draft {
  id: string | null;
  name: string;
  entries: DeckEntry[];
}

/** ป้าย Banlist บนการ์ด: ห้ามใช้ = แดง · จำกัด 1/2 = ส้ม/เหลือง */
export function BanBadge({ level, className = '' }: { level: 0 | 1 | 2; className?: string }) {
  const tone = level === 0 ? 'bg-rose-600 text-white' : level === 1 ? 'bg-orange-500 text-white' : 'bg-amber-300 text-slate-900';
  return <span className={`rounded px-1 text-[9px] leading-tight font-black shadow ${tone} ${className}`}>{level === 0 ? 'ห้าม' : `จำกัด ${level}`}</span>;
}

/** หน้าจัดเด็ค: รายละเอียดการ์ด (ซ้าย) · การ์ดในเด็ค (กลาง) · คลังการ์ดทุกชุด (ขวา) */
export function DeckBuilder() {
  const setScreen = useGame((s) => s.setScreen);
  const deckView = useGame((s) => s.deckView);
  const [myDecks, setMyDecks] = useState<SavedDeck[]>(loadMyDecks);
  // ซิงก์บัญชีดึงเด็คจากเครื่องอื่นลงมา: โหลดรายการใหม่ (เด็คที่กำลังแก้อยู่ไม่ถูกแตะ)
  const pulledAt = useAccount((s) => s.pulledAt);
  useEffect(() => {
    if (pulledAt) setMyDecks(loadMyDecks());
  }, [pulledAt]);
  const [draft, setDraft] = useState<Draft>(() => {
    // เปิดจากหน้าดูเด็ค: เด็คที่จัดเอง = แก้ไข, Starter Deck = เริ่มจากสำเนา
    const saved = deckView.startsWith('u:') ? loadMyDecks().find((d) => d.id === deckView.slice(2)) : undefined;
    if (saved) return { id: saved.id, name: saved.name, entries: saved.entries };
    const starter = STARTER_DECKS[deckView];
    if (starter) return { id: null, name: `${starter.label} (แก้ไข)`, entries: starter.entries.map((e) => ({ ...e })) };
    return { id: null, name: 'เด็คใหม่', entries: [] };
  });
  const [dirty, setDirty] = useState(false);
  const [focus, setFocus] = useState<string>(() => draft.entries[0]?.cardNo ?? db.all()[0]!.cardNo);
  const [toast, setToast] = useState<string | null>(null);

  // ตัวกรองคลังการ์ด (DeckFilters.tsx)
  const allCards = useMemo(() => db.all().filter((c) => !c.cardNo.startsWith('SMP')), []);
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of draft.entries) m.set(db.get(e.cardNo).name, (m.get(db.get(e.cardNo).name) ?? 0) + e.count);
    return m;
  }, [draft.entries]);
  const fl = useCardFilters(allCards, nameCounts, limitOf);
  const pool = fl.pool;

  // ---------------- ลากการ์ด (เมาส์และนิ้ว: pointer events)
  // คลัง → เด็ค = ใส่, เด็ค → ออกนอกเด็ค = เอาออก · นิ้วต้องลากแนวนอน (แนวตั้ง = เลื่อนรายการ)
  const [drag, setDrag] = useState<{ cardNo: string; from: 'pool' | 'deck'; x: number; y: number; over: boolean } | null>(null);
  const press = useRef<{ cardNo: string; from: 'pool' | 'deck'; x: number; y: number; touch: boolean; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const actions = useRef({ add: (_: string) => {}, remove: (_: string) => {} });
  const startPress = (e: React.PointerEvent, cardNo: string, from: 'pool' | 'deck') => {
    if (e.button !== 0) return;
    press.current = { cardNo, from, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', dragging: false };
  };
  useEffect(() => {
    const overDeck = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest('[data-drop="deck"]');
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.dragging) {
        const start = p.touch ? Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) : Math.hypot(dx, dy) > 6;
        if (!start) {
          if (p.touch && Math.abs(dy) > 10) press.current = null; // ปัดขึ้นลง = เลื่อนรายการ
          return;
        }
        p.dragging = true;
      }
      e.preventDefault();
      setDrag({ cardNo: p.cardNo, from: p.from, x: e.clientX, y: e.clientY, over: overDeck(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p?.dragging) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const inDeck = overDeck(e.clientX, e.clientY);
      if (p.from === 'pool' && inDeck) actions.current.add(p.cardNo);
      if (p.from === 'deck' && !inDeck) actions.current.remove(p.cardNo);
      setDrag(null);
    };
    const cancel = () => {
      press.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);
  /** กดการ์ด (ไม่ได้ลาก) = ดูรายละเอียดด้านซ้าย */
  const pick = (cardNo: string) => {
    if (suppressClick.current) return;
    setFocus(cardNo);
  };

  const countOf = (name: string) => draft.entries.reduce((n, e) => n + (db.get(e.cardNo).name === name ? e.count : 0), 0);
  const total = deckSizeOf(draft.entries);
  const check = validateDeck(draft.entries, db);
  const copies = [...draft.entries]
    .sort((a, b) => byTypeCost(db.get(a.cardNo), db.get(b.cardNo)))
    .flatMap((e) => Array.from({ length: e.count }, (_, k) => ({ cardNo: e.cardNo, foil: e.foils?.[k] ?? null })));

  /** แก้รายการการ์ดจากค่าล่าสุดเสมอ (กดปุ่มรัว ๆ / ลากต่อกันเร็ว ๆ ไม่หาย) */
  const change = (fn: (entries: DeckEntry[]) => DeckEntry[]) => {
    setDraft((d) => ({ ...d, entries: fn(d.entries) }));
    setDirty(true);
  };
  const add = (cardNo: string) =>
    change((entries) => {
      const name = db.get(cardNo).name;
      const n = entries.reduce((k, e) => k + (db.get(e.cardNo).name === name ? e.count : 0), 0);
      if (n >= limitOf(name)) return entries;
      const found = entries.find((e) => e.cardNo === cardNo);
      return found ? entries.map((e) => (e === found ? { ...e, count: e.count + 1 } : e)) : [...entries, { cardNo, count: 1 }];
    });
  const remove = (cardNo: string) =>
    change((entries) =>
      entries
        .map((e) => (e.cardNo === cardNo ? { ...e, count: e.count - 1, ...(e.foils ? { foils: e.foils.slice(0, e.count - 1) } : {}) } : e))
        .filter((e) => e.count > 0),
    );
  // ตัวจัดการการลาก (ลงทะเบียนครั้งเดียว) เรียกเวอร์ชันล่าสุดที่เห็นเด็คปัจจุบัน
  actions.current = { add, remove };

  /** ยังไม่บันทึก: ถามก่อนทิ้งการแก้ไข */
  const leave = (then: () => void) => {
    if (dirty && !confirm('ยังไม่ได้บันทึกเด็คนี้ ทิ้งการแก้ไขหรือไม่?')) return;
    then();
  };
  const open = (d: Draft) =>
    leave(() => {
      setDraft(d);
      setDirty(false);
      if (d.entries[0]) setFocus(d.entries[0].cardNo);
    });
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };
  const save = () => {
    const id = draft.id ?? newDeckId();
    const name = draft.name.trim() || 'เด็คใหม่';
    saveMyDeck({ id, name, entries: draft.entries, updated: Date.now() });
    setDraft({ ...draft, id, name });
    setMyDecks(loadMyDecks());
    setDirty(false);
    flash(check.valid ? 'บันทึกแล้ว' : 'บันทึกแล้ว (เด็คยังไม่ครบกติกา เลือกเล่นไม่ได้จนกว่าจะครบ)');
  };
  const remove_ = () => {
    if (!draft.id || !confirm(`ลบเด็ค "${draft.name}"?`)) return;
    deleteMyDeck(draft.id);
    setMyDecks(loadMyDecks());
    setDraft({ id: null, name: 'เด็คใหม่', entries: [] });
    setDirty(false);
  };


  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      {/* ---------------- แถบบน: ชื่อเด็ค / บันทึก (เลือก/สร้าง/คัดลอกเด็คทำที่หน้าเด็คของฉัน) */}
      <header className="flex items-center gap-4 pt-5 pr-6">
        <BackButton onClick={() => leave(() => (useGame.getState().setScreen(useGame.getState().deckReturn), useGame.setState({ deckReturn: 'home' })))} label={{ lobby: 'กลับห้องดวล', mydeck: 'เด็คของฉัน', solo: 'กลับไปที่ด่าน' }[useGame.getState().deckReturn as string] ?? 'หน้าหลัก'} />
        <div className="shrink-0">
          <div className="text-xs tracking-[0.4em] text-sky-300">DECK BUILDER</div>
          <div className="text-2xl font-black text-white italic">จัดเด็ค</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <input
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              setDirty(true);
            }}
            maxLength={30}
            className="w-56 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white ring-1 ring-sky-400/40 focus:ring-sky-300 focus:outline-none"
            placeholder="ชื่อเด็ค"
          />
          <span
            className={`rounded-full px-3 py-1 text-sm font-black ${check.valid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}
            title={check.errors.map(errorText).join('\n') || 'เด็คถูกกติกา'}
          >
            {total} / {MIN}+ ใบ {check.valid ? '✓' : ''}
          </span>
          {draft.id && (
            <button type="button" className={BTN.ghost} onClick={remove_}>
              ลบเด็ค
            </button>
          )}
          <button type="button" className={`${BTN.primary} px-6`} onClick={save} disabled={!dirty && !!draft.id}>
            บันทึก
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 p-5">
        {/* ---------------- ซ้าย: รายละเอียดการ์ดที่กด + ปุ่มเพิ่ม/ลด */}
        <div className="flex w-[300px] shrink-0 flex-col gap-2">
          {(() => {
            const n = countOf(db.get(focus).name);
            const lim = limitOf(db.get(focus).name);
            return (
              <div className="hud-panel flex items-center justify-between gap-2 rounded-xl px-3 py-2">
                <button
                  type="button"
                  onClick={() => remove(focus)}
                  disabled={!draft.entries.some((e) => e.cardNo === focus)}
                  className="h-11 w-14 rounded-lg bg-rose-600 text-2xl font-black text-white shadow transition hover:bg-rose-500 active:scale-95 disabled:opacity-30"
                  title="เอาออกจากเด็ค 1 ใบ"
                >
                  −
                </button>
                <div className="text-center leading-tight">
                  <div className="text-xs text-slate-400">ในเด็ค</div>
                  <div className={`text-xl font-black ${n >= lim ? 'text-yellow-300' : 'text-white'}`}>
                    {n} / {lim}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => add(focus)}
                  disabled={n >= lim}
                  className="h-11 w-14 rounded-lg bg-emerald-600 text-2xl font-black text-white shadow transition hover:bg-emerald-500 active:scale-95 disabled:opacity-30"
                  title="ใส่ในเด็ค 1 ใบ"
                >
                  +
                </button>
              </div>
            );
          })()}
          <CardDetail cardNo={focus} className="min-h-0 w-full flex-1" />
        </div>

        {/* ---------------- กลาง: การ์ดในเด็ค (ปล่อยการ์ดจากคลังที่นี่ = ใส่) */}
        <main
          data-drop="deck"
          className={`flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-black/30 p-3 transition ${
            drag?.from === 'pool' ? (drag.over ? 'border-emerald-300 bg-emerald-500/10' : 'border-dashed border-emerald-300/70') : 'border-white/10'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              การ์ดในเด็ค {total} ใบ · {draft.entries.length} ชนิด
            </span>
            {!check.valid && <span className="text-rose-300">{check.errors.map(errorText).join(' · ')}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {copies.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
                <span className="text-4xl">🂠</span>
                <span>ลากการ์ดจากคลังด้านขวามาวางที่นี่ หรือกดการ์ดแล้วกด +</span>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
                {copies.map(({ cardNo, foil }, i) => (
                  <button
                    key={`${cardNo}-${i}`}
                    type="button"
                    onPointerDown={(e) => startPress(e, cardNo, 'deck')}
                    onClick={() => pick(cardNo)}
                    className={`relative touch-pan-y rounded-md transition hover:-translate-y-0.5 ${focus === cardNo ? 'ring-2 ring-yellow-300' : ''} ${
                      drag?.from === 'deck' && drag.cardNo === cardNo ? 'opacity-40' : ''
                    }`}
                    title={db.get(cardNo).name}
                  >
                    <CardArt cardNo={cardNo} foil={foil} className="pointer-events-none aspect-[0.686] w-full" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* ---------------- ขวา: คลังการ์ด */}
        <aside
          data-drop="pool"
          className={`hud-panel flex w-[460px] shrink-0 flex-col gap-2 rounded-xl p-3 transition ${drag?.from === 'deck' && !drag.over ? 'ring-2 ring-rose-400' : ''}`}
        >
          <FilterBar fl={fl} />
          {fl.open && <FilterPanel fl={fl} />}
          {!fl.open && <div className="text-xs text-slate-400">{pool.length} ใบ · ลากการ์ดเข้าเด็ค หรือกดการ์ดแล้วกด + (ชื่อเดียวกันไม่เกิน {MAX} ใบ · ป้ายแดง/ส้ม = Banlist)</div>}
          <div className={`min-h-0 flex-1 overflow-y-auto pr-1 ${fl.open ? 'hidden' : ''}`}>
            {pool.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400">
                ไม่พบการ์ดที่ตรงกับตัวกรอง
                <button type="button" onClick={fl.clear} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-rose-600 hover:text-white">
                  ล้างตัวกรองทั้งหมด
                </button>
              </div>
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {pool.map((c) => {
                const n = countOf(c.name);
                const lim = limitOf(c.name);
                const full = n >= lim;
                const ban = BANLIST.cards[c.name];
                const r = rarityOf(c.rarity);
                return (
                  <button
                    key={c.cardNo}
                    type="button"
                    onPointerDown={(e) => !full && startPress(e, c.cardNo, 'pool')}
                    onClick={() => pick(c.cardNo)}
                    className={`relative touch-pan-y rounded-md transition ${full ? 'opacity-40' : 'hover:-translate-y-0.5'} ${focus === c.cardNo ? 'ring-2 ring-yellow-300' : ''}`}
                    title={ban !== undefined ? `${c.name} · Banlist: ${BAN_LABEL[ban]}` : full ? `${c.name} ครบ ${lim} ใบแล้ว` : c.name}
                  >
                    <CardArt cardNo={c.cardNo} className="pointer-events-none aspect-[0.686] w-full" />
                    {r && <span className={`absolute top-0.5 left-0.5 rounded px-1 text-[9px] leading-tight font-black ${RARITY_BADGE[r.rank]}`}>{r.code}</span>}
                    {ban !== undefined && <BanBadge level={ban} className="absolute top-0.5 right-0.5" />}
                    {n > 0 && (
                      <span className="absolute -right-1 -bottom-1 rounded-full bg-slate-950 px-1.5 text-xs font-black text-yellow-300 ring-1 ring-yellow-300/60">
                        {n}/{lim}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* การ์ดที่กำลังลาก */}
      {drag && (
        <div className="pointer-events-none fixed z-[60] w-24 -translate-x-1/2 -translate-y-1/2 rotate-6 drop-shadow-[0_12px_20px_rgba(0,0,0,0.7)]" style={{ left: drag.x, top: drag.y }}>
          <CardArt cardNo={drag.cardNo} className="aspect-[0.686] w-full" />
          <span
            className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-black whitespace-nowrap text-white ${
              drag.from === 'pool' ? (drag.over ? 'bg-emerald-600' : 'bg-slate-700') : drag.over ? 'bg-slate-700' : 'bg-rose-600'
            }`}
          >
            {drag.from === 'pool' ? (drag.over ? '+ ใส่ในเด็ค' : 'ลากเข้าเด็ค') : drag.over ? 'ลากออกนอกเด็ค' : '− เอาออก'}
          </span>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-lg" style={{ animation: 'fx-slide-up 0.25s ease-out both' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
