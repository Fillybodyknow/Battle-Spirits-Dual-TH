import { useEffect, useMemo, useRef, useState } from 'react';
import { rarityOf, type CardDef } from '@bs/cards';
import { COLOR_LABEL, TYPE_LABEL } from '../format';

/** ตัวกรอง + เรียงคลังการ์ดในหน้าจัดเด็ค */

type CardType = CardDef['type'];
type Color = CardDef['colors'][number];

export const TYPE_ORDER: CardType[] = ['spirit', 'ultimate', 'brave', 'nexus', 'magic'];
const COLORS: { id: Color; swatch: string }[] = [
  { id: 'red', swatch: 'bg-red-500' },
  { id: 'purple', swatch: 'bg-purple-500' },
  { id: 'green', swatch: 'bg-green-500' },
  { id: 'white', swatch: 'bg-slate-100' },
  { id: 'yellow', swatch: 'bg-yellow-400' },
  { id: 'blue', swatch: 'bg-sky-500' },
];

/** ช่วงคอสต์ (7 = 7 ขึ้นไป) */
const COSTS = [0, 1, 2, 3, 4, 5, 6, 7];
const costBucket = (c: CardDef) => Math.min(7, c.cost);
/** ระดับความหายาก (X = X-Rare ขึ้นไป) */
const RARITIES = ['C', 'U', 'R', 'M', 'X'];
const rarityCode = (c: CardDef) => {
  const r = rarityOf(c.rarity);
  return !r ? '' : r.rank >= 5 ? 'X' : r.code;
};
/** ช่วง BP (ดูจาก BP เลเวลสูงสุด) */
const BP_BUCKETS = [
  { label: '≤3000', short: '≤3K', max: 3000 },
  { label: '4000–6000', short: '4–6K', max: 6000 },
  { label: '7000–9000', short: '7–9K', max: 9000 },
  { label: '10000–14000', short: '10–14K', max: 14000 },
  { label: '15000+', short: '15K+', max: Infinity },
];
const maxBp = (c: CardDef) => Math.max(0, ...c.levels.map((l) => l.bp ?? 0));
const bpBucket = (c: CardDef) => {
  const bp = maxBp(c);
  return bp ? BP_BUCKETS.findIndex((b) => bp <= b.max) : -1;
};
/** จำนวนสัญลักษณ์ (2 = 2 ขึ้นไป) */
const SYMBOLS = [0, 1, 2];
const symbolCount = (c: CardDef) => Math.min(2, Object.values(c.symbols as Record<string, number | undefined>).reduce<number>((n, v) => n + (v ?? 0), 0));

/** ความสามารถ/คำสำคัญ (ค้นจากข้อความการ์ด) · ตัวที่ไม่มีการ์ดเลยจะไม่แสดง */
const has = (word: string) => (_c: CardDef, t: string) => t.includes(word);
const KEYWORDS: { id: string; label: string; test: (c: CardDef, text: string) => boolean }[] = [
  { id: 'burst', label: 'Burst', test: (c) => !!c.burst },
  { id: 'soul', label: 'Soul Burst', test: has('Soul Burst') },
  { id: 'flash', label: 'Flash', test: has('Flash') },
  { id: 'quick', label: 'Quick', test: has('Quick') },
  { id: 'evolution', label: 'Evolution', test: has('Evolution') },
  { id: 'catalyze', label: 'Catalyze', test: has('Catalyze') },
  { id: 'kagemusha', label: 'Kagemusha', test: has('Kagemusha') },
  { id: 'shield', label: 'Shield', test: has('Shield') },
  { id: 'rage', label: 'True-Rage', test: has('True-Rage') },
  { id: 'charge', label: 'Charge', test: has('Charge') },
  { id: 'showdown', label: 'Showdown', test: has('Showdown') },
  { id: 'consecutive', label: 'Consecutive Blade', test: has('Consecutive Blade') },
  { id: 'infinite', label: 'Infinite Blade', test: has('Infinite Blade') },
  { id: 'spiritsoul', label: 'Spirit Soul', test: has('Spirit Soul') },
  { id: 'souldrive', label: 'Soul Drive', test: has('Soul Drive') },
  { id: 'rush', label: 'Rush', test: has('Rush') },
  { id: 'bolt', label: 'Summon Bolt', test: has('Summon Bolt') },
  { id: 'onstage', label: 'On Stage', test: has('On Stage') },
  { id: 'solo', label: 'Solo Part', test: has('Solo Part') },
  { id: 'unit', label: 'My Unit', test: has('My Unit') },
  { id: 'soulcore', label: 'ใช้ Soul Core', test: (_c, t) => t.includes('โซลคอร์') || t.includes('Soul Core') },
  { id: 'song', label: 'เพลง', test: (c) => c.magicTypes.includes('เพลง') },
  { id: 'braved', label: 'เอฟเฟกต์ร่วมร่าง', test: (c) => (c.effects as { whileBraved?: boolean }[]).some((e) => e.whileBraved) },
  { id: 'summoncond', label: 'เงื่อนไขอัญเชิญ', test: (c) => !!c.summonCondition },
];
const cardText = (c: CardDef) => (c.effects as { text?: string }[]).map((e) => e.text ?? '').join(' ');

