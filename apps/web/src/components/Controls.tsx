import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bpOf, cardLevel, currentBp, isSpiritLike, levelOf, minCores, opponentOf, PLAYERS, trashSummonRule, type GameState, type PlayerId } from '@bs/engine';
import { cardName, formatEvent, playerLabel } from '../format';
import {
  actingPlayer,
  blockCandidates,
  controls,
  db,
  draftDepleting,
  EMPTY_MULTI,
  layoutRect,
  flashPlayer,
  isFxBlocking,
  isInlineChoice,
  multiNeedsHost,
  responseOptions,
  simulateEvolve,
  useGame,
  viewPlayer,
} from '../store';
import { CardFace } from './CardFace';
import { ChainTracker, RevealFan } from './Fx';
import { BTN, Modal } from './Modal';
import { TurnBadge } from './StepSelect';

/** ประเภทของสิ่งที่ผู้เล่นต้องทำ: สีเดียวกับกรอบของการ์ดที่ต้องคลิก ใช้เหมือนกันทั้งเกม */
type PromptTag = 'flash' | 'target' | 'block' | 'attack' | 'core' | 'option';
const TAGS: Record<PromptTag, { label: string; chip: string; ring: string; border: string; glow: string; icon: React.ReactNode }> = {
  flash: {
    label: 'FLASH',
    chip: 'bg-cyan-300 text-slate-950',
    ring: 'ring-2 ring-cyan-300',
    border: 'border-cyan-300',
    glow: 'rgba(103, 232, 249, 0.9)',
    icon: <path d="M13.5 2 4 13.5h6.5L9 22l11-12.5h-6.8L13.5 2Z" fill="currentColor" />,
  },
  target: {
    label: 'เลือก',
    chip: 'bg-fuchsia-400 text-slate-950',
    ring: 'ring-2 ring-fuchsia-400',
    border: 'border-fuchsia-400',
    glow: 'rgba(232, 121, 249, 0.85)',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="2.6">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </g>
    ),
  },
  block: {
    label: 'ป้องกัน',
    chip: 'bg-sky-400 text-slate-950',
    ring: 'ring-2 ring-sky-400',
    border: 'border-sky-400',
    glow: 'rgba(56, 189, 248, 0.85)',
    icon: <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="currentColor" />,
  },
  attack: {
    label: 'โจมตี',
    chip: 'bg-amber-400 text-slate-950',
    ring: 'ring-2 ring-amber-400',
    border: 'border-amber-400',
    glow: 'rgba(251, 191, 36, 0.85)',
    icon: <path d="M20 2h2v2L10.5 15.5l2 2-1.5 1.5-2-2-3.5 3.5-2-2L7 15l-2-2 1.5-1.5 2 2L20 2Z" fill="currentColor" />,
  },
  core: {
    label: 'Core',
    chip: 'bg-emerald-400 text-slate-950',
    ring: 'ring-2 ring-emerald-400',
    border: 'border-emerald-400',
    glow: 'rgba(52, 211, 153, 0.85)',
    icon: <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="currentColor" />,
  },
  option: {
    label: 'ตัวเลือก',
    chip: 'bg-violet-400 text-slate-950',
    ring: 'ring-2 ring-violet-400',
    border: 'border-violet-400',
    glow: 'rgba(167, 139, 250, 0.85)',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V15" />
        <circle cx="12" cy="19" r="0.6" fill="currentColor" />
      </g>
    ),
  },
};

function TagChip({ tag }: { tag: PromptTag }) {
  const t = TAGS[tag];
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-black tracking-wider shadow ${t.chip}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
        {t.icon}
      </svg>
      {t.label}
    </span>
  );
}

type PromptAction = { key: string; label: string; onClick: () => void; kind: keyof typeof BTN; disabled: boolean };

/**
 * แถบกลางกระดาน: ที่เดียวของทุกการตัดสินใจ
 *  - แถบ: บรรทัดเดียวเสมอ = ใครต้องทำ · ป้ายประเภท (สี) · คำถามสั้น · ปุ่มไม่เกิน 2 + ปุ่มหลักของสเต็ป
 *  - แผงกางออกจากแถบ (ลอยทับ ไม่ดันกระดาน) ไปทางฝั่งของคนที่ต้องตัดสินใจ: คำถามเต็ม + การ์ดต้นเหตุ + ตัวเลือกเรียงแนวตั้ง
 *    กางเองเมื่อเป็นคำถามแบบตัวเลือก หรือมีปุ่มตั้งแต่ 3 ปุ่ม · ข้อความยาวจนถูกตัด = กดที่คำถามเพื่อกางอ่าน · กด "ซ่อน" เพื่อดูกระดาน
 * การตัดสินใจที่เกี่ยวกับการ์ดบนกระดาน (เลือกเป้าหมาย, ป้องกัน, Evolution, จ่ายคอสต์) ยังคลิกบนกระดานโดยตรง
 */
