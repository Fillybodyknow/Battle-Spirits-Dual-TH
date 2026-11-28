/**
 * เด็คของฉัน (รวมดูเด็ค + จัดเด็ค): ตารางกล่องเด็ค → เมนูเด็ค
 *  - แก้ไขเด็ค (หน้าจัดเด็ค) · เปลี่ยนของตกแต่ง (สีกล่อง / การ์ดเด่น 3 ใบ) · ดู / คัดลอก / ลบเด็ค
 *  - "+" สร้างเด็คใหม่: เด็คเปล่า / คัดลอกจาก Starter Deck / นำเข้าจากรหัสเด็ค
 */
import { useMemo, useState } from 'react';
import { BAN_LABEL, BANLIST, validateDeck, type BanLevel } from '@bs/cards';
import { BanBadge } from './DeckBuilder';
import { CardDetail } from '../components/CardDetail';
import { CASE_COLORS, DeckBox, autoKeyCards, keyCards } from '../components/DeckBox';
import { decodeDeck, deckInfo, deckSizeOf, deleteMyDeck, encodeDeck, loadDeckAcc, loadMyDecks, newDeckId, saveDeckAcc, saveMyDeck, STARTER_DECKS, type DeckId } from '../decks';
import { sfx } from '../sfx';
import { db, playableDecks, useGame } from '../store';
import { useAccount } from '../account/account';
import { BackButton, CardArt, deckColor } from './shared';

type View = { kind: 'grid' } | { kind: 'detail'; deck: DeckId } | { kind: 'acc'; deck: DeckId } | { kind: 'banlist' };

/** หน้าที่เปิดอยู่ (กลับจากหน้าจัดเด็คแล้วอยู่ที่เดิม) */
let lastView: View = { kind: 'grid' };

const valid = (id: DeckId) => validateDeck(deckInfo(id).entries, db).valid;

/** ไปหน้าจัดเด็ค แล้วกลับมาที่หน้านี้ (deckView: '' = เด็คใหม่ / sdXX = สำเนา Starter / u:<id> = แก้ไข) */
function openBuilder(deckView: DeckId) {
  useGame.setState({ deckView, deckReturn: 'mydeck' });
  useGame.getState().setScreen('builder');
}

/** ปุ่มยาวในหน้าต่างเมนู */
function MenuButton({ label, sub, onClick, danger }: { label: string; sub?: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={() => (sfx('click'), onClick?.())}
      onMouseEnter={() => onClick && sfx('hover')}
      className={`flex w-full flex-col items-center rounded-full border-2 border-white/40 bg-black py-2.5 transition enabled:hover:border-lime-300 enabled:hover:shadow-[0_0_20px_rgba(190,242,100,0.5)] disabled:opacity-40 ${danger ? 'text-rose-400' : 'text-white'}`}
    >
      <span className="text-lg font-black">{label}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </button>
  );
}