/** เรียงการ์ด: ประเภท → คอสต์ → รหัส */
export const byTypeCost = (a: CardDef, b: CardDef) =>
  TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.cost - b.cost || a.cardNo.localeCompare(b.cardNo);

type SortKey = 'type' | 'cost' | 'bp' | 'name' | 'no';
const SORTS: { id: SortKey; label: string; cmp: (a: CardDef, b: CardDef) => number }[] = [
  { id: 'type', label: 'ประเภท', cmp: byTypeCost },
  { id: 'cost', label: 'คอสต์', cmp: (a, b) => a.cost - b.cost || byTypeCost(a, b) },
  { id: 'bp', label: 'BP', cmp: (a, b) => maxBp(a) - maxBp(b) || byTypeCost(a, b) },
  { id: 'name', label: 'ชื่อ', cmp: (a, b) => a.name.localeCompare(b.name, 'th') || a.cardNo.localeCompare(b.cardNo) },
  { id: 'no', label: 'รหัสการ์ด', cmp: (a, b) => a.cardNo.localeCompare(b.cardNo) },
];

type Owned = 'all' | 'inDeck' | 'notInDeck' | 'notFull';
const OWNED: { id: Owned; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'inDeck', label: 'อยู่ในเด็ค' },
  { id: 'notInDeck', label: 'ไม่อยู่ในเด็ค' },
  { id: 'notFull', label: 'ยังใส่เพิ่มได้' },
];

interface Filters {
  query: string;
  /** ค้นในข้อความเอฟเฟกต์ด้วย */
  inText: boolean;
  colors: Color[];
  types: CardType[];
  sets: string[];
  costs: number[];
  bps: number[];
  symbols: number[];
  rarities: string[];
  families: string[];
  teams: string[];
  keywords: string[];
  owned: Owned;
  sort: SortKey;
  desc: boolean;
}
const EMPTY: Filters = {
  query: '',
  inText: false,
  colors: [],
  types: [],
  sets: [],
  costs: [],
  bps: [],
  symbols: [],
  rarities: [],
  families: [],
  teams: [],
  keywords: [],
  owned: 'all',
  sort: 'type',
  desc: false,
};
/** กลุ่มที่ใช้กรอง (กลุ่มเดียวกันเลือกหลายค่า = "หรือ" ยกเว้นความสามารถ = "และ") */
const GROUPS = ['query', 'colors', 'types', 'sets', 'costs', 'bps', 'symbols', 'rarities', 'families', 'teams', 'keywords', 'owned'] as const;
type Group = (typeof GROUPS)[number];

