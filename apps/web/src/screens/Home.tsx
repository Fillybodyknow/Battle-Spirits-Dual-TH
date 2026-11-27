import { isXRare } from '@bs/cards';
import { browserKind, useInstall } from '../pwa';
import { VersionBadge } from '../components/Updates';
import { CHANGELOG } from '../changelog';
import { SettingsDialog } from '../components/SettingsDialog';
import { Icon } from '../components/Icon';
import { useEffect, useMemo, useState } from 'react';
import { cardArt } from '../assets';
import { BTN } from '../components/Modal';
import { setSfx, sfx, sfxSettings } from '../sfx';
import { DECKS, db, onlineAvailable, useGame, type DeckId, playableDecks } from '../store';
import { deckInfo } from '../decks';
import { playerId, useAccount } from '../account/account';
import { AccountDialog, AvatarImg } from '../components/AccountDialog';
import { MyLevel } from '../components/LevelBadge';
import { TutorialMenu, TutorialWelcome } from '../tutorial/TutorialMenu';
import { useTutorial } from '../tutorial/tutorial';
import { LESSONS } from '../tutorial/lessons';
import { startVsBot } from '../bot/vsBot';
import { CardArt, DeckTile, GLOW, deckColor, deckCover, deckSize } from './shared';

/** ช่องทางคอมมูนิตี้ของเกม (Discord) */
export const COMMUNITY_URL = 'https://discord.gg/YgGu24BGc';

/** คู่การ์ด X-Rare ที่หมุนแสดงทางขวาของหน้าหลัก */
function useShowcase(): string[][] {
  return useMemo(() => {
    const xr = db.all().filter((c) => isXRare(c) && cardArt(c.cardNo));
    const pairs: string[][] = [];
    for (let i = 0; i < xr.length; i += 2) pairs.push(xr.slice(i, i + 2).map((c) => c.cardNo));
    return pairs.length > 0 ? pairs : [[db.all()[0]!.cardNo]];
  }, []);
}

/** ภาพการ์ดคู่ลอยทางขวา: สลับชุดทุก 7 วินาที
 * วาดแค่ชุดที่แสดง + ชุดที่กำลังจางออก (เดิมวาดทุกชุดแล้วซ่อนด้วย opacity: ภาพเต็ม X-Rare ทุกใบถูกถอดรหัสค้างในหน่วยความจำ
 * + แสงเบลอ/แอนิเมชันของทุกชุดวิ่งตลอด = หน้าหลักหนักมากบนมือถือ) */