export function PromptBar() {
  const state = useGame((s) => s.state);
  const selectedCores = useGame((s) => s.selectedCores);
  const evolveCard = useGame((s) => s.evolveCard);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const truth = useGame((s) => s.truth);
  const bottom = useGame(viewPlayer);
  const multi = useGame((s) => s.multi);
  const { dispatch, clearCores, choose, confirmEvolve, closeEvolve, confirmCores, cancelCores, multiNext, multiBack, multiAsSpirit } = useGame.getState();
  const actor = actingPlayer(state);
  const { battle, choice } = state;

  let title: React.ReactNode = '';
  let detail: React.ReactNode = null;
  /** ต้องตัดสินใจ: แถบมีกรอบเรืองแสงสีของประเภท */
  let highlight = false;
  let tag: PromptTag | null = null;
  /** การ์ดต้นเหตุของคำถาม (แสดงในแผงกาง) */
  let source: string | null = null;
  const actions: PromptAction[] = [];
  /** ปุ่มหลักของ Phase (จบ Main / จบ Attack / Pass Flash): ปุ่มกลมใหญ่ที่ปลายขวาของเส้นกลางกระดาน */
  let phaseBtn: { label: string; sub: string; onClick: () => void } | null = null;
  const add = (key: string, label: string, onClick: () => void, kind: keyof typeof BTN = 'primary', disabled = false) =>
    actions.push({ key, label, onClick, kind, disabled });

  const online = useGame((s) => s.online);
  const mine = controls({ online }, actor);
  if (online && online.status !== 'playing') {
    title = 'รอคู่แข่งเข้าห้อง…';
    detail = `ส่งรหัสห้อง ${online.code} ให้เพื่อน`;
  } else if (state.winner && !blocking) {
    title = <span className="text-yellow-300">🏆 {playerLabel(state.winner)} ชนะ!</span>;
  } else if (blocking) {
    // แอนิเมชันเอฟเฟกต์กำลังเล่น: ยังไม่ให้ตัดสินใจ
    title = 'กำลังแสดงเอฟเฟกต์…';
    detail = 'คลิกกระดานเพื่อข้าม';
  } else if (state.awaitingDraw) {
    title = 'Draw Step';
    detail = mine ? 'กดการ์ดที่ลอยขึ้นมาเพื่อจั่ว' : 'รอคู่แข่งจั่วการ์ด…';
  } else if (!mine) {
    // ออนไลน์: ตาของคู่แข่ง
    title = `รอ${actor ? playerLabel(actor) : 'คู่แข่ง'}…`;
    detail = choice ? `กำลังเลือก: ${choice.prompt}` : battle?.flash ? 'Flash Timing ของคู่แข่ง' : battle?.step === 'declareBlock' ? 'คู่แข่งกำลังเลือกการป้องกัน' : 'ตาของคู่แข่ง';
  } else if (evolveCard) {
    // [Evolution]: เลือก Core บนสปิริตอื่นของเรา
    const after = simulateEvolve(state, evolveCard, selectedCores);
    highlight = true;
    tag = 'core';
    source = evolveCard;
    title = `[Evolution] ${cardName(state, evolveCard)}`;
    detail = after
      ? `ย้าย Core ${selectedCores.length} ดวง → Lv${cardLevel(after, db, evolveCard)} · BP ${currentBp(after, db, evolveCard).toLocaleString()}`
      : 'คลิก Core บนสปิริตอื่นของเราที่จะย้ายมาวางบนสปิริตนี้';
    add('cancel', 'ยกเลิก', closeEvolve, 'secondary');
    add('ok', `ย้าย ${selectedCores.length} ดวง`, confirmEvolve, 'primary', !after);
  } else if (choice) {
    highlight = true;
    title = choice.prompt;
    source = choice.sourceId;
    const src = `เอฟเฟกต์ของ ${cardName(state, choice.sourceId)}`;
    if (choice.kind === 'order') {
      tag = 'option';
      detail = `${playerLabel(choice.player)} · เอฟเฟกต์ ${choice.effects.length} อันเกิดพร้อมกัน คลิกอันที่จะทำงานก่อน (ผลเกิดทันที แล้วค่อยเลือกอันถัดไป)`;
    } else if (choice.kind === 'option') {
      tag = 'option';
      detail = src;
      choice.options.forEach((label, i) => add(`opt${i}`, label, () => choose(i)));
    } else if (choice.kind === 'payCost') {
      tag = 'core';
      // อัญเชิญด้วยเอฟเฟกต์ (จ่ายคอสต์): ขั้นที่ 1 จ่าย → ขั้นที่ 2 วาง Core กำหนด Lv
      const summonId = choice.step.do === 'payForSummon' ? choice.step.cardId : null;
      if (summonId) {
        source = summonId;
        title = `อัญเชิญ: จ่ายคอสต์ ${choice.cost}`;
      }
      detail = `${src} · คลิก Core ใน Reserve หรือบนการ์ดเพื่อจ่าย (เลือกแล้ว ${selectedCores.length}/${choice.cost})${summonId ? ' · ถัดไป: วาง Core กำหนด Lv' : ''}`;
      add('skip', 'ไม่จ่าย', () => choose(null), 'secondary');
      add('pay', `จ่าย ${choice.cost}`, () => choose({ pay: selectedCores }), 'primary', selectedCores.length !== choice.cost);
    } else if (choice.kind === 'multiSummon') {
      // อัญเชิญหลายใบจากที่แสดง: เลือกการ์ดจากพัด → วาง Core ทีละใบบนกระดาน → ลงสนามพร้อมกัน
      const m = multi ?? EMPTY_MULTI;
      if (m.phase === 'pick') {
        tag = 'target';
        title = `เลือกการ์ดที่จะอัญเชิญไม่จ่ายคอสต์ (${m.picks.length}${choice.max !== null ? `/${choice.max}` : ''} ใบ)`;
        detail = `${src} · คลิกการ์ดที่แสดงเพื่อเลือก/ยกเลิก · ลงสนามพร้อมกัน`;
        add('skip', 'ไม่อัญเชิญ', () => choose({ summons: [] }), 'secondary');
        add('next', 'ถัดไป: วาง Core', multiNext, 'primary', m.picks.length === 0);
      } else {
        const cur = m.picks[m.index]!;
        source = cur;
        const last = m.index + 1 >= m.picks.length;
        const step = `ใบที่ ${m.index + 1}/${m.picks.length}`;
        add('back', 'ย้อนกลับ', multiBack, 'secondary');
        if (multiNeedsHost(state, m)) {
          tag = 'target';
          title = `${cardName(state, cur)}: คลิกสปิริตที่จะร่วมร่าง (${step})`;
          detail = `${src} · หรือกด "ลงเป็นสปิริต" เพื่อวาง Core เอง`;
          add('spirit', 'ลงเป็นสปิริต', multiAsSpirit, 'primary');
        } else {
          const min = minCores(db.get(state.cards[cur]!.cardNo));
          tag = 'core';
          title = `อัญเชิญ: วาง Core (${step})`;
          detail = `${src} · เลือก ${selectedCores.length} ดวง (ขั้นต่ำ ${min}) · ปรับ Lv ได้ที่แผงมุมสนาม`;
          add('next', last ? `ลงสนาม ${m.picks.length} ใบ` : 'ถัดไป', multiNext, 'primary', selectedCores.length < min);
        }
      }
    } else if (choice.kind === 'placeCores') {
      tag = 'core';
      source = choice.cardId;
      title = 'อัญเชิญ: วาง Core กำหนด Lv';
      detail = `${src} · เลือก ${selectedCores.length} ดวง (ขั้นต่ำ ${choice.min}) · ปรับ Lv ได้ที่แผงมุมสนาม`;
      add('place', `วาง ${selectedCores.length} ดวง`, () => choose({ pay: selectedCores }), 'primary', selectedCores.length < choice.min);
    } else if (isInlineChoice(state)) {
      tag = 'target';
      detail = `${src} · คลิกการ์ดที่เรืองแสงสีชมพู`;
      if (choice.optional) add('skip', choice.skipLabel ?? 'ไม่เลือก', () => choose(null), 'secondary');
    } else {
      tag = 'target';
      detail = choice.revealed ? `${src} · คลิกการ์ดที่เรืองแสงจากที่แสดง` : `${src} · เลือกในหน้าต่าง`;
    }
  } else if (battle?.flash) {
    const fp = battle.flash.priority;
    const o = responseOptions(state, fp);
    highlight = o.magic.length + o.evolve.length + o.quick.length + o.activate.length + o.trash.length > 0;
    tag = 'flash';
    source = battle.attackerId;
    title =
      battle.step === 'flashBeforeBlock'
        ? fp === state.turnPlayer
          ? 'ก่อนคู่แข่งประกาศป้องกัน ใช้การ์ดหรือเอฟเฟกต์ไหม?'
          : 'ถูกโจมตี! ใช้การ์ดหรือเอฟเฟกต์ไหม?'
        : 'ก่อนตัดสินการต่อสู้ ใช้การ์ดหรือเอฟเฟกต์ไหม?';
    const parts = [
      o.magic.length > 0 && `Magic [Flash] บนมือ ${o.magic.length} ใบ`,
      o.quick.length > 0 && `[Quick] บนมือ ${o.quick.length} ใบ`,
      o.evolve.length > 0 && `Evolution บนสนาม ${o.evolve.length} ตัว`,
      o.activate.length > 0 && `เอฟเฟกต์ Flash บนสนาม ${o.activate.length} ใบ`,
      o.trash.length > 0 && `อัญเชิญจากแทรช ${o.trash.length} ใบ`,
    ].filter(Boolean);
    detail = parts.length > 0 ? `ใช้ได้: ${parts.join(' · ')} (การ์ดที่ใช้ได้มีกรอบสีฟ้า) · ไม่ใช้ = กด PASS` : 'ไม่มีการ์ดที่ใช้ได้';
    phaseBtn = { label: 'PASS', sub: 'ไม่ใช้', onClick: () => dispatch({ type: 'passFlash', player: fp }) };
  } else if (battle?.step === 'declareBlock') {
    const candidates = blockCandidates(state);
    highlight = true;
    tag = 'block';
    source = battle.attackerId;
    title =
      battle.blockers.length > 0
        ? 'ป้องกันตัวที่ 2 ด้วยสปิริตตัวไหน?'
        : 'ถูกโจมตี! จะป้องกันด้วยสปิริตตัวไหน?';
    detail = battle.consecutiveBlade
      ? '[Consecutive Blade] ต้องป้องกัน 2 ตัวถ้าทำได้ · คลิกสปิริตที่มีกรอบสีฟ้า'
      : battle.mustBlock
        ? '[True-Rage] ต้องป้องกันถ้าทำได้ · คลิกสปิริตที่มีกรอบสีฟ้า'
        : 'คลิกสปิริตที่มีกรอบสีฟ้าบนสนามเพื่อป้องกัน';
    // ไม่ป้องกัน = คลิกแผง Life ของฝ่ายป้องกัน (ไม่มีปุ่มแล้ว)
    if (!(battle.mustBlock && candidates.length > 0)) {
      detail += battle.blockers.length > 0 ? ' · คลิกแผง Life = ไม่ป้องกันเพิ่ม' : ' · คลิกแผง Life = ไม่ป้องกัน (รับด้วย Life)';
    }
  } else if (truth && state.phase === 'main') {
    // กำลังจัด Core: ยังไม่สูญสลายจนกว่าจะยืนยัน
    const dying = draftDepleting(truth, state);
    highlight = true;
    tag = 'core';
    title = 'กำลังจัด Core';
    detail =
      dying.length > 0
        ? `ถ้ายืนยันตอนนี้ จะสูญสลาย: ${dying.map((id) => cardName(state, id)).join(', ')} · ย้าย Core กลับมาเพิ่มได้ก่อนยืนยัน`
        : 'ลากย้าย Core ได้อิสระ ยังไม่มีการ์ดสูญสลายจนกว่าจะกดยืนยัน (ทำ action อื่นต่อ = ยืนยันอัตโนมัติ)';
    if (selectedCores.length > 0) add('clear', 'ยกเลิกเลือก Core', clearCores, 'secondary');
    add('cancel', 'ยกเลิกการจัด', cancelCores, 'secondary');
    add('ok', dying.length > 0 ? `ยืนยัน (สูญสลาย ${dying.length})` : 'ยืนยันการจัด Core', confirmCores);
  } else if (state.phase === 'main') {
    title = 'Main Step';
    detail =
      selectedCores.length > 0
        ? `เลือก Core ไว้ ${selectedCores.length} ดวง: ลากไปวาง หรือคลิกการ์ด/Reserve ปลายทาง`
        : 'คลิกการ์ดบนมือเพื่อเล่น · ลาก Core ไปวางบนการ์ดหรือ Reserve (คลิก Core เพื่อเลือกหลายดวง)';
    if (selectedCores.length > 0) add('clear', 'ยกเลิกเลือก Core', clearCores, 'secondary');
  } else if (state.phase === 'attack') {
    tag = 'attack';
    title = 'Attack Step';
    detail = 'คลิกสปิริตที่มีกรอบสีเหลืองเพื่อโจมตี';
  }

  // ---- แผงกาง: ตัวเลือกแบบปุ่ม / ปุ่มเยอะ = กางเอง · ข้อความถูกตัด = กดที่คำถามเพื่อกาง
  const titleRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const cut = (el: HTMLElement | null) => !!el && el.scrollWidth > el.clientWidth + 1;
    const t = cut(titleRef.current) || cut(detailRef.current);
    if (t !== truncated) setTruncated(t);
  });
  const panelKey = `${tag}|${typeof title === 'string' ? title : ''}|${source}|${actions.map((a) => a.key).join(',')}`;
  const actionsInPanel = mine && (tag === 'option' || actions.length >= 3) && actions.length > 0;
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const canExpand = mine && !blocking && (actionsInPanel || truncated);
  const panelOpen = canExpand && (actionsInPanel ? hiddenKey !== panelKey : openKey === panelKey);
  const togglePanel = () => {
    if (!canExpand) return;
    if (panelOpen) {
      setHiddenKey(panelKey);
      setOpenKey(null);
    } else {
      setHiddenKey(null);
      setOpenKey(panelKey);
    }
  };
  // ทิศที่กาง: ห้ามทับการ์ดที่ต้องคลิก
  //  ตัวเลือกแบบปุ่ม (ไม่ต้องคลิกกระดาน) / เลือกเป้าหมายที่อยู่ฝั่งคู่แข่งทั้งหมด = กางไปฝั่งคนตัดสินใจ (ใกล้มือ)
  //  อย่างอื่น (ป้องกัน, Flash, จ่าย/วาง Core, เป้าหมายฝั่งเรา) = การ์ดที่ต้องคลิกอยู่ฝั่งเรา จึงกางไปฝั่งคู่แข่ง
  const targetsAllOpp =
    tag === 'target' && choice?.kind === 'card' && choice.candidates.every((id) => state.cards[id] && state.cards[id]!.owner !== actor);
  const towardActor = tag === 'option' || targetsAllOpp;
  const actorBelow = actor ? actor === bottom : true;
  const dropDown = towardActor ? actorBelow : !actorBelow;
  const t = tag ? TAGS[tag] : null;

  const renderBtn = (a: PromptAction, wide = false) => (
    <button
      key={a.key}
      type="button"
      title={a.label}
      className={`${BTN[a.kind]} ${wide ? 'w-full text-left whitespace-normal' : 'max-w-full min-w-0 truncate'}`}
      onClick={a.onClick}
      disabled={a.disabled}
    >
      {a.label}
    </button>
  );

  const fighter = (id: string) => (
    <span key={id} title={cardName(state, id)} className="flex min-w-0 items-baseline gap-1 rounded bg-black/40 px-2 py-0.5">
      <span className="min-w-0 truncate">{cardName(state, id)}</span>
      <b className="shrink-0 text-yellow-300">{currentBp(state, db, id).toLocaleString()}</b>
    </span>
  );
  const lifePerBlocker = battle ? battle.lifeOnBlockerDestroyed + (battle.consecutiveBlade ? battle.lifeOnBlockerDestroyedByBlade : 0) : 0;
  const sourceDef = source && state.cards[source] ? db.get(state.cards[source]!.cardNo) : null;

  return (
    <div className="relative">
      {/* แถบบางบรรทัดเดียวบนเส้นกลางกระดาน */}
      <div
        className={`hud-panel flex flex-col gap-1 rounded-xl py-1 pr-1.5 pl-3 ${highlight && t ? t.ring : ''}`}
        style={highlight && t ? ({ animation: 'fx-tag-glow 1.8s ease-in-out infinite', '--tag-glow': t.glow } as React.CSSProperties) : undefined}
      >
        {battle && (
          <div className="flex items-center gap-2.5 text-xs whitespace-nowrap">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 rounded bg-rose-600 px-2 text-[10px] font-black tracking-wide">BATTLE</span>
              {fighter(battle.attackerId)}
              <span className="shrink-0 text-slate-500">vs</span>
              {battle.blockers.length === 0 ? <span className="min-w-0 truncate text-slate-500">ยังไม่มีผู้ป้องกัน</span> : battle.blockers.map(fighter)}
            </div>
            <div className="w-[76px] shrink-0" />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {battle.consecutiveBlade && <span className="shrink-0 rounded bg-orange-600 px-1.5 font-bold">Consecutive Blade</span>}
              {battle.mustBlock && !battle.consecutiveBlade && <span className="shrink-0 rounded bg-orange-600 px-1.5 font-bold">True-Rage</span>}
              {battle.endAttackStepAfter && <span title="จบ Attack Step หลังการต่อสู้นี้" className="min-w-0 truncate rounded bg-slate-600 px-1.5">จบ Attack Step หลังการต่อสู้นี้</span>}
              {lifePerBlocker > 0 && <span title={`ผู้ป้องกันถูกทำลาย → ไลฟ์ −${lifePerBlocker}/ตัว`} className="min-w-0 truncate rounded bg-slate-600 px-1.5">ผู้ป้องกันถูกทำลาย → ไลฟ์ −{lifePerBlocker}/ตัว</span>}
            </div>
          </div>
        )}
        {/* ซ้าย: ใคร/ทำอะไร · กลาง: ป้ายเทิร์น (เว้นช่องไว้) · ขวา: ปุ่ม */}
        <div className="relative flex min-h-8 items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {actor && <span className="player-tag-active shrink-0 rounded-md px-2 py-0.5 text-xs font-black">ตาของ {playerLabel(actor)}</span>}
            <ChainTracker side="self" />
            {tag && mine && <TagChip tag={tag} />}
            <div
              className={`flex min-w-0 flex-1 items-baseline gap-2 ${canExpand ? 'cursor-pointer' : ''}`}
              title={[typeof title === 'string' ? title : '', typeof detail === 'string' ? detail : ''].filter(Boolean).join(' · ') || undefined}
              onClick={togglePanel}
            >
              <span ref={titleRef} className="min-w-0 truncate text-sm font-black tracking-wide text-white [text-shadow:0_1px_0_#000,0_0_12px_rgba(56,189,248,0.35)]">
                {title}
              </span>
              {detail && (
                <span ref={detailRef} className={`min-w-0 flex-1 truncate text-xs ${highlight ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                  {detail}
                </span>
              )}
            </div>
            {canExpand && (
              <button
                type="button"
                onClick={togglePanel}
                title={panelOpen ? 'ซ่อนเพื่อดูกระดาน' : 'อ่านทั้งหมด'}
                className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-white/25 hover:bg-white/10 ${panelOpen ? 'text-slate-300' : 'text-white'}`}
              >
                {/* ข้อความถูกตัด: ปุ่มเป็นแค่ลูกศร (ไม่กินที่ของคำถาม) */}
                {panelOpen ? 'ซ่อน ' : actionsInPanel ? `ตัวเลือก ${actions.length} ` : ''}
                {panelOpen === dropDown ? '▴' : '▾'}
              </button>
            )}
          </div>
          <div className="w-[76px] shrink-0" />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
            {!actionsInPanel && actions.length > 0 && <div className="btn-row flex min-w-0 justify-end gap-1.5">{actions.map((a) => renderBtn(a))}</div>}
            <ChainTracker side="opp" />
            <PhaseButton btn={phaseBtn} />
          </div>
          <TurnBadge />
        </div>
      </div>

      {/* แผงกาง: ลอยทับกระดาน ไปทางฝั่งของคนที่ต้องตัดสินใจ */}
      {panelOpen && (
        <div
          className={`absolute left-1/2 z-40 w-[min(600px,92%)] -translate-x-1/2 rounded-xl border-2 bg-slate-950/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${
            t ? t.border : 'border-slate-500'
          } ${dropDown ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}
          style={{ animation: 'fx-chain-pop 0.2s ease-out both' }}
        >
          <div className="flex gap-3">
            {sourceDef && (
              <div className="h-28 w-20 shrink-0">
                <CardFace def={sourceDef} size="xs" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                {tag && <TagChip tag={tag} />}
                <span className="min-w-0 truncate text-xs text-slate-400">
                  {actor ? `ตาของ ${playerLabel(actor)}` : ''}
                  {sourceDef ? ` · ${sourceDef.name}` : ''}
                </span>
                <button type="button" onClick={togglePanel} className="ml-auto shrink-0 rounded px-2 py-0.5 text-xs text-slate-400 ring-1 ring-white/15 hover:bg-white/10 hover:text-white">
                  ซ่อน {dropDown ? '▴' : '▾'}
                </button>
              </div>
              <div className="text-base leading-snug font-black text-white">{title}</div>
              {detail && <div className="text-xs leading-relaxed text-slate-300">{detail}</div>}
            </div>
          </div>
          {actionsInPanel && <div className="btn-row mt-3 flex flex-col gap-1.5">{actions.map((a) => renderBtn(a, true))}</div>}
        </div>
      )}
    </div>
  );
}

/** สายฟ้า (SVG: อีโมจิเป็นกล่องว่างบน Windows 7) */
function Bolt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M13.5 2 4 13.5h6.5L9 22l11-12.5h-6.8L13.5 2Z" />
    </svg>
  );
}

/**
 * ป้าย "FLASH TIMING" กลางจอชั่วครู่ เมื่อสิทธิ์ใช้ Flash มาถึงผู้เล่นที่มีการ์ดใช้ได้ (ไม่บังการคลิก)
 * แสดงครั้งเดียวต่อช่วง (สเต็ปของการต่อสู้ + ผู้ถือสิทธิ์) ถึงจะสลับสิทธิ์ไปมาก็ไม่ขึ้นซ้ำ
 */
export function FlashCue() {
  const cue = useGame((s) => {
    const fp = flashPlayer(s.state);
    const b = s.state.battle;
    if (!fp || !b || isFxBlocking(s.fx) || !controls(s, fp)) return null;
    const o = responseOptions(s.state, fp);
    const n = o.magic.length + o.evolve.length + o.quick.length + o.activate.length + o.trash.length;
    if (n === 0) return null;
    return `${s.state.turn}|${b.attackerId}|${b.step}|${b.blockers.join(',')}|${fp}|${n}`;
  });
  const [shown, setShown] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!cue) return;
    const key = cue.slice(0, cue.lastIndexOf('|'));
    if (seen.current.has(key)) return;
    seen.current.add(key);
    setShown(cue);
    const t = setTimeout(() => setShown((c) => (c === cue ? null : c)), 1700);
    return () => clearTimeout(t);
  }, [cue]);
  if (!shown) return null;
  const [, , step, , fp, n] = shown.split('|');
  return (
    <div
      key={shown}
      className="pointer-events-none fixed top-1/2 left-1/2 z-[70] flex flex-col items-center gap-1 rounded-2xl border-2 border-cyan-300 bg-slate-950/85 px-10 py-4 text-center shadow-[0_0_60px_rgba(103,232,249,0.55)]"
      style={{ animation: 'flash-cue 1.7s ease-out both' }}
    >
      <div className="flex items-center gap-2 text-4xl font-black tracking-[0.2em] text-cyan-200 [text-shadow:0_0_18px_rgba(103,232,249,0.9)]">
        <Bolt className="h-9 w-9" />
        FLASH TIMING
      </div>
      <div className="text-sm font-semibold text-white">
        {playerLabel(fp as PlayerId)} {step === 'flashBeforeBlock' ? 'ก่อนประกาศป้องกัน' : 'ก่อนตัดสินการต่อสู้'} · มีการ์ด/เอฟเฟกต์ที่ใช้ได้ {n} อย่าง
      </div>
      <div className="text-xs text-cyan-100">การ์ดที่ใช้ได้มีกรอบสีฟ้า · ไม่ใช้ = กด PASS</div>
    </div>
  );
}

/** ปุ่มจบ Step / Pass ทรงแคปซูล อยู่ปลายขวาในแถบกลาง (ไม่ทับช่องบนกระดาน) — ไม่มีอะไรให้กดก็ไม่แสดง */
function PhaseButton({ btn }: { btn: { label: string; sub: string; onClick: () => void } | null }) {
  if (!btn) return null;
  return (
    <button
      type="button"
      onClick={btn.onClick}
      className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-300 via-amber-500 to-orange-600 pr-4 pl-1.5 font-black text-slate-950 shadow-[0_0_14px_rgba(251,191,36,0.45),inset_0_1px_0_rgba(255,255,255,0.5)] transition hover:brightness-110 active:scale-95"
      style={{ animation: 'phase-btn-pulse 2s ease-in-out infinite' }}
    >
      <span className="rounded-full bg-slate-950/85 px-2 py-0.5 text-[10px] leading-none tracking-wider text-amber-200">{btn.label}</span>
      <span className="text-sm leading-none">{btn.sub}</span>
      <span className="text-xs leading-none">▶</span>
    </button>
  );
}

/** Magic [Flash] บนมือของผู้เล่นนี้ที่ใช้ได้ตอนนี้ (ให้การ์ดเรืองแสง) */
export function useFlashUsable(cardId: string): boolean {
  return useGame((s) => {
    const fp = flashPlayer(s.state);
    if (!fp) return false;
    const o = responseOptions(s.state, fp);
    return o.magic.includes(cardId) || o.quick.includes(cardId);
  });
}

/** สีและไอคอนของบรรทัด Log ตามเนื้อหา */
function logStyle(line: string): { icon: string; cls: string } {
  if (line.startsWith('──')) return { icon: '', cls: 'mt-2 border-t border-yellow-400/20 pt-1.5 font-bold text-yellow-300' };
  if (line.includes('ชนะ')) return { icon: '🏆', cls: 'font-bold text-yellow-200' };
  if (line.includes('เสีย Life')) return { icon: '💔', cls: 'text-rose-300' };
  if (line.includes('ถูกทำลาย') || line.includes('สูญสลาย')) return { icon: '💥', cls: 'text-rose-200/90' };
  if (line.includes('ประกาศโจมตี')) return { icon: '⚔', cls: 'text-orange-200' };
  if (line.includes('บล็อก')) return { icon: '🛡', cls: 'text-sky-200' };
  if (line.includes('อัญเชิญ') || line.includes('วาง Nexus')) return { icon: '✦', cls: 'text-emerald-200' };
  if (line.includes('Magic') || line.includes('Burst')) return { icon: '✧', cls: 'text-violet-200' };
  if (line.includes('เอฟเฟกต์') || line.includes('[')) return { icon: '⚡', cls: 'text-amber-100' };
  return { icon: '·', cls: 'text-slate-400' };
}

export function GameLog() {
  const state = useGame((s) => s.state);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  // ยังไม่บอกผลแพ้ชนะใน Log จนกว่าแอนิเมชันจะเล่นจบ
  const lines = state.log
    .filter((e) => !(blocking && e.type === 'gameOver'))
    .map((e) => formatEvent(e, state))
    .filter((l): l is string => l !== null);
  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 text-xs">
      {[...lines].reverse().map((line, i) => {
        const s = logStyle(line);
        return (
          <li key={lines.length - i} className={`flex gap-1.5 ${s.cls}`}>
            {s.icon && <span className="w-4 shrink-0 text-center">{s.icon}</span>}
            <span className="min-w-0">{line}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ErrorToast() {
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  if (!error) return null;
  return (
    <div className="fixed bottom-6 left-[calc((100vw-var(--sidebar))/2)] z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-rose-700 px-4 py-2.5 text-sm shadow-xl">
      <span>⚠ {error}</span>
      <button type="button" onClick={clearError} className="text-rose-200 hover:text-white">
        ✕
      </button>
    </div>
  );
}

/** การ์ดในรายการเลือก: ชี้เพื่อดูรายละเอียดในแผงด้านขวา */
function PickCard({ cardId, disabled, onPick, note }: { cardId: string; disabled?: boolean; onPick?: () => void; note?: React.ReactNode }) {
  const state = useGame((s) => s.state);
  const hover = useGame((s) => s.hover);
  const c = state.cards[cardId]!;
  return (
    // ไม่ใช้ disabled: ปุ่มที่ disabled ไม่ส่ง mouse event ทำให้ชี้ดูรายละเอียดการ์ดไม่ได้ (เช่นการ์ดใน Trash)
    <button
      type="button"
      aria-disabled={disabled || !onPick}
      onClick={() => !disabled && onPick?.()}
      onMouseEnter={() => hover(cardId)}
      onMouseLeave={() => hover(null)}
      className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${onPick && !disabled ? 'hover:bg-yellow-300/20' : 'cursor-default'} ${disabled ? 'opacity-35' : ''}`}
    >
      <div className="h-44 w-32">
        <CardFace def={db.get(c.cardNo)} />
      </div>
      {note && <span className="text-xs text-slate-300">{note}</span>}
    </button>
  );
}

/** หน้าต่างเลือกการ์ดที่ไม่ได้อยู่บนกระดาน (การ์ดที่เปิดจากเด็ค / ใน Trash) */
export function ChoiceDialog() {
  const state = useGame((s) => s.state);
  const choose = useGame((s) => s.choose);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const choice = state.choice;
  const mine = useGame((s) => controls(s, s.state.choice?.player));
  if (!mine) return null;
  if (!blocking && choice?.kind === 'order') return <OrderPanel />;
  if (!blocking && choice?.kind === 'multiSummon') return <MultiPickFan />;
  if (blocking || !choice || choice.kind !== 'card' || isInlineChoice(state)) return null;
  // การ์ดที่เปิดจากเด็ค: เรียงเป็นพัดบนกระดาน (ทั้งสองฝ่ายเห็น)
  if (choice.revealed) {
    return (
      <RevealFan
        owner={choice.player}
        cardIds={choice.revealed}
        candidates={choice.candidates}
        onPick={(id) => choose(id)}
        title={`${playerLabel(choice.player)} แสดงการ์ดจากเด็ค · ${choice.step.do === 'revealPickRestTrash' ? 'เลือก 1 ใบขึ้นมือ ที่เหลือลง Trash' : choice.prompt}`}
        onSkip={choice.optional ? () => choose(null) : undefined}
      />
    );
  }

  // การ์ดในแทรช: เรียงเป็นพัดบนกระดานเหมือนการ์ดที่เปิดจากเด็ค (ไม่บังกระดานด้วยหน้าต่าง)
  const trashOwner = PLAYERS.find((p) => choice.candidates.length > 0 && choice.candidates.every((id) => state.players[p].trashCards.includes(id)));
  if (trashOwner) {
    return (
      <RevealFan
        owner={choice.player}
        cardIds={choice.candidates}
        candidates={choice.candidates}
        onPick={(id) => choose(id)}
        title={`${choice.prompt} · จากแทรช${trashOwner === choice.player ? '' : `ของ${playerLabel(trashOwner)}`}`}
        onSkip={choice.optional ? () => choose(null) : undefined}
      />
    );
  }

  return (
    <Modal title={choice.prompt} subtitle={`${playerLabel(choice.player)} · เอฟเฟกต์ของ ${cardName(state, choice.sourceId)}`} wide>
      <div className="flex flex-wrap gap-1">
        {(choice.revealed ?? choice.candidates).map((id) => (
          <PickCard
            key={id}
            cardId={id}
            disabled={!choice.candidates.includes(id)}
            onPick={() => choose(id)}
            note={playerLabel(state.cards[id]!.owner)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          {choice.revealed ? 'การ์ดที่ไม่ได้เลือกจะลง Trash · ' : ''}ชี้การ์ดเพื่ออ่านรายละเอียดในแผงด้านขวา
        </span>
        {choice.optional && (
          <button type="button" className={BTN.secondary} onClick={() => choose(null)}>
            ไม่เลือก
          </button>
        )}
      </div>
    </Modal>
  );
}

/** อัญเชิญหลายใบจากที่แสดง ขั้นเลือกการ์ด: พัดการ์ดบนกระดาน (คลิกเพื่อเลือก/ยกเลิก) */
function MultiPickFan() {
  const state = useGame((s) => s.state);
  const multi = useGame((s) => s.multi);
  const multiToggle = useGame((s) => s.multiToggle);
  const choice = state.choice;
  if (choice?.kind !== 'multiSummon') return null;
  const m = multi ?? EMPTY_MULTI;
  if (m.phase !== 'pick') return null;
  return (
    <RevealFan
      owner={choice.player}
      cardIds={choice.revealed}
      candidates={choice.candidates}
      chosenIds={m.picks}
      chosenLabel="เลือก ✓ อัญเชิญ"
      onPick={multiToggle}
      title={`${playerLabel(choice.player)} แสดงการ์ดจากเด็ค · ${choice.max === null ? 'เลือกอัญเชิญได้กี่ใบก็ได้' : `เลือกอัญเชิญได้สูงสุด ${choice.max} ใบ`} · ที่เหลือไว้ใต้สุดเด็ค`}
    />
  );
}

/**
 * แผงอัญเชิญที่มุมสนามของผู้เลือก (มาตรฐานเดียวกันทุกการอัญเชิญด้วยเอฟเฟกต์: เบิร์ส / มือ / เด็ค / แทรช)
 * ไม่บังกระดาน: เลือก Core บนกระดานโดยตรง แผงนี้แสดงการ์ดที่จะลงสนาม · ปุ่มเลือก Lv · ผลที่จะได้ · คำเตือนสูญสลาย
 */
export function SummonPanel() {
  const state = useGame((s) => s.state);
  const multi = useGame((s) => s.multi);
  const selected = useGame((s) => s.selectedCores);
  const blocking = useGame((s) => isFxBlocking(s.fx));
  const mine = useGame((s) => controls(s, s.state.choice?.player));
  const c = state.choice;
  if (!c || blocking || !mine) return null;
  let cardId: string | null = null;
  let min = 0;
  let pay: number | null = null;
  if (c.kind === 'placeCores') {
    cardId = c.cardId;
    min = c.min;
  } else if (c.kind === 'payCost' && c.step.do === 'payForSummon') {
    cardId = c.step.cardId;
    pay = c.cost;
  } else if (c.kind === 'multiSummon' && multi?.phase === 'place' && !multiNeedsHost(state, multi)) {
    cardId = multi.picks[multi.index] ?? null;
    if (cardId) min = minCores(db.get(state.cards[cardId]!.cardNo));
  }
  if (!cardId) return null;
  // มุมซ้ายบนของสนามผู้เลือก (สนามฝั่งบน = มุมซ้ายล่าง ไม่บังแถบกลาง)
  const mat = layoutRect(document.querySelector(`[data-mat="${c.player}"]`));
  if (!mat) return null;
  const lower = mat.y + mat.h / 2 > innerHeight / 2;
  // เลยคอลัมน์ Burst/Life ทางซ้ายไปอยู่ในพื้นที่สนาม
  const left = mat.x + 150;
  const style = lower ? { left, top: mat.y + 12 } : { left, top: mat.y + mat.h - 12, transform: 'translateY(-100%)' };
  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 right-[var(--sidebar)] z-[38]">
      <div className="hud-panel pointer-events-auto absolute flex w-72 gap-2.5 rounded-xl p-2.5" style={style}>
        <SummonCoreDetail state={state} cardId={cardId} selected={selected} min={min} pay={pay} />
      </div>
    </div>
  );
}

function SummonCoreDetail({ state, cardId, selected, min, pay }: { state: GameState; cardId: string; selected: string[]; min: number; pay: number | null }) {
  const autoSelectCores = useGame((s) => s.autoSelectCores);
  const hover = useGame((s) => s.hover);
  const def = db.get(state.cards[cardId]!.cardNo);
  const owner = state.cards[cardId]!.owner;
  const lv = levelOf(def, selected.length);
  const bp = bpOf(def, selected.length);
  // Core ที่ดึงจากการ์ดบนสนาม: การ์ดที่ Core เหลือไม่ถึง Lv1 จะสูญสลาย
  const depleting = state.players[owner].field.filter((id) => {
    const c = state.cards[id]!;
    const d = db.get(c.cardNo);
    if (!isSpiritLike(d) || !c.cores.some((x) => selected.includes(x))) return false;
    return levelOf(d, c.cores.filter((x) => !selected.includes(x)).length) === 0;
  });
  return (
    <>
      <div className="h-28 w-20 shrink-0" onMouseEnter={() => hover(cardId)} onMouseLeave={() => hover(null)}>
        <CardFace def={def} level={pay === null && lv > 0 ? lv : undefined} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-slate-200">
        <div className="text-[11px] font-bold text-emerald-300">อัญเชิญ</div>
        <div className="truncate text-sm font-black text-white">{def.name}</div>
        {pay !== null ? (
          <div>
            จ่ายคอสต์ <b className="text-amber-300">{pay}</b> · เลือกแล้ว {selected.length}/{pay}
            <div className="text-slate-400">คลิก Core ใน Reserve หรือบนการ์ดในสนาม · ถัดไป: วาง Core กำหนด Lv</div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {def.levels.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  onClick={() => autoSelectCores(l.cores)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-black ${lv === l.level ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                  title={`วาง Core ${l.cores} ดวงจาก Reserve`}
                >
                  Lv{l.level} · {l.cores}
                </button>
              ))}
            </div>
            <div>
              เลือก <b>{selected.length}</b> ดวง (ขั้นต่ำ {min})
              {lv > 0 ? (
                <b className="text-emerald-300">
                  {' '}
                  → Lv{lv}
                  {bp ? ` · BP ${bp.toLocaleString()}` : ''}
                </b>
              ) : (
                <b className="text-rose-300"> · ยังไม่ถึง Lv1</b>
              )}
            </div>
            {depleting.length > 0 && <div className="font-bold text-rose-300">{depleting.map((id) => cardName(state, id)).join(', ')} จะสูญสลาย</div>}
            <div className="text-slate-400">คลิก Core ใน Reserve หรือบนการ์ดในสนามเพื่อปรับ</div>
          </>
        )}
      </div>
    </>
  );
}

/** เอฟเฟกต์หลายอันเกิดพร้อมกัน: แผงให้เจ้าของเลือกว่าอันไหนทำงานก่อน */
function OrderPanel() {
  const state = useGame((s) => s.state);
  const choose = useGame((s) => s.choose);
  const hover = useGame((s) => s.hover);
  const choice = state.choice;
  if (choice?.kind !== 'order') return null;
  // เอฟเฟกต์ที่เหมือนกันทุกอย่างแสดงอันเดียวพร้อมจำนวน (เลือกอันไหนก็ผลเท่ากัน)
  const entries: { eff: (typeof choice.effects)[number]; index: number; count: number }[] = [];
  choice.effects.forEach((eff, index) => {
    const keyOf = (x: typeof eff) => x.key ?? `${x.sourceId}|${x.source}`;
    const key = keyOf(eff);
    const same = entries.find((e) => keyOf(e.eff) === key);
    if (same) same.count++;
    else entries.push({ eff, index, count: 1 });
  });
  return (
    <div className="pointer-events-none fixed inset-y-0 left-0 right-[var(--sidebar)] z-40 flex items-center justify-center bg-black/55">
      <div className="hud-panel pointer-events-auto flex max-w-4xl flex-col gap-3 rounded-xl p-4">
        <div>
          <div className="text-xs text-slate-400">{playerLabel(choice.player)} · เอฟเฟกต์ {choice.effects.length} อันเกิดพร้อมกัน</div>
          <div className="text-lg font-black text-white">เลือกเอฟเฟกต์ที่จะทำงานก่อน</div>
          <div className="text-xs text-slate-400">อันที่เลือกเกิดผลทันที แล้วค่อยเลือกอันถัดไป</div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {entries.map(({ eff, index: i, count }) => {
            const card = state.cards[eff.sourceId]!;
            const def = db.get(card.cardNo);
            const text = eff.source === null ? '' : ((def.effects as { text: string }[])[eff.source]?.text ?? '');
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(i)}
                onMouseEnter={() => hover(eff.sourceId)}
                onMouseLeave={() => hover(null)}
                className="group flex w-64 cursor-pointer gap-2 rounded-lg bg-slate-900/90 p-2 text-left ring-2 ring-fuchsia-400/60 transition hover:-translate-y-1 hover:ring-fuchsia-300 hover:shadow-[0_0_20px_rgba(232,121,249,0.5)]"
              >
                <div className="h-24 w-[4.3rem] shrink-0">
                  <CardFace def={def} size="xs" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-white">{def.name}</span>
                    {count > 1 && (
                      <span className="shrink-0 rounded-full bg-amber-400 px-1.5 text-[11px] font-black text-slate-900" title={`เกิดขึ้น ${count} ครั้ง`}>
                        ×{count}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-4 text-xs text-slate-300">{text}</span>
                  <span className="mt-auto rounded bg-fuchsia-500 px-1.5 py-0.5 text-center text-xs font-black text-white group-hover:bg-fuchsia-400">ทำงานก่อน</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** ดูการ์ดใน Trash */
export function TrashDialog() {
  const state = useGame((s) => s.state);
  const player = useGame((s) => s.trashView);
  const openTrash = useGame((s) => s.openTrash);
  const openPlay = useGame((s) => s.openPlay);
  const mine = useGame((s) => !!player && controls(s, player));
  const busy = useGame((s) => !!s.state.choice || isFxBlocking(s.fx));
  if (!player) return null;
  const cards = state.players[player].trashCards;
  // อัญเชิญจากแทรชได้ (ร็อคแฮนด์ / มุเมอิ)
  const summonable = (id: string) => mine && !busy && !state.winner && !!trashSummonRule(state, db, player, id);
  return (
    <Modal title={`Trash ของ${playerLabel(player)}`} subtitle={`${cards.length} ใบ · ชี้การ์ดเพื่อดูรายละเอียด`} onClose={() => openTrash(null)} wide>
      {cards.length === 0 ? (
        <p className="text-sm text-slate-500">ยังไม่มีการ์ดใน Trash</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {[...cards].reverse().map((id) =>
            summonable(id) ? (
              <PickCard
                key={id}
                cardId={id}
                onPick={() => {
                  openTrash(null);
                  openPlay(id, 'summon');
                }}
                note={<span className="font-bold text-purple-300">แตะเพื่ออัญเชิญ</span>}
              />
            ) : (
              <PickCard key={id} cardId={id} />
            ),
          )}
        </div>
      )}
    </Modal>
  );
}
