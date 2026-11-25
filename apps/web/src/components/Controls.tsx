import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { blockForced, bpOf, cardLevel, currentBp, isSpiritLike, levelOf, minCores, onStageAbilities, opponentOf, PLAYERS, levelBoostSources, summonLevelCostBoost, summonMinCores, trashSummonRule, type GameState, type PlayerId } from '@bs/engine';
import { cardName, formatEvent, playerLabel } from '../format';
import {
  actingPlayer,
  isChoiceCandidate,
  kagemushaChoice,
  isMultiCardCandidate,
  allocOf,
  pickedOf,
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
  partnerTurn,
} from '../store';
import { CardFace } from './CardFace';
import { playOptions } from './Board';
import { useHeld } from './useHeld';
import { ChainTracker, RevealFan } from './Fx';
import { BTN, Modal } from './Modal';
import { panelStyle } from './PlayDialog';
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

/** เส้นคั่นแนวตั้งระหว่างปุ่มบนแถบกับป้ายเทิร์นกลางแถบ: เส้นแสงจางหัวท้าย + จุดกลาง */
function BarDivider() {
  return (
    <span aria-hidden className="relative flex h-7 w-px shrink-0 items-center justify-center bg-gradient-to-b from-transparent via-sky-300/70 to-transparent">
      <span className="absolute h-1.5 w-1.5 rotate-45 bg-sky-300 shadow-[0_0_6px_rgba(125,211,252,0.9)]" />
    </span>
  );
}

/** hint = ยังกดไม่ได้เพราะรอให้ทำอะไรก่อน: แสดงเป็นคำแนะนำแทนปุ่มทึบ (ปุ่มทึบดูเหมือนเสีย/กดไม่ได้ตลอด) */
type PromptAction = {
  key: string;
  label: string;
  onClick: () => void;
  kind: keyof typeof BTN;
  disabled: boolean;
  hint?: string;
  /** ตัวเลือกที่พูดถึงการ์ดในมือ (เช่น Kagemusha): แสดงเป็นแผ่นมีภาพการ์ด */
  cardNo?: string;
  /** ตัวเลือกข้อความเดียวกันซ้ำ (การ์ดชื่อเดียวกันหลายใบ) รวมเป็นปุ่มเดียว */
  count?: number;
};

/** ตัวเลือกที่ "ไม่ทำ" (ไม่ใช้ / ไม่อัญเชิญ / ข้าม / ยกเลิก): ปุ่มสีเทาแยกไว้ท้าย ไม่ให้เด่นเท่าตัวเลือกที่ทำอะไรจริง */
const DECLINE = /^(ไม่|ข้าม|ยกเลิก)/;

