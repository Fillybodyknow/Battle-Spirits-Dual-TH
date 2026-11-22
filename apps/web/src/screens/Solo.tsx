/**
 * โหมด SOLO: หน้าแรก (แนะนำ / เล่นล่าสุด / STORIES / ฝึกฝน) → รายการด่าน → ฉากเปิดการ์ด → แผนที่ด่าน → เนื้อเรื่อง / ดวลกับบอท
 * ข้อมูลด่าน: solo/gates.ts · ความคืบหน้า: solo/progress.ts
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BTN } from '../components/Modal';
import { Icon, type IconName } from '../components/Icon';
import { startVsBot } from '../bot/vsBot';
import { deckChoices, deckInfo, newDeckId, saveMyDeck, type DeckId } from '../decks';
import { CardDetail } from '../components/CardDetail';
import { AvatarImg } from '../components/AccountDialog';
import { coverOf } from '../components/SeatAvatar';
import { useAccount } from '../account/account';
import { sfx } from '../sfx';
import { db, playableDecks, useGame } from '../store';
import { GATES, gateById, SENGOKU_REALMS, type Gate, type GateNode } from '../solo/gates';
import { emblemEarned, gateCleared, gateComplete, gateUnlocked, markCleared, nextNode, nodeCleared, nodeUnlocked, openGate, useSolo } from '../solo/progress';
import { TutorialMenu } from '../tutorial/TutorialMenu';
import { LocalSetup, SoloMenu } from './Home';
import { CardArt, DeckTile } from './shared';
import { startTutorial, useTutorial } from '../tutorial/tutorial';
import { addExp } from '../progression/level';
import { LESSONS } from '../tutorial/lessons';

export function Solo() {
  const view = useSolo((s) => s.view);
  const intro = useSolo((s) => s.intro);
  const reading = useSolo((s) => s.reading);
  return (
    <div className="game-bg relative flex h-screen min-w-[1200px] flex-col overflow-hidden">
      {view === 'home' ? <SoloHome /> : view === 'stories' ? <Stories /> : <GateMap />}
      {view === 'gate' && intro && <GateIntro />}
      {view === 'gate' && reading && <Reader />}
    </div>
  );
}

/** แถบบน: ปุ่มย้อนกลับ + ชื่อหน้า */
function TopBar({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="relative z-10 flex h-16 shrink-0 items-center gap-4 border-b border-white/15 px-6">
      <button
        type="button"
        aria-label="ย้อนกลับ"
        onClick={() => {
          sfx('click');
          onBack();
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-lime-300/80 text-2xl text-lime-300 transition hover:scale-105 hover:bg-lime-300/10"
      >
        <Icon name="back" />
      </button>
      <div className="text-2xl font-black text-white">{title}</div>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

/** ภาพหน้าปกของด่าน (ครอปจากภาพการ์ด) */
function Cover({ cardNo, className = '' }: { cardNo: string; className?: string }) {
  return (
    <div className={`${className.includes('absolute') ? '' : 'relative'} overflow-hidden ${className}`}>
      {/* ครอปส่วนบนของภาพวาด (หัวตัวละคร) ไม่ใช่กลางการ์ด · ขยาย 118% ตัดกรอบข้าง/กรอบคอสต์ของการ์ดออก */}
      <CardArt cardNo={cardNo} className="absolute top-0 left-1/2 h-full w-[118%] max-w-none -translate-x-1/2 rounded-none object-cover object-[50%_17%]" />
    </div>
  );
}

/** ตราแคว้น (หกเหลี่ยมสีของแคว้น · ยังไม่ได้ = โครงจาง) */
function EmblemMark({ color, earned, className = '', title }: { color: string; earned: boolean; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-label={title}>
      {title && <title>{title}{earned ? '' : ' (ยังไม่ได้)'}</title>}
      <polygon
        points="12,2 21,7 21,17 12,22 3,17 3,7"
        fill={earned ? color : 'transparent'}
        stroke={earned ? '#fff' : color}
        strokeOpacity={earned ? 0.9 : 0.55}
        strokeWidth={earned ? 1.5 : 2}
        style={earned ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}
      />
    </svg>
  );
}

/** การ์ดด่าน (หัวชื่อ + ภาพ + เครื่องหมายผ่าน) */
function GateTile({ gate, onClick, selected, className = '' }: { gate: Gate; onClick: () => void; selected?: boolean; className?: string }) {
  const progress = useSolo((s) => s.progress);
  const cleared = gateCleared(progress, gate);
  const open = gateUnlocked(progress, gate);
  return (
    <button
      type="button"
      onClick={() => {
        sfx('click');
        onClick();
      }}
      onMouseEnter={() => sfx('hover')}
      className={`group relative flex flex-col overflow-hidden rounded-lg border-2 bg-slate-900 text-left transition hover:-translate-y-0.5 ${open ? '' : 'grayscale-[0.7]'} ${
        selected ? 'border-lime-300 shadow-[0_0_22px_rgba(190,242,100,0.65)]' : 'border-white/25 hover:border-white/60'
      } ${className}`}
    >
      <div className="z-10 flex items-center gap-2 truncate bg-black/85 px-3 py-1.5 text-base font-bold text-white">
        {gate.emblem && <EmblemMark color={gate.emblem.color} earned={cleared} className="h-4 w-4" />}
        <span className="truncate">{gate.title}</span>
      </div>
      <Cover cardNo={gate.cardNo} className={`flex-1 ${open ? '' : 'opacity-50'}`} />
      {!open && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/75 py-1.5 text-sm font-bold text-slate-200">
          <Icon name="lock" /> {gate.soon && !gate.requires ? 'เร็ว ๆ นี้' : 'ต้องได้ตราแคว้นครบ 6'}
        </div>
      )}
      {cleared && (
        <div className="absolute right-1.5 bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-lg text-white shadow ring-2 ring-black/60">
          <Icon name="check" />
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- หน้าแรก SOLO

function SoloHome() {
  const progress = useSolo((s) => s.progress);
  const tutorialLeft = useTutorial((s) => LESSONS.some((l) => !s.progress.done.includes(l.id)));
  const [menu, setMenu] = useState<null | 'training' | 'tutorial' | 'bot'>(null);
  const playable = GATES.filter((g) => gateUnlocked(progress, g));
  const recommended = playable.filter((g) => !gateCleared(progress, g)).slice(0, 2);
  const rec = recommended.length > 0 ? recommended : playable.slice(0, 2);
  const last = progress.last ? gateById(progress.last) : null;
  return (
    <>
      <TopBar title="Solo Mode" onBack={() => useGame.getState().setScreen('home')} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-10">
        <div className="flex w-full max-w-6xl gap-6">
          <section className="flex-[2] rounded-2xl border border-fuchsia-400/40 bg-fuchsia-950/40 p-4">
            <div className="mb-2 text-lg font-bold text-white">แนะนำ</div>
            <div className="flex gap-4">
              {rec.map((g) => (
                <GateTile key={g.id} gate={g} className="h-56 flex-1" onClick={() => openGate(g.id, true)} />
              ))}
            </div>
          </section>
          <section className="flex-1 rounded-2xl border border-white/20 bg-slate-900/50 p-4">
            <div className="mb-2 text-lg font-bold text-white">เล่นล่าสุด</div>
            {last ? (
              <GateTile gate={last} className="h-56 w-full" onClick={() => openGate(last.id, false)} />
            ) : (
              <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-white/20 text-sm text-slate-400">ยังไม่ได้เล่นด่านไหน</div>
            )}
          </section>
        </div>
        <div className="flex w-full max-w-5xl gap-6">
          <BigTile title="STORIES" sub="เนื้อเรื่อง · ด่านดวลกับคู่แข่งประจำด่าน" cardNo="SD32-X02" onClick={() => useSolo.setState({ view: 'stories' })} />
          <BigTile title="ฝึกฝน" sub="บทเรียนพื้นฐาน · ดวลกับบอทแบบอิสระ" cardNo="BS31-X01" onClick={() => setMenu('training')} badge={tutorialLeft ? 'NEW' : undefined} />
        </div>
      </div>
      {menu === 'training' && <SoloMenu tutorialLeft={tutorialLeft} onClose={() => setMenu(null)} onTutorial={() => setMenu('tutorial')} onBot={() => setMenu('bot')} />}
      {menu === 'tutorial' && <TutorialMenu onClose={() => setMenu(null)} />}
      {menu === 'bot' && <LocalSetup vsBot onClose={() => setMenu(null)} />}
    </>
  );
}

function BigTile({ title, sub, cardNo, onClick, badge }: { title: string; sub: string; cardNo: string; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx('click');
        onClick();
      }}
      onMouseEnter={() => sfx('hover')}
      className="group relative flex h-40 flex-1 flex-col overflow-hidden rounded-lg border-2 border-white/25 text-left transition hover:-translate-y-0.5 hover:border-lime-300 hover:shadow-[0_0_22px_rgba(190,242,100,0.5)]"
    >
      <div className="z-10 flex items-center gap-2 bg-black/85 px-3 py-1.5">
        <span className="text-xl font-black text-white">{title}</span>
        {badge && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">{badge}</span>}
      </div>
      {cardNo && <Cover cardNo={cardNo} className="flex-1 opacity-80 transition group-hover:opacity-100" />}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pt-6 pb-2 text-sm text-slate-200">{sub}</div>
    </button>
  );
}

// ---------------------------------------------------------------- รายการด่าน

function Stories() {
  const gateId = useSolo((s) => s.gateId);
  const progress = useSolo((s) => s.progress);
  const gate = gateById(gateId) ?? GATES[0]!;
  const done = gate.nodes.filter((n) => nodeCleared(progress, gate, n)).length;
  return (
    <>
      <TopBar title="Stories" onBack={() => useSolo.setState({ view: 'home' })} />
      <div className="flex min-h-0 flex-1 gap-6 px-10 py-6">
        <div className="flex min-h-0 flex-[1.15] flex-col gap-4 overflow-y-auto pr-2">
          {(['sengoku', 'special'] as const).map((era) => (
            <section key={era}>
              <div className="mb-2 flex items-center gap-3">
                <div className="text-lg font-black text-white">{era === 'sengoku' ? 'ยุคสมัยแห่งเซ็นโงคุ' : 'ด่านพิเศษ'}</div>
                {era === 'sengoku' && (
                  <div className="ml-auto flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs text-slate-300" title="ตราแคว้น: ผ่านเป้าหมายของแต่ละแคว้น">
                    ตราแคว้น
                    {SENGOKU_REALMS.map((id) => {
                      const g = gateById(id);
                      return g?.emblem ? <EmblemMark key={id} color={g.emblem.color} earned={emblemEarned(progress, g)} className="h-5 w-5" title={g.emblem.name} /> : null;
                    })}
                    <b className="ml-1 text-white">{SENGOKU_REALMS.filter((id) => { const g = gateById(id); return !!g && emblemEarned(progress, g); }).length}/6</b>
                  </div>
                )}
              </div>
              <div className="grid auto-rows-[11rem] grid-cols-3 gap-4">
                {GATES.filter((g) => (g.era ?? 'special') === era).map((g) => (
                  <GateTile key={g.id} gate={g} selected={g.id === gate.id} onClick={() => useSolo.setState({ gateId: g.id })} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <Cover cardNo={gate.cardNo} className="h-52 shrink-0 rounded-xl border border-white/20" />
          <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-black/50 ring-1 ring-white/10">
            <div className="flex items-center gap-2 bg-gradient-to-r from-slate-300/90 to-transparent px-3 py-1.5 font-bold text-slate-900">
              <Icon name="book" /> {gate.title}
              <span className="ml-auto pr-2 text-xs font-bold text-slate-700">
                ผ่านแล้ว {done}/{gate.nodes.length}
                {gateComplete(progress, gate) ? ' · ครบทุกโหนด' : ''}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-slate-200">{gate.description}</div>
          </div>
          <button
            type="button"
            disabled={!gateUnlocked(progress, gate)}
            className="h-14 shrink-0 rounded-xl bg-gradient-to-b from-lime-200 to-lime-400 text-2xl font-black text-slate-900 shadow-[0_0_24px_rgba(190,242,100,0.5)] transition hover:brightness-110 disabled:from-slate-500 disabled:to-slate-600 disabled:text-slate-300 disabled:shadow-none"
            onClick={() => {
              sfx('click');
              openGate(gate.id, true);
            }}
          >
            {gateUnlocked(progress, gate) ? 'เล่น' : gate.soon && !gate.requires ? 'เร็ว ๆ นี้' : 'ต้องได้ตราแคว้นครบ 6'}
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- ฉากเปิดการ์ด

function GateIntro() {
  const gate = gateById(useSolo((s) => s.gateId));
  useEffect(() => {
    const t = setTimeout(() => useSolo.setState({ intro: false }), 2400);
    return () => clearTimeout(t);
  }, []);
  if (!gate) return null;
  return (
    <div className="absolute inset-0 z-40 flex cursor-pointer items-center justify-center overflow-hidden bg-slate-950/95" onClick={() => useSolo.setState({ intro: false })}>
      <div className="absolute h-[140%] w-[140%]" style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.45), rgba(76,29,149,0.25) 35%, transparent 65%)', animation: 'solo-intro-glow 2.4s ease-out both' }} />
      <div style={{ animation: 'solo-card-in 2.4s cubic-bezier(.2,.8,.2,1) both' }}>
        <CardArt cardNo={gate.cardNo} className="h-[26rem] w-auto rounded-2xl shadow-[0_0_60px_rgba(165,180,252,0.6)]" />
      </div>
      <div className="absolute bottom-10 text-3xl font-black tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]" style={{ animation: 'fx-slide-up 0.6s 0.9s ease-out both' }}>
        {gate.title}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- แผนที่ด่าน

const NODE_W = 150;
const NODE_H = 170;
const GAP_X = 50;
const GAP_Y = 70;
const KIND: Record<GateNode['kind'], { label: string; icon: IconName }> = {
  scenario: { label: 'เนื้อเรื่อง', icon: 'book' },
  practice: { label: 'ฝึกซ้อม', icon: 'cap' },
  duel: { label: 'ดวล', icon: 'swords' },
  goal: { label: 'เป้าหมาย', icon: 'book' },
  locked: { label: 'ล็อก', icon: 'lock' },
};

function GateMap() {
  const gate = gateById(useSolo((s) => s.gateId));
  const progress = useSolo((s) => s.progress);
  const picked = useSolo((s) => s.panel);
  const setPicked = (panel: string | null) => useSolo.setState({ panel });
  const mapRef = useRef<HTMLDivElement>(null);
  const myAvatar = useAccount((s) => s.avatar) || coverOf();
  // เปิดแผงด่าน: แผนที่หดไปทางซ้าย → เลื่อนให้โหนดที่เลือกอยู่กลางแผนที่
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => mapRef.current?.querySelector(`[data-node="${picked}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 320);
    return () => clearTimeout(t);
  }, [picked]);
  if (!gate) return null;
  const pos = (n: GateNode) => ({ x: n.col * (NODE_W + GAP_X), y: n.row * (NODE_H + GAP_Y) });
  const width = Math.max(...gate.nodes.map((n) => pos(n).x)) + NODE_W;
  const height = NODE_H * 2 + GAP_Y;
  const here = nextNode(progress, gate);
  // ตำแหน่งของเรา (รูปโปรไฟล์หกเหลี่ยม): โหนดที่ต้องเล่นต่อ · ผ่านครบแล้ว = โหนดสุดท้ายที่ผ่าน
  const at = here ?? [...gate.nodes].reverse().find((n) => nodeCleared(progress, gate, n)) ?? null;
  const node = picked ? gate.nodes.find((n) => n.id === picked) : null;
  const open = (n: GateNode) => {
    if (!nodeUnlocked(progress, gate, n) || n.kind === 'locked') return;
    sfx('click');
    if (n.kind === 'scenario' || n.kind === 'goal') {
      setPicked(null);
      useSolo.setState({ reading: n.id });
    } else setPicked(n.id === picked ? null : n.id);
  };
  return (
    <>
      <TopBar
        title={gate.title}
        onBack={() => (picked ? setPicked(null) : useSolo.setState({ view: 'stories' }))}
        right={
          <div className="text-sm text-slate-300">
            ผ่านแล้ว {gate.nodes.filter((n) => nodeCleared(progress, gate, n)).length}/{gate.nodes.length}
          </div>
        }
      />
      <div className="absolute inset-0 top-16 opacity-25">
        <Cover cardNo={gate.cardNo} className="h-full w-full blur-sm" />
      </div>
      <div className="relative flex min-h-0 flex-1">
        {/* แผนที่ (เลือกโหนดดวล = หดไปทางซ้าย เลื่อนดูได้) */}
        <div ref={mapRef} className={`flex items-center overflow-x-auto overflow-y-hidden transition-[width] duration-300 ${node ? 'w-[44%]' : 'w-full'}`} onClick={() => setPicked(null)}>
          <div className="relative mx-auto shrink-0 px-16" style={{ width: width + 128, height }}>
            <svg className="absolute inset-y-0 left-16 overflow-visible" width={width} height={height}>
              {gate.nodes.flatMap((n) =>
                (n.after ?? []).map((id) => {
                  const prev = gate.nodes.find((x) => x.id === id);
                  if (!prev) return null;
                  const a = pos(prev);
                  const b = pos(n);
                  const lit = nodeCleared(progress, gate, prev);
                  const x1 = a.x + NODE_W;
                  const y1 = a.y + (a.y > b.y ? 0 : a.y < b.y ? NODE_H : NODE_H / 2);
                  const x2 = b.x;
                  const y2 = b.y + NODE_H / 2;
                  const sameCol = prev.col === n.col;
                  return (
                    <line
                      key={`${id}-${n.id}`}
                      x1={sameCol ? a.x + NODE_W / 2 : x1}
                      y1={sameCol ? (a.y > b.y ? a.y : a.y + NODE_H) : y1}
                      x2={sameCol ? b.x + NODE_W / 2 : x2}
                      y2={sameCol ? (a.y > b.y ? b.y + NODE_H : b.y) : y2}
                      stroke={lit ? '#d9f99d' : '#475569'}
                      strokeWidth={8}
                      strokeLinecap="round"
                      style={lit ? { filter: 'drop-shadow(0 0 6px rgba(190,242,100,0.8))' } : undefined}
                    />
                  );
                }),
              )}
            </svg>
            {gate.nodes.map((n) => {
              const p = pos(n);
              const unlocked = nodeUnlocked(progress, gate, n);
              const cleared = nodeCleared(progress, gate, n);
              const k = KIND[n.kind];
              const playable = unlocked && n.kind !== 'locked';
              const fight = n.kind === 'duel' || n.kind === 'practice';
              const selected = picked === n.id;
              return (
                <button
                  key={n.id}
                  data-node={n.id}
                  type="button"
                  disabled={!playable}
                  onClick={(e) => {
                    e.stopPropagation();
                    open(n);
                  }}
                  onMouseEnter={() => playable && sfx('hover')}
                  className={`absolute flex flex-col overflow-hidden rounded-lg border-[3px] bg-slate-900/95 text-left transition ${
                    selected
                      ? 'z-10 -translate-y-1 border-white shadow-[0_0_30px_rgba(255,255,255,0.75)]'
                      : unlocked
                        ? 'border-lime-300 shadow-[0_0_16px_rgba(190,242,100,0.45)]'
                        : 'border-slate-600 opacity-60'
                  } ${playable && !selected ? 'hover:-translate-y-1 hover:shadow-[0_0_26px_rgba(190,242,100,0.8)]' : playable ? '' : 'cursor-default'}`}
                  style={{ left: p.x + 64, top: p.y, width: NODE_W, height: NODE_H }}
                >
                  {/* พื้นหลังจาง ๆ = รูปคู่แข่งของด่าน */}
                  {fight && unlocked && (
                    <div className="absolute inset-0 overflow-hidden opacity-35">
                      <CardArt cardNo={n.avatar ?? gate.cardNo} className="absolute top-[-6%] left-1/2 w-[175%] max-w-none -translate-x-1/2 rounded-none" />
                    </div>
                  )}
                  <div className="relative flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-900 px-2.5 py-1 text-base font-bold text-white">
                    <span>{n.kind === 'locked' && unlocked ? 'เปิดแล้ว' : k.label}</span>
                    {n.kind === 'goal' && <Icon name="flag" className="text-lime-200" />}
                  </div>
                  {n.stars ? (
                    <div className="relative flex items-center gap-1 px-2.5 pt-1 text-lg font-black text-yellow-300">
                      <Icon name="star" className={n.stars >= 6 ? 'fill-rose-400 text-rose-400' : 'fill-yellow-300'} /> {n.stars}
                    </div>
                  ) : (
                    <div className="h-8" />
                  )}
                  <div className={`relative flex flex-1 items-center justify-center text-6xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${unlocked ? 'text-sky-100' : 'text-slate-500'}`}>
                    <Icon name={unlocked || n.kind === 'locked' ? k.icon : 'lock'} />
                  </div>
                  {cleared && (
                    <div className={`absolute right-1.5 bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full text-lg text-white ring-2 ring-black/60 ${fight ? 'bg-orange-500' : 'bg-yellow-400 text-slate-900'}`}>
                      <Icon name="check" />
                    </div>
                  )}
                  {here?.id === n.id && (
                    <div className="absolute top-9 left-1/2 -translate-x-1/2 rounded-full bg-lime-300 px-2 py-0.5 text-[11px] font-black text-slate-900 shadow" style={{ animation: 'aura-pulse 1.4s ease-in-out infinite' }}>
                      ถัดไป
                    </div>
                  )}
                </button>
              );
            })}
            {at && (
              <HexAvatar
                cardNo={myAvatar}
                className="pointer-events-none absolute z-20 h-16 w-16 drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]"
                style={{ left: pos(at).x + 64 - 22, top: pos(at).y + NODE_H - 50 }}
              />
            )}
          </div>
        </div>
        {node && <DuelPanel key={node.id} gate={gate} node={node} onClose={() => setPicked(null)} />}
      </div>
    </>
  );
}

/** รูปโปรไฟล์ของเราในกรอบหกเหลี่ยม (บอกตำแหน่งบนแผนที่ด่าน) */
function HexAvatar({ cardNo, className = '', style }: { cardNo: string; className?: string; style?: React.CSSProperties }) {
  const hex = 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)';
  return (
    <div className={className} style={style}>
      <div className="h-full w-full bg-gradient-to-b from-amber-100 to-amber-500 p-[3px]" style={{ clipPath: hex }}>
        <div className="h-full w-full" style={{ clipPath: hex }}>
          <AvatarImg cardNo={cardNo} className="h-full w-full bg-slate-900" />
        </div>
      </div>
    </div>
  );
}

/** แผงด่านดวล (ด้านขวาของแผนที่): ภาพคู่แข่ง คำอธิบาย ดูเด็คคู่แข่ง เลือกเด็ค (ยืม / ของฉัน) ความยาก และปุ่มเริ่มดวล */
function DuelPanel({ gate, node, onClose }: { gate: Gate; node: GateNode; onClose: () => void }) {
  const progress = useSolo((s) => s.progress);
  const cleared = nodeCleared(progress, gate, node);
  const practice = node.kind === 'practice';
  const loaner = node.playerDeck ?? 'sd01';
  const [tab, setTabState] = useState<'loaner' | 'mine'>(lastTab);
  const setTab = (t: 'loaner' | 'mine') => {
    lastTab = t;
    setTabState(t);
  };
  const mine = soloDeck();
  const mineOk = !!mine && playableDecks().includes(mine);
  const [deckMenu, setDeckMenu] = useState(false);
  const [viewDeck, setViewDeck] = useState(false);
  const useLoaner = tab === 'loaner' || practice;
  const deck = useLoaner ? loaner : (mine ?? loaner);
  const canStart = useLoaner || mineOk;
  const botDeck = node.botDeck ?? 'sd02';
  const opponent = node.opponent ?? 'คู่แข่ง';
  const stars = node.stars ?? 3;
  const start = () => {
    sfx('click');
    const gateId = gate.id;
    startVsBot(
      { p1: deck, p2: botDeck },
      {
        level: stars,
        botName: opponent,
        botAvatar: node.avatar ?? gate.cardNo,
        story: true,
        // ชนะครั้งแรก = EXP โบนัส
        ...(cleared ? {} : { firstClearBonus: 100 }),
        onEnd: (won) => {
          if (won) markCleared(gateId, node.id);
        },
        exit: {
          label: 'กลับไปที่ด่าน',
          run: () => {
            useSolo.setState({ view: 'gate', gateId, intro: false, reading: null });
            useGame.getState().setScreen('solo');
          },
        },
      },
    );
  };
  return (
    <div className="relative z-20 flex min-w-0 flex-1 flex-col border-l border-white/15 bg-slate-950/92 shadow-[-20px_0_40px_rgba(0,0,0,0.5)]" style={{ animation: 'solo-panel-in 0.3s ease-out both' }}>
      <div className="flex h-16 shrink-0 items-center gap-4 border-b border-white/10 px-8">
        <div className="text-2xl font-black text-white">{node.title ?? KIND[node.kind].label}</div>
        {cleared && <div className="ml-auto text-3xl font-black tracking-wide text-yellow-300 italic drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]">ผ่านแล้ว!!</div>}
        <button
          type="button"
          aria-label="ปิด"
          onClick={() => {
            sfx('click');
            onClose();
          }}
          className={`${cleared ? '' : 'ml-auto'} flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-xl text-slate-200 hover:bg-white/10`}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_19rem] gap-7 overflow-y-auto p-7">
        <div className="min-w-0">
          {/* ภาพคู่แข่ง + คำใหญ่ DUEL / PRACTICE */}
          <div className="relative h-52 overflow-hidden rounded-xl ring-1 ring-white/20">
            <Cover cardNo={node.avatar ?? gate.cardNo} className="absolute inset-0" />
            {/* ฝึกซ้อม = โทนเขียว · ดวล = โทนฟ้า */}
            <div className={`absolute inset-0 bg-gradient-to-r ${practice ? 'from-emerald-950/90 via-emerald-900/55' : 'from-slate-950/85 via-sky-950/45'} to-transparent`} />
            <div
              className={`absolute top-1/2 left-6 -translate-y-1/2 font-black tracking-tight text-white/95 italic ${
                practice ? '[text-shadow:0_0_18px_rgba(52,211,153,0.9),0_4px_0_rgba(2,44,34,0.9)]' : '[text-shadow:0_0_18px_rgba(125,211,252,0.85),0_4px_0_rgba(15,23,42,0.9)]'
              }`}
            >
              {practice && <div className="-mb-3 pl-1 text-4xl">Practice</div>}
              <div className="text-7xl">DUEL</div>
            </div>
            <div className="absolute bottom-3 left-6 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm text-slate-200">
              คู่แข่ง <b className="text-white">{opponent}</b>
            </div>
          </div>
          <p className="mt-5 text-lg leading-relaxed whitespace-pre-line text-slate-200">{node.description ?? `${opponent} ใช้เด็ค ${deckInfo(botDeck).label}`}</p>
        </div>
        {node.lesson ? (
          // ฝึกซ้อมแบบบทเรียน: สอนเด็คของแคว้นทีละขั้นบนกระดานจริง (ตัวรันเดียวกับ TUTORIAL)
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-800/70 p-4">
              <div className="rounded bg-yellow-300 px-2 py-0.5 text-xs font-black text-slate-900">บทเรียน</div>
              <div className="text-sm font-bold text-slate-300">เด็คที่ใช้ในบทเรียน</div>
              <DeckTile id={loaner} small selected onClick={() => {}} />
              <p className="text-center text-xs leading-relaxed text-slate-400">ทำตามขั้นตอนบนกระดาน (จุดที่มีกรอบเหลือง) · ออกกลางคันได้ทุกเมื่อ</p>
              <button
                type="button"
                onClick={() => {
                  sfx('click');
                  const gateId = gate.id;
                  const first = !cleared;
                  startTutorial(node.lesson!, {
                    onDone: () => {
                      markCleared(gateId, node.id);
                      if (first) addExp(`story-lesson-${gateId}-${node.id}`, 100, 'ผ่านบทเรียนของด่านครั้งแรก');
                    },
                    exit: {
                      label: 'กลับไปที่ด่าน',
                      run: () => {
                        useSolo.setState({ view: 'gate', gateId, intro: false, reading: null });
                        useGame.getState().setScreen('solo');
                      },
                    },
                  });
                }}
                className="mt-1 w-full rounded-lg bg-gradient-to-b from-lime-200 to-lime-400 py-3.5 text-2xl font-black text-slate-900 shadow-[0_0_22px_rgba(190,242,100,0.6)] transition hover:brightness-110 active:scale-[0.98]"
              >
                เริ่มบทเรียน
              </button>
            </div>
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => {
              sfx('click');
              setViewDeck(true);
            }}
            className="flex items-center justify-between border-2 border-white/70 bg-black/40 px-4 py-3 text-left text-base font-bold text-white transition hover:bg-white/10"
          >
            ดูเด็คคู่แข่ง
            <Icon name="chevron" />
          </button>
          <div className="flex flex-col rounded-xl bg-slate-800/70 p-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(['loaner', 'mine'] as const).map((t) => {
                const disabled = t === 'mine' && practice;
                const on = (practice ? 'loaner' : tab) === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      sfx('click');
                      setTab(t);
                    }}
                    className={`rounded-t-md border-b-4 py-2 text-base font-black transition ${
                      on ? 'border-lime-300 bg-lime-300 text-slate-900' : 'border-lime-300/60 bg-slate-900 text-white hover:bg-slate-700'
                    } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    {t === 'loaner' ? 'เด็คยืม' : 'เด็คของฉัน'}
                  </button>
                );
              })}
            </div>
            {practice || tab === 'loaner' ? (
              <div className="flex flex-col items-center gap-1 rounded-lg bg-black/30 py-3">
                <div className="text-sm font-bold text-slate-300">เด็คที่ด่านให้ยืม{practice ? ' (ฝึกซ้อมใช้ได้เท่านั้น)' : ''}</div>
                <DeckTile id={loaner} small selected onClick={() => {}} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 rounded-lg bg-black/30 py-3">
                <div className="text-sm font-bold text-slate-300">เด็คของฉัน · แตะเพื่อแก้ไข/เปลี่ยนเด็ค</div>
                {mine ? (
                  <div className="relative">
                    <DeckTile id={mine} small selected={mineOk} onClick={() => (sfx('click'), setDeckMenu(true))} />
                    {!mineOk && (
                      <div className="pointer-events-none absolute inset-x-0 top-1/3 bg-white py-1 text-center text-xs font-black text-rose-600 shadow">ใช้ไม่ได้ (เด็คไม่ครบกติกา)</div>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => (sfx('click'), pickSoloDeck())} className="flex h-40 w-32 items-center justify-center rounded-xl border-2 border-dashed border-white/30 text-sm font-bold text-slate-300 hover:border-white/60">
                    เลือกเด็ค
                  </button>
                )}
              </div>
            )}
            <div className="mt-3 flex items-center justify-center gap-2 text-base font-bold text-slate-200">
              ความยาก
              <span className="flex gap-0.5 text-xl">
                {Array.from({ length: stars }, (_, i) => (
                  <Icon key={i} name="star" className={i === 5 ? 'fill-rose-400 text-rose-400' : 'fill-yellow-300 text-yellow-300'} />
                ))}
              </span>
            </div>
            <button
              type="button"
              onClick={start}
              disabled={!canStart}
              className="mt-3 rounded-lg bg-gradient-to-b from-lime-200 to-lime-400 py-3.5 text-2xl font-black text-slate-900 shadow-[0_0_22px_rgba(190,242,100,0.6)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              เริ่มดวล
            </button>
          </div>
        </div>
        )}
      </div>
      {viewDeck && <OpponentDeck deck={botDeck} name={opponent} description={node.deckDescription} onClose={() => setViewDeck(false)} />}
      {deckMenu && mine && <SoloDeckMenu deck={mine} onClose={() => setDeckMenu(false)} />}
    </div>
  );
}

/** แท็บที่เลือกล่าสุดในแผงด่าน (กลับจากหน้าเลือก/แก้เด็คแล้วอยู่แท็บเดิม) */
let lastTab: 'loaner' | 'mine' = 'loaner';
const SOLO_DECK_KEY = 'bs-solo-deck';

/** เด็คของฉันที่เลือกไว้สำหรับโหมด Solo (ไม่มี/ถูกลบ = เด็คที่จัดเองใบแรก หรือ Starter ใบแรก) */
function soloDeck(): DeckId | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SOLO_DECK_KEY);
  } catch {
    /* ไม่มี storage */
  }
  const all = deckChoices();
  if (saved && all.includes(saved)) return saved;
  return all.find((id) => id.startsWith('u:')) ?? all[0] ?? null;
}

/** เปลี่ยนเด็ค: หน้าเด็คของฉันในโหมดเลือก แล้วกลับมาที่แผงด่าน */
function pickSoloDeck() {
  lastTab = 'mine';
  useGame.setState({ deckPick: soloDeck() ?? 'sd01', deckReturn: 'solo' });
  useGame.getState().setScreen('mydeck');
}

/** แก้ไขเด็ค: หน้าจัดเด็ค (Starter = เริ่มจากสำเนา) แล้วกลับมาที่แผงด่าน */
function editSoloDeck(deck: DeckId) {
  lastTab = 'mine';
  useGame.setState({ deckView: deck, deckReturn: 'solo' });
  useGame.getState().setScreen('builder');
}

/** เมนูของเด็คที่เลือก: แก้ไขเด็ค / เปลี่ยนเด็ค / ยกเลิก */
function SoloDeckMenu({ deck, onClose }: { deck: DeckId; onClose: () => void }) {
  const btn = 'w-full rounded-full border-2 border-white/80 bg-black py-3 text-lg font-black text-white transition hover:bg-white/10';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="hud-panel flex w-[min(92vw,34rem)] flex-col items-center gap-4 rounded-2xl p-7" onClick={(e) => e.stopPropagation()}>
        <DeckTile id={deck} small selected={false} onClick={() => {}} />
        <button type="button" className={btn} onClick={() => (sfx('click'), editSoloDeck(deck))}>
          แก้ไขเด็ค
        </button>
        <button type="button" className={btn} onClick={() => (sfx('click'), onClose(), pickSoloDeck())}>
          เปลี่ยนเด็ค
        </button>
        <button type="button" className="w-4/5 rounded-xl border-2 border-lime-300/70 bg-black py-2.5 text-base font-black text-lime-300 hover:bg-lime-300/10" onClick={() => (sfx('click'), onClose())}>
          ยกเลิก
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** ลำดับประเภทการ์ดในรายการเด็ค (สปิริต/อัลติเมท → เบรฟ → เน็กซัส → เมจิค) แล้วเรียงตามคอสต์ */
const TYPE_ORDER: Record<string, number> = { spirit: 0, ultimate: 0, brave: 1, nexus: 2, magic: 3 };

/**
 * หน้าดูเด็คคู่แข่ง (เต็มจอ): ซ้าย = รายละเอียดการ์ดที่ชี้/แตะ · กลาง = การ์ดทุกใบ · ขวา = คำอธิบายเด็ค + คัดลอกเป็นเด็คของฉัน
 */
function OpponentDeck({ deck, name, description, onClose }: { deck: DeckId; name: string; description?: string; onClose: () => void }) {
  const info = deckInfo(deck);
  const entries = [...info.entries].sort((a, b) => {
    const da = db.find(a.cardNo);
    const dbb = db.find(b.cardNo);
    return (TYPE_ORDER[da?.type ?? ''] ?? 9) - (TYPE_ORDER[dbb?.type ?? ''] ?? 9) || (da?.cost ?? 0) - (dbb?.cost ?? 0);
  });
  const cards = entries.flatMap((e) => Array.from({ length: e.count }, () => e.cardNo));
  const [focus, setFocus] = useState(cards[0] ?? '');
  const [copied, setCopied] = useState(false);
  const copy = () => {
    sfx('click');
    saveMyDeck({ id: newDeckId(), name: `${info.label} (คัดลอก)`, entries: info.entries.map((e) => ({ ...e })), updated: Date.now() });
    setCopied(true);
  };
  return createPortal(
    <div className="game-bg fixed inset-0 z-50 flex flex-col" style={{ animation: 'fx-fade-in 0.2s ease-out both' }}>
      <TopBar title="เด็คคู่แข่ง" onBack={onClose} />
      <div className="flex min-h-0 flex-1 gap-5 p-6">
        {focus && <CardDetail cardNo={focus} className="w-[340px]" />}
        <div className="hud-panel flex min-w-0 flex-1 flex-col rounded-xl">
          <div className="border-b border-white/10 px-5 py-3 text-2xl font-black text-white">{info.label}</div>
          <div className="flex items-center gap-4 bg-black/30 px-5 py-2 text-lg font-bold text-slate-200">
            การ์ดในเด็ค <span className="text-white">{cards.length}</span>
          </div>
          <div className="grid grid-cols-10 content-start gap-2 overflow-y-auto p-4">
            {cards.map((no, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setFocus(no)}
                onClick={() => setFocus(no)}
                className={`rounded-md transition hover:-translate-y-0.5 ${focus === no ? 'ring-2 ring-lime-300' : ''}`}
              >
                <CardArt cardNo={no} className="w-full" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex w-[22rem] shrink-0 flex-col gap-4">
          <div className="hud-panel flex flex-1 flex-col rounded-xl p-4">
            <div className="mb-3 bg-black px-4 py-2 text-lg font-black text-white">คำอธิบายเด็ค</div>
            <p className="text-base leading-relaxed whitespace-pre-line text-slate-200">{description ?? `เด็คที่ ${name} ใช้ในด่านนี้`}</p>
          </div>
          <button
            type="button"
            onClick={copy}
            disabled={copied}
            className="rounded-xl border-2 border-white/70 bg-black/60 py-3 text-lg font-black text-white transition hover:bg-white/10 disabled:border-lime-300 disabled:text-lime-300"
          >
            {copied ? 'คัดลอกไปที่เด็คของฉันแล้ว' : 'คัดลอกเด็ค'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- เนื้อเรื่อง

function Reader() {
  const gate = gateById(useSolo((s) => s.gateId));
  const nodeId = useSolo((s) => s.reading);
  const [i, setI] = useState(0);
  const node = gate?.nodes.find((n) => n.id === nodeId);
  if (!gate || !node) return null;
  const lines = node.lines ?? [];
  const finish = () => {
    markCleared(gate.id, node.id);
    useSolo.setState({ reading: null });
  };
  const next = () => {
    sfx('click');
    if (i + 1 >= lines.length) finish();
    else setI(i + 1);
  };
  const line = lines[i];
  return (
    <div className="absolute inset-0 z-40 cursor-pointer" onClick={next}>
      <Cover cardNo={gate.cardNo} className="absolute inset-0 brightness-[0.45]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/60" />
      <div className="absolute top-6 left-8 rounded-full bg-black/60 px-4 py-1 text-sm font-bold text-lime-200 ring-1 ring-lime-300/50">
        {node.kind === 'goal' ? 'เป้าหมาย' : 'เนื้อเรื่อง'} · {node.title}
      </div>
      <button
        type="button"
        className="absolute top-5 right-8 rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold text-white ring-1 ring-white/30 hover:bg-black/80"
        onClick={(e) => {
          e.stopPropagation();
          sfx('click');
          finish();
        }}
      >
        ข้าม ▸▸
      </button>
      {line && (
        <div key={i} className="absolute inset-x-16 bottom-10 rounded-2xl border border-white/20 bg-slate-950/85 px-8 py-6 shadow-2xl" style={{ animation: 'fx-slide-up 0.3s ease-out both' }}>
          {line.speaker && <div className="absolute -top-5 left-6 rounded-lg bg-gradient-to-r from-amber-300 to-yellow-200 px-4 py-1 text-lg font-black text-slate-900 shadow">{line.speaker}</div>}
          <div className={`text-2xl leading-relaxed ${line.speaker ? 'text-white' : 'text-slate-200 italic'}`}>{line.text}</div>
          <div className="mt-3 text-right text-xs text-slate-400">
            {i + 1}/{lines.length} · แตะเพื่อไปต่อ
          </div>
        </div>
      )}
    </div>
  );
}