/** จำตัวกรองไว้ในเครื่อง (ไม่ซิงก์บัญชี) · คำค้นไม่จำ */
const STORE_KEY = 'bs-deck-filters';
function loadSaved(): { f: Filters; open: boolean } {
  const f = { ...EMPTY };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(EMPTY) as (keyof Filters)[]) {
        const v = raw[k];
        if (k !== 'query' && v !== undefined && Array.isArray(v) === Array.isArray(EMPTY[k]) && typeof v === typeof EMPTY[k]) (f as Record<string, unknown>)[k] = v;
      }
    }
  } catch {
    // อ่านไม่ได้ = เริ่มใหม่
  }
  return { f, open: false };
}

/** สถานะตัวกรอง + ผลกรอง · nameCounts = จำนวนในเด็คตามชื่อการ์ด */
export function useCardFilters(cards: CardDef[], nameCounts: Map<string, number>, max: number) {
  const [state, setState] = useState(loadSaved);
  const f = state.f;
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...state.f, query: '' }));
    } catch {
      // เก็บไม่ได้ก็ไม่เป็นไร
    }
  }, [state.f]);

  const texts = useMemo(() => new Map(cards.map((c) => [c.cardNo, cardText(c)])), [cards]);
  const names = useMemo(() => new Map(cards.map((c) => [c.cardNo, [c.name, ...c.family, ...c.teams, c.cardNo].join(' ').toLowerCase()])), [cards]);
  const families = useMemo(() => [...new Set(cards.flatMap((c) => c.family))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'th')), [cards]);
  const teams = useMemo(() => [...new Set(cards.flatMap((c) => c.teams))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'th')), [cards]);
  const keywords = useMemo(() => KEYWORDS.filter((k) => cards.some((c) => k.test(c, texts.get(c.cardNo) ?? ''))), [cards, texts]);

  const tests = useMemo(() => {
    const terms = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const inDeck = (c: CardDef) => nameCounts.get(c.name) ?? 0;
    const t: Record<Group, (c: CardDef) => boolean> = {
      query: (c) => terms.every((w) => names.get(c.cardNo)!.includes(w) || (f.inText && texts.get(c.cardNo)!.toLowerCase().includes(w))),
      colors: (c) => !f.colors.length || c.colors.some((x) => f.colors.includes(x)),
      types: (c) => !f.types.length || f.types.includes(c.type),
      // ตัวกรองชุดถูกเอาออก (รหัสการ์ดเป็นรหัสที่พิมพ์บนการ์ดจริง): ค่าที่บันทึกไว้เดิมไม่มีผล
      sets: () => true,
      costs: (c) => !f.costs.length || f.costs.includes(costBucket(c)),
      bps: (c) => !f.bps.length || f.bps.includes(bpBucket(c)),
      symbols: (c) => !f.symbols.length || f.symbols.includes(symbolCount(c)),
      rarities: (c) => !f.rarities.length || f.rarities.includes(rarityCode(c)),
      families: (c) => !f.families.length || c.family.some((x) => f.families.includes(x)),
      teams: (c) => !f.teams.length || c.teams.some((x) => f.teams.includes(x)),
      keywords: (c) => f.keywords.every((k) => KEYWORDS.find((x) => x.id === k)?.test(c, texts.get(c.cardNo) ?? '') ?? true),
      owned: (c) => (f.owned === 'inDeck' ? inDeck(c) > 0 : f.owned === 'notInDeck' ? inDeck(c) === 0 : f.owned === 'notFull' ? inDeck(c) < max : true),
    };
    return t;
  }, [f, names, texts, nameCounts, max]);

  // แต่ละใบตกกลุ่มไหนบ้าง (นับตัวเลขข้างตัวเลือก = ถ้าเลือกตัวนี้จะเหลือกี่ใบ)
  const { pool, near } = useMemo(() => {
    const pool: CardDef[] = [];
    const near = new Map<Group, CardDef[]>(GROUPS.map((g) => [g, []]));
    for (const c of cards) {
      const fails = GROUPS.filter((g) => !tests[g](c));
      if (fails.length === 0) pool.push(c);
      else if (fails.length === 1) near.get(fails[0]!)!.push(c);
    }
    const cmp = SORTS.find((s) => s.id === f.sort)?.cmp ?? byTypeCost;
    pool.sort((a, b) => (f.desc ? -cmp(a, b) : cmp(a, b)));
    return { pool, near };
  }, [cards, tests, f.sort, f.desc]);

  /** จำนวนใบถ้าเลือกตัวเลือกนี้ในกลุ่ม g (ความสามารถ = เพิ่มเงื่อนไข "และ") */
  const count = (g: Group, test: (c: CardDef) => boolean) =>
    g === 'keywords' ? pool.filter(test).length : pool.filter(test).length + near.get(g)!.filter(test).length;

  const update = (patch: Partial<Filters>) => setState((s) => ({ ...s, f: { ...s.f, ...patch } }));
  const clear = () => setState((s) => ({ ...s, f: { ...EMPTY, sort: s.f.sort, desc: s.f.desc } }));
  const setOpen = (open: boolean) => setState((s) => ({ ...s, open }));

  return { f, open: state.open, setOpen, update, clear, pool, count, families, teams, keywords, texts, max };
}