/** การ์ดในมือของผู้เลือกที่ชื่ออยู่ในข้อความตัวเลือก (ชื่อยาวสุดก่อน: กันชื่อสั้นที่เป็นส่วนหนึ่งของชื่ออื่น) */
function cardInLabel(state: GameState, player: PlayerId, label: string): string | undefined {
  let best: { no: string; len: number } | undefined;
  for (const id of state.players[player].hand) {
    const no = state.cards[id]?.cardNo;
    if (!no) continue;
    const name = db.get(no).name;
    if (name.length >= 2 && label.includes(name) && (!best || name.length > best.len)) best = { no, len: name.length };
  }
  return best?.no;
}

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
  const attackConfirm = useGame((s) => s.attackConfirm);
  const alloc = useGame(allocOf);
  const picked = useGame(pickedOf);
  const { confirmAttack, confirmBlock } = useGame.getState();
  const blockConfirm = useGame((s) => s.blockConfirm);
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
  const add = (key: string, label: string, onClick: () => void, kind: keyof typeof BTN = 'primary', disabled = false, hint?: string) =>
    actions.push({ key, label, onClick, kind, disabled, ...(hint ? { hint } : {}) });

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
    detail = mine ? 'กดการ์ดที่ลอยขึ้นมาเพื่อจั่ว' : partnerTurn(state, actor) ? 'รอเพื่อนร่วมทีมกดจั่ว (ทั้งทีมจั่วพร้อมกัน)…' : 'รอคู่แข่งจั่วการ์ด…';
  } else if (!mine && partnerTurn(state, actor)) {
    // 2VS2: ตาของเพื่อนร่วมทีม (เรากดพร้อม/ผ่าน/โหวตไปแล้ว หรือเป็นตัวเลือกของเอฟเฟกต์ของเพื่อน)
    title = `รอ${useGame.getState().teamNames?.[actor!] ?? 'เพื่อนร่วมทีม'}…`;
    detail = choice
      ? `เพื่อนกำลังเลือก: ${choice.prompt}`
      : battle?.flash
        ? 'คุณผ่าน Flash แล้ว · รอเพื่อนกดผ่าน'
        : battle?.step === 'declareBlock'
          ? 'คุณโหวตไม่ป้องกันแล้ว · รอเพื่อนตัดสินใจ (ป้องกันด้วยสปิริตของเพื่อน หรือโหวตไม่ป้องกัน)'
          : state.phase === 'main'
            ? 'คุณกดจบเมนสเต็ปแล้ว · รอเพื่อนเล่นให้เสร็จ'
            : 'คุณกดจบแอทแท็คสเต็ปแล้ว · รอเพื่อนโจมตีให้เสร็จ';
  } else if (!mine) {
    // ออนไลน์: ตาของคู่แข่ง
    title = `รอ${actor ? playerLabel(actor) : 'คู่แข่ง'}…`;
    detail = choice ? `กำลังเลือก: ${choice.prompt}` : battle?.flash ? 'Flash Timing ของคู่แข่ง' : battle?.step === 'declareBlock' ? 'คู่แข่งกำลังเลือกการป้องกัน' : 'ตาของคู่แข่ง';
  } else if (attackConfirm && state.phase === 'attack' && !battle) {
    // ยืนยันก่อนโจมตี (ปิดได้ในตั้งค่า > การเล่น)
    highlight = true;
    tag = 'attack';
    source = attackConfirm;
    title = `โจมตีด้วย ${cardName(state, attackConfirm)}?`;
    detail = `BP ${currentBp(state, db, attackConfirm).toLocaleString()} · กดปุ่ม "โจมตี" เพื่อยืนยัน · คลิกสปิริตตัวเดิมอีกครั้งเพื่อยกเลิก`;
    add('cancel', 'ยกเลิก', () => confirmAttack(false), 'secondary');
    // On Stage (BS07): ทางเลือกแทนการโจมตี
    for (const ab of onStageAbilities(state, db, state.cards[attackConfirm]!.owner, attackConfirm)) {
      add(`stage${ab.source}`, ab.keyword ? 'On Stage' : 'กลับใต้เด็คแทนโจมตี', () => {
        useGame.setState({ attackConfirm: null });
        dispatch({ type: 'onStage', player: state.cards[attackConfirm]!.owner, cardId: attackConfirm, source: ab.source });
      }, 'secondary');
    }
    add('attack', 'โจมตี', () => confirmAttack(true), 'primary');
  } else if (blockConfirm && battle?.step === 'declareBlock') {
    // ยืนยันก่อนป้องกัน (ตั้งค่าเดียวกับยืนยันโจมตี)
    highlight = true;
    tag = 'block';
    source = blockConfirm;
    title = `ป้องกันด้วย ${cardName(state, blockConfirm)}?`;
    detail = `BP ${currentBp(state, db, blockConfirm).toLocaleString()} · กดปุ่ม "ป้องกัน" เพื่อยืนยัน · คลิกสปิริตตัวเดิมอีกครั้งเพื่อยกเลิก`;
    add('cancel', 'ยกเลิก', () => confirmBlock(false), 'secondary');
    add('block', 'ป้องกัน', () => confirmBlock(true), 'primary');
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
    } else if (choice.kind === 'option' && kagemushaChoice(state)) {
      // Kagemusha: เลือกจากการ์ดที่เรืองแสงในมือโดยตรง (ไม่เปิดแผงบังมือ) · แถบมีแค่ปุ่ม "ไม่ใช้"
      const k = kagemushaChoice(state)!;
      tag = 'target';
      title = 'Kagemusha: สปิริตของเรากำลังถูกเล็ง';
      detail = mine
        ? `คลิกการ์ด Kagemusha ที่เรืองแสงในมือเพื่ออัญเชิญ แล้วเอฟเฟกต์ต้องเล็งการ์ดใบนั้นแทน${k.target ? ` (ถูกเล็ง: ${cardName(state, k.target)})` : ''}`
        : `${playerLabel(k.player)} กำลังเลือกว่าจะใช้ Kagemusha ไหม`;
      if (k.decline >= 0) add(`opt${k.decline}`, choice.options[k.decline]!, () => choose(k.decline), 'secondary');
    } else if (choice.kind === 'option') {
      tag = 'option';
      detail = src;
      // ข้อความเดียวกันซ้ำ (เช่น Kagemusha ชื่อเดียวกัน 3 ใบ) = ปุ่มเดียว + ×N · "ไม่ใช้/ข้าม" = ปุ่มเทาไว้ท้าย
      const byLabel = new Map<string, PromptAction>();
      const declines: PromptAction[] = [];
      choice.options.forEach((label, i) => {
        const same = byLabel.get(label);
        if (same) {
          same.count = (same.count ?? 1) + 1;
          return;
        }
        const decline = DECLINE.test(label.trim());
        const cardNo = decline ? undefined : cardInLabel(state, choice.player, label);
        const a: PromptAction = { key: `opt${i}`, label, onClick: () => choose(i), kind: decline ? 'secondary' : 'primary', disabled: false, ...(cardNo ? { cardNo } : {}) };
        byLabel.set(label, a);
        (decline ? declines : actions).push(a);
      });
      actions.push(...declines);
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
      add(
        'pay',
        `จ่าย ${choice.cost}`,
        () => choose({ pay: selectedCores }),
        'primary',
        selectedCores.length !== choice.cost,
        selectedCores.length < choice.cost ? `เลือก Core อีก ${choice.cost - selectedCores.length} ดวง` : `เลือกเกิน ${selectedCores.length - choice.cost} ดวง`,
      );
    } else if (choice.kind === 'multiSummon') {
      // อัญเชิญหลายใบจากที่แสดง: เลือกการ์ดจากพัด → วาง Core ทีละใบบนกระดาน → ลงสนามพร้อมกัน
      const m = multi ?? EMPTY_MULTI;
      if (m.phase === 'pick') {
        tag = 'target';
        title = `เลือกการ์ดที่จะอัญเชิญไม่จ่ายคอสต์ (${m.picks.length}${choice.max !== null ? `/${choice.max}` : ''} ใบ)`;
        detail = `${src} · คลิกการ์ดที่แสดงเพื่อเลือก/ยกเลิก · ลงสนามพร้อมกัน`;
        add('skip', 'ไม่อัญเชิญ', () => choose({ summons: [] }), 'secondary');
        add('next', 'ถัดไป: วาง Core', multiNext, 'primary', m.picks.length === 0, 'คลิกการ์ดที่จะอัญเชิญ');
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
          const min = summonMinCores(state, db, cur);
          tag = 'core';
          title = `อัญเชิญ: วาง Core (${step})`;
          detail = `${src} · เลือก ${selectedCores.length} ดวง (ขั้นต่ำ ${min}) · ปรับ Lv ได้ที่แผงมุมสนาม`;
          add('next', last ? `ลงสนาม ${m.picks.length} ใบ` : 'ถัดไป', multiNext, 'primary', selectedCores.length < min, `เลือก Core อีก ${min - selectedCores.length} ดวง`);
        }
      }
    } else if (choice.kind === 'placeCores') {
      tag = 'core';
      source = choice.cardId;
      title = 'อัญเชิญ: วาง Core กำหนด Lv';
      detail = `${src} · เลือก ${selectedCores.length} ดวง (ขั้นต่ำ ${choice.min}) · ปรับ Lv ได้ที่แผงมุมสนาม`;
      add('place', `วาง ${selectedCores.length} ดวง`, () => choose({ pay: selectedCores }), 'primary', selectedCores.length < choice.min, `เลือก Core อีก ${choice.min - selectedCores.length} ดวง`);
    } else if (choice.kind === 'arrange') {
      tag = 'target';
      detail = `${src} · คลิกการ์ดตามลำดับ แล้วกดยืนยัน`;
    } else if (choice.kind === 'multiCard') {
      // เลือกหลายใบทีเดียว: คลิกการ์ด = เลือก/ยกเลิก · ครบแล้วยืนยัน ผลเกิดกับทุกใบพร้อมกัน
      tag = 'target';
      if (choice.budget) {
        // ฟง-นีด: เลือกกี่ตัวก็ได้ ค่ารวมไม่เกินงบ แล้วยืนยันทีเดียว
        const sum = picked.reduce((n, id) => n + (choice.budget!.values[id] ?? 0), 0);
        detail = `${src} · คลิกการ์ดที่เรืองแสงสีชมพูเพื่อเลือก/ยกเลิก · ${choice.budget.label} รวม ${sum.toLocaleString()}/${choice.budget.max.toLocaleString()}`;
        add('reset', 'ล้าง', () => useGame.getState().clearPicks(), 'secondary', picked.length === 0);
        add('ok', picked.length === 0 ? 'ไม่เลือก' : `ยืนยัน ${picked.length} ตัว`, () => choose({ cards: picked }), 'primary', sum > choice.budget.max);
      } else {
      detail = `${src} · คลิกการ์ดที่เรืองแสงสีชมพูเพื่อเลือก/ยกเลิก · เลือกแล้ว ${picked.length}/${choice.count}`;
      add('reset', 'ล้าง', () => useGame.getState().clearPicks(), 'secondary', picked.length === 0);
      add('ok', `ยืนยัน ${picked.length}/${choice.count}`, () => choose({ cards: picked }), 'primary', picked.length !== choice.count, `เลือกอีก ${choice.count - picked.length} ใบ`);
      }
    } else if (choice.kind === 'distribute') {
      // แบ่งคอร์ที่จะส่งออก: คลิกการ์ด = +1 เม็ด · ปุ่ม − บนการ์ด = ลด · ครบแล้วยืนยันทีเดียว
      tag = 'target';
      const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
      detail = `${src} · คลิกการ์ดที่เรืองแสงสีชมพู 1 ครั้ง = 1 เม็ด (กด − บนการ์ดเพื่อลด) · เลือกแล้ว ${sum}/${choice.total}`;
      add('reset', 'ล้าง', () => useGame.getState().allocClear(), 'secondary', sum === 0);
      add('ok', `ยืนยัน ${sum}/${choice.total}`, () => choose({ alloc }), 'primary', sum !== choice.total, `เลือกอีก ${choice.total - sum} เม็ด`);
    } else if (isInlineChoice(state) && choice.kind === 'card') {
      tag = 'target';
      detail = `${src} · คลิกการ์ดที่เรืองแสงสีชมพู`;
      if (choice.optional) add('skip', choice.skipLabel ?? 'ไม่เลือก', () => choose(null), 'secondary');
    } else if (choice.kind === 'card') {
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
    const lvSum = battle.blockers.reduce((n, id) => n + cardLevel(state, db, id), 0);
    title = battle.levelBlock
      ? battle.blockers.length > 0
        ? `ป้องกันเพิ่ม: Lv รวม ${lvSum}/${battle.levelBlock}`
        : `ถูกโจมตี! ต้องป้องกันด้วย Lv รวมตั้งแต่ ${battle.levelBlock}`
      : battle.blockers.length > 0
        ? 'ป้องกันตัวที่ 2 ด้วยสปิริตตัวไหน?'
        : 'ถูกโจมตี! จะป้องกันด้วยสปิริตตัวไหน?';
    detail = battle.levelBlock
      ? 'ใช้สปิริต/อัลติเมทกี่ตัวก็ได้ที่ Lv รวมถึงเกณฑ์ แล้วผู้โจมตีเลือกสู้ 1 ตัว · คลิกสปิริตที่มีกรอบสีฟ้า'
      : battle.consecutiveBlade
      ? '[Consecutive Blade] ต้องป้องกัน 2 ตัวถ้าทำได้ · คลิกสปิริตที่มีกรอบสีฟ้า'
      : battle.mustBlock
        ? '[True-Rage] ต้องป้องกันถ้าทำได้ · คลิกสปิริตที่มีกรอบสีฟ้า'
        : 'คลิกสปิริตที่มีกรอบสีฟ้าบนสนามเพื่อป้องกัน';
    // ไม่ป้องกัน = คลิกแผง Life ของฝ่ายป้องกัน (ไม่มีปุ่มแล้ว)
    if (!(blockForced(state, db) && candidates.length > 0) && !(battle.levelBlock && battle.blockers.length > 0)) {
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
  const panelKey = `${tag}|${typeof title === 'string' ? title : ''}|${source}|${actions.map((a) => a.key).join(',')}`;
  // วัดว่าข้อความถูกตัดไหม เฉพาะตอนข้อความ / ชุดปุ่ม / ความกว้างจอเปลี่ยน และวัดหลังจอวาดเสร็จ (setTimeout)
  // เดิมวัดใน useLayoutEffect ทุกครั้งที่วาดใหม่: อ่าน scrollWidth ทันทีหลังแก้ DOM = บังคับคำนวณ layout ทั้งหน้า → กระตุกระหว่างแอนิเมชัน
  // (textContent อ่านได้โดยไม่บังคับ layout · หลังวาดเสร็จ layout คำนวณไว้แล้ว อ่านได้แทบฟรี)
  const measuredKey = useRef('');
  useEffect(() => {
    const key = `${titleRef.current?.textContent ?? ''}${detailRef.current?.textContent ?? ''}${panelKey}${window.innerWidth}`;
    if (key === measuredKey.current) return;
    const t = setTimeout(() => {
      measuredKey.current = key;
      const cut = (el: HTMLElement | null) => !!el && el.scrollWidth > el.clientWidth + 1;
      setTruncated(cut(titleRef.current) || cut(detailRef.current));
    }, 0);
    return () => clearTimeout(t);
  });
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

  /** แถบ: ปุ่มรอง (เทา) อยู่ซ้ายป้ายเทิร์น · ปุ่มหลัก/คำแนะนำอยู่ขวาป้ายเทิร์น */
  const sideActions = actions.filter((a) => a.kind !== 'primary');
  const mainActions = actions.filter((a) => a.kind === 'primary');
  const renderBtn = (a: PromptAction, wide = false) =>
    a.disabled && a.hint ? (
      // รอให้ทำอะไรก่อน: บอกสิ่งที่ต้องทำ (กรอบประ สว่าง) แทนปุ่มทึบ
      <span
        key={a.key}
        title={`${a.label} · ${a.hint}`}
        className={`inline-flex items-center rounded-lg border-2 border-dashed border-yellow-300/80 bg-yellow-300/10 px-3 py-1.5 text-sm font-bold text-yellow-200 ${wide ? 'w-full' : 'max-w-full min-w-0 truncate'}`}
        style={{ animation: 'fx-hint-pulse 1.6s ease-in-out infinite' }}
      >
        {a.hint}
      </span>
    ) : (
      <button
        key={a.key}
        type="button"
        data-tutorial={`prompt-${a.key}`}
        title={a.label}
        className={`${BTN[a.kind]} ${wide ? 'w-full text-left whitespace-normal' : 'max-w-full min-w-0 truncate'}`}
        onClick={a.onClick}
        disabled={a.disabled}
      >
        {a.label}
      </button>
    );

  const fighter = (id: string) => <Fighter key={id} id={id} />;
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
            {/* คำถาม: ข้อความยาวจนถูกตัด = ทั้งกล่องเป็นปุ่มกาง/ซ่อน (กรอบครอบทั้งข้อความ + ลูกศรท้ายกล่อง) */}
            <div
              role={canExpand ? 'button' : undefined}
              tabIndex={canExpand ? 0 : undefined}
              className={`flex min-w-0 flex-1 items-center gap-2 ${
                canExpand ? `-my-0.5 cursor-pointer rounded-md py-0.5 pr-1 pl-2 ring-1 ring-white/25 transition hover:bg-white/10 ${panelOpen ? 'bg-white/5' : ''}` : ''
              }`}
              title={
                canExpand
                  ? panelOpen
                    ? 'กดเพื่อซ่อน (ดูกระดาน)'
                    : 'กดเพื่ออ่านทั้งหมด'
                  : [typeof title === 'string' ? title : '', typeof detail === 'string' ? detail : ''].filter(Boolean).join(' · ') || undefined
              }
              onClick={togglePanel}
              onKeyDown={canExpand ? (e) => (e.key === 'Enter' || e.key === ' ') && togglePanel() : undefined}
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span ref={titleRef} className="min-w-0 truncate text-sm font-black tracking-wide text-white [text-shadow:0_1px_0_#000,0_0_12px_rgba(56,189,248,0.35)]">
                  {title}
                </span>
                {detail && (
                  <span ref={detailRef} className={`min-w-0 flex-1 truncate text-xs ${highlight ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                    {detail}
                  </span>
                )}
              </span>
              {canExpand && (
                <span className={`shrink-0 rounded px-1.5 text-xs font-bold ${panelOpen ? 'text-slate-300' : 'text-white'}`}>
                  {panelOpen ? 'ซ่อน ' : actionsInPanel ? `ตัวเลือก ${actions.length} ` : ''}
                  {panelOpen === dropDown ? '▴' : '▾'}
                </span>
              )}
            </div>
            {/* ปุ่มรอง (ไม่ใช้ / ยกเลิก / ย้อนกลับ) ชิดป้ายเทิร์นด้านซ้าย */}
            {!actionsInPanel && sideActions.length > 0 && <div className="btn-row flex shrink-0 gap-1.5">{sideActions.map((a) => renderBtn(a))}</div>}
          </div>
          {/* ช่องของป้ายเทิร์น (ป้ายวางทับกึ่งกลาง): เส้นคั่นที่ขอบซ้าย/ขวาของช่อง ระยะเท่ากันทั้งสองข้าง */}
          {/* กว้าง 106 + px 6: ปุ่ม→เส้น = เส้น→ป้าย = 16px (ป้ายตาเรา 60px) */}
          <div className="flex w-[106px] shrink-0 items-center justify-between px-1.5">
            {!actionsInPanel && sideActions.length > 0 ? <BarDivider /> : <span />}
            {!actionsInPanel && mainActions.length > 0 ? <BarDivider /> : <span />}
          </div>
          {/* ปุ่มหลักชิดป้ายเทิร์นด้านขวา (สายตาอยู่กลางจอ) · Chain ของคู่แข่ง / ปุ่มจบสเต็ปอยู่ขวาสุด */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {!actionsInPanel && mainActions.length > 0 && <div className="btn-row flex min-w-0 gap-1.5">{mainActions.map((a) => renderBtn(a))}</div>}
            <span className="flex-1" />
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
          {actionsInPanel && <OptionList actions={actions} renderBtn={renderBtn} />}
        </div>
      )}
    </div>
  );
}

/**
 * ตัวเลือกในแผงกาง: ตัวเลือกที่ทำอะไรจริง (ทอง) อยู่บน · ตัวเลือกที่พูดถึงการ์ดในมือ = แผ่นมีภาพการ์ดเรียงเป็นตาราง
 * "ไม่ใช้ / ข้าม" (เทา) แยกไว้มุมขวาล่าง · ไม่มีปุ่มเต้น (เดิมปุ่มสุดท้ายเต้น = "ไม่ใช้" ดูเหมือนตัวเลือกที่แนะนำ)
 */
function OptionList({ actions, renderBtn }: { actions: PromptAction[]; renderBtn: (a: PromptAction, wide?: boolean) => React.ReactNode }) {
  const main = actions.filter((a) => a.kind === 'primary');
  const rest = actions.filter((a) => a.kind !== 'primary');
  const tiles = main.filter((a) => a.cardNo);
  const plain = main.filter((a) => !a.cardNo);
  return (
    <div className="mt-3 flex flex-col gap-2">
      {tiles.length > 0 && (
        <div className={`grid gap-2 ${tiles.length === 1 ? 'grid-cols-1' : tiles.length === 2 || tiles.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {tiles.map((a) => (
            <button
              key={a.key}
              type="button"
              data-tutorial={`prompt-${a.key}`}
              title={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              className="group relative flex items-center gap-2 rounded-lg border-2 border-yellow-300/70 bg-gradient-to-b from-yellow-300/15 to-amber-600/10 p-1.5 text-left transition hover:border-yellow-200 hover:from-yellow-300/30 disabled:opacity-40"
            >
              <div className="relative h-[4.2rem] w-12 shrink-0">
                <CardFace def={db.get(a.cardNo!)} size="xs" />
              </div>
              <span className="min-w-0 text-xs leading-snug font-bold text-yellow-50">{a.label.replace(/^Kagemusha:s*/, '')}</span>
              {(a.count ?? 1) > 1 && (
                <span className="absolute -top-2 -right-2 rounded-full bg-yellow-300 px-1.5 text-[11px] leading-5 font-black text-slate-900 shadow">×{a.count}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {plain.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {plain.map((a) => (
            <div key={a.key} className="relative">
              {renderBtn(a, true)}
              {(a.count ?? 1) > 1 && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-slate-900/80 px-1.5 text-[11px] font-black text-yellow-200">×{a.count}</span>}
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{rest.map((a) => renderBtn(a))}</div>}
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
  // ช่วงนั้นจบแล้ว (ผ่าน/ประกาศป้องกัน/มีแอนิเมชันเล่นต่อ): เก็บป้ายทันที ไม่ให้ค้างทับแอนิเมชันถัดไป
  const key = (c: string) => c.slice(0, c.lastIndexOf('|'));
  if (!cue || key(cue) !== key(shown)) return null;
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
      data-tutorial="phase-btn"
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
      data-pick-card={cardId}
      // เลือกไม่ได้ (เช่นดูการ์ดใน Trash): คลิก = ปักรายละเอียดการ์ดไว้
      onClick={() => (!disabled && onPick ? onPick() : useGame.setState({ pinned: cardId }))}
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
  if (!mine) {
    // อีกฝ่ายกำลังเลือกจากการ์ดที่แสดงจากเด็ค (ข้อมูลเปิดเผย): ให้เห็นค้างไว้จนกว่าจะเลือกเสร็จ
    if (blocking || !choice) return null;
    // การ์ดในมือที่เลือกอัญเชิญ (เลยา-ควาโทร): ไม่เปิดให้อีกฝ่ายเห็น
    const shown = choice.kind === 'card' ? choice.revealed : choice.kind === 'multiSummon' && choice.step.do !== 'summonFromHandFree' ? choice.revealed : undefined;
    if (!shown?.length) return null;
    return <RevealFan owner={choice.player} cardIds={shown} title={`${playerLabel(choice.player)} แสดงการ์ดจากเด็ค · กำลังเลือก…`} />;
  }
  if (!blocking && choice?.kind === 'order') return <OrderPanel />;
  if (!blocking && choice?.kind === 'multiSummon') return <MultiPickFan />;
  if (!blocking && choice?.kind === 'arrange') return <ArrangeFan key={choice.cardIds.join('|')} />;
  if (blocking || !choice || choice.kind !== 'card') return null;
  // ทิ้งการ์ดในมือคู่แข่งแบบสุ่ม: พัดการ์ดคว่ำหน้า (สับลำดับแล้ว) ให้เราเลือก 1 ใบ
  if (choice.blind) {
    const owner = state.cards[choice.candidates[0]!]!.owner;
    return (
      <RevealFan
        owner={owner}
        cardIds={choice.candidates}
        candidates={choice.candidates}
        onPick={(id) => choose(id)}
        faceDown
        title={`${choice.prompt} · มือของ${playerLabel(owner)}`}
      />
    );
  }
  if (isInlineChoice(state)) return null;
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
  // เมจิคไทป์ [เพลง] บนฟิลด์ (และในแทรช): เรียงเป็นพัดเหมือนกัน
  const songOwner = PLAYERS.find(
    (p) => choice.candidates.length > 0 && choice.candidates.every((id) => state.players[p].trashCards.includes(id) || (state.players[p].songs ?? []).includes(id)),
  );
  if (!trashOwner && songOwner) {
    return (
      <RevealFan
        owner={choice.player}
        cardIds={choice.candidates}
        candidates={choice.candidates}
        onPick={(id) => choose(id)}
        title={`${choice.prompt}${songOwner === choice.player ? '' : ` (ของ${playerLabel(songOwner)})`}`}
        onSkip={choice.optional ? () => choose(null) : undefined}
      />
    );
  }
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

/**
 * "นำกลับไปไว้บนสุด/ใต้สุดเด็คโดยเรียงลำดับได้": คลิกการ์ดตามลำดับ 1..N (คลิกซ้ำ = ถอดออก) แล้วกดยืนยันทีเดียว
 */
function ArrangeFan() {
  const state = useGame((s) => s.state);
  const choose = useGame((s) => s.choose);
  const [order, setOrder] = useState<string[]>([]);
  const choice = state.choice;
  if (choice?.kind !== 'arrange') return null;
  const n = choice.cardIds.length;
  const labels = Object.fromEntries(
    order.map((id, i) => [id, choice.where === 'top' ? (i === 0 ? '1 · บนสุด' : `${i + 1}`) : i === n - 1 ? `${i + 1} · ล่างสุด` : `${i + 1}`]),
  );
  const toggle = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <RevealFan
      owner={choice.player}
      cardIds={choice.cardIds}
      candidates={choice.cardIds}
      chosenIds={order}
      chosenLabels={labels}
      flatChosen
      onPick={toggle}
      title={`${choice.where === 'top' ? 'เรียงการ์ดกลับบนสุดเด็ค' : 'เรียงการ์ดไปใต้สุดเด็ค'}: คลิกตามลำดับ 1-${n} (${choice.where === 'top' ? '1 = บนสุด' : `${n} = ล่างสุด`}) · ${order.length}/${n}`}
      onConfirm={{ label: 'ยืนยัน', disabled: order.length !== n, run: () => choose({ order }) }}
    />
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
      title={
        choice.step.do === 'summonFromHandFree'
          ? `เลือกการ์ดในมือที่จะอัญเชิญพร้อมกัน (สูงสุด ${choice.max} ใบ)`
          : `${playerLabel(choice.player)} แสดงการ์ดจากเด็ค · ${choice.max === null ? 'เลือกอัญเชิญได้กี่ใบก็ได้' : `เลือกอัญเชิญได้สูงสุด ${choice.max} ใบ`} · ที่เหลือไว้ใต้สุดเด็ค`
      }
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
    if (cardId) min = summonMinCores(state, db, cardId);
  }
  if (!cardId) return null;
  // มุมขวาของสนามผู้เลือก (ตำแหน่งเดียวกับแผงลงการ์ดจากมือ): ไม่บังแถบกลาง และไม่โดนหน้าต่างรายละเอียดการ์ดมุมซ้ายบัง
  const style = panelStyle(c.player, 288, 150);
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
  // "Lv คอสต์ +N" จากเอฟเฟกต์คู่แข่ง (อาเมะโอชิโนะมิโคโตะ): ต้องวาง Core เพิ่มต่อเลเวล ไม่งั้นลงมาแล้วสูญสลาย
  const boost = summonLevelCostBoost(state, db, cardId);
  const needLv1 = minCores(def) + boost;
  const lv = levelOf(def, selected.length - boost);
  const bp = bpOf(def, selected.length - boost);
  // Core ที่ดึงจากการ์ดบนสนาม: การ์ดที่ Core เหลือไม่ถึง Lv1 จะสูญสลาย
  const depleting = state.players[owner].field.filter((id) => {
    const c = state.cards[id]!;
    const d = db.get(c.cardNo);
    if (!isSpiritLike(d) || !c.cores.some((x) => selected.includes(x))) return false;
    return levelOf(d, c.cores.filter((x) => !selected.includes(x)).length - summonLevelCostBoost(state, db, id)) === 0;
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
                  onClick={() => autoSelectCores(l.cores + boost)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-black ${lv === l.level ? 'bg-emerald-400 text-slate-950' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                  title={`วาง Core ${l.cores + boost} ดวงจาก Reserve`}
                >
                  Lv{l.level} · {l.cores + boost}
                </button>
              ))}
            </div>
            {boost > 0 && (
              <div className="font-bold text-amber-300">
                Lv คอสต์ +{boost} ({[...new Set(levelBoostSources(state, db, cardId).map((x) => cardName(state, x.cardId)))].join(', ')}): Lv1 ต้องวาง {needLv1} ดวง
              </div>
            )}
            <div>
              เลือก <b>{selected.length}</b> ดวง (ขั้นต่ำ {min})
              {lv > 0 ? (
                <b className="text-emerald-300">
                  {' '}
                  → Lv{lv}
                  {bp ? ` · BP ${bp.toLocaleString()}` : ''}
                </b>
              ) : (
                <b className="text-rose-300"> · ยังไม่ถึง Lv1{boost > 0 && selected.length >= min ? ' (จะสูญสลายทันที)' : ''}</b>
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

/**
 * การ์ดนอกมือ: แตะโซนนอกมือบนสนาม → กางเป็นพัดใหญ่กลางกระดาน
 *  - ของเรา: แตะใบที่ใช้ได้ = ทางเล่นทางเดียวเปิดแผงเลย / หลายทาง = เมนูใต้การ์ด · เป็นตัวเลือกของเอฟเฟกต์ = แตะเพื่อเลือก
 *  - ของคู่แข่ง / ใช้ไม่ได้ตอนนี้: ดูอย่างเดียว (ชี้ = แผงข้อมูลการ์ด)
 */
export function ShownFan() {
  const player = useGame((s) => s.shownFan);
  const state = useGame((s) => s.state);
  const busy = useGame((s) => isFxBlocking(s.fx) || !!s.play);
  const picked = useGame(pickedOf);
  const [menu, setMenu] = useState<string | null>(null);
  const ids = player ? (state.shownCards ?? []).filter((id) => state.players[player].hand.includes(id)) : [];
  const close = () => {
    setMenu(null);
    useGame.setState({ shownFan: null });
  };
  useEffect(() => {
    if (player && ids.length === 0) close();
  });
  if (!player || busy || ids.length === 0) return null;
  const choiceIds = ids.filter((id) => isChoiceCandidate(state, id) || isMultiCardCandidate(state, id));
  const opts = Object.fromEntries(ids.map((id) => [id, choiceIds.length ? [] : playOptions(state, id)]));
  const candidates = choiceIds.length ? choiceIds : ids.filter((id) => opts[id]!.length > 0);
  const menuRect = menu ? document.querySelector(`[data-reveal-card="${menu}"]`)?.getBoundingClientRect() : null;
  return (
    <>
      <RevealFan
        owner={player}
        cardIds={ids}
        candidates={candidates}
        chosenIds={state.choice?.kind === 'multiCard' ? picked : undefined}
        chosen={menu}
        flatChosen
        chosenLabel="เลือกวิธีใช้ ▾"
        onPick={(id) => {
          if (choiceIds.includes(id)) {
            useGame.getState().clickHandCard(id);
            if (state.choice?.kind !== 'multiCard') close();
            return;
          }
          const o = opts[id]!;
          if (o.length === 1) {
            close();
            o[0]!.run();
          } else setMenu(menu === id ? null : id);
        }}
        pickLabel={choiceIds.length ? 'คลิกเพื่อเลือก' : 'แตะเพื่อใช้'}
        title={`นอกมือ${controls(useGame.getState(), player) ? '' : `ของ${playerLabel(player)}`} ${ids.length} ใบ${candidates.length ? '' : ' · ตอนนี้ยังใช้ไม่ได้'}`}
        onSkip={close}
        skipLabel="ปิด"
      />
      {/* หลายทางเล่น: เมนูใต้การ์ดที่เลือก */}
      {menu && menuRect && (opts[menu]?.length ?? 0) > 1 &&
        createPortal(
          <div
            data-tutorial="hand-menu"
            className="fixed z-[66] flex w-44 -translate-x-1/2 flex-col gap-1 rounded-lg border border-yellow-300/60 bg-slate-900 p-1.5 shadow-xl"
            style={{ left: menuRect.left + menuRect.width / 2, top: menuRect.bottom + 18, animation: 'fx-fade-in 0.15s ease-out both' }}
          >
            {opts[menu]!.map((o) => (
              <button
                key={o.label}
                type="button"
                className="rounded bg-yellow-300/90 px-2 py-1 text-left text-xs font-bold text-slate-900 hover:bg-yellow-200"
                onClick={() => {
                  close();
                  o.run();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * อัญเชิญจาก Trash (ร็อคแฮนด์ / มุเมอิ ฯลฯ): แตะช่อง Trash ตอนมีใบที่อัญเชิญได้ → พัดการ์ดบนกระดานเฉพาะใบนั้น (ไม่ใช้ Modal)
 * แตะใบ = แผงอัญเชิญที่มุมสนาม · "ดูทั้งกอง" = หน้าต่าง Trash เดิม
 */
export function TrashSummonFan() {
  const player = useGame((s) => s.trashFan);
  const state = useGame((s) => s.state);
  const busy = useGame((s) => !!s.state.choice || isFxBlocking(s.fx) || !!s.play);
  const ids = player ? state.players[player].trashCards.filter((id) => !!trashSummonRule(state, db, player, id)) : [];
  const close = () => useGame.setState({ trashFan: null });
  useEffect(() => {
    // ใช้ได้หมด / หมดจังหวะ: ปิดเอง
    if (player && (ids.length === 0 || state.winner)) close();
  });
  if (!player || busy || ids.length === 0) return null;
  return (
    <RevealFan
      owner={player}
      cardIds={[...ids].reverse()}
      candidates={ids}
      onPick={(id) => {
        close();
        useGame.getState().openPlay(id, 'summon');
      }}
      pickLabel="แตะเพื่ออัญเชิญ"
      title={`อัญเชิญจาก Trash ได้ ${ids.length} ใบ`}
      onSkip={close}
      skipLabel="ปิด"
      onConfirm={{
        label: 'ดูทั้งกอง',
        disabled: false,
        run: () => {
          close();
          useGame.getState().openTrash(player);
        },
      }}
    />
  );
}

/** ดูการ์ดใน Trash */
export function TrashDialog() {
  const state = useGame((s) => s.state);
  const player = useGame((s) => s.trashView);
  /** 2VS2: ดูแทรชของคนที่สองของทีม (ช่องแทรชของเพื่อน / คู่แข่งคนที่ 2) */
  const partner = useGame((s) => s.trashViewPartner);
  const openTrash = useGame((s) => s.openTrash);
  const openPlay = useGame((s) => s.openPlay);
  const mine = useGame((s) => !!player && controls(s, player) && !s.trashViewPartner);
  const busy = useGame((s) => !!s.state.choice || isFxBlocking(s.fx));
  if (!player) return null;
  const cards = (partner ? (state.players[player].partner ?? state.players[player]) : state.players[player]).trashCards;
  // อัญเชิญจากแทรชได้ (ร็อคแฮนด์ / มุเมอิ)
  const summonable = (id: string) => mine && !busy && !state.winner && !!trashSummonRule(state, db, player, id);
  return (
    <Modal title={`Trash ของ${partner ? 'คนที่สองของทีม' : playerLabel(player)}`} subtitle={`${cards.length} ใบ · ชี้การ์ดเพื่อดูรายละเอียด`} onClose={() => openTrash(null)} wide>
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

/** ผู้ต่อสู้ในแถบ BATTLE: BP ตามจังหวะแอนิเมชัน (ค่าที่หน่วงไว้แบบเดียวกับป้าย BP บนการ์ด) */
function Fighter({ id }: { id: string }) {
  const state = useGame((s) => s.state);
  const held = useHeld(id);
  const bp = held?.bp ?? currentBp(state, db, id);
  return (
    <span title={cardName(state, id)} className="flex min-w-0 items-baseline gap-1 rounded bg-black/40 px-2 py-0.5">
      <span className="min-w-0 truncate">{cardName(state, id)}</span>
      <b className="shrink-0 text-yellow-300">{bp.toLocaleString()}</b>
    </span>
  );
}