/** หน้าต่างกลางจอ (หัวข้อ + เนื้อหา + ปุ่มยกเลิก) */
function Sheet({ title, onClose, children, closeLabel = 'ยกเลิก' }: { title: string; onClose: () => void; children: React.ReactNode; closeLabel?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/70" onClick={onClose}>
      <div className="flex h-full w-[52rem] max-w-full flex-col justify-center bg-gradient-to-b from-slate-800/95 via-slate-900/95 to-slate-950/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b-2 border-sky-400 pb-3 text-center text-2xl font-black text-white">{title}</div>
        {children}
        <div className="flex justify-center pt-4">
          <button type="button" onClick={onClose} className="w-96 rounded-lg border border-white/40 bg-black py-2.5 text-lg font-black text-lime-300 hover:border-lime-300">
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ไทล์เด็คในตาราง: กล่องเด็ค (ชี้ = การ์ดเด่นโผล่) + ชื่อ */
function DeckTileBox({ id, onClick }: { id: DeckId; onClick: () => void }) {
  const info = deckInfo(id);
  const ok = valid(id);
  return (
    <button
      type="button"
      onClick={() => (sfx('click'), onClick())}
      onMouseEnter={() => sfx('hover')}
      className="group relative flex h-56 flex-col items-center justify-end overflow-hidden rounded-xl border-2 border-white/10 bg-slate-950/85 px-3 pb-3 transition hover:border-lime-300 hover:shadow-[0_0_22px_rgba(190,242,100,0.4)]"
      style={{ backgroundImage: `radial-gradient(circle at 50% 45%, ${deckColor(id)}2e, transparent 65%)` }}
    >
      <span className={`absolute top-2 right-2 rounded px-1.5 text-[10px] font-black ${!info.custom ? 'bg-sky-400/20 text-sky-200' : ok ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-500/25 text-rose-200'}`}>
        {!info.custom ? 'STARTER' : ok ? 'ใช้ได้' : 'ยังไม่ครบกติกา'}
      </span>
      <DeckBox deck={id} />
      <div className="mt-1 w-full truncate text-center text-base font-black text-white">{info.label}</div>
      <div className="text-xs text-slate-400">{deckSizeOf(info.entries)} ใบ</div>
    </button>
  );
}

// ---------------------------------------------------------------- ตาราง + เมนู

function Grid({ starters, onOpen, onCreate, selected }: { starters: boolean; onOpen: (id: DeckId) => void; onCreate: () => void; selected?: DeckId | null }) {
  // วาดใหม่เมื่อซิงก์บัญชีดึงเด็คจากเครื่องอื่นลงมา
  useAccount((s) => s.pulledAt);
  const mine = loadMyDecks().map((d) => `u:${d.id}`);
  const ids = starters ? Object.keys(STARTER_DECKS) : mine;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-5 overflow-y-auto px-16 py-6 pb-28">
      {!starters && (
        <button
          type="button"
          onClick={() => (sfx('click'), onCreate())}
          className="group flex h-56 items-center justify-center rounded-xl border-2 border-white/10 bg-slate-950/70 transition hover:border-lime-300 hover:shadow-[0_0_22px_rgba(190,242,100,0.4)]"
          title="สร้างเด็คใหม่"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-lime-300/70 text-6xl font-light text-lime-300 transition group-hover:scale-110">+</span>
        </button>
      )}
      {ids.map((id) => (
        <div key={id} className={`grid ${id === selected ? 'rounded-xl ring-4 ring-lime-300 shadow-[0_0_24px_rgba(190,242,100,0.5)]' : ''}`}>
          <DeckTileBox id={id} onClick={() => onOpen(id)} />
        </div>
      ))}
      {!starters && mine.length === 0 && <div className="col-span-full text-center text-sm text-slate-400">ยังไม่มีเด็คที่จัดเอง · กด + เพื่อสร้าง หรือดู "รายการ Starter Deck" แล้วคัดลอกมาจัดต่อ</div>}
    </div>
  );
}

function DeckMenu({ id, onClose, onDetail, onAcc }: { id: DeckId; onClose: () => void; onDetail: () => void; onAcc: () => void }) {
  const info = deckInfo(id);
  return (
    <Sheet title="เมนูเด็ค" onClose={onClose}>
      <div className="bg-black/50 px-8 py-4">
        <div className="text-center text-lg font-black text-white">
          {!info.custom && <span className="mr-2 rounded bg-sky-400/20 px-1.5 text-xs text-sky-200">STARTER</span>}
          {info.label}
        </div>
        <div className="mt-2 flex items-end justify-center gap-3">
          <DeckBox deck={id} open size={1.1} />
          <div className="flex gap-2 pb-2">
            {autoKeyCards(id, 9)
              .filter((c) => !keyCards(id, 3).includes(c))
              .slice(0, 5)
              .map((no) => (
                <div key={no} className="w-16 rounded-md bg-slate-800/80 p-1 ring-1 ring-white/10">
                  <CardArt cardNo={no} className="w-full rounded" />
                </div>
              ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 bg-gradient-to-b from-sky-900/30 to-transparent px-16 py-6">
        {info.custom ? (
          <MenuButton label="แก้ไขเด็ค" sub="เปิดหน้าจัดเด็ค" onClick={() => openBuilder(id)} />
        ) : (
          <MenuButton label="จัดเด็คใหม่จากเด็คนี้" sub="คัดลอก Starter Deck ไปจัดเอง" onClick={() => openBuilder(id)} />
        )}
        <MenuButton label="เปลี่ยนของตกแต่ง" sub="สีกล่องเด็ค · การ์ดเด่น 3 ใบ" onClick={onAcc} />
        <MenuButton label={info.custom ? 'ดู / คัดลอก / ลบเด็ค' : 'ดู / คัดลอกเด็ค'} sub="การ์ดทั้งหมด · สุ่มจั่ว 5 ใบ · รหัสเด็ค" onClick={onDetail} />
      </div>
    </Sheet>
  );
}

function CreateMenu({ onClose, onCreated }: { onClose: () => void; onCreated: (id: DeckId) => void }) {
  const [mode, setMode] = useState<'menu' | 'starter' | 'import'>('menu');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const importDeck = () => {
    const d = decodeDeck(code.trim());
    if (!d || d.entries.length === 0) return setErr('รหัสเด็คไม่ถูกต้อง (ต้องขึ้นต้นด้วย c: แบบที่ได้จาก "คัดลอกรหัสเด็ค")');
    const unknown = d.entries.filter((e) => !db.find(e.cardNo));
    if (unknown.length) return setErr(`มีการ์ดที่เกมเวอร์ชันนี้ไม่รู้จัก: ${unknown.map((e) => e.cardNo).join(', ')}`);
    const id = newDeckId();
    saveMyDeck({ id, name: d.label || 'เด็คที่นำเข้า', entries: d.entries, updated: Date.now() });
    sfx('click');
    onCreated(`u:${id}`);
  };
  return (
    <Sheet title="สร้างเด็คใหม่" onClose={mode === 'menu' ? onClose : () => setMode('menu')} closeLabel={mode === 'menu' ? 'ยกเลิก' : 'ย้อนกลับ'}>
      {mode === 'menu' && (
        <div className="flex flex-col gap-3 bg-gradient-to-b from-sky-900/30 to-transparent px-16 py-6">
          <MenuButton label="สร้างใหม่" sub="เริ่มจากเด็คเปล่า" onClick={() => openBuilder('')} />
          <MenuButton label="คัดลอกจาก Starter Deck" sub="เริ่มจากเด็คสำเร็จรูป แล้วแก้ต่อ" onClick={() => setMode('starter')} />
          <MenuButton label="นำเข้าจากรหัสเด็ค" sub="วางรหัสที่เพื่อนส่งมา" onClick={() => setMode('import')} />
        </div>
      )}
      {mode === 'starter' && (
        <div className="flex flex-wrap justify-center gap-4 px-10 py-6">
          {Object.keys(STARTER_DECKS).map((id) => (
            <div key={id} className="w-48">
              <DeckTileBox id={id} onClick={() => openBuilder(id)} />
            </div>
          ))}
        </div>
      )}
      {mode === 'import' && (
        <div className="flex flex-col gap-3 px-16 py-6">
          <textarea
            value={code}
            onChange={(e) => (setCode(e.target.value), setErr(''))}
            rows={5}
            placeholder="วางรหัสเด็คที่นี่ (c:...)"
            className="w-full rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200 ring-1 ring-slate-600 outline-none focus:ring-lime-300"
          />
          {err && <div className="text-sm text-rose-300">{err}</div>}
          <MenuButton label="นำเข้า" onClick={code.trim() ? importDeck : undefined} />
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- ดู / คัดลอก / ลบ

function DeckDetail({ id, onDone, onCopied }: { id: DeckId; onDone: () => void; onCopied: (id: DeckId) => void }) {
  const info = deckInfo(id);
  const [focus, setFocus] = useState(info.entries[0]?.cardNo ?? '');
  const [draw, setDraw] = useState<string[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const check = validateDeck(info.entries, db);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 1800);
  };
  const sample = () => {
    const pile = info.entries.flatMap((e) => Array.from({ length: e.count }, () => e.cardNo));
    for (let i = pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pile[i], pile[j]] = [pile[j]!, pile[i]!];
    }
    setDraw(pile.slice(0, 5));
  };
  const btn = (label: string, onClick: () => void, cls = 'border-white/40 text-white') => (
    <button type="button" onClick={() => (sfx('click'), onClick())} className={`w-full rounded-full border-2 bg-black py-3 text-lg font-black transition hover:border-lime-300 ${cls}`}>
      {label}
    </button>
  );
  return (
    <div className="relative z-10 flex min-h-0 flex-1 gap-6 px-10 py-5">
      <div className="flex w-[320px] shrink-0 flex-col overflow-y-auto">{focus && <CardDetail cardNo={focus} className="w-full" />}</div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
        <div className="flex items-center gap-3 border-b border-white/10 bg-black/50 px-4 py-2">
          <span className="text-lg font-black text-white">{info.label}</span>
          <span className="text-sm text-slate-400">
            {deckSizeOf(info.entries)} ใบ · {info.entries.length} ชนิด
          </span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-black ${check.valid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
            {check.valid ? 'ใช้เล่นได้' : 'ยังไม่ครบกติกา'}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 overflow-y-auto p-3">
          {info.entries.map((e) => (
            <button key={e.cardNo} type="button" onClick={() => setFocus(e.cardNo)} className={`relative rounded-md transition hover:-translate-y-0.5 ${focus === e.cardNo ? 'ring-2 ring-lime-300' : ''}`}>
              <CardArt cardNo={e.cardNo} className="w-full rounded-md" />
              <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1.5 text-xs font-black text-white">×{e.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex w-[19rem] shrink-0 flex-col justify-end gap-3">
        {toast && <div className="rounded-lg bg-emerald-500/20 py-2 text-center text-sm font-bold text-emerald-200">{toast}</div>}
        {btn('สุ่มจั่ว 5 ใบ', sample, 'border-lime-300 text-lime-300')}
        {btn('คัดลอกรหัสเด็ค', () => {
          void navigator.clipboard?.writeText(encodeDeck(info.label, info.entries)).then(() => flash('คัดลอกรหัสเด็คแล้ว ส่งให้เพื่อนนำเข้าได้'));
        })}
        {btn('คัดลอกเด็ค', () => {
          const nid = newDeckId();
          saveMyDeck({ id: nid, name: `${info.label} (สำเนา)`, entries: info.entries.map((e) => ({ ...e })), updated: Date.now() });
          const acc = loadDeckAcc(id);
          if (acc.case || acc.main) saveDeckAcc(`u:${nid}`, acc);
          onCopied(`u:${nid}`);
        })}
        {info.custom &&
          btn(
            'ลบเด็ค',
            () => {
              if (!confirm(`ลบเด็ค "${info.label}"?`)) return;
              deleteMyDeck(id.slice(2));
              onDone();
            },
            'border-rose-500/60 text-rose-400',
          )}
      </div>
      {draw && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-black/75" onClick={() => setDraw(null)}>
          <div className="text-2xl font-black text-white">มือเริ่มเกม (สุ่ม 5 ใบ)</div>
          <div className="flex gap-3">
            {draw.map((c, i) => (
              <div key={i} className="w-40" style={{ animation: `fx-chain-pop 0.35s ${i * 80}ms ease-out both` }}>
                <CardArt cardNo={c} className="w-full rounded-lg shadow-2xl" />
              </div>
            ))}
          </div>
          <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={sample} className="rounded-full border-2 border-lime-300 bg-black px-8 py-2 font-black text-lime-300">
              สุ่มใหม่
            </button>
            <button type="button" onClick={() => setDraw(null)} className="rounded-full border-2 border-white/40 bg-black px-8 py-2 font-black text-white">
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ของตกแต่ง

function Accessories({ id }: { id: DeckId }) {
  const [tab, setTab] = useState<'case' | 'main'>('case');
  const [acc, setAcc] = useState(() => loadDeckAcc(id));
  const [slot, setSlot] = useState(0);
  const update = (next: typeof acc) => {
    setAcc(next);
    saveDeckAcc(id, next);
    sfx('click');
  };
  const cards = useMemo(() => [...new Set(deckInfo(id).entries.map((e) => e.cardNo))], [id]);
  const main = keyCards(id, 3);
  const tabBtn = (t: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => (sfx('click'), setTab(t))}
      className={`w-64 border-l-4 px-5 py-3 text-left text-lg font-black transition ${t === tab ? 'border-lime-300 bg-lime-300 text-slate-950' : 'border-lime-300/70 bg-sky-950/80 text-white hover:bg-sky-900'}`}
    >
      {label}
    </button>
  );
  const choice = (key: string, selected: boolean, onClick: () => void, children: React.ReactNode, title: string) => (
    <button
      key={key}
      type="button"
      title={title}
      onClick={onClick}
      className={`relative flex h-32 w-28 items-center justify-center rounded-lg border-2 bg-black/70 transition hover:border-lime-300 ${selected ? 'border-lime-300' : 'border-white/15'}`}
    >
      {children}
      {selected && <span className="absolute -top-2 -left-2 flex h-7 w-7 items-center justify-center rounded-full bg-lime-300 text-sm font-black text-slate-950">✓</span>}
    </button>
  );
  return (
    <div className="relative z-10 flex min-h-0 flex-1 gap-10 px-16 py-6">
      <div className="flex shrink-0 flex-col gap-3">
        {tabBtn('case', 'กล่องเด็ค')}
        {tabBtn('main', 'การ์ดเด่น 3 ใบ')}
        <p className="w-64 text-xs text-slate-400">ของตกแต่งเก็บในเครื่องนี้ · เห็นในหน้าเด็คของฉันและห้องดวล</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {tab === 'case' ? (
          <>
            <div className="text-lg font-black text-white">สีกล่องเด็ค</div>
            <div className="flex flex-wrap gap-3">
              {choice('auto', !acc.case, () => update({ ...acc, case: undefined }), <DeckBox deck={id} size={0.8} caseOverride="" mainOverride={[]} />, 'สีหลักของเด็ค')}
              {CASE_COLORS.map((c) => choice(c.id, acc.case === c.id, () => update({ ...acc, case: c.id }), <DeckBox deck={id} size={0.8} caseOverride={c.id} mainOverride={[]} />, c.label))}
              {choice('art', acc.case === 'art', () => update({ ...acc, case: 'art' }), <DeckBox deck={id} size={0.8} caseOverride="art" mainOverride={main.slice(0, 1)} />, 'ภาพการ์ดเด่นใบแรก')}
            </div>
            <p className="text-xs text-slate-400">ช่องแรก = สีหลักของเด็ค · ช่องสุดท้าย = ใช้ภาพการ์ดเด่นใบแรกเป็นหน้ากล่อง</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-lg font-black text-white">การ์ดเด่น</span>
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSlot(i)}
                  className={`rounded-full px-3 py-1 text-sm font-black ${slot === i ? 'bg-lime-300 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                >
                  ใบที่ {i + 1}
                </button>
              ))}
              <button type="button" onClick={() => update({ ...acc, main: undefined })} className="ml-auto rounded-full border border-white/30 px-3 py-1 text-sm font-bold text-slate-200 hover:border-lime-300">
                เลือกให้อัตโนมัติ
              </button>
            </div>
            <p className="text-xs text-slate-400">เลือกช่อง แล้วกดการ์ดในเด็คที่จะใส่</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {cards.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const next = [...main];
                    const at = next.indexOf(c);
                    if (at >= 0) next[at] = next[slot]!;
                    next[slot] = c;
                    update({ ...acc, main: next });
                    setSlot((slot + 1) % 3);
                  }}
                  className={`relative rounded-md transition hover:-translate-y-0.5 ${main.includes(c) ? 'ring-2 ring-lime-300' : ''}`}
                >
                  <CardArt cardNo={c} className="w-full rounded-md" />
                  {main.includes(c) && <span className="absolute top-1 left-1 rounded-full bg-lime-300 px-1.5 text-xs font-black text-slate-950">{main.indexOf(c) + 1}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex w-80 shrink-0 flex-col items-center gap-3">
        <div className="self-start text-sm text-slate-300">
          ตอนนี้ใช้
          <div className="font-bold text-white">
            {tab === 'case'
              ? acc.case === 'art'
                ? 'ภาพการ์ดเด่นใบแรก'
                : (CASE_COLORS.find((c) => c.id === acc.case)?.label ?? 'สีหลักของเด็ค')
              : main.map((c, i) => `${i + 1}: ${db.get(c).name}`).join(' · ')}
          </div>
        </div>
        <div className="mt-6">
          <DeckBox deck={id} open size={1.9} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Banlist

/** รายการการ์ดใน Banlist แยกตามระดับ (ห้ามใช้ / จำกัด 1 / จำกัด 2) · คลิกการ์ด = รายละเอียด */
function BanlistView() {
  const [focus, setFocus] = useState<string | null>(null);
  const groups = ([0, 1, 2] as BanLevel[]).map((lv) => ({
    lv,
    cards: Object.entries(BANLIST.cards)
      .filter(([, v]) => v === lv)
      .map(([name]) => db.all().find((c) => c.name === name))
      .filter((c): c is NonNullable<typeof c> => !!c),
  }));
  const empty = groups.every((g) => g.cards.length === 0);
  return (
    <div className="relative z-10 flex min-h-0 flex-1 gap-4 px-6 py-4">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {empty ? (
          <div className="mt-24 text-center text-lg text-slate-400">ยังไม่มีการ์ดใน Banlist · ทุกการ์ดใส่ในเด็คได้ชื่อละ 3 ใบ</div>
        ) : (
          groups
            .filter((g) => g.cards.length > 0)
            .map((g) => (
              <section key={g.lv} className="mb-5">
                <h2 className="mb-2 flex items-center gap-2 text-lg font-black text-white">
                  <BanBadge level={g.lv} className="!text-sm" />
                  {BAN_LABEL[g.lv]}
                  <span className="text-sm font-normal text-slate-400">{g.lv === 0 ? 'ใส่ในเด็คไม่ได้' : `ใส่ในเด็คได้ไม่เกิน ${g.lv} ใบ`} · {g.cards.length} ใบ</span>
                </h2>
                <div className="grid grid-cols-8 gap-2">
                  {g.cards.map((c) => (
                    <button key={c.cardNo} type="button" onClick={() => setFocus(c.cardNo)} className={`relative rounded-md transition hover:-translate-y-0.5 ${focus === c.cardNo ? 'ring-2 ring-yellow-300' : ''}`} title={c.name}>
                      <CardArt cardNo={c.cardNo} className="pointer-events-none aspect-[0.686] w-full" />
                      <BanBadge level={g.lv} className="absolute top-0.5 right-0.5" />
                      <div className="mt-0.5 truncate text-[11px] text-slate-300">{c.name}</div>
                    </button>
                  ))}
                </div>
              </section>
            ))
        )}
      </div>
      {focus && (
        <CardDetail cardNo={focus} className="w-80" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- หน้าหลัก

export function MyDeck() {
  const setScreen = useGame((s) => s.setScreen);
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => {
    lastView = v;
    setViewState(v);
  };
  const [menu, setMenu] = useState<DeckId | null>(null);
  const [create, setCreate] = useState(false);
  const [starters, setStarters] = useState(false);
  const count = loadMyDecks().length;
  // โหมดเลือกเด็คให้ห้องดวล (กด "เปลี่ยนเด็ค" ในห้อง): คลิกเด็ค = ใช้เด็คนั้นแล้วกลับห้อง
  const pick = useGame((s) => s.deckPick);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const pickFor = useGame((s) => s.deckReturn);
  const leavePick = () => {
    const back = useGame.getState().deckReturn;
    useGame.setState({ deckPick: null, deckReturn: 'home' });
    setScreen(back === 'solo' ? 'solo' : 'lobby');
  };
  const choosePick = (id: DeckId) => {
    if (!playableDecks().includes(id)) {
      setPickErr(`${deckInfo(id).label}: เด็คยังไม่ครบตามกติกา (อย่างน้อย 40 ใบ ชื่อเดียวกันไม่เกิน 3 ใบ ตาม Banlist) ใช้ดวลไม่ได้`);
      return;
    }
    sfx('click');
    try {
      localStorage.setItem(useGame.getState().deckReturn === 'solo' ? 'bs-solo-deck' : 'bs-lobby-deck', id);
    } catch {
      /* เก็บไม่ได้ก็ไม่เป็นไร */
    }
    leavePick();
  };
  const back = () => {
    if (view.kind !== 'grid') return setView({ kind: 'grid' });
    if (starters) return setStarters(false);
    lastView = { kind: 'grid' };
    if (pick) return leavePick();
    setScreen('home');
  };
  const title = pick && view.kind === 'grid'
    ? ['SELECT DECK', pickFor === 'solo' ? 'เลือกเด็คที่จะใช้ในด่าน' : 'เลือกเด็คที่จะใช้ในห้องดวล']
    : view.kind === 'banlist' ? ['BANLIST', `ประกาศจำกัดการ์ด · อัปเดต ${BANLIST.updated}`] : view.kind === 'acc' ? ['CHANGE ACCESSORIES', 'เปลี่ยนของตกแต่ง'] : view.kind === 'detail' ? ['DECK', 'ดูเด็ค'] : starters ? ['STARTER DECK', 'รายการ Starter Deck'] : ['MY DECK', 'เด็คของฉัน'];

  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 left-[46%] h-[150%] w-72 rotate-[28deg] bg-gradient-to-b from-sky-400/0 via-sky-400/10 to-sky-400/0" />
      </div>
      <header className="relative z-10 flex items-center gap-5 border-b border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent py-4 pr-6">
        <BackButton onClick={back} label="ย้อนกลับ" />
        <div>
          <div className="text-[11px] tracking-[0.4em] text-sky-300">{title[1]}</div>
          <div className="text-2xl font-black text-white">{title[0]}</div>
        </div>
        {pick && view.kind === 'grid' ? (
          <div className="ml-auto rounded-full bg-lime-300/15 px-4 py-1.5 text-sm font-bold text-lime-200 ring-1 ring-lime-300/50">
            ใช้อยู่: {deckInfo(pick).label} · คลิกเด็คเพื่อเลือก
          </div>
        ) : (
          view.kind === 'grid' && !starters && <div className="ml-auto rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold text-slate-200 ring-1 ring-white/15">เด็คของฉัน {count} เด็ค</div>
        )}
      </header>

      {view.kind === 'grid' ? (
        <>
          <Grid starters={starters} onOpen={pick ? choosePick : setMenu} onCreate={() => setCreate(true)} selected={pick} />
          {pick && pickErr && (
            <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-rose-600/90 px-4 py-2 text-sm font-bold text-white shadow-lg" onClick={() => setPickErr(null)}>
              {pickErr}
            </div>
          )}
          <div className="absolute right-12 bottom-6 z-10 flex gap-3">
            <button
              type="button"
              onClick={() => (sfx('click'), setView({ kind: 'banlist' }))}
              className="w-44 rounded-lg border-2 border-white/40 bg-black py-3 text-lg font-black text-rose-300 transition hover:border-rose-300 hover:shadow-[0_0_24px_rgba(253,164,175,0.5)]"
            >
              Banlist
            </button>
            <button
              type="button"
              onClick={() => (sfx('click'), setStarters((v) => !v))}
              className="w-80 rounded-lg border-2 border-white/40 bg-black py-3 text-lg font-black text-lime-300 transition hover:border-lime-300 hover:shadow-[0_0_24px_rgba(190,242,100,0.5)]"
            >
              {starters ? 'เด็คของฉัน' : 'รายการ Starter Deck'}
            </button>
          </div>
        </>
      ) : view.kind === 'detail' ? (
        <DeckDetail
          id={view.deck}
          onDone={() => setView({ kind: 'grid' })}
          onCopied={(nid) => {
            setStarters(false);
            setView({ kind: 'grid' });
            setMenu(nid);
          }}
        />
      ) : view.kind === 'banlist' ? (
        <BanlistView />
      ) : (
        <Accessories id={view.deck} />
      )}

      {menu && (
        <DeckMenu
          id={menu}
          onClose={() => setMenu(null)}
          onDetail={() => (setView({ kind: 'detail', deck: menu }), setMenu(null))}
          onAcc={() => (setView({ kind: 'acc', deck: menu }), setMenu(null))}
        />
      )}
      {create && (
        <CreateMenu
          onClose={() => setCreate(false)}
          onCreated={(id) => {
            setCreate(false);
            setStarters(false);
            setMenu(id);
          }}
        />
      )}
    </div>
  );
}