type FilterState = ReturnType<typeof useCardFilters>;

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** ปุ่มตัวเลือก + ตัวเลขจำนวนใบ (เต็มช่องของตาราง) */
function Chip({ on, n, onClick, children, tone = 'bg-sky-500 text-white ring-sky-300', title }: { on: boolean; n?: number; onClick: () => void; children: React.ReactNode; tone?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left font-bold ring-1 transition ${
        on ? tone : `bg-slate-800/80 text-slate-200 ring-white/5 hover:bg-slate-700 hover:text-white ${n === 0 ? 'opacity-35' : ''}`
      }`}
    >
      <span className="truncate">{children}</span>
      {n !== undefined && <span className={`shrink-0 text-[10px] font-normal tabular-nums ${on ? 'opacity-85' : 'text-slate-500'}`}>{n}</span>}
    </button>
  );
}

/** หัวข้อตัวกรอง + ปุ่มล้างเฉพาะหัวข้อ */
function Section({ title, hint, picked, onClear, children }: { title: string; hint?: string; picked: number; onClear: () => void; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-black text-white">{title}</h3>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
        {picked > 0 && (
          <button type="button" onClick={onClear} className="ml-auto rounded px-1.5 text-[11px] font-bold text-sky-300 hover:bg-rose-600 hover:text-white">
            ล้าง ({picked})
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** แถบตัวกรองคลังการ์ด */
export function FilterBar({ fl }: { fl: FilterState }) {
  const { f, update, count } = fl;
  const search = useRef<HTMLInputElement>(null);

  // "/" = ไปช่องค้นหา
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || el?.closest('input, textarea, select')) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // ตัวกรองที่ใช้อยู่ (ป้ายกดลบทีละอัน)
  const active: { key: string; label: string; off: () => void }[] = [];
  if (f.query.trim()) active.push({ key: 'q', label: `ค้นหา "${f.query.trim()}"${f.inText ? ' (รวมเอฟเฟกต์)' : ''}`, off: () => update({ query: '' }) });
  f.colors.forEach((x) => active.push({ key: `c${x}`, label: `สี${COLOR_LABEL[x]}`, off: () => update({ colors: toggle(f.colors, x) }) }));
  f.types.forEach((x) => active.push({ key: `t${x}`, label: TYPE_LABEL[x], off: () => update({ types: toggle(f.types, x) }) }));
  f.costs.forEach((x) => active.push({ key: `k${x}`, label: `คอสต์ ${x === 7 ? '7+' : x}`, off: () => update({ costs: toggle(f.costs, x) }) }));
  f.bps.forEach((x) => active.push({ key: `b${x}`, label: `BP ${BP_BUCKETS[x]?.label ?? ''}`, off: () => update({ bps: toggle(f.bps, x) }) }));
  f.symbols.forEach((x) => active.push({ key: `y${x}`, label: `สัญลักษณ์ ${x === 2 ? '2+' : x}`, off: () => update({ symbols: toggle(f.symbols, x) }) }));
  f.rarities.forEach((x) => active.push({ key: `r${x}`, label: `ระดับ ${x === 'X' ? 'X ขึ้นไป' : x}`, off: () => update({ rarities: toggle(f.rarities, x) }) }));
  f.families.forEach((x) => active.push({ key: `f${x}`, label: `เผ่า ${x}`, off: () => update({ families: toggle(f.families, x) }) }));
  f.teams.forEach((x) => active.push({ key: `m${x}`, label: `ทีม ${x}`, off: () => update({ teams: toggle(f.teams, x) }) }));
  f.keywords.forEach((x) => active.push({ key: `w${x}`, label: KEYWORDS.find((k) => k.id === x)?.label ?? x, off: () => update({ keywords: toggle(f.keywords, x) }) }));
  if (f.owned !== 'all') active.push({ key: 'o', label: OWNED.find((o) => o.id === f.owned)!.label, off: () => update({ owned: 'all' }) });
  const panelCount = active.length - (f.query.trim() ? 1 : 0) - f.colors.length - f.types.length;

  return (
    <div className="flex flex-col gap-1.5">
      {/* ค้นหา */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <input
            ref={search}
            value={f.query}
            onChange={(e) => update({ query: e.target.value })}
            onKeyDown={(e) => e.key === 'Escape' && (update({ query: '' }), e.currentTarget.blur())}
            placeholder={f.inText ? 'ค้นหาชื่อ / เผ่า / รหัส / ข้อความเอฟเฟกต์' : 'ค้นหาชื่อ / เผ่า / ทีม / รหัส  (กด / )'}
            className="w-full rounded-lg bg-slate-900 py-2 pr-8 pl-3 text-sm text-white ring-1 ring-slate-600 focus:ring-sky-300 focus:outline-none"
          />
          {f.query && (
            <button
              type="button"
              onClick={() => (update({ query: '' }), search.current?.focus())}
              className="absolute top-1/2 right-1.5 h-6 w-6 -translate-y-1/2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
              title="ล้างคำค้น"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => update({ inText: !f.inText })}
          className={`shrink-0 rounded-lg px-2 py-2 text-xs font-bold transition ${f.inText ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
          title="ค้นในข้อความเอฟเฟกต์ด้วย (เช่น จั่ว, ทำลาย, BP+)"
        >
          {f.inText ? '✓ ' : ''}ในเอฟเฟกต์
        </button>
      </div>

      {/* สี + ประเภท */}
      <div className="flex flex-wrap items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => update({ colors: toggle(f.colors, c.id) })}
            title={`สี${COLOR_LABEL[c.id]} (${count('colors', (x) => x.colors.includes(c.id))} ใบ)`}
            className={`h-6 w-6 rounded-full ${c.swatch} ring-2 transition ${f.colors.includes(c.id) ? 'scale-110 ring-white' : 'opacity-50 ring-transparent hover:opacity-80'}`}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        <div className="flex flex-wrap gap-1 text-xs">
          {TYPE_ORDER.map((t) => (
            <Chip key={t} on={f.types.includes(t)} n={count('types', (x) => x.type === t)} onClick={() => update({ types: toggle(f.types, t) })}>
              {TYPE_LABEL[t]}
            </Chip>
          ))}
        </div>
      </div>

      {/* ปุ่มตัวกรองเพิ่มเติม / เรียง / ล้าง */}
      <div className="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => fl.setOpen(!fl.open)}
          className={`rounded px-2 py-1 font-bold transition ${fl.open || panelCount > 0 ? 'bg-sky-500/30 text-sky-100 ring-1 ring-sky-400/60' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
        >
          {fl.open ? 'ปิดตัวกรอง ▴' : `ตัวกรองเพิ่มเติม${panelCount > 0 ? ` (${panelCount})` : ''} ▾`}
        </button>
        <span className="ml-auto text-slate-400">เรียง</span>
        {/* ซ่อนลูกศรของเบราว์เซอร์ (ชี้แล้วขึ้นกล่องสีระบบ) ใช้ ▾ ของเราแทน */}
        <div className="relative">
          <select
            value={f.sort}
            onChange={(e) => update({ sort: e.target.value as SortKey })}
            className="cursor-pointer appearance-none rounded bg-slate-800 py-1 pr-6 pl-2 font-bold text-slate-200 [color-scheme:dark] transition outline-none hover:bg-slate-700 hover:text-white focus-visible:ring-1 focus-visible:ring-sky-300"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id} className="bg-slate-900">
                {s.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-slate-400">▾</span>
        </div>
        <button
          type="button"
          onClick={() => update({ desc: !f.desc })}
          className="rounded bg-slate-800 px-2 py-1 font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
          title={f.desc ? 'มากไปน้อย' : 'น้อยไปมาก'}
        >
          {f.desc ? '↓ มาก→น้อย' : '↑ น้อย→มาก'}
        </button>
      </div>

      {/* ตัวกรองที่ใช้อยู่ */}
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {active.map((a) => (
            <button key={a.key} type="button" onClick={a.off} className="rounded-full bg-sky-900/70 py-0.5 pr-1.5 pl-2 text-sky-100 ring-1 ring-sky-400/40 hover:bg-rose-700" title="เอาตัวกรองนี้ออก">
              {a.label} <span className="font-bold">×</span>
            </button>
          ))}
          <button type="button" onClick={fl.clear} className="rounded-full px-2 py-0.5 font-bold text-rose-300 hover:bg-rose-600 hover:text-white">
            ล้างทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}

const COLS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 8: 'grid-cols-8' };
const Grid = ({ cols, children }: { cols: number; children: React.ReactNode }) => <div className={`grid gap-1 text-xs ${COLS[cols]}`}>{children}</div>;

/** แผงตัวกรองเพิ่มเติม: แสดงแทนที่คลังการ์ดตอนเปิด */
export function FilterPanel({ fl }: { fl: FilterState }) {
  const { f, update, count } = fl;
  const [familyQuery, setFamilyQuery] = useState('');
  const familyList = fl.families.filter((x) => !familyQuery.trim() || x.includes(familyQuery.trim()));
  const familyShown = [...new Set([...f.families, ...familyList])];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/10">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        <Section title="คอสต์" picked={f.costs.length} onClear={() => update({ costs: [] })}>
          <Grid cols={8}>
            {COSTS.map((c) => (
              <Chip key={c} on={f.costs.includes(c)} n={count('costs', (x) => costBucket(x) === c)} tone="bg-yellow-300 text-slate-900 ring-yellow-100" onClick={() => update({ costs: toggle(f.costs, c) })}>
                {c === 7 ? '7+' : c}
              </Chip>
            ))}
          </Grid>
        </Section>

        <Section title="BP" hint="ดูที่เลเวลสูงสุด" picked={f.bps.length} onClear={() => update({ bps: [] })}>
          <Grid cols={5}>
            {BP_BUCKETS.map((b, i) => (
              <Chip key={b.label} on={f.bps.includes(i)} n={count('bps', (x) => bpBucket(x) === i)} tone="bg-orange-500 text-white ring-orange-300" title={`BP ${b.label}`} onClick={() => update({ bps: toggle(f.bps, i) })}>
                {b.short}
              </Chip>
            ))}
          </Grid>
        </Section>

        <div className="grid grid-cols-[3fr_5fr] gap-3">
          <Section title="สัญลักษณ์" picked={f.symbols.length} onClear={() => update({ symbols: [] })}>
            <Grid cols={3}>
              {SYMBOLS.map((y) => (
                <Chip key={y} on={f.symbols.includes(y)} n={count('symbols', (x) => symbolCount(x) === y)} tone="bg-amber-500 text-white ring-amber-300" onClick={() => update({ symbols: toggle(f.symbols, y) })}>
                  {y === 2 ? '2+' : y}
                </Chip>
              ))}
            </Grid>
          </Section>
          <Section title="ระดับ" picked={f.rarities.length} onClear={() => update({ rarities: [] })}>
            <Grid cols={5}>
              {RARITIES.map((r) => (
                <Chip key={r} on={f.rarities.includes(r)} n={count('rarities', (x) => rarityCode(x) === r)} tone="bg-fuchsia-500 text-white ring-fuchsia-300" title={r === 'X' ? 'X-Rare ขึ้นไป' : undefined} onClick={() => update({ rarities: toggle(f.rarities, r) })}>
                  {r === 'X' ? 'X+' : r}
                </Chip>
              ))}
            </Grid>
          </Section>
        </div>

        <Section title="ความสามารถ" hint="เลือกหลายอัน = ต้องมีครบทุกอัน" picked={f.keywords.length} onClear={() => update({ keywords: [] })}>
          <Grid cols={3}>
            {fl.keywords.map((k) => (
              <Chip
                key={k.id}
                on={f.keywords.includes(k.id)}
                n={count('keywords', (x) => k.test(x, fl.texts.get(x.cardNo) ?? ''))}
                tone="bg-emerald-500 text-white ring-emerald-300"
                title={k.label}
                onClick={() => update({ keywords: toggle(f.keywords, k.id) })}
              >
                {k.label}
              </Chip>
            ))}
          </Grid>
        </Section>

        <Section title="เผ่า" picked={f.families.length} onClear={() => update({ families: [] })}>
          <div className="relative">
            <input
              value={familyQuery}
              onChange={(e) => setFamilyQuery(e.target.value)}
              placeholder="พิมพ์ชื่อเผ่าเพื่อหา"
              className="w-full rounded-md bg-slate-900 py-1.5 pr-7 pl-2 text-xs text-white ring-1 ring-slate-700 focus:ring-sky-300 focus:outline-none"
            />
            {familyQuery && (
              <button type="button" onClick={() => setFamilyQuery('')} className="absolute top-1/2 right-1 h-5 w-5 -translate-y-1/2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white">
                ×
              </button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto pr-1">
            <Grid cols={3}>
              {familyShown.map((x) => (
                <Chip key={x} on={f.families.includes(x)} n={count('families', (c) => c.family.includes(x))} tone="bg-teal-500 text-white ring-teal-300" title={x} onClick={() => update({ families: toggle(f.families, x) })}>
                  {x}
                </Chip>
              ))}
            </Grid>
            {familyShown.length === 0 && <div className="py-2 text-center text-xs text-slate-500">ไม่พบเผ่านี้</div>}
          </div>
        </Section>

        {fl.teams.length > 0 && (
          <Section title="ทีม" picked={f.teams.length} onClear={() => update({ teams: [] })}>
            <Grid cols={2}>
              {fl.teams.map((x) => (
                <Chip key={x} on={f.teams.includes(x)} n={count('teams', (c) => c.teams.includes(x))} tone="bg-pink-500 text-white ring-pink-300" title={x} onClick={() => update({ teams: toggle(f.teams, x) })}>
                  {x}
                </Chip>
              ))}
            </Grid>
          </Section>
        )}

        <Section title="การ์ดในเด็ค" picked={f.owned === 'all' ? 0 : 1} onClear={() => update({ owned: 'all' })}>
          <Grid cols={4}>
            {OWNED.map((o) => (
              <Chip key={o.id} on={f.owned === o.id} onClick={() => update({ owned: o.id })} tone="bg-indigo-500 text-white ring-indigo-300">
                {o.label}
              </Chip>
            ))}
          </Grid>
        </Section>
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 bg-slate-950/60 p-2">
        <button type="button" onClick={fl.clear} className="rounded-lg px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-600 hover:text-white">
          ล้างทั้งหมด
        </button>
        <button type="button" onClick={() => fl.setOpen(false)} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-black text-white shadow transition hover:bg-sky-500 active:scale-[0.98]">
          ดูการ์ด {fl.pool.length} ใบ
        </button>
      </div>
    </div>
  );
}