function Showcase() {
  const pairs = useShowcase();
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      setI((x) => {
        setPrev(x);
        return (x + 1) % pairs.length;
      });
    }, 7000);
    return () => clearInterval(t);
  }, [pairs.length]);
  // ชุดเดิมจางออกจบแล้ว: เอาออกจากหน้า
  useEffect(() => {
    if (prev === null) return;
    const t = setTimeout(() => setPrev(null), 1000);
    return () => clearTimeout(t);
  }, [prev, i]);
  const shown = prev !== null && prev !== i ? [prev, i] : [i];
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-[62%]">
      {shown.map((k) => {
        const pair = pairs[k]!;
        const glow = GLOW[db.get(pair[0]!).colors[0] ?? 'blue'] ?? GLOW.blue!;
        const on = k === i;
        return (
          <div key={k} className="absolute inset-0" style={{ animation: `${on ? 'showcase-in' : 'showcase-out'} 1s ease both` }}>
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
                <div className="absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: 'home-sheen 5s ease-in-out infinite' }} />
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

/** ป้ายโปรไฟล์มุมซ้ายบน: ทั้งป้ายเป็นปุ่มเดียว เปิดหน้าบัญชี (แก้ชื่อ / รูป / ออกจากระบบ ที่นั่นที่เดียว) */
function ProfilePlate() {
  const name = useGame((s) => s.playerName);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, avatar: picked } = useAccount();
  const fallback = deckCover('sd02');
  const avatar = picked || fallback;
  return (
    <>
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} fallbackAvatar={fallback} />}
      <button
        type="button"
        onClick={() => (sfx('click'), setAccountOpen(true))}
        title="บัญชีของฉัน"
        className="group flex items-center gap-3 self-start rounded-r-2xl border border-l-0 border-sky-300/30 bg-gradient-to-r from-slate-950/95 to-slate-900/70 py-2 pr-6 pl-5 text-left shadow-[0_0_24px_rgba(56,189,248,0.15)] backdrop-blur transition hover:border-sky-300/60 hover:shadow-[0_0_28px_rgba(56,189,248,0.3)]"
      >
        <AvatarImg cardNo={avatar} className="h-14 w-14 shrink-0 rounded-xl ring-2 ring-yellow-300/80 shadow-[0_0_14px_rgba(250,204,21,0.4)] transition group-hover:brightness-110" />
        <span className="min-w-0">
          <span className="block max-w-56 truncate text-lg font-black text-white">{name}</span>
          <span className="block text-xs tracking-wider text-sky-200/70">Player ID: {user ? playerId(user.uid) : '---'}</span>
          <MyLevel />
        </span>
      </button>
    </>
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

/** สไลด์ของแบนเนอร์ข่าวสาร: แสดงอย่างเดียว ไม่มีปุ่มพาไปไหน */
type NewsSlide = { key: string; tag: string; tagClass: string; title: string; sub: string; glow: string; cards: string[]; big?: string };

/** ชุด Booster ล่าสุด n ชุดในฐานข้อมูลการ์ด (ใหม่สุดก่อน): เลขชุด + จำนวนการ์ด + การ์ดเด่น (X-Rare ก่อน) */
function useLatestBoosters(n: number): { set: string; count: number; highlights: string[] }[] {
  return useMemo(() => {
    const bySet = new Map<string, string[]>();
    for (const c of db.all()) {
      // ชุดในเกม (BS01… / BSC01…) จากข้อมูลการ์ด: รหัสการ์ดเป็นรหัสที่พิมพ์บนการ์ดจริง (BS31-C003 ฯลฯ) ใช้แยกชุดไม่ได้
      // ลำดับใน db = ลำดับที่ชุดถูกเพิ่มเข้าเกม (loadAllCards) → ชุดล่าสุดอยู่ท้าย
      if (c.set && /^BSC?\d+$/.test(c.set)) bySet.set(c.set, [...(bySet.get(c.set) ?? []), c.cardNo]);
    }
    return [...bySet.keys()]
      .reverse()
      .slice(0, n)
      .map((set) => {
        const cards = bySet.get(set)!;
        const withArt = cards.filter((no) => cardArt(no));
        const xr = withArt.filter((no) => isXRare(db.get(no)));
        return { set, count: cards.length, highlights: [...xr, ...withArt.filter((no) => !xr.includes(no))].slice(0, 3) };
      });
  }, [n]);
}

/** แบนเนอร์ข่าวสารมุมซ้ายล่าง: อัปเดตล่าสุด / ชุดการ์ด 3 ชุดล่าสุด (สไลด์ละชุด) / Starter Deck (หมุนเอง หยุดเมื่อชี้ หรือกดลูกศร/จุด) */
function NewsBanner() {
  const boosters = useLatestBoosters(3);
  const starters = (Object.keys(DECKS) as DeckId[]).filter((id) => id.startsWith('sd'));
  const latest = CHANGELOG[0]!;
  const slides: NewsSlide[] = [
    {
      key: 'update',
      tag: 'อัปเดต',
      tagClass: 'from-sky-300 to-sky-500',
      title: `เวอร์ชัน ${latest.version}`,
      sub: latest.items[0] ?? '',
      glow: '#38bdf8',
      cards: [],
      big: `v${latest.version}`,
    },
    ...boosters.map((b, k) => ({
      key: `booster-${b.set}`,
      tag: k === 0 ? 'ชุดการ์ดใหม่' : 'ชุดการ์ด',
      tagClass: 'from-fuchsia-400 to-rose-500',
      title: b.set.startsWith('BSC') ? `Collection ${b.set}` : `Booster Set ${b.set.slice(2)}`,
      sub: `การ์ด ${b.count} ใบ${b.highlights[0] ? ` · การ์ดเด่น ${db.get(b.highlights[0]).name}` : ''}`,
      glow: GLOW[db.get(b.highlights[0] ?? db.all()[0]!.cardNo).colors[0] ?? 'blue'] ?? GLOW.blue!,
      cards: b.highlights,
    })),
    {
      key: 'starter',
      tag: 'STARTER DECK',
      tagClass: 'from-amber-400 to-orange-500',
      title: `Starter Deck ${starters.length} เด็ค`,
      sub: `${starters.map((id) => deckInfo(id).label.replace('Starter Deck ', 'SD')).join(' · ')} · เด็คละ ${deckSize(starters[0]!)} ใบ เล่นได้ทันที`,
      glow: deckColor(starters[0]!),
      cards: starters.slice(0, 3).map((id) => deckCover(id)),
    },
  ];
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length, hover]);
  const s = slides[i % slides.length]!;
  return (
    <div className="w-[420px]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative h-36 overflow-hidden rounded-xl border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        <div key={s.key} className="absolute inset-0" style={{ background: `linear-gradient(110deg, ${s.glow}44, #0b1020 55%)`, animation: 'fx-chain-pop 0.35s ease-out both' }}>
          <div className={`absolute top-0 left-0 rounded-br-lg bg-gradient-to-r px-3 py-0.5 text-xs font-black text-slate-950 ${s.tagClass}`}>{s.tag}</div>
          <div className={`absolute top-8 left-8 z-10 ${s.cards.length > 0 || s.big ? 'max-w-[56%]' : 'right-8'}`}>
            <div className="text-2xl font-black text-white drop-shadow">{s.title}</div>
            <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-300">{s.sub}</div>
          </div>
          {s.big && <div className="absolute top-1/2 right-6 -translate-y-1/2 text-5xl font-black tracking-tight text-sky-200/25 italic select-none">{s.big}</div>}
          {s.cards.length > 0 && (
            <div className="absolute top-3 right-3 flex [&>*]:origin-bottom">
              {s.cards.map((no, k) => <CardArt key={no} cardNo={no} className={`-ml-12 w-[4.6rem] shadow-xl ${['rotate-[-8deg]', 'rotate-[2deg]', 'rotate-[10deg]'][k]}`} />).reverse()}
            </div>
          )}
        </div>
        {slides.length > 1 && (
          <>
            <button type="button" aria-label="ข่าวก่อนหน้า" onClick={() => setI((i - 1 + slides.length) % slides.length)} className="absolute top-1/2 left-1 z-20 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-white hover:bg-black/80">
              ‹
            </button>
            <button type="button" aria-label="ข่าวถัดไป" onClick={() => setI((i + 1) % slides.length)} className="absolute top-1/2 right-1 z-20 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-white hover:bg-black/80">
              ›
            </button>
          </>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {slides.map((d, k) => (
          <button key={d.key} type="button" aria-label={d.title} onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-yellow-300' : 'w-1.5 bg-white/40'}`} />
        ))}
      </div>
    </div>
  );
}

/** เมนู SOLO: เล่นคนเดียว (บทเรียน / ดวลกับบอท) */
export function SoloMenu({ onClose, onTutorial, onBot, tutorialLeft }: { onClose: () => void; onTutorial: () => void; onBot: () => void; tutorialLeft: boolean }) {
  const item = (title: string, sub: string, onClick: () => void, badge?: string) => (
    <button
      type="button"
      onClick={() => {
        sfx('click');
        onClick();
      }}
      onMouseEnter={() => sfx('hover')}
      className="group flex w-72 flex-col items-start gap-1 rounded-xl border border-sky-300/30 bg-slate-900/70 px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300/70 hover:bg-slate-800/80"
    >
      <span className="flex items-center gap-2">
        <span className="bg-gradient-to-r from-white via-sky-100 to-sky-300 bg-clip-text pr-[0.12em] text-3xl font-black tracking-wide text-transparent italic group-hover:from-yellow-100 group-hover:to-amber-400">{title}</span>
        {badge && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">{badge}</span>}
      </span>
      <span className="text-sm text-slate-300 group-hover:text-white">{sub}</span>
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel flex flex-col gap-4 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-xs tracking-[0.3em] text-sky-300">SOLO</div>
          <div className="text-2xl font-black text-white">เล่นคนเดียว</div>
        </div>
        <div className="flex flex-wrap gap-3">
          {item('TUTORIAL', 'บทเรียนพื้นฐาน · เรียนวิธีเล่นทีละขั้น', onTutorial, tutorialLeft ? 'NEW' : undefined)}
          {item('VS BOT', 'ดวลกับบอท (ทดลอง) · เลือกเด็คทั้งสองฝ่าย', onBot)}
        </div>
        <div className="flex justify-end">
          <button type="button" className={BTN.secondary} onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

/** หน้าต่างเลือกเด็คสองฝั่งสำหรับเล่นเครื่องเดียว (vsBot = ดวลกับบอท: ฝั่งที่ 2 เป็นบอท) */
export function LocalSetup({ onClose, vsBot }: { onClose: () => void; vsBot?: boolean }) {
  const decks = useGame((s) => s.decks);
  const startLocal = useGame((s) => s.startLocal);
  const [pick, setPick] = useState(decks);
  /** ความเก่งของบอท ★1–6 (★6 = คิดล่วงหน้าอีกหนึ่งท่า) */
  const [level, setLevel] = useState(5);
  /** 2VS2 / 1VS2 (ทดลอง): 1v2 = เราคนเดียวสู้บอท 2 ตัว · 2v1 = เรา + บอทคู่หูสู้บอทตัวเดียว */
  const [partners, setPartners] = useState(decks);
  const [mode, setMode] = useState<'1v1' | '2v2' | '1v2' | '2v1'>('1v1');
  const team = mode !== '1v1';
  const partnerPick = mode === '2v2' ? partners : mode === '1v2' ? { p2: partners.p2 } : mode === '2v1' ? { p1: partners.p1 } : null;
  const ids = playableDecks();
  const row = (label: string, value: string, onPick: (id: string) => void) => (
    <div key={label}>
      <div className="mb-2 text-sm font-bold text-slate-300">{label}</div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {ids.map((id) => (
          <DeckTile key={id} id={id} small selected={value === id} onClick={() => onPick(id)} />
        ))}
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel flex max-w-4xl flex-col gap-4 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-xs tracking-[0.3em] text-sky-300">{vsBot ? 'VS BOT' : 'LOCAL DUEL'}</div>
          <div className="text-2xl font-black text-white">{vsBot ? 'ดวลกับบอท (ทดลอง)' : 'เล่นเครื่องเดียว (สองคนสลับกัน)'}</div>
        </div>
        {vsBot && (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['1v1', '1VS1', ''],
                ['2v2', '2VS2', 'เรา + บอทคู่หู สู้บอท 2 ตัว'],
                ['1v2', '1VS2', 'เราคนเดียวสู้บอท 2 ตัว (ไลฟ์ 10, คอร์ +2, จั่ว 2)'],
                ['2v1', '2VS1', 'เรา + บอทคู่หู สู้บอทตัวเดียว (บอทไลฟ์ 10, คอร์ +2, จั่ว 2)'],
              ] as const
            ).map(([m, label, tip]) => (
              <button
                key={m}
                type="button"
                title={tip}
                onClick={() => setMode(m)}
                className={`rounded-lg border px-4 py-1.5 text-sm font-black transition ${mode === m ? 'border-amber-300 bg-amber-400/20 text-amber-100' : 'border-slate-600 text-slate-300 hover:border-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className={`flex flex-col gap-4 ${team ? 'max-h-[52vh] overflow-y-auto pr-1' : ''}`}>
          {team && vsBot
            ? [
                row('เด็คของเรา', pick.p1, (id) => setPick({ ...pick, p1: id })),
                ...(mode !== '1v2' ? [row('เด็คเพื่อนร่วมทีม (บอท)', partners.p1, (id) => setPartners({ ...partners, p1: id }))] : []),
                row(mode === '2v1' ? 'เด็คของบอท' : 'เด็คคู่แข่งคนที่ 1 (บอท)', pick.p2, (id) => setPick({ ...pick, p2: id })),
                ...(mode !== '2v1' ? [row('เด็คคู่แข่งคนที่ 2 (บอท)', partners.p2, (id) => setPartners({ ...partners, p2: id }))] : []),
              ]
            : (['p1', 'p2'] as const).map((p) =>
                row(vsBot ? (p === 'p1' ? 'เด็คของเรา' : 'เด็คของบอท') : `เด็คผู้เล่น ${p === 'p1' ? '1' : '2'}`, pick[p], (id) => setPick({ ...pick, [p]: id })),
              )}
        </div>
        {vsBot && (
          <div>
            <div className="mb-2 text-sm font-bold text-slate-300">ความเก่งของบอท</div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 6 }, (_, i) => (
                <button key={i} type="button" title={`★${i + 1}`} onClick={() => setLevel(i + 1)} className="text-3xl transition hover:scale-110">
                  <Icon name="star" className={i < level ? (i === 5 ? 'fill-rose-400 text-rose-400' : 'fill-yellow-300 text-yellow-300') : 'text-slate-600'} />
                </button>
              ))}
              <span className="ml-2 text-sm text-slate-300">★{level}{level === 6 ? ' · คิดล่วงหน้า (ยากที่สุด)' : level === 5 ? ' · เต็มที่' : ''}</span>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN.secondary} onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className={`${BTN.primary} px-8`} onClick={() => (vsBot ? startVsBot(pick, { level, ...(partnerPick ? { partners: partnerPick } : {}) }) : startLocal(pick))}>
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
  const [vsBot, setVsBot] = useState(false);
  const [solo, setSolo] = useState(false);
  const [sound, setSound] = useState(sfxSettings());
  const [settings, setSettings] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const tutorialLeft = useTutorial((s) => LESSONS.some((l) => !s.progress.done.includes(l.id)));

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
          <MenuItem title="SOLO" sub="เนื้อเรื่อง · บทเรียน · ดวลกับบอท" onClick={() => setScreen('solo')} badge={tutorialLeft ? 'NEW' : undefined} />
          <MenuItem title="DECK" sub="เด็คของฉัน · จัดเด็ค · ของตกแต่ง" onClick={() => setScreen('mydeck')} />
          {!onlineAvailable && <p className="mt-1 text-xs text-amber-300/80">ยังไม่ได้ตั้งค่า Firebase: ดวลออนไลน์ไม่ได้</p>}
        </nav>

        <div className="pl-6">
          <NewsBanner />
        </div>
      </div>

      {/* มุมขวาบน */}
      <div className="absolute top-5 right-6 flex items-center gap-2">
        {/* เลขเวอร์ชัน (กดดู Changelog) */}
        <VersionBadge />
        {/* ช่องทางคอมมูนิตี้ (Discord) */}
        <a
          href={COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 items-center gap-1.5 rounded-full border border-indigo-300/50 bg-indigo-500/20 px-3 text-xs font-bold text-indigo-100 hover:bg-indigo-500/35 hover:text-white"
          title="เข้าร่วมคอมมูนิตี้ Discord"
        >
          <Icon name="chat" className="text-base" />
          Discord
        </a>
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
        <button
          type="button"
          onClick={() => setSettings(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/40 bg-black/50 text-sky-100 hover:text-white"
          title="ตั้งค่า (กราฟิก / เสียง / การเล่น)"
        >
          <Icon name="settings" />
        </button>
      </div>

      {solo && (
        <SoloMenu
          tutorialLeft={tutorialLeft}
          onClose={() => setSolo(false)}
          onTutorial={() => {
            setSolo(false);
            setTutorial(true);
          }}
          onBot={() => {
            setSolo(false);
            setVsBot(true);
          }}
        />
      )}
      {vsBot && <LocalSetup vsBot onClose={() => setVsBot(false)} />}
      {tutorial && <TutorialMenu onClose={() => setTutorial(false)} />}
      <TutorialWelcome />
      {settings && (
        <SettingsDialog
          onClose={() => {
            setSettings(false);
            setSound(sfxSettings());
          }}
        />
      )}
    </div>
  );
}
